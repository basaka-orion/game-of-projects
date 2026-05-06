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
import { type CouncilMatchGate, type CouncilSelection } from './selector'
import type { CouncilNuwaSourceAuditLedger } from './source-audit'
import { createTeam, getTeam } from '../teams/store'
import { runTeamSession } from '../teams/engine'
import type { Team, TeamAgent, TeamDebatePhase, TeamMessage, TeamSession } from '../teams/types'
import { buildUiMuseumPrdContext, type UiMuseumPrdContext } from '../ui-museum/context'

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
    instruction: '把最终共识转成大师级 PRD、全技术栈蓝图、前端/后端/API/数据库/AI/安全/部署/测试/验收和分幕追溯，明确首版实验。',
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
  onProgress?: (message: TeamMessage) => void
  onSnapshot?: (snapshot: CouncilLiveRunSnapshot) => void
}

export type CouncilLiveRunSnapshotStatus =
  | 'match-ready'
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
  const session = await runTeamSession(
    team,
    buildCouncilTopic(problem, selection, {
      creativeEnhancement,
      uiStyleContext,
      agentDreamStates,
      runtimeWisdomContext: input.runtimeWisdomContext,
      runtimeCalibrationPlan: input.runtimeCalibrationPlan,
    }),
    (message) => {
      liveMessages.push(message)
      input.onProgress?.(message)
      emitSnapshotFromTeamMessage(message, emitSnapshot, liveMessages, completedPhaseIds, selection.seats.length)
    },
    { uiStyleContext, debatePhases: XIAOBAI_COUNCIL_DEBATE_PHASES },
  )
  let prdMarkdown = normalizeCouncilMasterPrdMarkdown(session.summary, {
    problem,
    selection,
    generatedAt: new Date(runStartedAt),
  })
  emitSnapshot({
    status: 'synthesis',
    headline: '六阶段博弈完成，正在把分歧收束成可开工 PRD',
    detail: `本轮已收到 ${session.messages.filter((message) => message.kind === 'brief').length} 条角色发言，开始进入大师级 PRD 结构化闸门。`,
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
  })
  emitSnapshot({
    status: 'quality',
    headline: `质量闸门初评：${qualityGate.score}/100`,
    detail: qualityGate.summary,
    qualityScore: qualityGate.score,
    gateStatus: qualityGate.finalGateStatus,
  })
  for (let round = 1; round <= 2 && qualityGate.status !== 'approved'; round += 1) {
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
  if (!/##\s+共识形成追溯/.test(prdMarkdown)) {
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
    headline: `代表性产物完成：${theater.scenes.length} 幕剧场，质量 ${qualityGate.score}/100`,
    detail: runtimeEvidence.deepRunCertification.proofSummary || runtimeEvidence.deepRunCertification.blockers.join('；') || '运行证据账本已生成。',
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

角色必须记住：自己是公开思想原型，不是真人本人，不代表本人授权；默认只在本地 Openbasaka、群策和控制面板生效，Telegram 不是默认同步目标。`
}
