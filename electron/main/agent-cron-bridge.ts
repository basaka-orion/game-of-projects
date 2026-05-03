/**
 * Agent Cron Bridge — 定时任务 × Agent 角色联动
 * 
 * 当定时任务绑定了 Agent 时：
 * 1. 加载该 Agent 的 system_prompt 和 bot_token
 * 2. 用 Agent 角色语气渲染推送内容
 * 3. 通过 Agent 专属 Telegram Bot Token 推送
 */
import { query } from './database'
import { appendTelegramConversationMessage } from './telegram/conversation'

interface AgentRow {
  id: string
  name: string
  icon: string
  system_prompt: string
  bot_token: string
  platform_config_json: string
}

interface CronPushReport {
  attempted: number
  sent: number
  skipped: number
  errors: string[]
}

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot'

/**
 * 执行定时任务的 Agent 推送
 * @param taskId 任务 ID
 * @param taskName 任务名称
 * @param content 任务执行结果内容
 */
export async function executeCronWithAgent(taskId: string, taskName: string, content: string): Promise<CronPushReport> {
  const report: CronPushReport = { attempted: 0, sent: 0, skipped: 0, errors: [] }
  // 1. 读取任务绑定的 agent_id、工作流主持人和平台目标
  const taskRows = query('SELECT agent_id, task_config_json, platform_config_json FROM scheduled_tasks WHERE id = ?', [taskId]) as Array<{
    agent_id: string
    task_config_json: string
    platform_config_json: string
  }>

  if (!taskRows[0]) return report

  const taskConfig = safeParseObject(taskRows[0].task_config_json)
  const agentId =
    taskRows[0].agent_id ||
    readString(taskConfig.pushAgentId) ||
    readString(taskConfig.hostAgentId) ||
    'general'
  const platformTargets = safeParseTargets(taskRows[0].platform_config_json)

  const telegramTargets = platformTargets.filter((target) => target.enabled && target.platform === 'telegram')
  if (telegramTargets.length === 0) return report

  const chatIds = resolveTelegramChatIds(telegramTargets)
  if (chatIds.length === 0) {
    report.skipped += telegramTargets.length
    report.errors.push('no_telegram_chat_id')
    return report
  }

  const botToken = getAgentBotToken(agentId)
  if (!botToken) {
    report.skipped += chatIds.length
    report.errors.push(`missing_bot_token:${agentId}`)
    return report
  }

  // 2. 加载 Agent 信息
  const agentRows = query('SELECT id, name, icon, system_prompt, bot_token FROM custom_agents WHERE id = ?', [
    agentId,
  ]) as AgentRow[]

  const agent = agentRows[0]
  const agentName = agent?.name || getBuiltInAgentName(agentId)
  const agentIcon = agent?.icon || getBuiltInAgentIcon(agentId)

  // 3. 格式化推送消息。这里必须推真实结果，不推“已完成”空壳。
  const message = `${agentIcon} ${agentName} - 定时任务\n\n任务：${taskName}\n时间：${new Date().toLocaleString('zh-CN')}\n\n${content}`.slice(
    0,
    3900,
  )

  // 4. 推送到配置的平台。targetId 如果不是数字，会回退到已连接过的 Telegram 会话。
  for (const chatId of chatIds) {
    report.attempted += 1
    try {
      await sendTelegramMessage(botToken, chatId, message)
      appendTelegramConversationMessage(chatId, agentId, 'assistant', message, 'cron')
      report.sent += 1
      console.log(`[CronBridge] Pushed to Telegram: ${agentName} -> ${chatId}`)
    } catch (err) {
      report.errors.push(`${chatId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return report
}

function safeParseTargets(raw: string): Array<{
  platform: string
  targetId: string
  enabled: boolean
}> {
  try {
    const parsed = JSON.parse(raw || '[]') as Array<{
    platform: string
    targetId: string
    enabled: boolean
  }>
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function safeParseObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}') as Record<string, unknown>
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function resolveTelegramChatIds(targets: Array<{ targetId: string }>): string[] {
  const explicit = new Set<string>()
  let needsKnownChats = false

  for (const target of targets) {
    const value = String(target.targetId || '').trim()
    if (!value || value === 'default') {
      needsKnownChats = true
      continue
    }
    if (/^-?\d+$/.test(value) || value.startsWith('@')) {
      explicit.add(value)
      continue
    }
    needsKnownChats = true
  }

  if (explicit.size > 0 && !needsKnownChats) return Array.from(explicit)

  for (const id of getKnownTelegramChatIds()) explicit.add(id)
  return Array.from(explicit)
}

function getKnownTelegramChatIds(): string[] {
  const rows = query('SELECT value FROM settings WHERE key = ?', ['telegram_chat_ids']) as Array<{ value: string }>
  return (rows[0]?.value || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function getAgentBotToken(agentId: string): string {
  const customRows = query('SELECT bot_token FROM custom_agents WHERE id = ?', [agentId]) as Array<{ bot_token: string }>
  const customToken = customRows[0]?.bot_token?.trim()
  if (customToken) return customToken

  const builtInRows = query('SELECT value FROM settings WHERE key = ?', [`agent_${agentId}_bot_token`]) as Array<{
    value: string
  }>
  const builtInToken = builtInRows[0]?.value?.trim()
  if (builtInToken) return builtInToken

  const globalRows = query('SELECT value FROM settings WHERE key = ?', ['telegram_bot_token']) as Array<{ value: string }>
  return globalRows[0]?.value?.trim() || ''
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<void> {
  const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 160)}`)
  }
}

function getBuiltInAgentName(agentId: string): string {
  const names: Record<string, string> = {
    general: 'BASAKA',
    strategy: '战略顾问',
    technical: '技术架构师',
    market: '市场分析师',
    creative: '创意火花',
    critic: '批判性思考',
  }
  return names[agentId] || agentId
}

function getBuiltInAgentIcon(agentId: string): string {
  const icons: Record<string, string> = {
    general: 'BASAKA',
    strategy: 'STRATEGY',
    technical: 'TECH',
    market: 'MARKET',
    creative: 'CREATIVE',
    critic: 'CRITIC',
  }
  return icons[agentId] || 'AGENT'
}
