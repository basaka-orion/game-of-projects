import { query } from '../database'
import {
  appendTelegramConversationOnlyMessage,
  normalizeTelegramAgentId,
  type TelegramConversationRole,
} from './conversation'
import { sendOpenbasakaUserMessageAsTelegramUser } from './user-sync'

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot'

export interface OpenbasakaTelegramSyncPayload {
  agentId?: string
  role: TelegramConversationRole
  content: string
  messageId?: string
}

export interface OpenbasakaTelegramSyncReport {
  attempted: number
  sent: number
  skipped: number
  errors: string[]
}

export async function broadcastOpenbasakaMessageToTelegram(
  payload: OpenbasakaTelegramSyncPayload,
): Promise<OpenbasakaTelegramSyncReport> {
  const report: OpenbasakaTelegramSyncReport = { attempted: 0, sent: 0, skipped: 0, errors: [] }
  const content = payload.content.trim()
  if (!content || !isSyncableRole(payload.role)) return report

  const agentId = normalizeTelegramAgentId(payload.agentId)
  const chatIds = getKnownTelegramChatIds()
  if (chatIds.length === 0) {
    report.skipped += 1
    report.errors.push('no_telegram_chat_id')
    return report
  }

  if (payload.role === 'user') {
    for (const chatId of chatIds) {
      appendTelegramConversationOnlyMessage(chatId, agentId, payload.role, content, 'openbasaka')
    }
    const userSync = await sendOpenbasakaUserMessageAsTelegramUser({ agentId, content })
    if (userSync.sent) {
      report.attempted += 1
      report.sent += 1
    } else {
      report.skipped += 1
      if (userSync.error) report.errors.push(userSync.error)
    }
    return report
  }

  const botToken = getAgentBotToken(agentId)
  if (!botToken) {
    report.skipped += chatIds.length
    report.errors.push(`missing_bot_token:${agentId}`)
    return report
  }

  for (const chatId of chatIds) {
    report.attempted += 1
    try {
      await sendTelegramMessage(botToken, chatId, content)
      appendTelegramConversationOnlyMessage(chatId, agentId, payload.role, content, 'openbasaka')
      report.sent += 1
    } catch (err) {
      report.errors.push(`${chatId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return report
}

function isSyncableRole(role: TelegramConversationRole): boolean {
  return role === 'user' || role === 'assistant'
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
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 3900),
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 160)}`)
  }
}
