export const DATABASE_BACKUP_FORMAT = 'game-of-projects.sqlite-json.v1'

export type DatabaseBackupTables = Record<string, unknown[]>

export interface DatabaseBackupEnvelope {
  format: typeof DATABASE_BACKUP_FORMAT
  exportedAt: string
  tables: DatabaseBackupTables
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function createDatabaseBackupEnvelope(
  tables: DatabaseBackupTables,
  exportedAt = new Date().toISOString(),
): DatabaseBackupEnvelope {
  return {
    format: DATABASE_BACKUP_FORMAT,
    exportedAt,
    tables,
  }
}

export function parseDatabaseBackupJson(jsonStr: string): DatabaseBackupTables {
  const parsed = JSON.parse(jsonStr) as unknown
  const candidate =
    isRecord(parsed) && parsed.format === DATABASE_BACKUP_FORMAT && isRecord(parsed.tables) ? parsed.tables : parsed

  if (!isRecord(candidate)) {
    throw new Error('Database backup must be a JSON object.')
  }

  const tables: DatabaseBackupTables = {}
  for (const [tableName, rows] of Object.entries(candidate)) {
    if (!Array.isArray(rows)) {
      throw new Error(`Backup table "${tableName}" must be an array.`)
    }
    tables[tableName] = rows
  }

  return tables
}

export function quoteSqlIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`)
  }
  return `"${identifier}"`
}
