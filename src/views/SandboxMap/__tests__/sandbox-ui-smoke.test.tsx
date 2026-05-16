import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentExecutionReceipt } from '../../../lib/agents/execution-receipt'
import type { StoredProject } from '../../../lib/db/store'
import type { OperatingEventRow, SynapseRow } from '../../../lib/db/repository'
import type { NeuronData } from '../SandboxMap'
import { UI_STYLE_ITEMS } from '../../../lib/ui-museum/catalog'
import { buildUiMuseumPrdContext } from '../../../lib/ui-museum/context'
import type { CouncilLaunchReadinessPack } from '../../../lib/xiaobai-council/action-pack'
import { selectCouncilTeam } from '../../../lib/xiaobai-council/selector'
import { OPENBASAKA_SANDBOX_MENU_ITEMS } from '../../Openbasaka/sandbox-menu'
import { SIDEBAR_ITEMS } from '../sidebar'
import { isSandboxTabId } from '../navigation'
import ControlPanelTab from '../tabs/ControlPanelTab'
import OverviewTab from '../tabs/OverviewTab'
import NeuronsTab from '../tabs/NeuronsTab'
import SynapsesTab from '../tabs/SynapsesTab'
import WarRoomTab from '../tabs/WarRoomTab'
import UIStyleMuseumMacApp, { getUiMuseumStyleRealizationForTest } from '../tabs/ui-museum/UIStyleMuseumMacApp'
import BiliHelperMacApp from '../tabs/bili-helper/BiliHelperMacApp'
import XiaoBaiTab from '../tabs/XiaoBaiTab'
import { CouncilActionPackView } from '../tabs/xiaobai-council/CouncilActionPackView'
import CouncilMacApp from '../tabs/xiaobai-council/CouncilMacApp'
import { CouncilDeliveryModePanel } from '../tabs/xiaobai-council/CouncilDeliveryModeViews'
import { CouncilExcellenceAuditView } from '../tabs/xiaobai-council/CouncilExcellenceAuditView'
import type { CouncilDeliveryModes } from '../../../lib/xiaobai-council/delivery-modes'
import type { CouncilExcellenceAudit } from '../../../lib/xiaobai-council/excellence-audit'
import { CouncilRuntimeEvidenceView } from '../tabs/xiaobai-council/CouncilRuntimeEvidenceView'
import type { CouncilRuntimeEvidenceLedger } from '../../../lib/xiaobai-council/runtime-evidence'
import { CouncilRuntimeHistoryView } from '../tabs/xiaobai-council/CouncilRuntimeHistoryView'
import type { CouncilRuntimeHistoryLedger } from '../../../lib/xiaobai-council/runtime-history'
import { CouncilRuntimeWisdomView } from '../tabs/xiaobai-council/CouncilRuntimeWisdomView'
import type { CouncilRuntimeWisdomContext } from '../../../lib/xiaobai-council/runtime-wisdom'
import { CouncilRuntimeCalibrationView } from '../tabs/xiaobai-council/CouncilRuntimeCalibrationView'
import type { CouncilRuntimeCalibrationPlan } from '../../../lib/xiaobai-council/runtime-calibration'
import { CouncilUserValidationView } from '../tabs/xiaobai-council/CouncilUserValidationView'
import type { CouncilUserValidationLedger } from '../../../lib/xiaobai-council/user-validation'
import { CouncilNuwaEvidenceView } from '../tabs/xiaobai-council/CouncilNuwaEvidenceView'
import { CouncilNuwaSourceAuditView } from '../tabs/xiaobai-council/CouncilNuwaSourceAuditView'
import { Council95CertificationView } from '../tabs/xiaobai-council/Council95CertificationView'
import { CouncilAcceptanceReviewView } from '../tabs/xiaobai-council/CouncilAcceptanceReviewView'
import { CouncilArtifactReviewView } from '../tabs/xiaobai-council/CouncilArtifactReviewView'
import { buildCouncil95CertificationGate } from '../../../lib/xiaobai-council/certification'
import { buildCouncilNuwaEvidenceRegistry } from '../../../lib/xiaobai-council/distillation-evidence'
import type { CouncilNuwaSourceAuditLedger } from '../../../lib/xiaobai-council/source-audit'
import type { CouncilNuwaLocalPreflightReport } from '../../../lib/xiaobai-council/source-preflight'
import { COUNCIL_PERSONAS } from '../../../lib/xiaobai-council/personas'

const matchGateMock = vi.hoisted(() => ({
  runCouncilMatchGate: vi.fn(),
}))

const councilWorkflowMock = vi.hoisted(() => ({
  runCouncilPrdWorkflow: vi.fn(),
}))

vi.mock('@remotion/player', () => ({
  Player: ({ inputProps }: { inputProps?: { state?: { headline?: string } } }) => (
    <div className="remotion-player-mock">Remotion Guide: {inputProps?.state?.headline || 'waiting'}</div>
  ),
}))

vi.mock('../../../lib/xiaobai-council/match-gate', () => ({
  runCouncilMatchGate: matchGateMock.runCouncilMatchGate,
}))

vi.mock('../../../lib/xiaobai-council/workflow', () => ({
  runCouncilPrdWorkflow: councilWorkflowMock.runCouncilPrdWorkflow,
}))

vi.mock('../../../lib/xiaobai-council/profile', () => ({
  buildCouncilPersonaProfile: vi.fn(async ({ persona }: { persona: any }) => ({
    persona,
    dreamState: {
      personaId: persona.id,
      currentDream: `${persona.shortName} 正在把私有记忆转成动态 dream`,
      evidence: [{ kind: 'dream-seed', label: '初始志向', text: persona.dreamSeed }],
      growthSignals: ['本轮学到要保留独立判断'],
      nextAspiration: '下一轮更明确地指出分歧与证据缺口',
      freezeRule: '本轮新学习只在下一轮生效。',
    },
    distillationProfile: {
      personaId: persona.id,
      personaName: persona.name,
      realHumanBasis: persona.realHumanBasis,
      nuwaSkillId: persona.nuwaSkillId,
      distillationStatus: persona.distillationStatus,
      skillPackagePath: `.openbasaka/nuwa-council/${persona.id}/`,
      researchFiles: [],
      auditCard: {
        whyEssential: '必须有它，因为它提供不可替代的方法论。',
        irreplaceableAbility: persona.promptSeed,
        fitsProblems: ['PRD'],
        misfitProblems: ['私人未公开观点'],
      },
      mentalModels: [{ id: 'm1', label: 'focus', description: '聚焦', sourcePolicy: 'mock' }],
      decisionHeuristics: [{ id: 'h1', label: 'prd', description: '落地', sourcePolicy: 'mock' }],
      expressionDna: ['清晰'],
      antiPatterns: persona.honestLimits || [],
      innerTensions: ['强项与盲点需要质询'],
      honestLimits: persona.honestLimits || [],
      validationQuestions: ['未知问题要表达不确定'],
      sourceSummary: 'mock source summary',
    },
    memory: {
      entriesCount: 1,
      totalChars: 12,
      recentEntries: [{ text: '私有记忆短摘', createdAt: '2026-05-04T00:00:00.000Z' }],
    },
    contributions: {
      briefCount: 0,
      reflectionCount: 0,
      latest: '还没有本轮贡献。',
      disagreements: [],
    },
    safety: {
      sourcePolicy: persona.sourcePolicy,
      localOnly: true,
      privateDataRule: '只展示安全摘要。',
    },
  })),
}))

function receipt(): AgentExecutionReceipt {
  return {
    id: 'receipt-smoke-1',
    subject: 'WarRoom｜复盘行动',
    agentId: 'strategy',
    status: 'completed',
    inputPreview: '检查行动闭环。',
    outputPreview: '完成一次有证据的执行复盘。',
    tools: [{ id: 'team-engine', label: 'Team Engine', risk: 'low', status: 'completed' }],
    evidenceRefs: [{ kind: 'knowledge', title: 'Wiki 证据' }],
    cost: { inputChars: 8, outputChars: 12, note: '本地估算。' },
    retry: { recommended: false, reason: '完成', nextStep: '沉淀为项目操作手册。' },
    trust: { risk: 'low', confidence: 0.86, rationale: '带证据完成。' },
  }
}

function operatingEvent(): OperatingEventRow {
  const item = receipt()
  return {
    id: 'op-smoke-1',
    type: 'agent_action',
    stage: 'execute',
    title: `Agent 执行：${item.subject}`,
    summary: item.outputPreview,
    source_kind: 'agent',
    source_id: item.agentId,
    source_title: item.subject,
    confidence: item.trust.confidence,
    entities_json: '[]',
    project_ids_json: '[]',
    payload_json: JSON.stringify({ receipt: item }),
    created_at: '2026-04-25T00:00:00.000Z',
    updated_at: '2026-04-25T00:00:00.000Z',
  }
}

function projectFixture(overrides: Partial<StoredProject> = {}): StoredProject {
  return {
    id: 'project-neuron-1',
    title: 'OpenBasaka 项目神经元',
    oneLiner: '把项目、记忆、知识和执行回写成一个可推进的节点。',
    tags: ['OpenBasaka', '项目网络'],
    radar: {
      era_fit: 88,
      boss_match: 91,
      monetization: 62,
      tech_breakthrough: 79,
      resource_cost: 46,
      risk_index: 34,
    },
    survivalRate: 91,
    survivalGrade: 'S',
    summary: '这颗神经元适合作为 OpenBasaka 的主线项目节点。',
    recommendation: '保持置顶，并优先推进能回写执行证据的下一步。',
    warLogs: [{ role: '红军', verdict: '保留主线，先补证据闭环。', timestamp: 1777852800000 }],
    rawContent: '项目原始材料',
    isPinned: true,
    isStarred: true,
    priorityLevel: 'urgent',
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt: '2026-05-04T00:00:00.000Z',
    ...overrides,
  }
}

function neuronFixture(project: StoredProject = projectFixture()): NeuronData {
  return {
    project,
    taxonomy: {
      taxonomy: {
        industry: '智能体操作系统',
        subIndustry: '个人外脑',
        techStack: ['Electron', 'SQLite', 'Agent'],
        businessModel: '个人智能系统',
        marketSize: 'emerging',
        stage: 'prototype',
        innovationType: '组合创新',
        complexity: 72,
        timeToMarket: '1-3 months',
        resourceRequirements: '本地数据、模型路由、执行证据',
      },
      analysis: {
        strengths: ['闭环完整'],
        weaknesses: ['执行证据还要补强'],
        opportunities: ['可沉淀为长期工作台'],
        threats: ['模块过多会分散注意力'],
        eraRelevance: 88,
        breakthroughPotential: 84,
        differentiation: 79,
      },
    },
  }
}

function synapseFixture(overrides: Partial<SynapseRow> = {}): SynapseRow {
  return {
    id: 'synapse-1',
    source_id: 'project-neuron-1',
    target_id: 'project-neuron-2',
    type: 'skill-transfer',
    strength: 83,
    reason: '神经元一沉淀的执行证据方法可以迁移给神经元二。',
    action_items_json: '["整理可复用的执行回执模板"]',
    created_at: '2026-05-04T00:00:00.000Z',
    ...overrides,
  }
}

function installMockLocalStorage() {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    },
  })
}

function installMockElectronAPI(api?: Partial<Window['electronAPI']>) {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: api,
  })
}

function setNativeInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('sandbox UI smoke contracts', () => {
  afterEach(() => {
    installMockElectronAPI(undefined)
  })

  it('keeps the sandbox as the single entry for Qimeng inbox, profiling, and WarRoom', () => {
    expect(OPENBASAKA_SANDBOX_MENU_ITEMS.map((item) => item.label)).toEqual([
      '沙盘全景',
      '启蒙收件箱',
      '画像工坊',
      '推演室',
    ])
    expect(OPENBASAKA_SANDBOX_MENU_ITEMS.map((item) => item.action)).toEqual([
      'overview',
      'archive-inbox',
      'profiling',
      'warroom',
    ])
  })

  it('keeps all critical sandbox tabs reachable from the sidebar', () => {
    expect(SIDEBAR_ITEMS.map((item) => item.id)).toEqual([
      'simplify',
      'overview',
      'neurons',
      'warroom',
      'profiling',
      'synapses',
      'boss',
      'memory',
      'knowledge',
      'workflow',
      'control',
      'scheduler',
      'system-audit',
      'teams',
      'xiaobai',
    ])
    expect(SIDEBAR_ITEMS.map((item) => item.label)).toEqual([
      '化繁为简',
      '总控',
      '神经元',
      '推演室',
      '画像工坊',
      '突触',
      'Boss',
      '记忆宫殿',
      '知识＋大佬',
      '工作流',
      '控制',
      '定时',
      '系统自省',
      '群策',
      '小白',
    ])
  })

  it('keeps system self-audit registered for Simplify routing and the sidebar', () => {
    expect(isSandboxTabId('system-audit')).toBe(true)
    expect(SIDEBAR_ITEMS.find((item) => item.id === 'system-audit')?.label).toBe('系统自省')
  })

  it('keeps the restored XiaoBai workspaces reachable from the XiaoBai module', () => {
    const html = renderToStaticMarkup(<XiaoBaiTab />)

    expect(html).toContain('小白诊断')
    expect(html).toContain('人类基本盘')
    expect(html).toContain('灵犀一念')
    expect(html).toContain('创意孵化器')
    expect(html).toContain('万象学习')
    expect(html).toContain('小白智囊团')
    expect(html).toContain('UI 风格馆')
    expect(html).toContain('广告大片')
    expect(html).toContain('知识树 / 认知成长')
    expect(html).toContain('灵感捕捉 / 作品生成')
    expect(html).toContain('美食视觉 / 提示词')
  })

  it('renders the overview with intake, execution receipts, and review learning surfaces', () => {
    const html = renderToStaticMarkup(
      <OverviewTab
        neurons={[]}
        loading={false}
        synapses={[]}
        bossState={null}
        bossMemories={[]}
        bossDecisions={[]}
        operatingEvents={[operatingEvent()]}
        pendingArchiveCount={6313}
        onNavigate={vi.fn()}
        onReload={vi.fn()}
        onRefreshBoss={vi.fn()}
      />,
    )

    expect(html).toContain('沙盘总控台')
    expect(html).toContain('还有 6313 条启蒙候选等待确认入宫。')
    expect(html).toContain('执行学习')
    expect(html).toContain('复盘学习')
    expect(html).toContain('执行收据')
    expect(html).toContain('可沉淀')
    expect(html).toContain('WarRoom｜复盘行动')
    expect(html).toContain('沙盘每日简报')
    expect(html).toContain('昨日沉淀')
    expect(html).toContain('今日行动')
    expect(html).toContain('系统缺口')
    expect(html).toContain('Agent 建议')
    expect(html).toContain('项目神经网络')
    expect(html).toContain('项目节点')
    expect(html).toContain('记忆节点')
    expect(html).toContain('知识节点')
    expect(html).toContain('执行节点')
    expect(html).toContain('打开')
    expect(html).toContain('进入')
    expect(html).toContain('行动')
    expect(html).toContain('就绪度')
    expect(html).not.toContain('OPEN')
    expect(html).not.toContain('GO')
    expect(html).not.toContain('AGENT ACTION')
    expect(html).not.toContain('READY')
  })

  it('renders clear loading and empty states instead of silent gaps', () => {
    const html = renderToStaticMarkup(
      <OverviewTab
        neurons={[]}
        loading
        synapses={[]}
        bossState={null}
        bossMemories={[]}
        bossDecisions={[]}
        operatingEvents={[]}
        pendingArchiveCount={0}
        onNavigate={vi.fn()}
        onReload={vi.fn()}
        onRefreshBoss={vi.fn()}
      />,
    )

    expect(html).toContain('沙盘正在同步')
    expect(html).toContain('Boss 记忆待同步')
    expect(html).toContain('主循环账本还没有事件')
    expect(html).toContain('等待执行收据后自动生成复盘队列')
    expect(html).toContain('等待执行收据')
  })

  it('renders the restored neuron management controls and Chinese stage labels', () => {
    const html = renderToStaticMarkup(
      <NeuronsTab
        neurons={[neuronFixture()]}
        loading={false}
        selectedId="project-neuron-1"
        setSelectedId={vi.fn()}
        onReload={vi.fn()}
      />,
    )

    expect(html).toContain('项目神经元')
    expect(html).toContain('OpenBasaka 项目神经元')
    expect(html).toContain('已置顶')
    expect(html).toContain('已星标')
    expect(html).toContain('优先级')
    expect(html).toContain('最高')
    expect(html).toContain('神经元控制台')
    expect(html).toContain('删除项目')
    expect(html).toContain('项目身份')
    expect(html).toContain('主判断')
    expect(html).toContain('联动房间')
    expect(html).toContain('打开')
    expect(html).not.toContain('project neuron')
    expect(html).not.toContain('focal verdict')
    expect(html).not.toContain('linked rooms')
    expect(html).not.toContain('actionLabel=&quot;open&quot;')
  })

  it('renders the synapse workbench with Chinese relation labels and resilient details', () => {
    const secondProject = projectFixture({
      id: 'project-neuron-2',
      title: '执行证据项目神经元',
      oneLiner: '把每次电脑任务的证据整理成可复用模板。',
      isPinned: false,
      isStarred: false,
      priorityLevel: 'high',
    })
    const synapse = synapseFixture({ action_items_json: '{bad-json' })
    const html = renderToStaticMarkup(
      <SynapsesTab
        neurons={[neuronFixture(), neuronFixture(secondProject)]}
        synapses={[synapse]}
        setSynapses={vi.fn()}
        synapseScanning={false}
        setSynapseScanning={vi.fn()}
        synapseProgress=""
        setSynapseProgress={vi.fn()}
        hybridIdeas={[]}
        setHybridIdeas={vi.fn()}
        selectedSynapse={synapse}
        setSelectedSynapse={vi.fn()}
        selectedId={null}
        setSelectedId={vi.fn()}
        getLLMConfig={() => ({
          provider: 'glm',
          apiKey: '',
          baseUrl: 'https://api.z.ai/api/coding/paas/v4',
          model: 'glm-5.1',
        })}
      />,
    )

    expect(html).toContain('搜索项目、关系、原因或行动建议...')
    expect(html).toContain('能力迁移')
    expect(html).toContain('一个项目沉淀的方法可以迁移到另一个项目。')
    expect(html).toContain('行动建议')
    expect(html).toContain('暂无行动建议，仍可基于这条连接探索混合创新。')
    expect(html).toContain('探索混合创新')
    expect(html).not.toContain('skill-transfer')
  })

  it('filters synapse connections from the search bar and shows a clear no-match state', async () => {
    const secondProject = projectFixture({
      id: 'project-neuron-2',
      title: '执行证据项目神经元',
      oneLiner: '把每次电脑任务的证据整理成可复用模板。',
      isPinned: false,
      isStarred: false,
      priorityLevel: 'high',
    })
    const thirdProject = projectFixture({
      id: 'project-neuron-3',
      title: '注意力竞争项目神经元',
      oneLiner: '识别同一周内互相抢资源的项目。',
      isPinned: false,
      isStarred: false,
      priorityLevel: 'normal',
    })
    const synapses = [
      synapseFixture(),
      synapseFixture({
        id: 'synapse-2',
        source_id: 'project-neuron-2',
        target_id: 'project-neuron-3',
        type: 'conflicting',
        strength: 61,
        reason: '两个项目争夺同一周的注意力。',
        action_items_json: '[]',
      }),
    ]
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <SynapsesTab
          neurons={[neuronFixture(), neuronFixture(secondProject), neuronFixture(thirdProject)]}
          synapses={synapses}
          setSynapses={vi.fn()}
          synapseScanning={false}
          setSynapseScanning={vi.fn()}
          synapseProgress=""
          setSynapseProgress={vi.fn()}
          hybridIdeas={[]}
          setHybridIdeas={vi.fn()}
          selectedSynapse={null}
          setSelectedSynapse={vi.fn()}
          selectedId={null}
          setSelectedId={vi.fn()}
          getLLMConfig={() => ({
            provider: 'glm',
            apiKey: '',
            baseUrl: 'https://api.z.ai/api/coding/paas/v4',
            model: 'glm-5.1',
          })}
        />,
      )
    })

    expect(container.textContent).toContain('能力迁移')
    expect(container.textContent).toContain('资源竞争')

    const input = container.querySelector('input')
    await act(async () => {
      if (input) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '能力迁移')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })

    expect(container.textContent).toContain('能力迁移')
    expect(container.textContent).not.toContain('两个项目争夺同一周的注意力。')

    await act(async () => {
      if (input) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '完全不存在的连接')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })

    expect(container.textContent).toContain('没有匹配的突触')

    await act(async () => {
      root.unmount()
    })
  })

  it('keeps WarRoom as a Chinese strategic workbench with action-plan styling restored', () => {
    const html = renderToStaticMarkup(<WarRoomTab />)
    const css = readFileSync('src/views/SandboxMap/tabs/WarRoomTab.css', 'utf8')

    expect(html).toContain('推演室应该先给出此刻战局的主判断')
    expect(html).toContain('当前战局')
    expect(html).toContain('关键突触')
    expect(html).toContain('主判断')
    expect(html).toContain('推演室联动')
    expect(html).toContain('高压项目')
    expect(html).toContain('打开')
    expect(html).not.toContain('war room')
    expect(html).not.toContain('battle state')
    expect(html).not.toContain('focal verdict')
    expect(html).not.toContain('linked rooms')
    expect(html).not.toContain('actionLabel=&quot;open&quot;')
    expect(css).toContain('.warroom-tab__action-head')
    expect(css).toContain('.warroom-tab__action-grid')
    expect(css).toContain('.warroom-tab__action-control')
  })

  it('keeps database backup and restore controls visible in the control panel', () => {
    const html = renderToStaticMarkup(<ControlPanelTab />)

    expect(html).toContain('数据备份与恢复')
    expect(html).toContain('导出 JSON 备份')
    expect(html).toContain('从备份恢复')
    expect(html).toContain('恢复会覆盖当前本地库')
  })

  it('keeps every UI museum style backed by a concrete realization profile', () => {
    const genericFallbacks = UI_STYLE_ITEMS
      .map((item) => [item.id, getUiMuseumStyleRealizationForTest(item).label] as const)
      .filter(([, label]) => label === 'PRODUCT SURFACE')

    expect(genericFallbacks).toEqual([])
  })

  it('requires every UI museum style to carry a complete master restoration profile', () => {
    expect(UI_STYLE_ITEMS).toHaveLength(78)

    for (const item of UI_STYLE_ITEMS) {
      expect(item.masterProfile.referenceBrief, item.id).toMatch(/\S{12,}/)
      expect(item.masterProfile.identityRules, item.id).toHaveLength(3)
      expect(item.masterProfile.visualTokens, item.id).toHaveLength(4)
      expect(item.masterProfile.componentGrammar, item.id).toHaveLength(3)
      expect(item.masterProfile.promptRules, item.id).toHaveLength(3)
      expect(item.masterProfile.antiPatterns, item.id).toHaveLength(3)
      expect(item.masterProfile.acceptanceChecklist, item.id).toHaveLength(5)
      expect(Object.values(item.masterProfile.platformRules).every((rule) => rule.includes(item.title.replace(/^\d+\.\s*/, '').replace(/\(.+?\)/g, '').trim().split(/\s+/)[0]) || rule.length > 80)).toBe(true)
      expect(Math.min(...Object.values(item.masterProfile.restorationScores))).toBeGreaterThanOrEqual(80)
    }
  })

  it('routes new frontier UI styles into downstream PRD context', () => {
    const context = buildUiMuseumPrdContext('AI Agent 画布 本地隐私 证据透明 可解释审计 多模态 无障碍', [
      'canvas-ai',
      'xai-transparency',
      'local-first-ledger',
    ])

    expect(context.styleIds).toEqual(['canvas-ai', 'xai-transparency', 'local-first-ledger'])
    expect(context.promptFragment).toContain('证据链')
    expect(context.promptFragment).toContain('本地')
    expect(context.promptFragment).toContain('组件状态清单')
    expect(context.promptFragment).toContain('来源基准')
    expect(context.promptFragment).toContain('禁忌项')
    expect(context.promptFragment).toContain('复原评分')
    expect(context.styleProfiles.map((profile) => profile.styleId)).toEqual(['canvas-ai', 'xai-transparency', 'local-first-ledger'])
    expect(context.styleProfiles[0].restorationScores.identity).toBeGreaterThanOrEqual(90)
  })

  it('renders every UI museum card as a same-DNA experiential preview before opening the spec', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<UIStyleMuseumMacApp />)
    })

    expect(container.querySelectorAll('.ui-museum__card .ui-museum-card-experience')).toHaveLength(UI_STYLE_ITEMS.length)

    const cardByTitle = (title: string) =>
      Array.from(container.querySelectorAll('.ui-museum__card')).find((card) => card.textContent?.includes(title))

    expect(cardByTitle('Dither Punk')?.textContent).toContain('Dither Console')
    expect(cardByTitle('Dither Punk')?.textContent).toContain('BOOT')
    expect(cardByTitle('Dither Punk')?.textContent).toContain('空白位图等待写入')
    expect(cardByTitle('Pixel Art')?.textContent).toContain('Pixel Quest')
    expect(cardByTitle('Pixel Art')?.textContent).toContain('START')
    expect(cardByTitle('Chromium Liquid')?.textContent).toContain('Chrome Studio')
    expect(cardByTitle('Chromium Liquid')?.textContent).toContain('Mirror Web')
    expect(cardByTitle('Anthropic Serif')?.textContent).toContain('Thinking Room')
    expect(cardByTitle('Blueprint CAD')?.textContent).toContain('Interface Plan')
    expect(cardByTitle('Kinetic Type')?.textContent).toContain('Type Engine')
    expect(cardByTitle('Canvas AI')?.textContent).toContain('Canvas Copilot')
    expect(cardByTitle('Explainable AI')?.textContent).toContain('Trust Ledger')
    expect(cardByTitle('Material 3 Expressive')?.textContent).toContain('Expressive Flow')
    expect(cardByTitle('Adaptive Accessibility')?.textContent).toContain('Access Console')
    expect(cardByTitle('Local-First Ledger')?.textContent).toContain('Private Ledger')

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('opens a UI museum style into real platform previews instead of text-only specs', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<UIStyleMuseumMacApp />)
    })

    const chromeCard = Array.from(container.querySelectorAll('.ui-museum__card')).find((card) =>
      card.textContent?.includes('Chromium Liquid'),
    )
    expect(chromeCard?.textContent).toContain('打开真实互动规范')

    const openButton = Array.from(chromeCard?.querySelectorAll('button') || []).find((button) =>
      button.textContent?.includes('打开真实互动规范'),
    )
    expect(openButton).toBeTruthy()

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('真实平台互动预览')
    expect(container.textContent).toContain('Web')
    expect(container.textContent).toContain('iOS')
    expect(container.textContent).toContain('macOS')
    expect(container.textContent).toContain('Android')
    expect(container.textContent).toContain('小程序')
    expect(container.textContent).toContain('CHROMIUM LIQUID')
    expect(container.textContent).toContain('Chrome Studio')
    expect(container.textContent).toContain('Mirror nav')
    expect(container.textContent).toContain('镜面待点亮')
    expect(container.textContent).toContain('工作流：把视觉 token 写入执行模板')
    expect(container.textContent).toContain('OpenBasaka：保存后进入风格自进化记忆')

    const macButton = Array.from(container.querySelectorAll('.ui-museum__platform-tabs button')).find((button) =>
      button.textContent?.includes('macOS'),
    )
    await act(async () => {
      macButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Toolbar')
    expect(container.textContent).toContain('Sidebar')
    expect(container.textContent).toContain('Inspector')
    expect(container.textContent).toContain('OpenBasaka Evolution')

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('keeps 1-bit Dither Punk preview and platform spec on the same style DNA', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<UIStyleMuseumMacApp />)
    })

    const ditherCard = Array.from(container.querySelectorAll('.ui-museum__card')).find((card) =>
      card.textContent?.includes('Dither Punk'),
    )
    expect(ditherCard?.textContent).toContain('打开真实互动规范')

    const openButton = Array.from(ditherCard?.querySelectorAll('button') || []).find((button) =>
      button.textContent?.includes('打开真实互动规范'),
    )
    expect(openButton).toBeTruthy()

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('1-BIT DITHER')
    expect(container.textContent).toContain('Dither Console')
    expect(container.textContent).toContain('Atkinson matrix')
    expect(container.textContent).toContain('空白位图等待写入')
    expect(container.textContent).toContain('Web 版必须让浏览器框、导航、输入、卡片、空态和按钮都使用 1-bit 黑白、硬边和点阵')
    expect(container.textContent).toContain('工作流：把视觉 token 写入执行模板')
    expect(container.textContent).toContain('OpenBasaka：保存后进入风格自进化记忆')

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('renders SourceOS guided studio with UI museum DNA and post-parse surfaces', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<BiliHelperMacApp />)
    })

    expect(container.textContent).toContain('SOURCEOS GUIDED STUDIO')
    expect(container.textContent).toContain('Remotion Guide')
    expect(container.textContent).toContain('Agentic OS')
    expect(container.textContent).toContain('Anthropic Serif')
    expect(container.textContent).toContain('识别诊断')
    expect(container.textContent).toContain('SOURCE ASSET')
    expect(container.textContent).toContain('万象吸收')
    expect(container.textContent).toContain('功能真实性巡检')

    const loadSampleButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('载入样例'))
    expect(loadSampleButton).toBeTruthy()

    await act(async () => {
      loadSampleButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('如何把一个 B 站视频变成自己的学习包')
    expect(container.textContent).toContain('ARTIFACT DASHBOARD')
    expect(container.textContent).not.toContain('BAOYU 秒懂视觉')
    expect(container.textContent).toContain('SOURCE NOTEBOOK')
    expect(container.textContent).toContain('LEARNING PACK')
    expect(container.textContent).toContain('万象三结果')
    expect(container.textContent).toContain('归档去向')
    expect(container.textContent).toContain('覆盖矩阵')
    expect(container.textContent).toContain('生成后会出现摘要')

    const tldrButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('金句精华'))
    await act(async () => {
      tldrButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(container.textContent).toContain('一句话结论')
    expect(container.textContent).toContain('已生成')
    expect(container.textContent).toContain('证据')
    expect(container.textContent).toContain('真实来源产物')

    const mindmapButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('思维导图'))
    await act(async () => {
      mindmapButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(container.textContent).toContain('中心主题')
    expect(container.textContent).toContain('思维导图')

    const actionableButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('行动清单'))
    await act(async () => {
      actionableButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(container.textContent).toContain('今天可做')
    expect(container.textContent).toContain('完成标准是什么')

    const insightsTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === '智能总结')
    await act(async () => {
      insightsTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.textContent).toContain('BIBIGPT STYLE SUMMARY')
    expect(container.textContent).toContain('生成智能总结')

    const packTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === '学习包')
    await act(async () => {
      packTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.textContent).toContain('MARKDOWN PACK')
    expect(container.textContent).toContain('行动化')

    const wanxiangTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === '万象吸收')
    await act(async () => {
      wanxiangTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.textContent).toContain('WANXIANG WAITING')
    expect(container.textContent).toContain('生成万象三结果')

    const chatTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === '来源对话')
    await act(async () => {
      chatTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.textContent).toContain('SOURCE DIALOG')
    expect(container.textContent).toContain('提问')

    const coverageTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === '覆盖矩阵')
    await act(async () => {
      coverageTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.textContent).toContain('BIBIGPT PROVIDER')
    expect(container.textContent).toContain('运行环境体检')

    const downloadsTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === '下载导出')
    await act(async () => {
      downloadsTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.textContent).toContain('EXPORT TARGETS')
    expect(container.textContent).toContain('可导出 SourceAsset')

    const libraryTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === '资料库')
    await act(async () => {
      libraryTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.textContent).toContain('SOURCE LIBRARY')
    expect(container.textContent).toContain('ASSET RECEIPTS')

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('shows honest blockers instead of fake artifact content when SourceOS lacks real text', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    installMockLocalStorage()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<BiliHelperMacApp />)
    })

    const loadSampleButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('载入样例'))
    await act(async () => {
      loadSampleButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const sourceNotebook = Array.from(container.querySelectorAll('textarea')).find((textarea) => textarea.placeholder.includes('粘贴字幕')) as HTMLTextAreaElement
    await act(async () => {
      setNativeInputValue(sourceNotebook, '')
    })

    const tldrButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('金句精华'))
    await act(async () => {
      tldrButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain('无法生成真实结论')
    expect(container.textContent).toContain('缺真实字幕、正文、OCR 或转写')
    expect(container.textContent).toContain('自动取材已尝试')
    expect(container.textContent).toContain('待补内容诊断')
    expect(container.textContent).toContain('yt-dlp')
    expect(container.textContent).not.toContain('一句话结论')

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('hydrates a metadata-only video URL through yt-dlp before generating SourceOS artifacts', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    installMockLocalStorage()
    const executeCommand = vi.fn(async () => ({
      success: true,
      stdout: JSON.stringify({
        success: true,
        text: '00:00 真实字幕：先说明主题。\n01:12 真实字幕：展开关键方法。\n03:40 真实字幕：给出行动清单和复盘标准。',
        method: 'yt-dlp-subtitle',
        files: ['source.zh-Hans.vtt'],
        cookieMode: 'plain',
      }),
      stderr: '',
      exitCode: 0,
    }))
    installMockElectronAPI({
      fetchUrl: vi.fn(async (url: string) => ({
        title: '元信息视频',
        content: '',
        author: '测试作者',
        description: '这里只是简介，不能冒充正文。',
        url,
        cover: '',
        siteName: 'YouTube',
        canonicalUrl: url,
        favicon: '',
      })),
      executeCommand,
    } as Partial<Window['electronAPI']>)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<BiliHelperMacApp />)
    })

    const input = container.querySelector('input[aria-label="视频链接"]') as HTMLInputElement
    setNativeInputValue(input, 'https://www.youtube.com/watch?v=abc123def45')
    const form = container.querySelector('form.bili-helper-mac__search') as HTMLFormElement
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const tldrButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('金句精华'))
    await act(async () => {
      tldrButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(executeCommand).toHaveBeenCalled()
    expect(container.textContent).toContain('一句话结论')
    expect(container.textContent).toContain('yt-dlp')
    expect(container.textContent).toContain('真实来源产物')
    expect(container.textContent).not.toContain('请先补字幕、正文、OCR 或转写')

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('renders XiaoBai council as a parallel PRD loop surface', () => {
    installMockLocalStorage()
    const html = renderToStaticMarkup(<CouncilMacApp />)

    expect(html).toContain('95+ 指挥舱')
    expect(html).toContain('首屏给判断，3 分钟给行动，证据链不自欺')
    expect(html).toContain('点击开始后自动完成匹配、编队、博弈、成稿和工作流投递')
    expect(html).toContain('完成后会自动发一份给工作流模块')
    expect(html).toContain('小白智囊团 · PRD 闭环')
    expect(html).toContain('隐藏思想原型')
    expect(html).toContain('自动编队')
    expect(html).toContain('自动激活')
    expect(html).toContain('隐藏角色库')
    expect(html).toContain('Creative DNA')
    expect(html).toContain('UI风格馆')
    expect(html).toContain('Nuwa 蒸馏证据总账')
    expect(html).toContain('人工来源级复核')
    expect(html).toContain('真实长跑历史')
    expect(html).toContain('运行智慧反馈')
    expect(html).toContain('自我进化约束')
    expect(html).toContain('95 真实长跑评测协议')
    expect(html).toContain('95 真实认证闸门')
    expect(html).toContain('禁止声称已达 95')
    expect(html).toContain('共识追溯')
    expect(html).toContain('质量闸门')
    expect(html.match(/council-app__hidden-persona/g)?.length).toBe(36)
    expect(html).toContain('高汀式传播定位师')
    expect(html).toContain('已蒸馏')
  })

  it('renders XiaoBai dual delivery mode so Boss review and beginner execution stay separate', () => {
    const deliveryModes: CouncilDeliveryModes = {
      defaultMode: 'boss-review',
      bossReview: {
        mode: 'boss-review',
        headline: 'Boss 复盘模式：看见思考如何发生',
        summary: '本轮形成 42 幕剧场和 36 条关系边。',
        criticalTension: 'Boss 需要完整复盘，小白需要低负担执行。',
        traceSignals: [{ label: '质量闸门', value: '100 · approved', detail: '通过' }],
      },
      xiaobaiExecute: {
        mode: 'xiaobai-execute',
        headline: '小白执行模式：只给下一步',
        promise: '把模糊想法压缩成明天第一步。',
        firstAction: '输入一个真实项目想法。',
        nextSteps: ['确认系统复述', '选择最大限制', '生成最小方案'],
        whatSystemHides: ['隐藏 42 幕大师博弈'],
        trustSignals: [{ label: '质量闸门', value: '100 · approved', detail: '通过' }],
        doNotDo: ['不暴露角色长争论'],
        traceBack: { scenes: 42, relations: 36, kept: 8, cut: 4, revised: 6, sourceSceneIds: ['scene_1'] },
      },
    }

    const html = renderToStaticMarkup(
      <CouncilDeliveryModePanel deliveryModes={deliveryModes} mode="xiaobai-execute" onModeChange={() => {}} />,
    )

    expect(html).toContain('双模式结果层')
    expect(html).toContain('小白执行模式')
    expect(html).toContain('现在只做这一件事')
    expect(html).toContain('可回溯底层')
  })

  it('renders XiaoBai 90-point action pack as launch-ready work lanes', () => {
    const actionPack: CouncilLaunchReadinessPack = {
      score: 91,
      scoreLabel: '可开工巨细版',
      oneScreenBrief: '把大师博弈结果压成可开工任务。',
      primaryCta: '生成 90 分行动包并进入首版验证',
      nowAction: '输入一个真实项目想法。',
      successMetric: '5 人留证且 4 人完成一次闭环。',
      milestones: [
        { label: '今天', timeframe: '0-1 天', outcome: '锁定定位和首屏。', taskIds: ['product-positioning'] },
        { label: '本周', timeframe: '2-5 天', outcome: '跑通工作流和导出。', taskIds: ['engineering-state-flow'] },
        { label: '首版复验', timeframe: '5-7 天', outcome: '完成 5-8 人稳审验证。', taskIds: ['validation-first-users'] },
      ],
      taskGroups: [
        {
          area: 'product',
          label: '产品定义',
          intent: '锁定边界。',
          tasks: [{ id: 'product-positioning', area: 'product', priority: 'P0', title: '锁定一句话定位', ownerHint: 'Boss', acceptance: '有定位和北极星指标。', source: 'PRD' }],
        },
        {
          area: 'design',
          label: '体验设计',
          intent: '落首屏。',
          tasks: [{ id: 'design-first-screen', area: 'design', priority: 'P0', title: '画出第一屏', ownerHint: '设计席位', acceptance: '有空态、加载、失败态。', source: 'UI风格馆' }],
        },
        {
          area: 'engineering',
          label: '工程实现',
          intent: '跑通状态流。',
          tasks: [{ id: 'engineering-state-flow', area: 'engineering', priority: 'P0', title: '实现状态流', ownerHint: '工程席位', acceptance: 'result 含 actionPack。', source: 'workflow' }],
        },
        {
          area: 'test',
          label: '测试验收',
          intent: '证明能跑。',
          tasks: [{ id: 'test-automated-gates', area: 'test', priority: 'P0', title: '跑自动化验收', ownerHint: '测试席位', acceptance: 'vitest/typecheck/build 通过。', source: '质量闸门' }],
        },
        {
          area: 'validation',
          label: '首版验证',
          intent: '验证小白可用。',
          tasks: [{ id: 'validation-first-users', area: 'validation', priority: 'P0', title: '5-8 人小白稳审验证', ownerHint: '研究席位', acceptance: '至少 5 人留证且 4 人完成一次闭环。', source: '首版验证实验' }],
        },
      ],
      riskControls: ['不做假进度', '不静默外发隐私'],
      exportChecklist: ['PRD', '辩论剧场', '质量闸门', '行动面板', '共识追溯'],
      sourceTrace: ['6 位入选角色', '质量闸门 91'],
    }

    const html = renderToStaticMarkup(<CouncilActionPackView actionPack={actionPack} />)

    expect(html).toContain('90 分行动面板')
    expect(html).toContain('可直接开工')
    expect(html).toContain('产品定义')
    expect(html).toContain('工程实现')
    expect(html).toContain('5-8 人小白稳审验证')
  })

  it('renders XiaoBai 95-point excellence audit with honest remaining gaps', () => {
    const audit: CouncilExcellenceAudit = {
      score: 91,
      targetScore: 95,
      gapToTarget: 4,
      scoreLabel: '90 分可开工版本',
      verdict: '当前可客观视为 91 分版本；距离 95 分还差 4 分。',
      dimensions: [
        { id: 'distillation-depth', label: '真实人类蒸馏深度', score: 90, weight: 0.14, evidence: ['6/6 位已蒸馏'], gaps: ['需要人工抽样审阅'], nextMoves: ['抽查来源'] },
        { id: 'match-debate-trace', label: '深度匹配与辩论可追溯', score: 94, weight: 0.2, evidence: ['42 幕辩论场景'], gaps: ['抽查结论来源'], nextMoves: ['标注来源场景'] },
        { id: 'prd-actionability', label: 'PRD 与行动包可开工性', score: 92, weight: 0.2, evidence: ['5 条任务泳道'], gaps: ['工程拆票复验'], nextMoves: ['导出任务清单'] },
        { id: 'quality-revision', label: '质量闸门与返修诚实性', score: 91, weight: 0.2, evidence: ['质量闸门 91'], gaps: ['真实运行日志'], nextMoves: ['保存运行摘要'] },
        { id: 'master-prd-fullstack', label: '大师级全栈 PRD 与技术蓝图', score: 90, weight: 0.14, evidence: ['全栈章节已覆盖'], gaps: ['抽查任务拆解'], nextMoves: ['复验 PRD'] },
        { id: 'runtime-validation', label: '真实运行与用户验证', score: 84, weight: 0.12, evidence: ['自动化测试通过'], gaps: ['缺 5-8 人稳审真实小白用户验证'], nextMoves: ['做用户验证'] },
      ],
      mustNotClaimYet: ['不能声称已经通过真实小白用户验证。'],
      nextSprint: [{ label: '5-8 人小白稳审验证', ownerHint: 'Boss + 研究席位', proof: '至少 5 人留证且 4 人完成一次闭环。' }],
      proofChain: ['selection=6 seats', 'quality=91/approved'],
    }

    const html = renderToStaticMarkup(<CouncilExcellenceAuditView audit={audit} />)

    expect(html).toContain('95 分卓越审计')
    expect(html).toContain('不自欺评分')
    expect(html).toContain('真实运行与用户验证')
    expect(html).toContain('不能声称已经通过真实小白用户验证')
  })

  it('renders XiaoBai runtime evidence ledger for full-chain proof', () => {
    const ledger: CouncilRuntimeEvidenceLedger = {
      runId: 'xiaobai-runtime-test',
      startedAt: '2026-05-05T00:00:00.000Z',
      completedAt: '2026-05-05T00:02:00.000Z',
      durationMs: 120000,
      decisionSource: 'deep-model',
      modelJudgeUsed: true,
      fallbackUsed: false,
      stageTrace: [],
      messageCount: 42,
      briefCount: 36,
      sceneCount: 42,
      relationCount: 36,
      verdictLedgerCount: 20,
      qualityStatus: 'approved',
      qualityScore: 94,
      actionTaskCount: 10,
      baoyuPlanCount: 5,
      localSvgCardCount: 1,
      internetResearchRequired: false,
      internetResearchGrounded: false,
      internetSourceCount: 0,
      internetQueries: [],
      deepRunCertification: {
        status: 'proved',
        label: '2-5 分钟深度长跑已认证',
        requiredDurationMs: 120000,
        actualDurationMs: 120000,
        modelJudgeUsed: true,
        modelJudgeTraceVerified: true,
        fullStageTrace: true,
        stageTraceVerified: true,
        temporalTraceVerified: true,
        enoughDebate: true,
        enoughQuality: true,
        proofSummary: '本轮具备 deep-model 裁判、完整匹配 trace、足量辩论剧场、90+ 质量闸门和 2 分钟以上运行时长。',
        blockers: [],
      },
      replayFrames: [
        {
          id: 'match',
          atMs: 1000,
          source: 'match-gate',
          title: '模型裁判',
          status: 'proved',
          summary: '模型裁判完成编队。',
          evidenceRefs: ['jobs-product-director'],
        },
        {
          id: 'quality',
          atMs: 90000,
          source: 'quality-gate',
          title: '质量闸门',
          status: 'proved',
          summary: 'quality=94，status=approved。',
          evidenceRefs: ['quality-gate'],
        },
      ],
      evidenceItems: [
        { id: 'deep-match', label: '深度匹配裁判', status: 'proved', detail: 'MatchGate 使用 deep-model。' },
        { id: 'users', label: '真实用户验证', status: 'missing', detail: '等待 5-8 人小白稳审验证。' },
      ],
      exportProof: ['导出包含运行证据。'],
      nextProofNeeded: ['真实小白用户验证: 仍需要 5-8 人稳审，至少 5 人完成记录且 4 人完成一次闭环。'],
    }

    const html = renderToStaticMarkup(<CouncilRuntimeEvidenceView ledger={ledger} />)

    expect(html).toContain('真实运行证据账本')
    expect(html).toContain('deep-model')
    expect(html).toContain('深度长跑认证')
    expect(html).toContain('真实运行回放')
    expect(html).toContain('阶段 trace')
    expect(html).toContain('真实小白用户验证')
  })

  it('renders XiaoBai runtime history as replayable local proof records', () => {
    const history: CouncilRuntimeHistoryLedger = {
      stats: {
        totalRuns: 2,
        provedDeepRuns: 1,
        partialDeepRuns: 1,
        fallbackRuns: 0,
        bestQualityScore: 95,
        latestRunAt: '2026-05-05T00:03:00.000Z',
      },
      records: [
        {
          id: 'runtime-history-run-a',
          runId: 'run-a',
          savedAt: '2026-05-05T00:03:00.000Z',
          problemPreview: '做一个真实长跑历史',
          teamSummary: ['产品导演｜主持席', '第一性原理｜工程席'],
          decisionSource: 'deep-model',
          deepRunStatus: 'proved',
          deepRunLabel: '2-5 分钟深度长跑已认证',
          durationMs: 130000,
          qualityScore: 95,
          qualityStatus: 'approved',
          excellenceScore: 94,
          nuwaLocalReady: '6/6',
          proofSummary: '深度长跑已认证。',
          blockers: [],
          ledger: {
            runId: 'run-a',
            startedAt: '2026-05-05T00:00:00.000Z',
            completedAt: '2026-05-05T00:02:10.000Z',
            durationMs: 130000,
            decisionSource: 'deep-model',
            modelJudgeUsed: true,
            fallbackUsed: false,
            stageTrace: [],
            messageCount: 24,
            briefCount: 18,
            sceneCount: 24,
            relationCount: 18,
            verdictLedgerCount: 12,
            qualityStatus: 'approved',
            qualityScore: 95,
            actionTaskCount: 12,
            baoyuPlanCount: 5,
            localSvgCardCount: 1,
            internetResearchRequired: false,
            internetResearchGrounded: false,
            internetSourceCount: 0,
            internetQueries: [],
            deepRunCertification: {
              status: 'proved',
              label: '2-5 分钟深度长跑已认证',
              requiredDurationMs: 120000,
              actualDurationMs: 130000,
              modelJudgeUsed: true,
              modelJudgeTraceVerified: true,
              fullStageTrace: true,
              stageTraceVerified: true,
              temporalTraceVerified: true,
              enoughDebate: true,
              enoughQuality: true,
              proofSummary: '深度长跑已认证。',
              blockers: [],
            },
            replayFrames: [],
            evidenceItems: [],
            exportProof: [],
            nextProofNeeded: [],
          },
        },
      ],
    }

    const html = renderToStaticMarkup(<CouncilRuntimeHistoryView history={history} onClear={() => {}} />)

    expect(html).toContain('真实长跑历史')
    expect(html).toContain('本地复验证据')
    expect(html).toContain('proved 长跑')
    expect(html).toContain('2-5 分钟深度长跑已认证')
  })

  it('renders XiaoBai runtime wisdom as next-run constraints, not a static score', () => {
    const wisdom: CouncilRuntimeWisdomContext = {
      historyCount: 1,
      confidence: 0.72,
      lastRunId: 'run-wisdom',
      intelligenceSignals: [
        {
          id: 'fallback-seen',
          label: '历史出现 fallback',
          severity: 'high',
          evidence: '上一轮使用 local-fallback，下一轮必须优先检查模型裁判链路。',
        },
      ],
      avoidRepeating: ['不要把 local-fallback 当成模型深度裁判。'],
      nextRunConstraints: ['匹配阶段必须产生 6 个 stage trace。'],
      requiredProof: ['本轮结束后必须保存 runtime history record。'],
      promptFragment: '## 运行智慧反馈',
      summary: '已从 1 次运行学习。',
    }

    const html = renderToStaticMarkup(<CouncilRuntimeWisdomView wisdom={wisdom} />)

    expect(html).toContain('运行智慧反馈')
    expect(html).toContain('自我进化约束')
    expect(html).toContain('历史不是摆设')
    expect(html).toContain('不要重复')
    expect(html).toContain('local-fallback')
  })

  it('renders XiaoBai 95 runtime calibration protocol with stop conditions', () => {
    const plan: CouncilRuntimeCalibrationPlan = {
      score: 64,
      status: 'needs-baseline',
      label: '需要第一条真实深度基线',
      summary: '需要第一条真实深度基线。当前校准分 64/100。',
      checks: [
        {
          id: 'deep-model-source',
          label: '真实模型裁判链路',
          status: 'fail',
          score: 48,
          proof: '历史中有 fallback。',
          requiredAction: '下一轮必须显式保存 decisionSource=deep-model。',
        },
      ],
      nextDeepRunProtocol: ['使用真实问题，不用样例题。'],
      userValidationProtocol: ['找 5-8 个没有参与设计的外部真人小白用户。'],
      stopConditions: ['模型裁判失败并进入 local-fallback：停止 95 认证。'],
      modelRunInputHints: ['不要把 fallback 当深度裁判。'],
      promptFragment: '## 95 真实长跑评测协议',
    }

    const html = renderToStaticMarkup(<CouncilRuntimeCalibrationView plan={plan} />)

    expect(html).toContain('95 真实长跑评测协议')
    expect(html).toContain('不伪造通过')
    expect(html).toContain('停止条件')
    expect(html).toContain('local-fallback')
    expect(html).toContain('真实小白用户验证')
  })

  it('renders XiaoBai user validation ledger and input checklist', () => {
    const ledger: CouncilUserValidationLedger = {
      stats: {
        totalRecords: 1,
        totalParticipants: 5,
        passedParticipants: 4,
        failedParticipants: 1,
        certificationStatus: 'passed',
        requiredParticipants: 5,
        requiredPasses: 4,
        passRate: 80,
        unresolvedRepairs: 0,
        lastValidatedAt: '2026-05-05T00:03:00.000Z',
      },
      records: [
        {
          id: 'validation-1',
          savedAt: '2026-05-05T00:03:00.000Z',
          runId: 'run-1',
          problemPreview: '做一个真实有效的智囊团',
          participantAlias: '小白用户 A',
          taskPrompt: '输入问题，看懂推荐编队，导出结果。',
          completionMinutes: 2.7,
          observerAlias: '观察员 B',
          participantKind: 'external-human',
          completedInput: true,
          understoodMatchReason: true,
          foundNextAction: true,
          namedCutAndKeptReason: true,
          exportedOutcome: true,
          usedRealProblem: true,
          uncoachedAttempt: true,
          consentAndPrivacyConfirmed: true,
          participantSummary: '我能看懂这个智囊团为什么这样编队。',
          nextActionEvidence: '用户找到了下一步行动任务。',
          cutAndKeptEvidence: '用户说出一个保留理由和一个裁掉方向。',
          exportedArtifactRef: 'prd-run-1.md',
          finalWorthUsing: true,
          passed: true,
          failureReasons: [],
        },
      ],
    }

    const html = renderToStaticMarkup(
      <CouncilUserValidationView ledger={ledger} problem="真实问题" onSave={() => {}} onClear={() => {}} />,
    )

    expect(html).toContain('真实小白用户验证账本')
    expect(html).toContain('已过线')
    expect(html).toContain('能看懂推荐编队理由')
    expect(html).toContain('记录一次真实验证')
  })

  it('renders XiaoBai Nuwa evidence registry with honest source-audit gaps', () => {
    const registry = buildCouncilNuwaEvidenceRegistry(COUNCIL_PERSONAS.slice(0, 3), '2026-05-05T00:00:00.000Z')
    const html = renderToStaticMarkup(<CouncilNuwaEvidenceView registry={registry} />)

    expect(html).toContain('Nuwa 蒸馏证据总账')
    expect(html).toContain('不是一句“已蒸馏”')
    expect(html).toContain('人工来源级复核')
    expect(html).toContain('0/3')
    expect(html).toContain('现在不能声称')
  })

  it('renders XiaoBai Nuwa source audit ledger with manual review controls', () => {
    const persona = COUNCIL_PERSONAS[0]
    const ledger: CouncilNuwaSourceAuditLedger = {
      records: [
        {
          id: 'source-audit-smoke-1',
          personaId: persona.id,
          personaName: persona.name,
          reviewerAlias: 'Boss',
          savedAt: '2026-05-05T00:00:00.000Z',
          sourceIndexSummary: '已核对著作/长文、访谈、表达 DNA、他者评价、真实决策、时间线六路来源索引。',
          checkedSkillMd: true,
          checkedEvidenceMd: true,
          checkedSixStreams: true,
          validationQuestionsRun: 2,
          uncertaintyBoundaryConfirmed: true,
          noAuthorizationClaimConfirmed: true,
          passed: true,
          failureReasons: [],
        },
      ],
      stats: {
        totalRecords: 1,
        auditedPersonaCount: 1,
        failedRecordCount: 0,
        personaCount: 2,
        coverageRatio: 50,
        latestAuditAt: '2026-05-05T00:00:00.000Z',
      },
    }
    const registry = buildCouncilNuwaEvidenceRegistry(COUNCIL_PERSONAS.slice(0, 2), '2026-05-05T00:00:00.000Z', ledger)
    const preflight: CouncilNuwaLocalPreflightReport = {
      generatedAt: '2026-05-05T00:00:00.000Z',
      rootPath: '.',
      personaCount: 2,
      localReadyCount: 2,
      localBlockedCount: 0,
      autoSourceClaimReadyCount: 0,
      templateOnlyResearchFileCount: 12,
      averageLocalPackageScore: 94,
      averageSourceIndexDepthScore: 24,
      summary: '2/2 位通过本地 Nuwa 包预检；自动来源审计通过 0/2 位。',
      hardTruth: ['自动预检不能替代人工来源级复核，也不能替代真实 Boss 使用后的验证。'],
      gapTo95: ['来源级深蒸馏仍需要逐人补来源、摘录、日期和人工复核。'],
      reports: [
        {
          personaId: persona.id,
          personaName: persona.name,
          canonicalName: persona.realHumanBasis.displayName,
          packagePath: `.openbasaka/nuwa-council/${persona.id}`,
          packageStatus: 'ready',
          canUseAsLocalSkill: true,
          canClaimSourceAudit: false,
          localPackageScore: 94,
          sourceIndexDepthScore: 24,
          overallPreflightScore: 67,
          validationQuestionsFound: 5,
          mentalModelsFound: 4,
          decisionHeuristicsFound: 10,
          honestBoundaryFound: true,
          noAuthorizationBoundaryFound: true,
          fileStatuses: [],
          researchStreams: [
            {
              id: 'writings',
              label: '著作 / 长文',
              path: '.openbasaka/nuwa-council/x/references/research/01-writings.md',
              present: true,
              hasVerificationRule: true,
              hasPublicBasis: true,
              hasDistilledSignals: true,
              hasUrlOrCitation: false,
              hasProvenanceFields: false,
              templateOnly: true,
              depthScore: 24,
              detail: '只有本地蒸馏快照。',
            },
          ],
          missingProof: ['六路来源索引还没有足够 URL、摘录、出版信息或访问日期。'],
          nextProof: ['补来源。'],
          warnings: ['存在模板化研究槽位。'],
        },
      ],
    }
    const html = renderToStaticMarkup(
      <CouncilNuwaSourceAuditView
        registry={registry}
        ledger={ledger}
        onSave={() => {}}
        onClear={() => {}}
        preflight={preflight}
        onRunPreflight={() => {}}
      />,
    )

    expect(html).toContain('Nuwa 来源级人工复核账本')
    expect(html).toContain('不把模板当证据')
    expect(html).toContain('运行本地包预检')
    expect(html).toContain('自动预检不能替代人工来源级复核')
    expect(html).toContain('模板槽位')
    expect(html).toContain('source-audit-ready')
    expect(html).toContain('保存来源复核')
    expect(html).toContain('已核对六路来源索引')
    expect(html).toContain(persona.name)
  })

  it('renders XiaoBai 95 certification gate as a hard evidence claim guard', () => {
    const registry = buildCouncilNuwaEvidenceRegistry(COUNCIL_PERSONAS.slice(0, 2), '2026-05-05T00:00:00.000Z')
    const gate = buildCouncil95CertificationGate({
      selection: null,
      runtimeCalibrationPlan: {
        score: 64,
        status: 'needs-baseline',
        label: '需要第一条真实深度基线',
        summary: '需要第一条真实深度基线。',
        checks: [],
        nextDeepRunProtocol: [],
        userValidationProtocol: [],
        stopConditions: [],
        modelRunInputHints: [],
        promptFragment: '## 95',
      },
      userValidationLedger: {
        records: [],
        stats: {
          totalRecords: 0,
          totalParticipants: 0,
          passedParticipants: 0,
          failedParticipants: 0,
          certificationStatus: 'missing',
          requiredParticipants: 5,
          requiredPasses: 4,
          passRate: 0,
          unresolvedRepairs: 0,
        },
      },
      artifactReviewLedger: {
        records: [],
        stats: {
          totalReviews: 0,
          passedReviews: 0,
          failedReviews: 0,
          certificationStatus: 'missing',
          requiredReviews: 2,
          requiredPasses: 2,
          bossFinalPassed: false,
          peerReviewPassed: false,
          averageScore: 0,
          prdAverageScore: 0,
          theaterAverageScore: 0,
          baoyuAverageScore: 0,
          trustAverageScore: 0,
          unresolvedRepairs: 0,
        },
      },
      nuwaEvidenceRegistry: registry,
      sourceAuditLedger: {
        records: [],
        stats: {
          totalRecords: 0,
          auditedPersonaCount: 0,
          failedRecordCount: 0,
          personaCount: 2,
          coverageRatio: 0,
        },
      },
      generatedAt: '2026-05-05T00:00:00.000Z',
    })
    const html = renderToStaticMarkup(<Council95CertificationView gate={gate} />)

    expect(html).toContain('95 真实认证闸门')
    expect(html).toContain('用证据允许声称')
    expect(html).toContain('禁止声称已达 95')
    expect(html).toContain('真实 deep-model 深度长跑')
    expect(html).toContain('真实小白用户验证')
  })

  it('renders the XiaoBai acceptance loop and artifact review surfaces for 95 validation', () => {
    const acceptanceHtml = renderToStaticMarkup(
      <CouncilAcceptanceReviewView
        review={{
          generatedAt: '2026-05-05T00:00:00.000Z',
          status: 'needs-human-validation',
          label: '机器证据接近，但缺真人与审美验收',
          score: 93,
          claimAllowed: false,
          summary: '当前总验收 93/100；不能把缺少真人验证或审美验收的产物伪装成 95。',
          gates: [
            {
              id: 'deep-run-revalidation',
              label: '2-5 分钟新版本深度长跑复验',
              status: 'pass',
              score: 96,
              hardGate: true,
              proof: 'run-ok',
              requiredProof: '120-360s deep-model trace',
            },
            {
              id: 'real-user-validation',
              label: '真实小白用户验证',
              status: 'fail',
              score: 42,
              hardGate: true,
              proof: '0/0',
              requiredProof: '至少 5 名小白用户',
            },
          ],
          nextActions: ['至少 5 名小白用户'],
          deepRunProtocol: ['跑真实题'],
          humanValidationProtocol: ['人工审美验收必须逐项确认'],
          proofChain: ['runtime=run-ok'],
        }}
      />,
    )
    const artifactHtml = renderToStaticMarkup(
      <CouncilArtifactReviewView
        ledger={{
          records: [],
          stats: {
            totalReviews: 0,
            passedReviews: 0,
            failedReviews: 0,
            certificationStatus: 'missing',
            requiredReviews: 2,
            requiredPasses: 2,
            bossFinalPassed: false,
            peerReviewPassed: false,
            averageScore: 0,
            prdAverageScore: 0,
            theaterAverageScore: 0,
            baoyuAverageScore: 0,
            trustAverageScore: 0,
            unresolvedRepairs: 0,
          },
        }}
        latestRunId="run-ok"
        onSave={() => {}}
      />,
    )

    expect(acceptanceHtml).toContain('95 验收闭环总闸门')
    expect(acceptanceHtml).toContain('2-5 分钟新版本深度长跑复验')
    expect(acceptanceHtml).toContain('真实小白用户验证')
    expect(artifactHtml).toContain('人工审美与产物验收')
    expect(artifactHtml).toContain('记录一次人工审美验收')
    expect(artifactHtml).toContain('愿意用于真实规划')
  })

  it('starts XiaoBai matching and council debate from one button', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    installMockLocalStorage()
    matchGateMock.runCouncilMatchGate.mockReset()
    councilWorkflowMock.runCouncilPrdWorkflow.mockReset()
    matchGateMock.runCouncilMatchGate.mockImplementation(async (input: any, options: any) => {
      options?.onProgress?.({
        phaseId: 'problem-profile',
        label: '问题画像',
        status: 'completed',
        detail: '识别到 product / strategy。',
        candidatePersonaIds: [],
        startedAt: 1,
        endedAt: 2,
      })
      options?.onProgress?.({
        phaseId: 'model-judge',
        label: '模型裁判',
        status: 'completed',
        detail: '模型裁判已完成编队取舍。',
        candidatePersonaIds: ['jobs-product-director'],
        startedAt: 3,
        endedAt: 4,
        decisionSource: 'deep-model',
      })
      const problem = typeof input === 'string' ? input : input.problem
      return {
        ...selectCouncilTeam(problem),
        matchGate: {
          ...selectCouncilTeam(problem).matchGate,
          decisionSource: 'deep-model',
          judgeSummary: '模型裁判已完成深度匹配。',
          stageTrace: [],
          creativeDnaUsed: true,
          styleContextUsed: true,
        },
      }
    })
    councilWorkflowMock.runCouncilPrdWorkflow.mockImplementation(async (input: any) => {
      input.onSnapshot?.({
        id: 'snapshot-one-key',
        status: 'team-ready',
        headline: '一键开始后已经进入六阶段会场',
        detail: '系统没有停在推荐编队，正在进入博弈。',
        sceneCount: 0,
        briefCount: 0,
        relationCount: 0,
      })
      return await new Promise(() => {})
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<CouncilMacApp />)
    })

    const textarea = container.querySelector('textarea')
    expect(textarea).toBeTruthy()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter?.call(textarea, '做一个 AI PRD 工具，需要视觉、技术和风险审查')
      textarea?.dispatchEvent(new Event('input', { bubbles: true }))
      textarea?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const startButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.trim() === '开始',
    )
    expect(startButton).toBeTruthy()
    expect(container.textContent).not.toContain('只生成推荐编队')
    await act(async () => {
      startButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(matchGateMock.runCouncilMatchGate).toHaveBeenCalled()
    expect(councilWorkflowMock.runCouncilPrdWorkflow).toHaveBeenCalled()
    expect(container.textContent).toContain('CouncilMatchGate · 深度匹配过程')
    expect(container.textContent).toContain('模型裁判已完成深度匹配')
    expect(container.textContent).toContain('认知导演台')
    expect(container.textContent).toContain('当前张力')
    expect(container.textContent).toContain('实时剧本流')
    expect(container.textContent).toContain('一键开始后已经进入六阶段会场')
    expect(container.textContent).toContain('六阶段博弈')
    expect(container.textContent).toContain('正在博弈')
    expect(container.textContent).not.toContain('智囊团博弈中...')

    await act(async () => {
      root.unmount()
    })
    container.remove()
    matchGateMock.runCouncilMatchGate.mockReset()
    councilWorkflowMock.runCouncilPrdWorkflow.mockReset()
  })

  it('lets Boss continue a non-master PRD through a real rematched council round', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    installMockLocalStorage()
    matchGateMock.runCouncilMatchGate.mockReset()
    councilWorkflowMock.runCouncilPrdWorkflow.mockReset()
    matchGateMock.runCouncilMatchGate.mockImplementation(async (input: any) => {
      const problem = typeof input === 'string' ? input : input.problem
      return {
        ...selectCouncilTeam(problem),
        matchGate: {
          ...selectCouncilTeam(problem).matchGate,
          decisionSource: 'deep-model',
          judgeSummary: '模型裁判已重新匹配大师组合。',
          stageTrace: [],
          creativeDnaUsed: true,
          styleContextUsed: true,
        },
      }
    })
    const selection = selectCouncilTeam('做一个星际番茄钟 iOS App')
    const weakPrd = [
      '## 产品定位与北极星',
      '目标用户是深度工作者，痛点是倒计时焦虑，成功标准是完成率。',
      '## P0/P1/P2 与不做清单',
      'P0 App 内启动；页面包括今日跃迁；组件有空态、加载态、失败态。',
    ].join('\n')
    const weakResult = {
      selection,
      matchGate: selection.matchGate,
      activatedAgents: [],
      preferredStyleIds: [],
      agentDreamStates: [],
      team: { id: 'team-test', name: '小白智囊团', agents: [] },
      session: { id: 'session-weak', topic: '星际番茄钟', summary: weakPrd, tags: [], messages: [] },
      baoyuVisualPlans: [],
      qualityGate: {
        gateId: 'gate-weak',
        status: 'approved',
        finalGateStatus: 'approved',
        score: 100,
        prdCompletenessScore: 100,
        launchReadinessScore: 100,
        summary: '质量闸门结构通过，但大师级开工判定仍需补市场、UI、工程闭环。',
        checks: [{ id: 'structure', label: '结构完整度', status: 'pass', score: 100, evidence: ['结构覆盖'], requiredFixes: [] }],
        typedDeliberation: [],
      },
      debateScenes: [],
      debateMap: { nodes: [], edges: [], summary: '暂无关系' },
      verdictLedger: { kept: [], cut: [], revised: [], evidenceGaps: [], prdImpacts: [], openDisagreements: [], summary: '裁决账本' },
      qualityRevisionHistory: [],
      runtimeEvidence: {
        runId: 'run-weak',
        startedAt: '2026-05-15T00:00:00.000Z',
        completedAt: '2026-05-15T00:02:00.000Z',
        durationMs: 120000,
        decisionSource: 'deep-model',
        modelJudgeUsed: true,
        fallbackUsed: false,
        stageTrace: [],
        messageCount: 6,
        briefCount: 6,
        sceneCount: 6,
        relationCount: 0,
        verdictLedgerCount: 0,
        qualityStatus: 'approved',
        qualityScore: 100,
        actionTaskCount: 0,
        baoyuPlanCount: 0,
        localSvgCardCount: 0,
        internetResearchRequired: false,
        internetResearchGrounded: false,
        internetSourceCount: 0,
        internetQueries: [],
        deepRunCertification: {
          status: 'proved',
          label: '测试长跑已认证',
          requiredDurationMs: 120000,
          actualDurationMs: 120000,
          modelJudgeUsed: true,
          modelJudgeTraceVerified: true,
          fullStageTrace: true,
          stageTraceVerified: true,
          temporalTraceVerified: true,
          enoughDebate: true,
          enoughQuality: true,
          proofSummary: '测试证据完整。',
          blockers: [],
        },
        replayFrames: [],
        evidenceItems: [],
        exportProof: [],
        nextProofNeeded: [],
      },
      runtimeWisdomContext: undefined,
      runtimeCalibrationPlan: undefined,
      nuwaEvidenceRegistry: buildCouncilNuwaEvidenceRegistry(selection.seats.map((seat) => seat.persona)),
      excellenceAudit: undefined,
      masterPrdValidation: undefined,
      consensusTrace: undefined,
    }
    councilWorkflowMock.runCouncilPrdWorkflow
      .mockResolvedValueOnce(weakResult)
      .mockImplementationOnce(async () => await new Promise(() => {}))

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<CouncilMacApp />)
    })
    const textarea = container.querySelector('textarea')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter?.call(textarea, '做一个星际穿越主题番茄时间 iOS App')
      textarea?.dispatchEvent(new Event('input', { bubbles: true }))
      textarea?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => {
      container.querySelector('.council-app__primary')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain('PRD 候选稿已生成，需按大师级缺口返修')
    const continueButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('继续探讨到大师级候选'),
    )
    expect(continueButton).toBeTruthy()

    await act(async () => {
      continueButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(matchGateMock.runCouncilMatchGate).toHaveBeenCalledTimes(2)
    expect(councilWorkflowMock.runCouncilPrdWorkflow).toHaveBeenCalledTimes(2)
    const secondInput = councilWorkflowMock.runCouncilPrdWorkflow.mock.calls[1][0]
    expect(secondInput.problem).toContain('继续探讨直到大师级候选 PRD')
    expect(secondInput.problem).toContain('不允许把上一轮结果简单润色后冒充新结论')
    expect(secondInput.problem).toContain('上一轮评分')
    expect(container.textContent).toContain('Boss 要继续探讨直到大师级候选')

    await act(async () => {
      root.unmount()
    })
    container.remove()
    matchGateMock.runCouncilMatchGate.mockReset()
    councilWorkflowMock.runCouncilPrdWorkflow.mockReset()
  })

  it('opens the XiaoBai council replay modal when real-time debate starts', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    installMockLocalStorage()
    matchGateMock.runCouncilMatchGate.mockReset()
    councilWorkflowMock.runCouncilPrdWorkflow.mockReset()
    matchGateMock.runCouncilMatchGate.mockImplementation(async (input: any, options: any) => {
      options?.onProgress?.({
        phaseId: 'problem-profile',
        label: '问题画像',
        status: 'completed',
        detail: '识别到 product / strategy。',
        candidatePersonaIds: [],
        startedAt: 1,
        endedAt: 2,
      })
      options?.onProgress?.({
        phaseId: 'model-judge',
        label: '模型裁判',
        status: 'completed',
        detail: '模型裁判已完成编队取舍。',
        candidatePersonaIds: ['jobs-product-director'],
        startedAt: 3,
        endedAt: 4,
        decisionSource: 'deep-model',
      })
      const problem = typeof input === 'string' ? input : input.problem
      return {
        ...selectCouncilTeam(problem),
        matchGate: {
          ...selectCouncilTeam(problem).matchGate,
          decisionSource: 'deep-model',
          judgeSummary: '模型裁判已完成深度匹配。',
          stageTrace: [],
          creativeDnaUsed: true,
          styleContextUsed: true,
        },
      }
    })
    councilWorkflowMock.runCouncilPrdWorkflow.mockImplementation(async (input: any) => {
      input.onSnapshot?.({
        id: 'snapshot-replay-test',
        status: 'phase-start',
        phaseId: 'clarify',
        phaseLabel: '追问',
        headline: '追问开始：先逼出真正问题',
        detail: '主持人要求先确认目标、边界和验收。',
        agentName: '主持席',
        sceneCount: 1,
        briefCount: 0,
        relationCount: 0,
        latestClaim: '先问清楚再写 PRD。',
        latestObjection: '',
      })
      return await new Promise(() => {})
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<CouncilMacApp />)
    })

    const textarea = container.querySelector('textarea')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter?.call(textarea, '做一个女性天气包包 iOS App，需要产品、技术、审美、风险和增长一起裁判')
      textarea?.dispatchEvent(new Event('input', { bubbles: true }))
      textarea?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => {
      container.querySelector('.council-app__primary')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(matchGateMock.runCouncilMatchGate).toHaveBeenCalled()
    expect(councilWorkflowMock.runCouncilPrdWorkflow).toHaveBeenCalled()
    expect(container.querySelector('.council-replay-modal')).toBeFalsy()
    const replayButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('过程回看'))
    expect(replayButton).toBeTruthy()
    await act(async () => {
      replayButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.textContent).toContain('实时博弈 · 过程回看')
    expect(container.textContent).toContain('追问开始：先逼出真正问题')
    expect(container.textContent).toContain('上一页')
    expect(container.textContent).toContain('下一页')
    expect(container.querySelector('.council-replay-modal__filmstrip')).toBeTruthy()

    await act(async () => {
      root.unmount()
    })
    container.remove()
    matchGateMock.runCouncilMatchGate.mockReset()
    councilWorkflowMock.runCouncilPrdWorkflow.mockReset()
  })

  it('shows a replay start frame in the main page without auto-opening the process viewer', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    installMockLocalStorage()
    matchGateMock.runCouncilMatchGate.mockReset()
    councilWorkflowMock.runCouncilPrdWorkflow.mockReset()
    matchGateMock.runCouncilMatchGate.mockImplementation(async (input: any) => {
      const problem = typeof input === 'string' ? input : input.problem
      return {
        ...selectCouncilTeam(problem),
        matchGate: {
          ...selectCouncilTeam(problem).matchGate,
          decisionSource: 'deep-model',
          judgeSummary: '模型裁判已完成深度匹配。',
          stageTrace: [],
          creativeDnaUsed: true,
          styleContextUsed: true,
        },
      }
    })
    councilWorkflowMock.runCouncilPrdWorkflow.mockImplementation(async () => await new Promise(() => {}))

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<CouncilMacApp />)
    })

    const textarea = container.querySelector('textarea')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter?.call(textarea, '做一个女性天气包包 iOS App，需要产品、技术、审美、风险和增长一起裁判')
      textarea?.dispatchEvent(new Event('input', { bubbles: true }))
      textarea?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => {
      container.querySelector('.council-app__primary')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(councilWorkflowMock.runCouncilPrdWorkflow).toHaveBeenCalled()
    expect(container.querySelector('.council-replay-modal')).toBeFalsy()
    expect(container.textContent).toContain('过程回看')
    expect(container.textContent).toContain('Boss 已点击开始，六阶段博弈已激活')
    expect(container.textContent).toContain('开始不是停在等待页')
    expect(container.textContent).toContain('正在博弈')
    expect(container.textContent).not.toContain('等待大师发言形成第一幕')

    await act(async () => {
      root.unmount()
    })
    container.remove()
    matchGateMock.runCouncilMatchGate.mockReset()
    councilWorkflowMock.runCouncilPrdWorkflow.mockReset()
  })

  it('opens a XiaoBai council persona dossier with dynamic dream and local profile summaries', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<CouncilMacApp />)
    })

    const card = container.querySelector('.council-app__hidden-persona')
    expect(card).toBeTruthy()

    await act(async () => {
      card?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain('独立角色档案')
    expect(container.textContent).toContain('当前动态 Dream')
    expect(container.textContent).toContain('正在把私有记忆转成动态 dream')
    expect(container.textContent).toContain('证据包缺口')
    expect(container.textContent).toContain('现在不能声称')
    expect(container.textContent).toContain('私有记忆短摘')

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

})
