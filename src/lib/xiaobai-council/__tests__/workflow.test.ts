import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runCouncilPrdWorkflow } from '../workflow'
import { selectCouncilTeam } from '../selector'
import type { CouncilRuntimeWisdomContext } from '../runtime-wisdom'

const activationMock = vi.hoisted(() => ({
  activateCouncilPersonas: vi.fn(async (personas: any[]) =>
    personas.map((persona, index) => ({
      persona,
      created: index === 0,
      agent: {
        id: `agent_${index + 1}`,
        name: persona.name,
        isCustom: true,
        platformConfig: {
          origin: 'xiaobai-council',
          personaId: persona.id,
          telegramEnabled: false,
          surfacedIn: ['openbasaka', 'teams', 'control'],
          workspaceScope: 'openbasaka-local-council',
          modelRoute: { primary: 'glm-5.1', reviewFast: 'deepseek-v4-flash' },
        },
      },
    })),
  ),
}))

const teamsStoreMock = vi.hoisted(() => ({
  createTeam: vi.fn(async () => 'team_1'),
  getTeam: vi.fn(async () => ({
    id: 'team_1',
    name: '小白智囊团',
    description: '',
    teamType: 'brainstorm',
    agents: [],
    config: {
      communicationPattern: 'round-robin',
      workflowType: 'prd',
      executionMode: 'advisory',
      maxRounds: 2,
      temperature: 0.72,
      capabilities: ['prd'],
    },
    createdAt: '',
    updatedAt: '',
  })),
}))

const engineMock = vi.hoisted(() => ({
  runTeamSession: vi.fn(async (_team: any, topic: string, _onProgress?: any, _options?: any) => {
    const progress = {
      id: 'progress_1',
      agentId: 'team-engine',
      agentName: '群策引擎',
      role: 'system',
      content: '进入「冲突质询」阶段：必须点名质询并留下裁决路径。',
      timestamp: 0,
      kind: 'progress',
      metadata: { phaseId: 'clash', phaseLabel: '冲突质询' },
    }
    const messages = [
      {
        id: 'brief_1',
        agentId: 'agent_1',
        agentName: '席位一',
        role: 'assistant',
        content: '【核心判断】P0 要让 Boss 看见思考发生。【冲突/补充】反对一秒默认推荐，它会让匹配失真。【PRD条款】保留辩论剧场。',
        timestamp: 1,
        kind: 'brief',
        metadata: { phaseId: 'clash', phaseLabel: '冲突质询', challengedPersonaIds: ['agent_2'] },
      },
      {
        id: 'brief_2',
        agentId: 'agent_2',
        agentName: '席位二',
        role: 'assistant',
        content: '【核心判断】最终 PRD 必须可开工。【判断与风险】没有证据、待查证事实和验证实验就必须返修。【PRD条款】修正为质量闸门闭环。',
        timestamp: 2,
        kind: 'brief',
        metadata: { phaseId: 'host-verdict', phaseLabel: '主持裁决' },
      },
    ]
    _onProgress?.(progress)
    for (const message of messages) _onProgress?.(message)
    return {
      id: 'session_1',
      teamId: 'team_1',
      title: 'session',
      topic,
      messages: [progress, ...messages],
      summary: '这是一个需要返修的简短 PRD。',
      tags: [],
      isPinned: false,
      isStarred: false,
      status: 'completed',
      createdAt: '',
      updatedAt: '',
    }
  }),
}))

const dreamMock = vi.hoisted(() => ({
  loadAgentDreamState: vi.fn(async (persona: any, options: any) => ({
    personaId: persona.id,
    agentId: options.agentId,
    currentDream: `${persona.shortName} dynamic dream`,
    evidence: [{ kind: 'dream-seed', label: 'seed', text: persona.dreamSeed }],
    growthSignals: [],
    nextAspiration: 'next dream',
    freezeRule: 'next round',
  })),
}))

vi.mock('../activation', () => ({
  activateCouncilPersonas: activationMock.activateCouncilPersonas,
}))

vi.mock('../../teams/store', () => ({
  createTeam: teamsStoreMock.createTeam,
  getTeam: teamsStoreMock.getTeam,
}))

vi.mock('../../teams/engine', () => ({
  runTeamSession: engineMock.runTeamSession,
}))

vi.mock('../dream', () => ({
  loadAgentDreamState: dreamMock.loadAgentDreamState,
}))

describe('xiaobai council workflow integration', () => {
  beforeEach(() => {
    activationMock.activateCouncilPersonas.mockClear()
    teamsStoreMock.createTeam.mockClear()
    teamsStoreMock.getTeam.mockClear()
    engineMock.runTeamSession.mockClear()
    dreamMock.loadAgentDreamState.mockClear()
  })

  it('injects creative enhancement, UI museum context, preferred style override, and frozen dreams', async () => {
    const problem = '做一个有审美的 AI 创意 PRD 工具，需要 Remotion 动效和 UI 风格馆主题'
    const selection = selectCouncilTeam(problem)
    const runtimeWisdomContext: CouncilRuntimeWisdomContext = {
      historyCount: 1,
      confidence: 0.66,
      lastRunId: 'run-before',
      intelligenceSignals: [{
        id: 'fallback-seen',
        label: '历史出现 fallback',
        severity: 'high',
        evidence: '上一轮模型裁判失败，不能再把 fallback 当深度裁判。',
      }],
      avoidRepeating: ['不要把 local-fallback 当成模型深度裁判。'],
      nextRunConstraints: ['下一轮必须留下完整 stage trace。'],
      requiredProof: ['必须保存 runtime history record。'],
      promptFragment: '## 运行智慧反馈\n上一轮 fallback；下一轮必须留下完整 stage trace。\n### 不要重复\n- 不要把 local-fallback 当成模型深度裁判。',
      summary: '已从 1 次运行学习。',
    }
    const runtimeCalibrationPlan = {
      score: 64,
      status: 'needs-baseline' as const,
      label: '需要第一条真实深度基线',
      summary: '需要第一条真实深度基线。当前校准分 64/100。',
      checks: [],
      nextDeepRunProtocol: ['必须完整运行 2-5 分钟。'],
      userValidationProtocol: ['必须 5-8 人稳审真实小白验证。'],
      stopConditions: ['fallback 停止 95 认证。'],
      modelRunInputHints: ['上一轮 fallback'],
      promptFragment: '## 95 真实长跑评测协议\n需要第一条真实深度基线。',
    }
    const snapshots: any[] = []
    const result = await runCouncilPrdWorkflow({
      problem,
      selection,
      preferredStyleIds: ['kinetic'],
      runtimeWisdomContext,
      runtimeCalibrationPlan,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    })

    expect(result.uiStyleContext.styleIds[0]).toBe('kinetic')
    expect(result.matchGate.finalTeam).toHaveLength(selection.seats.length)
    expect(result.creativeEnhancement.promptFragment).toContain('创意孵化器增强输入')
    expect(result.agentDreamStates).toHaveLength(selection.seats.length)
    expect(result.qualityGate.checks.map((item) => item.id)).toContain('actionable-prd')
    expect(result.qualityGate.typedDeliberation.length).toBeGreaterThan(0)
    expect(result.debateScenes.length).toBeGreaterThan(0)
    expect(result.debateMap.edges.length).toBeGreaterThan(0)
    expect(result.verdictLedger.summary).toContain('裁决账本')
    expect(result.qualityRevisionHistory.length).toBeGreaterThanOrEqual(1)
    expect(result.deliveryModes.bossReview.summary).toContain('幕剧场')
    expect(result.deliveryModes.xiaobaiExecute.firstAction).toBeTruthy()
    expect(result.actionPack.taskGroups.map((group) => group.area)).toEqual(['product', 'design', 'engineering', 'test', 'validation'])
    expect(result.actionPack.nowAction).toBe(result.deliveryModes.xiaobaiExecute.firstAction)
    expect(result.actionPack.exportChecklist.join('\n')).toContain('质量闸门')
    expect(result.masterPrdValidation.hitLabels.join('\n')).toContain('角色共识、裁决与来源追溯')
    expect(result.consensusTrace.lanes.map((lane) => lane.id)).toEqual(['claim', 'challenge', 'absorb', 'cut'])
    expect(result.runtimeEvidence.actionTaskCount).toBeGreaterThanOrEqual(10)
    expect(result.runtimeEvidence.deepRunCertification.status).toBe('missing')
    expect(result.runtimeEvidence.deepRunCertification.blockers.join('\n')).toContain('默认深度模式')
    expect(result.runtimeEvidence.replayFrames.map((frame) => frame.source)).toContain('team-session')
    expect(result.runtimeEvidence.replayFrames.map((frame) => frame.source)).toContain('quality-gate')
    expect(result.runtimeEvidence.evidenceItems.map((item) => item.id)).toContain('quality-gate')
    expect(result.runtimeEvidence.nextProofNeeded.join('\n')).toContain('真实小白用户验证')
    expect(result.runtimeWisdomContext?.summary).toBe('已从 1 次运行学习。')
    expect(result.runtimeCalibrationPlan?.label).toBe('需要第一条真实深度基线')
    expect(result.nuwaEvidenceRegistry.personaCount).toBe(selection.seats.length)
    expect(result.nuwaEvidenceRegistry.localReadyCount).toBe(selection.seats.length)
    expect(result.nuwaEvidenceRegistry.manualSourceAuditedCount).toBe(0)
    expect(result.excellenceAudit.targetScore).toBe(95)
    expect(result.excellenceAudit.dimensions.map((item) => item.id)).toContain('runtime-validation')
    expect(result.excellenceAudit.proofChain.join('\n')).toContain('nuwaEvidence=')
    expect(result.excellenceAudit.mustNotClaimYet.join('\n')).toContain('真实小白用户验证')
    expect(result.session.summary).toContain('CouncilQualityGate 返修补丁')
    expect(result.session.summary).toContain('## 共识形成追溯')
    expect(result.baoyuVisualPlans).toEqual([])
    expect(snapshots.map((snapshot) => snapshot.status)).toEqual(expect.arrayContaining([
      'match-ready',
      'activating',
      'team-ready',
      'phase-start',
      'brief-ready',
      'synthesis',
      'quality',
      'trace',
      'completed',
    ]))
    expect(snapshots.find((snapshot) => snapshot.status === 'brief-ready')?.latestClaim).toContain('P0 要让 Boss 看见思考发生')
    expect(snapshots.find((snapshot) => snapshot.status === 'completed')?.headline).toContain('代表性产物完成')
    expect(engineMock.runTeamSession.mock.calls[0][1]).toContain('CouncilMatchGate：先匹配再解决')
    expect(engineMock.runTeamSession.mock.calls[0][1]).toContain('Agent 动态 Dream')
    expect(engineMock.runTeamSession.mock.calls[0][1]).toContain('运行智慧反馈')
    expect(engineMock.runTeamSession.mock.calls[0][1]).toContain('上一轮 fallback')
    expect(engineMock.runTeamSession.mock.calls[0][1]).toContain('95 真实长跑评测协议')
    expect(engineMock.runTeamSession.mock.calls[0][1]).toContain('本轮日期与文档硬规则')
    expect(engineMock.runTeamSession.mock.calls[0][1]).toContain('全技术栈蓝图')
    expect(engineMock.runTeamSession.mock.calls[0][3].uiStyleContext).toEqual(result.uiStyleContext)
    expect(engineMock.runTeamSession.mock.calls[0][3].debatePhases.map((phase: any) => phase.label)).toEqual([
      '追问',
      '独立主张',
      '发散',
      '冲突质询',
      '主持裁决',
      '共识成稿',
    ])
    const createTeamCalls = teamsStoreMock.createTeam.mock.calls as unknown as any[][]
    expect(createTeamCalls[0][0].config.debatePhases).toHaveLength(6)
    expect(engineMock.runTeamSession.mock.calls[0][1]).toContain('UI风格馆自动视觉输入')
    expect(engineMock.runTeamSession.mock.calls[0][1]).toContain('创意孵化器增强条款')
    expect(engineMock.runTeamSession.mock.calls[0][1]).toContain('博弈裁决记录')
  })
})
