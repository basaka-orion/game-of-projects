import type { UiStyleItem, UiStyleSpec, UiVisualPattern, UiVisualTokens } from './types'

const tierSpecs: Record<string, UiStyleSpec> = {
  T0: {
    radius: 'Fluid / Experimental / 16px-40px',
    shadow: 'Dynamic light, glow, refraction, or high-contrast depth',
    font: 'Variable Sans / Editorial Serif / Mono accents',
    colors: 'Avant-garde palette with one signature accent',
  },
  T1: {
    radius: '8px-24px',
    shadow: 'Expressive but production-safe depth',
    font: 'Strong sans with brand accents',
    colors: 'High-recognition palette, tuned by brand',
  },
  T2: {
    radius: '12px-28px',
    shadow: 'Stylized tactile shadow',
    font: 'Retro, rounded, or technical display',
    colors: 'Genre palette with clear interaction states',
  },
  T3: {
    radius: 'Style-defined',
    shadow: 'Classic material or print logic',
    font: 'Historically grounded type system',
    colors: 'Tightly constrained classic palette',
  },
}

const rows: Array<[string, UiStyleItem['tier'], string, string, string]> = [
  ['neuro-morphic', 'T0', 'Neuro-morphic (神经拟态)', '2026 趋势：生物反馈、呼吸感、有机流体形态。', '脑机接口、冥想疗愈、次世代健康管理。'],
  ['quantum-glass', 'T0', 'Quantum Glass (量子玻璃)', '2026 趋势：色散折射、次表面散射、物理级光学。', '顶级 AI 平台、空间计算 OS、奢侈品数字展厅。'],
  ['ambient-aura', 'T0', 'Ambient Aura (环境氛围)', '2026 趋势：去边框化、光影数据化、极致融合。', '智能家居中枢、沉浸式阅读、氛围音乐 App。'],
  ['hyper-brutalism', 'T0', 'Hyper-Brutalism (超粗野主义)', '2026 趋势：3D 物理块、破坏性排版、高能交互。', '独立游戏、潮流电商、青年文化社区。'],
  ['copilot-ai', 'T0', 'Copilot AI (AI副驾驶)', '流式思维链、智能体状态、自主执行面板。', 'AI 编程助手、Copilot UI、智能体工作流。'],
  ['zero-ui', 'T0', 'Zero UI (零界面)', '环境计算、上下文感知、隐身式交互。', 'IoT 中枢、智慧空间、无感支付。'],
  ['data-ink', 'T0', 'Data Ink (数据墨水)', 'Tufte 极简哲学，最大化数据-墨水比。', '金融终端、科研仪表板、彭博风格。'],
  ['emotion-adaptive', 'T0', 'Emotion Adaptive (情绪自适应)', '交互感知、色温渐变、脉搏反馈。', '心理健康、情绪日记、治愈系社交。'],
  ['agentic-os', 'T0', 'Agentic OS (智能体OS)', '多 Agent 编排、任务流可视化、自主执行。', 'AI 操作系统、自动化平台、企业级 Agent。'],
  ['wabi-sabi', 'T0', 'Wabi-Sabi Digital (数字侘寂)', '不完美之美、自然衰变纹理、极致克制。', '茶道、冥想空间、设计师博客、美学社区。'],
  ['chromium', 'T0', 'Chromium Liquid (液态铬金)', '液态金属、反射材质、哥特未来主义。', '3D 艺术家、潮流品牌、Web3 官网。'],
  ['kinetic', 'T0', 'Kinetic Type (动势排印)', '文字即图像，极端拉伸、可变字体、物理动势。', '创意工作室、电影宣发、音乐节。'],
  ['dreamcore', 'T0', 'Dreamcore Aero (梦核航空)', 'Dreamcore 与 Frutiger Aero 的超现实变体。', 'Z 世代社区、音乐专辑、视觉艺术。'],
  ['spatial', 'T0', 'Spatial Bento (空间便当)', '空间计算、光照追踪、深度感、聚光灯效果。', '高级 SaaS、AI 界面、Linear-like。'],
  ['holographic', 'T0', 'Holographic Foil (全息镭射)', '物理镭射质感，流动光谱与噪点。', 'NFT 平台、时尚杂志、创意作品集。'],
  ['dither', 'T0', 'Dither Punk (抖动朋克)', '1-bit 低保真美学，技术复古主义。', '独立游戏、极客博客、开发者工具。'],
  ['risograph', 'T0', 'Risograph (孔版印刷)', '油墨错位、色彩叠加、纸质温暖感。', '艺术展览、独立刊物、品牌设计。'],
  ['ethereal', 'T0', 'Ethereal Glow (以太光晕)', '过度曝光、极致柔和、神圣失重感。', '冥想、心理健康、高端护肤。'],
  ['anthropic-serif', 'T0', 'Anthropic Serif (人文智性)', '暖色调衬线体，像一本会呼吸的杂志。', '知识库、深度阅读、智力型 AI 助手。'],
  ['ai-abstract', 'T0', 'AI Abstract (智构抽象)', '神经网络、潜空间波动、突触激活、粒子流。', 'AI 核心引擎、深度学习可视化、高维数据面板。'],
  ['blueprint-cad', 'T0', 'Blueprint CAD (工程蓝图)', 'ISO 工程标准、十字准星、动态测量、参数吸附。', '工业软件、建筑 CAD、精密仪器控制。'],
  ['liquid-glass', 'T0', 'Liquid Glass (液态玻璃)', '光学畸变、焦散、动态流体、空间计算基础。', '空间计算 OS、高级视觉界面。'],
  ['skeuo-nature', 'T0', 'Neo-Skeuo: Nature (自然复兴)', '生物亲和性、木纹/植物、数字疗愈。', '冥想、环保、健康管理。'],
  ['skeuo-stone', 'T0', 'Neo-Skeuo: Stone (金融基石)', '大理石/金属、沉重阻尼感、信任与安全。', '加密货币、银行、保险箱。'],
  ['3d-interactive', 'T0', 'Interactive 3D (全维空间)', 'Z 轴功能化、微交互立体化、实时光照。', '电商展示、游戏化 UI、创意工具。'],
  ['aurora-mesh', 'T0', 'Aurora Mesh (极光渐变)', '视觉白噪音、流体色彩、非侵入式引导。', '支付背景、品牌识别、沉浸式阅读。'],
  ['atomic-age', 'T0', 'Atomic Age (原子时代)', '科技乐观主义、星爆图标、流线型撞色。', 'AI 初创、创新工具、营销活动。'],
  ['jetsons', 'T0', 'The Jetsons (杰森一家)', 'Googie 建筑、悬浮玻璃圆顶、自动化隐喻。', '智能家居、自动化控制、未来生活。'],
  ['solarpunk-utopia', 'T0', 'Solarpunk Utopia (太阳朋克)', '新艺术曲线、自然光温、慢技术、社区感。', '公益、社区、可持续发展。'],
  ['brutal-bw', 'T0', 'Dystopian Brutalism (反乌托邦)', '纯黑白、去装饰、反 UX、赤裸真相。', '新闻、黑客工具、深度内容。'],
  ['gen-ui', 'T0', 'Hyper-personalization (超个性化)', '实时布局重组、意图驱动生成、情绪感知。', '下一代 OS、智能助手、无障碍适配。'],
  ['bento', 'T0', 'Bento Grid (便当盒)', '高度模块化、大圆角、信息层级清晰。', 'iOS 系统、Linear、仪表盘后台。'],
  ['material', 'T0', 'Material You', '动态取色、超大圆角、波纹反馈。', 'Android 原生应用、Google 生态。'],
  ['minimal', 'T0', 'Minimalism (极简)', '极致留白、黑白主色、强调字体排印。', '奢侈品官网、建筑事务所、高端博客。'],
  ['glass', 'T1', 'Glassmorphism (毛玻璃)', '背景模糊、半透明白、白色细边框。', 'Vision OS、Windows 11、银行卡展示。'],
  ['brutal', 'T1', 'Neo-Brutalism (野兽派)', '高饱和撞色、粗黑边框、硬阴影。', 'Gumroad、Figma、潮牌电商。'],
  ['acid', 'T1', 'Acid (酸性)', '液态金属、哥特字体、极端反差、无视网格。', '地下音乐、独立杂志、先锋艺术展。'],
  ['aurora', 'T1', 'Aurora (弥散)', '高斯模糊色块、梦幻渐变、干净无框。', '科技营销页、冥想、品牌官网。'],
  ['memphis', 'T1', 'Memphis (扁平)', '几何矢量插画、高饱和色、大厂插画风。', 'Notion、Slack、SaaS 落地页。'],
  ['natural', 'T1', 'Natural Native (自然原生)', '大地棕/草木绿、手工松弛感、回归土地。', '自然品牌、露营、茶叶。'],
  ['personal', 'T1', 'Extreme Personal (极致个性)', '打破模板、手写字体、专属插画、创作者印记。', '个人博客、设计师作品集、独立品牌。'],
  ['tactile', 'T1', 'Tactile Handmade (触感手工)', '粗糙材质、针织纹路、手工剪裁毛边。', '文创、手工艺、纺织品电商。'],
  ['digicute', 'T1', 'Digital Cute (数字萌系)', '像素、马卡龙渐变、软萌元素。', '宠物 App、盲盒、二次元社区。'],
  ['microind', 'T1', 'Micro Industrial (微型工业)', '齿轮螺栓、银灰冷蓝、细线条。', '硬件管理、精密仪器、极客工具。'],
  ['snapshot', 'T1', 'Life Snapshot (生活快照)', '颗粒感、不规则构图、未经修饰的烟火气。', '社交分享、相册、生活 Vlog。'],
  ['blooming', 'T1', 'Blooming (绚烂繁盛)', '超饱和色彩、层叠花瓣、密集不杂乱。', '节日营销、时尚美妆、艺术展。'],
  ['distorted', 'T1', 'Distorted Cut (扭曲切割)', '不规则切割、扭曲图形、错位文字。', '潮牌、滑板、地下音乐。'],
  ['neondark', 'T1', 'Neon Dark (霓虹暗黑)', '深色背景、荧光粉/电光蓝点缀。', '夜店预订、游戏社区、科技发布。'],
  ['freshretro', 'T1', 'Fresh Retro (清新复古)', '00 年代通透感、渐变玻璃、圆润字体。', '纯净水、健康管理、复古相册。'],
  ['cassette', 'T2', 'Cassette Futurism (磁带)', 'CRT 扫描线、橙/绿单色、等宽字体。', '赛博朋克游戏 UI、复古科技工具。'],
  ['neu', 'T2', 'Neomorphism (新拟态)', '同色系浮雕、柔和光影、物理触感。', '智能家居控制面板、极简工具类。'],
  ['frutiger', 'T2', 'Frutiger Aero (Y2K)', '水晶质感、高光、自然元素。', 'Windows Vista 复古主题、环保应用。'],
  ['clay', 'T2', 'Claymorphism (黏土)', '充气感、悬浮、内阴影、圆润可爱。', 'Web3、NFT 市场、儿童教育 App。'],
  ['pixel', 'T2', 'Pixel Art (像素)', '锯齿感、8-bit 音效感、鲜艳色块。', '独立游戏官网、游戏化营销 H5。'],
  ['cyber', 'T2', 'Cyberpunk (赛博)', '霓虹光效、故障艺术、黑底高反差。', '电竞网站、加密货币、科技发布会。'],
  ['solar', 'T2', 'Solarpunk (太阳)', '奶油色底、绿色点缀、新艺术线条。', '环保公益、农业科技、可持续品牌。'],
  ['skeuo', 'T3', 'Skeuomorphism (拟物)', '模拟皮革/金属/木纹、真实投影。', '专业音频软件、电子书架、复古计算器。'],
  ['bauhaus', 'T3', 'Bauhaus (包豪斯)', '红黄蓝三原色、几何图形、倾斜排版。', '艺术博物馆、设计展览、创意海报。'],
  ['dos', 'T3', 'DOS / Terminal', '纯代码界面、黑底绿字/蓝底白字。', '开发者工具、黑客主题、极客博客。'],
  ['doodle', 'T3', 'Doodle (手绘)', '粗线条边框、手写字体、不规则图形。', '协作白板、创意工具、笔记 App。'],
  ['paper', 'T3', 'Papercraft (剪纸)', '纸质纹理、层叠阴影、撕边效果。', '创意广告、绘本 App、手工艺社区。'],
  ['win95', 'T3', 'Retro OS (Win95)', '灰色倒角边框、像素图标、蓝屏背景。', '怀旧主题站、个人作品集、蒸汽波。'],
  ['vapor', 'T3', 'Vaporwave (蒸汽波)', '粉紫渐变、石膏像、故障风、80 年代。', '音乐播放器、潮流服饰、艺术实验。'],
  ['swiss', 'T3', 'Swiss (瑞士国际)', '严格网格、无衬线字体、非对称布局。', '杂志排版、建筑网站、出版物。'],
  ['blueprint', 'T3', 'Blueprint (蓝图)', '深蓝底色、细白线、测量标注、工程感。', '建筑施工 App、机械制造后台、原型图。'],
  ['gothic', 'T3', 'Gothic (暗黑)', '石质/金属纹理、暗红/金色、衬线字。', 'RPG 游戏界面、奇幻文学站、塔罗牌。'],
]

const patternById: Record<string, UiVisualPattern> = {
  'neuro-morphic': 'organism',
  'quantum-glass': 'prismatic',
  'ambient-aura': 'aura',
  'hyper-brutalism': 'brutal',
  'copilot-ai': 'agent',
  'zero-ui': 'ambient',
  'data-ink': 'data',
  'emotion-adaptive': 'aura',
  'agentic-os': 'agent',
  'wabi-sabi': 'zen',
  chromium: 'metal',
  kinetic: 'kinetic',
  dreamcore: 'aero',
  spatial: 'spatial',
  holographic: 'hologram',
  dither: 'dither',
  risograph: 'print',
  ethereal: 'aura',
  'anthropic-serif': 'editorial',
  'ai-abstract': 'organism',
  'blueprint-cad': 'blueprint',
  'liquid-glass': 'glass',
  'skeuo-nature': 'natural',
  'skeuo-stone': 'skeuo',
  '3d-interactive': 'spatial',
  'aurora-mesh': 'aura',
  'atomic-age': 'atomic',
  jetsons: 'atomic',
  'solarpunk-utopia': 'solarpunk',
  'brutal-bw': 'brutal',
  'gen-ui': 'agent',
  bento: 'bento',
  material: 'material',
  minimal: 'minimal',
  glass: 'glass',
  brutal: 'brutal',
  acid: 'acid',
  aurora: 'aura',
  memphis: 'memphis',
  natural: 'natural',
  personal: 'doodle',
  tactile: 'paper',
  digicute: 'cute',
  microind: 'industrial',
  snapshot: 'snapshot',
  blooming: 'floral',
  distorted: 'kinetic',
  neondark: 'neon',
  freshretro: 'aero',
  cassette: 'retro',
  neu: 'skeuo',
  frutiger: 'aero',
  clay: 'cute',
  pixel: 'dither',
  cyber: 'neon',
  solar: 'solarpunk',
  skeuo: 'skeuo',
  bauhaus: 'memphis',
  dos: 'terminal',
  doodle: 'doodle',
  paper: 'paper',
  win95: 'retro',
  vapor: 'aero',
  swiss: 'swiss',
  blueprint: 'blueprint',
  gothic: 'gothic',
}

const patternPalettes: Record<UiVisualPattern, string[]> = {
  organism: ['#081312', '#40f0c8', '#a78bfa', '#f8ffe5'],
  prismatic: ['#050716', '#8bd6ff', '#f5b4ff', '#ffffff'],
  aura: ['#111827', '#8b5cf6', '#31d5ff', '#f0c674'],
  brutal: ['#050505', '#ff2d55', '#fff200', '#00ffd1'],
  agent: ['#07111f', '#7c3aed', '#2dd4bf', '#f8fafc'],
  ambient: ['#0b1020', '#9ca3af', '#dbeafe', '#f7fee7'],
  data: ['#f8fafc', '#111827', '#2563eb', '#10b981'],
  zen: ['#f4efe4', '#28251f', '#8a7b57', '#c8b68b'],
  metal: ['#07070a', '#cbd5e1', '#8b5cf6', '#e11d48'],
  kinetic: ['#ffd400', '#111111', '#fb3b4b', '#2563eb'],
  aero: ['#e0fbff', '#36a3ff', '#98ffdf', '#ffffff'],
  spatial: ['#09090f', '#8b5cf6', '#38bdf8', '#ffffff'],
  hologram: ['#080812', '#ff8bd1', '#75ffe8', '#fff4a3'],
  dither: ['#050505', '#f8fafc', '#9ca3af', '#75ff85'],
  print: ['#fff1d6', '#f43f5e', '#2563eb', '#111827'],
  editorial: ['#fbf3e6', '#1f2937', '#a16207', '#7c2d12'],
  blueprint: ['#053b83', '#dbeafe', '#38bdf8', '#ffffff'],
  skeuo: ['#211913', '#d6a85c', '#6b7280', '#fff7ed'],
  atomic: ['#fff8d6', '#e11d48', '#2563eb', '#111827'],
  solarpunk: ['#f7f0d4', '#1f7a4d', '#f59e0b', '#7c3aed'],
  bento: ['#f8fafc', '#111827', '#6366f1', '#22c55e'],
  material: ['#f3f4ff', '#312e81', '#6750a4', '#d0bcff'],
  minimal: ['#ffffff', '#111111', '#737373', '#f5f5f5'],
  glass: ['#0f172a', '#93c5fd', '#e0f2fe', '#ffffff'],
  acid: ['#0a0013', '#ccff00', '#ff00aa', '#ffffff'],
  memphis: ['#fff7ed', '#f97316', '#2563eb', '#facc15'],
  natural: ['#f2eadb', '#3f5f3d', '#a3b18a', '#7c5e3b'],
  cute: ['#fff1f8', '#fb7185', '#93c5fd', '#fde68a'],
  industrial: ['#111827', '#94a3b8', '#38bdf8', '#e5e7eb'],
  snapshot: ['#f7ead7', '#2f241d', '#ef4444', '#f59e0b'],
  floral: ['#fff0f6', '#e11d48', '#facc15', '#22c55e'],
  neon: ['#050014', '#00e5ff', '#ff00d4', '#faff00'],
  retro: ['#1f2937', '#f97316', '#84cc16', '#fef3c7'],
  terminal: ['#050505', '#75ff85', '#0f172a', '#e5e7eb'],
  doodle: ['#fffdf4', '#111827', '#f97316', '#38bdf8'],
  paper: ['#f7efe3', '#4b3621', '#d97706', '#ffffff'],
  swiss: ['#f8fafc', '#111827', '#ef4444', '#d1d5db'],
  gothic: ['#0b0508', '#991b1b', '#c8a45d', '#e5e7eb'],
  fusion: ['#09090f', '#8b5cf6', '#2dd4bf', '#f59e0b'],
}

const motifByPattern: Record<UiVisualPattern, string> = {
  organism: 'neural bloom',
  prismatic: 'refracted pane',
  aura: 'soft field',
  brutal: 'impact block',
  agent: 'task swarm',
  ambient: 'invisible context',
  data: 'metric rail',
  zen: 'weathered calm',
  metal: 'liquid chrome',
  kinetic: 'moving type',
  aero: 'crystal sky',
  spatial: 'depth stack',
  hologram: 'foil spectrum',
  dither: '1-bit matrix',
  print: 'ink offset',
  editorial: 'reading page',
  blueprint: 'cad grid',
  skeuo: 'material object',
  atomic: 'space-age burst',
  solarpunk: 'living grid',
  bento: 'module tray',
  material: 'dynamic surface',
  minimal: 'silent layout',
  glass: 'frosted pane',
  acid: 'melted poster',
  memphis: 'geometry play',
  natural: 'earth craft',
  cute: 'soft toy',
  industrial: 'machine panel',
  snapshot: 'photo strip',
  floral: 'dense bloom',
  neon: 'night signal',
  retro: 'old system',
  terminal: 'command line',
  doodle: 'sketch board',
  paper: 'layered cut',
  swiss: 'strict grid',
  gothic: 'dark relic',
  fusion: 'hybrid canvas',
}

function withAlpha(hex: string, alpha: string): string {
  return `${hex}${alpha}`
}

function readableTextForPattern(pattern: UiVisualPattern, palette: string[]): string {
  if (
    [
      'brutal',
      'kinetic',
      'atomic',
      'solarpunk',
      'bento',
      'material',
      'minimal',
      'data',
      'swiss',
      'editorial',
      'zen',
      'natural',
      'paper',
      'print',
      'snapshot',
      'floral',
      'cute',
      'memphis',
      'doodle',
    ].includes(pattern)
  ) {
    return '#111827'
  }
  return palette[3] || '#ffffff'
}

function styleVisualOverrides(id: string, visual: UiVisualTokens): Partial<UiVisualTokens> {
  const overrides: Record<string, Partial<UiVisualTokens>> = {
    chromium: {
      palette: ['#03060b', '#e5edf6', '#7b8794', '#d9154f'],
      background:
        'radial-gradient(circle at 20% 22%, rgba(245,248,252,0.38), transparent 18%), radial-gradient(circle at 76% 68%, rgba(159,172,188,0.3), transparent 22%), linear-gradient(128deg, #02050b 0%, #111827 36%, #dfe7ef 46%, #4b5563 51%, #07101d 60%, #02050b 100%)',
      surface: 'rgba(216, 226, 236, 0.16)',
      text: '#f8fbff',
      accent: '#e5edf6',
      border: '#9aa6b2',
      radius: '14px',
      shadow: '0 36px 120px rgba(216,226,236,0.24)',
      typography: 'display',
      motif: 'mirror chrome interface',
      texture: 'polished metal',
      motion: 'snappy',
    },
    kinetic: {
      palette: ['#ffd400', '#111111', '#fb3b4b', '#2563eb'],
      background: '#ffd400',
      surface: '#fff7ed',
      text: '#111111',
      accent: '#111111',
      border: '#fb3b4b',
      radius: '0px',
      shadow: '10px 10px 0 #2563eb',
      typography: 'display',
      motif: 'variable motion type',
      texture: 'clean',
      motion: 'orchestrated',
    },
    'ambient-aura': {
      palette: ['#050505', '#f0c674', '#38bdf8', '#fff7ed'],
      background:
        'radial-gradient(circle at 56% 34%, rgba(240,198,116,0.5), transparent 28%), radial-gradient(circle at 78% 42%, rgba(56,189,248,0.18), transparent 18%), #050505',
      surface: 'rgba(24, 21, 17, 0.82)',
      text: '#fff7ed',
      accent: '#f0c674',
      border: '#f0c674',
      radius: '2px',
      shadow: '0 34px 120px rgba(240,198,116,0.28)',
      typography: 'serif',
      motif: 'ambient light field',
      texture: 'soft grain',
      motion: 'breathing',
    },
    dither: {
      palette: ['#050505', '#f8fafc', '#9ca3af', '#75ff85'],
      background:
        'radial-gradient(#f8fafc 1px, transparent 1px), linear-gradient(90deg, rgba(248,250,252,0.08) 1px, transparent 1px), #050505',
      surface: '#f8fafc',
      text: '#f8fafc',
      accent: '#f8fafc',
      border: '#f8fafc',
      radius: '0px',
      shadow: '12px 12px 0 #f8fafc',
      typography: 'mono',
      motif: '1-bit Atkinson dither interface',
      texture: '1-bit matrix',
      motion: 'snappy',
    },
    pixel: {
      palette: ['#160f2d', '#ffcc00', '#26e0ff', '#ff4d8d'],
      background:
        'linear-gradient(90deg, rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.14) 1px, transparent 1px), #160f2d',
      surface: '#25184a',
      text: '#fff7ed',
      accent: '#ffcc00',
      border: '#26e0ff',
      radius: '0px',
      shadow: '8px 8px 0 #ff4d8d',
      typography: 'mono',
      motif: '8-bit tile interface',
      texture: 'pixel grid',
      motion: 'snappy',
    },
    'anthropic-serif': {
      palette: ['#fbf3e6', '#3d2f25', '#b66840', '#1f2937'],
      background: 'radial-gradient(circle at 72% 44%, rgba(182,104,64,0.18), transparent 30%), #fbf3e6',
      surface: '#f5eee3',
      text: '#1f2937',
      accent: '#3d2f25',
      border: '#c7925f',
      radius: '18px',
      shadow: '0 24px 70px rgba(61,47,37,0.12)',
      typography: 'serif',
      motif: 'editorial thinking room',
      texture: 'paper',
      motion: 'calm',
    },
    '3d-interactive': {
      shadow: '0 32px 90px rgba(56,189,248,0.32)',
      motif: 'object stage',
      texture: 'depth',
    },
    'aurora-mesh': {
      text: '#111827',
      background:
        'radial-gradient(circle at 20% 16%, rgba(139,92,246,0.5), transparent 30%), radial-gradient(circle at 76% 36%, rgba(49,213,255,0.42), transparent 28%), radial-gradient(circle at 50% 86%, rgba(240,198,116,0.36), transparent 30%), #fffaf0',
      surface: 'rgba(255,255,255,0.56)',
      border: '#31d5ff',
    },
  }

  return overrides[id] || (visual.pattern === 'kinetic' ? overrides.kinetic : {})
}

function visualForStyle(id: string, tier: UiStyleItem['tier'], index: number): UiVisualTokens {
  const pattern = patternById[id] || 'fusion'
  const palette = patternPalettes[pattern]
  const quiet = tier === 'T3' || pattern === 'minimal' || pattern === 'swiss' || pattern === 'zen'
  const chaotic = ['brutal', 'acid', 'kinetic', 'neon', 'dither'].includes(pattern)
  const base: UiVisualTokens = {
    palette,
    background:
      pattern === 'minimal'
        ? '#ffffff'
        : pattern === 'data' || pattern === 'editorial' || pattern === 'swiss'
          ? palette[0]
          : `radial-gradient(circle at ${24 + (index % 5) * 9}% 18%, ${withAlpha(palette[1], '88')}, transparent 30%), radial-gradient(circle at 78% ${54 + (index % 4) * 8}%, ${withAlpha(palette[2], '66')}, transparent 28%), ${palette[0]}`,
    surface:
      pattern === 'glass' || pattern === 'prismatic' || pattern === 'spatial'
        ? 'rgba(255,255,255,0.16)'
        : pattern === 'minimal' || pattern === 'data' || pattern === 'swiss'
          ? '#ffffff'
          : withAlpha(palette[3] || '#ffffff', pattern === 'brutal' ? 'ff' : '24'),
    text:
      readableTextForPattern(pattern, palette),
    accent: palette[1],
    border: pattern === 'brutal' ? '#050505' : pattern === 'terminal' ? palette[3] || '#ffffff' : withAlpha(palette[2] || palette[1], 'aa'),
    radius:
      pattern === 'brutal' || pattern === 'terminal' || pattern === 'blueprint' || pattern === 'swiss'
        ? '0px'
        : pattern === 'cute' || pattern === 'material' || pattern === 'bento'
          ? '28px'
          : pattern === 'minimal'
            ? '6px'
            : '18px',
    shadow:
      pattern === 'brutal'
        ? `14px 14px 0 ${palette[3] || '#000'}`
        : pattern === 'minimal' || pattern === 'swiss'
          ? 'none'
          : `0 24px 80px ${withAlpha(palette[1], '44')}`,
    pattern,
    density: chaotic ? 'chaotic' : quiet ? 'quiet' : 'balanced',
    typography:
      pattern === 'terminal' || pattern === 'dither' || pattern === 'blueprint' || pattern === 'industrial'
        ? 'mono'
        : pattern === 'editorial' || pattern === 'gothic'
          ? 'serif'
          : pattern === 'kinetic' || pattern === 'brutal'
            ? 'display'
            : 'sans',
    motif: motifByPattern[pattern],
    texture:
      pattern === 'print' || pattern === 'paper' || pattern === 'snapshot' || pattern === 'zen'
        ? 'grain'
        : pattern === 'dither' || pattern === 'terminal' || pattern === 'retro'
          ? 'scanline'
          : pattern === 'glass' || pattern === 'prismatic' || pattern === 'hologram'
            ? 'refraction'
            : 'clean',
    motion:
      pattern === 'kinetic' || pattern === 'agent' || pattern === 'spatial'
        ? 'orchestrated'
        : pattern === 'aura' || pattern === 'organism' || pattern === 'glass'
          ? 'breathing'
          : 'snappy',
  }
  return { ...base, ...styleVisualOverrides(id, base) }
}

function styleDnaSentence(id: string, title: string, visual: UiVisualTokens): string {
  if (id === 'hyper-brutalism' || visual.pattern === 'brutal') {
    return `${title} 必须用粗黑边框、硬阴影、高饱和撞色、显眼焦点态和可被按下的物理块表达“粗粝但可用”。`
  }
  if (id === 'kinetic' || visual.pattern === 'kinetic') {
    return `${title} 必须让字体成为主体：大字级差、可变字重、错位动势、节奏化进入/退出和强对比焦点态要贯穿真实组件。`
  }
  if (id === 'anthropic-serif' || visual.pattern === 'editorial') {
    return `${title} 必须用暖纸底、人文衬线标题、克制按钮、长阅读节奏和高留白表达“可深度思考的 AI/知识空间”。`
  }
  if (id === 'ambient-aura') {
    return `${title} 必须用暗场、柔光、低边界、呼吸式层级和沉浸氛围承接界面，不能退化成浅灰卡片模板。`
  }
  if (id === 'dither') {
    return `${title} 必须用 1-bit 黑白、Atkinson/网点抖动、硬边像素窗口、等宽系统字、键盘优先和明确状态输出表达“低保真技术复古”，彩色只能作为极少量 live/focus 信号。`
  }
  if (id === 'pixel') {
    return `${title} 必须用 8-bit 像素网格、硬边块、台阶式排版、街机色块和可按压状态表达游戏化界面，不能混成 1-bit 黑白抖动。`
  }
  if (id === 'chromium' || visual.pattern === 'metal') {
    return `${title} 必须用深石墨场、镜面银、锐利高光、液态金属反射和少量冷红信号表达“可操作的铬金界面”，不能退化成粉色或通用 SaaS 卡片。`
  }
  if (id === 'wabi-sabi' || visual.pattern === 'zen') {
    return `${title} 必须用自然纸感、非完全对称构图、低对比大地色、克制动效和安静留白表达“不完美但有秩序”。`
  }
  if (id === 'material' || visual.pattern === 'material') {
    return `${title} 必须用动态色、tonal surface、大圆角、状态层、ripple/pressed 反馈和清晰触控层级表达 Android 原生气质。`
  }
  if (visual.pattern === 'terminal' || visual.pattern === 'retro' || visual.pattern === 'dither') {
    return `${title} 必须保留系统字、像素/扫描线、硬边窗口、键盘优先和明确状态输出。`
  }
  if (visual.pattern === 'glass' || visual.pattern === 'prismatic' || visual.pattern === 'spatial' || visual.pattern === 'hologram') {
    return `${title} 必须用层叠材质、空间深度、焦点面板、光学高光和低噪声动效，而不是普通毛玻璃贴图。`
  }
  if (visual.pattern === 'data' || visual.pattern === 'blueprint' || visual.pattern === 'industrial') {
    return `${title} 必须把网格、指标、参数、测量线和可审计状态变成界面骨架。`
  }
  if (visual.pattern === 'natural' || visual.pattern === 'paper' || visual.pattern === 'print' || visual.pattern === 'snapshot') {
    return `${title} 必须用真实材质感、手工边缘、颗粒、温暖色温和轻触状态表达可信的触感。`
  }
  return `${title} 必须先保留 ${visual.motif}、${visual.texture}、${visual.motion}、${visual.density} 信息密度，再转成平台组件。`
}

function buildPlatformGuides(id: string, title: string, visual: UiVisualTokens) {
  const dna = styleDnaSentence(id, title, visual)
  return {
    web: `${dna} Web 版要把视觉 DNA 落到首屏信息架构、导航、主/次按钮、表单、卡片、空态/加载/成功态和响应式断点；hover、focus-visible、pressed、disabled 不允许使用浏览器默认样式。`,
    ios: `${dna} iOS 版使用 NavigationStack、TabView、Sheet、系统字体/符号和触感反馈组织层级；底部 tab 只做顶级导航，按钮和输入状态要保留 ${visual.accent} 与 ${visual.radius} 的风格语法。`,
    mac: `${dna} macOS 版使用窗口工具栏、Sidebar/Split View、Inspector、键盘焦点和菜单命令承接桌面效率；不要把手机页拉宽，必须有可扫描的列表、详情和状态栏。`,
    android: `${dna} Android 版基于 Material 3/Compose 组件扩展：NavigationBar/NavigationRail、FAB、Card、TextField、Switch 和 ripple/pressed/overscroll 状态都要用动态色与 tonal surface 统一。`,
    mini: `${dna} 小程序版保留固定顶部导航、右上菜单/关闭、可见返回、tabBar 与底部操作面板；重滤镜和复杂 3D 降级为色块、纹理、轻 Canvas 或静态材质。`,
  }
}

export const UI_STYLE_ITEMS: UiStyleItem[] = rows.map(([id, tier, title, description, application], index) => {
  const specs = tierSpecs[tier]
  const visual = visualForStyle(id, tier, index)
  const platformGuides = buildPlatformGuides(id, title, visual)
  return {
    id,
    tier,
    title: `${index + 1}. ${title}`,
    description,
    application,
    specs,
    visual,
    ...platformGuides,
  }
})

export function getUiStyle(id: string): UiStyleItem | undefined {
  return UI_STYLE_ITEMS.find((item) => item.id === id)
}
