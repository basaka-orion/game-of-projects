import path from 'node:path'
import os from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { chunkText } from '../src/lib/knowledge/chunker.ts'

function generateId(): string {
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function openDatabase() {
  const dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'game-of-projects', 'game-of-projects.db')
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON')
  return { dbPath, db }
}

function replacePageChunks(db: DatabaseSync, pageId: string, content: string, folderPath: string) {
  db.prepare('DELETE FROM wiki_chunks WHERE page_id = ?').run(pageId)

  const insertChunk = db.prepare(`
    INSERT INTO wiki_chunks
      (id, page_id, folder_path, chunk_index, content, token_count, header_breadcrumb, overlap_prev, overlap_next, metadata_json, created_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
  `)

  const chunks = chunkText(content)
  for (const chunk of chunks) {
    insertChunk.run(
      generateId(),
      pageId,
      folderPath,
      chunk.index,
      chunk.content,
      chunk.tokenCount,
      chunk.headerBreadcrumb,
      chunk.overlapPrev,
      chunk.overlapNext,
      JSON.stringify({
        importScope: 'qimeng-pilot',
        compiledBy: 'qimeng-pilot-compiler',
        chunkKind: 'page',
      }),
    )
  }

  return chunks.length
}

async function main() {
  const { dbPath, db } = openDatabase()
  const pages = db.prepare(`
    SELECT id, content, folder_path
    FROM wiki_pages
    WHERE metadata_json LIKE '%"compiledBy":"qimeng-pilot-compiler"%'
      AND slug != 'qimeng-pilot-index'
    ORDER BY updated_at DESC
  `).all() as Array<{ id: string; content: string; folder_path: string }>

  let chunkCount = 0

  db.exec('BEGIN')
  try {
    for (const page of pages) {
      chunkCount += replacePageChunks(db, page.id, page.content || '', page.folder_path || '.')
    }
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* noop */ }
    throw error
  } finally {
    db.close()
  }

  console.log(JSON.stringify({
    databasePath: dbPath,
    pages: pages.length,
    chunks: chunkCount,
  }, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
