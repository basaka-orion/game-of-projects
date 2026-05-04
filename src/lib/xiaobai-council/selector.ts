import { COUNCIL_PERSONAS, type CouncilArtifactStrength, type CouncilDomain, type CouncilPersona } from './personas'
import { COUNCIL_DISTILLATION_STATUS_LABELS, buildCouncilDistillationProfile } from './distillation'

export type CouncilSeatId =
  | 'host'
  | 'product-strategy'
  | 'technical'
  | 'user-market'
  | 'critic'
  | 'visual'
  | 'creative'
  | 'research'

export interface CouncilProblemProfile {
  artifactIntent: 'prd'
  domains: CouncilDomain[]
  difficulty: 1 | 2 | 3 | 4 | 5
  needsEvidence: boolean
  needsEngineering: boolean
  needsVisual: boolean
  riskLevel: 'low' | 'medium' | 'high'
  keywords: string[]
}

export interface CouncilSeat {
  id: CouncilSeatId
  label: string
  mission: string
  preferredDomains: CouncilDomain[]
  preferredMethodTags: string[]
  requiredArtifactSignals: CouncilArtifactStrength[]
}

export interface CouncilSelectedSeat {
  seat: CouncilSeat
  persona: CouncilPersona
  score: number
  reasons: string[]
  scoreFactors: CouncilMatchScoreFactors
}

export interface CouncilSelection {
  profile: CouncilProblemProfile
  seats: CouncilSelectedSeat[]
  alternates: CouncilSelectedSeat[]
  matchGate: CouncilMatchGate
}

export interface CouncilMatchScoreFactors {
  domainFit: number
  methodFit: number
  artifactFit: number
  nuwaCredibility: number
  privateMemoryFit: number
  dreamAlignment: number
  skillMaturity: number
  evidenceStrength: number
  collaborationFit: number
  oppositionValue: number
  costPenalty: number
}

export interface CouncilMatchCandidateScore {
  seatId: CouncilSeatId
  seatLabel: string
  personaId: string
  personaName: string
  score: number
  distillationStatus: string
  scoreFactors: CouncilMatchScoreFactors
  reasons: string[]
}

export interface CouncilCollaborationEdge {
  fromPersonaId: string
  toPersonaId: string
  relation: 'complement' | 'conflict' | 'coverage'
  reason: string
}

export interface CouncilMatchGate {
  gateId: string
  profile: CouncilProblemProfile
  seatPlan: Array<Pick<CouncilSeat, 'id' | 'label' | 'mission'>>
  candidateScores: CouncilMatchCandidateScore[]
  collaborationMatrix: CouncilCollaborationEdge[]
  finalTeam: Array<{
    seatId: CouncilSeatId
    personaId: string
    personaName: string
    role: string
    score: number
    reasons: string[]
  }>
  alternates: CouncilMatchCandidateScore[]
  readiness: {
    nuwaCoverage: string
    skillMaturity: string
    evidenceStrength: string
    riskCoverage: string
    speedCost: string
  }
  explanation: string[]
}

interface ScoreBreakdown {
  total: number
  scoreFactors: CouncilMatchScoreFactors
  reasons: string[]
}

const DOMAIN_SIGNALS: Array<{ domain: CouncilDomain; patterns: RegExp[] }> = [
  { domain: 'product', patterns: [/产品|app|应用|工具|功能|需求|prd|用户旅程|体验/i] },
  { domain: 'technology', patterns: [/技术|架构|代码|api|数据库|模型|llm|agent|系统|工程|开发|实现/i] },
  { domain: 'market', patterns: [/市场|竞品|用户画像|增长|商业|定价|传播|渠道|获客/i] },
  { domain: 'design', patterns: [/交互|ux|可用性|页面|组件|信息架构|设计/i] },
  { domain: 'visual', patterns: [/视觉|动效|remotion|图文|baoyu|信息图|漫画|封面|审美/i] },
  { domain: 'research', patterns: [/调研|来源|证据|论文|事实|真实世界|资讯|知识|研讨/i] },
  { domain: 'risk', patterns: [/风险|失败|合规|隐私|安全|反例|审查|漏洞/i] },
  { domain: 'operations', patterns: [/运营|执行|流程|团队|管理|落地|排期|里程碑/i] },
  { domain: 'education', patterns: [/学习|小白|教程|课程|解释|秒懂/i] },
  { domain: 'finance', patterns: [/收入|成本|预算|投资|融资|利润|财务/i] },
  { domain: 'media', patterns: [/内容|媒体|发布|传播|文章|视频|社群/i] },
]

const SEATS: CouncilSeat[] = [
  {
    id: 'host',
    label: '主持与共识收束',
    mission: '锁定目标、压住跑题、把分歧收束成可执行 PRD。',
    preferredDomains: ['host', 'systems', 'strategy', 'operations'],
    preferredMethodTags: ['systems-design', 'priority', 'effectiveness', 'decomposition'],
    requiredArtifactSignals: ['prd', 'execution-plan'],
  },
  {
    id: 'product-strategy',
    label: '产品战略与定位',
    mission: '定义用户价值、边界、差异化和 P0/P1/P2 取舍。',
    preferredDomains: ['product', 'strategy', 'market'],
    preferredMethodTags: ['focus', 'positioning', 'jobs-to-be-done', 'tradeoff'],
    requiredArtifactSignals: ['prd', 'market-research'],
  },
  {
    id: 'technical',
    label: '技术架构与实现',
    mission: '把需求转成系统结构、数据流、接口、模型策略和验证路径。',
    preferredDomains: ['technology', 'systems', 'science'],
    preferredMethodTags: ['first-principles', 'state-machine', 'llm-os', 'feedback-loop'],
    requiredArtifactSignals: ['technical-architecture', 'execution-plan'],
  },
  {
    id: 'user-market',
    label: '用户、市场与传播',
    mission: '判断目标用户、使用动机、市场切口、传播记忆点和增长路径。',
    preferredDomains: ['market', 'growth', 'psychology', 'storytelling'],
    preferredMethodTags: ['lead-user', 'remarkable', 'adoption', 'user-research'],
    requiredArtifactSignals: ['market-research', 'narrative'],
  },
  {
    id: 'critic',
    label: '反方审查与风险',
    mission: '找出偏差、失败模式、合规隐患、执行代价和必须暂缓的部分。',
    preferredDomains: ['risk', 'psychology', 'ethics', 'finance'],
    preferredMethodTags: ['inversion', 'cognitive-bias', 'antifragile', 'base-rate'],
    requiredArtifactSignals: ['risk-review'],
  },
  {
    id: 'visual',
    label: '视觉、动效与图文表达',
    mission: '把 PRD 变成可感知的界面、动效和 Baoyu-ready 秒懂视觉。',
    preferredDomains: ['visual', 'design', 'storytelling', 'education'],
    preferredMethodTags: ['information-design', 'visual-narrative', 'simplicity', 'sequential-art'],
    requiredArtifactSignals: ['visual-brief', 'baoyu-visuals', 'remotion-motion'],
  },
  {
    id: 'creative',
    label: '跨界创意与体验突破',
    mission: '提出可落地的差异化体验、玩法隐喻和惊喜机制。',
    preferredDomains: ['product', 'design', 'storytelling', 'education'],
    preferredMethodTags: ['creative-computing', 'dynamic-media', 'game-loop', 'prototype'],
    requiredArtifactSignals: ['narrative', 'learning-design'],
  },
  {
    id: 'research',
    label: '事实证据与知识地图',
    mission: '标记必须查证的事实、来源链、资料地图和后续真实世界研讨任务。',
    preferredDomains: ['research', 'science', 'market', 'visual'],
    preferredMethodTags: ['evidence-display', 'data-storytelling', 'benchmark', 'evidence-to-action'],
    requiredArtifactSignals: ['evidence-map', 'market-research'],
  },
]

export function analyzeCouncilProblem(input: string): CouncilProblemProfile {
  const text = input.trim()
  const normalized = text.toLowerCase()
  const domains = new Set<CouncilDomain>(['product', 'strategy'])
  const keywords = Array.from(
    new Set(
      text
        .split(/[^\p{L}\p{N}_-]+/u)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2)
        .slice(0, 30),
    ),
  )

  for (const signal of DOMAIN_SIGNALS) {
    if (signal.patterns.some((pattern) => pattern.test(text))) domains.add(signal.domain)
  }

  const needsEngineering = /技术|架构|代码|api|数据库|模型|llm|agent|系统|工程|开发|实现/i.test(text)
  const needsVisual = /视觉|交互|ux|ui|动效|remotion|图文|baoyu|漫画|信息图|封面|秒懂/i.test(text)
  const needsEvidence = /调研|来源|证据|真实|资讯|市场|竞品|论文|数据|知识/i.test(text)
  if (needsEngineering) {
    domains.add('technology')
    domains.add('systems')
  }
  if (needsVisual) {
    domains.add('visual')
    domains.add('design')
  }
  if (needsEvidence) domains.add('research')

  let difficulty = 2
  if (text.length > 80) difficulty += 1
  if (text.length > 180) difficulty += 1
  if (/世界上最困难|最困难|复杂|跨界|系统|平台|全流程|端到端|事无巨细|完整|权威|专业|天才/i.test(text)) difficulty += 1
  if (needsEngineering && needsEvidence && needsVisual) difficulty += 1
  const cappedDifficulty = Math.max(1, Math.min(5, difficulty)) as CouncilProblemProfile['difficulty']

  const riskLevel: CouncilProblemProfile['riskLevel'] =
    cappedDifficulty >= 5 || /合规|隐私|安全|医疗|金融|法律|高风险|不可逆/i.test(normalized)
      ? 'high'
      : cappedDifficulty >= 3 || /商业|上线|用户|市场|成本|数据/i.test(normalized)
        ? 'medium'
        : 'low'

  return {
    artifactIntent: 'prd',
    domains: Array.from(domains),
    difficulty: cappedDifficulty,
    needsEvidence,
    needsEngineering,
    needsVisual,
    riskLevel,
    keywords,
  }
}

export function selectCouncilTeam(
  input: string,
  options: { minMembers?: number; maxMembers?: number; personas?: CouncilPersona[] } = {},
): CouncilSelection {
  const profile = analyzeCouncilProblem(input)
  const personas = options.personas || COUNCIL_PERSONAS
  const maxMembers = Math.max(5, Math.min(7, options.maxMembers || 7))
  const minMembers = Math.max(5, Math.min(maxMembers, options.minMembers || 5))
  const seatPlan = buildSeatPlan(profile, maxMembers)
  const selected: CouncilSelectedSeat[] = []

  for (const seat of seatPlan) {
    const best = personas
      .filter((persona) => !selected.some((item) => item.persona.id === persona.id))
      .map((persona) => ({
        seat,
        persona,
        breakdown: scorePersonaForSeat(persona, seat, profile, selected.map((item) => item.persona)),
      }))
      .sort((a, b) => b.breakdown.total - a.breakdown.total || a.persona.id.localeCompare(b.persona.id))[0]

    if (best) {
      selected.push({
        seat,
        persona: best.persona,
        score: best.breakdown.total,
        reasons: best.breakdown.reasons,
        scoreFactors: best.breakdown.scoreFactors,
      })
    }
  }

  while (selected.length < minMembers) {
    const fallbackSeat = SEATS.find((seat) => !selected.some((item) => item.seat.id === seat.id)) || SEATS[0]
    const fallback = personas.find((persona) => !selected.some((item) => item.persona.id === persona.id))
    if (!fallback) break
    const breakdown = scorePersonaForSeat(fallback, fallbackSeat, profile, selected.map((item) => item.persona))
    selected.push({
      seat: fallbackSeat,
      persona: fallback,
      score: breakdown.total,
      reasons: breakdown.reasons,
      scoreFactors: breakdown.scoreFactors,
    })
  }

  const finalSeats = selected.slice(0, maxMembers)
  const alternates = personas
    .filter((persona) => !selected.some((item) => item.persona.id === persona.id))
    .flatMap((persona) =>
      seatPlan.map((seat) => {
        const breakdown = scorePersonaForSeat(persona, seat, profile, selected.map((item) => item.persona))
        return { seat, persona, score: breakdown.total, reasons: breakdown.reasons, scoreFactors: breakdown.scoreFactors }
      }),
    )
    .sort((a, b) => b.score - a.score || a.persona.id.localeCompare(b.persona.id))
    .slice(0, 12)

  return {
    profile,
    seats: finalSeats,
    alternates,
    matchGate: buildCouncilMatchGate(profile, seatPlan, finalSeats, alternates, personas),
  }
}

function buildSeatPlan(profile: CouncilProblemProfile, maxMembers: number): CouncilSeat[] {
  const seats = SEATS.filter((seat) =>
    ['host', 'product-strategy', 'technical', 'user-market', 'critic', 'visual'].includes(seat.id),
  )
  if ((profile.difficulty >= 4 || profile.needsEvidence) && seats.length < maxMembers) {
    seats.push(SEATS.find((seat) => seat.id === 'research')!)
  }
  if (profile.difficulty >= 5 && seats.length < maxMembers) {
    seats.push(SEATS.find((seat) => seat.id === 'creative')!)
  }
  return seats.slice(0, maxMembers)
}

function scorePersonaForSeat(
  persona: CouncilPersona,
  seat: CouncilSeat,
  profile: CouncilProblemProfile,
  alreadySelected: CouncilPersona[],
): ScoreBreakdown {
  const profileDomainMatches = persona.domains.filter((domain) => profile.domains.includes(domain)).length
  const seatDomainMatches = persona.domains.filter((domain) => seat.preferredDomains.includes(domain)).length
  const methodMatches = persona.methodTags.filter((tag) => seat.preferredMethodTags.includes(tag)).length
  const artifactMatches = persona.artifactStrengths.filter((artifact) =>
    seat.requiredArtifactSignals.includes(artifact),
  ).length
  const selectedDomains = new Set(alreadySelected.flatMap((item) => item.domains))
  const newDomainCount = persona.domains.filter((domain) => !selectedDomains.has(domain)).length
  const selectedRiskTags = new Set(alreadySelected.flatMap((item) => item.riskTags))
  const conflictTags = persona.riskTags.filter((tag) => !selectedRiskTags.has(tag)).length
  const distillation = buildCouncilDistillationProfile(persona)
  const status = distillation.distillationStatus

  const domainFit = profileDomainMatches * 2.4 + seatDomainMatches * 3.2
  const methodFit = methodMatches * 1.8
  const artifactFit = artifactMatches * 3.5 + (persona.artifactStrengths.includes('prd') ? 1.5 : 0)
  const collaborationFit = Math.min(4, newDomainCount * 0.9)
  const oppositionValue = Math.min(3.5, conflictTags * 0.8 + (seat.id === 'critic' ? persona.riskTags.length * 0.2 : 0))
  const nuwaCredibility =
    status === 'imported'
      ? 2.4
      : status === 'pending-validation'
        ? 1.8
        : status === 'researching'
          ? 1.5
          : status === 'needs-retraining'
            ? 1.0
            : 0.8
  const privateMemoryFit = persona.sourceCoverage.hasNuwaSeed ? 1.1 : 0.7
  const dreamAlignment = Math.min(2.2, 0.8 + methodMatches * 0.25 + profileDomainMatches * 0.18)
  const skillMaturity = Math.min(2.4, persona.defaultSkills.length * 0.28 + (persona.nuwaSkillId ? 0.8 : 0.25))
  const evidenceStrength = Math.min(
    2.6,
    (persona.sourceCoverage.publicMaterialEnough ? 0.9 : 0.2) +
      (persona.sourceCoverage.researchStreams.length >= 6 ? 0.8 : 0.3) +
      (profile.needsEvidence && persona.domains.includes('research') ? 0.9 : profile.needsEvidence ? 0.35 : 0.5),
  )
  const costPenalty = alreadySelected.length >= 6 && profile.difficulty <= 3 ? 1.6 : 0
  let total =
    domainFit +
    methodFit +
    artifactFit +
    collaborationFit +
    oppositionValue +
    nuwaCredibility +
    privateMemoryFit +
    dreamAlignment +
    skillMaturity +
    evidenceStrength -
    costPenalty

  if (profile.needsEngineering && persona.domains.includes('technology')) total += 2.6
  if (profile.needsVisual && (persona.domains.includes('visual') || persona.domains.includes('design'))) total += 2.6
  if (profile.needsEvidence && persona.domains.includes('research')) total += 2.2
  if (profile.riskLevel === 'high' && persona.domains.includes('risk')) total += 2.4
  if (seat.id === 'host' && persona.domains.includes('systems')) total += 1.8

  const reasons = [
    seatDomainMatches > 0 ? `匹配「${seat.label}」席位` : '',
    profileDomainMatches > 0 ? `覆盖 ${persona.domains.filter((domain) => profile.domains.includes(domain)).join(' / ')}` : '',
    artifactMatches > 0
      ? `擅长 ${persona.artifactStrengths.filter((artifact) => seat.requiredArtifactSignals.includes(artifact)).join(' / ')}`
      : '',
    methodMatches > 0
      ? `方法论 ${persona.methodTags.filter((tag) => seat.preferredMethodTags.includes(tag)).slice(0, 2).join(' / ')}`
      : '',
    conflictTags > 0 ? '能提供互补反方视角' : '',
    persona.nuwaSkillId ? `已有 Nuwa 种子：${COUNCIL_DISTILLATION_STATUS_LABELS[distillation.distillationStatus]}` : '进入 Nuwa 逐个精修队列',
  ].filter(Boolean)

  return {
    total: Number(total.toFixed(2)),
    scoreFactors: {
      domainFit: Number(domainFit.toFixed(2)),
      methodFit: Number(methodFit.toFixed(2)),
      artifactFit: Number(artifactFit.toFixed(2)),
      nuwaCredibility: Number(nuwaCredibility.toFixed(2)),
      privateMemoryFit: Number(privateMemoryFit.toFixed(2)),
      dreamAlignment: Number(dreamAlignment.toFixed(2)),
      skillMaturity: Number(skillMaturity.toFixed(2)),
      evidenceStrength: Number(evidenceStrength.toFixed(2)),
      collaborationFit: Number(collaborationFit.toFixed(2)),
      oppositionValue: Number(oppositionValue.toFixed(2)),
      costPenalty: Number(costPenalty.toFixed(2)),
    },
    reasons,
  }
}

function toCandidateScore(item: CouncilSelectedSeat): CouncilMatchCandidateScore {
  const distillation = buildCouncilDistillationProfile(item.persona)
  return {
    seatId: item.seat.id,
    seatLabel: item.seat.label,
    personaId: item.persona.id,
    personaName: item.persona.name,
    score: item.score,
    distillationStatus: COUNCIL_DISTILLATION_STATUS_LABELS[distillation.distillationStatus],
    scoreFactors: item.scoreFactors,
    reasons: item.reasons,
  }
}

function buildCollaborationMatrix(seats: CouncilSelectedSeat[]): CouncilCollaborationEdge[] {
  const edges: CouncilCollaborationEdge[] = []
  for (let i = 0; i < seats.length; i += 1) {
    for (let j = i + 1; j < seats.length; j += 1) {
      const a = seats[i].persona
      const b = seats[j].persona
      const sharedDomains = a.domains.filter((domain) => b.domains.includes(domain))
      const sharedRisks = a.riskTags.filter((tag) => b.riskTags.includes(tag))
      if (sharedRisks.length > 0) {
        edges.push({
          fromPersonaId: a.id,
          toPersonaId: b.id,
          relation: 'conflict',
          reason: `共同盯住 ${sharedRisks.slice(0, 2).join(' / ')}，需要互相质询。`,
        })
      } else if (sharedDomains.length > 0) {
        edges.push({
          fromPersonaId: a.id,
          toPersonaId: b.id,
          relation: 'coverage',
          reason: `共同覆盖 ${sharedDomains.slice(0, 2).join(' / ')}，形成同域交叉验证。`,
        })
      } else {
        edges.push({
          fromPersonaId: a.id,
          toPersonaId: b.id,
          relation: 'complement',
          reason: `${a.shortName} 与 ${b.shortName} 领域互补，降低单一视角失真。`,
        })
      }
      if (edges.length >= 10) return edges
    }
  }
  return edges
}

function buildCouncilMatchGate(
  profile: CouncilProblemProfile,
  seatPlan: CouncilSeat[],
  finalSeats: CouncilSelectedSeat[],
  alternates: CouncilSelectedSeat[],
  personas: CouncilPersona[],
): CouncilMatchGate {
  const candidateScores = personas
    .flatMap((persona) =>
      seatPlan.map((seat) => {
        const breakdown = scorePersonaForSeat(persona, seat, profile, finalSeats.map((item) => item.persona))
        return toCandidateScore({ seat, persona, score: breakdown.total, reasons: breakdown.reasons, scoreFactors: breakdown.scoreFactors })
      }),
    )
    .sort((a, b) => b.score - a.score || a.personaId.localeCompare(b.personaId))
    .slice(0, 24)
  const nuwaSeedCount = finalSeats.filter((seat) => seat.persona.sourceCoverage.hasNuwaSeed).length
  const riskCount = finalSeats.filter((seat) => seat.persona.domains.includes('risk') || seat.seat.id === 'critic').length
  const evidenceCount = finalSeats.filter((seat) => seat.persona.domains.includes('research') || seat.persona.artifactStrengths.includes('evidence-map')).length
  const avgSkillMaturity =
    finalSeats.reduce((sum, seat) => sum + seat.scoreFactors.skillMaturity, 0) / Math.max(1, finalSeats.length)

  return {
    gateId: `council-match-${Date.now().toString(36)}`,
    profile,
    seatPlan: seatPlan.map((seat) => ({ id: seat.id, label: seat.label, mission: seat.mission })),
    candidateScores,
    collaborationMatrix: buildCollaborationMatrix(finalSeats),
    finalTeam: finalSeats.map((item) => ({
      seatId: item.seat.id,
      personaId: item.persona.id,
      personaName: item.persona.name,
      role: item.seat.label,
      score: item.score,
      reasons: item.reasons,
    })),
    alternates: alternates.slice(0, 8).map(toCandidateScore),
    readiness: {
      nuwaCoverage: `${nuwaSeedCount}/${finalSeats.length} 位已有 Nuwa 示例种子，其余进入逐个精修蒸馏队列。`,
      skillMaturity: `平均技能成熟度 ${avgSkillMaturity.toFixed(1)}，本轮仍以本地 Openbasaka skill registry 为准。`,
      evidenceStrength: profile.needsEvidence
        ? `${evidenceCount} 位能提供证据地图或研究席位。`
        : '本轮证据需求较低，但仍保留公开来源和诚实边界。',
      riskCoverage: `${riskCount} 个风险/反方席位覆盖，避免团队只做同向赞同。`,
      speedCost:
        profile.difficulty >= 5
          ? '高难度问题使用 7 人上限，牺牲速度换取覆盖。'
          : '常规问题控制在 5-6 人，优先效率和清晰收束。',
    },
    explanation: [
      'Boss 的问题必须先通过匹配闸门，不直接进入群聊式左右互搏。',
      `本轮问题画像：${profile.domains.join(' / ')}，难度 ${profile.difficulty}/5，风险 ${profile.riskLevel}。`,
      '最终编队综合领域命中、Nuwa 蒸馏可信度、Dream 对齐、技能成熟度、证据强度、协作互补和反方价值。',
    ],
  }
}
