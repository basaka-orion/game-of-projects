import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => {
  const state = {
    archiveCandidates: new Map<string, Record<string, unknown>>(),
  }

  function findCandidateById(id: string) {
    return Array.from(state.archiveCandidates.values()).find((row) => row.id === id)
  }

  const queryMock = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('SELECT * FROM archive_candidates WHERE id = ? LIMIT 1')) {
      const row = findCandidateById(String(params[0]))
      return row ? [row] : []
    }

    if (
      sql.includes('FROM mempalace_drawers') &&
      sql.includes("source_type = 'file'") &&
      sql.includes('file_path = ?')
    ) {
      return []
    }

    if (sql.includes('SELECT COUNT(*) as cnt') && sql.includes('FROM mempalace_drawers')) {
      return [{ cnt: 0 }]
    }

    if (sql.includes('SELECT id, title, wing, hall, room, source_type') && sql.includes('FROM mempalace_drawers')) {
      return []
    }

    return []
  })

  const runMock = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("SET status = 'archived'")) {
      const [drawerId, metadata, id] = params
      const row = findCandidateById(String(id))
      if (!row) return
      row.status = 'archived'
      row.archived_drawer_id = drawerId
      row.metadata_json = metadata
      row.updated_at = '2026-04-22T13:00:00.000Z'
    }
  })

  const createDrawerMock = vi.fn(async (_drawer: Record<string, unknown>) => 'drawer-file')
  const createSourceMock = vi.fn(async () => 'source-file')

  return { state, queryMock, runMock, createDrawerMock, createSourceMock }
})

vi.mock('../../db/repository', () => ({
  dbSaveOperatingEvent: vi.fn(async () => 'event-1'),
  query: mocked.queryMock,
  run: mocked.runMock,
}))

vi.mock('../../knowledge/drawer', () => ({
  createDrawer: mocked.createDrawerMock,
}))

vi.mock('../../knowledge/wiki', () => ({
  createSource: mocked.createSourceMock,
}))

import { archivePendingArchiveCandidate } from '../archive-gate'

function makeCandidateRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cand-corpus-1',
    conversation_id: 'qimeng-corpus',
    message_id: '20190802_-3-5-启蒙与此时-md.md',
    message_role: 'system',
    content: '这是《启蒙》语料里一篇关于启蒙与此时的长期记录。',
    source_surface: 'qimeng-corpus',
    agent_role: 'qimeng-importer',
    title: '启蒙与此时',
    suggested_wing: 'worldview',
    suggested_hall: 'consciousness',
    suggested_room: '世界观-时代判断',
    suggested_tags: '["启蒙","世界模型"]',
    suggested_facets: '["discovery"]',
    rationale: '命中世界模型语义',
    status: 'pending',
    archived_drawer_id: '',
    metadata_json: JSON.stringify({
      filePath: '/Users/apple/Documents/Openbasaka_Brain/Wiki/20190802_-3-5-启蒙与此时-md.md',
      relativePath: '20190802_-3-5-启蒙与此时-md.md',
      sourceAuthor: 'apple-notes',
      sourceTimestamp: '2019-08-02T10:00:00.000Z',
    }),
    created_at: '2026-04-22T09:00:00.000Z',
    updated_at: '2026-04-22T09:00:00.000Z',
    ...overrides,
  }
}

describe('archive corpus candidate', () => {
  beforeEach(() => {
    mocked.state.archiveCandidates.clear()
    mocked.queryMock.mockClear()
    mocked.runMock.mockClear()
    mocked.createDrawerMock.mockClear()
  })

  it('archives qimeng corpus candidates into file drawers', async () => {
    mocked.state.archiveCandidates.set('cand-corpus-1', makeCandidateRow())

    const archived = await archivePendingArchiveCandidate('cand-corpus-1')

    expect(archived?.status).toBe('archived')
    expect(archived?.archivedDrawerId).toBe('drawer-file')
    expect(mocked.createDrawerMock).toHaveBeenCalledTimes(1)
    expect(mocked.createDrawerMock.mock.calls[0]?.[0]).toMatchObject({
      title: '启蒙与此时',
      wing: 'worldview',
      hall: 'consciousness',
      room: '世界观-时代判断',
      sourceType: 'file',
      filePath: '/Users/apple/Documents/Openbasaka_Brain/Wiki/20190802_-3-5-启蒙与此时-md.md',
      author: 'apple-notes',
      tags: ['启蒙', '世界模型'],
      metadata: expect.objectContaining({
        sourceId: 'source-file',
      }),
    })
    expect(mocked.createSourceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '启蒙与此时',
        sourceType: 'file',
        folderPath: '启蒙/worldview/consciousness/世界观-时代判断',
      }),
    )
  })
})
