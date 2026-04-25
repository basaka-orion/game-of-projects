/**
 * Workflow Types — 工作流类型定义
 */
import { ExpertRole } from '../chat/router'

export interface Workflow {
  id: string
  name: string
  nameEn: string
  goal: string
  steps: WorkflowStep[]
  agents: WorkflowAgent[]
  status: 'draft' | 'active' | 'completed'
}

export interface WorkflowStep {
  id: string
  /** 映射到 ExpertRole 或自定义 Agent ID */
  agentRole: string
  /** 该步骤的任务描述 */
  task: string
  /** 依赖的前置步骤 ID */
  dependsOn: string[]
  /** 输出键名（传递给后续步骤） */
  outputKey: string
}

export interface WorkflowAgent {
  role: string
  /** 自定义系统提示词覆盖 */
  systemPromptOverride?: string
  /** 该 Agent 使用的技能 ID */
  skills: string[]
}

export interface WorkflowRun {
  id: string
  workflowId: string
  results: Record<string, string>
  status: 'running' | 'completed' | 'failed'
  createdAt: string
}
