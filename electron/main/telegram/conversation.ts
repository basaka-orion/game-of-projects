import { query, run } from '../database'

export type TelegramConversationRole = 'user' | 'assistant' | 'system'
export type TelegramConversationSource = 'telegram' | 'cron' | 'command' | 'openbasaka' | 'codex'

export interface TelegramConversationMessage {
  role: TelegramConversationRole
  content: string
  createdAt: string
  source: TelegramConversationSource
  surface?: string
  originConversationId?: string
}

const MAX_STORED_MESSAGES = 40
const MAX_SHARED_AGENT_MESSAGES = 160
const MAX_MESSAGE_CHARS = 3600
const MAX_SHARED_MESSAGE_CHARS = 6000

export function normalizeTelegramAgentId(agentId?: string): string {
  if (!agentId || agentId === '__global__') return 'general'
  return agentId
}

export function getTelegramConversationId(chatId: number | string, agentId?: string): string {
  const safeAgentId = normalizeTelegramAgentId(agentId).replace(/[^a-zA-Z0-9_-]/g, '_')
  const safeChatId = String(chatId).replace(/[^a-zA-Z0-9_@-]/g, '_')
  return `telegram_${safeAgentId}_${safeChatId}`
}

function getSharedAgentConversationId(agentId?: string): string {
  const safeAgentId = normalizeTelegramAgentId(agentId).replace(/[^a-zA-Z0-9_-]/g, '_')
  return `agent_shared_${safeAgentId}`
}

function getSharedAgentContextType(agentId?: string): string {
  return `agent-shared:${normalizeTelegramAgentId(agentId)}`
}

function appendSharedAgentConversationMessage(params: {
  agentId?: string
  role: TelegramConversationRole
  content: string
  source: TelegramConversationSource
  surface?: string
  originConversationId?: string
}): void {
  const trimmed = params.content.trim()
  if (!trimmed) return

  const normalizedAgentId = normalizeTelegramAgentId(params.agentId)
  const conversationId = getSharedAgentConversationId(normalizedAgentId)
  const createdAt = new Date().toLocaleString('zh-CN')
  const timestamp = Date.now()
  const nextMessage = {
    id: `${params.source}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    role: params.role,
    content: trimmed.slice(0, MAX_SHARED_MESSAGE_CHARS),
    timestamp,
    createdAt,
    source: params.source,
    surface: params.surface || params.source,
    originConversationId: params.originConversationId,
  }

  try {
    const rows = query('SELECT messages_json, created_at FROM conversations WHERE id = ?', [conversationId]) as Array<{
      messages_json: string
      created_at: string
    }>
    const previous = JSON.parse(rows[0]?.messages_json || '[]') as unknown[]
    const messages = (Array.isArray(previous) ? previous : []).concat(nextMessage).slice(-MAX_SHARED_AGENT_MESSAGES)
    const preservedCreatedAt = rows[0]?.created_at || null

    run(
      `INSERT OR REPLACE INTO conversations
       (id, title, messages_json, context_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, COALESCE(?, datetime('now','localtime')), datetime('now','localtime'))`,
      [
        conversationId,
        `Agent Sync｜${normalizedAgentId}`,
        JSON.stringify(messages),
        getSharedAgentContextType(normalizedAgentId),
        preservedCreatedAt,
      ],
    )
  } catch (err) {
    console.warn('[Telegram] failed to persist shared agent conversation:', err)
  }
}

export function loadTelegramConversation(
  chatId: number | string,
  agentId?: string,
  limit = 12,
): TelegramConversationMessage[] {
  try {
    const conversationId = getTelegramConversationId(chatId, agentId)
    const rows = query('SELECT messages_json FROM conversations WHERE id = ?', [conversationId]) as Array<{
      messages_json: string
    }>
    const parsed = JSON.parse(rows[0]?.messages_json || '[]') as TelegramConversationMessage[]
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(
        (message) =>
          message &&
          (message.role === 'user' || message.role === 'assistant' || message.role === 'system') &&
          typeof message.content === 'string' &&
          message.content.trim().length > 0,
      )
      .slice(-limit)
  } catch {
    return []
  }
}

function appendTelegramConversationMessageInternal(
  chatId: number | string,
  agentId: string | undefined,
  role: TelegramConversationRole,
  content: string,
  source: TelegramConversationSource = 'telegram',
  mirrorToSharedAgent = true,
): void {
  const trimmed = content.trim()
  if (!trimmed) return

  const conversationId = getTelegramConversationId(chatId, agentId)
  const normalizedAgentId = normalizeTelegramAgentId(agentId)
  const createdAt = new Date().toLocaleString('zh-CN')
  const nextMessage: TelegramConversationMessage = {
    role,
    content: trimmed.slice(0, MAX_MESSAGE_CHARS),
    createdAt,
    source,
  }

  try {
    const rows = query('SELECT messages_json, created_at FROM conversations WHERE id = ?', [conversationId]) as Array<{
      messages_json: string
      created_at: string
    }>
    const previous = JSON.parse(rows[0]?.messages_json || '[]') as TelegramConversationMessage[]
    const messages = (Array.isArray(previous) ? previous : []).concat(nextMessage).slice(-MAX_STORED_MESSAGES)
    const preservedCreatedAt = rows[0]?.created_at || null

    run(
      `INSERT OR REPLACE INTO conversations
       (id, title, messages_json, context_type, created_at, updated_at)
       VALUES (?, ?, ?, 'telegram', COALESCE(?, datetime('now','localtime')), datetime('now','localtime'))`,
      [
        conversationId,
        `Telegram｜${normalizedAgentId}｜${chatId}`,
        JSON.stringify(messages),
        preservedCreatedAt,
      ],
    )
    if (mirrorToSharedAgent) {
      appendSharedAgentConversationMessage({
        agentId: normalizedAgentId,
        role,
        content: trimmed,
        source,
        surface: 'telegram',
        originConversationId: conversationId,
      })
    }
  } catch (err) {
    console.warn('[Telegram] failed to persist conversation context:', err)
  }
}

export function appendTelegramConversationMessage(
  chatId: number | string,
  agentId: string | undefined,
  role: TelegramConversationRole,
  content: string,
  source: TelegramConversationSource = 'telegram',
): void {
  appendTelegramConversationMessageInternal(chatId, agentId, role, content, source, true)
}

export function appendTelegramConversationOnlyMessage(
  chatId: number | string,
  agentId: string | undefined,
  role: TelegramConversationRole,
  content: string,
  source: TelegramConversationSource = 'telegram',
): void {
  appendTelegramConversationMessageInternal(chatId, agentId, role, content, source, false)
}

export function loadSharedAgentConversation(agentId?: string, limit = 16): TelegramConversationMessage[] {
  try {
    const conversationId = getSharedAgentConversationId(agentId)
    const rows = query('SELECT messages_json FROM conversations WHERE id = ?', [conversationId]) as Array<{
      messages_json: string
    }>
    const parsed = JSON.parse(rows[0]?.messages_json || '[]') as Array<Record<string, unknown>>
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(
        (message) =>
          message &&
          (message.role === 'user' || message.role === 'assistant' || message.role === 'system') &&
          typeof message.content === 'string' &&
          message.content.trim().length > 0,
      )
      .map((message) => {
        const source: TelegramConversationSource =
          message.source === 'telegram' ||
          message.source === 'cron' ||
          message.source === 'command' ||
          message.source === 'openbasaka' ||
          message.source === 'codex'
            ? message.source
            : 'openbasaka'
        return {
          role: message.role as TelegramConversationRole,
          content: String(message.content),
          createdAt: typeof message.createdAt === 'string' ? message.createdAt : '',
          source,
          surface: typeof message.surface === 'string' ? message.surface : undefined,
          originConversationId: typeof message.originConversationId === 'string' ? message.originConversationId : undefined,
        }
      })
      .slice(-limit)
  } catch {
    return []
  }
}

export function formatSharedAgentRecentContext(agentId?: string, limit = 16): string {
  const messages = loadSharedAgentConversation(agentId, limit)
  if (messages.length === 0) return ''

  const agentLabel = normalizeTelegramAgentId(agentId)
  return messages
    .map((message) => {
      const speaker = message.role === 'user' ? 'Boss' : message.role === 'assistant' ? agentLabel : 'System'
      return `- ${speaker} @ ${message.source}（${message.createdAt || '未知时间'}）：${compactForPrompt(message.content)}`
    })
    .join('\n')
}

export function answerSharedAgentRecallQuestion(agentId: string | undefined, text: string): string | null {
  const normalizedText = text.replace(/\s+/g, ' ').trim()
  if (!normalizedText) return null

  const asksSyncCode = /同步暗号|SYNC-[A-Z0-9_-]+|Telegram.*暗号|记录.*暗号/i.test(normalizedText)
  const asksPrivateCode = /专属暗号|BASAKA.*暗号|暗号是什么/i.test(normalizedText)
  const asksRecentProject =
    /(刚刚|刚才|之前|上次|最近|上一?次)/.test(normalizedText) && /(项目|app|App|APP|做了|推进|主题)/.test(normalizedText)

  if (!asksSyncCode && !asksPrivateCode && !asksRecentProject) return null

  const recent = loadSharedAgentConversation(agentId, 80).slice().reverse()
  const userMessages = recent.filter((message) => message.role === 'user')

  if (asksSyncCode) {
    const syncRecord = findLatestSyncRecord(userMessages)
    if (syncRecord) return `${syncRecord.code}：${syncRecord.topic}`
  }

  if (asksPrivateCode) {
    const privateCode = findLatestPrivateCode(userMessages)
    if (privateCode) return privateCode
  }

  if (asksRecentProject) {
    const topic = findLatestProjectTopic(recent)
    if (topic) return topic
  }

  return null
}

export function formatTelegramRecentContext(messages: TelegramConversationMessage[]): string {
  const usefulMessages = messages.filter((message) => message.content.trim()).slice(-10)
  if (usefulMessages.length === 0) return ''

  return usefulMessages
    .map((message) => {
      const speaker =
        message.role === 'user'
          ? message.source === 'openbasaka'
            ? 'Boss@Openbasaka'
            : 'Boss@Telegram'
          : message.source === 'openbasaka'
            ? 'Agent@Openbasaka'
            : message.source === 'cron'
            ? 'BASAKA 定时任务推送'
            : message.source === 'command'
              ? 'BASAKA 命令结果'
              : 'BASAKA'
      return `- ${speaker}（${message.createdAt}）：${compactForPrompt(message.content)}`
    })
    .join('\n')
}

function compactForPrompt(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, 900)
}

function findLatestSyncRecord(messages: TelegramConversationMessage[]): { code: string; topic: string } | null {
  for (const message of messages) {
    const content = message.content.replace(/\s+/g, ' ').trim()
    const explicit = content.match(/\b(SYNC-[A-Z0-9_-]+)\b\s*[：:]\s*([^。；;\n]{2,160})/i)
    if (explicit) {
      return { code: explicit[1], topic: cleanProjectTopic(explicit[2]) }
    }
  }
  return null
}

function findLatestPrivateCode(messages: TelegramConversationMessage[]): string | null {
  for (const message of messages) {
    const content = message.content.replace(/\s+/g, ' ').trim()
    const explicit = content.match(/专属暗号\s*[：:]\s*([A-Z0-9_-]{4,})/i)
    if (explicit) return explicit[1]
  }
  return null
}

function findLatestProjectTopic(messages: TelegramConversationMessage[]): string | null {
  for (const message of messages) {
    const content = message.content.replace(/\s+/g, ' ').trim()
    const codexRecord = content.match(/Codex 工作记录[：:][^。]*刚刚推进的是(?:一个)?([^。；;\n]{4,180})/i)
    if (codexRecord) return cleanProjectTopic(codexRecord[1])

    const syncRecord = content.match(/\bSYNC-[A-Z0-9_-]+\b\s*[：:]\s*([^。；;\n]{4,180})/i)
    if (syncRecord) return cleanProjectTopic(syncRecord[1])
  }
  return null
}

function cleanProjectTopic(value: string): string {
  return value
    .replace(/^刚刚推进的是(?:一个)?/, '')
    .replace(/^我们刚刚推进的是(?:一个)?/, '')
    .replace(/^基于“?/, '基于')
    .replace(/”$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}
