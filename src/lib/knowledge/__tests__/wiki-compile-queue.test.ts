import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dbListOperatingEvents } from '../../db/repository'
import { requestWikiCompile } from '../wiki-compile-queue'

function createStorage() {
  const data = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key)
    }),
    clear: vi.fn(() => {
      data.clear()
    }),
  }
}

describe('wiki compile queue', () => {
  beforeEach(() => {
    const localStorage = createStorage()
    vi.stubGlobal('localStorage', localStorage)
    vi.stubGlobal('window', { localStorage })
  })

  it('records archive confirmations as queued compile actions', async () => {
    const id = await requestWikiCompile({
      trigger: 'archive-inbox-bulk',
      candidateIds: ['cand-a', 'cand-b'],
      drawerIds: ['drawer-a', 'drawer-b'],
      sourceIds: ['source-a'],
      sourceKind: 'qimeng',
      sourceTitle: '启蒙收件箱批量确认',
      count: 2,
    })

    const rows = await dbListOperatingEvents(5)

    expect(id).toMatch(/^op_wiki_compile_queue_archive-inbox-bulk_/)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      type: 'agent_action',
      stage: 'compile',
      title: 'Wiki 编译队列已接收 2 条新归档',
      source_kind: 'qimeng',
      source_id: 'source-a',
      source_title: '启蒙收件箱批量确认',
    })

    const payload = JSON.parse(rows[0].payload_json) as {
      status: string
      agentId: string
      toolRefs: string[]
      resultPreview: string
      entities: string[]
    }
    expect(payload.status).toBe('queued')
    expect(payload.agentId).toBe('wiki-compiler')
    expect(payload.toolRefs).toContain('mempalace_drawers')
    expect(payload.resultPreview).toContain('2 条归档')
    expect(payload.entities).toEqual(['source-a', 'drawer-a', 'drawer-b', 'cand-a', 'cand-b'])
  })
})
