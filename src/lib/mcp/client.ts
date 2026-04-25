/**
 * MCP Client Runtime — 通过 Electron IPC 与 MCP 服务器通信
 *
 * MCP (Model Context Protocol) 是 Anthropic 的开放工具协议
 * 此模块是渲染进程侧的客户端，实际进程管理在 Electron 主进程
 */

export interface MCPTool {
  name: string
  description: string
  inputSchema?: Record<string, unknown>
}

export interface MCPToolResult {
  content: string
  isError?: boolean
}

/** 启动 MCP 服务器 */
export async function spawnMCPServer(
  serverId: string,
  command: string,
  args: string[],
  env: Record<string, string>
): Promise<boolean> {
  if (!window.electronAPI?.mcpSpawn) return false
  try {
    await window.electronAPI.mcpSpawn(serverId, command, args, env)
    return true
  } catch {
    return false
  }
}

/** 列出 MCP 服务器的工具 */
export async function listMCPTools(serverId: string): Promise<MCPTool[]> {
  if (!window.electronAPI?.mcpListTools) return []
  try {
    const tools = await window.electronAPI.mcpListTools(serverId)
    return (tools || []) as MCPTool[]
  } catch {
    return []
  }
}

/** 调用 MCP 工具 */
export async function callMCPTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  if (!window.electronAPI?.mcpCallTool) {
    return { content: 'MCP 不可用（非 Electron 环境）', isError: true }
  }
  try {
    const result = await window.electronAPI.mcpCallTool(serverId, toolName, args)
    return result as MCPToolResult
  } catch (err) {
    return { content: `MCP 调用失败: ${(err as Error).message}`, isError: true }
  }
}

/** 停止 MCP 服务器 */
export async function stopMCPServer(serverId: string): Promise<boolean> {
  if (!window.electronAPI?.mcpStop) return false
  try {
    await window.electronAPI.mcpStop(serverId)
    return true
  } catch {
    return false
  }
}
