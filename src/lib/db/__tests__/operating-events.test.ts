import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dbListOperatingEvents, dbSaveOperatingEvent } from '../repository'

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

describe('operating loop event ledger', () => {
  beforeEach(() => {
    const localStorage = createStorage()
    vi.stubGlobal('localStorage', localStorage)
    vi.stubGlobal('window', { localStorage })
  })

  it('persists cross-module events in browser fallback mode', async () => {
    await dbSaveOperatingEvent({
      id: 'event-qimeng-1',
      type: 'input_event',
      stage: 'capture',
      inputKind: 'qimeng_candidate',
      title: '启蒙候选',
      contentPreview: '一段值得沉淀到长期记忆的材料。',
      source: { kind: 'qimeng', sourceId: 'q-1', title: '启蒙全集' },
      confidence: 0.83,
      entities: ['启蒙', '长期记忆'],
    })

    const rows = await dbListOperatingEvents(5)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'event-qimeng-1',
      type: 'input_event',
      stage: 'capture',
      title: '启蒙候选',
      source_kind: 'qimeng',
      source_id: 'q-1',
    })
    expect(JSON.parse(rows[0].entities_json)).toEqual(['启蒙', '长期记忆'])
  })
})
