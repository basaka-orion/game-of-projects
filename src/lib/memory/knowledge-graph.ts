/**
 * Knowledge Graph — 知识图谱引擎（MemPalace + Graphify 融合）
 *
 * 融合 MemPalace 的结构化记忆与 Graphify 的代码→图谱映射：
 * - 实体-谓词-客体 三元组存储（Subject-Predicate-Object）
 * - 时间有效性（valid_from / valid_to）— MemPalace 的时序知识
 * - 置信度追踪（confidence 0-1）
 * - 图遍历：从实体出发，沿谓词路径探索关联知识
 * - 自动提取：LLM 从对话/评估/决策中提取三元组
 * - 与 Memory Palace 联动：三元组可写入 MemoryRoom
 * - Leiden 社区检测（简化版）：自动发现知识簇
 */
import { query, run } from '../db/repository'
import { chatCompletion, LLMConfig, getDefaultConfig } from '../ai/provider'
import { getSetting } from '../db/store'
import { generateId } from '../db/schema'

// ─── 接口 ───

export interface KnowledgeTriple {
  id: string
  subject: string
  predicate: string
  object: string
  source: string
  confidence: number
  validFrom: string
  validTo: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface GraphEntity {
  name: string
  tripleCount: number
  avgConfidence: number
  types: string[]
}

export interface GraphPath {
  nodes: string[]
  edges: { predicate: string; confidence: number }[]
  totalLength: number
}

export interface KnowledgeCluster {
  id: string
  entities: string[]
  centralTopic: string
  tripleCount: number
  avgConfidence: number
}

// ─── CRUD ───

/** 确保知识图谱表存在 */
async function ensureTable(): Promise<void> {
  await run(`CREATE TABLE IF NOT EXISTS knowledge_triples (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    predicate TEXT NOT NULL,
    object TEXT NOT NULL,
    source TEXT DEFAULT '',
    confidence REAL DEFAULT 0.8,
    valid_from TEXT DEFAULT '',
    valid_to TEXT DEFAULT '',
    metadata_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)
  await run(`CREATE INDEX IF NOT EXISTS idx_kg_subject ON knowledge_triples(subject)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_kg_object ON knowledge_triples(object)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_kg_predicate ON knowledge_triples(predicate)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_kg_confidence ON knowledge_triples(confidence DESC)`)
}

/** 添加三元组 */
export async function addTriple(params: {
  subject: string
  predicate: string
  object: string
  source?: string
  confidence?: number
  validFrom?: string
  validTo?: string
  metadata?: Record<string, unknown>
}): Promise<string> {
  await ensureTable()
  const id = generateId()
  await run(
    `INSERT INTO knowledge_triples (id, subject, predicate, object, source, confidence, valid_from, valid_to, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.subject.trim(),
      params.predicate.trim(),
      params.object.trim(),
      params.source || '',
      params.confidence ?? 0.8,
      params.validFrom || '',
      params.validTo || '',
      JSON.stringify(params.metadata || {}),
    ]
  )
  return id
}

/** 批量添加三元组 */
export async function addTriples(triples: Array<Omit<Parameters<typeof addTriple>[0], never>>): Promise<string[]> {
  const ids: string[] = []
  for (const t of triples) {
    ids.push(await addTriple(t))
  }
  return ids
}

/** 查询实体的所有三元组（精确匹配优先，LIKE 降级） */
/** 时间窗口过滤条件：排除已过期（valid_to 非空且在过去）的三元组 */
const VALID_TIME_FILTER = `(valid_to = '' OR valid_to IS NULL OR valid_to > datetime('now','localtime'))`

export async function queryEntity(entity: string): Promise<KnowledgeTriple[]> {
  await ensureTable()
  const rows = await query<{
    id: string; subject: string; predicate: string; object: string
    source: string; confidence: number; valid_from: string; valid_to: string
    metadata_json: string; created_at: string
  }>(
    `SELECT * FROM knowledge_triples
     WHERE (subject = ? OR object = ?)
     AND ${VALID_TIME_FILTER}
     ORDER BY confidence DESC`,
    [entity, entity]
  )

  // 精确匹配无结果时，LIKE 降级
  if (rows.length === 0) {
    const like = `%${entity}%`
    const likeRows = await query<{
      id: string; subject: string; predicate: string; object: string
      source: string; confidence: number; valid_from: string; valid_to: string
      metadata_json: string; created_at: string
    }>(
      `SELECT * FROM knowledge_triples
       WHERE (subject LIKE ? OR object LIKE ?)
       AND ${VALID_TIME_FILTER}
       ORDER BY confidence DESC LIMIT 20`,
      [like, like]
    )
    return likeRows.map(r => ({
      id: r.id,
      subject: r.subject,
      predicate: r.predicate,
      object: r.object,
      source: r.source,
      confidence: r.confidence,
      validFrom: r.valid_from,
      validTo: r.valid_to,
      metadata: JSON.parse(r.metadata_json || '{}'),
      createdAt: r.created_at,
    }))
  }

  return rows.map(r => ({
    id: r.id,
    subject: r.subject,
    predicate: r.predicate,
    object: r.object,
    source: r.source,
    confidence: r.confidence,
    validFrom: r.valid_from,
    validTo: r.valid_to,
    metadata: JSON.parse(r.metadata_json || '{}'),
    createdAt: r.created_at,
  }))
}

/** 按谓词查询 */
export async function queryByPredicate(predicate: string): Promise<KnowledgeTriple[]> {
  await ensureTable()
  const rows = await query<{
    id: string; subject: string; predicate: string; object: string
    source: string; confidence: number; valid_from: string; valid_to: string
    metadata_json: string; created_at: string
  }>(
    `SELECT * FROM knowledge_triples WHERE predicate = ? ORDER BY confidence DESC`,
    [predicate]
  )
  return rows.map(r => ({
    id: r.id,
    subject: r.subject,
    predicate: r.predicate,
    object: r.object,
    source: r.source,
    confidence: r.confidence,
    validFrom: r.valid_from,
    validTo: r.valid_to,
    metadata: JSON.parse(r.metadata_json || '{}'),
    createdAt: r.created_at,
  }))
}

/** 删除三元组 */
export async function removeTriple(id: string): Promise<void> {
  await run('DELETE FROM knowledge_triples WHERE id = ?', [id])
}

/** 获取所有实体（去重） */
export async function getAllEntities(): Promise<GraphEntity[]> {
  await ensureTable()
  const rows = await query<{
    name: string; triple_count: number; avg_confidence: number; predicates: string
  }>(
    `SELECT name, triple_count, avg_confidence, predicates FROM (
      SELECT subject AS name, COUNT(*) AS triple_count, AVG(confidence) AS avg_confidence,
             GROUP_CONCAT(DISTINCT predicate) AS predicates
      FROM knowledge_triples GROUP BY subject
      UNION ALL
      SELECT object AS name, COUNT(*) AS triple_count, AVG(confidence) AS avg_confidence,
             GROUP_CONCAT(DISTINCT predicate) AS predicates
      FROM knowledge_triples GROUP BY object
    ) ORDER BY triple_count DESC`
  )

  const entityMap = new Map<string, GraphEntity>()
  for (const r of rows) {
    const existing = entityMap.get(r.name)
    if (existing) {
      existing.tripleCount += r.triple_count
      existing.avgConfidence = (existing.avgConfidence + r.avg_confidence) / 2
      existing.types = [...new Set([...existing.types, ...(r.predicates || '').split(',')])]
    } else {
      entityMap.set(r.name, {
        name: r.name,
        tripleCount: r.triple_count,
        avgConfidence: r.avg_confidence,
        types: (r.predicates || '').split(',').filter(Boolean),
      })
    }
  }
  return Array.from(entityMap.values()).sort((a, b) => b.tripleCount - a.tripleCount)
}

// ─── 图遍历 ───

/** 从起始实体出发，沿谓词路径探索（BFS，最大深度 N） */
export async function traverseGraph(
  startEntity: string,
  maxDepth: number = 3,
  maxResults: number = 20
): Promise<KnowledgeTriple[]> {
  const visited = new Set<string>()
  const results: KnowledgeTriple[] = []
  let frontier = [startEntity]

  for (let depth = 0; depth < maxDepth && results.length < maxResults; depth++) {
    const nextFrontier: string[] = []
    for (const entity of frontier) {
      if (visited.has(entity)) continue
      visited.add(entity)

      const triples = await queryEntity(entity)
      for (const t of triples) {
        if (results.length >= maxResults) break
        if (!results.find(r => r.id === t.id)) {
          results.push(t)
          const nextNode = t.subject === entity ? t.object : t.subject
          if (!visited.has(nextNode)) nextFrontier.push(nextNode)
        }
      }
    }
    frontier = nextFrontier
  }

  return results
}

/** 查找两个实体之间的路径（BFS） */
export async function findPath(
  fromEntity: string,
  toEntity: string,
  maxDepth: number = 4
): Promise<GraphPath | null> {
  // BFS with path tracking
  const queue: Array<{ entity: string; path: GraphPath }> = [{
    entity: fromEntity,
    path: { nodes: [fromEntity], edges: [], totalLength: 0 },
  }]
  const visited = new Set<string>([fromEntity])

  while (queue.length > 0) {
    const { entity, path } = queue.shift()!

    if (entity === toEntity) return path

    if (path.totalLength >= maxDepth) continue

    const triples = await queryEntity(entity)
    for (const t of triples) {
      const nextEntity = t.subject === entity ? t.object : t.subject
      if (visited.has(nextEntity)) continue
      visited.add(nextEntity)

      queue.push({
        entity: nextEntity,
        path: {
          nodes: [...path.nodes, nextEntity],
          edges: [...path.edges, { predicate: t.predicate, confidence: t.confidence }],
          totalLength: path.totalLength + 1,
        },
      })
    }
  }

  return null
}

// ─── 社区检测（简化版 Leiden） ───

/** 发现知识簇 — 基于共现频率的简单聚类 */
export async function detectClusters(minSize: number = 3): Promise<KnowledgeCluster[]> {
  await ensureTable()
  const entities = await getAllEntities()
  if (entities.length === 0) return []

  // 构建邻接表
  const adjacency = new Map<string, Set<string>>()
  const allTriples = await query<{
    subject: string; object: string
  }>('SELECT subject, object FROM knowledge_triples')

  for (const t of allTriples) {
    if (!adjacency.has(t.subject)) adjacency.set(t.subject, new Set())
    if (!adjacency.has(t.object)) adjacency.set(t.object, new Set())
    adjacency.get(t.subject)!.add(t.object)
    adjacency.get(t.object)!.add(t.subject)
  }

  // 简单贪心聚类
  const assigned = new Set<string>()
  const clusters: KnowledgeCluster[] = []

  for (const entity of entities) {
    if (assigned.has(entity.name)) continue
    const neighbors = adjacency.get(entity.name) || new Set()
    const clusterEntities = [entity.name]
    assigned.add(entity.name)

    for (const neighbor of neighbors) {
      if (assigned.has(neighbor)) continue
      // 检查共现强度
      const commonNeighbors = [...neighbors].filter(n => adjacency.get(neighbor)?.has(n))
      if (commonNeighbors.length >= 1) {
        clusterEntities.push(neighbor)
        assigned.add(neighbor)
      }
    }

    if (clusterEntities.length >= minSize) {
      const tripleCount = await query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM knowledge_triples WHERE subject IN (${clusterEntities.map(() => '?').join(',')}) OR object IN (${clusterEntities.map(() => '?').join(',')})`,
        [...clusterEntities, ...clusterEntities]
      )
      clusters.push({
        id: generateId(),
        entities: clusterEntities,
        centralTopic: entity.name,
        tripleCount: tripleCount[0]?.cnt || 0,
        avgConfidence: entity.avgConfidence,
      })
    }
  }

  return clusters.sort((a, b) => b.tripleCount - a.tripleCount)
}

// ─── LLM 自动提取 ───

/** 从文本中提取知识三元组 */
export async function extractTriplesFromText(
  text: string,
  source: string = 'conversation'
): Promise<Array<{ subject: string; predicate: string; object: string }>> {
  const provider = getSetting('llm_provider', 'deepseek')
  const defaults = getDefaultConfig(provider)
  const config: LLMConfig = {
    provider: provider as LLMConfig['provider'],
    apiKey: getSetting('llm_api_key', ''),
    baseUrl: getSetting('llm_base_url', defaults.baseUrl),
    model: getSetting('llm_model', defaults.model),
  }

  const prompt = `从以下文本中提取知识三元组（实体-关系-实体）。

文本：
${text.slice(0, 2000)}

规则：
- 提取关键实体和它们之间的关系
- predicate 使用简洁的动词或关系描述（如"属于"、"竞争"、"依赖"、"擅长"）
- subject 和 object 尽量使用标准化名称
- 最多提取 10 个三元组
- 只提取有信息价值的三元组，忽略琐碎信息

输出 JSON 数组格式：
[{"subject": "实体A", "predicate": "关系", "object": "实体B"}]`

  try {
    const result = await chatCompletion(config, [
      { role: 'system', content: prompt },
      { role: 'user', content: '提取三元组' },
    ], 0.3, 1024)

    const jsonMatch = result?.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const triples = JSON.parse(jsonMatch[0]) as Array<{ subject: string; predicate: string; object: string }>
      // 自动入库
      for (const t of triples) {
        if (t.subject && t.predicate && t.object) {
          await addTriple({
            ...t,
            source,
            confidence: 0.7,
          })
        }
      }
      return triples
    }
  } catch { /* ignore */ }

  return []
}

/** 渲染知识图谱为 Prompt 文本 */
export function renderGraphPrompt(triples: KnowledgeTriple[], maxChars: number = 500): string {
  if (triples.length === 0) return ''

  const lines = triples.slice(0, 15).map(t =>
    `- ${t.subject} —[${t.predicate}]→ ${t.object} (${Math.round(t.confidence * 100)}%)`
  )

  let content = lines.join('\n')
  if (content.length > maxChars) {
    content = content.slice(0, maxChars) + '...'
  }

  return `<knowledge-graph>
${content}
</knowledge-graph>`
}

/** 获取图谱统计 */
export async function getGraphStats(): Promise<{
  totalTriples: number
  totalEntities: number
  topPredicates: Array<{ predicate: string; cnt: number }>
  avgConfidence: number
}> {
  await ensureTable()
  const countResult = await query<{ cnt: number }>('SELECT COUNT(*) as cnt FROM knowledge_triples')
  const totalTriples = countResult[0]?.cnt || 0

  const entities = await getAllEntities()
  const predicates = await query<{ predicate: string; cnt: number }>(
    'SELECT predicate, COUNT(*) as cnt FROM knowledge_triples GROUP BY predicate ORDER BY cnt DESC LIMIT 10'
  )
  const confResult = await query<{ avg_conf: number }>(
    'SELECT AVG(confidence) as avg_conf FROM knowledge_triples'
  )

  return {
    totalTriples,
    totalEntities: entities.length,
    topPredicates: predicates,
    avgConfidence: confResult[0]?.avg_conf || 0,
  }
}

/** 置信度时间衰减 — 对超过 maxAgeDays 的三元组降低置信度 */
export async function decayConfidence(
  maxAgeDays: number = 90,
  decayFactor: number = 0.05,
  minConfidence: number = 0.1
): Promise<number> {
  await ensureTable()

  // 获取所有超过 maxAgeDays 的三元组
  const rows = await query<{
    id: string; confidence: number; created_at: string
  }>(
    `SELECT id, confidence, created_at FROM knowledge_triples
     WHERE created_at < datetime('now', '-' || ? || ' days', 'localtime')
     AND confidence > ?`,
    [maxAgeDays, minConfidence]
  )

  let decayed = 0
  for (const row of rows) {
    // 根据天数计算衰减量
    const ageMs = Date.now() - new Date(row.created_at).getTime()
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24))
    const decayAmount = decayFactor * Math.floor(ageDays / maxAgeDays)
    const newConfidence = Math.max(minConfidence, row.confidence - decayAmount)

    if (newConfidence < row.confidence) {
      await run(
        'UPDATE knowledge_triples SET confidence = ? WHERE id = ?',
        [Math.round(newConfidence * 1000) / 1000, row.id]
      )
      decayed++
    }
  }

  // 清除极低置信度的三元组
  await run('DELETE FROM knowledge_triples WHERE confidence < ? AND created_at < datetime(?, "localtime")', [
    minConfidence * 0.5,
    `-${maxAgeDays * 2} days`,
  ])

  return decayed
}
