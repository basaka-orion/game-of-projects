import type { WikiPage } from './wiki'

export interface KnowledgeOverview {
  totalPages: number
  connectedPages: number
  recentPages: number
  avgConfidence: number
  avgImportance: number
  starredPages: number
  pinnedPages: number
}

export interface KnowledgeCategoryStat {
  category: string
  label: string
  count: number
  recentCount: number
  avgImportance: number
  avgConfidence: number
}

export interface KnowledgeTagStat {
  tag: string
  count: number
  recentCount: number
  delta: number
}

export interface KnowledgeTimelinePoint {
  key: string
  label: string
  count: number
}

export interface KnowledgeAnchor {
  pageId: string
  title: string
  category: string
  tags: string[]
  score: number
  reason: string
}

export interface KnowledgeOpportunity {
  id: string
  pageAId: string
  pageATitle: string
  pageACategory: string
  pageBId: string
  pageBTitle: string
  pageBCategory: string
  sharedTags: string[]
  score: number
  reason: string
  prompt: string
}

export interface KnowledgeIntelligence {
  overview: KnowledgeOverview
  categories: KnowledgeCategoryStat[]
  tags: KnowledgeTagStat[]
  timeline: KnowledgeTimelinePoint[]
  anchors: KnowledgeAnchor[]
  opportunities: KnowledgeOpportunity[]
  frontierSignals: string[]
}

export interface KnowledgePageLens {
  key: string
  label: string
}

type LensRule = {
  key: string
  label: string
  when: (page: WikiPage, text: string, tagSet: Set<string>) => boolean
}

const RECENT_WINDOW_DAYS = 45

const LENS_RULES: LensRule[] = [
  {
    key: 'qa',
    label: '问答归档',
    when: (page, text, tags) => page.category === 'qa' || tags.has('qa') || /^q&a:/iu.test(page.title) || /问答|提问/u.test(text),
  },
  {
    key: 'persona',
    label: '用户画像',
    when: (_page, text, tags) => {
      return ['用户画像', '用户画像总结', '行为模式', '交互特征', '交互风格', '交互偏好', '沟通偏好', '信息呈现', '兴趣领域', '画像']
        .some(keyword => text.includes(keyword) || tags.has(keyword.toLowerCase()))
    },
  },
  {
    key: 'learning',
    label: '学习记录',
    when: (page, text, tags) => page.category === 'learning' || tags.has('learning') || /学习|复盘|读书|课程|知识点/u.test(text),
  },
  {
    key: 'insight',
    label: '洞察札记',
    when: (page, text, tags) => page.category === 'insight' || tags.has('insight') || /洞察|观察|总结|判断|启发/u.test(text),
  },
  {
    key: 'concept',
    label: '概念母题',
    when: (page, text, tags) => page.category === 'concept' || tags.has('concept') || /概念|模型|母题|世界观|哲学|意识/u.test(text),
  },
  {
    key: 'decision',
    label: '决策与策略',
    when: (page, text, tags) => page.category === 'decision' || tags.has('decision') || /策略|决策|选择|路径|判断标准/u.test(text),
  },
  {
    key: 'project',
    label: '项目与技术',
    when: (page, text, tags) => {
      return page.category === 'tech'
        || tags.has('tech')
        || ['ai', '产品', '项目', '技术', 'workflow', '工作流', '软件', '系统', '模型', '提示词', '插件']
          .some(keyword => text.toLowerCase().includes(keyword.toLowerCase()) || tags.has(keyword.toLowerCase()))
    },
  },
  {
    key: 'work',
    label: '作品与文稿',
    when: (_page, text, tags) => {
      return /只言片语|题外话|每日抉择|番外篇|文稿|篇目|札记/u.test(text)
        || tags.has('只言片语')
        || tags.has('文稿')
    },
  },
]

function safeDate(value: string | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysSince(date: Date | null, now: Date): number {
  if (!date) return Number.POSITIVE_INFINITY
  return (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function intersect(a: string[], b: string[]): string[] {
  const right = new Set(b)
  return a.filter(item => right.has(item))
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase()
}

function extractTitleKeywords(title: string): string[] {
  const matches = title.match(/[\u4e00-\u9fff]{2,}|[a-z0-9][a-z0-9-]{2,}/gi) || []
  return uniqueStrings(matches.map(item => item.toLowerCase()))
}

function pageText(page: WikiPage): string {
  return `${page.title} ${page.summary} ${(page.tags || []).join(' ')} ${(page.content || '').slice(0, 800)}`
}

function formatMonthKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  return `${year}-${month}`
}

function formatMonthLabel(key: string): string {
  return key.slice(5)
}

export function isPagePinned(page: WikiPage): boolean {
  return Boolean((page.metadata || {}).pinned)
}

export function isPageStarred(page: WikiPage): boolean {
  return Boolean((page.metadata || {}).starred)
}

export function getKnowledgePageLens(page: WikiPage): KnowledgePageLens {
  const text = pageText(page)
  const tagSet = new Set((page.tags || []).map(normalizeTag))
  for (const rule of LENS_RULES) {
    if (rule.when(page, text, tagSet)) {
      return { key: rule.key, label: rule.label }
    }
  }
  return { key: 'archive', label: '综合沉淀' }
}

function buildTimeline(pages: WikiPage[], now: Date): KnowledgeTimelinePoint[] {
  const keys: string[] = []
  for (let offset = 7; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    keys.push(formatMonthKey(date))
  }

  const counts = new Map<string, number>(keys.map(key => [key, 0]))
  for (const page of pages) {
    const date = safeDate(page.createdAt || page.updatedAt)
    if (!date) continue
    const key = formatMonthKey(new Date(date.getFullYear(), date.getMonth(), 1))
    if (!counts.has(key)) continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  return keys.map(key => ({
    key,
    label: formatMonthLabel(key),
    count: counts.get(key) || 0,
  }))
}

function buildAnchors(pages: WikiPage[], now: Date): KnowledgeAnchor[] {
  return pages
    .map(page => {
      const ageDays = daysSince(safeDate(page.updatedAt || page.createdAt), now)
      const freshnessBonus = Number.isFinite(ageDays) ? Math.max(0, 30 - ageDays) / 6 : 0
      const pinnedBonus = isPagePinned(page) ? 22 : 0
      const starredBonus = isPageStarred(page) ? 12 : 0
      const score = page.importance * 0.5
        + page.backlinkCount * 11
        + page.linkedPageIds.length * 6
        + page.confidence * 24
        + freshnessBonus
        + pinnedBonus
        + starredBonus

      let reason = '适合作为当前知识库的核心入口'
      if (isPagePinned(page)) {
        reason = '你已置顶，适合作为长期主入口'
      } else if (page.backlinkCount >= 3 && page.linkedPageIds.length >= 2) {
        reason = '连接多个主题，是天然的索引与枢纽'
      } else if (page.importance >= 85) {
        reason = '重要度很高，适合作为核心入口'
      } else if (ageDays <= RECENT_WINDOW_DAYS) {
        reason = '近期活跃，适合作为最新入口'
      }

      return {
        pageId: page.id,
        title: page.title,
        category: getKnowledgePageLens(page).label,
        tags: page.tags.slice(0, 4),
        score,
        reason,
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
}

function buildOpportunities(pages: WikiPage[], now: Date): KnowledgeOpportunity[] {
  const candidates = [...pages]
    .sort((a, b) => {
      const scoreA = a.importance + a.backlinkCount * 12 + a.linkedPageIds.length * 5 + (isPageStarred(a) ? 10 : 0)
      const scoreB = b.importance + b.backlinkCount * 12 + b.linkedPageIds.length * 5 + (isPageStarred(b) ? 10 : 0)
      return scoreB - scoreA
    })
    .slice(0, 48)

  const opportunities: KnowledgeOpportunity[] = []

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]
      const b = candidates[j]
      const sharedTags = intersect(
        uniqueStrings((a.tags || []).map(normalizeTag)),
        uniqueStrings((b.tags || []).map(normalizeTag)),
      )
      const sharedKeywords = intersect(extractTitleKeywords(a.title), extractTitleKeywords(b.title))
      const lensA = getKnowledgePageLens(a)
      const lensB = getKnowledgePageLens(b)
      const categoryBonus = lensA.key !== lensB.key ? 2.8 : 0
      const recencyA = daysSince(safeDate(a.updatedAt || a.createdAt), now) <= RECENT_WINDOW_DAYS ? 1.2 : 0
      const recencyB = daysSince(safeDate(b.updatedAt || b.createdAt), now) <= RECENT_WINDOW_DAYS ? 1.2 : 0
      const score = sharedTags.length * 3.5
        + sharedKeywords.length * 2
        + categoryBonus
        + (a.importance + b.importance) / 90
        + recencyA
        + recencyB

      if (score < 5.8) continue

      const bridgeToken = sharedTags[0] || sharedKeywords[0] || '共同问题'
      const reason = sharedTags.length > 0
        ? `共享标签 ${sharedTags.slice(0, 3).join(' / ')}，适合形成专题桥梁`
        : `「${lensA.label}」与「${lensB.label}」之间值得围绕「${bridgeToken}」建立连接`

      opportunities.push({
        id: `${a.id}::${b.id}`,
        pageAId: a.id,
        pageATitle: a.title,
        pageACategory: lensA.label,
        pageBId: b.id,
        pageBTitle: b.title,
        pageBCategory: lensB.label,
        sharedTags: sharedTags.slice(0, 4),
        score,
        reason,
        prompt: `围绕「${bridgeToken}」建立一个连接 [[${a.title}]] 与 [[${b.title}]] 的专题页，提炼共同问题、分歧与下一步方向。`,
      })
    }
  }

  const usedIds = new Set<string>()
  return opportunities
    .sort((a, b) => b.score - a.score)
    .filter(item => {
      const guardA = `${item.pageAId}:${item.pageBId}`
      const guardB = `${item.pageBId}:${item.pageAId}`
      if (usedIds.has(guardA) || usedIds.has(guardB)) return false
      usedIds.add(guardA)
      return true
    })
    .slice(0, 6)
}

function buildTags(pages: WikiPage[], now: Date): KnowledgeTagStat[] {
  const recentCutoff = RECENT_WINDOW_DAYS
  const previousStart = RECENT_WINDOW_DAYS * 2
  const counters = new Map<string, { count: number; recent: number; previous: number }>()

  for (const page of pages) {
    const ageDays = daysSince(safeDate(page.updatedAt || page.createdAt), now)
    for (const rawTag of page.tags || []) {
      const tag = normalizeTag(rawTag)
      if (!tag) continue
      if (!counters.has(tag)) counters.set(tag, { count: 0, recent: 0, previous: 0 })
      const counter = counters.get(tag)!
      counter.count += 1
      if (ageDays <= recentCutoff) counter.recent += 1
      else if (ageDays <= previousStart) counter.previous += 1
    }
  }

  return Array.from(counters.entries())
    .map(([tag, counter]) => ({
      tag,
      count: counter.count,
      recentCount: counter.recent,
      delta: counter.recent - counter.previous,
    }))
    .sort((a, b) => b.count - a.count || b.delta - a.delta)
    .slice(0, 14)
}

function buildCategories(pages: WikiPage[], now: Date): KnowledgeCategoryStat[] {
  const buckets = new Map<string, { lens: KnowledgePageLens; items: WikiPage[] }>()
  for (const page of pages) {
    const lens = getKnowledgePageLens(page)
    if (!buckets.has(lens.key)) buckets.set(lens.key, { lens, items: [] })
    buckets.get(lens.key)!.items.push(page)
  }

  return Array.from(buckets.entries())
    .map(([category, bucket]) => ({
      category,
      label: bucket.lens.label,
      count: bucket.items.length,
      recentCount: bucket.items.filter(item => daysSince(safeDate(item.updatedAt || item.createdAt), now) <= RECENT_WINDOW_DAYS).length,
      avgImportance: average(bucket.items.map(item => item.importance)),
      avgConfidence: average(bucket.items.map(item => item.confidence)),
    }))
    .sort((a, b) => b.count - a.count || b.avgImportance - a.avgImportance)
}

function buildFrontierSignals(
  overview: KnowledgeOverview,
  categories: KnowledgeCategoryStat[],
  tags: KnowledgeTagStat[],
  anchors: KnowledgeAnchor[],
  opportunities: KnowledgeOpportunity[],
): string[] {
  const signals: string[] = []

  const risingTags = tags
    .filter(tag => tag.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3)
  if (risingTags.length > 0) {
    signals.push(`近期抬头的标签：${risingTags.map(tag => `${tag.tag}（+${tag.delta}）`).join('，')}。`)
  }

  const recentCategories = categories
    .filter(category => category.recentCount > 0)
    .sort((a, b) => b.recentCount - a.recentCount)
    .slice(0, 2)
  if (recentCategories.length > 0) {
    signals.push(`最近最活跃的板块是 ${recentCategories.map(item => item.label).join(' / ')}，适合优先做索引。`)
  }

  if (overview.connectedPages < Math.max(6, Math.floor(overview.totalPages * 0.35))) {
    signals.push('页面之间的互链仍然偏少，建议优先补一批总索引页与桥接页。')
  }

  if (overview.pinnedPages === 0) {
    signals.push('你还没有任何置顶条目，建议先挑 3 篇长期核心页固定到顶部。')
  }

  if (anchors.length > 0) {
    signals.push(`当前最适合作为总入口的是「${anchors[0].title}」。`)
  }

  if (opportunities.length > 0) {
    signals.push(`当前最值得跨界连接的是「${opportunities[0].pageATitle}」与「${opportunities[0].pageBTitle}」。`)
  }

  return signals.slice(0, 5)
}

export function buildKnowledgeIntelligence(pages: WikiPage[]): KnowledgeIntelligence {
  const now = new Date()
  const overview: KnowledgeOverview = {
    totalPages: pages.length,
    connectedPages: pages.filter(page => page.backlinkCount > 0 || page.linkedPageIds.length > 0).length,
    recentPages: pages.filter(page => daysSince(safeDate(page.updatedAt || page.createdAt), now) <= RECENT_WINDOW_DAYS).length,
    avgConfidence: average(pages.map(page => page.confidence)),
    avgImportance: average(pages.map(page => page.importance)),
    starredPages: pages.filter(isPageStarred).length,
    pinnedPages: pages.filter(isPagePinned).length,
  }

  const categories = buildCategories(pages, now)
  const tags = buildTags(pages, now)
  const timeline = buildTimeline(pages, now)
  const anchors = buildAnchors(pages, now)
  const opportunities = buildOpportunities(pages, now)
  const frontierSignals = buildFrontierSignals(overview, categories, tags, anchors, opportunities)

  return {
    overview,
    categories,
    tags,
    timeline,
    anchors,
    opportunities,
    frontierSignals,
  }
}

export function getKnowledgeCategoryLabel(category: string): string {
  const match = LENS_RULES.find(rule => rule.key === category)
  if (match) return match.label
  if (category === 'archive') return '综合沉淀'
  return category || '综合沉淀'
}
