import {
  dbGetBossAssessmentRun,
  dbGetLatestBossAssessmentRun,
  dbListBossAssessmentRuns,
  dbSaveBossAssessmentRun,
} from '../../db/repository'
import {
  buildHumanMapProfilingResult,
  buildQuickProfilingResult,
  normalizeProfilingResult,
} from './adapter'
import {
  applyNormalizedBossProfile,
  compareNormalizedToCurrent,
} from './effects'
import type {
  BossAssessmentRun,
  ExternalProfilingResult,
  NormalizedBossProfile,
  QuickProfilingAnswers,
} from './types'
import type { HumanMapBlueprint } from '../../../features/profiling-studio/types'
export { importOpenBasakaExportBundle, normalizeOpenBasakaExportBundle } from './openbasaka-bundle'

function parseRunRow(row: Awaited<ReturnType<typeof dbGetBossAssessmentRun>>): BossAssessmentRun | null {
  if (!row) return null
  try {
    return {
      id: row.id,
      mode: row.mode,
      confidence: row.confidence,
      createdAt: row.created_at,
      normalized: JSON.parse(row.normalized_result_json) as NormalizedBossProfile,
    }
  } catch {
    return null
  }
}

export async function saveAssessmentRun(
  input: ExternalProfilingResult
): Promise<{ runId: string; normalized: NormalizedBossProfile }> {
  const normalized = normalizeProfilingResult(input)
  const runId = await dbSaveBossAssessmentRun({
    source: input.source,
    profileVersion: input.profileVersion,
    mode: input.mode,
    status: 'completed',
    title: normalized.summary.headline,
    rawResult: input.raw,
    normalizedResult: normalized,
    summary: normalized.summary,
    confidence: normalized.confidence,
  })
  return { runId, normalized }
}

export async function applyAssessmentRun(runId: string): Promise<{ changedKeys: string[]; summary: string } | null> {
  const row = await dbGetBossAssessmentRun(runId)
  if (!row) return null
  try {
    const normalized = JSON.parse(row.normalized_result_json) as NormalizedBossProfile
    return applyNormalizedBossProfile(runId, normalized)
  } catch {
    return null
  }
}

export async function runQuickProfiling(
  input: QuickProfilingAnswers
): Promise<{ runId: string; normalized: NormalizedBossProfile; changedKeys: string[]; summary: string }> {
  const external = buildQuickProfilingResult(input)
  const { runId, normalized } = await saveAssessmentRun(external)
  const applyResult = await applyNormalizedBossProfile(runId, normalized)
  return {
    runId,
    normalized,
    changedKeys: applyResult.changedKeys,
    summary: applyResult.summary,
  }
}

export async function runHumanMapProfiling(
  blueprint: HumanMapBlueprint
): Promise<{ runId: string; normalized: NormalizedBossProfile; changedKeys: string[]; summary: string }> {
  const external = buildHumanMapProfilingResult(blueprint)
  const { runId, normalized } = await saveAssessmentRun(external)
  const applyResult = await applyNormalizedBossProfile(runId, normalized)
  return {
    runId,
    normalized,
    changedKeys: applyResult.changedKeys,
    summary: applyResult.summary,
  }
}

export async function getLatestAssessmentRun(): Promise<BossAssessmentRun | null> {
  const row = await dbGetLatestBossAssessmentRun()
  return parseRunRow(row)
}

export async function getAssessmentTimeline(): Promise<Array<{
  id: string
  mode: 'quick' | 'deep' | 'dialogue'
  createdAt: string
  confidence: number
}>> {
  const rows = await dbListBossAssessmentRuns(12)
  return rows.map(row => ({
    id: row.id,
    mode: row.mode,
    createdAt: row.created_at,
    confidence: row.confidence,
  }))
}

export async function getAssessmentRuns(limit = 8): Promise<BossAssessmentRun[]> {
  const rows = await dbListBossAssessmentRuns(limit)
  return rows
    .map(row => parseRunRow(row))
    .filter((row): row is BossAssessmentRun => Boolean(row))
}

export async function diffAgainstCurrentProfile(runId: string): Promise<{
  changedKeys: string[]
  summary: string
} | null> {
  const row = await dbGetBossAssessmentRun(runId)
  if (!row) return null
  try {
    const normalized = JSON.parse(row.normalized_result_json) as NormalizedBossProfile
    const diff = compareNormalizedToCurrent(normalized)
    return {
      changedKeys: diff.changedKeys,
      summary: normalized.summary.narrative,
    }
  } catch {
    return null
  }
}
