/**
 * Text Chunker — Karpathy LLM Wiki 文本分块系统
 *
 * 将长文本分割为固定大小的块，用于向量索引和语义搜索
 * 策略：Markdown 按标题分割 → 代码按函数分割 → 纯文本固定长度
 *
 * 参考 llmwiki 的分块设计：
 * - 目标块大小 512 token（中文约 768 字符）
 * - 128 token 重叠（约 192 字符）
 * - 保留 Markdown 标题层级作为 header_breadcrumb
 */

// ─── 常量 ───

/** 目标块大小（字符数，中文约 1 token = 1.5 字符，512 token ≈ 768 字符） */
const CHUNK_SIZE = 768

/** 块间重叠字符数（128 token ≈ 192 字符） */
const CHUNK_OVERLAP = 192

/** 最小块大小 */
const MIN_CHUNK_SIZE = 48

/** Token 估算：中文约 1 token = 1.5 字符 */
const CHARS_PER_TOKEN = 1.5

// ─── 接口 ───

export interface TextChunk {
  /** 块索引（从 0 开始） */
  index: number
  /** 块内容 */
  content: string
  /** 估算 token 数 */
  tokenCount: number
  /** Markdown 标题层级路径（如 "引言 > 方法 > 数据收集"） */
  headerBreadcrumb: string
  /** 与前一块的重叠字符数 */
  overlapPrev: number
  /** 与后一块的重叠字符数 */
  overlapNext: number
}

// ─── 工具函数 ───

/** 估算文本的 token 数 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN))
}

/** 检测文本是否为 Markdown 格式 */
function isMarkdown(text: string): boolean {
  const mdPatterns = [
    /^#{1,6}\s/m,       // 标题
    /\*\*[^*]+\*\*/,    // 加粗
    /\[[^\]]+\]\(/,     // 链接
    /^[-*]\s/m,         // 列表
    /^```/m,            // 代码块
  ]
  return mdPatterns.some(p => p.test(text))
}

/** 检测文本是否为代码 */
function isCode(text: string): boolean {
  const codePatterns = [
    /^(function|class|const|let|var|import|export|def|async)\s/m,
    /[{};]\s*$/m,
    /^\s*(\/\/|#|\/\*)/m,
  ]
  return codePatterns.filter(p => p.test(text)).length >= 2
}

// ─── Markdown 分块 ───

interface MarkdownSection {
  content: string
  breadcrumb: string
}

/** 按 Markdown 标题分割为章节 */
function splitMarkdownSections(text: string): MarkdownSection[] {
  const sections: MarkdownSection[] = []
  const lines = text.split('\n')
  let currentContent: string[] = []
  let currentHeaders: string[] = []
  let headerLevels: number[] = []

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headerMatch) {
      // 保存前一个章节
      if (currentContent.length > 0) {
        sections.push({
          content: currentContent.join('\n').trim(),
          breadcrumb: currentHeaders.join(' > '),
        })
      }
      // 开始新章节
      const level = headerMatch[1].length
      const title = headerMatch[2].trim()

      // 维护标题层级
      while (headerLevels.length > 0 && headerLevels[headerLevels.length - 1] >= level) {
        currentHeaders.pop()
        headerLevels.pop()
      }
      currentHeaders.push(title)
      headerLevels.push(level)

      currentContent = [line]
    } else {
      currentContent.push(line)
    }
  }

  // 最后一个章节
  if (currentContent.length > 0) {
    sections.push({
      content: currentContent.join('\n').trim(),
      breadcrumb: currentHeaders.join(' > '),
    })
  }

  return sections.filter(s => s.content.length > 0)
}

// ─── 代码分块 ───

/** 按代码结构（函数/类）分割 */
function splitCodeChunks(text: string): string[] {
  const chunks: string[] = []
  const lines = text.split('\n')
  let currentChunk: string[] = []
  let depth = 0

  for (const line of lines) {
    // 检测函数/类定义
    const isDefinition = /^(function|class|def|async\s+function|const\s+\w+\s*=\s*(async\s+)?\(|export\s+(default\s+)?(function|class))/.test(line.trim())
    const isTopLevel = depth === 0 && isDefinition

    if (isTopLevel && currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n'))
      currentChunk = []
    }

    currentChunk.push(line)
    // 简单的大括号深度追踪
    for (const ch of line) {
      if (ch === '{' || ch === '(') depth++
      if (ch === '}' || ch === ')') depth = Math.max(0, depth - 1)
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n'))
  }

  return chunks.filter(c => c.trim().length > 0)
}

// ─── 固定长度分块 ───

/** 将文本按固定长度分块，带重叠 */
function splitFixedSize(text: string, breadcrumb: string): TextChunk[] {
  const chunks: TextChunk[] = []

  if (text.length <= CHUNK_SIZE) {
    chunks.push({
      index: 0,
      content: text,
      tokenCount: estimateTokens(text),
      headerBreadcrumb: breadcrumb,
      overlapPrev: 0,
      overlapNext: 0,
    })
    return chunks
  }

  let pos = 0
  let idx = 0

  while (pos < text.length) {
    const end = Math.min(pos + CHUNK_SIZE, text.length)
    const content = text.slice(pos, end)

    // 跳过太小的尾部
    if (content.length < MIN_CHUNK_SIZE && idx > 0) break

    const overlapPrev = idx > 0 ? Math.min(CHUNK_OVERLAP, pos) : 0
    // 预判下一块重叠
    const nextPos = end - (idx > 0 ? CHUNK_OVERLAP : 0)
    const overlapNext = nextPos < text.length ? Math.min(CHUNK_OVERLAP, text.length - nextPos) : 0

    chunks.push({
      index: idx,
      content,
      tokenCount: estimateTokens(content),
      headerBreadcrumb: breadcrumb,
      overlapPrev,
      overlapNext,
    })

    // 到达尾块后必须终止，否则 end 固定在 text.length 时会重复生成同一尾块。
    if (end >= text.length) break

    pos = Math.max(end - CHUNK_OVERLAP, pos + 1)
    idx++
  }

  return chunks
}

// ─── 主入口 ───

/**
 * 将文本分块
 *
 * 自动检测文本类型（Markdown/代码/纯文本），
 * 使用最合适的分块策略
 */
export function chunkText(
  text: string,
  defaultBreadcrumb = ''
): TextChunk[] {
  if (!text || text.trim().length === 0) return []
  if (text.length <= CHUNK_SIZE) {
    return [{
      index: 0,
      content: text.trim(),
      tokenCount: estimateTokens(text),
      headerBreadcrumb: defaultBreadcrumb,
      overlapPrev: 0,
      overlapNext: 0,
    }]
  }

  const allChunks: TextChunk[] = []

  // Markdown 分块
  if (isMarkdown(text)) {
    const sections = splitMarkdownSections(text)
    for (const section of sections) {
      if (section.content.length <= CHUNK_SIZE) {
        allChunks.push({
          index: allChunks.length,
          content: section.content,
          tokenCount: estimateTokens(section.content),
          headerBreadcrumb: section.breadcrumb || defaultBreadcrumb,
          overlapPrev: 0,
          overlapNext: 0,
        })
      } else {
        // 章节仍然太长，固定长度分割
        const subChunks = splitFixedSize(section.content, section.breadcrumb || defaultBreadcrumb)
        for (const chunk of subChunks) {
          allChunks.push({ ...chunk, index: allChunks.length })
        }
      }
    }
    return allChunks
  }

  // 代码分块
  if (isCode(text)) {
    const codeChunks = splitCodeChunks(text)
    for (const codeChunk of codeChunks) {
      if (codeChunk.length <= CHUNK_SIZE) {
        allChunks.push({
          index: allChunks.length,
          content: codeChunk,
          tokenCount: estimateTokens(codeChunk),
          headerBreadcrumb: defaultBreadcrumb,
          overlapPrev: 0,
          overlapNext: 0,
        })
      } else {
        const subChunks = splitFixedSize(codeChunk, defaultBreadcrumb)
        for (const chunk of subChunks) {
          allChunks.push({ ...chunk, index: allChunks.length })
        }
      }
    }
    return allChunks
  }

  // 纯文本固定长度分块
  return splitFixedSize(text, defaultBreadcrumb)
}

/**
 * 批量分块：将多个文本一次性分块
 *
 * @param texts 文本数组，每个带可选 breadcrumb
 * @returns 所有块（带全局索引）
 */
export function chunkBatch(
  texts: Array<{ text: string; breadcrumb?: string }>
): TextChunk[] {
  const allChunks: TextChunk[] = []
  for (const { text, breadcrumb } of texts) {
    const chunks = chunkText(text, breadcrumb)
    for (const chunk of chunks) {
      allChunks.push({ ...chunk, index: allChunks.length })
    }
  }
  return allChunks
}
