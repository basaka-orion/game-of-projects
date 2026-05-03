import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'
import { query, run } from '../database'
import { normalizeTelegramAgentId } from './conversation'

interface TelegramUserSyncStatus {
  enabled: boolean
  configured: boolean
  authorized: boolean
  phone: string
  needsCode: boolean
  error?: string
}

interface PendingLogin {
  phone: string
  client: TelegramClient
  startPromise: Promise<void>
  resolveCode: (code: string) => void
  resolvePassword: (password: string) => void
}

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot'
const MIRROR_TTL_MS = 45_000

let cachedClient: TelegramClient | null = null
let pendingLogin: PendingLogin | null = null
const pendingMirrors: Array<{ agentId: string; text: string; expiresAt: number }> = []
const botUsernameCache = new Map<string, string>()

export async function getTelegramUserSyncStatus(): Promise<TelegramUserSyncStatus> {
  const config = readUserSyncConfig()
  if (!config.apiId || !config.apiHash || !config.phone) {
    return {
      enabled: config.enabled,
      configured: false,
      authorized: false,
      phone: config.phone,
      needsCode: !!pendingLogin,
    }
  }

  if (!config.session) {
    return {
      enabled: config.enabled,
      configured: true,
      authorized: false,
      phone: config.phone,
      needsCode: !!pendingLogin,
    }
  }

  try {
    const client = await ensureTelegramUserClient()
    return {
      enabled: config.enabled,
      configured: true,
      authorized: !!client,
      phone: config.phone,
      needsCode: !!pendingLogin,
    }
  } catch (err) {
    return {
      enabled: config.enabled,
      configured: true,
      authorized: false,
      phone: config.phone,
      needsCode: !!pendingLogin,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function requestTelegramUserLoginCode(params: {
  apiId: string | number
  apiHash: string
  phone: string
  enabled?: boolean
}): Promise<TelegramUserSyncStatus> {
  const apiId = Number(params.apiId)
  const apiHash = params.apiHash.trim()
  const phone = params.phone.trim()
  if (!Number.isFinite(apiId) || !apiHash || !phone) {
    return { enabled: !!params.enabled, configured: false, authorized: false, phone, needsCode: false, error: 'missing_config' }
  }

  saveSetting('telegram_user_api_id', String(apiId))
  saveSetting('telegram_user_api_hash', apiHash)
  saveSetting('telegram_user_phone', phone)
  saveSetting('telegram_user_sync_enabled', params.enabled === false ? 'false' : 'true')

  pendingLogin = null
  cachedClient = null
  const client = new TelegramClient(new StringSession(readSetting('telegram_user_session', '')), apiId, apiHash, {
    connectionRetries: 5,
  })

  let resolveCode: (code: string) => void = () => {}
  let resolvePassword: (password: string) => void = () => {}
  const codePromise = new Promise<string>((resolve) => {
    resolveCode = resolve
  })
  const passwordPromise = new Promise<string>((resolve) => {
    resolvePassword = resolve
  })

  const startPromise = client.start({
    phoneNumber: async () => phone,
    phoneCode: async () => codePromise,
    password: async () => passwordPromise,
    onError: (err) => {
      throw err
    },
  })

  pendingLogin = { phone, client, startPromise, resolveCode, resolvePassword }
  return { enabled: params.enabled !== false, configured: true, authorized: false, phone, needsCode: true }
}

export async function confirmTelegramUserLoginCode(params: {
  code: string
  password?: string
}): Promise<TelegramUserSyncStatus> {
  if (!pendingLogin) {
    return { ...(await getTelegramUserSyncStatus()), needsCode: false, error: 'no_pending_login' }
  }

  try {
    pendingLogin.resolveCode(params.code.trim())
    pendingLogin.resolvePassword(params.password || '')
    await pendingLogin.startPromise
    const session = pendingLogin.client.session.save() as unknown
    saveSetting('telegram_user_session', typeof session === 'string' ? session : String(session || ''))
    saveSetting('telegram_user_sync_enabled', 'true')
    cachedClient = pendingLogin.client
    pendingLogin = null
    return getTelegramUserSyncStatus()
  } catch (err) {
    pendingLogin = null
    cachedClient = null
    return { ...(await getTelegramUserSyncStatus()), needsCode: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function sendOpenbasakaUserMessageAsTelegramUser(params: {
  agentId?: string
  content: string
}): Promise<{ sent: boolean; skipped: boolean; error?: string }> {
  const content = params.content.trim()
  if (!content) return { sent: false, skipped: true }

  const config = readUserSyncConfig()
  if (!config.enabled) return { sent: false, skipped: true, error: 'telegram_user_sync_disabled' }

  const agentId = normalizeTelegramAgentId(params.agentId)
  const botToken = getAgentBotToken(agentId)
  if (!botToken) return { sent: false, skipped: true, error: `missing_bot_token:${agentId}` }

  try {
    const client = await ensureTelegramUserClient()
    if (!client) return { sent: false, skipped: true, error: 'telegram_user_not_authorized' }

    const botUsername = await getBotUsername(botToken)
    if (!botUsername) return { sent: false, skipped: true, error: 'missing_bot_username' }

    markOpenbasakaMirror(agentId, content)
    await client.sendMessage(botUsername.startsWith('@') ? botUsername : `@${botUsername}`, { message: content })
    return { sent: true, skipped: false }
  } catch (err) {
    removeOpenbasakaMirror(agentId, content)
    return { sent: false, skipped: true, error: err instanceof Error ? err.message : String(err) }
  }
}

export function consumeOpenbasakaMirroredUserMessage(agentId: string | undefined, content: string): boolean {
  const normalizedAgentId = normalizeTelegramAgentId(agentId)
  const normalizedContent = normalizeMirrorText(content)
  const now = Date.now()

  for (let index = pendingMirrors.length - 1; index >= 0; index -= 1) {
    if (pendingMirrors[index].expiresAt < now) {
      pendingMirrors.splice(index, 1)
      continue
    }
    if (pendingMirrors[index].agentId === normalizedAgentId && pendingMirrors[index].text === normalizedContent) {
      pendingMirrors.splice(index, 1)
      return true
    }
  }

  return false
}

function readUserSyncConfig(): {
  enabled: boolean
  apiId: number
  apiHash: string
  phone: string
  session: string
} {
  const apiId = Number(readSetting('telegram_user_api_id', '0'))
  return {
    enabled: readSetting('telegram_user_sync_enabled', 'false') === 'true',
    apiId,
    apiHash: readSetting('telegram_user_api_hash', ''),
    phone: readSetting('telegram_user_phone', ''),
    session: readSetting('telegram_user_session', ''),
  }
}

async function ensureTelegramUserClient(): Promise<TelegramClient | null> {
  if (cachedClient?.connected) return cachedClient

  const config = readUserSyncConfig()
  if (!config.apiId || !config.apiHash || !config.session) return null

  const client = new TelegramClient(new StringSession(config.session), config.apiId, config.apiHash, {
    connectionRetries: 5,
  })
  await client.connect()
  const me = await client.getMe()
  if (!me) return null
  cachedClient = client
  return cachedClient
}

function markOpenbasakaMirror(agentId: string, content: string): void {
  pendingMirrors.push({
    agentId: normalizeTelegramAgentId(agentId),
    text: normalizeMirrorText(content),
    expiresAt: Date.now() + MIRROR_TTL_MS,
  })
}

function removeOpenbasakaMirror(agentId: string, content: string): void {
  const normalizedAgentId = normalizeTelegramAgentId(agentId)
  const normalizedContent = normalizeMirrorText(content)
  const index = pendingMirrors.findIndex((item) => item.agentId === normalizedAgentId && item.text === normalizedContent)
  if (index >= 0) pendingMirrors.splice(index, 1)
}

function normalizeMirrorText(content: string): string {
  return content.replace(/\s+/g, ' ').trim()
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

async function getBotUsername(botToken: string): Promise<string> {
  const cached = botUsernameCache.get(botToken)
  if (cached) return cached

  const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/getMe`, {
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(`bot_getme_${response.status}`)
  const data = (await response.json()) as { ok?: boolean; result?: { username?: string } }
  const username = data.result?.username || ''
  if (username) botUsernameCache.set(botToken, username)
  return username
}

function readSetting(key: string, fallback = ''): string {
  try {
    const rows = query('SELECT value FROM settings WHERE key = ?', [key]) as Array<{ value: string }>
    return rows[0]?.value || fallback
  } catch {
    return fallback
  }
}

function saveSetting(key: string, value: string): void {
  run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value])
}
