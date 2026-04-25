/**
 * LintOverlay — 知识库体检覆盖层
 *
 * 从 KnowledgeVaultTab 提取，负责：
 * - 运行知识库体检
 * - 展示 issues
 * - 自动修复 / 手动修复 / 忽略
 */
import React, { useState, useEffect } from 'react'
import { getLLMConfig } from '../../../../lib/ai/provider'
import {
  runLint, getOpenIssues, fixIssue, dismissIssue,
  autoFixSafeIssues,
  type LintReport, type LintIssue,
} from '../../../../lib/knowledge/lint'

interface LintOverlayProps {
  onClose: () => void
  onDataRefresh: () => Promise<void>
  onSelectPage: (id: string) => void
}

const ISSUE_ICONS: Record<string, string> = {
  orphan: '🏝️',
  contradiction: '⚡',
  stale: '⏰',
  broken_link: '🔗',
  missing_summary: '📝',
}

export default function LintOverlay({ onClose, onDataRefresh, onSelectPage }: LintOverlayProps) {
  const [report, setReport] = useState<LintReport | null>(null)
  const [issues, setIssues] = useState<LintIssue[]>([])
  const [isLinting, setIsLinting] = useState(true)

  useEffect(() => {
    runLintCheck()
  }, [])

  async function runLintCheck() {
    setIsLinting(true)
    try {
      const r = await runLint(getLLMConfig())
      setReport(r)
      const iss = await getOpenIssues()
      setIssues(iss)
    } catch { /* ignore */ }
    setIsLinting(false)
  }

  async function handleFix(id: string) {
    await fixIssue(id)
    const iss = await getOpenIssues()
    setIssues(iss)
    if (report) setReport({ ...report, totalIssues: iss.length, issues: iss })
  }

  return (
    <div className="kv-tab__lint-overlay">
      <div className="kv-tab__lint">
        <div className="kv-tab__lint-actions" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>🩺 知识库体检</span>
          <button className="kv-tab__btn kv-tab__btn--subtle" onClick={onClose} style={{ fontSize: '0.65rem' }}>✕ 关闭</button>
        </div>

        {isLinting && <div style={{ padding: '12px', color: 'var(--hd-accent-cyan)' }}>⏳ 体检中...</div>}

        {report && (
          <>
            <div className="kv-tab__lint-stats">
              {[
                { value: report.stats.totalPages, label: '页面' },
                { value: report.stats.totalSources, label: '来源' },
                { value: report.stats.orphans, label: '孤儿', warn: true },
                { value: report.stats.contradictions, label: '矛盾', error: true },
                { value: report.stats.stale, label: '过时', warn: true },
                { value: report.stats.brokenLinks, label: '断裂链接', warn: true },
              ].map(s => (
                <div key={s.label} className="kv-tab__lint-stat">
                  <div className={`kv-tab__lint-stat-value ${s.error ? 'kv-tab__lint-stat-value--error' : s.warn ? 'kv-tab__lint-stat-value--warn' : ''}`}>{s.value}</div>
                  <div className="kv-tab__lint-stat-label">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="kv-tab__lint-actions">
              <button className="kv-tab__btn kv-tab__btn--subtle" onClick={async () => {
                const count = await autoFixSafeIssues()
                if (count > 0) { await onDataRefresh(); runLintCheck() }
              }}>🔧 自动修复</button>
            </div>

            {issues.map(issue => (
              <div key={issue.id} className="kv-tab__lint-issue">
                <div className="kv-tab__lint-issue-header">
                  <span className="kv-tab__lint-issue-icon">{ISSUE_ICONS[issue.issueType] || '⚠️'}</span>
                  <span className="kv-tab__lint-issue-type">{issue.severity}</span>
                </div>
                <div className="kv-tab__lint-issue-desc">{issue.description}</div>
                <div className="kv-tab__lint-issue-suggestion">💡 {issue.suggestion}</div>
                <div className="kv-tab__lint-issue-actions">
                  <button className="kv-tab__btn kv-tab__btn--subtle" onClick={() => handleFix(issue.id)} style={{ fontSize: '0.65rem', padding: '4px 10px' }}>修复</button>
                  <button className="kv-tab__btn kv-tab__btn--subtle" onClick={() => { dismissIssue(issue.id); setIssues(prev => prev.filter(i => i.id !== issue.id)) }} style={{ fontSize: '0.65rem', padding: '4px 10px' }}>忽略</button>
                  {issue.pageId && (
                    <button className="kv-tab__btn kv-tab__btn--subtle" onClick={() => { onClose(); onSelectPage(issue.pageId) }} style={{ fontSize: '0.65rem', padding: '4px 10px' }}>查看</button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
