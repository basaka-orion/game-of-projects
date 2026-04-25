/**
 * Drawer — 海马体无损原始记忆抽屉
 *
 * 物理隔离的"生肉层"：100% 原始内容，零 LLM 处理，零有损压缩。
 * 与 MemPalace (memory_items) 并存——后者存精选记忆，这里存无损生肉。
 * 后台 Karpathy 编译器会将抽屉内容异步编译为 Wiki 页面。
 */
import { query, run } from '../db/repository'
import { generateId } from '../db/schema'
import { buildFtsQuery, countOccurrences, extractSearchTerms } from './query-analysis'
import { buildFolderScopeCondition, deriveFolderPath } from './folders'

// ─── 接口 ───

export interface Drawer {
  id: string
  title: string
  wing: string
  hall: string
  room: string
  rawContent: string
  sourceType: string
  sourceUrl: string
  filePath: string
  folderPath: string
  author: string
  language: string
  tags: string[]
  isCompiled: boolean
  compiledPageId: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

// ─── Row 解析 ───

function parseRow(r: Record<string, unknown>): Drawer {
  return {
    id: r.id as string,
    title: r.title as string || '',
    wing: r.wing as string || 'default',
    hall: r.hall as string || 'general',
    room: r.room as string || 'inbox',
    rawContent: r.raw_content as string || '',
    sourceType: r.source_type as string || 'paste',
    sourceUrl: r.source_url as string || '',
    filePath: r.file_path as string || '',
    folderPath: r.folder_path as string || '',
    author: r.author as string || '',
    language: r.language as string || 'zh',
    tags: JSON.parse((r.tags as string) || '[]'),
    isCompiled: !!(r.is_compiled as number),
    compiledPageId: r.compiled_page_id as string || '',
    metadata: JSON.parse((r.metadata_json as string) || '{}'),
    createdAt: r.created_at as string || '',
    updatedAt: r.updated_at as string || '',
  }
}

// ─── CRUD ───

/** 创建抽屉（零 LLM，毫秒级） */
export async function createDrawer(d: Partial<Drawer>): Promise<string> {
  const id = generateId()
  const now = new Date().toISOString()
  const metadata = { ...(d.metadata || {}) }
  const folderPath = d.folderPath || deriveFolderPath({
    folderPath: typeof metadata.folderPath === 'string' ? metadata.folderPath : '',
    filePath: d.filePath,
    rootPath: typeof metadata.rootPath === 'string' ? metadata.rootPath : undefined,
    sourceType: d.sourceType,
  })
  if (!metadata.folderPath && folderPath) metadata.folderPath = folderPath

  await run(
    `INSERT INTO mempalace_drawers
     (id, title, wing, hall, room, raw_content, source_type, source_url, file_path, folder_path,
      author, language, tags, is_compiled, compiled_page_id, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', ?, ?, ?)`,
    [
      id,
      d.title || '',
      d.wing || 'default',
      d.hall || 'general',
      d.room || 'inbox',
      d.rawContent || '',
      d.sourceType || 'paste',
      d.sourceUrl || '',
      d.filePath || '',
      folderPath,
      d.author || '',
      d.language || 'zh',
      JSON.stringify(d.tags || []),
      JSON.stringify(metadata),
      now, now,
    ]
  )

  return id
}

/** 获取单个抽屉 */
export async function getDrawer(id: string): Promise<Drawer | undefined> {
  const rows = await query<Record<string, unknown>>(
    'SELECT * FROM mempalace_drawers WHERE id = ?', [id]
  )
  return rows[0] ? parseRow(rows[0]) : undefined
}

/** 根据来源 ID 查找抽屉 */
export async function findDrawerBySourceId(sourceId: string): Promise<Drawer | undefined> {
  const rows = await query<Record<string, unknown>>(
    'SELECT * FROM mempalace_drawers WHERE metadata_json LIKE ? ORDER BY updated_at DESC LIMIT 1',
    [`%"sourceId":"${sourceId}"%`]
  )
  return rows[0] ? parseRow(rows[0]) : undefined
}

/** 更新抽屉 */
export async function updateDrawer(id: string, updates: Partial<Drawer>): Promise<void> {
  const sets: string[] = []
  const values: unknown[] = []

  if (updates.title !== undefined) { sets.push('title = ?'); values.push(updates.title) }
  if (updates.wing !== undefined) { sets.push('wing = ?'); values.push(updates.wing) }
  if (updates.hall !== undefined) { sets.push('hall = ?'); values.push(updates.hall) }
  if (updates.room !== undefined) { sets.push('room = ?'); values.push(updates.room) }
  if (updates.rawContent !== undefined) { sets.push('raw_content = ?'); values.push(updates.rawContent) }
  if (updates.folderPath !== undefined) { sets.push('folder_path = ?'); values.push(updates.folderPath) }
  if (updates.tags !== undefined) { sets.push('tags = ?'); values.push(JSON.stringify(updates.tags)) }
  if (updates.isCompiled !== undefined) { sets.push('is_compiled = ?'); values.push(updates.isCompiled ? 1 : 0) }
  if (updates.compiledPageId !== undefined) { sets.push('compiled_page_id = ?'); values.push(updates.compiledPageId) }
  if (updates.metadata !== undefined) { sets.push('metadata_json = ?'); values.push(JSON.stringify(updates.metadata)) }

  if (sets.length === 0) return

  sets.push("updated_at = datetime('now','localtime')")
  values.push(id)

  await run(`UPDATE mempalace_drawers SET ${sets.join(', ')} WHERE id = ?`, values)
}

/** 删除抽屉 */
export async function deleteDrawer(id: string): Promise<void> {
  await run('DELETE FROM mempalace_drawers WHERE id = ?', [id])
}

/** 标记抽屉为已编译 */
export async function markDrawerCompiled(id: string, pageId: string): Promise<void> {
  await run(
    `UPDATE mempalace_drawers SET is_compiled = 1, compiled_page_id = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
    [pageId, id]
  )
}

// ─── 查询 ───

/** 获取未编译抽屉 */
export async function getUncompiledDrawers(limit = 20): Promise<Drawer[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM mempalace_drawers WHERE is_compiled = 0 ORDER BY folder_path, wing, created_at ASC LIMIT ?`,
    [limit]
  )
  return rows.map(parseRow)
}

/** 获取未编译抽屉数量 */
export async function getUncompiledCount(): Promise<number> {
  const rows = await query<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM mempalace_drawers WHERE is_compiled = 0'
  )
  return rows[0]?.cnt || 0
}

/** 获取抽屉总数 */
export async function getDrawerCount(): Promise<number> {
  const rows = await query<{ cnt: number }>('SELECT COUNT(*) as cnt FROM mempalace_drawers')
  return rows[0]?.cnt || 0
}

/** 按侧翼获取抽屉 */
export async function getDrawersByWing(wing: string, limit = 50): Promise<Drawer[]> {
  const rows = await query<Record<string, unknown>>(
    'SELECT * FROM mempalace_drawers WHERE wing = ? ORDER BY created_at DESC LIMIT ?',
    [wing, limit]
  )
  return rows.map(parseRow)
}

/** 获取所有抽屉（带分页） */
export async function getAllDrawers(limit = 100, offset = 0): Promise<Drawer[]> {
  const rows = await query<Record<string, unknown>>(
    'SELECT * FROM mempalace_drawers ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [limit, offset]
  )
  return rows.map(parseRow)
}

// ─── 搜索 ───

/** FTS5 全文搜索抽屉（含改进 LIKE 回退） */
export async function searchDrawers(
  queryText: string,
  limit = 10,
  folderPath?: string | null,
): Promise<Array<Drawer & { score: number }>> {
  if (!queryText.trim()) return []
  const ftsFolderCondition = buildFolderScopeCondition('d.folder_path', folderPath)
  const rawFolderCondition = buildFolderScopeCondition('folder_path', folderPath)

  try {
    const keywords = buildFtsQuery(queryText, 6)
    const params: unknown[] = [keywords]
    let sql = `SELECT d.*, rank as score FROM mempalace_drawers d
       JOIN mempalace_drawers_fts fts ON d.rowid = fts.rowid
       WHERE mempalace_drawers_fts MATCH ?
    `
    if (ftsFolderCondition) {
      sql += ` AND ${ftsFolderCondition.clause}`
      params.push(...ftsFolderCondition.params)
    }
    sql += ` ORDER BY rank LIMIT ?`
    params.push(limit)

    const rows = await query<Record<string, unknown> & { score: number }>(sql, params)
    if (rows.length > 0) {
      return rows.map(r => ({ ...parseRow(r), score: -(r.score || 0) }))
    }
  } catch { /* FTS 回退到 LIKE */ }

  const terms = extractSearchTerms(queryText, { maxTerms: 12 })
  if (terms.length === 0) return []
  const conditions: string[] = []
  const params: unknown[] = []
  for (const term of terms) {
    const like = `%${term}%`
    conditions.push('(title LIKE ? OR raw_content LIKE ?)')
    params.push(like, like)
  }
  let sql = `SELECT * FROM mempalace_drawers WHERE (${conditions.join(' OR ')})`
  if (rawFolderCondition) {
    sql += ` AND ${rawFolderCondition.clause}`
    params.push(...rawFolderCondition.params)
  }
  sql += ' ORDER BY created_at DESC LIMIT ?'
  params.push(Math.max(limit * 4, 40))
  const rows = await query<Record<string, unknown>>(sql, params)
  return rows
    .map(r => {
      const drawer = parseRow(r)
      const score = terms.reduce((sum, term) => (
        sum
        + countOccurrences(drawer.title || '', term) * 6
        + countOccurrences(drawer.rawContent || '', term)
      ), 0)
      return { ...drawer, score }
    })
    .filter(drawer => drawer.score > 0)
    .sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
}

// ─── 精确搜索（确保 100% 内容可搜） ───

/** 精确子字符串搜索 — 支持任意文本（含标点符号）的精确匹配 */
export async function searchDrawersExact(
  exactQuery: string,
  limit = 10
): Promise<Array<Drawer & { matchPosition: number }>> {
  if (!exactQuery.trim()) return []

  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM mempalace_drawers
     WHERE raw_content LIKE ? OR title LIKE ?
     ORDER BY created_at DESC LIMIT ?`,
    [`%${exactQuery}%`, `%${exactQuery}%`, limit * 2]  // 多取一些用于排序
  )

  // 计算精确匹配位置并排序
  const results = rows
    .map(r => {
      const parsed = parseRow(r)
      const pos = parsed.rawContent.indexOf(exactQuery)
      const titlePos = parsed.title.indexOf(exactQuery)
      const matchPosition = pos >= 0 ? pos : titlePos
      return matchPosition >= 0 ? { ...parsed, matchPosition } : null
    })
    .filter((r): r is Drawer & { matchPosition: number } => r !== null)
    .sort((a, b) => a.matchPosition - b.matchPosition)
    .slice(0, limit)

  return results
}

/** 获取精确匹配的上下文片段（匹配位置前后各 100 字符） */
export function getMatchContext(content: string, query: string, contextRadius = 100): string {
  const pos = content.indexOf(query)
  if (pos < 0) return content.slice(0, 200)
  const start = Math.max(0, pos - contextRadius)
  const end = Math.min(content.length, pos + query.length + contextRadius)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < content.length ? '...' : ''
  return `${prefix}${content.slice(start, end)}${suffix}`
}

// ─── 统计 ───

export interface DrawerStats {
  totalDrawers: number
  uncompiledCount: number
  compiledCount: number
  byWing: Array<{ wing: string; cnt: number }>
}

/** 获取抽屉统计 */
export async function getDrawerStats(): Promise<DrawerStats> {
  const totalRows = await query<{ cnt: number }>('SELECT COUNT(*) as cnt FROM mempalace_drawers')
  const uncompiledRows = await query<{ cnt: number }>('SELECT COUNT(*) as cnt FROM mempalace_drawers WHERE is_compiled = 0')
  const compiledRows = await query<{ cnt: number }>('SELECT COUNT(*) as cnt FROM mempalace_drawers WHERE is_compiled = 1')
  const wingRows = await query<{ wing: string; cnt: number }>(
    'SELECT wing, COUNT(*) as cnt FROM mempalace_drawers GROUP BY wing ORDER BY cnt DESC'
  )

  return {
    totalDrawers: totalRows[0]?.cnt || 0,
    uncompiledCount: uncompiledRows[0]?.cnt || 0,
    compiledCount: compiledRows[0]?.cnt || 0,
    byWing: wingRows,
  }
}
