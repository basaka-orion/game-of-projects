/**
 * Agent Registry — 统一管理内置专家和自定义 Agent Bot
 *
 * 支持两类 Agent 的 IM 渠道独立配置：
 * - 内置专家：通过 settings 表 agent_{roleId}_bot_token 等键值对存储
 * - 自定义 Agent：通过 custom_agents 表的 bot_token / platform_config_json 列存储
 */
import { ExpertRole, getExpertConfig, getAllExperts } from '../chat/router'
import { query, run } from '../db/repository'
import { generateId } from '../db/schema'
import { getSetting, setSetting } from '../db/store'

const BUILTIN_AGENT_SKILLS: Partial<Record<ExpertRole, string[]>> = {
  visual: ['remotion-motion-design', 'baoyu-visual-kit', 'openbasaka-visual-master'],
}

export interface AgentDefinition {
  id: string
  name: string
  nameEn: string
  icon: string
  /** 系统提示词（追加到基础 context 之后） */
  systemPromptSuffix: string
  temperature: number
  /** 技能 ID 列表 */
  skills: string[]
  /** 是否为用户自定义 */
  isCustom: boolean
  /** 头像样式 */
  avatarStyle: 'default' | 'hermes'
  /** 主题色 */
  color: string
  /** Bot Token（外部平台身份标识） */
  botToken?: string
  /** 平台集成配置 */
  platformConfig?: Record<string, unknown>
}

interface CustomAgentRow {
  id: string
  name: string
  name_en: string
  icon: string
  avatar_style: string
  system_prompt: string
  system_prompt_en: string
  temperature: number
  personality: string
  skills: string
  color: string
  bot_token: string
  platform_config_json: string
}

/** 读取内置专家的 IM 渠道配置（从 settings 表） */
export function getBuiltInAgentIMConfig(roleId: string): {
  botToken: string
  platform: 'telegram' | 'discord' | 'slack'
  targetId: string
} {
  return {
    botToken: getSetting(`agent_${roleId}_bot_token`, ''),
    platform: (getSetting(`agent_${roleId}_platform`, 'telegram') as 'telegram' | 'discord' | 'slack'),
    targetId: getSetting(`agent_${roleId}_im_target_id`, ''),
  }
}

/** 保存内置专家的 IM 渠道配置（到 settings 表） */
export function saveBuiltInAgentIMConfig(
  roleId: string,
  botToken: string,
  platform: 'telegram' | 'discord' | 'slack' = 'telegram',
  targetId: string = ''
): void {
  setSetting(`agent_${roleId}_bot_token`, botToken)
  setSetting(`agent_${roleId}_platform`, platform)
  setSetting(`agent_${roleId}_im_target_id`, targetId)
}

/** 获取所有 Agent（内置 + 自定义） */
export async function listAllAgents(): Promise<AgentDefinition[]> {
  const builtIn = getAllExperts().map(({ role, config }) => {
    const imConfig = getBuiltInAgentIMConfig(role)
    return {
      id: role,
      name: config.name,
      nameEn: config.nameEn,
      icon: config.emoji,
      systemPromptSuffix: config.suffix,
      temperature: config.temperature,
      skills: BUILTIN_AGENT_SKILLS[role] || [],
      isCustom: false,
      avatarStyle: 'default' as const,
      color: '#00d4aa',
      botToken: imConfig.botToken || undefined,
      platformConfig: imConfig.botToken ? {
        defaultPlatform: imConfig.platform,
        targets: imConfig.targetId ? [{ platform: imConfig.platform, targetId: imConfig.targetId, enabled: true }] : [],
      } : undefined,
    }
  })

  try {
    const rows = await query<CustomAgentRow>('SELECT * FROM custom_agents ORDER BY created_at DESC')
    const custom: AgentDefinition[] = rows.map(row => ({
      id: row.id,
      name: row.name,
      nameEn: row.name_en || row.name,
      icon: row.icon,
      systemPromptSuffix: row.system_prompt,
      temperature: row.temperature,
      skills: JSON.parse(row.skills || '[]'),
      isCustom: true,
      avatarStyle: (row.avatar_style === 'hermes' ? 'hermes' : 'default') as 'default' | 'hermes',
      color: row.color || '#00d4aa',
      botToken: row.bot_token || '',
      platformConfig: JSON.parse(row.platform_config_json || '{}'),
    }))
    return [...builtIn, ...custom]
  } catch {
    return builtIn
  }
}

/** 根据 ID 获取 Agent 定义 */
export async function getAgentById(id: string): Promise<AgentDefinition | undefined> {
  // 先检查内置
  const experts = getAllExperts()
  const builtIn = experts.find(e => e.role === id)
  if (builtIn) {
    const imConfig = getBuiltInAgentIMConfig(builtIn.role)
    return {
      id: builtIn.role,
      name: builtIn.config.name,
      nameEn: builtIn.config.nameEn,
      icon: builtIn.config.emoji,
      systemPromptSuffix: builtIn.config.suffix,
      temperature: builtIn.config.temperature,
      skills: BUILTIN_AGENT_SKILLS[builtIn.role] || [],
      isCustom: false,
      avatarStyle: 'default',
      color: '#00d4aa',
      botToken: imConfig.botToken || undefined,
      platformConfig: imConfig.botToken ? {
        defaultPlatform: imConfig.platform,
        targets: imConfig.targetId ? [{ platform: imConfig.platform, targetId: imConfig.targetId, enabled: true }] : [],
      } : undefined,
    }
  }
  // 再查自定义
  try {
    const rows = await query<CustomAgentRow>('SELECT * FROM custom_agents WHERE id = ?', [id])
    if (rows[0]) {
      const row = rows[0]
      return {
        id: row.id,
        name: row.name,
        nameEn: row.name_en || row.name,
        icon: row.icon,
        systemPromptSuffix: row.system_prompt,
        temperature: row.temperature,
        skills: JSON.parse(row.skills || '[]'),
        isCustom: true,
        avatarStyle: (row.avatar_style === 'hermes' ? 'hermes' : 'default') as 'default' | 'hermes',
        color: row.color || '#00d4aa',
        botToken: row.bot_token || '',
        platformConfig: JSON.parse(row.platform_config_json || '{}'),
      }
    }
  } catch { /* ignore */ }
  return undefined
}

/** 创建自定义 Agent */
export async function createCustomAgent(agent: Omit<AgentDefinition, 'id' | 'isCustom'>): Promise<string> {
  const id = 'agent_' + generateId()
  const token = agent.botToken || ''
  await run(
    `INSERT INTO custom_agents (id, name, name_en, icon, avatar_style, system_prompt, system_prompt_en, temperature, personality, skills, color, bot_token, platform_config_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, agent.name, agent.nameEn, agent.icon, agent.avatarStyle,
     agent.systemPromptSuffix, '', agent.temperature, '', JSON.stringify(agent.skills), agent.color,
     token, JSON.stringify(agent.platformConfig || {})]
  )
  return id
}

/** 更新自定义 Agent */
export async function updateCustomAgent(id: string, updates: Partial<Pick<AgentDefinition, 'name' | 'nameEn' | 'icon' | 'systemPromptSuffix' | 'temperature' | 'skills' | 'color' | 'avatarStyle' | 'botToken' | 'platformConfig'>>): Promise<void> {
  const sets: string[] = []
  const values: unknown[] = []
  if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name) }
  if (updates.nameEn !== undefined) { sets.push('name_en = ?'); values.push(updates.nameEn) }
  if (updates.icon !== undefined) { sets.push('icon = ?'); values.push(updates.icon) }
  if (updates.avatarStyle !== undefined) { sets.push('avatar_style = ?'); values.push(updates.avatarStyle) }
  if (updates.systemPromptSuffix !== undefined) { sets.push('system_prompt = ?'); values.push(updates.systemPromptSuffix) }
  if (updates.temperature !== undefined) { sets.push('temperature = ?'); values.push(updates.temperature) }
  if (updates.skills !== undefined) { sets.push('skills = ?'); values.push(JSON.stringify(updates.skills)) }
  if (updates.color !== undefined) { sets.push('color = ?'); values.push(updates.color) }
  if (updates.botToken !== undefined) { sets.push('bot_token = ?'); values.push(updates.botToken) }
  if (updates.platformConfig !== undefined) { sets.push('platform_config_json = ?'); values.push(JSON.stringify(updates.platformConfig)) }

  if (sets.length === 0) return
  values.push(id)
  await run(`UPDATE custom_agents SET ${sets.join(', ')}, updated_at = datetime('now','localtime') WHERE id = ?`, values)
}

/** 删除自定义 Agent */
export async function deleteCustomAgent(id: string): Promise<void> {
  await run('DELETE FROM custom_agents WHERE id = ?', [id])
}
