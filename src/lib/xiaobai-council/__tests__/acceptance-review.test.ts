import { describe, expect, it } from 'vitest'
import { buildCouncilAcceptanceReview } from '../acceptance-review'
import { selectCouncilTeam } from '../selector'

const selection = selectCouncilTeam('做一个 AI PRD 工具，需要真实长跑、审美验收和用户验证。')

function runtime(durationMs = 180000): any {
  return {
    runId: 'run-acceptance',
    durationMs,
    decisionSource: 'deep-model',
    deepRunCertification: {
      status: 'proved',
    },
  }
}

function quality(): any {
  return {
    score: 92,
    finalGateStatus: 'approved',
    prdCompletenessScore: 91,
    launchReadinessScore: 92,
  }
}

function scenes(count = 18): any[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `scene-${index}`,
    sourceMessageIds: [`brief-${index}`],
  }))
}

function debateMap(edgeCount = 12): any {
  return {
    edges: Array.from({ length: edgeCount }, (_, index) => ({ id: `edge-${index}` })),
  }
}

function verdictLedger(itemCount = 8): any {
  const items = Array.from({ length: itemCount }, (_, index) => ({ id: `item-${index}`, label: `item ${index}`, sourceMessageIds: [] }))
  return {
    kept: items.slice(0, 2),
    cut: items.slice(2, 3),
    revised: items.slice(3, 4),
    evidenceGaps: items.slice(4, 5),
    prdImpacts: items.slice(5, 7),
    openDisagreements: items.slice(7),
  }
}

function baoyuPlans(): any[] {
  return [
    {
      id: 'cards',
      kind: 'image-cards',
      textRenderMode: 'local-svg',
      imageDataUrls: ['a', 'b', 'c', 'd'],
      structuredCards: [
        { title: '一', points: ['a', 'b'] },
        { title: '二', points: ['a', 'b'] },
        { title: '三', points: ['a', 'b'] },
        { title: '四', points: ['a', 'b'] },
      ],
    },
  ]
}

function calibration(): any {
  return {
    score: 92,
    status: 'candidate-95',
    nextDeepRunProtocol: ['跑真实题', '保留 deep-model trace'],
    userValidationProtocol: ['5-8 名小白用户', '4/5 通过'],
    stopConditions: ['fallback 停止 95 认证'],
  }
}

function userLedger(status: 'missing' | 'passed' = 'passed'): any {
  return {
    records: status === 'passed' ? [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }, { id: 'u4' }, { id: 'u5' }] : [],
    stats: {
      certificationStatus: status,
      totalParticipants: status === 'passed' ? 5 : 0,
      passedParticipants: status === 'passed' ? 4 : 0,
      totalRecords: status === 'passed' ? 5 : 0,
      unresolvedRepairs: 0,
    },
  }
}

function artifactLedger(status: 'missing' | 'passed' = 'passed'): any {
  return {
    records: status === 'passed' ? [{ id: 'a1' }, { id: 'a2' }] : [],
    stats: {
      certificationStatus: status,
      totalReviews: status === 'passed' ? 2 : 0,
      passedReviews: status === 'passed' ? 2 : 0,
      averageScore: status === 'passed' ? 95 : 0,
      prdAverageScore: status === 'passed' ? 95 : 0,
      theaterAverageScore: status === 'passed' ? 95 : 0,
      baoyuAverageScore: status === 'passed' ? 95 : 0,
      trustAverageScore: status === 'passed' ? 95 : 0,
      unresolvedRepairs: 0,
      bossFinalPassed: status === 'passed',
      peerReviewPassed: status === 'passed',
    },
  }
}

describe('council acceptance review', () => {
  it('allows 95 candidate only when deep run, quality, theater, Baoyu, user and aesthetic gates pass', () => {
    const review = buildCouncilAcceptanceReview({
      runtimeEvidence: runtime(),
      qualityGate: quality(),
      debateScenes: scenes(),
      debateMap: debateMap(),
      verdictLedger: verdictLedger(),
      baoyuVisualPlans: baoyuPlans(),
      runtimeCalibrationPlan: calibration(),
      userValidationLedger: userLedger('passed'),
      artifactReviewLedger: artifactLedger('passed'),
    })

    expect(review.status).toBe('candidate-95')
    expect(review.claimAllowed).toBe(true)
    expect(review.score).toBeGreaterThanOrEqual(95)
    expect(review.gates.every((gate) => gate.status === 'pass')).toBe(true)
  })

  it('blocks 95 when the run is too short, too long, or lacks human validation', () => {
    const short = buildCouncilAcceptanceReview({
      runtimeEvidence: runtime(45000),
      qualityGate: quality(),
      debateScenes: scenes(),
      debateMap: debateMap(),
      verdictLedger: verdictLedger(),
      baoyuVisualPlans: baoyuPlans(),
      runtimeCalibrationPlan: calibration(),
      userValidationLedger: userLedger('passed'),
      artifactReviewLedger: artifactLedger('passed'),
    })
    expect(short.status).toBe('needs-deep-run')
    expect(short.claimAllowed).toBe(false)

    const tooLong = buildCouncilAcceptanceReview({
      runtimeEvidence: runtime(420000),
      qualityGate: quality(),
      debateScenes: scenes(),
      debateMap: debateMap(),
      verdictLedger: verdictLedger(),
      baoyuVisualPlans: baoyuPlans(),
      runtimeCalibrationPlan: calibration(),
      userValidationLedger: userLedger('passed'),
      artifactReviewLedger: artifactLedger('passed'),
    })
    expect(tooLong.status).toBe('needs-deep-run')
    expect(tooLong.gates.find((gate) => gate.id === 'deep-run-revalidation')?.proof).toContain('target2to5=no')

    const noHuman = buildCouncilAcceptanceReview({
      runtimeEvidence: runtime(),
      qualityGate: quality(),
      debateScenes: scenes(),
      debateMap: debateMap(),
      verdictLedger: verdictLedger(),
      baoyuVisualPlans: baoyuPlans(),
      runtimeCalibrationPlan: calibration(),
      userValidationLedger: userLedger('missing'),
      artifactReviewLedger: artifactLedger('missing'),
    })
    expect(noHuman.status).toBe('needs-human-validation')
    expect(noHuman.nextActions.join('\n')).toContain('人工审稿')
  })
})
