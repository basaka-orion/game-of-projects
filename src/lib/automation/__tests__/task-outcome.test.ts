import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dbListOperatingEvents } from '../../db/repository'
import { recordScheduledTaskOutcome } from '../task-outcome'

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

describe('scheduled task outcome writeback', () => {
  beforeEach(() => {
    const localStorage = createStorage()
    vi.stubGlobal('localStorage', localStorage)
    vi.stubGlobal('window', { localStorage })
  })

  it('records WarRoom task results as review events and Boss memory candidates', async () => {
    await recordScheduledTaskOutcome(
      {
        id: 'task-warroom-1',
        name: 'WarRoom｜External Brain OS｜拆一周验证实验',
        taskType: 'agent-task',
        agentId: 'strategy',
        taskConfig: {
          projectId: 'project-warroom-1',
          reviewAt: '2026-05-02',
        },
      },
      {
        status: 'success',
        message: '完成一周实验拆解：先验证启蒙、知识、推演、执行的闭环。',
        durationMs: 318,
      },
    )

    const events = await dbListOperatingEvents(10)
    const outcomeEvent = events.find((event) => event.id.startsWith('op_task_outcome_task-warroom-1'))
    const memoryEvent = events.find((event) => event.type === 'memory_candidate')

    expect(outcomeEvent).toMatchObject({
      type: 'agent_action',
      stage: 'review',
      title: '任务完成：WarRoom｜External Brain OS｜拆一周验证实验',
      source_kind: 'agent',
      source_id: 'task-warroom-1',
    })
    expect(JSON.parse(outcomeEvent?.project_ids_json || '[]')).toEqual(['project-warroom-1'])
    expect(JSON.parse(outcomeEvent?.payload_json || '{}')).toMatchObject({
      receipt: {
        agentId: 'strategy',
        status: 'completed',
        retry: { recommended: false },
      },
    })

    expect(memoryEvent?.summary).toBe('cron:task-warroom-1')
    expect(memoryEvent?.title).toContain('推演执行复盘')
  })

  it('keeps non-project tasks in the event ledger without forcing Boss memory writes', async () => {
    await recordScheduledTaskOutcome(
      {
        id: 'task-report-1',
        name: '每日报告',
        taskType: 'report',
        agentId: 'general',
        taskConfig: {},
      },
      { status: 'error', message: 'LLM API Key 未配置', durationMs: 42 },
    )

    const events = await dbListOperatingEvents(10)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'agent_action',
      stage: 'review',
      title: '任务失败：每日报告',
    })
    expect(JSON.parse(events[0].payload_json)).toMatchObject({
      status: 'failed',
      resultPreview: 'LLM API Key 未配置（42ms）',
    })
  })
})
