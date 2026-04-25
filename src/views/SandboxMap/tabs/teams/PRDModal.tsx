/**
 * PRDModal — PRD 生成模态框
 *
 * 从 TeamsTab 提取，负责：
 * - 5 个关键问题收集
 * - PRD 生成进度
 * - 章节折叠展示
 * - Markdown 导出
 */
import React, { useState, useCallback } from 'react'
import { generatePRD, exportPRDAsMarkdown, PRDResult } from '../../../../lib/prd/generator'
import { PRD_QUESTIONS, PRDAnswers } from '../../../../lib/prd/questions'

interface PRDModalProps {
  onClose: () => void
}

export default function PRDModal({ onClose }: PRDModalProps) {
  const [answers, setAnswers] = useState<PRDAnswers>({})
  const [result, setResult] = useState<PRDResult | null>(null)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState('')
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set())

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    setResult(null)
    setProgress('准备中...')
    try {
      const r = await generatePRD(answers, (msg) => setProgress(msg))
      setResult(r)
      setExpandedChapters(new Set(r.chapters.map(c => c.id)))
    } catch (err) {
      setProgress(`生成失败: ${(err as Error).message}`)
    }
    setGenerating(false)
  }, [answers])

  const handleDownload = useCallback(() => {
    if (!result) return
    const md = exportPRDAsMarkdown(result)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${result.projectTitle}_PRD.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [result])

  const toggleChapter = (id: number) => {
    setExpandedChapters(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="teams-tab__modal-overlay" onClick={onClose}>
      <div className="teams-tab__modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="teams-tab__modal-header">
          <h3 className="teams-tab__modal-title">📋 智能 PRD 生成</h3>
          <button className="teams-tab__modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="teams-tab__modal-body">
          {!result && !generating && (
            <>
              <div style={{ fontSize: '0.82rem', color: 'var(--hd-text-secondary)', marginBottom: 'var(--hd-space-md)' }}>
                回答以下关键问题，AI 将基于 6 位专家协审、4 轮迭代生成专业的 16 章节 PRD
              </div>
              {PRD_QUESTIONS.map((q, i) => (
                <div key={i} className="teams-tab__form-group" style={{ marginBottom: 'var(--hd-space-md)' }}>
                  <label className="teams-tab__form-label">{q.question}</label>
                  {q.type === 'textarea' ? (
                    <textarea className="teams-tab__form-input"
                      placeholder={q.placeholder}
                      value={answers[q.id] || ''}
                      onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                      style={{ minHeight: 60, resize: 'vertical' }}
                    />
                  ) : q.type === 'select' && q.options ? (
                    <select className="teams-tab__form-input"
                      value={answers[q.id] || ''}
                      onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                    >
                      <option value="">{q.placeholder}</option>
                      {q.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : (
                    <input className="teams-tab__form-input"
                      placeholder={q.placeholder}
                      value={answers[q.id] || ''}
                      onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </>
          )}

          {generating && (
            <div className="teams-tab__prd-progress" style={{ padding: 'var(--hd-space-lg)', textAlign: 'center' }}>
              <div className="teams-tab__prd-spinner" />
              <span>{progress}</span>
            </div>
          )}

          {result && !generating && (
            <div className="teams-tab__prd-result">
              <div className="teams-tab__prd-result-header">
                <span className="teams-tab__prd-result-title">{result.projectTitle} — PRD</span>
                <span className="teams-tab__prd-result-meta">{result.chapters.length} 章节 · 4 轮专家审阅</span>
              </div>
              {result.chapters.map(chapter => (
                <div key={chapter.id} className="teams-tab__prd-chapter">
                  <button className="teams-tab__prd-chapter-header" onClick={() => toggleChapter(chapter.id)}>
                    <span className="teams-tab__prd-chapter-num">{chapter.id}</span>
                    <span className="teams-tab__prd-chapter-title">{chapter.title}</span>
                    <span className="teams-tab__prd-chapter-toggle">{expandedChapters.has(chapter.id) ? '−' : '+'}</span>
                  </button>
                  {expandedChapters.has(chapter.id) && (
                    <div className="teams-tab__prd-chapter-content">
                      <div className="teams-tab__prd-chapter-text">{chapter.content}</div>
                      <button className="teams-tab__prd-copy-btn" onClick={() => navigator.clipboard.writeText(chapter.content)}>复制</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="teams-tab__modal-footer">
          <button className="teams-tab__action-btn" onClick={onClose}>关闭</button>
          {!result && !generating && (
            <button className="teams-tab__create-btn" onClick={handleGenerate}
              disabled={!answers['projectName'] && !answers['coreProblem']}
            >🚀 开始生成</button>
          )}
          {result && (
            <button className="teams-tab__create-btn" onClick={handleDownload}>📥 下载 Markdown</button>
          )}
        </div>
      </div>
    </div>
  )
}
