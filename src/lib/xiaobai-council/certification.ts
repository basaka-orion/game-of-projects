import type { CouncilExcellenceAudit } from './excellence-audit'
import type { CouncilNuwaEvidenceRegistry } from './distillation-evidence'
import type { CouncilQualityGate } from './quality-gate'
import type { CouncilRuntimeCalibrationPlan } from './runtime-calibration'
import type { CouncilRuntimeEvidenceLedger } from './runtime-evidence'
import type { CouncilSelection } from './selector'
import {
  getCouncilNuwaPersonaSourceAudit,
  type CouncilNuwaSourceAuditLedger,
} from './source-audit'
import {
  hasCouncilUserValidationCertification,
  type CouncilUserValidationLedger,
} from './user-validation'
import {
  hasCouncilArtifactReviewCertification,
  type CouncilArtifactReviewLedger,
} from './artifact-review'

export type Council95CertificationStatus = 'blocked' | 'needs-human-proof' | 'candidate-95'
export type Council95CertificationCheckStatus = 'pass' | 'warn' | 'fail'

export interface Council95CertificationCheck {
  id: string
  label: string
  status: Council95CertificationCheckStatus
  hardGate: boolean
  score: number
  proof: string
  requiredProof: string
  evidenceRefs: string[]
}

export interface Council95CertificationGate {
  generatedAt: string
  score: number
  targetScore: 95
  status: Council95CertificationStatus
  label: string
  claimAllowed: boolean
  claimText: string
  hardGatePassed: boolean
  checks: Council95CertificationCheck[]
  blockers: string[]
  nextProof: string[]
  proofChain: string[]
}

interface Council95CertificationInput {
  selection?: CouncilSelection | null
  qualityGate?: CouncilQualityGate | null
  excellenceAudit?: CouncilExcellenceAudit | null
  historicalExcellenceScore?: number
  runtimeEvidence?: CouncilRuntimeEvidenceLedger | null
  runtimeCalibrationPlan: CouncilRuntimeCalibrationPlan
  userValidationLedger: CouncilUserValidationLedger
  artifactReviewLedger: CouncilArtifactReviewLedger
  nuwaEvidenceRegistry: CouncilNuwaEvidenceRegistry
  sourceAuditLedger: CouncilNuwaSourceAuditLedger
  generatedAt?: string
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function check(input: {
  id: string
  label: string
  passed: boolean
  score: number
  proof: string
  requiredProof: string
  evidenceRefs?: string[]
  hardGate?: boolean
  partial?: boolean
}): Council95CertificationCheck {
  const score = clampScore(input.score)
  return {
    id: input.id,
    label: input.label,
    status: input.passed ? 'pass' : input.partial || score >= 70 ? 'warn' : 'fail',
    hardGate: input.hardGate ?? true,
    score,
    proof: input.proof,
    requiredProof: input.requiredProof,
    evidenceRefs: input.evidenceRefs?.filter(Boolean).slice(0, 8) || [],
  }
}

function unique(values: string[], max: number): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values) {
    const next = value.replace(/\s+/g, ' ').trim()
    if (!next || seen.has(next)) continue
    seen.add(next)
    output.push(next)
    if (output.length >= max) break
  }
  return output
}

function weightedScore(checks: Council95CertificationCheck[]): number {
  if (!checks.length) return 0
  const hardWeight = 1.25
  const totalWeight = checks.reduce((sum, item) => sum + (item.hardGate ? hardWeight : 1), 0)
  return clampScore(checks.reduce((sum, item) => sum + item.score * (item.hardGate ? hardWeight : 1), 0) / totalWeight)
}

function selectedPersonaIds(selection?: CouncilSelection | null): string[] {
  return selection?.seats.map((seat) => seat.persona.id) || []
}

function auditedSelectedPersonas(selection: CouncilSelection | null | undefined, ledger: CouncilNuwaSourceAuditLedger): {
  selectedCount: number
  auditedCount: number
  missingNames: string[]
  evidenceRefs: string[]
} {
  const seats = selection?.seats || []
  const missingNames: string[] = []
  const evidenceRefs: string[] = []
  let auditedCount = 0
  for (const seat of seats) {
    const record = getCouncilNuwaPersonaSourceAudit(ledger, seat.persona.id)
    if (record) {
      auditedCount += 1
      evidenceRefs.push(record.id)
    } else {
      missingNames.push(seat.persona.name)
    }
  }
  return {
    selectedCount: seats.length,
    auditedCount,
    missingNames,
    evidenceRefs,
  }
}

function deepRunPassed(runtime?: CouncilRuntimeEvidenceLedger | null): boolean {
  if (!runtime) return false
  return (
    runtime.decisionSource === 'deep-model' &&
    runtime.modelJudgeUsed &&
    !runtime.fallbackUsed &&
    runtime.deepRunCertification.status === 'proved' &&
    runtime.deepRunCertification.modelJudgeTraceVerified &&
    runtime.deepRunCertification.stageTraceVerified &&
    runtime.deepRunCertification.temporalTraceVerified &&
    runtime.deepRunCertification.actualDurationMs >= runtime.deepRunCertification.requiredDurationMs
  )
}

export function buildCouncil95CertificationGate(input: Council95CertificationInput): Council95CertificationGate {
  const runtime = input.runtimeEvidence
  const selectedIds = selectedPersonaIds(input.selection)
  const selectedAudit = auditedSelectedPersonas(input.selection, input.sourceAuditLedger)
  const deepRunOk = deepRunPassed(runtime)
  const qualityFromGate =
    Boolean(input.qualityGate) &&
    input.qualityGate?.finalGateStatus === 'approved' &&
    input.qualityGate.score >= 90 &&
    input.qualityGate.prdCompletenessScore >= 90 &&
    input.qualityGate.launchReadinessScore >= 90
  const qualityFromRuntime =
    Boolean(runtime) &&
    runtime?.qualityStatus === 'approved' &&
    (runtime?.qualityScore || 0) >= 90
  const qualityOk = qualityFromGate || qualityFromRuntime
  const excellenceScore = Math.max(input.excellenceAudit?.score || 0, input.historicalExcellenceScore || 0)
  const excellenceOk = excellenceScore >= 95
  const userOk = hasCouncilUserValidationCertification(input.userValidationLedger)
  const artifactOk = hasCouncilArtifactReviewCertification(input.artifactReviewLedger)
  const sourceOk = selectedAudit.selectedCount > 0 && selectedAudit.auditedCount === selectedAudit.selectedCount
  const calibrationOk = input.runtimeCalibrationPlan.status === 'candidate-95' && input.runtimeCalibrationPlan.score >= 90
  const debateOk = Boolean(runtime && runtime.sceneCount >= 18 && runtime.relationCount >= 12 && runtime.verdictLedgerCount >= 8)
  const checks: Council95CertificationCheck[] = [
    check({
      id: 'deep-model-long-run',
      label: '真实 deep-model 深度长跑',
      passed: deepRunOk,
      score: deepRunOk ? 96 : runtime ? Math.min(82, Math.round((runtime.durationMs / 120000) * 74)) : 48,
      proof: deepRunOk
        ? `runId=${runtime?.runId}，duration=${runtime?.durationMs}ms，model-judge/stage/timeline 均已核验。`
        : runtime?.deepRunCertification.blockers.join(' / ') || '还没有真实运行证据账本。',
      requiredProof: '必须完成 120s+ deep-model 裁判、完整 6 阶段 trace、可信时间线和无 fallback 的长跑。',
      evidenceRefs: runtime ? [runtime.runId, ...runtime.replayFrames.slice(0, 4).map((frame) => frame.id)] : [],
    }),
    check({
      id: 'quality-and-excellence',
      label: '质量闸门与卓越审计',
      passed: qualityOk && excellenceOk,
      score: qualityOk && excellenceOk
        ? Math.max(95, excellenceScore, runtime?.qualityScore || 0, input.qualityGate?.score || 0)
        : Math.max(input.qualityGate?.score || 0, runtime?.qualityScore || 0, excellenceScore, 52),
      proof: input.qualityGate && input.excellenceAudit
        ? `quality=${input.qualityGate.score}/${input.qualityGate.finalGateStatus}，excellence=${input.excellenceAudit.score}/95。`
        : qualityFromRuntime || excellenceScore
          ? `history/runtime quality=${runtime?.qualityScore || input.qualityGate?.score || 0}/${runtime?.qualityStatus || input.qualityGate?.finalGateStatus || 'missing'}，excellence=${excellenceScore || 'missing'}/95。`
          : '尚未同时生成质量闸门与 95 卓越审计。',
      requiredProof: '质量闸门、PRD 完整度、上线准备度均需 90+ approved；卓越审计需 95+；刷新后可引用 runtime history，但不能伪造缺失的质量证据。',
      evidenceRefs: input.qualityGate ? [input.qualityGate.gateId, ...(input.excellenceAudit?.proofChain || []).slice(0, 4)] : [],
    }),
    check({
      id: 'debate-traceability',
      label: '辩论剧场可追溯',
      passed: debateOk,
      score: debateOk ? 95 : runtime ? 70 + Math.min(12, runtime.sceneCount) : 50,
      proof: runtime
        ? `scenes=${runtime.sceneCount}，relations=${runtime.relationCount}，ledgerItems=${runtime.verdictLedgerCount}。`
        : '尚未生成真实运行剧场证据。',
      requiredProof: '至少 18 幕辩论场景、12 条关系边、8 条裁决账本记录，且能回到来源消息。',
      evidenceRefs: runtime ? runtime.replayFrames.filter((frame) => frame.source === 'debate-theater').map((frame) => frame.id) : [],
    }),
    check({
      id: 'selected-source-audit',
      label: '入选角色来源级复核',
      passed: sourceOk,
      score: sourceOk ? 96 : selectedAudit.selectedCount ? Math.round((selectedAudit.auditedCount / selectedAudit.selectedCount) * 88) : 36,
      proof: sourceOk
        ? `${selectedAudit.auditedCount}/${selectedAudit.selectedCount} 位入选角色已有来源级人工复核。`
        : selectedAudit.selectedCount
          ? `仍缺 ${selectedAudit.missingNames.slice(0, 4).join(' / ')} 等来源复核，当前 ${selectedAudit.auditedCount}/${selectedAudit.selectedCount}。`
          : '尚未产生本轮入选团队，无法做入选角色来源审计。',
      requiredProof: '本轮入选每个角色都必须有通过记录：SKILL.md、EVIDENCE.md、六路来源索引、2 道验证题、不确定边界、无授权暗示。',
      evidenceRefs: selectedAudit.evidenceRefs,
      hardGate: false,
    }),
    check({
      id: 'user-validation',
      label: '真实小白用户验证',
      passed: userOk,
      score: userOk ? 95 : input.userValidationLedger.stats.totalParticipants ? 64 : 42,
      proof: `${input.userValidationLedger.stats.passedParticipants}/${input.userValidationLedger.stats.totalParticipants} 人通过，状态 ${input.userValidationLedger.stats.certificationStatus}。`,
      requiredProof: '5-8 人稳审：至少 5 名未参与设计的外部真人完成记录，至少 4 人能在 3 分钟内独立完成输入、看懂推荐、找到下一步、说出取舍、复制或导出；必须保留观察员、复述、导出引用、不满意点和返修状态。',
      evidenceRefs: input.userValidationLedger.records.slice(0, 6).map((record) => record.id),
    }),
    check({
      id: 'artifact-review',
      label: '人工审美与产物验收',
      passed: artifactOk,
      score: artifactOk
        ? Math.max(95, input.artifactReviewLedger.stats.averageScore)
        : input.artifactReviewLedger.stats.totalReviews
          ? Math.min(89, input.artifactReviewLedger.stats.averageScore)
          : 42,
      proof: `${input.artifactReviewLedger.stats.passedReviews}/${input.artifactReviewLedger.stats.totalReviews} 名人工审稿人通过，平均 ${input.artifactReviewLedger.stats.averageScore}；分项 prd=${input.artifactReviewLedger.stats.prdAverageScore}, theater=${input.artifactReviewLedger.stats.theaterAverageScore}, blueprint=${input.artifactReviewLedger.stats.baoyuAverageScore}, trust=${input.artifactReviewLedger.stats.trustAverageScore}；bossFinal=${input.artifactReviewLedger.stats.bossFinalPassed ? 'yes' : 'no'}，peerReview=${input.artifactReviewLedger.stats.peerReviewPassed ? 'yes' : 'no'}，未闭环返修 ${input.artifactReviewLedger.stats.unresolvedRepairs}。`,
      requiredProof: '至少 2 名非模型人工审稿人，其中 Boss 终审必须通过，且至少 1 名非 Boss 人工审稿通过；PRD、辩论剧场、技术蓝图、整体可信度都要 90+，记录不满意点、返修状态、导出引用，并明确值得用于真实规划。',
      evidenceRefs: input.artifactReviewLedger.records.slice(0, 6).map((record) => record.id),
    }),
    check({
      id: 'runtime-calibration',
      label: '95 运行校准协议',
      passed: calibrationOk,
      score: calibrationOk ? Math.max(95, input.runtimeCalibrationPlan.score) : input.runtimeCalibrationPlan.score,
      proof: `${input.runtimeCalibrationPlan.label}：${input.runtimeCalibrationPlan.summary}`,
      requiredProof: '运行校准状态必须为 candidate-95；否则只能说还在校准或等待真实验证。',
      evidenceRefs: input.runtimeCalibrationPlan.checks.map((item) => item.id),
    }),
  ]

  const hardFailures = checks.filter((item) => item.hardGate && item.status !== 'pass')
  const rawScore = weightedScore(checks)
  const score = hardFailures.length ? Math.min(94, rawScore) : Math.max(95, rawScore)
  const humanProofMissing = hardFailures.some((item) =>
    item.id === 'user-validation' ||
    item.id === 'artifact-review' ||
    item.id === 'selected-source-audit',
  )
  const status: Council95CertificationStatus =
    hardFailures.length === 0 && score >= 95
      ? 'candidate-95'
      : humanProofMissing
        ? 'needs-human-proof'
        : 'blocked'
  const label: Record<Council95CertificationStatus, string> = {
    blocked: '禁止声称 95：核心运行证据不足',
    'needs-human-proof': '接近候选，但缺人工/用户外部证据',
    'candidate-95': '95 分代表性候选',
  }
  const blockers = hardFailures.map((item) => `${item.label}: ${item.requiredProof}`)
  const nextProof = unique(
    [
      ...hardFailures.map((item) => item.requiredProof),
      status === 'candidate-95' ? '进入人工验收：复看导出、截图、用户记录和来源索引，确认没有伪证。' : '',
    ],
    8,
  )

  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    score,
    targetScore: 95,
    status,
    label: label[status],
    claimAllowed: status === 'candidate-95',
    claimText: status === 'candidate-95'
      ? '允许称为 95 分代表性候选，但仍保留人工终审。'
      : '禁止声称已经达到 95 分；只能说明当前证据分和缺口。',
    hardGatePassed: hardFailures.length === 0,
    checks,
    blockers,
    nextProof,
    proofChain: [
      `selectedPersonas=${selectedIds.length}`,
      `sourceAudit=${selectedAudit.auditedCount}/${selectedAudit.selectedCount}`,
      `nuwaManual=${input.nuwaEvidenceRegistry.manualSourceAuditedCount}/${input.nuwaEvidenceRegistry.personaCount}`,
      `runtime=${runtime ? `${runtime.runId}/${runtime.decisionSource}/${runtime.durationMs}ms/${runtime.deepRunCertification.status}` : 'missing'}`,
      `quality=${input.qualityGate ? `${input.qualityGate.score}/${input.qualityGate.finalGateStatus}` : runtime ? `${runtime.qualityScore}/${runtime.qualityStatus}/history-runtime` : 'missing'}`,
      `excellence=${input.excellenceAudit ? input.excellenceAudit.score : input.historicalExcellenceScore ? `${input.historicalExcellenceScore}/history` : 'missing'}`,
      `userValidation=${input.userValidationLedger.stats.passedParticipants}/${input.userValidationLedger.stats.totalParticipants}/${input.userValidationLedger.stats.certificationStatus}`,
      `artifactReview=${input.artifactReviewLedger.stats.passedReviews}/${input.artifactReviewLedger.stats.totalReviews}/${input.artifactReviewLedger.stats.certificationStatus}/boss=${input.artifactReviewLedger.stats.bossFinalPassed ? 'yes' : 'no'}/peer=${input.artifactReviewLedger.stats.peerReviewPassed ? 'yes' : 'no'}`,
      `calibration=${input.runtimeCalibrationPlan.score}/${input.runtimeCalibrationPlan.status}`,
    ],
  }
}

export function renderCouncil95CertificationMarkdown(gate: Council95CertificationGate): string {
  return [
    '## 95 真实认证闸门',
    '',
    `- score: ${gate.score} / ${gate.targetScore}`,
    `- status: ${gate.status}`,
    `- label: ${gate.label}`,
    `- claimAllowed: ${gate.claimAllowed ? 'yes' : 'no'}`,
    `- claimText: ${gate.claimText}`,
    '',
    '### 硬证据检查',
    ...gate.checks.map((item) =>
      `- ${item.status}: ${item.label}｜hard=${item.hardGate ? 'yes' : 'no'}｜score=${item.score}｜proof=${item.proof}｜required=${item.requiredProof}`,
    ),
    '',
    '### 阻塞项',
    ...(gate.blockers.length ? gate.blockers.map((item) => `- ${item}`) : ['- none']),
    '',
    '### 下一步补证',
    ...gate.nextProof.map((item) => `- ${item}`),
    '',
    '### 证据链',
    ...gate.proofChain.map((item) => `- ${item}`),
  ].join('\n')
}
