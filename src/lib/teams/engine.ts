/**
 * Team Engine — 团队会话执行引擎
 *
 * 根据团队类型执行不同的协作模式：
 * - permanent: 顺序执行，每个 Agent 引用前序输出
 * - agency: DAG 拓扑排序执行
 * - brainstorm: 轮次讨论 + 综合
 */
import { Team, TeamSession, TeamMessage, TeamTask } from './types'
import { getTeamSession, saveTeamSession, createTeamSession } from './store'
import { getAgentById } from '../agents/registry'
import { chatCompletion, LLMConfig, getDefaultConfig, resolveAgentConfig } from '../ai/provider'
import { getSetting } from '../db/store'
import { generateId } from '../db/schema'
import { retrieveAndInject } from '../chat/knowledge-middleware'
import { loadCognitiveProfile, renderCognitivePrompt } from '../boss/cognitive-profile'
import { recordAgentExecutionReceipt } from '../agents/execution-audit'
import type { ExecutionEvidenceRef } from '../agents/execution-receipt'

/** 获取全局 LLM 配置 */
function getLLMConfig(): LLMConfig {
  const provider = getSetting('llm_provider', 'deepseek')
  const defaults = getDefaultConfig(provider)
  return {
    provider: provider as LLMConfig['provider'],
    apiKey: getSetting('llm_api_key', ''),
    baseUrl: getSetting('llm_base_url', defaults.baseUrl),
    model: getSetting('llm_model', defaults.model),
  }
}

/** 获取 Agent 的 LLM 配置 — 优先使用角色专属配置，无则回退全局 */
function getAgentLLMConfig(agentId?: string): LLMConfig {
  if (agentId) {
    try {
      return resolveAgentConfig(agentId)
    } catch {
      /* fallback to global */
    }
  }
  return getLLMConfig()
}

function buildTeamEvidenceRefs(knowledgeCtx: string, cognitivePrompt: string, team: Team): ExecutionEvidenceRef[] {
  const refs: ExecutionEvidenceRef[] = []
  if (team.projectId) refs.push({ kind: 'project', id: team.projectId, title: team.name })
  if (knowledgeCtx) refs.push({ kind: 'knowledge', title: 'Knowledge middleware quick context' })
  if (cognitivePrompt) refs.push({ kind: 'memory', title: 'Boss cognitive profile' })
  return refs
}

function recordTeamAgentExecution(params: {
  team: Team
  session: TeamSession
  agentId: string
  agentName: string
  input: string
  output: string
  status: 'completed' | 'failed'
  evidenceRefs: ExecutionEvidenceRef[]
  durationMs: number
  round?: number
}) {
  recordAgentExecutionReceipt({
    agentId: params.agentId,
    subject: `${params.team.name}｜${params.agentName}`,
    input: params.input,
    output: params.output,
    status: params.status,
    tools: [{ id: 'team-engine', label: 'Team Engine', risk: 'low', status: params.status }],
    evidenceRefs: params.evidenceRefs,
    projectIds: params.team.projectId ? [params.team.projectId] : [],
    source: { kind: 'agent', sourceId: params.session.id, title: params.team.name },
    durationMs: params.durationMs,
    entities: [
      params.team.id,
      params.session.id,
      params.team.teamType,
      params.round ? `round-${params.round}` : '',
    ].filter(Boolean),
  }).catch(() => {})
}

/** 运行团队会话 */
export async function runTeamSession(
  team: Team,
  topic: string,
  onProgress?: (msg: TeamMessage) => void,
): Promise<TeamSession> {
  const sessionId = await createTeamSession(team.id, topic)
  const session = await getTeamSession(sessionId)
  if (!session) throw new Error('Failed to create team session')

  const llmConfig = getLLMConfig()

  try {
    switch (team.teamType) {
      case 'permanent':
        await runPermanentSession(team, session, topic, llmConfig, onProgress)
        break
      case 'agency':
        await runAgencySession(team, session, topic, llmConfig, onProgress)
        break
      case 'brainstorm':
        await runBrainstormSession(team, session, topic, llmConfig, onProgress)
        break
    }

    session.status = 'completed'
  } catch (err) {
    session.status = 'failed'
    session.summary = `会话失败: ${(err as Error).message}`
    recordAgentExecutionReceipt({
      agentId: 'team-engine',
      subject: `${team.name}｜团队会话失败`,
      input: topic,
      output: session.summary,
      status: 'failed',
      tools: [{ id: 'team-engine', label: 'Team Engine', risk: 'low', status: 'failed' }],
      projectIds: team.projectId ? [team.projectId] : [],
      source: { kind: 'agent', sourceId: session.id, title: team.name },
      entities: [team.id, session.id, team.teamType],
    }).catch(() => {})
  }

  await saveTeamSession(session)
  return session
}

/** 永久团队：顺序执行（每个 Agent 使用各自 LLM 配置） */
async function runPermanentSession(
  team: Team,
  session: TeamSession,
  topic: string,
  _llmConfig: LLMConfig,
  onProgress?: (msg: TeamMessage) => void,
): Promise<void> {
  let priorContext = ''
  const cognitivePrompt = renderCognitivePrompt(loadCognitiveProfile())

  for (const agentConfig of team.agents) {
    const agent = await getAgentById(agentConfig.agentId)
    const agentLLM = getAgentLLMConfig(agentConfig.agentId)
    const agentPrompt =
      agentConfig.systemPromptOverride ||
      (agent ? `你是 ${agent.name}。${agent.systemPromptSuffix || ''}` : `你是 ${agentConfig.role}。`)

    // 知识库注入
    let knowledgeCtx = ''
    try {
      const { promptFragment } = await retrieveAndInject({
        userMessage: topic,
        agentId: agentConfig.agentId,
        depth: 'quick',
      })
      knowledgeCtx = promptFragment
    } catch {
      /* non-critical */
    }

    const systemPrompt = [agentPrompt, cognitivePrompt, knowledgeCtx].filter(Boolean).join('\n\n')

    const userPrompt = priorContext
      ? `## 讨论主题\n${topic}\n\n## 前序分析\n${priorContext}\n\n请从你的专业角度给出分析。`
      : `## 讨论主题\n${topic}\n\n请从你的专业角度给出分析。`

    const startedAt = Date.now()
    const result = await chatCompletion(
      agentLLM,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      agent?.temperature || 0.7,
      2048,
    )
    recordTeamAgentExecution({
      team,
      session,
      agentId: agentConfig.agentId,
      agentName: agent?.name || agentConfig.role,
      input: userPrompt,
      output: result,
      status: 'completed',
      evidenceRefs: buildTeamEvidenceRefs(knowledgeCtx, cognitivePrompt, team),
      durationMs: Date.now() - startedAt,
    })

    const msg: TeamMessage = {
      id: generateId(),
      agentId: agentConfig.agentId,
      agentName: agent?.name || agentConfig.role,
      role: 'assistant',
      content: result,
      timestamp: Date.now(),
    }

    session.messages.push(msg)
    onProgress?.(msg)

    priorContext += `\n\n### ${agent?.name || agentConfig.role}\n${result}`
  }

  session.summary = priorContext
}

/** Agency 团队：DAG 拓扑排序执行（每个 Agent 使用各自 LLM 配置） */
async function runAgencySession(
  team: Team,
  session: TeamSession,
  topic: string,
  _llmConfig: LLMConfig,
  onProgress?: (msg: TeamMessage) => void,
): Promise<void> {
  const tasks = team.config.tasks || []
  const results: Record<string, string> = {}
  const cognitivePrompt = renderCognitivePrompt(loadCognitiveProfile())

  // 拓扑排序
  const sorted = topologicalSort(tasks)

  for (const task of sorted) {
    const agent = await getAgentById(task.assignedAgent)
    const agentLLM = getAgentLLMConfig(task.assignedAgent)
    const agentPrompt = agent ? `你是 ${agent.name}。${agent.systemPromptSuffix || ''}` : `你是 ${task.assignedAgent}。`

    // 知识库注入
    let knowledgeCtx = ''
    try {
      const { promptFragment } = await retrieveAndInject({
        userMessage: `${topic} ${task.description}`,
        agentId: task.assignedAgent,
        depth: 'quick',
      })
      knowledgeCtx = promptFragment
    } catch {
      /* non-critical */
    }

    const systemPrompt = [agentPrompt, cognitivePrompt, knowledgeCtx].filter(Boolean).join('\n\n')

    // 构建依赖上下文
    const depsContext = task.dependsOn
      .map((depId) => {
        const depTask = tasks.find((t) => t.id === depId)
        return depId ? `### ${depTask?.description || depId}\n${results[depId] || '无结果'}` : ''
      })
      .filter(Boolean)
      .join('\n\n')

    const userPrompt = depsContext
      ? `## 任务\n${task.description}\n\n## 输入\n${topic}\n\n## 前置分析\n${depsContext}\n\n请完成你的任务。`
      : `## 任务\n${task.description}\n\n## 输入\n${topic}\n\n请完成你的任务。`

    const startedAt = Date.now()
    const result = await chatCompletion(
      agentLLM,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      agent?.temperature || 0.5,
      2048,
    )
    recordTeamAgentExecution({
      team,
      session,
      agentId: task.assignedAgent,
      agentName: agent?.name || task.assignedAgent,
      input: userPrompt,
      output: result,
      status: 'completed',
      evidenceRefs: buildTeamEvidenceRefs(knowledgeCtx, cognitivePrompt, team),
      durationMs: Date.now() - startedAt,
    })

    results[task.outputKey] = result

    const msg: TeamMessage = {
      id: generateId(),
      agentId: task.assignedAgent,
      agentName: agent?.name || task.assignedAgent,
      role: 'assistant',
      content: result,
      timestamp: Date.now(),
    }
    session.messages.push(msg)
    onProgress?.(msg)
  }

  // 综合所有结果
  const summaryParts = Object.entries(results)
    .map(([key, value]) => `### ${key}\n${value}`)
    .join('\n\n')
  session.summary = summaryParts
}

/** Brainstorm 团队：轮次讨论（每个 Agent 使用各自 LLM 配置） */
async function runBrainstormSession(
  team: Team,
  session: TeamSession,
  topic: string,
  _llmConfig: LLMConfig,
  onProgress?: (msg: TeamMessage) => void,
): Promise<void> {
  const maxRounds = team.config.maxRounds || 3
  let roundContext = `## 头脑风暴主题\n${topic}`
  const cognitivePrompt = renderCognitivePrompt(loadCognitiveProfile())

  for (let round = 1; round <= maxRounds; round++) {
    for (const agentConfig of team.agents) {
      const agent = await getAgentById(agentConfig.agentId)
      const agentLLM = getAgentLLMConfig(agentConfig.agentId)
      const agentPrompt = agent
        ? `你是 ${agent.name}。在头脑风暴中大胆发言。${agent.systemPromptSuffix || ''}`
        : `你是 ${agentConfig.role}。在头脑风暴中大胆发言。`

      // 知识库注入
      let knowledgeCtx = ''
      try {
        const { promptFragment } = await retrieveAndInject({
          userMessage: topic,
          agentId: agentConfig.agentId,
          depth: 'quick',
        })
        knowledgeCtx = promptFragment
      } catch {
        /* non-critical */
      }

      const systemPrompt = [agentPrompt, cognitivePrompt, knowledgeCtx].filter(Boolean).join('\n\n')

      const userPrompt = `${roundContext}\n\n这是第 ${round}/${maxRounds} 轮。请给出你的观点和想法。`

      const startedAt = Date.now()
      const result = await chatCompletion(
        agentLLM,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        team.config.temperature || 0.9,
        1024,
      )
      recordTeamAgentExecution({
        team,
        session,
        agentId: agentConfig.agentId,
        agentName: agent?.name || agentConfig.role,
        input: userPrompt,
        output: result,
        status: 'completed',
        evidenceRefs: buildTeamEvidenceRefs(knowledgeCtx, cognitivePrompt, team),
        durationMs: Date.now() - startedAt,
        round,
      })

      const msg: TeamMessage = {
        id: generateId(),
        agentId: agentConfig.agentId,
        agentName: agent?.name || agentConfig.role,
        role: 'assistant',
        content: result,
        timestamp: Date.now(),
        round,
      }
      session.messages.push(msg)
      onProgress?.(msg)

      roundContext += `\n\n### ${agent?.name || agentConfig.role} (Round ${round})\n${result}`
    }
  }

  // 最终综合
  const synthesizer = await getAgentById('general')
  const summaryPrompt = synthesizer ? `你是 ${synthesizer.name}。综合所有头脑风暴发言。` : '综合所有头脑风暴发言。'

  const summary = await chatCompletion(
    getLLMConfig(),
    [
      { role: 'system', content: summaryPrompt },
      { role: 'user', content: `${roundContext}\n\n请综合以上所有观点，给出最终结论和建议。` },
    ],
    0.5,
    2048,
  )

  session.summary = summary
}

/** 拓扑排序 */
function topologicalSort(tasks: TeamTask[]): TeamTask[] {
  const sorted: TeamTask[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const taskMap = new Map(tasks.map((t) => [t.id, t]))

  function visit(id: string) {
    if (visited.has(id)) return
    if (visiting.has(id)) return // 跳过循环
    visiting.add(id)
    const task = taskMap.get(id)
    if (task) {
      for (const dep of task.dependsOn) visit(dep)
      sorted.push(task)
    }
    visiting.delete(id)
    visited.add(id)
  }

  tasks.forEach((t) => visit(t.id))
  return sorted
}
