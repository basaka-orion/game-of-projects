/**
 * Wake-Up — MemPalace 上下文加载器
 *
 * 系统启动 / 对话开始时，从记忆宫殿中加载最相关的上下文：
 * 1. 最近 24h 的新记忆
 * 2. 高重要性记忆（importance >= 80）
 * 3. Boss 身份记忆
 * 4. 当前上下文相关的记忆（通过关键词搜索）
 *
 * 生成格式化的上下文注入到 system prompt 中。
 */
import { query } from '../db/repository'
import { palaceSearch, type WingInfo } from './mempalace'

// ─── 接口 ───

export interface WakeUpContext {
  /** 注入到 system prompt 的文本 */
  promptInjection: string
  /** 加载的记忆数量 */
  memoriesLoaded: number
  /** 加载的翼楼统计 */
  wingStats: Record<string, number>
}

// ─── 核心加载 ───

/** 生成 MemPalace 唤醒上下文 */
export async function generateWakeUpContext(
  currentQuery?: string,
  maxTokenBudget = 800
): Promise<WakeUpContext> {
  const parts: string[] = []
  const wingStats: Record<string, number> = {}
  let memoriesLoaded = 0

  // 1. 最近记忆（24h 内）
  try {
    const recent = await query<{ wing: string; title: string; raw_content: string }>(
      `SELECT wing, title, raw_content FROM mempalace_drawers
       WHERE created_at > datetime('now', '-1 day')
       ORDER BY created_at DESC LIMIT 5`
    )
    if (recent.length > 0) {
      parts.push('## 近期记忆')
      for (const r of recent) {
        parts.push(`- [${r.wing}] ${r.title}: ${r.raw_content.slice(0, 100)}`)
        wingStats[r.wing] = (wingStats[r.wing] || 0) + 1
        memoriesLoaded++
      }
    }
  } catch { /* empty palace */ }

  // 2. Boss 身份记忆
  try {
    const identity = await query<{ title: string; raw_content: string }>(
      `SELECT title, raw_content FROM mempalace_drawers
       WHERE wing = 'identity'
       ORDER BY updated_at DESC LIMIT 3`
    )
    if (identity.length > 0) {
      parts.push('## Boss 特征')
      for (const i of identity) {
        parts.push(`- ${i.title}: ${i.raw_content.slice(0, 80)}`)
        memoriesLoaded++
      }
      wingStats['identity'] = (wingStats['identity'] || 0) + identity.length
    }
  } catch { /* ignore */ }

  // 3. 上下文相关记忆
  if (currentQuery) {
    try {
      const relevant = await palaceSearch(currentQuery, 3)
      if (relevant.length > 0) {
        parts.push('## 相关记忆')
        for (const r of relevant) {
          parts.push(`- [${r.wing}/${r.hall}] ${r.title}: ${r.rawContent.slice(0, 100)}`)
          wingStats[r.wing] = (wingStats[r.wing] || 0) + 1
          memoriesLoaded++
        }
      }
    } catch { /* search failed */ }
  }

  // 4. 高重要性知识
  try {
    const important = await query<{ wing: string; title: string; raw_content: string }>(
      `SELECT wing, title, raw_content FROM mempalace_drawers
       WHERE tags LIKE '%important%' OR tags LIKE '%critical%'
       ORDER BY created_at DESC LIMIT 3`
    )
    if (important.length > 0) {
      parts.push('## 关键知识')
      for (const i of important) {
        parts.push(`- [${i.wing}] ${i.title}: ${i.raw_content.slice(0, 80)}`)
        wingStats[i.wing] = (wingStats[i.wing] || 0) + 1
        memoriesLoaded++
      }
    }
  } catch { /* ignore */ }

  // 组装注入文本（控制 token 预算）
  let injection = parts.join('\n')
  if (injection.length > maxTokenBudget * 4) {
    injection = injection.slice(0, maxTokenBudget * 4) + '\n...(记忆已截断)'
  }

  const promptInjection = memoriesLoaded > 0
    ? `\n<mempalace-context>\n${injection}\n</mempalace-context>`
    : ''

  return { promptInjection, memoriesLoaded, wingStats }
}

/** 快速加载（用于对话上下文注入） */
export async function quickWakeUp(userMessage: string): Promise<string> {
  const ctx = await generateWakeUpContext(userMessage, 500)
  return ctx.promptInjection
}
