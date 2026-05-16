import type {
  BaoyuVisualArtifact,
  BiliArchiveState,
  BiliArtifactMode,
  BiliChatMessage,
  BiliDownloadFormat,
  BiliDownloadTask,
  BiliHelperState,
  BiliLearningPack,
  BiliSourceKind,
  BiliVideoInfo,
  BiliVideoWorkspace,
} from './types'
import { detectBibiPlatform } from './platforms'
import { createLocalWanxiangResult, normalizeWanxiangResult } from './wanxiang'
import { BILI_EXAMPLE_TRANSCRIPT, getBiliUsableSourceText } from './source-content'
import { refreshSourceAsset } from './source-asset'

export const BILI_HELPER_STORAGE_KEY = 'openbasaka-bili-helper-mac-state-v1'

export const BILI_SAMPLE_URL = 'https://www.bilibili.com/video/BV1xx411c7mD/'

export const BILI_DEFAULT_TRANSCRIPT = BILI_EXAMPLE_TRANSCRIPT

export const BILI_ARTIFACT_MODES: Array<{
  id: BiliArtifactMode
  label: string
  desc: string
  accent: string
}> = [
  { id: 'tutorial', label: '小白教程', desc: '零基础友好的知识点讲解', accent: '#f0c674' },
  { id: 'mindmap', label: '思维导图', desc: '知识结构树形展开', accent: '#a78bfa' },
  { id: 'quiz', label: '面试考题', desc: '把内容变成可练习的问题', accent: '#34d399' },
  { id: 'tldr', label: '金句精华', desc: '极致浓缩核心信息', accent: '#fbbf24' },
  { id: 'debate', label: '正反辩论', desc: '多角度分析观点', accent: '#f472b6' },
  { id: 'timeline', label: '时间线', desc: '按顺序梳理内容脉络', accent: '#60a5fa' },
  { id: 'actionable', label: '行动清单', desc: '提炼可执行的 TODO', accent: '#4ade80' },
  { id: 'roast', label: '毒舌点评', desc: '犀利幽默地指出盲点', accent: '#fb923c' },
]

export function createBiliId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function extractBiliId(input: string): { bvid: string; aid?: string } {
  const trimmed = input.trim()
  const bvMatch = trimmed.match(/BV[0-9A-Za-z]{8,14}/)
  if (bvMatch) return { bvid: bvMatch[0] }
  const avMatch = trimmed.match(/(?:av|aid=)(\d{5,})/i)
  if (avMatch) return { bvid: `AV${avMatch[1]}`, aid: avMatch[1] }
  const fallback = trimmed.replace(/[^0-9A-Za-z]/g, '').slice(0, 12).toUpperCase()
  return { bvid: fallback ? `BV-${fallback}` : 'BV-LOCAL' }
}

export function createLocalVideoInfo(url: string, overrides: Partial<BiliVideoInfo> = {}): BiliVideoInfo {
  const { bvid, aid } = extractBiliId(url)
  const detected = detectBibiPlatform(url)
  const title = overrides.title || inferTitleFromUrl(url, bvid)
  return {
    id: overrides.id || createBiliId('bili'),
    url,
    bvid: overrides.bvid || bvid,
    aid: overrides.aid || aid,
    platform: overrides.platform || detected.id,
    platformName: overrides.platformName || detected.label,
    sourceKind: overrides.sourceKind || detected.kind,
    inputType: overrides.inputType || (/^https?:\/\//i.test(url) ? 'url' : 'manual'),
    title,
    owner: overrides.owner || '未知来源',
    cover: overrides.cover,
    avatar: overrides.avatar,
    description:
      overrides.description ||
      `${detected.label} 已作为来源接入。系统会先保留链接/文件信息，后续可用公开元信息、字幕、OCR、转写或手动补充正文继续生成资料包。`,
    durationSeconds: overrides.durationSeconds ?? 0,
    tags: overrides.tags || [detected.label, '学习', '知识整理'],
    stats: overrides.stats || {
      views: 0,
      danmaku: 0,
      likes: 0,
      coins: 0,
      favorites: 0,
      shares: 0,
    },
    pages: overrides.pages || [],
    contentText: overrides.contentText,
    filePath: overrides.filePath,
    siteName: overrides.siteName,
    canonicalUrl: overrides.canonicalUrl,
    favicon: overrides.favicon,
    subtitleStatus: overrides.subtitleStatus || (detected.status === 'direct' ? 'metadata' : 'missing'),
    capabilities: overrides.capabilities || [detected.intake, detected.organize, detected.chat],
    warnings: overrides.warnings || [],
    createdAt: overrides.createdAt || Date.now(),
    resolvedBy: overrides.resolvedBy || 'local',
  }
}

function inferTitleFromUrl(url: string, bvid: string): string {
  if (/notebook|笔记|知识|学习/i.test(url)) return '从 B 站视频生成可复用学习包'
  if (/ai|agent|llm|prompt/i.test(url)) return 'AI 视频内容拆解与行动路线'
  return `Bili 视频学习助手 · ${bvid}`
}

export function createSampleBiliWorkspace(): BiliVideoWorkspace {
  const video = createLocalVideoInfo(BILI_SAMPLE_URL, {
    title: '如何把一个 B 站视频变成自己的学习包',
    owner: 'OpenBasaka 示例创作者',
    description: '示例视频用于验证：解析链接、提取时间线、生成教程、问答和下载任务。',
    durationSeconds: 1025,
    tags: ['Bilibili', '学习包', 'Notebook', '行动清单'],
    platform: 'bilibili',
    platformName: 'Bilibili / B站',
    sourceKind: 'video',
    inputType: 'url',
    subtitleStatus: 'found',
  })
  return refreshSourceAsset({
    video,
    transcript: BILI_DEFAULT_TRANSCRIPT,
    chat: [
      createBiliChatMessage('assistant', '样例来源和真实转写已载入。点击任一产物、三结果或问答后，我会基于这份转写生成结果。'),
    ],
  })
}

export function createBiliChatMessage(role: BiliChatMessage['role'], content: string): BiliChatMessage {
  return {
    id: createBiliId(role),
    role,
    content,
    createdAt: Date.now(),
  }
}

export function createLocalLearningPack(video: BiliVideoInfo, transcript: string, goal: string): BiliLearningPack {
  return createLocalArtifactPack(video, transcript, goal, 'tutorial', 70)
}

export function createLocalArtifactPack(
  video: BiliVideoInfo,
  transcript: string,
  goal: string,
  mode: BiliArtifactMode,
  depth: number,
): BiliLearningPack {
  const sourceText = getBiliUsableSourceText(video, transcript)
  if (!sourceText) return createPendingSourcePack(video, goal, mode, depth)

  const timeline = parseTranscriptTimeline(sourceText)
  const modeLabel = BILI_ARTIFACT_MODES.find((item) => item.id === mode)?.label || '学习包'
  const modePack = buildModeSpecificPack(sourceText, mode)
  const outline = modePack.outline
  const keyPoints = modePack.keyPoints
  const actionList = modePack.actionList
  const questions = modePack.questions
  const summary = `「${video.title}」已被整理为围绕“${goal || '学习与复用'}”的${modeLabel}。核心是把 ${video.platformName} 来源从一次性观看/浏览转成可复查的资料地图、可追问的知识点和可执行的下一步。`
  const tutorial = buildTutorial(video, outline, actionList, mode, depth, modePack.body)
  const markdown = buildPackMarkdown(video, summary, outline, timeline, keyPoints, tutorial, actionList, questions)
  return {
    id: createBiliId('pack'),
    videoId: video.id,
    goal,
    mode,
    depth,
    summary,
    outline,
    timeline,
    keyPoints,
    tutorial,
    actionList,
    questions,
    markdown,
    createdAt: Date.now(),
    generatedBy: 'local',
  }
}

function buildModeSpecificPack(sourceText: string, mode: BiliArtifactMode): {
  outline: string[]
  keyPoints: string[]
  actionList: string[]
  questions: string[]
  body: string[]
} {
  const firstLines = sourceText
    .split(/\n+/)
    .map((line) => line.replace(/^\d{1,2}:\d{2}(?::\d{2})?\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 6)
  const anchors = firstLines.length ? firstLines : ['来源正文', '关键证据', '待核对点']
  if (mode === 'mindmap') {
    return {
      outline: ['中心主题', '背景与问题', '关键证据', '可行动作', '待核对分支'],
      keyPoints: anchors.slice(0, 4).map((item) => `导图节点：${item.slice(0, 42)}`),
      actionList: ['把一级节点合并成 3-5 个主题。', '给每个主题绑定一个原文证据。', '把待核对分支留给来源对话。'],
      questions: ['哪个节点最适合作为中心主题？', '哪些分支缺证据？', '导图应该归档到哪个知识主题？'],
      body: ['## Markdown 导图', '- 中心主题', '  - 背景与问题', '  - 关键证据', '  - 可行动作', '  - 待核对'],
    }
  }
  if (mode === 'quiz') {
    return {
      outline: ['概念题', '事实核对题', '迁移应用题', '反例题'],
      keyPoints: anchors.slice(0, 4).map((item) => `考点：${item.slice(0, 42)}`),
      actionList: ['先答 3 道事实题。', '再答 2 道应用题。', '把答错点回到原文证据复查。'],
      questions: ['这段内容最容易误解的点是什么？', '如何设计一道反例题？', '哪些题需要回看原来源？'],
      body: ['## 练习题', '1. 用一句话复述来源要解决的问题。', '2. 找出一个证据并说明它支持什么判断。', '3. 把结论迁移到你的一个真实任务。'],
    }
  }
  if (mode === 'tldr') {
    return {
      outline: ['一句话结论', '三个要点', '一个风险', '一个下一步'],
      keyPoints: anchors.slice(0, 4).map((item) => `精华：${item.slice(0, 48)}`),
      actionList: ['复制一句话结论。', '保留 3 个证据点。', '删除无证据的泛化表达。'],
      questions: ['如果只能保留一句话，应该是什么？', '哪个结论证据最弱？', '这条来源和当前项目有什么关系？'],
      body: ['## 极简版', '- 一句话：先基于证据复述来源问题。', '- 三要点：事实、判断、行动。', '- 风险：不要把标题当内容。'],
    }
  }
  if (mode === 'debate') {
    return {
      outline: ['正方观点', '反方观点', '共同证据', '争议焦点', '暂定结论'],
      keyPoints: anchors.slice(0, 4).map((item) => `可辩论点：${item.slice(0, 42)}`),
      actionList: ['列出支持证据。', '列出反对问题。', '把无法判定的点放入来源对话。'],
      questions: ['最强反方问题是什么？', '哪些证据能支撑正方？', '最终结论需要什么额外来源？'],
      body: ['## 正反辩论', '- 正方：来源提供了可复用线索。', '- 反方：证据可能不足或上下文缺失。', '- 共识：只吸收有证据的部分。'],
    }
  }
  if (mode === 'timeline') {
    return {
      outline: ['开端', '展开', '关键转折', '结论', '后续动作'],
      keyPoints: anchors.slice(0, 4).map((item) => `时间线线索：${item.slice(0, 42)}`),
      actionList: ['补齐缺失时间戳。', '给每段写一句笔记。', '把关键时间点加入问答索引。'],
      questions: ['哪个时间点最关键？', '哪段需要回看原文？', '是否存在跳跃或断层？'],
      body: ['## 时间线复盘', '按原始时间顺序保留证据，不把未标时内容伪造成时间点。'],
    }
  }
  if (mode === 'actionable') {
    return {
      outline: ['今天可做', '本周可做', '需要他人/工具', '先别做'],
      keyPoints: anchors.slice(0, 4).map((item) => `行动依据：${item.slice(0, 42)}`),
      actionList: ['选 1 个 30 分钟内可完成的动作。', '写出完成标准。', '完成后把结果归档回资料库。'],
      questions: ['哪个动作今天能完成？', '完成标准是什么？', '哪些动作证据不足应暂缓？'],
      body: ['## 行动化', '- 最小动作：选一个可验证任务。', '- 验收：有产物、有证据、有复盘。'],
    }
  }
  if (mode === 'roast') {
    return {
      outline: ['值得保留', '明显废话', '证据不足', '可改进动作'],
      keyPoints: anchors.slice(0, 4).map((item) => `点评依据：${item.slice(0, 42)}`),
      actionList: ['删掉没有证据的结论。', '保留能改变行动的句子。', '把存疑点丢给来源对话追问。'],
      questions: ['这条来源最空泛的表达是什么？', '哪些判断经不起证据追问？', '真正值得留下的是什么？'],
      body: ['## 犀利点评', '只批评有证据支撑的问题，不为了好玩编造立场。'],
    }
  }
  return {
    outline: ['先确认来源解决的问题，不急着收藏。', '把内容拆成背景、核心观点、示例、复盘四层。', '把能马上执行的步骤写成行动清单。', '把无法确认的部分标成待追问，而不是混入结论。'],
    keyPoints: ['来源价值不在“看过”，而在转成自己的下一步。', '同名字幕或手动转写应优先于直接网页抓取。', '学习包要同时保留摘要、时间线、问题和行动。', '适合进入知识库的内容必须有来源链。'],
    actionList: ['粘贴链接或选择本地文件，确认来源卡片信息。', '添加字幕、网页正文、OCR、转写或手动笔记。', '生成资料地图和学习包。', '挑 1 个动作进入今天的任务。'],
    questions: ['这个来源真正解决的痛点是什么？', '哪些观点需要回到原来源核对？', '我能在 30 分钟内复现哪一个步骤？', '这个来源应该归档到哪个项目或知识主题？'],
    body: [],
  }
}

export function parseTranscriptTimeline(transcript: string): BiliLearningPack['timeline'] {
  const lines = transcript
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const parsed = lines
    .map((line) => {
      const match = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s*(.+)$/)
      if (!match) return null
      const text = match[2].replace(/^[-:：\s]+/, '')
      const [title, ...rest] = text.split(/[：:]/)
      return {
        time: match[1],
        title: title.trim().slice(0, 28) || '片段',
        note: rest.join('：').trim() || text,
      }
    })
    .filter(Boolean) as BiliLearningPack['timeline']

  if (parsed.length > 0) return parsed
  const clean = transcript.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  return [{ time: '未标时', title: '正文片段', note: clean.slice(0, 160) }]
}

function createPendingSourcePack(
  video: BiliVideoInfo,
  goal: string,
  mode: BiliArtifactMode,
  depth: number,
): BiliLearningPack {
  const summary = `当前只识别到「${video.title}」的来源卡片，还没有拿到真实字幕、正文、OCR 或转写。系统不能判断视频里的观点，也不能生成可信时间线或教程。`
  const outline = [
    `已确认来源：${video.platformName} / ${video.bvid}`,
    '已确认信息：标题、链接、平台和来源卡片',
    '缺失内容：真实字幕、正文、OCR、音频转写或手动笔记',
    '处理原则：补齐内容前，只能暂存来源，不能把模板当成结论',
  ]
  const keyPoints = [
    '这还不是学习包，只是待补内容的来源诊断。',
    '不能根据标题推断视频观点、立场或完整事实。',
    '补充字幕或转写后，才能生成资料地图、时间线、关键点和行动清单。',
  ]
  const actionList = [
    '粘贴视频字幕、新闻原文或人工摘录。',
    '如果有本地视频/音频文件，走本地转写后重新生成。',
    '重新生成学习包前，先确认识别诊断里有正文字符数。',
  ]
  const questions = [
    '这个来源的真实字幕或新闻原文在哪里？',
    '哪些内容是视频里说的，哪些只是标题或来源卡片？',
    '补齐正文后，这条材料应该归入哪个知识主题？',
  ]
  const tutorial = `# ${video.title} 内容不足诊断

这份来源目前不能被教程化复盘。

原因：万象学习只拿到了来源卡片，没有拿到真实字幕、正文、OCR 或转写。继续生成会把系统模板伪装成视频内容，这对知识库没有价值。

下一步：补充字幕、正文、转写或手动笔记后再生成。`
  const markdown = buildPackMarkdown(video, summary, outline, [], keyPoints, tutorial, actionList, questions)
  return {
    id: createBiliId('pack'),
    videoId: video.id,
    goal,
    mode,
    depth,
    summary,
    outline,
    timeline: [],
    keyPoints,
    tutorial,
    actionList,
    questions,
    markdown,
    createdAt: Date.now(),
    generatedBy: 'local',
  }
}

function buildTutorial(video: BiliVideoInfo, outline: string[], actionList: string[], mode: BiliArtifactMode, depth: number, extraBody: string[] = []): string {
  const modeLabel = BILI_ARTIFACT_MODES.find((item) => item.id === mode)?.label || '学习包'
  return `# ${video.title} 教程化复盘

## 生成模式

${modeLabel} · 详细度 ${depth}%

## 适合谁

适合想把视频、网页、文件、图片或音频变成资料地图、学习包、FAQ 或行动清单的人。

## 学习路径

${outline.map((item, index) => `${index + 1}. ${item}`).join('\n')}

## 跟做步骤

${actionList.map((item, index) => `${index + 1}. ${item}`).join('\n')}

## 检查标准

- 是否能说清来源的一个核心问题。
- 是否能定位至少三个关键时间点。
- 是否产出一个今天能执行的动作。

${extraBody.join('\n')}`
}

function buildPackMarkdown(
  video: BiliVideoInfo,
  summary: string,
  outline: string[],
  timeline: BiliLearningPack['timeline'],
  keyPoints: string[],
  tutorial: string,
  actionList: string[],
  questions: string[],
): string {
  const listOrEmpty = (items: string[], empty: string) => (items.length ? items.map((item) => `- ${item}`).join('\n') : `- ${empty}`)
  const timelineText = timeline.length
    ? timeline.map((item) => `- ${item.time} ${item.title}: ${item.note}`).join('\n')
    : '- 暂无真实时间线。请先补充字幕、OCR、转写或正文。'
  return `# ${video.title}

Source: ${video.url}
Platform: ${video.platformName}
Source kind: ${video.sourceKind}
Source ID: ${video.bvid}
Owner: ${video.owner}

## 摘要

${summary}

## 资料地图

${listOrEmpty(outline, '暂无资料地图。')}

## 时间线

${timelineText}

## 关键点

${listOrEmpty(keyPoints, '暂无关键点。')}

## 教程

${tutorial}

## 行动清单

${actionList.length ? actionList.map((item) => `- [ ] ${item}`).join('\n') : '- [ ] 补充真实来源内容后重新生成。'}

## 可追问问题

${listOrEmpty(questions, '暂无可追问问题。')}`
}

export function createDownloadTask(video: BiliVideoInfo, format: BiliDownloadFormat): BiliDownloadTask {
  const labels: Record<BiliDownloadFormat, string> = {
    video: '视频文件',
    audio: '音频提取',
    subtitle: '字幕/转写',
    vtt: '字幕 VTT',
    cover: '封面图',
    markdown: '学习包 Markdown',
    json: 'SourceAsset JSON',
    mindmap: '导图 Markdown',
  }
  const extensions: Record<BiliDownloadFormat, string> = {
    video: 'mp4',
    audio: 'm4a',
    subtitle: 'srt',
    vtt: 'vtt',
    cover: 'jpg',
    markdown: 'md',
    json: 'json',
    mindmap: 'md',
  }
  return {
    id: createBiliId('download'),
    videoId: video.id,
    format,
    label: labels[format],
    status: 'queued',
    progress: 0,
    outputName: `${safeFileName(video.title)}.${extensions[format]}`,
    createdAt: Date.now(),
  }
}

function safeFileName(input: string): string {
  return input.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '_').slice(0, 48) || 'bili-video'
}

export function normalizeBiliState(input: Partial<BiliHelperState>): BiliHelperState {
  const workspaces = Array.isArray(input.workspaces) ? input.workspaces.map(normalizeWorkspace) : []
  return {
    workspaces,
    activeVideoId: input.activeVideoId && workspaces.some((item) => item.video.id === input.activeVideoId) ? input.activeVideoId : workspaces[0]?.video.id || null,
    downloads: Array.isArray(input.downloads) ? input.downloads.map(normalizeDownload) : [],
  }
}

function normalizeWorkspace(input: Partial<BiliVideoWorkspace>): BiliVideoWorkspace {
  const video = normalizeVideoInfo(input.video || createLocalVideoInfo(BILI_SAMPLE_URL))
  const pack = input.pack ? normalizePack(input.pack, video.id) : undefined
  const modePacks = normalizeModePacks(input.modePacks, video.id, pack)
  const fallbackWanxiang = createLocalWanxiangResult({
    video,
    transcript: input.transcript || video.contentText || '',
    goal: pack?.goal || '最大化利用这个来源',
  })
  const visualArtifacts = Array.isArray(input.visualArtifacts)
    ? input.visualArtifacts.map(normalizeVisualArtifact)
    : Array.isArray(pack?.visualArtifacts)
      ? pack.visualArtifacts.map(normalizeVisualArtifact)
      : []
  return refreshSourceAsset({
    video,
    transcript: input.transcript || '',
    sourceAsset: input.sourceAsset,
    wanxiang: input.wanxiang ? normalizeWanxiangResult(input.wanxiang, fallbackWanxiang, video, input.transcript || video.contentText || '') : undefined,
    pack,
    modePacks,
    visualArtifacts,
    archive: input.archive ? normalizeArchiveState(input.archive) : undefined,
    chat: Array.isArray(input.chat) ? input.chat.map(normalizeChat) : [],
  } satisfies BiliVideoWorkspace)
}

function normalizeVideoInfo(input: Partial<BiliVideoInfo>): BiliVideoInfo {
  return createLocalVideoInfo(input.url || BILI_SAMPLE_URL, input)
}

function normalizePack(input: Partial<BiliLearningPack>, videoId: string): BiliLearningPack {
  return {
    id: input.id || createBiliId('pack'),
    videoId: input.videoId || videoId,
    goal: input.goal || '',
    summary: input.summary || '',
    outline: Array.isArray(input.outline) ? input.outline : [],
    timeline: Array.isArray(input.timeline) ? input.timeline : [],
    keyPoints: Array.isArray(input.keyPoints) ? input.keyPoints : [],
    tutorial: input.tutorial || '',
    actionList: Array.isArray(input.actionList) ? input.actionList : [],
    questions: Array.isArray(input.questions) ? input.questions : [],
    visualArtifacts: Array.isArray(input.visualArtifacts) ? input.visualArtifacts.map(normalizeVisualArtifact) : [],
    markdown: input.markdown || '',
    createdAt: input.createdAt || Date.now(),
    mode: input.mode || 'tutorial',
    depth: Number.isFinite(input.depth) ? Number(input.depth) : 70,
    generatedBy: input.generatedBy || 'local',
  }
}

function normalizeModePacks(
  input: Partial<Record<BiliArtifactMode, Partial<BiliLearningPack>>> | undefined,
  videoId: string,
  currentPack?: BiliLearningPack,
): Partial<Record<BiliArtifactMode, BiliLearningPack>> | undefined {
  const entries = Object.entries(input || {}) as Array<[BiliArtifactMode, Partial<BiliLearningPack>]>
  const next: Partial<Record<BiliArtifactMode, BiliLearningPack>> = {}
  for (const [mode, pack] of entries) {
    if (!pack) continue
    next[mode] = normalizePack({ ...pack, mode }, videoId)
  }
  if (currentPack) next[currentPack.mode] = currentPack
  return Object.keys(next).length ? next : undefined
}

function normalizeVisualArtifact(input: Partial<BaoyuVisualArtifact>): BaoyuVisualArtifact {
  return {
    id: input.id || createBiliId('baoyu'),
    kind: input.kind || 'image-cards',
    label: input.label || '图文卡',
    title: input.title || '秒懂视觉',
    rationale: input.rationale || '',
    style: input.style || 'notion',
    layout: input.layout || 'balanced',
    palette: input.palette || 'macaron',
    prompt: input.prompt || '',
    previewMarkdown: input.previewMarkdown || '',
    status: input.status || 'ready',
    isRecommended: Boolean(input.isRecommended),
    imageDataUrls: Array.isArray(input.imageDataUrls) ? input.imageDataUrls : undefined,
    error: input.error,
    createdAt: input.createdAt || Date.now(),
    generatedBy: input.generatedBy || 'baoyu-plan',
  }
}

function normalizeArchiveState(input: Partial<BiliArchiveState>): BiliArchiveState {
  return {
    target: input.target || 'knowledge-master',
    folderPath: input.folderPath || '万象学习',
    knowledgeTags: Array.isArray(input.knowledgeTags) ? input.knowledgeTags.map(String).filter(Boolean) : ['万象学习'],
    status: input.status || 'idle',
    sourceId: input.sourceId,
    savedAt: input.savedAt,
    error: input.error,
  }
}

function normalizeChat(input: Partial<BiliChatMessage>): BiliChatMessage {
  return {
    id: input.id || createBiliId(input.role || 'assistant'),
    role: input.role === 'user' ? 'user' : 'assistant',
    content: input.content || '',
    createdAt: input.createdAt || Date.now(),
  }
}

function normalizeDownload(input: Partial<BiliDownloadTask>): BiliDownloadTask {
  return {
    id: input.id || createBiliId('download'),
    videoId: input.videoId || '',
    format: input.format || 'markdown',
    label: input.label || '学习包 Markdown',
    status: input.status || 'queued',
    progress: Number.isFinite(input.progress) ? Number(input.progress) : 0,
    outputName: input.outputName || 'bili-learning-pack.md',
    outputPath: input.outputPath,
    command: input.command,
    error: input.error,
    createdAt: input.createdAt || Date.now(),
  }
}

export function loadBiliHelperState(): BiliHelperState {
  if (typeof window === 'undefined') return normalizeBiliState({})
  try {
    const raw = window.localStorage.getItem(BILI_HELPER_STORAGE_KEY)
    if (!raw) return normalizeBiliState({})
    return normalizeBiliState(JSON.parse(raw))
  } catch {
    return normalizeBiliState({})
  }
}

export function saveBiliHelperState(state: BiliHelperState) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(BILI_HELPER_STORAGE_KEY, JSON.stringify(state))
}

export function formatBiliDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds || 0))
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

export function formatBiliNumber(value: number): string {
  if (value >= 10000) return `${Math.round(value / 1000) / 10}万`
  return String(Math.round(value || 0))
}

export function activeWorkspace(state: BiliHelperState): BiliVideoWorkspace | null {
  return state.workspaces.find((item) => item.video.id === state.activeVideoId) || state.workspaces[0] || null
}

function subtitleStatusFromMethod(input: { kind: string; method: string }): BiliVideoInfo['subtitleStatus'] {
  const method = input.method.toLowerCase()
  if (method.includes('ocr') || method.includes('vision')) return 'ocr'
  if (method.includes('whisper') || method.includes('transcribed')) return 'transcribed'
  if (method.includes('sidecar') || method.includes('transcript') || method.includes('transcription')) return 'sidecar'
  if (input.kind === 'video' || input.kind === 'audio') return 'missing'
  return 'metadata'
}

export function createFileSourceWorkspace(input: {
  filePath: string
  fileName: string
  kind: string
  method: string
  content: string
  rawContent?: string
  warnings?: string[]
  size?: number
}): BiliVideoWorkspace {
  const detected = detectBibiPlatform(input.filePath, input.kind)
  const sourceKind = detected.kind as BiliSourceKind
  const video = createLocalVideoInfo(input.filePath, {
    bvid: `${detected.id.toUpperCase()}-${createBiliId('file').slice(-8)}`,
    platform: detected.id,
    platformName: detected.label,
    sourceKind,
    inputType: 'file',
    title: input.fileName,
    owner: '本地文件',
    description: `${detected.label} 已接入。解析方法：${input.method}。${input.size ? `文件大小约 ${Math.round(input.size / 1024)} KB。` : ''}`,
    durationSeconds: 0,
    tags: [detected.label, input.kind, input.method].filter(Boolean),
    stats: { views: 0, danmaku: 0, likes: 0, coins: 0, favorites: 0, shares: 0 },
    pages: [{ index: 1, title: input.fileName, durationSeconds: 0 }],
    contentText: input.rawContent || input.content,
    filePath: input.filePath,
    subtitleStatus: subtitleStatusFromMethod({ kind: input.kind, method: input.method }),
    capabilities: [detected.intake, detected.organize, detected.chat],
    warnings: input.warnings || [],
    resolvedBy: 'local',
  })
  const sourceText = getBiliUsableSourceText(video, input.rawContent || input.content)
  return refreshSourceAsset({
    video,
    transcript: input.rawContent || input.content,
    chat: [
      createBiliChatMessage(
        'assistant',
        sourceText
          ? `${input.fileName} 已接入，并拿到 ${sourceText.length} 字可学习文本。可以生成学习包、万象三结果或继续问答。`
          : `${input.fileName} 已接入，但还没有真实字幕、正文、OCR 或转写。点击生成时我会继续尝试本地抽取/转写；补同名 .srt/.vtt/.txt 后效果最好。`,
      ),
    ],
  })
}
