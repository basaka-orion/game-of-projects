import type { CouncilNuwaEvidenceRegistry } from './distillation-evidence'
import type { CouncilExcellenceAudit } from './excellence-audit'
import type { CouncilRuntimeEvidenceLedger } from './runtime-evidence'
import type { CouncilSelection } from './selector'

export interface CouncilRuntimeHistoryRecord {
  id: string
  runId: string
  savedAt: string
  problemPreview: string
  teamSummary: string[]
  decisionSource: CouncilRuntimeEvidenceLedger['decisionSource']
  deepRunStatus: CouncilRuntimeEvidenceLedger['deepRunCertification']['status']
  deepRunLabel: string
  durationMs: number
  qualityScore: number
  qualityStatus: string
  excellenceScore?: number
  nuwaLocalReady?: string
  proofSummary: string
  blockers: string[]
  ledger: CouncilRuntimeEvidenceLedger
}

export interface CouncilRuntimeHistoryStats {
  totalRuns: number
  provedDeepRuns: number
  partialDeepRuns: number
  fallbackRuns: number
  bestQualityScore: number
  latestRunAt?: string
}

export interface CouncilRuntimeHistoryLedger {
  records: CouncilRuntimeHistoryRecord[]
  stats: CouncilRuntimeHistoryStats
}

interface SaveCouncilRuntimeHistoryInput {
  problem: string
  selection: CouncilSelection
  runtimeEvidence: CouncilRuntimeEvidenceLedger
  excellenceAudit?: CouncilExcellenceAudit
  nuwaEvidenceRegistry?: CouncilNuwaEvidenceRegistry
  savedAt?: string
}

const STORAGE_KEY = 'openbasaka.xiaobai.runtimeHistory.v1'
const MAX_RECORDS = 12

function compact(value: string, max = 120): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

export function normalizeCouncilRuntimeHistoryProof(value: string): string {
  if (!/(小白.*验证|真实小白用户验证)/.test(value)) return value
  return value
    .replace(
      /仍需要\s*3\s*人完成一次从输入、阅读、导出到复盘的闭环。?/g,
      '仍需要 5-8 人稳审，至少 5 人完成记录且 4 人完成从输入、阅读、导出到复盘的闭环。',
    )
    .replace(
      /仍需要\s*3\s*人完成一次[^。]*闭环。?/g,
      '仍需要 5-8 人稳审，至少 5 人完成记录且 4 人完成一次闭环。',
    )
    .replace(/真实小白用户验证仍缺\s*3\s*人。?/g, '真实小白用户验证仍缺 5-8 人稳审。')
    .replace(/3\s*人真实小白用户验证/g, '5-8 人稳审真实小白用户验证')
    .replace(/3\s*个真实小白用户/g, '5-8 人稳审真实小白用户')
    .replace(/3\s*人小白验证/g, '5-8 人小白稳审验证')
    .replace(/2\/3/g, '4/5')
}

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

function parseRecords(raw: string | null): CouncilRuntimeHistoryRecord[] {
  if (!raw) return []
  try {
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data.filter(isHistoryRecord).map(normalizeHistoryRecord) : []
  } catch {
    return []
  }
}

function normalizeHistoryRecord(record: CouncilRuntimeHistoryRecord): CouncilRuntimeHistoryRecord {
  return {
    ...record,
    blockers: record.blockers.map(normalizeCouncilRuntimeHistoryProof),
    ledger: {
      ...record.ledger,
      nextProofNeeded: (record.ledger.nextProofNeeded || []).map(normalizeCouncilRuntimeHistoryProof),
      deepRunCertification: {
        ...record.ledger.deepRunCertification,
        blockers: (record.ledger.deepRunCertification.blockers || []).map(normalizeCouncilRuntimeHistoryProof),
      },
    },
  }
}

function isHistoryRecord(value: unknown): value is CouncilRuntimeHistoryRecord {
  if (!value || typeof value !== 'object') return false
  const item = value as CouncilRuntimeHistoryRecord
  return Boolean(item.runId && item.savedAt && item.ledger?.runId)
}

function stats(records: CouncilRuntimeHistoryRecord[]): CouncilRuntimeHistoryStats {
  return {
    totalRuns: records.length,
    provedDeepRuns: records.filter((record) => record.deepRunStatus === 'proved').length,
    partialDeepRuns: records.filter((record) => record.deepRunStatus === 'partial').length,
    fallbackRuns: records.filter((record) => record.decisionSource === 'local-fallback').length,
    bestQualityScore: records.reduce((best, record) => Math.max(best, record.qualityScore), 0),
    latestRunAt: records[0]?.savedAt,
  }
}

function writeRecords(records: CouncilRuntimeHistoryRecord[]): void {
  if (!canUseLocalStorage()) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

export function loadCouncilRuntimeHistory(): CouncilRuntimeHistoryLedger {
  const records = canUseLocalStorage() ? parseRecords(localStorage.getItem(STORAGE_KEY)) : []
  return {
    records,
    stats: stats(records),
  }
}

export function clearCouncilRuntimeHistory(): CouncilRuntimeHistoryLedger {
  if (canUseLocalStorage()) localStorage.removeItem(STORAGE_KEY)
  return { records: [], stats: stats([]) }
}

export function saveCouncilRuntimeHistoryRecord(input: SaveCouncilRuntimeHistoryInput): CouncilRuntimeHistoryLedger {
  const current = loadCouncilRuntimeHistory().records.filter((record) => record.runId !== input.runtimeEvidence.runId)
  const savedAt = input.savedAt || new Date().toISOString()
  const record: CouncilRuntimeHistoryRecord = {
    id: `runtime-history-${input.runtimeEvidence.runId}`,
    runId: input.runtimeEvidence.runId,
    savedAt,
    problemPreview: compact(input.problem, 180),
    teamSummary: input.selection.seats.map((seat) => `${seat.persona.shortName}｜${seat.seat.label}`).slice(0, 7),
    decisionSource: input.runtimeEvidence.decisionSource,
    deepRunStatus: input.runtimeEvidence.deepRunCertification.status,
    deepRunLabel: input.runtimeEvidence.deepRunCertification.label,
    durationMs: input.runtimeEvidence.durationMs,
    qualityScore: input.runtimeEvidence.qualityScore,
    qualityStatus: input.runtimeEvidence.qualityStatus,
    excellenceScore: input.excellenceAudit?.score,
    nuwaLocalReady: input.nuwaEvidenceRegistry
      ? `${input.nuwaEvidenceRegistry.localReadyCount}/${input.nuwaEvidenceRegistry.personaCount}`
      : undefined,
    proofSummary: input.runtimeEvidence.deepRunCertification.proofSummary,
    blockers: [
      ...input.runtimeEvidence.deepRunCertification.blockers,
      ...input.runtimeEvidence.nextProofNeeded,
    ].map(normalizeCouncilRuntimeHistoryProof).slice(0, 8),
    ledger: input.runtimeEvidence,
  }
  const records = [record, ...current]
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .slice(0, MAX_RECORDS)
  writeRecords(records)
  return { records, stats: stats(records) }
}

export function renderCouncilRuntimeHistoryMarkdown(history: CouncilRuntimeHistoryLedger): string {
  return [
    '## 真实长跑历史',
    '',
    `- totalRuns: ${history.stats.totalRuns}`,
    `- provedDeepRuns: ${history.stats.provedDeepRuns}`,
    `- partialDeepRuns: ${history.stats.partialDeepRuns}`,
    `- fallbackRuns: ${history.stats.fallbackRuns}`,
    `- bestQualityScore: ${history.stats.bestQualityScore}`,
    '',
    ...history.records.map((record, index) =>
      [
        `### ${index + 1}. ${record.runId}`,
        `- savedAt: ${record.savedAt}`,
        `- problem: ${record.problemPreview}`,
        `- team: ${record.teamSummary.join(' / ')}`,
        `- decisionSource: ${record.decisionSource}`,
        `- deepRun: ${record.deepRunStatus}｜${record.deepRunLabel}`,
        `- durationMs: ${record.durationMs}`,
        `- quality: ${record.qualityScore}/${record.qualityStatus}`,
        `- excellence: ${record.excellenceScore ?? 'not-recorded'}`,
        `- blockers: ${record.blockers.map(normalizeCouncilRuntimeHistoryProof).join(' / ') || 'none'}`,
      ].join('\n'),
    ),
  ].join('\n')
}

export const COUNCIL_RUNTIME_HISTORY_STORAGE_KEY = STORAGE_KEY
