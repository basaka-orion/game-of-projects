import { describe, expect, it } from 'vitest'
import { buildCouncilLaunchReadinessPack } from '../action-pack'
import { buildCouncilBaoyuVisualPlans } from '../baoyu'
import { buildCouncilDebateTheater } from '../debate-theater'
import { buildCouncilDeliveryModes } from '../delivery-modes'
import { buildCouncilQualityGate } from '../quality-gate'
import { buildCouncilRuntimeEvidenceLedger, flattenCouncilActionTasks, renderCouncilRuntimeEvidenceMarkdown } from '../runtime-evidence'
import { selectCouncilTeam } from '../selector'
import type { TeamMessage, TeamSession } from '../../teams/types'

describe('xiaobai council runtime evidence ledger', () => {
  it('records match, debate, quality, action, and Baoyu proof without secrets', () => {
    const problem = '做一个小白智囊团真实运行证据账本'
    const selection = selectCouncilTeam(problem)
    const selectionWithTrace = {
      ...selection,
      matchGate: {
        ...selection.matchGate,
        decisionSource: 'deep-model' as const,
        stageTrace: [
          'problem-profile',
          'creative-dna',
          'candidate-pool',
          'model-judge',
          'collaboration-matrix',
          'recommendation',
        ].map((phaseId, index) => ({
          phaseId: phaseId as any,
          label: phaseId,
          status: 'completed' as const,
          detail: `stage ${index}`,
          candidatePersonaIds: [],
          startedAt: index,
          endedAt: index + 1,
          decisionSource: index === 3 ? 'deep-model' as const : undefined,
        })),
      },
    }
    const messages: TeamMessage[] = selection.seats.slice(0, 6).map((seat, index) => ({
      id: `brief_${index}`,
      agentId: seat.persona.id,
      agentName: seat.persona.name,
      role: 'assistant',
      kind: 'brief',
      timestamp: index,
      content: '【核心判断】要可追溯。【冲突/补充】反对假进度。【PRD条款】保留质量闸门与导出。',
      metadata: { phaseId: 'clash', phaseLabel: '冲突质询' },
    }))
    const prdMarkdown = [
      '# PRD',
      '**定位**：运行证据账本。',
      '**北极星指标**：Boss 能判断是否真的跑过。',
      '- P0：输入、匹配闸门、辩论剧场、质量闸门、行动包、导出。',
      '- 页面状态：空态、加载态、失败态、完成态。',
      '- 数据/API：Scene、MapEdge、LedgerItem、QualityGate、ActionPack。',
      '- 测试验收：vitest、typecheck、smoke:ui、build、Electron 跑通。',
      '- 首版验证实验：找 5-8 个用户完成一次闭环，至少 5 人留证且 4 人通过。',
      '- 本地 Openbasaka，Telegram 默认关闭，隐私安全可审计。',
    ].join('\n')
    const session: TeamSession = {
      id: 'session_1',
      teamId: 'team_1',
      title: 'session',
      topic: problem,
      messages,
      summary: prdMarkdown,
      tags: [],
      isPinned: false,
      isStarred: false,
      status: 'completed',
      createdAt: '',
      updatedAt: '',
    }
    const baoyuVisualPlans = buildCouncilBaoyuVisualPlans({ problem, selection, prdMarkdown })
    const qualityGate = buildCouncilQualityGate({ problem, selection, session, prdMarkdown, baoyuVisualPlans })
    const certifiedQualityGate = {
      ...qualityGate,
      status: 'approved' as const,
      finalGateStatus: 'approved' as const,
      score: Math.max(95, qualityGate.score),
    }
    const theater = buildCouncilDebateTheater({ selection, messages, prdMarkdown, qualityGate: certifiedQualityGate })
    const deliveryModes = buildCouncilDeliveryModes({
      problem,
      selection,
      prdMarkdown,
      scenes: theater.scenes,
      debateMap: theater.debateMap,
      verdictLedger: theater.verdictLedger,
      qualityGate: certifiedQualityGate,
      baoyuVisualPlans,
    })
    const actionPack = buildCouncilLaunchReadinessPack({
      problem,
      selection,
      prdMarkdown,
      deliveryModes,
      verdictLedger: theater.verdictLedger,
      qualityGate: certifiedQualityGate,
      baoyuVisualPlans,
    })

    const ledger = buildCouncilRuntimeEvidenceLedger({
      runStartedAt: 1000,
      runCompletedAt: 5000,
      selection: selectionWithTrace,
      session,
      debateScenes: theater.scenes,
      debateMap: theater.debateMap,
      verdictLedger: theater.verdictLedger,
      qualityGate: certifiedQualityGate,
      actionTasks: flattenCouncilActionTasks(actionPack.taskGroups),
      baoyuVisualPlans,
    })

    expect(ledger.durationMs).toBe(5000)
    expect(ledger.modelJudgeUsed).toBe(true)
    expect(ledger.deepRunCertification.status).toBe('partial')
    expect(ledger.deepRunCertification.blockers.join('\n')).toContain('未达到默认深度模式')
    expect(ledger.replayFrames.map((frame) => frame.source)).toContain('match-gate')
    expect(ledger.replayFrames.map((frame) => frame.source)).toContain('quality-gate')
    expect(ledger.stageTrace).toHaveLength(6)
    expect(ledger.evidenceItems.map((item) => item.id)).toContain('deep-run-certification')
    expect(ledger.evidenceItems.map((item) => item.id)).toContain('action-pack')
    expect(ledger.nextProofNeeded.join('\n')).toContain('真实小白用户验证')
    expect(renderCouncilRuntimeEvidenceMarkdown(ledger)).toContain('真实运行证据账本')
    expect(renderCouncilRuntimeEvidenceMarkdown(ledger)).toContain('深度长跑认证')
    expect(renderCouncilRuntimeEvidenceMarkdown(ledger)).toContain('运行回放帧')
    expect(renderCouncilRuntimeEvidenceMarkdown(ledger)).not.toContain('sk-')
  })

  it('certifies a deep run only when model judge, full trace, debate, quality, and duration all pass', () => {
    const problem = '做一个 2 分钟以上的小白智囊团深度长跑证据'
    const selection = selectCouncilTeam(problem)
    const selectionWithTrace = {
      ...selection,
      matchGate: {
        ...selection.matchGate,
        decisionSource: 'deep-model' as const,
        stageTrace: [
          'problem-profile',
          'creative-dna',
          'candidate-pool',
          'model-judge',
          'collaboration-matrix',
          'recommendation',
        ].map((phaseId, index) => ({
          phaseId: phaseId as any,
          label: phaseId,
          status: 'completed' as const,
          detail: `stage ${index}`,
          candidatePersonaIds: [],
          startedAt: index * 1000,
          endedAt: index * 1000 + 500,
          decisionSource: index === 3 ? 'deep-model' as const : undefined,
        })),
      },
    }
    const messages: TeamMessage[] = Array.from({ length: 24 }).map((_, index) => {
      const seat = selection.seats[index % selection.seats.length]
      return {
        id: `brief_deep_${index}`,
        agentId: seat.persona.id,
        agentName: seat.persona.name,
        role: 'assistant',
        kind: 'brief',
        timestamp: index,
        content: `【核心判断】第 ${index + 1} 幕要可追溯。【冲突/补充】反对假深度运行。【PRD条款】保留运行回放、质量闸门和用户验证。`,
        metadata: { phaseId: index % 2 ? 'clash' : 'consensus-prd', phaseLabel: index % 2 ? '冲突质询' : '共识成稿' },
      }
    })
    const prdMarkdown = [
      '# PRD',
      '**定位**：运行证据账本。',
      '**北极星指标**：Boss 能判断是否真的跑过。',
      '- P0：输入、匹配闸门、辩论剧场、质量闸门、行动包、导出。',
      '- 页面状态：空态、加载态、失败态、完成态。',
      '- 数据/API：Scene、MapEdge、LedgerItem、QualityGate、ActionPack。',
      '- 测试验收：vitest、typecheck、smoke:ui、build、Electron 跑通。',
      '- 首版验证实验：找 5-8 个用户完成一次闭环，至少 5 人留证且 4 人通过。',
      '- 本地 Openbasaka，Telegram 默认关闭，隐私安全可审计。',
    ].join('\n')
    const session: TeamSession = {
      id: 'session_deep',
      teamId: 'team_1',
      title: 'session',
      topic: problem,
      messages,
      summary: prdMarkdown,
      tags: [],
      isPinned: false,
      isStarred: false,
      status: 'completed',
      createdAt: '',
      updatedAt: '',
    }
    const baoyuVisualPlans = buildCouncilBaoyuVisualPlans({ problem, selection, prdMarkdown })
    const qualityGate = buildCouncilQualityGate({ problem, selection, session, prdMarkdown, baoyuVisualPlans })
    const certifiedQualityGate = {
      ...qualityGate,
      status: 'approved' as const,
      finalGateStatus: 'approved' as const,
      score: Math.max(95, qualityGate.score),
    }
    const theater = buildCouncilDebateTheater({ selection, messages, prdMarkdown, qualityGate: certifiedQualityGate })
    const deliveryModes = buildCouncilDeliveryModes({
      problem,
      selection,
      prdMarkdown,
      scenes: theater.scenes,
      debateMap: theater.debateMap,
      verdictLedger: theater.verdictLedger,
      qualityGate: certifiedQualityGate,
      baoyuVisualPlans,
    })
    const actionPack = buildCouncilLaunchReadinessPack({
      problem,
      selection,
      prdMarkdown,
      deliveryModes,
      verdictLedger: theater.verdictLedger,
      qualityGate: certifiedQualityGate,
      baoyuVisualPlans,
    })

    const ledger = buildCouncilRuntimeEvidenceLedger({
      runStartedAt: 1000,
      runCompletedAt: 130000,
      selection: selectionWithTrace,
      session,
      debateScenes: theater.scenes,
      debateMap: theater.debateMap,
      verdictLedger: theater.verdictLedger,
      qualityGate: certifiedQualityGate,
      actionTasks: flattenCouncilActionTasks(actionPack.taskGroups),
      baoyuVisualPlans,
    })

    expect(ledger.deepRunCertification.blockers).toEqual([])
    expect(ledger.deepRunCertification.status).toBe('proved')
    expect(ledger.deepRunCertification.modelJudgeTraceVerified).toBe(true)
    expect(ledger.deepRunCertification.stageTraceVerified).toBe(true)
    expect(ledger.deepRunCertification.temporalTraceVerified).toBe(true)
    expect(ledger.evidenceItems.find((item) => item.id === 'deep-run-certification')?.status).toBe('proved')

    const forgedSelection = {
      ...selectionWithTrace,
      matchGate: {
        ...selectionWithTrace.matchGate,
        stageTrace: selectionWithTrace.matchGate.stageTrace.map((event) =>
          event.phaseId === 'model-judge' ? { ...event, decisionSource: undefined } : event,
        ),
      },
    }
    const forgedLedger = buildCouncilRuntimeEvidenceLedger({
      runStartedAt: 1000,
      runCompletedAt: 130000,
      selection: forgedSelection,
      session,
      debateScenes: theater.scenes,
      debateMap: theater.debateMap,
      verdictLedger: theater.verdictLedger,
      qualityGate: certifiedQualityGate,
      actionTasks: flattenCouncilActionTasks(actionPack.taskGroups),
      baoyuVisualPlans,
    })

    expect(forgedLedger.deepRunCertification.status).not.toBe('proved')
    expect(forgedLedger.deepRunCertification.modelJudgeTraceVerified).toBe(false)
    expect(forgedLedger.deepRunCertification.blockers.join('\n')).toContain('model-judge')
  })
})
