/**
 * 小白诊断引擎
 * 用 OpenBasaka 的 provider.ts 实现流式 AI 诊断
 * 流程：知识库搜索 → 时事搜索 → AI 流式生成 → 结果返回
 */
import { chatCompletionStream, type LLMConfig, type ChatMessage, type ContentPart } from '../ai/provider'
import { searchKnowledge } from './knowledge-base'
import { quickWikiLookup } from '../knowledge/query-engine'
import { searchDrawers } from '../knowledge/drawer'
import { executeTool } from '../tools'
import { loadCognitiveProfile, renderCognitivePrompt } from '../boss/cognitive-profile'

export type StreamPhase = 'kb' | 'ai' | 'done' | 'error'

export interface DiagnosisResult {
  problem: string
  solution: string
  source: 'local' | 'web' | 'generated'
  confidence: number
  actionType: string
  tags?: string[]
}

export interface DiagnoseCallbacks {
  onPhase: (phase: StreamPhase) => void
  onChunk: (text: string) => void
  onDone: (result: DiagnosisResult) => void
  onError: (err: Error) => void
}

/** 附件数据 — 支持多模态 */
export interface AttachmentData {
  type: 'image' | 'file'
  dataUrl?: string
  name: string
  description?: string
}

/** 构建诊断 system prompt */
function buildSystemPrompt(mode: 'diagnose' | 'analyze'): string {
  if (mode === 'analyze') {
    return `你是"小白"——一个全能分析助手。用户会给你各种内容（文本、图片、想法、创意等），请你进行深度分析、提供见解和建议。
规则：
- 用 Markdown 格式回答
- 结构化、层次清晰
- 给出具体可执行的建议
- 如有图片附件，仔细分析图片内容
- 如有 <realtime-search-results> 标签，基于其中的搜索结果回答时事问题
- 绝对不允许编造新闻、版本号、发布日期等时效性信息
- 用中文回答`
  }

  return `你是"小白"——一个极其精通各种技术的AI诊断助手。用户会描述遭遇的问题（可能附截图），请你诊断并给出解决方案。
规则：
- 用 Markdown 格式回答
- 先简要诊断问题根因
- 给出具体的解决步骤（代码/命令/操作）
- 如果不确定，列出多种可能性
- 如有图片附件，仔细分析截图中的错误信息、UI 状态、代码内容
- 如有 <realtime-search-results> 标签，基于其中的搜索结果回答时事问题
- 绝对不允许编造新闻、版本号、发布日期等时效性信息
- 用中文回答`
}

/** 流式诊断入口 — 支持可选的 Agent 人格覆盖 */
export async function diagnoseStreaming(
  llmConfig: LLMConfig,
  problemText: string,
  mode: 'diagnose' | 'analyze' = 'diagnose',
  callbacks: DiagnoseCallbacks,
  attachments?: AttachmentData[],
  personaOverride?: string
): Promise<void> {
  // Phase 0: 先查 Wiki 知识库（最高优先级）
  callbacks.onPhase('kb')

  try {
    const wikiResult = await quickWikiLookup(problemText)
    if (wikiResult && wikiResult.found && wikiResult.confidence >= 0.4) {
      // Wiki 命中 → 直接返回
      callbacks.onPhase('done')
      callbacks.onDone({
        problem: problemText,
        solution: `📚 **知识库命中** (置信度: ${(wikiResult.confidence * 100).toFixed(0)}%)\n\n${wikiResult.content}`,
        source: 'local',
        confidence: wikiResult.confidence,
        actionType: 'copy',
        tags: ['wiki', 'knowledge-vault'],
      })
      return
    }
  } catch {
    // Wiki 查询失败不阻断后续流程
  }

  // Phase 0.5: 海马体原始记忆回溯（仅细节类问题触发）
  const detailSignals = ['debug', 'error', 'trace', '过程', '细节', '原始', '为什么', 'how', 'why', 'log', 'stack', '报错', '步骤', '经过', '详情']
  const needsDetail = detailSignals.some(s => problemText.toLowerCase().includes(s))

  if (needsDetail) {
    try {
      const drawerHits = await searchDrawers(problemText, 3)
      if (drawerHits.length > 0 && drawerHits[0].score > 0.5) {
        const drawerContent = drawerHits.map(d =>
          `**${d.title}** [Drawer:${d.id}]\n${d.rawContent.slice(0, 500)}`
        ).join('\n---\n')
        callbacks.onPhase('done')
        callbacks.onDone({
          problem: problemText,
          solution: `🗄️ **原始记忆命中** (${drawerHits.length} 条)\n\n${drawerContent}`,
          source: 'local',
          confidence: Math.min(drawerHits[0].score, 0.95),
          actionType: 'copy',
          tags: ['drawer', 'hippocampus'],
        })
        return
      }
    } catch {
      // Drawer 搜索失败不阻断后续流程
    }
  }

  // Phase 1: 搜索 XiaoBai 知识库
  try {
    const kbResult = await searchKnowledge(problemText)
    if (kbResult && kbResult.rating >= 4) {
      callbacks.onPhase('done')
      callbacks.onDone({
        problem: problemText,
        solution: kbResult.solution,
        source: 'local',
        confidence: kbResult.confidence,
        actionType: kbResult.actionType || 'copy',
        tags: kbResult.tags ? kbResult.tags.split(',') : [],
      })
      return
    }
  } catch {
    // 知识库搜索失败不阻断 AI 流程
  }

  // Phase 1.5: 时事检测 — 如果问题涉及时事，先搜索外网
  const timeSignals = ['最新', '最近', '今天', '现在', '新闻', '发布', 'release', 'update', 'latest', 'current', '目前', '行情', '股价', '天气']
  const needsRealtime = timeSignals.some(s => problemText.toLowerCase().includes(s))

  let searchContext = ''
  if (needsRealtime) {
    try {
      const searchResult = await executeTool('web_search', { query: problemText, max_results: 5 })
      if (searchResult?.success && searchResult.data) {
        searchContext = typeof searchResult.data === 'string'
          ? searchResult.data
          : JSON.stringify(searchResult.data)
      }
    } catch {
      // 搜索失败不阻断
    }
  }

  // Phase 2: AI 流式生成
  callbacks.onPhase('ai')

  // 构造消息：支持多模态（图片）
  const hasImages = attachments?.some(a => a.type === 'image' && a.dataUrl)
  let userContent: string | ContentPart[]

  if (hasImages) {
    // 多模态消息：文本 + 图片
    const parts: ContentPart[] = [
      { type: 'text', text: problemText },
    ]
    if (searchContext) {
      parts.push({ type: 'text', text: `\n\n<realtime-search-results>\n${searchContext}\n</realtime-search-results>` })
    }
    for (const att of attachments || []) {
      if (att.type === 'image' && att.dataUrl) {
        parts.push({ type: 'image_url', image_url: { url: att.dataUrl } })
      }
    }
    userContent = parts
  } else {
    // 纯文本消息
    userContent = problemText
    if (attachments && attachments.length > 0) {
      const fileDescs = attachments.map(a => a.description || `[FILE] ${a.name}`).join('\n')
      userContent += '\n\n附件清单：\n' + fileDescs
    }
    if (searchContext) {
      userContent += '\n\n<realtime-search-results>\n' + searchContext + '\n</realtime-search-results>'
    }
  }

  const cognitivePrompt = renderCognitivePrompt(loadCognitiveProfile())
  const systemPrompt = [personaOverride || buildSystemPrompt(mode), cognitivePrompt].filter(Boolean).join('\n\n')

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ]

  let fullText = ''

  try {
    await chatCompletionStream(llmConfig, messages, {
      onChunk: (chunk) => {
        fullText += chunk
        callbacks.onChunk(chunk)
      },
      onDone: () => {
        callbacks.onPhase('done')
        callbacks.onDone({
          problem: problemText,
          solution: fullText,
          source: searchContext ? 'web' : 'generated',
          confidence: 0.75,
          actionType: 'copy',
        })
      },
      onError: (err) => {
        callbacks.onPhase('error')
        callbacks.onError(err)
      },
    })
  } catch (err) {
    callbacks.onPhase('error')
    callbacks.onError(err instanceof Error ? err : new Error(String(err)))
  }
}

/** 流式追问（带上下文） */
export async function followUpStreaming(
  llmConfig: LLMConfig,
  originalProblem: string,
  previousSolution: string,
  previousFollowUps: Array<{ question: string; answer: string }>,
  newQuestion: string,
  callbacks: Omit<DiagnoseCallbacks, 'onDone'> & { onDone: (answer: string) => void }
): Promise<void> {
  callbacks.onPhase('ai')

  const contextMessages: ChatMessage[] = [
    {
      role: 'system',
      content: '你是"小白"——AI诊断助手。用户在追问之前的诊断结果，请基于上下文给出补充回答。用 Markdown 格式，用中文回答。',
    },
    {
      role: 'user',
      content: `原始问题：${originalProblem}`,
    },
    {
      role: 'assistant',
      content: previousSolution,
    },
  ]

  // 加入历史追问
  for (const fu of previousFollowUps) {
    contextMessages.push({ role: 'user', content: fu.question })
    contextMessages.push({ role: 'assistant', content: fu.answer })
  }

  contextMessages.push({ role: 'user', content: newQuestion })

  let fullText = ''

  try {
    await chatCompletionStream(llmConfig, contextMessages, {
      onChunk: (chunk) => {
        fullText += chunk
        callbacks.onChunk(chunk)
      },
      onDone: () => {
        callbacks.onPhase('done')
        callbacks.onDone(fullText)
      },
      onError: (err) => {
        callbacks.onPhase('error')
        callbacks.onError(err)
      },
    })
  } catch (err) {
    callbacks.onPhase('error')
    callbacks.onError(err instanceof Error ? err : new Error(String(err)))
  }
}
