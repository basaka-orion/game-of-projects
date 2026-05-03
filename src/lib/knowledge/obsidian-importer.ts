/**
 * Obsidian Vault 导入器
 *
 * 扫描 Obsidian Vault 目录（如 data/vault/Clippings/）中的 Markdown 文件，
 * 解析 Frontmatter 元数据，调用 ingestSource() 摄入知识库。
 *
 * 支持：
 * - YAML Frontmatter 解析（title, tags, source, date 等）
 * - 递归目录扫描（通过 Electron IPC）
 * - 增量导入（跳过已存在的 source_url）
 * - 批量进度回调
 *
 * 注意：渲染进程无法直接使用 fs/path，所有文件系统操作通过 electronAPI 完成
 */
import { ingestSource, IngestResult } from './ingest'
import { query } from '../db/repository'
import { getDefaultConfig, LLMConfig } from '../ai/provider'
import { getSetting } from '../db/store'

// 从路径中提取文件名（兼容 / 和 \ 路径分隔符）
function basenameCompat(filePath: string, ext?: string): string {
  const name = filePath.replace(/\\/g, '/').split('/').pop() || filePath
  if (ext && name.endsWith(ext)) return name.slice(0, -ext.length)
  return name
}

// 获取扩展名
function extnameCompat(filePath: string): string {
  const name = basenameCompat(filePath)
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

function dirnameCompat(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/\/+$/, '')
  if (!normalized) return ''
  const parts = normalized.split('/')
  if (parts.length <= 1) return ''
  parts.pop()
  if (parts.length === 1 && normalized.startsWith('/')) return '/'
  return parts.join('/')
}

export interface ObsidianImportOptions {
  /** Vault 目录绝对路径 */
  vaultPath: string
  /** 最大导入数量（0 = 不限） */
  maxFiles?: number
  /** 递归深度（默认 0，不限深度） */
  maxDepth?: number
  /** 是否跳过已导入文件（默认 true） */
  skipExisting?: boolean
}

export interface ObsidianImportResult {
  imported: number
  skipped: number
  errors: string[]
  details: Array<{ file: string; status: 'imported' | 'skipped' | 'error' }>
}

export interface FrontmatterData {
  title?: string
  tags?: string[]
  source?: string
  url?: string
  date?: string
  author?: string
  [key: string]: unknown
}

/**
 * 解析 Markdown 文件的 YAML Frontmatter
 */
export function parseFrontmatter(content: string): {
  frontmatter: FrontmatterData
  body: string
} {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!fmMatch) {
    return { frontmatter: {}, body: content }
  }

  const yaml = fmMatch[1]
  const body = content.slice(fmMatch[0].length)
  const fm: FrontmatterData = {}

  for (const line of yaml.split('\n')) {
    const kvMatch = line.match(/^(\w[\w_-]*):\s*(.*)$/)
    if (!kvMatch) continue

    const key = kvMatch[1]
    let value: unknown = kvMatch[2].trim()

    // 处理引号包裹
    if (typeof value === 'string' && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1)
    }

    // 处理数组（YAML 列表格式：`tags: [a, b, c]` 或多行 `- item`）
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    }

    // 映射常见字段
    if (key === 'tags' || key === 'tag') {
      fm.tags = Array.isArray(value) ? value : String(value).split(/[,，\s]+/).filter(Boolean)
    } else if (key === 'title' || key === 'name') {
      fm.title = String(value)
    } else if (key === 'source' || key === 'url') {
      fm.url = String(value)
      fm.source = String(value)
    } else if (key === 'date' || key === 'created') {
      fm.date = String(value)
    } else if (key === 'author' || key === 'authors') {
      fm.author = String(value)
    } else {
      (fm as Record<string, unknown>)[key] = value
    }
  }

  return { frontmatter: fm, body }
}

/**
 * 通过 Electron IPC 递归扫描目录，收集 Markdown 文件
 */
async function scanDirectoryViaIPC(dirPath: string, maxDepth = 0): Promise<string[]> {
  const electronAPI = (window as any)?.electronAPI
  if (!electronAPI?.executeCommand) {
    throw new Error('Obsidian 导入需要桌面端环境')
  }

  // 用 find 命令递归获取所有 .md 文件，排除 .obsidian 目录
  const depthFlag = maxDepth > 0 ? `-maxdepth ${maxDepth}` : ''
  const { stdout } = await electronAPI.executeCommand(
    `find "${dirPath}" ${depthFlag} -type f -name "*.md" ! -path "*/.obsidian/*" ! -path "*/.*" 2>/dev/null`,
    30000
  )
  return stdout.trim().split('\n').filter(Boolean)
}

/**
 * 检查文件是否已导入（通过 file_path 匹配）
 */
async function isAlreadyImported(filePath: string): Promise<boolean> {
  try {
    const rows = await query<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM wiki_sources WHERE url = ? UNION ALL SELECT COUNT(*) as cnt FROM mempalace_drawers WHERE file_path = ?',
      [filePath, filePath]
    )
    return rows.some(r => r.cnt > 0)
  } catch {
    return false
  }
}

/**
 * 获取 LLM 配置（导入器使用）
 */
function getLLMConfigForImport(): LLMConfig {
  const provider = getSetting('llm_provider', 'deepseek')
  const defaults = getDefaultConfig(provider)
  return {
    provider: provider as LLMConfig['provider'],
    apiKey: getSetting('llm_api_key', ''),
    baseUrl: getSetting('llm_base_url', defaults.baseUrl),
    model: getSetting('llm_model', defaults.model),
  }
}

/**
 * 扫描 Obsidian Vault 目录并批量导入
 *
 * 工作流：
 * 1. 递归扫描 .md 文件
 * 2. 解析每个文件的 Frontmatter
 * 3. 调用 ingestSource() 摄入（fast 模式，零 LLM）
 * 4. 返回导入结果统计
 */
export async function scanVaultDirectory(
  options: ObsidianImportOptions,
  onProgress?: (current: number, total: number, file: string) => void
): Promise<ObsidianImportResult> {
  const {
    vaultPath,
    maxFiles = 0,
    maxDepth = 0,
    skipExisting = true,
  } = options

  const result: ObsidianImportResult = {
    imported: 0,
    skipped: 0,
    errors: [],
    details: [],
  }

  // 1. 扫描文件（通过 IPC）
  const mdFiles = await scanDirectoryViaIPC(vaultPath, maxDepth)
  const filesToProcess = maxFiles > 0 ? mdFiles.slice(0, maxFiles) : mdFiles

  if (filesToProcess.length === 0) {
    return result
  }

  const llmConfig = getLLMConfigForImport()

  // 2. 逐文件处理
  for (let i = 0; i < filesToProcess.length; i++) {
    const filePath = filesToProcess[i]
    onProgress?.(i + 1, filesToProcess.length, basenameCompat(filePath))

    try {
      // 跳过已导入
      if (skipExisting && await isAlreadyImported(filePath)) {
        result.skipped++
        result.details.push({ file: filePath, status: 'skipped' })
        continue
      }

      // 通过 IPC 读取文件内容
      const electronAPI = (window as any)?.electronAPI
      let content = ''
      if (electronAPI?.readFile) {
        content = await electronAPI.readFile(filePath)
      } else if (electronAPI?.executeCommand) {
        const { stdout } = await electronAPI.executeCommand(`cat "${filePath}"`, 10000)
        content = stdout
      } else {
        throw new Error('无法读取文件：需要桌面端环境')
      }

      if (!content || content.trim().length === 0) {
        result.skipped++
        result.details.push({ file: filePath, status: 'skipped' })
        continue
      }

      // 解析 Frontmatter
      const { frontmatter, body } = parseFrontmatter(content)
      const title = frontmatter.title || basenameCompat(filePath, '.md')

      // 摄入（fast 模式，零 LLM 调用）
      const ingestResult: IngestResult = await ingestSource(
        {
          sourceType: 'file',
          title,
          content: body,
          rawContent: content,
          filePath,
          url: frontmatter.url,
          author: frontmatter.author,
          metadata: {
            rootPath: vaultPath,
            relativePath: filePath.startsWith(vaultPath) ? filePath.slice(vaultPath.length).replace(/^\/+/, '') : filePath,
            obsidianTags: frontmatter.tags,
            obsidianDate: frontmatter.date,
            obsidianSource: frontmatter.source,
          },
          mode: 'fast',
        },
        llmConfig
      )

      if (ingestResult.errors.length > 0) {
        result.errors.push(...ingestResult.errors.map(e => `${basenameCompat(filePath)}: ${e}`))
      }

      result.imported++
      result.details.push({ file: filePath, status: 'imported' })
    } catch (err) {
      result.errors.push(`${basenameCompat(filePath)}: ${(err as Error).message}`)
      result.details.push({ file: filePath, status: 'error' })
    }
  }

  return result
}
