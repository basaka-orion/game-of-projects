/**
 * Wiki Compiler — Karpathy 异步知识结晶编译器
 *
 * 将海马体抽屉（mempalace_drawers）中的无损生肉，
 * 异步编译为结构化 Wiki 页面（wiki_pages）。
 *
 * 流程：Fetch 未编译抽屉 → 按 folder+wing+hall 分组 → LLM 结晶化 → 写入 Wiki → 标记已编译
 */
import { LLMConfig, chatCompletion } from '../ai/provider'
import { getUncompiledDrawers, markDrawerCompiled } from './drawer'
import { createPage, updateSource, appendToLog, parseWikiLinks } from './wiki'
import { extractTriplesFromText } from '../memory/knowledge-graph'
import { getSetting } from '../db/store'
import { getDefaultConfig } from '../ai/provider'

// ─── 接口 ───

export interface CompileJobResult {
  drawersProcessed: number
  pagesCreated: number
  pagesUpdated: number
  triplesExtracted: number
  errors: string[]
}

export interface CompileProgress {
  phase: 'fetching' | 'grouping' | 'compiling' | 'writing' | 'done'
  current: number
  total: number
  message: string
}

// ─── Prompt ───

const COMPILE_SYSTEM_PROMPT = `你是知识结晶引擎（Karpathy Compiler）。阅读以下原始记忆片段，将其编译为结构化 Wiki 页面。

严格规则：
1. 保留所有事实细节，包括报错堆栈、决策理由、情绪上下文
2. 不要"总结掉"原始内容中的任何信息——只做结构化组织
3. 使用 [[页面名称]] 进行概念的双向链接
4. 在关键事实后标注溯源锚点，格式：^[Drawer: ID]
5. 用中文输出

输出 JSON 数组：
[{
  "title": "页面标题",
  "summary": "一句话摘要（<100字）",
  "content": "Markdown 格式正文，含 ## 标题、列表、代码块、[[双链]]、^[Drawer:ID] 锚点",
  "category": "general|tech|academic|concept|decision|learning|insight",
  "tags": ["标签1", "标签2"],
  "importance": 50,
  "triples": [{"subject": "实体A", "predicate": "关系", "object": "实体B"}]
}]`

function extractSourceIdsFromDrawers(
  drawers: Array<{ metadata: Record<string, unknown> }>
): string[] {
  const result: string[] = []
  for (const drawer of drawers) {
    const sourceId = typeof drawer.metadata?.sourceId === 'string'
      ? drawer.metadata.sourceId.trim()
      : ''
    if (!sourceId || result.includes(sourceId)) continue
    result.push(sourceId)
  }
  return result
}

// ─── 核心编译循环 ───

/** 运行一次编译循环 */
export async function runCompileCycle(
  llmConfig: LLMConfig,
  batchSize = 20,
  onProgress?: (p: CompileProgress) => void
): Promise<CompileJobResult> {
  const result: CompileJobResult = {
    drawersProcessed: 0,
    pagesCreated: 0,
    pagesUpdated: 0,
    triplesExtracted: 0,
    errors: [],
  }

  // 1. Fetch 未编译抽屉
  onProgress?.({ phase: 'fetching', current: 0, total: 0, message: '获取未编译抽屉...' })
  const drawers = await getUncompiledDrawers(batchSize)
  if (drawers.length === 0) {
    onProgress?.({ phase: 'done', current: 0, total: 0, message: '无需编译' })
    return result
  }

  // 2. 按 folder + wing + hall 分组，避免跨文件夹串库
  onProgress?.({ phase: 'grouping', current: 0, total: drawers.length, message: '分组...' })
  const groups = new Map<string, typeof drawers>()
  for (const d of drawers) {
    const key = `${d.folderPath || ''}::${d.wing}::${d.hall}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(d)
  }

  // 3. 逐组编译
  let groupIdx = 0
  for (const [groupKey, groupDrawers] of groups) {
    groupIdx++
    onProgress?.({
      phase: 'compiling',
      current: groupIdx,
      total: groups.size,
      message: `编译组 ${groupIdx}/${groups.size}: ${groupKey} (${groupDrawers.length} 条)`,
    })

    try {
      // 构建生肉 bundle（带 Drawer ID 标记）
      const rawBundle = groupDrawers.map(d =>
        `--- Drawer: ${d.id} ---\nTitle: ${d.title}\nSource: ${d.sourceType}\nCreated: ${d.createdAt}\n\n${d.rawContent.slice(0, 4000)}`
      ).join('\n\n')

      // LLM 编译
      const llmResponse = await chatCompletion(
        llmConfig,
        [
          { role: 'system', content: COMPILE_SYSTEM_PROMPT },
          { role: 'user', content: rawBundle },
        ],
        0.3,
        4096
      )

      // 解析 JSON
      const jsonMatch = llmResponse.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        result.errors.push(`组 ${groupKey}: LLM 未返回有效 JSON`)
        continue
      }

      const pages = JSON.parse(jsonMatch[0]) as Array<{
        title: string; summary: string; content: string
        category: string; tags: string[]; importance: number
        triples: Array<{ subject: string; predicate: string; object: string }>
      }>

      // 4. 写入 Wiki
      onProgress?.({
        phase: 'writing',
        current: groupIdx,
        total: groups.size,
        message: `写入 ${pages.length} 个页面...`,
      })

      const groupSourceIds = extractSourceIdsFromDrawers(groupDrawers)
      const groupFolderPath = groupDrawers[0]?.folderPath || ''

      for (const page of pages) {
        try {
          const slug = page.title
            .toLowerCase()
            .replace(/[^\w\u4e00-\u9fff]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 100)

          const pageId = await createPage({
            title: page.title,
            slug,
            content: page.content,
            summary: page.summary,
            category: page.category || 'general',
            tags: page.tags || [],
            sourceIds: groupSourceIds,
            importance: page.importance || 50,
            folderPath: groupFolderPath,
            metadata: {
              compiledBy: 'wiki-compiler',
              group: groupKey,
              folderPath: groupFolderPath,
              sourceIds: groupSourceIds,
              drawerIds: groupDrawers.map(d => d.id),
            },
          })

          result.pagesCreated++

          // 解析 [[双链]] 并创建 wiki_page_links
          try {
            await parseWikiLinks(pageId)
          } catch { /* non-critical */ }

          // 提取三元组
          if (page.triples && page.triples.length > 0) {
            for (const t of page.triples) {
              if (t.subject && t.predicate && t.object) {
                try {
                  await extractTriplesFromText(
                    `${t.subject} ${t.predicate} ${t.object}`,
                    `wiki:${pageId}`
                  )
                  result.triplesExtracted++
                } catch { /* non-critical */ }
              }
            }
          }

          // 标记所有抽屉为已编译
          for (const d of groupDrawers) {
            await markDrawerCompiled(d.id, pageId)
            result.drawersProcessed++
          }

          // 更新 wiki_sources 状态
          for (const sourceId of groupSourceIds) {
            try {
              await updateSource(sourceId, { status: 'processed', folderPath: groupFolderPath })
            } catch { /* source 可能不存在 */ }
          }

          // 高重要性写入记忆宫殿
          if ((page.importance || 50) >= 80) {
            try {
              const { getRoomByType, saveMemoryItem } = await import('../memory/palace')
              const { generateId: gid } = await import('../db/schema')
              let room = await getRoomByType('knowledge_vault')
              if (!room) {
                const { run: dbRun } = await import('../db/repository')
                const roomId = gid()
                await dbRun(
                  `INSERT OR IGNORE INTO memory_rooms (id, name, description, icon, room_type, sort_order)
                   VALUES (?, 'Knowledge Vault', 'Wiki 自动保存的重要条目', '📚', 'knowledge_vault', 110)`,
                  [roomId]
                )
                room = { id: roomId }
              }
              await saveMemoryItem({
                roomId: room.id,
                content: `[${page.category}] ${page.title}: ${page.summary}`,
                category: page.category,
                importance: Math.min(page.importance || 50, 100),
                source: 'wiki-compiler',
              })
            } catch { /* non-critical */ }
          }

          // 记录日志
          await appendToLog('ingest', 'page', pageId, `compiler → ${page.title}`, {
            folderPath: groupFolderPath,
            sourceIds: groupSourceIds,
            drawerIds: groupDrawers.map(d => d.id),
            category: page.category,
          })

          // 异步：为编译后的 Wiki 页面分块和向量化
          vectorizeCompiledPage(pageId, page.content, groupFolderPath).catch(() => { /* non-critical */ })
        } catch (err) {
          result.errors.push(`页面 ${page.title}: ${String(err)}`)
        }
      }
    } catch (err) {
      result.errors.push(`组 ${groupKey}: ${String(err)}`)
    }
  }

  onProgress?.({
    phase: 'done',
    current: result.drawersProcessed,
    total: drawers.length,
    message: `完成: ${result.pagesCreated} 页, ${result.drawersProcessed} 抽屉已编译`,
  })

  // Karpathy 工作流：编译后自动重建 INDEX.md
  if (result.pagesCreated > 0) {
    rebuildIndex().catch(() => { /* non-critical */ })
  }

  return result
}

/**
 * 自动重建 INDEX.md — Karpathy 工作流核心
 *
 * 扫描所有 Wiki 页面，按 category 分组生成目录索引页面。
 * 索引页面使用 [[双链]] 引用每个页面，保持与 Obsidian 兼容。
 */
export async function rebuildIndex(): Promise<void> {
  const { query: dbQuery, run: dbRun } = await import('../db/repository')
  const { generateId } = await import('../db/schema')

  const pages = await dbQuery(
    'SELECT id, title, slug, category, summary, importance FROM wiki_pages WHERE is_index = 0 ORDER BY category, importance DESC'
  ) as Array<{ id: string; title: string; slug: string; category: string; summary: string; importance: number }>

  if (pages.length === 0) return

  // 按 category 分组
  const groups = new Map<string, typeof pages>()
  for (const p of pages) {
    const cat = p.category || 'general'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat)!.push(p)
  }

  // 生成 INDEX.md 内容
  const lines: string[] = [
    `# 📚 知识库索引`,
    ``,
    `> 自动生成于 ${new Date().toLocaleString('zh-CN')}`,
    `> 共 ${pages.length} 个页面，${groups.size} 个分类`,
    ``,
  ]

  for (const [category, catPages] of groups) {
    lines.push(`## ${getCategoryIcon(category)} ${category}`)
    lines.push('')
    for (const p of catPages) {
      const importance = p.importance >= 80 ? '⭐' : p.importance >= 60 ? '◆' : '·'
      lines.push(`${importance} [[${p.title}]] — ${p.summary || ''}`)
    }
    lines.push('')
  }

  const indexContent = lines.join('\n')

  // 更新或创建 INDEX 页面
  const existing = await dbQuery('SELECT id FROM wiki_pages WHERE is_index = 1 LIMIT 1') as Array<{ id: string }>
  if (existing.length > 0) {
    await dbRun(
      `UPDATE wiki_pages SET content = ?, summary = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
      [indexContent, `${pages.length} 页面 · ${groups.size} 分类`, existing[0].id]
    )
  } else {
    const indexId = generateId()
    await dbRun(
      `INSERT INTO wiki_pages (id, title, slug, content, summary, category, tags, is_index, importance, confidence, created_at, updated_at)
       VALUES (?, 'INDEX', 'index', ?, ?, 'index', '["index","目录"]', 1, 100, 1.0, datetime('now','localtime'), datetime('now','localtime'))`,
      [indexId, indexContent, `${pages.length} 页面 · ${groups.size} 分类`]
    )
  }
}

/** 分类图标映射 */
function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    tech: '💻', academic: '🎓', concept: '💡', decision: '⚖️',
    learning: '📖', insight: '🔮', general: '📄', output: '📝',
    index: '📚',
  }
  return icons[category] || '📄'
}

/** 从设置获取 LLM Config */
export function getCompileLLMConfig(): LLMConfig {
  const provider = getSetting('llm_provider', 'deepseek')
  const defaults = getDefaultConfig(provider)
  return {
    provider: provider as LLMConfig['provider'],
    apiKey: getSetting('llm_api_key', ''),
    baseUrl: getSetting('llm_base_url', defaults.baseUrl),
    model: getSetting('llm_model', defaults.model),
  }
}

// ─── 编译后分块和向量化 ───

/**
 * 为编译后的 Wiki 页面生成向量
 *
 * 在编译完成后异步调用，不影响编译流程
 */
async function vectorizeCompiledPage(pageId: string, content: string, folderPath: string): Promise<void> {
  if (!content || content.trim().length < 50) return

  try {
    const { chunkText } = await import('./chunker')
    const { storeVector, generateEmbedding } = await import('./vector-store')
    const { generateId } = await import('../db/schema')
    const { run: dbRun, query: dbQuery } = await import('../db/repository')

    // 删除该页面旧的块和向量
    try {
      const oldChunks = await dbQuery('SELECT id FROM wiki_chunks WHERE page_id = ?', [pageId]) as Array<{ id: string }>
      for (const old of oldChunks) {
        await dbRun('DELETE FROM wiki_vectors WHERE chunk_id = ?', [old.id])
      }
      await dbRun('DELETE FROM wiki_chunks WHERE page_id = ?', [pageId])
    } catch { /* ignore */ }

    // 分块
    const chunks = chunkText(content)
    for (const chunk of chunks) {
      const chunkId = generateId()
      await dbRun(
        `INSERT OR IGNORE INTO wiki_chunks (id, page_id, folder_path, chunk_index, content, token_count, header_breadcrumb, overlap_prev, overlap_next, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', datetime('now','localtime'))`,
        [chunkId, pageId, folderPath, chunk.index, chunk.content, chunk.tokenCount, chunk.headerBreadcrumb, chunk.overlapPrev, chunk.overlapNext]
      )

      // 生成向量
      try {
        const embedding = await generateEmbedding(chunk.content)
        const norm = Math.sqrt(Array.from(embedding).reduce((sum: number, v: number) => sum + v * v, 0))
        await storeVector('wiki_vectors', { chunkId, embedding, model: 'embedding-3', dimension: embedding.length, norm })
      } catch { /* 向量生成失败不影响分块 */ }
    }
  } catch { /* non-critical */ }
}

/**
 * 增量更新：检测源更新但关联页面未更新的情况
 *
 * 比较抽屉更新时间与关联 Wiki 页面更新时间，
 * 如果抽屉更新了但页面没更新，标记为需要重编译
 */
export async function detectStalePages(): Promise<Array<{
  pageId: string
  pageTitle: string
  drawerCount: number
  lastDrawerUpdate: string
  lastPageUpdate: string
}>> {
  const { query: dbQuery } = await import('../db/repository')

  try {
    return await dbQuery(
      `SELECT p.id as pageId, p.title as pageTitle,
              COUNT(d.id) as drawerCount,
              MAX(d.updated_at) as lastDrawerUpdate,
              p.updated_at as lastPageUpdate
       FROM wiki_pages p
       JOIN mempalace_drawers d ON d.compiled_page_id = p.id
       WHERE d.updated_at > p.updated_at
       GROUP BY p.id
       LIMIT 50`
    ) as Array<{
      pageId: string
      pageTitle: string
      drawerCount: number
      lastDrawerUpdate: string
      lastPageUpdate: string
    }>
  } catch {
    return []
  }
}
