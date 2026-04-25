import { countOccurrences, type PersonalDiscoveryDimension } from './query-analysis'

const STRONG_AFFECTION_CUES = [
  '我喜欢你',
  '我很喜欢你',
  '我爱你',
  '中意你',
  '心仪',
  '心动',
  '上头',
  '在一起交往',
  '跟我在一起',
  '保护你',
  '想你',
  '失去你',
  '亲爱的小笨蛋',
  '运命共同体',
  '追求一段关系',
  '约会',
]

const MEDIUM_AFFECTION_CUES = [
  '喜欢',
  '中意',
  '追求',
  '陪伴',
  '相处',
  '契合',
  '魅力',
  '在我身边',
  '不离不弃',
  '奋不顾身',
  '想给您写',
  '失去',
]

const GENERIC_AFFECTION_PATTERNS = [
  /真正喜欢你的人/u,
  /你喜欢的人不一定会喜欢你/u,
  /别人喜欢你/u,
  /对方/u,
  /一般人/u,
  /这个社会/u,
  /任何人/u,
]

const IMAGINATIVE_PATTERNS = [
  /#小故事/u,
  /睡袍/u,
  /洗手台/u,
  /酒店/u,
  /吻了下去/u,
  /镜子里/u,
  /生生世世/u,
]

const NAME_STOP_WORDS = new Set([
  '我', '你', '他', '她', '它', '我们', '你们', '他们', '她们',
  '喜欢', '爱', '情愫', '好感', '上头', '心动', '关系', '未来', '现实', '世界',
  '努力', '生活', '自己', '时候', '因为', '如果', '只是', '这样', '那个人', '一个人',
  '陪伴', '运命', '共同体', '魅力', '耐心', '真诚', '理性', '感性', '内在', '外在',
  '智慧', '判断', '荷尔蒙', '机会', '关系', '经验', '差距', '世界观', '人生', '孩子',
  '对不起', '第一', '第二', '第三', '现在', '之前', '以后', '过去', '一个小时', '时间',
])

const COMMON_SURNAMES = new Set('赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝安常乐于时傅卞齐康伍余元顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫房裘缪解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚程嵇邢滑裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲台从鄂索籍赖卓蔺屠蒙池乔阴胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍却璩桑桂濮牛寿通边燕冀郏浦尚农温别庄晏柴瞿阎连习艾鱼容向古易慎戈廖庾终暨居衡步都耿弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公万俟司马上官欧阳夏侯诸葛闻人东方赫连皇甫尉迟公羊澹台公冶宗政濮阳淳于单于太叔申屠公孙仲孙轩辕令狐钟离宇文长孙慕容鲜于闾丘司徒司空'.split(''))

const EXPLICIT_NAME_PATTERNS = [
  /([\u4e00-\u9fffA-Za-z]{1,8})[，,:：]\s*我(?:很|也|真(?:的)?|其实|还是|只)?(?:喜欢|爱|中意|心仪|在乎)你/gu,
  /我(?:很|也|真(?:的)?|其实|还是|只)?(?:喜欢|爱|中意|心仪)([\u4e00-\u9fffA-Za-z]{1,8})(?=[的，。,！!？?\s])/gu,
  /我喜欢([\u4e00-\u9fffA-Za-z]{1,8})的(?:性格|努力|耐心|真诚|魅力|思路|感性|理性|内在|外在)/gu,
  /(?:上一次|之前)([\u4e00-\u9fffA-Za-z]{1,8})问我的/gu,
  /(?:女友|前任|对象)([\u4e00-\u9fffA-Za-z]{1,6})/gu,
  /想你[，,:：]\s*([\u4e00-\u9fffA-Za-z]{1,6})/gu,
  /([\u4e00-\u9fffA-Za-z]{1,6})[，,:：]\s*我想你/gu,
]

export interface PersonalAffectionEvidenceScore {
  namedTargets: string[]
  affectionCueHits: number
  explicitConfessionHits: number
  firstPersonHits: number
  targetCueHits: number
  genericPenalty: number
  isGenericAdvice: boolean
  isImaginative: boolean
  score: number
}

export interface PersonalDiscoveryEvidenceScore {
  dimension: PersonalDiscoveryDimension
  namedTargets: string[]
  explicitSignalHits: number
  cueHits: number
  firstPersonHits: number
  targetCueHits: number
  genericPenalty: number
  isGenericAdvice: boolean
  isImaginative: boolean
  score: number
}

type PersonalDiscoverySpec = {
  label: string
  searchTerms: string[]
  strongCues: string[]
  mediumCues: string[]
  genericPatterns: RegExp[]
  keepRequiresFirstPerson?: boolean
}

const PERSONAL_DISCOVERY_SPECS: Record<PersonalDiscoveryDimension, PersonalDiscoverySpec> = {
  affection: {
    label: '人物情感轨迹',
    searchTerms: ['我喜欢你', '我很喜欢你', '我喜欢', '中意', '心动', '上头', '跟我在一起', '在一起交往', '保护你', '想你', '失去你', '追求', '约会', '亲爱的小笨蛋', '女友'],
    strongCues: STRONG_AFFECTION_CUES,
    mediumCues: MEDIUM_AFFECTION_CUES,
    genericPatterns: GENERIC_AFFECTION_PATTERNS,
    keepRequiresFirstPerson: false,
  },
  pattern: {
    label: '行为模式',
    searchTerms: ['模式', '习惯', '总是', '反复', '倾向', '容易', '每次', '长期'],
    strongCues: ['我总是', '我反复', '我每次', '我的习惯', '我的模式', '我一到', '我经常'],
    mediumCues: ['容易', '倾向', '常常', '往往', '总会', '长期'],
    genericPatterns: [/一般人/u, /任何人/u, /这个社会/u],
    keepRequiresFirstPerson: true,
  },
  preference: {
    label: '偏好倾向',
    searchTerms: ['偏好', '喜欢', '不喜欢', '适合', '倾向', '爱用', '偏向'],
    strongCues: ['我喜欢', '我不喜欢', '我偏好', '我倾向于', '适合我'],
    mediumCues: ['喜欢', '不喜欢', '偏向', '爱用', '合适'],
    genericPatterns: [/用户/u, /一般人/u, /任何人/u],
    keepRequiresFirstPerson: true,
  },
  value: {
    label: '价值观与原则',
    searchTerms: ['在乎', '重视', '价值观', '原则', '底线', '信任', '真诚', '长期', '意义'],
    strongCues: ['我在乎', '我重视', '我的价值观', '我的原则', '我的底线'],
    mediumCues: ['信任', '真诚', '长期', '意义', '尊重', '自由'],
    genericPatterns: [/任何人/u, /社会/u, /世界都/u],
    keepRequiresFirstPerson: true,
  },
  motivation: {
    label: '动机与追求',
    searchTerms: ['追求', '目标', '努力', '方向', '想要', '成为', '创造', '野心'],
    strongCues: ['我想要', '我追求', '我想成为', '我为什么努力', '我的目标'],
    mediumCues: ['方向', '努力', '创造', '价值', '目标'],
    genericPatterns: [/任何人/u, /大众/u, /社会/u],
    keepRequiresFirstPerson: true,
  },
  fear: {
    label: '担忧与恐惧',
    searchTerms: ['害怕', '担心', '焦虑', '恐惧', '不安', '怕失去', '忧虑'],
    strongCues: ['我害怕', '我担心', '我焦虑', '我恐惧', '我不安'],
    mediumCues: ['害怕', '担心', '焦虑', '忧虑', '怕失去'],
    genericPatterns: [/任何人/u, /大家都会/u],
    keepRequiresFirstPerson: true,
  },
  strength: {
    label: '优势与强项',
    searchTerms: ['擅长', '优势', '能力', '天赋', '长处', '判断', '耐心', '洞察'],
    strongCues: ['我擅长', '我的优势', '我的强项', '我很会'],
    mediumCues: ['擅长', '优势', '能力', '判断', '耐心', '洞察'],
    genericPatterns: [/一般人/u, /任何人/u],
    keepRequiresFirstPerson: true,
  },
  weakness: {
    label: '弱点与局限',
    searchTerms: ['弱点', '缺点', '问题', '短板', '局限', '毛病', '不足', '容易'],
    strongCues: ['我的问题', '我的弱点', '我的缺点', '我的短板', '我容易'],
    mediumCues: ['弱点', '缺点', '局限', '不足', '问题'],
    genericPatterns: [/一般人/u, /社会/u],
    keepRequiresFirstPerson: true,
  },
}

function normalizeNameCandidate(candidate: string, selfAliases: string[]): string {
  const normalized = candidate
    .trim()
    .replace(/^[“"「『'`]+|[”"」』'`]+$/gu, '')
    .replace(/[，,:：。！？!?~～…]+$/gu, '')
    .trim()

  if (!normalized) return ''
  if (NAME_STOP_WORDS.has(normalized)) return ''
  if (/^(?:的|这|那|其|而|并且|如果|于是|因为|所以|但是|然后|首先|其次|最后|同时|方面|例如|比如|这个|那个|之一|一种|一般|这样|这样子)$/u.test(normalized)) return ''
  if (/^[的这那其而并且如果于是因为所以但是然后首先其次最后同时方面例如比如]/u.test(normalized)) return ''
  if (/[我你他她它们]/u.test(normalized)) return ''
  if (/(?:现在|以前|之后|之前|表现|世界|量子|复杂|时间|梦醒|一起|内在|外在|性格|努力|耐心|魅力)/u.test(normalized)) return ''
  if (selfAliases.includes(normalized)) return ''
  if (normalized.length > 8) return ''
  if (/^[\u4e00-\u9fff]+$/u.test(normalized) && normalized.length > 3 && !normalized.endsWith('宝')) return ''
  if (/^[\u4e00-\u9fff]{2,3}$/u.test(normalized)) {
    const first = normalized[0]
    const looksLikeName = COMMON_SURNAMES.has(first) || normalized.startsWith('阿') || normalized.endsWith('儿') || normalized.endsWith('宝')
    if (!looksLikeName) return ''
  }
  if (normalized.length === 1 && !/^[安莎圆琳芳弘]$/u.test(normalized)) return ''
  return normalized
}

function uniqueStrings(values: string[]): string[] {
  const result: string[] = []
  for (const value of values) {
    if (!value || result.includes(value)) continue
    result.push(value)
  }
  return result
}

export function extractAffectionTargets(title: string, text: string, selfAliases: string[] = []): string[] {
  const combined = `${title}\n${text}`
  const names: string[] = []

  for (const pattern of EXPLICIT_NAME_PATTERNS) {
    for (const match of combined.matchAll(pattern)) {
      const candidate = normalizeNameCandidate(match[1] || '', selfAliases)
      if (candidate) names.push(candidate)
    }
  }

  for (const match of title.matchAll(/[，,:：]\s*([\u4e00-\u9fff]{1,3}(?:宝|儿)?)(?=[\^_~～。！？!?,，]|$)/gu)) {
    const candidate = normalizeNameCandidate(match[1] || '', selfAliases)
    if (candidate) names.push(candidate)
  }

  return uniqueStrings(names)
}

function countCueHits(text: string, cues: string[]): number {
  return cues.reduce((sum, cue) => sum + (countOccurrences(text, cue) > 0 ? 1 : 0), 0)
}

export function scorePersonalAffectionEvidence(
  title: string,
  text: string,
  selfAliases: string[] = [],
): PersonalAffectionEvidenceScore {
  const generic = scorePersonalDiscoveryEvidence('affection', title, text, selfAliases)
  return {
    namedTargets: generic.namedTargets,
    affectionCueHits: generic.cueHits,
    explicitConfessionHits: generic.explicitSignalHits,
    firstPersonHits: generic.firstPersonHits,
    targetCueHits: generic.targetCueHits,
    genericPenalty: generic.genericPenalty,
    isGenericAdvice: generic.isGenericAdvice,
    isImaginative: generic.isImaginative,
    score: generic.score,
  }
}

export function getPersonalDiscoverySpec(dimension: PersonalDiscoveryDimension): PersonalDiscoverySpec {
  return PERSONAL_DISCOVERY_SPECS[dimension]
}

export function scorePersonalDiscoveryEvidence(
  dimension: PersonalDiscoveryDimension,
  title: string,
  text: string,
  selfAliases: string[] = [],
): PersonalDiscoveryEvidenceScore {
  const spec = getPersonalDiscoverySpec(dimension)
  const combined = `${title}\n${text}`
  const namedTargets = dimension === 'affection' ? extractAffectionTargets(title, text, selfAliases) : []
  const explicitSignalHits = countCueHits(combined, spec.strongCues)
  const cueHits = explicitSignalHits + countCueHits(combined, spec.mediumCues)
  const firstPersonHits = countOccurrences(combined, '我') + selfAliases.reduce((sum, alias) => sum + countOccurrences(combined, alias), 0)
  const targetCueHits = countOccurrences(combined, '你') + countOccurrences(combined, '她') + countOccurrences(combined, '他') + namedTargets.length * 2
  const genericPenalty = spec.genericPatterns.reduce((sum, pattern) => sum + (pattern.test(combined) ? 1 : 0), 0)
  const isGenericAdvice = genericPenalty > 0 && namedTargets.length === 0 && explicitSignalHits === 0 && firstPersonHits === 0
  const isImaginative = IMAGINATIVE_PATTERNS.some(pattern => pattern.test(combined))

  let score = 0
  score += explicitSignalHits * 26
  score += cueHits * 7
  score += namedTargets.length * 32
  score += Math.min(firstPersonHits, 6) * (dimension === 'affection' ? 2 : 4)
  score += Math.min(targetCueHits, 6) * 2
  if (isImaginative && namedTargets.length > 0) score += 6
  if (isImaginative && namedTargets.length === 0) score -= 8
  if (isGenericAdvice) score -= 28
  else score -= genericPenalty * 10

  return {
    dimension,
    namedTargets,
    explicitSignalHits,
    cueHits,
    firstPersonHits,
    targetCueHits,
    genericPenalty,
    isGenericAdvice,
    isImaginative,
    score,
  }
}

export function rankPersonalDiscoveryItems<T>(
  items: T[],
  dimension: PersonalDiscoveryDimension,
  options: {
    getTitle: (item: T) => string
    getText: (item: T) => string
    getSearchScore?: (item: T) => number
    selfAliases?: string[]
  },
): Array<T & { discoveryScore: PersonalDiscoveryEvidenceScore; rankScore: number }> {
  const selfAliases = (options.selfAliases || []).map(alias => alias.trim()).filter(Boolean)
  const spec = getPersonalDiscoverySpec(dimension)

  const scored = items.map(item => {
    const discoveryScore = scorePersonalDiscoveryEvidence(
      dimension,
      options.getTitle(item) || '',
      options.getText(item) || '',
      selfAliases,
    )

    return {
      ...item,
      discoveryScore,
      rankScore: discoveryScore.score + (options.getSearchScore?.(item) ?? 0) * 0.12,
    }
  })

  return scored
    .filter(item => {
      if (item.discoveryScore.isGenericAdvice) return false
      if (spec.keepRequiresFirstPerson && item.discoveryScore.firstPersonHits === 0) return false
      if (item.discoveryScore.explicitSignalHits > 0) return true
      if (dimension === 'affection' && item.discoveryScore.namedTargets.length > 0 && item.discoveryScore.cueHits > 0) return true
      return item.discoveryScore.score >= 18
    })
    .sort((a, b) => b.rankScore - a.rankScore)
}

export function rankPersonalAffectionItems<T>(
  items: T[],
  options: {
    getTitle: (item: T) => string
    getText: (item: T) => string
    getSearchScore?: (item: T) => number
    selfAliases?: string[]
  },
): Array<T & { affectionScore: PersonalAffectionEvidenceScore; rankScore: number }> {
  return rankPersonalDiscoveryItems(items, 'affection', options).map(item => ({
    ...item,
    affectionScore: {
      namedTargets: item.discoveryScore.namedTargets,
      affectionCueHits: item.discoveryScore.cueHits,
      explicitConfessionHits: item.discoveryScore.explicitSignalHits,
      firstPersonHits: item.discoveryScore.firstPersonHits,
      targetCueHits: item.discoveryScore.targetCueHits,
      genericPenalty: item.discoveryScore.genericPenalty,
      isGenericAdvice: item.discoveryScore.isGenericAdvice,
      isImaginative: item.discoveryScore.isImaginative,
      score: item.discoveryScore.score,
    },
  }))
}
