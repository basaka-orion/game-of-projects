import { useEffect, useMemo, useState } from 'react'
import { generateFlashCreation, generateFlashNextQuestion, optimizeFlashIdea } from '../../../../lib/flash-of-genius/ai'
import {
  FLASH_CREATION_TYPES,
  createFlashMessage,
  createMemoFromOptimization,
  formatFlashDate,
  getMemoProgress,
  getMemoQuestionCount,
  loadFlashState,
  saveFlashState,
} from '../../../../lib/flash-of-genius/state'
import type { FlashCreationType, FlashMacState, FlashMemo, FlashMemoCreationType } from '../../../../lib/flash-of-genius/types'
import { recordOpenbasakaOperationQuietly } from '../../../../lib/openbasaka/operation-history'
import './FlashOfGeniusMacApp.css'

type FlashStage = 'capture' | 'deep' | 'generate' | 'library'
type ProcessingState = 'idle' | 'optimizing' | 'questioning' | 'generating'
type PrdTab = 'requirements' | 'design' | 'tasks'

const stages: Array<[FlashStage, string, string]> = [
  ['capture', 'CAPTURE', '原始灵感捕捉'],
  ['deep', 'DEEP DIVE', '五轮追问'],
  ['generate', 'GENERATE', '作品生成'],
  ['library', 'LIBRARY', '产物库'],
]

const memoTypes: FlashMemoCreationType[] = ['普通备忘录', '文章', '视频脚本', '小红书帖子', '应用PRD']

function patchMemo(state: FlashMacState, memoId: string, updater: (memo: FlashMemo) => FlashMemo): FlashMacState {
  return {
    ...state,
    memos: state.memos.map((memo) => (memo.id === memoId ? updater(memo) : memo)),
  }
}

function copyText(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {})
}

export default function FlashOfGeniusMacApp() {
  const [state, setState] = useState<FlashMacState>(() => loadFlashState())
  const [stage, setStage] = useState<FlashStage>('capture')
  const [processing, setProcessing] = useState<ProcessingState>('idle')
  const [rawText, setRawText] = useState('我想把一个模糊的 App 点子，变成可以直接交给 Codex 实现的 PRD、设计稿和任务清单。')
  const [creationType, setCreationType] = useState<FlashMemoCreationType>('普通备忘录')
  const [searchText, setSearchText] = useState('')
  const [answerText, setAnswerText] = useState('')
  const [selectedCreationType, setSelectedCreationType] = useState<FlashCreationType>('文章')
  const [prdTab, setPrdTab] = useState<PrdTab>('requirements')
  const [toast, setToast] = useState('')

  useEffect(() => {
    saveFlashState(state)
  }, [state])

  const sortedMemos = useMemo(() => {
    const term = searchText.trim().toLowerCase()
    return [...state.memos]
      .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || b.createdAt - a.createdAt)
      .filter((memo) => {
        if (!term) return true
        return `${memo.title} ${memo.originalText} ${memo.optimizedContent}`.toLowerCase().includes(term)
      })
  }, [searchText, state.memos])

  const activeMemo = useMemo(
    () => state.memos.find((memo) => memo.id === state.activeMemoId) || state.memos[0] || null,
    [state.activeMemoId, state.memos],
  )

  const activeCreation = useMemo(() => {
    if (!activeMemo) return null
    return activeMemo.creations.find((item) => item.id === state.activeCreationId) || activeMemo.creations[0] || null
  }, [activeMemo, state.activeCreationId])

  function selectMemo(memo: FlashMemo, targetStage: FlashStage = stage) {
    setState((current) => ({
      ...current,
      activeMemoId: memo.id,
      activeCreationId: memo.creations[0]?.id || null,
    }))
    setStage(targetStage)
  }

  async function captureIdea() {
    if (!rawText.trim() || processing !== 'idle') return
    setProcessing('optimizing')
    try {
      const result = await optimizeFlashIdea(rawText)
      const memo = createMemoFromOptimization({
        ...result,
        creationType: creationType === '普通备忘录' ? result.creationType : creationType,
        originalText: rawText,
      })
      setState((current) => ({
        ...current,
        memos: [memo, ...current.memos],
        activeMemoId: memo.id,
        activeCreationId: null,
      }))
      setRawText('')
      setStage('deep')
      setToast('灵感已优化并进入五轮追问')
      recordOpenbasakaOperationQuietly({
        moduleId: 'flash-of-genius',
        moduleName: '灵犀一念',
        action: '捕捉灵感',
        summary: `捕捉并优化灵感：${memo.title}`,
        toolRefs: ['flash-of-genius', 'operating_events'],
        entities: [memo.id, memo.creationType],
      })
    } finally {
      setProcessing('idle')
    }
  }

  async function submitDeepAnswer() {
    if (!activeMemo || !answerText.trim() || processing !== 'idle') return
    setProcessing('questioning')
    const answer = answerText.trim()
    setAnswerText('')
    try {
      const userMessage = createFlashMessage('user', answer)
      const nextQuestion = await generateFlashNextQuestion(activeMemo, answer)
      setState((current) =>
        patchMemo(current, activeMemo.id, (memo) => ({
          ...memo,
          chatHistory: nextQuestion
            ? [...memo.chatHistory, userMessage, createFlashMessage('ai', nextQuestion)]
            : [...memo.chatHistory, userMessage],
        })),
      )
      recordOpenbasakaOperationQuietly({
        moduleId: 'flash-of-genius',
        moduleName: '灵犀一念',
        action: '五轮追问',
        summary: `回答 ${activeMemo.title} 的深挖问题，当前进度 ${Math.min(5, getMemoQuestionCount(activeMemo) + 1)}/5。`,
        toolRefs: ['flash-of-genius', 'operating_events'],
        entities: [activeMemo.id],
      })
    } finally {
      setProcessing('idle')
    }
  }

  async function generateCreation() {
    if (!activeMemo || processing !== 'idle') return
    setProcessing('generating')
    try {
      const result = await generateFlashCreation(activeMemo, selectedCreationType)
      const creation = {
        id: `creation_${Date.now().toString(36)}`,
        type: result.type,
        content: result.content,
        createdAt: Date.now(),
        generationTimeMs: result.generationTimeMs,
      }
      setState((current) =>
        patchMemo(
          {
            ...current,
            activeCreationId: creation.id,
          },
          activeMemo.id,
          (memo) => ({
            ...memo,
            requirementsDoc: result.prdDocuments?.requirementsDoc || memo.requirementsDoc,
            designDoc: result.prdDocuments?.designDoc || memo.designDoc,
            taskListDoc: result.prdDocuments?.taskListDoc || memo.taskListDoc,
            creations: [creation, ...memo.creations],
          }),
        ),
      )
      setStage('library')
      setToast('作品已生成并写入产物库')
      recordOpenbasakaOperationQuietly({
        moduleId: 'flash-of-genius',
        moduleName: '灵犀一念',
        action: '生成作品',
        summary: `从 ${activeMemo.title} 生成 ${selectedCreationType}。`,
        toolRefs: ['flash-of-genius', 'operating_events'],
        entities: [activeMemo.id, selectedCreationType],
      })
    } finally {
      setProcessing('idle')
    }
  }

  function renderRail() {
    return (
      <aside className="flash-mac__rail">
        <div className="flash-mac__brand">
          <div className="flash-mac__brand-mark">✦</div>
          <div>
            <div className="flash-mac__brand-title">灵犀一念</div>
            <div className="flash-mac__brand-sub">FLASH OF GENIUS</div>
          </div>
        </div>
        <div className="flash-mac__stage-list">
          {stages.map(([id, label, desc]) => (
            <button
              key={id}
              className={stage === id ? 'flash-mac__stage--active' : ''}
              onClick={() => setStage(id)}
            >
              <span>{label}</span>
              <small>{desc}</small>
            </button>
          ))}
        </div>
        <div className="flash-mac__search">
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="SEARCH MEMO"
          />
        </div>
        <div className="flash-mac__memo-list">
          {sortedMemos.length === 0 ? (
            <div className="flash-mac__memo-empty">
              <strong>0</strong>
              <span>暂无灵感</span>
              <button onClick={() => setStage('capture')}>立即捕捉</button>
            </div>
          ) : (
            sortedMemos.map((memo, index) => (
              <button
                key={memo.id}
                className={`flash-memo-card ${activeMemo?.id === memo.id ? 'flash-memo-card--active' : ''}`}
                onClick={() => selectMemo(memo, 'deep')}
              >
                <span className="flash-memo-card__index">{String(index + 1).padStart(2, '0')}</span>
                <span className="flash-memo-card__body">
                  <span className="flash-memo-card__title">{memo.title}</span>
                  <span className="flash-memo-card__meta">
                    <span>{memo.creationType}</span>
                    <span>{formatFlashDate(memo.createdAt)}</span>
                  </span>
                  <span className="flash-memo-card__progress"><i style={{ width: `${getMemoProgress(memo)}%` }} /></span>
                </span>
                <span className="flash-memo-card__fav">{memo.isFavorite ? 'FAV' : 'IDEA'}</span>
              </button>
            ))
          )}
        </div>
      </aside>
    )
  }

  function renderTop() {
    return (
      <header className="flash-mac__top">
        <div>
          <span className="flash-mac__eyebrow">XIAOBAI CREATION WORKBENCH</span>
          <h2>{activeMemo ? activeMemo.title : '把一念变成作品'}</h2>
          <p>快速捕捉、AI 打磨、五轮追问，再生成文章、视频脚本、小红书帖子或 App PRD。</p>
        </div>
        <div className="flash-mac__status-grid">
          <div><span>MEMOS</span><strong>{state.memos.length}</strong></div>
          <div><span>WORKS</span><strong>{state.memos.reduce((sum, memo) => sum + memo.creations.length, 0)}</strong></div>
          <div><span>MODE</span><strong>{processing === 'idle' ? 'READY' : processing.toUpperCase()}</strong></div>
        </div>
      </header>
    )
  }

  function renderCapture() {
    return (
      <div className="flash-capture">
        <section className="flash-capture__input-panel">
          <div className="flash-section-head">
            <span>RAW SIGNAL</span>
            <div className="flash-toggle">
              {memoTypes.map((type) => (
                <button
                  key={type}
                  className={creationType === type ? 'flash-toggle--active' : ''}
                  onClick={() => setCreationType(type)}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          <textarea
            className="flash-capture__textarea"
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            placeholder="把刚冒出来的想法直接扔进来，不需要整理..."
          />
          <div className="flash-capture__footer">
            <button className="flash-secondary-btn" onClick={() => setRawText('')}>
              CLEAR
            </button>
            <button className="flash-primary-btn" onClick={captureIdea} disabled={!rawText.trim() || processing !== 'idle'}>
              OPTIMIZE
            </button>
          </div>
        </section>
        <section className="flash-capture__side-panel">
          <div className="flash-recorder">
            <div className={`flash-recorder__signal ${processing !== 'idle' ? 'flash-recorder__signal--active' : ''}`}>
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="flash-recorder__status">{processing === 'idle' ? 'RECORDER READY' : 'AI IS SHAPING THE IDEA'}</div>
            <textarea readOnly value={'捕捉原文 -> 打磨标题与内容 -> 生成第一道深挖问题 -> 存入本地灵感库'} />
            <div className="flash-terminal">
              <span>FLOW</span>
              <strong>原始灵感不再消失</strong>
              <p>这里保留第一冲动，同时把它转成可继续追问、可生成作品、可归档复用的结构。</p>
            </div>
          </div>
        </section>
      </div>
    )
  }

  function renderDeep() {
    if (!activeMemo) return <div className="flash-empty-workbench"><strong>+</strong><h3>先捕捉一个灵感</h3><p>灵犀一念会自动生成第一道问题，再推进五轮深挖。</p></div>
    const questionCount = getMemoQuestionCount(activeMemo)
    return (
      <div className="flash-deep">
        <section className="flash-deep__memo">
          <div className="flash-section-head">
            <span>MEMO DETAIL</span>
            <div className="flash-inline-actions">
              <button onClick={() => copyText(activeMemo.optimizedContent)}>COPY</button>
              <button
                onClick={() =>
                  setState((current) =>
                    patchMemo(current, activeMemo.id, (memo) => ({ ...memo, isFavorite: !memo.isFavorite })),
                  )
                }
              >
                {activeMemo.isFavorite ? 'UNFAV' : 'FAV'}
              </button>
            </div>
          </div>
          <div className="flash-memo-detail">
            <div>
              <span className="flash-memo-detail__type">{activeMemo.creationType}</span>
              <h3>{activeMemo.title}</h3>
              <p>{activeMemo.optimizedContent}</p>
              <div className="flash-memo-detail__raw">
                <span>ORIGINAL</span>
                <small>{activeMemo.originalText}</small>
              </div>
              <div className="flash-memo-detail__flags">
                <span>{questionCount}/5 QUESTIONS</span>
                <span>{activeMemo.creations.length} WORKS</span>
              </div>
            </div>
            <div className="flash-signal">
              <div className="flash-signal__grid">
                {Array.from({ length: 25 }).map((_, index) => <i key={index} />)}
              </div>
              <div className="flash-signal__label"><span>IDEA SIGNAL</span><strong>{getMemoProgress(activeMemo)}%</strong></div>
            </div>
          </div>
        </section>
        <section className="flash-deep__chat">
          <div className="flash-section-head">
            <span>FIVE ROUND DIVE</span>
            <strong>{questionCount >= 5 ? 'READY TO GENERATE' : `${questionCount}/5`}</strong>
          </div>
          <div className="flash-chat-log">
            {activeMemo.chatHistory.map((message) => (
              <div key={message.id} className={`flash-chat-message flash-chat-message--${message.role}`}>
                <span>{message.role === 'ai' ? 'AI QUESTION' : 'BOSS ANSWER'}</span>
                <p>{message.content}</p>
              </div>
            ))}
            {questionCount >= 5 && (
              <div className="flash-chat-complete">
                <strong>深挖完成</strong>
                <span>现在可以进入生成台，把这条灵感转成具体作品。</span>
              </div>
            )}
          </div>
          <div className="flash-chat-input">
            <input
              value={answerText}
              onChange={(event) => setAnswerText(event.target.value)}
              placeholder="回答这一轮问题..."
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitDeepAnswer()
              }}
              disabled={processing !== 'idle' || questionCount >= 5}
            />
            <button onClick={submitDeepAnswer} disabled={!answerText.trim() || processing !== 'idle' || questionCount >= 5}>
              SEND
            </button>
          </div>
        </section>
      </div>
    )
  }

  function renderGenerate() {
    if (!activeMemo) return <div className="flash-empty-workbench"><strong>∅</strong><h3>没有可生成的灵感</h3><p>先进入 Capture 捕捉一个原始想法。</p></div>
    return (
      <div className="flash-generate">
        <section className="flash-generate__types">
          <div className="flash-section-head">
            <span>OUTPUT TYPE</span>
            <strong>{activeMemo.title}</strong>
          </div>
          <div className="flash-type-grid">
            {FLASH_CREATION_TYPES.map((meta) => (
              <button
                key={meta.type}
                className={selectedCreationType === meta.type ? 'flash-type-card--active' : ''}
                onClick={() => setSelectedCreationType(meta.type)}
              >
                <span>{meta.code}</span>
                <strong>{meta.type}</strong>
                <small>{meta.description}</small>
              </button>
            ))}
          </div>
          <button className="flash-primary-btn" onClick={generateCreation} disabled={processing !== 'idle'}>
            GENERATE {selectedCreationType}
          </button>
        </section>
        <section className="flash-generate__preview">
          <div className="flash-section-head">
            <span>GENERATION CONTEXT</span>
            <button onClick={() => copyText(activeMemo.optimizedContent)}>COPY CONTEXT</button>
          </div>
          <pre>{`标题：${activeMemo.title}
类型：${activeMemo.creationType}
深挖进度：${getMemoQuestionCount(activeMemo)}/5

${activeMemo.optimizedContent}

${activeMemo.chatHistory.map((message) => `${message.role === 'ai' ? 'AI' : 'Boss'}：${message.content}`).join('\n\n')}`}</pre>
        </section>
      </div>
    )
  }

  function renderLibrary() {
    const prdContent =
      prdTab === 'requirements'
        ? activeMemo?.requirementsDoc
        : prdTab === 'design'
          ? activeMemo?.designDoc
          : activeMemo?.taskListDoc
    return (
      <div className="flash-library">
        <section className="flash-library__works">
          <div className="flash-section-head">
            <span>WORKS</span>
            <button onClick={() => setStage('generate')}>NEW</button>
          </div>
          {activeMemo?.creations.length ? (
            activeMemo.creations.map((creation, index) => (
              <button
                key={creation.id}
                className={`flash-work-card ${activeCreation?.id === creation.id ? 'flash-work-card--active' : ''}`}
                onClick={() => setState((current) => ({ ...current, activeCreationId: creation.id }))}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{creation.type}</strong>
                  <small>{formatFlashDate(creation.createdAt)}</small>
                  <p>{creation.content.slice(0, 110)}...</p>
                </div>
              </button>
            ))
          ) : (
            <div className="flash-library__empty">当前灵感还没有生成作品。</div>
          )}
        </section>
        <section className="flash-library__result">
          <div className="flash-section-head">
            <span>OUTPUT</span>
            {activeCreation && <button onClick={() => copyText(activeCreation.content)}>COPY</button>}
          </div>
          {activeCreation ? <pre>{activeCreation.content}</pre> : <div className="flash-library__empty">选择一个作品查看内容。</div>}
        </section>
        <section className="flash-library__prd">
          <div className="flash-prd-tabs">
            <button className={prdTab === 'requirements' ? 'flash-prd-tabs--active' : ''} onClick={() => setPrdTab('requirements')}>
              Requirements
            </button>
            <button className={prdTab === 'design' ? 'flash-prd-tabs--active' : ''} onClick={() => setPrdTab('design')}>
              Design
            </button>
            <button className={prdTab === 'tasks' ? 'flash-prd-tabs--active' : ''} onClick={() => setPrdTab('tasks')}>
              Task List
            </button>
          </div>
          {prdContent ? <pre>{prdContent}</pre> : <div className="flash-library__empty">生成“应用PRD”后，这里显示三文档。</div>}
        </section>
      </div>
    )
  }

  return (
    <div className="flash-mac">
      {renderRail()}
      <main className="flash-mac__main">
        {renderTop()}
        {stage === 'capture' && renderCapture()}
        {stage === 'deep' && renderDeep()}
        {stage === 'generate' && renderGenerate()}
        {stage === 'library' && renderLibrary()}
      </main>
      {processing !== 'idle' && (
        <div className="flash-loading">
          <div className="flash-loading__box">
            <span>{processing.toUpperCase()}</span>
            <div className="flash-loading__bar" />
          </div>
        </div>
      )}
      {toast && <div className="flash-toast" onAnimationEnd={() => setToast('')}>{toast}</div>}
    </div>
  )
}
