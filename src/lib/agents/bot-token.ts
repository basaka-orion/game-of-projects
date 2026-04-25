/**
 * Bot Token 管理 — Agent 外部平台身份标识
 */
import { query, run } from '../db/repository'

export interface BotTokenInfo {
  agentId: string
  token: string
  isActive: boolean
}

/** 为 Agent 生成新的 Bot Token */
export async function generateBotToken(agentId: string): Promise<string> {
  const token = 'oba_' + agentId.slice(0, 8) + '_' + Array.from({ length: 32 }, () =>
    Math.random().toString(16).slice(2, 3)
  ).join('')
  await run('UPDATE custom_agents SET bot_token = ? WHERE id = ?', [token, agentId])
  return token
}

/** 验证 Bot Token，返回 agentId 或 null */
export async function validateBotToken(token: string): Promise<string | null> {
  if (!token || !token.startsWith('oba_')) return null
  try {
    const rows = await query<{ id: string }>(
      'SELECT id FROM custom_agents WHERE bot_token = ? LIMIT 1', [token]
    )
    return rows[0]?.id || null
  } catch {
    return null
  }
}

/** 轮换 Token（废弃旧 Token，生成新 Token） */
export async function rotateBotToken(agentId: string): Promise<string> {
  return generateBotToken(agentId)
}

/** 列出所有 Agent 的 Token 状态 */
export async function listBotTokens(): Promise<BotTokenInfo[]> {
  try {
    const rows = await query<{ id: string; bot_token: string }>(
      'SELECT id, bot_token FROM custom_agents WHERE bot_token != ""'
    )
    return rows.map(r => ({
      agentId: r.id,
      token: r.bot_token,
      isActive: true,
    }))
  } catch {
    return []
  }
}
