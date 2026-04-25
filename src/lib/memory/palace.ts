/**
 * 记忆宫殿 — 预设房间 + CRUD
 */
import { query, run } from '../db/repository'
import { generateId } from '../db/schema'

export interface MemoryRoom {
  id: string
  name: string
  description: string
  icon: string
  roomType: string
  sortOrder: number
  createdAt: string
}

export interface MemoryItem {
  id: string
  roomId: string
  type: string
  content: string
  source: string
  importance: number
  accessCount: number
  metadataJson: string
  createdAt: string
  updatedAt: string
}

/** 预设房间定义 */
const DEFAULT_ROOMS: Omit<MemoryRoom, 'createdAt'>[] = [
  { id: 'room_war_archives', name: 'War Room Archives', description: '评估摘要与关键见解', icon: '⚔️', roomType: 'war_room', sortOrder: 0 },
  { id: 'room_boss_patterns', name: "Boss's Patterns", description: '行为模式与决策倾向', icon: '👑', roomType: 'boss', sortOrder: 1 },
  { id: 'room_graveyard', name: 'Project Graveyard', description: '放弃的项目及原因', icon: '💀', roomType: 'graveyard', sortOrder: 2 },
  { id: 'room_innovation', name: 'Innovation Lab', description: '混合创意和灵感', icon: '💡', roomType: 'innovation', sortOrder: 3 },
  { id: 'room_timeline', name: 'Timeline', description: '时间线记忆', icon: '📅', roomType: 'timeline', sortOrder: 4 },
]

/** 初始化预设房间（幂等） */
export async function initDefaultRooms(): Promise<void> {
  for (const room of DEFAULT_ROOMS) {
    await run(
      `INSERT OR IGNORE INTO memory_rooms (id, name, description, icon, room_type, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [room.id, room.name, room.description, room.icon, room.roomType, room.sortOrder]
    )
  }
}

/** 获取所有房间 */
export async function getRooms(): Promise<MemoryRoom[]> {
  await initDefaultRooms()
  return query<MemoryRoom>(
    'SELECT id, name, description, icon, room_type as roomType, sort_order as sortOrder, created_at as createdAt FROM memory_rooms ORDER BY sort_order'
  )
}

/** 获取房间内的记忆条目 */
export async function getRoomItems(roomId: string, limit = 50): Promise<MemoryItem[]> {
  return query<MemoryItem>(
    `SELECT id, room_id as roomId, type, content, source, importance, access_count as accessCount,
            metadata_json as metadataJson, created_at as createdAt, updated_at as updatedAt
     FROM memory_items WHERE room_id = ? ORDER BY importance DESC, created_at DESC LIMIT ?`,
    [roomId, limit]
  )
}

/** 添加记忆条目 */
export async function addMemoryItem(item: Omit<MemoryItem, 'id' | 'accessCount' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const id = generateId()
  const now = new Date().toISOString()
  await run(
    `INSERT INTO memory_items (id, room_id, type, content, source, importance, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, item.roomId, item.type, item.content, item.source, item.importance, item.metadataJson || '{}', now, now]
  )
  return id
}

/** 更新记忆条目 */
export async function updateMemoryItem(id: string, updates: Partial<Pick<MemoryItem, 'content' | 'importance' | 'metadataJson'>>): Promise<void> {
  const sets: string[] = []
  const params: unknown[] = []
  if (updates.content !== undefined) { sets.push('content = ?'); params.push(updates.content) }
  if (updates.importance !== undefined) { sets.push('importance = ?'); params.push(updates.importance) }
  if (updates.metadataJson !== undefined) { sets.push('metadata_json = ?'); params.push(updates.metadataJson) }
  if (sets.length === 0) return
  sets.push("updated_at = datetime('now','localtime')")
  params.push(id)
  await run(`UPDATE memory_items SET ${sets.join(', ')} WHERE id = ?`, params)
}

/** 删除记忆条目 */
export async function deleteMemoryItem(id: string): Promise<void> {
  await run('DELETE FROM memory_items WHERE id = ?', [id])
}

/** 增加访问计数 */
export async function touchMemoryItem(id: string): Promise<void> {
  await run('UPDATE memory_items SET access_count = access_count + 1 WHERE id = ?', [id])
}

/** 获取房间记忆数量统计 */
export async function getRoomCounts(): Promise<Record<string, number>> {
  const rows = await query<{ room_id: string; cnt: number }>(
    'SELECT room_id, COUNT(*) as cnt FROM memory_items GROUP BY room_id'
  )
  const counts: Record<string, number> = {}
  for (const r of rows) counts[r.room_id] = r.cnt
  return counts
}

/** 按 room_type 查找房间 */
export async function getRoomByType(roomType: string): Promise<{ id: string } | null> {
  const rows = await query<{ id: string }>(
    'SELECT id FROM memory_rooms WHERE room_type = ? LIMIT 1',
    [roomType]
  )
  return rows[0] || null
}

/** 保存记忆条目（兼容 self-nudge 签名） */
export async function saveMemoryItem(item: {
  roomId: string
  content: string
  category: string
  importance: number
  source: string
}): Promise<string> {
  return addMemoryItem({
    roomId: item.roomId,
    type: item.category,
    content: item.content,
    source: item.source,
    importance: item.importance,
    metadataJson: '{}',
  })
}
