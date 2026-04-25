import { describe, expect, it } from 'vitest'
import type { ExecutionLearningSummary } from '../../agents/execution-review'
import type { OperatingEventRow } from '../../db/repository'
import { buildDailyBriefDeck } from '../daily-brief'

function summary(overrides: Partial<ExecutionLearningSummary> = {}): ExecutionLearningSummary {
  return {
    total: 0,
    completed: 0,
    failed: 0,
    highRisk: 0,
    retryRecommended: 0,
    evidenceCoverage: 0,
    averageScore: 0,
    strongestSignal: '等待执行收据',
    nextAction: '先让 Agent 产生第一批可复盘结果。',
    ...overrides,
  }
}

function event(id: string, stage: OperatingEventRow['stage'], createdAt: string): OperatingEventRow {
  return {
    id,
    type: stage === 'execute' ? 'agent_action' : 'memory_candidate',
    stage,
    title: `${stage} event`,
    summary: `${stage} summary`,
    source_kind: 'manual',
    source_id: id,
    source_title: `${stage} source`,
    confidence: 0.8,
    entities_json: '[]',
    project_ids_json: '[]',
    payload_json: '{}',
    created_at: createdAt,
    updated_at: createdAt,
  }
}

describe('daily brief deck', () => {
  it('turns operating-loop state into a daily command brief', () => {
    const deck = buildDailyBriefDeck({
      now: new Date('2026-04-25T08:00:00.000Z'),
      projectCount: 6,
      classifiedProjectCount: 4,
      synapseCount: 5,
      highSignalSynapseCount: 2,
      bossMemoryCount: 8,
      decisionCount: 3,
      pendingArchiveCount: 6313,
      operatingEvents: [
        event('remember-1', 'remember', '2026-04-25T02:00:00.000Z'),
        event('compile-1', 'compile', '2026-04-24T16:00:00.000Z'),
        event('execute-1', 'execute', '2026-04-25T03:00:00.000Z'),
      ],
      executionSummary: summary({
        total: 2,
        completed: 1,
        failed: 1,
        retryRecommended: 1,
        evidenceCoverage: 50,
        averageScore: 61,
      }),
    })

    expect(deck.dateLabel).toBe('2026-04-25')
    expect(deck.sections.map((item) => item.title)).toEqual(['昨日沉淀', '今日行动', '系统缺口', 'Agent 建议'])
    expect(deck.focus).toContain('启蒙收件箱')
    expect(deck.sections[0].items[0]).toMatchObject({ title: '昨日沉淀', value: 2 })
    expect(deck.sections[1].items[0]).toMatchObject({ title: '今日入口', value: 6313, target: 'memory' })
    expect(deck.sections[2].items[0]).toMatchObject({ title: '证据覆盖不足', value: '50%', target: 'knowledge' })
    expect(deck.sections[3].items[0]).toMatchObject({ title: '执行复盘', value: 1, target: 'control' })
  })
})
