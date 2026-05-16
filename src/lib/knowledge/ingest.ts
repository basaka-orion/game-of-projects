/**
 * Ingest Pipeline — 知识摄入管道（双模架构）
 *
 * 海马体-大脑皮层读写分离：
 * - fast 模式（默认）：原始内容 100% 无损存入 drawer + source，零 LLM 调用，毫秒级
 * - full 模式：传统流程，LLM 同步处理并生成 Wiki 页面
 *
 * 后台 Karpathy 编译器会将 fast 模式的抽屉异步编译为 Wiki 页面。
 */
import { LLMConfig, chatCompletion } from '../ai/provider'
import { createPage, createSource, updateSource, getPageBySlug, updatePage, appendToLog } from './wiki'
import { createDrawer, markDrawerCompiled, updateDrawer } from './drawer'
import { extractTriplesFromText } from '../memory/knowledge-graph'
import { generateId } from '../db/schema'
import { chunkText } from './chunker'
import { storeVector, generateEmbedding } from './vector-store'
import { run } from '../db/repository'
import { deriveFolderPath } from './folders'

// ─── 接口 ───

export interface IngestParams {
  sourceType: 'url' | 'paste' | 'file' | 'clipper' | 'auto'
  title?: string
  content: string
  rawContent?: string
  url?: string
  filePath?: string
  author?: string
  templateId?: string
  metadata?: Record<string, unknown>
  mode?: 'fast' | 'full'   // 新增：默认 'fast'
}

export interface IngestResult {
  sourceId: string
  drawerId: string          // 新增：抽屉 ID
  pageId: string            // fast 模式下为空
  pageTitle: string
  triplesExtracted: number
  errors: string[]
  mode: 'fast' | 'full'     // 新增
}

// ─── URL 抓取 ───

/** 通过 Electron IPC 抓取 URL 内容 */
export async function fetchUrlContent(url: string): Promise<{
  title: string
  content: string
  author: string
  description: string
  url: string
  error?: string
}> {
  const electronAPI = (window as any)?.electronAPI
  if (electronAPI?.fetchUrl) {
    return electronAPI.fetchUrl(url)
  }
  // 纯 Web 回退（受 CORS 限制）
  return { title: url, content: '', author: '', description: '', url, error: 'CORS 限制，请使用桌面端' }
}

// ─── 文件读取 ───

export type FileIntakeKind = 'text' | 'code' | 'pdf' | 'document' | 'image' | 'audio' | 'video' | 'unknown'

const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.markdown', '.json', '.csv', '.tsv', '.srt', '.vtt'])
const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs',
  '.py', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.cpp', '.h',
  '.html', '.css', '.scss', '.yaml', '.yml', '.toml', '.xml',
  '.sh', '.bash', '.zsh', '.sql', '.graphql',
  '.rb', '.php', '.lua', '.dart', '.r', '.scala', '.clj',
])
const PDF_EXTENSIONS = new Set(['.pdf'])
const DOCUMENT_EXTENSIONS = new Set(['.doc', '.docx', '.rtf', '.pages'])
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.tiff', '.bmp', '.svg'])
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg', '.webm'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.m4v'])

/** 支持的文件扩展名 */
const SUPPORTED_EXTENSIONS = new Set([
  ...TEXT_EXTENSIONS,
  ...CODE_EXTENSIONS,
  ...PDF_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
])

function getExtension(filePath: string): string {
  return filePath.toLowerCase().match(/\.[^.]+$/)?.[0] || ''
}

export function getFileIntakeKind(filePath: string): FileIntakeKind {
  const ext = getExtension(filePath)
  if (TEXT_EXTENSIONS.has(ext)) return 'text'
  if (CODE_EXTENSIONS.has(ext)) return 'code'
  if (PDF_EXTENSIONS.has(ext)) return 'pdf'
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'document'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  return 'unknown'
}

export function shouldWrapAsCode(filePath: string): boolean {
  return getFileIntakeKind(filePath) === 'code'
}

/** 检查文件是否支持 */
export function isFileSupported(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(getExtension(filePath))
}

/** 从文件扩展名推断语言 */
function inferLanguageFromExt(filePath: string): string {
  const ext = getExtension(filePath)
  const langMap: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
    '.py': 'python', '.go': 'go', '.rs': 'rust', '.java': 'java', '.kt': 'kotlin',
    '.swift': 'swift', '.c': 'c', '.cpp': 'cpp', '.h': 'c',
    '.rb': 'ruby', '.php': 'php', '.lua': 'lua', '.dart': 'dart',
    '.scala': 'scala', '.clj': 'clojure',
    '.html': 'html', '.css': 'css', '.scss': 'scss', '.sql': 'sql',
    '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
    '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml', '.xml': 'xml',
    '.json': 'json', '.csv': 'csv', '.md': 'markdown', '.txt': 'text',
  }
  return langMap[ext] || 'text'
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

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

/** 读取文件内容（渲染进程） */
async function readFileContent(filePath: string): Promise<string> {
  const electronAPI = (window as any)?.electronAPI
  if (electronAPI?.readFile) {
    return electronAPI.readFile(filePath)
  }
  throw new Error('文件读取需要桌面端环境')
}

// ─── LLM 处理 ───

/** LLM 摄入 Prompt */
const INGEST_SYSTEM_PROMPT = `你是一个知识提取引擎。阅读以下原始内容，生成一个结构化的 Wiki 页面。

输出 JSON 格式：
{
  "title": "页面标题",
  "summary": "一句话摘要（不超过100字）",
  "content": "Markdown 格式的结构化内容，包含标题、要点、详细说明",
  "category": "general|tech|academic|concept|decision|learning",
  "tags": ["标签1", "标签2"],
  "importance": 50,
  "triples": [
    {"subject": "实体A", "predicate": "关系", "object": "实体B"}
  ]
}

规则：
- title 使用简洁准确的标题
- summary 是一句话概括核心内容
- content 用 Markdown 组织，包含 ## 章节标题，列表要点
- tags 提取 3-5 个关键词标签
- importance: 1-100，表示信息的重要程度（普通=30，重要=60，核心=80+）
- triples 最多提取 5 个最有价值的知识三元组
- 只提取确实有信息价值的内容，忽略无意义的格式信息
- 用中文`

/** 调用 LLM 处理原始内容 */
async function llmProcessContent(
  llmConfig: LLMConfig,
  rawContent: string,
  suggestedTitle?: string
): Promise<{
  title: string
  summary: string
  content: string
  category: string
  tags: string[]
  importance: number
  triples: Array<{ subject: string; predicate: string; object: string }>
}> {
  const userMessage = suggestedTitle
    ? `标题提示: ${suggestedTitle}\n\n原始内容：\n${rawContent.slice(0, 8000)}`
    : `原始内容：\n${rawContent.slice(0, 8000)}`

  const response = await chatCompletion(
    llmConfig,
    [
      { role: 'system', content: INGEST_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    0.3,
    4096
  )

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('LLM 未返回有效 JSON')
    return JSON.parse(jsonMatch[0])
  } catch {
    // LLM 返回解析失败，生成基础页面
    return {
      title: suggestedTitle || '未命名页面',
      summary: rawContent.slice(0, 100),
      content: rawContent,
      category: 'general',
      tags: [],
      importance: 30,
      triples: [],
    }
  }
}

// ─── 核心摄入函数 ───

/** 通用摄入入口 */
export async function ingestSource(
  params: IngestParams,
  llmConfig: LLMConfig
): Promise<IngestResult> {
  const mode = params.mode || 'fast'
  const errors: string[] = []
  let triplesExtracted = 0
  const metadata = { ...(params.metadata || {}) }
  const folderPath = deriveFolderPath({
    folderPath: typeof metadata.folderPath === 'string' ? metadata.folderPath : '',
    filePath: params.filePath,
    rootPath: typeof metadata.rootPath === 'string' ? metadata.rootPath : undefined,
    sourceType: params.sourceType,
  })
  metadata.folderPath = folderPath

  // 0. 始终创建无损抽屉（海马体层）
  const drawerId = await createDrawer({
    title: params.title || '待处理',
    wing: metadata.wing as string || 'default',
    hall: metadata.hall as string || params.sourceType,
    room: metadata.room as string || 'inbox',
    rawContent: params.rawContent || params.content,
    sourceType: params.sourceType,
    sourceUrl: params.url,
    filePath: params.filePath,
    folderPath,
    author: params.author,
    tags: metadata.tags as string[] || [],
    metadata,
  })

  // 1. 创建源记录
  const sourceId = await createSource({
    title: params.title || '待处理',
    sourceType: params.sourceType,
    content: params.content,
    rawContent: params.rawContent || params.content,
    url: params.url,
    filePath: params.filePath,
    folderPath,
    author: params.author,
    templateId: params.templateId,
    status: mode === 'fast' ? 'pending' : 'processing',
    metadata,
  })

  // 让后续编译阶段能准确回溯到真正的原始来源，而不是把 drawerId 误当成 sourceId。
  await updateDrawer(drawerId, {
    metadata: {
      ...metadata,
      sourceId,
    },
  })

  // ─── fast 模式：零 LLM，立即返回 ───
  if (mode === 'fast') {
    // 异步触发分块和向量化（不阻塞返回）
    chunkAndVectorize(sourceId, drawerId, params.content, folderPath, params.title).catch(err => {
      console.warn('[ingest] 分块/向量化异步失败:', err)
    })

    return {
      sourceId,
      drawerId,
      pageId: '',
      pageTitle: params.title || '',
      triplesExtracted: 0,
      errors: [],
      mode: 'fast',
    }
  }

  // ─── full 模式：传统 LLM 处理流程 ───
  try {
    // 2. LLM 处理
    const result = await llmProcessContent(llmConfig, params.content, params.title)

    // 3. 检查是否已有同名页面（幂等更新）
    const slug = result.title
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100)

    const existingPage = await getPageBySlug(slug)
    let pageId: string

    if (existingPage) {
      // 更新现有页面
      pageId = existingPage.id
      await updatePage(pageId, {
        content: result.content,
        summary: result.summary,
        tags: result.tags,
        importance: Math.max(existingPage.importance, result.importance),
        version: existingPage.version + 1,
        folderPath,
        metadata: { ...existingPage.metadata, folderPath, lastIngestSource: params.sourceType },
      })
    } else {
      // 创建新页面
      pageId = await createPage({
        title: result.title,
        slug,
        content: result.content,
        summary: result.summary,
        category: result.category,
        tags: result.tags,
        sourceIds: [sourceId],
        importance: result.importance,
        folderPath,
        templateId: params.templateId,
        metadata: {
          folderPath,
          sourceType: params.sourceType,
          sourceUrl: params.url,
          sourceFilePath: params.filePath,
        },
      })
    }

    // 4. 提取知识三元组
    if (result.triples && result.triples.length > 0) {
      try {
        for (const t of result.triples) {
          if (t.subject && t.predicate && t.object) {
            await extractTriplesFromText(
              `${t.subject} ${t.predicate} ${t.object}`,
              `wiki:${pageId}`
            )
            triplesExtracted++
          }
        }
      } catch (err) {
        errors.push(`三元组提取失败: ${String(err)}`)
      }
    }

    // 5. 高重要性条目写入记忆宫殿
    if (result.importance >= 80) {
      try {
        const { getRoomByType, saveMemoryItem } = await import('../memory/palace')
        let room = await getRoomByType('knowledge_vault')
        if (!room) {
          const { run: dbRun } = await import('../db/repository')
          const roomId = generateId()
          await dbRun(
            `INSERT OR IGNORE INTO memory_rooms (id, name, description, icon, room_type, sort_order)
             VALUES (?, 'Knowledge Vault', 'Wiki 自动保存的重要条目', '📚', 110)`,
            [roomId]
          )
          room = { id: roomId }
        }
        await saveMemoryItem({
          roomId: room.id,
          content: `[${result.category}] ${result.title}: ${result.summary}`,
          category: result.category,
          importance: Math.min(result.importance, 100),
          source: 'wiki-ingest',
        })
      } catch { /* non-critical */ }
    }

    // 6. 记录日志
    await appendToLog('ingest', 'page', pageId, `${params.sourceType} → ${result.title}`, {
      sourceId,
      folderPath,
      category: result.category,
      importance: result.importance,
    })

    // 7. 更新源状态
    await updateSource(sourceId, { status: 'processed', title: result.title, folderPath })

    // 8. 标记抽屉为已编译
    await markDrawerCompiled(drawerId, pageId)

    return {
      sourceId,
      drawerId,
      pageId,
      pageTitle: result.title,
      triplesExtracted,
      errors,
      mode: 'full',
    }
  } catch (err) {
    // 摄入失败
    await updateSource(sourceId, {
      status: 'failed',
      errorMessage: String(err),
    })
    errors.push(String(err))

    return {
      sourceId,
      drawerId,
      pageId: '',
      pageTitle: '',
      triplesExtracted: 0,
      errors,
      mode: 'full',
    }
  }
}

// ─── 便捷入口 ───

/** 摄入 URL */
export async function ingestUrl(url: string, llmConfig: LLMConfig): Promise<IngestResult> {
  const fetched = await fetchUrlContent(url)
  if (fetched.error) {
    throw new Error(fetched.error)
  }
  return ingestSource({
    sourceType: 'url',
    title: fetched.title,
    content: fetched.content,
    url,
    author: fetched.author,
    metadata: { description: fetched.description },
  }, llmConfig)
}

/** 摄入粘贴内容 */
export async function ingestPaste(content: string, title: string, llmConfig: LLMConfig): Promise<IngestResult> {
  return ingestSource({
    sourceType: 'paste',
    title,
    content,
  }, llmConfig)
}

/** 摄入单个文件 */
export async function ingestFile(
  filePath: string,
  llmConfig: LLMConfig,
  options?: { rootPath?: string },
): Promise<IngestResult> {
  if (!isFileSupported(filePath)) {
    throw new Error(`不支持的文件类型: ${filePath}`)
  }
  const content = await readFileContent(filePath)
  const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown'
  const language = inferLanguageFromExt(filePath)
  const intakeKind = getFileIntakeKind(filePath)

  // 如果是代码文件，包装在代码块中
  const wrappedContent = shouldWrapAsCode(filePath)
    ? `文件: ${fileName}\n语言: ${language}\n\n\`\`\`${language}\n${content}\n\`\`\``
    : content

  return ingestSource({
    sourceType: 'file',
    title: fileName,
    content: wrappedContent,
    rawContent: content,
    filePath,
    metadata: { language, intakeKind, rootPath: options?.rootPath },
  }, llmConfig)
}

/** 批量文件导入 */
export async function ingestFiles(
  filePaths: string[],
  llmConfig: LLMConfig,
  options?: { rootPath?: string },
): Promise<IngestResult[]> {
  const results: IngestResult[] = []
  for (const filePath of filePaths) {
    try {
      const result = await ingestFile(filePath, llmConfig, options)
      results.push(result)
    } catch (err) {
      results.push({
        sourceId: '',
        drawerId: '',
        pageId: '',
        pageTitle: filePath.split('/').pop() || filePath,
        triplesExtracted: 0,
        errors: [String(err)],
        mode: 'fast',
      })
    }
  }
  return results
}

/** 文件夹递归导入 */
export async function ingestFolder(folderPath: string, llmConfig: LLMConfig): Promise<IngestResult[]> {
  const electronAPI = (window as any)?.electronAPI
  if (!electronAPI?.executeCommand) {
    throw new Error('文件夹导入需要桌面端环境')
  }

  // 用 find 命令列出文件夹内所有支持的文件
  const extList = Array.from(SUPPORTED_EXTENSIONS).map(e => `-name "*${e}"`).join(' -o ')
  const { stdout } = await electronAPI.executeCommand(
    `find ${shellEscape(folderPath)} -type f \\( ${extList} \\) 2>/dev/null`
  )

  const files = stdout.trim().split('\n').filter(Boolean)
  const importRootPath = dirnameCompat(folderPath) || folderPath
  return ingestFiles(files, llmConfig, { rootPath: importRootPath })
}

/** Clipper 剪藏接收 */
export async function ingestClipper(
  data: { title: string; url: string; useClipboard: boolean; content?: string },
  llmConfig: LLMConfig
): Promise<IngestResult> {
  let content = data.content || ''

  // 如果 Clipper 指示从剪贴板读取
  if (data.useClipboard && !content) {
    const electronAPI = (window as any)?.electronAPI
    if (electronAPI?.readClipboard) {
      content = await electronAPI.readClipboard()
    }
  }

  if (!content.trim()) {
    // 回退到 URL 抓取
    return ingestUrl(data.url, llmConfig)
  }

  return ingestSource({
    sourceType: 'clipper',
    title: data.title,
    content,
    url: data.url,
    metadata: { clipperTimestamp: Date.now() },
  }, llmConfig)
}

/** 重新处理失败的源 */
export async function reingestFailedSources(llmConfig: LLMConfig, limit = 10): Promise<IngestResult[]> {
  const { getSourcesByStatus } = await import('./wiki')
  const failed = await getSourcesByStatus('failed')
  const results: IngestResult[] = []

  for (const source of failed.slice(0, limit)) {
    const result = await ingestSource({
      sourceType: source.sourceType as IngestParams['sourceType'],
      title: source.title,
      content: source.rawContent || source.content,
      url: source.url,
      filePath: source.filePath,
      author: source.author,
    }, llmConfig)
    results.push(result)
  }

  return results
}

// ─── 分块与向量化 ───

/**
 * 分块并生成向量嵌入
 *
 * 将文本分块存入 wiki_chunks 表，然后为每个块生成 embedding 向量
 * 此函数异步执行，不阻塞摄入流程
 */
async function chunkAndVectorize(
  sourceId: string,
  drawerId: string,
  content: string,
  folderPath: string,
  title?: string
): Promise<void> {
  if (!content || content.trim().length < 20) return

  try {
    // 1. 分块
    const chunks = chunkText(content, title || '')
    if (chunks.length === 0) return

    // 2. 存储块到 wiki_chunks
    for (const chunk of chunks) {
      const chunkId = generateId()
      run(
        `INSERT OR IGNORE INTO wiki_chunks (id, source_id, drawer_id, folder_path, chunk_index, content, token_count, header_breadcrumb, overlap_prev, overlap_next, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', datetime('now','localtime'))`,
        [
          chunkId,
          sourceId,
          drawerId,
          folderPath,
          chunk.index,
          chunk.content,
          chunk.tokenCount,
          chunk.headerBreadcrumb,
          chunk.overlapPrev,
          chunk.overlapNext,
        ]
      )

      // 3. 为每个块生成向量（try-catch 每个，不影响其他块）
      try {
        const embedding = await generateEmbedding(chunk.content)
        const norm = Math.sqrt(Array.from(embedding).reduce((sum, v) => sum + v * v, 0))
        await storeVector('wiki_vectors', {
          chunkId,
          embedding,
          model: 'embedding-3',
          dimension: embedding.length,
          norm,
        })
      } catch (embedErr: unknown) {
        // 向量生成失败不影响分块存储
        console.warn(`[ingest] 块 ${chunk.index} 向量化失败:`, embedErr instanceof Error ? embedErr.message : String(embedErr))
      }
    }

    console.log(`[ingest] 分块完成: ${sourceId} → ${chunks.length} 块`)
  } catch (err: unknown) {
    console.error('[ingest] chunkAndVectorize 失败:', err instanceof Error ? err.message : String(err))
  }
}
