/**
 * Self-Nudge — 自我知识持久化
 *
 * 聊天会话结束后自动分析对话，提取"值得记住的知识"
 * 写入记忆宫殿 agent_knowledge 房间
 *
 * 灵感来自 Hermes Agent 的 Self-Nudging 机制
 */
import { LLMConfig, chatCompletion, getDefaultConfig } from '../ai/provider'
import { saveMemoryItem, getRoomByType } from './palace'
import { addMemoryEntry } from '../agents/agent-memory'
import { extractTriplesFromText } from './knowledge-graph'
import { query } from '../db/repository'
import { getSetting } from '../db/store'
import { createDrawer } from '../knowledge/drawer'

interface NudgeResult {
  memoriesCreated: number
  insights: string[]
}

/** 分析对话并提取值得记忆的知识 */
export async function selfNudgeFromConversation(
  llmConfig: LLMConfig,
  messages: Array<{ role: string; content: string }>
): Promise<NudgeResult> {
  if (messages.length < 4) return { memoriesCreated: 0, insights: [] }

  // 只取最近 20 条消息分析
  const recent = messages.slice(-20)
  const conversation = recent
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `[${m.role}]: ${m.content.slice(0, 300)}`)
    .join('\n')

  const systemPrompt = `你是一个知识提取引擎。分析以下对话，提取对 AI 助手未来服务用户有价值的信息。

输出格式（每条一行，JSON 数组）：
[{"category":"preference|insight|goal|pattern","content":"具体内容","importance":1-5}]

规则：
- 只提取确实值得长期记忆的信息
- 不要提取显而易见的常识
- importance: 1=一般参考, 3=重要偏好, 5=核心价值观
- 最多提取 5 条
- 用中文`

  try {
    const response = await chatCompletion(
      llmConfig,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: conversation },
      ],
      0.3,
      1024
    )

    // 解析 JSON
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return { memoriesCreated: 0, insights: [] }

    const items: Array<{ category: string; content: string; importance: number }> = JSON.parse(jsonMatch[0])
    const insights: string[] = []

    // 确保 agent_knowledge 房间存在
    const room = await ensureAgentKnowledgeRoom()

    for (const item of items) {
      try {
        await saveMemoryItem({
          roomId: room.id,
          content: item.content,
          category: item.category,
          importance: item.importance,
          source: 'self-nudge',
        })
        insights.push(item.content)
      } catch { /* ignore */ }
    }

    // 同时写入 Agent Memory（L1 层数据源）和 Knowledge Graph（L3 层数据源）
    try {
      for (const item of items.slice(0, 3)) {
        await addMemoryEntry('general', `[${item.category}] ${item.content}`)
      }
      await extractTriplesFromText(conversation)
    } catch { /* ignore */ }

    // 所有洞察写入 MemPalace 抽屉（交由后台 Karpathy 编译器处理）
    try {
      const categoryWingMap: Record<string, string> = {
        'preference': 'identity',
        'pattern': 'identity',
        'insight': 'insight',
        'goal': 'experience',
      }
      for (const item of items) {
        await createDrawer({
          title: `[${item.category}] ${item.content.slice(0, 50)}`,
          rawContent: `## 自我洞察\n\n${item.content}\n\n---\n*来源：Self-Nudge 自动提取*\n*重要性：${item.importance}/5*`,
          sourceType: 'self-nudge',
          wing: categoryWingMap[item.category] || 'experience',
          hall: item.category,
          tags: ['self-nudge', item.category],
          metadata: { source: 'self-nudge', category: item.category, importance: item.importance },
        })
      }
    } catch { /* non-critical */ }

    // 自我审计：定期检查 Prompt 层冗余
    try {
      await auditPromptLayers(items)
    } catch { /* ignore */ }

    // Hermes 闭环：从对话经验中自动提取可复用技能
    try {
      const { createSkillFromExperience } = await import('../skills/evolution')
      const conversationText = recent.map(m => `${m.role}: ${m.content.slice(0, 200)}`).join('\n')
      // 只在有高价值洞察时触发技能提取
      const highValue = items.filter(i => i.importance >= 4)
      if (highValue.length > 0) {
        const skill = await createSkillFromExperience(conversationText, highValue[0].category)
        if (skill) {
          insights.push(`[技能发现] ${skill.skillName}`)
        }
      }
    } catch { /* non-critical */ }

    return { memoriesCreated: insights.length, insights }
  } catch {
    return { memoriesCreated: 0, insights: [] }
  }
}

/** 确保 agent_knowledge 房间存在 */
async function ensureAgentKnowledgeRoom(): Promise<{ id: string }> {
  // 检查是否已存在
  const existing = await getRoomByType('agent_knowledge')
  if (existing) return existing

  // 创建房间
  const { run: dbRun } = await import('../db/repository')
  const { generateId } = await import('../db/schema')
  const id = generateId()
  await dbRun(
    `INSERT OR IGNORE INTO memory_rooms (id, name, description, icon, room_type, sort_order)
     VALUES (?, 'Agent 知识库', 'BASAKA 自动积累的知识和洞察', '🤖', 'agent_knowledge', 100)`,
    [id]
  )
  return { id }
}

/**
 * 自我审计：检查 Prompt 层是否存在冗余
 * 每 10 次 self-nudge 触发一次，节省 Token
 */
async function auditPromptLayers(
  extractedItems: Array<{ category: string; content: string; importance: number }>
): Promise<void> {
  // 只在每 10 次时执行
  try {
    const auditCount = await query<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM memory_items WHERE source = 'self-audit'"
    )
    if ((auditCount[0]?.cnt || 0) % 10 !== 0) return
  } catch { return }

  const provider = getSetting('llm_provider', 'deepseek')
  const defaults = getDefaultConfig(provider)
  const config: LLMConfig = {
    provider: provider as LLMConfig['provider'],
    apiKey: getSetting('llm_api_key', ''),
    baseUrl: getSetting('llm_base_url', defaults.baseUrl),
    model: getSetting('llm_model', defaults.model),
  }

  // 获取各层大小
  const layers = await query(`SELECT 'agent_memory' as label, COALESCE(SUM(LENGTH(entry)), 0) as char_count FROM agent_memories
    UNION ALL SELECT 'knowledge_triples', COALESCE(COUNT(*) * 100, 0) FROM knowledge_triples
    UNION ALL SELECT 'boss_memory', COALESCE(SUM(LENGTH(content)), 0) FROM boss_memory`) as Array<{ label: string; char_count: number }>

  const auditPrompt = `审计 AI Agent 的记忆层冗余：

记忆层大小：
${layers.map(l => `- ${l.label}: ${l.char_count} 字符`).join('\n')}

最近提取的条目：
${extractedItems.map(i => `- [${i.category}] ${i.content.slice(0, 60)}`).join('\n')}

检查项：
1. 跨层重复信息
2. 应清理的过时信息
3. 某主题过度代表

输出 JSON: {"redundancies":["描述"],"pruneSuggestions":["建议"],"status":"healthy|needs_attention"}`

  try {
    const result = await chatCompletion(config, [
      { role: 'system', content: auditPrompt },
      { role: 'user', content: '执行 Prompt 层审计。' },
    ], 0.3, 512)

    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const audit = JSON.parse(jsonMatch[0]) as {
        redundancies: string[]; pruneSuggestions: string[]; status: string
      }
      if (audit.status === 'needs_attention') {
        const room = await ensureAgentKnowledgeRoom()
        const { saveMemoryItem } = await import('./palace')
        await saveMemoryItem({
          roomId: room.id,
          content: `[Self-Audit] 冗余: ${audit.redundancies?.join('; ')}. 建议: ${audit.pruneSuggestions?.join('; ')}`,
          category: 'audit',
          importance: 40,
          source: 'self-audit',
        })
      }
    }
  } catch { /* audit failure is non-critical */ }
}
