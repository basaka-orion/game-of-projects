import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { chunkText } from '../src/lib/knowledge/chunker.ts'
import {
  DEFAULT_CORPUS_PATH,
  buildCorpusEntries,
  buildPilot,
  readQimengDocument,
  type CorpusEntry,
  type QimengDocument,
} from './qimeng-corpus.ts'

const REPORT_DIR = path.resolve('docs/qimeng-imports')
const LATEST_JSON_PATH = path.join(REPORT_DIR, 'latest-pilot.json')
const LATEST_MD_PATH = path.join(REPORT_DIR, 'latest-pilot.md')

interface ImportArgs {
  corpusPath: string
  apply: boolean
  limit: number
  offset: number
  noBackup: boolean
}

interface ImportRecord {
  filePath: string
  relativePath: string
  title: string
  wing: string
  hall: string
  room: string
  folderPath: string
  status: 'imported' | 'skipped' | 'error'
  reason: string
  sourceId: string
  drawerId: string
  chunkIds: string[]
}

function parseArgs(): ImportArgs {
  const args = process.argv.slice(2)
  let pathArg = ''
  let limitValue = 0
  let offsetValue = 0

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--limit') {
      limitValue = Number(args[index + 1] || 0)
      index += 1
      continue
    }
    if (arg === '--offset') {
      offsetValue = Number(args[index + 1] || 0)
      index += 1
      continue
    }
    if (arg.startsWith('--')) continue
    if (!pathArg) pathArg = arg
  }

  return {
    corpusPath: pathArg ? path.resolve(pathArg) : DEFAULT_CORPUS_PATH,
    apply: args.includes('--apply'),
    limit: Number.isFinite(limitValue) && limitValue > 0 ? limitValue : 0,
    offset: Number.isFinite(offsetValue) && offsetValue > 0 ? offsetValue : 0,
    noBackup: args.includes('--no-backup'),
  }
}

function deriveCorpusFolderPath(filePath: string, corpusPath: string): string {
  const relativePath = path.relative(corpusPath, filePath).replace(/\\/g, '/')
  const folderPath = path.posix.dirname(relativePath)
  return folderPath && folderPath !== '.' ? folderPath : '.'
}

function generateId(): string {
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function buildTimestampSlug(date: Date): string {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[:]/g, '-')
}

function openWritableDatabase() {
  const dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'game-of-projects', 'game-of-projects.db')
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON')
  return { dbPath, db }
}

function findExistingImport(db: DatabaseSync, filePath: string): { drawerId: string; sourceId: string } | null {
  const row = db.prepare(`
    SELECT
      COALESCE((SELECT id FROM mempalace_drawers WHERE file_path = ? ORDER BY created_at DESC LIMIT 1), '') AS drawer_id,
      COALESCE((SELECT id FROM wiki_sources WHERE file_path = ? ORDER BY created_at DESC LIMIT 1), '') AS source_id
  `).get(filePath, filePath) as { drawer_id?: string; source_id?: string }

  const drawerId = row.drawer_id || ''
  const sourceId = row.source_id || ''
  if (!drawerId && !sourceId) return null
  return { drawerId, sourceId }
}

async function maybeBackupDatabase(dbPath: string, sessionId: string, disabled: boolean): Promise<string> {
  if (disabled) return ''
  const backupPath = path.join(path.dirname(dbPath), `${path.basename(dbPath, '.db')}.${sessionId}.bak.db`)
  await fs.copyFile(dbPath, backupPath)
  return backupPath
}

function buildMetadata(doc: QimengDocument, sessionId: string, corpusPath: string, folderPath: string, sourceId: string, drawerId: string) {
  return {
    importSessionId: sessionId,
    importScope: 'qimeng-pilot',
    corpusPath,
    relativePath: doc.relativePath,
    folderPath,
    sourceId,
    drawerId,
    qimeng: {
      wing: doc.classification.wing,
      hall: doc.classification.hall,
      room: doc.classification.room,
      facets: doc.classification.facets,
      rationale: doc.classification.rationale,
      confidence: doc.classification.confidence,
      matchedSignals: doc.classification.matchedSignals,
    },
    exportedWiki: {
      slug: doc.slug,
      sourceDrawers: Array.isArray(doc.exportBlock.source_drawers) ? doc.exportBlock.source_drawers : [],
      updated: typeof doc.exportBlock.updated === 'string' ? doc.exportBlock.updated : '',
    },
    appleNotes: {
      source: doc.source,
      noteId: doc.noteId,
      folder: doc.folder,
      created: doc.created,
      modified: doc.modified,
    },
  }
}

function insertSource(db: DatabaseSync, doc: QimengDocument, sessionId: string, corpusPath: string, sourceId: string, drawerId: string, folderPath: string) {
  const metadata = buildMetadata(doc, sessionId, corpusPath, folderPath, sourceId, drawerId)
  db.prepare(`
    INSERT INTO wiki_sources
      (id, title, source_type, content, raw_content, url, file_path, folder_path, author, language,
       frontmatter_json, tags, status, error_message, template_id, metadata_json)
    VALUES
      (?, ?, 'file', ?, ?, '', ?, ?, ?, 'zh', ?, ?, 'processed', '', '', ?)
  `).run(
    sourceId,
    doc.title || '无标题',
    doc.body,
    doc.rawContent,
    doc.filePath,
    folderPath,
    doc.source || '',
    JSON.stringify(doc.sourceBlock || {}),
    JSON.stringify(doc.tags),
    JSON.stringify(metadata),
  )
}

function insertDrawer(db: DatabaseSync, doc: QimengDocument, sessionId: string, corpusPath: string, sourceId: string, drawerId: string, folderPath: string) {
  const metadata = buildMetadata(doc, sessionId, corpusPath, folderPath, sourceId, drawerId)
  db.prepare(`
    INSERT INTO mempalace_drawers
      (id, title, wing, hall, room, raw_content, source_type, source_url, file_path, folder_path,
       author, language, tags, is_compiled, compiled_page_id, metadata_json, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, 'file', '', ?, ?, ?, 'zh', ?, 0, '', ?, datetime('now','localtime'), datetime('now','localtime'))
  `).run(
    drawerId,
    doc.title || '无标题',
    doc.classification.wing,
    doc.classification.hall,
    doc.classification.room,
    doc.rawContent,
    doc.filePath,
    folderPath,
    doc.source || '',
    JSON.stringify(doc.tags),
    JSON.stringify(metadata),
  )
}

function insertChunks(db: DatabaseSync, doc: QimengDocument, sessionId: string, sourceId: string, drawerId: string, folderPath: string): string[] {
  const chunks = chunkText(doc.body, doc.title)
  const insertChunk = db.prepare(`
    INSERT INTO wiki_chunks
      (id, source_id, drawer_id, folder_path, chunk_index, content, token_count, header_breadcrumb, overlap_prev, overlap_next, metadata_json, created_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
  `)

  const chunkIds: string[] = []
  for (const chunk of chunks) {
    const chunkId = generateId()
    chunkIds.push(chunkId)
    insertChunk.run(
      chunkId,
      sourceId,
      drawerId,
      folderPath,
      chunk.index,
      chunk.content,
      chunk.tokenCount,
      chunk.headerBreadcrumb,
      chunk.overlapPrev,
      chunk.overlapNext,
      JSON.stringify({
        importSessionId: sessionId,
        importScope: 'qimeng-pilot',
      }),
    )
  }

  return chunkIds
}

function appendActivityLog(db: DatabaseSync, record: ImportRecord, sessionId: string) {
  db.prepare(`
    INSERT INTO wiki_activity_log
      (id, action, target_type, target_id, description, details_json, created_at)
    VALUES
      (?, 'ingest', 'source', ?, ?, ?, datetime('now','localtime'))
  `).run(
    generateId(),
    record.sourceId,
    `启蒙 pilot → ${record.title}`,
    JSON.stringify({
      importSessionId: sessionId,
      drawerId: record.drawerId,
      filePath: record.filePath,
      relativePath: record.relativePath,
      wing: record.wing,
      hall: record.hall,
      room: record.room,
      chunkCount: record.chunkIds.length,
    }),
  )
}

async function importOne(db: DatabaseSync, doc: QimengDocument, sessionId: string, corpusPath: string, apply: boolean): Promise<ImportRecord> {
  const folderPath = deriveCorpusFolderPath(doc.filePath, corpusPath)

  const existing = findExistingImport(db, doc.filePath)
  if (existing) {
    return {
      filePath: doc.filePath,
      relativePath: doc.relativePath,
      title: doc.title,
      wing: doc.classification.wing,
      hall: doc.classification.hall,
      room: doc.classification.room,
      folderPath,
      status: 'skipped',
      reason: '已存在同 file_path 的 source 或 drawer',
      sourceId: existing.sourceId,
      drawerId: existing.drawerId,
      chunkIds: [],
    }
  }

  if (!apply) {
    return {
      filePath: doc.filePath,
      relativePath: doc.relativePath,
      title: doc.title,
      wing: doc.classification.wing,
      hall: doc.classification.hall,
      room: doc.classification.room,
      folderPath,
      status: 'imported',
      reason: 'dry-run 预演通过',
      sourceId: '',
      drawerId: '',
      chunkIds: [],
    }
  }

  const sourceId = generateId()
  const drawerId = generateId()

  insertSource(db, doc, sessionId, corpusPath, sourceId, drawerId, folderPath)
  insertDrawer(db, doc, sessionId, corpusPath, sourceId, drawerId, folderPath)
  const chunkIds = insertChunks(db, doc, sessionId, sourceId, drawerId, folderPath)

  const record: ImportRecord = {
    filePath: doc.filePath,
    relativePath: doc.relativePath,
    title: doc.title,
    wing: doc.classification.wing,
    hall: doc.classification.hall,
    room: doc.classification.room,
    folderPath,
    status: 'imported',
    reason: '已写入 source / drawer / chunks',
    sourceId,
    drawerId,
    chunkIds,
  }
  appendActivityLog(db, record, sessionId)
  return record
}

function renderMarkdownReport(params: {
  startedAt: Date
  sessionId: string
  corpusPath: string
  apply: boolean
  limit: number
  backupPath: string
  records: ImportRecord[]
}) {
  const imported = params.records.filter(item => item.status === 'imported')
  const skipped = params.records.filter(item => item.status === 'skipped')
  const errors = params.records.filter(item => item.status === 'error')
  const chunkCount = imported.reduce((sum, item) => sum + item.chunkIds.length, 0)

  const sampleLines = params.records
    .slice(0, 20)
    .map(item => `- [${item.status}] ${item.title} -> ${item.wing} / ${item.hall} / ${item.room}`)

  return [
    '# 《启蒙》Pilot Import 报告',
    '',
    `- 时间：${params.startedAt.toLocaleString('zh-CN', { hour12: false })}`,
    `- sessionId：\`${params.sessionId}\``,
    `- 模式：${params.apply ? 'apply' : 'dry-run'}`,
    `- 语料路径：\`${params.corpusPath}\``,
    `- 批次大小：${params.limit || params.records.length}`,
    `- 数据库备份：${params.backupPath ? `\`${params.backupPath}\`` : '未生成'}`,
    '',
    '## 结果',
    `- imported：${imported.length}`,
    `- skipped：${skipped.length}`,
    `- error：${errors.length}`,
    `- 新增 chunks：${chunkCount}`,
    '',
    '## 样例',
    ...sampleLines,
    '',
  ].join('\n')
}

async function writeReports(payload: Record<string, unknown>, markdown: string, timestampSlug: string) {
  await fs.mkdir(REPORT_DIR, { recursive: true })
  const jsonPath = path.join(REPORT_DIR, `${timestampSlug}-pilot.json`)
  const mdPath = path.join(REPORT_DIR, `${timestampSlug}-pilot.md`)
  const serialized = JSON.stringify(payload, null, 2)

  await fs.writeFile(jsonPath, serialized, 'utf8')
  await fs.writeFile(mdPath, markdown, 'utf8')
  await fs.writeFile(LATEST_JSON_PATH, serialized, 'utf8')
  await fs.writeFile(LATEST_MD_PATH, markdown, 'utf8')

  return { jsonPath, mdPath }
}

async function main() {
  const args = parseArgs()
  const startedAt = new Date()
  const timestampSlug = buildTimestampSlug(startedAt)
  const sessionId = `qimeng-pilot-${timestampSlug}`
  const corpusEntries = await buildCorpusEntries(args.corpusPath)
  const allPilotEntries = buildPilot(corpusEntries) as CorpusEntry[]
  const pilotEntries = (
    args.limit > 0
      ? allPilotEntries.slice(args.offset, args.offset + args.limit)
      : allPilotEntries.slice(args.offset)
  ) as CorpusEntry[]
  const { dbPath, db } = openWritableDatabase()
  const records: ImportRecord[] = []
  let backupPath = ''

  try {
    if (args.apply) {
      backupPath = await maybeBackupDatabase(dbPath, sessionId, args.noBackup)
      db.exec('BEGIN')
    }

    for (let index = 0; index < pilotEntries.length; index += 1) {
      const entry = pilotEntries[index]
      if ((index + 1) === 1 || (index + 1) % 6 === 0 || (index + 1) === pilotEntries.length) {
        console.error(`[qimeng:pilot] ${index + 1}/${pilotEntries.length} ${entry.relativePath}`)
      }

      try {
        const doc = await readQimengDocument(args.corpusPath, entry.filePath)
        const record = await importOne(db, doc, sessionId, args.corpusPath, args.apply)
        records.push(record)
      } catch (error) {
        records.push({
          filePath: entry.filePath,
          relativePath: entry.relativePath,
          title: entry.title,
          wing: entry.classification.wing,
          hall: entry.classification.hall,
          room: entry.classification.room,
          folderPath: '.',
          status: 'error',
          reason: String(error),
          sourceId: '',
          drawerId: '',
          chunkIds: [],
        })
      }
    }

    if (args.apply) {
      const failed = records.filter(item => item.status === 'error')
      if (failed.length > 0) {
        db.exec('ROLLBACK')
      } else {
        db.exec('COMMIT')
      }
    }
  } catch (error) {
    if (args.apply) {
      try { db.exec('ROLLBACK') } catch { /* noop */ }
    }
    throw error
  } finally {
    db.close()
  }

  const payload = {
    sessionId,
    generatedAt: startedAt.toISOString(),
    mode: args.apply ? 'apply' : 'dry-run',
    corpusPath: args.corpusPath,
    databasePath: dbPath,
    backupPath,
    offset: args.offset,
    requestedLimit: args.limit || null,
    totals: {
      scanned: pilotEntries.length,
      imported: records.filter(item => item.status === 'imported').length,
      skipped: records.filter(item => item.status === 'skipped').length,
      errors: records.filter(item => item.status === 'error').length,
      chunkCount: records.reduce((sum, item) => sum + item.chunkIds.length, 0),
    },
    records,
  }
  const markdown = renderMarkdownReport({
    startedAt,
    sessionId,
    corpusPath: args.corpusPath,
    apply: args.apply,
    limit: args.limit,
    backupPath,
    records,
  })
  const reportPaths = await writeReports(payload, markdown, timestampSlug)

  console.log(JSON.stringify({
    sessionId,
    mode: args.apply ? 'apply' : 'dry-run',
    corpusPath: args.corpusPath,
    databasePath: dbPath,
    backupPath,
    offset: args.offset,
    totals: payload.totals,
    report: reportPaths.mdPath,
    json: reportPaths.jsonPath,
  }, null, 2))
  process.exit(0)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
