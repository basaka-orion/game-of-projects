/**
 * MCP Registry — Model Context Protocol 服务器注册表
 *
 * MCP 是 Anthropic 开放的工具协议，允许 AI 调用外部工具
 * 这里管理应用预置的 MCP 服务器配置
 *
 * 每个 MCP 服务器 = 智能体的一双"手脚"
 * - Fetch → 能上网抓取内容
 * - Filesystem → 能读写本地文件
 * - SQLite → 能直接查询数据库
 * - Memory → 能构建持久知识图谱
 * - Brave Search → 能搜索互联网
 * - Sequential Thinking → 能做深度推理
 */

export interface MCPServer {
  id: string
  name: string
  description: string
  /** 启动命令 */
  command: string
  /** 命令参数 */
  args: string[]
  /** 环境变量（如 API Key） */
  env: Record<string, string>
  /** 运行状态 */
  status: MCPServerStatus
  /** 已发现的工具数量 */
  tools: number
  /** 分类 */
  category: string
  /** 图标 */
  icon: string
  /** 安装提示 */
  installHint: string
  /** 是否为推荐安装 */
  recommended?: boolean
}

export type MCPServerStatus = 'online' | 'offline' | 'error' | 'pending' | 'not-installed'

const MCP_STORAGE_KEY = 'gop_mcp_servers'

/**
 * 默认 MCP 服务器清单
 *
 * 设计原则：
 * 1. 覆盖智能体最关键的 6 种外部能力
 * 2. 每个服务器都有明确的用途说明
 * 3. 优先使用 npx 一键启动；少数核心服务允许用本地命令接入
 */
export const DEFAULT_MCP_SERVERS: MCPServer[] = [
  {
    id: 'mcp-fetch',
    name: 'Fetch',
    description: 'HTTP 请求与网页内容获取 — 访问任意 URL、下载文件、调用 REST API、抓取网页文本',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    env: {},
    status: 'not-installed',
    tools: 2,
    category: '网络',
    icon: '🌐',
    installHint: '无需额外配置，npx 自动安装运行',
    recommended: true,
  },
  {
    id: 'mcp-filesystem',
    name: 'Filesystem',
    description: '本地文件系统 — 读写文件、遍历目录、创建文件，让智能体能直接操作项目文件和代码',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    env: {},
    status: 'not-installed',
    tools: 8,
    category: '文件',
    icon: '📁',
    installHint: 'npx -y @modelcontextprotocol/server-filesystem /path/to/allowed/dir',
    recommended: true,
  },
  {
    id: 'mcp-sqlite',
    name: 'SQLite',
    description: '数据库直查 — 直接查询项目库、统计分析、生成报表，绕过 IPC 层直接操作 SQLite',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite'],
    env: {},
    status: 'not-installed',
    tools: 4,
    category: '数据',
    icon: '🗄️',
    installHint: 'npx -y @modelcontextprotocol/server-sqlite --db-path /path/to/db',
    recommended: true,
  },
  {
    id: 'mcp-memory',
    name: 'Memory',
    description: '持久化知识图谱 — 跨会话记忆、实体关系管理、语义检索，为智能体提供长期记忆层',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    env: {},
    status: 'not-installed',
    tools: 5,
    category: '记忆',
    icon: '🧠',
    installHint: '无需额外配置，npx 自动安装运行',
    recommended: true,
  },
  {
    id: 'mcp-mempalace',
    name: 'MemPalace',
    description: '官方记忆宫殿服务器 — verbatim drawer 读写、wing/room 导航、知识图谱、agent diary；《启蒙》的长期记忆底座',
    command: 'python3',
    args: ['-m', 'mempalace.mcp_server'],
    env: {},
    status: 'not-installed',
    tools: 19,
    category: '记忆',
    icon: '🏛️',
    installHint: 'pip install mempalace && python3 -m mempalace.mcp_server --palace ~/.mempalace',
    recommended: true,
  },
  {
    id: 'mcp-brave-search',
    name: 'Brave Search',
    description: 'Web 搜索引擎 — 市场调研、竞品分析、实时信息获取、技术文档搜索',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: { BRAVE_API_KEY: '' },
    status: 'not-installed',
    tools: 2,
    category: '搜索',
    icon: '🔍',
    installHint: '需要 Brave API Key → https://brave.com/search/api/',
  },
  {
    id: 'mcp-sequential-thinking',
    name: 'Sequential Thinking',
    description: '深度推理链 — 逐步思考、动态调整推理策略、可回溯思维过程，增强复杂问题的分析质量',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    env: {},
    status: 'not-installed',
    tools: 1,
    category: '推理',
    icon: '🧩',
    installHint: '无需额外配置，npx 自动安装运行',
  },

  // ═══ Hermes Agent 推荐扩展 ═══
  {
    id: 'mcp-context7',
    name: 'Context7',
    description: '实时文档查询 — 获取任何开源库/框架的最新文档，自动适配版本，无需手动查阅',
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp@latest'],
    env: {},
    status: 'not-installed',
    tools: 2,
    category: '文档',
    icon: '📚',
    installHint: '无需额外配置，npx 自动安装运行',
    recommended: true,
  },
  {
    id: 'mcp-markitdown',
    name: 'MarkItDown',
    description: '文件转 Markdown — 将 PDF、Word、Excel、PPT、图片等文件转换为 Markdown 格式供 AI 处理',
    command: 'npx',
    args: ['-y', '@anthropic-ai/mcp-markitdown'],
    env: {},
    status: 'not-installed',
    tools: 1,
    category: '文件',
    icon: '📄',
    installHint: '无需额外配置，npx 自动安装运行',
    recommended: true,
  },
  {
    id: 'mcp-exa',
    name: 'Exa Search',
    description: 'AI 原生搜索引擎 — 语义搜索、内容提取、相似页面发现，比传统搜索更精准',
    command: 'npx',
    args: ['-y', 'exa-mcp-server'],
    env: { EXA_API_KEY: '' },
    status: 'not-installed',
    tools: 3,
    category: '搜索',
    icon: '🔎',
    installHint: '需要 Exa API Key → https://exa.ai',
    recommended: true,
  },
  {
    id: 'mcp-playwright',
    name: 'Playwright',
    description: '浏览器自动化 — 导航、截图、点击、输入、表单填写，完整的 Web 交互能力',
    command: 'npx',
    args: ['-y', '@anthropic-ai/mcp-server-playwright'],
    env: {},
    status: 'not-installed',
    tools: 8,
    category: '浏览器',
    icon: '🎭',
    installHint: '首次运行 npx 会自动安装 Chromium，可能需要几分钟',
    recommended: true,
  },
]

/** 加载 MCP 服务器列表（合并默认配置与用户修改） */
export function loadMCPServers(): MCPServer[] {
  try {
    const saved: MCPServer[] | null = JSON.parse(localStorage.getItem(MCP_STORAGE_KEY) || 'null')
    if (saved && Array.isArray(saved)) {
      const savedMap = new Map(saved.map(s => [s.id, s]))
      // 保留默认定义，覆盖用户修改的字段（status、env 等）
      return DEFAULT_MCP_SERVERS.map(default_ => {
        const user = savedMap.get(default_.id)
        if (user) {
          return { ...default_, status: user.status, env: { ...default_.env, ...user.env } }
        }
        return { ...default_ }
      })
    }
  } catch { /* ignore */ }
  return DEFAULT_MCP_SERVERS.map(s => ({ ...s }))
}

/** 保存 MCP 服务器状态 */
export function saveMCPServers(servers: MCPServer[]): void {
  // 只保存用户可修改的字段
  const data = servers.map(s => ({
    id: s.id,
    status: s.status,
    env: s.env,
  }))
  localStorage.setItem(MCP_STORAGE_KEY, JSON.stringify(data))
}

/** 按分类分组 */
export function getMCPServersByCategory(servers: MCPServer[]): Map<string, MCPServer[]> {
  const map = new Map<string, MCPServer[]>()
  servers.forEach(s => {
    const list = map.get(s.category) || []
    list.push(s)
    map.set(s.category, list)
  })
  return map
}

/** 获取 MCP 统计 */
export function getMCPStats(servers: MCPServer[]) {
  const total = servers.length
  const online = servers.filter(s => s.status === 'online').length
  const offline = servers.filter(s => s.status === 'offline' || s.status === 'not-installed').length
  const error = servers.filter(s => s.status === 'error').length
  const totalTools = servers.reduce((sum, s) => sum + s.tools, 0)
  return { total, online, offline, error, totalTools }
}
