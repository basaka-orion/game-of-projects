/**
 * AI Provider 抽象层
 * 支持 DeepSeek / MiniMax / Ollama / GLM(Anthropic) / 自定义
 * GLM 使用 Anthropic 兼容端点，其余使用 OpenAI 兼容协议
 */

import { getSetting } from '../db/store'

export interface LLMConfig {
  provider: 'deepseek' | 'minimax' | 'ollama' | 'glm' | 'custom'
  apiKey: string
  baseUrl: string
  model: string
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

export interface StreamCallbacks {
  onChunk?: (text: string) => void
  onDone?: (fullText: string) => void
  onError?: (error: Error) => void
}

const DEFAULT_CONFIGS: Record<string, Omit<LLMConfig, 'apiKey'>> = {
  deepseek: {
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  minimax: {
    provider: 'minimax',
    baseUrl: 'https://api.minimax.chat/v1',
    model: 'minimax-M2.7',
  },
  ollama: {
    provider: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen2.5:14b',
  },
  glm: {
    provider: 'glm',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    model: 'glm-5.1',
  },
}

const ZAI_LEGACY_BASE_URLS = new Set([
  'https://api.z.ai/api/paas/v4',
  'https://api.z.ai/api/paas/v4/',
])

const ZAI_CODING_BASE_URL = 'https://api.z.ai/api/coding/paas/v4'

export function normalizeProviderBaseUrl(provider: string, baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (provider === 'glm' && ZAI_LEGACY_BASE_URLS.has(baseUrl.trim())) {
    return ZAI_CODING_BASE_URL
  }
  if (provider === 'glm' && trimmed === 'https://api.z.ai/api/paas/v4') {
    return ZAI_CODING_BASE_URL
  }
  return trimmed || baseUrl
}

export function getDefaultConfig(provider: string): Omit<LLMConfig, 'apiKey'> {
  const config = DEFAULT_CONFIGS[provider] || DEFAULT_CONFIGS.deepseek
  return {
    ...config,
    baseUrl: normalizeProviderBaseUrl(config.provider, config.baseUrl),
  }
}

/**
 * 获取当前全局 LLM 配置（从 localStorage settings 读取）
 * 所有需要 LLM 的组件统一调用此函数，保证配置一致
 */
export function getLLMConfig(): LLMConfig {
  // 延迟导入避免循环依赖
  const provider = getSetting('llm_provider', 'deepseek')
  const defaults = getDefaultConfig(provider)
  return {
    provider: provider as LLMConfig['provider'],
    apiKey: getSetting('llm_api_key', ''),
    baseUrl: normalizeProviderBaseUrl(provider, getSetting('llm_base_url', defaults.baseUrl)),
    model: getSetting('llm_model', defaults.model),
  }
}

/**
 * 解析某个角色的 LLM 配置
 * 优先级：角色专属配置 → 全局配置 → 默认值
 * 角色配置使用 settings key 前缀: agent_{role}_provider 等
 */
export function resolveAgentConfig(agentRole: string): LLMConfig {
  // 1. 尝试读角色专属配置
  const agentProvider = getSetting(`agent_${agentRole}_provider`, '')
  if (agentProvider) {
    // 该角色有独立配置
    const defaults = getDefaultConfig(agentProvider)
    return {
      provider: agentProvider as LLMConfig['provider'],
      apiKey: getSetting(`agent_${agentRole}_api_key`, ''),
      baseUrl: normalizeProviderBaseUrl(agentProvider, getSetting(`agent_${agentRole}_base_url`, defaults.baseUrl)),
      model: getSetting(`agent_${agentRole}_model`, defaults.model),
    }
  }

  // 2. Fallback 到全局配置
  return getLLMConfig()
}

/**
 * 验证 LLM 配置是否可用
 * 发一个 max_tokens=5 的极小请求，快速检测连通性
 */
export async function verifyLLMConfig(config: LLMConfig): Promise<{ ok: boolean; message: string }> {
  if (!config.apiKey && config.provider !== 'ollama') {
    return { ok: false, message: '请先输入 API Key' }
  }

  try {
    if (config.provider === 'ollama') {
      const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        const data = await res.json()
        const models = data.models?.map((m: { name: string }) => m.name).join(', ') || '无模型'
        return { ok: true, message: `✓ Ollama 已连通 · 可用模型: ${models}` }
      }
      return { ok: false, message: '✗ Ollama 服务无响应' }
    }

    // Electron 环境走 IPC 绕过 CORS
    const electronAPI = (window as any)?.electronAPI
    if (electronAPI?.sendToAI) {
      // 通过 IPC 发送验证请求
      try {
        // 直接用 dbRun 临时写入配置，让 main process 用这个配置验证
        // 更简单的方式：直接用 send-ai-verify IPC
        const result = await electronAPI.dbQuery(
          'SELECT value FROM settings WHERE key = ?', ['llm_provider']
        )
        // 使用 stream-ai 的 configOverride 来验证
        return new Promise((resolve) => {
          const channel = `ai-verify-${Date.now()}`
          let gotResponse = false
          const timeout = setTimeout(() => {
            if (!gotResponse) resolve({ ok: false, message: '✗ 连接超时' })
          }, 15000)

          const configJson = JSON.stringify(config)
          electronAPI.dbQuery('SELECT 1').then(() => {
            // 通过 IPC invoke 验证
            const listener = (_event: any, chunk: string) => {
              gotResponse = true
              clearTimeout(timeout)
              if (chunk.startsWith('[ERROR] ')) {
                resolve({ ok: false, message: `✗ ${chunk.slice(8)}` })
              } else if (chunk === '[DONE]') {
                // no content but done = ok
              } else {
                resolve({ ok: true, message: `✓ ${config.model} 回复: "${chunk.slice(0, 30)}"` })
              }
            }
            // 不能直接用 ipcRenderer，走 streamAI with override
            electronAPI.streamAI('你好，请回复"连接成功"', '', (chunk: string) => {
              if (!gotResponse) {
                gotResponse = true
                clearTimeout(timeout)
                resolve({ ok: true, message: `✓ ${config.model} 回复: "${chunk.slice(0, 30)}"` })
              }
            }, configJson).then(() => {
              if (!gotResponse) {
                gotResponse = true
                clearTimeout(timeout)
                resolve({ ok: true, message: `✓ ${config.model} 连接正常` })
              }
            }).catch((err: Error) => {
              gotResponse = true
              clearTimeout(timeout)
              resolve({ ok: false, message: `✗ ${err.message}` })
            })
          })
        })
      } catch (err) {
        return { ok: false, message: `✗ ${(err as Error).message}` }
      }
    }

    // 纯 Web：直接 fetch
    const isAnthropic = config.baseUrl.includes('/api/anthropic')
    const headers: Record<string, string> = isAnthropic
      ? { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' }
      : { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` }
    const url = isAnthropic ? `${config.baseUrl}/v1/messages` : `${config.baseUrl}/chat/completions`
    const body = isAnthropic
      ? { model: config.model, messages: [{ role: 'user', content: '你好，请回复"连接成功"' }], max_tokens: 10 }
      : { model: config.model, messages: [{ role: 'user', content: '你好，请回复"连接成功"' }], max_tokens: 10 }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })

    if (res.ok) {
      const data = await res.json()
      const reply = isAnthropic
        ? (Array.isArray(data.content) ? data.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('') : '')
        : (data.choices?.[0]?.message?.content || '')
      return { ok: true, message: `✓ ${config.model} 回复: "${reply.slice(0, 30)}"` }
    } else {
      const errText = await res.text()
      let apiMsg = ''
      try { apiMsg = JSON.parse(errText)?.error?.message || '' } catch {}
      if (res.status === 401) return { ok: false, message: '✗ API Key 无效或已过期' }
      if (res.status === 402 || apiMsg.includes('balance') || apiMsg.includes('Insufficient')) return { ok: false, message: '✗ 账户余额不足' }
      if (res.status === 429) return { ok: false, message: `✗ ${apiMsg || '请求频率超限'}` }
      return { ok: false, message: `✗ ${apiMsg || `错误 ${res.status}`}` }
    }
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      return { ok: false, message: '✗ 网络连接失败（CORS 限制，桌面端自动绕过）' }
    }
    if (msg.includes('timeout') || msg.includes('AbortError')) {
      return { ok: false, message: '✗ 连接超时' }
    }
    return { ok: false, message: `✗ ${msg}` }
  }
}

/** GLM 使用 Anthropic Messages API 格式 */
function isAnthropicFormat(config: LLMConfig): boolean {
  return config.baseUrl.includes('/api/anthropic')
}

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  }
}

function openaiHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }
}

function getElectronAPI(): any {
  if (typeof window === 'undefined') return undefined
  return (window as any).electronAPI
}

/** 发送聊天请求（非流式）— Electron 环境走 IPC 绕过 CORS */
export async function chatCompletion(
  config: LLMConfig,
  messages: ChatMessage[],
  temperature = 0.7,
  maxTokens = 4096
): Promise<string> {
  // Electron 桌面环境：通过主进程 IPC
  const electronAPI = getElectronAPI()
  if (electronAPI?.sendToAI) {
    const systemMsg = messages.find(m => m.role === 'system')
    const userMsgs = messages.filter(m => m.role !== 'system')
    const prompt = userMsgs.map(m => m.content).join('\n')
    const systemPrompt = systemMsg?.content || ''
    const result = await electronAPI.sendToAI(prompt, systemPrompt, JSON.stringify(config))
    if (typeof result === 'string') return result
    if (result?.error) throw new Error(result.error)
    return ''
  }

  // 纯 Web 回退
  if (isAnthropicFormat(config)) {
    return anthropicChatCompletion(config, messages, temperature, maxTokens)
  }
  return openaiChatCompletion(config, messages, temperature, maxTokens)
}

/** OpenAI 兼容格式 */
async function openaiChatCompletion(
  config: LLMConfig,
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number
): Promise<string> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: openaiHeaders(config.apiKey),
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`LLM API Error [${response.status}]: ${err}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

/** Anthropic Messages API 格式（GLM） */
async function anthropicChatCompletion(
  config: LLMConfig,
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number
): Promise<string> {
  // Anthropic 要求 system message 单独传
  let systemPrompt: string | undefined
  const filteredMessages = messages.filter(m => {
    if (m.role === 'system') {
      systemPrompt = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      return false
    }
    return true
  })

  const response = await fetch(`${config.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: anthropicHeaders(config.apiKey),
    body: JSON.stringify({
      model: config.model,
      system: systemPrompt,
      messages: filteredMessages,
      temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`LLM API Error [${response.status}]: ${err}`)
  }

  const data = await response.json()
  // Anthropic 格式: content 是数组 [{type: "text", text: "..."}]
  if (Array.isArray(data.content)) {
    return data.content
      .filter((c: { type: string }) => c.type === 'text')
      .map((c: { text: string }) => c.text)
      .join('')
  }
  return ''
}

/** 流式聊天请求 — Electron 环境走 IPC 绕过 CORS */
export async function chatCompletionStream(
  config: LLMConfig,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  temperature = 0.7,
  maxTokens = 4096
): Promise<string> {
  // Electron 桌面环境：通过主进程 IPC 发起请求，绕过渲染进程 CORS 限制
  const electronAPI = getElectronAPI()
  if (electronAPI?.streamAI) {
    return electronStreamChat(config, messages, callbacks)
  }

  // 纯 Web 回退：直接 fetch
  if (isAnthropicFormat(config)) {
    return anthropicChatCompletionStream(config, messages, callbacks, temperature, maxTokens)
  }
  return openaiChatCompletionStream(config, messages, callbacks, temperature, maxTokens)
}

/** 通过 Electron IPC 的流式聊天（绕过 CORS） */
async function electronStreamChat(
  config: LLMConfig,
  messages: ChatMessage[],
  callbacks: StreamCallbacks
): Promise<string> {
  const electronAPI = getElectronAPI()
  if (!electronAPI) throw new Error('Electron IPC unavailable')
  const systemMsg = messages.find(m => m.role === 'system')
  const userMsgs = messages.filter(m => m.role !== 'system')

  // 检查是否包含多模态内容（图片）
  const hasMultimodal = userMsgs.some(m => Array.isArray(m.content))

  if (hasMultimodal) {
    // 多模态：传递完整消息 JSON（主进程直接构造 API body）
    const systemPrompt = typeof systemMsg?.content === 'string' ? systemMsg.content : ''
    const serializedMessages = JSON.stringify(messages.map(m => ({
      role: m.role,
      content: m.content,
    })))
    const configOverrideJson = JSON.stringify(config)

    let fullText = ''
    try {
      await electronAPI.streamAI(serializedMessages, systemPrompt, (chunk: string) => {
        fullText += chunk
        callbacks.onChunk?.(chunk)
      }, configOverrideJson)
      callbacks.onDone?.(fullText)
      return fullText
    } catch (err) {
      const error = new Error(String(err))
      callbacks.onError?.(error)
      throw error
    }
  }

  // 纯文本：保持原有 prompt + systemPrompt 格式
  const prompt = userMsgs.map(m => {
    const c = m.content
    return `${m.role === 'user' ? '用户' : '助手'}: ${typeof c === 'string' ? c : c.filter(p => p.type === 'text').map(p => p.text).join('')}`
  }).join('\n')
  const systemPrompt = typeof systemMsg?.content === 'string' ? systemMsg.content : ''

  // 将配置序列化传给 main process（支持角色专属配置覆盖全局）
  const configOverrideJson = JSON.stringify(config)

  let fullText = ''
  try {
    await electronAPI.streamAI(prompt, systemPrompt, (chunk: string) => {
      fullText += chunk
      callbacks.onChunk?.(chunk)
    }, configOverrideJson)
    callbacks.onDone?.(fullText)
    return fullText
  } catch (err) {
    const error = new Error(String(err))
    callbacks.onError?.(error)
    throw error
  }
}

/** OpenAI 兼容流式 */
async function openaiChatCompletionStream(
  config: LLMConfig,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: openaiHeaders(config.apiKey),
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    const error = new Error(`LLM API Error [${response.status}]: ${err}`)
    callbacks.onError?.(error)
    throw error
  }

  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  let fullText = ''

  if (!reader) throw new Error('No readable stream')

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    const lines = chunk.split('\n').filter(l => l.startsWith('data: '))

    for (const line of lines) {
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue

      try {
        const parsed = JSON.parse(data)
        const content = parsed.choices?.[0]?.delta?.content || ''
        if (content) {
          fullText += content
          callbacks.onChunk?.(content)
        }
      } catch {
        // 忽略解析错误
      }
    }
  }

  callbacks.onDone?.(fullText)
  return fullText
}

/** Anthropic 流式（GLM） */
async function anthropicChatCompletionStream(
  config: LLMConfig,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  temperature: number,
  maxTokens: number
): Promise<string> {
  let systemPrompt: string | undefined
  const filteredMessages = messages.filter(m => {
    if (m.role === 'system') {
      systemPrompt = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      return false
    }
    return true
  })

  const response = await fetch(`${config.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: anthropicHeaders(config.apiKey),
    body: JSON.stringify({
      model: config.model,
      system: systemPrompt,
      messages: filteredMessages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    const error = new Error(`LLM API Error [${response.status}]: ${err}`)
    callbacks.onError?.(error)
    throw error
  }

  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  let fullText = ''

  if (!reader) throw new Error('No readable stream')

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    // Anthropic SSE 格式: event: xxx\ndata: {...}
    const lines = chunk.split('\n')

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue

      try {
        const parsed = JSON.parse(data)
        // Anthropic 流式: content_block_delta → delta.text
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          fullText += parsed.delta.text
          callbacks.onChunk?.(parsed.delta.text)
        }
      } catch {
        // 忽略解析错误
      }
    }
  }

  callbacks.onDone?.(fullText)
  return fullText
}

/** 检测 Ollama 本地可用性 */
export async function detectOllama(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(2000),
    })
    return res.ok
  } catch {
    return false
  }
}
