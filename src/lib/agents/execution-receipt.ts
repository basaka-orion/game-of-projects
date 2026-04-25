export type ExecutionRiskLevel = 'low' | 'medium' | 'high'
export type ExecutionReceiptStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface ExecutionToolRef {
  id: string
  label: string
  risk: ExecutionRiskLevel
  status?: 'completed' | 'failed' | 'skipped'
}

export interface ExecutionEvidenceRef {
  kind: 'project' | 'knowledge' | 'memory' | 'tool' | 'schedule' | 'manual'
  id?: string
  title: string
}

export interface ExecutionCostEstimate {
  inputChars: number
  outputChars: number
  note: string
}

export interface ExecutionRetryAdvice {
  recommended: boolean
  reason: string
  nextStep: string
}

export interface AgentExecutionReceipt {
  id: string
  subject: string
  agentId: string
  status: ExecutionReceiptStatus
  inputPreview: string
  outputPreview: string
  tools: ExecutionToolRef[]
  evidenceRefs: ExecutionEvidenceRef[]
  cost: ExecutionCostEstimate
  retry: ExecutionRetryAdvice
  trust: {
    risk: ExecutionRiskLevel
    confidence: number
    rationale: string
  }
}

export interface ScheduledTaskReceiptInput {
  id: string
  name: string
  taskType: string
  taskConfig?: Record<string, unknown>
  agentId?: string
}

export interface ScheduledTaskReceiptOutcome {
  status: 'success' | 'error'
  message: string
  durationMs?: number
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function clampExecutionText(value: string, max = 420): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return '无可读内容。'
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}...`
}

function taskRisk(taskType: string): ExecutionRiskLevel {
  if (['wiki-compile', 'custom', 'agent-task'].includes(taskType)) return 'medium'
  if (['research', 'report', 'memory-scan', 'lint'].includes(taskType)) return 'low'
  return 'medium'
}

function strongestRisk(tools: ExecutionToolRef[]): ExecutionRiskLevel {
  if (tools.some((tool) => tool.risk === 'high')) return 'high'
  if (tools.some((tool) => tool.risk === 'medium')) return 'medium'
  return 'low'
}

function retryAdvice(outcome: ScheduledTaskReceiptOutcome, taskType: string, reviewAt: string): ExecutionRetryAdvice {
  if (outcome.status === 'success') {
    return {
      recommended: false,
      reason: reviewAt ? `等待 ${reviewAt} 复盘。` : '任务已完成，等待下一次计划触发。',
      nextStep: '把输出沉淀到对应项目、知识或 Boss 画像里。',
    }
  }

  const failedBecauseApi = /api key|未配置|timeout|超时|network|网络|quota|限额/i.test(outcome.message)
  return {
    recommended: true,
    reason: failedBecauseApi ? '失败更像配置或外部服务问题。' : '任务执行失败，需要重新给定上下文或降低任务复杂度。',
    nextStep:
      taskType === 'research'
        ? '先检查搜索/MCP/LLM 配置，再重跑研究任务。'
        : '保留当前失败收据，补充更明确输入后重试。',
  }
}

export function buildScheduledTaskExecutionReceipt(
  task: ScheduledTaskReceiptInput,
  outcome: ScheduledTaskReceiptOutcome,
): AgentExecutionReceipt {
  const goal = readString(task.taskConfig?.goal) || readString(task.taskConfig?.prompt) || task.name
  const projectId = readString(task.taskConfig?.projectId)
  const reviewAt = readString(task.taskConfig?.reviewAt)
  const status: ExecutionReceiptStatus = outcome.status === 'success' ? 'completed' : 'failed'
  const tools: ExecutionToolRef[] = [
    { id: 'scheduled_tasks', label: 'Scheduler', risk: 'low', status },
    { id: task.taskType, label: task.taskType, risk: taskRisk(task.taskType), status },
  ]

  if (projectId || task.name.includes('WarRoom')) {
    tools.push({ id: 'war_room', label: 'WarRoom', risk: 'low', status })
  }

  const evidenceRefs: ExecutionEvidenceRef[] = []
  if (projectId) evidenceRefs.push({ kind: 'project', id: projectId, title: '关联项目' })
  if (reviewAt) evidenceRefs.push({ kind: 'schedule', title: `复盘日期 ${reviewAt}` })

  const risk = strongestRisk(tools)
  const inputPreview = clampExecutionText(goal)
  const outputPreview = clampExecutionText(outcome.message)
  const duration = typeof outcome.durationMs === 'number' ? `，耗时 ${outcome.durationMs}ms` : ''

  return {
    id: `receipt_${task.id}_${Date.now().toString(36)}`,
    subject: task.name,
    agentId: task.agentId || 'scheduler',
    status,
    inputPreview,
    outputPreview,
    tools,
    evidenceRefs,
    cost: {
      inputChars: goal.length,
      outputChars: outcome.message.length,
      note: `本地估算字符数${duration}；尚未接入 provider token/cost 回传。`,
    },
    retry: retryAdvice(outcome, task.taskType, reviewAt),
    trust: {
      risk,
      confidence: outcome.status === 'success' ? 0.78 : 0.42,
      rationale:
        outcome.status === 'success'
          ? '任务完成且已写入主循环账本；后续可信度取决于输出能否被知识/项目证据验证。'
          : '任务失败，结果只作为阻塞信号，不作为事实依据。',
    },
  }
}
