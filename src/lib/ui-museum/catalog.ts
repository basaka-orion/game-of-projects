import type { UiStyleItem, UiStyleMasterProfile, UiStyleSpec, UiVisualPattern, UiVisualTokens } from './types'

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
  ['m3-expressive', 'T0', 'Material 3 Expressive (表现型M3)', '2025-2026 趋势：更大胆的形状、动态色、状态层、情绪化动效。', 'Android 原生、健康社交、AI 助手、跨端消费产品。'],
  ['canvas-ai', 'T0', 'Canvas AI (画布式智能)', '2026 趋势：聊天升级为画布、节点、可编辑生成块和执行链。', 'AI 设计工具、产品生成器、知识工作台、Agent IDE。'],
  ['xai-transparency', 'T0', 'Explainable AI (可解释透明)', '2026 趋势：把模型推理、证据、置信度和责任链变成可审计界面。', 'AI 决策系统、医疗/金融辅助、企业 Copilot、审稿工具。'],
  ['multimodal-gesture', 'T0', 'Multimodal Gesture (多模态手势)', '2026 趋势：语音、摄像头、手势、传感器和触控共同驱动界面。', '空间计算、车载、智能家居、可穿戴、无障碍辅助。'],
  ['adaptive-a11y', 'T0', 'Adaptive Accessibility (可访问性自适应)', '2026 趋势：根据视觉、运动、认知负荷实时调整密度、对比和动效。', '公共服务、教育、医疗、长期使用型工具、老年友好产品。'],
  ['micro-sonic', 'T0', 'Micro-Sonic UI (微声音反馈)', '2026 趋势：短音色、触感、节奏和静音降级成为状态语言。', '创作工具、冥想健康、游戏化任务、车载/穿戴界面。'],
  ['barely-there', 'T1', 'Barely-There UI (隐形极简)', '趋势：界面退到背景，保留极少控制、上下文提示和高信噪比内容。', 'AI 阅读器、高端 SaaS、专注工具、隐私工作台。'],
  ['human-touch-ai', 'T1', 'Human Touch AI (人手痕迹)', '趋势：反模板、手写标注、真实材料、人工修订痕迹对冲 AI 同质化。', '创作者工具、个人品牌、教育讲义、独立产品。'],
  ['soft-maximalism', 'T1', 'Soft Maximalism (柔性繁复)', '趋势：高信息量、多图层、繁复色彩，但用柔和边界和清晰层级控制噪声。', '文化媒体、时尚美妆、活动页、年轻社区。'],
  ['intent-friction', 'T1', 'Intentional Friction (慎思阻尼)', '趋势：为高风险操作加入可见阻尼、确认语义、慢按钮和证据停顿。', '金融、医疗、AI 发布、数据删除、审批工作流。'],
  ['spaceship-manual', 'T1', 'Spaceship Manual (飞船说明书)', '趋势：太空手册、仪表舱、技术说明书和参数化控制台回潮。', '硬件、航天感品牌、开发者工具、工业控制。'],
  ['local-first-ledger', 'T1', 'Local-First Ledger (本地优先账本)', '趋势：把隐私、本地存储、同步冲突、审计日志变成可信视觉结构。', '个人知识库、外脑系统、离线优先工具、合规协作。'],
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

type StyleMasterProfileSeed = {
  referenceBrief: string
  signature: string
  composition: string
  material: string
  typography: string
  controls: string
  motion: string
  antiPattern: string
}

const styleMasterProfileSeeds: Record<string, StyleMasterProfileSeed> = {
  'neuro-morphic': {
    referenceBrief: '参考生物反馈仪、脑机接口和疗愈型健康产品，把界面当成会呼吸的神经系统。',
    signature: '第一眼必须出现有机脉冲、柔性节点和类似生物膜的层级。',
    composition: '中心呼吸环或生命体面板承载主动作，周围用低密度指标环绕。',
    material: '柔雾、半透明细胞膜、微弱荧光和低对比深场。',
    typography: '圆润 sans 搭配少量 mono 生理数据，不使用硬朗企业字重。',
    controls: '按钮像柔软组织被按压，滑杆和卡片要带呼吸反馈。',
    motion: '缓慢缩放、脉冲、同步呼吸节奏，避免快闪。',
    antiPattern: '不能做成普通健康 App 卡片或通用绿色仪表盘。',
  },
  'quantum-glass': {
    referenceBrief: '参考光学棱镜、空间计算玻璃和奢侈数字展厅，强调真实折射而非普通透明。',
    signature: '必须有色散边缘、深度错层和可读的棱镜焦点。',
    composition: '主面板像被折射的光学仪器，次级信息沿光束或层片展开。',
    material: '透明玻璃、焦散光、冷色高光和暗场反射。',
    typography: '窄体 sans 与细线 mono 标签，避免厚重字体压垮光学感。',
    controls: '按钮像透镜或光闸，focus 时出现折射边缘。',
    motion: '轻微位移、角度切换、光束扫过，保持低噪声。',
    antiPattern: '不能只加 backdrop-filter 就声称是量子玻璃。',
  },
  'ambient-aura': {
    referenceBrief: '参考环境计算、沉浸阅读和氛围音乐产品，让光场成为界面骨架。',
    signature: '界面边界应弱化，主状态由柔光、色温和空气感承载。',
    composition: '大面积暗场或静场，少量浮现控件围绕当前任务。',
    material: '柔光雾面、低边框、细颗粒和空气层。',
    typography: '轻字重 sans 或安静 serif，行距放松。',
    controls: '控件像从环境中浮现，hover 才增强边界。',
    motion: '呼吸式亮度、慢速位移和淡入淡出。',
    antiPattern: '不能变成浅灰极简卡片，也不能用高饱和按钮破坏氛围。',
  },
  'hyper-brutalism': {
    referenceBrief: '参考新粗野主义网页、独立游戏菜单和街头海报，把粗粝冲击转成可操作系统。',
    signature: '粗黑边、硬阴影、极强色块和按压感必须同时出现。',
    composition: '非对称块级布局，主操作占据强视觉位置。',
    material: '纯色硬块、黑线、冲撞色和纸面粗颗粒。',
    typography: '超大 display 与粗体 sans，标签可用 mono。',
    controls: '按钮必须像实体砖块，pressed 状态明显下沉。',
    motion: '短促、撞击式、带位移的反馈。',
    antiPattern: '不能只用黑边框套普通 SaaS 卡片。',
  },
  'copilot-ai': {
    referenceBrief: '参考 AI 编程副驾驶、执行日志和工具调用面板，把 Agent 状态做成主界面。',
    signature: '必须看见流式任务、工具回执、下一步建议和人工确认。',
    composition: '左侧任务流或中轴执行线，右侧显示上下文与结果。',
    material: '深色工作台、状态芯片、流式日志和高亮执行块。',
    typography: 'mono 日志搭配清晰 sans 操作文字。',
    controls: '运行、暂停、审查、确认按钮必须区分风险级别。',
    motion: '流式输出、队列推进和完成回执。',
    antiPattern: '不能只显示一个聊天框或机器人头像。',
  },
  'zero-ui': {
    referenceBrief: '参考环境计算、IoT 中枢和无感支付，核心是按需显现而不是没有界面。',
    signature: '主要内容安静，控制只在上下文需要时出现。',
    composition: '内容/环境占主导，操作层以浮动提示和情境按钮出现。',
    material: '极低边界、透明提示、环境色和细小状态点。',
    typography: '极少文字，字号克制，文案必须直接。',
    controls: '控件默认隐藏或弱化，focus/hover/触发时清楚显形。',
    motion: '淡入、贴近目标、任务完成后退场。',
    antiPattern: '不能把控件全部藏到用户找不到，也不能变成普通极简。',
  },
  'data-ink': {
    referenceBrief: '参考 Tufte 数据墨水哲学、金融终端和科研图表，所有像素都必须服务信息。',
    signature: '高数据-墨水比、轴线、表格、指标和证据链必须可读。',
    composition: '指标优先，表格/图表承载主体，装饰最少。',
    material: '白底或浅底、细线、低噪声色彩和清晰分隔。',
    typography: '数字用 mono，正文用高可读 sans。',
    controls: '筛选、排序、比较、导出必须像分析工具而非营销按钮。',
    motion: '极短状态反馈，不做无意义动画。',
    antiPattern: '不能用大面积渐变、装饰插画或低信息密度卡片。',
  },
  'emotion-adaptive': {
    referenceBrief: '参考心理健康、情绪日记和陪伴产品，界面要随用户状态调整强度。',
    signature: '色温、节奏、反馈强度和提示语必须能表达情绪适配。',
    composition: '中央情绪状态或陪伴面板，周围提供低压下一步。',
    material: '柔和渐变、圆润卡片、低刺激对比和温暖光感。',
    typography: '亲和 sans，避免压迫性大字。',
    controls: '主操作要低压，危险/焦虑状态下降低动效和密度。',
    motion: '舒缓过渡、慢呼吸、轻触感节奏。',
    antiPattern: '不能用通用可爱贴纸替代真实情绪状态。',
  },
  'agentic-os': {
    referenceBrief: '参考多智能体编排、任务队列和自动化操作系统，让代理协作透明可控。',
    signature: '多 Agent、队列、移交、阻塞和人类批准必须可见。',
    composition: '网格或泳道展示代理角色，主线显示任务状态。',
    material: '深色操作系统面板、状态光点、队列轨道和回执卡。',
    typography: 'mono 状态码搭配高效 sans。',
    controls: '派发、暂停、接管、批准、回滚必须是一级组件。',
    motion: '队列推进、节点接力、状态灯切换。',
    antiPattern: '不能只做成普通项目管理看板。',
  },
  'wabi-sabi': {
    referenceBrief: '参考侘寂美学、茶室、手工纸和静态阅读空间，把不完美转成秩序。',
    signature: '自然不对称、纸感、低对比和留白必须明显。',
    composition: '不完全居中的主内容，边缘保留手工痕迹。',
    material: '纸张、土色、微裂纹、自然阴影。',
    typography: '克制 serif 或人文 sans，字距自然。',
    controls: '按钮像小纸签或器物标签，状态要安静。',
    motion: '缓慢、几乎不可见，只用于状态转换。',
    antiPattern: '不能做成普通米色卡片或咖啡馆模板。',
  },
  chromium: {
    referenceBrief: '参考液态金属、镜面产品视觉和暗黑未来品牌，重点是可控反射。',
    signature: '深石墨、镜面银、高光切线和少量危险色必须出现。',
    composition: '大块镜面舞台承载主视觉，信息用细边框嵌入。',
    material: '铬金、液态反射、硬高光和黑色镜面。',
    typography: '冷峻 display 或压缩 sans，辅助信息用 mono。',
    controls: '按钮像金属拨片，hover 时出现镜面扫光。',
    motion: '高光滑过、液态微变形、短促锁定。',
    antiPattern: '不能退化成银色渐变或普通暗色后台。',
  },
  kinetic: {
    referenceBrief: '参考动态排印、音乐节视觉和可变字体实验，让文字成为界面本体。',
    signature: '大字级差、拉伸、错位和运动节奏必须主导页面。',
    composition: '排版即布局，控件嵌入文字节奏而非独立漂浮。',
    material: '平面强色、硬切换、印刷式遮挡。',
    typography: '可变字体、超大 display、少量 mono 节拍标签。',
    controls: '按钮像可按压字块，输入框也要服从排印节奏。',
    motion: '字重、宽度、位置和节拍变化。',
    antiPattern: '不能只把标题放大而组件仍是普通卡片。',
  },
  dreamcore: {
    referenceBrief: '参考 Dreamcore、Y2K 空气感和早期数字梦境，强调熟悉但不稳定。',
    signature: '柔焦、漂浮、童年电脑感和轻微超现实必须出现。',
    composition: '漂浮窗口、空旷背景、非线性小物件构成场景。',
    material: '半透明塑料、水晶泡、柔光和轻雾。',
    typography: '圆润复古 sans，辅以低像素系统提示。',
    controls: '控件像旧系统里的梦境按钮，反馈轻且带延迟。',
    motion: '慢漂浮、柔焦切换、轻微眩晕感。',
    antiPattern: '不能只做粉蓝渐变或普通 Y2K 贴纸。',
  },
  spatial: {
    referenceBrief: '参考空间计算、桌面窗口系统和 Bento 信息组织，强调深度和焦点。',
    signature: '层叠窗口、深度阴影、聚焦面板和模块化信息块必须出现。',
    composition: 'Bento 模块在 Z 轴上分层，主任务保持最大焦点。',
    material: '半透明深层、光照追踪、柔和边界。',
    typography: '现代 sans，数字标签克制。',
    controls: '控件贴合窗口层级，选中态像空间聚焦。',
    motion: '轻微景深、层级推进、窗口吸附。',
    antiPattern: '不能把 Bento 做成平面卡片堆。',
  },
  holographic: {
    referenceBrief: '参考物理镭射箔、时尚杂志封面和数字收藏品，强调光谱而非单色渐变。',
    signature: '虹彩反射、噪点、角度变化和薄膜边缘必须出现。',
    composition: '主视觉像镭射封套，信息沿光谱切片排布。',
    material: '全息膜、箔片、细噪点和高亮边。',
    typography: '细长 display 或时尚 serif，标签要轻。',
    controls: '按钮像镭射贴纸，状态随角度变光。',
    motion: '光谱流动、薄膜闪烁、角度扫光。',
    antiPattern: '不能只用彩虹渐变背景。',
  },
  dither: {
    referenceBrief: '参考 1-bit 图形、Atkinson 抖动和早期计算机界面，强调低保真技术美学。',
    signature: '黑白网点、硬边窗口、等宽字和键盘状态必须出现。',
    composition: '窗口式块面，图像区用抖动纹理承载焦点。',
    material: '1-bit 点阵、扫描线、粗颗粒。',
    typography: '严格 mono，不混入圆润现代字体。',
    controls: '按钮像终端命令或位图按钮，焦点框清晰。',
    motion: '帧切换、闪烁光标、低帧率反馈。',
    antiPattern: '不能混成彩色像素游戏风。',
  },
  risograph: {
    referenceBrief: '参考孔版印刷、独立刊物和艺术展海报，强调油墨错位和纸张温度。',
    signature: '套色偏移、粗颗粒、纸底和手工印刷误差必须出现。',
    composition: '海报式大块排版，信息像印刷层逐步叠加。',
    material: '纸纹、油墨、叠印色和轻微脏污。',
    typography: '人文 sans 或粗体 display，允许轻微错位。',
    controls: '按钮像印刷标签，hover 出现套印偏移。',
    motion: '轻微错版、油墨压印、纸张翻动。',
    antiPattern: '不能做成干净矢量插画风。',
  },
  ethereal: {
    referenceBrief: '参考冥想、护肤和神圣失重视觉，强调过曝柔光和安静漂浮。',
    signature: '高亮柔雾、失重层、低边界和温和光晕必须出现。',
    composition: '大留白中漂浮少量核心内容，避免密集控件。',
    material: '柔雾、珍珠光、轻颗粒和透明层。',
    typography: '细字重 sans 或柔和 serif，行距宽。',
    controls: '按钮要像光斑或轻薄标签，反馈柔和。',
    motion: '慢漂浮、柔光扩散、呼吸淡入。',
    antiPattern: '不能用廉价发光边框或高饱和霓虹。',
  },
  'anthropic-serif': {
    referenceBrief: '参考人文智性 AI、长阅读杂志和暖纸编辑系统，强调思考空间。',
    signature: '暖纸底、衬线标题、克制按钮和可阅读长文必须出现。',
    composition: '编辑页结构，主内容像一篇可交互文章。',
    material: '纸张、墨色、细线、温暖阴影。',
    typography: 'serif 标题搭配人文 sans 正文。',
    controls: '按钮低调但清晰，引用和证据要像编辑批注。',
    motion: '翻页、展开、轻微高亮，不抢阅读。',
    antiPattern: '不能做成普通聊天机器人界面。',
  },
  'ai-abstract': {
    referenceBrief: '参考神经网络可视化、潜空间图谱和生成式抽象，强调 AI 内部结构可感知。',
    signature: '粒子、突触、潜空间波动和计算状态必须出现。',
    composition: '核心模型场在中心，参数和结果围绕其展开。',
    material: '深色场、发光粒子、细线网格和半透明浮层。',
    typography: '科技 sans 与 mono 参数标签。',
    controls: '控件像调参节点，状态显示模型运行阶段。',
    motion: '粒子流、节点激活、潜空间变形。',
    antiPattern: '不能只是抽象背景图加普通表单。',
  },
  'blueprint-cad': {
    referenceBrief: '参考 CAD、ISO 工程图和精密仪器软件，把测量感作为界面骨架。',
    signature: '蓝图网格、十字准星、尺寸标注和参数吸附必须出现。',
    composition: '主画布用工程图组织，侧栏承载参数和层级。',
    material: '深蓝纸、细白线、测量标注、低噪声网格。',
    typography: 'mono 工程标签，正文也保持技术冷静。',
    controls: '按钮像工具栏命令，选中态要有测量线或吸附点。',
    motion: '吸附、标尺移动、准星对齐。',
    antiPattern: '不能变成普通蓝色后台。',
  },
  'liquid-glass': {
    referenceBrief: '参考 Apple 材质体系、空间计算和动态玻璃，强调内容之上的可读流体材质。',
    signature: '透明、折射、流动边缘、内容感知高光必须出现。',
    composition: '玻璃层悬浮在内容之上，主操作与背景保持深度关系。',
    material: '液态玻璃、动态焦散、半透明高光。',
    typography: '系统 sans，字重依赖层级而非装饰。',
    controls: '控件像可变形玻璃胶囊，pressed 时有材质压缩。',
    motion: '流体追随、材质响应、空间层级切换。',
    antiPattern: '不能只是透明白卡片或固定模糊。',
  },
  'skeuo-nature': {
    referenceBrief: '参考生物亲和设计、自然材料和数字疗愈，让自然材质承担信任。',
    signature: '木纹、叶脉、自然光、柔和边缘必须出现。',
    composition: '主操作像自然仪式，状态沿季节或生长线索展开。',
    material: '木、纸、植物、自然阴影。',
    typography: '温和 sans 或自然 serif，避免科技感过重。',
    controls: '按钮像木牌或叶片标签，反馈像触碰自然材料。',
    motion: '生长、展开、轻风、慢速过渡。',
    antiPattern: '不能只把绿色作为主题色。',
  },
  'skeuo-stone': {
    referenceBrief: '参考银行金库、石材和金属控件，把重量感转为安全感。',
    signature: '石材、金属、厚重阴影和阻尼操作必须出现。',
    composition: '主信息像保险箱门或基座，风险操作有沉重确认。',
    material: '大理石、金属、深色缝隙和冷高光。',
    typography: '稳重 serif 或金融 sans，数字用 mono。',
    controls: '按钮像机械锁扣，pressed 有明显阻尼。',
    motion: '慢速锁定、沉重滑动、确认回响。',
    antiPattern: '不能变成奢侈品海报或普通暗金配色。',
  },
  '3d-interactive': {
    referenceBrief: '参考实时 3D 产品展示、游戏化 UI 和创意工具，把 Z 轴变成功能。',
    signature: '可操作 3D 物体、光照、阴影和视角状态必须出现。',
    composition: '主物体占据核心，工具和指标围绕 3D 场景。',
    material: '真实光照、立体阴影、材质球和空间网格。',
    typography: '现代 sans，标签贴近对象但不遮挡。',
    controls: '旋转、缩放、聚焦、切换材质必须有明确反馈。',
    motion: '3D 旋转、视角过渡、物理缓动。',
    antiPattern: '不能把 3D 当静态装饰图。',
  },
  'aurora-mesh': {
    referenceBrief: '参考极光渐变、品牌动态背景和沉浸阅读，强调低干扰色彩引导。',
    signature: '流体色团、网格微纹理和非侵入式焦点必须出现。',
    composition: '渐变场承载情绪，内容用清晰浮层保持可读。',
    material: '柔和渐变、微噪声、半透明层。',
    typography: '干净 sans，避免花哨字形。',
    controls: '按钮从渐变中提取单一强调色，状态不能混乱。',
    motion: '极慢色场移动、轻微网格呼吸。',
    antiPattern: '不能做成一坨无层级的彩色背景。',
  },
  'atomic-age': {
    referenceBrief: '参考 1950s Atomic Age 平面广告、原子轨道、星爆和太空竞赛海报，强调科技乐观主义。',
    signature: '原子轨道、星爆、抛物线、斜切海报和复古科技色必须出现。',
    composition: '斜向海报结构，主行动像发射按钮。',
    material: '平面印刷色、半调颗粒、原子轨道图形和硬边色块。',
    typography: '1950s 广告 display 与紧凑 sans。',
    controls: '按钮像火箭发射 CTA 或展会控制台。',
    motion: '星爆弹出、轨道旋转、快速切换。',
    antiPattern: '不能混成 Googie 家居舱、普通 Memphis 或儿童插画。',
  },
  jetsons: {
    referenceBrief: '参考 Googie 建筑、The Jetsons 家庭自动化想象、飞碟屋和太空时代家居。',
    signature: '圆顶舱、悬浮住宅、机器人管家、家电自动化按钮和透明支柱必须出现。',
    composition: '围绕家庭舱体、悬浮模块和自动化任务分区，而不是海报式星爆。',
    material: '浅色塑料、透明圆顶、镀铬细腿、奶油色墙面和糖果色控制灯。',
    typography: '圆润 retro-future sans，标签短、轻快、家居化。',
    controls: '按钮像家居自动化遥控台，必须有“自动/管家/例程”状态。',
    motion: '悬浮、弹跳、滑轨送入、机械臂轻快响应。',
    antiPattern: '不能只放星爆或轨道图形冒充 Jetsons；缺少家居自动化就退回 Atomic Age。',
  },
  'solarpunk-utopia': {
    referenceBrief: '参考太阳朋克、新艺术曲线和社区可持续系统，强调温暖慢技术。',
    signature: '自然曲线、太阳光、社区感和绿色基础设施必须出现。',
    composition: '内容像社区公告与能源流线混合组织。',
    material: '暖纸、植物、太阳光、手工曲线。',
    typography: '人文 sans 或柔和 serif，避免冰冷科技感。',
    controls: '按钮像社区工具或能源开关，状态显示影响。',
    motion: '生长、日照变化、柔和展开。',
    antiPattern: '不能只做绿色环保模板。',
  },
  'brutal-bw': {
    referenceBrief: '参考反乌托邦粗野主义、黑白新闻和黑客工具，强调赤裸真相。',
    signature: '黑白、硬切、低装饰、强文字冲击必须出现。',
    composition: '标题和事实优先，布局故意直接甚至压迫。',
    material: '纯黑白、粗线、报纸式切块。',
    typography: '压缩 display、mono 和硬朗 sans。',
    controls: '按钮像警告或命令，状态必须高对比。',
    motion: '硬切、闪烁、无缓动。',
    antiPattern: '不能加入柔和渐变或装饰插画。',
  },
  'gen-ui': {
    referenceBrief: '参考生成式 UI、超个性化系统和意图驱动界面，强调实时重组。',
    signature: '布局随意图变化、组件生成痕迹和用户状态必须出现。',
    composition: '模块可重排，主界面显示当前意图和生成依据。',
    material: '适应性色块、状态边框、生成中占位块。',
    typography: '系统 sans + mono 状态标签。',
    controls: '用户可锁定、重生、回滚或解释生成结果。',
    motion: '组件重排、形态转换、渐进生成。',
    antiPattern: '不能只给用户换主题色。',
  },
  bento: {
    referenceBrief: '参考 iOS 系统组件、Linear 仪表盘和模块化产品首页，强调清晰信息盒。',
    signature: '模块化网格、大圆角、清楚层级和高完成度间距必须出现。',
    composition: '不同尺寸信息块组合成稳定仪表盘。',
    material: '干净表面、柔和阴影、少量强调色。',
    typography: '现代 sans，数字和标签层级明确。',
    controls: '卡片本身可操作，按钮嵌入模块语义。',
    motion: '模块轻微抬升、重排和完成反馈。',
    antiPattern: '不能把所有卡片做成同尺寸列表。',
  },
  material: {
    referenceBrief: '参考 Google Material You 与 Android 动态色，强调 tonal surface 和状态层。',
    signature: '动态色、大圆角、状态层、ripple 和触控面积必须出现。',
    composition: 'Material 导航、卡片、FAB 和表单组成清晰移动层级。',
    material: 'tonal surface、elevation、动态色调。',
    typography: 'Material 系统字阶，不使用过度装饰字体。',
    controls: 'FAB、Switch、TextField、Card 必须带状态层。',
    motion: 'ripple、container transform、pressed 状态。',
    antiPattern: '不能用 iOS/网页组件冒充 Android 原生。',
  },
  minimal: {
    referenceBrief: '参考极简建筑、高端品牌官网和瑞士留白，强调少即是准。',
    signature: '极少元素、强留白、黑白灰控制和精准排版必须出现。',
    composition: '单一主轴，内容与空白共同构成界面。',
    material: '纯色、细线、无阴影或极弱阴影。',
    typography: '干净 sans 或高端 serif，字阶必须精确。',
    controls: '按钮和输入极少但焦点态清楚。',
    motion: '几乎无动画，只做必要反馈。',
    antiPattern: '不能因为少内容而显得空洞或未完成。',
  },
  'm3-expressive': {
    referenceBrief: '参考 Google Material 3 Expressive 的情绪化形状、动态色和可访问触控。',
    signature: '大胆形状、情绪化颜色、状态层和大触控目标必须出现。',
    composition: '导航、FAB、卡片和状态芯片形成活泼但有秩序的移动界面。',
    material: 'tonal surface、动态色、圆润容器和层级阴影。',
    typography: 'Material 字阶加强表情，不随意换品牌字体。',
    controls: '按钮、FAB、chips、switch 都要有 pressed/ripple 状态。',
    motion: '富有表情但不眩晕的 container transform。',
    antiPattern: '不能只把 Material You 改成粉色圆角。',
  },
  'canvas-ai': {
    referenceBrief: '参考 AI 画布、节点编辑器和 Agent IDE，把聊天变成可编辑执行空间。',
    signature: '节点、生成块、工具回执、执行链和人工确认必须出现。',
    composition: '中心画布承载生成块，侧栏显示运行历史和证据。',
    material: '深色节点网格、发光连线、回执卡。',
    typography: 'mono 状态与清晰 sans 说明。',
    controls: '生成、连接、批准、回放、撤销都是一级操作。',
    motion: '节点生成、连线激活、执行链回放。',
    antiPattern: '不能仍然是单列聊天消息。',
  },
  'xai-transparency': {
    referenceBrief: '参考可解释 AI、审计日志和决策支持系统，强调结论背后的理由。',
    signature: '证据链、置信度、模型状态、人工复核和失败解释必须出现。',
    composition: '结论与证据并排，风险和来源保持可追溯。',
    material: '审计网格、白底表格、可信蓝绿状态。',
    typography: 'mono 证据编号和清晰正文。',
    controls: '查看来源、复核、标记风险、导出审计必须可见。',
    motion: '证据展开、置信度变化、复核状态切换。',
    antiPattern: '不能只给一个漂亮结论。',
  },
  'multimodal-gesture': {
    referenceBrief: '参考语音、手势、摄像头、车载和穿戴界面，把不可见输入转成状态。',
    signature: '声波、手势轨迹、传感器状态和降级控制必须出现。',
    composition: '输入状态在中心，触控和语音/手势分层并行。',
    material: '深色传感器场、波形、轨迹和焦点环。',
    typography: '短标签 sans，状态值用 mono。',
    controls: '语音、手势、触控、相机权限和降级按钮必须明确。',
    motion: '波形、轨迹、识别反馈和权限切换。',
    antiPattern: '不能只放麦克风图标。',
  },
  'adaptive-a11y': {
    referenceBrief: '参考无障碍系统、公共服务和长期使用型工具，把可访问性做成核心视觉。',
    signature: '高对比、字号/密度控制、键盘焦点和低动效状态必须出现。',
    composition: '主界面清楚分区，所有控件都有可见标签和状态。',
    material: '纯净高对比、清晰边框、少阴影。',
    typography: '高可读 sans，字阶和行距可调。',
    controls: '字号、对比、动效、密度、键盘路径必须可操作。',
    motion: '默认克制，提供低动效降级。',
    antiPattern: '不能把无障碍当成设置页角落里的开关。',
  },
  'micro-sonic': {
    referenceBrief: '参考声音设计、触感反馈和创作工具，把短音色转译为视觉状态。',
    signature: '波形、节拍、触感回执和静音降级必须出现。',
    composition: '状态沿时间轴或声波轨道组织，主操作同步节奏。',
    material: '深色声场、波形条、霓虹细线。',
    typography: 'mono 节拍标签搭配现代 sans。',
    controls: '播放、静音、触感、强度、节拍都要可见。',
    motion: '波形脉冲、节奏反馈、静音状态收敛。',
    antiPattern: '不能依赖真实声音而缺少视觉反馈。',
  },
  'barely-there': {
    referenceBrief: '参考隐形界面、专注阅读和高端生产力工具，强调高信噪比。',
    signature: '界面退后、内容前置、控件按需浮现和极少状态必须出现。',
    composition: '内容占据首位，操作只在边缘或上下文出现。',
    material: '白底、细线、微阴影和低饱和状态。',
    typography: '极清晰 sans，字阶克制。',
    controls: '控件必须少但可发现，焦点态不能消失。',
    motion: '淡入淡出、上下文浮现、完成后退场。',
    antiPattern: '不能因为隐形而不可用。',
  },
  'human-touch-ai': {
    referenceBrief: '参考手写批注、编辑修订和人工创作者工作台，对抗 AI 模板感。',
    signature: '手写标注、修订线、纸感和不完全对齐必须出现。',
    composition: '人工批注层覆盖在 AI 输出上，主内容仍保持可读。',
    material: '纸张、墨迹、胶带、修订痕迹。',
    typography: '手写 Display 只作标注，正文保持可读。',
    controls: '接受修改、保留人工痕迹、对比版本必须可见。',
    motion: '划线、批注出现、版本对比。',
    antiPattern: '不能用廉价手写字体污染全部正文。',
  },
  'soft-maximalism': {
    referenceBrief: '参考时尚媒体、文化社区和柔性繁复排版，强调丰富但不失控。',
    signature: '多层图形、饱和色、丰富内容和柔边层级必须出现。',
    composition: '复杂内容按节奏分组，主次关系清楚。',
    material: '柔和玻璃、花形层、渐变和纸感混合。',
    typography: 'display 标题与清晰正文形成对比。',
    controls: '按钮和卡片可繁复，但状态边界必须明确。',
    motion: '层叠进入、轻微弹性、聚焦时降噪。',
    antiPattern: '不能把繁复变成噪声墙。',
  },
  'intent-friction': {
    referenceBrief: '参考金融、医疗、AI 发布和高风险删除流程，把阻尼设计成责任界面。',
    signature: '风险解释、慢按钮、二次确认、撤销和审计收据必须出现。',
    composition: '危险动作前必须出现证据停顿和影响摘要。',
    material: '高对比警示、斜纹、硬边、审计卡。',
    typography: 'mono 风险编号和清晰 sans 说明。',
    controls: '确认语义、计时、撤销、人工批准都要成套。',
    motion: '故意变慢、倒计时、确认锁定。',
    antiPattern: '不能用普通 confirm 弹窗替代慎思流程。',
  },
  'spaceship-manual': {
    referenceBrief: '参考飞船操作手册、工业仪表和技术说明书，强调复杂控制可读。',
    signature: '仪表、警示条、参数表、编号注释和命令面板必须出现。',
    composition: '驾驶舱式仪表组配合手册式说明和日志。',
    material: '暗色金属、网格、黄黑警示和技术印刷。',
    typography: 'mono 参数与压缩 sans 标题。',
    controls: '校准、预热、解锁、发射、回滚必须状态清楚。',
    motion: '仪表跳动、警示闪烁、机械锁定。',
    antiPattern: '不能只是普通深色工程后台。',
  },
  'local-first-ledger': {
    referenceBrief: '参考本地优先软件、隐私账本和同步冲突工具，把数据边界可视化。',
    signature: '本地路径、离线状态、同步冲突、隐私边界和审计日志必须出现。',
    composition: '账本式列表与冲突详情并列，主状态显示设备边界。',
    material: '浅色账本、细网格、绿色可信状态和灰色边界。',
    typography: 'mono 日志与清晰正文。',
    controls: '本地保存、冲突合并、锁定审计、导出日志必须可见。',
    motion: '同步状态切换、冲突合并、日志封存。',
    antiPattern: '不能把隐私只写成一句安全文案。',
  },
  glass: {
    referenceBrief: '参考 Windows/VisionOS 毛玻璃和银行卡展示，强调背景关系和层级可读。',
    signature: '半透明、模糊、细白边和背景色映射必须出现。',
    composition: '玻璃卡片悬浮在有信息的背景上，避免空泛透明。',
    material: 'frosted glass、白边、高光、柔阴影。',
    typography: '现代 sans，保持足够对比。',
    controls: '控件在玻璃上必须有明确边界和 focus 状态。',
    motion: '轻微浮动、模糊强度变化。',
    antiPattern: '不能牺牲可读性换透明效果。',
  },
  brutal: {
    referenceBrief: '参考 Gumroad、Figma 社区和 Neo-Brutalism 风格，把玩具化粗野变成产品控件。',
    signature: '粗边框、硬阴影、高饱和和幽默感必须出现。',
    composition: '大块卡片和明显按钮组成直接路径。',
    material: '纯色平面、黑线、硬阴影。',
    typography: '粗体 sans，标题短促。',
    controls: '按钮像可按压贴纸，状态直接粗暴。',
    motion: '下压、弹回、错位。',
    antiPattern: '不能只用黑边而没有视觉态度。',
  },
  acid: {
    referenceBrief: '参考酸性平面、地下音乐和先锋海报，强调失控边缘但仍可操作。',
    signature: '荧光酸色、熔化形态、哥特/异形字体和反网格必须出现。',
    composition: '有意破坏对齐，但主路径必须仍能扫描。',
    material: '液态金属、荧光、暗底、扭曲形。',
    typography: '异形 display 只用于标题，操作文字要可读。',
    controls: '按钮像海报贴片或熔化标签，focus 强烈。',
    motion: '熔化、错位、短闪。',
    antiPattern: '不能让先锋感压倒可用性。',
  },
  aurora: {
    referenceBrief: '参考弥散光品牌页、冥想产品和现代科技营销，强调干净氛围。',
    signature: '高斯色团、梦幻渐变、无框内容和清晰焦点必须出现。',
    composition: '渐变场衬托少量内容，控件保持干净。',
    material: '柔光、模糊色块、透明表面。',
    typography: '现代 sans，避免过多装饰。',
    controls: '按钮提取渐变中的单一强调色。',
    motion: '慢速色团漂移。',
    antiPattern: '不能成为无信息量的渐变背景。',
  },
  memphis: {
    referenceBrief: '参考 Memphis 设计和大厂扁平插画，强调几何幽默和高饱和。',
    signature: '几何图形、撞色、点线图案和插画感必须出现。',
    composition: '图形与内容交替排布，保持轻松节奏。',
    material: '平面色块、矢量形、图案纹理。',
    typography: '圆润 sans 或 display，亲和但不幼稚。',
    controls: '按钮像几何贴片，状态通过形状变化表达。',
    motion: '弹性、旋转、几何切换。',
    antiPattern: '不能把 Memphis 变成儿童教育模板。',
  },
  natural: {
    referenceBrief: '参考自然原生品牌、露营和茶叶电商，把土地感转成可信界面。',
    signature: '大地色、草木绿、手工松弛和真实材料必须出现。',
    composition: '内容像产品手册或自然笔记，节奏舒缓。',
    material: '纸、木、棉麻、自然阴影。',
    typography: '温和 serif 或人文 sans。',
    controls: '按钮像标签或自然物件，反馈轻。',
    motion: '慢速展开、自然滑动。',
    antiPattern: '不能只套米色背景和绿色按钮。',
  },
  personal: {
    referenceBrief: '参考个人博客、独立作品集和创作者品牌，强调不可复制的私人印记。',
    signature: '专属插画、手写痕迹、非模板布局和作者声音必须出现。',
    composition: '个人叙事优先，模块可不规则但要可读。',
    material: '纸张、手绘、照片、贴纸。',
    typography: '个人化 display 与可读正文搭配。',
    controls: '按钮像作者的手工标签。',
    motion: '轻微手作感、卡片翻动。',
    antiPattern: '不能用模板作品集样式假装个性。',
  },
  tactile: {
    referenceBrief: '参考手工艺、针织、纺织和文创电商，把触感做成界面记忆点。',
    signature: '粗糙材质、毛边、针脚和手工剪裁必须出现。',
    composition: '像材料样本册，卡片有真实边缘。',
    material: '织物、纸浆、线缝、阴影。',
    typography: '朴素 sans 或手作 serif。',
    controls: '按钮像布标、吊牌或缝线标签。',
    motion: '轻微挤压、翻页、材料摩擦感。',
    antiPattern: '不能只加纸纹背景。',
  },
  digicute: {
    referenceBrief: '参考数字萌系、盲盒、宠物和二次元社区，强调软萌但可控。',
    signature: '马卡龙、软圆角、像素/贴纸和可爱状态必须出现。',
    composition: '小组件像玩具盒，但主路径清楚。',
    material: '糖果色、柔影、贴纸、像素点缀。',
    typography: '圆润 sans，避免过幼稚低可读字体。',
    controls: '按钮像软糖或贴纸，pressed 有弹性。',
    motion: '弹跳、眨眼、轻微晃动。',
    antiPattern: '不能把可爱做成低龄混乱。',
  },
  microind: {
    referenceBrief: '参考精密仪器、硬件管理和微型工业控制，强调小尺度工程精度。',
    signature: '螺丝、刻度、细线、冷蓝灰和设备状态必须出现。',
    composition: '紧凑仪器面板，参数和控制密集但有序。',
    material: '金属、细网格、冷光、微阴影。',
    typography: 'mono 参数，紧凑 sans 标签。',
    controls: '开关、旋钮、校准按钮必须像设备控件。',
    motion: '短促机械反馈、状态灯切换。',
    antiPattern: '不能变成普通开发者后台。',
  },
  snapshot: {
    referenceBrief: '参考生活快照、相册和 Vlog 视觉，强调未经修饰但有温度。',
    signature: '照片颗粒、不规则构图、时间戳和生活色温必须出现。',
    composition: '内容像照片墙或生活记录流，保留松弛间距。',
    material: '胶片颗粒、纸边、暖色光。',
    typography: '手写感标签搭配可读 sans。',
    controls: '按钮像相册标签或胶片工具。',
    motion: '轻微拖拽、翻看、曝光变化。',
    antiPattern: '不能做成普通社交信息流。',
  },
  blooming: {
    referenceBrief: '参考花卉、节日营销和美妆艺术展，强调繁盛但有层级。',
    signature: '花瓣、超饱和、层叠和明亮情绪必须出现。',
    composition: '中心内容被花形层包围，但可读区域要干净。',
    material: '花瓣、亮色渐变、柔影。',
    typography: '优雅 display 与清晰正文。',
    controls: '按钮像花瓣或礼签，状态有绽放感。',
    motion: '绽放、层叠展开、柔和弹性。',
    antiPattern: '不能让装饰遮挡内容。',
  },
  distorted: {
    referenceBrief: '参考滑板、地下音乐和扭曲切割海报，强调错位能量。',
    signature: '不规则切割、错位文字、扭曲图形和高能边界必须出现。',
    composition: '斜切块面组织内容，主路径仍沿强对比引导。',
    material: '撕裂形、硬色块、噪点。',
    typography: '扭曲 display 只做标题，正文保持可读。',
    controls: '按钮像切割贴纸，hover 出现错位。',
    motion: '抖动、切片、快速错位。',
    antiPattern: '不能让错位破坏操作理解。',
  },
  neondark: {
    referenceBrief: '参考夜店、游戏社区和科技发布暗场，强调霓虹焦点。',
    signature: '深底、荧光边、粉蓝电光和强状态光必须出现。',
    composition: '暗场留白，核心按钮和状态用霓虹点亮。',
    material: '黑色玻璃、霓虹光、细网格。',
    typography: '科技 sans 或 mono，字重清楚。',
    controls: '按钮像发光控制台，disabled 必须明显降亮。',
    motion: '光脉冲、扫光、短闪。',
    antiPattern: '不能把所有文字都做成发光难读。',
  },
  freshretro: {
    referenceBrief: '参考 00 年代通透 UI、健康相册和清新复古产品，强调透明但轻快。',
    signature: '圆润字体、透明玻璃、清澈渐变和水感必须出现。',
    composition: '大圆形模块和清爽内容卡，节奏明快。',
    material: '水晶、浅蓝绿、透明高光。',
    typography: '圆润 sans，友好但清晰。',
    controls: '按钮像水滴胶囊，反馈轻快。',
    motion: '水波、轻弹、透明切换。',
    antiPattern: '不能混成 Frutiger Aero 的重高光或普通清新卡片。',
  },
  cassette: {
    referenceBrief: '参考磁带未来主义、CRT 和复古科技工具，强调模拟设备感。',
    signature: '扫描线、磁带标签、橙绿单色和机械状态必须出现。',
    composition: '像播放器或设备面板，信息按轨道排列。',
    material: 'CRT、塑料、磁带贴纸、暗场噪点。',
    typography: 'mono 或设备标签字体。',
    controls: '播放、暂停、录制、倒带等按钮形态明确。',
    motion: '扫描线、磁带转动、低帧率闪烁。',
    antiPattern: '不能只做赛博朋克霓虹。',
  },
  neu: {
    referenceBrief: '参考 Neomorphism 和智能家居控制面板，强调同色浮雕触感。',
    signature: '同色系凸凹、柔光阴影和可按压物理感必须出现。',
    composition: '少量大控件组织任务，避免复杂层级。',
    material: '软塑料、内阴影、外阴影、低对比表面。',
    typography: '简洁 sans，避免过细导致低对比不可读。',
    controls: '开关、滑杆、按钮必须有凹凸态差异。',
    motion: '按压下陷、柔和回弹。',
    antiPattern: '不能为了柔和牺牲可访问对比。',
  },
  frutiger: {
    referenceBrief: '参考 Frutiger Aero、Windows Vista 和环保水晶视觉，强调清新数码自然。',
    signature: '水晶、高光、自然元素、蓝绿空气感必须出现。',
    composition: '明亮背景上漂浮水晶模块和自然图形。',
    material: '水滴、玻璃泡、叶片、高光。',
    typography: '圆润系统 sans，带 00 年代亲和感。',
    controls: '按钮像水晶胶囊，hover 高光增强。',
    motion: '水波、泡泡上浮、轻弹。',
    antiPattern: '不能只做蓝绿渐变。',
  },
  clay: {
    referenceBrief: '参考 Claymorphism、玩具化 3D 和儿童教育界面，强调软体体积。',
    signature: '充气感、黏土体积、柔阴影和大圆角必须出现。',
    composition: '对象式卡片像摆在桌面上，主操作可触摸。',
    material: '黏土、橡皮、软阴影。',
    typography: '圆润 sans，保持亲和。',
    controls: '按钮像软块，pressed 有挤压反馈。',
    motion: '挤压、弹回、轻微旋转。',
    antiPattern: '不能只用圆角和阴影冒充黏土。',
  },
  pixel: {
    referenceBrief: '参考 8-bit 游戏、街机菜单和像素独立游戏，强调像素规则。',
    signature: '像素网格、硬边块、台阶字体和街机色必须出现。',
    composition: '界面像关卡选择或 HUD，所有控件对齐像素网格。',
    material: '像素块、tile、低分辨率边框。',
    typography: '像素/mono 字体，不混圆角现代字。',
    controls: 'START、MAP、BAG 等动作像游戏按钮。',
    motion: '逐帧、跳格、闪烁选择框。',
    antiPattern: '不能混成 1-bit Dither 或普通游戏化卡片。',
  },
  cyber: {
    referenceBrief: '参考赛博朋克、电竞 HUD 和加密终端，强调高对比警戒感。',
    signature: '霓虹、故障、黑底、高警告状态和 HUD 边框必须出现。',
    composition: '信息像任务终端，重点数据被霓虹框选。',
    material: '黑色玻璃、故障线、警示色。',
    typography: 'mono 与压缩科技字。',
    controls: '按钮像黑客命令或装备面板，危险态明确。',
    motion: 'glitch、扫描、短促闪烁。',
    antiPattern: '不能让装饰干扰可读性。',
  },
  solar: {
    referenceBrief: '参考太阳朋克、环保公益和农业科技，强调温暖现实主义。',
    signature: '奶油底、绿色、太阳光、新艺术曲线和社区感必须出现。',
    composition: '信息像可持续计划书，行动与影响指标并列。',
    material: '纸、植物、阳光、柔和线条。',
    typography: '人文 sans 或轻 serif。',
    controls: '按钮像社区行动或能源状态开关。',
    motion: '生长、日光变化、轻柔展开。',
    antiPattern: '不能只做环保绿模板。',
  },
  skeuo: {
    referenceBrief: '参考早期拟物 UI、专业音频和复古计算器，强调真实材质隐喻。',
    signature: '皮革、金属、木纹、旋钮和真实阴影必须出现。',
    composition: '界面像真实设备或书架，控件拥有物理位置。',
    material: '皮革、金属、木材、凹凸阴影。',
    typography: '设备铭牌式 serif/sans，数字可 mono。',
    controls: '旋钮、拨杆、按钮要有实体反馈。',
    motion: '旋转、按压、翻页。',
    antiPattern: '不能用贴图掩盖低可用性。',
  },
  bauhaus: {
    referenceBrief: '参考包豪斯、现代主义海报和基础几何，强调功能与形式统一。',
    signature: '红黄蓝、圆方三角、严格功能排布必须出现。',
    composition: '几何构成直接服务信息层级。',
    material: '平面色块、清晰线条、无装饰材质。',
    typography: '几何 sans，标题可强排版。',
    controls: '按钮像基础几何元件，状态用形状/颜色变化。',
    motion: '几何组合、硬切、秩序重排。',
    antiPattern: '不能混成 Memphis 的嬉戏碎片。',
  },
  dos: {
    referenceBrief: '参考 DOS、终端和命令行工具，强调文本即界面。',
    signature: '黑底绿字或蓝底白字、命令提示符、键盘焦点必须出现。',
    composition: '命令区、输出区和状态行构成全部界面。',
    material: '像素字、扫描线、硬边窗口。',
    typography: '严格 mono。',
    controls: '动作表现为命令、快捷键或可选菜单。',
    motion: '光标闪烁、逐行输出、硬切。',
    antiPattern: '不能加入现代卡片和圆角破坏终端感。',
  },
  doodle: {
    referenceBrief: '参考手绘白板、创意协作工具和草图笔记，强调未完成的可思考感。',
    signature: '手绘线条、不规则边框、箭头和批注必须出现。',
    composition: '内容像白板草图，主路径由箭头和圈注引导。',
    material: '纸、墨线、白板痕迹。',
    typography: '手写标题只作强调，正文要可读。',
    controls: '按钮像手画框，hover 出现圈注。',
    motion: '线条绘制、圈选、贴纸移动。',
    antiPattern: '不能让手绘感导致低完成度。',
  },
  paper: {
    referenceBrief: '参考剪纸、绘本和手工广告，强调层叠纸张空间。',
    signature: '纸层、撕边、投影、剪裁形状必须出现。',
    composition: '多层纸片组织内容，主操作在最上层。',
    material: '纸张纹理、撕边、柔软阴影。',
    typography: '温暖 serif 或圆润 sans。',
    controls: '按钮像纸签或贴纸，状态像纸片翻起。',
    motion: '折叠、翻纸、层级浮起。',
    antiPattern: '不能只用米色背景冒充纸感。',
  },
  win95: {
    referenceBrief: '参考 Windows 95、早期桌面和蒸汽波怀旧，强调系统窗口真实结构。',
    signature: '灰色倒角、标题栏、像素图标和系统按钮必须出现。',
    composition: '桌面窗口、菜单栏、状态栏组成完整系统。',
    material: '灰色塑料、1px 边框、蓝色标题栏。',
    typography: '系统像素 sans，不使用现代圆角字。',
    controls: '按钮有凸起/下陷态，菜单可见。',
    motion: '窗口打开、硬切、选中反色。',
    antiPattern: '不能只放复古图标而缺少窗口语法。',
  },
  vapor: {
    referenceBrief: '参考 Vaporwave、80 年代合成器视觉和互联网怀旧，强调超现实消费记忆。',
    signature: '粉紫、石膏像、棕榈、网格地面和故障感必须出现。',
    composition: '超现实舞台承载主内容，信息像唱片封面排布。',
    material: '大理石、霓虹、复古网格、渐变。',
    typography: '复古 display 与窄体标签。',
    controls: '按钮像合成器面板或商场招牌。',
    motion: '漂移、故障、扫描线。',
    antiPattern: '不能变成普通粉紫渐变。',
  },
  swiss: {
    referenceBrief: '参考瑞士国际主义、杂志网格和建筑排版，强调理性秩序。',
    signature: '严格网格、非对称排版、无衬线和红黑白控制必须出现。',
    composition: '列网格和基线决定所有组件位置。',
    material: '白纸、黑字、红色信号、细线。',
    typography: '高质量 sans，字阶和对齐必须严谨。',
    controls: '按钮像排版系统中的标签，不做装饰。',
    motion: '网格重排、硬切、极少过渡。',
    antiPattern: '不能把瑞士风做成普通极简。',
  },
  blueprint: {
    referenceBrief: '参考建筑蓝图和施工图，强调测量、比例和结构说明。',
    signature: '深蓝底、白线、标尺、剖面和编号必须出现。',
    composition: '信息像图纸剖面，主操作附着在结构线上。',
    material: '蓝图纸、白色线稿、测量标注。',
    typography: '工程 mono 和小号标签。',
    controls: '按钮像图纸注释或工具命令。',
    motion: '线条绘制、标尺移动、剖面展开。',
    antiPattern: '不能只是蓝底白字。',
  },
  gothic: {
    referenceBrief: '参考哥特建筑、RPG 暗黑界面和塔罗视觉，强调仪式感。',
    signature: '暗石、金属、暗红、金色线框和衬线字必须出现。',
    composition: '界面像祭坛或档案，主操作具备仪式层级。',
    material: '石材、金属、烛光、金线。',
    typography: '戏剧化 serif 标题与可读正文。',
    controls: '按钮像铭牌或符文封印，危险态清楚。',
    motion: '烛光、金线描边、缓慢显现。',
    antiPattern: '不能把暗黑风做成低对比难读页面。',
  },
}

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
  jetsons: 'googie',
  'solarpunk-utopia': 'solarpunk',
  'brutal-bw': 'brutal',
  'gen-ui': 'agent',
  bento: 'bento',
  material: 'material',
  minimal: 'minimal',
  'm3-expressive': 'material',
  'canvas-ai': 'agent',
  'xai-transparency': 'data',
  'multimodal-gesture': 'ambient',
  'adaptive-a11y': 'data',
  'micro-sonic': 'aura',
  'barely-there': 'minimal',
  'human-touch-ai': 'doodle',
  'soft-maximalism': 'floral',
  'intent-friction': 'brutal',
  'spaceship-manual': 'industrial',
  'local-first-ledger': 'data',
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
  googie: ['#f8fff4', '#ff6b35', '#00a7e1', '#2f1f5f'],
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
  googie: 'automated dome home',
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
      'googie',
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
    'atomic-age': {
      palette: ['#fff4bf', '#e11d48', '#2563eb', '#111827'],
      background:
        'radial-gradient(circle at 18% 26%, #e11d48 0 5%, transparent 5.5%), radial-gradient(circle at 76% 34%, #2563eb 0 4%, transparent 4.5%), linear-gradient(135deg, transparent 0 46%, rgba(225,29,72,0.18) 46% 50%, transparent 50%), #fff4bf',
      surface: '#fff8d6',
      text: '#111827',
      accent: '#e11d48',
      border: '#2563eb',
      radius: '6px',
      shadow: '10px 10px 0 rgba(37,99,235,0.24)',
      typography: 'display',
      motif: 'atomic poster burst',
      texture: 'halftone print',
      motion: 'snappy',
    },
    jetsons: {
      palette: ['#f8fff4', '#ff6b35', '#00a7e1', '#2f1f5f'],
      background:
        'radial-gradient(ellipse at 28% 24%, rgba(0,167,225,0.24), transparent 26%), radial-gradient(ellipse at 72% 68%, rgba(255,107,53,0.22), transparent 24%), linear-gradient(180deg, #f8fff4 0%, #dff8ff 100%)',
      surface: 'rgba(255,255,255,0.78)',
      text: '#2f1f5f',
      accent: '#ff6b35',
      border: '#00a7e1',
      radius: '34px',
      shadow: '0 28px 70px rgba(0,167,225,0.22)',
      typography: 'sans',
      motif: 'googie automated home',
      texture: 'plastic chrome dome',
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
      motif: 'mesh gradient field',
      texture: 'gradient mesh',
      text: '#111827',
      background:
        'radial-gradient(circle at 20% 16%, rgba(139,92,246,0.5), transparent 30%), radial-gradient(circle at 76% 36%, rgba(49,213,255,0.42), transparent 28%), radial-gradient(circle at 50% 86%, rgba(240,198,116,0.36), transparent 30%), #fffaf0',
      surface: 'rgba(255,255,255,0.56)',
      border: '#31d5ff',
    },
    'liquid-glass': {
      motif: 'OS liquid lens',
      texture: 'liquid refraction',
      radius: '30px',
      shadow: '0 34px 100px rgba(147,197,253,0.3)',
    },
    glass: {
      motif: 'blurred card stack',
      texture: 'frosted card',
      radius: '22px',
      shadow: '0 24px 70px rgba(15,23,42,0.22)',
    },
    'm3-expressive': {
      palette: ['#fff7fb', '#6750a4', '#ffb1c8', '#1f2937'],
      background:
        'radial-gradient(circle at 18% 20%, rgba(255,177,200,0.7), transparent 30%), radial-gradient(circle at 82% 68%, rgba(103,80,164,0.38), transparent 30%), #fff7fb',
      surface: 'rgba(255,255,255,0.78)',
      text: '#1f2937',
      accent: '#6750a4',
      border: '#ff8fb5',
      radius: '32px',
      shadow: '0 26px 80px rgba(103,80,164,0.2)',
      typography: 'sans',
      motif: 'expressive dynamic surface',
      texture: 'tonal motion',
      motion: 'orchestrated',
    },
    material: {
      motif: 'personal dynamic color',
      texture: 'tonal surface',
    },
    'canvas-ai': {
      palette: ['#07111f', '#7c3aed', '#2dd4bf', '#f8fafc'],
      background:
        'linear-gradient(rgba(45,212,191,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.12) 1px, transparent 1px), radial-gradient(circle at 70% 20%, rgba(124,58,237,0.35), transparent 28%), #07111f',
      surface: 'rgba(15,23,42,0.78)',
      text: '#f8fafc',
      accent: '#2dd4bf',
      border: '#7c3aed',
      radius: '18px',
      shadow: '0 30px 90px rgba(45,212,191,0.18)',
      typography: 'mono',
      motif: 'editable agent canvas',
      texture: 'node grid',
      motion: 'orchestrated',
    },
    'xai-transparency': {
      palette: ['#f8fafc', '#111827', '#2563eb', '#10b981'],
      background:
        'linear-gradient(rgba(17,24,39,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,0.08) 1px, transparent 1px), #f8fafc',
      surface: '#ffffff',
      text: '#111827',
      accent: '#2563eb',
      border: '#10b981',
      radius: '10px',
      shadow: '0 18px 54px rgba(15,23,42,0.1)',
      typography: 'mono',
      motif: 'transparent reasoning ledger',
      texture: 'audit grid',
      motion: 'snappy',
    },
    'multimodal-gesture': {
      palette: ['#07101a', '#38bdf8', '#f59e0b', '#f8fafc'],
      background:
        'radial-gradient(circle at 50% 48%, rgba(56,189,248,0.28), transparent 26%), radial-gradient(circle at 72% 30%, rgba(245,158,11,0.28), transparent 20%), #07101a',
      surface: 'rgba(15,23,42,0.68)',
      text: '#f8fafc',
      accent: '#38bdf8',
      border: '#f59e0b',
      radius: '26px',
      shadow: '0 34px 100px rgba(56,189,248,0.22)',
      typography: 'sans',
      motif: 'voice gesture field',
      texture: 'sensor glow',
      motion: 'breathing',
    },
    'adaptive-a11y': {
      palette: ['#ffffff', '#111111', '#005fcc', '#ffb000'],
      background: '#ffffff',
      surface: '#f5f5f5',
      text: '#111111',
      accent: '#005fcc',
      border: '#111111',
      radius: '8px',
      shadow: 'none',
      typography: 'sans',
      motif: 'adaptive access layer',
      texture: 'high-contrast clean',
      motion: 'snappy',
    },
    'micro-sonic': {
      palette: ['#050816', '#22d3ee', '#f472b6', '#f8fafc'],
      background:
        'repeating-linear-gradient(90deg, rgba(34,211,238,0.12) 0 2px, transparent 2px 14px), radial-gradient(circle at 50% 42%, rgba(244,114,182,0.24), transparent 30%), #050816',
      surface: 'rgba(15,23,42,0.76)',
      text: '#f8fafc',
      accent: '#22d3ee',
      border: '#f472b6',
      radius: '20px',
      shadow: '0 30px 90px rgba(34,211,238,0.18)',
      typography: 'mono',
      motif: 'sonic feedback rail',
      texture: 'waveform',
      motion: 'orchestrated',
    },
    'barely-there': {
      palette: ['#ffffff', '#111111', '#d4d4d4', '#f7f7f7'],
      background: '#ffffff',
      surface: 'rgba(255,255,255,0.82)',
      text: '#111111',
      accent: '#111111',
      border: '#d4d4d4',
      radius: '6px',
      shadow: '0 1px 0 rgba(17,17,17,0.08)',
      typography: 'sans',
      motif: 'almost invisible interface',
      texture: 'silent',
      motion: 'calm',
    },
    'human-touch-ai': {
      palette: ['#fff8ea', '#111827', '#ef4444', '#2563eb'],
      background:
        'radial-gradient(circle at 18% 14%, rgba(239,68,68,0.12), transparent 22%), linear-gradient(rgba(17,24,39,0.04) 1px, transparent 1px), #fff8ea',
      surface: '#fffdf4',
      text: '#111827',
      accent: '#ef4444',
      border: '#111827',
      radius: '14px',
      shadow: '6px 6px 0 rgba(17,24,39,0.15)',
      typography: 'display',
      motif: 'human revision marks',
      texture: 'paper annotation',
      motion: 'snappy',
    },
    'soft-maximalism': {
      palette: ['#fff1f2', '#e11d48', '#7c3aed', '#22c55e'],
      background:
        'radial-gradient(circle at 18% 20%, rgba(225,29,72,0.38), transparent 24%), radial-gradient(circle at 74% 26%, rgba(124,58,237,0.3), transparent 26%), radial-gradient(circle at 56% 82%, rgba(34,197,94,0.26), transparent 24%), #fff1f2',
      surface: 'rgba(255,255,255,0.72)',
      text: '#111827',
      accent: '#e11d48',
      border: '#7c3aed',
      radius: '24px',
      shadow: '0 26px 84px rgba(225,29,72,0.18)',
      typography: 'display',
      motif: 'controlled abundance',
      texture: 'layered bloom',
      motion: 'orchestrated',
    },
    'intent-friction': {
      palette: ['#050505', '#f8fafc', '#f97316', '#ef4444'],
      background:
        'repeating-linear-gradient(45deg, rgba(249,115,22,0.18) 0 8px, transparent 8px 18px), #050505',
      surface: '#f8fafc',
      text: '#f8fafc',
      accent: '#f97316',
      border: '#ef4444',
      radius: '0px',
      shadow: '12px 12px 0 #f97316',
      typography: 'mono',
      motif: 'deliberate risk gate',
      texture: 'warning tape',
      motion: 'snappy',
    },
    'solarpunk-utopia': {
      motif: 'civic solar infrastructure',
      texture: 'community grid',
      radius: '26px 10px 34px 12px',
    },
    solar: {
      motif: 'botanical energy dashboard',
      texture: 'leaf solar grain',
      radius: '24px',
    },
    dreamcore: {
      motif: 'liminal cloud motel',
      texture: 'misty nostalgia',
    },
    freshretro: {
      motif: 'fresh pastel nostalgia',
      texture: 'clean retro gloss',
    },
    frutiger: {
      motif: 'aqua eco glass',
      texture: 'water lens',
    },
    vapor: {
      motif: 'synth mall horizon',
      texture: 'marble neon haze',
    },
    'blueprint-cad': {
      motif: 'parametric CAD workspace',
      texture: 'measurement grid',
    },
    blueprint: {
      motif: 'architect paper plan',
      texture: 'blue paper lines',
    },
    'skeuo-nature': {
      motif: 'natural material revival',
      texture: 'wood leaf leather',
    },
    natural: {
      motif: 'native nature surface',
      texture: 'earth material',
    },
    tactile: {
      motif: 'handmade tactile kit',
      texture: 'stitched paper grain',
    },
    paper: {
      motif: 'cut paper diorama',
      texture: 'layered paper edge',
    },
    memphis: {
      motif: 'postmodern playful geometry',
      texture: 'flat color confetti',
    },
    bauhaus: {
      motif: 'primary functional geometry',
      texture: 'poster grid',
    },
    'spaceship-manual': {
      palette: ['#0b1118', '#94a3b8', '#f59e0b', '#e5e7eb'],
      background:
        'linear-gradient(rgba(148,163,184,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px), #0b1118',
      surface: 'rgba(15,23,42,0.82)',
      text: '#e5e7eb',
      accent: '#f59e0b',
      border: '#94a3b8',
      radius: '4px',
      shadow: '0 24px 70px rgba(2,6,23,0.38)',
      typography: 'mono',
      motif: 'technical flight manual',
      texture: 'instrument print',
      motion: 'snappy',
    },
    'local-first-ledger': {
      palette: ['#f8fafc', '#0f172a', '#10b981', '#64748b'],
      background:
        'linear-gradient(rgba(15,23,42,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.08) 1px, transparent 1px), #f8fafc',
      surface: '#ffffff',
      text: '#0f172a',
      accent: '#10b981',
      border: '#64748b',
      radius: '12px',
      shadow: '0 18px 56px rgba(15,23,42,0.1)',
      typography: 'mono',
      motif: 'offline trust ledger',
      texture: 'audit ledger',
      motion: 'snappy',
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
  if (id === 'atomic-age') {
    return `${title} 必须像 1950s 原子时代科技广告：星爆、原子轨道、斜切海报、太空竞赛口号和发射按钮是第一视觉信号，不能混成 Jetsons 家居舱。`
  }
  if (id === 'jetsons' || visual.pattern === 'googie') {
    return `${title} 必须像 Googie 未来家居：悬浮圆顶、塑料光泽、机器人管家、家电自动化例程和轻快家庭控制台是第一视觉信号，不能退回星爆海报。`
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
  if (id === 'm3-expressive') {
    return `${title} 必须把表现型 Material 3 的大胆形状、情绪化动态色、状态层、ripple/pressed 反馈和可访问触控面积转成真实组件。`
  }
  if (id === 'material' || visual.pattern === 'material') {
    return `${title} 必须用动态色、tonal surface、大圆角、状态层、ripple/pressed 反馈和清晰触控层级表达 Android 原生气质。`
  }
  if (id === 'canvas-ai') {
    return `${title} 必须把 AI 聊天升级成可编辑画布：节点、生成块、工具调用、执行链、撤销/回放和人工确认都要可见。`
  }
  if (id === 'xai-transparency') {
    return `${title} 必须把推理依据、证据链、置信度、模型状态、人工复核和失败解释做成可审计界面，不允许只显示结论。`
  }
  if (id === 'multimodal-gesture') {
    return `${title} 必须让语音、手势、摄像头、触控和传感器状态共同驱动界面，并提供显式可见的降级控制。`
  }
  if (id === 'adaptive-a11y') {
    return `${title} 必须把高对比、低动效、字号/密度调整、键盘焦点和认知负荷提示作为第一等组件状态。`
  }
  if (id === 'micro-sonic') {
    return `${title} 必须把短音色、触感节奏、波形反馈和静音降级转成视觉/交互状态，不能依赖声音本身完成表达。`
  }
  if (id === 'barely-there') {
    return `${title} 必须让界面退到背景，只保留高信噪比内容、上下文浮现控件和极少但清晰的状态反馈。`
  }
  if (id === 'human-touch-ai') {
    return `${title} 必须用手写标注、修订痕迹、纸感材料和不完全对齐的人工痕迹抵消 AI 模板感，同时保持可读组件结构。`
  }
  if (id === 'soft-maximalism') {
    return `${title} 必须允许繁复图层、饱和色和丰富内容，但用清晰层级、柔边容器和节奏化动效控制噪声。`
  }
  if (id === 'intent-friction') {
    return `${title} 必须为高风险动作设计可见阻尼：证据停顿、二次确认、慢按钮、危险态和撤销路径都要成套出现。`
  }
  if (id === 'spaceship-manual') {
    return `${title} 必须用仪表舱、技术手册、参数表、警示条和命令面板表达高精密控制，不能变成普通暗色后台。`
  }
  if (id === 'local-first-ledger') {
    return `${title} 必须把本地存储、离线状态、同步冲突、审计日志和隐私边界显性化，形成可信账本式界面。`
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

function scoreForTier(tier: UiStyleItem['tier'], pattern: UiVisualPattern): UiStyleMasterProfile['restorationScores'] {
  const baseline = tier === 'T0' ? 94 : tier === 'T1' ? 91 : tier === 'T2' ? 88 : 86
  const craftBoost = ['blueprint', 'terminal', 'swiss', 'skeuo', 'print', 'paper'].includes(pattern) ? 2 : 0
  const interactionBoost = ['agent', 'material', 'spatial', 'data', 'industrial'].includes(pattern) ? 2 : 0
  return {
    identity: baseline,
    craft: Math.min(99, baseline + craftBoost),
    interaction: Math.min(99, baseline - 1 + interactionBoost),
    platformFit: Math.min(99, baseline - (tier === 'T3' ? 1 : 0)),
    openbasakaUsefulness: Math.min(99, baseline + (['agent', 'data', 'blueprint', 'industrial'].includes(pattern) ? 3 : 1)),
  }
}

function requireMasterProfileSeed(id: string): StyleMasterProfileSeed {
  const seed = styleMasterProfileSeeds[id]
  if (!seed) {
    throw new Error(`UI style "${id}" is missing a StyleMasterProfile seed.`)
  }
  return seed
}

function buildStyleMasterProfile(
  id: string,
  tier: UiStyleItem['tier'],
  title: string,
  description: string,
  application: string,
  visual: UiVisualTokens,
  platformGuides: ReturnType<typeof buildPlatformGuides>,
): UiStyleMasterProfile {
  const seed = requireMasterProfileSeed(id)
  const cleanTitle = title.replace(/^\d+\.\s*/, '')
  const dna = styleDnaSentence(id, cleanTitle, visual)
  const componentBase = [
    seed.controls,
    `导航、主按钮、输入、卡片、空态/加载/成功/失败态都必须围绕“${seed.signature}”建立同源组件语法。`,
    `组件状态要显露 ${visual.motion} 动效、${visual.texture} 材质、${visual.density} 信息密度和 ${visual.radius} 半径规则。`,
  ]
  return {
    referenceBrief: `${seed.referenceBrief} 适用场景：${application}`,
    identityRules: [
      seed.signature,
      seed.composition,
      dna,
    ],
    visualTokens: [
      `色彩：${visual.palette.join(' / ')}，主强调 ${visual.accent}，边界 ${visual.border}。`,
      `材质：${seed.material}；系统材质字段为 ${visual.texture}。`,
      `字体：${seed.typography}；当前 token 为 ${visual.typography}。`,
      `动效：${seed.motion}；当前节奏为 ${visual.motion}。`,
    ],
    componentGrammar: componentBase,
    platformRules: {
      web: `${platformGuides.web} ${seed.composition}`,
      ios: `${platformGuides.ios} ${seed.controls}`,
      mac: `${platformGuides.mac} ${seed.composition}`,
      android: `${platformGuides.android} ${seed.controls}`,
      mini: `${platformGuides.mini} ${seed.material}`,
    },
    promptRules: [
      `生成界面前先写明 ${cleanTitle} 的来源、第一视觉信号、组件语法和禁忌项。`,
      `必须把 ${description} 转成真实控件、平台骨架、状态反馈和截图验收，不允许只写风格名。`,
      `OpenBasaka 的 PRD、工作流、定时和群策产物必须继承 ${cleanTitle} 的视觉 token、平台差异和验收清单。`,
    ],
    antiPatterns: [
      seed.antiPattern,
      '不能让卡片、弹窗、平台预览和 PRD Prompt 各写一套互不相干的视觉语言。',
      '不能只通过换色、圆角或背景图冒充该风格。',
    ],
    acceptanceChecklist: [
      `Identity：首屏 3 秒内能识别 ${cleanTitle}，并看到 ${seed.signature}`,
      `Craft：材质、字体、构图和控件细节必须符合 ${seed.referenceBrief}`,
      'Interaction：hover、pressed、focus-visible、disabled、空态、加载态、成功态、失败态必须同源。',
      'Platform Fit：Web/iOS/macOS/Android/小程序按各自平台语法重建，而不是缩放同一张页面。',
      'OpenBasaka Usefulness：PRD、工作流、定时、群策可以直接读取并生成可截图验收的规格。',
    ],
    restorationScores: scoreForTier(tier, visual.pattern),
  }
}

export const UI_STYLE_ITEMS: UiStyleItem[] = rows.map(([id, tier, title, description, application], index) => {
  const specs = tierSpecs[tier]
  const visual = visualForStyle(id, tier, index)
  const platformGuides = buildPlatformGuides(id, title, visual)
  const masterProfile = buildStyleMasterProfile(id, tier, title, description, application, visual, platformGuides)
  return {
    id,
    tier,
    title: `${index + 1}. ${title}`,
    description,
    application,
    specs,
    visual,
    masterProfile,
    ...platformGuides,
  }
})

export function getUiStyle(id: string): UiStyleItem | undefined {
  return UI_STYLE_ITEMS.find((item) => item.id === id)
}

export const UI_STYLE_DISTINCTION_AUDITS = [
  {
    pair: ['atomic-age', 'jetsons'],
    severity: 'critical',
    diagnosis: '原子时代和杰森一家曾共用 atomic pattern 与同一张太空复古预览，导致星爆海报与 Googie 家居自动化混在一起。',
    requiredDivergence: ['Atomic Age=星爆/原子轨道/太空竞赛广告', 'Jetsons=圆顶家居/机器人管家/自动化例程/Googie 建筑'],
  },
  {
    pair: ['solarpunk-utopia', 'solar'],
    severity: 'high',
    diagnosis: '两个太阳朋克项容易都落成绿色温暖网格；前者应是社区基础设施乌托邦，后者应是生态产品/能源仪表。',
    requiredDivergence: ['Solarpunk Utopia=社区、公共设施、能源网络', 'Solarpunk=植物、能源卡片、可持续品牌工具'],
  },
  {
    pair: ['liquid-glass', 'glass'],
    severity: 'high',
    diagnosis: 'Liquid Glass 与传统 Glassmorphism 都使用玻璃材质；前者必须偏 OS 级液态折射，后者偏卡片毛玻璃。',
    requiredDivergence: ['Liquid Glass=系统材料、液态边缘、焦点层', 'Glassmorphism=半透明卡片、模糊背景、轻层级'],
  },
  {
    pair: ['freshretro', 'frutiger'],
    severity: 'high',
    diagnosis: '清新复古与 Frutiger Aero 曾共用 crystal sky 词汇；前者是清爽怀旧品牌，后者是 Y2K 水晶生态界面。',
    requiredDivergence: ['Fresh Retro=清爽复古、浅色品牌、轻怀旧', 'Frutiger Aero=水晶、水滴、高光、生态科技'],
  },
  {
    pair: ['blueprint-cad', 'blueprint'],
    severity: 'medium',
    diagnosis: '两个蓝图项都容易只剩蓝底白线；工程 CAD 应突出参数化工作台，传统蓝图应突出建筑纸面和标注。',
    requiredDivergence: ['Blueprint CAD=参数、图层、测量控件', 'Blueprint=建筑图纸、比例尺、说明标注'],
  },
  {
    pair: ['aurora-mesh', 'aurora'],
    severity: 'medium',
    diagnosis: '两个极光项都可能退化成渐变背景；Mesh 要有网格/节点结构，Aurora 要保持弥散色场。',
    requiredDivergence: ['Aurora Mesh=渐变网格、节点、可跟踪流向', 'Aurora=弥散光场、柔和品牌氛围'],
  },
] as const
