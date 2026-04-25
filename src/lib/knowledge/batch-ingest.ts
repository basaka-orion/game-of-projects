/**
 * Batch Ingest — 6000+ 篇文章批量摄取管道
 *
 * 状态机：pending → chunking → vectorizing → compiled → done
 * 特性：
 * - 并发控制：同时最多 3 个 LLM/Embedding 调用
 * - 断点续传：重启后从断点继续
 * - 进度追踪：写入 wiki_activity_log
 */

import { query, run } from '../db/repository'
import { generateId } from '../db/schema'
import { chunkText, type TextChunk } from './chunker'
import { storeVector, generateEmbedding } from './vector-store'
import { ingestSource, type IngestParams, type IngestResult } from './ingest'
import { LLMConfig } from '../ai/provider'

// ─── 接口 ───

export interface BatchIngestJob {
  id: string
  totalSources: number
  processed: number
  chunked: number
  vectorized: number
  compiled: number
  errors: number
  status: 'running' | 'paused' | 'completed' | 'error'
}

export interface BatchIngestProgress {
  phase: 'scanning' | 'ingesting' | 'chunking' | 'vectorizing' | 'done'
  current: number
  total: number
  message: string
  errorsCount: number
}

// ─── 常量 ───

/** 最大并发 LLM 调用数 */
const MAX_CONCURRENT = 3

/** 每批处理的源数量 */
const BATCH_SIZE = 50

// ─── 主入口 ───

/**
 * 批量摄取所有未处理的源
 *
 * 用于初次导入或重新处理大量文章
 */
export async function batchIngestPending(
  llmConfig: LLMConfig,
  onProgress?: (progress: BatchIngestProgress) => void
): Promise<BatchIngestJob> {
  const job: BatchIngestJob = {
    id: generateId(),
    totalSources: 0,
    processed: 0,
    chunked: 0,
    vectorized: 0,
    compiled: 0,
    errors: 0,
    status: 'running',
  }

  // 1. 扫描未处理的源
  onProgress?.({ phase: 'scanning', current: 0, total: 0, message: '扫描未处理源...', errorsCount: 0 })

  const pendingSources = await query(
    `SELECT id, title, content, raw_content, source_type, url, file_path, author, metadata_json
     FROM wiki_sources
     WHERE status = 'pending' OR content = ''
     ORDER BY created_at ASC
     LIMIT 10000`
  ) as Array<Record<string, unknown>>

  job.totalSources = pendingSources.length

  if (pendingSources.length === 0) {
    job.status = 'completed'
    onProgress?.({ phase: 'done', current: 0, total: 0, message: '无待处理源', errorsCount: 0 })
    return job
  }

  onProgress?.({ phase: 'ingesting', current: 0, total: job.totalSources, message: `开始处理 ${job.totalSources} 个源...`, errorsCount: 0 })

  // 2. 分批处理
  for (let i = 0; i < pendingSources.length; i += BATCH_SIZE) {
    if (job.status === 'paused') break

    const batch = pendingSources.slice(i, i + BATCH_SIZE)

    // 并发处理（最多 MAX_CONCURRENT 同时执行）
    const results = await processBatchConcurrent(batch, llmConfig, MAX_CONCURRENT)

    for (const result of results) {
      job.processed++
      if (result.error) {
        job.errors++
      } else {
        if (result.chunked) job.chunked++
        if (result.vectorized) job.vectorized++
      }
    }

    onProgress?.({
      phase: 'ingesting',
      current: job.processed,
      total: job.totalSources,
      message: `已处理 ${job.processed}/${job.totalSources}`,
      errorsCount: job.errors,
    })

    // 记录进度到 activity log
    try {
      const logId = generateId()
      await run(
        `INSERT INTO wiki_activity_log (id, action, target_type, target_id, description, created_at)
         VALUES (?, 'ingest', 'source', ?, ?, datetime('now','localtime'))`,
        [logId, `batch_${job.id}`, `批量摄取进度: ${job.processed}/${job.totalSources}, 错误: ${job.errors}`]
      )
    } catch { /* non-critical */ }
  }

  job.status = job.errors === job.totalSources ? 'error' : 'completed'
  onProgress?.({
    phase: 'done',
    current: job.processed,
    total: job.totalSources,
    message: `完成: ${job.processed} 处理, ${job.chunked} 分块, ${job.vectorized} 向量化, ${job.errors} 错误`,
    errorsCount: job.errors,
  })

  return job
}

/**
 * 批量分块已有源
 *
 * 对 wiki_sources 中已有内容但未分块的源进行分块
 */
export async function batchChunkSources(
  onProgress?: (progress: BatchIngestProgress) => void
): Promise<{ chunked: number; total: number }> {
  // 找到没有对应 chunk 的源
  const unchunked = await query(
    `SELECT s.id, s.content, s.title
     FROM wiki_sources s
     LEFT JOIN wiki_chunks c ON c.source_id = s.id
     WHERE c.id IS NULL AND s.content != '' AND LENGTH(s.content) > 50
     LIMIT 5000`
  ) as Array<{ id: string; content: string; title: string }>

  let chunked = 0

  onProgress?.({ phase: 'chunking', current: 0, total: unchunked.length, message: `开始分块 ${unchunked.length} 个源...`, errorsCount: 0 })

  for (let i = 0; i < unchunked.length; i++) {
    const source = unchunked[i]
    try {
      const chunks = chunkText(source.content, source.title)

      for (const chunk of chunks) {
        const chunkId = generateId()
        await run(
          `INSERT OR IGNORE INTO wiki_chunks (id, source_id, chunk_index, content, token_count, header_breadcrumb, overlap_prev, overlap_next, metadata_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', datetime('now','localtime'))`,
          [chunkId, source.id, chunk.index, chunk.content, chunk.tokenCount, chunk.headerBreadcrumb, chunk.overlapPrev, chunk.overlapNext]
        )
      }

      chunked++

      if (i % 100 === 0) {
        onProgress?.({ phase: 'chunking', current: i + 1, total: unchunked.length, message: `已分块 ${i + 1}/${unchunked.length}`, errorsCount: 0 })
      }
    } catch { /* skip */ }
  }

  return { chunked, total: unchunked.length }
}

/**
 * 批量向量化已有块
 *
 * 为 wiki_chunks 中没有对应向量的块生成 embedding
 */
export async function batchVectorizeChunks(
  onProgress?: (progress: BatchIngestProgress) => void
): Promise<{ vectorized: number; total: number; errors: number }> {
  // 找到没有对应向量的块
  const unvectorized = await query(
    `SELECT c.id, c.content
     FROM wiki_chunks c
     LEFT JOIN wiki_vectors v ON v.chunk_id = c.id
     WHERE v.id IS NULL AND c.content != ''
     LIMIT 5000`
  ) as Array<{ id: string; content: string }>

  let vectorized = 0
  let errors = 0

  onProgress?.({ phase: 'vectorizing', current: 0, total: unvectorized.length, message: `开始向量化 ${unvectorized.length} 个块...`, errorsCount: 0 })

  // 控制并发
  for (let i = 0; i < unvectorized.length; i++) {
    const chunk = unvectorized[i]
    try {
      const embedding = await generateEmbedding(chunk.content)
      const norm = Math.sqrt(Array.from(embedding).reduce((sum, v) => sum + v * v, 0))

      await storeVector('wiki_vectors', {
        chunkId: chunk.id,
        embedding,
        model: 'embedding-3',
        dimension: embedding.length,
        norm,
      })

      vectorized++
    } catch {
      errors++
    }

    if (i % 50 === 0) {
      onProgress?.({ phase: 'vectorizing', current: i + 1, total: unvectorized.length, message: `已向量化 ${i + 1}/${unvectorized.length}`, errorsCount: errors })
    }
  }

  return { vectorized, total: unvectorized.length, errors }
}

// ─── 内部函数 ───

interface BatchItemResult {
  sourceId: string
  error?: string
  chunked: boolean
  vectorized: boolean
}

/** 并发处理一批源 */
async function processBatchConcurrent(
  batch: Array<Record<string, unknown>>,
  llmConfig: LLMConfig,
  concurrency: number
): Promise<BatchItemResult[]> {
  const results: BatchItemResult[] = []

  // 简单的并发池
  const queue = [...batch]
  const workers: Promise<void>[] = []

  for (let w = 0; w < concurrency; w++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const item = queue.shift()
        if (!item) break

        try {
          const result = await processOneSource(item, llmConfig)
          results.push(result)
        } catch (err) {
          results.push({
            sourceId: item.id as string,
            error: String(err),
            chunked: false,
            vectorized: false,
          })
        }
      }
    })())
  }

  await Promise.all(workers)
  return results
}

/** 处理单个源 */
async function processOneSource(
  source: Record<string, unknown>,
  llmConfig: LLMConfig
): Promise<BatchItemResult> {
  const result: BatchItemResult = {
    sourceId: source.id as string,
    chunked: false,
    vectorized: false,
  }

  // 1. 如果内容为空，标记为失败
  const content = (source.content as string) || (source.raw_content as string) || ''
  if (!content || content.trim().length < 10) {
    await run("UPDATE wiki_sources SET status = 'failed', error_message = '内容为空' WHERE id = ?", [source.id])
    result.error = '内容为空'
    return result
  }

  // 2. 标记为 processing
  await run("UPDATE wiki_sources SET status = 'processing' WHERE id = ?", [source.id])

  // 3. 分块
  try {
    const title = (source.title as string) || ''
    const chunks = chunkText(content, title)

    for (const chunk of chunks) {
      const chunkId = generateId()
      await run(
        `INSERT OR IGNORE INTO wiki_chunks (id, source_id, chunk_index, content, token_count, header_breadcrumb, overlap_prev, overlap_next, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', datetime('now','localtime'))`,
        [chunkId, source.id, chunk.index, chunk.content, chunk.tokenCount, chunk.headerBreadcrumb, chunk.overlapPrev, chunk.overlapNext]
      )
    }

    result.chunked = true
  } catch (err) {
    result.error = `分块失败: ${String(err)}`
    return result
  }

  // 4. 向量化（第一个块作为代表，其余异步）
  try {
    const chunks = await query(
      'SELECT id, content FROM wiki_chunks WHERE source_id = ? ORDER BY chunk_index ASC',
      [source.id]
    ) as Array<{ id: string; content: string }>

    // 向量化所有块（控制并发，每批 5 个）
    const BATCH_SIZE = 5
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE)
      await Promise.allSettled(batch.map(async (chunk) => {
        try {
          const embedding = await generateEmbedding(chunk.content)
          const norm = Math.sqrt(Array.from(embedding).reduce((sum, v) => sum + v * v, 0))

          await storeVector('wiki_vectors', {
            chunkId: chunk.id,
            embedding,
            model: 'embedding-3',
            dimension: embedding.length,
            norm,
          })
          result.vectorized = true
        } catch { /* 单个块失败不影响整体 */ }
      }))
    }
  } catch { /* 向量化失败不影响整体 */ }

  // 5. 标记为 processed
  await run("UPDATE wiki_sources SET status = 'processed' WHERE id = ?", [source.id])

  return result
}

// ─── 向量重建工具 ───

/** 重建缺失向量 — 为没有 embedding 的 wiki_chunks 补建向量 */
export async function rebuildMissingVectors(): Promise<{ total: number; created: number; errors: number }> {
  const chunks = await query<{ id: string; content: string }>(
    `SELECT c.id, c.content FROM wiki_chunks c
     LEFT JOIN wiki_vectors v ON v.chunk_id = c.id
     WHERE v.id IS NULL AND c.content IS NOT NULL AND LENGTH(c.content) > 10`
  )

  let created = 0
  let errors = 0
  const BATCH_SIZE = 5

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE)
    await Promise.allSettled(batch.map(async (chunk) => {
      try {
        const embedding = await generateEmbedding(chunk.content)
        const norm = Math.sqrt(Array.from(embedding).reduce((sum, v) => sum + v * v, 0))
        await storeVector('wiki_vectors', {
          chunkId: chunk.id,
          embedding,
          model: 'embedding-3',
          dimension: embedding.length,
          norm,
        })
        created++
      } catch {
        errors++
      }
    }))
  }

  return { total: chunks.length, created, errors }
}
