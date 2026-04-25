/**
 * MCP ↔ Tool Loop 桥接层
 *
 * 将 MCP 服务器提供的工具自动转换为 Tool Loop 可调用的 Skill
 * 使 AI Agent 在 ReAct 循环中能直接调用任何已连接的 MCP 工具
 */
import { listMCPTools, callMCPTool, type MCPTool, type MCPToolResult } from './client'
import { loadMCPServers, type MCPServer } from './registry'

/** 桥接后的 MCP 技能定义 */
export interface MCPBridgedSkill {
  /** 技能 ID，格式: mcp:{serverId}:{toolName} */
  id: string
  /** 显示名称 */
  name: string
  /** 描述 */
  description: string
  /** 来源 MCP 服务器 ID */
  serverId: string
  /** MCP 工具名 */
  toolName: string
  /** 输入 schema */
  inputSchema?: Record<string, unknown>
}

/**
 * 从所有在线的 MCP 服务器收集工具，转换为 skill 列表
 */
export async function collectMCPSkills(): Promise<MCPBridgedSkill[]> {
  const servers = loadMCPServers().filter(s => s.status === 'online')
  const skills: MCPBridgedSkill[] = []

  for (const server of servers) {
    try {
      const tools = await listMCPTools(server.id)
      for (const tool of tools) {
        skills.push({
          id: `mcp:${server.id}:${tool.name}`,
          name: `${server.name} → ${tool.name}`,
          description: tool.description || `MCP tool from ${server.name}`,
          serverId: server.id,
          toolName: tool.name,
          inputSchema: tool.inputSchema,
        })
      }
    } catch {
      console.warn(`[mcp-bridge] 从 ${server.name} 加载工具失败`)
    }
  }

  return skills
}

/**
 * 生成 MCP 工具的 prompt 片段，注入到 AI 系统提示中
 * 告诉 AI 它可以调用哪些 MCP 工具
 */
export function buildMCPToolPrompt(skills: MCPBridgedSkill[]): string {
  if (skills.length === 0) return ''

  const toolDescriptions = skills.map(skill => {
    const schema = skill.inputSchema
      ? `\n    参数: ${JSON.stringify(skill.inputSchema, null, 2)}`
      : ''
    return `  - ${skill.id}: ${skill.description}${schema}`
  }).join('\n')

  return `
## MCP 外部工具（可通过 tool_call 调用）
以下工具来自已连接的 MCP 服务器，可在需要时调用：

${toolDescriptions}

调用格式: tool_call:mcp:{serverId}:{toolName}({"参数名": "参数值"})
`
}

/**
 * 执行 MCP 桥接技能
 * 解析 skill ID 并调用对应的 MCP 工具
 */
export async function executeMCPSkill(
  skillId: string,
  argsStr: string
): Promise<{ content: string; isError: boolean }> {
  // 解析 skillId: "mcp:{serverId}:{toolName}"
  const parts = skillId.split(':')
  if (parts.length < 3 || parts[0] !== 'mcp') {
    return { content: `无效的 MCP skill ID: ${skillId}`, isError: true }
  }

  const serverId = parts[1]
  const toolName = parts.slice(2).join(':')

  // 解析参数
  let args: Record<string, unknown> = {}
  if (argsStr && argsStr.trim()) {
    try {
      // 尝试 JSON 解析
      args = JSON.parse(argsStr)
    } catch {
      // 非 JSON，作为单一文本参数
      args = { query: argsStr.replace(/^["']|["']$/g, '') }
    }
  }

  try {
    const result = await callMCPTool(serverId, toolName, args)
    return {
      content: result.content,
      isError: result.isError || false,
    }
  } catch (err) {
    return {
      content: `MCP 调用异常: ${(err as Error).message}`,
      isError: true,
    }
  }
}

/**
 * 检查一个 skill ID 是否为 MCP 桥接技能
 */
export function isMCPSkill(skillId: string): boolean {
  return skillId.startsWith('mcp:')
}

/**
 * 获取 MCP 工具统计
 */
export async function getMCPToolStats(): Promise<{
  onlineServers: number
  totalTools: number
  tools: MCPBridgedSkill[]
}> {
  const skills = await collectMCPSkills()
  const servers = new Set(skills.map(s => s.serverId))
  return {
    onlineServers: servers.size,
    totalTools: skills.length,
    tools: skills,
  }
}
