export interface CorpusCountIntent {
  term: string
  mode?: 'mentions' | 'items'
  wantsGrouping?: boolean
}

export interface CorpusCollectionIntent {
  term: string
  aspectTerms: string[]
}

export interface PersonalDiscoveryIntent {
  subject: 'self'
  targetType: 'person' | 'self'
  dimension: PersonalDiscoveryDimension
}

export type PersonalDiscoveryDimension =
  | 'affection'
  | 'pattern'
  | 'preference'
  | 'value'
  | 'motivation'
  | 'fear'
  | 'strength'
  | 'weakness'

export interface KnowledgeQueryAnalysis {
  originalQuestion: string
  normalizedQuestion: string
  searchText: string
  searchTerms: string[]
  countIntent: CorpusCountIntent | null
  collectionIntent: CorpusCollectionIntent | null
  personalIntent: PersonalDiscoveryIntent | null
  relationEntities: string[]
  wantsExhaustiveCoverage: boolean
  wantsCanonicalAnswer: boolean
  wantsClassification: boolean
}

const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
  '自己', '这', '他', '她', '它', '们', '那', '什么', '怎么', '如何', '为什么',
  '可以', '能', '请', '帮', '给', '让', '把', '被', '从', '对', '用', '这个',
  '那个', '哪个', '哪些', '多少', '几', '还', '又', '再', '更', '最', '非常',
  '吗', '呢', '吧', '啊', '呀', '嗯', '哦', '哈', '嘿', '喂', '关于', '有关', '对于',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'it', 'its',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they',
  'and', 'or', 'but', 'not', 'no', 'if', 'then', 'than', 'so', 'too',
])

const QUOTED_TERM_RE = /[“"「『'`](.+?)[”"」』'`]/g
const SPLIT_RE = /[，。！？、；：""''（）【】《》…—\s,.!?;:(){}@#$%^&*+=~`|-]+/g
const QUESTION_NOISE_RE = /^[?？!！。.\s]+|[?？!！。.\s]+$/g
const MENTION_COUNT_SIGNAL_RE = /(提及|提到|出现|词频|次数|多少次|几次|统计|count|mention)/i
const ITEM_COUNT_SIGNAL_RE = /(多少篇|几篇|多少条|几条|多少则|几则|多少篇目|篇数|总数|总共有多少|共有多少|写了多少|写过多少|一共写了多少|总共写了多少)/iu
const GROUPING_SIGNAL_RE = /(归类|分类|归纳|按内容|从内容出发|按主题|主题分类|主题归类)/iu
const CURATION_SIGNAL_RE = /(哪(?:一)?篇|哪篇|哪条|哪则|最有启发|最有指引|最有引导|最值得|最重要|最能代表|最适合|更有启发|更有指引|更有引导)/iu
const EXHAUSTIVE_SIGNAL_RE = /(全部|所有|完整|整体|整个|全面|全方位|系统地|系统性|详尽|穷尽|汇总|总览|全景|全貌)/iu
const CANONICAL_SIGNAL_RE = /(准确|精确|严谨|口径|去重|到底|究竟|真实|最终|严格来说|严格地说|准确定义)/iu
const PERSONAL_DISCOVERY_RULES: Array<{
  dimension: PersonalDiscoveryDimension
  targetType: 'person' | 'self'
  patterns: RegExp[]
  searchTerms: string[]
}> = [
  {
    dimension: 'affection',
    targetType: 'person',
    patterns: [
      /我对(?:哪(?:一)?些人|哪些人|谁|什么人).*(?:情愫|好感|喜欢|中意|心动|爱意|上头)/iu,
      /我(?:喜欢过|爱过|中意过|心动过|上头过)(?:哪(?:一)?些人|哪些人|谁|什么人)/iu,
      /我(?:曾经|以前|过去)?.*(?:喜欢|爱|中意|心动)过谁/iu,
      /谁(?:让我|曾让我)(?:动心|心动|上头)/iu,
    ],
    searchTerms: ['情愫', '好感', '喜欢', '中意', '心动', '爱意', '上头', '追求', '在一起', '想你'],
  },
  {
    dimension: 'pattern',
    targetType: 'self',
    patterns: [
      /我(?:有|身上有)?哪些(?:行为)?模式/iu,
      /我总是为什么/iu,
      /我(?:反复|经常|老是).*(?:问题|陷入|出现|重复)/iu,
      /我有哪些习惯/iu,
    ],
    searchTerms: ['模式', '习惯', '总是', '反复', '倾向', '容易', '每次', '长期'],
  },
  {
    dimension: 'preference',
    targetType: 'self',
    patterns: [
      /我(?:偏好|喜欢|不喜欢|适合)什么/iu,
      /我喜欢什么样/iu,
      /我的偏好/iu,
      /我更倾向于什么/iu,
    ],
    searchTerms: ['偏好', '喜欢', '不喜欢', '适合', '倾向', '爱用', '偏向'],
  },
  {
    dimension: 'value',
    targetType: 'self',
    patterns: [
      /我(?:最)?在乎什么/iu,
      /我重视什么/iu,
      /我的(?:价值观|原则|底线)/iu,
      /我最看重什么/iu,
    ],
    searchTerms: ['在乎', '重视', '价值观', '原则', '底线', '信任', '真诚', '长期', '意义'],
  },
  {
    dimension: 'motivation',
    targetType: 'self',
    patterns: [
      /我为什么努力/iu,
      /我真正想要什么/iu,
      /我追求什么/iu,
      /我想成为什么样的人/iu,
      /什么在驱动我/iu,
    ],
    searchTerms: ['追求', '目标', '努力', '方向', '想要', '成为', '创造', '野心'],
  },
  {
    dimension: 'fear',
    targetType: 'self',
    patterns: [
      /我(?:害怕|担心|焦虑|恐惧)什么/iu,
      /我最怕什么/iu,
      /我在忧虑什么/iu,
      /我为何总是不安/iu,
    ],
    searchTerms: ['害怕', '担心', '焦虑', '恐惧', '不安', '怕失去', '忧虑'],
  },
  {
    dimension: 'strength',
    targetType: 'self',
    patterns: [
      /我(?:擅长|有什么优势|强项是什么|长处是什么)/iu,
      /我最厉害的地方是什么/iu,
      /我的优势在哪里/iu,
    ],
    searchTerms: ['擅长', '优势', '能力', '天赋', '长处', '判断', '耐心', '洞察'],
  },
  {
    dimension: 'weakness',
    targetType: 'self',
    patterns: [
      /我(?:有什么弱点|缺点是什么|短板是什么)/iu,
      /我的问题在哪里/iu,
      /我容易犯什么毛病/iu,
      /我的局限是什么/iu,
    ],
    searchTerms: ['弱点', '缺点', '问题', '短板', '局限', '毛病', '不足', '容易'],
  },
]
const ENTITY_EDGE_NOISE_RE = /^[\s"'“”‘’「」『』【】《》（）()<>]+|[\s"'“”‘’「」『』【】《》（）()<>]+$/gu
const RELATION_LINKERS = ['与', '和', '跟', '同', '及']
const RELATION_TAIL_PATTERNS = [
  /\s*(?:之间)?(?:的)?(?:(?:是|算|属于|有|有没有|到底是|到底算|究竟是|究竟算)?(?:什么|啥|哪种|哪类)?|(?:如何|怎么样|咋样))?(?:关系|联系|关联|状态)(?:呀|啊|吗|呢|嘛)?$/u,
  /\s*(?:是)?(?:暧昧|亲密|情侣|对象|爱人|cp)(?:吗|嘛|呢)?$/iu,
]

const LEADING_FILLER_PATTERNS = [
  /^(?:请问|麻烦你|麻烦|请你|请帮我|帮我|帮忙|劳驾)\s*/u,
  /^(?:我想知道|想知道|我想了解|想了解|我想查|想查|我想搜|想搜|我想看|想看)\s*/u,
  /^(?:查一下|查下|查一查|搜索一下|搜索|搜一下|搜下|搜一搜|查询一下|查询|找一下|找下|看一下|看下|统计一下|统计|数一下|算一下)\s*/u,
  /^(?:关于|有关|对于)\s*/u,
]

const TRAILING_FILLER_PATTERNS = [
  /\s*(?:吗|呢|呀|啊|吧|嘛)+$/u,
  /\s*(?:是谁|是啥|是什么(?:样(?:的人|子))?|是什么意思|什么意思|含义是什么|定义是什么)$/u,
  /\s*(?:讲了什么|写了什么|说了什么)$/u,
  /\s*(?:有哪些|有什么|有谁)$/u,
  /\s*(?:在哪|在哪里|何时|什么时候)$/u,
  /\s*(?:怎么|如何|为什么)$/u,
  /\s*的?(?:资料|信息|内容|介绍|记录|文章|页面|来源|出处|全文)$/u,
  /\s*(?:相关(?:资料|信息|内容|记录|文章|页面|来源)?)$/u,
  /\s*(?:有提到吗|提到过吗|出现过吗|被提及吗)$/u,
]

function normalizeText(text: string): string {
  return text
    .trim()
    .replace(QUESTION_NOISE_RE, '')
    .replace(/^[“"「『'`]+|[”"」』'`]+$/g, '')
    .trim()
}

function isStopWord(term: string): boolean {
  const normalized = term.trim()
  if (!normalized) return true
  return STOP_WORDS.has(normalized) || STOP_WORDS.has(normalized.toLowerCase())
}

function dedupeTerms(terms: string[], maxTerms: number): string[] {
  const unique: string[] = []
  for (const term of terms) {
    const normalized = normalizeText(term)
    if (!normalized || isStopWord(normalized) || unique.includes(normalized)) continue
    unique.push(normalized)
    if (unique.length >= maxTerms) break
  }
  return unique
}

function trimQuestionScaffolding(text: string): string {
  let current = normalizeText(text)

  for (const pattern of LEADING_FILLER_PATTERNS) {
    current = current.replace(pattern, '').trim()
  }

  let changed = true
  while (changed) {
    changed = false
    for (const pattern of TRAILING_FILLER_PATTERNS) {
      const next = current.replace(pattern, '').trim()
      if (next !== current) {
        current = next
        changed = true
      }
    }
  }

  return normalizeText(current)
}

function stripRelationTail(text: string): string {
  let current = normalizeText(text)
  let changed = true

  while (changed) {
    changed = false
    for (const pattern of RELATION_TAIL_PATTERNS) {
      const next = current.replace(pattern, '').trim()
      if (next !== current) {
        current = next
        changed = true
      }
    }
  }

  return normalizeText(current).replace(/(?:之间|之间的)$/u, '').trim()
}

function sanitizeEntityCandidate(candidate: string, options: { allowSingleChar?: boolean } = {}): string {
  const allowSingleChar = options.allowSingleChar ?? false
  const normalized = normalizeText(candidate)
    .replace(ENTITY_EDGE_NOISE_RE, '')
    .replace(/^(?:关于|有关|对于|请问|麻烦你|麻烦|请你|请帮我|帮我|帮忙|劳驾)\s*/u, '')
    .replace(/[的啊呀吗呢吧嘛哦哈]+$/u, '')
    .trim()

  if (!normalized) return ''
  if (!allowSingleChar && /^[\u4e00-\u9fff]$/u.test(normalized)) return ''
  if (normalized.length > 24 || isStopWord(normalized)) return ''
  return normalized
}

function extractRelationEntities(text: string): string[] {
  const normalized = trimQuestionScaffolding(text)
  if (!normalized) return []

  for (const linker of RELATION_LINKERS) {
    const linkerIndex = normalized.indexOf(linker)
    if (linkerIndex <= 0 || linkerIndex >= normalized.length - linker.length) continue

    const left = sanitizeEntityCandidate(stripRelationTail(normalized.slice(0, linkerIndex)), { allowSingleChar: true })
    const right = sanitizeEntityCandidate(stripRelationTail(normalized.slice(linkerIndex + linker.length)), { allowSingleChar: true })

    if (!left || !right || left === right) continue
    return dedupeTerms([left, right], 4)
  }

  return []
}

function extractQuotedTerms(text: string): string[] {
  const terms: string[] = []
  for (const match of text.matchAll(QUOTED_TERM_RE)) {
    if (match[1]) terms.push(match[1])
  }
  return dedupeTerms(terms, 8)
}

function extractCollectionAspectTerms(question: string, collectionTerm: string): string[] {
  const stripped = normalizeText(question)
    .replace(collectionTerm, ' ')
    .replace(/你觉得|你认为|请问|请你|帮我|一下|哪一篇|哪篇|哪条|哪则|里|中|对于|关于|更有|最有|最能|最值得|更值得/gu, ' ')
    .replace(/[，。！？、；：/]/g, ' ')
    .replace(/[的了呢吗吧啊呀哦]/g, ' ')
    .trim()

  const rawTerms = stripped
    .split(/[\s与和对及并且而且]+/u)
    .map(term => normalizeText(term))
    .map(term => term.replace(/性$/u, ''))
    .filter(term => term.length >= 2 && term.length <= 10)
    .filter(term => !isStopWord(term))

  return dedupeTerms(rawTerms, 8)
}

function sanitizeCollectionCandidate(candidate: string): string {
  return normalizeText(candidate)
    .replace(/^(?:你觉得|你认为|请问|请你|帮我|帮忙)\s*/u, '')
    .replace(/^哪(?:一)?(?:篇|条|则)\s*/u, '')
    .replace(/^(?:关于|有关|对于|在|从|把|将)\s*/u, '')
    .replace(/(?:对于|关于|有关).*/u, '')
    .replace(/(?:对(?=(?:现世|现实|未来|当下|现在|后世|启发|引导|指引|意义|价值))).*/u, '')
    .replace(/(?:里|中)(?=(?:哪|最|更|对)).*/u, '')
    .trim()
}

function detectCollectionIntent(question: string): CorpusCollectionIntent | null {
  const normalized = normalizeText(question)
  if (!normalized || !CURATION_SIGNAL_RE.test(normalized)) return null

  const quoted = extractQuotedTerms(question)
  if (quoted[0]) {
    return {
      term: quoted[0],
      aspectTerms: extractCollectionAspectTerms(normalized, quoted[0]),
    }
  }

  const patterns = [
    /([\u4e00-\u9fffA-Za-z0-9_\-.《》「」『』【】]{2,24}?)(?=(?:对于|关于|有关)(?:[\u4e00-\u9fff]{0,16})?(?:最|更|哪))/u,
    /([\u4e00-\u9fffA-Za-z0-9_\-.《》「」『』【】]{2,24}?)(?=对(?:现世|现实|未来|当下|现在|后世))/u,
    /哪(?:一)?(?:篇|条|则)([\u4e00-\u9fffA-Za-z0-9_\-.《》「」『』【】]{2,40}?)(?:对|里|中|最|更|会|能|值得|有)/u,
    /在([\u4e00-\u9fffA-Za-z0-9_\-.《》「」『』【】]{2,40}?)(?:里|中).{0,12}?哪(?:一)?(?:篇|条|则)/u,
    /([\u4e00-\u9fffA-Za-z0-9_\-.《》「」『』【】]{2,40}?)(?:里|中)?(?:哪(?:一)?篇|哪篇|哪条|哪则|最有启发|最有指引|最值得|最重要|最能代表|最适合)/u,
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    const candidate = sanitizeCollectionCandidate(match?.[1] || '')
    if (!candidate) continue
    return {
      term: candidate,
      aspectTerms: extractCollectionAspectTerms(normalized, candidate),
    }
  }

  return null
}

function detectPersonalDiscoveryIntent(question: string): PersonalDiscoveryIntent | null {
  const normalized = normalizeText(question)
  if (!normalized) return null

  for (const rule of PERSONAL_DISCOVERY_RULES) {
    if (!rule.patterns.some(pattern => pattern.test(normalized))) continue
    return {
      subject: 'self',
      targetType: rule.targetType,
      dimension: rule.dimension,
    }
  }

  return null
}

function getPersonalDiscoverySearchTerms(dimension: PersonalDiscoveryDimension): string[] {
  return PERSONAL_DISCOVERY_RULES.find(rule => rule.dimension === dimension)?.searchTerms || []
}

function sanitizeCountCandidate(candidate: string): string {
  return normalizeText(candidate)
    .replace(/^(?:关于|有关|对于|把|将|这些|那些)\s*/u, '')
    .replace(/(?:一共|总共|累计|到底|究竟|当前|现在|目前)+$/u, '')
    .replace(/(?:我|我们|它们|这些|那些|这些篇目|这些内容)+$/u, '')
    .replace(/(?:被)+$/u, '')
    .trim()
}

export function detectCorpusCountIntent(question: string): CorpusCountIntent | null {
  const normalized = normalizeText(question)
  if (!normalized) return null

  const wantsMentionCount = MENTION_COUNT_SIGNAL_RE.test(normalized)
  const wantsItemCount = ITEM_COUNT_SIGNAL_RE.test(normalized)
  const wantsGrouping = GROUPING_SIGNAL_RE.test(normalized)

  if (!wantsMentionCount && !wantsItemCount && !wantsGrouping) return null

  const quoted = extractQuotedTerms(question)
  if (quoted[0]) {
    return {
      term: quoted[0],
      mode: wantsItemCount || wantsGrouping ? 'items' : 'mentions',
      wantsGrouping,
    }
  }

  const itemPatterns = [
    /([\u4e00-\u9fffA-Za-z0-9_\-.《》「」『』【】]{1,64}?)(?:我)?(?:一共|总共|累计|总计|到底|究竟|当前|现在|目前)?(?:写了|写过|有|共有|总共有)?(?:多少篇|几篇|多少条|几条|多少则|几则|多少篇目|篇数|总数)/u,
    /(?:一共|总共|累计|总计)?(?:写了|写过|有|共有|总共有)?(?:多少篇|几篇|多少条|几条|多少则|几则|多少篇目|篇数|总数)\s*([\u4e00-\u9fffA-Za-z0-9_\-.《》「」『』【】]{1,64})/u,
    /([\u4e00-\u9fffA-Za-z0-9_\-.《》「」『』【】]{1,64}?)(?:的)?(?:怎么|如何)(?:去)?(?:归类|分类|归纳)/u,
  ]
  const mentionPatterns = [
    /(?:统计|词频|次数|多少次|几次)\s*[：: ]?\s*([\u4e00-\u9fffA-Za-z0-9_\-.]{1,48})/u,
    /([\u4e00-\u9fffA-Za-z0-9_\-.]{1,48}?)(?:在(?:知识库|页面|来源|文章|文中)?(?:里|中)?)?(?:一共|总共)?(?:被)?(?:提及|提到|出现)(?:了)?(?:多少次|几次|多少回|多少|词频)?/iu,
    /([\u4e00-\u9fffA-Za-z0-9_\-.]{1,48}?)(?:有)?(?:多少次|几次)(?:提及|提到|出现|命中)/iu,
  ]

  const patterns = wantsItemCount || wantsGrouping ? [...itemPatterns, ...mentionPatterns] : mentionPatterns
  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    const candidate = sanitizeCountCandidate(match?.[1] || '')
    if (!candidate) continue
    return {
      term: candidate,
      mode: wantsItemCount || wantsGrouping ? 'items' : 'mentions',
      wantsGrouping,
    }
  }

  return null
}

function splitSegments(text: string): string[] {
  return text
    .replace(/[\\/]/g, '|')
    .replace(/\[/g, '|')
    .replace(/]/g, '|')
    .replace(SPLIT_RE, '|')
    .split('|')
    .map(segment => normalizeText(segment))
    .filter(Boolean)
}

function expandSearchTerm(term: string): string[] {
  const normalized = normalizeText(term)
  if (!normalized) return []

  const expanded: string[] = [normalized]
  const chineseParts = normalized.match(/[\u4e00-\u9fff]+/g) || []
  const englishParts = normalized.match(/[A-Za-z][A-Za-z0-9_.-]*/g) || []

  for (const part of chineseParts) {
    expanded.push(part)
    if (part.length > 4) {
      for (let i = 0; i < part.length - 1; i++) {
        expanded.push(part.slice(i, i + 2))
      }
    }
  }

  for (const part of englishParts) {
    expanded.push(part)
  }

  return expanded
}

export function extractSearchTerms(text: string, options: { maxTerms?: number } = {}): string[] {
  const maxTerms = options.maxTerms ?? 12
  const normalized = normalizeText(text)
  if (!normalized) return []

  const candidates: string[] = []
  const relationEntities = extractRelationEntities(normalized)
  const isRelationQuery = relationEntities.length >= 2
  if (relationEntities.length > 0) {
    candidates.push(...relationEntities)
    candidates.push(relationEntities.join(' '))
    candidates.push(relationEntities.join(''))
  }

  const countIntent = detectCorpusCountIntent(normalized)
  if (countIntent?.term) {
    candidates.push(countIntent.term)
  }

  const collectionIntent = detectCollectionIntent(normalized)
  if (collectionIntent?.term) {
    candidates.push(collectionIntent.term)
    candidates.push(...collectionIntent.aspectTerms)
  }

  const personalIntent = detectPersonalDiscoveryIntent(normalized)
  if (personalIntent) {
    candidates.push(...getPersonalDiscoverySearchTerms(personalIntent.dimension))
    candidates.push(...extractQuotedTerms(text))
    const expanded = candidates.flatMap(expandSearchTerm)
    return dedupeTerms(expanded, maxTerms)
  }

  candidates.push(...extractQuotedTerms(text))

  const trimmed = trimQuestionScaffolding(normalized)
  if (trimmed && !isRelationQuery) {
    candidates.push(trimmed)
  }

  const segmentSources = isRelationQuery
    ? []
    : trimmed && trimmed !== normalized
    ? [trimmed]
    : [trimmed, normalized]

  for (const source of segmentSources) {
    if (!source) continue
    candidates.push(...splitSegments(source))
  }

  const expanded = candidates.flatMap(expandSearchTerm)
  return dedupeTerms(expanded, maxTerms)
}

export function buildFtsQuery(text: string, maxTerms = 6): string {
  const normalized = normalizeText(text)
  const terms = extractSearchTerms(normalized, { maxTerms })
  if (terms.length === 0) return normalized
  return terms.map(term => `"${term.replace(/"/g, '""')}"`).join(' OR ')
}

function pickSearchText(question: string, terms: string[]): string {
  const relationEntities = extractRelationEntities(question)
  if (relationEntities.length >= 2) return relationEntities.join(' ')

  const trimmed = trimQuestionScaffolding(question)
  if (trimmed && !isStopWord(trimmed)) return trimmed
  return terms[0] || normalizeText(question)
}

export function analyzeKnowledgeQuery(question: string): KnowledgeQueryAnalysis {
  const normalizedQuestion = normalizeText(question)
  const countIntent = detectCorpusCountIntent(normalizedQuestion)
  const collectionIntent = detectCollectionIntent(normalizedQuestion)
  const personalIntent = detectPersonalDiscoveryIntent(normalizedQuestion)
  const relationEntities = collectionIntent
    ? []
    : extractRelationEntities(countIntent?.term || normalizedQuestion)
  const searchTerms = personalIntent
    ? dedupeTerms(getPersonalDiscoverySearchTerms(personalIntent.dimension), 12)
    : extractSearchTerms(countIntent?.term || collectionIntent?.term || normalizedQuestion)
  const searchText = personalIntent
    ? getPersonalDiscoverySearchTerms(personalIntent.dimension).slice(0, 6).join(' ')
    : countIntent?.term || collectionIntent?.term || pickSearchText(normalizedQuestion, searchTerms)
  const wantsClassification = GROUPING_SIGNAL_RE.test(normalizedQuestion) || Boolean(countIntent?.wantsGrouping)
  const wantsExhaustiveCoverage =
    EXHAUSTIVE_SIGNAL_RE.test(normalizedQuestion) ||
    Boolean(collectionIntent) ||
    Boolean(personalIntent) ||
    wantsClassification ||
    Boolean(countIntent && countIntent.mode === 'items')
  const wantsCanonicalAnswer =
    CANONICAL_SIGNAL_RE.test(normalizedQuestion) ||
    Boolean(collectionIntent) ||
    Boolean(personalIntent) ||
    Boolean(countIntent && countIntent.mode === 'items')

  return {
    originalQuestion: question,
    normalizedQuestion,
    searchText,
    searchTerms,
    countIntent,
    collectionIntent,
    personalIntent,
    relationEntities,
    wantsExhaustiveCoverage,
    wantsCanonicalAnswer,
    wantsClassification,
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function countOccurrences(text: string, term: string): number {
  if (!text || !term) return 0
  const isAscii = Array.from(term).every(char => char.charCodeAt(0) <= 0x7f)
  const flags = isAscii ? 'gi' : 'g'
  const matches = text.match(new RegExp(escapeRegExp(term), flags))
  return matches?.length || 0
}
