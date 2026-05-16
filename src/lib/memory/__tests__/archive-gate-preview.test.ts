import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => {
  const state = {
    archiveCandidates: new Map<string, Record<string, unknown>>(),
    drawers: [] as Array<Record<string, unknown>>,
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
    if (sql.includes('SELECT * FROM archive_candidates WHERE id = ? LIMIT 1')) {
      const row = findCandidateById(String(params[0]))
      return row ? [row] : []
    }

    if (sql.includes('SELECT * FROM archive_candidates WHERE conversation_id = ? AND message_id = ? LIMIT 1')) {
      const key = `${params[0]}::${params[1]}`
      const row = state.archiveCandidates.get(key)
      return row ? [row] : []
    }

    if (sql.includes('SELECT * FROM archive_candidates WHERE conversation_id = ? ORDER BY created_at ASC')) {
      return Array.from(state.archiveCandidates.values()).filter(row => row.conversation_id === params[0])
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
    if (sql.includes('UPDATE archive_candidates') && sql.includes('SET title = ?,')) {
      const [title, room, tags, facets, metadata, id] = params
      const row = findCandidateById(String(id))
      if (!row) return
      row.title = title
      row.suggested_room = room
      row.suggested_tags = tags
      row.suggested_facets = facets
      row.metadata_json = metadata
      return
    }

    if (sql.includes('UPDATE archive_candidates') && sql.includes('SET content = ?, message_role = ?, agent_role = ?, title = ?,')) {
      const [content, messageRole, agentRole, title, wing, hall, room, tags, facets, rationale, metadata, id] = params
      const row = findCandidateById(String(id))
      if (!row) return
      row.content = content
      row.message_role = messageRole
      row.agent_role = agentRole
      row.title = title
      row.suggested_wing = wing
      row.suggested_hall = hall
      row.suggested_room = room
      row.suggested_tags = tags
      row.suggested_facets = facets
      row.rationale = rationale
      row.metadata_json = metadata
      return
    }
  })

  return { state, queryMock, runMock }
})

vi.mock('../../db/repository', () => ({
  query: mocked.queryMock,
  run: mocked.runMock,
}))

vi.mock('../../knowledge/drawer', () => ({
  createDrawer: vi.fn(async () => 'drawer-created'),
}))

import { ensureConversationArchiveCandidate, updateConversationArchiveCandidate } from '../archive-gate'

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
    metadata_json: '{}',
    created_at: '2026-04-22T00:00:00.000Z',
    updated_at: '2026-04-22T00:00:00.000Z',
    ...overrides,
  }
}

describe('archive gate preview editing', () => {
  beforeEach(() => {
    mocked.state.archiveCandidates.clear()
    mocked.state.drawers = []
    mocked.queryMock.mockClear()
    mocked.runMock.mockClear()
  })

  it('updates pending candidates and exposes duplicate-risk preview metadata', async () => {
    const row = makeCandidateRow()
    mocked.state.archiveCandidates.set('conv-1::msg-1', row)
    mocked.state.drawers.push({
      id: 'drawer-1',
      title: '自定义标题',
      raw_content: '别的内容',
      wing: 'openbasaka',
      hall: 'technical',
      room: '项目-个人智能系统',
      source_type: 'conversation',
    })

    const updated = await updateConversationArchiveCandidate({
      candidateId: 'cand-1',
      title: ' 自定义标题 ',
      room: '系统-归档试验 ',
      tags: ['启蒙', '启蒙', '归档'],
      facets: ['decision', 'fact', 'decision'],
    })

    expect(updated?.title).toBe('自定义标题')
    expect(updated?.room).toBe('系统-归档试验')
    expect(updated?.tags).toEqual(['启蒙', '归档'])
    expect(updated?.facets).toEqual(['decision', 'fact'])
    expect(updated?.preview.isCustomized).toBe(true)
    expect(updated?.preview.duplicateCount).toBe(1)
    expect(updated?.preview.sourcePointer).toContain('Openbasaka')
    expect(updated?.preview.sourcePointer).toContain('conv-1')
  })

  it('preserves manual edits during candidate resync', async () => {
    const row = makeCandidateRow({
      title: '人工标题',
      suggested_room: '人工房间',
      suggested_tags: '["甲","乙"]',
      suggested_facets: '["wish"]',
      metadata_json: '{"customized":true,"userEditedAt":"2026-04-22T01:00:00.000Z"}',
    })
    mocked.state.archiveCandidates.set('conv-1::msg-1', row)

    const candidate = await ensureConversationArchiveCandidate({
      conversationId: 'conv-1',
      message: {
        id: 'msg-1',
        role: 'assistant',
        content: '我想把记忆宫殿和 openbasaka 做成一个真正长期成长的个人智能系统，让归档门成为全局规则。',
        timestamp: Date.now(),
      },
      agentRole: 'technical',
    })

    expect(candidate?.title).toBe('人工标题')
    expect(candidate?.room).toBe('人工房间')
    expect(candidate?.tags).toEqual(['甲', '乙'])
    expect(candidate?.facets).toEqual(['wish'])
    expect(candidate?.preview.isCustomized).toBe(true)
  })
})
