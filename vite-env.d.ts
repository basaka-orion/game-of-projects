/// <reference types="vite/client" />

declare module 'cron-parser'

interface Window {
  electronAPI: {
    onFileDrop: (callback: (files: string[]) => void) => void
    readFile: (path: string) => Promise<string>
    extractFileContent: (path: string) => Promise<{
      success: boolean
      kind: 'text' | 'document' | 'pdf' | 'image' | 'audio' | 'video' | 'binary'
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
    }>
    transcribeMediaFile: (path: string) => Promise<{
      success: boolean
      kind: 'text' | 'document' | 'pdf' | 'image' | 'audio' | 'video' | 'binary'
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
      transcriptPath?: string
      missingProvider?: boolean
      error?: string
    }>
    writeFile: (path: string, content: string) => Promise<{ success: boolean }>
    getAppData: () => Promise<string>
    openSandbox: (tab?: string) => void
    minimizeToTray: () => void
    getSystemInfo: () => Promise<{ platform: string; arch: string }>
	    executeCommand: (
	      command: string,
	      timeout?: number,
	    ) => Promise<{ stdout: string; stderr: string; exitCode: number; success: boolean }>
	    captureScreen: (payload?: {
	      includeOcr?: boolean
	      fileBaseName?: string
	      region?: { x: number; y: number; width: number; height: number }
	    }) => Promise<{
	      success: boolean
	      path?: string
	      mimeType?: string
	      size?: number
	      display?: unknown
	      region?: unknown
	      ocrText?: string
	      warnings?: string[]
	      error?: string
	    }>
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
	    }) => Promise<{
	      success: boolean
	      action?: string
	      target?: string
	      stdout?: string
	      stderr?: string
	      error?: string
	    }>
	    xcodeAction: (payload?: {
	      action?: 'list' | 'build' | 'test' | 'clean' | 'archive' | 'open' | 'simctl-list'
	      projectPath?: string
	      scheme?: string
	      destination?: string
	      configuration?: string
	      sdk?: string
	      simctlKind?: 'devices' | 'runtimes' | 'devicetypes'
	      timeout?: number
	    }) => Promise<{
	      success: boolean
	      action?: string
	      stdout?: string
	      stderr?: string
	      args?: string[]
	      error?: string
	    }>
	    renderRemotionVideo: (payload: {
      bundle: unknown
      compositionId: 'portrait-reveal' | 'landscape-brief'
      fileBaseName?: string
    }) => Promise<{ success: boolean; cancelled?: boolean; outputPath?: string; error?: string }>
    onRemotionRenderProgress: (
      callback: (progress: {
        phase: 'bundling' | 'rendering' | 'done' | 'error'
        progress: number
        message?: string
        renderedFrames?: number
        encodedFrames?: number
        outputPath?: string
      }) => void,
    ) => () => void
    chooseFolder: (options?: { defaultPath?: string; title?: string }) => Promise<string>
    chooseFiles: (options?: { defaultPath?: string; title?: string }) => Promise<string[]>
    fetchUrl: (url: string) => Promise<{
      title: string
      content: string
      author: string
      description: string
      url: string
      error?: string
    }>
    readClipboard: () => Promise<string>
    dbQuery: (sql: string, params?: unknown[]) => Promise<unknown[]>
    dbRun: (sql: string, params?: unknown[]) => Promise<void>
    exportDatabase: () => Promise<boolean>
    importDatabase: () => Promise<boolean>
    sendToAI: (
      prompt: string,
      systemPrompt?: string,
      configOverrideJson?: string,
      temperature?: number,
      maxTokens?: number,
    ) => Promise<string | { error: string }>
    streamAI: (
      prompt: string,
      systemPrompt: string,
      onChunk: (chunk: string) => void,
      configOverrideJson?: string,
    ) => Promise<void>
    mcpSpawn: (serverId: string, cmd: string, args: string[], env: Record<string, string>) => Promise<boolean>
    mcpCallTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<unknown>
    mcpListTools: (serverId: string) => Promise<Array<{ name: string; description: string }>>
    mcpStop: (serverId: string) => Promise<boolean>
    bossAnchorRead: () => Promise<string | null>
    bossAnchorWrite: (jsonStr: string) => Promise<boolean>
    bossSnapshotCreate: (jsonStr: string) => Promise<boolean>
    bossSnapshotList: () => Promise<string[]>
    bossSnapshotRestore: (fileName: string) => Promise<string | null>
    openDevTools: () => void
    /** Openbasaka 消息同步到 Telegram 同角色聊天 */
    telegramOpenbasakaSync: (payload: {
      agentId?: string
      role: 'user' | 'assistant'
      content: string
      messageId?: string
    }) => Promise<{ attempted: number; sent: number; skipped: number; errors: string[] }>
    telegramUserSyncStatus: () => Promise<{
      enabled: boolean
      configured: boolean
      authorized: boolean
      phone: string
      needsCode: boolean
      error?: string
    }>
    telegramUserSyncRequestCode: (payload: {
      apiId: string | number
      apiHash: string
      phone: string
      enabled?: boolean
    }) => Promise<{
      enabled: boolean
      configured: boolean
      authorized: boolean
      phone: string
      needsCode: boolean
      error?: string
    }>
    telegramUserSyncConfirmCode: (payload: { code: string; password?: string }) => Promise<{
      enabled: boolean
      configured: boolean
      authorized: boolean
      phone: string
      needsCode: boolean
      error?: string
    }>
    /** 定时任务：监听主进程委托的任务 */
    onCronTask: (callback: (task: unknown) => void) => void
    /** 定时任务：向主进程返回执行结果 */
    cronTaskResult: (result: {
      taskId: string
      status: 'success' | 'error'
      result?: string
      error?: string
    }) => Promise<void>
    /** 定时任务：立即试跑一个任务 */
    cronRunNow: (taskId: string) => Promise<{ success: boolean; error?: string }>
    /** 通过主进程代理 Embedding API 请求（绕 CORS） */
    generateEmbedding: (
      text: string,
      endpoint: string,
      apiKey: string,
      model: string,
    ) => Promise<{ embedding?: number[]; error?: string }>
    /** 通过主进程代理 Gemini 图片生成，避免在渲染进程暴露图片模型密钥 */
    generateGeminiImages: (payload: {
      imagePart: { inlineData: { data: string; mimeType: string } }
      prompt: string
      count?: number
    }) => Promise<{ images?: string[]; warnings?: string[]; error?: string }>
    /** 通过主进程代理 Brave Search，避免在渲染进程暴露搜索密钥 */
    braveSearch: (
      query: string,
      count?: number,
      options?: {
        endpoint?: 'web' | 'news'
        freshness?: 'pd' | 'pw' | 'pm' | 'py'
        country?: string
        searchLang?: string
      },
    ) => Promise<{
      success: boolean
      data?: Array<{ title: string; url: string; description: string; age?: string }>
      error?: string
    }>
  }
}
