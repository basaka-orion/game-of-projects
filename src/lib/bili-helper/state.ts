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

export const BILI_HELPER_STORAGE_KEY = 'openbasaka-bili-helper-mac-state-v1'

export const BILI_SAMPLE_URL = 'https://www.bilibili.com/video/BV1xx411c7mD/'

export const BILI_DEFAULT_TRANSCRIPT = `00:00 开场说明：这个视频要解决什么问题，以及为什么值得看。
01:24 背景铺垫：作者解释现有方法的限制。
03:10 核心观点一：先把复杂任务拆成可验证的小步骤。
06:42 核心观点二：不要只收藏视频，要把它转成自己的行动清单。
09:18 示例演示：从一个真实输入开始整理素材。
12:40 复盘：哪些内容应该进入笔记，哪些只作为参考。
15:05 结尾：下一步练习和延伸资料。`

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
    owner: overrides.owner || 'Bilibili Creator',
    cover: overrides.cover,
    avatar: overrides.avatar,
    description:
      overrides.description ||
      `${detected.label} 已作为来源接入。系统会先保留链接/文件信息，后续可用公开元信息、字幕、OCR、转写或手动补充正文继续生成资料包。`,
    durationSeconds: overrides.durationSeconds || 965,
    tags: overrides.tags || [detected.label, '学习', '知识整理'],
    stats: overrides.stats || {
      views: 128000,
      danmaku: 3420,
      likes: 18800,
      coins: 5200,
      favorites: 26600,
      shares: 1180,
    },
    pages:
      overrides.pages ||
      [
        { index: 1, title: '主视频', durationSeconds: 965 },
        { index: 2, title: '补充示例', durationSeconds: 420 },
      ],
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
  return {
    video,
    transcript: BILI_DEFAULT_TRANSCRIPT,
    wanxiang: createLocalWanxiangResult({
      video,
      transcript: BILI_DEFAULT_TRANSCRIPT,
      goal: '把视频变成资料地图、双教程、Openbasaka 融合 prompt 和清晰思维导图',
    }),
    pack: createLocalLearningPack(video, BILI_DEFAULT_TRANSCRIPT, '把视频变成资料地图、学习包和行动清单'),
    chat: [
      createBiliChatMessage('assistant', '我已准备好围绕这个视频回答问题。可以问“这个视频最值得做的行动是什么？”'),
    ],
  }
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
  const timeline = parseTranscriptTimeline(transcript)
  const outline = [
    '先确认来源解决的问题，不急着收藏。',
    '把内容拆成背景、核心观点、示例、复盘四层。',
    '把能马上执行的步骤写成行动清单。',
    '把无法确认的部分标成待追问，而不是混入结论。',
  ]
  const keyPoints = [
    '来源价值不在“看过”，而在转成自己的下一步。',
    '同名字幕或手动转写应优先于直接网页抓取。',
    '学习包要同时保留摘要、时间线、问题和行动。',
    '适合进入知识库的内容必须有来源链。',
  ]
  const actionList = [
    '粘贴链接或选择本地文件，确认来源卡片信息。',
    '添加字幕、网页正文、OCR、转写或手动笔记。',
    '生成资料地图和学习包。',
    '挑 1 个动作进入今天的任务。',
  ]
  const questions = [
    '这个来源真正解决的痛点是什么？',
    '哪些观点需要回到原来源核对？',
    '我能在 30 分钟内复现哪一个步骤？',
    '这个来源应该归档到哪个项目或知识主题？',
  ]
  const modeLabel = BILI_ARTIFACT_MODES.find((item) => item.id === mode)?.label || '学习包'
  const summary = `「${video.title}」已被整理为围绕“${goal || '学习与复用'}”的${modeLabel}。核心是把 ${video.platformName} 来源从一次性观看/浏览转成可复查的资料地图、可追问的知识点和可执行的下一步。`
  const tutorial = buildTutorial(video, outline, actionList, mode, depth)
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
  return [
    { time: '00:00', title: '视频开场', note: '先补充字幕或转写，系统会生成更准确的时间线。' },
    { time: '03:00', title: '核心观点', note: '根据视频标题和目标生成临时学习节点。' },
    { time: '08:00', title: '行动整理', note: '把视频内容转成自己的下一步。' },
  ]
}

function buildTutorial(video: BiliVideoInfo, outline: string[], actionList: string[], mode: BiliArtifactMode, depth: number): string {
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
- 是否产出一个今天能执行的动作。`
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
  return `# ${video.title}

Source: ${video.url}
Platform: ${video.platformName}
Source kind: ${video.sourceKind}
Source ID: ${video.bvid}
Owner: ${video.owner}

## 摘要

${summary}

## 资料地图

${outline.map((item) => `- ${item}`).join('\n')}

## 时间线

${timeline.map((item) => `- ${item.time} ${item.title}: ${item.note}`).join('\n')}

## 关键点

${keyPoints.map((item) => `- ${item}`).join('\n')}

## 教程

${tutorial}

## 行动清单

${actionList.map((item) => `- [ ] ${item}`).join('\n')}

## 可追问问题

${questions.map((item) => `- ${item}`).join('\n')}`
}

export function createDownloadTask(video: BiliVideoInfo, format: BiliDownloadFormat): BiliDownloadTask {
  const labels: Record<BiliDownloadFormat, string> = {
    video: '视频文件',
    audio: '音频提取',
    subtitle: '字幕/转写',
    cover: '封面图',
    markdown: '学习包 Markdown',
  }
  const extensions: Record<BiliDownloadFormat, string> = {
    video: 'mp4',
    audio: 'm4a',
    subtitle: 'srt',
    cover: 'jpg',
    markdown: 'md',
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
  return {
    video,
    transcript: input.transcript || '',
    wanxiang: input.wanxiang ? normalizeWanxiangResult(input.wanxiang, fallbackWanxiang, video, input.transcript || video.contentText || '') : undefined,
    pack,
    visualArtifacts,
    archive: input.archive ? normalizeArchiveState(input.archive) : undefined,
    chat: Array.isArray(input.chat) ? input.chat.map(normalizeChat) : [],
  }
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
    subtitleStatus:
      input.method.includes('ocr')
        ? 'ocr'
        : input.method.includes('transcript') || input.method.includes('transcription')
          ? 'sidecar'
          : input.kind === 'video' || input.kind === 'audio'
            ? 'missing'
            : 'metadata',
    capabilities: [detected.intake, detected.organize, detected.chat],
    warnings: input.warnings || [],
    resolvedBy: 'local',
  })
  return {
    video,
    transcript: input.rawContent || input.content,
    wanxiang: createLocalWanxiangResult({
      video,
      transcript: input.rawContent || input.content,
      goal: '把这个本地来源转成双教程、Openbasaka 融合 prompt 和清晰思维导图',
    }),
    chat: [
      createBiliChatMessage('assistant', `${input.fileName} 已接入。可以直接生成万象学习三结果。`),
    ],
  }
}
