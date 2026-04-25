/**
 * Wiki 页面/源 CRUD — 知识库核心数据层
 *
 * Karpathy 三层架构的中间层：
 * - WikiPage: LLM 生成并维护的结构化页面
 * - WikiSource: 不可变的原始来源
 * - 页面链接、FTS 搜索、Index/Log 特殊页面
 */
import { dbSaveOperatingEvent, query, run } from '../db/repository'
import { generateId } from '../db/schema'
import { buildFtsQuery, countOccurrences, extractSearchTerms } from './query-analysis'
import {
  buildFolderScopeCondition,
  deriveFolderPath,
  loadKnowledgeSourceScopeEntries,
  pageMatchesFolderScope,
} from './folders'

// ─── 接口 ───

export interface WikiPage {
  id: string
  title: string
  slug: string
  content: string
  summary: string
  category: string
  tags: string[]
  frontmatter: Record<string, unknown>
  sourceIds: string[]
  linkedPageIds: string[]
  backlinkCount: number
  importance: number
  confidence: number
  isIndex: boolean
  isLog: boolean
  folderPath: string
  templateId: string
  version: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface WikiSource {
  id: string
  title: string
  sourceType: string
  content: string
  rawContent: string
  url: string
  filePath: string
  folderPath: string
  author: string
  language: string
  frontmatter: Record<string, unknown>
  tags: string[]
  status: string
  errorMessage: string
  templateId: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface PageLink {
  id: string
  sourcePageId: string
  targetPageId: string
  linkType: string
  context: string
  createdAt: string
}

// ─── 辅助 ───

/** 从标题生成 slug */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

function parsePageRow(r: Record<string, unknown>): WikiPage {
  return {
    id: r.id as string,
    title: r.title as string,
    slug: r.slug as string,
    content: (r.content as string) || '',
    summary: (r.summary as string) || '',
    category: (r.category as string) || 'general',
    tags: JSON.parse((r.tags as string) || '[]'),
    frontmatter: JSON.parse((r.frontmatter_json as string) || '{}'),
    sourceIds: JSON.parse((r.source_ids as string) || '[]'),
    linkedPageIds: JSON.parse((r.linked_page_ids as string) || '[]'),
    backlinkCount: (r.backlink_count as number) || 0,
    importance: (r.importance as number) || 50,
    confidence: (r.confidence as number) || 0.8,
    isIndex: !!(r.is_index as number),
    isLog: !!(r.is_log as number),
    folderPath: (r.folder_path as string) || '',
    templateId: (r.template_id as string) || '',
    version: (r.version as number) || 1,
    metadata: JSON.parse((r.metadata_json as string) || '{}'),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

function parseSourceRow(r: Record<string, unknown>): WikiSource {
  return {
    id: r.id as string,
    title: r.title as string,
    sourceType: r.source_type as string,
    content: (r.content as string) || '',
    rawContent: (r.raw_content as string) || '',
    url: (r.url as string) || '',
    filePath: (r.file_path as string) || '',
    folderPath: (r.folder_path as string) || '',
    author: (r.author as string) || '',
    language: (r.language as string) || 'zh',
    frontmatter: JSON.parse((r.frontmatter_json as string) || '{}'),
    tags: JSON.parse((r.tags as string) || '[]'),
    status: (r.status as string) || 'pending',
    errorMessage: (r.error_message as string) || '',
    templateId: (r.template_id as string) || '',
    metadata: JSON.parse((r.metadata_json as string) || '{}'),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

// ─── 页面 CRUD ───

/** 创建 Wiki 页面 */
export async function createPage(p: Partial<WikiPage>): Promise<string> {
  const id = p.id || generateId()
  const slug = p.slug || generateSlug(p.title || 'untitled')
  const tags = typeof p.tags === 'string' ? p.tags : JSON.stringify(p.tags || [])
  const sourceIds = typeof p.sourceIds === 'string' ? p.sourceIds : JSON.stringify(p.sourceIds || [])
  const linkedPageIds = typeof p.linkedPageIds === 'string' ? p.linkedPageIds : JSON.stringify(p.linkedPageIds || [])
  const metadata = { ...(p.metadata || {}) }
  const folderPath =
    p.folderPath ||
    deriveFolderPath({
      folderPath: typeof metadata.folderPath === 'string' ? metadata.folderPath : '',
      filePath: typeof metadata.sourceFilePath === 'string' ? metadata.sourceFilePath : '',
    })
  if (!metadata.folderPath && folderPath) metadata.folderPath = folderPath

  await run(
    `INSERT OR IGNORE INTO wiki_pages (id, title, slug, content, summary, category, tags, frontmatter_json, source_ids, linked_page_ids, backlink_count, importance, confidence, is_index, is_log, folder_path, template_id, version, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      p.title || '无标题',
      slug,
      p.content || '',
      p.summary || '',
      p.category || 'general',
      tags,
      JSON.stringify(p.frontmatter || {}),
      sourceIds,
      linkedPageIds,
      p.backlinkCount || 0,
      p.importance ?? 50,
      p.confidence ?? 0.8,
      p.isIndex ? 1 : 0,
      p.isLog ? 1 : 0,
      folderPath,
      p.templateId || '',
      p.version || 1,
      JSON.stringify(metadata),
    ],
  )
  return id
}

/** 获取页面 */
export async function getPage(id: string): Promise<WikiPage | undefined> {
  const rows = await query<Record<string, unknown>>('SELECT * FROM wiki_pages WHERE id = ?', [id])
  return rows.length > 0 ? parsePageRow(rows[0]) : undefined
}

/** 按 slug 获取页面 */
export async function getPageBySlug(slug: string): Promise<WikiPage | undefined> {
  const rows = await query<Record<string, unknown>>('SELECT * FROM wiki_pages WHERE slug = ?', [slug])
  return rows.length > 0 ? parsePageRow(rows[0]) : undefined
}

/** 按标题获取页面（精确匹配） */
export async function getPageByTitle(title: string): Promise<WikiPage | undefined> {
  const rows = await query<Record<string, unknown>>('SELECT * FROM wiki_pages WHERE title = ?', [title])
  return rows.length > 0 ? parsePageRow(rows[0]) : undefined
}

/**
 * 解析页面内容中的 [[页面名称]] 双链，创建 wiki_page_links 记录
 * 返回创建的链接数量
 */
export async function parseWikiLinks(pageId: string): Promise<number> {
  const page = await getPage(pageId)
  if (!page || !page.content) return 0

  // 提取所有 [[page name]]
  const regex = /\[\[([^\]]+)\]\]/g
  const linkNames = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = regex.exec(page.content)) !== null) {
    linkNames.add(m[1])
  }

  if (linkNames.size === 0) {
    // 如果之前有链接，清空
    if (page.linkedPageIds.length > 0) {
      const oldLinks = await query<{ id: string; target_page_id: string }>(
        'SELECT id, target_page_id FROM wiki_page_links WHERE source_page_id = ?',
        [pageId],
      )
      for (const ol of oldLinks) {
        await run('DELETE FROM wiki_page_links WHERE id = ?', [ol.id])
        await run('UPDATE wiki_pages SET backlink_count = MAX(0, backlink_count - 1) WHERE id = ?', [ol.target_page_id])
      }
      await updatePage(pageId, { linkedPageIds: [] })
    }
    return 0
  }

  // 清除旧链接（修复反向链接计数）
  const oldLinks = await query<{ id: string; target_page_id: string }>(
    'SELECT id, target_page_id FROM wiki_page_links WHERE source_page_id = ?',
    [pageId],
  )
  for (const ol of oldLinks) {
    await run('DELETE FROM wiki_page_links WHERE id = ?', [ol.id])
    await run('UPDATE wiki_pages SET backlink_count = MAX(0, backlink_count - 1) WHERE id = ?', [ol.target_page_id])
  }

  const linkedPageIds: string[] = []
  let linksCreated = 0

  for (const name of linkNames) {
    // 精确标题匹配 → 大小写不敏感 → slug 匹配
    let targetPage = await getPageByTitle(name)
    if (!targetPage) {
      const ciRows = await query<Record<string, unknown>>(
        'SELECT * FROM wiki_pages WHERE LOWER(title) = LOWER(?) LIMIT 1',
        [name],
      )
      if (ciRows.length > 0) targetPage = parsePageRow(ciRows[0])
    }
    if (!targetPage) {
      targetPage = await getPageBySlug(generateSlug(name))
    }

    if (targetPage && targetPage.id !== pageId) {
      await addPageLink(pageId, targetPage.id, 'reference', `[[${name}]]`)
      if (!linkedPageIds.includes(targetPage.id)) {
        linkedPageIds.push(targetPage.id)
      }
      linksCreated++
    }
  }

  // 更新源页面的 linkedPageIds
  await updatePage(pageId, { linkedPageIds })

  return linksCreated
}

/** 更新页面 */
export async function updatePage(id: string, updates: Partial<WikiPage>): Promise<void> {
  const sets: string[] = []
  const params: unknown[] = []

  if (updates.title !== undefined) {
    sets.push('title = ?')
    params.push(updates.title)
  }
  if (updates.slug !== undefined) {
    sets.push('slug = ?')
    params.push(updates.slug)
  }
  if (updates.content !== undefined) {
    sets.push('content = ?')
    params.push(updates.content)
  }
  if (updates.summary !== undefined) {
    sets.push('summary = ?')
    params.push(updates.summary)
  }
  if (updates.category !== undefined) {
    sets.push('category = ?')
    params.push(updates.category)
  }
  if (updates.tags !== undefined) {
    sets.push('tags = ?')
    params.push(typeof updates.tags === 'string' ? updates.tags : JSON.stringify(updates.tags))
  }
  if (updates.frontmatter !== undefined) {
    sets.push('frontmatter_json = ?')
    params.push(JSON.stringify(updates.frontmatter))
  }
  if (updates.sourceIds !== undefined) {
    sets.push('source_ids = ?')
    params.push(typeof updates.sourceIds === 'string' ? updates.sourceIds : JSON.stringify(updates.sourceIds))
  }
  if (updates.linkedPageIds !== undefined) {
    sets.push('linked_page_ids = ?')
    params.push(
      typeof updates.linkedPageIds === 'string' ? updates.linkedPageIds : JSON.stringify(updates.linkedPageIds),
    )
  }
  if (updates.importance !== undefined) {
    sets.push('importance = ?')
    params.push(updates.importance)
  }
  if (updates.confidence !== undefined) {
    sets.push('confidence = ?')
    params.push(updates.confidence)
  }
  if (updates.version !== undefined) {
    sets.push('version = ?')
    params.push(updates.version)
  }
  if (updates.folderPath !== undefined) {
    sets.push('folder_path = ?')
    params.push(updates.folderPath)
  }
  if (updates.metadata !== undefined) {
    sets.push('metadata_json = ?')
    params.push(JSON.stringify(updates.metadata))
  }

  if (sets.length === 0) return
  sets.push("updated_at = datetime('now','localtime')")
  params.push(id)
  await run(`UPDATE wiki_pages SET ${sets.join(', ')} WHERE id = ?`, params)
}

/** 删除页面 */
export async function deletePage(id: string): Promise<void> {
  await run('DELETE FROM wiki_page_links WHERE source_page_id = ? OR target_page_id = ?', [id, id])
  await run('DELETE FROM wiki_pages WHERE id = ?', [id])
}

/** 获取所有页面（分页） */
export async function getAllPages(limit = 100, offset = 0): Promise<WikiPage[]> {
  if (limit <= 0) {
    const rows = await query<Record<string, unknown>>(
      'SELECT * FROM wiki_pages WHERE is_index = 0 AND is_log = 0 ORDER BY importance DESC, updated_at DESC',
    )
    return rows.map(parsePageRow)
  }

  const rows = await query<Record<string, unknown>>(
    'SELECT * FROM wiki_pages WHERE is_index = 0 AND is_log = 0 ORDER BY importance DESC, updated_at DESC LIMIT ? OFFSET ?',
    [limit, offset],
  )
  return rows.map(parsePageRow)
}

/** 获取全部页面（自动分页拉取） */
export async function getAllPagesUnbounded(batchSize = 500): Promise<WikiPage[]> {
  const allPages: WikiPage[] = []
  let offset = 0

  while (true) {
    const batch = await getAllPages(batchSize, offset)
    allPages.push(...batch)
    if (batch.length < batchSize) break
    offset += batch.length
  }

  return allPages
}

/** 按分类获取页面 */
export async function getPagesByCategory(category: string): Promise<WikiPage[]> {
  const rows = await query<Record<string, unknown>>(
    'SELECT * FROM wiki_pages WHERE category = ? ORDER BY importance DESC, updated_at DESC',
    [category],
  )
  return rows.map(parsePageRow)
}

/** 获取页面数量 */
export async function getPageCount(): Promise<number> {
  const rows = await query<{ cnt: number }>('SELECT COUNT(*) as cnt FROM wiki_pages WHERE is_index = 0 AND is_log = 0')
  return rows[0]?.cnt || 0
}

// ─── 源 CRUD ───

/** 创建源 */
export async function createSource(s: Partial<WikiSource>): Promise<string> {
  const id = generateId()
  const tags = typeof s.tags === 'string' ? s.tags : JSON.stringify(s.tags || [])
  const metadata = { ...(s.metadata || {}) }
  const folderPath =
    s.folderPath ||
    deriveFolderPath({
      folderPath: typeof metadata.folderPath === 'string' ? metadata.folderPath : '',
      filePath: s.filePath,
      rootPath: typeof metadata.rootPath === 'string' ? metadata.rootPath : undefined,
      sourceType: s.sourceType,
    })
  if (!metadata.folderPath && folderPath) metadata.folderPath = folderPath

  await run(
    `INSERT INTO wiki_sources (id, title, source_type, content, raw_content, url, file_path, folder_path, author, language, frontmatter_json, tags, status, error_message, template_id, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      s.title || '无标题',
      s.sourceType || 'paste',
      s.content || '',
      s.rawContent || '',
      s.url || '',
      s.filePath || '',
      folderPath,
      s.author || '',
      s.language || 'zh',
      JSON.stringify(s.frontmatter || {}),
      tags,
      s.status || 'pending',
      s.errorMessage || '',
      s.templateId || '',
      JSON.stringify(metadata),
    ],
  )
  try {
    await dbSaveOperatingEvent({
      id: `op_wiki_source_${id}`,
      type: 'knowledge_source',
      stage: 'compile',
      title: s.title || '无标题',
      scope: folderPath,
      status: s.status === 'processed' ? 'indexed' : s.status === 'processing' ? 'chunked' : 'imported',
      source: {
        kind: 'wiki',
        sourceId: id,
        title: s.title || 'wiki_source',
        path: s.filePath,
        url: s.url,
      },
      confidence: 0.78,
    })
  } catch {
    // Event ledger should not block source import.
  }
  return id
}

/** 更新源 */
export async function updateSource(id: string, updates: Partial<WikiSource>): Promise<void> {
  const sets: string[] = []
  const params: unknown[] = []

  if (updates.title !== undefined) {
    sets.push('title = ?')
    params.push(updates.title)
  }
  if (updates.content !== undefined) {
    sets.push('content = ?')
    params.push(updates.content)
  }
  if (updates.rawContent !== undefined) {
    sets.push('raw_content = ?')
    params.push(updates.rawContent)
  }
  if (updates.status !== undefined) {
    sets.push('status = ?')
    params.push(updates.status)
  }
  if (updates.errorMessage !== undefined) {
    sets.push('error_message = ?')
    params.push(updates.errorMessage)
  }
  if (updates.folderPath !== undefined) {
    sets.push('folder_path = ?')
    params.push(updates.folderPath)
  }
  if (updates.tags !== undefined) {
    sets.push('tags = ?')
    params.push(typeof updates.tags === 'string' ? updates.tags : JSON.stringify(updates.tags))
  }
  if (updates.metadata !== undefined) {
    sets.push('metadata_json = ?')
    params.push(JSON.stringify(updates.metadata))
  }

  if (sets.length === 0) return
  sets.push("updated_at = datetime('now','localtime')")
  params.push(id)
  await run(`UPDATE wiki_sources SET ${sets.join(', ')} WHERE id = ?`, params)
  try {
    if (updates.status !== undefined) {
      await dbSaveOperatingEvent({
        id: `op_wiki_source_${id}`,
        type: 'knowledge_source',
        stage: 'compile',
        title: updates.title || '知识来源状态更新',
        scope: updates.folderPath,
        status: updates.status === 'processed' ? 'indexed' : updates.status === 'processing' ? 'chunked' : 'imported',
        source: { kind: 'wiki', sourceId: id, title: updates.title || 'wiki_source' },
        confidence: 0.8,
      })
    }
  } catch {
    // Event ledger should not block source update.
  }
}

/** 获取源 */
export async function getSource(id: string): Promise<WikiSource | undefined> {
  const rows = await query<Record<string, unknown>>('SELECT * FROM wiki_sources WHERE id = ?', [id])
  return rows.length > 0 ? parseSourceRow(rows[0]) : undefined
}

/** 获取所有源 */
export async function getAllSources(limit = 100): Promise<WikiSource[]> {
  const rows =
    limit <= 0
      ? await query<Record<string, unknown>>('SELECT * FROM wiki_sources ORDER BY created_at DESC')
      : await query<Record<string, unknown>>('SELECT * FROM wiki_sources ORDER BY created_at DESC LIMIT ?', [limit])
  return rows.map(parseSourceRow)
}

/** 获取全部来源（自动分页拉取） */
export async function getAllSourcesUnbounded(batchSize = 500): Promise<WikiSource[]> {
  const allSources: WikiSource[] = []
  let offset = 0

  while (true) {
    const rows = await query<Record<string, unknown>>(
      'SELECT * FROM wiki_sources ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [batchSize, offset],
    )
    const batch = rows.map(parseSourceRow)
    allSources.push(...batch)
    if (batch.length < batchSize) break
    offset += batch.length
  }

  return allSources
}

/** 按状态获取源 */
export async function getSourcesByStatus(status: string): Promise<WikiSource[]> {
  const rows = await query<Record<string, unknown>>(
    'SELECT * FROM wiki_sources WHERE status = ? ORDER BY created_at DESC',
    [status],
  )
  return rows.map(parseSourceRow)
}

/** 删除源 */
export async function deleteSource(id: string): Promise<void> {
  await run('DELETE FROM wiki_sources WHERE id = ?', [id])
}

/** 获取源数量 */
export async function getSourceCount(): Promise<number> {
  const rows = await query<{ cnt: number }>('SELECT COUNT(*) as cnt FROM wiki_sources')
  return rows[0]?.cnt || 0
}

// ─── 链接管理 ───

/** 添加页面链接 */
export async function addPageLink(
  sourcePageId: string,
  targetPageId: string,
  linkType = 'reference',
  context = '',
): Promise<string> {
  const id = generateId()
  await run(
    `INSERT OR IGNORE INTO wiki_page_links (id, source_page_id, target_page_id, link_type, context)
     VALUES (?, ?, ?, ?, ?)`,
    [id, sourcePageId, targetPageId, linkType, context],
  )
  // 更新反向链接计数
  await run('UPDATE wiki_pages SET backlink_count = backlink_count + 1 WHERE id = ?', [targetPageId])
  return id
}

/** 移除页面链接 */
export async function removePageLink(id: string): Promise<void> {
  const link = await query<{ source_page_id: string; target_page_id: string }>(
    'SELECT source_page_id, target_page_id FROM wiki_page_links WHERE id = ?',
    [id],
  )
  if (link.length > 0) {
    await run('DELETE FROM wiki_page_links WHERE id = ?', [id])
    await run('UPDATE wiki_pages SET backlink_count = MAX(0, backlink_count - 1) WHERE id = ?', [
      link[0].target_page_id,
    ])
  }
}

/** 获取页面的反向链接（谁链接到此页） */
export async function getPageBacklinks(pageId: string): Promise<WikiPage[]> {
  const rows = await query<{ source_page_id: string }>(
    'SELECT source_page_id FROM wiki_page_links WHERE target_page_id = ?',
    [pageId],
  )
  const pages: WikiPage[] = []
  for (const r of rows) {
    const page = await getPage(r.source_page_id)
    if (page) pages.push(page)
  }
  return pages
}

/** 获取页面的外向链接（此页链接到谁） */
export async function getPageOutlinks(pageId: string): Promise<Array<WikiPage & { linkType: string }>> {
  const rows = await query<{ target_page_id: string; link_type: string }>(
    'SELECT target_page_id, link_type FROM wiki_page_links WHERE source_page_id = ?',
    [pageId],
  )
  const pages: Array<WikiPage & { linkType: string }> = []
  for (const r of rows) {
    const page = await getPage(r.target_page_id)
    if (page) pages.push({ ...page, linkType: r.link_type })
  }
  return pages
}

/** 重建所有反向链接计数 */
export async function rebuildBacklinkCounts(): Promise<void> {
  await run('UPDATE wiki_pages SET backlink_count = 0')
  await run(`
    UPDATE wiki_pages SET backlink_count = (
      SELECT COUNT(*) FROM wiki_page_links WHERE wiki_page_links.target_page_id = wiki_pages.id
    )
  `)
}

// ─── 搜索 ───

function scorePageMatch(page: WikiPage, keywords: string[]): number {
  let score = 0
  for (const keyword of keywords) {
    score += countOccurrences(page.title || '', keyword) * 8
    score += countOccurrences(page.summary || '', keyword) * 4
    score += countOccurrences(page.content || '', keyword)
  }
  return score
}

function scoreSourceMatch(source: WikiSource, keywords: string[]): number {
  let score = 0
  for (const keyword of keywords) {
    score += countOccurrences(source.title || '', keyword) * 6
    score += countOccurrences(source.content || '', keyword)
  }
  return score
}

/** 搜索 Wiki 页面（FTS5 + 改进 LIKE 回退） */
async function filterPagesByScope(
  rows: Array<WikiPage & { score: number }>,
  folderPath?: string | null,
): Promise<Array<WikiPage & { score: number }>> {
  if (!folderPath) return rows
  const sourceIds = Array.from(new Set(rows.flatMap((page) => page.sourceIds).filter(Boolean)))
  const sourceFolderMap =
    sourceIds.length > 0
      ? new Map((await loadKnowledgeSourceScopeEntries(sourceIds)).map((entry) => [entry.id, entry.folderPath]))
      : new Map<string, string>()
  return rows.filter((page) => pageMatchesFolderScope(page, folderPath, sourceFolderMap))
}

export async function searchPages(
  queryText: string,
  limit = 20,
  folderPath?: string | null,
): Promise<Array<WikiPage & { score: number }>> {
  if (!queryText.trim()) return []
  const effectiveLimit = folderPath ? Math.max(limit * 6, 60) : limit
  const ftsFolderCondition = buildFolderScopeCondition('p.folder_path', folderPath, { includeLegacyBlank: true })
  const rawFolderCondition = buildFolderScopeCondition('folder_path', folderPath, { includeLegacyBlank: true })

  // 尝试 FTS5
  try {
    const ftsQuery = buildFtsQuery(queryText, 6)
    const params: unknown[] = [ftsQuery]
    let sql = `SELECT p.*, f.rank FROM wiki_pages_fts f JOIN wiki_pages p ON p.rowid = f.rowid
       WHERE wiki_pages_fts MATCH ? AND p.is_index = 0 AND p.is_log = 0`
    if (ftsFolderCondition) {
      sql += ` AND ${ftsFolderCondition.clause}`
      params.push(...ftsFolderCondition.params)
    }
    sql += ' ORDER BY f.rank LIMIT ?'
    params.push(effectiveLimit)

    const ftsRows = await query<Record<string, unknown> & { rank: number }>(sql, params)
    if (ftsRows.length > 0) {
      const filteredRows = await filterPagesByScope(
        ftsRows.map((r) => ({ ...parsePageRow(r), score: -r.rank })),
        folderPath,
      )
      if (filteredRows.length > 0) return filteredRows.slice(0, limit)
    }
  } catch {
    // FTS 可能不支持中文分词，回退到 LIKE
  }

  const keywords = extractSearchTerms(queryText, { maxTerms: 12 })
  if (keywords.length === 0) return []
  const conditions: string[] = []
  const params: unknown[] = []
  for (const kw of keywords) {
    const like = `%${kw}%`
    conditions.push('(title LIKE ? OR content LIKE ? OR summary LIKE ?)')
    params.push(like, like, like)
  }
  let sql = `SELECT * FROM wiki_pages WHERE is_index = 0 AND is_log = 0 AND (${conditions.join(' OR ')})`
  if (rawFolderCondition) {
    sql += ` AND ${rawFolderCondition.clause}`
    params.push(...rawFolderCondition.params)
  }
  sql += ' ORDER BY importance DESC LIMIT ?'
  params.push(Math.max(effectiveLimit * 2, 60))

  const rows = await query<Record<string, unknown>>(sql, params)
  const filteredRows = await filterPagesByScope(
    rows
      .map((r) => {
        const page = parsePageRow(r)
        return { ...page, score: scorePageMatch(page, keywords) }
      })
      .filter((page) => page.score > 0)
      .sort((a, b) => b.score - a.score || b.importance - a.importance || b.confidence - a.confidence),
    folderPath,
  )
  return filteredRows.slice(0, limit)
}

/** 搜索源（FTS5 + 改进 LIKE 回退） */
export async function searchSources(
  queryText: string,
  limit = 20,
  folderPath?: string | null,
): Promise<Array<WikiSource & { score: number }>> {
  if (!queryText.trim()) return []
  const ftsFolderCondition = buildFolderScopeCondition('s.folder_path', folderPath)
  const rawFolderCondition = buildFolderScopeCondition('folder_path', folderPath)

  try {
    const ftsQuery = buildFtsQuery(queryText, 6)
    const params: unknown[] = [ftsQuery]
    let sql = `SELECT s.*, f.rank FROM wiki_sources_fts f JOIN wiki_sources s ON s.rowid = f.rowid
       WHERE wiki_sources_fts MATCH ?`
    if (ftsFolderCondition) {
      sql += ` AND ${ftsFolderCondition.clause}`
      params.push(...ftsFolderCondition.params)
    }
    sql += ' ORDER BY f.rank LIMIT ?'
    params.push(limit)

    const ftsRows = await query<Record<string, unknown> & { rank: number }>(sql, params)
    if (ftsRows.length > 0) {
      return ftsRows.map((r) => ({ ...parseSourceRow(r), score: -r.rank }))
    }
  } catch {
    /* fallback */
  }

  const keywords = extractSearchTerms(queryText, { maxTerms: 12 })
  if (keywords.length === 0) return []
  const conditions: string[] = []
  const params: unknown[] = []
  for (const kw of keywords) {
    const like = `%${kw}%`
    conditions.push('(title LIKE ? OR content LIKE ?)')
    params.push(like, like)
  }
  let sql = `SELECT * FROM wiki_sources WHERE (${conditions.join(' OR ')})`
  if (rawFolderCondition) {
    sql += ` AND ${rawFolderCondition.clause}`
    params.push(...rawFolderCondition.params)
  }
  sql += ' ORDER BY created_at DESC LIMIT ?'
  params.push(Math.max(limit * 4, 50))
  const rows = await query<Record<string, unknown>>(sql, params)
  return rows
    .map((r) => {
      const source = parseSourceRow(r)
      return { ...source, score: scoreSourceMatch(source, keywords) }
    })
    .filter((source) => source.score > 0)
    .sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
}

// ─── 特殊页面 ───

/** 获取或创建 Index 页面 */
export async function getOrCreateIndexPage(): Promise<WikiPage> {
  const rows = await query<Record<string, unknown>>('SELECT * FROM wiki_pages WHERE is_index = 1')
  if (rows.length > 0) return parsePageRow(rows[0])

  const id = await createPage({
    title: 'Index',
    slug: 'index',
    content: '# 知识库索引\n\n所有 Wiki 页面的目录。\n',
    category: 'system',
    isIndex: true,
    importance: 100,
  })
  await run('UPDATE wiki_pages SET is_index = 1 WHERE id = ?', [id])
  return (await getPage(id))!
}

/** 获取或创建 Log 页面 */
export async function getOrCreateLogPage(): Promise<WikiPage> {
  const rows = await query<Record<string, unknown>>('SELECT * FROM wiki_pages WHERE is_log = 1')
  if (rows.length > 0) return parsePageRow(rows[0])

  const id = await createPage({
    title: 'Activity Log',
    slug: 'log',
    content: '# 活动日志\n\n知识库所有操作的记录。\n',
    category: 'system',
    isLog: true,
    importance: 90,
  })
  await run('UPDATE wiki_pages SET is_log = 1 WHERE id = ?', [id])
  return (await getPage(id))!
}

/** 追加日志条目 */
export async function appendToLog(
  action: string,
  targetType: string,
  targetId: string,
  description: string,
  details?: Record<string, unknown>,
): Promise<string> {
  const id = generateId()
  await run(
    `INSERT INTO wiki_activity_log (id, action, target_type, target_id, description, details_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, action, targetType, targetId, description, JSON.stringify(details || {})],
  )
  return id
}

// ─── 统计 ───

/** 获取 Wiki 统计 */
export async function getWikiStats(): Promise<{
  totalPages: number
  totalSources: number
  avgConfidence: number
  avgImportance: number
  topCategories: Array<{ category: string; cnt: number }>
}> {
  const pageCount = await getPageCount()
  const sourceCount = await getSourceCount()
  const confRows = await query<{ avg_conf: number }>('SELECT AVG(confidence) as avg_conf FROM wiki_pages')
  const impRows = await query<{ avg_imp: number }>('SELECT AVG(importance) as avg_imp FROM wiki_pages')
  const catRows = await query<{ category: string; cnt: number }>(
    'SELECT category, COUNT(*) as cnt FROM wiki_pages WHERE is_index = 0 AND is_log = 0 GROUP BY category ORDER BY cnt DESC LIMIT 10',
  )

  return {
    totalPages: pageCount,
    totalSources: sourceCount,
    avgConfidence: confRows[0]?.avg_conf || 0,
    avgImportance: impRows[0]?.avg_imp || 0,
    topCategories: catRows,
  }
}
