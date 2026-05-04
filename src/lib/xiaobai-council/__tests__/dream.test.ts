import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadAgentDreamState } from '../dream'
import { COUNCIL_PERSONAS } from '../personas'

const registryMock = vi.hoisted(() => ({
  listAllAgents: vi.fn(async () => [] as any[]),
}))

const memoryMock = vi.hoisted(() => ({
  loadAgentMemory: vi.fn(async () => ({ agentId: 'agent_1', entries: [] as any[], charLimit: 2200 })),
}))

const hermesMock = vi.hoisted(() => ({
  ensureHermesIdentitySchema: vi.fn(async () => {}),
}))

const dbMock = vi.hoisted(() => ({
  query: vi.fn(async (..._args: any[]) => [] as any[]),
}))

vi.mock('../../agents/registry', () => ({
  listAllAgents: registryMock.listAllAgents,
}))

vi.mock('../../agents/agent-memory', () => ({
  loadAgentMemory: memoryMock.loadAgentMemory,
}))

vi.mock('../../agents/hermes-identity', () => ({
  ensureHermesIdentitySchema: hermesMock.ensureHermesIdentitySchema,
}))

vi.mock('../../db/repository', () => ({
  query: dbMock.query,
}))

describe('agent dynamic dream state', () => {
  beforeEach(() => {
    registryMock.listAllAgents.mockReset()
    registryMock.listAllAgents.mockResolvedValue([])
    memoryMock.loadAgentMemory.mockClear()
    hermesMock.ensureHermesIdentitySchema.mockClear()
    dbMock.query.mockReset()
    dbMock.query.mockResolvedValue([])
  })

  it('starts from dreamSeed before an agent has local learning evidence', async () => {
    const persona = COUNCIL_PERSONAS[0]
    const dream = await loadAgentDreamState(persona)

    expect(dream.currentDream).toBe(persona.dreamSeed)
    expect(dream.evidence[0]).toMatchObject({ kind: 'dream-seed', text: persona.dreamSeed })
    expect(dream.freezeRule).toContain('下一轮')
  })

  it('changes currentDream from persisted reflection and memory evidence', async () => {
    const persona = COUNCIL_PERSONAS[1]
    registryMock.listAllAgents.mockResolvedValue([
      {
        id: 'agent_1',
        name: persona.name,
        platformConfig: { origin: 'xiaobai-council', personaId: persona.id },
      },
    ])
    memoryMock.loadAgentMemory.mockResolvedValue({
      agentId: 'agent_1',
      charLimit: 2200,
      entries: [{ rowid: 1, text: '持续学习如何把复杂架构压缩成最短验证路径。', createdAt: '2026-05-01T00:00:00.000Z' }],
    })
    dbMock.query.mockImplementation(async (sql: string) => {
      if (sql.includes('agent_reflections')) {
        return [
          {
            phase: '互相质询与收束',
            learned: '本轮学到要先暴露成本和工程瓶颈。',
            next_time: '下次先给出最短可验证实验。',
            created_at: '2026-05-02T00:00:00.000Z',
          },
        ]
      }
      return []
    })

    const dream = await loadAgentDreamState(persona)

    expect(dream.currentDream).toContain(persona.dreamSeed)
    expect(dream.currentDream).toContain('工程瓶颈')
    expect(dream.growthSignals.join(' ')).toContain('工程瓶颈')
    expect(dream.nextAspiration).toContain('最短可验证实验')
    expect(dream.evidence.some((item) => item.kind === 'reflection')).toBe(true)
  })
})
