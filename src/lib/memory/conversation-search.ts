/**
 * 对话记忆搜索 — Hermes Agent 风格增强版
 *
 * 功能：
 * - FTS5 + LIKE 双模搜索
 * - 日期范围过滤
 * - 关键词高亮
 * - 上下文片段提取（匹配位置前后各 N 字符）
 * - 按相关度 + 时间排序
 */
import { query, run } from '../db/repository'

export interface ConversationSearchResult {
  sessionId: string
  title: string
  content: string
  role: 'user' | 'assistant'
  rank: number
  /** 高亮后的内容片段 */
  highlight: string
  /** 对话时间 */
  createdAt?: string
}

export interface ConversationSearchOptions {
  limit?: number
  /** ISO 日期，搜索起始日期 */
  dateFrom?: string
  /** ISO 日期，搜索截止日期 */
  dateTo?: string
  /** 只搜索特定角色的消息 */
  roleFilter?: 'user' | 'assistant'
}

/** 从内容中提取包含关键词的上下文片段 */
function extractSnippet(content: string, term: string, radius = 80): string {
  const lc = content.toLowerCase()
  const idx = lc.indexOf(term.toLowerCase())
  if (idx < 0) return content.slice(0, 200)
  const start = Math.max(0, idx - radius)
  const end = Math.min(content.length, idx + term.length + radius)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < content.length ? '…' : ''
  return `${prefix}${content.slice(start, end)}${suffix}`
}

/** 高亮关键词（用 ⟨⟩ 包裹匹配项） */
function highlightKeywords(text: string, terms: string[]): string {
  let result = text
  for (const term of terms) {
    if (!term) continue
    const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    result = result.replace(re, '⟨$1⟩')
  }
  return result
}

/** 搜索历史对话（增强版） */
export async function searchConversations(
  searchTerm: string,
  optionsOrLimit: ConversationSearchOptions | number = 5
): Promise<ConversationSearchResult[]> {
  if (!searchTerm.trim()) return []

  const options: ConversationSearchOptions = typeof optionsOrLimit === 'number'
    ? { limit: optionsOrLimit }
    : optionsOrLimit
  const limit = options.limit || 5
  const terms = searchTerm.trim().split(/\s+/).filter(t => t.length > 0)

  try {
    const rows = await query<{
      session_id: string
      title: string
      content: string
      role: string
      rank: number
    }>(
      `SELECT c.session_id, cv.title, c.content, c.role, c.rank
       FROM conversation_fts c
       LEFT JOIN conversations cv ON c.session_id = cv.id
       WHERE conversation_fts MATCH ?
       ORDER BY c.rank
       LIMIT ?`,
      [searchTerm.trim(), limit * 2]
    )

    let results = rows.map(r => ({
      sessionId: r.session_id,
      title: r.title || '未命名对话',
      content: r.content,
      role: r.role as 'user' | 'assistant',
      rank: r.rank,
      highlight: highlightKeywords(extractSnippet(r.content, terms[0] || searchTerm), terms),
    }))

    // 日期过滤
    if (options.dateFrom || options.dateTo) {
      results = await filterByDate(results, options.dateFrom, options.dateTo)
    }

    // 角色过滤
    if (options.roleFilter) {
      results = results.filter(r => r.role === options.roleFilter)
    }

    return results.slice(0, limit)
  } catch {
    // FTS 表可能不存在，降级到 LIKE 搜索
    return fallbackConversationSearch(terms, searchTerm, options, limit)
  }
}

/** Fallback：LIKE 搜索（增强版） */
async function fallbackConversationSearch(
  terms: string[],
  rawTerm: string,
  options: ConversationSearchOptions,
  limit: number
): Promise<ConversationSearchResult[]> {
  try {
    let sql = 'SELECT id, title, messages_json, created_at FROM conversations'
    const params: unknown[] = []

    // 日期过滤
    const conditions: string[] = []
    if (options.dateFrom) {
      conditions.push('updated_at >= ?')
      params.push(options.dateFrom)
    }
    if (options.dateTo) {
      conditions.push('updated_at <= ?')
      params.push(options.dateTo)
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }
    sql += ' ORDER BY updated_at DESC LIMIT 30'

    const rows = await query<{
      id: string
      title: string
      messages_json: string
      created_at: string
    }>(sql, params)

    const results: ConversationSearchResult[] = []
    for (const row of rows) {
      try {
        const messages: Array<{ role: string; content: string }> = JSON.parse(row.messages_json)
        for (const msg of messages) {
          if (options.roleFilter && msg.role !== options.roleFilter) continue
          if (msg.content.toLowerCase().includes(rawTerm.toLowerCase())) {
            results.push({
              sessionId: row.id,
              title: row.title || '未命名对话',
              content: msg.content.slice(0, 300),
              role: msg.role as 'user' | 'assistant',
              rank: 0,
              highlight: highlightKeywords(extractSnippet(msg.content, rawTerm), terms),
              createdAt: row.created_at,
            })
            if (results.length >= limit) return results
          }
        }
      } catch { /* ignore */ }
    }
    return results
  } catch {
    return []
  }
}

/** 按日期过滤搜索结果 */
async function filterByDate(
  results: ConversationSearchResult[],
  dateFrom?: string,
  dateTo?: string
): Promise<ConversationSearchResult[]> {
  if (!dateFrom && !dateTo) return results

  // 获取每个对话的创建时间
  const sessionIds = [...new Set(results.map(r => r.sessionId))]
  if (sessionIds.length === 0) return results

  try {
    const rows = await query<{ id: string; created_at: string }>(
      `SELECT id, created_at FROM conversations WHERE id IN (${sessionIds.map(() => '?').join(',')})`,
      sessionIds
    )
    const timeMap = new Map(rows.map(r => [r.id, r.created_at]))

    return results.filter(r => {
      const created = timeMap.get(r.sessionId)
      if (!created) return true
      if (dateFrom && created < dateFrom) return false
      if (dateTo && created > dateTo) return false
      return true
    })
  } catch {
    return results
  }
}

/** 将对话消息同步到 FTS */
export async function syncConversationToFTS(
  sessionId: string,
  messages: Array<{ role: string; content: string }>
): Promise<void> {
  try {
    // 先清除旧索引
    await run('DELETE FROM conversation_fts WHERE session_id = ?', [sessionId])
    // 插入新索引
    for (const msg of messages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        await run(
          'INSERT INTO conversation_fts (content, role, session_id) VALUES (?, ?, ?)',
          [msg.content, msg.role, sessionId]
        )
      }
    }
  } catch { /* FTS 表可能不存在 */ }
}
