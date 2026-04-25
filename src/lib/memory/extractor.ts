/**
 * 自动记忆提取 — 从对话、推演、决策中提取记忆写入房间
 *
 * MemPalace 集成：同时提取知识三元组到知识图谱
 */
import { addMemoryItem } from './palace'
import { extractTriplesFromText } from './knowledge-graph'
import { query } from '../db/repository'

/** 从推演结果提取关键见解 */
export async function extractFromEvaluation(
  projectTitle: string,
  survivalRate: number,
  survivalGrade: string,
  summary: string,
  recommendation: string,
): Promise<void> {
  // War Room Archives
  await addMemoryItem({
    roomId: 'room_war_archives',
    type: 'evaluation',
    content: `[${survivalGrade}] ${projectTitle} — 存活率 ${survivalRate}%。${summary}`,
    source: 'war_room',
    importance: survivalRate >= 80 ? 80 : survivalRate >= 50 ? 50 : 30,
    metadataJson: JSON.stringify({ survivalRate, survivalGrade }),
  })

  // 高分项目也写入 Innovation Lab
  if (survivalRate >= 80) {
    await addMemoryItem({
      roomId: 'room_innovation',
      type: 'highlight',
      content: `高潜力项目：${projectTitle} (${survivalGrade}级)。${recommendation}`,
      source: 'war_room',
      importance: 70,
      metadataJson: JSON.stringify({ survivalRate, survivalGrade }),
    })
  }

  // 提取知识三元组到知识图谱
  try {
    await extractTriplesFromText(`${projectTitle}: ${summary} ${recommendation}`)
  } catch { /* ignore */ }
}

/** 从决策中提取 */
export async function extractFromDecision(
  projectTitle: string,
  decisionType: string,
  survivalRate: number,
): Promise<void> {
  if (decisionType === 'abandon') {
    await addMemoryItem({
      roomId: 'room_graveyard',
      type: 'abandonment',
      content: `${projectTitle} — 已放弃（存活率 ${survivalRate}%）`,
      source: 'decision',
      importance: 40,
      metadataJson: JSON.stringify({ decisionType, survivalRate }),
    })
  } else if (decisionType === 'pursue') {
    await addMemoryItem({
      roomId: 'room_boss_patterns',
      type: 'decision',
      content: `选择推进：${projectTitle}（存活率 ${survivalRate}%）`,
      source: 'decision',
      importance: 60,
      metadataJson: JSON.stringify({ decisionType, survivalRate }),
    })
  } else if (decisionType === 'pivot') {
    await addMemoryItem({
      roomId: 'room_boss_patterns',
      type: 'pivot',
      content: `选择转型：${projectTitle}（存活率 ${survivalRate}%）`,
      source: 'decision',
      importance: 55,
      metadataJson: JSON.stringify({ decisionType, survivalRate }),
    })
  }
}

/** 从突触发现中提取 */
export async function extractFromSynapse(
  sourceTitle: string,
  targetTitle: string,
  synapseType: string,
  reason: string,
): Promise<void> {
  await addMemoryItem({
    roomId: 'room_innovation',
    type: 'synapse',
    content: `${sourceTitle} ↔ ${targetTitle} (${synapseType})：${reason}`,
    source: 'synapse_scanner',
    importance: 65,
    metadataJson: JSON.stringify({ synapseType }),
  })
}

/** 从 Boss 记忆表同步到记忆宫殿 */
export async function syncBossMemoriesToPalace(): Promise<number> {
  const memories = await query<{ category: string; content: string; confidence: number }>(
    'SELECT category, content, confidence FROM boss_memory ORDER BY created_at DESC LIMIT 50'
  )

  let synced = 0
  for (const m of memories) {
    // 检查是否已存在
    const existing = await query<{ id: string }>(
      "SELECT id FROM memory_items WHERE content = ? AND room_id = 'room_boss_patterns' LIMIT 1",
      [m.content]
    )
    if (existing.length > 0) continue

    await addMemoryItem({
      roomId: 'room_boss_patterns',
      type: m.category,
      content: `[${m.category}] ${m.content}`,
      source: 'boss_memory',
      importance: Math.round(m.confidence * 100),
      metadataJson: JSON.stringify({ category: m.category, confidence: m.confidence }),
    })
    synced++
  }
  return synced
}
