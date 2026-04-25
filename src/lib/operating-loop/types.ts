import type { AgentExecutionReceipt } from '../agents/execution-receipt'

export type OperatingLoopStageId = 'capture' | 'understand' | 'remember' | 'compile' | 'simulate' | 'execute' | 'review'

export type OperatingLoopTarget =
  | 'memory'
  | 'profiling'
  | 'knowledge'
  | 'warroom'
  | 'teams'
  | 'scheduler'
  | 'control'
  | 'neurons'
  | 'synapses'

export type OperatingLoopTone = 'accent' | 'success' | 'warning'

export interface OperatingLoopSourceRef {
  sourceId?: string
  kind: 'conversation' | 'qimeng' | 'project' | 'wiki' | 'agent' | 'manual'
  title: string
  path?: string
  url?: string
}

export interface OperatingLoopBaseRecord {
  id: string
  stage: OperatingLoopStageId
  createdAt: string
  source?: OperatingLoopSourceRef
  confidence?: number
  entities?: string[]
  projectIds?: string[]
}

export interface InputEvent extends OperatingLoopBaseRecord {
  type: 'input_event'
  inputKind: 'conversation' | 'qimeng_candidate' | 'project_note' | 'web_clip' | 'manual_note' | 'agent_result'
  title: string
  contentPreview: string
}

export interface MemoryCandidate extends OperatingLoopBaseRecord {
  type: 'memory_candidate'
  category: 'boss' | 'project' | 'relationship' | 'knowledge' | 'decision' | 'preference'
  content: string
  archiveReason: string
  status: 'pending' | 'confirmed' | 'rejected' | 'compiled'
}

export interface BossSignal extends OperatingLoopBaseRecord {
  type: 'boss_signal'
  signalKind: 'preference' | 'cognitive_style' | 'communication_style' | 'decision_pattern' | 'avoidance'
  summary: string
  profileImpact: 'low' | 'medium' | 'high'
}

export interface KnowledgeSourceRecord extends OperatingLoopBaseRecord {
  type: 'knowledge_source'
  title: string
  scope?: string
  status: 'imported' | 'chunked' | 'compiled' | 'indexed' | 'stale'
  citationCount?: number
}

export interface ProjectSignal extends OperatingLoopBaseRecord {
  type: 'project_signal'
  projectId: string
  title: string
  signalKind: 'risk' | 'opportunity' | 'dependency' | 'synapse' | 'decision'
  nextStep?: string
}

export interface AgentAction extends OperatingLoopBaseRecord {
  type: 'agent_action'
  agentId: string
  title: string
  status: 'queued' | 'running' | 'blocked' | 'completed' | 'failed'
  toolRefs?: string[]
  resultPreview?: string
  receipt?: AgentExecutionReceipt
}

export type OperatingLoopRecord =
  | InputEvent
  | MemoryCandidate
  | BossSignal
  | KnowledgeSourceRecord
  | ProjectSignal
  | AgentAction

export type OperatingLoopRecordDraft =
  | (Omit<InputEvent, 'id' | 'createdAt'> & Partial<Pick<InputEvent, 'id' | 'createdAt'>>)
  | (Omit<MemoryCandidate, 'id' | 'createdAt'> & Partial<Pick<MemoryCandidate, 'id' | 'createdAt'>>)
  | (Omit<BossSignal, 'id' | 'createdAt'> & Partial<Pick<BossSignal, 'id' | 'createdAt'>>)
  | (Omit<KnowledgeSourceRecord, 'id' | 'createdAt'> & Partial<Pick<KnowledgeSourceRecord, 'id' | 'createdAt'>>)
  | (Omit<ProjectSignal, 'id' | 'createdAt'> & Partial<Pick<ProjectSignal, 'id' | 'createdAt'>>)
  | (Omit<AgentAction, 'id' | 'createdAt'> & Partial<Pick<AgentAction, 'id' | 'createdAt'>>)

export interface OperatingLoopDeckItem {
  id: string
  title: string
  value: string | number
  description: string
  target: OperatingLoopTarget
  tone?: OperatingLoopTone
}
