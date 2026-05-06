import type { ReactNode } from 'react'
import type {
  CouncilConsensusTrace,
  CouncilMasterPrdValidation,
} from '../../../../lib/xiaobai-council/master-prd'

interface CouncilMasterPrdViewProps {
  markdown: string
  validation: CouncilMasterPrdValidation
  trace?: CouncilConsensusTrace | null
  qualityScore?: number
  qualityStatus?: string
  runId?: string
  onCopy?: () => void
  onDownload?: () => void
  onSave?: () => void
  copied?: boolean
  saved?: boolean
}

function inlineFormat(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(<span key={`t-${key++}`}>{text.slice(lastIndex, match.index)}</span>)
    const token = match[1]
    if (token.startsWith('**')) parts.push(<strong key={`b-${key++}`}>{token.slice(2, -2)}</strong>)
    else parts.push(<code key={`c-${key++}`}>{token.slice(1, -1)}</code>)
    lastIndex = match.index + token.length
  }
  if (lastIndex < text.length) parts.push(<span key={`t-${key++}`}>{text.slice(lastIndex)}</span>)
  return parts.length ? parts : [text]
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
}

function splitTableLine(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
}

function renderMarkdown(markdown: string): ReactNode[] {
  const lines = markdown.split('\n')
  const elements: ReactNode[] = []
  let paragraph: string[] = []
  let code: string[] = []
  let inCode = false
  let list: ReactNode[] = []
  let listType: 'ul' | 'ol' | null = null
  let tableRows: string[][] = []
  let tableHeader: string[] = []

  const flushParagraph = () => {
    if (!paragraph.length) return
    elements.push(<p key={`p-${elements.length}`}>{inlineFormat(paragraph.join(' '))}</p>)
    paragraph = []
  }
  const flushList = () => {
    if (!list.length || !listType) return
    const ListTag = listType
    elements.push(<ListTag key={`list-${elements.length}`}>{list}</ListTag>)
    list = []
    listType = null
  }
  const flushTable = () => {
    if (!tableHeader.length) return
    elements.push(
      <div key={`table-${elements.length}`} className="council-master-prd__table-wrap">
        <table>
          <thead>
            <tr>{tableHeader.map((cell, index) => <th key={`h-${index}`}>{inlineFormat(cell)}</th>)}</tr>
          </thead>
          <tbody>
            {tableRows.map((row, rowIndex) => (
              <tr key={`r-${rowIndex}`}>
                {row.map((cell, cellIndex) => <td key={`c-${rowIndex}-${cellIndex}`}>{inlineFormat(cell)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    )
    tableHeader = []
    tableRows = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      flushParagraph()
      flushList()
      flushTable()
      if (inCode) {
        elements.push(<pre key={`code-${elements.length}`}><code>{code.join('\n')}</code></pre>)
        code = []
        inCode = false
      } else {
        inCode = true
      }
      continue
    }
    if (inCode) {
      code.push(line)
      continue
    }
    if (!trimmed) {
      flushParagraph()
      flushList()
      flushTable()
      continue
    }
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushParagraph()
      flushList()
      const cells = splitTableLine(trimmed)
      const next = lines[index + 1]?.trim() || ''
      if (!tableHeader.length && isTableSeparator(next)) {
        tableHeader = cells
        index += 1
      } else if (tableHeader.length) {
        tableRows.push(cells)
      } else {
        paragraph.push(trimmed)
      }
      continue
    }
    if (/^#{1,4}\s+/.test(trimmed)) {
      flushParagraph()
      flushList()
      flushTable()
      const level = Math.min(4, trimmed.match(/^#+/)?.[0].length || 2)
      const text = trimmed.replace(/^#{1,4}\s+/, '')
      if (level === 1) elements.push(<h1 key={`h-${elements.length}`}>{inlineFormat(text)}</h1>)
      else if (level === 2) elements.push(<h2 key={`h-${elements.length}`}>{inlineFormat(text)}</h2>)
      else if (level === 3) elements.push(<h3 key={`h-${elements.length}`}>{inlineFormat(text)}</h3>)
      else elements.push(<h4 key={`h-${elements.length}`}>{inlineFormat(text)}</h4>)
      continue
    }
    const bullet = trimmed.match(/^[-*]\s+(.*)$/)
    const ordered = trimmed.match(/^(\d+)\.\s+(.*)$/)
    if (bullet || ordered) {
      flushParagraph()
      flushTable()
      const type = ordered ? 'ol' : 'ul'
      if (listType && listType !== type) flushList()
      listType = type
      list.push(<li key={`li-${index}`}>{inlineFormat((bullet?.[1] || ordered?.[2] || '').trim())}</li>)
      continue
    }
    paragraph.push(trimmed)
  }
  flushParagraph()
  flushList()
  flushTable()
  if (code.length) elements.push(<pre key={`code-${elements.length}`}><code>{code.join('\n')}</code></pre>)
  return elements
}

export function CouncilMasterPrdView({
  markdown,
  validation,
  trace,
  qualityScore,
  qualityStatus,
  runId,
  onCopy,
  onDownload,
  onSave,
  copied,
  saved,
}: CouncilMasterPrdViewProps) {
  return (
    <section className="council-app__panel council-master-prd" aria-label="小白智囊团大师共识 PRD">
      <div className="council-app__panel-head">
        <div>
          <div className="council-app__section-kicker">大师共识 PRD · 全技术栈可开工</div>
          <h2>最终成品：多角色严苛脑暴后达成的 PRD</h2>
          <p>主文档保留人物智慧、裁决来源和前后端技术栈，不再把过程日志平铺成噪音。</p>
        </div>
        <div className="council-app__artifact-actions">
          {onCopy && <button type="button" onClick={onCopy}>{copied ? '已复制' : '复制 PRD'}</button>}
          {onDownload && <button type="button" onClick={onDownload}>下载 Markdown</button>}
          {onSave && <button type="button" onClick={onSave}>{saved ? '已归档' : '归档'}</button>}
        </div>
      </div>

      <div className="council-master-prd__metrics">
        <article>
          <span>大师级结构</span>
          <strong>{validation.score}</strong>
          <small>{validation.hitLabels.length}/{validation.sections.length} 章节命中</small>
        </article>
        <article>
          <span>质量闸门</span>
          <strong>{qualityScore ?? '-'}</strong>
          <small>{qualityStatus || '等待复验'}</small>
        </article>
        <article>
          <span>追溯场景</span>
          <strong>{trace?.sourcedScenes ?? 0}</strong>
          <small>{trace ? `${trace.totalTasks} 个执行任务` : '等待生成'}</small>
        </article>
        <article>
          <span>runId</span>
          <strong>{runId ? 'ready' : '-'}</strong>
          <small>{runId || '未生成运行证据'}</small>
        </article>
      </div>

      {validation.missedLabels.length > 0 && (
        <div className="council-master-prd__missing">
          <strong>仍需返修章节</strong>
          {validation.missedLabels.map((label) => <span key={label}>{label}</span>)}
        </div>
      )}

      <article className="council-master-prd__document">
        {renderMarkdown(markdown)}
      </article>

      {trace && (
        <div className="council-master-prd__trace">
          <div>
            <div className="council-app__section-kicker">共识形成追溯</div>
            <h3>主张、质询、吸收、裁掉四条证据线</h3>
            <p>{trace.summary}</p>
          </div>
          <div className="council-master-prd__trace-lanes">
            {trace.lanes.map((lane) => (
              <article key={lane.id}>
                <span>{lane.label}</span>
                <p>{lane.summary}</p>
                {lane.items.slice(0, 4).map((item) => (
                  <section key={item.id}>
                    <strong>第 {item.sceneNo} 幕 · {item.speakerName}</strong>
                    <p>{item.claim}</p>
                    {item.objection && <small>质询：{item.objection}</small>}
                    <small>吸收：{item.absorbedAs}</small>
                    {item.taskRefs.length > 0 && <small>任务：{item.taskRefs.join(' / ')}</small>}
                    {item.sourceMessageIds.length > 0 && <small>来源：{item.sourceMessageIds.join(' / ')}</small>}
                  </section>
                ))}
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
