import { describe, expect, it } from 'vitest'
import { COUNCIL_PERSONAS } from '../personas'
import {
  buildCouncilNuwaEvidencePack,
  buildCouncilNuwaEvidenceRegistry,
  renderCouncilNuwaEvidenceRegistryMarkdown,
} from '../distillation-evidence'

describe('xiaobai council Nuwa distillation evidence', () => {
  it('builds an honest evidence pack for every local persona without overclaiming source audit', () => {
    const registry = buildCouncilNuwaEvidenceRegistry(COUNCIL_PERSONAS, '2026-05-05T00:00:00.000Z')

    expect(registry.personaCount).toBe(36)
    expect(registry.localReadyCount).toBe(36)
    expect(registry.manualSourceAuditedCount).toBe(0)
    expect(registry.averageLocalUseScore).toBeGreaterThanOrEqual(88)
    expect(registry.averageSourceAuditScore).toBeLessThan(80)
    expect(registry.gapTo95.join('\n')).toContain('人工复核')

    for (const pack of registry.packs) {
      expect(pack.safeClaim).toContain('本地结构化 Nuwa 蒸馏')
      expect(pack.cannotClaim.join('\n')).toContain('授权')
      expect(pack.streams).toHaveLength(6)
      expect(pack.streams.every((stream) => stream.status === 'partial')).toBe(true)
      expect(pack.validationChecks.map((check) => check.id)).toContain('public-source-audit')
      expect(pack.exportFiles.join('\n')).toContain('EVIDENCE.md')
    }
  })

  it('marks seeded personas separately while still requiring manual review', () => {
    const persona = COUNCIL_PERSONAS.find((item) => item.id === 'jobs-product-director') || COUNCIL_PERSONAS[0]
    const pack = buildCouncilNuwaEvidencePack(persona)

    expect(pack.trustLevel).toBe('nuwa-seeded')
    expect(pack.seedReference).toContain('nuwa-skill')
    expect(pack.manualSourceAuditReady).toBe(false)
    expect(pack.nextManualReview.join('\n')).toContain('六路来源索引')
  })

  it('exports markdown with safe claims, gaps, and per-person packs', () => {
    const registry = buildCouncilNuwaEvidenceRegistry(COUNCIL_PERSONAS.slice(0, 2), '2026-05-05T00:00:00.000Z')
    const markdown = renderCouncilNuwaEvidenceRegistryMarkdown(registry)

    expect(markdown).toContain('Nuwa 蒸馏证据总账')
    expect(markdown).toContain('manualSourceAudited: 0/2')
    expect(markdown).toContain('现在不能声称')
    expect(markdown).toContain('公开来源人工复核')
  })

  it('upgrades source audit score only with a passed manual source audit ledger', () => {
    const persona = COUNCIL_PERSONAS[0]
    const registry = buildCouncilNuwaEvidenceRegistry([persona], '2026-05-05T00:00:00.000Z', {
      records: [
        {
          id: 'audit-1',
          personaId: persona.id,
          personaName: persona.name,
          reviewerAlias: 'reviewer',
          savedAt: '2026-05-05T00:00:00.000Z',
          sourceIndexSummary: '已核对六路公开来源索引和验证题。',
          checkedSkillMd: true,
          checkedEvidenceMd: true,
          checkedSixStreams: true,
          validationQuestionsRun: 2,
          uncertaintyBoundaryConfirmed: true,
          noAuthorizationClaimConfirmed: true,
          passed: true,
          failureReasons: [],
        },
      ],
      stats: {
        totalRecords: 1,
        auditedPersonaCount: 1,
        failedRecordCount: 0,
        personaCount: 36,
        coverageRatio: 3,
        latestAuditAt: '2026-05-05T00:00:00.000Z',
      },
    })

    expect(registry.manualSourceAuditedCount).toBe(1)
    expect(registry.packs[0].manualSourceAuditReady).toBe(true)
    expect(registry.packs[0].sourceAuditScore).toBeGreaterThanOrEqual(90)
    expect(registry.packs[0].cannotClaim.join('\n')).toContain('授权')
  })
})
