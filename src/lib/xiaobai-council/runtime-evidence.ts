import type { CouncilActionTask } from './action-pack'
import type { CouncilBaoyuVisualPlan } from './baoyu'
import type { CouncilDebateMap, CouncilDebateScene, CouncilVerdictLedger } from './debate-theater'
import type { CouncilInternetResearchPack } from './internet-research'
import type { CouncilQualityGate } from './quality-gate'
import type { CouncilMatchDecisionSource, CouncilMatchPhaseId, CouncilMatchProgressEvent, CouncilSelection } from './selector'
import type { TeamSession } from '../teams/types'

export type CouncilRuntimeEvidenceStatus = 'proved' | 'partial' | 'missing'

export interface CouncilRuntimeEvidenceItem {
  id: string
  label: string
  status: CouncilRuntimeEvidenceStatus
  detail: string
}

export interface CouncilRuntimeReplayFrame {
  id: string
  atMs: number
  source: 'match-gate' | 'internet-research' | 'team-session' | 'debate-theater' | 'quality-gate' | 'action-pack' | 'baoyu' | 'export'
  title: string
  status: CouncilRuntimeEvidenceStatus
  summary: string
  evidenceRefs: string[]
}

export interface CouncilDeepRunCertification {
  status: CouncilRuntimeEvidenceStatus
  label: string
  requiredDurationMs: number
  actualDurationMs: number
  modelJudgeUsed: boolean
  modelJudgeTraceVerified: boolean
  fullStageTrace: boolean
  stageTraceVerified: boolean
  temporalTraceVerified: boolean
  enoughDebate: boolean
  enoughQuality: boolean
  proofSummary: string
  blockers: string[]
}

export interface CouncilRuntimeEvidenceLedger {
  runId: string
  startedAt: string
  completedAt: string
  durationMs: number
  decisionSource: CouncilMatchDecisionSource
  modelJudgeUsed: boolean
  fallbackUsed: boolean
  stageTrace: CouncilMatchProgressEvent[]
  messageCount: number
  briefCount: number
  sceneCount: number
  relationCount: number
  verdictLedgerCount: number
  qualityStatus: string
  qualityScore: number
  actionTaskCount: number
  baoyuPlanCount: number
  localSvgCardCount: number
  internetResearchRequired: boolean
  internetResearchGrounded: boolean
  internetSourceCount: number
  internetQueries: string[]
  deepRunCertification: CouncilDeepRunCertification
  replayFrames: CouncilRuntimeReplayFrame[]
  evidenceItems: CouncilRuntimeEvidenceItem[]
  exportProof: string[]
  nextProofNeeded: string[]
}

interface CouncilRuntimeEvidenceInput {
  runStartedAt: number
  runCompletedAt: number
  selection: CouncilSelection
  session: TeamSession
  debateScenes: CouncilDebateScene[]
  debateMap: CouncilDebateMap
  verdictLedger: CouncilVerdictLedger
  qualityGate: CouncilQualityGate
  actionTasks: CouncilActionTask[]
  baoyuVisualPlans: CouncilBaoyuVisualPlan[]
  internetResearch?: CouncilInternetResearchPack | null
}

const REQUIRED_MATCH_PHASES: CouncilMatchPhaseId[] = [
  'problem-profile',
  'creative-dna',
  'candidate-pool',
  'model-judge',
  'collaboration-matrix',
  'recommendation',
]

function observedRunStartedAt(runStartedAt: number, stageTrace: CouncilMatchProgressEvent[]): number {
  const starts = stageTrace
    .map((event) => event.startedAt)
    .filter((value) => Number.isFinite(value) && value >= 0)
  return Math.min(runStartedAt, ...starts)
}

function verifyStageTrace(stageTrace: CouncilMatchProgressEvent[], runStartedAt: number, runCompletedAt: number): {
  completedPhaseCount: number
  modelJudgeTraceVerified: boolean
  stageTraceVerified: boolean
  temporalTraceVerified: boolean
} {
  const completedRequiredIndexes = REQUIRED_MATCH_PHASES.map((phaseId) =>
    stageTrace.findIndex((event) => event.phaseId === phaseId && event.status === 'completed'),
  )
  const completedPhaseCount = completedRequiredIndexes.filter((index) => index >= 0).length
  const allRequiredCompleted = completedPhaseCount === REQUIRED_MATCH_PHASES.length
  const orderedRequired = completedRequiredIndexes.every((index, position) => {
    if (index < 0) return false
    const previous = completedRequiredIndexes[position - 1]
    return position === 0 || previous < index
  })
  const modelJudgeTraceVerified = stageTrace.some((event) =>
    event.phaseId === 'model-judge' &&
    event.status === 'completed' &&
    event.decisionSource === 'deep-model' &&
    event.detail.trim().length > 0,
  )
  const temporalTraceVerified = stageTrace.length > 0 && stageTrace.every((event) => {
    const endedAt = event.endedAt ?? event.startedAt
    return (
      Number.isFinite(event.startedAt) &&
      Number.isFinite(endedAt) &&
      event.startedAt >= runStartedAt &&
      endedAt >= event.startedAt &&
      endedAt <= runCompletedAt
    )
  })
  return {
    completedPhaseCount,
    modelJudgeTraceVerified,
    stageTraceVerified: allRequiredCompleted && orderedRequired,
    temporalTraceVerified,
  }
}

function countVerdictItems(ledger: CouncilVerdictLedger): number {
  return (
    ledger.kept.length +
    ledger.cut.length +
    ledger.revised.length +
    ledger.evidenceGaps.length +
    ledger.prdImpacts.length +
    ledger.openDisagreements.length
  )
}

function item(id: string, label: string, proved: boolean, detail: string, partial = false): CouncilRuntimeEvidenceItem {
  return {
    id,
    label,
    status: proved ? 'proved' : partial ? 'partial' : 'missing',
    detail,
  }
}

function frame(
  id: string,
  atMs: number,
  source: CouncilRuntimeReplayFrame['source'],
  title: string,
  status: CouncilRuntimeEvidenceStatus,
  summary: string,
  evidenceRefs: string[],
): CouncilRuntimeReplayFrame {
  return {
    id,
    atMs: Math.max(0, Math.round(atMs)),
    source,
    title,
    status,
    summary,
    evidenceRefs: evidenceRefs.filter(Boolean).slice(0, 8),
  }
}

function buildDeepRunCertification(input: {
  durationMs: number
  decisionSource: CouncilMatchDecisionSource
  completedPhaseCount: number
  modelJudgeTraceVerified: boolean
  stageTraceVerified: boolean
  temporalTraceVerified: boolean
  sceneCount: number
  relationCount: number
  qualityScore: number
  qualityStatus: string
}): CouncilDeepRunCertification {
  const requiredDurationMs = 120000
  const modelJudgeUsed = input.decisionSource === 'deep-model'
  const fullStageTrace = input.stageTraceVerified
  const enoughDebate = input.sceneCount >= 18 && input.relationCount >= 12
  const enoughQuality = input.qualityStatus === 'approved' && input.qualityScore >= 90
  const longEnough = input.durationMs >= requiredDurationMs
  const blockers = [
    modelJudgeUsed ? '' : '本轮 matchGate.decisionSource 不是 deep-model，不能认证为真实深度模型长跑。',
    input.modelJudgeTraceVerified ? '' : 'model-judge 阶段缺少已完成的 deep-model trace，不能只凭最终字段自称模型裁判。',
    fullStageTrace ? '' : `匹配阶段 trace 未完整按顺序完成：${input.completedPhaseCount}/6。`,
    input.temporalTraceVerified ? '' : '匹配 trace 时间线不可信：缺少时间戳、顺序异常或超出本轮运行窗口。',
    enoughDebate ? '' : `辩论剧场证据不足：scenes=${input.sceneCount}，relations=${input.relationCount}。`,
    enoughQuality ? '' : `质量闸门未达到 90+ approved：${input.qualityScore}/${input.qualityStatus}。`,
    longEnough ? '' : `运行时长 ${Math.round(input.durationMs / 1000)}s，未达到默认深度模式 120s。`,
  ].filter(Boolean)
  const status: CouncilRuntimeEvidenceStatus =
    blockers.length === 0
      ? 'proved'
      : blockers.length <= 2 && modelJudgeUsed && input.modelJudgeTraceVerified
        ? 'partial'
        : 'missing'
  return {
    status,
    label: status === 'proved' ? '2-5 分钟深度长跑已认证' : status === 'partial' ? '深度长跑部分成立' : '尚未完成深度长跑认证',
    requiredDurationMs,
    actualDurationMs: input.durationMs,
    modelJudgeUsed,
    modelJudgeTraceVerified: input.modelJudgeTraceVerified,
    fullStageTrace,
    stageTraceVerified: input.stageTraceVerified,
    temporalTraceVerified: input.temporalTraceVerified,
    enoughDebate,
    enoughQuality,
    proofSummary:
      status === 'proved'
        ? '本轮具备 deep-model 裁判 trace、完整有序匹配 trace、可信时间线、足量辩论剧场、90+ 质量闸门和 2 分钟以上运行时长。'
        : '本轮已生成运行证据，但仍不能声称完成 2-5 分钟真实深度长跑。',
    blockers,
  }
}

function buildReplayFrames(input: CouncilRuntimeEvidenceInput & {
  decisionSource: CouncilMatchDecisionSource
  durationMs: number
  messageCount: number
  briefCount: number
  relationCount: number
  verdictLedgerCount: number
  actionTaskCount: number
  localSvgCardCount: number
  internetResearch?: CouncilInternetResearchPack | null
}): CouncilRuntimeReplayFrame[] {
  const frames: CouncilRuntimeReplayFrame[] = []
  const stageTrace = input.selection.matchGate.stageTrace || []
  for (const event of stageTrace) {
    frames.push(
      frame(
        `match-${event.phaseId}-${event.endedAt || event.startedAt}`,
        (event.endedAt || event.startedAt) - input.runStartedAt,
        'match-gate',
        event.label,
        event.status === 'completed' ? 'proved' : event.status === 'failed' ? 'missing' : 'partial',
        event.detail,
        event.candidatePersonaIds,
      ),
    )
  }
  if (input.internetResearch?.attempted || input.internetResearch?.required) {
    frames.push(
      frame(
        'internet-research-summary',
        input.durationMs * 0.2,
        'internet-research',
        '联网证据包',
        input.internetResearch.grounded ? 'proved' : input.internetResearch.attempted ? 'partial' : 'missing',
        input.internetResearch.grounded
          ? `queries=${input.internetResearch.queries.length}，sources=${input.internetResearch.sources.length}，外部证据已注入会议。`
          : `status=${input.internetResearch.status}，${input.internetResearch.summary}`,
        input.internetResearch.sources.slice(0, 8).map((source) => source.url),
      ),
    )
  }
  frames.push(
    frame(
      'team-session-summary',
      input.durationMs * 0.48,
      'team-session',
      '六阶段团队会话',
      input.messageCount >= 8 ? 'proved' : input.messageCount > 0 ? 'partial' : 'missing',
      `session.messages=${input.messageCount}，brief=${input.briefCount}；只展示摘要，不暴露原始长日志或密钥。`,
      input.session.messages.slice(0, 8).map((message) => message.id),
    ),
  )
  frames.push(
    frame(
      'debate-theater-summary',
      input.durationMs * 0.62,
      'debate-theater',
      '辩论剧场与关系地图',
      input.debateScenes.length >= 12 && input.relationCount >= 12 ? 'proved' : input.debateScenes.length > 0 ? 'partial' : 'missing',
      `scenes=${input.debateScenes.length}，relations=${input.relationCount}，ledgerItems=${input.verdictLedgerCount}。`,
      input.debateScenes.slice(0, 8).map((scene) => scene.id),
    ),
  )
  frames.push(
    frame(
      'quality-gate-summary',
      input.durationMs * 0.76,
      'quality-gate',
      '质量闸门',
      input.qualityGate.finalGateStatus === 'approved' ? 'proved' : input.qualityGate.score >= 80 ? 'partial' : 'missing',
      `quality=${input.qualityGate.score}，status=${input.qualityGate.finalGateStatus || input.qualityGate.status}。`,
      input.qualityGate.checks.slice(0, 8).map((check) => check.id),
    ),
  )
  frames.push(
    frame(
      'action-pack-summary',
      input.durationMs * 0.86,
      'action-pack',
      '90 分行动包',
      input.actionTaskCount >= 10 ? 'proved' : input.actionTaskCount > 0 ? 'partial' : 'missing',
      `actionTasks=${input.actionTaskCount}，覆盖产品、设计、工程、测试、验证。`,
      input.actionTasks.slice(0, 8).map((task) => task.id),
    ),
  )
  frames.push(
    frame(
      'master-prd-export-summary',
      input.durationMs * 0.94,
      'export',
      '大师 PRD 与共识追溯',
      input.actionTaskCount >= 10 ? 'proved' : input.actionTaskCount > 0 ? 'partial' : 'missing',
      `actionTasks=${input.actionTaskCount}，quality=${input.qualityGate.score}，traceableScenes=${input.debateScenes.filter((scene) => scene.sourceMessageIds.length > 0).length}。`,
      [input.session.id, input.qualityGate.gateId],
    ),
  )
  frames.push(
    frame(
      'export-summary',
      input.durationMs,
      'export',
      '导出与复验线索',
      'proved',
      'Markdown/HTML 导出会包含 PRD、共识追溯、剧场、关系、裁决、质量、行动和运行证据。',
      [input.session.id, input.qualityGate.gateId],
    ),
  )
  return frames.sort((a, b) => a.atMs - b.atMs)
}

export function flattenCouncilActionTasks(groups: Array<{ tasks: CouncilActionTask[] }>): CouncilActionTask[] {
  return groups.flatMap((group) => group.tasks)
}

export function buildCouncilRuntimeEvidenceLedger(input: CouncilRuntimeEvidenceInput): CouncilRuntimeEvidenceLedger {
  const stageTrace = input.selection.matchGate.stageTrace || []
  const runStartedAt = observedRunStartedAt(input.runStartedAt, stageTrace)
  const traceVerification = verifyStageTrace(stageTrace, runStartedAt, input.runCompletedAt)
  const decisionSource = input.selection.matchGate.decisionSource
  const messageCount = input.session.messages.length
  const briefCount = input.session.messages.filter((message) => message.kind === 'brief').length
  const relationCount = input.debateMap.edges.length
  const verdictLedgerCount = countVerdictItems(input.verdictLedger)
  const localSvgCardCount = input.baoyuVisualPlans.filter((plan) => plan.textRenderMode === 'local-svg').length
  const actionTaskCount = input.actionTasks.length
  const internetResearch = input.internetResearch || null
  const internetResearchRequired = Boolean(internetResearch?.required)
  const internetResearchGrounded = Boolean(internetResearch?.grounded && internetResearch.sources.length > 0)
  const internetSourceCount = internetResearch?.sources.length || 0
  const internetQueries = internetResearch?.queries || []
  const durationMs = Math.max(0, input.runCompletedAt - runStartedAt)
  const qualityStatus = input.qualityGate.finalGateStatus || input.qualityGate.status
  const deepRunCertification = buildDeepRunCertification({
    durationMs,
    decisionSource,
    completedPhaseCount: traceVerification.completedPhaseCount,
    modelJudgeTraceVerified: traceVerification.modelJudgeTraceVerified,
    stageTraceVerified: traceVerification.stageTraceVerified,
    temporalTraceVerified: traceVerification.temporalTraceVerified,
    sceneCount: input.debateScenes.length,
    relationCount,
    qualityScore: input.qualityGate.score,
    qualityStatus,
  })
  const replayFrames = buildReplayFrames({
    ...input,
    decisionSource,
    durationMs,
    messageCount,
    briefCount,
    relationCount,
    verdictLedgerCount,
    actionTaskCount,
    localSvgCardCount,
    internetResearch,
  })
  const evidenceItems: CouncilRuntimeEvidenceItem[] = [
    item(
      'internet-research',
      '联网证据包',
      !internetResearchRequired || internetResearchGrounded,
      internetResearchRequired
        ? internetResearchGrounded
          ? `本轮已联网检索并注入 ${internetSourceCount} 条外部来源。`
          : `本轮需要联网证据但未形成可引用来源：${internetResearch?.summary || '无结果'}`
        : '本轮没有触发强联网信号。',
      internetResearchRequired && Boolean(internetResearch?.attempted),
    ),
    item(
      'deep-run-certification',
      '深度长跑认证',
      deepRunCertification.status === 'proved',
      deepRunCertification.status === 'proved'
        ? deepRunCertification.proofSummary
        : deepRunCertification.blockers.join(' / '),
      deepRunCertification.status === 'partial',
    ),
    item(
      'deep-match',
      '深度匹配裁判',
      decisionSource === 'deep-model' && traceVerification.modelJudgeTraceVerified,
      decisionSource === 'deep-model' && traceVerification.modelJudgeTraceVerified
        ? `MatchGate 使用 deep-model，且 model-judge 阶段留下可核验 trace；stage trace ${stageTrace.length} 条。`
        : `本轮使用 ${decisionSource}，必须在 UI 和导出中标记降级。`,
      decisionSource === 'deep-model' || stageTrace.length >= 4,
    ),
    item(
      'stage-trace',
      '匹配阶段 trace',
      traceVerification.stageTraceVerified,
      `按顺序完成 ${traceVerification.completedPhaseCount}/6 个必要匹配阶段，trace=${stageTrace.length}。`,
      stageTrace.length > 0,
    ),
    item(
      'trace-timeline',
      '运行时间线可信',
      traceVerification.temporalTraceVerified,
      traceVerification.temporalTraceVerified
        ? '匹配 trace 时间戳在本轮窗口内，且每个阶段 endedAt >= startedAt。'
        : '匹配 trace 时间戳缺失、逆序或超出本轮运行窗口。',
      stageTrace.length > 0,
    ),
    item('team-session', '团队会话消息', messageCount >= 8, `session.messages=${messageCount}，brief=${briefCount}。`, messageCount > 0),
    item('debate-scenes', '辩论剧场对象', input.debateScenes.length >= 12, `scenes=${input.debateScenes.length}。`, input.debateScenes.length > 0),
    item('relation-ledger', '关系地图与裁决账本', relationCount >= 12 && verdictLedgerCount >= 8, `edges=${relationCount}，ledgerItems=${verdictLedgerCount}。`, relationCount > 0 || verdictLedgerCount > 0),
    item('quality-gate', '质量闸门', input.qualityGate.finalGateStatus === 'approved', `quality=${input.qualityGate.score}，status=${input.qualityGate.finalGateStatus}。`, input.qualityGate.score >= 80),
    item('action-pack', '90 分行动任务', actionTaskCount >= 10, `actionTasks=${actionTaskCount}。`, actionTaskCount > 0),
    item('master-prd-export', '大师 PRD 与共识追溯导出', actionTaskCount >= 10, `actionTasks=${actionTaskCount}，quality=${input.qualityGate.score}。`, actionTaskCount > 0),
  ]
  const nextProofNeeded = evidenceItems
    .filter((proof) => proof.status !== 'proved')
    .map((proof) => `${proof.label}: ${proof.detail}`)
  if (!nextProofNeeded.some((proof) => proof.includes('真实小白用户'))) {
    nextProofNeeded.push('真实小白用户验证: 仍需要 5-8 人稳审，至少 5 人完成记录且 4 人完成从输入、阅读、导出到复盘的闭环。')
  }

  return {
    runId: `xiaobai-runtime-${input.runStartedAt.toString(36)}`,
    startedAt: new Date(runStartedAt).toISOString(),
    completedAt: new Date(input.runCompletedAt).toISOString(),
    durationMs,
    decisionSource,
    modelJudgeUsed: decisionSource === 'deep-model',
    fallbackUsed: decisionSource === 'local-fallback',
    stageTrace,
    messageCount,
    briefCount,
    sceneCount: input.debateScenes.length,
    relationCount,
    verdictLedgerCount,
    qualityStatus,
    qualityScore: input.qualityGate.score,
    actionTaskCount,
    baoyuPlanCount: input.baoyuVisualPlans.length,
    localSvgCardCount,
    internetResearchRequired,
    internetResearchGrounded,
    internetSourceCount,
    internetQueries,
    deepRunCertification,
    replayFrames,
    evidenceItems,
    exportProof: [
      'PRD Markdown export includes match gate, theater, consensus trace, delivery modes, action pack, excellence audit, runtime evidence and quality gate.',
      'Share brief export stays readable without default image-pack generation.',
      internetResearchGrounded
        ? `Internet research pack includes ${internetSourceCount} external sources and ${internetQueries.length} queries.`
        : 'Internet research status is recorded honestly; unavailable search is not promoted as grounded evidence.',
      'Runtime ledger does not include API keys, raw secrets, or private long logs.',
    ],
    nextProofNeeded,
  }
}

export function renderCouncilRuntimeEvidenceMarkdown(ledger: CouncilRuntimeEvidenceLedger): string {
  return [
    '## 真实运行证据账本',
    '',
    `- runId: ${ledger.runId}`,
    `- durationMs: ${ledger.durationMs}`,
    `- decisionSource: ${ledger.decisionSource}`,
    `- modelJudgeUsed: ${ledger.modelJudgeUsed ? 'yes' : 'no'}`,
    `- quality: ${ledger.qualityScore} / ${ledger.qualityStatus}`,
    `- messages: ${ledger.messageCount} / briefs: ${ledger.briefCount}`,
    `- scenes: ${ledger.sceneCount} / relations: ${ledger.relationCount} / ledgerItems: ${ledger.verdictLedgerCount}`,
    `- actionTasks: ${ledger.actionTaskCount}`,
    `- internetResearch: required=${ledger.internetResearchRequired ? 'yes' : 'no'} grounded=${ledger.internetResearchGrounded ? 'yes' : 'no'} sources=${ledger.internetSourceCount}`,
    `- internetQueries: ${ledger.internetQueries.join('；') || 'none'}`,
    `- traceExportTasks: ${ledger.actionTaskCount}`,
    '',
    '### 证据项',
    ...ledger.evidenceItems.map((proof) => `- ${proof.status}: ${proof.label}｜${proof.detail}`),
    '',
    '### 导出证明',
    ...ledger.exportProof.map((proof) => `- ${proof}`),
    '',
    '### 仍需补证',
    ...ledger.nextProofNeeded.map((proof) => `- ${proof}`),
    '',
    '### 深度长跑认证',
    `- status: ${ledger.deepRunCertification.status}`,
    `- label: ${ledger.deepRunCertification.label}`,
    `- requiredDurationMs: ${ledger.deepRunCertification.requiredDurationMs}`,
    `- actualDurationMs: ${ledger.deepRunCertification.actualDurationMs}`,
    `- modelJudgeTraceVerified: ${ledger.deepRunCertification.modelJudgeTraceVerified ? 'yes' : 'no'}`,
    `- stageTraceVerified: ${ledger.deepRunCertification.stageTraceVerified ? 'yes' : 'no'}`,
    `- temporalTraceVerified: ${ledger.deepRunCertification.temporalTraceVerified ? 'yes' : 'no'}`,
    `- proof: ${ledger.deepRunCertification.proofSummary}`,
    ...ledger.deepRunCertification.blockers.map((blocker) => `- blocker: ${blocker}`),
    '',
    '### 运行回放帧',
    ...ledger.replayFrames.map((frame) => `- ${frame.status}: ${frame.title} @ ${frame.atMs}ms｜${frame.summary}`),
  ].join('\n')
}
