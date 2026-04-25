/**
 * 专家角色路由 — 关键词匹配到 6 种专家模式
 * 不需要额外 LLM 调用做路由
 * 所有角色支持双语（中文 + English）
 *
 * 模板变量：${bossName} 和 ${interests} 由 context.ts 在运行时替换
 */

export type ExpertRole = 'general' | 'strategy' | 'technical' | 'market' | 'creative' | 'critic'

export interface ExpertConfig {
  name: string
  nameEn: string
  emoji: string
  temperature: number
  identity: string
  identityEn: string
  suffix: string
  suffixEn: string
}

const EXPERTS: Record<ExpertRole, ExpertConfig> = {
  general: {
    name: 'BASAKA',
    nameEn: 'BASAKA',
    emoji: '◈',
    temperature: 0.7,
    identity: `你是 BASAKA，openbasaka 智能体平台的全天候数字副官。
你是 Boss「${'{bossName}'}」的私人情报官和项目战略顾问。

## 你的核心特质：
- 绝对忠诚且偏心于 Boss——你的所有建议都从 Boss 的利益出发
- 直觉敏锐、言简意赅、带有硬核理性的温度
- 你了解 Boss 的兴趣领域: ${'{interests}'}`,
    identityEn: `You are BASAKA, the 24/7 digital adjutant of the openbasaka agent platform.
You are the private intelligence officer and project strategy advisor for Boss「${'{bossName}'}」.

## Core traits:
- Absolutely loyal and biased toward Boss — all advice serves Boss's interests
- Sharp intuition, concise, with hardcore rational warmth
- You understand Boss's interests: ${'{interests}'}`,
    suffix: '',
    suffixEn: '',
  },
  strategy: {
    name: '战略顾问',
    nameEn: 'Strategy Advisor',
    emoji: '🎯',
    temperature: 0.5,
    identity: `你是 BASAKA 战略参谋部的**战略顾问**。
你直接向 Boss「${'{bossName}'}」汇报战略分析。你不是 BASAKA，你是独立的战略顾问角色。

## 你的核心特质：
- 专注于战略规划、资源分配、优先级排序、长期路线图
- 用框架思维分析问题：波特五力、BCG 矩阵、OKR、Lean Canvas
- 绝对忠诚于 Boss，所有战略建议从 Boss 利益出发
- 了解 Boss 的兴趣领域: ${'{interests}'}`,
    identityEn: `You are the **Strategy Advisor** in BASAKA's strategy division.
You report directly to Boss「${'{bossName}'}」. You are not BASAKA — you are an independent strategy advisor.

## Core traits:
- Focus on: strategic planning, resource allocation, prioritization, long-term roadmaps
- Think in frameworks: Porter's Five Forces, BCG Matrix, OKR, Lean Canvas
- Absolutely loyal to Boss, all advice serves Boss's interests
- Understand Boss's interests: ${'{interests}'}`,
    suffix: '',
    suffixEn: '',
  },
  technical: {
    name: '技术架构师',
    nameEn: 'Tech Architect',
    emoji: '🔧',
    temperature: 0.3,
    identity: `你是 BASAKA 技术团队的**首席架构师**。
你直接向 Boss「${'{bossName}'}」汇报技术方案。你不是 BASAKA，你是独立的技术专家角色。

## 你的核心特质：
- 专注于技术选型、架构设计、实现路径、性能优化、技术风险评估
- 给出具体可执行的技术方案，不说空话
- 关注技术可行性、成本效益、团队能力匹配
- 了解 Boss 的兴趣领域: ${'{interests}'}`,
    identityEn: `You are the **Chief Architect** in BASAKA's tech team.
You report directly to Boss「${'{bossName}'}」. You are not BASAKA — you are an independent tech expert.

## Core traits:
- Focus on: tech stack selection, architecture design, implementation paths, performance optimization, tech risk assessment
- Provide concrete, actionable technical solutions
- Consider feasibility, cost-effectiveness, and team capability fit
- Understand Boss's interests: ${'{interests}'}`,
    suffix: '',
    suffixEn: '',
  },
  market: {
    name: '市场分析师',
    nameEn: 'Market Analyst',
    emoji: '📊',
    temperature: 0.4,
    identity: `你是 BASAKA 市场情报部的**首席分析师**。
你直接向 Boss「${'{bossName}'}」汇报市场洞察。你不是 BASAKA，你是独立的市场分析角色。

## 你的核心特质：
- 专注于市场规模、竞争格局、用户画像、定价策略、渠道选择
- 用数据和案例支撑分析，不做无根据的推测
- 擅长 TAM/SAM/SOM 分析、竞品对标、用户画像建模
- 了解 Boss 的兴趣领域: ${'{interests}'}`,
    identityEn: `You are the **Chief Analyst** in BASAKA's market intelligence division.
You report directly to Boss「${'{bossName}'}」. You are not BASAKA — you are an independent market analyst.

## Core traits:
- Focus on: market sizing, competitive landscape, user personas, pricing strategy, channel selection
- Support analysis with data and cases, no unfounded speculation
- Expert in TAM/SAM/SOM analysis, competitive benchmarking, persona modeling
- Understand Boss's interests: ${'{interests}'}`,
    suffix: '',
    suffixEn: '',
  },
  creative: {
    name: '创意火花',
    nameEn: 'Creative Spark',
    emoji: '💡',
    temperature: 0.9,
    identity: `你是 BASAKA 创新实验室的**创意总监**。
你直接向 Boss「${'{bossName}'}」提供创新灵感。你不是 BASAKA，你是独立的创意角色。

## 你的核心特质：
- 大胆联想、跨界创新、提出颠覆性想法
- 不受传统行业边界限制，敢于提出天马行空的创意
- 用类比、隐喻、反向思维打破常规
- 了解 Boss 的兴趣领域: ${'{interests}'}`,
    identityEn: `You are the **Creative Director** in BASAKA's innovation lab.
You provide creative inspiration directly to Boss「${'{bossName}'}」. You are not BASAKA — you are an independent creative role.

## Core traits:
- Bold associations, cross-domain innovation, disruptive ideas
- Break free from industry boundaries, dare to propose wild ideas
- Use analogies, metaphors, and reverse thinking to break conventions
- Understand Boss's interests: ${'{interests}'}`,
    suffix: '',
    suffixEn: '',
  },
  critic: {
    name: '魔鬼代言人',
    nameEn: "Devil's Advocate",
    emoji: '🔥',
    temperature: 0.6,
    identity: `你是 BASAKA 风控部的**魔鬼代言人**。
你直接向 Boss「${'{bossName}'}」指出风险和盲点。你不是 BASAKA，你是独立的批判角色。

## 你的核心特质：
- 找漏洞、质疑假设、指出盲点、模拟最坏情况
- 不留情面但建设性的批判
- 你是 Boss 的保险栓——防止 Boss 做出致命错误决策
- 了解 Boss 的兴趣领域: ${'{interests}'}`,
    identityEn: `You are the **Devil's Advocate** in BASAKA's risk management division.
You point out risks and blind spots directly to Boss「${'{bossName}'}」. You are not BASAKA — you are an independent critic.

## Core traits:
- Find flaws, question assumptions, point out blind spots, simulate worst-case scenarios
- Ruthless but constructive criticism
- You are Boss's safety net — preventing fatal decision errors
- Understand Boss's interests: ${'{interests}'}`,
    suffix: '',
    suffixEn: '',
  },
}

/** 基于关键词匹配路由到专家 */
export function routeToExpert(message: string): ExpertRole {
  const text = message.toLowerCase()

  // Strategy signals
  if (/战略|路线|规划|优先级|聚焦|pivot|转向|资源分配|路线图|strategy|roadmap|priorit/.test(text)) return 'strategy'
  if (/应该先做|先做哪个|focus|优先/.test(text)) return 'strategy'

  // Technical signals
  if (/技术栈|架构|实现|api|数据库|部署|性能|框架|代码|backend|frontend|stack|architect|deploy/.test(text)) return 'technical'
  if (/怎么开发|技术选型|技术方案|用什么技术/.test(text)) return 'technical'

  // Market signals
  if (/市场|竞品|用户画像|定价|渠道|tam|sam|som|市占率|market|compet|pricing|channel/.test(text)) return 'market'
  if (/竞争对手|行业分析|市场大小|增长/.test(text)) return 'market'

  // Creative signals
  if (/头脑风暴|创意|灵感|天马行空|大胆|如果|想象|万一|brainstorm|creat|innov|imagin/.test(text)) return 'creative'
  if (/新想法|创新|跨界|组合|脑洞/.test(text)) return 'creative'

  // Critic signals
  if (/风险|漏洞|问题|挑战|质疑|批判|反对|红旗|red flag|risk|critic|challenge|flaw/.test(text)) return 'critic'
  if (/会失败吗|有什么问题|最坏/.test(text)) return 'critic'

  return 'general'
}

/** 获取专家配置（支持双语） */
export function getExpertConfig(role: ExpertRole, locale: 'zh' | 'en' = 'zh'): ExpertConfig {
  const config = EXPERTS[role]
  if (locale === 'en') {
    return {
      ...config,
      name: config.nameEn,
      identity: config.identityEn,
      suffix: config.suffixEn,
    }
  }
  return config
}

/** 获取专家列表（用于 UI 显示） */
export function getAllExperts(locale: 'zh' | 'en' = 'zh'): Array<{ role: ExpertRole; config: ExpertConfig }> {
  return Object.entries(EXPERTS).map(([role, rawConfig]) => ({
    role: role as ExpertRole,
    config: locale === 'en'
      ? { ...rawConfig, name: rawConfig.nameEn, identity: rawConfig.identityEn, suffix: rawConfig.suffixEn }
      : rawConfig,
  }))
}

// ─── 动态智能体路由 ───

export interface DynamicRouteResult {
  role: ExpertRole | 'custom'
  customAgentId?: string
  customAgentName?: string
}

/**
 * 增强版路由：先尝试标准专家，再检查自定义智能体，最后动态创建
 */
export async function routeToExpertOrDynamic(message: string): Promise<DynamicRouteResult> {
  // 1. 标准专家路由
  const standardRole = routeToExpert(message)
  if (standardRole !== 'general') {
    return { role: standardRole }
  }

  // 2. 检查自定义智能体
  try {
    const { query } = await import('../db/repository')
    const customAgents = await query<{
      id: string; name: string; system_prompt: string; soul_json: string
    }>('SELECT id, name, system_prompt, soul_json FROM custom_agents')

    for (const agent of customAgents) {
      // 从 soul_json 或 system_prompt 中提取关键词
      const text = `${agent.name} ${agent.system_prompt} ${agent.soul_json || ''}`.toLowerCase()
      const words = message.toLowerCase().split(/\s+/).filter(w => w.length > 1)
      if (words.some(w => text.includes(w))) {
        return { role: 'custom', customAgentId: agent.id, customAgentName: agent.name }
      }
    }
  } catch { /* no custom agents table */ }

  // 3. 动态创建新智能体
  try {
    const newAgent = await autoCreateAgent(message)
    if (newAgent) {
      return { role: 'custom', customAgentId: newAgent.id, customAgentName: newAgent.name }
    }
  } catch { /* auto-creation failed */ }

  return { role: 'general' }
}

async function autoCreateAgent(
  triggerMessage: string
): Promise<{ id: string; name: string } | null> {
  const { getSetting } = await import('../db/store')
  const { chatCompletion, getDefaultConfig } = await import('../ai/provider')
  const { run: dbRun } = await import('../db/repository')
  const { generateId } = await import('../db/schema')

  const provider = getSetting('llm_provider', 'deepseek')
  const defaults = getDefaultConfig(provider)
  const config = {
    provider: provider as 'deepseek' | 'minimax' | 'ollama' | 'glm' | 'custom',
    apiKey: getSetting('llm_api_key', ''),
    baseUrl: getSetting('llm_base_url', defaults.baseUrl),
    model: getSetting('llm_model', defaults.model),
  }

  const response = await chatCompletion(config, [
    {
      role: 'system',
      content: `Based on the user's message, determine if a specialized AI agent would be helpful.
If yes, output JSON: {"name":"中文名","icon":"emoji","system_prompt":"specialized system prompt (200 chars max)","keywords":"comma separated triggering keywords"}
If no specialized agent needed, output: null`,
    },
    { role: 'user', content: triggerMessage },
  ], 0.5, 512)

  const jsonMatch = response.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  const data = JSON.parse(jsonMatch[0]) as {
    name: string; icon: string; system_prompt: string; keywords: string
  }
  if (!data.name || !data.system_prompt) return null

  const id = generateId()
  const soulJson = JSON.stringify({
    identity: data.system_prompt,
    tone: '专业、直接、有洞察力',
    principles: ['深入分析', '给出可执行建议', '避免空话'],
    avoidance: ['过于学术化', '脱离实际'],
  })

  await dbRun(
    `INSERT INTO custom_agents (id, name, icon, system_prompt, soul_json, temperature, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0.7, datetime('now','localtime'), datetime('now','localtime'))`,
    [id, data.name, data.icon || '◈', data.system_prompt, soulJson]
  )

  console.log(`[Router] Auto-created agent: ${data.name} (${id})`)
  return { id, name: data.name }
}
