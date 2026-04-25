/**
 * MCP Manager — Model Context Protocol 服务器管理
 *
 * 实现完整的 stdio JSON-RPC 2.0 协议与 MCP 服务器通信
 * 无需 @modelcontextprotocol/sdk 依赖，手写轻量客户端
 *
 * 协议流程：
 * 1. spawn 进程
 * 2. 发送 initialize 请求
 * 3. 收到响应后发送 notifications/initialized
 * 4. 发送 tools/list 获取可用工具
 * 5. 按需调用 tools/call
 */
import { ChildProcess, spawn } from 'child_process'

// ─── 类型定义 ───

interface MCPRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

interface MCPResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timeout: ReturnType<typeof setTimeout>
}

interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

interface MCPToolResult {
  content: string
  isError: boolean
}

interface ManagedServer {
  process: ChildProcess
  pending: Map<number, PendingRequest>
  nextId: number
  buffer: string
  tools: MCPTool[]
  initialized: boolean
}

// ─── 服务器管理 ───

const servers = new Map<string, ManagedServer>()
const REQUEST_TIMEOUT = 30_000

/** 启动 MCP 服务器并完成初始化握手 */
export async function startServer(
  serverId: string,
  command: string,
  args: string[],
  env?: Record<string, string>
): Promise<boolean> {
  // 如果已有运行中的服务器，先停止
  if (servers.has(serverId)) {
    await stopServer(serverId)
  }

  const proc = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
  })

  const managed: ManagedServer = {
    process: proc,
    pending: new Map(),
    nextId: 1,
    buffer: '',
    tools: [],
    initialized: false,
  }
  servers.set(serverId, managed)

  // 处理 stdout — JSON-RPC 消息
  proc.stdout?.on('data', (data: Buffer) => {
    handleStdoutData(serverId, data)
  })

  // 处理 stderr — 日志
  proc.stderr?.on('data', (data: Buffer) => {
    console.log(`[MCP:${serverId}] stderr:`, data.toString().trim())
  })

  // 进程退出清理
  proc.on('exit', () => {
    const server = servers.get(serverId)
    if (server) {
      // 拒绝所有 pending requests
      for (const [, pending] of server.pending) {
        clearTimeout(pending.timeout)
        pending.reject(new Error('Server process exited'))
      }
      server.pending.clear()
    }
  })

  // 等待进程启动
  await new Promise<void>((resolve) => {
    if (proc.pid) {
      resolve()
    } else {
      proc.on('spawn', () => resolve())
    }
  })

  // 初始化握手
  try {
    await sendRequest(serverId, {
      jsonrpc: '2.0',
      id: getNextId(serverId),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'openbasaka', version: '0.1.0' },
      },
    })

    // 发送 initialized 通知（无 id，不期望响应）
    sendNotification(serverId, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    })

    // 获取工具列表
    const toolsResult = await sendRequest(serverId, {
      jsonrpc: '2.0',
      id: getNextId(serverId),
      method: 'tools/list',
    }) as { tools?: MCPTool[] }

    const server = servers.get(serverId)
    if (server && toolsResult?.tools) {
      server.tools = toolsResult.tools
    }

    if (server) server.initialized = true
    return true
  } catch (err) {
    console.error(`[MCP:${serverId}] 初始化失败:`, err)
    await stopServer(serverId)
    return false
  }
}

/** 停止 MCP 服务器 */
export async function stopServer(serverId: string): Promise<boolean> {
  const server = servers.get(serverId)
  if (!server) return false

  try {
    // 尝试优雅关闭
    if (server.initialized) {
      sendNotification(serverId, {
        jsonrpc: '2.0',
        method: 'notifications/cancelled',
        params: { reason: 'server shutdown' },
      })
    }
  } catch { /* ignore */ }

  try {
    server.process.kill('SIGTERM')
    // 给进程 2 秒优雅退出
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        try { server.process.kill('SIGKILL') } catch { /* already dead */ }
        resolve()
      }, 2000)
      server.process.on('exit', () => {
        clearTimeout(timeout)
        resolve()
      })
    })
  } catch { /* ignore */ }

  // 清理 pending
  for (const [, pending] of server.pending) {
    clearTimeout(pending.timeout)
    pending.reject(new Error('Server stopped'))
  }

  servers.delete(serverId)
  return true
}

/** 列出服务器工具 */
export function listTools(serverId: string): MCPTool[] {
  const server = servers.get(serverId)
  if (!server || !server.initialized) return []
  return server.tools
}

/** 调用工具 */
export async function callTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const server = servers.get(serverId)
  if (!server || !server.initialized) {
    return { content: `MCP 服务器 "${serverId}" 未启动`, isError: true }
  }

  try {
    const result = await sendRequest(serverId, {
      jsonrpc: '2.0',
      id: getNextId(serverId),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    }) as { content?: Array<{ type: string; text?: string }> }

    if (result?.content && Array.isArray(result.content)) {
      const text = result.content
        .filter((c: { type: string; text?: string }) => c.type === 'text' && c.text)
        .map((c: { text?: string }) => c.text)
        .join('\n')
      return { content: text || JSON.stringify(result), isError: false }
    }

    return { content: JSON.stringify(result), isError: false }
  } catch (err) {
    return { content: `工具调用失败: ${(err as Error).message}`, isError: true }
  }
}

/** 停止所有服务器 */
export function stopAll(): void {
  for (const serverId of servers.keys()) {
    try {
      const server = servers.get(serverId)
      server?.process.kill('SIGTERM')
    } catch { /* ignore */ }
  }
  servers.clear()
}

/** 检查服务器是否在线 */
export function isServerOnline(serverId: string): boolean {
  const server = servers.get(serverId)
  return !!server?.initialized
}

/** 统一导出对象 */
export const mcpManager = {
  startServer,
  stopServer,
  listTools,
  callTool,
  stopAll,
  isServerOnline,
}

// ─── 内部函数 ───

function getNextId(serverId: string): number {
  const server = servers.get(serverId)
  if (!server) return 1
  return server.nextId++
}

function sendRequest(serverId: string, request: MCPRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const server = servers.get(serverId)
    if (!server) {
      reject(new Error(`Server "${serverId}" not found`))
      return
    }

    const timeout = setTimeout(() => {
      server.pending.delete(request.id)
      reject(new Error(`Request timeout: ${request.method}`))
    }, REQUEST_TIMEOUT)

    server.pending.set(request.id, { resolve, reject, timeout })

    const message = JSON.stringify(request) + '\n'
    server.process.stdin?.write(message, (err) => {
      if (err) {
        clearTimeout(timeout)
        server.pending.delete(request.id)
        reject(err)
      }
    })
  })
}

function sendNotification(serverId: string, notification: { jsonrpc: string; method: string; params?: unknown }): void {
  const server = servers.get(serverId)
  if (!server) return

  const message = JSON.stringify(notification) + '\n'
  server.process.stdin?.write(message)
}

function handleStdoutData(serverId: string, data: Buffer): void {
  const server = servers.get(serverId)
  if (!server) return

  server.buffer += data.toString()

  // 解析完整的 JSON-RPC 消息（换行分隔）
  let newlineIdx: number
  while ((newlineIdx = server.buffer.indexOf('\n')) !== -1) {
    const line = server.buffer.slice(0, newlineIdx).trim()
    server.buffer = server.buffer.slice(newlineIdx + 1)

    if (!line) continue

    try {
      const message = JSON.parse(line)

      // 响应（有 id）
      if ('id' in message && typeof message.id === 'number') {
        const pending = server.pending.get(message.id)
        if (pending) {
          clearTimeout(pending.timeout)
          server.pending.delete(message.id)

          if (message.error) {
            pending.reject(new Error(message.error.message || 'MCP error'))
          } else {
            pending.resolve(message.result)
          }
        }
      }
      // 通知（无 id）— 暂不处理
    } catch {
      // 非 JSON 行，忽略
    }
  }
}
