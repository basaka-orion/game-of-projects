/**
 * Team Types — 团队类型定义
 *
 * 三种团队类型：
 * 1. permanent: 用户手动创建的永久命名团队
 * 2. agency: 基于 PRD 自动编组的临时团队
 * 3. brainstorm: 临时头脑风暴团队
 */

export type TeamType = 'permanent' | 'agency' | 'brainstorm'
export type TeamStatus = 'active' | 'archived' | 'disbanded'
export type TeamWorkflowType =
  | 'prd'
  | 'research'
  | 'build'
  | 'xcode-mac-app'
  | 'visual-review'
  | 'automation'
  | 'custom'

export type AgentCapabilityId =
  | 'vision'
  | 'desktop-control'
  | 'xcode'
  | 'filesystem'
  | 'terminal'
  | 'browser'
  | 'web-search'
  | 'codegen'
  | 'prd'
  | 'review'
  | 'telegram'

export type TeamExecutionMode = 'advisory' | 'supervised' | 'autonomous'
export type TeamActionStatus = 'proposed' | 'approved' | 'running' | 'completed' | 'failed' | 'rejected'
export type TeamActionRisk = 'low' | 'medium' | 'high'
export type TeamActionToolId =
  | 'terminal'
  | 'file_read'
  | 'file_write'
  | 'web_search'
  | 'web_extract'
  | 'vision_analyze'
  | 'desktop_screenshot'
  | 'desktop_control'
  | 'xcode_action'
  | 'execute_code'
  | 'manual_review'

export interface Team {
  id: string
  name: string
  description: string
  teamType: TeamType
  agents: TeamAgent[]
  projectId?: string
  config: TeamConfig
  status: TeamStatus
  createdAt: string
  updatedAt: string
}

export interface TeamAgent {
  agentId: string
  role: string
  skills: string[]
  systemPromptOverride?: string
}

export interface TeamConfig {
  maxRounds?: number
  tasks?: TeamTask[]
  debatePhases?: TeamDebatePhase[]
  communicationPattern: 'round-robin' | 'broadcast' | 'sequential'
  temperature?: number
  workflowType?: TeamWorkflowType
  capabilities?: AgentCapabilityId[]
  executionMode?: TeamExecutionMode
}

export interface TeamDebatePhase {
  id: string
  label: string
  instruction: string
  consensusImpact: string
  requiresChallenge?: boolean
}

export interface TeamTask {
  id: string
  description: string
  assignedAgent: string
  dependsOn: string[]
  outputKey: string
}

export interface TeamSession {
  id: string
  teamId: string
  title: string
  topic: string
  messages: TeamMessage[]
  summary: string
  tags: string[]
  isPinned: boolean
  isStarred: boolean
  status: 'active' | 'completed' | 'failed'
  createdAt: string
  updatedAt: string
}

export interface TeamMessage {
  id: string
  agentId: string
  agentName: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  round?: number
  kind?: 'progress' | 'brief' | 'error' | 'artifact' | 'reflection'
  artifactType?:
    | 'prd'
    | 'discussion'
    | 'research-report'
    | 'implementation-plan'
    | 'workflow-plan'
    | 'visual-review'
    | 'automation-runbook'
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface TeamAction {
  id: string
  sessionId: string
  teamId: string
  ownerAgentId: string
  ownerAgentName: string
  capability: AgentCapabilityId
  toolId: TeamActionToolId
  title: string
  description: string
  params: Record<string, unknown>
  risk: TeamActionRisk
  requiresApproval: boolean
  status: TeamActionStatus
  result?: {
    success: boolean
    output: string
    error?: string
    raw?: unknown
  }
  createdAt: string
  updatedAt: string
}
