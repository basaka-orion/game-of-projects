/**
 * 游戏进度系统 — XP / 等级 / 成就
 */
import { dbGetSetting, dbSetSetting } from '../db/repository'

// ─── XP / 等级 ────────────────────────────────────────────

export const XP_ACTIONS: Record<string, number> = {
  evaluateProject: 10,
  makeDecision: 15,
  discoverSynapse: 20,
  generateHybrid: 25,
  dailyLogin: 5,
  sevenDayStreak: 50,
  evaluateSGrade: 50,
  discoverBreakthrough: 30,
  abandonProject: 5,
}

export function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1))
}

export function getBossTitle(level: number): string {
  if (level >= 30) return 'Metaverse Architect'
  if (level >= 20) return 'Visionary'
  if (level >= 15) return 'Strategist'
  if (level >= 10) return 'Architect'
  if (level >= 5) return 'Analyst'
  return 'Dreamer'
}

export interface GameState {
  level: number
  xp: number
  xpToNext: number
  title: string
  achievements: Achievement[]
  stats: GameStats
}

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  unlockedAt: string | null
  category: 'exploration' | 'analysis' | 'decision' | 'connection' | 'streak'
}

export interface GameStats {
  totalEvaluations: number
  totalDecisions: number
  synapsesDiscovered: number
  hybridIdeasGenerated: number
  highestSurvival: number
  lowestSurvival: number
  streakDays: number
}

const ALL_ACHIEVEMENTS: Achievement[] = [
  { id: 'first_blood', name: 'First Blood', description: '评估第一个项目', icon: '🗡️', unlockedAt: null, category: 'exploration' },
  { id: 'dare_to_choose', name: 'Dare to Choose', description: '做出第一个决策', icon: '⚡', unlockedAt: null, category: 'decision' },
  { id: 'red_and_blue', name: 'Red & Blue', description: '运行 5 次推演', icon: '⚔️', unlockedAt: null, category: 'analysis' },
  { id: 'the_connector', name: 'The Connector', description: '发现第一个突触', icon: '🔗', unlockedAt: null, category: 'connection' },
  { id: 'hybrid_thinker', name: 'Hybrid Thinker', description: '生成第一个混合创意', icon: '🧬', unlockedAt: null, category: 'connection' },
  { id: 's_rank_sniffer', name: 'S-Rank Sniffer', description: '找到一个 S 级项目', icon: '💎', unlockedAt: null, category: 'exploration' },
  { id: 'network_weaver', name: 'Network Weaver', description: '发现 10 条突触连接', icon: '🕸️', unlockedAt: null, category: 'connection' },
  { id: 'the_ruthless', name: 'The Ruthless', description: '放弃 3 个项目', icon: '💀', unlockedAt: null, category: 'decision' },
  { id: 'visionary', name: 'Visionary', description: '达到 10 级', icon: '👁️', unlockedAt: null, category: 'exploration' },
  { id: 'veteran', name: 'Veteran', description: '评估 20 个项目', icon: '🎖️', unlockedAt: null, category: 'analysis' },
  { id: 'streak_master', name: 'Streak Master', description: '连续使用 7 天', icon: '🔥', unlockedAt: null, category: 'streak' },
  { id: 'breakthrough_hunter', name: 'Breakthrough Hunter', description: '发现突破性项目（突破潜力>80）', icon: '🚀', unlockedAt: null, category: 'exploration' },
]

/** 加载游戏状态 */
export async function loadGameState(): Promise<GameState> {
  const xp = parseInt(await dbGetSetting('game_xp', '0'))
  const statsJson = await dbGetSetting('game_stats', '{}')
  const achievementsJson = await dbGetSetting('game_achievements', '[]')

  let stats: GameStats
  try { stats = JSON.parse(statsJson) } catch { stats = { totalEvaluations: 0, totalDecisions: 0, synapsesDiscovered: 0, hybridIdeasGenerated: 0, highestSurvival: 0, lowestSurvival: 0, streakDays: 0 } }

  let unlockedIds: string[]
  try { unlockedIds = JSON.parse(achievementsJson) } catch { unlockedIds = [] }

  const achievements = ALL_ACHIEVEMENTS.map(a => ({
    ...a,
    unlockedAt: unlockedIds.includes(a.id) ? 'unlocked' : null,
  }))

  // 计算等级
  let level = 1
  let remainingXp = xp
  while (remainingXp >= xpForLevel(level)) {
    remainingXp -= xpForLevel(level)
    level++
  }

  return {
    level,
    xp: remainingXp,
    xpToNext: xpForLevel(level),
    title: getBossTitle(level),
    achievements,
    stats,
  }
}

/** 增加 XP 并返回新状态 */
export async function addXP(action: keyof typeof XP_ACTIONS): Promise<{ state: GameState; xpGained: number; newAchievements: string[] }> {
  const state = await loadGameState()
  const xpGained = XP_ACTIONS[action] || 0

  // 更新统计
  const stats = { ...state.stats }
  if (action === 'evaluateProject') stats.totalEvaluations++
  if (action === 'makeDecision') stats.totalDecisions++
  if (action === 'discoverSynapse') stats.synapsesDiscovered++
  if (action === 'generateHybrid') stats.hybridIdeasGenerated++

  // 计算新总 XP
  const totalXp = state.level > 1
    ? Array.from({ length: state.level - 1 }, (_, i) => xpForLevel(i + 1)).reduce((a, b) => a + b, 0) + state.xp + xpGained
    : state.xp + xpGained

  // 保存 XP
  await dbSetSetting('game_xp', String(totalXp))
  await dbSetSetting('game_stats', JSON.stringify(stats))

  // 检查成就
  const newAchievements = checkAchievements(stats, totalXp)
  if (newAchievements.length > 0) {
    const currentUnlocked = state.achievements.filter(a => a.unlockedAt).map(a => a.id)
    await dbSetSetting('game_achievements', JSON.stringify([...currentUnlocked, ...newAchievements]))
  }

  const newState = await loadGameState()
  return { state: newState, xpGained, newAchievements }
}

/** 记录项目评估的特殊 XP */
export async function recordEvaluationXP(survivalRate: number): Promise<{ state: GameState; xpGained: number; newAchievements: string[] }> {
  let result = await addXP('evaluateProject')

  // 额外奖励
  if (survivalRate >= 95) {
    const bonus = await addXP('evaluateSGrade')
    result.xpGained += bonus.xpGained
    result.newAchievements.push(...bonus.newAchievements)
  }

  // 更新最高/最低存活率
  const stats = { ...result.state.stats }
  if (survivalRate > stats.highestSurvival) stats.highestSurvival = survivalRate
  if (stats.lowestSurvival === 0 || survivalRate < stats.lowestSurvival) stats.lowestSurvival = survivalRate
  await dbSetSetting('game_stats', JSON.stringify(stats))

  return result
}

function checkAchievements(stats: GameStats, totalXp: number): string[] {
  const newOnes: string[] = []

  if (stats.totalEvaluations >= 1) newOnes.push('first_blood')
  if (stats.totalDecisions >= 1) newOnes.push('dare_to_choose')
  if (stats.totalEvaluations >= 5) newOnes.push('red_and_blue')
  if (stats.synapsesDiscovered >= 1) newOnes.push('the_connector')
  if (stats.hybridIdeasGenerated >= 1) newOnes.push('hybrid_thinker')
  if (stats.synapsesDiscovered >= 10) newOnes.push('network_weaver')
  if (stats.totalEvaluations >= 20) newOnes.push('veteran')
  if (stats.streakDays >= 7) newOnes.push('streak_master')

  // 检查等级
  let level = 1
  let remaining = totalXp
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level)
    level++
  }
  if (level >= 10) newOnes.push('visionary')

  return newOnes
}
