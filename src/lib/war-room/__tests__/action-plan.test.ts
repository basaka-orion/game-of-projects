import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredProject } from '../../db/store'
import { dbListOperatingEvents } from '../../db/repository'
import { buildWarRoomActionPlan, materializeWarRoomActionPlan } from '../action-plan'

function createStorage() {
  const data = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key)
    }),
    clear: vi.fn(() => {
      data.clear()
    }),
  }
}

function makeProject(overrides: Partial<StoredProject> = {}): StoredProject {
  return {
    id: 'project-warroom-1',
    title: 'External Brain OS',
    oneLiner: '本地优先的个人外脑操作系统',
    tags: ['AI', 'memory', 'agent'],
    radar: {
      era_fit: 82,
      boss_match: 76,
      monetization: 62,
      tech_breakthrough: 78,
      resource_cost: 66,
      risk_index: 68,
    },
    survivalRate: 72,
    survivalGrade: 'A',
    summary: '项目主线成立，但需要更强执行闭环。',
    recommendation: '先做一周验证实验，证明启蒙、知识、推演和执行能串成闭环。',
    warLogs: [],
    rawContent: '',
    isPinned: false,
    isStarred: false,
    priorityLevel: 'normal',
    createdAt: '2026-04-25T00:00:00.000Z',
    updatedAt: '2026-04-25T00:00:00.000Z',
    ...overrides,
  }
}

describe('war room action plan', () => {
  beforeEach(() => {
    const localStorage = createStorage()
    vi.stubGlobal('localStorage', localStorage)
    vi.stubGlobal('window', { localStorage })
  })

  it('turns a project verdict into hypotheses, risks, actions, metrics, and ledger events', async () => {
    const plan = buildWarRoomActionPlan({
      project: makeProject(),
      nextActions: ['把推演结果拆成可执行任务'],
      roleSignals: [{ roleName: '批判者', risks: ['容易过度设计'], opportunities: ['已有本地数据厚度'] }],
    })

    expect(plan.hypotheses).toHaveLength(3)
    expect(plan.risks.some((item) => item.detail.includes('容易过度设计'))).toBe(true)
    expect(plan.actions.map((item) => item.taskType)).toEqual(['agent-task', 'agent-task', 'research', 'custom'])
    expect(plan.metrics).toHaveLength(3)

    const materialized = await materializeWarRoomActionPlan(plan)
    const events = await dbListOperatingEvents(10)

    expect(materialized.taskIds).toHaveLength(4)
    expect(materialized.eventIds).toHaveLength(5)
    expect(events.some((event) => event.type === 'project_signal' && event.stage === 'simulate')).toBe(true)
    expect(events.filter((event) => event.type === 'agent_action' && event.stage === 'execute')).toHaveLength(4)
  })
})
