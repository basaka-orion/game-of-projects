import { describe, expect, it } from 'vitest'
import { COUNCIL_PERSONAS } from '../personas'
import {
  buildAllCouncilDistillationProfiles,
  buildCouncilNuwaSkillDraft,
  COUNCIL_DISTILLATION_STATUS_LABELS,
  getCouncilPersonaDistillationStatus,
  setCouncilPersonaDistillationStatus,
} from '../distillation'

describe('xiaobai council Nuwa distillation profiles', () => {
  it('builds an audit card and local skill package metadata for every current persona', () => {
    const profiles = buildAllCouncilDistillationProfiles()

    expect(profiles).toHaveLength(COUNCIL_PERSONAS.length)
    expect(profiles).toHaveLength(36)
    for (const profile of profiles) {
      expect(profile.realHumanBasis.displayName.length).toBeGreaterThan(2)
      expect(profile.realHumanBasis.publicMaterialSummary).toContain('公开')
      expect(profile.skillPackagePath).toContain(profile.personaId)
      expect(profile.researchFiles.map((file) => file.id)).toEqual([
        '01-writings',
        '02-conversations',
        '03-expression-dna',
        '04-external-views',
        '05-decisions',
        '06-timeline',
      ])
      expect(profile.auditCard.whyEssential).toContain(profile.realHumanBasis.displayName)
      expect(profile.mentalModels.length).toBeGreaterThanOrEqual(3)
      expect(profile.decisionHeuristics.length).toBeGreaterThanOrEqual(5)
      expect(profile.distillationStatus).toBe('imported')
      expect(profile.sourceSummary).toContain('completed')
      expect(profile.honestLimits.join('\n')).toContain('不代表本人')
    }
  })

  it('marks the first batch as locally distilled in the user-facing status label', () => {
    expect(COUNCIL_PERSONAS.every((persona) => persona.distillationStatus === 'imported')).toBe(true)
    expect(COUNCIL_DISTILLATION_STATUS_LABELS.imported).toBe('已蒸馏')
  })

  it('supports reading and overriding Nuwa distillation status locally', () => {
    const persona = COUNCIL_PERSONAS[0]

    expect(getCouncilPersonaDistillationStatus(persona)).toBe(persona.distillationStatus)
    setCouncilPersonaDistillationStatus(persona.id, 'researching')

    expect(getCouncilPersonaDistillationStatus(persona)).toBe('researching')
    setCouncilPersonaDistillationStatus(persona.id, persona.distillationStatus)
  })

  it('creates a self-contained SKILL.md draft with honest limits and validation questions', () => {
    const persona = COUNCIL_PERSONAS.find((item) => item.id === 'jobs-product-director') || COUNCIL_PERSONAS[0]
    const draft = buildCouncilNuwaSkillDraft(persona)

    expect(draft).toContain(`name: ${persona.id}-nuwa-perspective`)
    expect(draft).toContain('## 真实人类依据')
    expect(draft).toContain('## 角色边界')
    expect(draft).toContain('Openbasaka Nuwa Skill')
    expect(draft).toContain('## 心智模型')
    expect(draft).toContain('## 验证问题')
  })
})
