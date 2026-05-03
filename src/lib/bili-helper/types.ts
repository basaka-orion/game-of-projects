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
  pack?: BiliLearningPack
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
