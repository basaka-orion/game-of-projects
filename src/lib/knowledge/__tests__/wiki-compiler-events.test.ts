import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dbListOperatingEvents } from '../../db/repository'
import { runCompileCycle } from '../wiki-compiler'

vi.mock('../drawer', () => ({
  getUncompiledDrawers: vi.fn(async () => []),
  markDrawerCompiled: vi.fn(),
}))

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

describe('wiki compiler event ledger', () => {
  beforeEach(() => {
    const localStorage = createStorage()
    vi.stubGlobal('localStorage', localStorage)
    vi.stubGlobal('window', { localStorage })
  })

  it('records a completed compile ledger entry when there is nothing to compile', async () => {
    const result = await runCompileCycle({
      provider: 'deepseek',
      apiKey: '',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
    })

    const rows = await dbListOperatingEvents(5)

    expect(result.drawersProcessed).toBe(0)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      type: 'agent_action',
      stage: 'compile',
      title: 'Wiki 编译巡检完成',
      summary: '未发现待编译 drawer。',
      source_kind: 'wiki',
      source_title: 'Wiki 编译器',
    })

    const payload = JSON.parse(rows[0].payload_json) as { status: string; agentId: string }
    expect(payload.status).toBe('completed')
    expect(payload.agentId).toBe('wiki-compiler')
  })
})
