/**
 * XiaoBaiTab — 小白诊断助手
 * 功能：问题诊断（流式AI） + 知识库 + 笔记 + 历史
 * 移植自 xiaobaixiaobai 项目，适配 Hermes Dark 设计系统
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { getLLMConfig, resolveAgentConfig } from '../../../lib/ai/provider'
import { query, run } from '../../../lib/db/repository'
import { generateId } from '../../../lib/db/schema'
import { diagnoseStreaming, followUpStreaming, type StreamPhase } from '../../../lib/xiaobai/diagnose'
import { storeSolution } from '../../../lib/xiaobai/knowledge-base'
import { listAllAgents, AgentDefinition } from '../../../lib/agents/registry'
import { getSoul, renderSoulPrompt } from '../../../lib/agents/soul'
import './XiaoBaiTab.css'

// ─── Types ──────────────────────────────────────────────────

type SourceType = 'local' | 'web' | 'generated'
type ActionType = 'copy' | 'run_terminal' | 'open_url' | 'multi_step'
type SidebarTab = 'history' | 'notes'
type MainView = 'home' | 'result' | 'note'

interface FollowUp {
  question: string
  answer: string
  timestamp: number
}

interface Diagnosis {
  id: string
  problem: string
  solution: string
  source: SourceType
  confidence: number
  actionType: ActionType
  followUps: FollowUp[]
  tags: string[]
  isPinned: boolean
  isFavorite: boolean
  createdAt: string
}

interface CustomNote {
  id: string
  title: string
  content: string
  isPinned: boolean
  isFavorite: boolean
  createdAt: string
  updatedAt: string
}

interface Attachment {
  id: string
  name: string
  type: 'image' | 'file'
  dataUrl?: string
}

// ─── Markdown Renderer (Hermes Dark adapted) ────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let inCodeBlock = false
  let codeBuffer: string[] = []
  let codeKey = 0

  const processInline = (line: string): React.ReactNode => {
    const parts: React.ReactNode[] = []
    const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g
    let lastIndex = 0
    let match: RegExpExecArray | null
    let pk = 0

    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={`t${pk++}`}>{line.slice(lastIndex, match.index)}</span>)
      }
      const token = match[1]
      if (token.startsWith('**') && token.endsWith('**')) {
        parts.push(<strong key={`b${pk++}`}>{token.slice(2, -2)}</strong>)
      } else if (token.startsWith('`') && token.endsWith('`')) {
        parts.push(<code key={`c${pk++}`}>{token.slice(1, -1)}</code>)
      }
      lastIndex = match.index + token.length
    }
    if (lastIndex < line.length) {
      parts.push(<span key={`t${pk++}`}>{line.slice(lastIndex)}</span>)
    }
    return parts.length > 0 ? parts : line
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(<pre key={`code${codeKey++}`}><code>{codeBuffer.join('\n')}</code></pre>)
        codeBuffer = []
        inCodeBlock = false
      } else {
        inCodeBlock = true
      }
      continue
    }
    if (inCodeBlock) { codeBuffer.push(line); continue }

    if (line.startsWith('> ')) {
      elements.push(<blockquote key={i}>{processInline(line.slice(2))}</blockquote>)
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={i}>{processInline(line.slice(3))}</h3>)
    } else if (line.startsWith('### ')) {
      elements.push(<h4 key={i}>{processInline(line.slice(4))}</h4>)
    } else if (line.startsWith('#### ')) {
      elements.push(<h5 key={i}>{processInline(line.slice(5))}</h5>)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={i} style={{ display: 'flex', gap: '6px', margin: '2px 0' }}>
          <span style={{ color: 'var(--hd-text-muted)', flexShrink: 0 }}>•</span>
          <span>{processInline(line.slice(2))}</span>
        </div>
      )
    } else if (/^\d+\.\s/.test(line)) {
      const m = line.match(/^(\d+)\.\s(.*)/)
      if (m) {
        elements.push(
          <div key={i} style={{ display: 'flex', gap: '6px', margin: '2px 0' }}>
            <span style={{ color: 'var(--hd-text-muted)', flexShrink: 0, minWidth: '18px' }}>{m[1]}.</span>
            <span>{processInline(m[2])}</span>
          </div>
        )
      }
    } else if (line.trim() === '' || line.startsWith('---')) {
      elements.push(<div key={i} style={{ height: '8px' }} />)
    } else {
      elements.push(<p key={i} style={{ margin: '3px 0' }}>{processInline(line)}</p>)
    }
  }
  return elements
}

// ─── Main Component ─────────────────────────────────────────

export default function XiaoBaiTab() {
  // LLM config — 直接使用 OpenBasaka 全局共享配置

  // ─── State ──────────────────────────────────────────────
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('history')
  const [mainView, setMainView] = useState<MainView>('home')
  const [searchText, setSearchText] = useState('')

  // Diagnosis
  const [isLoading, setIsLoading] = useState(false)
  const [isFollowUpLoading, setIsFollowUpLoading] = useState(false)
  const [currentDiagnosis, setCurrentDiagnosis] = useState<Diagnosis | null>(null)
  const [history, setHistory] = useState<Diagnosis[]>([])
  const [streamPhase, setStreamPhase] = useState<StreamPhase>('done')
  const [streamContent, setStreamContent] = useState('')

  // Notes
  const [notes, setNotes] = useState<CustomNote[]>([])
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)

  // Attachments
  const [attachments, setAttachments] = useState<Attachment[]>([])

  // Input
  const [problemText, setProblemText] = useState('')

  // Agent 人格
  const [agents, setAgents] = useState<AgentDefinition[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')

  useEffect(() => {
    listAllAgents().then(list => setAgents(list.filter(a => a.isCustom)))
  }, [])

  // Result view
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [copied, setCopied] = useState(false)
  const [rated, setRated] = useState(false)
  const [hoveredStar, setHoveredStar] = useState(0)
  const [followUpText, setFollowUpText] = useState('')
  const [problemExpanded, setProblemExpanded] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Data Loading ────────────────────────────────────────

  useEffect(() => {
    loadHistory()
    loadNotes()
  }, [])

  async function loadHistory() {
    try {
      const rows = await query<{
        id: string; problem: string; solution: string; source: string;
        confidence: number; action_type: string; tags: string;
        followups_json: string; is_pinned: number; is_favorite: number; created_at: string
      }>('SELECT * FROM xiaobai_history ORDER BY is_pinned DESC, created_at DESC LIMIT 50')
      setHistory(rows.map(r => ({
        id: r.id,
        problem: r.problem,
        solution: r.solution,
        source: (r.source || 'generated') as SourceType,
        confidence: r.confidence || 0.5,
        actionType: (r.action_type || 'copy') as ActionType,
        followUps: JSON.parse(r.followups_json || '[]'),
        tags: r.tags ? r.tags.split(',').filter(Boolean) : [],
        isPinned: !!r.is_pinned,
        isFavorite: !!r.is_favorite,
        createdAt: r.created_at,
      })))
    } catch {
      // 表可能不存在
    }
  }

  async function loadNotes() {
    try {
      const rows = await query<{
        id: string; title: string; content: string;
        is_pinned: number; is_favorite: number; created_at: string; updated_at: string
      }>('SELECT * FROM xiaobai_notes ORDER BY is_pinned DESC, updated_at DESC')
      setNotes(rows.map(r => ({
        id: r.id,
        title: r.title,
        content: r.content || '',
        isPinned: !!r.is_pinned,
        isFavorite: !!r.is_favorite,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })))
    } catch {
      // 表可能不存在
    }
  }

  // ─── Diagnosis ───────────────────────────────────────────

  async function handleDiagnose(mode: 'diagnose' | 'analyze' = 'diagnose') {
    if (!problemText.trim() || isLoading) return
    setIsLoading(true)
    setStreamPhase('kb')
    setStreamContent('')
    setRated(false)

    const attachmentData = attachments.map(a => ({
      type: a.type as 'image' | 'file',
      dataUrl: a.dataUrl,
      name: a.name,
    }))

    // Agent 人格：使用 Agent 的 LLM 配置 + Soul 作为诊断人格
    const llmConfig = selectedAgentId ? resolveAgentConfig(selectedAgentId) : getLLMConfig()
    let personaOverride: string | undefined
    if (selectedAgentId) {
      try {
        const soul = await getSoul(selectedAgentId)
        personaOverride = renderSoulPrompt(soul)
      } catch { /* ignore */ }
    }

    diagnoseStreaming(llmConfig, problemText, mode, {
      onPhase: (phase) => setStreamPhase(phase),
      onChunk: (chunk) => setStreamContent(prev => prev + chunk),
      onDone: async (result) => {
        const diagnosis: Diagnosis = {
          id: generateId(),
          problem: result.problem,
          solution: result.solution,
          source: result.source,
          confidence: result.confidence,
          actionType: result.actionType as ActionType,
          followUps: [],
          tags: result.tags || (mode === 'analyze' ? ['🔮 分析'] : []),
          isPinned: false,
          isFavorite: false,
          createdAt: new Date().toISOString(),
        }

        setCurrentDiagnosis(diagnosis)
        setMainView('result')
        setIsLoading(false)
        setStreamPhase('done')
        setAttachments([])
        setProblemText('')

        // 写入历史
        const newHistory = [diagnosis, ...history].slice(0, 50)
        setHistory(newHistory)

        try {
          await run(
            `INSERT INTO xiaobai_history (id, problem, solution, source, confidence, action_type, tags, followups_json, is_pinned, is_favorite)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [diagnosis.id, diagnosis.problem, diagnosis.solution, diagnosis.source, diagnosis.confidence,
             diagnosis.actionType, diagnosis.tags.join(','), '[]', 0, 0]
          )
        } catch { /* ignore */ }
      },
      onError: (err) => {
        const errorDiagnosis: Diagnosis = {
          id: generateId(),
          problem: problemText,
          solution: `诊断失败：\n\n\`\`\`\n${err.message}\n\`\`\`\n\n请检查 API 密钥和网络设置。`,
          source: 'local',
          confidence: 0,
          actionType: 'copy',
          followUps: [],
          tags: [],
          isPinned: false,
          isFavorite: false,
          createdAt: new Date().toISOString(),
        }
        setCurrentDiagnosis(errorDiagnosis)
        setMainView('result')
        setIsLoading(false)
        setStreamPhase('done')
      },
    }, attachmentData, personaOverride)
  }

  // ─── Follow Up ──────────────────────────────────────────

  async function handleFollowUp() {
    if (!followUpText.trim() || !currentDiagnosis || isFollowUpLoading) return
    setIsFollowUpLoading(true)
    const question = followUpText.trim()
    setFollowUpText('')

    followUpStreaming(
      getLLMConfig(),
      currentDiagnosis.problem,
      currentDiagnosis.solution,
      currentDiagnosis.followUps,
      question,
      {
        onPhase: () => {},
        onChunk: () => {},
        onDone: (answer) => {
          const newFollowUp: FollowUp = { question, answer, timestamp: Date.now() }
          const updated = {
            ...currentDiagnosis,
            followUps: [...currentDiagnosis.followUps, newFollowUp],
          }
          setCurrentDiagnosis(updated)
          setIsFollowUpLoading(false)
          // 更新历史
          setHistory(prev => prev.map(h => h.id === updated.id ? updated : h))
          // 更新 DB
          run(
            'UPDATE xiaobai_history SET followups_json = ? WHERE id = ?',
            [JSON.stringify(updated.followUps), updated.id]
          ).catch(() => {})
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
        },
        onError: (err) => {
          const errFollowUp: FollowUp = { question, answer: `追问失败: ${err.message}`, timestamp: Date.now() }
          setCurrentDiagnosis({
            ...currentDiagnosis,
            followUps: [...currentDiagnosis.followUps, errFollowUp],
          })
          setIsFollowUpLoading(false)
        },
      }
    )
  }

  // ─── Rating ──────────────────────────────────────────────

  async function handleRate(rating: number) {
    if (!currentDiagnosis) return
    setRated(true)
    try {
      await storeSolution({
        problem: currentDiagnosis.problem,
        solution: currentDiagnosis.solution,
        source: currentDiagnosis.source,
        confidence: currentDiagnosis.confidence,
        actionType: currentDiagnosis.actionType,
        rating,
        tags: currentDiagnosis.tags,
      })
    } catch { /* ignore */ }
  }

  // ─── Notes CRUD ──────────────────────────────────────────

  function createNote() {
    const newNote: CustomNote = {
      id: generateId(),
      title: '新笔记',
      content: '',
      isPinned: false,
      isFavorite: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setNotes(prev => [newNote, ...prev])
    setActiveNoteId(newNote.id)
    setMainView('note')
    setSidebarTab('notes')
    setCurrentDiagnosis(null)

    run(
      `INSERT INTO xiaobai_notes (id, title, content, is_pinned, is_favorite)
       VALUES (?, ?, ?, ?, ?)`,
      [newNote.id, newNote.title, '', 0, 0]
    ).catch(() => {})
  }

  const updateNoteDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  function updateNote(id: string, title: string, content: string) {
    setNotes(prev => prev.map(n => n.id === id
      ? { ...n, title, content, updatedAt: new Date().toISOString() }
      : n
    ))
    if (updateNoteDebounce.current) clearTimeout(updateNoteDebounce.current)
    updateNoteDebounce.current = setTimeout(() => {
      run(
        'UPDATE xiaobai_notes SET title = ?, content = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?',
        [title, content, id]
      ).catch(() => {})
    }, 500)
  }

  function deleteNote(id: string) {
    setNotes(prev => prev.filter(n => n.id !== id))
    if (activeNoteId === id) {
      setActiveNoteId(null)
      setMainView('home')
    }
    run('DELETE FROM xiaobai_notes WHERE id = ?', [id]).catch(() => {})
  }

  // ─── History actions ─────────────────────────────────────

  function selectHistory(diag: Diagnosis) {
    setCurrentDiagnosis(diag)
    setMainView('result')
    setActiveNoteId(null)
    setRated(false)
    setIsEditing(false)
  }

  function deleteHistory(id: string) {
    setHistory(prev => prev.filter(h => h.id !== id))
    if (currentDiagnosis?.id === id) {
      setCurrentDiagnosis(null)
      setMainView('home')
    }
    run('DELETE FROM xiaobai_history WHERE id = ?', [id]).catch(() => {})
  }

  function toggleHistoryPin(id: string) {
    setHistory(prev => prev.map(h => h.id === id ? { ...h, isPinned: !h.isPinned } : h))
    const item = history.find(h => h.id === id)
    if (item) {
      run('UPDATE xiaobai_history SET is_pinned = ? WHERE id = ?', [item.isPinned ? 0 : 1, id]).catch(() => {})
    }
  }

  function toggleHistoryFavorite(id: string) {
    setHistory(prev => prev.map(h => h.id === id ? { ...h, isFavorite: !h.isFavorite } : h))
    const item = history.find(h => h.id === id)
    if (item) {
      run('UPDATE xiaobai_history SET is_favorite = ? WHERE id = ?', [item.isFavorite ? 0 : 1, id]).catch(() => {})
    }
  }

  // ─── Note actions ────────────────────────────────────────

  function selectNote(note: CustomNote) {
    setActiveNoteId(note.id)
    setMainView('note')
    setCurrentDiagnosis(null)
  }

  function toggleNotePin(id: string) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, isPinned: !n.isPinned } : n))
    const item = notes.find(n => n.id === id)
    if (item) {
      run('UPDATE xiaobai_notes SET is_pinned = ? WHERE id = ?', [item.isPinned ? 0 : 1, id]).catch(() => {})
    }
  }

  function toggleNoteFavorite(id: string) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, isFavorite: !n.isFavorite } : n))
    const item = notes.find(n => n.id === id)
    if (item) {
      run('UPDATE xiaobai_notes SET is_favorite = ? WHERE id = ?', [item.isFavorite ? 0 : 1, id]).catch(() => {})
    }
  }

  // ─── Attachments ─────────────────────────────────────────

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      const att: Attachment = {
        id: generateId(),
        name: file.name,
        type: file.type.startsWith('image/') ? 'image' : 'file',
      }
      // 读取为 base64（用于多模态 LLM）
      const reader = new FileReader()
      reader.onload = () => {
        att.dataUrl = reader.result as string
        setAttachments(prev => [...prev, att])
      }
      reader.readAsDataURL(file)
    }
    e.target.value = '' // 重置 input
  }

  // ─── Copy ────────────────────────────────────────────────

  async function handleCopy() {
    if (!currentDiagnosis) return
    try {
      await navigator.clipboard.writeText(currentDiagnosis.solution)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  // ─── Edit ────────────────────────────────────────────────

  function handleSaveEdit() {
    if (!currentDiagnosis) return
    const updated = { ...currentDiagnosis, solution: editText }
    setCurrentDiagnosis(updated)
    setHistory(prev => prev.map(h => h.id === updated.id ? updated : h))
    setIsEditing(false)
    run('UPDATE xiaobai_history SET solution = ? WHERE id = ?', [editText, updated.id]).catch(() => {})
  }

  // ─── Filtering ───────────────────────────────────────────

  const filteredHistory = useMemo(() => {
    if (!searchText.trim()) return history
    const kw = searchText.toLowerCase()
    return history.filter(h =>
      h.problem.toLowerCase().includes(kw) || h.solution.toLowerCase().includes(kw)
    )
  }, [history, searchText])

  const filteredNotes = useMemo(() => {
    if (!searchText.trim()) return notes
    const kw = searchText.toLowerCase()
    return notes.filter(n =>
      n.title.toLowerCase().includes(kw) || n.content.toLowerCase().includes(kw)
    )
  }, [notes, searchText])

  const activeNote = useMemo(() =>
    notes.find(n => n.id === activeNoteId),
    [notes, activeNoteId]
  )

  // ─── Back to home ────────────────────────────────────────

  function goHome() {
    setMainView('home')
    setCurrentDiagnosis(null)
    setActiveNoteId(null)
    setIsEditing(false)
  }

  // ─── Render ──────────────────────────────────────────────

  return (
    <div className="xiaobai-tab" style={{ position: 'relative' }}>
      {/* 隐藏文件 input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.txt,.md,.json,.csv,.doc,.docx"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {/* ─── 左面板 ─── */}
      <div className="xiaobai-tab__left">
        <div className="xiaobai-tab__left-tabs">
          <button
            className={`xiaobai-tab__left-tab ${sidebarTab === 'history' ? 'xiaobai-tab__left-tab--active' : ''}`}
            onClick={() => setSidebarTab('history')}
          >
            📋 历史
          </button>
          <button
            className={`xiaobai-tab__left-tab ${sidebarTab === 'notes' ? 'xiaobai-tab__left-tab--active' : ''}`}
            onClick={() => setSidebarTab('notes')}
          >
            📝 笔记
          </button>
        </div>

        {/* 搜索 */}
        <div className="xiaobai-tab__search">
          <input
            className="xiaobai-tab__search-input"
            placeholder={sidebarTab === 'history' ? '搜索历史...' : '搜索笔记...'}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
        </div>

        {/* 笔记新建按钮 */}
        {sidebarTab === 'notes' && (
          <button className="xiaobai-tab__new-note-btn" onClick={createNote}>
            + 新建笔记
          </button>
        )}

        {/* 列表 */}
        <div className="xiaobai-tab__list">
          {sidebarTab === 'history' && (
            filteredHistory.length === 0 ? (
              <div className="xiaobai-tab__list-empty">暂无诊断历史</div>
            ) : filteredHistory.map(diag => (
              <div
                key={diag.id}
                className={`xiaobai-tab__list-item ${currentDiagnosis?.id === diag.id ? 'xiaobai-tab__list-item--active' : ''}`}
                onClick={() => selectHistory(diag)}
              >
                <div className="xiaobai-tab__list-item-title">
                  {diag.isPinned && '📌 '}{diag.problem.slice(0, 60)}
                </div>
                <div className="xiaobai-tab__list-item-preview">
                  {diag.solution.slice(0, 80)}
                </div>
                <div className="xiaobai-tab__list-item-time">{diag.createdAt?.slice(0, 16)}</div>
                <div className="xiaobai-tab__list-item-actions">
                  <button
                    className={`xiaobai-tab__list-action-btn ${diag.isPinned ? 'xiaobai-tab__list-action-btn--active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); toggleHistoryPin(diag.id) }}
                    title="置顶"
                  >📌</button>
                  <button
                    className={`xiaobai-tab__list-action-btn ${diag.isFavorite ? 'xiaobai-tab__list-action-btn--active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); toggleHistoryFavorite(diag.id) }}
                    title="收藏"
                  >⭐</button>
                  <button
                    className="xiaobai-tab__list-action-btn"
                    onClick={(e) => { e.stopPropagation(); deleteHistory(diag.id) }}
                    title="删除"
                  >🗑️</button>
                </div>
              </div>
            ))
          )}

          {sidebarTab === 'notes' && (
            filteredNotes.length === 0 ? (
              <div className="xiaobai-tab__list-empty">暂无笔记</div>
            ) : filteredNotes.map(note => (
              <div
                key={note.id}
                className={`xiaobai-tab__list-item ${activeNoteId === note.id ? 'xiaobai-tab__list-item--active' : ''}`}
                onClick={() => selectNote(note)}
              >
                <div className="xiaobai-tab__list-item-title">
                  {note.isPinned && '📌 '}{note.title}
                </div>
                <div className="xiaobai-tab__list-item-preview">
                  {note.content.slice(0, 80) || '空笔记'}
                </div>
                <div className="xiaobai-tab__list-item-time">{note.updatedAt?.slice(0, 16)}</div>
                <div className="xiaobai-tab__list-item-actions">
                  <button
                    className={`xiaobai-tab__list-action-btn ${note.isPinned ? 'xiaobai-tab__list-action-btn--active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); toggleNotePin(note.id) }}
                    title="置顶"
                  >📌</button>
                  <button
                    className={`xiaobai-tab__list-action-btn ${note.isFavorite ? 'xiaobai-tab__list-action-btn--active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); toggleNoteFavorite(note.id) }}
                    title="收藏"
                  >⭐</button>
                  <button
                    className="xiaobai-tab__list-action-btn"
                    onClick={(e) => { e.stopPropagation(); deleteNote(note.id) }}
                    title="删除"
                  >🗑️</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ─── 右面板 ─── */}
      <div className="xiaobai-tab__right">
        {/* 首页视图 */}
        {mainView === 'home' && (
          <div className="xiaobai-tab__home">
            <div className="xiaobai-tab__home-icon">🔮</div>
            <div className="xiaobai-tab__home-title">小白小白</div>
            <div className="xiaobai-tab__home-subtitle">
              描述你的问题，我来诊断并给出解决方案
            </div>
            <div className="xiaobai-tab__input-area">
              <textarea
                className="xiaobai-tab__textarea"
                placeholder="描述你遇到的问题..."
                value={problemText}
                onChange={e => setProblemText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    handleDiagnose()
                  }
                }}
              />

              {/* 附件标签 */}
              {attachments.length > 0 && (
                <div className="xiaobai-tab__attachments">
                  {attachments.map(att => (
                    <div key={att.id} className="xiaobai-tab__attachment-tag">
                      {att.type === 'image' ? '🖼️' : '📎'} {att.name}
                      <button
                        className="xiaobai-tab__attachment-remove"
                        onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))}
                      >×</button>
                    </div>
                  ))}
                </div>
              )}

              {/* 工具栏 */}
              <div className="xiaobai-tab__toolbar">
                <div className="xiaobai-tab__toolbar-left">
                  <button
                    className="xiaobai-tab__file-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    📎 附件
                  </button>
                  {agents.length > 0 && (
                    <select
                      style={{
                        fontSize: '0.72rem',
                        background: 'var(--hd-bg-deep)',
                        color: 'var(--hd-text-secondary)',
                        border: '1px solid var(--hd-border)',
                        borderRadius: 'var(--hd-radius-sm)',
                        padding: '4px 8px',
                        cursor: 'pointer',
                      }}
                      value={selectedAgentId}
                      onChange={e => setSelectedAgentId(e.target.value)}
                    >
                      <option value="">🔮 小白</option>
                      {agents.map(a => (
                        <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="xiaobai-tab__toolbar-right">
                  <button
                    className="xiaobai-tab__action-btn xiaobai-tab__action-btn--secondary"
                    disabled={!problemText.trim() || isLoading}
                    onClick={() => handleDiagnose('analyze')}
                  >
                    🔮 分析
                  </button>
                  <button
                    className="xiaobai-tab__action-btn"
                    disabled={!problemText.trim() || isLoading}
                    onClick={() => handleDiagnose('diagnose')}
                  >
                    🩺 诊断
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 诊断结果视图 */}
        {mainView === 'result' && currentDiagnosis && (
          <div className="xiaobai-tab__result">
            {/* Header */}
            <div className="xiaobai-tab__result-header">
              <div className="xiaobai-tab__result-badges">
                <button className="xiaobai-tab__back-btn" onClick={goHome}>← 新诊断</button>
                <span className="xiaobai-tab__badge xiaobai-tab__badge--source">
                  {currentDiagnosis.source === 'local' ? '📚 知识库' : '🤖 AI'}
                </span>
                <span className="xiaobai-tab__badge xiaobai-tab__badge--confidence">
                  {(currentDiagnosis.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="xiaobai-tab__result-actions">
                <button
                  className={`xiaobai-tab__icon-btn ${isEditing ? 'xiaobai-tab__icon-btn--active' : ''}`}
                  onClick={() => {
                    if (isEditing) { handleSaveEdit() }
                    else { setIsEditing(true); setEditText(currentDiagnosis.solution) }
                  }}
                >
                  {isEditing ? '✅ 保存' : '✏️ 编辑'}
                </button>
                <button className="xiaobai-tab__icon-btn" onClick={handleCopy}>
                  {copied ? '✅ 已复制' : '📋 复制'}
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="xiaobai-tab__result-body">
              {/* 原始问题 */}
              <div
                className="xiaobai-tab__problem-box"
                onClick={() => setProblemExpanded(!problemExpanded)}
              >
                <div className="xiaobai-tab__problem-label">❓ 原始问题</div>
                <div className={`xiaobai-tab__problem-text ${!problemExpanded && currentDiagnosis.problem.length > 200 ? 'xiaobai-tab__problem-text--truncated' : ''}`}>
                  {currentDiagnosis.problem}
                </div>
              </div>

              {/* Solution */}
              {isEditing ? (
                <textarea
                  className="xiaobai-tab__edit-textarea"
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                />
              ) : (
                <div className="xiaobai-tab__solution">
                  {renderMarkdown(currentDiagnosis.solution)}
                </div>
              )}

              {/* Follow-ups */}
              {currentDiagnosis.followUps.length > 0 && (
                <div className="xiaobai-tab__followups">
                  {currentDiagnosis.followUps.map((fu, i) => (
                    <div key={i}>
                      <div className="xiaobai-tab__followup-user">
                        <div className="xiaobai-tab__followup-user-bubble">{fu.question}</div>
                      </div>
                      <div className="xiaobai-tab__followup-ai">
                        <div className="xiaobai-tab__followup-ai-bubble">
                          {renderMarkdown(fu.answer)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Footer: Follow-up + Rating */}
            <div className="xiaobai-tab__result-footer">
              <div className="xiaobai-tab__followup-input">
                <input
                  className="xiaobai-tab__followup-field"
                  placeholder="继续追问..."
                  value={followUpText}
                  onChange={e => setFollowUpText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      handleFollowUp()
                    }
                  }}
                  disabled={isFollowUpLoading}
                />
                <button
                  className="xiaobai-tab__followup-send"
                  onClick={handleFollowUp}
                  disabled={!followUpText.trim() || isFollowUpLoading}
                >
                  {isFollowUpLoading ? '⏳' : '💬 追问'}
                </button>
              </div>

              {rated ? (
                <div className="xiaobai-tab__rating-done">✅ 感谢反馈！方案已存入知识库</div>
              ) : (
                <div className="xiaobai-tab__rating">
                  <div className="xiaobai-tab__rating-stars">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        className={`xiaobai-tab__star ${star <= hoveredStar ? 'xiaobai-tab__star--active' : ''}`}
                        onClick={() => handleRate(star)}
                        onMouseEnter={() => setHoveredStar(star)}
                        onMouseLeave={() => setHoveredStar(0)}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <span className="xiaobai-tab__rating-label">方案有帮助吗?</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 笔记编辑视图 */}
        {mainView === 'note' && activeNote && (
          <div className="xiaobai-tab__note-editor">
            <input
              className="xiaobai-tab__note-title-input"
              value={activeNote.title}
              onChange={e => updateNote(activeNote.id, e.target.value, activeNote.content)}
              placeholder="笔记标题..."
            />
            <textarea
              className="xiaobai-tab__note-content"
              value={activeNote.content}
              onChange={e => updateNote(activeNote.id, activeNote.title, e.target.value)}
              placeholder="开始写笔记..."
            />
          </div>
        )}
      </div>

      {/* ─── 流式进度遮罩 ─── */}
      {isLoading && (
        <div className="xiaobai-tab__stream-overlay">
          <div className="xiaobai-tab__stream-spinner" />
          <div className="xiaobai-tab__stream-phase">
            {streamPhase === 'kb' && '🔍 搜索知识库...'}
            {streamPhase === 'ai' && '🤖 AI 正在思考...'}
            {streamPhase === 'done' && '✅ 完成'}
            {streamPhase === 'error' && '❌ 出错'}
          </div>
          {streamContent && (
            <div className="xiaobai-tab__stream-content">
              {streamContent.slice(-500)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
