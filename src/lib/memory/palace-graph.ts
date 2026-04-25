/**
 * Palace Graph — 跨翼隧道 + 宫殿导航
 *
 * 对标 MemPalace 的 palace_graph.py
 * 实现 Wing 之间的知识桥梁，自动检测跨翼关联。
 */
import { query } from '../db/repository'
import { searchEntities, type Entity, type EntityType } from './entity-detector'

// ─── 接口 ───

export interface Wing {
  name: string
  drawerCount: number
  itemCount: number
  entityCount: number
}

export interface Tunnel {
  fromWing: string
  toWing: string
  viaEntities: string[]
  viaTriples: Array<{
    subject: string
    predicate: string
    object: string
  }>
  strength: number  // 连接强度 0-1
}

// ─── Wing 管理 ───

/** 获取所有 Wing（侧翼）及其统计 */
export async function listWings(): Promise<Wing[]> {
  const wings: Wing[] = []

  try {
    // 从 drawers 获取 wing 分布
    const drawerRows = await query(
      'SELECT wing, COUNT(*) as cnt FROM mempalace_drawers GROUP BY wing ORDER BY cnt DESC'
    ) as Array<{ wing: string; cnt: number }>

    // 从 memory_items 获取分布
    const itemRows = await query(
      `SELECT m.metadata_json
       FROM memory_items m
       JOIN memory_rooms r ON m.room_id = r.id
       WHERE m.importance >= 40`
    ) as Array<{ metadata_json: string }>

    for (const dr of drawerRows) {
      wings.push({
        name: dr.wing || 'default',
        drawerCount: dr.cnt,
        itemCount: 0,
        entityCount: 0,
      })
    }
  } catch { /* ignore */ }

  return wings
}

// ─── 跨翼隧道 ───

/** 查找两个翼之间的知识连接 */
export async function findCrossWingTunnel(
  fromWing: string,
  toWing: string
): Promise<Tunnel | null> {
  const tunnel: Tunnel = {
    fromWing,
    toWing,
    viaEntities: [],
    viaTriples: [],
    strength: 0,
  }

  try {
    // 1. 获取两个翼的内容中的关键词
    const fromDrawers = await query(
      'SELECT raw_content FROM mempalace_drawers WHERE wing = ? ORDER BY created_at DESC LIMIT 20',
      [fromWing]
    ) as Array<{ raw_content: string }>

    const toDrawers = await query(
      'SELECT raw_content FROM mempalace_drawers WHERE wing = ? ORDER BY created_at DESC LIMIT 20',
      [toWing]
    ) as Array<{ raw_content: string }>

    // 2. 提取每个翼的实体
    const fromEntities = extractEntitiesFromText(fromDrawers.map(d => d.raw_content).join(' '))
    const toEntities = extractEntitiesFromText(toDrawers.map(d => d.raw_content).join(' '))

    // 3. 找到共同的实体
    const commonEntities = fromEntities.filter(e => toEntities.includes(e))
    tunnel.viaEntities = commonEntities

    // 4. 通过共同实体查找知识三元组
    if (commonEntities.length > 0) {
      for (const entity of commonEntities.slice(0, 10)) {
        const tripleRows = await query(
          `SELECT subject, predicate, object FROM knowledge_triples
           WHERE (subject LIKE ? OR object LIKE ?)
           AND (valid_to = '' OR valid_to IS NULL)
           LIMIT 5`,
          [`%${entity}%`, `%${entity}%`]
        ) as Array<{ subject: string; predicate: string; object: string }>

        tunnel.viaTriples.push(...tripleRows)
      }
    }

    // 5. 计算连接强度
    const entityOverlap = commonEntities.length / Math.max(fromEntities.length, toEntities.length, 1)
    const tripleBonus = Math.min(tunnel.viaTriples.length / 10, 0.3)
    tunnel.strength = Math.min(entityOverlap + tripleBonus, 1)
  } catch { /* ignore */ }

  return tunnel.viaEntities.length > 0 ? tunnel : null
}

/** 自动发现所有翼之间的隧道 */
export async function discoverAllTunnels(): Promise<Tunnel[]> {
  const wings = await listWings()
  const tunnels: Tunnel[] = []

  for (let i = 0; i < wings.length; i++) {
    for (let j = i + 1; j < wings.length; j++) {
      const tunnel = await findCrossWingTunnel(wings[i].name, wings[j].name)
      if (tunnel && tunnel.strength > 0.1) {
        tunnels.push(tunnel)
      }
    }
  }

  return tunnels.sort((a, b) => b.strength - a.strength)
}

// ─── 辅助函数 ───

/** 从文本中提取实体名称（简单关键词提取） */
function extractEntitiesFromText(text: string): string[] {
  const entities = new Set<string>()

  // 中文短语（2-6字）
  const chinesePhrases = text.match(/[\u4e00-\u9fff]{2,6}/g) || []
  // 统计频率
  const freq = new Map<string, number>()
  for (const phrase of chinesePhrases) {
    freq.set(phrase, (freq.get(phrase) || 0) + 1)
  }
  // 只保留出现 2 次以上的
  for (const [phrase, count] of freq) {
    if (count >= 2) entities.add(phrase)
  }

  // 英文术语（大写开头或连字符分隔）
  const englishTerms = text.match(/[A-Z][a-zA-Z]{2,}|[a-z]+(?:-[a-z]+)+/g) || []
  for (const term of englishTerms) {
    entities.add(term)
  }

  return [...entities]
}
