import { describe, expect, it } from 'vitest'
import { COUNCIL_PERSONAS } from '../personas'
import {
  renderCouncilNuwaLocalPreflightMarkdown,
  runCouncilNuwaLocalPreflight,
  type CouncilNuwaPreflightReadFile,
} from '../source-preflight'

const persona = COUNCIL_PERSONAS.find((item) => item.id === 'simon-systems') || COUNCIL_PERSONAS[0]

function makeReadFile(files: Record<string, string>): CouncilNuwaPreflightReadFile {
  return async (path: string) => files[path] || `Error reading file: ${path}`
}

function fixtureFiles(extraResearch = ''): Record<string, string> {
  const base = `.openbasaka/nuwa-council/${persona.id}`
  const stream = (label: string) => `# ${label}

## Public Basis
${persona.realHumanBasis.publicMaterialSummary}

## Distilled Signals
- methods: ${persona.methodTags.slice(0, 3).join(' / ')}

## Verification Rule
Only use this file as a local Openbasaka distillation snapshot. When stronger public sources are added later, append them here with provenance instead of overwriting older evidence silently.
${extraResearch}
`
  return {
    [`${base}/SKILL.md`]: `---
name: ${persona.id}-nuwa-perspective
source: 'nuwa'
persona_id: ${persona.id}
distillation_status: imported
---

# ${persona.name} · Openbasaka Nuwa Skill

## 角色声明
公开思想原型，不代表本人、机构或授权。

## SOUL
- 核心职责：${persona.promptSeed}

## 心智模型
- model 1
- model 2
- model 3

## 决策启发式
- h1
- h2
- h3
- h4
- h5

## 诚实边界
- 只能基于公开资料蒸馏，不代表本人、机构、继承人或授权方。
- 不能声称拥有私人未公开观点、直觉、授权关系或实时状态。

## 验证问题
- q1
- q2
- q3
- q4
- q5
`,
    [`${base}/PROFILE.json`]: JSON.stringify({
      personaId: persona.id,
      source: 'nuwa',
      status: 'imported',
      mentalModels: ['m1', 'm2', 'm3'],
      decisionHeuristics: ['h1', 'h2', 'h3', 'h4', 'h5'],
      validationQuestions: ['q1', 'q2', 'q3', 'q4', 'q5'],
    }),
    [`${base}/EVIDENCE.md`]: `# Evidence

## 安全可声明
- 本地结构化 Nuwa 蒸馏。

## 现在不能声称
- 不能声称真人本人、机构或授权方参与、认可或授权。

## 验证检查
- 公开来源人工复核｜missing｜还需要人工复核六路来源索引。
`,
    [`${base}/references/research/01-writings.md`]: stream('writings'),
    [`${base}/references/research/02-conversations.md`]: stream('conversations'),
    [`${base}/references/research/03-expression-dna.md`]: stream('expression'),
    [`${base}/references/research/04-external-views.md`]: stream('external'),
    [`${base}/references/research/05-decisions.md`]: stream('decisions'),
    [`${base}/references/research/06-timeline.md`]: stream('timeline'),
  }
}

describe('xiaobai council Nuwa local preflight', () => {
  it('separates local skill readiness from source-audit claims', async () => {
    const report = await runCouncilNuwaLocalPreflight([persona], makeReadFile(fixtureFiles()), {
      generatedAt: '2026-05-05T00:00:00.000Z',
    })

    expect(report.personaCount).toBe(1)
    expect(report.localReadyCount).toBe(1)
    expect(report.autoSourceClaimReadyCount).toBe(0)
    expect(report.templateOnlyResearchFileCount).toBe(6)
    expect(report.averageLocalPackageScore).toBeGreaterThanOrEqual(90)
    expect(report.averageSourceIndexDepthScore).toBeLessThan(50)
    expect(report.hardTruth.join('\n')).toContain('不能替代人工来源级复核')
    expect(report.reports[0].canUseAsLocalSkill).toBe(true)
    expect(report.reports[0].canClaimSourceAudit).toBe(false)
  })

  it('raises source depth when research files contain provenance but still refuses automatic source audit', async () => {
    const report = await runCouncilNuwaLocalPreflight(
      [persona],
      makeReadFile(fixtureFiles('\nSource: https://example.com/source\nPublished: 2024\nRetrieved: 2026-05-05\nExcerpt: sample.\n')),
      { generatedAt: '2026-05-05T00:00:00.000Z' },
    )

    expect(report.averageSourceIndexDepthScore).toBeGreaterThanOrEqual(70)
    expect(report.autoSourceClaimReadyCount).toBe(0)
    expect(report.reports[0].canClaimSourceAudit).toBe(false)
  })

  it('renders a markdown audit trail', async () => {
    const report = await runCouncilNuwaLocalPreflight([persona], makeReadFile(fixtureFiles()), {
      generatedAt: '2026-05-05T00:00:00.000Z',
    })
    const markdown = renderCouncilNuwaLocalPreflightMarkdown(report)

    expect(markdown).toContain('Nuwa 本地包自动预检')
    expect(markdown).toContain('templateOnlyResearchFiles')
    expect(markdown).toContain(persona.name)
  })
})
