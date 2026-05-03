import type { UiFusionResult, UiMuseumState, UiProjectPrd, UiStyleEvolutionEvent, UiStyleItem, UiVisualTokens } from './types'

export const UI_MUSEUM_STORAGE_KEY = 'openbasaka-ui-museum-state-v1'

export function createUiId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function loadUiMuseumState(): UiMuseumState {
  if (typeof window === 'undefined') return { savedFusions: [], savedProjects: [], styleEvolutionEvents: [] }
  try {
    const raw = window.localStorage.getItem(UI_MUSEUM_STORAGE_KEY)
    if (!raw) return { savedFusions: [], savedProjects: [], styleEvolutionEvents: [] }
    const parsed = JSON.parse(raw) as Partial<UiMuseumState>
    return {
      savedFusions: Array.isArray(parsed.savedFusions) ? parsed.savedFusions : [],
      savedProjects: Array.isArray(parsed.savedProjects) ? parsed.savedProjects : [],
      styleEvolutionEvents: Array.isArray(parsed.styleEvolutionEvents) ? parsed.styleEvolutionEvents : [],
    }
  } catch {
    return { savedFusions: [], savedProjects: [], styleEvolutionEvents: [] }
  }
}

export function saveUiMuseumState(state: UiMuseumState) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(UI_MUSEUM_STORAGE_KEY, JSON.stringify(state))
}

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

function styleName(item: UiStyleItem): string {
  return item.title.replace(/^\d+\.\s*/, '')
}

function platformImpactFor(result: UiFusionResult): UiStyleEvolutionEvent['platformImpact'] {
  return {
    web: `把 ${result.name} 的色彩、字体、布局节奏和组件状态写成 CSS token；首屏、导航、按钮、表单、卡片和反馈态必须同源。`,
    ios: `保留 ${result.name} 的视觉识别，但使用 NavigationStack、TabView、Sheet、系统触感和 Dynamic Type 语法重建。`,
    mac: `保留 ${result.name} 的视觉识别，但以 Toolbar、Sidebar/Split View、Inspector、键盘焦点和菜单命令承接桌面效率。`,
    android: `保留 ${result.name} 的视觉识别，但用 Material 3 的 TopAppBar、NavigationBar/Rail、FAB、Card、TextField 和状态层重建。`,
    mini: `保留 ${result.name} 的视觉识别，但遵守固定顶部导航、胶囊菜单、返回/关闭、tabBar 和底部菜单的轻量交互边界。`,
  }
}

export function createStyleEvolutionEvent(
  result: UiFusionResult,
  sourceStyles: UiStyleItem[],
  trigger: UiStyleEvolutionEvent['trigger'] = sourceStyles.length > 1 ? 'fusion' : 'single-style',
  existingEvents: UiStyleEvolutionEvent[] = [],
): UiStyleEvolutionEvent {
  const sourceNames = sourceStyles.map(styleName)
  const previous = existingEvents
    .filter((event) => event.targetId === result.id || event.sourceStyleIds.some((id) => result.parentStyleIds.includes(id)))
    .sort((a, b) => b.createdAt - a.createdAt)[0]
  const generation = (previous?.generation || 0) + 1
  const patternList = uniq(sourceStyles.map((item) => item.visual.pattern)).join(' / ') || result.visual.pattern
  const improvements = [
    `锁定视觉 DNA：${sourceNames.join(' + ') || result.name} 的 ${patternList} 不再只换颜色，必须同时影响排版、组件形状、状态反馈和平台结构。`,
    `修正平台落差：Web/iOS/macOS/Android/小程序共用 token，但各自使用原生导航、输入、弹层、列表和反馈语法。`,
    `增加验收门槛：卡片预览、详情大预览、真实平台预览、PRD、工作流、定时和群策输出必须能互相追溯同一套 token。`,
    `保留可降级方案：复杂光效、动势或 3D 在低性能/小程序中降级为色块、材质、轻动效和静态骨架，不允许失真成通用模板。`,
  ]

  return {
    id: createUiId('style_evolution'),
    targetId: result.id,
    targetName: result.name,
    sourceStyleIds: result.parentStyleIds,
    sourceStyleNames: sourceNames.length > 0 ? sourceNames : result.parentStyles,
    generation,
    trigger,
    critique:
      generation === 1
        ? `OpenBasaka 第 ${generation} 代自进化：先把融合结果从“灵感描述”升级为可执行的视觉系统。`
        : `OpenBasaka 第 ${generation} 代自进化：基于上一轮风格记忆继续收敛平台一致性、可读性和组件状态。`,
    improvements,
    platformImpact: platformImpactFor(result),
    promptPatch: [
      `自进化代际：G${generation}`,
      `父风格：${sourceNames.join(' / ') || result.parentStyles.join(' / ')}`,
      `下一轮生成时必须先继承 palette=${result.visual.palette.join(' / ')}、typography=${result.visual.typography}、texture=${result.visual.texture}、motion=${result.visual.motion}。`,
      '再根据目标平台重建信息架构和交互控件；禁止只复用一张 Web 截图或只套同一组件。',
    ].join('\n'),
    createdAt: Date.now(),
  }
}

export function latestStyleEvolutionEvents(state: UiMuseumState, styleIds: string[], targetId?: string): UiStyleEvolutionEvent[] {
  const ids = new Set(styleIds)
  return (state.styleEvolutionEvents || [])
    .filter((event) => event.targetId === targetId || event.sourceStyleIds.some((id) => ids.has(id)))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 3)
}

export function createFusionVisual(styles: UiStyleItem[], name = 'Hybrid Canvas'): UiVisualTokens {
  const visuals = styles.map((item) => item.visual)
  const palette = uniq(visuals.flatMap((visual) => visual.palette)).slice(0, 5)
  const primary = palette[0] || '#09090f'
  const accent = palette[1] || '#8b5cf6'
  const secondary = palette[2] || '#2dd4bf'
  const light = palette[3] || '#f8fafc'
  const hasBrutal = visuals.some((visual) => visual.pattern === 'brutal')
  const hasGlass = visuals.some((visual) => visual.pattern === 'glass' || visual.pattern === 'prismatic' || visual.pattern === 'spatial')
  const hasRetro = visuals.some((visual) => visual.texture === 'scanline')

  return {
    palette: [primary, accent, secondary, light, palette[4] || '#f59e0b'],
    background: `radial-gradient(circle at 18% 16%, ${accent}88, transparent 28%), radial-gradient(circle at 82% 72%, ${secondary}72, transparent 30%), linear-gradient(135deg, ${primary}, ${palette[4] || '#111827'})`,
    surface: hasGlass ? 'rgba(255,255,255,0.18)' : hasBrutal ? light : 'rgba(255,255,255,0.12)',
    text: hasBrutal ? '#050505' : light,
    accent,
    border: hasBrutal ? '#050505' : `${secondary}cc`,
    radius: hasBrutal ? '0px' : hasGlass ? '30px' : '18px',
    shadow: hasBrutal ? `16px 16px 0 ${secondary}` : `0 32px 90px ${accent}55`,
    pattern: 'fusion',
    density: visuals.some((visual) => visual.density === 'chaotic') ? 'chaotic' : 'balanced',
    typography: uniq(visuals.map((visual) => visual.typography)).join(' + ') || 'display',
    motif: `${name} · ${visuals.map((visual) => visual.motif).slice(0, 3).join(' / ')}`,
    texture: hasRetro ? 'scanline' : hasGlass ? 'refraction' : 'hybrid',
    motion: uniq(visuals.map((visual) => visual.motion)).slice(0, 2).join(' + ') || 'breathing',
  }
}

export function createLocalFusion(styles: UiStyleItem[]): UiFusionResult {
  const names = styles.map((item) => item.title.replace(/^\d+\.\s*/, ''))
  const accent = styles[0]?.id || 'fusion'
  const second = styles[1]?.id || accent
  const visual = createFusionVisual(styles, names.join(' × '))
  return {
    id: createUiId('fusion'),
    name: `${names.map((name) => name.split(' ')[0]).join(' × ')} Hybrid`,
    description: `融合 ${names.join('、')}，保留每个风格的视觉 DNA，同时收敛成一套可复用的产品界面语言。`,
    parentStyleIds: styles.map((item) => item.id),
    parentStyles: names,
    specs: {
      radius: styles.map((item) => item.specs.radius).join(' / '),
      shadow: styles.map((item) => item.specs.shadow).join(' + '),
      font: styles.map((item) => item.specs.font).join(' + '),
      colors: styles.map((item) => item.specs.colors).join(' + '),
    },
    visual,
    web: 'Web 版本使用 CSS 变量抽取色彩、半径、材质、阴影和动效节奏；所有组件要有 hover/focus/disabled 状态。',
    ios: 'iOS 版本用 SwiftUI 材质、matchedGeometryEffect、symbol 图标和触感反馈承接核心视觉。',
    mac: 'macOS 版本用 Toolbar + Sidebar/Split View + Inspector 承接桌面效率，保留键盘焦点、菜单命令、窗口状态和可扫描的信息密度。',
    android: 'Android 版本用 Compose、动态色、Shadow/Brush/RenderEffect 组合，并保留低性能降级。',
    mini: '小程序版本减少重滤镜，保留色块、排版、卡片拓扑和关键动效。',
    prompt: `请以 ${names.join(' + ')} 为视觉 DNA，设计一个真实产品界面。必须避免模板化后台，使用 ${accent} 与 ${second} 的视觉特征构建完整组件状态。`,
    createdAt: Date.now(),
    generatedBy: 'local',
  }
}

export function createLocalProjectPrd(idea: string, styles: UiStyleItem[]): UiProjectPrd {
  const selected = styles.slice(0, 3)
  const styleNames = selected.map((item) => item.title.replace(/^\d+\.\s*/, ''))
  const title = inferProjectTitle(idea)
  const visual = createFusionVisual(selected, title)
  return {
    id: createUiId('project'),
    title,
    userIdea: idea,
    elevatorPitch: `${title} 是一个把“想法”直接推进到可设计、可开发、可验证界面的产品工作台。它先选定视觉策略，再输出功能、原型和技术蓝图。`,
    targetAudience: '有产品想法但需要快速形成高审美 UI、PRD 和工程拆解的创作者、独立开发者和小团队。',
    researchReport:
      '本地模式调研结论：同类工具最大问题是只给模板或只给灵感，不能把视觉风格、产品功能、工程路径和验证标准连成闭环。本方案以风格博物馆为输入，把审美选择转成可执行 PRD。',
    teamBrainstorming: [
      {
        role: 'CPO',
        name: 'Steve',
        focus: '差异化与用户动机',
        opinion: '用户不是缺页面，而是缺一个能把想法变成可验证产品判断的系统。入口必须让人马上看到风格选择如何改变产品命运。',
      },
      {
        role: 'CTO',
        name: 'Linus',
        focus: '架构和可交付',
        opinion: '不要把视觉当装饰。风格、组件、数据模型、API 和验证命令要绑定，否则只是漂亮截图。',
      },
      {
        role: 'Design Director',
        name: 'Jony',
        focus: '反模板设计',
        opinion: `拒绝标准 Navbar + Sidebar。视觉应融合 ${styleNames.join('、') || 'T0 风格'}，让第一屏就有不可替代的识别度。`,
      },
    ],
    visualStyleFusion: {
      styleIds: selected.map((item) => item.id),
      reasoning: `选择 ${styleNames.join('、') || 'T0 Avant-Garde'}，因为它们能同时提供识别度、情绪张力和可工程化的组件规则。`,
      colorPalette: visual.palette,
      visual,
    },
    features: [
      { name: '风格选择器', description: '把 UI 风格从抽象偏好变成可对比的视觉 DNA。', priority: 'P0' },
      { name: '融合实验室', description: '选择 2-3 个风格并生成新视觉语言。', priority: 'P0' },
      { name: 'PRD 生成器', description: '把想法转成产品定义、功能优先级、技术栈和数据库/API 草案。', priority: 'P0' },
      { name: '设计修订回路', description: '对预览原型继续下达修改指令，形成可迭代设计室。', priority: 'P1' },
    ],
    techStack: {
      frontend: 'React + TypeScript + CSS Modules / Tailwind tokens',
      backend: 'OpenAI-compatible LLM gateway with local fallback',
      database: 'SQLite / localStorage for drafts and style collections',
      infrastructure: 'Electron local-first runtime, optional Vercel web deployment',
    },
    databaseSchema: 'projects(id, title, idea, style_ids_json, prd_json, created_at)\nfusions(id, parent_style_ids_json, fusion_json, created_at)',
    apiEndpoints: 'POST /api/fuse-styles\nPOST /api/generate-project-prd\nPOST /api/modify-preview',
    prdManual: buildProjectManual(title, idea, styleNames),
    createdAt: Date.now(),
    generatedBy: 'local',
  }
}

function inferProjectTitle(idea: string): string {
  const clean = idea.trim().replace(/[，。,.!?！？]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 8).join(' ')
  return clean ? `${clean} · Genesis PRD` : 'Untitled Genesis PRD'
}

function buildProjectManual(title: string, idea: string, styleNames: string[]): string {
  return `# ${title}

## 原始想法

${idea}

## 视觉策略

${styleNames.length > 0 ? styleNames.map((name) => `- ${name}`).join('\n') : '- 从 T0/T1 风格中选择最能表达产品灵魂的组合。'}

## MVP

1. 明确目标用户和首个可验证场景。
2. 建立一个可被用户操作的第一屏，而不是营销页。
3. 输出 PRD、原型、数据库/API 草案和验收标准。

## 验收标准

- 用户能在 30 秒内看懂产品做什么。
- UI 风格不是皮肤，而是影响信息架构、交互反馈和组件规则。
- 工程团队能按文档拆出第一版任务。`
}
