import type { CouncilExcellenceAudit } from './excellence-audit'
import type { CouncilRuntimeEvidenceLedger } from './runtime-evidence'
import type { CouncilRuntimeHistoryLedger } from './runtime-history'
import type { CouncilRuntimeWisdomContext } from './runtime-wisdom'
import type { CouncilUserValidationLedger } from './user-validation'

export type CouncilRuntimeCalibrationStatus =
  | 'needs-baseline'
  | 'needs-deep-run'
  | 'needs-user-validation'
  | 'candidate-95'

export type CouncilRuntimeCalibrationCheckStatus = 'pass' | 'warn' | 'fail'

export interface CouncilRuntimeCalibrationCheck {
  id: string
  label: string
  status: CouncilRuntimeCalibrationCheckStatus
  score: number
  proof: string
  requiredAction: string
}

export interface CouncilRuntimeCalibrationPlan {
  score: number
  status: CouncilRuntimeCalibrationStatus
  label: string
  summary: string
  checks: CouncilRuntimeCalibrationCheck[]
  nextDeepRunProtocol: string[]
  userValidationProtocol: string[]
  stopConditions: string[]
  modelRunInputHints: string[]
  promptFragment: string
}

interface CouncilRuntimeCalibrationInput {
  history: CouncilRuntimeHistoryLedger
  wisdom: CouncilRuntimeWisdomContext
  userValidation?: CouncilUserValidationLedger
  runtimeEvidence?: CouncilRuntimeEvidenceLedger
  excellenceAudit?: CouncilExcellenceAudit
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
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

function check(
  id: string,
  label: string,
  score: number,
  proof: string,
  requiredAction: string,
): CouncilRuntimeCalibrationCheck {
  const nextScore = clampScore(score)
  return {
    id,
    label,
    status: nextScore >= 90 ? 'pass' : nextScore >= 70 ? 'warn' : 'fail',
    score: nextScore,
    proof,
    requiredAction,
  }
}

function weightedAverage(checks: CouncilRuntimeCalibrationCheck[]): number {
  if (!checks.length) return 0
  return clampScore(checks.reduce((sum, item) => sum + item.score, 0) / checks.length)
}

function latestEvidence(input: CouncilRuntimeCalibrationInput): CouncilRuntimeEvidenceLedger | undefined {
  return input.runtimeEvidence || input.history.records[0]?.ledger
}

function hasVerifiedDeepModelTrace(ledger?: CouncilRuntimeEvidenceLedger): boolean {
  if (!ledger) return false
  return ledger.decisionSource === 'deep-model' && Boolean(ledger.deepRunCertification.modelJudgeTraceVerified)
}

function hasVerifiedStageTrace(ledger?: CouncilRuntimeEvidenceLedger): boolean {
  if (!ledger) return false
  return Boolean(ledger.deepRunCertification.stageTraceVerified ?? ledger.deepRunCertification.fullStageTrace)
}

function statusFor(input: {
  score: number
  provedRuns: number
  hasUserValidation: boolean
  currentRunProved: boolean
}): CouncilRuntimeCalibrationStatus {
  if (input.provedRuns === 0 && !input.currentRunProved) return 'needs-baseline'
  if (input.currentRunProved && !input.hasUserValidation) return 'needs-user-validation'
  if (input.score < 90) return 'needs-deep-run'
  if (!input.hasUserValidation) return 'needs-user-validation'
  return 'candidate-95'
}

export function buildCouncilRuntimeCalibrationPlan(input: CouncilRuntimeCalibrationInput): CouncilRuntimeCalibrationPlan {
  const latest = latestEvidence(input)
  const history = input.history
  const currentRunProved = latest?.deepRunCertification.status === 'proved' && hasVerifiedDeepModelTrace(latest) && hasVerifiedStageTrace(latest)
  const provedHistoryRecords = history.records.filter((record) =>
    record.deepRunStatus === 'proved' &&
    hasVerifiedDeepModelTrace(record.ledger) &&
    hasVerifiedStageTrace(record.ledger),
  )
  const hasDeepSource = hasVerifiedDeepModelTrace(latest) || provedHistoryRecords.length > 0
  const fullTrace = hasVerifiedStageTrace(latest) || provedHistoryRecords.length > 0
  const longEnough = (latest?.durationMs || 0) >= 120000 || provedHistoryRecords.some((record) => record.durationMs >= 120000)
  const qualityScore = Math.max(latest?.qualityScore || 0, history.stats.bestQualityScore, input.excellenceAudit?.score || 0)
  const enoughQuality = qualityScore >= 90
  const hasUserValidation = input.userValidation?.stats.certificationStatus === 'passed'
  const userValidationProof = input.userValidation
    ? `${input.userValidation.stats.passedParticipants}/${input.userValidation.stats.totalParticipants} 人通过，状态 ${input.userValidation.stats.certificationStatus}。`
    : '尚未接入真实小白用户验证账本。'

  const checks = [
    check(
      'deep-model-source',
      '真实模型裁判链路',
      hasDeepSource ? 94 : history.stats.fallbackRuns > 0 ? 48 : 62,
      hasDeepSource
        ? '最近或历史中已有可核验的 deep-model model-judge trace。'
        : history.stats.fallbackRuns > 0
          ? `历史中有 ${history.stats.fallbackRuns} 次 fallback。`
          : '还没有可核验的 deep-model model-judge trace。',
      '下一轮必须同时保存 decisionSource=deep-model 和 model-judge 阶段 deep-model 完成 trace；失败时保留 fallback 标记，不得混称。',
    ),
    check(
      'stage-trace',
      '六阶段匹配 trace',
      fullTrace ? 94 : 58,
      fullTrace ? '已满足或历史 proved run 已满足有序 6 阶段 trace。' : `当前必要阶段未完整通过，原始 trace=${latest?.stageTrace.length || 0}。`,
      '下一轮必须按顺序完整留下问题画像、Creative DNA、候选池、模型裁判、协作矩阵、推荐成型。',
    ),
    check(
      'deep-duration',
      '2-5 分钟深度长跑',
      longEnough ? 92 : latest ? Math.min(74, Math.round((latest.durationMs / 120000) * 92)) : 50,
      longEnough ? '已满足 120s 深度运行阈值。' : `最近运行 ${Math.round((latest?.durationMs || 0) / 1000)}s，未达到 120s。`,
      '下一次真实验收必须允许 2-5 分钟等待；短跑只能叫预演。',
    ),
    check(
      'quality-readiness',
      '90+ 质量闸门',
      enoughQuality ? Math.min(96, qualityScore) : Math.max(52, qualityScore),
      enoughQuality ? `已有 quality/excellence >= 90：${qualityScore}。` : `最高质量证据 ${qualityScore}，未过 90。`,
      'PRD 未达到 90+ approved 时必须进入返修链，不能假装神作。',
    ),
    check(
      'user-validation',
      '真实小白用户验证',
      hasUserValidation ? 95 : 42,
      hasUserValidation ? `验证账本已达标：${userValidationProof}` : `仍缺 5-8 人稳审真实小白用户验证：${userValidationProof}`,
      '至少 5 名外部真人按小白执行模式完成一次输入、理解下一步、复制或导出结果；4/5 通过才可冲 95。',
    ),
  ]

  const score = weightedAverage(checks)
  const status = statusFor({
    score,
    provedRuns: history.stats.provedDeepRuns,
    hasUserValidation,
    currentRunProved,
  })
  const label: Record<CouncilRuntimeCalibrationStatus, string> = {
    'needs-baseline': '需要第一条真实深度基线',
    'needs-deep-run': '需要深度长跑复验',
    'needs-user-validation': '需要真实小白用户验证',
    'candidate-95': '95 分候选可进入人工验收',
  }
  const nextDeepRunProtocol = unique(
    [
      '使用真实问题，不用样例题；先展示 CouncilMatchGate，不自动开会。',
      '等待模型裁判返回 deep-model 编队；若失败，记录 local-fallback 并停止 95 认证。',
      '激活队伍后完整跑六阶段博弈：追问、独立主张、发散、冲突质询、主持裁决、共识成稿。',
      '质量闸门低于 90 时允许最多 2 轮返修；仍不通过就明确标记未通过。',
      '导出 Markdown/HTML 后，确认包含 PRD、共识追溯、剧场、关系图、裁决账本、证据账本、运行智慧和 Nuwa 证据。',
    ],
    8,
  )
  const userValidationProtocol = unique(
    [
      '找 5-8 个没有参与设计的外部真人小白用户，只给一句真实任务，不解释系统内部机制。',
      '记录他们是否能在 3 分钟内输入问题、看懂推荐编队理由、找到下一步行动。',
      '记录他们是否能说出至少 1 个被裁掉的方案和 1 个保留理由。',
      '记录他们是否能复制 PRD 或导出共识追溯简报。',
      '每条记录必须包含观察员、参与者复述、下一步证据、导出物引用、不满意点、是否返修和最终是否值得真实使用。',
      '至少 5 人完成记录且至少 4 人完成以上动作，才把用户验证视为通过。',
    ],
    8,
  )
  const stopConditions = unique(
    [
      '模型裁判失败并进入 local-fallback：停止 95 认证，只保留 fallback 结果。',
      '运行时长低于 120s：停止“深度长跑”称号，只能标记为预演。',
      '质量闸门返修两轮仍未 approved：停止交付神作宣称，输出未通过原因。',
      '技术蓝图缺少前端、后端、API、数据、部署或测试可实施性：停止大师级 PRD 通过。',
      '用户验证少于 5 名外部真人、4/5 未通过、缺观察证据或存在未闭环返修：停止 95 候选。',
    ],
    8,
  )
  const modelRunInputHints = unique(
    [
      input.wisdom.summary,
      ...input.wisdom.nextRunConstraints.slice(0, 4),
      ...input.wisdom.avoidRepeating.slice(0, 3),
    ],
    8,
  )
  const summary = `${label[status]}。当前校准分 ${score}/100；可核验证明长跑=${provedHistoryRecords.length}/${history.stats.provedDeepRuns}，fallback=${history.stats.fallbackRuns}，bestQuality=${history.stats.bestQualityScore}。`
  const promptFragment = [
    '## 95 真实长跑评测协议',
    summary,
    '',
    '### 下一次深度运行协议',
    ...nextDeepRunProtocol.map((item) => `- ${item}`),
    '',
    '### 停止条件',
    ...stopConditions.map((item) => `- ${item}`),
    '',
    '### 用户验证',
    ...userValidationProtocol.map((item) => `- ${item}`),
  ].join('\n')

  return {
    score,
    status,
    label: label[status],
    summary,
    checks,
    nextDeepRunProtocol,
    userValidationProtocol,
    stopConditions,
    modelRunInputHints,
    promptFragment,
  }
}

export function renderCouncilRuntimeCalibrationMarkdown(plan: CouncilRuntimeCalibrationPlan): string {
  return [
    '## 95 真实长跑评测协议',
    '',
    `- score: ${plan.score}`,
    `- status: ${plan.status}`,
    `- label: ${plan.label}`,
    `- summary: ${plan.summary}`,
    '',
    '### 校准检查',
    ...plan.checks.map((item) => `- ${item.status}: ${item.label}｜${item.score}｜${item.proof}｜${item.requiredAction}`),
    '',
    '### 下一次深度运行协议',
    ...plan.nextDeepRunProtocol.map((item) => `- ${item}`),
    '',
    '### 用户验证协议',
    ...plan.userValidationProtocol.map((item) => `- ${item}`),
    '',
    '### 停止条件',
    ...plan.stopConditions.map((item) => `- ${item}`),
  ].join('\n')
}
