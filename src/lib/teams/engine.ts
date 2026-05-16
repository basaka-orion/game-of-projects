/**
 * Team Engine — 团队会话执行引擎
 *
 * 根据团队类型执行不同的协作模式：
 * - permanent: 顺序执行，每个 Agent 引用前序输出
 * - agency: DAG 拓扑排序执行
 * - brainstorm: 轮次讨论 + 综合
 */
import { Team, TeamSession, TeamMessage, TeamTask, TeamAgent } from './types'
import { getTeamSession, saveTeamSession, createTeamSession } from './store'
import { getAgentById } from '../agents/registry'
import { chatCompletion, getLLMConfig, resolveAgentConfig, type LLMConfig } from '../ai/provider'
import { generateId } from '../db/schema'
import { retrieveAndInject } from '../chat/knowledge-middleware'
import { loadCognitiveProfile, renderCognitivePrompt } from '../boss/cognitive-profile'

export interface TeamSessionRunOptions {
  uiStyleContext?: unknown
  debatePhases?: Team['config']['debatePhases']
  [key: string]: unknown
}

/** 获取 Agent 的 LLM 配置 — 优先使用角色专属配置，无则回退全局 */
function getAgentLLMConfig(agentId?: string): LLMConfig {
  if (agentId) {
    try {
      return resolveAgentConfig(agentId)
    } catch { /* fallback to global */ }
  }
  return getLLMConfig()
}

/** 运行团队会话 */
export async function runTeamSession(
  team: Team,
  topic: string,
  onProgress?: (msg: TeamMessage) => void,
  _options?: TeamSessionRunOptions,
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
        await runBrainstormSession(team, session, topic, llmConfig, onProgress, _options)
        break
    }

    session.status = 'completed'
  } catch (err) {
    session.status = 'failed'
    session.summary = `会话失败: ${(err as Error).message}`
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
  onProgress?: (msg: TeamMessage) => void
): Promise<void> {
  let priorContext = ''
  const cognitivePrompt = renderCognitivePrompt(loadCognitiveProfile())

  for (const agentConfig of team.agents) {
    const agent = await getAgentById(agentConfig.agentId)
    const agentLLM = getAgentLLMConfig(agentConfig.agentId)
    const agentPrompt = agentConfig.systemPromptOverride
      || (agent ? `你是 ${agent.name}。${agent.systemPromptSuffix || ''}` : `你是 ${agentConfig.role}。`)

    // 知识库注入
    let knowledgeCtx = ''
    try {
      const { promptFragment } = await retrieveAndInject({
        userMessage: topic,
        agentId: agentConfig.agentId,
        depth: 'quick',
      })
      knowledgeCtx = promptFragment
    } catch { /* non-critical */ }

    const systemPrompt = [agentPrompt, cognitivePrompt, knowledgeCtx].filter(Boolean).join('\n\n')

    const userPrompt = priorContext
      ? `## 讨论主题\n${topic}\n\n## 前序分析\n${priorContext}\n\n请从你的专业角度给出分析。`
      : `## 讨论主题\n${topic}\n\n请从你的专业角度给出分析。`

    const result = await chatCompletion(agentLLM, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], agent?.temperature || 0.7, 2048)

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
  onProgress?: (msg: TeamMessage) => void
): Promise<void> {
  const tasks = team.config.tasks || []
  const results: Record<string, string> = {}
  const cognitivePrompt = renderCognitivePrompt(loadCognitiveProfile())

  // 拓扑排序
  const sorted = topologicalSort(tasks)

  for (const task of sorted) {
    const agent = await getAgentById(task.assignedAgent)
    const agentLLM = getAgentLLMConfig(task.assignedAgent)
    const agentPrompt = agent
      ? `你是 ${agent.name}。${agent.systemPromptSuffix || ''}`
      : `你是 ${task.assignedAgent}。`

    // 知识库注入
    let knowledgeCtx = ''
    try {
      const { promptFragment } = await retrieveAndInject({
        userMessage: `${topic} ${task.description}`,
        agentId: task.assignedAgent,
        depth: 'quick',
      })
      knowledgeCtx = promptFragment
    } catch { /* non-critical */ }

    const systemPrompt = [agentPrompt, cognitivePrompt, knowledgeCtx].filter(Boolean).join('\n\n')

    // 构建依赖上下文
    const depsContext = task.dependsOn
      .map(depId => {
        const depTask = tasks.find(t => t.id === depId)
        return depId ? `### ${depTask?.description || depId}\n${results[depId] || '无结果'}` : ''
      })
      .filter(Boolean)
      .join('\n\n')

    const userPrompt = depsContext
      ? `## 任务\n${task.description}\n\n## 输入\n${topic}\n\n## 前置分析\n${depsContext}\n\n请完成你的任务。`
      : `## 任务\n${task.description}\n\n## 输入\n${topic}\n\n请完成你的任务。`

    const result = await chatCompletion(agentLLM, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], agent?.temperature || 0.5, 2048)

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
  options?: TeamSessionRunOptions,
): Promise<void> {
  const debatePhases = options?.debatePhases || team.config.debatePhases
  if (debatePhases?.length) {
    await runPhasedBrainstormSession(team, session, topic, debatePhases, onProgress)
    return
  }

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
      } catch { /* non-critical */ }

      const systemPrompt = [agentPrompt, cognitivePrompt, knowledgeCtx].filter(Boolean).join('\n\n')

      const userPrompt = `${roundContext}\n\n这是第 ${round}/${maxRounds} 轮。请给出你的观点和想法。`

      const result = await chatCompletion(agentLLM, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], team.config.temperature || 0.9, 1024)

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
  const summaryPrompt = synthesizer
    ? `你是 ${synthesizer.name}。综合所有头脑风暴发言。`
    : '综合所有头脑风暴发言。'

  const summary = await chatCompletion(getLLMConfig(), [
    { role: 'system', content: summaryPrompt },
    { role: 'user', content: `${roundContext}\n\n请综合以上所有观点，给出最终结论和建议。` },
  ], 0.5, 2048)

  session.summary = summary
}

function pushTeamMessage(session: TeamSession, msg: TeamMessage, onProgress?: (msg: TeamMessage) => void): void {
  session.messages.push(msg)
  onProgress?.(msg)
}

function agentPersonaId(agentConfig: TeamAgent, agent?: Awaited<ReturnType<typeof getAgentById>>): string {
  const platformPersonaId = typeof agent?.platformConfig?.personaId === 'string' ? agent.platformConfig.personaId : ''
  return agentConfig.personaId || platformPersonaId || agentConfig.agentId
}

function compactTeamText(value: string, max = 420): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function buildPhaseUserPrompt(input: {
  topic: string
  roundContext: string
  phase: NonNullable<Team['config']['debatePhases']>[number]
  phaseIndex: number
  phaseCount: number
  agentName: string
  agentRole: string
  targetName: string
}): string {
  return [
    input.roundContext,
    '',
    `## 当前阶段 ${input.phaseIndex + 1}/${input.phaseCount}：${input.phase.label}`,
    `阶段任务：${input.phase.instruction}`,
    `共识影响：${input.phase.consensusImpact}`,
    input.phase.requiresChallenge
      ? `你必须正面质询或修正 ${input.targetName} 的潜在盲点，给出反对意见、边界和可执行裁决。`
      : '你先给出独立方法论和可执行判断，不要急着迎合共识。',
    '',
    `## 你的席位`,
    `${input.agentName}｜${input.agentRole}`,
    '',
    '## 输出格式',
    '必须用以下小节，便于剧场抽取和回看：',
    '【方法论提取】你从自身方法论中提炼出的原则。',
    '【核心判断】本阶段对任务的主张。',
    '【冲突/补充】你反对谁、修正谁，或者补了什么关键缺口。',
    '【证据/来源需求】哪些事实、用户验证、UI 截图、工程测试还缺。',
    '【PRD条款】应该写进最终 PRD 的具体条款。',
    '',
    '要求：具体、可落地、能被产品/设计/前端/后端/测试执行；不要输出空泛赞美。',
  ].join('\n')
}

async function runPhasedBrainstormSession(
  team: Team,
  session: TeamSession,
  topic: string,
  debatePhases: NonNullable<Team['config']['debatePhases']>,
  onProgress?: (msg: TeamMessage) => void,
): Promise<void> {
  let roundContext = `## 头脑风暴主题\n${topic}`
  const cognitivePrompt = renderCognitivePrompt(loadCognitiveProfile())
  const agentCache = new Map<string, Awaited<ReturnType<typeof getAgentById>>>()

  for (let phaseIndex = 0; phaseIndex < debatePhases.length; phaseIndex += 1) {
    const phase = debatePhases[phaseIndex]
    pushTeamMessage(session, {
      id: generateId(),
      agentId: 'team-engine',
      agentName: '团队会场',
      role: 'system',
      content: `进入「${phase.label}」阶段：${phase.instruction}`,
      timestamp: Date.now(),
      round: phaseIndex + 1,
      kind: 'progress',
      metadata: {
        phaseId: phase.id,
        phaseLabel: phase.label,
        consensusImpact: phase.consensusImpact,
      },
    }, onProgress)

    for (let agentIndex = 0; agentIndex < team.agents.length; agentIndex += 1) {
      const agentConfig = team.agents[agentIndex]
      let agent = agentCache.get(agentConfig.agentId)
      if (!agentCache.has(agentConfig.agentId)) {
        agent = await getAgentById(agentConfig.agentId)
        agentCache.set(agentConfig.agentId, agent)
      }
      const targetConfig = team.agents[(agentIndex + 1) % team.agents.length] || agentConfig
      let targetAgent = agentCache.get(targetConfig.agentId)
      if (!agentCache.has(targetConfig.agentId)) {
        targetAgent = await getAgentById(targetConfig.agentId)
        agentCache.set(targetConfig.agentId, targetAgent)
      }
      const personaId = agentPersonaId(agentConfig, agent)
      const targetPersonaId = agentPersonaId(targetConfig, targetAgent)
      const agentName = agent?.name || agentConfig.personaName || agentConfig.role
      const targetName = targetAgent?.name || targetConfig.personaName || targetConfig.role

      pushTeamMessage(session, {
        id: generateId(),
        agentId: agentConfig.agentId,
        agentName: '团队会场',
        role: 'system',
        content: `${agentName} 正在处理：${phase.label}。${phase.requiresChallenge ? `本幕将质询 ${targetName}。` : '本幕先形成独立主张。'}`,
        timestamp: Date.now(),
        round: phaseIndex + 1,
        kind: 'progress',
        metadata: {
          phaseId: phase.id,
          phaseLabel: phase.label,
          agentId: agentConfig.agentId,
          agentName,
          personaId,
          challengedPersonaIds: phase.requiresChallenge ? [targetPersonaId] : [],
        },
      }, onProgress)

      let knowledgeCtx = ''
      try {
        const { promptFragment } = await retrieveAndInject({
          userMessage: `${topic}\n${phase.label}\n${phase.instruction}`,
          agentId: agentConfig.agentId,
          depth: 'quick',
        })
        knowledgeCtx = promptFragment
      } catch { /* non-critical */ }

      const agentPrompt = agentConfig.systemPromptOverride
        || (agent ? `你是 ${agent.name}。在头脑风暴中大胆发言。${agent.systemPromptSuffix || ''}` : `你是 ${agentConfig.role}。在头脑风暴中大胆发言。`)
      const systemPrompt = [agentPrompt, cognitivePrompt, knowledgeCtx].filter(Boolean).join('\n\n')
      const userPrompt = buildPhaseUserPrompt({
        topic,
        roundContext,
        phase,
        phaseIndex,
        phaseCount: debatePhases.length,
        agentName,
        agentRole: agentConfig.role,
        targetName,
      })
      const result = await chatCompletion(getAgentLLMConfig(agentConfig.agentId), [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], team.config.temperature || agent?.temperature || 0.78, 1800)

      const msg: TeamMessage = {
        id: generateId(),
        agentId: agentConfig.agentId,
        agentName,
        role: 'assistant',
        content: result,
        timestamp: Date.now(),
        round: phaseIndex + 1,
        kind: 'brief',
        metadata: {
          phaseId: phase.id,
          phaseLabel: phase.label,
          personaId,
          challengedPersonaIds: phase.requiresChallenge ? [targetPersonaId] : [],
          targetAgentId: targetConfig.agentId,
          targetAgentName: targetName,
        },
      }
      pushTeamMessage(session, msg, onProgress)
      roundContext += `\n\n### ${agentName}｜${phase.label}\n${compactTeamText(result, 1200)}`
    }
  }

  const summary = await chatCompletion(getLLMConfig(), [
    { role: 'system', content: '你是小白智囊团主持裁决。把六阶段博弈收束为可执行的大师级 PRD，不要写会议纪要。' },
    {
      role: 'user',
      content: `${roundContext}\n\n请输出最终大师级 PRD，必须覆盖：产品定位、用户旅程、P0/P1/P2、不做清单、UI 像素级规格、前端、后端、API、数据模型、AI/模型、安全、部署、测试、验收、共识形成追溯。`,
    },
  ], 0.48, 4096)

  const artifact: TeamMessage = {
    id: generateId(),
    agentId: 'team-engine',
    agentName: '团队会场',
    role: 'assistant',
    content: summary,
    timestamp: Date.now(),
    round: debatePhases.length,
    kind: 'artifact',
    artifactType: 'prd',
    metadata: {
      phaseId: debatePhases[debatePhases.length - 1]?.id,
      phaseLabel: debatePhases[debatePhases.length - 1]?.label,
    },
  }
  pushTeamMessage(session, artifact, onProgress)
  session.summary = summary
}

/** 拓扑排序 */
function topologicalSort(tasks: TeamTask[]): TeamTask[] {
  const sorted: TeamTask[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const taskMap = new Map(tasks.map(t => [t.id, t]))

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

  tasks.forEach(t => visit(t.id))
  return sorted
}
