import { describe, expect, it } from 'vitest'
import { buildCouncilRuntimeWisdomContext, renderCouncilRuntimeWisdomMarkdown } from '../runtime-wisdom'
import type { CouncilRuntimeHistoryLedger, CouncilRuntimeHistoryRecord } from '../runtime-history'

function history(records: CouncilRuntimeHistoryRecord[]): CouncilRuntimeHistoryLedger {
  return {
    records,
    stats: {
      totalRuns: records.length,
      provedDeepRuns: records.filter((record) => record.deepRunStatus === 'proved').length,
      partialDeepRuns: records.filter((record) => record.deepRunStatus === 'partial').length,
      fallbackRuns: records.filter((record) => record.decisionSource === 'local-fallback').length,
      bestQualityScore: records.reduce((best, record) => Math.max(best, record.qualityScore), 0),
      latestRunAt: records[0]?.savedAt,
    },
  }
}

function record(overrides: Partial<CouncilRuntimeHistoryRecord> = {}): CouncilRuntimeHistoryRecord {
  return {
    id: 'runtime-history-run-a',
    runId: 'run-a',
    savedAt: '2026-05-05T00:00:00.000Z',
    problemPreview: '做一个严肃智囊团',
    teamSummary: ['产品导演｜主持席'],
    decisionSource: 'local-fallback',
    deepRunStatus: 'missing',
    deepRunLabel: '尚未认证',
    durationMs: 5000,
    qualityScore: 82,
    qualityStatus: 'needs-revision',
    proofSummary: '不能声称完成深度长跑。',
    blockers: ['运行时长未达到默认深度模式 120s。', '真实小白用户验证仍缺 5-8 人稳审。'],
    ledger: {} as CouncilRuntimeHistoryRecord['ledger'],
    ...overrides,
  }
}

describe('xiaobai council runtime wisdom', () => {
  it('turns an empty history into a strict first-run baseline', () => {
    const wisdom = buildCouncilRuntimeWisdomContext(history([]))

    expect(wisdom.historyCount).toBe(0)
    expect(wisdom.intelligenceSignals.map((item) => item.id)).toContain('no-history')
    expect(wisdom.promptFragment).toContain('运行智慧反馈')
    expect(wisdom.summary).toContain('第一轮')
    expect(wisdom.requiredProof.join('\n')).toContain('runtime history record')
  })

  it('converts fallback, short run, low quality, and missing user validation into next-run constraints', () => {
    const wisdom = buildCouncilRuntimeWisdomContext(history([record()]))

    expect(wisdom.lastRunId).toBe('run-a')
    expect(wisdom.intelligenceSignals.map((item) => item.id)).toEqual(
      expect.arrayContaining(['no-proved-deep-run', 'fallback-seen', 'quality-under-90', 'missing-user-validation', 'short-run']),
    )
    expect(wisdom.avoidRepeating.join('\n')).toContain('local-fallback')
    expect(wisdom.nextRunConstraints.join('\n')).toContain('6 个 stage trace')
    expect(wisdom.requiredProof.join('\n')).toContain('5-8 人稳审真实小白用户验证')
  })

  it('renders a reusable markdown fragment for export and prompt audit', () => {
    const wisdom = buildCouncilRuntimeWisdomContext(history([record()]))
    const markdown = renderCouncilRuntimeWisdomMarkdown(wisdom)

    expect(markdown).toContain('运行智慧反馈')
    expect(markdown).toContain('不要重复')
    expect(markdown).toContain('必须留下的证据')
  })
})
