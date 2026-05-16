import { appendProviderRun, refreshSourceAsset } from './source-asset'
import type { BiliVideoInfo, BiliVideoWorkspace, SourceAssetProviderRun } from './types'

export const BIBIGPT_SAFE_STORAGE_KEY = 'bibigpt_api_key'

export interface BibiGptChapter {
  time: string
  title: string
  note: string
}

export interface BibiGptSourceResult {
  contentId?: string
  htmlUrl?: string
  summary: string
  transcript: string
  chapters: BibiGptChapter[]
  raw: unknown
  providerRun: Omit<SourceAssetProviderRun, 'id' | 'startedAt'>
}

interface BibiGptIpcResponse {
  success: boolean
  data?: unknown
  configured?: boolean
  status?: number
  error?: string
}

function getElectronAPI(): Window['electronAPI'] | undefined {
  return typeof window !== 'undefined' ? window.electronAPI : undefined
}

function text(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function rawText(value: unknown): string {
  return String(value || '').trim()
}

function arrayFrom(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function getPath(input: unknown, path: string[]): unknown {
  let cursor = input as Record<string, unknown> | undefined
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object') return undefined
    cursor = cursor[key] as Record<string, unknown> | undefined
  }
  return cursor
}

function firstPresent(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

function secondsToTime(value: unknown): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return ''
  const seconds = Math.floor(numeric > 10000 ? numeric / 1000 : numeric)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${minutes}:${String(rest).padStart(2, '0')}`
}

function extractContentId(data: unknown): string {
  return (
    text(getPath(data, ['detail', 'dbId'])) ||
    text(getPath(data, ['detail', 'id'])) ||
    text(getPath(data, ['detail', 'contentId'])) ||
    text(getPath(data, ['videoDetail', 'dbId'])) ||
    text(getPath(data, ['videoDetail', 'id'])) ||
    text(getPath(data, ['data', 'detail', 'dbId'])) ||
    text(getPath(data, ['data', 'detail', 'id'])) ||
    text(getPath(data, ['id'])) ||
    text(getPath(data, ['contentId'])) ||
    text(getPath(data, ['dbId'])) ||
    text(getPath(data, ['data', 'id'])) ||
    text(getPath(data, ['data', 'contentId']))
  )
}

function extractSummary(data: unknown): string {
  return (
    rawText(getPath(data, ['detail', 'summary'])) ||
    rawText(getPath(data, ['summary'])) ||
    rawText(getPath(data, ['data', 'detail', 'summary'])) ||
    rawText(getPath(data, ['data', 'summary'])) ||
    rawText(getPath(data, ['videoDetail', 'summary'])) ||
    rawText(getPath(data, ['detail', 'note'])) ||
    rawText(getPath(data, ['note'])) ||
    rawText(getPath(data, ['detail', 'contentText'])) ||
    rawText(getPath(data, ['contentText'])) ||
    rawText(getPath(data, ['detail', 'descriptionText'])) ||
    rawText(getPath(data, ['descriptionText'])) ||
    rawText(getPath(data, ['detail', 'content'])) ||
    rawText(getPath(data, ['content'])) ||
    ''
  )
}

function extractSubtitleItems(data: unknown): unknown[] {
  const candidates = [
    getPath(data, ['detail', 'subtitlesArray']),
    getPath(data, ['videoDetail', 'subtitlesArray']),
    getPath(data, ['subtitlesArray']),
    getPath(data, ['detail', 'subtitles']),
    getPath(data, ['detail', 'subtitle']),
    getPath(data, ['detail', 'subtitleItems']),
    getPath(data, ['subtitles']),
    getPath(data, ['subtitle']),
    getPath(data, ['subtitleItems']),
    getPath(data, ['segments']),
    getPath(data, ['data', 'detail', 'subtitlesArray']),
    getPath(data, ['data', 'videoDetail', 'subtitlesArray']),
    getPath(data, ['data', 'subtitlesArray']),
    getPath(data, ['data', 'subtitles']),
  ]
  return candidates.map(arrayFrom).find((items) => items.length > 0) || []
}

function subtitleLine(item: unknown, index: number): string {
  const row = item as Record<string, unknown>
  const content = text(row.text || row.content || row.subtitle || row.sentence || row.caption || row.description)
  if (!content) return ''
  const time = secondsToTime(firstPresent(row.startTime, row.from, row.start, row.timestamp, row.time))
  return `${time || `片段${index + 1}`} ${content}`
}

function extractTranscript(summaryData: unknown, subtitleData?: unknown): string {
  const subtitleItems = [...extractSubtitleItems(summaryData), ...extractSubtitleItems(subtitleData)]
  const lines = subtitleItems.map(subtitleLine).filter(Boolean)
  if (lines.length > 0) return Array.from(new Set(lines)).join('\n')
  return (
    rawText(getPath(summaryData, ['detail', 'transcript'])) ||
    rawText(getPath(summaryData, ['transcript'])) ||
    rawText(getPath(summaryData, ['detail', 'contentText'])) ||
    rawText(getPath(summaryData, ['contentText'])) ||
    rawText(getPath(summaryData, ['detail', 'descriptionText'])) ||
    rawText(getPath(summaryData, ['descriptionText'])) ||
    rawText(getPath(summaryData, ['detail', 'content'])) ||
    rawText(getPath(summaryData, ['content'])) ||
    rawText(getPath(summaryData, ['data', 'detail', 'contentText'])) ||
    rawText(getPath(summaryData, ['data', 'contentText'])) ||
    rawText(getPath(subtitleData, ['detail', 'contentText'])) ||
    rawText(getPath(subtitleData, ['contentText']))
  )
}

function extractChapters(data: unknown, transcript: string, summary: string): BibiGptChapter[] {
  const candidateArrays = [
    getPath(data, ['detail', 'chapters']),
    getPath(data, ['videoDetail', 'chapters']),
    getPath(data, ['chapters']),
    getPath(data, ['data', 'detail', 'chapters']),
    getPath(data, ['data', 'chapters']),
    getPath(data, ['detail', 'outline']),
  ]
  const chapters = candidateArrays.map(arrayFrom).find((items) => items.length > 0) || []
  const mapped = chapters
    .map((item, index) => {
      const row = item as Record<string, unknown>
      const title = text(row.title || row.summary || row.name || row.content)
      if (!title) return null
      return {
        time: secondsToTime(firstPresent(row.startTime, row.from, row.start, row.timestamp, row.time)) || `章节${index + 1}`,
        title: title.slice(0, 48),
        note: text(row.note || row.description || row.summary || title).slice(0, 180),
      }
    })
    .filter(Boolean) as BibiGptChapter[]
  if (mapped.length > 0) return mapped.slice(0, 12)

  return transcript
    .split(/\n+/)
    .map((line) => line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s*(.+)$/))
    .filter(Boolean)
    .slice(0, 8)
    .map((match) => ({
      time: match![1],
      title: match![2].slice(0, 36),
      note: match![2].slice(0, 160),
    }))
    .concat(
      !transcript && summary
        ? [{ time: 'BibiGPT', title: '摘要', note: summary.slice(0, 180) }]
        : [],
    )
}

async function bibigptRequest(payload: Record<string, unknown>): Promise<BibiGptIpcResponse> {
  const electronAPI = getElectronAPI()
  if (!electronAPI?.bibigptRequest) {
    return { success: false, configured: false, error: '当前运行环境没有 BibiGPT IPC。' }
  }
  return electronAPI.bibigptRequest(payload)
}

export async function saveBibiGptApiKey(value: string): Promise<{ success: boolean; error?: string }> {
  const electronAPI = getElectronAPI()
  const trimmed = value.trim()
  if (!trimmed) return { success: false, error: 'API Key 为空。' }
  if (electronAPI?.bibigptRequest) {
    const configured = await electronAPI.bibigptRequest({ action: 'configure', apiKey: trimmed })
    if (configured.success) return { success: true }
    if (!electronAPI.safeStorageSet) return { success: false, error: configured.error || '当前环境没有 BibiGPT 配置 IPC。' }
  }
  if (!electronAPI?.safeStorageSet) return { success: false, error: '当前环境没有 safeStorage。' }
  return electronAPI.safeStorageSet(BIBIGPT_SAFE_STORAGE_KEY, trimmed)
}

export async function checkBibiGptProvider(): Promise<{ configured: boolean; ok: boolean; detail: string }> {
  const response = await bibigptRequest({ action: 'health' })
  return {
    configured: Boolean(response.configured),
    ok: Boolean(response.success),
    detail: response.success
      ? 'BibiGPT OpenAPI 可用'
      : response.configured
        ? response.error || 'BibiGPT 已配置但健康检查失败'
        : '未配置 BibiGPT API Key',
  }
}

async function waitForTask(taskId: string): Promise<BibiGptIpcResponse | null> {
  for (let index = 0; index < 8; index += 1) {
    const response = await bibigptRequest({ action: 'taskStatus', taskId, includeDetail: true })
    if (!response.success) return response
    const status = text(getPath(response.data, ['status'])).toLowerCase()
    if (!status || /done|completed|success|finish/.test(status) || extractSummary(response.data)) return response
    await new Promise((resolve) => globalThis.setTimeout(resolve, 1600 + index * 500))
  }
  return null
}

function extractTaskId(data: unknown): string {
  return text(getPath(data, ['taskId'])) || text(getPath(data, ['id'])) || text(getPath(data, ['data', 'taskId'])) || text(getPath(data, ['data', 'id']))
}

function hasUsableBibiGptPayload(data: unknown): boolean {
  return Boolean(extractSummary(data) || extractTranscript(data))
}

export async function fetchBibiGptSourceResult(video: BiliVideoInfo): Promise<BibiGptSourceResult> {
  const startedAt = Date.now()
  const url = video.canonicalUrl || video.url
  const createTask = await bibigptRequest({ action: 'createSummaryTask', url })
  let summaryResponse: BibiGptIpcResponse | null = null
  const taskId = extractTaskId(createTask.data)
  if (createTask.success && taskId) summaryResponse = await waitForTask(taskId)
  if (!summaryResponse?.success || !hasUsableBibiGptPayload(summaryResponse.data)) {
    summaryResponse = await bibigptRequest({ action: 'summarize', url, includeDetail: true })
  }
  if (summaryResponse.success && !hasUsableBibiGptPayload(summaryResponse.data)) {
    summaryResponse = await bibigptRequest({ action: 'summarizeWithConfig', url, includeDetail: true })
  }
  if (!summaryResponse?.success) {
    throw new Error(summaryResponse?.error || 'BibiGPT 摘要失败')
  }

  const subtitleResponse = await bibigptRequest({ action: 'getSubtitle', url, enabledSpeaker: true })
  const summary = extractSummary(summaryResponse.data)
  const transcript = extractTranscript(summaryResponse.data, subtitleResponse.success ? subtitleResponse.data : undefined)
  const chapters = extractChapters(summaryResponse.data, transcript, summary)
  const contentId = extractContentId(summaryResponse.data)
  const htmlUrl =
    text(getPath(summaryResponse.data, ['htmlUrl'])) ||
    text(getPath(summaryResponse.data, ['detail', 'url'])) ||
    text(getPath(summaryResponse.data, ['data', 'htmlUrl'])) ||
    text(getPath(summaryResponse.data, ['data', 'detail', 'url']))
  const mindmapResponse = contentId && summary ? await bibigptRequest({ action: 'mindmap', contentId, summary }) : null
  const completedAt = Date.now()

  if (!summary && !transcript) throw new Error('BibiGPT 没有返回摘要或字幕。')

  return {
    contentId,
    htmlUrl,
    summary,
    transcript,
    chapters,
    raw: summaryResponse.data,
    providerRun: {
      provider: 'bibigpt',
      capability: 'summary+subtitle',
      status: 'done',
      completedAt,
      durationMs: completedAt - startedAt,
      detail: `BibiGPT 返回 ${summary.length} 字摘要、${transcript.split(/\n+/).filter(Boolean).length} 行字幕/片段`,
      receipt: {
        contentId,
        htmlUrl,
        taskId,
        subtitle: subtitleResponse.success,
        mindmapFileUrl: mindmapResponse?.success ? text(getPath(mindmapResponse.data, ['fileUrl'])) : '',
      },
    },
  }
}

export function applyBibiGptResultToWorkspace(workspace: BiliVideoWorkspace, result: BibiGptSourceResult): BiliVideoWorkspace {
  const sourceText = result.transcript || result.summary
  const next = appendProviderRun(
    {
      ...workspace,
      transcript: result.transcript || workspace.transcript,
      video: {
        ...workspace.video,
        contentText: result.transcript || result.summary || workspace.video.contentText,
        subtitleStatus: result.transcript ? 'found' : workspace.video.subtitleStatus,
        warnings: workspace.video.warnings.filter((warning) => !/BibiGPT/i.test(warning)),
        tags: Array.from(new Set([...workspace.video.tags, 'BibiGPT', result.transcript ? 'bibi-subtitle' : 'bibi-summary'])),
      },
      chat: workspace.chat.some((message) => /BibiGPT/.test(message.content))
        ? workspace.chat
        : [
            ...workspace.chat,
            {
              id: `assistant_${Date.now().toString(36)}`,
              role: 'assistant',
              content: sourceText
                ? `BibiGPT 已返回可学习内容：${result.summary ? '摘要' : ''}${result.transcript ? ' / 字幕片段' : ''}。后续总结、学习包和问答会优先引用这些证据。`
                : 'BibiGPT 已调用，但没有返回可学习文本。',
              createdAt: Date.now(),
            },
          ],
    },
    result.providerRun,
  )
  return refreshSourceAsset(next)
}
