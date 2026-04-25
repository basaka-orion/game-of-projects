/**
 * Memory-Wiki Bridge — 记忆与知识库双向联动
 *
 * 职责：
 * 1. Wiki 编译完成后，高重要性页面自动进入记忆锻造流程
 * 2. 记忆宫殿高价值条目可回写到知识库
 * 3. 统一的"知识价值"评估函数
 */

import { query, run } from '../db/repository'
import { generateId } from '../db/schema'
import { buildClosetIndex } from './closet'
import { LLMConfig, chatCompletion } from '../ai/provider'

// ─── 接口 ───

export interface KnowledgeValueAssessment {
  /** 知识价值分数 (0-100) */
  valueScore: number
  /** 理由 */
  reason: string
  /** 是否值得进入记忆 */
  shouldMemorize: boolean
  /** 建议的 importance 值 */
  suggestedImportance: number
}

// ─── Wiki → 记忆 ───

/**
 * 将高价值 Wiki 页面推入记忆锻造流程
 *
 * 在 Wiki 编译完成后调用，筛选 importance >= 60 的页面
 */
export async function pushHighValuePagesToForge(): Promise<{
  pushed: number
  skipped: number
}> {
  // 找到 importance >= 60 且未进入锻造流程的页面
  const pages = await query(
    `SELECT p.id, p.title, p.content, p.summary, p.importance, p.confidence, p.tags,
            d.id as drawer_id
     FROM wiki_pages p
     JOIN mempalace_drawers d ON d.compiled_page_id = p.id
     WHERE p.importance >= 60
       AND d.metadata_json NOT LIKE '%memorized_at%'
     LIMIT 50`
  ) as Array<{
    id: string
    title: string
    content: string
    summary: string
    importance: number
    confidence: number
    tags: string
    drawer_id: string
  }>

  let pushed = 0
  let skipped = 0

  for (const page of pages) {
    try {
      // 自动确认：高 importance + 高 confidence
      if (page.importance >= 70 && page.confidence >= 0.8) {
        // 直接写入记忆宫殿
        const memoryId = generateId()
        const rooms = await query("SELECT id FROM memory_rooms WHERE name = 'War Room Archives' OR room_type = 'custom' LIMIT 1") as Array<{ id: string }>
        const roomId = rooms[0]?.id || 'room_innovation'

        const contentToStore = page.summary || page.content.slice(0, 2000)

        await run(
          `INSERT OR IGNORE INTO memory_items (id, room_id, type, content, source, importance, metadata_json, created_at, updated_at)
           VALUES (?, ?, 'knowledge', ?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))`,
          [
            memoryId,
            roomId,
            contentToStore,
            `wiki:${page.title}`,
            page.importance,
            JSON.stringify({
              wikiPageId: page.id,
              drawerId: page.drawer_id,
              tags: page.tags,
              source: 'wiki-auto-forge',
            }),
          ]
        )

        // 构建 Closet 索引
        await buildClosetIndex({
          memoryItemId: memoryId,
          content: contentToStore,
          importance: page.importance,
        })

        // 标记抽屉为已记忆
        await run(
          "UPDATE mempalace_drawers SET metadata_json = json_set(COALESCE(metadata_json, '{}'), '$.memorized_at', ?, '$.memory_item_id', ?) WHERE id = ?",
          [new Date().toISOString(), memoryId, page.drawer_id]
        )

        pushed++
      } else {
        skipped++
      }
    } catch { /* skip */ }
  }

  return { pushed, skipped }
}

// ─── 记忆 → Wiki ───

/**
 * 将记忆宫殿中的高价值条目回写到知识库
 *
 * 找到 importance >= 80 且没有关联 Wiki 页面的记忆条目
 */
export function pushHighValueMemoriesToWiki(llmConfig: LLMConfig): Promise<{
  pushed: number
  skipped: number
}> {
  return (async () => {
    // 找到高价值记忆
    const memories = await query(
      `SELECT m.id, m.content, m.source, m.importance, m.metadata_json
       FROM memory_items m
       WHERE m.importance >= 80
         AND m.type != 'cron_harvest'
         AND m.metadata_json NOT LIKE '%wiki_pushed%'
       ORDER BY m.importance DESC
       LIMIT 20`
    ) as Array<{
      id: string
      content: string
      source: string
      importance: number
      metadata_json: string
    }>

    let pushed = 0
    let skipped = 0

    for (const memory of memories) {
      try {
        // LLM 评估是否值得回写
        const assessment = await assessKnowledgeValue(llmConfig, memory.content)

        if (!assessment.shouldMemorize || assessment.valueScore < 50) {
          skipped++
          continue
        }

        // 生成 Wiki 页面
        const title = memory.content.slice(0, 50).replace(/[\n\r]/g, ' ').trim()
        const slug = title.toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)
        const pageId = `page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

        // 检查 slug 是否已存在
        const existing = await query('SELECT id FROM wiki_pages WHERE slug = ?', [slug]) as Array<{ id: string }>
        if (existing.length > 0) {
          skipped++
          continue
        }

        // 用 LLM 扩展为 Wiki 页面
        const expanded = await chatCompletion(llmConfig, [
          {
            role: 'system',
            content: '你是知识整理引擎。将以下记忆条目扩展为结构化的 Wiki 页面（Markdown 格式，含标题和摘要）。',
          },
          { role: 'user', content: memory.content },
        ])

        await run(
          `INSERT OR IGNORE INTO wiki_pages (id, title, slug, content, summary, category, tags, importance, confidence, metadata_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'memory-push', '["auto","memory"]', ?, 0.7, ?, datetime('now','localtime'), datetime('now','localtime'))`,
          [
            pageId, title, slug,
            expanded || memory.content,
            (expanded || memory.content).slice(0, 100),
            memory.importance,
            JSON.stringify({ sourceMemoryId: memory.id, sourceType: 'memory-push' }),
          ]
        )

        // 标记记忆为已推送
        let meta: Record<string, unknown> = {}
        try { meta = JSON.parse(memory.metadata_json || '{}') } catch { /* ignore */ }
        meta.wiki_pushed = true
        meta.wiki_page_id = pageId

        await run(
          "UPDATE memory_items SET metadata_json = ?, updated_at = datetime('now','localtime') WHERE id = ?",
          [JSON.stringify(meta), memory.id]
        )

        pushed++
      } catch { /* skip */ }
    }

    return { pushed, skipped }
  })()
}

// ─── 知识价值评估 ───

/**
 * 评估知识条目的价值
 *
 * 综合考虑：信息密度、可操作性、时效性、独特性
 */
export async function assessKnowledgeValue(
  llmConfig: LLMConfig,
  content: string
): Promise<KnowledgeValueAssessment> {
  if (!content || content.length < 20) {
    return { valueScore: 0, reason: '内容过短', shouldMemorize: false, suggestedImportance: 0 }
  }

  try {
    const response = await chatCompletion(llmConfig, [
      {
        role: 'system',
        content: `你是知识价值评估引擎。评估以下知识条目的价值。
输出 JSON: {"value_score":0-100,"reason":"简短理由","should_memorize":true/false,"suggested_importance":0-100}
只输出 JSON。`,
      },
      {
        role: 'user',
        content: content.slice(0, 500),
      },
    ])

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { valueScore: 30, reason: '无法评估', shouldMemorize: false, suggestedImportance: 30 }
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      value_score?: number
      reason?: string
      should_memorize?: boolean
      suggested_importance?: number
    }

    return {
      valueScore: parsed.value_score || 30,
      reason: parsed.reason || '',
      shouldMemorize: parsed.should_memorize || false,
      suggestedImportance: parsed.suggested_importance || 30,
    }
  } catch {
    // LLM 不可用时，用简单启发式
    const score = Math.min(100, content.length / 5 + 20)
    return {
      valueScore: score,
      reason: '自动评估（LLM 不可用）',
      shouldMemorize: score >= 50,
      suggestedImportance: score,
    }
  }
}
