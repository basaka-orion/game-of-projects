import type { OperatingEventRow } from '../db/repository'
import type { OperatingLoopTarget } from '../operating-loop'
import type { AgentExecutionReceipt, ExecutionRiskLevel } from './execution-receipt'

export type ExecutionReviewPriority = 'intervene' | 'review' | 'promote' | 'watch'

export interface AgentExecutionReview {
  id: string
  eventId: string
  receiptId: string
  agentId: string
  subject: string
  score: number
  priority: ExecutionReviewPriority
  label: string
  summary: string
  nextStep: string
  target: OperatingLoopTarget
  receipt: AgentExecutionReceipt
}

export interface ExecutionLearningSummary {
  total: number
  completed: number
  failed: number
  highRisk: number
  retryRecommended: number
  evidenceCoverage: number
  averageScore: number
  strongestSignal: string
  nextAction: string
}

export interface ExecutionLearningDeck {
  summary: ExecutionLearningSummary
  reviews: AgentExecutionReview[]
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function riskPenalty(risk: ExecutionRiskLevel): number {
  if (risk === 'high') return 24
  if (risk === 'medium') return 10
  return 0
}

function hasDurableEvidence(receipt: AgentExecutionReceipt): boolean {
  return receipt.evidenceRefs.some((ref) => ['knowledge', 'memory', 'project', 'schedule'].includes(ref.kind))
}

export function parseAgentExecutionReceipt(event: OperatingEventRow): AgentExecutionReceipt | null {
  if (event.type !== 'agent_action') return null

  try {
    const payload = JSON.parse(event.payload_json || '{}') as { receipt?: AgentExecutionReceipt }
    return payload.receipt || null
  } catch {
    return null
  }
}

export function scoreExecutionReceipt(receipt: AgentExecutionReceipt): number {
  const failedTools = receipt.tools.filter((tool) => tool.status === 'failed').length
  const evidenceCount = receipt.evidenceRefs.length
  let score = receipt.trust.confidence * 100

  score -= riskPenalty(receipt.trust.risk)
  if (receipt.status === 'failed') score -= 30
  if (receipt.retry.recommended) score -= 14
  if (failedTools > 0) score -= Math.min(18, failedTools * 8)
  if (evidenceCount === 0) score -= 16
  else if (!hasDurableEvidence(receipt)) score -= 7
  if (receipt.outputPreview === '无可读内容。') score -= 10

  if (receipt.status === 'completed' && hasDurableEvidence(receipt)) score += 8
  if (receipt.status === 'completed' && receipt.tools.every((tool) => tool.status !== 'failed')) score += 4

  return clampScore(score)
}

function reviewPriority(receipt: AgentExecutionReceipt, score: number): ExecutionReviewPriority {
  if (receipt.status === 'failed' || receipt.retry.recommended) return 'intervene'
  if (receipt.trust.risk === 'high' || score < 55 || !hasDurableEvidence(receipt)) return 'review'
  if (score >= 80) return 'promote'
  return 'watch'
}

function reviewLabel(priority: ExecutionReviewPriority): string {
  if (priority === 'intervene') return '需要介入'
  if (priority === 'review') return '需要复盘'
  if (priority === 'promote') return '可沉淀'
  return '观察中'
}

function reviewTarget(receipt: AgentExecutionReceipt, priority: ExecutionReviewPriority): OperatingLoopTarget {
  if (priority === 'intervene')
    return receipt.tools.some((tool) => tool.id === 'scheduled_tasks') ? 'scheduler' : 'control'
  if (!hasDurableEvidence(receipt)) return 'knowledge'
  if (priority === 'promote') return 'memory'
  return 'teams'
}

function learningSummary(receipt: AgentExecutionReceipt, score: number): string {
  if (receipt.status === 'failed') return '失败结果只作为阻塞信号，先修配置、输入或工具链。'
  if (receipt.retry.recommended) return '系统建议重试，下一次执行前要补足上下文或降低任务复杂度。'
  if (receipt.trust.risk === 'high') return '高风险执行需要人工复盘，不能直接进入长期事实层。'
  if (!hasDurableEvidence(receipt)) return '缺少项目、知识、记忆或排程证据，先补 provenance 再复用。'
  if (score >= 80) return '完成度与证据覆盖都较好，可沉淀为可复用 Agent 模式。'
  return '结果可观察，但还需要后续验证它是否真正推动项目或 Boss 状态。'
}

function reviewNextStep(receipt: AgentExecutionReceipt, priority: ExecutionReviewPriority): string {
  if (priority === 'intervene') return receipt.retry.nextStep
  if (!hasDurableEvidence(receipt)) return '把这次输出挂到知识、记忆或项目来源后再进入下一轮推演。'
  if (priority === 'promote') return '提炼为 Boss 画像、项目操作手册或可复用 Agent prompt。'
  if (receipt.trust.risk === 'high') return '进入控制面板检查工具权限、输入范围与输出影响面。'
  return '保留在观察队列，等待下一次执行结果形成趋势。'
}

export function buildAgentExecutionReview(
  event: OperatingEventRow,
  receipt: AgentExecutionReceipt,
): AgentExecutionReview {
  const score = scoreExecutionReceipt(receipt)
  const priority = reviewPriority(receipt, score)

  return {
    id: `review_${event.id}`,
    eventId: event.id,
    receiptId: receipt.id,
    agentId: receipt.agentId,
    subject: receipt.subject,
    score,
    priority,
    label: reviewLabel(priority),
    summary: learningSummary(receipt, score),
    nextStep: reviewNextStep(receipt, priority),
    target: reviewTarget(receipt, priority),
    receipt,
  }
}

function emptySummary(): ExecutionLearningSummary {
  return {
    total: 0,
    completed: 0,
    failed: 0,
    highRisk: 0,
    retryRecommended: 0,
    evidenceCoverage: 0,
    averageScore: 0,
    strongestSignal: '等待执行收据',
    nextAction: '先让 Agent、Cron 或工具产生第一批可复盘结果。',
  }
}

export function buildExecutionLearningDeck(events: OperatingEventRow[], limit = 6): ExecutionLearningDeck {
  const reviews = events
    .map((event) => {
      const receipt = parseAgentExecutionReceipt(event)
      return receipt ? buildAgentExecutionReview(event, receipt) : null
    })
    .filter((item): item is AgentExecutionReview => Boolean(item))
    .sort((a, b) => {
      const priorityRank: Record<ExecutionReviewPriority, number> = {
        intervene: 0,
        review: 1,
        promote: 2,
        watch: 3,
      }
      return priorityRank[a.priority] - priorityRank[b.priority] || a.score - b.score
    })

  if (reviews.length === 0) return { summary: emptySummary(), reviews: [] }

  const total = reviews.length
  const completed = reviews.filter((item) => item.receipt.status === 'completed').length
  const failed = reviews.filter((item) => item.receipt.status === 'failed').length
  const highRisk = reviews.filter((item) => item.receipt.trust.risk === 'high').length
  const retryRecommended = reviews.filter((item) => item.receipt.retry.recommended).length
  const evidenceCovered = reviews.filter((item) => hasDurableEvidence(item.receipt)).length
  const averageScore = clampScore(reviews.reduce((sum, item) => sum + item.score, 0) / total)
  const top = reviews[0]

  return {
    summary: {
      total,
      completed,
      failed,
      highRisk,
      retryRecommended,
      evidenceCoverage: Math.round((evidenceCovered / total) * 100),
      averageScore,
      strongestSignal: top.summary,
      nextAction: top.nextStep,
    },
    reviews: reviews.slice(0, limit),
  }
}
