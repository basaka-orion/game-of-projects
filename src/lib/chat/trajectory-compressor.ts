/**
 * Trajectory Compressor — 辙迹压缩器
 *
 * 对标 Hermes-Agent 的 trajectory_compressor.py
 * 长对话超过阈值时，将早期的工具调用和中间结果压缩为摘要。
 * 保留用户消息、关键决策点和最终结果，压缩中间推理步骤。
 */
import { chatCompletion, LLMConfig } from '../ai/provider'
import { getCompileLLMConfig } from '../knowledge/wiki-compiler'

// ─── 接口 ───

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolName?: string
  toolCallId?: string
}

export interface CompressionResult {
  originalCount: number
  compressedCount: number
  compressionRatio: number
  summary: string
  compressedMessages: ChatMessage[]
}

// ─── 配置 ───

/** 触发压缩的消息数量阈值 */
const COMPRESSION_THRESHOLD = 80

/** 压缩后保留的最近消息数（不被压缩） */
const RECENT_WINDOW = 20

/** 压缩后目标 token 数 */
const TARGET_SUMMARY_TOKENS = 500

// ─── 压缩 Prompt ───

const COMPRESSION_PROMPT = `你是对话压缩器。将以下对话历史压缩为一段结构化摘要。

规则：
1. 保留所有用户的核心请求和问题
2. 保留所有关键决策和结论
3. 保留重要的技术细节和数据点
4. 压缩中间推理步骤、工具调用过程、重复内容
5. 使用中文

输出格式：
## 已压缩对话历史

### 用户需求
[用户的核心请求和问题]

### 关键决策
[做出的重要决策和选择]

### 技术细节
[涉及的重要技术信息]

### 当前状态
[对话的当前进展和待办事项]`

// ─── 核心 ───

/** 检查是否需要压缩 */
export function shouldCompress(messages: ChatMessage[]): boolean {
  return messages.length >= COMPRESSION_THRESHOLD
}

/** 压缩对话历史 */
export async function compressTrajectory(
  messages: ChatMessage[],
  llmConfig?: LLMConfig
): Promise<CompressionResult> {
  if (messages.length <= RECENT_WINDOW + 5) {
    return {
      originalCount: messages.length,
      compressedCount: messages.length,
      compressionRatio: 1,
      summary: '',
      compressedMessages: messages,
    }
  }

  const config = llmConfig || getCompileLLMConfig()

  // 1. 分割：早期（待压缩） vs 最近（保留）
  const earlyMessages = messages.slice(0, messages.length - RECENT_WINDOW)
  const recentMessages = messages.slice(messages.length - RECENT_WINDOW)

  // 2. 构建待压缩的文本
  const earlyText = earlyMessages
    .filter(m => m.role !== 'system')
    .map(m => {
      if (m.role === 'tool') {
        return `[工具结果:${m.toolName || 'unknown'}] ${m.content.slice(0, 500)}`
      }
      return `[${m.role}] ${m.content.slice(0, 1000)}`
    })
    .join('\n\n')

  // 3. LLM 压缩
  let summary = ''
  try {
    summary = await chatCompletion(
      config,
      [
        { role: 'system', content: COMPRESSION_PROMPT },
        { role: 'user', content: earlyText.slice(0, 12000) },
      ],
      0.3,
      TARGET_SUMMARY_TOKENS
    )
  } catch (err) {
    // LLM 失败时使用简单截断
    summary = earlyMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-5)
      .map(m => `[${m.role}] ${m.content.slice(0, 200)}`)
      .join('\n\n')
    summary = `[压缩失败，保留最近关键消息]\n\n${summary}`
  }

  // 4. 构建压缩后的消息列表
  const systemMessage = messages.find(m => m.role === 'system')
  const compressedMessages: ChatMessage[] = []

  // 保留 system prompt
  if (systemMessage) {
    compressedMessages.push(systemMessage)
  }

  // 添加压缩摘要作为 system 消息
  compressedMessages.push({
    role: 'system',
    content: `<compressed-history>\n以下是对话历史的压缩摘要：\n\n${summary}\n</compressed-history>`,
  })

  // 添加最近的消息
  compressedMessages.push(...recentMessages)

  return {
    originalCount: messages.length,
    compressedCount: compressedMessages.length,
    compressionRatio: compressedMessages.length / messages.length,
    summary,
    compressedMessages,
  }
}

/** 增量压缩 — 仅压缩新增部分（与上次压缩比较） */
export async function incrementalCompress(
  previousSummary: string,
  newMessages: ChatMessage[],
  llmConfig?: LLMConfig
): Promise<string> {
  const config = llmConfig || getCompileLLMConfig()

  const newText = newMessages
    .filter(m => m.role !== 'system')
    .map(m => `[${m.role}] ${m.content.slice(0, 500)}`)
    .join('\n\n')

  try {
    return await chatCompletion(
      config,
      [
        {
          role: 'system',
          content: `你是增量压缩器。已有压缩摘要和新增对话内容，请将新内容整合进摘要中。
输出更新后的完整摘要。`,
        },
        {
          role: 'user',
          content: `<existing-summary>\n${previousSummary}\n</existing-summary>\n\n<new-content>\n${newText.slice(0, 8000)}\n</new-content>`,
        },
      ],
      0.3,
      TARGET_SUMMARY_TOKENS
    )
  } catch {
    return previousSummary
  }
}
