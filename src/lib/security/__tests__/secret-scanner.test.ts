import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSetting, getSettingAsync, setSetting } from '../../db/store'
import { hasQuarantinedSecrets, scanSecrets } from '../secret-scanner'
import { isSafeStorageRef, migrateSensitiveKeys, parseSafeStorageRef } from '../safe-storage'

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

describe('secret scanner and safe storage refs', () => {
  beforeEach(() => {
    const localStorage = createStorage()
    vi.stubGlobal('localStorage', localStorage)
    vi.stubGlobal('window', { localStorage })
  })

  it('quarantines likely API keys without returning the raw value', () => {
    const raw = 'openai_api_key = sk-test_123456789012345678901234567890'
    const report = scanSecrets(raw)

    expect(hasQuarantinedSecrets(report)).toBe(true)
    expect(report.findings[0].kind).toBe('openai_api_key')
    expect(JSON.stringify(report)).not.toContain('sk-test_123456789012345678901234567890')
  })

  it('stores sensitive settings as safe-storage references while keeping sync reads cache-backed', async () => {
    setSetting('openai_api_key', 'sk-live_123456789012345678901234567890')

    const rawSettings = JSON.parse(localStorage.getItem('gop_settings') || '{}') as Record<string, string>
    expect(isSafeStorageRef(rawSettings.openai_api_key)).toBe(true)
    expect(parseSafeStorageRef(rawSettings.openai_api_key)).toBe('openai_api_key')
    expect(rawSettings.openai_api_key).not.toContain('sk-live')
    expect(getSetting('openai_api_key')).toBe('sk-live_123456789012345678901234567890')
    expect(await getSettingAsync('openai_api_key')).toBe('sk-live_123456789012345678901234567890')
  })

  it('migrates existing plaintext settings to secret references', async () => {
    localStorage.setItem(
      'gop_settings',
      JSON.stringify({ anthropic_api_key: 'sk-ant-test_123456789012345678901234567890' }),
    )

    const migrated = await migrateSensitiveKeys()
    const rawSettings = JSON.parse(localStorage.getItem('gop_settings') || '{}') as Record<string, string>

    expect(migrated).toBe(1)
    expect(rawSettings.anthropic_api_key).toBe('safe-storage:anthropic_api_key')
    expect(JSON.stringify(rawSettings)).not.toContain('sk-ant-test')
  })
})
