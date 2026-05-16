import { useState, useEffect } from 'react'
import {
  listScheduledTasks,
  createScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  runScheduledTaskNow,
  ScheduledTask,
  PlatformTarget,
} from '../../../lib/automation/scheduler'
import { query } from '../../../lib/db/repository'
import { listAllAgents, AgentDefinition } from '../../../lib/agents/registry'

interface ExecutionLog {
  id: string
  task_id: string
  task_name: string
  task_type: string
  status: 'running' | 'success' | 'error'
  message: string
  duration_ms: number
  created_at: string
}

const TASK_TYPES = [
  { value: 'research', label: '调研', desc: '基于 Boss 偏好自动搜索外网' },
  { value: 'memory-scan', label: '记忆扫描', desc: '扫描记忆模式，发现知识缺口' },
  { value: 'report', label: '报告', desc: '生成近期活动摘要' },
  { value: 'custom', label: '自定义', desc: '执行自定义 Prompt' },
]

const CRON_PRESETS = [
  { label: '每 2 小时', value: '0 */2 * * *' },
  { label: '每 6 小时', value: '0 */6 * * *' },
  { label: '每天 9:00', value: '0 9 * * *' },
  { label: '每天 21:00', value: '0 21 * * *' },
  { label: '每周一 10:00', value: '0 10 * * 1' },
]

export default function SchedulerTab() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [logs, setLogs] = useState<ExecutionLog[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [runningTaskIds, setRunningTaskIds] = useState<Set<string>>(new Set())
  const [runNotice, setRunNotice] = useState('')

  // 新任务表单
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<'research' | 'report' | 'memory-scan' | 'custom'>('research')
  const [newCron, setNewCron] = useState('0 */2 * * *')
  const [newPrompt, setNewPrompt] = useState('')
  const [newAgentId, setNewAgentId] = useState('')
  const [newTelegramTarget, setNewTelegramTarget] = useState('')
  const [newTelegramEnabled, setNewTelegramEnabled] = useState(false)

  // Agent 列表
  const [agents, setAgents] = useState<AgentDefinition[]>([])

  useEffect(() => { loadTasks(); loadAgents() }, [])

  async function loadAgents() {
    try {
      const list = await listAllAgents()
      setAgents(list)
    } catch (err) {
      console.error('[SchedulerTab] loadAgents failed:', err)
    }
  }
  useEffect(() => { if (showLogs) loadLogs() }, [showLogs])

  async function loadTasks() {
    try {
      const list = await listScheduledTasks()
      setTasks(list)
    } catch (err) {
      console.error('[SchedulerTab] loadTasks failed:', err)
    }
  }

  async function loadLogs() {
    try {
      const rows = await query<ExecutionLog>(
        'SELECT * FROM cron_execution_log ORDER BY created_at DESC LIMIT 50'
      )
      setLogs(rows)
    } catch (err) {
      console.error('[SchedulerTab] loadLogs failed:', err)
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return

    const platformTargets: PlatformTarget[] = []
    if (newTelegramEnabled && newTelegramTarget.trim()) {
      platformTargets.push({
        platform: 'telegram',
        targetId: newTelegramTarget.trim(),
        enabled: true,
      })
    }

    await createScheduledTask({
      name: newName.trim(),
      cronExpression: newCron,
      taskType: newType,
      taskConfig: newType === 'custom' ? { prompt: newPrompt } : {},
      enabled: true,
      agentId: newAgentId || undefined,
      platformTargets: platformTargets.length > 0 ? platformTargets : undefined,
    })
    setShowCreate(false)
    setNewName('')
    setNewPrompt('')
    setNewAgentId('')
    setNewTelegramTarget('')
    setNewTelegramEnabled(false)
    loadTasks()
  }

  async function handleToggle(task: ScheduledTask) {
    await updateScheduledTask(task.id, { enabled: !task.enabled })
    loadTasks()
  }

  async function handleRunNow(task: ScheduledTask) {
    if (runningTaskIds.has(task.id)) return
    setRunningTaskIds(prev => new Set(prev).add(task.id))
    setRunNotice(`正在试跑「${task.name}」...`)
    try {
      const result = await runScheduledTaskNow(task.id)
      setRunNotice(`${result.success ? '试跑完成' : '试跑受阻'}：${result.message.slice(0, 180)}`)
      await Promise.all([loadTasks(), loadLogs()])
      if (!showLogs) setShowLogs(true)
    } catch (err) {
      setRunNotice(`试跑失败：${err instanceof Error ? err.message : String(err)}`)
      await loadLogs()
    } finally {
      setRunningTaskIds(prev => {
        const next = new Set(prev)
        next.delete(task.id)
        return next
      })
    }
  }

  async function handleDelete(id: string) {
    await deleteScheduledTask(id)
    loadTasks()
  }

  function formatTime(t: string) {
    if (!t) return '-'
    try { return new Date(t).toLocaleString('zh-CN') } catch { return t }
  }

  function statusColor(s: string) {
    if (s === 'success') return 'var(--hd-success, #4caf50)'
    if (s === 'error') return 'var(--hd-error, #f44336)'
    return 'var(--hd-warning, #ff9800)'
  }

  return (
    <div className="sandbox-map__tab" style={{ padding: 'var(--hd-space-lg)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--hd-space-md)' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>定时任务 (Morofish)</h3>
        <div style={{ display: 'flex', gap: 'var(--hd-space-sm)' }}>
          <button
            className="sandbox-map__btn"
            onClick={() => setShowLogs(!showLogs)}
          >
            {showLogs ? '任务列表' : '执行日志'}
          </button>
          <button
            className="sandbox-map__btn sandbox-map__btn--primary"
            onClick={() => setShowCreate(true)}
          >
            + 新建任务
          </button>
        </div>
      </div>

      {runNotice && (
        <div className="sandbox-map__card" style={{ padding: 'var(--hd-space-sm)', marginBottom: 'var(--hd-space-sm)', color: 'var(--hd-text-secondary)' }}>
          {runNotice}
        </div>
      )}

      {/* 执行日志视图 */}
      {showLogs ? (
        <div>
          {logs.length === 0 ? (
            <div style={{ color: 'var(--hd-text-muted)', textAlign: 'center', padding: 40 }}>
              暂无执行日志
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hd-space-xs)' }}>
              {logs.map(log => (
                <div key={log.id} className="sandbox-map__memory-item" style={{ fontSize: '0.8rem' }}>
                  <span style={{ color: statusColor(log.status), fontWeight: 600, minWidth: 50 }}>
                    {log.status === 'success' ? 'OK' : log.status === 'error' ? 'ERR' : '...'}
                  </span>
                  <span style={{ flex: 1, color: 'var(--hd-text-secondary)' }}>
                    {log.task_name} ({log.task_type})
                  </span>
                  {log.duration_ms > 0 && (
                    <span style={{ color: 'var(--hd-text-muted)', fontSize: '0.7rem' }}>
                      {log.duration_ms >= 1000 ? `${(log.duration_ms / 1000).toFixed(1)}s` : `${log.duration_ms}ms`}
                    </span>
                  )}
                  <span style={{ color: 'var(--hd-text-muted)', fontSize: '0.7rem', marginLeft: 8 }}>
                    {formatTime(log.created_at)}
                  </span>
                  {log.message && (
                    <span style={{ color: 'var(--hd-error)', fontSize: '0.7rem', marginLeft: 8, maxWidth: 200 }} title={log.message}>
                      {log.message.slice(0, 50)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* 任务列表 */}
          {tasks.length === 0 && !showCreate ? (
            <div style={{ color: 'var(--hd-text-muted)', textAlign: 'center', padding: 40 }}>
              暂无定时任务。点击"新建任务"配置 Morofish 深潜引擎。
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hd-space-sm)' }}>
              {tasks.map(task => (
                <div key={task.id} className="sandbox-map__card" style={{ padding: 'var(--hd-space-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{task.name}</span>
                      <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'var(--hd-text-muted)' }}>
                        {TASK_TYPES.find(t => t.value === task.taskType)?.label || task.taskType}
                      </span>
                      {!task.enabled && (
                        <span style={{ marginLeft: 8, fontSize: '0.7rem', color: 'var(--hd-text-muted)', opacity: 0.6 }}>
                          (已禁用)
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="sandbox-map__memory-del-btn"
                        style={{ fontSize: '0.7rem', color: 'var(--hd-accent)' }}
                        onClick={() => handleRunNow(task)}
                        disabled={runningTaskIds.has(task.id)}
                      >
                        {runningTaskIds.has(task.id) ? '试跑中' : '试跑'}
                      </button>
                      <button
                        className="sandbox-map__memory-del-btn"
                        style={{ fontSize: '0.7rem', color: task.enabled ? 'var(--hd-success)' : 'var(--hd-text-muted)' }}
                        onClick={() => handleToggle(task)}
                      >
                        {task.enabled ? 'ON' : 'OFF'}
                      </button>
                      <button
                        className="sandbox-map__memory-del-btn"
                        style={{ fontSize: '0.7rem', color: 'var(--hd-error)' }}
                        onClick={() => handleDelete(task.id)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--hd-text-muted)' }}>
                    Cron: <code style={{ background: 'var(--hd-bg-hover)', padding: '1px 6px', borderRadius: 3 }}>{task.cronExpression}</code>
                    {' | '}上次: {formatTime(task.lastRun)}
                    {' | '}下次: {formatTime(task.nextRun)}
                    {task.agentId && (
                      <span style={{ marginLeft: 8 }}>
                        {'| '}Agent: {agents.find(a => a.id === task.agentId)?.name || task.agentId}
                      </span>
                    )}
                    {(Array.isArray(task.platformTargets) && task.platformTargets.filter(p => p.enabled).length > 0) && (
                      <span style={{ marginLeft: 8 }}>
                        {'| '}推送: {task.platformTargets!.filter(p => p.enabled).map(p => p.platform).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 新建任务表单 */}
          {showCreate && (
            <div className="sandbox-map__card" style={{ padding: 'var(--hd-space-md)', marginTop: 'var(--hd-space-md)' }}>
              <h4 style={{ margin: '0 0 var(--hd-space-sm) 0', fontSize: '0.95rem' }}>新建定时任务</h4>

              <div style={{ marginBottom: 'var(--hd-space-sm)' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--hd-text-secondary)', display: 'block', marginBottom: 4 }}>
                  任务名称
                </label>
                <input
                  className="sandbox-map__input"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="例: 自动调研 AI 趋势"
                />
              </div>

              <div style={{ marginBottom: 'var(--hd-space-sm)' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--hd-text-secondary)', display: 'block', marginBottom: 4 }}>
                  任务类型
                </label>
                <div style={{ display: 'flex', gap: 'var(--hd-space-xs)' }}>
                  {TASK_TYPES.map(t => (
                    <button
                      key={t.value}
                      className="sandbox-map__btn"
                      style={{
                        fontSize: '0.75rem',
                        background: newType === t.value ? 'var(--hd-accent)' : undefined,
                        color: newType === t.value ? '#fff' : undefined,
                      }}
                      onClick={() => setNewType(t.value as typeof newType)}
                      title={t.desc}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 'var(--hd-space-sm)' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--hd-text-secondary)', display: 'block', marginBottom: 4 }}>
                  执行频率
                </label>
                <div style={{ display: 'flex', gap: 'var(--hd-space-xs)', flexWrap: 'wrap' }}>
                  {CRON_PRESETS.map(p => (
                    <button
                      key={p.value}
                      className="sandbox-map__btn"
                      style={{
                        fontSize: '0.7rem',
                        background: newCron === p.value ? 'var(--hd-accent)' : undefined,
                        color: newCron === p.value ? '#fff' : undefined,
                      }}
                      onClick={() => setNewCron(p.value)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <input
                  className="sandbox-map__input"
                  value={newCron}
                  onChange={e => setNewCron(e.target.value)}
                  placeholder="Cron 表达式"
                  style={{ marginTop: 4 }}
                />
              </div>

              {newType === 'custom' && (
                <div style={{ marginBottom: 'var(--hd-space-sm)' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--hd-text-secondary)', display: 'block', marginBottom: 4 }}>
                    自定义 Prompt
                  </label>
                  <textarea
                    className="sandbox-map__input"
                    value={newPrompt}
                    onChange={e => setNewPrompt(e.target.value)}
                    placeholder="输入自定义任务要执行的 Prompt..."
                    rows={3}
                  />
                </div>
              )}

              {/* Agent 关联 */}
              <div style={{ marginBottom: 'var(--hd-space-sm)' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--hd-text-secondary)', display: 'block', marginBottom: 4 }}>
                  关联 Agent（可选，用 Agent 角色渲染推送消息）
                </label>
                <select
                  className="sandbox-map__input"
                  value={newAgentId}
                  onChange={e => setNewAgentId(e.target.value)}
                  style={{ fontSize: '0.85rem' }}
                >
                  <option value="">-- 不关联 --</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
                  ))}
                </select>
              </div>

              {/* Telegram 推送 */}
              <div style={{ marginBottom: 'var(--hd-space-sm)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--hd-text-secondary)', marginBottom: 4 }}>
                  <input type="checkbox" checked={newTelegramEnabled} onChange={e => setNewTelegramEnabled(e.target.checked)} />
                  推送到 Telegram
                </label>
                {newTelegramEnabled && (
                  <input
                    className="sandbox-map__input"
                    value={newTelegramTarget}
                    onChange={e => setNewTelegramTarget(e.target.value)}
                    placeholder="Telegram Chat ID"
                    style={{ marginTop: 4, fontSize: '0.85rem' }}
                  />
                )}
              </div>

              <div style={{ display: 'flex', gap: 'var(--hd-space-sm)', marginTop: 'var(--hd-space-sm)' }}>
                <button className="sandbox-map__btn sandbox-map__btn--primary" onClick={handleCreate}>
                  创建
                </button>
                <button className="sandbox-map__btn" onClick={() => setShowCreate(false)}>
                  取消
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
