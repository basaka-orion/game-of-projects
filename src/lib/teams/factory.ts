/**
 * Team Factory — 三种团队创建工厂
 *
 * 1. Permanent: 用户手动创建永久命名团队
 * 2. Agency: 基于 PRD 自动编组
 * 3. Brainstorm: 临时头脑风暴
 */
import { createTeam } from './store'
import { AgentCapabilityId, TeamAgent, TeamConfig, TeamExecutionMode, TeamTask, TeamWorkflowType } from './types'
import { chatCompletion, LLMConfig, getDefaultConfig } from '../ai/provider'
import { getSetting } from '../db/store'

/** 创建永久命名团队 */
export async function createPermanentTeam(params: {
  name: string
  description?: string
  agents: TeamAgent[]
  communicationPattern?: 'round-robin' | 'broadcast' | 'sequential'
  workflowType?: TeamWorkflowType
  capabilities?: AgentCapabilityId[]
  executionMode?: TeamExecutionMode
}): Promise<string> {
  return createTeam({
    name: params.name,
    description: params.description,
    teamType: 'permanent',
    agents: params.agents,
    config: {
      communicationPattern: params.communicationPattern || 'sequential',
      workflowType: params.workflowType || 'custom',
      capabilities: params.capabilities || [],
      executionMode: params.executionMode || 'advisory',
      temperature: 0.7,
    },
  })
}

/** 基于 PRD 自动编组 */
export async function createAgencyTeam(params: {
  prd: string
  projectId?: string
}): Promise<{ teamId: string; tasks: TeamTask[] }> {
  // 用 LLM 分析 PRD，确定需要哪些角色和任务
  const tasks = await analyzePRD(params.prd)

  // 从任务中提取需要的 agent 角色
  const agentIds = new Set(tasks.map((t) => t.assignedAgent))
  const agents: TeamAgent[] = Array.from(agentIds).map((agentId) => ({
    agentId,
    role: agentId,
    skills: [],
  }))

  const teamId = await createTeam({
    name: `Agency: ${params.prd.slice(0, 30)}...`,
    description: '基于 PRD 自动编组的临时团队',
    teamType: 'agency',
    agents,
    projectId: params.projectId,
    config: {
      tasks,
      communicationPattern: 'sequential',
      workflowType: 'prd',
      capabilities: ['prd', 'web-search', 'review'],
      executionMode: 'advisory',
      temperature: 0.5,
    },
  })

  return { teamId, tasks }
}

/** 创建临时头脑风暴团队 */
export async function createBrainstormTeam(params: {
  topic: string
  agentIds: string[]
  maxRounds?: number
  workflowType?: TeamWorkflowType
  capabilities?: AgentCapabilityId[]
  executionMode?: TeamExecutionMode
}): Promise<string> {
  const agents: TeamAgent[] = params.agentIds.map((id) => ({
    agentId: id,
    role: id,
    skills: [],
  }))

  return createTeam({
    name: `头脑风暴: ${params.topic.slice(0, 30)}`,
    description: `主题: ${params.topic}`,
    teamType: 'brainstorm',
    agents,
    config: {
      maxRounds: params.maxRounds || 3,
      communicationPattern: 'round-robin',
      workflowType: params.workflowType || 'custom',
      capabilities: params.capabilities || [],
      executionMode: params.executionMode || 'advisory',
      temperature: 0.9,
    },
  })
}

// ─── 内部 ───

async function analyzePRD(prd: string): Promise<TeamTask[]> {
  const provider = getSetting('llm_provider', 'deepseek')
  const defaults = getDefaultConfig(provider)
  const config: LLMConfig = {
    provider: provider as LLMConfig['provider'],
    apiKey: getSetting('llm_api_key', ''),
    baseUrl: getSetting('llm_base_url', defaults.baseUrl),
    model: getSetting('llm_model', defaults.model),
  }

  const response = await chatCompletion(
    config,
    [
      {
        role: 'system',
        content: `你是一个项目任务分解专家。分析 PRD，将其分解为可分配给以下角色的任务：
- strategy: 战略规划、资源分配
- technical: 技术架构、实现方案
- market: 市场分析、用户研究
- creative: 创意设计、创新方案
- critic: 风险评估、盲点检查
- visual: UI/UX、视觉语言、动效叙事、图文表达
- general: 综合、报告

输出格式（JSON 数组）：
[{"id":"t1","description":"任务描述","assignedAgent":"strategy","dependsOn":[],"outputKey":"market_analysis"}]

规则：
- 每个任务分配给最适合的角色
- 任务之间可以依赖（dependsOn 引用 id）
- 最多 8 个任务
- 直接输出 JSON 数组`,
      },
      { role: 'user', content: prd },
    ],
    0.3,
    1024,
  )

  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as TeamTask[]
    }
  } catch {
    /* ignore */
  }

  // 默认任务分配
  return [
    { id: 't1', description: '分析 PRD 核心需求', assignedAgent: 'general', dependsOn: [], outputKey: 'analysis' },
    { id: 't2', description: '技术可行性评估', assignedAgent: 'technical', dependsOn: ['t1'], outputKey: 'tech' },
    { id: 't3', description: '市场与风险评估', assignedAgent: 'market', dependsOn: ['t1'], outputKey: 'market' },
    { id: 't4', description: '视觉与交互体验设计', assignedAgent: 'visual', dependsOn: ['t1'], outputKey: 'visual' },
    {
      id: 't5',
      description: '综合建议',
      assignedAgent: 'strategy',
      dependsOn: ['t2', 't3', 't4'],
      outputKey: 'strategy',
    },
  ]
}
