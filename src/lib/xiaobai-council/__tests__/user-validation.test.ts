import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearCouncilUserValidationLedger,
  COUNCIL_USER_VALIDATION_LEGACY_STORAGE_KEY,
  COUNCIL_USER_VALIDATION_STORAGE_KEY,
  hasCouncilUserValidationCertification,
  loadCouncilUserValidationLedger,
  renderCouncilUserValidationMarkdown,
  saveCouncilUserValidationRecord,
} from '../user-validation'

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

function valid(alias: string) {
  const minute = Number(alias.match(/\d+$/)?.[0] || 1)
  return {
    problem: '让小白用户完成一次智囊团 PRD 生成',
    participantAlias: alias,
    participantKind: 'external-human' as const,
    observerAlias: `observer-${alias}`,
    taskPrompt: '输入自己的真实问题，看懂推荐编队，找到下一步，导出结果。',
    completionMinutes: 2.8,
    completedInput: true,
    understoodMatchReason: true,
    foundNextAction: true,
    namedCutAndKeptReason: true,
    exportedOutcome: true,
    usedRealProblem: true,
    uncoachedAttempt: true,
    consentAndPrivacyConfirmed: true,
    participantSummary: '参与者说这个智囊团能帮他把下一步拆清楚。',
    nextActionEvidence: '参与者指出了行动包里的第一个任务。',
    cutAndKeptEvidence: '参与者说保留产品经理，裁掉暂时不相关的增长方向。',
    exportedArtifactRef: `prd-${alias}.md`,
    finalWorthUsing: true,
    savedAt: `2026-05-05T00:${String(minute).padStart(2, '0')}:00.000Z`,
  }
}

describe('xiaobai council user validation ledger', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
  })

  it('certifies only after at least 5 external participants and 4 passes', () => {
    let ledger = saveCouncilUserValidationRecord(valid('user-1'))
    expect(ledger.stats.certificationStatus).toBe('collecting')

    ledger = saveCouncilUserValidationRecord({
      ...valid('user-2'),
      completionMinutes: 4.2,
      exportedOutcome: false,
      finalWorthUsing: false,
    })
    expect(ledger.stats.certificationStatus).toBe('collecting')
    expect(ledger.records[0].passed).toBe(false)
    expect(ledger.records[0].failureReasons.join('\n')).toContain('超过 3 分钟')

    ledger = saveCouncilUserValidationRecord(valid('user-3'))
    expect(ledger.stats.certificationStatus).toBe('collecting')

    ledger = saveCouncilUserValidationRecord(valid('user-4'))
    expect(ledger.stats.certificationStatus).toBe('collecting')

    ledger = saveCouncilUserValidationRecord(valid('user-5'))
    expect(ledger.stats.certificationStatus).toBe('passed')
    expect(ledger.stats.totalParticipants).toBe(5)
    expect(ledger.stats.passedParticipants).toBe(4)
    expect(hasCouncilUserValidationCertification(ledger)).toBe(true)
  })

  it('fails the stable review when 8 participants include only 3 passes', () => {
    let ledger = saveCouncilUserValidationRecord(valid('user-1'))
    ledger = saveCouncilUserValidationRecord(valid('user-2'))
    ledger = saveCouncilUserValidationRecord(valid('user-3'))

    for (const index of [4, 5, 6, 7, 8]) {
      ledger = saveCouncilUserValidationRecord({
        ...valid(`user-${index}`),
        completedInput: false,
        foundNextAction: false,
        finalWorthUsing: false,
      })
    }

    expect(ledger.stats.totalParticipants).toBe(8)
    expect(ledger.stats.passedParticipants).toBe(3)
    expect(ledger.stats.certificationStatus).toBe('failed')
    expect(hasCouncilUserValidationCertification(ledger)).toBe(false)
  })

  it('stores safe summaries and renders markdown', () => {
    const ledger = saveCouncilUserValidationRecord({
      ...valid('user-sk-secret'),
      notes: '用户没有看到 sk-secret，应被脱敏。',
    })
    const stored = loadCouncilUserValidationLedger()
    const raw = localStorage.getItem(COUNCIL_USER_VALIDATION_STORAGE_KEY) || ''

    expect(stored.records).toHaveLength(1)
    expect(raw).not.toContain('sk-secret')
    expect(renderCouncilUserValidationMarkdown(ledger)).toContain('真实小白用户验证账本')
    expect(clearCouncilUserValidationLedger().records).toHaveLength(0)
  })

  it('rejects model simulations and legacy thin records as validation proof', () => {
    let ledger = saveCouncilUserValidationRecord({
      ...valid('model-user'),
      participantAlias: 'ChatGPT 模拟用户',
      participantKind: 'model-simulation',
    })

    expect(ledger.records[0].passed).toBe(false)
    expect(ledger.records[0].failureReasons.join('\n')).toContain('外部真人')
    expect(hasCouncilUserValidationCertification(ledger)).toBe(false)

    ledger = saveCouncilUserValidationRecord({
      ...valid('boss-1'),
      participantKind: 'boss-self-check',
    })
    expect(ledger.records[0].passed).toBe(false)
    expect(ledger.records[0].failureReasons.join('\n')).toContain('外部真人')

    ledger = saveCouncilUserValidationRecord({
      ...valid('user-no-export'),
      exportedArtifactRef: '',
    })
    expect(ledger.records[0].passed).toBe(false)
    expect(ledger.records[0].failureReasons.join('\n')).toContain('导出物')

    ledger = saveCouncilUserValidationRecord({
      ...valid('user-repair'),
      repairRequired: true,
      repairResolved: false,
    })
    expect(ledger.records[0].passed).toBe(false)
    expect(ledger.records[0].failureReasons.join('\n')).toContain('返修')

    localStorage.setItem(COUNCIL_USER_VALIDATION_LEGACY_STORAGE_KEY, JSON.stringify([
      {
        id: 'legacy-pass',
        savedAt: '2026-05-04T00:00:00.000Z',
        problemPreview: 'legacy',
        participantAlias: 'legacy user',
        taskPrompt: 'thin',
        completionMinutes: 1,
        completedInput: true,
        understoodMatchReason: true,
        foundNextAction: true,
        namedCutAndKeptReason: true,
        exportedOutcome: true,
        passed: true,
        failureReasons: [],
      },
    ]))
    ledger = loadCouncilUserValidationLedger()

    expect(ledger.records.find((record) => record.id === 'legacy-pass')?.passed).toBe(false)
    expect(ledger.records.find((record) => record.id === 'legacy-pass')?.failureReasons.join('\n')).toContain('旧版记录')
  })
})
