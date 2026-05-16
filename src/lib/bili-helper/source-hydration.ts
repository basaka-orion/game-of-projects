import { applyBibiGptResultToWorkspace, fetchBibiGptSourceResult } from './bibigpt'
import { appendProviderRun, refreshSourceAsset } from './source-asset'
import { getBiliUsableSourceText, isBiliPlaceholderSourceText } from './source-content'
import type { BiliVideoInfo, BiliVideoWorkspace, SourceAssetProvider, SourceAssetProviderRun } from './types'

export interface SourceHydrationAttempt {
  provider: SourceAssetProvider
  capability: string
  status: SourceAssetProviderRun['status']
  detail: string
  error?: string
}

export interface SourceHydrationResult {
  workspace: BiliVideoWorkspace
  sourceText: string
  hydrated: boolean
  attempts: SourceHydrationAttempt[]
  blockedMessage?: string
}

interface ElectronApiSubset {
  fetchUrl?: Window['electronAPI']['fetchUrl']
  executeCommand?: Window['electronAPI']['executeCommand']
  extractFileContent?: Window['electronAPI']['extractFileContent']
  transcribeMediaFile?: Window['electronAPI']['transcribeMediaFile']
  bibigptRequest?: Window['electronAPI']['bibigptRequest']
}

interface ExtractedContentLike {
  success?: boolean
  kind?: string
  method?: string
  content?: string
  rawContent?: string
  warnings?: string[]
  metadata?: {
    fileName?: string
    filePath?: string
    extension?: string
    size?: number
  }
  error?: string
}

const MIN_SOURCE_CHARS = 24

function getElectronApi(): ElectronApiSubset {
  return (typeof window !== 'undefined' ? (window as unknown as { electronAPI?: ElectronApiSubset }).electronAPI : undefined) || {}
}

function clean(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function sourceUrl(video: BiliVideoInfo): string {
  return clean(video.canonicalUrl || video.url)
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function isMediaSource(video: BiliVideoInfo): boolean {
  return ['video', 'audio', 'podcast', 'meeting'].includes(video.sourceKind)
}

function isRealSourceText(value: string | undefined): boolean {
  return clean(value).length >= MIN_SOURCE_CHARS && !isBiliPlaceholderSourceText(value)
}

function providerTag(provider: SourceAssetProvider, method?: string): string {
  if (provider === 'yt-dlp') return 'yt-dlp-subtitle'
  if (provider === 'bibigpt') return 'BibiGPT'
  if (provider === 'whisper') return 'local-transcription'
  if (method?.includes('ocr') || method?.includes('vision')) return 'local-ocr'
  return method || provider
}

function subtitleStatusFor(provider: SourceAssetProvider, method?: string): BiliVideoInfo['subtitleStatus'] {
  const lowered = clean(method).toLowerCase()
  if (provider === 'yt-dlp' || lowered.includes('subtitle')) return 'found'
  if (provider === 'whisper' || lowered.includes('whisper') || lowered.includes('transcrib')) return 'transcribed'
  if (lowered.includes('sidecar')) return 'sidecar'
  if (lowered.includes('ocr') || lowered.includes('vision')) return 'ocr'
  return 'metadata'
}

function applyHydratedText(
  workspace: BiliVideoWorkspace,
  input: {
    text: string
    provider: SourceAssetProvider
    method?: string
    title?: string
    author?: string
    description?: string
    cover?: string
    siteName?: string
    canonicalUrl?: string
    favicon?: string
    warnings?: string[]
  },
): BiliVideoWorkspace {
  const text = input.text.trim()
  const methodTag = providerTag(input.provider, input.method)
  const warnings = Array.from(new Set([...(workspace.video.warnings || []), ...(input.warnings || [])].map(clean).filter(Boolean)))
  return refreshSourceAsset({
    ...workspace,
    transcript: text,
    video: {
      ...workspace.video,
      title: clean(input.title) || workspace.video.title,
      owner: clean(input.author) || workspace.video.owner,
      description: clean(input.description) || workspace.video.description,
      cover: clean(input.cover) || workspace.video.cover,
      siteName: clean(input.siteName) || workspace.video.siteName,
      canonicalUrl: clean(input.canonicalUrl) || workspace.video.canonicalUrl,
      favicon: clean(input.favicon) || workspace.video.favicon,
      contentText: text,
      subtitleStatus: subtitleStatusFor(input.provider, input.method),
      tags: Array.from(new Set([...workspace.video.tags, methodTag].filter(Boolean))),
      warnings,
      resolvedBy: input.provider === 'electron' ? 'api' : workspace.video.resolvedBy,
    },
  })
}

function recordProviderRun(
  workspace: BiliVideoWorkspace,
  attempt: SourceHydrationAttempt,
  startedAt: number,
  receipt?: Record<string, unknown>,
): BiliVideoWorkspace {
  const completedAt = Date.now()
  return appendProviderRun(workspace, {
    provider: attempt.provider,
    capability: attempt.capability,
    status: attempt.status,
    startedAt,
    completedAt,
    durationMs: completedAt - startedAt,
    detail: attempt.detail,
    error: attempt.error,
    receipt,
  })
}

function summarizeAttempts(attempts: SourceHydrationAttempt[]): string {
  const tried = attempts
    .map((attempt) => `${attempt.provider}/${attempt.capability}: ${attempt.status === 'done' ? '已拿到内容' : attempt.error || attempt.detail}`)
    .slice(0, 4)
    .join('；')
  return tried || '没有可用的自动取材器'
}

export function buildSourceHydrationBlockedMessage(attempts: SourceHydrationAttempt[]): string {
  return `无法生成真实结论：缺真实字幕、正文、OCR 或转写。自动取材已尝试：${summarizeAttempts(attempts)}。下一步：粘贴正文/字幕，选择本地文件，或补同名 .srt/.vtt/.txt 后再生成。`
}

function shellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

const YT_DLP_SUBTITLE_SCRIPT = `
import glob
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile

url = sys.argv[1]
tmp = tempfile.mkdtemp(prefix="openbasaka-url-subs-")

def clean_subtitle(raw):
    raw = re.sub(r"<[^>]+>", " ", raw)
    raw = raw.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    lines = []
    for line in raw.splitlines():
        line = line.strip().replace("\\ufeff", "")
        if not line:
            continue
        if line.startswith(("WEBVTT", "Kind:", "Language:", "NOTE", "STYLE", "REGION")):
            continue
        if "-->" in line or re.match(r"^\\d+$", line):
            continue
        line = re.sub(r"\\s+", " ", line).strip()
        if not line:
            continue
        if lines and lines[-1] == line:
            continue
        lines.append(line)
    return "\\n".join(lines)

def read_downloaded_text():
    files = glob.glob(os.path.join(tmp, "*"))
    parts = []
    for file_path in files:
        if not file_path.lower().endswith((".vtt", ".srt", ".txt")):
            continue
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as fh:
                text = clean_subtitle(fh.read())
            if text:
                parts.append(text)
        except Exception:
            pass
    return "\\n".join(parts).strip(), [os.path.basename(item) for item in files]

base = [
    sys.executable,
    "-m",
    "yt_dlp",
    "--skip-download",
    "--write-subs",
    "--write-auto-subs",
    "--sub-langs",
    "zh-Hans,zh-CN,zh,en.*",
    "--sub-format",
    "vtt/srt/best",
    "--output",
    str(pathlib.Path(tmp) / "source.%(ext)s"),
]

cookie_modes = [
    ("chrome", ["--cookies-from-browser", "chrome"]),
    ("safari", ["--cookies-from-browser", "safari"]),
    ("firefox", ["--cookies-from-browser", "firefox"]),
    ("plain", []),
]
errors = []
for cookie_mode, extra in cookie_modes:
    try:
        proc = subprocess.run(base + extra + [url], capture_output=True, text=True, timeout=75)
        message = (proc.stderr or proc.stdout or "").strip()
        if proc.returncode != 0 or message:
            errors.append(f"{cookie_mode}: {message[-700:]}")
    except subprocess.TimeoutExpired:
        errors.append(f"{cookie_mode}: yt-dlp subtitle extraction timed out")
    text, files = read_downloaded_text()
    if len(re.sub(r"\\s+", "", text)) >= 24:
        print(json.dumps({"success": True, "text": text, "method": "yt-dlp-subtitle", "cookieMode": cookie_mode, "files": files}, ensure_ascii=False))
        raise SystemExit(0)

error_text = "；".join(errors[-4:]) or "yt-dlp 没有下载到字幕文件"
if "Subtitles are only available when logged in" in error_text:
    error_text += "；已依次尝试 Chrome/Safari/Firefox 浏览器登录态，请确认浏览器已登录 B站或导入 cookies。"
print(json.dumps({"success": False, "error": error_text, "attempts": [item.split(':', 1)[0] for item in errors], "files": read_downloaded_text()[1]}, ensure_ascii=False))
`

async function tryBibiGpt(workspace: BiliVideoWorkspace, attempts: SourceHydrationAttempt[]): Promise<BiliVideoWorkspace> {
  const api = getElectronApi()
  const url = sourceUrl(workspace.video)
  if (!isHttpUrl(url) || !isMediaSource(workspace.video)) return workspace
  if (!api.bibigptRequest) {
    const attempt: SourceHydrationAttempt = {
      provider: 'bibigpt',
      capability: 'summary+subtitle',
      status: 'skipped',
      detail: 'BibiGPT IPC 未配置，跳过远程摘要/字幕。',
    }
    attempts.push(attempt)
    return recordProviderRun(workspace, attempt, Date.now())
  }

  const startedAt = Date.now()
  try {
    const result = await fetchBibiGptSourceResult(workspace.video)
    const next = applyBibiGptResultToWorkspace(workspace, result)
    const sourceText = getBiliUsableSourceText(next.video, next.transcript)
    attempts.push({
      provider: 'bibigpt',
      capability: 'summary+subtitle',
      status: sourceText ? 'done' : 'failed',
      detail: sourceText ? `BibiGPT 返回 ${sourceText.length} 字可学习内容。` : 'BibiGPT 返回了结果，但没有形成可学习正文。',
      error: sourceText ? undefined : 'empty source text',
    })
    return next
  } catch (error) {
    const attempt: SourceHydrationAttempt = {
      provider: 'bibigpt',
      capability: 'summary+subtitle',
      status: 'failed',
      detail: 'BibiGPT 没有返回可用字幕或摘要。',
      error: error instanceof Error ? error.message : String(error),
    }
    attempts.push(attempt)
    return recordProviderRun(workspace, attempt, startedAt)
  }
}

async function tryYtDlpSubtitle(workspace: BiliVideoWorkspace, attempts: SourceHydrationAttempt[]): Promise<BiliVideoWorkspace> {
  const api = getElectronApi()
  const url = sourceUrl(workspace.video)
  if (!isHttpUrl(url) || !isMediaSource(workspace.video)) return workspace
  if (!api.executeCommand) {
    const attempt: SourceHydrationAttempt = {
      provider: 'yt-dlp',
      capability: 'subtitle',
      status: 'skipped',
      detail: 'Electron executeCommand 不可用，不能自动调用 yt-dlp 字幕。',
    }
    attempts.push(attempt)
    return recordProviderRun(workspace, attempt, Date.now())
  }

  const startedAt = Date.now()
  try {
    const command = `python3 -c ${shellArg(YT_DLP_SUBTITLE_SCRIPT)} ${shellArg(url)}`
    const result = await api.executeCommand(command, 95000)
    const output = clean(result?.stdout)
    const parsed = output ? JSON.parse(output) as { success?: boolean; text?: string; method?: string; error?: string; files?: string[]; cookieMode?: string } : null
    if (parsed?.success && isRealSourceText(parsed.text)) {
      const attempt: SourceHydrationAttempt = {
        provider: 'yt-dlp',
        capability: 'subtitle',
        status: 'done',
        detail: `yt-dlp 已提取 ${clean(parsed.text).length} 字字幕。`,
      }
      attempts.push(attempt)
      const next = applyHydratedText(workspace, {
        text: parsed.text || '',
        provider: 'yt-dlp',
        method: parsed.method || 'yt-dlp-subtitle',
        warnings: parsed.cookieMode ? [`yt-dlp 字幕模式：${parsed.cookieMode}`] : [],
      })
      return recordProviderRun(next, attempt, startedAt, { files: parsed.files || [], cookieMode: parsed.cookieMode })
    }
    const attempt: SourceHydrationAttempt = {
      provider: 'yt-dlp',
      capability: 'subtitle',
      status: 'failed',
      detail: 'yt-dlp 没有拿到可用字幕。',
      error: parsed?.error || result?.stderr || 'empty subtitle',
    }
    attempts.push(attempt)
    return recordProviderRun(workspace, attempt, startedAt, { stdout: output.slice(0, 500) })
  } catch (error) {
    const attempt: SourceHydrationAttempt = {
      provider: 'yt-dlp',
      capability: 'subtitle',
      status: 'failed',
      detail: 'yt-dlp 字幕提取失败。',
      error: error instanceof Error ? error.message : String(error),
    }
    attempts.push(attempt)
    return recordProviderRun(workspace, attempt, startedAt)
  }
}

async function tryFetchUrlText(workspace: BiliVideoWorkspace, attempts: SourceHydrationAttempt[]): Promise<BiliVideoWorkspace> {
  const api = getElectronApi()
  const url = sourceUrl(workspace.video)
  if (!isHttpUrl(url) || isMediaSource(workspace.video)) return workspace
  if (!api.fetchUrl) {
    const attempt: SourceHydrationAttempt = {
      provider: 'electron',
      capability: 'webpage-content',
      status: 'skipped',
      detail: 'fetchUrl IPC 不可用，不能抓取网页正文。',
    }
    attempts.push(attempt)
    return recordProviderRun(workspace, attempt, Date.now())
  }

  const startedAt = Date.now()
  try {
    const fetched = await api.fetchUrl(url)
    const content = fetched?.content || ''
    if (!fetched?.error && isRealSourceText(content)) {
      const attempt: SourceHydrationAttempt = {
        provider: 'electron',
        capability: 'webpage-content',
        status: 'done',
        detail: `网页正文抓取成功：${clean(content).length} 字。`,
      }
      attempts.push(attempt)
      const next = applyHydratedText(workspace, {
        text: content,
        provider: 'electron',
        method: 'fetch-url',
        title: fetched.title,
        author: fetched.author,
        description: fetched.description,
        cover: fetched.cover,
        siteName: fetched.siteName,
        canonicalUrl: fetched.canonicalUrl,
        favicon: fetched.favicon,
      })
      return recordProviderRun(next, attempt, startedAt, { canonicalUrl: fetched.canonicalUrl || fetched.url })
    }
    const attempt: SourceHydrationAttempt = {
      provider: 'electron',
      capability: 'webpage-content',
      status: 'failed',
      detail: '网页抓取没有拿到可学习正文。',
      error: fetched?.error || 'empty or placeholder content',
    }
    attempts.push(attempt)
    return recordProviderRun(workspace, attempt, startedAt)
  } catch (error) {
    const attempt: SourceHydrationAttempt = {
      provider: 'electron',
      capability: 'webpage-content',
      status: 'failed',
      detail: '网页正文抓取失败。',
      error: error instanceof Error ? error.message : String(error),
    }
    attempts.push(attempt)
    return recordProviderRun(workspace, attempt, startedAt)
  }
}

function providerForExtractedContent(extracted: ExtractedContentLike): SourceAssetProvider {
  const method = clean(extracted.method).toLowerCase()
  if (method.includes('whisper') || method.includes('transcrib')) return 'whisper'
  if (method.includes('ocr') || method.includes('vision')) return 'apple-vision'
  return 'electron'
}

async function tryLocalFileText(workspace: BiliVideoWorkspace, attempts: SourceHydrationAttempt[]): Promise<BiliVideoWorkspace> {
  const api = getElectronApi()
  const filePath = clean(workspace.video.filePath || workspace.video.url)
  if (workspace.video.inputType !== 'file' || !filePath || isHttpUrl(filePath)) return workspace
  if (!api.extractFileContent) {
    const attempt: SourceHydrationAttempt = {
      provider: 'electron',
      capability: 'local-file-extract',
      status: 'skipped',
      detail: 'extractFileContent IPC 不可用，不能重新读取本地来源。',
    }
    attempts.push(attempt)
    return recordProviderRun(workspace, attempt, Date.now())
  }

  const startedAt = Date.now()
  try {
    const extracted = await api.extractFileContent(filePath) as ExtractedContentLike
    const extractedText = extracted.rawContent || extracted.content || ''
    if (extracted.success && isRealSourceText(extractedText)) {
      const provider = providerForExtractedContent(extracted)
      const attempt: SourceHydrationAttempt = {
        provider,
        capability: 'local-file-extract',
        status: 'done',
        detail: `本地文件抽取成功：${clean(extractedText).length} 字。`,
      }
      attempts.push(attempt)
      const next = applyHydratedText(workspace, {
        text: extractedText,
        provider,
        method: extracted.method || 'local-file-extract',
        warnings: extracted.warnings || [],
      })
      return recordProviderRun(next, attempt, startedAt, { fileName: extracted.metadata?.fileName, method: extracted.method })
    }

    let current = workspace
    const firstAttempt: SourceHydrationAttempt = {
      provider: 'electron',
      capability: 'local-file-extract',
      status: 'failed',
      detail: '本地文件抽取没有拿到可学习正文。',
      error: extracted.error || 'empty or placeholder content',
    }
    attempts.push(firstAttempt)
    current = recordProviderRun(current, firstAttempt, startedAt, { method: extracted.method })

    if ((extracted.kind === 'video' || extracted.kind === 'audio') && api.transcribeMediaFile) {
      const transcriptionStartedAt = Date.now()
      const transcribed = await api.transcribeMediaFile(filePath) as ExtractedContentLike
      const transcribedText = transcribed.rawContent || transcribed.content || ''
      if (transcribed.success && isRealSourceText(transcribedText)) {
        const attempt: SourceHydrationAttempt = {
          provider: 'whisper',
          capability: 'local-media-transcription',
          status: 'done',
          detail: `本地转写成功：${clean(transcribedText).length} 字。`,
        }
        attempts.push(attempt)
        const next = applyHydratedText(current, {
          text: transcribedText,
          provider: 'whisper',
          method: transcribed.method || 'local-media-transcription',
          warnings: transcribed.warnings || [],
        })
        return recordProviderRun(next, attempt, transcriptionStartedAt, { transcriptPath: (transcribed as { transcriptPath?: string }).transcriptPath })
      }
      const attempt: SourceHydrationAttempt = {
        provider: 'whisper',
        capability: 'local-media-transcription',
        status: 'failed',
        detail: '本地转写没有拿到可学习文本。',
        error: transcribed.error || 'empty or placeholder transcription',
      }
      attempts.push(attempt)
      current = recordProviderRun(current, attempt, transcriptionStartedAt, { method: transcribed.method })
    }
    return current
  } catch (error) {
    const attempt: SourceHydrationAttempt = {
      provider: 'electron',
      capability: 'local-file-extract',
      status: 'failed',
      detail: '本地来源读取失败。',
      error: error instanceof Error ? error.message : String(error),
    }
    attempts.push(attempt)
    return recordProviderRun(workspace, attempt, startedAt)
  }
}

export async function hydrateBiliWorkspaceSource(workspace: BiliVideoWorkspace): Promise<SourceHydrationResult> {
  let current = refreshSourceAsset(workspace)
  const attempts: SourceHydrationAttempt[] = []
  let sourceText = getBiliUsableSourceText(current.video, current.transcript)
  if (sourceText) {
    return { workspace: current, sourceText, hydrated: false, attempts }
  }

  const originalUpdatedAt = current.sourceAsset?.updatedAt || 0
  current = await tryLocalFileText(current, attempts)
  sourceText = getBiliUsableSourceText(current.video, current.transcript)
  if (sourceText) {
    return { workspace: current, sourceText, hydrated: true, attempts }
  }

  current = await tryBibiGpt(current, attempts)
  sourceText = getBiliUsableSourceText(current.video, current.transcript)
  if (sourceText) {
    return { workspace: current, sourceText, hydrated: true, attempts }
  }

  current = await tryYtDlpSubtitle(current, attempts)
  sourceText = getBiliUsableSourceText(current.video, current.transcript)
  if (sourceText) {
    return { workspace: current, sourceText, hydrated: true, attempts }
  }

  current = await tryFetchUrlText(current, attempts)
  sourceText = getBiliUsableSourceText(current.video, current.transcript)
  if (sourceText) {
    return { workspace: current, sourceText, hydrated: true, attempts }
  }

  current = refreshSourceAsset(current)
  return {
    workspace: current,
    sourceText: '',
    hydrated: false,
    attempts,
    blockedMessage: buildSourceHydrationBlockedMessage(attempts.length ? attempts : [{
      provider: 'electron',
      capability: 'content-hydration',
      status: 'skipped',
      detail: originalUpdatedAt ? '现有来源没有可学习文本。' : '来源尚未进入流水线。',
    }]),
  }
}
