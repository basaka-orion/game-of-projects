import { query, run } from '../db/repository'
import type { WikiPage } from './wiki'

export const ALL_FOLDERS_SCOPE = '__all__'
export const ROOT_FOLDER_PATH = '.'
export const UNFILED_FOLDER_PATH = '__unfiled__'

export interface KnowledgeSourceScopeEntry {
  id: string
  folderPath: string
}

export interface KnowledgeFolderOption {
  path: string
  label: string
  displayPath: string
  depth: number
  pageCount: number
  sourceCount: number
}

type FolderBackfillPageRow = {
  id: string
  source_ids: string
  metadata_json: string
}

type FolderBackfillRow = {
  id: string
  folder_path: string
  file_path: string
  metadata_json: string
  source_type?: string
}

let folderBackfillPromise: Promise<void> | null = null

function normalizeSeparators(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+/g, '/').trim()
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '')
}

function isAbsolutePath(value: string): boolean {
  return /^([A-Za-z]:\/|\/)/.test(value)
}

function parseMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    if (!value) continue
    const normalized = normalizeFolderPath(value)
    if (seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function dirnamePath(filePath: string): string {
  const normalized = normalizeSeparators(filePath)
  if (!normalized) return ''
  const parts = normalized.split('/')
  parts.pop()
  if (parts.length === 0) return ''
  if (parts.length === 1 && normalized.startsWith('/')) return '/'
  return parts.join('/')
}

function relativeToRoot(filePath: string, rootPath?: string): string {
  const normalizedFile = normalizeSeparators(filePath)
  const normalizedRoot = rootPath ? normalizeSeparators(rootPath) : ''
  if (!normalizedFile || !normalizedRoot) return normalizedFile
  const rootWithSlash = normalizedRoot.endsWith('/') ? normalizedRoot : `${normalizedRoot}/`
  if (normalizedFile === normalizedRoot) return ''
  if (normalizedFile.startsWith(rootWithSlash)) return normalizedFile.slice(rootWithSlash.length)
  return normalizedFile
}

function normalizeStoredFolderPath(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed === UNFILED_FOLDER_PATH) return UNFILED_FOLDER_PATH
  if (trimmed === ROOT_FOLDER_PATH) return ROOT_FOLDER_PATH
  return normalizeFolderPath(trimmed)
}

function buildAncestors(folderPath: string): string[] {
  if (!folderPath) return []
  if (folderPath === ROOT_FOLDER_PATH || folderPath === UNFILED_FOLDER_PATH) return [folderPath]

  const segments = folderPath.split('/').filter(Boolean)
  const paths: string[] = []
  for (let index = 0; index < segments.length; index += 1) {
    paths.push(segments.slice(0, index + 1).join('/'))
  }
  return paths
}

function commonAncestor(folderPaths: string[]): string {
  const normalized = uniqueStrings(folderPaths)
  if (normalized.length === 0) return ''
  if (normalized.length === 1) return normalized[0]
  if (normalized.some(path => path === UNFILED_FOLDER_PATH)) return ''
  if (normalized.some(path => path === ROOT_FOLDER_PATH)) return ROOT_FOLDER_PATH

  const splitPaths = normalized.map(path => path.split('/'))
  const ancestor: string[] = []
  const minLength = Math.min(...splitPaths.map(parts => parts.length))

  for (let index = 0; index < minLength; index += 1) {
    const segment = splitPaths[0][index]
    if (!segment || splitPaths.some(parts => parts[index] !== segment)) break
    ancestor.push(segment)
  }

  if (ancestor.length === 0) return ''
  return ancestor.join('/')
}

function compareFolderOptions(left: KnowledgeFolderOption, right: KnowledgeFolderOption): number {
  if (left.path === ROOT_FOLDER_PATH && right.path !== ROOT_FOLDER_PATH) return -1
  if (right.path === ROOT_FOLDER_PATH && left.path !== ROOT_FOLDER_PATH) return 1
  if (left.path === UNFILED_FOLDER_PATH && right.path !== UNFILED_FOLDER_PATH) return 1
  if (right.path === UNFILED_FOLDER_PATH && left.path !== UNFILED_FOLDER_PATH) return -1

  const depthDiff = left.depth - right.depth
  if (depthDiff !== 0) return depthDiff
  return left.displayPath.localeCompare(right.displayPath, 'zh-Hans-CN', { numeric: true })
}

export function normalizeFolderPath(folderPath: string): string {
  const normalized = trimSlashes(normalizeSeparators(folderPath))
  return normalized || ROOT_FOLDER_PATH
}

export function deriveFolderPath(params: {
  folderPath?: string
  filePath?: string
  rootPath?: string
  sourceType?: string
}): string {
  const explicitFolderPath = normalizeStoredFolderPath(params.folderPath)
  if (explicitFolderPath) return explicitFolderPath

  if (params.filePath) {
    const relativeFilePath = relativeToRoot(params.filePath, params.rootPath)
    const parentPath = dirnamePath(relativeFilePath)
    return normalizeFolderPath(parentPath)
  }

  if (params.sourceType === 'file') return ROOT_FOLDER_PATH
  return UNFILED_FOLDER_PATH
}

export function getFolderLabel(folderPath: string): string {
  if (folderPath === ROOT_FOLDER_PATH) return '根目录'
  if (folderPath === UNFILED_FOLDER_PATH) return '未分组'
  const segments = folderPath.split('/').filter(Boolean)
  return segments[segments.length - 1] || folderPath
}

export function getFolderDisplayPath(folderPath: string): string {
  if (folderPath === ROOT_FOLDER_PATH) return '根目录'
  if (folderPath === UNFILED_FOLDER_PATH) return '未分组'
  return folderPath
}

export async function renameKnowledgeFolderPath(oldPath: string, nextPath: string): Promise<{ sources: number; pages: number }> {
  const from = normalizeFolderPath(oldPath)
  const to = normalizeFolderPath(nextPath)
  if (!from || !to || from === to || from === ALL_FOLDERS_SCOPE) return { sources: 0, pages: 0 }

  const sourceRows = await query<{ id: string; folder_path: string; metadata_json: string }>(
    'SELECT id, folder_path, metadata_json FROM wiki_sources WHERE folder_path = ? OR folder_path LIKE ?',
    [from, `${from}/%`],
  )
  const pageRows = await query<{ id: string; folder_path: string; metadata_json: string }>(
    'SELECT id, folder_path, metadata_json FROM wiki_pages WHERE folder_path = ? OR folder_path LIKE ?',
    [from, `${from}/%`],
  )

  for (const row of sourceRows) {
    const folderPath = replaceFolderPrefix(row.folder_path, from, to)
    const metadata = parseMetadata(row.metadata_json)
    if (typeof metadata.folderPath === 'string') metadata.folderPath = folderPath
    await run("UPDATE wiki_sources SET folder_path = ?, metadata_json = ?, updated_at = datetime('now','localtime') WHERE id = ?", [
      folderPath,
      JSON.stringify(metadata),
      row.id,
    ])
  }

  for (const row of pageRows) {
    const folderPath = replaceFolderPrefix(row.folder_path, from, to)
    const metadata = parseMetadata(row.metadata_json)
    if (typeof metadata.folderPath === 'string') metadata.folderPath = folderPath
    await run("UPDATE wiki_pages SET folder_path = ?, metadata_json = ?, updated_at = datetime('now','localtime') WHERE id = ?", [
      folderPath,
      JSON.stringify(metadata),
      row.id,
    ])
  }

  return { sources: sourceRows.length, pages: pageRows.length }
}

function replaceFolderPrefix(value: string, from: string, to: string): string {
  const normalized = normalizeFolderPath(value)
  if (normalized === from) return to
  if (normalized.startsWith(`${from}/`)) return `${to}${normalized.slice(from.length)}`
  return normalized
}

export function buildFolderScopeCondition(
  column: string,
  scopePath?: string | null,
  options: { includeLegacyBlank?: boolean } = {},
): { clause: string; params: string[] } | null {
  if (!scopePath || scopePath === ALL_FOLDERS_SCOPE) return null

  let clause: string
  let params: string[]

  if (scopePath === ROOT_FOLDER_PATH || scopePath === UNFILED_FOLDER_PATH) {
    clause = `${column} = ?`
    params = [scopePath]
  } else {
    clause = `(${column} = ? OR ${column} LIKE ?)`
    params = [scopePath, `${scopePath}/%`]
  }

  if (options.includeLegacyBlank) {
    clause = `(${clause} OR ${column} = '' OR ${column} IS NULL)`
  }

  return { clause, params }
}

export function isFolderPathInScope(folderPath: string | undefined, scopePath?: string | null): boolean {
  if (!scopePath || scopePath === ALL_FOLDERS_SCOPE) return true
  const normalizedFolderPath = normalizeStoredFolderPath(folderPath) || UNFILED_FOLDER_PATH

  if (scopePath === ROOT_FOLDER_PATH || scopePath === UNFILED_FOLDER_PATH) {
    return normalizedFolderPath === scopePath
  }

  return normalizedFolderPath === scopePath || normalizedFolderPath.startsWith(`${scopePath}/`)
}

export function getPageFolderPaths(
  page: Pick<WikiPage, 'folderPath' | 'sourceIds' | 'metadata'>,
  sourceFolderMap?: Map<string, string>,
): string[] {
  const metadata = page.metadata || {}
  const metadataFolderPaths = Array.isArray(metadata.folderPaths)
    ? metadata.folderPaths.filter((value): value is string => typeof value === 'string')
    : []
  const metadataFolderPath = typeof metadata.folderPath === 'string' ? metadata.folderPath : ''
  const sourceFolderPaths = sourceFolderMap
    ? page.sourceIds.map(sourceId => sourceFolderMap.get(sourceId) || '')
    : []

  return uniqueStrings([
    page.folderPath,
    metadataFolderPath,
    ...metadataFolderPaths,
    ...sourceFolderPaths,
  ])
}

export function pageMatchesFolderScope(
  page: Pick<WikiPage, 'folderPath' | 'sourceIds' | 'metadata'>,
  scopePath?: string | null,
  sourceFolderMap?: Map<string, string>,
): boolean {
  if (!scopePath || scopePath === ALL_FOLDERS_SCOPE) return true
  const folderPaths = getPageFolderPaths(page, sourceFolderMap)
  if (folderPaths.length === 0) return scopePath === UNFILED_FOLDER_PATH
  return folderPaths.some(folderPath => isFolderPathInScope(folderPath, scopePath))
}

export function buildKnowledgeFolderOptions(params: {
  sourceEntries: KnowledgeSourceScopeEntry[]
  pages: WikiPage[]
  sourceFolderMap: Map<string, string>
}): KnowledgeFolderOption[] {
  const { sourceEntries, pages, sourceFolderMap } = params
  const allFolderPaths = new Set<string>()

  for (const entry of sourceEntries) {
    for (const ancestor of buildAncestors(entry.folderPath)) {
      allFolderPaths.add(ancestor)
    }
  }

  for (const page of pages) {
    for (const folderPath of getPageFolderPaths(page, sourceFolderMap)) {
      for (const ancestor of buildAncestors(folderPath)) {
        allFolderPaths.add(ancestor)
      }
    }
  }

  return Array.from(allFolderPaths)
    .map(path => ({
      path,
      label: getFolderLabel(path),
      displayPath: getFolderDisplayPath(path),
      depth: path === ROOT_FOLDER_PATH || path === UNFILED_FOLDER_PATH ? 0 : path.split('/').length - 1,
      pageCount: pages.reduce((count, page) => count + (pageMatchesFolderScope(page, path, sourceFolderMap) ? 1 : 0), 0),
      sourceCount: sourceEntries.reduce((count, entry) => count + (isFolderPathInScope(entry.folderPath, path) ? 1 : 0), 0),
    }))
    .sort(compareFolderOptions)
}

export async function loadKnowledgeSourceScopeEntries(sourceIds?: string[]): Promise<KnowledgeSourceScopeEntry[]> {
  const normalizedIds = Array.isArray(sourceIds)
    ? Array.from(new Set(sourceIds.map(id => id.trim()).filter(Boolean)))
    : []

  let sql = 'SELECT id, folder_path, file_path, metadata_json, source_type FROM wiki_sources'
  const params: string[] = []

  if (normalizedIds.length > 0) {
    const placeholders = normalizedIds.map(() => '?').join(', ')
    sql += ` WHERE id IN (${placeholders})`
    params.push(...normalizedIds)
  }

  const rows = await query<FolderBackfillRow>(sql, params)
  return rows.map(row => {
    const metadata = parseMetadata(row.metadata_json)
    return {
      id: row.id,
      folderPath: deriveFolderPath({
        folderPath: row.folder_path || (typeof metadata.folderPath === 'string' ? metadata.folderPath : ''),
        filePath: row.file_path,
        rootPath: typeof metadata.rootPath === 'string' ? metadata.rootPath : undefined,
        sourceType: row.source_type,
      }),
    }
  })
}

async function backfillSourceFolders(): Promise<void> {
  const rows = await query<FolderBackfillRow>(
    `SELECT id, folder_path, file_path, metadata_json, source_type
     FROM wiki_sources
     WHERE folder_path = '' OR folder_path IS NULL`,
  )

  for (const row of rows) {
    const metadata = parseMetadata(row.metadata_json)
    const folderPath = deriveFolderPath({
      folderPath: typeof metadata.folderPath === 'string' ? metadata.folderPath : row.folder_path,
      filePath: row.file_path,
      rootPath: typeof metadata.rootPath === 'string' ? metadata.rootPath : undefined,
      sourceType: row.source_type,
    })

    await run(
      'UPDATE wiki_sources SET folder_path = ?, metadata_json = ? WHERE id = ?',
      [folderPath, JSON.stringify({ ...metadata, folderPath }), row.id],
    )
  }
}

async function backfillDrawerFolders(): Promise<void> {
  const rows = await query<FolderBackfillRow>(
    `SELECT id, folder_path, file_path, metadata_json, source_type
     FROM mempalace_drawers
     WHERE folder_path = '' OR folder_path IS NULL`,
  )

  for (const row of rows) {
    const metadata = parseMetadata(row.metadata_json)
    const folderPath = deriveFolderPath({
      folderPath: typeof metadata.folderPath === 'string' ? metadata.folderPath : row.folder_path,
      filePath: row.file_path,
      rootPath: typeof metadata.rootPath === 'string' ? metadata.rootPath : undefined,
      sourceType: row.source_type,
    })

    await run(
      'UPDATE mempalace_drawers SET folder_path = ?, metadata_json = ? WHERE id = ?',
      [folderPath, JSON.stringify({ ...metadata, folderPath }), row.id],
    )
  }
}

async function backfillPageFolders(): Promise<void> {
  const rows = await query<FolderBackfillPageRow>(
    `SELECT id, source_ids, metadata_json
     FROM wiki_pages
     WHERE folder_path = '' OR folder_path IS NULL`,
  )

  if (rows.length === 0) return

  const sourceIds = uniqueStrings(
    rows.flatMap(row => {
      try {
        const parsed = JSON.parse(row.source_ids || '[]')
        return Array.isArray(parsed) ? parsed.map(value => String(value)) : []
      } catch {
        return []
      }
    }),
  )
  const sourceEntries = await loadKnowledgeSourceScopeEntries(sourceIds)
  const sourceFolderMap = new Map(sourceEntries.map(entry => [entry.id, entry.folderPath]))

  for (const row of rows) {
    const metadata = parseMetadata(row.metadata_json)
    const pageSourceIds = (() => {
      try {
        const parsed = JSON.parse(row.source_ids || '[]')
        return Array.isArray(parsed) ? parsed.map(value => String(value)) : []
      } catch {
        return []
      }
    })()
    const derivedFolderPaths = uniqueStrings(pageSourceIds.map(sourceId => sourceFolderMap.get(sourceId) || ''))
    const metadataFolderPaths = Array.isArray(metadata.folderPaths)
      ? metadata.folderPaths.filter((value): value is string => typeof value === 'string')
      : []
    const allFolderPaths = uniqueStrings([
      typeof metadata.folderPath === 'string' ? metadata.folderPath : '',
      ...metadataFolderPaths,
      ...derivedFolderPaths,
    ])
    const folderPath = commonAncestor(allFolderPaths) || (allFolderPaths.length === 1 ? allFolderPaths[0] : '')
    const nextMetadata = { ...metadata }

    if (allFolderPaths.length > 0) nextMetadata.folderPaths = allFolderPaths
    if (folderPath) nextMetadata.folderPath = folderPath

    await run(
      'UPDATE wiki_pages SET folder_path = ?, metadata_json = ? WHERE id = ?',
      [folderPath, JSON.stringify(nextMetadata), row.id],
    )
  }
}

async function backfillChunkFolders(): Promise<void> {
  await run(
    `UPDATE wiki_chunks
     SET folder_path = COALESCE(
       NULLIF((SELECT folder_path FROM wiki_pages WHERE wiki_pages.id = wiki_chunks.page_id), ''),
       NULLIF((SELECT folder_path FROM wiki_sources WHERE wiki_sources.id = wiki_chunks.source_id), ''),
       NULLIF((SELECT folder_path FROM mempalace_drawers WHERE mempalace_drawers.id = wiki_chunks.drawer_id), ''),
       ?
     )
     WHERE folder_path = '' OR folder_path IS NULL`,
    [UNFILED_FOLDER_PATH],
  )
}

export async function ensureKnowledgeFolderMetadata(): Promise<void> {
  if (!folderBackfillPromise) {
    folderBackfillPromise = (async () => {
      await backfillSourceFolders()
      await backfillDrawerFolders()
      await backfillPageFolders()
      await backfillChunkFolders()
    })().catch(err => {
      console.warn('[knowledge-folders] backfill failed:', err)
    })
  }

  await folderBackfillPromise
}
