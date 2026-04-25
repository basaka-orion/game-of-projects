/**
 * Tool Loop — ReAct 推理-行动循环
 *
 * 让 LLM 在聊天中调用工具/技能：
 * 1. 优先解析 JSON 格式工具调用 `{"tool_call":{"id":"xxx","args":"..."}}`
 * 2. Fallback 到正则匹配 `tool_call:skill_id(args)`
 * 3. 解析并执行对应的技能
 * 4. 将工具结果反馈给 LLM 继续生成
 * 5. 每轮注入 Knowledge Graph 相关三元组和 Swarm 突破状态
 * 6. 最多 5 轮工具调用
 */
import { LLMConfig, chatCompletion } from '../ai/provider'
import { executeSkill, SkillInput, SkillOutput } from '../skills/executor'
import { loadSkills } from '../skills/registry'
import { queryEntity, renderGraphPrompt, type KnowledgeTriple } from '../memory/knowledge-graph'
import { getLatestSwarmState, renderSwarmPrompt } from '../synapse/swarm'
import { collectMCPSkills, executeMCPSkill, isMCPSkill, buildMCPToolPrompt } from '../mcp/bridge'
import { recordAgentExecutionReceipt } from '../agents/execution-audit'
import type { ExecutionToolRef } from '../agents/execution-receipt'

const MAX_TOOL_ROUNDS = 5

/** 工具调用模式匹配（fallback） */
const TOOL_CALL_REGEX = /`?tool_call:(\w+(?:-\w+)*)\((.*?)\)`?/gs

/** JSON 格式工具调用匹配 */
const TOOL_CALL_JSON_REGEX = /\{"tool_call"\s*:\s*\{"id"\s*:\s*"([^"]+)"\s*,\s*"args"\s*:\s*"([^"]*)"\s*\}\}/g

export interface ToolLoopResult {
  /** 最终回复文本 */
  finalText: string
  /** 执行过的工具调用 */
  toolCalls: Array<{
    skillId: string
    args: string
    result: SkillOutput
  }>
  /** 总轮次 */
  rounds: number
}

function toolLoopRef(skillId: string, success: boolean): ExecutionToolRef {
  return {
    id: skillId,
    label: skillId,
    risk: isMCPSkill(skillId) ? 'medium' : 'low',
    status: success ? 'completed' : 'failed',
  }
}

/**
 * 执行 ReAct 工具循环
 *
 * @param llmConfig - LLM 配置
 * @param messages - 对话消息（含 system prompt）
 * @param enabledSkillIds - 当前 agent 启用的技能 ID 列表
 * @param context - 可选的上下文关键词（用于内核状态注入）
 * @returns 最终回复和工具调用记录
 */
export async function runToolLoop(
  llmConfig: LLMConfig,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  enabledSkillIds: string[] = [],
  context?: string,
): Promise<ToolLoopResult> {
  const toolCalls: ToolLoopResult['toolCalls'] = []
  let currentMessages = [...messages]
  let round = 0

  // 初始注入：内核状态
  const kernelContext = await buildKernelContext(context || '')
  if (kernelContext) {
    const lastSystem = currentMessages.findIndex((m) => m.role === 'system')
    if (lastSystem >= 0) {
      currentMessages[lastSystem] = {
        ...currentMessages[lastSystem],
        content: currentMessages[lastSystem].content + '\n\n' + kernelContext,
      }
    }
  }

  while (round < MAX_TOOL_ROUNDS) {
    round++

    // 调用 LLM
    const response = await chatCompletion(llmConfig, currentMessages, 0.7, 4096)

    // 优先检测 JSON 格式工具调用
    const jsonMatches = [...response.matchAll(TOOL_CALL_JSON_REGEX)]
    // Fallback 到正则匹配
    const regexMatches = jsonMatches.length > 0 ? [] : [...response.matchAll(TOOL_CALL_REGEX)]
    const matches =
      jsonMatches.length > 0
        ? jsonMatches.map((m) => ({ fullMatch: m[0], skillId: m[1], args: m[2] }))
        : regexMatches.map((m) => ({ fullMatch: m[0], skillId: m[1], args: m[2] }))

    if (matches.length === 0) {
      // 没有工具调用，返回最终回复
      return { finalText: response, toolCalls, rounds: round }
    }

    // 执行每个工具调用
    let augmentedResponse = response
    for (const match of matches) {
      const skillId = match.skillId
      const args = match.args

      // 只执行启用的技能（MCP 技能始终允许）
      if (!isMCPSkill(skillId) && enabledSkillIds.length > 0 && !enabledSkillIds.includes(skillId)) {
        continue
      }

      // MCP 桥接技能走独立执行路径
      let result: SkillOutput
      if (isMCPSkill(skillId)) {
        const mcpResult = await executeMCPSkill(skillId, args)
        result = {
          success: !mcpResult.isError,
          result: mcpResult.content,
          mcpServerUsed: skillId.split(':')[1],
        }
      } else {
        result = await executeSkill(
          skillId,
          {
            prompt: args.replace(/^["']|["']$/g, '').trim(),
          },
          llmConfig,
        )
      }

      toolCalls.push({ skillId, args, result })
      recordAgentExecutionReceipt({
        agentId: 'tool-loop',
        subject: `工具循环：${skillId}`,
        input: args,
        output: result.result,
        status: result.success ? 'completed' : 'failed',
        tools: [toolLoopRef(skillId, result.success)],
        evidenceRefs: result.mcpServerUsed
          ? [{ kind: 'tool', id: result.mcpServerUsed, title: result.mcpServerUsed }]
          : [],
        durationMs: result.duration,
        entities: [skillId, result.mcpServerUsed || ''].filter(Boolean),
      }).catch(() => {})

      // 将工具结果嵌入回复
      augmentedResponse = augmentedResponse.replace(
        match.fullMatch,
        `\n> **[${skillId}]** ${result.success ? '✓' : '✗'} ${result.result.slice(0, 500)}\n`,
      )
    }

    // 将 LLM 回复（含工具结果）加入消息历史，让 LLM 继续生成
    currentMessages.push(
      { role: 'assistant', content: augmentedResponse },
      { role: 'user', content: '请基于工具结果继续回答。如果需要更多信息，可以继续调用工具。否则直接给出最终回答。' },
    )
  }

  // 达到最大轮次，请求最终回复
  currentMessages.push({ role: 'user', content: '请现在给出最终总结回答。' })
  const finalResponse = await chatCompletion(llmConfig, currentMessages, 0.7, 4096)

  return { finalText: finalResponse, toolCalls, rounds: round }
}

/** 构建内核状态上下文（Knowledge Graph + Swarm 突破） */
async function buildKernelContext(topic: string): Promise<string> {
  const parts: string[] = []

  // Knowledge Graph：按主题查询相关三元组
  if (topic) {
    try {
      const keywords = topic.split(/[\s,，、]+/).filter((k) => k.length > 1)
      const allTriples: KnowledgeTriple[] = []
      for (const kw of keywords.slice(0, 3)) {
        const triples = await queryEntity(kw)
        allTriples.push(...triples.slice(0, 2))
      }
      const graphPrompt = renderGraphPrompt(allTriples, 300)
      if (graphPrompt) parts.push(graphPrompt)
    } catch {
      /* ignore */
    }
  }

  // Swarm 突破状态
  try {
    const swarmState = await getLatestSwarmState()
    if (swarmState && swarmState.breakthroughs.length > 0) {
      const lines = swarmState.breakthroughs
        .slice(0, 3)
        .map(
          (b) => `- ${b.insight || `${b.sourceNeuron} ↔ ${b.targetNeuron}`} [新颖度 ${(b.novelty * 100).toFixed(0)}%]`,
        )
      parts.push(`<recent-breakthroughs>\n${lines.join('\n')}\n</recent-breakthroughs>`)
    }
  } catch {
    /* ignore */
  }

  return parts.join('\n')
}

/**
 * 构建工具提示（添加到 system prompt）
 * 让 LLM 知道可以调用哪些工具
 */
export async function buildToolPrompt(enabledSkillIds: string[]): Promise<string> {
  const parts: string[] = []

  // 内置技能
  if (enabledSkillIds.length > 0) {
    const skills = loadSkills().filter((s) => enabledSkillIds.includes(s.id) && s.enabled)
    if (skills.length > 0) {
      const toolList = skills.map((s) => `- \`${s.id}\`: ${s.description.slice(0, 60)}`).join('\n')
      parts.push(`可用技能：\n${toolList}`)
    }
  }

  // MCP 桥接工具（自动从在线 MCP 服务器收集）
  try {
    const mcpSkills = await collectMCPSkills()
    if (mcpSkills.length > 0) {
      parts.push(buildMCPToolPrompt(mcpSkills))
    }
  } catch {
    /* MCP 不可用时不影响基本功能 */
  }

  if (parts.length === 0) return ''

  return `

## 可用工具
你可以通过以下格式调用工具获取实时信息：
\`tool_call:技能ID("查询内容")\`
或 JSON 格式：
\`{"tool_call":{"id":"技能ID","args":"查询内容"}}\`

${parts.join('\n\n')}

使用规则：
- 只在需要实时数据、外部信息时才调用工具
- 每次最多调用 2 个工具
- 调用工具后，基于工具结果给出回答
- 如果不需要工具，直接回答即可
`
}
