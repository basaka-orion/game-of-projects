/**
 * SQLite 数据库初始化模块
 * better-sqlite3 已在依赖中，vite.config.ts 已排除打包
 */
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import { getSchema, getMigrations, getComplexMigrations } from '../../src/lib/db/schema'
import {
  createDatabaseBackupEnvelope,
  parseDatabaseBackupJson,
  quoteSqlIdentifier,
} from '../../src/lib/db/backup-format'

let db: Database.Database | null = null

/** 获取数据库实例（单例） */
export function getDatabase(): Database.Database {
  if (db) return db

  const dbPath = path.join(app.getPath('userData'), 'game-of-projects.db')
  db = new Database(dbPath)

  // 性能优化
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')

  // 初始化所有表。旧库可能缺少新列，而 schema 里的新索引会先引用这些列；
  // 所以这里允许第一次 schema 部分失败，随后先跑列迁移，再做一次完整收口。
  try {
    db.exec(getSchema())
  } catch (err) {
    console.warn('[database] Schema initialization deferred until migrations finish:', err)
  }

  // 安全迁移（幂等）
  for (const sql of getMigrations()) {
    try {
      db.exec(sql)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes('duplicate column name') && !message.includes('already exists')) {
        console.warn('[database] Migration skipped:', sql, err)
      }
    }
  }

  try {
    db.exec(getSchema())
  } catch (err) {
    console.warn('[database] Schema finalization skipped:', err)
  }

  // 复杂迁移（重建表等，仅在标记文件不存在时执行）
  const complexMigrationsDone = db.prepare("SELECT value FROM settings WHERE key = 'complex_migrations_done'").get() as
    | { value: string }
    | undefined
  if (!complexMigrationsDone) {
    for (const migration of getComplexMigrations()) {
      try {
        db.exec(migration.sql)
        console.log(`[database] Complex migration "${migration.name}" applied`)
      } catch (err) {
        console.warn(`[database] Complex migration "${migration.name}" skipped:`, err)
      }
    }
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('complex_migrations_done', '1')").run()
  }

  // 诊断：验证关键表存在（scheduled_tasks, cron_execution_log）
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('scheduled_tasks', 'cron_execution_log')",
      )
      .all() as { name: string }[]
    if (tables.length < 2) {
      console.warn('[database] Missing critical tables, re-running schema...')
      db.exec(getSchema())
    }
  } catch (err) {
    console.error('[database] Table check failed:', err)
  }

  return db
}

/** 关闭数据库连接 */
export function closeDatabase() {
  if (db) {
    db.close()
    db = null
  }
}

/** 执行查询（SELECT）并返回结果 */
export function query(sql: string, params: unknown[] = []): unknown[] {
  const database = getDatabase()
  return database.prepare(sql).all(...params) as unknown[]
}

/** 执行写操作（INSERT/UPDATE/DELETE）并返回变化信息 */
export function run(sql: string, params: unknown[] = []): { changes: number; lastInsertRowid: number | bigint } {
  const database = getDatabase()
  const stmt = database.prepare(sql)
  stmt.run(...params)
  return {
    changes: database.prepare('SELECT changes() as c').get() as number,
    lastInsertRowid: database.prepare('SELECT last_insert_rowid() as id').get() as number,
  }
}

/** 导出整个数据库为 JSON（用于备份） */
export function exportDatabase(): string {
  const database = getDatabase()
  const tableNames = getUserTableNames(database)

  const tables: Record<string, unknown[]> = {}
  for (const name of tableNames) {
    tables[name] = database.prepare(`SELECT * FROM ${quoteSqlIdentifier(name)}`).all() as unknown[]
  }
  return JSON.stringify(createDatabaseBackupEnvelope(tables), null, 2)
}

/** 导入数据库（从 JSON 备份恢复） */
export function importDatabase(jsonStr: string): boolean {
  try {
    const data = parseDatabaseBackupJson(jsonStr)
    const database = getDatabase()
    const tableNames = getUserTableNames(database)
    const tableNameSet = new Set(tableNames)
    const unknownTables = Object.keys(data).filter((table) => !tableNameSet.has(table))

    if (unknownTables.length > 0) {
      throw new Error(`Backup contains unknown tables: ${unknownTables.join(', ')}`)
    }

    const tableColumns = new Map(tableNames.map((tableName) => [tableName, getTableColumns(database, tableName)]))
    validateBackupRows(data, tableColumns)

    const transaction = database.transaction(() => {
      for (const tableName of tableNames) {
        database.exec(`DELETE FROM ${quoteSqlIdentifier(tableName)}`)
      }

      for (const [tableName, rows] of Object.entries(data)) {
        if (rows.length === 0) continue

        const tableColumnSet = new Set(tableColumns.get(tableName) ?? [])
        const cols = Array.from(new Set(rows.flatMap((row) => Object.keys(row as Record<string, unknown>)))).filter(
          (col) => tableColumnSet.has(col),
        )
        if (cols.length === 0) continue

        const quotedTable = quoteSqlIdentifier(tableName)
        const quotedCols = cols.map(quoteSqlIdentifier).join(', ')
        const placeholders = cols.map(() => '?').join(', ')
        const insertSql = `INSERT INTO ${quotedTable} (${quotedCols}) VALUES (${placeholders})`
        const stmt = database.prepare(insertSql)

        for (const row of rows) {
          const values = cols.map((c) => (row as Record<string, unknown>)[c] ?? null)
          stmt.run(...values)
        }
      }
    })

    const previousForeignKeys = Number(database.pragma('foreign_keys', { simple: true })) === 1
    database.pragma('foreign_keys = OFF')
    try {
      transaction()
    } finally {
      database.pragma(`foreign_keys = ${previousForeignKeys ? 'ON' : 'OFF'}`)
    }
    return true
  } catch (error) {
    console.warn('[database] Import failed:', error)
    return false
  }
}

function getUserTableNames(database: Database.Database): string[] {
  const tables = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[]

  return tables.map((table) => table.name)
}

function getTableColumns(database: Database.Database, tableName: string): string[] {
  const columns = database.prepare(`PRAGMA table_info(${quoteSqlIdentifier(tableName)})`).all() as { name: string }[]
  return columns.map((column) => column.name)
}

function validateBackupRows(data: Record<string, unknown[]>, tableColumns: Map<string, string[]>) {
  for (const [tableName, rows] of Object.entries(data)) {
    const tableColumnSet = new Set(tableColumns.get(tableName) ?? [])

    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        throw new Error(`Backup table "${tableName}" contains a non-object row.`)
      }

      const invalidColumns = Object.keys(row as Record<string, unknown>).filter((column) => !tableColumnSet.has(column))
      if (invalidColumns.length > 0) {
        throw new Error(`Backup table "${tableName}" contains unknown columns: ${invalidColumns.join(', ')}`)
      }
    }
  }
}
