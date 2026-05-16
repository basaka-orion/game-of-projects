import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => {
  const state = {
    archiveCandidates: new Map<string, Record<string, unknown>>(),
    drawers: [] as Array<Record<string, unknown>>,
    createdDrawers: [] as Array<Record<string, unknown>>,
  }

  function findCandidateById(id: string) {
    return Array.from(state.archiveCandidates.values()).find(row => row.id === id)
  }

  function filterDrawers(params: unknown[]) {
    const strings = params.filter((value): value is string => typeof value === 'string')
    const title = strings[0] || ''
    const content = strings[1] || ''
    const excludeId = strings[2] || ''

    return state.drawers.filter(row => {
      if (excludeId && row.id === excludeId) return false
      return (title && row.title === title) || (content && row.raw_content === content)
    })
  }

  const queryMock = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM archive_candidates') && sql.includes(`status = 'pending'`)) {
      let nextParamIndex = 0
      let rows = Array.from(state.archiveCandidates.values())
        .filter(row => row.status === 'pending')

      if (sql.includes('source_surface = ?')) {
        rows = rows.filter(row => row.source_surface === params[nextParamIndex])
        nextParamIndex += 1
      }

      if (sql.includes(`json_extract(metadata_json, '$.batchSessionId') = ?`)) {
        rows = rows.filter(row => {
          const metadata = JSON.parse(String(row.metadata_json || '{}')) as Record<string, unknown>
          return metadata.batchSessionId === params[nextParamIndex]
        })
        nextParamIndex += 1
      }

      rows = rows.sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)))

      if (sql.includes('SELECT COUNT(*) as cnt')) {
        return [{ cnt: rows.length }]
      }

      const limit = Number(params[nextParamIndex] || 50)
      const offset = Number(params[nextParamIndex + 1] || 0)
      return rows.slice(offset, offset + limit)
    }

    if (sql.includes('SELECT * FROM archive_candidates WHERE id = ? LIMIT 1')) {
      const row = findCandidateById(String(params[0]))
      return row ? [row] : []
    }

    if (sql.includes('SELECT id') && sql.includes("FROM mempalace_drawers") && sql.includes("source_type = 'conversation'")) {
      return []
    }

    if (sql.includes('SELECT COUNT(*) as cnt') && sql.includes('FROM mempalace_drawers')) {
      return [{ cnt: filterDrawers(params).length }]
    }

    if (sql.includes('SELECT id, title, wing, hall, room, source_type') && sql.includes('FROM mempalace_drawers')) {
      return filterDrawers(params).slice(0, 3).map(row => ({
        id: row.id,
        title: row.title,
        wing: row.wing,
        hall: row.hall,
        room: row.room,
        source_type: row.source_type,
      }))
    }

    return []
  })

  const runMock = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("SET status = 'dismissed'")) {
      const [metadata, id] = params
      const row = findCandidateById(String(id))
      if (!row) return
      row.status = 'dismissed'
      row.metadata_json = metadata
      row.updated_at = '2026-04-22T12:00:00.000Z'
      return
    }

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

  const createDrawerMock = vi.fn(async (payload: Record<string, unknown>) => {
    state.createdDrawers.push(payload)
    state.drawers.push({
      id: 'drawer-new',
      title: payload.title,
      raw_content: payload.rawContent,
      wing: payload.wing,
      hall: payload.hall,
      room: payload.room,
      source_type: payload.sourceType,
    })
    return 'drawer-new'
  })

  return { state, queryMock, runMock, createDrawerMock }
})

vi.mock('../../db/repository', () => ({
  query: mocked.queryMock,
  run: mocked.runMock,
}))

vi.mock('../../knowledge/drawer', () => ({
  createDrawer: mocked.createDrawerMock,
}))

import {
  archivePendingArchiveCandidate,
  countPendingArchiveCandidates,
  dismissConversationArchiveCandidate,
  listPendingArchiveCandidates,
} from '../archive-gate'

function makeCandidateRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cand-1',
    conversation_id: 'conv-1',
    message_id: 'msg-1',
    message_role: 'assistant',
    content: '我想把记忆宫殿和 openbasaka 做成一个真正长期成长的个人智能系统。',
    source_surface: 'openbasaka',
    agent_role: 'technical',
    title: '系统草案',
    suggested_wing: 'openbasaka',
    suggested_hall: 'technical',
    suggested_room: '项目-个人智能系统',
    suggested_tags: '["启蒙","系统"]',
    suggested_facets: '["decision"]',
    rationale: '命中系统演化语义',
    status: 'pending',
    archived_drawer_id: '',
    metadata_json: '{"sourceTimestamp":"2026-04-22T09:00:00.000Z"}',
    created_at: '2026-04-22T09:00:00.000Z',
    updated_at: '2026-04-22T09:00:00.000Z',
    ...overrides,
  }
}

describe('archive inbox lifecycle', () => {
  beforeEach(() => {
    mocked.state.archiveCandidates.clear()
    mocked.state.drawers = []
    mocked.state.createdDrawers = []
    mocked.queryMock.mockClear()
    mocked.runMock.mockClear()
    mocked.createDrawerMock.mockClear()
  })

  it('lists pending candidates and removes dismissed rows from the inbox', async () => {
    mocked.state.archiveCandidates.set('conv-1::msg-1', makeCandidateRow({
      id: 'cand-1',
      updated_at: '2026-04-22T10:00:00.000Z',
    }))
    mocked.state.archiveCandidates.set('conv-2::msg-2', makeCandidateRow({
      id: 'cand-2',
      conversation_id: 'conv-2',
      message_id: 'msg-2',
      title: '世界观笔记',
      suggested_room: '世界观-时代判断',
      updated_at: '2026-04-22T11:00:00.000Z',
    }))
    mocked.state.archiveCandidates.set('conv-3::msg-3', makeCandidateRow({
      id: 'cand-3',
      conversation_id: 'conv-3',
      message_id: 'msg-3',
      status: 'dismissed',
      updated_at: '2026-04-22T12:00:00.000Z',
    }))

    const pending = await listPendingArchiveCandidates(10)
    expect(pending.map(candidate => candidate.id)).toEqual(['cand-2', 'cand-1'])

    const dismissed = await dismissConversationArchiveCandidate('cand-2')
    expect(dismissed?.status).toBe('dismissed')
    expect(dismissed?.metadata.dismissedBy).toBe('click-preview-dismiss')

    const refreshed = await listPendingArchiveCandidates(10)
    expect(refreshed.map(candidate => candidate.id)).toEqual(['cand-1'])
  })

  it('supports paging and batch-scoped counts for pending candidates', async () => {
    mocked.state.archiveCandidates.set('conv-1::msg-1', makeCandidateRow({
      id: 'cand-1',
      updated_at: '2026-04-22T13:00:00.000Z',
      metadata_json: JSON.stringify({ batchSessionId: 'batch-a' }),
    }))
    mocked.state.archiveCandidates.set('conv-2::msg-2', makeCandidateRow({
      id: 'cand-2',
      conversation_id: 'conv-2',
      message_id: 'msg-2',
      updated_at: '2026-04-22T12:00:00.000Z',
      metadata_json: JSON.stringify({ batchSessionId: 'batch-a' }),
    }))
    mocked.state.archiveCandidates.set('conv-3::msg-3', makeCandidateRow({
      id: 'cand-3',
      conversation_id: 'conv-3',
      message_id: 'msg-3',
      updated_at: '2026-04-22T11:00:00.000Z',
      metadata_json: JSON.stringify({ batchSessionId: 'batch-b' }),
    }))

    const page = await listPendingArchiveCandidates({
      limit: 1,
      offset: 1,
      sourceSurface: 'all',
      batchSessionId: 'batch-a',
    })

    expect(page.map(candidate => candidate.id)).toEqual(['cand-2'])
    expect(await countPendingArchiveCandidates({ sourceSurface: 'all', batchSessionId: 'batch-a' })).toBe(2)
    expect(await countPendingArchiveCandidates('all')).toBe(3)
  })

  it('archives pending candidates through the shared candidate pipeline', async () => {
    mocked.state.archiveCandidates.set('conv-1::msg-1', makeCandidateRow())

    const archived = await archivePendingArchiveCandidate('cand-1')

    expect(archived?.status).toBe('archived')
    expect(archived?.archivedDrawerId).toBe('drawer-new')
    expect(mocked.createDrawerMock).toHaveBeenCalledTimes(1)
    expect(mocked.createDrawerMock.mock.calls[0]?.[0]).toMatchObject({
      title: '系统草案',
      wing: 'openbasaka',
      hall: 'technical',
      room: '项目-个人智能系统',
      sourceType: 'conversation',
      tags: ['启蒙', '系统'],
    })

    const pending = await listPendingArchiveCandidates(10)
    expect(pending).toHaveLength(0)
  })
})
