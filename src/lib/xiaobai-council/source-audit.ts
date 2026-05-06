import { COUNCIL_PERSONAS } from './personas'

export interface CouncilNuwaSourceAuditRecord {
  id: string
  personaId: string
  personaName: string
  reviewerAlias: string
  savedAt: string
  sourceIndexSummary: string
  checkedSkillMd: boolean
  checkedEvidenceMd: boolean
  checkedSixStreams: boolean
  validationQuestionsRun: number
  uncertaintyBoundaryConfirmed: boolean
  noAuthorizationClaimConfirmed: boolean
  notes?: string
  passed: boolean
  failureReasons: string[]
}

export interface CouncilNuwaSourceAuditStats {
  totalRecords: number
  auditedPersonaCount: number
  failedRecordCount: number
  personaCount: number
  coverageRatio: number
  latestAuditAt?: string
}

export interface CouncilNuwaSourceAuditLedger {
  records: CouncilNuwaSourceAuditRecord[]
  stats: CouncilNuwaSourceAuditStats
}

export interface SaveCouncilNuwaSourceAuditInput {
  personaId: string
  reviewerAlias: string
  sourceIndexSummary: string
  checkedSkillMd: boolean
  checkedEvidenceMd: boolean
  checkedSixStreams: boolean
  validationQuestionsRun: number
  uncertaintyBoundaryConfirmed: boolean
  noAuthorizationClaimConfirmed: boolean
  notes?: string
  savedAt?: string
}

const STORAGE_KEY = 'openbasaka.xiaobai.nuwaSourceAudit.v1'
const MAX_RECORDS = 72

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

function compact(value: string, max = 220): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function personaName(personaId: string): string {
  return COUNCIL_PERSONAS.find((persona) => persona.id === personaId)?.name || personaId
}

function isRecord(value: unknown): value is CouncilNuwaSourceAuditRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as CouncilNuwaSourceAuditRecord
  return Boolean(record.id && record.personaId && record.savedAt && typeof record.passed === 'boolean')
}

function parseRecords(raw: string | null): CouncilNuwaSourceAuditRecord[] {
  if (!raw) return []
  try {
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data.filter(isRecord) : []
  } catch {
    return []
  }
}

function failureReasons(input: SaveCouncilNuwaSourceAuditInput): string[] {
  return [
    input.checkedSkillMd ? '' : '未抽查 SKILL.md。',
    input.checkedEvidenceMd ? '' : '未抽查 EVIDENCE.md。',
    input.checkedSixStreams ? '' : '未核对六路来源索引。',
    input.validationQuestionsRun >= 2 ? '' : `只跑了 ${input.validationQuestionsRun} 道验证题，至少需要 2 道。`,
    input.uncertaintyBoundaryConfirmed ? '' : '未确认角色会在证据不足时说“不确定”。',
    input.noAuthorizationClaimConfirmed ? '' : '未确认不会暗示真人授权、本人参与或机构背书。',
    compact(input.sourceIndexSummary).length >= 24 ? '' : '来源索引摘要过短，无法回看复核依据。',
  ].filter(Boolean)
}

function latestPassedByPersona(records: CouncilNuwaSourceAuditRecord[]): Map<string, CouncilNuwaSourceAuditRecord> {
  const output = new Map<string, CouncilNuwaSourceAuditRecord>()
  for (const record of records) {
    if (!record.passed || output.has(record.personaId)) continue
    output.set(record.personaId, record)
  }
  return output
}

function stats(records: CouncilNuwaSourceAuditRecord[], personaCount = COUNCIL_PERSONAS.length): CouncilNuwaSourceAuditStats {
  const auditedPersonaCount = latestPassedByPersona(records).size
  return {
    totalRecords: records.length,
    auditedPersonaCount,
    failedRecordCount: records.filter((record) => !record.passed).length,
    personaCount,
    coverageRatio: personaCount ? Math.round((auditedPersonaCount / personaCount) * 100) : 0,
    latestAuditAt: records[0]?.savedAt,
  }
}

function writeRecords(records: CouncilNuwaSourceAuditRecord[]): void {
  if (!canUseLocalStorage()) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

export function loadCouncilNuwaSourceAuditLedger(): CouncilNuwaSourceAuditLedger {
  const records = canUseLocalStorage() ? parseRecords(localStorage.getItem(STORAGE_KEY)) : []
  return {
    records,
    stats: stats(records),
  }
}

export function clearCouncilNuwaSourceAuditLedger(): CouncilNuwaSourceAuditLedger {
  if (canUseLocalStorage()) localStorage.removeItem(STORAGE_KEY)
  return { records: [], stats: stats([]) }
}

export function saveCouncilNuwaSourceAuditRecord(input: SaveCouncilNuwaSourceAuditInput): CouncilNuwaSourceAuditLedger {
  const savedAt = input.savedAt || new Date().toISOString()
  const failures = failureReasons(input)
  const record: CouncilNuwaSourceAuditRecord = {
    id: `nuwa-source-audit-${savedAt}-${compact(input.personaId, 32)}`,
    personaId: input.personaId,
    personaName: personaName(input.personaId),
    reviewerAlias: compact(input.reviewerAlias || '匿名复核者', 36),
    savedAt,
    sourceIndexSummary: compact(input.sourceIndexSummary, 420),
    checkedSkillMd: input.checkedSkillMd,
    checkedEvidenceMd: input.checkedEvidenceMd,
    checkedSixStreams: input.checkedSixStreams,
    validationQuestionsRun: Math.max(0, Math.round(input.validationQuestionsRun)),
    uncertaintyBoundaryConfirmed: input.uncertaintyBoundaryConfirmed,
    noAuthorizationClaimConfirmed: input.noAuthorizationClaimConfirmed,
    notes: input.notes ? compact(input.notes, 240) : undefined,
    passed: failures.length === 0,
    failureReasons: failures,
  }
  const records = [record, ...loadCouncilNuwaSourceAuditLedger().records]
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .slice(0, MAX_RECORDS)
  writeRecords(records)
  return { records, stats: stats(records) }
}

export function hasCouncilNuwaPersonaSourceAudit(ledger: CouncilNuwaSourceAuditLedger | undefined, personaId: string): boolean {
  return Boolean(ledger && latestPassedByPersona(ledger.records).has(personaId))
}

export function getCouncilNuwaPersonaSourceAudit(
  ledger: CouncilNuwaSourceAuditLedger | undefined,
  personaId: string,
): CouncilNuwaSourceAuditRecord | undefined {
  return ledger ? latestPassedByPersona(ledger.records).get(personaId) : undefined
}

export function renderCouncilNuwaSourceAuditMarkdown(ledger: CouncilNuwaSourceAuditLedger): string {
  return [
    '## Nuwa 来源级人工复核账本',
    '',
    `- totalRecords: ${ledger.stats.totalRecords}`,
    `- auditedPersonas: ${ledger.stats.auditedPersonaCount}/${ledger.stats.personaCount}`,
    `- failedRecords: ${ledger.stats.failedRecordCount}`,
    `- coverageRatio: ${ledger.stats.coverageRatio}%`,
    `- latestAuditAt: ${ledger.stats.latestAuditAt || 'none'}`,
    '',
    '### 复核记录',
    ...ledger.records.map((record, index) =>
      [
        `#### ${index + 1}. ${record.personaName}｜${record.passed ? 'passed' : 'failed'}`,
        `- savedAt: ${record.savedAt}`,
        `- reviewer: ${record.reviewerAlias}`,
        `- sourceIndex: ${record.sourceIndexSummary}`,
        `- checks: skill=${record.checkedSkillMd ? 'yes' : 'no'}, evidence=${record.checkedEvidenceMd ? 'yes' : 'no'}, sixStreams=${record.checkedSixStreams ? 'yes' : 'no'}, validationQuestions=${record.validationQuestionsRun}, uncertainty=${record.uncertaintyBoundaryConfirmed ? 'yes' : 'no'}, noAuthorizationClaim=${record.noAuthorizationClaimConfirmed ? 'yes' : 'no'}`,
        `- failures: ${record.failureReasons.join(' / ') || 'none'}`,
        record.notes ? `- notes: ${record.notes}` : '',
      ].filter(Boolean).join('\n'),
    ),
  ].join('\n')
}

export const COUNCIL_NUWA_SOURCE_AUDIT_STORAGE_KEY = STORAGE_KEY
