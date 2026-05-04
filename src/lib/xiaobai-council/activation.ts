import {
  createCustomAgent,
  listAllAgents,
  updateCustomAgent,
  type AgentDefinition,
} from '../agents/registry'
import { addMemoryEntry, loadAgentMemory } from '../agents/agent-memory'
import { saveSoul, type AgentSoul } from '../agents/soul'
import { type CouncilPersona, COUNCIL_SOURCE_POLICY } from './personas'
import { COUNCIL_DISTILLATION_STATUS_LABELS, buildCouncilDistillationProfile } from './distillation'

export const COUNCIL_AGENT_ORIGIN = 'xiaobai-council'

export interface CouncilActivatedAgent {
  persona: CouncilPersona
  agent: AgentDefinition
  created: boolean
}

export interface CouncilActivationOptions {
  telegramEnabled?: boolean
  surfacedIn?: string[]
  workspaceScope?: string
}

interface CouncilPlatformConfig {
  origin?: string
  personaId?: string
  personaShortName?: string
  sourcePolicy?: string
  publicBasis?: string
  activatedAt?: string
  surfacedIn?: string[]
  telegramEnabled?: boolean
  [key: string]: unknown
}

export async function activateCouncilPersonas(
  personas: CouncilPersona[],
  options: CouncilActivationOptions = {},
): Promise<CouncilActivatedAgent[]> {
  const uniquePersonas = Array.from(new Map(personas.map((persona) => [persona.id, persona])).values())
  const existingAgents = await listAllAgents()
  const activated: CouncilActivatedAgent[] = []

  for (const persona of uniquePersonas) {
    const existing = findExistingCouncilAgent(existingAgents, persona)
    const draft = buildCouncilAgentDefinition(persona, existing, options)

    if (existing) {
      await updateCustomAgent(existing.id, {
        name: draft.name,
        nameEn: draft.nameEn,
        icon: draft.icon,
        avatarStyle: draft.avatarStyle,
        systemPromptSuffix: draft.systemPromptSuffix,
        temperature: draft.temperature,
        skills: draft.skills,
        color: draft.color,
        platformConfig: mergeCouncilPlatformConfig(existing.platformConfig, persona, options),
      })
      await saveCouncilAgentSoul(existing.id, persona)
      await ensureCouncilAgentMemory(existing.id, persona)
      const updated: AgentDefinition = {
        ...existing,
        ...draft,
        id: existing.id,
        isCustom: true,
        botToken: existing.botToken,
        platformConfig: mergeCouncilPlatformConfig(existing.platformConfig, persona, options),
      }
      activated.push({ persona, agent: updated, created: false })
      continue
    }

    const id = await createCustomAgent(draft)
    await saveCouncilAgentSoul(id, persona)
    await ensureCouncilAgentMemory(id, persona)
    const createdAgent: AgentDefinition = {
      ...draft,
      id,
      isCustom: true,
    }
    existingAgents.push(createdAgent)
    activated.push({ persona, agent: createdAgent, created: true })
  }

  return activated
}

async function saveCouncilAgentSoul(agentId: string, persona: CouncilPersona): Promise<void> {
  await saveSoul(agentId, buildCouncilAgentSoul(persona))
}

function buildCouncilAgentSoul(persona: CouncilPersona): AgentSoul {
  const distillation = buildCouncilDistillationProfile(persona)
  return {
    identity: [
      `你是 Openbasaka「小白智囊团」中的 ${persona.name}。`,
      COUNCIL_SOURCE_POLICY,
      `公开参考：${persona.publicBasis}`,
      `真实人类依据：${distillation.realHumanBasis.displayName}。`,
      `Nuwa 蒸馏状态：${COUNCIL_DISTILLATION_STATUS_LABELS[distillation.distillationStatus]}。`,
      '你不是真实人物本人，不代表本人、机构、继承人或授权方；你只扮演公开思想原型提炼出的 AI 角色。',
    ].join('\n'),
    tone: persona.temperament,
    principles: [
      `初始 dreamSeed：${persona.dreamSeed}`,
      persona.promptSeed,
      `Nuwa skill draft: ${distillation.skillPackagePath}SKILL.md`,
      '所有建议都要落到用户动作、系统反应、数据去向、异常状态和验收标准。',
      '和其他智囊团成员产生真实分歧时，先讲清分歧，再收束成 PRD 可执行条款。',
      '复杂事实、实时资讯、法律医疗金融等高风险判断必须标记需要真实来源验证。',
    ],
    avoidance: [
      '不声称自己是真实人物本人、被授权代表或拥有私人未公开观点。',
      '不编造公开材料之外的私人经历、立场和承诺。',
      '不输出空泛口号，不跳过边界、失败模式和验证方案。',
    ],
    uncertainty: '当证据不足时，明确列出缺口、所需来源、验证路径和当前仅能给出的假设级建议。',
  }
}

export function buildCouncilAgentDefinition(
  persona: CouncilPersona,
  existing?: AgentDefinition,
  options: CouncilActivationOptions = {},
): Omit<AgentDefinition, 'id' | 'isCustom'> {
  return {
    name: persona.name,
    nameEn: `XiaoBai Council ${persona.id}`,
    icon: persona.icon,
    systemPromptSuffix: buildCouncilSystemPrompt(persona),
    temperature: councilTemperature(persona),
    skills: Array.from(
      new Set(
        ['prd', 'review', 'nuwa-persona-distiller', persona.nuwaSkillId || '', ...persona.defaultSkills].filter(
          (skill): skill is string => Boolean(skill),
        ),
      ),
    ),
    avatarStyle: 'hermes',
    color: persona.color,
    botToken: existing?.botToken || '',
    platformConfig: mergeCouncilPlatformConfig(existing?.platformConfig, persona, options),
  }
}

export function isCouncilAgent(agent: AgentDefinition): boolean {
  return readCouncilPlatformConfig(agent.platformConfig).origin === COUNCIL_AGENT_ORIGIN
}

export function getCouncilPersonaId(agent: AgentDefinition): string {
  return String(readCouncilPlatformConfig(agent.platformConfig).personaId || '')
}

function findExistingCouncilAgent(agents: AgentDefinition[], persona: CouncilPersona): AgentDefinition | undefined {
  return agents.find((agent) => {
    const config = readCouncilPlatformConfig(agent.platformConfig)
    return (
      (config.origin === COUNCIL_AGENT_ORIGIN && config.personaId === persona.id) ||
      agent.nameEn === `XiaoBai Council ${persona.id}` ||
      agent.name === persona.name
    )
  })
}

function buildCouncilSystemPrompt(persona: CouncilPersona): string {
  const distillation = buildCouncilDistillationProfile(persona)
  return [
    `你是 Openbasaka「小白智囊团」中的 ${persona.name}。`,
    COUNCIL_SOURCE_POLICY,
    `公开参考：${persona.publicBasis}`,
    `真实人类依据：${distillation.realHumanBasis.displayName}；Nuwa 状态：${COUNCIL_DISTILLATION_STATUS_LABELS[distillation.distillationStatus]}；本地 skill 包：${distillation.skillPackagePath}。`,
    `你不是真实人物本人，不代表本人、机构、继承人或授权方。你只能把公开思想、公开方法和公开作品风格转化为产品分析角色。`,
    `你的职责：${persona.promptSeed}`,
    `诚实边界：${persona.honestLimits.join('；')}`,
    `初始 dreamSeed：${persona.dreamSeed}。这个 dream 只能随你的私有记忆、reflection 和进化事件在后续会话中改变。`,
    `气质：${persona.temperament}`,
    `默认工作产物：事无巨细 PRD、风险审查、技术/体验/市场条款、Baoyu-ready 图文解说建议。`,
    `输出要求：中文，具体，可落地。每条建议都要说明用户动作、系统反应、数据去向、异常状态、验收标准或验证方式。不要用“我是某某本人”的说法。`,
  ].join('\n')
}

function councilTemperature(persona: CouncilPersona): number {
  if (persona.domains.includes('risk')) return 0.46
  if (persona.domains.includes('technology')) return 0.42
  if (persona.domains.includes('visual') || persona.domains.includes('storytelling')) return 0.72
  return 0.58
}

function readCouncilPlatformConfig(value: unknown): CouncilPlatformConfig {
  if (!value || typeof value !== 'object') return {}
  return value as CouncilPlatformConfig
}

async function ensureCouncilAgentMemory(agentId: string, persona: CouncilPersona): Promise<void> {
  const distillation = buildCouncilDistillationProfile(persona)
  const marker = `[council-soul:${persona.id}]`
  const memory = await loadAgentMemory(agentId)
  if (memory.entries.some((entry) => entry.text.includes(marker))) return
  await addMemoryEntry(
    agentId,
    [
      `${marker} 本角色是小白智囊团的独立公开思想原型。`,
      `public_basis: ${persona.publicBasis}`,
      `real_human_basis: ${distillation.realHumanBasis.displayName}`,
      `nuwa_status: ${distillation.distillationStatus}`,
      `nuwa_skill_package: ${distillation.skillPackagePath}`,
      `dream_seed: ${persona.dreamSeed}`,
      'workspace_scope: Openbasaka local council, teams, control panel; Telegram is optional and disabled by default.',
      `skill_profile: ${persona.defaultSkills.join(' / ')}`,
      'source: xiaobai-council activation seed',
    ].join('\n'),
  )
}

function mergeCouncilPlatformConfig(
  value: unknown,
  persona: CouncilPersona,
  options: CouncilActivationOptions = {},
): CouncilPlatformConfig {
  const surfacedIn = options.surfacedIn || ['openbasaka', 'teams', 'control']
  const telegramEnabled = options.telegramEnabled === true
  const distillation = buildCouncilDistillationProfile(persona)
  return {
    ...readCouncilPlatformConfig(value),
    origin: COUNCIL_AGENT_ORIGIN,
    personaId: persona.id,
    personaShortName: persona.shortName,
    sourcePolicy: persona.sourcePolicy,
    publicBasis: persona.publicBasis,
    realHumanBasis: persona.realHumanBasis,
    nuwaSkillId: persona.nuwaSkillId,
    distillationStatus: distillation.distillationStatus,
    sourceCoverage: persona.sourceCoverage,
    honestLimits: persona.honestLimits,
    skillPackagePath: distillation.skillPackagePath,
    activatedAt: new Date().toISOString(),
    surfacedIn: telegramEnabled ? Array.from(new Set([...surfacedIn, 'telegram'])) : surfacedIn.filter((item) => item !== 'telegram'),
    telegramEnabled,
    workspaceScope: options.workspaceScope || 'openbasaka-local-council',
    hermesIdentity: {
      soul: 'private',
      memory: 'private-frozen-session-snapshot',
      userPreference: 'private',
      skillProfile: persona.defaultSkills,
      sourcePolicy: persona.sourcePolicy,
      reflection: 'post-round-write-next-session',
    },
    modelRoute: {
      primary: 'glm-5.1',
      reviewFast: 'deepseek-v4-flash',
      reviewHeavyOptional: 'deepseek-v4-pro',
    },
  }
}
