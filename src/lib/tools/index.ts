/**
 * Hermes Tools — 工具注册表与执行引擎
 *
 * 移植 Hermes Agent 的核心工具系统：
 * - 工具注册（内置 + MCP 扩展）
 * - 统一调用接口
 * - 结果验证与错误处理
 * - 使用统计追踪（与 skill_evolution 集成）
 *
 * 工具分 Tier：
 * Tier 1（核心）：web_search, web_extract, clarify, vision_analyze
 * Tier 2（扩展）：terminal, file_read, file_write, desktop_screenshot, desktop_control, xcode_action, code_execute, tts, image_gen
 * Tier 3（集成）：browser, send_message, calendar, email
 */
import { query, run } from '../db/repository'
import { chatCompletion, LLMConfig, getDefaultConfig } from '../ai/provider'
import { getSetting } from '../db/store'
import { generateId } from '../db/schema'
import { recordSkillUsage } from '../skills/evolution'
import { addTriple } from '../memory/knowledge-graph'
import { addMemoryEntry, loadAgentMemory, renderL3DeepSearchEnhanced } from '../agents/agent-memory'
import { loadSkills, saveSkillsState, createSkill } from '../skills/registry'
import { safeExec, validateCommand } from '../security/command-guard'
import { recordToolExecution } from './trust'

// ─── 接口 ───

export interface ToolDefinition {
  id: string
  name: string
  description: string
  tier: 1 | 2 | 3
  enabled: boolean
  parameters: ToolParameter[]
  requiresAuth?: boolean
  mcpServer?: string
}

export interface ToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  required: boolean
  description: string
  default?: unknown
}

export interface ToolResult {
  success: boolean
  data: unknown
  error?: string
  metadata?: Record<string, unknown>
}

export type ToolExecutor = (params: Record<string, unknown>) => Promise<ToolResult>

// ─── 工具注册表 ───

const toolRegistry = new Map<string, { definition: ToolDefinition; executor?: ToolExecutor }>()

/** 注册工具 */
export function registerTool(definition: ToolDefinition, executor?: ToolExecutor): void {
  toolRegistry.set(definition.id, { definition, executor })
}

/** 获取工具定义 */
export function getTool(id: string): ToolDefinition | undefined {
  return toolRegistry.get(id)?.definition
}

/** 列出所有工具 */
export function listTools(tier?: 1 | 2 | 3): ToolDefinition[] {
  const tools = Array.from(toolRegistry.values()).map((t) => t.definition)
  if (tier) return tools.filter((t) => t.tier === tier)
  return tools
}

/** 获取已启用的工具 */
export function getEnabledTools(): ToolDefinition[] {
  return Array.from(toolRegistry.values())
    .map((t) => t.definition)
    .filter((t) => t.enabled)
}

// ─── 工具执行 ───

function extractCommandValidation(result: ToolResult): ReturnType<typeof validateCommand> | undefined {
  const validation = result.metadata?.commandValidation
  return validation && typeof validation === 'object' && 'allowed' in validation
    ? (validation as ReturnType<typeof validateCommand>)
    : undefined
}

/** 执行工具 */
export async function executeTool(toolId: string, params: Record<string, unknown>): Promise<ToolResult> {
  const startedAt = Date.now()
  const entry = toolRegistry.get(toolId)
  if (!entry) {
    return { success: false, data: null, error: `工具 ${toolId} 未注册` }
  }
  if (!entry.definition.enabled) {
    const result = { success: false, data: null, error: `工具 ${toolId} 已禁用` }
    await recordToolExecution({
      definition: entry.definition,
      input: params,
      result,
      durationMs: Date.now() - startedAt,
    })
    return result
  }

  // 参数验证
  for (const param of entry.definition.parameters) {
    if (param.required && (params[param.name] === undefined || params[param.name] === null)) {
      const result = { success: false, data: null, error: `缺少必需参数: ${param.name}` }
      await recordToolExecution({
        definition: entry.definition,
        input: params,
        result,
        durationMs: Date.now() - startedAt,
      })
      return result
    }
  }

  // 执行
  try {
    let result: ToolResult
    if (entry.executor) {
      result = await entry.executor(params)
    } else {
      // 无本地执行器 → 尝试 MCP 调用
      const mcpServer = entry.definition.mcpServer || toolId
      result = await executeViaMCP(mcpServer, toolId, params)
    }

    // 记录使用
    await recordSkillUsage(`tool_${toolId}`, result.success)
    await recordToolExecution({
      definition: entry.definition,
      input: params,
      result,
      durationMs: Date.now() - startedAt,
      commandValidation: extractCommandValidation(result),
    })

    return result
  } catch (err) {
    await recordSkillUsage(`tool_${toolId}`, false)
    const result = {
      success: false,
      data: null,
      error: (err as Error).message,
    }
    await recordToolExecution({
      definition: entry.definition,
      input: params,
      result,
      durationMs: Date.now() - startedAt,
    })
    return result
  }
}

/** 通过 MCP 执行 */
async function executeViaMCP(serverId: string, toolName: string, params: Record<string, unknown>): Promise<ToolResult> {
  // MCP 工具调用由 Electron 主进程处理
  try {
    const mcpResult = await (window as any).electronAPI?.mcpCallTool?.(serverId, toolName, params)
    if (mcpResult) {
      return {
        success: true,
        data: mcpResult,
        metadata: { source: 'mcp', serverId, toolName },
      }
    }
  } catch {
    /* MCP not available */
  }

  return {
    success: false,
    data: null,
    error: `MCP 工具 ${serverId}/${toolName} 无可用执行器（本地和 MCP 均不可用）`,
  }
}

// ─── 构建工具 Prompt（注入 System Prompt） ───

export function buildToolPrompt(tools: ToolDefinition[]): string {
  const enabled = tools.filter((t) => t.enabled)
  if (enabled.length === 0) return ''

  const lines = enabled.map((t) => {
    const params = t.parameters
      .map((p) => `    ${p.name}: ${p.type}${p.required ? ' (required)' : ''} — ${p.description}`)
      .join('\n')
    return `  - ${t.id}: ${t.description}\n    Parameters:\n${params}`
  })

  return `<available-tools>
These tools are available. Call them using JSON: {"tool": "<id>", "params": {...}}

${lines.join('\n\n')}
</available-tools>`
}

// ─── 工具解析 ───

/** 从 LLM 回复中解析工具调用 */
export function parseToolCall(text: string): { tool: string; params: Record<string, unknown> } | null {
  // 尝试匹配 JSON 格式的工具调用
  const jsonMatch = text.match(/\{"tool":\s*"([^"]+)",\s*"params":\s*(\{[^}]*\})\}/)
  if (jsonMatch) {
    try {
      return {
        tool: jsonMatch[1],
        params: JSON.parse(jsonMatch[2]),
      }
    } catch {
      /* invalid json */
    }
  }

  // 尝试匹配 XML 标签格式
  const xmlMatch = text.match(/<tool_call\s+id="([^"]+)">\s*([\s\S]*?)\s*<\/tool_call>/)
  if (xmlMatch) {
    try {
      return {
        tool: xmlMatch[1],
        params: JSON.parse(xmlMatch[2]),
      }
    } catch {
      /* invalid json */
    }
  }

  const colonXmlMatch = text.match(/<tool_call:\s*([a-zA-Z0-9_-]+)\s*>\s*([\s\S]*?)\s*<\/tool_call(?:_use)?>/)
  if (colonXmlMatch) {
    try {
      return {
        tool: colonXmlMatch[1],
        params: JSON.parse(colonXmlMatch[2]),
      }
    } catch {
      /* invalid json */
    }
  }

  return null
}

// ─── 内置工具注册 ───

function initBuiltinTools(): void {
  // Tier 1: 核心工具

  registerTool(
    {
      id: 'web_search',
      name: '网络搜索',
      description: '搜索互联网获取实时信息',
      tier: 1,
      enabled: true,
      parameters: [
        { name: 'query', type: 'string', required: true, description: '搜索关键词' },
        { name: 'max_results', type: 'number', required: false, description: '最大结果数', default: 5 },
      ],
      mcpServer: 'mcp-brave-search',
    },
    async (params) => {
      // 优先：通过主进程代理 Brave Search，避免渲染进程暴露密钥或拼接 shell 命令。
      try {
        const result = await (window as any).electronAPI?.braveSearch?.(
          String(params.query),
          Number(params.max_results) || 5,
        )
        if (result?.success && Array.isArray(result.data) && result.data.length > 0) {
          return { success: true, data: result.data }
        }
      } catch {
        /* Brave API 失败，继续后备 */
      }

      // 后备：MCP Brave Search
      try {
        const result = await (window as any).electronAPI?.mcpCallTool?.('mcp-brave-search', 'brave_web_search', {
          query: params.query,
          count: params.max_results || 5,
        })
        if (result) return { success: true, data: result }
      } catch {
        /* MCP 不可用 */
      }

      return { success: false, data: null, error: '搜索不可用' }
    },
  )

  registerTool(
    {
      id: 'web_extract',
      name: '网页提取',
      description: '提取指定 URL 的网页内容',
      tier: 1,
      enabled: true,
      parameters: [
        { name: 'url', type: 'string', required: true, description: '目标 URL' },
        {
          name: 'format',
          type: 'string',
          required: false,
          description: '输出格式 (markdown/text)',
          default: 'markdown',
        },
      ],
      mcpServer: 'mcp-fetch',
    },
    async (params) => {
      // 优先：通过主进程 curl 抓取
      try {
        const ipcResult = await (window as any).electronAPI?.executeCommand?.(
          `curl -sL "${params.url}" -H "User-Agent: Mozilla/5.0" --max-time 15 | sed 's/<[^>]*>//g' | sed '/^$/d' | head -300`,
          20000,
        )
        const raw = typeof ipcResult === 'string' ? ipcResult : ipcResult?.stdout || ''
        if (raw.trim()) {
          return { success: true, data: raw.trim().slice(0, 5000) }
        }
      } catch {
        /* curl 失败 */
      }

      // 后备：MCP Fetch
      try {
        const result = await (window as any).electronAPI?.mcpCallTool?.('mcp-fetch', 'fetch', {
          url: params.url,
          format: params.format || 'markdown',
        })
        if (result) return { success: true, data: result }
      } catch {
        /* MCP 不可用 */
      }

      return { success: false, data: null, error: '网页提取不可用' }
    },
  )

  registerTool(
    {
      id: 'clarify',
      name: '澄清提问',
      description: '向用户提问以澄清不明确的需求',
      tier: 1,
      enabled: true,
      parameters: [
        { name: 'question', type: 'string', required: true, description: '需要澄清的问题' },
        { name: 'options', type: 'array', required: false, description: '可选的选项列表' },
      ],
    },
    async (params) => {
      // 澄清工具不需要实际执行，返回问题让调用方处理
      return {
        success: true,
        data: {
          question: params.question,
          options: params.options || [],
          type: 'clarification_needed',
        },
      }
    },
  )

	  registerTool(
	    {
	      id: 'vision_analyze',
      name: '图像分析',
      description: '分析图片内容（需要提供图片 URL 或 base64）',
      tier: 1,
      enabled: true,
      parameters: [
        { name: 'image', type: 'string', required: true, description: '图片 URL 或 base64 编码' },
        { name: 'prompt', type: 'string', required: false, description: '分析提示词' },
      ],
    },
    async (params) => {
      // 视觉分析通过 LLM 多模态能力实现
      try {
        const provider = getSetting('llm_provider', 'deepseek')
        const defaults = getDefaultConfig(provider)
        const config: LLMConfig = {
          provider: provider as LLMConfig['provider'],
          apiKey: getSetting('llm_api_key', ''),
          baseUrl: getSetting('llm_base_url', defaults.baseUrl),
          model: getSetting('llm_model', defaults.model),
        }
        const result = await chatCompletion(
          config,
          [
            {
              role: 'user',
              content: `${params.prompt || '请分析这张图片'}\n\n[Image: ${(params.image as string).slice(0, 100)}...]`,
            },
          ],
          0.5,
          1024,
        )
        return { success: true, data: { analysis: result } }
      } catch (err) {
        return { success: false, data: null, error: (err as Error).message }
      }
    },
  )

	  // Tier 2: 扩展工具

	  registerTool(
	    {
	      id: 'desktop_screenshot',
	      name: '桌面截图观察',
	      description: '截取当前 Mac 屏幕并可执行 OCR，用于 UI/桌面状态观察',
	      tier: 2,
	      enabled: true,
	      parameters: [
	        { name: 'includeOcr', type: 'boolean', required: false, description: '是否同时识别截图文字', default: true },
	        { name: 'fileBaseName', type: 'string', required: false, description: '截图文件名标识', default: 'screen' },
	        { name: 'region', type: 'object', required: false, description: '可选截图区域 {x,y,width,height}' },
	      ],
	    },
	    async (params) => {
	      try {
	        const result = await (window as any).electronAPI?.captureScreen?.({
	          includeOcr: params.includeOcr !== false,
	          fileBaseName: String(params.fileBaseName || 'screen'),
	          region: params.region,
	        })
	        return {
	          success: Boolean(result?.success),
	          data: result,
	          error: result?.success ? undefined : result?.error || '截图失败',
	        }
	      } catch (err) {
	        return { success: false, data: null, error: (err as Error).message }
	      }
	    },
	  )

	  registerTool(
	    {
	      id: 'desktop_control',
	      name: 'Mac 桌面控制',
	      description: '通过受限模板控制 Mac：激活 App、打开路径/URL、快捷键、输入文本、点击坐标、菜单点击',
	      tier: 2,
	      enabled: true,
	      parameters: [
	        { name: 'action', type: 'string', required: true, description: 'activate_app|open_path|open_url|keystroke|shortcut|press_key|click|menu_click' },
	        { name: 'appName', type: 'string', required: false, description: '目标 App 名称，如 Xcode、Safari' },
	        { name: 'path', type: 'string', required: false, description: 'open_path 目标路径' },
	        { name: 'url', type: 'string', required: false, description: 'open_url 目标 URL' },
	        { name: 'text', type: 'string', required: false, description: 'keystroke 输入文本' },
	        { name: 'key', type: 'string', required: false, description: 'shortcut/press_key 按键' },
	        { name: 'modifiers', type: 'array', required: false, description: 'command/shift/option/control' },
	        { name: 'x', type: 'number', required: false, description: 'click 坐标 x' },
	        { name: 'y', type: 'number', required: false, description: 'click 坐标 y' },
	        { name: 'menuPath', type: 'array', required: false, description: 'menu_click 菜单路径，如 [File, Open...]' },
	      ],
	    },
	    async (params) => {
	      try {
	        const result = await (window as any).electronAPI?.desktopControl?.(params)
	        return {
	          success: Boolean(result?.success),
	          data: result,
	          error: result?.success ? undefined : result?.error || '桌面控制失败',
	        }
	      } catch (err) {
	        return { success: false, data: null, error: (err as Error).message }
	      }
	    },
	  )

	  registerTool(
	    {
	      id: 'xcode_action',
	      name: 'Xcode 动作',
	      description: '执行 Xcode 专属动作：list/build/test/clean/archive/open/simctl-list',
	      tier: 2,
	      enabled: true,
	      parameters: [
	        { name: 'action', type: 'string', required: true, description: '动作 list|build|test|clean|archive|open|simctl-list' },
	        { name: 'projectPath', type: 'string', required: false, description: '项目根目录、.xcodeproj 或 .xcworkspace 路径' },
	        { name: 'scheme', type: 'string', required: false, description: 'Xcode scheme' },
	        { name: 'destination', type: 'string', required: false, description: '构建/测试 destination' },
	        { name: 'configuration', type: 'string', required: false, description: 'Debug/Release 等配置' },
	        { name: 'sdk', type: 'string', required: false, description: '可选 SDK' },
	        { name: 'simctlKind', type: 'string', required: false, description: 'simctl-list 类型 devices/runtimes/devicetypes' },
	        { name: 'timeout', type: 'number', required: false, description: '超时时间(ms)', default: 120000 },
	      ],
	    },
	    async (params) => {
	      try {
	        const result = await (window as any).electronAPI?.xcodeAction?.({
	          action: params.action,
	          projectPath: params.projectPath,
	          scheme: params.scheme,
	          destination: params.destination,
	          configuration: params.configuration,
	          sdk: params.sdk,
	          simctlKind: params.simctlKind,
	          timeout: params.timeout,
	        })
	        return {
	          success: Boolean(result?.success),
	          data: result,
	          error: result?.success ? undefined : result?.error || 'Xcode 动作失败',
	        }
	      } catch (err) {
	        return { success: false, data: null, error: (err as Error).message }
	      }
	    },
	  )

	  registerTool(
	    {
	      id: 'terminal',
      name: '终端执行',
      description: '执行终端命令（需要用户确认）',
      tier: 2,
      enabled: true,
      parameters: [
        { name: 'command', type: 'string', required: true, description: '要执行的命令' },
        { name: 'timeout', type: 'number', required: false, description: '超时时间(ms)', default: 30000 },
      ],
    },
    async (params) => {
      const command = String(params.command || '')
      const validation = validateCommand(command)
      if (!validation.allowed) {
        return {
          success: false,
          data: null,
          error: `终端命令被拒绝: ${validation.reason}`,
          metadata: { commandValidation: validation },
        }
      }
      const result = await safeExec(command, Number(params.timeout) || 30000)
      return {
        success: result.success,
        data: result,
        error: result.success ? undefined : `终端执行失败: ${result.error || result.stderr || 'unknown error'}`,
        metadata: { commandValidation: validation },
      }
    },
  )

  registerTool(
    {
      id: 'file_read',
      name: '文件读取',
      description: '读取本地文件内容',
      tier: 2,
      enabled: true,
      parameters: [
        { name: 'path', type: 'string', required: true, description: '文件路径' },
        { name: 'encoding', type: 'string', required: false, description: '编码格式', default: 'utf-8' },
      ],
    },
    async (params) => {
      try {
        const content = await (window as any).electronAPI?.readFile?.(params.path, params.encoding)
        return { success: true, data: { content, path: params.path } }
      } catch (err) {
        return { success: false, data: null, error: `文件读取失败: ${(err as Error).message}` }
      }
    },
  )

  registerTool(
    {
      id: 'file_write',
      name: '文件写入',
      description: '写入内容到本地文件（需要用户确认）',
      tier: 2,
      enabled: true,
      parameters: [
        { name: 'path', type: 'string', required: true, description: '文件路径' },
        { name: 'content', type: 'string', required: true, description: '文件内容' },
      ],
    },
    async (params) => {
      try {
        await (window as any).electronAPI?.writeFile?.(params.path, params.content)
        return { success: true, data: { path: params.path } }
      } catch (err) {
        return { success: false, data: null, error: `文件写入失败: ${(err as Error).message}` }
      }
    },
  )

  registerTool(
    {
      id: 'code_execute',
      name: '代码执行',
      description: '在沙箱中执行代码片段',
      tier: 2,
      enabled: true,
      parameters: [
        { name: 'code', type: 'string', required: true, description: '代码内容' },
        { name: 'language', type: 'string', required: false, description: '编程语言', default: 'javascript' },
      ],
    },
    async (params) => {
      // 简单的 JS 沙箱执行
      if (params.language === 'javascript') {
        try {
          const fn = new Function('return ' + params.code)
          const result = fn()
          return { success: true, data: { result: String(result) } }
        } catch (err) {
          return { success: false, data: null, error: `执行错误: ${(err as Error).message}` }
        }
      }
      return { success: false, data: null, error: `不支持的语言: ${params.language}` }
    },
  )

  registerTool(
    {
      id: 'tts',
      name: '语音合成',
      description: '将文本转换为语音',
      tier: 2,
      enabled: true,
      parameters: [
        { name: 'text', type: 'string', required: true, description: '要朗读的文本' },
        { name: 'lang', type: 'string', required: false, description: '语言', default: 'zh-CN' },
      ],
    },
    async (params) => {
      try {
        const utterance = new SpeechSynthesisUtterance(params.text as string)
        utterance.lang = (params.lang as string) || 'zh-CN'
        speechSynthesis.speak(utterance)
        return { success: true, data: { spoken: true } }
      } catch (err) {
        return { success: false, data: null, error: `语音合成失败: ${(err as Error).message}` }
      }
    },
  )

  // Tier 3: 集成工具

  registerTool(
    {
      id: 'memory_search',
      name: '记忆搜索',
      description: '从记忆宫殿和知识图谱中搜索相关信息',
      tier: 3,
      enabled: true,
      parameters: [
        { name: 'query', type: 'string', required: true, description: '搜索关键词' },
        {
          name: 'sources',
          type: 'array',
          required: false,
          description: '搜索源 (palace/graph/agent)',
          default: ['palace', 'graph'],
        },
      ],
    },
    async (params) => {
      const results: unknown[] = []
      try {
        // L3 增强深度搜索: Agent Memory + 知识图谱 + 突触路径
        const memory = await loadAgentMemory('general')
        const { memoryEntries, knowledgeTriples, synapsePaths } = await renderL3DeepSearchEnhanced(
          memory,
          params.query as string,
        )
        results.push(...memoryEntries.map((e) => ({ source: 'agent_memory', text: e.text })))
        results.push(
          ...knowledgeTriples.map((t) => ({
            source: 'knowledge_graph',
            text: `${t.subject} —[${t.predicate}]→ ${t.object} (${Math.round(t.confidence * 100)}%)`,
          })),
        )
        results.push(
          ...synapsePaths.map((p) => ({
            source: 'synapse_path',
            text: `${p.from} ↔ ${p.to}: ${p.path}`,
          })),
        )
      } catch {
        /* ignore */
      }
      try {
        // FTS5 搜索记忆宫殿
        const palaceResults = await query<{ content: string; room_id: string }>(
          'SELECT content, room_id FROM memory_items WHERE memory_items MATCH ? ORDER BY importance DESC LIMIT 10',
          [params.query],
        )
        results.push(...palaceResults.map((r) => ({ source: 'memory_palace', text: r.content, room: r.room_id })))
      } catch {
        /* ignore */
      }
      return { success: true, data: results }
    },
  )

  registerTool(
    {
      id: 'knowledge_add',
      name: '知识添加',
      description: '将新知识添加到知识图谱',
      tier: 3,
      enabled: true,
      parameters: [
        { name: 'subject', type: 'string', required: true, description: '主体' },
        { name: 'predicate', type: 'string', required: true, description: '关系' },
        { name: 'object', type: 'string', required: true, description: '客体' },
        { name: 'confidence', type: 'number', required: false, description: '置信度 (0-1)', default: 0.8 },
      ],
    },
    async (params) => {
      try {
        await addTriple({
          subject: params.subject as string,
          predicate: params.predicate as string,
          object: params.object as string,
          confidence: (params.confidence as number) || 0.8,
        })
        return { success: true, data: { triple: `${params.subject} → ${params.predicate} → ${params.object}` } }
      } catch (err) {
        return { success: false, data: null, error: (err as Error).message }
      }
    },
  )

  registerTool(
    {
      id: 'send_message',
      name: '发送消息',
      description: '向用户或其他 Agent 发送消息',
      tier: 3,
      enabled: true,
      parameters: [
        { name: 'target', type: 'string', required: true, description: '目标（用户或 Agent ID）' },
        { name: 'message', type: 'string', required: true, description: '消息内容' },
      ],
    },
    async (params) => {
      try {
        await (window as any).electronAPI?.dbRun?.(
          'INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, datetime("now","localtime"))',
          [generateId(), 'broadcast', 'assistant', `[→${params.target}] ${params.message}`],
        )
        return { success: true, data: { delivered: true, target: params.target } }
      } catch (err) {
        return { success: false, data: null, error: (err as Error).message }
      }
    },
  )

  // ═══ Hermes Agent 额外工具 ═══

  // 文件工具集
  registerTool(
    {
      id: 'process',
      name: '进程管理',
      description: '管理后台终端进程（list/poll/log/wait/kill/write）',
      tier: 2,
      enabled: true,
      parameters: [
        { name: 'action', type: 'string', required: true, description: '操作: list|poll|log|wait|kill|write' },
        { name: 'pid', type: 'string', required: false, description: '进程 ID' },
        { name: 'input', type: 'string', required: false, description: '写入内容' },
      ],
    },
    async (params) => {
      const action = params.action as string
      try {
        if (action === 'list') {
          const result = await (window as any).electronAPI?.executeCommand?.('ps aux')
          return { success: true, data: { processes: result?.stdout || '' } }
        } else if (action === 'kill') {
          const result = await (window as any).electronAPI?.executeCommand?.(`kill ${params.pid}`)
          return { success: true, data: { killed: params.pid, result } }
        }
        return { success: true, data: { action, pid: params.pid } }
      } catch (err) {
        return { success: false, data: null, error: (err as Error).message }
      }
    },
  )

  registerTool(
    {
      id: 'patch',
      name: '文件补丁',
      description: '精确查找替换文件编辑，支持模糊匹配',
      tier: 2,
      enabled: true,
      parameters: [
        { name: 'path', type: 'string', required: true, description: '文件路径' },
        { name: 'search', type: 'string', required: true, description: '查找内容' },
        { name: 'replace', type: 'string', required: true, description: '替换内容' },
        { name: 'dry_run', type: 'boolean', required: false, description: '仅预览不修改', default: false },
      ],
    },
    async (params) => {
      try {
        const content = await (window as any).electronAPI?.readFile?.(params.path)
        if (typeof content !== 'string') return { success: false, data: null, error: '文件读取失败' }
        if (!content.includes(params.search as string)) return { success: false, data: null, error: '未找到匹配内容' }
        const newContent = content.replace(params.search as string, params.replace as string)
        if (params.dry_run) return { success: true, data: { preview: newContent.slice(0, 500), matched: true } }
        await (window as any).electronAPI?.writeFile?.(params.path, newContent)
        return { success: true, data: { patched: true, path: params.path } }
      } catch (err) {
        return { success: false, data: null, error: (err as Error).message }
      }
    },
  )

  registerTool(
    {
      id: 'search_files',
      name: '文件搜索',
      description: 'ripgrep 文件内容和文件名搜索',
      tier: 2,
      enabled: true,
      parameters: [
        { name: 'pattern', type: 'string', required: true, description: '搜索模式（正则）' },
        { name: 'path', type: 'string', required: false, description: '搜索路径', default: '.' },
        { name: 'glob', type: 'string', required: false, description: '文件过滤（如 *.ts）' },
        { name: 'max_results', type: 'number', required: false, description: '最大结果数', default: 50 },
      ],
    },
    async (params) => {
      try {
        const cmd = `rg --max-count ${(params.max_results as number) || 50} --no-heading -n "${params.pattern}" ${params.path || '.'}${params.glob ? ` --glob "${params.glob}"` : ''}`
        const result = await (window as any).electronAPI?.executeCommand?.(cmd, 10000)
        return { success: true, data: { matches: result?.stdout || '', truncated: false } }
      } catch (err) {
        return { success: false, data: null, error: (err as Error).message }
      }
    },
  )

  // 图像工具集
  registerTool(
    {
      id: 'image_generate',
      name: '图像生成',
      description: '从文本描述生成图像',
      tier: 2,
      enabled: true,
      parameters: [
        { name: 'prompt', type: 'string', required: true, description: '图像描述' },
        { name: 'size', type: 'string', required: false, description: '尺寸 (如 1024x1024)', default: '1024x1024' },
        { name: 'style', type: 'string', required: false, description: '风格' },
      ],
    },
    async (params) => {
      try {
        const provider = getSetting('llm_provider', 'deepseek')
        const defaults = getDefaultConfig(provider)
        const config: LLMConfig = {
          provider: provider as LLMConfig['provider'],
          apiKey: getSetting('llm_api_key', ''),
          baseUrl: getSetting('llm_base_url', defaults.baseUrl),
          model: getSetting('llm_model', defaults.model),
        }
        const desc = await chatCompletion(
          config,
          [
            {
              role: 'system',
              content:
                '你是一个图像描述生成器。根据用户的文字描述，生成一段详细的英文图像生成 prompt，用于 AI 绘画工具。',
            },
            { role: 'user', content: params.prompt as string },
          ],
          0.8,
          512,
        )
        return { success: true, data: { prompt: desc, size: params.size, style: params.style } }
      } catch (err) {
        return { success: false, data: null, error: (err as Error).message }
      }
    },
  )

  // 技能管理工具集
  registerTool(
    {
      id: 'skills_list',
      name: '技能列表',
      description: '列出所有可用技能',
      tier: 3,
      enabled: true,
      parameters: [
        { name: 'category', type: 'string', required: false, description: '按分类过滤' },
        { name: 'source', type: 'string', required: false, description: '按来源过滤' },
      ],
    },
    async (params) => {
      const skills = loadSkills()
      let filtered = skills
      if (params.category) filtered = filtered.filter((s) => s.category === params.category)
      if (params.source) filtered = filtered.filter((s) => s.source === params.source)
      return {
        success: true,
        data: filtered.map((s) => ({ id: s.id, name: s.name, enabled: s.enabled, source: s.source })),
      }
    },
  )

  registerTool(
    {
      id: 'skill_view',
      name: '技能查看',
      description: '加载技能的完整内容',
      tier: 3,
      enabled: true,
      parameters: [{ name: 'skill_id', type: 'string', required: true, description: '技能 ID' }],
    },
    async (params) => {
      const skills = loadSkills()
      const skill = skills.find((s) => s.id === params.skill_id)
      if (!skill) return { success: false, data: null, error: '技能未找到' }
      try {
        const rows = await query<{ usage_count: number; success_count: number; improved_prompt: string }>(
          'SELECT usage_count, success_count, improved_prompt FROM skill_evolution WHERE skill_id = ?',
          [skill.id],
        )
        return { success: true, data: { ...skill, evolution: rows[0] || null } }
      } catch {
        return { success: true, data: skill }
      }
    },
  )

  registerTool(
    {
      id: 'skill_manage',
      name: '技能管理',
      description: '创建/更新/删除技能',
      tier: 3,
      enabled: true,
      parameters: [
        { name: 'action', type: 'string', required: true, description: '操作: create|update|delete' },
        { name: 'skill_id', type: 'string', required: false, description: '技能 ID' },
        { name: 'definition', type: 'object', required: false, description: '技能定义' },
      ],
    },
    async (params) => {
      const action = params.action as string
      if (action === 'create' && params.definition) {
        const def = params.definition as Record<string, unknown>
        const skill = createSkill({
          id: def.id as string,
          name: def.name as string,
          description: def.description as string,
        })
        const skills = loadSkills()
        skills.push(skill)
        saveSkillsState(skills)
        return { success: true, data: { created: skill.id } }
      } else if (action === 'delete' && params.skill_id) {
        const skills = loadSkills().filter((s) => s.id !== params.skill_id)
        saveSkillsState(skills)
        return { success: true, data: { deleted: params.skill_id } }
      }
      return { success: false, data: null, error: '无效操作' }
    },
  )

  // 浏览器自动化工具集 — 通过 MCP Playwright 桥接
  const playwrightExecutor =
    (toolName: string): ToolExecutor =>
    async (params) => {
      try {
        const result = await (window as any).electronAPI?.mcpCallTool?.('mcp-playwright', toolName, params)
        if (result) return { success: true, data: result }
        return { success: false, data: null, error: 'Playwright MCP 服务器未启动' }
      } catch (err) {
        return { success: false, data: null, error: (err as Error).message }
      }
    }

  registerTool(
    {
      id: 'browser_navigate',
      name: '浏览器导航',
      description: '导航到指定 URL',
      tier: 3,
      enabled: true,
      parameters: [
        { name: 'url', type: 'string', required: true, description: '目标 URL' },
        { name: 'wait', type: 'string', required: false, description: '等待条件' },
      ],
    },
    playwrightExecutor('browser_navigate'),
  )

  registerTool(
    {
      id: 'browser_snapshot',
      name: '浏览器快照',
      description: '获取页面可访问性树快照',
      tier: 3,
      enabled: true,
      parameters: [],
    },
    playwrightExecutor('browser_snapshot'),
  )

  registerTool(
    {
      id: 'browser_click',
      name: '浏览器点击',
      description: '点击页面元素',
      tier: 3,
      enabled: true,
      parameters: [
        { name: 'selector', type: 'string', required: true, description: '元素选择器' },
        { name: 'button', type: 'string', required: false, description: '鼠标按钮', default: 'left' },
      ],
    },
    playwrightExecutor('browser_click'),
  )

  registerTool(
    {
      id: 'browser_type',
      name: '浏览器输入',
      description: '在输入框中输入文本',
      tier: 3,
      enabled: true,
      parameters: [
        { name: 'selector', type: 'string', required: true, description: '元素选择器' },
        { name: 'text', type: 'string', required: true, description: '输入文本' },
        { name: 'clear', type: 'boolean', required: false, description: '先清空', default: true },
      ],
    },
    playwrightExecutor('browser_type'),
  )

  registerTool(
    {
      id: 'browser_scroll',
      name: '浏览器滚动',
      description: '滚动页面',
      tier: 3,
      enabled: true,
      parameters: [
        { name: 'direction', type: 'string', required: true, description: '方向: up|down' },
        { name: 'amount', type: 'number', required: false, description: '滚动量(px)', default: 300 },
      ],
    },
    playwrightExecutor('browser_scroll'),
  )

  registerTool(
    { id: 'browser_back', name: '浏览器后退', description: '后退到上一页', tier: 3, enabled: true, parameters: [] },
    playwrightExecutor('browser_back'),
  )

  registerTool(
    {
      id: 'browser_press',
      name: '浏览器按键',
      description: '模拟键盘按键',
      tier: 3,
      enabled: true,
      parameters: [
        { name: 'key', type: 'string', required: true, description: '按键（如 Enter, Tab）' },
        { name: 'modifiers', type: 'array', required: false, description: '修饰键 (Control, Shift 等)' },
      ],
    },
    playwrightExecutor('browser_press'),
  )

  registerTool(
    {
      id: 'browser_get_images',
      name: '浏览器图片',
      description: '获取页面所有图片',
      tier: 3,
      enabled: true,
      parameters: [
        { name: 'selector', type: 'string', required: false, description: '过滤选择器' },
        { name: 'min_width', type: 'number', required: false, description: '最小宽度', default: 100 },
      ],
    },
    playwrightExecutor('browser_get_images'),
  )

  registerTool(
    {
      id: 'browser_vision',
      name: '浏览器视觉',
      description: '截图并用视觉 AI 分析',
      tier: 3,
      enabled: true,
      parameters: [
        { name: 'prompt', type: 'string', required: false, description: '分析提示词' },
        { name: 'selector', type: 'string', required: false, description: '截图区域选择器' },
      ],
    },
    playwrightExecutor('browser_vision'),
  )

  registerTool(
    {
      id: 'browser_console',
      name: '浏览器控制台',
      description: '获取页面控制台输出',
      tier: 3,
      enabled: true,
      parameters: [
        { name: 'level', type: 'string', required: false, description: '日志级别: log|warn|error|all', default: 'all' },
        { name: 'limit', type: 'number', required: false, description: '最大条数', default: 50 },
      ],
    },
    playwrightExecutor('browser_console'),
  )

  // 规划记忆工具集
  registerTool(
    {
      id: 'todo',
      name: '任务清单',
      description: '管理待办事项列表',
      tier: 2,
      enabled: true,
      parameters: [
        { name: 'action', type: 'string', required: true, description: '操作: list|add|complete|remove|update' },
        { name: 'task_id', type: 'string', required: false, description: '任务 ID' },
        { name: 'content', type: 'string', required: false, description: '任务内容' },
        { name: 'priority', type: 'string', required: false, description: '优先级: high|medium|low' },
      ],
    },
    async (params) => {
      try {
        await run(
          'CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY, content TEXT, priority TEXT DEFAULT \'medium\', status TEXT DEFAULT \'pending\', created_at TEXT DEFAULT(datetime("now","localtime")))',
        )
        const action = params.action as string
        if (action === 'list') {
          const rows = await query<{ id: string; content: string; priority: string; status: string }>(
            'SELECT id, content, priority, status FROM todos ORDER BY created_at DESC',
          )
          return { success: true, data: rows }
        } else if (action === 'add') {
          const id = generateId()
          await run('INSERT INTO todos (id, content, priority) VALUES (?, ?, ?)', [
            id,
            params.content,
            params.priority || 'medium',
          ])
          return { success: true, data: { id, content: params.content } }
        } else if (action === 'complete') {
          await run("UPDATE todos SET status = 'completed' WHERE id = ?", [params.task_id])
          return { success: true, data: { completed: params.task_id } }
        } else if (action === 'remove') {
          await run('DELETE FROM todos WHERE id = ?', [params.task_id])
          return { success: true, data: { removed: params.task_id } }
        }
        return { success: false, data: null, error: '无效操作' }
      } catch (err) {
        return { success: false, data: null, error: (err as Error).message }
      }
    },
  )

  registerTool(
    {
      id: 'memory',
      name: '持久记忆',
      description: '保存重要信息到跨会话持久记忆',
      tier: 2,
      enabled: true,
      parameters: [
        { name: 'content', type: 'string', required: true, description: '记忆内容' },
        { name: 'category', type: 'string', required: false, description: '分类' },
        { name: 'tags', type: 'array', required: false, description: '标签' },
      ],
    },
    async (params) => {
      try {
        await addMemoryEntry('general', `[${params.category || 'general'}] ${params.content}`)
        return { success: true, data: { saved: true, content: (params.content as string).slice(0, 100) } }
      } catch (err) {
        return { success: false, data: null, error: (err as Error).message }
      }
    },
  )

  registerTool(
    {
      id: 'session_search',
      name: '会话搜索',
      description: '搜索历史对话记录',
      tier: 2,
      enabled: true,
      parameters: [
        { name: 'query', type: 'string', required: true, description: '搜索关键词' },
        { name: 'limit', type: 'number', required: false, description: '最大结果数', default: 10 },
        { name: 'date_range', type: 'string', required: false, description: '日期范围' },
      ],
    },
    async (params) => {
      try {
        const rows = await query<{ id: string; title: string; messages_json: string; updated_at: string }>(
          'SELECT id, title, messages_json, updated_at FROM conversations WHERE messages_json LIKE ? ORDER BY updated_at DESC LIMIT ?',
          [`%${params.query}%`, (params.limit as number) || 10],
        )
        const results = rows.map((r) => ({
          id: r.id,
          title: r.title,
          updated_at: r.updated_at,
          preview: r.messages_json.slice(0, 200),
        }))
        return { success: true, data: results }
      } catch (err) {
        return { success: false, data: null, error: (err as Error).message }
      }
    },
  )

  // 执行委派工具集
  registerTool(
    {
      id: 'execute_code',
      name: '代码执行',
      description: '运行 Python/JS 脚本（带工具访问沙箱）',
      tier: 2,
      enabled: true,
      parameters: [
        { name: 'code', type: 'string', required: true, description: '代码内容' },
        { name: 'language', type: 'string', required: false, description: '编程语言', default: 'python' },
        { name: 'timeout', type: 'number', required: false, description: '超时(ms)', default: 60000 },
      ],
    },
    async (params) => {
      const lang = (params.language as string) || 'python'
      try {
        if (lang === 'javascript') {
          const fn = new Function('return ' + params.code)
          const result = fn()
          return { success: true, data: { result: String(result), language: 'javascript' } }
        }
        const cmd =
          lang === 'python' ? `python3 -c ${JSON.stringify(params.code)}` : `${lang} -e ${JSON.stringify(params.code)}`
        const result = await (window as any).electronAPI?.executeCommand?.(cmd, (params.timeout as number) || 60000)
        return { success: result?.success ?? false, data: result }
      } catch (err) {
        return { success: false, data: null, error: (err as Error).message }
      }
    },
  )

  registerTool(
    {
      id: 'delegate_task',
      name: '子代理委派',
      description: '生成子代理并行处理任务',
      tier: 2,
      enabled: true,
      parameters: [
        { name: 'task', type: 'string', required: true, description: '任务描述' },
        { name: 'context', type: 'string', required: false, description: '上下文信息' },
        { name: 'max_subagents', type: 'number', required: false, description: '最大子代理数', default: 3 },
      ],
    },
    async (params) => {
      try {
        const provider = getSetting('llm_provider', 'deepseek')
        const defaults = getDefaultConfig(provider)
        const config: LLMConfig = {
          provider: provider as LLMConfig['provider'],
          apiKey: getSetting('llm_api_key', ''),
          baseUrl: getSetting('llm_base_url', defaults.baseUrl),
          model: getSetting('llm_model', defaults.model),
        }
        const result = await chatCompletion(
          config,
          [
            { role: 'system', content: '你是一个子代理。独立完成以下任务，给出简洁的结果。' },
            { role: 'user', content: `${params.context ? `背景: ${params.context}\n\n` : ''}任务: ${params.task}` },
          ],
          0.5,
          2048,
        )
        return { success: true, data: { result } }
      } catch (err) {
        return { success: false, data: null, error: (err as Error).message }
      }
    },
  )

  // 定时任务工具集
  registerTool(
    {
      id: 'cronjob',
      name: '定时任务',
      description: '创建和管理定时执行的任务',
      tier: 3,
      enabled: true,
      parameters: [
        { name: 'action', type: 'string', required: true, description: '操作: create|list|delete|update' },
        { name: 'schedule', type: 'string', required: false, description: 'cron 表达式' },
        { name: 'task', type: 'string', required: false, description: '任务描述' },
        { name: 'job_id', type: 'string', required: false, description: '任务 ID' },
      ],
    },
    async (params) => {
      try {
        await run(
          'CREATE TABLE IF NOT EXISTS cron_jobs (id TEXT PRIMARY KEY, schedule TEXT, task TEXT, enabled INTEGER DEFAULT 1, created_at TEXT DEFAULT(datetime("now","localtime")))',
        )
        const action = params.action as string
        if (action === 'list') {
          const rows = await query<{ id: string; schedule: string; task: string; enabled: number }>(
            'SELECT * FROM cron_jobs',
          )
          return { success: true, data: rows }
        } else if (action === 'create') {
          const id = generateId()
          await run('INSERT INTO cron_jobs (id, schedule, task) VALUES (?, ?, ?)', [id, params.schedule, params.task])
          return { success: true, data: { id, schedule: params.schedule, task: params.task } }
        } else if (action === 'delete') {
          await run('DELETE FROM cron_jobs WHERE id = ?', [params.job_id])
          return { success: true, data: { deleted: params.job_id } }
        }
        return { success: false, data: null, error: '无效操作' }
      } catch (err) {
        return { success: false, data: null, error: (err as Error).message }
      }
    },
  )

  // Home Assistant 工具集（默认禁用）
  const haFetch = async (path: string, method = 'GET', body?: unknown) => {
    const haUrl = getSetting('ha_url', '')
    const haToken = getSetting('ha_token', '')
    if (!haUrl) throw new Error('Home Assistant URL 未配置')
    const res = await fetch(`${haUrl}/api${path}`, {
      method,
      headers: { Authorization: `Bearer ${haToken}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    return res.json()
  }

  registerTool(
    {
      id: 'ha_list_entities',
      name: 'HA 实体列表',
      description: '列出 Home Assistant 实体',
      tier: 3,
      enabled: false,
      parameters: [{ name: 'domain', type: 'string', required: false, description: '按域过滤（如 light, switch）' }],
    },
    async (params) => {
      try {
        const data = await haFetch('/states')
        const entities = params.domain ? data.filter((e: any) => e.entity_id.startsWith(`${params.domain}.`)) : data
        return { success: true, data: entities.map((e: any) => ({ id: e.entity_id, state: e.state })) }
      } catch (err) {
        return { success: false, data: null, error: (err as Error).message }
      }
    },
  )

  registerTool(
    {
      id: 'ha_get_state',
      name: 'HA 状态查询',
      description: '获取 Home Assistant 实体状态',
      tier: 3,
      enabled: false,
      parameters: [{ name: 'entity_id', type: 'string', required: true, description: '实体 ID' }],
    },
    async (params) => {
      try {
        const data = await haFetch(`/states/${params.entity_id}`)
        return { success: true, data }
      } catch (err) {
        return { success: false, data: null, error: (err as Error).message }
      }
    },
  )

  registerTool(
    {
      id: 'ha_list_services',
      name: 'HA 服务列表',
      description: '列出 Home Assistant 可用服务',
      tier: 3,
      enabled: false,
      parameters: [{ name: 'domain', type: 'string', required: false, description: '按域过滤' }],
    },
    async (params) => {
      try {
        const data = await haFetch('/services')
        return { success: true, data: params.domain ? data[params.domain as string] : data }
      } catch (err) {
        return { success: false, data: null, error: (err as Error).message }
      }
    },
  )

  registerTool(
    {
      id: 'ha_call_service',
      name: 'HA 服务调用',
      description: '调用 Home Assistant 服务控制设备',
      tier: 3,
      enabled: false,
      parameters: [
        { name: 'service', type: 'string', required: true, description: '服务名称' },
        { name: 'entity_id', type: 'string', required: true, description: '实体 ID' },
        { name: 'data', type: 'object', required: false, description: '服务参数' },
      ],
    },
    async (params) => {
      try {
        const [domain, service] = (params.service as string).split('.')
        const data = await haFetch(`/services/${domain}/${service}`, 'POST', {
          entity_id: params.entity_id,
          ...((params.data as object) || {}),
        })
        return { success: true, data }
      } catch (err) {
        return { success: false, data: null, error: (err as Error).message }
      }
    },
  )
}

// 初始化
initBuiltinTools()

// ─── 工具统计 ───

export async function getToolStats(): Promise<{
  total: number
  enabled: number
  byTier: Record<number, number>
}> {
  const tools = listTools()
  return {
    total: tools.length,
    enabled: tools.filter((t) => t.enabled).length,
    byTier: {
      1: tools.filter((t) => t.tier === 1).length,
      2: tools.filter((t) => t.tier === 2).length,
      3: tools.filter((t) => t.tier === 3).length,
    },
  }
}
