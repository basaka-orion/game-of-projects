/**
 * Platform Notifier — 统一平台通知接口
 *
 * 支持按 Agent 维度使用专属 bot_token 发送通知，
 * 未配置专属 token 时回退到全局 token。
 */

export interface NotificationPayload {
  content: string
  agentName: string
  taskName: string
  priority: 'low' | 'normal' | 'high'
  /** Agent ID — 传入时优先使用该 Agent 的专属 bot_token */
  agentId?: string
}

/**
 * 发送平台通知
 *
 * 支持 Agent 专属配置：当 payload.agentId 存在时，
 * 优先从 custom_agents 表读取该 Agent 的 bot_token。
 */
export async function sendPlatformNotification(
  platform: 'telegram' | 'discord' | 'slack',
  targetId: string,
  payload: NotificationPayload
): Promise<boolean> {
  if (platform === 'telegram') {
    return sendTelegramNotification(targetId, payload)
  }
  // Discord / Slack — 未来扩展
  return false
}

/** Telegram 通知发送 — 支持 Agent 专属 bot_token */
async function sendTelegramNotification(
  chatId: string,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    // 动态导入（主进程环境）
    const { query } = await import('../db/repository')

    // 1. 优先使用 Agent 专属 bot_token
    let botToken: string | undefined
    if (payload.agentId) {
      const agentRows = await query<{ bot_token: string }>(
        'SELECT bot_token FROM custom_agents WHERE id = ? AND bot_token IS NOT NULL AND bot_token != ""',
        [payload.agentId]
      )
      botToken = agentRows[0]?.bot_token
    }

    // 2. 回退到全局 bot_token
    if (!botToken) {
      const tokenRows = await query<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?', ['telegram_bot_token']
      )
      botToken = tokenRows[0]?.value
    }

    if (!botToken) return false

    // 3. 发送消息
    const text = payload.content.slice(0, 4096) // Telegram 消息长度限制
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
      signal: AbortSignal.timeout(10000),
    })
    return res.ok
  } catch {
    return false
  }
}
