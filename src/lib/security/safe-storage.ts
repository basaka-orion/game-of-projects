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

export const SECRET_REF_PREFIX = 'safe-storage:'

const secretCache = new Map<string, string>()

export function safeStorageRef(key: string): string {
  return `${SECRET_REF_PREFIX}${key}`
}

export function parseSafeStorageRef(value: string): string | null {
  if (!value.startsWith(SECRET_REF_PREFIX)) return null
  const key = value.slice(SECRET_REF_PREFIX.length).trim()
  return key || null
}

export function isSafeStorageRef(value: string): boolean {
  return Boolean(parseSafeStorageRef(value))
}

export function cacheSecret(key: string, value: string): void {
  secretCache.set(key, value)
}

export function readCachedSecret(key: string, fallback = ''): string {
  return secretCache.has(key) ? secretCache.get(key) || '' : fallback
}

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
  cacheSecret(key, value)
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
  if (secretCache.has(key)) return secretCache.get(key) || fallback
  const electronAPI = (window as any)?.electronAPI
  if (electronAPI?.safeStorageGet) {
    const val = await electronAPI.safeStorageGet(key)
    if (typeof val === 'string') cacheSecret(key, val)
    return val ?? fallback
  } else {
    // 开发模式回退
    const encoded = localStorage.getItem(`__enc_${key}`)
    if (!encoded) return fallback
    try {
      const value = decodeURIComponent(escape(atob(encoded)))
      cacheSecret(key, value)
      return value
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
      const value = String(settings[key] || '')
      if (isSensitiveKey(key) && value && !isSafeStorageRef(value)) {
        await encryptAndStore(key, value)
        settings[key] = safeStorageRef(key)
        migrated++
      } else if (isSensitiveKey(key) && isSafeStorageRef(value)) {
        await decryptAndRead(parseSafeStorageRef(value) || key, '')
      }
    }
    localStorage.setItem('gop_settings', JSON.stringify(settings))
  } catch {
    console.warn('[safe-storage] 迁移失败')
  }

  return migrated
}
