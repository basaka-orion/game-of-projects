/**
 * Convo Miner — 对话挖掘器
 *
 * 对标 MemPalace 的 convo_miner.py
 * 从对话记录中自动提取：实体、关系、决策、技术细节。
 * 比 self-nudge 更全面（self-nudge 只提取 5 条，这里提取所有有价值的）。
 */
import { chatCompletion, LLMConfig } from '../ai/provider'
import { getCompileLLMConfig } from '../knowledge/wiki-compiler'
import { detectAndRegisterEntities, type Entity } from './entity-detector'
import { addMemoryItem } from './palace'
import { createDrawer } from '../knowledge/drawer'
import { extractTriplesFromText } from './knowledge-graph'
import { generateId } from '../db/schema'

// ─── 接口 ───

export interface ConvoMineResult {
  entitiesExtracted: number
  triplesExtracted: number
  decisionsExtracted: number
  detailsArchived: number
  errors: string[]
}

// ─── Prompt ───

const MINE_PROMPT = `你是对话挖掘器。分析以下对话记录，提取所有有价值的信息。

输出 JSON：
{
  "entities": [
    { "name": "实体名", "type": "person|project|concept|tool|event", "description": "描述", "aliases": [] }
  ],
  "triples": [
    { "subject": "实体A", "predicate": "关系", "object": "实体B" }
  ],
  "decisions": [
    { "summary": "决策摘要", "rationale": "决策理由", "importance": 1-100 }
  ],
  "technicalDetails": [
    { "title": "技术细节标题", "content": "完整内容", "tags": ["标签"] }
  ]
}

提取规则：
- 实体：所有明确提到的人物、项目、技术、概念
- 三元组：实体之间的明确关系
- 决策：用户做出的选择、确认的方向、放弃的方案
- 技术细节：代码片段、配置参数、架构决策、错误信息

宁多勿漏——宁可多提取一些，也不要遗漏有价值的信息。`

// ─── 核心挖掘 ───

/** 从对话记录中挖掘所有有价值的信息 */
export async function mineConversation(
  messages: Array<{ role: string; content: string }>,
  options?: {
    useLLM?: boolean
    agentId?: string
    llmConfig?: LLMConfig
  }
): Promise<ConvoMineResult> {
  const result: ConvoMineResult = {
    entitiesExtracted: 0,
    triplesExtracted: 0,
    decisionsExtracted: 0,
    detailsArchived: 0,
    errors: [],
  }

  const text = messages.map(m => `${m.role}: ${m.content}`).join('\n')
  if (text.length < 50) return result

  const config = options?.llmConfig || getCompileLLMConfig()

  // 1. LLM 提取
  if (options?.useLLM !== false) {
    try {
      const response = await chatCompletion(
        config,
        [
          { role: 'system', content: MINE_PROMPT },
          { role: 'user', content: text.slice(0, 8000) },
        ],
        0.1,
        4096
      )

      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return result

      const parsed = JSON.parse(jsonMatch[0]) as {
        entities: Array<{ name: string; type: string; description: string; aliases: string[] }>
        triples: Array<{ subject: string; predicate: string; object: string }>
        decisions: Array<{ summary: string; rationale: string; importance: number }>
        technicalDetails: Array<{ title: string; content: string; tags: string[] }>
      }

      // 2. 注册实体
      for (const entity of (parsed.entities || [])) {
        try {
          await detectAndRegisterEntities(
            `${entity.name}: ${entity.description}`,
            `convo:${new Date().toISOString()}`,
            false // 不再用 LLM，避免递归
          )
          result.entitiesExtracted++
        } catch (err) {
          result.errors.push(`实体注册失败: ${entity.name}`)
        }
      }

      // 3. 提取三元组
      for (const triple of (parsed.triples || [])) {
        try {
          await extractTriplesFromText(
            `${triple.subject} ${triple.predicate} ${triple.object}`,
            `convo-miner:${options?.agentId || 'general'}`
          )
          result.triplesExtracted++
        } catch (err) {
          result.errors.push(`三元组提取失败: ${triple.subject}`)
        }
      }

      // 4. 归档决策到记忆宫殿
      for (const decision of (parsed.decisions || [])) {
        try {
          if (decision.importance >= 50) {
            await addMemoryItem({
              roomId: await getOrCreateDecisionRoom(),
              type: 'decision',
              content: `决策: ${decision.summary}\n理由: ${decision.rationale}`,
              importance: decision.importance,
              source: 'convo-miner',
              metadataJson: '{}',
            })
            result.decisionsExtracted++
          }
        } catch (err) {
          result.errors.push(`决策归档失败: ${decision.summary.slice(0, 30)}`)
        }
      }

      // 5. 技术细节归档到海马体抽屉
      for (const detail of (parsed.technicalDetails || [])) {
        try {
          await createDrawer({
            title: detail.title,
            rawContent: detail.content,
            sourceType: 'convo',
            wing: options?.agentId || 'general',
            tags: detail.tags || [],
          })
          result.detailsArchived++
        } catch (err) {
          result.errors.push(`技术细节归档失败: ${detail.title}`)
        }
      }
    } catch (err) {
      result.errors.push(`LLM 挖掘失败: ${String(err)}`)
    }
  }

  return result
}

// ─── 辅助 ───

let _decisionRoomId: string | null = null

/** 获取或创建决策房间 */
async function getOrCreateDecisionRoom(): Promise<string> {
  if (_decisionRoomId) return _decisionRoomId

  const { run: dbRun, query: dbQuery } = await import('../db/repository')
  const rows = await dbQuery(
    "SELECT id FROM memory_rooms WHERE room_type = 'decisions' LIMIT 1"
  ) as Array<{ id: string }>

  if (rows[0]) {
    _decisionRoomId = rows[0].id
    return _decisionRoomId
  }

  const id = generateId()
  await dbRun(
    `INSERT OR IGNORE INTO memory_rooms (id, name, description, icon, room_type, sort_order)
     VALUES (?, '决策档案馆', '从对话中提取的重要决策', '⚖️', 'decisions', 120)`,
    [id]
  )
  _decisionRoomId = id
  return id
}
