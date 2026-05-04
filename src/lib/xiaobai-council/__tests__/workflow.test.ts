import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runCouncilPrdWorkflow } from '../workflow'
import { selectCouncilTeam } from '../selector'

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
  runTeamSession: vi.fn(async (_team: any, topic: string, _onProgress?: any, _options?: any) => ({
    id: 'session_1',
    teamId: 'team_1',
    title: 'session',
    topic,
    messages: [],
    summary: `PRD summary\n${topic}`,
    tags: [],
    createdAt: '',
    updatedAt: '',
  })),
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
    const result = await runCouncilPrdWorkflow({
      problem,
      selection,
      preferredStyleIds: ['kinetic'],
    })

    expect(result.uiStyleContext.styleIds[0]).toBe('kinetic')
    expect(result.matchGate.finalTeam).toHaveLength(selection.seats.length)
    expect(result.creativeEnhancement.promptFragment).toContain('创意孵化器增强输入')
    expect(result.agentDreamStates).toHaveLength(selection.seats.length)
    expect(engineMock.runTeamSession.mock.calls[0][1]).toContain('CouncilMatchGate：先匹配再解决')
    expect(engineMock.runTeamSession.mock.calls[0][1]).toContain('Agent 动态 Dream')
    expect(engineMock.runTeamSession.mock.calls[0][3]).toEqual({ uiStyleContext: result.uiStyleContext })
    expect(engineMock.runTeamSession.mock.calls[0][1]).toContain('UI风格馆自动视觉输入')
    expect(engineMock.runTeamSession.mock.calls[0][1]).toContain('创意孵化器增强条款')
  })
})
