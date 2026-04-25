/// <reference types="vite/client" />

interface Window {
  electronAPI: {
    onFileDrop: (callback: (files: string[]) => void) => void
    readFile: (path: string) => Promise<string>
    writeFile: (path: string, content: string) => Promise<{ success: boolean }>
    getAppData: () => Promise<string>
    openSandbox: () => void
    minimizeToTray: () => void
    getSystemInfo: () => Promise<{ platform: string; arch: string }>
    executeCommand: (
      command: string,
      timeout?: number,
    ) => Promise<{ stdout: string; stderr: string; exitCode: number; success: boolean }>
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
    chooseFolder: () => Promise<string>
    dbQuery: (sql: string, params?: unknown[]) => Promise<unknown[]>
    dbRun: (sql: string, params?: unknown[]) => Promise<void>
    exportDatabase: () => Promise<boolean>
    importDatabase: () => Promise<boolean>
    sendToAI: (
      prompt: string,
      systemPrompt?: string,
      configOverrideJson?: string,
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
    /** 定时任务：监听主进程委托的任务 */
    onCronTask: (callback: (task: unknown) => void) => void
    /** 定时任务：向主进程返回执行结果 */
    cronTaskResult: (result: {
      taskId: string
      status: 'success' | 'error'
      result?: string
      error?: string
    }) => Promise<void>
    /** 通过主进程代理 Embedding API 请求（绕 CORS） */
    generateEmbedding: (
      text: string,
      endpoint: string,
      apiKey: string,
      model: string,
    ) => Promise<{ embedding?: number[]; error?: string }>
    /** 通过主进程代理 Brave Search，避免在渲染进程暴露搜索密钥 */
    braveSearch: (
      query: string,
      count?: number,
    ) => Promise<{
      success: boolean
      data?: Array<{ title: string; url: string; description: string; age?: string }>
      error?: string
    }>
  }
}
