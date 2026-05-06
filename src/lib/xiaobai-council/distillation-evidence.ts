import {
  buildCouncilDistillationProfile,
  COUNCIL_DISTILLATION_STATUS_LABELS,
  type CouncilDistillationProfile,
} from './distillation'
import { COUNCIL_PERSONAS, type CouncilPersona } from './personas'
import {
  getCouncilNuwaPersonaSourceAudit,
  type CouncilNuwaSourceAuditLedger,
  type CouncilNuwaSourceAuditRecord,
} from './source-audit'

export type CouncilNuwaEvidenceStatus = 'proved' | 'partial' | 'missing'

export interface CouncilNuwaEvidenceStream {
  id: string
  label: string
  path: string
  status: CouncilNuwaEvidenceStatus
  evidence: string
  missingProof: string
}

export interface CouncilNuwaValidationCheck {
  id: string
  label: string
  status: CouncilNuwaEvidenceStatus
  evidence: string
  requiredNextProof: string
}

export interface CouncilNuwaEvidencePack {
  personaId: string
  personaName: string
  shortName: string
  statusLabel: string
  trustLevel: 'local-structured' | 'nuwa-seeded' | 'source-audit-ready'
  skillPackagePath: string
  seedReference: string
  localSkillReady: boolean
  sixStreamReady: boolean
  manualSourceAuditReady: boolean
  localUseScore: number
  sourceAuditScore: number
  overallScore: number
  sourceAuditRecord?: CouncilNuwaSourceAuditRecord
  streams: CouncilNuwaEvidenceStream[]
  validationChecks: CouncilNuwaValidationCheck[]
  safeClaim: string
  cannotClaim: string[]
  nextManualReview: string[]
  exportFiles: string[]
}

export interface CouncilNuwaEvidenceRegistry {
  generatedAt: string
  personaCount: number
  localReadyCount: number
  sourceSeededCount: number
  manualSourceAuditedCount: number
  averageLocalUseScore: number
  averageSourceAuditScore: number
  packs: CouncilNuwaEvidencePack[]
  summary: string
  gapTo95: string[]
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return clampScore(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function hasEnoughText(value: string, min = 12): boolean {
  return value.replace(/\s+/g, '').length >= min
}

function buildStreamEvidence(profile: CouncilDistillationProfile): CouncilNuwaEvidenceStream[] {
  return profile.researchFiles.map((file) => ({
    id: file.id,
    label: file.label,
    path: file.path,
    status: 'partial',
    evidence: `已生成本地六路调研槽位，用于承接 ${file.purpose}`,
    missingProof: '还需要补入可回看的公开来源链接、摘录、日期和人工复核结论。',
  }))
}

function buildValidationChecks(persona: CouncilPersona, profile: CouncilDistillationProfile): CouncilNuwaValidationCheck[] {
  const enoughModels = profile.mentalModels.length >= 3
  const enoughHeuristics = profile.decisionHeuristics.length >= 5
  const honestBoundary = profile.honestLimits.some((item) => item.includes('不代表本人')) && profile.honestLimits.length >= 3
  const validationReady = profile.validationQuestions.length >= 5
  const sourceBoundary = persona.sourceCoverage.publicMaterialEnough && hasEnoughText(profile.realHumanBasis.publicMaterialSummary)
  return [
    {
      id: 'skill-md',
      label: 'SKILL.md 本地包',
      status: persona.distillationStatus === 'imported' ? 'proved' : 'partial',
      evidence: `${profile.skillPackagePath}SKILL.md 可由 xiaobai:distill 导出，包含 SOUL、心智模型、启发式、反模式和验证题。`,
      requiredNextProof: '运行导出脚本并抽查文件内容、frontmatter、source=nuwa 标记。',
    },
    {
      id: 'mental-models',
      label: '心智模型与启发式',
      status: enoughModels && enoughHeuristics ? 'proved' : 'partial',
      evidence: `${profile.mentalModels.length} 个心智模型，${profile.decisionHeuristics.length} 条决策启发式。`,
      requiredNextProof: '每个模型至少补一条来源摘录或真实案例校准。',
    },
    {
      id: 'honest-boundary',
      label: '诚实边界',
      status: honestBoundary ? 'proved' : 'missing',
      evidence: profile.honestLimits.slice(0, 2).join(' / ') || '暂无诚实边界。',
      requiredNextProof: '确认不会暗示真人授权、私人观点或完整人格复制。',
    },
    {
      id: 'validation-questions',
      label: '验证题',
      status: validationReady ? 'proved' : 'partial',
      evidence: `${profile.validationQuestions.length} 道角色验证题。`,
      requiredNextProof: '至少跑过 2 道验证题并记录通过/失败/返修。',
    },
    {
      id: 'public-source-audit',
      label: '公开来源人工复核',
      status: 'missing',
      evidence: sourceBoundary ? '已有公开材料摘要和六路槽位。' : '公开材料摘要不足。',
      requiredNextProof: '人工复核著作/访谈/表达/他评/决策/时间线六类来源，并保存可回看索引。',
    },
  ]
}

export function buildCouncilNuwaEvidencePack(persona: CouncilPersona, sourceAuditLedger?: CouncilNuwaSourceAuditLedger): CouncilNuwaEvidencePack {
  const profile = buildCouncilDistillationProfile(persona)
  const sourceAuditRecord = getCouncilNuwaPersonaSourceAudit(sourceAuditLedger, persona.id)
  const streams = buildStreamEvidence(profile)
  const validationChecks = buildValidationChecks(persona, profile)
  const auditedChecks = validationChecks.map((check) =>
    check.id === 'public-source-audit' && sourceAuditRecord
      ? {
          ...check,
          status: 'proved' as const,
          evidence: `人工复核已通过：${sourceAuditRecord.sourceIndexSummary}`,
          requiredNextProof: '后续若角色能力更新，需重新抽查来源索引与验证题。',
        }
      : check,
  )
  const provedChecks = auditedChecks.filter((check) => check.status === 'proved').length
  const localSkillReady = persona.distillationStatus === 'imported'
  const sixStreamReady = streams.length >= 6 && persona.sourceCoverage.researchStreams.length >= 6
  const hasSeed = Boolean(persona.nuwaSkillId || persona.sourceCoverage.hasNuwaSeed)
  const manualSourceAuditReady = Boolean(sourceAuditRecord)
  const localUseScore = clampScore(
    72 +
      (localSkillReady ? 8 : 0) +
      (sixStreamReady ? 6 : 0) +
      (hasSeed ? 3 : 0) +
      Math.min(8, profile.mentalModels.length) +
      Math.min(6, profile.decisionHeuristics.length * 0.7) +
      (provedChecks / Math.max(1, validationChecks.length)) * 4,
  )
  const sourceAuditScore = sourceAuditRecord
    ? clampScore(88 + (sourceAuditRecord.validationQuestionsRun >= 2 ? 4 : 0) + (sourceAuditRecord.checkedSixStreams ? 4 : 0))
    : clampScore(48 + (sixStreamReady ? 10 : 0) + (hasSeed ? 7 : 0) + (provedChecks >= 4 ? 6 : 0))
  const trustLevel = manualSourceAuditReady ? 'source-audit-ready' : hasSeed ? 'nuwa-seeded' : 'local-structured'
  return {
    personaId: persona.id,
    personaName: persona.name,
    shortName: persona.shortName,
    statusLabel: COUNCIL_DISTILLATION_STATUS_LABELS[profile.distillationStatus],
    trustLevel,
    skillPackagePath: profile.skillPackagePath,
    seedReference: profile.realHumanBasis.seedReference || 'openbasaka-local-nuwa-distillation',
    localSkillReady,
    sixStreamReady,
    manualSourceAuditReady,
    localUseScore,
    sourceAuditScore,
    overallScore: clampScore(localUseScore * 0.68 + sourceAuditScore * 0.32),
    sourceAuditRecord,
    streams,
    validationChecks: auditedChecks,
    safeClaim: `${persona.name} 已完成 Openbasaka 本地结构化 Nuwa 蒸馏，可作为公开思想原型参与本地协作。`,
    cannotClaim: [
      '不能声称真人本人、机构或授权方参与、认可或授权。',
      '不能声称已经完成人工来源级深蒸馏，除非六路来源索引逐条人工复核。',
      '不能把本地生成的心智模型当成原文语录。',
    ],
    nextManualReview: [
      manualSourceAuditReady
        ? `${persona.realHumanBasis.displayName} 已有通过的来源复核记录；下一次能力更新后重新抽查。`
        : `为 ${persona.realHumanBasis.displayName} 补齐六路来源索引：著作/长文、访谈、表达 DNA、他者评价、真实决策、时间线。`,
      manualSourceAuditReady ? '保留复核者、时间、验证题数量和不确定边界记录。' : '抽查 SKILL.md 的每个心智模型，至少绑定一条来源或真实案例。',
      manualSourceAuditReady ? '不要把复核记录扩展为真人授权或本人背书。' : '跑 2 道验证题，记录角色是否会诚实说“不确定”。',
    ],
    exportFiles: [
      `${profile.skillPackagePath}SKILL.md`,
      `${profile.skillPackagePath}PROFILE.json`,
      `${profile.skillPackagePath}EVIDENCE.md`,
      ...profile.researchFiles.map((file) => file.path),
    ],
  }
}

export function buildCouncilNuwaEvidenceRegistry(
  personas: CouncilPersona[] = COUNCIL_PERSONAS,
  generatedAt = new Date().toISOString(),
  sourceAuditLedger?: CouncilNuwaSourceAuditLedger,
): CouncilNuwaEvidenceRegistry {
  const packs = personas.map((persona) => buildCouncilNuwaEvidencePack(persona, sourceAuditLedger))
  const localReadyCount = packs.filter((pack) => pack.localSkillReady).length
  const sourceSeededCount = packs.filter((pack) => pack.trustLevel === 'nuwa-seeded' || pack.trustLevel === 'source-audit-ready').length
  const manualSourceAuditedCount = packs.filter((pack) => pack.manualSourceAuditReady).length
  return {
    generatedAt,
    personaCount: packs.length,
    localReadyCount,
    sourceSeededCount,
    manualSourceAuditedCount,
    averageLocalUseScore: average(packs.map((pack) => pack.localUseScore)),
    averageSourceAuditScore: average(packs.map((pack) => pack.sourceAuditScore)),
    packs,
    summary: `${localReadyCount}/${packs.length} 位可作为本地 Nuwa 结构化 skill 使用；${manualSourceAuditedCount}/${packs.length} 位完成来源级人工复核。`,
    gapTo95: [
      '至少抽检本轮入选 6 位角色的 SKILL.md、EVIDENCE.md 和六路来源索引。',
      '每个入选角色至少通过 2 道验证题，且必须允许“不确定/证据不足”。',
      '把来源级人工复核结果写回 evidence pack，不能只依赖本地模板化摘要。',
    ],
  }
}

export function renderCouncilNuwaEvidencePackMarkdown(pack: CouncilNuwaEvidencePack): string {
  return [
    `## ${pack.personaName} · Nuwa 蒸馏证据包`,
    '',
    `- status: ${pack.statusLabel}`,
    `- trustLevel: ${pack.trustLevel}`,
    `- localUseScore: ${pack.localUseScore}`,
    `- sourceAuditScore: ${pack.sourceAuditScore}`,
    `- seedReference: ${pack.seedReference}`,
    `- skillPackage: ${pack.skillPackagePath}`,
    `- sourceAuditRecord: ${pack.sourceAuditRecord ? `${pack.sourceAuditRecord.savedAt}｜${pack.sourceAuditRecord.reviewerAlias}` : 'missing'}`,
    '',
    '### 安全可声明',
    `- ${pack.safeClaim}`,
    '',
    '### 现在不能声称',
    ...pack.cannotClaim.map((item) => `- ${item}`),
    '',
    '### 六路调研证据槽',
    ...pack.streams.map((stream) => `- ${stream.label}｜${stream.status}｜${stream.path}｜缺口：${stream.missingProof}`),
    '',
    '### 验证检查',
    ...pack.validationChecks.map((check) => `- ${check.label}｜${check.status}｜${check.evidence}｜下一证据：${check.requiredNextProof}`),
    '',
    '### 下一步人工复核',
    ...pack.nextManualReview.map((item) => `- ${item}`),
  ].join('\n')
}

export function renderCouncilNuwaEvidenceRegistryMarkdown(registry: CouncilNuwaEvidenceRegistry): string {
  return [
    '## Nuwa 蒸馏证据总账',
    '',
    `- generatedAt: ${registry.generatedAt}`,
    `- personaCount: ${registry.personaCount}`,
    `- localReady: ${registry.localReadyCount}/${registry.personaCount}`,
    `- sourceSeeded: ${registry.sourceSeededCount}/${registry.personaCount}`,
    `- manualSourceAudited: ${registry.manualSourceAuditedCount}/${registry.personaCount}`,
    `- averageLocalUseScore: ${registry.averageLocalUseScore}`,
    `- averageSourceAuditScore: ${registry.averageSourceAuditScore}`,
    `- summary: ${registry.summary}`,
    '',
    '### 95 分前缺口',
    ...registry.gapTo95.map((item) => `- ${item}`),
    '',
    ...registry.packs.map(renderCouncilNuwaEvidencePackMarkdown),
  ].join('\n')
}
