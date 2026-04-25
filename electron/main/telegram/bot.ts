/**
 * Telegram Bot — 多实例管理器
 * 为每个带 Telegram Bot Token 的 Agent 启动独立的长轮询实例
 * 支持：消息收发、Markdown 格式、命令路由
 */
import { query, run } from '../database'

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot'

interface TelegramMessage {
  message_id: number
  chat: { id: number; type: string; username?: string; first_name?: string }
  text?: string
  date: number
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

interface BotInstance {
  token: string
  agentId: string
  agentName: string
  polling: boolean
  lastUpdateId: number
}

// ─── 状态 ───

/** 全局 Bot 实例表（key = agentId） */
const botInstances = new Map<string, BotInstance>()
/** 全局回退 Bot 实例（读 settings.telegram_bot_token） */
let globalInstance: BotInstance | null = null
/** 消息处理器 */
let messageHandler: ((chatId: number, text: string, username: string, agentId: string) => Promise<void>) | null = null

// ─── 辅助 ───

/** 从 DB 读取全局 Bot Token (向后兼容) */
function getGlobalBotToken(): string | null {
  try {
    const rows = query('SELECT value FROM settings WHERE key = ?', ['telegram_bot_token']) as Array<{ value: string }>
    return rows[0]?.value || null
  } catch {
    return null
  }
}

/** 从 DB 读取允许的 Chat ID 列表 */
function getAllowedChatIds(): number[] {
  try {
    const rows = query('SELECT value FROM settings WHERE key = ?', ['telegram_chat_ids']) as Array<{ value: string }>
    if (!rows[0]?.value) return []
    return rows[0].value.split(',').map(Number).filter(n => !isNaN(n))
  } catch {
    return []
  }
}

/** 保存允许的 Chat ID */
function saveAllowedChatIds(ids: number[]): void {
  try {
    run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['telegram_chat_ids', ids.join(',')])
  } catch { /* ignore */ }
}

/** 调用 Telegram API (指定 token) */
async function callApi(token: string, method: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${TELEGRAM_API_BASE}${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(method === 'getUpdates' ? 35000 : 10000),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Telegram API Error [${res.status}]: ${errText}`)
  }

  return res.json()
}

/** 发送文本消息（Markdown 格式，使用指定 token） */
export async function sendMessage(chatId: number, text: string, parseMode: 'Markdown' | 'HTML' = 'Markdown', token?: string): Promise<void> {
  const botToken = token || globalInstance?.token
  if (!botToken) {
    console.error('[Telegram] No bot token available for sending')
    return
  }

  try {
    await callApi(botToken, 'sendMessage', {
      chat_id: chatId,
      text: text.slice(0, 4000),
      parse_mode: parseMode,
      disable_web_page_preview: true,
    })
  } catch (err) {
    console.error('[Telegram] send failed:', err)
    // 降级为纯文本重试
    try {
      await callApi(botToken, 'sendMessage', {
        chat_id: chatId,
        text: text.slice(0, 4000),
      })
    } catch { /* give up */ }
  }
}

/** 用指定 Agent 的 Bot Token 发送消息 */
export async function sendMessageAsAgent(agentId: string, chatId: number, text: string): Promise<void> {
  const instance = botInstances.get(agentId)
  if (instance) {
    await sendMessage(chatId, text, 'Markdown', instance.token)
  } else {
    // 回退到全局 token
    await sendMessage(chatId, text)
  }
}

/** 注册消息处理器 */
export function onMessage(handler: (chatId: number, text: string, username: string, agentId: string) => Promise<void>): void {
  messageHandler = handler
}

// ─── 单个 Bot 轮询循环 ───

async function pollInstance(instance: BotInstance): Promise<void> {
  if (!instance.polling) return

  try {
    const result = await callApi(instance.token, 'getUpdates', {
      offset: instance.lastUpdateId + 1,
      timeout: 30,
      limit: 10,
    }) as { ok: boolean; result: TelegramUpdate[] }

    if (result.ok && result.result) {
      for (const update of result.result) {
        instance.lastUpdateId = update.update_id

        if (update.message?.text) {
          const chatId = update.message.chat.id
          const text = update.message.text
          const username = update.message.chat.username || update.message.chat.first_name || 'unknown'

          // 自动授权
          const allowed = getAllowedChatIds()
          if (!allowed.includes(chatId)) {
            console.log(`[Telegram:${instance.agentName}] New user: ${username} (${chatId}), auto-authorizing`)
            allowed.push(chatId)
            saveAllowedChatIds(allowed)
          }

          // 路由到消息处理器，带上 agentId
          if (messageHandler) {
            messageHandler(chatId, text, username, instance.agentId).catch(err => {
              console.error(`[Telegram:${instance.agentName}] handler error:`, err)
            })
          }
        }
      }
    }
  } catch (err) {
    console.error(`[Telegram:${instance.agentName}] poll error:`, err)
  }

  // 下一轮
  if (instance.polling) {
    setTimeout(() => pollInstance(instance), 1000)
  }
}

// ─── 公开 API ───

/** 内置专家角色列表（与 src/lib/chat/router.ts 中的 EXPERTS 保持一致） */
const BUILT_IN_EXPERTS = [
  { role: 'general', name: 'BASAKA' },
  { role: 'strategy', name: '战略顾问' },
  { role: 'technical', name: '技术架构师' },
  { role: 'market', name: '市场分析师' },
  { role: 'creative', name: '创意火花' },
  { role: 'critic', name: '魔鬼代言人' },
]

/** 启动所有 Agent Bot + 全局 Bot + 内置专家 Bot */
export function startMultiBotEngine(): void {
  // 1. 全局 Bot（向后兼容 settings.telegram_bot_token）
  const globalToken = getGlobalBotToken()
  if (globalToken) {
    if (!globalInstance || !globalInstance.polling) {
      globalInstance = {
        token: globalToken,
        agentId: '__global__',
        agentName: 'Global',
        polling: true,
        lastUpdateId: 0,
      }
      // 注册到实例表
      botInstances.set('__global__', globalInstance)
      pollInstance(globalInstance)
      console.log('[Telegram] Global bot started')
    }
  }

  // 2. 各自定义 Agent Bot
  try {
    const rows = query(
      "SELECT id, name, bot_token FROM custom_agents WHERE bot_token IS NOT NULL AND bot_token != '' AND bot_token NOT LIKE 'oba_%'"
    ) as Array<{ id: string; name: string; bot_token: string }>

    for (const row of rows) {
      // 跳过已启动的
      if (botInstances.has(row.id)) continue
      // 跳过与全局相同的 token
      if (globalToken && row.bot_token === globalToken) continue

      const instance: BotInstance = {
        token: row.bot_token,
        agentId: row.id,
        agentName: row.name,
        polling: true,
        lastUpdateId: 0,
      }
      botInstances.set(row.id, instance)
      pollInstance(instance)
      console.log(`[Telegram] Agent bot started: ${row.name} (${row.id})`)
    }
  } catch (err) {
    console.error('[Telegram] Failed to load agent bots:', err)
  }

  // 3. 内置专家 Bot（从 settings 表读取 agent_{roleId}_bot_token）
  try {
    for (const expert of BUILT_IN_EXPERTS) {
      const settingKey = `agent_${expert.role}_bot_token`
      const rows = query('SELECT value FROM settings WHERE key = ?', [settingKey]) as Array<{ value: string }>
      const token = rows[0]?.value?.trim()
      if (!token) continue
      // 跳过已启动的
      if (botInstances.has(expert.role)) continue
      // 跳过 oba_ 内部 token
      if (token.startsWith('oba_')) continue
      // 跳过与全局相同的 token
      if (globalToken && token === globalToken) continue

      const instance: BotInstance = {
        token,
        agentId: expert.role,
        agentName: expert.name,
        polling: true,
        lastUpdateId: 0,
      }
      botInstances.set(expert.role, instance)
      pollInstance(instance)
      console.log(`[Telegram] Built-in expert bot started: ${expert.name} (${expert.role})`)
    }
  } catch (err) {
    console.error('[Telegram] Failed to load built-in expert bots:', err)
  }

  console.log(`[Telegram] Multi-bot engine running: ${botInstances.size} instance(s)`)
}

/** 停止所有 Bot */
export function stopMultiBotEngine(): void {
  for (const [id, instance] of botInstances) {
    instance.polling = false
    console.log(`[Telegram] Stopped bot: ${instance.agentName}`)
  }
  botInstances.clear()
  globalInstance = null
  console.log('[Telegram] All bots stopped')
}

/** 启用单个 Agent Bot（创建 Agent 后动态启动） */
export function startAgentBot(agentId: string, token: string, name: string): void {
  if (botInstances.has(agentId)) {
    console.log(`[Telegram] Bot already running for ${name}`)
    return
  }
  const instance: BotInstance = {
    token,
    agentId,
    agentName: name,
    polling: true,
    lastUpdateId: 0,
  }
  botInstances.set(agentId, instance)
  pollInstance(instance)
  console.log(`[Telegram] Dynamic start: ${name}`)
}

/** 停止单个 Agent Bot */
export function stopAgentBot(agentId: string): void {
  const instance = botInstances.get(agentId)
  if (instance) {
    instance.polling = false
    botInstances.delete(agentId)
    console.log(`[Telegram] Stopped agent bot: ${instance.agentName}`)
  }
}

/** 获取所有 Bot 状态 */
export function getAllBotStatus(): Array<{ agentId: string; name: string; running: boolean }> {
  return Array.from(botInstances.values()).map(i => ({
    agentId: i.agentId,
    name: i.agentName,
    running: i.polling,
  }))
}

/** 获取 Bot 状态 (向后兼容) */
export function getTelegramStatus(): { running: boolean; chatIds: number[]; instanceCount: number } {
  return {
    running: botInstances.size > 0,
    chatIds: getAllowedChatIds(),
    instanceCount: botInstances.size,
  }
}

// ─── 向后兼容：导出旧函数名 ───

export function startTelegramBot(): boolean {
  startMultiBotEngine()
  return botInstances.size > 0
}

export function stopTelegramBot(): void {
  stopMultiBotEngine()
}
