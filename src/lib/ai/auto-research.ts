/**
 * 自动研究模式 — 多视角深度研究
 * 灵感来自 autoresearch：每个视角独立 LLM 调用 → 综合结构化报告
 */
import { chatCompletion, LLMConfig, ChatMessage } from './provider'
import { executeTool } from '../tools/index'
import { analyzeKnowledgeQuery } from '../knowledge/query-analysis'

export interface ResearchPerspective {
  name: string
  focus: string
}

export interface ResearchReport {
  topic: string
  perspectives: Array<{
    name: string
    findings: string
    keyPoints: string[]
  }>
  synthesis: string
  recommendations: string[]
  generatedAt: string
}

export interface GroundedResearchSource {
  title: string
  url: string
  snippet: string
  domain: string
  authority: 'official' | 'institutional' | 'media' | 'community' | 'other'
}

export interface GroundedResearchReport {
  topic: string
  summary: string
  notableSignals: string[]
  recommendations: string[]
  sources: GroundedResearchSource[]
  queries: string[]
  grounded: boolean
  generatedAt: string
}

const DEFAULT_PERSPECTIVES: ResearchPerspective[] = [
  { name: '市场分析', focus: '市场规模、增长趋势、目标用户画像、付费意愿' },
  { name: '技术评估', focus: '技术可行性、所需技术栈、开发周期、技术风险' },
  { name: '竞争格局', focus: '主要竞品、差异化机会、护城河可能性' },
  { name: '商业模式', focus: '盈利方式、获客渠道、单位经济模型' },
]

const AUTO_RESEARCH_PATTERN = /(最新|最近|今日|今天|现在|当前|现状|趋势|前沿|权威|官方|政策|发布|行业|市场|研究|报告|未来|机会|风险|版本|新闻|202\d|如何|怎么办|建议|判断|选择|方向|应该|该不该|值不值得|有没有必要)/i

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\[[^\]]+\]\([^)]+\)/g, '$1')
    .replace(/[`*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function classifyAuthority(domain: string): GroundedResearchSource['authority'] {
  if (!domain) return 'other'
  if (/(^|\.)gov(\.|$)|(^|\.)edu(\.|$)|(^|\.)ac\./i.test(domain)) return 'official'
  if (/(^|\.)org(\.|$)|(^|\.)int(\.|$)/i.test(domain)) return 'institutional'
  if (/github\.com|arxiv\.org|nature\.com|science\.org|openai\.com|anthropic\.com|deepmind\.google/i.test(domain)) return 'official'
  if (/reddit\.com|weibo\.com|x\.com|twitter\.com|zhihu\.com|medium\.com/i.test(domain)) return 'community'
  if (/news|times|post|journal|press|wire|techcrunch|theverge|bloomberg|reuters|ft\.com|wsj\.com|36kr\.com/i.test(domain)) return 'media'
  return 'other'
}

function authorityScore(authority: GroundedResearchSource['authority']): number {
  switch (authority) {
    case 'official': return 4
    case 'institutional': return 3
    case 'media': return 2
    case 'community': return 1
    default: return 0
  }
}

function normalizeSnippet(value: unknown): string {
  return stripMarkdown(String(value || '')).slice(0, 280)
}

function normalizeSearchItems(data: unknown): GroundedResearchSource[] {
  const rawItems = Array.isArray(data)
    ? data
    : Array.isArray((data as any)?.web?.results)
      ? (data as any).web.results
      : Array.isArray((data as any)?.results)
        ? (data as any).results
        : []

  return rawItems
    .map((item: any) => {
      const url = String(item?.url || item?.link || '').trim()
      if (!url) return null
      const domain = getDomain(url)
      return {
        title: stripMarkdown(String(item?.title || item?.name || url)).slice(0, 140),
        url,
        snippet: normalizeSnippet(item?.description || item?.snippet || item?.summary || ''),
        domain,
        authority: classifyAuthority(domain),
      } satisfies GroundedResearchSource
    })
    .filter((item: GroundedResearchSource | null): item is GroundedResearchSource => !!item)
}

function dedupeSources(sources: GroundedResearchSource[]): GroundedResearchSource[] {
  const byUrl = new Map<string, GroundedResearchSource>()
  for (const source of sources) {
    if (!source.url) continue
    const existing = byUrl.get(source.url)
    if (!existing || authorityScore(source.authority) > authorityScore(existing.authority)) {
      byUrl.set(source.url, source)
    }
  }
  return Array.from(byUrl.values())
    .sort((a, b) => authorityScore(b.authority) - authorityScore(a.authority) || a.domain.localeCompare(b.domain))
}

function buildResearchQueries(topic: string): string[] {
  return uniqueStrings([
    topic,
    `${topic} 最新 趋势 官方`,
    `${topic} 研究 报告 权威`,
  ]).slice(0, 3)
}

async function enrichSourceSnippets(sources: GroundedResearchSource[]): Promise<GroundedResearchSource[]> {
  const topSources = sources.slice(0, 3)
  const enrichments = await Promise.allSettled(
    topSources.map(source => executeTool('web_extract', { url: source.url, format: 'text' }))
  )

  return sources.map((source) => {
    const index = topSources.findIndex(item => item.url === source.url)
    if (index === -1) return source
    const result = enrichments[index]
    if (result.status !== 'fulfilled' || !result.value.success) return source
    const raw = typeof result.value.data === 'string'
      ? result.value.data
      : typeof (result.value.data as any)?.content === 'string'
        ? (result.value.data as any).content
        : ''
    const snippet = normalizeSnippet(raw) || source.snippet
    return { ...source, snippet }
  })
}

export function shouldUseAutoResearch(question: string): boolean {
  const analysis = analyzeKnowledgeQuery(question)
  if (analysis.countIntent || analysis.collectionIntent || analysis.personalIntent) return false
  if (analysis.wantsClassification && analysis.searchText.length <= 24) return false
  return AUTO_RESEARCH_PATTERN.test(question) || analysis.relationEntities.length > 0 || analysis.wantsCanonicalAnswer
}

/** 运行自动研究 */
export async function runAutoResearch(
  config: LLMConfig,
  topic: string,
  perspectives: ResearchPerspective[] = DEFAULT_PERSPECTIVES,
): Promise<ResearchReport> {
  const perspectiveResults: ResearchReport['perspectives'] = []

  // 每个视角独立研究
  for (const perspective of perspectives) {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `你是一个专注于「${perspective.name}」的研究分析师。
针对给定主题，从「${perspective.focus}」角度深入分析。

输出 JSON：
{
  "findings": "200字以内的核心发现",
  "key_points": ["要点1", "要点2", "要点3", "要点4", "要点5"]
}

规则：
- 基于真实市场数据和趋势
- 具体且可操作，不要泛泛而谈
- 引用具体数据或案例更好`,
      },
      {
        role: 'user',
        content: `研究主题：${topic}`,
      },
    ]

    try {
      const response = await chatCompletion(config, messages, 0.5, 1024)
      const match = response.match(/\{[\s\S]*\}/)
      if (match) {
        const data = JSON.parse(match[0])
        perspectiveResults.push({
          name: perspective.name,
          findings: data.findings || '',
          keyPoints: data.key_points || [],
        })
      }
    } catch {
      perspectiveResults.push({
        name: perspective.name,
        findings: '研究失败',
        keyPoints: [],
      })
    }
  }

  // 综合报告
  const synthesisMessages: ChatMessage[] = [
    {
      role: 'system',
      content: `你是一个战略研究综合师。基于多个视角的研究结果，综合出一份简洁有力的研究报告。

输出 JSON：
{
  "synthesis": "300字以内的综合分析",
  "recommendations": ["建议1", "建议2", "建议3"]
}

规则：
- 找出跨视角的共同主题
- 指出最大机会和最大风险
- 给出明确的行动建议`,
    },
    {
      role: 'user',
      content: `主题：${topic}\n\n各视角研究结果：\n${perspectiveResults.map(p =>
        `## ${p.name}\n发现：${p.findings}\n要点：${p.keyPoints.join('、')}`
      ).join('\n\n')}`,
    },
  ]

  let synthesis = '综合分析暂不可用'
  let recommendations: string[] = []

  try {
    const synthResp = await chatCompletion(config, synthesisMessages, 0.4, 1024)
    const match = synthResp.match(/\{[\s\S]*\}/)
    if (match) {
      const data = JSON.parse(match[0])
      synthesis = data.synthesis || synthesis
      recommendations = data.recommendations || []
    }
  } catch { /* fallback */ }

  return {
    topic,
    perspectives: perspectiveResults,
    synthesis,
    recommendations,
    generatedAt: new Date().toISOString(),
  }
}

export async function runGroundedAutoResearch(
  config: LLMConfig,
  topic: string,
  options?: {
    contextAnswer?: string
    maxSources?: number
  },
): Promise<GroundedResearchReport> {
  const queries = buildResearchQueries(topic)
  const searchResults = await Promise.allSettled(
    queries.map(query => executeTool('web_search', { query, max_results: Math.max(4, options?.maxSources || 6) }))
  )

  const normalizedSources = dedupeSources(
    searchResults.flatMap(result => {
      if (result.status !== 'fulfilled' || !result.value.success) return []
      return normalizeSearchItems(result.value.data)
    })
  ).slice(0, Math.max(4, options?.maxSources || 6))

  if (normalizedSources.length === 0) {
    return {
      topic,
      summary: '外部研究暂时不可用，当前没有拿到可验证的联网结果。',
      notableSignals: [],
      recommendations: [],
      sources: [],
      queries,
      grounded: false,
      generatedAt: new Date().toISOString(),
    }
  }

  const enrichedSources = await enrichSourceSnippets(normalizedSources)
  const groundingPack = enrichedSources.map((source, index) => [
    `#${index + 1} ${source.title}`,
    `URL: ${source.url}`,
    `Authority: ${source.authority}`,
    source.snippet ? `Snippet: ${source.snippet}` : '',
  ].filter(Boolean).join('\n')).join('\n\n')

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `你是一个“外部研究补强器”。
你会基于联网搜索得到的真实线索，提炼一份短而硬的前沿补强。

输出 JSON：
{
  "summary": "200字以内，说明现在外部世界最值得补充到回答里的部分",
  "notable_signals": ["信号1", "信号2", "信号3"],
  "recommendations": ["建议1", "建议2", "建议3"]
}

规则：
- 只能基于给定搜索结果作答，不要编造未提供的新事实
- 优先信任 official / institutional 来源
- 如果信息存在不确定性，要明确写出来
- 语言简洁、判断明确、便于直接接入问答结果`,
    },
    {
      role: 'user',
      content: [
        `主题：${topic}`,
        options?.contextAnswer ? `当前知识库回答：${options.contextAnswer}` : '',
        `搜索查询：${queries.join('；')}`,
        '',
        '搜索结果：',
        groundingPack,
      ].filter(Boolean).join('\n'),
    },
  ]

  let summary = ''
  let notableSignals: string[] = []
  let recommendations: string[] = []

  try {
    const response = await chatCompletion(config, messages, 0.3, 1024)
    const match = response.match(/\{[\s\S]*\}/)
    if (match) {
      const data = JSON.parse(match[0])
      summary = stripMarkdown(String(data.summary || '')).slice(0, 320)
      notableSignals = Array.isArray(data.notable_signals)
        ? data.notable_signals.map((item: unknown) => stripMarkdown(String(item))).filter(Boolean).slice(0, 4)
        : []
      recommendations = Array.isArray(data.recommendations)
        ? data.recommendations.map((item: unknown) => stripMarkdown(String(item))).filter(Boolean).slice(0, 4)
        : []
    }
  } catch {
    // Fallback below.
  }

  if (!summary) {
    const sourceLine = enrichedSources
      .slice(0, 3)
      .map(source => `${source.title}（${source.domain || source.authority}）`)
      .join('；')
    summary = `已联网补充外部线索，当前更值得优先参考的来源有：${sourceLine}。`
  }

  return {
    topic,
    summary,
    notableSignals,
    recommendations,
    sources: enrichedSources,
    queries,
    grounded: true,
    generatedAt: new Date().toISOString(),
  }
}

export async function synthesizeHybridKnowledgeAnswer(
  config: LLMConfig,
  params: {
    question: string
    knowledgeAnswer: string
    research: GroundedResearchReport | null
  },
): Promise<string> {
  if (!params.research?.grounded) return params.knowledgeAnswer

  const sourcePack = params.research.sources
    .slice(0, 5)
    .map((source, index) => [
      `#${index + 1} ${source.title}`,
      `来源属性：${source.authority} / ${source.domain || 'web'}`,
      source.snippet,
    ].filter(Boolean).join('\n'))
    .join('\n\n')

  try {
    const response = await chatCompletion(
      config,
      [
        {
          role: 'system',
          content: `你是“知识库 + 外部世界”的综合判断器。
请把用户过往知识沉淀与外部权威搜索结果融合成一份更有判断力、更可执行的回答。

输出要求：
- 直接输出 Markdown 正文，不要 JSON
- 不要输出思考过程
- 回答结构保持简洁实用
- 优先给最终判断，再说明“来自知识库的提醒”和“来自外部世界的校正”
- 如果外部研究不能推翻知识库，只做增强；如果外部世界提供了新的现实约束，要明确指出`,
        },
        {
          role: 'user',
          content: [
            `问题：${params.question}`,
            '',
            '知识库回答：',
            params.knowledgeAnswer,
            '',
            '外部研究总结：',
            params.research.summary,
            params.research.notableSignals.length > 0 ? `外部信号：${params.research.notableSignals.join('；')}` : '',
            params.research.recommendations.length > 0 ? `外部建议：${params.research.recommendations.join('；')}` : '',
            '',
            '外部来源摘录：',
            sourcePack,
          ].filter(Boolean).join('\n'),
        },
      ],
      0.3,
      1400,
    )

    return response.trim() || params.knowledgeAnswer
  } catch {
    return params.knowledgeAnswer
  }
}
