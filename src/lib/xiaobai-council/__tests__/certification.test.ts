import { describe, expect, it } from 'vitest'
import { buildCouncil95CertificationGate, renderCouncil95CertificationMarkdown } from '../certification'
import type { CouncilExcellenceAudit } from '../excellence-audit'
import type { CouncilNuwaEvidenceRegistry } from '../distillation-evidence'
import type { CouncilQualityGate } from '../quality-gate'
import type { CouncilRuntimeCalibrationPlan } from '../runtime-calibration'
import type { CouncilRuntimeEvidenceLedger } from '../runtime-evidence'
import type { CouncilNuwaLocalPreflightReport } from '../source-preflight'
import type { CouncilNuwaSourceAuditLedger } from '../source-audit'
import type { CouncilUserValidationLedger } from '../user-validation'
import type { CouncilArtifactReviewLedger } from '../artifact-review'
import { selectCouncilTeam } from '../selector'

const selection = selectCouncilTeam('做一个能解决复杂人生规划的小白智囊团，需要 PRD、视觉、工程和风险审查')

function qualityGate(): CouncilQualityGate {
  return {
    gateId: 'quality-95',
    status: 'approved',
    score: 95,
    prdCompletenessScore: 95,
    launchReadinessScore: 94,
    finalGateStatus: 'approved',
    generatedAt: '2026-05-05T00:00:00.000Z',
    summary: '95 quality',
    checks: [],
    typedDeliberation: [],
    revisionPrompt: '',
    revisionRounds: [],
  }
}

function excellenceAudit(): CouncilExcellenceAudit {
  return {
    score: 95,
    targetScore: 95,
    gapToTarget: 0,
    scoreLabel: '95 分代表性候选',
    verdict: 'candidate',
    dimensions: [],
    mustNotClaimYet: [],
    nextSprint: [],
    proofChain: ['quality=95', 'runtime=proved'],
  }
}

function runtimeEvidence(): CouncilRuntimeEvidenceLedger {
  return {
    runId: 'runtime-95',
    startedAt: '2026-05-05T00:00:00.000Z',
    completedAt: '2026-05-05T00:02:10.000Z',
    durationMs: 130000,
    decisionSource: 'deep-model',
    modelJudgeUsed: true,
    fallbackUsed: false,
    stageTrace: [],
    messageCount: 36,
    briefCount: 30,
    sceneCount: 24,
    relationCount: 18,
    verdictLedgerCount: 12,
    qualityStatus: 'approved',
    qualityScore: 95,
    actionTaskCount: 12,
    baoyuPlanCount: 5,
    localSvgCardCount: 1,
    internetResearchRequired: false,
    internetResearchGrounded: false,
    internetSourceCount: 0,
    internetQueries: [],
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
    replayFrames: [
      { id: 'debate', atMs: 80000, source: 'debate-theater', title: 'debate', status: 'proved', summary: 'done', evidenceRefs: [] },
      { id: 'baoyu', atMs: 120000, source: 'baoyu', title: 'baoyu', status: 'proved', summary: 'done', evidenceRefs: [] },
    ],
    evidenceItems: [],
    exportProof: [],
    nextProofNeeded: [],
  }
}

function calibrationPlan(): CouncilRuntimeCalibrationPlan {
  return {
    score: 95,
    status: 'candidate-95',
    label: '95 分候选可进入人工验收',
    summary: 'candidate',
    checks: [],
    nextDeepRunProtocol: [],
    userValidationProtocol: [],
    stopConditions: [],
    modelRunInputHints: [],
    promptFragment: '## 95',
  }
}

function userValidation(status: CouncilUserValidationLedger['stats']['certificationStatus'] = 'passed'): CouncilUserValidationLedger {
  return {
    records: [
      {
        id: 'user-a',
        savedAt: '2026-05-05T00:00:00.000Z',
        problemPreview: 'problem',
        participantAlias: 'A',
        participantKind: 'external-human',
        observerAlias: 'observer',
        taskPrompt: 'task',
        completionMinutes: 2.4,
        completedInput: true,
        understoodMatchReason: true,
        foundNextAction: true,
        namedCutAndKeptReason: true,
        exportedOutcome: true,
        usedRealProblem: true,
        uncoachedAttempt: true,
        consentAndPrivacyConfirmed: true,
        participantSummary: 'user understood the recommendation',
        nextActionEvidence: 'user found the next action',
        cutAndKeptEvidence: 'user named one cut and one kept reason',
        exportedArtifactRef: 'prd.md',
        finalWorthUsing: true,
        passed: true,
        failureReasons: [],
      },
    ],
    stats: {
      totalRecords: status === 'passed' ? 5 : 1,
      totalParticipants: status === 'passed' ? 5 : 1,
      passedParticipants: status === 'passed' ? 4 : 1,
      failedParticipants: status === 'passed' ? 1 : 0,
      certificationStatus: status,
      requiredParticipants: 5,
      requiredPasses: 4,
      passRate: status === 'passed' ? 80 : 100,
      unresolvedRepairs: 0,
      lastValidatedAt: '2026-05-05T00:00:00.000Z',
    },
  }
}

function artifactReview(status: CouncilArtifactReviewLedger['stats']['certificationStatus'] = 'passed'): CouncilArtifactReviewLedger {
  return {
    records: status === 'passed'
      ? [
          {
            id: 'artifact-boss',
            savedAt: '2026-05-05T00:01:00.000Z',
            runId: 'runtime-95',
            protocolVersion: 2,
            reviewerAlias: 'Boss',
            reviewerKind: 'boss',
            reviewedExportRef: 'prd-and-baoyu.zip',
            artifactScore: 95,
            prdScore: 95,
            theaterScore: 95,
            baoyuScore: 95,
            trustScore: 95,
            prdDirectlyActionable: true,
            theaterTraceClear: true,
            baoyuChineseReadable: true,
            visualTasteProfessional: true,
            noFakeProgress: true,
            wouldUseForRealPlanning: true,
            prdNotes: 'PRD can be split into implementation tasks.',
            theaterNotes: 'Theater traces conflict and verdicts clearly.',
            baoyuNotes: 'Baoyu Chinese cards are readable.',
            trustNotes: 'Evidence chain is trustworthy.',
            finalVerdict: 'use',
            passed: true,
            failureReasons: [],
          },
          {
            id: 'artifact-peer',
            savedAt: '2026-05-05T00:00:00.000Z',
            runId: 'runtime-95',
            protocolVersion: 2,
            reviewerAlias: 'Reviewer A',
            reviewerKind: 'external-human',
            reviewedExportRef: 'prd-and-baoyu.zip',
            artifactScore: 94,
            prdScore: 94,
            theaterScore: 94,
            baoyuScore: 94,
            trustScore: 94,
            prdDirectlyActionable: true,
            theaterTraceClear: true,
            baoyuChineseReadable: true,
            visualTasteProfessional: true,
            noFakeProgress: true,
            wouldUseForRealPlanning: true,
            prdNotes: 'PRD can be split into implementation tasks.',
            theaterNotes: 'Theater traces conflict and verdicts clearly.',
            baoyuNotes: 'Baoyu Chinese cards are readable.',
            trustNotes: 'Evidence chain is trustworthy.',
            finalVerdict: 'use',
            passed: true,
            failureReasons: [],
          },
        ]
      : [],
    stats: {
      totalReviews: status === 'passed' ? 2 : 0,
      passedReviews: status === 'passed' ? 2 : 0,
      failedReviews: 0,
      certificationStatus: status,
      requiredReviews: 2,
      requiredPasses: 2,
      bossFinalPassed: status === 'passed',
      peerReviewPassed: status === 'passed',
      averageScore: status === 'passed' ? 95 : 0,
      prdAverageScore: status === 'passed' ? 95 : 0,
      theaterAverageScore: status === 'passed' ? 95 : 0,
      baoyuAverageScore: status === 'passed' ? 95 : 0,
      trustAverageScore: status === 'passed' ? 95 : 0,
      unresolvedRepairs: 0,
      lastReviewedAt: status === 'passed' ? '2026-05-05T00:00:00.000Z' : undefined,
    },
  }
}

function sourceAuditLedger(audited = true): CouncilNuwaSourceAuditLedger {
  const records = audited
    ? selection.seats.map((seat, index) => ({
        id: `audit-${seat.persona.id}`,
        personaId: seat.persona.id,
        personaName: seat.persona.name,
        reviewerAlias: 'Boss',
        savedAt: `2026-05-05T00:00:0${index}.000Z`,
        sourceIndexSummary: '已核对 SKILL.md、EVIDENCE.md、六路来源索引、验证题、不确定边界和授权边界。',
        checkedSkillMd: true,
        checkedEvidenceMd: true,
        checkedSixStreams: true,
        validationQuestionsRun: 2,
        uncertaintyBoundaryConfirmed: true,
        noAuthorizationClaimConfirmed: true,
        passed: true,
        failureReasons: [],
      }))
    : []
  return {
    records,
    stats: {
      totalRecords: records.length,
      auditedPersonaCount: records.length,
      failedRecordCount: 0,
      personaCount: selection.seats.length,
      coverageRatio: audited ? 100 : 0,
      latestAuditAt: records[0]?.savedAt,
    },
  }
}

function nuwaRegistry(audited = true): CouncilNuwaEvidenceRegistry {
  return {
    generatedAt: '2026-05-05T00:00:00.000Z',
    personaCount: selection.seats.length,
    localReadyCount: selection.seats.length,
    sourceSeededCount: selection.seats.length,
    manualSourceAuditedCount: audited ? selection.seats.length : 0,
    averageLocalUseScore: 99,
    averageSourceAuditScore: audited ? 96 : 65,
    packs: [],
    summary: 'nuwa',
    gapTo95: audited ? [] : ['need source audit'],
  }
}

function nuwaPreflight(ready = true): CouncilNuwaLocalPreflightReport {
  const reports = selection.seats.map((seat) => ({
    personaId: seat.persona.id,
    personaName: seat.persona.name,
    canonicalName: seat.persona.realHumanBasis.displayName,
    packagePath: `.openbasaka/nuwa-council/${seat.persona.id}`,
    packageStatus: ready ? 'ready' as const : 'partial' as const,
    canUseAsLocalSkill: ready,
    canClaimSourceAudit: false,
    localPackageScore: ready ? 96 : 70,
    sourceIndexDepthScore: ready ? 72 : 38,
    overallPreflightScore: ready ? 87 : 58,
    validationQuestionsFound: ready ? 5 : 2,
    mentalModelsFound: ready ? 3 : 1,
    decisionHeuristicsFound: ready ? 5 : 2,
    honestBoundaryFound: ready,
    noAuthorizationBoundaryFound: ready,
    fileStatuses: [],
    researchStreams: [],
    missingProof: ready ? [] : ['local package incomplete'],
    nextProof: [],
    warnings: ready ? [] : ['needs package repair'],
  }))
  return {
    generatedAt: '2026-05-05T00:00:00.000Z',
    rootPath: '.',
    personaCount: reports.length,
    localReadyCount: ready ? reports.length : 0,
    localBlockedCount: ready ? 0 : reports.length,
    autoSourceClaimReadyCount: 0,
    templateOnlyResearchFileCount: ready ? 0 : reports.length * 6,
    averageLocalPackageScore: ready ? 96 : 70,
    averageSourceIndexDepthScore: ready ? 72 : 38,
    reports,
    summary: ready ? 'all local packages ready' : 'packages blocked',
    hardTruth: ['自动预检不能替代人工来源级复核。'],
    gapTo95: ready ? [] : ['repair local package'],
  }
}

describe('xiaobai council 95 certification gate', () => {
  it('blocks 95 claims when human validation and source audits are missing', () => {
    const gate = buildCouncil95CertificationGate({
      selection,
      qualityGate: qualityGate(),
      excellenceAudit: excellenceAudit(),
      runtimeEvidence: runtimeEvidence(),
      runtimeCalibrationPlan: calibrationPlan(),
      userValidationLedger: userValidation('collecting'),
      artifactReviewLedger: artifactReview('missing'),
      nuwaEvidenceRegistry: nuwaRegistry(false),
      nuwaLocalPreflight: nuwaPreflight(),
      sourceAuditLedger: sourceAuditLedger(false),
      generatedAt: '2026-05-05T00:00:00.000Z',
    })

    expect(gate.status).toBe('needs-human-proof')
    expect(gate.claimAllowed).toBe(false)
    expect(gate.score).toBeLessThan(95)
    expect(gate.blockers.join('\n')).toContain('真实小白用户验证')
    expect(gate.blockers.join('\n')).toContain('人工审美与产物验收')
    expect(gate.blockers.join('\n')).not.toContain('入选角色来源级复核')
    expect(gate.checks.find((item) => item.id === 'selected-source-audit')?.hardGate).toBe(false)
    expect(renderCouncil95CertificationMarkdown(gate)).toContain('claimAllowed: no')
  })

  it('allows a 95 candidate only when every hard gate is proven', () => {
    const gate = buildCouncil95CertificationGate({
      selection,
      qualityGate: qualityGate(),
      excellenceAudit: excellenceAudit(),
      runtimeEvidence: runtimeEvidence(),
      runtimeCalibrationPlan: calibrationPlan(),
      userValidationLedger: userValidation(),
      artifactReviewLedger: artifactReview(),
      nuwaEvidenceRegistry: nuwaRegistry(),
      nuwaLocalPreflight: nuwaPreflight(),
      sourceAuditLedger: sourceAuditLedger(),
      generatedAt: '2026-05-05T00:00:00.000Z',
    })

    expect(gate.status).toBe('candidate-95')
    expect(gate.claimAllowed).toBe(true)
    expect(gate.score).toBeGreaterThanOrEqual(95)
    expect(gate.blockers).toHaveLength(0)
    expect(gate.checks.filter((item) => item.hardGate).every((item) => item.status === 'pass')).toBe(true)
  })

  it('can reuse runtime history quality evidence after a reload without making source audit a hard blocker', () => {
    const gate = buildCouncil95CertificationGate({
      selection: null,
      qualityGate: null,
      excellenceAudit: null,
      historicalExcellenceScore: 95,
      runtimeEvidence: runtimeEvidence(),
      runtimeCalibrationPlan: calibrationPlan(),
      userValidationLedger: userValidation(),
      artifactReviewLedger: artifactReview(),
      nuwaEvidenceRegistry: nuwaRegistry(false),
      nuwaLocalPreflight: nuwaPreflight(),
      sourceAuditLedger: sourceAuditLedger(false),
      generatedAt: '2026-05-05T00:00:00.000Z',
    })

    expect(gate.status).toBe('candidate-95')
    expect(gate.checks.find((item) => item.id === 'quality-and-excellence')?.status).toBe('pass')
    expect(gate.checks.find((item) => item.id === 'selected-source-audit')?.hardGate).toBe(false)
    expect(gate.blockers.join('\n')).not.toContain('入选角色来源级复核')
  })

  it('does not trust claimed runtime without verifiable deep-model trace', () => {
    const forged = runtimeEvidence()
    forged.deepRunCertification.modelJudgeTraceVerified = false
    const gate = buildCouncil95CertificationGate({
      selection,
      qualityGate: qualityGate(),
      excellenceAudit: excellenceAudit(),
      runtimeEvidence: forged,
      runtimeCalibrationPlan: calibrationPlan(),
      userValidationLedger: userValidation(),
      artifactReviewLedger: artifactReview(),
      nuwaEvidenceRegistry: nuwaRegistry(),
      nuwaLocalPreflight: nuwaPreflight(),
      sourceAuditLedger: sourceAuditLedger(),
      generatedAt: '2026-05-05T00:00:00.000Z',
    })

    expect(gate.claimAllowed).toBe(false)
    expect(gate.checks.find((item) => item.id === 'deep-model-long-run')?.status).not.toBe('pass')
  })

  it('blocks 95 claims when selected sages do not have independent Nuwa packages', () => {
    const gate = buildCouncil95CertificationGate({
      selection,
      qualityGate: qualityGate(),
      excellenceAudit: excellenceAudit(),
      runtimeEvidence: runtimeEvidence(),
      runtimeCalibrationPlan: calibrationPlan(),
      userValidationLedger: userValidation(),
      artifactReviewLedger: artifactReview(),
      nuwaEvidenceRegistry: nuwaRegistry(),
      nuwaLocalPreflight: nuwaPreflight(false),
      sourceAuditLedger: sourceAuditLedger(),
      generatedAt: '2026-05-05T00:00:00.000Z',
    })

    expect(gate.claimAllowed).toBe(false)
    expect(gate.blockers.join('\n')).toContain('Nuwa-skill 独立蒸馏包')
    expect(gate.checks.find((item) => item.id === 'nuwa-local-skills')?.hardGate).toBe(true)
  })
})
