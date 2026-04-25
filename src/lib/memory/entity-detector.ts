/**
 * Entity Detector — 实体检测器 + 注册表
 *
 * 对标 MemPalace 的 entity_detector.py + entity_registry.py
 * 从文本中自动检测人物、项目、概念等实体，并进行消歧和注册。
 */
import { query, run } from '../db/repository'
import { generateId } from '../db/schema'
import { chatCompletion, LLMConfig } from '../ai/provider'
import { getCompileLLMConfig } from '../knowledge/wiki-compiler'

// ─── 接口 ───

export interface Entity {
  id: string
  name: string
  type: EntityType
  aliases: string[]
  description: string
  firstSeen: string
  lastUpdated: string
  metadata: Record<string, unknown>
}

export type EntityType = 'person' | 'project' | 'concept' | 'tool' | 'event' | 'organization' | 'location'

interface RawEntity {
  name: string
  type: EntityType
  description: string
  aliases: string[]
}

// ─── 正则预检测 ───

/** 常见人名模式（中文 2-4 字） */
const PERSON_PATTERN = /[\u4e00-\u9fff]{2,4}(?=说|认为|表示|指出|强调|发现|建议|提到|称)/g

/** 项目名模式（含「项目」「计划」等后缀） */
const PROJECT_PATTERN = /[\u4e00-\u9fff\w]+(?:项目|计划|方案|系统|平台|框架|引擎|工具)/g

/** 技术工具模式 */
const TOOL_PATTERN = /[A-Z][a-zA-Z]*(?:\.js|\.ts|\.py)?|[a-z]+(?:-[a-z]+)+/g

/** 从文本中用正则提取候选实体 */
function extractCandidates(text: string): Array<{ name: string; type: EntityType }> {
  const candidates: Array<{ name: string; type: EntityType }> = []
  const seen = new Set<string>()

  // 人物
  for (const match of text.matchAll(PERSON_PATTERN)) {
    const name = match[0]
    if (!seen.has(name)) {
      seen.add(name)
      candidates.push({ name, type: 'person' })
    }
  }

  // 项目
  for (const match of text.matchAll(PROJECT_PATTERN)) {
    const name = match[0]
    if (!seen.has(name)) {
      seen.add(name)
      candidates.push({ name, type: 'project' })
    }
  }

  // 技术工具
  for (const match of text.matchAll(TOOL_PATTERN)) {
    const name = match[0]
    if (name.length >= 3 && !seen.has(name)) {
      seen.add(name)
      candidates.push({ name, type: 'tool' })
    }
  }

  return candidates
}

// ─── LLM 增强检测 ───

const DETECT_PROMPT = `你是实体检测器。从以下文本中提取所有值得记录的实体。

实体类型：
- person: 人物
- project: 项目/产品
- concept: 概念/理论/方法
- tool: 技术工具/框架
- event: 事件/会议
- organization: 组织/公司
- location: 地点

输出 JSON 数组：
[{
  "name": "实体名称",
  "type": "person|project|concept|tool|event|organization|location",
  "description": "一句话描述",
  "aliases": ["别名1", "别名2"]
}]

只提取文本中明确出现的实体，不要推测。如果没有实体，返回 []`

/** 使用 LLM 从文本中检测实体 */
export async function detectEntitiesWithLLM(
  text: string,
  llmConfig?: LLMConfig
): Promise<RawEntity[]> {
  if (!text || text.trim().length < 20) return []

  const config = llmConfig || getCompileLLMConfig()
  try {
    const response = await chatCompletion(
      config,
      [
        { role: 'system', content: DETECT_PROMPT },
        { role: 'user', content: text.slice(0, 4000) },
      ],
      0.1,
      2048
    )

    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []

    const entities = JSON.parse(jsonMatch[0]) as RawEntity[]
    return entities.filter(e => e.name && e.type)
  } catch {
    return []
  }
}

// ─── 混合检测 + 注册 ───

/** 从文本中检测并注册实体（正则 + 可选 LLM） */
export async function detectAndRegisterEntities(
  text: string,
  sourceId: string,
  useLLM = false,
  llmConfig?: LLMConfig
): Promise<Entity[]> {
  // 1. 正则候选
  const regexCandidates = extractCandidates(text)

  // 2. LLM 增强候选
  let llmEntities: RawEntity[] = []
  if (useLLM) {
    llmEntities = await detectEntitiesWithLLM(text, llmConfig)
  }

  // 3. 合并去重
  const allEntities: Array<RawEntity & { fromRegex?: boolean }> = []
  const seenNames = new Set<string>()

  for (const e of regexCandidates) {
    const key = e.name.toLowerCase()
    if (!seenNames.has(key)) {
      seenNames.add(key)
      allEntities.push({ ...e, description: '', aliases: [], fromRegex: true })
    }
  }

  for (const e of llmEntities) {
    const key = e.name.toLowerCase()
    if (!seenNames.has(key)) {
      seenNames.add(key)
      allEntities.push(e)
    }
  }

  // 4. 注册到数据库
  const registered: Entity[] = []
  for (const raw of allEntities) {
    const entity = await findOrCreateEntity(raw.name, raw.type, raw.description, raw.aliases, sourceId)
    if (entity) registered.push(entity)
  }

  return registered
}

// ─── 实体注册表 CRUD ───

/** 查找或创建实体（消歧：同名合并，别名匹配） */
export async function findOrCreateEntity(
  name: string,
  type: EntityType,
  description = '',
  aliases: string[] = [],
  sourceId = ''
): Promise<Entity | null> {
  // 1. 精确名称匹配
  const exactRows = await query('SELECT * FROM entities WHERE name = ?', [name]) as Array<Record<string, unknown>>
  if (exactRows.length > 0) {
    const existing = parseRow(exactRows[0])
    // 合并别名
    const newAliases = aliases.filter(a => !existing.aliases.includes(a) && a !== existing.name)
    if (newAliases.length > 0) {
      const merged = [...existing.aliases, ...newAliases]
      await run('UPDATE entities SET aliases = ?, last_updated = datetime("now","localtime") WHERE id = ?',
        [JSON.stringify(merged), existing.id])
      existing.aliases = merged
    }
    // 更新描述（如果新描述更详细）
    if (description && description.length > (existing.description?.length || 0)) {
      await run('UPDATE entities SET description = ? WHERE id = ?', [description, existing.id])
      existing.description = description
    }
    return existing
  }

  // 2. 别名匹配
  try {
    const aliasRows = await query('SELECT * FROM entities') as Array<Record<string, unknown>>
    for (const row of aliasRows) {
      const entity = parseRow(row)
      if (entity.aliases.includes(name)) {
        return entity
      }
    }
  } catch { /* ignore */ }

  // 3. 创建新实体
  const id = generateId()
  try {
    await run(
      `INSERT INTO entities (id, name, type, aliases, description, first_seen, last_updated, metadata_json)
       VALUES (?, ?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'), ?)`,
      [id, name, type, JSON.stringify(aliases), description, JSON.stringify({ firstSource: sourceId })]
    )
    return {
      id,
      name,
      type,
      aliases,
      description,
      firstSeen: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      metadata: { firstSource: sourceId },
    }
  } catch {
    return null
  }
}

/** 按名称搜索实体 */
export async function searchEntities(nameQuery: string, limit = 10): Promise<Entity[]> {
  const rows = await query(
    `SELECT * FROM entities WHERE name LIKE ? OR description LIKE ?
     ORDER BY last_updated DESC LIMIT ?`,
    [`%${nameQuery}%`, `%${nameQuery}%`, limit]
  ) as Array<Record<string, unknown>>
  return rows.map(parseRow)
}

/** 获取所有实体（按类型分组） */
export async function getAllEntities(type?: EntityType): Promise<Entity[]> {
  const sql = type
    ? 'SELECT * FROM entities WHERE type = ? ORDER BY last_updated DESC'
    : 'SELECT * FROM entities ORDER BY last_updated DESC'
  const params = type ? [type] : []
  const rows = await query(sql, params) as Array<Record<string, unknown>>
  return rows.map(parseRow)
}

/** 获取实体统计 */
export async function getEntityStats(): Promise<Record<EntityType, number>> {
  const rows = await query(
    'SELECT type, COUNT(*) as cnt FROM entities GROUP BY type'
  ) as Array<{ type: string; cnt: number }>
  const stats: Record<string, number> = {
    person: 0, project: 0, concept: 0, tool: 0, event: 0, organization: 0, location: 0,
  }
  for (const row of rows) {
    stats[row.type] = row.cnt
  }
  return stats as Record<EntityType, number>
}

/** 删除实体 */
export async function deleteEntity(id: string): Promise<void> {
  await run('DELETE FROM entities WHERE id = ?', [id])
}

// ─── Row 解析 ───

function parseRow(r: Record<string, unknown>): Entity {
  return {
    id: r.id as string,
    name: r.name as string,
    type: r.type as EntityType,
    aliases: JSON.parse((r.aliases as string) || '[]'),
    description: (r.description as string) || '',
    firstSeen: (r.first_seen as string) || '',
    lastUpdated: (r.last_updated as string) || '',
    metadata: JSON.parse((r.metadata_json as string) || '{}'),
  }
}
