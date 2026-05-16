import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dbListOperatingEvents } from '../../db/repository'
import { recordOpenbasakaOperation } from '../operation-history'

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

describe('openbasaka operation history', () => {
  beforeEach(() => {
    const localStorage = createStorage()
    vi.stubGlobal('localStorage', localStorage)
    vi.stubGlobal('window', { localStorage })
  })

  it('records module actions in the shared operating ledger', async () => {
    await recordOpenbasakaOperation({
      moduleId: 'xiaobai-flash',
      moduleName: '小白｜灵犀一念',
      action: '保存灵感备忘',
      summary: '把一个原始灵感保存为可继续深挖的 memo。',
      stage: 'capture',
      entities: ['xiaobai', 'flash'],
    })

    const rows = await dbListOperatingEvents(5)
    const payload = JSON.parse(rows[0].payload_json)

    expect(rows[0]).toMatchObject({
      type: 'agent_action',
      stage: 'capture',
      title: '小白｜灵犀一念｜保存灵感备忘',
      source_kind: 'agent',
      source_id: 'xiaobai-flash',
    })
    expect(payload).toMatchObject({
      agentId: 'xiaobai-flash',
      status: 'completed',
      resultPreview: '把一个原始灵感保存为可继续深挖的 memo。',
    })
    expect(JSON.parse(rows[0].entities_json)).toEqual(['xiaobai-flash', '保存灵感备忘', 'xiaobai', 'flash'])
  })
})
