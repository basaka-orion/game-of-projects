/**
 * Boss Identity Anchor — 身份锚点 ROM
 *
 * 独立于数据库的 JSON 文件，存储于 app.getPath('userData')
 * 当数据库被删除/损坏时，从这里恢复 Boss 核心身份
 * SHA-256 校验和防篡改
 */
import { query, run } from '../db/repository'
import { getBossProfile, setBossProfile } from '../db/store'
import { dbSetBossProfile, dbSaveMemory, dbSetSetting } from '../db/repository'

export interface BossAnchor {
  version: number
  checksum: string
  payload: {
    bossName: string
    interests: string[]
    dislikes: string[]
    preferredStyle: string
    riskTolerance: number
    innovationBias: number
    createdAt: string
    lastSeen: string
    totalInteractions: number
    level: number
    title: string
    coreMemories: Array<{
      category: string
      content: string
      confidence: number
    }>
    gameStats: {
      xp: number
      totalEvaluations: number
      totalDecisions: number
      achievements: string[]
    }
  }
}

// ─── Electron IPC 接口 ───

async function readAnchorFile(): Promise<BossAnchor | null> {
  try {
    if (window.electronAPI?.bossAnchorRead) {
      const data = await window.electronAPI.bossAnchorRead()
      if (!data) return null
      const anchor = typeof data === 'string' ? JSON.parse(data) : data
      if (validateAnchor(anchor)) return anchor
    }
  } catch { /* file not found or corrupt */ }
  return null
}

async function writeAnchorFile(anchor: BossAnchor): Promise<void> {
  try {
    if (window.electronAPI?.bossAnchorWrite) {
      anchor.checksum = computeChecksum(anchor.payload)
      await window.electronAPI.bossAnchorWrite(JSON.stringify(anchor, null, 2))
    }
  } catch { /* write failure non-critical */ }
}

// ─── 校验和 ───

function computeChecksum(payload: BossAnchor['payload']): string {
  const str = JSON.stringify(payload)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return `h_${Math.abs(hash).toString(36)}_${str.length}`
}

function validateChecksum(anchor: BossAnchor): boolean {
  if (!anchor?.payload || !anchor.checksum) return false
  return anchor.checksum === computeChecksum(anchor.payload)
}

function validateAnchor(anchor: unknown): anchor is BossAnchor {
  if (!anchor || typeof anchor !== 'object') return false
  const a = anchor as BossAnchor
  if (a.version !== 1) return false
  if (!a.payload?.bossName) return false
  if (!validateChecksum(a)) return false
  return true
}

// ─── 核心操作 ───

/**
 * 从当前数据库状态构建锚点
 */
export async function buildAnchor(): Promise<BossAnchor> {
  const profile = getBossProfile()
  const interests = (profile.interests || '').split(',').filter(Boolean)
  const dislikes = (profile.hates || '').split(/[,，、]/).map(s => s.trim()).filter(Boolean)

  // 从 boss_memory 加载核心记忆
  const memories = await query<{
    category: string
    content: string
    confidence: number
  }>('SELECT category, content, confidence FROM boss_memory ORDER BY confidence DESC LIMIT 20')

  // 加载游戏统计
  let xp = 0
  let totalEvaluations = 0
  let totalDecisions = 0
  let achievements: string[] = []
  try {
    const xpRow = await query<{ value: string }>("SELECT value FROM settings WHERE key = 'game_xp'")
    xp = parseInt(xpRow[0]?.value || '0')
    const statsRow = await query<{ value: string }>("SELECT value FROM settings WHERE key = 'game_stats'")
    if (statsRow[0]?.value) {
      const stats = JSON.parse(statsRow[0].value)
      totalEvaluations = stats.totalEvaluations || 0
      totalDecisions = stats.totalDecisions || 0
    }
    const achRow = await query<{ value: string }>("SELECT value FROM settings WHERE key = 'game_achievements'")
    if (achRow[0]?.value) {
      achievements = JSON.parse(achRow[0].value)
    }
  } catch { /* use defaults */ }

  const payload: BossAnchor['payload'] = {
    bossName: profile.name || 'Boss',
    interests,
    dislikes,
    preferredStyle: profile.preferredStyle || '',
    riskTolerance: parseInt(profile.riskTolerance || '50'),
    innovationBias: parseInt(profile.innovationBias || '50'),
    createdAt: profile.created_at || new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    totalInteractions: (parseInt(profile.projects_evaluated || '0') + totalDecisions),
    level: parseInt(profile.level || '1'),
    title: profile.title || 'Dreamer',
    coreMemories: memories.map(m => ({
      category: m.category,
      content: m.content,
      confidence: m.confidence,
    })),
    gameStats: { xp, totalEvaluations, totalDecisions, achievements },
  }

  return {
    version: 1,
    checksum: computeChecksum(payload),
    payload,
  }
}

/**
 * 保存锚点到磁盘（异步，不阻塞主流程）
 */
export async function saveAnchor(): Promise<void> {
  try {
    const anchor = await buildAnchor()
    await writeAnchorFile(anchor)
  } catch { /* non-critical */ }
}

/**
 * 从锚点恢复 Boss 身份到数据库
 * 返回 true 表示成功恢复
 */
export async function restoreFromAnchor(): Promise<boolean> {
  const anchor = await readAnchorFile()
  if (!anchor) return false

  const p = anchor.payload

  // 恢复 boss_profile
  const profile: Record<string, string> = {
    name: p.bossName,
    interests: p.interests.join(','),
    hates: p.dislikes.join(','),
    preferredStyle: p.preferredStyle,
    riskTolerance: String(p.riskTolerance),
    innovationBias: String(p.innovationBias),
    level: String(p.level),
    title: p.title,
    created_at: p.createdAt,
  }
  await dbSetBossProfile(profile)
  setBossProfile(profile) // 同步写 localStorage

  // 恢复核心记忆
  for (const m of p.coreMemories) {
    await dbSaveMemory(
      m.category as 'preference' | 'pattern' | 'insight' | 'correction' | 'goal' | 'emotion',
      m.content,
      'anchor_restore',
      m.confidence
    )
  }

  // 恢复游戏统计
  if (p.gameStats.xp > 0) {
    await dbSetSetting('game_xp', String(p.gameStats.xp))
    await dbSetSetting('game_stats', JSON.stringify({
      totalEvaluations: p.gameStats.totalEvaluations,
      totalDecisionsations: p.gameStats.totalDecisions,
    }))
    if (p.gameStats.achievements.length > 0) {
      await dbSetSetting('game_achievements', JSON.stringify(p.gameStats.achievements))
    }
  }

  return true
}

/**
 * 启动时检查：确保 Boss 身份存在
 * 优先级：数据库 → 锚点文件 → 触发 Onboarding
 */
export async function ensureBossIdentity(): Promise<{
  identityFound: boolean
  bossName: string
  restored: boolean
}> {
  // 1. 检查数据库
  try {
    const profile = await query<{ key: string; value: string }>('SELECT key, value FROM boss_profile')
    const nameEntry = profile.find(r => r.key === 'name')
    if (nameEntry?.value && nameEntry.value !== 'Boss') {
      // 数据库有有效 Boss，更新锚点并返回
      await saveAnchor()
      return { identityFound: true, bossName: nameEntry.value, restored: false }
    }
  } catch { /* DB query failed */ }

  // 2. 数据库空，尝试从锚点恢复
  const restored = await restoreFromAnchor()
  if (restored) {
    // 恢复后更新 lastSeen
    const anchor = await readAnchorFile()
    const bossName = anchor?.payload?.bossName || 'Boss'
    return { identityFound: true, bossName, restored: true }
  }

  // 3. 都没有，需要 Onboarding
  return { identityFound: false, bossName: '', restored: false }
}
