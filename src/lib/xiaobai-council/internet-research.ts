import { runGroundedAutoResearch, shouldUseAutoResearch, type GroundedResearchReport } from '../ai/auto-research'
import { getLLMConfig } from '../ai/provider'
import type { CouncilSelection } from './selector'
import { redactSensitiveText } from './export-safety'

export type CouncilInternetResearchStatus = 'not-needed' | 'grounded' | 'unavailable' | 'failed'

export interface CouncilInternetResearchSource {
  title: string
  url: string
  domain: string
  authority: string
  snippet: string
}

export interface CouncilInternetResearchPack {
  required: boolean
  attempted: boolean
  grounded: boolean
  status: CouncilInternetResearchStatus
  summary: string
  queries: string[]
  sources: CouncilInternetResearchSource[]
  promptFragment: string
  generatedAt: string
  error?: string
}

const COUNCIL_RESEARCH_PATTERN =
  /(联网|互联网|外网|搜索|查一下|搜一下|最新|最近|当前|现在|今日|今天|趋势|市场|竞品|行业|报告|研究|政策|法规|新闻|发布|版本|价格|天气|位置|AI|大模型|模型|LLM|OpenAI|Anthropic|Google|DeepSeek|GLM|Gemini|202\d)/i

function compact(value: string, max = 360): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeSources(report: GroundedResearchReport | null): CouncilInternetResearchSource[] {
  return (report?.sources || []).slice(0, 8).map((source) => ({
    title: source.title,
    url: source.url,
    domain: source.domain,
    authority: source.authority,
    snippet: source.snippet,
  }))
}

export function shouldUseCouncilInternetResearch(problem: string, selection?: CouncilSelection): boolean {
  const safeProblem = redactSensitiveText(problem)
  if (COUNCIL_RESEARCH_PATTERN.test(safeProblem)) return true
  if (shouldUseAutoResearch(safeProblem)) return true
  const profile = selection?.profile
  return Boolean(profile?.needsEvidence && (profile.domains.includes('market') || profile.domains.includes('technology') || profile.riskLevel !== 'low'))
}

function renderPromptFragment(pack: Omit<CouncilInternetResearchPack, 'promptFragment'>): string {
  const sourceLines = pack.sources.length
    ? pack.sources.map((source, index) => [
        `[W${index + 1}] ${source.title}`,
        `- authority: ${source.authority || 'unknown'} / ${source.domain || 'web'}`,
        `- url: ${source.url}`,
        source.snippet ? `- snippet: ${compact(source.snippet, 260)}` : '',
      ].filter(Boolean).join('\n')).join('\n')
    : '- none'

  return [
    '## 联网证据包',
    `- required: ${pack.required ? 'yes' : 'no'}`,
    `- attempted: ${pack.attempted ? 'yes' : 'no'}`,
    `- grounded: ${pack.grounded ? 'yes' : 'no'}`,
    `- status: ${pack.status}`,
    `- generatedAt: ${pack.generatedAt}`,
    pack.error ? `- error: ${compact(pack.error, 240)}` : '',
    pack.queries.length ? `- queries: ${pack.queries.join('；')}` : '- queries: none',
    `- summary: ${compact(pack.summary, 520)}`,
    '',
    '### 外部来源',
    sourceLines,
    '',
    '### 智囊团使用规则',
    '- 涉及当前事实、市场、竞品、政策、天气、模型能力、价格、版本或新闻时，必须优先引用本证据包。',
    '- 没有来源支撑的判断只能写成“待查证/假设/需要验证”，不能写成事实。',
    '- 最终 PRD 必须把外部来源和本地记忆分开标注，不得编造搜索过程或来源。',
  ].filter(Boolean).join('\n')
}

function packFromReport(required: boolean, report: GroundedResearchReport): CouncilInternetResearchPack {
  const sources = normalizeSources(report)
  const packWithoutPrompt = {
    required,
    attempted: true,
    grounded: report.grounded && sources.length > 0,
    status: report.grounded && sources.length > 0 ? 'grounded' as const : 'unavailable' as const,
    summary: report.summary,
    queries: report.queries,
    sources,
    generatedAt: report.generatedAt,
  }
  return {
    ...packWithoutPrompt,
    promptFragment: renderPromptFragment(packWithoutPrompt),
  }
}

export function createCouncilInternetResearchPack(input: {
  required: boolean
  attempted: boolean
  grounded: boolean
  status: CouncilInternetResearchStatus
  summary: string
  queries?: string[]
  sources?: CouncilInternetResearchSource[]
  generatedAt?: string
  error?: string
}): CouncilInternetResearchPack {
  const packWithoutPrompt = {
    required: input.required,
    attempted: input.attempted,
    grounded: input.grounded,
    status: input.status,
    summary: input.summary,
    queries: input.queries || [],
    sources: input.sources || [],
    generatedAt: input.generatedAt || new Date().toISOString(),
    error: input.error,
  }
  return {
    ...packWithoutPrompt,
    promptFragment: renderPromptFragment(packWithoutPrompt),
  }
}

export async function buildCouncilInternetResearchPack(input: {
  problem: string
  selection?: CouncilSelection
  maxSources?: number
}): Promise<CouncilInternetResearchPack> {
  const safeProblem = redactSensitiveText(input.problem)
  const required = shouldUseCouncilInternetResearch(safeProblem, input.selection)
  if (!required) {
    return createCouncilInternetResearchPack({
      required: false,
      attempted: false,
      grounded: false,
      status: 'not-needed',
      summary: '本轮没有触发强联网信号；智囊团仍需在事实不确定处标记待查证。',
    })
  }

  try {
    const report = await runGroundedAutoResearch(getLLMConfig(), safeProblem, {
      maxSources: input.maxSources || 6,
    })
    return packFromReport(required, report)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return createCouncilInternetResearchPack({
      required,
      attempted: true,
      grounded: false,
      status: 'failed',
      summary: '本轮已判定需要联网证据，但搜索或网页抽取失败；PRD 中相关事实必须保留待查证边界。',
      error: message,
    })
  }
}
