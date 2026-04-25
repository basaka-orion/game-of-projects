/**
 * Scheduler — 定时自动化任务调度
 *
 * 支持的任务类型：
 * - research: 自动调研指定主题
 * - report: 生成项目报告
 * - memory-scan: 扫描最近活动提取记忆
 * - custom: 执行指定工作流
 */
import { query, run } from '../db/repository'
import { generateId } from '../db/schema'

export interface PlatformTarget {
  platform: 'telegram' | 'discord' | 'slack'
  targetId: string
  enabled: boolean
}

export interface ScheduledTask {
  id: string
  name: string
  cronExpression: string
  taskType: 'research' | 'report' | 'memory-scan' | 'custom' | 'agent-task' | 'wiki-compile' | 'lint'
  taskConfig: Record<string, string>
  lastRun: string
  nextRun: string
  enabled: boolean
  /** 关联的 Agent ID（用于 Soul 渲染推送消息） */
  agentId?: string
  /** 平台推送目标列表 */
  platformTargets?: PlatformTarget[]
}

/** 创建定时任务 */
export async function createScheduledTask(task: Omit<ScheduledTask, 'id' | 'lastRun' | 'nextRun'>): Promise<string> {
  const id = 'task_' + generateId()
  await run(
    `INSERT INTO scheduled_tasks (id, name, cron_expression, task_type, task_config_json, last_run, next_run, enabled, agent_id, platform_config_json)
     VALUES (?, ?, ?, ?, ?, '', '', ?, ?, ?)`,
    [
      id,
      task.name,
      task.cronExpression,
      task.taskType,
      JSON.stringify(task.taskConfig),
      task.enabled ? 1 : 0,
      task.agentId || '',
      JSON.stringify(task.platformTargets || []),
    ],
  )
  return id
}

/** 列出所有定时任务 */
export async function listScheduledTasks(): Promise<ScheduledTask[]> {
  try {
    const rows = await query<Record<string, unknown>>('SELECT * FROM scheduled_tasks ORDER BY created_at DESC')

    return rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      cronExpression: r.cron_expression as string,
      taskType: r.task_type as string as ScheduledTask['taskType'],
      taskConfig: JSON.parse((r.task_config_json as string) || '{}'),
      lastRun: (r.last_run as string) || '',
      nextRun: (r.next_run as string) || '',
      enabled: r.enabled === 1,
      agentId: (r.agent_id as string) || '',
      platformTargets: (() => {
        try {
          const v = JSON.parse((r.platform_config_json as string) || '[]')
          return Array.isArray(v) ? v : []
        } catch {
          return []
        }
      })(),
    }))
  } catch (err) {
    console.error('[scheduler] listScheduledTasks failed:', err)
    return []
  }
}

/** 更新定时任务 */
export async function updateScheduledTask(
  id: string,
  updates: Partial<
    Pick<ScheduledTask, 'name' | 'enabled' | 'cronExpression' | 'taskConfig' | 'agentId' | 'platformTargets'>
  >,
): Promise<void> {
  const sets: string[] = []
  const values: unknown[] = []

  if (updates.name !== undefined) {
    sets.push('name = ?')
    values.push(updates.name)
  }
  if (updates.enabled !== undefined) {
    sets.push('enabled = ?')
    values.push(updates.enabled ? 1 : 0)
  }
  if (updates.cronExpression !== undefined) {
    sets.push('cron_expression = ?')
    values.push(updates.cronExpression)
  }
  if (updates.taskConfig !== undefined) {
    sets.push('task_config_json = ?')
    values.push(JSON.stringify(updates.taskConfig))
  }
  if (updates.agentId !== undefined) {
    sets.push('agent_id = ?')
    values.push(updates.agentId)
  }
  if (updates.platformTargets !== undefined) {
    sets.push('platform_config_json = ?')
    values.push(JSON.stringify(updates.platformTargets))
  }

  if (sets.length === 0) return
  values.push(id)
  await run(`UPDATE scheduled_tasks SET ${sets.join(', ')} WHERE id = ?`, values)
}

/** 删除定时任务 */
export async function deleteScheduledTask(id: string): Promise<void> {
  await run('DELETE FROM scheduled_tasks WHERE id = ?', [id])
}

/** 标记任务已运行 */
export async function markTaskRun(id: string): Promise<void> {
  await run("UPDATE scheduled_tasks SET last_run = datetime('now','localtime') WHERE id = ?", [id])
}
