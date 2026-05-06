import { dbSaveBossProfileSnapshot, dbSaveMemory, run } from '../../db/repository'
import { getBossProfile, setBossProfile } from '../../db/store'
import { generateId } from '../../db/schema'
import type { NormalizedBossProfile } from './types'
import { buildSelfAgentConstitution } from './self-agent'
import { saveAnchor } from '../anchor'
import { recordBossCognitionImpact } from '../cognition-impact'
import { memorize } from '../../memory/mempalace'

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

function buildProfilingDrawerContent(runId: string, normalized: NormalizedBossProfile): string {
  const constitution = normalized.selfAgentConstitution
  return [
    `# ${normalized.summary.headline}`,
    '',
    normalized.summary.narrative,
    '',
    `## Prompt Summary`,
    normalized.summary.promptSummary,
    '',
    `## Evidence Trace`,
    ...(normalized.evidenceTrace || []).slice(0, 10).map(trace => `- ${trace.source} / ${trace.reference}: ${trace.insight} (${Math.round(trace.confidence * 100)}%)`),
    '',
    `## Pending Verification`,
    ...((normalized.pendingVerification || []).map(item => `- ${item}`)),
    '',
    constitution ? `## Self Agent Constitution\n${JSON.stringify(constitution, null, 2)}` : '',
    '',
    `source: profiling:${runId}`,
  ].filter(Boolean).join('\n')
}

async function writeProfilingDrawerFallback(
  runId: string,
  normalized: NormalizedBossProfile,
  content: string,
): Promise<void> {
  const now = new Date().toISOString()
  await run(
    `INSERT OR REPLACE INTO mempalace_drawers
     (id, title, wing, hall, room, raw_content, source_type, source_url, file_path, folder_path,
      author, language, tags, is_compiled, compiled_page_id, metadata_json, created_at, updated_at)
     VALUES (?, ?, 'profiling', 'self-modeling', 'report', ?, 'auto', '', '', 'profiling/self-modeling',
      '', 'zh', ?, 0, '', ?, ?, ?)`,
    [
      `profiling_${runId || generateId()}`,
      `画像写回：${normalized.summary.headline}`,
      content,
      JSON.stringify(['self-modeling', 'boss-profile', 'self-agent', 'evidence-ledger']),
      JSON.stringify({
        source: 'multi_dimension_profiling',
        runId,
        headline: normalized.summary.headline,
        confidence: normalized.confidence,
        kind: 'profiling_writeback',
      }),
      now,
      now,
    ],
  )
}

export async function applyNormalizedBossProfile(
  runId: string,
  normalized: NormalizedBossProfile,
): Promise<{ changedKeys: string[]; summary: string }> {
  const current = getBossProfile()
  const selfAgentConstitution = normalized.selfAgentConstitution || buildSelfAgentConstitution(normalized, runId)
  const enrichedNormalized: NormalizedBossProfile = {
    ...normalized,
    selfAgentConstitution,
  }
  const nextProfile: Record<string, string> = {
    ...current,
    ...(enrichedNormalized.operational.name ? { name: enrichedNormalized.operational.name } : {}),
    interests: enrichedNormalized.operational.interests.join(','),
    hates: enrichedNormalized.operational.dislikes.join(','),
    preferredStyle: enrichedNormalized.operational.preferredStyle,
    riskTolerance: String(enrichedNormalized.operational.riskTolerance),
    innovationBias: String(enrichedNormalized.operational.innovationBias),
    resourceStyle: enrichedNormalized.operational.resourceStyle,
    decisionSpeed: enrichedNormalized.operational.decisionSpeed,
    long_term_vision: enrichedNormalized.operational.longTermVision,
    current_focus: enrichedNormalized.operational.currentFocus,
    cognitive_profile_json: JSON.stringify(buildCognitiveProfile(enrichedNormalized)),
    profiling_last_run_id: runId,
    profiling_summary_json: JSON.stringify(enrichedNormalized.summary),
    profiling_evidence_trace_json: JSON.stringify(enrichedNormalized.evidenceTrace || []),
    profiling_pending_verification_json: JSON.stringify(enrichedNormalized.pendingVerification || []),
    profiling_measurement_notes_json: JSON.stringify(enrichedNormalized.measurementNotes || []),
    self_agent_constitution_json: JSON.stringify(selfAgentConstitution),
    agent_delegation_policy_json: JSON.stringify({
      delegableTasks: selfAgentConstitution.delegableTasks,
      mustAskUserTasks: selfAgentConstitution.mustAskUserTasks,
      forbiddenZones: selfAgentConstitution.forbiddenZones,
      authorizationBoundaries: selfAgentConstitution.authorizationBoundaries,
    }),
    profile_version: 'v1',
    profile_source: 'multi_dimension_profiling',
    value_weights_json: JSON.stringify({
      innovation_bias: enrichedNormalized.operational.innovationBias,
      risk_tolerance: enrichedNormalized.operational.riskTolerance,
      worldview_drive: enrichedNormalized.dimensions.worldview.meaning_drive,
    }),
    strength_profile_json: JSON.stringify(enrichedNormalized.dimensions.strengths),
    emotion_profile_json: JSON.stringify(enrichedNormalized.dimensions.emotion),
    social_profile_json: JSON.stringify(enrichedNormalized.dimensions.social),
    aesthetic_profile_json: JSON.stringify(enrichedNormalized.dimensions.aesthetic),
    worldview_profile_json: JSON.stringify(enrichedNormalized.dimensions.worldview),
    motivation_profile_json: JSON.stringify(enrichedNormalized.dimensions.motivation),
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
    'profiling_evidence_trace_json',
    'self_agent_constitution_json',
    'agent_delegation_policy_json',
  ]
  const changedKeys = watchedKeys.filter((key) => (current[key] || '') !== (nextProfile[key] || ''))

  setBossProfile(nextProfile)

  await dbSaveBossProfileSnapshot({
    runId,
    profile: nextProfile,
    diff: {
      changedKeys,
      previous: Object.fromEntries(changedKeys.map((key) => [key, current[key] || ''])),
      next: Object.fromEntries(changedKeys.map((key) => [key, nextProfile[key] || ''])),
    },
    source: 'profiling_apply',
  })

  const memoryWrites = [
    dbSaveMemory(
      'pattern',
      `画像更新：当前更偏向 ${normalized.summary.headline} 的工作与理解方式`,
      `profiling:${runId}`,
      normalized.confidence,
    ),
    normalized.operational.longTermVision
      ? dbSaveMemory(
          'goal',
          `长期:${normalized.operational.longTermVision}`,
          `profiling:${runId}`,
          normalized.confidence,
        )
      : Promise.resolve(''),
    normalized.operational.currentFocus
      ? dbSaveMemory('goal', `短期:${normalized.operational.currentFocus}`, `profiling:${runId}`, normalized.confidence)
      : Promise.resolve(''),
    normalized.operational.explanationPreferences.length > 0
      ? dbSaveMemory(
          'preference',
          `偏好讲解方式: ${normalized.operational.explanationPreferences.join('、')}`,
          `profiling:${runId}`,
          normalized.confidence,
        )
      : Promise.resolve(''),
    normalized.operational.antiPatterns.length > 0
      ? dbSaveMemory(
          'correction',
          `应避免的表达: ${normalized.operational.antiPatterns.join('、')}`,
          `profiling:${runId}`,
          normalized.confidence * 0.9,
        )
      : Promise.resolve(''),
    dbSaveMemory(
      'pattern',
      `未来代理人宪法:${selfAgentConstitution.cognitiveOperatingManual.slice(0, 3).join('；')}`,
      `profiling:${runId}:self-agent`,
      normalized.confidence,
    ),
  ]

  await Promise.all(memoryWrites)
  const profilingDrawerContent = buildProfilingDrawerContent(runId, enrichedNormalized)
  try {
    await memorize({
      title: `画像写回：${normalized.summary.headline}`,
      content: profilingDrawerContent,
      wing: 'profiling',
      hall: 'self-modeling',
      room: 'report',
      source: 'auto',
      metadata: {
        source: 'multi_dimension_profiling',
        sourceId: `profiling:${runId}`,
        runId,
        headline: normalized.summary.headline,
        confidence: normalized.confidence,
        kind: 'profiling_writeback',
        folderPath: 'profiling/self-modeling',
      },
      tags: ['self-modeling', 'boss-profile', 'self-agent', 'evidence-ledger'],
    })
  } catch (error) {
    try {
      await writeProfilingDrawerFallback(runId, enrichedNormalized, profilingDrawerContent)
    } catch (fallbackError) {
      console.warn('[profiling] failed to write MemPalace profiling drawer', error, fallbackError)
    }
  }
  if (changedKeys.some((key) => key === 'cognitive_profile_json' || key === 'profiling_summary_json')) {
    await recordBossCognitionImpact({
      runId,
      changedKeys,
      source: 'profiling_apply',
      confidence: normalized.confidence,
    })
  }
  void saveAnchor()

  return {
    changedKeys,
    summary: enrichedNormalized.summary.narrative,
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
    ['self_agent_constitution_json', stableStringify(normalized.selfAgentConstitution || buildSelfAgentConstitution(normalized))],
  ]
  return {
    changedKeys: comparisons.filter(([key, next]) => (current[key] || '') !== next).map(([key]) => key),
  }
}
