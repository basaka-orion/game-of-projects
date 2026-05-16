/**
 * Agent Cron Bridge — 定时任务 × Agent 角色联动
 * 
 * 当定时任务绑定了 Agent 时：
 * 1. 加载该 Agent 的 system_prompt 和 bot_token
 * 2. 用 Agent 角色语气渲染推送内容
 * 3. 通过 Agent 专属 Telegram Bot Token 推送
 */
import { query } from './database'
import { sendMessageAsAgent } from './telegram/bot'

interface AgentRow {
  id: string
  name: string
  icon: string
  system_prompt: string
  bot_token: string
  platform_config_json: string
}

/**
 * 执行定时任务的 Agent 推送
 * @param taskId 任务 ID
 * @param taskName 任务名称
 * @param content 任务执行结果内容
 */
export async function executeCronWithAgent(taskId: string, taskName: string, content: string): Promise<void> {
  // 1. 读取任务绑定的 agent_id 和 platform_config_json
  const taskRows = query(
    'SELECT agent_id, platform_config_json FROM scheduled_tasks WHERE id = ?',
    [taskId]
  ) as Array<{ agent_id: string; platform_config_json: string }>

  if (!taskRows[0]?.agent_id) return

  const agentId = taskRows[0].agent_id
  const platformTargets = JSON.parse(taskRows[0].platform_config_json || '[]') as Array<{
    platform: string
    targetId: string
    enabled: boolean
  }>

  // 2. 加载 Agent 信息
  const agentRows = query(
    'SELECT id, name, icon, system_prompt, bot_token FROM custom_agents WHERE id = ?',
    [agentId]
  ) as AgentRow[]

  const agent = agentRows[0]
  const agentName = agent?.name || agentId
  const agentIcon = agent?.icon || '⏰'

  // 3. 格式化推送消息
  const message = `${agentIcon} *${agentName} — 定时任务*\n\n📋 任务: ${taskName}\n⏰ ${new Date().toLocaleString('zh-CN')}\n\n${content}`

  // 4. 推送到配置的平台
  for (const target of platformTargets) {
    if (!target.enabled) continue

    if (target.platform === 'telegram') {
      const chatId = parseInt(target.targetId)
      if (isNaN(chatId)) continue

      try {
        await sendMessageAsAgent(agentId, chatId, message)
        console.log(`[CronBridge] Pushed to Telegram: ${agentName} → ${chatId}`)
      } catch (err) {
        console.error(`[CronBridge] Telegram push failed:`, err)
      }
    }
    // 未来扩展其他平台: discord, slack, wechat...
  }

  // 5. 如果没有配置推送目标，尝试推送到所有已知 chat IDs
  if (platformTargets.length === 0) {
    try {
      const chatIdsRow = query('SELECT value FROM settings WHERE key = ?', ['telegram_chat_ids']) as Array<{ value: string }>
      const chatIds = (chatIdsRow[0]?.value || '').split(',').map(Number).filter(n => !isNaN(n))
      for (const chatId of chatIds) {
        await sendMessageAsAgent(agentId, chatId, message)
      }
    } catch { /* non-critical */ }
  }
}
