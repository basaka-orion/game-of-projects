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
import TeamsTab from './tabs/TeamsTab'
import ProfilingStudioTab from './tabs/ProfilingStudioTab'
import OverviewTab from './tabs/OverviewTab'
import { SANDBOX_NAVIGATE_EVENT, type SandboxTabId } from './navigation'
import { SIDEBAR_ITEMS } from './sidebar'
import './SandboxMap.css'

export interface NeuronData {
  project: StoredProject
  taxonomy?: {
    taxonomy: ProjectTaxonomy
    analysis: StructuredAnalysis
  }
}

export default function SandboxMap() {
  const [activeTab, setActiveTab] = useState<SandboxTabId>('overview')
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

        {activeTab === 'control' && <ControlPanelTab />}

        {activeTab === 'scheduler' && <SchedulerTab />}

        {activeTab === 'teams' && <TeamsTab />}

        {activeTab === 'xiaobai' && <XiaoBaiTab />}
      </div>
    </div>
  )
}
