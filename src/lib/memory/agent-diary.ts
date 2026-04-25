/**
 * Agent Diary — Agent 日记系统
 *
 * 对标 MemPalace 的 Agent diary 机制
 * 每个 Agent 维护独立的日记本，记录每日总结、学习到的教训。
 * 其他 Agent 可以发现同伴的日记。
 */
import { query, run } from '../db/repository'
import { generateId } from '../db/schema'

// ─── 接口 ───

export interface DiaryEntry {
  id: string
  agentId: string
  date: string
  content: string
  mood: 'positive' | 'neutral' | 'negative' | 'insightful'
  tags: string[]
  createdAt: string
}

// ─── 日记房间管理 ───

/** Agent 日记房间 ID 缓存 */
const diaryRoomCache = new Map<string, string>()

/** 获取或创建 Agent 的专属日记房间 */
async function getOrCreateDiaryRoom(agentId: string): Promise<string> {
  if (diaryRoomCache.has(agentId)) return diaryRoomCache.get(agentId)!

  // 查找已有房间
  const rows = await query(
    "SELECT id FROM memory_rooms WHERE room_type = 'agent_diary' AND agent_id = ? LIMIT 1",
    [agentId]
  ) as Array<{ id: string }>

  if (rows[0]) {
    diaryRoomCache.set(agentId, rows[0].id)
    return rows[0].id
  }

  // 创建新房间
  const id = generateId()
  const agentName = getAgentDisplayName(agentId)
  await run(
    `INSERT OR IGNORE INTO memory_rooms (id, name, description, icon, room_type, agent_id, sort_order)
     VALUES (?, ?, 'Agent 日记本', '📓', 'agent_diary', ?, 200)`,
    [id, `${agentName}的日记`, agentId]
  )
  diaryRoomCache.set(agentId, id)
  return id
}

/** 获取 Agent 显示名称 */
function getAgentDisplayName(agentId: string): string {
  const nameMap: Record<string, string> = {
    general: 'BASAKA',
    strategy: '战略顾问',
    technical: '技术架构师',
    market: '市场分析师',
    creative: '创意火花',
    critic: '魔鬼代言人',
  }
  return nameMap[agentId] || agentId
}

// ─── 日记 CRUD ───

/** 写入 Agent 日记条目 */
export async function writeDiaryEntry(
  agentId: string,
  content: string,
  mood: DiaryEntry['mood'] = 'neutral',
  tags: string[] = []
): Promise<string> {
  const roomId = await getOrCreateDiaryRoom(agentId)
  const id = generateId()
  const now = new Date().toISOString()
  const date = now.split('T')[0]  // YYYY-MM-DD

  // 写入 memory_items
  await run(
    `INSERT INTO memory_items (id, room_id, content, category, importance, source, metadata_json, agent_id, created_at)
     VALUES (?, ?, ?, 'diary', ?, 'agent-diary', ?, ?, datetime('now','localtime'))`,
    [
      id,
      roomId,
      content,
      mood === 'insightful' ? 70 : mood === 'positive' ? 50 : 40,
      JSON.stringify({ mood, tags, date }),
      agentId,
    ]
  )

  return id
}

/** 读取 Agent 最近 N 天的日记 */
export async function readDiary(
  agentId: string,
  days = 7
): Promise<DiaryEntry[]> {
  const roomId = await getOrCreateDiaryRoom(agentId)

  const rows = await query(
    `SELECT id, content, metadata_json, created_at
     FROM memory_items
     WHERE room_id = ? AND source = 'agent-diary'
     ORDER BY created_at DESC
     LIMIT ?`,
    [roomId, days * 3]  // 每天 3 条上限
  ) as Array<{ id: string; content: string; metadata_json: string; created_at: string }>

  return rows.map(r => {
    const meta = JSON.parse(r.metadata_json || '{}') as {
      mood: DiaryEntry['mood']; tags: string[]; date: string
    }
    return {
      id: r.id,
      agentId,
      date: meta.date || r.created_at?.split('T')[0] || '',
      content: r.content,
      mood: meta.mood || 'neutral',
      tags: meta.tags || [],
      createdAt: r.created_at,
    }
  })
}

/** 获取所有有日记的 Agent 列表 */
export async function listAgentsWithDiaries(): Promise<Array<{
  agentId: string
  agentName: string
  entryCount: number
  lastEntryDate: string
}>> {
  const rows = await query(
    `SELECT r.agent_id, r.name, COUNT(m.id) as entry_count, MAX(m.created_at) as last_entry
     FROM memory_rooms r
     JOIN memory_items m ON m.room_id = r.id
     WHERE r.room_type = 'agent_diary' AND m.source = 'agent-diary'
     GROUP BY r.agent_id
     ORDER BY last_entry DESC`
  ) as Array<{
    agent_id: string; name: string; entry_count: number; last_entry: string
  }>

  return rows.map(r => ({
    agentId: r.agent_id,
    agentName: r.name || getAgentDisplayName(r.agent_id),
    entryCount: r.entry_count,
    lastEntryDate: r.last_entry,
  }))
}

/** 删除日记条目 */
export async function deleteDiaryEntry(entryId: string): Promise<void> {
  await run('DELETE FROM memory_items WHERE id = ? AND source = ?', [entryId, 'agent-diary'])
}

/** 获取 Agent 日记统计 */
export async function getDiaryStats(agentId?: string): Promise<{
  totalEntries: number
  moodDistribution: Record<string, number>
  topTags: Array<{ tag: string; count: number }>
}> {
  let sql = `
    SELECT metadata_json FROM memory_items
    WHERE source = 'agent-diary'
  `
  const params: unknown[] = []
  if (agentId) {
    sql += ' AND agent_id = ?'
    params.push(agentId)
  }

  const rows = await query(sql, params) as Array<{ metadata_json: string }>

  const moodDist: Record<string, number> = { positive: 0, neutral: 0, negative: 0, insightful: 0 }
  const tagCounts = new Map<string, number>()

  for (const row of rows) {
    const meta = JSON.parse(row.metadata_json || '{}') as { mood: string; tags: string[] }
    if (meta.mood) moodDist[meta.mood] = (moodDist[meta.mood] || 0) + 1
    for (const tag of (meta.tags || [])) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
    }
  }

  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }))

  return {
    totalEntries: rows.length,
    moodDistribution: moodDist,
    topTags,
  }
}
