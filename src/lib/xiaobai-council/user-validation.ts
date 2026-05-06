export type CouncilUserValidationParticipantKind =
  | 'external-human'
  | 'designer-or-team'
  | 'boss-self-check'
  | 'model-simulation'

export interface CouncilUserValidationRecord {
  id: string
  savedAt: string
  runId?: string
  protocolVersion?: 2
  problemPreview: string
  participantAlias: string
  participantKind?: CouncilUserValidationParticipantKind
  observerAlias?: string
  taskPrompt: string
  taskScript?: string[]
  completionMinutes: number
  completedInput: boolean
  understoodMatchReason: boolean
  foundNextAction: boolean
  namedCutAndKeptReason: boolean
  exportedOutcome: boolean
  usedRealProblem?: boolean
  uncoachedAttempt?: boolean
  consentAndPrivacyConfirmed?: boolean
  participantSummary?: string
  nextActionEvidence?: string
  cutAndKeptEvidence?: string
  exportedArtifactRef?: string
  dissatisfaction?: string
  repairRequired?: boolean
  repairResolved?: boolean
  repairNotes?: string
  finalWorthUsing?: boolean
  notes?: string
  passed: boolean
  failureReasons: string[]
}

export interface CouncilUserValidationStats {
  totalRecords: number
  totalParticipants: number
  passedParticipants: number
  failedParticipants: number
  certificationStatus: 'missing' | 'collecting' | 'passed' | 'failed'
  requiredParticipants: number
  requiredPasses: number
  passRate: number
  lastValidatedAt?: string
  unresolvedRepairs: number
}

export interface CouncilUserValidationLedger {
  records: CouncilUserValidationRecord[]
  stats: CouncilUserValidationStats
}

export interface SaveCouncilUserValidationInput {
  runId?: string
  problem: string
  participantAlias: string
  participantKind: CouncilUserValidationParticipantKind
  observerAlias: string
  taskPrompt: string
  taskScript?: string[]
  completionMinutes: number
  completedInput: boolean
  understoodMatchReason: boolean
  foundNextAction: boolean
  namedCutAndKeptReason: boolean
  exportedOutcome: boolean
  usedRealProblem: boolean
  uncoachedAttempt: boolean
  consentAndPrivacyConfirmed: boolean
  participantSummary: string
  nextActionEvidence: string
  cutAndKeptEvidence: string
  exportedArtifactRef: string
  dissatisfaction?: string
  repairRequired?: boolean
  repairResolved?: boolean
  repairNotes?: string
  finalWorthUsing: boolean
  notes?: string
  savedAt?: string
}

const STORAGE_KEY = 'openbasaka.xiaobai.userValidation.v2'
const LEGACY_STORAGE_KEY = 'openbasaka.xiaobai.userValidation.v1'
const MAX_RECORDS = 24
const REQUIRED_PARTICIPANTS = 5
const REQUIRED_PASSES = 4
const DEFAULT_TASK_SCRIPT = [
  '只给参与者一句真实任务，不解释系统内部机制。',
  '让参与者独立输入自己的真实问题并等待编队。',
  '让参与者说出为什么推荐这些角色。',
  '让参与者找到下一步行动和至少一个可执行任务。',
  '让参与者说出一个被裁掉的方向和一个保留理由。',
  '让参与者复制 PRD 或导出共识追溯简报，并说明是否愿意真实使用。',
]

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

function normalizedAlias(value: string | undefined): string {
  return compact(value || '', 80).toLocaleLowerCase()
}

function containsModelAlias(value: string | undefined): boolean {
  return /(^|\b)(ai|gpt|chatgpt|claude|gemini|model)(\b|$)|模型|自评|系统模拟|模拟用户/i.test(value || '')
}

function isValidationRecord(value: unknown): value is CouncilUserValidationRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as CouncilUserValidationRecord
  return Boolean(record.id && record.savedAt && record.participantAlias && typeof record.passed === 'boolean')
}

function parseRecords(raw: string | null): CouncilUserValidationRecord[] {
  if (!raw) return []
  try {
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data.filter(isValidationRecord).map(normalizeRecord) : []
  } catch {
    return []
  }
}

function participantKey(record: CouncilUserValidationRecord): string {
  return normalizedAlias(record.participantAlias) || record.id
}

function taskScriptFor(record: CouncilUserValidationRecord | SaveCouncilUserValidationInput): string[] {
  const steps = record.taskScript?.map((step) => compact(step, 220)).filter(Boolean) || []
  return steps.length >= 5 ? steps.slice(0, 8) : DEFAULT_TASK_SCRIPT
}

function failureReasons(record: CouncilUserValidationRecord): string[] {
  const observer = normalizedAlias(record.observerAlias)
  const participant = normalizedAlias(record.participantAlias)
  return [
    record.protocolVersion === 2 ? '' : '旧版记录缺少 v2 真实测试协议证据，必须重新验证。',
    record.participantKind === 'external-human' ? '' : '参与者不是未参与设计的外部真人，不能作为小白验证。',
    containsModelAlias(record.participantAlias) || containsModelAlias(record.observerAlias) ? '记录疑似模型/系统自评，不能作为真人验证。' : '',
    observer ? '' : '缺少观察员代号，无法复盘是谁记录的验证。',
    observer && participant && observer !== participant ? '' : '观察员与参与者必须分离，不能把自测当外部验证。',
    record.usedRealProblem ? '' : '没有使用参与者自己的真实问题。',
    record.uncoachedAttempt ? '' : '测试过程被引导/代操作，不能证明小白独立完成。',
    record.consentAndPrivacyConfirmed ? '' : '未确认已匿名记录且不保存隐私、账号、密钥或原始敏感材料。',
    record.completedInput ? '' : '未能完成问题输入。',
    record.understoodMatchReason ? '' : '未能看懂推荐编队理由。',
    record.foundNextAction ? '' : '未能找到下一步行动。',
    record.namedCutAndKeptReason ? '' : '未能说出至少 1 个被裁掉方案和 1 个保留理由。',
    record.exportedOutcome ? '' : '未能复制 PRD 或导出共识追溯简报。',
    record.completionMinutes <= 3 ? '' : `完成时间 ${record.completionMinutes} 分钟，超过 3 分钟小白验收线。`,
    hasText(record.taskPrompt, 18) ? '' : '缺少给用户的真实任务脚本。',
    taskScriptFor(record).length >= 5 ? '' : '测试脚本少于 5 步，无法复盘完整路径。',
    hasText(record.participantSummary, 12) ? '' : '缺少参与者自己的理解复述。',
    hasText(record.nextActionEvidence, 8) ? '' : '缺少“找到下一步”的观察证据。',
    hasText(record.cutAndKeptEvidence, 8) ? '' : '缺少保留/裁掉理由的原话或摘要证据。',
    hasText(record.exportedArtifactRef, 3) ? '' : '缺少 PRD/共识追溯导出物或复制结果的引用。',
    record.repairRequired && !record.repairResolved ? '参与者不满意点尚未返修闭环。' : '',
    record.finalWorthUsing ? '' : '参与者最终没有确认值得用于真实人生/项目规划。',
  ].filter(Boolean)
}

function normalizeRecord(record: CouncilUserValidationRecord): CouncilUserValidationRecord {
  const normalized: CouncilUserValidationRecord = {
    ...record,
    protocolVersion: record.protocolVersion,
    problemPreview: compact(record.problemPreview || ''),
    participantAlias: compact(record.participantAlias || '匿名小白', 36),
    observerAlias: record.observerAlias ? compact(record.observerAlias, 36) : undefined,
    taskPrompt: compact(record.taskPrompt || '', 260),
    taskScript: taskScriptFor(record),
    completionMinutes: Math.max(0, Math.round((Number(record.completionMinutes) || 0) * 10) / 10),
    participantSummary: record.participantSummary ? compact(record.participantSummary, 300) : undefined,
    nextActionEvidence: record.nextActionEvidence ? compact(record.nextActionEvidence, 260) : undefined,
    cutAndKeptEvidence: record.cutAndKeptEvidence ? compact(record.cutAndKeptEvidence, 260) : undefined,
    exportedArtifactRef: record.exportedArtifactRef ? compact(record.exportedArtifactRef, 180) : undefined,
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

function stats(records: CouncilUserValidationRecord[]): CouncilUserValidationStats {
  const latestByParticipant = new Map<string, CouncilUserValidationRecord>()
  const sorted = [...records].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  for (const record of sorted) {
    const key = participantKey(record)
    if (!latestByParticipant.has(key)) latestByParticipant.set(key, record)
  }
  const participantRecords = [...latestByParticipant.values()]
  const passedParticipants = participantRecords.filter((record) => record.passed).length
  const totalParticipants = participantRecords.length
  const unresolvedRepairs = records.filter((record) => record.repairRequired && !record.repairResolved).length
  const enoughParticipants = totalParticipants >= REQUIRED_PARTICIPANTS
  const enoughPasses = passedParticipants >= REQUIRED_PASSES
  const certificationStatus: CouncilUserValidationStats['certificationStatus'] =
    enoughParticipants && enoughPasses && unresolvedRepairs === 0
      ? 'passed'
      : enoughParticipants
        ? 'failed'
        : totalParticipants > 0
          ? 'collecting'
          : 'missing'
  return {
    totalRecords: records.length,
    totalParticipants,
    passedParticipants,
    failedParticipants: totalParticipants - passedParticipants,
    certificationStatus,
    requiredParticipants: REQUIRED_PARTICIPANTS,
    requiredPasses: REQUIRED_PASSES,
    passRate: totalParticipants ? Math.round((passedParticipants / totalParticipants) * 100) : 0,
    lastValidatedAt: records[0]?.savedAt,
    unresolvedRepairs,
  }
}

function writeRecords(records: CouncilUserValidationRecord[]): void {
  if (!canUseLocalStorage()) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

export function loadCouncilUserValidationLedger(): CouncilUserValidationLedger {
  const records = canUseLocalStorage()
    ? [
        ...parseRecords(localStorage.getItem(STORAGE_KEY)),
        ...parseRecords(localStorage.getItem(LEGACY_STORAGE_KEY)),
      ]
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
        .slice(0, MAX_RECORDS)
    : []
  return {
    records,
    stats: stats(records),
  }
}

export function clearCouncilUserValidationLedger(): CouncilUserValidationLedger {
  if (canUseLocalStorage()) {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  }
  return { records: [], stats: stats([]) }
}

export function saveCouncilUserValidationRecord(input: SaveCouncilUserValidationInput): CouncilUserValidationLedger {
  const savedAt = input.savedAt || new Date().toISOString()
  const record = normalizeRecord({
    id: `user-validation-${savedAt}-${compact(input.participantAlias, 24)}`,
    savedAt,
    runId: input.runId,
    protocolVersion: 2,
    problemPreview: compact(input.problem),
    participantAlias: compact(input.participantAlias || '匿名小白', 36),
    participantKind: input.participantKind,
    observerAlias: compact(input.observerAlias || '', 36),
    taskPrompt: compact(input.taskPrompt || input.problem, 260),
    taskScript: taskScriptFor(input),
    completionMinutes: Math.max(0, Math.round(input.completionMinutes * 10) / 10),
    completedInput: input.completedInput,
    understoodMatchReason: input.understoodMatchReason,
    foundNextAction: input.foundNextAction,
    namedCutAndKeptReason: input.namedCutAndKeptReason,
    exportedOutcome: input.exportedOutcome,
    usedRealProblem: input.usedRealProblem,
    uncoachedAttempt: input.uncoachedAttempt,
    consentAndPrivacyConfirmed: input.consentAndPrivacyConfirmed,
    participantSummary: compact(input.participantSummary, 300),
    nextActionEvidence: compact(input.nextActionEvidence, 260),
    cutAndKeptEvidence: compact(input.cutAndKeptEvidence, 260),
    exportedArtifactRef: compact(input.exportedArtifactRef, 180),
    dissatisfaction: input.dissatisfaction ? compact(input.dissatisfaction, 240) : undefined,
    repairRequired: Boolean(input.repairRequired),
    repairResolved: Boolean(input.repairResolved),
    repairNotes: input.repairNotes ? compact(input.repairNotes, 260) : undefined,
    finalWorthUsing: input.finalWorthUsing,
    notes: input.notes ? compact(input.notes, 260) : undefined,
    passed: false,
    failureReasons: [],
  })
  const current = loadCouncilUserValidationLedger().records
  const records = [record, ...current]
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .slice(0, MAX_RECORDS)
  writeRecords(records)
  return { records, stats: stats(records) }
}

export function hasCouncilUserValidationCertification(ledger?: CouncilUserValidationLedger): boolean {
  return ledger?.stats.certificationStatus === 'passed'
}

export function renderCouncilUserValidationMarkdown(ledger: CouncilUserValidationLedger): string {
  return [
    '## 真实小白用户验证账本',
    '',
    '- protocol: 5-8 人稳审；至少 5 名未参与设计的外部真人完成记录，至少 4 人通过，失败和返修记录不得删除。',
    `- status: ${ledger.stats.certificationStatus}`,
    `- records: ${ledger.stats.totalRecords}`,
    `- participants: ${ledger.stats.totalParticipants}/${ledger.stats.requiredParticipants}`,
    `- passes: ${ledger.stats.passedParticipants}/${ledger.stats.requiredPasses}`,
    `- passRate: ${ledger.stats.passRate}%`,
    `- unresolvedRepairs: ${ledger.stats.unresolvedRepairs}`,
    `- lastValidatedAt: ${ledger.stats.lastValidatedAt || 'none'}`,
    '',
    '### 验证记录',
    ...ledger.records.map((record, index) =>
      [
        `#### ${index + 1}. ${record.participantAlias}｜${record.passed ? 'passed' : 'failed'}`,
        `- savedAt: ${record.savedAt}`,
        `- runId: ${record.runId || 'none'}`,
        `- observer: ${record.observerAlias || 'missing'}`,
        `- participantKind: ${record.participantKind || 'missing'}`,
        `- problem: ${record.problemPreview}`,
        `- task: ${record.taskPrompt}`,
        `- script: ${taskScriptFor(record).join(' / ')}`,
        `- completionMinutes: ${record.completionMinutes}`,
        `- checks: input=${record.completedInput ? 'yes' : 'no'}, match=${record.understoodMatchReason ? 'yes' : 'no'}, next=${record.foundNextAction ? 'yes' : 'no'}, verdict=${record.namedCutAndKeptReason ? 'yes' : 'no'}, export=${record.exportedOutcome ? 'yes' : 'no'}, uncoached=${record.uncoachedAttempt ? 'yes' : 'no'}, realProblem=${record.usedRealProblem ? 'yes' : 'no'}, worthUse=${record.finalWorthUsing ? 'yes' : 'no'}`,
        `- participantSummary: ${record.participantSummary || 'missing'}`,
        `- nextActionEvidence: ${record.nextActionEvidence || 'missing'}`,
        `- cutAndKeptEvidence: ${record.cutAndKeptEvidence || 'missing'}`,
        `- exportedArtifactRef: ${record.exportedArtifactRef || 'missing'}`,
        `- dissatisfaction: ${record.dissatisfaction || 'none'}`,
        `- repair: required=${record.repairRequired ? 'yes' : 'no'}, resolved=${record.repairResolved ? 'yes' : 'no'}, notes=${record.repairNotes || 'none'}`,
        `- failures: ${record.failureReasons.join(' / ') || 'none'}`,
        record.notes ? `- notes: ${record.notes}` : '',
      ].filter(Boolean).join('\n'),
    ),
  ].join('\n')
}

export const COUNCIL_USER_VALIDATION_STORAGE_KEY = STORAGE_KEY
export const COUNCIL_USER_VALIDATION_LEGACY_STORAGE_KEY = LEGACY_STORAGE_KEY
export const COUNCIL_USER_VALIDATION_TASK_SCRIPT = DEFAULT_TASK_SCRIPT
