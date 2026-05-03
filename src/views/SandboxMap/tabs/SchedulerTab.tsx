import { useState, useEffect } from 'react'
import {
  listScheduledTasks,
  createScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  ScheduledTask,
  PlatformTarget,
} from '../../../lib/automation/scheduler'
import { query } from '../../../lib/db/repository'
import { listAllAgents, AgentDefinition } from '../../../lib/agents/registry'
import { buildUiMuseumPrdContext } from '../../../lib/ui-museum/context'
import {
  findDefaultTeamWorkflow,
  listWorkflowCatalog,
  WorkflowCatalogItem,
} from '../../../lib/workflow/registry'
import './SchedulerTab.css'

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

const TASK_TYPES: Array<{ value: ScheduledTask['taskType']; label: string; desc: string }> = [
  { value: 'research', label: '调研', desc: '基于 Boss 偏好自动搜索外网' },
  { value: 'memory-scan', label: '记忆扫描', desc: '扫描记忆模式，发现知识缺口' },
  { value: 'report', label: '报告', desc: '生成近期活动摘要' },
  { value: 'custom', label: '自定义', desc: '执行自定义 Prompt' },
  { value: 'agent-task', label: 'Agent任务', desc: '完整 Agent 栈执行任务' },
  { value: 'team-workflow', label: '群策工作流', desc: '调用多角色团队完成 PRD、调研或自动化流程' },
]

const CRON_PRESETS = [
  { label: '每 2 小时', value: '0 */2 * * *' },
  { label: '每 6 小时', value: '0 */6 * * *' },
  { label: '每天 9:00', value: '0 9 * * *' },
  { label: '每天 21:00', value: '0 21 * * *' },
  { label: '每周一 10:00', value: '0 10 * * 1' },
]

function normalizeScheduleInput(value: string): string {
  const text = value.trim()
  const daily = text.match(/^(?:每天\s*)?(\d{1,2})[:：](\d{1,2})$/)
  if (daily) {
    const hour = Math.max(0, Math.min(23, Number(daily[1])))
    const minute = Math.max(0, Math.min(59, Number(daily[2])))
    return `${minute} ${hour} * * *`
  }
  return text
}

export default function SchedulerTab() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [logs, setLogs] = useState<ExecutionLog[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [runningTaskId, setRunningTaskId] = useState('')
  const [runNotice, setRunNotice] = useState('')
  const [editingTaskId, setEditingTaskId] = useState('')
  const [knownTelegramChatIds, setKnownTelegramChatIds] = useState<string[]>([])

  // 新任务表单
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<ScheduledTask['taskType']>('research')
  const [newCron, setNewCron] = useState('0 */2 * * *')
  const [newPrompt, setNewPrompt] = useState('')
  const [newAgentId, setNewAgentId] = useState('')
  const [newWorkflowId, setNewWorkflowId] = useState('')
  const [newTelegramTarget, setNewTelegramTarget] = useState('')
  const [newTelegramEnabled, setNewTelegramEnabled] = useState(false)

  // Agent 列表
  const [agents, setAgents] = useState<AgentDefinition[]>([])
  const [workflowCatalog, setWorkflowCatalog] = useState<WorkflowCatalogItem[]>([])
  const enabledCount = tasks.filter((task) => task.enabled).length
  const telegramTaskCount = tasks.filter((task) =>
    Array.isArray(task.platformTargets) && task.platformTargets.some((target) => target.enabled && target.platform === 'telegram'),
  ).length
  const agentTaskCount = tasks.filter((task) => task.agentId).length
  const teamWorkflowTaskCount = tasks.filter((task) => task.taskType === 'team-workflow').length

  useEffect(() => {
    loadTasks()
    loadAgents()
    loadWorkflows()
    loadTelegramTargets()
  }, [])

  async function loadAgents() {
    try {
      const list = await listAllAgents()
      setAgents(list)
    } catch (err) {
      console.error('[SchedulerTab] loadAgents failed:', err)
    }
  }

  async function loadWorkflows() {
    try {
      const list = await listWorkflowCatalog()
      setWorkflowCatalog(list)
      if (!newWorkflowId) {
        const defaultWorkflow = findDefaultTeamWorkflow(list)
        if (defaultWorkflow) setNewWorkflowId(defaultWorkflow.id)
      }
    } catch (err) {
      console.error('[SchedulerTab] loadWorkflows failed:', err)
    }
  }
  useEffect(() => {
    if (showLogs) loadLogs()
  }, [showLogs])

  async function loadTasks() {
    try {
      const list = await listScheduledTasks()
      setTasks(list)
    } catch (err) {
      console.error('[SchedulerTab] loadTasks failed:', err)
    }
  }

  async function loadTelegramTargets() {
    try {
      const rows = await query<{ value: string }>("SELECT value FROM settings WHERE key = 'telegram_chat_ids'")
      const ids = (rows[0]?.value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
      setKnownTelegramChatIds(ids)
      if (!newTelegramTarget && ids[0]) setNewTelegramTarget(ids[0])
    } catch {
      setKnownTelegramChatIds([])
    }
  }

  async function loadLogs() {
    try {
      const rows = await query<ExecutionLog>('SELECT * FROM cron_execution_log ORDER BY created_at DESC LIMIT 50')
      setLogs(rows)
    } catch (err) {
      console.error('[SchedulerTab] loadLogs failed:', err)
    }
  }

  function resetTaskForm() {
    setShowCreate(false)
    setEditingTaskId('')
    setNewName('')
    setNewType('research')
    setNewCron('0 */2 * * *')
    setNewPrompt('')
    setNewAgentId('')
    setNewWorkflowId(findDefaultTeamWorkflow(workflowCatalog)?.id || '')
    setNewTelegramTarget(knownTelegramChatIds[0] || '')
    setNewTelegramEnabled(false)
  }

  function buildPlatformTargets(): PlatformTarget[] {
    if (!newTelegramEnabled) return []
    return [
      {
        platform: 'telegram',
        targetId: newTelegramTarget.trim() || knownTelegramChatIds[0] || 'default',
        enabled: true,
      },
    ]
  }

  function buildTaskConfig(): Record<string, string> {
    const taskText = newPrompt.trim() || newName.trim()
    if (newType === 'team-workflow') {
      const selectedWorkflow = workflowCatalog.find((item) => item.id === newWorkflowId)
      const uiStyleContext = buildUiMuseumPrdContext(`${newName}\n${taskText}\n${selectedWorkflow?.label || ''}\n${selectedWorkflow?.summary || ''}`)
      const visualTaskText = taskText.includes('## UI风格馆自动视觉输入')
        ? taskText
        : `${taskText}\n\n${uiStyleContext.promptFragment}`.trim()
      if (selectedWorkflow?.source === 'studio' || selectedWorkflow?.source === 'team') {
        return {
          prompt: visualTaskText,
          goal: visualTaskText,
          workflowCatalogId: selectedWorkflow.id,
          workflowSource: selectedWorkflow.source,
          workflowId: selectedWorkflow.sourceId,
          studioWorkflowId: selectedWorkflow.source === 'studio' ? selectedWorkflow.sourceId : '',
          teamId: selectedWorkflow.teamId || selectedWorkflow.sourceId,
          teamName: selectedWorkflow.teamName || selectedWorkflow.label,
          workflowType: selectedWorkflow.workflowType || 'custom',
          workflowLabel: selectedWorkflow.label,
          artifactLabel: selectedWorkflow.artifactLabel,
          uiStyleStyleIds: uiStyleContext.styleIds.join(','),
          uiStyleStyleNames: uiStyleContext.styleNames.join(' / '),
          uiStyleReasoning: uiStyleContext.reasoning,
          uiStyleVisualJson: JSON.stringify(uiStyleContext.visual),
          uiStyleComponentStates: uiStyleContext.componentStates.join('\n'),
          uiStyleAcceptanceChecklist: uiStyleContext.acceptanceChecklist.join('\n'),
          pushAgentId: newAgentId || 'general',
        }
      }
      return {
        prompt: visualTaskText,
        goal: visualTaskText,
        workflowCatalogId: selectedWorkflow?.id || '',
        workflowSource: selectedWorkflow?.source || 'studio',
        workflowLabel: selectedWorkflow?.label || '群策工作流',
        workflowType: selectedWorkflow?.workflowType || 'custom',
        uiStyleStyleIds: uiStyleContext.styleIds.join(','),
        uiStyleStyleNames: uiStyleContext.styleNames.join(' / '),
        uiStyleReasoning: uiStyleContext.reasoning,
        uiStyleVisualJson: JSON.stringify(uiStyleContext.visual),
        uiStyleComponentStates: uiStyleContext.componentStates.join('\n'),
        uiStyleAcceptanceChecklist: uiStyleContext.acceptanceChecklist.join('\n'),
        pushAgentId: newAgentId || 'general',
      }
    }
    if (newType === 'custom' || newType === 'agent-task') {
      return { prompt: taskText, goal: taskText }
    }
    if (newType === 'research') return { topic: taskText, goal: taskText }
    return {}
  }

  async function handleSaveTask() {
    if (!newName.trim()) return

    const platformTargets = buildPlatformTargets()
    const payload = {
      name: newName.trim(),
      cronExpression: normalizeScheduleInput(newCron),
      taskType: newType,
      taskConfig: buildTaskConfig(),
      enabled: editingTaskId ? tasks.find((task) => task.id === editingTaskId)?.enabled ?? false : false,
      agentId: newType === 'team-workflow' ? undefined : newAgentId || undefined,
      platformTargets: platformTargets.length > 0 ? platformTargets : undefined,
    }

    if (editingTaskId) {
      await updateScheduledTask(editingTaskId, payload)
      setRunNotice(`已更新：${payload.name}。建议先试跑，再开启。`)
    } else {
      await createScheduledTask(payload)
      setRunNotice(`已创建：${payload.name}。默认保持 OFF，试跑满意后再开启。`)
    }
    resetTaskForm()
    await loadTasks()
  }

  async function handleToggle(task: ScheduledTask) {
    await updateScheduledTask(task.id, { enabled: !task.enabled })
    loadTasks()
  }

  async function handleDelete(id: string) {
    await deleteScheduledTask(id)
    loadTasks()
  }

  function beginEditTask(task: ScheduledTask) {
    setEditingTaskId(task.id)
    setShowCreate(true)
    setShowLogs(false)
    setNewName(task.name)
    setNewType(task.taskType)
    setNewCron(task.cronExpression)
    setNewPrompt(String(task.taskConfig.prompt || task.taskConfig.goal || task.taskConfig.topic || ''))
    setNewAgentId(task.agentId || '')
    setNewWorkflowId(String(task.taskConfig.workflowCatalogId || (task.taskConfig.teamId ? `team:${task.taskConfig.teamId}` : '')))
    const telegramTarget = (task.platformTargets || []).find((target) => target.platform === 'telegram')
    setNewTelegramEnabled(Boolean(telegramTarget?.enabled))
    setNewTelegramTarget(telegramTarget?.targetId || knownTelegramChatIds[0] || '')
  }

  async function handleRunNow(task: ScheduledTask) {
    const electronAPI = window.electronAPI
    if (!electronAPI?.cronRunNow) {
      setRunNotice('当前环境不支持立即试跑')
      return
    }

    setRunningTaskId(task.id)
    setRunNotice(`正在试跑：${task.name}`)
    try {
      const result = await electronAPI.cronRunNow(task.id)
      setRunNotice(result.success ? `试跑完成：${task.name}` : `试跑失败：${result.error || 'unknown'}`)
      await Promise.all([loadTasks(), loadLogs()])
      setShowLogs(true)
    } catch (err) {
      setRunNotice(`试跑失败：${String(err)}`)
    } finally {
      setRunningTaskId('')
    }
  }

  function formatTime(t: string) {
    if (!t) return '-'
    try {
      return new Date(t).toLocaleString('zh-CN')
    } catch {
      return t
    }
  }

  function statusColor(s: string) {
    if (s === 'success') return 'var(--hd-success, #4caf50)'
    if (s === 'error') return 'var(--hd-error, #f44336)'
    return 'var(--hd-warning, #ff9800)'
  }

  return (
    <div className="scheduler-tab">
      <div className="scheduler-tab__header">
        <div>
          <div className="scheduler-tab__eyebrow">Morofish Cron</div>
          <h3 className="scheduler-tab__title">定时任务</h3>
          <div className="scheduler-tab__subtitle">让 Agent 在固定时间做事，并把结果推回 Openbasaka 或 Telegram。</div>
        </div>
        <div className="scheduler-tab__header-actions">
          <button className="sandbox-map__btn" onClick={() => setShowLogs(!showLogs)}>
            {showLogs ? '任务列表' : '执行日志'}
          </button>
          <button
            className="sandbox-map__btn sandbox-map__btn--primary"
            onClick={() => {
              resetTaskForm()
              setShowCreate(true)
            }}
          >
            + 新建任务
          </button>
        </div>
      </div>

      <div className="scheduler-tab__overview">
        <div className="scheduler-tab__metric">
          <span>任务总数</span>
          <strong>{tasks.length}</strong>
          <small>{enabledCount} 个正在运行</small>
        </div>
        <div className="scheduler-tab__metric">
          <span>Agent 联动</span>
          <strong>{agentTaskCount + teamWorkflowTaskCount}</strong>
          <small>{teamWorkflowTaskCount} 个群策工作流，{agentTaskCount} 个单 Agent</small>
        </div>
        <div className="scheduler-tab__metric">
          <span>Telegram</span>
          <strong>{telegramTaskCount}</strong>
          <small>{knownTelegramChatIds.length > 0 ? `${knownTelegramChatIds.length} 个已知会话` : '等待连接目标'}</small>
        </div>
        <div className="scheduler-tab__metric scheduler-tab__metric--notice">
          <span>现在最该看</span>
          <strong>{showLogs ? '执行结果' : '任务卡片'}</strong>
          <small>{showLogs ? '失败原因和推送回执会在这里出现' : '试跑、编辑、开关都在每张卡右侧'}</small>
        </div>
      </div>

      {/* 执行日志视图 */}
      {showLogs ? (
        <div>
          {runNotice && (
            <div className="scheduler-tab__notice">{runNotice}</div>
          )}
          {logs.length === 0 ? (
            <div className="scheduler-tab__empty">暂无执行日志。先试跑一个任务，这里会出现真实回执。</div>
          ) : (
            <div className="scheduler-tab__log-list">
              {logs.map((log) => (
                <div key={log.id} className="scheduler-tab__log-row">
                  <span className="scheduler-tab__log-status" style={{ color: statusColor(log.status) }}>
                    {log.status === 'success' ? 'OK' : log.status === 'error' ? 'ERR' : '...'}
                  </span>
                  <span className="scheduler-tab__log-name">
                    {log.task_name} ({log.task_type})
                  </span>
                  {log.duration_ms > 0 && (
                    <span className="scheduler-tab__log-meta">
                      {log.duration_ms >= 1000 ? `${(log.duration_ms / 1000).toFixed(1)}s` : `${log.duration_ms}ms`}
                    </span>
                  )}
                  <span className="scheduler-tab__log-meta">{formatTime(log.created_at)}</span>
                  {log.message && (
                    <span className="scheduler-tab__log-error" title={log.message}>
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
          {runNotice && (
            <div className="scheduler-tab__notice">{runNotice}</div>
          )}
          {/* 任务列表 */}
          {tasks.length === 0 && !showCreate ? (
            <div className="scheduler-tab__empty">暂无定时任务。点击“新建任务”，先做一个可试跑、可推送的每日小任务。</div>
          ) : (
            <div className="scheduler-tab__task-list">
              {tasks.map((task) => (
                <div key={task.id} className={`scheduler-tab__task-card ${task.enabled ? '' : 'scheduler-tab__task-card--off'}`}>
                  <div className="scheduler-tab__task-head">
                    <div className="scheduler-tab__task-main">
                      <div className="scheduler-tab__task-title-row">
                        <span className="scheduler-tab__task-title">{task.name}</span>
                        <span className="scheduler-tab__task-type">{TASK_TYPES.find((t) => t.value === task.taskType)?.label || task.taskType}</span>
                        <span className={`scheduler-tab__task-switch ${task.enabled ? 'scheduler-tab__task-switch--on' : ''}`}>
                          {task.enabled ? 'ON' : 'OFF'}
                        </span>
                      </div>
                      <div className="scheduler-tab__task-purpose">
                        {task.taskType === 'team-workflow'
                          ? `${String(task.taskConfig.workflowLabel || '群策工作流')}｜${String(task.taskConfig.prompt || task.taskConfig.goal || '按计划执行')}`
                          : String(task.taskConfig.prompt || task.taskConfig.goal || task.taskConfig.topic || TASK_TYPES.find((t) => t.value === task.taskType)?.desc || '按计划执行')}
                      </div>
                    </div>
                    <div className="scheduler-tab__task-actions">
                      <button
                        className="sandbox-map__memory-del-btn"
                        onClick={() => handleToggle(task)}
                      >
                        {task.enabled ? '暂停' : '开启'}
                      </button>
                      <button
                        className="sandbox-map__memory-del-btn"
                        disabled={runningTaskId === task.id}
                        onClick={() => handleRunNow(task)}
                      >
                        {runningTaskId === task.id ? '运行中' : '试跑'}
                      </button>
                      <button
                        className="sandbox-map__memory-del-btn"
                        onClick={() => beginEditTask(task)}
                      >
                        编辑
                      </button>
                      <button
                        className="sandbox-map__memory-del-btn"
                        onClick={() => handleDelete(task.id)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  <div className="scheduler-tab__task-grid">
                    <div><span>Cron</span><strong>{task.cronExpression}</strong></div>
                    <div><span>上次</span><strong>{formatTime(task.lastRun)}</strong></div>
                    <div><span>下次</span><strong>{formatTime(task.nextRun)}</strong></div>
                    <div>
                      <span>{task.taskType === 'team-workflow' ? '执行者' : 'Agent'}</span>
                      <strong>
                        {task.taskType === 'team-workflow'
                          ? String(task.taskConfig.teamName || task.taskConfig.workflowLabel || '群策团队')
                          : task.agentId ? agents.find((a) => a.id === task.agentId)?.name || task.agentId : '默认'}
                      </strong>
                    </div>
                    <div>
                      <span>推送</span>
                      <strong>
                        {Array.isArray(task.platformTargets) && task.platformTargets.filter((p) => p.enabled).length > 0
                          ? task.platformTargets.filter((p) => p.enabled).map((p) => p.platform).join(', ')
                          : '仅应用内'}
                      </strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 新建任务表单 */}
          {showCreate && (
            <div
              className="sandbox-map__card"
              style={{ padding: 'var(--hd-space-md)', marginTop: 'var(--hd-space-md)' }}
            >
              <h4 style={{ margin: '0 0 var(--hd-space-sm) 0', fontSize: '0.95rem' }}>
                {editingTaskId ? '编辑定时任务' : '新建定时任务'}
              </h4>

              <div className="scheduler-tab__form-guide">
                <div className="scheduler-tab__form-step scheduler-tab__form-step--active">
                  <span>1</span>
                  <strong>写清楚任务</strong>
                  <small>名称和 Prompt 决定 Agent 到底做什么。</small>
                </div>
                <div className="scheduler-tab__form-step">
                  <span>2</span>
                  <strong>选触发时间</strong>
                  <small>可以写每天 17:00，也可以用 Cron。</small>
                </div>
                <div className="scheduler-tab__form-step">
                  <span>3</span>
                  <strong>先试跑再开启</strong>
                  <small>OFF 状态也能试跑；满意后再打开定时。</small>
                </div>
              </div>

              <div style={{ marginBottom: 'var(--hd-space-sm)' }}>
                <label
                  style={{ fontSize: '0.8rem', color: 'var(--hd-text-secondary)', display: 'block', marginBottom: 4 }}
                >
                  任务名称
                </label>
                <input
                  className="sandbox-map__input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例: 自动调研 AI 趋势"
                />
              </div>

              <div style={{ marginBottom: 'var(--hd-space-sm)' }}>
                <label
                  style={{ fontSize: '0.8rem', color: 'var(--hd-text-secondary)', display: 'block', marginBottom: 4 }}
                >
                  任务类型
                </label>
                <div className="scheduler-tab__type-picker">
                  {TASK_TYPES.map((t) => (
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

              {newType === 'team-workflow' && (
                <div className="scheduler-tab__workflow-picker">
                  <div className="scheduler-tab__workflow-picker-head">
                    <div>
                      <div className="scheduler-tab__field-label">选择群策工作流</div>
                      <div className="scheduler-tab__field-help">定时任务会把你的 Prompt 交给整支团队执行，而不是只找单个 Agent。</div>
                    </div>
                    <button type="button" className="sandbox-map__btn" onClick={loadWorkflows}>
                      刷新
                    </button>
                  </div>
                  {workflowCatalog.filter((item) => item.source === 'studio').length === 0 ? (
                    <div className="scheduler-tab__workflow-empty">还没有工作流工坊产出的工作流。先去「工作流」定义并试跑，再回来设置定时。</div>
                  ) : (
                    <div className="scheduler-tab__workflow-options">
                      {workflowCatalog
                        .filter((item) => item.source === 'studio')
                        .map((workflow) => (
                          <button
                            key={workflow.id}
                            type="button"
                            className={`scheduler-tab__workflow-option ${newWorkflowId === workflow.id ? 'scheduler-tab__workflow-option--active' : ''}`}
                            onClick={() => setNewWorkflowId(workflow.id)}
                          >
                            <strong>{workflow.label}</strong>
                            <span>{workflow.summary}</span>
                            <small>{workflow.artifactLabel} · {workflow.capabilities.join(' / ') || '群策协作'}</small>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginBottom: 'var(--hd-space-sm)' }}>
                <label
                  style={{ fontSize: '0.8rem', color: 'var(--hd-text-secondary)', display: 'block', marginBottom: 4 }}
                >
                  执行频率
                </label>
                <div style={{ display: 'flex', gap: 'var(--hd-space-xs)', flexWrap: 'wrap' }}>
                  {CRON_PRESETS.map((p) => (
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
                  onChange={(e) => setNewCron(e.target.value)}
                  placeholder="Cron 表达式"
                  style={{ marginTop: 4 }}
                />
              </div>

              {(newType === 'custom' || newType === 'agent-task' || newType === 'research' || newType === 'team-workflow') && (
                <div style={{ marginBottom: 'var(--hd-space-sm)' }}>
                  <label
                    style={{ fontSize: '0.8rem', color: 'var(--hd-text-secondary)', display: 'block', marginBottom: 4 }}
                  >
                    {newType === 'research' ? '调研主题 / 方向' : newType === 'team-workflow' ? '交给群策团队的任务' : '任务 Prompt'}
                  </label>
                  <textarea
                    className="sandbox-map__input"
                    value={newPrompt}
                    onChange={(e) => setNewPrompt(e.target.value)}
                    placeholder={newType === 'team-workflow' ? '例：每天早上用群策团队做一份 AI 产品机会日报，最后输出可归档报告。' : '输入任务要执行的内容...'}
                    rows={newType === 'team-workflow' ? 5 : 3}
                  />
                </div>
              )}

              {/* Agent 关联 */}
              <div style={{ marginBottom: 'var(--hd-space-sm)' }}>
                <label
                  style={{ fontSize: '0.8rem', color: 'var(--hd-text-secondary)', display: 'block', marginBottom: 4 }}
                >
                  {newType === 'team-workflow' ? '推送身份（可选，只决定 Telegram 用哪个 Bot 发结果）' : '关联 Agent（可选，用 Agent 角色渲染推送消息）'}
                </label>
                <select
                  className="sandbox-map__input"
                  value={newAgentId}
                  onChange={(e) => setNewAgentId(e.target.value)}
                  style={{ fontSize: '0.85rem' }}
                >
                  <option value="">-- 不关联 --</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.icon} {a.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Telegram 推送 */}
              <div style={{ marginBottom: 'var(--hd-space-sm)' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.8rem',
                    color: 'var(--hd-text-secondary)',
                    marginBottom: 4,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={newTelegramEnabled}
                    onChange={(e) => setNewTelegramEnabled(e.target.checked)}
                  />
                  推送到 Telegram
                </label>
                {newTelegramEnabled && (
                  <>
                    <input
                      className="sandbox-map__input"
                      value={newTelegramTarget}
                      onChange={(e) => setNewTelegramTarget(e.target.value)}
                      placeholder={knownTelegramChatIds[0] ? `默认 ${knownTelegramChatIds[0]}` : 'Telegram Chat ID；留空则发送到已连接会话'}
                      style={{ marginTop: 4, fontSize: '0.85rem' }}
                    />
                    {knownTelegramChatIds.length > 0 && (
                      <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {knownTelegramChatIds.map((chatId) => (
                          <button
                            key={chatId}
                            type="button"
                            className="sandbox-map__btn"
                            style={{ fontSize: '0.7rem' }}
                            onClick={() => setNewTelegramTarget(chatId)}
                          >
                            {chatId}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: 'var(--hd-space-sm)', marginTop: 'var(--hd-space-sm)' }}>
                <button className="sandbox-map__btn sandbox-map__btn--primary" onClick={handleSaveTask}>
                  {editingTaskId ? '保存修改' : '保存为待试跑'}
                </button>
                <button className="sandbox-map__btn" onClick={resetTaskForm}>
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
