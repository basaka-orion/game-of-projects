import { listAllAgents, type AgentDefinition } from '../agents/registry'
import { loadAgentMemory } from '../agents/agent-memory'
import { ensureHermesIdentitySchema } from '../agents/hermes-identity'
import { query } from '../db/repository'
import { getCouncilPersonaId, isCouncilAgent } from './activation'
import type { CouncilPersona } from './personas'

export interface AgentDreamEvidence {
  kind: 'dream-seed' | 'memory' | 'reflection' | 'snapshot' | 'evolution'
  label: string
  text: string
  createdAt?: string
}

export interface AgentDreamState {
  personaId: string
  agentId?: string
  currentDream: string
  evidence: AgentDreamEvidence[]
  lastChangedAt?: string
  growthSignals: string[]
  nextAspiration: string
  freezeRule: string
}

interface ReflectionRow {
  phase: string
  learned: string
  next_time: string
  created_at: string
}

interface SnapshotRow {
  topic: string
  created_at: string
}

interface EvolutionRow {
  event_type: string
  learned_what: string
  next_action: string
  created_at: string
  updated_at: string
}

function compact(value: string, max = 180): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function unique(values: string[], limit = 6): string[] {
  return Array.from(new Set(values.map((value) => compact(value, 90)).filter(Boolean))).slice(0, limit)
}

function findLatestDate(values: Array<string | undefined>): string | undefined {
  const timestamps = values
    .filter(Boolean)
    .map((value) => Date.parse(value as string))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)
  return timestamps[0] ? new Date(timestamps[0]).toISOString() : undefined
}

function findExistingCouncilAgent(agents: AgentDefinition[], personaId: string): AgentDefinition | undefined {
  return agents.find((agent) => isCouncilAgent(agent) && getCouncilPersonaId(agent) === personaId)
}

async function resolveCouncilAgent(personaId: string, agentId?: string): Promise<AgentDefinition | undefined> {
  try {
    const agents = await listAllAgents()
    if (agentId) return agents.find((agent) => agent.id === agentId) || { id: agentId, name: agentId } as AgentDefinition
    return findExistingCouncilAgent(agents, personaId)
  } catch {
    return agentId ? ({ id: agentId, name: agentId } as AgentDefinition) : undefined
  }
}

async function loadReflectionEvidence(agentId: string): Promise<ReflectionRow[]> {
  try {
    await ensureHermesIdentitySchema()
    return query<ReflectionRow>(
      `SELECT phase, learned, next_time, created_at
         FROM agent_reflections
        WHERE agent_id = ?
        ORDER BY created_at DESC
        LIMIT 5`,
      [agentId],
    )
  } catch {
    return []
  }
}

async function loadSnapshotEvidence(agentId: string): Promise<SnapshotRow[]> {
  try {
    await ensureHermesIdentitySchema()
    return query<SnapshotRow>(
      `SELECT topic, created_at
         FROM agent_session_snapshots
        WHERE agent_id = ?
        ORDER BY created_at DESC
        LIMIT 3`,
      [agentId],
    )
  } catch {
    return []
  }
}

async function loadEvolutionEvidence(agentId: string, personaId: string): Promise<EvolutionRow[]> {
  try {
    return query<EvolutionRow>(
      `SELECT event_type, learned_what, next_action, created_at, updated_at
         FROM evolution_events
        WHERE source_id IN (?, ?)
           OR metadata_json LIKE ?
        ORDER BY updated_at DESC
        LIMIT 4`,
      [agentId, personaId, `%${personaId}%`],
    )
  } catch {
    return []
  }
}

function composeDream(params: {
  persona: CouncilPersona
  reflections: ReflectionRow[]
  memories: string[]
  evolutions: EvolutionRow[]
}): string {
  const latestReflection = params.reflections.find((row) => row.learned)?.learned
  const latestEvolution = params.evolutions.find((row) => row.learned_what)?.learned_what
  const latestMemory = params.memories[0]
  const growth = latestReflection || latestEvolution || latestMemory

  if (!growth) return params.persona.dreamSeed

  return compact(
    [
      params.persona.dreamSeed,
      `最近它正在把「${compact(growth, 72)}」吸收到自己的长期志向里。`,
    ].join(' '),
    260,
  )
}

export async function loadAgentDreamState(
  persona: CouncilPersona,
  options: { agentId?: string } = {},
): Promise<AgentDreamState> {
  const agent = await resolveCouncilAgent(persona.id, options.agentId)
  const evidence: AgentDreamEvidence[] = [
    {
      kind: 'dream-seed',
      label: '初始志向',
      text: persona.dreamSeed,
    },
  ]

  let memoryTexts: string[] = []
  let reflections: ReflectionRow[] = []
  let snapshots: SnapshotRow[] = []
  let evolutions: EvolutionRow[] = []

  if (agent?.id) {
    try {
      const memory = await loadAgentMemory(agent.id)
      memoryTexts = memory.entries.map((entry) => compact(entry.text, 140)).filter(Boolean).slice(0, 4)
      for (const entry of memory.entries.slice(0, 3)) {
        evidence.push({
          kind: 'memory',
          label: '私有记忆',
          text: compact(entry.text, 160),
          createdAt: entry.createdAt,
        })
      }
    } catch {
      memoryTexts = []
    }

    reflections = await loadReflectionEvidence(agent.id)
    snapshots = await loadSnapshotEvidence(agent.id)
    evolutions = await loadEvolutionEvidence(agent.id, persona.id)

    for (const row of reflections.slice(0, 3)) {
      evidence.push({
        kind: 'reflection',
        label: `反思：${row.phase || '学习'}`,
        text: compact([row.learned, row.next_time].filter(Boolean).join(' '), 180),
        createdAt: row.created_at,
      })
    }
    for (const row of snapshots.slice(0, 2)) {
      evidence.push({
        kind: 'snapshot',
        label: '冻结快照',
        text: compact(row.topic || '本轮会话快照已冻结。', 140),
        createdAt: row.created_at,
      })
    }
    for (const row of evolutions.slice(0, 2)) {
      evidence.push({
        kind: 'evolution',
        label: `进化：${row.event_type || 'learning'}`,
        text: compact([row.learned_what, row.next_action].filter(Boolean).join(' '), 180),
        createdAt: row.updated_at || row.created_at,
      })
    }
  }

  const growthSignals = unique([
    ...reflections.map((row) => row.learned),
    ...evolutions.map((row) => row.learned_what),
    ...memoryTexts,
  ])
  const nextAspiration =
    reflections.find((row) => row.next_time)?.next_time ||
    evolutions.find((row) => row.next_action)?.next_action ||
    `下一轮继续用「${persona.shortName}」的方法论把分歧、证据和可执行条款讲清楚。`

  return {
    personaId: persona.id,
    agentId: agent?.id,
    currentDream: composeDream({ persona, reflections, memories: memoryTexts, evolutions }),
    evidence,
    lastChangedAt: findLatestDate(evidence.map((item) => item.createdAt)),
    growthSignals,
    nextAspiration: compact(nextAspiration, 180),
    freezeRule: '本轮新学习只写入 reflection / MEMORY，下一轮会话或下次打开档案后再影响 dream。',
  }
}
