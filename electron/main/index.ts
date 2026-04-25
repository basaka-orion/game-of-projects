import {
  app,
  BrowserWindow,
  screen,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  dialog,
  type IpcMainInvokeEvent,
  type MessageBoxSyncOptions,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { exec } from 'node:child_process'
import { bundle as bundleRemotion } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import { query, run, exportDatabase, importDatabase, getDatabase } from './database'

// ─── AI Provider helpers (main process) ───

const DEFAULT_LLM_CONFIGS: Record<string, { baseUrl: string; model: string }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  minimax: { baseUrl: 'https://api.minimax.chat/v1', model: 'minimax-M2.7' },
  ollama: { baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:14b' },
  glm: { baseUrl: 'https://api.z.ai/api/coding/paas/v4', model: 'glm-5.1' },
}

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
    const response = await fetch(`${config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: buildHeaders(config),
      body: JSON.stringify({
        model: config.model,
        system: systemPrompt,
        messages: filteredMessages,
        temperature,
        max_tokens: maxTokens,
      }),
    })
    if (!response.ok) throw new Error(`LLM API Error [${response.status}]: ${await response.text()}`)
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
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify({ model: config.model, messages, temperature, max_tokens: maxTokens }),
  })
  if (!response.ok) throw new Error(`LLM API Error [${response.status}]: ${await response.text()}`)
  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

function getBraveApiKey(): string {
  const apiKeyRow = query('SELECT value FROM settings WHERE key = ?', ['brave_api_key']) as Array<{ value: string }>
  return apiKeyRow[0]?.value?.trim() || process.env.BRAVE_API_KEY?.trim() || ''
}

async function searchWithBrave(
  queryText: string,
  count = 5,
): Promise<{ success: boolean; data?: BraveSearchResult[]; error?: string }> {
  const apiKey = getBraveApiKey()
  const safeCount = Math.max(1, Math.min(Number(count) || 5, 10))
  const safeQuery = String(queryText || '').trim()

  if (!safeQuery) return { success: false, error: 'empty query' }
  if (!apiKey) return { success: false, error: 'missing brave_api_key' }

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(safeQuery)}&count=${safeCount}`
  const response = await fetch(url, {
    headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) return { success: false, error: `HTTP ${response.status}` }

  const data = (await response.json()) as { web?: { results?: Array<BraveSearchResult> } }
  const results = (data.web?.results || []).map((result) => ({
    title: result.title,
    url: result.url,
    description: result.description || '',
    age: result.age || '',
  }))

  return { success: true, data: results }
}

// vite-plugin-electron 注入 __dirname
const DIST = path.join(__dirname, '../../dist')
const DIST_ELECTRON = path.join(__dirname, '..')
const PRELOAD = path.join(DIST_ELECTRON, 'preload/index.js')
const INDEX_HTML = path.join(DIST, 'index.html')
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

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
function createSandboxWindow() {
  if (sandboxWindow) {
    sandboxWindow.focus()
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
    sandboxWindow.loadURL(`${VITE_DEV_SERVER_URL}#/sandbox`)
  } else {
    sandboxWindow.loadFile(INDEX_HTML, { hash: '/sandbox' })
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
  ipcMain.handle('open-sandbox', () => createSandboxWindow())
  ipcMain.handle('minimize-to-tray', () => ghostWindow?.hide())
  ipcMain.handle('get-system-info', () => ({
    platform: process.platform,
    arch: process.arch,
  }))
  ipcMain.handle('get-app-data', () => app.getPath('userData'))

  // ── SQLite 数据库 ──
  ipcMain.handle('db-query', (_event, sql: string, params: unknown[] = []) => {
    return query(sql, params)
  })

  ipcMain.handle('db-run', (_event, sql: string, params: unknown[] = []) => {
    return run(sql, params)
  })

  // ── AI 代理调用（非流式）──
  ipcMain.handle('send-ai', async (_event, prompt: string, systemPrompt?: string, configOverrideJson?: string) => {
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
                override.baseUrl || DEFAULT_LLM_CONFIGS[override.provider]?.baseUrl || 'https://api.deepseek.com/v1',
              model: override.model || 'deepseek-chat',
            }
          }
        } catch {
          /* fallback to DB config */
        }
      }
      if (!config) config = getLLMConfigFromDB()
      if (!config) return { error: 'API key not configured' }

      const messages: Array<{ role: string; content: string }> = []
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
      messages.push({ role: 'user', content: prompt })

      const result = await mainProcessChatCompletion(config, messages)
      return result
    } catch (err) {
      return { error: String(err) }
    }
  })

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
                  override.baseUrl || DEFAULT_LLM_CONFIGS[override.provider]?.baseUrl || 'https://api.deepseek.com/v1',
                model: override.model || 'deepseek-chat',
              }
            }
          } catch {
            /* parse failed, fallback */
          }
        }
        if (!config) config = getLLMConfigFromDB()
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
          const response = await fetch(url, {
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
          const response = await fetch(`${config.baseUrl}/chat/completions`, {
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

  // ── 文件写入 ──
  ipcMain.handle('write-file', async (_event, filePath: string, content: string) => {
    try {
      await fs.promises.writeFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── 命令执行 ──
  ipcMain.handle('execute-command', (_event, command: string, timeout = 30000) => {
    return new Promise((resolve) => {
      exec(command, { timeout }, (error, stdout, stderr) => {
        resolve({ stdout: stdout || '', stderr: stderr || '', exitCode: error?.code || 0, success: !error })
      })
    })
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
  ipcMain.handle('choose-folder', async (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender) ?? ghostWindow ?? sandboxWindow ?? undefined
    const result = senderWindow
      ? dialog.showOpenDialogSync(senderWindow, {
          title: '选择要导入的文件夹',
          properties: ['openDirectory'],
        })
      : dialog.showOpenDialogSync({
          title: '选择要导入的文件夹',
          properties: ['openDirectory'],
        })
    return result?.[0] || ''
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
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OpenBasaka/1.0)' },
      })
      if (!response.ok) return { error: `HTTP ${response.status}` }
      const html = await response.text()

      // 提取 title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      const title = titleMatch ? titleMatch[1].trim() : url

      // 提取 author
      const authorMatch = html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i)
      const author = authorMatch ? authorMatch[1] : ''

      // 提取 description
      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
      const description = descMatch ? descMatch[1] : ''

      // HTML → 纯文本
      let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      text = text.replace(/<[^>]+>/g, ' ')
      text = text
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
      text = text.replace(/\s+/g, ' ').trim()
      text = text.slice(0, 50000) // 50k 上限

      return { title, content: text, author, description, url }
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.handle('brave-search', async (_event, queryText: string, count = 5) => {
    try {
      return await searchWithBrave(queryText, count)
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
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
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

        const response = await fetch(endpoint, {
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

// 初始化 Telegram 消息处理器
initTelegramHandler()

app.whenReady().then(() => {
  registerIPC()
  createTray()
  createGhostWindow()
  startCronEngine()

  // Telegram 多 Bot 自动启动（全局 token + 各 Agent token）
  startMultiBotEngine()

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
