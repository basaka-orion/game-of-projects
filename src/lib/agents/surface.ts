import { getAllExperts, getExpertConfig, type ExpertRole } from '../chat/router'
import { listAllAgents, type AgentDefinition } from './registry'

export interface AgentSurfaceProfile {
  id: string
  name: string
  nameEn: string
  emoji: string
  color: string
  temperature: number
  skills: string[]
  source: 'builtin' | 'custom'
  isCustom: boolean
  platformConfig?: Record<string, unknown>
}

const BUILTIN_ROLES = new Set<ExpertRole>(['general', 'strategy', 'technical', 'market', 'creative', 'critic', 'visual'])

export function isExpertRole(value: string | undefined): value is ExpertRole {
  return Boolean(value && BUILTIN_ROLES.has(value as ExpertRole))
}

export function getFallbackAgentSurfaceProfile(agentId: string = 'general'): AgentSurfaceProfile {
  const role = isExpertRole(agentId) ? agentId : 'general'
  const config = getExpertConfig(role)
  return {
    id: role,
    name: config.name,
    nameEn: config.nameEn,
    emoji: config.emoji,
    color: '#00d4aa',
    temperature: config.temperature,
    skills: [],
    source: 'builtin',
    isCustom: false,
  }
}

export async function resolveAgentSurfaceProfiles(): Promise<AgentSurfaceProfile[]> {
  const builtInProfiles = getBuiltInAgentSurfaceProfiles()
  const agents = await listAllAgents()
  const customProfiles = agents.filter((agent) => agent.isCustom).map(agentToSurfaceProfile)
  return [...builtInProfiles, ...customProfiles]
}

export function getBuiltInAgentSurfaceProfiles(): AgentSurfaceProfile[] {
  return getAllExperts().map(({ role, config }) => ({
    id: role,
    name: config.name,
    nameEn: config.nameEn,
    emoji: config.emoji,
    color: '#00d4aa',
    temperature: config.temperature,
    skills: [],
    source: 'builtin' as const,
    isCustom: false,
  }))
}

export function agentToSurfaceProfile(agent: AgentDefinition): AgentSurfaceProfile {
  return {
    id: agent.id,
    name: agent.name,
    nameEn: agent.nameEn || agent.name,
    emoji: agent.icon || '◈',
    color: agent.color || '#00d4aa',
    temperature: agent.temperature ?? 0.7,
    skills: agent.skills || [],
    source: agent.isCustom ? 'custom' : 'builtin',
    isCustom: agent.isCustom,
    platformConfig: agent.platformConfig,
  }
}

export function getAgentSurfaceProfile(
  agentId: string,
  profiles: AgentSurfaceProfile[] = [],
): AgentSurfaceProfile {
  return profiles.find((profile) => profile.id === agentId) || getFallbackAgentSurfaceProfile(agentId)
}

export function getAgentSurfaceName(agentId: string, profiles: AgentSurfaceProfile[] = []): string {
  return getAgentSurfaceProfile(agentId, profiles).name
}
