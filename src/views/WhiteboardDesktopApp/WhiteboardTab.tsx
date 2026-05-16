import { ChangeEvent, ClipboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildWhiteboardAiSystemPrompt,
  buildWhiteboardAiUserPrompt,
  buildWhiteboardHistoryMarkdownExport,
  buildWhiteboardMarkdownExport,
  buildWhiteboardTitleSystemPrompt,
  buildWhiteboardTitleUserPrompt,
  createEmptyWhiteboardDraft,
  createWhiteboardFallbackTitleSuggestions,
  createWhiteboardImage,
  deleteWhiteboardHistoryItem,
  getWhiteboardAiTitle,
  getWhiteboardPriorityLabel,
  getWhiteboardSaveKindLabel,
  loadWhiteboardHistory,
  loadWhiteboardDraft,
  mergeWhiteboardAiResultIntoText,
  parseWhiteboardTitleSuggestions,
  saveWhiteboardHistory,
  saveWhiteboardDraft,
  saveWhiteboardExportRecord,
  updateWhiteboardHistoryItem,
  type WhiteboardAiMode,
  type WhiteboardAiResult,
  type WhiteboardDraft,
  type WhiteboardHistoryItem,
  type WhiteboardImage,
  type WhiteboardMarkdownExport,
  type WhiteboardPriority,
  type WhiteboardSaveKind,
} from '../../lib/whiteboard/module'
import './WhiteboardTab.css'

type AiStatus = 'idle' | 'loading' | 'done' | 'error'
type SaveTitleStatus = 'idle' | 'loading' | 'ready' | 'fallback'
type VoiceStatus = 'idle' | 'recording' | 'transcribing' | 'error'

interface AiState {
  status: AiStatus
  message: string
  mode: WhiteboardAiMode | null
}

interface SaveTitleState {
  status: SaveTitleStatus
  titles: Record<WhiteboardSaveKind, string>
  signature: string
}

interface VoiceRecordingState {
  recorder: MediaRecorder
  stream: MediaStream
  chunks: Blob[]
}

function readImageFile(file: File): Promise<WhiteboardImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(createWhiteboardImage(file, String(reader.result || '')))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

function isAiError(value: unknown): value is { error: string } {
  return Boolean(value && typeof value === 'object' && 'error' in value)
}

function getDraftSignature(draft: WhiteboardDraft): string {
  return JSON.stringify({
    text: draft.text.trim(),
    images: draft.images.map((image) => image.id),
  })
}

function getPriorityTone(priority: WhiteboardPriority): string {
  if (priority === 'urgent') return 'urgent'
  if (priority === 'high') return 'high'
  if (priority === 'low') return 'low'
  return 'normal'
}

function getPreferredVoiceMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType),
  )
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('录音读取失败'))
    reader.readAsDataURL(blob)
  })
}

function stopVoiceStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop())
}

export default function WhiteboardTab() {
  const [draft, setDraft] = useState<WhiteboardDraft>(() => createEmptyWhiteboardDraft())
  const [loaded, setLoaded] = useState(false)
  const [aiState, setAiState] = useState<AiState>({ status: 'idle', message: '', mode: null })
  const [notice, setNotice] = useState('')
  const [saveMenuOpen, setSaveMenuOpen] = useState(false)
  const [savingKind, setSavingKind] = useState<WhiteboardSaveKind | null>(null)
  const [saveTitleState, setSaveTitleState] = useState<SaveTitleState>(() => ({
    status: 'idle',
    titles: createWhiteboardFallbackTitleSuggestions(createEmptyWhiteboardDraft()),
    signature: '',
  }))
  const [history, setHistory] = useState<WhiteboardHistoryItem[]>([])
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [editingHistory, setEditingHistory] = useState<WhiteboardHistoryItem | null>(null)
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const noticeTimerRef = useRef<number | null>(null)
  const voiceRecordingRef = useRef<VoiceRecordingState | null>(null)

  const stats = useMemo(
    () => ({
      chars: draft.text.trim().length,
      images: draft.images.length,
      updated: draft.updatedAt ? new Date(draft.updatedAt).toLocaleString() : '',
    }),
    [draft.images.length, draft.text, draft.updatedAt],
  )

  useEffect(() => {
    let alive = true
    loadWhiteboardDraft().then((savedDraft) => {
      if (!alive) return
      setDraft(savedDraft)
      loadWhiteboardHistory(12).then((items) => {
        if (alive) setHistory(items)
      })
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    return () => {
      const recording = voiceRecordingRef.current
      if (!recording) return
      recording.recorder.ondataavailable = null
      recording.recorder.onerror = null
      recording.recorder.onstop = null
      if (recording.recorder.state !== 'inactive') recording.recorder.stop()
      stopVoiceStream(recording.stream)
      voiceRecordingRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!loaded) return
    const timer = window.setTimeout(() => {
      saveWhiteboardDraft(draft).catch(() => {})
    }, 260)
    return () => window.clearTimeout(timer)
  }, [draft, loaded])

  function flash(message: string) {
    setNotice(message)
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => setNotice(''), 1800)
  }

  function patchDraft(updater: (current: WhiteboardDraft) => WhiteboardDraft) {
    setDraft((current) => {
      const next = updater(current)
      return { ...next, updatedAt: new Date().toISOString() }
    })
  }

  async function addImageFiles(files: File[]) {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length === 0) return
    try {
      const images = await Promise.all(imageFiles.map(readImageFile))
      patchDraft((current) => ({ ...current, images: [...current.images, ...images] }))
      flash(`已加入 ${images.length} 张图片`)
    } catch (error) {
      setAiState({ status: 'error', message: error instanceof Error ? error.message : '图片读取失败', mode: null })
    }
  }

  function handleTextChange(value: string) {
    patchDraft((current) => ({ ...current, text: value }))
  }

  function appendVoiceText(text: string) {
    const cleaned = text.replace(/\s+/g, ' ').trim()
    if (!cleaned) return
    patchDraft((current) => {
      const separator = current.text.trim() ? '\n' : ''
      return { ...current, text: `${current.text}${separator}${cleaned}` }
    })
  }

  function cancelVoiceInput() {
    const recording = voiceRecordingRef.current
    if (!recording) return
    recording.recorder.ondataavailable = null
    recording.recorder.onerror = null
    recording.recorder.onstop = null
    if (recording.recorder.state !== 'inactive') recording.recorder.stop()
    stopVoiceStream(recording.stream)
    voiceRecordingRef.current = null
  }

  async function finishVoiceRecording(recording: VoiceRecordingState) {
    if (voiceRecordingRef.current === recording) voiceRecordingRef.current = null
    stopVoiceStream(recording.stream)

    const blob = new Blob(recording.chunks, {
      type: recording.recorder.mimeType || recording.chunks[0]?.type || 'audio/webm',
    })
    if (blob.size === 0) {
      setVoiceStatus('idle')
      setAiState({ status: 'done', message: '没有捕获到语音', mode: null })
      flash('没有捕获到语音')
      return
    }

    setVoiceStatus('transcribing')
    setAiState({ status: 'loading', message: '本地 Whisper 转写语音', mode: null })
    flash('正在本地转写语音')
    try {
      const dataUrl = await blobToDataUrl(blob)
      const transcribeVoice = window.electronAPI?.transcribeWhiteboardVoice
      if (!transcribeVoice) throw new Error('当前桌面端缺少语音转写通道')
      const result = await transcribeVoice({
        fileName: `whiteboard-voice-${Date.now()}.webm`,
        mimeType: blob.type || 'audio/webm',
        dataUrl,
      })
      const transcript = (result.rawContent || result.content || '').trim()
      if (!result.success || !transcript) {
        throw new Error(result.error || '语音转写没有得到文字')
      }
      appendVoiceText(transcript)
      setVoiceStatus('idle')
      const message = result.method === 'whisper-local' ? '语音已转写并加入白板' : `语音已加入白板：${result.method}`
      setAiState({ status: 'done', message, mode: null })
      flash(message)
    } catch (error) {
      const message = error instanceof Error ? `语音转写失败：${error.message}` : '语音转写失败'
      setVoiceStatus('error')
      setAiState({ status: 'error', message, mode: null })
      flash(message)
    }
  }

  async function startVoiceInput() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      const message = '当前环境暂不支持语音录入'
      setVoiceStatus('error')
      setAiState({ status: 'error', message, mode: null })
      flash(message)
      return
    }
    if (!window.electronAPI?.transcribeWhiteboardVoice) {
      const message = '当前桌面端缺少语音转写通道'
      setVoiceStatus('error')
      setAiState({ status: 'error', message, mode: null })
      flash(message)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      const mimeType = getPreferredVoiceMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      const recording: VoiceRecordingState = { recorder, stream, chunks: [] }

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recording.chunks.push(event.data)
      }
      recorder.onerror = (event) => {
        cancelVoiceInput()
        setVoiceStatus('error')
        const message = 'error' in event && event.error instanceof Error ? event.error.message : '录音失败'
        setAiState({ status: 'error', message: `语音录入失败：${message}`, mode: null })
        flash(`语音录入失败：${message}`)
      }
      recorder.onstop = () => {
        void finishVoiceRecording(recording)
      }

      voiceRecordingRef.current = recording
      recorder.start()
      setVoiceStatus('recording')
      setAiState({ status: 'loading', message: '语音输入中，停止后转写', mode: null })
      flash('语音输入已启动，再点一次停止并转写')
    } catch (error) {
      const message = error instanceof Error ? `语音录入失败：${error.message}` : '语音录入失败'
      setVoiceStatus('error')
      setAiState({ status: 'error', message, mode: null })
      flash(message)
    }
  }

  function toggleVoiceInput() {
    if (voiceStatus === 'recording') {
      const recording = voiceRecordingRef.current
      if (!recording) {
        setVoiceStatus('idle')
        return
      }
      setVoiceStatus('transcribing')
      setAiState({ status: 'loading', message: '本地 Whisper 转写语音', mode: null })
      if (recording.recorder.state !== 'inactive') {
        recording.recorder.stop()
      } else {
        void finishVoiceRecording(recording)
      }
      return
    }
    if (voiceStatus === 'transcribing') {
      flash('正在转写上一段语音')
      return
    }
    void startVoiceInput()
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files || []).filter((file) => file.type.startsWith('image/'))
    if (files.length === 0) return
    event.preventDefault()
    addImageFiles(files)
  }

  function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    addImageFiles(Array.from(event.target.files || []))
    event.target.value = ''
  }

  async function handleCopy() {
    const exportData = buildWhiteboardMarkdownExport(draft)
    try {
      await navigator.clipboard.writeText(exportData.markdown)
      flash('已复制 Markdown')
    } catch {
      flash('复制失败')
    }
  }

  async function downloadMarkdownExport(exportData: WhiteboardMarkdownExport): Promise<{ success: boolean; filePath?: string }> {
    const electronExport = window.electronAPI?.exportWhiteboardMarkdown
    if (electronExport) {
      const result = await electronExport(exportData)
      if (result.success && result.filePath) {
        return { success: true, filePath: result.filePath }
      }
      if (result.cancelled) {
        flash('已取消导出')
      } else {
        setAiState({ status: 'error', message: result.error || '导出失败', mode: null })
      }
      return { success: false }
    }

    const blob = new Blob([exportData.markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = exportData.fileName
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
    return { success: true }
  }

  async function handleExport() {
    const exportData = buildWhiteboardMarkdownExport(draft)
    const result = await downloadMarkdownExport(exportData)
    if (!result.success) return
    if (result.filePath) {
      await saveWhiteboardExportRecord(draft, result.filePath)
      flash(`已导出 ${result.filePath}`)
    } else {
      flash('已导出 Markdown')
    }
  }

  async function handleAi(mode: WhiteboardAiMode) {
    const sendToAI = window.electronAPI?.sendToAI
    if (!sendToAI) {
      setAiState({ status: 'error', message: '当前环境没有可用的 AI 通道', mode })
      return
    }
    setAiState({ status: 'loading', message: getWhiteboardAiTitle(mode), mode })
    try {
      const response = await sendToAI(
        buildWhiteboardAiUserPrompt(draft, mode),
        buildWhiteboardAiSystemPrompt(mode),
        undefined,
        mode === 'openbasakaPrompt' ? 0.72 : mode === 'storyboard' ? 0.65 : 0.45,
        mode === 'openbasakaPrompt' ? 2400 : mode === 'storyboard' ? 1800 : 1200,
      )
      if (isAiError(response)) {
        setAiState({ status: 'error', message: response.error || 'AI 返回失败', mode })
        return
      }
      const result: WhiteboardAiResult = {
        mode,
        title: getWhiteboardAiTitle(mode),
        content: String(response || '').trim(),
        createdAt: new Date().toISOString(),
      }
      patchDraft((current) => ({ ...current, aiResult: result }))
      setAiState({ status: 'done', message: result.title, mode })
    } catch (error) {
      setAiState({ status: 'error', message: error instanceof Error ? error.message : 'AI 请求失败', mode })
    }
  }

  async function refreshSaveTitlePreviews() {
    const signature = getDraftSignature(draft)
    const fallbackTitles = createWhiteboardFallbackTitleSuggestions(draft)
    if (saveTitleState.signature === signature && saveTitleState.status === 'ready') return

    setSaveTitleState({ status: 'loading', titles: fallbackTitles, signature })
    const sendToAI = window.electronAPI?.sendToAI
    if (!sendToAI) {
      setSaveTitleState({ status: 'fallback', titles: fallbackTitles, signature })
      return
    }

    try {
      const response = await sendToAI(
        buildWhiteboardTitleUserPrompt(draft),
        buildWhiteboardTitleSystemPrompt(),
        undefined,
        0.72,
        360,
      )
      if (isAiError(response)) {
        setSaveTitleState({ status: 'fallback', titles: fallbackTitles, signature })
        return
      }
      const titles = parseWhiteboardTitleSuggestions(String(response || ''), draft)
      setSaveTitleState({ status: 'ready', titles, signature })
    } catch {
      setSaveTitleState({ status: 'fallback', titles: fallbackTitles, signature })
    }
  }

  function toggleSaveMenu() {
    setSaveMenuOpen((open) => {
      const next = !open
      if (next) void refreshSaveTitlePreviews()
      return next
    })
  }

  async function handleSaveHistory(kind: WhiteboardSaveKind) {
    if (!draft.text.trim() && draft.images.length === 0) {
      flash('先记录一点内容')
      return
    }
    setSavingKind(kind)
    const saved = await saveWhiteboardHistory(draft, kind, saveTitleState.titles[kind])
    setSavingKind(null)
    if (!saved) {
      setAiState({ status: 'error', message: '历史保存失败', mode: null })
      return
    }
    const latest = await loadWhiteboardHistory(12)
    setHistory(latest.length > 0 ? latest : [saved, ...history.filter((item) => item.id !== saved.id)].slice(0, 12))
    setSaveMenuOpen(false)
    const message = `已保存为${getWhiteboardSaveKindLabel(kind)}`
    setAiState({ status: 'done', message, mode: null })
    flash(message)
  }

  function openHistoryEditor(item?: WhiteboardHistoryItem) {
    const selected = item || history[0] || null
    setEditingHistory(selected)
    setHistoryModalOpen(true)
    setSaveMenuOpen(false)
  }

  function patchEditingHistory(patch: Partial<WhiteboardHistoryItem>) {
    setEditingHistory((current) => (current ? { ...current, ...patch } : current))
  }

  async function handleCopyHistory() {
    if (!editingHistory) return
    try {
      await navigator.clipboard.writeText(buildWhiteboardHistoryMarkdownExport(editingHistory).markdown)
      flash('已复制历史内容')
    } catch {
      flash('历史复制失败')
    }
  }

  async function handleCommitHistory() {
    if (!editingHistory) return
    const saved = await updateWhiteboardHistoryItem({
      id: editingHistory.id,
      title: editingHistory.title,
      text: editingHistory.text,
      aiResult: editingHistory.aiResult,
      saveKind: editingHistory.saveKind,
      isStarred: editingHistory.isStarred,
      isPinned: editingHistory.isPinned,
      priority: editingHistory.priority,
    })
    if (!saved) {
      setAiState({ status: 'error', message: '历史更新失败', mode: null })
      return
    }
    const latest = await loadWhiteboardHistory(12)
    setHistory(latest.length > 0 ? latest : [saved, ...history.filter((item) => item.id !== saved.id)].slice(0, 12))
    setEditingHistory(saved)
    setAiState({ status: 'done', message: '历史已更新', mode: null })
    flash('历史已更新')
  }

  async function handleExportHistoryMarkdown() {
    if (!editingHistory) return
    const exportData = buildWhiteboardHistoryMarkdownExport(editingHistory)
    const result = await downloadMarkdownExport(exportData)
    if (result.success) flash(result.filePath ? `已导出 ${result.filePath}` : '已导出历史 MD')
  }

  async function handleDeleteHistory() {
    if (!editingHistory) return
    const confirmed = window.confirm(`删除「${editingHistory.title}」这条白板历史？`)
    if (!confirmed) return
    const deleted = await deleteWhiteboardHistoryItem(editingHistory.id)
    if (!deleted) {
      setAiState({ status: 'error', message: '历史删除失败', mode: null })
      return
    }
    const latest = await loadWhiteboardHistory(12)
    setHistory(latest)
    setEditingHistory(latest[0] || null)
    setAiState({ status: 'done', message: '已删除历史', mode: null })
    flash('已删除历史')
  }

  function handleReplaceWithAi() {
    if (!draft.aiResult?.content) return
    patchDraft((current) => ({ ...current, text: mergeWhiteboardAiResultIntoText(current), aiResult: null }))
    flash('已并入原文')
  }

  function removeImage(id: string) {
    patchDraft((current) => ({ ...current, images: current.images.filter((image) => image.id !== id) }))
  }

  function clearBoard() {
    cancelVoiceInput()
    setVoiceStatus('idle')
    setDraft(createEmptyWhiteboardDraft())
    setAiState({ status: 'idle', message: '', mode: null })
    flash('已清空')
  }

  return (
    <div className="whiteboard-tab">
      <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={handleFileSelect} />

      <div className="whiteboard-tab__sheet">
        <textarea
          className="whiteboard-tab__editor"
          value={draft.text}
          onChange={(event) => handleTextChange(event.target.value)}
          onPaste={handlePaste}
          autoFocus
          spellCheck={false}
          placeholder="写下一个真实项目想法。"
        />

        {draft.images.length > 0 && (
          <div className="whiteboard-tab__images" aria-label="已加入图片">
            {draft.images.map((image, index) => (
              <figure key={image.id} className="whiteboard-tab__image">
                <img src={image.dataUrl} alt={`whiteboard upload ${index + 1}`} />
                <figcaption>
                  <span>{image.name}</span>
                  <button type="button" onClick={() => removeImage(image.id)} title="移除图片">
                    ×
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        {draft.aiResult && (
          <section className="whiteboard-tab__ai-result" aria-label="AI 结果">
            <header>
              <span>{draft.aiResult.title}</span>
              <button type="button" onClick={handleReplaceWithAi}>
                并入原文
              </button>
            </header>
            <pre>{draft.aiResult.content}</pre>
          </section>
        )}
      </div>

      <div className={`whiteboard-tab__status whiteboard-tab__status--${aiState.status}`}>
        <span>{aiState.status === 'loading' ? `正在生成：${aiState.message}` : aiState.message || notice || '本地草稿已准备'}</span>
        <strong>
          {stats.chars} 字 · {stats.images} 图{stats.updated ? ` · ${stats.updated}` : ''}
        </strong>
      </div>

      <div className={`whiteboard-tab__save-dock ${saveMenuOpen ? 'whiteboard-tab__save-dock--open' : ''}`}>
        <div className="whiteboard-tab__save-menu" aria-hidden={!saveMenuOpen}>
          <div className="whiteboard-tab__save-menu-header">
            <div>
              <span>AI 标题预览</span>
              <strong>
                {saveTitleState.status === 'loading'
                  ? '正在把标题改得更好懂'
                  : saveTitleState.status === 'fallback'
                    ? '本地标题可先保存'
                    : '选择保存到哪一类'}
              </strong>
            </div>
            <button type="button" onClick={() => openHistoryEditor()} disabled={history.length === 0}>
              管理 {history.length}
            </button>
          </div>
          <div className="whiteboard-tab__save-actions">
            <button
              type="button"
              className="whiteboard-tab__save-card whiteboard-tab__save-card--inspiration"
              disabled={savingKind !== null}
              onClick={() => handleSaveHistory('inspiration')}
              title="保存为灵感"
            >
              <span>灵感</span>
              <strong>{saveTitleState.titles.inspiration}</strong>
              <small>{saveTitleState.status === 'loading' ? 'AI 起名中，可先保存' : '轻快小火花'}</small>
            </button>
            <button
              type="button"
              className="whiteboard-tab__save-card whiteboard-tab__save-card--project"
              disabled={savingKind !== null}
              onClick={() => handleSaveHistory('project')}
              title="保存为项目候选"
            >
              <span>项目</span>
              <strong>{saveTitleState.titles.project}</strong>
              <small>{saveTitleState.status === 'loading' ? 'AI 起名中，可先保存' : '可推进任务'}</small>
            </button>
          </div>
          {history.length > 0 && (
            <div className="whiteboard-tab__history-mini" aria-label="最近保存">
              {history.slice(0, 3).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`whiteboard-tab__history-mini-item whiteboard-tab__history-mini-item--${item.saveKind}`}
                  onClick={() => openHistoryEditor(item)}
                >
                  <span>{getWhiteboardSaveKindLabel(item.saveKind)}</span>
                  <em>
                    {item.isPinned ? '置顶' : ''}
                    {item.isStarred ? ' ★' : ''}
                    {!item.isPinned && !item.isStarred ? getWhiteboardPriorityLabel(item.priority) : ''}
                  </em>
                  <strong>{item.title}</strong>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="whiteboard-tab__save-fab"
          onClick={toggleSaveMenu}
          aria-expanded={saveMenuOpen}
          title="保存到历史"
        >
          <span>{savingKind ? '…' : '存'}</span>
        </button>
      </div>

      {historyModalOpen && (
        <div className="whiteboard-tab__history-modal" role="dialog" aria-modal="true" aria-label="白板历史编辑">
          <div className="whiteboard-tab__history-dialog">
            <header className="whiteboard-tab__history-dialog-header">
              <div>
                <span>白板历史</span>
                <strong>{editingHistory ? editingHistory.title : '还没有保存内容'}</strong>
              </div>
              <button type="button" onClick={() => setHistoryModalOpen(false)} title="关闭">
                ×
              </button>
            </header>

            <div className="whiteboard-tab__history-dialog-body">
              <aside className="whiteboard-tab__history-list">
                {history.length === 0 ? (
                  <div className="whiteboard-tab__history-empty">保存为灵感或项目后，会出现在这里。</div>
                ) : (
                  history.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={[
                        'whiteboard-tab__history-row',
                        `whiteboard-tab__history-row--${item.saveKind}`,
                        `whiteboard-tab__history-row--priority-${getPriorityTone(item.priority)}`,
                        editingHistory?.id === item.id ? 'whiteboard-tab__history-row--active' : '',
                        item.isPinned ? 'whiteboard-tab__history-row--pinned' : '',
                        item.isStarred ? 'whiteboard-tab__history-row--starred' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setEditingHistory(item)}
                    >
                      <span className="whiteboard-tab__history-row-meta">
                        <em>{getWhiteboardSaveKindLabel(item.saveKind)}</em>
                        {item.isPinned && <em>置顶</em>}
                        {item.isStarred && <em>★ 星标</em>}
                      </span>
                      <strong>{item.title}</strong>
                      <small>
                        {getWhiteboardPriorityLabel(item.priority)}优先 · {item.text.trim().length}字
                        {item.imageCount > 0 ? ` · ${item.imageCount}图` : ''}
                      </small>
                    </button>
                  ))
                )}
              </aside>

              <section className="whiteboard-tab__history-editor">
                {editingHistory ? (
                  <>
                    <div className="whiteboard-tab__history-fields">
                      <label>
                        标题
                        <input
                          value={editingHistory.title}
                          onChange={(event) => patchEditingHistory({ title: event.target.value })}
                        />
                      </label>
                      <label>
                        类型
                        <select
                          value={editingHistory.saveKind}
                          onChange={(event) =>
                            patchEditingHistory({ saveKind: event.target.value as WhiteboardSaveKind })
                          }
                        >
                          <option value="inspiration">灵感</option>
                          <option value="project">项目</option>
                        </select>
                      </label>
                      <label>
                        优先级
                        <select
                          value={editingHistory.priority}
                          onChange={(event) =>
                            patchEditingHistory({ priority: event.target.value as WhiteboardPriority })
                          }
                        >
                          <option value="low">低</option>
                          <option value="normal">普通</option>
                          <option value="high">高</option>
                          <option value="urgent">紧急</option>
                        </select>
                      </label>
                    </div>

                    <div className="whiteboard-tab__history-flags">
                      <button
                        type="button"
                        className={editingHistory.isStarred ? 'whiteboard-tab__history-flag--active whiteboard-tab__history-flag--starred' : ''}
                        onClick={() => patchEditingHistory({ isStarred: !editingHistory.isStarred })}
                      >
                        {editingHistory.isStarred ? '★ 已星标' : '☆ 标星'}
                      </button>
                      <button
                        type="button"
                        className={editingHistory.isPinned ? 'whiteboard-tab__history-flag--active whiteboard-tab__history-flag--pinned' : ''}
                        onClick={() => patchEditingHistory({ isPinned: !editingHistory.isPinned })}
                      >
                        {editingHistory.isPinned ? '已置顶' : '置顶'}
                      </button>
                      <span
                        className={`whiteboard-tab__priority-badge whiteboard-tab__priority-badge--${getPriorityTone(
                          editingHistory.priority,
                        )}`}
                      >
                        {getWhiteboardPriorityLabel(editingHistory.priority)}优先
                      </span>
                    </div>

                    <textarea
                      className="whiteboard-tab__history-textarea"
                      value={editingHistory.text}
                      onChange={(event) => patchEditingHistory({ text: event.target.value })}
                    />

                    {editingHistory.aiResult && (
                      <section className="whiteboard-tab__history-ai-result" aria-label="历史 AI 结果">
                        <header>
                          <span>{editingHistory.aiResult.title}</span>
                          <small>{editingHistory.aiResult.mode}</small>
                        </header>
                        <pre>{editingHistory.aiResult.content}</pre>
                      </section>
                    )}

                    <footer className="whiteboard-tab__history-editor-actions">
                      <button type="button" className="whiteboard-tab__history-delete" onClick={handleDeleteHistory}>
                        删除
                      </button>
                      <button type="button" onClick={handleCopyHistory}>
                        复制
                      </button>
                      <button type="button" onClick={handleExportHistoryMarkdown}>
                        下载 MD
                      </button>
                      <button type="button" className="whiteboard-tab__history-save" onClick={handleCommitHistory}>
                        保存修改
                      </button>
                    </footer>
                  </>
                ) : (
                  <div className="whiteboard-tab__history-empty">没有可编辑的历史。</div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      <div className="whiteboard-tab__toolbar" aria-label="白板操作">
        <button type="button" onClick={handleCopy} title="复制 Markdown">
          ⧉ 复制
        </button>
        <button type="button" onClick={handleExport} title="导出 Markdown">
          ⇩ 导出 MD
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()} title="加入图片">
          ＋ 图片
        </button>
        <button
          type="button"
          className={[
            voiceStatus === 'recording' ? 'whiteboard-tab__toolbar-active whiteboard-tab__toolbar-active--recording' : '',
            voiceStatus === 'transcribing' ? 'whiteboard-tab__toolbar-active whiteboard-tab__toolbar-active--busy' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          disabled={voiceStatus === 'transcribing'}
          onClick={toggleVoiceInput}
          aria-pressed={voiceStatus === 'recording'}
          title={
            voiceStatus === 'recording'
              ? '停止语音输入并转写'
              : voiceStatus === 'transcribing'
                ? '正在转写语音'
                : '语音输入'
          }
        >
          {voiceStatus === 'recording' ? '● 录音中' : voiceStatus === 'transcribing' ? '… 转写中' : '◉ 语音'}
        </button>
        <button type="button" disabled={!stats.chars || aiState.status === 'loading'} onClick={() => handleAi('optimize')} title="一键优化">
          ✦ 优化
        </button>
        <button
          type="button"
          disabled={!stats.chars || aiState.status === 'loading'}
          onClick={() => handleAi('imagePrompt')}
          title="转绘画 Prompt"
        >
          ◇ 画 Prompt
        </button>
        <button
          type="button"
          disabled={!stats.chars || aiState.status === 'loading'}
          onClick={() => handleAi('openbasakaPrompt')}
          title="转 Openbasaka 系统改造 Prompt"
        >
          ◈ 系统 Prompt
        </button>
        <button
          type="button"
          disabled={!stats.chars || aiState.status === 'loading'}
          onClick={() => handleAi('storyboard')}
          title="转分镜草案"
        >
          ▣ 分镜
        </button>
        <button type="button" className="whiteboard-tab__toolbar-danger" onClick={clearBoard} title="清空白板">
          清空
        </button>
      </div>
    </div>
  )
}
