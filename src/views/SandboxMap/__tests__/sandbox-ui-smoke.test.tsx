import { renderToStaticMarkup } from 'react-dom/server'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import type { AgentExecutionReceipt } from '../../../lib/agents/execution-receipt'
import type { OperatingEventRow } from '../../../lib/db/repository'
import { UI_STYLE_ITEMS } from '../../../lib/ui-museum/catalog'
import { OPENBASAKA_SANDBOX_MENU_ITEMS } from '../../Openbasaka/sandbox-menu'
import { SIDEBAR_ITEMS } from '../sidebar'
import ControlPanelTab from '../tabs/ControlPanelTab'
import OverviewTab from '../tabs/OverviewTab'
import UIStyleMuseumMacApp, { getUiMuseumStyleRealizationForTest } from '../tabs/ui-museum/UIStyleMuseumMacApp'
import BiliHelperMacApp from '../tabs/bili-helper/BiliHelperMacApp'
import CouncilMacApp from '../tabs/xiaobai-council/CouncilMacApp'

vi.mock('@remotion/player', () => ({
  Player: ({ inputProps }: { inputProps?: { state?: { headline?: string } } }) => (
    <div className="remotion-player-mock">Remotion Guide: {inputProps?.state?.headline || 'waiting'}</div>
  ),
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

describe('sandbox UI smoke contracts', () => {
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
      'teams',
      'xiaobai',
    ])
    expect(SIDEBAR_ITEMS.map((item) => item.label)).toEqual([
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
      '群策',
      '小白',
    ])
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
    expect(html).toContain('Agent 行动')
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

    const loadSampleButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('载入样例'))
    expect(loadSampleButton).toBeTruthy()

    await act(async () => {
      loadSampleButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('如何把一个 B 站视频变成自己的学习包')
    expect(container.textContent).toContain('ARTIFACT DASHBOARD')
    expect(container.textContent).toContain('BAOYU 秒懂视觉')
    expect(container.textContent).toContain('SOURCE NOTEBOOK')
    expect(container.textContent).toContain('LEARNING PACK')
    expect(container.textContent).toContain('归档去向')
    expect(container.textContent).toContain('覆盖矩阵')

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('renders XiaoBai council as a parallel PRD loop surface', () => {
    const html = renderToStaticMarkup(<CouncilMacApp />)

    expect(html).toContain('小白智囊团 · PRD 闭环')
    expect(html).toContain('隐藏思想原型')
    expect(html).toContain('生成推荐编队')
    expect(html).toContain('确认激活')
    expect(html).toContain('隐藏角色库')
    expect(html).toContain('Creative DNA')
    expect(html).toContain('UI风格馆')
    expect(html).toContain('Baoyu')
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
    expect(container.textContent).toContain('私有记忆短摘')

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

})
