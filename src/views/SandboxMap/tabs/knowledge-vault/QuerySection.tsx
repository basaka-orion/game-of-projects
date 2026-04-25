/**
 * QuerySection — 知识库查询面板
 *
 * 从 KnowledgeVaultTab 提取，负责：
 * - AI 查询输入
 * - Agent 视角切换
 * - 流式结果展示
 * - 归档为 Wiki 页面
 */
import React, { useState, useEffect } from 'react'
import { getLLMConfig, resolveAgentConfig } from '../../../../lib/ai/provider'
import { listAllAgents, type AgentDefinition } from '../../../../lib/agents/registry'
import { getSoul, renderSoulPrompt } from '../../../../lib/agents/soul'
import { queryWiki, fileAnswerAsPage } from '../../../../lib/knowledge/query-engine'

/** 简易 Markdown 渲染器(inline) */
function renderMarkdownInline(text: string, onWikiLink?: (name: string) => void): React.ReactNode[] {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    if (line.startsWith('## ')) return <h3 key={i}>{line.slice(3)}</h3>
    if (line.startsWith('### ')) return <h4 key={i}>{line.slice(4)}</h4>
    if (line.startsWith('- ') || line.startsWith('* ')) {
      return <div key={i} style={{ display: 'flex', gap: '6px', margin: '2px 0' }}>
        <span style={{ color: 'var(--hd-text-muted)', flexShrink: 0 }}>•</span>
        <span>{line.slice(2)}</span>
      </div>
    }
    if (line.trim() === '') return <div key={i} style={{ height: '8px' }} />
    return <p key={i} style={{ margin: '3px 0' }}>{line}</p>
  })
}

interface QuerySectionProps {
  onSelectPage: (id: string) => void
  onWikiLinkClick: (name: string) => void
  onBack: () => void
}

export default function QuerySection({ onSelectPage, onWikiLinkClick, onBack }: QuerySectionProps) {
  const [queryText, setQueryText] = useState('')
  const [queryAnswer, setQueryAnswer] = useState('')
  const [querySources, setQuerySources] = useState<string[]>([])
  const [isQuerying, setIsQuerying] = useState(false)
  const [queryStreamContent, setQueryStreamContent] = useState('')
  const [agents, setAgents] = useState<AgentDefinition[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')

  useEffect(() => {
    listAllAgents().then(list => setAgents(list.filter(a => a.isCustom)))
  }, [])

  async function handleQuery() {
    if (!queryText.trim() || isQuerying) return
    setIsQuerying(true)
    setQueryAnswer('')
    setQueryStreamContent('')
    setQuerySources([])

    try {
      const llmConfig = selectedAgentId ? resolveAgentConfig(selectedAgentId) : getLLMConfig()
      let agentPerspective: string | undefined
      if (selectedAgentId) {
        try {
          const soul = await getSoul(selectedAgentId)
          agentPerspective = renderSoulPrompt(soul)
        } catch { /* ignore */ }
      }
      const result = await queryWiki(queryText, llmConfig, {
        onChunk: (chunk) => setQueryStreamContent(prev => prev + chunk),
      }, agentPerspective)
      setQueryAnswer(result.answer)
      setQuerySources(result.sourcePageIds)
    } catch (err) {
      setQueryAnswer(`查询失败: ${String(err)}`)
    }
    setIsQuerying(false)
  }

  async function handleArchiveAnswer() {
    if (!queryAnswer || !queryText) return
    const pageId = await fileAnswerAsPage(queryText, queryAnswer, querySources, getLLMConfig())
    onSelectPage(pageId)
  }

  return (
    <div className="kv-tab__query">
      <div className="kv-tab__query-input-area">
        <textarea className="kv-tab__query-textarea"
          placeholder="输入问题查询知识库..."
          value={queryText}
          onChange={e => setQueryText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleQuery() } }}
        />
        <div style={{ display: 'flex', gap: 'var(--hd-space-sm)', marginTop: 'var(--hd-space-sm)', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--hd-text-muted)' }}>⌘+Enter</span>
            {agents.length > 0 && (
              <select
                style={{
                  fontSize: '0.72rem', background: 'var(--hd-bg-deep)',
                  color: 'var(--hd-text-secondary)', border: '1px solid var(--hd-border)',
                  borderRadius: 'var(--hd-radius-sm)', padding: '2px 6px', cursor: 'pointer',
                }}
                value={selectedAgentId}
                onChange={e => setSelectedAgentId(e.target.value)}
              >
                <option value="">默认视角</option>
                {agents.map(a => (<option key={a.id} value={a.id}>{a.icon} {a.name}</option>))}
              </select>
            )}
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button className="kv-tab__btn kv-tab__btn--subtle" onClick={onBack}>← 返回</button>
            <button className="kv-tab__btn" disabled={!queryText.trim() || isQuerying} onClick={handleQuery}>
              {isQuerying ? '⏳ 查询中...' : '🔍 查询'}
            </button>
          </div>
        </div>
      </div>
      {(queryStreamContent || queryAnswer) && (
        <div className="kv-tab__query-result">
          {renderMarkdownInline(queryAnswer || queryStreamContent, onWikiLinkClick)}
          {queryAnswer && !isQuerying && (
            <div className="kv-tab__query-archive">
              <button className="kv-tab__btn kv-tab__btn--gold" onClick={handleArchiveAnswer}>📥 归档为 Wiki 页面</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
