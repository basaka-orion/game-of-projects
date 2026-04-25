/**
 * Vector Store — 轻量向量存储与语义搜索
 *
 * 不引入 ChromaDB 等重型依赖，向量存 SQLite BLOB 列
 * 通过 Electron IPC 调用 GLM embedding API 或本地 Ollama 生成向量
 *
 * 搜索策略：
 * 1. 候选集预过滤（category/importance/recency 缩小范围）
 * 2. JS 余弦相似度计算
 * 3. Top-K 排序返回
 */

import { query, run } from '../db/repository'
import { generateId } from '../db/schema'
import { buildFtsQuery, countOccurrences, extractSearchTerms } from './query-analysis'

// ─── 接口 ───

export interface VectorRecord {
  id: string
  chunkId: string
  embedding: Float32Array
  model: string
  dimension: number
  norm: number
}

export interface SearchResult {
  chunkId: string
  score: number
  content: string
  metadata: Record<string, unknown>
}

export interface EmbeddingConfig {
  /** 主力: GLM embedding API */
  primary: {
    endpoint: string
    apiKey: string
    model: string
  }
  /** Fallback: Ollama local */
  fallback: {
    endpoint: string
    model: string
  }
}

// ─── 常量 ───

const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  primary: {
    endpoint: 'https://api.z.ai/api/coding/paas/v4/embeddings',
    apiKey: '',
    model: 'embedding-3',
  },
  fallback: {
    endpoint: 'http://localhost:11434/api/embeddings',
    model: 'gemma-3n-e4b-it',
  },
}

// ─── 向量工具 ───

/** Float32Array → Buffer (SQLite BLOB) */
function float32ToBuffer(arr: Float32Array): Buffer {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)
}

/** Buffer (SQLite BLOB) → Float32Array */
function bufferToFloat32(buf: unknown, dimension: number): Float32Array {
  if (buf instanceof ArrayBuffer) {
    return new Float32Array(buf, 0, dimension)
  }
  if (buf instanceof Uint8Array) {
    return new Float32Array(buf.buffer as ArrayBuffer, buf.byteOffset, dimension)
  }
  if (typeof Buffer !== 'undefined' && buf instanceof Buffer) {
    return new Float32Array(buf.buffer as ArrayBuffer, buf.byteOffset, dimension)
  }
  return new Float32Array(dimension)
}

/** 计算 L2 范数 */
function l2Norm(vec: Float32Array): number {
  let sum = 0
  for (let i = 0; i < vec.length; i++) {
    sum += vec[i] * vec[i]
  }
  return Math.sqrt(sum)
}

/** 余弦相似度 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dotProduct / denom
}

// ─── Embedding 生成 ───

/**
 * 通过 Electron IPC 生成文本嵌入向量
 *
 * 先尝试 GLM embedding API，失败则 fallback 到 Ollama
 */
export async function generateEmbedding(
  text: string,
  configOverride?: Partial<EmbeddingConfig>
): Promise<Float32Array> {
  const config = { ...DEFAULT_EMBEDDING_CONFIG, ...configOverride }

  // 尝试主力 API (GLM)
  try {
    return await callGLMEmbedding(text, config.primary)
  } catch (err) {
    console.warn('[vector-store] GLM embedding failed, trying Ollama fallback:', err)
  }

  // Fallback: Ollama
  try {
    return await callOllamaEmbedding(text, config.fallback)
  } catch (err) {
    console.error('[vector-store] All embedding endpoints failed:', err)
    throw new Error('无法生成向量嵌入：GLM 和 Ollama 均不可用')
  }
}

/** 调用智谱 GLM Embedding API */
async function callGLMEmbedding(
  text: string,
  config: { endpoint: string; apiKey: string; model: string }
): Promise<Float32Array> {
  const apiKey = config.apiKey || await getAPIKey()
  if (!apiKey) throw new Error('GLM API Key 未配置')

  // 通过 Electron IPC 发送请求（绕 CORS）
  const response = await callEmbeddingAPI(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      input: text.slice(0, 8000), // 截断过长文本
    }),
  })

  const data = JSON.parse(response) as {
    data: Array<{ embedding: number[]; index: number }>
    model: string
  }

  if (!data.data?.[0]?.embedding) {
    throw new Error('GLM embedding 响应格式异常')
  }

  return new Float32Array(data.data[0].embedding)
}

/** 调用本地 Ollama Embedding API */
async function callOllamaEmbedding(
  text: string,
  config: { endpoint: string; model: string }
): Promise<Float32Array> {
  const response = await callEmbeddingAPI(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      prompt: text.slice(0, 8000),
    }),
  })

  const data = JSON.parse(response) as { embedding: number[] }

  if (!data.embedding) {
    throw new Error('Ollama embedding 响应格式异常')
  }

  return new Float32Array(data.embedding)
}

/** 通过 Electron IPC 发起 Embedding API 请求 */
async function callEmbeddingAPI(
  url: string,
  options: { method: string; headers: Record<string, string>; body: string }
): Promise<string> {
  // 优先使用 generateEmbedding IPC 通道（主进程代理 HTTP）
  if (typeof window !== 'undefined' && window.electronAPI?.generateEmbedding) {
    // 解析 body 获取 model
    const bodyObj = JSON.parse(options.body) as { model?: string; input?: string; prompt?: string }
    const text = bodyObj.input || bodyObj.prompt || ''
    const apiKey = options.headers['Authorization']?.replace('Bearer ', '') || ''

    const result = await window.electronAPI.generateEmbedding(
      text, url, apiKey, bodyObj.model || 'embedding-3'
    ) as { embedding?: number[]; error?: string }

    if (result.error) {
      throw new Error(result.error)
    }
    if (!result.embedding) {
      throw new Error('Embedding 响应格式异常')
    }

    // 返回统一的 JSON 格式
    const isOllama = url.includes('localhost:11434')
    return JSON.stringify(
      isOllama
        ? { embedding: result.embedding }
        : { data: [{ embedding: result.embedding }] }
    )
  }

  // 主进程直连（备用）
  const response = await fetch(url, options as RequestInit)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`)
  }
  return response.text()
}

/** 从 settings 获取 API Key */
async function getAPIKey(): Promise<string> {
  try {
    const rows = await query('SELECT value FROM settings WHERE key = ?', ['llm_api_key']) as Array<{ value: string }>
    return rows[0]?.value || ''
  } catch {
    return ''
  }
}

// ─── 向量存储 ───

/**
 * 存储向量到 SQLite
 *
 * @param tableName 表名（wiki_vectors 或 memory_vectors）
 * @param record 向量记录
 */
export async function storeVector(
  tableName: 'wiki_vectors' | 'memory_vectors',
  record: Omit<VectorRecord, 'id'> & { id?: string }
): Promise<string> {
  const id = record.id || generateId()
  const embeddingBlob = float32ToBuffer(record.embedding)

  await run(
    `INSERT OR REPLACE INTO ${tableName} (id, chunk_id, embedding, model, dimension, norm, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))`,
    [
      id,
      record.chunkId,
      embeddingBlob,
      record.model,
      record.dimension,
      record.norm,
    ]
  )

  return id
}

/**
 * 批量存储向量
 *
 * @param tableName 表名
 * @param records 向量记录数组
 */
export async function storeVectorsBatch(
  tableName: 'wiki_vectors' | 'memory_vectors',
  records: Array<Omit<VectorRecord, 'id'> & { id?: string }>
): Promise<string[]> {
  const ids: string[] = []
  for (const record of records) {
    ids.push(await storeVector(tableName, record))
  }
  return ids
}

// ─── 向量搜索 ───

/**
 * 语义搜索：在指定表中搜索最相似的向量
 *
 * @param tableName 表名
 * @param queryEmbedding 查询向量
 * @param options 搜索选项
 * @returns 搜索结果数组，按相似度降序
 */
export async function searchVectors(
  tableName: 'wiki_vectors' | 'memory_vectors',
  queryEmbedding: Float32Array,
  options: {
    /** 返回结果数量（默认 20） */
    topK?: number
    /** 额外过滤条件 SQL */
    filterSQL?: string
    /** 过滤参数 */
    filterParams?: unknown[]
    /** 关联的内容列（用于返回内容） */
    contentJoin?: {
      table: string
      foreignKey: string
      contentColumn: string
    }
    /** 候选向量加载上限（默认 2000） */
    candidateLimit?: number
  } = {}
): Promise<SearchResult[]> {
  const { topK = 20, filterSQL, filterParams = [], contentJoin, candidateLimit = 2000 } = options

  // 1. 加载候选向量（带预过滤）
  let sql = `SELECT v.id, v.chunk_id, v.embedding, v.model, v.dimension, v.norm`
  if (contentJoin) {
    sql += `, c.${contentJoin.contentColumn} as content`
  }
  sql += ` FROM ${tableName} v`
  if (contentJoin) {
    sql += ` JOIN ${contentJoin.table} c ON v.chunk_id = c.${contentJoin.foreignKey}`
  }
  if (filterSQL) {
    sql += ` WHERE ${filterSQL}`
  }
  sql += ` LIMIT ${candidateLimit}` // 候选向量上限（默认 2000）

  const rows = await query(sql, filterParams) as Array<{
    id: string
    chunk_id: string
    embedding: Buffer
    model: string
    dimension: number
    norm: number
    content?: string
  }>

  if (rows.length === 0) return []

  // 2. 计算余弦相似度
  const dimension = rows[0].dimension
  const scored = rows.map(row => {
    const vec = bufferToFloat32(row.embedding, dimension)
    const score = cosineSimilarity(queryEmbedding, vec)
    return {
      chunkId: row.chunk_id,
      score,
      content: row.content || '',
      metadata: { model: row.model, norm: row.norm },
    }
  })

  // 3. 排序取 Top-K
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

/**
 * 一步到位的语义搜索：生成查询向量 + 搜索
 */
export async function semanticSearch(
  queryText: string,
  tableName: 'wiki_vectors' | 'memory_vectors',
  options: {
    topK?: number
    filterSQL?: string
    filterParams?: unknown[]
    contentJoin?: { table: string; foreignKey: string; contentColumn: string }
    embeddingConfig?: Partial<EmbeddingConfig>
  } = {}
): Promise<SearchResult[]> {
  const queryEmbedding = await generateEmbedding(queryText, options.embeddingConfig)
  return searchVectors(tableName, queryEmbedding, options)
}

// ─── 混合搜索 (FTS5 + Vector) ───

export interface HybridSearchResult {
  chunkId: string
  content: string
  ftsScore: number
  vectorScore: number
  /** RRF 综合分数 */
  hybridScore: number
  source: 'fts' | 'vector' | 'both'
  metadata: Record<string, unknown>
}

/**
 * 混合搜索：FTS5 关键词搜索 + 向量语义搜索 → RRF 融合排序
 *
 * @param queryText 查询文本
 * @param options 搜索选项
 * @returns 融合排序后的结果
 */
export async function hybridSearch(
  queryText: string,
  options: {
    /** FTS 搜索结果数量（默认 30） */
    ftsLimit?: number
    /** 向量搜索结果数量（默认 20） */
    vectorLimit?: number
    /** 最终返回数量（默认 10） */
    topK?: number
    /** RRF 参数 k（默认 60） */
    rrfK?: number
    /** FTS 权重（默认 0.4） */
    ftsWeight?: number
    /** 向量权重（默认 0.6） */
    vectorWeight?: number
    /** 额外过滤 */
    filterSQL?: string
    filterParams?: unknown[]
    embeddingConfig?: Partial<EmbeddingConfig>
  } = {}
): Promise<HybridSearchResult[]> {
  const {
    ftsLimit = 30,
    vectorLimit = 20,
    topK = 10,
    rrfK = 60,
    ftsWeight = 0.4,
    vectorWeight = 0.6,
    filterSQL,
    filterParams = [],
    embeddingConfig,
  } = options

  // 并行执行 FTS 和向量搜索
  const [ftsResults, vectorResults] = await Promise.allSettled([
    ftsSearchChunks(queryText, ftsLimit, filterSQL, filterParams),
    semanticSearch(queryText, 'wiki_vectors', {
      topK: vectorLimit,
      filterSQL,
      filterParams,
      contentJoin: {
        table: 'wiki_chunks',
        foreignKey: 'id',
        contentColumn: 'content',
      },
      embeddingConfig,
    }),
  ])

  // FTS 结果
  const ftsHits: Map<string, { content: string; rank: number; score: number }> = new Map()
  if (ftsResults.status === 'fulfilled') {
    ftsResults.value.forEach((hit, idx) => {
      ftsHits.set(hit.chunkId, {
        content: hit.content,
        rank: idx + 1,
        score: hit.score,
      })
    })
  }

  // 向量搜索结果
  const vecHits: Map<string, { content: string; rank: number; score: number }> = new Map()
  if (vectorResults.status === 'fulfilled') {
    vectorResults.value.forEach((hit, idx) => {
      vecHits.set(hit.chunkId, {
        content: hit.content,
        rank: idx + 1,
        score: hit.score,
      })
    })
  }

  // RRF 融合
  const allChunkIds = new Set([...ftsHits.keys(), ...vecHits.keys()])
  const merged: HybridSearchResult[] = []

  for (const chunkId of allChunkIds) {
    const fts = ftsHits.get(chunkId)
    const vec = vecHits.get(chunkId)

    const ftsRRF = fts ? 1 / (rrfK + fts.rank) : 0
    const vecRRF = vec ? 1 / (rrfK + vec.rank) : 0
    const hybridScore = ftsWeight * ftsRRF + vectorWeight * vecRRF

    merged.push({
      chunkId,
      content: fts?.content || vec?.content || '',
      ftsScore: fts?.score || 0,
      vectorScore: vec?.score || 0,
      hybridScore,
      source: fts && vec ? 'both' : fts ? 'fts' : 'vector',
      metadata: {},
    })
  }

  merged.sort((a, b) => b.hybridScore - a.hybridScore)
  return merged.slice(0, topK)
}

/** FTS5 搜索 wiki_chunks（含改进 LIKE 回退） */
async function ftsSearchChunks(
  queryText: string,
  limit: number,
  filterSQL?: string,
  filterParams: unknown[] = []
): Promise<Array<{ chunkId: string; content: string; score: number }>> {
  // 检测是否包含中文字符 — FTS5 对中文支持差，直接跳过
  const hasChinese = /[\u4e00-\u9fff]/.test(queryText)

  if (!hasChinese) {
    try {
      const ftsQuery = buildFtsQuery(queryText, 6)
      let sql = `
        SELECT c.id as chunk_id, c.content, f.rank as score
        FROM wiki_chunks_fts f
        JOIN wiki_chunks c ON f.rowid = c.rowid
        WHERE wiki_chunks_fts MATCH ?
      `
      const params: unknown[] = [ftsQuery]

      if (filterSQL) {
        sql += ` AND ${filterSQL}`
        params.push(...filterParams)
      }

      sql += ` ORDER BY f.rank DESC LIMIT ?`
      params.push(limit)

      const rows = await query(sql, params) as Array<{ chunk_id: string; content: string; score: number }>
      if (rows.length > 0) {
        return rows.map(r => ({
          chunkId: r.chunk_id,
          content: r.content,
          score: r.score,
        }))
      }
    } catch { /* FTS 失败，走 LIKE 回退 */ }
  }

  // LIKE 回退 — 改进的中文关键词搜索
  try {
    const terms = extractSearchTerms(queryText, { maxTerms: 12 })
    if (terms.length === 0) return []

    const conditions = terms.slice(0, 12).map(() => 'content LIKE ?')
    const params: unknown[] = terms.slice(0, 12).map(t => `%${t}%`)

    let sql = `SELECT id as chunk_id, content, 0 as score FROM wiki_chunks WHERE (${conditions.join(' OR ')})`
    if (filterSQL) {
      sql += ` AND ${filterSQL}`
      params.push(...filterParams)
    }
    sql += ` LIMIT ?`
    params.push(Math.max(limit * 4, 50))

    const rows = await query(sql, params) as Array<{ chunk_id: string; content: string; score: number }>
    return rows
      .map(r => ({
        chunkId: r.chunk_id,
        content: r.content,
        score: terms.reduce((sum, term) => sum + countOccurrences(r.content || '', term), 0),
      }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  } catch {
    return []
  }
}

// ─── 向量管理 ───

/** 删除关联向量 */
export async function deleteVectorsByChunkId(
  tableName: 'wiki_vectors' | 'memory_vectors',
  chunkId: string
): Promise<number> {
  await run(`DELETE FROM ${tableName} WHERE chunk_id = ?`, [chunkId])
  const result = await query('SELECT changes() as c') as Array<{ c: number }>
  return result[0]?.c || 0
}

/** 获取向量统计信息 */
export async function getVectorStats(tableName: 'wiki_vectors' | 'memory_vectors'): Promise<{
  total: number
  models: Record<string, number>
  avgNorm: number
}> {
  try {
    const totalRow = await query(`SELECT COUNT(*) as total FROM ${tableName}`) as Array<{ total: number }>
    const modelRows = await query(
      `SELECT model, COUNT(*) as count FROM ${tableName} GROUP BY model`
    ) as Array<{ model: string; count: number }>
    const normRow = await query(
      `SELECT AVG(norm) as avg_norm FROM ${tableName}`
    ) as Array<{ avg_norm: number }>

    const models: Record<string, number> = {}
    for (const row of modelRows) {
      models[row.model] = row.count
    }

    return {
      total: totalRow[0]?.total || 0,
      models,
      avgNorm: normRow[0]?.avg_norm || 0,
    }
  } catch {
    return { total: 0, models: {}, avgNorm: 0 }
  }
}
