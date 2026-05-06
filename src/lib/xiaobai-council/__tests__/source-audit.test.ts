import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COUNCIL_PERSONAS } from '../personas'
import { buildCouncilNuwaEvidenceRegistry } from '../distillation-evidence'
import {
  clearCouncilNuwaSourceAuditLedger,
  COUNCIL_NUWA_SOURCE_AUDIT_STORAGE_KEY,
  hasCouncilNuwaPersonaSourceAudit,
  loadCouncilNuwaSourceAuditLedger,
  renderCouncilNuwaSourceAuditMarkdown,
  saveCouncilNuwaSourceAuditRecord,
} from '../source-audit'

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

function validAudit(personaId: string) {
  return {
    personaId,
    reviewerAlias: 'reviewer-1',
    sourceIndexSummary: '已核对著作/长文、访谈、表达 DNA、他者评价、真实决策、时间线六路来源索引，并补充可回看摘要。',
    checkedSkillMd: true,
    checkedEvidenceMd: true,
    checkedSixStreams: true,
    validationQuestionsRun: 2,
    uncertaintyBoundaryConfirmed: true,
    noAuthorizationClaimConfirmed: true,
    savedAt: '2026-05-05T00:00:00.000Z',
  }
}

describe('xiaobai council Nuwa source audit ledger', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
  })

  it('marks a persona source-audited only after a complete manual review record', () => {
    const persona = COUNCIL_PERSONAS[0]
    let ledger = saveCouncilNuwaSourceAuditRecord({
      ...validAudit(persona.id),
      checkedSixStreams: false,
      validationQuestionsRun: 1,
    })

    expect(ledger.records[0].passed).toBe(false)
    expect(hasCouncilNuwaPersonaSourceAudit(ledger, persona.id)).toBe(false)
    expect(buildCouncilNuwaEvidenceRegistry([persona], '2026-05-05T00:00:00.000Z', ledger).manualSourceAuditedCount).toBe(0)

    ledger = saveCouncilNuwaSourceAuditRecord(validAudit(persona.id))
    const registry = buildCouncilNuwaEvidenceRegistry([persona], '2026-05-05T00:00:00.000Z', ledger)

    expect(ledger.stats.auditedPersonaCount).toBe(1)
    expect(hasCouncilNuwaPersonaSourceAudit(ledger, persona.id)).toBe(true)
    expect(registry.manualSourceAuditedCount).toBe(1)
    expect(registry.packs[0].manualSourceAuditReady).toBe(true)
    expect(registry.packs[0].trustLevel).toBe('source-audit-ready')
    expect(registry.packs[0].validationChecks.find((check) => check.id === 'public-source-audit')?.status).toBe('proved')
  })

  it('stores safe source audit summaries and renders markdown', () => {
    const ledger = saveCouncilNuwaSourceAuditRecord({
      ...validAudit(COUNCIL_PERSONAS[0].id),
      reviewerAlias: 'sk-secret-reviewer',
      notes: '不要保存 sk-secret。',
    })
    const stored = loadCouncilNuwaSourceAuditLedger()
    const raw = localStorage.getItem(COUNCIL_NUWA_SOURCE_AUDIT_STORAGE_KEY) || ''

    expect(stored.records).toHaveLength(1)
    expect(raw).not.toContain('sk-secret')
    expect(renderCouncilNuwaSourceAuditMarkdown(ledger)).toContain('Nuwa 来源级人工复核账本')
    expect(clearCouncilNuwaSourceAuditLedger().records).toHaveLength(0)
  })
})
