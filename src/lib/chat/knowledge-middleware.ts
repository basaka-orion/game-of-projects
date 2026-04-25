/**
 * Knowledge Middleware — 统一知识注入中间件
 *
 * 所有 Agent 对话的前置处理步骤。
 * 从 Wiki、Drawer、知识图谱、记忆宫殿、原始来源 5 层并行检索，
 * 按相关性和重要性排序，在 token 预算内组装为 prompt 片段。
 *
 * 消费入口：
 * - context.ts (副官对话)
 * - engine.ts (团队协作)
 * - telegram/handler.ts (Telegram 对话)
 */
import { query } from '../db/repository'
import { loadCognitiveProfile, renderCognitivePrompt } from '../boss/cognitive-profile'
import { extractSearchTerms } from '../knowledge/query-analysis'

// ─── 接口 ───

export interface KnowledgeSearchParams {
  /** 用户消息（作为搜索种子） */
  userMessage: string
  /** 当前 Agent ID（用于加载 Agent 专属记忆） */
  agentId?: string
  /** 活跃项目标题（额外搜索关键词） */
  projectTitles?: string[]
  /** Token 预算上限（默认 1200） */
  tokenBudget?: number
  /** 搜索深度 */
  depth: 'quick' | 'standard' | 'deep'
}

export interface KnowledgeSearchResult {
  wikiHits: Array<{
    title: string
    summary: string
    pageId: string
    importance: number
    confidence: number
    score: number
  }>
  drawerHits: Array<{
    title: string
    rawContent: string
    drawerId: string
    sourceType: string
    score: number
  }>
  graphTriples: Array<{
    subject: string
    predicate: string
    object: string
    confidence: number
  }>
  memoryHits: Array<{
    content: string
    category: string
    importance: number
    roomName: string
  }>
  sourceHits: Array<{
    title: string
    content: string
    sourceType: string
    url: string
    score: number
  }>
}

export interface InjectedContext {
  promptFragment: string
  tokensUsed: number
  searchResult: KnowledgeSearchResult
}

// ─── 中文停用词 ───

const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
  '自己', '这', '他', '她', '它', '们', '那', '什么', '怎么', '如何', '为什么',
  '可以', '能', '请', '帮', '给', '让', '把', '被', '从', '对', '用', '这个',
  '那个', '哪个', '哪些', '多少', '几', '还', '又', '再', '更', '最', '非常',
  '吗', '呢', '吧', '啊', '呀', '嗯', '哦', '哈', '嘿', '喂',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'it', 'its',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they',
  'and', 'or', 'but', 'not', 'no', 'if', 'then', 'than', 'so', 'too',
])

// ─── 智能关键词提取 ───

export function extractSearchKeywords(
  message: string,
  fallbackTitles?: string[]
): string[] {
  const unique = extractSearchTerms(message, { maxTerms: 15 })

  // 如果关键词不足 3 个，回退到项目标题
  if (unique.length < 3 && fallbackTitles && fallbackTitles.length > 0) {
    const titleWords = fallbackTitles.flatMap(t => t.split(/[\s,，、]+/)).filter(w => w.length > 1)
    for (const w of titleWords) {
      if (!unique.includes(w) && !STOP_WORDS.has(w)) unique.push(w)
    }
  }

  return unique.slice(0, 15)
}

// ─── 估算 token 数 ───

function estimateTokens(text: string): number {
  // 粗估：中文约 1.5 字/token，英文约 4 字符/token
  const cnChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const enChars = text.length - cnChars
  return Math.ceil(cnChars / 1.5 + enChars / 4)
}

// ─── 核心检索 ───

export async function retrieveAndInject(
  params: KnowledgeSearchParams
): Promise<InjectedContext> {
  const { userMessage, agentId, projectTitles, depth } = params
  const tokenBudget = params.tokenBudget || 2000
  const keywords = extractSearchKeywords(userMessage, projectTitles)

  const result: KnowledgeSearchResult = {
    wikiHits: [],
    drawerHits: [],
    graphTriples: [],
    memoryHits: [],
    sourceHits: [],
  }

  if (keywords.length === 0) {
    return { promptFragment: '', tokensUsed: 0, searchResult: result }
  }

  const searchQuery = keywords.join(' ')
  const wikiLimit = depth === 'quick' ? 10 : depth === 'standard' ? 15 : 25
  const drawerLimit = depth === 'quick' ? 3 : depth === 'standard' ? 6 : 10
  const sourceLimit = depth === 'quick' ? 3 : depth === 'standard' ? 5 : 8

  // 并行检索 5 层
  const [wikiRows, drawerRows, sourceRows, tripleRows, memoryRows] = await Promise.all([
    // Wiki 页面
    (async () => {
      try {
        const { searchPages } = await import('../knowledge/wiki')
        return await searchPages(searchQuery, wikiLimit)
      } catch { return [] as any[] }
    })(),
    // Drawer 原始记忆
    (async () => {
      try {
        const { searchDrawers } = await import('../knowledge/drawer')
        return await searchDrawers(searchQuery, drawerLimit)
      } catch { return [] as any[] }
    })(),
    // Sources
    (async () => {
      try {
        const { searchSources } = await import('../knowledge/wiki')
        return await searchSources(searchQuery, sourceLimit)
      } catch { return [] as any[] }
    })(),
    // 知识图谱三元组
    (async () => {
      try {
        const mainKeywords = keywords.slice(0, 3)
        const allTriples: any[] = []
        for (const kw of mainKeywords) {
          const rows = await query<{
            subject: string; predicate: string; object: string; confidence: number
          }>(
            'SELECT subject, predicate, object, confidence FROM knowledge_triples WHERE subject LIKE ? OR object LIKE ? ORDER BY confidence DESC LIMIT 5',
            [`%${kw}%`, `%${kw}%`]
          )
          allTriples.push(...rows)
        }
        // 去重
        const seen = new Set<string>()
        return allTriples.filter(t => {
          const key = `${t.subject}-${t.predicate}-${t.object}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        }).slice(0, 15)
      } catch { return [] as any[] }
    })(),
    // 记忆宫殿
    (async () => {
      try {
        const mainKeywords = keywords.slice(0, 3)
        const allItems: any[] = []
        for (const kw of mainKeywords) {
          const rows = await query<{
            content: string; type: string; importance: number; metadata_json: string
          }>(
            "SELECT content, type, importance, metadata_json FROM memory_items WHERE content LIKE ? AND importance >= 50 ORDER BY importance DESC LIMIT 4",
            [`%${kw}%`]
          )
          allItems.push(...rows)
        }
        const seen = new Set<string>()
        return allItems.filter(m => {
          if (seen.has(m.content)) return false
          seen.add(m.content)
          return true
        }).slice(0, 8)
      } catch { return [] as any[] }
    })(),
  ])

  // 整理结果
  result.wikiHits = (wikiRows || []).map((w: any) => ({
    title: w.title,
    summary: w.summary || (w.content || '').slice(0, 200),
    pageId: w.id,
    importance: w.importance || 50,
    confidence: w.confidence || 0.5,
    score: w.score || 0,
  }))

  result.drawerHits = (drawerRows || []).map((d: any) => ({
    title: d.title,
    rawContent: (d.rawContent || '').slice(0, 300),
    drawerId: d.id,
    sourceType: d.source_type || '',
    score: d.score || 0,
  }))

  result.sourceHits = (sourceRows || []).map((s: any) => ({
    title: s.title,
    content: (s.content || '').slice(0, 200),
    sourceType: s.source_type || '',
    url: s.url || '',
    score: s.score || 0,
  }))

  result.graphTriples = (tripleRows || []).map((t: any) => ({
    subject: t.subject,
    predicate: t.predicate,
    object: t.object,
    confidence: t.confidence,
  }))

  result.memoryHits = (memoryRows || []).map((m: any) => ({
    content: m.content.slice(0, 150),
    category: m.type || 'general',
    importance: m.importance,
    roomName: 'palace',
  }))

  // 渲染
  const promptFragment = renderKnowledgeContext(result, tokenBudget)
  return {
    promptFragment,
    tokensUsed: estimateTokens(promptFragment),
    searchResult: result,
  }
}

// ─── 渲染为 Prompt 片段 ───

export function renderKnowledgeContext(
  result: KnowledgeSearchResult,
  tokenBudget: number
): string {
  const cognitivePrompt = renderCognitivePrompt(loadCognitiveProfile(), 'context')

  if (
    !cognitivePrompt &&
    result.wikiHits.length === 0 &&
    result.drawerHits.length === 0 &&
    result.graphTriples.length === 0 &&
    result.memoryHits.length === 0 &&
    result.sourceHits.length === 0
  ) {
    return ''
  }

  const parts: string[] = ['<knowledge-context>']
  let usedTokens = 0

  if (cognitivePrompt) {
    parts.push(cognitivePrompt)
    usedTokens += estimateTokens(cognitivePrompt)
  }

  // Wiki 页面 (预算 ~45%)
  if (result.wikiHits.length > 0) {
    const wikiBudget = Math.floor(tokenBudget * 0.45)
    const wikiParts: string[] = ['## 相关知识']
    for (const hit of result.wikiHits) {
      const line = `- [[${hit.title}]]: ${hit.summary}`
      const tokens = estimateTokens(line)
      if (usedTokens + tokens > wikiBudget) break
      wikiParts.push(line)
      usedTokens += tokens
    }
    if (wikiParts.length > 1) parts.push(wikiParts.join('\n'))
  }

  // Drawer 原始记忆 (预算 ~15%)
  if (result.drawerHits.length > 0) {
    const drawerBudget = Math.floor(tokenBudget * 0.15)
    const dParts: string[] = ['## 原始记录']
    let dUsed = 0
    for (const hit of result.drawerHits) {
      const line = `- [${hit.sourceType || 'source'}] ${hit.rawContent}`
      const tokens = estimateTokens(line)
      if (dUsed + tokens > drawerBudget) break
      dParts.push(line)
      dUsed += tokens
    }
    if (dParts.length > 1) { parts.push(dParts.join('\n')); usedTokens += dUsed }
  }

  // 知识图谱 (预算 ~12%)
  if (result.graphTriples.length > 0) {
    const tripleBudget = Math.floor(tokenBudget * 0.12)
    const tParts: string[] = ['## 知识关系']
    let tUsed = 0
    for (const t of result.graphTriples) {
      const line = `- ${t.subject} → ${t.predicate} → ${t.object}`
      const tokens = estimateTokens(line)
      if (tUsed + tokens > tripleBudget) break
      tParts.push(line)
      tUsed += tokens
    }
    if (tParts.length > 1) { parts.push(tParts.join('\n')); usedTokens += tUsed }
  }

  // 记忆宫殿 (预算 ~15%)
  if (result.memoryHits.length > 0) {
    const memBudget = Math.floor(tokenBudget * 0.15)
    const mParts: string[] = ['## 记忆回溯']
    let mUsed = 0
    for (const m of result.memoryHits) {
      const line = `- [${m.category}] ${m.content}`
      const tokens = estimateTokens(line)
      if (mUsed + tokens > memBudget) break
      mParts.push(line)
      mUsed += tokens
    }
    if (mParts.length > 1) { parts.push(mParts.join('\n')); usedTokens += mUsed }
  }

  // Sources (预算 ~13%)
  if (result.sourceHits.length > 0) {
    const srcBudget = Math.floor(tokenBudget * 0.13)
    const sParts: string[] = ['## 来源参考']
    let sUsed = 0
    for (const s of result.sourceHits) {
      const line = `- ${s.title}: ${s.content}`
      const tokens = estimateTokens(line)
      if (sUsed + tokens > srcBudget) break
      sParts.push(line)
      sUsed += tokens
    }
    if (sParts.length > 1) { parts.push(sParts.join('\n')); usedTokens += sUsed }
  }

  parts.push('</knowledge-context>')
  return parts.join('\n')
}
