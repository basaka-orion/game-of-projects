/**
 * Closet — 记忆索引层 (AAAK 压缩格式)
 *
 * 灵感来源 MemPalace 的 Closet 设计：
 * 为每个记忆条目生成压缩索引，用于快速过滤和排序。
 * Closet 是排名信号，不是门控——弱索引只能帮助，不能阻碍。
 *
 * AAAK 格式：
 * - Anchor: 首句/关键短语（≤50字符）
 * - Abbreviated: LLM 生成的 3-5 词摘要
 * - Associative: 关联标签（自动提取）
 * - Key: 哈希指纹（去重用）
 */

import { query, run } from '../db/repository'
import { generateId } from '../db/schema'
import { LLMConfig, chatCompletion } from '../ai/provider'

// ─── 接口 ───

export interface ClosetEntry {
  id: string
  memoryItemId: string
  agentId: string
  anchor: string
  abbreviated: string
  associativeTags: string[]
  keyHash: string
  importance: number
  recencyScore: number
  accessScore: number
}

export interface ClosetSearchResult {
  memoryItemId: string
  anchor: string
  abbreviated: string
  importance: number
  relevanceScore: number
}

// ─── 常量 ───

/** Anchor 最大长度 */
const MAX_ANCHOR_LENGTH = 50

/** Abbreviated 最大词数 */
const MAX_ABBREVIATED_WORDS = 5

// ─── 索引构建 ───

/**
 * 为单个记忆条目构建 Closet 索引
 *
 * 自动提取 anchor、生成 key hash，不需要 LLM
 */
export async function buildClosetIndex(params: {
  memoryItemId: string
  content: string
  agentId?: string
  importance?: number
}): Promise<string> {
  const { memoryItemId, content, agentId = 'general', importance = 50 } = params

  // Anchor: 首句截断
  const firstSentence = content.match(/[^。！？.!?\n]{10,}/)?.[0] || content.slice(0, MAX_ANCHOR_LENGTH)
  const anchor = firstSentence.slice(0, MAX_ANCHOR_LENGTH).trim()

  // Abbreviated: 提取前 5 个实词
  const words = content
    .replace(/[^\u4e00-\u9fff\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1)
    .slice(0, MAX_ABBREVIATED_WORDS)
  const abbreviated = words.join(' ')

  // Associative Tags: 自动提取关键词
  const tags = extractAssociativeTags(content)

  // Key Hash: 内容指纹（用于去重）
  const keyHash = simpleHash(content.slice(0, 500))

  // 时效性评分：基于当前时间的衰减
  const recencyScore = 1.0

  const id = generateId()
  await run(
    `INSERT OR REPLACE INTO memory_closet (id, memory_item_id, agent_id, anchor, abbreviated, associative_tags, key_hash, importance, recency_score, access_score, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now','localtime'))`,
    [id, memoryItemId, agentId, anchor, abbreviated, JSON.stringify(tags), keyHash, importance, recencyScore]
  )

  return id
}

/**
 * 批量构建 Closet 索引（为所有未索引的记忆条目）
 */
export async function buildMissingClosetIndices(limit = 100): Promise<number> {
  // 找到没有 closet 索引的记忆条目
  const unindexed = await query(
    `SELECT m.id, m.content, m.importance, m.metadata_json
     FROM memory_items m
     LEFT JOIN memory_closet c ON m.id = c.memory_item_id
     WHERE c.id IS NULL AND m.content != ''
     ORDER BY m.importance DESC
     LIMIT ?`,
    [limit]
  ) as Array<{ id: string; content: string; importance: number; metadata_json: string }>

  let count = 0
  for (const item of unindexed) {
    try {
      let agentId = 'general'
      try {
        const meta = JSON.parse(item.metadata_json || '{}') as Record<string, unknown>
        agentId = (meta.agentId as string) || 'general'
      } catch { /* ignore */ }

      await buildClosetIndex({
        memoryItemId: item.id,
        content: item.content,
        agentId,
        importance: item.importance,
      })
      count++
    } catch { /* skip */ }
  }

  return count
}

// ─── LLM 增强索引 ───

/**
 * 用 LLM 为一批记忆条目生成高质量的 abbreviated 摘要
 *
 * 比自动提取更精确，但需要 API 调用
 */
export async function enhanceClosetWithLLM(
  llmConfig: LLMConfig,
  batchSize = 20
): Promise<number> {
  // 获取 abbreviated 为空的 closet 条目
  const entries = await query(
    `SELECT c.id, c.memory_item_id, c.anchor, m.content
     FROM memory_closet c
     JOIN memory_items m ON c.memory_item_id = m.id
     WHERE c.abbreviated = '' OR LENGTH(c.abbreviated) < 5
     LIMIT ?`,
    [batchSize]
  ) as Array<{ id: string; memory_item_id: string; anchor: string; content: string }>

  if (entries.length === 0) return 0

  // 批量生成摘要
  const batchContent = entries.map((e, i) => `[${i}] ${e.content.slice(0, 200)}`).join('\n')

  const response = await chatCompletion(llmConfig, [
    {
      role: 'system',
      content: `你是记忆索引引擎。为每条记忆生成一个 3-5 词的中文摘要。
输出 JSON 数组: [{"index":0,"summary":"3-5词摘要"}]
只输出 JSON。`,
    },
    { role: 'user', content: batchContent },
  ])

  const jsonMatch = response.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return 0

  try {
    const summaries = JSON.parse(jsonMatch[0]) as Array<{ index: number; summary: string }>
    let count = 0

    for (const s of summaries) {
      const entry = entries[s.index]
      if (!entry) continue

      await run(
        "UPDATE memory_closet SET abbreviated = ?, updated_at = datetime('now','localtime') WHERE id = ?",
        [s.summary.slice(0, 50), entry.id]
      )
      count++
    }

    return count
  } catch {
    return 0
  }
}

// ─── 搜索 ───

/**
 * 通过 Closet 索引快速过滤
 *
 * 先在 Closet 中查找匹配的记忆条目，
 * 返回 memoryItemId 列表供后续加载完整内容
 */
export async function searchCloset(
  queryText: string,
  options: {
    agentId?: string
    topK?: number
    minImportance?: number
  } = {}
): Promise<ClosetSearchResult[]> {
  const { agentId, topK = 20, minImportance = 0 } = options

  try {
    // 在 anchor 和 abbreviated 中搜索
    let sql = `
      SELECT memory_item_id, anchor, abbreviated, importance, recency_score, access_score
      FROM memory_closet
      WHERE (anchor LIKE ? OR abbreviated LIKE ? OR associative_tags LIKE ?)
    `
    const params: unknown[] = [`%${queryText}%`, `%${queryText}%`, `%${queryText}%`]

    if (agentId) {
      sql += ` AND agent_id = ?`
      params.push(agentId)
    }
    if (minImportance > 0) {
      sql += ` AND importance >= ?`
      params.push(minImportance)
    }

    sql += ` ORDER BY (importance * 0.5 + recency_score * 30 + access_score * 10) DESC LIMIT ?`
    params.push(topK)

    const rows = await query(sql, params) as Array<{
      memory_item_id: string
      anchor: string
      abbreviated: string
      importance: number
      recency_score: number
      access_score: number
    }>

    return rows.map(r => ({
      memoryItemId: r.memory_item_id,
      anchor: r.anchor,
      abbreviated: r.abbreviated,
      importance: r.importance,
      relevanceScore: r.importance * 0.5 + r.recency_score * 30 + r.access_score * 10,
    }))
  } catch {
    return []
  }
}

// ─── 维护 ───

/** 更新记忆访问后的 access_score */
export async function touchClosetAccess(memoryItemId: string): Promise<void> {
  try {
    await run(
      "UPDATE memory_closet SET access_score = access_score + 1, updated_at = datetime('now','localtime') WHERE memory_item_id = ?",
      [memoryItemId]
    )
  } catch { /* non-critical */ }
}

/** 删除关联的 Closet 条目 */
export async function deleteClosetByMemoryItem(memoryItemId: string): Promise<void> {
  try {
    await run('DELETE FROM memory_closet WHERE memory_item_id = ?', [memoryItemId])
  } catch { /* non-critical */ }
}

/** 获取 Closet 统计 */
export async function getClosetStats(): Promise<{ total: number; byAgent: Record<string, number> }> {
  try {
    const totalRow = await query('SELECT COUNT(*) as cnt FROM memory_closet') as Array<{ cnt: number }>
    const agentRows = await query(
      'SELECT agent_id, COUNT(*) as cnt FROM memory_closet GROUP BY agent_id'
    ) as Array<{ agent_id: string; cnt: number }>

    const byAgent: Record<string, number> = {}
    for (const row of agentRows) {
      byAgent[row.agent_id] = row.cnt
    }

    return { total: totalRow[0]?.cnt || 0, byAgent }
  } catch {
    return { total: 0, byAgent: {} }
  }
}

// ─── 工具函数 ───

/** 从内容中提取关联标签 */
function extractAssociativeTags(content: string): string[] {
  const tags: string[] = []

  // 提取双引号中的短语（15-150字符的引用）
  const quotes = content.match(/"([^"]{15,150})"/g)
  if (quotes) {
    tags.push(...quotes.slice(0, 3).map(q => q.replace(/"/g, '').trim()))
  }

  // 提取 Markdown 标题
  const headers = content.match(/^#{1,3}\s+(.+)$/gm)
  if (headers) {
    tags.push(...headers.slice(0, 3).map(h => h.replace(/^#+\s+/, '').trim()))
  }

  // 提取双链 [[xxx]]
  const wikiLinks = content.match(/\[\[([^\]]+)\]\]/g)
  if (wikiLinks) {
    tags.push(...wikiLinks.slice(0, 5).map(w => w.replace(/[\[\]]/g, '').trim()))
  }

  return [...new Set(tags)].slice(0, 8)
}

/** 简单哈希（用于去重） */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0 // 转为 32 位整数
  }
  return Math.abs(hash).toString(36)
}
