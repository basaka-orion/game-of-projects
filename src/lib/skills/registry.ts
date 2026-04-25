/**
 * Skills Registry — 智能体技能注册表
 *
 * 设计原则：覆盖项目评估全生命周期
 * 感知 → 分析 → 分类 → 连接 → 规划 → 商业 → 执行 → 学习
 *
 * 每个技能映射到实际的 lib/ 模块或 MCP 能力
 */

export interface Skill {
  id: string
  name: string
  description: string
  enabled: boolean
  source: 'builtin' | 'mcp' | 'custom' | 'hermes'
  category: SkillCategory
  icon: string
  /** 运行此技能需要的前置条件 */
  requires: SkillRequire[]
  /** 对应的实际代码模块 */
  module?: string
  /** MCP 依赖（需要哪些 MCP 服务器在线） */
  mcpDeps?: string[]
}

export type SkillCategory =
  | '核心引擎'   // 分析引擎：PRD解析、推演、分类
  | '智能分析'   // 深度分析：市场、竞品、成本
  | '突触连接'   // 项目间关联发现
  | '战略规划'   // 规划与决策支持
  | '商业分析'   // 商业模式与变现
  | '记忆系统'   // 记忆存储与回忆
  | '画像引擎'   // Boss与用户画像
  | '环境感知'   // 外部信息获取
  | '执行工具'   // 报告生成、数据导出

export type SkillRequire = 'llm' | 'web' | 'filesystem' | 'database' | 'mcp' | 'browser'

export interface SkillCategoryMeta {
  id: SkillCategory
  label: string
  icon: string
  order: number
}

/** 技能分类元数据 */
export const SKILL_CATEGORIES: SkillCategoryMeta[] = [
  { id: '核心引擎', label: '核心引擎', icon: '⚙️', order: 0 },
  { id: '智能分析', label: '智能分析', icon: '🔬', order: 1 },
  { id: '突触连接', label: '突触连接', icon: '🔗', order: 2 },
  { id: '战略规划', label: '战略规划', icon: '📋', order: 3 },
  { id: '商业分析', label: '商业分析', icon: '💰', order: 4 },
  { id: '记忆系统', label: '记忆系统', icon: '🧠', order: 5 },
  { id: '画像引擎', label: '画像引擎', icon: '👤', order: 6 },
  { id: '环境感知', label: '环境感知', icon: '📡', order: 7 },
  { id: '执行工具', label: '执行工具', icon: '⚡', order: 8 },
]

/**
 * 默认技能清单 — 28 个技能覆盖完整生命周期
 *
 * 核心理念：
 * - 核心引擎：已有实现的 lib 模块，直接映射
 * - 智能分析/战略规划/商业分析：需要 LLM + 可选 MCP 的扩展能力
 * - 环境感知：需要 MCP 服务器（Web Search / Fetch）才能工作
 * - 执行工具：本地操作，不依赖外部
 */
export const DEFAULT_SKILLS: Skill[] = [
  // ═══ 核心引擎 ═══
  {
    id: 'prd-parser',
    name: 'PRD 解析引擎',
    description: '解析 PRD/需求文档，提取项目定位、目标用户、痛点、商业模式、技术栈、竞品、风险',
    enabled: true,
    source: 'builtin',
    category: '核心引擎',
    icon: '📄',
    requires: ['llm'],
    module: 'lib/ai/prd-parser',
  },
  {
    id: 'war-room',
    name: '红蓝军推演',
    description: '3+4 角色对抗推演（竞品分析师/挑剔用户/冷面投资人 + 可解锁技术架构师/增长黑客/伦理审计/领域专家）',
    enabled: true,
    source: 'builtin',
    category: '核心引擎',
    icon: '⚔️',
    requires: ['llm'],
    module: 'lib/ai/war-room',
  },
  {
    id: 'role-system',
    name: '可解锁角色系统',
    description: '7 个推演角色（3 基础 + 4 通过成就解锁），每个角色有独立的 system prompt 和温度参数',
    enabled: true,
    source: 'builtin',
    category: '核心引擎',
    icon: '🎭',
    requires: ['llm'],
    module: 'lib/ai/roles',
  },
  {
    id: 'classifier',
    name: '多维分类器',
    description: '行业/子行业/创新类型/技术栈/商业模式/市场阶段/复杂度/上市周期/资源需求 — 9维分类 + SWOT',
    enabled: true,
    source: 'builtin',
    category: '核心引擎',
    icon: '🏷️',
    requires: ['llm'],
    module: 'lib/ai/classifier',
  },
  {
    id: 'comparator',
    name: '项目对比器',
    description: '双项目对撞分析：重叠度/互补度/蚕食风险/协同点/综合建议',
    enabled: true,
    source: 'builtin',
    category: '核心引擎',
    icon: '⚖️',
    requires: ['llm'],
    module: 'lib/ai/comparator',
  },
  {
    id: 'auto-research',
    name: '多视角自动调研',
    description: '市场/技术/竞品/商业模式 四视角独立研究 + 综合报告',
    enabled: true,
    source: 'builtin',
    category: '核心引擎',
    icon: '🔭',
    requires: ['llm'],
    module: 'lib/ai/auto-research',
  },
  {
    id: 'agency',
    name: 'DAG 任务编排',
    description: '有向无环图任务编排引擎：research → critique → ideate → synthesize 串行流水线',
    enabled: true,
    source: 'builtin',
    category: '核心引擎',
    icon: '🔄',
    requires: ['llm'],
    module: 'lib/ai/agency',
  },
  {
    id: 'era-variables',
    name: '时代变量引擎',
    description: 'LLM 生成当前市场/技术环境快照（技术热度/融资气候/监管压力/人才供给），24h 缓存',
    enabled: true,
    source: 'builtin',
    category: '核心引擎',
    icon: '🌍',
    requires: ['llm'],
    module: 'lib/game/era-variables',
  },

  // ═══ 智能分析 ═══
  {
    id: 'market-research',
    name: '市场调研',
    description: '搜索市场数据、行业报告、趋势分析，量化 TAM/SAM/SOM 市场机会',
    enabled: true,
    source: 'mcp',
    category: '智能分析',
    icon: '📈',
    requires: ['llm', 'web'],
    mcpDeps: ['mcp-brave-search', 'mcp-fetch'],
  },
  {
    id: 'competitor-scan',
    name: '竞品雷达',
    description: '发现并深度分析竞争对手：定位、定价、优劣势、市场份额、差异化策略',
    enabled: true,
    source: 'mcp',
    category: '智能分析',
    icon: '🎯',
    requires: ['llm', 'web'],
    mcpDeps: ['mcp-brave-search', 'mcp-fetch'],
  },
  {
    id: 'cost-estimator',
    name: '成本估算器',
    description: '评估开发成本（人月）、运营成本（月/年）、基础设施成本、ROI 预测',
    enabled: true,
    source: 'builtin',
    category: '智能分析',
    icon: '💰',
    requires: ['llm'],
  },
  {
    id: 'risk-scanner',
    name: '风险扫描器',
    description: '识别并量化技术风险/市场风险/团队风险/资金风险/合规风险，给出风险等级和缓解方案',
    enabled: true,
    source: 'builtin',
    category: '智能分析',
    icon: '⚠️',
    requires: ['llm'],
  },
  {
    id: 'tech-feasibility',
    name: '技术可行性评估',
    description: '评估技术栈成熟度、开发难度、关键技术瓶颈、开源方案可用性',
    enabled: true,
    source: 'builtin',
    category: '智能分析',
    icon: '🛠️',
    requires: ['llm'],
  },

  // ═══ 突触连接 ═══
  {
    id: 'synapse-scan',
    name: '突触扫描器',
    description: '计算所有项目对的行业/技术/市场重叠度，LLM 增强发现 6 类连接（互补/序列/协同/冲突/灵感/技能迁移）',
    enabled: true,
    source: 'builtin',
    category: '突触连接',
    icon: '🔗',
    requires: ['llm'],
    module: 'lib/synapse/scorer',
  },
  {
    id: 'hybrid-innovator',
    name: '混合创新器',
    description: 'A+B=C 跨界创新：基于两个项目的突触连接生成 1-3 个创新方案（标题/定位/为什么现在/可行性/兴奋度/投入）',
    enabled: true,
    source: 'builtin',
    category: '突触连接',
    icon: '💡',
    requires: ['llm'],
    module: 'lib/synapse/innovator',
  },
  {
    id: 'resource-mapper',
    name: '资源复用映射',
    description: '发现跨项目可复用的代码模块、数据源、用户渠道、技术经验、人脉资源',
    enabled: true,
    source: 'builtin',
    category: '突触连接',
    icon: '🗺️',
    requires: ['llm'],
  },

  // ═══ 战略规划 ═══
  {
    id: 'timeline-planner',
    name: '时间线规划器',
    description: '生成项目里程碑、关键路径、甘特图建议、MVP→V1→V2 迭代节奏',
    enabled: true,
    source: 'builtin',
    category: '战略规划',
    icon: '📅',
    requires: ['llm'],
  },
  {
    id: 'mvp-scoper',
    name: 'MVP 范围定义',
    description: '定义最小可行产品：核心功能、必须砍掉的功能、验证指标、2周/4周/8周方案',
    enabled: true,
    source: 'builtin',
    category: '战略规划',
    icon: '🎯',
    requires: ['llm'],
  },
  {
    id: 'go-no-go',
    name: 'Go/No-Go 决策',
    description: '综合存活率、市场时机、资源匹配、风险承受力，生成决策建议和执行清单',
    enabled: true,
    source: 'builtin',
    category: '战略规划',
    icon: '🚦',
    requires: ['llm'],
  },

  // ═══ 商业分析 ═══
  {
    id: 'business-model',
    name: '商业模式画布',
    description: 'Lean Canvas 9宫格分析：客户群体/价值主张/渠道/收入/成本/关键指标/差异化/不公平优势',
    enabled: true,
    source: 'builtin',
    category: '商业分析',
    icon: '💼',
    requires: ['llm'],
  },
  {
    id: 'monetization',
    name: '变现策略',
    description: 'SaaS订阅/广告/交易抽成/数据服务/API收费/硬件 — 多模式变现分析与推荐',
    enabled: true,
    source: 'builtin',
    category: '商业分析',
    icon: '💎',
    requires: ['llm'],
  },
  {
    id: 'unit-economics',
    name: '单位经济学',
    description: 'LTV/CAC/毛利率/回本周期/MRR 增长率 — 核心商业指标计算与行业基准对比',
    enabled: true,
    source: 'builtin',
    category: '商业分析',
    icon: '📊',
    requires: ['llm'],
  },
  {
    id: 'pitch-deck',
    name: 'BP 生成器',
    description: '生成商业计划书关键内容：问题/解决方案/市场/产品/商业模式/团队/财务预测/融资需求',
    enabled: true,
    source: 'builtin',
    category: '商业分析',
    icon: '📑',
    requires: ['llm'],
  },

  // ═══ 记忆系统 ═══
  {
    id: 'memory-palace',
    name: '记忆宫殿',
    description: '以 MemPalace 风格的 wing/room/hall/drawer 管理长期记忆，并通过 L0-L3 记忆栈控制唤醒与回忆',
    enabled: true,
    source: 'builtin',
    category: '记忆系统',
    icon: '🏛️',
    requires: ['database'],
    module: 'lib/memory/palace',
  },
  {
    id: 'semantic-recall',
    name: '语义回忆',
    description: '支持 scoped recall 的精准召回层：按 wing/room/topic 缩小范围，再结合全文、重要度与访问权重检索',
    enabled: true,
    source: 'builtin',
    category: '记忆系统',
    icon: '🔍',
    requires: ['database'],
    module: 'lib/memory/recall',
  },
  {
    id: 'memory-extractor',
    name: '记忆自动提取',
    description: '从评估结果、对话、决策和突触发现中提取高价值记忆候选，为后续归档、编译和校准提供素材',
    enabled: true,
    source: 'builtin',
    category: '记忆系统',
    icon: '🧠',
    requires: ['llm', 'database'],
    module: 'lib/memory/extractor',
  },
  {
    id: 'knowledge-graph',
    name: '知识图谱',
    description: '实体-关系三元组存储，图遍历与路径发现，LLM 自动提取知识，社区检测',
    enabled: true,
    source: 'builtin',
    category: '记忆系统',
    icon: '🕸️',
    requires: ['llm', 'database'],
    module: 'lib/memory/knowledge-graph',
  },
  {
    id: 'neuron-swarm',
    name: '神经元集群',
    description: 'MiroFish 风格激活扩散模拟，发现隐含关联与突破性创新，社会进化',
    enabled: true,
    source: 'builtin',
    category: '突触连接',
    icon: '🧬',
    requires: ['llm', 'database'],
    module: 'lib/synapse/swarm',
  },
  {
    id: 'hermes-tools',
    name: 'Hermes 工具箱',
    description: 'web_search/web_extract/terminal/file/vision/clarify/code_execute — 内置工具注册与执行',
    enabled: true,
    source: 'builtin',
    category: '执行工具',
    icon: '🔧',
    requires: [],
    module: 'lib/tools',
  },

  // ═══ Hermes Agent 工具（紫色标） ═══
  {
    id: 'hermes-process',
    name: '进程管理',
    description: '管理后台终端进程（列表/轮询/日志/等待/终止/写入）',
    enabled: true,
    source: 'hermes',
    category: '执行工具',
    icon: '⏳',
    requires: ['filesystem'],
    module: 'lib/tools',
  },
  {
    id: 'hermes-patch',
    name: '文件补丁',
    description: '精确查找替换文件编辑，支持模糊匹配',
    enabled: true,
    source: 'hermes',
    category: '执行工具',
    icon: '🩹',
    requires: ['filesystem'],
    module: 'lib/tools',
  },
  {
    id: 'hermes-search-files',
    name: '文件搜索',
    description: 'ripgrep 驱动的文件内容和文件名搜索',
    enabled: true,
    source: 'hermes',
    category: '执行工具',
    icon: '🔍',
    requires: ['filesystem'],
    module: 'lib/tools',
  },
  {
    id: 'hermes-image-generate',
    name: '图像生成',
    description: '文本转图像生成（FLUX 模型）',
    enabled: true,
    source: 'hermes',
    category: '执行工具',
    icon: '🎨',
    requires: ['llm'],
    module: 'lib/tools',
  },
  {
    id: 'hermes-execute-code',
    name: 'Python 执行',
    description: '运行 Python/JS 脚本（带工具访问沙箱）',
    enabled: true,
    source: 'hermes',
    category: '执行工具',
    icon: '🐍',
    requires: ['filesystem'],
    module: 'lib/tools',
  },
  {
    id: 'hermes-delegate',
    name: '子代理委派',
    description: '生成子代理并行处理任务（最多 3 个并发）',
    enabled: true,
    source: 'hermes',
    category: '执行工具',
    icon: '🤖',
    requires: ['llm'],
    module: 'lib/tools',
  },
  {
    id: 'hermes-cronjob',
    name: '定时任务',
    description: '创建和管理定时执行的任务（cron 表达式）',
    enabled: true,
    source: 'hermes',
    category: '执行工具',
    icon: '⏰',
    requires: [],
    module: 'lib/tools',
  },
  {
    id: 'hermes-todo',
    name: '任务清单',
    description: '管理待办事项列表（添加/完成/删除/更新）',
    enabled: true,
    source: 'hermes',
    category: '执行工具',
    icon: '✅',
    requires: [],
    module: 'lib/tools',
  },
  {
    id: 'hermes-memory',
    name: 'Hermes 持久记忆',
    description: '保存重要信息到跨会话持久记忆',
    enabled: true,
    source: 'hermes',
    category: '记忆系统',
    icon: '💾',
    requires: ['database'],
    module: 'lib/tools',
  },
  {
    id: 'hermes-session-search',
    name: '会话搜索',
    description: '搜索历史对话记录（全文本）',
    enabled: true,
    source: 'hermes',
    category: '记忆系统',
    icon: '🔎',
    requires: ['database'],
    module: 'lib/tools',
  },
  {
    id: 'hermes-skills-list',
    name: '技能列表',
    description: '列出所有可用技能（按分类过滤）',
    enabled: true,
    source: 'hermes',
    category: '核心引擎',
    icon: '📋',
    requires: [],
    module: 'lib/tools',
  },
  {
    id: 'hermes-skill-view',
    name: '技能查看',
    description: '加载技能的完整内容和关联文件',
    enabled: true,
    source: 'hermes',
    category: '核心引擎',
    icon: '👁️',
    requires: [],
    module: 'lib/tools',
  },
  {
    id: 'hermes-skill-manage',
    name: '技能管理',
    description: '创建/更新/删除技能（Hermes 自进化）',
    enabled: true,
    source: 'hermes',
    category: '核心引擎',
    icon: '⚙️',
    requires: [],
    module: 'lib/tools',
  },
  {
    id: 'hermes-browser',
    name: '浏览器自动化',
    description: '导航/快照/点击/输入/滚动/截图/控制台 — 全功能浏览器操控',
    enabled: true,
    source: 'hermes',
    category: '环境感知',
    icon: '🌐',
    requires: ['browser'],
    module: 'lib/tools',
    mcpDeps: ['mcp-playwright'],
  },
  {
    id: 'hermes-home-assistant',
    name: 'Home Assistant',
    description: '智能家居控制（需配置 HA URL 和 Token）',
    enabled: false,
    source: 'hermes',
    category: '环境感知',
    icon: '🏠',
    requires: ['web'],
    module: 'lib/tools',
  },

  // ═══ 画像引擎 ═══
  {
    id: 'boss-profile',
    name: 'Boss 画像引擎',
    description: '动态构建用户画像：风险偏好/创新倾向/决策速度/资源风格/领域专长 — 通过交互持续进化',
    enabled: true,
    source: 'builtin',
    category: '画像引擎',
    icon: '👑',
    requires: ['llm', 'database'],
    module: 'lib/boss/profile',
  },
  {
    id: 'boss-extractor',
    name: 'Boss 洞察提取',
    description: '从对话中自动提取兴趣/厌恶/目标/偏好信号/风险信号/情感状态，写入画像记忆',
    enabled: true,
    source: 'builtin',
    category: '画像引擎',
    icon: '🔎',
    requires: ['llm'],
    module: 'lib/boss/extractor',
  },
  {
    id: 'user-persona',
    name: '目标用户画像',
    description: '根据项目定位生成详细的目标用户画像：人口统计/行为特征/痛点/需求/付费意愿',
    enabled: true,
    source: 'builtin',
    category: '画像引擎',
    icon: '👥',
    requires: ['llm'],
  },

  // ═══ 环境感知 ═══
  {
    id: 'web-search',
    name: '实时网络搜索',
    description: '搜索互联网获取实时市场数据、新闻、技术文档、行业报告',
    enabled: true,
    source: 'mcp',
    category: '环境感知',
    icon: '🌐',
    requires: ['web'],
    mcpDeps: ['mcp-brave-search'],
  },
  {
    id: 'web-fetch',
    name: '网页内容获取',
    description: '抓取指定 URL 的网页内容，提取文本/数据/报告用于分析',
    enabled: true,
    source: 'mcp',
    category: '环境感知',
    icon: '📡',
    requires: ['web'],
    mcpDeps: ['mcp-fetch'],
  },
  {
    id: 'sentiment-analyzer',
    name: '舆情分析',
    description: '分析社交媒体和新闻中的用户情感与市场情绪，判断趋势方向',
    enabled: true,
    source: 'mcp',
    category: '环境感知',
    icon: '💬',
    requires: ['llm', 'web'],
    mcpDeps: ['mcp-brave-search', 'mcp-fetch'],
  },

  // ═══ 执行工具 ═══
  {
    id: 'report-generator',
    name: '评估报告生成',
    description: '自动生成项目评估报告（推演摘要/雷达图/决策建议/风险清单/行动计划）',
    enabled: true,
    source: 'builtin',
    category: '执行工具',
    icon: '📝',
    requires: ['llm'],
  },
  {
    id: 'game-progression',
    name: '游戏进度系统',
    description: 'XP/等级/成就/称号 — 9 种 XP 获取行为、12 个成就、6 级 Boss 称号',
    enabled: true,
    source: 'builtin',
    category: '执行工具',
    icon: '🎮',
    requires: [],
    module: 'lib/game/progression',
  },
  {
    id: 'deep-reasoning',
    name: '深度推理链',
    description: 'Sequential Thinking — 逐步推理、动态调整策略、可回溯的思考链',
    enabled: true,
    source: 'mcp',
    category: '执行工具',
    icon: '🧩',
    requires: ['mcp'],
    mcpDeps: ['mcp-sequential-thinking'],
  },
]

// ─── 持久化 ───

const SKILLS_STORAGE_KEY = 'gop_skills_state'

/** 加载技能列表（合并默认值与用户保存的开关状态） */
export function loadSkills(): Skill[] {
  try {
    const saved: Record<string, boolean> = JSON.parse(localStorage.getItem(SKILLS_STORAGE_KEY) || '{}')
    return DEFAULT_SKILLS.map(s => ({
      ...s,
      enabled: saved[s.id] !== undefined ? saved[s.id] : s.enabled,
    }))
  } catch {
    return DEFAULT_SKILLS.map(s => ({ ...s }))
  }
}

/** 保存技能开关状态 */
export function saveSkillsState(skills: Skill[]): void {
  const state: Record<string, boolean> = {}
  skills.forEach(s => { state[s.id] = s.enabled })
  localStorage.setItem(SKILLS_STORAGE_KEY, JSON.stringify(state))
}

/** 获取已启用的技能 */
export function getEnabledSkills(skills: Skill[]): Skill[] {
  return skills.filter(s => s.enabled)
}

/** 按分类分组 */
export function getSkillsByCategory(skills: Skill[]): Map<SkillCategory, Skill[]> {
  const map = new Map<SkillCategory, Skill[]>()
  skills.forEach(s => {
    const list = map.get(s.category) || []
    list.push(s)
    map.set(s.category, list)
  })
  return map
}

/** 获取技能统计 */
export function getSkillStats(skills: Skill[]) {
  const total = skills.length
  const enabled = skills.filter(s => s.enabled).length
  const builtin = skills.filter(s => s.source === 'builtin').length
  const mcp = skills.filter(s => s.source === 'mcp').length
  const custom = skills.filter(s => s.source === 'custom').length
  const hermes = skills.filter(s => s.source === 'hermes').length
  const needsLLM = skills.filter(s => s.requires.includes('llm')).length
  const needsWeb = skills.filter(s => s.requires.includes('web')).length
  return { total, enabled, builtin, mcp, custom, hermes, needsLLM, needsWeb }
}

// ─── Hermes 风格技能管理 ───

/** 创建自定义技能（Hermes agentskills.io 风格） */
export function createSkill(params: {
  id: string
  name: string
  description: string
  category?: SkillCategory
  icon?: string
  requires?: SkillRequire[]
}): Skill {
  return {
    id: params.id,
    name: params.name,
    description: params.description,
    enabled: true,
    source: 'custom',
    category: params.category || '智能分析',
    icon: params.icon || '⚡',
    requires: params.requires || ['llm'],
  }
}

/** 构建技能索引（用于 System Prompt 注入 — Hermes 风格） */
export function buildSkillsIndexPrompt(skills: Skill[]): string {
  const enabled = skills.filter(s => s.enabled)
  if (enabled.length === 0) return ''

  const byCategory = getSkillsByCategory(enabled)
  const lines: string[] = ['## Skills (mandatory)', 'Before replying, scan the skills below. If one clearly matches your task, follow its instructions.', '', '<available_skills>']

  for (const [category, catSkills] of byCategory) {
    lines.push(`  ${category}:`)
    for (const s of catSkills) {
      lines.push(`    - ${s.id}: ${s.description.slice(0, 60)}`)
    }
  }

  lines.push('</available_skills>')
  lines.push('If none match, proceed normally without loading a skill.')
  return lines.join('\n')
}
