import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { AgentExecutionReceipt } from '../../../lib/agents/execution-receipt'
import type { OperatingEventRow } from '../../../lib/db/repository'
import { OPENBASAKA_SANDBOX_MENU_ITEMS } from '../../Openbasaka/sandbox-menu'
import { SIDEBAR_ITEMS } from '../sidebar'
import ControlPanelTab from '../tabs/ControlPanelTab'
import OverviewTab from '../tabs/OverviewTab'

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
      '知识库',
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
})
