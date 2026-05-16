import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { fuseUiStyles, generateUiProjectPrd } from '../../../../lib/ui-museum/ai'
import { UI_STYLE_ITEMS } from '../../../../lib/ui-museum/catalog'
import { createFusionVisual, createLocalFusion, createStyleEvolutionEvent, loadUiMuseumState, saveUiMuseumState } from '../../../../lib/ui-museum/state'
import type { UiFusionResult, UiMuseumState, UiMuseumTier, UiProjectPrd, UiStyleEvolutionEvent, UiStyleItem, UiVisualTokens } from '../../../../lib/ui-museum/types'
import './UIStyleMuseumMacApp.css'

type MuseumView = 'gallery' | 'fusion' | 'genesis' | 'collection'
type ProjectTab = 'overview' | 'preview' | 'manual' | 'tech'
type PlatformPreviewKind = 'web' | 'ios' | 'mac' | 'android' | 'mini'

type StyleRealizationState = { label: string; copy: string; detail: string }
type StyleRealization = {
  kind: UiVisualTokens['pattern']
  label: string
  badge: string
  kicker: string
  title: string
  caption: string
  action: string[]
  secondaryAction: string[]
  rows: string[]
  pages: string[]
  miniPages: string[]
  macPages: string[]
  field: string
  inputAction: string
  states: StyleRealizationState[]
  metrics: Array<Array<{ label: string; value: string }>>
  deviceKicker: Record<PlatformPreviewKind, string>
  modeTitles: Record<PlatformPreviewKind, string[]>
  platformTone: Record<PlatformPreviewKind, string>
  prdBridge: string
}

const tierTabs: Array<UiMuseumTier | 'ALL'> = ['ALL', 'T0', 'T1', 'T2', 'T3']
const platformPreviewTabs: Array<{ id: PlatformPreviewKind; label: string; cue: string }> = [
  { id: 'web', label: 'Web', cue: 'browser / responsive / focus' },
  { id: 'ios', label: 'iOS', cue: 'tab / sheet / haptic' },
  { id: 'mac', label: 'macOS', cue: 'toolbar / sidebar / inspector' },
  { id: 'android', label: 'Android', cue: 'M3 / FAB / ripple' },
  { id: 'mini', label: '小程序', cue: 'nav / menu / tabBar' },
]

const frontierResearchHighlights = [
  ['AI-native', 'Canvas AI / 可解释透明 / 本地优先账本'],
  ['Spatial + Material', 'Liquid Glass / M3 Expressive / 多模态手势'],
  ['Human Counterweight', '人手痕迹 / 柔性繁复 / 慎思阻尼'],
  ['Adaptive UX', '可访问性自适应 / 微声音反馈 / 隐形极简'],
] as const

function copyText(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {})
}

function visualStyleVars(visual: UiVisualTokens): CSSProperties {
  const palette = visual.palette.length > 0 ? visual.palette : ['#09090f', '#8b5cf6', '#2dd4bf', '#f8fafc']
  return {
    ['--ui-preview-base' as string]: palette[0],
    ['--ui-preview-bg' as string]: visual.background,
    ['--ui-preview-surface' as string]: visual.surface,
    ['--ui-preview-text' as string]: visual.text,
    ['--ui-preview-accent' as string]: visual.accent,
    ['--ui-preview-border' as string]: visual.border,
    ['--ui-preview-radius' as string]: visual.radius,
    ['--ui-preview-shadow' as string]: visual.shadow,
    ['--ui-preview-c1' as string]: palette[0],
    ['--ui-preview-c2' as string]: palette[1] || palette[0],
    ['--ui-preview-c3' as string]: palette[2] || palette[1] || palette[0],
    ['--ui-preview-c4' as string]: palette[3] || palette[0],
    ['--ui-preview-c5' as string]: palette[4] || palette[2] || palette[0],
    ['--ui-preview-display-font' as string]:
      visual.typography.includes('serif')
        ? 'Georgia, "Times New Roman", "Songti SC", serif'
        : visual.typography.includes('mono')
          ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
          : visual.typography.includes('display')
            ? 'Impact, Haettenschweiler, "Arial Black", sans-serif'
            : 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
  } as CSSProperties
}

function stylesFromIds(ids: string[]): UiStyleItem[] {
  return ids.map((id) => UI_STYLE_ITEMS.find((item) => item.id === id)).filter(Boolean) as UiStyleItem[]
}

function fusionVisual(result: UiFusionResult): UiVisualTokens {
  if (result.visual) return result.visual
  return createFusionVisual(stylesFromIds(result.parentStyleIds), result.name)
}

function projectVisual(project: UiProjectPrd): UiVisualTokens {
  if (project.visualStyleFusion.visual) return project.visualStyleFusion.visual
  return createFusionVisual(stylesFromIds(project.visualStyleFusion.styleIds), project.title)
}

export default function UIStyleMuseumMacApp() {
  const [state, setState] = useState<UiMuseumState>(() => loadUiMuseumState())
  const [view, setView] = useState<MuseumView>('gallery')
  const [tier, setTier] = useState<UiMuseumTier | 'ALL'>('ALL')
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [activeStyle, setActiveStyle] = useState<UiStyleItem | null>(null)
  const [activeFusion, setActiveFusion] = useState<UiFusionResult | null>(null)
  const [activeProject, setActiveProject] = useState<UiProjectPrd | null>(null)
  const [projectTab, setProjectTab] = useState<ProjectTab>('overview')
  const [idea, setIdea] = useState('一个帮助小白把产品想法变成高审美 UI、PRD 和开发任务的工具')
  const [isWorking, setIsWorking] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    saveUiMuseumState(state)
  }, [state])

  const filteredStyles = useMemo(() => {
    const term = query.trim().toLowerCase()
    return UI_STYLE_ITEMS.filter((item) => {
      const tierOk = tier === 'ALL' || item.tier === tier
      if (!tierOk) return false
      if (!term) return true
      return `${item.title} ${item.description} ${item.application}`.toLowerCase().includes(term)
    })
  }, [query, tier])

  const selectedStyles = useMemo(
    () => selectedIds.map((id) => UI_STYLE_ITEMS.find((item) => item.id === id)).filter(Boolean) as UiStyleItem[],
    [selectedIds],
  )

  function toggleStyle(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id)
      if (prev.length >= 3) return prev
      return [...prev, id]
    })
  }

  async function handleFuse() {
    if (selectedStyles.length < 2) return
    setIsWorking(true)
    setStatus('正在融合视觉 DNA...')
    const result = await fuseUiStyles(selectedStyles)
    setActiveFusion(result)
    setIsWorking(false)
    setStatus('')
  }

  async function handleGenerateProject() {
    if (!idea.trim()) return
    setIsWorking(true)
    setStatus('Genesis 引擎启动...')
    const project = await generateUiProjectPrd(idea, UI_STYLE_ITEMS, selectedStyles, setStatus)
    setActiveProject(project)
    setProjectTab('overview')
    setIsWorking(false)
    setStatus('')
  }

  function saveFusion(result: UiFusionResult) {
    setState((prev) => {
      const savedFusions = prev.savedFusions.some((item) => item.id === result.id)
        ? prev.savedFusions
        : [result, ...prev.savedFusions]
      const sourceStyles = stylesFromIds(result.parentStyleIds)
      const evolution = createStyleEvolutionEvent(
        result,
        sourceStyles,
        result.parentStyleIds.length > 1 ? 'fusion' : 'single-style',
        prev.styleEvolutionEvents || [],
      )
      const styleEvolutionEvents = [
        evolution,
        ...(prev.styleEvolutionEvents || []).filter((event) => event.id !== evolution.id),
      ].slice(0, 80)
      return { ...prev, savedFusions, styleEvolutionEvents }
    })
  }

  function saveProject(project: UiProjectPrd) {
    setState((prev) =>
      prev.savedProjects.some((item) => item.id === project.id)
        ? prev
        : { ...prev, savedProjects: [project, ...prev.savedProjects] },
    )
  }

  return (
    <div className="ui-museum">
      {isWorking && (
        <div className="ui-museum__working">
          <strong>Genesis Engine</strong>
          <span>{status || '处理中...'}</span>
        </div>
      )}

      <header className="ui-museum__hero">
        <div>
          <span>UI STYLE MUSEUM · MAC WORKBENCH</span>
          <h1>有想法就必须有配得上的 UI。</h1>
          <p>迁移自 UI-：风格博物馆、AI 风格融合、Project Genesis、PRD 规范和收藏库；新增 2026 前沿精选，把实验性 UI 转成组件状态、平台落地和视觉验收。</p>
        </div>
        <aside>
          <strong>{UI_STYLE_ITEMS.length}</strong>
          <span>Design Styles</span>
          <small>群策 / PRD 可自动提取</small>
        </aside>
      </header>

      <section className="ui-museum__research-radar" aria-label="2026 UI frontier research radar">
        <div>
          <span>2026 FRONTIER PACK</span>
          <strong>全网趋势筛选后，只收录能进入真实产品、PRD 和工作流验收的风格。</strong>
        </div>
        <ul>
          {frontierResearchHighlights.map(([label, value]) => (
            <li key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </li>
          ))}
        </ul>
      </section>

      <nav className="ui-museum__nav">
        {[
          ['gallery', '风格博物馆'],
          ['fusion', '风格实验室'],
          ['genesis', '项目 Genesis'],
          ['collection', '我的收藏'],
        ].map(([id, label]) => (
          <button key={id} className={view === id ? 'ui-museum__nav-btn--active' : ''} onClick={() => setView(id as MuseumView)}>
            {label}
          </button>
        ))}
      </nav>

      {(view === 'gallery' || view === 'fusion') && (
        <>
          <section className="ui-museum__toolbar">
            <div className="ui-museum__filters">
              {tierTabs.map((item) => (
                <button key={item} className={tier === item ? 'ui-museum__filter--active' : ''} onClick={() => setTier(item)}>
                  {item}
                </button>
              ))}
            </div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索风格、用途、视觉 DNA..." />
          </section>

          {view === 'fusion' && (
            <section className="ui-museum__fusion-bar">
              <div>
                <span>选择 2-3 个风格</span>
                <strong>{selectedStyles.length > 0 ? selectedStyles.map((item) => item.title.replace(/^\d+\.\s*/, '')).join(' + ') : '等待选择'}</strong>
              </div>
              <button className="ui-museum__primary" onClick={handleFuse} disabled={selectedStyles.length < 2 || isWorking}>
                融合视觉 DNA
              </button>
            </section>
          )}

          <section className="ui-museum__grid">
            {filteredStyles.map((item, index) => (
              <StyleCard
                key={item.id}
                item={item}
                index={index}
                selectable={view === 'fusion'}
                selected={selectedIds.includes(item.id)}
                onToggle={() => toggleStyle(item.id)}
                onOpen={() => setActiveStyle(item)}
              />
            ))}
          </section>
        </>
      )}

      {view === 'genesis' && (
        <section className="ui-museum__genesis">
          <div className="ui-museum__genesis-copy">
            <span>PROJECT GENESIS ENGINE</span>
            <h2>一个想法，直接生成产品判断、视觉策略和工程 PRD。</h2>
            <p>保留原项目的 CPO / CTO / Design Director 圆桌逻辑，接入当前 OpenBasaka 的统一 LLM；没有云端时会使用本地规则生成完整 PRD。</p>
          </div>
          <div className="ui-museum__idea-box">
            <textarea value={idea} onChange={(event) => setIdea(event.target.value)} />
            <div>
              <button onClick={() => setView('fusion')}>先选风格</button>
              <button className="ui-museum__primary" onClick={handleGenerateProject} disabled={isWorking || !idea.trim()}>
                生成完整 PRD
              </button>
            </div>
            {selectedStyles.length > 0 && <p>当前会优先融合：{selectedStyles.map((item) => item.title.replace(/^\d+\.\s*/, '')).join('、')}</p>}
          </div>
        </section>
      )}

      {view === 'collection' && (
        <section className="ui-museum__collections">
          <CollectionPanel title="融合风格" empty="还没有保存融合结果。">
            {state.savedFusions.map((item) => (
              <button key={item.id} onClick={() => setActiveFusion(item)}>
                <strong>{item.name}</strong>
                <span>{item.parentStyles.join(' + ')}</span>
              </button>
            ))}
          </CollectionPanel>
          <CollectionPanel title="Genesis 项目" empty="还没有保存项目 PRD。">
            {state.savedProjects.map((item) => (
              <button key={item.id} onClick={() => setActiveProject(item)}>
                <strong>{item.title}</strong>
                <span>{item.visualStyleFusion.styleIds.join(' + ')}</span>
              </button>
            ))}
          </CollectionPanel>
          <CollectionPanel title="OpenBasaka 风格进化" empty="保存或融合风格后，会在这里留下可复用的自进化轨迹。">
            {(state.styleEvolutionEvents || []).map((item) => (
              <button key={item.id} onClick={() => copyText(item.promptPatch)}>
                <strong>{item.targetName} · G{item.generation}</strong>
                <span>{item.critique}</span>
              </button>
            ))}
          </CollectionPanel>
        </section>
      )}

      {activeStyle && (
        <StyleSpecModal
          item={activeStyle}
          onClose={() => setActiveStyle(null)}
          onSave={(result) => {
            saveFusion(result)
            setStatus(`已保存 ${result.name}，工作流、定时和群策可复用这套视觉 DNA。`)
          }}
        />
      )}
      {activeFusion && <FusionModal result={activeFusion} onClose={() => setActiveFusion(null)} onSave={saveFusion} />}
      {activeProject && (
        <ProjectModal
          project={activeProject}
          activeTab={projectTab}
          onTab={setProjectTab}
          onClose={() => setActiveProject(null)}
          onSave={saveProject}
        />
      )}
    </div>
  )
}

function StyleCard({
  item,
  index,
  selectable,
  selected,
  onToggle,
  onOpen,
}: {
  item: UiStyleItem
  index: number
  selectable: boolean
  selected: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  return (
    <article className={`ui-museum__card ${selected ? 'ui-museum__card--selected' : ''}`}>
      <div className="ui-museum__card-head">
        <span>{item.tier}</span>
        <strong>{item.title}</strong>
      </div>
      <div className="ui-museum__preview" data-style={item.id} style={{ ['--style-index' as string]: index }}>
        <PreviewScene visual={item.visual} title={item.title.replace(/^\d+\.\s*/, '')} eyebrow={item.tier} styleId={item.id} compact />
      </div>
      <div className="ui-museum__card-tokens" aria-label={`${item.title} visual tokens`}>
        {item.visual.palette.slice(0, 5).map((color) => <i key={color} style={{ background: color }} />)}
        <span>{item.visual.motion}</span>
        <span>{item.visual.texture}</span>
        <span>Identity {item.masterProfile.restorationScores.identity}</span>
      </div>
      <div className="ui-museum__card-body">
        <p>{item.description}</p>
        <small>{item.application}</small>
        <footer>
          {selectable ? (
            <button className={selected ? 'ui-museum__selected-btn' : ''} onClick={onToggle}>
              {selected ? '已选择' : '选择融合'}
            </button>
          ) : (
            <button onClick={onOpen}>打开真实互动规范</button>
          )}
        </footer>
      </div>
    </article>
  )
}

function CollectionPanel({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <section className="ui-museum__collection-panel">
      <h3>{title}</h3>
      <div>{hasChildren ? children : <p>{empty}</p>}</div>
    </section>
  )
}

function StyleSpecModal({ item, onClose, onSave }: { item: UiStyleItem; onClose: () => void; onSave: (result: UiFusionResult) => void }) {
  const cleanTitle = item.title.replace(/^\d+\.\s*/, '')
  const prompt = buildStyleWorkbenchPrompt(item)
  const componentChecklist = buildStyleComponentChecklist(item)
  const acceptanceChecklist = buildStyleAcceptanceChecklist(item)

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const workbenchBody = document.querySelector<HTMLElement>('.ui-museum__workbench-body')
      const workbenchCanvas = document.querySelector<HTMLElement>('.ui-museum__workbench-canvas')
      ;[workbenchBody, workbenchCanvas].forEach((element) => {
        if (!element) return
        if (typeof element.scrollTo === 'function') {
          element.scrollTo(0, 0)
          return
        }
        element.scrollTop = 0
        element.scrollLeft = 0
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [item.id])

  function saveSingleStyleContext() {
    const result = createLocalFusion([item])
    onSave({
      ...result,
      name: `${cleanTitle} 可复用视觉 DNA`,
      description: `${item.description} ${item.application}`,
      visual: item.visual,
      web: item.web,
      ios: item.ios,
      mac: item.mac,
      android: item.android,
      mini: item.mini,
      prompt,
    })
  }

  return (
    <div className="ui-museum__modal">
      <section className="ui-museum__spec ui-museum__workbench">
        <header>
          <div>
            <span>{item.tier} STYLE SPEC</span>
            <h2>{item.title}</h2>
          </div>
          <div>
            <button onClick={saveSingleStyleContext}>保存为视觉上下文</button>
            <button onClick={onClose}>关闭</button>
          </div>
        </header>
        <div className="ui-museum__spec-body ui-museum__workbench-body">
          <div className="ui-museum__workbench-canvas" style={visualStyleVars(item.visual)} data-pattern={item.visual.pattern} data-style={item.id}>
            <div className="ui-museum__workbench-canvas-head">
              <div>
                <span>同源实时预览</span>
                <strong>{cleanTitle}</strong>
              </div>
              <small>卡片与详情共用同一套视觉 token、状态和组件语法。</small>
            </div>
            <div className="ui-museum__workbench-hero">
              <PreviewScene visual={item.visual} title={cleanTitle} eyebrow={item.tier} subtitle={item.description} styleId={item.id} />
            </div>
            <PlatformPreviewSuite item={item} />
            <InteractiveWebsitePreview item={item} />
          </div>
          <div className="ui-museum__spec-main" style={visualStyleVars(item.visual)} data-pattern={item.visual.pattern} data-style={item.id}>
            <p>{item.description}</p>
            <div className="ui-museum__spec-grid">
              {Object.entries(item.specs).map(([key, value]) => (
                <article key={key}>
                  <span>{key}</span>
                  <strong>{value}</strong>
                </article>
              ))}
            </div>
            <div className="ui-museum__master-profile" aria-label={`${cleanTitle} master profile`}>
              <section>
                <span>Reference baseline</span>
                <strong>{item.masterProfile.referenceBrief}</strong>
              </section>
              <section>
                <span>Identity rules</span>
                {item.masterProfile.identityRules.map((line) => <strong key={line}>{line}</strong>)}
              </section>
              <section>
                <span>Restoration score</span>
                <strong>Identity {item.masterProfile.restorationScores.identity}</strong>
                <strong>Craft {item.masterProfile.restorationScores.craft}</strong>
                <strong>Interaction {item.masterProfile.restorationScores.interaction}</strong>
                <strong>Platform {item.masterProfile.restorationScores.platformFit}</strong>
                <strong>OpenBasaka {item.masterProfile.restorationScores.openbasakaUsefulness}</strong>
              </section>
              <section>
                <span>Anti-patterns</span>
                {item.masterProfile.antiPatterns.map((line) => <strong key={line}>{line}</strong>)}
              </section>
            </div>
            <TabsContent items={[['Web', item.web], ['iOS', item.ios], ['macOS', item.mac || 'macOS 版本必须使用 Toolbar、Sidebar/Split View、Inspector、键盘焦点和窗口状态承接桌面效率。'], ['Android', item.android], ['Mini Program', item.mini]]} />
            <StyleEvolutionMiniPanel
              title={`${cleanTitle} 自进化规则`}
              lines={[
                '保存后成为 OpenBasaka 可复用视觉上下文。',
                '下一次融合会继承 token、平台偏差修正和验收清单。',
                '工作流、定时、群策和 PRD 会读取这套风格轨迹。'
              ]}
            />
            <div className="ui-museum__workbench-checks">
              <section>
                <span>组件状态</span>
                {componentChecklist.map((line) => <strong key={line}>{line}</strong>)}
              </section>
              <section>
                <span>视觉验收</span>
                {acceptanceChecklist.map((line) => <strong key={line}>{line}</strong>)}
              </section>
            </div>
            <textarea readOnly value={prompt} />
            <button className="ui-museum__primary" onClick={() => copyText(prompt)}>
              复制 AI 复刻 Prompt
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function buildStyleWorkbenchPrompt(item: UiStyleItem): string {
  const cleanTitle = item.title.replace(/^\d+\.\s*/, '')
  const realization = styleSpecificFamily(item.id, item.visual.pattern)
  return [
    `请使用 ${cleanTitle} 的视觉 DNA 设计一个真实可交互产品界面。`,
    `公开/设计史基准：${item.masterProfile.referenceBrief}`,
    `身份规则：${item.masterProfile.identityRules.join('；')}`,
    `风格描述：${item.description}`,
    `应用场景：${item.application}`,
    `风格实现档案：${realization.label} / ${realization.kicker} / ${realization.caption}`,
    `同源产品语义：主标题=${realization.title}；动作=${realization.action.join(' / ')}；状态=${realization.states.map((state) => `${state.label}:${state.copy}`).join(' / ')}。`,
    `视觉 token：palette=${item.visual.palette.join(' / ')}；pattern=${item.visual.pattern}；typography=${item.visual.typography}；density=${item.visual.density}；texture=${item.visual.texture}；motion=${item.visual.motion}。`,
    `组件语法：${item.masterProfile.componentGrammar.join('；')}`,
    `禁忌项：${item.masterProfile.antiPatterns.join('；')}`,
    `复原评分：Identity ${item.masterProfile.restorationScores.identity} / Craft ${item.masterProfile.restorationScores.craft} / Interaction ${item.masterProfile.restorationScores.interaction} / Platform ${item.masterProfile.restorationScores.platformFit} / OpenBasaka ${item.masterProfile.restorationScores.openbasakaUsefulness}`,
    `Web 规范：${item.masterProfile.platformRules.web}`,
    `iOS 规范：${item.masterProfile.platformRules.ios}`,
    `macOS 规范：${item.masterProfile.platformRules.mac}`,
    `Android 规范：${item.masterProfile.platformRules.android}`,
    `小程序规范：${item.masterProfile.platformRules.mini}`,
    `Prompt 规则：${item.masterProfile.promptRules.join('；')}`,
    '必须落地到导航、主按钮、次按钮、输入框、开关、滑杆、卡片、空态、加载态、成功态、失败态、平台导航范式和响应式断点。',
    '验收时卡片预览、详情预览、PRD、工作流、定时和群策必须使用同一套视觉 DNA，不允许只写“参考某风格”。',
  ].join('\n')
}

function buildStyleComponentChecklist(item: UiStyleItem): string[] {
  return [
    ...item.masterProfile.componentGrammar,
    `按钮：半径 ${item.visual.radius}，强调色 ${item.visual.accent}，hover/pressed/focus 必须能被感知。`,
    `输入：边框 ${item.visual.border}，聚焦时用同一强调色，不引入无关蓝色或默认浏览器样式。`,
    `卡片：背景 ${item.visual.surface}，纹理 ${item.visual.texture}，密度 ${item.visual.density}。`,
    `反馈：空态、加载态、成功态用 ${item.visual.motion} 动效节奏，不用模板化占位框。`,
  ]
}

function buildStyleAcceptanceChecklist(item: UiStyleItem): string[] {
  const realization = styleSpecificFamily(item.id, item.visual.pattern)
  return [
    ...item.masterProfile.acceptanceChecklist,
    `首屏一眼能认出 ${item.title.replace(/^\d+\.\s*/, '')}，不能变成通用 SaaS 壳。`,
    `卡片、弹窗、网站互动、平台预览必须共用 ${realization.label} 的实现档案，文案和状态不能各写一套。`,
    `颜色只从 ${item.visual.palette.join(' / ')} 派生，额外颜色必须解释用途。`,
    `字体气质保持 ${item.visual.typography}，控制文字和正文都要单独调校。`,
    `工作流、定时、群策产物必须写出组件状态、动效、截图验收点。`,
  ]
}

function platformNotes(item: UiStyleItem): Record<PlatformPreviewKind, string> {
  return {
    web: item.masterProfile.platformRules.web,
    ios: item.masterProfile.platformRules.ios,
    mac: item.masterProfile.platformRules.mac,
    android: item.masterProfile.platformRules.android,
    mini: item.masterProfile.platformRules.mini,
  }
}

function platformBlueprint(platform: PlatformPreviewKind) {
  const map: Record<PlatformPreviewKind, { title: string; anatomy: string[]; states: string[] }> = {
    web: {
      title: '真实网页结构',
      anatomy: ['Browser chrome', 'Responsive nav', 'Hero + form', 'Cards + empty/loading/success'],
      states: ['hover', 'focus-visible', 'pressed', 'disabled'],
    },
    ios: {
      title: 'iOS 原生结构',
      anatomy: ['NavigationStack', 'TabView', 'Sheet', 'Haptic action'],
      states: ['selected tab', 'pressed button', 'sheet open', 'text focus'],
    },
    mac: {
      title: 'macOS 桌面结构',
      anatomy: ['Toolbar', 'Sidebar', 'Split View', 'Inspector'],
      states: ['keyboard focus', 'selected row', 'window status', 'menu command'],
    },
    android: {
      title: 'Android Material 3 结构',
      anatomy: ['Top app bar', 'NavigationBar/Rail', 'FAB', 'Tonal cards'],
      states: ['ripple', 'pressed', 'dynamic color', 'overscroll'],
    },
    mini: {
      title: '小程序结构',
      anatomy: ['Fixed nav bar', 'Menu capsule', 'Visible back', 'tabBar + action sheet'],
      states: ['menu sheet', 'tab switch', 'visible return', 'light Canvas recovery'],
    },
  }
  return map[platform]
}

function PlatformPreviewSuite({ item }: { item: UiStyleItem }) {
  const realization = useMemo(() => styleSpecificFamily(item.id, item.visual.pattern), [item.id, item.visual.pattern])
  const [platform, setPlatform] = useState<PlatformPreviewKind>('web')
  const [mode, setMode] = useState(0)
  const [enabled, setEnabled] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedCard, setSelectedCard] = useState(0)
  const [field, setField] = useState(realization.field)
  const notes = platformNotes(item)
  const blueprint = platformBlueprint(platform)

  useEffect(() => {
    setField(realization.field)
  }, [realization.field])

  return (
    <section className="ui-museum__platform-suite" style={visualStyleVars(item.visual)} data-pattern={item.visual.pattern} data-style={item.id}>
      <header className="ui-museum__platform-suite-head">
        <div>
          <span>真实平台互动预览</span>
          <strong>同一风格，按平台语法重建，不套壳。</strong>
        </div>
        <button onClick={() => setEnabled((current) => !current)}>
          {enabled ? '动效开启' : '静态降级'}
        </button>
      </header>
      <nav className="ui-museum__platform-tabs">
        {platformPreviewTabs.map((tab) => (
          <button key={tab.id} className={platform === tab.id ? 'is-active' : ''} onClick={() => {
            setPlatform(tab.id)
            setSheetOpen(false)
            setSelectedCard(0)
          }}>
            <strong>{tab.label}</strong>
            <span>{tab.cue}</span>
          </button>
        ))}
      </nav>
      <div className="ui-museum__platform-body">
        <PlatformDevicePreview
          item={item}
          realization={realization}
          platform={platform}
          mode={mode}
          enabled={enabled}
          sheetOpen={sheetOpen}
          selectedCard={selectedCard}
          field={field}
          onMode={setMode}
          onSheet={() => setSheetOpen((current) => !current)}
          onSelectCard={setSelectedCard}
          onField={setField}
        />
        <aside className="ui-museum__platform-inspector">
          <div>
            <span>{blueprint.title}</span>
            <p>{realization.platformTone[platform]} {notes[platform]}</p>
          </div>
          <section>
            <span>平台骨架</span>
            {blueprint.anatomy.map((item) => <strong key={item}>{item}</strong>)}
          </section>
          <section>
            <span>必须能互动的状态</span>
            {blueprint.states.map((item) => <strong key={item}>{item}</strong>)}
          </section>
          <section>
            <span>可复用给其他模块</span>
            <strong>{realization.prdBridge}</strong>
            <strong>工作流：把视觉 token 写入执行模板</strong>
            <strong>定时：把平台状态写入周期产物验收</strong>
            <strong>群策/PRD：输出页面、组件、动效和截图验收</strong>
            <strong>OpenBasaka：保存后进入风格自进化记忆，下一次融合会继承并修正。</strong>
          </section>
          <section>
            <span>反模式守门</span>
            {item.masterProfile.antiPatterns.map((line) => <strong key={line}>{line}</strong>)}
          </section>
        </aside>
      </div>
    </section>
  )
}

function PlatformDevicePreview({
  item,
  realization,
  platform,
  mode,
  enabled,
  sheetOpen,
  selectedCard,
  field,
  onMode,
  onSheet,
  onSelectCard,
  onField,
}: {
  item: UiStyleItem
  realization: StyleRealization
  platform: PlatformPreviewKind
  mode: number
  enabled: boolean
  sheetOpen: boolean
  selectedCard: number
  field: string
  onMode: (mode: number) => void
  onSheet: () => void
  onSelectCard: (index: number) => void
  onField: (value: string) => void
}) {
  const visual = item.visual
  const title = item.title.replace(/^\d+\.\s*/, '')
  const pages = platform === 'mac' ? realization.macPages : platform === 'mini' ? realization.miniPages : realization.pages
  const modeTitle = realization.modeTitles[platform][mode] || realization.modeTitles.web[mode] || realization.title
  const metrics = (realization.metrics[mode] || realization.metrics[0]).map((metric, index) => [
    metric.label,
    index === 0 && selectedCard > 0 ? `${Math.min(99, Number.parseInt(metric.value, 10) + selectedCard * 2 || 96)}%` : metric.value,
  ])
  const statusCopy = realization.states

  if (platform === 'ios') {
    return (
      <div className="ui-platform-preview" data-platform="ios" data-pattern={visual.pattern} data-style={item.id} data-enabled={enabled}>
        <div className="ui-platform-phone">
          <div className="ui-platform-status"><span>9:41</span><span>5G 100%</span></div>
          <header className="ui-platform-ios-nav">
            <button onClick={() => onMode((mode + 2) % 3)}>返回</button>
            <strong>{title}</strong>
            <button onClick={onSheet}>{sheetOpen ? '完成' : '更多'}</button>
          </header>
          <main className="ui-platform-ios-body">
            <span className="ui-platform-kicker">{realization.deviceKicker.ios}</span>
            <h3>{modeTitle}</h3>
            <p>{realization.caption}</p>
            <label className="ui-platform-input">
              <span>输入框状态</span>
              <input value={field} onChange={(event) => onField(event.target.value)} />
            </label>
            <div className="ui-platform-card-row">
              {statusCopy.map((state, index) => (
                <button key={state.label} className={selectedCard === index ? 'is-active' : ''} onClick={() => onSelectCard(index)}>
                  <strong>{state.label}</strong>
                  <span>{state.copy}</span>
                </button>
              ))}
            </div>
          </main>
          <nav className="ui-platform-tabbar">
            {pages.map((page, index) => <button key={page} className={mode === index ? 'is-active' : ''} onClick={() => onMode(index)}>{page}</button>)}
          </nav>
          {sheetOpen && (
            <div className="ui-platform-sheet">
              <strong>Sheet / Action</strong>
              <button onClick={() => onSelectCard((selectedCard + 1) % 3)}>切换状态</button>
              <button onClick={onSheet}>关闭</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (platform === 'mac') {
    return (
      <div className="ui-platform-preview" data-platform="mac" data-pattern={visual.pattern} data-style={item.id} data-enabled={enabled}>
        <div className="ui-platform-mac-window">
          <header className="ui-platform-mac-toolbar">
            <span><i /><i /><i /></span>
            <strong>{title}</strong>
            <div>
              <button onClick={() => onMode((mode + 1) % 3)}>视图</button>
              <button onClick={onSheet}>{sheetOpen ? '隐藏检查器' : '检查器'}</button>
            </div>
          </header>
          <div className="ui-platform-mac-grid">
            <aside>
              {pages.map((page, index) => <button key={page} className={mode === index ? 'is-active' : ''} onClick={() => onMode(index)}>{page}</button>)}
            </aside>
            <main>
              <span className="ui-platform-kicker">{realization.deviceKicker.mac}</span>
              <h3>{modeTitle}</h3>
              <p>{field}</p>
              <div className="ui-platform-mac-list">
                {statusCopy.map((state, index) => (
                  <button key={state.label} className={selectedCard === index ? 'is-active' : ''} onClick={() => onSelectCard(index)}>
                    <span>{state.label}</span>
                    <strong>{state.copy}</strong>
                  </button>
                ))}
              </div>
            </main>
            <section className={sheetOpen ? 'is-open' : ''}>
              <span>Inspector</span>
              {metrics.map(([label, value]) => <strong key={label}>{label}: {value}</strong>)}
              <label className="ui-platform-input">
                <span>焦点字段</span>
                <input value={field} onChange={(event) => onField(event.target.value)} />
              </label>
            </section>
          </div>
        </div>
      </div>
    )
  }

  if (platform === 'android') {
    return (
      <div className="ui-platform-preview" data-platform="android" data-pattern={visual.pattern} data-style={item.id} data-enabled={enabled}>
        <div className="ui-platform-phone ui-platform-phone--android">
          <header className="ui-platform-android-appbar">
            <button onClick={onSheet}>☰</button>
            <strong>{title}</strong>
            <button onClick={() => onMode((mode + 1) % 3)}>●</button>
          </header>
          <main className="ui-platform-android-body">
            <span className="ui-platform-kicker">{realization.deviceKicker.android}</span>
            <h3>{modeTitle}</h3>
            <div className="ui-platform-android-cards">
              {metrics.map(([label, value], index) => (
                <button key={label} className={selectedCard === index ? 'is-active' : ''} onClick={() => onSelectCard(index)}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </button>
              ))}
            </div>
            <label className="ui-platform-input">
              <span>TextField</span>
              <input value={field} onChange={(event) => onField(event.target.value)} />
            </label>
          </main>
          <button className="ui-platform-fab" onClick={() => {
            onSelectCard((selectedCard + 1) % 3)
            onMode((mode + 1) % 3)
          }}>＋</button>
          <nav className="ui-platform-tabbar ui-platform-tabbar--android">
            {pages.map((page, index) => <button key={page} className={mode === index ? 'is-active' : ''} onClick={() => onMode(index)}>{page}</button>)}
          </nav>
        </div>
      </div>
    )
  }

  if (platform === 'mini') {
    return (
      <div className="ui-platform-preview" data-platform="mini" data-pattern={visual.pattern} data-style={item.id} data-enabled={enabled}>
        <div className="ui-platform-phone ui-platform-phone--mini">
          <header className="ui-platform-mini-nav">
            <button onClick={() => onMode((mode + 2) % 3)}>‹</button>
            <strong>{title}</strong>
            <button className="ui-platform-mini-capsule" onClick={onSheet}>•• · ○</button>
          </header>
          <main className="ui-platform-mini-body">
            <span className="ui-platform-kicker">{realization.deviceKicker.mini}</span>
            <h3>{modeTitle}</h3>
            <p>{realization.platformTone.mini}</p>
            <div className="ui-platform-mini-services">
              {statusCopy.map((state, index) => (
                <button key={state.label} className={selectedCard === index ? 'is-active' : ''} onClick={() => onSelectCard(index)}>
                  <strong>{state.label}</strong>
                  <span>{state.copy}</span>
                </button>
              ))}
            </div>
          </main>
          <nav className="ui-platform-tabbar">
            {pages.map((page, index) => <button key={page} className={mode === index ? 'is-active' : ''} onClick={() => onMode(index)}>{page}</button>)}
          </nav>
          {sheetOpen && (
            <div className="ui-platform-sheet ui-platform-sheet--mini">
              <strong>小程序菜单</strong>
              <button>分享</button>
              <button>收藏服务</button>
              <button onClick={onSheet}>取消</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="ui-platform-preview" data-platform="web" data-pattern={visual.pattern} data-style={item.id} data-enabled={enabled}>
      <div className="ui-platform-browser">
        <header>
          <span><i /><i /><i /></span>
          <strong>{title}</strong>
          <nav>{pages.map((page, index) => <button key={page} className={mode === index ? 'is-active' : ''} onClick={() => onMode(index)}>{page}</button>)}</nav>
        </header>
        <main>
          <section className="ui-platform-web-hero">
            <span className="ui-platform-kicker">{realization.deviceKicker.web}</span>
            <h3>{modeTitle}</h3>
            <p>{realization.caption}</p>
            <div>
              <button className={selectedCard === 2 ? 'is-active' : ''} onClick={() => onSelectCard(2)}>{realization.action[mode]}</button>
              <button onClick={() => onMode((mode + 1) % 3)}>{realization.secondaryAction[mode]}</button>
            </div>
            <label className="ui-platform-input">
              <span>Focus input</span>
              <input value={field} onChange={(event) => onField(event.target.value)} />
            </label>
          </section>
          <aside className="ui-platform-web-side">
            {statusCopy.map((state, index) => (
              <button key={state.label} className={selectedCard === index ? 'is-active' : ''} onClick={() => onSelectCard(index)}>
                <span>{state.label}</span>
                <strong>{state.copy}</strong>
              </button>
            ))}
          </aside>
        </main>
      </div>
    </div>
  )
}

function FusionModal({ result, onClose, onSave }: { result: UiFusionResult; onClose: () => void; onSave: (result: UiFusionResult) => void }) {
  const visual = fusionVisual(result)
  const evolution = createStyleEvolutionEvent(result, stylesFromIds(result.parentStyleIds), result.parentStyleIds.length > 1 ? 'fusion' : 'single-style')
  return (
    <div className="ui-museum__modal">
      <section className="ui-museum__spec">
        <header>
          <div>
            <span>{result.generatedBy.toUpperCase()} FUSION</span>
            <h2>{result.name}</h2>
          </div>
          <div>
            <button onClick={() => onSave(result)}>保存</button>
            <button onClick={onClose}>关闭</button>
          </div>
        </header>
        <div className="ui-museum__spec-body">
          <div className="ui-museum__fusion-preview">
            <VisualShowcase visual={visual} title={result.name} subtitle={result.description} />
            {result.parentStyleIds.map((id) => (
              <StylePreview key={id} item={UI_STYLE_ITEMS.find((style) => style.id === id) || UI_STYLE_ITEMS[0]} compact />
            ))}
          </div>
          <div className="ui-museum__spec-main">
            <p>{result.description}</p>
            <div className="ui-museum__spec-grid">
              {Object.entries(result.specs).map(([key, value]) => (
                <article key={key}>
                  <span>{key}</span>
                  <strong>{value}</strong>
                </article>
              ))}
            </div>
            <TabsContent items={[['Web', result.web], ['iOS', result.ios], ['macOS', result.mac || 'macOS 版本必须使用 Toolbar、Sidebar/Split View、Inspector、键盘焦点和窗口状态承接桌面效率。'], ['Android', result.android], ['Mini Program', result.mini]]} />
            <StyleEvolutionPanel event={evolution} />
            <textarea readOnly value={result.prompt} />
            <button className="ui-museum__primary" onClick={() => copyText(result.prompt)}>
              复制融合 Prompt
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function StyleEvolutionMiniPanel({ title, lines }: { title: string; lines: string[] }) {
  return (
    <section className="ui-museum__evolution-mini">
      <span>OpenBasaka Evolution</span>
      <strong>{title}</strong>
      {lines.map((line) => <p key={line}>{line}</p>)}
    </section>
  )
}

function StyleEvolutionPanel({ event }: { event: UiStyleEvolutionEvent }) {
  return (
    <section className="ui-museum__evolution-panel">
      <header>
        <span>OpenBasaka 自进化</span>
        <strong>{event.targetName} · Generation {event.generation}</strong>
      </header>
      <p>{event.critique}</p>
      <div>
        {event.improvements.map((item) => <strong key={item}>{item}</strong>)}
      </div>
      <textarea readOnly value={event.promptPatch} />
      <button onClick={() => copyText(event.promptPatch)}>复制自进化补丁</button>
    </section>
  )
}

function ProjectModal({
  project,
  activeTab,
  onTab,
  onClose,
  onSave,
}: {
  project: UiProjectPrd
  activeTab: ProjectTab
  onTab: (tab: ProjectTab) => void
  onClose: () => void
  onSave: (project: UiProjectPrd) => void
}) {
  return (
    <div className="ui-museum__modal">
      <section className="ui-museum__project">
        <header>
          <div>
            <span>PROJECT GENESIS · {project.generatedBy.toUpperCase()}</span>
            <h2>{project.title}</h2>
          </div>
          <div>
            <button onClick={() => onSave(project)}>保存项目</button>
            <button onClick={onClose}>关闭</button>
          </div>
        </header>
        <nav>
          {[
            ['overview', '调研与决策'],
            ['preview', '视觉原型'],
            ['manual', 'PRD 手册'],
            ['tech', '技术蓝图'],
          ].map(([id, label]) => (
            <button key={id} className={activeTab === id ? 'ui-museum__project-tab--active' : ''} onClick={() => onTab(id as ProjectTab)}>
              {label}
            </button>
          ))}
        </nav>
        <main>
          {activeTab === 'overview' && (
            <div className="ui-museum__project-overview">
              <blockquote>{project.userIdea}</blockquote>
              <section>
                <h3>市场调研</h3>
                <p>{project.researchReport}</p>
              </section>
              <section className="ui-museum__experts">
                {project.teamBrainstorming.map((item) => (
                  <article key={item.role}>
                    <span>{item.role}</span>
                    <strong>{item.name}</strong>
                    <small>{item.focus}</small>
                    <p>{item.opinion}</p>
                  </article>
                ))}
              </section>
              <section>
                <h3>核心卖点</h3>
                <p>{project.elevatorPitch}</p>
              </section>
            </div>
          )}
          {activeTab === 'preview' && (
            <ProjectPrototype project={project} />
          )}
          {activeTab === 'manual' && <pre>{project.prdManual}</pre>}
          {activeTab === 'tech' && (
            <div className="ui-museum__tech">
              {Object.entries(project.techStack).map(([key, value]) => (
                <article key={key}>
                  <span>{key}</span>
                  <strong>{value}</strong>
                </article>
              ))}
              <pre>{project.databaseSchema}</pre>
              <pre>{project.apiEndpoints}</pre>
            </div>
          )}
        </main>
      </section>
    </div>
  )
}

function ProjectPrototype({ project }: { project: UiProjectPrd }) {
  const visual = projectVisual(project)
  return (
    <div className="ui-museum__project-preview" data-pattern={visual.pattern} style={visualStyleVars(visual)}>
              <div>
                <span>{project.visualStyleFusion.styleIds.join(' + ')}</span>
                <h3>{project.title}</h3>
                <p>{project.elevatorPitch}</p>
                <button>Primary Action</button>
              </div>
              <aside>
                {project.features.slice(0, 4).map((feature) => (
                  <article key={feature.name}>
                    <strong>{feature.priority}</strong>
                    <span>{feature.name}</span>
                  </article>
                ))}
              </aside>
            </div>
  )
}

function InteractiveWebsitePreview({ item }: { item: UiStyleItem }) {
  const visual = item.visual
  const realization = styleSpecificFamily(item.id, visual.pattern)
  const pages = realization.pages
  const [activePage, setActivePage] = useState(pages[1] || pages[0] || 'Studio')
  const [activeMetric, setActiveMetric] = useState(0)
  const [slider, setSlider] = useState(68)
  const [enabled, setEnabled] = useState(true)
  const [primaryPressed, setPrimaryPressed] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [draft, setDraft] = useState(realization.field)
  const cleanTitle = item.title.replace(/^\d+\.\s*/, '')
  const activeState = realization.states[activeMetric] || realization.states[0]
  const activeMetrics = realization.metrics[activeMetric] || realization.metrics[0]
  const metrics = [
    { label: activeMetrics[0]?.label || 'Visual Fit', value: activeMetrics[0]?.value || `${Math.min(99, 72 + activeMetric * 9)}%` },
    { label: activeMetrics[1]?.label || 'Motion', value: enabled ? activeMetrics[1]?.value || 'Live' : 'Still' },
    { label: 'Density', value: visual.density },
  ]

  return (
    <div className="ui-museum__website-lab" style={visualStyleVars(visual)} data-pattern={visual.pattern} data-style={item.id}>
      <div className="ui-museum__website-toolbar">
        <div>
          <strong>真实网站互动预览</strong>
          <span>点击导航、按钮、卡片、开关、输入框，观察此 UI 主题的同源落地效果。</span>
        </div>
        <div className="ui-museum__zoom-controls" aria-label="预览缩放">
          {[1, 1.25, 1.5].map((value) => (
            <button key={value} className={zoom === value ? 'ui-museum__zoom-active' : ''} onClick={() => setZoom(value)}>
              {Math.round(value * 100)}%
            </button>
          ))}
        </div>
      </div>
      <div className="ui-museum__website-scroll">
        <div className="ui-museum__website-stage" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
          <div className="ui-museum-site" data-enabled={enabled}>
            <header className="ui-museum-site__nav">
              <div className="ui-museum-site__brand">
                <i />
                <span>{cleanTitle}</span>
              </div>
              <nav>
                {pages.map((page) => (
                  <button key={page} className={activePage === page ? 'is-active' : ''} onClick={() => setActivePage(page)}>
                    {page}
                  </button>
                ))}
              </nav>
              <button className="ui-museum-site__ghost" onClick={() => setEnabled((current) => !current)}>
                {enabled ? 'Live mode' : '静态模式'}
              </button>
            </header>

            <main className="ui-museum-site__main">
              <section className="ui-museum-site__hero">
                <span className="ui-museum-site__eyebrow">{item.tier} / {visual.pattern} / {activePage}</span>
                <h1>{realization.title}</h1>
                <p>{realization.caption}</p>
                <div className="ui-museum-site__actions">
                  <button className={primaryPressed ? 'is-active' : ''} onClick={() => {
                    setPrimaryPressed((current) => !current)
                    setActiveMetric((current) => (current + 1) % 3)
                  }}>
                    {primaryPressed ? activeState.copy : realization.action[activeMetric] || realization.action[0]}
                  </button>
                  <button onClick={() => setActivePage(pages[2] || pages[0])}>{realization.secondaryAction[activeMetric] || realization.secondaryAction[0]}</button>
                </div>
                <div className="ui-museum-site__input">
                  <input value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="体验输入框" />
                  <button onClick={() => setDraft(`${cleanTitle} 已生成 ${activeState.label} 验收清单。`)}>{realization.inputAction}</button>
                </div>
              </section>

              <aside className="ui-museum-site__panel">
                <div className="ui-museum-site__style-sample">
                  <PreviewScene visual={visual} title={cleanTitle} eyebrow={item.tier} styleId={item.id} compact />
                </div>
                {metrics.map((metric, index) => (
                  <button key={metric.label} className={activeMetric === index ? 'is-active' : ''} onClick={() => setActiveMetric(index)}>
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                  </button>
                ))}
                <label className="ui-museum-site__range">
                  <span>信息密度 {slider}%</span>
                  <input type="range" min="20" max="100" value={slider} onChange={(event) => setSlider(Number(event.target.value))} />
                </label>
              </aside>
            </main>

            <section className="ui-museum-site__content">
              {realization.states.map((state, index) => (
                <article key={state.label} className={activeMetric === index ? 'is-active' : ''} onClick={() => setActiveMetric(index)}>
                  <span>{state.label}</span>
                  <strong>{state.copy}</strong>
                  <p>{state.detail}</p>
                  <div className="ui-museum-site__micro-bars">
                    {[36, slider, 78].map((width, barIndex) => <i key={barIndex} style={{ width: `${Math.min(96, width + index * 4)}%` }} />)}
                  </div>
                </article>
              ))}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

function StylePreview({ item, compact = false }: { item: UiStyleItem; compact?: boolean }) {
  return (
    <VisualShowcase visual={item.visual} title={item.title.replace(/^\d+\.\s*/, '')} subtitle={item.description} compact={compact} dataStyle={item.id} />
  )
}

function VisualShowcase({
  visual,
  title,
  subtitle,
  compact = false,
  dataStyle,
}: {
  visual: UiVisualTokens
  title: string
  subtitle: string
  compact?: boolean
  dataStyle?: string
}) {
  return (
    <div
      className={compact ? 'ui-museum__large-preview ui-museum__large-preview--compact' : 'ui-museum__large-preview'}
      data-pattern={visual.pattern}
      data-style={dataStyle}
      style={visualStyleVars(visual)}
    >
      <PreviewScene visual={visual} title={title} eyebrow={visual.motif} subtitle={subtitle} styleId={dataStyle} />
    </div>
  )
}

function PreviewScene({
  visual,
  title,
  eyebrow,
  subtitle,
  styleId,
  compact = false,
}: {
  visual: UiVisualTokens
  title: string
  eyebrow: string
  subtitle?: string
  styleId?: string
  compact?: boolean
}) {
  const [phase, setPhase] = useState(0)
  const phaseLabels = ['LIVE', 'FOCUS', 'ACTIVE']

  function moveLight(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100))
    event.currentTarget.style.setProperty('--ui-px', `${x}%`)
    event.currentTarget.style.setProperty('--ui-py', `${y}%`)
    event.currentTarget.style.setProperty('--ui-dx', `${(x - 50) * 0.34}px`)
    event.currentTarget.style.setProperty('--ui-dy', `${(y - 50) * 0.34}px`)
    event.currentTarget.style.setProperty('--ui-tilt-x', `${(50 - y) / 18}deg`)
    event.currentTarget.style.setProperty('--ui-tilt-y', `${(x - 50) / 18}deg`)
  }

  function resetLight(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.style.setProperty('--ui-px', '50%')
    event.currentTarget.style.setProperty('--ui-py', '50%')
    event.currentTarget.style.setProperty('--ui-dx', '0px')
    event.currentTarget.style.setProperty('--ui-dy', '0px')
    event.currentTarget.style.setProperty('--ui-tilt-x', '0deg')
    event.currentTarget.style.setProperty('--ui-tilt-y', '0deg')
  }

  function cyclePhase() {
    setPhase((current) => (current + 1) % 3)
  }

  return (
    <div
      className="ui-museum__preview-scene"
      data-pattern={visual.pattern}
      data-density={visual.density}
      data-phase={phase}
      role="button"
      tabIndex={0}
      aria-label={`${title} live UI preview`}
      style={visualStyleVars(visual)}
      onPointerMove={moveLight}
      onPointerLeave={resetLight}
      onClick={cyclePhase}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          cyclePhase()
        }
      }}
    >
      <div className="ui-museum__preview-orbit" />
      <div className="ui-museum__preview-noise" />
      {renderStyleExample({ visual, title, eyebrow, subtitle, styleId, compact, phase })}
      <div className="ui-museum__live-hud" aria-hidden="true">
        <span>{phaseLabels[phase]}</span>
        <b>{String(phase + 1).padStart(2, '0')}</b>
      </div>
    </div>
  )
}

function renderStyleExample({
  visual,
  title,
  eyebrow,
  subtitle,
  styleId,
  compact,
  phase,
}: {
  visual: UiVisualTokens
  title: string
  eyebrow: string
  subtitle?: string
  styleId?: string
  compact: boolean
  phase: number
}) {
  if (compact) {
    return <StyleExperiencePreview visual={visual} title={title} eyebrow={eyebrow} styleId={styleId} phase={phase} />
  }

  switch (styleId) {
    case 'neuro-morphic':
      return (
        <div className="ui-museum-demo ui-museum-demo--neuro">
          <div className="ui-museum-demo__blob ui-museum-demo__blob--a" />
          <div className="ui-museum-demo__blob ui-museum-demo__blob--b" />
          <section>
            <i />
            <strong>Breathe</strong>
            <span>{['Bio-sync active', 'Breath rate 6.2', 'Coherence 91%'][phase]}</span>
          </section>
        </div>
      )
    case 'quantum-glass':
      return (
        <div className="ui-museum-demo ui-museum-demo--quantum">
          <section>
            <strong>QUANTUM</strong>
            <strong>QUANTUM</strong>
            <strong>QUANTUM</strong>
            <i />
          </section>
        </div>
      )
    case 'ambient-aura':
      return (
        <div className="ui-museum-demo ui-museum-demo--aura">
          <section>
            <i />
            <strong>AURA</strong>
            <span>ambient layer</span>
          </section>
        </div>
      )
    case 'hyper-brutalism':
      return (
        <div className="ui-museum-demo ui-museum-demo--hyper">
          <section>
            <strong>HYPER</strong>
            <b>RAW</b>
            <button>{['Execute', 'Pressed', 'Shipped'][phase]}</button>
          </section>
        </div>
      )
    case 'copilot-ai':
      return (
        <div className="ui-museum-demo ui-museum-demo--copilot">
          <header><i />Ready <b>copilot-4o</b></header>
          <pre>{[
            '> Analyzing context...\\n> Building plan...\\n> Task ready ✓',
            '> Reading repo...\\n> Writing patch...\\n> Preview updated ✓',
            '> Running checks...\\n> Risk low...\\n> Ship signal ✓',
          ][phase]}</pre>
          <button>{['▶ Run Agent', '◼ Running', '✓ Complete'][phase]}</button>
        </div>
      )
    case 'zero-ui':
      return (
        <div className="ui-museum-demo ui-museum-demo--zero">
          <i />
          <strong>AMBIENT</strong>
          <span>Interface appears when needed</span>
        </div>
      )
    case 'data-ink':
      return (
        <div className="ui-museum-demo ui-museum-demo--data">
          <header><b>{['REVENUE Q4', 'ACTIVE USERS', 'RETENTION'][phase]}</b><span>{['$4.2M ↑12%', '128K ↑24%', '73% ↑8%'][phase]}</span></header>
          <div className="ui-museum-demo__bars">
            {[
              [28, 45, 32, 58, 41, 72, 55, 68, 48, 85, 62, 78],
              [38, 42, 56, 44, 63, 70, 76, 82, 72, 88, 84, 92],
              [22, 34, 52, 61, 49, 58, 64, 71, 79, 74, 82, 89],
            ][phase].map((value, itemIndex) => <i key={`${value}-${itemIndex}`} style={{ height: `${value}%` }} />)}
          </div>
          <footer><span>Jan</span><span>Dec</span></footer>
        </div>
      )
    case 'emotion-adaptive':
      return (
        <div className="ui-museum-demo ui-museum-demo--emotion">
          <i>🌊</i>
          <strong>Calm</strong>
          <span>Adapting to your mood</span>
          <footer><b /><b /><b /></footer>
        </div>
      )
    case 'agentic-os':
      return (
        <div className="ui-museum-demo ui-museum-demo--agentic">
          <header>⬡ AGENT MESH <span>v2.0</span></header>
          {['Planner', 'Coder', 'Reviewer'].map((agent, index) => (
            <div key={agent} className="ui-museum-demo__agent-row">
              <i />
              <span>{agent}</span>
              <b style={{ width: `${[100, 64, 28].map((base, itemIndex) => Math.min(100, base + phase * (itemIndex + 1) * 12))[index]}%` }} />
            </div>
          ))}
          <button>{['▶ Execute Pipeline', '◼ Agents Working', '✓ Pipeline Ready'][phase]}</button>
        </div>
      )
    case 'wabi-sabi':
      return (
        <div className="ui-museum-demo ui-museum-demo--wabi">
          <i />
          <strong>不完美</strong>
          <span>Beauty in imperfection</span>
          <b />
        </div>
      )
    case 'chromium':
      return (
        <div className="ui-museum-demo ui-museum-demo--chrome">
          <i />
          <strong>CHROME</strong>
          <span>Liquid Metal</span>
        </div>
      )
    case 'kinetic':
      return (
        <div className="ui-museum-demo ui-museum-demo--kinetic">
          <span>KINETIC TYPE KINETIC TYPE</span>
          <strong>MOVE<br />FAST</strong>
          <b>VARIABLE</b>
        </div>
      )
    case 'blueprint-cad':
    case 'blueprint':
      return (
        <div className="ui-museum-demo ui-museum-demo--blueprint">
          <header>SECTION A-03 <b>1:1</b></header>
          <section>
            <strong>INTERFACE PLAN</strong>
            <span>X 084 / Y 122 / GRID 12</span>
          </section>
          <i />
        </div>
      )
    case 'pixel':
      return (
        <div className="ui-museum-demo ui-museum-demo--pixel">
          <header>8-BIT UI <b>LVL 01</b></header>
          <section>
            <strong>PIXEL<br />QUEST</strong>
            <button>{['START', 'LEVEL UP', 'SAVE'][phase]}</button>
          </section>
          <footer><i /><i /><i /><i /></footer>
        </div>
      )
    case 'dither':
      return (
        <div className="ui-museum-demo ui-museum-demo--dither">
          <section>
            <strong>1-BIT</strong>
            <span>ATKINSON DITHERING</span>
            <footer><i /><i /><i /></footer>
          </section>
        </div>
      )
    case 'holographic':
      return (
        <div className="ui-museum-demo ui-museum-demo--holo">
          <section>HOLO<br />GRAPHIC</section>
        </div>
      )
    case 'anthropic-serif':
      return (
        <div className="ui-museum-demo ui-museum-demo--anthropic">
          <strong>Claude</strong>
          <span>How can I help you think?</span>
          <button>Talk to Claude</button>
        </div>
      )
    case 'material':
    case 'bento':
    case 'glass':
    case 'liquid-glass':
    case 'spatial':
    case 'minimal':
    case 'm3-expressive':
    case 'canvas-ai':
    case 'xai-transparency':
    case 'multimodal-gesture':
    case 'adaptive-a11y':
    case 'micro-sonic':
    case 'barely-there':
    case 'human-touch-ai':
    case 'soft-maximalism':
    case 'intent-friction':
    case 'spaceship-manual':
    case 'local-first-ledger':
    case 'swiss':
    case 'natural':
    case 'skeuo-nature':
    case 'skeuo-stone':
    case 'risograph':
    case 'paper':
    case 'memphis':
    case 'neondark':
    case 'cyber':
    case 'dos':
    case 'win95':
    case 'gothic':
    case 'dreamcore':
    case '3d-interactive':
    case 'aurora-mesh':
    case 'aurora':
    case 'atomic-age':
    case 'jetsons':
    case 'solarpunk-utopia':
    case 'solar':
    case 'brutal-bw':
    case 'gen-ui':
    case 'brutal':
    case 'personal':
    case 'tactile':
    case 'digicute':
    case 'microind':
    case 'snapshot':
    case 'blooming':
    case 'distorted':
    case 'freshretro':
    case 'cassette':
    case 'neu':
    case 'frutiger':
    case 'clay':
    case 'skeuo':
    case 'bauhaus':
    case 'doodle':
    case 'vapor':
      return <StyleSpecificProductPreview visual={visual} title={title} eyebrow={eyebrow} styleId={styleId} phase={phase} compact={compact} />
    default:
      return <PatternStyleExample visual={visual} title={title} eyebrow={eyebrow} styleId={styleId} phase={phase} />
  }
}

function StyleExperiencePreview({
  visual,
  title,
  eyebrow,
  styleId,
  phase,
}: {
  visual: UiVisualTokens
  title: string
  eyebrow: string
  styleId?: string
  phase: number
}) {
  const family = styleSpecificFamily(styleId, visual.pattern)
  const metrics = family.metrics[phase] || family.metrics[0]
  const activeState = family.states[phase] || family.states[0]
  const pages = family.pages.length > 0 ? family.pages : ['Home', 'Studio', 'Insight']
  const cleanTitle = title.replace(/^\d+\.\s*/, '').replace(/\(.+?\)/g, '').trim()
  const modeTitle = family.modeTitles.web[phase] || family.title
  const actions = [
    family.action[phase] || family.action[0],
    family.secondaryAction[phase] || family.secondaryAction[0],
    activeState.label,
  ]

  return (
    <div
      className={`ui-museum-card-experience ui-museum-card-experience--${family.kind}`}
      data-style={styleId}
      data-pattern={visual.pattern}
      data-phase={phase}
    >
      <header className="ui-museum-card-experience__top">
        <div>
          <span>{family.label || eyebrow}</span>
          <strong>{cleanTitle || family.title}</strong>
        </div>
        <b>{family.badge}</b>
      </header>

      <main className="ui-museum-card-experience__signature">
        <StyleExperienceArtifact family={family} visual={visual} styleId={styleId} phase={phase} />
        <section className="ui-museum-card-experience__headline">
          <small>{family.deviceKicker.web} / {family.kicker}</small>
          <em>{modeTitle}</em>
          <strong>{family.title}</strong>
          <p>{family.caption}</p>
        </section>
      </main>

      <nav className="ui-museum-card-experience__nav" aria-label={`${title} preview pages`}>
        {pages.slice(0, 3).map((page, index) => (
          <span key={page} className={phase === index ? 'is-active' : ''}>{page}</span>
        ))}
      </nav>

      <section className="ui-museum-card-experience__controls" aria-label={`${title} interaction states`}>
        {actions.map((action, index) => (
          <span key={`${action}-${index}`} className={phase === index ? 'is-active' : ''}>
            {action}
          </span>
        ))}
      </section>

      <div className="ui-museum-card-experience__rows" aria-label={`${title} component grammar`}>
        {family.rows.slice(0, 3).map((row, index) => (
          <span key={row}>
            <i style={{ width: `${Math.min(96, 34 + index * 18 + phase * 10)}%` }} />
            <small>{row}</small>
          </span>
        ))}
      </div>

      <footer className="ui-museum-card-experience__bottom">
        <section>
          <span>{activeState.label}</span>
          <strong>{activeState.copy}</strong>
          <p>{activeState.detail}</p>
        </section>
        <div>
          {metrics.slice(0, 2).map((metric) => (
            <article key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </article>
          ))}
        </div>
      </footer>
    </div>
  )
}

function StyleExperienceArtifact({
  family,
  visual,
  styleId,
  phase,
}: {
  family: StyleRealization
  visual: UiVisualTokens
  styleId?: string
  phase: number
}) {
  const artifactTitle =
    styleId === 'dither'
      ? '1-BIT'
      : styleId === 'pixel'
        ? '8-BIT'
        : styleId === 'chromium'
          ? 'CHROME'
          : styleId === 'kinetic'
            ? 'MOVE'
            : family.title
  return (
    <div className="ui-museum-card-experience__artifact" data-kind={family.kind} data-style={styleId} data-pattern={visual.pattern} data-phase={phase} aria-hidden="true">
      <span />
      <span />
      <span />
      <i />
      <strong>{artifactTitle}</strong>
      <em>{family.kicker}</em>
      <b>{family.badge}</b>
    </div>
  )
}

function StyleSpecificProductPreview({
  visual,
  title,
  eyebrow,
  styleId,
  phase,
  compact,
}: {
  visual: UiVisualTokens
  title: string
  eyebrow: string
  styleId?: string
  phase: number
  compact: boolean
}) {
  const cleanTitle = title.replace(/^\d+\.\s*/, '').replace(/\(.+?\)/g, '').trim()
  const family = styleSpecificFamily(styleId, visual.pattern)
  const metrics = family.metrics[phase] || family.metrics[0]
  return (
    <div className={`ui-museum-demo ui-museum-product-demo ui-museum-product-demo--${family.kind}`} data-style={styleId} data-compact={compact}>
      <header>
        <span>{family.label || eyebrow}</span>
        <b>{family.badge}</b>
      </header>
      <main>
        <section>
          <small>{family.kicker}</small>
          <strong>{compact ? family.title : cleanTitle || family.title}</strong>
          <p>{family.caption}</p>
          <button>{family.action[phase] || family.action[0]}</button>
        </section>
        <aside>
          {metrics.map((metric) => (
            <article key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </article>
          ))}
        </aside>
      </main>
      <footer>
        {family.rows.map((row, index) => (
          <span key={row}>
            <i style={{ width: `${Math.min(96, 32 + index * 18 + phase * 8)}%` }} />
            {row}
          </span>
        ))}
      </footer>
    </div>
  )
}

function compactProfileLine(line: string, fallback: string): string {
  const compact = line
    .replace(/^导航、主按钮、输入、卡片、空态\/加载\/成功\/失败态都必须围绕“(.+?)”建立同源组件语法。$/, '$1')
    .replace(/^组件状态要显露\s*/, '')
    .replace(/必须|参考|强调|界面|产品|状态|。/g, '')
    .replace(/[，；].*$/, '')
    .trim()
  return compact.length > 0 ? compact.slice(0, 24) : fallback
}

function styleRealizationFromMasterProfile(item: UiStyleItem, base: StyleRealization): StyleRealization {
  const cleanTitle = item.title.replace(/^\d+\.\s*/, '').replace(/\(.+?\)/g, '').trim()
  const profile = item.masterProfile
  const label = cleanTitle.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim() || cleanTitle
  const badge = item.visual.motif.split(/\s+/)[0]?.toUpperCase().slice(0, 8) || item.tier
  const rows = profile.componentGrammar.slice(0, 3).map((line, index) => compactProfileLine(line, base.rows[index] || 'Style rule'))
  const states = [
    { label: '空态', copy: `${cleanTitle} 等待第一信号`, detail: profile.identityRules[0] },
    { label: '加载态', copy: `${cleanTitle} 正在组织组件`, detail: profile.componentGrammar[0] },
    { label: '成功态', copy: `${cleanTitle} 复原验收通过`, detail: profile.acceptanceChecklist[0] },
  ]

  return {
    ...base,
    kind: item.visual.pattern,
    label,
    badge,
    kicker: profile.referenceBrief.split('，')[0].slice(0, 42),
    title: cleanTitle,
    caption: profile.identityRules[0],
    action: [`打开 ${cleanTitle}`, `精修 ${cleanTitle}`, `验收 ${cleanTitle}`],
    secondaryAction: ['查看来源', '检查反模式', '写入 OpenBasaka'],
    rows,
    pages: ['Identity', 'Components', 'Evidence'],
    miniPages: ['身份', '组件', '验收'],
    macPages: ['Reference', 'Workbench', 'Inspector'],
    field: profile.promptRules[0],
    inputAction: '验收',
    states,
    metrics: [
      [{ label: 'Identity', value: `${profile.restorationScores.identity}%` }, { label: 'Craft', value: `${profile.restorationScores.craft}%` }],
      [{ label: 'Interact', value: `${profile.restorationScores.interaction}%` }, { label: 'Platform', value: `${profile.restorationScores.platformFit}%` }],
      [{ label: 'OpenBasaka', value: `${profile.restorationScores.openbasakaUsefulness}%` }, { label: 'Gate', value: 'Pass' }],
    ],
    modeTitles: {
      web: [`${cleanTitle} home`, `${cleanTitle} focus`, `${cleanTitle} shipped`],
      ios: [`${cleanTitle} 首页`, `${cleanTitle} sheet`, `${cleanTitle} 触感确认`],
      mac: [`${cleanTitle} 工作台`, `${cleanTitle} 精修`, `${cleanTitle} 验收`],
      android: [`${cleanTitle} surface`, `${cleanTitle} state`, `${cleanTitle} ready`],
      mini: [`${cleanTitle} 导航`, `${cleanTitle} 轻量页`, `${cleanTitle} 反馈`],
    },
    platformTone: profile.platformRules,
    prdBridge: `${cleanTitle} 会把来源基准、身份规则、组件语法、反模式和复原评分写入 PRD/工作流/群策验收。`,
  }
}

function styleSpecificFamily(styleId: string | undefined, pattern: UiVisualTokens['pattern']): StyleRealization {
  const base: StyleRealization = {
    kind: pattern,
    label: 'PROFILE ADAPTIVE SURFACE',
    badge: 'UI',
    kicker: 'live product',
    title: 'Interface',
    caption: 'A production-like surface with real hierarchy, state and controls.',
    action: ['Open', 'Focus', 'Done'],
    secondaryAction: ['Inspect', 'Tune state', 'Export'],
    rows: ['Navigation state', 'Primary action', 'Empty / loading / success'],
    pages: ['Home', 'Studio', 'Insight'],
    miniPages: ['首页', '灵感', '我的'],
    macPages: ['Inbox', 'Canvas', 'Inspector'],
    field: '把风格 DNA 落到真实组件状态',
    inputAction: '生成',
    states: [
      { label: '空态', copy: '等待第一条内容', detail: '看空状态的留白、图形和引导按钮是否沿用同一风格。' },
      { label: '加载态', copy: '正在组织界面层级', detail: '看骨架屏、进度条和动效节奏是否来自同一套 token。' },
      { label: '成功态', copy: '视觉验收通过', detail: '看成功反馈、强调色和结果卡片是否与预览一致。' },
    ],
    metrics: [
      [{ label: 'Fit', value: '92%' }, { label: 'State', value: 'Ready' }],
      [{ label: 'Fit', value: '97%' }, { label: 'State', value: 'Active' }],
      [{ label: 'Fit', value: '99%' }, { label: 'State', value: 'Shipped' }],
    ],
    deviceKicker: {
      web: 'Responsive Web',
      ios: 'SwiftUI Surface',
      mac: 'Split View Canvas',
      android: 'Material 3 Surface',
      mini: 'Mini Program Page',
    },
    modeTitles: {
      web: ['可点击首页', '表单聚焦', '数据落地'],
      ios: ['首页体验', '编辑状态', '交付确认'],
      mac: ['工作台总览', '精修组件', '验收清单'],
      android: ['Tonal overview', 'Component state', 'Ready to ship'],
      mini: ['固定导航', '服务卡片', '底部面板'],
    },
    platformTone: {
      web: 'Web 版保留首屏结构、焦点态、响应式导航与可点击主路径。',
      ios: 'iOS 版用原生导航、sheet、底部 tab 和触感反馈重建，不照搬网页。',
      mac: 'macOS 版使用工具栏、侧边栏、检查器和键盘焦点承接桌面效率。',
      android: 'Android 版用 Material 3 结构承接动态色、状态层、FAB 和 ripple。',
      mini: '小程序版用固定导航、胶囊菜单、tabBar 和轻量 Canvas/纹理降级。',
    },
    prdBridge: 'PRD/工作流读取这套实现档案，先写视觉 DNA，再写平台差异和验收截图。',
  }

  const byStyle: Record<string, StyleRealization> = {
    'neuro-morphic': {
      ...base,
      kind: 'organism',
      label: 'BIO SYNC',
      badge: 'BREATHE',
      kicker: 'biofeedback surface',
      title: 'Breath Console',
      caption: 'Organic controls, pulse states and soft biometric feedback built into real components.',
      action: ['Sync breath', 'Adjust pulse', 'Save state'],
      secondaryAction: ['Open rhythm', 'Tune sensor', 'Export calm'],
      rows: ['Breath ring', 'Bio card', 'Coherence feedback'],
      field: '把呼吸节律、柔性卡片和反馈状态落到真实组件。',
      modeTitles: {
        web: ['Breath home', 'Sensor focus', 'Coherence saved'],
        ios: ['呼吸首页', '传感编辑', '触感确认'],
        mac: ['生物反馈台', '节律精修', '状态验收'],
        android: ['Bio surface', 'Pulse controls', 'Calm shipped'],
        mini: ['呼吸导航', '疗愈卡片', '轻量反馈'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版要让呼吸环、柔性卡片和反馈按钮都像有机生命体一样缓慢响应。',
        ios: 'iOS 版以大触控、sheet 和轻触感表达呼吸状态，不做普通表单。',
      },
      prdBridge: '工作流会把呼吸节奏、柔性面板和生物反馈状态写入体验验收。',
    },
    'quantum-glass': {
      ...base,
      kind: 'prismatic',
      label: 'QUANTUM GLASS',
      badge: 'REFRACT',
      kicker: 'optical command',
      title: 'Prism Desk',
      caption: 'Refracted panes, spectral focus and dimensional action states without becoming generic glass.',
      action: ['Refract', 'Split beam', 'Lock lens'],
      secondaryAction: ['Shift angle', 'Inspect light', 'Export prism'],
      rows: ['Spectrum nav', 'Lens field', 'Photon state'],
      field: '把折射、色散、空间焦点和按钮状态落到真实产品界面。',
      modeTitles: {
        web: ['Prism landing', 'Lens focus', 'Beam resolved'],
        ios: ['光学首页', '焦点 sheet', '折射确认'],
        mac: ['棱镜工作台', '光束精修', '光学校验'],
        android: ['Refracted surface', 'State lens', 'Ready beam'],
        mini: ['棱镜导航', '轻量折射', '降级光场'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版要用可读的折射面板和焦点层级，而不是只贴一层毛玻璃。',
      },
      prdBridge: '群策/PRD 会继承折射层级、光学焦点和降级规则。',
    },
    'ambient-aura': {
      ...base,
      kind: 'aura',
      label: 'AMBIENT AURA',
      badge: 'AURA',
      kicker: 'ambient layer',
      title: 'Aura Room',
      caption: 'A low-boundary interface where light, breath and calm state changes carry the product.',
      action: ['Dim light', 'Tune aura', 'Hold calm'],
      secondaryAction: ['Open layer', 'Balance field', 'Export mood'],
      rows: ['Light rail', 'Breathing card', 'Quiet CTA'],
      field: '把暗场、柔光、低边界和呼吸式状态落到真实页面。',
      modeTitles: {
        web: ['Aura home', 'Light focus', 'Calm saved'],
        ios: ['氛围首页', '柔光编辑', '触感确认'],
        mac: ['氛围工作台', '光场精修', '静态验收'],
        android: ['Ambient surface', 'Glow state', 'Calm ready'],
        mini: ['氛围导航', '轻量柔光', '安静反馈'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版保留暗场、柔光和低边界，所有按钮与卡片都要像从环境里浮现。',
      },
      prdBridge: '定时/工作流会复用氛围层、柔光强度和呼吸动效验收。',
    },
    'hyper-brutalism': {
      ...base,
      kind: 'brutal',
      label: 'HYPER BRUTAL',
      badge: 'RAW',
      kicker: 'impact grid',
      title: 'Impact Console',
      caption: 'Thick borders, violent color blocks and pressed physical controls with usable hierarchy.',
      action: ['Execute', 'Smash state', 'Ship raw'],
      secondaryAction: ['Break grid', 'Inspect block', 'Publish signal'],
      rows: ['Hard nav', 'Impact card', 'Pressed CTA'],
      field: '把粗黑边框、硬阴影、撞色和按压态落到真实组件。',
      modeTitles: {
        web: ['Raw home', 'Pressed form', 'Signal shipped'],
        ios: ['硬核首页', '物理按钮', '确认反馈'],
        mac: ['粗野工作台', '块级精修', '状态验收'],
        android: ['Impact surface', 'Block state', 'Raw ready'],
        mini: ['硬边导航', '重块卡片', '轻量粗野'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版要让按钮、导航、空态都成为可按压的粗粝物理块。',
      },
      prdBridge: 'PRD 会记录粗野组件必须保留硬边、硬阴影和强焦点态。',
    },
    'copilot-ai': {
      ...base,
      kind: 'agent',
      label: 'COPILOT AI',
      badge: 'AGENT',
      kicker: 'agent status',
      title: 'Copilot Runway',
      caption: 'Streaming agent state, command controls and execution receipts as the core visual language.',
      action: ['Run agent', 'Review diff', 'Commit plan'],
      secondaryAction: ['Inspect queue', 'Tune tool', 'Export receipt'],
      rows: ['Agent stream', 'Tool receipt', 'Next action'],
      field: '把 Agent 状态、工具调用、执行收据和下一步落到真实工作台。',
      modeTitles: {
        web: ['Agent home', 'Tool focus', 'Receipt ready'],
        ios: ['副驾首页', '执行 sheet', '触感完成'],
        mac: ['Agent 控制台', '工具精修', '收据验收'],
        android: ['Agent surface', 'Run state', 'Receipt shipped'],
        mini: ['任务导航', '轻量执行', '结果回执'],
      },
      prdBridge: '工作流和群策会直接读取 Agent 状态、工具收据和下一步字段。',
    },
    'zero-ui': {
      ...base,
      kind: 'ambient',
      label: 'ZERO UI',
      badge: 'INVIS',
      kicker: 'context first',
      title: 'Quiet Control',
      caption: 'Controls appear only when context demands them, with minimal visible interface weight.',
      action: ['Reveal', 'Accept cue', 'Fade back'],
      secondaryAction: ['Sense context', 'Tune cue', 'Export intent'],
      rows: ['Context cue', 'Hidden control', 'Ambient response'],
      field: '把无感上下文、按需浮现和最小界面重量落到真实交互。',
      modeTitles: {
        web: ['Context home', 'Cue focus', 'Intent saved'],
        ios: ['无感首页', '上下文 sheet', '轻触确认'],
        mac: ['环境工作台', '指令浮现', '意图验收'],
        android: ['Ambient surface', 'Cue state', 'Intent ready'],
        mini: ['无感导航', '服务浮现', '轻量收起'],
      },
      prdBridge: 'PRD 会写出何时隐藏、何时浮现、何时降级为显式按钮。',
    },
    'data-ink': {
      ...base,
      kind: 'data',
      label: 'DATA INK',
      badge: 'TUFTE',
      kicker: 'metric first',
      title: 'Signal Ledger',
      caption: 'Every line, label and interaction must earn its ink through measurable information value.',
      action: ['Filter signal', 'Mark anomaly', 'Export chart'],
      secondaryAction: ['Compare', 'Audit axis', 'Download CSV'],
      rows: ['Metric rail', 'Evidence table', 'Sparse action'],
      field: '把数据墨水比、指标轨、表格焦点和审计状态落到真实界面。',
      modeTitles: {
        web: ['Metric home', 'Axis focus', 'Chart exported'],
        ios: ['指标首页', '筛选 sheet', '数据确认'],
        mac: ['数据终端', '维度精修', '审计验收'],
        android: ['Data surface', 'Filter state', 'Signal ready'],
        mini: ['指标导航', '轻量筛选', '结果卡片'],
      },
      prdBridge: '工作流会把指标、轴线、证据表和空态数据解释写入产物模板。',
    },
    'emotion-adaptive': {
      ...base,
      kind: 'aura',
      label: 'EMOTION ADAPT',
      badge: 'MOOD',
      kicker: 'mood responsive',
      title: 'Mood Surface',
      caption: 'Color temperature, pacing and feedback adapt to the user mood without losing clarity.',
      action: ['Calm down', 'Warm tone', 'Save mood'],
      secondaryAction: ['Read signal', 'Tune tempo', 'Export note'],
      rows: ['Mood rail', 'Temperature card', 'Adaptive CTA'],
      field: '把情绪识别、色温、节奏和反馈状态落到真实组件。',
      modeTitles: {
        web: ['Mood home', 'Tone focus', 'Mood saved'],
        ios: ['情绪首页', '色温 sheet', '触感安定'],
        mac: ['情绪工作台', '节奏精修', '反馈验收'],
        android: ['Mood surface', 'Tone state', 'Calm ready'],
        mini: ['情绪导航', '轻量色温', '安定反馈'],
      },
      prdBridge: '定时和群策会复用情绪状态、色温调节和反馈验收规则。',
    },
    'agentic-os': {
      ...base,
      kind: 'agent',
      label: 'AGENTIC OS',
      badge: 'MESH',
      kicker: 'orchestration system',
      title: 'Agent Mesh',
      caption: 'Multiple autonomous agents become visible through queues, handoffs and trustworthy receipts.',
      action: ['Dispatch', 'Re-route', 'Approve ship'],
      secondaryAction: ['Inspect mesh', 'Tune agent', 'Export receipt'],
      rows: ['Planner queue', 'Tool lane', 'Human approval'],
      field: '把多 Agent 编排、队列、交接和人类确认落到真实系统。',
      modeTitles: {
        web: ['Mesh home', 'Agent focus', 'Run approved'],
        ios: ['编排首页', '任务 sheet', '确认交付'],
        mac: ['Agent OS', '队列精修', '收据验收'],
        android: ['Mesh surface', 'Agent state', 'Run ready'],
        mini: ['任务导航', '轻量派发', '结果回执'],
      },
      prdBridge: 'OpenBasaka 自进化会继承 Agent 编排字段、失败恢复和人工确认。',
    },
    'wabi-sabi': {
      ...base,
      kind: 'zen',
      label: 'WABI SABI',
      badge: 'ZEN',
      kicker: 'weathered calm',
      title: 'Quiet Atelier',
      caption: 'Natural paper, asymmetric breathing space and restrained controls for imperfect calm.',
      action: ['Begin ritual', 'Adjust grain', 'Keep note'],
      secondaryAction: ['View room', 'Tune texture', 'Archive silence'],
      rows: ['Paper nav', 'Weathered card', 'Tea-state CTA'],
      field: '把纸感、自然衰变、不对称留白和克制状态落到真实页面。',
      modeTitles: {
        web: ['静室首页', '纹理聚焦', '安静归档'],
        ios: ['侘寂首页', '留白 sheet', '轻触保存'],
        mac: ['静修工作台', '纹理精修', '留白验收'],
        android: ['Quiet surface', 'Grain state', 'Ritual ready'],
        mini: ['静室导航', '轻量纹理', '安静反馈'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版要用自然纸感和低对比留白组织真实组件，不做浅灰模板。',
      },
      prdBridge: 'PRD 会写明纸感、留白、低对比和不完美纹理如何用于组件状态。',
    },
    chromium: {
      ...base,
      kind: 'metal',
      label: 'CHROMIUM LIQUID',
      badge: 'METAL',
      kicker: 'mirror interface',
      title: 'Chrome Studio',
      caption: 'Polished graphite panels, mirror highlights and liquid metal controls with sharp feedback.',
      action: ['Polish', 'Reflect state', 'Cast chrome'],
      secondaryAction: ['Sweep light', 'Inspect sheen', 'Export metal'],
      rows: ['Mirror nav', 'Chrome CTA', 'Liquid panel'],
      pages: ['Chrome', 'Studio', 'Signal'],
      miniPages: ['铬面', '工坊', '信号'],
      macPages: ['Mirror', 'Surface', 'Inspector'],
      field: '把镜面银、高光条、深石墨面板和液态金属按钮落到真实组件。',
      inputAction: '镀铬',
      states: [
        { label: '空态', copy: '镜面待点亮', detail: '空状态用深场、银色边缘和一条可操作的高光 CTA。' },
        { label: '加载态', copy: '光带正在扫过', detail: '加载态应像金属高光扫过表面，而不是通用骨架条。' },
        { label: '成功态', copy: '铬面已锁定', detail: '成功态用冷银反射、红色信号点和清晰确认状态表达。' },
      ],
      metrics: [
        [{ label: 'Sheen', value: '92%' }, { label: 'State', value: 'Ready' }],
        [{ label: 'Reflect', value: '97%' }, { label: 'State', value: 'Live' }],
        [{ label: 'Polish', value: '99%' }, { label: 'State', value: 'Cast' }],
      ],
      deviceKicker: {
        web: 'Mirror Web',
        ios: 'Metallic SwiftUI',
        mac: 'Chrome Inspector',
        android: 'Graphite M3',
        mini: 'Mini Chrome',
      },
      modeTitles: {
        web: ['Chrome landing', 'Reflective form', 'Metal signal'],
        ios: ['镜面首页', '金属 sheet', '触感镀铬'],
        mac: ['铬金工作台', '高光精修', '反射验收'],
        android: ['Graphite surface', 'Chrome state', 'Signal ready'],
        mini: ['铬面导航', '轻量镜面', '信号面板'],
      },
      platformTone: {
        web: 'Web 版必须让导航、输入、按钮和状态都共享深石墨、镜面银和高光扫掠。',
        ios: 'iOS 版用圆角金属 sheet、清晰触感和冷银焦点，避免网页式重滤镜。',
        mac: 'macOS 版用铬金工具栏、侧边栏反射层和检查器高光表达桌面质感。',
        android: 'Android 版保留 Material 结构，但动态色要收敛到石墨、银和红色信号。',
        mini: '小程序版把复杂反射降级为银色边框、深场卡片和轻量高光条。',
      },
      prdBridge: '工作流/PRD 会继承深石墨场、镜面银、高光扫掠、红色信号和降级规则。',
    },
    kinetic: {
      ...base,
      kind: 'kinetic',
      label: 'KINETIC TYPE',
      badge: 'MOVE',
      kicker: 'variable type',
      title: 'Type Engine',
      caption: 'Typography becomes the interface through scale shifts, rhythm, focus and kinetic state.',
      action: ['Move type', 'Stretch focus', 'Lock rhythm'],
      secondaryAction: ['Change tempo', 'Inspect weight', 'Export motion'],
      rows: ['Variable nav', 'Type CTA', 'Rhythm state'],
      field: '把大字级差、可变字重、动势和焦点态落到真实组件。',
      modeTitles: {
        web: ['Type home', 'Weight focus', 'Rhythm shipped'],
        ios: ['排印首页', '字体 sheet', '节奏确认'],
        mac: ['排印工作台', '字重精修', '动效验收'],
        android: ['Type surface', 'Motion state', 'Ready rhythm'],
        mini: ['排印导航', '轻量动势', '节奏反馈'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版必须让文字成为导航、按钮和状态的主体，而不是蓝字粉框模板。',
      },
      prdBridge: 'PRD 会写出字体级差、动势、状态切换和可访问降级。',
    },
    holographic: {
      ...base,
      kind: 'hologram',
      label: 'HOLOGRAPHIC FOIL',
      badge: 'FOIL',
      kicker: 'spectrum surface',
      title: 'Foil Studio',
      caption: 'Iridescent foil, spectral edges and refracted focus states become the working interface.',
      action: ['Tilt foil', 'Catch light', 'Lock prism'],
      secondaryAction: ['Shift spectrum', 'Inspect grain', 'Export foil'],
      rows: ['Iridescent nav', 'Foil card', 'Spectrum CTA'],
      field: '把镭射谱面、光谱边缘、噪点和折射焦点落到真实组件。',
      states: [
        { label: '空态', copy: '光谱待入射', detail: '用低噪声彩虹边缘和明确的第一步动作，不做普通渐变空框。' },
        { label: '加载态', copy: '镭射层正在偏转', detail: '加载应像光谱扫过薄膜，保留可读文字和焦点。' },
        { label: '成功态', copy: '箔面已对齐', detail: '成功反馈用短暂彩谱闪烁和稳定高光边界表达。' },
      ],
      modeTitles: {
        web: ['Foil landing', 'Spectrum focus', 'Prism locked'],
        ios: ['镭射首页', '光谱 sheet', '触感锁定'],
        mac: ['箔面工作台', '谱面精修', '折射验收'],
        android: ['Foil surface', 'Spectrum state', 'Prism ready'],
        mini: ['镭射导航', '轻量光谱', '静态箔面'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版要把彩谱边、薄膜高光和可读层级同时落到导航、按钮和卡片。',
        ios: 'iOS 版用轻薄 sheet、彩谱描边和短触感表达镭射折射，不做厚重玻璃。',
        mac: 'macOS 版用谱面工具栏、检查器和细边框承接创意软件气质。',
        android: 'Android 版保留 M3 骨架，但动态色收敛到彩谱边界和可读容器。',
        mini: '小程序版把复杂光谱降级为静态箔面纹理、清晰按钮和少量闪烁状态。',
      },
      prdBridge: '工作流会继承彩谱边、光照角度、折射噪点和静态降级规则。',
    },
    dither: {
      ...base,
      kind: 'dither',
      label: '1-BIT DITHER',
      badge: 'BIT',
      kicker: 'Atkinson matrix',
      title: 'Dither Console',
      caption: 'A black-and-white low-fidelity product surface with hard pixels, no soft SaaS polish.',
      action: ['RUN', 'SCAN', 'WRITE'],
      secondaryAction: ['Invert', 'Step frame', 'Dump log'],
      rows: ['Atkinson grid', '1-bit card', 'Hard output'],
      pages: ['BOOT', 'TOOLS', 'LOG'],
      miniPages: ['启动', '工具', '日志'],
      macPages: ['Bitmap', 'Console', 'Inspector'],
      field: '1-bit 组件状态：黑白、硬边、网点抖动、键盘优先。',
      inputAction: 'RUN',
      states: [
        { label: '空态', copy: '空白位图等待写入', detail: '空态必须是黑白硬边提示和一个明确命令，不使用彩色 SaaS 卡片。' },
        { label: '加载态', copy: 'Atkinson 抖动生成中', detail: '加载态用逐行扫描、像素点阵和命令行回显表达。' },
        { label: '成功态', copy: '位图输出完成', detail: '成功态用硬边反白、OK 输出和短促状态灯确认。' },
      ],
      metrics: [
        [{ label: 'BIT', value: '1' }, { label: 'MODE', value: 'B/W' }],
        [{ label: 'SCAN', value: '72%' }, { label: 'MODE', value: 'LIVE' }],
        [{ label: 'WRITE', value: 'OK' }, { label: 'MODE', value: 'DONE' }],
      ],
      deviceKicker: {
        web: '1-bit Web',
        ios: 'Bitmap SwiftUI',
        mac: 'Dither Workbench',
        android: 'Bitmap M3',
        mini: 'Mini Bitmap',
      },
      modeTitles: {
        web: ['Boot page', 'Scan focus', 'Bitmap written'],
        ios: ['位图首页', '扫描 sheet', '触感输出'],
        mac: ['抖动工作台', '像素精修', '输出验收'],
        android: ['Bitmap surface', 'Scan state', 'Write ready'],
        mini: ['硬边导航', '轻量扫描', '输出反馈'],
      },
      platformTone: {
        web: 'Web 版必须让浏览器框、导航、输入、卡片、空态和按钮都使用 1-bit 黑白、硬边和点阵。',
        ios: 'iOS 版用原生导航和 sheet 重建位图感，触控区域足够大，但视觉仍保持黑白硬边。',
        mac: 'macOS 版使用工具栏、控制台列表、检查器和键盘焦点呈现技术复古工作台。',
        android: 'Android 版保留 Material 结构，但 tonal 容器必须转译为黑白像素容器和硬状态层。',
        mini: '小程序版使用固定导航、胶囊菜单和轻量点阵背景，复杂抖动降级为静态网点。',
      },
      prdBridge: '工作流/PRD 会继承 1-bit token、位图状态、扫描动效和黑白截图验收。',
    },
    ethereal: {
      ...base,
      kind: 'aura',
      label: 'ETHEREAL GLOW',
      badge: 'LIGHT',
      kicker: 'overexposed calm',
      title: 'Halo Room',
      caption: 'Soft overexposure, floating controls and devotional quiet without losing usability.',
      action: ['Open halo', 'Soften', 'Hold light'],
      secondaryAction: ['Dim veil', 'Tune glow', 'Archive calm'],
      rows: ['Halo nav', 'Soft field', 'Quiet CTA'],
      field: '把过曝光晕、轻漂浮、低噪声按钮和安静反馈落到真实组件。',
      modeTitles: {
        web: ['Halo home', 'Glow focus', 'Calm held'],
        ios: ['光晕首页', '柔光 sheet', '轻触确认'],
        mac: ['以太工作台', '光雾精修', '宁静验收'],
        android: ['Glow surface', 'Soft state', 'Halo ready'],
        mini: ['光晕导航', '轻量柔光', '安静反馈'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版要用高亮柔雾、轻漂浮边界和安静动作组织界面，不退回灰白模板。',
      },
      prdBridge: '定时和工作流会复用光晕强度、过曝边界和安静反馈验收。',
    },
    'anthropic-serif': {
      ...base,
      kind: 'editorial',
      label: 'ANTHROPIC SERIF',
      badge: 'READ',
      kicker: 'thinking page',
      title: 'Thinking Room',
      caption: 'Warm paper, humanist serif rhythm and careful controls for deep AI thinking.',
      action: ['Think', 'Refine', 'Send'],
      secondaryAction: ['Open source', 'Compare thought', 'Save note'],
      rows: ['Reading nav', 'Thought card', 'Quiet input'],
      field: '把暖纸底、人文衬线、深阅读节奏和克制输入落到真实组件。',
      states: [
        { label: '空态', copy: '等待一个好问题', detail: '空态像一页可阅读的稿纸，提供清晰入口。' },
        { label: '加载态', copy: '正在整理思路', detail: '加载态用安静的行距、段落骨架和柔和状态说明。' },
        { label: '成功态', copy: '答案已沉淀', detail: '成功态用清晰引文、保存按钮和温暖确认。' },
      ],
      modeTitles: {
        web: ['Reading home', 'Prompt focus', 'Thought saved'],
        ios: ['阅读首页', '提问 sheet', '触感保存'],
        mac: ['思考工作台', '资料精修', '答案验收'],
        android: ['Reading surface', 'Prompt state', 'Thought ready'],
        mini: ['阅读导航', '轻量提问', '答案卡片'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版必须像可深读的知识页，衬线标题、暖纸底和克制按钮贯穿组件。',
      },
      prdBridge: '知识库、群策和 PRD 会继承阅读节奏、引用状态和深思输入规则。',
    },
    'ai-abstract': {
      ...base,
      kind: 'organism',
      label: 'AI ABSTRACT',
      badge: 'LATENT',
      kicker: 'neural field',
      title: 'Latent Engine',
      caption: 'Neural particles, latent waves and interpretable states for an AI core product.',
      action: ['Activate', 'Trace signal', 'Freeze vector'],
      secondaryAction: ['Inspect layer', 'Tune node', 'Export map'],
      rows: ['Latent graph', 'Synapse card', 'Vector state'],
      field: '把神经粒子、潜空间波动、节点状态和可解释动作落到真实界面。',
      modeTitles: {
        web: ['Latent home', 'Node focus', 'Vector saved'],
        ios: ['智构首页', '节点 sheet', '触感锁定'],
        mac: ['潜空间工作台', '网络精修', '状态验收'],
        android: ['Neural surface', 'Node state', 'Vector ready'],
        mini: ['节点导航', '轻量网络', '结果反馈'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版要把抽象神经场落成可操作节点、状态卡和解释面板，而不是随意粒子背景。',
      },
      prdBridge: 'OpenBasaka 自进化会继承潜空间节点、状态反馈和解释路径。',
    },
    'blueprint-cad': {
      ...base,
      kind: 'blueprint',
      label: 'BLUEPRINT CAD',
      badge: 'CAD',
      kicker: 'section A-03',
      title: 'Interface Plan',
      caption: 'ISO-like grids, crosshairs, measurement rails and parameter snapping shape every control.',
      action: ['Measure', 'Snap', 'Approve'],
      secondaryAction: ['Lock layer', 'Inspect axis', 'Export DXF'],
      rows: ['Crosshair nav', 'Dimension card', 'Parameter rail'],
      pages: ['PLAN', 'LAYERS', 'CHECK'],
      macPages: ['Plan', 'Layers', 'Inspector'],
      field: '把十字准星、尺寸线、图层、参数吸附和审计状态落到真实组件。',
      modeTitles: {
        web: ['Plan home', 'Axis focus', 'Layer approved'],
        ios: ['蓝图首页', '参数 sheet', '吸附确认'],
        mac: ['CAD 工作台', '图层精修', '标注验收'],
        android: ['Plan surface', 'Snap state', 'Layer ready'],
        mini: ['图层导航', '轻量标注', '检查反馈'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版必须把网格、测量线、图层和参数吸附变成界面骨架。',
      },
      prdBridge: 'PRD 会继承网格尺度、标注语法、图层状态和参数验收。',
    },
    acid: {
      ...base,
      kind: 'acid',
      label: 'ACID POSTER',
      badge: 'ACID',
      kicker: 'melted command',
      title: 'Club Signal',
      caption: 'Acid color, melted forms and hard nightclub controls with explicit state changes.',
      action: ['Melt', 'Strobe', 'Drop'],
      secondaryAction: ['Invert beat', 'Inspect noise', 'Publish poster'],
      rows: ['Acid nav', 'Melt card', 'Strobe CTA'],
      field: '把酸性色、融化字形、噪声边界和夜场按钮状态落到真实组件。',
      modeTitles: {
        web: ['Acid home', 'Noise focus', 'Signal dropped'],
        ios: ['酸性首页', '节拍 sheet', '触感爆发'],
        mac: ['海报工作台', '噪声精修', '发布验收'],
        android: ['Acid surface', 'Strobe state', 'Drop ready'],
        mini: ['酸性导航', '轻量噪声', '发布反馈'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版要用酸性色、融化结构和硬状态保留先锋气质，同时保证按钮可读。',
      },
      prdBridge: '群策和工作流会继承酸性海报、噪声强度、闪烁降级和可读性验收。',
    },
    pixel: {
      ...base,
      kind: 'dither',
      label: 'PIXEL ART',
      badge: '8BIT',
      kicker: 'tile interface',
      title: 'Pixel Quest',
      caption: '8-bit tiles, stepped typography and arcade feedback rebuilt as a usable product surface.',
      action: ['START', 'LEVEL UP', 'SAVE'],
      secondaryAction: ['Open map', 'Equip state', 'Export sprite'],
      rows: ['Tile nav', 'Sprite card', 'Arcade CTA'],
      pages: ['START', 'MAP', 'BAG'],
      miniPages: ['开始', '地图', '背包'],
      macPages: ['Sprites', 'Map', 'Inspector'],
      field: '把 8-bit 像素块、瓦片网格、街机按钮和状态音效感落到真实组件。',
      modeTitles: {
        web: ['Start screen', 'Tile focus', 'Quest saved'],
        ios: ['像素首页', '背包 sheet', '触感升级'],
        mac: ['像素工作台', '瓦片精修', '关卡验收'],
        android: ['Pixel surface', 'Level state', 'Quest ready'],
        mini: ['像素导航', '轻量地图', '通关反馈'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版保留 8-bit 瓦片、台阶字、硬按钮和可读状态，不混成 1-bit 抖动或普通卡片。',
      },
      prdBridge: '游戏化工作流会继承瓦片尺度、像素按钮、状态升级和 sprite 降级规则。',
    },
    blueprint: {
      ...base,
      kind: 'blueprint',
      label: 'BLUEPRINT',
      badge: 'PLAN',
      kicker: 'architect grid',
      title: 'Build Sheet',
      caption: 'Deep-blue paper, white construction lines and measured annotations drive the UI.',
      action: ['Draft', 'Align', 'Issue'],
      secondaryAction: ['Pin line', 'Check scale', 'Export plan'],
      rows: ['Grid nav', 'Section card', 'Scale marker'],
      field: '把深蓝底、白色施工线、比例尺和标注卡片落到真实组件。',
      modeTitles: {
        web: ['Plan home', 'Scale focus', 'Issue ready'],
        ios: ['图纸首页', '比例 sheet', '触感确认'],
        mac: ['蓝图工作台', '线稿精修', '出图验收'],
        android: ['Plan surface', 'Grid state', 'Issue ready'],
        mini: ['图纸导航', '轻量比例', '出图反馈'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版必须让深蓝纸、施工线、比例尺和标注成为真实组件结构。',
      },
      prdBridge: 'PRD 会继承蓝图网格、比例标注、图纸状态和施工线视觉验收。',
    },
    material: {
      ...base,
      kind: 'material',
      label: 'MATERIAL YOU',
      badge: 'M3',
      kicker: 'dynamic color',
      title: 'Tonal Surface',
      caption: 'Adaptive color containers, large touch targets and clear state layers.',
      action: ['Elevate', 'Ripple', 'Apply'],
      rows: ['Primary container', 'Secondary tonal action', 'State layer'],
    },
    bento: {
      ...base,
      kind: 'bento',
      label: 'BENTO SYSTEM',
      badge: 'IOS',
      kicker: 'modular grid',
      title: 'Dashboard',
      caption: 'A modular product board with stable cards, metrics and selected states.',
      action: ['Pin card', 'Expand', 'Share'],
      rows: ['Today overview', 'Insight card', 'Action tile'],
    },
    glass: {
      ...base,
      kind: 'glass',
      label: 'GLASS STACK',
      badge: 'BLUR',
      kicker: 'depth material',
      title: 'Lens UI',
      caption: 'Translucent panes, refraction borders and layered focus surfaces.',
      action: ['Focus pane', 'Shift depth', 'Lock layer'],
      rows: ['Foreground glass', 'Background signal', 'Focus ring'],
    },
    'liquid-glass': {
      ...base,
      kind: 'glass',
      label: 'LIQUID GLASS',
      badge: 'OPTIC',
      kicker: 'caustic control',
      title: 'Spatial Lens',
      caption: 'Fluid distortion, optical highlights and spatial controls.',
      action: ['Bend light', 'Float', 'Commit'],
      rows: ['Lens toolbar', 'Floating command', 'Depth state'],
    },
    spatial: {
      ...base,
      kind: 'spatial',
      label: 'SPATIAL STACK',
      badge: '4D',
      kicker: 'depth canvas',
      title: 'Workspace',
      caption: 'Layered panels, scene depth and clear focus transitions.',
      action: ['Bring front', 'Dock', 'Complete'],
      rows: ['Scene layer', 'Inspector layer', 'Command layer'],
    },
    minimal: {
      ...base,
      kind: 'minimal',
      label: 'MINIMAL SYSTEM',
      badge: 'LESS',
      kicker: 'silent layout',
      title: 'Quiet Page',
      caption: 'Whitespace, precise typography and one decisive action.',
      action: ['Select', 'Read', 'Finish'],
      rows: ['Primary text', 'Single rule', 'Silent action'],
    },
    'm3-expressive': {
      ...base,
      kind: 'material',
      label: 'M3 EXPRESSIVE',
      badge: 'M3X',
      kicker: 'expressive state layer',
      title: 'Expressive Flow',
      caption: 'Bold shapes, emotional dynamic color and clear pressed states without losing Material structure.',
      action: ['Ripple', 'Morph', 'Commit'],
      secondaryAction: ['Change tone', 'Tune shape', 'Export tokens'],
      rows: ['Expressive FAB', 'Tonal card', 'State layer'],
      field: '把大胆形状、动态色、ripple 和状态层落到真实移动组件。',
      modeTitles: {
        web: ['Expressive home', 'Color focus', 'State committed'],
        ios: ['表现首页', '色彩 sheet', '触感确认'],
        mac: ['M3X 工作台', '形状精修', '状态验收'],
        android: ['Expressive surface', 'Ripple state', 'Material ready'],
        mini: ['表现导航', '轻量动态色', '触控反馈'],
      },
      platformTone: {
        ...base.platformTone,
        android: 'Android 版必须保留 Material 3 结构，同时把情绪化形状、动态色和状态层做成真实控件。',
      },
      prdBridge: '群策/PRD 会继承 M3 Expressive 的形状 token、动态色、状态层和动效降级。',
    },
    'canvas-ai': {
      ...base,
      kind: 'agent',
      label: 'CANVAS AI',
      badge: 'NODE',
      kicker: 'editable agent canvas',
      title: 'Canvas Copilot',
      caption: 'AI output appears as movable blocks, tool nodes, receipts and editable decision paths.',
      action: ['Generate block', 'Link node', 'Approve run'],
      secondaryAction: ['Replay path', 'Inspect tool', 'Export canvas'],
      rows: ['Prompt node', 'Tool receipt', 'Human checkpoint'],
      pages: ['Canvas', 'Runs', 'History'],
      miniPages: ['画布', '运行', '历史'],
      macPages: ['Canvas', 'Agents', 'Inspector'],
      field: '把聊天、生成块、工具调用和人工确认落到可编辑画布。',
      inputAction: '生成节点',
      states: [
        { label: '空态', copy: '等待第一个节点', detail: '空态提供一个明确输入点和可见画布边界，而不是空白聊天框。' },
        { label: '加载态', copy: 'Agent 正在连接工具', detail: '加载态展示节点边、工具调用和可取消状态。' },
        { label: '成功态', copy: '执行链已可回放', detail: '成功态输出可编辑区块、回放按钮和人工确认点。' },
      ],
      metrics: [
        [{ label: 'Nodes', value: '03' }, { label: 'Trace', value: 'Ready' }],
        [{ label: 'Tools', value: '05' }, { label: 'Trace', value: 'Live' }],
        [{ label: 'Blocks', value: '12' }, { label: 'Trace', value: 'Saved' }],
      ],
      deviceKicker: {
        web: 'Agent Canvas',
        ios: 'Block SwiftUI',
        mac: 'Canvas Inspector',
        android: 'Node Surface',
        mini: 'Mini Canvas',
      },
      modeTitles: {
        web: ['Canvas home', 'Node focus', 'Run approved'],
        ios: ['画布首页', '节点 sheet', '触感确认'],
        mac: ['AI 画布', 'Agent 精修', '执行验收'],
        android: ['Node surface', 'Tool state', 'Run ready'],
        mini: ['画布导航', '轻量节点', '结果回放'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版必须把生成内容变成可编辑块、节点和执行链，不只是一列聊天消息。',
      },
      prdBridge: 'PRD/工作流会继承节点、工具回执、人工确认、撤销回放和画布状态。',
    },
    'xai-transparency': {
      ...base,
      kind: 'data',
      label: 'XAI LEDGER',
      badge: 'WHY',
      kicker: 'reasoning ledger',
      title: 'Trust Ledger',
      caption: 'Model reasoning, evidence, confidence and human review become inspectable product surfaces.',
      action: ['Show why', 'Check source', 'Approve'],
      secondaryAction: ['Compare evidence', 'Flag risk', 'Export audit'],
      rows: ['Evidence chain', 'Confidence rail', 'Review gate'],
      pages: ['Answer', 'Evidence', 'Audit'],
      miniPages: ['答案', '证据', '审计'],
      macPages: ['Answer', 'Sources', 'Inspector'],
      field: '把证据链、置信度、模型状态和人工复核落到可审计组件。',
      inputAction: '解释',
      states: [
        { label: '空态', copy: '等待可验证问题', detail: '空态说明需要证据和复核，不诱导用户盲目相信结论。' },
        { label: '加载态', copy: '证据链正在汇总', detail: '加载态显示来源数量、模型状态和可取消路径。' },
        { label: '成功态', copy: '解释已通过复核', detail: '成功态把结论、引用、置信度和复核人放在一起。' },
      ],
      metrics: [
        [{ label: 'Sources', value: '08' }, { label: 'Trust', value: '72%' }],
        [{ label: 'Checks', value: '14' }, { label: 'Trust', value: '86%' }],
        [{ label: 'Review', value: 'OK' }, { label: 'Trust', value: '94%' }],
      ],
      deviceKicker: {
        web: 'Explainable Web',
        ios: 'Review Sheet',
        mac: 'Evidence Inspector',
        android: 'Trust Surface',
        mini: 'Mini Evidence',
      },
      modeTitles: {
        web: ['Answer home', 'Evidence focus', 'Review approved'],
        ios: ['解释首页', '证据 sheet', '复核确认'],
        mac: ['可信工作台', '来源精修', '审计验收'],
        android: ['Trust surface', 'Evidence state', 'Review ready'],
        mini: ['答案导航', '轻量证据', '审计反馈'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版必须把证据、置信度和复核状态放到结论旁边，不能只给答案。',
      },
      prdBridge: '工作流/PRD 会继承证据链、置信度、复核状态、失败解释和截图验收。',
    },
    'multimodal-gesture': {
      ...base,
      kind: 'ambient',
      label: 'MULTIMODAL',
      badge: 'SENSE',
      kicker: 'voice gesture field',
      title: 'Sensor Desk',
      caption: 'Voice, camera, gesture, touch and sensor status become visible, reversible controls.',
      action: ['Listen', 'Track hand', 'Confirm cue'],
      secondaryAction: ['Fallback touch', 'Tune sensor', 'Export cue'],
      rows: ['Voice rail', 'Gesture halo', 'Fallback button'],
      field: '把语音、手势、摄像头、传感器和触控降级落到真实界面。',
      modeTitles: {
        web: ['Sensor home', 'Gesture focus', 'Cue confirmed'],
        ios: ['多模态首页', '手势 sheet', '触感确认'],
        mac: ['传感工作台', '输入精修', '降级验收'],
        android: ['Sensor surface', 'Voice state', 'Cue ready'],
        mini: ['传感导航', '轻量语音', '手动反馈'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版要把不可见输入转成可见状态条、权限反馈和手动降级按钮。',
      },
      prdBridge: 'PRD 会写明每种输入的可见状态、失败回退、权限边界和无障碍替代。',
    },
    'adaptive-a11y': {
      ...base,
      kind: 'data',
      label: 'ADAPTIVE A11Y',
      badge: 'A11Y',
      kicker: 'access layer',
      title: 'Access Console',
      caption: 'Contrast, density, motion, focus and cognitive load adapt as first-class UI states.',
      action: ['Raise contrast', 'Reduce motion', 'Save profile'],
      secondaryAction: ['Test focus', 'Tune density', 'Export WCAG'],
      rows: ['Focus ring', 'Density switch', 'Motion guard'],
      pages: ['Read', 'Adjust', 'Verify'],
      miniPages: ['阅读', '调节', '验证'],
      macPages: ['Profile', 'Controls', 'Audit'],
      field: '把高对比、低动效、字号/密度和键盘焦点落到真实组件。',
      inputAction: '适配',
      states: [
        { label: '空态', copy: '等待能力画像', detail: '空态提供可跳过的可访问性设置，不强迫用户暴露隐私。' },
        { label: '加载态', copy: '正在降低认知负荷', detail: '加载态用少动效、明确进度和可读文本说明。' },
        { label: '成功态', copy: '适配档案已保存', detail: '成功态显示对比、字号、动效和焦点模式。' },
      ],
      metrics: [
        [{ label: 'Contrast', value: 'AAA' }, { label: 'Motion', value: 'Low' }],
        [{ label: 'Focus', value: '100%' }, { label: 'Density', value: 'Calm' }],
        [{ label: 'Audit', value: 'Pass' }, { label: 'Mode', value: 'Saved' }],
      ],
      modeTitles: {
        web: ['Readable home', 'Focus tuning', 'Profile saved'],
        ios: ['可读首页', '辅助 sheet', '触感确认'],
        mac: ['无障碍台', '焦点精修', '验收通过'],
        android: ['Access surface', 'Density state', 'Ready profile'],
        mini: ['可读导航', '轻量调节', '保存反馈'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版必须把键盘焦点、对比、字号、低动效和密度控制显性化。',
      },
      prdBridge: '工作流会继承可访问性档案、焦点顺序、对比验收和动效降级。',
    },
    'micro-sonic': {
      ...base,
      kind: 'aura',
      label: 'MICRO SONIC',
      badge: 'SND',
      kicker: 'sonic feedback',
      title: 'Pulse Mixer',
      caption: 'Tiny sounds, haptics and visual waveforms make state changes feel precise even in silent mode.',
      action: ['Tap tone', 'Tune pulse', 'Mute safe'],
      secondaryAction: ['Preview haptic', 'Shift beat', 'Export cue'],
      rows: ['Waveform nav', 'Haptic card', 'Silent backup'],
      field: '把短音色、触感节奏、波形反馈和静音降级落到真实状态。',
      modeTitles: {
        web: ['Sound home', 'Pulse focus', 'Silent saved'],
        ios: ['音色首页', '触感 sheet', '静音确认'],
        mac: ['声音工作台', '节奏精修', '降级验收'],
        android: ['Sonic surface', 'Haptic state', 'Mute ready'],
        mini: ['音色导航', '轻量波形', '静音反馈'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版要用可见波形和状态文案承接声音反馈，静音时仍然完整可用。',
      },
      prdBridge: 'PRD 会继承声音/触感 token、静音降级、波形反馈和状态验收。',
    },
    'barely-there': {
      ...base,
      kind: 'minimal',
      label: 'BARELY THERE',
      badge: 'QUIET',
      kicker: 'almost invisible',
      title: 'Quiet Layer',
      caption: 'The interface recedes until context asks for controls, keeping content and intent in front.',
      action: ['Reveal control', 'Pin context', 'Fade away'],
      secondaryAction: ['Inspect cue', 'Tune quiet', 'Export layer'],
      rows: ['Context hint', 'Thin divider', 'Floating affordance'],
      field: '把极少控制、上下文浮现和高信噪比内容落到真实页面。',
      modeTitles: {
        web: ['Quiet home', 'Control reveal', 'Context pinned'],
        ios: ['隐形首页', '浮现 sheet', '轻触保存'],
        mac: ['安静工作台', '上下文精修', '克制验收'],
        android: ['Quiet surface', 'Hint state', 'Layer ready'],
        mini: ['极简导航', '轻量浮现', '保存反馈'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版要让控件按上下文浮现，默认只保留内容、轻边界和明确焦点。',
      },
      prdBridge: '工作流会继承上下文提示、极简控件、浮现时机和可发现性验收。',
    },
    'human-touch-ai': {
      ...base,
      kind: 'doodle',
      label: 'HUMAN TOUCH',
      badge: 'HAND',
      kicker: 'revision marks',
      title: 'Annotated Draft',
      caption: 'Handwritten corrections, paper grain and visible revision marks push back against AI sameness.',
      action: ['Annotate', 'Revise', 'Keep mark'],
      secondaryAction: ['Circle issue', 'Compare draft', 'Export note'],
      rows: ['Hand note', 'Revision rail', 'Paper CTA'],
      field: '把手写标注、人工修订、纸感和不完全对齐落到真实组件。',
      modeTitles: {
        web: ['Draft home', 'Revision focus', 'Mark kept'],
        ios: ['手稿首页', '标注 sheet', '触感保存'],
        mac: ['修订工作台', '批注精修', '人工验收'],
        android: ['Draft surface', 'Mark state', 'Note ready'],
        mini: ['手稿导航', '轻量批注', '保存反馈'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版要保留人手痕迹和修订层，但按钮、输入和焦点仍需清晰可用。',
      },
      prdBridge: 'PRD 会继承手写批注、修订痕迹、人工确认和反模板审美验收。',
    },
    'soft-maximalism': {
      ...base,
      kind: 'floral',
      label: 'SOFT MAX',
      badge: 'LUSH',
      kicker: 'controlled abundance',
      title: 'Layer Garden',
      caption: 'Abundant color and content are organized through soft containers, rhythm and hierarchy.',
      action: ['Layer', 'Highlight', 'Celebrate'],
      secondaryAction: ['Trim noise', 'Tune rhythm', 'Export set'],
      rows: ['Dense hero', 'Soft container', 'Rhythm rail'],
      field: '把繁复图层、饱和色和清晰层级落到真实页面。',
      modeTitles: {
        web: ['Layer home', 'Density focus', 'Abundance shipped'],
        ios: ['繁复首页', '图层 sheet', '触感确认'],
        mac: ['繁复工作台', '层级精修', '噪声验收'],
        android: ['Lush surface', 'Layer state', 'Ready set'],
        mini: ['图层导航', '轻量繁复', '反馈面板'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版可以繁复，但必须用层级、节奏和容器边界控制阅读路径。',
      },
      prdBridge: '群策会继承图层密度、色彩节奏、噪声上限和响应式降级。',
    },
    'intent-friction': {
      ...base,
      kind: 'brutal',
      label: 'FRICTION GATE',
      badge: 'WAIT',
      kicker: 'risk brake',
      title: 'Decision Gate',
      caption: 'High-risk actions slow down through evidence pauses, visible confirmation and reversible states.',
      action: ['Hold action', 'Review risk', 'Confirm'],
      secondaryAction: ['Show impact', 'Undo path', 'Export receipt'],
      rows: ['Risk banner', 'Slow button', 'Undo receipt'],
      pages: ['Risk', 'Review', 'Confirm'],
      miniPages: ['风险', '复核', '确认'],
      macPages: ['Risk', 'Review', 'Receipt'],
      field: '把证据停顿、二次确认、慢按钮、撤销路径和危险态落到真实组件。',
      inputAction: '复核',
      states: [
        { label: '空态', copy: '等待风险上下文', detail: '空态要求用户先看到影响范围，再允许继续。' },
        { label: '加载态', copy: '阻尼计时进行中', detail: '加载态展示倒计时、影响项和取消按钮。' },
        { label: '成功态', copy: '已确认且可撤销', detail: '成功态输出收据、撤销时限和审计记录。' },
      ],
      metrics: [
        [{ label: 'Risk', value: 'P0' }, { label: 'Hold', value: '03s' }],
        [{ label: 'Checks', value: '07' }, { label: 'Undo', value: 'On' }],
        [{ label: 'Receipt', value: 'OK' }, { label: 'Audit', value: 'Saved' }],
      ],
      modeTitles: {
        web: ['Risk home', 'Review pause', 'Receipt saved'],
        ios: ['风险首页', '确认 sheet', '撤销确认'],
        mac: ['阻尼工作台', '影响精修', '收据验收'],
        android: ['Risk surface', 'Hold state', 'Receipt ready'],
        mini: ['风险导航', '轻量复核', '确认反馈'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版必须让危险操作有可见阻尼、影响解释、确认按钮和撤销路径。',
      },
      prdBridge: '工作流会继承风险等级、阻尼时长、确认语义、撤销路径和审计收据。',
    },
    'spaceship-manual': {
      ...base,
      kind: 'industrial',
      label: 'SHIP MANUAL',
      badge: 'OPS',
      kicker: 'flight manual',
      title: 'Flight Deck',
      caption: 'Instrument panels, warning strips and manual-like annotations make complex control readable.',
      action: ['Calibrate', 'Arm system', 'Launch'],
      secondaryAction: ['Check gauge', 'Inspect bay', 'Export manual'],
      rows: ['Gauge cluster', 'Warning strip', 'Manual note'],
      pages: ['OPS', 'SYSTEMS', 'LOG'],
      miniPages: ['操作', '系统', '日志'],
      macPages: ['Flight', 'Systems', 'Inspector'],
      field: '把仪表、警示条、技术手册、参数表和命令面板落到真实组件。',
      inputAction: '校准',
      modeTitles: {
        web: ['Flight home', 'Gauge focus', 'System armed'],
        ios: ['飞船首页', '仪表 sheet', '触感发射'],
        mac: ['飞行工作台', '系统精修', '手册验收'],
        android: ['Flight surface', 'Gauge state', 'Launch ready'],
        mini: ['仪表导航', '轻量警示', '日志反馈'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版要把太空手册、仪表、参数和警示状态变成可读控制台。',
      },
      prdBridge: 'PRD 会继承仪表组、警示语义、参数面板、手册式注释和降级规则。',
    },
    'local-first-ledger': {
      ...base,
      kind: 'data',
      label: 'LOCAL LEDGER',
      badge: 'LOCK',
      kicker: 'offline trust',
      title: 'Private Ledger',
      caption: 'Local storage, sync conflicts, privacy boundaries and audit trails become visible trust layers.',
      action: ['Save local', 'Resolve sync', 'Lock audit'],
      secondaryAction: ['View boundary', 'Merge conflict', 'Export log'],
      rows: ['Local vault', 'Sync state', 'Audit trail'],
      pages: ['Vault', 'Sync', 'Audit'],
      miniPages: ['本地', '同步', '审计'],
      macPages: ['Vault', 'Conflicts', 'Inspector'],
      field: '把本地存储、离线状态、同步冲突、隐私边界和审计日志落到真实界面。',
      inputAction: '写入本地',
      states: [
        { label: '空态', copy: '本地库等待建立', detail: '空态说明数据边界、设备位置和是否同步。' },
        { label: '加载态', copy: '同步冲突正在比对', detail: '加载态展示冲突双方、时间戳和可撤销合并。' },
        { label: '成功态', copy: '审计日志已封存', detail: '成功态输出本地路径、同步状态和日志摘要。' },
      ],
      metrics: [
        [{ label: 'Local', value: 'On' }, { label: 'Sync', value: 'Idle' }],
        [{ label: 'Conflicts', value: '02' }, { label: 'Sync', value: 'Review' }],
        [{ label: 'Audit', value: 'Sealed' }, { label: 'Privacy', value: 'Local' }],
      ],
      modeTitles: {
        web: ['Vault home', 'Conflict focus', 'Audit sealed'],
        ios: ['本地首页', '同步 sheet', '隐私确认'],
        mac: ['本地账本', '冲突精修', '审计验收'],
        android: ['Vault surface', 'Sync state', 'Audit ready'],
        mini: ['本地导航', '轻量同步', '日志反馈'],
      },
      platformTone: {
        ...base.platformTone,
        web: 'Web 版必须把本地边界、同步冲突、隐私状态和审计日志放到主流程里。',
      },
      prdBridge: 'OpenBasaka 会继承本地优先、隐私边界、同步冲突和审计账本验收。',
    },
    swiss: {
      ...base,
      kind: 'swiss',
      label: 'SWISS GRID',
      badge: '1960',
      kicker: 'strict grid',
      title: 'Editorial Grid',
      caption: 'Asymmetric columns, disciplined labels and high legibility.',
      action: ['Align', 'Measure', 'Publish'],
      rows: ['Column A', 'Column B', 'Baseline rule'],
    },
    natural: {
      ...base,
      kind: 'natural',
      label: 'NATURAL NATIVE',
      badge: 'EARTH',
      kicker: 'slow material',
      title: 'Living Shop',
      caption: 'Earth palette, handmade rhythm and calm commerce states.',
      action: ['Add ritual', 'Reserve', 'Rest'],
      rows: ['Product story', 'Care notes', 'Calm checkout'],
    },
    'skeuo-nature': {
      ...base,
      kind: 'natural',
      label: 'NEO NATURE',
      badge: 'BIO',
      kicker: 'tactile wellness',
      title: 'Living Panel',
      caption: 'Biophilic surfaces, slow controls and material trust.',
      action: ['Breathe', 'Grow', 'Save'],
      rows: ['Wood grain', 'Plant state', 'Rest cue'],
    },
    'skeuo-stone': {
      ...base,
      kind: 'skeuo',
      label: 'STONE TRUST',
      badge: 'VAULT',
      kicker: 'financial weight',
      title: 'Secure Desk',
      caption: 'Heavy surfaces, bevelled controls and high-trust hierarchy.',
      action: ['Authorize', 'Seal', 'Archive'],
      rows: ['Vault card', 'Risk lock', 'Audit trace'],
    },
    risograph: {
      ...base,
      kind: 'print',
      label: 'RISO PRINT',
      badge: 'INK',
      kicker: 'offset system',
      title: 'Poster UI',
      caption: 'Misregistered ink blocks, paper grain and tactile calls to action.',
      action: ['Stamp', 'Print', 'Fold'],
      rows: ['Ink layer', 'Paper edge', 'Edition note'],
    },
    paper: {
      ...base,
      kind: 'paper',
      label: 'PAPERCRAFT',
      badge: 'CUT',
      kicker: 'layered sheet',
      title: 'Paper Board',
      caption: 'Cut edges, stacked sheets and soft real-world shadows.',
      action: ['Fold', 'Layer', 'Send'],
      rows: ['Top sheet', 'Shadow gap', 'Torn note'],
    },
    memphis: {
      ...base,
      kind: 'memphis',
      label: 'MEMPHIS PLAY',
      badge: 'POP',
      kicker: 'geometry rhythm',
      title: 'Play Grid',
      caption: 'Bright primitives, cheerful controls and visible selection.',
      action: ['Bounce', 'Mix', 'Save'],
      rows: ['Circle card', 'Zigzag tab', 'Pop state'],
    },
    neondark: {
      ...base,
      kind: 'neon',
      label: 'NEON DARK',
      badge: 'NITE',
      kicker: 'electric contrast',
      title: 'Night Ops',
      caption: 'Dark field, electric outlines and strong status signaling.',
      action: ['Pulse', 'Boost', 'Launch'],
      rows: ['Signal rail', 'Glitch alert', 'Live command'],
    },
    cyber: {
      ...base,
      kind: 'neon',
      label: 'CYBERPUNK',
      badge: '2077',
      kicker: 'glitch panel',
      title: 'Cyber Deck',
      caption: 'Neon HUD, sharp warnings and high-contrast action states.',
      action: ['Hack', 'Route', 'Escape'],
      rows: ['Threat grid', 'Wallet lock', 'Neon route'],
    },
    dos: {
      ...base,
      kind: 'terminal',
      label: 'DOS SHELL',
      badge: 'CLI',
      kicker: 'command first',
      title: 'Root Console',
      caption: 'Plain text hierarchy, phosphor signal and keyboard-first actions.',
      action: ['RUN', 'EXEC', 'OK'],
      rows: ['> boot ui', '> inspect state', '> write output'],
    },
    win95: {
      ...base,
      kind: 'retro',
      label: 'RETRO OS',
      badge: '95',
      kicker: 'desktop chrome',
      title: 'Control Window',
      caption: 'Bevels, window chrome and visible system controls.',
      action: ['Start', 'Open', 'OK'],
      rows: ['Menu bar', 'Dialog button', 'Status strip'],
    },
    gothic: {
      ...base,
      kind: 'gothic',
      label: 'GOTHIC RELIC',
      badge: 'RUNE',
      kicker: 'ritual interface',
      title: 'Archive',
      caption: 'Dark stone, gilt rules and dramatic interaction rituals.',
      action: ['Invoke', 'Bind', 'Seal'],
      rows: ['Rune tab', 'Gold frame', 'Dark ledger'],
    },
    dreamcore: {
      ...base,
      kind: 'aero',
      label: 'DREAMCORE AERO',
      badge: 'Y2K',
      kicker: 'surreal crystal',
      title: 'Dream Portal',
      caption: 'Soft sky glass, uncanny gradients and floating nostalgic controls.',
      action: ['Enter', 'Float', 'Wake'],
      rows: ['Crystal nav', 'Memory bubble', 'Soft action'],
    },
    '3d-interactive': {
      ...base,
      kind: 'spatial',
      label: 'INTERACTIVE 3D',
      badge: 'XYZ',
      kicker: 'object-first UI',
      title: 'Product Space',
      caption: 'A product surface where cards feel like manipulable objects.',
      action: ['Rotate', 'Inspect', 'Place'],
      rows: ['Object stage', 'Depth picker', 'Gesture state'],
    },
    'aurora-mesh': {
      ...base,
      kind: 'aura',
      label: 'AURORA MESH',
      badge: 'FLOW',
      kicker: 'soft gradient',
      title: 'Payment Flow',
      caption: 'Aurora fields guide attention without boxing the whole page.',
      action: ['Glow', 'Authorize', 'Complete'],
      rows: ['Gradient field', 'Soft CTA', 'Trust copy'],
    },
    aurora: {
      ...base,
      kind: 'aura',
      label: 'AURORA',
      badge: 'BLUR',
      kicker: 'diffuse surface',
      title: 'Brand Page',
      caption: 'Clean cards over atmospheric gradients with restrained controls.',
      action: ['Reveal', 'Compare', 'Join'],
      rows: ['Blur field', 'Feature strip', 'Soft button'],
    },
    'atomic-age': {
      ...base,
      kind: 'atomic',
      label: 'ATOMIC AGE',
      badge: 'GOOGIE',
      kicker: 'optimistic future',
      title: 'Future Desk',
      caption: 'Starbursts, domes and sharp product promises in a playful grid.',
      action: ['Launch', 'Orbit', 'Dock'],
      rows: ['Starburst nav', 'Orbit card', 'Jet CTA'],
    },
    jetsons: {
      ...base,
      kind: 'googie',
      label: 'JETSONS HOME',
      badge: 'AUTO',
      kicker: 'home automation',
      title: 'Smart Dome',
      caption: 'Floating Googie domes, robot chores and cheerful household routines.',
      action: ['Run routine', 'Call bot', 'Hover home'],
      secondaryAction: ['Open chore rail', 'Tune dome', 'Inspect family state'],
      rows: ['Dome room', 'Robot chore', 'Family routine'],
      pages: ['Home', 'Chores', 'Orbit'],
      miniPages: ['家', '管家', '例程'],
      macPages: ['Dome Desk', 'Robot Queue', 'Routine Log'],
      field: '把圆顶家居、机器人管家和自动化例程做成真实家庭控制台。',
      inputAction: '排程',
      states: [
        { label: '空态', copy: '等待家庭例程', detail: '空态显示圆顶房间和第一条家务自动化。' },
        { label: '加载态', copy: '机器人正在滑轨送入', detail: '加载态像家电和管家在轻快接力。' },
        { label: '成功态', copy: '未来之家已进入舒适模式', detail: '成功态保留家庭状态，不回到星爆海报。' },
      ],
      metrics: [
        [{ label: 'Dome', value: '04' }, { label: 'Bots', value: 'ON' }],
        [{ label: 'Routine', value: '7am' }, { label: 'Lift', value: 'Ready' }],
        [{ label: 'Family', value: 'Calm' }, { label: 'Chores', value: 'Done' }],
      ],
      modeTitles: {
        web: ['Dome home', 'Robot chore', 'Family routine'],
        ios: ['圆顶首页', '管家 sheet', '例程完成'],
        mac: ['未来家居台', '家务队列', '例程日志'],
        android: ['Googie home', 'Robot state', 'Routine ready'],
        mini: ['家居导航', '管家任务', '例程反馈'],
      },
      platformTone: {
        web: 'Web 版是未来家居控制台：圆顶房间为主舞台，自动化例程、机器人管家、家庭成员状态分区展示。',
        ios: 'iOS 版用 TabView 区分 Home/Robot/Routine，Sheet 承接单个家务自动化，触感反馈要轻快。',
        mac: 'macOS 版用 Sidebar 管理房间和机器人任务，Inspector 展示例程参数，不能只是海报式落地页。',
        android: 'Android 版把 Material 组件改造成圆顶卡片、机器人 FAB 和家庭例程状态，保留 ripple 但不丢 Googie 形态。',
        mini: '小程序版保留固定顶部和可见返回，把圆顶、管家和例程降级为轻 Canvas/色块，不使用复杂星爆海报。',
      },
      prdBridge: 'Jetsons 会把 Googie 家居自动化、机器人任务和家庭例程写入 PRD/工作流/群策验收。',
    },
    'solarpunk-utopia': {
      ...base,
      kind: 'solarpunk',
      label: 'SOLARPUNK',
      badge: 'SUN',
      kicker: 'community system',
      title: 'Living Grid',
      caption: 'Warm craft, green infrastructure and civic action states.',
      action: ['Plant', 'Share', 'Sustain'],
      rows: ['Solar rail', 'Garden card', 'Civic CTA'],
    },
    solar: {
      ...base,
      kind: 'solarpunk',
      label: 'SOLARPUNK',
      badge: 'ECO',
      kicker: 'sustainable brand',
      title: 'Green Plan',
      caption: 'Cream surfaces, green accents and new-art curved controls.',
      action: ['Grow', 'Track', 'Save'],
      rows: ['Energy state', 'Impact card', 'Community note'],
    },
    'brutal-bw': {
      ...base,
      kind: 'brutal',
      label: 'DYSTOPIAN',
      badge: 'B/W',
      kicker: 'raw truth',
      title: 'Signal Wall',
      caption: 'Black-white information blocks with zero decorative escape.',
      action: ['Expose', 'Cut', 'Publish'],
      rows: ['Headline block', 'Evidence rail', 'Hard CTA'],
    },
    'gen-ui': {
      ...base,
      kind: 'agent',
      label: 'GENERATIVE UI',
      badge: 'LIVE',
      kicker: 'intent layout',
      title: 'Adaptive OS',
      caption: 'Layout rearranges around intent, context and accessibility needs.',
      action: ['Adapt', 'Personalize', 'Lock'],
      rows: ['Intent card', 'Generated panel', 'Accessibility state'],
    },
    brutal: {
      ...base,
      kind: 'brutal',
      label: 'NEO BRUTAL',
      badge: 'RAW',
      kicker: 'hard commerce',
      title: 'Bold Store',
      caption: 'Thick borders, bright actions and unmissable state changes.',
      action: ['Punch', 'Press', 'Buy'],
      rows: ['Heavy nav', 'Shadow card', 'Loud button'],
    },
    personal: {
      ...base,
      kind: 'doodle',
      label: 'PERSONAL',
      badge: 'HAND',
      kicker: 'creator mark',
      title: 'Studio Log',
      caption: 'Handmade annotations and creator-specific visual fingerprints.',
      action: ['Sketch', 'Pin', 'Send'],
      rows: ['Signature note', 'Loose card', 'Hand CTA'],
    },
    tactile: {
      ...base,
      kind: 'paper',
      label: 'TACTILE',
      badge: 'FIBER',
      kicker: 'handmade surface',
      title: 'Craft Shop',
      caption: 'Textile grain, cut edges and quiet handmade trust.',
      action: ['Touch', 'Fold', 'Keep'],
      rows: ['Fabric card', 'Thread label', 'Cut edge'],
    },
    digicute: {
      ...base,
      kind: 'cute',
      label: 'DIGITAL CUTE',
      badge: 'KAWA',
      kicker: 'soft collectible',
      title: 'Pet Pocket',
      caption: 'Soft candy surfaces, collectible cards and joyful state cues.',
      action: ['Boop', 'Collect', 'Smile'],
      rows: ['Bubble nav', 'Cute metric', 'Reward state'],
    },
    microind: {
      ...base,
      kind: 'industrial',
      label: 'MICRO IND',
      badge: 'OPS',
      kicker: 'precision hardware',
      title: 'Device Rack',
      caption: 'Tiny machine panels, rails, bolts and exact status language.',
      action: ['Calibrate', 'Lock', 'Deploy'],
      rows: ['Gauge row', 'Bolt card', 'Signal rail'],
    },
    snapshot: {
      ...base,
      kind: 'snapshot',
      label: 'SNAPSHOT',
      badge: 'FILM',
      kicker: 'human moment',
      title: 'Life Feed',
      caption: 'Grainy slices, irregular crops and humane social actions.',
      action: ['Capture', 'Remember', 'Share'],
      rows: ['Photo strip', 'Caption card', 'Moment CTA'],
    },
    blooming: {
      ...base,
      kind: 'floral',
      label: 'BLOOMING',
      badge: 'MAX',
      kicker: 'dense color',
      title: 'Festival Drop',
      caption: 'Abundant petals, saturated layers and celebration states.',
      action: ['Bloom', 'Layer', 'Celebrate'],
      rows: ['Petal rail', 'Offer card', 'Glow state'],
    },
    distorted: {
      ...base,
      kind: 'kinetic',
      label: 'DISTORTED',
      badge: 'CUT',
      kicker: 'slashed layout',
      title: 'Cut Page',
      caption: 'Warped shapes, diagonal cuts and high-energy labels.',
      action: ['Twist', 'Slice', 'Drop'],
      rows: ['Cut nav', 'Warp card', 'Motion CTA'],
    },
    freshretro: {
      ...base,
      kind: 'aero',
      label: 'FRESH RETRO',
      badge: '00S',
      kicker: 'clear nostalgia',
      title: 'Pure Flow',
      caption: 'Rounded Y2K translucency with friendly modern controls.',
      action: ['Refresh', 'Bubble', 'Save'],
      rows: ['Aero tab', 'Clear card', 'Soft metric'],
    },
    cassette: {
      ...base,
      kind: 'retro',
      label: 'CASSETTE FUTURE',
      badge: 'CRT',
      kicker: 'analog tech',
      title: 'Tape Deck',
      caption: 'Scanlines, mono status and mechanical rhythm.',
      action: ['PLAY', 'REC', 'STOP'],
      rows: ['Tape counter', 'Signal scan', 'Deck button'],
    },
    neu: {
      ...base,
      kind: 'skeuo',
      label: 'NEOMORPH',
      badge: 'SOFT',
      kicker: 'soft emboss',
      title: 'Home Control',
      caption: 'Same-color surfaces with soft inner and outer shadows.',
      action: ['Press', 'Dim', 'Hold'],
      rows: ['Emboss card', 'Inset slider', 'Soft toggle'],
    },
    frutiger: {
      ...base,
      kind: 'aero',
      label: 'FRUTIGER AERO',
      badge: 'VISTA',
      kicker: 'water crystal',
      title: 'Eco Vista',
      caption: 'Glossy bubbles, water highlights and fresh nature signals.',
      action: ['Splash', 'Grow', 'Refresh'],
      rows: ['Aqua nav', 'Leaf bubble', 'Glass CTA'],
    },
    clay: {
      ...base,
      kind: 'cute',
      label: 'CLAY',
      badge: '3D',
      kicker: 'inflated object',
      title: 'Toy Market',
      caption: 'Soft inflated cards with tactile shadows and friendly controls.',
      action: ['Squish', 'Lift', 'Collect'],
      rows: ['Clay card', 'Blob nav', 'Soft badge'],
    },
    skeuo: {
      ...base,
      kind: 'skeuo',
      label: 'SKEUO',
      badge: 'REAL',
      kicker: 'material metaphor',
      title: 'Classic Shelf',
      caption: 'Leather, metal, wood and realistic control affordances.',
      action: ['Turn', 'Slide', 'Store'],
      rows: ['Shelf surface', 'Metal button', 'Leather tab'],
    },
    bauhaus: {
      ...base,
      kind: 'memphis',
      label: 'BAUHAUS',
      badge: '1925',
      kicker: 'primary geometry',
      title: 'Form Lab',
      caption: 'Primary shapes, hard alignments and functional poster rhythm.',
      action: ['Compose', 'Balance', 'Show'],
      rows: ['Red square', 'Blue rule', 'Yellow circle'],
    },
    doodle: {
      ...base,
      kind: 'doodle',
      label: 'DOODLE',
      badge: 'PEN',
      kicker: 'sketch interface',
      title: 'Whiteboard',
      caption: 'Hand-drawn outlines, annotations and playful collaboration states.',
      action: ['Draw', 'Circle', 'Share'],
      rows: ['Sketch note', 'Wavy card', 'Pen action'],
    },
    vapor: {
      ...base,
      kind: 'aero',
      label: 'VAPORWAVE',
      badge: '80S',
      kicker: 'retro surreal',
      title: 'Neon Mall',
      caption: 'Pink-purple gradients, marble cues and synthetic nostalgia.',
      action: ['Drift', 'Loop', 'Glow'],
      rows: ['Marble hero', 'Palm grid', 'Synth CTA'],
    },
  }

  const byPattern: Partial<Record<UiVisualTokens['pattern'], StyleRealization>> = {
    dither: byStyle.dither,
    blueprint: byStyle.blueprint,
    hologram: byStyle.holographic,
    editorial: byStyle['anthropic-serif'],
    organism: byStyle['ai-abstract'],
    acid: byStyle.acid,
    aura: byStyle.ethereal,
  }

  if (styleId && byStyle[styleId]) return byStyle[styleId]
  const item = styleId ? UI_STYLE_ITEMS.find((style) => style.id === styleId) : undefined
  if (item) return styleRealizationFromMasterProfile(item, base)
  return byPattern[pattern] || base
}

export function getUiMuseumStyleRealizationForTest(item: Pick<UiStyleItem, 'id' | 'visual'>): StyleRealization {
  return styleSpecificFamily(item.id, item.visual.pattern)
}

function PatternStyleExample({
  visual,
  title,
  eyebrow,
  styleId,
  phase,
}: {
  visual: UiVisualTokens
  title: string
  eyebrow: string
  styleId?: string
  phase: number
}) {
  const scene = patternScene(visual, title, eyebrow, styleId, phase)
  return (
    <div className={`ui-museum-demo ui-museum-pattern-demo ui-museum-pattern-demo--${visual.pattern}`} data-style={styleId}>
      <header>
        <span>{scene.label}</span>
        <b>{scene.badge}</b>
      </header>
      <section>
        <strong>{scene.title}</strong>
        <p>{scene.caption}</p>
      </section>
      <div className="ui-museum-pattern-demo__artifact" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <footer>
        {scene.chips.map((chip) => <span key={chip}>{chip}</span>)}
      </footer>
    </div>
  )
}

function patternScene(visual: UiVisualTokens, title: string, eyebrow: string, styleId?: string, phase = 0) {
  const cleanTitle = title.replace(/^\d+\.\s*/, '').replace(/\(.+?\)/g, '').trim()
  const shortTitle = cleanTitle.replace(/[-/]/g, ' ').split(/\s+/).slice(0, 2).join(' ')
  const byPattern: Partial<Record<UiVisualTokens['pattern'], { label: string; badge: string; caption: string; chips: string[] }>> = {
    aero: { label: 'CRYSTAL SKY', badge: 'Y2K', caption: 'Glossy depth, bubble highlights, nostalgic light.', chips: ['Aqua', 'Lens', 'Dream'] },
    spatial: { label: 'DEPTH STACK', badge: '4D', caption: 'Layered panels float across a dimensional workplane.', chips: ['Focus', 'Space', 'HUD'] },
    organism: { label: 'NEURAL FIELD', badge: 'AI', caption: 'Living nodes, latent waves and responsive intelligence.', chips: ['Node', 'Pulse', 'Trace'] },
    prismatic: { label: 'PRISM LENS', badge: 'REFR', caption: 'Refracted panes and spectral focus create an optical UI.', chips: ['Lens', 'Beam', 'Split'] },
    aura: { label: 'SOFT FIELD', badge: 'AURA', caption: 'Ambient light and quiet state changes shape the interface.', chips: ['Glow', 'Breath', 'Calm'] },
    dither: { label: '1-BIT MATRIX', badge: 'BIT', caption: 'Hard pixels, monochrome controls and explicit output states.', chips: ['Atkinson', 'Scan', 'OK'] },
    blueprint: { label: 'CAD GRID', badge: '1:1', caption: 'Measured lines, crosshairs and parameters become the UI skeleton.', chips: ['Axis', 'Layer', 'Scale'] },
    print: { label: 'INK OFFSET', badge: 'RISO', caption: 'Misregistered color blocks and warm paper grain.', chips: ['Ink', 'Plate', 'Paper'] },
    editorial: { label: 'READING ROOM', badge: 'TYPE', caption: 'Warm paper and humanist reading rhythm support deep thought.', chips: ['Essay', 'Note', 'Source'] },
    glass: { label: 'LIQUID LENS', badge: 'GLASS', caption: 'Soft refraction, caustic borders and translucent depth.', chips: ['Blur', 'Light', 'Layer'] },
    natural: { label: 'EARTHWARE', badge: 'BIO', caption: 'Organic material surfaces with slow living contrast.', chips: ['Leaf', 'Wood', 'Calm'] },
    skeuo: { label: 'MATERIAL LOCK', badge: '3D', caption: 'Stone, leather and metal controls with physical weight.', chips: ['Grain', 'Bevel', 'Trust'] },
    atomic: { label: 'SPACE AGE', badge: 'GOOGIE', caption: 'Optimistic curves, starbursts and future-home controls.', chips: ['Orbit', 'Dome', 'Jet'] },
    googie: { label: 'GOOGIE HOME', badge: 'AUTO', caption: 'Floating domes, robot chores and cheerful household automation.', chips: ['Dome', 'Robot', 'Routine'] },
    solarpunk: { label: 'LIVING GRID', badge: 'SUN', caption: 'Warm craft, green energy and community infrastructure.', chips: ['Solar', 'Garden', 'Civic'] },
    bento: { label: 'MODULE TRAY', badge: 'IOS', caption: 'Clear cards, confident metrics and friendly structure.', chips: ['Grid', 'Stats', 'Cards'] },
    material: { label: 'DYNAMIC COLOR', badge: 'M3', caption: 'Adaptive surfaces, tonal buttons and soft motion.', chips: ['Tone', 'Shape', 'Ripple'] },
    minimal: { label: 'SILENT TYPE', badge: 'MIN', caption: 'Whitespace, restraint and one precise interaction.', chips: ['Space', 'Type', 'Object'] },
    acid: { label: 'MELTED POSTER', badge: 'ACID', caption: 'Noise, chrome glyphs and illegal high contrast.', chips: ['Melt', 'Noise', 'Club'] },
    memphis: { label: 'GEOMETRY PLAY', badge: 'POP', caption: 'Bright primitive shapes with playful visual rhythm.', chips: ['Circle', 'Zig', 'Pop'] },
    cute: { label: 'SOFT TOY', badge: 'CUTE', caption: 'Inflated panels, soft color and collectible charm.', chips: ['Blob', 'Candy', 'Smile'] },
    industrial: { label: 'MACHINE PANEL', badge: 'OPS', caption: 'Bolts, rails and precise status instrumentation.', chips: ['Gauge', 'Rail', 'Bolt'] },
    snapshot: { label: 'PHOTO STRIP', badge: 'LIFE', caption: 'Grainy slices, imperfect framing and human texture.', chips: ['Grain', 'Moment', 'Film'] },
    floral: { label: 'BLOOM FIELD', badge: 'MAX', caption: 'Dense petals, saturated color and layered abundance.', chips: ['Petal', 'Layer', 'Glow'] },
    neon: { label: 'NIGHT SIGNAL', badge: 'NEON', caption: 'Electric outlines, glitch edges and dark velocity.', chips: ['Pulse', 'Grid', 'Glow'] },
    retro: { label: 'TAPE DECK', badge: 'CRT', caption: 'Analog screens, mono signals and mechanical nostalgia.', chips: ['Scan', 'Tape', 'Boot'] },
    terminal: { label: 'ROOT SHELL', badge: 'CLI', caption: 'Command-first interface with green phosphor feedback.', chips: ['Exec', 'Log', 'Root'] },
    doodle: { label: 'SKETCH BOARD', badge: 'DRAW', caption: 'Handmade lines, annotations and playful imperfection.', chips: ['Pen', 'Note', 'Idea'] },
    paper: { label: 'CUT PAPER', badge: 'CRAFT', caption: 'Layered sheets, torn edges and tactile shadows.', chips: ['Fold', 'Tear', 'Layer'] },
    swiss: { label: 'STRICT GRID', badge: '1960', caption: 'Asymmetric editorial order and mathematical spacing.', chips: ['Grid', 'Type', 'Rule'] },
    gothic: { label: 'DARK RELIC', badge: 'RPG', caption: 'Stone, gilt borders and dramatic interface ritual.', chips: ['Rune', 'Gold', 'Night'] },
    fusion: { label: 'FUSION ENGINE', badge: 'AI', caption: 'Parent styles are blended into one live product surface.', chips: ['Blend', 'Tune', 'Preview'] },
  }
  const scene = byPattern[visual.pattern] || {
    label: eyebrow.toUpperCase(),
    badge: styleId?.slice(0, 4).toUpperCase() || 'UI',
    caption: 'A style-specific composition tuned for real product UI.',
    chips: ['Look', 'State', 'Flow'],
  }
  return {
    ...scene,
    badge: phase === 0 ? scene.badge : phase === 1 ? 'LIVE' : 'LOCK',
    chips: phase === 0 ? scene.chips : phase === 1 ? scene.chips.map((chip) => `${chip}+`) : scene.chips.map((chip) => chip.toUpperCase()),
    title: shortTitle || cleanTitle || 'Interface',
  }
}

function GenericStyleExample({
  visual,
  title,
  eyebrow,
  subtitle,
  compact,
}: {
  visual: UiVisualTokens
  title: string
  eyebrow: string
  subtitle?: string
  compact: boolean
}) {
  const copy = previewCopy(visual, title, compact)
  return (
    <div className="ui-museum__preview-shell">
      <div className="ui-museum__sample-chrome">
        <span><i /><i /><i /></span>
        <small>{copy.app}</small>
        <b>{eyebrow}</b>
      </div>
      <div className="ui-museum__sample-main">
        <section className="ui-museum__sample-hero">
          <em>{copy.kicker}</em>
          <strong>{copy.title}</strong>
          <p>{compact ? copy.subtitle : subtitle || copy.subtitle}</p>
          <button>{copy.action}</button>
        </section>
        <aside className="ui-museum__sample-side">
          <article><span>{copy.metricLabel}</span><strong>{copy.metric}</strong></article>
          <article><span>{copy.secondaryLabel}</span><strong>{copy.secondary}</strong></article>
        </aside>
      </div>
      <div className="ui-museum__sample-lower">
        <div className="ui-museum__sample-list">
          {copy.rows.map((row) => <span key={row}>{row}</span>)}
        </div>
        <div className="ui-museum__sample-viz" aria-hidden="true"><i /><i /><i /><i /></div>
      </div>
    </div>
  )
}

function previewCopy(visual: UiVisualTokens, title: string, compact: boolean) {
  const shortTitle = title.replace(/\(.+?\)/g, '').trim().split(/\s+/).slice(0, compact ? 2 : 4).join(' ')
  const base = {
    app: 'Product OS',
    kicker: visual.motif,
    title: shortTitle,
    subtitle: 'A real interface sample, not a poster.',
    action: 'Open',
    metricLabel: 'Signal',
    metric: '98%',
    secondaryLabel: 'State',
    secondary: visual.motion,
    rows: ['Overview', 'Prototype', 'System'],
  }

  if (['terminal', 'dither', 'retro'].includes(visual.pattern)) {
    return {
      ...base,
      app: 'SYS CONSOLE',
      kicker: 'root@museum',
      title: '$ run preview',
      subtitle: 'status: compiled / latency: 12ms',
      action: 'EXEC',
      metricLabel: 'Build',
      metric: 'OK',
      secondaryLabel: 'Queue',
      secondary: '03',
      rows: ['> inspect --style', '> render --sample', '> export --prd'],
    }
  }

  if (visual.pattern === 'blueprint') {
    return {
      ...base,
      app: 'CAD BOARD',
      kicker: 'SECTION A-03',
      title: 'Interface Plan',
      subtitle: 'grid 12 / tolerance 0.02 / scale 1:1',
      action: 'Measure',
      metricLabel: 'Zoom',
      metric: '240%',
      secondaryLabel: 'Layer',
      secondary: 'UI-7',
      rows: ['Header Rail', 'Component Axis', 'Action Zone'],
    }
  }

  if (['data', 'agent', 'industrial'].includes(visual.pattern)) {
    return {
      ...base,
      app: 'OPS DESK',
      kicker: 'live system',
      title: compact ? 'Mission Board' : 'Mission Control Board',
      subtitle: 'agents, signals, jobs and handoffs in one operator surface.',
      action: 'Deploy',
      metricLabel: 'Signal',
      metric: '97%',
      secondaryLabel: 'Jobs',
      secondary: '18',
      rows: ['Input captured', 'Agent running', 'Review gate'],
    }
  }

  if (['editorial', 'minimal', 'swiss', 'zen'].includes(visual.pattern)) {
    return {
      ...base,
      app: 'READING ROOM',
      kicker: 'briefing',
      title: compact ? 'Knowledge Note' : 'Knowledge Brief',
      subtitle: 'Quiet hierarchy, strong reading rhythm and deliberate whitespace.',
      action: 'Read',
      metricLabel: 'Read',
      metric: '12m',
      secondaryLabel: 'Clarity',
      secondary: 'A+',
      rows: ['Context', 'Argument', 'Evidence'],
    }
  }

  if (['natural', 'solarpunk', 'floral', 'paper', 'doodle', 'cute'].includes(visual.pattern)) {
    return {
      ...base,
      app: 'GARDEN STUDIO',
      kicker: 'soft workflow',
      title: compact ? 'Care Plan' : 'Community Care Plan',
      subtitle: 'Warm, tactile controls for habits, rituals and collaborative progress.',
      action: 'Grow',
      metricLabel: 'Energy',
      metric: '82%',
      secondaryLabel: 'Tasks',
      secondary: '06',
      rows: ['Morning loop', 'Shared note', 'Next seed'],
    }
  }

  if (['brutal', 'acid', 'neon', 'metal', 'gothic'].includes(visual.pattern)) {
    return {
      ...base,
      app: 'NIGHT PANEL',
      kicker: 'high contrast',
      title: compact ? 'Drop Zone' : 'Launch Drop Zone',
      subtitle: 'Aggressive hierarchy, obvious actions and a visual stance you cannot ignore.',
      action: 'Launch',
      metricLabel: 'Impact',
      metric: 'MAX',
      secondaryLabel: 'Mode',
      secondary: 'LIVE',
      rows: ['Signal spike', 'Audience lock', 'Release now'],
    }
  }

  if (['glass', 'prismatic', 'spatial', 'hologram', 'aero', 'aura'].includes(visual.pattern)) {
    return {
      ...base,
      app: 'SPATIAL HUD',
      kicker: 'depth layer',
      title: compact ? 'Focus Space' : 'Focus Space Console',
      subtitle: 'Layered glass, soft focus and dimensional panels for immersive work.',
      action: 'Enter',
      metricLabel: 'Depth',
      metric: '4D',
      secondaryLabel: 'Focus',
      secondary: 'ON',
      rows: ['Scene ready', 'Memory layer', 'Assistant live'],
    }
  }

  if (visual.pattern === 'googie') {
    return {
      ...base,
      app: 'DOME HOME',
      kicker: 'family automation',
      title: compact ? 'Smart Dome' : 'Smart Dome Control',
      subtitle: 'Robot chores, floating rooms and future-home routines in one cheerful console.',
      action: 'Run routine',
      metricLabel: 'Bots',
      metric: '04',
      secondaryLabel: 'Home',
      secondary: 'Hover',
      rows: ['Dome room', 'Robot chore', 'Family routine'],
    }
  }

  if (['memphis', 'atomic', 'kinetic'].includes(visual.pattern)) {
    return {
      ...base,
      app: 'POSTER APP',
      kicker: 'motion type',
      title: compact ? 'Campaign' : 'Campaign Builder',
      subtitle: 'Loud structure, geometric rhythm and type-led interaction.',
      action: 'Remix',
      metricLabel: 'Reach',
      metric: '42K',
      secondaryLabel: 'Tempo',
      secondary: 'FAST',
      rows: ['Headline', 'Composition', 'Release'],
    }
  }

  return base
}

function TabsContent({ items }: { items: Array<[string, string]> }) {
  const [active, setActive] = useState(items[0]?.[0] || '')
  return (
    <section className="ui-museum__tabs-content">
      <nav>
        {items.map(([label]) => (
          <button key={label} className={active === label ? 'ui-museum__tab-content--active' : ''} onClick={() => setActive(label)}>
            {label}
          </button>
        ))}
      </nav>
      <p>{items.find(([label]) => label === active)?.[1]}</p>
    </section>
  )
}
