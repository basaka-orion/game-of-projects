/**
 * Forge — 知识锻造门槛
 *
 * 核心原则：只有经过知识库"锻造"（编译 + Lint + 确认）的知识才能进入记忆
 *
 * 锻造流程：
 * 1. 新知识写入海马体抽屉（无损生肉）
 * 2. 后台编译器编译 → Wiki 页面
 * 3. Lint 检测矛盾/重复/低质量
 * 4. 确认流程：
 *    - 置信度 >= 0.8 且重要性 >= 70 → 自动确认
 *    - 其他 → 标记为 pending_confirmation
 * 5. 确认后写入记忆宫殿 + Agent Memory
 *
 * 灵感来源：MemPalace 的"逐字存储" + Karpathy 的"编译一次"理念
 */

import { query, run } from '../db/repository'
import { generateId } from '../db/schema'
import { LLMConfig, chatCompletion } from '../ai/provider'

// ─── 接口 ───

export interface ForgeCandidate {
  /** 抽屉 ID */
  drawerId: string
  /** 知识内容 */
  content: string
  /** 来源 */
  source: string
  /** 编译后的 Wiki 页面 ID（如果有） */
  pageId?: string
  /** 置信度 (0-1) */
  confidence: number
  /** 重要性 (0-100) */
  importance: number
  /** 锻造状态 */
  forgeStatus: 'raw' | 'compiled' | 'linted' | 'confirmed' | 'rejected'
  /** Lint 发现的问题 */
  lintIssues: string[]
}

export interface ForgeResult {
  /** 处理的候选数 */
  processed: number
  /** 自动确认数 */
  autoConfirmed: number
  /** 待确认数 */
  pendingConfirmation: number
  /** 拒绝数 */
  rejected: number
  /** 写入记忆数 */
  memoriesCreated: number
}

// ─── 常量 ───

/** 自动确认阈值：置信度 */
const AUTO_CONFIRM_CONFIDENCE = 0.8

/** 自动确认阈值：重要性 */
const AUTO_CONFIRM_IMPORTANCE = 70

/** 拒绝阈值：置信度低于此值直接拒绝 */
const REJECT_CONFIDENCE = 0.3

// ─── 核心锻造流程 ───

/**
 * 处理锻造队列
 *
 * 检查所有已编译但未确认的抽屉，
 * 执行 Lint 检测后决定自动确认/待确认/拒绝
 */
export async function processForgeQueue(llmConfig: LLMConfig): Promise<ForgeResult> {
  const result: ForgeResult = {
    processed: 0,
    autoConfirmed: 0,
    pendingConfirmation: 0,
    rejected: 0,
    memoriesCreated: 0,
  }

  // 1. 获取已编译但未锻造的抽屉
  const compiledDrawers = await query(
    `SELECT d.id, d.raw_content, d.title, d.source_type, d.compiled_page_id,
            p.confidence, p.importance, p.content as page_content
     FROM mempalace_drawers d
     LEFT JOIN wiki_pages p ON d.compiled_page_id = p.id
     WHERE d.is_compiled = 1 AND d.metadata_json NOT LIKE '%forge_status%'
     ORDER BY d.created_at ASC
     LIMIT 50`
  ) as Array<{
    id: string
    raw_content: string
    title: string
    source_type: string
    compiled_page_id: string
    confidence: number
    importance: number
    page_content: string
  }>

  if (compiledDrawers.length === 0) return result

  // 2. 逐个处理
  for (const drawer of compiledDrawers) {
    result.processed++

    const confidence = drawer.confidence || 0.5
    const importance = drawer.importance || 50

    // Lint 快速检测
    const lintIssues = quickLintCheck(drawer.raw_content, drawer.page_content)

    // 决策
    let forgeStatus: ForgeCandidate['forgeStatus']
    if (confidence < REJECT_CONFIDENCE) {
      forgeStatus = 'rejected'
      result.rejected++
    } else if (confidence >= AUTO_CONFIRM_CONFIDENCE && importance >= AUTO_CONFIRM_IMPORTANCE && lintIssues.length === 0) {
      forgeStatus = 'confirmed'
      result.autoConfirmed++
    } else {
      forgeStatus = 'linted'
      result.pendingConfirmation++
    }

    // 更新抽屉元数据
    try {
      const metadata = { forge_status: forgeStatus, forge_lint: lintIssues, forged_at: new Date().toISOString() }
      await run(
        "UPDATE mempalace_drawers SET metadata_json = ?, updated_at = datetime('now','localtime') WHERE id = ?",
        [JSON.stringify(metadata), drawer.id]
      )
    } catch { /* non-critical */ }

    // 如果确认，写入记忆
    if (forgeStatus === 'confirmed') {
      const memoriesCreated = await confirmAndWriteToMemory(drawer.id, drawer.raw_content, drawer.title, drawer.source_type, importance)
      result.memoriesCreated += memoriesCreated
    }
  }

  return result
}

/**
 * 手动确认一条知识
 *
 * @param drawerId 抽屉 ID
 * @param force 是否强制确认（跳过 Lint）
 */
export async function manuallyConfirm(drawerId: string, force = false): Promise<boolean> {
  const drawer = await query(
    'SELECT id, raw_content, title, source_type, compiled_page_id, metadata_json FROM mempalace_drawers WHERE id = ?',
    [drawerId]
  ) as Array<{
    id: string
    raw_content: string
    title: string
    source_type: string
    compiled_page_id: string
    metadata_json: string
  }>

  if (drawer.length === 0) return false

  // 更新为已确认
  let metadata: Record<string, unknown> = {}
  try {
    metadata = JSON.parse(drawer[0].metadata_json || '{}')
  } catch { /* ignore */ }

  metadata.forge_status = 'confirmed'
  metadata.confirmed_at = new Date().toISOString()
  metadata.confirmed_by = 'manual'

  await run(
    "UPDATE mempalace_drawers SET metadata_json = ?, updated_at = datetime('now','localtime') WHERE id = ?",
    [JSON.stringify(metadata), drawerId]
  )

  // 写入记忆
  const importance = (metadata.importance as number) || 60
  await confirmAndWriteToMemory(drawerId, drawer[0].raw_content, drawer[0].title, drawer[0].source_type, importance)

  return true
}

/**
 * 拒绝一条知识
 *
 * @param drawerId 抽屉 ID
 * @param reason 拒绝原因
 */
export async function rejectKnowledge(drawerId: string, reason: string): Promise<void> {
  const drawer = await query('SELECT metadata_json FROM mempalace_drawers WHERE id = ?', [drawerId]) as Array<{ metadata_json: string }>
  if (drawer.length === 0) return

  let metadata: Record<string, unknown> = {}
  try {
    metadata = JSON.parse(drawer[0].metadata_json || '{}')
  } catch { /* ignore */ }

  metadata.forge_status = 'rejected'
  metadata.rejected_at = new Date().toISOString()
  metadata.reject_reason = reason

  await run(
    "UPDATE mempalace_drawers SET metadata_json = ?, updated_at = datetime('now','localtime') WHERE id = ?",
    [JSON.stringify(metadata), drawerId]
  )
}

// ─── 查询 ───

/** 获取待确认的知识列表 */
export async function getPendingConfirmations(limit = 20): Promise<ForgeCandidate[]> {
  const rows = await query(
    `SELECT d.id, d.raw_content, d.title, d.source_type, d.compiled_page_id, d.metadata_json,
            p.confidence, p.importance
     FROM mempalace_drawers d
     LEFT JOIN wiki_pages p ON d.compiled_page_id = p.id
     WHERE d.is_compiled = 1 AND d.metadata_json LIKE '%"forge_status":"linted"%'
     ORDER BY p.importance DESC
     LIMIT ?`,
    [limit]
  ) as Array<Record<string, unknown>>

  return rows.map(row => {
    let metadata: Record<string, unknown> = {}
    try { metadata = JSON.parse((row.metadata_json as string) || '{}') } catch { /* ignore */ }

    return {
      drawerId: row.id as string,
      content: (row.raw_content as string).slice(0, 300),
      source: row.source_type as string,
      pageId: row.compiled_page_id as string || undefined,
      confidence: (row.confidence as number) || 0.5,
      importance: (row.importance as number) || 50,
      forgeStatus: (metadata.forge_status as ForgeCandidate['forgeStatus']) || 'compiled',
      lintIssues: (metadata.forge_lint as string[]) || [],
    }
  })
}

/** 获取锻造统计 */
export async function getForgeStats(): Promise<{
  raw: number
  compiled: number
  linted: number
  confirmed: number
  rejected: number
}> {
  const counts = { raw: 0, compiled: 0, linted: 0, confirmed: 0, rejected: 0 }

  try {
    const total = await query('SELECT COUNT(*) as cnt FROM mempalace_drawers') as Array<{ cnt: number }>
    const uncompiled = await query('SELECT COUNT(*) as cnt FROM mempalace_drawers WHERE is_compiled = 0') as Array<{ cnt: number }>

    counts.raw = uncompiled[0]?.cnt || 0
    counts.compiled = (total[0]?.cnt || 0) - counts.raw

    // 通过 metadata_json 中的 forge_status 统计
    const confirmed = await query(
      "SELECT COUNT(*) as cnt FROM mempalace_drawers WHERE metadata_json LIKE '%forge_status\":\"confirmed\"%'"
    ) as Array<{ cnt: number }>
    const rejected = await query(
      "SELECT COUNT(*) as cnt FROM mempalace_drawers WHERE metadata_json LIKE '%forge_status\":\"rejected\"%'"
    ) as Array<{ cnt: number }>
    const linted = await query(
      "SELECT COUNT(*) as cnt FROM mempalace_drawers WHERE metadata_json LIKE '%forge_status\":\"linted\"%'"
    ) as Array<{ cnt: number }>

    counts.confirmed = confirmed[0]?.cnt || 0
    counts.rejected = rejected[0]?.cnt || 0
    counts.linted = linted[0]?.cnt || 0
  } catch { /* table might not exist */ }

  return counts
}

// ─── 内部函数 ───

/** 快速 Lint 检查（不调用 LLM） */
function quickLintCheck(rawContent: string, pageContent: string): string[] {
  const issues: string[] = []

  // 内容过短
  if (rawContent.length < 20) {
    issues.push('content_too_short')
  }

  // 重复内容检测（简单）
  if (rawContent.length > 100) {
    const sentences = rawContent.split(/[。！？.!?]/).filter(s => s.trim().length > 10)
    const uniqueSentences = new Set(sentences.map(s => s.trim()))
    if (sentences.length > 3 && uniqueSentences.size < sentences.length * 0.7) {
      issues.push('high_repetition')
    }
  }

  // 编译页面为空
  if (!pageContent || pageContent.trim().length === 0) {
    issues.push('empty_compiled_page')
  }

  return issues
}

/** 确认后写入记忆宫殿 */
async function confirmAndWriteToMemory(
  drawerId: string,
  content: string,
  title: string,
  sourceType: string,
  importance: number
): Promise<number> {
  let created = 0

  try {
    // 1. 写入记忆宫殿 (memory_items)
    const memoryId = generateId()
    // 找到合适的房间（agent_knowledge 或创建）
    const rooms = await query("SELECT id FROM memory_rooms WHERE room_type = 'custom' OR name = 'Agent Knowledge' LIMIT 1") as Array<{ id: string }>
    const roomId = rooms[0]?.id || 'room_innovation'

    await run(
      `INSERT INTO memory_items (id, room_id, type, content, source, importance, metadata_json, created_at, updated_at)
       VALUES (?, ?, 'knowledge', ?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))`,
      [
        memoryId,
        roomId,
        content.slice(0, 2000),
        `forge:${sourceType}`,
        Math.min(importance, 100),
        JSON.stringify({ drawerId, title, forgedAt: new Date().toISOString() }),
      ]
    )
    created++

    // 2. 写入 Agent Memory (agent_memories)
    try {
      await run(
        `INSERT INTO agent_memories (agent_id, entry, created_at) VALUES ('general', ?, datetime('now','localtime'))`,
        [`[锻造确认] ${title}: ${content.slice(0, 200)}`]
      )
    } catch { /* non-critical */ }

    // 3. 更新抽屉元数据
    const existingMeta = await query('SELECT metadata_json FROM mempalace_drawers WHERE id = ?', [drawerId]) as Array<{ metadata_json: string }>
    let metadata: Record<string, unknown> = {}
    try { metadata = JSON.parse(existingMeta[0]?.metadata_json || '{}') } catch { /* ignore */ }
    metadata.memory_item_id = memoryId
    metadata.memorized_at = new Date().toISOString()

    await run(
      "UPDATE mempalace_drawers SET metadata_json = ?, updated_at = datetime('now','localtime') WHERE id = ?",
      [JSON.stringify(metadata), drawerId]
    )
  } catch (err) {
    console.error('[Forge] 写入记忆失败:', err)
  }

  return created
}
