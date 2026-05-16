export type BiliHelperView = 'workspace' | 'insights' | 'tutorial' | 'wanxiang' | 'chat' | 'downloads' | 'coverage' | 'library'

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

export type BiliDownloadFormat = 'video' | 'audio' | 'subtitle' | 'vtt' | 'cover' | 'markdown' | 'json' | 'mindmap'

export type BiliDownloadStatus = 'queued' | 'running' | 'done' | 'failed'

export type BiliChatRole = 'user' | 'assistant'

export type SourceAssetStageId =
  | 'received'
  | 'metadata'
  | 'content'
  | 'transcript'
  | 'summary'
  | 'artifacts'
  | 'chatIndex'
  | 'archived'
  | 'exported'

export type SourceAssetStageStatus = 'pending' | 'running' | 'done' | 'partial' | 'blocked' | 'failed'

export type SourceAssetProvider = 'local' | 'bibigpt' | 'electron' | 'yt-dlp' | 'whisper' | 'apple-vision' | 'openbasaka'

export type SourceAssetArtifactKind =
  | 'summary'
  | 'learning-pack'
  | 'wanxiang'
  | 'chat-index'
  | 'mindmap'
  | 'transcript'
  | 'visual'
  | 'download'
  | 'archive'

export interface SourceAssetStage {
  id: SourceAssetStageId
  label: string
  status: SourceAssetStageStatus
  detail: string
  provider?: SourceAssetProvider | string
  startedAt?: number
  completedAt?: number
  error?: string
}

export interface SourceAssetProviderRun {
  id: string
  provider: SourceAssetProvider
  capability: string
  status: 'running' | 'done' | 'failed' | 'skipped'
  startedAt: number
  completedAt?: number
  durationMs?: number
  detail: string
  error?: string
  receipt?: Record<string, unknown>
}

export interface SourceAssetArtifactRecord {
  id: string
  kind: SourceAssetArtifactKind
  label: string
  status: 'ready' | 'generated' | 'failed' | 'blocked'
  source: SourceAssetProvider | 'ai'
  createdAt: number
  evidenceRefIds: string[]
  description: string
  outputPath?: string
  error?: string
}

export interface SourceAssetExportReceipt {
  id: string
  format: BiliDownloadFormat
  outputName: string
  status: 'done' | 'failed'
  createdAt: number
  outputPath?: string
  error?: string
}

export interface SourceAssetLibraryReceipt {
  sourceId: string
  drawerId?: string
  queueEventId?: string
  folderPath: string
  archivedAt: number
  mode: 'archive' | 'absorption' | 'general'
}

export interface SourceAsset {
  id: string
  sourceId: string
  title: string
  status: 'empty' | 'blocked' | 'partial' | 'ready' | 'archived'
  updatedAt: number
  intakeRun: {
    method: string
    contentLength: number
    evidenceCount: number
  }
  pipeline: SourceAssetStage[]
  evidenceRefs: SourceEvidenceRef[]
  providerRuns: SourceAssetProviderRun[]
  artifacts: SourceAssetArtifactRecord[]
  exportReceipts: SourceAssetExportReceipt[]
  libraryReceipt?: SourceAssetLibraryReceipt
}

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

export interface OpenbasakaPromptPatch {
  title: string
  target: WanxiangFusionSubsystem | string
  prompt: string
  evidenceRefs: SourceEvidenceRef[]
}

export interface OpenbasakaReusableAsset {
  title: string
  kind: string
  content: string
  evidenceRefs: SourceEvidenceRef[]
}

export interface OpenbasakaFusionResult {
  applicable: boolean
  targetSubsystems: WanxiangFusionSubsystem[]
  rationale: string
  masterPrompt: string
  systemTransformationPrompt: string
  absorptionScore: number
  absorptionVerdict: string
  promptPatches: OpenbasakaPromptPatch[]
  reusableAssets: OpenbasakaReusableAsset[]
  integrationSteps: string[]
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
  sourceAsset?: SourceAsset
  wanxiang?: WanxiangLearningResult
  pack?: BiliLearningPack
  modePacks?: Partial<Record<BiliArtifactMode, BiliLearningPack>>
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
