/**
 * 代理模式 — DAG 任务执行器
 * 灵感来自 agency-agents：定义任务图 → 拓扑排序 → 串行执行 → 结果合并
 */
import { chatCompletion, LLMConfig, ChatMessage } from './provider'

export type TaskType = 'research' | 'critique' | 'ideate' | 'synthesize'

export interface AgentTask {
  id: string
  type: TaskType
  prompt: string
  dependsOn: string[]  // 前置任务 ID
  output?: string
}

export interface AgentResult {
  taskId: string
  type: TaskType
  output: string
  success: boolean
}

export interface AgentReport {
  topic: string
  tasks: AgentResult[]
  finalOutput: string
  executedAt: string
}

/** 拓扑排序 */
function topologicalSort(tasks: AgentTask[]): AgentTask[] {
  const inDegree = new Map<string, number>()
  const graph = new Map<string, string[]>()

  for (const task of tasks) {
    if (!inDegree.has(task.id)) inDegree.set(task.id, 0)
    if (!graph.has(task.id)) graph.set(task.id, [])

    for (const dep of task.dependsOn) {
      graph.get(dep)?.push(task.id)
      inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1)
    }
  }

  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  const sorted: AgentTask[] = []
  while (queue.length > 0) {
    const current = queue.shift()!
    const task = tasks.find(t => t.id === current)
    if (task) sorted.push(task)

    for (const next of graph.get(current) || []) {
      inDegree.set(next, (inDegree.get(next) || 0) - 1)
      if (inDegree.get(next) === 0) queue.push(next)
    }
  }

  return sorted
}

const TASK_PROMPTS: Record<TaskType, string> = {
  research: '你是一个深度研究分析师。基于给定主题和上下文，产出深入的研究报告。',
  critique: '你是一个批判性思维专家。审视给定内容，找出漏洞、风险和改进点。',
  ideate: '你是一个创意引擎。基于给定上下文，产出大胆创新的方案和想法。',
  synthesize: '你是一个信息综合师。将多个来源的信息综合成简洁有力的摘要。',
}

/** 执行代理任务图 */
export async function executeAgentDAG(
  config: LLMConfig,
  topic: string,
  tasks: AgentTask[],
): Promise<AgentReport> {
  const sorted = topologicalSort(tasks)
  const results = new Map<string, string>()
  const agentResults: AgentResult[] = []

  for (const task of sorted) {
    // 收集前置任务输出
    const context = task.dependsOn
      .map(depId => `## 前置任务 ${depId} 的结果\n${results.get(depId) || '（无输出）'}`)
      .join('\n\n')

    const messages: ChatMessage[] = [
      { role: 'system', content: TASK_PROMPTS[task.type] },
      {
        role: 'user',
        content: `主题：${topic}\n\n${task.prompt}${context ? `\n\n## 上下文\n${context}` : ''}`,
      },
    ]

    try {
      const response = await chatCompletion(config, messages, task.type === 'ideate' ? 0.8 : 0.5, 1500)
      results.set(task.id, response)
      agentResults.push({ taskId: task.id, type: task.type, output: response, success: true })
    } catch (err) {
      const errorMsg = `任务执行失败: ${(err as Error).message}`
      results.set(task.id, errorMsg)
      agentResults.push({ taskId: task.id, type: task.type, output: errorMsg, success: false })
    }
  }

  // 最终综合输出
  const finalOutputs = Array.from(results.entries())
    .map(([id, output]) => `[${id}]: ${output.slice(0, 300)}`)
    .join('\n\n')

  return {
    topic,
    tasks: agentResults,
    finalOutput: finalOutputs,
    executedAt: new Date().toISOString(),
  }
}

/** 快速创建一个标准的深度分析任务图 */
export function createDeepAnalysisTasks(topic: string): AgentTask[] {
  return [
    {
      id: 'research',
      type: 'research',
      prompt: `深度研究「${topic}」的市场现状、技术趋势和主要玩家。`,
      dependsOn: [],
    },
    {
      id: 'critique',
      type: 'critique',
      prompt: `基于研究结果，找出最常见的失败原因和最大风险。`,
      dependsOn: ['research'],
    },
    {
      id: 'ideate',
      type: 'ideate',
      prompt: `基于研究和批判结果，提出 3 个差异化切入方案。`,
      dependsOn: ['research', 'critique'],
    },
    {
      id: 'synthesize',
      type: 'synthesize',
      prompt: `综合以上所有分析，给出最终的战略建议。`,
      dependsOn: ['research', 'critique', 'ideate'],
    },
  ]
}

// ─── 子 Agent 委托 ───

export interface SubAgentConfig {
  id: string
  name: string
  systemPrompt: string
  temperature?: number
  maxTokens?: number
}

/** 创建子 Agent（返回配置对象） */
export function createSubAgent(config: SubAgentConfig): SubAgentConfig {
  return config
}

/** 委托任务给子 Agent */
export async function delegateToSubAgent(
  config: LLMConfig,
  agent: SubAgentConfig,
  task: string,
  context?: string
): Promise<string> {
  const userContent = context
    ? `## 上下文\n${context}\n\n## 任务\n${task}`
    : task

  return chatCompletion(
    config,
    [
      { role: 'system', content: agent.systemPrompt },
      { role: 'user', content: userContent },
    ],
    agent.temperature || 0.7,
    agent.maxTokens || 2048
  )
}

/** 并行委托多个任务给子 Agent */
export async function parallelDelegate(
  config: LLMConfig,
  tasks: Array<{ agent: SubAgentConfig; task: string; context?: string }>
): Promise<string[]> {
  return Promise.all(
    tasks.map(t => delegateToSubAgent(config, t.agent, t.task, t.context))
  )
}
