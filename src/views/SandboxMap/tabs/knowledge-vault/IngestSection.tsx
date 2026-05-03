/**
 * IngestSection — 知识摄入面板
 *
 * 从 KnowledgeVaultTab 提取，负责：
 * - URL 抓取
 * - 粘贴内容
 * - 文件导入（含拖拽和 Obsidian Vault）
 * - 批量进度显示
 */
import React, { useRef, useState } from 'react'
import { getLLMConfig } from '../../../../lib/ai/provider'
import {
  ingestUrl,
  ingestPaste,
  ingestSource,
  getFileIntakeKind,
  isFileSupported,
  shouldWrapAsCode,
  type IngestResult,
} from '../../../../lib/knowledge/ingest'
import { scanVaultDirectory } from '../../../../lib/knowledge/obsidian-importer'
import { getCompileLLMConfig, runCompileCycle } from '../../../../lib/knowledge/wiki-compiler'
import { KNOWLEDGE_MASTERS_ROOT } from '../../../../lib/knowledge/default-paths'

interface IngestSectionProps {
  onDataRefresh: () => Promise<void>
  onSelectPage: (id: string) => void
}

export default function IngestSection({ onDataRefresh, onSelectPage }: IngestSectionProps) {
  const [isIngesting, setIsIngesting] = useState(false)
  const [ingestPhase, setIngestPhase] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteContent, setPasteContent] = useState('')
  const [batchResults, setBatchResults] = useState<Array<IngestResult & { fileName: string }>>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [autoCompile, setAutoCompile] = useState(true)

  // Obsidian Vault
  const [vaultPath, setVaultPath] = useState(KNOWLEDGE_MASTERS_ROOT)
  const [isVaultImporting, setIsVaultImporting] = useState(false)
  const [vaultResult, setVaultResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  /** 提交后自动编译 */
  async function triggerAutoCompile() {
    if (!autoCompile) return
    try {
      const config = getCompileLLMConfig()
      await runCompileCycle(config, 20, () => {})
      await onDataRefresh()
    } catch {
      /* non-critical */
    }
  }

  async function handleIngestUrl() {
    if (!urlInput.trim() || isIngesting) return
    setIsIngesting(true)
    setIngestPhase('抓取并处理中...')
    try {
      const result = await ingestUrl(urlInput.trim(), getLLMConfig())
      if (result.pageId) {
        await onDataRefresh()
        onSelectPage(result.pageId)
      }
      setIngestPhase(result.errors.length > 0 ? `⚠️ ${result.errors.join('; ')}` : '✅ 完成')
      if (result.pageId) triggerAutoCompile()
    } catch (err) {
      setIngestPhase(`❌ ${String(err)}`)
    }
    setIsIngesting(false)
  }

  async function handleIngestPaste() {
    if (!pasteContent.trim() || isIngesting) return
    setIsIngesting(true)
    setIngestPhase('处理粘贴内容...')
    try {
      const result = await ingestPaste(pasteContent, pasteTitle || '粘贴内容', getLLMConfig())
      if (result.pageId) {
        await onDataRefresh()
        onSelectPage(result.pageId)
        setPasteContent('')
        setPasteTitle('')
      }
      setIngestPhase(result.errors.length > 0 ? `⚠️ ${result.errors.join('; ')}` : '✅ 完成')
      if (result.pageId) triggerAutoCompile()
    } catch (err) {
      setIngestPhase(`❌ ${String(err)}`)
    }
    setIsIngesting(false)
  }

  async function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error(`读取失败: ${file.name}`))
      reader.readAsText(file)
    })
  }

  function basenameFromPath(filePath: string): string {
    return filePath.replace(/\\/g, '/').split('/').pop() || filePath
  }

  async function ingestLocalPath(filePath: string): Promise<IngestResult & { fileName: string }> {
    const fileName = basenameFromPath(filePath)
    const language = fileName.match(/\.([^.]+)$/)?.[1] || 'text'
    const intakeKind = getFileIntakeKind(filePath)
    const electronAPI = (window as any)?.electronAPI
    if (!electronAPI?.extractFileContent) throw new Error('本地文件选择需要桌面端环境')
    const extracted = await electronAPI.extractFileContent(filePath)
    if (!extracted?.success) throw new Error(extracted?.error || `无法解析文件: ${fileName}`)

    const content = extracted.content || ''
    const rawContent = extracted.rawContent || extracted.content || ''
    const wrappedContent = shouldWrapAsCode(filePath)
      ? `文件: ${fileName}\n语言: ${language}\n\n\`\`\`${language}\n${content}\n\`\`\``
      : content

    const result = await ingestSource(
      {
        sourceType: 'file',
        title: fileName,
        content: wrappedContent,
        rawContent,
        filePath,
        metadata: {
          language,
          intakeKind,
          extractionKind: extracted.kind,
          extractionMethod: extracted.method,
          extractionWarnings: extracted.warnings || [],
          extractionSize: extracted.metadata?.size,
        },
      },
      getLLMConfig(),
    )
    return { ...result, fileName }
  }

  async function handleFilePathsDirectImport(paths: string[]) {
    const supportedPaths = paths.filter((filePath) => isFileSupported(filePath))
    if (supportedPaths.length === 0 || isIngesting) {
      if (supportedPaths.length === 0) setIngestPhase('❌ 没有支持的文件类型')
      return
    }

    setIsIngesting(true)
    setBatchResults([])
    setIngestPhase(`处理 ${supportedPaths.length} 个本地文件...`)

    for (let i = 0; i < supportedPaths.length; i++) {
      const filePath = supportedPaths[i]
      const fileName = basenameFromPath(filePath)
      setIngestPhase(`[${i + 1}/${supportedPaths.length}] ${fileName}`)
      try {
        const result = await ingestLocalPath(filePath)
        setBatchResults((prev) => [...prev, result])
        if (result.pageId) await onDataRefresh()
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

    setIngestPhase(`✅ 处理完成 (${supportedPaths.length} 个本地文件)`)
    setIsIngesting(false)
    triggerAutoCompile()
  }

  async function handleChooseLocalFiles() {
    const electronAPI = (window as any)?.electronAPI
    if (!electronAPI?.chooseFiles) {
      fileInputRef.current?.click()
      return
    }
    const paths = await electronAPI.chooseFiles({
      defaultPath: KNOWLEDGE_MASTERS_ROOT,
      title: '选择要导入知识库的本地文件',
    })
    if (Array.isArray(paths) && paths.length > 0) await handleFilePathsDirectImport(paths)
  }

  async function handleChooseLocalFolder() {
    const electronAPI = (window as any)?.electronAPI
    if (!electronAPI?.chooseFolder) return
    const folder = await electronAPI.chooseFolder({
      defaultPath: vaultPath.trim() || KNOWLEDGE_MASTERS_ROOT,
      title: '选择要扫描导入知识库的本地文件夹',
    })
    if (folder) setVaultPath(folder)
  }

  async function handleFilesDirectImport(files: File[]) {
    const supportedFiles = files.filter((f) => isFileSupported(f.name))
    if (supportedFiles.length === 0 || isIngesting) {
      if (supportedFiles.length === 0) setIngestPhase('❌ 没有支持的文件类型')
      return
    }

    setIsIngesting(true)
    setBatchResults([])
    setIngestPhase(`处理 ${supportedFiles.length} 个文件...`)

    for (let i = 0; i < supportedFiles.length; i++) {
      const file = supportedFiles[i]
      const fileName = file.name
      setIngestPhase(`[${i + 1}/${supportedFiles.length}] ${fileName}`)

      try {
        const absoluteFilePath = (file as any).path as string | undefined
        const language = fileName.match(/\.([^.]+)$/)?.[1] || 'text'
        const intakeKind = getFileIntakeKind(absoluteFilePath || file.webkitRelativePath || fileName)
        let content = ''
        let rawContent = ''
        let extractionMetadata: Record<string, unknown> = {}
        const electronAPI = (window as any)?.electronAPI
        if (absoluteFilePath && electronAPI?.extractFileContent) {
          const extracted = await electronAPI.extractFileContent(absoluteFilePath)
          if (!extracted?.success) throw new Error(extracted?.error || `无法解析文件: ${fileName}`)
          content = extracted.content || ''
          rawContent = extracted.rawContent || extracted.content || ''
          extractionMetadata = {
            extractionKind: extracted.kind,
            extractionMethod: extracted.method,
            extractionWarnings: extracted.warnings || [],
            extractionSize: extracted.metadata?.size,
          }
        } else {
          content = await readFileAsText(file)
          rawContent = content
        }
        const isCode = shouldWrapAsCode(absoluteFilePath || file.webkitRelativePath || fileName)
        const wrappedContent = isCode
          ? `文件: ${fileName}\n语言: ${language}\n\n\`\`\`${language}\n${content}\n\`\`\``
          : content

        const result = await ingestSource(
          {
            sourceType: 'file',
            title: fileName,
            content: wrappedContent,
            rawContent,
            filePath: absoluteFilePath || file.webkitRelativePath || fileName,
            metadata: { language, intakeKind, ...extractionMetadata },
          },
          getLLMConfig(),
        )

        setBatchResults((prev) => [...prev, { ...result, fileName }])
        if (result.pageId) await onDataRefresh()
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

    setIngestPhase(`✅ 处理完成 (${supportedFiles.length} 个文件)`)
    setIsIngesting(false)
    triggerAutoCompile()
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }

  function readEntryRecursive(entry: FileSystemEntry): Promise<File[]> {
    return new Promise((resolve) => {
      if (entry.isFile) {
        ;(entry as FileSystemFileEntry).file(
          (file) => resolve([file]),
          () => resolve([]),
        )
      } else if (entry.isDirectory) {
        const dirReader = (entry as FileSystemDirectoryEntry).createReader()
        const allFiles: File[] = []
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
    const allFiles: File[] = []
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
        const supported = allFiles.filter((f) => isFileSupported(f.name))
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
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) await handleFilesDirectImport(files)
  }

  return (
    <div className="kv-tab__ingest">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        accept=".md,.txt,.srt,.vtt,.ass,.ssa,.lrc,.json,.csv,.ts,.tsx,.js,.jsx,.py,.go,.rs,.java,.html,.css,.yaml,.yml,.sql,.sh,.pdf,.doc,.docx,.rtf,.odt,.png,.jpg,.jpeg,.webp,.gif,.heic,.mp3,.m4a,.wav,.aac,.flac,.mp4,.mov,.m4v,.webm"
        onChange={(e) => {
          const f = Array.from(e.target.files || [])
          if (f.length > 0) handleFilesDirectImport(f)
          e.target.value = ''
        }}
      />

      {/* URL 抓取 */}
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

      {/* 粘贴内容 */}
      <div className="kv-tab__ingest-section">
        <div className="kv-tab__ingest-label">📋 粘贴内容</div>
        <input
          className="kv-tab__ingest-input"
          placeholder="标题（可选）"
          value={pasteTitle}
          onChange={(e) => setPasteTitle(e.target.value)}
          style={{ marginBottom: 'var(--hd-space-xs)', display: 'block' }}
        />
        <textarea
          className="kv-tab__query-textarea"
          placeholder="粘贴文本内容..."
          value={pasteContent}
          onChange={(e) => setPasteContent(e.target.value)}
          style={{ minHeight: '100px', marginBottom: 'var(--hd-space-sm)' }}
        />
        <button className="kv-tab__btn" disabled={!pasteContent.trim() || isIngesting} onClick={handleIngestPaste}>
          摄入
        </button>
      </div>

      {/* 文件导入 */}
      <div className="kv-tab__ingest-section">
        <div className="kv-tab__ingest-label">📄 文件导入</div>
        <div
          className={`kv-tab__dropzone ${isDragOver ? 'kv-tab__dropzone--active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="kv-tab__dropzone-icon">📁</div>
          <div>拖拽文件或文件夹到此处，或点击选择</div>
          <div style={{ fontSize: '0.7rem' }}>
            默认从 {KNOWLEDGE_MASTERS_ROOT} 读取 · 支持整个文件夹导入 · .md .txt .pdf .docx .rtf .srt .vtt
            .json .py .ts .js .png .jpg .mp3 .m4a .mp4 等
          </div>
        </div>
        <div className="kv-tab__ingest-row" style={{ marginTop: 'var(--hd-space-sm)' }}>
          <button className="kv-tab__btn" disabled={isIngesting} onClick={handleChooseLocalFiles}>
            选择任意本地文件
          </button>
          <button className="kv-tab__btn kv-tab__btn--subtle" disabled={isVaultImporting} onClick={handleChooseLocalFolder}>
            选择任意本地文件夹
          </button>
        </div>
      </div>

      {/* Obsidian Vault 导入 */}
      <div className="kv-tab__ingest-section">
        <div className="kv-tab__ingest-label">🏛️ Obsidian Vault 导入</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--hd-text-muted)', marginBottom: 'var(--hd-space-xs)' }}>
            默认扫描项目根目录下的 Notes-知识库+大佬，批量摄入知识库
        </div>
        <div className="kv-tab__ingest-row">
          <input
            className="kv-tab__ingest-input"
            placeholder={KNOWLEDGE_MASTERS_ROOT}
            value={vaultPath}
            onChange={(e) => setVaultPath(e.target.value)}
          />
          <button className="kv-tab__btn kv-tab__btn--subtle" disabled={isVaultImporting} onClick={() => setVaultPath(KNOWLEDGE_MASTERS_ROOT)}>
            默认目录
          </button>
          <button className="kv-tab__btn kv-tab__btn--subtle" disabled={isVaultImporting} onClick={handleChooseLocalFolder}>
            选择文件夹
          </button>
          <button
            className="kv-tab__btn"
            disabled={!vaultPath.trim() || isVaultImporting}
            onClick={async () => {
              setIsVaultImporting(true)
              setVaultResult(null)
              try {
                const result = await scanVaultDirectory({
                  vaultPath: vaultPath.trim(),
                  maxDepth: 0,
                  skipExisting: true,
                })
                setVaultResult(result)
                if (result.imported > 0) onDataRefresh()
              } catch (err) {
                setVaultResult({ imported: 0, skipped: 0, errors: [(err as Error).message] })
              } finally {
                setIsVaultImporting(false)
              }
            }}
          >
            {isVaultImporting ? '扫描中...' : '扫描'}
          </button>
        </div>
        {vaultResult && (
          <div style={{ fontSize: '0.75rem', color: 'var(--hd-text-secondary)', marginTop: 'var(--hd-space-xs)' }}>
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
            <div style={{ fontSize: '0.82rem', color: 'var(--hd-accent-cyan)', marginBottom: 'var(--hd-space-sm)' }}>
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
  )
}
