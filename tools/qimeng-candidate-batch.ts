import fs from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  DEFAULT_CORPUS_PATH,
  buildCorpusEntries,
  readQimengDocument,
  type CorpusEntry,
  type QimengDocument,
} from './qimeng-corpus.ts'

const CANDIDATE_CONVERSATION_ID = 'qimeng-corpus'
const CANDIDATE_SOURCE_SURFACE = 'qimeng-corpus'
const DEFAULT_BATCH_LIMIT = 120
const REPORT_DIR = path.resolve('docs/qimeng-candidates')
const LATEST_JSON_PATH = path.join(REPORT_DIR, 'latest-batch.json')
const LATEST_MD_PATH = path.join(REPORT_DIR, 'latest-batch.md')

interface CandidateArgs {
  corpusPath: string
  apply: boolean
  limit: number
  offset: number
}

interface CandidateRecord {
  filePath: string
  relativePath: string
  title: string
  wing: string
  hall: string
  room: string
  status: 'created' | 'updated' | 'skipped' | 'error'
  reason: string
  candidateId: string
}

type ExistingCandidateRow = {
  id: string
  status: string
  title: string
  suggested_wing: string
  suggested_hall: string
  suggested_room: string
  suggested_tags: string
  suggested_facets: string
  rationale: string
  metadata_json: string
}

function parseArgs(): CandidateArgs {
  const args = process.argv.slice(2)
  let pathArg = ''
  let limitValue = DEFAULT_BATCH_LIMIT
  let offsetValue = 0

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--limit') {
      limitValue = Number(args[index + 1] || DEFAULT_BATCH_LIMIT)
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
    limit: Number.isFinite(limitValue) && limitValue > 0 ? limitValue : DEFAULT_BATCH_LIMIT,
    offset: Number.isFinite(offsetValue) && offsetValue > 0 ? offsetValue : 0,
  }
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
  const dbPath = path.join(process.env.HOME || '', 'Library', 'Application Support', 'game-of-projects', 'game-of-projects.db')
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON')
  return { dbPath, db }
}

function safeObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function findExistingImport(db: DatabaseSync, filePath: string): string {
  const row = db.prepare(`
    SELECT COALESCE((SELECT id FROM mempalace_drawers WHERE file_path = ? ORDER BY updated_at DESC LIMIT 1), '') AS drawer_id
  `).get(filePath) as { drawer_id?: string }

  return row.drawer_id || ''
}

function findExistingCandidate(db: DatabaseSync, relativePath: string): ExistingCandidateRow | null {
  const row = db.prepare(`
    SELECT *
      FROM archive_candidates
     WHERE conversation_id = ?
       AND message_id = ?
     LIMIT 1
  `).get(CANDIDATE_CONVERSATION_ID, relativePath) as ExistingCandidateRow | undefined

  return row || null
}

function buildSourcePointer(relativePath: string): string {
  return `启蒙语料 · 文件 ${relativePath}`
}

function getSourceTimestamp(doc: QimengDocument): string {
  return doc.modified || doc.created || new Date().toISOString()
}

function buildMetadata(doc: QimengDocument, sessionId: string, corpusPath: string): Record<string, unknown> {
  const relativeDirectory = path.posix.dirname(doc.relativePath)
  const baseMetadata = {
    sourceSurface: CANDIDATE_SOURCE_SURFACE,
    batchSessionId: sessionId,
    candidateType: 'qimeng-corpus',
    corpusPath,
    filePath: doc.filePath,
    relativePath: doc.relativePath,
    relativeDirectory: relativeDirectory && relativeDirectory !== '.' ? relativeDirectory : '.',
    sourceAuthor: doc.source || 'unknown',
    sourceTimestamp: getSourceTimestamp(doc),
    noteId: doc.noteId,
    folder: doc.folder,
    created: doc.created,
    modified: doc.modified,
    slug: doc.slug,
    exportedWikiLike: Boolean(doc.slug || doc.exportBlock.updated || (Array.isArray(doc.exportBlock.source_drawers) && doc.exportBlock.source_drawers.length > 0)),
    suggestedClassification: {
      wing: doc.classification.wing,
      hall: doc.classification.hall,
      room: doc.classification.room,
      tags: doc.classification.tags,
      facets: doc.classification.facets,
      rationale: doc.classification.rationale,
      confidence: doc.classification.confidence,
      matchedSignals: doc.classification.matchedSignals,
    },
  }

  return {
    ...baseMetadata,
    sourcePointer: buildSourcePointer(doc.relativePath),
    notesFallbackRecovered: doc.notesFallbackRecovered,
    notesFallbackLookupPk: doc.notesFallbackLookupPk,
  }
}

function upsertCandidate(db: DatabaseSync, doc: QimengDocument, sessionId: string, corpusPath: string, apply: boolean): CandidateRecord {
  const existingImportDrawerId = findExistingImport(db, doc.filePath)
  if (existingImportDrawerId) {
    return {
      filePath: doc.filePath,
      relativePath: doc.relativePath,
      title: doc.title,
      wing: doc.classification.wing,
      hall: doc.classification.hall,
      room: doc.classification.room,
      status: 'skipped',
      reason: `已存在 drawer ${existingImportDrawerId}`,
      candidateId: '',
    }
  }

  const existing = findExistingCandidate(db, doc.relativePath)
  if (existing && existing.status === 'archived') {
    return {
      filePath: doc.filePath,
      relativePath: doc.relativePath,
      title: doc.title,
      wing: doc.classification.wing,
      hall: doc.classification.hall,
      room: doc.classification.room,
      status: 'skipped',
      reason: '已归档候选，保留既有结果',
      candidateId: existing.id,
    }
  }

  if (existing && existing.status === 'dismissed') {
    return {
      filePath: doc.filePath,
      relativePath: doc.relativePath,
      title: doc.title,
      wing: doc.classification.wing,
      hall: doc.classification.hall,
      room: doc.classification.room,
      status: 'skipped',
      reason: '已被人工丢弃，保留既有裁决',
      candidateId: existing.id,
    }
  }

  const metadata = buildMetadata(doc, sessionId, corpusPath)
  const preserveManualEdits = existing
    ? Boolean((safeObject(existing.metadata_json).customized) || (safeObject(existing.metadata_json).userEditedAt))
    : false

  if (!apply) {
    return {
      filePath: doc.filePath,
      relativePath: doc.relativePath,
      title: doc.title,
      wing: doc.classification.wing,
      hall: doc.classification.hall,
      room: doc.classification.room,
      status: existing ? 'updated' : 'created',
      reason: doc.notesFallbackRecovered ? 'dry-run 预演通过（Apple Notes 回填正文）' : 'dry-run 预演通过',
      candidateId: existing?.id || '',
    }
  }

  if (existing) {
    const existingMetadata = safeObject(existing.metadata_json)
    const nextMetadata = {
      ...existingMetadata,
      ...metadata,
    }

    db.prepare(`
      UPDATE archive_candidates
         SET content = ?,
             message_role = 'system',
             agent_role = 'qimeng-importer',
             title = ?,
             suggested_wing = ?,
             suggested_hall = ?,
             suggested_room = ?,
             suggested_tags = ?,
             suggested_facets = ?,
             rationale = ?,
             metadata_json = ?,
             updated_at = datetime('now','localtime')
       WHERE id = ?
    `).run(
      doc.body,
      preserveManualEdits ? existing.title : doc.title,
      preserveManualEdits ? existing.suggested_wing : doc.classification.wing,
      preserveManualEdits ? existing.suggested_hall : doc.classification.hall,
      preserveManualEdits ? existing.suggested_room : doc.classification.room,
      preserveManualEdits ? existing.suggested_tags : JSON.stringify(doc.tags),
      preserveManualEdits ? existing.suggested_facets : JSON.stringify(doc.classification.facets),
      preserveManualEdits ? existing.rationale : doc.classification.rationale,
      JSON.stringify(nextMetadata),
      existing.id,
    )

    return {
      filePath: doc.filePath,
      relativePath: doc.relativePath,
      title: doc.title,
      wing: doc.classification.wing,
      hall: doc.classification.hall,
      room: doc.classification.room,
      status: 'updated',
      reason: preserveManualEdits
        ? '已刷新内容并保留人工微调'
        : (doc.notesFallbackRecovered ? '已通过 Apple Notes 回填正文并刷新候选建议' : '已刷新候选建议'),
      candidateId: existing.id,
    }
  }

  const candidateId = generateId()
  db.prepare(`
    INSERT INTO archive_candidates
      (id, conversation_id, message_id, message_role, content, source_surface, agent_role,
       title, suggested_wing, suggested_hall, suggested_room, suggested_tags, suggested_facets,
       rationale, status, archived_drawer_id, metadata_json, created_at, updated_at)
    VALUES
      (?, ?, ?, 'system', ?, ?, 'qimeng-importer', ?, ?, ?, ?, ?, ?, ?, 'pending', '', ?, datetime('now','localtime'), datetime('now','localtime'))
  `).run(
    candidateId,
    CANDIDATE_CONVERSATION_ID,
    doc.relativePath,
    doc.body,
    CANDIDATE_SOURCE_SURFACE,
    doc.title,
    doc.classification.wing,
    doc.classification.hall,
    doc.classification.room,
    JSON.stringify(doc.tags),
    JSON.stringify(doc.classification.facets),
    doc.classification.rationale,
    JSON.stringify(metadata),
  )

  return {
    filePath: doc.filePath,
    relativePath: doc.relativePath,
    title: doc.title,
    wing: doc.classification.wing,
    hall: doc.classification.hall,
    room: doc.classification.room,
    status: 'created',
    reason: doc.notesFallbackRecovered ? '已通过 Apple Notes 回填正文并写入启蒙收件箱候选' : '已写入启蒙收件箱候选',
    candidateId,
  }
}

function renderMarkdownReport(params: {
  startedAt: Date
  sessionId: string
  corpusPath: string
  apply: boolean
  offset: number
  limit: number
  records: CandidateRecord[]
}) {
  const created = params.records.filter(item => item.status === 'created')
  const updated = params.records.filter(item => item.status === 'updated')
  const skipped = params.records.filter(item => item.status === 'skipped')
  const errors = params.records.filter(item => item.status === 'error')
  const sampleLines = params.records
    .slice(0, 20)
    .map(item => `- [${item.status}] ${item.title} -> ${item.wing} / ${item.hall} / ${item.room}`)

  return [
    '# 《启蒙》Candidate Batch 报告',
    '',
    `- 时间：${params.startedAt.toLocaleString('zh-CN', { hour12: false })}`,
    `- sessionId：\`${params.sessionId}\``,
    `- 模式：${params.apply ? 'apply' : 'dry-run'}`,
    `- 语料路径：\`${params.corpusPath}\``,
    `- offset：${params.offset}`,
    `- limit：${params.limit}`,
    '',
    '## 结果',
    `- created：${created.length}`,
    `- updated：${updated.length}`,
    `- skipped：${skipped.length}`,
    `- error：${errors.length}`,
    '',
    '## 样例',
    ...sampleLines,
    '',
  ].join('\n')
}

async function writeReports(payload: Record<string, unknown>, markdown: string, timestampSlug: string) {
  await fs.mkdir(REPORT_DIR, { recursive: true })
  const jsonPath = path.join(REPORT_DIR, `${timestampSlug}-batch.json`)
  const mdPath = path.join(REPORT_DIR, `${timestampSlug}-batch.md`)
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
  const sessionId = `qimeng-candidates-${timestampSlug}`
  const corpusEntries = await buildCorpusEntries(args.corpusPath)
  const entries = corpusEntries.slice(args.offset, args.offset + args.limit) as CorpusEntry[]
  const { dbPath, db } = openWritableDatabase()
  const records: CandidateRecord[] = []

  try {
    if (args.apply) db.exec('BEGIN')

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]
      if ((index + 1) === 1 || (index + 1) % 24 === 0 || (index + 1) === entries.length) {
        console.error(`[qimeng:candidates] ${index + 1}/${entries.length} ${entry.relativePath}`)
      }

      try {
        const doc = await readQimengDocument(args.corpusPath, entry.filePath)
        const record = upsertCandidate(db, doc, sessionId, args.corpusPath, args.apply)
        records.push(record)
      } catch (error) {
        records.push({
          filePath: entry.filePath,
          relativePath: entry.relativePath,
          title: entry.title,
          wing: entry.classification.wing,
          hall: entry.classification.hall,
          room: entry.classification.room,
          status: 'error',
          reason: String(error),
          candidateId: '',
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
    if (args.apply) db.exec('ROLLBACK')
    throw error
  } finally {
    db.close()
  }

  const markdown = renderMarkdownReport({
    startedAt,
    sessionId,
    corpusPath: args.corpusPath,
    apply: args.apply,
    offset: args.offset,
    limit: entries.length,
    records,
  })

  const payload = {
    startedAt: startedAt.toISOString(),
    sessionId,
    dbPath,
    corpusPath: args.corpusPath,
    apply: args.apply,
    offset: args.offset,
    limit: entries.length,
    records,
  }

  const { jsonPath, mdPath } = await writeReports(payload, markdown, timestampSlug)

  console.log(JSON.stringify({
    sessionId,
    apply: args.apply,
    offset: args.offset,
    limit: entries.length,
    created: records.filter(item => item.status === 'created').length,
    updated: records.filter(item => item.status === 'updated').length,
    skipped: records.filter(item => item.status === 'skipped').length,
    errors: records.filter(item => item.status === 'error').length,
    jsonPath,
    mdPath,
  }, null, 2))
}

main().catch(error => {
  console.error('[qimeng:candidates] failed:', error)
  process.exitCode = 1
})
