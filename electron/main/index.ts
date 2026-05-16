import {
  app,
  BrowserWindow,
  screen,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  dialog,
  safeStorage,
  type IpcMainInvokeEvent,
  type MessageBoxSyncOptions,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { exec, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { bundle as bundleRemotion } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import { ProxyAgent } from 'undici'
import { query, run, exportDatabase, importDatabase, getDatabase } from './database'
import { validateCommand } from '../../src/lib/security/command-guard'
import { extractFetchedUrlMetadata } from '../../src/lib/bili-helper/web-metadata'

// ─── AI Provider helpers (main process) ───

const DEFAULT_LLM_CONFIGS: Record<string, { baseUrl: string; model: string }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  minimax: { baseUrl: 'https://api.minimax.chat/v1', model: 'minimax-M2.7' },
  ollama: { baseUrl: 'http://localhost:11434/v1', model: 'gemma3:4b' },
  glm: { baseUrl: 'https://api.z.ai/api/coding/paas/v4', model: 'glm-5.1' },
}

const SANDBOX_WINDOW_TABS = new Set([
  'overview',
  'neurons',
  'warroom',
  'profiling',
  'synapses',
  'boss',
  'memory',
  'knowledge',
  'workflow',
  'control',
  'scheduler',
  'teams',
  'xiaobai',
])

function normalizeBaseUrl(provider: string, baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (provider === 'glm' && trimmed === 'https://api.z.ai/api/paas/v4') {
    return 'https://api.z.ai/api/coding/paas/v4'
  }
  return trimmed || baseUrl
}

interface LLMConfigMain {
  provider: string
  apiKey: string
  baseUrl: string
  model: string
}

interface BraveSearchResult {
  title: string
  url: string
  description: string
  age?: string
}

const execFileAsync = promisify(execFile)
const proxyAgentCache = new Map<string, ProxyAgent>()
let proxyUrlCache: { value: string; expiresAt: number } | null = null

function normalizeProxyUrl(value: string): string {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^socks/i.test(trimmed)) return ''
  if (/^[\w.-]+:\d+$/.test(trimmed)) return `http://${trimmed}`
  return ''
}

function parseMacProxyUrl(stdout: string): string {
  const valueFor = (key: string) => stdout.match(new RegExp(`${key}\\s*:\\s*([^\\n]+)`))?.[1]?.trim() || ''
  const httpsEnabled = valueFor('HTTPSEnable') === '1'
  const httpEnabled = valueFor('HTTPEnable') === '1'
  const httpsHost = valueFor('HTTPSProxy')
  const httpsPort = valueFor('HTTPSPort')
  const httpHost = valueFor('HTTPProxy')
  const httpPort = valueFor('HTTPPort')
  if (httpsEnabled && httpsHost && httpsPort) return normalizeProxyUrl(`${httpsHost}:${httpsPort}`)
  if (httpEnabled && httpHost && httpPort) return normalizeProxyUrl(`${httpHost}:${httpPort}`)
  return ''
}

async function getSystemProxyUrl(): Promise<string> {
  const now = Date.now()
  if (proxyUrlCache && proxyUrlCache.expiresAt > now) return proxyUrlCache.value
  const envProxy = normalizeProxyUrl(
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    '',
  )
  if (envProxy) {
    proxyUrlCache = { value: envProxy, expiresAt: now + 30000 }
    return envProxy
  }
  if (process.platform !== 'darwin') {
    proxyUrlCache = { value: '', expiresAt: now + 30000 }
    return ''
  }
  try {
    const { stdout } = await execFileAsync('/usr/sbin/scutil', ['--proxy'], { timeout: 1500 })
    const proxyUrl = parseMacProxyUrl(stdout)
    proxyUrlCache = { value: proxyUrl, expiresAt: now + 30000 }
    return proxyUrl
  } catch {
    proxyUrlCache = { value: '', expiresAt: now + 5000 }
    return ''
  }
}

function isExternalHttpUrl(input: RequestInfo | URL): boolean {
  try {
    const parsed = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    return !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
  } catch {
    return false
  }
}

function getProxyAgent(proxyUrl: string): ProxyAgent {
  const cached = proxyAgentCache.get(proxyUrl)
  if (cached) return cached
  const agent = new ProxyAgent(proxyUrl)
  proxyAgentCache.set(proxyUrl, agent)
  return agent
}

async function fetchWithNetworkProxy(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const proxyUrl = isExternalHttpUrl(input) ? await getSystemProxyUrl() : ''
  if (!proxyUrl) return fetch(input, init)
  return fetch(input, {
    ...init,
    dispatcher: getProxyAgent(proxyUrl),
  } as RequestInit & { dispatcher: ProxyAgent })
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    '#39': "'",
    nbsp: ' ',
  }
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const key = entity.toLowerCase()
    if (key in named) return named[key]
    if (key.startsWith('#x')) {
      const codePoint = Number.parseInt(key.slice(2), 16)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
    }
    if (key.startsWith('#')) {
      const codePoint = Number.parseInt(key.slice(1), 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
    }
    return match
  })
}

function stripSearchHtml(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

function normalizeDuckDuckGoUrl(href: string): string {
  const decoded = decodeHtmlEntities(href).trim()
  if (!decoded) return ''
  try {
    const parsed = new URL(decoded, 'https://duckduckgo.com')
    const uddg = parsed.searchParams.get('uddg')
    if (uddg) return decodeURIComponent(uddg)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString()
  } catch {
    /* fall through */
  }
  return /^https?:\/\//i.test(decoded) ? decoded : ''
}

function parseDuckDuckGoResults(html: string, count: number): BraveSearchResult[] {
  const anchors = Array.from(html.matchAll(/<a\b[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi))
  const results: BraveSearchResult[] = []
  for (let index = 0; index < anchors.length && results.length < count; index += 1) {
    const match = anchors[index]
    const nextMatch = anchors[index + 1]
    const block = html.slice(match.index || 0, nextMatch?.index || html.length)
    const url = normalizeDuckDuckGoUrl(match[1])
    const title = stripSearchHtml(match[2]).slice(0, 180)
    if (!url || !title) continue
    const snippetMatch =
      block.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/i) ||
      block.match(/class="[^"]*result__body[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    results.push({
      title,
      url,
      description: snippetMatch ? stripSearchHtml(snippetMatch[1]).slice(0, 360) : '',
      age: '',
    })
  }
  return results
}

async function searchWithDuckDuckGo(
  queryText: string,
  count: number,
  options: { endpoint?: 'web' | 'news'; freshness?: 'pd' | 'pw' | 'pm' | 'py' } = {},
): Promise<BraveSearchResult[]> {
  const query = [
    queryText,
    options.endpoint === 'news' ? 'news' : '',
    options.freshness === 'pd' ? 'past day' : '',
    options.freshness === 'pw' ? 'past week' : '',
    options.freshness === 'pm' ? 'past month' : '',
    options.freshness === 'py' ? 'past year' : '',
  ].filter(Boolean).join(' ')
  const url = new URL('https://html.duckduckgo.com/html/')
  url.searchParams.set('q', query)
  const response = await fetchWithNetworkProxy(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 OpenBasaka/1.0',
    },
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new Error(`DuckDuckGo HTTP ${response.status}`)
  return parseDuckDuckGoResults(await response.text(), count)
}

function getLLMConfigFromDB(): LLMConfigMain | null {
  const providerRow = query('SELECT value FROM settings WHERE key = ?', ['llm_provider']) as Array<{ value: string }>
  const apiKeyRow = query('SELECT value FROM settings WHERE key = ?', ['llm_api_key']) as Array<{ value: string }>
  const baseUrlRow = query('SELECT value FROM settings WHERE key = ?', ['llm_base_url']) as Array<{ value: string }>
  const modelRow = query('SELECT value FROM settings WHERE key = ?', ['llm_model']) as Array<{ value: string }>

  const provider = providerRow[0]?.value || 'deepseek'
  const apiKey = apiKeyRow[0]?.value || ''
  const defaults = DEFAULT_LLM_CONFIGS[provider] || DEFAULT_LLM_CONFIGS.deepseek
  const baseUrl = normalizeBaseUrl(provider, baseUrlRow[0]?.value || defaults.baseUrl)
  const model = modelRow[0]?.value || defaults.model

  if (!apiKey && provider !== 'ollama') return null
  return { provider, apiKey, baseUrl, model }
}

async function resolveLLMConfigSecrets(config: LLMConfigMain | null): Promise<LLMConfigMain | null> {
  if (!config) return null
  let apiKey = config.apiKey
  if (apiKey.startsWith('safe-storage:')) {
    const refKey = apiKey.slice('safe-storage:'.length).trim()
    apiKey = refKey ? await safeStorageGetValue(refKey) : ''
  }
  if (!apiKey && config.provider !== 'ollama') return null
  return { ...config, apiKey }
}

function isAnthropicFormat(baseUrl: string): boolean {
  return baseUrl.includes('/api/anthropic')
}

function buildHeaders(config: LLMConfigMain): Record<string, string> {
  if (isAnthropicFormat(config.baseUrl)) {
    return {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    }
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  }
}

function describeLLMConfig(config: LLMConfigMain): string {
  return `${config.provider}/${config.model} @ ${config.baseUrl}`
}

function friendlyLLMError(status: number, errText: string, config: LLMConfigMain): string {
  let apiMsg = ''
  try {
    const parsed = JSON.parse(errText) as { error?: { message?: string }; message?: string }
    apiMsg = parsed.error?.message || parsed.message || ''
  } catch {
    apiMsg = errText.slice(0, 300)
  }

  if (status === 401) return `模型鉴权失败（${describeLLMConfig(config)}）：API Key 无效或已过期`
  if (status === 402 || /balance|insufficient/i.test(apiMsg)) {
    return `模型账户余额不足（${describeLLMConfig(config)}）：${apiMsg || '请检查余额'}`
  }
  if (status === 429) return `模型请求频率超限（${describeLLMConfig(config)}）：${apiMsg || '请稍后重试'}`
  return `LLM API Error [${status}]（${describeLLMConfig(config)}）：${apiMsg || '无错误详情'}`
}

function getLLMTimeoutMs(config: LLMConfigMain, maxTokens: number): number {
  if (config.provider === 'glm' || /^glm-5/i.test(config.model)) {
    return Math.min(240000, Math.max(120000, maxTokens * 60))
  }
  return Math.min(120000, Math.max(60000, maxTokens * 25))
}

function shouldDisableThinking(config: LLMConfigMain, maxTokens: number): boolean {
  return (config.provider === 'glm' || /^glm-5/i.test(config.model)) && maxTokens <= 2048
}

function buildOpenAIChatBody(
  config: LLMConfigMain,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  maxTokens: number,
): Record<string, unknown> {
  const body: Record<string, unknown> = { model: config.model, messages, temperature, max_tokens: maxTokens }
  if (shouldDisableThinking(config, maxTokens)) {
    body.thinking = { type: 'disabled' }
  }
  return body
}

async function fetchLLM(config: LLMConfigMain, url: string, init: RequestInit, maxTokens: number): Promise<Response> {
  try {
    return await fetchWithNetworkProxy(url, {
      ...init,
      signal: init.signal || AbortSignal.timeout(getLLMTimeoutMs(config, maxTokens)),
    })
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    throw new Error(
      `模型连接失败（${describeLLMConfig(config)}）。请检查模型地址、API Key、网络代理或本地模型服务。原始错误：${raw}`,
    )
  }
}

async function mainProcessChatCompletion(
  config: LLMConfigMain,
  messages: Array<{ role: string; content: string }>,
  temperature = 0.7,
  maxTokens = 4096,
): Promise<string> {
  if (isAnthropicFormat(config.baseUrl)) {
    // Anthropic Messages API format
    let systemPrompt: string | undefined
    const filteredMessages = messages.filter((m) => {
      if (m.role === 'system') {
        systemPrompt = m.content
        return false
      }
      return true
    })
    const response = await fetchLLM(config, `${config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: buildHeaders(config),
      body: JSON.stringify({
        model: config.model,
        system: systemPrompt,
        messages: filteredMessages,
        temperature,
        max_tokens: maxTokens,
      }),
    }, maxTokens)
    if (!response.ok) throw new Error(friendlyLLMError(response.status, await response.text(), config))
    const data = await response.json()
    if (Array.isArray(data.content)) {
      return data.content
        .filter((c: { type: string }) => c.type === 'text')
        .map((c: { text: string }) => c.text)
        .join('')
    }
    return ''
  }

  // OpenAI-compatible format
  const response = await fetchLLM(config, `${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify(buildOpenAIChatBody(config, messages, temperature, maxTokens)),
  }, maxTokens)
  if (!response.ok) throw new Error(friendlyLLMError(response.status, await response.text(), config))
  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

function getBraveApiKey(): string {
  const apiKeyRow = query('SELECT value FROM settings WHERE key = ?', ['brave_api_key']) as Array<{ value: string }>
  return apiKeyRow[0]?.value?.trim() || process.env.BRAVE_API_KEY?.trim() || ''
}

interface GeminiImagePartMain {
  inlineData: {
    data: string
    mimeType: string
  }
}

interface GeminiGeneratePayload {
  imagePart?: GeminiImagePartMain
  prompt: string
  count?: number
}

function getGeminiApiKey(): string {
  const settingKeys = ['gemini_api_key', 'google_api_key', 'aistudio_api_key']
  for (const key of settingKeys) {
    const row = query('SELECT value FROM settings WHERE key = ?', [key]) as Array<{ value: string }>
    const value = row[0]?.value?.trim()
    if (value) return value
  }
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.VITE_GEMINI_API_KEY?.trim() ||
    ''
  )
}

async function generateOneGeminiImage(apiKey: string, payload: GeminiGeneratePayload, attempt = 0): Promise<string> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(apiKey)}`
  const response = await fetchWithNetworkProxy(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [payload.imagePart, { text: payload.prompt }].filter(Boolean),
        },
      ],
      generationConfig: {
        responseModalities: ['IMAGE'],
      },
    }),
    signal: AbortSignal.timeout(120000),
  })

  if (!response.ok) {
    const text = await response.text()
    const retriable = response.status >= 500 || response.status === 429 || /xhr|rpc|busy|timeout/i.test(text)
    if (retriable && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)))
      return generateOneGeminiImage(apiKey, payload, attempt + 1)
    }
    throw new Error(`Gemini image API ${response.status}: ${text.slice(0, 240)}`)
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      finishReason?: string
      content?: {
        parts?: Array<{
          inlineData?: { data?: string; mimeType?: string }
          inline_data?: { data?: string; mime_type?: string }
        }>
      }
    }>
  }

  const candidate = data.candidates?.[0]
  const part = candidate?.content?.parts?.find((item) => item.inlineData?.data || item.inline_data?.data)
  const inlineData = part?.inlineData
  const inlineDataSnake = part?.inline_data
  const imageData = inlineData?.data || inlineDataSnake?.data
  if (!imageData) {
    const reason = candidate?.finishReason ? ` finishReason=${candidate.finishReason}` : ''
    throw new Error(`Gemini did not return image data.${reason}`)
  }
  const mimeType = inlineData?.mimeType || inlineDataSnake?.mime_type || 'image/png'
  return `data:${mimeType};base64,${imageData}`
}

async function searchWithBrave(
  queryText: string,
  count = 5,
  options: {
    endpoint?: 'web' | 'news'
    freshness?: 'pd' | 'pw' | 'pm' | 'py'
    country?: string
    searchLang?: string
  } = {},
): Promise<{ success: boolean; data?: BraveSearchResult[]; error?: string }> {
  const apiKey = getBraveApiKey()
  const safeCount = Math.max(1, Math.min(Number(count) || 5, 10))
  const safeQuery = String(queryText || '').trim()
  const endpoint = options.endpoint === 'news' ? 'news/search' : 'web/search'

  if (!safeQuery) return { success: false, error: 'empty query' }

  const errors: string[] = []
  if (apiKey) {
    const url = new URL(`https://api.search.brave.com/res/v1/${endpoint}`)
    url.searchParams.set('q', safeQuery)
    url.searchParams.set('count', String(safeCount))
    if (options.freshness) url.searchParams.set('freshness', options.freshness)
    if (options.country) url.searchParams.set('country', options.country)
    if (options.searchLang) url.searchParams.set('search_lang', options.searchLang)

    try {
      const response = await fetchWithNetworkProxy(url, {
        headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        errors.push(`Brave HTTP ${response.status}`)
      } else {
        const data = (await response.json()) as {
          results?: Array<BraveSearchResult>
          web?: { results?: Array<BraveSearchResult> }
        }
        const rawResults = endpoint === 'news/search' ? data.results || [] : data.web?.results || []
        const results = rawResults.map((result) => ({
          title: result.title,
          url: result.url,
          description: result.description || '',
          age: result.age || '',
        }))
        if (results.length > 0) return { success: true, data: results }
        errors.push('Brave returned empty results')
      }
    } catch (err) {
      errors.push(`Brave failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  } else {
    errors.push('missing brave_api_key')
  }

  try {
    const fallbackResults = await searchWithDuckDuckGo(safeQuery, safeCount, options)
    if (fallbackResults.length > 0) return { success: true, data: fallbackResults }
    errors.push('public search returned empty results')
  } catch (err) {
    errors.push(`public search failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  return { success: false, error: errors.join('; ') || 'search unavailable' }
}

// vite-plugin-electron 注入 __dirname
const DIST = path.join(__dirname, '../../dist')
const DIST_ELECTRON = path.join(__dirname, '..')
const PRELOAD = path.join(DIST_ELECTRON, 'preload/index.js')
const INDEX_HTML = path.join(DIST, 'index.html')
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

const BIBIGPT_API_BASE = 'https://api.bibigpt.co/api'
const BIBIGPT_SAFE_STORAGE_KEY = 'bibigpt_api_key'

type SafeSecretRecord = {
  encrypted: boolean
  value: string
}

type BibiGptRequestPayload = {
  action?: string
  url?: string
  taskId?: string
  contentId?: string
  apiKey?: string
  summary?: string
  customPrompt?: string
  keyword?: string
  includeDetail?: boolean
  enabledSpeaker?: boolean
  limit?: number
}

function safeSecretFilePath(key: string): string {
  const safeKey = key.replace(/[^a-zA-Z0-9_.-]/g, '_')
  return path.join(app.getPath('userData'), 'safe-storage', `${safeKey}.json`)
}

async function safeStorageSetValue(key: string, value: string): Promise<{ success: boolean; error?: string }> {
  try {
    await fs.promises.mkdir(path.dirname(safeSecretFilePath(key)), { recursive: true })
    const encrypted = safeStorage.isEncryptionAvailable()
    if (!encrypted) return { success: false, error: 'Electron safeStorage 当前不可用，已拒绝明文保存。' }
    const payload: SafeSecretRecord = {
      encrypted,
      value: safeStorage.encryptString(value).toString('base64'),
    }
    await fs.promises.writeFile(safeSecretFilePath(key), JSON.stringify(payload), 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function safeStorageGetValue(key: string): Promise<string> {
  try {
    const payload = JSON.parse(await fs.promises.readFile(safeSecretFilePath(key), 'utf-8')) as SafeSecretRecord
    const buffer = Buffer.from(payload.value || '', 'base64')
    if (payload.encrypted) return safeStorage.decryptString(buffer)
    return buffer.toString('utf-8')
  } catch {
    return ''
  }
}

function getSettingsValue(key: string): string {
  try {
    const rows = query('SELECT value FROM settings WHERE key = ?', [key]) as Array<{ value?: unknown }>
    return String(rows[0]?.value || '').trim()
  } catch {
    return ''
  }
}

async function readConfiguredSecret(keys: string[]): Promise<string> {
  for (const key of keys) {
    const fromSafeStorage = await safeStorageGetValue(key)
    if (fromSafeStorage.trim()) return fromSafeStorage.trim()
  }

  for (const key of keys) {
    const value = getSettingsValue(key)
    if (!value || /^\[redacted\]$/i.test(value)) continue
    if (value.startsWith('safe-storage:')) {
      const refKey = value.slice('safe-storage:'.length).trim()
      const fromRef = refKey ? await safeStorageGetValue(refKey) : ''
      if (fromRef.trim()) return fromRef.trim()
      continue
    }
    return value
  }

  return ''
}

async function saveBibiGptApiKeyValue(apiKey: string): Promise<{ success: boolean; error?: string }> {
  const trimmed = String(apiKey || '').trim()
  if (!trimmed) return { success: false, error: 'BibiGPT API Key 为空。' }
  const saved = await safeStorageSetValue(BIBIGPT_SAFE_STORAGE_KEY, trimmed)
  if (!saved.success) return saved
  try {
    run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['bibigpt_api_key', `safe-storage:${BIBIGPT_SAFE_STORAGE_KEY}`])
  } catch {
    /* The safeStorage file is still the source of truth. */
  }
  return { success: true }
}

async function getBibiGptApiKey(): Promise<string> {
  return (
    (await readConfiguredSecret([
      BIBIGPT_SAFE_STORAGE_KEY,
      'bibigpt_api_key',
      'bibi_gpt_api_key',
      'bibigpt_token',
      'bibi_gpt_token',
      'BIBIGPT_API_KEY',
    ])) ||
    process.env.BIBIGPT_API_KEY?.trim() ||
    process.env.BIBIGPT_API_TOKEN?.trim() ||
    process.env.BIBIGPT_TOKEN?.trim() ||
    ''
  )
}

function bibiGptQuery(params: Record<string, unknown>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    query.set(key, String(value))
  }
  const result = query.toString()
  return result ? `?${result}` : ''
}

async function callBibiGpt(pathname: string, init: RequestInit = {}, auth = true): Promise<{ success: boolean; data?: unknown; configured: boolean; status?: number; error?: string }> {
  const apiKey = await getBibiGptApiKey()
  if (auth && !apiKey) {
    return { success: false, configured: false, error: 'BibiGPT API Key 未配置。' }
  }
  try {
    const response = await fetchWithNetworkProxy(`${BIBIGPT_API_BASE}${pathname}`, {
      ...init,
      signal: AbortSignal.timeout(45000),
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(auth ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...(init.headers || {}),
      },
    })
    const text = await response.text()
    let data: unknown = text
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = text
    }
    if (!response.ok) {
      const message =
        typeof data === 'object' && data && 'message' in data
          ? String((data as { message?: unknown }).message)
          : `BibiGPT HTTP ${response.status}`
      return { success: false, configured: Boolean(apiKey), status: response.status, error: message }
    }
    return { success: true, configured: Boolean(apiKey), status: response.status, data }
  } catch (err) {
    return { success: false, configured: Boolean(apiKey), error: err instanceof Error ? err.message : String(err) }
  }
}

async function handleBibiGptRequest(payload: BibiGptRequestPayload): Promise<{ success: boolean; data?: unknown; configured?: boolean; status?: number; error?: string }> {
  const action = String(payload?.action || 'health')
  if (action === 'configure') {
    const saved = await saveBibiGptApiKeyValue(String(payload.apiKey || ''))
    if (!saved.success) return { success: false, configured: false, error: saved.error || 'BibiGPT API Key 保存失败。' }
    return { success: true, configured: true, data: { saved: true } }
  }
  if (action === 'health') {
    const key = await getBibiGptApiKey()
    if (!key) return { success: false, configured: false, error: 'BibiGPT API Key 未配置。' }
    return callBibiGpt('/version', {}, true)
  }
  if (action === 'summarize') {
    return callBibiGpt(`/v1/summarize${bibiGptQuery({ url: payload.url, includeDetail: payload.includeDetail ?? true })}`)
  }
  if (action === 'summarizeWithConfig') {
    return callBibiGpt('/v1/summarizeWithConfig', {
      method: 'POST',
      body: JSON.stringify({
        url: payload.url,
        includeDetail: payload.includeDetail ?? true,
        promptConfig: {
          outputLanguage: 'zh-CN',
          showTimestamp: true,
          detailLevel: 900,
          sentenceNumber: 8,
        },
      }),
    })
  }
  if (action === 'createSummaryTask') {
    return callBibiGpt(`/v1/createSummaryTask${bibiGptQuery({ url: payload.url })}`)
  }
  if (action === 'taskStatus') {
    return callBibiGpt(`/v1/getSummaryTaskStatus${bibiGptQuery({ taskId: payload.taskId, includeDetail: payload.includeDetail ?? true })}`)
  }
  if (action === 'getSubtitle') {
    return callBibiGpt(`/v1/getSubtitle${bibiGptQuery({ url: payload.url, enabledSpeaker: payload.enabledSpeaker ?? true })}`)
  }
  if (action === 'summaryByPrompt') {
    return callBibiGpt('/v1/summary/byPrompt', {
      method: 'POST',
      body: JSON.stringify({
        contentId: payload.contentId,
        customPrompt: payload.customPrompt,
        outputLanguage: 'zh-CN',
      }),
    })
  }
  if (action === 'mindmap') {
    return callBibiGpt('/v1/video/mindmap', {
      method: 'POST',
      body: JSON.stringify({
        contentId: payload.contentId,
        summary: payload.summary,
      }),
    })
  }
  if (action === 'libraryList') {
    return callBibiGpt(`/v1/library/list${bibiGptQuery({ limit: payload.limit || 20 })}`)
  }
  if (action === 'librarySearch') {
    return callBibiGpt(`/v1/library/search${bibiGptQuery({ keyword: payload.keyword, limit: payload.limit || 10 })}`)
  }
  return { success: false, configured: Boolean(await getBibiGptApiKey()), error: `未知 BibiGPT action: ${action}` }
}

let ghostWindow: BrowserWindow | null = null
let sandboxWindow: BrowserWindow | null = null
let tray: Tray | null = null
let remotionServeUrlPromise: Promise<string> | null = null

type RemotionCompositionId = 'portrait-reveal' | 'landscape-brief'
type RemotionRenderProgressEvent = {
  phase: 'bundling' | 'rendering' | 'done' | 'error'
  progress: number
  message?: string
  renderedFrames?: number
  encodedFrames?: number
  outputPath?: string
}

function sanitizeFileName(value: string): string {
  return (
    value
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'profiling-video'
  )
}

type ExtractedFileKind = 'text' | 'document' | 'pdf' | 'image' | 'audio' | 'video' | 'binary'

type ExtractedFileContent = {
  success: boolean
  kind: ExtractedFileKind
  method: string
  content: string
  rawContent?: string
  warnings: string[]
  metadata: {
    fileName: string
    filePath: string
    extension: string
    size: number
  }
  error?: string
}

type MediaTranscriptionResult = ExtractedFileContent & {
  transcriptPath?: string
  missingProvider?: boolean
}

type ImageClassificationLabel = {
  identifier: string
  confidence: number
}

const TEXT_INTAKE_EXTENSIONS = new Set([
  '.md', '.txt', '.markdown', '.json', '.csv', '.tsv',
  '.ts', '.tsx', '.js', '.jsx', '.mjs',
  '.py', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.cpp', '.h',
  '.html', '.css', '.scss', '.yaml', '.yml', '.toml', '.xml',
  '.sh', '.bash', '.zsh', '.sql', '.graphql',
  '.rb', '.php', '.lua', '.dart', '.r', '.scala', '.clj',
])
const DOCUMENT_INTAKE_EXTENSIONS = new Set(['.doc', '.docx', '.rtf', '.odt'])
const PDF_INTAKE_EXTENSIONS = new Set(['.pdf'])
const IMAGE_INTAKE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.tif', '.tiff'])
const AUDIO_INTAKE_EXTENSIONS = new Set(['.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg'])
const VIDEO_INTAKE_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv'])
const TRANSCRIPT_TEXT_EXTENSIONS = new Set(['.srt', '.vtt', '.ass', '.ssa', '.lrc'])
const TRANSCRIPT_SIDECAR_EXTENSIONS = ['.srt', '.vtt', '.ass', '.ssa', '.lrc', '.txt', '.md']

function getIntakeExtension(filePath: string): string {
  return path.extname(filePath || '').toLowerCase()
}

function classifyIntakeFile(filePath: string): ExtractedFileKind {
  const extension = getIntakeExtension(filePath)
  if (TEXT_INTAKE_EXTENSIONS.has(extension)) return 'text'
  if (DOCUMENT_INTAKE_EXTENSIONS.has(extension)) return 'document'
  if (TRANSCRIPT_TEXT_EXTENSIONS.has(extension)) return 'text'
  if (PDF_INTAKE_EXTENSIONS.has(extension)) return 'pdf'
  if (IMAGE_INTAKE_EXTENSIONS.has(extension)) return 'image'
  if (AUDIO_INTAKE_EXTENSIONS.has(extension)) return 'audio'
  if (VIDEO_INTAKE_EXTENSIONS.has(extension)) return 'video'
  return 'binary'
}

function getToolPathEnv(): string {
  const existing = (process.env.PATH || '').split(':').filter(Boolean)
  const additions = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']
  return Array.from(new Set([...existing, ...additions])).join(':')
}

function runFileTool(command: string, args: string[], timeout = 20000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        timeout,
        maxBuffer: 24 * 1024 * 1024,
        encoding: 'utf8',
        env: { ...process.env, PATH: getToolPathEnv() },
      },
      (error, stdout, stderr) => {
        if (error) {
          const message = stderr || error.message || String(error)
          reject(new Error(message))
          return
        }
        resolve({ stdout: stdout || '', stderr: stderr || '' })
      },
    )
  })
}

async function findExecutable(names: string[]): Promise<string | null> {
  for (const name of names) {
    try {
      const { stdout } = await runFileTool('/usr/bin/which', [name], 3000)
      const candidate = stdout.trim().split('\n')[0]
      if (candidate) return candidate
    } catch {
      /* Try the next executable name. */
    }
  }
  return null
}

async function readSpotlightText(filePath: string): Promise<string> {
  const { stdout } = await runFileTool('mdls', ['-raw', '-name', 'kMDItemTextContent', filePath], 18000)
  const text = stdout.trim()
  if (!text || text === '(null)' || text === 'null') return ''
  return text
}

async function readStringsFallback(filePath: string): Promise<string> {
  const { stdout } = await runFileTool('strings', ['-a', filePath], 12000)
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length >= 3 && /[\p{L}\p{N}]/u.test(line))
    .slice(0, 1200)
    .join('\n')
}

function cleanTranscriptText(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== 'WEBVTT')
    .filter((line) => !/^\d+$/.test(line))
    .filter((line) => !/^\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s+-->\s+\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/.test(line))
    .map((line) => line.replace(/<[^>]+>/g, '').replace(/\\N/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

async function findSidecarTranscript(filePath: string): Promise<{ filePath: string; content: string } | null> {
  const directory = path.dirname(filePath)
  const parsed = path.parse(filePath)
  const exactCandidates = TRANSCRIPT_SIDECAR_EXTENSIONS.map((extension) => path.join(directory, `${parsed.name}${extension}`))

  for (const candidate of exactCandidates) {
    try {
      const content = cleanTranscriptText(await fs.promises.readFile(candidate, 'utf-8'))
      if (content) return { filePath: candidate, content }
    } catch {
      /* Try fuzzy candidates below. */
    }
  }

  try {
    const entries = await fs.promises.readdir(directory)
    const base = parsed.name.toLowerCase()
    const fuzzy = entries.find((entry) => {
      const ext = path.extname(entry).toLowerCase()
      const name = path.basename(entry, ext).toLowerCase()
      return TRANSCRIPT_SIDECAR_EXTENSIONS.includes(ext) && name.startsWith(base) && name !== base
    })
    if (!fuzzy) return null
    const candidate = path.join(directory, fuzzy)
    const content = cleanTranscriptText(await fs.promises.readFile(candidate, 'utf-8'))
    return content ? { filePath: candidate, content } : null
  } catch {
    return null
  }
}

async function readWhisperTranscript(outputDir: string, sourcePath: string): Promise<{ filePath: string; content: string }> {
  const expected = path.join(outputDir, `${path.parse(sourcePath).name}.txt`)
  try {
    const content = cleanTranscriptText(await fs.promises.readFile(expected, 'utf-8'))
    if (content) return { filePath: expected, content }
  } catch {
    /* Fall back to scanning the output directory. */
  }

  const entries = await fs.promises.readdir(outputDir)
  const txtFiles = await Promise.all(
    entries
      .filter((entry) => path.extname(entry).toLowerCase() === '.txt')
      .map(async (entry) => {
        const filePath = path.join(outputDir, entry)
        const stat = await fs.promises.stat(filePath)
        return { filePath, mtimeMs: stat.mtimeMs }
      }),
  )
  txtFiles.sort((left, right) => right.mtimeMs - left.mtimeMs)

  for (const candidate of txtFiles) {
    const content = cleanTranscriptText(await fs.promises.readFile(candidate.filePath, 'utf-8'))
    if (content) return { filePath: candidate.filePath, content }
  }

  throw new Error('Whisper 已运行，但没有生成可用的 txt 字幕文本。')
}

async function transcribeWithLocalWhisper(
  filePath: string,
  kind: ExtractedFileKind,
  metadata: ExtractedFileContent['metadata'],
): Promise<MediaTranscriptionResult> {
  const whisperCommand = await findExecutable(['whisper'])
  const warnings: string[] = []

  if (!whisperCommand) {
    warnings.push('没有找到同名字幕，也没有检测到本地 whisper 命令。')
    warnings.push('安装 OpenAI Whisper 后重启应用，再点“转写/补字幕”即可自动写回知识库。')
    const content = buildMediaPlaceholder({ filePath, kind, size: metadata.size, warnings })
    return {
      success: false,
      kind,
      method: 'missing-whisper',
      content,
      rawContent: content,
      warnings,
      metadata,
      missingProvider: true,
      error: '未检测到本地 Whisper。建议安装命令：pipx install openai-whisper 或 pip install -U openai-whisper',
    }
  }

  const outputDir = path.join(
    os.tmpdir(),
    'openbasaka-transcripts',
    `${Date.now()}-${sanitizeFileName(path.parse(filePath).name || metadata.fileName)}`,
  )
  await fs.promises.mkdir(outputDir, { recursive: true })

  const model = (process.env.OPENBASAKA_WHISPER_MODEL || 'base').trim()
  const language = (process.env.OPENBASAKA_WHISPER_LANGUAGE || '').trim()
  const args = [
    filePath,
    '--model',
    model,
    '--output_format',
    'txt',
    '--output_dir',
    outputDir,
  ]
  if (language && language.toLowerCase() !== 'auto') {
    args.push('--language', language)
  }

  const { stderr } = await runFileTool(whisperCommand, args, 30 * 60 * 1000)
  if (stderr.trim()) {
    warnings.push(`Whisper 输出提示：${stderr.trim().slice(0, 500)}`)
  }

  const transcript = await readWhisperTranscript(outputDir, filePath)
  const content = buildExtractedMediaContent({
    filePath,
    title: metadata.fileName,
    sectionTitle: '本地 Whisper 转写',
    body: transcript.content,
    sourcePath: transcript.filePath,
  })

  return {
    success: true,
    kind,
    method: 'whisper-local',
    content,
    rawContent: transcript.content,
    warnings,
    metadata,
    transcriptPath: transcript.filePath,
  }
}

async function transcribeMediaFile(filePath: string): Promise<MediaTranscriptionResult> {
  const stat = await fs.promises.stat(filePath)
  const extension = getIntakeExtension(filePath)
  const kind = classifyIntakeFile(filePath)
  const metadata = {
    fileName: path.basename(filePath),
    filePath,
    extension,
    size: stat.size,
  }

  if (kind !== 'audio' && kind !== 'video') {
    const warnings = ['这个文件不是音频或视频，不需要转写。']
    return {
      success: false,
      kind,
      method: 'not-media',
      content: '',
      rawContent: '',
      warnings,
      metadata,
      error: warnings[0],
    }
  }

  const sidecar = await findSidecarTranscript(filePath)
  if (sidecar) {
    const content = buildExtractedMediaContent({
      filePath,
      title: metadata.fileName,
      sectionTitle: '同名字幕 / 文字稿',
      body: sidecar.content,
      sourcePath: sidecar.filePath,
    })
    return {
      success: true,
      kind,
      method: 'sidecar-transcript',
      content,
      rawContent: sidecar.content,
      warnings: [],
      metadata,
      transcriptPath: sidecar.filePath,
    }
  }

  return transcribeWithLocalWhisper(filePath, kind, metadata)
}

async function runAppleVisionOcr(filePath: string): Promise<string> {
  const script = `
import Foundation
import Vision
import AppKit

let path = CommandLine.arguments.dropFirst().first ?? ""
let url = URL(fileURLWithPath: path)
guard let image = NSImage(contentsOf: url) else {
  exit(2)
}
var rect = CGRect(origin: .zero, size: image.size)
guard let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
  exit(3)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US", "ja-JP", "ko-KR"]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try handler.perform([request])
let lines = (request.results ?? []).compactMap { observation in
  observation.topCandidates(1).first?.string
}
print(lines.joined(separator: "\\n"))
`
  const dir = path.join(os.tmpdir(), 'openbasaka-intake')
  await fs.promises.mkdir(dir, { recursive: true })
  const scriptPath = path.join(dir, 'vision-ocr.swift')
  await fs.promises.writeFile(scriptPath, script, 'utf-8')
  const { stdout } = await runFileTool('xcrun', ['swift', scriptPath, filePath], 60000)
  return stdout.trim()
}

async function runAppleVisionImageClassification(filePath: string): Promise<ImageClassificationLabel[]> {
  const script = `
import Foundation
import Vision
import AppKit

let path = CommandLine.arguments.dropFirst().first ?? ""
let url = URL(fileURLWithPath: path)
guard let image = NSImage(contentsOf: url) else {
  exit(2)
}
var rect = CGRect(origin: .zero, size: image.size)
guard let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
  exit(3)
}

let request = VNClassifyImageRequest()
let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try handler.perform([request])
let rows = (request.results ?? []).prefix(8).map { observation in
  [
    "identifier": observation.identifier,
    "confidence": Double(observation.confidence)
  ] as [String : Any]
}
let data = try JSONSerialization.data(withJSONObject: rows, options: [])
FileHandle.standardOutput.write(data)
`
  const dir = path.join(os.tmpdir(), 'openbasaka-intake')
  await fs.promises.mkdir(dir, { recursive: true })
  const scriptPath = path.join(dir, 'vision-classify.swift')
  await fs.promises.writeFile(scriptPath, script, 'utf-8')
  const { stdout } = await runFileTool('xcrun', ['swift', scriptPath, filePath], 60000)
  if (!stdout.trim()) return []
  const parsed = JSON.parse(stdout) as Array<Partial<ImageClassificationLabel>>
  return parsed
    .map((item) => ({
      identifier: String(item.identifier || '').trim(),
      confidence: Number(item.confidence) || 0,
    }))
    .filter((item) => item.identifier && item.confidence >= 0.08)
    .slice(0, 8)
}

type DesktopCapturePayload = {
  includeOcr?: boolean
  fileBaseName?: string
  region?: { x: number; y: number; width: number; height: number }
}

async function captureDesktopScreen(payload: DesktopCapturePayload = {}) {
  const outputDir = path.join(app.getPath('userData'), 'team-observations')
  await fs.promises.mkdir(outputDir, { recursive: true })
  const fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${sanitizeFileName(payload.fileBaseName || 'screen')}.png`
  const outputPath = path.join(outputDir, fileName)
  const args = ['-x', '-t', 'png']
  const region = payload.region
  if (
    region &&
    Number.isFinite(region.x) &&
    Number.isFinite(region.y) &&
    Number.isFinite(region.width) &&
    Number.isFinite(region.height) &&
    region.width > 0 &&
    region.height > 0
  ) {
    args.push('-R', `${Math.round(region.x)},${Math.round(region.y)},${Math.round(region.width)},${Math.round(region.height)}`)
  }
  args.push(outputPath)

  try {
    await runFileTool('/usr/sbin/screencapture', args, 20000)
    const stat = await fs.promises.stat(outputPath)
    const display = screen.getPrimaryDisplay()
    let ocrText = ''
    const warnings: string[] = []
    if (payload.includeOcr !== false) {
      try {
        ocrText = await runAppleVisionOcr(outputPath)
      } catch (err) {
        warnings.push(`OCR 失败: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    return {
      success: true,
      path: outputPath,
      mimeType: 'image/png',
      size: stat.size,
      display: {
        id: display.id,
        scaleFactor: display.scaleFactor,
        bounds: display.bounds,
        workArea: display.workArea,
      },
      region: region || null,
      ocrText,
      warnings,
    }
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? `${err.message}。如果 macOS 拒绝截图，请在系统设置里给本应用开启屏幕录制权限。`
          : String(err),
      path: outputPath,
    }
  }
}

type DesktopControlPayload = {
  action?: 'activate_app' | 'open_path' | 'open_url' | 'keystroke' | 'shortcut' | 'press_key' | 'click' | 'menu_click'
  appName?: string
  path?: string
  url?: string
  text?: string
  key?: string
  modifiers?: Array<'command' | 'shift' | 'option' | 'control'>
  x?: number
  y?: number
  menuPath?: string[]
}

const DESKTOP_CONTROL_KEYCODES: Record<string, number> = {
  return: 36,
  enter: 36,
  escape: 53,
  esc: 53,
  tab: 48,
  space: 49,
  delete: 51,
  backspace: 51,
  left: 123,
  right: 124,
  down: 125,
  up: 126,
  home: 115,
  end: 119,
  pageup: 116,
  pagedown: 121,
}

function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function appleScriptModifiers(modifiers?: DesktopControlPayload['modifiers']): string {
  const allowed = new Set(['command', 'shift', 'option', 'control'])
  const parts = (modifiers || []).filter((modifier) => allowed.has(modifier)).map((modifier) => `${modifier} down`)
  return parts.length ? ` using {${parts.join(', ')}}` : ''
}

function validateDesktopText(value: string, field: string, max = 4000): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${field} 不能为空`)
  if (trimmed.length > max) throw new Error(`${field} 太长，已拒绝`)
  return trimmed
}

async function runDesktopControl(payload: DesktopControlPayload = {}) {
  const action = payload.action || 'activate_app'
  try {
    if (action === 'open_path') {
      const target = validateDesktopText(payload.path || '', 'path', 2000)
      await runFileTool('/usr/bin/open', [target], 10000)
      return { success: true, action, target }
    }
    if (action === 'open_url') {
      const target = validateDesktopText(payload.url || '', 'url', 2000)
      if (!/^https?:\/\//i.test(target)) return { success: false, action, error: '只允许打开 http/https URL' }
      await runFileTool('/usr/bin/open', [target], 10000)
      return { success: true, action, target }
    }

    const appName = validateDesktopText(payload.appName || 'System Events', 'appName', 120)
    let script = ''
    if (action === 'activate_app') {
      script = `tell application ${appleScriptString(appName)} to activate`
    } else if (action === 'keystroke') {
      const text = validateDesktopText(payload.text || '', 'text')
      script = `tell application ${appleScriptString(appName)} to activate
delay 0.2
tell application "System Events" to keystroke ${appleScriptString(text)}`
    } else if (action === 'shortcut') {
      const key = validateDesktopText(payload.key || '', 'key', 40)
      script = `tell application ${appleScriptString(appName)} to activate
delay 0.2
tell application "System Events" to keystroke ${appleScriptString(key)}${appleScriptModifiers(payload.modifiers)}`
    } else if (action === 'press_key') {
      const key = validateDesktopText(payload.key || '', 'key', 40).toLowerCase()
      const keyCode = DESKTOP_CONTROL_KEYCODES[key]
      if (!keyCode) return { success: false, action, error: `不支持的按键: ${key}` }
      script = `tell application ${appleScriptString(appName)} to activate
delay 0.2
tell application "System Events" to key code ${keyCode}${appleScriptModifiers(payload.modifiers)}`
    } else if (action === 'click') {
      const x = Math.round(Number(payload.x))
      const y = Math.round(Number(payload.y))
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
        return { success: false, action, error: 'click 需要有效的 x/y 坐标' }
      }
      script = `tell application ${appleScriptString(appName)} to activate
delay 0.2
tell application "System Events" to click at {${x}, ${y}}`
    } else if (action === 'menu_click') {
      const menuPath = (payload.menuPath || []).map((item) => item.trim()).filter(Boolean).slice(0, 4)
      if (menuPath.length < 2) return { success: false, action, error: 'menu_click 至少需要 [菜单, 菜单项]' }
      const [menu, item, subItem, subSubItem] = menuPath
      let target = `menu item ${appleScriptString(item)} of menu ${appleScriptString(menu)} of menu bar 1`
      if (subItem) target = `menu item ${appleScriptString(subItem)} of menu 1 of ${target}`
      if (subSubItem) target = `menu item ${appleScriptString(subSubItem)} of menu 1 of ${target}`
      script = `tell application ${appleScriptString(appName)} to activate
delay 0.2
tell application "System Events" to tell process ${appleScriptString(appName)} to click ${target}`
    } else {
      return { success: false, action, error: `不支持的桌面控制动作: ${action}` }
    }

    const { stdout, stderr } = await runFileTool('/usr/bin/osascript', ['-e', script], 20000)
    return { success: true, action, stdout, stderr }
  } catch (err) {
    return {
      success: false,
      action,
      error:
        err instanceof Error
          ? `${err.message}。如果 macOS 拒绝控制，请在系统设置里给本应用开启辅助功能权限。`
          : String(err),
    }
  }
}

type XcodeActionPayload = {
  action?: 'list' | 'build' | 'test' | 'clean' | 'archive' | 'open' | 'simctl-list'
  projectPath?: string
  scheme?: string
  destination?: string
  configuration?: string
  sdk?: string
  simctlKind?: 'devices' | 'runtimes' | 'devicetypes'
  timeout?: number
}

function resolveXcodeProjectArgs(projectPath?: string): string[] {
  const rawPath = (projectPath || '').trim()
  if (!rawPath) return []
  const expandedPath = rawPath.startsWith('~') ? path.join(os.homedir(), rawPath.slice(1)) : rawPath
  const stat = fs.existsSync(expandedPath) ? fs.statSync(expandedPath) : null
  if (expandedPath.endsWith('.xcworkspace')) return ['-workspace', expandedPath]
  if (expandedPath.endsWith('.xcodeproj')) return ['-project', expandedPath]
  if (stat?.isDirectory()) {
    const entries = fs.readdirSync(expandedPath)
    const workspace = entries.find((entry) => entry.endsWith('.xcworkspace'))
    if (workspace) return ['-workspace', path.join(expandedPath, workspace)]
    const project = entries.find((entry) => entry.endsWith('.xcodeproj'))
    if (project) return ['-project', path.join(expandedPath, project)]
  }
  return []
}

async function runXcodeAction(payload: XcodeActionPayload = {}) {
  const action = payload.action || 'list'
  const timeout = Math.min(Math.max(Number(payload.timeout || 120000), 10000), 600000)
  try {
    if (action === 'open') {
      if (!payload.projectPath?.trim()) return { success: false, error: 'open 动作需要 projectPath' }
      await runFileTool('/usr/bin/open', ['-a', 'Xcode', payload.projectPath], 10000)
      return { success: true, action, stdout: '', stderr: '', args: ['open', '-a', 'Xcode', payload.projectPath] }
    }

    if (action === 'simctl-list') {
      const kind = payload.simctlKind || 'devices'
      const { stdout, stderr } = await runFileTool('/usr/bin/xcrun', ['simctl', 'list', kind], timeout)
      return { success: true, action, stdout, stderr, args: ['xcrun', 'simctl', 'list', kind] }
    }

    const args = [...resolveXcodeProjectArgs(payload.projectPath)]
    if (payload.scheme?.trim()) args.push('-scheme', payload.scheme.trim())
    if (payload.configuration?.trim()) args.push('-configuration', payload.configuration.trim())
    if (payload.destination?.trim()) args.push('-destination', payload.destination.trim())
    if (payload.sdk?.trim()) args.push('-sdk', payload.sdk.trim())
    args.push(action === 'list' ? '-list' : action)

    const { stdout, stderr } = await runFileTool('/usr/bin/xcodebuild', args, timeout)
    return { success: true, action, stdout, stderr, args: ['xcodebuild', ...args] }
  } catch (err) {
    return {
      success: false,
      action,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function buildExtractedMediaContent(params: {
  filePath: string
  title: string
  sectionTitle: string
  body: string
  sourcePath?: string
}): string {
  return [
    `# ${params.title}`,
    '',
    `路径：${params.filePath}`,
    params.sourcePath ? `解析来源：${params.sourcePath}` : '',
    '',
    `## ${params.sectionTitle}`,
    '',
    params.body,
  ]
    .filter((line) => line !== '')
    .join('\n')
}

function buildMediaPlaceholder(params: {
  filePath: string
  kind: ExtractedFileKind
  size: number
  warnings: string[]
}): string {
  const fileName = path.basename(params.filePath)
  const kindLabel: Record<ExtractedFileKind, string> = {
    text: '文本',
    document: '文档',
    pdf: 'PDF',
    image: '图片',
    audio: '音频',
    video: '视频',
    binary: '二进制文件',
  }
  return [
    `# ${fileName}`,
    '',
    `类型：${kindLabel[params.kind]}`,
    `路径：${params.filePath}`,
    `大小：${params.size} bytes`,
    '',
    '## 当前解析状态',
    params.warnings.map((warning) => `- ${warning}`).join('\n'),
    '',
    '## 下一步',
    '- 这个来源已经可以进入知识库、被选入 Notebook 联动实验室、被打标签和归档。',
    '- 需要更深解析时，请补充 OCR、字幕、音频转写或对应原始文字稿。',
  ].join('\n')
}

async function extractFileContent(filePath: string): Promise<ExtractedFileContent> {
  const stat = await fs.promises.stat(filePath)
  const extension = getIntakeExtension(filePath)
  const kind = classifyIntakeFile(filePath)
  const metadata = {
    fileName: path.basename(filePath),
    filePath,
    extension,
    size: stat.size,
  }
  const warnings: string[] = []

  if (kind === 'text') {
    const raw = await fs.promises.readFile(filePath, 'utf-8')
    const content = TRANSCRIPT_TEXT_EXTENSIONS.has(extension) ? cleanTranscriptText(raw) : raw
    return { success: true, kind, method: 'utf8', content, rawContent: content, warnings, metadata }
  }

  if (kind === 'document') {
    try {
      const { stdout } = await runFileTool('textutil', ['-convert', 'txt', '-stdout', filePath], 25000)
      const content = stdout.trim()
      if (content) return { success: true, kind, method: 'textutil', content, rawContent: content, warnings, metadata }
    } catch (err) {
      warnings.push(`系统文档解析失败：${err instanceof Error ? err.message : String(err)}`)
    }
    warnings.push('文档已接收，但本机暂时没有抽取到稳定文本。')
    const content = buildMediaPlaceholder({ filePath, kind, size: stat.size, warnings })
    return { success: true, kind, method: 'placeholder', content, rawContent: content, warnings, metadata }
  }

  if (kind === 'pdf') {
    try {
      const spotlightText = await readSpotlightText(filePath)
      if (spotlightText) {
        return { success: true, kind, method: 'spotlight-mdls', content: spotlightText, rawContent: spotlightText, warnings, metadata }
      }
      warnings.push('Spotlight 暂时没有给出 PDF 正文。')
    } catch (err) {
      warnings.push(`Spotlight PDF 正文抽取失败：${err instanceof Error ? err.message : String(err)}`)
    }
    try {
      const fallback = await readStringsFallback(filePath)
      if (fallback) {
        warnings.push('使用 strings 兜底抽取，可能包含少量噪声。')
        return { success: true, kind, method: 'strings-fallback', content: fallback, rawContent: fallback, warnings, metadata }
      }
    } catch (err) {
      warnings.push(`PDF 兜底抽取失败：${err instanceof Error ? err.message : String(err)}`)
    }
    warnings.push('PDF 已接收，但没有抽取到正文；建议补充 OCR 文本版或可复制文字版 PDF。')
    const content = buildMediaPlaceholder({ filePath, kind, size: stat.size, warnings })
    return { success: true, kind, method: 'placeholder', content, rawContent: content, warnings, metadata }
  }

  if (kind === 'image') {
    let visualLabels: ImageClassificationLabel[] = []
    try {
      const spotlightText = await readSpotlightText(filePath)
      if (spotlightText) {
        try {
          visualLabels = await runAppleVisionImageClassification(filePath)
        } catch {
          /* Image classification is an optional local enhancement. */
        }
        const visualText = visualLabels.length
          ? `\n\n## 图片视觉标签\n${visualLabels.map((item) => `- ${item.identifier} (${Math.round(item.confidence * 100)}%)`).join('\n')}`
          : ''
        const content = buildExtractedMediaContent({
          filePath,
          title: metadata.fileName,
          sectionTitle: visualLabels.length ? '图片 OCR 文本 + 视觉标签' : '图片 OCR 文本',
          body: `${spotlightText}${visualText}`,
        })
        return {
          success: true,
          kind,
          method: visualLabels.length ? 'spotlight-image-text+apple-vision-classify' : 'spotlight-image-text',
          content,
          rawContent: `${spotlightText}${visualText}`,
          warnings,
          metadata,
        }
      }
    } catch {
      /* Spotlight OCR is opportunistic. */
    }
    let ocrText = ''
    try {
      ocrText = await runAppleVisionOcr(filePath)
    } catch (err) {
      warnings.push(`本机 OCR 暂不可用：${err instanceof Error ? err.message : String(err)}`)
    }
    try {
      visualLabels = await runAppleVisionImageClassification(filePath)
    } catch (err) {
      warnings.push(`本机图片分类暂不可用：${err instanceof Error ? err.message : String(err)}`)
    }
    if (ocrText || visualLabels.length) {
      const visualText = visualLabels.length
        ? `## 图片视觉标签\n${visualLabels.map((item) => `- ${item.identifier} (${Math.round(item.confidence * 100)}%)`).join('\n')}`
        : ''
      const body = [ocrText ? `## 图片 OCR 文本\n${ocrText}` : '', visualText].filter(Boolean).join('\n\n')
      const content = buildExtractedMediaContent({
        filePath,
        title: metadata.fileName,
        sectionTitle: ocrText && visualLabels.length ? '图片 OCR 文本 + 视觉标签' : ocrText ? '图片 OCR 文本' : '图片视觉标签',
        body,
      })
      return {
        success: true,
        kind,
        method:
          ocrText && visualLabels.length
            ? 'apple-vision-ocr-classify'
            : ocrText
              ? 'apple-vision-ocr'
              : 'apple-vision-classify',
        content,
        rawContent: body,
        warnings,
        metadata,
      }
    }
    if (!ocrText) {
      warnings.push('本机 OCR 没有识别出稳定文字。')
    }
    warnings.push('图片已接收；如果它是截图、海报或图表，可以补充更清晰版本，或在旁边放同名 .txt 文字稿。')
    const content = buildMediaPlaceholder({ filePath, kind, size: stat.size, warnings })
    return { success: true, kind, method: 'image-placeholder', content, rawContent: content, warnings, metadata }
  }

  if (kind === 'audio') {
    const transcript = await findSidecarTranscript(filePath)
    if (transcript) {
      const content = buildExtractedMediaContent({
        filePath,
        title: metadata.fileName,
        sectionTitle: '音频转写稿',
        body: transcript.content,
        sourcePath: transcript.filePath,
      })
      return {
        success: true,
        kind,
        method: 'sidecar-transcript',
        content,
        rawContent: transcript.content,
        warnings,
        metadata,
      }
    }
    warnings.push('音频已接收；请把同名 .srt、.vtt、.txt 或 .md 转写稿放在同一文件夹，系统会自动合并。')
    const content = buildMediaPlaceholder({ filePath, kind, size: stat.size, warnings })
    return { success: true, kind, method: 'audio-placeholder', content, rawContent: content, warnings, metadata }
  }

  if (kind === 'video') {
    const transcript = await findSidecarTranscript(filePath)
    if (transcript) {
      const content = buildExtractedMediaContent({
        filePath,
        title: metadata.fileName,
        sectionTitle: '视频字幕/转写稿',
        body: transcript.content,
        sourcePath: transcript.filePath,
      })
      return {
        success: true,
        kind,
        method: 'sidecar-transcript',
        content,
        rawContent: transcript.content,
        warnings,
        metadata,
      }
    }
    warnings.push('视频已接收；请把同名 .srt、.vtt、.txt 或 .md 字幕/转写稿放在同一文件夹，系统会自动合并。')
    const content = buildMediaPlaceholder({ filePath, kind, size: stat.size, warnings })
    return { success: true, kind, method: 'video-placeholder', content, rawContent: content, warnings, metadata }
  }

  warnings.push('这个文件类型暂时只能作为来源对象保存，等待后续解析器处理。')
  const content = buildMediaPlaceholder({ filePath, kind, size: stat.size, warnings })
  return { success: true, kind, method: 'binary-placeholder', content, rawContent: content, warnings, metadata }
}

function getRemotionEntryPoint(): string {
  return path.join(app.getAppPath(), 'src', 'features', 'profiling-studio', 'remotion', 'index.tsx')
}

function getRemotionLayout(compositionId: RemotionCompositionId): 'portrait' | 'landscape' {
  return compositionId === 'portrait-reveal' ? 'portrait' : 'landscape'
}

async function getRemotionServeUrl(onProgress?: (progress: number) => void): Promise<string> {
  if (!remotionServeUrlPromise) {
    remotionServeUrlPromise = bundleRemotion({
      entryPoint: getRemotionEntryPoint(),
      onProgress: (progress) => onProgress?.(Number(progress) || 0),
    }).catch((error) => {
      remotionServeUrlPromise = null
      throw error
    })
  }

  return remotionServeUrlPromise
}

function getDialogWindow(event?: IpcMainInvokeEvent): BrowserWindow | undefined {
  const senderWindow = event ? BrowserWindow.fromWebContents(event.sender) : null
  return senderWindow ?? BrowserWindow.getFocusedWindow() ?? sandboxWindow ?? ghostWindow ?? undefined
}

function showDatabaseSaveDialog(owner?: BrowserWindow): string | undefined {
  const options: SaveDialogOptions = {
    title: '导出数据库',
    defaultPath: `game-of-projects-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  }
  return owner ? dialog.showSaveDialogSync(owner, options) : dialog.showSaveDialogSync(options)
}

function showDatabaseOpenDialog(owner?: BrowserWindow): string[] | undefined {
  const options: OpenDialogOptions = {
    title: '导入数据库',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  }
  return owner ? dialog.showOpenDialogSync(owner, options) : dialog.showOpenDialogSync(options)
}

function confirmDatabaseImport(owner?: BrowserWindow): boolean {
  const options: MessageBoxSyncOptions = {
    type: 'warning',
    buttons: ['取消', '覆盖恢复'],
    defaultId: 0,
    cancelId: 0,
    title: '确认恢复数据库',
    message: '导入备份会覆盖当前本地数据库。',
    detail: '请确认已经导出过当前数据库备份，再继续恢复。',
  }
  const result = owner ? dialog.showMessageBoxSync(owner, options) : dialog.showMessageBoxSync(options)
  return result === 1
}

function exportDatabaseToFile(owner?: BrowserWindow): boolean {
  const result = showDatabaseSaveDialog(owner)
  if (!result) return false

  const json = exportDatabase()
  fs.writeFileSync(result, json, 'utf-8')
  return true
}

function importDatabaseFromFile(owner?: BrowserWindow, shouldConfirm = true): boolean {
  if (shouldConfirm && !confirmDatabaseImport(owner)) return false

  const result = showDatabaseOpenDialog(owner)
  if (!result || result.length === 0) return false

  const json = fs.readFileSync(result[0], 'utf-8')
  const ok = importDatabase(json)
  if (!ok) {
    dialog.showErrorBox('数据库恢复失败', '备份文件格式或表结构校验没有通过，当前数据库未被覆盖。')
  }
  return ok
}

// ─── 悬浮窗 — Hermes Dark + Hanako 桌面优雅度 ─────────
function createGhostWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize

  ghostWindow = new BrowserWindow({
    width: 520,
    height: 780,
    minWidth: 400,
    minHeight: 500,
    x: screenW - 540,
    y: Math.floor(screenH / 2) - 390,
    frame: false,
    transparent: false,
    backgroundColor: '#041c1c',
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    hasShadow: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: -99, y: -99 }, // 隐藏红绿灯但保留系统窗口管理
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    // 默认加载 Openbasaka（根路由）
    ghostWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    ghostWindow.loadFile(INDEX_HTML)
  }

  ghostWindow.on('closed', () => {
    ghostWindow = null
  })
}

// ─── 全屏沙盘窗口 ────────────────────────────────────
function createSandboxWindow(initialTab?: string) {
  const safeInitialTab = initialTab && SANDBOX_WINDOW_TABS.has(initialTab) ? initialTab : undefined
  const sandboxHash = safeInitialTab ? `/sandbox?tab=${encodeURIComponent(safeInitialTab)}` : '/sandbox'
  if (sandboxWindow) {
    sandboxWindow.focus()
    if (safeInitialTab) {
      sandboxWindow.webContents
        .executeJavaScript(`window.location.hash = ${JSON.stringify(`#${sandboxHash}`)}`)
        .catch(() => {})
    }
    return
  }

  sandboxWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    transparent: false,
    backgroundColor: '#041c1c',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    sandboxWindow.loadURL(`${VITE_DEV_SERVER_URL}#${sandboxHash}`)
  } else {
    sandboxWindow.loadFile(INDEX_HTML, { hash: sandboxHash })
  }

  sandboxWindow.on('closed', () => {
    sandboxWindow = null
  })
}

// ─── 系统托盘 ─────────────────────────────────────────
function createTray() {
  // 生成 16x16 纯色图标（暗绿 + 青色点）
  const size = 16
  const canvas = nativeImage.createEmpty()
  // macOS 不允许空图标，用 createFromBuffer 创建一个极简 PNG
  const buf = Buffer.alloc(size * size * 4, 0)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const dist = Math.sqrt((x - 7.5) ** 2 + (y - 7.5) ** 2)
      if (dist < 6) {
        buf[i] = 0 // R
        buf[i + 1] = 212 // G
        buf[i + 2] = 170 // B
        buf[i + 3] = dist < 4 ? 255 : 128 // A
      }
    }
  }
  const trayIcon = nativeImage.createFromBuffer(buf, { width: size, height: size })

  tray = new Tray(trayIcon)
  tray.setToolTip('openbasaka')

  const contextMenu = Menu.buildFromTemplate([
    { label: '🔮 展开沙盘', click: () => createSandboxWindow() },
    {
      label: '👻 显示副官',
      click: () => {
        if (ghostWindow) {
          ghostWindow.show()
          ghostWindow.focus()
        } else createGhostWindow()
      },
    },
    { type: 'separator' },
    {
      label: '📦 导出数据',
      click: () => {
        exportDatabaseToFile(getDialogWindow())
      },
    },
    {
      label: '📂 导入数据',
      click: () => {
        importDatabaseFromFile(getDialogWindow())
      },
    },
    { type: 'separator' },
    {
      label: '⚙️ 设置',
      click: () => {
        if (ghostWindow) {
          ghostWindow.webContents.send('navigate', '/settings')
          ghostWindow.show()
          ghostWindow.focus()
        }
      },
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', () => {
    if (ghostWindow) {
      ghostWindow.isVisible() ? ghostWindow.hide() : ghostWindow.show()
    }
  })
}

// ─── IPC 通道 ─────────────────────────────────────────
function registerIPC() {
  ipcMain.handle('open-sandbox', (_event, tab?: string) => createSandboxWindow(tab))
  ipcMain.handle('minimize-to-tray', () => ghostWindow?.hide())
  ipcMain.handle('get-system-info', () => ({
    platform: process.platform,
    arch: process.arch,
  }))
  ipcMain.handle('get-app-data', () => app.getPath('userData'))

  ipcMain.handle('safe-storage-set', async (_event, key: string, value: string) => {
    return safeStorageSetValue(String(key || ''), String(value || ''))
  })

  ipcMain.handle('safe-storage-get', async (_event, key: string) => {
    return safeStorageGetValue(String(key || ''))
  })

  ipcMain.handle('bibigpt-request', async (_event, payload: BibiGptRequestPayload) => {
    return handleBibiGptRequest(payload || {})
  })

  // ── SQLite 数据库 ──
  ipcMain.handle('db-query', (_event, sql: string, params: unknown[] = []) => {
    return query(sql, params)
  })

  ipcMain.handle('db-run', (_event, sql: string, params: unknown[] = []) => {
    return run(sql, params)
  })

  // ── AI 代理调用（非流式）──
  ipcMain.handle(
    'send-ai',
    async (
      _event,
      prompt: string,
      systemPrompt?: string,
      configOverrideJson?: string,
      temperature?: number,
      maxTokens?: number,
    ) => {
    try {
      let config: LLMConfigMain | null = null
      if (configOverrideJson) {
        try {
          const override = JSON.parse(configOverrideJson)
          if (override.apiKey || override.provider === 'ollama') {
            config = {
              provider: override.provider || 'deepseek',
              apiKey: override.apiKey || '',
              baseUrl:
                override.baseUrl || DEFAULT_LLM_CONFIGS[override.provider]?.baseUrl || 'https://api.deepseek.com',
              model: override.model || DEFAULT_LLM_CONFIGS[override.provider || 'deepseek']?.model || 'deepseek-v4-flash',
            }
          }
        } catch {
          /* fallback to DB config */
        }
      }
      if (!config) config = getLLMConfigFromDB()
      config = await resolveLLMConfigSecrets(config)
      if (!config) return { error: 'API key not configured' }

      const messages: Array<{ role: string; content: string }> = []
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
      messages.push({ role: 'user', content: prompt })

      const result = await mainProcessChatCompletion(config, messages, temperature ?? 0.7, maxTokens ?? 4096)
      return result
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
    },
  )

  // ── AI 代理调用（流式 SSE 转发）──
  ipcMain.handle(
    'stream-ai',
    async (event, prompt: string, systemPrompt: string, channel: string, configOverrideJson?: string) => {
      try {
        // 如果前端传入了 configOverride（角色专属配置），优先使用
        let config: LLMConfigMain | null = null
        if (configOverrideJson) {
          try {
            const override = JSON.parse(configOverrideJson)
            if (override.apiKey || override.provider === 'ollama') {
              config = {
                provider: override.provider || 'deepseek',
                apiKey: override.apiKey || '',
                baseUrl:
                  override.baseUrl || DEFAULT_LLM_CONFIGS[override.provider]?.baseUrl || 'https://api.deepseek.com',
                model: override.model || DEFAULT_LLM_CONFIGS[override.provider || 'deepseek']?.model || 'deepseek-v4-flash',
              }
            }
          } catch {
            /* parse failed, fallback */
          }
        }
        if (!config) config = getLLMConfigFromDB()
        config = await resolveLLMConfigSecrets(config)
        if (!config) {
          console.error('[stream-ai] No config from DB')
          event.sender.send(channel, '[ERROR] API key not configured')
          event.sender.send(channel, '[DONE]')
          return
        }
        console.log(
          `[stream-ai] provider=${config.provider} baseUrl=${config.baseUrl} model=${config.model} isAnthropic=${isAnthropicFormat(config.baseUrl)}`,
        )

        // 检测是否为多模态消息（prompt 是序列化的 JSON 消息数组）
        let messages: Array<{ role: string; content: unknown }>
        try {
          const parsed = JSON.parse(prompt)
          if (Array.isArray(parsed) && parsed[0]?.role) {
            // 多模态模式：prompt 是完整消息数组
            messages = parsed
            if (systemPrompt) {
              messages.unshift({ role: 'system', content: systemPrompt })
            }
          } else {
            throw new Error('not multimodal')
          }
        } catch {
          // 纯文本模式：原有逻辑
          messages = []
          if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
          messages.push({ role: 'user', content: prompt })
        }

        if (isAnthropicFormat(config.baseUrl)) {
          // Anthropic SSE format
          let systemPromptInner: string | undefined
          const filtered = messages.filter((m) => {
            if (m.role === 'system') {
              systemPromptInner = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
              return false
            }
            return true
          })
          const url = `${config.baseUrl}/v1/messages`
          console.log(`[stream-ai] Anthropic fetch → ${url}`)
          const response = await fetchWithNetworkProxy(url, {
            method: 'POST',
            headers: buildHeaders(config),
            body: JSON.stringify({
              model: config.model,
              system: systemPromptInner,
              messages: filtered,
              stream: true,
              temperature: 0.7,
              max_tokens: 4096,
            }),
          })
          console.log(`[stream-ai] Response status: ${response.status}`)
          if (!response.ok) {
            const errText = await response.text()
            console.error(`[stream-ai] Error: ${response.status} ${errText}`)
            let friendlyMsg = `LLM API 错误 [${response.status}]`
            try {
              const errJson = JSON.parse(errText)
              const apiMsg = errJson?.error?.message || ''
              if (response.status === 401) friendlyMsg = 'API Key 无效或已过期'
              else if (response.status === 402 || apiMsg.includes('balance') || apiMsg.includes('Insufficient'))
                friendlyMsg = '账户余额不足，请充值'
              else if (response.status === 429) friendlyMsg = apiMsg || '请求频率超限，稍后重试'
              else if (apiMsg) friendlyMsg = apiMsg
            } catch {
              /* use default */
            }
            event.sender.send(channel, `[ERROR] ${friendlyMsg}`)
            event.sender.send(channel, '[DONE]')
            return
          }
          const reader = response.body!.getReader()
          const decoder = new TextDecoder()
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const text = decoder.decode(value, { stream: true })
            const lines = text.split('\n')
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const data = line.slice(6).trim()
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                  event.sender.send(channel, parsed.delta.text)
                }
              } catch {
                /* ignore parse errors */
              }
            }
          }
        } else {
          // OpenAI SSE format
          const response = await fetchWithNetworkProxy(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: buildHeaders(config),
            body: JSON.stringify({ model: config.model, messages, stream: true, temperature: 0.7, max_tokens: 4096 }),
          })
          if (!response.ok) {
            const errText = await response.text()
            console.error(`[stream-ai] OpenAI Error: ${response.status} ${errText}`)
            // 解析 API 具体错误
            let friendlyMsg = `LLM API 错误 [${response.status}]`
            try {
              const errJson = JSON.parse(errText)
              const apiMsg = errJson?.error?.message || ''
              if (response.status === 401) friendlyMsg = 'API Key 无效或已过期'
              else if (response.status === 402 || apiMsg.includes('balance') || apiMsg.includes('Insufficient'))
                friendlyMsg = '账户余额不足，请充值'
              else if (response.status === 429) friendlyMsg = apiMsg || '请求频率超限，稍后重试'
              else if (apiMsg) friendlyMsg = apiMsg
            } catch {
              /* use default */
            }
            event.sender.send(channel, `[ERROR] ${friendlyMsg}`)
            event.sender.send(channel, '[DONE]')
            return
          }
          const reader = response.body!.getReader()
          const decoder = new TextDecoder()
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const text = decoder.decode(value, { stream: true })
            const lines = text.split('\n').filter((l) => l.startsWith('data: '))
            for (const line of lines) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                const content = parsed.choices?.[0]?.delta?.content || ''
                if (content) event.sender.send(channel, content)
              } catch {
                /* ignore */
              }
            }
          }
        }
        event.sender.send(channel, '[DONE]')
      } catch (err) {
        event.sender.send(channel, `[ERROR] ${String(err)}`)
        event.sender.send(channel, '[DONE]')
      }
    },
  )

  // ── 文件读取 ──
  ipcMain.handle('read-file', async (_event, filePath: string) => {
    try {
      return await fs.promises.readFile(filePath, 'utf-8')
    } catch (err) {
      return `Error reading file: ${err}`
    }
  })

  ipcMain.handle('extract-file-content', async (_event, filePath: string) => {
    try {
      return await extractFileContent(filePath)
    } catch (err) {
      return {
        success: false,
        kind: 'binary',
        method: 'error',
        content: '',
        warnings: [],
        metadata: {
          fileName: path.basename(filePath || ''),
          filePath,
          extension: getIntakeExtension(filePath || ''),
          size: 0,
        },
        error: err instanceof Error ? err.message : String(err),
      } satisfies ExtractedFileContent
    }
  })

  ipcMain.handle('transcribe-media-file', async (_event, filePath: string) => {
    try {
      return await transcribeMediaFile(filePath)
    } catch (err) {
      return {
        success: false,
        kind: classifyIntakeFile(filePath || ''),
        method: 'transcription-error',
        content: '',
        warnings: [],
        metadata: {
          fileName: path.basename(filePath || ''),
          filePath,
          extension: getIntakeExtension(filePath || ''),
          size: 0,
        },
        error: err instanceof Error ? err.message : String(err),
      } satisfies MediaTranscriptionResult
    }
  })

  // ── 文件写入 ──
  ipcMain.handle('write-file', async (_event, filePath: string, content: string) => {
    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
      await fs.promises.writeFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── 命令执行 ──
  ipcMain.handle('execute-command', (_event, command: string, timeout = 30000) => {
    return new Promise((resolve) => {
      const validation = validateCommand(command)
      if (!validation.allowed) {
        resolve({
          stdout: '',
          stderr: '',
          exitCode: 126,
          success: false,
          error: `命令被拒绝: ${validation.reason}`,
        })
        return
      }
      exec(validation.sanitized || command, { timeout }, (error, stdout, stderr) => {
        resolve({ stdout: stdout || '', stderr: stderr || '', exitCode: error?.code || 0, success: !error })
      })
    })
  })

  // ── 桌面观察 / Xcode 执行 ──
  ipcMain.handle('capture-screen', async (_event, payload?: DesktopCapturePayload) => {
    return captureDesktopScreen(payload || {})
  })

  ipcMain.handle('desktop-control', async (_event, payload?: DesktopControlPayload) => {
    return runDesktopControl(payload || {})
  })

  ipcMain.handle('xcode-action', async (_event, payload?: XcodeActionPayload) => {
    return runXcodeAction(payload || {})
  })

  ipcMain.handle(
    'render-remotion-video',
    async (
      event,
      payload: {
        bundle: unknown
        compositionId: RemotionCompositionId
        fileBaseName?: string
      },
    ) => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender) ?? ghostWindow ?? sandboxWindow ?? undefined
      const outputPath = senderWindow
        ? dialog.showSaveDialogSync(senderWindow, {
            title: '导出画像揭示片',
            defaultPath: `${sanitizeFileName(payload.fileBaseName || 'profiling-video')}-${payload.compositionId}.mp4`,
            filters: [{ name: 'MP4 视频', extensions: ['mp4'] }],
          })
        : dialog.showSaveDialogSync({
            title: '导出画像揭示片',
            defaultPath: `${sanitizeFileName(payload.fileBaseName || 'profiling-video')}-${payload.compositionId}.mp4`,
            filters: [{ name: 'MP4 视频', extensions: ['mp4'] }],
          })

      if (!outputPath) {
        return { success: false, cancelled: true }
      }

      const notify = (data: RemotionRenderProgressEvent) => {
        event.sender.send('remotion-render-progress', data)
      }

      try {
        notify({ phase: 'bundling', progress: 0, message: '正在准备视频模板…' })
        const serveUrl = await getRemotionServeUrl((progress) => {
          notify({
            phase: 'bundling',
            progress: Math.max(0, Math.min(100, Math.round(progress))),
            message: '正在打包 Remotion composition…',
          })
        })

        const inputProps = {
          bundle: payload.bundle,
          layout: getRemotionLayout(payload.compositionId),
        }

        const composition = await selectComposition({
          serveUrl,
          id: payload.compositionId,
          inputProps,
        })

        notify({ phase: 'rendering', progress: 0, message: '正在渲染视频帧…' })
        await renderMedia({
          serveUrl,
          composition,
          codec: 'h264',
          outputLocation: outputPath,
          inputProps,
          overwrite: true,
          logLevel: 'error',
          onProgress: (progress) => {
            notify({
              phase: 'rendering',
              progress: Math.max(0, Math.min(100, Math.round((progress.progress || 0) * 100))),
              message: progress.stitchStage === 'muxing' ? '正在封装视频…' : '正在渲染视频帧…',
              renderedFrames: progress.renderedFrames,
              encodedFrames: progress.encodedFrames,
            })
          },
        })

        notify({
          phase: 'done',
          progress: 100,
          message: '视频已渲染完成',
          outputPath,
        })
        return { success: true, outputPath }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        notify({
          phase: 'error',
          progress: 0,
          message,
        })
        return { success: false, error: message }
      }
    },
  )

  // ── 选择文件夹 ──
  ipcMain.handle('choose-folder', async (event, payload?: { defaultPath?: string; title?: string }) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender) ?? ghostWindow ?? sandboxWindow ?? undefined
    const title = typeof payload?.title === 'string' && payload.title.trim() ? payload.title.trim() : '选择要导入的文件夹'
    const defaultPath = typeof payload?.defaultPath === 'string' && payload.defaultPath.trim() ? payload.defaultPath.trim() : undefined
    const result = senderWindow
      ? dialog.showOpenDialogSync(senderWindow, {
          title,
          defaultPath,
          properties: ['openDirectory'],
        })
      : dialog.showOpenDialogSync({
          title,
          defaultPath,
          properties: ['openDirectory'],
        })
    return result?.[0] || ''
  })

  // ── 选择文件（知识库可导入任意本地文件） ──
  ipcMain.handle('choose-files', async (event, payload?: { defaultPath?: string; title?: string }) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender) ?? ghostWindow ?? sandboxWindow ?? undefined
    const title = typeof payload?.title === 'string' && payload.title.trim() ? payload.title.trim() : '选择要导入的文件'
    const defaultPath = typeof payload?.defaultPath === 'string' && payload.defaultPath.trim() ? payload.defaultPath.trim() : undefined
    const result = senderWindow
      ? dialog.showOpenDialogSync(senderWindow, {
          title,
          defaultPath,
          properties: ['openFile', 'multiSelections'],
        })
      : dialog.showOpenDialogSync({
          title,
          defaultPath,
          properties: ['openFile', 'multiSelections'],
        })
    return result || []
  })

  // ── 数据库导出 ──
  ipcMain.handle('export-database', async (event) => {
    try {
      return exportDatabaseToFile(getDialogWindow(event))
    } catch {
      return false
    }
  })

  // ── 数据库导入 ──
  ipcMain.handle('import-database', async (event) => {
    try {
      return importDatabaseFromFile(getDialogWindow(event), false)
    } catch {
      return false
    }
  })

  // ── URL 抓取（知识库用，Node.js 无 CORS 限制） ──
  ipcMain.handle('fetch-url', async (_event, url: string) => {
    try {
      const response = await fetchWithNetworkProxy(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OpenBasaka/1.0)' },
      })
      if (!response.ok) return { error: `HTTP ${response.status}` }
      const html = await response.text()

      return extractFetchedUrlMetadata(html, url)
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.handle('brave-search', async (_event, queryText: string, count = 5, options = {}) => {
    try {
      return await searchWithBrave(queryText, count, options)
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── 读取剪贴板（Clipper 扩展用） ──
  ipcMain.handle('read-clipboard', async () => {
    try {
      const { clipboard } = await import('electron')
      return clipboard.readText()
    } catch {
      return ''
    }
  })

  // ── Wiki-to-Obsidian 磁盘同步 ──
  ipcMain.handle('sync-wiki-to-disk', async () => {
    const homeDir = app.getPath('home')
    const wikiDir = path.join(homeDir, 'Documents', 'Openbasaka_Brain', 'Wiki')
    const drawerDir = path.join(homeDir, 'Documents', 'Openbasaka_Brain', 'Drawers')

    try {
      fs.mkdirSync(wikiDir, { recursive: true })
      fs.mkdirSync(drawerDir, { recursive: true })

      // 同步 Wiki 页面
      const pages = query('SELECT * FROM wiki_pages WHERE is_index = 0 AND is_log = 0') as Array<
        Record<string, unknown>
      >

      let synced = 0
      for (const page of pages) {
        const title = (page.title as string) || 'Untitled'
        const slug =
          (page.slug as string) ||
          title
            .toLowerCase()
            .replace(/[^\w\u4e00-\u9fff]+/g, '-')
            .slice(0, 100)
        const content = (page.content as string) || ''
        const tags = (page.tags as string) || '[]'
        const importance = (page.importance as number) || 50
        const confidence = (page.confidence as number) || 0.8
        const sourceIds = (page.source_ids as string) || '[]'
        const updatedAt = (page.updated_at as string) || ''

        const frontmatter = `---
title: "${title.replace(/"/g, '\\"')}"
slug: "${slug}"
tags: ${tags}
importance: ${importance}
confidence: ${confidence}
source_drawers: ${sourceIds}
updated: "${updatedAt}"
---
`
        const mdContent = frontmatter + '\n' + content
        const filePath = path.join(wikiDir, `${slug}.md`)
        fs.writeFileSync(filePath, mdContent, 'utf-8')
        synced++
      }

      // 同步未编译抽屉
      const drawers = query('SELECT * FROM mempalace_drawers') as Array<Record<string, unknown>>

      let drawersSynced = 0
      for (const drawer of drawers) {
        const dTitle = ((drawer.title as string) || 'untitled').replace(/[/\\?%*:|"<>\n]/g, '_').slice(0, 100)
        const dContent = `# ${drawer.title}\n\nSource: ${drawer.source_type}\nWing: ${drawer.wing}/${drawer.hall}/${drawer.room}\nCompiled: ${drawer.is_compiled ? 'Yes' : 'No'}\nCreated: ${drawer.created_at}\n\n---\n\n${drawer.raw_content}`
        const filePath = path.join(drawerDir, `${dTitle}.md`)
        fs.writeFileSync(filePath, dContent, 'utf-8')
        drawersSynced++
      }

      return { success: true, pagesSynced: synced, drawersSynced }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── Drawer 统计 ──
  ipcMain.handle('get-drawer-stats', async () => {
    try {
      const total = query('SELECT COUNT(*) as cnt FROM mempalace_drawers') as Array<{ cnt: number }>
      const uncompiled = query('SELECT COUNT(*) as cnt FROM mempalace_drawers WHERE is_compiled = 0') as Array<{
        cnt: number
      }>
      return { total: total[0]?.cnt || 0, uncompiled: uncompiled[0]?.cnt || 0 }
    } catch {
      return { total: 0, uncompiled: 0 }
    }
  })

  // ── 手动触发 Wiki 编译 ──
  ipcMain.handle('trigger-wiki-compile', async () => {
    try {
      const { executeWikiCompileTask } = await import('./cron-engine')
      await executeWikiCompileTask({
        id: 'manual',
        name: 'Manual Compile',
        cronExpression: '',
        taskType: 'wiki-compile',
        taskConfig: { batchSize: 50 },
        enabled: true,
        lastRun: '',
        agentId: '',
        platformConfigJson: '[]',
      })
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── Telegram Bot 管理 ──
  ipcMain.handle('telegram-start', async () => {
    return startTelegramBot()
  })

  ipcMain.handle('telegram-stop', async () => {
    stopTelegramBot()
    return true
  })

  ipcMain.handle('telegram-status', async () => {
    return getTelegramStatus()
  })

  ipcMain.handle('telegram-bot-list', async () => {
    return getAllBotStatus()
  })

  ipcMain.handle('telegram-agent-start', async (_event, agentId: string, token: string, name: string) => {
    startAgentBot(agentId, token, name)
    return true
  })

  ipcMain.handle('telegram-agent-stop', async (_event, agentId: string) => {
    stopAgentBot(agentId)
    return true
  })

  ipcMain.handle('telegram-agent-verify', async (_event, token: string) => {
    try {
      const res = await fetchWithNetworkProxy(`https://api.telegram.org/bot${token}/getMe`, {
        signal: AbortSignal.timeout(5000),
      })
      const data = await res.json()
      if (data.ok) {
        return { ok: true, botName: data.result?.username || '', botId: data.result?.id || 0 }
      }
      return { ok: false, error: data.description || 'Token 无效' }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle(
    'telegram-openbasaka-sync',
    async (
      _event,
      payload: {
        agentId?: string
        role: 'user' | 'assistant'
        content: string
        messageId?: string
      },
    ) => {
      try {
        return await broadcastOpenbasakaMessageToTelegram(payload)
      } catch (err) {
        return {
          attempted: 0,
          sent: 0,
          skipped: 0,
          errors: [err instanceof Error ? err.message : String(err)],
        }
      }
    },
  )

  ipcMain.handle('telegram-user-sync-status', async () => {
    return getTelegramUserSyncStatus()
  })

  ipcMain.handle(
    'telegram-user-sync-request-code',
    async (
      _event,
      payload: {
        apiId: string | number
        apiHash: string
        phone: string
        enabled?: boolean
      },
    ) => {
      return requestTelegramUserLoginCode(payload)
    },
  )

  ipcMain.handle(
    'telegram-user-sync-confirm-code',
    async (_event, payload: { code: string; password?: string }) => {
      return confirmTelegramUserLoginCode(payload)
    },
  )

  // ── Cron 定时任务：渲染进程执行结果回传 ──
  ipcMain.handle(
    'cron:task-result',
    async (
      _event,
      result: {
        taskId: string
        status: string
        result?: string
        error?: string
      },
    ) => {
      // 通知 cron-engine 解除等待
      try {
        const { handleCronTaskResult } = await import('./cron-engine')
        handleCronTaskResult(result as { taskId: string; status: 'success' | 'error'; result?: string; error?: string })
      } catch {
        /* cron-engine not loaded yet */
      }

      try {
        // 写入执行日志
        run(
          `INSERT INTO cron_execution_log (id, task_id, task_name, task_type, status, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))`,
          [
            `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            result.taskId,
            'delegate',
            'agent',
            result.status === 'success' ? 'success' : 'error',
            result.error || result.result?.slice(0, 500) || '',
          ],
        )
        return { logged: true }
      } catch (err) {
        console.error('[cron:task-result] Failed to log:', err)
        return { logged: false, error: String(err) }
      }
    },
  )

  ipcMain.handle('cron:run-now', async (_event, taskId: string) => {
    try {
      const { runScheduledTaskNow } = await import('./cron-engine')
      return await runScheduledTaskNow(taskId)
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── Gemini 图片生成代理：主进程读取环境变量/本地设置，避免把 Key 暴露给渲染进程 ──
  ipcMain.handle('gemini-generate-images', async (_event, payload: GeminiGeneratePayload) => {
    try {
      const apiKey = getGeminiApiKey()
      if (!apiKey) {
        return {
          images: [],
          warnings: [],
          error: 'Gemini API Key 未配置。请设置 GEMINI_API_KEY / GOOGLE_API_KEY，或在 settings 写入 gemini_api_key。',
        }
      }
      if (!payload?.prompt) {
        return { images: [], warnings: [], error: '缺少生成提示词。' }
      }
      const count = Math.min(Math.max(Number(payload.count) || 4, 1), 4)
      const settled = await Promise.allSettled(
        Array.from({ length: count }, () => generateOneGeminiImage(apiKey, payload)),
      )
      const images = settled
        .filter((item): item is PromiseFulfilledResult<string> => item.status === 'fulfilled')
        .map((item) => item.value)
      const warnings = settled
        .filter((item): item is PromiseRejectedResult => item.status === 'rejected')
        .map((item) => (item.reason instanceof Error ? item.reason.message : String(item.reason)))
      if (images.length === 0 && warnings.length > 0) return { images, warnings, error: warnings[0] }
      return { images, warnings }
    } catch (err) {
      return { images: [], warnings: [], error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ── Embedding API 代理（主进程绕 CORS 调用 GLM/Ollama） ──
  ipcMain.handle(
    'generate-embedding',
    async (_event, text: string, endpoint: string, apiKey: string, model: string) => {
      try {
        const isOllama = endpoint.includes('localhost:11434')
        const body = isOllama
          ? JSON.stringify({ model, prompt: text.slice(0, 8000) })
          : JSON.stringify({ model, input: text.slice(0, 8000) })

        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

        const response = await fetchWithNetworkProxy(endpoint, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(30000),
        })

        if (!response.ok) {
          return { error: `HTTP ${response.status}: ${await response.text()}` }
        }

        const data = (await response.json()) as {
          data?: Array<{ embedding: number[] }>
          embedding?: number[]
        }

        // GLM 格式: data.data[0].embedding
        // Ollama 格式: data.embedding
        const embedding = data.data?.[0]?.embedding || data.embedding
        if (!embedding) {
          return { error: 'Embedding 响应格式异常' }
        }

        return { embedding, model, dimension: embedding.length }
      } catch (err) {
        return { error: String(err) }
      }
    },
  )
}

// ─── App Lifecycle ────────────────────────────────────
import { startCronEngine, stopCronEngine } from './cron-engine'
import {
  startTelegramBot,
  stopTelegramBot,
  getTelegramStatus,
  startMultiBotEngine,
  getAllBotStatus,
  startAgentBot,
  stopAgentBot,
} from './telegram/bot'
import { initTelegramHandler } from './telegram/handler'
import { broadcastOpenbasakaMessageToTelegram } from './telegram/openbasaka-sync'
import {
  confirmTelegramUserLoginCode,
  getTelegramUserSyncStatus,
  requestTelegramUserLoginCode,
} from './telegram/user-sync'

// 初始化 Telegram 消息处理器
initTelegramHandler()

function shouldAutoStartTelegram(): boolean {
  const envValue = process.env.OPENBASAKA_TELEGRAM_AUTO_START?.trim().toLowerCase()
  if (envValue) return ['1', 'true', 'yes', 'on'].includes(envValue)

  try {
    const rows = query('SELECT value FROM settings WHERE key = ?', ['telegram_auto_start']) as Array<{ value: string }>
    const value = rows[0]?.value?.trim().toLowerCase()
    return value === 'true' || value === '1' || value === 'yes' || value === 'on'
  } catch {
    return false
  }
}

app.whenReady().then(() => {
  registerIPC()
  createTray()
  createGhostWindow()
  startCronEngine()

  // Telegram remains opt-in. Start from the Control Panel or set
  // OPENBASAKA_TELEGRAM_AUTO_START=1 / settings.telegram_auto_start=true.
  if (shouldAutoStartTelegram()) {
    startMultiBotEngine()
  } else {
    console.log('[Telegram] Auto-start disabled; use Control Panel to connect bots explicitly.')
  }

  // 注册 openbasaka:// URI 协议（Clipper 浏览器扩展剪藏用）
  app.setAsDefaultProtocolClient('openbasaka')
})

// macOS: 接收 URI
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleClipperUri(url)
})

// Windows/Linux: 单实例锁定时接收 URI
const gotTheLock = app.requestSingleInstanceLock()
app.on('second-instance', (_event, commandLine) => {
  const uri = commandLine.find((arg) => arg.startsWith('openbasaka://'))
  if (uri) handleClipperUri(uri)
  if (!ghostWindow) createGhostWindow()
  ghostWindow?.show()
  ghostWindow?.focus()
})

/** 处理 Clipper 发来的 URI */
function handleClipperUri(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'clip') {
      const title = decodeURIComponent(parsed.searchParams.get('title') || '')
      const sourceUrl = decodeURIComponent(parsed.searchParams.get('url') || '')
      const useClipboard = parsed.searchParams.get('clipboard') === 'true'

      // 通知渲染进程处理 Clipper 剪藏
      if (ghostWindow) {
        ghostWindow.webContents.send('clipper-received', {
          title,
          url: sourceUrl,
          useClipboard,
        })
        ghostWindow.show()
        ghostWindow.focus()
      }
    }
  } catch {
    /* ignore invalid URI */
  }
}

app.on('window-all-closed', () => {
  // 不退出，保持托盘常驻
})

app.on('before-quit', () => {
  stopCronEngine()
  stopTelegramBot()
  mcpManager.stopAll()
})

app.on('activate', () => {
  if (!ghostWindow) createGhostWindow()
})

// ─── 文件关联 — 拖文件打开并分析 ───
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (!ghostWindow) createGhostWindow()

  const ext = path.extname(filePath).toLowerCase()
  if (['.md', '.txt', '.json', '.markdown'].includes(ext)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      ghostWindow?.webContents.send('file-opened', { content, fileName: path.basename(filePath) })
      ghostWindow?.show()
      ghostWindow?.focus()
    } catch (err) {
      console.error('Failed to read file:', err)
    }
  }
})

// 窗口间同步广播
ipcMain.handle('broadcast-to-windows', (_event, channel: string, data: unknown) => {
  if (ghostWindow) ghostWindow.webContents.send(channel, data)
  if (sandboxWindow) sandboxWindow.webContents.send(channel, data)
})

// ─── MCP 服务器管理 ───
import { mcpManager } from './mcp-manager'

ipcMain.handle(
  'mcp-spawn',
  async (_event, serverId: string, command: string, args: string[], env: Record<string, string>) => {
    const success = await mcpManager.startServer(serverId, command, args, env)
    if (success) {
      // 将 MCP 服务器配置持久化到 SQLite settings 表
      try {
        const key = `mcp_server_${serverId}`
        const db = getDatabase()
        const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
          | { value: string }
          | undefined
        const config = existing ? JSON.parse(existing.value) : {}
        const updated = {
          ...config,
          serverId,
          command,
          args,
          env,
          status: 'online',
          updatedAt: new Date().toISOString(),
        }
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(updated))
      } catch {
        /* non-critical */
      }
    }
    return success
  },
)

ipcMain.handle('mcp-call-tool', async (_event, serverId: string, toolName: string, args: Record<string, unknown>) => {
  return mcpManager.callTool(serverId, toolName, args)
})

ipcMain.handle('mcp-list-tools', async (_event, serverId: string) => {
  return mcpManager.listTools(serverId)
})

ipcMain.handle('mcp-stop', async (_event, serverId: string) => {
  const result = await mcpManager.stopServer(serverId)
  // 同步 SQLite 状态为 offline
  try {
    const key = `mcp_server_${serverId}`
    const db = getDatabase()
    const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    if (existing) {
      const config = JSON.parse(existing.value)
      config.status = 'offline'
      config.updatedAt = new Date().toISOString()
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(config))
    }
  } catch {
    /* non-critical */
  }
  return result
})

// ─── Boss Identity Anchor IPC ───
const BOSS_ANCHOR_FILE = path.join(app.getPath('userData'), 'boss-anchor.json')
const BOSS_SNAPSHOTS_DIR = path.join(app.getPath('userData'), 'boss-snapshots')

ipcMain.handle('boss-anchor-read', async () => {
  try {
    if (fs.existsSync(BOSS_ANCHOR_FILE)) {
      return fs.readFileSync(BOSS_ANCHOR_FILE, 'utf-8')
    }
  } catch {
    /* not found */
  }
  return null
})

ipcMain.handle('boss-anchor-write', async (_event, jsonStr: string) => {
  try {
    fs.writeFileSync(BOSS_ANCHOR_FILE, jsonStr, 'utf-8')
    return true
  } catch {
    return false
  }
})

ipcMain.handle('boss-snapshot-create', async (_event, jsonStr: string) => {
  try {
    if (!fs.existsSync(BOSS_SNAPSHOTS_DIR)) {
      fs.mkdirSync(BOSS_SNAPSHOTS_DIR, { recursive: true })
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const filePath = path.join(BOSS_SNAPSHOTS_DIR, `snapshot-${ts}.json`)
    fs.writeFileSync(filePath, jsonStr, 'utf-8')

    // 轮转：只保留最近 3 个快照
    const files = fs
      .readdirSync(BOSS_SNAPSHOTS_DIR)
      .filter((f) => f.startsWith('snapshot-') && f.endsWith('.json'))
      .sort()
    while (files.length > 3) {
      const oldest = files.shift()
      if (oldest) fs.unlinkSync(path.join(BOSS_SNAPSHOTS_DIR, oldest))
    }
    return true
  } catch {
    return false
  }
})

ipcMain.handle('boss-snapshot-list', async () => {
  try {
    if (!fs.existsSync(BOSS_SNAPSHOTS_DIR)) return []
    return fs
      .readdirSync(BOSS_SNAPSHOTS_DIR)
      .filter((f) => f.startsWith('snapshot-') && f.endsWith('.json'))
      .sort()
  } catch {
    return []
  }
})

ipcMain.handle('boss-snapshot-restore', async (_event, fileName: string) => {
  try {
    const filePath = path.join(BOSS_SNAPSHOTS_DIR, fileName)
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8')
    }
  } catch {
    /* not found */
  }
  return null
})
