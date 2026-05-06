import type {
  BiliVideoInfo,
  MindMapNode,
  OpenbasakaFusionResult,
  SourceEvidenceRef,
  TeachingVerdictResult,
  WanxiangFusionSubsystem,
  WanxiangLearningResult,
  WanxiangMindMap,
  WanxiangMindMapLayout,
  WanxiangMindMapNodeKind,
} from './types'

const FUSION_SUBSYSTEMS: WanxiangFusionSubsystem[] = ['knowledge', 'agent-prompt', 'workflow', 'boss-cognition', 'visual-learning']

const NODE_KINDS: WanxiangMindMapNodeKind[] = ['root', 'topic', 'step', 'evidence', 'action', 'warning']

function text(value: unknown, fallback = ''): string {
  return String(value ?? fallback).replace(/\s+/g, ' ').trim()
}

function multiline(value: unknown, fallback = ''): string {
  return String(value ?? fallback).replace(/\r\n/g, '\n').trim()
}

function list(value: unknown, fallback: string[] = [], limit = 8): string[] {
  if (!Array.isArray(value)) return fallback
  return value.map((item) => text(item)).filter(Boolean).slice(0, limit)
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function excerpt(value: string, max = 140): string {
  const clean = text(value)
  return clean.length > max ? `${clean.slice(0, max)}...` : clean
}

function sourceText(video: BiliVideoInfo, transcript: string): string {
  return [video.title, video.description, transcript, video.contentText, video.tags.join(' ')].filter(Boolean).join('\n')
}

function parseEvidenceRefs(video: BiliVideoInfo, transcript: string): SourceEvidenceRef[] {
  const rows = (transcript || video.contentText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index): SourceEvidenceRef => {
      const match = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s*(.+)$/)
      return {
        id: `ev_${index + 1}`,
        label: match ? `时间点 ${match[1]}` : `片段 ${index + 1}`,
        time: match?.[1],
        quote: excerpt(match ? match[2].replace(/^[-:：\s]+/, '') : line, 120),
        sourceId: video.id,
      }
    })

  if (rows.length > 0) return rows.slice(0, 8)

  return [
    {
      id: 'ev_1',
      label: '来源简介',
      quote: excerpt(video.description || video.title, 120),
      sourceId: video.id,
    },
  ]
}

function teachingSignals(video: BiliVideoInfo, transcript: string, goal: string): string[] {
  const blob = sourceText(video, `${transcript}\n${goal}`).toLowerCase()
  const signals: Array<[string, RegExp]> = [
    ['包含明确步骤或流程', /步骤|流程|跟做|操作|安装|配置|演示|复现|练习|实操|实战|教程|how to|guide|tutorial|walkthrough/i],
    ['作者在解释方法或原理', /为什么|原理|方法|框架|拆解|讲解|说明|核心观点|知识点|概念|lesson|learn/i],
    ['内容有示例、复盘或检查标准', /示例|案例|复盘|检查|标准|注意|避坑|常见问题|faq|example|checklist/i],
    ['用户目标偏向学习复用', /学习|教程|小白|掌握|复用|资料地图|学习包|行动清单|mindmap|notebook/i],
  ]
  return signals.filter(([, pattern]) => pattern.test(blob)).map(([label]) => label)
}

function inferMindMapLayout(video: BiliVideoInfo, transcript: string): WanxiangMindMapLayout {
  const blob = sourceText(video, transcript).toLowerCase()
  if (/对比|差异|优缺点|versus|\bvs\b|before|after/i.test(blob)) return 'comparison'
  if (/是否|选择|取舍|决策|判断|该不该|风险|收益/i.test(blob)) return 'decision'
  if (/步骤|流程|路线|先.*再|安装|配置|操作|workflow|pipeline/i.test(blob)) return 'process'
  return 'concept'
}

function node(id: string, label: string, kind: WanxiangMindMapNodeKind, children: MindMapNode[] = [], note = '', evidenceRefs?: SourceEvidenceRef[]): MindMapNode {
  return {
    id,
    label: excerpt(label, 34),
    kind,
    note: note ? excerpt(note, 120) : undefined,
    evidenceRefs,
    children: children.slice(0, 5),
  }
}

function buildBeginnerTutorial(video: BiliVideoInfo, evidence: SourceEvidenceRef[], reasons: string[], goal: string): string {
  const first = evidence[0]?.quote || video.description || video.title
  return `# 给超级小白看的教程

## 这份资料在教什么

它主要在教你：先看清「${video.title}」要解决的问题，再按来源里的步骤或观点，把内容变成自己能照着做的一套流程。

## 你先不用懂的东西

- 不用先理解所有术语。
- 不用一口气看完所有细节。
- 不用马上判断作者是不是全部正确。

## 跟做路线

1. 先用一句话说清楚它要解决的问题：${excerpt(first, 90)}
2. 再看作者给出的背景、限制或痛点，确认为什么要学。
3. 把每个步骤写成「我现在要点什么、复制什么、检查什么」。
4. 每做完一步，就回到原视频、字幕或资料核对一次。
5. 最后只留下一个今天能完成的小动作，不要只收藏。

## 这份资料像教程的原因

${reasons.map((item) => `- ${item}`).join('\n')}

## 学完怎么检查

- 你能不能用自己的话复述它在教什么。
- 你能不能指出至少一个原文证据或时间点。
- 你能不能把它变成今天 30 分钟内能做的一步。

## 你的本次目标

${goal || '把这个来源转成可以复用的知识。'}`
}

function buildModelTutorial(video: BiliVideoInfo, evidence: SourceEvidenceRef[], goal: string): string {
  return `# 给大模型/计算机执行的教程

## Input

- source_id: ${video.id}
- title: ${video.title}
- platform: ${video.platformName}
- source_kind: ${video.sourceKind}
- goal: ${goal || 'extract reusable learning procedure'}

## Procedure

1. Extract the source problem statement from title, description, transcript, OCR, or notes.
2. Build a step list only from source-supported claims.
3. Attach evidence refs to each key step when timestamped or quoted evidence exists.
4. Separate beginner explanations from machine-actionable instructions.
5. Mark uncertain or missing steps as verification gaps instead of hallucinating.
6. Return a reusable markdown tutorial plus Openbasaka integration prompt.

## Evidence anchors

${evidence.slice(0, 5).map((item) => `- ${item.id} ${item.time || item.label}: ${item.quote}`).join('\n')}

## Output contract

- beginner_tutorial: human-friendly Chinese guide.
- model_tutorial: deterministic execution guide.
- mind_map: one root, 3-6 branches, max 5 children per branch.
- openbasaka_prompt: how to reuse this source inside knowledge, agent prompt, workflow, or Boss cognition layers.`
}

function buildFusion(video: BiliVideoInfo, transcript: string, isTeaching: boolean, goal: string): OpenbasakaFusionResult {
  const blob = sourceText(video, `${transcript}\n${goal}`)
  const targetSubsystems: WanxiangFusionSubsystem[] = ['knowledge', 'agent-prompt']
  if (/步骤|流程|workflow|自动|执行|任务|操作|教程|指南/i.test(blob)) targetSubsystems.push('workflow')
  if (/认知|理解|学习|小白|心智|方法|框架|判断/i.test(blob)) targetSubsystems.push('boss-cognition')
  targetSubsystems.push('visual-learning')

  const applicable = blob.replace(/\s+/g, '').length > 40
  const archiveTags = Array.from(
    new Set(['万象学习', isTeaching ? '教学资料' : '资料理解', 'Openbasaka融合', video.sourceKind, video.platformName, ...video.tags]),
  )
    .map((item) => text(item))
    .filter(Boolean)
    .slice(0, 12)

  const masterPrompt = `你是 Openbasaka 的万象学习融合器。请只基于以下来源，把它转成可被 Boss、知识库、Agent 与工作流复用的系统资产。

来源标题：${video.title}
来源形态：${video.platformName} / ${video.sourceKind}
作者/来源：${video.owner}
用户目标：${goal || '最大化利用用户扔进来的资料'}

融合要求：
1. 先判断它是否是教学资料；如果是，保留小白教程和机器执行教程两份。
2. 把能复用的概念、步骤、风险、检查标准写入知识库语气，不要写成营销文案。
3. 给 Agent 使用时，必须说明哪些结论有来源证据，哪些只是推断。
4. 如果能变成工作流，只保留最短可试跑步骤，避免复杂化。
5. 导图必须以本地中文排版渲染，图片模型不得直接写中文。

最终输出：可归档知识页、可注入 Agent 的 prompt 片段、可执行下一步、可视化导图结构。`

  return {
    applicable,
    targetSubsystems: Array.from(new Set(targetSubsystems)).slice(0, 5),
    rationale: applicable
      ? '来源已经具备可抽取的主题、证据或操作线索，适合进入 Openbasaka 的知识与 Agent 上下文。'
      : '当前来源文本太少，只适合暂存，等待补充字幕、OCR、转写或正文后再深度融合。',
    masterPrompt,
    archiveTags,
    folderPath: '知识+大佬/万象学习',
    risks: [
      '如果没有原始字幕或正文，教程细节只能作为待核对草稿。',
      '所有会影响项目或工作流的动作，需要先人工试跑一次。',
    ],
  }
}

function buildMindMap(video: BiliVideoInfo, transcript: string, goal: string, evidence: SourceEvidenceRef[], isTeaching: boolean): WanxiangMindMap {
  const layout = inferMindMapLayout(video, transcript)
  const evidenceChildren = evidence.slice(0, 4).map((item, index) => node(`evidence_${index + 1}`, item.quote, 'evidence', [], item.label, [item]))
  const root = node(
    'root',
    video.title,
    'root',
    [
      node('topic_position', '这份资料想表达什么', 'topic', [
        node('topic_problem', goal || '把来源转成可复用知识', 'topic'),
        node('topic_type', isTeaching ? '偏教学：可以整理成教程' : '非纯教学：先做理解地图', 'topic'),
      ]),
      node('topic_structure', layout === 'process' ? '操作路线' : '核心结构', layout === 'process' ? 'step' : 'topic', [
        node('structure_1', '先识别问题与背景', 'step'),
        node('structure_2', '再提炼关键观点或步骤', 'step'),
        node('structure_3', '最后转成复用动作', 'action'),
      ]),
      node('topic_evidence', '来源证据', 'evidence', evidenceChildren),
      node('topic_openbasaka', '如何进入 Openbasaka', 'action', [
        node('openbasaka_1', '写入知识+大佬', 'action'),
        node('openbasaka_2', '生成 Agent 可用 prompt', 'action'),
        node('openbasaka_3', '用导图帮助小白扫读', 'action'),
      ]),
    ],
    video.description,
    evidence.slice(0, 2),
  )
  const mindMap: WanxiangMindMap = {
    title: video.title,
    layout,
    nodes: [root],
    markdown: '',
  }
  mindMap.markdown = mindMapToMarkdown(mindMap)
  return mindMap
}

export function mindMapToMarkdown(mindMap: WanxiangMindMap): string {
  const lines: string[] = [`# ${mindMap.title}`]
  const visit = (item: MindMapNode, depth: number) => {
    const prefix = '  '.repeat(Math.max(0, depth - 1))
    lines.push(`${prefix}- ${item.label}${item.note ? `：${item.note}` : ''}`)
    ;(item.children || []).slice(0, 5).forEach((child) => visit(child, depth + 1))
  }
  mindMap.nodes.slice(0, 1).forEach((item) => visit(item, 1))
  return lines.join('\n')
}

export function buildWanxiangMarkdown(video: BiliVideoInfo, result: WanxiangLearningResult, rawText = ''): string {
  const teaching = result.teaching
  return `# ${video.title}

Source: ${video.url}
Platform: ${video.platformName}
Source kind: ${video.sourceKind}
Source ID: ${video.bvid}
Owner: ${video.owner}

## 1. 教学判定与双教程

- 判断：${teaching.isTeaching ? '是教学资料' : '不是纯教学资料'}
- 置信度：${Math.round(teaching.confidence * 100)}%

### 判断依据

${teaching.reasons.map((item) => `- ${item}`).join('\n')}

### 来源证据

${teaching.evidenceRefs.map((item) => `- ${item.id}${item.time ? ` ${item.time}` : ''}: ${item.quote}`).join('\n')}

${teaching.isTeaching ? `${teaching.beginnerTutorial || ''}\n\n${teaching.modelTutorial || ''}` : `### 非教学资料摘要\n\n${teaching.nonTeachingDigest || '这份资料更适合先做结构理解和归档，不应强行伪造成操作教程。'}`}

## 2. Openbasaka 融合方案 Prompt

- 是否值得融合：${result.openbasakaFusion.applicable ? '值得' : '暂存等待补充'}
- 目标子系统：${result.openbasakaFusion.targetSubsystems.join(', ')}
- 默认归档路径：${result.openbasakaFusion.folderPath}

### 融合理由

${result.openbasakaFusion.rationale}

### 大师融合 Prompt

${result.openbasakaFusion.masterPrompt}

### 风险

${result.openbasakaFusion.risks.map((item) => `- ${item}`).join('\n')}

## 3. 思维导图

${result.mindMap.markdown}

## 原始来源正文

${rawText || video.contentText || video.description || '暂无正文。'}`
}

export function createLocalWanxiangResult(input: {
  video: BiliVideoInfo
  transcript: string
  goal: string
}): WanxiangLearningResult {
  const evidenceRefs = parseEvidenceRefs(input.video, input.transcript)
  const reasons = teachingSignals(input.video, input.transcript, input.goal)
  const isTeaching = reasons.length >= 2
  const confidence = isTeaching ? Math.min(0.92, 0.56 + reasons.length * 0.1) : Math.max(0.24, 0.48 - reasons.length * 0.05)
  const teaching: TeachingVerdictResult = {
    isTeaching,
    confidence,
    reasons: reasons.length ? reasons : ['当前来源缺少明确步骤、示例或教学语气，不能强行判定为教程。'],
    evidenceRefs,
    beginnerTutorial: isTeaching ? buildBeginnerTutorial(input.video, evidenceRefs, reasons, input.goal) : undefined,
    modelTutorial: isTeaching ? buildModelTutorial(input.video, evidenceRefs, input.goal) : undefined,
    nonTeachingDigest: isTeaching
      ? undefined
      : `「${input.video.title}」更像资料、观点或素材。建议先用导图理解主题，再决定是否归档或补充正文。`,
  }
  const openbasakaFusion = buildFusion(input.video, input.transcript, isTeaching, input.goal)
  const mindMap = buildMindMap(input.video, input.transcript, input.goal, evidenceRefs, isTeaching)
  const result: WanxiangLearningResult = {
    sourceId: input.video.id,
    sourceTitle: input.video.title,
    teaching,
    openbasakaFusion,
    mindMap,
    markdown: '',
    createdAt: Date.now(),
    generatedBy: 'local',
  }
  result.markdown = buildWanxiangMarkdown(input.video, result, input.transcript)
  return result
}

function sanitizeEvidence(value: unknown, fallback: SourceEvidenceRef[]): SourceEvidenceRef[] {
  if (!Array.isArray(value)) return fallback
  const refs = value
    .map((item, index): SourceEvidenceRef => {
      const row = item as Partial<SourceEvidenceRef>
      return {
        id: text(row.id, `ev_${index + 1}`),
        label: text(row.label, `证据 ${index + 1}`),
        quote: excerpt(text(row.quote), 140),
        time: text(row.time) || undefined,
        sourceId: text(row.sourceId) || undefined,
      }
    })
    .filter((item) => item.quote)
    .slice(0, 8)
  return refs.length ? refs : fallback
}

function sanitizeNode(value: unknown, fallback: MindMapNode, depth = 0): MindMapNode {
  const row = (value || {}) as Partial<MindMapNode>
  const kind = NODE_KINDS.includes(row.kind as WanxiangMindMapNodeKind) ? (row.kind as WanxiangMindMapNodeKind) : depth === 0 ? 'root' : fallback.kind
  const children = Array.isArray(row.children)
    ? row.children.slice(0, 5).map((child, index) =>
        sanitizeNode(child, node(`${fallback.id}_${index + 1}`, `节点 ${index + 1}`, depth === 0 ? 'topic' : 'evidence'), depth + 1),
      )
    : fallback.children || []
  return {
    id: text(row.id, fallback.id),
    label: excerpt(text(row.label, fallback.label), 34),
    note: text(row.note, fallback.note || '') || undefined,
    kind,
    evidenceRefs: Array.isArray(row.evidenceRefs) ? sanitizeEvidence(row.evidenceRefs, fallback.evidenceRefs || []) : fallback.evidenceRefs,
    children,
  }
}

export function normalizeWanxiangResult(input: Partial<WanxiangLearningResult> | undefined, fallback: WanxiangLearningResult, video: BiliVideoInfo, transcript = ''): WanxiangLearningResult {
  if (!input) return fallback
  const evidenceRefs = sanitizeEvidence(input.teaching?.evidenceRefs, fallback.teaching.evidenceRefs)
  const isTeaching = Boolean(input.teaching?.isTeaching)
  const teaching: TeachingVerdictResult = {
    isTeaching,
    confidence: clampNumber(input.teaching?.confidence, fallback.teaching.confidence, 0, 1),
    reasons: list(input.teaching?.reasons, fallback.teaching.reasons, 8),
    evidenceRefs,
    beginnerTutorial: isTeaching ? multiline(input.teaching?.beginnerTutorial, fallback.teaching.beginnerTutorial || '') : undefined,
    modelTutorial: isTeaching ? multiline(input.teaching?.modelTutorial, fallback.teaching.modelTutorial || '') : undefined,
    nonTeachingDigest: isTeaching ? undefined : multiline(input.teaching?.nonTeachingDigest, fallback.teaching.nonTeachingDigest || ''),
  }
  const targetSubsystems = list(input.openbasakaFusion?.targetSubsystems, fallback.openbasakaFusion.targetSubsystems, 5).filter((item) =>
    FUSION_SUBSYSTEMS.includes(item as WanxiangFusionSubsystem),
  ) as WanxiangFusionSubsystem[]
  const openbasakaFusion: OpenbasakaFusionResult = {
    applicable: Boolean(input.openbasakaFusion?.applicable ?? fallback.openbasakaFusion.applicable),
    targetSubsystems: targetSubsystems.length ? targetSubsystems : fallback.openbasakaFusion.targetSubsystems,
    rationale: multiline(input.openbasakaFusion?.rationale, fallback.openbasakaFusion.rationale),
    masterPrompt: multiline(input.openbasakaFusion?.masterPrompt, fallback.openbasakaFusion.masterPrompt),
    archiveTags: list(input.openbasakaFusion?.archiveTags, fallback.openbasakaFusion.archiveTags, 12),
    folderPath: text(input.openbasakaFusion?.folderPath, fallback.openbasakaFusion.folderPath || '知识+大佬/万象学习'),
    risks: list(input.openbasakaFusion?.risks, fallback.openbasakaFusion.risks, 6),
  }
  const layout = ['process', 'concept', 'comparison', 'decision'].includes(input.mindMap?.layout || '')
    ? (input.mindMap?.layout as WanxiangMindMapLayout)
    : fallback.mindMap.layout
  const rootFallback = fallback.mindMap.nodes[0]
  const root = Array.isArray(input.mindMap?.nodes) && input.mindMap.nodes.length > 0 ? sanitizeNode(input.mindMap.nodes[0], rootFallback, 0) : rootFallback
  const mindMap: WanxiangMindMap = {
    title: text(input.mindMap?.title, fallback.mindMap.title),
    layout,
    nodes: [root],
    markdown: '',
  }
  mindMap.markdown = multiline(input.mindMap?.markdown) || mindMapToMarkdown(mindMap)
  const result: WanxiangLearningResult = {
    sourceId: text(input.sourceId, fallback.sourceId || video.id),
    sourceTitle: text(input.sourceTitle, fallback.sourceTitle || video.title),
    teaching,
    openbasakaFusion,
    mindMap,
    markdown: '',
    createdAt: Number(input.createdAt) || fallback.createdAt || Date.now(),
    generatedBy: input.generatedBy === 'ai' ? 'ai' : fallback.generatedBy,
  }
  result.markdown = buildWanxiangMarkdown(video, result, transcript)
  return result
}

export function collectMindMapNodes(mindMap: WanxiangMindMap): MindMapNode[] {
  const nodes: MindMapNode[] = []
  const visit = (item: MindMapNode) => {
    nodes.push(item)
    ;(item.children || []).forEach(visit)
  }
  mindMap.nodes.forEach(visit)
  return nodes
}
