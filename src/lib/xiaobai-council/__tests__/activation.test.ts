import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  activateCouncilPersonas,
  COUNCIL_AGENT_ORIGIN,
  getCouncilPersonaId,
  isCouncilAgent,
} from '../activation'
import { COUNCIL_PERSONAS } from '../personas'
import { createCustomAgent, updateCustomAgent } from '../../agents/registry'
import { saveSoul } from '../../agents/soul'
import { addMemoryEntry } from '../../agents/agent-memory'

const registryMock = vi.hoisted(() => {
  const state = { agents: [] as any[] }
  return {
    state,
    listAllAgents: vi.fn(async () => [...state.agents]),
    createCustomAgent: vi.fn(async (agent: any) => {
      const id = `agent_${state.agents.length + 1}`
      state.agents.push({ ...agent, id, isCustom: true })
      return id
    }),
    updateCustomAgent: vi.fn(async (id: string, updates: any) => {
      const index = state.agents.findIndex((agent) => agent.id === id)
      if (index >= 0) state.agents[index] = { ...state.agents[index], ...updates }
    }),
  }
})

const soulMock = vi.hoisted(() => ({
  saveSoul: vi.fn(async () => {}),
}))

const memoryMock = vi.hoisted(() => ({
  loadAgentMemory: vi.fn(async () => ({ agentId: 'agent_1', entries: [], charLimit: 2200 })),
  addMemoryEntry: vi.fn(async () => {}),
}))

vi.mock('../../agents/registry', () => ({
  listAllAgents: registryMock.listAllAgents,
  createCustomAgent: registryMock.createCustomAgent,
  updateCustomAgent: registryMock.updateCustomAgent,
}))

vi.mock('../../agents/soul', () => ({
  saveSoul: soulMock.saveSoul,
}))

vi.mock('../../agents/agent-memory', () => ({
  loadAgentMemory: memoryMock.loadAgentMemory,
  addMemoryEntry: memoryMock.addMemoryEntry,
}))

describe('xiaobai council activation', () => {
  beforeEach(() => {
    registryMock.state.agents.splice(0)
    registryMock.listAllAgents.mockClear()
    registryMock.createCustomAgent.mockClear()
    registryMock.updateCustomAgent.mockClear()
    soulMock.saveSoul.mockClear()
    memoryMock.loadAgentMemory.mockClear()
    memoryMock.addMemoryEntry.mockClear()
  })

  it('creates activated personas as custom agents with council origin metadata', async () => {
    const persona = COUNCIL_PERSONAS[0]
    const activated = await activateCouncilPersonas([persona, persona])

    expect(activated).toHaveLength(1)
    expect(createCustomAgent).toHaveBeenCalledTimes(1)
    expect(saveSoul).toHaveBeenCalledTimes(1)
    expect(activated[0].created).toBe(true)
    expect(activated[0].agent.isCustom).toBe(true)
    expect(activated[0].agent.platformConfig?.origin).toBe(COUNCIL_AGENT_ORIGIN)
    expect(activated[0].agent.platformConfig?.personaId).toBe(persona.id)
    expect(activated[0].agent.platformConfig?.telegramEnabled).toBe(false)
    expect(activated[0].agent.platformConfig?.surfacedIn).not.toContain('telegram')
    expect(addMemoryEntry).toHaveBeenCalledTimes(1)
    expect(isCouncilAgent(activated[0].agent)).toBe(true)
    expect(getCouncilPersonaId(activated[0].agent)).toBe(persona.id)
  })

  it('keeps Telegram opt-in instead of default activation', async () => {
    const persona = COUNCIL_PERSONAS[0]
    const activated = await activateCouncilPersonas([persona], { telegramEnabled: true })

    expect(activated[0].agent.platformConfig?.telegramEnabled).toBe(true)
    expect(activated[0].agent.platformConfig?.surfacedIn).toContain('telegram')
  })

  it('updates an existing council persona instead of duplicating it', async () => {
    const persona = COUNCIL_PERSONAS[1]

    await activateCouncilPersonas([persona])
    const second = await activateCouncilPersonas([persona])

    expect(createCustomAgent).toHaveBeenCalledTimes(1)
    expect(updateCustomAgent).toHaveBeenCalledTimes(1)
    expect(saveSoul).toHaveBeenCalledTimes(2)
    expect(registryMock.state.agents).toHaveLength(1)
    expect(second[0].created).toBe(false)
    expect(second[0].agent.platformConfig?.origin).toBe(COUNCIL_AGENT_ORIGIN)
  })
})
