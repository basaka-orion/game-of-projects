/**
 * Layers — 记忆唤醒栈 (L0-L3+)
 *
 * 对标 MemPalace 的 layers.py
 * 将 Agent 记忆分层管理，每层有明确的 token 预算和递降权重。
 *
 * L0 身份层 (50-100 tokens) — 始终加载
 * L1 核心故事层 (500-800 tokens) — 重要记忆自动提取
 * L2 按需检索层 (200-500 tokens) — 按关键词匹配
 * L3 深度搜索层 (无上限) — 全量搜索 + 图谱 + 突触
 * L3+ 跨翼 + Agent 日记 — 跨翼隧道搜索 + 同伴日记
 */
import { query } from '../db/repository'
import { searchDrawers } from '../knowledge/drawer'
import { searchCloset } from './closet'
import { readDiary, listAgentsWithDiaries } from './agent-diary'
import { discoverAllTunnels } from './palace-graph'

// ─── 接口 ───

export interface LayerResult {
  layer: LayerLevel
  content: string
  tokenCount: number
  sources: string[]
  weight: number
}

export type LayerLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L3+'

export interface LayerConfig {
  maxTokens: number
  weight: number
  enabled: boolean
}

/** 默认层配置 */
export const DEFAULT_LAYER_CONFIGS: Record<LayerLevel, LayerConfig> = {
  'L0':  { maxTokens: 100,  weight: 0.40, enabled: true },
  'L1':  { maxTokens: 800,  weight: 0.25, enabled: true },
  'L2':  { maxTokens: 500,  weight: 0.15, enabled: true },
  'L3':  { maxTokens: 1000, weight: 0.08, enabled: true },
  'L3+': { maxTokens: 500,  weight: 0.04, enabled: false },
}

export interface WakeUpResult {
  layers: LayerResult[]
  totalTokens: number
  totalContent: string
  assembledAt: string
}

// ─── L0: 身份层 ───

/** L0 — 从 Agent Soul 提取核心身份（始终加载） */
export async function wakeL0(agentId: string, soulJson?: string): Promise<LayerResult> {
  const content = soulJson
    ? extractIdentityFromSoul(soulJson)
    : getDefaultIdentity(agentId)

  return {
    layer: 'L0',
    content,
    tokenCount: estimateTokens(content),
    sources: ['soul'],
    weight: DEFAULT_LAYER_CONFIGS['L0'].weight,
  }
}

// ─── L1: 核心故事层 ───

/** L1 — 从 Agent Memory 自动提取重要条目 */
export async function wakeL1(agentId: string): Promise<LayerResult> {
  const parts: string[] = []

  try {
    // Agent 专属记忆
    const rows = await query(
      `SELECT content, importance, category FROM memory_items
       WHERE agent_id = ? AND importance >= 60
       ORDER BY importance DESC, created_at DESC LIMIT 10`,
      [agentId]
    ) as Array<{ content: string; importance: number; category: string }>

    for (const row of rows) {
      parts.push(`[${row.category}] ${row.content}`)
    }

    // Boss Profile 核心信息
    const bossRows = await query(
      "SELECT key, value FROM boss_profile WHERE key IN ('name', 'interests', 'goals', 'hates')"
    ) as Array<{ key: string; value: string }>

    if (bossRows.length > 0) {
      parts.push('Boss Profile: ' + bossRows.map(r => `${r.key}=${r.value}`).join(', '))
    }
  } catch { /* ignore */ }

  const content = parts.join('\n')
  return {
    layer: 'L1',
    content,
    tokenCount: estimateTokens(content),
    sources: ['memory_items', 'boss_profile'],
    weight: DEFAULT_LAYER_CONFIGS['L1'].weight,
  }
}

// ─── L2: 按需检索层 ───

/** L2 — 按关键词匹配的记忆检索 */
export async function wakeL2(agentId: string, keywords: string[]): Promise<LayerResult> {
  const parts: string[] = []

  if (keywords.length === 0) {
    return { layer: 'L2', content: '', tokenCount: 0, sources: [], weight: DEFAULT_LAYER_CONFIGS['L2'].weight }
  }

  try {
    // Closet 索引快速过滤
    const closetResults = await searchCloset(keywords.join(' '), { topK: 10 })
    for (const item of closetResults) {
      parts.push(`[Closet] ${item.anchor}`)
    }

    // Drawer 模糊搜索
    const drawerResults = await searchDrawers(keywords.join(' '), 5)
    for (const d of drawerResults) {
      parts.push(`[Drawer:${d.id}] ${d.rawContent.slice(0, 200)}`)
    }
  } catch { /* ignore */ }

  const content = parts.join('\n')
  return {
    layer: 'L2',
    content,
    tokenCount: estimateTokens(content),
    sources: ['closet', 'drawer'],
    weight: DEFAULT_LAYER_CONFIGS['L2'].weight,
  }
}

// ─── L3: 深度搜索层 ───

/** L3 — 全量搜索 + 知识图谱 + 突触 */
export async function wakeL3(agentId: string, keywords: string[]): Promise<LayerResult> {
  const parts: string[] = []

  try {
    // 知识图谱三元组
    for (const kw of keywords.slice(0, 3)) {
      const tripleRows = await query(
        `SELECT subject, predicate, object FROM knowledge_triples
         WHERE (subject LIKE ? OR object LIKE ?)
         AND (valid_to = '' OR valid_to IS NULL)
         LIMIT 5`,
        [`%${kw}%`, `%${kw}%`]
      ) as Array<{ subject: string; predicate: string; object: string }>

      for (const t of tripleRows) {
        parts.push(`[Graph] ${t.subject} —[${t.predicate}]→ ${t.object}`)
      }
    }

    // 突触连接
    const synapseRows = await query(
      `SELECT from_project_id, to_project_id, score, reason FROM synapses
       ORDER BY score DESC LIMIT 5`
    ) as Array<{ from_project_id: string; to_project_id: string; score: number; reason: string }>

    for (const s of synapseRows) {
      parts.push(`[Synapse] ${s.from_project_id} ↔ ${s.to_project_id} (${s.score.toFixed(2)}): ${s.reason}`)
    }
  } catch { /* ignore */ }

  const content = parts.join('\n')
  return {
    layer: 'L3',
    content,
    tokenCount: estimateTokens(content),
    sources: ['knowledge_triples', 'synapses'],
    weight: DEFAULT_LAYER_CONFIGS['L3'].weight,
  }
}

// ─── L3+: 跨翼 + Agent 日记 ───

/** L3+ — 跨翼隧道搜索 + 同伴 Agent 日记 */
export async function wakeL3Plus(agentId: string): Promise<LayerResult> {
  const parts: string[] = []

  try {
    // 跨翼隧道
    const tunnels = await discoverAllTunnels()
    for (const tunnel of tunnels.slice(0, 5)) {
      parts.push(`[Tunnel] ${tunnel.fromWing} ↔ ${tunnel.toWing} (强度: ${(tunnel.strength * 100).toFixed(0)}%) via ${tunnel.viaEntities.slice(0, 3).join(', ')}`)
    }

    // 其他 Agent 日记摘要
    const agentsWithDiaries = await listAgentsWithDiaries()
    const otherAgents = agentsWithDiaries.filter(a => a.agentId !== agentId)
    for (const other of otherAgents.slice(0, 3)) {
      const diary = await readDiary(other.agentId, 1)
      if (diary.length > 0) {
        parts.push(`[Diary:${other.agentName}] ${diary[0].content.slice(0, 200)}`)
      }
    }
  } catch { /* ignore */ }

  const content = parts.join('\n')
  return {
    layer: 'L3+',
    content,
    tokenCount: estimateTokens(content),
    sources: ['tunnels', 'agent_diaries'],
    weight: DEFAULT_LAYER_CONFIGS['L3+'].weight,
  }
}

// ─── 完整唤醒栈 ───

/** 唤醒完整记忆栈（L0 → L3+） */
export async function wakeUpAll(
  agentId: string,
  options?: {
    soulJson?: string
    keywords?: string[]
    layerConfigs?: Partial<Record<LayerLevel, LayerConfig>>
  }
): Promise<WakeUpResult> {
  const configs = { ...DEFAULT_LAYER_CONFIGS, ...options?.layerConfigs }
  const keywords = options?.keywords || []
  const layers: LayerResult[] = []

  // L0
  if (configs['L0'].enabled) {
    layers.push(await wakeL0(agentId, options?.soulJson))
  }

  // L1
  if (configs['L1'].enabled) {
    const l1 = await wakeL1(agentId)
    if (l1.tokenCount <= configs['L1'].maxTokens) {
      layers.push(l1)
    }
  }

  // L2
  if (configs['L2'].enabled && keywords.length > 0) {
    const l2 = await wakeL2(agentId, keywords)
    if (l2.tokenCount <= configs['L2'].maxTokens) {
      layers.push(l2)
    }
  }

  // L3
  if (configs['L3'].enabled && keywords.length > 0) {
    const l3 = await wakeL3(agentId, keywords)
    if (l3.tokenCount <= configs['L3'].maxTokens) {
      layers.push(l3)
    }
  }

  // L3+
  if (configs['L3+'].enabled) {
    const l3p = await wakeL3Plus(agentId)
    if (l3p.tokenCount <= configs['L3+'].maxTokens) {
      layers.push(l3p)
    }
  }

  // 组装
  const totalTokens = layers.reduce((sum, l) => sum + l.tokenCount, 0)
  const totalContent = layers
    .map(l => `<layer:${l.layer} weight="${l.weight}">\n${l.content}\n</layer:${l.layer}>`)
    .join('\n\n')

  return {
    layers,
    totalTokens,
    totalContent,
    assembledAt: new Date().toISOString(),
  }
}

// ─── 辅助函数 ───

/** 从 Soul JSON 提取核心身份 */
function extractIdentityFromSoul(soulJson: string): string {
  try {
    const soul = JSON.parse(soulJson) as Record<string, unknown>
    const parts: string[] = []
    if (soul.name) parts.push(`名字: ${soul.name}`)
    if (soul.role) parts.push(`角色: ${soul.role}`)
    if (soul.personality) parts.push(`性格: ${soul.personality}`)
    if (soul.beliefs) parts.push(`信念: ${soul.beliefs}`)
    return parts.join(' | ')
  } catch {
    return soulJson.slice(0, 100)
  }
}

/** 获取默认身份 */
function getDefaultIdentity(agentId: string): string {
  const identities: Record<string, string> = {
    general: '名字: BASAKA | 角色: 全天候数字副官',
    strategy: '名字: 战略顾问 | 角色: 战略参谋部',
    technical: '名字: 技术架构师 | 角色: 首席架构师',
    market: '名字: 市场分析师 | 角色: 市场情报部',
    creative: '名字: 创意火花 | 角色: 创新实验室',
    critic: '名字: 魔鬼代言人 | 角色: 风控部',
  }
  return identities[agentId] || `Agent: ${agentId}`
}

/** 估算 token 数（中文约 1.5 字/token，英文约 4 字符/token） */
function estimateTokens(text: string): number {
  if (!text) return 0
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const otherChars = text.length - chineseChars
  return Math.ceil(chineseChars / 1.5 + otherChars / 4)
}
