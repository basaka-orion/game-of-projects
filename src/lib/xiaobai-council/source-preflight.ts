import { type CouncilPersona } from './personas'

export interface CouncilNuwaPreflightFileStatus {
  label: string
  path: string
  present: boolean
  bytes: number
  detail: string
}

export interface CouncilNuwaResearchStreamPreflight {
  id: string
  label: string
  path: string
  present: boolean
  hasVerificationRule: boolean
  hasPublicBasis: boolean
  hasDistilledSignals: boolean
  hasUrlOrCitation: boolean
  hasProvenanceFields: boolean
  templateOnly: boolean
  depthScore: number
  detail: string
}

export interface CouncilNuwaPersonaPreflightReport {
  personaId: string
  personaName: string
  canonicalName: string
  packagePath: string
  packageStatus: 'ready' | 'partial' | 'missing'
  canUseAsLocalSkill: boolean
  canClaimSourceAudit: boolean
  localPackageScore: number
  sourceIndexDepthScore: number
  overallPreflightScore: number
  validationQuestionsFound: number
  mentalModelsFound: number
  decisionHeuristicsFound: number
  honestBoundaryFound: boolean
  noAuthorizationBoundaryFound: boolean
  fileStatuses: CouncilNuwaPreflightFileStatus[]
  researchStreams: CouncilNuwaResearchStreamPreflight[]
  missingProof: string[]
  nextProof: string[]
  warnings: string[]
}

export interface CouncilNuwaLocalPreflightReport {
  generatedAt: string
  rootPath: string
  personaCount: number
  localReadyCount: number
  localBlockedCount: number
  autoSourceClaimReadyCount: number
  templateOnlyResearchFileCount: number
  averageLocalPackageScore: number
  averageSourceIndexDepthScore: number
  reports: CouncilNuwaPersonaPreflightReport[]
  summary: string
  hardTruth: string[]
  gapTo95: string[]
}

export type CouncilNuwaPreflightReadFile = (path: string) => Promise<string>

interface LoadedFile {
  label: string
  path: string
  text: string
  present: boolean
}

const RESEARCH_STREAMS = [
  { id: 'writings', label: '著作 / 长文', file: '01-writings.md' },
  { id: 'conversations', label: '访谈 / 对话', file: '02-conversations.md' },
  { id: 'expression-dna', label: '表达 DNA', file: '03-expression-dna.md' },
  { id: 'external-views', label: '他者评价 / 批评', file: '04-external-views.md' },
  { id: 'decisions', label: '真实决策', file: '05-decisions.md' },
  { id: 'timeline', label: '时间线', file: '06-timeline.md' },
]

const SOURCE_HINT_PATTERN = /(https?:\/\/|doi\.org\/|ISBN|arxiv\.org|archive\.org|acm\.org|jstor\.org|stanford\.edu|mit\.edu|harvard\.edu|source:|provenance:|citation:)/i
const PROVENANCE_PATTERN = /(来源|出处|摘录|访问日期|出版|作者|publisher|published|retrieved|accessed|interview|lecture|paper|book|article|transcript|archive)/i

function packagePath(persona: CouncilPersona): string {
  return `.openbasaka/nuwa-council/${persona.id}`
}

function joinPath(rootPath: string, next: string): string {
  const root = rootPath.trim().replace(/\/+$/, '')
  const child = next.replace(/^\/+/, '')
  return root ? `${root}/${child}` : child
}

function isReadError(text: string): boolean {
  return /^Error reading file:/i.test(text.trim())
}

async function loadFile(readFile: CouncilNuwaPreflightReadFile, label: string, path: string): Promise<LoadedFile> {
  try {
    const text = await readFile(path)
    if (isReadError(text)) return { label, path, text: '', present: false }
    return { label, path, text, present: true }
  } catch {
    return { label, path, text: '', present: false }
  }
}

function countSectionBullets(text: string, heading: string): number {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = text.match(new RegExp(`##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, 'i'))
  if (!match) return 0
  return (match[1].match(/^\s*-\s+/gm) || []).length
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function average(values: number[]): number {
  if (!values.length) return 0
  return clamp(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function fileStatus(file: LoadedFile, detail: string): CouncilNuwaPreflightFileStatus {
  return {
    label: file.label,
    path: file.path,
    present: file.present,
    bytes: file.text.length,
    detail: file.present ? detail : '缺失或无法读取。',
  }
}

function detectResearchStream(file: LoadedFile, stream: (typeof RESEARCH_STREAMS)[number]): CouncilNuwaResearchStreamPreflight {
  const text = file.text
  const hasVerificationRule = /Verification Rule|验证规则|复核规则/i.test(text)
  const hasPublicBasis = /Public Basis|公开|public basis/i.test(text)
  const hasDistilledSignals = /Distilled Signals|蒸馏|signals/i.test(text)
  const hasUrlOrCitation = SOURCE_HINT_PATTERN.test(text)
  const hasProvenanceFields = PROVENANCE_PATTERN.test(text)
  const snapshotOnly = /local Openbasaka distillation snapshot|本地.*蒸馏.*快照/i.test(text)
  const templateOnly = file.present && snapshotOnly && !hasUrlOrCitation
  const depthScore = file.present
    ? clamp(
        12 +
          (hasVerificationRule ? 8 : 0) +
          (hasPublicBasis ? 8 : 0) +
          (hasDistilledSignals ? 8 : 0) +
          (hasUrlOrCitation ? 28 : 0) +
          (hasProvenanceFields ? 20 : 0) -
          (templateOnly ? 12 : 0),
      )
    : 0
  return {
    id: stream.id,
    label: stream.label,
    path: file.path,
    present: file.present,
    hasVerificationRule,
    hasPublicBasis,
    hasDistilledSignals,
    hasUrlOrCitation,
    hasProvenanceFields,
    templateOnly,
    depthScore,
    detail: templateOnly
      ? '只有本地蒸馏快照和验证规则，还没有可回看的公开来源链接或摘录。'
      : hasUrlOrCitation
        ? '包含可回看的来源线索，可进入人工复核。'
        : file.present
          ? '有研究槽位，但来源索引仍浅。'
          : '研究流文件缺失。',
  }
}

function parseProfileJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

export function evaluateCouncilNuwaPersonaPreflight(
  persona: CouncilPersona,
  files: {
    skill: LoadedFile
    profile: LoadedFile
    evidence: LoadedFile
    research: LoadedFile[]
  },
): CouncilNuwaPersonaPreflightReport {
  const profileJson = parseProfileJson(files.profile.text)
  const skill = files.skill.text
  const evidence = files.evidence.text
  const researchStreams = RESEARCH_STREAMS.map((stream, index) => detectResearchStream(files.research[index], stream))
  const mentalModelsFound = Math.max(countSectionBullets(skill, '心智模型'), arrayLength(profileJson?.mentalModels))
  const decisionHeuristicsFound = Math.max(countSectionBullets(skill, '决策启发式'), arrayLength(profileJson?.decisionHeuristics))
  const validationQuestionsFound = Math.max(countSectionBullets(skill, '验证问题'), arrayLength(profileJson?.validationQuestions))
  const honestBoundaryFound = /诚实边界/.test(skill) && /不代表本人|不代表.*授权|不能声称/.test(skill)
  const noAuthorizationBoundaryFound = /授权/.test(skill) && /不代表本人|不能声称.*授权|不暗示授权/.test(skill)
  const hasSourceFrontmatter = /source:\s*['"]?nuwa/i.test(skill)
  const hasSoul = /##\s*SOUL/i.test(skill)
  const hasEvidenceBoundaries = /现在不能声称/.test(evidence) && /公开来源人工复核/.test(evidence)
  const hasEvidenceMissingSourceAudit = /missing|缺口|还需要人工复核/i.test(evidence)
  const allCoreFilesPresent = files.skill.present && files.profile.present && files.evidence.present
  const allResearchPresent = researchStreams.every((stream) => stream.present)
  const profileLooksImported = profileJson?.source === 'nuwa' && profileJson?.status === 'imported'
  const localPackageScore = clamp(
    (allCoreFilesPresent ? 20 : 0) +
      (hasSourceFrontmatter ? 8 : 0) +
      (profileLooksImported ? 8 : 0) +
      (hasSoul ? 8 : 0) +
      (mentalModelsFound >= 3 ? 10 : mentalModelsFound * 2) +
      (decisionHeuristicsFound >= 5 ? 10 : decisionHeuristicsFound * 2) +
      (validationQuestionsFound >= 5 ? 10 : validationQuestionsFound * 2) +
      (honestBoundaryFound ? 10 : 0) +
      (noAuthorizationBoundaryFound ? 6 : 0) +
      (hasEvidenceBoundaries ? 6 : 0) +
      (hasEvidenceMissingSourceAudit ? 4 : 0) +
      (allResearchPresent ? 10 : researchStreams.filter((stream) => stream.present).length),
  )
  const sourceIndexDepthScore = average(researchStreams.map((stream) => stream.depthScore))
  const missingProof = [
    allCoreFilesPresent ? '' : '核心 Nuwa 文件不完整，需要补齐 SKILL.md、PROFILE.json、EVIDENCE.md。',
    allResearchPresent ? '' : '六路研究文件不完整。',
    sourceIndexDepthScore >= 70 ? '' : '六路来源索引还没有足够 URL、摘录、出版信息或访问日期。',
    hasEvidenceMissingSourceAudit ? '' : 'EVIDENCE.md 没有明确标记来源人工复核缺口。',
    validationQuestionsFound >= 5 ? '' : '验证题不足 5 道，无法做稳定角色验收。',
  ].filter(Boolean)
  const warnings = [
    sourceIndexDepthScore < 50 ? '自动预检显示研究索引偏浅，不能计入 source-audit-ready。' : '',
    researchStreams.some((stream) => stream.templateOnly) ? '存在模板化研究槽位，需要补真实来源后再人工复核。' : '',
    noAuthorizationBoundaryFound ? '' : '授权边界不够明确，存在人格蒸馏误读风险。',
  ].filter(Boolean)
  const canUseAsLocalSkill = localPackageScore >= 82 && allCoreFilesPresent && honestBoundaryFound && noAuthorizationBoundaryFound
  const canClaimSourceAudit = false
  return {
    personaId: persona.id,
    personaName: persona.name,
    canonicalName: persona.realHumanBasis.displayName,
    packagePath: packagePath(persona),
    packageStatus: canUseAsLocalSkill ? 'ready' : allCoreFilesPresent ? 'partial' : 'missing',
    canUseAsLocalSkill,
    canClaimSourceAudit,
    localPackageScore,
    sourceIndexDepthScore,
    overallPreflightScore: clamp(localPackageScore * 0.62 + sourceIndexDepthScore * 0.38),
    validationQuestionsFound,
    mentalModelsFound,
    decisionHeuristicsFound,
    honestBoundaryFound,
    noAuthorizationBoundaryFound,
    fileStatuses: [
      fileStatus(files.skill, hasSoul ? '包含 SOUL 与本地 skill 声明。' : '文件存在，但 SOUL 结构不足。'),
      fileStatus(files.profile, profileLooksImported ? 'PROFILE.json 标记 source=nuwa 且 imported。' : 'PROFILE.json 存在，但元数据不完整。'),
      fileStatus(files.evidence, hasEvidenceBoundaries ? 'EVIDENCE.md 明确安全声明和来源审计缺口。' : 'EVIDENCE.md 缺少安全边界或来源审计缺口。'),
    ],
    researchStreams,
    missingProof,
    nextProof: [
      `为 ${persona.realHumanBasis.displayName} 的 3-7 个心智模型逐条绑定公开来源。`,
      '给六路研究文件补 URL、出处、日期、短摘、可信度和人工复核结论。',
      '至少运行 2 道验证题，并记录失败案例、返修点和“不确定”边界。',
    ],
    warnings,
  }
}

export async function runCouncilNuwaLocalPreflight(
  personas: CouncilPersona[],
  readFile: CouncilNuwaPreflightReadFile,
  options: { rootPath?: string; generatedAt?: string } = {},
): Promise<CouncilNuwaLocalPreflightReport> {
  const rootPath = options.rootPath || ''
  const reports: CouncilNuwaPersonaPreflightReport[] = []
  for (const persona of personas) {
    const base = joinPath(rootPath, packagePath(persona))
    const researchBase = `${base}/references/research`
    const [skill, profile, evidence, ...research] = await Promise.all([
      loadFile(readFile, 'SKILL.md', `${base}/SKILL.md`),
      loadFile(readFile, 'PROFILE.json', `${base}/PROFILE.json`),
      loadFile(readFile, 'EVIDENCE.md', `${base}/EVIDENCE.md`),
      ...RESEARCH_STREAMS.map((stream) => loadFile(readFile, stream.label, `${researchBase}/${stream.file}`)),
    ])
    reports.push(evaluateCouncilNuwaPersonaPreflight(persona, { skill, profile, evidence, research }))
  }
  const localReadyCount = reports.filter((report) => report.canUseAsLocalSkill).length
  const templateOnlyResearchFileCount = reports.reduce(
    (sum, report) => sum + report.researchStreams.filter((stream) => stream.templateOnly).length,
    0,
  )
  const autoSourceClaimReadyCount = reports.filter((report) => report.canClaimSourceAudit).length
  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    rootPath: rootPath || '.',
    personaCount: reports.length,
    localReadyCount,
    localBlockedCount: reports.length - localReadyCount,
    autoSourceClaimReadyCount,
    templateOnlyResearchFileCount,
    averageLocalPackageScore: average(reports.map((report) => report.localPackageScore)),
    averageSourceIndexDepthScore: average(reports.map((report) => report.sourceIndexDepthScore)),
    reports,
    summary: `${localReadyCount}/${reports.length} 位通过本地 Nuwa 包预检；自动来源审计通过 ${autoSourceClaimReadyCount}/${reports.length} 位。`,
    hardTruth: [
      '本地包预检只能证明文件结构、诚实边界、验证题和六路研究槽位存在。',
      '自动预检不能替代人工来源级复核，也不能替代真实 Boss 使用后的验证。',
      templateOnlyResearchFileCount > 0
        ? `${templateOnlyResearchFileCount} 个研究文件仍是模板化槽位，必须补公开来源后才能冲击 95 分认证。`
        : '研究文件未发现明显模板化槽位，但仍需要人工复核。'
    ],
    gapTo95: [
      autoSourceClaimReadyCount === reports.length ? '' : '来源级深蒸馏仍需要逐人补来源、摘录、日期和人工复核。',
      '真实用户验证账本仍必须由 Boss 或目标用户跑完整流程后填写，系统不能自证满意度。',
      reports.some((report) => !report.canUseAsLocalSkill)
        ? '存在本地包结构阻塞，需要先修包再谈深审计。'
        : '',
    ].filter(Boolean),
  }
}

export function renderCouncilNuwaLocalPreflightMarkdown(report: CouncilNuwaLocalPreflightReport): string {
  return [
    '## Nuwa 本地包自动预检',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- rootPath: ${report.rootPath}`,
    `- localReady: ${report.localReadyCount}/${report.personaCount}`,
    `- autoSourceClaimReady: ${report.autoSourceClaimReadyCount}/${report.personaCount}`,
    `- templateOnlyResearchFiles: ${report.templateOnlyResearchFileCount}`,
    `- averageLocalPackageScore: ${report.averageLocalPackageScore}`,
    `- averageSourceIndexDepthScore: ${report.averageSourceIndexDepthScore}`,
    '',
    '### 硬事实',
    ...report.hardTruth.map((item) => `- ${item}`),
    '',
    '### 95 分缺口',
    ...(report.gapTo95.length ? report.gapTo95.map((item) => `- ${item}`) : ['- 暂无自动预检缺口，但仍需人工验证。']),
    '',
    '### 角色预检',
    ...report.reports.map((item, index) =>
      [
        `#### ${index + 1}. ${item.personaName}`,
        `- localPackageScore: ${item.localPackageScore}`,
        `- sourceIndexDepthScore: ${item.sourceIndexDepthScore}`,
        `- packageStatus: ${item.packageStatus}`,
        `- canUseAsLocalSkill: ${item.canUseAsLocalSkill ? 'yes' : 'no'}`,
        `- canClaimSourceAudit: ${item.canClaimSourceAudit ? 'yes' : 'no'}`,
        `- findings: mentalModels=${item.mentalModelsFound}, heuristics=${item.decisionHeuristicsFound}, validationQuestions=${item.validationQuestionsFound}`,
        `- missingProof: ${item.missingProof.join(' / ') || 'none'}`,
        `- warnings: ${item.warnings.join(' / ') || 'none'}`,
      ].join('\n'),
    ),
  ].join('\n')
}
