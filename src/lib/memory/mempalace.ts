/**
 * MemPalace — 三层记忆宫殿统一入口（Wing → Hall → Drawer）
 *
 * 完全移植自 mempalace 项目架构：
 * - Palace: 整个记忆宫殿
 * - Wing: 翼楼（按主题大类划分）
 * - Hall: 大厅（翼楼内的子分类）
 * - Drawer: 抽屉（无损原始记忆条目）
 *
 * 数据层：mempalace_drawers 表（wing/hall/room 三级分类）
 * 索引层：memory_closet (AAAK 格式) + FTS5
 * 回忆层：recall.ts (FTS5 + Closet + Vector 三重检索)
 */
import { query, run } from '../db/repository'
import { generateId } from '../db/schema'
import type { Drawer } from '../knowledge/drawer'
import { createDrawer, getDrawersByWing, searchDrawers, getDrawerStats, getAllDrawers } from '../knowledge/drawer'

// ─── 接口 ───

export interface WingInfo {
  name: string
  icon: string
  description: string
  hallCount: number
  drawerCount: number
}

export interface HallInfo {
  wing: string
  name: string
  drawerCount: number
}

export interface PalaceOverview {
  totalDrawers: number
  totalWings: number
  totalHalls: number
  uncompiledCount: number
  wings: WingInfo[]
}

// ─── 预设翼楼 ───

const DEFAULT_WINGS: Record<string, { icon: string; description: string }> = {
  'worldview': { icon: '🌍', description: '对社会、文明、技术与时代的长期世界模型' },
  'method': { icon: '🧭', description: '学习法、思考法、决策法、工作流' },
  'creation': { icon: '✨', description: '创意、项目、作品、实验提案' },
  'dialogue': { icon: '🗣️', description: '关键问答、对撞、转折性会话' },
  'profiling': { icon: '🧬', description: '画像工坊结果、阶段信号与指导方向' },
  'wishes': { icon: '🫧', description: '长期愿望、未竟心愿、未来召唤' },
  'openbasaka': { icon: '◈', description: '个人智能系统、记忆宫殿与代理协作演化' },
  'experience': { icon: '⚔️', description: '实战经历、推演记录、项目评估' },
  'knowledge': { icon: '📚', description: '学习笔记、技术文档、外部知识' },
  'insight': { icon: '💡', description: '灵感、洞察、直觉判断' },
  'identity': { icon: '👑', description: 'Boss 偏好、行为模式、决策风格' },
  'emotion': { icon: '💭', description: '情绪记录、心理状态、反思' },
  'default': { icon: '📦', description: '未分类的记忆' },
}

// ─── Palace 总览 ───

/** 获取记忆宫殿全景概览 */
export async function getPalaceOverview(): Promise<PalaceOverview> {
  const stats = await getDrawerStats()

  // 获取所有翼楼信息
  const wingRows = await query<{ wing: string; cnt: number }>(
    'SELECT wing, COUNT(*) as cnt FROM mempalace_drawers GROUP BY wing ORDER BY cnt DESC'
  )

  // 获取所有大厅信息
  const hallRows = await query<{ wing: string; hall: string; cnt: number }>(
    'SELECT wing, hall, COUNT(*) as cnt FROM mempalace_drawers GROUP BY wing, hall'
  )

  const hallCountByWing = new Map<string, number>()
  for (const h of hallRows) {
    hallCountByWing.set(h.wing, (hallCountByWing.get(h.wing) || 0) + 1)
  }

  const wings: WingInfo[] = wingRows.map(w => ({
    name: w.wing,
    icon: DEFAULT_WINGS[w.wing]?.icon || '🏛️',
    description: DEFAULT_WINGS[w.wing]?.description || '',
    hallCount: hallCountByWing.get(w.wing) || 0,
    drawerCount: w.cnt,
  }))

  // 补充空翼楼
  for (const [name, meta] of Object.entries(DEFAULT_WINGS)) {
    if (!wings.find(w => w.name === name)) {
      wings.push({ name, icon: meta.icon, description: meta.description, hallCount: 0, drawerCount: 0 })
    }
  }

  return {
    totalDrawers: stats.totalDrawers,
    totalWings: wings.length,
    totalHalls: hallRows.length,
    uncompiledCount: stats.uncompiledCount,
    wings,
  }
}

// ─── Wing 操作 ───

/** 获取翼楼内的所有大厅 */
export async function getHalls(wing: string): Promise<HallInfo[]> {
  const rows = await query<{ hall: string; cnt: number }>(
    'SELECT hall, COUNT(*) as cnt FROM mempalace_drawers WHERE wing = ? GROUP BY hall ORDER BY cnt DESC',
    [wing]
  )
  return rows.map(r => ({ wing, name: r.hall, drawerCount: r.cnt }))
}

/** 获取大厅内的抽屉 */
export async function getHallDrawers(wing: string, hall: string, limit = 50): Promise<Drawer[]> {
  const rows = await query<Record<string, unknown>>(
    'SELECT * FROM mempalace_drawers WHERE wing = ? AND hall = ? ORDER BY created_at DESC LIMIT ?',
    [wing, hall, limit]
  )
  return rows.map(parseDrawerRow)
}

// ─── Drawer 快速写入 ───

/** 快速写入记忆（毫秒级，零 LLM） */
export async function memorize(params: {
  content: string
  title?: string
  wing?: string
  hall?: string
  room?: string
  source?: string
  sourceUrl?: string
  metadata?: Record<string, unknown>
  tags?: string[]
}): Promise<string> {
  // 自动推断翼楼（基于简单规则）
  const wing = params.wing || inferWing(params.content, params.source)
  const hall = params.hall || 'inbox'
  const room = params.room || 'inbox'

  return createDrawer({
    title: params.title || params.content.slice(0, 50),
    wing,
    hall,
    room,
    rawContent: params.content,
    sourceType: params.source || 'paste',
    sourceUrl: params.sourceUrl || '',
    metadata: params.metadata || {},
    tags: params.tags || [],
  })
}

/** 基于内容/来源推断翼楼 */
function inferWing(content: string, source?: string): string {
  if (source === 'self-nudge' || source === 'conversation') return 'experience'
  if (source === 'wiki-compiler') return 'knowledge'

  // 关键词推断
  const lc = content.toLowerCase()
  if (/技术|代码|api|bug|error|npm|python|react/i.test(lc)) return 'knowledge'
  if (/灵感|创意|想法|idea|假设/i.test(lc)) return 'insight'
  if (/情绪|感觉|压力|焦虑|开心/i.test(lc)) return 'emotion'
  if (/偏好|习惯|决策|风格/i.test(lc)) return 'identity'

  return 'experience'
}

// ─── 搜索 ───

/** 记忆宫殿全局搜索 */
export async function palaceSearch(queryText: string, limit = 10): Promise<Array<Drawer & { score: number }>> {
  return searchDrawers(queryText, limit)
}

// ─── 迁移工具 ───

/** 将旧 memory_items 迁移到 mempalace_drawers */
export async function migrateFromLegacy(): Promise<{ migrated: number; errors: string[] }> {
  const result = { migrated: 0, errors: [] as string[] }

  try {
    // 检查是否已迁移
    const existing = await query<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM mempalace_drawers WHERE source_type = \'migrated\''
    )
    if ((existing[0]?.cnt || 0) > 0) return result // 已迁移过

    // 获取所有旧记忆条目
    const items = await query<{
      id: string; room_id: string; type: string; content: string;
      source: string; importance: number; metadata_json: string;
      created_at: string; updated_at: string
    }>('SELECT * FROM memory_items ORDER BY created_at ASC')

    // 获取房间映射
    const rooms = await query<{ id: string; name: string; room_type: string }>(
      'SELECT id, name, room_type FROM memory_rooms'
    )
    const roomMap = new Map(rooms.map(r => [r.id, r]))

    for (const item of items) {
      try {
        const room = roomMap.get(item.room_id)
        const wing = mapRoomTypeToWing(room?.room_type || 'custom')
        const hall = room?.name || 'general'

        await run(
          `INSERT OR IGNORE INTO mempalace_drawers
           (id, title, wing, hall, room, raw_content, source_type, tags, is_compiled, metadata_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'migrated', ?, 0, ?, ?, ?)`,
          [
            `migrated_${item.id}`,
            item.content.slice(0, 100),
            wing,
            hall,
            item.room_id,
            item.content,
            JSON.stringify([item.type]),
            item.metadata_json || '{}',
            item.created_at,
            item.updated_at,
          ]
        )
        result.migrated++
      } catch (err) {
        result.errors.push(`${item.id}: ${String(err)}`)
      }
    }
  } catch (err) {
    result.errors.push(`Migration error: ${String(err)}`)
  }

  return result
}

/** 旧房间类型映射到新翼楼 */
function mapRoomTypeToWing(roomType: string): string {
  const mapping: Record<string, string> = {
    'war_room': 'experience',
    'boss': 'identity',
    'graveyard': 'experience',
    'innovation': 'insight',
    'timeline': 'experience',
    'knowledge_vault': 'knowledge',
    'custom': 'default',
  }
  return mapping[roomType] || 'default'
}

// ─── Row 解析 ───

function parseDrawerRow(r: Record<string, unknown>): Drawer {
  return {
    id: r.id as string,
    title: r.title as string || '',
    wing: r.wing as string || 'default',
    hall: r.hall as string || 'general',
    room: r.room as string || 'inbox',
    rawContent: r.raw_content as string || '',
    sourceType: r.source_type as string || 'paste',
    sourceUrl: r.source_url as string || '',
    filePath: r.file_path as string || '',
    folderPath: r.folder_path as string || '',
    author: r.author as string || '',
    language: r.language as string || 'zh',
    tags: JSON.parse((r.tags as string) || '[]'),
    isCompiled: !!(r.is_compiled as number),
    compiledPageId: r.compiled_page_id as string || '',
    metadata: JSON.parse((r.metadata_json as string) || '{}'),
    createdAt: r.created_at as string || '',
    updatedAt: r.updated_at as string || '',
  }
}

// ─── 重新导出旧接口（兼容层） ───

export { getAllDrawers, getDrawersByWing, getDrawerStats }
