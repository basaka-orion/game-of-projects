import type { FoodAdCrafterState, FoodAdProject, FoodAdStyle, FoodAdStyleKey } from './types'

export const FOOD_AD_STORAGE_KEY = 'openbasaka-food-ad-crafter-state-v1'

export function createFoodAdId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export const FOOD_AD_STYLES: FoodAdStyle[] = [
  {
    id: 'rembrandt-dark',
    name: '伦勃朗光影',
    description: '深邃暗调、明暗对比、立体质感',
    scene:
      'Masterpiece product photography, strict Rembrandt lighting, pitch black void background, a single dramatic shaft of light from top-left, high contrast chiaroscuro.',
    palette: ['#0c0a09', '#f59e0b', '#f8fafc'],
    tone: 'dark',
  },
  {
    id: 'neon-dream',
    name: '赛博霓虹',
    description: '都市夜景、霓虹光效、氛围感拉满',
    scene: 'Photorealistic cyberpunk city night, wet pavement, holographic neon sign reflections.',
    palette: ['#312e81', '#d946ef', '#22d3ee'],
    tone: 'cool',
  },
  {
    id: 'cosmic-pop',
    name: '宇宙潮玩',
    description: '漂浮元素、奇幻色彩、超现实风格',
    scene: 'Photorealistic cosmic vista, zero-gravity, colorful nebula, stardust, star reflections.',
    palette: ['#0284c7', '#67e8f9', '#f472b6'],
    tone: 'fantasy',
  },
  {
    id: 'summer-splash',
    name: '夏日清新',
    description: '阳光、清凉、高对比度',
    scene: 'Ultra-realistic sun-drenched beach, refreshing summer vibe, dynamic lighting, high contrast.',
    palette: ['#f59e0b', '#fde047', '#0ea5e9'],
    tone: 'bright',
  },
  {
    id: 'minimalist-chic',
    name: '极简主义',
    description: '纯色背景、高级质感、聚焦产品',
    scene: 'Photorealistic high-end architectural space, polished marble or concrete surface, soft window shadows.',
    palette: ['#64748b', '#cbd5e1', '#f8fafc'],
    tone: 'luxury',
  },
  {
    id: 'manga-crush',
    name: '二次元漫画',
    description: '高燃战斗、动态线条、热血感爆棚',
    scene: 'Photorealistic scene with manga aesthetic, explosive energy effect, physical debris frozen in motion.',
    palette: ['#dc2626', '#fb923c', '#111827'],
    tone: 'street',
  },
  {
    id: 'guochao-ink',
    name: '新中式国潮',
    description: '水墨丹青、祥云瑞兽、东方美学',
    scene: 'Modern luxury meets traditional Chinese aesthetic, dark lacquered table, misty mountains background.',
    palette: ['#7f1d1d', '#111827', '#fef3c7'],
    tone: 'dark',
  },
  {
    id: 'vaporwave-dream',
    name: '迷幻蒸汽波',
    description: '复古未来、故障艺术、微醺氛围',
    scene: 'Photorealistic vaporwave environment, glowing grid floor, digital sunset, volumetric neon haze.',
    palette: ['#f472b6', '#a78bfa', '#3b82f6'],
    tone: 'fantasy',
  },
  {
    id: 'girly-fluff',
    name: '甜系少女心',
    description: '粉色云朵、彩虹爱心、梦幻滤镜',
    scene: 'Photorealistic dreamscape, soft fluffy clouds, golden-hour light, realistic cloud texture.',
    palette: ['#f9a8d4', '#fda4af', '#fff7ed'],
    tone: 'bright',
  },
  {
    id: 'gothic-fantasy',
    name: '暗黑幻想',
    description: '哥特城堡、魔法光辉、史诗氛围',
    scene: 'Photorealistic grand gothic cathedral ruin, stone altar, moonlight through arched windows.',
    palette: ['#1e293b', '#581c87', '#020617'],
    tone: 'dark',
  },
  {
    id: 'cozy-cottagecore',
    name: '森系小屋',
    description: '午后阳光、木桌花草、温暖治愈',
    scene: 'Warm photorealistic rustic cottage, weathered wood table, soft sunlight through window.',
    palette: ['#4d7c0f', '#047857', '#fef3c7'],
    tone: 'warm',
  },
  {
    id: 'retro-arcade',
    name: '复古电玩',
    description: '像素艺术、霓虹光栅、8-bit 情怀',
    scene: 'Photorealistic vintage arcade at night, lit by CRT screen and neon lights.',
    palette: ['#c026d3', '#4f46e5', '#22d3ee'],
    tone: 'street',
  },
  {
    id: 'dark-academia',
    name: '深邃书院',
    description: '古典图书馆、烛光、复古知性氛围',
    scene: 'Photorealistic ancient library at night, dark wood table, leather-bound books, single candle light.',
    palette: ['#292524', '#78350f', '#fbbf24'],
    tone: 'dark',
  },
  {
    id: 'glitchcore',
    name: '赛博故障',
    description: '数据错误、CRT 屏幕、迷幻数字艺术',
    scene: 'Hyper-realistic digital glitch aesthetic, flickering CRT monitor, datamoshing, RGB splits, scan lines.',
    palette: ['#4ade80', '#ec4899', '#4f46e5'],
    tone: 'street',
  },
  {
    id: 'barbiecore',
    name: '芭比甜心',
    description: '大胆粉色、塑料质感、玩味奢华风',
    scene: 'Ultra-photorealistic high-fashion hot pink, glossy plastic pedestal, dollhouse-like room.',
    palette: ['#f472b6', '#d946ef', '#fff1f2'],
    tone: 'bright',
  },
  {
    id: 'gorpcore-camping',
    name: '山系露营',
    description: '户外山野、篝火星空、自然气息',
    scene: 'Photorealistic mountain campsite at golden hour, product on a log by crackling campfire.',
    palette: ['#ea580c', '#1e293b', '#fef3c7'],
    tone: 'warm',
  },
  {
    id: 'skater-street',
    name: '街头涂鸦',
    description: '城市滑板公园、夕阳、自由不羁',
    scene: 'Dynamic photorealistic urban skatepark at sunset, graffiti concrete ledge, golden-hour glow.',
    palette: ['#374151', '#dc2626', '#f97316'],
    tone: 'street',
  },
  {
    id: 'lofi-chill',
    name: 'Lo-fi 独处',
    description: '雨夜窗边、温暖灯光、放松时刻',
    scene: 'Cozy photorealistic room, rainy night, cool laptop screen and warm lamp, shallow depth of field.',
    palette: ['#4338ca', '#0f172a', '#fbbf24'],
    tone: 'cool',
  },
  {
    id: 'y2k-nostalgia',
    name: 'Y2K 千禧辣妹',
    description: '镭射金属、果冻质感、复古新潮',
    scene: 'High-energy photorealistic Y2K aesthetic, iridescent translucent holographic materials.',
    palette: ['#f472b6', '#9333ea', '#67e8f9'],
    tone: 'fantasy',
  },
  {
    id: 'pool-party',
    name: '泳池派对',
    description: '波光粼粼、夏日活力、明亮光斑',
    scene: 'Ultra-realistic sunlit swimming pool, intense direct sunlight, bright highlights and water caustics.',
    palette: ['#38bdf8', '#2563eb', '#fef08a'],
    tone: 'bright',
  },
  {
    id: 'fantasy-rpg',
    name: '奇幻 RPG',
    description: '魔法森林、发光植物、史诗冒险感',
    scene: 'Epic photorealistic enchanted magical forest, moss-covered ruin, giant glowing mushrooms.',
    palette: ['#059669', '#6b21a8', '#a7f3d0'],
    tone: 'fantasy',
  },
  {
    id: 'quiet-luxury',
    name: '静奢风',
    description: '低调质感、经典永恒、高级感',
    scene: 'Photorealistic minimalist luxury apartment, travertine table, soft indirect natural light.',
    palette: ['#d6d3d1', '#94a3b8', '#171717'],
    tone: 'luxury',
  },
  {
    id: 'dopamine-dressing',
    name: '多巴胺风',
    description: '鲜艳撞色、大胆图案、活力四射',
    scene: 'Vibrant photorealistic studio with bold colorful geometric shapes and high-key lighting.',
    palette: ['#facc15', '#ec4899', '#22d3ee'],
    tone: 'bright',
  },
  {
    id: 'wasteland-punk',
    name: '废土朋克',
    description: '金属锈迹、末日机车、生存美学',
    scene: 'Sun-scorched desert at sunset, product on rusty hood of post-apocalyptic vehicle, dusty air.',
    palette: ['#b45309', '#292524', '#f97316'],
    tone: 'street',
  },
  {
    id: 'soft-sci-fi',
    name: '轻科幻',
    description: '未来都市、流线设计、洁净感',
    scene: 'Clean optimistic futuristic space, sleek minimalist surface, soft diffused glowing panels.',
    palette: ['#bae6fd', '#c4b5fd', '#0f172a'],
    tone: 'cool',
  },
  {
    id: 'japanese-fresh',
    name: '日系小清新',
    description: '和煦日光、简约日常、空气感',
    scene: 'Bright airy minimalist Japanese-style room, light wood surface by morning window sunlight.',
    palette: ['#bbf7d0', '#bfdbfe', '#fefce8'],
    tone: 'bright',
  },
  {
    id: 'esports-room',
    name: '电竞房',
    description: 'RGB 光效、专业设备、竞技氛围',
    scene: "Photorealistic pro-gamer's room at night, multi-colored RGB glow, screen reflections.",
    palette: ['#9333ea', '#1e40af', '#22d3ee'],
    tone: 'cool',
  },
  {
    id: 'music-festival',
    name: '音乐节',
    description: '夕阳草地、舞台灯光、自由灵魂',
    scene: 'Photorealistic music festival at golden hour, blurred stage lights in background, warm haze.',
    palette: ['#fb923c', '#f43f5e', '#fde68a'],
    tone: 'warm',
  },
  {
    id: 'gym-fit',
    name: '健身房',
    description: '工业风、力量器械、挥洒汗水',
    scene: 'Modern high-end gym, workout bench near black metal weights, dramatic high-contrast spotlights.',
    palette: ['#475569', '#1f2937', '#f8fafc'],
    tone: 'dark',
  },
  {
    id: 'pet-cafe',
    name: '萌宠咖啡馆',
    description: '猫咪狗狗、温暖午后、治愈时光',
    scene: 'Photorealistic cozy cafe, natural light, wooden table with a cat or dog nearby.',
    palette: ['#fdba74', '#f59e0b', '#fef3c7'],
    tone: 'warm',
  },
  {
    id: 'beach-bonfire',
    name: '海滩篝火',
    description: '夜幕繁星、温暖火焰、朋友欢聚',
    scene: 'Photorealistic beach at twilight, warm flickering bonfire light, cozy intimate mood.',
    palette: ['#3730a3', '#d97706', '#fef3c7'],
    tone: 'warm',
  },
  {
    id: 'tokyo-shinjuku',
    name: '东京新宿夜',
    description: '雨夜霓虹、赛博都市、未来感',
    scene: 'Photorealistic rainy Shinjuku street at night, wet crosswalk reflecting neon signs.',
    palette: ['#1d4ed8', '#ec4899', '#fde047'],
    tone: 'cool',
  },
  {
    id: 'paris-cafe',
    name: '巴黎左岸',
    description: '晨间咖啡、优雅浪漫、文艺气息',
    scene: 'Photorealistic Parisian cafe terrace in the morning, marble table, classic street background.',
    palette: ['#7dd3fc', '#a8a29e', '#fef3c7'],
    tone: 'luxury',
  },
  {
    id: 'havana-streets',
    name: '哈瓦那假日',
    description: '复古老爷车、浓烈色彩、热情奔放',
    scene: 'Photorealistic Old Havana street, product on classic 1950s car, colorful colonial buildings.',
    palette: ['#06b6d4', '#f59e0b', '#dc2626'],
    tone: 'warm',
  },
  {
    id: 'santorini-alleys',
    name: '圣托里尼午后',
    description: '蓝白小镇、爱琴海、纯净日光',
    scene: 'Sun-bleached Santorini alley, whitewashed ledge overlooking bright blue Aegean Sea.',
    palette: ['#38bdf8', '#2563eb', '#ffffff'],
    tone: 'bright',
  },
  {
    id: 'kyoto-gion',
    name: '京都石塀小路',
    description: '古都石巷、纸灯笼、静谧和风',
    scene: 'Tranquil Gion Kyoto street at dusk, warm glow from paper lanterns, timeless peace.',
    palette: ['#9a3412', '#1f2937', '#fde68a'],
    tone: 'warm',
  },
  {
    id: 'bioluminescent-eden',
    name: '荧光伊甸园',
    description: '阿凡达秘境、生命之树、梦幻光影',
    scene: 'Otherworldly bioluminescent forest at night, glowing flora, magical light particles, glowing moss.',
    palette: ['#14b8a6', '#059669', '#312e81'],
    tone: 'fantasy',
  },
  {
    id: 'venice-canals',
    name: '威尼斯水巷',
    description: '贡多拉小船、浪漫倒影、午后阳光',
    scene: 'Historic Venice canal at golden hour, stone ledge beside water, gondola in soft background.',
    palette: ['#fb923c', '#0284c7', '#fef3c7'],
    tone: 'luxury',
  },
  {
    id: 'marrakech-souk',
    name: '摩洛哥市集',
    description: '异域香料、彩色灯笼、暖阳市井',
    scene: 'Bustling Marrakech souk, table with colorful spices and lanterns, warm dappled sunlight.',
    palette: ['#dc2626', '#f59e0b', '#7c2d12'],
    tone: 'warm',
  },
  {
    id: 'swiss-alps',
    name: '阿尔卑斯雪山',
    description: '雪山之巅、纯净空气、清冽质感',
    scene: 'Majestic Swiss Alps, rustic wooden balcony, snow-capped peaks, crisp clear morning light.',
    palette: ['#7dd3fc', '#ffffff', '#0f172a'],
    tone: 'bright',
  },
  {
    id: 'tulum-ruins',
    name: '图卢姆遗迹',
    description: '加勒比海、玛雅古城、波西米亚风',
    scene: 'Ancient Mayan ruins of Tulum above turquoise Caribbean Sea, bright tropical sun.',
    palette: ['#2dd4bf', '#bef264', '#fef3c7'],
    tone: 'bright',
  },
  {
    id: 'iceland-aurora',
    name: '冰岛极光',
    description: '夜空舞动、火山岩石、神秘光辉',
    scene: 'Dramatic Icelandic landscape at night, green and purple aurora over dark volcanic rock.',
    palette: ['#4ade80', '#4338ca', '#020617'],
    tone: 'fantasy',
  },
  {
    id: 'japan-sakura',
    name: '京都樱花季',
    description: '樱花雨下、和风庭院、温柔光影',
    scene: 'Serene Japanese park during sakura season, falling petals, soft dappled sunlight.',
    palette: ['#f9a8d4', '#fecdd3', '#f8fafc'],
    tone: 'bright',
  },
  {
    id: 'nyc-times-square',
    name: '纽约时代广场',
    description: '都市霓虹、彻夜不眠、潮流中心',
    scene: 'Vibrant Times Square at night, high ledge above traffic blur and massive glowing billboards.',
    palette: ['#facc15', '#2563eb', '#c026d3'],
    tone: 'street',
  },
  {
    id: 'egypt-pyramids',
    name: '埃及金字塔',
    description: '沙漠日落、古老奇迹、史诗氛围',
    scene: 'Majestic Giza pyramids at sunset, product on sandstone block, long desert shadows.',
    palette: ['#f59e0b', '#a16207', '#fef3c7'],
    tone: 'warm',
  },
  {
    id: 'rome-colosseum',
    name: '罗马斗兽场',
    description: '永恒之城、历史余晖、优雅石阶',
    scene: 'Iconic Roman Colosseum at golden hour, travertine stone ledge, warm romantic light.',
    palette: ['#fb923c', '#78716c', '#fef3c7'],
    tone: 'luxury',
  },
  {
    id: 'great-wall-china',
    name: '中国长城',
    description: '群山之巅、雄伟壮丽、云雾缭绕',
    scene: 'Great Wall of China over misty mountains at sunrise, weathered grey brick foreground.',
    palette: ['#15803d', '#475569', '#fef3c7'],
    tone: 'warm',
  },
  {
    id: 'rio-de-janeiro',
    name: '里约热内卢',
    description: '基督山下、热情桑巴、海滩风情',
    scene: 'View from Sugarloaf Mountain over Rio beaches at sunset, festive energetic atmosphere.',
    palette: ['#22c55e', '#3b82f6', '#fde047'],
    tone: 'bright',
  },
  {
    id: 'machu-picchu',
    name: '马丘比丘',
    description: '天空之城、印加遗迹、神秘山脉',
    scene: 'Mystical Machu Picchu ruins at dawn, dramatic Andean peaks and low clouds.',
    palette: ['#059669', '#78716c', '#fef3c7'],
    tone: 'fantasy',
  },
  {
    id: 'australian-outback',
    name: '澳洲内陆',
    description: '乌鲁鲁红岩、旷野星空、原始力量',
    scene: 'Uluru glowing deep red at sunset, product on red earth, vast Australian outback.',
    palette: ['#b91c1c', '#7c2d12', '#f97316'],
    tone: 'warm',
  },
  {
    id: 'amalfi-coast',
    name: '阿马尔菲海岸',
    description: '悬崖小镇、地中海蓝、柠檬清香',
    scene: 'Cliffside Positano on Amalfi Coast, terracotta balcony, turquoise sea and bougainvillea.',
    palette: ['#38bdf8', '#fde047', '#f97316'],
    tone: 'bright',
  },
  {
    id: 'banff-canada',
    name: '加拿大班夫',
    description: '镜面湖泊、落基山脉、宁静森林',
    scene: 'Moraine Lake in Banff, Rocky Mountains reflected in turquoise water, pristine calm.',
    palette: ['#0891b2', '#3730a3', '#f8fafc'],
    tone: 'cool',
  },
  {
    id: 'thailand-islands',
    name: '泰国海岛',
    description: '长尾船、石灰岩悬崖、热带天堂',
    scene: "Thailand Phi Phi limestone cliffs over emerald water, edge of a traditional long-tail boat.",
    palette: ['#34d399', '#67e8f9', '#fef3c7'],
    tone: 'bright',
  },
  {
    id: 'dubai-desert',
    name: '迪拜沙漠',
    description: '金色沙丘、奢华营地、落日余晖',
    scene: 'Golden Dubai sand dunes at sunset, luxurious Arabian carpet at desert camp.',
    palette: ['#d97706', '#881337', '#fef3c7'],
    tone: 'luxury',
  },
  {
    id: 'african-safari',
    name: '非洲草原',
    description: '金合欢树、日落剪影、狂野生命',
    scene: 'Serengeti savanna at sunset, acacia tree silhouette, safari vehicle hood, adventure mood.',
    palette: ['#f97316', '#991b1b', '#fde68a'],
    tone: 'warm',
  },
]

export function getFoodAdStyle(id: FoodAdStyleKey | null | undefined): FoodAdStyle {
  return FOOD_AD_STYLES.find((style) => style.id === id) || FOOD_AD_STYLES[0]
}

export function createSampleFoodImage(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1f2937"/><stop offset=".55" stop-color="#111827"/><stop offset="1" stop-color="#0f766e"/></linearGradient>
    <radialGradient id="glow" cx=".5" cy=".42" r=".55"><stop stop-color="#fde68a" stop-opacity=".55"/><stop offset="1" stop-color="#fde68a" stop-opacity="0"/></radialGradient>
    <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="28" stdDeviation="24" flood-color="#000" flood-opacity=".45"/></filter>
  </defs>
  <rect width="900" height="900" rx="70" fill="url(#bg)"/>
  <circle cx="450" cy="360" r="360" fill="url(#glow)"/>
  <ellipse cx="450" cy="690" rx="270" ry="52" fill="#000" opacity=".34"/>
  <g filter="url(#shadow)">
    <path d="M259 483c29-124 116-214 214-214 112 0 190 84 210 214 6 38-25 73-64 73H323c-42 0-74-34-64-73z" fill="#f5c267"/>
    <path d="M314 481c25-82 84-139 161-139 83 0 137 56 153 139" fill="none" stroke="#8a4c18" stroke-width="18" stroke-linecap="round" opacity=".55"/>
    <path d="M362 452c16-39 54-71 103-71 53 0 89 29 104 72" fill="none" stroke="#fff3c4" stroke-width="12" stroke-linecap="round" opacity=".72"/>
    <circle cx="351" cy="424" r="10" fill="#7c2d12" opacity=".55"/>
    <circle cx="438" cy="372" r="9" fill="#7c2d12" opacity=".52"/>
    <circle cx="546" cy="420" r="11" fill="#7c2d12" opacity=".55"/>
  </g>
  <text x="450" y="125" text-anchor="middle" fill="#f8fafc" font-family="Inter, Arial" font-size="58" font-weight="800">7AM BREAD</text>
  <text x="450" y="172" text-anchor="middle" fill="#99f6e4" font-family="Inter, Arial" font-size="28" font-weight="600">sample product photo</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function createFoodAdProject(overrides: Partial<FoodAdProject> = {}): FoodAdProject {
  const now = Date.now()
  return {
    id: overrides.id || createFoodAdId('foodad'),
    productName: overrides.productName || '',
    productType: overrides.productType || '美食 / 饮品',
    originalImageUrl: overrides.originalImageUrl ?? null,
    originalFileName: overrides.originalFileName,
    selectedStyleId: overrides.selectedStyleId || null,
    generatedImages: overrides.generatedImages || [],
    lastPrompt: overrides.lastPrompt || '',
    notes: overrides.notes || [],
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
  }
}

export function createSampleFoodAdProject(): FoodAdProject {
  return createFoodAdProject({
    productName: '七点谷力手作吐司',
    productType: '烘焙食品',
    originalImageUrl: createSampleFoodImage(),
    originalFileName: '7am-bread-sample.svg',
    selectedStyleId: 'rembrandt-dark',
    notes: ['源项目：美食与饮品 · 广告大片生成器', '样例用于验证上传、Vibe 选择、四图生成和下载链路。'],
  })
}

export function loadFoodAdCrafterState(): FoodAdCrafterState {
  if (typeof window === 'undefined') return { projects: [], activeProjectId: null }
  try {
    const raw = window.localStorage.getItem(FOOD_AD_STORAGE_KEY)
    if (!raw) return { projects: [], activeProjectId: null }
    const parsed = JSON.parse(raw) as Partial<FoodAdCrafterState>
    const projects = Array.isArray(parsed.projects) ? parsed.projects : []
    return {
      projects,
      activeProjectId: parsed.activeProjectId && projects.some((item) => item.id === parsed.activeProjectId) ? parsed.activeProjectId : projects[0]?.id || null,
    }
  } catch {
    return { projects: [], activeProjectId: null }
  }
}

export function saveFoodAdCrafterState(state: FoodAdCrafterState) {
  if (typeof window === 'undefined') return
  const compact: FoodAdCrafterState = {
    ...state,
    projects: state.projects.slice(0, 12),
  }
  window.localStorage.setItem(FOOD_AD_STORAGE_KEY, JSON.stringify(compact))
}

export function getActiveFoodAdProject(state: FoodAdCrafterState): FoodAdProject | null {
  return state.projects.find((project) => project.id === state.activeProjectId) || state.projects[0] || null
}

export function patchFoodAdProject(
  state: FoodAdCrafterState,
  projectId: string,
  updater: (project: FoodAdProject) => FoodAdProject,
): FoodAdCrafterState {
  return {
    ...state,
    projects: state.projects.map((project) => (project.id === projectId ? { ...updater(project), updatedAt: Date.now() } : project)),
  }
}
