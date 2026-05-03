/**
 * TeamsTab — 群策群力 · 团队协作面板
 *
 * 功能：
 * - 团队列表（全部/永久/自动/头脑风暴）
 * - 创建团队（选成员、选类型、选通信模式）
 * - 编辑团队（修改名称、描述、成员）
 * - 发起群聊（输入话题 → 各 Agent 依次回复）
 * - 解散团队
 * - 自定义 Agent 管理（创建/编辑/删除）
 *
 * 后端调用：
 * - src/lib/teams/store.ts — CRUD
 * - src/lib/teams/factory.ts — 创建工厂
 * - src/lib/teams/engine.ts — 会话执行
 * - src/lib/agents/registry.ts — Agent 列表
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  listTeams,
  updateTeam,
  deleteTeam,
  getTeamSession,
  listTeamSessions,
  listTeamActions,
  updateTeamSession,
  deleteTeamSession,
} from '../../../lib/teams/store'
import { describeTeamRoleMission, runTeamSession } from '../../../lib/teams/engine'
import { approveTeamAction, executeTeamAction, isExecutableTeamAction } from '../../../lib/teams/action-broker'
import { createPermanentTeam, createBrainstormTeam } from '../../../lib/teams/factory'
import {
  listAllAgents,
  AgentDefinition,
  createCustomAgent,
  updateCustomAgent,
  deleteCustomAgent,
} from '../../../lib/agents/registry'
import { loadAgentMemory, addMemoryEntry, removeMemoryEntry, AgentMemory } from '../../../lib/agents/agent-memory'
import {
  AgentCapabilityId,
  Team,
  TeamExecutionMode,
  TeamAction,
  TeamType,
  TeamAgent,
  TeamMessage,
  TeamSession,
  TeamWorkflowType,
} from '../../../lib/teams/types'
import { generatePRD, exportPRDAsMarkdown, PRDResult } from '../../../lib/prd/generator'
import { PRD_QUESTIONS, PRDAnswers } from '../../../lib/prd/questions'
import { buildUiMuseumPrdContext } from '../../../lib/ui-museum/context'
import { archiveOutput } from '../../../lib/knowledge/outputs'
import WorkflowDiagram from './WorkflowDiagram'
import './TeamsTab.css'

type FilterType = 'all' | 'permanent' | 'agency' | 'brainstorm' | 'my-agents'

const WORKFLOW_OPTIONS: Array<{
  type: TeamWorkflowType
  label: string
  hint: string
  defaultCapabilities: AgentCapabilityId[]
  artifactLabel: string
}> = [
  {
    type: 'prd',
    label: 'PRD 设计',
    hint: '产品需求、交互、验收',
    defaultCapabilities: ['prd', 'review', 'web-search'],
    artifactLabel: 'PRD 成稿',
  },
  {
    type: 'research',
    label: '深度调研',
    hint: '趋势、竞品、证据链',
    defaultCapabilities: ['web-search', 'review'],
    artifactLabel: '调研报告',
  },
  {
    type: 'build',
    label: '产品落地',
    hint: '架构、代码、测试',
    defaultCapabilities: ['filesystem', 'terminal', 'codegen', 'review'],
    artifactLabel: '实现方案',
  },
  {
    type: 'xcode-mac-app',
    label: 'Mac App 自动落地',
    hint: 'Swift、Xcode、看图验收',
    defaultCapabilities: ['filesystem', 'terminal', 'xcode', 'desktop-control', 'vision', 'codegen', 'review'],
    artifactLabel: 'Xcode 落地方案',
  },
  {
    type: 'visual-review',
    label: '视觉审查',
    hint: '截图、UI、动效、可用性',
    defaultCapabilities: ['vision', 'review'],
    artifactLabel: '视觉审查报告',
  },
  {
    type: 'automation',
    label: '自动化工作流',
    hint: 'Cron、Telegram、状态机',
    defaultCapabilities: ['terminal', 'browser', 'telegram', 'review'],
    artifactLabel: '自动化运行手册',
  },
  {
    type: 'custom',
    label: '自定义协作',
    hint: '按团队灵魂自由分工',
    defaultCapabilities: ['review'],
    artifactLabel: '群策方案',
  },
]

const CAPABILITY_LABELS: Record<AgentCapabilityId, string> = {
  vision: '看图',
  'desktop-control': '桌面控制',
  xcode: 'Xcode',
  filesystem: '文件读写',
  terminal: '终端',
  browser: '浏览器',
  'web-search': '实时搜索',
  codegen: '代码',
  prd: 'PRD',
  review: '审查',
  telegram: 'Telegram',
}

const EXECUTION_MODE_LABELS: Record<TeamExecutionMode, string> = {
  advisory: '只出方案',
  supervised: '自动优先',
  autonomous: '深度自动',
}

const EXECUTION_MODE_HINTS: Record<TeamExecutionMode, string> = {
  advisory: '只生成 PRD、调研、方案与人工清单，不改代码不控电脑',
  supervised: '绝大多数动作直接推进，只有高风险、桌面控制、人工接管等少数情况确认',
  autonomous: '低中风险自动续跑，高风险仍保留证据与接管点',
}

const EXECUTION_MODE_OPTIONS: Array<{ mode: TeamExecutionMode; label: string; hint: string }> = (
  ['advisory', 'supervised', 'autonomous'] as TeamExecutionMode[]
).map((mode) => ({
  mode,
  label: EXECUTION_MODE_LABELS[mode],
  hint: EXECUTION_MODE_HINTS[mode],
}))

const ACTION_STATUS_LABELS: Record<TeamAction['status'], string> = {
  proposed: '待确认',
  approved: '已确认',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  rejected: '已拒绝',
}

const ACTION_RISK_LABELS: Record<TeamAction['risk'], string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
}

const ACTION_TOOL_LABELS: Record<TeamAction['toolId'], string> = {
  terminal: '终端',
  file_read: '读文件',
  file_write: '写文件',
  web_search: '搜索',
  web_extract: '抓取',
  vision_analyze: '看图',
  desktop_screenshot: '截图观察',
  desktop_control: '桌面控制',
  xcode_action: 'Xcode',
  execute_code: '跑代码',
  manual_review: '人工确认',
}

function previewActionParams(params: Record<string, unknown>): string {
  try {
    return JSON.stringify(params).slice(0, 220)
  } catch {
    return ''
  }
}

function getActionSourceId(action: TeamAction): string {
  const source = action.params?.sourceActionId
  return typeof source === 'string' ? source : ''
}

function getActionDepth(action: TeamAction, byId: Map<string, TeamAction>, seen = new Set<string>()): number {
  const sourceId = getActionSourceId(action)
  if (!sourceId || !byId.has(sourceId) || seen.has(sourceId)) return 0
  seen.add(sourceId)
  return Math.min(6, 1 + getActionDepth(byId.get(sourceId)!, byId, seen))
}

function actionParamsText(action: TeamAction): string {
  try {
    return JSON.stringify(action.params || {}).toLowerCase()
  } catch {
    return ''
  }
}

function needsRareConfirmation(action: TeamAction): boolean {
  if (!action.requiresApproval) return false
  if (action.toolId === 'manual_review') return true
  if (action.risk === 'high') return true
  if (action.toolId === 'desktop_control') return true
  const params = actionParamsText(action)
  if (/\bsudo\b|password|passwd|密码|keychain|delete|remove|rm\s+-rf|killall/i.test(params)) return true
  return false
}

function isDirectRunnable(action: TeamAction): boolean {
  return (
    isExecutableTeamAction(action) &&
    (action.status === 'proposed' || action.status === 'approved') &&
    !needsRareConfirmation(action)
  )
}

function isConfirmableAction(action: TeamAction): boolean {
  return (
    isExecutableTeamAction(action) &&
    (action.status === 'proposed' || action.status === 'approved') &&
    needsRareConfirmation(action)
  )
}

function TeamExecutionChain(props: { actions: TeamAction[] }) {
  const { actions } = props
  if (actions.length === 0) return null
  const byId = new Map(actions.map((action) => [action.id, action]))
  const completed = actions.filter((action) => action.status === 'completed').length
  const failed = actions.filter((action) => action.status === 'failed').length
  const waiting = actions.filter((action) => action.status === 'proposed' || action.status === 'approved').length
  const bossCheckpoints = actions.filter((action) => action.toolId === 'manual_review' && action.status !== 'rejected').length

  return (
    <div className="teams-tab__execution-chain">
      <div className="teams-tab__execution-chain-head">
        <div>
          <div className="teams-tab__section-title">执行链路</div>
          <div className="teams-tab__execution-chain-sub">自动续跑、复盘、接管点会串成一条可追踪工作流</div>
        </div>
        <div className="teams-tab__execution-chain-stats">
          <span>{completed} 完成</span>
          <span>{waiting} 待办</span>
          {failed > 0 && <span>{failed} 失败</span>}
          {bossCheckpoints > 0 && <span>{bossCheckpoints} 接管点</span>}
        </div>
      </div>
      <div className="teams-tab__execution-chain-list">
        {actions.map((action, index) => {
          const sourceId = getActionSourceId(action)
          const sourceIndex = sourceId ? actions.findIndex((item) => item.id === sourceId) : -1
          const depth = getActionDepth(action, byId)
          const hasReflection = action.result?.output?.includes('执行复盘：')
          const hasObservation = action.result?.output?.includes('自动二次观察：')
          return (
            <div
              key={action.id}
              className={`teams-tab__execution-node teams-tab__execution-node--${action.status} teams-tab__execution-node--${action.risk}`}
              style={{ '--chain-depth': depth } as React.CSSProperties}
            >
              <div className="teams-tab__execution-node-line" />
              <div className="teams-tab__execution-node-index">{index + 1}</div>
              <div className="teams-tab__execution-node-body">
                <div className="teams-tab__execution-node-title">
                  <span>{action.title}</span>
                  <span className="teams-tab__action-pill">{ACTION_STATUS_LABELS[action.status]}</span>
                  <span className="teams-tab__action-pill">{ACTION_TOOL_LABELS[action.toolId]}</span>
                </div>
                <div className="teams-tab__execution-node-meta">
                  {sourceIndex >= 0 ? <span>来自第 {sourceIndex + 1} 步</span> : <span>起始动作</span>}
                  <span>{ACTION_RISK_LABELS[action.risk]}</span>
                  {action.requiresApproval ? <span>需确认</span> : <span>可直接执行</span>}
                  {hasObservation && <span>屏幕复核</span>}
                  {hasReflection && <span>复盘完成</span>}
                </div>
                <div className="teams-tab__execution-node-desc">{action.description}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TeamActionQueue(props: {
  actions: TeamAction[]
  runningId: string | null
  onRun: (action: TeamAction) => void
}) {
  const { actions, runningId, onRun } = props
  if (actions.length === 0) return null
  const directRunnableCount = actions.filter(isDirectRunnable).length
  const nextConfirmable = actions.find(isConfirmableAction)
  return (
    <div className="teams-tab__action-queue">
      <div className="teams-tab__action-queue-head">
        <div>
          <div className="teams-tab__section-title">执行动作队列</div>
          <div className="teams-tab__action-queue-sub">
            可直接动作由系统托管执行；只有系统级敏感或高风险动作会出现一个确认入口
          </div>
        </div>
        <div className="teams-tab__action-queue-tools">
          {directRunnableCount > 0 && (
            <span className="teams-tab__autopilot-pill">
              {runningId ? '托管执行中' : '等待托管'} · {directRunnableCount}
            </span>
          )}
          {nextConfirmable && (
            <button
              className="teams-tab__artifact-btn teams-tab__artifact-btn--primary"
              disabled={runningId !== null}
              onClick={() => onRun(nextConfirmable)}
            >
              确认并执行阻塞动作
            </button>
          )}
          <span className="teams-tab__action-count">{actions.length} 步</span>
        </div>
      </div>
      <div className="teams-tab__action-list">
        {actions.map((action, index) => {
          const executable = isExecutableTeamAction(action)
          const confirmationRequired = needsRareConfirmation(action)
          const showAutopilotStatus =
            !confirmationRequired &&
            executable &&
            (action.status === 'proposed' || action.status === 'approved' || action.status === 'running')
          return (
            <div
              key={action.id}
              className={`teams-tab__action-card teams-tab__action-card--${action.risk} teams-tab__action-card--${action.status}`}
            >
              <div className="teams-tab__action-index">{index + 1}</div>
              <div className="teams-tab__action-main">
                <div className="teams-tab__action-title-row">
                  <span className="teams-tab__action-title">{action.title}</span>
                  <span className="teams-tab__action-pill">{ACTION_STATUS_LABELS[action.status]}</span>
                  <span className="teams-tab__action-pill">{ACTION_RISK_LABELS[action.risk]}</span>
                </div>
                <div className="teams-tab__action-desc">{action.description}</div>
                <div className="teams-tab__action-meta">
                  <span>{action.ownerAgentName || '执行总控'}</span>
                  <span>{ACTION_TOOL_LABELS[action.toolId]}</span>
                  {confirmationRequired ? <span>少数情况需确认</span> : <span>自动优先</span>}
                </div>
                <code className="teams-tab__action-params">{previewActionParams(action.params)}</code>
                {action.result && (
                  <div className={`teams-tab__action-result ${action.result.success ? '' : 'teams-tab__action-result--error'}`}>
                    {action.result.output?.includes('自动二次观察：') && (
                      <div className="teams-tab__action-result-badge">已自动复核屏幕</div>
                    )}
                    {action.result.output?.includes('执行复盘：') && (
                      <div className="teams-tab__action-result-badge">已执行复盘</div>
                    )}
                    {action.result.error || action.result.output || '无输出'}
                  </div>
                )}
              </div>
              <div className="teams-tab__action-controls">
                {showAutopilotStatus && (
                  <span className="teams-tab__action-autopilot">
                    {action.status === 'running' || runningId === action.id || runningId === 'safe-chain'
                      ? '自动执行中'
                      : '等待托管执行'}
                  </span>
                )}
                {confirmationRequired && action.status !== 'completed' && action.status !== 'failed' && (
                  <span className="teams-tab__action-awaiting">等待顶部统一确认</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function getWorkflowOption(type?: TeamWorkflowType) {
  return WORKFLOW_OPTIONS.find((option) => option.type === type) || WORKFLOW_OPTIONS[WORKFLOW_OPTIONS.length - 1]
}

export default function TeamsTab() {
  const [teams, setTeams] = useState<Team[]>([])
  const [agents, setAgents] = useState<AgentDefinition[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')
  const [loading, setLoading] = useState(true)

  // 创建/编辑模态
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [createTab, setCreateTab] = useState<'team' | 'agent'>('team')
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formType, setFormType] = useState<TeamType>('permanent')
  const [formMembers, setFormMembers] = useState<string[]>([])
  const [formCommPattern, setFormCommPattern] = useState<'sequential' | 'round-robin' | 'broadcast'>('sequential')
  const [formWorkflowType, setFormWorkflowType] = useState<TeamWorkflowType>('prd')
  const [formCapabilities, setFormCapabilities] = useState<AgentCapabilityId[]>(getWorkflowOption('prd').defaultCapabilities)
  const [formExecutionMode, setFormExecutionMode] = useState<TeamExecutionMode>('advisory')

  // 自定义 Agent 表单
  const [agentName, setAgentName] = useState('')
  const [agentIcon, setAgentIcon] = useState('🤖')
  const [agentRole, setAgentRole] = useState('')
  const [agentColor, setAgentColor] = useState('#00d4aa')
  const [agentTemp, setAgentTemp] = useState(0.6)
  const [agentBotToken, setAgentBotToken] = useState('')
  const [agentImPlatform, setAgentImPlatform] = useState<'telegram' | 'discord' | 'slack'>('telegram')
  const [agentImTargetId, setAgentImTargetId] = useState('')
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)

  // Agent 管理面板
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  // Agent 记忆
  const [agentMemory, setAgentMemory] = useState<AgentMemory | null>(null)
  const [newMemoryText, setNewMemoryText] = useState('')

  // 加载 Agent 记忆
  useEffect(() => {
    if (selectedAgentId) {
      loadAgentMemory(selectedAgentId).then(setAgentMemory)
    } else {
      setAgentMemory(null)
    }
  }, [selectedAgentId])

  const AGENT_EMOJIS = ['🤖', '🧠', '💡', '🔬', '🎯', '📊', '🎨', '⚡', '🔮', '🛡️', '🚀', '⚙️']
  const AGENT_COLORS = ['#00d4aa', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#10b981', '#f97316']

  // 群聊
  const [chatTopic, setChatTopic] = useState('')
  const [chatMessages, setChatMessages] = useState<TeamMessage[]>([])
  const [chatRunning, setChatRunning] = useState(false)
  const [chatSummary, setChatSummary] = useState('')
  const [chatSessionId, setChatSessionId] = useState<string | null>(null)
  const [chatArtifactTags, setChatArtifactTags] = useState<string[]>([])
  const [chatNewTag, setChatNewTag] = useState('')
  const [chatArtifactSaved, setChatArtifactSaved] = useState(false)
  const [chatArtifactFavorite, setChatArtifactFavorite] = useState(false)
  const [chatFocusMode, setChatFocusMode] = useState(false)
  const [chatActions, setChatActions] = useState<TeamAction[]>([])
  const [historyActions, setHistoryActions] = useState<TeamAction[]>([])
  const [actionRunningId, setActionRunningId] = useState<string | null>(null)
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null)
  const autoPilotInFlightRef = useRef<Set<string>>(new Set())
  const autoPilotRunCountsRef = useRef<Record<string, number>>({})

  // PRD 生成
  const [showPrdModal, setShowPrdModal] = useState(false)
  const [prdAnswers, setPrdAnswers] = useState<PRDAnswers>({})
  const [prdResult, setPrdResult] = useState<PRDResult | null>(null)
  const [prdGenerating, setPrdGenerating] = useState(false)
  const [prdProgress, setPrdProgress] = useState('')
  const [prdRoleBriefs, setPrdRoleBriefs] = useState<string[]>([])
  const [prdExpandedChapters, setPrdExpandedChapters] = useState<Set<number>>(new Set())

  // 协作历史
  const [historySessions, setHistorySessions] = useState<TeamSession[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const [historyEditMode, setHistoryEditMode] = useState(false)
  const [historyDraftTitle, setHistoryDraftTitle] = useState('')
  const [historyDraftTopic, setHistoryDraftTopic] = useState('')
  const [historyDraftSummary, setHistoryDraftSummary] = useState('')
  const [historyDraftTags, setHistoryDraftTags] = useState<string[]>([])
  const [historyNewTag, setHistoryNewTag] = useState('')

  // 加载数据
  useEffect(() => {
    async function load() {
      setLoading(true)
      const [teamList, agentList] = await Promise.all([listTeams({ status: 'active' }), listAllAgents()])
      setTeams(teamList)
      setAgents(agentList)
      if (teamList.length > 0 && !selectedTeamId) {
        setSelectedTeamId(teamList[0].id)
      }
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const input = chatInputRef.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${Math.min(220, Math.max(56, input.scrollHeight))}px`
  }, [chatTopic])

  // 刷新 agent 列表
  const refreshAgents = useCallback(async () => {
    const agentList = await listAllAgents()
    setAgents(agentList)
  }, [])

  // 自定义 Agent 列表
  const customAgents = agents.filter((a) => a.isCustom)

  // 筛选后的团队
  const filteredTeams =
    filter === 'all' ? teams : filter === 'my-agents' ? [] : teams.filter((t) => t.teamType === filter)

  // 选中的团队
  const selectedTeam = teams.find((t) => t.id === selectedTeamId) || null
  const selectedWorkflow = getWorkflowOption(selectedTeam?.config.workflowType)
  const selectedCapabilities = Array.from(
    new Set([...(selectedTeam?.config.capabilities || []), ...selectedWorkflow.defaultCapabilities]),
  )
  const chatUiStyleContext = useMemo(
    () => buildUiMuseumPrdContext(`${selectedWorkflow.label}\n${chatTopic}`),
    [selectedWorkflow.label, chatTopic],
  )
  const prdUiStyleContext = useMemo(
    () => buildUiMuseumPrdContext(Object.entries(prdAnswers).map(([key, value]) => `${key}: ${value}`).join('\n')),
    [prdAnswers],
  )

  // 选中的自定义 Agent
  const selectedCustomAgent = selectedAgentId ? customAgents.find((a) => a.id === selectedAgentId) : null
  const selectedHistory = selectedHistoryId ? historySessions.find((session) => session.id === selectedHistoryId) : null

  const refreshTeamHistory = useCallback(
    async (teamId = selectedTeam?.id) => {
      if (!teamId) {
        setHistorySessions([])
        setSelectedHistoryId(null)
        return
      }
      setHistoryLoading(true)
      const sessions = await listTeamSessions({ teamId, limit: 80 })
      setHistorySessions(sessions)
      setSelectedHistoryId((current) => {
        if (current && sessions.some((session) => session.id === current)) return current
        return sessions[0]?.id || null
      })
      setHistoryLoading(false)
    },
    [selectedTeam?.id],
  )

  useEffect(() => {
    refreshTeamHistory()
  }, [refreshTeamHistory])

  useEffect(() => {
    if (!selectedHistory) {
      setHistoryDraftTitle('')
      setHistoryDraftTopic('')
      setHistoryDraftSummary('')
      setHistoryDraftTags([])
      setHistoryActions([])
      setHistoryEditMode(false)
      return
    }
    setHistoryDraftTitle(selectedHistory.title)
    setHistoryDraftTopic(selectedHistory.topic)
    setHistoryDraftSummary(selectedHistory.summary)
    setHistoryDraftTags(selectedHistory.tags || [])
    setHistoryNewTag('')
    setHistoryEditMode(false)
  }, [selectedHistory?.id])

  useEffect(() => {
    let cancelled = false
    async function loadHistoryActions() {
      if (!selectedHistory) {
        setHistoryActions([])
        return
      }
      const actions = await listTeamActions({ sessionId: selectedHistory.id })
      if (!cancelled) setHistoryActions(actions)
    }
    loadHistoryActions()
    return () => {
      cancelled = true
    }
  }, [selectedHistory?.id])

  // 创建/更新团队
  const handleSaveTeam = useCallback(async () => {
    if (!formName.trim() || formMembers.length === 0) return

    const teamAgents: TeamAgent[] = formMembers.map((id) => {
      const agent = agents.find((a) => a.id === id)
      return { agentId: id, role: agent?.name || id, skills: agent?.skills || [] }
    })

    if (editingTeam) {
      await updateTeam(editingTeam.id, {
        name: formName,
        description: formDesc,
        agents: teamAgents,
        config: {
          ...editingTeam.config,
          communicationPattern: formCommPattern,
          workflowType: formWorkflowType,
          capabilities: formCapabilities,
          executionMode: formExecutionMode,
        },
      })
    } else {
      if (formType === 'brainstorm') {
        await createBrainstormTeam({
          topic: formName,
          agentIds: formMembers,
          workflowType: formWorkflowType,
          capabilities: formCapabilities,
          executionMode: formExecutionMode,
        })
      } else {
        await createPermanentTeam({
          name: formName,
          description: formDesc,
          agents: teamAgents,
          communicationPattern: formCommPattern,
          workflowType: formWorkflowType,
          capabilities: formCapabilities,
          executionMode: formExecutionMode,
        })
      }
    }

    const updated = await listTeams({ status: 'active' })
    setTeams(updated)
    setShowCreateModal(false)
    setEditingTeam(null)
    resetForm()
  }, [
    formName,
    formDesc,
    formType,
    formMembers,
    formCommPattern,
    formWorkflowType,
    formCapabilities,
    formExecutionMode,
    agents,
    editingTeam,
  ])

  // 编辑团队
  const handleEditTeam = useCallback((team: Team) => {
    setEditingTeam(team)
    setFormName(team.name)
    setFormDesc(team.description)
    setFormType(team.teamType)
    setFormMembers(team.agents.map((a) => a.agentId))
    setFormCommPattern(team.config.communicationPattern)
    setFormWorkflowType(team.config.workflowType || 'custom')
    setFormCapabilities(team.config.capabilities || getWorkflowOption(team.config.workflowType).defaultCapabilities)
    setFormExecutionMode(team.config.executionMode || 'supervised')
    setCreateTab('team')
    setShowCreateModal(true)
  }, [])

  // 解散团队
  const handleDisbandTeam = useCallback(
    async (id: string) => {
      if (!confirm('确定要解散这个团队吗？')) return
      await deleteTeam(id)
      setTeams((prev) => prev.filter((t) => t.id !== id))
      if (selectedTeamId === id) setSelectedTeamId(null)
    },
    [selectedTeamId],
  )

  // 发起群聊
  const handleStartChat = useCallback(async () => {
    if (!selectedTeam || !chatTopic.trim()) return
    setChatRunning(true)
    setChatMessages([])
    setChatSummary('')
    setChatSessionId(null)
    setChatActions([])
    setChatArtifactSaved(false)
    setChatArtifactFavorite(false)
    setChatArtifactTags([selectedWorkflow.label, '群策', selectedTeam.name])
    setChatFocusMode(true)

    try {
      const session = await runTeamSession(selectedTeam, `${chatTopic.trim()}\n\n${chatUiStyleContext.promptFragment}`, (msg) => {
        setChatMessages((prev) => [...prev, msg])
      })
      const artifact = session.messages.find((msg) => msg.kind === 'artifact')
      const actions = await listTeamActions({ sessionId: session.id })
      setChatSessionId(session.id)
      setChatSummary(session.summary)
      setChatActions(actions)
      setChatArtifactTags(artifact?.tags?.length ? artifact.tags : [selectedWorkflow.label, '群策', selectedTeam.name])
      setSelectedHistoryId(session.id)
      await refreshTeamHistory(selectedTeam.id)
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: 'error',
          agentId: 'system',
          agentName: '系统',
          role: 'system',
          content: `会话失败: ${(err as Error).message}`,
          timestamp: Date.now(),
          kind: 'error',
        },
      ])
    }
    setChatRunning(false)
  }, [selectedTeam, selectedWorkflow.label, chatTopic, chatUiStyleContext.promptFragment, refreshTeamHistory])

  const replaceActionInState = useCallback((action: TeamAction) => {
    setChatActions((prev) => prev.map((item) => (item.id === action.id ? action : item)))
    setHistoryActions((prev) => prev.map((item) => (item.id === action.id ? action : item)))
  }, [])

  const handleRunTeamAction = useCallback(
    async (action: TeamAction) => {
      setActionRunningId(action.id)
      const approved = action.status === 'proposed' ? await approveTeamAction(action) : action
      replaceActionInState(approved)
      const executed = await executeTeamAction(approved)
      replaceActionInState(executed)
      const refreshedActions = await listTeamActions({ sessionId: executed.sessionId })
      if (executed.sessionId === chatSessionId) {
        setChatActions(refreshedActions)
      }
      if (executed.sessionId === selectedHistory?.id) {
        setHistoryActions(refreshedActions)
      }
      const refreshedSession = await getTeamSession(executed.sessionId)
      if (refreshedSession) {
        if (executed.sessionId === chatSessionId) {
          setChatMessages(refreshedSession.messages)
          setChatSummary(refreshedSession.summary)
        }
        if (executed.sessionId === selectedHistory?.id) {
          setHistoryDraftSummary(refreshedSession.summary)
        }
      }
      setActionRunningId(null)
      if (selectedTeam) {
        await refreshTeamHistory(selectedTeam.id)
      }
      if (selectedHistory && selectedHistory.id !== executed.sessionId) {
        const actions = await listTeamActions({ sessionId: selectedHistory.id })
        setHistoryActions(actions)
      }
    },
    [chatSessionId, replaceActionInState, refreshTeamHistory, selectedHistory, selectedTeam],
  )

  const handleRunSafeActionChain = useCallback(
    async (sessionId: string, seedActions: TeamAction[]) => {
      setActionRunningId('safe-chain')
      try {
        let actions = seedActions
        for (let i = 0; i < 8; i += 1) {
          const next = actions.find(isDirectRunnable)
          if (!next) break
          const approved = next.status === 'proposed' ? await approveTeamAction(next) : next
          replaceActionInState(approved)
          const executed = await executeTeamAction(approved)
          replaceActionInState(executed)
          const refreshedActions = await listTeamActions({ sessionId })
          actions = refreshedActions
          if (sessionId === chatSessionId) setChatActions(refreshedActions)
          if (sessionId === selectedHistory?.id) setHistoryActions(refreshedActions)
          const refreshedSession = await getTeamSession(sessionId)
          if (refreshedSession) {
            if (sessionId === chatSessionId) {
              setChatMessages(refreshedSession.messages)
              setChatSummary(refreshedSession.summary)
            }
            if (sessionId === selectedHistory?.id) {
              setHistoryDraftSummary(refreshedSession.summary)
            }
          }
          if (executed.status === 'failed') break
        }
      } finally {
        setActionRunningId(null)
        if (selectedTeam) {
          await refreshTeamHistory(selectedTeam.id)
        }
      }
    },
    [chatSessionId, replaceActionInState, refreshTeamHistory, selectedHistory, selectedTeam],
  )

  const runAutopilotForSession = useCallback(
    (sessionId: string, actions: TeamAction[]) => {
      if (!sessionId || actionRunningId || chatRunning) return
      if (!actions.some(isDirectRunnable)) return
      if (autoPilotInFlightRef.current.has(sessionId)) return

      const runCount = autoPilotRunCountsRef.current[sessionId] || 0
      if (runCount >= 8) return

      autoPilotRunCountsRef.current[sessionId] = runCount + 1
      autoPilotInFlightRef.current.add(sessionId)
      void handleRunSafeActionChain(sessionId, actions).finally(() => {
        autoPilotInFlightRef.current.delete(sessionId)
      })
    },
    [actionRunningId, chatRunning, handleRunSafeActionChain],
  )

  useEffect(() => {
    if (chatSessionId && chatActions.some(isDirectRunnable)) {
      runAutopilotForSession(chatSessionId, chatActions)
      return
    }
    if (selectedHistory && selectedHistory.id !== chatSessionId && historyActions.some(isDirectRunnable)) {
      runAutopilotForSession(selectedHistory.id, historyActions)
    }
  }, [chatActions, chatSessionId, historyActions, runAutopilotForSession, selectedHistory])

  const buildChatArtifactMarkdown = useCallback(() => {
    const title = selectedTeam
      ? `${selectedTeam.name}｜${selectedWorkflow.artifactLabel}`
      : `群策${selectedWorkflow.artifactLabel}`
    return [
      `# ${title}`,
      '',
      `> 议题：${chatTopic.trim()}`,
      `> 工作流：${selectedWorkflow.label}`,
      chatSessionId ? `> 会话：${chatSessionId}` : '',
      chatArtifactTags.length > 0 ? `> 标签：${chatArtifactTags.join('、')}` : '',
      '',
      chatSummary,
    ]
      .filter(Boolean)
      .join('\n')
  }, [selectedTeam, selectedWorkflow, chatTopic, chatSessionId, chatArtifactTags, chatSummary])

  const handleCopyChatArtifact = useCallback(async () => {
    if (!chatSummary.trim()) return
    await navigator.clipboard.writeText(buildChatArtifactMarkdown())
  }, [buildChatArtifactMarkdown, chatSummary])

  const handleDownloadChatArtifact = useCallback(() => {
    if (!chatSummary.trim()) return
    const blob = new Blob([buildChatArtifactMarkdown()], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedTeam?.name || 'team'}_${selectedWorkflow.artifactLabel}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [buildChatArtifactMarkdown, chatSummary, selectedTeam, selectedWorkflow.artifactLabel])

  const handleSaveChatArtifact = useCallback(async () => {
    if (!chatSummary.trim()) return
    await archiveOutput({
      question: `群策${selectedWorkflow.artifactLabel}：${chatTopic.trim().slice(0, 120)}`,
      answer: buildChatArtifactMarkdown(),
      quality: 5,
      tags: chatArtifactTags.length > 0 ? chatArtifactTags : [selectedWorkflow.label, '群策'],
    })
    setChatArtifactSaved(true)
  }, [buildChatArtifactMarkdown, chatArtifactTags, chatSummary, chatTopic, selectedWorkflow])

  const persistCurrentChatTags = useCallback(
    async (tags: string[], isStarred?: boolean) => {
      if (!chatSessionId || !selectedTeam) return
      await updateTeamSession(chatSessionId, {
        tags,
        ...(isStarred !== undefined ? { isStarred } : {}),
      })
      await refreshTeamHistory(selectedTeam.id)
    },
    [chatSessionId, selectedTeam, refreshTeamHistory],
  )

  const handleToggleChatFavorite = useCallback(() => {
    setChatArtifactFavorite((prev) => {
      const next = !prev
      setChatArtifactTags((tags) => {
        const nextTags = next ? Array.from(new Set([...tags, '收藏'])) : tags.filter((tag) => tag !== '收藏')
        void persistCurrentChatTags(nextTags, next)
        return nextTags
      })
      return next
    })
  }, [persistCurrentChatTags])

  const handleAddChatTag = useCallback(() => {
    const tag = chatNewTag.trim()
    if (!tag) return
    setChatArtifactTags((prev) => {
      const next = prev.includes(tag) ? prev : [...prev, tag].slice(0, 12)
      void persistCurrentChatTags(next)
      return next
    })
    setChatNewTag('')
  }, [chatNewTag, persistCurrentChatTags])

  const handleRemoveChatTag = useCallback(
    (tag: string) => {
      setChatArtifactTags((prev) => {
        const next = prev.filter((item) => item !== tag)
        void persistCurrentChatTags(next, tag === '收藏' ? false : undefined)
        return next
      })
    },
    [persistCurrentChatTags],
  )

  const handleToggleHistoryPinned = useCallback(
    async (session: TeamSession) => {
      await updateTeamSession(session.id, { isPinned: !session.isPinned })
      await refreshTeamHistory(session.teamId)
    },
    [refreshTeamHistory],
  )

  const handleToggleHistoryStarred = useCallback(
    async (session: TeamSession) => {
      await updateTeamSession(session.id, { isStarred: !session.isStarred })
      await refreshTeamHistory(session.teamId)
    },
    [refreshTeamHistory],
  )

  const handleDeleteHistorySession = useCallback(
    async (session: TeamSession) => {
      if (!confirm('确定要删除这条群策历史吗？全过程、产物和标签都会被删除。')) return
      await deleteTeamSession(session.id)
      await refreshTeamHistory(session.teamId)
    },
    [refreshTeamHistory],
  )

  const handleSaveHistoryEdit = useCallback(async () => {
    if (!selectedHistory) return
    await updateTeamSession(selectedHistory.id, {
      title: historyDraftTitle.trim() || selectedHistory.title,
      topic: historyDraftTopic.trim() || selectedHistory.topic,
      summary: historyDraftSummary,
      tags: historyDraftTags,
    })
    setHistoryEditMode(false)
    await refreshTeamHistory(selectedHistory.teamId)
  }, [selectedHistory, historyDraftTitle, historyDraftTopic, historyDraftSummary, historyDraftTags, refreshTeamHistory])

  const handleAddHistoryTag = useCallback(() => {
    const tag = historyNewTag.trim()
    if (!tag) return
    setHistoryDraftTags((prev) => (prev.includes(tag) ? prev : [...prev, tag].slice(0, 12)))
    setHistoryNewTag('')
  }, [historyNewTag])

  const handleRemoveHistoryTag = useCallback((tag: string) => {
    setHistoryDraftTags((prev) => prev.filter((item) => item !== tag))
  }, [])

  // PRD 生成
  const handleGeneratePRD = useCallback(async () => {
    setPrdGenerating(true)
    setPrdResult(null)
    setPrdRoleBriefs([])
    setPrdProgress('准备中...')
    setShowPrdModal(false)
    try {
      const result = await generatePRD(prdAnswers, (msg) => setPrdProgress(msg), {
        team: selectedTeam,
        agents,
        onRoleDeclaration: (msg) => setPrdRoleBriefs((prev) => [...prev, msg]),
      })
      setPrdResult(result)
      setPrdExpandedChapters(new Set(result.chapters.map((c) => c.id)))
    } catch (err) {
      setPrdProgress(`生成失败: ${(err as Error).message}`)
    }
    setPrdGenerating(false)
  }, [prdAnswers, selectedTeam, agents])

  // PRD 下载
  const handleDownloadPRD = useCallback(() => {
    if (!prdResult) return
    const md = exportPRDAsMarkdown(prdResult)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `🚀-${prdResult.projectTitle}_PRD.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [prdResult])

  // PRD 章节折叠
  const toggleChapter = useCallback((id: number) => {
    setPrdExpandedChapters((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // 重置表单
  const resetForm = () => {
    setFormName('')
    setFormDesc('')
    setFormType('permanent')
    setFormMembers([])
    setFormCommPattern('sequential')
    setFormWorkflowType('prd')
    setFormCapabilities(getWorkflowOption('prd').defaultCapabilities)
    setFormExecutionMode('advisory')
  }

  const applyWorkflowPreset = useCallback((workflowType: TeamWorkflowType) => {
    const option = getWorkflowOption(workflowType)
    setFormWorkflowType(workflowType)
    setFormCapabilities(option.defaultCapabilities)
    if (workflowType === 'prd' || workflowType === 'research' || workflowType === 'visual-review') {
      setFormExecutionMode('advisory')
    } else {
      setFormExecutionMode('supervised')
    }
  }, [])

  const toggleCapability = useCallback((capability: AgentCapabilityId) => {
    setFormCapabilities((prev) =>
      prev.includes(capability) ? prev.filter((item) => item !== capability) : [...prev, capability],
    )
  }, [])

  // 创建或更新自定义 Agent
  const handleSaveAgent = useCallback(async () => {
    if (!agentName.trim() || !agentRole.trim()) return

    // 组装 IM 渠道配置
    const platformConfig: Record<string, unknown> = agentImTargetId
      ? {
          defaultPlatform: agentImPlatform,
          targets: [{ platform: agentImPlatform, targetId: agentImTargetId, enabled: true }],
        }
      : {}

    let savedAgentId = editingAgentId || ''
    if (editingAgentId) {
      // 更新
      await updateCustomAgent(editingAgentId, {
        name: agentName,
        nameEn: agentName,
        icon: agentIcon,
        systemPromptSuffix: agentRole,
        temperature: agentTemp,
        skills: [],
        avatarStyle: 'default',
        color: agentColor,
        botToken: agentBotToken,
        platformConfig,
      })
    } else {
      // 创建
      savedAgentId = await createCustomAgent({
        name: agentName,
        nameEn: agentName,
        icon: agentIcon,
        systemPromptSuffix: agentRole,
        temperature: agentTemp,
        skills: [],
        avatarStyle: 'default',
        color: agentColor,
        botToken: agentBotToken,
        platformConfig,
      })
    }

    if (savedAgentId && agentBotToken.trim()) {
      const electronAPI = (window as any)?.electronAPI
      await electronAPI?.telegramAgentStart?.(savedAgentId, agentBotToken.trim(), agentName)
    }
    setEditingAgentId(null)

    await refreshAgents()
    resetAgentForm()
    setFilter('my-agents')
    setShowCreateModal(false)
  }, [
    agentName,
    agentRole,
    agentIcon,
    agentColor,
    agentTemp,
    agentBotToken,
    agentImPlatform,
    agentImTargetId,
    editingAgentId,
    refreshAgents,
  ])

  // 编辑自定义 Agent
  const handleEditCustomAgent = useCallback((agent: AgentDefinition) => {
    setEditingAgentId(agent.id)
    setAgentName(agent.name)
    setAgentIcon(agent.icon)
    setAgentRole(agent.systemPromptSuffix)
    setAgentColor(agent.color)
    setAgentTemp(agent.temperature)
    setAgentBotToken(agent.botToken || '')
    // 加载 IM 渠道配置
    const pc = agent.platformConfig as Record<string, unknown> | undefined
    if (pc?.defaultPlatform && typeof pc.defaultPlatform === 'string') {
      setAgentImPlatform(pc.defaultPlatform as 'telegram' | 'discord' | 'slack')
      const targets = pc.targets as Array<{ platform: string; targetId: string }> | undefined
      setAgentImTargetId(targets?.[0]?.targetId || '')
    } else {
      setAgentImPlatform('telegram')
      setAgentImTargetId('')
    }
    setCreateTab('agent')
    setShowCreateModal(true)
  }, [])

  // 删除自定义 Agent
  const handleDeleteCustomAgent = useCallback(
    async (id: string) => {
      if (!confirm('确定要删除这个自定义 Agent 吗？')) return
      await deleteCustomAgent(id)
      if (selectedAgentId === id) setSelectedAgentId(null)
      await refreshAgents()
    },
    [selectedAgentId, refreshAgents],
  )

  const resetAgentForm = () => {
    setAgentName('')
    setAgentRole('')
    setAgentIcon('🤖')
    setAgentColor('#00d4aa')
    setAgentTemp(0.6)
    setAgentBotToken('')
    setAgentImPlatform('telegram')
    setAgentImTargetId('')
    setEditingAgentId(null)
  }

  // 切换成员选择
  const toggleMember = (agentId: string) => {
    setFormMembers((prev) => (prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]))
  }

  // 类型标签
  const typeLabels: Record<TeamType, { label: string; color: string }> = {
    permanent: { label: '永久', color: '#00d4aa' },
    agency: { label: '自动', color: '#f59e0b' },
    brainstorm: { label: '头脑风暴', color: '#8b5cf6' },
  }

  // Agent 彩色映射
  const agentColors: Record<string, string> = {
    strategy: '#00d4aa',
    technical: '#3b82f6',
    market: '#f59e0b',
    creative: '#8b5cf6',
    critic: '#ef4444',
    visual: '#ec4899',
    general: '#06b6d4',
  }

  const getAgentColor = (agentId: string): string => {
    for (const [key, color] of Object.entries(agentColors)) {
      if (agentId.includes(key)) return color
    }
    return '#00d4aa'
  }

  const chatProgressMessages = chatMessages.filter((msg) => msg.kind === 'progress')
  const chatBriefMessages = chatMessages.filter((msg) => msg.kind !== 'progress' && msg.kind !== 'artifact')
  const selectedHistoryRoleBriefs =
    selectedHistory?.messages.filter((msg) => msg.content.startsWith('【角色开工宣言')) || []
  const selectedHistoryTeam = selectedHistory
    ? teams.find((team) => team.id === selectedHistory.teamId) || selectedTeam
    : selectedTeam
  const selectedHistoryWorkflow = getWorkflowOption(selectedHistoryTeam?.config.workflowType)
  const selectedHistoryCapabilities = Array.from(
    new Set([...(selectedHistoryTeam?.config.capabilities || []), ...selectedHistoryWorkflow.defaultCapabilities]),
  )
  const selectedHistoryRebuiltRoleCards = (selectedHistoryTeam?.agents || []).map((teamAgent) => {
    const agent = agents.find((item) => item.id === teamAgent.agentId)
    const agentName = agent?.name || teamAgent.role || teamAgent.agentId
    const mission = describeTeamRoleMission({
      agentId: teamAgent.agentId,
      agentName,
      teamRole: teamAgent.role,
      workflowType: selectedHistoryTeam?.config.workflowType,
      capabilities: selectedHistoryCapabilities,
    })
    return {
      id: `${selectedHistory?.id || selectedHistoryTeam?.id || 'history'}-${teamAgent.agentId}`,
      name: agentName,
      content: [
        '【角色职责】',
        `本轮职责：${mission.responsibility}`,
        `独占任务：${mission.focus}`,
        `交付物：${mission.deliverable}`,
        `能力衔接：${mission.capabilityBridge}。`,
        `边界：${mission.boundary}`,
      ].join('\n'),
    }
  })
  const selectedHistoryRoleCards =
    selectedHistoryRebuiltRoleCards.length > 0
      ? selectedHistoryRebuiltRoleCards
      : selectedHistoryRoleBriefs.map((msg) => ({
          id: msg.id,
          name: msg.agentName,
          content: msg.content,
        }))
  const selectedHistoryProcess =
    selectedHistory?.messages.filter(
      (msg) => msg.kind !== 'artifact' && !msg.content.startsWith('【角色开工宣言'),
    ) || []
  const selectedHistoryArtifact = selectedHistory?.messages.find((msg) => msg.kind === 'artifact') || null
  const formatHistoryTime = (value: string) => {
    if (!value) return ''
    const date = new Date(value.replace(' ', 'T'))
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  const chatHasStarted = chatRunning || chatMessages.length > 0 || Boolean(chatSummary)
  const showChatSetup = !chatFocusMode || !chatHasStarted
  const chatStageLabel = chatRunning
    ? '角色正在协作'
    : chatSummary
      ? '最终产物已生成'
      : chatMessages.length > 0
        ? '等待收束成稿'
        : '准备发起'
  const chatProgressStep = chatSummary ? 3 : chatMessages.length > 0 ? 2 : 1
  const chatArtifactState = chatArtifactSaved ? '已归档到知识+大佬' : chatSummary ? '可收藏、可打标签、可归档' : '尚未生成'
  const lastProgressMessage = chatProgressMessages[chatProgressMessages.length - 1]
  const activeSpeakerName = lastProgressMessage?.content.split(' 正在处理')[0] || ''
  const showRoleBriefs = chatBriefMessages.length > 0 && (!chatSummary || chatRunning)

  return (
    <div className={`teams-tab ${chatFocusMode ? 'teams-tab--chat-focus' : ''}`}>
      {/* 顶部操作栏 */}
      <div className="teams-tab__header">
        <div className="teams-tab__filters">
          {(['all', 'permanent', 'agency', 'brainstorm', 'my-agents'] as FilterType[]).map((f) => (
            <button
              key={f}
              className={`teams-tab__filter-btn ${filter === f ? 'teams-tab__filter-btn--active' : ''}`}
              onClick={() => {
                setFilter(f)
                setSelectedAgentId(null)
              }}
            >
              {f === 'all' ? '全部' : f === 'my-agents' ? '🤖 我的 Agent' : typeLabels[f]?.label || f}
              {f === 'all' && teams.length > 0 && <span className="teams-tab__badge">{teams.length}</span>}
              {f === 'my-agents' && customAgents.length > 0 && (
                <span className="teams-tab__badge">{customAgents.length}</span>
              )}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {filter === 'my-agents' ? (
            <button
              className="teams-tab__create-btn"
              onClick={() => {
                resetAgentForm()
                setEditingAgentId(null)
                setCreateTab('agent')
                setShowCreateModal(true)
              }}
            >
              + 创建 Agent
            </button>
          ) : (
            <>
              <button
                className="teams-tab__create-btn"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--hd-accent-cyan)',
                  color: 'var(--hd-accent-cyan)',
                }}
                onClick={() => {
                  resetAgentForm()
                  setEditingAgentId(null)
                  setCreateTab('agent')
                  setShowCreateModal(true)
                }}
              >
                + Agent
              </button>
              <button
                className="teams-tab__create-btn"
                onClick={() => {
                  resetForm()
                  setEditingTeam(null)
                  setCreateTab('team')
                  setShowCreateModal(true)
                }}
              >
                + 创建团队
              </button>
            </>
          )}
        </div>
      </div>

      {/* 主体 */}
      <div className="teams-tab__body">
        {/* ─── 我的 Agent 模式 ─── */}
        {filter === 'my-agents' ? (
          <>
            {/* 左侧：Agent 列表 */}
            <div className="teams-tab__list">
              {loading ? (
                <div className="teams-tab__empty">加载中...</div>
              ) : customAgents.length === 0 ? (
                <div className="teams-tab__empty">
                  <div className="teams-tab__empty-icon">🤖</div>
                  <div>暂无自定义 Agent</div>
                  <div className="teams-tab__empty-hint">点击右上角「+ 创建 Agent」开始</div>
                </div>
              ) : (
                customAgents.map((agent) => (
                  <button
                    key={agent.id}
                    className={`teams-tab__card ${selectedAgentId === agent.id ? 'teams-tab__card--active' : ''}`}
                    onClick={() => setSelectedAgentId(agent.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.3rem' }}>{agent.icon}</span>
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div className="teams-tab__card-name">{agent.name}</div>
                        <div className="teams-tab__card-meta">
                          <span
                            className="teams-tab__type-tag"
                            style={{ borderColor: agent.color, color: agent.color }}
                          >
                            自定义
                          </span>
                          <span className="teams-tab__card-members" style={{ fontSize: '0.65rem' }}>
                            T={agent.temperature}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* 右侧：Agent 详情 */}
            <div className="teams-tab__detail">
              {!selectedCustomAgent ? (
                <div className="teams-tab__empty">
                  <div className="teams-tab__empty-icon">←</div>
                  <div>选择一个 Agent 查看详情</div>
                </div>
              ) : (
                <div style={{ padding: 'var(--hd-space-lg)' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--hd-space-md)',
                      marginBottom: 'var(--hd-space-lg)',
                    }}
                  >
                    <span style={{ fontSize: '2.5rem' }}>{selectedCustomAgent.icon}</span>
                    <div>
                      <h3 style={{ fontSize: '1.2rem', margin: 0, color: selectedCustomAgent.color }}>
                        {selectedCustomAgent.name}
                      </h3>
                      <span
                        className="teams-tab__type-tag"
                        style={{ borderColor: selectedCustomAgent.color, color: selectedCustomAgent.color }}
                      >
                        自定义 Agent
                      </span>
                      <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: 'var(--hd-text-muted)' }}>
                        温度: {selectedCustomAgent.temperature}
                      </span>
                    </div>
                  </div>

                  <div className="teams-tab__section-title">角色描述 (System Prompt)</div>
                  <div
                    style={{
                      background: 'var(--hd-bg-deep)',
                      border: '1px solid var(--hd-border)',
                      padding: 'var(--hd-space-md)',
                      borderRadius: 'var(--hd-radius-sm)',
                      fontFamily: 'var(--hd-font-mono)',
                      fontSize: '0.82rem',
                      lineHeight: 1.7,
                      color: 'var(--hd-text-secondary)',
                      marginBottom: 'var(--hd-space-lg)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {selectedCustomAgent.systemPromptSuffix || '(无描述)'}
                  </div>

                  {/* Bot Token 状态 */}
                  <div className="teams-tab__section-title">平台连接</div>
                  <div
                    style={{
                      background: 'var(--hd-bg-deep)',
                      border: '1px solid var(--hd-border)',
                      padding: 'var(--hd-space-sm) var(--hd-space-md)',
                      borderRadius: 'var(--hd-radius-sm)',
                      fontSize: '0.8rem',
                      marginBottom: 'var(--hd-space-lg)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--hd-space-sm)',
                    }}
                  >
                    <span>🤖 Telegram</span>
                    {selectedCustomAgent.botToken ? (
                      <>
                        <span style={{ color: 'var(--hd-success)', fontWeight: 600 }}>● 已配置</span>
                        <span
                          style={{
                            fontFamily: 'var(--hd-font-mono)',
                            color: 'var(--hd-text-muted)',
                            fontSize: '0.7rem',
                          }}
                        >
                          {selectedCustomAgent.botToken.slice(0, 8)}...{selectedCustomAgent.botToken.slice(-4)}
                        </span>
                      </>
                    ) : (
                      <span style={{ color: 'var(--hd-text-muted)' }}>未配置 — 编辑 Agent 添加 Token</span>
                    )}
                  </div>

                  {/* Agent 记忆宫殿 */}
                  <div className="teams-tab__section-title">记忆宫殿</div>
                  <div
                    style={{
                      background: 'var(--hd-bg-deep)',
                      border: '1px solid var(--hd-border)',
                      borderRadius: 'var(--hd-radius-sm)',
                      padding: 'var(--hd-space-md)',
                      marginBottom: 'var(--hd-space-lg)',
                    }}
                  >
                    {/* 容量条 */}
                    {agentMemory && (
                      <div
                        style={{ marginBottom: 'var(--hd-space-sm)', display: 'flex', alignItems: 'center', gap: 8 }}
                      >
                        <span style={{ fontSize: '0.75rem', color: 'var(--hd-text-muted)' }}>
                          {agentMemory.entries.reduce((sum, e) => sum + e.text.length, 0)} / {agentMemory.charLimit}{' '}
                          字符
                        </span>
                        <div
                          style={{
                            flex: 1,
                            height: 4,
                            background: 'var(--hd-border)',
                            borderRadius: 2,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${Math.min(100, (agentMemory.entries.reduce((sum, e) => sum + e.text.length, 0) / agentMemory.charLimit) * 100)}%`,
                              background:
                                agentMemory.entries.reduce((sum, e) => sum + e.text.length, 0) >
                                agentMemory.charLimit * 0.8
                                  ? 'var(--hd-error)'
                                  : 'var(--hd-accent-cyan)',
                              borderRadius: 2,
                              transition: 'width 0.3s',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--hd-text-muted)' }}>
                          {agentMemory.entries.length} 条
                        </span>
                      </div>
                    )}

                    {/* 记忆条目列表 */}
                    <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 'var(--hd-space-sm)' }}>
                      {agentMemory && agentMemory.entries.length > 0 ? (
                        agentMemory.entries.map((entry) => (
                          <div
                            key={entry.rowid}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 8,
                              padding: '6px 0',
                              borderBottom: '1px solid var(--hd-border)',
                              fontSize: '0.78rem',
                            }}
                          >
                            <span style={{ color: 'var(--hd-text-secondary)', flex: 1, lineHeight: 1.6 }}>
                              {entry.text}
                            </span>
                            <button
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--hd-text-muted)',
                                cursor: 'pointer',
                                fontSize: '0.7rem',
                                padding: '2px 4px',
                                flexShrink: 0,
                              }}
                              onClick={async () => {
                                await removeMemoryEntry(selectedAgentId!, entry.rowid)
                                const updated = await loadAgentMemory(selectedAgentId!)
                                setAgentMemory(updated)
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ))
                      ) : (
                        <div
                          style={{ fontSize: '0.75rem', color: 'var(--hd-text-muted)', padding: 'var(--hd-space-sm)' }}
                        >
                          暂无记忆条目
                        </div>
                      )}
                    </div>

                    {/* 添加记忆 */}
                    <div style={{ display: 'flex', gap: 'var(--hd-space-sm)' }}>
                      <input
                        className="teams-tab__form-input"
                        style={{ flex: 1, fontSize: '0.78rem' }}
                        value={newMemoryText}
                        onChange={(e) => setNewMemoryText(e.target.value)}
                        placeholder="添加记忆条目..."
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && newMemoryText.trim() && selectedAgentId) {
                            await addMemoryEntry(selectedAgentId, newMemoryText.trim())
                            setNewMemoryText('')
                            const updated = await loadAgentMemory(selectedAgentId)
                            setAgentMemory(updated)
                          }
                        }}
                      />
                      <button
                        className="teams-tab__action-btn teams-tab__action-btn--edit"
                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        disabled={!newMemoryText.trim()}
                        onClick={async () => {
                          if (newMemoryText.trim() && selectedAgentId) {
                            await addMemoryEntry(selectedAgentId, newMemoryText.trim())
                            setNewMemoryText('')
                            const updated = await loadAgentMemory(selectedAgentId)
                            setAgentMemory(updated)
                          }
                        }}
                      >
                        + 添加
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--hd-space-sm)' }}>
                    <button
                      className="teams-tab__action-btn teams-tab__action-btn--edit"
                      onClick={() => handleEditCustomAgent(selectedCustomAgent)}
                    >
                      ✏️ 编辑
                    </button>
                    <button
                      className="teams-tab__action-btn teams-tab__action-btn--disband"
                      onClick={() => handleDeleteCustomAgent(selectedCustomAgent.id)}
                    >
                      🗑️ 删除
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* ─── 团队模式（原逻辑） ─── */}
            {/* 左侧：团队列表 */}
            {!chatFocusMode && (
              <div className="teams-tab__list">
                {loading ? (
                  <div className="teams-tab__empty">加载中...</div>
                ) : filteredTeams.length === 0 ? (
                  <div className="teams-tab__empty">
                    <div className="teams-tab__empty-icon">🤝</div>
                    <div>暂无团队</div>
                    <div className="teams-tab__empty-hint">点击右上角「+ 创建团队」开始协作</div>
                  </div>
                ) : (
                  filteredTeams.map((team) => (
                    <button
                      key={team.id}
                      className={`teams-tab__card ${selectedTeamId === team.id ? 'teams-tab__card--active' : ''}`}
                      onClick={() => setSelectedTeamId(team.id)}
                    >
                      <div className="teams-tab__card-name">{team.name}</div>
                      <div className="teams-tab__card-meta">
                        <span
                          className="teams-tab__type-tag"
                          style={{
                            borderColor: typeLabels[team.teamType]?.color,
                            color: typeLabels[team.teamType]?.color,
                          }}
                        >
                          {typeLabels[team.teamType]?.label}
                        </span>
                        <span className="teams-tab__card-members">{team.agents.length} 成员</span>
                        <span className="teams-tab__card-members">
                          {getWorkflowOption(team.config.workflowType).label}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* 右侧：团队详情 */}
            <div className="teams-tab__detail">
              {!selectedTeam ? (
                <div className="teams-tab__empty">
                  <div className="teams-tab__empty-icon">←</div>
                  <div>选择一个团队查看详情</div>
                </div>
              ) : (
                <>
                  {chatFocusMode && (
                    <div className="teams-tab__focus-bar">
                      <button className="teams-tab__focus-back" onClick={() => setChatFocusMode(false)}>
                        ← 返回
                      </button>
                      <div className="teams-tab__focus-title">
                        {selectedTeam.name} · {selectedWorkflow.label}工作台
                      </div>
                    </div>
                  )}

                  {chatFocusMode && chatHasStarted && (
                    <div className="teams-tab__session-dock">
                      <div className="teams-tab__session-main">
                        <div className="teams-tab__session-kicker">当前群策</div>
                        <div className="teams-tab__session-topic">{chatTopic || selectedWorkflow.artifactLabel}</div>
                        <div className="teams-tab__session-sub">
                          {chatStageLabel}
                          {activeSpeakerName ? ` · ${activeSpeakerName}` : ''}
                        </div>
                      </div>
                      <div className="teams-tab__session-steps" aria-label="群策进度">
                        {[
                          { index: 1, label: '任务已接收', detail: selectedTeam.agents.length + (selectedTeam.agents.some((agent) => agent.agentId === 'visual') ? 0 : 1) },
                          { index: 2, label: '角色发言', detail: chatBriefMessages.length },
                          { index: 3, label: '成稿留存', detail: chatSummary ? 1 : 0 },
                        ].map((step) => (
                          <div
                            key={step.index}
                            className={`teams-tab__session-step ${chatProgressStep >= step.index ? 'teams-tab__session-step--active' : ''}`}
                          >
                            <span>{step.index}</span>
                            <strong>{step.label}</strong>
                            <small>{step.detail}</small>
                          </div>
                        ))}
                      </div>
                      <div className="teams-tab__session-artifact">
                        <span>{selectedWorkflow.artifactLabel}</span>
                        <strong>{chatArtifactState}</strong>
                      </div>
                    </div>
                  )}

                  {!chatFocusMode && (
                    <>
                      {/* 团队信息 */}
                      <div className="teams-tab__info">
                        <div className="teams-tab__info-header">
                          <div>
                            <h3 className="teams-tab__info-name">{selectedTeam.name}</h3>
                            <span
                              className="teams-tab__type-tag"
                              style={{
                                borderColor: typeLabels[selectedTeam.teamType]?.color,
                                color: typeLabels[selectedTeam.teamType]?.color,
                              }}
                            >
                              {typeLabels[selectedTeam.teamType]?.label}
                            </span>
                          </div>
                          <div className="teams-tab__info-actions">
                            <button
                              className="teams-tab__action-btn teams-tab__action-btn--edit"
                              onClick={() => handleEditTeam(selectedTeam)}
                            >
                              编辑
                            </button>
                            <button
                              className="teams-tab__action-btn teams-tab__action-btn--disband"
                              onClick={() => handleDisbandTeam(selectedTeam.id)}
                            >
                              解散
                            </button>
                          </div>
                        </div>
                        {selectedTeam.description && <p className="teams-tab__info-desc">{selectedTeam.description}</p>}
                        <div className="teams-tab__info-config">
                          工作流: {selectedWorkflow.label} · 权限:{' '}
                          {EXECUTION_MODE_LABELS[selectedTeam.config.executionMode || 'supervised']} · 通信:{' '}
                          {selectedTeam.config.communicationPattern === 'sequential'
                            ? '顺序'
                            : selectedTeam.config.communicationPattern === 'round-robin'
                              ? '轮次'
                              : '广播'}
                        </div>
                        <div className="teams-tab__capability-strip">
                          {selectedCapabilities.map((capability) => (
                            <span key={capability} className="teams-tab__capability-chip">
                              {CAPABILITY_LABELS[capability]}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* 成员列表 */}
                      <div className="teams-tab__members">
                        <div className="teams-tab__section-title">团队成员</div>
                        <div className="teams-tab__member-list">
                          {selectedTeam.agents.map((agent, i) => {
                            const agentDef = agents.find((a) => a.id === agent.agentId)
                            return (
                              <div key={`${agent.agentId}-${i}`} className="teams-tab__member">
                                <span className="teams-tab__member-icon">{agentDef?.icon || '◈'}</span>
                                <span className="teams-tab__member-name">{agentDef?.name || agent.role}</span>
                                <span className="teams-tab__member-role">{agent.role}</span>
                              </div>
                            )
                          })}
                          {!selectedTeam.agents.some((agent) => agent.agentId === 'visual') && (
                            <div className="teams-tab__member teams-tab__member--auto">
                              <span className="teams-tab__member-icon">🎨</span>
                              <span className="teams-tab__member-name">视觉大师</span>
                              <span className="teams-tab__member-role">产品议题自动加入</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {/* PRD 专项生成区 */}
                  {!chatFocusMode && (
                    <div className="teams-tab__prd-section">
                      <div className="teams-tab__section-title">PRD 专项生成</div>
                      <div className="teams-tab__prd-desc">
                        保留传统 PRD 工作流；会自动从小白 UI风格馆提取契合气质的视觉语言，再交给群策团队写入 PRD
                      </div>
                      <div className="teams-tab__prd-desc">
                        当前协审角色：{' '}
                        {[
                          ...selectedTeam.agents.map(
                            (teamAgent) =>
                              agents.find((agent) => agent.id === teamAgent.agentId)?.name || teamAgent.role,
                          ),
                          selectedTeam.agents.some((agent) => agent.agentId === 'visual') ? '' : '视觉大师',
                        ]
                          .filter(Boolean)
                          .join(' / ') || '默认专家组'}
                      </div>
                      <div className="teams-tab__prd-actions">
                        <button
                          className="teams-tab__prd-btn"
                          onClick={() => {
                            setPrdAnswers({})
                            setPrdResult(null)
                            setPrdRoleBriefs([])
                            setShowPrdModal(true)
                          }}
                        >
                          生成 PRD
                        </button>
                        {prdResult && (
                          <button
                            className="teams-tab__prd-btn teams-tab__prd-btn--download"
                            onClick={handleDownloadPRD}
                          >
                            下载 Markdown
                          </button>
                        )}
                      </div>

                      {prdGenerating && (
                        <div className="teams-tab__prd-progress">
                          <div className="teams-tab__prd-spinner" />
                          <span>{prdProgress}</span>
                        </div>
                      )}

                      {prdRoleBriefs.length > 0 && (
                        <div className="teams-tab__prd-role-briefs">
                          <div className="teams-tab__prd-role-title">角色开工宣言</div>
                          {prdRoleBriefs.map((brief, index) => (
                            <div key={`${brief}-${index}`} className="teams-tab__prd-role-line">
                              {brief}
                            </div>
                          ))}
                        </div>
                      )}

                      {prdResult && !prdGenerating && (
                        <div className="teams-tab__prd-result">
                          <div className="teams-tab__prd-result-header">
                            <span className="teams-tab__prd-result-title">{prdResult.projectTitle} — PRD</span>
                            <span className="teams-tab__prd-result-meta">
                              {prdResult.chapters.length} 章节 · 4 轮 ·{' '}
                              {(prdResult.reviewerNames || []).join(' / ') || '专家审阅'}
                            </span>
                          </div>
                          {prdResult.chapters.map((chapter) => (
                            <div key={chapter.id} className="teams-tab__prd-chapter">
                              <button
                                className="teams-tab__prd-chapter-header"
                                onClick={() => toggleChapter(chapter.id)}
                              >
                                <span className="teams-tab__prd-chapter-num">{chapter.id}</span>
                                <span className="teams-tab__prd-chapter-title">{chapter.title}</span>
                                <span className="teams-tab__prd-chapter-toggle">
                                  {prdExpandedChapters.has(chapter.id) ? '−' : '+'}
                                </span>
                              </button>
                              {prdExpandedChapters.has(chapter.id) && (
                                <div className="teams-tab__prd-chapter-content">
                                  <div className="teams-tab__prd-chapter-text">{chapter.content}</div>
                                  <button
                                    className="teams-tab__prd-copy-btn"
                                    onClick={() => navigator.clipboard.writeText(chapter.content)}
                                  >
                                    复制
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 群聊区 */}
                  <div className="teams-tab__chat-section">
                    {showChatSetup && (
                      <>
                        <div className="teams-tab__section-title">发起群策</div>
                        <div className="teams-tab__workflow-banner">
                          <div>
                            <div className="teams-tab__workflow-title">{selectedWorkflow.label}</div>
                            <div className="teams-tab__workflow-hint">
                              产物：{selectedWorkflow.artifactLabel} · 能力：
                              {selectedCapabilities.map((capability) => CAPABILITY_LABELS[capability]).join(' / ')}
                            </div>
                            <div className="teams-tab__workflow-hint">
                              权限：{EXECUTION_MODE_LABELS[selectedTeam.config.executionMode || 'supervised']} ·{' '}
                              {EXECUTION_MODE_HINTS[selectedTeam.config.executionMode || 'supervised']}
                            </div>
                          </div>
                          <div className="teams-tab__workflow-mode">
                            {EXECUTION_MODE_LABELS[selectedTeam.config.executionMode || 'supervised']}
                          </div>
                        </div>

                        {/* 工作流 DAG */}
                        {selectedTeam.config.tasks && selectedTeam.config.tasks.length > 0 && (
                          <WorkflowDiagram
                            tasks={selectedTeam.config.tasks}
                            agents={agents.map((a) => ({ id: a.id, name: a.name, icon: a.icon || '◈' }))}
                          />
                        )}
	                        <div className="teams-tab__chat-input-row">
                          <textarea
                            ref={chatInputRef}
                            className="teams-tab__chat-input"
                            placeholder={`输入${selectedWorkflow.label}任务...`}
                            value={chatTopic}
                            onChange={(e) => setChatTopic(e.target.value)}
                            onKeyDown={(e) => {
                              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                e.preventDefault()
                                handleStartChat()
                              }
                            }}
                            disabled={chatRunning}
                          />
                          <button
                            className="teams-tab__chat-start-btn"
                            onClick={handleStartChat}
                            disabled={chatRunning || !chatTopic.trim()}
                          >
                            {chatRunning ? '讨论中...' : '开始'}
	                          </button>
	                        </div>
	                        <div className="teams-tab__prd-desc" style={{ marginTop: 'var(--hd-space-sm)' }}>
	                          UI风格馆已自动匹配：{chatUiStyleContext.styleNames.join(' / ')}
	                          {chatUiStyleContext.savedFusionName ? `（复用融合：${chatUiStyleContext.savedFusionName}）` : ''}。{chatUiStyleContext.reasoning}
	                        </div>
	                      </>
	                    )}

                    {/* 群策过程 */}
                    {chatProgressMessages.length > 0 && (
                      <div className="teams-tab__progress-strip">
                        {chatProgressMessages.map((msg) => (
                          <div key={msg.id} className="teams-tab__progress-item">
                            <span className="teams-tab__progress-dot" />
                            <span>{msg.content}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 角色短评 */}
                    {showRoleBriefs && (
                      <div className="teams-tab__brief-grid">
                        {chatBriefMessages.map((msg) => {
                          const color =
                            msg.kind === 'error' || msg.role === 'system' ? '#ef4444' : getAgentColor(msg.agentId)
                          return (
                            <div
                              key={msg.id}
                              className={`teams-tab__brief-card ${msg.kind === 'error' || msg.role === 'system' ? 'teams-tab__brief-card--error' : ''}`}
                              style={{ '--agent-color': color } as React.CSSProperties}
                            >
                              <div className="teams-tab__brief-head">
                                <span
                                  className="teams-tab__chat-msg-avatar teams-tab__chat-msg-avatar--colored"
                                  style={{ borderColor: color, color }}
                                >
                                  {agents.find((a) => a.id === msg.agentId)?.icon || '◈'}
                                </span>
                                <div>
                                  <div className="teams-tab__brief-name" style={{ color }}>
                                    {msg.agentName}
                                  </div>
                                  <div className="teams-tab__brief-kind">
                                    {msg.kind === 'error' ? '异常' : msg.round ? `第 ${msg.round} 轮短评` : '顾问短评'}
                                  </div>
                                </div>
                              </div>
                              <div className="teams-tab__brief-content">{msg.content}</div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {chatSummary && chatBriefMessages.length > 0 && !chatRunning && (
                      <div className="teams-tab__brief-archive">
                        <span>角色短评已收束</span>
                        <strong>{chatBriefMessages.length}</strong>
                        <small>过程不会压住最终文档；需要复盘时可在协作历史查看。</small>
                      </div>
                    )}

                    {/* 群策产物 */}
                    {chatSummary && (
                      <div className="teams-tab__artifact">
                        <div className="teams-tab__artifact-header">
                          <div>
                            <div className="teams-tab__section-title">{selectedWorkflow.artifactLabel}</div>
                            <div className="teams-tab__artifact-meta">
                              已留存在群策会话{chatSessionId ? ` · ${chatSessionId.slice(0, 8)}` : ''} ·
                              可归档到知识+大佬
                            </div>
                          </div>
                          <div className="teams-tab__artifact-actions">
                            <button className="teams-tab__artifact-btn" onClick={handleCopyChatArtifact}>
                              复制产物
                            </button>
                            <button className="teams-tab__artifact-btn" onClick={handleDownloadChatArtifact}>
                              下载 Markdown
                            </button>
                            <button
                              className={`teams-tab__artifact-btn ${chatArtifactFavorite ? 'teams-tab__artifact-btn--active' : ''}`}
                              onClick={handleToggleChatFavorite}
                            >
                              {chatArtifactFavorite ? '已收藏' : '收藏'}
                            </button>
                            <button
                              className={`teams-tab__artifact-btn teams-tab__artifact-btn--primary ${chatArtifactSaved ? 'teams-tab__artifact-btn--done' : ''}`}
                              onClick={handleSaveChatArtifact}
                              disabled={chatArtifactSaved}
                            >
                              {chatArtifactSaved ? '已归档' : '归入知识+大佬'}
                            </button>
                          </div>
                        </div>

                        <div className="teams-tab__artifact-tags">
                          {chatArtifactTags.map((tag) => (
                            <button
                              key={tag}
                              className="teams-tab__tag-chip"
                              onClick={() => handleRemoveChatTag(tag)}
                              title="点击移除标签"
                            >
                              #{tag}
                            </button>
                          ))}
                          <input
                            className="teams-tab__tag-input"
                            value={chatNewTag}
                            onChange={(e) => setChatNewTag(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                handleAddChatTag()
                              }
                            }}
                            placeholder="添加标签"
                          />
                          <button className="teams-tab__artifact-btn" onClick={handleAddChatTag}>
                            添加
                          </button>
                        </div>

	                        <div className="teams-tab__artifact-text">{chatSummary}</div>
	                      </div>
	                    )}

	                    <TeamExecutionChain actions={chatActions} />
	                    <TeamActionQueue
	                      actions={chatActions}
	                      runningId={actionRunningId}
	                      onRun={handleRunTeamAction}
	                    />
	                  </div>

                  {!chatFocusMode && (
                    <div className="teams-tab__history-section">
                      <div className="teams-tab__section-title">协作历史</div>
                      <div className="teams-tab__history-shell">
                        <div className="teams-tab__history-list">
                          {historyLoading ? (
                            <div className="teams-tab__history-empty">加载历史中...</div>
                          ) : historySessions.length === 0 ? (
                            <div className="teams-tab__history-empty">这个团队还没有群策历史</div>
                          ) : (
                            historySessions.map((session) => (
                              <button
                                key={session.id}
                                className={`teams-tab__history-item ${selectedHistoryId === session.id ? 'teams-tab__history-item--active' : ''}`}
                                onClick={() => setSelectedHistoryId(session.id)}
                              >
                                <div className="teams-tab__history-item-head">
                                  <span className="teams-tab__history-item-title">{session.title}</span>
                                  <span className="teams-tab__history-flags">
                                    {session.isPinned ? '置顶' : ''}
                                    {session.isStarred ? ' 星标' : ''}
                                  </span>
                                </div>
                                <div className="teams-tab__history-item-topic">{session.topic}</div>
                                <div className="teams-tab__history-item-meta">
                                  <span>{formatHistoryTime(session.updatedAt || session.createdAt)}</span>
                                  <span>{session.messages.length} 条过程</span>
                                  <span>{session.status}</span>
                                </div>
                                {session.tags.length > 0 && (
                                  <div className="teams-tab__history-mini-tags">
                                    {session.tags.slice(0, 4).map((tag) => (
                                      <span key={tag}>#{tag}</span>
                                    ))}
                                  </div>
                                )}
                                <span
                                  className="teams-tab__history-inline-edit"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setSelectedHistoryId(session.id)
                                    setHistoryEditMode(true)
                                  }}
                                >
                                  编辑
                                </span>
                              </button>
                            ))
                          )}
                        </div>

                        <div className="teams-tab__history-detail">
                          {!selectedHistory ? (
                            <div className="teams-tab__history-empty">选择一条历史查看全过程</div>
                          ) : (
                            <>
                              <div className="teams-tab__history-detail-head">
                                <div>
                                  <div className="teams-tab__history-title">
                                    {historyEditMode ? (
                                      <input
                                        className="teams-tab__form-input"
                                        value={historyDraftTitle}
                                        onChange={(e) => setHistoryDraftTitle(e.target.value)}
                                      />
                                    ) : (
                                      selectedHistory.title
                                    )}
                                  </div>
                                  <div className="teams-tab__history-meta">
                                    {formatHistoryTime(selectedHistory.createdAt)} · {selectedHistoryProcess.length}{' '}
                                    条协作过程
                                  </div>
                                </div>
                                <div className="teams-tab__history-actions">
                                  <button
                                    className={`teams-tab__artifact-btn ${selectedHistory.isPinned ? 'teams-tab__artifact-btn--active' : ''}`}
                                    onClick={() => handleToggleHistoryPinned(selectedHistory)}
                                  >
                                    {selectedHistory.isPinned ? '已置顶' : '置顶'}
                                  </button>
                                  <button
                                    className={`teams-tab__artifact-btn ${selectedHistory.isStarred ? 'teams-tab__artifact-btn--active' : ''}`}
                                    onClick={() => handleToggleHistoryStarred(selectedHistory)}
                                  >
                                    {selectedHistory.isStarred ? '已星标' : '星标'}
                                  </button>
                                  {historyEditMode ? (
                                    <>
                                      <button className="teams-tab__artifact-btn" onClick={handleSaveHistoryEdit}>
                                        保存
                                      </button>
                                      <button
                                        className="teams-tab__artifact-btn"
                                        onClick={() => setHistoryEditMode(false)}
                                      >
                                        取消
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      className="teams-tab__artifact-btn"
                                      onClick={() => setHistoryEditMode(true)}
                                    >
                                      编辑
                                    </button>
                                  )}
                                  <button
                                    className="teams-tab__artifact-btn teams-tab__history-delete"
                                    onClick={() => handleDeleteHistorySession(selectedHistory)}
                                  >
                                    删除
                                  </button>
                                </div>
                              </div>

                              <div className="teams-tab__history-topic">
                                <div className="teams-tab__history-label">原始议题</div>
                                {historyEditMode ? (
                                  <textarea
                                    className="teams-tab__form-textarea"
                                    rows={3}
                                    value={historyDraftTopic}
                                    onChange={(e) => setHistoryDraftTopic(e.target.value)}
                                  />
                                ) : (
                                  <div>{selectedHistory.topic}</div>
                                )}
                              </div>

	                              <div className="teams-tab__artifact-tags">
	                                {(historyEditMode ? historyDraftTags : selectedHistory.tags).map((tag) => (
                                  <button
                                    key={tag}
                                    className="teams-tab__tag-chip"
                                    onClick={() => historyEditMode && handleRemoveHistoryTag(tag)}
                                    title={historyEditMode ? '点击移除标签' : undefined}
                                  >
                                    #{tag}
                                  </button>
                                ))}
                                {historyEditMode && (
                                  <>
                                    <input
                                      className="teams-tab__tag-input"
                                      value={historyNewTag}
                                      onChange={(e) => setHistoryNewTag(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault()
                                          handleAddHistoryTag()
                                        }
                                      }}
                                      placeholder="添加标签"
                                    />
                                    <button className="teams-tab__artifact-btn" onClick={handleAddHistoryTag}>
                                      添加
                                    </button>
                                  </>
	                                )}
		                              </div>

                              {selectedHistoryRoleCards.length > 0 && (
                                <div className="teams-tab__history-role-grid">
                                  <div className="teams-tab__history-label teams-tab__history-role-heading">
                                    角色职责与任务
                                  </div>
                                  {selectedHistoryRoleCards.map((roleCard, index) => (
                                    <div key={roleCard.id} className="teams-tab__history-role-card">
                                      <div className="teams-tab__history-role-index">{index + 1}</div>
                                      <div className="teams-tab__history-role-body">
                                        <div className="teams-tab__history-role-name">{roleCard.name}</div>
                                        <div className="teams-tab__history-role-content">{roleCard.content}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

		                              <TeamExecutionChain actions={historyActions} />
		                              <TeamActionQueue
		                                actions={historyActions}
		                                runningId={actionRunningId}
		                                onRun={handleRunTeamAction}
		                              />

		                              <div className="teams-tab__history-columns">
                                <div>
                                  <div className="teams-tab__history-label">全过程</div>
                                  <div className="teams-tab__history-process">
                                    {selectedHistoryProcess.map((msg) => (
                                      <div key={msg.id} className="teams-tab__history-message">
                                        <div className="teams-tab__history-message-head">
                                          <span>{msg.agentName}</span>
                                          <span>
                                            {msg.kind || msg.role}
                                            {msg.round ? ` · Round ${msg.round}` : ''}
                                          </span>
                                        </div>
                                        <div className="teams-tab__history-message-content">{msg.content}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <div className="teams-tab__history-label">最终产物</div>
                                  {historyEditMode ? (
                                    <textarea
                                      className="teams-tab__form-textarea teams-tab__history-summary-edit"
                                      value={historyDraftSummary}
                                      onChange={(e) => setHistoryDraftSummary(e.target.value)}
                                    />
                                  ) : (
                                    <div className="teams-tab__history-summary">
                                      {selectedHistory.summary || selectedHistoryArtifact?.content || '暂无最终产物'}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* 创建/编辑团队模态 */}
      {showCreateModal && (
        <div className="teams-tab__modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="teams-tab__modal" onClick={(e) => e.stopPropagation()}>
            <div className="teams-tab__modal-header">
              <div className="teams-tab__modal-tabs">
                <button
                  className={`teams-tab__modal-tab ${createTab === 'team' ? 'teams-tab__modal-tab--active' : ''}`}
                  onClick={() => setCreateTab('team')}
                >
                  {editingTeam ? '编辑团队' : '创建团队'}
                </button>
                {!editingTeam && (
                  <button
                    className={`teams-tab__modal-tab ${createTab === 'agent' ? 'teams-tab__modal-tab--active' : ''}`}
                    onClick={() => setCreateTab('agent')}
                  >
                    {editingAgentId ? '编辑 Agent' : '自定义 Agent'}
                  </button>
                )}
              </div>
              <button
                className="teams-tab__modal-close"
                onClick={() => {
                  setShowCreateModal(false)
                  setEditingAgentId(null)
                }}
              >
                ✕
              </button>
            </div>

            {createTab === 'team' ? (
              <>
                <div className="teams-tab__modal-body">
                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">团队名称</label>
                    <input
                      className="teams-tab__form-input"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="给团队起个名字..."
                    />
                  </div>

                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">描述</label>
                    <input
                      className="teams-tab__form-input"
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      placeholder="团队的目标或描述..."
                    />
                  </div>

                  {!editingTeam && (
                    <div className="teams-tab__form-group">
                      <label className="teams-tab__form-label">团队类型</label>
                      <div className="teams-tab__form-radio-group">
                        <button
                          className={`teams-tab__form-radio ${formType === 'permanent' ? 'teams-tab__form-radio--active' : ''}`}
                          onClick={() => setFormType('permanent')}
                        >
                          永久团队
                        </button>
                        <button
                          className={`teams-tab__form-radio ${formType === 'brainstorm' ? 'teams-tab__form-radio--active' : ''}`}
                          onClick={() => setFormType('brainstorm')}
                        >
                          头脑风暴
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">团队工作流</label>
                    <div className="teams-tab__workflow-picker">
                      {WORKFLOW_OPTIONS.map((option) => (
                        <button
                          key={option.type}
                          className={`teams-tab__workflow-pick ${formWorkflowType === option.type ? 'teams-tab__workflow-pick--active' : ''}`}
                          onClick={() => applyWorkflowPreset(option.type)}
                        >
                          <span className="teams-tab__workflow-pick-title">{option.label}</span>
                          <span className="teams-tab__workflow-pick-hint">{option.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">Agent 手脚 / 能力</label>
                    <div className="teams-tab__capability-picker">
                      {(Object.keys(CAPABILITY_LABELS) as AgentCapabilityId[]).map((capability) => (
                        <button
                          key={capability}
                          className={`teams-tab__capability-pick ${formCapabilities.includes(capability) ? 'teams-tab__capability-pick--active' : ''}`}
                          onClick={() => toggleCapability(capability)}
                        >
                          {CAPABILITY_LABELS[capability]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">执行权限</label>
                    <div className="teams-tab__execution-picker">
                      {EXECUTION_MODE_OPTIONS.map((option) => (
                        <button
                          key={option.mode}
                          className={`teams-tab__execution-pick ${formExecutionMode === option.mode ? 'teams-tab__execution-pick--active' : ''}`}
                          onClick={() => setFormExecutionMode(option.mode)}
                        >
                          <span className="teams-tab__execution-pick-title">{option.label}</span>
                          <span className="teams-tab__execution-pick-hint">{option.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">通信模式</label>
                    <div className="teams-tab__form-radio-group">
                      <button
                        className={`teams-tab__form-radio ${formCommPattern === 'sequential' ? 'teams-tab__form-radio--active' : ''}`}
                        onClick={() => setFormCommPattern('sequential')}
                      >
                        顺序（依次发言）
                      </button>
                      <button
                        className={`teams-tab__form-radio ${formCommPattern === 'round-robin' ? 'teams-tab__form-radio--active' : ''}`}
                        onClick={() => setFormCommPattern('round-robin')}
                      >
                        轮次（多轮讨论）
                      </button>
                      <button
                        className={`teams-tab__form-radio ${formCommPattern === 'broadcast' ? 'teams-tab__form-radio--active' : ''}`}
                        onClick={() => setFormCommPattern('broadcast')}
                      >
                        广播（并行发言）
                      </button>
                    </div>
                  </div>

                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">选择成员 ({formMembers.length} 已选)</label>
                    <div className="teams-tab__member-picker">
                      {agents.map((agent) => (
                        <button
                          key={agent.id}
                          className={`teams-tab__member-pick-btn ${formMembers.includes(agent.id) ? 'teams-tab__member-pick-btn--active' : ''}`}
                          onClick={() => toggleMember(agent.id)}
                        >
                          <span>{agent.icon}</span>
                          <span>{agent.name}</span>
                          {formMembers.includes(agent.id) && <span className="teams-tab__pick-check">✓</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="teams-tab__modal-footer">
                  <button
                    className="teams-tab__modal-btn teams-tab__modal-btn--cancel"
                    onClick={() => setShowCreateModal(false)}
                  >
                    取消
                  </button>
                  <button
                    className="teams-tab__modal-btn teams-tab__modal-btn--save"
                    onClick={handleSaveTeam}
                    disabled={!formName.trim() || formMembers.length === 0}
                  >
                    {editingTeam ? '保存修改' : '创建团队'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="teams-tab__modal-body">
                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">Agent 名称</label>
                    <input
                      className="teams-tab__form-input"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      placeholder="给你的 Agent 起个名字..."
                    />
                  </div>

                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">Emoji 图标</label>
                    <div className="teams-tab__form-radio-group">
                      {AGENT_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          className={`teams-tab__form-radio ${agentIcon === emoji ? 'teams-tab__form-radio--active' : ''}`}
                          onClick={() => setAgentIcon(emoji)}
                          style={{ fontSize: '1rem', padding: '4px 8px' }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">角色描述 (System Prompt)</label>
                    <textarea
                      className="teams-tab__form-textarea"
                      value={agentRole}
                      onChange={(e) => setAgentRole(e.target.value)}
                      placeholder="描述这个 Agent 的专长和行为方式..."
                      rows={3}
                    />
                  </div>

                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">主题色</label>
                    <div className="teams-tab__form-radio-group">
                      {AGENT_COLORS.map((c) => (
                        <button
                          key={c}
                          className={`teams-tab__form-radio ${agentColor === c ? 'teams-tab__form-radio--active' : ''}`}
                          onClick={() => setAgentColor(c)}
                          style={{
                            backgroundColor: c,
                            borderColor: agentColor === c ? '#fff' : c,
                            width: 28,
                            height: 28,
                            padding: 0,
                            minWidth: 28,
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">温度 ({agentTemp})</label>
                    <input
                      type="range"
                      min="0.0"
                      max="1"
                      step="0.1"
                      value={agentTemp}
                      onChange={(e) => setAgentTemp(parseFloat(e.target.value))}
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">
                      Telegram Bot Token
                      <span
                        style={{ fontSize: '0.7rem', color: 'var(--hd-text-muted)', fontWeight: 400, marginLeft: 6 }}
                      >
                        可选 — 绑定后该 Agent 可通过独立 Bot 对话
                      </span>
                    </label>
                    <input
                      className="teams-tab__form-input"
                      value={agentBotToken}
                      onChange={(e) => setAgentBotToken(e.target.value)}
                      placeholder="123456789:ABCdefGHI..."
                      style={{ fontFamily: 'var(--hd-font-mono, monospace)', fontSize: '0.8rem' }}
                    />
                    {agentBotToken && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--hd-success)', marginTop: 4 }}>
                        ✓ Token 已填写 — 创建后将自动启动该 Bot 的轮询
                      </div>
                    )}
                  </div>

                  {/* IM 渠道配置 */}
                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">
                      IM 推送渠道
                      <span
                        style={{ fontSize: '0.7rem', color: 'var(--hd-text-muted)', fontWeight: 400, marginLeft: 6 }}
                      >
                        可选 — 定时任务结果推送到该 Agent 专属渠道
                      </span>
                    </label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <select
                        className="teams-tab__form-input"
                        value={agentImPlatform}
                        onChange={(e) => setAgentImPlatform(e.target.value as 'telegram' | 'discord' | 'slack')}
                        style={{ width: 140, flexShrink: 0 }}
                      >
                        <option value="telegram">Telegram</option>
                        <option value="discord">Discord</option>
                        <option value="slack">Slack</option>
                      </select>
                      <input
                        className="teams-tab__form-input"
                        value={agentImTargetId}
                        onChange={(e) => setAgentImTargetId(e.target.value)}
                        placeholder={agentImPlatform === 'telegram' ? 'Chat ID' : 'Webhook URL'}
                        style={{ flex: 1 }}
                      />
                    </div>
                    {agentImTargetId && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--hd-success)', marginTop: 4 }}>
                        ✓ 推送目标已配置 — 该 Agent 的定时任务将推送到 {agentImPlatform}
                      </div>
                    )}
                  </div>
                </div>

                <div className="teams-tab__modal-footer">
                  <button
                    className="teams-tab__modal-btn teams-tab__modal-btn--cancel"
                    onClick={() => {
                      setShowCreateModal(false)
                      setEditingAgentId(null)
                    }}
                  >
                    取消
                  </button>
                  <button
                    className="teams-tab__modal-btn teams-tab__modal-btn--save"
                    onClick={handleSaveAgent}
                    disabled={!agentName.trim() || !agentRole.trim()}
                  >
                    {editingAgentId ? '保存修改' : '创建 Agent'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* PRD 问答模态 */}
      {showPrdModal && (
        <div
          className="teams-tab__modal-overlay"
          onClick={() => setShowPrdModal(false)}
        >
          <div className="teams-tab__modal teams-tab__modal--prd" onClick={(e) => e.stopPropagation()}>
            <div className="teams-tab__modal-header">
              <h3>PRD 专项生成 — 5 个关键问题</h3>
              <button
                className="teams-tab__modal-close"
                onClick={() => setShowPrdModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="teams-tab__modal-body">
	              {selectedTeam && (
	                <div className="teams-tab__prd-desc" style={{ marginBottom: 'var(--hd-space-md)' }}>
                  本次会使用「{selectedTeam.name}」团队：{' '}
                  {selectedTeam.agents
                    .map((teamAgent) => agents.find((agent) => agent.id === teamAgent.agentId)?.name || teamAgent.role)
                    .join(' / ')}
	                </div>
	              )}
	              <div className="teams-tab__prd-desc" style={{ marginBottom: 'var(--hd-space-md)' }}>
	                UI风格馆会自动为这份 PRD 提取视觉气质：{prdUiStyleContext.styleNames.join(' / ')}
	                {prdUiStyleContext.savedFusionName ? `（复用融合：${prdUiStyleContext.savedFusionName}）` : ''}。填写问题时会实时更新，最终 PRD 会吸收颜色、材质、组件状态、动效和视觉验收标准。
	              </div>
	              {PRD_QUESTIONS.map((q) => (
                <div key={q.id} className="teams-tab__form-group">
                  <label className="teams-tab__form-label">{q.question}</label>
                  {q.type === 'select' ? (
                    <div className="teams-tab__form-radio-group">
                      {q.options?.map((opt) => (
                        <button
                          key={opt}
                          className={`teams-tab__form-radio ${prdAnswers[q.id] === opt ? 'teams-tab__form-radio--active' : ''}`}
                          onClick={() => setPrdAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                          disabled={prdGenerating}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : q.type === 'textarea' ? (
                    <textarea
                      className="teams-tab__form-textarea"
                      value={prdAnswers[q.id] || ''}
                      onChange={(e) => setPrdAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder={q.placeholder}
                      rows={3}
                      disabled={prdGenerating}
                    />
                  ) : (
                    <input
                      className="teams-tab__form-input"
                      value={prdAnswers[q.id] || ''}
                      onChange={(e) => setPrdAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder={q.placeholder}
                      disabled={prdGenerating}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="teams-tab__modal-footer">
              <button
                className="teams-tab__modal-btn teams-tab__modal-btn--cancel"
                onClick={() => setShowPrdModal(false)}
              >
                {prdGenerating ? '回到后台' : '取消'}
              </button>
              <button
                className="teams-tab__modal-btn teams-tab__modal-btn--save"
                onClick={handleGeneratePRD}
                disabled={prdGenerating || !prdAnswers.projectName?.trim() || !prdAnswers.coreProblem?.trim()}
              >
                {prdGenerating ? prdProgress : '开始生成 (4 轮)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
