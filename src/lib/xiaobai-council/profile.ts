import { listAllAgents, type AgentDefinition } from '../agents/registry'
import { loadAgentMemory } from '../agents/agent-memory'
import { getSoul, type AgentSoul } from '../agents/soul'
import type { TeamMessage } from '../teams/types'
import { getCouncilPersonaId, isCouncilAgent, type CouncilActivatedAgent } from './activation'
import { buildCouncilDistillationProfile, type CouncilDistillationProfile } from './distillation'
import { loadAgentDreamState, type AgentDreamState } from './dream'
import type { CouncilPersona } from './personas'

export interface CouncilPersonaProfile {
  persona: CouncilPersona
  agent?: {
    id: string
    name: string
    modelRoute?: Record<string, unknown>
    workspaceScope: string
    surfacedIn: string[]
    telegramEnabled: boolean
  }
  soul?: AgentSoul
  dreamState: AgentDreamState
  distillationProfile: CouncilDistillationProfile
  memory: {
    entriesCount: number
    totalChars: number
    recentEntries: Array<{ text: string; createdAt: string }>
  }
  contributions: {
    briefCount: number
    reflectionCount: number
    latest: string
    disagreements: string[]
  }
  safety: {
    sourcePolicy: string
    localOnly: boolean
    privateDataRule: string
  }
}

function compact(value: string, max = 180): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function readConfig(agent?: AgentDefinition): Record<string, unknown> {
  if (!agent?.platformConfig || typeof agent.platformConfig !== 'object') return {}
  return agent.platformConfig as Record<string, unknown>
}

async function findCouncilAgent(persona: CouncilPersona, activatedAgents: CouncilActivatedAgent[] = []): Promise<AgentDefinition | undefined> {
  const activated = activatedAgents.find((item) => item.persona.id === persona.id)?.agent
  if (activated) return activated
  try {
    const agents = await listAllAgents()
    return agents.find((agent) => isCouncilAgent(agent) && getCouncilPersonaId(agent) === persona.id)
  } catch {
    return undefined
  }
}

function buildContributionProfile(persona: CouncilPersona, messages: TeamMessage[] = []): CouncilPersonaProfile['contributions'] {
  const relevant = messages.filter((message) => message.agentName === persona.name || message.agentName === persona.shortName)
  const briefMessages = relevant.filter((message) => message.kind === 'brief')
  const reflectionMessages = relevant.filter((message) => message.kind === 'reflection')
  const disagreementSignals = briefMessages
    .map((message) => message.content)
    .filter((content) => /反对|不同意|质询|风险|但是|缺口|失败/.test(content))
    .map((content) => compact(content, 120))
    .slice(0, 3)

  return {
    briefCount: briefMessages.length,
    reflectionCount: reflectionMessages.length,
    latest: compact(relevant[relevant.length - 1]?.content || '本轮还没有发言，当前仅展示本地身份、SOUL 与记忆状态。', 180),
    disagreements: disagreementSignals,
  }
}

export async function buildCouncilPersonaProfile(params: {
  persona: CouncilPersona
  activatedAgents?: CouncilActivatedAgent[]
  messages?: TeamMessage[]
}): Promise<CouncilPersonaProfile> {
  const agent = await findCouncilAgent(params.persona, params.activatedAgents)
  const config = readConfig(agent)
  const dreamState = await loadAgentDreamState(params.persona, { agentId: agent?.id })
  const distillationProfile = buildCouncilDistillationProfile(params.persona)

  let soul: AgentSoul | undefined
  let memory: CouncilPersonaProfile['memory'] = {
    entriesCount: 0,
    totalChars: 0,
    recentEntries: [],
  }

  if (agent?.id) {
    try {
      soul = await getSoul(agent.id)
    } catch {
      soul = undefined
    }
    try {
      const loaded = await loadAgentMemory(agent.id)
      memory = {
        entriesCount: loaded.entries.length,
        totalChars: loaded.entries.map((entry) => entry.text).join('§').length,
        recentEntries: loaded.entries.slice(0, 4).map((entry) => ({
          text: compact(entry.text, 160),
          createdAt: entry.createdAt,
        })),
      }
    } catch {
      memory = {
        entriesCount: 0,
        totalChars: 0,
        recentEntries: [],
      }
    }
  }

  return {
    persona: params.persona,
    agent: agent
      ? {
          id: agent.id,
          name: agent.name,
          modelRoute: config.modelRoute as Record<string, unknown> | undefined,
          workspaceScope: String(config.workspaceScope || 'openbasaka-local-council'),
          surfacedIn: Array.isArray(config.surfacedIn) ? config.surfacedIn.map(String) : ['openbasaka', 'teams', 'control'],
          telegramEnabled: config.telegramEnabled === true,
        }
      : undefined,
    soul,
    dreamState,
    distillationProfile,
    memory,
    contributions: buildContributionProfile(params.persona, params.messages),
    safety: {
      sourcePolicy: params.persona.sourcePolicy,
      localOnly: config.telegramEnabled !== true,
      privateDataRule: '只展示安全摘要、计数和短摘，不暴露密钥、原始长日志或完整隐私配置。',
    },
  }
}
