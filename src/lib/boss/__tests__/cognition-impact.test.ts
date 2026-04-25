import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dbListOperatingEvents } from '../../db/repository'
import { saveCognitiveProfile } from '../cognitive-profile'

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

describe('Boss cognition impact', () => {
  beforeEach(() => {
    const localStorage = createStorage()
    vi.stubGlobal('localStorage', localStorage)
    vi.stubGlobal('window', { localStorage })
  })

  it('records affected agent surfaces when the manual cognitive profile changes', async () => {
    saveCognitiveProfile({
      mission: '把资料转译成 Boss 能吸收的认知框架。',
      excitementTriggers: ['系统闭环'],
      resonanceHooks: ['张力与对比'],
      explanationPreferences: ['结论 + 证据 + 下一步'],
      addictiveFormats: ['路线图'],
      understandingModes: ['分层拆解'],
      antiPatterns: ['空泛鸡汤'],
      integrationGoals: ['外脑 OS'],
    })
    await Promise.resolve()
    await Promise.resolve()

    const rows = await dbListOperatingEvents(5)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      type: 'boss_signal',
      stage: 'understand',
      source_kind: 'manual',
      source_title: 'Boss 手动画像',
    })
    expect(rows[0].summary).toContain('Boss 认知画像已更新')
    expect(rows[0].summary).toContain('WarRoom')
    expect(rows[0].summary).toContain('Telegram Bot')

    const payload = JSON.parse(rows[0].payload_json) as {
      signalKind: string
      profileImpact: string
      entities: string[]
    }
    expect(payload.signalKind).toBe('cognitive_style')
    expect(payload.profileImpact).toBe('high')
    expect(payload.entities).toContain('WarRoom')
    expect(payload.entities).toContain('Telegram Bot')
  })
})
