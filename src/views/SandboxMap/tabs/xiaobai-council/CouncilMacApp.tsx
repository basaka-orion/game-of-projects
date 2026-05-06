import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { archiveOutput } from '../../../../lib/knowledge/outputs'
import {
  buildCouncilAcceptanceReview,
  renderCouncilAcceptanceReviewMarkdown,
} from '../../../../lib/xiaobai-council/acceptance-review'
import { renderCouncilActionPackMarkdown } from '../../../../lib/xiaobai-council/action-pack'
import {
  clearCouncilArtifactReviewLedger,
  loadCouncilArtifactReviewLedger,
  renderCouncilArtifactReviewMarkdown,
  saveCouncilArtifactReviewRecord,
  type SaveCouncilArtifactReviewInput,
} from '../../../../lib/xiaobai-council/artifact-review'
import {
  buildCouncil95CertificationGate,
  renderCouncil95CertificationMarkdown,
} from '../../../../lib/xiaobai-council/certification'
import { COUNCIL_PERSONAS, type CouncilPersona } from '../../../../lib/xiaobai-council/personas'
import { buildCouncilCreativeEnhancement, type CouncilCreativeEnhancement } from '../../../../lib/xiaobai-council/creative-enhancement'
import { COUNCIL_DISTILLATION_STATUS_LABELS } from '../../../../lib/xiaobai-council/distillation'
import { buildCouncilDebateTheater, renderCouncilDebateTheaterMarkdown } from '../../../../lib/xiaobai-council/debate-theater'
import { renderCouncilDeliveryModesMarkdown, type CouncilAudienceMode } from '../../../../lib/xiaobai-council/delivery-modes'
import {
  buildCouncilNuwaEvidencePack,
  buildCouncilNuwaEvidenceRegistry,
  renderCouncilNuwaEvidenceRegistryMarkdown,
} from '../../../../lib/xiaobai-council/distillation-evidence'
import { renderCouncilExcellenceAuditMarkdown } from '../../../../lib/xiaobai-council/excellence-audit'
import { runCouncilMatchGate, type CouncilMatchProgressEvent } from '../../../../lib/xiaobai-council/match-gate'
import { buildCouncilPersonaProfile, type CouncilPersonaProfile } from '../../../../lib/xiaobai-council/profile'
import { renderCouncilQualityGateMarkdown } from '../../../../lib/xiaobai-council/quality-gate'
import {
  buildCouncilConsensusTrace,
  renderCouncilConsensusTraceMarkdown,
  validateCouncilMasterPrd,
} from '../../../../lib/xiaobai-council/master-prd'
import {
  buildCouncilRuntimeCalibrationPlan,
  renderCouncilRuntimeCalibrationMarkdown,
} from '../../../../lib/xiaobai-council/runtime-calibration'
import { renderCouncilRuntimeEvidenceMarkdown } from '../../../../lib/xiaobai-council/runtime-evidence'
import {
  clearCouncilRuntimeHistory,
  loadCouncilRuntimeHistory,
  renderCouncilRuntimeHistoryMarkdown,
  saveCouncilRuntimeHistoryRecord,
  type CouncilRuntimeHistoryLedger,
} from '../../../../lib/xiaobai-council/runtime-history'
import {
  buildCouncilRuntimeWisdomContext,
  renderCouncilRuntimeWisdomMarkdown,
} from '../../../../lib/xiaobai-council/runtime-wisdom'
import {
  clearCouncilNuwaSourceAuditLedger,
  loadCouncilNuwaSourceAuditLedger,
  renderCouncilNuwaSourceAuditMarkdown,
  saveCouncilNuwaSourceAuditRecord,
  type SaveCouncilNuwaSourceAuditInput,
} from '../../../../lib/xiaobai-council/source-audit'
import {
  renderCouncilNuwaLocalPreflightMarkdown,
  runCouncilNuwaLocalPreflight,
  type CouncilNuwaLocalPreflightReport,
} from '../../../../lib/xiaobai-council/source-preflight'
import {
  clearCouncilUserValidationLedger,
  loadCouncilUserValidationLedger,
  renderCouncilUserValidationMarkdown,
  saveCouncilUserValidationRecord,
  type SaveCouncilUserValidationInput,
} from '../../../../lib/xiaobai-council/user-validation'
import { runCouncilPrdWorkflow, type CouncilLiveRunSnapshot, type CouncilPrdRunResult } from '../../../../lib/xiaobai-council/workflow'
import { type CouncilSelection, type CouncilSelectedSeat } from '../../../../lib/xiaobai-council/selector'
import type { TeamMessage } from '../../../../lib/teams/types'
import { buildUiMuseumPrdContext } from '../../../../lib/ui-museum/context'
import { UI_STYLE_ITEMS } from '../../../../lib/ui-museum/catalog'
import { CouncilActionPackView } from './CouncilActionPackView'
import { CouncilAcceptanceReviewView } from './CouncilAcceptanceReviewView'
import { CouncilArtifactReviewView } from './CouncilArtifactReviewView'
import CouncilDebateStage from './CouncilDebateStage'
import { CouncilDeliveryModePanel } from './CouncilDeliveryModeViews'
import { CouncilExcellenceAuditView } from './CouncilExcellenceAuditView'
import { CouncilNuwaEvidenceView } from './CouncilNuwaEvidenceView'
import { CouncilRelationMap, DebateTheaterView, VerdictLedgerPanel } from './CouncilTheaterViews'
import { CouncilRuntimeHistoryView } from './CouncilRuntimeHistoryView'
import { CouncilRuntimeEvidenceView } from './CouncilRuntimeEvidenceView'
import { CouncilRuntimeWisdomView } from './CouncilRuntimeWisdomView'
import { CouncilRuntimeCalibrationView } from './CouncilRuntimeCalibrationView'
import { CouncilUserValidationView } from './CouncilUserValidationView'
import { CouncilNuwaSourceAuditView } from './CouncilNuwaSourceAuditView'
import { Council95CertificationView } from './Council95CertificationView'
import { CouncilMasterPrdView } from './CouncilMasterPrdView'
import './CouncilMacApp.css'

const SAMPLE_PROMPT =
  '做一个小白也能用的 AI 项目 PRD 生成器：自动选择最合适的思想原型 agent，严苛博弈，最后给出大师级完整 PRD、全技术栈蓝图和共识形成追溯。'

const WORKFLOW_STEPS = [
  '输入问题',
  '匹配闸门',
  '推荐编队',
  '确认激活',
  '实时博弈',
  '共识 PRD',
  '质量闸门',
  '共识追溯',
]

const DEBATE_PHASES = [
  { id: 'clarify', label: '追问', intent: '逼出真正问题' },
  { id: 'independent', label: '独立主张', intent: '先分开想' },
  { id: 'diverge', label: '发散', intent: '扩大可能性' },
  { id: 'conflict', label: '冲突质询', intent: '正面拆解' },
  { id: 'verdict', label: '主持裁决', intent: '取舍定案' },
  { id: 'consensus', label: '共识成稿', intent: '落成 PRD' },
]

const LOCAL_WORKSPACE_ROOT = '/Users/apple/Desktop/【项目的游戏】'
const LOCAL_DOWNLOADS_ROOT = '/Users/apple/Downloads'

const SIGNATURE_PROMISES = [
  '首屏就惊艳：先给判断，不先丢一篇长文。',
  '3 分钟就有行动：只显示现在该做什么、保留什么、裁掉什么。',
  '导出物能直接发给别人：PRD、共识追溯、行动包和一页决策简报都能独立阅读。',
  '证据链不自欺：机器强就写强，真人/审美没过就明确阻塞。',
]

function compactDisplay(value: string, max = 120): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

export default function CouncilMacApp() {
  const [problem, setProblem] = useState('')
  const [selection, setSelection] = useState<CouncilSelection | null>(null)
  const [messages, setMessages] = useState<TeamMessage[]>([])
  const [result, setResult] = useState<CouncilPrdRunResult | null>(null)
  const [matching, setMatching] = useState(false)
  const [matchEvents, setMatchEvents] = useState<CouncilMatchProgressEvent[]>([])
  const [matchError, setMatchError] = useState('')
  const [running, setRunning] = useState(false)
  const [activated, setActivated] = useState(false)
  const [liveSnapshots, setLiveSnapshots] = useState<CouncilLiveRunSnapshot[]>([])
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [preferredStyleIds, setPreferredStyleIds] = useState<string[]>([])
  const [creativePreview, setCreativePreview] = useState<CouncilCreativeEnhancement | null>(null)
  const [profilePersona, setProfilePersona] = useState<CouncilPersona | null>(null)
  const [personaProfile, setPersonaProfile] = useState<CouncilPersonaProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [theaterSceneIndex, setTheaterSceneIndex] = useState(0)
  const [audienceMode, setAudienceMode] = useState<CouncilAudienceMode>('boss-review')
  const [runtimeHistory, setRuntimeHistory] = useState<CouncilRuntimeHistoryLedger>(() => loadCouncilRuntimeHistory())
  const [userValidationLedger, setUserValidationLedger] = useState(() => loadCouncilUserValidationLedger())
  const [artifactReviewLedger, setArtifactReviewLedger] = useState(() => loadCouncilArtifactReviewLedger())
  const [nuwaSourceAuditLedger, setNuwaSourceAuditLedger] = useState(() => loadCouncilNuwaSourceAuditLedger())
  const [nuwaPreflight, setNuwaPreflight] = useState<CouncilNuwaLocalPreflightReport | null>(null)
  const [nuwaPreflightRunning, setNuwaPreflightRunning] = useState(false)
  const [nuwaPreflightError, setNuwaPreflightError] = useState('')

  const progressMessages = messages.filter((message) => message.kind !== 'reflection' && (message.kind === 'progress' || message.role === 'system'))
  const briefMessages = messages.filter((message) => message.kind === 'brief')
  const reflectionMessages = messages.filter((message) => message.kind === 'reflection')
  const artifactMessage = messages.find((message) => message.kind === 'artifact')
  const finalPrd = artifactMessage?.content || result?.session.summary || ''
  const selectedPersonaIds = useMemo(
    () => new Set(selection?.seats.map((seat) => seat.persona.id) || []),
    [selection],
  )
  const hiddenPersonas = useMemo(
    () => COUNCIL_PERSONAS.filter((persona) => !selectedPersonaIds.has(persona.id)),
    [selectedPersonaIds],
  )
  const matchGate = selection?.matchGate || result?.matchGate || null
  const visibleMatchEvents = matchEvents.length ? matchEvents : matchGate?.stageTrace || []
  const latestMatchEvent = visibleMatchEvents[visibleMatchEvents.length - 1]
  const latestSnapshot = liveSnapshots[liveSnapshots.length - 1]
  const visibleSnapshots = liveSnapshots.slice(-7).reverse()
  const phaseStats = useMemo(
    () =>
      DEBATE_PHASES.map((phase, index) => {
        const phaseMessages = briefMessages.filter((message) => {
          const phaseId = String(message.metadata?.phaseId || '')
          const phaseLabel = String(message.metadata?.phaseLabel || message.metadata?.phase || '')
          return phaseId === phase.id || phaseLabel.includes(phase.label)
        })
        const latest = phaseMessages[phaseMessages.length - 1]
        const latestSnapshotForPhase = [...liveSnapshots].reverse().find((snapshot) =>
          snapshot.phaseId === phase.id || snapshot.phaseLabel?.includes(phase.label),
        )
        const hasLaterPhase = DEBATE_PHASES.slice(index + 1).some((nextPhase) =>
          briefMessages.some((message) => {
            const phaseId = String(message.metadata?.phaseId || '')
            const phaseLabel = String(message.metadata?.phaseLabel || message.metadata?.phase || '')
            return phaseId === nextPhase.id || phaseLabel.includes(nextPhase.label)
          }),
        )
        return {
          ...phase,
          count: phaseMessages.length,
          latestSpeaker: latest?.agentName || '',
          status: result || latestSnapshotForPhase?.status === 'phase-complete' || hasLaterPhase
            ? 'done'
            : phaseMessages.length || latestSnapshotForPhase
              ? 'active'
              : running && index === 0 && briefMessages.length === 0
                ? 'active'
                : 'pending',
          liveDetail: latestSnapshotForPhase?.headline || latestSnapshotForPhase?.detail || '',
        }
      }),
    [briefMessages, liveSnapshots, result, running],
  )
  const latestBrief = briefMessages[briefMessages.length - 1]
  const latestProgress = progressMessages[progressMessages.length - 1]
  const latestRunSignal = latestBrief || latestProgress
  const currentRunHeadline = result
    ? `已形成 ${result.debateScenes.length} 幕可追溯剧场`
    : latestSnapshot
      ? latestSnapshot.headline
      : running
        ? latestRunSignal?.content.slice(0, 92) || '六阶段大师博弈正在推进'
      : matching
        ? latestMatchEvent?.detail || 'CouncilMatchGate 正在深度匹配'
        : selection
          ? '推荐队伍已成型，等待 Boss 激活'
          : '输入问题后先匹配，再开会'
  const currentStep = result?.consensusTrace
    ? 7
    : result?.qualityGate
      ? 6
      : finalPrd
        ? 5
        : running || briefMessages.length
          ? 4
          : activated
            ? 3
            : selection
              ? 2
              : matching || matchEvents.length
                ? 1
                : 0
  const uiStyleContext = useMemo(() => {
    const seed = [
      problem || SAMPLE_PROMPT,
      selection?.profile.domains.join(' / ') || '',
      selection?.seats.map((seat) => `${seat.persona.name} ${seat.seat.label}`).join('\n') || '',
      creativePreview?.promptFragment || '',
    ].join('\n\n')
    return result?.uiStyleContext || buildUiMuseumPrdContext(seed, preferredStyleIds)
  }, [creativePreview?.promptFragment, preferredStyleIds, problem, result?.uiStyleContext, selection])
  const styleOptions = useMemo(() => {
    const ids = new Set([
      ...uiStyleContext.styleIds,
      'agentic-os',
      'copilot-ai',
      'anthropic-serif',
      'holographic',
      'kinetic',
      'liquid-glass',
      'spatial',
      'data-ink',
    ])
    return Array.from(ids)
      .map((id) => UI_STYLE_ITEMS.find((item) => item.id === id))
      .filter((item): item is (typeof UI_STYLE_ITEMS)[number] => Boolean(item))
      .slice(0, 9)
  }, [uiStyleContext.styleIds])
  const liveTheater = useMemo(() => {
    if (result) {
      return {
        scenes: result.debateScenes,
        debateMap: result.debateMap,
        verdictLedger: result.verdictLedger,
      }
    }
    if (!selection) return null
    return buildCouncilDebateTheater({
      selection,
      messages,
      prdMarkdown: finalPrd,
    })
  }, [finalPrd, messages, result, selection])
  const activeTheaterScene = liveTheater?.scenes[theaterSceneIndex]
  const consensusTrace = useMemo(() => {
    if (result?.consensusTrace) return result.consensusTrace
    if (!liveTheater) return null
    return buildCouncilConsensusTrace({
      scenes: liveTheater.scenes,
      verdictLedger: liveTheater.verdictLedger,
      actionPack: result?.actionPack,
    })
  }, [liveTheater, result?.actionPack, result?.consensusTrace])
  const masterPrdValidation = useMemo(
    () => result?.masterPrdValidation || validateCouncilMasterPrd(finalPrd),
    [finalPrd, result?.masterPrdValidation],
  )
  const qualityFixes = result?.qualityGate.checks.flatMap((item) => item.requiredFixes) || []
  const qualityGapItems = qualityFixes.length
    ? qualityFixes.slice(0, 5)
    : ['真实用户验证后复验首步完成率。', '抽查 PRD 全栈章节是否能拆成工程票。', '导出后回看来源链，确认没有断链结论。']
  const nuwaEvidenceRegistry = useMemo(
    () => result?.nuwaEvidenceRegistry || buildCouncilNuwaEvidenceRegistry(selection?.seats.map((seat) => seat.persona) || COUNCIL_PERSONAS, undefined, nuwaSourceAuditLedger),
    [nuwaSourceAuditLedger, result?.nuwaEvidenceRegistry, selection],
  )
  const runtimeWisdomContext = useMemo(
    () => buildCouncilRuntimeWisdomContext(runtimeHistory, userValidationLedger),
    [runtimeHistory, userValidationLedger],
  )
  const runtimeCalibrationPlan = useMemo(
    () => buildCouncilRuntimeCalibrationPlan({
      history: runtimeHistory,
      wisdom: runtimeWisdomContext,
      userValidation: userValidationLedger,
      runtimeEvidence: result?.runtimeEvidence,
      excellenceAudit: result?.excellenceAudit,
    }),
    [result?.excellenceAudit, result?.runtimeEvidence, runtimeHistory, runtimeWisdomContext, userValidationLedger],
  )
  const latestRuntimeEvidence = result?.runtimeEvidence || runtimeHistory.records[0]?.ledger
  const latestRunId = result?.runtimeEvidence.runId || runtimeHistory.records[0]?.runId
  const profileEvidencePack = useMemo(
    () => (profilePersona ? buildCouncilNuwaEvidencePack(profilePersona, nuwaSourceAuditLedger) : null),
    [nuwaSourceAuditLedger, profilePersona],
  )
  const certification95 = useMemo(
    () => buildCouncil95CertificationGate({
      selection,
      qualityGate: result?.qualityGate,
      excellenceAudit: result?.excellenceAudit,
      historicalExcellenceScore: runtimeHistory.records[0]?.excellenceScore,
      runtimeEvidence: latestRuntimeEvidence,
      runtimeCalibrationPlan,
      userValidationLedger,
      artifactReviewLedger,
      nuwaEvidenceRegistry,
      sourceAuditLedger: nuwaSourceAuditLedger,
    }),
    [
      artifactReviewLedger,
      latestRuntimeEvidence,
      nuwaEvidenceRegistry,
      nuwaSourceAuditLedger,
      result?.excellenceAudit,
      result?.qualityGate,
      runtimeHistory.records,
      runtimeCalibrationPlan,
      selection,
      userValidationLedger,
    ],
  )
  const acceptanceReview = useMemo(
    () => buildCouncilAcceptanceReview({
      runtimeEvidence: result?.runtimeEvidence,
      qualityGate: result?.qualityGate,
      debateScenes: result?.debateScenes || liveTheater?.scenes || [],
      debateMap: result?.debateMap || liveTheater?.debateMap || null,
      verdictLedger: result?.verdictLedger || liveTheater?.verdictLedger || null,
      baoyuVisualPlans: [],
      runtimeCalibrationPlan,
      userValidationLedger,
      artifactReviewLedger,
    }),
    [
      artifactReviewLedger,
      liveTheater?.debateMap,
      liveTheater?.scenes,
      liveTheater?.verdictLedger,
      result?.debateMap,
      result?.debateScenes,
      result?.qualityGate,
      result?.runtimeEvidence,
      result?.verdictLedger,
      runtimeCalibrationPlan,
      userValidationLedger,
    ],
  )
  const signatureActions = useMemo(() => {
    const nextSteps = result?.deliveryModes?.xiaobaiExecute.nextSteps
      .map((step) => compactDisplay(step, 96))
      .filter(Boolean)
      .slice(0, 3)
    if (nextSteps?.length) return nextSteps
    if (selection) {
      return [
        '确认系统推荐的智囊团是否贴合这个问题。',
        '激活六阶段博弈，等它裁掉不该做的方向。',
        '拿到共识 PRD 后先执行行动面板里的第一件事。',
      ]
    }
    return [
      '输入一个真实项目或人生问题，不需要先会写 PRD。',
      '点击生成推荐编队，看系统为什么选这 6 个灵魂。',
      '只保留一个明天能做的动作，其他复杂度先折叠。',
    ]
  }, [result?.deliveryModes?.xiaobaiExecute.nextSteps, selection])
  const verdictKeep = result?.verdictLedger.kept[0]?.label || result?.actionPack?.oneScreenBrief || '保留：把混乱想法压成一个可执行的第一步。'
  const verdictCut = result?.verdictLedger.cut[0]?.label || result?.deliveryModes?.xiaobaiExecute.doNotDo[0] || '裁掉：不让小白先读完复杂机制才知道要做什么。'
  const signatureHeadline = result?.deliveryModes?.xiaobaiExecute.headline || '小白智囊团：把混乱想法变成明天第一步'
  const signaturePromise = result?.deliveryModes?.xiaobaiExecute.promise || '36 个思想原型先在幕后争论，首屏只交付判断、行动、取舍和可信证据。'
  const signaturePrimaryAction = result?.deliveryModes?.xiaobaiExecute.firstAction || signatureActions[0]
  const signatureProofChecks = useMemo(() => {
    const preferred = ['deep-model-long-run', 'quality-and-excellence', 'debate-traceability', 'user-validation', 'artifact-review']
    const byId = new Map(certification95.checks.map((item) => [item.id, item]))
    return preferred
      .map((id) => byId.get(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
  }, [certification95.checks])
  const signatureReadiness = certification95.claimAllowed
    ? '允许进入 95 候选'
    : certification95.status === 'needs-human-proof'
      ? '机器证据强，但仍禁止自称 95'
      : '仍在闸门内返修'

  useEffect(() => {
    const length = liveTheater?.scenes.length || 0
    if (length === 0) setTheaterSceneIndex(0)
    else setTheaterSceneIndex((index) => Math.min(index, length - 1))
  }, [liveTheater?.scenes.length])

  useEffect(() => {
    const text = problem.trim()
    if (!text) {
      setCreativePreview(null)
      return undefined
    }
    let cancelled = false
    buildCouncilCreativeEnhancement(text)
      .then((enhancement) => {
        if (!cancelled) setCreativePreview(enhancement)
      })
      .catch(() => {
        if (!cancelled) setCreativePreview(null)
      })
    return () => {
      cancelled = true
    }
  }, [problem])

  useEffect(() => {
    if (!result?.runtimeEvidence || !selection) return
    setRuntimeHistory(
      saveCouncilRuntimeHistoryRecord({
        problem,
        selection,
        runtimeEvidence: result.runtimeEvidence,
        excellenceAudit: result.excellenceAudit,
        nuwaEvidenceRegistry: result.nuwaEvidenceRegistry,
      }),
    )
  }, [problem, result, selection])

  function resetRunState() {
    setResult(null)
    setMessages([])
    setLiveSnapshots([])
    setSaved(false)
    setCopied(false)
    setError('')
    setActivated(false)
  }

  function resetMatchState() {
    setMatchEvents([])
    setMatchError('')
    setMatching(false)
  }

  function loadSample() {
    setProblem(SAMPLE_PROMPT)
    setSelection(null)
    resetMatchState()
    resetRunState()
  }

  function clearRuntimeHistory() {
    setRuntimeHistory(clearCouncilRuntimeHistory())
  }

  function clearUserValidation() {
    setUserValidationLedger(clearCouncilUserValidationLedger())
  }

  function saveUserValidation(input: SaveCouncilUserValidationInput) {
    setUserValidationLedger(saveCouncilUserValidationRecord(input))
  }

  function clearArtifactReview() {
    setArtifactReviewLedger(clearCouncilArtifactReviewLedger())
  }

  function saveArtifactReview(input: SaveCouncilArtifactReviewInput) {
    setArtifactReviewLedger(saveCouncilArtifactReviewRecord(input))
  }

  function clearNuwaSourceAudit() {
    setNuwaSourceAuditLedger(clearCouncilNuwaSourceAuditLedger())
  }

  function saveNuwaSourceAudit(input: SaveCouncilNuwaSourceAuditInput) {
    setNuwaSourceAuditLedger(saveCouncilNuwaSourceAuditRecord(input))
  }

  async function runNuwaPreflight() {
    const electronAPI = window.electronAPI
    if (!electronAPI?.readFile) {
      setNuwaPreflightError('Electron 文件读取不可用，无法预检本地 Nuwa skill 包。')
      return
    }
    setNuwaPreflightRunning(true)
    setNuwaPreflightError('')
    try {
      const personas = selection?.seats.map((seat) => seat.persona) || COUNCIL_PERSONAS
      const report = await runCouncilNuwaLocalPreflight(
        personas,
        async (filePath) => {
          const relative = await electronAPI.readFile(filePath)
          if (!relative.startsWith('Error reading file:')) return relative
          const absolutePath = `${LOCAL_WORKSPACE_ROOT}/${filePath.replace(/^\.?\//, '')}`
          return electronAPI.readFile(absolutePath)
        },
        { rootPath: '' },
      )
      setNuwaPreflight(report)
    } catch (err) {
      setNuwaPreflightError(err instanceof Error ? err.message : String(err))
    } finally {
      setNuwaPreflightRunning(false)
    }
  }

  function togglePreferredStyle(styleId: string) {
    setPreferredStyleIds((prev) =>
      prev.includes(styleId) ? prev.filter((id) => id !== styleId) : [styleId, ...prev].slice(0, 3),
    )
  }

  async function recommendTeam(source = problem) {
    const text = source.trim()
    if (!text) {
      setError('先写下你要解决的问题，再让系统挑选最合适的智囊组合。')
      return
    }
    setSelection(null)
    resetRunState()
    setMatchEvents([])
    setMatchError('')
    setMatching(true)
    try {
      const next = await runCouncilMatchGate(
        {
          problem: text,
          creativeEnhancement: creativePreview || undefined,
          uiStyleContext,
          preferredStyleIds,
          runtimeWisdomContext,
          runtimeCalibrationPlan,
        },
        {
          onProgress: (event) => setMatchEvents((prev) => [...prev, event]),
        },
      )
      setSelection(next)
      if (next.matchGate.decisionSource === 'local-fallback') setMatchError(next.matchGate.judgeSummary)
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : String(err))
    } finally {
      setMatching(false)
    }
  }

  function refreshSelectionMatchGate(next: CouncilSelection): CouncilSelection {
    return {
      ...next,
      matchGate: {
        ...next.matchGate,
        finalTeam: next.seats.map((seat) => ({
          seatId: seat.seat.id,
          personaId: seat.persona.id,
          personaName: seat.persona.name,
          role: seat.seat.label,
          score: seat.score,
          reasons: seat.reasons,
        })),
      },
    }
  }

  function resetAfterManualSelection(next: CouncilSelection) {
    setSelection(refreshSelectionMatchGate(next))
    resetRunState()
  }

  function replaceSeat(target: CouncilSelectedSeat) {
    if (!selection) return
    const replacement =
      selection.alternates.find(
        (alternate) => alternate.seat.id === target.seat.id && !selectedPersonaIds.has(alternate.persona.id),
      ) || selection.alternates.find((alternate) => !selectedPersonaIds.has(alternate.persona.id))
    if (!replacement) return
    resetAfterManualSelection({
      ...selection,
      seats: selection.seats.map((seat) => (seat.seat.id === target.seat.id ? replacement : seat)),
      alternates: [target, ...selection.alternates.filter((item) => item.persona.id !== replacement.persona.id)],
    })
  }

  async function startCouncilRun() {
    const text = problem.trim()
    if (!text) {
      setError('先写下问题，再激活智囊团。')
      return
    }
    const current = selection || await runCouncilMatchGate({
      problem: text,
      creativeEnhancement: creativePreview || undefined,
      uiStyleContext,
      preferredStyleIds,
      runtimeWisdomContext,
      runtimeCalibrationPlan,
    })
    setSelection(current)
    setMessages([])
    setLiveSnapshots([])
    setResult(null)
    setError('')
    setSaved(false)
    setCopied(false)
    setActivated(true)
    setRunning(true)
    try {
      const run = await runCouncilPrdWorkflow({
        problem: text,
        selection: current,
        preferredStyleIds,
        uiStyleContext,
        creativeEnhancement: creativePreview || undefined,
        runtimeWisdomContext,
        runtimeCalibrationPlan,
        nuwaSourceAuditLedger,
        onProgress: (message) => {
          setMessages((prev) => [...prev, message])
        },
        onSnapshot: (snapshot) => {
          setLiveSnapshots((prev) => [...prev, snapshot])
        },
      })
      setResult(run)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  async function copyPrd() {
    if (!finalPrd) return
    await navigator.clipboard.writeText(finalPrd)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  async function writeDownloadFile(fileName: string, content: string, type: string) {
    if (window.electronAPI?.writeFile) {
      const result = await window.electronAPI.writeFile(`${LOCAL_DOWNLOADS_ROOT}/${fileName}`, content)
      if (result?.success) return
    }
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  async function downloadPrd() {
    if (!finalPrd) return
    await writeDownloadFile(`小白智囊团_PRD_${Date.now()}.md`, buildExportMarkdown(), 'text/markdown;charset=utf-8')
  }

  async function downloadShareBrief() {
    if (!finalPrd && !result?.deliveryModes) return
    await writeDownloadFile(`小白智囊团_可转发决策简报_${Date.now()}.html`, buildShareBriefHtml(), 'text/html;charset=utf-8')
  }

  async function savePrd() {
    if (!finalPrd) return
    await archiveOutput({
      question: `小白智囊团 PRD：${problem.slice(0, 100)}`,
      answer: buildExportMarkdown(),
      quality: 5,
      tags: ['小白智囊团', 'PRD', '群策', '共识追溯'],
    })
    setSaved(true)
  }

  async function openPersonaProfile(persona: CouncilPersona) {
    setProfilePersona(persona)
    setPersonaProfile(null)
    setProfileError('')
    setProfileLoading(true)
    try {
      const profile = await buildCouncilPersonaProfile({
        persona,
        activatedAgents: result?.activatedAgents,
        messages,
      })
      setPersonaProfile(profile)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : String(err))
    } finally {
      setProfileLoading(false)
    }
  }

  function closePersonaProfile() {
    setProfilePersona(null)
    setPersonaProfile(null)
    setProfileError('')
    setProfileLoading(false)
  }

  function personaName(personaId: string): string {
    return COUNCIL_PERSONAS.find((persona) => persona.id === personaId)?.shortName || personaId
  }

  function renderLiveSnapshotsMarkdown(items: CouncilLiveRunSnapshot[]): string {
    if (!items.length) return '## 实时剧本流\n\n尚未进入六阶段运行。'
    return [
      '## 实时剧本流',
      '',
      ...items.slice(-18).map((item, index) =>
        [
          `### ${index + 1}. ${item.headline}`,
          `- status: ${item.status}`,
          item.phaseLabel ? `- phase: ${item.phaseLabel}` : '',
          item.agentName ? `- agent: ${item.agentName}` : '',
          `- scenes: ${item.sceneCount}, briefs: ${item.briefCount}, relations: ${item.relationCount}`,
          item.latestClaim ? `- latestClaim: ${item.latestClaim}` : '',
          item.latestObjection ? `- latestObjection: ${item.latestObjection}` : '',
          `- detail: ${item.detail}`,
        ].filter(Boolean).join('\n'),
      ),
    ].join('\n')
  }

  function buildExportMarkdown(): string {
    const roster =
      selection?.seats
        .map((seat, index) => `${index + 1}. ${seat.persona.name} - ${seat.seat.label}`)
        .join('\n') || ''
    const traceMarkdown = result?.consensusTrace && !/##\s+共识形成追溯/.test(finalPrd)
      ? renderCouncilConsensusTraceMarkdown(result.consensusTrace)
      : ''
    return `# 小白智囊团大师共识 PRD

## 95+ 代表作首页

- 产品承诺：${signaturePromise}
- 首屏裁决：${signatureHeadline}
- 现在只做这一件事：${signaturePrimaryAction}
- 保留：${compactDisplay(verdictKeep, 180)}
- 裁掉：${compactDisplay(verdictCut, 180)}
- 证据守门：${signatureReadiness}；claimAllowed=${certification95.claimAllowed ? 'yes' : 'no'}
- 3 分钟行动：
${signatureActions.map((item, index) => `${index + 1}. ${item}`).join('\n')}
- 可转发导出：PRD Markdown / 共识追溯 / 一页决策简报。

## 用户问题

${problem}

## 自动编队

${roster}

## CouncilMatchGate

${selection?.matchGate.explanation.map((item) => `- ${item}`).join('\n') || '尚未生成匹配闸门。'}

## Creative DNA / 创意增强

${result?.creativeEnhancement.promptFragment || creativePreview?.promptFragment || '尚未生成创意增强。'}

## UI风格馆主题

- styles: ${uiStyleContext.styleNames.join(' / ')}
- reasoning: ${uiStyleContext.reasoning}
- tokens: ${uiStyleContext.visual.palette.join(' / ')} · ${uiStyleContext.visual.motion}

## PRD

${finalPrd}

${traceMarkdown}

${renderLiveSnapshotsMarkdown(liveSnapshots)}

${liveTheater ? renderCouncilDebateTheaterMarkdown(liveTheater) : '## 小白辩论剧场\n\n尚未生成剧场场景。'}

${result?.deliveryModes ? renderCouncilDeliveryModesMarkdown(result.deliveryModes) : '## 双模式结果层\n\n尚未生成 Boss 复盘 / 小白执行双模式。'}

${result?.actionPack ? renderCouncilActionPackMarkdown(result.actionPack) : '## 90 分行动面板\n\n尚未生成可开工行动包。'}

${result?.excellenceAudit ? renderCouncilExcellenceAuditMarkdown(result.excellenceAudit) : '## 95 分卓越审计\n\n尚未生成卓越审计。'}

${renderCouncilAcceptanceReviewMarkdown(acceptanceReview)}

${renderCouncilArtifactReviewMarkdown(artifactReviewLedger)}

${renderCouncil95CertificationMarkdown(certification95)}

${result?.runtimeEvidence ? renderCouncilRuntimeEvidenceMarkdown(result.runtimeEvidence) : '## 真实运行证据账本\n\n尚未生成运行证据。'}

${renderCouncilRuntimeWisdomMarkdown(runtimeWisdomContext)}

${renderCouncilRuntimeCalibrationMarkdown(runtimeCalibrationPlan)}

${renderCouncilUserValidationMarkdown(userValidationLedger)}

${renderCouncilRuntimeHistoryMarkdown(runtimeHistory)}

${renderCouncilNuwaEvidenceRegistryMarkdown(result?.nuwaEvidenceRegistry || nuwaEvidenceRegistry)}

${renderCouncilNuwaSourceAuditMarkdown(nuwaSourceAuditLedger)}

${nuwaPreflight ? renderCouncilNuwaLocalPreflightMarkdown(nuwaPreflight) : '## Nuwa 本地包自动预检\n\n尚未运行本地包自动预检。'}

${result?.qualityGate ? renderCouncilQualityGateMarkdown(result.qualityGate) : '## CouncilQualityGate · 质量闸门\n\n尚未生成质量闸门。'}
`
  }

  function buildShareBriefHtml(): string {
    const checksHtml = signatureProofChecks.map((item) => `
      <article data-status="${item.status}">
        <span>${escapeHtml(item.status)}</span>
        <strong>${escapeHtml(item.label)}</strong>
        <p>${escapeHtml(item.proof)}</p>
      </article>
    `).join('')
    const actionsHtml = signatureActions.map((item, index) => `<li><b>${index + 1}</b>${escapeHtml(item)}</li>`).join('')
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>小白智囊团可转发决策简报</title>
<style>
body{margin:0;background:#061015;color:#ecfeff;font-family:"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC",sans-serif;}
main{max-width:1120px;margin:0 auto;padding:44px 28px 54px;}
.hero{border:1px solid rgba(103,232,249,.3);background:linear-gradient(135deg,rgba(8,47,73,.88),rgba(2,6,23,.92));padding:34px;box-shadow:0 30px 90px rgba(0,0,0,.32);}
.mark{color:#67e8f9;font:800 12px ui-monospace,monospace;letter-spacing:0;text-transform:uppercase;}
h1{font-size:42px;line-height:1.08;margin:12px 0 0;letter-spacing:0;}
p{color:rgba(236,254,255,.72);line-height:1.7;}
.grid{display:grid;grid-template-columns:1.05fr .95fr;gap:18px;margin-top:22px;}
.panel,section{border:1px solid rgba(125,211,252,.2);background:rgba(2,6,23,.52);padding:20px;margin-top:18px;}
.now{font-size:22px;color:#d9f99d;margin-top:10px;}
ol{display:grid;gap:10px;margin:14px 0 0;padding:0;list-style:none;}
li{display:grid;grid-template-columns:32px 1fr;gap:10px;align-items:start;color:#f8fafc;line-height:1.55;}
li b{display:grid;place-items:center;width:26px;height:26px;border:1px solid rgba(190,242,100,.45);color:#d9f99d;}
.verdict{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.verdict strong{display:block;color:#f8fafc;margin-bottom:8px;}
.proof{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;}
.proof article[data-status="pass"]{border-color:rgba(190,242,100,.38);}
.proof article[data-status="warn"]{border-color:rgba(251,191,36,.45);}
.proof article[data-status="fail"]{border-color:rgba(248,113,113,.42);}
.proof article{border:1px solid rgba(125,211,252,.2);padding:14px;background:rgba(15,23,42,.54);}
.proof span{color:#67e8f9;font:800 11px ui-monospace,monospace;text-transform:uppercase;}
.proof strong{display:block;margin-top:7px;color:#f8fafc;}
pre{white-space:pre-wrap;max-height:480px;overflow:auto;color:rgba(236,254,255,.75);line-height:1.65;border:1px solid rgba(125,211,252,.18);padding:16px;background:rgba(2,6,23,.58);}
@media(max-width:760px){main{padding:24px 14px}.grid,.verdict{grid-template-columns:1fr}h1{font-size:30px}.hero{padding:22px}}
</style>
</head>
<body>
<main>
  <div class="hero">
    <div class="mark">XIAOBAI COUNCIL / SHARE BRIEF</div>
    <h1>${escapeHtml(signatureHeadline)}</h1>
    <p>${escapeHtml(signaturePromise)}</p>
    <div class="grid">
      <div class="panel">
        <div class="mark">3 分钟行动</div>
        <div class="now">${escapeHtml(signaturePrimaryAction)}</div>
        <ol>${actionsHtml}</ol>
      </div>
      <div class="panel">
        <div class="mark">证据守门</div>
        <div class="now">${escapeHtml(signatureReadiness)}</div>
        <p>${escapeHtml(certification95.claimText)}</p>
      </div>
    </div>
  </div>
  <section>
    <h2>保留 / 裁掉</h2>
    <div class="verdict">
      <p><strong>保留</strong>${escapeHtml(compactDisplay(verdictKeep, 240))}</p>
      <p><strong>裁掉</strong>${escapeHtml(compactDisplay(verdictCut, 240))}</p>
    </div>
  </section>
  <section>
    <h2>证据链不自欺</h2>
    <div class="proof">${checksHtml}</div>
  </section>
  <section>
    <h2>PRD 摘要</h2>
    <pre>${escapeHtml(compactDisplay(finalPrd || buildExportMarkdown(), 2600))}</pre>
  </section>
</main>
</body>
</html>`
  }

  return (
    <div className="council-app">
      <section className="council-app__signature" aria-label="小白智囊团 95+ 指挥舱">
        <div className="council-app__signature-main">
          <span className="council-app__section-kicker">95+ 指挥舱 · 36 个灵魂幕后工作</span>
          <h1>首屏给判断，3 分钟给行动，证据链不自欺</h1>
          <p>{signaturePromise}</p>
          <div className="council-app__signature-promises" aria-label="95+ 首屏标准">
            {SIGNATURE_PROMISES.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <div className="council-app__signature-command">
            <span>现在只做这一件事</span>
            <strong>{signaturePrimaryAction}</strong>
          </div>
          <div className="council-app__signature-actions">
            <button type="button" className="council-app__primary" onClick={() => (selection ? startCouncilRun() : recommendTeam())} disabled={!problem.trim() || running || matching || Boolean(selection && activated)}>
              {selection ? (running ? '六阶段博弈中...' : activated ? '已激活' : '开始六阶段博弈') : matching ? '正在匹配 36 个灵魂...' : '让 36 个灵魂开始挑队'}
            </button>
            <button type="button" onClick={downloadShareBrief} disabled={!finalPrd && !result?.deliveryModes}>
              导出可转发决策简报
            </button>
          </div>
        </div>
        <div className="council-app__signature-board">
          <article className="council-app__signature-steps">
            <span>3 分钟行动</span>
            {signatureActions.map((item, index) => (
              <p key={`${item}-${index}`}>
                <strong>{String(index + 1).padStart(2, '0')}</strong>
                {item}
              </p>
            ))}
          </article>
          <article className="council-app__signature-verdict">
            <span>取舍裁决</span>
            <div>
              <strong>保留</strong>
              <p>{compactDisplay(verdictKeep, 126)}</p>
            </div>
            <div>
              <strong>裁掉</strong>
              <p>{compactDisplay(verdictCut, 126)}</p>
            </div>
          </article>
          <article className="council-app__signature-proof">
            <span>证据守门</span>
            <strong>{signatureReadiness}</strong>
            <p>{certification95.claimText}</p>
            <div>
              {signatureProofChecks.map((item) => (
                <small key={item.id} data-status={item.status}>
                  {item.label} · {item.status}
                </small>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="council-app__workflow" aria-label="小白智囊团流程">
        {WORKFLOW_STEPS.map((step, index) => (
          <div
            key={step}
            className={`council-app__workflow-step ${index <= currentStep ? 'council-app__workflow-step--active' : ''}`}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </section>

      <section className="council-app__workbench">
        <div className="council-app__composer">
          <div className="council-app__section-kicker">小白智囊团 · PRD 闭环</div>
          <div className="council-app__composer-head">
            <div>
              <h1>隐藏思想原型，先选对人再激活</h1>
              <p>系统会先进入 CouncilMatchGate，判断类型、难度、证据、工程、视觉、Nuwa 蒸馏可信度、dream 对齐和反方价值，再推荐最合适的团队。</p>
            </div>
            <button type="button" onClick={loadSample} disabled={running || matching}>
              载入样例
            </button>
          </div>
          <textarea
            value={problem}
            onChange={(event) => {
              setProblem(event.target.value)
              if (selection || activated || result || matchEvents.length || matchError) {
                setSelection(null)
                resetMatchState()
                resetRunState()
              }
            }}
            placeholder="描述你要解决的项目或世界级难题。比如：我要做一个什么应用，它服务谁，最终要产出大师级 PRD、全栈蓝图、共识追溯还是执行路线..."
          />
          <div className="council-app__actions">
            <button type="button" className="council-app__primary" onClick={() => recommendTeam()} disabled={!problem.trim() || running || matching}>
              {matching ? '正在深度匹配...' : '生成推荐编队'}
            </button>
            <button type="button" onClick={startCouncilRun} disabled={!selection || running || matching}>
              {running ? '智囊团博弈中...' : '激活推荐队伍并开始博弈'}
            </button>
          </div>
          {error && <div className="council-app__error">{error}</div>}

          {selection ? (
            <div className="council-app__profile">
              <div>
                <span>问题画像</span>
                <strong>PRD · 难度 {selection.profile.difficulty}/5 · 风险 {selection.profile.riskLevel}</strong>
              </div>
              <div>
                <span>领域</span>
                <strong>{selection.profile.domains.join(' / ')}</strong>
              </div>
              <div>
                <span>需求</span>
                <strong>
                  {[
                    selection.profile.needsEvidence ? '证据链' : '',
                    selection.profile.needsEngineering ? '工程落地' : '',
                    selection.profile.needsVisual ? '体验表达' : '',
                  ]
                    .filter(Boolean)
                    .join(' / ') || '产品闭环'}
                </strong>
              </div>
            </div>
          ) : (
            <div className="council-app__empty-note">
              现在所有角色仍是隐藏角色，不会同步到副官或外部平台。生成推荐编队后，你可以看推荐理由、替换角色，再确认本地激活；Telegram 只作为以后可选绑定。
            </div>
          )}
        </div>

        <CouncilDebateStage
          selection={selection}
          messages={messages}
          running={running}
          activated={activated}
          uiStyleContext={uiStyleContext}
          creativeEnhancement={result?.creativeEnhancement || creativePreview}
          agentDreamStates={result?.agentDreamStates || []}
          debateScenes={liveTheater?.scenes || []}
          debateMap={liveTheater?.debateMap || null}
          qualityGate={result?.qualityGate || null}
          baoyuVisualPlans={[]}
        />
      </section>

      {(matching || selection || running || result) && (
        <section className="council-app__director" aria-label="小白智囊团认知导演台">
          <div className="council-app__director-main">
            <div className="council-app__section-kicker">认知导演台 · 真实推进</div>
            <h2>{currentRunHeadline}</h2>
            <p>
              {result
                ? '先看完整 PRD 和全栈蓝图；剧情、冲突、裁决会被折叠为可审计追溯。'
                : running
                  ? '不是等待一个黑箱答案；每个阶段都会留下发言、质询、裁决和可回放场景。'
                  : matching
                    ? '系统正在从问题画像、Creative DNA、候选池、模型裁判和互补矩阵中挑队。'
                    : '确认后才进入六阶段博弈，避免一秒默认编队和全员混聊。'}
            </p>
            <div className="council-app__director-metrics">
              <article>
                <span>编队</span>
                <strong>{selection?.seats.length || 0}</strong>
                <small>{matchGate?.decisionSource === 'deep-model' ? '模型裁判' : matchGate ? '本地 fallback' : '待匹配'}</small>
              </article>
              <article>
                <span>剧场</span>
                <strong>{liveTheater?.scenes.length || 0}</strong>
                <small>可翻页场景</small>
              </article>
              <article>
                <span>关系</span>
                <strong>{liveTheater?.debateMap.edges.length || 0}</strong>
                <small>支持/反对/修正</small>
              </article>
              <article>
                <span>质量</span>
                <strong>{result?.qualityGate.score ?? '-'}</strong>
                <small>{result?.qualityGate.finalGateStatus || '待闸门'}</small>
              </article>
            </div>
            <div className="council-app__snapshot-stream" aria-label="实时剧本流">
              <div className="council-app__snapshot-head">
                <span>实时剧本流</span>
                <strong>{liveSnapshots.length ? `${liveSnapshots.length} 个真实快照` : '等待激活后写入'}</strong>
              </div>
              <div className="council-app__snapshot-list">
                {visibleSnapshots.length ? (
                  visibleSnapshots.map((snapshot) => (
                    <article key={snapshot.id} data-status={snapshot.status}>
                      <span>{snapshot.phaseLabel || snapshot.status}</span>
                      <strong>{snapshot.headline}</strong>
                      <p>{snapshot.latestClaim || snapshot.detail}</p>
                      <small>
                        {snapshot.agentName || '系统'} · {snapshot.sceneCount} 幕 / {snapshot.relationCount} 关系
                      </small>
                    </article>
                  ))
                ) : (
                  <article data-status="pending">
                    <span>ready</span>
                    <strong>激活后每个阶段会逐步显影</strong>
                    <p>这里不会展示假思考；只显示 CouncilMatchGate、团队消息、质量闸门和共识追溯产生的真实状态。</p>
                    <small>等待六阶段博弈</small>
                  </article>
                )}
              </div>
            </div>
          </div>

          <div className="council-app__director-phases" aria-label="六阶段剧情推进">
            {phaseStats.map((phase, index) => (
              <article key={phase.id} data-status={phase.status}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{phase.label}</strong>
                <p>{phase.intent}</p>
                <small>{phase.liveDetail || (phase.count ? `${phase.count} 条发言 · ${phase.latestSpeaker}` : '等待进入')}</small>
              </article>
            ))}
          </div>

          <aside className="council-app__director-tension" aria-label="当前张力">
            <span>当前张力</span>
            <strong>
              {latestSnapshot?.agentName || latestRunSignal?.agentName || latestMatchEvent?.label || (selection ? '推荐队伍' : '尚未开始')}
            </strong>
            <p>
              {latestSnapshot?.latestObjection || latestSnapshot?.latestClaim || latestSnapshot?.detail || latestRunSignal?.content || latestMatchEvent?.detail || '这里会显示最新主张、质询或裁决，不再让 Boss 只看到一个无声等待状态。'}
            </p>
            {selection && !activated && (
              <button type="button" className="council-app__primary" onClick={startCouncilRun} disabled={running || matching}>
                激活并进入六阶段博弈
              </button>
            )}
          </aside>
        </section>
      )}

      {finalPrd && (
        <CouncilMasterPrdView
          markdown={finalPrd}
          validation={masterPrdValidation}
          trace={consensusTrace}
          qualityScore={result?.qualityGate.score}
          qualityStatus={result?.qualityGate.finalGateStatus}
          runId={latestRunId}
          onCopy={copyPrd}
          onDownload={downloadPrd}
          onSave={savePrd}
          copied={copied}
          saved={saved}
        />
      )}

      {selection && liveTheater && !result && (
        <section className="council-app__panel council-app__panel--theater">
          <div className="council-app__panel-head">
            <div>
              <div className="council-app__section-kicker">神之一手辩论剧场</div>
              <h2>{result ? '从分歧到裁决的完整剧情' : '剧场已就位，等待大师入场'}</h2>
              <p>Boss 先看每一幕如何推进，再展开原始发言。支持、反对、修正和吸收关系会随当前场景联动。</p>
            </div>
          </div>
          <div className="council-app__theater-grid">
            <DebateTheaterView
              scenes={liveTheater.scenes}
              currentIndex={theaterSceneIndex}
              onCurrentIndexChange={setTheaterSceneIndex}
            />
            <CouncilRelationMap debateMap={liveTheater.debateMap} activeSceneId={activeTheaterScene?.id} />
          </div>
          <VerdictLedgerPanel
            ledger={liveTheater.verdictLedger}
            revisionHistory={[]}
          />
          {briefMessages.length > 0 && (
            <details className="council-raw-briefs">
              <summary>原始角色发言</summary>
              <div className="council-app__briefs">
                {briefMessages.map((message) => (
                  <article key={message.id}>
                    <strong>{message.agentName}</strong>
                    <span>{String(message.metadata?.phaseLabel || message.metadata?.phase || (message.round ? `Round ${message.round}` : 'brief'))}</span>
                    <p>{message.content}</p>
                  </article>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      <section className="council-app__intelligence-strip" aria-label="智囊团画像和风格输入">
        <article>
          <div className="council-app__section-kicker">Creative DNA</div>
          <h3>{creativePreview ? '创意孵化器增强已接入' : '等待问题生成画像线索'}</h3>
          <p>{creativePreview?.creativeDnaSummary || '输入问题后会读取创意孵化器画像、Boss 画像和本轮问题，生成六阶段创意增强。'}</p>
          {creativePreview && <small>{creativePreview.source} · 追问 / 发散 / 冲突 / 共识 / 设计 / 产出</small>}
        </article>
        <article>
          <div className="council-app__section-kicker">UI风格馆 · 自动+可覆写</div>
          <h3>{uiStyleContext.styleNames.join(' / ')}</h3>
          <p>{uiStyleContext.reasoning}</p>
          <div className="council-app__style-picks">
            {styleOptions.map((style) => (
              <button
                key={style.id}
                type="button"
                className={preferredStyleIds.includes(style.id) ? 'council-app__style-pick--active' : ''}
                onClick={() => togglePreferredStyle(style.id)}
                disabled={running}
              >
                {style.title.replace(/^\d+\.\s*/, '')}
              </button>
            ))}
          </div>
        </article>
      </section>

      {(matching || visibleMatchEvents.length > 0 || matchError) && (
        <section className="council-app__panel council-app__match-process" aria-label="CouncilMatchGate 深度匹配过程">
          <div className="council-app__panel-head">
            <div>
              <div className="council-app__section-kicker">CouncilMatchGate · 深度匹配过程</div>
              <h2>{matching ? '正在挑选最适合本题的大师组合' : '匹配过程已完成，等待 Boss 确认'}</h2>
              <p>
                {latestMatchEvent?.detail || '系统会按问题画像、Creative DNA、候选池、模型裁判、协作矩阵和推荐成型推进。'}
              </p>
            </div>
            {matchGate && (
              <strong className={`council-app__decision-source council-app__decision-source--${matchGate.decisionSource}`}>
                {matchGate.decisionSource === 'deep-model' ? '模型裁判' : '本地 fallback'}
              </strong>
            )}
          </div>
          {matchError && <div className="council-app__error">{matchError}</div>}
          <div className="council-app__match-steps">
            {visibleMatchEvents.map((event, index) => (
              <article key={`${event.phaseId}-${event.status}-${index}`} data-status={event.status}>
                <span>{String(index + 1).padStart(2, '0')} · {event.label}</span>
                <strong>
                  {event.status === 'running' ? '运行中' : event.status === 'failed' ? '已降级' : '完成'}
                </strong>
                <p>{event.detail}</p>
                {event.candidatePersonaIds.length > 0 && (
                  <small>{event.candidatePersonaIds.slice(0, 6).map(personaName).join(' / ')}</small>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {matchGate && (
        <section className="council-app__panel council-app__match-gate" aria-label="CouncilMatchGate 先匹配再解决">
          <div className="council-app__panel-head">
            <div>
              <div className="council-app__section-kicker">CouncilMatchGate · 先匹配再解决</div>
              <h2>本轮不是全员群聊，而是先选最高效协作阵容</h2>
              <p>{matchGate.judgeSummary || matchGate.explanation.join(' ')}</p>
            </div>
          </div>
          <div className="council-app__gate-readiness">
            <article>
              <span>Nuwa 覆盖</span>
              <strong>{matchGate.readiness.nuwaCoverage}</strong>
            </article>
            <article>
              <span>技能成熟</span>
              <strong>{matchGate.readiness.skillMaturity}</strong>
            </article>
            <article>
              <span>证据强度</span>
              <strong>{matchGate.readiness.evidenceStrength}</strong>
            </article>
            <article>
              <span>反方覆盖</span>
              <strong>{matchGate.readiness.riskCoverage}</strong>
            </article>
          </div>
          <div className="council-app__candidate-board">
            {matchGate.finalTeam.map((item) => (
              <article key={`${item.seatId}-${item.personaId}`}>
                <span>{item.role}</span>
                <h3>{item.personaName}</h3>
                <strong>{item.score.toFixed(1)}</strong>
                <p>{item.reasons.slice(0, 3).join(' / ') || '匹配本轮问题画像'}</p>
              </article>
            ))}
          </div>
          <div className="council-app__collab-map">
            {matchGate.collaborationMatrix.slice(0, 6).map((edge) => (
              <p key={`${edge.fromPersonaId}-${edge.toPersonaId}`}>
                <strong>{edge.relation}</strong>
                {edge.reason}
              </p>
            ))}
          </div>
        </section>
      )}

      {!selection && (
        <section className="council-app__panel council-app__panel--hidden-library">
          <div className="council-app__panel-head">
            <div>
              <div className="council-app__section-kicker">隐藏角色库</div>
              <h2>{COUNCIL_PERSONAS.length} 个公开思想原型等待被选择</h2>
              <p>当前 36 位已完成第一批本地 Nuwa 蒸馏；下方可滚动完整查看 {hiddenPersonas.length} 位未入选角色，点击即可打开独立档案。</p>
            </div>
          </div>
          <div className="council-app__hidden-grid">
            {hiddenPersonas.map((persona) => (
              <button
                key={persona.id}
                type="button"
                className="council-app__hidden-persona"
                style={{ '--persona': persona.color } as CSSProperties}
                onClick={() => openPersonaProfile(persona)}
              >
                <span>{persona.icon}</span>
                <strong>{persona.name}</strong>
                <small>{persona.domains.slice(0, 3).join(' / ')}</small>
                <em>{COUNCIL_DISTILLATION_STATUS_LABELS[persona.distillationStatus]}</em>
              </button>
            ))}
          </div>
        </section>
      )}

      {selection && (
        <section className="council-app__grid">
          <div className="council-app__panel council-app__panel--wide">
            <div className="council-app__panel-head">
              <div>
                <div className="council-app__section-kicker">{activated ? '已激活队伍' : '推荐编队 · 待激活'}</div>
                <h2>{selection.seats.length} 位真实人类原型，按席位进入博弈</h2>
                <p>点击“替换”可以换掉某个席位；点击激活后才会写入 custom_agents，并出现在本地副官、群策和控制面板。Telegram 默认关闭，Nuwa 产物注册为本地 skill。</p>
              </div>
              <button type="button" className="council-app__primary" onClick={startCouncilRun} disabled={running || activated || matching}>
                {running ? '博弈中...' : activated ? '已激活' : '激活推荐队伍'}
              </button>
            </div>
            <div className="council-app__roster">
              {selection.seats.map((seat) => (
                <article
                  key={seat.seat.id}
                  className="council-app__persona"
                  style={{ '--persona': seat.persona.color } as CSSProperties}
                  onClick={() => openPersonaProfile(seat.persona)}
                >
                  <div className="council-app__persona-top">
                    <span>{seat.persona.icon}</span>
                    <div>
                      <h3>{seat.persona.name}</h3>
                      <small>{seat.seat.label}</small>
                    </div>
                    <strong>{seat.score.toFixed(1)}</strong>
                  </div>
                  <p>{seat.seat.mission}</p>
                  <div className="council-app__score-grid">
                    <span>Nuwa {seat.scoreFactors.nuwaCredibility.toFixed(1)}</span>
                    <span>Dream {seat.scoreFactors.dreamAlignment.toFixed(1)}</span>
                    <span>技能 {seat.scoreFactors.skillMaturity.toFixed(1)}</span>
                    <span>反方 {seat.scoreFactors.oppositionValue.toFixed(1)}</span>
                  </div>
                  <div className="council-app__reasons">
                    {seat.reasons.slice(0, 3).map((reason) => (
                      <span key={reason}>{reason}</span>
                    ))}
                  </div>
                  <div className="council-app__policy">{seat.persona.publicBasis}</div>
                  <div className="council-app__nuwa-status">
                    {COUNCIL_DISTILLATION_STATUS_LABELS[seat.persona.distillationStatus]}
                    {seat.persona.nuwaSkillId ? ` · ${seat.persona.nuwaSkillId}` : ' · openbasaka-local-nuwa'}
                  </div>
                  <button type="button" onClick={(event) => { event.stopPropagation(); replaceSeat(seat) }} disabled={running || activated || matching}>
                    替换
                  </button>
                </article>
              ))}
            </div>
          </div>

          <div className="council-app__panel">
            <div className="council-app__section-kicker">后台日志</div>
            <h2>保留机器可读进度</h2>
            <div className="council-app__timeline">
              {progressMessages.slice(-8).map((message) => (
                <div key={message.id}>
                  <span />
                  <p>{message.content}</p>
                </div>
              ))}
              {progressMessages.length === 0 && (
                <p className="council-app__muted">
                  推荐队伍尚未激活。激活后这里会显示编队、角色开工宣言、轮次发言和成稿进度。
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {result?.deliveryModes && (
        <CouncilDeliveryModePanel
          deliveryModes={result.deliveryModes}
          mode={audienceMode}
          onModeChange={setAudienceMode}
        />
      )}

      {result?.actionPack && <CouncilActionPackView actionPack={result.actionPack} />}

      {result?.excellenceAudit && <CouncilExcellenceAuditView audit={result.excellenceAudit} />}

      {result && (
        <>
          <CouncilAcceptanceReviewView review={acceptanceReview} />
          <CouncilArtifactReviewView
            ledger={artifactReviewLedger}
            latestRunId={latestRunId}
            onSave={saveArtifactReview}
            onClear={clearArtifactReview}
          />
        </>
      )}

      {reflectionMessages.length > 0 && (
        <section className="council-app__panel">
          <div className="council-app__section-kicker">Hermes 本轮学习</div>
          <h2>反思写入私有记忆，下轮再生效</h2>
          <div className="council-app__reflections">
            {reflectionMessages.slice(-10).map((message) => (
              <article key={message.id}>
                <strong>{message.agentName}</strong>
                <span>{String(message.metadata?.phase || 'reflection')}</span>
                <p>{message.content}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {result?.qualityGate && (
        <section className="council-app__panel council-app__quality-gate" aria-label="CouncilQualityGate 质量闸门">
          <div className="council-app__panel-head">
            <div>
              <div className="council-app__section-kicker">CouncilQualityGate · 质量闸门</div>
              <h2>最终答案先过审，再交给 Boss</h2>
              <p>{result.qualityGate.summary}</p>
            </div>
            <strong className={`council-app__quality-score council-app__quality-score--${result.qualityGate.status}`}>
              {result.qualityGate.score}
            </strong>
          </div>
          <div className="council-app__quality-overview">
            <article>
              <span>PRD 完整度</span>
              <strong>{result.qualityGate.prdCompletenessScore}</strong>
            </article>
            <article>
              <span>上线准备度</span>
              <strong>{result.qualityGate.launchReadinessScore}</strong>
            </article>
            <article>
              <span>返修轮次</span>
              <strong>{result.qualityRevisionHistory.length}</strong>
            </article>
            <article>
              <span>最终状态</span>
              <strong>{result.qualityGate.finalGateStatus}</strong>
            </article>
          </div>
          <div className="council-app__quality-gap-board">
            <div>
              <h3>{qualityFixes.length ? '90 分缺口板' : '90 分复验板'}</h3>
              <p>{qualityFixes.length ? '系统不会把未补齐项伪装成通过；这些会进入返修链或下一轮验证。' : '自动闸门已过，仍需要真实用户、视觉和导出复验来逼近代表性版本。'}</p>
            </div>
            {qualityGapItems.map((item, index) => (
              <article key={`${item}-${index}`}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{item}</p>
              </article>
            ))}
          </div>
          <div className="council-app__quality-checks">
            {result.qualityGate.checks.map((item) => (
              <article key={item.id} data-status={item.status}>
                <span>{item.status}</span>
                <h3>{item.label}</h3>
                <strong>{item.score}</strong>
                <p>{item.evidence.join(' / ')}</p>
                {item.requiredFixes.length > 0 && <small>{item.requiredFixes.slice(0, 2).join(' / ')}</small>}
              </article>
            ))}
          </div>
          <div className="council-app__typed-deliberation">
            <div>
              <h3>结构化博弈对象</h3>
              <p>把大师发言抽成 Claim / Evidence / Objection / Verdict / Experiment，方便后续复盘和进化。</p>
            </div>
            {result.qualityGate.typedDeliberation.slice(0, 8).map((item) => (
              <article key={item.id} data-type={item.type}>
                <span>{item.type}</span>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="council-app__panel council-app__evidence-vault" aria-label="证据保险柜">
        <details>
          <summary>
            <span>证据保险柜</span>
            <strong>来源、运行、95 认证与用户验证都在这里，不再抢占主舞台</strong>
          </summary>
          <div className="council-app__evidence-vault-body">
            <CouncilNuwaEvidenceView registry={nuwaEvidenceRegistry} compact={Boolean(selection)} />

            <CouncilNuwaSourceAuditView
              registry={nuwaEvidenceRegistry}
              ledger={nuwaSourceAuditLedger}
              onSave={saveNuwaSourceAudit}
              onClear={clearNuwaSourceAudit}
              preflight={nuwaPreflight}
              preflightRunning={nuwaPreflightRunning}
              preflightError={nuwaPreflightError}
              onRunPreflight={runNuwaPreflight}
            />

            {result?.runtimeEvidence && <CouncilRuntimeEvidenceView ledger={result.runtimeEvidence} />}

            <CouncilRuntimeWisdomView wisdom={runtimeWisdomContext} />

            <CouncilRuntimeCalibrationView plan={runtimeCalibrationPlan} />

            <Council95CertificationView gate={certification95} />

            {!result && (
              <CouncilArtifactReviewView
                ledger={artifactReviewLedger}
                latestRunId={latestRunId}
                onSave={saveArtifactReview}
                onClear={clearArtifactReview}
              />
            )}

            <CouncilUserValidationView
              ledger={userValidationLedger}
              problem={problem}
              latestRunId={latestRunId}
              onSave={saveUserValidation}
              onClear={clearUserValidation}
            />

            <CouncilRuntimeHistoryView history={runtimeHistory} onClear={clearRuntimeHistory} />
          </div>
        </details>
      </section>

      {profilePersona && (
        <div className="council-profile-modal" role="presentation" onClick={closePersonaProfile}>
          <section
            className="council-profile-modal__panel"
            role="dialog"
            aria-modal="true"
            aria-label={`${profilePersona.name} 角色档案`}
            style={{ '--persona': profilePersona.color } as CSSProperties}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="council-profile-modal__close" onClick={closePersonaProfile}>
              关闭
            </button>
            <div className="council-profile-modal__hero">
              <span>{profilePersona.icon}</span>
              <div>
                <div className="council-app__section-kicker">独立角色档案</div>
                <h2>{profilePersona.name}</h2>
                <p>{profilePersona.publicBasis}</p>
              </div>
            </div>

            {profileLoading && <div className="council-profile-modal__loading">正在读取本地 SOUL、MEMORY、reflection 和 dream state...</div>}
            {profileError && <div className="council-app__error">{profileError}</div>}

            {personaProfile && (
              <>
                <div className="council-profile-modal__dream">
                  <span>当前动态 Dream</span>
                  <strong>{personaProfile.dreamState.currentDream}</strong>
                  <p>{personaProfile.dreamState.freezeRule}</p>
                </div>

                <div className="council-profile-modal__nuwa">
                  <div>
                    <span>Nuwa 蒸馏状态</span>
                    <strong>{COUNCIL_DISTILLATION_STATUS_LABELS[personaProfile.distillationProfile.distillationStatus]}</strong>
                    <p>{profileEvidencePack?.safeClaim || personaProfile.distillationProfile.sourceSummary}</p>
                  </div>
                  <div>
                    <span>Skill 包</span>
                    <strong>{personaProfile.distillationProfile.skillPackagePath}SKILL.md</strong>
                    <p>
                      {profileEvidencePack
                        ? `local ${profileEvidencePack.localUseScore} / source ${profileEvidencePack.sourceAuditScore} · ${profileEvidencePack.seedReference}`
                        : personaProfile.distillationProfile.nuwaSkillId ? `种子：${personaProfile.distillationProfile.nuwaSkillId}` : 'Openbasaka 本地 Nuwa skill 包。'}
                    </p>
                  </div>
                </div>

                <div className="council-profile-modal__grid">
                  <article>
                    <h3>真实人类依据</h3>
                    <p>
                      {personaProfile.distillationProfile.realHumanBasis.displayName}<br />
                      {personaProfile.distillationProfile.realHumanBasis.publicMaterialSummary}
                    </p>
                    <small>{personaProfile.distillationProfile.realHumanBasis.seedReference || 'Openbasaka 本地逐个精修队列'}</small>
                  </article>
                  <article>
                    <h3>SOUL</h3>
                    <p>{personaProfile.soul?.identity || '尚未激活为本地 agent，当前展示公开原型种子。'}</p>
                    <small>{personaProfile.soul?.tone || profilePersona.temperament}</small>
                  </article>
                  <article>
                    <h3>本地资料</h3>
                    <p>
                      workspace: {personaProfile.agent?.workspaceScope || 'openbasaka-local-council'}<br />
                      surfaced: {(personaProfile.agent?.surfacedIn || ['openbasaka', 'teams', 'control']).join(' / ')}<br />
                      Telegram: {personaProfile.agent?.telegramEnabled ? 'enabled' : 'disabled'}
                    </p>
                    <small>{personaProfile.safety.privateDataRule}</small>
                  </article>
                  <article>
                    <h3>模型与技能</h3>
                    <p>
                      primary: {String(personaProfile.agent?.modelRoute?.primary || 'glm-5.1')}<br />
                      review: {String(personaProfile.agent?.modelRoute?.reviewFast || 'deepseek-v4-flash')}<br />
                      skills: {profilePersona.defaultSkills.join(' / ')}
                    </p>
                  </article>
                  <article>
                    <h3>贡献与分歧</h3>
                    <p>
                      brief {personaProfile.contributions.briefCount} · reflection {personaProfile.contributions.reflectionCount}<br />
                      {personaProfile.contributions.latest}
                    </p>
                  </article>
                </div>

                <div className="council-profile-modal__audit">
                  <article>
                    <h3>为什么必须有它</h3>
                    <p>{personaProfile.distillationProfile.auditCard.whyEssential}</p>
                    <strong>{personaProfile.distillationProfile.auditCard.irreplaceableAbility}</strong>
                  </article>
                  <article>
                    <h3>心智模型候选</h3>
                    {personaProfile.distillationProfile.mentalModels.slice(0, 5).map((model) => (
                      <p key={model.id}>
                        <strong>{model.label}</strong>
                        {model.description}
                      </p>
                    ))}
                  </article>
                  <article>
                    <h3>反模式与诚实边界</h3>
                    {personaProfile.distillationProfile.antiPatterns.slice(0, 5).map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                  </article>
                </div>

                {profileEvidencePack && (
                  <div className="council-profile-modal__evidence">
                    <article>
                      <h3>证据包缺口</h3>
                      {profileEvidencePack.nextManualReview.map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </article>
                    <article>
                      <h3>现在不能声称</h3>
                      {profileEvidencePack.cannotClaim.map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </article>
                  </div>
                )}

                <div className="council-profile-modal__columns">
                  <div>
                    <h3>让 Dream 变化的证据</h3>
                    {personaProfile.dreamState.evidence.map((item, index) => (
                      <p key={`${item.kind}-${index}`}>
                        <strong>{item.label}</strong>
                        {item.text}
                      </p>
                    ))}
                  </div>
                  <div>
                    <h3>下一阶段志向</h3>
                    <p>{personaProfile.dreamState.nextAspiration}</p>
                    <h3>记忆短摘</h3>
                    {personaProfile.memory.recentEntries.length ? (
                      personaProfile.memory.recentEntries.map((entry) => <p key={`${entry.createdAt}-${entry.text}`}>{entry.text}</p>)
                    ) : (
                      <p>还没有可展示的私有记忆短摘。</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
