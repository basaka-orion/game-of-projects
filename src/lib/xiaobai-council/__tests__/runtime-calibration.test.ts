import { describe, expect, it } from 'vitest'
import { buildCouncilRuntimeCalibrationPlan, renderCouncilRuntimeCalibrationMarkdown } from '../runtime-calibration'
import type { CouncilRuntimeEvidenceLedger } from '../runtime-evidence'
import type { CouncilRuntimeHistoryLedger, CouncilRuntimeHistoryRecord } from '../runtime-history'
import type { CouncilRuntimeWisdomContext } from '../runtime-wisdom'
import type { CouncilUserValidationLedger } from '../user-validation'

const wisdom: CouncilRuntimeWisdomContext = {
  historyCount: 0,
  confidence: 0.42,
  intelligenceSignals: [
    { id: 'missing-user-validation', label: '缺真实用户验证', severity: 'high', evidence: '仍缺 5-8 人稳审真实小白用户验证。' },
  ],
  avoidRepeating: ['不要声称已完成 2-5 分钟深度长跑。'],
  nextRunConstraints: ['匹配阶段必须产生 6 个 stage trace。'],
  requiredProof: ['必须继续要求 5-8 人稳审真实小白用户验证作为系统智慧外部校准。'],
  promptFragment: '## 运行智慧反馈',
  summary: '尚无历史运行，系统会把第一轮作为严肃留证基线。',
}

function history(records: CouncilRuntimeHistoryRecord[] = []): CouncilRuntimeHistoryLedger {
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

function ledger(overrides: Partial<CouncilRuntimeEvidenceLedger> = {}): CouncilRuntimeEvidenceLedger {
  return {
    runId: 'run-calibration',
    startedAt: '2026-05-05T00:00:00.000Z',
    completedAt: '2026-05-05T00:02:10.000Z',
    durationMs: 130000,
    decisionSource: 'deep-model',
    modelJudgeUsed: true,
    fallbackUsed: false,
    stageTrace: Array.from({ length: 6 }, (_, index) => ({
      phaseId: 'problem-profile',
      label: `stage-${index + 1}`,
      status: 'completed',
      detail: 'done',
      candidatePersonaIds: [],
      startedAt: 1,
      endedAt: 2,
    })) as CouncilRuntimeEvidenceLedger['stageTrace'],
    messageCount: 30,
    briefCount: 24,
    sceneCount: 24,
    relationCount: 18,
    verdictLedgerCount: 12,
    qualityStatus: 'approved',
    qualityScore: 94,
    actionTaskCount: 12,
    baoyuPlanCount: 5,
    localSvgCardCount: 1,
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
      proofSummary: 'proved',
      blockers: [],
    },
    replayFrames: [],
    evidenceItems: [],
    exportProof: [],
    nextProofNeeded: [],
    ...overrides,
  }
}

function certifiedUserValidation(): CouncilUserValidationLedger {
  return {
    records: [],
    stats: {
      totalRecords: 5,
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
  }
}

describe('xiaobai council runtime calibration', () => {
  it('requires a baseline when there is no proved deep run', () => {
    const plan = buildCouncilRuntimeCalibrationPlan({ history: history(), wisdom })

    expect(plan.status).toBe('needs-baseline')
    expect(plan.label).toContain('基线')
    expect(plan.checks.map((item) => item.id)).toContain('deep-model-source')
    expect(plan.stopConditions.join('\n')).toContain('local-fallback')
    expect(plan.promptFragment).toContain('95 真实长跑评测协议')
  })

  it('keeps a proved model run below 95 until user validation is satisfied', () => {
    const plan = buildCouncilRuntimeCalibrationPlan({
      history: history(),
      wisdom,
      runtimeEvidence: ledger(),
    })

    expect(plan.status).toBe('needs-user-validation')
    expect(plan.score).toBeGreaterThanOrEqual(80)
    expect(plan.userValidationProtocol.join('\n')).toContain('5-8 个')
  })

  it('can become a 95 candidate only when user validation ledger is certified', () => {
    const plan = buildCouncilRuntimeCalibrationPlan({
      history: history(),
      wisdom: { ...wisdom, requiredProof: [], intelligenceSignals: [] },
      runtimeEvidence: ledger(),
      userValidation: certifiedUserValidation(),
    })

    expect(plan.status).toBe('candidate-95')
    expect(plan.checks.find((item) => item.id === 'user-validation')?.status).toBe('pass')
    expect(plan.summary).toContain('可核验证明长跑')
  })

  it('does not trust a claimed deep-model run without a verifiable model-judge trace', () => {
    const forgedLedger = ledger({
      deepRunCertification: {
        ...ledger().deepRunCertification,
        status: 'proved',
        modelJudgeTraceVerified: false,
        proofSummary: 'claimed proved without model-judge trace',
      },
    })
    const plan = buildCouncilRuntimeCalibrationPlan({
      history: history(),
      wisdom,
      runtimeEvidence: forgedLedger,
    })

    expect(plan.status).toBe('needs-baseline')
    expect(plan.checks.find((item) => item.id === 'deep-model-source')?.status).toBe('fail')
    expect(plan.checks.find((item) => item.id === 'deep-model-source')?.proof).toContain('还没有可核验')
  })

  it('renders a markdown protocol with stop conditions and checks', () => {
    const markdown = renderCouncilRuntimeCalibrationMarkdown(
      buildCouncilRuntimeCalibrationPlan({ history: history(), wisdom, runtimeEvidence: ledger() }),
    )

    expect(markdown).toContain('95 真实长跑评测协议')
    expect(markdown).toContain('校准检查')
    expect(markdown).toContain('停止条件')
  })
})
