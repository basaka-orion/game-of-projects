import { UI_STYLE_ITEMS } from './catalog'
import { createFusionVisual, latestStyleEvolutionEvents, loadUiMuseumState } from './state'
import type { UiFusionResult, UiStyleItem, UiVisualTokens } from './types'

export interface UiMuseumPrdContext {
  styleIds: string[]
  styleNames: string[]
  reasoning: string
  visual: UiVisualTokens
  platformNotes: {
    web: string
    ios: string
    mac: string
    android: string
    mini: string
  }
  componentStates: string[]
  acceptanceChecklist: string[]
  evolutionNotes: string[]
  savedFusionName?: string
  savedFusionPrompt?: string
  promptFragment: string
}

const intentRules: Array<{ keywords: string[]; styleIds: string[]; reason: string }> = [
  {
    keywords: ['ai', 'agent', '智能体', '副驾驶', '自动化', 'workflow', '工作流', '编程', '代码', 'copilot'],
    styleIds: ['agentic-os', 'copilot-ai', 'ai-abstract', 'spatial'],
    reason: '项目带有 AI/智能体/自动化气质，需要把任务流、状态感和执行反馈可视化。',
  },
  {
    keywords: ['知识', 'wiki', '笔记', '阅读', '学习', '研究', '资料', '文档', '大佬', '方法论'],
    styleIds: ['anthropic-serif', 'data-ink', 'wabi-sabi', 'minimal'],
    reason: '项目偏知识与深度阅读，需要安静但有辨识度的信息架构。',
  },
  {
    keywords: ['小白', '新手', '陪伴', '情绪', '心理', '疗愈', '日记', '宠物', '儿童'],
    styleIds: ['emotion-adaptive', 'ethereal', 'digicute', 'natural'],
    reason: '项目偏陪伴与低门槛使用，需要温和、低压、状态可感知的界面。',
  },
  {
    keywords: ['金融', '数据', '指标', '仪表盘', '交易', '安全', '风控', '保险', '银行'],
    styleIds: ['data-ink', 'skeuo-stone', 'minimal', 'blueprint-cad'],
    reason: '项目偏数据和可信决策，需要高可读性、克制密度和强状态对比。',
  },
  {
    keywords: ['游戏', '玩法', '电竞', '社区', '潮流', '音乐', '活动', '年轻'],
    styleIds: ['hyper-brutalism', 'pixel', 'cyber', 'kinetic'],
    reason: '项目需要更强记忆点和动势反馈，适合使用高能视觉和明确交互节奏。',
  },
  {
    keywords: ['工业', '硬件', '设备', 'cad', '建筑', '制造', '参数', '工程'],
    styleIds: ['blueprint-cad', 'microind', 'blueprint', 'data-ink'],
    reason: '项目偏工程控制，需要参数化、测量感和精密仪器式层级。',
  },
  {
    keywords: ['环保', '社区', '公益', '农业', '自然', '健康', '可持续'],
    styleIds: ['solarpunk-utopia', 'solar', 'natural', 'skeuo-nature'],
    reason: '项目需要自然、慢技术和社区信任感，适合低压绿色系与自然材质。',
  },
  {
    keywords: ['创意', '艺术', '设计', '展览', '作品集', '品牌', '杂志', '视觉'],
    styleIds: ['holographic', 'risograph', 'kinetic', 'personal'],
    reason: '项目偏创意表达，需要把品牌个性和视觉资产生产能力前置。',
  },
  {
    keywords: ['ios', 'mac', 'macos', '空间', 'vision', '桌面', '窗口'],
    styleIds: ['liquid-glass', 'spatial', 'quantum-glass', 'bento'],
    reason: '项目偏 Apple/桌面/空间体验，需要层次、材质、窗口和聚焦状态。',
  },
  {
    keywords: ['android', 'google', '移动', '手机'],
    styleIds: ['material', 'bento', 'freshretro', 'zero-ui'],
    reason: '项目偏移动端，需要动态色、清晰触控状态和轻量级组件系统。',
  },
]

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ')
}

function styleName(item: UiStyleItem): string {
  return item.title.replace(/^\d+\.\s*/, '')
}

function scoreStyle(item: UiStyleItem, normalizedInput: string): number {
  let score = item.tier === 'T0' ? 4 : item.tier === 'T1' ? 3 : item.tier === 'T2' ? 2 : 1
  const searchable = normalizeText(`${item.id} ${item.title} ${item.description} ${item.application} ${item.visual.motif} ${item.visual.pattern}`)

  for (const rule of intentRules) {
    if (!rule.keywords.some((keyword) => normalizedInput.includes(keyword.toLowerCase()))) continue
    if (rule.styleIds.includes(item.id)) score += 14
    if (rule.styleIds.some((id) => searchable.includes(id))) score += 4
  }

  const directTerms = [
    item.id,
    item.visual.pattern,
    ...item.title.split(/[\s()（）:：/-]+/),
    ...item.application.split(/[、，,。\s]+/),
  ].filter((term) => term.length >= 2)

  for (const term of directTerms) {
    if (normalizedInput.includes(term.toLowerCase())) score += 5
  }

  return score
}

function selectedReasoning(input: string, styles: UiStyleItem[]): string {
  const normalized = normalizeText(input)
  const matchedRules = intentRules.filter((rule) => rule.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())))
  const reasons = matchedRules.map((rule) => rule.reason)
  if (reasons.length > 0) return Array.from(new Set(reasons)).slice(0, 2).join(' ')
  return `自动从 UI 风格馆选取 ${styles.map(styleName).join('、')}，用于建立项目第一版视觉气质、组件状态和验收标准。`
}

function loadRelevantSavedFusion(styleIds: string[], input: string): UiFusionResult | null {
  const normalizedInput = normalizeText(input)
  const state = loadUiMuseumState()
  const candidates = state.savedFusions
    .map((fusion) => {
      const overlap = fusion.parentStyleIds.filter((id) => styleIds.includes(id)).length
      const textMatch = normalizeText(`${fusion.name} ${fusion.description} ${fusion.parentStyles.join(' ')}`)
        .split(/\s+/)
        .filter((term) => term.length >= 2)
        .some((term) => normalizedInput.includes(term))
      return { fusion, score: overlap * 10 + (textMatch ? 5 : 0) }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)

  return candidates[0]?.fusion || null
}

function buildPromptFragment(params: {
  styles: UiStyleItem[]
  reasoning: string
  visual: UiVisualTokens
  platformNotes: UiMuseumPrdContext['platformNotes']
  componentStates: string[]
  acceptanceChecklist: string[]
  evolutionNotes: string[]
  savedFusion?: UiFusionResult | null
}): string {
  const names = params.styles.map(styleName)
  return [
    '## UI风格馆自动视觉输入',
    `- 自动选中风格：${names.join(' / ')}。`,
    params.savedFusion ? `- 优先复用已保存融合：${params.savedFusion.name}。` : '',
    `- 选择理由：${params.reasoning}`,
    `- 色彩与材质：${params.visual.palette.join('、')}；背景 ${params.visual.background}；界面层 ${params.visual.surface}；强调色 ${params.visual.accent}。`,
    `- 组件规则：半径 ${params.visual.radius}；阴影 ${params.visual.shadow}；字体 ${params.visual.typography}；密度 ${params.visual.density}；动效 ${params.visual.motion}。`,
    `- Web 落地：${params.platformNotes.web}`,
    `- iOS 落地：${params.platformNotes.ios}`,
    `- macOS 落地：${params.platformNotes.mac}`,
    `- Android 落地：${params.platformNotes.android}`,
    `- 小程序落地：${params.platformNotes.mini}`,
    `- 组件状态清单：${params.componentStates.join('；')}`,
    `- 视觉验收清单：${params.acceptanceChecklist.join('；')}`,
    params.evolutionNotes.length > 0
      ? `- OpenBasaka 自进化轨迹：${params.evolutionNotes.join('；')}`
      : '- OpenBasaka 自进化规则：生成后要复盘视觉是否真正落到平台骨架、组件状态、动效降级和下游 PRD/工作流验收；下一轮必须继承有效 token 并修正偏差。',
    '- 生成 PRD、工作流、定时任务或群策产物时，必须把这套风格转成信息架构、页面层级、组件状态、空态/加载/失败态、动效节奏和截图验收标准；若偏离，需要说明原因。',
    params.savedFusion?.prompt ? `- 已保存融合 Prompt：${params.savedFusion.prompt}` : '',
  ].filter(Boolean).join('\n')
}

function buildPlatformNotes(styles: UiStyleItem[]): UiMuseumPrdContext['platformNotes'] {
  return {
    web: styles.map((style) => `${styleName(style)}：${style.web}`).join('\n'),
    ios: styles.map((style) => `${styleName(style)}：${style.ios}`).join('\n'),
    mac: styles.map((style) => `${styleName(style)}：${style.mac || 'macOS 版必须使用 Toolbar、Sidebar/Split View、Inspector、键盘焦点和窗口状态承接桌面效率。'}`).join('\n'),
    android: styles.map((style) => `${styleName(style)}：${style.android}`).join('\n'),
    mini: styles.map((style) => `${styleName(style)}：${style.mini}`).join('\n'),
  }
}

function buildComponentStates(styles: UiStyleItem[], visual: UiVisualTokens): string[] {
  const names = styles.map(styleName).join(' / ')
  return [
    `导航/信息架构必须显露 ${names} 的第一视觉信号`,
    `主按钮、次按钮、hover、pressed、focus、disabled 使用 ${visual.accent} 和 ${visual.border} 成套定义`,
    `输入框、选择器、滑杆、开关必须有 ${visual.motion} 的反馈节奏`,
    `卡片、空态、加载态、成功态、失败态必须沿用 ${visual.texture} 材质和 ${visual.density} 信息密度`,
  ]
}

function buildAcceptanceChecklist(styles: UiStyleItem[], visual: UiVisualTokens): string[] {
  return [
    `截图验收能一眼识别 ${styles.map(styleName).join(' / ')}，不能退化成通用模板`,
    `调色板只从 ${visual.palette.join(' / ')} 派生，额外颜色必须有状态语义`,
    `组件半径 ${visual.radius}、阴影 ${visual.shadow}、字体 ${visual.typography} 在 Web/iOS/Android/小程序规格中一致`,
    '交付物必须写明真实互动状态、响应式断点和动效降级方案',
  ]
}

export function buildUiMuseumPrdContext(input: string, preferredStyleIds: string[] = []): UiMuseumPrdContext {
  const normalizedInput = normalizeText(input)
  const preferred = preferredStyleIds
    .map((id) => UI_STYLE_ITEMS.find((item) => item.id === id))
    .filter(Boolean) as UiStyleItem[]

  const ranked = UI_STYLE_ITEMS
    .map((style) => ({ style, score: scoreStyle(style, normalizedInput) }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.style)

  const styles = Array.from(new Map([...preferred, ...ranked].map((style) => [style.id, style])).values()).slice(0, 3)
  const reasoning = selectedReasoning(input, styles)
  const savedFusion = loadRelevantSavedFusion(styles.map((style) => style.id), input)
  const visual = savedFusion?.visual || createFusionVisual(styles, styles.map(styleName).join(' x '))
  const platformNotes = buildPlatformNotes(styles)
  const componentStates = buildComponentStates(styles, visual)
  const acceptanceChecklist = buildAcceptanceChecklist(styles, visual)
  const state = loadUiMuseumState()
  const evolutionNotes = latestStyleEvolutionEvents(state, styles.map((style) => style.id), savedFusion?.id)
    .map((event) => `${event.targetName} G${event.generation}: ${event.critique} ${event.promptPatch}`)
  const promptFragment = buildPromptFragment({ styles, reasoning, visual, platformNotes, componentStates, acceptanceChecklist, evolutionNotes, savedFusion })

  return {
    styleIds: styles.map((style) => style.id),
    styleNames: styles.map(styleName),
    reasoning,
    visual,
    platformNotes,
    componentStates,
    acceptanceChecklist,
    evolutionNotes,
    savedFusionName: savedFusion?.name,
    savedFusionPrompt: savedFusion?.prompt,
    promptFragment,
  }
}
