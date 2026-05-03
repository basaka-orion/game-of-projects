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
export type ArchiveTargetKind = 'qimeng' | 'knowledge' | 'master'
export type ArchiveTargetSection = 'personal' | 'world' | 'master'

export interface ArchiveTargetOption {
  kind: ArchiveTargetKind
  label: string
  section: ArchiveTargetSection
  sectionLabel: string
  title: string
  path: string
  reason: string
  confidence: number
  recommended?: boolean
}

export interface ArchiveSuggestion {
  title: string
  wing: QimengWing
  wingLabel: string
  hall: QimengHall
  hallLabel: string
  room: string
  targetKind: ArchiveTargetKind
  targetLabel: string
  targetSection: ArchiveTargetSection
  suggestedTargets: ArchiveTargetOption[]
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
  archivedSourceId: string
  archivedPageId: string
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

export const ARCHIVE_TARGET_META: Record<
  ArchiveTargetKind,
  { label: string; section: ArchiveTargetSection; sectionLabel: string; description: string }
> = {
  qimeng: {
    label: '归入启蒙',
    section: 'personal',
    sectionLabel: '过往经历与思考',
    description: '属于你的经历、想法、愿望、创作与关键对话。',
  },
  knowledge: {
    label: '放入知识',
    section: 'world',
    sectionLabel: '世界知识',
    description: '来自外部世界的事实、资料、论文、网页与可引用知识。',
  },
  master: {
    label: '收为大佬技能',
    section: 'master',
    sectionLabel: '大佬技能与思路',
    description: '来自高手、项目、框架和工作流的可复用方法。',
  },
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

function safeObjectArray(value: string): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : []
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

function isArchiveTargetKind(value: unknown): value is ArchiveTargetKind {
  return value === 'qimeng' || value === 'knowledge' || value === 'master'
}

function normalizeArchiveTargetKind(value: unknown, fallback: ArchiveTargetKind = 'qimeng'): ArchiveTargetKind {
  return isArchiveTargetKind(value) ? value : fallback
}

function normalizeArchiveTargetSection(value: unknown, targetKind: ArchiveTargetKind): ArchiveTargetSection {
  if (value === 'personal' || value === 'world' || value === 'master') return value
  return ARCHIVE_TARGET_META[targetKind].section
}

function buildArchiveTargetPath(
  kind: ArchiveTargetKind,
  suggestion: Pick<ArchiveSuggestion, 'wing' | 'hall' | 'room'>,
): string {
  if (kind === 'knowledge') return `知识＋大佬/世界知识/${suggestion.room}`
  if (kind === 'master') return `知识＋大佬/大佬技能与思路/${suggestion.room}`
  return `启蒙/${suggestion.wing}/${suggestion.hall}/${suggestion.room}`
}

function inferArchiveTargetKind(
  content: string,
  suggestion: Pick<ArchiveSuggestion, 'wing' | 'hall' | 'tags'>,
): ArchiveTargetKind {
  const text = normalizeContent(content)
  const tagText = suggestion.tags.join(' ')
  const haystack = `${text} ${tagText}`

  if (
    /大佬|大神|高手|专家|宝玉|baoyu|karpathy|hermes|graphify|mempalace|skill|skills|playbook|framework|工作流|方法论|范式|模式|教程|最佳实践/i.test(
      haystack,
    )
  ) {
    return 'master'
  }

  if (
    /论文|研究|官方|文档|世界知识|事实|趋势|模型|gemma|google|openai|anthropic|网页|https?:\/\/|新闻|资料|数据集|benchmark|基准/i.test(
      haystack,
    )
  ) {
    return 'knowledge'
  }

  if (suggestion.wing === 'method' && /步骤|流程|原则|策略|框架/.test(haystack)) return 'master'
  if (suggestion.hall === 'consciousness' && /世界|社会|时代|文明|科技趋势/.test(haystack)) return 'knowledge'

  return 'qimeng'
}

function normalizeArchiveTargetOption(
  option: Record<string, unknown>,
  fallbackSuggestion: Pick<ArchiveSuggestion, 'wing' | 'hall' | 'room'>,
): ArchiveTargetOption | null {
  const kind = normalizeArchiveTargetKind(option.kind, 'qimeng')
  const meta = ARCHIVE_TARGET_META[kind]
  return {
    kind,
    label: typeof option.label === 'string' && option.label.trim() ? option.label.trim() : meta.label,
    section: normalizeArchiveTargetSection(option.section, kind),
    sectionLabel:
      typeof option.sectionLabel === 'string' && option.sectionLabel.trim()
        ? option.sectionLabel.trim()
        : meta.sectionLabel,
    title: typeof option.title === 'string' && option.title.trim() ? option.title.trim() : meta.description,
    path:
      typeof option.path === 'string' && option.path.trim()
        ? option.path.trim()
        : buildArchiveTargetPath(kind, fallbackSuggestion),
    reason: typeof option.reason === 'string' && option.reason.trim() ? option.reason.trim() : meta.description,
    confidence: typeof option.confidence === 'number' ? option.confidence : 0.68,
    recommended: Boolean(option.recommended),
  }
}

function buildArchiveTargetOptions(
  suggestion: Pick<ArchiveSuggestion, 'wing' | 'hall' | 'room' | 'tags'>,
  content: string,
  selectedKind?: ArchiveTargetKind,
): ArchiveTargetOption[] {
  const recommendedKind = selectedKind || inferArchiveTargetKind(content, suggestion)
  const reasons: Record<ArchiveTargetKind, string> = {
    qimeng: '保留为你的个人经历、思考、创意或关键对话。',
    knowledge: '沉淀为外部世界知识，进入可检索、可引用的知识区。',
    master: '拆成可复用的大佬方法、步骤和工作流，供项目推进时调用。',
  }

  return (['qimeng', 'knowledge', 'master'] as ArchiveTargetKind[]).map((kind) => {
    const meta = ARCHIVE_TARGET_META[kind]
    const recommended = kind === recommendedKind
    return {
      kind,
      label: meta.label,
      section: meta.section,
      sectionLabel: meta.sectionLabel,
      title: meta.description,
      path: buildArchiveTargetPath(kind, suggestion),
      reason: reasons[kind],
      confidence: recommended ? 0.82 : 0.62,
      recommended,
    }
  })
}

function decorateArchiveSuggestion<
  T extends Omit<ArchiveSuggestion, 'targetKind' | 'targetLabel' | 'targetSection' | 'suggestedTargets'>,
>(
  suggestion: T,
  content: string,
  selectedKind?: ArchiveTargetKind,
): T & Pick<ArchiveSuggestion, 'targetKind' | 'targetLabel' | 'targetSection' | 'suggestedTargets'> {
  const suggestedTargets = buildArchiveTargetOptions(suggestion, content, selectedKind)
  const selectedTarget =
    suggestedTargets.find((option) => option.kind === selectedKind) ||
    suggestedTargets.find((option) => option.recommended) ||
    suggestedTargets[0]

  return {
    ...suggestion,
    targetKind: selectedTarget.kind,
    targetLabel: selectedTarget.label,
    targetSection: selectedTarget.section,
    suggestedTargets,
  }
}

function retargetArchiveSuggestion(
  suggestion: ArchiveSuggestion,
  content: string,
  selectedKind: ArchiveTargetKind,
): ArchiveSuggestion {
  return decorateArchiveSuggestion(
    {
      title: suggestion.title,
      wing: suggestion.wing,
      wingLabel: suggestion.wingLabel,
      hall: suggestion.hall,
      hallLabel: suggestion.hallLabel,
      room: suggestion.room,
      tags: suggestion.tags,
      facets: suggestion.facets,
      rationale: suggestion.rationale,
    },
    content,
    selectedKind,
  )
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
  const metadata = safeObject((row.metadata_json as string) || '{}')
  const targetKind = normalizeArchiveTargetKind(row.target_kind || metadata.targetKind, 'qimeng')
  const persistedTargets = safeObjectArray((row.suggested_targets_json as string) || '[]')
    .map((option) =>
      normalizeArchiveTargetOption(option, { wing, hall, room: (row.suggested_room as string) || '对话-关键碰撞' }),
    )
    .filter((option): option is ArchiveTargetOption => Boolean(option))
  const suggestedTargets =
    persistedTargets.length > 0
      ? persistedTargets.map((option) => ({ ...option, recommended: option.kind === targetKind || option.recommended }))
      : buildArchiveTargetOptions(
          {
            wing,
            hall,
            room: (row.suggested_room as string) || '对话-关键碰撞',
            tags: safeArray((row.suggested_tags as string) || '[]'),
          },
          (row.content as string) || '',
          targetKind,
        )
  const selectedTarget =
    suggestedTargets.find((option) => option.kind === targetKind) ||
    suggestedTargets.find((option) => option.recommended) ||
    suggestedTargets[0]

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
    targetKind: selectedTarget.kind,
    targetLabel: (row.target_label as string) || selectedTarget.label,
    targetSection: normalizeArchiveTargetSection(row.target_section || selectedTarget.section, selectedTarget.kind),
    suggestedTargets,
    tags: safeArray((row.suggested_tags as string) || '[]'),
    facets: safeArray((row.suggested_facets as string) || '[]') as QimengFacet[],
    rationale: (row.rationale as string) || '',
    status: (row.status as ArchiveCandidate['status']) || 'pending',
    archivedDrawerId: (row.archived_drawer_id as string) || '',
    archivedSourceId: (row.archived_source_id as string) || (metadata.archivedSourceId as string) || '',
    archivedPageId: (row.archived_page_id as string) || (metadata.archivedPageId as string) || '',
    metadata,
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
  if (!message.id || message.id === 'welcome' || message.id.startsWith('err-')) return false
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
  return decorateArchiveSuggestion(
    {
      title: classification.title,
      wing: classification.wing as QimengWing,
      wingLabel: classification.wingLabel,
      hall: classification.hall as QimengHall,
      hallLabel: classification.hallLabel,
      room: classification.room,
      tags: classification.tags,
      facets: classification.facets as QimengFacet[],
      rationale: classification.rationale,
    },
    message.content,
  )
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
  return buildArchiveTargetPath(candidate.targetKind, candidate)
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
    targetKind: candidate.targetKind,
    targetLabel: candidate.targetLabel,
    targetSection: candidate.targetSection,
    targetSectionLabel: ARCHIVE_TARGET_META[candidate.targetKind].sectionLabel,
    suggestedTargets: candidate.suggestedTargets,
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
      targetKind: candidate.targetKind,
      targetLabel: candidate.targetLabel,
      targetSection: candidate.targetSection,
      targetSectionLabel: ARCHIVE_TARGET_META[candidate.targetKind].sectionLabel,
      suggestedTargets: candidate.suggestedTargets,
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
      targetKind: candidate.targetKind,
      targetLabel: candidate.targetLabel,
      targetSection: candidate.targetSection,
      targetSectionLabel: ARCHIVE_TARGET_META[candidate.targetKind].sectionLabel,
      suggestedTargets: candidate.suggestedTargets,
      facets: candidate.facets,
      rationale: candidate.rationale,
      sourceTimestamp: getCandidateSourceTimestamp(candidate),
      wingLabel: candidate.wingLabel,
      hallLabel: candidate.hallLabel,
      roomLabel: candidate.room,
    },
  })
}

function inferMasterName(candidate: StoredArchiveCandidate): string {
  const text = `${candidate.title} ${candidate.content} ${candidate.tags.join(' ')}`
  if (/karpathy/i.test(text)) return 'Karpathy'
  if (/hermes/i.test(text)) return 'Hermes Agent'
  if (/graphify/i.test(text)) return 'Graphify'
  if (/baoyu|宝玉/i.test(text)) return 'baoyu'
  if (/mempalace|记忆宫殿/i.test(text)) return 'MemPalace'
  return '未命名大佬/方法来源'
}

function extractMethodSteps(content: string, fallback: string): string[] {
  const steps = content
    .split('\n')
    .map((line) => line.trim())
    .map((line) =>
      line
        .replace(/^[-*]\s+/, '')
        .replace(/^\d+[.、)]\s*/, '')
        .trim(),
    )
    .filter((line) => line.length >= 6 && line.length <= 120)
    .slice(0, 8)

  if (steps.length > 0) return steps
  return [fallback || '以后在相似任务中调用此方法，再拆成更细步骤。']
}

async function upsertMasterSkillPattern(
  candidate: StoredArchiveCandidate,
  sourceId: string,
  drawerId: string,
): Promise<string> {
  if (candidate.targetKind !== 'master') return ''

  const patternId = `msp_${candidate.id}`
  const sourceUrl =
    typeof candidate.metadata.url === 'string'
      ? candidate.metadata.url
      : typeof candidate.metadata.sourceUrl === 'string'
        ? candidate.metadata.sourceUrl
        : ''
  const metadata = {
    archiveCandidateId: candidate.id,
    drawerId,
    sourceId,
    targetKind: candidate.targetKind,
    tags: candidate.tags,
    facets: candidate.facets,
  }

  await run(
    `INSERT OR REPLACE INTO master_skill_patterns
      (id, pattern_name, master_name, source_title, source_url, what_it_solves,
       steps_json, when_to_use_json, when_not_to_use_json, related_projects_json,
       related_agents_json, evidence_source_ids_json, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))`,
    [
      patternId,
      candidate.title || candidate.room,
      inferMasterName(candidate),
      candidate.title,
      sourceUrl,
      candidate.rationale || '从归档内容中沉淀可复用方法。',
      JSON.stringify(extractMethodSteps(candidate.content, candidate.rationale)),
      JSON.stringify([`当任务命中 ${candidate.tags.slice(0, 3).join('、') || candidate.room} 时优先参考。`]),
      JSON.stringify(['当内容只是私人经历、情绪记录或没有可复用步骤时不要强行套用。']),
      JSON.stringify([]),
      JSON.stringify([candidate.agentRole].filter(Boolean)),
      JSON.stringify([sourceId].filter(Boolean)),
      JSON.stringify(metadata),
    ],
  )

  return patternId
}

async function recordArchiveEvolutionEvent(
  candidate: StoredArchiveCandidate,
  sourceId: string,
  drawerId: string,
  masterSkillPatternId: string,
): Promise<void> {
  const eventId = `evo_archive_${candidate.id}`
  const eventType =
    candidate.targetKind === 'master'
      ? 'master_skill_learning'
      : candidate.targetKind === 'knowledge'
        ? 'world_knowledge_learning'
        : 'qimeng_memory_learning'
  const learnedWhat =
    candidate.targetKind === 'master'
      ? `把「${candidate.title}」沉淀为可复用的大佬技能。`
      : candidate.targetKind === 'knowledge'
        ? `把「${candidate.title}」放入世界知识区，后续回答可作为证据来源。`
        : `把「${candidate.title}」收入《启蒙》，保留为个人探索与认知脉络。`
  const nextAction =
    candidate.targetKind === 'master'
      ? '在神经元/突触推进项目时，把这条方法作为可调用技能候选。'
      : candidate.targetKind === 'knowledge'
        ? '等待 Karpathy Wiki 编译，把来源拆成可检索证据。'
        : '等待《启蒙》自动分类与记忆宫殿抽屉编译。'
  const metadata = {
    archiveCandidateId: candidate.id,
    drawerId,
    sourceId,
    targetKind: candidate.targetKind,
    targetLabel: candidate.targetLabel,
    folderPath: buildArchiveFolderPath(candidate),
    tags: candidate.tags,
    facets: candidate.facets,
  }

  await run(
    `INSERT OR REPLACE INTO evolution_events
      (id, source_kind, source_id, event_type, learned_what, evidence_json,
       affected_neuron_ids_json, suggested_synapses_json, suggested_skill_pattern_ids_json,
       confidence, next_action, status, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now','localtime'), datetime('now','localtime'))`,
    [
      eventId,
      candidate.sourceSurface === 'qimeng-corpus' ? 'qimeng' : 'conversation',
      sourceId || candidate.id,
      eventType,
      learnedWhat,
      JSON.stringify([
        {
          title: candidate.title,
          sourceId,
          drawerId,
          excerpt: formatArchiveSnippetForEvent(candidate.content),
        },
      ]),
      JSON.stringify([]),
      JSON.stringify(candidate.tags.map((tag) => ({ tag, reason: '归档标签可作为突触候选' }))),
      JSON.stringify(masterSkillPatternId ? [masterSkillPatternId] : []),
      0.78,
      nextAction,
      JSON.stringify(metadata),
    ],
  )
}

function formatArchiveSnippetForEvent(content: string): string {
  const normalized = normalizeContent(content)
  return normalized.length <= 180 ? normalized : `${normalized.slice(0, 180)}…`
}

async function archiveCandidateRecord(candidate: StoredArchiveCandidate): Promise<ArchiveCandidate> {
  if (candidate.status === 'archived' && candidate.archivedDrawerId) {
    return enrichArchiveCandidate(candidate)
  }

  const drawerId = await ensureArchiveDrawer(candidate)
  const sourceId = await findExistingArchiveSource(candidate)
  const masterSkillPatternId = await upsertMasterSkillPattern(candidate, sourceId, drawerId)
  await recordArchiveEvolutionEvent(candidate, sourceId, drawerId, masterSkillPatternId)
  const metadata = {
    ...candidate.metadata,
    archivedAt: new Date().toISOString(),
    archivedDrawerId: drawerId,
    archivedSourceId: sourceId,
    archivedPageId: '',
    masterSkillPatternId,
    targetKind: candidate.targetKind,
    targetLabel: candidate.targetLabel,
    targetSection: candidate.targetSection,
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
           archived_source_id = ?,
           archived_page_id = '',
           metadata_json = ?,
           updated_at = datetime('now','localtime')
     WHERE id = ?`,
    [drawerId, sourceId, JSON.stringify(metadata), candidate.id],
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
  if (archived?.status === 'archived') return archived

  return enrichArchiveCandidate({
    ...candidate,
    status: 'archived',
    archivedDrawerId: drawerId,
    archivedSourceId: sourceId,
    archivedPageId: '',
    metadata,
  })
}

export async function ensureConversationArchiveCandidate(params: {
  conversationId: string
  message: SessionMessage
  agentRole?: string
  targetKind?: ArchiveTargetKind
}): Promise<ArchiveCandidate | null> {
  const { conversationId, message, agentRole = 'general', targetKind } = params
  if (!shouldOfferArchiveTag(message)) return null

  const baseSuggestion = previewQimengArchive(message, agentRole)
  const suggestion = targetKind
    ? retargetArchiveSuggestion(baseSuggestion, message.content, targetKind)
    : baseSuggestion
  const metadataWithoutPointer = {
    sourceSurface: 'openbasaka',
    conversationId,
    messageId: message.id,
    messageRole: message.role,
    sourceTimestamp: new Date(message.timestamp).toISOString(),
    targetKind: suggestion.targetKind,
    targetLabel: suggestion.targetLabel,
    targetSection: suggestion.targetSection,
    suggestedTargets: suggestion.suggestedTargets,
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
      const nextTargetKind = targetKind || existing.targetKind || suggestion.targetKind
      const nextSuggestion = retargetArchiveSuggestion(suggestion, message.content, nextTargetKind)
      const selectedTarget =
        nextSuggestion.suggestedTargets.find((option) => option.kind === nextTargetKind) ||
        nextSuggestion.suggestedTargets.find((option) => option.recommended) ||
        nextSuggestion.suggestedTargets[0]
      const metadata = {
        ...existing.metadata,
        ...baseMetadata,
        targetKind: selectedTarget.kind,
        targetLabel: selectedTarget.label,
        targetSection: selectedTarget.section,
        suggestedTargets: nextSuggestion.suggestedTargets,
      }
      await run(
        `UPDATE archive_candidates
           SET content = ?, message_role = ?, agent_role = ?, title = ?, suggested_wing = ?,
               suggested_hall = ?, suggested_room = ?, suggested_tags = ?, suggested_facets = ?,
               target_kind = ?, target_label = ?, target_section = ?, suggested_targets_json = ?,
               rationale = ?, metadata_json = ?, updated_at = datetime('now','localtime')
         WHERE id = ?`,
        [
          message.content,
          message.role,
          agentRole,
          preserveManualEdits ? existing.title : nextSuggestion.title,
          preserveManualEdits ? existing.wing : nextSuggestion.wing,
          preserveManualEdits ? existing.hall : nextSuggestion.hall,
          preserveManualEdits ? existing.room : nextSuggestion.room,
          JSON.stringify(preserveManualEdits ? existing.tags : nextSuggestion.tags),
          JSON.stringify(preserveManualEdits ? existing.facets : nextSuggestion.facets),
          selectedTarget.kind,
          selectedTarget.label,
          selectedTarget.section,
          JSON.stringify(nextSuggestion.suggestedTargets),
          preserveManualEdits ? existing.rationale : nextSuggestion.rationale,
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
      target_kind, target_label, target_section,
      title, suggested_wing, suggested_hall, suggested_room, suggested_tags, suggested_facets,
      suggested_targets_json, rationale, status, archived_drawer_id, archived_source_id, archived_page_id,
      metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'openbasaka', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', '', '', '', ?, datetime('now','localtime'), datetime('now','localtime'))`,
    [
      id,
      conversationId,
      message.id,
      message.role,
      message.content,
      agentRole,
      suggestion.targetKind,
      suggestion.targetLabel,
      suggestion.targetSection,
      suggestion.title,
      suggestion.wing,
      suggestion.hall,
      suggestion.room,
      JSON.stringify(suggestion.tags),
      JSON.stringify(suggestion.facets),
      JSON.stringify(suggestion.suggestedTargets),
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
    archivedSourceId: '',
    archivedPageId: '',
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
  targetKind?: ArchiveTargetKind
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
  const targetKind = normalizeArchiveTargetKind(params.targetKind, existing.targetKind)
  const suggestedTargets = buildArchiveTargetOptions(
    {
      wing: existing.wing,
      hall: existing.hall,
      room,
      tags,
    },
    existing.content,
    targetKind,
  )
  const selectedTarget =
    suggestedTargets.find((option) => option.kind === targetKind) ||
    suggestedTargets.find((option) => option.recommended) ||
    suggestedTargets[0]
  const metadata = {
    ...existing.metadata,
    customized: true,
    userEditedAt: new Date().toISOString(),
    targetKind: selectedTarget.kind,
    targetLabel: selectedTarget.label,
    targetSection: selectedTarget.section,
    suggestedTargets,
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
           target_kind = ?,
           target_label = ?,
           target_section = ?,
           suggested_targets_json = ?,
           metadata_json = ?,
           updated_at = datetime('now','localtime')
     WHERE id = ?`,
    [
      title,
      room,
      JSON.stringify(tags),
      JSON.stringify(facets),
      selectedTarget.kind,
      selectedTarget.label,
      selectedTarget.section,
      JSON.stringify(suggestedTargets),
      JSON.stringify(metadata),
      existing.id,
    ],
  )

  const refreshed = await query<Record<string, unknown>>('SELECT * FROM archive_candidates WHERE id = ? LIMIT 1', [
    existing.id,
  ])
  return refreshed[0] ? enrichArchiveCandidate(parseCandidateRow(refreshed[0])) : null
}

export async function updateArchiveCandidateTarget(
  candidateId: string,
  targetKind: ArchiveTargetKind,
): Promise<ArchiveCandidate | null> {
  const existing = await getStoredArchiveCandidateById(candidateId)
  if (!existing) return null
  if (existing.status !== 'pending') return enrichArchiveCandidate(existing)

  const normalizedTargetKind = normalizeArchiveTargetKind(targetKind, existing.targetKind)
  const suggestedTargets = buildArchiveTargetOptions(existing, existing.content, normalizedTargetKind)
  const selectedTarget =
    suggestedTargets.find((option) => option.kind === normalizedTargetKind) ||
    suggestedTargets.find((option) => option.recommended) ||
    suggestedTargets[0]
  const metadata = {
    ...existing.metadata,
    targetKind: selectedTarget.kind,
    targetLabel: selectedTarget.label,
    targetSection: selectedTarget.section,
    suggestedTargets,
    targetSelectedAt: new Date().toISOString(),
  }

  await run(
    `UPDATE archive_candidates
       SET target_kind = ?,
           target_label = ?,
           target_section = ?,
           suggested_targets_json = ?,
           metadata_json = ?,
           updated_at = datetime('now','localtime')
     WHERE id = ?`,
    [
      selectedTarget.kind,
      selectedTarget.label,
      selectedTarget.section,
      JSON.stringify(suggestedTargets),
      JSON.stringify(metadata),
      existing.id,
    ],
  )

  return getArchiveCandidateById(existing.id)
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
