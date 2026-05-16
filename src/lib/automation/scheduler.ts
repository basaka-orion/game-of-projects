/**
 * Scheduler — 定时自动化任务调度
 *
 * 支持的任务类型：
 * - research: 自动调研指定主题
 * - report: 生成项目报告
 * - memory-scan: 扫描最近活动提取记忆
 * - custom: 执行指定工作流
 */
import { CronExpressionParser } from 'cron-parser'
import { chatCompletion, getLLMConfig, type LLMConfig } from '../ai/provider'
import { query, run } from '../db/repository'
import { generateId } from '../db/schema'
import { dbSaveOperatingEvent } from '../db/repository'

export interface PlatformTarget {
  platform: 'telegram' | 'discord' | 'slack'
  targetId: string
  enabled: boolean
}

export type ScheduledTaskType =
  | 'research'
  | 'report'
  | 'memory-scan'
  | 'custom'
  | 'agent-task'
  | 'team-workflow'
  | 'openbasaka-nightly-maintenance'

export interface ScheduledTask {
  id: string
  name: string
  cronExpression: string
  taskType: ScheduledTaskType
  taskConfig: Record<string, string>
  lastRun: string
  nextRun: string
  enabled: boolean
  /** 关联的 Agent ID（用于 Soul 渲染推送消息） */
  agentId?: string
  /** 平台推送目标列表 */
  platformTargets?: PlatformTarget[]
}

export interface ScheduledTaskRunNowResult {
  success: boolean
  message: string
  logId?: string
  durationMs?: number
  delegatedToElectron?: boolean
}

/** 创建定时任务 */
export async function createScheduledTask(
  task: Omit<ScheduledTask, 'id' | 'lastRun' | 'nextRun'>
): Promise<string> {
  const id = 'task_' + generateId()
  await run(
    `INSERT INTO scheduled_tasks (id, name, cron_expression, task_type, task_config_json, last_run, next_run, enabled, agent_id, platform_config_json)
     VALUES (?, ?, ?, ?, ?, '', '', ?, ?, ?)`,
    [id, task.name, task.cronExpression, task.taskType, JSON.stringify(task.taskConfig),
     task.enabled ? 1 : 0, task.agentId || '', JSON.stringify(task.platformTargets || [])]
  )
  return id
}

/** 列出所有定时任务 */
export async function listScheduledTasks(): Promise<ScheduledTask[]> {
  try {
    const rows = await query<Record<string, unknown>>(
      'SELECT * FROM scheduled_tasks ORDER BY created_at DESC'
    )

    return rows.map(r => ({
      id: r.id as string,
      name: r.name as string,
      cronExpression: r.cron_expression as string,
      taskType: (r.task_type as string) as ScheduledTask['taskType'],
      taskConfig: JSON.parse((r.task_config_json as string) || '{}'),
      lastRun: (r.last_run as string) || '',
      nextRun: (r.next_run as string) || '',
      enabled: r.enabled === 1,
      agentId: (r.agent_id as string) || '',
      platformTargets: (() => { try { const v = JSON.parse((r.platform_config_json as string) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] } })(),
    }))
  } catch (err) {
    console.error('[scheduler] listScheduledTasks failed:', err)
    return []
  }
}

function canUseConfiguredModel(config: LLMConfig): boolean {
  return config.provider === 'ollama' || Boolean(config.apiKey)
}

function nextRunFromCron(cronExpression: string): string {
  try {
    return CronExpressionParser.parse(cronExpression).next().toDate().toISOString()
  } catch {
    return ''
  }
}

async function updateTaskRunMarkers(task: ScheduledTask): Promise<void> {
  const nextRun = nextRunFromCron(task.cronExpression)
  if (nextRun) {
    await run("UPDATE scheduled_tasks SET last_run = datetime('now','localtime'), next_run = ? WHERE id = ?", [
      nextRun,
      task.id,
    ])
    return
  }
  await run("UPDATE scheduled_tasks SET last_run = datetime('now','localtime') WHERE id = ?", [task.id])
}

async function writeCronExecutionLog(params: {
  logId: string
  task: ScheduledTask
  status: 'running' | 'success' | 'error'
  message: string
  durationMs: number
}): Promise<void> {
  await run(
    `INSERT OR REPLACE INTO cron_execution_log
     (id, task_id, task_name, task_type, status, message, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`,
    [
      params.logId,
      params.task.id,
      params.task.name,
      params.task.taskType,
      params.status,
      params.message,
      params.durationMs,
    ],
  )
}

async function writeRunNowEvent(task: ScheduledTask, success: boolean, message: string): Promise<void> {
  await dbSaveOperatingEvent({
    id: `op_scheduler_run_${task.id}_${Date.now()}`,
    type: 'agent_action',
    stage: 'execute',
    agentId: task.agentId || 'scheduler',
    title: `定时试跑｜${task.name}`,
    status: success ? 'completed' : 'failed',
    resultPreview: message.slice(0, 240),
    source: { kind: 'agent', sourceId: task.id, title: task.name },
    toolRefs: ['scheduled_tasks', 'cron_execution_log', task.taskType],
    entities: ['scheduler', task.taskType, success ? 'run-now-success' : 'run-now-error'],
    createdAt: new Date().toISOString(),
  }).catch(() => undefined)
}

async function runLocalReportTask(): Promise<string> {
  const [projects, memories, events] = await Promise.all([
    query<{ title: string; survival_rate: number; survival_grade: string }>(
      'SELECT title, survival_rate, survival_grade FROM projects ORDER BY created_at DESC LIMIT 5',
    ),
    query<{ category: string; content: string; confidence: number }>(
      'SELECT category, content, confidence FROM boss_memory ORDER BY confidence DESC, updated_at DESC LIMIT ?',
      [8],
    ),
    query<{ title: string; summary: string; created_at: string }>(
      'SELECT title, summary, created_at FROM operating_events ORDER BY created_at DESC LIMIT ?',
      [8],
    ),
  ])

  const lines = [
    `本地报告试跑完成：项目 ${projects.length} 个，Boss 记忆 ${memories.length} 条，操作事件 ${events.length} 条。`,
  ]
  if (projects[0]) lines.push(`最新项目：${projects[0].title}（${projects[0].survival_grade || projects[0].survival_rate || '-'}）`)
  if (memories[0]) lines.push(`高置信记忆：${memories[0].content.slice(0, 80)}`)
  if (events[0]) lines.push(`最近动作：${events[0].title} - ${(events[0].summary || '').slice(0, 80)}`)
  return lines.join('\n')
}

async function runLocalMemoryScanTask(): Promise<string> {
  const [bossMemories, memoryItems, triples] = await Promise.all([
    query<{ category: string; content: string; confidence: number }>(
      'SELECT category, content, confidence FROM boss_memory ORDER BY confidence DESC, updated_at DESC LIMIT ?',
      [30],
    ),
    query<{ content: string; importance: number; source: string; room_id: string }>(
      "SELECT content, importance, source, room_id FROM memory_items WHERE created_at > datetime('now', '-7 days') ORDER BY importance DESC LIMIT 30",
    ),
    query<{ cnt: number }>('SELECT COUNT(*) as cnt FROM knowledge_triples'),
  ])
  const source = [...bossMemories.map((item) => item.content), ...memoryItems.map((item) => item.content)].join('\n')
  const words = source
    .split(/[\s,，。.！!？?、；;：:]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && word.length <= 18)
  const freq = new Map<string, number>()
  for (const word of words) freq.set(word, (freq.get(word) || 0) + 1)
  const themes = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word)

  return [
    `记忆扫描试跑完成：Boss 记忆 ${bossMemories.length} 条，近 7 天记忆项 ${memoryItems.length} 条，知识三元组 ${triples[0]?.cnt || 0} 条。`,
    themes.length ? `高频主题：${themes.join('、')}` : '高频主题：暂未形成稳定重复信号。',
  ].join('\n')
}

async function runModelBackedTask(task: ScheduledTask, systemPrompt: string, userPrompt: string): Promise<string> {
  const config = getLLMConfig()
  if (!canUseConfiguredModel(config)) {
    throw new Error('当前未配置可用 LLM，不能真实试跑这个模型任务。请先在控制面板配置 API Key，或在 Electron 中使用本机 Ollama。')
  }
  const result = await chatCompletion(
    config,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    0.4,
    1200,
  )
  return result || `任务 ${task.name} 已调用模型，但没有返回可读内容。`
}

async function executeTaskInBrowserFallback(task: ScheduledTask): Promise<string> {
  if (task.taskType === 'report') return runLocalReportTask()
  if (task.taskType === 'memory-scan') return runLocalMemoryScanTask()

  if (task.taskType === 'custom') {
    const prompt = task.taskConfig.prompt || task.taskConfig.goal || task.name
    return runModelBackedTask(
      task,
      '你是 OpenBasaka 定时任务执行器。请直接完成这次自定义任务，并输出可保存的结果。',
      String(prompt),
    )
  }

  if (task.taskType === 'research') {
    const prompt = task.taskConfig.prompt || task.taskConfig.topic || task.name
    return runModelBackedTask(
      task,
      '你是 OpenBasaka 研究试跑器。当前没有 Electron 搜索委托时，请明确标注这是模型综合，不冒充实时搜索。',
      `请围绕这个主题给出一份 5 点研究试跑结果，并标注下一步需要补充的真实来源：${String(prompt)}`,
    )
  }

  throw new Error(`浏览器沙盘暂不能真实执行 ${task.taskType}。请在 Electron 定时引擎中试跑，或先把它转成 report / memory-scan / custom / research。`)
}

/** 立即试跑定时任务。Electron 中委托主进程；浏览器沙盘中执行可验证 fallback 并写入日志。 */
export async function runScheduledTaskNow(taskId: string): Promise<ScheduledTaskRunNowResult> {
  if (!taskId) return { success: false, message: 'missing_task_id' }

  if (typeof window !== 'undefined' && window.electronAPI?.cronRunNow) {
    const result = await window.electronAPI.cronRunNow(taskId)
    return {
      success: Boolean(result.success),
      message: result.success ? '已交给 Electron 定时引擎立即执行。' : result.error || 'Electron 定时引擎执行失败。',
      delegatedToElectron: true,
    }
  }

  const task = (await listScheduledTasks()).find((item) => item.id === taskId)
  if (!task) return { success: false, message: 'task_not_found' }

  const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const startedAt = Date.now()
  await writeCronExecutionLog({ logId, task, status: 'running', message: '浏览器沙盘立即试跑中', durationMs: 0 })

  try {
    const message = await executeTaskInBrowserFallback(task)
    const durationMs = Date.now() - startedAt
    await writeCronExecutionLog({ logId, task, status: 'success', message: message.slice(0, 500), durationMs })
    await updateTaskRunMarkers(task)
    await writeRunNowEvent(task, true, message)
    return { success: true, message, logId, durationMs, delegatedToElectron: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const durationMs = Date.now() - startedAt
    await writeCronExecutionLog({ logId, task, status: 'error', message, durationMs })
    await writeRunNowEvent(task, false, message)
    return { success: false, message, logId, durationMs, delegatedToElectron: false }
  }
}

/** 更新定时任务 */
export async function updateScheduledTask(id: string, updates: Partial<Pick<ScheduledTask, 'name' | 'enabled' | 'cronExpression' | 'taskConfig' | 'agentId' | 'platformTargets'>>): Promise<void> {
  const sets: string[] = []
  const values: unknown[] = []

  if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name) }
  if (updates.enabled !== undefined) { sets.push('enabled = ?'); values.push(updates.enabled ? 1 : 0) }
  if (updates.cronExpression !== undefined) { sets.push('cron_expression = ?'); values.push(updates.cronExpression) }
  if (updates.taskConfig !== undefined) { sets.push('task_config_json = ?'); values.push(JSON.stringify(updates.taskConfig)) }
  if (updates.agentId !== undefined) { sets.push('agent_id = ?'); values.push(updates.agentId) }
  if (updates.platformTargets !== undefined) { sets.push('platform_config_json = ?'); values.push(JSON.stringify(updates.platformTargets)) }

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
  await run(
    "UPDATE scheduled_tasks SET last_run = datetime('now','localtime') WHERE id = ?",
    [id]
  )
}
