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
  communicationPattern: 'round-robin' | 'broadcast' | 'sequential'
  temperature?: number
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
  topic: string
  messages: TeamMessage[]
  summary: string
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
}
