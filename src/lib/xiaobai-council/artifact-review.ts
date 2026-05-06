export type CouncilArtifactReviewerKind =
  | 'boss'
  | 'external-human'
  | 'designer-or-team'
  | 'model-simulation'

export type CouncilArtifactFinalVerdict = 'use' | 'repair' | 'reject'

export interface CouncilArtifactReviewRecord {
  id: string
  savedAt: string
  runId?: string
  protocolVersion?: 2
  reviewerAlias: string
  reviewerKind?: CouncilArtifactReviewerKind
  reviewedExportRef?: string
  artifactScore: number
  prdScore?: number
  theaterScore?: number
  baoyuScore?: number
  trustScore?: number
  prdDirectlyActionable: boolean
  theaterTraceClear: boolean
  baoyuChineseReadable: boolean
  visualTasteProfessional: boolean
  noFakeProgress: boolean
  wouldUseForRealPlanning: boolean
  prdNotes?: string
  theaterNotes?: string
  baoyuNotes?: string
  trustNotes?: string
  dissatisfaction?: string
  repairRequired?: boolean
  repairResolved?: boolean
  repairNotes?: string
  finalVerdict?: CouncilArtifactFinalVerdict
  notes?: string
  passed: boolean
  failureReasons: string[]
}

export interface CouncilArtifactReviewStats {
  totalReviews: number
  passedReviews: number
  failedReviews: number
  certificationStatus: 'missing' | 'collecting' | 'passed' | 'failed'
  requiredReviews: number
  requiredPasses: number
  bossFinalPassed: boolean
  peerReviewPassed: boolean
  averageScore: number
  prdAverageScore: number
  theaterAverageScore: number
  baoyuAverageScore: number
  trustAverageScore: number
  unresolvedRepairs: number
  lastReviewedAt?: string
}

export interface CouncilArtifactReviewLedger {
  records: CouncilArtifactReviewRecord[]
  stats: CouncilArtifactReviewStats
}

export interface SaveCouncilArtifactReviewInput {
  runId?: string
  reviewerAlias: string
  reviewerKind: CouncilArtifactReviewerKind
  reviewedExportRef: string
  artifactScore: number
  prdScore: number
  theaterScore: number
  baoyuScore: number
  trustScore: number
  prdDirectlyActionable: boolean
  theaterTraceClear: boolean
  baoyuChineseReadable: boolean
  visualTasteProfessional: boolean
  noFakeProgress: boolean
  wouldUseForRealPlanning: boolean
  prdNotes: string
  theaterNotes: string
  baoyuNotes: string
  trustNotes: string
  dissatisfaction?: string
  repairRequired?: boolean
  repairResolved?: boolean
  repairNotes?: string
  finalVerdict: CouncilArtifactFinalVerdict
  notes?: string
  savedAt?: string
}

const STORAGE_KEY = 'openbasaka.xiaobai.artifactReview.v2'
const LEGACY_STORAGE_KEY = 'openbasaka.xiaobai.artifactReview.v1'
const MAX_RECORDS = 18
const REQUIRED_REVIEWS = 2
const REQUIRED_PASSES = 2
const PASSING_SCORE = 90

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

function compact(value: string, max = 180): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function hasText(value: string | undefined, min = 1): boolean {
  return compact(value || '', 600).length >= min
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function containsModelAlias(value: string | undefined): boolean {
  return /(^|\b)(ai|gpt|chatgpt|claude|gemini|model)(\b|$)|模型|自评|系统模拟|模拟审稿/i.test(value || '')
}

function normalizedAlias(value: string | undefined): string {
  return compact(value || '', 80).toLocaleLowerCase()
}

function isArtifactReviewRecord(value: unknown): value is CouncilArtifactReviewRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as CouncilArtifactReviewRecord
  return Boolean(record.id && record.savedAt && record.reviewerAlias && typeof record.passed === 'boolean')
}

function parseRecords(raw: string | null): CouncilArtifactReviewRecord[] {
  if (!raw) return []
  try {
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data.filter(isArtifactReviewRecord).map(normalizeRecord) : []
  } catch {
    return []
  }
}

function dimensionScores(record: CouncilArtifactReviewRecord): number[] {
  return [
    clampScore(record.prdScore ?? 0),
    clampScore(record.theaterScore ?? 0),
    clampScore(record.baoyuScore ?? 0),
    clampScore(record.trustScore ?? 0),
  ]
}

function reviewerKey(record: CouncilArtifactReviewRecord): string {
  return normalizedAlias(record.reviewerAlias) || record.id
}

function scoreAverage(records: CouncilArtifactReviewRecord[], key: 'artifactScore' | 'prdScore' | 'theaterScore' | 'baoyuScore' | 'trustScore'): number {
  if (!records.length) return 0
  return Math.round(records.reduce((sum, record) => sum + clampScore(record[key] ?? 0), 0) / records.length)
}

function failureReasons(record: CouncilArtifactReviewRecord): string[] {
  const score = clampScore(record.artifactScore)
  const [prdScore, theaterScore, baoyuScore, trustScore] = dimensionScores(record)
  return [
    record.protocolVersion === 2 ? '' : '旧版记录缺少 v2 分项验收证据，必须重新审美验收。',
    record.reviewerAlias ? '' : '缺少审稿人代号，无法复盘是谁验收。',
    record.reviewerKind && record.reviewerKind !== 'model-simulation' ? '' : '审稿来源是模型/模拟，不能作为人工审美验收。',
    containsModelAlias(record.reviewerAlias) ? '审稿人疑似模型或系统自评，不能作为人工验收。' : '',
    hasText(record.reviewedExportRef, 3) ? '' : '缺少被验收导出物、截图或本轮 runId 引用。',
    score >= PASSING_SCORE ? '' : `人工审美/可用性评分 ${score}，低于 ${PASSING_SCORE}。`,
    prdScore >= PASSING_SCORE ? '' : `PRD 分项 ${prdScore}，低于 ${PASSING_SCORE}。`,
    theaterScore >= PASSING_SCORE ? '' : `剧场分项 ${theaterScore}，低于 ${PASSING_SCORE}。`,
    baoyuScore >= PASSING_SCORE ? '' : `技术蓝图分项 ${baoyuScore}，低于 ${PASSING_SCORE}。`,
    trustScore >= PASSING_SCORE ? '' : `整体可信度分项 ${trustScore}，低于 ${PASSING_SCORE}。`,
    record.prdDirectlyActionable ? '' : 'PRD 不能直接拆工程/设计/测试任务。',
    record.theaterTraceClear ? '' : '辩论剧场不能清楚追溯分歧、反驳和裁决。',
    record.baoyuChineseReadable ? '' : '技术蓝图存在前后端/API/数据/部署边界不清或不可实施。',
    record.visualTasteProfessional ? '' : '整体审美不够专业、优雅或与 UI 风格馆不一致。',
    record.noFakeProgress ? '' : '仍存在假进度、假思考或无法对应真实数据的表现。',
    record.wouldUseForRealPlanning ? '' : '审稿人不会把这份结果用于真实人生/项目规划。',
    hasText(record.prdNotes, 8) ? '' : '缺少 PRD 可执行性的人工审稿摘要。',
    hasText(record.theaterNotes, 8) ? '' : '缺少辩论剧场追溯性的人工审稿摘要。',
    hasText(record.baoyuNotes, 8) ? '' : '缺少技术蓝图可实施性的人工审稿摘要。',
    hasText(record.trustNotes, 8) ? '' : '缺少整体可信度/假进度检查的人工审稿摘要。',
    record.repairRequired && !record.repairResolved ? '审美验收提出返修，但尚未确认返修完成。' : '',
    record.finalVerdict === 'use' ? '' : '最终裁决不是“可用于真实规划”。',
  ].filter(Boolean)
}

function normalizeRecord(record: CouncilArtifactReviewRecord): CouncilArtifactReviewRecord {
  const normalized: CouncilArtifactReviewRecord = {
    ...record,
    reviewerAlias: compact(record.reviewerAlias || 'Boss reviewer', 36),
    reviewedExportRef: record.reviewedExportRef ? compact(record.reviewedExportRef, 180) : undefined,
    artifactScore: clampScore(record.artifactScore),
    prdScore: clampScore(record.prdScore ?? 0),
    theaterScore: clampScore(record.theaterScore ?? 0),
    baoyuScore: clampScore(record.baoyuScore ?? 0),
    trustScore: clampScore(record.trustScore ?? 0),
    prdNotes: record.prdNotes ? compact(record.prdNotes, 260) : undefined,
    theaterNotes: record.theaterNotes ? compact(record.theaterNotes, 260) : undefined,
    baoyuNotes: record.baoyuNotes ? compact(record.baoyuNotes, 260) : undefined,
    trustNotes: record.trustNotes ? compact(record.trustNotes, 260) : undefined,
    dissatisfaction: record.dissatisfaction ? compact(record.dissatisfaction, 240) : undefined,
    repairNotes: record.repairNotes ? compact(record.repairNotes, 260) : undefined,
    notes: record.notes ? compact(record.notes, 260) : undefined,
  }
  const failures = failureReasons(normalized)
  return {
    ...normalized,
    passed: failures.length === 0,
    failureReasons: failures,
  }
}

function stats(records: CouncilArtifactReviewRecord[]): CouncilArtifactReviewStats {
  const latestByReviewer = new Map<string, CouncilArtifactReviewRecord>()
  const sorted = [...records].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  for (const record of sorted) {
    const key = reviewerKey(record)
    if (!latestByReviewer.has(key)) latestByReviewer.set(key, record)
  }
  const reviewerRecords = [...latestByReviewer.values()]
  const passedReviews = reviewerRecords.filter((record) => record.passed).length
  const totalReviews = reviewerRecords.length
  const bossFinalPassed = reviewerRecords.some((record) => record.reviewerKind === 'boss' && record.passed && record.finalVerdict === 'use')
  const peerReviewPassed = reviewerRecords.some((record) => record.reviewerKind !== 'boss' && record.reviewerKind !== 'model-simulation' && record.passed)
  const unresolvedRepairs = records.filter((record) => record.repairRequired && !record.repairResolved).length
  const enoughReviews = totalReviews >= REQUIRED_REVIEWS
  const enoughPasses = passedReviews >= REQUIRED_PASSES
  const certificationStatus: CouncilArtifactReviewStats['certificationStatus'] =
    enoughReviews && enoughPasses && bossFinalPassed && peerReviewPassed && unresolvedRepairs === 0
      ? 'passed'
      : enoughReviews
        ? 'failed'
        : totalReviews > 0
          ? 'collecting'
          : 'missing'
  return {
    totalReviews,
    passedReviews,
    failedReviews: totalReviews - passedReviews,
    certificationStatus,
    requiredReviews: REQUIRED_REVIEWS,
    requiredPasses: REQUIRED_PASSES,
    bossFinalPassed,
    peerReviewPassed,
    averageScore: scoreAverage(reviewerRecords, 'artifactScore'),
    prdAverageScore: scoreAverage(reviewerRecords, 'prdScore'),
    theaterAverageScore: scoreAverage(reviewerRecords, 'theaterScore'),
    baoyuAverageScore: scoreAverage(reviewerRecords, 'baoyuScore'),
    trustAverageScore: scoreAverage(reviewerRecords, 'trustScore'),
    unresolvedRepairs,
    lastReviewedAt: records[0]?.savedAt,
  }
}

function writeRecords(records: CouncilArtifactReviewRecord[]): void {
  if (!canUseLocalStorage()) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

export function loadCouncilArtifactReviewLedger(): CouncilArtifactReviewLedger {
  const records = canUseLocalStorage()
    ? [
        ...parseRecords(localStorage.getItem(STORAGE_KEY)),
        ...parseRecords(localStorage.getItem(LEGACY_STORAGE_KEY)),
      ]
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
        .slice(0, MAX_RECORDS)
    : []
  return { records, stats: stats(records) }
}

export function clearCouncilArtifactReviewLedger(): CouncilArtifactReviewLedger {
  if (canUseLocalStorage()) {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  }
  return { records: [], stats: stats([]) }
}

export function saveCouncilArtifactReviewRecord(input: SaveCouncilArtifactReviewInput): CouncilArtifactReviewLedger {
  const savedAt = input.savedAt || new Date().toISOString()
  const record = normalizeRecord({
    id: `artifact-review-${savedAt}-${compact(input.reviewerAlias, 24)}`,
    savedAt,
    runId: input.runId,
    protocolVersion: 2,
    reviewerAlias: compact(input.reviewerAlias || 'Boss reviewer', 36),
    reviewerKind: input.reviewerKind,
    reviewedExportRef: compact(input.reviewedExportRef, 180),
    artifactScore: input.artifactScore,
    prdScore: input.prdScore,
    theaterScore: input.theaterScore,
    baoyuScore: input.baoyuScore,
    trustScore: input.trustScore,
    prdDirectlyActionable: input.prdDirectlyActionable,
    theaterTraceClear: input.theaterTraceClear,
    baoyuChineseReadable: input.baoyuChineseReadable,
    visualTasteProfessional: input.visualTasteProfessional,
    noFakeProgress: input.noFakeProgress,
    wouldUseForRealPlanning: input.wouldUseForRealPlanning,
    prdNotes: compact(input.prdNotes, 260),
    theaterNotes: compact(input.theaterNotes, 260),
    baoyuNotes: compact(input.baoyuNotes, 260),
    trustNotes: compact(input.trustNotes, 260),
    dissatisfaction: input.dissatisfaction ? compact(input.dissatisfaction, 240) : undefined,
    repairRequired: Boolean(input.repairRequired),
    repairResolved: Boolean(input.repairResolved),
    repairNotes: input.repairNotes ? compact(input.repairNotes, 260) : undefined,
    finalVerdict: input.finalVerdict,
    notes: input.notes ? compact(input.notes, 260) : undefined,
    passed: false,
    failureReasons: [],
  })
  const current = loadCouncilArtifactReviewLedger().records
  const records = [record, ...current]
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .slice(0, MAX_RECORDS)
  writeRecords(records)
  return { records, stats: stats(records) }
}

export function hasCouncilArtifactReviewCertification(ledger?: CouncilArtifactReviewLedger): boolean {
  return ledger?.stats.certificationStatus === 'passed'
}

export function renderCouncilArtifactReviewMarkdown(ledger: CouncilArtifactReviewLedger): string {
  return [
    '## 人工审美与产物验收账本',
    '',
    '- protocol: 至少 2 名人工审稿人；Boss 终审必须通过；PRD、剧场、技术蓝图、整体可信度均需 90+ 且 finalVerdict=use。',
    `- status: ${ledger.stats.certificationStatus}`,
    `- records: ${ledger.records.length}`,
    `- reviews: ${ledger.stats.totalReviews}/${ledger.stats.requiredReviews}`,
    `- passes: ${ledger.stats.passedReviews}/${ledger.stats.requiredPasses}`,
    `- bossFinalPassed: ${ledger.stats.bossFinalPassed ? 'yes' : 'no'}`,
    `- peerReviewPassed: ${ledger.stats.peerReviewPassed ? 'yes' : 'no'}`,
    `- averageScore: ${ledger.stats.averageScore}`,
    `- dimensionAverage: prd=${ledger.stats.prdAverageScore}, theater=${ledger.stats.theaterAverageScore}, blueprint=${ledger.stats.baoyuAverageScore}, trust=${ledger.stats.trustAverageScore}`,
    `- unresolvedRepairs: ${ledger.stats.unresolvedRepairs}`,
    `- lastReviewedAt: ${ledger.stats.lastReviewedAt || 'none'}`,
    '',
    '### 验收记录',
    ...ledger.records.map((record, index) =>
      [
        `#### ${index + 1}. ${record.reviewerAlias}｜${record.passed ? 'passed' : 'failed'}｜${record.artifactScore}`,
        `- savedAt: ${record.savedAt}`,
        `- runId: ${record.runId || 'none'}`,
        `- reviewerKind: ${record.reviewerKind || 'missing'}`,
        `- reviewedExportRef: ${record.reviewedExportRef || 'missing'}`,
        `- scores: prd=${record.prdScore ?? 0}, theater=${record.theaterScore ?? 0}, blueprint=${record.baoyuScore ?? 0}, trust=${record.trustScore ?? 0}`,
        `- checks: prd=${record.prdDirectlyActionable ? 'yes' : 'no'}, theater=${record.theaterTraceClear ? 'yes' : 'no'}, blueprint=${record.baoyuChineseReadable ? 'yes' : 'no'}, taste=${record.visualTasteProfessional ? 'yes' : 'no'}, realProgress=${record.noFakeProgress ? 'yes' : 'no'}, wouldUse=${record.wouldUseForRealPlanning ? 'yes' : 'no'}`,
        `- prdNotes: ${record.prdNotes || 'missing'}`,
        `- theaterNotes: ${record.theaterNotes || 'missing'}`,
        `- blueprintNotes: ${record.baoyuNotes || 'missing'}`,
        `- trustNotes: ${record.trustNotes || 'missing'}`,
        `- dissatisfaction: ${record.dissatisfaction || 'none'}`,
        `- repair: required=${record.repairRequired ? 'yes' : 'no'}, resolved=${record.repairResolved ? 'yes' : 'no'}, notes=${record.repairNotes || 'none'}`,
        `- finalVerdict: ${record.finalVerdict || 'missing'}`,
        `- failures: ${record.failureReasons.join(' / ') || 'none'}`,
        record.notes ? `- notes: ${record.notes}` : '',
      ].filter(Boolean).join('\n'),
    ),
  ].join('\n')
}

export const COUNCIL_ARTIFACT_REVIEW_STORAGE_KEY = STORAGE_KEY
export const COUNCIL_ARTIFACT_REVIEW_LEGACY_STORAGE_KEY = LEGACY_STORAGE_KEY
