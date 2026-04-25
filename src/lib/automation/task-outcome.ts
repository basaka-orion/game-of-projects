import { dbSaveMemory, dbSaveOperatingEvent } from '../db/repository'
import { buildScheduledTaskExecutionReceipt } from '../agents/execution-receipt'

export interface ScheduledTaskOutcomeTask {
  id: string
  name: string
  taskType: string
  taskConfig?: Record<string, unknown>
  agentId?: string
}

export interface ScheduledTaskOutcome {
  status: 'success' | 'error'
  message: string
  durationMs?: number
}

export interface ScheduledTaskOutcomeWrite {
  eventId?: string
  memoryId?: string
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function clampPreview(value: string, max = 600): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return '任务没有返回可读结果。'
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}...`
}

function isWarRoomTask(task: ScheduledTaskOutcomeTask): boolean {
  return task.name.includes('WarRoom') || !!readString(task.taskConfig?.projectId)
}

function buildOutcomePreview(outcome: ScheduledTaskOutcome): string {
  const duration = typeof outcome.durationMs === 'number' ? `（${outcome.durationMs}ms）` : ''
  return `${clampPreview(outcome.message)}${duration}`
}

export async function recordScheduledTaskOutcome(
  task: ScheduledTaskOutcomeTask,
  outcome: ScheduledTaskOutcome,
): Promise<ScheduledTaskOutcomeWrite> {
  const projectId = readString(task.taskConfig?.projectId)
  const reviewAt = readString(task.taskConfig?.reviewAt)
  const agentId = task.agentId || 'scheduler'
  const completed = outcome.status === 'success'
  const preview = buildOutcomePreview(outcome)
  const receipt = buildScheduledTaskExecutionReceipt(task, outcome)
  const write: ScheduledTaskOutcomeWrite = {}

  try {
    write.eventId = await dbSaveOperatingEvent({
      id: `op_task_outcome_${task.id}_${Date.now().toString(36)}`,
      type: 'agent_action',
      stage: 'review',
      agentId,
      title: `${completed ? '任务完成' : '任务失败'}：${task.name}`,
      status: completed ? 'completed' : 'failed',
      toolRefs: ['scheduled_tasks', task.taskType, ...(isWarRoomTask(task) ? ['war_room'] : [])],
      resultPreview: preview,
      projectIds: projectId ? [projectId] : [],
      source: { kind: 'agent', sourceId: task.id, title: task.name },
      confidence: completed ? 0.82 : 0.48,
      entities: [task.taskType, agentId, projectId, reviewAt].filter(Boolean),
      receipt,
    })
  } catch (err) {
    console.warn('[task-outcome] failed to write operating event:', err)
  }

  if (projectId && isWarRoomTask(task)) {
    try {
      write.memoryId = await dbSaveMemory(
        'insight',
        `${completed ? '推演执行复盘' : '推演执行阻塞'}：${task.name} -> ${preview}`,
        `cron:${task.id}`,
        completed ? 0.74 : 0.56,
      )
    } catch (err) {
      console.warn('[task-outcome] failed to write boss memory:', err)
    }
  }

  return write
}
