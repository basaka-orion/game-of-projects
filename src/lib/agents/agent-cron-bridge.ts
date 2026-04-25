/**
 * Agent-Cron 桥接 — 用 Agent Soul 渲染 cron 结果
 *
 * 将 cron 任务的原始输出，通过 Agent 的 Soul（identity/tone/principles）
 * 渲染为带有角色个性的消息，然后推送到配置的平台。
 */
import { query, run } from '../db/repository'

export interface AgentCronBinding {
  taskId: string
  agentId: string
  platforms: PlatformNotification[]
}

export interface PlatformNotification {
  platform: 'telegram' | 'discord' | 'slack'
  targetId: string
  template: string
  enabled: boolean
}

const SOUL_RENDER_PROMPT = `你是一个消息渲染器。用下方提供的角色身份，将原始任务结果改写为带有该角色风格的消息。

角色身份: {identity}
角色语调: {tone}

原始任务结果:
{rawResult}

要求:
- 保持角色的一贯语调和说话方式
- 保留所有关键信息和数据
- 使用该角色习惯的表达方式
- 控制在 500 字以内
- 用中文`

/**
 * 用 Agent Soul 渲染 cron 任务结果
 */
export async function renderCronResultWithSoul(
  agentId: string,
  taskName: string,
  rawResult: string
): Promise<string> {
  // 加载 Agent 的 soul
  let identity = ''
  let tone = ''

  try {
    const soulRows = await query<{ soul_json: string }>(
      'SELECT soul_json FROM agent_souls WHERE agent_id = ? UNION ALL SELECT soul_json FROM custom_agents WHERE id = ? AND soul_json != "" LIMIT 1',
      [agentId, agentId]
    )
    if (soulRows[0]?.soul_json) {
      const soul = JSON.parse(soulRows[0].soul_json)
      identity = soul.identity || ''
      tone = soul.tone || ''
    }
  } catch { /* ignore */ }

  // 如果没有 Soul，直接返回原始结果
  if (!identity && !tone) {
    return `⏰ **${taskName}**\n\n${rawResult.slice(0, 500)}`
  }

  // 加载 Agent 名称
  const agentRows = await query<{ name: string }>(
    "SELECT name FROM custom_agents WHERE id = ? UNION SELECT name_en FROM (SELECT 'general' as id, 'General' as name_en) WHERE id = ? LIMIT 1",
    [agentId, agentId]
  )
  const agentName = agentRows[0]?.name || agentId

  // 简单模板渲染（不用 LLM，直接拼装）
  const prefix = `${agentName} · ${taskName}`
  const result = rawResult.slice(0, 500)
  return `🎭 **${prefix}**\n\n${result}`
}

/**
 * 获取任务的 Agent 绑定配置
 */
export async function getTaskAgentBinding(taskId: string): Promise<AgentCronBinding | null> {
  try {
    const rows = await query<{ agent_id: string; platform_config_json: string }>(
      'SELECT agent_id, platform_config_json FROM scheduled_tasks WHERE id = ?',
      [taskId]
    )
    if (!rows[0] || !rows[0].agent_id) return null

    const platforms: PlatformNotification[] = JSON.parse(rows[0].platform_config_json || '[]')
    return {
      taskId,
      agentId: rows[0].agent_id,
      platforms: Array.isArray(platforms) ? platforms : [],
    }
  } catch {
    return null
  }
}

/**
 * 执行 cron 结果的 Agent 渲染 + 平台推送
 */
export async function executeCronWithAgent(
  taskId: string,
  taskName: string,
  rawResult: string
): Promise<void> {
  const binding = await getTaskAgentBinding(taskId)
  if (!binding) return

  // 用 Agent Soul 渲染
  const rendered = await renderCronResultWithSoul(binding.agentId, taskName, rawResult)

  // 推送到配置的平台
  for (const platform of binding.platforms) {
    if (!platform.enabled) continue
    try {
      const { sendPlatformNotification } = await import('../platforms/platform-notifier')
      await sendPlatformNotification(platform.platform, platform.targetId, {
        content: rendered,
        agentName: binding.agentId,
        taskName,
        priority: 'normal',
        agentId: binding.agentId,
      })
    } catch { /* non-critical */ }
  }
}
