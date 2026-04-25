export type QimengWing =
  | 'identity'
  | 'worldview'
  | 'method'
  | 'creation'
  | 'dialogue'
  | 'profiling'
  | 'wishes'
  | 'openbasaka'

export type QimengHall =
  | 'identity'
  | 'consciousness'
  | 'creative'
  | 'technical'
  | 'memory'
  | 'emotions'
  | 'family'

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

export interface QimengClassification {
  title: string
  wing: QimengWing
  wingLabel: string
  hall: QimengHall
  hallLabel: string
  room: string
  tags: string[]
  facets: QimengFacet[]
  rationale: string
  confidence: number
  matchedSignals: string[]
}

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
  system: [/openbasaka/i, /basaka/i, /记忆宫殿/, /启蒙/, /知识库/, /mcp/i, /skill/i, /agent/i, /智能系统/, /归档/, /drawer/i],
  profiling: [/画像/, /测评/, /人格/, /认知方式/, /阶段信号/, /测试/, /性格/, /天赋/, /优势/, /倾向/],
  project: [/项目/, /创意/, /灵感/, /原型/, /产品/, /应用/, /功能/, /界面/, /作品/, /构想/, /创业/, /实验/],
  method: [/方法/, /框架/, /流程/, /步骤/, /原则/, /策略/, /工作流/, /思考法/, /学习法/, /prompt/i, /模型/, /系统化/, /第一原理/],
  identity: [/我想/, /我相信/, /我是/, /我喜欢/, /我不喜欢/, /价值观/, /偏好/, /习惯/, /长期主义/, /人生/, /自我/],
  worldview: [/世界/, /社会/, /文明/, /时代/, /科技趋势/, /系统性/, /未来/, /关系本质/, /政治/, /经济/, /意识/],
  wish: [/希望/, /想要/, /愿望/, /未完成/, /终有一天/, /一直想/, /执念/, /召唤/],
  family: [/家人/, /家庭/, /父母/, /母亲/, /父亲/, /亲密关系/, /伴侣/, /朋友/, /关系线/],
  emotion: [/感受/, /情绪/, /痛苦/, /焦虑/, /开心/, /兴奋/, /疲惫/, /渴望/, /恐惧/, /喜欢/, /厌恶/],
  memory: [/曾经/, /过去/, /那年/, /以前/, /小时候/, /当时/, /一路/, /经历/, /记录/, /回忆/, /十年/, /编年体/],
  question: [/[?？]/, /为什么/, /如何/, /怎么办/, /能不能/, /是否/],
  decision: [/决定/, /先做/, /必须/, /应该/, /优先/, /路线图/, /接下来/, /开始/, /执行/],
  discovery: [/发现/, /意识到/, /原来/, /其实/, /终于明白/, /顿悟/, /看清/, /领悟/],
  technical: [/架构/, /工程/, /代码/, /数据库/, /接口/, /部署/, /前端/, /后端/, /schema/i, /typescript/i, /react/i, /技术/],
}

function containsAny(text: string, rules: RegExp[]): boolean {
  return rules.some(rule => rule.test(text))
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function normalizeContent(content: string): string {
  return content
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildTitle(content: string): string {
  const firstLine = content
    .split('\n')
    .map(line => line.trim())
    .find(Boolean) || content
  const clean = firstLine.replace(/[*_`>#-]/g, '').trim()
  if (clean.length <= 36) return clean
  return `${clean.slice(0, 36)}…`
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
    return /项目|产品|系统|应用|计划|方案|实验/.test(text)
      ? '项目-构想推进'
      : '创作-灵感草图'
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
  matchedSignals: string[],
): string {
  const reasonMap: Record<string, string> = {
    system: '命中个人智能系统/记忆宫殿语义',
    profiling: '命中画像工坊/认知测评语义',
    project: '命中项目/创意语义',
    method: '命中方法论/流程语义',
    identity: '带有自我认知或偏好信号',
    worldview: '带有世界模型或时代判断信号',
    wish: '包含愿望或未竟召唤',
    memory: '包含回忆或阶段线索',
    family: '涉及重要关系线',
    emotion: '包含情绪与感受信号',
    technical: '包含结构与技术信号',
    question: '带有问题意识',
    discovery: '带有认知发现信号',
    decision: '带有决策或推进信号',
  }

  const summary = matchedSignals
    .map(signal => reasonMap[signal])
    .filter(Boolean)
    .slice(0, 3)
    .join('，') || '命中长期记忆阈值'

  return `${summary}，建议归入 ${WING_META[wing].label} / ${HALL_META[hall].label} / ${room}`
}

export function classifyQimengText(params: {
  title?: string
  content: string
  agentRole?: string
}): QimengClassification {
  const text = normalizeContent(`${params.title || ''}\n${params.content}`)
  const signals = collectSignals(text, params.agentRole)
  const hall = inferHall(signals)
  const wing = inferWing(hall, signals)
  const room = inferRoom(wing, hall, text)
  const facets = inferFacets(text, signals)
  const title = (params.title || '').trim() || buildTitle(params.content)
  const matchedSignals = Object.entries(signals)
    .filter(([, matched]) => matched)
    .map(([signal]) => signal)
  const confidence = Math.min(
    0.95,
    0.3
      + Math.min(matchedSignals.length, 5) * 0.11
      + (params.title ? 0.06 : 0)
      + (facets.length > 1 ? 0.05 : 0),
  )
  const rationale = buildRationale(wing, hall, room, matchedSignals)
  const tags = uniqueStrings([
    WING_META[wing].label,
    HALL_META[hall].label,
    room,
    params.agentRole && params.agentRole !== 'general' ? params.agentRole : '',
    ...facets.slice(0, 2),
  ])

  return {
    title,
    wing,
    wingLabel: WING_META[wing].label,
    hall,
    hallLabel: HALL_META[hall].label,
    room,
    tags,
    facets,
    rationale,
    confidence,
    matchedSignals,
  }
}

export function formatQimengPath(candidate: Pick<QimengClassification, 'wingLabel' | 'hallLabel' | 'room'>): string {
  return `${candidate.wingLabel} / ${candidate.hallLabel} / ${candidate.room}`
}
