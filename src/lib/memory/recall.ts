/**
 * 语义回忆 — FTS5 + 向量搜索 + Closet 索引增强
 *
 * 三层检索策略：
 * 1. FTS5 关键词搜索（基线）
 * 2. Closet 索引增强（排名信号）
 * 3. 向量语义搜索（可选，需要 embedding）
 */
import { query } from '../db/repository'
import { getRoomItems, touchMemoryItem, MemoryItem } from './palace'
import { searchCloset, touchClosetAccess } from './closet'
import { semanticSearch, type SearchResult } from '../knowledge/vector-store'

export interface RecallResult {
  item: MemoryItem
  score: number
  source: 'fts' | 'closet' | 'vector' | 'hybrid'
}

/** 关键词提取（简单版：中文按字/英文按词） */
function extractKeywords(text: string): string[] {
  const cleaned = text.replace(/[^\w\u4e00-\u9fff]/g, ' ').toLowerCase()
  const tokens = cleaned.split(/\s+/).filter(t => t.length > 1)
  return tokens
}

/** 语义回忆：FTS5 + Closet + 向量搜索 */
export async function recall(
  queryText: string,
  topN = 5,
  agentId?: string
): Promise<RecallResult[]> {
  const keywords = extractKeywords(queryText)
  if (keywords.length === 0) return []

  // 1. FTS5 基线搜索
  const ftsResults = await ftsRecall(keywords, topN * 3, agentId)

  // 2. Closet 索引增强
  const closetHits = await searchCloset(queryText, { agentId, topK: topN * 2 })

  // 3. 向量语义搜索（非阻塞，失败不影响其他）
  let vectorResults: SearchResult[] = []
  try {
    vectorResults = await semanticSearch(queryText, 'memory_vectors', {
      topK: topN * 2,
      contentJoin: {
        table: 'memory_items',
        foreignKey: 'id',
        contentColumn: 'content',
      },
    })
  } catch { /* 向量搜索不可用 */ }

  // 4. 合并结果：以 FTS 为基线，Closet 和向量作为增强
  const merged = new Map<string, { item: MemoryItem; ftsScore: number; closetBoost: number; vectorScore: number }>()

  // FTS 基线
  for (const r of ftsResults) {
    merged.set(r.item.id, {
      item: r.item,
      ftsScore: r.score,
      closetBoost: 0,
      vectorScore: 0,
    })
  }

  // Closet 增强：增加排名分
  const closetBoosts = [0.4, 0.25, 0.15, 0.08, 0.04]
  for (let i = 0; i < closetHits.length; i++) {
    const hit = closetHits[i]
    const existing = merged.get(hit.memoryItemId)
    if (existing) {
      existing.closetBoost = closetBoosts[i] || 0.02
    } else {
      // Closet 发现的全新结果，需要加载完整内容
      const items = await loadMemoryItems([hit.memoryItemId])
      if (items.length > 0) {
        merged.set(hit.memoryItemId, {
          item: items[0],
          ftsScore: 0,
          closetBoost: closetBoosts[i] || 0.02,
          vectorScore: 0,
        })
      }
    }
  }

  // 向量增强：增加相似度分
  for (const vr of vectorResults) {
    const existing = merged.get(vr.chunkId)
    if (existing) {
      existing.vectorScore = vr.score * 30 // 归一化到与 FTS 同一量级
    } else {
      const items = await loadMemoryItems([vr.chunkId])
      if (items.length > 0) {
        merged.set(vr.chunkId, {
          item: items[0],
          ftsScore: 0,
          closetBoost: 0,
          vectorScore: vr.score * 30,
        })
      }
    }
  }

  // 5. 计算最终分数
  const results: RecallResult[] = []
  for (const [, entry] of merged) {
    const finalScore = entry.ftsScore + entry.closetBoost * 100 + entry.vectorScore
    const source = entry.closetBoost > 0 && entry.vectorScore > 0 ? 'hybrid'
      : entry.vectorScore > 0 ? 'vector'
      : entry.closetBoost > 0 ? 'closet'
      : 'fts'

    results.push({
      item: entry.item,
      score: finalScore,
      source,
    })

    // 更新访问计数
    touchMemoryItem(entry.item.id).catch(() => {})
    touchClosetAccess(entry.item.id).catch(() => {})
  }

  return results.sort((a, b) => b.score - a.score).slice(0, topN)
}

/** FTS5 搜索 */
async function ftsRecall(
  keywords: string[],
  topN: number,
  agentId?: string
): Promise<RecallResult[]> {
  const ftsQuery = keywords.map(k => `"${k}"`).join(' OR ')

  try {
    const ftsRows = await query(
      `SELECT rowid, rank FROM memory_fts WHERE memory_fts MATCH ? ORDER BY rank LIMIT ?`,
      [ftsQuery, topN]
    ) as Array<{ rowid: number; rank: number }>

    if (ftsRows.length === 0) return fallbackRecall(keywords, topN, agentId)

    const rowids = ftsRows.map(r => r.rowid)
    let sql = `SELECT id, room_id, type, content, source, importance, access_count,
                      metadata_json, created_at, updated_at
               FROM memory_items WHERE rowid IN (${rowids.map(() => '?').join(',')})`
    const params: unknown[] = [...rowids]

    if (agentId) {
      sql += ` AND (agent_id = ? OR agent_id = 'general' OR agent_id IS NULL)`
      params.push(agentId)
    }

    const items = await query(sql, params) as MemoryItem[]

    const now = Date.now()
    return items.map(item => {
      const ageDays = (now - new Date(item.createdAt || Date.now()).getTime()) / (1000 * 60 * 60 * 24)
      const recencyBonus = Math.max(0, 30 - ageDays) * 0.5
      const importanceBonus = (item.importance || 50) * 0.3
      const accessBonus = Math.min((item.accessCount || 0) * 2, 20)
      const score = importanceBonus + recencyBonus + accessBonus

      return { item, score, source: 'fts' as const }
    }).sort((a, b) => b.score - a.score)
  } catch {
    return fallbackRecall(keywords, topN, agentId)
  }
}

/** Fallback：LIKE 搜索 */
async function fallbackRecall(
  keywords: string[],
  topN: number,
  agentId?: string
): Promise<RecallResult[]> {
  const conditions = keywords.map(() => 'content LIKE ?').join(' OR ')
  const params: unknown[] = keywords.map(k => `%${k}%`)

  try {
    let sql = `SELECT * FROM memory_items WHERE ${conditions}`
    if (agentId) {
      sql += ` AND (agent_id = ? OR agent_id = 'general' OR agent_id IS NULL)`
      params.push(agentId)
    }
    sql += ` ORDER BY importance DESC LIMIT ?`
    params.push(topN)

    const items = await query(sql, params) as MemoryItem[]
    return items.map(item => ({ item, score: item.importance || 50, source: 'fts' as const }))
  } catch {
    return []
  }
}

/** 按 ID 加载记忆条目 */
async function loadMemoryItems(ids: string[]): Promise<MemoryItem[]> {
  if (ids.length === 0) return []
  try {
    return await query(
      `SELECT * FROM memory_items WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    ) as MemoryItem[]
  } catch {
    return []
  }
}
