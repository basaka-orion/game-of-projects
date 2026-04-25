/**
 * 安全存储工具 — API Key 加密存储
 *
 * 在 Electron 环境中使用 safeStorage 加密/解密敏感数据
 * 在浏览器开发模式中回退到 localStorage（前缀标记）
 */

/** 敏感 key 列表 — 这些 key 的值应该加密存储 */
const SENSITIVE_KEYS = [
  'llm_api_key',
  'telegram_bot_token',
  'brave_api_key',
  'exa_api_key',
] as const

/** 判断 key 是否为敏感数据 */
export function isSensitiveKey(key: string): boolean {
  return (SENSITIVE_KEYS as readonly string[]).includes(key) ||
    key.includes('api_key') ||
    key.includes('bot_token') ||
    key.includes('_secret')
}

/**
 * 加密存储敏感值
 * Electron 环境走 safeStorage，否则走 localStorage（开发模式）
 */
export async function encryptAndStore(key: string, value: string): Promise<void> {
  const electronAPI = (window as any)?.electronAPI
  if (electronAPI?.safeStorageSet) {
    await electronAPI.safeStorageSet(key, value)
  } else {
    // 开发模式回退 — 使用 base64 编码（非加密，仅混淆）
    localStorage.setItem(`__enc_${key}`, btoa(unescape(encodeURIComponent(value))))
  }
}

/**
 * 解密读取敏感值
 */
export async function decryptAndRead(key: string, fallback = ''): Promise<string> {
  const electronAPI = (window as any)?.electronAPI
  if (electronAPI?.safeStorageGet) {
    const val = await electronAPI.safeStorageGet(key)
    return val ?? fallback
  } else {
    // 开发模式回退
    const encoded = localStorage.getItem(`__enc_${key}`)
    if (!encoded) return fallback
    try {
      return decodeURIComponent(escape(atob(encoded)))
    } catch {
      return fallback
    }
  }
}

/**
 * 从旧的明文 localStorage 迁移到安全存储
 * 仅在首次运行时调用
 */
export async function migrateSensitiveKeys(): Promise<number> {
  let migrated = 0
  const settingsRaw = localStorage.getItem('gop_settings')
  if (!settingsRaw) return 0

  try {
    const settings = JSON.parse(settingsRaw)
    for (const key of Object.keys(settings)) {
      if (isSensitiveKey(key) && settings[key]) {
        await encryptAndStore(key, settings[key])
        // 清除旧的明文存储
        settings[key] = '[MIGRATED_TO_SAFE_STORAGE]'
        migrated++
      }
    }
    localStorage.setItem('gop_settings', JSON.stringify(settings))
  } catch {
    console.warn('[safe-storage] 迁移失败')
  }

  return migrated
}
