/**
 * Boss 洞察提取器
 * 从聊天对话中自动提取用户偏好、行为模式和目标
 */
import { chatCompletion, LLMConfig, ChatMessage } from '../ai/provider'
import { dbSaveMemory } from '../db/repository'

const EXTRACTION_PROMPT = `你是 Boss 行为分析引擎。分析以下对话，提取关于 Boss 的洞察。

输出 JSON：
{
  "new_interests": ["新发现的兴趣领域"],
  "new_dislikes": ["新发现的厌恶"],
  "goal_updates": ["短期:xxx" 或 "长期:xxx"],
  "preference_signals": ["分析型/远见型/务实型/创意型，或其他偏好信号"],
  "risk_signals": ["对风险的态度"],
  "recurring_themes": ["反复出现的主题"],
  "emotional_state": "当前情绪状态",
  "confidence": 0.0-1.0
}

规则：
- 只提取明确的信息，不要猜测
- 每个字段最多 3 项
- confidence 反映你对这些判断的确信程度
- 如果对话太短或没有有用信息，返回空数组`

interface ExtractedInsights {
  new_interests: string[]
  new_dislikes: string[]
  goal_updates: string[]
  preference_signals: string[]
  risk_signals: string[]
  recurring_themes: string[]
  emotional_state: string
  confidence: number
}

function safeParseInsights(text: string): ExtractedInsights | null {
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0]) as ExtractedInsights
  } catch { /* ignore */ }
  return null
}

/** 从对话中提取 Boss 洞察 */
export async function extractBossInsights(
  config: LLMConfig,
  messages: Array<{ role: string; content: string }>
): Promise<boolean> {
  // 只在有意义的对话上运行（至少 2 条用户消息）
  const userMessages = messages.filter(m => m.role === 'user')
  if (userMessages.length < 2) return false

  // 截取最近的消息（控制 token 消耗）
  const recentMessages = messages.slice(-20)

  try {
    const chatMessages: ChatMessage[] = [
      { role: 'system', content: EXTRACTION_PROMPT },
      {
        role: 'user',
        content: `分析以下对话：\n\n${recentMessages
          .map(m => `[${m.role}]: ${m.content}`)
          .join('\n')}`,
      },
    ]

    const response = await chatCompletion(config, chatMessages, 0.3, 1024)
    const insights = safeParseInsights(response)
    if (!insights || insights.confidence < 0.3) return false

    // 将洞察写入 boss_memory
    const writes: Promise<string>[] = []

    for (const interest of (insights.new_interests || [])) {
      writes.push(dbSaveMemory('preference', interest, 'chat', insights.confidence))
    }

    for (const dislike of (insights.new_dislikes || [])) {
      writes.push(dbSaveMemory('preference', `不喜欢: ${dislike}`, 'chat', insights.confidence))
    }

    for (const goal of (insights.goal_updates || [])) {
      writes.push(dbSaveMemory('goal', goal, 'chat', insights.confidence))
    }

    for (const signal of (insights.preference_signals || [])) {
      writes.push(dbSaveMemory('pattern', signal, 'chat', insights.confidence))
    }

    for (const signal of (insights.risk_signals || [])) {
      writes.push(dbSaveMemory('pattern', `风险偏好: ${signal}`, 'chat', insights.confidence))
    }

    for (const theme of (insights.recurring_themes || [])) {
      writes.push(dbSaveMemory('pattern', `常谈主题: ${theme}`, 'chat', insights.confidence))
    }

    if (insights.emotional_state) {
      writes.push(dbSaveMemory('emotion', insights.emotional_state, 'chat', insights.confidence * 0.8))
    }

    await Promise.all(writes)
    return writes.length > 0
  } catch {
    return false
  }
}
