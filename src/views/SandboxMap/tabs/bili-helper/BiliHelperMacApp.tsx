import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { answerBiliQuestion, generateBiliLearningPack, generateWanxiangLearningResult, resolveBiliVideoInfo } from '../../../../lib/bili-helper/ai'
import { absorbIntoOpenbasaka, archiveWanxiangResult } from '../../../../lib/bili-helper/absorption'
import {
  BILI_ARTIFACT_MODES,
  BILI_DEFAULT_TRANSCRIPT,
  BILI_SAMPLE_URL,
  activeWorkspace,
  createBiliChatMessage,
  createDownloadTask,
  createFileSourceWorkspace,
  createSampleBiliWorkspace,
  formatBiliDuration,
  formatBiliNumber,
  loadBiliHelperState,
  saveBiliHelperState,
} from '../../../../lib/bili-helper/state'
import { getBiliUsableSourceText } from '../../../../lib/bili-helper/source-content'
import { checkBibiGptProvider, saveBibiGptApiKey } from '../../../../lib/bili-helper/bibigpt'
import { buildSourceHydrationBlockedMessage, hydrateBiliWorkspaceSource } from '../../../../lib/bili-helper/source-hydration'
import {
  appendArtifactRecord,
  appendExportReceipt,
  artifactRecord,
  refreshSourceAsset,
  setLibraryReceipt,
  sourceAssetToExportJson,
} from '../../../../lib/bili-helper/source-asset'
import { BIBI_PLATFORM_CAPABILITIES, platformStatusLabel } from '../../../../lib/bili-helper/platforms'
import { buildSourceOsGuideState, type SourceOsGuideState, type SourceOsProcessingState } from '../../../../lib/bili-helper/source-os-guide'
import { buildSourceIntakeDiagnostics, intakeStatusLabel, type SourceIntakeDiagnostics } from '../../../../lib/bili-helper/intake-diagnostics'
import { createSource } from '../../../../lib/knowledge/wiki'
import {
  buildKnowledgeFolderOptions,
  getFolderDisplayPath,
  loadKnowledgeSourceScopeEntries,
  normalizeFolderPath,
  type KnowledgeFolderOption,
} from '../../../../lib/knowledge/folders'
import type {
  BiliArchiveTarget,
  BiliArtifactMode,
  BiliDownloadFormat,
  BiliHelperState,
  BiliHelperView,
  BiliVideoWorkspace,
  SourceAssetStage,
  WanxiangLearningResult,
} from '../../../../lib/bili-helper/types'
import { buildUiMuseumPrdContext } from '../../../../lib/ui-museum/context'
import SourceOsGuidePlayer from './SourceOsGuide'
import './BiliHelperMacApp.css'

type ProcessingState = 'idle' | 'resolving' | 'hydrating' | 'generating' | 'wanxiang' | 'chatting' | 'archiving' | 'absorbing' | 'full' | 'testing'

const featureChips = ['视频/网页/文件/图片', '封面简介自动卡片', 'AI 产物 + 对话']

const MISSING_SOURCE_MESSAGE = '无法生成真实结论：缺真实字幕、正文、OCR 或转写。'

const viewTabs: Array<[BiliHelperView, string]> = [
  ['workspace', '工作台'],
  ['insights', '智能总结'],
  ['tutorial', '学习包'],
  ['wanxiang', '万象吸收'],
  ['chat', '来源对话'],
  ['downloads', '下载导出'],
  ['coverage', '覆盖矩阵'],
  ['library', '资料库'],
]

const exportOptions: Array<[BiliDownloadFormat, string, string]> = [
  ['video', '视频文件', '保留原视频任务入口'],
  ['audio', '音频提取', '适合转写和复听'],
  ['subtitle', '字幕 SRT', '优先进入知识库'],
  ['vtt', '字幕 VTT', '网页播放器/笔记工具可用'],
  ['cover', '封面图', '用于资料卡片'],
  ['markdown', '学习包 Markdown', '直接归档或复制'],
  ['mindmap', '导图 Markdown', '导出结构化导图'],
  ['json', 'SourceAsset JSON', '完整状态、证据和回执'],
]

const ytDlpUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const ytDlpCookieSources = [
  { label: 'Chrome 登录态', args: '--cookies-from-browser chrome' },
  { label: 'Safari 登录态', args: '--cookies-from-browser safari' },
  { label: '普通请求', args: '' },
]

function patchWorkspace(
  state: BiliHelperState,
  videoId: string,
  updater: (workspace: BiliVideoWorkspace) => BiliVideoWorkspace,
): BiliHelperState {
  return {
    ...state,
    workspaces: state.workspaces.map((workspace) => (workspace.video.id === videoId ? updater(workspace) : workspace)),
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function safeFileName(input: string): string {
  return input.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '_').slice(0, 56) || 'bili-video'
}

function downloadBlob(fileName: string, content: BlobPart, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function shellDoubleQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')}"`
}

function buildArchiveMarkdown(workspace: BiliVideoWorkspace): string {
  const asset = refreshSourceAsset(workspace).sourceAsset
  return `${workspace.pack?.markdown || `# ${workspace.video.title}\n\n${workspace.video.description}`}

## SourceAsset 证据与回执

- 状态：${asset?.status || 'unknown'}
- 证据数：${asset?.evidenceRefs.length || 0}
- Provider runs：${asset?.providerRuns.length || 0}
- 导出回执：${asset?.exportReceipts.length || 0}

## 原始来源正文

${workspace.transcript || workspace.video.contentText || '暂无正文。'}`
}

function defaultArchiveTags(workspace: BiliVideoWorkspace, target: BiliArchiveTarget): string[] {
  const base = [
    '万象学习',
    'SourceOS',
    workspace.video.platformName,
    workspace.video.sourceKind,
    target === 'knowledge-master' ? '知识+大佬' : target === 'backup' ? '后备知识' : '知识文件夹',
    ...workspace.video.tags,
  ]
  return Array.from(new Set(base.map((tag) => String(tag || '').trim()).filter(Boolean))).slice(0, 12)
}

function defaultArchiveFolder(target: BiliArchiveTarget, folderInput: string): string {
  if (target === 'knowledge-master') return '知识+大佬/万象学习'
  if (target === 'backup') return '后备知识/万象学习'
  return normalizeFolderPath(folderInput || '万象学习')
}

function getDownloadableUrl(workspace: BiliVideoWorkspace): string | null {
  if (/^https?:\/\//i.test(workspace.video.url)) return workspace.video.url
  if (/^BV[0-9A-Za-z]{8,14}$/.test(workspace.video.bvid)) return `https://www.bilibili.com/video/${workspace.video.bvid}/`
  return null
}

function downloadReadiness(workspace: BiliVideoWorkspace | null, format: BiliDownloadFormat): { ready: boolean; detail: string } {
  if (!workspace) return { ready: false, detail: '等待来源' }
  const sourceText = getBiliUsableSourceText(workspace.video, workspace.transcript)
  if (format === 'markdown') return workspace.pack ? { ready: true, detail: '可导出学习包' } : { ready: false, detail: '先生成学习包' }
  if (format === 'subtitle' || format === 'vtt') return sourceText ? { ready: true, detail: '可导出真实文本' } : { ready: false, detail: '缺字幕/正文/OCR/转写' }
  if (format === 'mindmap') return workspace.wanxiang?.mindMap || workspace.pack ? { ready: true, detail: '可导出导图' } : { ready: false, detail: '先生成导图或三结果' }
  if (format === 'cover') return workspace.video.cover ? { ready: true, detail: '可导出封面' } : { ready: false, detail: '缺封面 URL' }
  if (format === 'json') return { ready: true, detail: '可导出 SourceAsset' }
  return getDownloadableUrl(workspace) ? { ready: true, detail: '需要 Electron/yt-dlp' } : { ready: false, detail: '缺可下载 URL' }
}

function latestProviderRunSummary(workspace: BiliVideoWorkspace | null, limit = 3): string {
  const runs = workspace ? refreshSourceAsset(workspace).sourceAsset?.providerRuns || [] : []
  return runs
    .slice(0, limit)
    .map((run) => `${run.provider}/${run.capability}: ${run.status === 'done' ? run.detail : run.error || run.detail}`)
    .join('；')
}

function buildYtDlpCommand({
  cookieArgs,
  format,
  outputDir,
  outputTemplate,
  url,
}: {
  cookieArgs: string
  format: BiliDownloadFormat
  outputDir: string
  outputTemplate: string
  url: string
}): string {
  const common = [
    cookieArgs,
    '--no-playlist',
    `--user-agent ${shellDoubleQuote(ytDlpUserAgent)}`,
    `--add-header ${shellDoubleQuote('Referer:https://www.bilibili.com')}`,
    `--add-header ${shellDoubleQuote('Origin:https://www.bilibili.com')}`,
    `-P "${outputDir}"`,
    `-o ${shellDoubleQuote(outputTemplate)}`,
    shellDoubleQuote(url),
  ]
    .filter(Boolean)
    .join(' ')

  if (format === 'audio') {
    return `python3 -m yt_dlp ${common} -x --audio-format mp3`
  }

  return `python3 -m yt_dlp ${common} -f "bv*+ba/b" --merge-output-format mp4`
}

function transcriptToSrt(transcript: string): string {
  const rows = parseTranscriptRows(transcript)
  if (rows.length === 0) return '1\n00:00:00,000 --> 00:00:05,000\n暂无字幕，请先补充转写。\n'
  return rows
    .map((row, index) => {
      const next = rows[index + 1]?.time || offsetTime(row.time, 8)
      return `${index + 1}\n${toSrtTime(row.time)} --> ${toSrtTime(next)}\n${row.text}\n`
    })
    .join('\n')
}

function transcriptToVtt(transcript: string): string {
  const rows = parseTranscriptRows(transcript)
  if (rows.length === 0) return 'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\n暂无字幕，请先补充转写。\n'
  return `WEBVTT\n\n${rows
    .map((row, index) => {
      const next = rows[index + 1]?.time || offsetTime(row.time, 8)
      return `${toVttTime(row.time)} --> ${toVttTime(next)}\n${row.text}\n`
    })
    .join('\n')}`
}

function toSrtTime(time: string): string {
  const parts = time.split(':').map((part) => Number(part))
  const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, parts[0] || 0, parts[1] || 0]
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},000`
}

function toVttTime(time: string): string {
  return toSrtTime(time).replace(',', '.')
}

function offsetTime(time: string, offsetSeconds: number): string {
  const parts = time.split(':').map((part) => Number(part))
  const seconds = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : (parts[0] || 0) * 60 + (parts[1] || 0)
  const next = seconds + offsetSeconds
  return `${Math.floor(next / 3600)}:${String(Math.floor((next % 3600) / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`
}

function parseTranscriptRows(transcript: string): Array<{ time: string; text: string }> {
  return transcript
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s*(.+)$/)
      return match ? { time: match[1], text: match[2].replace(/^[-:：\s]+/, '') } : null
    })
    .filter(Boolean) as Array<{ time: string; text: string }>
}

export default function BiliHelperMacApp() {
  const [state, setState] = useState<BiliHelperState>(() => loadBiliHelperState())
  const [view, setView] = useState<BiliHelperView>('workspace')
  const [processing, setProcessing] = useState<ProcessingState>('idle')
  const [urlInput, setUrlInput] = useState(BILI_SAMPLE_URL)
  const [goal, setGoal] = useState('把这个来源转成资料地图、学习包和今天可执行的行动清单')
  const [question, setQuestion] = useState('这个来源最值得我马上执行的动作是什么？')
  const [artifactMode, setArtifactMode] = useState<BiliArtifactMode>('tutorial')
  const [artifactDepth, setArtifactDepth] = useState(70)
  const [folderInput, setFolderInput] = useState('万象学习')
  const [libraryQuery, setLibraryQuery] = useState('')
  const [folderOptions, setFolderOptions] = useState<KnowledgeFolderOption[]>([])
  const [toast, setToast] = useState('')

  const workspace = useMemo(() => activeWorkspace(state), [state])
  const sortedWorkspaces = useMemo(
    () => [...state.workspaces].sort((a, b) => b.video.createdAt - a.video.createdAt),
    [state.workspaces],
  )
  const visibleLibraryWorkspaces = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase()
    if (!query) return sortedWorkspaces
    return sortedWorkspaces.filter((item) =>
      [item.video.title, item.video.owner, item.video.platformName, item.pack?.summary, item.sourceAsset?.status]
        .map((value) => String(value || '').toLowerCase())
        .some((value) => value.includes(query)),
    )
  }, [libraryQuery, sortedWorkspaces])
  const hasVideo = Boolean(workspace)
  const uiMuseumContext = useMemo(
    () =>
      buildUiMuseumPrdContext('小白 万象学习助手 BibiGPT NotebookLM 视频 网页 文件 图片 对话 知识工作台 macOS AI 资料地图', [
        'agentic-os',
        'anthropic-serif',
        'spatial',
      ]),
    [],
  )
  const uiVisualVars = useMemo(() => {
    return {
      '--bili-bg': '#06111d',
      '--bili-bg-soft': '#071923',
      '--bili-panel': 'rgba(11, 14, 24, 0.86)',
      '--bili-accent': '#6d52f7',
      '--bili-accent-bright': '#6f91ff',
      '--bili-cyan': '#28dfcf',
      '--bili-gold': '#f3d58a',
      '--bili-radius': uiMuseumContext.visual.radius || '22px',
      '--bili-density': uiMuseumContext.visual.density || 'layered',
      '--bili-motion': uiMuseumContext.visual.motion || 'guided',
      '--bili-texture': uiMuseumContext.visual.texture || 'glass editorial grid',
    } as CSSProperties
  }, [uiMuseumContext])
  const guideProcessing = useMemo<SourceOsProcessingState>(() => {
    if (processing === 'resolving' || processing === 'generating' || processing === 'chatting') return processing
    if (processing === 'hydrating') return 'resolving'
    if (processing === 'wanxiang' || processing === 'archiving' || processing === 'absorbing' || processing === 'full' || processing === 'testing') return 'generating'
    return 'idle'
  }, [processing])
  const guideState = useMemo(
    () =>
      buildSourceOsGuideState({
        processing: guideProcessing,
        workspace,
        view,
        artifactMode,
      }),
    [artifactMode, guideProcessing, view, workspace],
  )

  useEffect(() => {
    saveBiliHelperState(state)
  }, [state])

  useEffect(() => {
    let cancelled = false
    loadKnowledgeSourceScopeEntries()
      .then((sourceEntries) => {
        if (cancelled) return
        setFolderOptions(buildKnowledgeFolderOptions({ sourceEntries, pages: [], sourceFolderMap: new Map() }))
      })
      .catch(() => {
        if (!cancelled) setFolderOptions([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (workspace?.archive?.folderPath) {
      setFolderInput(workspace.archive.folderPath)
    }
  }, [workspace?.video.id, workspace?.archive?.folderPath])

  function flash(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 1800)
  }

  function enhanceWorkspace(nextWorkspace: BiliVideoWorkspace, pack = nextWorkspace.pack): BiliVideoWorkspace {
    return refreshSourceAsset({
      ...nextWorkspace,
      pack,
      modePacks: nextWorkspace.modePacks,
      wanxiang: nextWorkspace.wanxiang,
      archive: nextWorkspace.archive || {
        target: 'knowledge-master',
        folderPath: '知识+大佬/万象学习',
        knowledgeTags: defaultArchiveTags(nextWorkspace, 'knowledge-master'),
        status: 'idle',
      },
    })
  }

  async function handleArchive(target: BiliArchiveTarget) {
    if (!workspace) return
    const folderPath = defaultArchiveFolder(target, folderInput)
    const knowledgeTags = defaultArchiveTags(workspace, target)
    const sourceText = getBiliUsableSourceText(workspace.video, workspace.transcript)
    if (!sourceText || !workspace.pack) {
      setState((prev) =>
        patchWorkspace(prev, workspace.video.id, (item) =>
          appendArtifactRecord(
            refreshSourceAsset({
              ...item,
              archive: {
                target,
                folderPath,
                knowledgeTags,
                status: 'failed',
                error: '缺真实学习包，不能归档。',
              },
            }),
            artifactRecord('archive', '知识归档', '缺真实学习包，不能归档。', 'local', 'blocked', '缺真实学习包，不能归档。'),
          ),
        ),
      )
      flash('缺真实学习包，不能归档')
      return
    }
    setState((prev) =>
      patchWorkspace(prev, workspace.video.id, (item) => ({
        ...item,
        archive: {
          target,
          folderPath,
          knowledgeTags,
          status: 'saving',
        },
      })),
    )

    try {
      const sourceId = await createSource({
        title: workspace.video.title,
        sourceType: workspace.video.sourceKind,
        content: buildArchiveMarkdown(workspace),
        rawContent: workspace.transcript || workspace.video.contentText || '',
        url: workspace.video.canonicalUrl || workspace.video.url,
        filePath: workspace.video.filePath || '',
        folderPath,
        author: workspace.video.owner,
        language: 'zh',
        tags: knowledgeTags,
        status: 'pending',
        metadata: {
          folderPath,
          sourceOs: true,
          platform: workspace.video.platform,
          platformName: workspace.video.platformName,
          sourceKind: workspace.video.sourceKind,
          cover: workspace.video.cover,
          favicon: workspace.video.favicon,
        },
      })
      const electronAPI = (window as any)?.electronAPI
      if (electronAPI?.triggerWikiCompile) {
        electronAPI.triggerWikiCompile().catch(() => undefined)
      }
      setState((prev) =>
        patchWorkspace(prev, workspace.video.id, (item) =>
          setLibraryReceipt(
            refreshSourceAsset({
              ...item,
              archive: {
                target,
                folderPath,
                knowledgeTags,
                status: 'saved',
                sourceId,
                savedAt: Date.now(),
              },
            }),
            {
              sourceId,
              folderPath,
              archivedAt: Date.now(),
              mode: 'general',
            },
          ),
        ),
      )
      loadKnowledgeSourceScopeEntries()
        .then((sourceEntries) => setFolderOptions(buildKnowledgeFolderOptions({ sourceEntries, pages: [], sourceFolderMap: new Map() })))
        .catch(() => undefined)
      flash(target === 'knowledge-master' ? '已置入知识+大佬' : target === 'backup' ? '已进入后备知识' : '已归档到知识文件夹')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setState((prev) =>
        patchWorkspace(prev, workspace.video.id, (item) => ({
          ...item,
          archive: {
            target,
            folderPath,
            knowledgeTags,
            status: 'failed',
            error: message,
          },
        })),
      )
      flash('归档失败')
    }
  }

  function handleLoadSample() {
    const sample = enhanceWorkspace(createSampleBiliWorkspace())
    setState((prev) => {
      const nextWorkspaces = [
        sample,
        ...prev.workspaces.filter((item) => item.video.bvid !== sample.video.bvid && item.video.url !== sample.video.url),
      ]
      return {
        ...prev,
        workspaces: nextWorkspaces,
        activeVideoId: sample.video.id,
      }
    })
    setUrlInput(sample.video.url)
    setView('workspace')
    flash('样例视频已载入')
  }

  async function handleResolveVideo(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const url = urlInput.trim()
    if (!url) {
      flash('先粘贴链接或选择本地文件')
      return
    }
    setProcessing('resolving')
    try {
      const video = await resolveBiliVideoInfo(url)
      const newWorkspace: BiliVideoWorkspace = enhanceWorkspace({
        video,
        transcript: video.contentText || '',
        chat: [createBiliChatMessage('assistant', `${video.platformName} 来源已解析。点击任一产物时，我会先自动尝试 BibiGPT、网页正文、yt-dlp 字幕或本地转写；拿不到真实内容才会阻塞。`)],
      })
      setState((prev) => ({
        ...prev,
        workspaces: [newWorkspace, ...prev.workspaces.filter((item) => item.video.bvid !== video.bvid && item.video.url !== video.url)],
        activeVideoId: video.id,
      }))
      setView('workspace')
      flash(video.resolvedBy === 'api' ? '来源信息已解析' : '已进入本地优先解析')
    } catch (error) {
      flash(error instanceof Error ? error.message : '来源解析失败')
    } finally {
      setProcessing('idle')
    }
  }

  function upsertWorkspace(nextWorkspace: BiliVideoWorkspace) {
    const refreshed = refreshSourceAsset(nextWorkspace)
    setState((prev) => ({
      ...prev,
      workspaces: [refreshed, ...prev.workspaces.filter((item) => item.video.id !== refreshed.video.id && item.video.bvid !== refreshed.video.bvid && item.video.url !== refreshed.video.url)],
      activeVideoId: refreshed.video.id,
    }))
    return refreshed
  }

  async function ensureHydratedWorkspace(nextWorkspace: BiliVideoWorkspace) {
    const hydration = await hydrateBiliWorkspaceSource(nextWorkspace)
    if (hydration.hydrated || hydration.attempts.length > 0) {
      upsertWorkspace(hydration.workspace)
    }
    return hydration
  }

  async function handleFullProcess() {
    setProcessing('full')
    try {
      let current = workspace
      if (!current) {
        const url = urlInput.trim()
        if (!url) {
          flash('先粘贴链接或选择本地文件')
          setProcessing('idle')
          return
        }
        const video = await resolveBiliVideoInfo(url)
        current = enhanceWorkspace({
          video,
          transcript: video.contentText || '',
          chat: [createBiliChatMessage('assistant', `${video.platformName} 来源已解析。现在开始完整处理流水线。`)],
        })
        upsertWorkspace(current)
      }

      const hydration = await ensureHydratedWorkspace(current)
      current = hydration.workspace
      const sourceText = hydration.sourceText
      if (!sourceText) {
        const blockedMessage = hydration.blockedMessage || buildSourceHydrationBlockedMessage(hydration.attempts)
        current = appendArtifactRecord(
          appendArtifactRecord(
            refreshSourceAsset(current),
            artifactRecord('learning-pack', BILI_ARTIFACT_MODES.find((entry) => entry.id === artifactMode)?.label || '学习包', blockedMessage, 'local', 'blocked', blockedMessage),
          ),
          artifactRecord('wanxiang', '万象三结果', blockedMessage, 'local', 'blocked', blockedMessage),
        )
        upsertWorkspace(current)
        setView('workspace')
        flash('自动取材后仍缺真实字幕、正文、OCR 或转写')
        return
      }
      const pack = await generateBiliLearningPack({
        video: current.video,
        transcript: sourceText,
        goal,
        mode: artifactMode,
        depth: artifactDepth,
      })
      const wanxiang = await generateWanxiangLearningResult({
        video: current.video,
        transcript: sourceText,
        goal,
      })
      const modePacks = { ...(current.modePacks || {}), [artifactMode]: pack }
      current = appendArtifactRecord(
        appendArtifactRecord(
          refreshSourceAsset({
            ...current,
            pack,
            modePacks,
            wanxiang,
          }),
          artifactRecord('learning-pack', BILI_ARTIFACT_MODES.find((entry) => entry.id === artifactMode)?.label || '学习包', pack.summary, pack.generatedBy === 'ai' ? 'ai' : 'local'),
        ),
        artifactRecord('wanxiang', '万象三结果', wanxiang.openbasakaFusion.absorptionVerdict, wanxiang.generatedBy === 'ai' ? 'ai' : 'local'),
      )
      upsertWorkspace(current)
      setView('insights')
      flash('完整处理完成：总结、学习包、万象和证据索引已更新')
    } catch (error) {
      flash(error instanceof Error ? error.message : '完整处理失败')
    } finally {
      setProcessing('idle')
    }
  }

  async function handleChooseFiles() {
    const electronAPI = (window as any)?.electronAPI
    if (!electronAPI?.chooseFiles || !electronAPI?.extractFileContent) {
      flash('当前环境不能选择本地文件')
      return
    }
    const files = (await electronAPI.chooseFiles({ title: '选择视频、音频、网页资料、文档或图片' })) as string[]
    if (!files?.length) return
    setProcessing('resolving')
    const imported: BiliVideoWorkspace[] = []

    try {
      for (const filePath of files) {
        const extracted = await electronAPI.extractFileContent(filePath)
        let content = extracted?.content || ''
        let rawContent = extracted?.rawContent || content
        let method = extracted?.method || 'unknown'
        const warnings = Array.isArray(extracted?.warnings) ? [...extracted.warnings] : []

        if ((extracted?.kind === 'video' || extracted?.kind === 'audio') && /placeholder|missing/i.test(method) && electronAPI?.transcribeMediaFile) {
          const transcribed = await electronAPI.transcribeMediaFile(filePath)
          if (transcribed?.success && transcribed.content) {
            content = transcribed.content
            rawContent = transcribed.rawContent || transcribed.content
            method = transcribed.method || 'local-transcription'
            warnings.push(...(transcribed.warnings || []))
          } else if (transcribed?.error) {
            warnings.push(transcribed.error)
          }
        }

        imported.push(
          enhanceWorkspace(createFileSourceWorkspace({
            filePath,
            fileName: extracted?.metadata?.fileName || filePath.split('/').pop() || '本地文件',
            kind: extracted?.kind || 'file',
            method,
            content,
            rawContent,
            warnings,
            size: extracted?.metadata?.size,
          })),
        )
      }

      setState((prev) => ({
        ...prev,
        workspaces: [...imported, ...prev.workspaces],
        activeVideoId: imported[0]?.video.id || prev.activeVideoId,
      }))
      setView('workspace')
      flash(`已接入 ${imported.length} 个本地来源`)
    } catch (error) {
      flash(error instanceof Error ? error.message : '文件接入失败')
    } finally {
      setProcessing('idle')
    }
  }

  function updateTranscript(value: string) {
    if (!workspace) return
    setState((prev) =>
      patchWorkspace(prev, workspace.video.id, (item) =>
        refreshSourceAsset({
          ...item,
          transcript: value,
          video: {
            ...item.video,
            subtitleStatus: value.trim() ? 'manual' : item.video.subtitleStatus,
          },
        }),
      ),
    )
  }

  async function generatePackForMode(modeToUse: BiliArtifactMode, nextView: BiliHelperView | null = 'tutorial') {
    if (!workspace) {
      flash('先解析或载入一个视频')
      return
    }
    setProcessing('hydrating')
    try {
      const hydration = await ensureHydratedWorkspace(workspace)
      const current = hydration.workspace
      const sourceText = hydration.sourceText
      const modeLabel = BILI_ARTIFACT_MODES.find((entry) => entry.id === modeToUse)?.label || '学习包'
      if (!sourceText) {
        const blockedMessage = hydration.blockedMessage || buildSourceHydrationBlockedMessage(hydration.attempts)
        upsertWorkspace(
          appendArtifactRecord(
            refreshSourceAsset(current),
            artifactRecord('learning-pack', modeLabel, blockedMessage, 'local', 'blocked', blockedMessage),
          ),
        )
        if (nextView) setView(nextView)
        flash('自动取材后仍缺真实字幕、正文、OCR 或转写')
        return
      }
      setProcessing('generating')
      const pack = await generateBiliLearningPack({
        video: current.video,
        transcript: sourceText,
        goal,
        mode: modeToUse,
        depth: artifactDepth,
      })
      const modePacks = { ...(current.modePacks || {}), [modeToUse]: pack }
      let nextWorkspace = appendArtifactRecord(
        refreshSourceAsset({
          ...current,
          transcript: sourceText,
          pack,
          modePacks,
        }),
        artifactRecord('learning-pack', modeLabel, pack.summary, pack.generatedBy === 'ai' ? 'ai' : 'local'),
      )
      if (modeToUse === 'tldr') {
        nextWorkspace = appendArtifactRecord(
          nextWorkspace,
          artifactRecord('summary', '智能总结', pack.summary, pack.generatedBy === 'ai' ? 'ai' : 'local'),
        )
      }
      if (modeToUse === 'mindmap') {
        nextWorkspace = appendArtifactRecord(
          nextWorkspace,
          artifactRecord('mindmap', '思维导图', pack.outline.join(' / '), pack.generatedBy === 'ai' ? 'ai' : 'local'),
        )
      }
      upsertWorkspace(nextWorkspace)
      if (nextView) setView(nextView)
      flash(hydration.hydrated ? `自动取材已完成，${modeLabel}已生成` : pack.generatedBy === 'ai' ? `${modeLabel}已由 AI 生成` : `${modeLabel}已由本地规则生成`)
    } catch (error) {
      flash(error instanceof Error ? error.message : '学习包生成失败')
    } finally {
      setProcessing('idle')
    }
  }

  function handleGeneratePack() {
    void generatePackForMode(artifactMode, 'tutorial')
  }

  function handleGenerateArtifactMode(modeToUse: BiliArtifactMode) {
    setArtifactMode(modeToUse)
    if (!workspace) {
      flash('先放进一个来源，再生成对应产物')
      return
    }
    void generatePackForMode(modeToUse, 'workspace')
  }

  async function generateWanxiangFor(workspaceToUse: BiliVideoWorkspace): Promise<WanxiangLearningResult> {
    const hydration = await ensureHydratedWorkspace(workspaceToUse)
    const current = hydration.workspace
    const transcript = hydration.sourceText
    if (!transcript) {
      const blockedMessage = hydration.blockedMessage || buildSourceHydrationBlockedMessage(hydration.attempts)
      upsertWorkspace(
        appendArtifactRecord(
          refreshSourceAsset(current),
          artifactRecord('wanxiang', '万象三结果', blockedMessage, 'local', 'blocked', blockedMessage),
        ),
      )
      throw new Error(blockedMessage)
    }
    const result = await generateWanxiangLearningResult({
      video: current.video,
      transcript,
      goal,
    })
    upsertWorkspace(
      appendArtifactRecord(
        refreshSourceAsset({
          ...current,
          transcript,
          wanxiang: result,
        }),
        artifactRecord('wanxiang', '万象三结果', result.openbasakaFusion.absorptionVerdict, result.generatedBy === 'ai' ? 'ai' : 'local'),
      ),
    )
    return result
  }

  async function handleGenerateWanxiang() {
    if (!workspace) {
      flash('先解析或选择一个来源')
      return
    }
    setProcessing('wanxiang')
    try {
      await generateWanxiangFor(workspace)
      setView('wanxiang')
      flash('万象三结果已生成')
    } catch (error) {
      flash(error instanceof Error ? error.message : '万象三结果生成失败')
    } finally {
      setProcessing('idle')
    }
  }

  async function handleArchiveWanxiang() {
    if (!workspace) {
      flash('先解析或选择一个来源')
      return
    }
    setProcessing('archiving')
    try {
      const hydration = await ensureHydratedWorkspace(workspace)
      const current = hydration.workspace
      const sourceText = hydration.sourceText
      if (!sourceText) {
        const blockedMessage = hydration.blockedMessage || buildSourceHydrationBlockedMessage(hydration.attempts)
        upsertWorkspace(
          appendArtifactRecord(
            refreshSourceAsset(current),
            artifactRecord('archive', '万象归档', blockedMessage, 'local', 'blocked', blockedMessage),
          ),
        )
        flash('归档停止：自动取材后仍缺真实内容')
        return
      }
      const result = current.wanxiang || (await generateWanxiangFor(current))
      const archived = await archiveWanxiangResult(result, { ...current, transcript: sourceText, wanxiang: result })
      setState((prev) =>
        patchWorkspace(prev, current.video.id, (item) =>
          setLibraryReceipt(item, {
            sourceId: archived.sourceId,
            drawerId: archived.drawerId,
            queueEventId: archived.queueEventId,
            folderPath: result.openbasakaFusion.folderPath || '知识+大佬/万象学习',
            archivedAt: Date.now(),
            mode: 'archive',
          }),
        ),
      )
      flash(`三结果已归档 · ${archived.sourceId}`)
      setView('wanxiang')
    } catch (error) {
      flash(error instanceof Error ? error.message : '三结果归档失败')
    } finally {
      setProcessing('idle')
    }
  }

  async function handleAbsorbWanxiang() {
    if (!workspace) {
      flash('先解析或选择一个来源')
      return
    }
    setProcessing('absorbing')
    try {
      const hydration = await ensureHydratedWorkspace(workspace)
      const current = hydration.workspace
      const sourceText = hydration.sourceText
      if (!sourceText) {
        const blockedMessage = hydration.blockedMessage || buildSourceHydrationBlockedMessage(hydration.attempts)
        upsertWorkspace(
          appendArtifactRecord(
            refreshSourceAsset(current),
            artifactRecord('archive', '系统吸收', blockedMessage, 'local', 'blocked', blockedMessage),
          ),
        )
        flash('吸收停止：自动取材后仍缺真实内容')
        return
      }
      const result = current.wanxiang || (await generateWanxiangFor(current))
      const diagnostics = buildSourceIntakeDiagnostics({ ...current, transcript: sourceText, wanxiang: result })
      if (!result.openbasakaFusion.applicable || diagnostics.contentLength < 180 || result.openbasakaFusion.absorptionScore < 60) {
        throw new Error('当前来源没有达到吸收门槛：需要真实内容、60+ 吸收分，并且融合判定为适用。')
      }
      const absorbed = await absorbIntoOpenbasaka(result, { ...current, transcript: sourceText, wanxiang: result })
      setState((prev) =>
        patchWorkspace(prev, current.video.id, (item) =>
          setLibraryReceipt(item, {
            sourceId: absorbed.sourceId,
            drawerId: absorbed.drawerId,
            queueEventId: absorbed.queueEventId,
            folderPath: result.openbasakaFusion.folderPath || '知识+大佬/万象学习',
            archivedAt: Date.now(),
            mode: 'absorption',
          }),
        ),
      )
      flash(`已吸收为系统能力补丁 · ${absorbed.promptPatchCount} 个 Prompt`)
      setView('wanxiang')
    } catch (error) {
      flash(error instanceof Error ? error.message : '系统吸收失败')
    } finally {
      setProcessing('idle')
    }
  }

  async function handleAsk() {
    if (!workspace || !question.trim()) return
    const userMessage = createBiliChatMessage('user', question.trim())
    const nextHistory = [...workspace.chat, userMessage]
    setState((prev) =>
      patchWorkspace(prev, workspace.video.id, (item) => ({
        ...item,
        chat: nextHistory,
      })),
    )
    setQuestion('')
    setProcessing('chatting')
    const hydration = await ensureHydratedWorkspace({ ...workspace, chat: nextHistory })
    const current = hydration.workspace
    const sourceText = hydration.sourceText
    if (!sourceText) {
      const blockedMessage = hydration.blockedMessage || buildSourceHydrationBlockedMessage(hydration.attempts)
      const answer = createBiliChatMessage('assistant', `${blockedMessage} 我不会把标题或简介伪装成答案。`)
      setState((prev) =>
        patchWorkspace(prev, current.video.id, (item) =>
          appendArtifactRecord(
            refreshSourceAsset({
              ...item,
              chat: [...nextHistory, answer],
            }),
            artifactRecord('chat-index', '来源对话', blockedMessage, 'local', 'blocked', blockedMessage),
          ),
        ),
      )
      setProcessing('idle')
      return
    }
    const answer = await answerBiliQuestion({
      video: current.video,
      transcript: sourceText,
      pack: current.pack,
      history: nextHistory,
      question: userMessage.content,
    })
    setState((prev) =>
      patchWorkspace(prev, current.video.id, (item) =>
        appendArtifactRecord(
          refreshSourceAsset({
            ...item,
            transcript: sourceText,
            chat: [...nextHistory, answer],
          }),
          artifactRecord('chat-index', '来源对话', answer.content.slice(0, 140), 'local'),
        ),
      ),
    )
    setProcessing('idle')
  }

  async function handleQueueDownload(format: BiliDownloadFormat) {
    if (!workspace) return
    const baseName = safeFileName(workspace.video.title)
    const task = {
      ...createDownloadTask(workspace.video, format),
      outputName:
        format === 'subtitle'
          ? `${baseName}.srt`
          : format === 'markdown'
            ? `${baseName}.md`
            : createDownloadTask(workspace.video, format).outputName,
    }
    setState((prev) => ({
      ...prev,
      downloads: [{ ...task, status: 'running', progress: 12 }, ...prev.downloads],
    }))

    const completeTask = (patch: Partial<typeof task>) => {
      setState((prev) => ({
        ...prev,
        downloads: prev.downloads.map((item) => (item.id === task.id ? { ...item, ...patch } : item)),
      }))
    }
    const recordExport = (status: 'done' | 'failed', error?: string, outputPath?: string) => {
      setState((prev) =>
        patchWorkspace(prev, workspace.video.id, (item) =>
          appendExportReceipt(item, {
            format,
            outputName: task.outputName,
            status,
            outputPath,
            error,
          }),
        ),
      )
    }

    try {
      const sourceText = getBiliUsableSourceText(workspace.video, workspace.transcript)
      if (format === 'markdown') {
        if (!workspace.pack) throw new Error('还没有真实学习包，请先生成学习包。')
        downloadBlob(task.outputName, workspace.pack?.markdown || workspace.video.description, 'text/markdown;charset=utf-8')
        completeTask({ status: 'done', progress: 100 })
        recordExport('done')
        flash('Markdown 已导出')
        return
      }

      if (format === 'subtitle') {
        if (!sourceText) throw new Error('缺真实字幕、正文、OCR 或转写，不能导出字幕。')
        downloadBlob(task.outputName, transcriptToSrt(sourceText), 'text/plain;charset=utf-8')
        completeTask({ status: 'done', progress: 100 })
        recordExport('done')
        flash('字幕 SRT 已导出')
        return
      }

      if (format === 'vtt') {
        if (!sourceText) throw new Error('缺真实字幕、正文、OCR 或转写，不能导出 VTT。')
        downloadBlob(task.outputName, transcriptToVtt(sourceText), 'text/vtt;charset=utf-8')
        completeTask({ status: 'done', progress: 100 })
        recordExport('done')
        flash('字幕 VTT 已导出')
        return
      }

      if (format === 'json') {
        downloadBlob(task.outputName, sourceAssetToExportJson(workspace), 'application/json;charset=utf-8')
        completeTask({ status: 'done', progress: 100 })
        recordExport('done')
        flash('SourceAsset JSON 已导出')
        return
      }

      if (format === 'mindmap') {
        const mindmap = workspace.wanxiang?.mindMap.markdown || workspace.pack?.outline.map((item) => `- ${item}`).join('\n')
        if (!mindmap) throw new Error('暂无真实导图，请先生成思维导图或万象三结果。')
        downloadBlob(task.outputName, `# ${workspace.video.title}\n\n${mindmap}`, 'text/markdown;charset=utf-8')
        completeTask({ status: 'done', progress: 100 })
        recordExport('done')
        flash('导图 Markdown 已导出')
        return
      }

      if (format === 'cover') {
        if (!workspace.video.cover) throw new Error('当前视频没有封面 URL，先用真实 B站 API 解析一次。')
        const response = await fetch(workspace.video.cover)
        if (!response.ok) throw new Error(`封面下载失败: ${response.status}`)
        const blob = await response.blob()
        downloadBlob(task.outputName, blob, blob.type || 'image/jpeg')
        completeTask({ status: 'done', progress: 100 })
        recordExport('done')
        flash('封面已导出')
        return
      }

      const electronAPI = (window as any)?.electronAPI
      if (!electronAPI?.executeCommand) throw new Error('当前不是 Electron 运行环境，视频/音频下载需要 Electron IPC。')
      const url = getDownloadableUrl(workspace)
      if (!url) throw new Error('无法确认可下载的视频 URL。')

      const outputDir = '$HOME/Downloads/BiliHelper'
      const outputTemplate = `${baseName}.%(ext)s`
      await electronAPI.executeCommand(`mkdir -p "${outputDir}"`, 10000)
      completeTask({ progress: 35 })
      let lastError = ''

      for (const [index, source] of ytDlpCookieSources.entries()) {
        const command = buildYtDlpCommand({
          cookieArgs: source.args,
          format,
          outputDir,
          outputTemplate,
          url,
        })
        completeTask({ progress: 48 + index * 14, command, error: index === 0 ? undefined : `${source.label}下载尝试中...` })
        const result = await electronAPI.executeCommand(command, 15 * 60 * 1000)
        if (result?.success) {
          completeTask({
            status: 'done',
            progress: 100,
            outputPath: `~/Downloads/BiliHelper/${outputTemplate.replace('%(ext)s', format === 'audio' ? 'mp3' : 'mp4')}`,
            error: undefined,
          })
          recordExport('done', undefined, `~/Downloads/BiliHelper/${outputTemplate.replace('%(ext)s', format === 'audio' ? 'mp3' : 'mp4')}`)
          flash(`${task.label} 已下载到 Downloads/BiliHelper`)
          return
        }
        lastError = result?.stderr || result?.error || `${source.label}下载失败`
      }
      throw new Error(`${lastError}\n如果仍是 HTTP 412，请先在 Chrome 或 Safari 登录 B站后重试。`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      completeTask({ status: 'failed', progress: 100, error: message })
      recordExport('failed', message)
      flash(`${task.label} 下载失败`)
    }
  }

  async function handleCopyPack(markdown = workspace?.pack?.markdown) {
    if (!markdown) {
      flash('先生成学习包')
      return
    }
    const ok = await copyText(markdown)
    flash(ok ? 'Markdown 已复制' : '复制失败')
  }

  function selectWorkspace(videoId: string, nextView: BiliHelperView = 'workspace') {
    setState((prev) => ({ ...prev, activeVideoId: videoId }))
    setView(nextView)
  }

  return (
    <div className={`bili-helper-mac ${hasVideo ? 'bili-helper-mac--active' : ''}`} style={uiVisualVars} data-guide-focus={guideState.focusTarget}>
      {toast && <div className="bili-helper-mac__toast">{toast}</div>}

      <section className="bili-helper-mac__hero" aria-label="万象学习助手">
        <div className="bili-helper-mac__hero-inner">
          <div className="bili-helper-mac__badge">
            <i />
            UI风格馆联动 · Remotion Guide · 多来源学习工作台
          </div>
          <h1>
            <span>Source</span>
            <strong>OS</strong>
          </h1>
          <p className="bili-helper-mac__hero-copy">
            视频、网页、文件、图片，一次进入资料地图。
            <small>BibiGPT 式跨平台接入 · NotebookLM 式对话整理 · OpenBasaka 本地归档</small>
          </p>

          <form className="bili-helper-mac__search" onSubmit={handleResolveVideo} data-guide-target="source-input">
            <label className="bili-helper-mac__search-field">
              <span className="bili-helper-mac__search-icon" aria-hidden="true" />
              <input
                value={urlInput}
                onChange={(event) => setUrlInput(event.target.value)}
                placeholder="粘贴 B站 / YouTube / X / TikTok / 抖音 / 网页 / 网盘分享链接..."
                aria-label="视频链接"
              />
            </label>
            <button className="bili-helper-mac__parse-btn" type="submit" disabled={processing === 'resolving' || !urlInput.trim()}>
              {processing === 'resolving' ? '解析中' : '解析'}
            </button>
          </form>

          {(!workspace || processing === 'resolving') && (
            <div className="bili-helper-mac__hero-guide" aria-label="当前下一步提示">
              <SourceOsGuidePlayer state={guideState} compact className="sourceos-guide--hero-nudge" />
            </div>
          )}

          <div className="bili-helper-mac__hero-actions">
            <button type="button" onClick={handleLoadSample}>
              载入样例
            </button>
            <button type="button" onClick={handleChooseFiles} disabled={processing !== 'idle'}>
              选择文件/图片
            </button>
            <button type="button" onClick={handleGeneratePack} disabled={!workspace || processing !== 'idle'}>
              {processing === 'hydrating' ? '补材中' : processing === 'generating' ? '生成中' : '补材并生成学习包'}
            </button>
            <button type="button" onClick={handleGenerateWanxiang} disabled={!workspace || processing !== 'idle'}>
              {processing === 'hydrating' ? '补材中' : processing === 'wanxiang' ? '分析中' : '补材后三结果'}
            </button>
            <button type="button" className="bili-helper-mac__primary" onClick={handleFullProcess} disabled={processing !== 'idle'}>
              {processing === 'full' ? '全链路处理中' : '一键完整处理'}
            </button>
          </div>

          <div className="bili-helper-mac__feature-row" aria-label="核心能力">
            {featureChips.map((item) => (
              <span key={item}>
                <i />
                {item}
              </span>
            ))}
          </div>

          <p className="bili-helper-mac__powered">
            POWERED BY <strong>YT-DLP</strong> <i /> <strong>BIBIGPT FLOW</strong> <i /> <strong>UI MUSEUM</strong>
          </p>
        </div>
      </section>

      <section
        className="bili-helper-mac__workbench sourceos-studio"
        aria-label="解析后的 SourceOS Guided Studio"
        data-focus={guideState.focusTarget}
        data-intensity={guideState.intensity}
      >
        <div className="bili-helper-mac__workbench-head sourceos-studio__head">
          <div>
            <span>SOURCEOS GUIDED STUDIO</span>
            <h2>万象资料工作区</h2>
            <p>解析之后先看来源身份，再跟着内嵌 Remotion 指引完成产物、对话和归档。新人知道下一步，高手可以直接跳转。</p>
            <div className="sourceos-studio__style-dna" aria-label="UI风格馆融合风格">
              {uiMuseumContext.styleNames.map((name) => (
                <i key={name}>{name}</i>
              ))}
            </div>
          </div>
          <div className="bili-helper-mac__workbench-actions">
            <button onClick={() => setView('downloads')}>下载队列</button>
            <button onClick={() => setView('coverage')}>平台覆盖</button>
            <button onClick={() => setView('wanxiang')}>万象吸收</button>
            <button onClick={handleFullProcess} disabled={processing !== 'idle'}>一键完整处理</button>
            <button className="bili-helper-mac__primary" onClick={handleGeneratePack} disabled={!workspace || processing !== 'idle'}>
              {processing === 'hydrating' ? '补材中' : processing === 'generating' ? '生成中' : '补材并生成学习包'}
            </button>
          </div>
        </div>

        <SourceFocusCard
          workspace={workspace}
          guide={guideState}
          onGenerate={handleGeneratePack}
          onOpenChat={() => setView('chat')}
          onOpenDownloads={() => setView('downloads')}
          onLoadSample={handleLoadSample}
          onChooseFiles={handleChooseFiles}
          isGenerating={processing === 'generating' || processing === 'hydrating'}
        />

        <div className="bili-helper-mac__stage">
          <aside className="bili-helper-mac__side-stack">
            <GuidePipeline guide={guideState} />

            <SourceIntakePanel
              workspace={workspace}
              onChooseFiles={handleChooseFiles}
              onGeneratePack={handleGeneratePack}
              onGenerateWanxiang={handleGenerateWanxiang}
              isBusy={processing !== 'idle'}
            />

            <SourceAssetPipeline workspace={workspace} />

            <FeatureTruthPanel workspace={workspace} processing={processing} />

            <StyleBridge context={uiMuseumContext} />

            <section className="bili-helper-panel">
              <PanelHead label="LIBRARY" value={String(state.workspaces.length)} />
              <div className="bili-helper-mac__library-list">
                {sortedWorkspaces.length === 0 ? (
                  <p>还没有解析过的来源。</p>
                ) : (
                  sortedWorkspaces.map((item) => (
                    <button
                      key={item.video.id}
                      className={
                        item.video.id === workspace?.video.id
                          ? 'bili-helper-mac__library-item bili-helper-mac__library-item--active'
                          : 'bili-helper-mac__library-item'
                      }
                      onClick={() => selectWorkspace(item.video.id)}
                    >
                      <strong>{item.video.title}</strong>
                      <span>
                        {item.video.bvid} · {item.pack ? '学习包' : '待整理'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </section>
          </aside>

          <main className="bili-helper-mac__main">
            <nav className="bili-helper-mac__tabs" aria-label="BiliHelper 工作区视图">
              {viewTabs.map(([id, label]) => (
                <button key={id} className={view === id ? 'bili-helper-mac__tab--active' : ''} onClick={() => setView(id)}>
                  {label}
                </button>
              ))}
            </nav>

            {view === 'workspace' && (
              <div className="bili-helper-mac__workspace">
                <section className="bili-helper-panel bili-helper-panel--goal sourceos-notebook-intent">
                  <PanelHead label="SOURCE INTENT" value="GUIDED NOTEBOOK" />
                  <textarea
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    placeholder="告诉 SourceOS 这次要把来源变成什么：入门教程、决策摘要、行动清单、复盘材料..."
                  />
                  <div className="bili-helper-mac__quick-actions">
                    <button onClick={() => updateTranscript(BILI_DEFAULT_TRANSCRIPT)} disabled={!workspace}>
                      填入示例转写
                    </button>
                    <button className="bili-helper-mac__primary" onClick={handleGeneratePack} disabled={!workspace || processing === 'generating'}>
                      生成学习包
                    </button>
                  </div>
                </section>

                <ArtifactControls
                  workspace={workspace}
                  mode={artifactMode}
                  depth={artifactDepth}
                  processing={processing}
                  onModeChange={setArtifactMode}
                  onDepthChange={setArtifactDepth}
                  onModeGenerate={handleGenerateArtifactMode}
                />

                <section className="bili-helper-panel bili-helper-panel--transcript sourceos-notebook">
                  <PanelHead
                    label="SOURCE NOTEBOOK"
                    value={workspace?.transcript ? `${workspace.transcript.split('\n').filter(Boolean).length} LINES` : 'EMPTY'}
                  />
                  <textarea
                    value={workspace?.transcript || ''}
                    onChange={(event) => updateTranscript(event.target.value)}
                    placeholder="粘贴字幕、网页正文、文件摘录、图片 OCR 或手动笔记。视频格式建议：00:00 内容"
                    disabled={!workspace}
                  />
                </section>

                <PackPreview workspace={workspace} mode={artifactMode} onCopy={() => handleCopyPack()} onOpenTutorial={() => setView('tutorial')} />

                <ArchiveRouter
                  workspace={workspace}
                  folderInput={folderInput}
                  folderOptions={folderOptions}
                  onFolderInput={setFolderInput}
                  onArchive={handleArchive}
                />
              </div>
            )}

            {view === 'insights' && (
              <BibiInsights
                workspace={workspace}
                onGenerate={() => generatePackForMode('tldr', 'insights')}
                onAsk={() => setView('chat')}
                onExport={() => handleCopyPack()}
                isGenerating={processing === 'generating'}
              />
            )}

            {view === 'tutorial' && (
              <div className="bili-helper-mac__tutorial">
                <PackPreview workspace={workspace} mode={artifactMode} onCopy={() => handleCopyPack()} onOpenTutorial={() => setView('tutorial')} wide />
                <section className="bili-helper-panel bili-helper-panel--markdown">
                  <PanelHead label="MARKDOWN PACK" value={workspace?.pack?.generatedBy || 'NONE'} />
                  <pre>{workspace?.pack?.markdown || '先生成学习包。'}</pre>
                </section>
              </div>
            )}

            {view === 'wanxiang' && (
              <WanxiangWorkbench
                workspace={workspace}
                diagnostics={buildSourceIntakeDiagnostics(workspace)}
                processing={processing}
                onGenerate={handleGenerateWanxiang}
                onArchive={handleArchiveWanxiang}
                onAbsorb={handleAbsorbWanxiang}
                onCopy={(value) => copyText(value).then((ok) => flash(ok ? '已复制' : '复制失败'))}
              />
            )}

            {view === 'chat' && (
              <div className="bili-helper-mac__chat-view" data-guide-target="chat-export">
                <section className="bili-helper-panel bili-helper-panel--chat">
                  <PanelHead label="SOURCE DIALOG" value={String(workspace?.chat.length || 0)} />
                  <div className="bili-helper-mac__messages">
                    {(workspace?.chat || []).map((message) => (
                      <article key={message.id} className={`bili-helper-mac__message bili-helper-mac__message--${message.role}`}>
                        <span>{message.role === 'user' ? 'YOU' : 'SOURCE OS'}</span>
                        <p>{message.content}</p>
                      </article>
                    ))}
                    {processing === 'chatting' && <div className="bili-helper-mac__thinking">正在根据当前来源回答...</div>}
                  </div>
                  <div className="bili-helper-mac__chat-input">
                    <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="围绕当前来源继续追问" disabled={!workspace} />
                    <button className="bili-helper-mac__primary" onClick={handleAsk} disabled={!workspace || processing === 'chatting'}>
                      提问
                    </button>
                  </div>
                </section>
              </div>
            )}

            {view === 'downloads' && (
              <div className="bili-helper-mac__downloads" data-guide-target="chat-export">
                <section className="bili-helper-panel bili-helper-panel--download-actions">
                  <PanelHead label="EXPORT TARGETS" value={workspace?.video.bvid || 'NO_VIDEO'} />
                  <p className="bili-helper-mac__download-hint">
                    视频/音频会写入 ~/Downloads/BiliHelper；网页、图片、文档等来源可导出 Markdown、字幕/OCR 文本和封面/缩略图。
                  </p>
                  <div className="bili-helper-mac__download-grid">
                    {exportOptions.map(([format, title, note]) => {
                      const readiness = downloadReadiness(workspace, format)
                      return (
                        <button key={format} onClick={() => handleQueueDownload(format)} disabled={!workspace || !readiness.ready}>
                          <strong>{title}</strong>
                          <span>{note}</span>
                          <em>{readiness.detail}</em>
                        </button>
                      )
                    })}
                  </div>
                </section>

                <section className="bili-helper-panel bili-helper-panel--queue">
                  <PanelHead label="DOWNLOAD QUEUE" value={String(state.downloads.length)} />
                  <div className="bili-helper-mac__queue-list">
                    {state.downloads.length === 0 ? (
                      <p>下载/导出队列为空。</p>
                    ) : (
                      state.downloads.map((task) => (
                        <article key={task.id} className="bili-helper-mac__task">
                        <header>
                          <strong>{task.label}</strong>
                          <span>{task.status}</span>
                        </header>
                        <p>{task.outputName}</p>
                        {task.outputPath && <p className="bili-helper-mac__task-output">{task.outputPath}</p>}
                        {task.error && <p className="bili-helper-mac__task-error">{task.error.slice(0, 220)}</p>}
                        <div className="bili-helper-mac__progress">
                          <i style={{ width: `${task.progress}%` }} />
                        </div>
                        </article>
                      ))
                    )}
                  </div>
                </section>
              </div>
            )}

            {view === 'coverage' && <CoverageMatrix onChooseFiles={handleChooseFiles} onLoadSample={handleLoadSample} />}

            {view === 'library' && (
              <div className="bili-helper-mac__library-view">
                <section className="bili-helper-panel sourceos-library-toolbar">
                  <PanelHead label="SOURCE LIBRARY" value={`${visibleLibraryWorkspaces.length}/${sortedWorkspaces.length}`} />
                  <input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="搜索标题、来源、摘要、状态..." />
                </section>
                {visibleLibraryWorkspaces.length === 0 ? (
                  <section className="bili-helper-panel bili-helper-panel--empty">还没有资料来源。</section>
                ) : (
                  visibleLibraryWorkspaces.map((item) => (
                    <article key={item.video.id} className="bili-helper-mac__library-card">
                      <VideoCard workspace={item} compact />
                      <SourceAssetLibraryCard workspace={item} />
                      <PackPreview
                        workspace={item}
                        mode={item.pack?.mode || 'tutorial'}
                        onCopy={() => handleCopyPack(item.pack?.markdown)}
                        onOpenTutorial={() => selectWorkspace(item.video.id, 'tutorial')}
                      />
                    </article>
                  ))
                )}
              </div>
            )}
          </main>
        </div>
      </section>
    </div>
  )
}

function PanelHead({ label, value }: { label: string; value: string }) {
  return (
    <div className="bili-helper-panel__head">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function SourceFocusCard({
  workspace,
  guide,
  onGenerate,
  onOpenChat,
  onOpenDownloads,
  onLoadSample,
  onChooseFiles,
  isGenerating,
}: {
  workspace: BiliVideoWorkspace | null
  guide: SourceOsGuideState
  onGenerate: () => void
  onOpenChat: () => void
  onOpenDownloads: () => void
  onLoadSample: () => void
  onChooseFiles: () => void
  isGenerating: boolean
}) {
  if (!workspace) {
    return (
      <section className="sourceos-focus-card sourceos-focus-card--empty" data-target={guide.focusTarget} data-guide-target="source-card">
        <div className="sourceos-focus-card__cover">
          <strong>SourceOS</strong>
          <span>URL / FILE / IMAGE</span>
        </div>
        <div className="sourceos-focus-card__body">
          <span className="sourceos-focus-card__eyebrow">WAITING FOR SOURCE</span>
          <h3>先放进一个来源，下面的功能才会醒来。</h3>
          <p>粘贴 B站、YouTube、X、TikTok、网页、网盘链接，或直接选择本地视频、音频、图片、文档。</p>
          <div className="sourceos-focus-card__actions">
            <button className="bili-helper-mac__primary" onClick={onLoadSample}>
              载入样例来源
            </button>
            <button onClick={onChooseFiles}>选择本地文件/图片</button>
          </div>
        </div>
        <aside className="sourceos-focus-card__next">
          <SourceOsGuidePlayer state={guide} compact className="sourceos-guide--inline-nudge" />
        </aside>
      </section>
    )
  }

  const { video } = workspace
  const hasStats = Object.values(video.stats).some((value) => value > 0)
  return (
    <section className="sourceos-focus-card" data-target={guide.focusTarget} data-guide-target="source-card">
      <div className="sourceos-focus-card__cover">
        {video.cover ? <img src={video.cover} alt="" /> : <strong>{video.platformName.slice(0, 8)}</strong>}
      </div>
      <div className="sourceos-focus-card__body">
        <span className="sourceos-focus-card__eyebrow">
          {video.platformName} · {video.resolvedBy === 'api' ? 'METADATA VERIFIED' : 'LOCAL FIRST'}
        </span>
        <h3>{video.title}</h3>
        <p>{video.description}</p>
        <div className="sourceos-focus-card__meta">
          <span>作者 {video.owner}</span>
          <span>{video.sourceKind}</span>
          {video.durationSeconds > 0 && <span>{formatBiliDuration(video.durationSeconds)}</span>}
          <span>{video.subtitleStatus}</span>
        </div>
        {hasStats && (
          <div className="sourceos-focus-card__stats">
            <span>播放 {formatBiliNumber(video.stats.views)}</span>
            <span>弹幕 {formatBiliNumber(video.stats.danmaku)}</span>
            <span>点赞 {formatBiliNumber(video.stats.likes)}</span>
            <span>收藏 {formatBiliNumber(video.stats.favorites)}</span>
          </div>
        )}
      </div>
      <aside className="sourceos-focus-card__next">
        <SourceOsGuidePlayer state={guide} compact className="sourceos-guide--inline-nudge" />
        <div className="sourceos-focus-card__next-actions">
          <button className="bili-helper-mac__primary" onClick={onGenerate} disabled={isGenerating}>
            {isGenerating ? '生成中' : workspace.pack ? '重新生成' : '生成学习包'}
          </button>
          <button onClick={onOpenChat}>去问答</button>
          <button onClick={onOpenDownloads}>导出</button>
        </div>
      </aside>
    </section>
  )
}

function GuidePipeline({ guide }: { guide: SourceOsGuideState }) {
  return (
    <section className="bili-helper-panel sourceos-pipeline">
      <PanelHead label="GUIDE FLOW" value={guide.activeStep.id.toUpperCase()} />
      <div className="bili-helper-mac__pipeline">
        {guide.steps.map((item) => (
          <article key={item.id} className="bili-helper-mac__pipeline-step" data-status={item.status}>
            <strong>{item.label.slice(0, 2)}</strong>
            <section>
              <span>{item.title}</span>
              <p>{item.description}</p>
            </section>
          </article>
        ))}
      </div>
    </section>
  )
}

function SourceAssetPipeline({ workspace }: { workspace: BiliVideoWorkspace | null }) {
  const asset = workspace ? refreshSourceAsset(workspace).sourceAsset : undefined
  const stages = asset?.pipeline || []
  return (
    <section className="bili-helper-panel sourceos-asset-pipeline">
      <PanelHead label="SOURCE ASSET" value={asset ? asset.status.toUpperCase() : 'WAITING'} />
      {!asset ? (
        <div className="bili-helper-mac__empty-note">来源进入后，这里会显示真实流水线状态。</div>
      ) : (
        <>
          <div className="sourceos-asset-score">
            <strong>{asset.intakeRun.evidenceCount}</strong>
            <span>证据片段 · {asset.intakeRun.contentLength} 字符 · {asset.intakeRun.method}</span>
          </div>
          <div className="sourceos-asset-stages">
            {stages.map((item: SourceAssetStage) => (
              <article key={item.id} data-status={item.status}>
                <strong>{item.label}</strong>
                <span>{item.status}</span>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
          <div className="sourceos-asset-receipts">
            <span>{asset.providerRuns.length} provider runs</span>
            <span>{asset.artifacts.length} artifacts</span>
            <span>{asset.exportReceipts.length} exports</span>
          </div>
          {asset.providerRuns.length > 0 && (
            <div className="sourceos-provider-runs">
              {asset.providerRuns.slice(0, 4).map((run) => (
                <article key={run.id} data-status={run.status}>
                  <strong>{run.provider} · {run.capability}</strong>
                  <span>{run.status}</span>
                  <p>{run.status === 'done' ? run.detail : run.error || run.detail}</p>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function StyleBridge({ context }: { context: ReturnType<typeof buildUiMuseumPrdContext> }) {
  return (
    <section className="bili-helper-panel bili-helper-panel--style-bridge">
      <PanelHead label="UI MUSEUM" value={context.styleNames.slice(0, 2).join(' / ')} />
      <div className="bili-helper-mac__style-bridge">
        <p>{context.reasoning}</p>
        <div>
          {context.styleNames.map((name) => (
            <span key={name}>{name}</span>
          ))}
        </div>
      </div>
    </section>
  )
}

type TruthStatus = 'generated' | 'ready' | 'pending' | 'partial' | 'blocked'

function truthStatusLabel(status: TruthStatus): string {
  if (status === 'generated') return '已生成'
  if (status === 'ready') return '可用'
  if (status === 'partial') return '弱可用'
  if (status === 'blocked') return '缺内容'
  return '可生成'
}

function FeatureTruthPanel({
  workspace,
  processing,
}: {
  workspace: BiliVideoWorkspace | null
  processing: ProcessingState
}) {
  const diagnostics = buildSourceIntakeDiagnostics(workspace)
  const sourceText = workspace ? getBiliUsableSourceText(workspace.video, workspace.transcript) : ''
  const asset = workspace ? refreshSourceAsset(workspace).sourceAsset : undefined
  const hasSource = Boolean(workspace)
  const hasAnyText = sourceText.trim().length > 0
  const hasStrongText = diagnostics.contentLength >= 180
  const exportDone = Boolean(asset?.exportReceipts.some((receipt) => receipt.status === 'done'))
  const archiveDone = workspace?.archive?.status === 'saved' || Boolean(asset?.libraryReceipt)
  const modePackCount = Object.values(workspace?.modePacks || {}).filter(Boolean).length
  const rows: Array<{ id: string; label: string; status: TruthStatus; detail: string }> = [
    {
      id: 'pack',
      label: '学习包',
      status: !hasSource ? 'pending' : modePackCount && hasAnyText ? 'generated' : hasAnyText ? 'pending' : 'blocked',
      detail: !hasSource ? '等待来源进入工作台' : modePackCount ? `${modePackCount} 个模式产物已生成` : hasAnyText ? '有正文，可生成真实学习包' : '缺真实字幕/正文/OCR/转写',
    },
    {
      id: 'wanxiang',
      label: '万象三结果',
      status: !hasSource ? 'pending' : workspace?.wanxiang && hasAnyText ? 'generated' : workspace?.wanxiang ? 'blocked' : hasAnyText ? 'pending' : 'blocked',
      detail: !hasSource ? '等待来源进入工作台' : workspace?.wanxiang ? workspace.wanxiang.openbasakaFusion.absorptionVerdict : hasAnyText ? '可分析教学/融合/导图' : '只能生成待补内容诊断',
    },
    {
      id: 'chat',
      label: '来源对话',
      status: !hasSource ? 'pending' : asset?.evidenceRefs.length ? (hasStrongText ? 'ready' : 'partial') : 'blocked',
      detail: !hasSource ? '等待来源进入工作台' : asset?.evidenceRefs.length ? `${asset.evidenceRefs.length} 条证据可引用` : '没有证据，问答只能提示补内容',
    },
    {
      id: 'export',
      label: '导出',
      status: !hasSource ? 'pending' : exportDone ? 'generated' : workspace?.pack || hasAnyText ? 'ready' : 'blocked',
      detail: !hasSource ? '等待来源进入工作台' : exportDone ? '已有导出回执' : workspace?.pack || hasAnyText ? '可导出 Markdown / JSON / 导图' : '缺内容，导出没有价值',
    },
    {
      id: 'archive',
      label: '归档',
      status: !hasSource ? 'pending' : archiveDone ? 'generated' : workspace?.pack && hasAnyText ? 'ready' : 'blocked',
      detail: !hasSource ? '等待来源进入工作台' : archiveDone ? workspace?.archive?.sourceId || asset?.libraryReceipt?.sourceId || '已归档' : workspace?.pack && hasAnyText ? '可归档到知识+大佬' : '产物不足',
    },
    {
      id: 'coverage',
      label: '覆盖矩阵',
      status: 'ready',
      detail: hasSource ? '可检查平台、解析器、下载器、转写和 OCR 环境' : '可先看支持哪些来源和环境能力',
    },
  ]
  const realCount = rows.filter((row) => row.status === 'generated' || row.status === 'ready').length
  return (
    <section className="bili-helper-panel sourceos-truth-panel">
      <PanelHead label="功能真实性巡检" value={processing !== 'idle' ? 'RUNNING' : `${realCount}/${rows.length} REAL`} />
      <div className="sourceos-truth-grid">
        {rows.map((row) => (
          <article key={row.id} data-status={row.status}>
            <div>
              <strong>{row.label}</strong>
              <span>{truthStatusLabel(row.status)}</span>
            </div>
            <p>{row.detail}</p>
          </article>
        ))}
      </div>
      {hasSource && !hasAnyText && (
        <p className="sourceos-truth-warning">
          无法生成真实结论：当前没有真实字幕、正文、OCR 或转写。系统只能保存来源卡片和待补诊断，不会把模板冒充为理解。
        </p>
      )}
    </section>
  )
}

function SourceIntakePanel({
  workspace,
  onChooseFiles,
  onGeneratePack,
  onGenerateWanxiang,
  isBusy,
}: {
  workspace: BiliVideoWorkspace | null
  onChooseFiles: () => void
  onGeneratePack: () => void
  onGenerateWanxiang: () => void
  isBusy: boolean
}) {
  const diagnostics = buildSourceIntakeDiagnostics(workspace)
  const sourceText = workspace ? getBiliUsableSourceText(workspace.video, workspace.transcript) : ''
  const hasAnyText = sourceText.trim().length > 0
  const hasStrongText = diagnostics.contentLength >= 180
  const providerSummary = latestProviderRunSummary(workspace)
  const blockReason = workspace && !hasAnyText
    ? providerSummary
      ? `无法生成真实结论：缺真实字幕、正文、OCR 或转写。自动取材已尝试：${providerSummary}`
      : '当前缺真实字幕、正文、OCR 或转写。点击生成会先自动尝试 BibiGPT、网页正文、yt-dlp 字幕和本地转写。'
    : workspace && !hasStrongText
      ? '当前可学习文本偏短：可以弱处理，但关键判断需要继续补证据。'
      : ''
  return (
    <section className="bili-helper-panel bili-helper-panel--intake-diagnostics" data-guide-target="source-card">
      <PanelHead label="识别诊断" value={workspace ? `${diagnostics.score}/100` : 'WAITING'} />
      <div className="sourceos-intake-meter">
        <div>
          <strong>{diagnostics.recognitionLabel}</strong>
          <span>{diagnostics.sourceKindLabel} · {diagnostics.method}</span>
        </div>
        <i style={{ width: `${diagnostics.score}%` }} />
      </div>
      <div className="sourceos-intake-stats" aria-label="来源解析统计">
        <span>{diagnostics.label}</span>
        <span>{diagnostics.contentLength} 字符</span>
        <span>{diagnostics.wordCount} 词/字</span>
      </div>
      <div className="sourceos-intake-steps">
        {diagnostics.steps.map((step) => (
          <article key={step.id} data-status={step.status}>
            <strong>{step.label}</strong>
            <span>{intakeStatusLabel(step.status)}</span>
            <p>{step.detail}</p>
          </article>
        ))}
      </div>
      <div className="sourceos-intake-actions">
        <button onClick={onChooseFiles} disabled={isBusy}>
          选择文件
        </button>
        <button onClick={onGeneratePack} disabled={!workspace || isBusy}>
          {workspace && !hasAnyText ? '自动补材并生成' : '学习包'}
        </button>
        <button className="bili-helper-mac__primary" onClick={onGenerateWanxiang} disabled={!workspace || isBusy}>
          {workspace && !hasAnyText ? '补材后三结果' : '三结果'}
        </button>
      </div>
      {blockReason && <p className="sourceos-intake-blocker">{blockReason}</p>}
      <div className="sourceos-intake-next">
        {diagnostics.nextActions.slice(0, 3).map((action) => (
          <span key={action}>{action}</span>
        ))}
      </div>
    </section>
  )
}

function ArtifactControls({
  workspace,
  mode,
  depth,
  processing,
  onModeChange,
  onDepthChange,
  onModeGenerate,
}: {
  workspace: BiliVideoWorkspace | null
  mode: BiliArtifactMode
  depth: number
  processing: ProcessingState
  onModeChange: (mode: BiliArtifactMode) => void
  onDepthChange: (depth: number) => void
  onModeGenerate: (mode: BiliArtifactMode) => void
}) {
  const activeMode = BILI_ARTIFACT_MODES.find((item) => item.id === mode) || BILI_ARTIFACT_MODES[0]
  const diagnostics = buildSourceIntakeDiagnostics(workspace)
  const sourceText = workspace ? getBiliUsableSourceText(workspace.video, workspace.transcript) : ''
  const asset = workspace ? refreshSourceAsset(workspace).sourceAsset : undefined
  const currentPack = workspace?.modePacks?.[mode] || (workspace?.pack?.mode === mode ? workspace.pack : undefined)
  const hasAnyText = sourceText.trim().length > 0
  const isGenerating = processing === 'generating' || processing === 'hydrating'
  const activeStatus: TruthStatus = !workspace ? 'pending' : isGenerating ? 'pending' : !hasAnyText ? 'blocked' : currentPack ? 'generated' : 'ready'
  const providerSummary = latestProviderRunSummary(workspace)
  const sourcePreview = sourceText.trim()
    ? sourceText.replace(/\s+/g, ' ').slice(0, 220)
    : providerSummary
      ? `自动取材已尝试：${providerSummary}`
      : '还没有真实字幕、正文、OCR 或转写。点击产物会先自动取材；补同名字幕/转写效果最好。'
  const statusForMode = (itemMode: BiliArtifactMode): string => {
    if (!workspace) return '待来源'
    if (processing === 'hydrating' && itemMode === mode) return '补材中'
    if (isGenerating && itemMode === mode) return '生成中'
    if (!hasAnyText) return providerSummary ? '缺内容' : '自动补材'
    if (workspace.modePacks?.[itemMode] || workspace.pack?.mode === itemMode) return '已生成'
    return '点击生成'
  }
  return (
    <section className="bili-helper-panel bili-helper-panel--artifact-controls" data-guide-target="artifact-dashboard">
      <PanelHead label="ARTIFACT DASHBOARD" value={activeMode.label} />
      <div className="sourceos-artifact-active" data-status={activeStatus} style={{ '--mode-accent': activeMode.accent } as CSSProperties}>
        <span>当前产物</span>
        <strong>{activeMode.label}</strong>
        <p>{activeMode.desc}</p>
        <div className="sourceos-artifact-state">
          <i>{truthStatusLabel(activeStatus)}</i>
          <i>{currentPack?.generatedBy || (hasAnyText ? '待生成' : 'blocked')}</i>
          <i>{asset?.evidenceRefs.length || 0} 证据</i>
          <i>{diagnostics.contentLength} 字符</i>
        </div>
        <div className="sourceos-artifact-output">
          <article>
            <strong>产物摘要</strong>
            <p>{currentPack?.summary || (hasAnyText ? `点击「${activeMode.label}」生成这个模式的真实产物。` : providerSummary ? `自动取材未拿到正文：${providerSummary}` : '点功能后会先补字幕/正文/OCR/转写，补不到才阻塞。')}</p>
          </article>
          <article>
            <strong>正文预览</strong>
            <p>{sourcePreview}</p>
          </article>
          <article>
            <strong>下一步</strong>
            <p>{diagnostics.nextActions[0] || '放入来源后再生成产物。'}</p>
          </article>
        </div>
      </div>
      <div className="bili-helper-mac__mode-grid">
        {BILI_ARTIFACT_MODES.map((item) => (
          <button
            key={item.id}
            className={mode === item.id ? 'bili-helper-mac__mode-card bili-helper-mac__mode-card--active' : 'bili-helper-mac__mode-card'}
            onClick={() => {
              onModeChange(item.id)
              onModeGenerate(item.id)
            }}
            disabled={isGenerating}
            style={{ '--mode-accent': item.accent } as CSSProperties}
          >
            <strong>{item.label}</strong>
            <span>{item.desc}</span>
            <em>{statusForMode(item.id)}</em>
          </button>
        ))}
      </div>
      <div className="bili-helper-mac__depth">
        <div>
          <span>详细度</span>
          <strong>{depth}%</strong>
        </div>
        <input type="range" min={10} max={100} step={5} value={depth} onChange={(event) => onDepthChange(Number(event.target.value))} />
      </div>
    </section>
  )
}

function ArchiveRouter({
  workspace,
  folderInput,
  folderOptions,
  onFolderInput,
  onArchive,
}: {
  workspace: BiliVideoWorkspace | null
  folderInput: string
  folderOptions: KnowledgeFolderOption[]
  onFolderInput: (value: string) => void
  onArchive: (target: BiliArchiveTarget) => void
}) {
  const archive = workspace?.archive
  const folderChoices = folderOptions.filter((option) => option.path && option.path !== '__all__').slice(0, 8)
  return (
    <section className="bili-helper-panel bili-helper-panel--archive-router" data-guide-target="chat-export">
      <PanelHead label="归档去向" value={archive?.status === 'saved' ? 'SAVED' : archive?.status === 'saving' ? 'SAVING' : 'READY'} />
      <div className="archive-router__targets">
        <button className="bili-helper-mac__primary" onClick={() => onArchive('knowledge-master')} disabled={!workspace || archive?.status === 'saving'}>
          置入知识+大佬
        </button>
        <button onClick={() => onArchive('knowledge-folder')} disabled={!workspace || archive?.status === 'saving'}>
          进入文件夹
        </button>
        <button onClick={() => onArchive('backup')} disabled={!workspace || archive?.status === 'saving'}>
          后备知识
        </button>
      </div>
      <div className="archive-router__folder">
        <label>
          <span>知识文件夹</span>
          <input value={folderInput} onChange={(event) => onFolderInput(event.target.value)} list="bili-helper-folder-options" placeholder="万象学习/网页资料" />
        </label>
        <datalist id="bili-helper-folder-options">
          {folderChoices.map((option) => (
            <option key={option.path} value={option.path}>
              {option.displayPath}
            </option>
          ))}
        </datalist>
      </div>
      <div className="archive-router__chips">
        {(archive?.knowledgeTags || ['万象学习', 'SourceOS', workspace?.video.sourceKind || 'source']).slice(0, 8).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      {archive?.sourceId && (
        <p className="archive-router__result">
          已写入 {getFolderDisplayPath(archive.folderPath)} · {archive.sourceId}
        </p>
      )}
      {archive?.error && <p className="archive-router__error">{archive.error}</p>}
    </section>
  )
}

type EnvironmentCheck = {
  id: string
  label: string
  status: 'waiting' | 'ok' | 'failed' | 'partial'
  detail: string
}

function CoverageMatrix({ onChooseFiles, onLoadSample }: { onChooseFiles: () => void; onLoadSample: () => void }) {
  const directCount = BIBI_PLATFORM_CAPABILITIES.filter((item) => item.status === 'direct').length
  const metadataCount = BIBI_PLATFORM_CAPABILITIES.filter((item) => item.status === 'metadata').length
  const localCount = BIBI_PLATFORM_CAPABILITIES.filter((item) => item.status === 'local-first').length
  const [checks, setChecks] = useState<EnvironmentCheck[]>([])
  const [checking, setChecking] = useState(false)

  async function runEnvironmentChecks() {
    setChecking(true)
    const electronAPI = window.electronAPI
    const next: EnvironmentCheck[] = []
    const bibi = await checkBibiGptProvider()
    next.push({ id: 'bibigpt', label: 'BibiGPT OpenAPI', status: bibi.ok ? 'ok' : bibi.configured ? 'partial' : 'failed', detail: bibi.detail })
    const commandChecks: Array<[string, string, string]> = [
      ['yt-dlp', 'yt-dlp 下载器', 'python3 -m yt_dlp --version'],
      ['ffmpeg', 'ffmpeg 合并/转码', 'which ffmpeg'],
      ['whisper', 'Whisper 本地转写', 'which whisper'],
    ]
    for (const [id, label, command] of commandChecks) {
      if (!electronAPI?.executeCommand) {
        next.push({ id, label, status: 'failed', detail: 'Electron executeCommand 不可用' })
        continue
      }
      const result = await electronAPI.executeCommand(command, 12000)
      next.push({
        id,
        label,
        status: result?.success || result?.stdout ? 'ok' : 'failed',
        detail: (result?.stdout || result?.stderr || '未检测到').trim().slice(0, 160),
      })
    }
    if (electronAPI?.fetchUrl) {
      const fetched = await electronAPI.fetchUrl('https://example.com')
      next.push({ id: 'web', label: '网页正文抓取', status: fetched?.error ? 'failed' : 'ok', detail: fetched?.error || fetched?.title || 'fetch-url ok' })
    } else {
      next.push({ id: 'web', label: '网页正文抓取', status: 'failed', detail: 'fetchUrl IPC 不可用' })
    }
    const systemInfo = electronAPI?.getSystemInfo ? await electronAPI.getSystemInfo() : null
    next.push({
      id: 'vision',
      label: 'Apple Vision OCR',
      status: systemInfo?.platform === 'darwin' ? 'ok' : 'partial',
      detail: systemInfo?.platform === 'darwin' ? 'macOS Vision/Spotlight OCR 可用于本地图片' : '非 macOS 环境仅保留图片来源',
    })
    setChecks(next)
    setChecking(false)
  }

  return (
    <div className="bili-helper-mac__coverage-view">
      <section className="bili-helper-panel bili-helper-panel--coverage-hero">
        <PanelHead label="BIBIGPT COVERAGE" value={`${BIBI_PLATFORM_CAPABILITIES.length} SOURCES`} />
        <div className="bili-helper-mac__coverage-hero">
          <div>
            <h3>大神提到的来源形态，先全部进系统。</h3>
            <p>公开链接能抓元信息就抓；平台受限就保留来源对象；本地文件、图片、音视频走文本抽取、OCR 和转写兜底。目标是任何来源都能进入资料地图、学习包和对话。</p>
          </div>
          <aside>
            <span>{directCount} 直接</span>
            <span>{metadataCount} 元信息</span>
            <span>{localCount} 本地兜底</span>
          </aside>
        </div>
      </section>

      <section className="bili-helper-mac__coverage-grid">
        {BIBI_PLATFORM_CAPABILITIES.map((item) => (
          <article key={item.id} className="bili-helper-panel bili-helper-mac__coverage-card">
            <PanelHead label={item.kind.toUpperCase()} value={platformStatusLabel(item.status)} />
            <div>
              <h3>{item.label}</h3>
              {item.aliases.length > 0 && <small>{item.aliases.join(' · ')}</small>}
              <p>{item.intake}</p>
              <span>{item.organize}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="bili-helper-panel bili-helper-panel--coverage-actions">
        <PanelHead label="NEXT INPUT" value="URL / FILE / IMAGE" />
        <div className="bili-helper-mac__coverage-actions">
          <button className="bili-helper-mac__primary" onClick={onChooseFiles}>
            选择本地文件/图片
          </button>
          <button onClick={onLoadSample}>载入样例来源</button>
          <button onClick={runEnvironmentChecks} disabled={checking}>
            {checking ? '检测中' : '运行环境体检'}
          </button>
        </div>
      </section>

      <BibiGptKeyPanel />

      <section className="bili-helper-panel sourceos-env-checks">
        <PanelHead label="环境体检" value={checks.length ? `${checks.filter((item) => item.status === 'ok').length}/${checks.length}` : 'NOT RUN'} />
        <div className="sourceos-env-checks__grid">
          {checks.length === 0 ? (
            <div className="bili-helper-mac__empty-note">点击“运行环境体检”后，会检测 BibiGPT、yt-dlp、ffmpeg、Whisper、OCR 和网页抓取。</div>
          ) : (
            checks.map((item) => (
              <article key={item.id} data-status={item.status}>
                <strong>{item.label}</strong>
                <span>{item.status}</span>
                <p>{item.detail}</p>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function BibiGptKeyPanel() {
  const [value, setValue] = useState('')
  const [status, setStatus] = useState('未检测')
  async function saveKey() {
    const result = await saveBibiGptApiKey(value)
    setValue('')
    setStatus(result.success ? '已安全保存到 Electron safeStorage' : result.error || '保存失败')
  }
  async function testKey() {
    const result = await checkBibiGptProvider()
    setStatus(result.detail)
  }
  return (
    <section className="bili-helper-panel sourceos-bibigpt-key">
      <PanelHead label="BIBIGPT PROVIDER" value="SAFE STORAGE" />
      <p>可选增强通道。Key 只写入 Electron safeStorage，不进入代码、导出 JSON 或学习包。</p>
      <div className="sourceos-bibigpt-key__row">
        <input value={value} onChange={(event) => setValue(event.target.value)} type="password" placeholder="粘贴 BibiGPT API Key" />
        <button className="bili-helper-mac__primary" onClick={saveKey} disabled={!value.trim()}>
          安全保存
        </button>
        <button onClick={testKey}>测试连接</button>
      </div>
      <span>{status}</span>
    </section>
  )
}

function BibiInsights({
  workspace,
  onGenerate,
  onAsk,
  onExport,
  isGenerating,
}: {
  workspace: BiliVideoWorkspace | null
  onGenerate: () => void
  onAsk: () => void
  onExport: () => void
  isGenerating: boolean
}) {
  const pack = workspace?.modePacks?.tldr || workspace?.pack
  const transcriptRows = parseTranscriptRows(workspace ? getBiliUsableSourceText(workspace.video, workspace.transcript) : '')
  const hasSourceText = Boolean(workspace && getBiliUsableSourceText(workspace.video, workspace.transcript))
  const summary = pack?.summary || '先解析来源并生成学习包，这里会显示类似 BibiGPT 的总览、章节、逐句转写/OCR、思维导图和文章视图。'
  const chapterRows = pack?.timeline.length ? pack.timeline : transcriptRows.slice(0, 6).map((row) => ({ time: row.time, title: row.text.slice(0, 18), note: row.text }))
  const mindMapRoots = [
    ['资料地图', pack?.outline || ['视频问题', '核心观点', '证据片段', '行动清单']],
    ['关键洞察', pack?.keyPoints || ['等待生成后提取关键洞察']],
    ['下一步', pack?.actionList || ['补字幕', '生成总结', '导出资料', '继续追问']],
  ]

  return (
    <div className="bili-helper-mac__insights">
      <section className="bili-helper-panel bili-helper-panel--insight-hero">
        <PanelHead label="BIBIGPT STYLE SUMMARY" value={pack ? `${pack.generatedBy.toUpperCase()} · ${pack.mode}` : 'EMPTY'} />
        <div className="bili-helper-mac__insight-summary">
          <div>
            <span>{workspace?.video.platformName || 'NO SOURCE'} · {workspace?.video.bvid || 'WAITING'}</span>
            <h3>{workspace?.video.title || '等待来源'}</h3>
            <p>{hasSourceText ? summary : `${MISSING_SOURCE_MESSAGE} 智能总结不会把标题或简介冒充成正文理解。`}</p>
          </div>
          <aside>
            <button className="bili-helper-mac__primary" onClick={onGenerate} disabled={!workspace || isGenerating}>
              {isGenerating ? '生成中' : '生成智能总结'}
            </button>
            <button onClick={onAsk} disabled={!workspace}>
              去问答
            </button>
            <button onClick={onExport} disabled={!pack}>
              复制 Markdown
            </button>
          </aside>
        </div>
      </section>

      <section className="bili-helper-panel">
        <PanelHead label="CHAPTER SUMMARY" value={`${chapterRows.length} CHAPTERS`} />
        <div className="bili-helper-mac__chapter-list">
          {chapterRows.length
            ? chapterRows.slice(0, 8).map((item) => (
                <article key={`${item.time}-${item.title}`}>
                  <strong>{item.time}</strong>
                  <div>
                    <span>{item.title}</span>
                    <p>{item.note}</p>
                  </div>
                </article>
              ))
            : <div className="bili-helper-mac__empty-note">暂无真实章节。请先补充字幕、OCR、转写或正文。</div>}
        </div>
      </section>

      <section className="bili-helper-panel">
        <PanelHead label="MIND MAP" value="MARKMAP READY" />
        <div className="bili-helper-mac__mindmap">
          <strong>{workspace?.video.title || '来源主题'}</strong>
          <div>
            {mindMapRoots.map(([root, children]) => (
              <article key={root as string}>
                <span>{root}</span>
                {(children as string[]).slice(0, 5).map((child) => (
                  <i key={child}>{child}</i>
                ))}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bili-helper-panel bili-helper-panel--transcript-reader">
        <PanelHead label="TRANSCRIPT READER" value={`${transcriptRows.length} LINES`} />
        <div className="bili-helper-mac__transcript-reader">
          {transcriptRows.length
            ? transcriptRows.slice(0, 12).map((row, index) => (
                <article key={`${row.time}-${index}`}>
                  <strong>{row.time}</strong>
                  <p>{row.text}</p>
                </article>
              ))
            : <div className="bili-helper-mac__empty-note">暂无真实转写。不会显示示例字幕。</div>}
        </div>
      </section>

      <section className="bili-helper-panel bili-helper-panel--article-reader">
        <PanelHead label="ARTICLE VIEW" value={pack ? 'READY' : 'WAITING'} />
        <article className="bili-helper-mac__article-reader">
          <h3>{workspace?.video.title || '来源文章'}</h3>
          <p>{hasSourceText ? pack?.tutorial || '生成后会把来源整理成一篇可阅读、可归档、可继续改写的教程文章。' : `${MISSING_SOURCE_MESSAGE} 请先补充可学习文本。`}</p>
        </article>
      </section>
    </div>
  )
}

function WanxiangWorkbench({
  workspace,
  diagnostics,
  processing,
  onGenerate,
  onArchive,
  onAbsorb,
  onCopy,
}: {
  workspace: BiliVideoWorkspace | null
  diagnostics: SourceIntakeDiagnostics
  processing: ProcessingState
  onGenerate: () => void
  onArchive: () => void
  onAbsorb: () => void
  onCopy: (value: string) => void
}) {
  const result = workspace?.wanxiang
  const isBusy = processing === 'wanxiang' || processing === 'archiving' || processing === 'absorbing'
  if (!workspace) {
    return (
      <section className="wanxiang-empty">
        <span>SOURCE REQUIRED</span>
        <h2>先放进一个来源，再做万象吸收。</h2>
        <p>粘贴公开链接，或选择视频、音频、图片、PDF、文档。系统会先做识别诊断，再生成教程、导图、Prompt 补丁和知识归档包。</p>
      </section>
    )
  }

  const sourceText = getBiliUsableSourceText(workspace.video, workspace.transcript)
  if (!sourceText) {
    return (
      <section className="wanxiang-empty">
        <span>WANXIANG BLOCKED</span>
        <h2>{workspace.video.title}</h2>
        <p>{MISSING_SOURCE_MESSAGE} 万象吸收不会把标题、封面或简介伪装成教程、导图和系统吸收建议。</p>
        <div className="wanxiang-panel__actions">
          <button className="bili-helper-mac__primary" onClick={onGenerate} disabled={isBusy}>
            生成待补诊断
          </button>
        </div>
      </section>
    )
  }

  if (!result) {
    return (
      <section className="wanxiang-empty">
        <span>WANXIANG WAITING</span>
        <h2>{workspace.video.title}</h2>
        <p>当前来源已经进入工作台，但还没有生成万象三结果。先跑一次分析，系统会判断它是否是教学资料，并给出 Openbasaka 吸收路径。</p>
        <div className="wanxiang-panel__actions">
          <button className="bili-helper-mac__primary" onClick={onGenerate} disabled={isBusy}>
            {processing === 'wanxiang' ? '分析中' : '生成万象三结果'}
          </button>
        </div>
      </section>
    )
  }

  const teaching = result.teaching
  const fusion = result.openbasakaFusion
  const canAbsorb = fusion.applicable && diagnostics.contentLength >= 180 && fusion.absorptionScore >= 60
  return (
    <div className="wanxiang-results">
      <section className="wanxiang-panel wanxiang-result-card">
        <div className="wanxiang-panel__head">
          <span>WANXIANG THREE RESULTS</span>
          <strong>{result.generatedBy.toUpperCase()} · {diagnostics.score}/100</strong>
        </div>
        <div className="wanxiang-verdict">
          <span>{teaching.isTeaching ? '教学资料' : '资料理解'}</span>
          <strong>{result.sourceTitle}</strong>
          <p>{teaching.isTeaching ? `置信度 ${Math.round(teaching.confidence * 100)}%，可以生成小白教程和机器执行教程。` : teaching.nonTeachingDigest}</p>
        </div>
        <div className="wanxiang-reasons">
          {teaching.reasons.slice(0, 6).map((reason) => (
            <span key={reason}>{reason}</span>
          ))}
        </div>
        <div className="wanxiang-panel__actions">
          <button className="bili-helper-mac__primary" onClick={onGenerate} disabled={isBusy}>
            {processing === 'wanxiang' ? '分析中' : '重新分析'}
          </button>
          <button onClick={onArchive} disabled={isBusy}>
            {processing === 'archiving' ? '归档中' : '归档三结果'}
          </button>
          <button onClick={onAbsorb} disabled={isBusy || !canAbsorb}>
            {processing === 'absorbing' ? '吸收中' : '吸收为能力'}
          </button>
          <button onClick={() => onCopy(result.markdown)}>复制全量 Markdown</button>
        </div>
      </section>

      <section className="wanxiang-panel">
        <div className="wanxiang-panel__head">
          <span>OPENBASAKA ABSORPTION</span>
          <strong>{fusion.applicable ? 'APPLICABLE' : 'HOLD'}</strong>
        </div>
        <div className="wanxiang-absorption-meter">
          <strong>{Math.round(fusion.absorptionScore)} / 100</strong>
          <span>{fusion.absorptionVerdict}</span>
          <i>{fusion.rationale}</i>
        </div>
        <div className="wanxiang-subsystems">
          {fusion.targetSubsystems.map((target) => (
            <span key={target}>{target}</span>
          ))}
        </div>
        <div className="wanxiang-risks">
          {!canAbsorb && <span>吸收门槛：需要真实内容、60+ 吸收分，并且融合判定为适用。</span>}
          {fusion.risks.map((risk) => (
            <span key={risk}>{risk}</span>
          ))}
        </div>
      </section>

      <section className="wanxiang-panel">
        <div className="wanxiang-panel__head">
          <span>EVIDENCE</span>
          <strong>{teaching.evidenceRefs.length} REFS</strong>
        </div>
        <div className="wanxiang-evidence-list">
          {teaching.evidenceRefs.slice(0, 6).map((ref) => (
            <article key={ref.id}>
              <strong>{ref.time || ref.label}</strong>
              <p>{ref.quote}</p>
            </article>
          ))}
        </div>
      </section>

      {teaching.isTeaching ? (
        <section className="wanxiang-panel">
          <div className="wanxiang-panel__head">
            <span>DOUBLE TUTORIAL</span>
            <strong>HUMAN / MODEL</strong>
          </div>
          <div className="wanxiang-tutorial-grid">
            <article>
              <h3>给小白看的教程</h3>
              <pre>{teaching.beginnerTutorial || '等待生成。'}</pre>
            </article>
            <article>
              <h3>给模型执行的教程</h3>
              <pre>{teaching.modelTutorial || '等待生成。'}</pre>
            </article>
          </div>
        </section>
      ) : (
        <section className="wanxiang-panel wanxiang-digest">
          <div className="wanxiang-panel__head">
            <span>NON-TEACHING DIGEST</span>
            <strong>NO FAKE TUTORIAL</strong>
          </div>
          <p>{teaching.nonTeachingDigest}</p>
        </section>
      )}

      <section className="wanxiang-panel">
        <div className="wanxiang-panel__head">
          <span>PROMPT PATCHES</span>
          <strong>{fusion.promptPatches.length} PATCHES</strong>
        </div>
        <div className="wanxiang-patch-grid">
          {fusion.promptPatches.map((patch) => (
            <article key={`${patch.target}-${patch.title}`}>
              <span>{patch.target}</span>
              <h3>{patch.title}</h3>
              <p>{patch.prompt}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="wanxiang-panel">
        <div className="wanxiang-panel__head">
          <span>MIND MAP</span>
          <strong>{result.mindMap.layout.toUpperCase()}</strong>
        </div>
        <pre className="wanxiang-master-prompt">{result.mindMap.markdown}</pre>
      </section>
    </div>
  )
}

function VideoCard({ workspace, compact = false }: { workspace: BiliVideoWorkspace | null; compact?: boolean }) {
  if (!workspace) {
    return (
      <section className="bili-helper-panel bili-helper-panel--video bili-helper-panel--empty">
        <h3>等待来源</h3>
        <p>粘贴链接或选择文件后，这里会显示封面、简介、平台、解析状态和下一步。</p>
      </section>
    )
  }
  const { video } = workspace
  const hasStats = Object.values(video.stats).some((value) => value > 0)
  return (
    <section className={compact ? 'bili-helper-panel bili-helper-panel--video bili-helper-panel--compact' : 'bili-helper-panel bili-helper-panel--video'}>
      <PanelHead label="SOURCE INFO" value={video.resolvedBy === 'api' ? video.platformName : `${video.platformName} · LOCAL`} />
      <div className="bili-helper-mac__video-body">
        <div className="bili-helper-mac__cover">
          {video.cover ? <img src={video.cover} alt="" /> : <strong>{video.platformName.slice(0, 6)}</strong>}
        </div>
        <div className="bili-helper-mac__video-meta">
          <span>{video.platformName} · {video.bvid}</span>
          <h3>{video.title}</h3>
          <p>{video.description}</p>
          <div className="bili-helper-mac__tags">
            <i>来源: {video.owner}</i>
            <i>{video.sourceKind}</i>
            {video.durationSeconds > 0 && <i>{formatBiliDuration(video.durationSeconds)}</i>}
            <i>{video.subtitleStatus}</i>
            {video.tags.slice(0, 4).map((tag) => (
              <i key={tag}>{tag}</i>
            ))}
          </div>
        </div>
      </div>
      {!compact && (
        <>
          {hasStats && (
            <div className="bili-helper-mac__stats">
              <span>播放 {formatBiliNumber(video.stats.views)}</span>
              <span>弹幕 {formatBiliNumber(video.stats.danmaku)}</span>
              <span>点赞 {formatBiliNumber(video.stats.likes)}</span>
              <span>收藏 {formatBiliNumber(video.stats.favorites)}</span>
            </div>
          )}
          <div className="bili-helper-mac__source-capabilities">
            {video.capabilities.slice(0, 3).map((capability) => (
              <span key={capability}>{capability}</span>
            ))}
          </div>
          {video.warnings.length > 0 && (
            <div className="bili-helper-mac__source-warnings">
              {video.warnings.slice(0, 2).map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
            </div>
          )}
          {video.pages.length > 0 && (
            <div className="bili-helper-mac__pages">
              {video.pages.map((page) => (
                <article key={`${video.id}-${page.index}`}>
                  <strong>{video.sourceKind === 'video' ? `P${page.index}` : `S${page.index}`}</strong>
                  <span>{page.title}</span>
                  <em>{page.durationSeconds > 0 ? formatBiliDuration(page.durationSeconds) : 'source'}</em>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function SourceAssetLibraryCard({ workspace }: { workspace: BiliVideoWorkspace }) {
  const asset = refreshSourceAsset(workspace).sourceAsset
  if (!asset) return null
  return (
    <section className="bili-helper-panel sourceos-library-asset">
      <PanelHead label="ASSET RECEIPTS" value={asset.status.toUpperCase()} />
      <div className="sourceos-library-asset__stats">
        <span>{asset.evidenceRefs.length} 证据</span>
        <span>{asset.artifacts.length} 产物</span>
        <span>{asset.providerRuns.length} Provider</span>
        <span>{asset.exportReceipts.length} 导出</span>
      </div>
      <div className="sourceos-library-asset__latest">
        {(asset.libraryReceipt ? [`归档：${asset.libraryReceipt.sourceId}`] : [])
          .concat(asset.providerRuns.slice(0, 2).map((run) => `${run.provider}: ${run.status} · ${run.detail}`))
          .concat(asset.exportReceipts.slice(0, 2).map((receipt) => `${receipt.format}: ${receipt.status} · ${receipt.outputName}`))
          .slice(0, 4)
          .map((line) => (
            <span key={line}>{line}</span>
          ))}
      </div>
    </section>
  )
}

function PackPreview({
  workspace,
  mode,
  onCopy,
  onOpenTutorial,
  wide = false,
}: {
  workspace: BiliVideoWorkspace | null
  mode?: BiliArtifactMode
  onCopy: () => void
  onOpenTutorial: () => void
  wide?: boolean
}) {
  const pack = mode ? workspace?.modePacks?.[mode] || (workspace?.pack?.mode === mode ? workspace.pack : undefined) : workspace?.pack
  const sourceText = workspace ? getBiliUsableSourceText(workspace.video, workspace.transcript) : ''
  const asset = workspace ? refreshSourceAsset(workspace).sourceAsset : undefined
  if (!pack) {
    return (
      <section
        className={wide ? 'bili-helper-panel bili-helper-panel--pack bili-helper-panel--wide' : 'bili-helper-panel bili-helper-panel--pack'}
        data-guide-target="learning-pack"
      >
        <PanelHead label="LEARNING PACK" value="EMPTY" />
        <div className="bili-helper-mac__empty-note">生成后会出现摘要、资料地图、时间线/OCR 线索、教程、行动清单和可追问问题。</div>
      </section>
    )
  }
  return (
    <section
      className={wide ? 'bili-helper-panel bili-helper-panel--pack bili-helper-panel--wide' : 'bili-helper-panel bili-helper-panel--pack'}
      data-guide-target="learning-pack"
    >
      <PanelHead label="LEARNING PACK" value={`${pack.generatedBy} · ${pack.mode} · ${pack.depth}%`} />
      <div className="sourceos-pack-truth" data-status={sourceText ? 'generated' : 'blocked'}>
        <span>{sourceText ? '真实来源产物' : '待补内容诊断'}</span>
        <strong>{asset?.evidenceRefs.length || 0} 证据 · {sourceText.length} 字符</strong>
        <p>{sourceText ? sourceText.replace(/\s+/g, ' ').slice(0, 180) : '缺真实字幕、正文、OCR 或转写。当前学习包只说明缺什么，不会伪造来源观点。'}</p>
      </div>
      <div className="bili-helper-mac__pack-summary">
        <h3>{workspace?.video.title}</h3>
        <p>{pack.summary}</p>
      </div>
      <div className="bili-helper-mac__pack-grid sourceos-pack-lanes">
        <section data-kind="map">
          <strong>资料地图</strong>
          {pack.outline.slice(0, 4).map((item) => (
            <span key={item}>{item}</span>
          ))}
        </section>
        <section data-kind="action">
          <strong>行动清单</strong>
          {pack.actionList.slice(0, 4).map((item) => (
            <span key={item}>{item}</span>
          ))}
        </section>
        <section data-kind="question">
          <strong>可追问问题</strong>
          {pack.questions.slice(0, 4).map((item) => (
            <span key={item}>{item}</span>
          ))}
        </section>
      </div>
      <div className="bili-helper-mac__timeline sourceos-pack-timeline">
        {pack.timeline.length > 0 ? (
          pack.timeline.slice(0, wide ? 8 : 4).map((item) => (
            <article key={`${item.time}-${item.title}`}>
              <strong>{item.time}</strong>
              <span>{item.title}</span>
              <p>{item.note}</p>
            </article>
          ))
        ) : (
          <article data-empty="true">
            <strong>无时间线</strong>
            <span>等待真实内容</span>
            <p>补充字幕、OCR、转写或正文后，这里才会显示可引用片段。</p>
          </article>
        )}
      </div>
      <footer>
        <button onClick={onOpenTutorial}>打开学习包</button>
        <button onClick={onCopy}>复制 Markdown</button>
      </footer>
    </section>
  )
}
