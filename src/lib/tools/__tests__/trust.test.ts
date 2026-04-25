import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dbListOperatingEvents } from '../../db/repository'
import { executeTool } from '../index'
import { getToolRisk } from '../trust'

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

describe('tool trust audit', () => {
  beforeEach(() => {
    const localStorage = createStorage()
    vi.stubGlobal('localStorage', localStorage)
    vi.stubGlobal('window', {
      localStorage,
      electronAPI: {
        executeCommand: vi.fn(),
      },
    })
  })

  it('marks high-risk tools and records rejected terminal commands', async () => {
    expect(getToolRisk({ id: 'terminal', tier: 2 })).toBe('high')
    expect(getToolRisk({ id: 'web_search', tier: 1 })).toBe('low')

    const result = await executeTool('terminal', { command: 'rm -rf /' })
    const events = await dbListOperatingEvents(5)
    const payload = JSON.parse(events[0].payload_json)

    expect(result.success).toBe(false)
    expect(result.error).toContain('终端命令被拒绝')
    expect(events[0]).toMatchObject({
      type: 'agent_action',
      stage: 'execute',
      title: '工具调用：终端执行',
    })
    expect(payload.receipt.trust.risk).toBe('high')
    expect(payload.receipt.retry.recommended).toBe(true)
    expect(payload.receipt.trust.rationale).toContain('Command guard')
  })
})
