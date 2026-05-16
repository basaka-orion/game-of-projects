import { activateCouncilPersonas, type CouncilActivatedAgent } from './activation'
import { buildCouncilLaunchReadinessPack, type CouncilLaunchReadinessPack } from './action-pack'
import type { CouncilBaoyuVisualPlan } from './baoyu'
import { buildCouncilCreativeEnhancement, type CouncilCreativeEnhancement } from './creative-enhancement'
import {
  buildCouncilDebateTheater,
  type CouncilDebateMap,
  type CouncilDebateScene,
  type CouncilVerdictLedger,
} from './debate-theater'
import { buildCouncilDeliveryModes, type CouncilDeliveryModes } from './delivery-modes'
import { buildCouncilNuwaEvidenceRegistry, type CouncilNuwaEvidenceRegistry } from './distillation-evidence'
import { loadAgentDreamState, type AgentDreamState } from './dream'
import { buildCouncilExcellenceAudit, type CouncilExcellenceAudit } from './excellence-audit'
import {
  buildCouncilConsensusTrace,
  formatCouncilPrdDate,
  isCouncilMasterPrdSynthesisFailure,
  normalizeCouncilMasterPrdMarkdown,
  renderCouncilConsensusTraceMarkdown,
  validateCouncilMasterPrd,
  type CouncilConsensusTrace,
  type CouncilMasterPrdValidation,
} from './master-prd'
import { runCouncilMatchGate } from './match-gate'
import {
  buildCouncilQualityGate,
  buildCouncilQualityRevisionRound,
  type CouncilQualityGate,
  type CouncilQualityRevisionRound,
} from './quality-gate'
import {
  buildCouncilRuntimeEvidenceLedger,
  flattenCouncilActionTasks,
  type CouncilRuntimeEvidenceLedger,
} from './runtime-evidence'
import type { CouncilRuntimeCalibrationPlan } from './runtime-calibration'
import type { CouncilRuntimeWisdomContext } from './runtime-wisdom'
import {
  buildCouncilInternetResearchPack,
  type CouncilInternetResearchPack,
} from './internet-research'
import { type CouncilMatchGate, type CouncilSelection } from './selector'
import type { CouncilNuwaSourceAuditLedger } from './source-audit'
import { createTeam, getTeam } from '../teams/store'
import { runTeamSession } from '../teams/engine'
import type { Team, TeamAgent, TeamDebatePhase, TeamMessage, TeamSession } from '../teams/types'
import { buildUiMuseumPrdContext, type UiMuseumPrdContext } from '../ui-museum/context'
import { redactSensitiveText } from './export-safety'

export const XIAOBAI_COUNCIL_DEBATE_PHASES: TeamDebatePhase[] = [
  {
    id: 'questioning',
    label: '追问',
    instruction: '先追问 Boss 问题背后的真实动机、隐含用户、成功标准和必须先澄清的边界。',
    consensusImpact: '锁定问题定义，防止后续大师在不同题目上各说各话。',
    requiresChallenge: false,
  },
  {
    id: 'independent-claim',
    label: '独立主张',
    instruction: '每个角色必须给出自己的第一性判断、最强方案和最不愿妥协的原则，不要迎合共识。',
    consensusImpact: '产生可互相碰撞的原始立场。',
    requiresChallenge: false,
  },
  {
    id: 'divergence',
    label: '发散',
    instruction: '允许跨界、哲思、玩法、技术、视觉和叙事越界，但每个想法都要说明可落地的最低版本。',
    consensusImpact: '打开突破性空间，避免只产出普通 PRD。',
    requiresChallenge: true,
  },
  {
    id: 'clash',
    label: '冲突质询',
    instruction: '必须点名质询：指出谁的方案会失败、哪里过度设计、哪里缺证据、哪里牺牲用户体验。',
    consensusImpact: '把冲突转成裁决条款、风险边界和验证实验。',
    requiresChallenge: true,
  },
  {
    id: 'host-verdict',
    label: '主持裁决',
    instruction: '主持人与反方席位收束：明确保留什么、裁掉什么、为什么这样取舍，以及谁的观点被吸收。',
    consensusImpact: '把争论变成单一方向和可执行取舍。',
    requiresChallenge: true,
  },
  {
    id: 'consensus-prd',
    label: '共识成稿',
    instruction: '把最终共识转成超顶级 PRD：必须同时覆盖真实洞察、产品判断、设计落地、工程约束、商业验证、全技术栈蓝图和分幕追溯，明确首版实验。',
    consensusImpact: '形成可交付、可验证、可继续执行的最终文档。',
    requiresChallenge: false,
  },
]

export interface CouncilPrdRunInput {
  problem: string
  selection?: CouncilSelection
  preferredStyleIds?: string[]
  uiStyleContext?: UiMuseumPrdContext | null
  creativeEnhancement?: CouncilCreativeEnhancement
  runtimeWisdomContext?: CouncilRuntimeWisdomContext
  runtimeCalibrationPlan?: CouncilRuntimeCalibrationPlan
  nuwaSourceAuditLedger?: CouncilNuwaSourceAuditLedger
  internetResearch?: CouncilInternetResearchPack | null
  onProgress?: (message: TeamMessage) => void
  onSnapshot?: (snapshot: CouncilLiveRunSnapshot) => void
}

export type CouncilLiveRunSnapshotStatus =
  | 'match-ready'
  | 'internet-research'
  | 'activating'
  | 'team-ready'
  | 'phase-start'
  | 'agent-thinking'
  | 'brief-ready'
  | 'phase-complete'
  | 'synthesis'
  | 'quality'
  | 'quality-revision'
  | 'trace'
  | 'completed'
  | 'error'

export interface CouncilLiveRunSnapshot {
  id: string
  status: CouncilLiveRunSnapshotStatus
  phaseId?: string
  phaseLabel?: string
  round?: number
  agentId?: string
  agentName?: string
  headline: string
  detail: string
  sceneCount: number
  briefCount: number
  relationCount: number
  latestClaim?: string
  latestObjection?: string
  targetPersonaIds?: string[]
  targetNames?: string[]
  sourceMessageId?: string
  decisionSource?: CouncilMatchGate['decisionSource']
  qualityScore?: number
  gateStatus?: CouncilQualityGate['finalGateStatus']
  baoyuCardCount?: number
  startedAt: number
  updatedAt: number
}

export interface CouncilPrdRunResult {
  selection: CouncilSelection
  matchGate: CouncilMatchGate
  activatedAgents: CouncilActivatedAgent[]
  creativeEnhancement: CouncilCreativeEnhancement
  uiStyleContext: UiMuseumPrdContext
  preferredStyleIds: string[]
  agentDreamStates: AgentDreamState[]
  team: Team
  session: TeamSession
  baoyuVisualPlans: CouncilBaoyuVisualPlan[]
  qualityGate: CouncilQualityGate
  debateScenes: CouncilDebateScene[]
  debateMap: CouncilDebateMap
  verdictLedger: CouncilVerdictLedger
  qualityRevisionHistory: CouncilQualityRevisionRound[]
  deliveryModes: CouncilDeliveryModes
  actionPack: CouncilLaunchReadinessPack
  runtimeEvidence: CouncilRuntimeEvidenceLedger
  runtimeWisdomContext?: CouncilRuntimeWisdomContext
  runtimeCalibrationPlan?: CouncilRuntimeCalibrationPlan
  nuwaEvidenceRegistry: CouncilNuwaEvidenceRegistry
  internetResearch: CouncilInternetResearchPack
  excellenceAudit: CouncilExcellenceAudit
  masterPrdValidation: CouncilMasterPrdValidation
  consensusTrace: CouncilConsensusTrace
}

export async function runCouncilPrdWorkflow(input: CouncilPrdRunInput): Promise<CouncilPrdRunResult> {
  const runStartedAt = Date.now()
  const problem = input.problem.trim()
  if (!problem) throw new Error('请输入要交给小白智囊团处理的问题或项目构想。')

  const selection = input.selection || await runCouncilMatchGate({
    problem,
    creativeEnhancement: input.creativeEnhancement,
    uiStyleContext: input.uiStyleContext || undefined,
    preferredStyleIds: input.preferredStyleIds,
    runtimeWisdomContext: input.runtimeWisdomContext,
    runtimeCalibrationPlan: input.runtimeCalibrationPlan,
  })
  const matchGate = selection.matchGate
  const liveMessages: TeamMessage[] = []
  const completedPhaseIds = new Set<string>()
  const emitSnapshot = createCouncilSnapshotEmitter({
    selection,
    runStartedAt,
    messages: liveMessages,
    onSnapshot: input.onSnapshot,
  })
  emitSnapshot({
    status: 'match-ready',
    headline: `编队已锁定：${selection.seats.map((seat) => seat.persona.shortName).join(' / ')}`,
    detail: matchGate.judgeSummary || matchGate.explanation.join('；') || 'CouncilMatchGate 已形成推荐团队。',
    decisionSource: matchGate.decisionSource,
  })
  const internetResearch = input.internetResearch || await buildCouncilInternetResearchPack({
    problem,
    selection,
    maxSources: 6,
  })
  emitSnapshot({
    status: 'internet-research',
    headline: internetResearch.grounded
      ? `联网证据包已接入：${internetResearch.sources.length} 个来源`
      : internetResearch.required
        ? '本轮需要联网证据，但搜索未形成可引用来源'
        : '本轮未触发强联网检索',
    detail: internetResearch.summary,
  })
  const nuwaEvidenceRegistry = buildCouncilNuwaEvidenceRegistry(
    selection.seats.map((seat) => seat.persona),
    undefined,
    input.nuwaSourceAuditLedger,
  )
  const creativeEnhancement = input.creativeEnhancement || await buildCouncilCreativeEnhancement(problem)
  const styleSeed = [
    problem,
    selection.profile.domains.join(' / '),
    selection.seats.map((seat) => `${seat.persona.name} ${seat.seat.label}`).join('\n'),
    creativeEnhancement.promptFragment,
  ].join('\n\n')
  const uiStyleContext = input.uiStyleContext || buildUiMuseumPrdContext(styleSeed, input.preferredStyleIds || [])
  emitSnapshot({
    status: 'activating',
    headline: '正在激活独立 SOUL、私有记忆和动态 Dream',
    detail: '本地 Openbasaka 激活，不默认同步 Telegram；本轮记忆遵守 Hermes 冻结规则。',
  })
  const activatedAgents = await activateCouncilPersonas(selection.seats.map((seat) => seat.persona), {
    telegramEnabled: false,
    workspaceScope: 'openbasaka-local-council',
  })
  const agentDreamStates = await Promise.all(
    activatedAgents.map((item) => loadAgentDreamState(item.persona, { agentId: item.agent.id })),
  )
  const team = await createCouncilTeam(problem, selection, activatedAgents)
  emitSnapshot({
    status: 'team-ready',
    headline: `六阶段剧场就绪：${XIAOBAI_COUNCIL_DEBATE_PHASES.map((phase) => phase.label).join(' -> ')}`,
    detail: `已创建 ${team.name}，接下来每位入选大师按阶段独立发言、互相质询并留下裁决路径。`,
  })
  const topic = buildCouncilTopic(problem, selection, {
      creativeEnhancement,
      uiStyleContext,
      agentDreamStates,
      runtimeWisdomContext: input.runtimeWisdomContext,
      runtimeCalibrationPlan: input.runtimeCalibrationPlan,
      internetResearch,
    })
  const progressSink = (message: TeamMessage) => {
    liveMessages.push(message)
    input.onProgress?.(message)
    emitSnapshotFromTeamMessage(message, emitSnapshot, liveMessages, completedPhaseIds, selection.seats.length)
  }
  const session = await runCouncilTeamSessionWithFallback(
    team,
    topic,
    progressSink,
    {
      uiStyleContext,
      debatePhases: XIAOBAI_COUNCIL_DEBATE_PHASES,
      creativeEnhancement,
      agentDreamStates,
      runtimeWisdomContext: input.runtimeWisdomContext,
      runtimeCalibrationPlan: input.runtimeCalibrationPlan,
      internetResearch,
    },
    {
      problem,
      selection,
      runStartedAt,
      emitSnapshot,
    },
  )
  let prdMarkdown = normalizeCouncilMasterPrdMarkdown(session.summary, {
    problem,
    selection,
    generatedAt: new Date(runStartedAt),
  })
  const synthesisFailed = isCouncilMasterPrdSynthesisFailure(session.summary)
  emitSnapshot({
    status: 'synthesis',
    headline: '六阶段博弈完成，正在把分歧收束成可开工 PRD',
    detail: synthesisFailed
      ? '模型主持人没有生成 PRD 正文，本轮只保留失败说明，不再把返修补丁伪装成成稿。'
      : `本轮已收到 ${session.messages.filter((message) => message.kind === 'brief').length} 条角色发言，开始进入大师级 PRD 结构化闸门。`,
  })
  let qualityRevisionHistory: CouncilQualityRevisionRound[] = []
  const baoyuVisualPlans: CouncilBaoyuVisualPlan[] = []
  let qualityGate = buildCouncilQualityGate({
    problem,
    selection,
    session,
    prdMarkdown,
    baoyuVisualPlans,
    revisionRounds: qualityRevisionHistory,
    internetResearch,
  })
  emitSnapshot({
    status: 'quality',
    headline: `质量闸门初评：${qualityGate.score}/100`,
    detail: qualityGate.summary,
    qualityScore: qualityGate.score,
    gateStatus: qualityGate.finalGateStatus,
  })
  for (let round = 1; round <= 2 && qualityGate.status !== 'approved' && !synthesisFailed; round += 1) {
    const revision = buildCouncilQualityRevisionRound({
      gate: qualityGate,
      prdMarkdown,
      round,
    })
    emitSnapshot({
      status: 'quality-revision',
      headline: `质量返修第 ${round} 轮`,
      detail: revision.revisionRound.summary,
      qualityScore: qualityGate.score,
      gateStatus: qualityGate.finalGateStatus,
    })
    prdMarkdown = revision.prdMarkdown
    const nextGate = buildCouncilQualityGate({
      problem,
      selection,
      session,
      prdMarkdown,
      baoyuVisualPlans,
      revisionRounds: [...qualityRevisionHistory, revision.revisionRound],
      internetResearch,
    })
    const completedRound: CouncilQualityRevisionRound = {
      ...revision.revisionRound,
      status: nextGate.status === 'approved' ? 'applied' : 'still-needs-revision',
      scoreAfter: nextGate.score,
      finalGateStatus: nextGate.status,
    }
    qualityRevisionHistory = [...qualityRevisionHistory, completedRound]
    qualityGate = buildCouncilQualityGate({
      problem,
      selection,
      session,
      prdMarkdown,
      baoyuVisualPlans,
      revisionRounds: qualityRevisionHistory,
      internetResearch,
    })
    emitSnapshot({
      status: 'quality',
      headline: `质量闸门复评：${qualityGate.score}/100`,
      detail: qualityGate.summary,
      qualityScore: qualityGate.score,
      gateStatus: qualityGate.finalGateStatus,
    })
  }
  session.summary = prdMarkdown
  const artifact = session.messages.find((message) => message.kind === 'artifact')
  if (artifact) artifact.content = prdMarkdown
  const theater = buildCouncilDebateTheater({
    selection,
    messages: session.messages,
    prdMarkdown,
    qualityGate,
  })
  const deliveryModes = buildCouncilDeliveryModes({
    problem,
    selection,
    prdMarkdown,
    scenes: theater.scenes,
    debateMap: theater.debateMap,
    verdictLedger: theater.verdictLedger,
    qualityGate,
    baoyuVisualPlans,
  })
  const actionPack = buildCouncilLaunchReadinessPack({
    problem,
    selection,
    prdMarkdown,
    deliveryModes,
    verdictLedger: theater.verdictLedger,
    qualityGate,
    baoyuVisualPlans,
  })
  const consensusTrace = buildCouncilConsensusTrace({
    scenes: theater.scenes,
    verdictLedger: theater.verdictLedger,
    actionPack,
  })
  if (!synthesisFailed && !/##\s+共识形成追溯/.test(prdMarkdown)) {
    prdMarkdown = `${prdMarkdown.trim()}\n\n${renderCouncilConsensusTraceMarkdown(consensusTrace)}`.trim()
    session.summary = prdMarkdown
    if (artifact) artifact.content = prdMarkdown
  }
  const masterPrdValidation = validateCouncilMasterPrd(prdMarkdown)
  emitSnapshot({
    status: 'trace',
    headline: `共识追溯已整理：${consensusTrace.sourcedScenes}/${consensusTrace.totalScenes} 幕可回看`,
    detail: consensusTrace.summary,
    qualityScore: qualityGate.score,
    gateStatus: qualityGate.finalGateStatus,
  })
  const runCompletedAt = Date.now()
  const runtimeEvidence = buildCouncilRuntimeEvidenceLedger({
    runStartedAt,
    runCompletedAt,
    selection,
    session,
    debateScenes: theater.scenes,
    debateMap: theater.debateMap,
    verdictLedger: theater.verdictLedger,
    qualityGate,
    actionTasks: flattenCouncilActionTasks(actionPack.taskGroups),
    baoyuVisualPlans,
    internetResearch,
  })
  const excellenceAudit = buildCouncilExcellenceAudit({
    selection,
    activatedAgents,
    qualityGate,
    qualityRevisionHistory,
    debateScenes: theater.scenes,
    debateMap: theater.debateMap,
    verdictLedger: theater.verdictLedger,
    actionPack,
    baoyuVisualPlans,
    runtimeEvidence,
    nuwaEvidenceRegistry,
  })
  emitSnapshot({
    status: 'completed',
    headline: synthesisFailed
      ? `PRD 生成失败已阻断：质量 ${qualityGate.score}/100`
      : `代表性产物完成：${theater.scenes.length} 幕剧场，质量 ${qualityGate.score}/100`,
    detail: synthesisFailed
      ? '本轮只保存失败原因和运行证据，不再标记为最终 PRD。'
      : runtimeEvidence.deepRunCertification.proofSummary || runtimeEvidence.deepRunCertification.blockers.join('；') || '运行证据账本已生成。',
    qualityScore: qualityGate.score,
    gateStatus: qualityGate.finalGateStatus,
  })

  return {
    selection,
    matchGate,
    activatedAgents,
    creativeEnhancement,
    uiStyleContext,
    preferredStyleIds: input.preferredStyleIds || [],
    agentDreamStates,
    team,
    session,
    baoyuVisualPlans,
    qualityGate,
    debateScenes: theater.scenes,
    debateMap: theater.debateMap,
    verdictLedger: theater.verdictLedger,
    qualityRevisionHistory,
    deliveryModes,
    actionPack,
    runtimeEvidence,
    runtimeWisdomContext: input.runtimeWisdomContext,
    runtimeCalibrationPlan: input.runtimeCalibrationPlan,
    nuwaEvidenceRegistry,
    internetResearch,
    excellenceAudit,
    masterPrdValidation,
    consensusTrace,
  }
}

function compactSnapshotText(value: string, max = 180): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function createCouncilSnapshotEmitter(context: {
  selection: CouncilSelection
  runStartedAt: number
  messages: TeamMessage[]
  onSnapshot?: (snapshot: CouncilLiveRunSnapshot) => void
}): (patch: Omit<Partial<CouncilLiveRunSnapshot>, 'id' | 'startedAt' | 'updatedAt' | 'sceneCount' | 'briefCount' | 'relationCount'> & {
  status: CouncilLiveRunSnapshotStatus
  headline: string
  detail: string
}) => void {
  let snapshotSeq = 0
  return (patch) => {
    if (!context.onSnapshot) return
    snapshotSeq += 1
    const updatedAt = Date.now()
    const theater = buildCouncilDebateTheater({
      selection: context.selection,
      messages: context.messages,
      prdMarkdown: '',
    })
    const realScenes = theater.scenes.filter((scene) => scene.sourceMessageIds.length > 0)
    const sourceMessageId = patch.sourceMessageId
    const sourceScene = sourceMessageId
      ? realScenes.find((scene) => scene.sourceMessageIds.includes(sourceMessageId))
      : realScenes[realScenes.length - 1]
    context.onSnapshot({
      id: `${patch.status}-${patch.sourceMessageId || patch.phaseId || snapshotSeq}-${snapshotSeq}`,
      status: patch.status,
      phaseId: patch.phaseId,
      phaseLabel: patch.phaseLabel,
      round: patch.round,
      agentId: patch.agentId,
      agentName: patch.agentName,
      headline: compactSnapshotText(patch.headline, 160),
      detail: compactSnapshotText(patch.detail, 360),
      sceneCount: realScenes.length,
      briefCount: context.messages.filter((message) => message.kind === 'brief').length,
      relationCount: theater.debateMap.edges.length,
      latestClaim: compactSnapshotText(patch.latestClaim || sourceScene?.claim || '', 220) || undefined,
      latestObjection: compactSnapshotText(patch.latestObjection || sourceScene?.objection || '', 220) || undefined,
      targetPersonaIds: patch.targetPersonaIds || sourceScene?.targetPersonaIds,
      targetNames: patch.targetNames || sourceScene?.targetNames,
      sourceMessageId: patch.sourceMessageId,
      decisionSource: patch.decisionSource,
      qualityScore: patch.qualityScore,
      gateStatus: patch.gateStatus,
      baoyuCardCount: patch.baoyuCardCount,
      startedAt: context.runStartedAt,
      updatedAt,
    })
  }
}

function resolvePhaseFromTeamMessage(message: TeamMessage): Pick<CouncilLiveRunSnapshot, 'phaseId' | 'phaseLabel' | 'round'> {
  const metadata = message.metadata || {}
  const metadataPhaseId = typeof metadata.phaseId === 'string' ? metadata.phaseId : undefined
  const metadataPhaseLabel =
    typeof metadata.phaseLabel === 'string'
      ? metadata.phaseLabel
      : typeof metadata.phase === 'string'
        ? metadata.phase
        : undefined
  const inferred = XIAOBAI_COUNCIL_DEBATE_PHASES.find((phase) =>
    message.content.includes(`「${phase.label}」`) || message.content.includes(`${phase.label} ·`) || message.content.includes(phase.label),
  )
  return {
    phaseId: metadataPhaseId || inferred?.id,
    phaseLabel: metadataPhaseLabel || inferred?.label,
    round: typeof message.round === 'number' ? message.round : undefined,
  }
}

function extractThinkingAgentName(message: TeamMessage): string | undefined {
  const match = message.content.match(/^(.+?)\s+正在处理：/)
  return compactSnapshotText(match?.[1] || '', 64) || undefined
}

function emitSnapshotFromTeamMessage(
  message: TeamMessage,
  emitSnapshot: ReturnType<typeof createCouncilSnapshotEmitter>,
  messages: TeamMessage[],
  completedPhaseIds: Set<string>,
  expectedSpeakerCount: number,
): void {
  if (message.kind === 'reflection') return
  const phase = resolvePhaseFromTeamMessage(message)
  if (message.kind === 'error') {
    emitSnapshot({
      status: 'error',
      ...phase,
      sourceMessageId: message.id,
      headline: `${message.agentName} 执行异常`,
      detail: message.content,
      agentId: message.agentId,
      agentName: message.agentName,
    })
    return
  }
  if (message.kind === 'brief') {
    emitSnapshot({
      status: 'brief-ready',
      ...phase,
      sourceMessageId: message.id,
      headline: `${message.agentName} 完成「${phase.phaseLabel || '本阶段'}」发言`,
      detail: message.content,
      agentId: message.agentId,
      agentName: message.agentName,
    })
    if (phase.phaseId) {
      const phaseBriefCount = messages.filter((item) => item.kind === 'brief' && item.metadata?.phaseId === phase.phaseId).length
      if (phaseBriefCount >= expectedSpeakerCount && !completedPhaseIds.has(phase.phaseId)) {
        completedPhaseIds.add(phase.phaseId)
        emitSnapshot({
          status: 'phase-complete',
          ...phase,
          sourceMessageId: message.id,
          headline: `「${phase.phaseLabel || phase.phaseId}」阶段完成`,
          detail: `已收到 ${phaseBriefCount}/${expectedSpeakerCount} 位入选大师的本阶段发言，进入下一段冲突或裁决。`,
        })
      }
    }
    return
  }
  if (message.kind === 'progress') {
    const metadataAgentName = typeof message.metadata?.agentName === 'string' ? message.metadata.agentName : undefined
    const metadataAgentId = typeof message.metadata?.agentId === 'string' ? message.metadata.agentId : undefined
    const agentName = metadataAgentName || extractThinkingAgentName(message)
    const isPhaseStart = /^进入「/.test(message.content)
    emitSnapshot({
      status: isPhaseStart ? 'phase-start' : 'agent-thinking',
      ...phase,
      sourceMessageId: message.id,
      headline: isPhaseStart
        ? `进入「${phase.phaseLabel || '下一'}」阶段`
        : `${agentName || message.agentName} 正在形成「${phase.phaseLabel || '本轮'}」判断`,
      detail: message.content,
      agentId: metadataAgentId || (agentName ? message.agentId : undefined),
      agentName: agentName || undefined,
    })
  }
}

async function runCouncilTeamSessionWithFallback(
  team: Team,
  topic: string,
  onProgress: (message: TeamMessage) => void,
  options: {
    uiStyleContext: UiMuseumPrdContext
    debatePhases: TeamDebatePhase[]
    creativeEnhancement: CouncilCreativeEnhancement
    agentDreamStates: AgentDreamState[]
    runtimeWisdomContext?: CouncilRuntimeWisdomContext
    runtimeCalibrationPlan?: CouncilRuntimeCalibrationPlan
    internetResearch?: CouncilInternetResearchPack
  },
  fallbackContext: {
    problem: string
    selection: CouncilSelection
    runStartedAt: number
    emitSnapshot: ReturnType<typeof createCouncilSnapshotEmitter>
  },
): Promise<TeamSession> {
  try {
    const session = await runTeamSession(team, topic, onProgress, options)
    const briefCount = session.messages.filter((message) => message.kind === 'brief').length
    if (briefCount > 0 && !isCouncilMasterPrdSynthesisFailure(session.summary)) return session
    fallbackContext.emitSnapshot({
      status: 'error',
      headline: '模型会议没有形成足够博弈，切换本地 Nuwa 方法论会场',
      detail: `brief=${briefCount}，summary=${compactSnapshotText(session.summary || 'empty', 220)}。系统会保留模型输出，但不让 Boss 卡在空流程。`,
    })
    return buildLocalNuwaCouncilSession({
      team,
      problem: fallbackContext.problem,
      selection: fallbackContext.selection,
      uiStyleContext: options.uiStyleContext,
      internetResearch: options.internetResearch,
      runStartedAt: fallbackContext.runStartedAt,
      reason: '模型会议没有稳定形成可追溯博弈。',
      onProgress,
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    fallbackContext.emitSnapshot({
      status: 'error',
      headline: '模型会议异常，启动本地 Nuwa 方法论博弈',
      detail: reason,
    })
    return buildLocalNuwaCouncilSession({
      team,
      problem: fallbackContext.problem,
      selection: fallbackContext.selection,
      uiStyleContext: options.uiStyleContext,
      internetResearch: options.internetResearch,
      runStartedAt: fallbackContext.runStartedAt,
      reason,
      onProgress,
    })
  }
}

function localMessageTimestamp(runStartedAt: number, index: number): number {
  return runStartedAt + index * 1000
}

function localPersonaMethodLine(seat: CouncilSelection['seats'][number]): string {
  return `${seat.persona.shortName} 方法论：${seat.persona.methodTags.slice(0, 4).join(' / ')}；核心原则：${seat.persona.promptSeed}`
}

function localDebateClaim(problem: string, seat: CouncilSelection['seats'][number], phase: TeamDebatePhase): string {
  const methodLine = localPersonaMethodLine(seat)
  if (phase.id === 'questioning') {
    return `${methodLine}。先把「${compactSnapshotText(problem, 64)}」压成用户、场景、成功标准、不可做边界和首版验证。`
  }
  if (phase.id === 'independent-claim') {
    return `${methodLine}。我的独立主张是先锁定一条能让小白立刻完成的主路径，再反推所有页面、状态、接口和验收。`
  }
  if (phase.id === 'divergence') {
    return `${methodLine}。发散方案必须同时给出惊喜体验、可落地 MVP、像素级 UI 线索和数据闭环，不允许只有概念。`
  }
  if (phase.id === 'clash') {
    return `${methodLine}。我反对平均化 PRD：没有前端状态、后端接口、数据模型、失败态和验收证据的“灵感”全部暂缓。`
  }
  if (phase.id === 'host-verdict') {
    return `${methodLine}。主持裁决：保留能落到 P0 的体验与技术契约，裁掉装饰性复杂度，把争论映射成任务和验收。`
  }
  return `${methodLine}。共识成稿必须写成 Boss 可直接交给产品、设计、前端、后端、测试执行的 PRD。`
}

function localDebateObjection(seat: CouncilSelection['seats'][number], target: CouncilSelection['seats'][number], phase: TeamDebatePhase): string {
  if (!phase.requiresChallenge) {
    return `补充 ${target.persona.shortName}：你的观点需要落到一个可以验收的用户动作，否则只是态度。`
  }
  return `反对 ${target.persona.shortName} 的潜在盲点：如果只追求 ${target.persona.methodTags[0] || '单一方法'}，会牺牲证据、工程边界或小白第一步完成率。`
}

function localDebatePrdClause(seat: CouncilSelection['seats'][number], phase: TeamDebatePhase): string {
  const role = seat.seat.label
  if (phase.id === 'questioning') return `PRD 必须先写清目标用户、真实场景、成功标准、Do Not Do 和验收方式，由${role}负责校准。`
  if (phase.id === 'independent-claim') return `PRD 必须保留 ${seat.persona.shortName} 的不可替代判断，并把它转成 P0/P1/P2 和组件状态。`
  if (phase.id === 'divergence') return `PRD 必须列出突破性体验、首版实验、像素级视觉约束、趣味机制和可落地 MVP。`
  if (phase.id === 'clash') return `PRD 必须记录反方质询、失败路径、被裁掉方案、风险边界和返修条件。`
  if (phase.id === 'host-verdict') return `PRD 必须把保留/裁掉/修正写入裁决账本，并生成前端、后端、API、数据库、测试任务。`
  return `PRD 必须生成完整全栈蓝图、接口草案、数据模型、权限安全、部署监控、验收矩阵和下一步任务。`
}

function buildLocalNuwaCouncilSession(input: {
  team: Team
  problem: string
  selection: CouncilSelection
  uiStyleContext: UiMuseumPrdContext
  internetResearch?: CouncilInternetResearchPack
  runStartedAt: number
  reason: string
  onProgress: (message: TeamMessage) => void
}): TeamSession {
  const messages: TeamMessage[] = []
  let seq = 0
  for (const phase of XIAOBAI_COUNCIL_DEBATE_PHASES) {
    const progress: TeamMessage = {
      id: `local_progress_${seq += 1}`,
      agentId: 'local-nuwa-council',
      agentName: '本地 Nuwa 方法论主持人',
      role: 'system',
      content: `进入「${phase.label}」阶段：${phase.instruction}`,
      timestamp: localMessageTimestamp(input.runStartedAt, seq),
      kind: 'progress',
      metadata: { phaseId: phase.id, phaseLabel: phase.label, fallbackReason: input.reason },
    }
    messages.push(progress)
    input.onProgress(progress)
    input.selection.seats.forEach((seat, index) => {
      const target = input.selection.seats[(index + 1) % input.selection.seats.length] || seat
      const brief: TeamMessage = {
        id: `local_brief_${phase.id}_${seat.persona.id}_${seq += 1}`,
        agentId: seat.persona.id,
        agentName: seat.persona.name,
        role: 'assistant',
        content: [
          `【方法论提取】${localPersonaMethodLine(seat)}`,
          `【核心判断】${localDebateClaim(input.problem, seat, phase)}`,
          `【冲突/补充】${localDebateObjection(seat, target, phase)}`,
          `【PRD条款】${localDebatePrdClause(seat, phase)}`,
        ].join(' '),
        timestamp: localMessageTimestamp(input.runStartedAt, seq),
        kind: 'brief',
        metadata: {
          phaseId: phase.id,
          phaseLabel: phase.label,
          challengedPersonaIds: [target.persona.id],
          localNuwaFallback: true,
          fallbackReason: input.reason,
        },
      }
      messages.push(brief)
      input.onProgress(brief)
    })
  }
  const artifact: TeamMessage = {
    id: `local_artifact_${seq += 1}`,
    agentId: 'local-nuwa-council',
    agentName: '本地 Nuwa 方法论主持人',
    role: 'assistant',
    content: buildLocalMasterPrdMarkdown(input.problem, input.selection, input.reason, input.uiStyleContext, input.internetResearch),
    timestamp: localMessageTimestamp(input.runStartedAt, seq),
    kind: 'artifact',
    metadata: { phaseId: 'consensus-prd', phaseLabel: '共识成稿', localNuwaFallback: true },
  }
  messages.push(artifact)
  input.onProgress(artifact)
  return {
    id: `local_nuwa_session_${input.runStartedAt}`,
    teamId: input.team.id,
    title: `本地 Nuwa 方法论博弈｜${compactSnapshotText(input.problem, 30)}`,
    topic: input.problem,
    messages,
    summary: artifact.content,
    tags: ['xiaobai-council', 'local-nuwa-debate', 'fallback-safe'],
    isPinned: false,
    isStarred: false,
    status: 'completed',
    createdAt: new Date(input.runStartedAt).toISOString(),
    updatedAt: new Date(localMessageTimestamp(input.runStartedAt, seq)).toISOString(),
  }
}

function isWeatherBagIosAppProblem(problem: string): boolean {
  return /女性|女生|女孩|girl|woman|women/i.test(problem) &&
    /天气|气温|下雨|晴雨|weather/i.test(problem) &&
    /包包|包里|随身|出门|外出|bag/i.test(problem) &&
    /iOS|app|应用|手机/i.test(problem)
}

function isPersonalCorpusSoulMacAppProblem(problem: string): boolean {
  return /soul\.md|mempalace|记忆宫殿|几千篇|文章|自我蒸馏|最了解我|认知、感知|认知感知/i.test(problem) &&
    /Mac|macOS|桌面端|app|应用/i.test(problem)
}

function renderUiStyleContextBlock(uiStyleContext: UiMuseumPrdContext): string[] {
  return [
    '## UI风格馆视觉 DNA 与验收落点',
    `- 选用风格：${uiStyleContext.styleNames.join(' / ') || 'UI风格馆自动推荐'}。`,
    `- 推荐理由：${uiStyleContext.reasoning}`,
    `- 色彩 token：${uiStyleContext.visual.palette.join(' / ') || '由 UI风格馆主题生成主色、辅助色、危险色和背景色'}。`,
    `- 字体/质感/动效：${uiStyleContext.visual.typography}；${uiStyleContext.visual.surface}；${uiStyleContext.visual.motion}。`,
    '- PRD/工作流硬规则：界面结构、组件状态、空态/加载/失败态、动效节奏、截图验收必须继承这套视觉 DNA；不能只写“参考某风格”。',
  ]
}

function renderInternetResearchPrdBlock(internetResearch?: CouncilInternetResearchPack): string[] {
  if (!internetResearch) return []
  const sourceLines = internetResearch.sources.length
    ? internetResearch.sources.slice(0, 6).map((source, index) =>
        `- [W${index + 1}] ${source.title}｜${source.domain || 'web'}｜${source.url}`,
      )
    : ['- 本轮没有可引用外部来源；外部事实只能保留为待查证。']
  return [
    '## 联网证据与待查证边界',
    `- status: ${internetResearch.status}`,
    `- required: ${internetResearch.required ? 'yes' : 'no'}；grounded: ${internetResearch.grounded ? 'yes' : 'no'}。`,
    `- summary: ${compactSnapshotText(internetResearch.summary, 280)}`,
    ...sourceLines,
    '- PRD 使用规则：市场、竞品、政策、价格、天气、模型能力、版本和新闻必须引用 [W] 来源；没有来源就写成假设或待查证。',
  ]
}

function appendInternetResearchPrdBlock(markdown: string, internetResearch?: CouncilInternetResearchPack): string {
  const block = renderInternetResearchPrdBlock(internetResearch)
  return block.length ? `${markdown.trim()}\n\n${block.join('\n')}` : markdown
}

function buildWeatherBagIosPrdMarkdown(
  problem: string,
  selection: CouncilSelection,
  reason: string,
  uiStyleContext: UiMuseumPrdContext,
): string {
  const roster = selection.seats.map((seat) => `${seat.persona.shortName}（${seat.seat.label}）`).join('、')
  const userSentence = compactSnapshotText(problem, 180)
  return [
    '# 包里晴雨签 iOS App｜小白智囊团大师共识 PRD',
    '',
    `> 本轮远程模型会议未稳定完成，原因：${reason}。系统没有假装 deep-model 成功，而是用已蒸馏的独立 Nuwa 方法论包完成本地严苛博弈，保留过程证据并继续交付可返修 PRD。`,
    '',
    '## 产品定位与北极星',
    `- Boss 原始愿望：${userSentence}`,
    '- 一句话定位：包里晴雨签是一款面向女性外出的 iOS 出门准备助手，根据当前位置真实天气、行程时段、通勤方式、穿搭与个人偏好，自动生成优雅、有趣、卡通但严谨的包包清单，让用户打勾确认后安心出门。',
    '- 北极星指标：用户在 90 秒内完成今日外出清单并点击“全武装出门”的比例。',
    '- 核心承诺：不是普通天气 App，也不是死板待办，而是把天气、场景、包包、穿搭、健康与安全提醒合成一次温柔可靠的出门仪式。',
    `- 入选智囊：${roster}。`,
    '',
    ...renderUiStyleContextBlock(uiStyleContext),
    '',
    '## 目标用户与端到端旅程',
    '- 核心用户：18-40 岁经常通勤、约会、旅行、带娃、运动、出差或参加活动的女性；她们愿意为安心、精致、好看、有趣的生活工具付费。',
    '- 高频痛点：出门后才发现没带伞、纸巾、口红、充电宝、证件、药、墨镜、防晒、发圈；天气突变导致穿搭或包内物品不匹配。',
    '- 首次进入旅程：授权定位与天气 -> 选择今天出门场景 -> 看到卡通管家生成的包包清单 -> 勾选已带物品 -> 缺失项一键加入常备包 -> 点击“全武装出门”。',
    '- 日常旅程：打开 App 或小组件 -> 自动读取当地实时天气与未来 6 小时变化 -> 按用户常用包型、目的地和通勤方式调整清单 -> 完成打勾 -> 留下今日出门记录。',
    '- 情绪体验：用户感觉自己被用心照顾，而不是被提醒轰炸；每一条建议都要说明“为什么今天需要”。',
    '',
    '## P0/P1/P2 与不做清单',
    '- P0：定位天气、今日场景选择、智能包包清单、打勾完成、物品缺失提醒、常备包模板、可爱卡通状态、离线兜底清单。',
    '- P1：日历/路线联动、包型管理、穿搭天气建议、过敏/生理期/药品提醒、小组件、Watch 提醒、季节包模板。',
    '- P2：好友分享清单、旅行模式、智能购物补货、品牌联名皮肤、AR 包内摆放建议、社区精选包包模板。',
    '- 不做清单：不做社交广场首版；不做复杂天气专业图表；不做强制账号注册；不做默认购买引导；不采集不必要位置轨迹；不把卡通做成影响效率的装饰。',
    '',
    '## 信息架构、页面与组件状态',
    '- Tab 1 今日出门：天气条、场景胶囊、包包清单、进度环、全武装按钮。',
    '- Tab 2 我的包包：通勤包、小包、旅行包、健身包、母婴包等模板；每个模板有常备物、可选物、季节物。',
    '- Tab 3 天气灵感：雨天、暴晒、降温、大风、雾霾、花粉、夜归等场景卡片，解释建议来源。',
    '- Tab 4 记录与偏好：常忘物品、完成率、常用路线、提醒强度、卡通角色、隐私权限。',
    '- 组件状态：空态用“今天要去哪儿？”引导；加载态展示卡通管家整理包包；失败态使用最近天气或手动天气；完成态出现“全武装出门”签章。',
    '- 核心组件：WeatherRibbon、OutingScenePicker、BagChecklist、ItemWhySheet、BagTemplateEditor、ReadinessStamp、ForgottenItemInsight。',
    '',
    '## 像素级 UI 与交互动效规格',
    '- 首屏 390x844 iPhone：顶部 88px 天气丝带；中部 120px 今日情绪插画；清单卡片每项 56-72px，左侧勾选圆，右侧“为什么带”小按钮。',
    '- 视觉语气：优雅、轻盈、卡通但不幼稚；天气风险用小徽章表达，不用恐吓式红色大警告。',
    '- 勾选动效：物品被放入包包的 220ms 轻弹动效；完成 80% 后按钮变亮；100% 出现纸片签章和轻微粒子。',
    '- 可访问性：文字不低于 15pt；关键操作可 VoiceOver 读出；颜色不能作为唯一状态；大字模式清单每行自动增高。',
    '- 截图验收：晴天通勤、雨天约会、降温出差、夜归安全、无定位手动模式五张首屏截图必须与 UI风格馆 DNA 一致。',
    '',
    '## 前端技术栈与状态管理',
    '- 前端：SwiftUI + Observation + SwiftData，iOS 17+；WidgetKit 做桌面小组件；UserNotifications 做温和提醒；CoreLocation 只取必要定位。',
    '- 状态流：WeatherSnapshot -> OutingContext -> RecommendationEngine -> ChecklistSession -> CompletionReceipt。',
    '- 本地状态：UserProfile、BagTemplate、BagItem、ChecklistRun、WeatherCache、ReminderRule。',
    '- 关键界面：TodayOutingView、BagChecklistView、BagTemplateView、ItemReasonSheet、WeatherRiskCard、CompletionReceiptView。',
    '- 错误恢复：天气接口失败使用 WeatherCache；定位拒绝进入城市手动选择；推荐为空回落到基础包清单。',
    '',
    '## 后端服务与领域边界',
    '- 首版后端可为零：天气走系统 WeatherKit 或合规天气 API，本地推荐引擎在端侧完成。',
    '- P1 后端：CloudKit/iCloud 同步用户包模板；可选 Serverless 聚合天气与节假日；不保存精准位置历史。',
    '- 领域边界：WeatherProvider、RecommendationEngine、BagInventory、ReminderScheduler、PrivacyGuard、AnalyticsReceipt。',
    '- 团队边界：产品负责场景库；设计负责 UI风格馆落地；iOS 负责端侧体验；数据负责推荐规则与评估。',
    '',
    '## 数据库、存储与数据模型',
    '- SwiftData 表：UserProfile(id, style, reminderLevel, locationMode)、BagTemplate(id, name, scenario, items)、BagItem(id, name, category, riskTags, defaultPriority)、ChecklistRun(id, date, weatherHash, scenario, completionRate)。',
    '- WeatherSnapshot：temperature、feelsLike、precipitationChance、windSpeed、uvIndex、aqi、hourlyChanges、source、expiresAt。',
    '- RecommendationRule：trigger、itemId、reasonTemplate、priority、seasonality、confidence。',
    '- 索引：ChecklistRun.date、BagItem.category、RecommendationRule.trigger、WeatherSnapshot.expiresAt。',
    '- 存储策略：天气缓存 2 小时；完成记录保留本地；用户可一键清除所有历史。',
    '',
    '## API、接口草案与错误码',
    '- GET WeatherProvider.current(location, timeRange) -> WeatherSnapshot；错误码 WEATHER_UNAVAILABLE、LOCATION_DENIED、CACHE_STALE。',
    '- POST RecommendationEngine.build(context, weather, profile, bagTemplate) -> ChecklistItem[]；错误码 RULE_EMPTY、PROFILE_INCOMPLETE。',
    '- POST ChecklistRun.complete(runId, checkedItems) -> CompletionReceipt；错误码 RUN_EXPIRED、ITEM_CONFLICT。',
    '- CloudKit sync BagTemplate；冲突策略以最近编辑为准，并保留可回滚版本。',
    '- 幂等：同一天同场景重复生成时复用 runId，天气显著变化才触发重新推荐。',
    '',
    '## AI/模型策略与提示词边界',
    '- P0 不依赖大模型：使用规则引擎确保稳定、离线可用、可解释。',
    '- P1 可接入小模型/LLM：把天气、场景和用户偏好转成更温柔有趣的文案，但每条建议必须引用具体天气或场景触发条件。',
    '- 提示词边界：不能给医疗诊断；药品、生理期、夜归安全只做准备提醒；不能基于性别刻板化推断用户必须携带某物。',
    '- 降级：AI 文案失败时使用规则模板；推荐结果不因模型失败而消失。',
    '',
    '## 权限、隐私、安全与审计',
    '- 权限：定位仅用于天气；通知由用户主动开启；健康/日历/路线联动必须单独授权。',
    '- 隐私：默认本地优先；不上传精准位置、包内清单、个人健康提示；CloudKit 同步需明确说明。',
    '- 安全：夜归提醒只给通用安全建议和紧急联系人入口，不追踪用户；所有外部分享必须二次确认。',
    '- 审计：每次推荐保存触发原因摘要，用户可查看“为什么建议我带这个”。',
    '',
    '## 部署、运维、性能与回滚',
    '- 部署：Xcode + Swift Package；WeatherKit entitlement；TestFlight 小范围验证；App Store 审核重点解释定位与隐私。',
    '- 性能：首屏 1 秒内出现缓存清单；天气刷新不阻塞勾选；动画 60fps；离线打开必须可用。',
    '- 监控：本地事件只统计匿名完成率、推荐采纳率、常删物品、天气变化触发次数。',
    '- 回滚：远程规则包出错时回退内置规则；CloudKit 同步失败不影响本地清单。',
    '',
    '## 测试矩阵与验收标准',
    '- 单元：天气规则、推荐排序、清单幂等、隐私模式、缓存过期、错误码。',
    '- 集成：定位授权 -> 天气获取 -> 场景选择 -> 清单生成 -> 勾选完成 -> 本地记录。',
    '- UI：五类天气截图、深浅色模式、大字模式、VoiceOver、离线失败态。',
    '- E2E：雨天通勤、暴晒约会、降温出差、大风骑行、无定位手动城市。',
    '- 成功标准：90 秒完成率 >= 70%；推荐采纳率 >= 55%；用户主观“安心出门”评分 >= 4.4/5。',
    '',
    '## 里程碑与任务拆解',
    '- Day 1：锁定包里晴雨签定位、P0 场景库、物品分类、天气触发规则。',
    '- Day 2：SwiftUI 首屏、清单勾选、完成签章、离线基础包。',
    '- Day 3：WeatherKit/缓存/定位拒绝兜底；补雨天、暴晒、降温、大风规则。',
    '- Week 1：完成 TestFlight 原型，跑 10 位女性真实出门场景访谈。',
    '- Week 2：上线小组件、包模板、隐私说明和 App Store 截图。',
    '',
    '## 角色共识、裁决与来源追溯',
    '- 共识：保留“真实天气 + 包包清单 + 打勾仪式 + 可解释原因”的闭环，不把产品做成普通天气工具。',
    '- 关键冲突：审美席要求卡通温柔，工程席要求离线稳定，反方席要求隐私最小化；主持裁决为“规则引擎优先、AI 文案可选”。',
    '- 被裁掉：首版社交社区、复杂天气图表、强账号体系、购物导流、不可解释的 AI 推荐。',
    '- 吸收：UI风格馆负责视觉 DNA；产品席负责场景库；工程席负责 SwiftUI/WeatherKit/SwiftData；测试席负责真实出门验收。',
    '- 来源：本地发言绑定 personaId、phaseId、sourceMessageId；后续用户访谈与人工审美验收进入 source-audit 和 artifact-review ledger。',
  ].join('\n')
}

function buildSoulPalaceMacPrdMarkdown(
  problem: string,
  selection: CouncilSelection,
  reason: string,
  uiStyleContext: UiMuseumPrdContext,
): string {
  const roster = selection.seats.map((seat) => `${seat.persona.shortName}（${seat.seat.label}）`).join('、')
  const userSentence = compactSnapshotText(redactSensitiveText(problem), 200)
  return [
    '# Soul.md 记忆宫殿 Mac App｜小白智囊团大师共识 PRD',
    '',
    `> 本轮远程模型会议未稳定完成，原因：${redactSensitiveText(reason)}。系统没有假装 deep-model 成功，而是用已蒸馏的独立 Nuwa 方法论包完成本地严苛博弈，保留过程证据并继续交付可返修 PRD。`,
    '',
    '## 产品定位与北极星',
    `- Boss 原始愿望：${userSentence}`,
    '- 一句话定位：Soul.md 记忆宫殿 Mac App 是一款本地优先的个人文章自我蒸馏系统，把 Boss 多年文章、笔记、网页剪藏和对话材料编译成可检索的知识地图、记忆宫殿、反问式访谈和最终 `soul.md` 自我报告。',
    '- 北极星指标：导入 1000+ 篇个人材料后，Boss 能在 30 分钟内得到一份可追溯、可反问、可继续迭代的 `soul.md`，并能指出报告中每个关键判断的来源。',
    '- 核心承诺：不是普通知识库，不是聊天壳，不是人格玄学；它是“个人材料 -> 结构化知识 -> 记忆宫殿 -> 模型访谈 -> 自我报告 -> 下一轮写作/探索”的闭环。',
    `- 入选智囊：${roster}。`,
    '',
    ...renderUiStyleContextBlock(uiStyleContext),
    '',
    '## 目标用户与端到端旅程',
    '- 核心用户：拥有大量原创文章、笔记、长文、网页剪藏、对话记录和项目文档，希望被系统真正理解的创作者、研究者、创业者、独立开发者。',
    '- 首次旅程：选择资料文件夹 -> 本地扫描与脱敏检查 -> 按 Karpathy 式来源/概念/索引编译 -> 生成记忆宫殿房间 -> 模型提出访谈问题 -> Boss 回答 -> 生成 `soul.md`。',
    '- 日常旅程：新增文章 -> 增量编译 -> 记忆宫殿新增房间/物件 -> 系统提示“你的观点出现了什么变化” -> 更新报告与可复用方法论。',
    '- 关键体验：用户感觉系统不是在总结资料，而是在帮自己看见长期的认知纹理、情绪线索、探索方式、创作母题和盲区。',
    '- 失败体验兜底：如果模型失败，仍能得到来源索引、主题聚类、关键词谱系、时间线和待访谈问题，不出现空白结果。',
    '',
    '## P0/P1/P2 与不做清单',
    '- P0：本地资料导入、格式解析、秘密扫描、分块、嵌入/索引、主题聚类、记忆宫殿房间、问题访谈、`soul.md` 报告、来源引用、导出。',
    '- P1：增量同步、语义搜索、时间线变化、写作母题图谱、模型双路评审、报告版本对比、手动修订与确认入记忆。',
    '- P2：多设备同步、私有模型部署、音视频转录、交互式 3D 记忆宫殿、创作建议、人生阶段复盘、自动写作计划。',
    '- 不做清单：不上传原文到不明服务；不在导出中保留 API key；不伪装成心理诊断；不把模型推断当事实；不默认删除/移动原文件；不默认对外分享。',
    '',
    '## 信息架构、页面与组件状态',
    '- 页面 1 导入舱：文件夹选择、格式覆盖、秘密扫描、导入进度、失败文件列表。',
    '- 页面 2 编译台：来源库、分块状态、概念索引、Karpathy 式 Wiki/Index/Outputs 三层结构。',
    '- 页面 3 记忆宫殿：房间、走廊、物件、人物、时间线；每个物件可展开来源与摘要。',
    '- 页面 4 访谈室：GLM5.1 主访谈、DeepSeek V4 反方审查，问题必须来自材料证据或明确标注为推断。',
    '- 页面 5 Soul.md 报告：身份画像、认知方式、感知方式、探索方式、创作方式、情绪模式、长期主题、盲区、下一步问题。',
    '- 页面 6 证据保险柜：引用链、秘密扫描、模型调用记录、版本 diff、人工确认状态。',
    '- 组件状态：空态给导入路径；加载态显示当前文件/分块/房间；失败态列出可修复原因；完成态展示报告、引用和下一次访谈。',
    '',
    '## 像素级 UI 与交互动效规格',
    '- 首屏：左侧资料源与导入状态 280px；中间记忆宫殿/编译进度主画布；右侧 `soul.md` 片段与待确认问题。',
    '- 记忆宫殿：房间卡片使用 UI风格馆 token；每个房间 160-220px，可按主题、年份、人物、情绪和项目过滤。',
    '- 报告阅读：正文宽度 720-820px；引用脚注固定右栏；关键判断悬停显示来源片段和置信度。',
    '- 动效：导入时用“材料进入宫殿”的轻量转场；编译完成使用低调发光，不用夸张粒子；reduced-motion 下全部改成静态进度。',
    '- 截图验收：导入舱、编译台、记忆宫殿、访谈室、报告页、证据保险柜六张截图必须全部继承 UI风格馆 DNA。',
    '',
    '## 前端技术栈与状态管理',
    '- 前端形态：Mac 桌面端优先。若沿用 OpenBasaka 当前技术栈，使用 Electron + React + TypeScript；若新开原生项目，可使用 SwiftUI + AppKit 文件访问桥。',
    '- 推荐给 Codex 的第一版：Electron + React，复用现有 OpenBasaka 数据、工作流、知识库和 UI风格馆，降低迁移成本。',
    '- 状态流：ImportJob -> SourceDocument -> Chunk -> ConceptNode -> PalaceRoom -> InterviewTurn -> SoulReportVersion。',
    '- 关键组件：ImportDock、SecretScanPanel、CompileTimeline、PalaceCanvas、SourceCitationDrawer、InterviewConsole、SoulMarkdownReader、EvidenceVault。',
    '- 错误恢复：解析失败单文件隔离；模型失败保留本地索引；报告生成失败可从访谈问题继续；任何密钥命中必须脱敏后导出。',
    '',
    '## 后端服务与领域边界',
    '- 本地服务：文件扫描、文本抽取、分块、SQLite/FTS、向量索引、引用链、运行日志、报告版本。',
    '- 模型路由：GLM5.1 负责深度综合与访谈生成；DeepSeek V4 负责反方审查、逻辑漏洞、事实边界和工程计划复核。',
    '- 领域边界：Ingestion、SecretScanner、CorpusCompiler、PalaceBuilder、InterviewEngine、SoulReportWriter、EvidenceTracer、WorkflowPublisher。',
    '- 安全边界：读取文件需要 Boss 选择；不删除/移动原文件；不自动外发原文；只保存脱敏运行证据。',
    '',
    '## 数据库、存储与数据模型',
    '- tables：source_documents(id,path,title,type,hash,created_at,imported_at,secret_status)、chunks(id,document_id,range,text_hash,summary,embedding_ref)、concept_nodes(id,label,type,weight,evidence_count)、palace_rooms(id,name,theme,entry_question)、soul_reports(id,version,status,markdown,created_at)。',
    '- 关系表：document_concepts、room_concepts、report_citations、interview_turns、model_runs、secret_findings、workflow_exports。',
    '- 索引：source_documents.hash、chunks.document_id、concept_nodes.label、palace_rooms.theme、soul_reports.created_at、report_citations.report_id。',
    '- 存储策略：原文本地只读引用；摘要和索引写入应用数据库；向量可存本地文件；报告版本可导出 Markdown。',
    '',
    '## API、接口草案与错误码',
    '- POST /imports/start：选择目录，返回 importJobId；错误码 PERMISSION_DENIED、NO_SUPPORTED_FILES、SECRET_SCAN_BLOCKED。',
    '- POST /compile/run：输入 importJobId，返回 conceptGraph、wikiIndex、palaceRooms；错误码 PARSE_FAILED、EMBEDDING_FAILED、INDEX_INCONSISTENT。',
    '- POST /interview/next：输入 reportDraft + evidenceGaps，返回问题、依据和追问策略；错误码 MODEL_TIMEOUT、NO_EVIDENCE、PROMPT_TOO_LONG。',
    '- POST /soul/report：生成 `soul.md`，返回 markdown、citations、confidenceMap；错误码 CITATION_MISSING、UNVERIFIED_CLAIM。',
    '- POST /workflow/publish：把报告生成流程投递到工作流模块，默认 draft，不自动执行外发。',
    '',
    '## AI/模型策略与提示词边界',
    '- GLM5.1：长上下文综合、人生主题提炼、访谈问题生成、报告初稿。',
    '- DeepSeek V4：反方审查、工程拆解、事实边界、引用缺口、Do Not Claim 清单。',
    '- RAG 规则：每个关于 Boss 的关键判断至少挂 2 条来源；没有来源只能写成“假设/待确认问题”。',
    '- 提示词边界：不能进行医疗/心理诊断；不能声称“完全了解 Boss”；不能输出未脱敏密钥；不能把私密原文直接复制进对外报告。',
    '- 质量门：引用覆盖率、未验证断言数、秘密扫描结果、Boss 反馈确认数、报告可读性、工程可执行性。',
    '',
    '## 权限、隐私、安全与审计',
    '- 文件权限：只读导入；删除、移动、重命名原文件必须二次确认。',
    '- 密钥处理：任何 `sk-`、GLM、DeepSeek、token、secret、apikey 模式在 UI、导出、归档、工作流投递中全部自动脱敏。',
    '- 隐私：默认本地；模型调用前显示将发送的摘要级上下文；可选择“只用本地索引生成结构，不调用云模型”。',
    '- 审计：每次导入、模型调用、报告生成、导出、工作流投递写入 operating_events 或对应运行账本。',
    '',
    '## 部署、运维、性能与回滚',
    '- 部署：先作为 OpenBasaka 小白/知识/记忆的可执行工作流落地，再决定是否拆成独立 Mac App。',
    '- 性能：1 万篇文档以内导入可断点续跑；UI 不被模型阻塞；报告生成展示阶段进度；引用检索 500ms 以内返回本地结果。',
    '- 回滚：每次报告生成保留版本；失败时回到上一版 soul.md；模型提示词和索引配置可版本化。',
    '- 可观测：导入数量、失败文件、引用覆盖率、模型耗时、未验证断言、用户确认数、工作流投递状态。',
    '',
    '## 测试矩阵与验收标准',
    '- 单元：文件解析、秘密扫描、分块、FTS 搜索、概念聚类、引用链、报告脱敏。',
    '- 集成：导入 100 篇样本 -> 编译 -> 记忆宫殿 -> 访谈 -> 生成 soul.md -> 导出 -> 工作流投递。',
    '- UI：导入舱、编译台、记忆宫殿、访谈室、报告页、证据保险柜无横向溢出；长标题和长引用不遮挡。',
    '- 安全：含 API key 的输入必须在 Markdown、HTML、归档、工作流草稿里全部变成 `[REDACTED]`。',
    '- 成功标准：报告关键判断引用覆盖率 >= 85%；Boss 确认“像我”的段落 >= 70%；未验证断言可一键转为追问。',
    '',
    '## 里程碑与任务拆解',
    '- Day 1：修导出命名、密钥脱敏、项目名推导、工作流投递草稿。',
    '- Day 2：做本地导入和秘密扫描 POC，跑 20 篇文章样本。',
    '- Day 3：做 Karpathy 式 Wiki/Index/Outputs 编译和引用链。',
    '- Week 1：完成记忆宫殿房间、访谈室、soul.md 报告初稿。',
    '- Week 2：接 GLM5.1/DeepSeek V4 双模型评审，完成 1000+ 文档压力测试。',
    '',
    '## 给 Codex 的执行合同',
    '- Target：在 OpenBasaka 内先做 Soul.md 记忆宫殿 Mac App 工作流原型，能导入本地文章、编译索引、生成记忆宫殿和 soul.md。',
    '- Do Not Do：不要外发密钥，不要删除移动原文，不要假装心理诊断，不要把 UI风格馆只写成一句参考。',
    '- Acceptance Criteria：能跑 20 篇样本文档；导出 PRD/报告无密钥；每个报告结论有引用或待确认标签；生成工作流草稿。',
    '- Editable Scope：OpenBasaka 小白、知识、记忆、工作流、运行历史相关模块；必要时新增独立 proof-of-concept 目录。',
    '- Must Preserve：当前沙盘主视觉、UI风格馆 token、小白智囊团运行历史、安全确认边界。',
    '- Final Report：列出文件、命令、运行证据、未验证风险和下一步扩展到 1000+ 文档的方法。',
    '',
    '## 角色共识、裁决与来源追溯',
    '- 共识：先做本地可验证的资料编译和引用链，再让 GLM5.1/DeepSeek V4 做深度访谈与反方审查。',
    '- 关键冲突：愿景席要求“像灵魂镜子”，工程席要求“先能导入和引用”，安全席要求“先脱敏和本地权限”。主持裁决为“本地索引与证据链先行，模型人格化表达后置”。',
    '- 被裁掉：一上来做 3D 华丽宫殿、无引用的人格报告、把 API key 写进任务、默认上传全文、没有版本回滚的报告生成。',
    '- 吸收：UI风格馆负责记忆宫殿视觉 DNA；知识模块负责编译；记忆宫殿负责长期回溯；工作流模块负责把生成过程复用化。',
    '- 来源：本地发言绑定 personaId、phaseId、sourceMessageId；后续真实文章样本、Boss 人工确认和审美验收进入 evidence ledger。',
  ].join('\n')
}

function buildLocalMasterPrdMarkdown(
  problem: string,
  selection: CouncilSelection,
  reason: string,
  uiStyleContext: UiMuseumPrdContext,
  internetResearch?: CouncilInternetResearchPack,
): string {
  if (isWeatherBagIosAppProblem(problem)) {
    return appendInternetResearchPrdBlock(buildWeatherBagIosPrdMarkdown(problem, selection, reason, uiStyleContext), internetResearch)
  }
  if (isPersonalCorpusSoulMacAppProblem(problem)) {
    return appendInternetResearchPrdBlock(buildSoulPalaceMacPrdMarkdown(problem, selection, reason, uiStyleContext), internetResearch)
  }
  const roster = selection.seats.map((seat) => `${seat.persona.shortName}（${seat.seat.label}）`).join('、')
  const userSentence = compactSnapshotText(redactSensitiveText(problem), 140)
  return appendInternetResearchPrdBlock([
    '# 小白智囊团本地 Nuwa 方法论共识 PRD',
    '',
    `> 本轮远程模型会议未稳定完成，原因：${reason}。系统没有假装 deep-model 成功，而是用已蒸馏的独立 Nuwa 方法论包完成本地严苛博弈，保留过程证据并继续交付可返修 PRD。`,
    '',
    '## 产品定位与北极星',
    `- 一句话定位：围绕「${userSentence}」生成能被产品、设计、前端、后端、测试直接执行的大师级方案。`,
    '- 北极星：Boss 输入一句复杂愿望后，系统必须输出可执行判断、可追溯共识、全栈蓝图和下一步任务。',
    `- 入选智囊：${roster}。`,
    '',
    ...renderUiStyleContextBlock(uiStyleContext),
    '',
    '## 目标用户与端到端旅程',
    '- 目标用户：有真实想法但不想先写模板、不懂如何拆前后端和验收的 Boss / 创业者 / 产品负责人。',
    '- 核心场景：输入真实问题 -> 智囊团抽取方法论 -> 激烈脑暴与反方质询 -> 主持裁决 -> 生成完整 PRD -> 回看共识追溯 -> 进入行动包。',
    '- 首次进入：首屏只要求输入一句任务，系统马上显示阶段进度、当前争论和最终产物入口。',
    '',
    '## P0/P1/P2 与不做清单',
    '- P0：输入区、推荐编队、六阶段博弈、过程回看、完整 PRD、质量闸门、共识追溯、复制/导出。',
    '- P1：角色替换、来源级人工复核、用户验证账本、人工审美验收、历史长跑复用。',
    '- P2：多模型长跑、跨项目记忆复盘、外部协作、自动生成工程票。',
    '- 不做清单：不把证据 fail 伪装成 95；不让模型失败导致空白；不默认外发、不删除文件、不执行高风险操作。',
    '',
    '## 信息架构、页面与组件状态',
    '- 页面：首屏指挥舱、输入工作台、推荐编队、实时博弈剧场、关系地图、裁决账本、PRD 阅读器、证据保险柜。',
    '- 组件状态：空态显示下一步；加载态显示当前阶段；失败态切换本地 Nuwa 会场；完成态展示 PRD、追溯和行动包。',
    '- 交互：主 CTA 只有一个“开始”，从输入自动跑到共识结果；过程回看支持上一页/下一页和历史胶片。',
    '',
    '## 像素级 UI 与交互动效规格',
    '- 布局：主工作区避免横向滚动；剧场弹窗居中，左右翻页按钮固定，底部缩略条可横向滚动但不遮挡正文。',
    '- 尺寸：主要按钮高度 40-48px；卡片边距 12-16px；正文行高 1.5-1.7；长标题自动换行。',
    '- 反馈：每个阶段切换要有明确状态文字；质量/证据标签只能显示当前状态，不能用装饰性成功色误导。',
    '',
    '## 前端技术栈与状态管理',
    '- 前端：Electron + React + TypeScript。CouncilMacApp 负责状态机，CouncilMasterPrdView 展示最终 PRD，CouncilTheaterViews 展示剧场和关系。',
    '- 状态：problem、selection、matching、running、activated、messages、liveSnapshots、result、runtimeHistory 必须单向推进。',
    '- 错误恢复：模型会议失败时写入 error snapshot，然后生成 local-nuwa-debate session，不能让 activated 锁死重试。',
    '',
    '## 后端服务与领域边界',
    '- 后端服务：TeamSession 编排、MatchGate、Nuwa 包预检、质量闸门、运行历史、用户验证、人工审稿。',
    '- 领域边界：小白智囊团只生成建议、PRD、行动包和证据，不自动执行删除、外发、付款、权限或密钥相关操作。',
    '',
    '## 数据库、存储与数据模型',
    '- 核心实体：council_run、team_session、team_message、debate_scene、verdict_ledger、quality_gate、runtime_evidence、artifact_review、user_validation。',
    '- 索引：runId、personaId、phaseId、createdAt、status、sourceMessageId。',
    '- 存储：PRD Markdown、HTML 导出、运行摘要和证据引用；不保存 API key、账号、原始隐私长日志。',
    '',
    '## API、接口草案与错误码',
    '- POST /council/match：输入 problem，返回 selection、matchGate、stageTrace。',
    '- POST /council/run：输入 problem + selection，返回 runId、snapshots、messages、prd、qualityGate、consensusTrace。',
    '- GET /council/runs/:id：回看 PRD、剧场、关系、裁决、证据。',
    '- 错误码：MODEL_TIMEOUT、MODEL_INVALID_JSON、SESSION_EMPTY、LOCAL_NUWA_FALLBACK、QUALITY_NEEDS_REVISION。',
    '',
    '## AI/模型策略与提示词边界',
    '- 模型负责：编队裁判、六阶段发言、反方质询、PRD 成稿、质量返修。',
    '- 本地 Nuwa 负责：方法论提取、角色边界、反方结构、失败时的可追溯兜底。',
    '- 降级边界：降级结果必须标记 local-nuwa-fallback，不能计入真实 deep-model 长跑。',
    '',
    '## 权限、隐私、安全与审计',
    '- 权限：默认本地运行；外发、删除、付款、账号、密钥和权限修改必须 Boss 确认。',
    '- 隐私：用户验证只存匿名摘要和导出引用，不存私人原文或账号。',
    '- 审计：每次运行写入 runtime evidence、quality gate、consensus trace 和证据缺口。',
    '',
    '## 部署、运维、性能与回滚',
    '- 部署：Electron 本地优先；模型路由可配置；本地 Nuwa 会场无网络也能生成结构化过程。',
    '- 性能：匹配阶段可快速返回，深度模型阶段可长跑；UI 必须持续显示阶段进度。',
    '- 回滚：质量门不通过时保留返修补丁；模型失败时回滚到本地会场而不是空白。',
    '',
    '## 测试矩阵与验收标准',
    '- 单元：match-gate JSON 修复、workflow fallback、quality gate、runtime evidence、certification。',
    '- 集成：一键输入后必须调用匹配、进入博弈、产生 messages、生成 PRD、可复制导出。',
    '- UI：首屏 CTA、过程回看、PRD 阅读器、证据保险柜无遮挡无横向溢出。',
    '- 验收：至少 18 幕剧场、12 条关系、8 条裁决账本、90+ 质量门；95 声称仍需真人用户和人工审美验证。',
    '',
    '## 里程碑与任务拆解',
    '- Day 1：修主 CTA 和 workflow fallback，保证任何模型异常都有过程和结果。',
    '- Day 2：补真实运行历史与证据回看。',
    '- Week 1：用 10 个复杂任务跑小白智囊团，记录质量门与失败模式。',
    '- Week 2：组织 5-8 名真实小白用户验证，并让 Boss 做人工审美终审。',
    '',
    '## 角色共识、裁决与来源追溯',
    '- 共识：先让每位智者提取自己的公开方法论，再进行反方质询，最后由主持裁决吸收成 PRD 条款。',
    '- 保留：方法论差异、反对意见、像素级 UI、全栈技术契约和验收矩阵。',
    '- 裁掉：空泛灵感、没有接口/数据/测试的概念、没有证据却自称 95 的表达。',
    '- 来源：本地发言会绑定 personaId、phaseId、sourceMessageId；后续来源级人工复核进入 source-audit ledger。',
  ].join('\n'), internetResearch)
}

async function createCouncilTeam(
  problem: string,
  selection: CouncilSelection,
  activatedAgents: CouncilActivatedAgent[],
): Promise<Team> {
  const byPersonaId = new Map(activatedAgents.map((item) => [item.persona.id, item.agent]))
  const agents: TeamAgent[] = selection.seats
    .map((seat): TeamAgent | null => {
      const agent = byPersonaId.get(seat.persona.id)
      if (!agent) return null
      return {
        agentId: agent.id,
        personaId: seat.persona.id,
        personaName: seat.persona.name,
        role: `${seat.seat.label}：${seat.seat.mission}`,
        skills: Array.from(new Set([...seat.persona.defaultSkills, 'prd', 'review'])),
        systemPromptOverride: [
          seat.persona.promptSeed,
          `本轮席位：${seat.seat.label}。`,
          `席位任务：${seat.seat.mission}`,
          `推荐理由：${seat.reasons.join('；') || '匹配本轮问题画像'}`,
          `匹配评分：Nuwa ${seat.scoreFactors.nuwaCredibility} / Dream ${seat.scoreFactors.dreamAlignment} / 技能 ${seat.scoreFactors.skillMaturity} / 证据 ${seat.scoreFactors.evidenceStrength} / 反方 ${seat.scoreFactors.oppositionValue}`,
        ].join('\n'),
      }
    })
    .filter((item): item is TeamAgent => item !== null)

  const teamId = await createTeam({
    name: `小白智囊团｜${problem.slice(0, 22) || 'PRD'}`,
    description: `由小白模块自动编队，围绕 PRD 闭环进行思想原型博弈、共识收束和可追溯技术蓝图。`,
    teamType: 'brainstorm',
    agents,
    config: {
      communicationPattern: 'round-robin',
      workflowType: 'prd',
      executionMode: 'advisory',
      maxRounds: XIAOBAI_COUNCIL_DEBATE_PHASES.length,
      debatePhases: XIAOBAI_COUNCIL_DEBATE_PHASES,
      temperature: 0.72,
      capabilities: ['prd', 'review', 'web-search', 'vision'],
    },
  })
  const team = await getTeam(teamId)
  if (!team) throw new Error('小白智囊团创建失败。')
  return team
}

function buildCouncilTopic(
  problem: string,
  selection: CouncilSelection,
  context: {
    creativeEnhancement: CouncilCreativeEnhancement
    uiStyleContext: UiMuseumPrdContext
    agentDreamStates: AgentDreamState[]
    runtimeWisdomContext?: CouncilRuntimeWisdomContext
    runtimeCalibrationPlan?: CouncilRuntimeCalibrationPlan
    internetResearch: CouncilInternetResearchPack
  },
): string {
  const profile = selection.profile
  const roster = selection.seats
    .map(
      (seat, index) =>
        `${index + 1}. ${seat.persona.name}｜${seat.seat.label}｜${seat.reasons.join('；') || seat.seat.mission}`,
    )
    .join('\n')
  const dreamLines = context.agentDreamStates
    .map((dream) => {
      const seat = selection.seats.find((item) => item.persona.id === dream.personaId)
      return `- ${seat?.persona.name || dream.personaId}: ${dream.currentDream} 下一阶段：${dream.nextAspiration}`
    })
    .join('\n')
  const gate = selection.matchGate
  const gateLines = [
    ...gate.explanation,
    `Nuwa 覆盖：${gate.readiness.nuwaCoverage}`,
    `技能成熟：${gate.readiness.skillMaturity}`,
    `证据强度：${gate.readiness.evidenceStrength}`,
    `反方覆盖：${gate.readiness.riskCoverage}`,
    `速度成本：${gate.readiness.speedCost}`,
  ].join('\n- ')
  const finalTeam = gate.finalTeam
    .map((item, index) => `${index + 1}. ${item.personaName}｜${item.role}｜score ${item.score}｜${item.reasons.join('；')}`)
    .join('\n')
  const runDate = formatCouncilPrdDate(new Date())

  return `# 小白智囊团 PRD 闭环任务

## 用户问题
${problem}

## 本轮日期与文档硬规则
- 今天/最后更新必须写 ${runDate}，禁止使用 2024、样例日期或模型自行编造的旧日期。
- 最终产物是大师级 PRD 成稿，不是会议纪要、图文包或后台日志。
- 每条关键 PRD 条款必须尽量标注来源：由谁提出、被谁质询、主持如何裁决吸收、哪些方案被裁掉。

## 问题画像
- artifactIntent: ${profile.artifactIntent}
- difficulty: ${profile.difficulty}/5
- domains: ${profile.domains.join(' / ')}
- needsEvidence: ${profile.needsEvidence ? 'yes' : 'no'}
- needsEngineering: ${profile.needsEngineering ? 'yes' : 'no'}
- needsVisual: ${profile.needsVisual ? 'yes' : 'no'}
- riskLevel: ${profile.riskLevel}

## 自动编队
${roster}

## CouncilMatchGate：先匹配再解决
- ${gateLines}

### 最终编队依据
${finalTeam}

## Agent 动态 Dream
${dreamLines || '本轮没有已激活 agent dream。'}

${context.runtimeWisdomContext?.promptFragment || '## 运行智慧反馈\n尚无历史运行反馈。本轮要把真实证据、fallback、质量闸门和用户验证缺口完整留证，供下一轮学习。'}

${context.runtimeCalibrationPlan?.promptFragment || '## 95 真实长跑评测协议\n尚无校准协议。本轮必须记录是否满足 deep-model、120s、完整 trace、90+ 质量门、全栈 PRD 可实施性和真实小白用户验证缺口。'}

${context.internetResearch.promptFragment}

${context.creativeEnhancement.promptFragment}

${context.uiStyleContext.promptFragment}

## 输出要求
请严格走六阶段大师博弈：追问 -> 独立主张 -> 发散 -> 冲突质询 -> 主持裁决 -> 共识成稿。每个阶段都要有观点碰撞，不要为了和气而平均化。最终产物必须包含：
1. 项目定位、目标用户、用户旅程、P0/P1/P2、不做清单。
2. 关键页面、组件状态、空态/加载/失败态、动效节奏和小白理解路径。
3. Agent/模型策略、数据模型、独立 SOUL、私有记忆、Telegram 可选外部触达、归档与审计。
4. 技术架构、接口草案、异常处理、隐私安全、性能和降级。
5. 全技术栈蓝图：前端架构、后端服务、数据库表/索引、API 请求响应草案、状态流、模型调用、权限、安全、部署、监控、回滚。
6. 测试与验收：单元、集成、UI、E2E、视觉回归、性能、可访问性、真实运行、用户验收。
7. 创意孵化器增强条款：哲思内核、设计表达、趣味性、直觉可用性、留存机制、惊喜机制、体验隐喻和首版验证实验。
8. 博弈裁决记录：保留的分歧、被裁掉的方案、关键裁决理由、突破性创意、首版验证实验和共识形成追溯。
9. 超顶级 PRD 评分尺：真实用户洞察、市场判断、功能完整度、UI 风格馆与像素落地、工程可开工性、商业验证、证据链、行动闭环。
10. 上市与增长：竞品/替代方案、差异化赢法、MVP 验证、冷启动、留存机制、商业模式、上线风险和回滚策略。
11. 联网证据：凡是市场、竞品、实时、政策、价格、模型能力、天气或外部事实，必须引用联网证据包 [W1] 等来源；没有来源只能列为待查证。

角色必须记住：自己是公开思想原型，不是真人本人，不代表本人授权；默认只在本地 Openbasaka、群策和控制面板生效，Telegram 不是默认同步目标。`
}
