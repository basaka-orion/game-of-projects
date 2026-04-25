/**
 * Outputs — Karpathy 工作流问答存档层
 *
 * 将用户与 Wiki 的问答交互记录到 wiki_activity_log，
 * 同时将高质量 Q&A 持久化为独立的 Wiki 页面（outputs/ 概念层）。
 *
 * Karpathy 工作流：Clippings → Wiki → Outputs
 * Outputs 是知识的第三层——从原始素材到结构化知识，最终到可执行的问答成果。
 */
import { query, run } from '../db/repository'
import { generateId } from '../db/schema'
import { createPage, appendToLog } from './wiki'

// ─── 接口 ───

export interface OutputRecord {
  id: string
  question: string
  answer: string
  sourcePageIds: string[]
  quality: number
  tags: string[]
  createdAt: string
}

// ─── 存档 ───

/** 存档一次问答交互 */
export async function archiveOutput(params: {
  question: string
  answer: string
  sourcePageIds?: string[]
  quality?: number
  tags?: string[]
}): Promise<string> {
  const id = generateId()
  const quality = params.quality || 3

  // 1. 写入活动日志
  await appendToLog('query', 'page', id, `Q: ${params.question.slice(0, 100)}`, {
    answer: params.answer.slice(0, 500),
    sourcePageIds: params.sourcePageIds || [],
    quality,
  })

  // 2. 高质量回答（quality >= 4）自动创建 output Wiki 页面
  if (quality >= 4) {
    const slug = `output-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    try {
      await createPage({
        title: `[Output] ${params.question.slice(0, 80)}`,
        slug,
        content: `## 问题\n\n${params.question}\n\n## 回答\n\n${params.answer}\n\n---\n*来源页面: ${(params.sourcePageIds || []).join(', ')}*\n*质量评分: ${quality}/5*`,
        summary: params.question.slice(0, 100),
        category: 'output',
        tags: params.tags || ['output', 'qa'],
        sourceIds: params.sourcePageIds || [],
        importance: quality * 20,
        metadata: { type: 'output', quality },
      })
    } catch { /* non-critical */ }
  }

  return id
}

// ─── 查询 ───

/** 获取近期 Outputs */
export async function getRecentOutputs(limit = 20): Promise<OutputRecord[]> {
  try {
    const rows = await query<{
      id: string; description: string; details_json: string; created_at: string
    }>(
      `SELECT id, description, details_json, created_at FROM wiki_activity_log
       WHERE action = 'query' ORDER BY created_at DESC LIMIT ?`,
      [limit]
    )

    return rows.map(r => {
      const details = JSON.parse(r.details_json || '{}')
      return {
        id: r.id,
        question: r.description.replace(/^Q: /, ''),
        answer: details.answer || '',
        sourcePageIds: details.sourcePageIds || [],
        quality: details.quality || 3,
        tags: [],
        createdAt: r.created_at,
      }
    })
  } catch {
    return []
  }
}

/** 获取 Output 统计 */
export async function getOutputStats(): Promise<{ total: number; highQuality: number }> {
  try {
    const total = await query<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM wiki_activity_log WHERE action = 'query'"
    )
    const hq = await query<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM wiki_activity_log WHERE action = 'query' AND details_json LIKE '%\"quality\":4%' OR details_json LIKE '%\"quality\":5%'"
    )
    return {
      total: total[0]?.cnt || 0,
      highQuality: hq[0]?.cnt || 0,
    }
  } catch {
    return { total: 0, highQuality: 0 }
  }
}
