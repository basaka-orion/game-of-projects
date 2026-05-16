import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COUNCIL_PERSONAS } from '../personas'
import { runCouncilNuwaLocalPreflight } from '../source-preflight'

function localWorkspaceReadFile(filePath: string): Promise<string> {
  const normalized = filePath.replace(/^\.?\//, '')
  return readFile(join(process.cwd(), normalized), 'utf8').catch(() => `Error reading file: ${filePath}`)
}

describe('xiaobai council real Nuwa local packages', () => {
  it('backs every configured sage with an independent Nuwa skill package', async () => {
    const personaIds = COUNCIL_PERSONAS.map((persona) => persona.id)
    const packagePaths = personaIds.map((id) => `.openbasaka/nuwa-council/${id}`)
    const skillIdentities = COUNCIL_PERSONAS.map((persona) => persona.nuwaSkillId || `openbasaka-local:${persona.id}`)

    expect(new Set(personaIds).size).toBe(COUNCIL_PERSONAS.length)
    expect(new Set(packagePaths).size).toBe(COUNCIL_PERSONAS.length)
    expect(new Set(skillIdentities).size).toBe(COUNCIL_PERSONAS.length)

    const report = await runCouncilNuwaLocalPreflight(COUNCIL_PERSONAS, localWorkspaceReadFile, {
      generatedAt: '2026-05-12T04:00:00.000Z',
    })
    const blocked = report.reports.filter((item) => !item.canUseAsLocalSkill)

    expect(report.personaCount).toBe(COUNCIL_PERSONAS.length)
    expect(report.localReadyCount).toBe(COUNCIL_PERSONAS.length)
    expect(report.localBlockedCount).toBe(0)
    expect(report.averageLocalPackageScore).toBeGreaterThanOrEqual(82)
    expect(blocked.map((item) => item.personaId)).toEqual([])
    expect(report.reports.every((item) => item.mentalModelsFound >= 3)).toBe(true)
    expect(report.reports.every((item) => item.decisionHeuristicsFound >= 5)).toBe(true)
    expect(report.reports.every((item) => item.validationQuestionsFound >= 5)).toBe(true)
    expect(report.reports.every((item) => item.honestBoundaryFound && item.noAuthorizationBoundaryFound)).toBe(true)
    expect(report.hardTruth.join('\n')).toContain('不能替代人工来源级复核')
  })
})
