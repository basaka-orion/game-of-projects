export type BiliHelperView = 'workspace' | 'insights' | 'tutorial' | 'chat' | 'downloads' | 'coverage' | 'library'

export type BiliSourceKind = 'video' | 'webpage' | 'file' | 'image' | 'audio' | 'document' | 'social' | 'cloud' | 'podcast' | 'meeting'

export type BiliSourcePlatform =
  | 'bilibili'
  | 'youtube'
  | 'x-twitter'
  | 'tiktok'
  | 'douyin'
  | 'kuaishou'
  | 'xiaohongshu'
  | 'dropbox'
  | 'google-drive'
  | 'baidu-netdisk'
  | 'aliyun-drive'
  | 'website'
  | 'podcast'
  | 'meeting'
  | 'lecture'
  | 'local-video'
  | 'local-audio'
  | 'local-file'
  | 'local-image'
  | 'unknown'

export type BiliArtifactMode = 'tutorial' | 'mindmap' | 'quiz' | 'tldr' | 'debate' | 'timeline' | 'actionable' | 'roast'

export type BiliDownloadFormat = 'video' | 'audio' | 'subtitle' | 'cover' | 'markdown'

export type BiliDownloadStatus = 'queued' | 'running' | 'done' | 'failed'

export type BiliChatRole = 'user' | 'assistant'

export type BaoyuVisualArtifactKind = 'image-cards' | 'infographic' | 'comic' | 'diagram' | 'cover' | 'article-illustration'

export type BaoyuVisualArtifactStatus = 'ready' | 'generating' | 'generated' | 'failed' | 'needs-config'

export type BiliArchiveTarget = 'knowledge-master' | 'knowledge-folder' | 'backup'

export type BiliArchiveStatus = 'idle' | 'saving' | 'saved' | 'failed'

export type WanxiangFusionSubsystem = 'knowledge' | 'agent-prompt' | 'workflow' | 'boss-cognition' | 'visual-learning'

export type WanxiangMindMapLayout = 'process' | 'concept' | 'comparison' | 'decision'

export type WanxiangMindMapNodeKind = 'root' | 'topic' | 'step' | 'evidence' | 'action' | 'warning'

export interface SourceEvidenceRef {
  id: string
  label: string
  quote: string
  time?: string
  sourceId?: string
}

export interface TeachingVerdictResult {
  isTeaching: boolean
  confidence: number
  reasons: string[]
  evidenceRefs: SourceEvidenceRef[]
  beginnerTutorial?: string
  modelTutorial?: string
  nonTeachingDigest?: string
}

export interface OpenbasakaFusionResult {
  applicable: boolean
  targetSubsystems: WanxiangFusionSubsystem[]
  rationale: string
  masterPrompt: string
  archiveTags: string[]
  folderPath: string
  risks: string[]
}

export interface MindMapNode {
  id: string
  label: string
  note?: string
  kind: WanxiangMindMapNodeKind
  evidenceRefs?: SourceEvidenceRef[]
  children?: MindMapNode[]
}

export interface WanxiangMindMap {
  title: string
  layout: WanxiangMindMapLayout
  nodes: MindMapNode[]
  markdown: string
}

export interface WanxiangLearningResult {
  sourceId: string
  sourceTitle: string
  teaching: TeachingVerdictResult
  openbasakaFusion: OpenbasakaFusionResult
  mindMap: WanxiangMindMap
  markdown: string
  createdAt: number
  generatedBy: 'ai' | 'local'
}

export interface BaoyuStructuredCard {
  id: string
  title: string
  subtitle: string
  label: string
  points: string[]
  visualIntent: string
  accent: string
}

export interface BaoyuVisualArtifact {
  id: string
  kind: BaoyuVisualArtifactKind
  label: string
  title: string
  rationale: string
  style: string
  layout: string
  palette: string
  prompt: string
  previewMarkdown: string
  status: BaoyuVisualArtifactStatus
  isRecommended: boolean
  structuredCards?: BaoyuStructuredCard[]
  textRenderMode?: 'local-svg' | 'model-text'
  modelRoute?: {
    primary: string
    review: string
    renderer: string
  }
  imageDataUrls?: string[]
  error?: string
  createdAt: number
  generatedBy: 'baoyu-plan' | 'gemini' | 'local'
}

export interface BiliArchiveState {
  target: BiliArchiveTarget
  folderPath: string
  knowledgeTags: string[]
  status: BiliArchiveStatus
  sourceId?: string
  savedAt?: number
  error?: string
}

export interface BiliVideoStats {
  views: number
  danmaku: number
  likes: number
  coins: number
  favorites: number
  shares: number
}

export interface BiliVideoInfo {
  id: string
  url: string
  bvid: string
  aid?: string
  platform: BiliSourcePlatform
  platformName: string
  sourceKind: BiliSourceKind
  inputType: 'url' | 'file' | 'manual'
  title: string
  owner: string
  cover?: string
  avatar?: string
  description: string
  durationSeconds: number
  tags: string[]
  stats: BiliVideoStats
  pages: Array<{
    index: number
    title: string
    durationSeconds: number
  }>
  contentText?: string
  filePath?: string
  siteName?: string
  canonicalUrl?: string
  favicon?: string
  subtitleStatus: 'found' | 'missing' | 'manual' | 'sidecar' | 'ocr' | 'transcribed' | 'metadata'
  capabilities: string[]
  warnings: string[]
  createdAt: number
  resolvedBy: 'api' | 'local'
}

export interface BiliTimelineItem {
  time: string
  title: string
  note: string
}

export interface BiliLearningPack {
  id: string
  videoId: string
  goal: string
  mode: BiliArtifactMode
  depth: number
  summary: string
  outline: string[]
  timeline: BiliTimelineItem[]
  keyPoints: string[]
  tutorial: string
  actionList: string[]
  questions: string[]
  visualArtifacts?: BaoyuVisualArtifact[]
  markdown: string
  createdAt: number
  generatedBy: 'ai' | 'local'
}

export interface BiliChatMessage {
  id: string
  role: BiliChatRole
  content: string
  createdAt: number
}

export interface BiliDownloadTask {
  id: string
  videoId: string
  format: BiliDownloadFormat
  label: string
  status: BiliDownloadStatus
  progress: number
  outputName: string
  outputPath?: string
  command?: string
  error?: string
  createdAt: number
}

export interface BiliVideoWorkspace {
  video: BiliVideoInfo
  transcript: string
  wanxiang?: WanxiangLearningResult
  pack?: BiliLearningPack
  visualArtifacts?: BaoyuVisualArtifact[]
  archive?: BiliArchiveState
  chat: BiliChatMessage[]
}

export interface BiliHelperState {
  workspaces: BiliVideoWorkspace[]
  activeVideoId: string | null
  downloads: BiliDownloadTask[]
}

export interface BiliPlatformCapability {
  id: BiliSourcePlatform
  label: string
  aliases: string[]
  kind: BiliSourceKind
  intake: string
  organize: string
  chat: string
  status: 'direct' | 'metadata' | 'local-first'
  examples: string[]
}
