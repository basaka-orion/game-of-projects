import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type DragEvent } from 'react'
import {
  dataUrlToGeminiPart,
  fileToGeminiPart,
  generateFoodAdImages,
} from '../../../../lib/food-ad-crafter/ai'
import {
  FOOD_AD_STYLES,
  createFoodAdProject,
  createSampleFoodAdProject,
  getActiveFoodAdProject,
  getFoodAdStyle,
  loadFoodAdCrafterState,
  patchFoodAdProject,
  saveFoodAdCrafterState,
} from '../../../../lib/food-ad-crafter/state'
import type { FoodAdCrafterState, FoodAdProject } from '../../../../lib/food-ad-crafter/types'
import './FoodAdCrafterMacApp.css'

type FoodAdView = 'studio' | 'vibes' | 'prompt' | 'archive'
type ProcessingState = 'idle' | 'reading' | 'generating'

const viewTabs: Array<[FoodAdView, string]> = [
  ['studio', '生成台'],
  ['vibes', 'Vibe 墙'],
  ['prompt', '提示词'],
  ['archive', '作品库'],
]

const sourceSteps = [
  ['压缩', '1024px / JPEG 0.82'],
  ['生成', 'Gemini 2.5 Flash Image'],
  ['并发', '一次 4 张方案'],
  ['下载', '单图 / 提示词包'],
]

function createInitialState(): FoodAdCrafterState {
  const loaded = loadFoodAdCrafterState()
  if (loaded.projects.length > 0) return loaded
  const sample = createSampleFoodAdProject()
  return { projects: [sample], activeProjectId: sample.id }
}

function safeName(input: string): string {
  return input.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '_').slice(0, 56) || 'food-ad'
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

function downloadText(fileName: string, text: string) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  downloadDataUrl(url, fileName)
  URL.revokeObjectURL(url)
}

function projectMarkdown(project: FoodAdProject): string {
  const style = getFoodAdStyle(project.selectedStyleId)
  return `# ${project.productName || '美食与饮品广告大片'}

Product type: ${project.productType}
Style: ${style.name} / ${style.description}
Generated images: ${project.generatedImages.length}

## Prompt

${project.lastPrompt || '尚未生成'}

## Notes

${project.notes.map((note) => `- ${note}`).join('\n') || '- 无'}
`
}

export default function FoodAdCrafterMacApp() {
  const [state, setState] = useState<FoodAdCrafterState>(() => createInitialState())
  const [view, setView] = useState<FoodAdView>('studio')
  const [processing, setProcessing] = useState<ProcessingState>('idle')
  const [dragActive, setDragActive] = useState(false)
  const [toast, setToast] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const project = useMemo(() => getActiveFoodAdProject(state), [state])
  const activeStyle = useMemo(() => getFoodAdStyle(project?.selectedStyleId), [project?.selectedStyleId])
  const sortedProjects = useMemo(
    () => [...state.projects].sort((a, b) => b.updatedAt - a.updatedAt),
    [state.projects],
  )
  const canGenerate = Boolean(project?.originalImageUrl && project?.productName.trim() && project?.selectedStyleId)

  useEffect(() => {
    saveFoodAdCrafterState(state)
  }, [state])

  function flash(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 1800)
  }

  function updateProject(projectId: string, updater: (item: FoodAdProject) => FoodAdProject) {
    setState((prev) => patchFoodAdProject(prev, projectId, updater))
  }

  function handleLoadSample() {
    const sample = createSampleFoodAdProject()
    setState((prev) => {
      const exists = prev.projects.find((item) => item.originalFileName === sample.originalFileName)
      if (exists) return { ...prev, activeProjectId: exists.id }
      return { projects: [sample, ...prev.projects], activeProjectId: sample.id }
    })
    setView('studio')
    flash('样例已载入')
  }

  function handleNewProject() {
    const next = createFoodAdProject({
      productType: '美食 / 饮品',
      selectedStyleId: 'rembrandt-dark',
    })
    setState((prev) => ({ projects: [next, ...prev.projects], activeProjectId: next.id }))
    setView('studio')
    flash('新广告项目已创建')
  }

  async function handleFile(file: File) {
    if (!project) return
    setProcessing('reading')
    setWarnings([])
    try {
      const { previewUrl } = await fileToGeminiPart(file)
      updateProject(project.id, (item) => ({
        ...item,
        originalImageUrl: previewUrl,
        originalFileName: file.name,
        generatedImages: [],
        notes: [`已读取 ${file.name}`, '图片会在生成前压缩到 1024px，降低 RPC/XHR 失败率。'],
      }))
      flash('图片已载入')
    } catch (err) {
      setWarnings([err instanceof Error ? err.message : String(err)])
    } finally {
      setProcessing('idle')
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) handleFile(file)
    event.target.value = ''
  }

  function handleDragOver(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    setDragActive(true)
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    setDragActive(false)
    const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith('image/'))
    if (file) handleFile(file)
  }

  async function handleGenerate() {
    if (!project || !canGenerate || !project.originalImageUrl) {
      flash('先补齐图片、产品名和 Vibe')
      return
    }
    setProcessing('generating')
    setWarnings([])
    try {
      const imagePart = await dataUrlToGeminiPart(project.originalImageUrl)
      const result = await generateFoodAdImages({
        imagePart,
        originalImageUrl: project.originalImageUrl,
        productName: project.productName,
        productType: project.productType,
        style: activeStyle,
        count: 4,
      })
      updateProject(project.id, (item) => ({
        ...item,
        generatedImages: result.images,
        lastPrompt: result.prompt,
        notes: [
          result.usedProvider === 'gemini' ? 'Gemini 图片模型已返回广告图。' : '当前使用本地高保真预览引擎生成广告构图。',
          `${activeStyle.name}：${activeStyle.description}`,
          ...result.warnings.slice(0, 2),
        ],
      }))
      setWarnings(result.warnings)
      flash(result.usedProvider === 'gemini' ? 'Gemini 已生成 4 张方案' : '本地预览已生成 4 张方案')
    } catch (err) {
      setWarnings([err instanceof Error ? err.message : String(err)])
    } finally {
      setProcessing('idle')
    }
  }

  if (!project) {
    return (
      <div className="food-ad">
        <div className="food-ad__empty">
          <h1>美食与饮品 · 广告大片生成器</h1>
          <button onClick={handleLoadSample}>载入样例</button>
        </div>
      </div>
    )
  }

  return (
    <div className="food-ad">
      {toast && <div className="food-ad__toast">{toast}</div>}
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileChange} />

      <header className="food-ad__topbar">
        <div>
          <span>AI Studio Import</span>
          <h1>美食与饮品 · 广告大片生成器</h1>
          <p>上传面包、咖啡、甜点或饮品照片，选择 Vibe，一次生成 4 张专业广告大片。</p>
        </div>
        <div className="food-ad__actions">
          <button onClick={handleNewProject}>新项目</button>
          <button onClick={handleLoadSample}>载入样例</button>
          <button
            className="food-ad__primary"
            disabled={!canGenerate || processing === 'generating'}
            onClick={handleGenerate}
          >
            {processing === 'generating' ? '生成中...' : '生成 4 张'}
          </button>
        </div>
      </header>

      <nav className="food-ad__tabs" aria-label="Food ad workspace">
        {viewTabs.map(([id, label]) => (
          <button key={id} className={view === id ? 'food-ad__tab--active' : ''} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </nav>

      {view === 'studio' && (
        <main className="food-ad__studio">
          <section className="food-ad__upload-column">
            <div className="food-ad__panel-title">
              <span>1 / INPUT</span>
              <strong>上传你的照片</strong>
            </div>
            <button
              className={`food-ad__upload ${dragActive ? 'food-ad__upload--drag' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              {project.originalImageUrl ? (
                <>
                  <img src={project.originalImageUrl} alt="uploaded product" />
                  <span>{project.originalFileName || '已载入图片'}</span>
                </>
              ) : (
                <>
                  <i />
                  <strong>点击上传图片</strong>
                  <span>或直接拖拽文件到这里</span>
                </>
              )}
            </button>

            <div className="food-ad__source-steps">
              {sourceSteps.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>

            <div className="food-ad__project-list">
              <div className="food-ad__panel-title">
                <span>Projects</span>
                <strong>广告档案</strong>
              </div>
              {sortedProjects.slice(0, 6).map((item) => (
                <button
                  key={item.id}
                  className={item.id === project.id ? 'food-ad__project--active' : ''}
                  onClick={() => setState((prev) => ({ ...prev, activeProjectId: item.id }))}
                >
                  <span>{item.productName || '未命名产品'}</span>
                  <small>{getFoodAdStyle(item.selectedStyleId).name}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="food-ad__result-column">
            <div className="food-ad__panel-title food-ad__panel-title--center">
              <span>2 / OUTPUT</span>
              <strong>{project.generatedImages.length > 0 ? 'AI 生成的神图' : 'AI 生成预览'}</strong>
            </div>
            <div className={`food-ad__result-grid ${processing === 'generating' ? 'food-ad__result-grid--loading' : ''}`}>
              {processing === 'generating' ? (
                <div className="food-ad__loading-card">
                  <div className="food-ad__spinner" />
                  <strong>正在绘制 4 张神图...</strong>
                  <span>{activeStyle.name} / {activeStyle.description}</span>
                </div>
              ) : project.generatedImages.length > 0 ? (
                project.generatedImages.map((image, index) => (
                  <article key={image.id} className="food-ad__image-card">
                    <img src={image.dataUrl} alt={`Generated ad ${index + 1}`} />
                    <div className="food-ad__image-tools">
                      <span>{image.source === 'gemini' ? 'Gemini' : 'Local Preview'}</span>
                      <button onClick={() => downloadDataUrl(image.dataUrl, `${safeName(project.productName)}-${index + 1}.${image.source === 'local' ? 'svg' : 'png'}`)}>
                        下载
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="food-ad__empty-preview">
                  <i />
                  <strong>AI 将一次生成 4 张方案</strong>
                  <span>上传照片，输入名称，选择 Vibe，然后点击生成。</span>
                </div>
              )}
            </div>
            {project.generatedImages.length > 0 && (
              <div className="food-ad__result-actions">
                <button onClick={handleGenerate}>不满意？重新生成</button>
                <button onClick={() => downloadText(`${safeName(project.productName)}-prompt.md`, projectMarkdown(project))}>
                  导出提示词包
                </button>
              </div>
            )}
            {warnings.length > 0 && (
              <div className="food-ad__warnings">
                {warnings.slice(0, 3).map((warning) => (
                  <span key={warning}>{warning}</span>
                ))}
              </div>
            )}
          </section>

          <aside className="food-ad__control-column">
            <div className="food-ad__control-card">
              <div className="food-ad__panel-title">
                <span>3 / CONTROL</span>
                <strong>控制面板</strong>
              </div>
              <label>
                <span>产品名</span>
                <input
                  value={project.productName}
                  onChange={(event) => updateProject(project.id, (item) => ({ ...item, productName: event.target.value }))}
                  placeholder="例如：法式可颂 / 冰萃咖啡"
                />
              </label>
              <label>
                <span>品类</span>
                <input
                  value={project.productType}
                  onChange={(event) => updateProject(project.id, (item) => ({ ...item, productType: event.target.value }))}
                  placeholder="烘焙、咖啡、甜点、茶饮..."
                />
              </label>
              <div className="food-ad__style-picker">
                <span>选择你的 Vibe</span>
                <div>
                  {FOOD_AD_STYLES.map((style) => (
                    <button
                      key={style.id}
                      className={project.selectedStyleId === style.id ? 'food-ad__style--active' : ''}
                      style={
                        {
                          '--style-bg': style.palette[0],
                          '--style-accent': style.palette[1],
                          '--style-light': style.palette[2],
                        } as CSSProperties
                      }
                      onClick={() => updateProject(project.id, (item) => ({ ...item, selectedStyleId: style.id }))}
                    >
                      <strong>{style.name}</strong>
                      <small>{style.description}</small>
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="food-ad__primary food-ad__generate"
                disabled={!canGenerate || processing !== 'idle'}
                onClick={handleGenerate}
              >
                {processing === 'generating' ? '正在绘制 4 张神图...' : '一键生成 4 张'}
              </button>
            </div>
          </aside>
        </main>
      )}

      {view === 'vibes' && (
        <main className="food-ad__vibe-wall">
          {FOOD_AD_STYLES.map((style) => (
            <button
              key={style.id}
              className={project.selectedStyleId === style.id ? 'food-ad__vibe--active' : ''}
              style={
                {
                  '--style-bg': style.palette[0],
                  '--style-accent': style.palette[1],
                  '--style-light': style.palette[2],
                } as CSSProperties
              }
              onClick={() => {
                updateProject(project.id, (item) => ({ ...item, selectedStyleId: style.id }))
                setView('studio')
              }}
            >
              <span>{style.tone}</span>
              <strong>{style.name}</strong>
              <small>{style.description}</small>
            </button>
          ))}
        </main>
      )}

      {view === 'prompt' && (
        <main className="food-ad__prompt">
          <section>
            <span>Prompt</span>
            <pre>{project.lastPrompt || '生成一次后，这里会记录完整 Gemini 图片提示词。'}</pre>
          </section>
          <section>
            <span>Source Notes</span>
            <ul>
              {project.notes.length > 0 ? project.notes.map((note) => <li key={note}>{note}</li>) : <li>尚未生成。</li>}
            </ul>
          </section>
          <button onClick={() => downloadText(`${safeName(project.productName)}-prompt.md`, projectMarkdown(project))}>
            下载提示词包
          </button>
        </main>
      )}

      {view === 'archive' && (
        <main className="food-ad__archive">
          {sortedProjects.map((item) => (
            <button key={item.id} onClick={() => setState((prev) => ({ ...prev, activeProjectId: item.id }))}>
              <div>{item.originalImageUrl && <img src={item.originalImageUrl} alt="" />}</div>
              <strong>{item.productName || '未命名产品'}</strong>
              <span>{getFoodAdStyle(item.selectedStyleId).name} · {item.generatedImages.length} 张</span>
            </button>
          ))}
        </main>
      )}
    </div>
  )
}
