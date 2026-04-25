import { describe, expect, it } from 'vitest'
import type { OperatingEventRow } from '../../db/repository'
import type { AgentExecutionReceipt } from '../execution-receipt'
import { buildExecutionLearningDeck, parseAgentExecutionReceipt, scoreExecutionReceipt } from '../execution-review'

function receipt(overrides: Partial<AgentExecutionReceipt> = {}): AgentExecutionReceipt {
  return {
    id: 'receipt-1',
    subject: 'WarRoom｜策略拆解',
    agentId: 'strategy',
    status: 'completed',
    inputPreview: '把项目拆成一周验证实验。',
    outputPreview: '先验证需求，再沉淀证据，最后复盘。',
    tools: [{ id: 'team-engine', label: 'Team Engine', risk: 'low', status: 'completed' }],
    evidenceRefs: [{ kind: 'knowledge', id: 'wiki-1', title: '知识库证据' }],
    cost: { inputChars: 12, outputChars: 18, note: '本地估算。' },
    retry: { recommended: false, reason: '完成', nextStep: '沉淀为项目操作手册。' },
    trust: { risk: 'low', confidence: 0.86, rationale: '有证据引用。' },
    ...overrides,
  }
}

function event(id: string, item: AgentExecutionReceipt): OperatingEventRow {
  return {
    id,
    type: 'agent_action',
    stage: 'execute',
    title: `Agent 执行：${item.subject}`,
    summary: item.outputPreview,
    source_kind: 'agent',
    source_id: item.agentId,
    source_title: item.subject,
    confidence: item.trust.confidence,
    entities_json: JSON.stringify([item.agentId]),
    project_ids_json: '[]',
    payload_json: JSON.stringify({ receipt: item }),
    created_at: '2026-04-25T10:00:00.000Z',
    updated_at: '2026-04-25T10:00:00.000Z',
  }
}

describe('execution review learning layer', () => {
  it('parses receipts from operating events and promotes high-confidence evidence-backed runs', () => {
    const row = event('op-1', receipt())
    const parsed = parseAgentExecutionReceipt(row)
    const deck = buildExecutionLearningDeck([row])

    expect(parsed?.subject).toBe('WarRoom｜策略拆解')
    expect(deck.summary).toMatchObject({
      total: 1,
      completed: 1,
      failed: 0,
      evidenceCoverage: 100,
    })
    expect(deck.reviews[0]).toMatchObject({
      priority: 'promote',
      label: '可沉淀',
      target: 'memory',
    })
    expect(deck.reviews[0].score).toBeGreaterThanOrEqual(80)
  })

  it('prioritizes failures and retry advice before lower-risk watch items', () => {
    const failed = receipt({
      id: 'receipt-failed',
      subject: 'Telegram｜搜索',
      status: 'failed',
      outputPreview: 'Brave Search timeout',
      tools: [{ id: 'web_search', label: 'Web Search', risk: 'medium', status: 'failed' }],
      evidenceRefs: [{ kind: 'tool', title: 'Brave Search' }],
      retry: { recommended: true, reason: '网络超时', nextStep: '检查 MCP 或网络后重试。' },
      trust: { risk: 'medium', confidence: 0.34, rationale: '失败不能作为事实。' },
    })
    const good = receipt({ id: 'receipt-good', subject: 'XiaoBai｜诊断' })
    const deck = buildExecutionLearningDeck([event('op-good', good), event('op-failed', failed)])

    expect(scoreExecutionReceipt(failed)).toBeLessThan(scoreExecutionReceipt(good))
    expect(deck.summary).toMatchObject({
      total: 2,
      failed: 1,
      retryRecommended: 1,
    })
    expect(deck.reviews[0]).toMatchObject({
      subject: 'Telegram｜搜索',
      priority: 'intervene',
      target: 'control',
      nextStep: '检查 MCP 或网络后重试。',
    })
  })

  it('keeps evidence-free completed runs in the review queue instead of treating them as reusable truth', () => {
    const weak = receipt({
      id: 'receipt-weak',
      subject: 'Openbasaka｜普通对话',
      evidenceRefs: [],
      trust: { risk: 'low', confidence: 0.72, rationale: '普通对话输出。' },
    })
    const deck = buildExecutionLearningDeck([event('op-weak', weak)])

    expect(deck.summary.evidenceCoverage).toBe(0)
    expect(deck.reviews[0]).toMatchObject({
      priority: 'review',
      label: '需要复盘',
      target: 'knowledge',
    })
    expect(deck.reviews[0].summary).toContain('provenance')
  })
})
