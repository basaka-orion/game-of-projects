/**
 * Query Engine — AI 驱动的 Wiki 查询引擎
 *
 * 目标：把 “检索命中” 升级为 “可追溯的证据综合”。
 * 查询时同时聚合：
 * - Wiki 页面
 * - 原始来源
 * - 生肉抽屉
 * - Chunk 级证据
 *
 * LLM 负责把多条弱证据组织成强回答，但每个关键判断都必须带引用标签。
 */
import { LLMConfig, chatCompletion, chatCompletionStream, StreamCallbacks } from '../ai/provider'
import { searchPages, searchSources, createPage, appendToLog, parseWikiLinks } from './wiki'
import { searchDrawers } from './drawer'
import { hybridSearch as vectorHybridSearch, type HybridSearchResult } from './vector-store'
import { query } from '../db/repository'
import { loadCognitiveProfile, renderCognitivePrompt } from '../boss/cognitive-profile'
import {
  analyzeKnowledgeQuery,
  countOccurrences,
  type CorpusCountIntent,
  type PersonalDiscoveryIntent,
} from './query-analysis'
import { countMatchedEntities, rankAndFilterRelationItems } from './relation-evidence'
import {
  getPersonalDiscoverySpec,
  rankPersonalDiscoveryItems,
  scorePersonalDiscoveryEvidence,
  type PersonalDiscoveryEvidenceScore,
} from './personal-evidence'
import { getBossProfileAsync } from '../db/store'
import type { GroundedResearchReport } from '../ai/auto-research'
import {
  buildFolderScopeCondition,
  loadKnowledgeSourceScopeEntries,
  pageMatchesFolderScope,
} from './folders'

// ─── 接口 ───

export interface QueryCitation {
  id: string
  label: string
  kind: 'page' | 'source' | 'drawer' | 'chunk'
  title: string
  excerpt: string
  meta: string[]
  pageId?: string
  sourceId?: string
  drawerId?: string
  url?: string
  filePath?: string
  sourceType?: string
  score?: number
  confidence?: number
}

export interface QueryResult {
  answer: string
  sourcePageIds: string[]
  confidence: number
  fromWiki: boolean
  answerMode?: 'direct' | 'count' | 'synthesis' | 'curation'
  citations?: QueryCitation[]
  usedCitationIds?: string[]
  evidence?: {
    queryType: 'count' | 'lookup' | 'synthesis'
    term?: string
    pageMentions?: number
    sourceMentions?: number
    pageHits?: number
    sourceHits?: number
    drawerHits?: number
    chunkHits?: number
    topPageTitles?: string[]
    topSourceTitles?: string[]
  }
}

export interface FileAnswerAsPageOptions {
  citations?: QueryCitation[]
  research?: GroundedResearchReport | null
  answerMode?: QueryResult['answerMode']
  folderPath?: string | null
}

export interface KnowledgeQueryScope {
  folderPath?: string | null
}

interface ChunkEvidenceRow {
  id: string
  pageId: string
  sourceId: string
  drawerId: string
  chunkIndex: number
  content: string
  headerBreadcrumb: string
  pageTitle: string
  sourceTitle: string
  sourceType: string
  url: string
  filePath: string
  drawerTitle: string
}

interface CorpusCollectionPageRow {
  id: string
  title: string
  summary: string
  content: string
  created_at: string
  updated_at: string
}

interface CorpusCollectionSourceRow {
  id: string
  title: string
  content: string
  source_type: string
  url: string
  file_path: string
  created_at: string
  updated_at: string
}

interface ThemeRule {
  name: string
  keywords: string[]
}

type SearchPageMatch = Awaited<ReturnType<typeof searchPages>>[number]
type SearchSourceMatch = Awaited<ReturnType<typeof searchSources>>[number]
type SearchDrawerMatch = Awaited<ReturnType<typeof searchDrawers>>[number]

// ─── 常量 ───

const QUERY_SYSTEM_PROMPT = `你是知识库查询引擎，遵循 Karpathy LLM Wiki 的查询原则：把页面、原始来源、片段和生肉证据综合成一个可追溯答案。

回答规则：
- 你的职责不是判断“有没有一条完美命中的原文”，而是综合全部证据给出当前最强、最可辩护的答案。
- 如果多条证据共同指向同一个关系或结论，即使没有一条原文完全直说，也要明确写出“综合多条证据可推断/可认为/高度怀疑……”，不要机械拒答。
- 只有当证据包里几乎没有相关线索时，才说知识库中暂无足够信息。
- 严禁编造证据包外的新事实；允许有限推断，但必须显式标注为“推断”“倾向”“可能”“尚需核实”。
- 不要输出思考过程、<think> 标签、草稿推理或任何隐藏分析。
- 每个关键判断句后都要附上引用标签，例如 [P1][S2]、[C1]、[D1]。
- 用中文回答，Markdown 输出。

输出结构固定为：
## 结论
直接回答问题，先给最强结论，再说明这是直接陈述还是综合推断。

## 依据
- 用 3-6 条 bullet 说明证据链，每条都附引用标签。

## 不确定点
- 列出仍然模糊、冲突或尚待补证的地方；如果没有明显冲突，也要说明当前证据边界。`

const CURATION_SYSTEM_PROMPT = `你是知识库策展助手。你的任务不是机械检索“有没有原句”，而是从同一作品集合里挑出最符合用户当前诉求的条目，并给出可辩护的推荐。

回答规则：
- 必须先给一个“主推荐”，再给 1-3 个“备选”。
- 这是价值判断题，不需要假装唯一正确；要明确写出“基于当前证据，我更倾向推荐……”。
- 只能依据证据包中的标题、摘要、摘录和主题线索做判断，严禁编造集合外事实。
- 不要输出思考过程、<think> 标签、草稿推理或任何隐藏分析。
- 每个关键判断后都要附引用标签，例如 [P1][P3]。
- 如果候选之间很接近，要说明为什么你把其中一篇放在第一位。
- 用中文回答，Markdown 输出。

输出结构固定为：
## 主推荐
先给一篇最推荐的，并直接说明它为什么更适合当前问题。

## 理由
- 用 3-5 条 bullet 解释你的判断，每条附引用。

## 备选
- 列出 1-3 篇备选，并说明它们分别更偏向什么。

## 不确定点
- 说明这次推荐的边界与主观性。`

function buildPersonalDiscoverySystemPrompt(intent: PersonalDiscoveryIntent): string {
  const spec = getPersonalDiscoverySpec(intent.dimension)
  const topicLine = intent.targetType === 'person'
    ? `用户问的是“从私人记录里识别与${spec.label}相关的人物对象”。`
    : `用户问的是“从私人记录里识别与${spec.label}相关的稳定自我线索”。`
  const scopeLine = intent.targetType === 'person'
    ? '只有当证据真的落到具体对象、明显指向的“你/她/他”或可辨认代称时，才把其算作对象。'
    : '只有当证据体现出稳定的第一人称自述、反复出现的倾向或明确的价值/动机/优势/弱点信号时，才纳入画像。'
  const headingLine = intent.targetType === 'person'
    ? '## 高置信对象\n- 每条写“名字/代称：为什么这样判断”。附引用。\n\n## 可能对象或未具名对象\n- 写证据较弱但值得保留的对象，或者明确说“有未具名对象”。附引用。'
    : `## 高置信线索\n- 每条写“线索：为什么这样判断”。附引用。\n\n## 可能线索\n- 写证据较弱但值得保留的倾向、模式或画像切片。附引用。`

  return `你是私人知识库中的侦探式自我追索助手。${topicLine} 这不是普通关键词检索，而是要从多条私密记录里识别稳定线索与证据强弱。

回答规则：
- 先直接回答用户最想知道的核心结论，再按证据强弱分层。
- ${scopeLine}
- 严禁把泛泛而谈的人生感悟、书摘、关系理论、抽象鸡汤或对大众的建议混进本人画像。
- 如果记录更像文学化想象、角色扮演、投射性写作或匿名书信，要单独标注，不要和现实线索硬并。
- 允许综合多条证据做有限推断，但必须明确写出“推断”“倾向”“可能”。
- 不要输出思考过程、<think> 标签或隐藏分析。
- 每个判断都必须附引用标签，例如 [P1][P3]。
- 用中文回答，Markdown 输出。

输出结构固定为：
## 结论
一句话概括目前能识别出的范围。

${headingLine}

## 不应直接算入
- 点名哪些页面只是抽象讨论、泛论或不足以直接落到本题结论。

## 不确定点
- 说明证据边界、匿名性、文学化或样本不足问题。`
}

const SEASON_NUMBER_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  十一: 11,
  十二: 12,
  十三: 13,
  十四: 14,
}

const THEME_RULES: ThemeRule[] = [
  {
    name: '哲思与世界观',
    keywords: ['世界', '意义', '意识', '神', '法则', '生命', '时间', '真相', '存在', '宇宙', '本质', '造物主', '相对', '永恒'],
  },
  {
    name: '自我与行动',
    keywords: ['努力', '成长', '改变', '发展', '意志', '行动', '专注', '能力', '节奏', '目标', '选择', '约束', '自律', '坚持', '把握'],
  },
  {
    name: '情绪与关系',
    keywords: ['喜欢', '爱情', '爱人', '孤独', '快乐', '悲伤', '痛苦', '关系', '亲密', '失去', '遗憾', '暧昧', '温柔', '伤心'],
  },
  {
    name: '社会与现实观察',
    keywords: ['社会', '国家', '人类', '合作', '规则', '机器', '现实', '群体', '文明', '政治', '秩序'],
  },
  {
    name: '创作与表达',
    keywords: ['记录', '表达', '灵感', '初衷', '作品', '上传', '组合', '题材', '创作', '文字', '写作'],
  },
  {
    name: '娱乐与审美',
    keywords: ['音乐', '电影', '游戏', '剧场', '审美', 'vr', '吃鸡', '艺术'],
  },
]

// ─── 工具 ───

function normalizeInline(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  const result: string[] = []
  for (const value of values) {
    if (!value || result.includes(value)) continue
    result.push(value)
  }
  return result
}

function isUsefulInvestigationQuery(queryText: string): boolean {
  const normalized = queryText.trim()
  if (!normalized) return false
  if (/^[\u4e00-\u9fff]$/u.test(normalized)) return false
  if (/^[A-Za-z]$/u.test(normalized)) return false
  return normalized.length >= 2
}

function buildInvestigationQueries(
  question: string,
  analysis: ReturnType<typeof analyzeKnowledgeQuery>,
): string[] {
  const rawQueries = uniqueStrings([
    analysis.relationEntities.length > 0 ? analysis.relationEntities.join(' ') : '',
    analysis.searchText,
    ...analysis.relationEntities,
    ...analysis.searchTerms
      .filter(term => term.length >= 2)
      .sort((a, b) => b.length - a.length),
    question.trim(),
  ])

  const maxQueries = analysis.wantsExhaustiveCoverage ? 8 : 5
  return rawQueries.filter(isUsefulInvestigationQuery).slice(0, maxQueries)
}

function mergeInvestigativeResults<T extends { id: string; score: number }>(
  resultSets: T[][],
  limit: number,
): T[] {
  const merged = new Map<string, { item: T; bestScore: number; hitCount: number }>()

  for (const resultSet of resultSets) {
    for (const item of resultSet) {
      const existing = merged.get(item.id)
      if (!existing) {
        merged.set(item.id, { item, bestScore: item.score || 0, hitCount: 1 })
        continue
      }

      if ((item.score || 0) > existing.bestScore) {
        existing.item = item
        existing.bestScore = item.score || 0
      }
      existing.hitCount += 1
    }
  }

  return Array.from(merged.values())
    .map(entry => ({
      ...entry.item,
      score: Number((entry.bestScore + Math.min(8, entry.hitCount - 1) * 1.5).toFixed(3)),
    }))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, limit)
}

function truncate(text: string, maxLength: number): string {
  const cleaned = normalizeInline(text)
  if (cleaned.length <= maxLength) return cleaned
  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function prioritizeCitationsByEntityCoverage(citations: QueryCitation[], entities: string[]): QueryCitation[] {
  if (entities.length < 2) return citations

  return [...citations].sort((a, b) => {
    const scoreA = countMatchedEntities(`${a.title}\n${a.excerpt}`, entities)
    const scoreB = countMatchedEntities(`${b.title}\n${b.excerpt}`, entities)
    if (scoreA !== scoreB) return scoreB - scoreA
    return (b.score || 0) - (a.score || 0)
  })
}

function relabelCitations(citations: QueryCitation[], prefix: QueryCitation['label'][0]): QueryCitation[] {
  return citations.map((citation, index) => ({
    ...citation,
    label: `${prefix}${index + 1}`,
  }))
}

function buildExcerpt(text: string, terms: string[], maxLength = 240): string {
  const cleaned = normalizeInline(text)
  if (!cleaned) return ''
  if (cleaned.length <= maxLength) return cleaned

  const lowered = cleaned.toLowerCase()
  let anchor = -1

  for (const term of terms) {
    const normalized = term.trim()
    if (!normalized) continue
    const termIndex = lowered.indexOf(normalized.toLowerCase())
    if (termIndex >= 0) {
      anchor = termIndex
      break
    }
  }

  if (anchor < 0) {
    return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
  }

  const start = Math.max(0, anchor - Math.floor(maxLength * 0.32))
  const end = Math.min(cleaned.length, start + maxLength)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < cleaned.length ? '…' : ''
  return `${prefix}${cleaned.slice(start, end).trim()}${suffix}`
}

function stripLeadingFrontmatter(text: string): string {
  let current = text.trimStart()
  for (let i = 0; i < 2; i += 1) {
    if (!current.startsWith('---')) break
    current = current.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, '').trimStart()
  }
  const lines = current.split(/\r?\n/)
  while (lines.length > 0) {
    const line = lines[0].trim()
    if (
      !line ||
      line === '---' ||
      /^#\s+/u.test(line) ||
      /^(?:title|id|folder|modified|created|source|slug|tags|importance|confidence|source_drawers|updated)\s*:/iu.test(line) ||
      /^【?只言片语/u.test(line)
    ) {
      lines.shift()
      continue
    }
    break
  }
  return lines.join('\n').trimStart()
}

function sanitizeModelAnswer(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>\s*/giu, '')
    .replace(/^<think>[\s\S]*$/giu, '')
    .trim()
}

function ensureNonEmptyAnswer(answer: string, fallback: string): string {
  const normalized = sanitizeModelAnswer(answer)
  return normalized || fallback.trim()
}

function extractDrawerIds(metadata: Record<string, unknown>): string[] {
  const raw = metadata.drawerIds
  if (!Array.isArray(raw)) return []
  return raw.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
}

async function filterPageMatchesByFolderScope<T extends {
  sourceIds: string[]
  folderPath: string
  metadata: Record<string, unknown>
}>(
  rows: T[],
  folderPath?: string | null,
): Promise<T[]> {
  if (!folderPath || rows.length === 0) return rows
  const sourceIds = uniqueStrings(rows.flatMap(row => row.sourceIds))
  const sourceFolderMap = sourceIds.length > 0
    ? new Map((await loadKnowledgeSourceScopeEntries(sourceIds)).map(entry => [entry.id, entry.folderPath]))
    : new Map<string, string>()
  return rows.filter(row => pageMatchesFolderScope(row, folderPath, sourceFolderMap))
}

function extractCitationLabels(answer: string): string[] {
  return uniqueStrings(
    (answer.match(/\[(?:P|S|D|C)\d+\]/g) || []).map(token => token.slice(1, -1))
  )
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function buildEvidenceFallback(
  question: string,
  citations: QueryCitation[],
  options: {
    intro?: string
    detail?: string
  } = {},
): string {
  const topCitations = citations.slice(0, 4)
  const lines = [
    '## 结论',
    options.intro || `这次已经围绕“${question}”检索到一批相关证据，但模型没有稳定产出完整正文；先把最相关的证据入口直接给你。`,
    '',
    '## 关键证据入口',
  ]

  if (topCitations.length > 0) {
    for (const citation of topCitations) {
      lines.push(`- [${citation.label}] ${citation.title}：${truncate(citation.excerpt, 88)}`)
    }
  } else {
    lines.push('- 当前没有足够证据可供展开。')
  }

  lines.push('', '## 说明')
  lines.push(options.detail || '- 下方完整来源链已经保留，你可以直接点开对应页面继续追查。')
  return lines.join('\n')
}

function estimateConfidence(params: {
  pageHits: number
  sourceHits: number
  drawerHits: number
  chunkHits: number
  strongestPageConfidence: number
}): number {
  let score = 0.32
  if (params.pageHits > 0) score += 0.12
  if (params.sourceHits > 0) score += 0.14
  if (params.drawerHits > 0) score += 0.08
  if (params.chunkHits > 0) score += 0.12
  if (params.pageHits > 1) score += 0.06
  if (params.sourceHits > 1) score += 0.05
  if (params.chunkHits > 2) score += 0.05
  score += Math.min(0.16, params.strongestPageConfidence * 0.16)
  return Math.min(0.94, Number(score.toFixed(2)))
}

async function loadSelfAliases(): Promise<string[]> {
  try {
    const bossProfile = await getBossProfileAsync()
    const explicitAliases = (bossProfile.self_entity_aliases || bossProfile.selfAliases || '')
      .split(/[，,\s]+/)
      .map(alias => alias.trim())
      .filter(Boolean)
    const bossName = (bossProfile.name || '').trim()
    return [...new Set([
      ...explicitAliases,
      bossName && bossName !== 'Boss' ? bossName : '',
    ].filter(Boolean))]
  } catch {
    return []
  }
}

async function loadChunkEvidence(chunkIds: string[], folderPath?: string | null): Promise<ChunkEvidenceRow[]> {
  const uniqueIds = uniqueStrings(chunkIds)
  if (uniqueIds.length === 0) return []

  const placeholders = uniqueIds.map(() => '?').join(', ')
  const folderCondition = buildFolderScopeCondition('c.folder_path', folderPath)
  const params: unknown[] = [...uniqueIds]
  let sql = `SELECT
       c.id,
       c.page_id,
       c.source_id,
       c.drawer_id,
       c.chunk_index,
       c.content,
       c.header_breadcrumb,
       p.title AS page_title,
       s.title AS source_title,
       s.source_type,
       s.url,
       s.file_path,
       d.title AS drawer_title
     FROM wiki_chunks c
     LEFT JOIN wiki_pages p ON p.id = c.page_id
     LEFT JOIN wiki_sources s ON s.id = c.source_id
     LEFT JOIN mempalace_drawers d ON d.id = c.drawer_id
     WHERE c.id IN (${placeholders})`
  if (folderCondition) {
    sql += ` AND ${folderCondition.clause}`
    params.push(...folderCondition.params)
  }
  const rows = await query<{
    id: string
    page_id: string
    source_id: string
    drawer_id: string
    chunk_index: number
    content: string
    header_breadcrumb: string
    page_title: string
    source_title: string
    source_type: string
    url: string
    file_path: string
    drawer_title: string
  }>(sql, params)

  const byId = new Map(rows.map(row => [row.id, row]))
  return uniqueIds
    .map(id => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map(row => ({
      id: row.id,
      pageId: row.page_id || '',
      sourceId: row.source_id || '',
      drawerId: row.drawer_id || '',
      chunkIndex: row.chunk_index || 0,
      content: row.content || '',
      headerBreadcrumb: row.header_breadcrumb || '',
      pageTitle: row.page_title || '',
      sourceTitle: row.source_title || '',
      sourceType: row.source_type || '',
      url: row.url || '',
      filePath: row.file_path || '',
      drawerTitle: row.drawer_title || '',
    }))
}

function buildEvidenceContext(question: string, citations: QueryCitation[], terms: string[], focusEntities: string[] = []): string {
  const grouped = {
    pages: citations.filter(citation => citation.kind === 'page'),
    sources: citations.filter(citation => citation.kind === 'source'),
    drawers: citations.filter(citation => citation.kind === 'drawer'),
    chunks: citations.filter(citation => citation.kind === 'chunk'),
  }

  const lines: string[] = [
    `问题：${question}`,
    `检索关键词：${terms.join(' / ') || '（未提取到额外关键词）'}`,
  ]

  if (focusEntities.length >= 2) {
    const coOccurrenceCount = citations.filter(citation => (
      countMatchedEntities(`${citation.title}\n${citation.excerpt}`, focusEntities) >= focusEntities.length
    )).length
    lines.push(`重点实体：${focusEntities.join(' / ')}`)
    lines.push(`同时提到全部重点实体的证据条数：${coOccurrenceCount}`)
  }

  if (grouped.pages.length > 0) {
    lines.push('', '## 页面证据')
    for (const citation of grouped.pages) {
      lines.push(`[${citation.label}] ${citation.title}`)
      if (citation.meta.length > 0) lines.push(`元信息：${citation.meta.join(' · ')}`)
      lines.push(`摘录：${citation.excerpt}`)
    }
  }

  if (grouped.sources.length > 0) {
    lines.push('', '## 原始来源')
    for (const citation of grouped.sources) {
      lines.push(`[${citation.label}] ${citation.title}`)
      if (citation.meta.length > 0) lines.push(`元信息：${citation.meta.join(' · ')}`)
      lines.push(`摘录：${citation.excerpt}`)
    }
  }

  if (grouped.drawers.length > 0) {
    lines.push('', '## 生肉抽屉')
    for (const citation of grouped.drawers) {
      lines.push(`[${citation.label}] ${citation.title}`)
      if (citation.meta.length > 0) lines.push(`元信息：${citation.meta.join(' · ')}`)
      lines.push(`摘录：${citation.excerpt}`)
    }
  }

  if (grouped.chunks.length > 0) {
    lines.push('', '## 关键片段')
    for (const citation of grouped.chunks) {
      lines.push(`[${citation.label}] ${citation.title}`)
      if (citation.meta.length > 0) lines.push(`元信息：${citation.meta.join(' · ')}`)
      lines.push(`摘录：${citation.excerpt}`)
    }
  }

  return lines.join('\n')
}

function buildQueryDirectives(analysis: ReturnType<typeof analyzeKnowledgeQuery>): string[] {
  const directives: string[] = []
  if (analysis.wantsExhaustiveCoverage) {
    directives.push('用户期待的是尽量完整、系统、覆盖面更大的回答，不要只抓一两条命中就仓促下结论。')
  }
  if (analysis.wantsCanonicalAnswer) {
    directives.push('用户明显在意口径与准确性；回答前先区分页面数、来源数、去重口径、估算口径。')
  }
  if (analysis.wantsClassification) {
    directives.push('用户想要分类或归纳；回答时要先说明分类维度，再给分类结果。')
  }
  return directives
}

function extractDateStamp(text: string): string {
  const match = text.match(/(19|20)\d{6}/)
  if (!match) return ''
  const raw = match[0]
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

function extractSeasonNumber(text: string): number | null {
  const match = text.match(/第(十四|十三|十二|十一|十|九|八|七|六|五|四|三|二|一|\d+)季/u)
  if (!match) return null
  const raw = match[1]
  if (SEASON_NUMBER_MAP[raw]) return SEASON_NUMBER_MAP[raw]
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function classifyCollectionStructure(text: string): '季正文' | '番外/特刊' | '未标季/散篇' | '元叙事/主题' | '阶段节点' {
  if (/(番外|特刊|特别篇)/u.test(text)) return '番外/特刊'
  if (/(初衷|主题)/u.test(text)) return '元叙事/主题'
  if (/(停更|完结|打气)/u.test(text)) return '阶段节点'
  if (extractSeasonNumber(text) !== null) return '季正文'
  return '未标季/散篇'
}

function scoreTheme(text: string, rule: ThemeRule): number {
  let score = 0
  for (const keyword of rule.keywords) {
    score += countOccurrences(text, keyword)
  }
  return score
}

function classifyTheme(params: { title: string; summary: string; content: string }): { theme: string; score: number } {
  const title = params.title || ''
  const summary = params.summary || ''
  const content = (params.content || '').slice(0, 8000)

  let bestTheme = '未归类'
  let bestScore = 0

  for (const rule of THEME_RULES) {
    const score =
      scoreTheme(title, rule) * 6 +
      scoreTheme(summary, rule) * 3 +
      scoreTheme(content, rule)
    if (score > bestScore) {
      bestScore = score
      bestTheme = rule.name
    }
  }

  return { theme: bestScore > 0 ? bestTheme : '未归类', score: bestScore }
}

function formatSeasonBreakdown(seasonCounts: Map<number, number>): string {
  return [...seasonCounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([season, count]) => `第${season}季 ${count}`)
    .join('，')
}

function buildPageCitation(row: CorpusCollectionPageRow, label: string, terms: string[]): QueryCitation {
  const readableSummary = stripLeadingFrontmatter(row.summary || '')
  const readableContent = stripLeadingFrontmatter(row.content)
  const preferredText = readableSummary && !/^title\s*:/iu.test(readableSummary)
    ? readableSummary
    : readableContent
  return {
    id: row.id,
    label,
    kind: 'page',
    title: row.title,
    excerpt: buildExcerpt(preferredText, terms, 240),
    meta: uniqueStrings([
      extractDateStamp(row.title),
      extractSeasonNumber(row.title) !== null ? `第${extractSeasonNumber(row.title)}季` : '',
      row.updated_at || '',
    ]),
    pageId: row.id,
  }
}

function buildSourceCitation(row: CorpusCollectionSourceRow, label: string, terms: string[]): QueryCitation {
  return {
    id: row.id,
    label,
    kind: 'source',
    title: row.title || '未命名来源',
    excerpt: buildExcerpt(row.content, terms, 260),
    meta: uniqueStrings([
      row.source_type || '',
      extractDateStamp(row.file_path || row.title),
      row.file_path ? truncate(row.file_path, 52) : '',
    ]),
    sourceId: row.id,
    sourceType: row.source_type,
    filePath: row.file_path,
    url: row.url,
  }
}

async function analyzeCorpusCollection(
  intent: CorpusCountIntent,
  folderPath?: string | null,
): Promise<QueryResult> {
  const { pages: pageRows, sources: sourceRows } = await loadCorpusCollectionRows(intent.term, folderPath)

  if (pageRows.length === 0 && sourceRows.length === 0) {
    return analyzeCorpusTerm(intent.term, folderPath)
  }

  const structureCounts = new Map<string, number>()
  const seasonCounts = new Map<number, number>()
  const themeCounts = new Map<string, number>()
  const themeRepresentatives = new Map<string, { row: CorpusCollectionPageRow; score: number }>()

  for (const row of pageRows) {
    const structure = classifyCollectionStructure(row.title)
    structureCounts.set(structure, (structureCounts.get(structure) || 0) + 1)

    const season = extractSeasonNumber(row.title)
    if (season !== null) {
      seasonCounts.set(season, (seasonCounts.get(season) || 0) + 1)
    }

    const theme = classifyTheme({ title: row.title, summary: row.summary, content: row.content })
    themeCounts.set(theme.theme, (themeCounts.get(theme.theme) || 0) + 1)
    const current = themeRepresentatives.get(theme.theme)
    if (!current || theme.score > current.score) {
      themeRepresentatives.set(theme.theme, { row, score: theme.score })
    }
  }

  const earliestPage = pageRows[0]
  const latestPage = pageRows[pageRows.length - 1]
  const metaPage = pageRows.find(row => /(初衷|主题)/u.test(row.title))
  const creativeRep = themeRepresentatives.get('创作与表达')?.row || metaPage
  const philosophyRep = themeRepresentatives.get('哲思与世界观')?.row
  const actionRep = themeRepresentatives.get('自我与行动')?.row
  const emotionRep = themeRepresentatives.get('情绪与关系')?.row
  const socialRep = themeRepresentatives.get('社会与现实观察')?.row
  const sourceRep = sourceRows[0]

  const pageCitationSeed = uniqueStrings([
    earliestPage?.id,
    latestPage?.id,
    metaPage?.id,
    creativeRep?.id,
    philosophyRep?.id,
    actionRep?.id,
    emotionRep?.id,
    socialRep?.id,
  ])
  const pageCitationRows = pageCitationSeed
    .map(id => pageRows.find(row => row.id === id))
    .filter((row): row is CorpusCollectionPageRow => Boolean(row))
  const pageCitations = pageCitationRows.map((row, index) => buildPageCitation(row, `P${index + 1}`, [intent.term]))
  const sourceCitations = sourceRep ? [buildSourceCitation(sourceRep, 'S1', [intent.term])] : []
  const citations = [...pageCitations, ...sourceCitations]
  const citationById = new Map(citations.map(citation => [citation.id, citation]))

  const pageRef = (row?: CorpusCollectionPageRow) => {
    if (!row) return ''
    const citation = citationById.get(row.id)
    return citation ? `[${citation.label}]` : ''
  }
  const sourceRef = (row?: CorpusCollectionSourceRow) => {
    if (!row) return ''
    const citation = citationById.get(row.id)
    return citation ? `[${citation.label}]` : ''
  }

  const canonicalCount = pageRows.length
  const rawSourceCount = sourceRows.length
  const duplicateDelta = Math.max(0, rawSourceCount - canonicalCount)
  const dateStart = extractDateStamp(earliestPage?.title || sourceRows[0]?.file_path || '')
  const dateEnd = extractDateStamp(latestPage?.title || sourceRows[sourceRows.length - 1]?.file_path || '')

  const structureOrder = ['季正文', '番外/特刊', '未标季/散篇', '元叙事/主题', '阶段节点']
  const structureLines = structureOrder
    .filter(key => (structureCounts.get(key) || 0) > 0)
    .map(key => `- ${key}：${structureCounts.get(key) || 0} 篇`)

  const themeOrder = ['哲思与世界观', '自我与行动', '情绪与关系', '社会与现实观察', '创作与表达', '娱乐与审美', '未归类']
  const themeLines = themeOrder
    .filter(theme => (themeCounts.get(theme) || 0) > 0)
    .map(theme => {
      const rep =
        theme === '哲思与世界观' ? philosophyRep :
        theme === '自我与行动' ? actionRep :
        theme === '情绪与关系' ? emotionRep :
        theme === '社会与现实观察' ? socialRep :
        theme === '创作与表达' ? creativeRep :
        undefined
      const suffix = rep ? ` ${pageRef(rep)}` : ''
      return `- ${theme}：${themeCounts.get(theme) || 0} 篇${suffix}`.trimEnd()
    })

  const lines = [
    '## 结论',
    `按当前知识库的 Wiki 页面去重统计，\`${intent.term}\` 共有 ${canonicalCount} 篇独立条目，不是 7 篇；对应原始来源记录共有 ${rawSourceCount} 条。`,
    duplicateDelta > 0
      ? `也就是说，原始来源层比页面层多出 ${duplicateDelta} 条历史副本或变体记录；问“你一共写了多少篇”时，更应该以 ${canonicalCount} 个 Wiki 页面为准。${sourceRef(sourceRep)}`
      : '页面层和原始来源层当前没有明显的重复差额。',
    dateStart && dateEnd
      ? `时间跨度从 ${dateStart} 到 ${dateEnd}。${pageRef(earliestPage)}${pageRef(latestPage)}`
      : '',
    '',
    '## 结构归类',
    ...structureLines,
    seasonCounts.size > 0 ? `- 季度分布：${formatSeasonBreakdown(seasonCounts)}` : '',
    '',
    '## 内容粗分',
    ...themeLines,
    creativeRep || metaPage ? `- 如果你想保留“写作元叙事/初衷”这个单独门类，可以把它从“创作与表达”里再拆出来。${pageRef(creativeRep || metaPage)}` : '',
    '',
    '## 不确定点',
    '- 这里的“内容粗分”是基于标题、摘要和正文关键词做的主题聚类，不是你当年的人为官方目录。',
    '- 如果你要的是最终版目录，最稳妥的做法是把这些条目再人工校一遍，形成“按季 / 按年份 / 按主题”三套正式索引。',
  ].filter(Boolean)

  const answer = lines.join('\n')
  return {
    answer,
    sourcePageIds: pageRows.map(row => row.id),
    confidence: 0.98,
    fromWiki: true,
    answerMode: 'count',
    citations,
    usedCitationIds: extractCitationLabels(answer),
    evidence: {
      queryType: 'count',
      term: intent.term,
      pageHits: canonicalCount,
      sourceHits: rawSourceCount,
      topPageTitles: pageRows.slice(0, 5).map(row => row.title),
      topSourceTitles: sourceRows.slice(0, 5).map(row => row.title || '未命名来源'),
    },
  }
}

async function loadCorpusCollectionRows(term: string, folderPath?: string | null): Promise<{
  pages: CorpusCollectionPageRow[]
  sources: CorpusCollectionSourceRow[]
}> {
  const like = `%${term}%`
  const pageFolderCondition = buildFolderScopeCondition('folder_path', folderPath, { includeLegacyBlank: true })
  const sourceFolderCondition = buildFolderScopeCondition('folder_path', folderPath)
  const [pages, sources] = await Promise.all([
    query<CorpusCollectionPageRow & { source_ids: string; metadata_json: string; folder_path: string }>(
      `SELECT id, title, summary, content, created_at, updated_at, source_ids, metadata_json, folder_path
       FROM wiki_pages
       WHERE is_index = 0 AND is_log = 0 AND (title LIKE ? OR slug LIKE ?)
       ${pageFolderCondition ? `AND ${pageFolderCondition.clause}` : ''}
       ORDER BY title`,
      pageFolderCondition ? [like, like, ...pageFolderCondition.params] : [like, like],
    ),
    query<CorpusCollectionSourceRow>(
      `SELECT id, title, content, source_type, url, file_path, created_at, updated_at
       FROM wiki_sources
       WHERE (title LIKE ? OR file_path LIKE ?)
       ${sourceFolderCondition ? `AND ${sourceFolderCondition.clause}` : ''}
       ORDER BY file_path, title`,
      sourceFolderCondition ? [like, like, ...sourceFolderCondition.params] : [like, like],
    ),
  ])
  const filteredPages = await filterPageMatchesByFolderScope(
    pages.map(row => ({
      ...row,
      sourceIds: JSON.parse(row.source_ids || '[]'),
      metadata: JSON.parse(row.metadata_json || '{}'),
      folderPath: row.folder_path || '',
      linkedPageIds: [],
      tags: [],
      frontmatter: {},
      backlinkCount: 0,
      importance: 0,
      confidence: 0,
      isIndex: false,
      isLog: false,
      templateId: '',
      version: 1,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
      summary: row.summary,
      content: row.content,
      title: row.title,
      slug: '',
      id: row.id,
      score: 0,
      category: '',
    })),
    folderPath,
  )

  return {
    pages: filteredPages.map(row => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      content: row.content,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    })),
    sources,
  }
}

function expandAspectTerms(aspectTerms: string[]): string[] {
  const expanded = [...aspectTerms]
  for (const term of aspectTerms) {
    if (/未来|长远|后面|以后/u.test(term)) expanded.push('未来', '方向', '法则', '适应', '能力')
    if (/现世|现实|当下|此刻/u.test(term)) expanded.push('现世', '现实', '当下', '环境')
    if (/启发|启示|洞见|思考/u.test(term)) expanded.push('启发', '意义', '认知', '思考')
    if (/指引|指导|方向|路径/u.test(term)) expanded.push('指引', '方向', '行动', '选择', '能力')
  }
  return uniqueStrings(expanded)
}

function buildCurationContext(question: string, collectionTerm: string, aspectTerms: string[], citations: QueryCitation[]): string {
  const lines = [
    `问题：${question}`,
    `作品集合：${collectionTerm}`,
    `评判维度：${aspectTerms.join(' / ') || '整体启发性'}`,
    '',
    '## 候选条目',
  ]

  for (const citation of citations) {
    lines.push(`[${citation.label}] ${citation.title}`)
    if (citation.meta.length > 0) lines.push(`元信息：${citation.meta.join(' · ')}`)
    lines.push(`摘录：${citation.excerpt}`)
  }

  return lines.join('\n')
}

async function analyzeCorpusCuration(
  question: string,
  collectionIntent: NonNullable<ReturnType<typeof analyzeKnowledgeQuery>['collectionIntent']>,
  llmConfig: LLMConfig,
  callbacks?: StreamCallbacks,
  agentPerspective?: string,
  folderPath?: string | null,
): Promise<QueryResult> {
  const { pages } = await loadCorpusCollectionRows(collectionIntent.term, folderPath)
  if (pages.length === 0) {
    return {
      answer: '当前知识库里没有找到这个作品集合的可用条目，所以还没法做集合内推荐。',
      sourcePageIds: [],
      confidence: 0,
      fromWiki: false,
      answerMode: 'curation',
      citations: [],
      evidence: {
        queryType: 'synthesis',
        term: collectionIntent.term,
        pageHits: 0,
        sourceHits: 0,
        drawerHits: 0,
        chunkHits: 0,
      },
    }
  }

  const aspectTerms = collectionIntent.aspectTerms.length > 0
    ? collectionIntent.aspectTerms
    : ['启发', '指引']
  const expandedAspectTerms = expandAspectTerms(aspectTerms)
  const preferredThemes = new Set<string>()
  if (expandedAspectTerms.some(term => /未来|方向|法则|意义|思考|认知/u.test(term))) preferredThemes.add('哲思与世界观')
  if (expandedAspectTerms.some(term => /现世|现实|指引|行动|选择|能力/u.test(term))) preferredThemes.add('自我与行动')
  if (expandedAspectTerms.some(term => /现实|现世/u.test(term))) preferredThemes.add('社会与现实观察')

  const scoredPages = pages
    .map(row => {
      const theme = classifyTheme({ title: row.title, summary: row.summary, content: row.content })
      const titleText = row.title || ''
      const summaryText = row.summary || ''
      const contentText = row.content || ''
      const aspectScore = expandedAspectTerms.reduce((sum, term) => (
        sum +
        countOccurrences(titleText, term) * 8 +
        countOccurrences(summaryText, term) * 4 +
        countOccurrences(contentText, term)
      ), 0)
      const themeBoost = preferredThemes.has(theme.theme)
        ? (theme.theme === '哲思与世界观' ? 14 : 10)
        : 0
      const structureBoost = /主题|初衷|法则|能力|世界|意义/u.test(row.title) ? 6 : 0
      return {
        row,
        theme: theme.theme,
        score: aspectScore + themeBoost + structureBoost,
      }
    })
    .sort((a, b) => b.score - a.score || b.row.updated_at.localeCompare(a.row.updated_at))

  const candidateRows = scoredPages.slice(0, 8).map(item => item.row)
  const citationTerms = [collectionIntent.term, ...expandedAspectTerms]
  const citations = candidateRows.map((row, index) => {
    const baseCitation = buildPageCitation(row, `P${index + 1}`, citationTerms)
    const scored = scoredPages.find(item => item.row.id === row.id)
    return {
      ...baseCitation,
      meta: uniqueStrings([
        ...(baseCitation.meta || []),
        scored ? `主题 ${scored.theme}` : '',
      ]),
    }
  })
  const context = buildCurationContext(question, collectionIntent.term, aspectTerms, citations)
  const userMessage = `以下是同一作品集合里经过筛选的候选条目。\n\n${context}\n\n请基于这些候选做集合内推荐。`

  try {
    const cognitivePrompt = renderCognitivePrompt(loadCognitiveProfile())
    const promptLayers = [CURATION_SYSTEM_PROMPT]
    if (cognitivePrompt) promptLayers.push(cognitivePrompt)
    if (agentPerspective) promptLayers.push(`**你的角色设定：**\n${agentPerspective}`)
    const systemPrompt = promptLayers.join('\n\n---\n\n')

    const rawAnswer = callbacks?.onChunk
      ? await chatCompletionStream(
          llmConfig,
          [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
          callbacks,
          0.4,
          4096,
        )
      : await chatCompletion(
          llmConfig,
          [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
          0.4,
          4096,
        )
    const answer = ensureNonEmptyAnswer(
      rawAnswer,
      buildEvidenceFallback(question, citations, {
        intro: `已经从“${collectionIntent.term}”里挑出一批最相关候选，但模型没有稳定产出完整策展文案；先把最值得优先看的条目给你。`,
        detail: '- 这些候选仍按当前问题的评判维度排过序，你可以先从上面的条目开始看。',
      }),
    )

    const pageIds = citations.map(citation => citation.pageId).filter((value): value is string => Boolean(value))
    await appendToLog('query', 'page', pageIds.join(','), `知识库策展查询: ${question.slice(0, 80)}`, {
      queryText: collectionIntent.term,
      aspectTerms,
      pageIds,
    })

    return {
      answer,
      sourcePageIds: pageIds,
      confidence: 0.88,
      fromWiki: false,
      answerMode: 'curation',
      citations,
      usedCitationIds: extractCitationLabels(answer),
      evidence: {
        queryType: 'synthesis',
        term: collectionIntent.term,
        pageHits: citations.length,
        sourceHits: 0,
        drawerHits: 0,
        chunkHits: 0,
        topPageTitles: citations.map(citation => citation.title),
        topSourceTitles: [],
      },
    }
  } catch (err) {
    return {
      answer: `集合策展失败: ${String(err)}`,
      sourcePageIds: citations.map(citation => citation.pageId).filter((value): value is string => Boolean(value)),
      confidence: 0,
      fromWiki: false,
      answerMode: 'curation',
      citations,
      evidence: {
        queryType: 'synthesis',
        term: collectionIntent.term,
        pageHits: citations.length,
        sourceHits: 0,
        drawerHits: 0,
        chunkHits: 0,
        topPageTitles: citations.map(citation => citation.title),
        topSourceTitles: [],
      },
    }
  }
}

async function loadPersonalDiscoveryCandidateRows(
  question: string,
  searchTerms: string[],
  folderPath?: string | null,
): Promise<SearchPageMatch[]> {
  const candidateQueries = uniqueStrings([
    question,
    ...searchTerms,
  ]).filter(isUsefulInvestigationQuery).slice(0, 8)

  if (candidateQueries.length === 0) return []

  const resultSets = await Promise.all(
    candidateQueries.map(queryText => searchPages(queryText, 18, folderPath).catch(() => [] as SearchPageMatch[]))
  )

  return mergeInvestigativeResults(resultSets, 220)
}

function describePersonalDiscoverySignal(
  intent: PersonalDiscoveryIntent,
  signal: PersonalDiscoveryEvidenceScore,
): string {
  if (intent.targetType === 'person') {
    return signal.namedTargets.length > 0
      ? `${signal.namedTargets.join(' / ')} · 强信号 ${signal.explicitSignalHits} · 相关度 ${Math.round(signal.score)}`
      : `${signal.isImaginative ? '文学化/投射线索' : '未具名对象'} · 强信号 ${signal.explicitSignalHits} · 相关度 ${Math.round(signal.score)}`
  }

  return `强信号 ${signal.explicitSignalHits} · 第一人称 ${signal.firstPersonHits} · 相关度 ${Math.round(signal.score)}`
}

function buildPersonalDiscoveryCitation(
  intent: PersonalDiscoveryIntent,
  row: SearchPageMatch,
  label: string,
  signal: PersonalDiscoveryEvidenceScore,
): QueryCitation {
  const spec = getPersonalDiscoverySpec(intent.dimension)
  const signalMeta = intent.targetType === 'person'
    ? signal.namedTargets.length > 0
      ? `对象 ${signal.namedTargets.join(' / ')}`
      : signal.isImaginative
        ? '文学化/投射线索'
        : '未具名对象线索'
    : `${spec.label}线索`

  return {
    id: row.id,
    label,
    kind: 'page',
    title: row.title,
    excerpt: buildExcerpt(`${row.title}\n${row.summary || ''}\n${row.content || ''}`, [
      ...spec.searchTerms,
      ...signal.namedTargets,
    ], 280),
    meta: uniqueStrings([
      signalMeta,
      signal.explicitSignalHits > 0 ? '明确自述信号' : '',
      signal.firstPersonHits > 0 ? '第一人称记录' : '',
      row.updatedAt || '',
    ]),
    pageId: row.id,
    confidence: row.confidence,
    score: signal.score,
  }
}

function buildPersonalDiscoveryContext(
  question: string,
  intent: PersonalDiscoveryIntent,
  candidates: Array<{
    row: SearchPageMatch
    signal: PersonalDiscoveryEvidenceScore
    citation: QueryCitation
  }>,
  rejected: Array<{
    row: SearchPageMatch
    signal: PersonalDiscoveryEvidenceScore
  }>,
): string {
  const spec = getPersonalDiscoverySpec(intent.dimension)
  const taskLine = intent.targetType === 'person'
    ? `任务：识别“${spec.label}”相关的人物对象，并按证据强弱分层。`
    : `任务：识别“${spec.label}”相关的稳定自我线索，并按证据强弱分层。`
  const lines = [
    `问题：${question}`,
    taskLine,
    '',
    '## 强相关候选',
  ]

  for (const item of candidates) {
    lines.push(`[${item.citation.label}] ${item.row.title}`)
    lines.push(`线索：${describePersonalDiscoverySignal(intent, item.signal)}`)
    if (item.citation.meta.length > 0) lines.push(`元信息：${item.citation.meta.join(' · ')}`)
    lines.push(`摘录：${item.citation.excerpt}`)
  }

  if (rejected.length > 0) {
    lines.push('', '## 不宜直接算入的泛论或弱相关候选')
    for (const item of rejected) {
      lines.push(`- ${item.row.title}`)
    }
  }

  return lines.join('\n')
}

function summarizeDiscoveryObservation(row: SearchPageMatch): string {
  const preferred = stripLeadingFrontmatter(row.summary || row.content || '')
  const sentence = preferred.split(/[。！？\n]/u).find(part => normalizeInline(part).length >= 8) || preferred
  return truncate(sentence || row.title, 56)
}

function buildPersonalDiscoveryFallback(
  intent: PersonalDiscoveryIntent,
  candidates: Array<{
    row: SearchPageMatch
    signal: PersonalDiscoveryEvidenceScore
    citation: QueryCitation
  }>,
): string {
  const spec = getPersonalDiscoverySpec(intent.dimension)

  if (intent.targetType === 'person') {
    const named = uniqueStrings(candidates.flatMap(item => item.signal.namedTargets))
    const lines = [
      '## 结论',
      named.length > 0
        ? `当前较明确能看出来的对象至少包括：${named.join('、')}；另外还存在若干未具名但带有明显情感指向的对象。`
        : `当前能确认的是：知识库里确实有多条明显带有${spec.label}倾向的记录，但不少对象没有实名。`,
      '',
      '## 高置信对象',
    ]

    if (named.length > 0) {
      for (const name of named.slice(0, 4)) {
        const refs = candidates
          .filter(item => item.signal.namedTargets.includes(name))
          .map(item => `[${item.citation.label}]`)
          .join('')
        lines.push(`- ${name}：至少有一条记录把情感指向落到了这个名字上。${refs}`)
      }
    } else {
      lines.push('- 暂无可直接落实名字的高置信对象。')
    }

    const unnamedRefs = candidates
      .filter(item => item.signal.namedTargets.length === 0)
      .map(item => `[${item.citation.label}]`)
      .slice(0, 3)
      .join('')

    lines.push('', '## 可能对象或未具名对象')
    lines.push(unnamedRefs
      ? `- 未具名对象：有多条记录出现明显的第一人称情感表达，但没有直接写出对方实名。${unnamedRefs}`
      : '- 当前没有足够证据列出更多未具名对象。')
    lines.push('', '## 不应直接算入')
    lines.push('- 那些只是在抽象讨论关系、情感或对方的泛论页面，不应直接当作对象名单。')
    lines.push('', '## 不确定点')
    lines.push('- 有些记录更像文学化投射、角色书写或匿名书信，因此不宜直接和现实实名对象完全合并。')
    return lines.join('\n')
  }

  const highConfidence = candidates.slice(0, 4)
  const possible = candidates.slice(4, 7)
  const lines = [
    '## 结论',
    highConfidence.length > 0
      ? `综合当前证据，你的“${spec.label}”主要集中在以下几条稳定线索上。`
      : `当前知识库里只有少量与“${spec.label}”相关的第一人称线索，还不足以形成稳定判断。`,
    '',
    '## 高置信线索',
  ]

  if (highConfidence.length > 0) {
    for (const item of highConfidence) {
      lines.push(`- ${summarizeDiscoveryObservation(item.row)}[${item.citation.label}]`)
    }
  } else {
    lines.push('- 暂无足够稳定的高置信线索。')
  }

  lines.push('', '## 可能线索')
  if (possible.length > 0) {
    for (const item of possible) {
      lines.push(`- ${summarizeDiscoveryObservation(item.row)}[${item.citation.label}]`)
    }
  } else {
    lines.push('- 当前没有更多值得单列的弱线索。')
  }

  lines.push('', '## 不应直接算入')
  lines.push('- 只是在讲普遍道理、书摘或面向他人的建议页面，不应直接当作你的本人画像。')
  lines.push('', '## 不确定点')
  lines.push('- 这些判断依赖现有私人记录的覆盖范围；如果很多关键阶段没有写进知识库，画像会偏向已记录部分。')
  return lines.join('\n')
}

async function analyzePersonalDiscoveryQuery(
  question: string,
  intent: PersonalDiscoveryIntent,
  searchTerms: string[],
  llmConfig: LLMConfig,
  callbacks?: StreamCallbacks,
  agentPerspective?: string,
  folderPath?: string | null,
): Promise<QueryResult> {
  const selfAliases = await loadSelfAliases()
  const rows = await loadPersonalDiscoveryCandidateRows(question, searchTerms, folderPath)
  const ranked = rankPersonalDiscoveryItems(rows, intent.dimension, {
    getTitle: row => row.title,
    getText: row => `${row.summary}\n${row.content}`,
    getSearchScore: row => row.importance + row.confidence * 10 + row.score,
    selfAliases,
  })
  const spec = getPersonalDiscoverySpec(intent.dimension)

  if (ranked.length === 0) {
    return {
      answer: intent.targetType === 'person'
        ? `当前知识库里没有足够直接的“${spec.label}”记录，暂时还识别不出明确的对象。`
        : `当前知识库里没有足够直接的“${spec.label}”线索，暂时还形不成稳定画像。`,
      sourcePageIds: [],
      confidence: 0.12,
      fromWiki: false,
      answerMode: 'synthesis',
      citations: [],
      evidence: {
        queryType: 'synthesis',
        term: `${intent.dimension}_discovery`,
        pageHits: 0,
        sourceHits: 0,
        drawerHits: 0,
        chunkHits: 0,
      },
    }
  }

  const topCandidates = ranked.slice(0, 10).map((row, index) => {
    const signal = row.discoveryScore
    return {
      row,
      signal,
      citation: buildPersonalDiscoveryCitation(intent, row, `P${index + 1}`, signal),
    }
  })

  const rejected = rows
    .map(row => ({
      row,
      signal: scorePersonalDiscoveryEvidence(intent.dimension, row.title, `${row.summary}\n${row.content}`, selfAliases),
    }))
    .filter(item => item.signal.isGenericAdvice)
    .slice(0, 4)

  const citations = topCandidates.map(item => item.citation)
  const context = buildPersonalDiscoveryContext(question, intent, topCandidates, rejected)
  const userMessage = `以下是从知识库中筛出来的“${spec.label}候选证据”。\n\n${context}\n\n请基于这些证据做侦探式归纳，不要把泛理论或无关页面错当成本人线索。`

  try {
    const cognitivePrompt = renderCognitivePrompt(loadCognitiveProfile())
    const promptLayers = [buildPersonalDiscoverySystemPrompt(intent)]
    if (cognitivePrompt) promptLayers.push(cognitivePrompt)
    if (agentPerspective) promptLayers.push(`**你的角色设定：**\n${agentPerspective}`)
    const systemPrompt = promptLayers.join('\n\n---\n\n')

    const rawAnswer = callbacks?.onChunk
      ? await chatCompletionStream(
          llmConfig,
          [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
          callbacks,
          0.3,
          4096,
        )
      : await chatCompletion(
          llmConfig,
          [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
          0.3,
          4096,
        )

    const answer = ensureNonEmptyAnswer(
      rawAnswer,
      buildPersonalDiscoveryFallback(intent, topCandidates),
    )
    const pageIds = citations.map(citation => citation.pageId).filter((value): value is string => Boolean(value))

    await appendToLog('query', 'page', pageIds.join(','), `知识库自我追索查询: ${question.slice(0, 80)}`, {
      queryText: question,
      pageIds,
      selfAliases,
      dimension: intent.dimension,
      targetType: intent.targetType,
    })

    return {
      answer,
      sourcePageIds: pageIds,
      confidence: 0.9,
      fromWiki: false,
      answerMode: 'synthesis',
      citations,
      usedCitationIds: extractCitationLabels(answer),
      evidence: {
        queryType: 'synthesis',
        term: `${intent.dimension}_discovery`,
        pageHits: citations.length,
        sourceHits: 0,
        drawerHits: 0,
        chunkHits: 0,
        topPageTitles: citations.map(citation => citation.title),
        topSourceTitles: [],
      },
    }
  } catch {
    const answer = buildPersonalDiscoveryFallback(intent, topCandidates)
    return {
      answer,
      sourcePageIds: citations.map(citation => citation.pageId).filter((value): value is string => Boolean(value)),
      confidence: 0.76,
      fromWiki: false,
      answerMode: 'synthesis',
      citations,
      usedCitationIds: extractCitationLabels(answer),
      evidence: {
        queryType: 'synthesis',
        term: `${intent.dimension}_discovery`,
        pageHits: citations.length,
        sourceHits: 0,
        drawerHits: 0,
        chunkHits: 0,
        topPageTitles: citations.map(citation => citation.title),
        topSourceTitles: [],
      },
    }
  }
}

async function runSynthesisQuery(
  question: string,
  llmConfig: LLMConfig,
  callbacks: StreamCallbacks | undefined,
  agentPerspective: string | undefined,
  options: { includeHybrid: boolean; folderPath?: string | null }
): Promise<QueryResult> {
  if (!question.trim()) {
    return { answer: '', sourcePageIds: [], confidence: 0, fromWiki: false }
  }

  const analysis = analyzeKnowledgeQuery(question)
  if (analysis.countIntent) {
    if (analysis.countIntent.mode === 'items' || analysis.countIntent.wantsGrouping) {
      return analyzeCorpusCollection(analysis.countIntent, options.folderPath)
    }
    return analyzeCorpusTerm(analysis.countIntent.term, options.folderPath)
  }
  if (analysis.collectionIntent) {
    return analyzeCorpusCuration(question, analysis.collectionIntent, llmConfig, callbacks, agentPerspective, options.folderPath)
  }
  if (analysis.personalIntent) {
    return analyzePersonalDiscoveryQuery(
      question,
      analysis.personalIntent,
      analysis.searchTerms,
      llmConfig,
      callbacks,
      agentPerspective,
      options.folderPath,
    )
  }

  const selfAliases = await loadSelfAliases()
  const investigationQueries = buildInvestigationQueries(question, analysis)
  const perQueryPageLimit = analysis.wantsExhaustiveCoverage ? (options.includeHybrid ? 18 : 14) : (options.includeHybrid ? 12 : 10)
  const perQuerySourceLimit = analysis.wantsExhaustiveCoverage ? 10 : 6
  const perQueryDrawerLimit = analysis.wantsExhaustiveCoverage ? 8 : 5
  const hybridFolderCondition = buildFolderScopeCondition('folder_path', options.folderPath)

  const [pageMatchSets, sourceMatchSets, drawerMatchSets, hybridResults] = await Promise.all([
    Promise.all(investigationQueries.map(queryText => searchPages(queryText, perQueryPageLimit, options.folderPath).catch(() => [] as SearchPageMatch[]))),
    Promise.all(investigationQueries.map(queryText => searchSources(queryText, perQuerySourceLimit, options.folderPath).catch(() => [] as SearchSourceMatch[]))),
    Promise.all(investigationQueries.map(queryText => searchDrawers(queryText, perQueryDrawerLimit, options.folderPath).catch(() => [] as SearchDrawerMatch[]))),
    options.includeHybrid
      ? vectorHybridSearch(analysis.searchText, {
          ftsLimit: analysis.wantsExhaustiveCoverage ? 48 : 30,
          vectorLimit: analysis.wantsExhaustiveCoverage ? 28 : 20,
          topK: analysis.wantsExhaustiveCoverage ? 12 : 8,
          filterSQL: hybridFolderCondition?.clause,
          filterParams: hybridFolderCondition?.params || [],
        }).catch(() => [] as HybridSearchResult[])
      : Promise.resolve([] as HybridSearchResult[]),
  ])
  const pageMatches = mergeInvestigativeResults(
    pageMatchSets,
    analysis.wantsExhaustiveCoverage ? (options.includeHybrid ? 32 : 26) : (options.includeHybrid ? 18 : 14),
  )
  const sourceMatches = mergeInvestigativeResults(
    sourceMatchSets,
    analysis.wantsExhaustiveCoverage ? 20 : 12,
  )
  const drawerMatches = mergeInvestigativeResults(
    drawerMatchSets,
    analysis.wantsExhaustiveCoverage ? 14 : 9,
  )

  const chunkRows = await loadChunkEvidence(hybridResults.map(result => result.chunkId), options.folderPath)
  const filteredPageMatches = rankAndFilterRelationItems(
    pageMatches,
    analysis.relationEntities,
    {
      getTitle: page => page.title,
      getText: page => `${page.summary}\n${page.content}`,
      getSearchScore: page => page.score,
      selfAliases,
    },
  )
  const filteredSourceMatches = rankAndFilterRelationItems(
    sourceMatches,
    analysis.relationEntities,
    {
      getTitle: source => source.title || '',
      getText: source => `${source.content}\n${source.rawContent}`,
      getSearchScore: source => source.score,
      selfAliases,
    },
  )
  const filteredDrawerMatches = rankAndFilterRelationItems(
    drawerMatches,
    analysis.relationEntities,
    {
      getTitle: drawer => drawer.title || '',
      getText: drawer => drawer.rawContent,
      getSearchScore: drawer => drawer.score,
      selfAliases,
    },
  )
  const filteredChunkRows = rankAndFilterRelationItems(
    chunkRows,
    analysis.relationEntities,
    {
      getTitle: chunk => chunk.pageTitle || chunk.sourceTitle || chunk.drawerTitle || '',
      getText: chunk => chunk.content,
      getSearchScore: chunk => hybridResults.find(result => result.chunkId === chunk.id)?.hybridScore ?? 0,
      selfAliases,
    },
  )

  const terms = analysis.searchTerms.length > 0 ? analysis.searchTerms : [analysis.searchText]
  const pageCitationsRaw: QueryCitation[] = filteredPageMatches.slice(0, 10).map((page, index) => {
    const sourceCount = uniqueStrings(page.sourceIds).length
    const drawerCount = extractDrawerIds(page.metadata).length
    return {
      id: page.id,
      label: `P${index + 1}`,
      kind: 'page',
      title: page.title,
      excerpt: buildExcerpt(page.summary || page.content, terms, 260),
      meta: uniqueStrings([
        page.category,
        `重要度 ${page.importance}`,
        `置信度 ${formatPercent(page.confidence)}`,
        sourceCount > 0 ? `关联来源 ${sourceCount}` : '',
        drawerCount > 0 ? `关联抽屉 ${drawerCount}` : '',
      ]),
      pageId: page.id,
      score: page.score,
      confidence: page.confidence,
    }
  })

  const sourceCitationsRaw: QueryCitation[] = filteredSourceMatches.slice(0, 10).map((source, index) => ({
    id: source.id,
    label: `S${index + 1}`,
    kind: 'source',
    title: source.title || '未命名来源',
    excerpt: buildExcerpt(source.content || source.rawContent, terms, 280),
    meta: uniqueStrings([
      source.sourceType || '',
      source.url ? truncate(source.url, 48) : '',
      source.filePath ? truncate(source.filePath, 48) : '',
    ]),
    sourceId: source.id,
    url: source.url,
    filePath: source.filePath,
    sourceType: source.sourceType,
    score: source.score,
  }))

  const drawerCitationsRaw: QueryCitation[] = filteredDrawerMatches.slice(0, 6).map((drawer, index) => ({
    id: drawer.id,
    label: `D${index + 1}`,
    kind: 'drawer',
    title: drawer.title || `抽屉 ${drawer.id.slice(0, 8)}`,
    excerpt: buildExcerpt(drawer.rawContent, terms, 280),
    meta: uniqueStrings([
      drawer.sourceType || '',
      `${drawer.wing}/${drawer.hall}/${drawer.room}`,
      drawer.filePath ? truncate(drawer.filePath, 40) : '',
      drawer.sourceUrl ? truncate(drawer.sourceUrl, 44) : '',
    ]),
    drawerId: drawer.id,
    url: drawer.sourceUrl,
    filePath: drawer.filePath,
    sourceType: drawer.sourceType,
    score: drawer.score,
  }))

  const chunkCitationsRaw: QueryCitation[] = filteredChunkRows.slice(0, 8).map((chunk, index) => {
    const hybrid = hybridResults.find(result => result.chunkId === chunk.id)
    return {
      id: chunk.id,
      label: `C${index + 1}`,
      kind: 'chunk',
      title: chunk.pageTitle || chunk.sourceTitle || chunk.drawerTitle || `知识片段 ${index + 1}`,
      excerpt: buildExcerpt(chunk.content, terms, 260),
      meta: uniqueStrings([
        chunk.headerBreadcrumb || '',
        typeof hybrid?.hybridScore === 'number' ? `相关度 ${Math.round(hybrid.hybridScore * 100)}%` : '',
        chunk.pageTitle ? `页面 ${chunk.pageTitle}` : '',
        chunk.sourceTitle ? `来源 ${chunk.sourceTitle}` : '',
      ]),
      pageId: chunk.pageId || undefined,
      sourceId: chunk.sourceId || undefined,
      drawerId: chunk.drawerId || undefined,
      url: chunk.url || undefined,
      filePath: chunk.filePath || undefined,
      sourceType: chunk.sourceType || undefined,
      score: hybrid?.hybridScore ?? hybrid?.vectorScore ?? hybrid?.ftsScore ?? 0,
    }
  })

  const pageCitations = relabelCitations(prioritizeCitationsByEntityCoverage(pageCitationsRaw, analysis.relationEntities), 'P')
  const sourceCitations = relabelCitations(prioritizeCitationsByEntityCoverage(sourceCitationsRaw, analysis.relationEntities), 'S')
  const drawerCitations = relabelCitations(prioritizeCitationsByEntityCoverage(drawerCitationsRaw, analysis.relationEntities), 'D')
  const chunkCitations = relabelCitations(prioritizeCitationsByEntityCoverage(chunkCitationsRaw, analysis.relationEntities), 'C')

  const citations = [...pageCitations, ...sourceCitations, ...drawerCitations, ...chunkCitations]
  const promptCitations = [
    ...pageCitations.slice(0, analysis.wantsExhaustiveCoverage ? 10 : 6),
    ...sourceCitations.slice(0, analysis.wantsExhaustiveCoverage ? 10 : 6),
    ...drawerCitations.slice(0, analysis.wantsExhaustiveCoverage ? 6 : 4),
    ...chunkCitations.slice(0, analysis.wantsExhaustiveCoverage ? 8 : 6),
  ]
  if (citations.length === 0) {
    return {
      answer: '未在知识库中找到相关信息。请尝试添加更多来源，或换一个更具体的问法。',
      sourcePageIds: [],
      confidence: 0,
      fromWiki: false,
      answerMode: 'synthesis',
      citations: [],
      evidence: {
        queryType: 'synthesis',
        term: analysis.relationEntities.length > 0 ? analysis.relationEntities.join(' / ') : analysis.searchText,
        pageHits: 0,
        sourceHits: 0,
        drawerHits: 0,
        chunkHits: 0,
      },
    }
  }

  const directives = buildQueryDirectives(analysis)
  const context = buildEvidenceContext(question, promptCitations, terms, analysis.relationEntities)
  const userMessage = `以下是这次查询检索出的完整证据包。\n\n${context}\n\n请严格依据这些证据回答问题。`

  try {
    const cognitivePrompt = renderCognitivePrompt(loadCognitiveProfile())
    const promptLayers = [QUERY_SYSTEM_PROMPT]
    if (directives.length > 0) {
      promptLayers.push(`## 本次回答附加要求\n- ${directives.join('\n- ')}`)
    }
    if (cognitivePrompt) promptLayers.push(cognitivePrompt)
    if (agentPerspective) promptLayers.push(`**你的角色设定：**\n${agentPerspective}`)
    const systemPrompt = promptLayers.join('\n\n---\n\n')

    const rawAnswer = callbacks?.onChunk
      ? await chatCompletionStream(
          llmConfig,
          [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
          callbacks,
          0.35,
          4096
        )
      : await chatCompletion(
          llmConfig,
          [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
          0.35,
          4096
        )
    const answer = ensureNonEmptyAnswer(
      rawAnswer,
      buildEvidenceFallback(question, promptCitations),
    )

    const usedCitationIds = extractCitationLabels(answer)
    const pageIds = pageCitations.map(citation => citation.pageId).filter((value): value is string => Boolean(value))
    const confidence = estimateConfidence({
      pageHits: pageCitations.length,
      sourceHits: sourceCitations.length,
      drawerHits: drawerCitations.length,
      chunkHits: chunkCitations.length,
      strongestPageConfidence: filteredPageMatches[0]?.confidence || pageMatches[0]?.confidence || 0,
    })

    await appendToLog('query', 'page', pageIds.join(','), `知识库综合查询: ${question.slice(0, 80)}`, {
      queryText: analysis.searchText,
      pageIds,
      sourceIds: sourceCitations.map(citation => citation.sourceId).filter(Boolean),
      drawerIds: drawerCitations.map(citation => citation.drawerId).filter(Boolean),
      chunkIds: chunkCitations.map(citation => citation.id),
    })

    return {
      answer,
      sourcePageIds: pageIds,
      confidence,
      fromWiki: false,
      answerMode: 'synthesis',
      citations,
      usedCitationIds,
      evidence: {
        queryType: pageCitations.length > 0 ? 'lookup' : 'synthesis',
        term: analysis.relationEntities.length > 0 ? analysis.relationEntities.join(' / ') : analysis.searchText,
        pageHits: pageCitations.length,
        sourceHits: sourceCitations.length,
        drawerHits: drawerCitations.length,
        chunkHits: chunkCitations.length,
        topPageTitles: pageCitations.map(citation => citation.title),
        topSourceTitles: sourceCitations.map(citation => citation.title),
      },
    }
  } catch (err) {
    const pageIds = pageCitations.map(citation => citation.pageId).filter((value): value is string => Boolean(value))
    return {
      answer: `查询失败: ${String(err)}`,
      sourcePageIds: pageIds,
      confidence: 0,
      fromWiki: false,
      answerMode: 'synthesis',
      citations,
      evidence: {
        queryType: 'synthesis',
        term: analysis.relationEntities.length > 0 ? analysis.relationEntities.join(' / ') : analysis.searchText,
        pageHits: pageCitations.length,
        sourceHits: sourceCitations.length,
        drawerHits: drawerCitations.length,
        chunkHits: chunkCitations.length,
        topPageTitles: pageCitations.map(citation => citation.title),
        topSourceTitles: sourceCitations.map(citation => citation.title),
      },
    }
  }
}

async function analyzeCorpusTerm(term: string, folderPath?: string | null): Promise<QueryResult> {
  const pageFolderCondition = buildFolderScopeCondition('folder_path', folderPath, { includeLegacyBlank: true })
  const sourceFolderCondition = buildFolderScopeCondition('folder_path', folderPath)
  const [pageRows, sourceRows] = await Promise.all([
    query<{ title: string; content: string; summary: string; id: string; source_ids: string; metadata_json: string; folder_path: string }>(
      `SELECT id, title, content, summary, source_ids, metadata_json, folder_path
       FROM wiki_pages
       WHERE is_index = 0 AND is_log = 0
       ${pageFolderCondition ? `AND ${pageFolderCondition.clause}` : ''}`,
      pageFolderCondition ? pageFolderCondition.params : [],
    ),
    query<{ title: string; content: string; id: string; source_type: string; url: string; file_path: string }>(
      `SELECT id, title, content, source_type, url, file_path
       FROM wiki_sources
       ${sourceFolderCondition ? `WHERE ${sourceFolderCondition.clause}` : ''}`,
      sourceFolderCondition ? sourceFolderCondition.params : [],
    ),
  ])

  const filteredPageRows = await filterPageMatchesByFolderScope(
    pageRows.map(row => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      content: row.content,
      sourceIds: JSON.parse(row.source_ids || '[]'),
      metadata: JSON.parse(row.metadata_json || '{}'),
      folderPath: row.folder_path || '',
      linkedPageIds: [],
      category: '',
      tags: [],
      frontmatter: {},
      backlinkCount: 0,
      importance: 0,
      confidence: 0,
      isIndex: false,
      isLog: false,
      templateId: '',
      version: 1,
      createdAt: '',
      updatedAt: '',
      slug: '',
      score: 0,
    })),
    folderPath,
  )

  const pageMatches = filteredPageRows
    .map(row => {
      const combined = `${row.title || ''}\n${row.summary || ''}\n${row.content || ''}`
      return {
        id: row.id,
        title: row.title,
        mentions: countOccurrences(combined, term),
        excerpt: buildExcerpt(combined, [term], 200),
      }
    })
    .filter(row => row.mentions > 0)
    .sort((a, b) => b.mentions - a.mentions)

  const sourceMatches = sourceRows
    .map(row => ({
      id: row.id,
      title: row.title,
      mentions: countOccurrences(`${row.title || ''}\n${row.content || ''}`, term),
      excerpt: buildExcerpt(`${row.title || ''}\n${row.content || ''}`, [term], 220),
      sourceType: row.source_type || '',
      url: row.url || '',
      filePath: row.file_path || '',
    }))
    .filter(row => row.mentions > 0)
    .sort((a, b) => b.mentions - a.mentions)

  const pageMentions = pageMatches.reduce((sum, row) => sum + row.mentions, 0)
  const sourceMentions = sourceMatches.reduce((sum, row) => sum + row.mentions, 0)
  const topPages = pageMatches.slice(0, 5)
  const topSources = sourceMatches.slice(0, 5)

  const lines = [
    '## 语料统计',
    `- 关键词：\`${term}\``,
    `- Wiki 页面提及次数：${pageMentions}`,
    `- Wiki 页面命中文章数：${pageMatches.length}`,
    `- 原始来源提及次数：${sourceMentions}`,
    `- 原始来源命中文章数：${sourceMatches.length}`,
  ]

  if (topPages.length > 0) {
    lines.push('', '## 页面命中')
    for (const page of topPages) {
      lines.push(`- [[${page.title}]]：${page.mentions} 次`)
    }
  }

  if (topSources.length > 0) {
    lines.push('', '## 原始来源命中')
    for (const source of topSources) {
      lines.push(`- ${source.title || '未命名来源'}：${source.mentions} 次`)
    }
  }

  lines.push('', '## 说明')
  if (pageMentions === 0 && sourceMentions === 0) {
    lines.push('- 当前知识库中没有检索到这个关键词的直接出现记录。')
  } else {
    lines.push('- 原始来源与编译后的 Wiki 页面可能存在内容重叠，因此两组数字应分别理解，不要直接相加。')
  }

  await appendToLog('query', 'page', term, `知识库统计查询: ${term}`)

  return {
    answer: lines.join('\n'),
    sourcePageIds: topPages.map(page => page.id),
    confidence: 0.95,
    fromWiki: true,
    answerMode: 'count',
    citations: [
      ...topPages.map((page, index): QueryCitation => ({
        id: page.id,
        label: `P${index + 1}`,
        kind: 'page',
        title: page.title,
        excerpt: page.excerpt,
        meta: [`提及 ${page.mentions} 次`],
        pageId: page.id,
      })),
      ...topSources.map((source, index): QueryCitation => ({
        id: source.id,
        label: `S${index + 1}`,
        kind: 'source',
        title: source.title || '未命名来源',
        excerpt: source.excerpt,
        meta: uniqueStrings([
          `提及 ${source.mentions} 次`,
          source.sourceType,
          source.url ? truncate(source.url, 48) : '',
          source.filePath ? truncate(source.filePath, 40) : '',
        ]),
        sourceId: source.id,
        url: source.url,
        filePath: source.filePath,
        sourceType: source.sourceType,
      })),
    ],
    evidence: {
      queryType: 'count',
      term,
      pageMentions,
      sourceMentions,
      pageHits: pageMatches.length,
      sourceHits: sourceMatches.length,
      topPageTitles: topPages.map(page => page.title),
      topSourceTitles: topSources.map(source => source.title || '未命名来源'),
    },
  }
}

// ─── 核心查询 ───

/** 查询 Wiki — 向后兼容，直接复用增强版链路 */
export async function queryWiki(
  question: string,
  llmConfig: LLMConfig,
  callbacks?: StreamCallbacks,
  agentPerspective?: string,
  scope?: KnowledgeQueryScope,
): Promise<QueryResult> {
  return runSynthesisQuery(question, llmConfig, callbacks, agentPerspective, {
    includeHybrid: false,
    folderPath: scope?.folderPath,
  })
}

// ─── 答案归档 ───

function stripInlineCitationLabels(text: string): string {
  return text.replace(/\[(?:P|S|D|C)\d+\]/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

function extractArchiveKeyPoints(answer: string): string[] {
  const cleaned = stripInlineCitationLabels(answer)
  const bulletLines = cleaned
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^[-*•]\s+/.test(line))
    .map(line => line.replace(/^[-*•]\s+/, '').trim())
    .filter(Boolean)

  if (bulletLines.length > 0) return bulletLines.slice(0, 5)

  const sentenceMatches = cleaned
    .split(/(?<=[。！？!?])\s+/)
    .map(item => item.trim())
    .filter(item => item.length >= 12)

  return sentenceMatches.slice(0, 4)
}

async function loadArchiveSourceTitles(sourcePageIds: string[]): Promise<string[]> {
  const uniqueIds = uniqueStrings(sourcePageIds)
  if (uniqueIds.length === 0) return []
  const placeholders = uniqueIds.map(() => '?').join(', ')
  const rows = await query<{ title: string }>(
    `SELECT title FROM wiki_pages WHERE id IN (${placeholders})`,
    uniqueIds
  )
  return uniqueStrings(rows.map(row => row.title).filter(Boolean))
}

async function buildArchiveBlueprint(
  question: string,
  answer: string,
  sourceTitles: string[],
  llmConfig?: LLMConfig,
): Promise<{
  title: string
  summary: string
  category: string
  tags: string[]
  keyPoints: string[]
  followUps: string[]
}> {
  const fallback = {
    title: `Q&A: ${question.slice(0, 60)}`,
    summary: stripInlineCitationLabels(answer).slice(0, 110) || question.slice(0, 100),
    category: 'qa',
    tags: ['qa', 'curated-answer'],
    keyPoints: extractArchiveKeyPoints(answer),
    followUps: [
      '把结论改写成专题页，继续补充双向链接。',
      '回看相关原始页面，确认哪些地方值得升级为长期结论。',
    ],
  }

  if (!llmConfig) return fallback

  try {
    const response = await chatCompletion(
      llmConfig,
      [
        {
          role: 'system',
          content: `你是知识库策展编辑。请把一段问答归档成适合长期保存的 Wiki 页面蓝图。

输出 JSON：
{
  "title": "不超过28字的页面标题",
  "summary": "一句话摘要，不超过100字",
  "category": "general|tech|academic|concept|decision|learning|insight|qa",
  "tags": ["标签1", "标签2", "标签3"],
  "key_points": ["关键点1", "关键点2", "关键点3"],
  "follow_ups": ["后续行动1", "后续行动2"]
}

规则：
- 标题要像知识条目，不要机械重复原问题
- 不能编造回答里没有的事实
- 标签优先贴近主题，不超过 5 个
- 用中文输出 JSON`,
        },
        {
          role: 'user',
          content: [
            `问题：${question}`,
            `回答：${stripInlineCitationLabels(answer).slice(0, 2400)}`,
            sourceTitles.length > 0 ? `相关页面：${sourceTitles.join('、')}` : '',
          ].filter(Boolean).join('\n\n'),
        },
      ],
      0.2,
      900,
    )

    const match = response.match(/\{[\s\S]*\}/)
    if (!match) return fallback
    const parsed = JSON.parse(match[0]) as {
      title?: string
      summary?: string
      category?: string
      tags?: string[]
      key_points?: string[]
      follow_ups?: string[]
    }

    return {
      title: String(parsed.title || fallback.title).slice(0, 80),
      summary: String(parsed.summary || fallback.summary).slice(0, 140),
      category: String(parsed.category || fallback.category),
      tags: uniqueStrings(Array.isArray(parsed.tags) ? parsed.tags.map(tag => String(tag)) : fallback.tags).slice(0, 5),
      keyPoints: uniqueStrings(Array.isArray(parsed.key_points) ? parsed.key_points.map(item => String(item)) : fallback.keyPoints).slice(0, 5),
      followUps: uniqueStrings(Array.isArray(parsed.follow_ups) ? parsed.follow_ups.map(item => String(item)) : fallback.followUps).slice(0, 4),
    }
  } catch {
    return fallback
  }
}

function renderResearchSection(research?: GroundedResearchReport | null): string {
  if (!research || !research.grounded) return ''

  const lines = ['## 外部前沿补强', '', research.summary]

  if (research.notableSignals.length > 0) {
    lines.push('', '### 外部信号')
    for (const signal of research.notableSignals) lines.push(`- ${signal}`)
  }

  if (research.recommendations.length > 0) {
    lines.push('', '### 可行动建议')
    for (const recommendation of research.recommendations) lines.push(`- ${recommendation}`)
  }

  if (research.sources.length > 0) {
    lines.push('', '### 外部来源')
    for (const source of research.sources.slice(0, 6)) {
      lines.push(`- ${source.title} ｜ ${source.domain || source.authority} ｜ ${source.url}`)
    }
  }

  return lines.join('\n')
}

/** 将好答案归档为新 Wiki 页面 */
export async function fileAnswerAsPage(
  question: string,
  answer: string,
  sourcePageIds: string[],
  llmConfig?: LLMConfig,
  options?: FileAnswerAsPageOptions,
): Promise<string> {
  const sourceTitles = await loadArchiveSourceTitles(sourcePageIds)
  const blueprint = await buildArchiveBlueprint(question, answer, sourceTitles, llmConfig)
  const slug = `qa-${Date.now()}`
  const evidenceLines = sourceTitles.length > 0
    ? sourceTitles.map(title => `- [[${title}]]`)
    : ['- 本次归档没有绑定到明确的 Wiki 页面证据。']
  const keyPoints = blueprint.keyPoints.length > 0
    ? blueprint.keyPoints.map(point => `- ${point}`).join('\n')
    : '- 暂未自动提炼出关键点。'
  const followUps = blueprint.followUps.length > 0
    ? blueprint.followUps.map(point => `- ${point}`).join('\n')
    : '- 继续补充证据、反例与相关页面链接。'
  const archiveContent = [
    '## 一句话结论',
    '',
    blueprint.summary,
    '',
    '## 原始问题',
    '',
    question,
    '',
    '## 综合回答',
    '',
    answer,
    '',
    '## 关键要点',
    '',
    keyPoints,
    '',
    '## 证据入口',
    '',
    evidenceLines.join('\n'),
    renderResearchSection(options?.research),
    '',
    '## 可继续追问',
    '',
    followUps,
  ].filter(Boolean).join('\n')

  const pageId = await createPage({
    title: blueprint.title,
    slug,
    content: archiveContent,
    summary: blueprint.summary,
    category: blueprint.category || 'qa',
    tags: uniqueStrings(['qa', 'auto-archived', ...blueprint.tags]),
    sourceIds: sourcePageIds,
    importance: options?.research?.grounded ? 58 : 48,
    folderPath: options?.folderPath || undefined,
    metadata: {
      folderPath: options?.folderPath || '',
      sourceType: 'query',
      originalQuestion: question,
      answerMode: options?.answerMode || 'synthesis',
      citationLabels: options?.citations?.map(citation => citation.label) || [],
      researchQueries: options?.research?.queries || [],
      archivedAt: new Date().toISOString(),
    },
  })

  await appendToLog('create', 'page', pageId, `Q&A 归档: ${question.slice(0, 50)}`)
  await parseWikiLinks(pageId).catch(() => {})

  if (llmConfig) {
    try {
      const { extractTriplesFromText } = await import('../memory/knowledge-graph')
      await extractTriplesFromText(stripInlineCitationLabels(answer), `wiki-qa:${pageId}`)
    } catch { /* non-critical */ }
  }

  return pageId
}

// ─── 知识库快速查找（供 XiaoBai 等使用） ───

/** 快速知识库查找 — 只做 FTS，不调 LLM */
export async function quickWikiLookup(queryText: string): Promise<{
  found: boolean
  content: string
  pageId: string
  title: string
  confidence: number
} | null> {
  const matches = await searchPages(queryText, 3)
  if (matches.length === 0) return null

  const best = matches[0]
  if (best.importance < 20 && best.score <= 1) return null

  return {
    found: true,
    content: best.summary || best.content.slice(0, 500),
    pageId: best.id,
    title: best.title,
    confidence: best.confidence,
  }
}

// ─── 混合搜索查询 ───

/**
 * 增强版查询 — FTS5 + 向量语义搜索混合
 *
 * 先检索完整证据包，再让 LLM 输出带引用标签的综合答案。
 */
export async function queryWikiEnhanced(
  question: string,
  llmConfig: LLMConfig,
  callbacks?: StreamCallbacks,
  agentPerspective?: string,
  scope?: KnowledgeQueryScope,
): Promise<QueryResult> {
  return runSynthesisQuery(question, llmConfig, callbacks, agentPerspective, {
    includeHybrid: true,
    folderPath: scope?.folderPath,
  })
}
