import { dbSaveBossProfileSnapshot, dbSaveMemory } from '../../db/repository'
import { getBossProfile, setBossProfile } from '../../db/store'
import type { NormalizedBossProfile } from './types'
import { saveAnchor } from '../anchor'

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function buildCognitiveProfile(normalized: NormalizedBossProfile) {
  return {
    mission: normalized.operational.longTermVision || normalized.summary.headline,
    excitementTriggers: normalized.operational.excitementTriggers,
    resonanceHooks: normalized.operational.resonanceHooks,
    explanationPreferences: normalized.operational.explanationPreferences,
    addictiveFormats: normalized.operational.addictiveFormats,
    understandingModes: normalized.operational.understandingModes,
    antiPatterns: normalized.operational.antiPatterns,
    integrationGoals: normalized.operational.integrationGoals,
  }
}

export async function applyNormalizedBossProfile(
  runId: string,
  normalized: NormalizedBossProfile
): Promise<{ changedKeys: string[]; summary: string }> {
  const current = getBossProfile()
  const nextProfile: Record<string, string> = {
    ...current,
    ...(normalized.operational.name ? { name: normalized.operational.name } : {}),
    interests: normalized.operational.interests.join(','),
    hates: normalized.operational.dislikes.join(','),
    preferredStyle: normalized.operational.preferredStyle,
    riskTolerance: String(normalized.operational.riskTolerance),
    innovationBias: String(normalized.operational.innovationBias),
    resourceStyle: normalized.operational.resourceStyle,
    decisionSpeed: normalized.operational.decisionSpeed,
    long_term_vision: normalized.operational.longTermVision,
    current_focus: normalized.operational.currentFocus,
    cognitive_profile_json: JSON.stringify(buildCognitiveProfile(normalized)),
    profiling_last_run_id: runId,
    profiling_summary_json: JSON.stringify(normalized.summary),
    profile_version: 'v1',
    profile_source: 'multi_dimension_profiling',
    value_weights_json: JSON.stringify({
      innovation_bias: normalized.operational.innovationBias,
      risk_tolerance: normalized.operational.riskTolerance,
      worldview_drive: normalized.dimensions.worldview.meaning_drive,
    }),
    strength_profile_json: JSON.stringify(normalized.dimensions.strengths),
    emotion_profile_json: JSON.stringify(normalized.dimensions.emotion),
    social_profile_json: JSON.stringify(normalized.dimensions.social),
    aesthetic_profile_json: JSON.stringify(normalized.dimensions.aesthetic),
    worldview_profile_json: JSON.stringify(normalized.dimensions.worldview),
    motivation_profile_json: JSON.stringify(normalized.dimensions.motivation),
  }

  const watchedKeys: string[] = [
    'name',
    'interests',
    'hates',
    'preferredStyle',
    'riskTolerance',
    'innovationBias',
    'resourceStyle',
    'decisionSpeed',
    'long_term_vision',
    'current_focus',
    'cognitive_profile_json',
    'profiling_summary_json',
  ]
  const changedKeys = watchedKeys.filter(key => (current[key] || '') !== (nextProfile[key] || ''))

  setBossProfile(nextProfile)

  await dbSaveBossProfileSnapshot({
    runId,
    profile: nextProfile,
    diff: {
      changedKeys,
      previous: Object.fromEntries(changedKeys.map(key => [key, current[key] || ''])),
      next: Object.fromEntries(changedKeys.map(key => [key, nextProfile[key] || ''])),
    },
    source: 'profiling_apply',
  })

  const memoryWrites = [
    dbSaveMemory(
      'pattern',
      `画像更新：当前更偏向 ${normalized.summary.headline} 的工作与理解方式`,
      `profiling:${runId}`,
      normalized.confidence
    ),
    normalized.operational.longTermVision
      ? dbSaveMemory('goal', `长期:${normalized.operational.longTermVision}`, `profiling:${runId}`, normalized.confidence)
      : Promise.resolve(''),
    normalized.operational.currentFocus
      ? dbSaveMemory('goal', `短期:${normalized.operational.currentFocus}`, `profiling:${runId}`, normalized.confidence)
      : Promise.resolve(''),
    normalized.operational.explanationPreferences.length > 0
      ? dbSaveMemory(
          'preference',
          `偏好讲解方式: ${normalized.operational.explanationPreferences.join('、')}`,
          `profiling:${runId}`,
          normalized.confidence
        )
      : Promise.resolve(''),
    normalized.operational.antiPatterns.length > 0
      ? dbSaveMemory(
          'correction',
          `应避免的表达: ${normalized.operational.antiPatterns.join('、')}`,
          `profiling:${runId}`,
          normalized.confidence * 0.9
        )
      : Promise.resolve(''),
  ]

  await Promise.all(memoryWrites)
  void saveAnchor()

  return {
    changedKeys,
    summary: normalized.summary.narrative,
  }
}

export function compareNormalizedToCurrent(normalized: NormalizedBossProfile): { changedKeys: string[] } {
  const current = getBossProfile()
  const comparisons: Array<[string, string]> = [
    ['interests', normalized.operational.interests.join(',')],
    ['hates', normalized.operational.dislikes.join(',')],
    ['preferredStyle', normalized.operational.preferredStyle],
    ['riskTolerance', String(normalized.operational.riskTolerance)],
    ['innovationBias', String(normalized.operational.innovationBias)],
    ['long_term_vision', normalized.operational.longTermVision],
    ['current_focus', normalized.operational.currentFocus],
    ['cognitive_profile_json', stableStringify(buildCognitiveProfile(normalized))],
  ]
  return {
    changedKeys: comparisons.filter(([key, next]) => (current[key] || '') !== next).map(([key]) => key),
  }
}
