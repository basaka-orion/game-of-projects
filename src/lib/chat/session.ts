/**
 * 对话会话管理 — 自动保存 / 加载 / 列表
 *
 * 当前规则：
 * - Openbasaka 会话只做 verbatim 持久化
 * - 《启蒙》归档必须走显式点击标签，不允许后台自动入宫
 * - 其他上下文可继续沿用既有的会话后学习链路
 */
import { dbSaveConversation, dbLoadConversation, query, run, type ConversationRow } from '../db/repository'
import { generateId } from '../db/schema'
import { getSetting } from '../db/store'
import { LLMConfig, getDefaultConfig } from '../ai/provider'

export interface SessionMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  source?: 'openbasaka' | 'telegram' | 'cron' | 'command' | 'codex'
  surface?: string
  createdAt?: string
  originConversationId?: string
}

export interface ChatSession {
  id: string
  title: string
  messages: SessionMessage[]
  updatedAt: string
  /** 当前会话所属的 Agent 角色 */
  agentRole?: string
  contextType?: string
}

const SHARED_AGENT_CONTEXT_PREFIX = 'agent-shared:'
const MAX_SHARED_AGENT_MESSAGES = 160
const MAX_SHARED_AGENT_MESSAGE_CHARS = 6000

export function normalizeAgentRole(agentRole?: string): string {
  if (!agentRole || agentRole === '__global__') return 'general'
  return agentRole
}

function safeAgentRole(agentRole?: string): string {
  return normalizeAgentRole(agentRole).replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function getSharedAgentConversationId(agentRole?: string): string {
  return `agent_shared_${safeAgentRole(agentRole)}`
}

function getSharedAgentContextType(agentRole?: string): string {
  return `${SHARED_AGENT_CONTEXT_PREFIX}${normalizeAgentRole(agentRole)}`
}

function isSharedAgentSession(session: Pick<ChatSession, 'id' | 'agentRole' | 'contextType'>): boolean {
  return (
    session.contextType?.startsWith(SHARED_AGENT_CONTEXT_PREFIX) ||
    session.id === getSharedAgentConversationId(session.agentRole)
  )
}

function getSharedAgentTitle(agentRole?: string): string {
  return `Agent Sync｜${normalizeAgentRole(agentRole)}`
}

function normalizeLoadedMessages(raw: unknown, fallbackSource: SessionMessage['source'] = 'openbasaka'): SessionMessage[] {
  const list = Array.isArray(raw) ? raw : []
  return list
    .map((item, index): SessionMessage | null => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      const role = row.role === 'user' || row.role === 'assistant' || row.role === 'system' ? row.role : null
      const content = typeof row.content === 'string' ? row.content.trim() : ''
      if (!role || !content) return null

      const createdAt = typeof row.createdAt === 'string' ? row.createdAt : ''
      const rawTimestamp = typeof row.timestamp === 'number' ? row.timestamp : Number(row.timestamp)
      const parsedTimestamp = Number.isFinite(rawTimestamp) && rawTimestamp > 0 ? rawTimestamp : Date.parse(createdAt)
      const timestamp = Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now() + index
      const source =
        row.source === 'telegram' ||
        row.source === 'cron' ||
        row.source === 'command' ||
        row.source === 'codex' ||
        row.source === 'openbasaka'
          ? row.source
          : fallbackSource

      return {
        id: typeof row.id === 'string' && row.id ? row.id : `${source}-${timestamp}-${index}`,
        role,
        content: content.slice(0, MAX_SHARED_AGENT_MESSAGE_CHARS),
        timestamp,
        source,
        surface: typeof row.surface === 'string' ? row.surface : source,
        createdAt: createdAt || new Date(timestamp).toLocaleString('zh-CN'),
        originConversationId: typeof row.originConversationId === 'string' ? row.originConversationId : undefined,
      }
    })
    .filter((message): message is SessionMessage => message !== null)
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
  const normalizedAgentRole = normalizeAgentRole(session.agentRole)
  const sharedAgentSession = isSharedAgentSession(session)
  const contextType = sharedAgentSession
    ? getSharedAgentContextType(normalizedAgentRole)
    : session.agentRole
      ? `openbasaka:${normalizedAgentRole}`
      : 'openbasaka'
  const conversationId = sharedAgentSession ? getSharedAgentConversationId(normalizedAgentRole) : session.id
  const messages = session.messages.map((message) => ({
    ...message,
    source: message.source || (sharedAgentSession ? 'openbasaka' : undefined),
    surface: message.surface || (sharedAgentSession ? 'openbasaka' : undefined),
    createdAt: message.createdAt || new Date(message.timestamp || Date.now()).toLocaleString('zh-CN'),
  }))
  await dbSaveConversation(
    conversationId,
    messages,
    contextType,
    sharedAgentSession ? getSharedAgentTitle(normalizedAgentRole) : title,
  )

  // Openbasaka 会话必须经过点击归档门，不能后台自动入宫。
  if (!contextType.startsWith('openbasaka') && !contextType.startsWith(SHARED_AGENT_CONTEXT_PREFIX)) {
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
    messages = normalizeLoadedMessages(JSON.parse(row.messages_json), row.context_type === 'telegram' ? 'telegram' : 'openbasaka')
  } catch {
    messages = []
  }
  const agentRole = row.context_type?.startsWith(SHARED_AGENT_CONTEXT_PREFIX)
    ? row.context_type.slice(SHARED_AGENT_CONTEXT_PREFIX.length)
    : row.context_type?.startsWith('openbasaka:')
    ? row.context_type.slice('openbasaka:'.length)
    : undefined
  return { id: row.id, title: row.title, messages, updatedAt: row.updated_at, agentRole, contextType: row.context_type }
}

/** 列出最近会话 */
export async function listSessions(limit = 20): Promise<ChatSession[]> {
  const rows = await query<ConversationRow>(
    `SELECT * FROM conversations
     WHERE context_type LIKE 'openbasaka%' OR context_type LIKE 'agent-shared:%'
     ORDER BY updated_at DESC`,
  )
  return rows.slice(0, limit).map(row => ({
    id: row.id,
    title: row.title || '',
    messages: [],
    updatedAt: row.updated_at,
    agentRole: row.context_type?.startsWith(SHARED_AGENT_CONTEXT_PREFIX)
      ? row.context_type.slice(SHARED_AGENT_CONTEXT_PREFIX.length)
      : row.context_type?.startsWith('openbasaka:')
        ? row.context_type.slice('openbasaka:'.length)
        : undefined,
    contextType: row.context_type,
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
    messages = normalizeLoadedMessages(JSON.parse(row.messages_json), 'openbasaka')
  } catch {
    messages = []
  }
  return { id: row.id, title: row.title, messages, updatedAt: row.updated_at, agentRole, contextType }
}

async function loadLegacyAgentMessages(agentRole: string, limit: number): Promise<SessionMessage[]> {
  const normalizedAgentRole = normalizeAgentRole(agentRole)
  const telegramLike = `telegram_${safeAgentRole(normalizedAgentRole)}_%`
  const rows = await query<ConversationRow>(
    `SELECT * FROM conversations
     WHERE context_type = ?
        OR (? = 'general' AND context_type = 'openbasaka')
        OR (context_type = 'telegram' AND id LIKE ?)
     ORDER BY updated_at DESC
     LIMIT 8`,
    [`openbasaka:${normalizedAgentRole}`, normalizedAgentRole, telegramLike],
  )

  return rows
    .flatMap((row) => {
      try {
        const fallbackSource: SessionMessage['source'] = row.context_type === 'telegram' ? 'telegram' : 'openbasaka'
        return normalizeLoadedMessages(JSON.parse(row.messages_json), fallbackSource).map((message) => ({
          ...message,
          originConversationId: message.originConversationId || row.id,
          surface: message.surface || fallbackSource,
        }))
      } catch {
        return []
      }
    })
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-limit)
}

/** 加载同一 Agent 的跨入口共享对话 */
export async function loadSharedAgentSession(agentRole = 'general', limit = 80): Promise<ChatSession | null> {
  const normalizedAgentRole = normalizeAgentRole(agentRole)
  const conversationId = getSharedAgentConversationId(normalizedAgentRole)
  const contextType = getSharedAgentContextType(normalizedAgentRole)
  const rows = await query<ConversationRow>('SELECT * FROM conversations WHERE id = ?', [conversationId])

  if (rows[0]) {
    let messages: SessionMessage[] = []
    try {
      messages = normalizeLoadedMessages(JSON.parse(rows[0].messages_json), 'openbasaka').slice(-limit)
    } catch {
      messages = []
    }
    return {
      id: conversationId,
      title: rows[0].title || getSharedAgentTitle(normalizedAgentRole),
      messages,
      updatedAt: rows[0].updated_at,
      agentRole: normalizedAgentRole,
      contextType,
    }
  }

  const legacyMessages = await loadLegacyAgentMessages(normalizedAgentRole, limit)
  if (legacyMessages.length === 0) return null

  const session: ChatSession = {
    id: conversationId,
    title: getSharedAgentTitle(normalizedAgentRole),
    messages: legacyMessages,
    updatedAt: new Date().toISOString(),
    agentRole: normalizedAgentRole,
    contextType,
  }
  await saveSession(session)
  return session
}

export async function appendSharedAgentConversationMessage(params: {
  agentRole?: string
  role: SessionMessage['role']
  content: string
  source?: SessionMessage['source']
  surface?: string
  originConversationId?: string
}): Promise<void> {
  const normalizedAgentRole = normalizeAgentRole(params.agentRole)
  const trimmed = params.content.trim()
  if (!trimmed) return

  const existing = await loadSharedAgentSession(normalizedAgentRole, MAX_SHARED_AGENT_MESSAGES)
  const timestamp = Date.now()
  const message: SessionMessage = {
    id: `${params.source || 'openbasaka'}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    role: params.role,
    content: trimmed.slice(0, MAX_SHARED_AGENT_MESSAGE_CHARS),
    timestamp,
    source: params.source || 'openbasaka',
    surface: params.surface || params.source || 'openbasaka',
    createdAt: new Date(timestamp).toLocaleString('zh-CN'),
    originConversationId: params.originConversationId,
  }

  await saveSession({
    id: getSharedAgentConversationId(normalizedAgentRole),
    title: getSharedAgentTitle(normalizedAgentRole),
    messages: [...(existing?.messages || []), message].slice(-MAX_SHARED_AGENT_MESSAGES),
    updatedAt: new Date().toISOString(),
    agentRole: normalizedAgentRole,
    contextType: getSharedAgentContextType(normalizedAgentRole),
  })
}

export async function formatSharedAgentRecentContext(agentRole = 'general', limit = 16): Promise<string> {
  const session = await loadSharedAgentSession(agentRole, limit)
  const messages = (session?.messages || []).slice(-limit)
  if (messages.length === 0) return ''

  return messages
    .map((message) => {
      const source = message.source || 'openbasaka'
      const speaker = message.role === 'user' ? 'Boss' : message.role === 'assistant' ? normalizeAgentRole(agentRole) : 'System'
      return `- ${speaker} @ ${source}（${message.createdAt || new Date(message.timestamp).toLocaleString('zh-CN')}）：${message.content.replace(/\s+/g, ' ').slice(0, 900)}`
    })
    .join('\n')
}

/** 列出指定 Agent 的会话 */
export async function listSessionsByAgent(agentRole: string, limit = 20): Promise<ChatSession[]> {
  const normalizedAgentRole = normalizeAgentRole(agentRole)
  const rows = await query<ConversationRow>(
    `SELECT * FROM conversations
     WHERE context_type IN (?, ?)
     ORDER BY CASE WHEN context_type = ? THEN 0 ELSE 1 END, updated_at DESC
     LIMIT ?`,
    [
      getSharedAgentContextType(normalizedAgentRole),
      `openbasaka:${normalizedAgentRole}`,
      getSharedAgentContextType(normalizedAgentRole),
      limit,
    ],
  )
  return rows.map(row => ({
    id: row.id,
    title: row.title || '',
    messages: [],
    updatedAt: row.updated_at,
    agentRole: normalizedAgentRole,
    contextType: row.context_type,
  }))
}

/** 从消息中提取标题 */
function extractTitle(messages: SessionMessage[]): string {
  const first = messages.find(m => m.role === 'user')
  if (!first) return '新对话'
  const text = first.content.slice(0, 40)
  return text.length < first.content.length ? text + '…' : text
}
