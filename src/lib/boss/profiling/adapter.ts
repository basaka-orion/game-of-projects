import type {
  ExternalProfilingResult,
  NormalizedBossProfile,
  QuickProfilingAnswers,
} from './types'
import { buildProfilingSummary } from './summary'
import { DIMENSION_MAP } from '../../../features/profiling-studio/data/dimensions'
import type { HumanMapBlueprint, HumanMapSignalId } from '../../../features/profiling-studio/types'

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(v => v.trim()).filter(Boolean))]
}

function keywordScore(text: string, keywords: string[]): number {
  const lowered = text.toLowerCase()
  return keywords.reduce((sum, keyword) => (
    lowered.includes(keyword.toLowerCase()) ? sum + 1 : sum
  ), 0)
}

function parseRaw(input: Record<string, unknown>): QuickProfilingAnswers {
  const list = (value: unknown) => Array.isArray(value) ? unique(value.map(String)) : []
  return {
    name: typeof input.name === 'string' ? input.name.trim() : '',
    interests: list(input.interests),
    dislikes: list(input.dislikes),
    longTermVision: typeof input.longTermVision === 'string' ? input.longTermVision.trim() : '',
    currentFocus: typeof input.currentFocus === 'string' ? input.currentFocus.trim() : '',
    workStyle: (['analytical', 'visionary', 'pragmatic', 'creative'].includes(String(input.workStyle))
      ? input.workStyle
      : 'visionary') as QuickProfilingAnswers['workStyle'],
    riskTolerance: clamp(Number(input.riskTolerance) || 50),
    innovationBias: clamp(Number(input.innovationBias) || 50),
    socialEnergy: clamp(Number(input.socialEnergy) || 50),
    executionDiscipline: clamp(Number(input.executionDiscipline) || 50),
    emotionalSensitivity: clamp(Number(input.emotionalSensitivity) || 50),
    aestheticSensitivity: clamp(Number(input.aestheticSensitivity) || 50),
    curiosityBreadth: clamp(Number(input.curiosityBreadth) || 50),
    worldviewDrive: clamp(Number(input.worldviewDrive) || 50),
    excitementTriggers: list(input.excitementTriggers),
    explanationPreferences: list(input.explanationPreferences),
    antiPatterns: list(input.antiPatterns),
  }
}

export function buildQuickProfilingResult(input: QuickProfilingAnswers): ExternalProfilingResult {
  return {
    source: 'multi_dimension_profiling',
    mode: 'quick',
    profileVersion: 'quick-v1',
    raw: input as unknown as Record<string, unknown>,
  }
}

function isHumanMapBlueprint(input: unknown): input is HumanMapBlueprint {
  if (!input || typeof input !== 'object') return false
  const candidate = input as Record<string, unknown>
  const mode = candidate.mode
  return (
    (mode === 'detailed' || mode === 'compact') &&
    typeof candidate.currentFocus === 'string' &&
    typeof candidate.lifeStage === 'string' &&
    Array.isArray(candidate.signalScores) &&
    Array.isArray(candidate.dimensionPlans)
  )
}

export function buildHumanMapProfilingResult(blueprint: HumanMapBlueprint): ExternalProfilingResult {
  return {
    source: 'multi_dimension_profiling',
    mode: 'deep',
    profileVersion: `human-map-${blueprint.mode}-v1`,
    raw: blueprint as unknown as Record<string, unknown>,
  }
}

function normalizeHumanMapWeights(weights: Record<string, number>): Record<string, number> {
  const entries = Object.entries(weights)
  if (entries.length === 0) return {}

  const values = entries.map(([, value]) => Number(value) || 0)
  const min = Math.min(...values)
  const max = Math.max(...values)

  return Object.fromEntries(entries.map(([key, value]) => {
    if (max === min) return [key, 58]
    return [key, clamp(38 + ((value - min) / (max - min)) * 54)]
  }))
}

function getHumanMapSignalIntensity(blueprint: HumanMapBlueprint, signalId: HumanMapSignalId): number {
  const target = blueprint.signalScores.find(signal => signal.id === signalId)
  if (!target) return 0
  const maxScore = Math.max(4, ...blueprint.signalScores.map(signal => signal.score))
  return Math.min(1, target.score / maxScore)
}

function collectHumanMapText(blueprint: HumanMapBlueprint): string {
  return [
    blueprint.summary,
    blueprint.lifeStage,
    blueprint.currentFocus,
    blueprint.immersivePrompt,
    ...blueprint.sourceDigest,
    ...blueprint.dimensionPlans.slice(0, 3).map(plan => `${plan.reason} ${plan.immersivePrompt}`),
  ].join(' ')
}

function inferHumanMapStyle(
  blueprint: HumanMapBlueprint,
  normalizedWeights: Record<string, number>,
): NormalizedBossProfile['operational']['preferredStyle'] {
  const text = collectHumanMapText(blueprint)
  const scores: Record<NormalizedBossProfile['operational']['preferredStyle'], number> = {
    analytical: keywordScore(text, ['结构', '模型', '系统', '逻辑', '框架', '分析', '拆解']) * 4,
    visionary: keywordScore(text, ['意义', '方向', '世界观', '未来', '成为', '长期', '身份']) * 4,
    pragmatic: keywordScore(text, ['执行', '推进', '落地', '目标', '节奏', '效率', '解决']) * 4,
    creative: keywordScore(text, ['创造', '表达', '审美', '灵感', '作品', '设计', '写作']) * 4,
  }

  const dimensionBoosts: Record<string, Partial<Record<keyof typeof scores, number>>> = {
    cognitive: { analytical: 18 },
    personality: { pragmatic: 8, analytical: 6 },
    emotion: { visionary: 10, creative: 6 },
    motivation: { pragmatic: 16, visionary: 8 },
    social: { visionary: 10, creative: 5 },
    aesthetic: { creative: 18 },
    worldview: { visionary: 18, analytical: 6 },
    strengths: { pragmatic: 8, creative: 8 },
  }

  for (const [dimensionId, value] of Object.entries(normalizedWeights)) {
    const factor = (value - 32) / 8
    const boosts = dimensionBoosts[dimensionId]
    if (!boosts) continue
    for (const [style, boost] of Object.entries(boosts)) {
      scores[style as keyof typeof scores] += (boost || 0) * factor
    }
  }

  const signalBoosts: Record<HumanMapSignalId, Partial<Record<keyof typeof scores, number>>> = {
    identity_meaning: { visionary: 16, analytical: 4 },
    career_execution: { pragmatic: 16, analytical: 6 },
    emotion_healing: { visionary: 8, creative: 6 },
    relationship_pattern: { visionary: 8, creative: 4 },
    creativity_expression: { creative: 18, visionary: 5 },
    cognition_learning: { analytical: 18, pragmatic: 5 },
  }

  for (const signalId of Object.keys(signalBoosts) as HumanMapSignalId[]) {
    const intensity = getHumanMapSignalIntensity(blueprint, signalId)
    for (const [style, boost] of Object.entries(signalBoosts[signalId])) {
      scores[style as keyof typeof scores] += (boost || 0) * intensity
    }
  }

  return (Object.entries(scores)
    .sort((left, right) => right[1] - left[1])[0]?.[0] || 'visionary') as NormalizedBossProfile['operational']['preferredStyle']
}

function inferHumanMapLongTermVision(blueprint: HumanMapBlueprint): string {
  const futureCandidate = blueprint.sourceDigest.find(item => /(10 年|10年|未来|最终|成为|理想|数字化身)/.test(item))
  if (futureCandidate) return futureCandidate

  if (getHumanMapSignalIntensity(blueprint, 'identity_meaning') >= 0.7) {
    return `完成从「${blueprint.lifeStage}」到下一阶段的自我升级`
  }
  if (getHumanMapSignalIntensity(blueprint, 'career_execution') >= 0.7) {
    return `把“${blueprint.currentFocus}”沉淀成长期稳定推进的作品与系统`
  }
  if (getHumanMapSignalIntensity(blueprint, 'creativity_expression') >= 0.6) {
    return '让表达、审美与创造力进入稳定输出状态'
  }

  return `让“${blueprint.currentFocus}”不再停留在想法，而成为长期稳定的自我结构`
}

function inferHumanMapStrengths(
  blueprint: HumanMapBlueprint,
  normalizedWeights: Record<string, number>,
): string[] {
  const dimensionLabels = Object.entries(normalizedWeights)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([dimensionId]) => {
      switch (dimensionId) {
        case 'cognitive':
          return '系统洞察'
        case 'personality':
          return '自我调度'
        case 'emotion':
          return '情绪觉察'
        case 'motivation':
          return '目标牵引'
        case 'social':
          return '关系感知'
        case 'aesthetic':
          return '表达与审美'
        case 'worldview':
          return '意义整合'
        case 'strengths':
          return '内在韧性'
        default:
          return DIMENSION_MAP[dimensionId]?.name || dimensionId
      }
    })

  return unique([
    ...dimensionLabels,
    ...blueprint.signalScores.slice(0, 2).map(signal => signal.label),
  ]).slice(0, 4)
}

function inferHumanMapWatchouts(blueprint: HumanMapBlueprint): string[] {
  const watchouts: string[] = []

  if (getHumanMapSignalIntensity(blueprint, 'career_execution') >= 0.65) {
    watchouts.push('目标感很强时，容易同时开太多战线')
  }
  if (getHumanMapSignalIntensity(blueprint, 'emotion_healing') >= 0.55) {
    watchouts.push('高压阶段容易被情绪摩擦放大判断成本')
  }
  if (getHumanMapSignalIntensity(blueprint, 'relationship_pattern') >= 0.55) {
    watchouts.push('关系波动可能反向牵动执行节奏')
  }
  if (getHumanMapSignalIntensity(blueprint, 'identity_meaning') >= 0.6) {
    watchouts.push('容易把宏大的方向感放在具体行动之前')
  }
  if (getHumanMapSignalIntensity(blueprint, 'cognition_learning') >= 0.55) {
    watchouts.push('分析与理解越深，越要防止迟迟不进入行动')
  }
  if (getHumanMapSignalIntensity(blueprint, 'creativity_expression') >= 0.55) {
    watchouts.push('不要只在有灵感时才允许自己输出')
  }

  if (watchouts.length === 0) {
    watchouts.push('当前样本仍偏首版，需要继续用后续行为校准画像')
  }

  return unique(watchouts).slice(0, 4)
}

function buildHumanMapExplanationPreferences(
  blueprint: HumanMapBlueprint,
  style: NormalizedBossProfile['operational']['preferredStyle'],
): string[] {
  const preferences = ['先贴着你的阶段和原话解释，再给结构化判断']

  if (style === 'analytical') preferences.push('先框架后案例', '把变量拆成可比较模块')
  if (style === 'visionary') preferences.push('先大图景后路径', '把建议放进长期叙事')
  if (style === 'pragmatic') preferences.push('先结论后动作', '优先给出下一步和优先级')
  if (style === 'creative') preferences.push('先意象后结构', '保留表达张力与审美空间')

  if (blueprint.mode === 'detailed') {
    preferences.push('优先引用你前置建模里的关键线索')
  }

  return unique(preferences).slice(0, 8)
}

function buildHumanMapAddictiveFormats(
  blueprint: HumanMapBlueprint,
  style: NormalizedBossProfile['operational']['preferredStyle'],
): string[] {
  const formats = [
    ...blueprint.dimensionPlans.slice(0, 2).map(plan => `${DIMENSION_MAP[plan.dimensionId]?.name || plan.dimensionId}路线图`),
  ]

  if (style === 'analytical') formats.push('结构图', '决策框架', '变量对照表')
  if (style === 'visionary') formats.push('长期叙事图', '路线图', '阶段地图')
  if (style === 'pragmatic') formats.push('行动清单', '优先级表', '实验闭环')
  if (style === 'creative') formats.push('灵感地图', '风格谱系', '叙事板')

  return unique(formats).slice(0, 8)
}

function buildHumanMapUnderstandingModes(
  blueprint: HumanMapBlueprint,
  style: NormalizedBossProfile['operational']['preferredStyle'],
): string[] {
  const modes = [
    `优先代入你最近 30 天里最真实的状态`,
    `先处理「${blueprint.currentFocus}」再展开其他分支`,
  ]

  if (style === 'analytical') modes.push('先界定问题，再展开假设与验证')
  if (style === 'visionary') modes.push('先确认方向，再反推阶段动作')
  if (style === 'pragmatic') modes.push('先收束优先级，再安排执行节奏')
  if (style === 'creative') modes.push('先抓意象和张力，再补结构与约束')

  return unique(modes).slice(0, 8)
}

function buildHumanMapIntegrationGoals(blueprint: HumanMapBlueprint): string[] {
  const goals = [`围绕 ${blueprint.currentFocus} 建立更稳的自我结构`]

  if (getHumanMapSignalIntensity(blueprint, 'career_execution') >= 0.55) {
    goals.push('把洞见转成稳定的执行闭环')
  }
  if (getHumanMapSignalIntensity(blueprint, 'emotion_healing') >= 0.55) {
    goals.push('降低情绪波动对判断和推进的干扰')
  }
  if (getHumanMapSignalIntensity(blueprint, 'relationship_pattern') >= 0.55) {
    goals.push('建立更清晰的边界与信任方式')
  }
  if (getHumanMapSignalIntensity(blueprint, 'creativity_expression') >= 0.55) {
    goals.push('把表达欲和创造力变成可持续输出')
  }
  if (getHumanMapSignalIntensity(blueprint, 'identity_meaning') >= 0.55) {
    goals.push(`完成「${blueprint.lifeStage}」到下一阶段的身份升级`)
  }

  return unique(goals).slice(0, 6)
}

function buildHumanMapRecommendedAgents(
  blueprint: HumanMapBlueprint,
  style: NormalizedBossProfile['operational']['preferredStyle'],
): string[] {
  const agents = ['general']
  if (style === 'analytical') agents.push('technical', 'critic')
  if (style === 'visionary') agents.push('strategy', 'market')
  if (style === 'pragmatic') agents.push('technical', 'strategy')
  if (style === 'creative') agents.push('creative', 'market')

  if (getHumanMapSignalIntensity(blueprint, 'emotion_healing') >= 0.6) agents.push('critic')
  if (getHumanMapSignalIntensity(blueprint, 'creativity_expression') >= 0.6) agents.push('creative')
  if (getHumanMapSignalIntensity(blueprint, 'identity_meaning') >= 0.6) agents.push('strategy')

  return unique(agents)
}

function inferHumanMapConfidence(blueprint: HumanMapBlueprint): number {
  const activeSignals = blueprint.signalScores.filter(signal => signal.score > 0).length
  const base = blueprint.mode === 'detailed' ? 0.72 : 0.64
  const answerBoost = Math.min(blueprint.answerCount, blueprint.mode === 'detailed' ? 14 : 9) * 0.012
  const signalBoost = Math.min(activeSignals, 4) * 0.02
  return Math.max(0.58, Math.min(0.9, Number((base + answerBoost + signalBoost).toFixed(2))))
}

export function normalizeHumanMapProfilingResult(blueprint: HumanMapBlueprint): NormalizedBossProfile {
  const text = collectHumanMapText(blueprint)
  const normalizedWeights = normalizeHumanMapWeights(blueprint.dimensionWeights)
  const preferredStyle = inferHumanMapStyle(blueprint, normalizedWeights)

  const riskTolerance = clamp(
    36 +
    (normalizedWeights.motivation || 58) * 0.12 +
    getHumanMapSignalIntensity(blueprint, 'career_execution') * 14 +
    getHumanMapSignalIntensity(blueprint, 'creativity_expression') * 8 -
    getHumanMapSignalIntensity(blueprint, 'emotion_healing') * 10 -
    keywordScore(text, ['修复', '稳定', '安全', '焦虑', '失控']) * 3 +
    keywordScore(text, ['创业', '突破', '试错', 'all in', '爆发']) * 4
  )

  const innovationBias = clamp(
    34 +
    (normalizedWeights.cognitive || 58) * 0.16 +
    (normalizedWeights.aesthetic || 56) * 0.14 +
    (normalizedWeights.worldview || 56) * 0.08 +
    getHumanMapSignalIntensity(blueprint, 'creativity_expression') * 18 +
    getHumanMapSignalIntensity(blueprint, 'cognition_learning') * 10
  )

  const executionDiscipline = clamp(
    28 +
    (normalizedWeights.motivation || 58) * 0.28 +
    (normalizedWeights.personality || 54) * 0.16 +
    getHumanMapSignalIntensity(blueprint, 'career_execution') * 12 -
    getHumanMapSignalIntensity(blueprint, 'emotion_healing') * 6
  )

  const emotionalSensitivity = clamp(
    30 +
    (normalizedWeights.emotion || 58) * 0.38 +
    (normalizedWeights.social || 52) * 0.08 +
    getHumanMapSignalIntensity(blueprint, 'emotion_healing') * 20 +
    getHumanMapSignalIntensity(blueprint, 'relationship_pattern') * 8
  )

  const socialEnergy = clamp(
    48 +
    keywordScore(text, ['连接', '合作', '关系', '团队', '一起', '表达给别人']) * 4 -
    keywordScore(text, ['独处', '安静', '低噪', '边界', '一个人']) * 4 +
    (preferredStyle === 'visionary' || preferredStyle === 'creative' ? 3 : 0)
  )

  const aestheticSensitivity = clamp(
    28 +
    (normalizedWeights.aesthetic || 56) * 0.42 +
    getHumanMapSignalIntensity(blueprint, 'creativity_expression') * 22
  )

  const curiosityBreadth = clamp(
    32 +
    (normalizedWeights.cognitive || 58) * 0.3 +
    (normalizedWeights.worldview || 58) * 0.14 +
    getHumanMapSignalIntensity(blueprint, 'cognition_learning') * 12 +
    getHumanMapSignalIntensity(blueprint, 'identity_meaning') * 6
  )

  const worldviewDrive = clamp(
    30 +
    (normalizedWeights.worldview || 58) * 0.38 +
    (normalizedWeights.motivation || 56) * 0.16 +
    getHumanMapSignalIntensity(blueprint, 'identity_meaning') * 22
  )

  const longTermVision = inferHumanMapLongTermVision(blueprint)
  const strengths = inferHumanMapStrengths(blueprint, normalizedWeights)
  const watchouts = inferHumanMapWatchouts(blueprint)
  const explanationPreferences = buildHumanMapExplanationPreferences(blueprint, preferredStyle)
  const addictiveFormats = buildHumanMapAddictiveFormats(blueprint, preferredStyle)
  const understandingModes = buildHumanMapUnderstandingModes(blueprint, preferredStyle)
  const integrationGoals = buildHumanMapIntegrationGoals(blueprint)

  const resourceStyle: NormalizedBossProfile['operational']['resourceStyle'] =
    riskTolerance >= 70 || keywordScore(text, ['创业', '公司', '品牌', '规模', '产品']) >= 2
      ? 'investor-backed'
      : executionDiscipline >= 62
        ? 'bootstrapper'
        : 'balanced'

  const decisionSpeed: NormalizedBossProfile['operational']['decisionSpeed'] =
    preferredStyle === 'analytical'
      ? 'analytical'
      : riskTolerance >= 72 && getHumanMapSignalIntensity(blueprint, 'career_execution') >= 0.7
        ? 'impulsive'
        : 'deliberate'

  const baseProfile: Omit<NormalizedBossProfile, 'summary'> = {
    confidence: inferHumanMapConfidence(blueprint),
    dimensions: {
      cognition: {
        curiosity_breadth: curiosityBreadth,
        execution_discipline: executionDiscipline,
      },
      personality: {
        preferred_style: preferredStyle === 'analytical' ? 82 : preferredStyle === 'visionary' ? 76 : preferredStyle === 'pragmatic' ? 74 : 80,
        innovation_bias: innovationBias,
      },
      emotion: {
        sensitivity: emotionalSensitivity,
      },
      motivation: {
        long_term_drive: worldviewDrive,
        execution_drive: executionDiscipline,
      },
      social: {
        energy: socialEnergy,
      },
      aesthetic: {
        sensitivity: aestheticSensitivity,
      },
      worldview: {
        meaning_drive: worldviewDrive,
        risk_tolerance: riskTolerance,
      },
      strengths: {
        top: strengths,
        risks: watchouts,
      },
    },
    operational: {
      name: blueprint.displayName !== '你' ? blueprint.displayName : undefined,
      preferredStyle,
      riskTolerance,
      innovationBias,
      resourceStyle,
      decisionSpeed,
      excitementTriggers: unique([
        blueprint.currentFocus,
        ...blueprint.sourceDigest.filter(item => !/(坏循环|焦虑|误解|控制|拖延|失控)/.test(item)),
        ...blueprint.signalScores.slice(0, 2).map(signal => signal.label),
      ]).slice(0, 8),
      resonanceHooks: unique([
        blueprint.lifeStage,
        ...blueprint.sourceDigest,
        ...blueprint.dimensionPlans.slice(0, 2).map(plan => plan.reason),
      ]).slice(0, 8),
      explanationPreferences,
      addictiveFormats,
      understandingModes,
      antiPatterns: watchouts,
      integrationGoals,
      shortTermGoals: blueprint.currentFocus ? [blueprint.currentFocus] : [],
      longTermVision,
      currentFocus: blueprint.currentFocus,
      interests: unique([
        ...blueprint.signalScores.slice(0, 3).map(signal => signal.label),
        ...blueprint.recommendedDimensions.slice(0, 3).map(dimensionId => DIMENSION_MAP[dimensionId]?.name || dimensionId),
        ...blueprint.sourceDigest.slice(0, 2),
      ]).slice(0, 8),
      dislikes: watchouts,
    },
    recommendations: {
      recommendedAgents: buildHumanMapRecommendedAgents(blueprint, preferredStyle),
      recommendedResearchTopics: unique([
        blueprint.currentFocus,
        ...blueprint.signalScores.slice(0, 3).map(signal => signal.label),
        ...blueprint.dimensionPlans.slice(0, 2).map(plan => `${DIMENSION_MAP[plan.dimensionId]?.name || plan.dimensionId}强化`),
      ]).slice(0, 6),
      recommendedProjectDirections: unique([
        blueprint.currentFocus,
        longTermVision,
        ...integrationGoals,
      ]).slice(0, 4),
    },
  }

  const summary = buildProfilingSummary(baseProfile)
  const topSignals = blueprint.signalScores.slice(0, 3).map(signal => signal.label).join('、') || '基础信号'

  return {
    ...baseProfile,
    summary: {
      ...summary,
      narrative: [
        `当前处在「${blueprint.lifeStage}」阶段。`,
        summary.narrative,
        `前置建模显示，你的高频信号主要集中在 ${topSignals}。`,
      ].join(''),
      promptSummary: [
        summary.promptSummary,
        `阶段: ${blueprint.lifeStage}`,
        `前置信号: ${topSignals}`,
      ].join(' | '),
    },
  }
}

function buildResonanceHooks(input: QuickProfilingAnswers): string[] {
  const hooks = [...input.excitementTriggers]
  if (input.curiosityBreadth >= 65) hooks.push('跨学科连接')
  if (input.worldviewDrive >= 65) hooks.push('底层规律与长期叙事')
  if (input.aestheticSensitivity >= 65) hooks.push('审美张力与表达质感')
  if (input.executionDiscipline >= 65) hooks.push('可落地的推进节奏')
  return unique(hooks).slice(0, 8)
}

function buildUnderstandingModes(input: QuickProfilingAnswers): string[] {
  const modes = [...input.explanationPreferences]
  if (input.workStyle === 'analytical') modes.push('先框架后案例')
  if (input.workStyle === 'visionary') modes.push('先大图景后行动链')
  if (input.workStyle === 'pragmatic') modes.push('先优先级后执行')
  if (input.workStyle === 'creative') modes.push('先意象张力后结构')
  return unique(modes).slice(0, 8)
}

function buildAddictiveFormats(input: QuickProfilingAnswers): string[] {
  const formats: string[] = []
  if (input.workStyle === 'analytical') formats.push('结构图', '决策框架', '对照表')
  if (input.workStyle === 'visionary') formats.push('路线图', '长期叙事', '未来场景')
  if (input.workStyle === 'pragmatic') formats.push('行动清单', '优先级表', '实验设计')
  if (input.workStyle === 'creative') formats.push('灵感地图', '隐喻拆解', '风格谱系')
  if (input.aestheticSensitivity >= 70) formats.push('知识地图')
  return unique(formats).slice(0, 8)
}

function buildIntegrationGoals(input: QuickProfilingAnswers): string[] {
  const goals: string[] = []
  if (input.longTermVision) goals.push(input.longTermVision)
  if (input.currentFocus) goals.push(`当前阶段围绕 ${input.currentFocus} 建立可执行框架`)
  if (input.worldviewDrive >= 65) goals.push('形成稳定世界模型')
  if (input.executionDiscipline >= 65) goals.push('把洞见转成行动系统')
  return unique(goals).slice(0, 6)
}

function buildRecommendedAgents(input: QuickProfilingAnswers): string[] {
  const agents = ['general']
  if (input.workStyle === 'analytical') agents.push('technical', 'critic')
  if (input.workStyle === 'visionary') agents.push('strategy', 'market')
  if (input.workStyle === 'pragmatic') agents.push('technical', 'strategy')
  if (input.workStyle === 'creative') agents.push('creative', 'market')
  if (input.worldviewDrive >= 70) agents.push('strategy')
  return unique(agents)
}

function buildTopStrengths(input: QuickProfilingAnswers): string[] {
  const pairs: Array<[string, number]> = [
    ['探索广度', input.curiosityBreadth],
    ['执行纪律', input.executionDiscipline],
    ['愿景牵引', input.worldviewDrive],
    ['审美敏感', input.aestheticSensitivity],
    ['情绪感知', input.emotionalSensitivity],
    ['风险承受', input.riskTolerance],
  ]
  return pairs
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label]) => label)
}

function buildRisks(input: QuickProfilingAnswers): string[] {
  const risks: string[] = []
  if (input.executionDiscipline < 45) risks.push('灵感多但推进节奏容易松散')
  if (input.riskTolerance > 75 && input.executionDiscipline < 60) risks.push('容易过早扑向高风险方向')
  if (input.curiosityBreadth > 75 && input.currentFocus) risks.push('焦点容易被新线索打散')
  if (input.emotionalSensitivity > 75) risks.push('容易被情绪波动放大决策摩擦')
  if (risks.length === 0) risks.push('需要持续校准阶段焦点，避免能力分散')
  return risks.slice(0, 3)
}

export function normalizeProfilingResult(input: ExternalProfilingResult): NormalizedBossProfile {
  if (isHumanMapBlueprint(input.raw)) {
    return normalizeHumanMapProfilingResult(input.raw)
  }

  const raw = parseRaw(input.raw)
  const topStrengths = buildTopStrengths(raw)
  const risks = buildRisks(raw)

  const resourceStyle: NormalizedBossProfile['operational']['resourceStyle'] =
    raw.riskTolerance >= 72
      ? 'investor-backed'
      : raw.executionDiscipline >= 65
        ? 'bootstrapper'
        : 'balanced'

  const decisionSpeed: NormalizedBossProfile['operational']['decisionSpeed'] =
    raw.workStyle === 'analytical'
      ? 'analytical'
      : raw.riskTolerance >= 78
        ? 'impulsive'
        : 'deliberate'

  const baseProfile: Omit<NormalizedBossProfile, 'summary'> = {
    confidence: 0.78,
    dimensions: {
      cognition: {
        curiosity_breadth: raw.curiosityBreadth,
        execution_discipline: raw.executionDiscipline,
      },
      personality: {
        preferred_style: raw.workStyle === 'analytical' ? 82 : raw.workStyle === 'visionary' ? 76 : raw.workStyle === 'pragmatic' ? 74 : 78,
        innovation_bias: raw.innovationBias,
      },
      emotion: {
        sensitivity: raw.emotionalSensitivity,
      },
      motivation: {
        long_term_drive: raw.worldviewDrive,
        execution_drive: raw.executionDiscipline,
      },
      social: {
        energy: raw.socialEnergy,
      },
      aesthetic: {
        sensitivity: raw.aestheticSensitivity,
      },
      worldview: {
        meaning_drive: raw.worldviewDrive,
        risk_tolerance: raw.riskTolerance,
      },
      strengths: {
        top: topStrengths,
        risks,
      },
    },
    operational: {
      name: raw.name || undefined,
      preferredStyle: raw.workStyle,
      riskTolerance: raw.riskTolerance,
      innovationBias: raw.innovationBias,
      resourceStyle,
      decisionSpeed,
      excitementTriggers: raw.excitementTriggers.slice(0, 8),
      resonanceHooks: buildResonanceHooks(raw),
      explanationPreferences: unique(raw.explanationPreferences).slice(0, 8),
      addictiveFormats: buildAddictiveFormats(raw),
      understandingModes: buildUnderstandingModes(raw),
      antiPatterns: unique(raw.antiPatterns).slice(0, 8),
      integrationGoals: buildIntegrationGoals(raw),
      shortTermGoals: raw.currentFocus ? [raw.currentFocus] : [],
      longTermVision: raw.longTermVision,
      currentFocus: raw.currentFocus,
      interests: raw.interests,
      dislikes: raw.dislikes,
    },
    recommendations: {
      recommendedAgents: buildRecommendedAgents(raw),
      recommendedResearchTopics: unique([
        raw.currentFocus,
        ...raw.interests.slice(0, 3),
        raw.worldviewDrive >= 65 ? '长期系统设计' : '',
        raw.aestheticSensitivity >= 65 ? '审美与表达升级' : '',
      ]).slice(0, 5),
      recommendedProjectDirections: unique([
        raw.longTermVision,
        raw.currentFocus,
        raw.innovationBias >= 65 ? '新范式实验项目' : '已有项目的结构化升级',
      ]).slice(0, 4),
    },
  }

  return {
    ...baseProfile,
    summary: buildProfilingSummary(baseProfile),
  }
}
