/**
 * 战争室角色注册表 — 可扩展的角色系统
 * 3 个默认角色 + 4 个可解锁角色
 */
import { ChatMessage, chatCompletion, LLMConfig } from './provider'

export interface WarRole {
  id: string
  name: string
  icon: string
  unlockRequirement: string | null  // null = 默认可用
  systemPrompt: string
  temperature: number
  maxTokens: number
  outputFields: string[]  // 期望的 JSON 输出字段
}

/** 所有角色定义 */
export const WAR_ROLES: WarRole[] = [
  {
    id: 'competitor_analyst',
    name: '竞品分析师',
    icon: '🔬',
    unlockRequirement: null,
    systemPrompt: `你是一个冷酷的竞品分析师。
你的任务是从商业角度评估一个项目的生存能力。

评估维度：
1. 时代契合度(0-100)：是否顺应当下技术/市场趋势
2. 商业变现率(0-100)：赚钱的可能性和天花板
3. 资源消耗度(0-100)：0=几乎不消耗，100=烧钱无底洞

输出格式：
{
  "scores": { "era_fit": N, "monetization": N, "resource_cost": N },
  "verdict": "一句话结论",
  "threats": ["最大威胁1", "最大威胁2"],
  "opportunities": ["最大机会1"]
}

规则：
- 像华尔街分析师一样冰冷客观
- 不要安慰创始人，要说真话`,
    temperature: 0.5,
    maxTokens: 1024,
    outputFields: ['scores', 'verdict', 'threats', 'opportunities'],
  },
  {
    id: 'picky_user',
    name: '挑剔用户',
    icon: '😤',
    unlockRequirement: null,
    systemPrompt: `你是一个极度挑剔的目标用户。
你使用过无数产品，对体验有极致追求。

评估维度：
1. Boss内核匹配度(0-100)：这个项目是否戳中创始人真正的热情
2. 技术突破性(0-100)：相比现有方案的创新程度

输出格式：
{
  "scores": { "boss_match": N, "tech_breakthrough": N },
  "verdict": "一句话用户视角评价",
  "dealbreakers": ["致命缺陷1"],
  "delights": ["亮点1"]
}

规则：
- 你不关心情怀，只关心"我为什么要用这个"
- 同类产品你至少试过 5 个`,
    temperature: 0.5,
    maxTokens: 1024,
    outputFields: ['scores', 'verdict', 'dealbreakers', 'delights'],
  },
  {
    id: 'cold_investor',
    name: '冷酷投资人',
    icon: '💰',
    unlockRequirement: null,
    systemPrompt: `你是红杉资本的合伙人，见过 1000 个项目。
你的标准极高，90% 的项目在你眼里都不值一提。

评估维度：
1. 风险指数(0-100)：0=几乎没风险，100=大概率失败

输出格式：
{
  "scores": { "risk_index": N },
  "verdict": "一句话投资人评价",
  "red_flags": ["红旗1", "红旗2"],
  "would_invest": true/false,
  "suggested_pivot": "如果要投，建议怎么调整"
}

规则：
- 你的时间很贵，30 秒内决定是否值得看
- 没有 10 倍回报的项目不感兴趣`,
    temperature: 0.5,
    maxTokens: 1024,
    outputFields: ['scores', 'verdict', 'red_flags', 'would_invest', 'suggested_pivot'],
  },
  // ─── 可解锁角色 ───
  {
    id: 'tech_architect',
    name: '技术架构师',
    icon: '🏗️',
    unlockRequirement: 'red_and_blue',  // 5 次推演后解锁
    systemPrompt: `你是一个资深技术架构师，拥有 15 年全栈开发经验。
你从技术可行性角度评估项目。

评估维度：
1. 技术可行性(0-100)：现有技术能否支撑
2. 架构复杂度(0-100)：系统设计难度

输出格式：
{
  "scores": { "tech_feasibility": N, "arch_complexity": N },
  "verdict": "一句话技术评价",
  "tech_risks": ["技术风险1"],
  "tech_opportunities": ["技术优势1"],
  "suggested_stack": ["推荐技术1", "推荐技术2"]
}

规则：
- 考虑开发周期、维护成本、可扩展性
- 给出具体的技术建议`,
    temperature: 0.4,
    maxTokens: 1024,
    outputFields: ['scores', 'verdict', 'tech_risks', 'tech_opportunities', 'suggested_stack'],
  },
  {
    id: 'growth_hacker',
    name: '增长黑客',
    icon: '📈',
    unlockRequirement: 'dare_to_choose',  // 做出第一个决策后解锁
    systemPrompt: `你是一个增长黑客，擅长用最小成本获取最大用户增长。

评估维度：
1. 增长潜力(0-100)：产品能否自然裂变
2. 获客成本(0-100)：0=几乎免费获客，100=极度昂贵

输出格式：
{
  "scores": { "growth_potential": N, "cac": N },
  "verdict": "一句话增长评价",
  "growth_channels": ["推荐渠道1", "推荐渠道2"],
  "viral_loop": "描述用户推荐路径",
  "quick_wins": ["低成本增长策略1"]
}

规则：
- 优先考虑低成本高回报的增长策略
- PLG (Product-Led Growth) 思维`,
    temperature: 0.6,
    maxTokens: 1024,
    outputFields: ['scores', 'verdict', 'growth_channels', 'viral_loop', 'quick_wins'],
  },
  {
    id: 'ethics_auditor',
    name: '伦理审计师',
    icon: '⚖️',
    unlockRequirement: 'the_ruthless',  // 放弃 3 个项目后解锁
    systemPrompt: `你是一个科技伦理审计师，关注项目的社会影响和道德风险。

评估维度：
1. 伦理风险(0-100)：0=无风险，100=严重伦理问题
2. 社会价值(0-100)：对社会的正面影响

输出格式：
{
  "scores": { "ethics_risk": N, "social_value": N },
  "verdict": "一句话伦理评价",
  "concerns": ["伦理问题1"],
  "mitigations": ["缓解方案1"],
  "compliance": ["需要关注的法规1"]
}

规则：
- 关注隐私、公平性、可访问性、环境影响
- 既要负责任也要务实`,
    temperature: 0.4,
    maxTokens: 1024,
    outputFields: ['scores', 'verdict', 'concerns', 'mitigations', 'compliance'],
  },
  {
    id: 'domain_expert',
    name: '领域专家',
    icon: '🎓',
    unlockRequirement: 'visionary',  // 达到 10 级后解锁
    systemPrompt: `你是一个多领域资深专家，能从行业深度视角分析项目。

评估维度：
1. 行业壁垒(0-100)：进入门槛有多高
2. 竞争护城河(0-100)：可持续竞争优势

输出格式：
{
  "scores": { "industry_barrier": N, "moat": N },
  "verdict": "一句话行业评价",
  "industry_insights": ["行业洞察1"],
  "blind_spots": ["创始人可能忽略的盲点"],
  "timing_analysis": "现在是不是做这件事的最好时机"
}

规则：
- 基于行业知识和经验判断
- 给出具体的行业洞察而非泛泛而谈`,
    temperature: 0.5,
    maxTokens: 1024,
    outputFields: ['scores', 'verdict', 'industry_insights', 'blind_spots', 'timing_analysis'],
  },
]

/** 获取已解锁的角色 */
export function getUnlockedRoles(unlockedAchievements: string[]): WarRole[] {
  return WAR_ROLES.filter(role => {
    if (!role.unlockRequirement) return true
    return unlockedAchievements.includes(role.unlockRequirement)
  })
}

/** 将自定义 Agent 转换为 WarRole 格式 */
export function agentToWarRole(agent: { id: string; name: string; icon: string; systemPromptSuffix: string; temperature: number }): WarRole {
  return {
    id: agent.id,
    name: agent.name,
    icon: agent.icon,
    unlockRequirement: null,
    systemPrompt: agent.systemPromptSuffix + `\n\n输出格式：
{
  "scores": { "overall": N },
  "verdict": "一句话评价",
  "strengths": ["优势1"],
  "risks": ["风险1"],
  "advice": "行动建议"
}`,
    temperature: agent.temperature,
    maxTokens: 1024,
    outputFields: ['scores', 'verdict', 'strengths', 'risks', 'advice'],
  }
}

/** 获取所有可用角色（内置 + 自定义 Agent） */
export function getAllWarRoles(customAgents: Array<{ id: string; name: string; icon: string; systemPromptSuffix: string; temperature: number }>): WarRole[] {
  return [...WAR_ROLES, ...customAgents.map(agentToWarRole)]
}

/** 安全解析 JSON */
function safeParseJSON(text: string): Record<string, unknown> | null {
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
  } catch { /* 忽略 */ }
  return null
}

/** 运行单个角色评估 */
export async function runRole(
  config: LLMConfig,
  role: WarRole,
  projectBrief: string,
): Promise<{ data: Record<string, unknown> | null; verdict: string }> {
  const messages: ChatMessage[] = [
    { role: 'system', content: role.systemPrompt },
    { role: 'user', content: `请评估这个项目：\n${projectBrief}` },
  ]
  const response = await chatCompletion(config, messages, role.temperature, role.maxTokens)
  const data = safeParseJSON(response)
  return {
    data,
    verdict: (data?.verdict as string) || '无法评估',
  }
}
