import type { BiliVideoWorkspace } from './types'
import { getBiliUsableSourceText } from './source-content'

export type IntakeDiagnosticStatus = 'done' | 'partial' | 'blocked' | 'pending'

export interface IntakeDiagnosticStep {
  id: string
  label: string
  status: IntakeDiagnosticStatus
  detail: string
}

export interface SourceIntakeDiagnostics {
  score: number
  label: string
  method: string
  contentLength: number
  lineCount: number
  wordCount: number
  sourceKindLabel: string
  recognitionLabel: string
  steps: IntakeDiagnosticStep[]
  nextActions: string[]
  warnings: string[]
}

const KIND_LABELS: Record<string, string> = {
  video: '视频',
  audio: '音频',
  image: '图片',
  document: '文档',
  pdf: 'PDF',
  file: '文件',
  webpage: '网页',
  social: '社交内容',
  cloud: '云盘来源',
  podcast: '播客',
  meeting: '会议',
}

function cleanText(value: unknown): string {
  return String(value || '').trim()
}

function countWords(text: string): number {
  const latinWords = text.match(/[A-Za-z0-9_]+/g)?.length || 0
  const cjkChars = text.match(/[\u3400-\u9FFF]/g)?.length || 0
  return latinWords + cjkChars
}

function statusLabel(status: IntakeDiagnosticStatus): string {
  if (status === 'done') return '已完成'
  if (status === 'partial') return '部分完成'
  if (status === 'blocked') return '需补能力'
  return '等待'
}

export function intakeStatusLabel(status: IntakeDiagnosticStatus): string {
  return statusLabel(status)
}

function methodFrom(workspace: BiliVideoWorkspace): string {
  const methodTag = workspace.video.tags.find((tag) =>
    /utf8|textutil|spotlight|ocr|vision|whisper|sidecar|placeholder|metadata|strings|extract|transcript/i.test(tag),
  )
  if (methodTag) return methodTag
  if (workspace.video.resolvedBy === 'api') return 'remote-metadata'
  if (workspace.video.inputType === 'url') return 'url-metadata'
  return 'local-metadata'
}

function recognitionLabel(workspace: BiliVideoWorkspace, method: string, contentLength: number): string {
  const kind = workspace.video.sourceKind
  if (/whisper|transcribed/i.test(method) || workspace.video.subtitleStatus === 'transcribed') return '本地转写'
  if (/sidecar|transcript/i.test(method) || workspace.video.subtitleStatus === 'sidecar' || workspace.video.subtitleStatus === 'found') {
    return '同名字幕/文字稿'
  }
  if (/ocr|vision|image-text/i.test(method) || workspace.video.subtitleStatus === 'ocr') return '图片 OCR/视觉识别'
  if (/textutil|utf8|spotlight|strings/i.test(method)) return '正文抽取'
  if (kind === 'webpage' && contentLength > 120) return '网页正文'
  if (contentLength > 120) return '可读正文'
  return '元信息'
}

function textQuality(contentLength: number): SourceIntakeDiagnostics['label'] {
  if (contentLength >= 5000) return 'RICH'
  if (contentLength >= 900) return 'USABLE'
  if (contentLength >= 180) return 'WEAK'
  return 'NEEDS INPUT'
}

function buildSteps(workspace: BiliVideoWorkspace, method: string, contentLength: number, lineCount: number): IntakeDiagnosticStep[] {
  const video = workspace.video
  const warnings = video.warnings || []
  const hasIdentity = Boolean(video.title && video.platformName)
  const hasText = contentLength >= 180
  const hasTranscriptText = hasText || video.subtitleStatus === 'found'
  const isMedia = video.sourceKind === 'video' || video.sourceKind === 'audio' || video.sourceKind === 'podcast' || video.sourceKind === 'meeting'
  const isImage = video.sourceKind === 'image'
  const mediaReady =
    /whisper|sidecar|transcript|transcribed/i.test(method) ||
    video.subtitleStatus === 'sidecar' ||
    video.subtitleStatus === 'transcribed' ||
    hasTranscriptText
  const imageReady = /ocr|vision|image-text/i.test(method) || video.subtitleStatus === 'ocr' || hasText
  return [
    {
      id: 'identity',
      label: '来源身份',
      status: hasIdentity ? 'done' : 'pending',
      detail: hasIdentity ? `${video.platformName} · ${video.inputType}` : '等待链接或文件进入系统',
    },
    {
      id: 'extractor',
      label: '解析器',
      status: /placeholder|metadata|local-metadata|url-metadata/i.test(method) ? 'partial' : 'done',
      detail: method,
    },
    {
      id: 'content',
      label: '可学习文本',
      status: hasText ? 'done' : contentLength > 0 ? 'partial' : 'blocked',
      detail: `${contentLength} 字符 · ${lineCount} 行`,
    },
    {
      id: 'media',
      label: isImage ? 'OCR/视觉' : isMedia ? '字幕/转写' : '结构化补强',
      status: isImage ? (imageReady ? 'done' : 'blocked') : isMedia ? (mediaReady ? 'done' : 'blocked') : hasText ? 'done' : 'partial',
      detail: isImage
        ? imageReady
          ? '已获得 OCR 文本或视觉标签'
          : '等待更清晰图片、同名文字稿或本地 OCR'
        : isMedia
          ? mediaReady
            ? '已获得字幕或本地转写'
            : '等待同名字幕或本地 Whisper'
          : warnings[0] || '可继续生成学习包和三结果',
    },
  ]
}

function nextActionsFor(workspace: BiliVideoWorkspace, method: string, contentLength: number): string[] {
  const actions: string[] = []
  const kind = workspace.video.sourceKind
  const hasTranscriptText = contentLength >= 180 || workspace.video.subtitleStatus === 'found'
  if (
    (kind === 'video' || kind === 'audio' || kind === 'podcast' || kind === 'meeting') &&
    !hasTranscriptText &&
    !/whisper|sidecar|transcript|transcribed/i.test(method)
  ) {
    actions.push('放入同名 .srt/.vtt/.txt，或安装 Whisper 后重新选择文件')
  }
  if (kind === 'image' && !/ocr|vision|image-text/i.test(method)) {
    actions.push('换更清晰截图，或把图片里的文字另存为同名 .txt')
  }
  if (contentLength < 180) {
    actions.push('补充正文、字幕、OCR 或手动笔记后再生成学习包')
  }
  actions.push('生成万象三结果，检查教程/导图/系统吸收是否有证据')
  actions.push('确认无误后归档到知识+大佬')
  return Array.from(new Set(actions)).slice(0, 5)
}

export function buildSourceIntakeDiagnostics(workspace: BiliVideoWorkspace | null): SourceIntakeDiagnostics {
  if (!workspace) {
    return {
      score: 0,
      label: 'WAITING',
      method: 'none',
      contentLength: 0,
      lineCount: 0,
      wordCount: 0,
      sourceKindLabel: '等待来源',
      recognitionLabel: '未开始',
      steps: [
        { id: 'identity', label: '来源身份', status: 'pending', detail: '粘贴链接或选择文件' },
        { id: 'content', label: '可学习文本', status: 'pending', detail: '等待解析' },
      ],
      nextActions: ['粘贴链接或选择本地文件'],
      warnings: [],
    }
  }

  const content = cleanText(getBiliUsableSourceText(workspace.video, workspace.transcript))
  const contentLength = content.length
  const lineCount = content.split(/\n+/).filter(Boolean).length
  const wordCount = countWords(content)
  const method = methodFrom(workspace)
  const steps = buildSteps(workspace, method, contentLength, lineCount)
  const doneWeight = steps.reduce((sum, step) => {
    if (step.status === 'done') return sum + 1
    if (step.status === 'partial') return sum + 0.56
    return sum
  }, 0)
  const contentBonus = Math.min(30, Math.round(contentLength / 180))
  const score = Math.min(98, Math.round((doneWeight / steps.length) * 68 + contentBonus))
  const kindLabel = KIND_LABELS[workspace.video.sourceKind] || workspace.video.sourceKind

  return {
    score,
    label: textQuality(contentLength),
    method,
    contentLength,
    lineCount,
    wordCount,
    sourceKindLabel: kindLabel,
    recognitionLabel: recognitionLabel(workspace, method, contentLength),
    steps,
    nextActions: nextActionsFor(workspace, method, contentLength),
    warnings: workspace.video.warnings || [],
  }
}
