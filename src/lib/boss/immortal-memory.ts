/**
 * Immortal Memory — 不朽快照系统
 *
 * 定期将 Boss 完整记忆快照写入磁盘
 * 轮转保留最近 3 个快照
 * 锚点和数据库都丢失时从快照恢复
 */
import { query } from '../db/repository'

export interface BossSnapshot {
  version: number
  timestamp: string
  trigger: 'session_save' | 'decision' | 'evaluation'
  data: {
    bossProfile: Record<string, string>
    bossMemories: Array<{
      id: string
      category: string
      content: string
      source: string
      confidence: number
    }>
    bossDecisions: Array<{
      id: string
      project_id: string
      decision_type: string
      reasoning: string
    }>
    gameStats: {
      xp: number
      stats: string
      achievements: string
    }
  }
}

const MAX_SNAPSHOTS = 3

// ─── 快照操作 ───

/**
 * 创建快照并写入磁盘
 */
export async function createSnapshot(trigger: BossSnapshot['trigger']): Promise<void> {
  try {
    if (!window.electronAPI?.bossSnapshotCreate) return

    // 收集 Boss 数据
    const profileRows = await query<{ key: string; value: string }>('SELECT key, value FROM boss_profile')
    const bossProfile: Record<string, string> = {}
    for (const row of profileRows) {
      bossProfile[row.key] = row.value
    }

    const bossMemories = await query<{
      id: string
      category: string
      content: string
      source: string
      confidence: number
    }>('SELECT id, category, content, source, confidence FROM boss_memory ORDER BY confidence DESC LIMIT 50')

    const bossDecisions = await query<{
      id: string
      project_id: string
      decision_type: string
      reasoning: string
    }>('SELECT id, project_id, decision_type, reasoning FROM boss_decisions ORDER BY created_at DESC LIMIT 20')

    let xp = 0
    let statsStr = '{}'
    let achievementsStr = '[]'
    try {
      const xpRow = await query<{ value: string }>("SELECT value FROM settings WHERE key = 'game_xp'")
      xp = parseInt(xpRow[0]?.value || '0')
      const statsRow = await query<{ value: string }>("SELECT value FROM settings WHERE key = 'game_stats'")
      statsStr = statsRow[0]?.value || '{}'
      const achRow = await query<{ value: string }>("SELECT value FROM settings WHERE key = 'game_achievements'")
      achievementsStr = achRow[0]?.value || '[]'
    } catch { /* use defaults */ }

    const snapshot: BossSnapshot = {
      version: 1,
      timestamp: new Date().toISOString(),
      trigger,
      data: {
        bossProfile,
        bossMemories,
        bossDecisions,
        gameStats: { xp, stats: statsStr, achievements: achievementsStr },
      },
    }

    await window.electronAPI.bossSnapshotCreate(JSON.stringify(snapshot))
  } catch { /* snapshot failure is non-critical */ }
}

/**
 * 列出可用快照
 */
export async function listSnapshots(): Promise<string[]> {
  try {
    if (window.electronAPI?.bossSnapshotList) {
      return await window.electronAPI.bossSnapshotList()
    }
  } catch { /* ignore */ }
  return []
}

/**
 * 从最新快照恢复
 */
export async function restoreFromSnapshot(): Promise<boolean> {
  try {
    if (!window.electronAPI?.bossSnapshotRestore) return false

    const snapshots = await listSnapshots()
    if (snapshots.length === 0) return false

    // 取最新的快照
    const latestSnapshot = snapshots.sort().reverse()[0]
    const dataStr = await window.electronAPI.bossSnapshotRestore(latestSnapshot)
    if (!dataStr) return false

    const snapshot: BossSnapshot = typeof dataStr === 'string'
      ? JSON.parse(dataStr)
      : dataStr

    if (snapshot.version !== 1 || !snapshot.data?.bossProfile) return false

    // 恢复 boss_profile
    const { dbSetBossProfile, dbSaveMemory, dbSetSetting } = await import('../db/repository')

    await dbSetBossProfile(snapshot.data.bossProfile)

    // 恢复 boss_memory
    for (const m of snapshot.data.bossMemories) {
      await dbSaveMemory(
        m.category as 'preference' | 'pattern' | 'insight' | 'correction' | 'goal' | 'emotion',
        m.content,
        m.source || 'snapshot_restore',
        m.confidence
      )
    }

    // 恢复游戏统计
    if (snapshot.data.gameStats.xp > 0) {
      await dbSetSetting('game_xp', String(snapshot.data.gameStats.xp))
    }
    if (snapshot.data.gameStats.stats !== '{}') {
      await dbSetSetting('game_stats', snapshot.data.gameStats.stats)
    }
    if (snapshot.data.gameStats.achievements !== '[]') {
      await dbSetSetting('game_achievements', snapshot.data.gameStats.achievements)
    }

    return true
  } catch { /* restore failure */ }
  return false
}
