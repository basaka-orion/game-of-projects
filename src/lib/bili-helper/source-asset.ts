import { buildSourceIntakeDiagnostics } from './intake-diagnostics'
import { getBiliUsableSourceText } from './source-content'
import type {
  BiliDownloadFormat,
  BiliVideoWorkspace,
  SourceAsset,
  SourceAssetArtifactKind,
  SourceAssetArtifactRecord,
  SourceAssetExportReceipt,
  SourceAssetLibraryReceipt,
  SourceAssetProvider,
  SourceAssetProviderRun,
  SourceAssetStage,
  SourceAssetStageId,
  SourceAssetStageStatus,
  SourceEvidenceRef,
} from './types'

const STAGE_LABELS: Record<SourceAssetStageId, string> = {
  received: '接收来源',
  metadata: '来源身份',
  content: '可学习文本',
  transcript: '字幕/OCR/转写',
  summary: '智能总结',
  artifacts: '学习产物',
  chatIndex: '来源对话索引',
  archived: '知识归档',
  exported: '下载导出',
}

const STAGE_ORDER: SourceAssetStageId[] = [
  'received',
  'metadata',
  'content',
  'transcript',
  'summary',
  'artifacts',
  'chatIndex',
  'archived',
  'exported',
]

function createSourceAssetId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function clean(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function sourceTextLines(workspace: BiliVideoWorkspace): string[] {
  return getBiliUsableSourceText(workspace.video, workspace.transcript)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function refKey(ref: SourceEvidenceRef): string {
  return `${ref.time || ''}:${ref.quote}`
}

export function collectSourceEvidenceRefs(workspace: BiliVideoWorkspace): SourceEvidenceRef[] {
  const refs: SourceEvidenceRef[] = []
  const lines = sourceTextLines(workspace)
  for (const [index, line] of lines.entries()) {
    const timestamp = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s*(.+)$/)
    const text = timestamp ? timestamp[2].replace(/^[-:：\s]+/, '') : line
    if (!clean(text)) continue
    refs.push({
      id: `src_${index + 1}`,
      label: timestamp ? `时间点 ${timestamp[1]}` : `片段 ${index + 1}`,
      time: timestamp?.[1],
      quote: clean(text).slice(0, 220),
      sourceId: workspace.video.id,
    })
    if (refs.length >= 32) break
  }

  for (const ref of workspace.wanxiang?.teaching.evidenceRefs || []) {
    if (clean(ref.quote)) refs.push({ ...ref, sourceId: ref.sourceId || workspace.video.id })
  }

  const unique = new Map<string, SourceEvidenceRef>()
  for (const ref of refs) {
    const key = refKey(ref)
    if (!unique.has(key)) unique.set(key, { ...ref, id: ref.id || `src_${unique.size + 1}` })
  }
  return Array.from(unique.values()).slice(0, 40)
}

function stage(id: SourceAssetStageId, status: SourceAssetStageStatus, detail: string, provider?: string): SourceAssetStage {
  return {
    id,
    label: STAGE_LABELS[id],
    status,
    detail,
    provider,
  }
}

function derivePipeline(workspace: BiliVideoWorkspace, evidenceRefs: SourceEvidenceRef[]): SourceAssetStage[] {
  const diagnostics = buildSourceIntakeDiagnostics(workspace)
  const hasText = diagnostics.contentLength >= 180
  const hasAnyText = diagnostics.contentLength > 0
  const timedRefs = evidenceRefs.filter((ref) => ref.time).length
  const hasModePack = Object.values(workspace.modePacks || {}).some(Boolean)
  const hasPack = Boolean((workspace.pack || hasModePack) && hasText)
  const hasArtifacts = hasPack || Boolean(workspace.wanxiang && hasText)
  const hasQuestionAnswer = workspace.chat.some((message) => message.role === 'assistant' && /证据|时间|片段|来源|核对/i.test(message.content))
  const archived = workspace.archive?.status === 'saved' || Boolean(workspace.sourceAsset?.libraryReceipt)
  const exported = (workspace.sourceAsset?.exportReceipts || []).some((receipt) => receipt.status === 'done')
  const isMedia = ['video', 'audio', 'podcast', 'meeting'].includes(workspace.video.sourceKind)
  const transcriptReady = timedRefs > 0 || ['found', 'sidecar', 'transcribed', 'ocr'].includes(workspace.video.subtitleStatus)

  return [
    stage('received', 'done', `${workspace.video.platformName} · ${workspace.video.inputType}`, workspace.video.resolvedBy),
    stage('metadata', workspace.video.title && workspace.video.platformName ? 'done' : 'blocked', workspace.video.title || '等待来源身份'),
    stage(
      'content',
      hasText ? 'done' : hasAnyText ? 'partial' : 'blocked',
      hasText ? `${diagnostics.contentLength} 字符可学习内容` : hasAnyText ? '内容过短，仅能弱处理' : '缺少字幕、正文、OCR 或转写',
      diagnostics.method,
    ),
    stage(
      'transcript',
      transcriptReady ? 'done' : isMedia ? 'blocked' : hasText ? 'partial' : 'pending',
      transcriptReady ? `${timedRefs || evidenceRefs.length} 条证据片段` : isMedia ? '等待字幕或本地转写' : '非音视频来源可跳过完整字幕',
      workspace.video.subtitleStatus,
    ),
    stage('summary', hasPack ? 'done' : hasText ? 'pending' : 'blocked', hasPack ? workspace.pack?.summary.slice(0, 90) || '已生成' : hasText ? '可生成智能总结' : '缺正文不生成总结'),
    stage(
      'artifacts',
      hasArtifacts ? 'done' : hasText ? 'pending' : 'blocked',
      hasArtifacts ? `学习包/万象 ${[hasPack, Boolean(workspace.wanxiang && hasText)].filter(Boolean).length} 类` : hasText ? '可生成学习包和万象三结果' : '缺证据不生成产物',
    ),
    stage('chatIndex', hasQuestionAnswer ? 'done' : evidenceRefs.length ? 'partial' : 'blocked', evidenceRefs.length ? `${evidenceRefs.length} 条证据可用于问答` : '缺证据，问答只能提示补内容'),
    stage('archived', archived ? 'done' : hasArtifacts ? 'pending' : 'blocked', archived ? workspace.archive?.sourceId || workspace.sourceAsset?.libraryReceipt?.sourceId || '已归档' : hasArtifacts ? '可归档到知识库' : '产物不足'),
    stage('exported', exported ? 'done' : hasArtifacts || hasAnyText ? 'pending' : 'blocked', exported ? '已有导出回执' : hasArtifacts || hasAnyText ? '可导出 Markdown/SRT/JSON/导图' : '缺内容'),
  ]
}

function sourceAssetStatus(pipeline: SourceAssetStage[], archived: boolean): SourceAsset['status'] {
  if (archived) return 'archived'
  if (pipeline.some((item) => item.id === 'content' && item.status === 'done')) return 'ready'
  if (pipeline.some((item) => item.status === 'partial')) return 'partial'
  if (pipeline.some((item) => item.status === 'blocked')) return 'blocked'
  return 'empty'
}

export function refreshSourceAsset(workspace: BiliVideoWorkspace): BiliVideoWorkspace {
  const evidenceRefs = collectSourceEvidenceRefs(workspace)
  const diagnostics = buildSourceIntakeDiagnostics(workspace)
  const previous = workspace.sourceAsset
  const pipeline = derivePipeline(workspace, evidenceRefs)
  const archived = workspace.archive?.status === 'saved' || Boolean(previous?.libraryReceipt)
  return {
    ...workspace,
    sourceAsset: {
      id: previous?.id || createSourceAssetId('source_asset'),
      sourceId: workspace.video.id,
      title: workspace.video.title,
      status: sourceAssetStatus(pipeline, archived),
      updatedAt: Date.now(),
      intakeRun: {
        method: diagnostics.method,
        contentLength: diagnostics.contentLength,
        evidenceCount: evidenceRefs.length,
      },
      pipeline,
      evidenceRefs,
      providerRuns: previous?.providerRuns || [],
      artifacts: previous?.artifacts || [],
      exportReceipts: previous?.exportReceipts || [],
      libraryReceipt: previous?.libraryReceipt,
    },
  }
}

export function appendProviderRun(
  workspace: BiliVideoWorkspace,
  input: Omit<SourceAssetProviderRun, 'id' | 'startedAt'> & { id?: string; startedAt?: number },
): BiliVideoWorkspace {
  const refreshed = refreshSourceAsset(workspace)
  const run: SourceAssetProviderRun = {
    ...input,
    id: input.id || createSourceAssetId('provider'),
    startedAt: input.startedAt || Date.now(),
  }
  return {
    ...refreshed,
    sourceAsset: {
      ...refreshed.sourceAsset!,
      providerRuns: [run, ...(refreshed.sourceAsset?.providerRuns || [])].slice(0, 30),
      updatedAt: Date.now(),
    },
  }
}

export function appendArtifactRecord(
  workspace: BiliVideoWorkspace,
  input: Omit<SourceAssetArtifactRecord, 'id' | 'createdAt' | 'evidenceRefIds'> & {
    id?: string
    createdAt?: number
    evidenceRefIds?: string[]
  },
): BiliVideoWorkspace {
  const refreshed = refreshSourceAsset(workspace)
  const evidenceRefIds = input.evidenceRefIds || (refreshed.sourceAsset?.evidenceRefs || []).slice(0, 8).map((ref) => ref.id)
  const artifact: SourceAssetArtifactRecord = {
    ...input,
    id: input.id || createSourceAssetId(input.kind),
    createdAt: input.createdAt || Date.now(),
    evidenceRefIds,
  }
  const existing = refreshed.sourceAsset?.artifacts || []
  const nextArtifacts = [artifact, ...existing.filter((item) => item.kind !== artifact.kind || item.label !== artifact.label)].slice(0, 40)
  return {
    ...refreshed,
    sourceAsset: {
      ...refreshed.sourceAsset!,
      artifacts: nextArtifacts,
      updatedAt: Date.now(),
    },
  }
}

export function appendExportReceipt(
  workspace: BiliVideoWorkspace,
  input: Omit<SourceAssetExportReceipt, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
): BiliVideoWorkspace {
  const refreshed = refreshSourceAsset(workspace)
  const receipt: SourceAssetExportReceipt = {
    ...input,
    id: input.id || createSourceAssetId('export'),
    createdAt: input.createdAt || Date.now(),
  }
  return {
    ...refreshed,
    sourceAsset: {
      ...refreshed.sourceAsset!,
      exportReceipts: [receipt, ...(refreshed.sourceAsset?.exportReceipts || [])].slice(0, 30),
      updatedAt: Date.now(),
    },
  }
}

export function setLibraryReceipt(workspace: BiliVideoWorkspace, receipt: SourceAssetLibraryReceipt): BiliVideoWorkspace {
  const refreshed = refreshSourceAsset(workspace)
  return {
    ...refreshed,
    sourceAsset: {
      ...refreshed.sourceAsset!,
      libraryReceipt: receipt,
      updatedAt: Date.now(),
    },
  }
}

export function sourceAssetToExportJson(workspace: BiliVideoWorkspace): string {
  const refreshed = refreshSourceAsset(workspace)
  const asset = refreshed.sourceAsset
  return JSON.stringify(
    {
      sourceAsset: asset,
      source: {
        id: workspace.video.id,
        title: workspace.video.title,
        url: workspace.video.url,
        platform: workspace.video.platformName,
        sourceKind: workspace.video.sourceKind,
        owner: workspace.video.owner,
      },
      pack: workspace.pack,
      modePacks: workspace.modePacks,
      wanxiang: workspace.wanxiang,
    },
    (key, value) => {
      if (/api[_-]?key|token|secret|authorization/i.test(key)) return '[redacted]'
      if (typeof value === 'string' && /(api[_-]?key|token|secret|authorization)\s*[:=]\s*[A-Za-z0-9_.-]{8,}/i.test(value)) {
        return value.replace(/(api[_-]?key|token|secret|authorization)(\s*[:=]\s*)[A-Za-z0-9_.-]{8,}/gi, '$1$2[redacted]')
      }
      return value
    },
    2,
  )
}

export function artifactRecord(
  kind: SourceAssetArtifactKind,
  label: string,
  description: string,
  source: SourceAssetProvider | 'ai',
  status: SourceAssetArtifactRecord['status'] = 'generated',
  error?: string,
): Omit<SourceAssetArtifactRecord, 'id' | 'createdAt' | 'evidenceRefIds'> {
  return { kind, label, description, source, status, error }
}

export { STAGE_ORDER as SOURCE_ASSET_STAGE_ORDER }
