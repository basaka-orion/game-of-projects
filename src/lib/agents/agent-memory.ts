/**
 * Agent Memory — 记忆条目管理（MemPalace 风格增强）
 *
 * 移植自 Hermes Agent 的 MEMORY.md + MemPalace 的结构化记忆：
 * - 每个 Agent 拥有独立的记忆条目列表
 * - 条目用 § (section sign) 分隔
 * - 有容量上限（2200 chars），超限时精简
 * - 冻结快照模式：会话开始时加载快照，中途修改不实时更新 prompt
 * - 注入扫描防止 prompt injection
 * - 精确的 rowid 匹配（避免 LIKE 误匹配）
 */
import { query, run } from '../db/repository'

// ─── 接口 ───

export interface AgentMemory {
  agentId: string
  entries: MemoryEntry[]
  charLimit: number
}

export interface MemoryEntry {
  rowid: number
  text: string
  createdAt: string
}

const DEFAULT_CHAR_LIMIT = 2200

// ─── CRUD ───

/**
 * 加载 Agent 的记忆条目
 */
export async function loadAgentMemory(agentId: string): Promise<AgentMemory> {
  try {
    const rows = await query<{ rowid: number; entry: string; created_at: string }>(
      'SELECT rowid, entry, created_at FROM agent_memories WHERE agent_id = ? ORDER BY created_at ASC',
      [agentId]
    )
    return {
      agentId,
      entries: rows.map(r => ({ rowid: r.rowid, text: r.entry, createdAt: r.created_at })),
      charLimit: DEFAULT_CHAR_LIMIT,
    }
  } catch {
    return { agentId, entries: [], charLimit: DEFAULT_CHAR_LIMIT }
  }
}

/**
 * 追加记忆条目
 */
export async function addMemoryEntry(agentId: string, entry: string): Promise<void> {
  const scan = scanMemoryContent(entry)
  if (!scan.safe) {
    console.warn(`[AgentMemory] 拒绝不安全内容: ${scan.threats.join('; ')}`)
    return
  }

  const ts = new Date().toISOString().replace('T', ' ').replace('Z', '').slice(0, 23)
  await run(
    `INSERT OR REPLACE INTO agent_memories (agent_id, entry, created_at) VALUES (?, ?, ?)`,
    [agentId, entry.trim(), ts]
  )

  // 检查容量，超 80% 触发精简
  const memory = await loadAgentMemory(agentId)
  const totalChars = memory.entries.map(e => e.text).join('§').length
  if (totalChars > memory.charLimit * 0.8) {
    consolidateMemory(agentId).catch(() => {})
  }
}

/**
 * 替换记忆条目（精确 rowid 匹配）
 */
export async function replaceMemoryEntry(agentId: string, rowid: number, newText: string): Promise<void> {
  const scan = scanMemoryContent(newText)
  if (!scan.safe) return

  await run(
    `UPDATE agent_memories SET entry = ? WHERE agent_id = ? AND rowid = ?`,
    [newText.trim(), agentId, rowid]
  )
}

/**
 * 删除记忆条目（精确 rowid 匹配）
 */
export async function removeMemoryEntry(agentId: string, rowid: number): Promise<void> {
  await run(
    `DELETE FROM agent_memories WHERE agent_id = ? AND rowid = ?`,
    [agentId, rowid]
  )
}

/**
 * 精简记忆 — 保留最近的条目，删除最旧的
 */
export async function consolidateMemory(agentId: string): Promise<void> {
  const memory = await loadAgentMemory(agentId)
  const totalChars = memory.entries.map(e => e.text).join('§').length

  if (totalChars <= memory.charLimit * 0.6) return

  // 从最新的开始保留，直到容量降到 60%
  const toKeep: MemoryEntry[] = []
  let charCount = 0
  for (let i = memory.entries.length - 1; i >= 0; i--) {
    const entry = memory.entries[i]
    if (charCount + entry.text.length <= memory.charLimit * 0.6) {
      toKeep.unshift(entry)
      charCount += entry.text.length
    } else {
      break
    }
  }

  // 删除超出容量的旧条目
  const keepIds = new Set(toKeep.map(e => e.rowid))
  for (const entry of memory.entries) {
    if (!keepIds.has(entry.rowid)) {
      await removeMemoryEntry(agentId, entry.rowid)
    }
  }
}

// ─── 4-Layer Memory Stack（MemPalace 风格） ───

/**
 * L0: 身份层（~50-100 tokens，始终加载）
 * 从 Soul 中提取核心身份信息
 */
export function renderL0Identity(soulIdentity: string): string {
  const firstSentence = soulIdentity.split(/[。\n]/)[0]
  return firstSentence.length > 100 ? firstSentence.slice(0, 100) + '...' : firstSentence
}

/**
 * L1: 核心故事层（~500-800 tokens，自动生成）
 * 从 Agent Memory 中提取最重要的条目
 */
export function renderL1Essential(memory: AgentMemory, maxTokens: number = 400): string {
  if (memory.entries.length === 0) return ''

  // 按条目长度优先（信息密度高）
  const sorted = [...memory.entries].sort((a, b) => b.text.length - a.text.length)
  const selected: string[] = []
  let charCount = 0

  for (const entry of sorted) {
    if (charCount + entry.text.length > maxTokens * 2) break
    selected.push(entry.text)
    charCount += entry.text.length
  }

  return selected.join('\n§\n')
}

/**
 * L2: 按需检索层（~200-500 tokens，按关键词过滤）
 */
export function renderL2OnDemand(memory: AgentMemory, keywords: string[], maxTokens: number = 250): string {
  if (memory.entries.length === 0 || keywords.length === 0) return ''

  const lower = keywords.map(k => k.toLowerCase())
  const matched = memory.entries.filter(e =>
    lower.some(kw => e.text.toLowerCase().includes(kw))
  )

  const selected: string[] = []
  let charCount = 0
  for (const entry of matched) {
    if (charCount + entry.text.length > maxTokens * 2) break
    selected.push(entry.text)
    charCount += entry.text.length
  }

  return selected.join('\n§\n')
}

/**
 * L3: 深度搜索层（无限制，按需使用）
 * 直接返回所有匹配条目 + 知识图谱三元组 + 突触路径
 */
export function renderL3DeepSearch(memory: AgentMemory, query: string): MemoryEntry[] {
  if (!query.trim()) return memory.entries
  const lower = query.toLowerCase()
  return memory.entries.filter(e => e.text.toLowerCase().includes(lower))
}

/** L3 增强版：同时检索知识图谱三元组和突触路径 */
export async function renderL3DeepSearchEnhanced(
  memory: AgentMemory,
  searchQuery: string
): Promise<{
  memoryEntries: MemoryEntry[]
  knowledgeTriples: Array<{ subject: string; predicate: string; object: string; confidence: number }>
  synapsePaths: Array<{ from: string; to: string; path: string }>
}> {
  // 原有记忆搜索
  const lower = searchQuery.toLowerCase()
  const memoryEntries = memory.entries.filter(e => e.text.toLowerCase().includes(lower))

  const knowledgeTriples: Array<{ subject: string; predicate: string; object: string; confidence: number }> = []
  const synapsePaths: Array<{ from: string; to: string; path: string }> = []

  try {
    const { queryEntity } = await import('../memory/knowledge-graph')
    const triples = await queryEntity(searchQuery)
    for (const t of triples.slice(0, 10)) {
      knowledgeTriples.push({
        subject: t.subject,
        predicate: t.predicate,
        object: t.object,
        confidence: t.confidence,
      })
    }
  } catch { /* knowledge graph unavailable */ }

  // 如果查询包含多个词，尝试找路径
  try {
    const words = searchQuery.split(/\s+/).filter(w => w.length > 1)
    if (words.length >= 2) {
      const { findPath } = await import('../memory/knowledge-graph')
      const path = await findPath(words[0], words[1])
      if (path && path.nodes.length > 0) {
        const pathStr = path.edges.map(e => `${e.predicate}(${Math.round(e.confidence * 100)}%)`).join(' → ')
        synapsePaths.push({ from: words[0], to: words[1], path: pathStr })
      }
    }
  } catch { /* path finding unavailable */ }

  return { memoryEntries, knowledgeTriples, synapsePaths }
}

// ─── Prompt 渲染 ───

/**
 * 将 Agent Memory 渲染为 Hermes 风格的 System Prompt 块
 * 使用 L0+L1 组合作为默认注入（~600 tokens）
 */
export function renderMemoryPrompt(memory: AgentMemory): string {
  if (memory.entries.length === 0) return ''

  const totalChars = memory.entries.map(e => e.text).join('§').length
  const percent = Math.round((totalChars / memory.charLimit) * 100)

  // 默认使用 L1 核心故事
  const content = renderL1Essential(memory)
  if (!content) return ''

  return `<memory-context>
MEMORY (your personal notes) [${percent}% — ${totalChars}/${memory.charLimit} chars]
${content}
</memory-context>`
}

// ─── 安全扫描 ───

const INJECTION_PATTERNS = [
  /ignore\s+(previous|all|above|prior)\s+(instructions?|prompts?|rules)/i,
  /you\s+are\s+now\s+/i,
  /system\s*:\s*/i,
  /forget\s+(everything|all|previous)/i,
  /curl\s+/i,
  /wget\s+/i,
  /\/etc\/passwd/i,
]

const INVISIBLE_CHARS = /[\u200b\u200c\u200d\ufeff\u00ad\u034f\u061c\u180e\u2060\u2066-\u2069]/g

function scanMemoryContent(content: string): { safe: boolean; threats: string[] } {
  const threats: string[] = []
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      threats.push(`匹配注入模式: ${pattern.source}`)
    }
  }
  if (INVISIBLE_CHARS.test(content)) {
    threats.push('包含不可见 Unicode 字符')
  }
  return { safe: threats.length === 0, threats }
}
