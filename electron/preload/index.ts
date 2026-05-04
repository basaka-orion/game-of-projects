import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openSandbox: (tab?: string) => ipcRenderer.invoke('open-sandbox', tab),
  minimizeToTray: () => ipcRenderer.invoke('minimize-to-tray'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  getAppData: () => ipcRenderer.invoke('get-app-data'),

  onFileDrop: (callback: (files: string[]) => void) => {
    ipcRenderer.on('file-drop', (_event, files: string[]) => callback(files))
  },

  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  extractFileContent: (filePath: string) => ipcRenderer.invoke('extract-file-content', filePath),
	  transcribeMediaFile: (filePath: string) => ipcRenderer.invoke('transcribe-media-file', filePath),
	  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write-file', filePath, content),
	  executeCommand: (command: string, timeout?: number) => ipcRenderer.invoke('execute-command', command, timeout),
	  captureScreen: (payload?: {
	    includeOcr?: boolean
	    fileBaseName?: string
	    region?: { x: number; y: number; width: number; height: number }
	  }) => ipcRenderer.invoke('capture-screen', payload),
	  desktopControl: (payload?: {
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
	  }) => ipcRenderer.invoke('desktop-control', payload),
	  xcodeAction: (payload?: {
	    action?: 'list' | 'build' | 'test' | 'clean' | 'archive' | 'open' | 'simctl-list'
	    projectPath?: string
	    scheme?: string
	    destination?: string
	    configuration?: string
	    sdk?: string
	    simctlKind?: 'devices' | 'runtimes' | 'devicetypes'
	    timeout?: number
	  }) => ipcRenderer.invoke('xcode-action', payload),
	  renderRemotionVideo: (payload: {
    bundle: unknown
    compositionId: 'portrait-reveal' | 'landscape-brief'
    fileBaseName?: string
  }) => ipcRenderer.invoke('render-remotion-video', payload),
  onRemotionRenderProgress: (
    callback: (progress: {
      phase: 'bundling' | 'rendering' | 'done' | 'error'
      progress: number
      message?: string
      renderedFrames?: number
      encodedFrames?: number
      outputPath?: string
    }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      progress: {
        phase: 'bundling' | 'rendering' | 'done' | 'error'
        progress: number
        message?: string
        renderedFrames?: number
        encodedFrames?: number
        outputPath?: string
      },
    ) => callback(progress)
    ipcRenderer.on('remotion-render-progress', listener)
    return () => ipcRenderer.removeListener('remotion-render-progress', listener)
  },
  chooseFolder: (options?: { defaultPath?: string; title?: string }) => ipcRenderer.invoke('choose-folder', options),
  chooseFiles: (options?: { defaultPath?: string; title?: string }) => ipcRenderer.invoke('choose-files', options),
  dbQuery: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db-query', sql, params),
  dbRun: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db-run', sql, params),
  exportDatabase: () => ipcRenderer.invoke('export-database'),
  importDatabase: () => ipcRenderer.invoke('import-database'),

  sendToAI: (
    prompt: string,
    systemPrompt?: string,
    configOverrideJson?: string,
    temperature?: number,
    maxTokens?: number,
  ) => ipcRenderer.invoke('send-ai', prompt, systemPrompt, configOverrideJson, temperature, maxTokens),

  streamAI: (
    prompt: string,
    systemPrompt: string,
    onChunk: (chunk: string) => void,
    configOverrideJson?: string,
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const channel = `ai-stream-${Date.now()}`
      const listener = (_event: Electron.IpcRendererEvent, chunk: string) => {
        if (chunk === '[DONE]') {
          ipcRenderer.removeListener(channel, listener)
          resolve()
          return
        }
        if (chunk.startsWith('[ERROR] ')) {
          ipcRenderer.removeListener(channel, listener)
          reject(new Error(chunk.slice(8)))
          return
        }
        onChunk(chunk)
      }
      ipcRenderer.on(channel, listener)
      ipcRenderer.invoke('stream-ai', prompt, systemPrompt, channel, configOverrideJson).catch(reject)
    })
  },

  // MCP 服务器管理
  mcpSpawn: (serverId: string, command: string, args: string[], env: Record<string, string>) =>
    ipcRenderer.invoke('mcp-spawn', serverId, command, args, env),
  mcpCallTool: (serverId: string, toolName: string, args: Record<string, unknown>) =>
    ipcRenderer.invoke('mcp-call-tool', serverId, toolName, args),
  mcpListTools: (serverId: string) => ipcRenderer.invoke('mcp-list-tools', serverId),
  mcpStop: (serverId: string) => ipcRenderer.invoke('mcp-stop', serverId),

  // Boss Identity Anchor
  bossAnchorRead: () => ipcRenderer.invoke('boss-anchor-read'),
  bossAnchorWrite: (jsonStr: string) => ipcRenderer.invoke('boss-anchor-write', jsonStr),
  bossSnapshotCreate: (jsonStr: string) => ipcRenderer.invoke('boss-snapshot-create', jsonStr),
  bossSnapshotList: () => ipcRenderer.invoke('boss-snapshot-list'),
  bossSnapshotRestore: (fileName: string) => ipcRenderer.invoke('boss-snapshot-restore', fileName),

  // 知识库：URL 抓取 + 剪贴板 + Clipper 接收
  fetchUrl: (url: string) => ipcRenderer.invoke('fetch-url', url),
  braveSearch: (
    query: string,
    count?: number,
    options?: { endpoint?: 'web' | 'news'; freshness?: 'pd' | 'pw' | 'pm' | 'py'; country?: string; searchLang?: string },
  ) => ipcRenderer.invoke('brave-search', query, count, options),
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),
  onClipperReceived: (callback: (data: { title: string; url: string; useClipboard: boolean }) => void) => {
    ipcRenderer.on('clipper-received', (_event, data) => callback(data))
  },

  // 知识库：海马体双核
  syncWikiToDisk: () => ipcRenderer.invoke('sync-wiki-to-disk'),
  getDrawerStats: () => ipcRenderer.invoke('get-drawer-stats'),
  triggerWikiCompile: () => ipcRenderer.invoke('trigger-wiki-compile'),

  // Telegram Bot
  telegramStart: () => ipcRenderer.invoke('telegram-start'),
  telegramStop: () => ipcRenderer.invoke('telegram-stop'),
  telegramStatus: () => ipcRenderer.invoke('telegram-status'),
  telegramBotList: () => ipcRenderer.invoke('telegram-bot-list'),
  telegramAgentStart: (agentId: string, token: string, name: string) =>
    ipcRenderer.invoke('telegram-agent-start', agentId, token, name),
  telegramAgentStop: (agentId: string) => ipcRenderer.invoke('telegram-agent-stop', agentId),
  telegramAgentVerify: (token: string) => ipcRenderer.invoke('telegram-agent-verify', token),
  telegramOpenbasakaSync: (payload: {
    agentId?: string
    role: 'user' | 'assistant'
    content: string
    messageId?: string
  }) => ipcRenderer.invoke('telegram-openbasaka-sync', payload),
  telegramUserSyncStatus: () => ipcRenderer.invoke('telegram-user-sync-status'),
  telegramUserSyncRequestCode: (payload: {
    apiId: string | number
    apiHash: string
    phone: string
    enabled?: boolean
  }) => ipcRenderer.invoke('telegram-user-sync-request-code', payload),
  telegramUserSyncConfirmCode: (payload: { code: string; password?: string }) =>
    ipcRenderer.invoke('telegram-user-sync-confirm-code', payload),

  // Cron 定时任务双向通信
  onCronTask: (callback: (task: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, task: unknown) => callback(task)
    ipcRenderer.on('cron:execute-task', listener)
    return () => ipcRenderer.removeListener('cron:execute-task', listener)
  },
  cronTaskResult: (result: { taskId: string; status: string; result?: string; error?: string }) =>
    ipcRenderer.invoke('cron:task-result', result),
  cronRunNow: (taskId: string) => ipcRenderer.invoke('cron:run-now', taskId),

  // Embedding API 代理（主进程绕 CORS 调用 GLM/Ollama embedding 端点）
  generateEmbedding: (text: string, endpoint: string, apiKey: string, model: string) =>
    ipcRenderer.invoke('generate-embedding', text, endpoint, apiKey, model),
  generateGeminiImages: (payload: {
    imagePart?: { inlineData: { data: string; mimeType: string } }
    prompt: string
    count?: number
  }) => ipcRenderer.invoke('gemini-generate-images', payload),
})
