/**
 * SQLite 数据库初始化模块
 * better-sqlite3 已在依赖中，vite.config.ts 已排除打包
 */
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import { getSchema, getMigrations, getComplexMigrations } from '../../src/lib/db/schema'

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

  // 初始化所有表
  db.exec(getSchema())

  // 安全迁移（幂等）
  for (const sql of getMigrations()) {
    try { db.exec(sql) } catch { /* 列已存在，忽略 */ }
  }

  // 复杂迁移（重建表等，仅在标记文件不存在时执行）
  const complexMigrationsDone = db.prepare(
    "SELECT value FROM settings WHERE key = 'complex_migrations_done'"
  ).get() as { value: string } | undefined
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
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('scheduled_tasks', 'cron_execution_log')"
    ).all() as { name: string }[]
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
  const tables = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[]

  const data: Record<string, unknown[]> = {}
  for (const { name } of tables) {
    data[name] = database.prepare(`SELECT * FROM "${name}"`).all() as unknown[]
  }
  return JSON.stringify(data, null, 2)
}

/** 导入数据库（从 JSON 备份恢复） */
export function importDatabase(jsonStr: string): boolean {
  try {
    const data = JSON.parse(jsonStr) as Record<string, unknown[]>
    const database = getDatabase()

    // 在事务中执行
    const transaction = database.transaction(() => {
      for (const [table, rows] of Object.entries(data)) {
        if (!Array.isArray(rows) || rows.length === 0) continue

        // 清空目标表
        database.exec(`DELETE FROM "${table}"`)

        // 获取列名
        const cols = Object.keys(rows[0] as Record<string, unknown>)
        const placeholders = cols.map(() => '?').join(', ')
        const insertSql = `INSERT INTO "${table}" (${cols.join(', ')}) VALUES (${placeholders})`
        const stmt = database.prepare(insertSql)

        for (const row of rows) {
          const values = cols.map(c => (row as Record<string, unknown>)[c])
          stmt.run(...values)
        }
      }
    })

    transaction()
    return true
  } catch {
    return false
  }
}
