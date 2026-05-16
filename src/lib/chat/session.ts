/**
 * 对话会话管理 — 自动保存 / 加载 / 列表
 *
 * 当前规则：
 * - Openbasaka 会话只做 verbatim 持久化
 * - 《启蒙》归档必须走显式点击标签，不允许后台自动入宫
 * - 其他上下文可继续沿用既有的会话后学习链路
 */
import { dbSaveConversation, dbLoadConversation, dbListConversations, query, run } from '../db/repository'
import { generateId } from '../db/schema'
import { getSetting } from '../db/store'
import { LLMConfig, getDefaultConfig } from '../ai/provider'

export interface SessionMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface ChatSession {
  id: string
  title: string
  messages: SessionMessage[]
  updatedAt: string
  /** 当前会话所属的 Agent 角色 */
  agentRole?: string
}

/** 创建新会话 */
export function createSession(agentRole?: string): ChatSession {
  return {
    id: generateId(),
    title: '',
    messages: [],
    updatedAt: new Date().toISOString(),
    agentRole,
  }
}

/** 保存会话到 SQLite */
export async function saveSession(session: ChatSession): Promise<void> {
  const title = session.title || extractTitle(session.messages)
  const contextType = session.agentRole
    ? `openbasaka:${session.agentRole}`
    : 'openbasaka'
  await dbSaveConversation(
    session.id,
    session.messages,
    contextType,
    title,
  )

  // Openbasaka 会话必须经过点击归档门，不能后台自动入宫。
  if (!contextType.startsWith('openbasaka')) {
    triggerPostSessionLearning(session)
  }

  // ─── Boss 不朽记忆：会话后快照 ───
  try {
    const { createSnapshot } = await import('../boss/immortal-memory')
    await createSnapshot('session_save')
  } catch { /* non-critical */ }
}

/** 会话后异步学习（不阻塞保存操作） */
async function triggerPostSessionLearning(session: ChatSession): Promise<void> {
  const messages = session.messages
  if (messages.length < 4) return

  try {
    // 1. Self-Nudge: 从对话中提取值得记忆的知识
    const { selfNudgeFromConversation } = await import('../memory/self-nudge')
    const provider = getSetting('llm_provider', 'deepseek')
    const defaults = getDefaultConfig(provider)
    const llmConfig: LLMConfig = {
      provider: provider as LLMConfig['provider'],
      apiKey: getSetting('llm_api_key', ''),
      baseUrl: getSetting('llm_base_url', defaults.baseUrl),
      model: getSetting('llm_model', defaults.model),
    }
    await selfNudgeFromConversation(llmConfig, messages)

    // 2. Skill Evolution: 从经验中提取可复用技能模式
    const { createSkillFromExperience } = await import('../skills/evolution')
    const summary = messages.slice(-10).map(m => m.content.slice(0, 200)).join('\n')
    await createSkillFromExperience(summary, session.agentRole || 'general')

    // 3. Knowledge Graph: 从对话中提取知识三元组
    const { extractTriplesFromText } = await import('../memory/knowledge-graph')
    const conversationText = messages
      .filter(m => m.role === 'assistant')
      .slice(-5)
      .map(m => m.content.slice(0, 500))
      .join('\n')
    if (conversationText.length > 50) {
      await extractTriplesFromText(conversationText)
    }

    // 4. Convo Miner: 全面挖掘对话（实体、关系、决策、技术细节）
    const { mineConversation } = await import('../memory/convo-miner')
    await mineConversation(
      messages.map(m => ({ role: m.role, content: m.content })),
      { agentId: session.agentRole || 'general' }
    ).catch(() => { /* non-critical */ })

    // 5. Trajectory Compression: 长对话自动压缩
    if (messages.length >= 80) {
      const { compressTrajectory } = await import('./trajectory-compressor')
      const chatMessages = messages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system' | 'tool',
        content: m.content,
      }))
      await compressTrajectory(chatMessages, llmConfig).catch(() => { /* non-critical */ })
    }
  } catch {
    // 学习失败不影响会话保存
  }
}

/** 加载会话 */
export async function loadSession(id: string): Promise<ChatSession | null> {
  const rows = await query<{ id: string; title: string; messages_json: string; updated_at: string; context_type: string }>(
    'SELECT id, title, messages_json, updated_at, context_type FROM conversations WHERE id = ?',
    [id]
  )
  if (!rows[0]) return null
  const row = rows[0]
  let messages: SessionMessage[]
  try {
    messages = JSON.parse(row.messages_json)
  } catch {
    messages = []
  }
  const agentRole = row.context_type?.startsWith('openbasaka:')
    ? row.context_type.slice('openbasaka:'.length)
    : undefined
  return { id: row.id, title: row.title, messages, updatedAt: row.updated_at, agentRole }
}

/** 列出最近会话 */
export async function listSessions(limit = 20): Promise<ChatSession[]> {
  const rows = await dbListConversations()
  return rows.slice(0, limit).map(row => ({
    id: row.id,
    title: row.title || '',
    messages: [],
    updatedAt: row.updated_at,
  }))
}

/** 删除会话 */
export async function deleteSession(id: string): Promise<void> {
  await run('DELETE FROM conversations WHERE id = ?', [id])
}

/** 按 Agent 角色加载最近的会话 */
export async function loadSessionByAgent(agentRole: string): Promise<ChatSession | null> {
  const contextType = `openbasaka:${agentRole}`
  const rows = await query<{ id: string; title: string; messages_json: string; updated_at: string }>(
    'SELECT id, title, messages_json, updated_at FROM conversations WHERE context_type = ? ORDER BY updated_at DESC LIMIT 1',
    [contextType]
  )
  if (!rows[0]) return null
  const row = rows[0]
  let messages: SessionMessage[]
  try {
    messages = JSON.parse(row.messages_json)
  } catch {
    messages = []
  }
  return { id: row.id, title: row.title, messages, updatedAt: row.updated_at, agentRole }
}

/** 列出指定 Agent 的会话 */
export async function listSessionsByAgent(agentRole: string, limit = 20): Promise<ChatSession[]> {
  const contextType = `openbasaka:${agentRole}`
  const rows = await query<{ id: string; title: string; updated_at: string }>(
    'SELECT id, title, updated_at FROM conversations WHERE context_type = ? ORDER BY updated_at DESC LIMIT ?',
    [contextType, limit]
  )
  return rows.map(row => ({
    id: row.id,
    title: row.title || '',
    messages: [],
    updatedAt: row.updated_at,
    agentRole,
  }))
}

/** 从消息中提取标题 */
function extractTitle(messages: SessionMessage[]): string {
  const first = messages.find(m => m.role === 'user')
  if (!first) return '新对话'
  const text = first.content.slice(0, 40)
  return text.length < first.content.length ? text + '…' : text
}
