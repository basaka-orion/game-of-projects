/**
 * 小白知识库 — SQLite + FTS5 全文搜索
 * 用于存储评分≥4 的方案，供后续优先匹配
 */
import { query, run } from '../db/repository'
import { generateId } from '../db/schema'
import { quickWikiLookup } from '../knowledge/query-engine'
import { buildFtsQuery, countOccurrences, extractSearchTerms } from '../knowledge/query-analysis'

export interface Solution {
  id: string
  problem: string
  solution: string
  source: string
  confidence: number
  actionType: string
  rating: number
  feedback: string
  tags: string
  metadataJson: string
  createdAt: string
}

export interface RatedSolution {
  problem: string
  solution: string
  source?: string
  confidence?: number
  actionType?: string
  rating: number
  feedback?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

/** 搜索知识库 — FTS5 全文搜索，返回评分≥4 的最佳匹配 */
export async function searchKnowledge(queryText: string): Promise<Solution | null> {
  if (!queryText.trim()) return null

  try {
    const keywords = buildFtsQuery(queryText, 6)
    const rows = await query<Solution>(
      `SELECT s.* FROM xiaobai_solutions s
       JOIN xiaobai_solutions_fts fts ON s.rowid = fts.rowid
       WHERE xiaobai_solutions_fts MATCH ?
       AND s.rating >= 4
       ORDER BY s.rating DESC, s.confidence DESC
       LIMIT 1`,
      [keywords]
    )
    return rows[0] || null
  } catch (err) {
    // FTS 可能未初始化或索引为空
    console.warn('[xiaobai-kb] FTS search failed, trying LIKE fallback:', err)

    const terms = extractSearchTerms(queryText, { maxTerms: 8 })
    if (terms.length === 0) return null

    const conditions: string[] = []
    const params: unknown[] = []
    for (const term of terms) {
      const like = `%${term}%`
      conditions.push('(problem LIKE ? OR solution LIKE ? OR tags LIKE ?)')
      params.push(like, like, like)
    }
    params.push(30)

    const rows = await query<Solution>(
      `SELECT * FROM xiaobai_solutions
       WHERE rating >= 4 AND (${conditions.join(' OR ')})
       ORDER BY rating DESC, confidence DESC
       LIMIT ?`,
      params
    )

    return rows
      .map(row => {
        const score = terms.reduce((sum, term) => (
          sum
          + countOccurrences(row.problem || '', term) * 6
          + countOccurrences(row.solution || '', term)
          + countOccurrences(row.tags || '', term) * 2
        ), 0)
        return { row, score }
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || b.row.rating - a.row.rating || b.row.confidence - a.row.confidence)
      .map(item => item.row)[0] || null
  }
}

/** Wiki 优先搜索 — 先查 Wiki 知识库，再查本地方案库 */
export async function searchKnowledgeWikiFirst(queryText: string): Promise<{
  source: 'wiki' | 'local' | null
  wikiContent?: string
  wikiPageId?: string
  wikiConfidence?: number
  localSolution?: Solution
}> {
  if (!queryText.trim()) return { source: null }

  // 优先查 Wiki
  try {
    const wikiResult = await quickWikiLookup(queryText)
    if (wikiResult && wikiResult.found && wikiResult.confidence >= 0.6) {
      return {
        source: 'wiki',
        wikiContent: wikiResult.content,
        wikiPageId: wikiResult.pageId,
        wikiConfidence: wikiResult.confidence,
      }
    }
  } catch { /* Wiki 查询失败 */ }

  // 回退到本地知识库
  const localResult = await searchKnowledge(queryText)
  if (localResult) {
    return { source: 'local', localSolution: localResult }
  }

  return { source: null }
}

/** 存储评分方案到知识库 */
export async function storeSolution(solution: RatedSolution): Promise<string> {
  const id = generateId()
  const tagsStr = (solution.tags || []).join(',')
  const metaStr = JSON.stringify(solution.metadata || {})

  await run(
    `INSERT INTO xiaobai_solutions
     (id, problem, solution, source, confidence, action_type, rating, feedback, tags, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      solution.problem,
      solution.solution,
      solution.source || 'generated',
      solution.confidence || 0.5,
      solution.actionType || 'copy',
      solution.rating,
      solution.feedback || '',
      tagsStr,
      metaStr,
    ]
  )

  // 同步 FTS 索引
  try {
    await run(
      `INSERT INTO xiaobai_solutions_fts(rowid, problem, solution, tags)
       VALUES (last_insert_rowid(), ?, ?, ?)`,
      [solution.problem, solution.solution, tagsStr]
    )
  } catch {
    // FTS 同步失败不应阻断主流程
  }

  return id
}

/** 获取知识库统计 */
export async function getKnowledgeStats(): Promise<{
  totalEntries: number
  highRated: number
}> {
  const total = await query<{ cnt: number }>('SELECT COUNT(*) as cnt FROM xiaobai_solutions')
  const highRated = await query<{ cnt: number }>('SELECT COUNT(*) as cnt FROM xiaobai_solutions WHERE rating >= 4')
  return {
    totalEntries: total[0]?.cnt || 0,
    highRated: highRated[0]?.cnt || 0,
  }
}
