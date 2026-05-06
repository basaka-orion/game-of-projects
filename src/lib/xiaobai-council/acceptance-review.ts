import type { CouncilBaoyuVisualPlan } from './baoyu'
import type { CouncilDebateMap, CouncilDebateScene, CouncilVerdictLedger } from './debate-theater'
import type { CouncilQualityGate } from './quality-gate'
import type { CouncilRuntimeCalibrationPlan } from './runtime-calibration'
import type { CouncilRuntimeEvidenceLedger } from './runtime-evidence'
import type { CouncilArtifactReviewLedger } from './artifact-review'
import type { CouncilUserValidationLedger } from './user-validation'

export type CouncilAcceptanceReviewStatus =
  | 'needs-deep-run'
  | 'needs-revision'
  | 'needs-human-validation'
  | 'candidate-95'

export type CouncilAcceptanceGateStatus = 'pass' | 'warn' | 'fail'

export interface CouncilAcceptanceGate {
  id: string
  label: string
  status: CouncilAcceptanceGateStatus
  score: number
  hardGate: boolean
  proof: string
  requiredProof: string
}

export interface CouncilAcceptanceReview {
  generatedAt: string
  status: CouncilAcceptanceReviewStatus
  label: string
  score: number
  claimAllowed: boolean
  summary: string
  gates: CouncilAcceptanceGate[]
  nextActions: string[]
  deepRunProtocol: string[]
  humanValidationProtocol: string[]
  proofChain: string[]
}

export interface CouncilAcceptanceReviewInput {
  runtimeEvidence?: CouncilRuntimeEvidenceLedger | null
  qualityGate?: CouncilQualityGate | null
  debateScenes: CouncilDebateScene[]
  debateMap?: CouncilDebateMap | null
  verdictLedger?: CouncilVerdictLedger | null
  baoyuVisualPlans: CouncilBaoyuVisualPlan[]
  runtimeCalibrationPlan: CouncilRuntimeCalibrationPlan
  userValidationLedger: CouncilUserValidationLedger
  artifactReviewLedger: CouncilArtifactReviewLedger
  generatedAt?: string
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function gate(input: {
  id: string
  label: string
  passed: boolean
  score: number
  proof: string
  requiredProof: string
  hardGate?: boolean
  partial?: boolean
}): CouncilAcceptanceGate {
  const score = clampScore(input.score)
  return {
    id: input.id,
    label: input.label,
    status: input.passed ? 'pass' : input.partial || score >= 70 ? 'warn' : 'fail',
    score,
    hardGate: input.hardGate ?? true,
    proof: input.proof,
    requiredProof: input.requiredProof,
  }
}

function weightedScore(gates: CouncilAcceptanceGate[]): number {
  if (!gates.length) return 0
  const hardWeight = 1.22
  const total = gates.reduce((sum, item) => sum + (item.hardGate ? hardWeight : 1), 0)
  return clampScore(gates.reduce((sum, item) => sum + item.score * (item.hardGate ? hardWeight : 1), 0) / total)
}

function countVerdictItems(ledger?: CouncilVerdictLedger | null): number {
  if (!ledger) return 0
  return (
    ledger.kept.length +
    ledger.cut.length +
    ledger.revised.length +
    ledger.evidenceGaps.length +
    ledger.prdImpacts.length +
    ledger.openDisagreements.length
  )
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

export function buildCouncilAcceptanceReview(input: CouncilAcceptanceReviewInput): CouncilAcceptanceReview {
  const runtime = input.runtimeEvidence
  const quality = input.qualityGate
  const relationCount = input.debateMap?.edges.length || 0
  const verdictCount = countVerdictItems(input.verdictLedger)
  const targetDurationOk = Boolean(runtime && runtime.durationMs >= 120000 && runtime.durationMs <= 360000)
  const deepRunPassed = Boolean(runtime?.deepRunCertification.status === 'proved' && targetDurationOk)
  const qualityPassed = Boolean(
    quality &&
      quality.finalGateStatus === 'approved' &&
      quality.score >= 90 &&
      quality.prdCompletenessScore >= 90 &&
      quality.launchReadinessScore >= 90,
  )
  const theaterPassed = input.debateScenes.length >= 18 && relationCount >= 12 && verdictCount >= 8 &&
    input.debateScenes.filter((scene) => scene.sourceMessageIds.length > 0).length >= 18
  const userPassed = input.userValidationLedger.stats.certificationStatus === 'passed'
  const artifactPassed = input.artifactReviewLedger.stats.certificationStatus === 'passed'

  const gates: CouncilAcceptanceGate[] = [
    gate({
      id: 'deep-run-revalidation',
      label: '2-5 分钟新版本深度长跑复验',
      passed: deepRunPassed,
      score: deepRunPassed
        ? 96
        : runtime
          ? runtime.deepRunCertification.status === 'proved'
            ? 86
            : Math.min(84, Math.round((runtime.durationMs / 120000) * 78))
          : 45,
      proof: runtime
        ? `${runtime.runId}｜${Math.round(runtime.durationMs / 1000)}s｜${runtime.deepRunCertification.status}｜${runtime.decisionSource}｜target2to5=${targetDurationOk ? 'yes' : 'no'}`
        : '尚未生成本轮真实运行证据账本。',
      requiredProof: '必须完成 120-360s deep-model 裁判、完整阶段 trace、可信时间线、足量剧场和 90+ 质量闸门；短跑叫预演，超时要继续优化并行与模型预算。',
    }),
    gate({
      id: 'prd-quality-revalidation',
      label: 'PRD 可开工质量复验',
      passed: qualityPassed,
      score: quality ? Math.round((quality.score + quality.prdCompletenessScore + quality.launchReadinessScore) / 3) : 45,
      proof: quality
        ? `quality=${quality.score}/${quality.finalGateStatus}，prd=${quality.prdCompletenessScore}，launch=${quality.launchReadinessScore}。`
        : '尚未生成 CouncilQualityGate。',
      requiredProof: '质量、PRD 完整度、上线准备度都必须 90+ approved；失败时必须触发返修链。',
    }),
    gate({
      id: 'debate-theater-trace',
      label: '剧场/关系/裁决可追溯复验',
      passed: theaterPassed,
      score: theaterPassed ? 95 : Math.min(88, 48 + input.debateScenes.length * 2 + relationCount + verdictCount),
      proof: `scenes=${input.debateScenes.length}，relations=${relationCount}，ledgerItems=${verdictCount}，sourcedScenes=${input.debateScenes.filter((scene) => scene.sourceMessageIds.length > 0).length}。`,
      requiredProof: '至少 18 幕、12 条关系边、8 条裁决账本，并且关键结论能回到来源消息。',
    }),
    gate({
      id: 'human-aesthetic-review',
      label: '人工审美与产物验收',
      passed: artifactPassed,
      score: artifactPassed ? Math.max(95, input.artifactReviewLedger.stats.averageScore) : input.artifactReviewLedger.stats.totalReviews ? input.artifactReviewLedger.stats.averageScore : 42,
      proof: `${input.artifactReviewLedger.stats.passedReviews}/${input.artifactReviewLedger.stats.totalReviews} 名人工审稿人通过，平均 ${input.artifactReviewLedger.stats.averageScore}；分项 prd=${input.artifactReviewLedger.stats.prdAverageScore ?? 0}, theater=${input.artifactReviewLedger.stats.theaterAverageScore ?? 0}, blueprint=${input.artifactReviewLedger.stats.baoyuAverageScore ?? 0}, trust=${input.artifactReviewLedger.stats.trustAverageScore ?? 0}；bossFinal=${input.artifactReviewLedger.stats.bossFinalPassed ? 'yes' : 'no'}，peerReview=${input.artifactReviewLedger.stats.peerReviewPassed ? 'yes' : 'no'}，未闭环返修 ${input.artifactReviewLedger.stats.unresolvedRepairs ?? 0}。`,
      requiredProof: '至少 2 名非模型人工审稿人，其中 Boss 终审必须通过，且至少 1 名非 Boss 人工审稿通过；PRD 可拆任务、剧场可追溯、技术蓝图可实施、整体可信、无假进度；必须记录不满意点、返修状态、导出引用和是否愿意用于真实规划。',
    }),
    gate({
      id: 'real-user-validation',
      label: '真实小白用户验证',
      passed: userPassed,
      score: userPassed ? 95 : input.userValidationLedger.stats.totalParticipants ? 64 : 42,
      proof: `${input.userValidationLedger.stats.passedParticipants}/${input.userValidationLedger.stats.totalParticipants} 人通过，记录 ${input.userValidationLedger.stats.totalRecords ?? input.userValidationLedger.records.length} 条，状态 ${input.userValidationLedger.stats.certificationStatus}，未闭环返修 ${input.userValidationLedger.stats.unresolvedRepairs ?? 0}。`,
      requiredProof: '5-8 人稳审：至少 5 名未参与设计的外部真人完成记录，至少 4 人能在 3 分钟内独立完成输入、理解编队、找到下一步、说明取舍并导出；必须保留观察员、复述、导出引用、不满意点和返修状态。',
    }),
  ]

  const hardFailures = gates.filter((item) => item.hardGate && item.status !== 'pass')
  const rawScore = weightedScore(gates)
  const score = hardFailures.length ? Math.min(94, rawScore) : Math.max(95, rawScore)
  const status: CouncilAcceptanceReviewStatus =
    hardFailures.length === 0 && score >= 95
      ? 'candidate-95'
      : hardFailures.some((item) => item.id === 'deep-run-revalidation')
        ? 'needs-deep-run'
        : hardFailures.some((item) => item.id === 'human-aesthetic-review' || item.id === 'real-user-validation')
          ? 'needs-human-validation'
          : 'needs-revision'
  const label: Record<CouncilAcceptanceReviewStatus, string> = {
    'needs-deep-run': '仍缺完整深度长跑复验',
    'needs-revision': '仍缺 PRD/剧场/技术蓝图返修',
    'needs-human-validation': '机器证据接近，但缺真人与审美验收',
    'candidate-95': '95 候选：可进入最终人工终审',
  }
  const nextActions = unique(
    [
      ...hardFailures.map((item) => item.requiredProof),
      ...input.runtimeCalibrationPlan.stopConditions.slice(0, 3),
      status === 'candidate-95' ? '最终人工终审：复看导出文件、截图、用户记录、来源索引和 Nuwa 证据，确认没有伪证。' : '',
    ],
    8,
  )

  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    status,
    label: label[status],
    score,
    claimAllowed: status === 'candidate-95',
    summary: `${label[status]}。当前总验收 ${score}/100；系统不能把缺少真人验证或审美验收的产物伪装成 95。`,
    gates,
    nextActions,
    deepRunProtocol: input.runtimeCalibrationPlan.nextDeepRunProtocol,
    humanValidationProtocol: [
      ...input.runtimeCalibrationPlan.userValidationProtocol,
      '真实小白验证必须记录：外部真人、观察员、独立任务脚本、参与者复述、下一步证据、保留/裁掉理由、导出引用、不满意点和返修状态。',
      '人工审美验收必须逐项确认：PRD 可拆任务、剧场可追溯、技术蓝图可实施、整体可信、UI 风格专业、没有假进度、愿意用于真实规划。',
    ],
    proofChain: [
      `runtime=${runtime ? `${runtime.runId}/${runtime.durationMs}ms/${runtime.deepRunCertification.status}` : 'missing'}`,
      `quality=${quality ? `${quality.score}/${quality.finalGateStatus}/${quality.prdCompletenessScore}/${quality.launchReadinessScore}` : 'missing'}`,
      `theater=${input.debateScenes.length}/${relationCount}/${verdictCount}`,
      `blueprint=${input.artifactReviewLedger.stats.baoyuAverageScore ?? 0}`,
      `artifactReview=${input.artifactReviewLedger.stats.passedReviews}/${input.artifactReviewLedger.stats.totalReviews}/${input.artifactReviewLedger.stats.certificationStatus}/boss=${input.artifactReviewLedger.stats.bossFinalPassed ? 'yes' : 'no'}/peer=${input.artifactReviewLedger.stats.peerReviewPassed ? 'yes' : 'no'}`,
      `userValidation=${input.userValidationLedger.stats.passedParticipants}/${input.userValidationLedger.stats.totalParticipants}/${input.userValidationLedger.stats.certificationStatus}`,
      `calibration=${input.runtimeCalibrationPlan.score}/${input.runtimeCalibrationPlan.status}`,
    ],
  }
}

export function renderCouncilAcceptanceReviewMarkdown(review: CouncilAcceptanceReview): string {
  return [
    '## 95 验收闭环总闸门',
    '',
    `- score: ${review.score}`,
    `- status: ${review.status}`,
    `- label: ${review.label}`,
    `- claimAllowed: ${review.claimAllowed ? 'yes' : 'no'}`,
    `- summary: ${review.summary}`,
    '',
    '### 验收闸门',
    ...review.gates.map((item) =>
      `- ${item.status}: ${item.label}｜hard=${item.hardGate ? 'yes' : 'no'}｜score=${item.score}｜proof=${item.proof}｜required=${item.requiredProof}`,
    ),
    '',
    '### 下一步补证/返修',
    ...review.nextActions.map((item) => `- ${item}`),
    '',
    '### 深度长跑协议',
    ...review.deepRunProtocol.map((item) => `- ${item}`),
    '',
    '### 真人与审美验收协议',
    ...review.humanValidationProtocol.map((item) => `- ${item}`),
    '',
    '### 证据链',
    ...review.proofChain.map((item) => `- ${item}`),
  ].join('\n')
}
