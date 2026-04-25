import { describe, expect, it } from 'vitest'
import {
  createDatabaseBackupEnvelope,
  DATABASE_BACKUP_FORMAT,
  parseDatabaseBackupJson,
  quoteSqlIdentifier,
} from '../backup-format'

describe('database backup format', () => {
  it('wraps exported tables in a versioned envelope', () => {
    const envelope = createDatabaseBackupEnvelope(
      { settings: [{ key: 'theme', value: 'dark' }] },
      '2026-04-25T00:00:00.000Z',
    )

    expect(envelope).toEqual({
      format: DATABASE_BACKUP_FORMAT,
      exportedAt: '2026-04-25T00:00:00.000Z',
      tables: { settings: [{ key: 'theme', value: 'dark' }] },
    })
  })

  it('parses both versioned and legacy table-only backups', () => {
    const legacy = '{"settings":[{"key":"theme","value":"dark"}],"projects":[]}'
    const versioned = JSON.stringify(createDatabaseBackupEnvelope({ settings: [], projects: [{ id: 'p1' }] }))

    expect(parseDatabaseBackupJson(legacy)).toEqual({
      settings: [{ key: 'theme', value: 'dark' }],
      projects: [],
    })
    expect(parseDatabaseBackupJson(versioned)).toEqual({
      settings: [],
      projects: [{ id: 'p1' }],
    })
  })

  it('rejects malformed tables and unsafe SQL identifiers', () => {
    expect(() => parseDatabaseBackupJson('[]')).toThrow('must be a JSON object')
    expect(() => parseDatabaseBackupJson('{"settings":{}}')).toThrow('must be an array')
    expect(quoteSqlIdentifier('wiki_sources')).toBe('"wiki_sources"')
    expect(() => quoteSqlIdentifier('settings; DROP TABLE settings')).toThrow('Unsafe SQL identifier')
  })
})
