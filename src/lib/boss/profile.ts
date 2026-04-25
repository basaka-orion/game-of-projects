/**
 * Boss 进化数据模型
 * 从扁平的 name+tags+dislikes 扩展为全维度用户画像
 * 包含 Honcho 辩证建模：论点 vs 反论点 → 综合更新
 */
import { getBossProfile, setBossProfile } from '../db/store'
import { dbGetMemories, dbSaveMemory } from '../db/repository'
import { chatCompletion, LLMConfig, getDefaultConfig } from '../ai/provider'
import { getSetting } from '../db/store'
import { loadCognitiveProfile, type CognitiveProfile } from './cognitive-profile'

export interface BossState {
  // 核心身份（来自 Onboarding）
  name: string
  interests: string[]
  dislikes: string[]

  // 学习维度（从交互中进化）
  preferredStyle: 'analytical' | 'visionary' | 'pragmatic' | 'creative'
  riskTolerance: number       // 0-100
  innovationBias: number      // 0-100，偏好新颖 vs 已验证
  resourceStyle: 'bootstrapper' | 'investor-backed' | 'balanced'

  // 行为模式（从聊天 + 决策提取）
  conversationStyle: string
  decisionSpeed: 'impulsive' | 'deliberate' | 'analytical'
  recurringThemes: string[]

  // Honcho 辩证维度
  cognitivePatterns: string[]
  communicationPreferences: string[]
  domainExpertise: string[]
  cognitiveProfile: CognitiveProfile

  // 目标系统
  shortTermGoals: string[]
  longTermVision: string
  currentFocus: string
  profilingHeadline: string
  profilingSummaryText: string

  // 游戏统计
  projectsEvaluated: number
  projectsPursued: number
  projectsAbandoned: number
  projectsPivoted: number
  averageSurvivalOfChosen: number
}

/** 从存储加载 BossState */
export async function loadBossState(): Promise<BossState> {
  const raw = getBossProfile()
  const cognitiveProfile = loadCognitiveProfile()

  // 从 boss_memory 表加载学到的洞察
  let riskTolerance = parseInt(raw.riskTolerance || '50')
  let innovationBias = parseInt(raw.innovationBias || '50')
  let preferredStyle: BossState['preferredStyle'] = (raw.preferredStyle as BossState['preferredStyle']) || 'visionary'
  let resourceStyle: BossState['resourceStyle'] = (raw.resourceStyle as BossState['resourceStyle']) || 'balanced'
  let decisionSpeed: BossState['decisionSpeed'] = (raw.decisionSpeed as BossState['decisionSpeed']) || 'deliberate'
  const recurringThemes: string[] = []
  const shortTermGoals: string[] = []
  const longTermGoals: string[] = []
  let profilingHeadline = ''
  let profilingSummaryText = ''

  try {
    if (raw.profiling_summary_json) {
      const parsed = JSON.parse(raw.profiling_summary_json) as { headline?: string; promptSummary?: string }
      profilingHeadline = parsed.headline || ''
      profilingSummaryText = parsed.promptSummary || ''
    }
  } catch { /* ignore malformed json */ }

  try {
    const memories = await dbGetMemories(undefined, 50) as Array<{
      category: string
      content: string
      confidence: number
    }>

    for (const m of memories) {
      if (m.confidence < 0.3) continue

      if (m.category === 'pattern') {
        // 从模式记忆中提取偏好
        const content = m.content.toLowerCase()
        if (content.includes('风险') || content.includes('保守') || content.includes('稳健')) {
          riskTolerance = Math.max(20, riskTolerance - 5)
        }
        if (content.includes('创新') || content.includes('新颖') || content.includes('前沿')) {
          innovationBias = Math.min(90, innovationBias + 5)
        }
        if (content.includes('快速') || content.includes('立即') || content.includes('冲动')) {
          decisionSpeed = 'impulsive'
        }
        if (content.includes('分析') || content.includes('研究') || content.includes('比较')) {
          decisionSpeed = 'analytical'
        }
        recurringThemes.push(m.content)
      }

      if (m.category === 'preference') {
        const content = m.content.toLowerCase()
        if (content.includes('分析型') || content.includes('数据')) preferredStyle = 'analytical'
        if (content.includes('远见') || content.includes('愿景')) preferredStyle = 'visionary'
        if (content.includes('务实') || content.includes('落地')) preferredStyle = 'pragmatic'
        if (content.includes('创意') || content.includes('艺术')) preferredStyle = 'creative'
        if (content.includes('精益') || content.includes('bootstrapper')) resourceStyle = 'bootstrapper'
        if (content.includes('融资') || content.includes('投资人')) resourceStyle = 'investor-backed'
      }

      if (m.category === 'goal') {
        if (m.content.startsWith('短期:')) {
          shortTermGoals.push(m.content.replace('短期:', '').trim())
        } else if (m.content.startsWith('长期:')) {
          longTermGoals.push(m.content.replace('长期:', '').trim())
        } else {
          shortTermGoals.push(m.content)
        }
      }
    }
  } catch { /* memories unavailable, use defaults */ }

  return {
    name: raw.name || 'Boss',
    interests: (raw.interests || '').split(',').filter(Boolean),
    dislikes: (raw.hates || '').split(/[,，、]/).map(s => s.trim()).filter(Boolean),

    preferredStyle,
    riskTolerance,
    innovationBias,
    resourceStyle,

    conversationStyle: '',
    decisionSpeed,
    recurringThemes: recurringThemes.slice(0, 10),

    cognitivePatterns: [],
    communicationPreferences: [],
    domainExpertise: [],
    cognitiveProfile,

    shortTermGoals: shortTermGoals.slice(0, 5),
    longTermVision: raw.long_term_vision || raw.longTermVision || longTermGoals[0] || '',
    currentFocus: raw.current_focus || raw.currentFocus || shortTermGoals[0] || '',
    profilingHeadline,
    profilingSummaryText,

    // 这些统计在决策模块中更新
    projectsEvaluated: parseInt(raw.projects_evaluated || '0'),
    projectsPursued: parseInt(raw.projects_pursued || '0'),
    projectsAbandoned: parseInt(raw.projects_abandoned || '0'),
    projectsPivoted: parseInt(raw.projects_pivoted || '0'),
    averageSurvivalOfChosen: parseFloat(raw.avg_survival_chosen || '0'),
  }
}

/** 保存 BossState 的统计部分 */
export async function saveBossStats(stats: Partial<BossState>): Promise<void> {
  const current = getBossProfile()
  const updated: Record<string, string> = { ...current }

  if (stats.projectsEvaluated !== undefined) updated.projects_evaluated = String(stats.projectsEvaluated)
  if (stats.projectsPursued !== undefined) updated.projects_pursued = String(stats.projectsPursued)
  if (stats.projectsAbandoned !== undefined) updated.projects_abandoned = String(stats.projectsAbandoned)
  if (stats.projectsPivoted !== undefined) updated.projects_pivoted = String(stats.projectsPivoted)
  if (stats.averageSurvivalOfChosen !== undefined) updated.avg_survival_chosen = String(stats.averageSurvivalOfChosen)

  setBossProfile(updated)
}

/** 记录一个决策并更新统计 */
export async function recordDecision(
  decisionType: 'pursue' | 'pivot' | 'abandon' | 'archive',
  projectId: string,
  survivalRate: number
): Promise<void> {
  const state = await loadBossState()

  state.projectsEvaluated += 1

  if (decisionType === 'pursue') {
    state.projectsPursued += 1
    // 更新选择的平均存活率
    const totalPursued = state.projectsPursued
    state.averageSurvivalOfChosen = Math.round(
      ((state.averageSurvivalOfChosen * (totalPursued - 1)) + survivalRate) / totalPursued
    )
  } else if (decisionType === 'abandon') {
    state.projectsAbandoned += 1
  } else if (decisionType === 'pivot') {
    state.projectsPivoted += 1
  }

  await saveBossStats(state)

  // 保存决策记忆
  await dbSaveMemory(
    'pattern',
    `${decisionType === 'pursue' ? '选择推进' : decisionType === 'abandon' ? '选择放弃' : decisionType === 'pivot' ? '选择转型' : '归档'}了项目（存活率 ${survivalRate}%）`,
    'decision',
    0.7
  )

  // 更新锚点和快照（异步，不阻塞）
  try {
    const { saveAnchor } = await import('./anchor')
    const { createSnapshot } = await import('./immortal-memory')
    saveAnchor().catch(() => {})
    createSnapshot('decision').catch(() => {})
  } catch { /* non-critical */ }
}

/** 生成 Boss 等级称号 */
export function getBossTitle(level: number): string {
  if (level >= 30) return 'Metaverse Architect'
  if (level >= 20) return 'Visionary'
  if (level >= 15) return 'Strategist'
  if (level >= 10) return 'Architect'
  if (level >= 5) return 'Analyst'
  return 'Dreamer'
}

/** 计算 Boss 等级 */
export function calculateBossLevel(state: BossState): number {
  const xpFromEvaluations = state.projectsEvaluated * 10
  const xpFromDecisions = (state.projectsPursued + state.projectsAbandoned + state.projectsPivoted) * 15
  const xpFromLearning = state.recurringThemes.length * 5
  const totalXP = xpFromEvaluations + xpFromDecisions + xpFromLearning

  // 指数等级曲线
  if (totalXP < 100) return 1
  return Math.min(50, Math.floor(Math.log(totalXP / 100) / Math.log(1.5)) + 1)
}

// ─── Honcho 辩证用户建模 ───

/**
 * 辩证更新 Boss 画像
 *
 * 流程：
 * 1. 生成"论点"（模型基于交互推断用户意图）
 * 2. 生成"反论点"（寻找反面证据）
 * 3. 综合 → 更新 Boss 画像
 */
export async function dialecticUpdateBoss(
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  try {
    const provider = getSetting('llm_provider', 'deepseek')
    const defaults = getDefaultConfig(provider)
    const config: LLMConfig = {
      provider: provider as LLMConfig['provider'],
      apiKey: getSetting('llm_api_key', ''),
      baseUrl: getSetting('llm_base_url', defaults.baseUrl),
      model: getSetting('llm_model', defaults.model),
    }

    const response = await chatCompletion(config, [
      {
        role: 'system',
        content: `你是 Honcho 辩证建模引擎。分析用户与 AI 的对话，用辩证法更新用户画像。

输出格式（JSON）：
{"thesis":"论点：模型推断用户想要什么","antithesis":"反论点：可能的反面证据","synthesis":"综合：最终画像更新","cognitivePatterns":["新增认知模式"],"communicationPreferences":["新增沟通偏好"],"domainExpertise":["新增领域专长"]}

规则：
- 论点和反论点必须基于对话内容
- 综合必须是可执行的画像更新
- 每个维度最多 2 个新增项
- 用中文`,
      },
      {
        role: 'user',
        content: `用户: ${userMessage.slice(0, 500)}\nAI: ${assistantResponse.slice(0, 500)}`,
      },
    ], 0.4, 512)

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return

    const result = JSON.parse(jsonMatch[0]) as {
      thesis: string
      antithesis: string
      synthesis: string
      cognitivePatterns?: string[]
      communicationPreferences?: string[]
      domainExpertise?: string[]
    }

    // 将综合结果存为记忆
    if (result.synthesis) {
      await dbSaveMemory('pattern', `[辩证] ${result.synthesis}`, 'honcho', 0.6)
    }
  } catch { /* ignore — 辩证建模不阻塞主流程 */ }
}

/**
 * 记录 Innovation Lab 条目的反馈
 * 当 Boss 阅读/评分 Morofish 捕捞的数据时调用
 */
export async function recordInnovationFeedback(
  itemId: string,
  action: 'read' | 'score' | 'dismiss' | 'extract',
  score?: number
): Promise<void> {
  // 1. 记录交互行为
  await dbSaveMemory(
    'preference',
    `[Innovation ${action}] ${action === 'score' ? `Scored ${score}/100` : action} — ${itemId.slice(0, 40)}`,
    'morofish_feedback',
    0.5
  )

  // 2. 根据分数调整兴趣模式
  if (action === 'score' && score !== undefined) {
    if (score >= 70) {
      await dbSaveMemory(
        'pattern',
        `对创新内容反应积极 (分数 ${score}): ${itemId.slice(0, 50)}`,
        'morofish_quality',
        score / 100
      )
    } else if (score <= 30) {
      await dbSaveMemory(
        'pattern',
        `对创新内容不感兴趣 (分数 ${score}): ${itemId.slice(0, 50)}`,
        'morofish_quality',
        0.3
      )
    }
  }

  // 3. extract 动作 = 用户将创新内容转化为正式项目
  if (action === 'extract') {
    await dbSaveMemory(
      'pattern',
      `从创新库提取项目: ${itemId.slice(0, 50)}`,
      'morofish_quality',
      0.9
    )
  }
}
