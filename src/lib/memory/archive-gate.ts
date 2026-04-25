import type { SessionMessage } from '../chat/session'
import { dbSaveOperatingEvent, query, run } from '../db/repository'
import { generateId } from '../db/schema'
import { createDrawer } from '../knowledge/drawer'
import { createSource } from '../knowledge/wiki'
import { classifyQimengText, formatQimengPath } from './qimeng-taxonomy'

export type QimengWing =
  | 'identity'
  | 'worldview'
  | 'method'
  | 'creation'
  | 'dialogue'
  | 'profiling'
  | 'wishes'
  | 'openbasaka'

export type QimengHall = 'identity' | 'consciousness' | 'creative' | 'technical' | 'memory' | 'emotions' | 'family'

export type QimengFacet =
  | 'fact'
  | 'event'
  | 'discovery'
  | 'preference'
  | 'advice'
  | 'decision'
  | 'question'
  | 'wish'
  | 'pivot'

export const QIMENG_FACET_OPTIONS: QimengFacet[] = [
  'fact',
  'event',
  'discovery',
  'preference',
  'advice',
  'decision',
  'question',
  'wish',
  'pivot',
]

export type ArchiveSourceSurface = 'openbasaka' | 'qimeng-corpus' | string

export interface ArchiveSuggestion {
  title: string
  wing: QimengWing
  wingLabel: string
  hall: QimengHall
  hallLabel: string
  room: string
  tags: string[]
  facets: QimengFacet[]
  rationale: string
}

export interface ArchiveDuplicateMatch {
  id: string
  title: string
  wing: string
  hall: string
  room: string
  sourceType: string
}

export interface ArchivePreviewMeta {
  sourcePointer: string
  duplicateCount: number
  duplicateMatches: ArchiveDuplicateMatch[]
  isCustomized: boolean
}

export interface ArchiveCandidate extends ArchiveSuggestion {
  id: string
  conversationId: string
  messageId: string
  messageRole: SessionMessage['role']
  content: string
  sourceSurface: string
  agentRole: string
  status: 'pending' | 'archived' | 'dismissed'
  archivedDrawerId: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  preview: ArchivePreviewMeta
}

type StoredArchiveCandidate = Omit<ArchiveCandidate, 'preview'>

export interface PendingArchiveCandidateQuery {
  limit?: number
  offset?: number
  sourceSurface?: string
  batchSessionId?: string
}

export interface PendingArchiveCountOption {
  value: string
  count: number
}

const ARCHIVE_MIN_LENGTH = 18

const WING_META: Record<QimengWing, { label: string }> = {
  identity: { label: '自我定义' },
  worldview: { label: '世界模型' },
  method: { label: '探索方法' },
  creation: { label: '创意与项目' },
  dialogue: { label: '关键对话' },
  profiling: { label: '画像工坊' },
  wishes: { label: '未竟心愿' },
  openbasaka: { label: '系统演化' },
}

const HALL_META: Record<QimengHall, { label: string }> = {
  identity: { label: '自我认识' },
  consciousness: { label: '世界观' },
  creative: { label: '创意表达' },
  technical: { label: '结构与工程' },
  memory: { label: '经历回忆' },
  emotions: { label: '情绪与渴望' },
  family: { label: '关系与家庭' },
}

const KEYWORDS = {
  system: [
    /openbasaka/i,
    /basaka/i,
    /记忆宫殿/,
    /启蒙/,
    /知识库/,
    /mcp/i,
    /skill/i,
    /agent/i,
    /智能系统/,
    /归档/,
    /drawer/i,
  ],
  profiling: [/画像/, /测评/, /人格/, /认知方式/, /阶段信号/, /测试/, /性格/, /天赋/, /优势/, /倾向/],
  project: [/项目/, /创意/, /灵感/, /原型/, /产品/, /应用/, /功能/, /界面/, /作品/, /构想/, /创业/, /实验/],
  method: [/方法/, /框架/, /流程/, /步骤/, /原则/, /策略/, /工作流/, /思考法/, /学习法/, /prompt/i, /模型/, /系统化/],
  identity: [/我想/, /我相信/, /我是/, /我喜欢/, /我不喜欢/, /价值观/, /偏好/, /习惯/, /长期主义/, /人生/, /自我/],
  worldview: [/世界/, /社会/, /文明/, /时代/, /科技趋势/, /系统性/, /未来/, /关系本质/, /政治/, /经济/],
  wish: [/希望/, /想要/, /愿望/, /未完成/, /终有一天/, /一直想/, /执念/, /召唤/],
  family: [/家人/, /家庭/, /父母/, /母亲/, /父亲/, /亲密关系/, /伴侣/, /朋友/, /关系线/],
  emotion: [/感受/, /情绪/, /痛苦/, /焦虑/, /开心/, /兴奋/, /疲惫/, /渴望/, /恐惧/, /喜欢/, /厌恶/],
  memory: [/曾经/, /过去/, /那年/, /以前/, /小时候/, /当时/, /一路/, /经历/, /记录/, /回忆/, /十年/],
  question: [/[?？]/, /为什么/, /如何/, /怎么办/, /能不能/, /是否/],
  decision: [/决定/, /先做/, /必须/, /应该/, /优先/, /路线图/, /接下来/, /开始/, /执行/],
  discovery: [/发现/, /意识到/, /原来/, /其实/, /终于明白/, /顿悟/, /看清/],
  technical: [/架构/, /工程/, /代码/, /数据库/, /接口/, /部署/, /前端/, /后端/, /schema/i, /typescript/i, /react/i],
}

function normalizeContent(content: string): string {
  return content
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function containsAny(text: string, rules: RegExp[]): boolean {
  return rules.some((rule) => rule.test(text))
}

function safeArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

function safeObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function shortId(id: string): string {
  if (!id) return 'unknown'
  return id.length <= 8 ? id : id.slice(0, 8)
}

function sanitizeText(value: string, fallback: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized) return fallback
  return normalized.length > maxLength ? normalized.slice(0, maxLength).trim() : normalized
}

function sanitizeTags(values: string[]): string[] {
  return uniqueStrings(
    values
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => value.slice(0, 24)),
  ).slice(0, 8)
}

function sanitizeFacets(values: QimengFacet[]): QimengFacet[] {
  const normalized = Array.from(new Set(values))
    .filter((facet): facet is QimengFacet => QIMENG_FACET_OPTIONS.includes(facet))
    .slice(0, 4)

  return normalized.length > 0 ? normalized : ['fact']
}

function buildTitle(content: string): string {
  const firstLine =
    content
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) || content
  const clean = firstLine.replace(/[*_`>#-]/g, '').trim()
  if (clean.length <= 36) return clean
  return `${clean.slice(0, 36)}…`
}

export function getArchiveSourceSurfaceLabel(sourceSurface: ArchiveSourceSurface): string {
  if (sourceSurface === 'openbasaka') return 'Openbasaka'
  if (sourceSurface === 'qimeng-corpus') return '启蒙语料'
  return sourceSurface
}

function buildSourcePointer(params: {
  sourceSurface: ArchiveSourceSurface
  conversationId: string
  messageId: string
  messageRole: SessionMessage['role']
  metadata?: Record<string, unknown>
}): string {
  const surfaceLabel = getArchiveSourceSurfaceLabel(params.sourceSurface)
  if (params.sourceSurface === 'qimeng-corpus') {
    const relativePath = typeof params.metadata?.relativePath === 'string' ? params.metadata.relativePath : ''
    const filePath = typeof params.metadata?.filePath === 'string' ? params.metadata.filePath : ''
    const sourcePath = relativePath || filePath || params.messageId
    return `${surfaceLabel} · 文件 ${sourcePath}`
  }
  return `${surfaceLabel} · ${params.messageRole} · 会话 ${shortId(params.conversationId)} · 消息 ${shortId(params.messageId)}`
}

function collectSignals(text: string, agentRole?: string) {
  const role = (agentRole || '').toLowerCase()
  return {
    system: containsAny(text, KEYWORDS.system) || role === 'technical',
    profiling: containsAny(text, KEYWORDS.profiling),
    project: containsAny(text, KEYWORDS.project) || role === 'creative',
    method: containsAny(text, KEYWORDS.method) || role === 'strategy',
    identity: containsAny(text, KEYWORDS.identity),
    worldview: containsAny(text, KEYWORDS.worldview) || role === 'market',
    wish: containsAny(text, KEYWORDS.wish),
    family: containsAny(text, KEYWORDS.family),
    emotion: containsAny(text, KEYWORDS.emotion),
    memory: containsAny(text, KEYWORDS.memory),
    question: containsAny(text, KEYWORDS.question),
    decision: containsAny(text, KEYWORDS.decision),
    discovery: containsAny(text, KEYWORDS.discovery),
    technical: containsAny(text, KEYWORDS.technical),
  }
}

function inferHall(signals: ReturnType<typeof collectSignals>): QimengHall {
  if (signals.family) return 'family'
  if (signals.emotion || signals.wish) return 'emotions'
  if (signals.system) return 'technical'
  if (signals.worldview || signals.question || signals.discovery) return 'consciousness'
  if (signals.technical || signals.method) return 'technical'
  if (signals.project) return 'creative'
  if (signals.memory) return 'memory'
  if (signals.identity || signals.profiling) return 'identity'
  return 'memory'
}

function inferWing(hall: QimengHall, signals: ReturnType<typeof collectSignals>): QimengWing {
  if (signals.system) return 'openbasaka'
  if (signals.profiling) return 'profiling'
  if (signals.project) return 'creation'
  if (signals.worldview) return 'worldview'
  if (signals.method) return 'method'
  if (signals.identity) return 'identity'
  if (signals.wish) return 'wishes'
  if (hall === 'family' || hall === 'memory' || signals.question) return 'dialogue'
  return 'dialogue'
}

function inferRoom(wing: QimengWing, hall: QimengHall, text: string): string {
  if (wing === 'openbasaka') return '项目-个人智能系统'
  if (wing === 'profiling') return '画像工坊-阶段信号'
  if (hall === 'family') return '关系-亲密与协同'
  if (wing === 'wishes') return '心愿-未竟召唤'
  if (hall === 'emotions') return '情绪-渴望与波动'
  if (wing === 'creation') {
    return /项目|产品|系统|应用/.test(text) ? '项目-构想推进' : '创作-灵感草图'
  }
  if (wing === 'method') return '方法-认知与执行'
  if (wing === 'worldview') return '世界观-时代判断'
  if (wing === 'identity') return '自我-核心信念'
  if (hall === 'memory') return '记忆-阶段轨迹'
  return '对话-关键碰撞'
}

function inferFacets(text: string, signals: ReturnType<typeof collectSignals>): QimengFacet[] {
  const facets: QimengFacet[] = []

  if (signals.question) facets.push('question')
  if (signals.decision) facets.push('decision')
  if (signals.discovery) facets.push('discovery')
  if (signals.wish) facets.push('wish')
  if (signals.identity || /偏好|喜欢|不喜欢|习惯/.test(text)) facets.push('preference')
  if (/建议|最好|可以|不如/.test(text)) facets.push('advice')
  if (signals.memory) facets.push('event')
  if (/转向|pivot/i.test(text)) facets.push('pivot')
  if (facets.length === 0) facets.push('fact')

  return Array.from(new Set(facets)).slice(0, 4)
}

function buildRationale(
  wing: QimengWing,
  hall: QimengHall,
  room: string,
  signals: ReturnType<typeof collectSignals>,
): string {
  const reasons: string[] = []

  if (signals.system) reasons.push('命中个人智能系统/记忆宫殿语义')
  if (signals.profiling) reasons.push('命中画像工坊/认知测评语义')
  if (signals.project) reasons.push('命中项目/创意语义')
  if (signals.method) reasons.push('命中方法论/流程语义')
  if (signals.identity) reasons.push('带有自我认知或偏好信号')
  if (signals.worldview) reasons.push('带有世界模型或时代判断信号')
  if (signals.wish) reasons.push('包含愿望或未竟召唤')
  if (signals.memory) reasons.push('包含回忆或阶段线索')
  if (signals.family) reasons.push('涉及重要关系线')
  if (signals.emotion) reasons.push('包含情绪与感受信号')

  const summary = reasons.slice(0, 3).join('，') || '命中长期记忆阈值'
  return `${summary}，建议归入 ${WING_META[wing].label} / ${HALL_META[hall].label} / ${room}`
}

function parseCandidateRow(row: Record<string, unknown>): StoredArchiveCandidate {
  const wing = (row.suggested_wing as QimengWing) || 'dialogue'
  const hall = (row.suggested_hall as QimengHall) || 'memory'

  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    messageId: row.message_id as string,
    messageRole: (row.message_role as SessionMessage['role']) || 'assistant',
    content: (row.content as string) || '',
    sourceSurface: (row.source_surface as string) || 'openbasaka',
    agentRole: (row.agent_role as string) || 'general',
    title: (row.title as string) || '',
    wing,
    wingLabel: WING_META[wing]?.label || wing,
    hall,
    hallLabel: HALL_META[hall]?.label || hall,
    room: (row.suggested_room as string) || '对话-关键碰撞',
    tags: safeArray((row.suggested_tags as string) || '[]'),
    facets: safeArray((row.suggested_facets as string) || '[]') as QimengFacet[],
    rationale: (row.rationale as string) || '',
    status: (row.status as ArchiveCandidate['status']) || 'pending',
    archivedDrawerId: (row.archived_drawer_id as string) || '',
    metadata: safeObject((row.metadata_json as string) || '{}'),
    createdAt: (row.created_at as string) || '',
    updatedAt: (row.updated_at as string) || '',
  }
}

async function listDuplicateMatches(candidate: Pick<StoredArchiveCandidate, 'title' | 'content' | 'archivedDrawerId'>) {
  const title = candidate.title.trim()
  const content = candidate.content.trim()
  const conditions: string[] = []
  const params: unknown[] = []

  if (title) {
    conditions.push('title = ?')
    params.push(title)
  }
  if (content) {
    conditions.push('raw_content = ?')
    params.push(content)
  }
  if (conditions.length === 0) {
    return {
      duplicateCount: 0,
      duplicateMatches: [] as ArchiveDuplicateMatch[],
    }
  }

  const exclusionClause = candidate.archivedDrawerId ? ' AND id != ?' : ''
  const countParams = candidate.archivedDrawerId ? [...params, candidate.archivedDrawerId] : params
  const countRows = await query<{ cnt: number }>(
    `SELECT COUNT(*) as cnt
       FROM mempalace_drawers
      WHERE (${conditions.join(' OR ')})${exclusionClause}`,
    countParams,
  )

  const matchParams = candidate.archivedDrawerId ? [...params, candidate.archivedDrawerId, 3] : [...params, 3]
  const rows = await query<Record<string, unknown>>(
    `SELECT id, title, wing, hall, room, source_type
       FROM mempalace_drawers
      WHERE (${conditions.join(' OR ')})${exclusionClause}
      ORDER BY updated_at DESC
      LIMIT ?`,
    matchParams,
  )

  return {
    duplicateCount: countRows[0]?.cnt || 0,
    duplicateMatches: rows.map((row) => ({
      id: (row.id as string) || '',
      title: (row.title as string) || '未命名抽屉',
      wing: (row.wing as string) || '',
      hall: (row.hall as string) || '',
      room: (row.room as string) || '',
      sourceType: (row.source_type as string) || '',
    })),
  }
}

async function enrichArchiveCandidate(candidate: StoredArchiveCandidate): Promise<ArchiveCandidate> {
  const { duplicateCount, duplicateMatches } = await listDuplicateMatches(candidate)
  const sourcePointer = buildSourcePointer({
    sourceSurface: candidate.sourceSurface,
    conversationId: candidate.conversationId,
    messageId: candidate.messageId,
    messageRole: candidate.messageRole,
    metadata: candidate.metadata,
  })
  const isCustomized = Boolean(candidate.metadata.customized || candidate.metadata.userEditedAt)

  return {
    ...candidate,
    preview: {
      sourcePointer,
      duplicateCount,
      duplicateMatches,
      isCustomized,
    },
  }
}

export function shouldOfferArchiveTag(message: Pick<SessionMessage, 'id' | 'role' | 'content'>): boolean {
  if (message.role === 'system') return false

  const text = normalizeContent(message.content)
  if (!text || text.length < ARCHIVE_MIN_LENGTH) return false
  if (message.id === 'welcome' || message.id.startsWith('err-')) return false
  if (/^⚠️/.test(text) || /^🔍 正在搜索实时信息/.test(text)) return false

  return true
}

export function previewQimengArchive(
  message: Pick<SessionMessage, 'content'>,
  agentRole = 'general',
): ArchiveSuggestion {
  const classification = classifyQimengText({
    content: message.content,
    agentRole,
  })
  return {
    title: classification.title,
    wing: classification.wing as QimengWing,
    wingLabel: classification.wingLabel,
    hall: classification.hall as QimengHall,
    hallLabel: classification.hallLabel,
    room: classification.room,
    tags: classification.tags,
    facets: classification.facets as QimengFacet[],
    rationale: classification.rationale,
  }
}

export function formatArchivePath(candidate: Pick<ArchiveSuggestion, 'wingLabel' | 'hallLabel' | 'room'>): string {
  return formatQimengPath(candidate)
}

export async function listConversationArchiveCandidates(conversationId: string): Promise<ArchiveCandidate[]> {
  const rows = await query<Record<string, unknown>>(
    'SELECT * FROM archive_candidates WHERE conversation_id = ? ORDER BY created_at ASC',
    [conversationId],
  )
  return Promise.all(rows.map((row) => enrichArchiveCandidate(parseCandidateRow(row))))
}

function normalizePendingArchiveQuery(
  queryOrLimit: number | PendingArchiveCandidateQuery,
  sourceSurface: string,
  offset: number,
  batchSessionId: string,
): Required<PendingArchiveCandidateQuery> {
  if (typeof queryOrLimit === 'object') {
    return {
      limit: queryOrLimit.limit ?? 50,
      offset: queryOrLimit.offset ?? 0,
      sourceSurface: queryOrLimit.sourceSurface ?? 'openbasaka',
      batchSessionId: queryOrLimit.batchSessionId ?? 'all',
    }
  }

  return {
    limit: queryOrLimit,
    offset,
    sourceSurface,
    batchSessionId,
  }
}

export async function listPendingArchiveCandidates(
  queryOrLimit: number | PendingArchiveCandidateQuery = 50,
  sourceSurface = 'openbasaka',
  offset = 0,
  batchSessionId = 'all',
): Promise<ArchiveCandidate[]> {
  const normalized = normalizePendingArchiveQuery(queryOrLimit, sourceSurface, offset, batchSessionId)
  const params: unknown[] = []
  const filters = [`status = 'pending'`]

  if (normalized.sourceSurface && normalized.sourceSurface !== 'all') {
    filters.push('source_surface = ?')
    params.push(normalized.sourceSurface)
  }
  if (normalized.batchSessionId && normalized.batchSessionId !== 'all') {
    filters.push(`json_extract(metadata_json, '$.batchSessionId') = ?`)
    params.push(normalized.batchSessionId)
  }

  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM archive_candidates
      WHERE ${filters.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT ?
      OFFSET ?`,
    [...params, normalized.limit, normalized.offset],
  )
  return Promise.all(rows.map((row) => enrichArchiveCandidate(parseCandidateRow(row))))
}

export async function countPendingArchiveCandidates(
  sourceSurfaceOrQuery: string | Pick<PendingArchiveCandidateQuery, 'sourceSurface' | 'batchSessionId'> = 'all',
  batchSessionId = 'all',
): Promise<number> {
  const normalized =
    typeof sourceSurfaceOrQuery === 'object'
      ? {
          sourceSurface: sourceSurfaceOrQuery.sourceSurface ?? 'all',
          batchSessionId: sourceSurfaceOrQuery.batchSessionId ?? 'all',
        }
      : {
          sourceSurface: sourceSurfaceOrQuery,
          batchSessionId,
        }

  const params: unknown[] = []
  const filters = [`status = 'pending'`]

  if (normalized.sourceSurface && normalized.sourceSurface !== 'all') {
    filters.push('source_surface = ?')
    params.push(normalized.sourceSurface)
  }
  if (normalized.batchSessionId && normalized.batchSessionId !== 'all') {
    filters.push(`json_extract(metadata_json, '$.batchSessionId') = ?`)
    params.push(normalized.batchSessionId)
  }

  const rows = await query<{ cnt: number }>(
    `SELECT COUNT(*) as cnt
       FROM archive_candidates
      WHERE ${filters.join(' AND ')}`,
    params,
  )
  return rows[0]?.cnt || 0
}

export async function listPendingArchiveSourceSurfaceCounts(): Promise<PendingArchiveCountOption[]> {
  const rows = await query<{ value: string; cnt: number }>(
    `SELECT source_surface as value, COUNT(*) as cnt
       FROM archive_candidates
      WHERE status = 'pending'
      GROUP BY source_surface
      ORDER BY source_surface ASC`,
    [],
  )

  return rows
    .filter((row) => row.value)
    .map((row) => ({
      value: row.value,
      count: row.cnt,
    }))
}

export async function listPendingArchiveBatchSessionCounts(
  sourceSurface = 'all',
): Promise<PendingArchiveCountOption[]> {
  const hasSurfaceFilter = Boolean(sourceSurface && sourceSurface !== 'all')
  const rows = await query<{ value: string; cnt: number }>(
    `SELECT json_extract(metadata_json, '$.batchSessionId') as value, COUNT(*) as cnt
       FROM archive_candidates
      WHERE status = 'pending'
        AND json_extract(metadata_json, '$.batchSessionId') IS NOT NULL
        ${hasSurfaceFilter ? 'AND source_surface = ?' : ''}
      GROUP BY value
      ORDER BY value DESC`,
    hasSurfaceFilter ? [sourceSurface] : [],
  )

  return rows
    .filter((row) => row.value)
    .map((row) => ({
      value: row.value,
      count: row.cnt,
    }))
}

async function getStoredArchiveCandidateById(candidateId: string): Promise<StoredArchiveCandidate | null> {
  const rows = await query<Record<string, unknown>>('SELECT * FROM archive_candidates WHERE id = ? LIMIT 1', [
    candidateId,
  ])
  return rows[0] ? parseCandidateRow(rows[0]) : null
}

async function getArchiveCandidateById(candidateId: string): Promise<ArchiveCandidate | null> {
  const candidate = await getStoredArchiveCandidateById(candidateId)
  return candidate ? enrichArchiveCandidate(candidate) : null
}

function getCandidateSourceTimestamp(candidate: StoredArchiveCandidate): string {
  return typeof candidate.metadata.sourceTimestamp === 'string' && candidate.metadata.sourceTimestamp
    ? candidate.metadata.sourceTimestamp
    : new Date().toISOString()
}

function buildArchiveFolderPath(candidate: StoredArchiveCandidate): string {
  return `启蒙/${candidate.wing}/${candidate.hall}/${candidate.room}`
}

async function findExistingArchiveSource(candidate: StoredArchiveCandidate): Promise<string> {
  if (candidate.sourceSurface === 'qimeng-corpus') {
    const filePath = typeof candidate.metadata.filePath === 'string' ? candidate.metadata.filePath : ''
    if (!filePath) return ''
    const existingSource = await query<{ id: string }>(
      `SELECT id
         FROM wiki_sources
        WHERE source_type = 'file'
          AND file_path = ?
        ORDER BY updated_at DESC
        LIMIT 1`,
      [filePath],
    )
    return existingSource[0]?.id || ''
  }

  const existingSource = await query<{ id: string }>(
    `SELECT id
       FROM wiki_sources
      WHERE metadata_json LIKE ?
      ORDER BY updated_at DESC
      LIMIT 1`,
    [`%"archiveCandidateId":"${candidate.id}"%`],
  )
  return existingSource[0]?.id || ''
}

async function ensureArchiveWikiSource(candidate: StoredArchiveCandidate): Promise<string> {
  const existingSourceId = await findExistingArchiveSource(candidate)
  if (existingSourceId) return existingSourceId

  const filePath = typeof candidate.metadata.filePath === 'string' ? candidate.metadata.filePath : ''
  const sourceType = candidate.sourceSurface === 'qimeng-corpus' && filePath ? 'file' : 'auto'
  const author =
    candidate.sourceSurface === 'qimeng-corpus'
      ? typeof candidate.metadata.sourceAuthor === 'string'
        ? candidate.metadata.sourceAuthor
        : typeof candidate.metadata.source === 'string'
          ? candidate.metadata.source
          : ''
      : candidate.messageRole === 'assistant'
        ? candidate.agentRole || 'assistant'
        : 'user'
  const metadata = {
    ...candidate.metadata,
    archiveCandidateId: candidate.id,
    archiveStatus: 'confirmed',
    sourceSurface: candidate.sourceSurface,
    conversationId: candidate.conversationId,
    messageId: candidate.messageId,
    messageRole: candidate.messageRole,
    facets: candidate.facets,
    rationale: candidate.rationale,
    sourceTimestamp: getCandidateSourceTimestamp(candidate),
    sourcePointer: buildSourcePointer({
      sourceSurface: candidate.sourceSurface,
      conversationId: candidate.conversationId,
      messageId: candidate.messageId,
      messageRole: candidate.messageRole,
      metadata: candidate.metadata,
    }),
    wingLabel: candidate.wingLabel,
    hallLabel: candidate.hallLabel,
    roomLabel: candidate.room,
  }

  return createSource({
    title: candidate.title,
    sourceType,
    content: candidate.content,
    rawContent: candidate.content,
    filePath,
    folderPath: buildArchiveFolderPath(candidate),
    author,
    language: 'zh',
    tags: candidate.tags,
    status: 'pending',
    metadata,
  })
}

async function findExistingArchiveDrawer(candidate: StoredArchiveCandidate): Promise<string> {
  if (candidate.sourceSurface === 'qimeng-corpus') {
    const filePath = typeof candidate.metadata.filePath === 'string' ? candidate.metadata.filePath : ''
    if (!filePath) return ''
    const existingDrawer = await query<{ id: string }>(
      `SELECT id
         FROM mempalace_drawers
        WHERE source_type = 'file'
          AND file_path = ?
        ORDER BY updated_at DESC
        LIMIT 1`,
      [filePath],
    )
    return existingDrawer[0]?.id || ''
  }

  const existingDrawer = await query<{ id: string }>(
    `SELECT id
       FROM mempalace_drawers
      WHERE source_type = 'conversation'
        AND metadata_json LIKE ?
        AND metadata_json LIKE ?
      ORDER BY updated_at DESC
      LIMIT 1`,
    [`%"conversationId":"${candidate.conversationId}"%`, `%"messageId":"${candidate.messageId}"%`],
  )
  return existingDrawer[0]?.id || ''
}

async function ensureArchiveDrawer(candidate: StoredArchiveCandidate): Promise<string> {
  const sourceId = await ensureArchiveWikiSource(candidate)
  const existingDrawerId = await findExistingArchiveDrawer(candidate)
  if (existingDrawerId) return existingDrawerId

  if (candidate.sourceSurface === 'qimeng-corpus') {
    const filePath = typeof candidate.metadata.filePath === 'string' ? candidate.metadata.filePath : ''
    const sourceAuthor =
      typeof candidate.metadata.sourceAuthor === 'string'
        ? candidate.metadata.sourceAuthor
        : typeof candidate.metadata.source === 'string'
          ? candidate.metadata.source
          : ''
    const sourceMetadata = {
      ...candidate.metadata,
      sourceSurface: candidate.sourceSurface,
      sourceId,
      archivedBy: 'qimeng-corpus-confirm',
      archiveStatus: 'confirmed',
      candidateId: candidate.id,
      relativePath:
        typeof candidate.metadata.relativePath === 'string' ? candidate.metadata.relativePath : candidate.messageId,
      filePath,
      facets: candidate.facets,
      rationale: candidate.rationale,
      sourceTimestamp: getCandidateSourceTimestamp(candidate),
      wingLabel: candidate.wingLabel,
      hallLabel: candidate.hallLabel,
      roomLabel: candidate.room,
    }

    return createDrawer({
      title: candidate.title,
      wing: candidate.wing,
      hall: candidate.hall,
      room: candidate.room,
      rawContent: candidate.content,
      sourceType: 'file',
      filePath,
      folderPath: buildArchiveFolderPath(candidate),
      author: sourceAuthor,
      language: 'zh',
      tags: candidate.tags,
      metadata: sourceMetadata,
    })
  }

  return createDrawer({
    title: candidate.title,
    wing: candidate.wing,
    hall: candidate.hall,
    room: candidate.room,
    rawContent: candidate.content,
    sourceType: 'conversation',
    folderPath: buildArchiveFolderPath(candidate),
    author: candidate.messageRole === 'assistant' ? candidate.agentRole || 'assistant' : 'user',
    language: 'zh',
    tags: candidate.tags,
    metadata: {
      sourceSurface: candidate.sourceSurface,
      sourceId,
      archivedBy: 'click-preview-confirm',
      archiveStatus: 'confirmed',
      conversationId: candidate.conversationId,
      messageId: candidate.messageId,
      messageRole: candidate.messageRole,
      agentRole: candidate.agentRole,
      facets: candidate.facets,
      rationale: candidate.rationale,
      sourceTimestamp: getCandidateSourceTimestamp(candidate),
      wingLabel: candidate.wingLabel,
      hallLabel: candidate.hallLabel,
      roomLabel: candidate.room,
    },
  })
}

async function archiveCandidateRecord(candidate: StoredArchiveCandidate): Promise<ArchiveCandidate> {
  if (candidate.status === 'archived' && candidate.archivedDrawerId) {
    return enrichArchiveCandidate(candidate)
  }

  const drawerId = await ensureArchiveDrawer(candidate)
  const sourceId = await findExistingArchiveSource(candidate)
  const metadata = {
    ...candidate.metadata,
    archivedAt: new Date().toISOString(),
    archivedDrawerId: drawerId,
    archivedSourceId: sourceId,
    archivedBy: candidate.sourceSurface === 'qimeng-corpus' ? 'qimeng-corpus-confirm' : 'click-preview-confirm',
    sourcePointer: buildSourcePointer({
      sourceSurface: candidate.sourceSurface,
      conversationId: candidate.conversationId,
      messageId: candidate.messageId,
      messageRole: candidate.messageRole,
      metadata: candidate.metadata,
    }),
  }

  await run(
    `UPDATE archive_candidates
       SET status = 'archived',
           archived_drawer_id = ?,
           metadata_json = ?,
           updated_at = datetime('now','localtime')
     WHERE id = ?`,
    [drawerId, JSON.stringify(metadata), candidate.id],
  )
  try {
    await dbSaveOperatingEvent({
      id: `op_archive_${candidate.id}`,
      type: 'memory_candidate',
      stage: 'remember',
      category: 'knowledge',
      content: candidate.content,
      archiveReason: candidate.rationale || `归档到 ${candidate.wingLabel}/${candidate.hallLabel}/${candidate.room}`,
      status: 'confirmed',
      source: {
        kind: candidate.sourceSurface === 'qimeng-corpus' ? 'qimeng' : 'conversation',
        sourceId: sourceId || candidate.id,
        title: candidate.title || candidate.messageRole,
      },
      confidence: 0.82,
      entities: candidate.tags,
    })
  } catch {
    // Event ledger should not block archive confirmation.
  }

  const archived = await getArchiveCandidateById(candidate.id)
  if (archived) return archived

  return enrichArchiveCandidate({
    ...candidate,
    status: 'archived',
    archivedDrawerId: drawerId,
    metadata,
  })
}

export async function ensureConversationArchiveCandidate(params: {
  conversationId: string
  message: SessionMessage
  agentRole?: string
}): Promise<ArchiveCandidate | null> {
  const { conversationId, message, agentRole = 'general' } = params
  if (!shouldOfferArchiveTag(message)) return null

  const suggestion = previewQimengArchive(message, agentRole)
  const metadataWithoutPointer = {
    sourceSurface: 'openbasaka',
    conversationId,
    messageId: message.id,
    messageRole: message.role,
    sourceTimestamp: new Date(message.timestamp).toISOString(),
    suggestedClassification: suggestion,
  }
  const baseMetadata = {
    ...metadataWithoutPointer,
    sourcePointer: buildSourcePointer({
      sourceSurface: 'openbasaka',
      conversationId,
      messageId: message.id,
      messageRole: message.role,
      metadata: metadataWithoutPointer,
    }),
  }

  const existingRows = await query<Record<string, unknown>>(
    'SELECT * FROM archive_candidates WHERE conversation_id = ? AND message_id = ? LIMIT 1',
    [conversationId, message.id],
  )
  const existing = existingRows[0] ? parseCandidateRow(existingRows[0]) : null

  if (existing) {
    if (existing.status !== 'archived') {
      const preserveManualEdits = Boolean(existing.metadata.customized || existing.metadata.userEditedAt)
      const metadata = {
        ...existing.metadata,
        ...baseMetadata,
      }
      await run(
        `UPDATE archive_candidates
           SET content = ?, message_role = ?, agent_role = ?, title = ?, suggested_wing = ?,
               suggested_hall = ?, suggested_room = ?, suggested_tags = ?, suggested_facets = ?,
               rationale = ?, metadata_json = ?, updated_at = datetime('now','localtime')
         WHERE id = ?`,
        [
          message.content,
          message.role,
          agentRole,
          preserveManualEdits ? existing.title : suggestion.title,
          preserveManualEdits ? existing.wing : suggestion.wing,
          preserveManualEdits ? existing.hall : suggestion.hall,
          preserveManualEdits ? existing.room : suggestion.room,
          JSON.stringify(preserveManualEdits ? existing.tags : suggestion.tags),
          JSON.stringify(preserveManualEdits ? existing.facets : suggestion.facets),
          preserveManualEdits ? existing.rationale : suggestion.rationale,
          JSON.stringify(metadata),
          existing.id,
        ],
      )
      const refreshed = await query<Record<string, unknown>>('SELECT * FROM archive_candidates WHERE id = ? LIMIT 1', [
        existing.id,
      ])
      return refreshed[0] ? enrichArchiveCandidate(parseCandidateRow(refreshed[0])) : enrichArchiveCandidate(existing)
    }
    return enrichArchiveCandidate(existing)
  }

  const id = generateId()
  await run(
    `INSERT INTO archive_candidates
     (id, conversation_id, message_id, message_role, content, source_surface, agent_role,
      title, suggested_wing, suggested_hall, suggested_room, suggested_tags, suggested_facets,
      rationale, status, archived_drawer_id, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'openbasaka', ?, ?, ?, ?, ?, ?, ?, ?, 'pending', '', ?, datetime('now','localtime'), datetime('now','localtime'))`,
    [
      id,
      conversationId,
      message.id,
      message.role,
      message.content,
      agentRole,
      suggestion.title,
      suggestion.wing,
      suggestion.hall,
      suggestion.room,
      JSON.stringify(suggestion.tags),
      JSON.stringify(suggestion.facets),
      suggestion.rationale,
      JSON.stringify(baseMetadata),
    ],
  )
  try {
    await dbSaveOperatingEvent({
      id: `op_archive_candidate_${id}`,
      type: 'memory_candidate',
      stage: 'capture',
      category: 'knowledge',
      content: message.content,
      archiveReason: suggestion.rationale,
      status: 'pending',
      source: { kind: 'conversation', sourceId: id, title: suggestion.title },
      confidence: 0.72,
      entities: suggestion.tags,
    })
  } catch {
    // Event ledger should not block candidate creation.
  }

  return enrichArchiveCandidate({
    id,
    conversationId,
    messageId: message.id,
    messageRole: message.role,
    content: message.content,
    sourceSurface: 'openbasaka',
    agentRole,
    status: 'pending',
    archivedDrawerId: '',
    metadata: baseMetadata,
    createdAt: '',
    updatedAt: '',
    ...suggestion,
  })
}

export async function updateConversationArchiveCandidate(params: {
  candidateId: string
  title: string
  room: string
  tags: string[]
  facets: QimengFacet[]
}): Promise<ArchiveCandidate | null> {
  const rows = await query<Record<string, unknown>>('SELECT * FROM archive_candidates WHERE id = ? LIMIT 1', [
    params.candidateId,
  ])
  const existing = rows[0] ? parseCandidateRow(rows[0]) : null
  if (!existing) return null
  if (existing.status !== 'pending') return enrichArchiveCandidate(existing)

  const title = sanitizeText(params.title, buildTitle(existing.content), 60)
  const room = sanitizeText(params.room, existing.room, 48)
  const tags = sanitizeTags(params.tags)
  const facets = sanitizeFacets(params.facets)
  const metadata = {
    ...existing.metadata,
    customized: true,
    userEditedAt: new Date().toISOString(),
    sourcePointer: buildSourcePointer({
      sourceSurface: existing.sourceSurface,
      conversationId: existing.conversationId,
      messageId: existing.messageId,
      messageRole: existing.messageRole,
      metadata: existing.metadata,
    }),
  }

  await run(
    `UPDATE archive_candidates
       SET title = ?,
           suggested_room = ?,
           suggested_tags = ?,
           suggested_facets = ?,
           metadata_json = ?,
           updated_at = datetime('now','localtime')
     WHERE id = ?`,
    [title, room, JSON.stringify(tags), JSON.stringify(facets), JSON.stringify(metadata), existing.id],
  )

  const refreshed = await query<Record<string, unknown>>('SELECT * FROM archive_candidates WHERE id = ? LIMIT 1', [
    existing.id,
  ])
  return refreshed[0] ? enrichArchiveCandidate(parseCandidateRow(refreshed[0])) : null
}

export async function dismissConversationArchiveCandidate(candidateId: string): Promise<ArchiveCandidate | null> {
  const existing = await getStoredArchiveCandidateById(candidateId)
  if (!existing) return null
  if (existing.status === 'archived') return enrichArchiveCandidate(existing)
  if (existing.status === 'dismissed') return enrichArchiveCandidate(existing)

  const metadata = {
    ...existing.metadata,
    dismissedAt: new Date().toISOString(),
    dismissedBy: 'click-preview-dismiss',
    sourcePointer: buildSourcePointer({
      sourceSurface: existing.sourceSurface,
      conversationId: existing.conversationId,
      messageId: existing.messageId,
      messageRole: existing.messageRole,
      metadata: existing.metadata,
    }),
  }

  await run(
    `UPDATE archive_candidates
       SET status = 'dismissed',
           metadata_json = ?,
           updated_at = datetime('now','localtime')
     WHERE id = ?`,
    [JSON.stringify(metadata), existing.id],
  )

  return getArchiveCandidateById(existing.id)
}

export async function archivePendingArchiveCandidate(candidateId: string): Promise<ArchiveCandidate | null> {
  const candidate = await getStoredArchiveCandidateById(candidateId)
  if (!candidate) return null
  if (candidate.status !== 'pending') {
    return enrichArchiveCandidate(candidate)
  }
  return archiveCandidateRecord(candidate)
}

export async function archiveConversationMessage(params: {
  conversationId: string
  message: SessionMessage
  agentRole?: string
}): Promise<ArchiveCandidate | null> {
  const { conversationId, message, agentRole = 'general' } = params
  const candidate = await ensureConversationArchiveCandidate({ conversationId, message, agentRole })
  if (!candidate) return null
  return archivePendingArchiveCandidate(candidate.id)
}
