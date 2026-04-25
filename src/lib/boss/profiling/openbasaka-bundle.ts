import type { OpenBasakaExportBundle } from '../../../features/profiling-studio/utils/openbasaka-export'
import { dbSaveBossAssessmentRun } from '../../db/repository'
import { applyNormalizedBossProfile } from './effects'
import { buildProfilingSummary } from './summary'
import type { NormalizedBossProfile } from './types'

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function unique(values: Array<string | undefined | null>, limit = 12): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const cleaned = (value || '').trim()
    if (!cleaned || seen.has(cleaned)) continue
    seen.add(cleaned)
    result.push(cleaned)
    if (result.length >= limit) break
  }
  return result
}

function mapStyleSignal(style: NormalizedBossProfile['operational']['preferredStyle']): number {
  switch (style) {
    case 'analytical':
      return 82
    case 'visionary':
      return 78
    case 'pragmatic':
      return 74
    case 'creative':
      return 80
  }
}

function inferStrengths(profile: OpenBasakaExportBundle): string[] {
  const core = profile.openbasakaBundle.bossCore
  const pairs: Array<[string, number]> = [
    ['探索广度', core.curiosityBreadth],
    ['执行纪律', core.executionDiscipline],
    ['愿景牵引', core.worldviewDrive],
    ['审美敏感', core.aestheticSensitivity],
    ['情绪感知', core.emotionalSensitivity],
    ['风险承受', core.riskTolerance],
    ['创新偏好', core.innovationBias],
    ['社交能量', core.socialEnergy],
  ]

  const evidenceStrengths = profile.openbasakaBundle.bossCore.evidenceTrace
    .filter(item => item.source === 'topology' || item.source === 'dialogue' || item.source === 'product' || item.source === 'human_map' || item.source === 'question_trace')
    .slice(0, 2)
    .map(item => item.insight)

  return unique([
    ...pairs.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label]) => label),
    ...evidenceStrengths,
  ], 4)
}

function inferWatchouts(profile: OpenBasakaExportBundle): string[] {
  const core = profile.openbasakaBundle.bossCore
  const watchouts = [...core.antiPatterns]
  if (core.executionDiscipline < 45) watchouts.push('灵感强但推进节奏容易变松')
  if (core.curiosityBreadth > 75 && core.currentFocus) watchouts.push('新线索太多时容易打散阶段焦点')
  if (core.riskTolerance > 75 && core.executionDiscipline < 60) watchouts.push('高风险判断需要更强验证闭环')
  if (core.emotionalSensitivity > 75) watchouts.push('高敏感状态下要避免被局部波动牵引')
  return unique(watchouts, 4)
}

function inferInterests(profile: OpenBasakaExportBundle): string[] {
  const core = profile.openbasakaBundle.bossCore
  return unique([
    ...core.recommendedResearchTopics,
    ...core.excitementTriggers,
    ...core.integrationGoals,
  ], 8)
}

function inferConfidence(profile: OpenBasakaExportBundle): number {
  const confidenceMap = Object.values(profile.fusedProfileBundle.topology.confidenceMap || {})
  const humanMap = profile.rawSignalBundle.humanMapBlueprint
  if (confidenceMap.length === 0) {
    if (!humanMap) return 0.82
    const base = humanMap.mode === 'detailed' ? 0.8 : 0.75
    return Math.max(0.62, Math.min(0.92, Number((base + Math.min(humanMap.answerCount, 12) * 0.004).toFixed(2))))
  }
  const average = confidenceMap.reduce((sum, value) => sum + value, 0) / confidenceMap.length
  const modeBoost = humanMap?.mode === 'detailed' ? 0.03 : humanMap ? 0.015 : 0
  const answerBoost = humanMap ? Math.min(humanMap.answerCount, 12) * 0.003 : 0
  return Math.max(0.58, Math.min(0.96, Number((average + modeBoost + answerBoost).toFixed(2))))
}

export function normalizeOpenBasakaExportBundle(
  bundle: OpenBasakaExportBundle
): NormalizedBossProfile {
  const core = bundle.openbasakaBundle.bossCore
  const strengths = inferStrengths(bundle)
  const watchouts = inferWatchouts(bundle)

  const baseProfile: Omit<NormalizedBossProfile, 'summary'> = {
    confidence: inferConfidence(bundle),
    dimensions: {
      cognition: {
        curiosity_breadth: core.curiosityBreadth,
        execution_discipline: core.executionDiscipline,
      },
      personality: {
        preferred_style: mapStyleSignal(core.preferredStyle),
        innovation_bias: core.innovationBias,
      },
      emotion: {
        sensitivity: core.emotionalSensitivity,
      },
      motivation: {
        long_term_drive: core.worldviewDrive,
        execution_drive: core.executionDiscipline,
      },
      social: {
        energy: core.socialEnergy,
      },
      aesthetic: {
        sensitivity: core.aestheticSensitivity,
      },
      worldview: {
        meaning_drive: core.worldviewDrive,
        risk_tolerance: core.riskTolerance,
      },
      strengths: {
        top: strengths,
        risks: watchouts,
      },
    },
    operational: {
      name: bundle.rawSignalBundle.humanMapBlueprint?.displayName !== '你'
        ? bundle.rawSignalBundle.humanMapBlueprint?.displayName
        : undefined,
      preferredStyle: core.preferredStyle,
      riskTolerance: clamp(core.riskTolerance),
      innovationBias: clamp(core.innovationBias),
      resourceStyle: core.resourceStyle,
      decisionSpeed: core.decisionSpeed,
      excitementTriggers: core.excitementTriggers,
      resonanceHooks: unique([
        ...core.excitementTriggers,
        ...core.evidenceTrace.map(item => item.reference),
      ], 8),
      explanationPreferences: core.explanationPreferences,
      addictiveFormats: unique([
        ...bundle.fusedProfileBundle.productConcepts.map(concept => concept.productType),
        ...bundle.fusedProfileBundle.productConcepts.flatMap(concept => concept.aestheticSpec.keywords),
      ], 8),
      understandingModes: unique([
        ...core.explanationPreferences,
        core.preferredStyle === 'analytical' ? '先框架后案例' : '',
        core.preferredStyle === 'visionary' ? '先愿景再拆路径' : '',
        core.preferredStyle === 'pragmatic' ? '先结论后步骤' : '',
        core.preferredStyle === 'creative' ? '先意象再结构' : '',
      ], 8),
      antiPatterns: core.antiPatterns,
      integrationGoals: core.integrationGoals,
      shortTermGoals: core.currentFocus ? [core.currentFocus] : [],
      longTermVision: core.longTermVision,
      currentFocus: core.currentFocus,
      interests: inferInterests(bundle),
      dislikes: unique(core.antiPatterns, 6),
    },
    recommendations: {
      recommendedAgents: core.recommendedAgents,
      recommendedResearchTopics: core.recommendedResearchTopics,
      recommendedProjectDirections: unique([
        core.currentFocus,
        core.longTermVision,
        ...core.integrationGoals,
      ], 4),
    },
  }

  const summary = buildProfilingSummary(baseProfile)
  const aiSummary = bundle.fusedProfileBundle.aiSummary.trim()

  return {
    ...baseProfile,
    summary: {
      ...summary,
      headline: core.headline || summary.headline,
      narrative: aiSummary || core.promptSummary || summary.narrative,
      promptSummary: core.promptSummary || summary.promptSummary,
    },
  }
}

export async function importOpenBasakaExportBundle(
  bundle: OpenBasakaExportBundle
): Promise<{ runId: string; normalized: NormalizedBossProfile; changedKeys: string[]; summary: string }> {
  const normalized = normalizeOpenBasakaExportBundle(bundle)
  const runId = await dbSaveBossAssessmentRun({
    source: 'multi_dimension_profiling',
    profileVersion: bundle.schemaVersion,
    mode: 'deep',
    status: 'completed',
    title: normalized.summary.headline,
    rawResult: bundle,
    normalizedResult: normalized,
    summary: normalized.summary,
    confidence: normalized.confidence,
  })
  const applyResult = await applyNormalizedBossProfile(runId, normalized)
  return {
    runId,
    normalized,
    changedKeys: applyResult.changedKeys,
    summary: applyResult.summary,
  }
}
