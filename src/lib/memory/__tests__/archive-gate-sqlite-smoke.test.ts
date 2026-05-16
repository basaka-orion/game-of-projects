// @vitest-environment node

import { execFileSync } from 'node:child_process'
import { describe, expect, test } from 'vitest'

type SqliteRow = Record<string, unknown>

function getDbPath(): string {
  const dbPath = process.env.GOP_SQLITE_PATH
  if (!dbPath) {
    throw new Error('GOP_SQLITE_PATH is required for archive-gate SQLite smoke tests')
  }
  return dbPath
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  return `'${String(value).replace(/'/g, "''")}'`
}

function interpolate(sql: string, params: unknown[]): string {
  let index = 0
  return sql.replace(/\?/g, () => sqlLiteral(params[index++]))
}

function sqliteQuery<T extends SqliteRow = SqliteRow>(sql: string, params: unknown[] = []): T[] {
  const rendered = interpolate(sql, params)
  const out = execFileSync('sqlite3', ['-json', getDbPath(), rendered], { encoding: 'utf8' }).trim()
  return out ? JSON.parse(out) as T[] : []
}

function sqliteRun(sql: string, params: unknown[] = []): void {
  const rendered = interpolate(sql, params)
  execFileSync('sqlite3', [getDbPath(), rendered], { encoding: 'utf8' })
}

describe('archive-gate SQLite smoke', () => {
  test.skipIf(!process.env.GOP_SQLITE_PATH)('archives a confirmed Qimeng candidate into the real SQLite drawer store', async () => {
    ;(globalThis as { window?: unknown }).window = {
      electronAPI: {
        dbQuery: async (sql: string, params: unknown[] = []) => sqliteQuery(sql, params),
        dbRun: async (sql: string, params: unknown[] = []) => sqliteRun(sql, params),
      },
    }

    const { archiveConversationMessage, ensureConversationArchiveCandidate, updateConversationArchiveCandidate } = await import('../archive-gate')

    const conversationId = `conv-sqlite-smoke-${Date.now()}`
    const messageId = `msg-sqlite-smoke-${Date.now()}`
    const message = {
      id: messageId,
      role: 'user' as const,
      content: `这是一次《启蒙》真库归档 smoke test：确认 openbasaka 的点击归档，会把系统构想与世界认知写进记忆宫殿。会话 ${conversationId}`,
      timestamp: Date.now(),
    }

    let candidateId = ''
    let drawerId = ''

    try {
      const ensured = await ensureConversationArchiveCandidate({
        conversationId,
        message,
        agentRole: 'general',
      })

      expect(ensured).not.toBeNull()
      expect(ensured?.preview.sourcePointer).toContain('Openbasaka · user')
      expect(ensured?.status).toBe('pending')

      candidateId = ensured?.id || ''

      const updated = await updateConversationArchiveCandidate({
        candidateId,
        title: 'SQLite 真库启蒙归档验收',
        room: '项目-个人智能系统-真库验收',
        tags: ['启蒙', 'openbasaka', '真库验收'],
        facets: ['fact', 'decision', 'question'],
      })

      expect(updated).not.toBeNull()
      expect(updated?.title).toBe('SQLite 真库启蒙归档验收')
      expect(updated?.room).toBe('项目-个人智能系统-真库验收')
      expect(updated?.preview.isCustomized).toBe(true)

      const archived = await archiveConversationMessage({
        conversationId,
        message,
        agentRole: 'general',
      })

      expect(archived).not.toBeNull()
      expect(archived?.status).toBe('archived')

      drawerId = archived?.archivedDrawerId || ''

      const drawerRows = sqliteQuery<{
        id: string
        title: string
        wing: string
        hall: string
        room: string
        source_type: string
        folder_path: string
        tags: string
        metadata_json: string
      }>(
        `SELECT id, title, wing, hall, room, source_type, folder_path, tags, metadata_json
           FROM mempalace_drawers
          WHERE id = ?`,
        [drawerId],
      )
      const candidateRows = sqliteQuery<{
        id: string
        status: string
        archived_drawer_id: string
        title: string
        suggested_room: string
        suggested_tags: string
        suggested_facets: string
        metadata_json: string
      }>(
        `SELECT id, status, archived_drawer_id, title, suggested_room, suggested_tags, suggested_facets, metadata_json
           FROM archive_candidates
          WHERE id = ?`,
        [candidateId],
      )

      expect(drawerRows).toHaveLength(1)
      expect(candidateRows).toHaveLength(1)

      const drawer = drawerRows[0]
      const candidate = candidateRows[0]
      const drawerTags = JSON.parse(drawer.tags) as string[]
      const drawerMetadata = JSON.parse(drawer.metadata_json) as Record<string, unknown>
      const candidateTags = JSON.parse(candidate.suggested_tags) as string[]
      const candidateFacets = JSON.parse(candidate.suggested_facets) as string[]
      const candidateMetadata = JSON.parse(candidate.metadata_json) as Record<string, unknown>

      expect(drawer.title).toBe('SQLite 真库启蒙归档验收')
      expect(drawer.wing).toBe('openbasaka')
      expect(drawer.room).toBe('项目-个人智能系统-真库验收')
      expect(drawer.source_type).toBe('conversation')
      expect(drawer.folder_path).toBe('启蒙/openbasaka/technical/项目-个人智能系统-真库验收')
      expect(drawerTags).toEqual(['启蒙', 'openbasaka', '真库验收'])
      expect(drawerMetadata.archivedBy).toBe('click-preview-confirm')
      expect(drawerMetadata.archiveStatus).toBe('confirmed')
      expect(drawerMetadata.conversationId).toBe(conversationId)
      expect(drawerMetadata.messageId).toBe(messageId)
      expect(drawerMetadata.facets).toEqual(['fact', 'decision', 'question'])

      expect(candidate.status).toBe('archived')
      expect(candidate.archived_drawer_id).toBe(drawerId)
      expect(candidate.title).toBe('SQLite 真库启蒙归档验收')
      expect(candidate.suggested_room).toBe('项目-个人智能系统-真库验收')
      expect(candidateTags).toEqual(['启蒙', 'openbasaka', '真库验收'])
      expect(candidateFacets).toEqual(['fact', 'decision', 'question'])
      expect(candidateMetadata.archivedBy).toBe('click-preview-confirm')
      expect(candidateMetadata.archivedDrawerId).toBe(drawerId)
      expect(candidateMetadata.sourcePointer).toContain(`会话 ${conversationId.slice(0, 8)}`)
    } finally {
      if (candidateId) sqliteRun('DELETE FROM archive_candidates WHERE id = ?', [candidateId])
      if (drawerId) sqliteRun('DELETE FROM mempalace_drawers WHERE id = ?', [drawerId])
    }
  })
})
