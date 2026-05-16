import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createOpenbasakaDreamSeedState,
  loadOpenbasakaDreamState,
  renderDreamDiaryCard,
  runOpenbasakaDreamCycle,
  type OpenbasakaDreamReportContext,
} from '../dream'
import type { OperatingEventRow } from '../../db/repository'

const dbMock = vi.hoisted(() => ({
  query: vi.fn(async () => [] as any[]),
  run: vi.fn(async (..._args: any[]) => {}),
  dbListOperatingEvents: vi.fn(async () => [] as any[]),
  dbSaveOperatingEvent: vi.fn(async (draft: any) => draft.id || 'op-dream'),
}))

vi.mock('../../db/repository', () => ({
  query: dbMock.query,
  run: dbMock.run,
  dbListOperatingEvents: dbMock.dbListOperatingEvents,
  dbSaveOperatingEvent: dbMock.dbSaveOperatingEvent,
}))

function operatingEvent(id: string, sourceId: string, createdAt: string, summary = '完成一次有证据的系统执行。'): OperatingEventRow {
  return {
    id,
    type: 'agent_action',
    stage: 'execute',
    title: `运行记录 ${sourceId}`,
    summary,
    source_kind: 'agent',
    source_id: sourceId,
    source_title: sourceId,
    confidence: 0.82,
    entities_json: '[]',
    project_ids_json: '[]',
    payload_json: '{}',
    created_at: createdAt,
    updated_at: createdAt,
  }
}

function reportFixture(overrides: Partial<OpenbasakaDreamReportContext> = {}): OpenbasakaDreamReportContext {
  return {
    id: 'openbasaka-self-audit-2026-05-10',
    generatedAt: '2026-05-10T03:17:00.000Z',
    overallScore: 68,
    headline: 'Openbasaka 主线成立，但学习、执行和可信闭环还需要加厚。',
    domains: [
      {
        id: 'learning_evolution',
        title: '学习 / 进化',
        score: 52,
        summary: '进化能力已经发芽，但自动化和多代理协作还没有成为主驱动。',
        evidence: ['3 条 skill_evolution', '2 条 evolution_events', '夜巡任务已开启'],
        risks: ['学习与修复收据还没有稳定闭环。'],
        nextActions: ['把夜巡、梦境和修复结果都写回长期进化账本。'],
      },
      {
        id: 'memory_wiki',
        title: '记忆 / Wiki',
        score: 61,
        summary: '记忆和 Wiki 有基础，但需要更清楚的证据链。',
        evidence: ['8 条 Wiki 页面', '6 个抽屉'],
        risks: ['部分知识还没编译。'],
        nextActions: ['优先编译高价值来源。'],
      },
    ],
    selfRepairPlans: [
      {
        id: 'repair-learning-loop',
        title: '学习 / 进化 自我修复｜补齐梦境学习闭环',
        priority: 'P0',
        problem: '学习结果还没有稳定回写到长期进化账本。',
        evidence: ['夜巡已生成', '缺少 dream_consolidation'],
        ownerDomain: 'learning_evolution',
        targetSubsystem: 'Hermes-style 学习与 skill_evolution',
        workflowSteps: [
          '复述学习闭环缺口。',
          '检查 operating_events、evolution_events 和 memory_items。',
          '把高置信梦境写成长期进化事件。',
          '下次夜巡读取这次写入并更新分数。',
        ],
        acceptance: ['下一次系统自省能读到 dream_consolidation 事件。'],
        status: 'queued',
      },
    ],
    learningProgress: {
      score: 66,
      summary: '今天有执行证据，但还需要复盘学习。',
      signals: ['执行学习: 3', '复盘: 1'],
    },
    evolutionProgress: {
      score: 52,
      summary: '进化能力已经发芽。',
      signals: ['2 条 evolution_events'],
    },
    modelRouteHealth: [
      {
        label: 'GLM 5.1',
        status: 'invalid-key',
        ok: false,
        message: '401 invalid sk-secret-glm-key-that-should-not-leak',
      },
      {
        label: 'DeepSeek V4',
        status: 'ready',
        ok: true,
        message: '连接成功',
      },
    ],
    ...overrides,
  }
}

describe('openbasaka dream cycle', () => {
  beforeEach(() => {
    dbMock.query.mockReset()
    dbMock.query.mockResolvedValue([])
    dbMock.run.mockClear()
    dbMock.dbListOperatingEvents.mockReset()
    dbMock.dbListOperatingEvents.mockResolvedValue([])
    dbMock.dbSaveOperatingEvent.mockClear()
    dbMock.dbSaveOperatingEvent.mockImplementation(async (draft: any) => draft.id || 'op-dream')
  })

  it('builds light, REM and deep stages from self-audit evidence', async () => {
    const state = await runOpenbasakaDreamCycle({
      report: reportFixture(),
      operatingEvents: [
        operatingEvent('op-1', 'openbasaka-nightly-maintenance', '2026-05-10T02:30:00.000Z'),
        operatingEvent('op-2', 'openbasaka-nightly-maintenance', '2026-05-09T02:30:00.000Z'),
      ],
      evolutionEvents: [],
      now: new Date('2026-05-10T03:17:00.000Z'),
      persist: false,
    })

    expect(state.stages.map(stage => stage.id)).toEqual(['light', 'rem', 'deep'])
    expect(state.candidates.length).toBeGreaterThan(0)
    expect(state.diary).toContain('light')
    expect(state.diary).toContain('REM')
    expect(state.diary).toContain('deep')
    expect(renderDreamDiaryCard(state).phaseLines).toHaveLength(3)
  })

  it('auto-applies high-score deep sleep learning to existing ledgers', async () => {
    const state = await runOpenbasakaDreamCycle({
      report: reportFixture(),
      operatingEvents: [
        operatingEvent('op-1', 'openbasaka-nightly-maintenance', '2026-05-10T02:30:00.000Z'),
        operatingEvent('op-2', 'openbasaka-nightly-maintenance', '2026-05-09T02:30:00.000Z'),
        operatingEvent('op-3', 'openbasaka-self-repair', '2026-05-10T02:50:00.000Z', '已生成修复工作流并写入证据。'),
        operatingEvent('op-4', 'openbasaka-self-repair', '2026-05-08T02:50:00.000Z', '已生成修复工作流并写入证据。'),
      ],
      evolutionEvents: [],
      now: new Date('2026-05-10T03:17:00.000Z'),
    })

    const sqlCalls = dbMock.run.mock.calls.map(call => String(call[0]))
    expect(state.appliedWrites.some(write => write.kind === 'evolution_event')).toBe(true)
    expect(state.appliedWrites.some(write => write.kind === 'memory_item')).toBe(true)
    expect(sqlCalls.some(sql => sql.includes('INSERT OR REPLACE INTO evolution_events'))).toBe(true)
    expect(sqlCalls.some(sql => sql.includes('INSERT OR REPLACE INTO memory_items'))).toBe(true)
    expect(sqlCalls.filter(sql => sql.includes('INSERT OR REPLACE INTO master_skill_patterns')).length).toBeLessThanOrEqual(2)
    expect(dbMock.dbSaveOperatingEvent).toHaveBeenCalledWith(expect.objectContaining({
      source: expect.objectContaining({ sourceId: 'openbasaka-dreaming' }),
      title: expect.stringContaining('梦境日记'),
    }))
  })

  it('handles an empty system history without blank output', async () => {
    const state = await runOpenbasakaDreamCycle({
      report: reportFixture({
        domains: [],
        selfRepairPlans: [],
        modelRouteHealth: [],
      }),
      operatingEvents: [],
      evolutionEvents: [],
      now: new Date('2026-05-10T03:17:00.000Z'),
      persist: false,
    })

    expect(state.stages).toHaveLength(3)
    expect(state.summary).toContain('light 回放 0 条历史')
    expect(state.diary).toContain('不强行写长期记忆')
    expect(renderDreamDiaryCard(state).summary.length).toBeGreaterThan(0)
  })

  it('sanitizes keys and never creates code-changing dream actions', async () => {
    const state = await runOpenbasakaDreamCycle({
      report: reportFixture(),
      operatingEvents: [operatingEvent('op-1', 'openbasaka-nightly-maintenance', '2026-05-10T02:30:00.000Z')],
      evolutionEvents: [],
      now: new Date('2026-05-10T03:17:00.000Z'),
      persist: false,
    })
    const serialized = JSON.stringify(state)

    expect(serialized).not.toContain('sk-secret')
    expect(serialized).not.toContain('api key')
    expect(state.safetyBoundary).toContain('不自动改代码')
    expect(serialized).not.toContain('已修改代码')
  })

  it('loads the latest dream state from the operating ledger', async () => {
    const seed = createOpenbasakaDreamSeedState({
      sourceAuditId: 'audit-1',
      generatedAt: '2026-05-10T03:17:00.000Z',
      headline: '梦境已保存。',
    })
    dbMock.query.mockResolvedValue([
      operatingEvent('op-dream', 'openbasaka-dreaming', '2026-05-10T03:18:00.000Z'),
    ].map(row => ({
      ...row,
      payload_json: JSON.stringify({ dreamState: seed }),
    })))

    const loaded = await loadOpenbasakaDreamState()

    expect(loaded?.id).toBe(seed.id)
    expect(loaded?.title).toContain('昨夜梦境')
  })
})
