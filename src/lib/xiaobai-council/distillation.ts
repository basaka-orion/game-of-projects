import {
  COUNCIL_PERSONAS,
  type CouncilDistillationStatus,
  type CouncilPersona,
} from './personas'

export interface CouncilDistillationResearchFile {
  id: string
  label: string
  path: string
  purpose: string
}

export interface CouncilDistillationModel {
  id: string
  label: string
  description: string
  sourcePolicy: string
}

export interface CouncilDistillationAuditCard {
  whyEssential: string
  irreplaceableAbility: string
  fitsProblems: string[]
  misfitProblems: string[]
}

export interface CouncilDistillationProfile {
  personaId: string
  personaName: string
  realHumanBasis: CouncilPersona['realHumanBasis']
  nuwaSkillId?: string
  distillationStatus: CouncilDistillationStatus
  skillPackagePath: string
  researchFiles: CouncilDistillationResearchFile[]
  auditCard: CouncilDistillationAuditCard
  mentalModels: CouncilDistillationModel[]
  decisionHeuristics: CouncilDistillationModel[]
  expressionDna: string[]
  antiPatterns: string[]
  innerTensions: string[]
  honestLimits: string[]
  validationQuestions: string[]
  sourceSummary: string
}

const STATUS_OVERRIDES = new Map<string, CouncilDistillationStatus>()

export const COUNCIL_DISTILLATION_STATUS_LABELS: Record<CouncilDistillationStatus, string> = {
  'not-started': '未蒸馏',
  researching: '调研中',
  'pending-validation': '待验证',
  imported: '已蒸馏',
  'needs-retraining': '需要再训练',
}

const RESEARCH_FILES: Array<Omit<CouncilDistillationResearchFile, 'path'>> = [
  {
    id: '01-writings',
    label: '著作 / 长文',
    purpose: '提取反复出现的系统性观点、自创概念和智识谱系。',
  },
  {
    id: '02-conversations',
    label: '访谈 / 对话',
    purpose: '提取被追问时的即兴判断、类比方式和立场变化。',
  },
  {
    id: '03-expression-dna',
    label: '表达 DNA',
    purpose: '提取语气、节奏、常用词、讲故事方式和反常识表达。',
  },
  {
    id: '04-external-views',
    label: '他者评价 / 批评',
    purpose: '保留外部观察、争议、盲点和同行对照。',
  },
  {
    id: '05-decisions',
    label: '真实决策',
    purpose: '用行动记录校准公开主张，避免只复读语录。',
  },
  {
    id: '06-timeline',
    label: '时间线',
    purpose: '记录思想转折、关键作品和最近资料状态，避免过时。',
  },
]

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function compact(value: string, max = 150): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function skillPackagePath(persona: CouncilPersona): string {
  return `.openbasaka/nuwa-council/${persona.id}/`
}

function researchFiles(persona: CouncilPersona): CouncilDistillationResearchFile[] {
  const base = `${skillPackagePath(persona)}references/research`
  return RESEARCH_FILES.map((file) => ({
    ...file,
    path: `${base}/${file.id}.md`,
  }))
}

function buildAuditCard(persona: CouncilPersona): CouncilDistillationAuditCard {
  return {
    whyEssential: `${persona.realHumanBasis.displayName} 代表「${persona.domains.slice(0, 4).join(' / ')}」交叉位置的高密度思维原型，能把 Boss 的问题压到 ${persona.artifactStrengths.slice(0, 3).join(' / ')} 这些可交付成果里。`,
    irreplaceableAbility: persona.promptSeed,
    fitsProblems: persona.artifactStrengths.map((artifact) => `需要 ${artifact} 的问题`),
    misfitProblems: [
      '需要本人授权、私人观点或未公开经历的问题',
      ...persona.riskTags.slice(0, 3).map((tag) => `风险标签已超出可验证边界：${tag}`),
    ],
  }
}

function buildMentalModels(persona: CouncilPersona): CouncilDistillationModel[] {
  return persona.methodTags.slice(0, 7).map((tag, index) => ({
    id: `${slugify(persona.id)}-model-${index + 1}`,
    label: tag,
    description: `用「${tag}」作为观察镜片，把问题转成 ${persona.domains.slice(0, 3).join(' / ')} 维度下可争辩、可验证、可执行的判断。`,
    sourcePolicy: persona.sourceCoverage.hasNuwaSeed
      ? '已吸收现有 Nuwa 示例种子，并完成 Openbasaka SOUL / MEMORY / Dream / 协作职责映射。'
      : '已完成本地 Nuwa 风格六路蒸馏；后续外部来源可继续提升置信度。',
  }))
}

function buildDecisionHeuristics(persona: CouncilPersona): CouncilDistillationModel[] {
  const tags = Array.from(
    new Set([
      ...persona.artifactStrengths,
      ...persona.riskTags,
      ...persona.domains,
      ...persona.methodTags,
    ]),
  ).slice(0, 10)

  return tags.map((tag, index) => ({
    id: `${slugify(persona.id)}-heuristic-${index + 1}`,
    label: tag,
    description: `遇到相关问题时先问：这个方案如何在「${tag}」上产生清晰取舍、失败边界和验收证据？`,
    sourcePolicy: '已进入本地 Nuwa skill 的可用规则；每次使用后由 reflection 记录命中、偏差和证据强度。',
  }))
}

function buildExpressionDna(persona: CouncilPersona): string[] {
  return [
    persona.temperament,
    `中文输出要保留「${persona.shortName}」的角色气质，但不冒充本人。`,
    `优先使用 ${persona.methodTags.slice(0, 3).join(' / ')} 组织语言。`,
  ]
}

function buildAntiPatterns(persona: CouncilPersona): string[] {
  return [
    ...persona.honestLimits,
    '不把名人语录当作结论；必须用认知框架解释为什么。',
    '不因为角色有强个性就压倒其他席位；必须接受反方质询。',
  ]
}

function buildInnerTensions(persona: CouncilPersona): string[] {
  return [
    `强项「${persona.artifactStrengths.slice(0, 2).join(' / ')}」与盲点「${persona.riskTags.slice(0, 2).join(' / ')}」之间需要被反方席位持续质询。`,
    '角色可以有鲜明立场，但最终必须把分歧转成可执行 PRD 条款。',
  ]
}

function buildValidationQuestions(persona: CouncilPersona): string[] {
  return [
    `用 ${persona.shortName} 视角判断一个真实产品该砍掉什么，并说明证据缺口。`,
    `面对一个从未公开讨论过的新问题，说明哪些判断只是 Openbasaka 的推断。`,
    `与风险审查席位发生冲突时，把分歧收束成一条验收标准。`,
    `把同一个问题转成 ${persona.artifactStrengths.slice(0, 2).join(' 和 ')} 两类产物。`,
    `用公开资料能支持的语言说明「${persona.shortName}」会做什么、不会做什么，以及为什么。`,
  ]
}

export function buildCouncilDistillationProfile(persona: CouncilPersona): CouncilDistillationProfile {
  const distillationStatus = STATUS_OVERRIDES.get(persona.id) || persona.distillationStatus
  return {
    personaId: persona.id,
    personaName: persona.name,
    realHumanBasis: persona.realHumanBasis,
    nuwaSkillId: persona.nuwaSkillId,
    distillationStatus,
    skillPackagePath: skillPackagePath(persona),
    researchFiles: researchFiles(persona),
    auditCard: buildAuditCard(persona),
    mentalModels: buildMentalModels(persona),
    decisionHeuristics: buildDecisionHeuristics(persona),
    expressionDna: buildExpressionDna(persona),
    antiPatterns: buildAntiPatterns(persona),
    innerTensions: buildInnerTensions(persona),
    honestLimits: persona.honestLimits,
    validationQuestions: buildValidationQuestions(persona),
    sourceSummary: [
      persona.sourceCoverage.sourceCountHint,
      persona.sourceCoverage.hasNuwaSeed
        ? `Nuwa seed: ${persona.nuwaSkillId} + Openbasaka local mapping completed`
        : 'Nuwa seed: Openbasaka local Nuwa distillation completed',
      `six streams: ${persona.sourceCoverage.researchStreams.join(' / ')}`,
    ].join('\n'),
  }
}

export function buildAllCouncilDistillationProfiles(
  personas: CouncilPersona[] = COUNCIL_PERSONAS,
): CouncilDistillationProfile[] {
  return personas.map(buildCouncilDistillationProfile)
}

export function setCouncilPersonaDistillationStatus(
  personaId: string,
  status: CouncilDistillationStatus,
): CouncilDistillationStatus {
  if (!COUNCIL_PERSONAS.some((persona) => persona.id === personaId)) {
    throw new Error(`未知小白智囊团角色：${personaId}`)
  }
  STATUS_OVERRIDES.set(personaId, status)
  return status
}

export function getCouncilPersonaDistillationStatus(persona: CouncilPersona): CouncilDistillationStatus {
  return STATUS_OVERRIDES.get(persona.id) || persona.distillationStatus
}

export function buildCouncilNuwaSkillDraft(persona: CouncilPersona): string {
  const profile = buildCouncilDistillationProfile(persona)
  return [
    `---`,
    `name: ${persona.id}-nuwa-perspective`,
    `description: ${persona.name} 的 Openbasaka 本地蒸馏 skill。基于公开资料、六路调研、三重验证和本地 SOUL / MEMORY / Dream 重新映射。`,
    `---`,
    ``,
    `# ${persona.name} · Openbasaka Nuwa Skill`,
    ``,
    `## 真实人类依据`,
    `${profile.realHumanBasis.publicMaterialSummary}`,
    ``,
    `## 角色边界`,
    profile.honestLimits.map((item) => `- ${item}`).join('\n'),
    ``,
    `## 心智模型`,
    profile.mentalModels.map((item) => `- ${item.label}: ${compact(item.description, 220)}`).join('\n'),
    ``,
    `## 决策启发式`,
    profile.decisionHeuristics.map((item) => `- ${item.label}: ${compact(item.description, 220)}`).join('\n'),
    ``,
    `## Openbasaka 协作职责`,
    `${persona.promptSeed}`,
    ``,
    `## 验证问题`,
    profile.validationQuestions.map((item) => `- ${item}`).join('\n'),
  ].join('\n')
}
