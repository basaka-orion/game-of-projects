import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearCouncilRuntimeHistory,
  COUNCIL_RUNTIME_HISTORY_STORAGE_KEY,
  loadCouncilRuntimeHistory,
  normalizeCouncilRuntimeHistoryProof,
  renderCouncilRuntimeHistoryMarkdown,
  saveCouncilRuntimeHistoryRecord,
} from '../runtime-history'
import type { CouncilRuntimeEvidenceLedger } from '../runtime-evidence'
import { selectCouncilTeam } from '../selector'

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
    clear: vi.fn(() => data.clear()),
  }
}

function ledger(status: 'proved' | 'partial' | 'missing', runId = `run-${status}`): CouncilRuntimeEvidenceLedger {
  return {
    runId,
    startedAt: '2026-05-05T00:00:00.000Z',
    completedAt: '2026-05-05T00:02:10.000Z',
    durationMs: status === 'proved' ? 130000 : 5000,
    decisionSource: status === 'missing' ? 'local-fallback' : 'deep-model',
    modelJudgeUsed: status !== 'missing',
    fallbackUsed: status === 'missing',
    stageTrace: [],
    messageCount: 24,
    briefCount: 18,
    sceneCount: 24,
    relationCount: 18,
    verdictLedgerCount: 12,
    qualityStatus: status === 'proved' ? 'approved' : 'needs-revision',
    qualityScore: status === 'proved' ? 95 : 82,
    actionTaskCount: 12,
    baoyuPlanCount: 5,
    localSvgCardCount: 1,
    internetResearchRequired: false,
    internetResearchGrounded: false,
    internetSourceCount: 0,
    internetQueries: [],
    deepRunCertification: {
      status,
      label: status === 'proved' ? '2-5 分钟深度长跑已认证' : '尚未完成深度长跑认证',
      requiredDurationMs: 120000,
      actualDurationMs: status === 'proved' ? 130000 : 5000,
      modelJudgeUsed: status !== 'missing',
      modelJudgeTraceVerified: status === 'proved',
      fullStageTrace: status === 'proved',
      stageTraceVerified: status === 'proved',
      temporalTraceVerified: status === 'proved',
      enoughDebate: status === 'proved',
      enoughQuality: status === 'proved',
      proofSummary: status === 'proved' ? '深度长跑已认证。' : '仍不能声称完成 2-5 分钟真实深度长跑。',
      blockers: status === 'proved' ? [] : ['运行时长未达到默认深度模式 120s。'],
    },
    replayFrames: [],
    evidenceItems: [],
    exportProof: ['导出证明。'],
    nextProofNeeded: ['真实小白用户验证。'],
  }
}

describe('xiaobai council runtime history', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
  })

  it('saves, deduplicates, and summarizes runtime history without raw secrets', () => {
    const selection = selectCouncilTeam('做一个真实长跑历史')

    let history = saveCouncilRuntimeHistoryRecord({
      problem: '做一个真实长跑历史，不要保存 sk-secret',
      selection,
      runtimeEvidence: ledger('partial', 'run-a'),
      savedAt: '2026-05-05T00:00:00.000Z',
    })
    history = saveCouncilRuntimeHistoryRecord({
      problem: '做一个真实长跑历史',
      selection,
      runtimeEvidence: ledger('proved', 'run-b'),
      savedAt: '2026-05-05T00:02:30.000Z',
    })
    history = saveCouncilRuntimeHistoryRecord({
      problem: '做一个真实长跑历史',
      selection,
      runtimeEvidence: ledger('proved', 'run-b'),
      savedAt: '2026-05-05T00:03:00.000Z',
    })

    expect(localStorage.setItem).toHaveBeenCalledWith(COUNCIL_RUNTIME_HISTORY_STORAGE_KEY, expect.any(String))
    expect(history.records).toHaveLength(2)
    expect(history.stats.provedDeepRuns).toBe(1)
    expect(history.stats.partialDeepRuns).toBe(1)
    expect(history.records[0].runId).toBe('run-b')
    expect(JSON.stringify(history)).not.toContain('sk-secret')
  })

  it('loads, renders, and clears history', () => {
    const selection = selectCouncilTeam('回看真实长跑历史')
    saveCouncilRuntimeHistoryRecord({
      problem: '回看真实长跑历史',
      selection,
      runtimeEvidence: ledger('missing', 'run-fallback'),
      savedAt: '2026-05-05T00:00:00.000Z',
    })

    const history = loadCouncilRuntimeHistory()
    const markdown = renderCouncilRuntimeHistoryMarkdown(history)

    expect(history.stats.totalRuns).toBe(1)
    expect(history.stats.fallbackRuns).toBe(1)
    expect(markdown).toContain('真实长跑历史')
    expect(markdown).toContain('run-fallback')

    expect(clearCouncilRuntimeHistory().records).toEqual([])
  })

  it('normalizes legacy 3-person user validation blockers to the 5-8 stable review rule', () => {
    localStorage.setItem(COUNCIL_RUNTIME_HISTORY_STORAGE_KEY, JSON.stringify([
      {
        id: 'runtime-history-legacy',
        runId: 'legacy',
        savedAt: '2026-05-05T00:00:00.000Z',
        problemPreview: 'legacy',
        teamSummary: ['team'],
        decisionSource: 'deep-model',
        deepRunStatus: 'proved',
        deepRunLabel: 'proved',
        durationMs: 130000,
        qualityScore: 95,
        qualityStatus: 'approved',
        proofSummary: 'proved',
        blockers: ['真实小白用户验证: 仍需要 3 人完成一次从输入、阅读、导出到复盘的闭环。'],
        ledger: {
          ...ledger('proved', 'legacy'),
          nextProofNeeded: ['真实小白用户验证: 仍需要 3 人完成一次闭环。'],
        },
      },
    ]))

    const history = loadCouncilRuntimeHistory()
    const markdown = renderCouncilRuntimeHistoryMarkdown(history)

    expect(normalizeCouncilRuntimeHistoryProof('必须 3 人真实小白用户验证。')).toContain('5-8 人稳审')
    expect(history.records[0].blockers.join('\n')).toContain('5-8 人稳审')
    expect(history.records[0].ledger.nextProofNeeded.join('\n')).toContain('至少 5 人完成记录')
    expect(markdown).not.toContain('仍需要 3 人')
  })
})
