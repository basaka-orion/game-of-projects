/**
 * KnowledgeVaultTab — Knowledge vault with curation and research.
 */
import { useState, useEffect, useMemo, useRef, useCallback, useDeferredValue, startTransition } from 'react'
import { getLLMConfig, resolveAgentConfig } from '../../../lib/ai/provider'
import { listAllAgents, AgentDefinition } from '../../../lib/agents/registry'
import { getSoul, renderSoulPrompt } from '../../../lib/agents/soul'
import {
  getAllPagesUnbounded,
  getPage,
  updatePage,
  deletePage,
  getAllSourcesUnbounded,
  getSource,
  getWikiStats,
  updateSource,
  type WikiPage,
  type WikiSource,
} from '../../../lib/knowledge/wiki'
import {
  ingestUrl,
  ingestPaste,
  ingestClipper,
  ingestFolder,
  ingestSource,
  isFileSupported,
  type IngestResult,
} from '../../../lib/knowledge/ingest'
import { queryWikiEnhanced, fileAnswerAsPage, type QueryResult } from '../../../lib/knowledge/query-engine'
import { findDrawerBySourceId, getDrawer, updateDrawer, type Drawer } from '../../../lib/knowledge/drawer'
import { getDrawerStats } from '../../../lib/knowledge/drawer'
import { runCompileCycle, getCompileLLMConfig } from '../../../lib/knowledge/wiki-compiler'
import { scanVaultDirectory } from '../../../lib/knowledge/obsidian-importer'
import {
  buildKnowledgeIntelligence,
  getKnowledgePageLens,
  isPagePinned,
  isPageStarred,
} from '../../../lib/knowledge/intelligence'
import {
  ALL_FOLDERS_SCOPE,
  buildKnowledgeFolderOptions,
  ensureKnowledgeFolderMetadata,
  getFolderDisplayPath,
  isFolderPathInScope,
  loadKnowledgeSourceScopeEntries,
  normalizeFolderPath,
  pageMatchesFolderScope,
  type KnowledgeFolderOption,
  type KnowledgeSourceScopeEntry,
} from '../../../lib/knowledge/folders'
import {
  runGroundedAutoResearch,
  shouldUseAutoResearch,
  synthesizeHybridKnowledgeAnswer,
  type GroundedResearchReport,
} from '../../../lib/ai/auto-research'
import IntelligencePanel from './knowledge-vault/IntelligencePanel'
import './KnowledgeVaultTab.css'

// ─── Types ───

type SubTab = 'pages' | 'insights' | 'ingest'

type IndexedPage = {
  page: WikiPage
  lensKey: string
  lensLabel: string
  normalizedTags: string[]
  searchBlob: string
  preview: string
  primaryTag: string
  pinned: boolean
  starred: boolean
  updatedLabel: string
}

type CategoryFilter = {
  key: string
  label: string
  count: number
}

type TagFilter = {
  tag: string
  count: number
}

type DirectImportFile = {
  file: File
  relativePath?: string
}

type IndexedSource = {
  source: WikiSource
  sourceKind: string
  sourceKindLabel: string
  extensionLabel: string
  projectLabel: string
  displayPath: string
  searchBlob: string
  preview: string
  updatedLabel: string
  hasImages: boolean
}

const PAGE_ROW_HEIGHT = 146
const PAGE_ROW_OVERSCAN = 8
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown'])
const TEXT_EXTENSIONS = new Set(['txt', 'rtf'])
const DATA_EXTENSIONS = new Set(['json', 'csv', 'tsv', 'yaml', 'yml', 'toml', 'xml', 'sql'])

function normalizePathSeparators(value: string): string {
  return value.replace(/\\/g, '/')
}

function getPathLeafName(value: string): string {
  const normalized = normalizePathSeparators(value).replace(/\/+$/, '')
  return normalized.split('/').filter(Boolean).pop() || value
}

function deriveFolderPathFromRelativeFile(relativePath?: string): string | undefined {
  if (!relativePath) return undefined
  const normalized = normalizePathSeparators(relativePath).replace(/^\/+/, '')
  const segments = normalized.split('/').filter(Boolean)
  if (segments.length <= 1) return undefined
  return normalizeFolderPath(segments.slice(0, -1).join('/'))
}

function deriveFolderPathFromAbsoluteFilePath(filePath?: string): string | undefined {
  if (!filePath) return undefined
  const directory = normalizePathSeparators(getDirnamePath(filePath)).replace(/^\/+/, '')
  const segments = directory.split('/').filter(Boolean)
  if (segments.length === 0) return undefined
  return normalizeFolderPath(segments.slice(-2).join('/'))
}

function getDirnamePath(value: string): string {
  const normalized = normalizePathSeparators(value).replace(/\/+$/, '')
  const segments = normalized.split('/')
  if (segments.length <= 1) return ''
  segments.pop()
  if (segments.length === 1 && normalized.startsWith('/')) return '/'
  return segments.join('/')
}

function normalizeAbsolutePath(pathValue: string): string {
  const normalized = normalizePathSeparators(pathValue)
  const hasLeadingSlash = normalized.startsWith('/')
  const drivePrefix = normalized.match(/^[A-Za-z]:/)
  const segments = normalized.split('/')
  const resolved: string[] = []

  for (const segment of segments) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (resolved.length > 0 && resolved[resolved.length - 1] !== '..') {
        resolved.pop()
      }
      continue
    }
    resolved.push(segment)
  }

  if (drivePrefix) {
    const [drive, ...rest] = resolved
    return `${drive}/${rest.join('/')}`.replace(/\/+$/, '')
  }

  const joined = resolved.join('/')
  if (hasLeadingSlash) return `/${joined}`.replace(/\/+$/, '') || '/'
  return joined
}

function resolveMarkdownAssetUrl(url: string, baseFilePath?: string): string {
  const cleanUrl = url.trim().replace(/^<|>$/g, '')
  if (!cleanUrl) return ''
  if (/^(https?:|data:|blob:|file:)/i.test(cleanUrl)) return cleanUrl
  if (/^[A-Za-z]:[\\/]/.test(cleanUrl) || cleanUrl.startsWith('/')) {
    return encodeURI(normalizePathSeparators(cleanUrl))
  }
  if (!baseFilePath) return cleanUrl

  const baseDir = getDirnamePath(baseFilePath)
  if (!baseDir) return cleanUrl
  return encodeURI(normalizeAbsolutePath(`${baseDir}/${cleanUrl}`))
}

function getSourceExtension(source: WikiSource): string {
  const candidate = source.filePath || source.title || ''
  const match = candidate.toLowerCase().match(/\.([^.\/\\]+)$/)
  return match?.[1] || ''
}

function classifySourceKind(source: WikiSource): { key: string; label: string } {
  const extension = getSourceExtension(source)
  if (MARKDOWN_EXTENSIONS.has(extension)) return { key: 'markdown', label: 'Markdown' }
  if (TEXT_EXTENSIONS.has(extension)) return { key: 'text', label: '文本' }
  if (DATA_EXTENSIONS.has(extension)) return { key: 'data', label: '数据' }
  if (extension) return { key: 'code', label: '代码' }
  return { key: 'other', label: '其他' }
}

function getSourceDisplayPath(source: WikiSource): string {
  const fileName = source.title || getPathLeafName(source.filePath) || '未命名文件'
  const folder =
    source.folderPath && source.folderPath !== '.' && source.folderPath !== '__unfiled__'
      ? getFolderDisplayPath(source.folderPath)
      : ''
  return folder ? `${folder}/${fileName}` : fileName
}

function getSourceProjectLabel(source: WikiSource): string {
  if (!source.folderPath || source.folderPath === '.' || source.folderPath === '__unfiled__') {
    return '未分项目'
  }
  return source.folderPath.split('/')[0] || getFolderDisplayPath(source.folderPath)
}

function buildSourceSearchBlob(source: WikiSource): string {
  return [source.title, source.filePath, source.folderPath, source.content, source.rawContent].join(' ').toLowerCase()
}

function buildSourcePreview(source: WikiSource): string {
  const raw = (source.rawContent || source.content || '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '[图片]')
    .replace(/[#>*`_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return raw.slice(0, 140) || '暂无内容摘要'
}

function buildIndexedSource(source: WikiSource): IndexedSource {
  const sourceKind = classifySourceKind(source)
  const extension = getSourceExtension(source)
  const hasImages = /!\[[^\]]*\]\([^)]+\)/.test(source.rawContent || source.content || '')

  return {
    source,
    sourceKind: sourceKind.key,
    sourceKindLabel: sourceKind.label,
    extensionLabel: extension ? extension.toUpperCase() : (source.sourceType || 'FILE').toUpperCase(),
    projectLabel: getSourceProjectLabel(source),
    displayPath: getSourceDisplayPath(source),
    searchBlob: buildSourceSearchBlob(source),
    preview: buildSourcePreview(source),
    updatedLabel: (source.updatedAt || source.createdAt || '').slice(0, 10),
    hasImages,
  }
}

function compareDisplayPath(left: string, right: string): number {
  return left.localeCompare(right, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
}

function sortSourcesForIndex(sources: WikiSource[]): WikiSource[] {
  return [...sources].sort((left, right) => {
    const projectDiff = compareDisplayPath(getSourceProjectLabel(left), getSourceProjectLabel(right))
    if (projectDiff !== 0) return projectDiff
    const pathDiff = compareDisplayPath(getSourceDisplayPath(left), getSourceDisplayPath(right))
    if (pathDiff !== 0) return pathDiff
    return (right.updatedAt || right.createdAt || '').localeCompare(left.updatedAt || left.createdAt || '')
  })
}

function countMarkdownImages(text: string): number {
  const matches = text.match(/!\[[^\]]*\]\([^)]+\)/g)
  return matches?.length || 0
}

// ─── Markdown Renderer ───

function renderMarkdown(
  text: string,
  onDrawerClick?: (id: string) => void,
  onWikiLinkClick?: (pageName: string) => void,
  baseFilePath?: string,
): React.ReactNode[] {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let inCodeBlock = false
  let codeBuffer: string[] = []
  let codeKey = 0

  const processInline = (line: string): React.ReactNode => {
    const parts: React.ReactNode[] = []
    const regex = /(!\[[^\]]*\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\[\[[^\]]+\]\]|\^\[Drawer:[^\]]+\])/g
    let lastIndex = 0
    let match: RegExpExecArray | null
    let pk = 0

    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={`t${pk++}`}>{line.slice(lastIndex, match.index)}</span>)
      }
      const token = match[1]
      if (token.startsWith('![') && token.includes('](') && token.endsWith(')')) {
        const imageMatch = token.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
        if (imageMatch) {
          const resolvedUrl = resolveMarkdownAssetUrl(imageMatch[2], baseFilePath)
          parts.push(
            <figure key={`img${pk++}`} className="kv-tab__markdown-figure">
              <img className="kv-tab__markdown-image" src={resolvedUrl} alt={imageMatch[1] || 'Markdown image'} />
              {imageMatch[1] && <figcaption className="kv-tab__markdown-caption">{imageMatch[1]}</figcaption>}
            </figure>,
          )
        }
      } else if (token.startsWith('**') && token.endsWith('**')) {
        parts.push(<strong key={`b${pk++}`}>{token.slice(2, -2)}</strong>)
      } else if (token.startsWith('`') && token.endsWith('`')) {
        parts.push(<code key={`c${pk++}`}>{token.slice(1, -1)}</code>)
      } else if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
        const match = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (match) {
          parts.push(
            <a key={`l${pk++}`} className="kv-tab__external-link" href={match[2]} target="_blank" rel="noreferrer">
              {match[1]}
            </a>,
          )
        }
      } else if (token.startsWith('[[') && token.endsWith(']]')) {
        const pageName = token.slice(2, -2)
        parts.push(
          <span
            key={`w${pk++}`}
            className="kv-tab__wiki-link"
            onClick={(e) => {
              e.stopPropagation()
              onWikiLinkClick?.(pageName)
            }}
            title={`跳转到: ${pageName}`}
          >
            {token}
          </span>,
        )
      } else if (token.startsWith('^[Drawer:') && token.endsWith(']')) {
        const drawerId = token.slice(9, -1)
        parts.push(
          <span
            key={`d${pk++}`}
            className="kv-tab__drawer-anchor"
            onClick={() => onDrawerClick?.(drawerId)}
            title={`查看原始抽屉: ${drawerId}`}
          >
            {token}
          </span>,
        )
      }
      lastIndex = match.index + token.length
    }
    if (lastIndex < line.length) {
      parts.push(<span key={`t${pk}`}>{line.slice(lastIndex)}</span>)
    }
    return parts.length > 0 ? parts : line
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code${codeKey++}`}>
            <code>{codeBuffer.join('\n')}</code>
          </pre>,
        )
        codeBuffer = []
        inCodeBlock = false
      } else {
        inCodeBlock = true
      }
      continue
    }
    if (inCodeBlock) {
      codeBuffer.push(line)
      continue
    }

    if (line.startsWith('> ')) {
      elements.push(<blockquote key={i}>{processInline(line.slice(2))}</blockquote>)
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={i}>{processInline(line.slice(3))}</h3>)
    } else if (line.startsWith('### ')) {
      elements.push(<h4 key={i}>{processInline(line.slice(4))}</h4>)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={i} style={{ display: 'flex', gap: '6px', margin: '2px 0' }}>
          <span style={{ color: 'var(--hd-text-muted)', flexShrink: 0 }}>•</span>
          <span>{processInline(line.slice(2))}</span>
        </div>,
      )
    } else if (/^\d+\.\s/.test(line)) {
      const m = line.match(/^(\d+)\.\s(.*)/)
      if (m) {
        elements.push(
          <div key={i} style={{ display: 'flex', gap: '6px', margin: '2px 0' }}>
            <span style={{ color: 'var(--hd-text-muted)', flexShrink: 0 }}>{m[1]}.</span>
            <span>{processInline(m[2])}</span>
          </div>,
        )
      }
    } else if (/^!\[[^\]]*\]\([^)]+\)$/.test(line.trim())) {
      elements.push(
        <div key={i} className="kv-tab__markdown-media-row">
          {processInline(line.trim())}
        </div>,
      )
    } else if (line.trim() === '' || line.startsWith('---')) {
      elements.push(<div key={i} style={{ height: '8px' }} />)
    } else {
      elements.push(
        <p key={i} style={{ margin: '3px 0' }}>
          {processInline(line)}
        </p>,
      )
    }
  }
  return elements
}

function combineAnswerWithResearch(answer: string, research: GroundedResearchReport | null): string {
  if (!research?.grounded) return answer

  const lines = [answer, '', '## 外部前沿补强', '', research.summary]

  if (research.notableSignals.length > 0) {
    lines.push('', '### 外部信号')
    for (const signal of research.notableSignals) lines.push(`- ${signal}`)
  }

  if (research.recommendations.length > 0) {
    lines.push('', '### 可行动建议')
    for (const recommendation of research.recommendations) lines.push(`- ${recommendation}`)
  }

  return lines.join('\n')
}

function ensureVisibleAnswer(answer: string, fallback: string): string {
  const normalized = answer.trim()
  return normalized || fallback.trim()
}

function compareIsoDateDesc(a: string | undefined, b: string | undefined): number {
  const left = a || ''
  const right = b || ''
  return right.localeCompare(left)
}

function sortPagesForIndex(pages: WikiPage[]): WikiPage[] {
  return [...pages].sort((a, b) => {
    const pinnedDiff = Number(isPagePinned(b)) - Number(isPagePinned(a))
    if (pinnedDiff !== 0) return pinnedDiff
    const starredDiff = Number(isPageStarred(b)) - Number(isPageStarred(a))
    if (starredDiff !== 0) return starredDiff
    const importanceDiff = b.importance - a.importance
    if (importanceDiff !== 0) return importanceDiff
    return compareIsoDateDesc(a.updatedAt, b.updatedAt)
  })
}

function normalizeSearchTerms(input: string): string[] {
  return input
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
}

function buildSearchBlob(page: WikiPage): string {
  const contentPreview = (page.content || '').replace(/\s+/g, ' ').slice(0, 320)

  return [page.title, page.summary, ...(page.tags || []), contentPreview].join(' ').toLowerCase()
}

function matchesSearchTerms(searchBlob: string, terms: string[]): boolean {
  if (terms.length === 0) return true
  return terms.every((term) => searchBlob.includes(term))
}

function buildIndexedPage(page: WikiPage): IndexedPage {
  const lens = getKnowledgePageLens(page)
  const normalizedTags = (page.tags || []).map((tag) => tag.trim().toLowerCase()).filter(Boolean)
  const previewSource = page.summary || page.content || ''
  const preview = previewSource.replace(/\s+/g, ' ').trim().slice(0, 120)

  return {
    page,
    lensKey: lens.key,
    lensLabel: lens.label,
    normalizedTags,
    searchBlob: buildSearchBlob(page),
    preview,
    primaryTag: normalizedTags[0] || '',
    pinned: isPagePinned(page),
    starred: isPageStarred(page),
    updatedLabel: (page.updatedAt || page.createdAt || '').slice(0, 10),
  }
}

// ─── Main Component ───

export default function KnowledgeVaultTab() {
  const [subTab, setSubTab] = useState<SubTab>('pages')
  const [searchText, setSearchText] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [showPageView, setShowPageView] = useState(false)

  // Data
  const [pages, setPages] = useState<WikiPage[]>([])
  const [sources, setSources] = useState<WikiSource[]>([])
  const [sourceScopeEntries, setSourceScopeEntries] = useState<KnowledgeSourceScopeEntry[]>([])
  const [selectedFolderPath, setSelectedFolderPath] = useState<string>(
    () => localStorage.getItem('kv_selected_folder_path') || ALL_FOLDERS_SCOPE,
  )
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [stats, setStats] = useState<{
    totalPages: number
    totalSources: number
    avgConfidence: number
    avgImportance: number
  } | null>(null)

  // Page view
  const [currentPage, setCurrentPage] = useState<WikiPage | null>(null)
  const [currentSource, setCurrentSource] = useState<WikiSource | null>(null)
  const [currentDrawer, setCurrentDrawer] = useState<Drawer | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')

  // Ingest
  const [isIngesting, setIsIngesting] = useState(false)
  const [ingestPhase, setIngestPhase] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [ingestPasteTitle, setIngestPasteTitle] = useState('')
  const [ingestPasteContent, setIngestPasteContent] = useState('')
  const [batchResults, setBatchResults] = useState<Array<IngestResult & { fileName: string }>>([])
  const [isDragOver, setIsDragOver] = useState(false)

  // Query
  const [queryText, setQueryText] = useState('')
  const [queryBaseAnswer, setQueryBaseAnswer] = useState('')
  const [queryAnswer, setQueryAnswer] = useState('')
  const [querySources, setQuerySources] = useState<string[]>([])
  const [queryCitations, setQueryCitations] = useState<QueryResult['citations']>([])
  const [queryUsedCitationIds, setQueryUsedCitationIds] = useState<string[]>([])
  const [queryEvidence, setQueryEvidence] = useState<QueryResult['evidence'] | null>(null)
  const [queryMode, setQueryMode] = useState<QueryResult['answerMode']>('synthesis')
  const [isQuerying, setIsQuerying] = useState(false)
  const [isResearching, setIsResearching] = useState(false)
  const [autoResearchEnabled, setAutoResearchEnabled] = useState(
    () => localStorage.getItem('kv_auto_research') !== 'false',
  )
  const [queryStreamContent, setQueryStreamContent] = useState('')
  const [queryResearch, setQueryResearch] = useState<GroundedResearchReport | null>(null)
  const [showQueryResult, setShowQueryResult] = useState(false)

  // Agent 视角
  const [agents, setAgents] = useState<AgentDefinition[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')

  useEffect(() => {
    listAllAgents().then((list) => setAgents(list.filter((a) => a.isCustom)))
  }, [])

  // Drawer stats (for metabolism indicator)
  const [drawerStats, setDrawerStats] = useState<{ totalDrawers: number; uncompiledCount: number } | null>(null)
  const [isCompiling, setIsCompiling] = useState(false)
  const [compileProgress, setCompileProgress] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [autoCompile, setAutoCompile] = useState(true)

  // Obsidian Vault 导入
  const [vaultPath, setVaultPath] = useState(() => localStorage.getItem('kv_last_vault_path') || '')
  const [isVaultImporting, setIsVaultImporting] = useState(false)
  const [vaultResult, setVaultResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)

  // 欢迎引导
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('kv_welcomed'))

  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryResultRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listScrollFrameRef = useRef<number | null>(null)
  const [listScrollTop, setListScrollTop] = useState(0)
  const [listViewportHeight, setListViewportHeight] = useState(0)
  const deferredSearchText = useDeferredValue(searchText)

  // ─── Sub-tabs ───

  const subTabs: Array<{ id: SubTab; icon: string; label: string }> = [
    { id: 'pages', icon: '📖', label: '知识索引' },
    { id: 'insights', icon: '✦', label: '知识策展' },
    { id: 'ingest', icon: '➕', label: '导入知识' },
  ]

  // ─── Data Loading ───

  const loadData = useCallback(async () => {
    await ensureKnowledgeFolderMetadata()
    const [st, dst, sourceEntries, allSources] = await Promise.all([
      getWikiStats(),
      getDrawerStats(),
      loadKnowledgeSourceScopeEntries(),
      getAllSourcesUnbounded(500),
    ])
    const allPages = await getAllPagesUnbounded(500)
    setPages(sortPagesForIndex(allPages))
    setSources(sortSourcesForIndex(allSources.filter((source) => source.sourceType === 'file' || !!source.filePath)))
    setSourceScopeEntries(sourceEntries)
    setStats({
      totalPages: st.totalPages,
      totalSources: st.totalSources,
      avgConfidence: st.avgConfidence,
      avgImportance: st.avgImportance,
    })
    setDrawerStats({ totalDrawers: dst.totalDrawers, uncompiledCount: dst.uncompiledCount })
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])
  useEffect(() => {
    localStorage.setItem('kv_auto_research', autoResearchEnabled ? 'true' : 'false')
  }, [autoResearchEnabled])
  useEffect(() => {
    localStorage.setItem('kv_selected_folder_path', selectedFolderPath)
  }, [selectedFolderPath])
  useEffect(() => {
    localStorage.setItem('kv_last_vault_path', vaultPath)
  }, [vaultPath])
  useEffect(() => {
    const node = listRef.current
    if (!node) return

    const syncHeight = () => setListViewportHeight(node.clientHeight)
    syncHeight()

    const observer = new ResizeObserver(syncHeight)
    observer.observe(node)

    return () => observer.disconnect()
  }, [])
  useEffect(
    () => () => {
      if (listScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(listScrollFrameRef.current)
      }
    },
    [],
  )

  // ─── Listen for Clipper ───

  useEffect(() => {
    const electronAPI = (window as any)?.electronAPI
    if (electronAPI?.onClipperReceived) {
      electronAPI.onClipperReceived(async (data: { title: string; url: string; useClipboard: boolean }) => {
        setSubTab('ingest')
        setIngestPhase('Clipper 剪藏处理中...')
        setIsIngesting(true)
        try {
          const result = await ingestClipper(data, getLLMConfig())
          if (result.pageId) {
            await loadData()
            selectPage(result.pageId)
          }
          setIngestPhase('✅ 剪藏成功')
        } catch (err) {
          setIngestPhase(`❌ 剪藏失败: ${String(err)}`)
        }
        setIsIngesting(false)
      })
    }
  }, [loadData])

  // ─── Selection ───

  async function selectPage(id: string) {
    const page = await getPage(id)
    if (page) {
      setCurrentPage(page)
      setCurrentSource(null)
      setCurrentDrawer(null)
      setSelectedPageId(id)
      setSelectedSourceId(null)
      setShowPageView(true)
      setIsEditing(false)
    }
  }

  async function selectSource(id: string) {
    const source = await getSource(id)
    if (source) {
      setCurrentSource(source)
      setCurrentPage(null)
      setCurrentDrawer(null)
      setSelectedPageId(null)
      setSelectedSourceId(id)
      setShowPageView(true)
      setIsEditing(false)
    }
  }

  async function selectDrawer(id: string) {
    const drawer = await getDrawer(id)
    if (drawer) {
      setCurrentDrawer(drawer)
      setCurrentPage(null)
      setCurrentSource(null)
      setSelectedPageId(null)
      setSelectedSourceId(null)
      setShowPageView(true)
      setIsEditing(false)
    }
  }

  function closeDetailView() {
    setShowPageView(false)
    setSelectedPageId(null)
    setSelectedSourceId(null)
    setCurrentPage(null)
    setCurrentSource(null)
    setCurrentDrawer(null)
    setIsEditing(false)
  }

  // Wiki link click handler — search for page by name
  async function handleWikiLinkClick(pageName: string) {
    // First try exact title match
    const match = pages.find((p) => p.title === pageName)
    if (match) {
      selectPage(match.id)
      return
    }
    // Then try case-insensitive
    const matchLower = pages.find((p) => p.title.toLowerCase() === pageName.toLowerCase())
    if (matchLower) {
      selectPage(matchLower.id)
      return
    }
    // Then try partial
    const matchPartial = pages.find((p) => p.title.toLowerCase().includes(pageName.toLowerCase()))
    if (matchPartial) {
      selectPage(matchPartial.id)
    }
  }

  async function handleCitationClick(citation: NonNullable<QueryResult['citations']>[number]) {
    if (citation.kind === 'page' && citation.pageId) {
      await selectPage(citation.pageId)
      return
    }
    if (citation.kind === 'source' && citation.sourceId) {
      await selectSource(citation.sourceId)
      return
    }
    if (citation.kind === 'drawer' && citation.drawerId) {
      await selectDrawer(citation.drawerId)
      return
    }
    if (citation.kind === 'chunk') {
      if (citation.pageId) {
        await selectPage(citation.pageId)
        return
      }
      if (citation.sourceId) {
        await selectSource(citation.sourceId)
        return
      }
      if (citation.drawerId) {
        await selectDrawer(citation.drawerId)
        return
      }
    }
  }

  // ─── Ingest Actions ───

  async function triggerAutoCompile() {
    if (!autoCompile) return
    setIsCompiling(true)
    setCompileProgress('自动编译中...')
    try {
      const config = getCompileLLMConfig()
      await runCompileCycle(config, 20, (p) => setCompileProgress(p.message))
      await loadData()
    } catch {
      /* non-critical */
    }
    setIsCompiling(false)
  }

  async function handleIngestUrl() {
    if (!urlInput.trim() || isIngesting) return
    setIsIngesting(true)
    setIngestPhase('抓取并处理中...')
    try {
      const result = await ingestUrl(urlInput.trim(), getLLMConfig())
      if (result.pageId) {
        await loadData()
        selectPage(result.pageId)
      }
      setIngestPhase(result.errors.length > 0 ? `⚠️ ${result.errors.join('; ')}` : '✅ 完成')
      if (result.pageId) triggerAutoCompile()
    } catch (err) {
      setIngestPhase(`❌ ${String(err)}`)
    }
    setIsIngesting(false)
  }

  async function handleIngestPaste() {
    if (!ingestPasteContent.trim() || isIngesting) return
    setIsIngesting(true)
    setIngestPhase('处理粘贴内容...')
    try {
      const result = await ingestPaste(ingestPasteContent, ingestPasteTitle || '粘贴内容', getLLMConfig())
      if (result.pageId) {
        await loadData()
        selectPage(result.pageId)
        setIngestPasteContent('')
        setIngestPasteTitle('')
      }
      setIngestPhase(result.errors.length > 0 ? `⚠️ ${result.errors.join('; ')}` : '✅ 完成')
      if (result.pageId) triggerAutoCompile()
    } catch (err) {
      setIngestPhase(`❌ ${String(err)}`)
    }
    setIsIngesting(false)
  }

  async function handleVaultRescan() {
    if (!vaultPath.trim() || isVaultImporting) return
    setIsVaultImporting(true)
    setVaultResult(null)
    try {
      const result = await scanVaultDirectory({ vaultPath: vaultPath.trim(), maxDepth: 3, skipExisting: true })
      setVaultResult(result)
      if (result.imported > 0) {
        await loadData()
        const vaultFolderName = getPathLeafName(vaultPath.trim())
        startTransition(() => {
          setSelectedFolderPath(vaultFolderName)
          setActiveCategory('all')
        })
      }
      if (result.errors.length === 0) {
        setIngestPhase(`✅ 本地篇目同步完成：新增 ${result.imported} 条，跳过 ${result.skipped} 条`)
      } else {
        setIngestPhase(`⚠️ 本地篇目同步完成：新增 ${result.imported} 条，${result.errors.length} 个错误`)
      }
    } catch (err) {
      setVaultResult({ imported: 0, skipped: 0, errors: [(err as Error).message] })
      setIngestPhase(`❌ 本地篇目同步失败：${(err as Error).message}`)
    } finally {
      setIsVaultImporting(false)
    }
  }

  async function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error(`读取失败: ${file.name}`))
      reader.readAsText(file)
    })
  }

  async function handleChooseFolderImport() {
    if (isIngesting) return

    const electronAPI = (window as any)?.electronAPI
    if (!electronAPI?.chooseFolder) {
      setIngestPhase('❌ 当前环境不支持系统文件夹选择')
      return
    }

    const folderPath = await electronAPI.chooseFolder()
    if (!folderPath) return

    const folderName = getPathLeafName(folderPath)
    setIsIngesting(true)
    setBatchResults([])
    setIngestPhase(`📂 正在导入文件夹：${folderName}`)

    try {
      const results = await ingestFolder(folderPath, getLLMConfig())
      if (results.length === 0) {
        setIngestPhase('❌ 这个文件夹里没有找到支持的文件类型')
        return
      }

      setBatchResults(
        results.map((result, index) => ({
          ...result,
          fileName: result.pageTitle || `${folderName}-${index + 1}`,
        })),
      )

      const successCount = results.filter(
        (result) => result.errors.length === 0 && (result.sourceId || result.pageId || result.drawerId),
      ).length
      const failedCount = results.length - successCount

      if (successCount > 0) {
        await loadData()
        startTransition(() => {
          setSelectedFolderPath(folderName)
          setActiveCategory('all')
        })
      }
      setIngestPhase(
        successCount === 0
          ? `❌ 文件夹导入失败：${failedCount} 条未成功导入`
          : failedCount > 0
            ? `⚠️ 文件夹导入完成：${successCount} 条成功，${failedCount} 条失败`
            : `✅ 文件夹导入完成：${successCount} 条`,
      )

      if (successCount > 0) triggerAutoCompile()
    } catch (err) {
      setIngestPhase(`❌ 文件夹导入失败：${String(err)}`)
    } finally {
      setIsIngesting(false)
    }
  }

  async function handleFilesDirectImport(files: DirectImportFile[]) {
    const supportedFiles = files.filter(({ file, relativePath }) => isFileSupported(relativePath || file.name))
    if (supportedFiles.length === 0 || isIngesting) {
      if (supportedFiles.length === 0) setIngestPhase('❌ 没有支持的文件类型')
      return
    }

    setIsIngesting(true)
    setBatchResults([])
    setIngestPhase(`处理 ${supportedFiles.length} 个文件...`)
    let importedCount = 0
    const importedTopFolders = new Set<string>()

    for (let i = 0; i < supportedFiles.length; i++) {
      const { file, relativePath } = supportedFiles[i]
      const fileName = file.name
      setIngestPhase(`[${i + 1}/${supportedFiles.length}] ${fileName}`)

      try {
        const content = await readFileAsText(file)
        const language = fileName.match(/\.([^.]+)$/)?.[1] || 'text'
        const isCode = !['md', 'txt', 'json', 'csv', 'tsv', 'markdown'].includes(language)
        const absoluteFilePath = (file as any).path as string | undefined
        const folderPath =
          deriveFolderPathFromRelativeFile(relativePath || file.webkitRelativePath) ||
          deriveFolderPathFromAbsoluteFilePath(absoluteFilePath)
        const wrappedContent = isCode
          ? `文件: ${fileName}\n语言: ${language}\n\n\`\`\`${language}\n${content}\n\`\`\``
          : content

        const result = await ingestSource(
          {
            sourceType: 'file',
            title: fileName,
            content: wrappedContent,
            rawContent: content,
            filePath: absoluteFilePath || relativePath || file.webkitRelativePath || fileName,
            metadata: {
              language,
              ...(folderPath ? { folderPath } : {}),
            },
          },
          getLLMConfig(),
        )

        if (result.sourceId || result.pageId || result.drawerId) {
          importedCount += 1
          if (folderPath) {
            importedTopFolders.add(folderPath.split('/')[0] || folderPath)
          }
        }
        setBatchResults((prev) => [...prev, { ...result, fileName }])
        if (result.pageId) await loadData()
      } catch (err) {
        setBatchResults((prev) => [
          ...prev,
          {
            sourceId: '',
            pageId: '',
            drawerId: '',
            mode: 'fast' as const,
            pageTitle: fileName,
            triplesExtracted: 0,
            errors: [String(err)],
            fileName,
          },
        ])
      }
    }

    if (importedCount > 0) {
      await loadData()
      if (importedTopFolders.size === 1) {
        const [folderPath] = Array.from(importedTopFolders)
        startTransition(() => {
          setSelectedFolderPath(folderPath)
          setActiveCategory('all')
        })
      }
    }

    const failedCount = supportedFiles.length - importedCount
    setIngestPhase(
      importedCount === 0
        ? `❌ 未能导入这 ${supportedFiles.length} 个文件`
        : failedCount > 0
          ? `⚠️ 处理完成：${importedCount} 个成功，${failedCount} 个失败`
          : `✅ 处理完成：${importedCount} 个文件`,
    )
    setIsIngesting(false)
    if (importedCount > 0) triggerAutoCompile()
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }

  function handleDragLeave() {
    setIsDragOver(false)
  }

  function readEntryRecursive(entry: FileSystemEntry): Promise<DirectImportFile[]> {
    return new Promise((resolve) => {
      if (entry.isFile) {
        ;(entry as FileSystemFileEntry).file(
          (file) => resolve([{ file, relativePath: entry.fullPath.replace(/^\/+/, '') }]),
          () => resolve([]),
        )
      } else if (entry.isDirectory) {
        const dirReader = (entry as FileSystemDirectoryEntry).createReader()
        const allFiles: DirectImportFile[] = []

        const readBatch = () => {
          dirReader.readEntries(
            async (entries) => {
              if (entries.length === 0) {
                resolve(allFiles)
                return
              }
              for (const e of entries) {
                const subFiles = await readEntryRecursive(e)
                allFiles.push(...subFiles)
              }
              readBatch()
            },
            () => resolve(allFiles),
          )
        }
        readBatch()
      } else {
        resolve([])
      }
    })
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)

    const allFiles: DirectImportFile[] = []
    const items = e.dataTransfer.items

    if (items && items.length > 0) {
      const entries: FileSystemEntry[] = []
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.()
        if (entry) entries.push(entry)
      }

      if (entries.length > 0) {
        setIsIngesting(true)
        setIngestPhase('🔍 扫描文件...')
        setBatchResults([])

        for (const entry of entries) {
          const files = await readEntryRecursive(entry)
          allFiles.push(...files)
        }

        const supported = allFiles.filter(({ file, relativePath }) => isFileSupported(relativePath || file.name))
        setIngestPhase(`📂 发现 ${supported.length} 个可导入文件`)
        setIsIngesting(false)

        if (supported.length > 0) {
          await handleFilesDirectImport(supported)
        } else {
          setIngestPhase('❌ 没有找到支持的文件类型')
        }
        return
      }
    }

    const files = Array.from(e.dataTransfer.files).map((file) => ({
      file,
      relativePath: file.webkitRelativePath || undefined,
    }))
    if (files.length > 0) {
      await handleFilesDirectImport(files)
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).map((file) => ({
      file,
      relativePath: file.webkitRelativePath || undefined,
    }))
    if (files.length > 0) handleFilesDirectImport(files)
    e.target.value = ''
  }

  // ─── Page Actions ───

  async function handleSavePageEdit() {
    if (!currentPage) return
    await updatePage(currentPage.id, { content: editContent })
    await loadData()
    selectPage(currentPage.id)
  }

  async function handleSaveSourceEdit() {
    if (!currentSource) return
    const nextContent = editContent
    await updateSource(currentSource.id, {
      content: nextContent,
      rawContent: nextContent,
    })

    const linkedDrawer = await findDrawerBySourceId(currentSource.id)
    if (linkedDrawer) {
      await updateDrawer(linkedDrawer.id, { rawContent: nextContent })
    }

    await loadData()
    selectSource(currentSource.id)
  }

  async function handleDeletePage(id: string) {
    await deletePage(id)
    if (selectedPageId === id) {
      closeDetailView()
    }
    await loadData()
  }

  async function handleQuickDeletePage(id: string) {
    const confirmed = window.confirm('确定要删除这条 Wiki 页面吗？')
    if (!confirmed) return
    await handleDeletePage(id)
  }

  async function handleTogglePageFlag(page: WikiPage, flag: 'pinned' | 'starred') {
    const metadata = { ...(page.metadata || {}) }
    metadata[flag] = !metadata[flag]
    await updatePage(page.id, { metadata })
    await loadData()
    if (currentPage?.id === page.id) {
      const next = await getPage(page.id)
      if (next) setCurrentPage(next)
    }
  }

  async function openPageEditor(id: string) {
    const page = await getPage(id)
    if (!page) return
    setCurrentPage(page)
    setCurrentSource(null)
    setCurrentDrawer(null)
    setSelectedPageId(id)
    setShowPageView(true)
    setIsEditing(true)
    setEditContent(page.content)
  }

  async function openSourceEditor(id: string) {
    const source = await getSource(id)
    if (!source) return
    setCurrentSource(source)
    setCurrentPage(null)
    setCurrentDrawer(null)
    setSelectedPageId(null)
    setSelectedSourceId(id)
    setShowPageView(true)
    setIsEditing(true)
    setEditContent(source.rawContent || source.content || '')
  }

  // ─── Query ───

  async function runQuery(rawQuestion: string) {
    const question = rawQuestion.trim()
    if (!question || isQuerying) return

    setQueryText(question)
    setIsQuerying(true)
    setIsResearching(false)
    setShowPageView(false)
    setShowQueryResult(true)
    setQueryBaseAnswer('')
    setQueryAnswer('')
    setQueryStreamContent('')
    setQuerySources([])
    setQueryCitations([])
    setQueryUsedCitationIds([])
    setQueryEvidence(null)
    setQueryMode('synthesis')
    setQueryResearch(null)
    setCurrentPage(null)
    setCurrentSource(null)
    setCurrentDrawer(null)

    try {
      await ensureKnowledgeFolderMetadata()
      const llmConfig = selectedAgentId ? resolveAgentConfig(selectedAgentId) : getLLMConfig()
      let streamedAnswer = ''
      let agentPerspective: string | undefined
      if (selectedAgentId) {
        try {
          const soul = await getSoul(selectedAgentId)
          agentPerspective = renderSoulPrompt(soul)
        } catch {
          /* ignore */
        }
      }
      const result = await queryWikiEnhanced(
        question,
        llmConfig,
        {
          onChunk: (chunk) => {
            streamedAnswer += chunk
            setQueryStreamContent((prev) => prev + chunk)
          },
        },
        agentPerspective,
        {
          folderPath: effectiveFolderScope,
        },
      )
      const baseAnswer = ensureVisibleAnswer(
        result.answer,
        streamedAnswer || '这次已经完成检索，但模型没有稳定产出正文；你可以先查看下方来源链。',
      )
      setQueryBaseAnswer(baseAnswer)
      setQuerySources(result.sourcePageIds)
      setQueryCitations(result.citations || [])
      setQueryUsedCitationIds(result.usedCitationIds || [])
      setQueryEvidence(result.evidence || null)
      setQueryMode(result.answerMode || 'synthesis')

      let research: GroundedResearchReport | null = null
      if (autoResearchEnabled && shouldUseAutoResearch(question)) {
        setIsResearching(true)
        try {
          research = await runGroundedAutoResearch(llmConfig, question, {
            contextAnswer: result.answer,
            maxSources: 6,
          })
          setQueryResearch(research)
        } catch {
          setQueryResearch(null)
        }
        setIsResearching(false)
      }

      const finalAnswer = research?.grounded
        ? await synthesizeHybridKnowledgeAnswer(llmConfig, {
            question,
            knowledgeAnswer: combineAnswerWithResearch(baseAnswer, research),
            research,
          })
        : combineAnswerWithResearch(baseAnswer, research)
      setQueryAnswer(ensureVisibleAnswer(finalAnswer, baseAnswer))
      setShowQueryResult(true)
    } catch (err) {
      setQueryBaseAnswer('')
      setQueryAnswer(`查询失败: ${String(err)}`)
      setQueryCitations([])
      setQueryUsedCitationIds([])
      setQueryResearch(null)
      setShowQueryResult(true)
    }
    setIsQuerying(false)
    setIsResearching(false)
  }

  async function handleQuery() {
    return runQuery(queryText)
  }

  async function handleSidebarAsk() {
    const question = searchText.trim()
    if (!question) return
    setSearchText('')
    return runQuery(question)
  }

  const handleListScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const nextTop = event.currentTarget.scrollTop
    if (listScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(listScrollFrameRef.current)
    }
    listScrollFrameRef.current = window.requestAnimationFrame(() => {
      setListScrollTop(nextTop)
      listScrollFrameRef.current = null
    })
  }, [])

  async function handleArchiveAnswer() {
    if (!queryAnswer || !queryText) return
    const pageId = await fileAnswerAsPage(queryText, queryAnswer, querySources, getLLMConfig(), {
      citations: queryCitations || [],
      research: queryResearch,
      answerMode: queryMode,
      folderPath: effectiveFolderScope,
    })
    await loadData()
    selectPage(pageId)
  }

  async function handleRunExternalResearch() {
    const question = queryText.trim()
    if (!question || isResearching || isQuerying) return

    setIsResearching(true)
    try {
      const llmConfig = selectedAgentId ? resolveAgentConfig(selectedAgentId) : getLLMConfig()
      const research = await runGroundedAutoResearch(llmConfig, question, {
        contextAnswer: queryBaseAnswer || queryAnswer,
        maxSources: 6,
      })
      setQueryResearch(research)
      const baseAnswer = queryBaseAnswer || queryAnswer
      const finalAnswer = research?.grounded
        ? await synthesizeHybridKnowledgeAnswer(llmConfig, {
            question,
            knowledgeAnswer: combineAnswerWithResearch(baseAnswer, research),
            research,
          })
        : combineAnswerWithResearch(baseAnswer, research)
      setQueryAnswer(ensureVisibleAnswer(finalAnswer, baseAnswer))
    } catch {
      // Ignore manual research failures in UI.
    }
    setIsResearching(false)
  }

  // ─── Filtering ───

  const effectiveFolderScope = selectedFolderPath === ALL_FOLDERS_SCOPE ? null : selectedFolderPath
  const sourceFolderMap = useMemo(
    () => new Map(sourceScopeEntries.map((entry) => [entry.id, entry.folderPath])),
    [sourceScopeEntries],
  )
  const fileSourceIdSet = useMemo(() => new Set(sources.map((source) => source.id)), [sources])
  const fileSourceEntries = useMemo(
    () => sourceScopeEntries.filter((entry) => fileSourceIdSet.has(entry.id)),
    [fileSourceIdSet, sourceScopeEntries],
  )
  const scopedPages = useMemo(() => {
    if (!effectiveFolderScope) return pages
    return pages.filter((page) => pageMatchesFolderScope(page, effectiveFolderScope, sourceFolderMap))
  }, [effectiveFolderScope, pages, sourceFolderMap])
  const scopedSources = useMemo(() => {
    if (!effectiveFolderScope) return sources
    return sources.filter((source) => isFolderPathInScope(source.folderPath, effectiveFolderScope))
  }, [effectiveFolderScope, sources])
  const folderOptions = useMemo<KnowledgeFolderOption[]>(
    () => buildKnowledgeFolderOptions({ sourceEntries: fileSourceEntries, pages: [], sourceFolderMap: new Map() }),
    [fileSourceEntries],
  )
  const selectedFolderOption = useMemo(
    () => folderOptions.find((option) => option.path === selectedFolderPath) || null,
    [folderOptions, selectedFolderPath],
  )
  const scopeStats = useMemo(() => {
    const projectSet = new Set<string>()
    let markdownImageCount = 0
    for (const source of scopedSources) {
      projectSet.add(getSourceProjectLabel(source))
      markdownImageCount += countMarkdownImages(source.rawContent || source.content || '')
    }

    const totalPages = scopedPages.length
    const totalSources = scopedSources.length
    const avgConfidence =
      totalPages > 0 ? scopedPages.reduce((sum, page) => sum + (page.confidence || 0), 0) / totalPages : 0
    const avgImportance =
      totalPages > 0 ? scopedPages.reduce((sum, page) => sum + (page.importance || 0), 0) / totalPages : 0

    return {
      totalFiles: scopedSources.length,
      totalProjects: projectSet.size,
      markdownImageCount,
      totalPages,
      totalSources,
      avgConfidence,
      avgImportance,
    }
  }, [scopedPages, scopedSources])
  const intelligence = useMemo(() => buildKnowledgeIntelligence(scopedPages), [scopedPages])
  const indexedSources = useMemo(() => scopedSources.map(buildIndexedSource), [scopedSources])
  const searchTerms = useMemo(() => normalizeSearchTerms(deferredSearchText), [deferredSearchText])
  const searchMatchedSources = useMemo(() => {
    if (searchTerms.length === 0) return indexedSources
    return indexedSources.filter((item) => matchesSearchTerms(item.searchBlob, searchTerms))
  }, [indexedSources, searchTerms])
  const categoryFilters = useMemo<CategoryFilter[]>(() => {
    const counts = new Map<string, number>()
    const labels = new Map<string, string>()
    for (const item of searchMatchedSources) {
      counts.set(item.sourceKind, (counts.get(item.sourceKind) || 0) + 1)
      labels.set(item.sourceKind, item.sourceKindLabel)
    }

    const filters = Array.from(counts.entries())
      .map(([key, count]) => ({
        key,
        label: labels.get(key) || key,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    if (activeCategory !== 'all' && !filters.some((filter) => filter.key === activeCategory)) {
      filters.unshift({
        key: activeCategory,
        label: activeCategory,
        count: 0,
      })
    }

    return filters
  }, [activeCategory, searchMatchedSources])
  const filteredSources = useMemo(() => {
    if (activeCategory === 'all') return searchMatchedSources
    return searchMatchedSources.filter((item) => item.sourceKind === activeCategory)
  }, [activeCategory, searchMatchedSources])
  useEffect(() => {
    if (selectedFolderPath === ALL_FOLDERS_SCOPE) return
    if (sources.length === 0 && fileSourceEntries.length === 0) return
    if (folderOptions.some((option) => option.path === selectedFolderPath)) return
    setSelectedFolderPath(ALL_FOLDERS_SCOPE)
  }, [fileSourceEntries.length, folderOptions, selectedFolderPath, sources.length])
  const handleCategoryFilterSelect = useCallback((nextCategory: string) => {
    startTransition(() => {
      setActiveCategory(nextCategory)
    })
  }, [])
  const isFilteringDeferred = searchText !== deferredSearchText
  const virtualSourceWindow = useMemo(() => {
    const totalCount = filteredSources.length
    const viewportHeight = listViewportHeight || PAGE_ROW_HEIGHT * 6
    const startIndex = Math.max(0, Math.floor(listScrollTop / PAGE_ROW_HEIGHT) - PAGE_ROW_OVERSCAN)
    const visibleCount = Math.max(8, Math.ceil(viewportHeight / PAGE_ROW_HEIGHT) + PAGE_ROW_OVERSCAN * 2)
    const endIndex = Math.min(totalCount, startIndex + visibleCount)

    return {
      startIndex,
      endIndex,
      totalHeight: totalCount * PAGE_ROW_HEIGHT,
      items: filteredSources.slice(startIndex, endIndex),
    }
  }, [filteredSources, listScrollTop, listViewportHeight])
  const recentScopedSources = useMemo(
    () =>
      [...scopedSources]
        .sort((left, right) =>
          (right.updatedAt || right.createdAt || '').localeCompare(left.updatedAt || left.createdAt || ''),
        )
        .slice(0, 4),
    [scopedSources],
  )
  const featuredProjects = useMemo(
    () =>
      [...folderOptions]
        .sort(
          (left, right) =>
            right.sourceCount - left.sourceCount || compareDisplayPath(left.displayPath, right.displayPath),
        )
        .slice(0, 4),
    [folderOptions],
  )

  useEffect(() => {
    if (subTab !== 'pages') return
    listRef.current?.scrollTo({ top: 0 })
    setListScrollTop(0)
  }, [activeCategory, deferredSearchText, effectiveFolderScope, subTab])

  const groupedQueryCitations = useMemo(
    () => ({
      pages: (queryCitations || []).filter((citation) => citation.kind === 'page'),
      sources: (queryCitations || []).filter((citation) => citation.kind === 'source'),
      drawers: (queryCitations || []).filter((citation) => citation.kind === 'drawer'),
      chunks: (queryCitations || []).filter((citation) => citation.kind === 'chunk'),
    }),
    [queryCitations],
  )
  const visibleQueryAnswer = queryAnswer || queryBaseAnswer || queryStreamContent
  const queryStatusText = isResearching
    ? '正在联网补强，并把外部前沿信息与你的知识库证据一起综合判断…'
    : isQuerying
      ? queryStreamContent
        ? '正在整理侦查结论与证据链…'
        : '正在搜索页面、来源、抽屉与片段证据…'
      : !visibleQueryAnswer
        ? '这次查询暂时没有产出正文，但如果下方已有证据链，你仍然可以直接点开继续追查。'
        : ''

  useEffect(() => {
    if (!showQueryResult) return
    queryResultRef.current?.scrollTo({ top: 0 })
  }, [showQueryResult, queryAnswer, queryBaseAnswer, queryStreamContent])

  // ─── Render ───

  return (
    <div className="kv-tab" style={{ position: 'relative' }}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        accept=".md,.txt,.json,.csv,.ts,.tsx,.js,.jsx,.py,.go,.rs,.java,.html,.css,.yaml,.yml,.sql,.sh"
        onChange={handleFileInput}
      />

      {/* ─── 左面板 ─── */}
      <div className="kv-tab__left">
        <div className="kv-tab__left-tabs">
          {subTabs.map((t) => (
            <button
              key={t.id}
              className={`kv-tab__left-tab ${subTab === t.id ? 'kv-tab__left-tab--active' : ''}`}
              onClick={() => {
                setSubTab(t.id)
                if (t.id !== 'pages') {
                  setShowPageView(false)
                  setShowQueryResult(false)
                }
              }}
              title={t.label}
            >
              {t.icon}
            </button>
          ))}
        </div>

        {/* 搜索框兼提问 */}
        {subTab === 'pages' && (
          <div className="kv-tab__search">
            <div className="kv-tab__finder-card">
              <div className="kv-tab__finder-row">
                <input
                  className="kv-tab__search-input kv-tab__search-input--sidebar"
                  placeholder="搜索文件，或直接发问"
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    if ((event.metaKey || event.ctrlKey) && searchText.trim()) {
                      event.preventDefault()
                      handleSidebarAsk()
                      return
                    }
                    if (filteredSources[0]) {
                      event.preventDefault()
                      selectSource(filteredSources[0].source.id)
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  className="kv-tab__btn kv-tab__ask-btn"
                  disabled={!searchText.trim() || isQuerying}
                  title="向知识库提问"
                  onClick={handleSidebarAsk}
                >
                  {isQuerying ? '⏳' : '提问'}
                </button>
              </div>

              <div className="kv-tab__scope-row kv-tab__scope-row--stacked">
                <div className="kv-tab__scope-heading">
                  <span className="kv-tab__scope-label">文件项目</span>
                  <span className="kv-tab__scope-current">
                    {effectiveFolderScope
                      ? selectedFolderOption?.displayPath || getFolderDisplayPath(effectiveFolderScope)
                      : '全部项目'}
                  </span>
                </div>
                <select
                  className="kv-tab__scope-select kv-tab__scope-select--sidebar"
                  value={selectedFolderPath}
                  onChange={(event) => {
                    const nextFolderPath = event.target.value
                    startTransition(() => {
                      setSelectedFolderPath(nextFolderPath)
                      setActiveCategory('all')
                    })
                  }}
                  title={effectiveFolderScope ? getFolderDisplayPath(effectiveFolderScope) : '全部文件项目'}
                >
                  <option value={ALL_FOLDERS_SCOPE}>全部文件项目</option>
                  {folderOptions.map((option) => (
                    <option key={option.path} value={option.path}>
                      {`${'  '.repeat(option.depth)}${option.label} · ${option.sourceCount}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="kv-tab__finder-meta">
                <span>{scopeStats.totalFiles} 文件</span>
                <span>{scopeStats.totalProjects} 项目</span>
                <span>{isFilteringDeferred ? '整理中' : `${filteredSources.length} 命中`}</span>
              </div>

              <div className="kv-tab__filter-group kv-tab__filter-group--minimal">
                <button
                  className={`kv-tab__filter-chip ${activeCategory === 'all' ? 'kv-tab__filter-chip--active' : ''}`}
                  onClick={() => handleCategoryFilterSelect('all')}
                >
                  全部
                </button>
                {categoryFilters.map((category) => (
                  <button
                    key={category.key}
                    className={`kv-tab__filter-chip ${activeCategory === category.key ? 'kv-tab__filter-chip--active' : ''}`}
                    onClick={() => handleCategoryFilterSelect(category.key)}
                  >
                    {category.label} {category.count}
                  </button>
                ))}
                {(activeCategory !== 'all' || searchText.trim()) && (
                  <button
                    className="kv-tab__filter-chip"
                    onClick={() => {
                      startTransition(() => {
                        setSearchText('')
                        setActiveCategory('all')
                      })
                    }}
                  >
                    清空
                  </button>
                )}
              </div>

              <div className="kv-tab__filter-note">回车打开首条，⌘/Ctrl + Enter 直接向知识库发问</div>
            </div>
          </div>
        )}

        {/* 代谢率指示器 */}
        {drawerStats && drawerStats.uncompiledCount > 0 && (
          <div className="kv-tab__metabolism">
            <span className="kv-tab__metabolism-label">METABOLISM: {drawerStats.uncompiledCount} DRAWERS PENDING</span>
            <button
              className="kv-tab__btn"
              style={{ fontSize: '0.6rem', padding: '3px 8px' }}
              disabled={isCompiling}
              onClick={async () => {
                setIsCompiling(true)
                setCompileProgress('启动编译...')
                try {
                  const config = getCompileLLMConfig()
                  await runCompileCycle(config, 20, (p) => setCompileProgress(p.message))
                  await loadData()
                  setCompileProgress('✅ 编译完成')
                } catch {
                  // 回退到 IPC
                  try {
                    const electronAPI = (window as any)?.electronAPI
                    if (electronAPI?.triggerWikiCompile) {
                      await electronAPI.triggerWikiCompile()
                      await loadData()
                      setCompileProgress('✅ 编译完成 (IPC)')
                    }
                  } catch {
                    setCompileProgress('❌ 编译失败')
                  }
                }
                setIsCompiling(false)
              }}
            >
              {isCompiling ? compileProgress || '⏳' : '⚡'} 编译
            </button>
          </div>
        )}

        <div ref={listRef} className="kv-tab__list" onScroll={subTab === 'pages' ? handleListScroll : undefined}>
          {subTab === 'pages' &&
            (filteredSources.length === 0 ? (
              <div className="kv-tab__list-empty kv-tab__list-empty--poetic">
                <div className="kv-tab__list-empty-orbit" />
                <div className="kv-tab__list-empty-title">
                  {effectiveFolderScope ? '这个项目还没有被点亮' : '这里还很安静'}
                </div>
                <div className="kv-tab__list-empty-hint">
                  {effectiveFolderScope
                    ? '把这个项目里的文件轻轻置入进来，索引、图片与可编辑内容就会在这里慢慢展开。'
                    : '选择一个文件项目，或者从左上角“+”页置入整个文件夹，让这里慢慢长出清晰的目录。'}
                </div>
                <div className="kv-tab__empty-actions">
                  {(activeCategory !== 'all' || searchText.trim()) && (
                    <button
                      className="kv-tab__btn kv-tab__btn--subtle"
                      onClick={() => {
                        startTransition(() => {
                          setSearchText('')
                          setActiveCategory('all')
                        })
                      }}
                    >
                      清空
                    </button>
                  )}
                  {searchText.trim() && (
                    <button className="kv-tab__btn" disabled={isQuerying} onClick={handleSidebarAsk}>
                      直接提问
                    </button>
                  )}
                  {!searchText.trim() && (
                    <button className="kv-tab__btn kv-tab__btn--subtle" onClick={() => setSubTab('ingest')}>
                      前往 + 页
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div
                className="kv-tab__virtual-space"
                style={{ height: Math.max(virtualSourceWindow.totalHeight, listViewportHeight) }}
              >
                {virtualSourceWindow.items.map((item, index) => {
                  const source = item.source
                  const top = (virtualSourceWindow.startIndex + index) * PAGE_ROW_HEIGHT
                  return (
                    <div
                      key={source.id}
                      className={`kv-tab__list-item kv-tab__list-item--virtual ${selectedSourceId === source.id ? 'kv-tab__list-item--active' : ''}`}
                      style={{ top, height: PAGE_ROW_HEIGHT }}
                      onClick={() => selectSource(source.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') selectSource(source.id)
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="kv-tab__list-item-header">
                        <div className="kv-tab__list-item-title-wrap">
                          <span className="kv-tab__list-flag">{item.projectLabel}</span>
                          <div className="kv-tab__list-item-title">
                            {source.title || getPathLeafName(source.filePath)}
                          </div>
                        </div>
                        <div className="kv-tab__list-item-actions">
                          <button
                            className="kv-tab__list-action-btn"
                            title="快速编辑"
                            onClick={(e) => {
                              e.stopPropagation()
                              openSourceEditor(source.id)
                            }}
                          >
                            ✏️
                          </button>
                        </div>
                      </div>
                      <div className="kv-tab__list-item-preview">{item.preview}</div>
                      <div className="kv-tab__list-item-meta">
                        <span className="kv-tab__list-item-badge">{item.sourceKindLabel}</span>
                        <span className="kv-tab__list-item-badge">{item.extensionLabel}</span>
                        {item.hasImages && <span className="kv-tab__list-item-badge">含图</span>}
                        <span className="kv-tab__list-item-badge">{item.displayPath}</span>
                        <span className="kv-tab__list-item-time">{item.updatedLabel}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}

          {subTab === 'insights' &&
            (intelligence.anchors.length === 0 ? (
              <div className="kv-tab__list-empty">等待更多页面后，这里会出现策展入口与桥接提示</div>
            ) : (
              intelligence.anchors.map((anchor) => (
                <div key={anchor.pageId} className="kv-tab__list-item" onClick={() => selectPage(anchor.pageId)}>
                  <div className="kv-tab__list-item-title">{anchor.title}</div>
                  <div className="kv-tab__list-item-preview">{anchor.reason}</div>
                  <div className="kv-tab__list-item-meta">
                    <span className="kv-tab__list-item-badge">{anchor.category}</span>
                    <span className="kv-tab__list-item-time">{Math.round(anchor.score)}</span>
                  </div>
                </div>
              ))
            ))}

          {subTab === 'ingest' && (
            <div className="kv-tab__list-empty">左侧这里只负责浏览与选择；导入请使用左上角“+”页。</div>
          )}
        </div>
      </div>

      {/* ─── 右内容区 ─── */}
      <div className="kv-tab__right">
        {/* 首页 */}
        {!showPageView && !showQueryResult && subTab === 'pages' && (
          <div className="kv-tab__home">
            {effectiveFolderScope && (
              <div className="kv-tab__scope-banner">
                当前文件项目：{selectedFolderOption?.displayPath || getFolderDisplayPath(effectiveFolderScope)}
              </div>
            )}
            <div className="kv-tab__home-icon">📚</div>
            <div className="kv-tab__home-title">知识库</div>
            <div className="kv-tab__home-subtitle">
              这里展示的是已置入文件项目及其文件索引；支持切换单个项目或查看全部项目，Markdown
              文件中的图片也会直接读取显示。
              {effectiveFolderScope
                ? ' 当前视图与左侧索引都已收束到这个文件项目范围。'
                : ' 右上角“+”页负责把单文件、整个文件夹与 Vault 批量置入这里。'}
            </div>
            {scopeStats && (
              <div className="kv-tab__home-stats">
                <div className="kv-tab__stat-card">
                  <div className="kv-tab__stat-value">{scopeStats.totalFiles}</div>
                  <div className="kv-tab__stat-label">文件</div>
                </div>
                <div className="kv-tab__stat-card">
                  <div className="kv-tab__stat-value">{scopeStats.totalProjects}</div>
                  <div className="kv-tab__stat-label">项目</div>
                </div>
                <div className="kv-tab__stat-card">
                  <div className="kv-tab__stat-value">{scopeStats.markdownImageCount}</div>
                  <div className="kv-tab__stat-label">Markdown 图片</div>
                </div>
              </div>
            )}

            <div className="kv-tab__home-panels">
              <div className="kv-tab__home-panel">
                <div className="kv-tab__home-panel-title">{effectiveFolderScope ? '当前项目索引' : '文件项目'}</div>
                {effectiveFolderScope
                  ? filteredSources.slice(0, 4).map((item) => (
                      <button
                        key={item.source.id}
                        className="kv-tab__home-link"
                        onClick={() => selectSource(item.source.id)}
                      >
                        <span>{item.source.title || getPathLeafName(item.source.filePath)}</span>
                        <span>{item.displayPath}</span>
                      </button>
                    ))
                  : featuredProjects.map((project) => (
                      <button
                        key={project.path}
                        className="kv-tab__home-link"
                        onClick={() => {
                          startTransition(() => {
                            setSelectedFolderPath(project.path)
                            setActiveCategory('all')
                          })
                        }}
                      >
                        <span>{project.displayPath}</span>
                        <span>{project.sourceCount} 个文件</span>
                      </button>
                    ))}
                {(effectiveFolderScope ? filteredSources.length === 0 : featuredProjects.length === 0) && (
                  <div className="kv-tab__home-signal">这里会在你导入文件项目后，显示当前项目索引或全部项目入口。</div>
                )}
              </div>
              <div className="kv-tab__home-panel">
                <div className="kv-tab__home-panel-title">最近文件</div>
                {recentScopedSources.map((source) => (
                  <button key={source.id} className="kv-tab__home-link" onClick={() => selectSource(source.id)}>
                    <span>{source.title || getPathLeafName(source.filePath)}</span>
                    <span>{getSourceDisplayPath(source)}</span>
                  </button>
                ))}
                {recentScopedSources.length === 0 && (
                  <div className="kv-tab__home-signal">
                    从左上角“+”页置入单文件、整个文件夹或 Vault 后，最近文件会出现在这里。
                  </div>
                )}
              </div>
            </div>

            {/* 提问框 */}
            <div className="kv-tab__home-query">
              <div className="kv-tab__home-query-title">直接向知识库提问</div>
              <div className="kv-tab__home-query-row">
                <input
                  className="kv-tab__search-input"
                  placeholder="向知识库提问..."
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && queryText.trim()) {
                      e.preventDefault()
                      handleQuery()
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <button className="kv-tab__btn" disabled={!queryText.trim() || isQuerying} onClick={handleQuery}>
                  {isQuerying ? '⏳' : '🔍 提问'}
                </button>
              </div>
              <label className="kv-tab__research-toggle">
                <input
                  type="checkbox"
                  checked={autoResearchEnabled}
                  onChange={(e) => setAutoResearchEnabled(e.target.checked)}
                />
                如有必要自动联网补强
              </label>
            </div>
            {agents.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 6,
                  marginTop: 'var(--hd-space-sm)',
                }}
              >
                <span style={{ fontSize: '0.7rem', color: 'var(--hd-text-muted)' }}>视角：</span>
                <select
                  style={{
                    fontSize: '0.72rem',
                    background: 'var(--hd-bg-deep)',
                    color: 'var(--hd-text-secondary)',
                    border: '1px solid var(--hd-border)',
                    borderRadius: 'var(--hd-radius-sm)',
                    padding: '2px 6px',
                    cursor: 'pointer',
                  }}
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                >
                  <option value="">默认</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.icon} {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {!showPageView && !showQueryResult && subTab === 'insights' && (
          <IntelligencePanel intelligence={intelligence} pages={scopedPages} onSelectPage={selectPage} />
        )}

        {/* 页面浏览 */}
        {showPageView && currentPage && (
          <div className="kv-tab__page-view">
            <div className="kv-tab__page-header">
              <div className="kv-tab__page-title-area">
                <div className="kv-tab__page-title">{currentPage.title}</div>
                <div className="kv-tab__page-meta">
                  <span className="kv-tab__list-item-badge">{getKnowledgePageLens(currentPage).label}</span>
                  {isPagePinned(currentPage) && <span className="kv-tab__list-item-badge">置顶</span>}
                  {isPageStarred(currentPage) && <span className="kv-tab__list-item-badge">收藏</span>}
                  <span className="kv-tab__list-item-badge">v{currentPage.version}</span>
                  <span className="kv-tab__list-item-badge">{(currentPage.confidence * 100).toFixed(0)}%</span>
                  <span className="kv-tab__list-item-time">{currentPage.updatedAt?.slice(0, 10)}</span>
                </div>
              </div>
              <div className="kv-tab__page-actions">
                <button className="kv-tab__btn kv-tab__btn--subtle" onClick={closeDetailView}>
                  ← 返回
                </button>
                {isEditing ? (
                  <button className="kv-tab__btn" onClick={handleSavePageEdit}>
                    ✅ 保存
                  </button>
                ) : (
                  <button
                    className="kv-tab__btn kv-tab__btn--subtle"
                    onClick={() => {
                      setIsEditing(true)
                      setEditContent(currentPage.content)
                    }}
                  >
                    ✏️ 编辑
                  </button>
                )}
                <button
                  className="kv-tab__btn kv-tab__btn--subtle"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(currentPage.content)
                    } catch {}
                  }}
                >
                  📋 复制
                </button>
                <button className="kv-tab__btn kv-tab__btn--subtle" onClick={() => handleDeletePage(currentPage.id)}>
                  🗑️
                </button>
              </div>
            </div>
            <div className="kv-tab__page-body">
              {isEditing ? (
                <textarea
                  className="kv-tab__edit-textarea"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                />
              ) : (
                <div className="kv-tab__page-content">
                  {renderMarkdown(
                    currentPage.content,
                    selectDrawer,
                    handleWikiLinkClick,
                    typeof currentPage.metadata?.sourceFilePath === 'string'
                      ? currentPage.metadata.sourceFilePath
                      : undefined,
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {showPageView && !currentPage && currentSource && (
          <div className="kv-tab__page-view">
            <div className="kv-tab__page-header">
              <div className="kv-tab__page-title-area">
                <div className="kv-tab__page-title">{currentSource.title || '未命名来源'}</div>
                <div className="kv-tab__page-meta">
                  <span className="kv-tab__list-item-badge">{classifySourceKind(currentSource).label}</span>
                  <span className="kv-tab__list-item-badge">
                    {getSourceExtension(currentSource).toUpperCase() ||
                      (currentSource.sourceType || 'FILE').toUpperCase()}
                  </span>
                  <span className="kv-tab__list-item-badge">{getSourceProjectLabel(currentSource)}</span>
                  {countMarkdownImages(currentSource.rawContent || currentSource.content || '') > 0 && (
                    <span className="kv-tab__list-item-badge">含图</span>
                  )}
                  <span className="kv-tab__list-item-time">{currentSource.updatedAt?.slice(0, 10)}</span>
                </div>
              </div>
              <div className="kv-tab__page-actions">
                <button className="kv-tab__btn kv-tab__btn--subtle" onClick={closeDetailView}>
                  ← 返回
                </button>
                {isEditing ? (
                  <button className="kv-tab__btn" onClick={handleSaveSourceEdit}>
                    ✅ 保存
                  </button>
                ) : (
                  <button
                    className="kv-tab__btn kv-tab__btn--subtle"
                    onClick={() => {
                      setIsEditing(true)
                      setEditContent(currentSource.rawContent || currentSource.content || '')
                    }}
                  >
                    ✏️ 编辑
                  </button>
                )}
                <button
                  className="kv-tab__btn kv-tab__btn--subtle"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(currentSource.rawContent || currentSource.content || '')
                    } catch {}
                  }}
                >
                  📋 复制
                </button>
                {currentSource.url && (
                  <a
                    className="kv-tab__btn kv-tab__btn--subtle"
                    href={currentSource.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    ↗ 打开链接
                  </a>
                )}
              </div>
            </div>
            <div className="kv-tab__page-body">
              <div className="kv-tab__detail-meta">
                <div className="kv-tab__detail-meta-row">
                  <span className="kv-tab__detail-meta-label">文件项目</span>
                  <span className="kv-tab__detail-meta-value">
                    {currentSource.folderPath ? getFolderDisplayPath(currentSource.folderPath) : '未分项目'}
                  </span>
                </div>
                {currentSource.url && (
                  <div className="kv-tab__detail-meta-row">
                    <span className="kv-tab__detail-meta-label">原始链接</span>
                    <span className="kv-tab__detail-meta-value">{currentSource.url}</span>
                  </div>
                )}
                {currentSource.filePath && (
                  <div className="kv-tab__detail-meta-row">
                    <span className="kv-tab__detail-meta-label">文件路径</span>
                    <span className="kv-tab__detail-meta-value">{currentSource.filePath}</span>
                  </div>
                )}
              </div>
              {isEditing ? (
                <textarea
                  className="kv-tab__edit-textarea"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                />
              ) : (
                <div className="kv-tab__page-content">
                  {renderMarkdown(
                    currentSource.rawContent || currentSource.content || '暂无来源内容',
                    undefined,
                    handleWikiLinkClick,
                    currentSource.filePath || undefined,
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {showPageView && !currentPage && !currentSource && currentDrawer && (
          <div className="kv-tab__page-view">
            <div className="kv-tab__page-header">
              <div className="kv-tab__page-title-area">
                <div className="kv-tab__page-title">
                  {currentDrawer.title || `抽屉 ${currentDrawer.id.slice(0, 8)}`}
                </div>
                <div className="kv-tab__page-meta">
                  <span className="kv-tab__list-item-badge">{currentDrawer.sourceType || 'drawer'}</span>
                  <span className="kv-tab__list-item-badge">{`${currentDrawer.wing}/${currentDrawer.hall}/${currentDrawer.room}`}</span>
                  <span className="kv-tab__list-item-time">{currentDrawer.updatedAt?.slice(0, 10)}</span>
                </div>
              </div>
              <div className="kv-tab__page-actions">
                <button className="kv-tab__btn kv-tab__btn--subtle" onClick={closeDetailView}>
                  ← 返回
                </button>
              </div>
            </div>
            <div className="kv-tab__page-body">
              <div className="kv-tab__detail-meta">
                {currentDrawer.sourceUrl && (
                  <div className="kv-tab__detail-meta-row">
                    <span className="kv-tab__detail-meta-label">原始链接</span>
                    <span className="kv-tab__detail-meta-value">{currentDrawer.sourceUrl}</span>
                  </div>
                )}
                {currentDrawer.filePath && (
                  <div className="kv-tab__detail-meta-row">
                    <span className="kv-tab__detail-meta-label">文件路径</span>
                    <span className="kv-tab__detail-meta-value">{currentDrawer.filePath}</span>
                  </div>
                )}
              </div>
              <div className="kv-tab__page-content">
                {renderMarkdown(
                  currentDrawer.rawContent || '暂无抽屉内容',
                  undefined,
                  handleWikiLinkClick,
                  currentDrawer.filePath || undefined,
                )}
              </div>
            </div>
          </div>
        )}

        {/* 查询结果 */}
        {showQueryResult && !showPageView && (
          <div className="kv-tab__query">
            <div className="kv-tab__query-input-area">
              {effectiveFolderScope && (
                <div className="kv-tab__scope-banner kv-tab__scope-banner--compact">
                  当前检索范围：{selectedFolderOption?.displayPath || getFolderDisplayPath(effectiveFolderScope)}
                </div>
              )}
              <textarea
                className="kv-tab__query-textarea"
                placeholder="输入问题查询知识库..."
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    handleQuery()
                  }
                }}
              />
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--hd-space-sm)',
                  marginTop: 'var(--hd-space-sm)',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--hd-text-muted)' }}>⌘+Enter</span>
                  <label className="kv-tab__research-toggle kv-tab__research-toggle--inline">
                    <input
                      type="checkbox"
                      checked={autoResearchEnabled}
                      onChange={(e) => setAutoResearchEnabled(e.target.checked)}
                    />
                    自动联网补强
                  </label>
                  {agents.length > 0 && (
                    <select
                      style={{
                        fontSize: '0.72rem',
                        background: 'var(--hd-bg-deep)',
                        color: 'var(--hd-text-secondary)',
                        border: '1px solid var(--hd-border)',
                        borderRadius: 'var(--hd-radius-sm)',
                        padding: '2px 6px',
                        cursor: 'pointer',
                      }}
                      value={selectedAgentId}
                      onChange={(e) => setSelectedAgentId(e.target.value)}
                    >
                      <option value="">默认视角</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.icon} {a.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    className="kv-tab__btn kv-tab__btn--subtle"
                    onClick={() => {
                      setShowQueryResult(false)
                      setQueryBaseAnswer('')
                      setQueryAnswer('')
                      setQueryStreamContent('')
                      setQueryCitations([])
                      setQueryUsedCitationIds([])
                      setQueryResearch(null)
                    }}
                  >
                    ← 返回
                  </button>
                  <button className="kv-tab__btn" disabled={!queryText.trim() || isQuerying} onClick={handleQuery}>
                    {isQuerying ? '⏳ 查询中...' : '🔍 查询'}
                  </button>
                </div>
              </div>
            </div>
            <div className="kv-tab__query-result" ref={queryResultRef}>
              {queryStatusText && <div className="kv-tab__query-status">{queryStatusText}</div>}
              {queryEvidence && (
                <div className="kv-tab__query-evidence">
                  <div className="kv-tab__query-evidence-card">
                    <span className="kv-tab__query-evidence-label">查询方式</span>
                    <span className="kv-tab__query-evidence-value">
                      {queryMode === 'count'
                        ? '语料统计'
                        : queryMode === 'direct'
                          ? '直接命中'
                          : queryMode === 'curation'
                            ? '策展判断'
                            : '综合回答'}
                    </span>
                  </div>
                  {queryEvidence.term && (
                    <div className="kv-tab__query-evidence-card">
                      <span className="kv-tab__query-evidence-label">关键词</span>
                      <span className="kv-tab__query-evidence-value">{queryEvidence.term}</span>
                    </div>
                  )}
                  {typeof queryEvidence.pageHits === 'number' && (
                    <div className="kv-tab__query-evidence-card">
                      <span className="kv-tab__query-evidence-label">页面命中</span>
                      <span className="kv-tab__query-evidence-value">{queryEvidence.pageHits}</span>
                    </div>
                  )}
                  {typeof queryEvidence.sourceHits === 'number' && (
                    <div className="kv-tab__query-evidence-card">
                      <span className="kv-tab__query-evidence-label">来源命中</span>
                      <span className="kv-tab__query-evidence-value">{queryEvidence.sourceHits}</span>
                    </div>
                  )}
                  {typeof queryEvidence.drawerHits === 'number' && queryEvidence.drawerHits > 0 && (
                    <div className="kv-tab__query-evidence-card">
                      <span className="kv-tab__query-evidence-label">生肉命中</span>
                      <span className="kv-tab__query-evidence-value">{queryEvidence.drawerHits}</span>
                    </div>
                  )}
                  {typeof queryEvidence.chunkHits === 'number' && queryEvidence.chunkHits > 0 && (
                    <div className="kv-tab__query-evidence-card">
                      <span className="kv-tab__query-evidence-label">片段命中</span>
                      <span className="kv-tab__query-evidence-value">{queryEvidence.chunkHits}</span>
                    </div>
                  )}
                  {typeof queryEvidence.pageMentions === 'number' && (
                    <div className="kv-tab__query-evidence-card">
                      <span className="kv-tab__query-evidence-label">页面提及</span>
                      <span className="kv-tab__query-evidence-value">{queryEvidence.pageMentions}</span>
                    </div>
                  )}
                  {typeof queryEvidence.sourceMentions === 'number' && (
                    <div className="kv-tab__query-evidence-card">
                      <span className="kv-tab__query-evidence-label">来源提及</span>
                      <span className="kv-tab__query-evidence-value">{queryEvidence.sourceMentions}</span>
                    </div>
                  )}
                  <div className="kv-tab__query-evidence-card">
                    <span className="kv-tab__query-evidence-label">外部补强</span>
                    <span className="kv-tab__query-evidence-value">
                      {isResearching
                        ? '检索中…'
                        : queryResearch?.grounded
                          ? `${queryResearch.sources.length} 条来源`
                          : autoResearchEnabled
                            ? '按需触发'
                            : '关闭'}
                    </span>
                  </div>
                </div>
              )}
              {visibleQueryAnswer && renderMarkdown(visibleQueryAnswer, selectDrawer, handleWikiLinkClick)}
              {queryResearch?.grounded && (
                <div className="kv-tab__query-sources">
                  <div className="kv-tab__query-sources-header">
                    <span className="kv-tab__query-sources-title">外部前沿来源</span>
                    <span className="kv-tab__query-sources-subtitle">
                      这些来源用于补强时效性、趋势性与权威性信息，避免知识库只在内部自我循环。
                    </span>
                  </div>
                  <div className="kv-tab__query-citation-grid">
                    {queryResearch.sources.map((source) => (
                      <a
                        key={source.url}
                        className="kv-tab__query-citation-card kv-tab__query-citation-card--external"
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <div className="kv-tab__query-citation-topline">
                          <span className="kv-tab__query-citation-tag">{source.authority.toUpperCase()}</span>
                          <span className="kv-tab__query-citation-kind">{source.domain || 'WEB'}</span>
                        </div>
                        <div className="kv-tab__query-citation-title">{source.title}</div>
                        <div className="kv-tab__query-citation-excerpt">{source.snippet || source.url}</div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {queryCitations && queryCitations.length > 0 && !isQuerying && (
                <div className="kv-tab__query-sources">
                  <div className="kv-tab__query-sources-header">
                    <span className="kv-tab__query-sources-title">完整来源链</span>
                    <span className="kv-tab__query-sources-subtitle">
                      高亮项表示答案里显式引用过；其余是本次综合时一并检索到的相关证据。
                    </span>
                  </div>

                  {groupedQueryCitations.pages.length > 0 && (
                    <div className="kv-tab__query-citation-group">
                      <div className="kv-tab__query-citation-group-title">页面证据</div>
                      <div className="kv-tab__query-citation-grid">
                        {groupedQueryCitations.pages.map((citation) => (
                          <button
                            key={citation.label}
                            className={`kv-tab__query-citation-card ${queryUsedCitationIds.includes(citation.label) ? 'kv-tab__query-citation-card--used' : ''}`}
                            onClick={() => handleCitationClick(citation)}
                          >
                            <div className="kv-tab__query-citation-topline">
                              <span className="kv-tab__query-citation-tag">{citation.label}</span>
                              <span className="kv-tab__query-citation-kind">PAGE</span>
                            </div>
                            <div className="kv-tab__query-citation-title">{citation.title}</div>
                            {citation.meta.length > 0 && (
                              <div className="kv-tab__query-citation-meta">{citation.meta.join(' · ')}</div>
                            )}
                            <div className="kv-tab__query-citation-excerpt">{citation.excerpt}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {groupedQueryCitations.sources.length > 0 && (
                    <div className="kv-tab__query-citation-group">
                      <div className="kv-tab__query-citation-group-title">原始来源</div>
                      <div className="kv-tab__query-citation-grid">
                        {groupedQueryCitations.sources.map((citation) => (
                          <button
                            key={citation.label}
                            className={`kv-tab__query-citation-card ${queryUsedCitationIds.includes(citation.label) ? 'kv-tab__query-citation-card--used' : ''}`}
                            onClick={() => handleCitationClick(citation)}
                          >
                            <div className="kv-tab__query-citation-topline">
                              <span className="kv-tab__query-citation-tag">{citation.label}</span>
                              <span className="kv-tab__query-citation-kind">SOURCE</span>
                            </div>
                            <div className="kv-tab__query-citation-title">{citation.title}</div>
                            {citation.meta.length > 0 && (
                              <div className="kv-tab__query-citation-meta">{citation.meta.join(' · ')}</div>
                            )}
                            <div className="kv-tab__query-citation-excerpt">{citation.excerpt}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {groupedQueryCitations.drawers.length > 0 && (
                    <div className="kv-tab__query-citation-group">
                      <div className="kv-tab__query-citation-group-title">生肉抽屉</div>
                      <div className="kv-tab__query-citation-grid">
                        {groupedQueryCitations.drawers.map((citation) => (
                          <button
                            key={citation.label}
                            className={`kv-tab__query-citation-card ${queryUsedCitationIds.includes(citation.label) ? 'kv-tab__query-citation-card--used' : ''}`}
                            onClick={() => handleCitationClick(citation)}
                          >
                            <div className="kv-tab__query-citation-topline">
                              <span className="kv-tab__query-citation-tag">{citation.label}</span>
                              <span className="kv-tab__query-citation-kind">DRAWER</span>
                            </div>
                            <div className="kv-tab__query-citation-title">{citation.title}</div>
                            {citation.meta.length > 0 && (
                              <div className="kv-tab__query-citation-meta">{citation.meta.join(' · ')}</div>
                            )}
                            <div className="kv-tab__query-citation-excerpt">{citation.excerpt}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {groupedQueryCitations.chunks.length > 0 && (
                    <div className="kv-tab__query-citation-group">
                      <div className="kv-tab__query-citation-group-title">关键片段</div>
                      <div className="kv-tab__query-citation-grid">
                        {groupedQueryCitations.chunks.map((citation) => (
                          <button
                            key={citation.label}
                            className={`kv-tab__query-citation-card ${queryUsedCitationIds.includes(citation.label) ? 'kv-tab__query-citation-card--used' : ''}`}
                            onClick={() => handleCitationClick(citation)}
                          >
                            <div className="kv-tab__query-citation-topline">
                              <span className="kv-tab__query-citation-tag">{citation.label}</span>
                              <span className="kv-tab__query-citation-kind">CHUNK</span>
                            </div>
                            <div className="kv-tab__query-citation-title">{citation.title}</div>
                            {citation.meta.length > 0 && (
                              <div className="kv-tab__query-citation-meta">{citation.meta.join(' · ')}</div>
                            )}
                            <div className="kv-tab__query-citation-excerpt">{citation.excerpt}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {queryAnswer && !isQuerying && (
                <div className="kv-tab__query-archive kv-tab__query-actions">
                  <button
                    className="kv-tab__btn kv-tab__btn--subtle"
                    disabled={isResearching}
                    onClick={handleRunExternalResearch}
                  >
                    {isResearching ? '🌐 补强中...' : '🌐 联网补强'}
                  </button>
                  <button className="kv-tab__btn kv-tab__btn--gold" onClick={handleArchiveAnswer}>
                    📥 归档为 Wiki 页面
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 摄入视图 */}
        {subTab === 'ingest' && (
          <div className="kv-tab__ingest">
            <div className="kv-tab__ingest-note">
              这里只有置入入口。浏览、筛选和打开已入库文件，请回到左侧的知识索引页。
            </div>

            {/* URL */}
            <div className="kv-tab__ingest-section">
              <div className="kv-tab__ingest-label">🔗 URL 抓取</div>
              <div className="kv-tab__ingest-row">
                <input
                  className="kv-tab__ingest-input"
                  placeholder="https://..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleIngestUrl()
                  }}
                />
                <button className="kv-tab__btn" disabled={!urlInput.trim() || isIngesting} onClick={handleIngestUrl}>
                  抓取
                </button>
              </div>
            </div>

            {/* 粘贴 */}
            <div className="kv-tab__ingest-section">
              <div className="kv-tab__ingest-label">📋 粘贴内容</div>
              <input
                className="kv-tab__ingest-input"
                placeholder="标题（可选）"
                value={ingestPasteTitle}
                onChange={(e) => setIngestPasteTitle(e.target.value)}
                style={{ marginBottom: 'var(--hd-space-xs)', display: 'block' }}
              />
              <textarea
                className="kv-tab__query-textarea"
                placeholder="粘贴文本内容..."
                value={ingestPasteContent}
                onChange={(e) => setIngestPasteContent(e.target.value)}
                style={{ minHeight: '100px', marginBottom: 'var(--hd-space-sm)' }}
              />
              <button
                className="kv-tab__btn"
                disabled={!ingestPasteContent.trim() || isIngesting}
                onClick={handleIngestPaste}
              >
                摄入
              </button>
            </div>

            {/* 文件导入 */}
            <div className="kv-tab__ingest-section">
              <div className="kv-tab__ingest-label">📄 文件 / 文件夹置入</div>
              <div className="kv-tab__ingest-actions">
                <button className="kv-tab__btn" disabled={isIngesting} onClick={() => fileInputRef.current?.click()}>
                  选择文件
                </button>
                <button
                  className="kv-tab__btn kv-tab__btn--subtle"
                  disabled={isIngesting}
                  onClick={handleChooseFolderImport}
                >
                  选择文件夹
                </button>
              </div>
              <div className="kv-tab__ingest-note kv-tab__ingest-note--compact">
                支持单文件、整个文件夹、拖放置入，以及 .md .txt .json .py .ts .js .go .rs .html .css .yaml .sql
                等常见格式。
              </div>
              <div
                className={`kv-tab__dropzone ${isDragOver ? 'kv-tab__dropzone--active' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="kv-tab__dropzone-icon">📁</div>
                <div>把文件或整个文件夹拖到这里</div>
                <div style={{ fontSize: '0.7rem' }}>上方按钮负责选择；这里仅处理拖放置入</div>
              </div>
            </div>

            {/* Obsidian Vault 导入 */}
            <div className="kv-tab__ingest-section">
              <div className="kv-tab__ingest-label">🏛️ Obsidian Vault 导入</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--hd-text-muted)', marginBottom: 'var(--hd-space-xs)' }}>
                扫描 Obsidian Vault 目录中的 Markdown 文件，批量摄入知识库
              </div>
              <div className="kv-tab__ingest-row">
                <input
                  className="kv-tab__ingest-input"
                  placeholder="Vault 路径，如 /path/to/vault/Clippings"
                  value={vaultPath}
                  onChange={(e) => setVaultPath(e.target.value)}
                />
                <button
                  className="kv-tab__btn"
                  disabled={!vaultPath.trim() || isVaultImporting}
                  onClick={handleVaultRescan}
                >
                  {isVaultImporting ? '扫描中...' : '扫描'}
                </button>
              </div>
              {vaultResult && (
                <div
                  style={{ fontSize: '0.75rem', color: 'var(--hd-text-secondary)', marginTop: 'var(--hd-space-xs)' }}
                >
                  ✅ 导入 {vaultResult.imported} 条 · 跳过 {vaultResult.skipped} 条
                  {vaultResult.errors.length > 0 && (
                    <span style={{ color: 'var(--hd-error)' }}> · {vaultResult.errors.length} 个错误</span>
                  )}
                </div>
              )}
            </div>

            {/* 自动编译选项 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '0 var(--hd-space-md)',
                marginTop: 'var(--hd-space-sm)',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.75rem',
                  color: 'var(--hd-text-secondary)',
                  cursor: 'pointer',
                }}
              >
                <input type="checkbox" checked={autoCompile} onChange={(e) => setAutoCompile(e.target.checked)} />
                摄入后自动编译为 Wiki 页面
              </label>
            </div>

            {/* 进度 */}
            {(isIngesting || batchResults.length > 0) && (
              <div className="kv-tab__batch-progress">
                {ingestPhase && (
                  <div
                    style={{ fontSize: '0.82rem', color: 'var(--hd-accent-cyan)', marginBottom: 'var(--hd-space-sm)' }}
                  >
                    {ingestPhase}
                  </div>
                )}
                {batchResults.map((r, i) => (
                  <div
                    key={i}
                    className={`kv-tab__batch-item ${r.pageId ? 'kv-tab__batch-item--success' : r.errors.length > 0 ? 'kv-tab__batch-item--error' : 'kv-tab__batch-item--processing'}`}
                  >
                    {r.pageId ? '✅' : r.errors.length > 0 ? '❌' : '⏳'} {r.fileName || r.pageTitle}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 底部工具栏 */}
        <div className="kv-tab__toolbar">
          <button
            className="kv-tab__btn kv-tab__btn--subtle"
            style={{ fontSize: '0.6rem', padding: '4px 10px' }}
            disabled={isSyncing}
            onClick={async () => {
              setIsSyncing(true)
              try {
                const electronAPI = (window as any)?.electronAPI
                if (electronAPI?.syncWikiToDisk) {
                  const result = await electronAPI.syncWikiToDisk()
                  if (result.success) {
                    setIngestPhase(`✅ 同步完成: ${result.pagesSynced} 页面, ${result.drawersSynced} 抽屉`)
                  } else {
                    setIngestPhase(`❌ 同步失败: ${result.error}`)
                  }
                }
              } catch {
                /* ignore */
              }
              setIsSyncing(false)
            }}
          >
            {isSyncing ? '⏳ 同步中...' : '📁 同步到本地笔记'}
          </button>
        </div>
      </div>

      {/* 流式进度遮罩 */}
      {isIngesting && !batchResults.length && (
        <div className="kv-tab__stream-overlay">
          <div className="kv-tab__stream-spinner" />
          <div className="kv-tab__stream-phase">{ingestPhase || '处理中...'}</div>
        </div>
      )}

      {/* 欢迎引导 */}
      {showWelcome && (
        <div
          className="kv-tab__welcome-overlay"
          onClick={() => {
            setShowWelcome(false)
            localStorage.setItem('kv_welcomed', 'true')
          }}
        >
          <div className="kv-tab__welcome" onClick={(e) => e.stopPropagation()}>
            <div className="kv-tab__welcome-icon">📚</div>
            <div className="kv-tab__welcome-title">知识库 — Karpathy 三层架构</div>
            <div className="kv-tab__welcome-steps">
              <div className="kv-tab__welcome-step">
                <div className="kv-tab__welcome-step-num">①</div>
                <div>
                  <div className="kv-tab__welcome-step-title">导入知识</div>
                  <div className="kv-tab__welcome-step-desc">
                    在左上角“+”页拖入文件或整个文件夹，也可以粘贴文本、抓取网页。所有内容先进入"抽屉"暂存。
                  </div>
                </div>
              </div>
              <div className="kv-tab__welcome-step">
                <div className="kv-tab__welcome-step-num">②</div>
                <div>
                  <div className="kv-tab__welcome-step-title">AI 编译</div>
                  <div className="kv-tab__welcome-step-desc">
                    开启"自动编译"后，AI 会将抽屉生肉结晶为结构化 Wiki 页面，自动提取 [[双链]]。
                  </div>
                </div>
              </div>
              <div className="kv-tab__welcome-step">
                <div className="kv-tab__welcome-step-num">③</div>
                <div>
                  <div className="kv-tab__welcome-step-title">查询 & 交叉引用</div>
                  <div className="kv-tab__welcome-step-desc">
                    在搜索框中提问，AI 基于知识库回答。点击 [[蓝色链接]] 在页面间跳转。
                  </div>
                </div>
              </div>
            </div>
            <button
              className="kv-tab__btn"
              style={{ marginTop: 'var(--hd-space-lg)', padding: '8px 32px', fontSize: '0.85rem' }}
              onClick={() => {
                setShowWelcome(false)
                localStorage.setItem('kv_welcomed', 'true')
              }}
            >
              开始使用
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
