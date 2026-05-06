import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearCouncilArtifactReviewLedger,
  COUNCIL_ARTIFACT_REVIEW_LEGACY_STORAGE_KEY,
  COUNCIL_ARTIFACT_REVIEW_STORAGE_KEY,
  hasCouncilArtifactReviewCertification,
  loadCouncilArtifactReviewLedger,
  renderCouncilArtifactReviewMarkdown,
  saveCouncilArtifactReviewRecord,
} from '../artifact-review'

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

function valid(alias = 'Boss', reviewerKind: 'boss' | 'external-human' | 'designer-or-team' | 'model-simulation' = 'boss') {
  return {
    reviewerAlias: alias,
    reviewerKind,
    reviewedExportRef: 'xiaobai-prd-and-baoyu.zip',
    artifactScore: 95,
    prdScore: 95,
    theaterScore: 94,
    baoyuScore: 93,
    trustScore: 96,
    prdDirectlyActionable: true,
    theaterTraceClear: true,
    baoyuChineseReadable: true,
    visualTasteProfessional: true,
    noFakeProgress: true,
    wouldUseForRealPlanning: true,
    prdNotes: 'PRD can be split into implementation tasks.',
    theaterNotes: 'Theater traces objections and verdicts clearly.',
    baoyuNotes: 'Baoyu cards use readable local Chinese rendering.',
    trustNotes: 'Evidence chain has no fake progress.',
    finalVerdict: 'use' as const,
    savedAt: '2026-05-05T00:00:00.000Z',
  }
}

describe('xiaobai council artifact review ledger', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
  })

  it('certifies only when Boss and another human reviewer both pass all dimensions', () => {
    let ledger = saveCouncilArtifactReviewRecord({
      ...valid('reviewer-fail'),
      baoyuScore: 82,
      baoyuChineseReadable: false,
      finalVerdict: 'repair',
      repairRequired: true,
      repairResolved: true,
    })

    expect(ledger.stats.certificationStatus).toBe('collecting')
    expect(ledger.records[0].failureReasons.join('\n')).toContain('Baoyu')
    expect(hasCouncilArtifactReviewCertification(ledger)).toBe(false)

    ledger = saveCouncilArtifactReviewRecord({
      ...valid('Boss'),
      savedAt: '2026-05-05T00:01:00.000Z',
    })

    expect(ledger.stats.certificationStatus).toBe('failed')
    expect(ledger.stats.bossFinalPassed).toBe(true)
    expect(ledger.stats.peerReviewPassed).toBe(false)
    expect(hasCouncilArtifactReviewCertification(ledger)).toBe(false)

    ledger = saveCouncilArtifactReviewRecord({
      ...valid('reviewer-pass', 'external-human'),
      savedAt: '2026-05-05T00:02:00.000Z',
    })

    expect(ledger.stats.certificationStatus).toBe('passed')
    expect(ledger.stats.passedReviews).toBe(2)
    expect(ledger.stats.bossFinalPassed).toBe(true)
    expect(ledger.stats.peerReviewPassed).toBe(true)
    expect(hasCouncilArtifactReviewCertification(ledger)).toBe(true)
    expect(renderCouncilArtifactReviewMarkdown(ledger)).toContain('bossFinalPassed: yes')
  })

  it('fails when two non-boss reviewers pass but Boss final review is missing', () => {
    let ledger = saveCouncilArtifactReviewRecord({
      ...valid('reviewer-a', 'external-human'),
      savedAt: '2026-05-05T00:00:00.000Z',
    })
    ledger = saveCouncilArtifactReviewRecord({
      ...valid('reviewer-b', 'designer-or-team'),
      savedAt: '2026-05-05T00:01:00.000Z',
    })

    expect(ledger.stats.totalReviews).toBe(2)
    expect(ledger.stats.passedReviews).toBe(2)
    expect(ledger.stats.bossFinalPassed).toBe(false)
    expect(ledger.stats.certificationStatus).toBe('failed')
    expect(hasCouncilArtifactReviewCertification(ledger)).toBe(false)
  })

  it('stores safe summaries and rejects model or legacy self-review', () => {
    let ledger = saveCouncilArtifactReviewRecord({
      ...valid('ChatGPT 模拟审稿'),
      reviewerKind: 'model-simulation',
      notes: 'should redact sk-secret',
    })
    const raw = localStorage.getItem(COUNCIL_ARTIFACT_REVIEW_STORAGE_KEY) || ''

    expect(raw).not.toContain('sk-secret')
    expect(ledger.records[0].passed).toBe(false)
    expect(ledger.records[0].failureReasons.join('\n')).toContain('模型')

    localStorage.setItem(COUNCIL_ARTIFACT_REVIEW_LEGACY_STORAGE_KEY, JSON.stringify([
      {
        id: 'legacy-artifact',
        savedAt: '2026-05-04T00:00:00.000Z',
        reviewerAlias: 'legacy reviewer',
        artifactScore: 99,
        prdDirectlyActionable: true,
        theaterTraceClear: true,
        baoyuChineseReadable: true,
        visualTasteProfessional: true,
        noFakeProgress: true,
        wouldUseForRealPlanning: true,
        passed: true,
        failureReasons: [],
      },
    ]))
    ledger = loadCouncilArtifactReviewLedger()

    expect(ledger.records.find((record) => record.id === 'legacy-artifact')?.passed).toBe(false)
    expect(ledger.records.find((record) => record.id === 'legacy-artifact')?.failureReasons.join('\n')).toContain('旧版记录')
    expect(clearCouncilArtifactReviewLedger().records).toHaveLength(0)
  })
})
