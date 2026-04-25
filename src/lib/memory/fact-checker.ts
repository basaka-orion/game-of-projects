/**
 * Fact Checker — 事实检查器
 *
 * 对标 MemPalace 的 fact_checker.py
 * 检查知识库中的矛盾声明、过时事实、不一致性。
 */
import { query, run } from '../db/repository'
import { chatCompletion, LLMConfig } from '../ai/provider'
import { getCompileLLMConfig } from '../knowledge/wiki-compiler'
import { searchEntities, Entity } from './entity-detector'

// ─── 接口 ───

export interface FactCheckIssue {
  id: string
  type: 'contradiction' | 'outdated' | 'inconsistency' | 'unverified'
  severity: 'info' | 'warning' | 'error'
  description: string
  tripleIds: string[]
  entities: string[]
  suggestion: string
}

export interface FactCheckReport {
  totalTriples: number
  issuesFound: number
  issues: FactCheckIssue[]
  checkedAt: string
}

// ─── 矛盾检测 ───

/** 检查同一实体对是否有冲突关系 */
export async function detectContradictions(): Promise<FactCheckIssue[]> {
  const issues: FactCheckIssue[] = []

  try {
    // 查找同一 subject 有多个不同 predicate 值的三元组
    const rows = await query(
      `SELECT t1.id as id1, t1.subject, t1.predicate as p1, t1.object as o1,
              t2.id as id2, t2.predicate as p2, t2.object as o2
       FROM knowledge_triples t1
       JOIN knowledge_triples t2 ON t1.subject = t2.subject
       WHERE t1.id < t2.id
         AND t1.predicate = t2.predicate
         AND t1.object != t2.object
         AND (t1.valid_to = '' OR t1.valid_to IS NULL)
         AND (t2.valid_to = '' OR t2.valid_to IS NULL)
       LIMIT 50`
    ) as Array<{
      id1: string; subject: string; p1: string; o1: string
      id2: string; p2: string; o2: string
    }>

    for (const row of rows) {
      issues.push({
        id: `contradiction_${row.id1}_${row.id2}`,
        type: 'contradiction',
        severity: 'error',
        description: `矛盾: "${row.subject}" 的 "${row.p1}" 有两个不同值: "${row.o1}" vs "${row.o2}"`,
        tripleIds: [row.id1, row.id2],
        entities: [row.subject],
        suggestion: '检查哪个值是正确的，将过时的那个标记 valid_to',
      })
    }
  } catch { /* ignore */ }

  return issues
}

// ─── 过时检测 ───

/** 检查可能过时的事实（超过 90 天未更新） */
export async function detectOutdatedFacts(daysThreshold = 90): Promise<FactCheckIssue[]> {
  const issues: FactCheckIssue[] = []

  try {
    const rows = await query(
      `SELECT id, subject, predicate, object, created_at, valid_from, valid_to
       FROM knowledge_triples
       WHERE (valid_to = '' OR valid_to IS NULL)
         AND created_at < datetime('now', '-${daysThreshold} days', 'localtime')
         AND confidence >= 0.5
       ORDER BY created_at ASC
       LIMIT 50`
    ) as Array<{
      id: string; subject: string; predicate: string; object: string
      created_at: string; valid_from: string; valid_to: string
    }>

    for (const row of rows) {
      const daysSince = Math.floor(
        (Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24)
      )
      issues.push({
        id: `outdated_${row.id}`,
        type: 'outdated',
        severity: 'info',
        description: `可能过时: "${row.subject} ${row.predicate} ${row.object}" 已 ${daysSince} 天未验证`,
        tripleIds: [row.id],
        entities: [row.subject, row.object],
        suggestion: '验证此事实是否仍然有效，如果已过时请设置 valid_to',
      })
    }
  } catch { /* ignore */ }

  return issues
}

// ─── LLM 深度审计 ───

const AUDIT_PROMPT = `你是事实检查器。检查以下知识三元组是否存在逻辑矛盾或不一致。

对于每对矛盾的三元组，输出：
{
  "type": "contradiction",
  "triple_ids": ["id1", "id2"],
  "description": "矛盾描述",
  "suggestion": "修复建议"
}

如果没有矛盾，输出：{"issues": []}`

/** 使用 LLM 对特定实体的所有三元组进行深度审计 */
export async function deepAuditEntity(
  entityName: string,
  llmConfig?: LLMConfig
): Promise<FactCheckIssue[]> {
  const config = llmConfig || getCompileLLMConfig()

  try {
    const rows = await query(
      `SELECT id, subject, predicate, object, confidence, created_at
       FROM knowledge_triples
       WHERE subject LIKE ? OR object LIKE ?
       ORDER BY confidence DESC LIMIT 20`,
      [`%${entityName}%`, `%${entityName}%`]
    ) as Array<{
      id: string; subject: string; predicate: string; object: string
      confidence: number; created_at: string
    }>

    if (rows.length < 2) return []

    const tripleText = rows.map(r =>
      `[${r.id}] ${r.subject} —[${r.predicate}]→ ${r.object} (置信度: ${r.confidence}, 创建: ${r.created_at})`
    ).join('\n')

    const response = await chatCompletion(
      config,
      [
        { role: 'system', content: AUDIT_PROMPT },
        { role: 'user', content: `实体: ${entityName}\n\n三元组:\n${tripleText}` },
      ],
      0.1,
      2048
    )

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return []

    const result = JSON.parse(jsonMatch[0]) as { issues: Array<{
      type: string; triple_ids: string[]; description: string; suggestion: string
    }> }

    return (result.issues || []).map((issue, i) => ({
      id: `audit_${entityName}_${i}`,
      type: 'inconsistency' as const,
      severity: 'warning' as const,
      description: issue.description,
      tripleIds: issue.triple_ids || [],
      entities: [entityName],
      suggestion: issue.suggestion,
    }))
  } catch {
    return []
  }
}

// ─── 完整报告 ───

/** 运行完整的事实检查 */
export async function runFactCheck(
  options?: {
    checkContradictions?: boolean
    checkOutdated?: boolean
    outdatedThresholdDays?: number
    deepAuditEntities?: string[]
  },
  llmConfig?: LLMConfig
): Promise<FactCheckReport> {
  const opts = {
    checkContradictions: true,
    checkOutdated: true,
    outdatedThresholdDays: 90,
    deepAuditEntities: [] as string[],
    ...options,
  }

  const issues: FactCheckIssue[] = []

  // 总数统计
  let totalTriples = 0
  try {
    const rows = await query('SELECT COUNT(*) as cnt FROM knowledge_triples') as Array<{ cnt: number }>
    totalTriples = rows[0]?.cnt || 0
  } catch { /* ignore */ }

  // 1. 矛盾检测
  if (opts.checkContradictions) {
    const contradictions = await detectContradictions()
    issues.push(...contradictions)
  }

  // 2. 过时检测
  if (opts.checkOutdated) {
    const outdated = await detectOutdatedFacts(opts.outdatedThresholdDays)
    issues.push(...outdated)
  }

  // 3. 深度审计指定实体
  for (const entityName of opts.deepAuditEntities) {
    const deepIssues = await deepAuditEntity(entityName, llmConfig)
    issues.push(...deepIssues)
  }

  return {
    totalTriples,
    issuesFound: issues.length,
    issues,
    checkedAt: new Date().toISOString(),
  }
}

/** 修复矛盾：将其中一个三元组标记为已过期 */
export async function resolveContradiction(
  keepId: string,
  expireId: string
): Promise<void> {
  const now = new Date().toISOString()
  await run(
    `UPDATE knowledge_triples SET valid_to = ? WHERE id = ?`,
    [now, expireId]
  )
}
