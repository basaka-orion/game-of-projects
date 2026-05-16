import { dbSaveOperatingEvent } from '../db/repository'
import { getBossProfile, setBossProfile } from '../db/store'
import {
  listBossDistillationClaims,
  type BossDistillationClaim,
  type BossDistillationDimension,
  type BossDistillationEvidenceTier,
} from './distillation'
import type { NormalizedBossProfile } from './profiling/types'

export type SelfDistillationSectionKey =
  | 'mission'
  | 'cognitive_style'
  | 'learning_mode'
  | 'expression_dna'
  | 'energy_rhythm'
  | 'emotion_triggers'
  | 'relationship_boundary'
  | 'decision_pattern'
  | 'project_taste'
  | 'aesthetic_taste'
  | 'authorization_boundary'
  | 'anti_patterns'

export type SelfDistillationSectionStatus = 'evidence_backed' | 'partial' | 'needs_evidence'

export interface SelfDistillationEvidencePoint {
  tier: BossDistillationEvidenceTier
  sourceKind: string
  sourceId: string
  quote: string
  confidence: number
  temporalScope: 'momentary' | 'stage' | 'long_term'
}

export interface SelfDistillationSection {
  key: SelfDistillationSectionKey
  title: string
  plainTitle: string
  status: SelfDistillationSectionStatus
  summary: string
  signals: string[]
  evidence: SelfDistillationEvidencePoint[]
  agentInstruction: string
  missingPrompt: string
}

export interface SelfDistillationProfile {
  version: 'self-distillation-v1'
  generatedAt: string
  headline: string
  summary: string
  coverageScore: number
  sourceCounts: {
    bossProfileSignals: number
    approvedClaims: number
    assessmentSignals: number
  }
  sections: SelfDistillationSection[]
  agentOperatingManual: {
    always: string[]
    adapt: string[]
    mustAsk: string[]
    avoid: string[]
    uncertaintyRules: string[]
  }
  coverageGaps: string[]
  nextCalibrationPrompts: string[]
}

interface SectionDefinition {
  key: SelfDistillationSectionKey
  title: string
  plainTitle: string
  claimDimensions: BossDistillationDimension[]
  missingPrompt: string
  agentInstruction: (signals: string[], evidence: SelfDistillationEvidencePoint[]) => string
  collectSignals: (input: BuildSelfDistillationInput) => string[]
}

interface BuildSelfDistillationInput {
  profile: Record<string, string>
  normalized?: NormalizedBossProfile | null
  approvedClaims?: BossDistillationClaim[]
  generatedAt?: string
}

function unique(values: Array<string | undefined | null>, limit = 12): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const cleaned = (value || '').replace(/\s+/g, ' ').trim()
    if (!cleaned || seen.has(cleaned)) continue
    seen.add(cleaned)
    result.push(cleaned)
    if (result.length >= limit) break
  }
  return result
}

function splitList(value?: string): string[] {
  if (!value) return []
  return unique(value.split(/[\n,，、;；]/), 16)
}

function parseJson<T>(value?: string, fallback?: T): T {
  if (!value) return fallback as T
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback as T
  }
}

function readStringList(source: unknown, key: string): string[] {
  if (!source || typeof source !== 'object') return []
  const value = (source as Record<string, unknown>)[key]
  if (!Array.isArray(value)) return []
  return unique(value.map(String), 12)
}

function summarizeSignals(signals: string[], fallback: string): string {
  if (signals.length === 0) return fallback
  if (signals.length === 1) return signals[0]
  return signals.slice(0, 3).join('；')
}

function mapEvidence(claims: BossDistillationClaim[]): SelfDistillationEvidencePoint[] {
  return claims.slice(0, 4).map((claim) => ({
    tier: claim.evidenceTier,
    sourceKind: claim.evidenceRefs[0]?.sourceKind || claim.sourceKind || 'manual',
    sourceId: claim.evidenceRefs[0]?.sourceId || claim.sourceId || claim.id,
    quote: claim.evidenceRefs[0]?.quote || claim.claim,
    confidence: claim.confidence,
    temporalScope: claim.temporalScope,
  }))
}

function styleLabel(style?: NormalizedBossProfile['operational']['preferredStyle'] | string): string {
  switch (style) {
    case 'analytical':
      return '分析建模'
    case 'visionary':
      return '愿景牵引'
    case 'pragmatic':
      return '务实推进'
    case 'creative':
      return '创意表达'
    default:
      return ''
  }
}

function numberSignal(label: string, value?: string | number): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return ''
  return `${label}: ${Math.round(numeric)}`
}

function getCognitiveProfile(profile: Record<string, string>) {
  return parseJson<Record<string, unknown>>(profile.cognitive_profile_json, {})
}

function getSelfAgentConstitution(profile: Record<string, string>) {
  return parseJson<Record<string, unknown>>(profile.self_agent_constitution_json, {})
}

function getDelegationPolicy(profile: Record<string, string>) {
  return parseJson<Record<string, unknown>>(profile.agent_delegation_policy_json, {})
}

function getProfilingSummary(profile: Record<string, string>) {
  return parseJson<Record<string, unknown>>(profile.profiling_summary_json, {})
}

function getDimensionJson(profile: Record<string, string>, key: string) {
  return parseJson<Record<string, unknown>>(profile[key], {})
}

const SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    key: 'mission',
    title: '使命与当前主线',
    plainTitle: '系统为什么服务你',
    claimDimensions: ['mission', 'value'],
    missingPrompt: '请补一句：Openbasaka 最应该长期帮你守住什么？',
    agentInstruction: (signals) => `回答和行动都要服务这条主线：${summarizeSignals(signals, '先帮 Boss 澄清长期主线。')}`,
    collectSignals: ({ profile, normalized }) => unique([
      profile.long_term_vision || profile.longTermVision,
      normalized?.operational.longTermVision,
      profile.current_focus || profile.currentFocus,
      normalized?.operational.currentFocus,
      normalized?.summary.narrative,
    ], 6),
  },
  {
    key: 'cognitive_style',
    title: '认知风格',
    plainTitle: '你怎么想问题',
    claimDimensions: ['cognitive_style', 'learning_mode'],
    missingPrompt: '请补一句：你遇到复杂问题时，最自然的思考顺序是什么？',
    agentInstruction: (signals) => `先按 Boss 的思考方式组织信息：${summarizeSignals(signals, '先给结构，再给证据和边界。')}`,
    collectSignals: ({ profile, normalized }) => {
      const cognitive = getCognitiveProfile(profile)
      const summary = getProfilingSummary(profile)
      return unique([
        styleLabel(normalized?.operational.preferredStyle || profile.preferredStyle),
        normalized?.summary.promptSummary,
        typeof summary.promptSummary === 'string' ? summary.promptSummary : '',
        ...readStringList(cognitive, 'understandingModes'),
        ...readStringList(cognitive, 'integrationGoals'),
      ], 7)
    },
  },
  {
    key: 'learning_mode',
    title: '学习方式',
    plainTitle: '怎样讲你最容易懂',
    claimDimensions: ['learning_mode'],
    missingPrompt: '请补一句：什么讲法会让你一下子懂了、上头了？',
    agentInstruction: (signals) => `解释知识时优先使用这些入口：${summarizeSignals(signals, '先框架，后例子，再落到行动。')}`,
    collectSignals: ({ profile, normalized }) => {
      const cognitive = getCognitiveProfile(profile)
      return unique([
        ...(normalized?.operational.explanationPreferences || []),
        ...(normalized?.operational.understandingModes || []),
        ...readStringList(cognitive, 'explanationPreferences'),
        ...readStringList(cognitive, 'understandingModes'),
      ], 8)
    },
  },
  {
    key: 'expression_dna',
    title: '表达 DNA',
    plainTitle: '你喜欢什么表达味道',
    claimDimensions: ['expression_dna', 'preference'],
    missingPrompt: '请补一句：什么样的表达会让你有感觉，什么表达会让你立刻失去兴趣？',
    agentInstruction: (signals) => `产出给 Boss 看时，要靠近这些表达偏好：${summarizeSignals(signals, '具体、锋利、有证据，少空话。')}`,
    collectSignals: ({ profile, normalized }) => {
      const cognitive = getCognitiveProfile(profile)
      const constitution = getSelfAgentConstitution(profile)
      return unique([
        ...(normalized?.operational.explanationPreferences || []),
        ...(normalized?.operational.addictiveFormats || []),
        ...(normalized?.operational.resonanceHooks || []),
        ...readStringList(cognitive, 'resonanceHooks'),
        ...readStringList(cognitive, 'addictiveFormats'),
        ...readStringList(constitution, 'expressionDNA'),
      ], 9)
    },
  },
  {
    key: 'energy_rhythm',
    title: '能量节律',
    plainTitle: '什么让你充电或耗电',
    claimDimensions: ['energy_rhythm', 'emotion_weight'],
    missingPrompt: '请补一句：什么环境让你满血，什么环境会让你很快变形？',
    agentInstruction: (signals) => `安排任务时要照顾 Boss 的能量节律：${summarizeSignals(signals, '高复杂任务要减少打断，并留出恢复空间。')}`,
    collectSignals: ({ profile, normalized }) => {
      const cognitive = getCognitiveProfile(profile)
      return unique([
        ...(normalized?.operational.excitementTriggers || []),
        ...readStringList(cognitive, 'excitementTriggers'),
        numberSignal('情绪敏感度', normalized?.dimensions.emotion.self_emotion),
      ], 7)
    },
  },
  {
    key: 'emotion_triggers',
    title: '情绪触发与修复',
    plainTitle: '什么会刺痛你，怎么恢复',
    claimDimensions: ['emotion_weight'],
    missingPrompt: '请补一句：什么最容易让你焦虑、愤怒、羞耻或心寒？你通常怎么恢复？',
    agentInstruction: (signals) => `遇到高压内容时要降低误伤：${summarizeSignals(signals, '先承认不确定性，再给可控下一步。')}`,
    collectSignals: ({ profile, normalized }) => {
      const emotion = getDimensionJson(profile, 'emotion_profile_json')
      return unique([
        numberSignal('自我情绪觉察', emotion.self_emotion as number),
        numberSignal('情绪调节', emotion.emotion_regulation as number),
        numberSignal('共情负载', emotion.empathy as number),
        numberSignal('测评情绪敏感', normalized?.dimensions.emotion.self_emotion),
      ], 6)
    },
  },
  {
    key: 'relationship_boundary',
    title: '关系与边界',
    plainTitle: '哪些关系方式适合你',
    claimDimensions: ['relationship_boundary', 'boundary'],
    missingPrompt: '请补一句：关系和协作里，哪些事情绝对不能替你决定？',
    agentInstruction: (signals) => `协作建议必须尊重这些边界：${summarizeSignals(signals, '涉及关系承诺时必须先问 Boss。')}`,
    collectSignals: ({ profile, normalized }) => {
      const social = getDimensionJson(profile, 'social_profile_json')
      return unique([
        ...splitList(profile.hates),
        numberSignal('社会联结', social.social_connectedness as number),
        numberSignal('冲突处理', social.conflict_style as number),
        numberSignal('关系证据', normalized?.dimensions.social.social_connectedness),
      ], 7)
    },
  },
  {
    key: 'decision_pattern',
    title: '决策模式',
    plainTitle: '你怎么做选择',
    claimDimensions: ['decision_pattern'],
    missingPrompt: '请补一句：什么决策你可以快，什么决策必须慢？',
    agentInstruction: (signals) => `给建议时要匹配这些决策习惯：${summarizeSignals(signals, '高风险先给选项、成本、回滚条件。')}`,
    collectSignals: ({ profile, normalized }) => unique([
      numberSignal('风险容忍', normalized?.operational.riskTolerance ?? profile.riskTolerance),
      numberSignal('创新偏好', normalized?.operational.innovationBias ?? profile.innovationBias),
      normalized?.operational.decisionSpeed || profile.decisionSpeed,
      normalized?.operational.resourceStyle || profile.resourceStyle,
    ], 6),
  },
  {
    key: 'project_taste',
    title: '项目品味',
    plainTitle: '什么项目像你的菜',
    claimDimensions: ['project_taste', 'preference'],
    missingPrompt: '请补一句：你最容易被哪类项目、作品或机会打动？',
    agentInstruction: (signals) => `项目判断要按 Boss 的品味排序：${summarizeSignals(signals, '优先看是否服务长期智能系统主线。')}`,
    collectSignals: ({ profile, normalized }) => unique([
      ...splitList(profile.interests),
      ...(normalized?.operational.interests || []),
      ...(normalized?.recommendations.recommendedProjectDirections || []),
      ...(normalized?.recommendations.recommendedResearchTopics || []),
    ], 10),
  },
  {
    key: 'aesthetic_taste',
    title: '审美与创造偏好',
    plainTitle: '什么风格会让你有感觉',
    claimDimensions: ['aesthetic_taste', 'expression_dna'],
    missingPrompt: '请补一句：你喜欢什么视觉、文字、产品或空间气质？',
    agentInstruction: (signals) => `做界面、报告和创意时要贴近这些审美线索：${summarizeSignals(signals, '少模板感，多结构美和真实质感。')}`,
    collectSignals: ({ profile, normalized }) => {
      const aesthetic = getDimensionJson(profile, 'aesthetic_profile_json')
      const cognitive = getCognitiveProfile(profile)
      return unique([
        ...readStringList(cognitive, 'resonanceHooks'),
        ...(normalized?.operational.resonanceHooks || []),
        numberSignal('审美敏感', aesthetic.aesthetic_sensitivity as number),
        numberSignal('创造力自我', aesthetic.creative_self as number),
      ], 7)
    },
  },
  {
    key: 'authorization_boundary',
    title: '代理授权边界',
    plainTitle: 'Agent 能帮你做到哪一步',
    claimDimensions: ['authorization_boundary', 'boundary'],
    missingPrompt: '请补一句：哪些事 Agent 可以直接帮你推进，哪些必须先问你？',
    agentInstruction: (signals) => `Agent 必须遵守这些授权边界：${summarizeSignals(signals, '只做整理、草案、推演；外部承诺和高风险动作必须询问。')}`,
    collectSignals: ({ profile, normalized }) => {
      const constitution = getSelfAgentConstitution(profile)
      const policy = getDelegationPolicy(profile)
      return unique([
        ...readStringList(constitution, 'authorizationBoundaries'),
        ...readStringList(constitution, 'mustAskUserTasks'),
        ...readStringList(policy, 'authorizationBoundaries'),
        ...readStringList(policy, 'mustAskUserTasks'),
        ...(normalized?.selfAgentConstitution?.authorizationBoundaries || []),
        ...(normalized?.selfAgentConstitution?.mustAskUserTasks || []),
      ], 10)
    },
  },
  {
    key: 'anti_patterns',
    title: '反模式与禁区',
    plainTitle: '什么会让系统变讨厌',
    claimDimensions: ['anti_pattern', 'boundary'],
    missingPrompt: '请补一句：哪些表达、行为或系统设计会让你明确不接受？',
    agentInstruction: (signals) => `必须避开这些反模式：${summarizeSignals(signals, '不要空泛、不要无证据、不要替 Boss 做高风险决定。')}`,
    collectSignals: ({ profile, normalized }) => {
      const cognitive = getCognitiveProfile(profile)
      return unique([
        ...splitList(profile.hates),
        ...(normalized?.operational.dislikes || []),
        ...(normalized?.operational.antiPatterns || []),
        ...readStringList(cognitive, 'antiPatterns'),
      ], 10)
    },
  },
]

function claimsForSection(
  claims: BossDistillationClaim[],
  definition: SectionDefinition,
): BossDistillationClaim[] {
  return claims
    .filter((claim) => definition.claimDimensions.includes(claim.dimension))
    .sort((left, right) => right.confidence - left.confidence)
}

function sectionStatus(signals: string[], evidence: SelfDistillationEvidencePoint[]): SelfDistillationSectionStatus {
  if (evidence.some((item) => item.tier === 'boss_verbatim' || item.tier === 'boss_action' || item.tier === 'boss_assessment')) {
    return 'evidence_backed'
  }
  if (evidence.length > 0 || signals.length >= 2) return 'partial'
  return 'needs_evidence'
}

function buildSection(input: BuildSelfDistillationInput, definition: SectionDefinition): SelfDistillationSection {
  const relatedClaims = claimsForSection(input.approvedClaims || [], definition)
  const evidence = mapEvidence(relatedClaims)
  const claimSignals = relatedClaims.map((claim) => claim.claim)
  const signals = unique([...definition.collectSignals(input), ...claimSignals], 8)
  const status = sectionStatus(signals, evidence)
  return {
    key: definition.key,
    title: definition.title,
    plainTitle: definition.plainTitle,
    status,
    summary: summarizeSignals(signals, '还缺少足够稳定的证据。'),
    signals,
    evidence,
    agentInstruction: definition.agentInstruction(signals, evidence),
    missingPrompt: definition.missingPrompt,
  }
}

function coverageValue(status: SelfDistillationSectionStatus): number {
  if (status === 'evidence_backed') return 1
  if (status === 'partial') return 0.55
  return 0
}

function pickSection(sections: SelfDistillationSection[], key: SelfDistillationSectionKey): SelfDistillationSection | undefined {
  return sections.find((section) => section.key === key)
}

function buildManual(sections: SelfDistillationSection[]): SelfDistillationProfile['agentOperatingManual'] {
  const mission = pickSection(sections, 'mission')
  const learning = pickSection(sections, 'learning_mode')
  const expression = pickSection(sections, 'expression_dna')
  const decision = pickSection(sections, 'decision_pattern')
  const authorization = pickSection(sections, 'authorization_boundary')
  const antiPatterns = pickSection(sections, 'anti_patterns')

  return {
    always: unique([
      mission?.agentInstruction,
      '所有回答必须区分：已确认事实、画像推断、待验证假设。',
      '这份画像只服务个人 Agent 个性化，不用于医学诊断、招聘筛选、资质认证或替 Boss 做重大决定。',
    ], 6),
    adapt: unique([
      learning?.agentInstruction,
      expression?.agentInstruction,
      decision?.agentInstruction,
    ], 6),
    mustAsk: unique([
      authorization?.agentInstruction,
      '涉及发布、付款、删除、承诺、亲密关系、法律、医疗、财务和长期方向时必须先问 Boss。',
    ], 6),
    avoid: unique([
      antiPatterns?.agentInstruction,
      '不要用单次测评、外部资料或 AI 猜测伪装成稳定了解。',
    ], 6),
    uncertaintyRules: [
      '证据不足时说“我还不确定”，并提出最小校准问题。',
      '短期状态和长期特质冲突时，优先标注时间范围。',
      '外部资料只能当参照，不能直接改写 Boss 画像。',
    ],
  }
}

export function buildSelfDistillationProfile(input: BuildSelfDistillationInput): SelfDistillationProfile {
  const generatedAt = input.generatedAt || new Date().toISOString()
  const sections = SECTION_DEFINITIONS.map((definition) => buildSection(input, definition))
  const coverageScore = Math.round(
    (sections.reduce((sum, section) => sum + coverageValue(section.status), 0) / Math.max(sections.length, 1)) * 100,
  )
  const coverageGaps = sections
    .filter((section) => section.status === 'needs_evidence')
    .map((section) => section.plainTitle)
  const profileSignals = sections.reduce((sum, section) => sum + section.signals.length, 0)
  const headline =
    input.normalized?.summary.headline ||
    (typeof getProfilingSummary(input.profile).headline === 'string' ? String(getProfilingSummary(input.profile).headline) : '') ||
    'Boss 操作画像'
  const strongestSections = sections
    .filter((section) => section.status !== 'needs_evidence')
    .slice(0, 3)
    .map((section) => section.plainTitle)

  return {
    version: 'self-distillation-v1',
    generatedAt,
    headline,
    summary: strongestSections.length > 0
      ? `当前系统对 Boss 的理解主要集中在：${strongestSections.join('、')}。`
      : '当前系统还缺少足够稳定的 Boss 操作画像证据。',
    coverageScore,
    sourceCounts: {
      bossProfileSignals: profileSignals,
      approvedClaims: input.approvedClaims?.length || 0,
      assessmentSignals: input.normalized ? (input.normalized.evidenceTrace?.length || 1) : 0,
    },
    sections,
    agentOperatingManual: buildManual(sections),
    coverageGaps,
    nextCalibrationPrompts: sections
      .filter((section) => section.status !== 'evidence_backed')
      .map((section) => section.missingPrompt)
      .slice(0, 5),
  }
}

export function parseStoredSelfDistillationProfile(value?: string): SelfDistillationProfile | null {
  const parsed = parseJson<Partial<SelfDistillationProfile> | null>(value, null)
  if (!parsed || parsed.version !== 'self-distillation-v1' || !Array.isArray(parsed.sections)) return null
  return parsed as SelfDistillationProfile
}

export function renderSelfDistillationContext(profile?: SelfDistillationProfile | null, sectionLimit = 6): string {
  if (!profile) return ''
  const activeSections = profile.sections
    .filter((section) => section.status !== 'needs_evidence')
    .slice(0, sectionLimit)
  const lines = [
    '<boss-self-distillation>',
    `版本: ${profile.version}`,
    `覆盖度: ${profile.coverageScore}%`,
    `摘要: ${profile.summary}`,
    'Agent 总规矩:',
    ...profile.agentOperatingManual.always.slice(0, 3).map((item) => `- ${item}`),
    ...profile.agentOperatingManual.adapt.slice(0, 3).map((item) => `- ${item}`),
    ...profile.agentOperatingManual.mustAsk.slice(0, 2).map((item) => `- 必须询问: ${item}`),
    '已形成的操作画像:',
    ...activeSections.map((section) => {
      const confidence = section.evidence[0]?.confidence != null
        ? ` / ${Math.round(section.evidence[0].confidence * 100)}%`
        : ''
      return `- [${section.plainTitle} / ${section.status}${confidence}] ${section.summary}`
    }),
  ]
  if (profile.coverageGaps.length > 0) {
    lines.push(`缺证据: ${profile.coverageGaps.slice(0, 5).join('、')}`)
  }
  lines.push('</boss-self-distillation>')
  return lines.join('\n')
}

export function renderStoredSelfDistillationContext(sectionLimit = 6): string {
  const profile = parseStoredSelfDistillationProfile(getBossProfile().self_distillation_profile_json)
  return renderSelfDistillationContext(profile, sectionLimit)
}

export async function loadSelfDistillationProfile(): Promise<SelfDistillationProfile> {
  const profile = getBossProfile()
  const stored = parseStoredSelfDistillationProfile(profile.self_distillation_profile_json)
  if (stored) return stored
  const approvedClaims = await listBossDistillationClaims({ status: 'approved', limit: 60 })
  return buildSelfDistillationProfile({ profile, approvedClaims })
}

export async function loadSelfDistillationContext(sectionLimit = 6): Promise<string> {
  try {
    const profile = await loadSelfDistillationProfile()
    return renderSelfDistillationContext(profile, sectionLimit)
  } catch {
    return renderStoredSelfDistillationContext(sectionLimit)
  }
}

export async function compileAndSaveSelfDistillationProfile(
  normalized?: NormalizedBossProfile | null,
): Promise<SelfDistillationProfile> {
  const current = getBossProfile()
  const approvedClaims = await listBossDistillationClaims({ status: 'approved', limit: 80 })
  const profile = buildSelfDistillationProfile({
    profile: current,
    normalized,
    approvedClaims,
  })
  setBossProfile({
    ...current,
    self_distillation_profile_json: JSON.stringify(profile),
    self_distillation_updated_at: profile.generatedAt,
  })
  try {
    await dbSaveOperatingEvent({
      id: `op_self_distillation_${Date.now().toString(36)}`,
      type: 'boss_signal',
      stage: 'understand',
      signalKind: 'cognitive_style',
      summary: `Boss 操作画像已编译，覆盖度 ${profile.coverageScore}%`,
      profileImpact: 'high',
      bossProfileImpact: 'high',
      reviewRequired: profile.coverageGaps.length > 0,
      source: { kind: 'manual', sourceId: 'self_distillation_profile', title: 'Boss 操作画像' },
      confidence: Math.max(0.5, profile.coverageScore / 100),
      entities: ['self-distillation', ...profile.sections.map((section) => section.key)],
    })
  } catch {
    /* operating ledger should not block profile compilation */
  }
  return profile
}
