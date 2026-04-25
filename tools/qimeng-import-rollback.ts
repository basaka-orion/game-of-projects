import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { DatabaseSync } from 'node:sqlite'

const REPORT_DIR = path.resolve('docs/qimeng-imports')
const DEFAULT_REPORT_PATH = path.join(REPORT_DIR, 'latest-pilot.json')

interface ImportReportRecord {
  status: 'imported' | 'skipped' | 'error'
  sourceId: string
  drawerId: string
}

interface ImportReport {
  sessionId: string
  generatedAt: string
  databasePath?: string
  backupPath?: string
  records: ImportReportRecord[]
}

function parseArgs() {
  const args = process.argv.slice(2)
  const pathArg = args.find(arg => !arg.startsWith('--'))
  return {
    reportPath: pathArg ? path.resolve(pathArg) : DEFAULT_REPORT_PATH,
    noBackup: args.includes('--no-backup'),
  }
}

function buildTimestampSlug(date: Date): string {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[:]/g, '-')
}

function openWritableDatabase(dbPath?: string) {
  const resolvedDbPath = dbPath || path.join(os.homedir(), 'Library', 'Application Support', 'game-of-projects', 'game-of-projects.db')
  const db = new DatabaseSync(resolvedDbPath)
  db.exec('PRAGMA foreign_keys = ON')
  return { dbPath: resolvedDbPath, db }
}

function deleteByIds(db: DatabaseSync, table: string, column: string, ids: string[]) {
  if (ids.length === 0) return
  const placeholders = ids.map(() => '?').join(', ')
  db.prepare(`DELETE FROM ${table} WHERE ${column} IN (${placeholders})`).run(...ids)
}

async function maybeBackupDatabase(dbPath: string, sessionId: string, disabled: boolean): Promise<string> {
  if (disabled) return ''
  const backupPath = path.join(path.dirname(dbPath), `${path.basename(dbPath, '.db')}.${sessionId}.rollback.bak.db`)
  await fs.copyFile(dbPath, backupPath)
  return backupPath
}

async function main() {
  const args = parseArgs()
  const raw = await fs.readFile(args.reportPath, 'utf8')
  const report = JSON.parse(raw) as ImportReport
  const imported = report.records.filter(record => record.status === 'imported')
  const sourceIds = imported.map(record => record.sourceId).filter(Boolean)
  const drawerIds = imported.map(record => record.drawerId).filter(Boolean)
  const rollbackAt = new Date()
  const rollbackSessionId = `${report.sessionId || 'qimeng-pilot'}-rollback-${buildTimestampSlug(rollbackAt)}`
  const { dbPath, db } = openWritableDatabase(report.databasePath)

  let backupPath = ''
  try {
    backupPath = await maybeBackupDatabase(dbPath, rollbackSessionId, args.noBackup)
    db.exec('BEGIN')
    deleteByIds(db, 'wiki_activity_log', 'target_id', sourceIds)
    deleteByIds(db, 'wiki_sources', 'id', sourceIds)
    deleteByIds(db, 'mempalace_drawers', 'id', drawerIds)
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* noop */ }
    throw error
  } finally {
    db.close()
  }

  console.log(JSON.stringify({
    reportPath: args.reportPath,
    rollbackSessionId,
    databasePath: dbPath,
    backupPath,
    deleted: {
      sources: sourceIds.length,
      drawers: drawerIds.length,
      activityLogs: sourceIds.length,
    },
  }, null, 2))
  process.exit(0)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
