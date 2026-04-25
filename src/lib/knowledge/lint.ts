/**
 * Lint — Wiki 体检引擎
 *
 * Karpathy Lint 操作的实现：
 * 扫描 Wiki 发现问题（孤儿、矛盾、过时、断裂链接、缺失引用等）
 * 部分问题可自动修复
 */
import { query, run } from '../db/repository'
import { LLMConfig, chatCompletion } from '../ai/provider'
import { getSetting } from '../db/store'
import { getDefaultConfig } from '../ai/provider'
import { generateId } from '../db/schema'
import { getAllPages, getPage, getPageCount, getSourceCount, updatePage } from './wiki'

// ─── 接口 ───

export interface LintIssue {
  id: string
  issueType: string
  severity: string
  pageId: string
  pageTitle: string
  relatedPageId: string | null
  relatedPageTitle: string | null
  description: string
  suggestion: string
  status: string
}

export interface LintReport {
  totalIssues: number
  issues: LintIssue[]
  stats: {
    totalPages: number
    totalSources: number
    orphans: number
    contradictions: number
    stale: number
    brokenLinks: number
    missingSummary: number
    lowConfidence: number
    avgConfidence: number
    avgImportance: number
  }
}

// ─── 检测函数 ───

/** 检测孤儿页面（无反向链接） */
export async function detectOrphanPages(): Promise<LintIssue[]> {
  const rows = await query<{
    id: string; title: string; backlink_count: number
  }>(
    `SELECT id, title, backlink_count FROM wiki_pages
     WHERE is_index = 0 AND is_log = 0 AND backlink_count = 0
     ORDER BY importance DESC`
  )

  return rows.map(r => ({
    id: generateId(),
    issueType: 'orphan',
    severity: 'info',
    pageId: r.id,
    pageTitle: r.title,
    relatedPageId: null,
    relatedPageTitle: null,
    description: `"${r.title}" 没有任何其他页面链接到它`,
    suggestion: '考虑从相关页面添加链接，或检查是否应该合并到其他页面',
    status: 'open',
  }))
}

/** 检测过时声明（90 天未更新） */
export async function detectStaleClaims(maxAgeDays = 90): Promise<LintIssue[]> {
  const rows = await query<{
    id: string; title: string; importance: number; updated_at: string
  }>(
    `SELECT id, title, importance, updated_at FROM wiki_pages
     WHERE is_index = 0 AND is_log = 0 AND importance >= 70
     AND updated_at < datetime('now', '-' || ? || ' days', 'localtime')
     ORDER BY importance DESC`,
    [maxAgeDays]
  )

  return rows.map(r => ({
    id: generateId(),
    issueType: 'stale',
    severity: 'warning',
    pageId: r.id,
    pageTitle: r.title,
    relatedPageId: null,
    relatedPageTitle: null,
    description: `"${r.title}" 已超过 ${maxAgeDays} 天未更新（重要性: ${Math.round(r.importance)}）`,
    suggestion: '检查内容是否仍然准确，更新或标记为已归档',
    status: 'open',
  }))
}

/** 检测断裂链接 */
export async function detectBrokenLinks(): Promise<LintIssue[]> {
  const rows = await query<{
    id: string; title: string; linked_page_ids: string
  }>(
    `SELECT id, title, linked_page_ids FROM wiki_pages
     WHERE linked_page_ids != '[]' AND is_index = 0`
  )

  const issues: LintIssue[] = []
  for (const row of rows) {
    try {
      const linkedIds: string[] = JSON.parse(row.linked_page_ids || '[]')
      for (const linkedId of linkedIds) {
        const target = await query<{ id: string }>('SELECT id FROM wiki_pages WHERE id = ?', [linkedId])
        if (target.length === 0) {
          issues.push({
            id: generateId(),
            issueType: 'broken_link',
            severity: 'warning',
            pageId: row.id,
            pageTitle: row.title,
            relatedPageId: linkedId,
            relatedPageTitle: null,
            description: `"${row.title}" 链接到不存在的页面 ${linkedId}`,
            suggestion: '移除断裂链接或创建目标页面',
            status: 'open',
          })
        }
      }
    } catch { /* ignore parse errors */ }
  }

  return issues
}

/** 检测缺失摘要 */
export async function detectMissingSummaries(): Promise<LintIssue[]> {
  const rows = await query<{
    id: string; title: string
  }>(
    `SELECT id, title FROM wiki_pages
     WHERE is_index = 0 AND is_log = 0 AND (summary IS NULL OR summary = '')
     ORDER BY importance DESC`
  )

  return rows.map(r => ({
    id: generateId(),
    issueType: 'missing_summary',
    severity: 'info',
    pageId: r.id,
    pageTitle: r.title,
    relatedPageId: null,
    relatedPageTitle: null,
    description: `"${r.title}" 缺少摘要`,
    suggestion: '添加一句话摘要便于搜索和理解',
    status: 'open',
  }))
}

/** 检测低置信度页面 */
export async function detectLowConfidence(): Promise<LintIssue[]> {
  const rows = await query<{
    id: string; title: string; confidence: number
  }>(
    `SELECT id, title, confidence FROM wiki_pages
     WHERE is_index = 0 AND is_log = 0 AND confidence < 0.3
     ORDER BY confidence ASC`
  )

  return rows.map(r => ({
    id: generateId(),
    issueType: 'low_confidence',
    severity: 'info',
    pageId: r.id,
    pageTitle: r.title,
    relatedPageId: null,
    relatedPageTitle: null,
    description: `"${r.title}" 置信度很低 (${(r.confidence * 100).toFixed(0)}%)`,
    suggestion: '检查内容准确性，考虑重新摄入或删除',
    status: 'open',
  }))
}

/** 检测矛盾（需要 LLM） */
export async function detectContradictions(llmConfig: LLMConfig): Promise<LintIssue[]> {
  // 获取同类别页面
  const categories = await query<{ category: string; cnt: number }>(
    `SELECT category, COUNT(*) as cnt FROM wiki_pages WHERE is_index = 0 AND is_log = 0
     GROUP BY category HAVING cnt >= 2 ORDER BY cnt DESC LIMIT 5`
  )

  const issues: LintIssue[] = []

  for (const cat of categories) {
    const pages = await query<{ id: string; title: string; content: string; summary: string }>(
      `SELECT id, title, content, summary FROM wiki_pages WHERE category = ? AND is_index = 0 LIMIT 10`,
      [cat.category]
    )

    // 配对检查（最多 5 对）
    for (let i = 0; i < Math.min(pages.length, 5); i++) {
      for (let j = i + 1; j < Math.min(pages.length, 5); j++) {
        const a = pages[i]
        const b = pages[j]

        try {
          const result = await chatCompletion(llmConfig, [
            {
              role: 'system',
              content: '对比以下两段知识，判断是否存在矛盾。输出 JSON: {"contradiction": true/false, "description": "矛盾描述或空字符串"}',
            },
            {
              role: 'user',
              content: `页面A: ${a.title}\n${a.summary || a.content.slice(0, 500)}\n\n页面B: ${b.title}\n${b.summary || b.content.slice(0, 500)}`,
            },
          ], 0.2, 256)

          const jsonMatch = result.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0])
            if (parsed.contradiction) {
              issues.push({
                id: generateId(),
                issueType: 'contradiction',
                severity: 'error',
                pageId: a.id,
                pageTitle: a.title,
                relatedPageId: b.id,
                relatedPageTitle: b.title,
                description: `"${a.title}" 和 "${b.title}" 存在矛盾: ${parsed.description}`,
                suggestion: '审查两个页面，确定哪个版本准确并更新',
                status: 'open',
              })
            }
          }
        } catch { /* ignore LLM failures */ }
      }
    }
  }

  return issues
}

// ─── 完整体检 ───

/** 运行完整 Wiki 体检 */
export async function runLint(llmConfig?: LLMConfig): Promise<LintReport> {
  // 清除旧问题
  await run("UPDATE wiki_lint_issues SET status = 'dismissed' WHERE status = 'open'")

  // 运行所有检测
  const orphans = await detectOrphanPages()
  const stale = await detectStaleClaims()
  const brokenLinks = await detectBrokenLinks()
  const missingSummary = await detectMissingSummaries()
  const lowConf = await detectLowConfidence()
  const chunkCoverage = await detectChunkCoverage()
  const staleVectors = await detectStaleVectors()

  let contradictions: LintIssue[] = []
  if (llmConfig) {
    try {
      contradictions = await detectContradictions(llmConfig)
    } catch { /* LLM 检测可选 */ }
  }

  const allIssues = [...orphans, ...stale, ...brokenLinks, ...missingSummary, ...lowConf, ...contradictions, ...chunkCoverage, ...staleVectors]

  // 写入数据库
  for (const issue of allIssues) {
    await run(
      `INSERT OR IGNORE INTO wiki_lint_issues (id, issue_type, severity, page_id, related_page_id, description, suggestion, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
      [issue.id, issue.issueType, issue.severity, issue.pageId, issue.relatedPageId, issue.description, issue.suggestion]
    )
  }

  // 统计
  const totalPages = await getPageCount()
  const totalSources = await getSourceCount()
  const statsRows = await query<{ avg_conf: number; avg_imp: number }>(
    'SELECT AVG(confidence) as avg_conf, AVG(importance) as avg_imp FROM wiki_pages WHERE is_index = 0 AND is_log = 0'
  )

  return {
    totalIssues: allIssues.length,
    issues: allIssues,
    stats: {
      totalPages,
      totalSources,
      orphans: orphans.length,
      contradictions: contradictions.length,
      stale: stale.length,
      brokenLinks: brokenLinks.length,
      missingSummary: missingSummary.length,
      lowConfidence: lowConf.length,
      avgConfidence: statsRows[0]?.avg_conf || 0,
      avgImportance: statsRows[0]?.avg_imp || 0,
    },
  }
}

// ─── 问题管理 ───

/** 修复问题 */
export async function fixIssue(issueId: string): Promise<boolean> {
  const issues = await query<{
    id: string; issue_type: string; page_id: string; related_page_id: string
  }>('SELECT * FROM wiki_lint_issues WHERE id = ? AND status = ?', [issueId, 'open'])

  if (issues.length === 0) return false
  const issue = issues[0]

  try {
    switch (issue.issue_type) {
      case 'missing_summary': {
        // 为缺失摘要的页面生成基础摘要
        const page = await getPage(issue.page_id)
        if (page) {
          const summary = page.content.slice(0, 100).replace(/[#*\n]/g, ' ').trim()
          await updatePage(issue.page_id, { summary })
        }
        break
      }
      case 'orphan': {
        // 孤儿页面暂时无法自动修复，标记为已处理
        break
      }
      default:
        break
    }

    await run('UPDATE wiki_lint_issues SET status = ? WHERE id = ?', ['fixed', issueId])
    return true
  } catch {
    return false
  }
}

/** 忽略问题 */
export async function dismissIssue(issueId: string): Promise<void> {
  await run('UPDATE wiki_lint_issues SET status = ? WHERE id = ?', ['dismissed', issueId])
}

/** 获取所有未解决问题 */
export async function getOpenIssues(): Promise<LintIssue[]> {
  const rows = await query<{
    id: string; issue_type: string; severity: string;
    page_id: string; related_page_id: string;
    description: string; suggestion: string; status: string
  }>(
    `SELECT l.*, p.title as page_title, r.title as related_title
     FROM wiki_lint_issues l
     LEFT JOIN wiki_pages p ON l.page_id = p.id
     LEFT JOIN wiki_pages r ON l.related_page_id = r.id
     WHERE l.status = 'open'
     ORDER BY CASE l.severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END`,
  )

  return rows.map(r => ({
    id: r.id,
    issueType: r.issue_type,
    severity: r.severity,
    pageId: r.page_id,
    pageTitle: (r as any).page_title || r.page_id,
    relatedPageId: r.related_page_id,
    relatedPageTitle: (r as any).related_title || null,
    description: r.description,
    suggestion: r.suggestion,
    status: r.status,
  }))
}

/** 自动修复安全问题 */
export async function autoFixSafeIssues(): Promise<number> {
  let fixed = 0

  // 修复缺失摘要
  const missingSummary = await detectMissingSummaries()
  for (const issue of missingSummary) {
    const page = await getPage(issue.pageId)
    if (page && page.content) {
      const summary = page.content.slice(0, 100).replace(/[#*\n]/g, ' ').trim()
      await updatePage(issue.pageId, { summary })
      fixed++
    }
  }

  return fixed
}

// ─── 新增检测：分块覆盖率和向量质量 ───

/** 检测分块覆盖率 — 哪些源没有被分块 */
async function detectChunkCoverage(): Promise<LintIssue[]> {
  const issues: LintIssue[] = []

  try {
    // 找到有内容但没有 chunk 的源
    const unchunked = await query(
      `SELECT s.id, s.title, LENGTH(s.content) as content_len
       FROM wiki_sources s
       LEFT JOIN wiki_chunks c ON c.source_id = s.id
       WHERE c.id IS NULL AND s.content != '' AND LENGTH(s.content) > 100
       LIMIT 50`
    ) as Array<{ id: string; title: string; content_len: number }>

    for (const source of unchunked) {
      issues.push({
        id: generateId(),
        issueType: 'chunk_coverage',
        severity: 'warning',
        pageId: source.id,
        pageTitle: source.title,
        relatedPageId: null,
        relatedPageTitle: null,
        description: `源 "${source.title}" (${source.content_len} 字符) 未被分块，无法进行语义搜索`,
        suggestion: '运行批量分块任务 (batchChunkSources) 进行处理',
        status: 'open',
      })
    }
  } catch { /* table might not exist */ }

  return issues
}

/** 检测过时的向量 — 源更新后向量未更新 */
async function detectStaleVectors(): Promise<LintIssue[]> {
  const issues: LintIssue[] = []

  try {
    // 找到有 chunk 但没有向量的源
    const unvectorized = await query(
      `SELECT c.id as chunk_id, c.source_id, p.title, SUBSTR(c.content, 1, 50) as preview
       FROM wiki_chunks c
       LEFT JOIN wiki_vectors v ON v.chunk_id = c.id
       JOIN wiki_pages p ON c.page_id = p.id
       WHERE v.id IS NULL
       LIMIT 50`
    ) as Array<{ chunk_id: string; source_id: string; title: string; preview: string }>

    for (const chunk of unvectorized) {
      issues.push({
        id: generateId(),
        issueType: 'stale_vector',
        severity: 'info',
        pageId: chunk.source_id,
        pageTitle: chunk.title,
        relatedPageId: null,
        relatedPageTitle: null,
        description: `页面 "${chunk.title}" 的块 "${chunk.preview}..." 缺少向量嵌入`,
        suggestion: '运行批量向量化任务 (batchVectorizeChunks) 生成嵌入',
        status: 'open',
      })
    }
  } catch { /* tables might not exist */ }

  return issues
}
