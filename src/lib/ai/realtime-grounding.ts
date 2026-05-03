export type RealtimeSearchEndpoint = 'news' | 'web'
export type RealtimeSourceTier = 'official' | 'primary-news' | 'tech-news' | 'general-news' | 'unknown'
export type BraveFreshness = 'pd' | 'pw' | 'pm' | 'py'

export interface RealtimeSearchItem {
  title: string
  url: string
  description: string
  age?: string
  ageDays?: number
  endpoint?: RealtimeSearchEndpoint
  sourceTier?: RealtimeSourceTier
  isIndexPage?: boolean
}

export interface RealtimeFreshnessWindow {
  label: string
  freshness: BraveFreshness
  maxAgeDays: number
  priorityLabel: string
}

export interface GroundedSearchPack {
  mustGround: boolean
  grounded: boolean
  status: 'not-needed' | 'grounded' | 'unavailable' | 'empty' | 'failed'
  todayLabel: string
  freshnessWindow: RealtimeFreshnessWindow
  queries: string[]
  results: RealtimeSearchItem[]
  promptFragment: string
  error?: string
  rejectedResultCount?: number
}

const REALTIME_PATTERN =
  /(今天|今日|昨天|前天|最近|最新|目前|当前|现在|这几天|近期|本周|本月|上周|时事|资讯|情报|新闻|热点|热搜|舆论|头条|快报|简报|要闻|动态|发布|发布会|声明|公告|2025|2026|前沿|突破|惊艳|刚刚|today|latest|news|breaking|now|current)/i

const AI_PATTERN =
  /(ai|openai|anthropic|google|deepmind|gpt|claude|gemini|deepseek|minimax|大模型|模型|llm|agent|智能体|sora|midjourney|stable diffusion|llama|mistral|qwen|gemma)/i

export const OPENBASAKA_ANSWER_QUALITY_RULES = `

<answer-quality-rules>
事实底线：
1. 绝对不要伪造工具调用、搜索过程、引用来源或发布时间。不要输出 <tool_call: ...>、<tool_call_use>、web_search JSON 等工具痕迹。
2. 用户问“今天/今日/最新/现在/前沿/新闻/动态”时，只能基于 <realtime-search-results> 里的来源回答；如果没有该标签或标签说明搜索不可用，必须明确说当前无法可靠回答实时动态。
3. 每个实时事实后面都要带来源编号，例如 [S1]。搜索结果没有支持的说法，不要写成事实。
4. 必须写清楚检索日期。不要把旧月份、旧年份当成今天。
5. 不确定时说“不确定/来源不足”，不要为了好看编产品名、版本号、榜单、参数、跑分或比较。
输出格式：
1. 实时新闻回答必须使用清晰 Markdown：检索日期、时间窗口、3-6 条新闻卡片、最后给“对 Openbasaka 的意义”。
2. 每条新闻卡片用“### 数字. 标题”开头，下面只放 3 行：事实、为什么重要、可信度/限制。
3. 不要堆砌长表格；只有横向比较时才使用表格。
4. 引用编号紧跟事实句，例如“DeepSeek 发布新模型 [S2]”。
</answer-quality-rules>`

export function getTodayLabel(date = new Date()): string {
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function needsRealtimeGrounding(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false
  return (
    REALTIME_PATTERN.test(normalized) ||
    (AI_PATTERN.test(normalized) && /有什么|有哪些|推荐|值得|惊艳|突破/.test(normalized))
  )
}

export function resolveRealtimeFreshnessWindow(text: string): RealtimeFreshnessWindow {
  const normalized = text.trim().toLowerCase()

  if (/(本月|这个月|近\s*30\s*天|30\s*天|一个月|month)/i.test(normalized)) {
    return {
      label: '最近 30 天',
      freshness: 'pm',
      maxAgeDays: 31,
      priorityLabel: '优先最近 7 天，必要时扩展到 30 天',
    }
  }

  return {
    label: '最近 7 天',
    freshness: 'pw',
    maxAgeDays: 7,
    priorityLabel: /(今天|今日|刚刚|24\s*小时|today|breaking|now)/i.test(normalized)
      ? '优先 24 小时内，结果不足时只扩展到 7 天'
      : '只使用最近 7 天内的来源',
  }
}

export function buildRealtimeSearchQueries(text: string, date = new Date()): string[] {
  const trimmed = text.trim().replace(/\s+/g, ' ').slice(0, 120)
  const year = date.getFullYear()
  const month = date.toLocaleString('en-US', { month: 'long' })
  const dateLabel = date.toISOString().slice(0, 10)

  if (AI_PATTERN.test(trimmed)) {
    return uniqueStrings([
      `${trimmed} 最近7天 AI 新闻 ${year}`,
      `latest AI breakthroughs news past 7 days ${month} ${year}`,
      `AI model releases OpenAI Anthropic Google DeepMind DeepSeek past week ${dateLabel}`,
    ]).slice(0, 3)
  }

  return uniqueStrings([trimmed, `${trimmed} 最近7天 ${year}`, `${trimmed} latest news past week ${year}`]).slice(0, 3)
}

export function normalizeRealtimeSearchItems(
  value: unknown,
  options: { endpoint?: RealtimeSearchEndpoint; date?: Date } = {},
): RealtimeSearchItem[] {
  const rawItems = Array.isArray(value)
    ? value
    : Array.isArray((value as any)?.web?.results)
      ? (value as any).web.results
      : Array.isArray((value as any)?.results)
        ? (value as any).results
        : []

  return rawItems
    .map((item: any) => {
      const title = stripText(String(item?.title || item?.name || '')).slice(0, 160)
      const url = String(item?.url || item?.link || '').trim()
      if (!title || !url) return null
      const age = typeof item?.age === 'string' ? stripText(item.age) : undefined
      return {
        title,
        url,
        description: stripText(String(item?.description || item?.snippet || item?.summary || '')).slice(0, 360),
        age,
        ageDays: estimateAgeDays(age, options.date),
        endpoint: options.endpoint,
        sourceTier: classifyRealtimeSource(url),
        isIndexPage: isLikelyNewsIndexPage(title, url),
      } satisfies RealtimeSearchItem
    })
    .filter((item: RealtimeSearchItem | null): item is RealtimeSearchItem => Boolean(item))
}

export function dedupeRealtimeSearchItems(items: RealtimeSearchItem[]): RealtimeSearchItem[] {
  const byUrl = new Map<string, RealtimeSearchItem>()
  for (const item of items) {
    const key = item.url.replace(/[#?].*$/, '')
    if (!byUrl.has(key)) byUrl.set(key, item)
  }
  return Array.from(byUrl.values())
}

export function filterRealtimeSearchItemsForFreshness(
  items: RealtimeSearchItem[],
  freshnessWindow: RealtimeFreshnessWindow,
  date = new Date(),
): RealtimeSearchItem[] {
  return rankRealtimeSearchItems(
    items
      .map((item) => ({
        ...item,
        ageDays: item.ageDays ?? estimateAgeDays(item.age, date),
        sourceTier: item.sourceTier ?? classifyRealtimeSource(item.url),
      }))
      .filter((item) => typeof item.ageDays === 'number' && item.ageDays >= 0 && item.ageDays <= freshnessWindow.maxAgeDays),
  )
}

export function preferReliableRealtimeSources(items: RealtimeSearchItem[], minimumReliable = 4): RealtimeSearchItem[] {
  const reliable = items.filter((item) => item.sourceTier && item.sourceTier !== 'unknown')
  if (reliable.length >= minimumReliable) return reliable
  const reliableUrls = new Set(reliable.map((item) => item.url))
  return [...reliable, ...items.filter((item) => !reliableUrls.has(item.url))]
}

export function preferSpecificRealtimeItems(items: RealtimeSearchItem[], minimumSpecific = 4): RealtimeSearchItem[] {
  const specific = items.filter((item) => !item.isIndexPage)
  if (specific.length >= minimumSpecific) return specific
  const specificUrls = new Set(specific.map((item) => item.url))
  return [...specific, ...items.filter((item) => !specificUrls.has(item.url))]
}

export function formatGroundedSearchPrompt(
  pack: Pick<GroundedSearchPack, 'todayLabel' | 'freshnessWindow' | 'queries' | 'results'>,
): string {
  const sourceLines = pack.results
    .slice(0, 8)
    .map((result, index) =>
      [
        `[S${index + 1}] ${result.title}`,
        result.endpoint ? `搜索类型：${result.endpoint}` : '',
        result.sourceTier ? `来源级别：${result.sourceTier}` : '',
        result.isIndexPage ? '页面类型：栏目/汇总页，不能单独支撑具体新闻事实' : '页面类型：具体来源页',
        result.age ? `时间线索：${result.age}` : '',
        typeof result.ageDays === 'number' ? `估算距今：${result.ageDays} 天` : '',
        result.description ? `摘要：${result.description}` : '',
        `URL：${result.url}`,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n')

  return `

<realtime-search-results date="${pack.todayLabel}">
检索日期：${pack.todayLabel}
时间窗口：${pack.freshnessWindow.label}（${pack.freshnessWindow.priorityLabel}）
实际搜索查询：${pack.queries.join('；')}

回答规则：
- 只允许使用下列来源回答实时问题，且只能列入“${pack.freshnessWindow.label}”内发布或发生的 AI 新闻。
- 不要把 2 月、3 月或任何超出时间窗口的内容列成“今日/近期新闻”；旧内容只能作为背景，不能上榜。
- 每条实时事实后标注来源编号，例如 [S1]。
- 如果来源没有支撑，不要写入答案。
- “10 万亿参数”“收购”“模型发布”“开源”“跑分超过”等重大事实，必须有官方来源或权威新闻来源支撑；低可信单一来源只能写成“有报道称”，不能写成确定事实。
- 来源时间线索缺失或超出时间窗口时，不能支撑新闻条目。
- 栏目页/汇总页只能帮助发现线索，不能单独支撑具体事实；具体事实必须来自具体文章、官方公告、论文或项目页。
- 不要输出任何工具调用文本。

来源：
${sourceLines}
</realtime-search-results>`
}

export function formatRealtimeSearchFailureAnswer(
  pack: Pick<GroundedSearchPack, 'todayLabel' | 'freshnessWindow' | 'status' | 'error' | 'rejectedResultCount'>,
): string {
  const reason =
    pack.status === 'unavailable'
      ? '联网搜索通道没有可用结果，可能是 Brave Search Key 或搜索服务未配置。'
      : pack.status === 'empty'
        ? `联网搜索完成了，但没有拿到 ${pack.freshnessWindow.label} 内足够可验证的来源。`
        : '联网搜索失败了。'
  const rejected =
    pack.rejectedResultCount && pack.rejectedResultCount > 0
      ? `\n\n我剔除了 ${pack.rejectedResultCount} 条超出时间窗口或没有可靠时间线索的结果。`
      : ''
  const detail = pack.error ? `\n\n技术原因：${pack.error}` : ''
  return `阿圆，这个问题属于“今日/最新动态”，我不能凭模型记忆硬编。\n\n检索日期：${pack.todayLabel}\n时间窗口：${pack.freshnessWindow.label}\n${reason}${rejected}\n\n所以我现在不会列“今日最惊艳 AI”榜单。等搜索通道可用后，我会按“事实 + 来源 + 为什么重要 + 对你项目的意义”的格式回答。${detail}`
}

export function stripToolCallArtifacts(text: string): string {
  return text
    .replace(/<tool_call:[\s\S]*?<\/tool_call_use>/gi, '')
    .replace(/<tool_call:[\s\S]*?<\/tool_call>/gi, '')
    .replace(/<tool_call\s+id="[^"]+">[\s\S]*?<\/tool_call>/gi, '')
    .replace(/\{"tool"\s*:\s*"[^"]+"\s*,\s*"params"\s*:\s*\{[\s\S]*?\}\s*\}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function estimateAgeDays(age: string | undefined, date = new Date()): number | undefined {
  if (!age) return undefined

  const normalized = age
    .toLowerCase()
    .replace(/[，。]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) return undefined
  if (/(just now|today|刚刚|今天|now)/.test(normalized)) return 0
  if (/(yesterday|昨天)/.test(normalized)) return 1

  const relative = normalized.match(/(\d+(?:\.\d+)?)\s*(second|minute|hour|day|week|month|year|秒|分钟|小時|小时|天|日|周|星期|月|年)s?\s*(ago|前)?/)
  if (relative) {
    const amount = Number(relative[1])
    const unit = relative[2]
    if (/(second|minute|hour|秒|分钟|小時|小时)/.test(unit)) return 0
    if (/(day|天|日)/.test(unit)) return Math.floor(amount)
    if (/(week|周|星期)/.test(unit)) return Math.floor(amount * 7)
    if (/(month|月)/.test(unit)) return Math.floor(amount * 31)
    if (/(year|年)/.test(unit)) return Math.floor(amount * 365)
  }

  const explicitDate = parseExplicitDate(normalized, date)
  if (!explicitDate) return undefined
  return daysBetween(explicitDate, date)
}

function parseExplicitDate(value: string, now: Date): Date | undefined {
  const iso = value.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/)
  if (iso) return buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const chinese = value.match(/\b(?:(20\d{2})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)?\b/)
  if (chinese) {
    return buildDate(chinese[1] ? Number(chinese[1]) : now.getFullYear(), Number(chinese[2]), Number(chinese[3]))
  }

  const monthNames: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  }
  const monthDate = value.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:,?\s+(20\d{2}))?\b/,
  )
  if (monthDate) {
    const month = monthNames[monthDate[1]]
    return buildDate(monthDate[3] ? Number(monthDate[3]) : now.getFullYear(), month, Number(monthDate[2]))
  }

  return undefined
}

function buildDate(year: number, month: number, day: number): Date | undefined {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return undefined
  const parsed = new Date(year, month - 1, day)
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed
}

function daysBetween(older: Date, newer: Date): number {
  const start = new Date(older.getFullYear(), older.getMonth(), older.getDate()).getTime()
  const end = new Date(newer.getFullYear(), newer.getMonth(), newer.getDate()).getTime()
  return Math.floor((end - start) / 86_400_000)
}

function classifyRealtimeSource(url: string): RealtimeSourceTier {
  let hostname = ''
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return 'unknown'
  }

  if (
    [
      'openai.com',
      'anthropic.com',
      'deepmind.google',
      'blog.google',
      'deepseek.com',
      'mistral.ai',
      'ai.meta.com',
      'about.fb.com',
      'microsoft.com',
      'nvidia.com',
      'huggingface.co',
    ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
  ) {
    return 'official'
  }

  if (
    [
      'reuters.com',
      'apnews.com',
      'bloomberg.com',
      'nytimes.com',
      'wsj.com',
      'ft.com',
      'cnbc.com',
      'theinformation.com',
    ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
  ) {
    return 'primary-news'
  }

  if (
    [
      'techcrunch.com',
      'theverge.com',
      'wired.com',
      'arstechnica.com',
      'venturebeat.com',
      'cnet.com',
      'zdnet.com',
      'thedecoder.com',
    ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
  ) {
    return 'tech-news'
  }

  if (
    [
      'bbc.com',
      'theguardian.com',
      'forbes.com',
      'fortune.com',
      'businessinsider.com',
      'mashable.com',
    ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
  ) {
    return 'general-news'
  }

  return 'unknown'
}

function isLikelyNewsIndexPage(title: string, url: string): boolean {
  const normalizedTitle = title.toLowerCase()
  if (/(latest headlines|latest ai news|ai updates today|llm news today|model releases|news \| latest|latest developments)/i.test(normalizedTitle)) {
    return true
  }

  try {
    const parsed = new URL(url)
    const path = parsed.pathname.replace(/\/+$/, '').toLowerCase()
    return /\/(ai|artificial-intelligence|technology\/artificial-intelligence|topics\/artificial-intelligence|news\/ai)$/.test(path)
  } catch {
    return false
  }
}

function rankRealtimeSearchItems(items: RealtimeSearchItem[]): RealtimeSearchItem[] {
  const tierRank: Record<RealtimeSourceTier, number> = {
    official: 0,
    'primary-news': 1,
    'tech-news': 2,
    'general-news': 3,
    unknown: 4,
  }

  return [...items].sort((a, b) => {
    const ageDiff = (a.ageDays ?? 999) - (b.ageDays ?? 999)
    if (ageDiff !== 0) return ageDiff

    const tierDiff = tierRank[a.sourceTier ?? 'unknown'] - tierRank[b.sourceTier ?? 'unknown']
    if (tierDiff !== 0) return tierDiff

    if (a.endpoint !== b.endpoint) return a.endpoint === 'news' ? -1 : 1
    return a.title.localeCompare(b.title)
  })
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}
