import { chatCompletion, type LLMConfig } from '../ai/provider'
import { createPage, parseWikiLinks, type WikiSource } from './wiki'
import { getFolderDisplayPath } from './folders'

export type NotebookArtifactKind =
  | 'source-map'
  | 'briefing'
  | 'faq'
  | 'timeline'
  | 'study-guide'
  | 'podcast-script'
  | 'mind-map'
  | 'quiz'
  | 'action-plan'

export interface NotebookArtifactSpec {
  kind: NotebookArtifactKind
  label: string
  shortLabel: string
  description: string
  outputGuide: string
}

export interface NotebookArtifactResult {
  pageId: string
  title: string
  summary: string
  content: string
  kind: NotebookArtifactKind
  sourceIds: string[]
}

const NOTEBOOK_ARTIFACT_SPECS: NotebookArtifactSpec[] = [
  {
    kind: 'source-map',
    label: '无死角解析',
    shortLabel: '解析',
    description: '像侦探一样拆开资料：来源、线索、概念、人物、时间、问题、可行动方向。',
    outputGuide:
      '输出 8 个部分：资料总览、逐源摘要、关键事实、核心概念、人物/组织/项目、时间线、未解问题、下一步可行动清单。',
  },
  {
    kind: 'briefing',
    label: '研究简报',
    shortLabel: '简报',
    description: '把一组来源压缩成可直接阅读和决策的高密度简报。',
    outputGuide: '输出：一句话结论、背景、关键发现、证据、风险、机会、对 Openbasaka 的启发。',
  },
  {
    kind: 'faq',
    label: 'FAQ 问答',
    shortLabel: 'FAQ',
    description: '把资料变成新手能读懂、专家也能复查的问答集。',
    outputGuide: '输出 10-16 个问答，按从基础到深入排序；每个回答都要标注对应来源编号。',
  },
  {
    kind: 'timeline',
    label: '时间线',
    shortLabel: '时间',
    description: '抽取时间、阶段、因果变化和关键节点。',
    outputGuide: '输出时间线、阶段划分、关键转折、因果关系、仍缺失的时间证据。',
  },
  {
    kind: 'study-guide',
    label: '学习包',
    shortLabel: '学习',
    description: '把资料整理成课程式学习材料。',
    outputGuide: '输出学习目标、预备知识、章节讲义、重点概念、练习题、复习路线。',
  },
  {
    kind: 'podcast-script',
    label: '播客脚本',
    shortLabel: '播客',
    description: '生成双人对谈脚本，用来把复杂知识讲得清楚有趣。',
    outputGuide: '输出 8-12 分钟双人播客脚本，包含开场、分段对谈、追问、类比、结尾总结。',
  },
  {
    kind: 'mind-map',
    label: '脑图草案',
    shortLabel: '脑图',
    description: '生成可转成 Mermaid/XMind 的层级知识树。',
    outputGuide: '输出 Markdown 层级大纲，最多 4 层；最后附 Mermaid mindmap 草案。',
  },
  {
    kind: 'quiz',
    label: '测验',
    shortLabel: '测验',
    description: '生成检验理解程度的问题集。',
    outputGuide: '输出 12 道题：选择、简答、应用题混合；每题附答案、解析和来源编号。',
  },
  {
    kind: 'action-plan',
    label: '行动清单',
    shortLabel: '行动',
    description: '把资料变成项目推进、学习迁移、系统优化的步骤。',
    outputGuide: '输出目标、原则、任务拆解、优先级、验收标准、风险与降级方案。',
  },
]

export const NOTEBOOK_ARTIFACT_KINDS = NOTEBOOK_ARTIFACT_SPECS.map((spec) => spec.kind)

export function getNotebookArtifactSpecs(): NotebookArtifactSpec[] {
  return NOTEBOOK_ARTIFACT_SPECS
}

export function getNotebookArtifactSpec(kind: NotebookArtifactKind): NotebookArtifactSpec {
  return NOTEBOOK_ARTIFACT_SPECS.find((spec) => spec.kind === kind) || NOTEBOOK_ARTIFACT_SPECS[0]
}

export function inferNotebookArtifactKind(command: string): NotebookArtifactKind {
  const text = command.toLowerCase()
  if (/faq|问答|问题/.test(text)) return 'faq'
  if (/时间|timeline|历程|阶段/.test(text)) return 'timeline'
  if (/学习|课程|讲义|study/.test(text)) return 'study-guide'
  if (/播客|podcast|音频|对谈/.test(text)) return 'podcast-script'
  if (/脑图|mind|map|mermaid|xmind/.test(text)) return 'mind-map'
  if (/测验|quiz|题目|考试/.test(text)) return 'quiz'
  if (/行动|计划|todo|清单|落地|执行/.test(text)) return 'action-plan'
  if (/简报|brief|汇报|报告/.test(text)) return 'briefing'
  return 'source-map'
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function getSourceText(source: WikiSource): string {
  return source.rawContent || source.content || ''
}

function buildSourceLabel(source: WikiSource, index: number): string {
  const type = source.sourceType || 'source'
  const path = source.folderPath ? getFolderDisplayPath(source.folderPath) : ''
  const suffix = path ? ` · ${path}` : ''
  return `[S${index + 1}] ${source.title || source.filePath || source.url || source.id} (${type}${suffix})`
}

function buildSourceBundle(sources: WikiSource[]): string {
  const maxTotalChars = 22000
  const maxPerSource = Math.max(1800, Math.floor(maxTotalChars / Math.max(1, sources.length)))
  let totalChars = 0

  return sources
    .map((source, index) => {
      const text = cleanText(getSourceText(source))
      const remaining = Math.max(800, maxTotalChars - totalChars)
      const sliceSize = Math.min(maxPerSource, remaining)
      const excerpt = text.slice(0, sliceSize)
      totalChars += excerpt.length
      const metadata = [
        source.url ? `url: ${source.url}` : '',
        source.filePath ? `file: ${source.filePath}` : '',
        source.tags.length > 0 ? `tags: ${source.tags.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n')
      return `${buildSourceLabel(source, index)}\n${metadata}\n\n${excerpt || '这个来源暂时没有可读取正文。'}`
    })
    .join('\n\n---\n\n')
}

function commonFolderPath(sources: WikiSource[]): string {
  const paths = Array.from(new Set(sources.map((source) => source.folderPath).filter(Boolean)))
  if (paths.length === 1) return `${paths[0]}/Notebook 联动实验室`
  return '知识＋大佬/Notebook 联动实验室'
}

function artifactTitle(kind: NotebookArtifactKind, sources: WikiSource[], instruction?: string): string {
  const spec = getNotebookArtifactSpec(kind)
  const base = sources.length === 1 ? sources[0].title || sources[0].filePath || '单一来源' : `${sources.length} 个来源`
  const custom = instruction?.trim().slice(0, 28)
  return custom ? `${spec.label}：${custom}` : `${spec.label}：${base}`
}

export async function generateNotebookArtifact(params: {
  kind: NotebookArtifactKind
  sources: WikiSource[]
  llmConfig: LLMConfig
  instruction?: string
}): Promise<NotebookArtifactResult> {
  if (params.sources.length === 0) {
    throw new Error('请先选择至少一个资料源')
  }

  const spec = getNotebookArtifactSpec(params.kind)
  const sourceBundle = buildSourceBundle(params.sources)
  const sourceLabels = params.sources.map(buildSourceLabel).join('\n')
  const title = artifactTitle(params.kind, params.sources, params.instruction)
  const instruction = params.instruction?.trim()

  const systemPrompt = `你是 Openbasaka 的 Notebook 联动引擎。
你的工作不是泛泛总结，而是把多个资料源变成可继续使用、可归档、可追问的知识成果物。

规则：
1. 只把资料源中能支撑的内容写成事实；需要推断时必须标注“推断”。
2. 每个重要结论后尽量用 [S1]、[S2] 这类来源编号标注出处。
3. 输出必须是清晰 Markdown，适合直接保存为知识库页面。
4. 如果来源之间互相矛盾，要专门列出“冲突与不确定性”。
5. 不要写空洞口号，不要只做摘要，要给出结构、证据、问题和下一步。`

  const userPrompt = `成果物类型：${spec.label}
输出要求：${spec.outputGuide}
用户额外要求：${instruction || '无'}

资料源编号：
${sourceLabels}

资料源正文：
${sourceBundle}`

  const content = await chatCompletion(
    params.llmConfig,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    0.35,
    5200,
  )

  const finalContent = content.trim() || `## ${spec.label}\n\n这次没有生成稳定正文，请减少资料源数量后重试。`
  const summary = `${spec.label} · ${params.sources.length} 个来源 · Notebook 联动实验室生成`
  const sourceIds = params.sources.map((source) => source.id)
  const pageId = await createPage({
    title,
    content: finalContent,
    summary,
    category: 'notebook-artifact',
    tags: ['notebook', 'artifact', spec.shortLabel, spec.label],
    sourceIds,
    folderPath: commonFolderPath(params.sources),
    importance: params.kind === 'source-map' ? 82 : 74,
    confidence: 0.82,
    metadata: {
      type: 'notebook-artifact',
      artifactKind: params.kind,
      artifactLabel: spec.label,
      sourceIds,
      sourceTitles: params.sources.map((source) => source.title || source.filePath || source.url || source.id),
      userInstruction: instruction || '',
    },
  })

  try {
    await parseWikiLinks(pageId)
  } catch {
    // Link parsing is useful, but it should not block artifact creation.
  }

  return {
    pageId,
    title,
    summary,
    content: finalContent,
    kind: params.kind,
    sourceIds,
  }
}
