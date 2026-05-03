import { useState, useEffect, useMemo, useCallback } from 'react'
import SidebarNav from '../../components/SidebarNav'
import { getAllProjects, StoredProject, getSetting } from '../../lib/db/store'
import {
  dbGetTaxonomy,
  TaxonomyRow,
  dbGetMemories,
  dbGetDecisions,
  dbGetAllSynapses,
  dbListOperatingEvents,
  type OperatingEventRow,
  SynapseRow,
} from '../../lib/db/repository'
import { ProjectTaxonomy, StructuredAnalysis } from '../../lib/ai/classifier'
import { loadBossState, BossState } from '../../lib/boss/profile'
import { getDefaultConfig, LLMConfig } from '../../lib/ai/provider'
import { HybridIdea } from '../../lib/synapse/innovator'
import { runEvolutionCycle } from '../../lib/skills/evolution'
import { syncBossMemoriesToPalace } from '../../lib/memory/extractor'
import { countPendingArchiveCandidates } from '../../lib/memory/archive-gate'
import NeuronsTab from './tabs/NeuronsTab'
import WarRoomTab from './tabs/WarRoomTab'
import SynapsesTab from './tabs/SynapsesTab'
import BossTab from './tabs/BossTab'
import MemoryTab from './tabs/MemoryTab'
import ControlPanelTab from './tabs/ControlPanelTab'

import SchedulerTab from './tabs/SchedulerTab'
import XiaoBaiTab from './tabs/XiaoBaiTab'
import KnowledgeVaultTab from './tabs/KnowledgeVaultTab'
import WorkflowTab from './tabs/WorkflowTab'
import TeamsTab from './tabs/TeamsTab'
import ProfilingStudioTab from './tabs/ProfilingStudioTab'
import OverviewTab from './tabs/OverviewTab'
import { isSandboxTabId, SANDBOX_NAVIGATE_EVENT, type SandboxTabId } from './navigation'
import { SIDEBAR_ITEMS } from './sidebar'
import './SandboxMap.css'

export interface NeuronData {
  project: StoredProject
  taxonomy?: {
    taxonomy: ProjectTaxonomy
    analysis: StructuredAnalysis
  }
}

type ModuleGuide = {
  title: string
  intent: string
  status: string
  next: string
  cta?: string
  ctaTab?: SandboxTabId
}

function readSandboxTabFromHash(): SandboxTabId | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash || ''
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
  const tab = new URLSearchParams(query).get('tab')
  return tab && isSandboxTabId(tab) ? tab : null
}

function hasUnsupportedSandboxTabHash(): boolean {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash || ''
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
  const tab = new URLSearchParams(query).get('tab')
  return Boolean(tab && !isSandboxTabId(tab))
}

function clearUnsupportedSandboxTabHash() {
  if (!hasUnsupportedSandboxTabHash()) return
  window.history.replaceState(null, '', '#/sandbox')
}

export default function SandboxMap() {
  const [activeTab, setActiveTab] = useState<SandboxTabId>(() => readSandboxTabFromHash() || 'overview')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [neurons, setNeurons] = useState<NeuronData[]>([])
  const [loading, setLoading] = useState(true)
  const [bossState, setBossState] = useState<BossState | null>(null)
  const [bossMemories, setBossMemories] = useState<
    Array<{ category: string; content: string; confidence: number; created_at: string }>
  >([])
  const [bossDecisions, setBossDecisions] = useState<
    Array<{ decision_type: string; reasoning: string; created_at: string }>
  >([])
  const [operatingEvents, setOperatingEvents] = useState<OperatingEventRow[]>([])
  const [pendingArchiveCount, setPendingArchiveCount] = useState(0)
  const [synapses, setSynapses] = useState<SynapseRow[]>([])
  const [synapseScanning, setSynapseScanning] = useState(false)
  const [synapseProgress, setSynapseProgress] = useState('')
  const [hybridIdeas, setHybridIdeas] = useState<HybridIdea[]>([])
  const [selectedSynapse, setSelectedSynapse] = useState<SynapseRow | null>(null)

  const getLLMConfig = useCallback((): LLMConfig => {
    const provider = getSetting('llm_provider', 'deepseek')
    const defaults = getDefaultConfig(provider)
    return {
      provider: provider as LLMConfig['provider'],
      apiKey: getSetting('llm_api_key', ''),
      baseUrl: getSetting('llm_base_url', defaults.baseUrl),
      model: getSetting('llm_model', defaults.model),
    }
  }, [])

  // 加载项目 + 分类数据
  const loadNeurons = useCallback(async () => {
    setLoading(true)
    const projects = await getAllProjects()
    const neuronList: NeuronData[] = []
    for (const p of projects) {
      let taxonomy: NeuronData['taxonomy']
      try {
        const row: TaxonomyRow | undefined = await dbGetTaxonomy(p.id)
        if (row) {
          taxonomy = {
            taxonomy: JSON.parse(row.taxonomy_json || '{}'),
            analysis: JSON.parse(row.analysis_json || '{}'),
          }
        }
      } catch {
        /* ignore */
      }
      neuronList.push({ project: p, taxonomy })
    }
    setNeurons(neuronList)
    if (neuronList.length > 0 && !selectedId) {
      setSelectedId(neuronList[0].project.id)
    }
    // 也加载突触数据
    const syn = await dbGetAllSynapses()
    setSynapses(syn)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadNeurons()
    // 启动时触发进化扫描 + Boss 记忆同步（MemPalace + Hermes）
    runEvolutionCycle().catch(() => {})
    syncBossMemoriesToPalace().catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 加载 Boss 数据
  const loadBoss = useCallback(async () => {
    const state = await loadBossState()
    setBossState(state)
    const memories = (await dbGetMemories(undefined, 30)) as Array<{
      category: string
      content: string
      confidence: number
      created_at: string
    }>
    setBossMemories(memories)
    const decisions = (await dbGetDecisions()) as Array<{
      decision_type: string
      reasoning: string
      created_at: string
    }>
    setBossDecisions(decisions.slice(0, 20))
    setOperatingEvents(await dbListOperatingEvents(12))
    setPendingArchiveCount(await countPendingArchiveCandidates('all'))
  }, [])

  useEffect(() => {
    if (activeTab !== 'boss' && activeTab !== 'overview') return
    loadBoss()
  }, [activeTab, loadBoss])

  useEffect(() => {
    function handleNavigate(event: Event) {
      const customEvent = event as CustomEvent<{ tab?: SandboxTabId }>
      const nextTab = customEvent.detail?.tab
      if (nextTab) setActiveTab(nextTab)
    }

    window.addEventListener(SANDBOX_NAVIGATE_EVENT, handleNavigate)
    return () => window.removeEventListener(SANDBOX_NAVIGATE_EVENT, handleNavigate)
  }, [])

  useEffect(() => {
    clearUnsupportedSandboxTabHash()

    function handleHashChange() {
      const unsupportedTab = hasUnsupportedSandboxTabHash()
      if (unsupportedTab) clearUnsupportedSandboxTabHash()
      const tab = readSandboxTabFromHash()
      if (tab) setActiveTab(tab)
      else if (unsupportedTab) setActiveTab('overview')
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // Sidebar badges
  const sidebarItems = useMemo(() => {
    return SIDEBAR_ITEMS.map((item) => {
      if (item.id === 'neurons' && neurons.length > 0) {
        return { ...item, badge: neurons.length }
      }
      if (item.id === 'synapses' && synapses.length > 0) {
        return { ...item, badge: synapses.length }
      }
      return item
    })
  }, [neurons.length, synapses.length])

  const activeModuleGuide = useMemo<ModuleGuide>(() => {
    const projectCount = neurons.length
    const synapseCount = synapses.length
    const archiveText = pendingArchiveCount > 0 ? `，${pendingArchiveCount} 条待归档` : ''

    const guides: Record<SandboxTabId, ModuleGuide> = {
      overview: {
        title: '总控',
        intent: '看今天整个系统最重要的状态。',
        status: `${projectCount} 个项目，${synapseCount} 条连接${archiveText}`,
        next: '先看总览信号，再进入最需要处理的模块。',
      },
      neurons: {
        title: '神经元',
        intent: '管理你的项目、想法、任务和正在生长的作品。',
        status: projectCount > 0 ? `${projectCount} 个项目正在系统里` : '还没有可推进的项目',
        next: projectCount > 0 ? '选中一个项目，检查优先级、状态和下一步。' : '先创建或导入一个项目。',
      },
      warroom: {
        title: '推演室',
        intent: '把一个复杂问题推演成清晰判断和行动路线。',
        status: '适合做项目复盘、策略判断、风险拆解。',
        next: '带着一个具体问题进入推演，不要只让它泛泛聊天。',
      },
      profiling: {
        title: '画像工坊',
        intent: '让系统理解你这个 Boss 的偏好、能力、风险和方向。',
        status: bossState ? 'Boss 画像已连接' : 'Boss 画像还需要补充',
        next: bossState ? '把画像结果用于知识、群策和项目推进。' : '先完成一轮画像测试。',
        cta: bossState ? '查看 Boss' : '去画像',
        ctaTab: bossState ? 'boss' : 'profiling',
      },
      synapses: {
        title: '突触',
        intent: '发现项目之间、知识之间、行动之间的隐藏连接。',
        status: synapseCount > 0 ? `${synapseCount} 条连接已发现` : '还没有稳定连接',
        next: synapseCount > 0 ? '挑一条连接，看它能不能变成项目机会。' : '先让系统扫描项目之间的关系。',
      },
      boss: {
        title: 'Boss',
        intent: '保存系统对你的理解，让所有 agent 更懂你。',
        status: `${bossMemories.length} 条近期记忆，${bossDecisions.length} 条决策痕迹`,
        next: pendingArchiveCount > 0 ? '先处理待归档记忆，让系统继续学习你。' : '检查系统理解是否符合真实的你。',
        cta: pendingArchiveCount > 0 ? '去记忆宫殿' : undefined,
        ctaTab: pendingArchiveCount > 0 ? 'memory' : undefined,
      },
      memory: {
        title: '记忆宫殿',
        intent: '决定哪些经历、对话、灵感要成为长期记忆。',
        status: pendingArchiveCount > 0 ? `${pendingArchiveCount} 条等待归档` : '当前没有明显待归档内容',
        next: pendingArchiveCount > 0 ? '先审阅待归档内容，重要的留下，不重要的放过。' : '继续让系统从对话和知识里沉淀记忆。',
      },
      knowledge: {
        title: '知识＋大佬',
        intent: '把网页、笔记、视频、PDF、截图变成可追问、可引用、可归档的知识。',
        status: '主线是：导入素材 → Notebook 联动 → 生成成果。',
        next: '看到资料先导入；想研究资料就进 Notebook 联动。',
      },
      workflow: {
        title: '工作流',
        intent: '先定义流程、真实试跑，确认顺利后再植入定时、群策、知识＋大佬或小白。',
        status: '这里是工作流的源头，不是各模块入口的简单汇总。',
        next: '先做一条能试跑成功的工作流，再决定给哪个模块使用。',
      },
      control: {
        title: '控制',
        intent: '配置模型、工具、角色和系统能力。',
        status: '这里决定 agent 能用什么模型、工具和技能。',
        next: '先保证默认模型、搜索、Telegram 和角色配置可用。',
      },
      scheduler: {
        title: '定时',
        intent: '让系统按时间主动执行任务，并把结果推送给你。',
        status: '适合每日简报、资料更新、定时提醒和 agent 任务。',
        next: '先试跑任务，再打开自动执行。',
      },
      teams: {
        title: '群策',
        intent: '让多个角色围绕一个问题协作，最后产出可留存成果。',
        status: '适合生成 PRD、策略评审、创意拆解和风险审查。',
        next: '发起群聊时，给一个明确目标，最后要沉淀成 PRD 或报告。',
      },
      xiaobai: {
        title: '小白',
        intent: '把复杂问题翻译成可执行步骤，也承载 RLJB、Flash、创意孵化器、B站视频学习助手、UI 风格博物馆和 AI Studio 广告生成器的 Mac 工作台。',
        status: '小白诊断、RLJB Mac、灵犀一念 Flash Mac、创意孵化器 Mac、Bili Helper Mac、UI- Mac、广告大片生成器 Mac 已合并为同一工作台。',
        next: '排错用小白诊断；认知升级进入人类基本盘；灵感创作进入灵犀一念；产品孵化进入创意孵化器；视频资料进入 B站助手；产品审美进入 UI 风格馆；美食/饮品海报进入广告大片。',
      },
    }

    return guides[activeTab]
  }, [activeTab, bossDecisions.length, bossMemories.length, bossState, neurons.length, pendingArchiveCount, synapses.length])

  function handleModuleGuideAction() {
    if (activeModuleGuide.ctaTab) setActiveTab(activeModuleGuide.ctaTab)
  }

  return (
    <div className="sandbox-map">
      {/* 标题栏 — 仅拖拽用 */}
      <div className="sandbox-map__titlebar">
        <span className="sandbox-map__titlebar-text">openbasaka</span>
      </div>

      <div className="sandbox-map__content">
        {/* 左侧边栏导航 */}
        <SidebarNav items={sidebarItems} activeId={activeTab} onSelect={(id) => setActiveTab(id as SandboxTabId)} />

        {/* 主内容区 */}
        <main className="sandbox-map__workspace">
          <section className="sandbox-map__module-guide">
            <div className="sandbox-map__module-guide-main">
              <div className="sandbox-map__module-guide-kicker">当前工作站</div>
              <div className="sandbox-map__module-guide-title">{activeModuleGuide.title}</div>
              <div className="sandbox-map__module-guide-intent">{activeModuleGuide.intent}</div>
            </div>
            <div className="sandbox-map__module-guide-side">
              <div className="sandbox-map__module-guide-status">
                <span>状态</span>
                <strong>{activeModuleGuide.status}</strong>
              </div>
              <div className="sandbox-map__module-guide-next">
                <span>下一步</span>
                <strong>{activeModuleGuide.next}</strong>
              </div>
              {activeModuleGuide.cta && activeModuleGuide.ctaTab && (
                <button className="sandbox-map__module-guide-cta" onClick={handleModuleGuideAction}>
                  {activeModuleGuide.cta}
                </button>
              )}
            </div>
          </section>

          <div className="sandbox-map__workspace-body">
            {activeTab === 'overview' && (
              <OverviewTab
                neurons={neurons}
                loading={loading}
                synapses={synapses}
                bossState={bossState}
                bossMemories={bossMemories}
                bossDecisions={bossDecisions}
                operatingEvents={operatingEvents}
                pendingArchiveCount={pendingArchiveCount}
                onNavigate={setActiveTab}
                onReload={loadNeurons}
                onRefreshBoss={loadBoss}
              />
            )}

            {activeTab === 'neurons' && (
              <NeuronsTab
                neurons={neurons}
                loading={loading}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                onReload={loadNeurons}
              />
            )}

            {activeTab === 'warroom' && <WarRoomTab />}

            {activeTab === 'profiling' && <ProfilingStudioTab />}

            {activeTab === 'synapses' && (
              <SynapsesTab
                neurons={neurons}
                synapses={synapses}
                setSynapses={setSynapses}
                synapseScanning={synapseScanning}
                setSynapseScanning={setSynapseScanning}
                synapseProgress={synapseProgress}
                setSynapseProgress={setSynapseProgress}
                hybridIdeas={hybridIdeas}
                setHybridIdeas={setHybridIdeas}
                selectedSynapse={selectedSynapse}
                setSelectedSynapse={setSelectedSynapse}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                getLLMConfig={getLLMConfig}
              />
            )}

            {activeTab === 'boss' && (
              <BossTab
                bossState={bossState}
                bossMemories={bossMemories}
                bossDecisions={bossDecisions}
                onProfileRefresh={loadBoss}
              />
            )}

            {activeTab === 'memory' && <MemoryTab />}

            {activeTab === 'knowledge' && <KnowledgeVaultTab />}

            {activeTab === 'workflow' && <WorkflowTab />}

            {activeTab === 'control' && <ControlPanelTab />}

            {activeTab === 'scheduler' && <SchedulerTab />}

            {activeTab === 'teams' && <TeamsTab />}

            {activeTab === 'xiaobai' && <XiaoBaiTab />}
          </div>
        </main>
      </div>
    </div>
  )
}
