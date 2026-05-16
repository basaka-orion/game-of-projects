/**
 * Openbasaka — 数字副官 / 智能体对话面板
 * Boss 的日常情报局与执行器
 * 与「项目的游戏」推演引擎深度集成
 *
 * Hermes 灵魂注入：
 * - Soul 面板：点击已选中的角色查看/编辑灵魂
 * - 脉冲光效：切换角色时的视觉反馈
 * - 智能匹配（原"自动路由"）：关键词匹配自动切换专家
 * - 群策入口：快速跳转到团队协作
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { LLMConfig, chatCompletionStream, resolveAgentConfig } from '../../lib/ai/provider'
import {
  buildRealtimeSearchQueries,
  dedupeRealtimeSearchItems,
  normalizeRealtimeSearchItems,
  preferReliableRealtimeSources,
  preferSpecificRealtimeItems,
  resolveRealtimeFreshnessWindow,
} from '../../lib/ai/realtime-grounding'
import { getSetting, getAllProjects } from '../../lib/db/store'
import { getAssessmentTimeline, getLatestAssessmentRun } from '../../lib/boss/profiling/service'
import {
  createSession,
  saveSession,
  loadSession,
  listSessions,
  loadSessionByAgent,
  listSessionsByAgent,
  ChatSession,
  SessionMessage,
} from '../../lib/chat/session'
import { assembleContext, detectProjectIdea } from '../../lib/chat/context'
import { routeToExpert, getExpertConfig, ExpertRole, getAllExperts } from '../../lib/chat/router'
import { parseToolCall, executeTool } from '../../lib/tools'
import { getSoul, saveSoul, resetSoul, renderSoulPrompt, AgentSoul } from '../../lib/agents/soul'
import {
  archivePendingArchiveCandidate,
  countPendingArchiveCandidates,
  dismissConversationArchiveCandidate,
  ensureConversationArchiveCandidate,
  formatArchivePath,
  getArchiveSourceSurfaceLabel,
  listConversationArchiveCandidates,
  listPendingArchiveBatchSessionCounts,
  listPendingArchiveCandidates,
  listPendingArchiveSourceSurfaceCounts,
  previewQimengArchive,
  QIMENG_FACET_OPTIONS,
  shouldOfferArchiveTag,
  type PendingArchiveCountOption,
  type ArchiveCandidate,
  type ArchiveSuggestion,
  type QimengFacet,
  updateConversationArchiveCandidate,
} from '../../lib/memory/archive-gate'
import {
  applyArchiveInboxBulkPatch,
  createEmptyArchiveInboxBulkDraft,
  filterAndSortPendingArchiveCandidates,
  formatArchiveBatchSessionLabel,
  getArchiveBatchSessionId,
  hasArchiveInboxBulkPatch,
  isArchiveDraftEqual,
  parseArchiveTags,
  uniqueArchiveOptions,
  type ArchiveDraft,
  type ArchiveInboxBulkDraft,
  type ArchiveInboxRiskFilter,
  type ArchiveInboxSort,
} from './archive-inbox'
import './Openbasaka.css'

const ARCHIVE_INBOX_PAGE_SIZE = 120

interface OpenbasakaProps {
  onSwitchToWarRoom: () => void
  onOpenProfilingStudio?: () => void
  onEvaluateProject?: (content: string) => void
}

type QuickAction = { icon: string; label: string; prompt: string } | { icon: string; label: string; action: () => void }

const FACET_LABELS: Record<QimengFacet, string> = {
  fact: '事实',
  event: '经历',
  discovery: '发现',
  preference: '偏好',
  advice: '建议',
  decision: '决策',
  question: '问题',
  wish: '心愿',
  pivot: '转向',
}

interface DirectRealtimeSearchItem {
  title: string
  description: string
  url: string
}

function parseRealtimeSearchItems(searchContext: string): DirectRealtimeSearchItem[] {
  const items: DirectRealtimeSearchItem[] = []
  const pattern = /【([^】]+)】([\s\S]*?)\n来源:\s*(https?:\/\/[^\s]+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(searchContext)) !== null) {
    items.push({
      title: match[1].trim(),
      description: match[2].replace(/\s+/g, ' ').trim(),
      url: match[3].trim(),
    })
  }
  return items
}

function buildDirectRealtimeAnswer(searchContext: string, userText: string, maxItems = 3): string | null {
  if (!searchContext.includes('<realtime-search-results>')) return null
  const wantsSourceFirst = /联网|搜索|查一下|直接|来源|链接|可核验|不要输出工具调用|给我\s*\d+\s*条/.test(userText)
  if (!wantsSourceFirst) return null

  const items = parseRealtimeSearchItems(searchContext).slice(0, maxItems)
  if (items.length === 0) return null

  const lines = items.map((item, index) => {
    const summary = item.description ? `\n   摘要：${item.description.slice(0, 180)}` : ''
    return `${index + 1}. ${item.title}${summary}\n   来源：${item.url}`
  })
  return `我已经联网搜索到 ${items.length} 条相关结果。按你的要求，先给出可核验来源：\n\n${lines.join('\n\n')}\n\n说明：以上是实时搜索结果摘要，具体发布时间和完整内容请以来源页面为准。`
}

type NormalizedRealtimeSearchItem = ReturnType<typeof normalizeRealtimeSearchItems>[number]

type OpenbasakaSearchOptions = {
  endpoint?: 'web' | 'news'
  freshness?: 'pd' | 'pw' | 'pm' | 'py'
  country?: string
  searchLang?: string
}

function createRealtimeSearchPlan(text: string, date = new Date()): Array<{ query: string; options: OpenbasakaSearchOptions }> {
  const freshnessWindow = resolveRealtimeFreshnessWindow(text)
  const month = date.toLocaleString('en-US', { month: 'long' })
  const year = date.getFullYear()
  const baseOptions = {
    freshness: freshnessWindow.freshness,
    country: 'US',
    searchLang: 'en',
  } satisfies Omit<OpenbasakaSearchOptions, 'endpoint'>
  const plan: Array<{ query: string; options: OpenbasakaSearchOptions }> = []

  if (/openai/i.test(text)) {
    plan.push(
      { query: `OpenAI latest product announcements model releases ${month} ${year}`, options: { ...baseOptions, endpoint: 'news' } },
      { query: `site:openai.com OpenAI product announcement model release ${month} ${year}`, options: { ...baseOptions, endpoint: 'web' } },
      { query: `OpenAI GPT product update API release ${month} ${year}`, options: { ...baseOptions, endpoint: 'news' } },
    )
  }

  for (const query of buildRealtimeSearchQueries(text, date)) {
    plan.push({ query, options: { ...baseOptions, endpoint: 'news' } })
  }

  const seen = new Set<string>()
  return plan.filter((item) => {
    const key = `${item.options.endpoint}:${item.query.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 6)
}

function filterRealtimeResultsForQuestion(items: NormalizedRealtimeSearchItem[], text: string): NormalizedRealtimeSearchItem[] {
  const blocked = /(zhihu\.com|github\.com\/[^/]+\/[^/]+\/issues|stackoverflow\.com|csdn\.net|接口连接失败|连接失败|无法联网|cannot provide a description)/i
  const wantsProductUpdate = /产品|product|模型|model|api|release|发布|announcement/i.test(text)
  const productBlocked = /(trial|lawsuit|court|jury|legal|musk|诉讼|官司|审判|陪审团)/i
  const cleaned = items.filter((item) => {
    const haystack = `${item.title} ${item.description} ${item.url}`
    if (blocked.test(haystack)) return false
    if (wantsProductUpdate && productBlocked.test(haystack)) return false
    return true
  })
  if (/openai/i.test(text)) {
    const openaiItems = cleaned.filter((item) => /openai/i.test(`${item.title} ${item.description} ${item.url}`))
    if (openaiItems.length >= 3) return openaiItems
  }
  return cleaned.length > 0 ? cleaned : items
}

function buildArchiveDraft(candidate: Pick<ArchiveSuggestion, 'title' | 'room' | 'tags' | 'facets' | 'targetKind'>): ArchiveDraft {
  return {
    title: candidate.title,
    room: candidate.room,
    tagsText: candidate.tags.join('，'),
    facets: [...candidate.facets],
    targetKind: candidate.targetKind,
  }
}

function formatArchiveSnippet(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 116) return normalized
  return `${normalized.slice(0, 116)}…`
}

function sortPendingCandidates(candidates: ArchiveCandidate[]): ArchiveCandidate[] {
  return [...candidates].sort((left, right) => {
    const leftTs = new Date(left.updatedAt || left.createdAt || 0).getTime()
    const rightTs = new Date(right.updatedAt || right.createdAt || 0).getTime()
    return rightTs - leftTs
  })
}

interface ArchiveEditorCardProps {
  candidate: ArchiveSuggestion
  storedCandidate?: ArchiveCandidate | null
  draft: ArchiveDraft
  busy?: boolean
  confirmLabel?: string
  busyLabel?: string
  cancelLabel?: string
  auxiliaryActionLabel?: string
  auxiliaryActionDisabled?: boolean
  onDraftChange: (patch: Partial<ArchiveDraft>) => void
  onFacetToggle: (facet: QimengFacet) => void
  onConfirm: () => void
  onCancel: () => void
  onAuxiliaryAction?: () => void
}

function ArchiveEditorCard({
  candidate,
  storedCandidate,
  draft,
  busy = false,
  confirmLabel = '确认归入《启蒙》',
  busyLabel = '正在入宫…',
  cancelLabel = '暂不归档',
  auxiliaryActionLabel,
  auxiliaryActionDisabled = false,
  onDraftChange,
  onFacetToggle,
  onConfirm,
  onCancel,
  onAuxiliaryAction,
}: ArchiveEditorCardProps) {
  return (
    <div className="openbasaka__archive-preview">
      <div className="openbasaka__archive-preview-head">
        <div>
          <div className="openbasaka__archive-preview-label">归档理由</div>
          <div className="openbasaka__archive-preview-copy">{candidate.rationale}</div>
        </div>
        <div className="openbasaka__archive-preview-path">
          {candidate.wingLabel} / {candidate.hallLabel} / {candidate.room}
        </div>
      </div>

      <div className="openbasaka__archive-preview-meta-grid">
        <div className="openbasaka__archive-preview-meta-card">
          <span className="openbasaka__archive-preview-label">来源指针</span>
          <span className="openbasaka__archive-preview-value">
            {storedCandidate?.preview.sourcePointer || 'Openbasaka · 正在准备来源索引'}
          </span>
        </div>
        <div className="openbasaka__archive-preview-meta-card">
          <span className="openbasaka__archive-preview-label">重复风险</span>
          <span className="openbasaka__archive-preview-value">
            {storedCandidate
              ? storedCandidate.preview.duplicateCount > 0
                ? `发现 ${storedCandidate.preview.duplicateCount} 条近重复抽屉`
                : '未发现重复抽屉'
              : '正在校验重复风险…'}
          </span>
        </div>
        <div className="openbasaka__archive-preview-meta-card">
          <span className="openbasaka__archive-preview-label">当前状态</span>
          <span className="openbasaka__archive-preview-value">
            {storedCandidate?.preview.isCustomized ? '已按你的判断微调' : '仍是系统建议草案'}
          </span>
        </div>
      </div>

      {storedCandidate && storedCandidate.preview.duplicateMatches.length > 0 && (
        <div className="openbasaka__archive-preview-duplicates">
          {storedCandidate.preview.duplicateMatches.map((match) => (
            <span key={match.id} className="openbasaka__archive-preview-duplicate-chip">
              {match.title} · {match.room}
            </span>
          ))}
        </div>
      )}

      <div className="openbasaka__archive-preview-grid">
        <label className="openbasaka__archive-field">
          <span className="openbasaka__archive-field-label">标题</span>
          <input
            className="openbasaka__archive-input"
            value={draft.title}
            onChange={(e) => onDraftChange({ title: e.target.value })}
            placeholder="这条记忆在《启蒙》里的标题"
          />
        </label>
        <label className="openbasaka__archive-field">
          <span className="openbasaka__archive-field-label">房间</span>
          <input
            className="openbasaka__archive-input"
            value={draft.room}
            onChange={(e) => onDraftChange({ room: e.target.value })}
            placeholder="这条记忆的归档房间"
          />
        </label>
        <label className="openbasaka__archive-field openbasaka__archive-field--full">
          <span className="openbasaka__archive-field-label">标签</span>
          <input
            className="openbasaka__archive-input"
            value={draft.tagsText}
            onChange={(e) => onDraftChange({ tagsText: e.target.value })}
            placeholder="多个标签请用逗号分隔"
          />
        </label>
        <div className="openbasaka__archive-field openbasaka__archive-field--full">
          <span className="openbasaka__archive-field-label">Facet</span>
          <div className="openbasaka__archive-facets">
            {QIMENG_FACET_OPTIONS.map((facet) => {
              const isActive = draft.facets.includes(facet)
              return (
                <button
                  key={facet}
                  type="button"
                  className={`openbasaka__archive-facet ${isActive ? 'openbasaka__archive-facet--active' : ''}`}
                  onClick={() => onFacetToggle(facet)}
                >
                  {FACET_LABELS[facet]}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="openbasaka__archive-actions">
        <button type="button" className="openbasaka__archive-confirm" onClick={onConfirm} disabled={busy}>
          {busy ? busyLabel : confirmLabel}
        </button>
        <button type="button" className="openbasaka__archive-cancel" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        {auxiliaryActionLabel && onAuxiliaryAction && (
          <button
            type="button"
            className="openbasaka__archive-dismiss"
            onClick={onAuxiliaryAction}
            disabled={busy || auxiliaryActionDisabled}
          >
            {auxiliaryActionLabel}
          </button>
        )}
      </div>
    </div>
  )
}

function renderMessageText(content: string) {
  const lines = content.split('\n')
  return lines.map((line, i) => (
    <span key={i}>
      {line
        .split(/(\*\*[^*]+\*\*)/)
        .map((part, j) =>
          part.startsWith('**') && part.endsWith('**') ? (
            <strong key={j}>{part.slice(2, -2)}</strong>
          ) : (
            <span key={j}>{part}</span>
          ),
        )}
      {i < lines.length - 1 && <br />}
    </span>
  ))
}

export default function Openbasaka({ onSwitchToWarRoom, onOpenProfilingStudio, onEvaluateProject }: OpenbasakaProps) {
  // llmConfig 不再用 useMemo 静态缓存，改为按角色动态解析
  const getLLMConfigForAgent = (role: string): LLMConfig => resolveAgentConfig(role)
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [projects, setProjects] = useState<Awaited<ReturnType<typeof getAllProjects>>>([])
  const [session, setSession] = useState<ChatSession>(() => createSession())
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeExpert, setActiveExpert] = useState<ExpertRole>('general')
  const [routingMode, setRoutingMode] = useState<'auto' | 'locked'>('locked')
  const [showExpertBar, setShowExpertBar] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showSandboxMenu, setShowSandboxMenu] = useState(false)
  const [showArchiveInbox, setShowArchiveInbox] = useState(false)
  const [projectIdeaDetected, setProjectIdeaDetected] = useState(false)
  const [pendingProjectText, setPendingProjectText] = useState('')
  const [archiveCandidates, setArchiveCandidates] = useState<Record<string, ArchiveCandidate>>({})
  const [pendingArchiveCandidates, setPendingArchiveCandidates] = useState<ArchiveCandidate[]>([])
  const [pendingArchiveTotalCount, setPendingArchiveTotalCount] = useState(0)
  const [archiveInboxScopeCount, setArchiveInboxScopeCount] = useState(0)
  const [archiveInboxSourceSurfaceCounts, setArchiveInboxSourceSurfaceCounts] = useState<PendingArchiveCountOption[]>(
    [],
  )
  const [archiveInboxBatchSessionCounts, setArchiveInboxBatchSessionCounts] = useState<PendingArchiveCountOption[]>([])
  const [archivingMessageIds, setArchivingMessageIds] = useState<Record<string, boolean>>({})
  const [preparingArchiveMessageIds, setPreparingArchiveMessageIds] = useState<Record<string, boolean>>({})
  const [archivePreviewMessageId, setArchivePreviewMessageId] = useState<string | null>(null)
  const [archiveInboxOpenCandidateId, setArchiveInboxOpenCandidateId] = useState<string | null>(null)
  const [archiveInboxBusyIds, setArchiveInboxBusyIds] = useState<Record<string, boolean>>({})
  const [archiveInboxLoading, setArchiveInboxLoading] = useState(false)
  const [archiveInboxBulkBusy, setArchiveInboxBulkBusy] = useState(false)
  const [archiveInboxPage, setArchiveInboxPage] = useState(1)
  const [archiveInboxQuery, setArchiveInboxQuery] = useState('')
  const [archiveInboxSourceSurfaceFilter, setArchiveInboxSourceSurfaceFilter] = useState('all')
  const [archiveInboxBatchSessionFilter, setArchiveInboxBatchSessionFilter] = useState('all')
  const [archiveInboxWingFilter, setArchiveInboxWingFilter] = useState('all')
  const [archiveInboxHallFilter, setArchiveInboxHallFilter] = useState('all')
  const [archiveInboxRiskFilter, setArchiveInboxRiskFilter] = useState<ArchiveInboxRiskFilter>('all')
  const [archiveInboxSort, setArchiveInboxSort] = useState<ArchiveInboxSort>('latest')
  const [archiveInboxBulkDraft, setArchiveInboxBulkDraft] = useState<ArchiveInboxBulkDraft>(() =>
    createEmptyArchiveInboxBulkDraft(),
  )
  const [archiveDrafts, setArchiveDrafts] = useState<Record<string, ArchiveDraft>>({})
  const [latestProfileRun, setLatestProfileRun] = useState<Awaited<ReturnType<typeof getLatestAssessmentRun>>>(null)
  const [profileTimeline, setProfileTimeline] = useState<
    Array<{
      id: string
      mode: 'quick' | 'deep' | 'dialogue'
      createdAt: string
      confidence: number
    }>
  >([])

  // Soul 面板状态
  const [showSoulPanel, setShowSoulPanel] = useState(false)
  const [soulData, setSoulData] = useState<AgentSoul | null>(null)
  const [soulEditing, setSoulEditing] = useState(false)
  const [soulEditText, setSoulEditText] = useState('')
  const [pulseAgent, setPulseAgent] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const sandboxMenuRef = useRef<HTMLDivElement>(null)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!showSandboxMenu) return

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (sandboxMenuRef.current?.contains(event.target as Node)) return
      setShowSandboxMenu(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [showSandboxMenu])

  const getVisibleArchiveInboxCandidates = useCallback(
    () =>
      filterAndSortPendingArchiveCandidates(pendingArchiveCandidates, {
        query: archiveInboxQuery,
        sourceSurface: archiveInboxSourceSurfaceFilter,
        batchSessionId: archiveInboxBatchSessionFilter,
        wing: archiveInboxWingFilter,
        hall: archiveInboxHallFilter,
        risk: archiveInboxRiskFilter,
        sort: archiveInboxSort,
      }),
    [
      archiveInboxBatchSessionFilter,
      archiveInboxHallFilter,
      archiveInboxQuery,
      archiveInboxRiskFilter,
      archiveInboxSourceSurfaceFilter,
      archiveInboxSort,
      archiveInboxWingFilter,
      pendingArchiveCandidates,
    ],
  )

  // 加载项目数据
  useEffect(() => {
    getAllProjects().then(setProjects)
    listSessions(15).then(setSessions)
    getLatestAssessmentRun()
      .then(setLatestProfileRun)
      .catch(() => {})
    getAssessmentTimeline()
      .then((rows) => setProfileTimeline(rows.slice(0, 3)))
      .catch(() => {})
  }, [])

  // 尝试恢复上次会话
  useEffect(() => {
    async function restore() {
      const recent = await listSessions(1)
      if (recent.length > 0) {
        const loaded = await loadSession(recent[0].id)
        if (loaded && loaded.messages.length > 0) {
          setSession(loaded)
          setMessages(loaded.messages)
          return
        }
      }
      // 无历史会话，显示欢迎消息
      if (messages.length === 0) {
        const bossName = getSetting('boss_name', 'Boss')
        const welcome: SessionMessage = {
          id: 'welcome',
          role: 'assistant',
          content: `${bossName}，BASAKA 已就位 🫡\n\n我是 openbasaka 智能体平台的私人副官，可以帮你：\n- 💡 **头脑风暴** — 聊聊你的新想法\n- 📊 **项目复盘** — 分析推演历史\n- 🎯 **策略建议** — 当前该聚焦什么\n- 🔬 **趋势雷达** — 哪些赛道在起飞\n- 🔍 **网络搜索** — 实时获取市场数据（需启动 Fetch MCP）\n\n想把灵感扔进**推演引擎**？点击右上角切换到「战争推演室」。\n\n有什么想聊的？`,
          timestamp: Date.now(),
        }
        setMessages([welcome])
      }
    }
    restore()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 切换 Agent 时保存当前会话、加载目标 Agent 的会话
  const prevExpertRef = useRef(activeExpert)
  useEffect(() => {
    if (prevExpertRef.current === activeExpert) return
    const prevExpert = prevExpertRef.current
    prevExpertRef.current = activeExpert

    // 保存旧会话
    if (messages.length > 0) {
      saveSession({ ...session, messages, agentRole: prevExpert }).catch(() => {})
    }

    // 加载或创建新 agent 的会话
    async function switchAgentSession() {
      const loaded = await loadSessionByAgent(activeExpert)
      if (loaded && loaded.messages.length > 0) {
        setSession(loaded)
        setMessages(loaded.messages)
      } else {
        const fresh = createSession(activeExpert)
        setSession(fresh)
        setMessages([])
      }
      // 更新历史列表
      const agentSessions = await listSessionsByAgent(activeExpert, 15)
      setSessions(agentSessions)
    }
    switchAgentSession()
  }, [activeExpert]) // eslint-disable-line react-hooks/exhaustive-deps

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingText])

  useEffect(() => {
    setArchiveCandidates({})
    setPendingArchiveTotalCount(0)
    setArchiveInboxScopeCount(0)
    setArchiveInboxSourceSurfaceCounts([])
    setArchiveInboxBatchSessionCounts([])
    setArchivingMessageIds({})
    setPreparingArchiveMessageIds({})
    setArchivePreviewMessageId(null)
    setArchiveInboxOpenCandidateId(null)
    setArchiveInboxBusyIds({})
    setArchiveInboxPage(1)
    setArchiveInboxSourceSurfaceFilter('all')
    setArchiveInboxBatchSessionFilter('all')
    setArchiveInboxBulkDraft(createEmptyArchiveInboxBulkDraft())
    setArchiveDrafts({})
  }, [session.id])

  const refreshPendingArchiveCandidates = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setArchiveInboxLoading(true)
      try {
        const scope = {
          sourceSurface: archiveInboxSourceSurfaceFilter,
          batchSessionId: archiveInboxBatchSessionFilter,
        }
        const offset = (archiveInboxPage - 1) * ARCHIVE_INBOX_PAGE_SIZE
        const [rows, totalCount, scopeCount] = await Promise.all([
          listPendingArchiveCandidates({
            limit: ARCHIVE_INBOX_PAGE_SIZE,
            offset,
            ...scope,
          }),
          countPendingArchiveCandidates('all'),
          countPendingArchiveCandidates(scope),
        ])
        const [sourceSurfaceCounts, batchSessionCounts] = await Promise.all([
          listPendingArchiveSourceSurfaceCounts(),
          listPendingArchiveBatchSessionCounts(scope.sourceSurface),
        ])
        setPendingArchiveCandidates(sortPendingCandidates(rows))
        setPendingArchiveTotalCount(totalCount)
        setArchiveInboxScopeCount(scopeCount)
        setArchiveInboxSourceSurfaceCounts(sourceSurfaceCounts)
        setArchiveInboxBatchSessionCounts(batchSessionCounts)
      } catch (err) {
        console.warn('[Openbasaka] pending archive inbox sync failed:', err)
      } finally {
        if (!options?.silent) setArchiveInboxLoading(false)
      }
    },
    [archiveInboxBatchSessionFilter, archiveInboxPage, archiveInboxSourceSurfaceFilter],
  )

  const reconcileArchiveCandidate = useCallback(
    (candidate: ArchiveCandidate | null) => {
      if (!candidate) return

      setPendingArchiveCandidates((prev) => {
        if (candidate.status !== 'pending') {
          return prev.filter((item) => item.id !== candidate.id)
        }
        const next = prev.filter((item) => item.id !== candidate.id)
        next.unshift(candidate)
        return sortPendingCandidates(next)
      })

      setArchiveDrafts((prev) => {
        const keys = candidate.conversationId === session.id ? [candidate.id, candidate.messageId] : [candidate.id]
        let changed = false
        const next = { ...prev }

        if (candidate.status !== 'pending') {
          for (const key of keys) {
            if (next[key]) {
              delete next[key]
              changed = true
            }
          }
          return changed ? next : prev
        }

        const syncedDraft = buildArchiveDraft(candidate)
        for (const key of keys) {
          if (next[key] && !isArchiveDraftEqual(next[key], syncedDraft)) {
            next[key] = syncedDraft
            changed = true
          }
        }
        return changed ? next : prev
      })

      if (candidate.conversationId === session.id) {
        setArchiveCandidates((prev) => ({
          ...prev,
          [candidate.messageId]: candidate,
        }))
      }
    },
    [session.id],
  )

  useEffect(() => {
    refreshPendingArchiveCandidates().catch(() => {})
  }, [refreshPendingArchiveCandidates])

  useEffect(() => {
    let cancelled = false

    async function syncArchiveCandidates() {
      if (!session.id || messages.length === 0) {
        if (!cancelled) setArchiveCandidates({})
        refreshPendingArchiveCandidates({ silent: true }).catch(() => {})
        return
      }

      const agentRole = session.agentRole || activeExpert
      const archivableMessages = messages.filter(shouldOfferArchiveTag)
      if (archivableMessages.length === 0) {
        if (!cancelled) setArchiveCandidates({})
        refreshPendingArchiveCandidates({ silent: true }).catch(() => {})
        return
      }

      try {
        await Promise.all(
          archivableMessages.map((message) =>
            ensureConversationArchiveCandidate({
              conversationId: session.id,
              message,
              agentRole,
            }),
          ),
        )
        const rows = await listConversationArchiveCandidates(session.id)
        if (!cancelled) {
          setArchiveCandidates(Object.fromEntries(rows.map((row) => [row.messageId, row])))
        }
        refreshPendingArchiveCandidates({ silent: true }).catch(() => {})
      } catch (err) {
        console.warn('[Openbasaka] archive candidate sync failed:', err)
      }
    }

    syncArchiveCandidates()

    return () => {
      cancelled = true
    }
  }, [messages, session.id, session.agentRole, activeExpert, refreshPendingArchiveCandidates])

  // 自动保存（防抖 5 秒）
  const scheduleAutoSave = useCallback((msgs: SessionMessage[], sess: ChatSession) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      const toSave = { ...sess, messages: msgs }
      saveSession(toSave).catch(() => {})
      setSessions((prev) => {
        const exists = prev.find((s) => s.id === sess.id)
        if (exists) return prev
        return [{ id: sess.id, title: '', messages: [], updatedAt: new Date().toISOString() }, ...prev]
      })
    }, 5000)
  }, [])

  // 打开 Soul 面板
  const openSoulPanel = useCallback(async (agentId: string) => {
    try {
      const soul = await getSoul(agentId)
      setSoulData(soul)
      setSoulEditText(renderSoulPrompt(soul))
      setShowSoulPanel(true)
      setSoulEditing(false)
    } catch {
      setSoulData(null)
      setShowSoulPanel(false)
    }
  }, [])

  // 保存 Soul 编辑
  const saveSoulEdit = useCallback(async () => {
    if (!soulData || !activeExpert) return
    try {
      // 简单解析：将编辑文本作为 customOverride
      const updated = { ...soulData, customOverride: soulEditText }
      await saveSoul(activeExpert, updated)
      setSoulData(updated)
      setSoulEditing(false)
    } catch (err) {
      console.error('Soul 保存失败:', err)
    }
  }, [soulData, activeExpert, soulEditText])

  // 重置 Soul
  const handleResetSoul = useCallback(async () => {
    if (!activeExpert) return
    await resetSoul(activeExpert)
    const soul = await getSoul(activeExpert)
    setSoulData(soul)
    setSoulEditText(renderSoulPrompt(soul))
    setSoulEditing(false)
  }, [activeExpert])

  // 专家按钮点击处理（Hermes 风格：单击选中 + 脉冲，再次点击打开 Soul）
  const handleExpertClick = useCallback(
    (role: string) => {
      if (activeExpert === role) {
        // 再次点击已选中的角色 → 打开 Soul 面板
        openSoulPanel(role)
      } else {
        // 切换角色 → 脉冲光效
        setActiveExpert(role as ExpertRole)
        setPulseAgent(role)
        setTimeout(() => setPulseAgent(null), 600)
        setShowExpertBar(false)
      }
    },
    [activeExpert, openSoulPanel],
  )

  // 自动检测时事类问题并搜索
  const autoSearchIfNeeded = useCallback(async (text: string): Promise<string> => {
    const realtimeSignals = [
      // 时间信号
      /今天|昨天|前天|最近|最新|目前|当前|现在|这几天|近期|本周|本月|上周/,
      /几号|什么时候|何时/,
      // 时事类
      /时事|资讯|情报|新闻|热点|热搜|舆论|头条|快报|简报|要闻|大事/,
      /局势|战况|进展|动态|发布会|声明|公告/,
      /2025|2026/,
      // 人物（case-insensitive）
      /谁.*(主席|总统|当选|就任|去世|逝世)/,
      /郑丽文|特朗普|trump|拜登|biden|习近平|蔡英文|赖清德|马斯克|musk/i,
      // 市场
      /股价|市值|涨了|跌了|收盘|开盘|A股|美股|纳斯达克|比特币|BTC/i,
      // 天气/灾害
      /天气|温度|台风|地震|灾害/,
      // AI 行业（case-insensitive）
      /openai|anthropic|google.*ai|gpt|claude|gemini|deepseek|minimax|大模型.*发布|llama|mistral|meta.*ai/i,
      // 明确的搜索指令
      /搜一下|搜索|查一下|帮我查|了解一下/,
      // 动态意图：主语 + 动作/计划/下一步
      /下一步|动作|计划|战略|布局|路线图|发展方向|怎么样了/,
    ]
    const needsSearch = realtimeSignals.some((r) => r.test(text))
    if (!needsSearch) {
      console.log('[Search] 未触发搜索信号:', text.slice(0, 50))
      return ''
    }

    console.log('[Search] 触发搜索:', text.slice(0, 50))

    try {
      const date = new Date()
      const searchPlan = createRealtimeSearchPlan(text, date)
      const settled = await Promise.allSettled(
        searchPlan.map((item) => window.electronAPI?.braveSearch?.(item.query, 5, item.options)),
      )
      const allResults = settled.flatMap((result, index) => {
        if (result.status !== 'fulfilled' || !result.value?.success) return []
        return normalizeRealtimeSearchItems(result.value.data, {
          endpoint: searchPlan[index]?.options.endpoint,
          date,
        })
      })
      const rankedResults = filterRealtimeResultsForQuestion(
        preferSpecificRealtimeItems(
          preferReliableRealtimeSources(dedupeRealtimeSearchItems(allResults), 3),
          3,
        ),
        text,
      )

      if (rankedResults.length > 0) {
        const results = rankedResults
          .slice(0, 5)
          .map((r) => `【${r.title}】${r.description || ''}${r.age ? ` (${r.age})` : ''}\n来源: ${r.url}`)
        console.log(`[Search] 找到 ${results.length} 条结果`)
        return `\n\n<realtime-search-results>\n以下是刚才从互联网搜索到的实时信息（${date.toLocaleDateString('zh-CN')}），请严格基于这些数据回答，不要编造不在搜索结果中的信息：\n${results.join('\n\n')}\n</realtime-search-results>`
      }

      const errors = settled
        .map((result) => (result.status === 'fulfilled' && !result.value?.success ? result.value?.error : ''))
        .filter(Boolean)
      if (errors.length > 0) console.warn('[Search] 搜索通道返回空结果:', errors.join('; '))
      return '\n\n<search-status>搜索完成但未找到相关结果，以下回答基于模型已有知识。</search-status>'
    } catch (err) {
      console.error('[Search] 搜索失败:', err)
      return '\n\n<search-status>联网搜索失败，以下回答基于模型已有知识，可能不包含最新信息。请注意甄别。</search-status>'
    }
  }, [])

  // 发送消息
  const sendMessage = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText || input).trim()
      if (!text || isStreaming) return

      // 路由到专家（locked 模式保持手动选择，auto 模式自动检测）
      let expert = activeExpert
      if (routingMode === 'auto') {
        const detected = routeToExpert(text)
        if (detected !== 'general') expert = detected
      }
      setActiveExpert(expert)
      const expertConfig = getExpertConfig(expert)

      // 检测项目构想
      if (detectProjectIdea(text)) {
        setProjectIdeaDetected(true)
        setPendingProjectText(text)
      } else {
        setProjectIdeaDetected(false)
      }

      const userMsg: SessionMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: Date.now(),
      }

      const newMessages = [...messages, userMsg]
      setMessages(newMessages)
      setInput('')
      setIsStreaming(true)
      setStreamingText('')

      try {
        // 自动搜索实时信息（在组装上下文之前）
        setStreamingText('🔍 正在搜索实时信息...')
        const searchContext = await autoSearchIfNeeded(text)
        const directRealtimeAnswer = buildDirectRealtimeAnswer(searchContext, text)
        if (directRealtimeAnswer) {
          const allMsgs = [
            ...newMessages,
            {
              id: `asst-${Date.now()}`,
              role: 'assistant' as const,
              content: directRealtimeAnswer,
              timestamp: Date.now(),
            },
          ]
          setMessages(allMsgs)
          setStreamingText('')
          setIsStreaming(false)
          scheduleAutoSave(allMsgs, session)
          return
        }

        // 组装上下文（10 层 Hermes 风格）
        const contextBase = await assembleContext(
          projects.map((p) => ({
            title: p.title,
            survivalRate: p.survivalRate,
            survivalGrade: p.survivalGrade,
            oneLiner: p.oneLiner,
          })),
          expert, // 传递当前活跃角色
        )
        const searchAnswerRule = searchContext
          ? '\n\n<search-answer-rule>已经提供 realtime-search-results 时，禁止再输出 <tool_call>、JSON 工具调用或“我将搜索”。必须直接基于搜索结果回答，并列出来源 URL；不在搜索结果里的内容标为待核验。</search-answer-rule>'
          : ''
        const systemPrompt = contextBase + searchContext + searchAnswerRule
        setStreamingText('')

        const chatMessages = [
          { role: 'system' as const, content: systemPrompt },
          ...newMessages
            .filter((m) => m.role !== 'system')
            .map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })),
        ]

        let fullText = ''
        const agentLLMConfig = getLLMConfigForAgent(expert)
        await chatCompletionStream(
          agentLLMConfig,
          chatMessages,
          {
            onChunk: (chunk) => {
              fullText += chunk
              setStreamingText(fullText)
            },
            onDone: async (final) => {
              // 检测是否包含工具调用（如 {"tool": "web_search", "params": {...}}）
              const toolCall = parseToolCall(final)
              if (toolCall) {
                setStreamingText(final + '\n\n⏳ 正在调用 ' + toolCall.tool + '...')
                try {
                  const toolResult = await executeTool(toolCall.tool, toolCall.params)
                  // 将工具结果送回 LLM 生成最终回答
                  const followUpMessages = [
                    { role: 'system' as const, content: systemPrompt },
                    ...newMessages
                      .filter((m) => m.role !== 'system')
                      .map((m) => ({
                        role: m.role as 'user' | 'assistant',
                        content: m.content,
                      })),
                    { role: 'assistant' as const, content: final },
                    {
                      role: 'user' as const,
                      content: `工具 ${toolCall.tool} 的结果如下：\n${JSON.stringify(toolResult.data)}\n\n请基于这个真实数据给出最终回答。`,
                    },
                  ]
                  let finalAnswer = ''
                  await chatCompletionStream(
                    agentLLMConfig,
                    followUpMessages,
                    {
                      onChunk: (chunk) => {
                        finalAnswer += chunk
                        setStreamingText(finalAnswer)
                      },
                      onDone: (answer) => {
                        const allMsgs = [
                          ...newMessages,
                          {
                            id: `asst-${Date.now()}`,
                            role: 'assistant' as const,
                            content: answer,
                            timestamp: Date.now(),
                          },
                        ]
                        setMessages(allMsgs)
                        setStreamingText('')
                        setIsStreaming(false)
                        scheduleAutoSave(allMsgs, session)
                      },
                      onError: () => {
                        // 工具后 LLM 失败，展示工具结果
                        const allMsgs = [
                          ...newMessages,
                          {
                            id: `asst-${Date.now()}`,
                            role: 'assistant' as const,
                            content: `基于 ${toolCall.tool} 的搜索结果：\n${typeof toolResult.data === 'string' ? toolResult.data : JSON.stringify(toolResult.data, null, 2).slice(0, 2000)}`,
                            timestamp: Date.now(),
                          },
                        ]
                        setMessages(allMsgs)
                        setStreamingText('')
                        setIsStreaming(false)
                        scheduleAutoSave(allMsgs, session)
                      },
                    },
                    expertConfig.temperature,
                  )
                } catch {
                  // 工具调用失败，展示原始回复（去掉工具调用指令）
                  const allMsgs = [
                    ...newMessages,
                    {
                      id: `asst-${Date.now()}`,
                      role: 'assistant' as const,
                      content: final.replace(/\{"tool":\s*"[^"]+",\s*"params":\s*\{[^}]*\}\}/g, '(工具暂不可用)'),
                      timestamp: Date.now(),
                    },
                  ]
                  setMessages(allMsgs)
                  setStreamingText('')
                  setIsStreaming(false)
                  scheduleAutoSave(allMsgs, session)
                }
                return
              }

              const allMsgs = [
                ...newMessages,
                {
                  id: `asst-${Date.now()}`,
                  role: 'assistant' as const,
                  content: final,
                  timestamp: Date.now(),
                },
              ]
              setMessages(allMsgs)
              setStreamingText('')
              setIsStreaming(false)
              // 自动保存
              scheduleAutoSave(allMsgs, session)
            },
            onError: (err) => {
              setMessages((prev) => [
                ...prev,
                {
                  id: `err-${Date.now()}`,
                  role: 'assistant',
                  content: `⚠️ 连接错误: ${err.message}\n\n可能原因：\n- API Key 未配置或已失效\n- 网络连接问题\n- 浏览器 CORS 限制（桌面端可解决）`,
                  timestamp: Date.now(),
                },
              ])
              setStreamingText('')
              setIsStreaming(false)
            },
          },
          expertConfig.temperature,
        )
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `⚠️ ${(err as Error).message}`,
            timestamp: Date.now(),
          },
        ])
        setStreamingText('')
        setIsStreaming(false)
      }
    },
    [input, isStreaming, messages, projects, session, scheduleAutoSave, autoSearchIfNeeded, activeExpert],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage()
      }
    },
    [sendMessage],
  )

  const toggleHistoryPanel = useCallback(() => {
    setShowHistory((prev) => {
      const next = !prev
      if (next) setShowArchiveInbox(false)
      return next
    })
  }, [])

  const toggleArchiveInbox = useCallback(() => {
    setShowArchiveInbox((prev) => {
      const next = !prev
      if (next) {
        setShowHistory(false)
        refreshPendingArchiveCandidates().catch(() => {})
      }
      return next
    })
  }, [refreshPendingArchiveCandidates])

  const toggleSandboxMenu = useCallback(() => {
    setShowSandboxMenu((prev) => {
      const next = !prev
      if (next) setShowExpertBar(false)
      return next
    })
  }, [])

  const openSandboxWindow = useCallback(() => {
    setShowSandboxMenu(false)
    if (window.electronAPI?.openSandbox) {
      window.electronAPI.openSandbox()
      return
    }
    window.location.hash = '#/sandbox'
  }, [])

  const openArchiveInboxFromSandbox = useCallback(() => {
    setShowSandboxMenu(false)
    setShowHistory(false)
    setShowArchiveInbox(true)
    refreshPendingArchiveCandidates().catch(() => {})
  }, [refreshPendingArchiveCandidates])

  const openProfilingFromSandbox = useCallback(() => {
    setShowSandboxMenu(false)
    onOpenProfilingStudio?.()
  }, [onOpenProfilingStudio])

  const openWarRoomFromSandbox = useCallback(() => {
    setShowSandboxMenu(false)
    onSwitchToWarRoom()
  }, [onSwitchToWarRoom])

  // 新建对话
  const newChat = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    const fresh = createSession()
    setSession(fresh)
    setMessages([])
    setActiveExpert('general')
    setProjectIdeaDetected(false)
    setShowHistory(false)
    setShowArchiveInbox(false)
  }, [])

  // 加载历史会话
  const loadHistory = useCallback(async (id: string) => {
    const loaded = await loadSession(id)
    if (loaded) {
      setSession(loaded)
      setMessages(loaded.messages)
      setShowHistory(false)
      setShowArchiveInbox(false)
    }
  }, [])

  const handleArchiveDraftChange = useCallback((messageId: string, patch: Partial<ArchiveDraft>) => {
    setArchiveDrafts((prev) => {
      const draft = prev[messageId]
      if (!draft) return prev
      return {
        ...prev,
        [messageId]: {
          ...draft,
          ...patch,
        },
      }
    })
  }, [])

  const handleArchiveFacetToggle = useCallback((messageId: string, facet: QimengFacet) => {
    setArchiveDrafts((prev) => {
      const draft = prev[messageId]
      if (!draft) return prev
      const hasFacet = draft.facets.includes(facet)
      const nextFacets = hasFacet ? draft.facets.filter((item) => item !== facet) : [...draft.facets, facet]

      return {
        ...prev,
        [messageId]: {
          ...draft,
          facets: nextFacets,
        },
      }
    })
  }, [])

  const persistArchiveCandidateDraft = useCallback(
    (candidateId: string, draft: ArchiveDraft) =>
      updateConversationArchiveCandidate({
        candidateId,
        title: draft.title,
        room: draft.room,
        tags: parseArchiveTags(draft.tagsText),
        facets: draft.facets,
      }),
    [],
  )

  const handleArchiveInboxBulkDraftChange = useCallback((patch: Partial<ArchiveInboxBulkDraft>) => {
    setArchiveInboxBulkDraft((prev) => ({
      ...prev,
      ...patch,
    }))
  }, [])

  const handleArchiveInboxBulkFacetToggle = useCallback((facet: QimengFacet) => {
    setArchiveInboxBulkDraft((prev) => {
      const hasFacet = prev.facets.includes(facet)
      return {
        ...prev,
        facets: hasFacet ? prev.facets.filter((item) => item !== facet) : [...prev.facets, facet],
      }
    })
  }, [])

  const resetArchiveInboxBulkDraft = useCallback(() => {
    setArchiveInboxBulkDraft(createEmptyArchiveInboxBulkDraft())
  }, [])

  const resetArchiveInboxFilters = useCallback(() => {
    setArchiveInboxPage(1)
    setArchiveInboxQuery('')
    setArchiveInboxSourceSurfaceFilter('all')
    setArchiveInboxBatchSessionFilter('all')
    setArchiveInboxWingFilter('all')
    setArchiveInboxHallFilter('all')
    setArchiveInboxRiskFilter('all')
    setArchiveInboxSort('latest')
  }, [])

  const handleArchiveTagClick = useCallback(
    async (message: SessionMessage) => {
      if (!session.id || archivingMessageIds[message.id]) return

      const currentCandidate = archiveCandidates[message.id]
      if (currentCandidate?.status === 'archived' || currentCandidate?.status === 'dismissed') return

      const fallbackSuggestion = currentCandidate || previewQimengArchive(message, session.agentRole || activeExpert)
      setArchiveDrafts((prev) =>
        prev[message.id] ? prev : { ...prev, [message.id]: buildArchiveDraft(fallbackSuggestion) },
      )
      setArchivePreviewMessageId((prev) => (prev === message.id ? null : message.id))

      if (currentCandidate || preparingArchiveMessageIds[message.id]) return

      setPreparingArchiveMessageIds((prev) => ({ ...prev, [message.id]: true }))
      try {
        const candidate = await ensureConversationArchiveCandidate({
          conversationId: session.id,
          message,
          agentRole: session.agentRole || activeExpert,
        })
        if (candidate) {
          reconcileArchiveCandidate(candidate)
        }
      } catch (err) {
        console.error('[Openbasaka] archive preview failed:', err)
      } finally {
        setPreparingArchiveMessageIds((prev) => {
          const next = { ...prev }
          delete next[message.id]
          return next
        })
      }
    },
    [
      activeExpert,
      archiveCandidates,
      archivingMessageIds,
      preparingArchiveMessageIds,
      reconcileArchiveCandidate,
      session.id,
      session.agentRole,
    ],
  )

  const handleArchiveMessage = useCallback(
    async (message: SessionMessage) => {
      if (!session.id || archivingMessageIds[message.id]) return

      setArchivingMessageIds((prev) => ({ ...prev, [message.id]: true }))
      try {
        const existingCandidate =
          archiveCandidates[message.id] ||
          (await ensureConversationArchiveCandidate({
            conversationId: session.id,
            message,
            agentRole: session.agentRole || activeExpert,
          }))

        if (!existingCandidate) return

        const draft = archiveDrafts[message.id] || buildArchiveDraft(existingCandidate)
        const updatedCandidate = await persistArchiveCandidateDraft(existingCandidate.id, draft)
        if (updatedCandidate) {
          reconcileArchiveCandidate(updatedCandidate)
        }
        const archived = await archivePendingArchiveCandidate(existingCandidate.id)

        if (archived) {
          reconcileArchiveCandidate(archived)
          setArchivePreviewMessageId((prev) => (prev === message.id ? null : prev))
        }
        refreshPendingArchiveCandidates({ silent: true }).catch(() => {})
      } catch (err) {
        console.error('[Openbasaka] archive failed:', err)
      } finally {
        setArchivingMessageIds((prev) => {
          const next = { ...prev }
          delete next[message.id]
          return next
        })
      }
    },
    [
      activeExpert,
      archiveCandidates,
      archiveDrafts,
      archivingMessageIds,
      persistArchiveCandidateDraft,
      reconcileArchiveCandidate,
      refreshPendingArchiveCandidates,
      session.id,
      session.agentRole,
    ],
  )

  const openArchiveInboxCandidate = useCallback((candidate: ArchiveCandidate) => {
    setArchiveDrafts((prev) => (prev[candidate.id] ? prev : { ...prev, [candidate.id]: buildArchiveDraft(candidate) }))
    setArchiveInboxOpenCandidateId((prev) => (prev === candidate.id ? null : candidate.id))
  }, [])

  const handleArchiveInboxConfirm = useCallback(
    async (candidate: ArchiveCandidate) => {
      if (archiveInboxBusyIds[candidate.id]) return

      setArchiveInboxBusyIds((prev) => ({ ...prev, [candidate.id]: true }))
      try {
        const draft = archiveDrafts[candidate.id] || buildArchiveDraft(candidate)
        const updatedCandidate = await persistArchiveCandidateDraft(candidate.id, draft)
        if (updatedCandidate) reconcileArchiveCandidate(updatedCandidate)

        const archived = await archivePendingArchiveCandidate(candidate.id)
        if (archived) {
          reconcileArchiveCandidate(archived)
          setArchiveInboxOpenCandidateId((prev) => (prev === candidate.id ? null : prev))
        }
        refreshPendingArchiveCandidates({ silent: true }).catch(() => {})
      } catch (err) {
        console.error('[Openbasaka] archive inbox confirm failed:', err)
      } finally {
        setArchiveInboxBusyIds((prev) => {
          const next = { ...prev }
          delete next[candidate.id]
          return next
        })
      }
    },
    [
      archiveDrafts,
      archiveInboxBusyIds,
      persistArchiveCandidateDraft,
      reconcileArchiveCandidate,
      refreshPendingArchiveCandidates,
    ],
  )

  const handleArchiveInboxDismiss = useCallback(
    async (candidate: ArchiveCandidate) => {
      if (archiveInboxBusyIds[candidate.id]) return

      setArchiveInboxBusyIds((prev) => ({ ...prev, [candidate.id]: true }))
      try {
        const dismissed = await dismissConversationArchiveCandidate(candidate.id)
        if (dismissed) {
          reconcileArchiveCandidate(dismissed)
          setArchiveInboxOpenCandidateId((prev) => (prev === candidate.id ? null : prev))
        }
        refreshPendingArchiveCandidates({ silent: true }).catch(() => {})
      } catch (err) {
        console.error('[Openbasaka] archive inbox dismiss failed:', err)
      } finally {
        setArchiveInboxBusyIds((prev) => {
          const next = { ...prev }
          delete next[candidate.id]
          return next
        })
      }
    },
    [archiveInboxBusyIds, reconcileArchiveCandidate, refreshPendingArchiveCandidates],
  )

  const handleArchiveInboxApplyBulkPatch = useCallback(async () => {
    if (archiveInboxBulkBusy) return

    const visibleCandidates = getVisibleArchiveInboxCandidates()
    if (visibleCandidates.length === 0 || !hasArchiveInboxBulkPatch(archiveInboxBulkDraft)) return

    setArchiveInboxBulkBusy(true)
    try {
      const nextDraftEntries: Record<string, ArchiveDraft> = {}

      for (const candidate of visibleCandidates) {
        const currentDraft = archiveDrafts[candidate.id] || buildArchiveDraft(candidate)
        const nextDraft = applyArchiveInboxBulkPatch(currentDraft, archiveInboxBulkDraft)
        nextDraftEntries[candidate.id] = nextDraft

        if (isArchiveDraftEqual(currentDraft, nextDraft)) continue

        const updatedCandidate = await persistArchiveCandidateDraft(candidate.id, nextDraft)
        if (updatedCandidate) reconcileArchiveCandidate(updatedCandidate)
      }

      setArchiveDrafts((prev) => ({
        ...prev,
        ...nextDraftEntries,
      }))
      resetArchiveInboxBulkDraft()
      refreshPendingArchiveCandidates({ silent: true }).catch(() => {})
    } catch (err) {
      console.error('[Openbasaka] archive inbox bulk patch failed:', err)
    } finally {
      setArchiveInboxBulkBusy(false)
    }
  }, [
    archiveDrafts,
    archiveInboxBulkBusy,
    archiveInboxBulkDraft,
    getVisibleArchiveInboxCandidates,
    persistArchiveCandidateDraft,
    reconcileArchiveCandidate,
    refreshPendingArchiveCandidates,
    resetArchiveInboxBulkDraft,
  ])

  const handleArchiveInboxBulkAction = useCallback(
    async (action: 'confirm' | 'dismiss') => {
      if (archiveInboxBulkBusy) return

      const visibleCandidates = getVisibleArchiveInboxCandidates()
      if (visibleCandidates.length === 0) return

      setArchiveInboxBulkBusy(true)
      try {
        for (const candidate of visibleCandidates) {
          if (action === 'confirm') {
            const draft = archiveDrafts[candidate.id] || buildArchiveDraft(candidate)
            const updatedCandidate = await persistArchiveCandidateDraft(candidate.id, draft)
            if (updatedCandidate) reconcileArchiveCandidate(updatedCandidate)

            const archived = await archivePendingArchiveCandidate(candidate.id)
            if (archived) reconcileArchiveCandidate(archived)
          } else {
            const dismissed = await dismissConversationArchiveCandidate(candidate.id)
            if (dismissed) reconcileArchiveCandidate(dismissed)
          }
        }

        setArchiveInboxOpenCandidateId((current) =>
          current && visibleCandidates.some((candidate) => candidate.id === current) ? null : current,
        )
        refreshPendingArchiveCandidates({ silent: true }).catch(() => {})
      } catch (err) {
        console.error(`[Openbasaka] archive inbox bulk ${action} failed:`, err)
      } finally {
        setArchiveInboxBulkBusy(false)
      }
    },
    [
      archiveDrafts,
      archiveInboxBulkBusy,
      getVisibleArchiveInboxCandidates,
      persistArchiveCandidateDraft,
      reconcileArchiveCandidate,
      refreshPendingArchiveCandidates,
    ],
  )

  // 快速操作
  const quickActions: QuickAction[] = [
    { icon: '💡', label: '项目灵感', prompt: '帮我头脑风暴一个有潜力的 AI 项目创意' },
    { icon: '📊', label: '复盘历史', prompt: '帮我分析一下已有的推演记录，有什么规律？' },
    { icon: '🌍', label: '趋势预判', prompt: '2025年有哪些值得关注的技术趋势和创业机会？' },
    { icon: '🎯', label: '今日聚焦', prompt: '根据我的兴趣和现有项目，今天我应该聚焦什么？' },
    { icon: '🧠', label: '开始完整画像', action: () => onOpenProfilingStudio?.() },
  ]

  function formatProfileMode(mode: 'quick' | 'deep' | 'dialogue'): string {
    switch (mode) {
      case 'quick':
        return '快速画像'
      case 'deep':
        return '完整测评'
      case 'dialogue':
        return '对话锚定'
    }
  }

  const experts = getAllExperts()
  const archiveInboxSourceSurfaceOptions = archiveInboxSourceSurfaceCounts.map((option) => option.value)
  const archiveInboxBatchSessionOptions = archiveInboxBatchSessionCounts.map((option) => ({
    id: option.value,
    label: formatArchiveBatchSessionLabel(option.value),
    count: option.count,
  }))
  const archiveInboxWingOptions = uniqueArchiveOptions(pendingArchiveCandidates.map((candidate) => candidate.wing))
  const archiveInboxHallOptions = uniqueArchiveOptions(pendingArchiveCandidates.map((candidate) => candidate.hall))
  const filteredPendingArchiveCandidates = getVisibleArchiveInboxCandidates()
  const selectedArchiveBatchSession =
    archiveInboxBatchSessionOptions.find((option) => option.id === archiveInboxBatchSessionFilter) || null
  const pendingArchiveCount = pendingArchiveTotalCount || pendingArchiveCandidates.length
  const archiveInboxServerScopeCount = archiveInboxScopeCount || pendingArchiveCandidates.length
  const pendingArchiveLoadedCount = pendingArchiveCandidates.length
  const archiveInboxPageCount = Math.max(1, Math.ceil(archiveInboxServerScopeCount / ARCHIVE_INBOX_PAGE_SIZE))
  const visiblePendingArchiveCount = filteredPendingArchiveCandidates.length
  const hasArchiveInboxBulkChanges = hasArchiveInboxBulkPatch(archiveInboxBulkDraft)
  const hasArchiveInboxFilters = Boolean(
    archiveInboxQuery.trim() ||
    archiveInboxSourceSurfaceFilter !== 'all' ||
    archiveInboxBatchSessionFilter !== 'all' ||
    archiveInboxWingFilter !== 'all' ||
    archiveInboxHallFilter !== 'all' ||
    archiveInboxRiskFilter !== 'all' ||
    archiveInboxSort !== 'latest',
  )

  useEffect(() => {
    if (archiveInboxPage > archiveInboxPageCount) {
      setArchiveInboxPage(archiveInboxPageCount)
    }
  }, [archiveInboxPage, archiveInboxPageCount])

  return (
    <div className="openbasaka">
      {/* 拖拽手柄 */}
      <div className="openbasaka__drag-handle" />

      {/* 顶部 */}
      <div className="hd-nav">
        <div className="hd-nav__item hd-nav__item--active">
          <span className="openbasaka__logo">
            <span className="openbasaka__logo-icon">{getExpertConfig(activeExpert).emoji}</span>
            {activeExpert !== 'general' ? getExpertConfig(activeExpert).name : 'BASAKA'}
          </span>
        </div>
        <div className="hd-nav__item hd-nav__item--clickable" onClick={() => setShowExpertBar(!showExpertBar)}>
          角色
        </div>
        <div className="hd-nav__item hd-nav__item--clickable" onClick={toggleHistoryPanel}>
          历史
        </div>
        <div
          ref={sandboxMenuRef}
          className={`hd-nav__item hd-nav__item--clickable ${showSandboxMenu || showArchiveInbox ? 'hd-nav__item--active' : ''}`}
          onClick={toggleSandboxMenu}
          role="button"
          tabIndex={0}
          aria-haspopup="menu"
          aria-expanded={showSandboxMenu}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              toggleSandboxMenu()
            }
            if (event.key === 'Escape') setShowSandboxMenu(false)
          }}
          style={{ position: 'relative', overflow: 'visible' }}
        >
          沙盘
          {pendingArchiveCount > 0 && <span className="openbasaka__nav-badge">{pendingArchiveCount}</span>}
          {showSandboxMenu && (
            <div
              role="menu"
              aria-label="沙盘功能"
              onClick={(event) => event.stopPropagation()}
              style={{
                position: 'absolute',
                top: 'calc(100% + 12px)',
                right: 10,
                minWidth: 216,
                padding: 8,
                display: 'grid',
                gap: 6,
                zIndex: 50,
                color: 'rgba(229, 255, 252, 0.92)',
                background: 'rgba(2, 22, 20, 0.96)',
                border: '1px solid rgba(0, 255, 209, 0.28)',
                boxShadow: '0 20px 44px rgba(0, 0, 0, 0.46)',
                writingMode: 'horizontal-tb',
                textOrientation: 'mixed',
              }}
            >
              {[
                { icon: '◇', label: '沙盘全景', hint: '项目、记忆、知识与自动化总览', action: openSandboxWindow },
                {
                  icon: '启',
                  label: '启蒙收件箱',
                  hint: pendingArchiveCount > 0 ? `${pendingArchiveCount} 条待确认记忆` : '确认可长期沉淀的记忆',
                  action: openArchiveInboxFromSandbox,
                },
                { icon: '像', label: '画像工坊', hint: '测评、对话与 Boss 画像更新', action: openProfilingFromSandbox },
                { icon: '推', label: '推演室', hint: '项目评估与多角色战略推演', action: openWarRoomFromSandbox },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={item.action}
                  style={{
                    width: '100%',
                    border: '1px solid rgba(0, 255, 209, 0.16)',
                    background: 'rgba(0, 255, 209, 0.04)',
                    color: 'inherit',
                    padding: '10px 12px',
                    display: 'grid',
                    gridTemplateColumns: '28px 1fr',
                    gap: 10,
                    textAlign: 'left',
                    cursor: 'pointer',
                    font: 'inherit',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 28,
                      height: 28,
                      display: 'grid',
                      placeItems: 'center',
                      border: '1px solid rgba(0, 255, 209, 0.28)',
                      color: 'rgba(0, 255, 209, 0.9)',
                      background: 'rgba(0, 255, 209, 0.06)',
                    }}
                  >
                    {item.icon}
                  </span>
                  <span style={{ display: 'grid', gap: 3 }}>
                    <span style={{ fontSize: 14, lineHeight: 1.2 }}>{item.label}</span>
                    <span style={{ fontSize: 11, lineHeight: 1.35, color: 'rgba(173, 206, 198, 0.68)' }}>
                      {item.hint}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="hd-nav__item hd-nav__item--clickable" onClick={() => window.electronAPI?.minimizeToTray()}>
          收起
        </div>
      </div>

      {/* 专家角色选择栏 */}
      {showExpertBar && (
        <div className="openbasaka__expert-bar hd-fade-in">
          <div className="openbasaka__expert-routing">
            <button
              className={`openbasaka__routing-btn ${routingMode === 'locked' ? 'openbasaka__routing-btn--active' : ''}`}
              onClick={() => setRoutingMode('locked')}
              title="手动选择一个专家角色，一直跟他聊"
            >
              手动选择
            </button>
            <button
              className={`openbasaka__routing-btn ${routingMode === 'auto' ? 'openbasaka__routing-btn--active' : ''}`}
              onClick={() => setRoutingMode('auto')}
              title="根据你说的内容，自动匹配最合适的专家"
            >
              智能匹配
            </button>
          </div>
          <span className="openbasaka__expert-hint">
            {routingMode === 'auto' ? '点角色看灵魂 · 系统自动匹配专家' : '点角色看灵魂 · 再点切换专家'}
          </span>
          {experts.map(({ role, config }) => (
            <button
              key={role}
              className={`openbasaka__expert-btn ${activeExpert === role ? 'openbasaka__expert-btn--active' : ''} ${pulseAgent === role ? 'openbasaka__expert-btn--pulse' : ''}`}
              onClick={() => handleExpertClick(role)}
            >
              <span>{config.emoji}</span>
              <span>{config.name}</span>
              {activeExpert === role && (
                <span className="openbasaka__expert-soul-dot" title="点击查看灵魂">
                  🧠
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Soul 面板 */}
      {showSoulPanel && soulData && (
        <div className="openbasaka__soul-panel hd-fade-in">
          <div className="openbasaka__soul-header">
            <div className="openbasaka__soul-title">
              <span className="openbasaka__soul-icon">{getExpertConfig(activeExpert).emoji}</span>
              <span>{getExpertConfig(activeExpert).name}</span>
              <span className="openbasaka__soul-badge">灵魂 SOUL</span>
            </div>
            <button className="openbasaka__soul-close" onClick={() => setShowSoulPanel(false)}>
              ✕
            </button>
          </div>

          {!soulEditing ? (
            <>
              <div className="openbasaka__soul-content">
                <div className="openbasaka__soul-section">
                  <div className="openbasaka__soul-label">身份</div>
                  <div className="openbasaka__soul-text">{soulData.identity}</div>
                </div>
                {soulData.tone && (
                  <div className="openbasaka__soul-section">
                    <div className="openbasaka__soul-label">语气</div>
                    <div className="openbasaka__soul-text">{soulData.tone}</div>
                  </div>
                )}
                {soulData.principles?.length > 0 && (
                  <div className="openbasaka__soul-section">
                    <div className="openbasaka__soul-label">准则</div>
                    <ul className="openbasaka__soul-list">
                      {soulData.principles.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {soulData.avoidance?.length > 0 && (
                  <div className="openbasaka__soul-section">
                    <div className="openbasaka__soul-label">避免</div>
                    <ul className="openbasaka__soul-list openbasaka__soul-list--avoid">
                      {soulData.avoidance.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {soulData.customOverride && (
                  <div className="openbasaka__soul-section">
                    <div className="openbasaka__soul-label">自定义指令</div>
                    <div className="openbasaka__soul-text">{soulData.customOverride}</div>
                  </div>
                )}
              </div>
              <div className="openbasaka__soul-actions">
                <button
                  className="openbasaka__soul-btn openbasaka__soul-btn--edit"
                  onClick={() => setSoulEditing(true)}
                >
                  编辑灵魂
                </button>
                <button className="openbasaka__soul-btn openbasaka__soul-btn--reset" onClick={handleResetSoul}>
                  重置
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="openbasaka__soul-editor">
                <textarea
                  className="openbasaka__soul-textarea"
                  value={soulEditText}
                  onChange={(e) => setSoulEditText(e.target.value)}
                  placeholder="编辑这个角色的灵魂描述..."
                />
              </div>
              <div className="openbasaka__soul-actions">
                <button className="openbasaka__soul-btn openbasaka__soul-btn--save" onClick={saveSoulEdit}>
                  保存灵魂
                </button>
                <button className="openbasaka__soul-btn" onClick={() => setSoulEditing(false)}>
                  取消
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 历史会话面板 */}
      {showHistory && (
        <div className="openbasaka__history-panel hd-fade-in">
          <div className="openbasaka__history-header">
            <span className="hd-label">系统历史</span>
            <button className="openbasaka__history-new" onClick={newChat}>
              + 新对话
            </button>
          </div>
          <div className="openbasaka__history-section">
            <div className="openbasaka__history-section-label">画像记录</div>
            {latestProfileRun ? (
              <div className="openbasaka__profile-history-card">
                <div className="openbasaka__profile-history-head">
                  <div>
                    <div className="openbasaka__profile-history-title">
                      {latestProfileRun.normalized.summary.headline}
                    </div>
                    <div className="openbasaka__profile-history-meta">
                      {formatProfileMode(latestProfileRun.mode)} · 可信度{' '}
                      {Math.round(latestProfileRun.confidence * 100)}%
                    </div>
                  </div>
                  <button className="openbasaka__profile-history-btn" onClick={() => onOpenProfilingStudio?.()}>
                    继续优化
                  </button>
                </div>
                <div className="openbasaka__profile-history-summary">
                  {latestProfileRun.normalized.summary.promptSummary}
                </div>
                {profileTimeline.length > 0 && (
                  <div className="openbasaka__profile-history-timeline">
                    {profileTimeline.map((item) => (
                      <div key={item.id} className="openbasaka__profile-history-chip">
                        <span>{formatProfileMode(item.mode)}</span>
                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="openbasaka__profile-history-actions">
                  <button
                    className="openbasaka__profile-history-btn"
                    onClick={() => {
                      window.location.hash = '#/sandbox'
                    }}
                  >
                    查看沙盘画像
                  </button>
                  <button className="openbasaka__profile-history-btn" onClick={onSwitchToWarRoom}>
                    去推演室看变化
                  </button>
                </div>
              </div>
            ) : (
              <div className="openbasaka__profile-history-empty">
                还没有完整画像记录。做完一次多维测评后，这里会开始沉淀你的画像版本和方向变化。
                <button className="openbasaka__profile-history-btn" onClick={() => onOpenProfilingStudio?.()}>
                  进入画像工坊
                </button>
              </div>
            )}
          </div>
          <div className="openbasaka__history-section">
            <div className="openbasaka__history-section-label">对话历史</div>
            {sessions.length === 0 ? (
              <div style={{ padding: 'var(--hd-space-md)', color: 'var(--hd-text-muted)', fontSize: '0.8rem' }}>
                尚无历史对话
              </div>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.id}
                  className={`openbasaka__history-item ${s.id === session.id ? 'openbasaka__history-item--active' : ''}`}
                  onClick={() => loadHistory(s.id)}
                >
                  <span className="openbasaka__history-title">{s.title || '未命名对话'}</span>
                  <span className="openbasaka__history-date">{new Date(s.updatedAt).toLocaleDateString()}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {showArchiveInbox && (
        <div className="openbasaka__archive-inbox-panel hd-fade-in">
          <div className="openbasaka__history-header">
            <div>
              <span className="hd-label">启蒙收件箱</span>
              <div className="openbasaka__archive-inbox-summary">
                当前有 {pendingArchiveCount} 条待确认记忆，只有你点下去，它们才会真正入宫。
                {hasArchiveInboxFilters ? ` 现在筛出了 ${visiblePendingArchiveCount} 条。` : ''}
                {selectedArchiveBatchSession
                  ? ` 当前批次：${selectedArchiveBatchSession.label}（${selectedArchiveBatchSession.count} 条）。`
                  : ''}
                {archiveInboxPageCount > 1 ? ` 当前在第 ${archiveInboxPage} / ${archiveInboxPageCount} 页。` : ''}
              </div>
            </div>
            <button
              className="openbasaka__history-new"
              onClick={() => refreshPendingArchiveCandidates().catch(() => {})}
            >
              刷新
            </button>
          </div>

          <div className="openbasaka__archive-inbox-toolbar">
            <input
              className="openbasaka__archive-inbox-search"
              value={archiveInboxQuery}
              onChange={(e) => setArchiveInboxQuery(e.target.value)}
              placeholder="搜索标题、内容、标签或归档理由"
            />
            <select
              className="openbasaka__archive-inbox-select"
              value={archiveInboxSourceSurfaceFilter}
              onChange={(e) => {
                const nextSurface = e.target.value
                setArchiveInboxPage(1)
                setArchiveInboxSourceSurfaceFilter(nextSurface)
                if (nextSurface !== 'qimeng-corpus') {
                  setArchiveInboxBatchSessionFilter('all')
                }
              }}
            >
              <option value="all">全部来源</option>
              {archiveInboxSourceSurfaceOptions.map((sourceSurface) => (
                <option key={sourceSurface} value={sourceSurface}>
                  {getArchiveSourceSurfaceLabel(sourceSurface)}
                </option>
              ))}
            </select>
            <select
              className="openbasaka__archive-inbox-select"
              value={archiveInboxBatchSessionFilter}
              onChange={(e) => {
                const nextBatchSessionId = e.target.value
                setArchiveInboxPage(1)
                setArchiveInboxBatchSessionFilter(nextBatchSessionId)
                if (nextBatchSessionId !== 'all' && archiveInboxSourceSurfaceFilter === 'all') {
                  setArchiveInboxSourceSurfaceFilter('qimeng-corpus')
                }
              }}
            >
              <option value="all">全部批次</option>
              {archiveInboxBatchSessionOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} · {option.count} 条
                </option>
              ))}
            </select>
            <select
              className="openbasaka__archive-inbox-select"
              value={archiveInboxWingFilter}
              onChange={(e) => setArchiveInboxWingFilter(e.target.value)}
            >
              <option value="all">全部侧翼</option>
              {archiveInboxWingOptions.map((wing) => (
                <option key={wing} value={wing}>
                  {wing}
                </option>
              ))}
            </select>
            <select
              className="openbasaka__archive-inbox-select"
              value={archiveInboxHallFilter}
              onChange={(e) => setArchiveInboxHallFilter(e.target.value)}
            >
              <option value="all">全部厅堂</option>
              {archiveInboxHallOptions.map((hall) => (
                <option key={hall} value={hall}>
                  {hall}
                </option>
              ))}
            </select>
            <select
              className="openbasaka__archive-inbox-select"
              value={archiveInboxRiskFilter}
              onChange={(e) => setArchiveInboxRiskFilter(e.target.value as ArchiveInboxRiskFilter)}
            >
              <option value="all">全部风险</option>
              <option value="duplicates">仅近重复</option>
              <option value="clean">仅干净项</option>
            </select>
            <select
              className="openbasaka__archive-inbox-select"
              value={archiveInboxSort}
              onChange={(e) => setArchiveInboxSort(e.target.value as ArchiveInboxSort)}
            >
              <option value="latest">最新优先</option>
              <option value="earliest">最早优先</option>
              <option value="duplicates">重复风险优先</option>
              <option value="customized">已微调优先</option>
            </select>
            {hasArchiveInboxFilters && (
              <button type="button" className="openbasaka__archive-inbox-reset" onClick={resetArchiveInboxFilters}>
                重置
              </button>
            )}
          </div>

          <div className="openbasaka__archive-inbox-bulk-editor">
            <div className="openbasaka__archive-inbox-bulk-editor-head">
              <div>
                <div className="openbasaka__archive-inbox-bulk-editor-title">批量微调可见项</div>
                <div className="openbasaka__archive-inbox-bulk-editor-copy">
                  留空字段就不改；标签和 facet 支持“追加”或“覆盖”。这里只改候选草稿，不会自动入宫。
                </div>
              </div>
              {hasArchiveInboxBulkChanges && (
                <button type="button" className="openbasaka__archive-inbox-reset" onClick={resetArchiveInboxBulkDraft}>
                  清空微调
                </button>
              )}
            </div>

            <div className="openbasaka__archive-inbox-bulk-editor-grid">
              <label className="openbasaka__archive-field">
                <span className="openbasaka__archive-field-label">统一房间</span>
                <input
                  className="openbasaka__archive-input"
                  value={archiveInboxBulkDraft.room}
                  onChange={(e) => handleArchiveInboxBulkDraftChange({ room: e.target.value })}
                  placeholder="留空则保持各自 room 不变"
                />
              </label>
              <label className="openbasaka__archive-field">
                <span className="openbasaka__archive-field-label">批量标签</span>
                <input
                  className="openbasaka__archive-input"
                  value={archiveInboxBulkDraft.tagsText}
                  onChange={(e) => handleArchiveInboxBulkDraftChange({ tagsText: e.target.value })}
                  placeholder="例如：启蒙，世界模型，长期主义"
                />
              </label>
              <label className="openbasaka__archive-field">
                <span className="openbasaka__archive-field-label">标签策略</span>
                <select
                  className="openbasaka__archive-inbox-select openbasaka__archive-inbox-select--full"
                  value={archiveInboxBulkDraft.tagsMode}
                  onChange={(e) =>
                    handleArchiveInboxBulkDraftChange({ tagsMode: e.target.value as ArchiveInboxBulkDraft['tagsMode'] })
                  }
                >
                  <option value="append">追加到现有标签</option>
                  <option value="replace">覆盖现有标签</option>
                </select>
              </label>
              <label className="openbasaka__archive-field">
                <span className="openbasaka__archive-field-label">Facet 策略</span>
                <select
                  className="openbasaka__archive-inbox-select openbasaka__archive-inbox-select--full"
                  value={archiveInboxBulkDraft.facetsMode}
                  onChange={(e) =>
                    handleArchiveInboxBulkDraftChange({
                      facetsMode: e.target.value as ArchiveInboxBulkDraft['facetsMode'],
                    })
                  }
                >
                  <option value="append">追加到现有 facet</option>
                  <option value="replace">覆盖现有 facet</option>
                </select>
              </label>
              <div className="openbasaka__archive-field openbasaka__archive-field--full">
                <span className="openbasaka__archive-field-label">批量 Facet</span>
                <div className="openbasaka__archive-facets">
                  {QIMENG_FACET_OPTIONS.map((facet) => {
                    const active = archiveInboxBulkDraft.facets.includes(facet)
                    return (
                      <button
                        key={facet}
                        type="button"
                        className={`openbasaka__archive-facet ${active ? 'openbasaka__archive-facet--active' : ''}`}
                        onClick={() => handleArchiveInboxBulkFacetToggle(facet)}
                      >
                        {FACET_LABELS[facet]}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="openbasaka__archive-inbox-toolbar openbasaka__archive-inbox-toolbar--compact">
            <span className="openbasaka__archive-inbox-count">
              {hasArchiveInboxFilters
                ? `当前页筛出 ${visiblePendingArchiveCount} / ${archiveInboxServerScopeCount} 条`
                : archiveInboxPageCount > 1
                  ? `当前页载入 ${pendingArchiveLoadedCount} / ${archiveInboxServerScopeCount} 条`
                  : `当前显示全部 ${archiveInboxServerScopeCount} 条`}
            </span>
            <div className="openbasaka__archive-inbox-pagination">
              <button
                type="button"
                className="openbasaka__archive-inbox-page-btn"
                onClick={() => setArchiveInboxPage((page) => Math.max(1, page - 1))}
                disabled={archiveInboxLoading || archiveInboxPage <= 1}
              >
                上一页
              </button>
              <span className="openbasaka__archive-inbox-page-label">
                第 {archiveInboxPage} / {archiveInboxPageCount} 页
              </span>
              <button
                type="button"
                className="openbasaka__archive-inbox-page-btn"
                onClick={() => setArchiveInboxPage((page) => Math.min(archiveInboxPageCount, page + 1))}
                disabled={archiveInboxLoading || archiveInboxPage >= archiveInboxPageCount}
              >
                下一页
              </button>
            </div>
            <button
              type="button"
              className="openbasaka__archive-inbox-bulk"
              onClick={handleArchiveInboxApplyBulkPatch}
              disabled={
                archiveInboxBulkBusy ||
                archiveInboxLoading ||
                visiblePendingArchiveCount === 0 ||
                !hasArchiveInboxBulkChanges
              }
            >
              {archiveInboxBulkBusy ? '批量处理中…' : `应用微调到 ${visiblePendingArchiveCount} 条`}
            </button>
            <button
              type="button"
              className="openbasaka__archive-inbox-bulk openbasaka__archive-inbox-bulk--confirm"
              onClick={() => handleArchiveInboxBulkAction('confirm')}
              disabled={archiveInboxBulkBusy || archiveInboxLoading || visiblePendingArchiveCount === 0}
            >
              {archiveInboxBulkBusy ? '批量处理中…' : `批量入宫可见项`}
            </button>
            <button
              type="button"
              className="openbasaka__archive-inbox-bulk openbasaka__archive-inbox-bulk--dismiss"
              onClick={() => handleArchiveInboxBulkAction('dismiss')}
              disabled={archiveInboxBulkBusy || archiveInboxLoading || visiblePendingArchiveCount === 0}
            >
              {archiveInboxBulkBusy ? '批量处理中…' : `批量丢弃可见项`}
            </button>
          </div>

          {archiveInboxLoading ? (
            <div className="openbasaka__archive-inbox-empty">正在整理待确认记忆…</div>
          ) : pendingArchiveTotalCount === 0 ? (
            <div className="openbasaka__archive-inbox-empty">
              当前没有待确认候选。之后所有值得留下的创作、创意与关键对话，都会先来到这里等你裁决。
            </div>
          ) : visiblePendingArchiveCount === 0 ? (
            <div className="openbasaka__archive-inbox-empty">
              当前筛选条件下没有候选。放宽搜索词或切回“全部侧翼 / 全部厅堂 / 全部风险”就能看到其他待确认记忆。
            </div>
          ) : (
            <div className="openbasaka__archive-inbox-list">
              {filteredPendingArchiveCandidates.map((candidate) => {
                const isOpen = archiveInboxOpenCandidateId === candidate.id
                const isBusy = !!archiveInboxBusyIds[candidate.id]
                const draft = archiveDrafts[candidate.id] || buildArchiveDraft(candidate)
                const batchSessionId = getArchiveBatchSessionId(candidate)
                const batchSessionLabel = batchSessionId ? formatArchiveBatchSessionLabel(batchSessionId) : ''

                return (
                  <div
                    key={candidate.id}
                    className={`openbasaka__archive-inbox-item ${isOpen ? 'openbasaka__archive-inbox-item--active' : ''}`}
                  >
                    <button
                      type="button"
                      className="openbasaka__archive-inbox-toggle"
                      onClick={() => openArchiveInboxCandidate(candidate)}
                    >
                      <div className="openbasaka__archive-inbox-head">
                        <div>
                          <div className="openbasaka__archive-inbox-title">{candidate.title}</div>
                          <div className="openbasaka__archive-inbox-path">
                            {candidate.wingLabel} / {candidate.hallLabel} / {candidate.room}
                          </div>
                        </div>
                        <div className="openbasaka__archive-inbox-meta">
                          <span>
                            {candidate.preview.duplicateCount > 0
                              ? `${candidate.preview.duplicateCount} 条近重复`
                              : '无重复风险'}
                          </span>
                          <span>{candidate.preview.isCustomized ? '已微调' : '系统建议'}</span>
                        </div>
                      </div>
                      <div className="openbasaka__archive-inbox-snippet">{formatArchiveSnippet(candidate.content)}</div>
                      <div className="openbasaka__archive-inbox-footer">
                        <span>{candidate.preview.sourcePointer}</span>
                        {batchSessionLabel && <span>{batchSessionLabel}</span>}
                        <span>
                          {new Date(candidate.updatedAt || candidate.createdAt || Date.now()).toLocaleString()}
                        </span>
                      </div>
                    </button>

                    {isOpen && draft && (
                      <ArchiveEditorCard
                        candidate={candidate}
                        storedCandidate={candidate}
                        draft={draft}
                        busy={isBusy}
                        cancelLabel="收起"
                        auxiliaryActionLabel="丢弃候选"
                        onDraftChange={(patch) => handleArchiveDraftChange(candidate.id, patch)}
                        onFacetToggle={(facet) => handleArchiveFacetToggle(candidate.id, facet)}
                        onConfirm={() => handleArchiveInboxConfirm(candidate)}
                        onCancel={() =>
                          setArchiveInboxOpenCandidateId((current) => (current === candidate.id ? null : current))
                        }
                        onAuxiliaryAction={() => handleArchiveInboxDismiss(candidate)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 聊天区域 */}
      <div className="openbasaka__chat" ref={scrollRef}>
        {messages.map((msg) => {
          const storedCandidate = archiveCandidates[msg.id]
          const archiveHint =
            storedCandidate?.status === 'dismissed'
              ? null
              : storedCandidate ||
                (shouldOfferArchiveTag(msg) ? previewQimengArchive(msg, session.agentRole || activeExpert) : null)
          const isArchived = storedCandidate?.status === 'archived'
          const isArchiving = !!archivingMessageIds[msg.id]
          const isPreparingArchive = !!preparingArchiveMessageIds[msg.id]
          const isArchivePreviewOpen = archivePreviewMessageId === msg.id
          const archiveDraft = archiveHint ? archiveDrafts[msg.id] || buildArchiveDraft(archiveHint) : null

          return (
            <div key={msg.id} className={`openbasaka__msg openbasaka__msg--${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="openbasaka__msg-avatar">{getExpertConfig(activeExpert).emoji}</div>
              )}
              <div className="openbasaka__msg-body">
                <div className="openbasaka__msg-content">{renderMessageText(msg.content)}</div>
                {archiveHint && (
                  <div className="openbasaka__archive-row">
                    <button
                      className={`openbasaka__archive-tag ${isArchived ? 'openbasaka__archive-tag--archived' : ''} ${isArchiving ? 'openbasaka__archive-tag--busy' : ''}`}
                      type="button"
                      disabled={isArchived || isArchiving}
                      onClick={() => handleArchiveTagClick(msg)}
                      title={archiveHint.rationale}
                    >
                      {isArchiving
                        ? '… 正在归入《启蒙》'
                        : isPreparingArchive
                          ? '… 正在准备归档预览'
                          : isArchived
                            ? `✓ 已入启蒙 · ${archiveHint.wingLabel} / ${archiveHint.room}`
                            : isArchivePreviewOpen
                              ? `✦ 归档预览中 · ${archiveHint.wingLabel} / ${archiveHint.room}`
                              : `✦ 归入启蒙 · ${archiveHint.wingLabel} / ${archiveHint.room}`}
                    </button>
                    <span className="openbasaka__archive-meta">{formatArchivePath(archiveHint)}</span>
                    {!isArchived && isArchivePreviewOpen && archiveDraft && (
                      <ArchiveEditorCard
                        candidate={archiveHint}
                        storedCandidate={storedCandidate}
                        draft={archiveDraft}
                        busy={isArchiving}
                        onDraftChange={(patch) => handleArchiveDraftChange(msg.id, patch)}
                        onFacetToggle={(facet) => handleArchiveFacetToggle(msg.id, facet)}
                        onConfirm={() => handleArchiveMessage(msg)}
                        onCancel={() => setArchivePreviewMessageId((current) => (current === msg.id ? null : current))}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* 流式输出 */}
        {isStreaming && streamingText && (
          <div className="openbasaka__msg openbasaka__msg--assistant">
            <div className="openbasaka__msg-avatar">{getExpertConfig(activeExpert).emoji}</div>
            <div className="openbasaka__msg-body">
              <div className="openbasaka__msg-content openbasaka__msg-content--streaming">
                {renderMessageText(streamingText)}
                <span className="openbasaka__cursor">▌</span>
              </div>
            </div>
          </div>
        )}

        {/* 等待指示器 */}
        {isStreaming && !streamingText && (
          <div className="openbasaka__msg openbasaka__msg--assistant">
            <div className="openbasaka__msg-avatar">{getExpertConfig(activeExpert).emoji}</div>
            <div className="openbasaka__msg-body">
              <div className="openbasaka__thinking">
                <span className="openbasaka__dot" />
                <span className="openbasaka__dot" />
                <span className="openbasaka__dot" />
              </div>
            </div>
          </div>
        )}

        {/* 项目构想检测提示 */}
        {projectIdeaDetected && !isStreaming && (
          <div className="openbasaka__idea-prompt hd-fade-in">
            <span>🔮 检测到项目构想！要送入推演引擎做完整评估吗？</span>
            <button
              className="openbasaka__idea-btn"
              onClick={() => {
                setProjectIdeaDetected(false)
                if (onEvaluateProject) {
                  onEvaluateProject(pendingProjectText)
                } else {
                  onSwitchToWarRoom()
                }
              }}
            >
              启动推演
            </button>
          </div>
        )}

        {/* 快速操作 */}
        {messages.length <= 1 && !isStreaming && (
          <div className="openbasaka__quick-actions hd-stagger-in">
            {quickActions.map((action) => (
              <button
                key={action.label}
                className="openbasaka__quick-btn"
                onClick={() => {
                  if ('action' in action) {
                    action.action()
                    return
                  }
                  setInput(action.prompt)
                  setTimeout(() => inputRef.current?.focus(), 50)
                }}
              >
                <span className="openbasaka__quick-icon">{action.icon}</span>
                <span className="openbasaka__quick-label">{action.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="openbasaka__input-area">
        <textarea
          ref={inputRef}
          className="openbasaka__textarea"
          placeholder={`对 ${activeExpert === 'general' ? 'BASAKA' : getExpertConfig(activeExpert).name} 说点什么...`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button
          className={`openbasaka__send-btn ${input.trim() ? 'openbasaka__send-btn--active' : ''}`}
          onClick={() => sendMessage()}
          disabled={isStreaming || !input.trim()}
        >
          {isStreaming ? '...' : '↑'}
        </button>
      </div>
    </div>
  )
}
