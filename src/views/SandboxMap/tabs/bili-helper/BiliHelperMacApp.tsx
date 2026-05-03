import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { answerBiliQuestion, generateBiliLearningPack, resolveBiliVideoInfo } from '../../../../lib/bili-helper/ai'
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
import { BIBI_PLATFORM_CAPABILITIES, platformStatusLabel } from '../../../../lib/bili-helper/platforms'
import { buildSourceOsGuideState, type SourceOsGuideState } from '../../../../lib/bili-helper/source-os-guide'
import type {
  BiliArtifactMode,
  BiliDownloadFormat,
  BiliHelperState,
  BiliHelperView,
  BiliVideoWorkspace,
} from '../../../../lib/bili-helper/types'
import { buildUiMuseumPrdContext } from '../../../../lib/ui-museum/context'
import SourceOsGuidePlayer from './SourceOsGuide'
import './BiliHelperMacApp.css'

type ProcessingState = 'idle' | 'resolving' | 'generating' | 'chatting'

const featureChips = ['视频/网页/文件/图片', '封面简介自动卡片', 'AI 产物 + 对话']

const viewTabs: Array<[BiliHelperView, string]> = [
  ['workspace', '工作台'],
  ['insights', '智能总结'],
  ['tutorial', '学习包'],
  ['chat', '来源对话'],
  ['downloads', '下载导出'],
  ['coverage', '覆盖矩阵'],
  ['library', '资料库'],
]

const exportOptions: Array<[BiliDownloadFormat, string, string]> = [
  ['video', '视频文件', '保留原视频任务入口'],
  ['audio', '音频提取', '适合转写和复听'],
  ['subtitle', '字幕/转写', '优先进入知识库'],
  ['cover', '封面图', '用于资料卡片'],
  ['markdown', '学习包 Markdown', '直接归档或复制'],
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

function getDownloadableUrl(workspace: BiliVideoWorkspace): string | null {
  if (/^https?:\/\//i.test(workspace.video.url)) return workspace.video.url
  if (/^BV[0-9A-Za-z]{8,14}$/.test(workspace.video.bvid)) return `https://www.bilibili.com/video/${workspace.video.bvid}/`
  return null
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

function toSrtTime(time: string): string {
  const parts = time.split(':').map((part) => Number(part))
  const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, parts[0] || 0, parts[1] || 0]
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},000`
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
  const [toast, setToast] = useState('')

  const workspace = useMemo(() => activeWorkspace(state), [state])
  const sortedWorkspaces = useMemo(
    () => [...state.workspaces].sort((a, b) => b.video.createdAt - a.video.createdAt),
    [state.workspaces],
  )
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
    const palette = uiMuseumContext.visual.palette.length > 0 ? uiMuseumContext.visual.palette : ['#06050a', '#8186ff', '#31f6bf', '#f0c674']
    return {
      '--bili-bg': palette[0] || '#06050a',
      '--bili-bg-soft': uiMuseumContext.visual.background || '#0d0b14',
      '--bili-panel': uiMuseumContext.visual.surface || 'rgba(14, 13, 22, 0.88)',
      '--bili-accent': uiMuseumContext.visual.accent || palette[1] || '#8186ff',
      '--bili-accent-bright': palette[2] || '#9ea2ff',
      '--bili-cyan': palette[2] || '#31f6bf',
      '--bili-gold': palette[3] || '#f0c674',
      '--bili-radius': uiMuseumContext.visual.radius || '22px',
      '--bili-density': uiMuseumContext.visual.density || 'layered',
      '--bili-motion': uiMuseumContext.visual.motion || 'guided',
      '--bili-texture': uiMuseumContext.visual.texture || 'glass editorial grid',
    } as CSSProperties
  }, [uiMuseumContext])
  const guideState = useMemo(
    () =>
      buildSourceOsGuideState({
        processing,
        workspace,
        view,
        artifactMode,
      }),
    [artifactMode, processing, view, workspace],
  )

  useEffect(() => {
    saveBiliHelperState(state)
  }, [state])

  function flash(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 1800)
  }

  function handleLoadSample() {
    const sample = createSampleBiliWorkspace()
    setState((prev) => {
      const exists = prev.workspaces.some((item) => item.video.bvid === sample.video.bvid)
      const nextWorkspaces = exists ? prev.workspaces : [sample, ...prev.workspaces]
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
      const newWorkspace: BiliVideoWorkspace = {
        video,
        transcript: video.contentText || '',
        chat: [createBiliChatMessage('assistant', `${video.platformName} 来源已解析。下一步可以补正文/字幕/OCR，或直接生成 ${BILI_ARTIFACT_MODES.find((item) => item.id === artifactMode)?.label || '学习包'}。`)],
      }
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
          createFileSourceWorkspace({
            filePath,
            fileName: extracted?.metadata?.fileName || filePath.split('/').pop() || '本地文件',
            kind: extracted?.kind || 'file',
            method,
            content,
            rawContent,
            warnings,
            size: extracted?.metadata?.size,
          }),
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
      patchWorkspace(prev, workspace.video.id, (item) => ({
        ...item,
        transcript: value,
      })),
    )
  }

  async function handleGeneratePack() {
    if (!workspace) {
      flash('先解析或载入一个视频')
      return
    }
    setProcessing('generating')
    const pack = await generateBiliLearningPack({
      video: workspace.video,
      transcript: workspace.transcript || BILI_DEFAULT_TRANSCRIPT,
      goal,
      mode: artifactMode,
      depth: artifactDepth,
    })
    setState((prev) =>
      patchWorkspace(prev, workspace.video.id, (item) => ({
        ...item,
        transcript: item.transcript || BILI_DEFAULT_TRANSCRIPT,
        pack,
      })),
    )
    setProcessing('idle')
    setView('tutorial')
    flash(pack.generatedBy === 'ai' ? '学习包已由 AI 生成' : '学习包已由本地规则生成')
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
    const answer = await answerBiliQuestion({
      video: workspace.video,
      transcript: workspace.transcript,
      pack: workspace.pack,
      history: nextHistory,
      question: userMessage.content,
    })
    setState((prev) =>
      patchWorkspace(prev, workspace.video.id, (item) => ({
        ...item,
        chat: [...nextHistory, answer],
      })),
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

    try {
      if (format === 'markdown') {
        downloadBlob(task.outputName, workspace.pack?.markdown || workspace.video.description, 'text/markdown;charset=utf-8')
        completeTask({ status: 'done', progress: 100 })
        flash('Markdown 已导出')
        return
      }

      if (format === 'subtitle') {
        downloadBlob(task.outputName, transcriptToSrt(workspace.transcript || BILI_DEFAULT_TRANSCRIPT), 'text/plain;charset=utf-8')
        completeTask({ status: 'done', progress: 100 })
        flash('字幕 SRT 已导出')
        return
      }

      if (format === 'cover') {
        if (!workspace.video.cover) throw new Error('当前视频没有封面 URL，先用真实 B站 API 解析一次。')
        const response = await fetch(workspace.video.cover)
        if (!response.ok) throw new Error(`封面下载失败: ${response.status}`)
        const blob = await response.blob()
        downloadBlob(task.outputName, blob, blob.type || 'image/jpeg')
        completeTask({ status: 'done', progress: 100 })
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
          flash(`${task.label} 已下载到 Downloads/BiliHelper`)
          return
        }
        lastError = result?.stderr || result?.error || `${source.label}下载失败`
      }
      throw new Error(`${lastError}\n如果仍是 HTTP 412，请先在 Chrome 或 Safari 登录 B站后重试。`)
    } catch (error) {
      completeTask({ status: 'failed', progress: 100, error: error instanceof Error ? error.message : String(error) })
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
    <div className={`bili-helper-mac ${hasVideo ? 'bili-helper-mac--active' : ''}`} style={uiVisualVars}>
      {toast && <div className="bili-helper-mac__toast">{toast}</div>}

      <section className="bili-helper-mac__hero" aria-label="万象学习助手">
        <div className="bili-helper-mac__hero-inner">
          <div className="bili-helper-mac__badge">
            <i />
            UI风格馆联动 · 多来源学习工作台
          </div>
          <h1>
            <span>Source</span>
            <strong>OS</strong>
          </h1>
          <p className="bili-helper-mac__hero-copy">
            视频、网页、文件、图片，一次进入资料地图。
            <small>BibiGPT 式跨平台接入 · NotebookLM 式对话整理 · OpenBasaka 本地归档</small>
          </p>

          <form className="bili-helper-mac__search" onSubmit={handleResolveVideo}>
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

          <div className="bili-helper-mac__hero-actions">
            <button type="button" onClick={handleLoadSample}>
              载入样例
            </button>
            <button type="button" onClick={handleChooseFiles} disabled={processing === 'resolving'}>
              选择文件/图片
            </button>
            <button type="button" onClick={handleGeneratePack} disabled={!workspace || processing === 'generating'}>
              {processing === 'generating' ? '生成中' : '直接生成学习包'}
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
            <button className="bili-helper-mac__primary" onClick={handleGeneratePack} disabled={!workspace || processing === 'generating'}>
              {processing === 'generating' ? '生成中' : '生成学习包'}
            </button>
          </div>
        </div>

        <SourceOsGuidePlayer state={guideState} />

        <SourceFocusCard
          workspace={workspace}
          guide={guideState}
          onGenerate={handleGeneratePack}
          onOpenChat={() => setView('chat')}
          onOpenDownloads={() => setView('downloads')}
          onLoadSample={handleLoadSample}
          onChooseFiles={handleChooseFiles}
          isGenerating={processing === 'generating'}
        />

        <div className="bili-helper-mac__stage">
          <aside className="bili-helper-mac__side-stack">
            <GuidePipeline guide={guideState} />

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
                  mode={artifactMode}
                  depth={artifactDepth}
                  onModeChange={setArtifactMode}
                  onDepthChange={setArtifactDepth}
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

                <PackPreview workspace={workspace} onCopy={() => handleCopyPack()} onOpenTutorial={() => setView('tutorial')} />
              </div>
            )}

            {view === 'insights' && (
              <BibiInsights
                workspace={workspace}
                onGenerate={handleGeneratePack}
                onAsk={() => setView('chat')}
                onExport={() => handleCopyPack()}
                isGenerating={processing === 'generating'}
              />
            )}

            {view === 'tutorial' && (
              <div className="bili-helper-mac__tutorial">
                <PackPreview workspace={workspace} onCopy={() => handleCopyPack()} onOpenTutorial={() => setView('tutorial')} wide />
                <section className="bili-helper-panel bili-helper-panel--markdown">
                  <PanelHead label="MARKDOWN PACK" value={workspace?.pack?.generatedBy || 'NONE'} />
                  <pre>{workspace?.pack?.markdown || '先生成学习包。'}</pre>
                </section>
              </div>
            )}

            {view === 'chat' && (
              <div className="bili-helper-mac__chat-view">
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
              <div className="bili-helper-mac__downloads">
                <section className="bili-helper-panel bili-helper-panel--download-actions">
                  <PanelHead label="EXPORT TARGETS" value={workspace?.video.bvid || 'NO_VIDEO'} />
                  <p className="bili-helper-mac__download-hint">
                    视频/音频会写入 ~/Downloads/BiliHelper；网页、图片、文档等来源可导出 Markdown、字幕/OCR 文本和封面/缩略图。
                  </p>
                  <div className="bili-helper-mac__download-grid">
                    {exportOptions.map(([format, title, note]) => (
                      <button key={format} onClick={() => handleQueueDownload(format)} disabled={!workspace}>
                        <strong>{title}</strong>
                        <span>{note}</span>
                      </button>
                    ))}
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
                {sortedWorkspaces.length === 0 ? (
                  <section className="bili-helper-panel bili-helper-panel--empty">还没有资料来源。</section>
                ) : (
                  sortedWorkspaces.map((item) => (
                    <article key={item.video.id} className="bili-helper-mac__library-card">
                      <VideoCard workspace={item} compact />
                      <PackPreview
                        workspace={item}
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
      <section className="sourceos-focus-card sourceos-focus-card--empty" data-target={guide.focusTarget}>
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
          <span>{guide.activeStep.label}</span>
          <strong>{guide.cta}</strong>
          <i style={{ width: `${guide.progress}%` }} />
        </aside>
      </section>
    )
  }

  const { video } = workspace
  const hasStats = Object.values(video.stats).some((value) => value > 0)
  return (
    <section className="sourceos-focus-card" data-target={guide.focusTarget}>
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
        <span>{guide.activeStep.label}</span>
        <strong>{guide.cta}</strong>
        <p>{guide.activeStep.description}</p>
        <i style={{ width: `${guide.progress}%` }} />
        <div>
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

function ArtifactControls({
  mode,
  depth,
  onModeChange,
  onDepthChange,
}: {
  mode: BiliArtifactMode
  depth: number
  onModeChange: (mode: BiliArtifactMode) => void
  onDepthChange: (depth: number) => void
}) {
  const activeMode = BILI_ARTIFACT_MODES.find((item) => item.id === mode) || BILI_ARTIFACT_MODES[0]
  return (
    <section className="bili-helper-panel bili-helper-panel--artifact-controls">
      <PanelHead label="ARTIFACT DASHBOARD" value={activeMode.label} />
      <div className="sourceos-artifact-active" style={{ '--mode-accent': activeMode.accent } as CSSProperties}>
        <span>当前产物</span>
        <strong>{activeMode.label}</strong>
        <p>{activeMode.desc}</p>
      </div>
      <div className="bili-helper-mac__mode-grid">
        {BILI_ARTIFACT_MODES.map((item) => (
          <button
            key={item.id}
            className={mode === item.id ? 'bili-helper-mac__mode-card bili-helper-mac__mode-card--active' : 'bili-helper-mac__mode-card'}
            onClick={() => onModeChange(item.id)}
            style={{ '--mode-accent': item.accent } as CSSProperties}
          >
            <strong>{item.label}</strong>
            <span>{item.desc}</span>
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

function CoverageMatrix({ onChooseFiles, onLoadSample }: { onChooseFiles: () => void; onLoadSample: () => void }) {
  const directCount = BIBI_PLATFORM_CAPABILITIES.filter((item) => item.status === 'direct').length
  const metadataCount = BIBI_PLATFORM_CAPABILITIES.filter((item) => item.status === 'metadata').length
  const localCount = BIBI_PLATFORM_CAPABILITIES.filter((item) => item.status === 'local-first').length
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
        </div>
      </section>
    </div>
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
  const pack = workspace?.pack
  const transcriptRows = parseTranscriptRows(workspace?.transcript || BILI_DEFAULT_TRANSCRIPT)
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
            <p>{summary}</p>
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
          {chapterRows.slice(0, 8).map((item) => (
            <article key={`${item.time}-${item.title}`}>
              <strong>{item.time}</strong>
              <div>
                <span>{item.title}</span>
                <p>{item.note}</p>
              </div>
            </article>
          ))}
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
          {transcriptRows.slice(0, 12).map((row, index) => (
            <article key={`${row.time}-${index}`}>
              <strong>{row.time}</strong>
              <p>{row.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bili-helper-panel bili-helper-panel--article-reader">
        <PanelHead label="ARTICLE VIEW" value={pack ? 'READY' : 'WAITING'} />
        <article className="bili-helper-mac__article-reader">
          <h3>{workspace?.video.title || '来源文章'}</h3>
          <p>{pack?.tutorial || '生成后会把来源整理成一篇可阅读、可归档、可继续改写的教程文章。'}</p>
        </article>
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

function PackPreview({
  workspace,
  onCopy,
  onOpenTutorial,
  wide = false,
}: {
  workspace: BiliVideoWorkspace | null
  onCopy: () => void
  onOpenTutorial: () => void
  wide?: boolean
}) {
  const pack = workspace?.pack
  if (!pack) {
    return (
      <section className={wide ? 'bili-helper-panel bili-helper-panel--pack bili-helper-panel--wide' : 'bili-helper-panel bili-helper-panel--pack'}>
        <PanelHead label="LEARNING PACK" value="EMPTY" />
        <div className="bili-helper-mac__empty-note">生成后会出现摘要、资料地图、时间线/OCR 线索、教程、行动清单和可追问问题。</div>
      </section>
    )
  }
  return (
    <section className={wide ? 'bili-helper-panel bili-helper-panel--pack bili-helper-panel--wide' : 'bili-helper-panel bili-helper-panel--pack'}>
      <PanelHead label="LEARNING PACK" value={`${pack.generatedBy} · ${pack.mode} · ${pack.depth}%`} />
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
        {pack.timeline.slice(0, wide ? 8 : 4).map((item) => (
          <article key={`${item.time}-${item.title}`}>
            <strong>{item.time}</strong>
            <span>{item.title}</span>
            <p>{item.note}</p>
          </article>
        ))}
      </div>
      <footer>
        <button onClick={onOpenTutorial}>打开学习包</button>
        <button onClick={onCopy}>复制 Markdown</button>
      </footer>
    </section>
  )
}
