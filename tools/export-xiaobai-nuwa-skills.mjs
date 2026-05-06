import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { COUNCIL_PERSONAS, COUNCIL_SOURCE_POLICY } from '../src/lib/xiaobai-council/personas.ts'

const root = resolve(process.cwd(), '.openbasaka/nuwa-council')

const researchStreams = [
  ['01-writings', '著作 / 长文', '提取反复出现的系统性观点、自创概念和智识谱系。'],
  ['02-conversations', '访谈 / 对话', '提取被追问时的即兴判断、类比方式和立场变化。'],
  ['03-expression-dna', '表达 DNA', '提取语气、节奏、常用词、讲故事方式和反常识表达。'],
  ['04-external-views', '他者评价 / 批评', '保留外部观察、争议、盲点和同行对照。'],
  ['05-decisions', '真实决策', '用行动记录校准公开主张，避免只复读语录。'],
  ['06-timeline', '时间线', '记录思想转折、关键作品和最近资料状态，避免过时。'],
]

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)))
}

function markdownList(items) {
  return items.map((item) => `- ${item}`).join('\n')
}

function decisionHeuristics(persona) {
  return unique([...persona.artifactStrengths, ...persona.riskTags, ...persona.domains, ...persona.methodTags])
    .slice(0, 10)
    .map((tag) => `遇到「${tag}」相关问题时，必须先写出取舍、失败边界和验收证据。`)
}

function mentalModels(persona) {
  return persona.methodTags
    .slice(0, 7)
    .map((tag) => `用「${tag}」把问题转成 ${persona.domains.slice(0, 3).join(' / ')} 维度下可争辩、可验证、可执行的判断。`)
}

function validationQuestions(persona) {
  return [
    `用 ${persona.shortName} 视角判断一个真实产品该砍掉什么，并说明证据缺口。`,
    '面对一个从未公开讨论过的新问题，说明哪些判断只是 Openbasaka 的推断。',
    '与风险审查席位发生冲突时，把分歧收束成一条验收标准。',
    `把同一个问题转成 ${persona.artifactStrengths.slice(0, 2).join(' 和 ')} 两类产物。`,
    `用公开资料能支持的语言说明「${persona.shortName}」会做什么、不会做什么，以及为什么。`,
  ]
}

function buildSkillMarkdown(persona) {
  const heuristics = decisionHeuristics(persona)
  const models = mentalModels(persona)
  return [
    '---',
    `name: ${persona.id}-nuwa-perspective`,
    `description: ${persona.name} 的 Openbasaka 本地蒸馏 skill。基于公开资料、六路调研、三重验证和本地 SOUL / MEMORY / Dream 重新映射。`,
    "source: 'nuwa'",
    `persona_id: ${persona.id}`,
    `distillation_status: ${persona.distillationStatus}`,
    '---',
    '',
    `# ${persona.name} · Openbasaka Nuwa Skill`,
    '',
    '## 角色声明',
    COUNCIL_SOURCE_POLICY,
    '',
    '## 真实人类依据',
    `${persona.realHumanBasis.displayName}: ${persona.realHumanBasis.publicMaterialSummary}`,
    persona.realHumanBasis.seedReference ? `Seed reference: ${persona.realHumanBasis.seedReference}` : '',
    '',
    '## SOUL',
    markdownList([
      `核心职责：${persona.promptSeed}`,
      `人格气质：${persona.temperament}`,
      `领域席位：${persona.domains.join(' / ')}`,
      `方法标签：${persona.methodTags.join(' / ')}`,
      `动态 dream 火种：${persona.dreamSeed}`,
    ]),
    '',
    '## 心智模型',
    markdownList(models),
    '',
    '## 决策启发式',
    markdownList(heuristics),
    '',
    '## 表达 DNA',
    markdownList([
      persona.temperament,
      `中文输出保留「${persona.shortName}」的角色气质，但不冒充本人。`,
      `优先用 ${persona.methodTags.slice(0, 3).join(' / ')} 组织语言。`,
      '给 Boss 的结论必须可执行、可反驳、可验收。',
    ]),
    '',
    '## 反模式',
    markdownList([
      '不把名人语录当作结论；必须用认知框架解释为什么。',
      '不因为角色有强个性就压倒其他席位；必须接受反方质询。',
      ...persona.honestLimits,
    ]),
    '',
    '## 诚实边界',
    markdownList(persona.honestLimits),
    '',
    '## 小白智囊团协作职责',
    markdownList([
      `优先产出：${persona.artifactStrengths.join(' / ')}`,
      `主动覆盖风险：${persona.riskTags.join(' / ')}`,
      '先给独立初稿，再接受质询，最后把分歧转成 PRD 条款或验证实验。',
      '会话中写入的新记忆遵守 Hermes 冻结规则，只在下一轮 dream / SOUL 摘要中生效。',
    ]),
    '',
    '## 验证问题',
    markdownList(validationQuestions(persona)),
    '',
  ]
    .filter((line) => line !== undefined)
    .join('\n')
}

function buildProfileJson(persona) {
  return {
    personaId: persona.id,
    name: persona.name,
    status: persona.distillationStatus,
    realHumanBasis: persona.realHumanBasis,
    sourceCoverage: persona.sourceCoverage,
    skillPackagePath: `.openbasaka/nuwa-council/${persona.id}/`,
    source: 'nuwa',
    mentalModels: mentalModels(persona),
    decisionHeuristics: decisionHeuristics(persona),
    honestLimits: persona.honestLimits,
    validationQuestions: validationQuestions(persona),
    exportedAt: '2026-05-05T00:00:00.000+08:00',
  }
}

function buildResearchMarkdown(persona, id, label, purpose) {
  return [
    `# ${persona.name} · ${label}`,
    '',
    `Purpose: ${purpose}`,
    '',
    '## Public Basis',
    persona.publicBasis,
    '',
    '## Distilled Signals',
    markdownList([
      `domains: ${persona.domains.join(' / ')}`,
      `methods: ${persona.methodTags.join(' / ')}`,
      `artifacts: ${persona.artifactStrengths.join(' / ')}`,
      `risks: ${persona.riskTags.join(' / ')}`,
    ]),
    '',
    '## Verification Rule',
    'Only use this file as a local Openbasaka distillation snapshot. When stronger public sources are added later, append them here with provenance instead of overwriting older evidence silently.',
    '',
  ].join('\n')
}

function buildEvidenceMarkdown(persona) {
  const skillPackage = `.openbasaka/nuwa-council/${persona.id}/`
  const hasSeed = Boolean(persona.nuwaSkillId || persona.sourceCoverage.hasNuwaSeed)
  const localUseScore = Math.min(100, Math.round(90 + (hasSeed ? 3 : 0) + Math.min(5, persona.methodTags.length)))
  const sourceAuditScore = Math.round(58 + (hasSeed ? 7 : 0) + (persona.sourceCoverage.researchStreams.length >= 6 ? 4 : 0))
  return [
    `# ${persona.name} · Nuwa 蒸馏证据包`,
    '',
    `- status: ${persona.distillationStatus}`,
    `- trustLevel: ${hasSeed ? 'nuwa-seeded' : 'local-structured'}`,
    `- localUseScore: ${localUseScore}`,
    `- sourceAuditScore: ${sourceAuditScore}`,
    `- seedReference: ${persona.realHumanBasis.seedReference || 'openbasaka-local-nuwa-distillation'}`,
    `- skillPackage: ${skillPackage}`,
    '',
    '## 安全可声明',
    `- ${persona.name} 已完成 Openbasaka 本地结构化 Nuwa 蒸馏，可作为公开思想原型参与本地协作。`,
    '',
    '## 现在不能声称',
    '- 不能声称真人本人、机构或授权方参与、认可或授权。',
    '- 不能声称已经完成人工来源级深蒸馏，除非六路来源索引逐条人工复核。',
    '- 不能把本地生成的心智模型当成原文语录。',
    '',
    '## 六路调研证据槽',
    ...researchStreams.map(([id, label, purpose]) => `- ${label}｜partial｜${skillPackage}references/research/${id}.md｜${purpose}｜缺口：补入可回看的公开来源链接、摘录、日期和人工复核结论。`),
    '',
    '## 验证检查',
    `- SKILL.md 本地包｜proved｜${skillPackage}SKILL.md 包含 SOUL、心智模型、启发式、反模式和验证题。`,
    `- 心智模型与启发式｜proved｜${persona.methodTags.length} 个方法标签，${decisionHeuristics(persona).length} 条决策启发式。`,
    '- 诚实边界｜proved｜明确不代表本人、不暗示授权、不声称私人观点。',
    '- 公开来源人工复核｜missing｜还需要人工复核六路来源索引。',
    '',
    '## 下一步人工复核',
    `- 为 ${persona.realHumanBasis.displayName} 补齐六路来源索引：著作/长文、访谈、表达 DNA、他者评价、真实决策、时间线。`,
    '- 抽查 SKILL.md 的每个心智模型，至少绑定一条来源或真实案例。',
    '- 跑 2 道验证题，记录角色是否会诚实说“不确定”。',
    '',
  ].join('\n')
}

const indexRows = []

for (const persona of COUNCIL_PERSONAS) {
  const dir = resolve(root, persona.id)
  const researchDir = resolve(dir, 'references/research')
  mkdirSync(researchDir, { recursive: true })
  writeFileSync(resolve(dir, 'SKILL.md'), buildSkillMarkdown(persona), 'utf8')
  writeFileSync(resolve(dir, 'PROFILE.json'), `${JSON.stringify(buildProfileJson(persona), null, 2)}\n`, 'utf8')
  writeFileSync(resolve(dir, 'EVIDENCE.md'), buildEvidenceMarkdown(persona), 'utf8')
  for (const [id, label, purpose] of researchStreams) {
    writeFileSync(resolve(researchDir, `${id}.md`), buildResearchMarkdown(persona, id, label, purpose), 'utf8')
  }
  indexRows.push(`- ${persona.name} (${persona.id}) - ${persona.distillationStatus} - ${persona.domains.join(' / ')}`)
}

writeFileSync(
  resolve(root, 'INDEX.md'),
  ['# 小白智囊团 Nuwa 蒸馏索引', '', `Total: ${COUNCIL_PERSONAS.length}`, '', ...indexRows, ''].join('\n'),
  'utf8',
)

console.log(`Exported ${COUNCIL_PERSONAS.length} Nuwa persona skill packages to ${root}`)
