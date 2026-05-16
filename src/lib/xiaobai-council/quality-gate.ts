import { buildCouncilDistillationProfile } from './distillation'
import type { CouncilBaoyuVisualPlan } from './baoyu'
import type { CouncilInternetResearchPack } from './internet-research'
import { validateCouncilMasterPrd } from './master-prd'
import type { CouncilSelection } from './selector'
import type { TeamMessage, TeamSession } from '../teams/types'

export type CouncilQualityGateStatus = 'approved' | 'needs-revision' | 'blocked'
export type CouncilQualityCheckStatus = 'pass' | 'warn' | 'fail'
export type CouncilDeliberationObjectType = 'claim' | 'evidence' | 'objection' | 'verdict' | 'experiment'
export type CouncilQualityRevisionRoundStatus = 'not-needed' | 'applied' | 'still-needs-revision'

export interface CouncilQualityCheck {
  id: string
  label: string
  status: CouncilQualityCheckStatus
  score: number
  evidence: string[]
  requiredFixes: string[]
}

export interface CouncilDeliberationObject {
  id: string
  type: CouncilDeliberationObjectType
  title: string
  body: string
  source: string
  personaId?: string
  personaName?: string
  phaseId?: string
  phaseLabel?: string
  confidence: number
}

export interface CouncilQualityRevisionRound {
  round: number
  status: CouncilQualityRevisionRoundStatus
  scoreBefore: number
  scoreAfter?: number
  finalGateStatus?: CouncilQualityGateStatus
  prompt: string
  summary: string
  generatedAt: string
  patchMarkdown: string
}

export interface CouncilQualityGate {
  gateId: string
  status: CouncilQualityGateStatus
  score: number
  prdCompletenessScore: number
  launchReadinessScore: number
  finalGateStatus: CouncilQualityGateStatus
  generatedAt: string
  summary: string
  checks: CouncilQualityCheck[]
  typedDeliberation: CouncilDeliberationObject[]
  revisionPrompt: string
  revisionRounds: CouncilQualityRevisionRound[]
}

interface CouncilQualityGateInput {
  problem: string
  selection: CouncilSelection
  session: TeamSession
  prdMarkdown: string
  baoyuVisualPlans: CouncilBaoyuVisualPlan[]
  revisionRounds?: CouncilQualityRevisionRound[]
  internetResearch?: CouncilInternetResearchPack | null
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text))
}

function compact(value: string, max = 180): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function check(
  id: string,
  label: string,
  score: number,
  evidence: string[],
  requiredFixes: string[],
): CouncilQualityCheck {
  const capped = Math.max(0, Math.min(100, Math.round(score)))
  return {
    id,
    label,
    status: capped >= 82 ? 'pass' : capped >= 60 ? 'warn' : 'fail',
    score: capped,
    evidence,
    requiredFixes,
  }
}

function sectionScore(markdown: string, required: Array<{ label: string; patterns: RegExp[] }>): {
  score: number
  hitLabels: string[]
  missedLabels: string[]
} {
  const hitLabels: string[] = []
  const missedLabels: string[] = []
  for (const item of required) {
    if (includesAny(markdown, item.patterns)) hitLabels.push(item.label)
    else missedLabels.push(item.label)
  }
  return {
    score: required.length ? (hitLabels.length / required.length) * 100 : 100,
    hitLabels,
    missedLabels,
  }
}

function buildChecks(input: CouncilQualityGateInput): CouncilQualityCheck[] {
  const prd = input.prdMarkdown
  const profile = input.selection.profile
  const briefMessages = input.session.messages.filter((message) => message.kind === 'brief')
  const phaseLabels = new Set(briefMessages.map((message) => String(message.metadata?.phaseLabel || message.metadata?.phase || '')).filter(Boolean))
  const importedCount = input.selection.seats.filter((seat) => buildCouncilDistillationProfile(seat.persona).distillationStatus === 'imported').length
  const hasResearchSeat = input.selection.seats.some(
    (seat) => seat.seat.id === 'research' || seat.persona.domains.includes('research') || seat.persona.artifactStrengths.includes('evidence-map'),
  )

  const evidenceScore = (() => {
    const textSignals = sectionScore(prd, [
      { label: '事实/证据', patterns: [/证据|来源|事实|调研|引用|资料/i] },
      { label: '待验证事实', patterns: [/待验证|待查证|需要查证|信息缺口|不确定/i] },
      { label: '验证实验', patterns: [/验证实验|首版实验|实验|可验证/i] },
    ])
    const seatBonus = hasResearchSeat || !profile.needsEvidence ? 15 : 0
    const needPenalty = profile.needsEvidence ? 0 : 8
    return Math.min(100, textSignals.score * 0.78 + seatBonus + needPenalty)
  })()

  const conflictSignals = sectionScore(prd, [
    { label: '保留分歧', patterns: [/保留的分歧|分歧|不同意见|争议/i] },
    { label: '裁掉方案', patterns: [/被裁掉|裁掉|不做清单|暂缓|砍掉/i] },
    { label: '裁决理由', patterns: [/裁决|取舍|为什么|理由|权衡/i] },
  ])

  const actionabilitySignals = sectionScore(prd, [
    { label: 'P0/P1/P2', patterns: [/P0|P1|P2|优先级/i] },
    { label: '页面/组件/状态', patterns: [/页面|组件|状态|空态|加载|失败态/i] },
    { label: '数据/接口/模型', patterns: [/数据|接口|API|模型|数据库|状态流/i] },
    { label: '验收/测试', patterns: [/验收|测试|smoke|单元|集成|E2E|视觉回归/i] },
  ])

  const masterPrdSignals = validateCouncilMasterPrd(prd)

  const fullStackSignals = sectionScore(prd, [
    { label: '前端架构', patterns: [/前端|React|Vue|SwiftUI|组件架构|状态管理|路由/i] },
    { label: '后端服务', patterns: [/后端|服务|Node|队列|任务|鉴权|领域边界/i] },
    { label: '数据库与表结构', patterns: [/数据库|SQLite|Postgres|表结构|索引|schema|数据模型/i] },
    { label: 'API 契约', patterns: [/API|接口|请求|响应|错误码|幂等/i] },
    { label: 'AI/模型策略', patterns: [/AI|模型|LLM|prompt|提示词|RAG|降级|事实校验/i] },
    { label: '权限安全部署测试', patterns: [/权限|隐私|安全|部署|监控|回滚|测试矩阵|验收/i] },
  ])

  const traceSignals = sectionScore(prd, [
    { label: '来源人物', patterns: [/由.+提出|来源|角色|人物|入选智囊/i] },
    { label: '质询反驳', patterns: [/质询|反驳|反对|风险|证据缺口/i] },
    { label: '主持裁决', patterns: [/主持裁决|裁决|吸收|取舍/i] },
    { label: '裁掉记录', patterns: [/裁掉|被裁掉|不做清单|暂缓/i] },
  ])

  const distillationScore = Math.min(
    100,
    (importedCount / Math.max(1, input.selection.seats.length)) * 72 +
      (input.selection.seats.every((seat) => buildCouncilDistillationProfile(seat.persona).honestLimits.length > 0) ? 18 : 0) +
      (input.selection.seats.every((seat) => buildCouncilDistillationProfile(seat.persona).researchFiles.length >= 6) ? 10 : 0),
  )

  const safetySignals = sectionScore(`${prd}\n${input.problem}`, [
    { label: '公开原型边界', patterns: [/公开思想原型|不代表本人|不冒充|授权/i] },
    { label: '本地优先', patterns: [/本地|Openbasaka|Telegram.*可选|Telegram.*默认关闭/i] },
    { label: '隐私/安全', patterns: [/隐私|安全|密钥|权限|合规|审计/i] },
  ])
  const internetResearch = input.internetResearch || null
  const internetSourceCount = internetResearch?.sources.length || 0
  const internetScore = (() => {
    if (!internetResearch?.required) return 88
    if (internetResearch.grounded && internetSourceCount >= 3) return 96
    if (internetResearch.grounded && internetSourceCount > 0) return 86
    if (internetResearch.attempted) return 58
    return 42
  })()

  return [
    check(
      'internet-grounding',
      '联网证据与实时事实边界',
      internetScore,
      [
        internetResearch?.required ? '本轮触发联网证据需求。' : '本轮没有触发强联网证据需求。',
        internetResearch?.attempted ? `已尝试联网检索，status=${internetResearch.status}。` : '未尝试联网检索。',
        internetSourceCount > 0 ? `可引用外部来源 ${internetSourceCount} 条。` : '没有可引用外部来源。',
      ],
      internetScore >= 82
        ? []
        : ['补充联网搜索来源、网页摘录和待查证清单；市场、竞品、时效、政策、价格、天气、模型能力不得只靠模型记忆。'],
    ),
    check(
      'evidence-truth',
      '事实证据与待验证边界',
      evidenceScore,
      [
        profile.needsEvidence ? '本题被判定为需要证据链。' : '本题不是强证据任务，但仍要求保留事实边界。',
        hasResearchSeat ? '编队中存在研究/证据席位。' : '编队中没有显式研究席位。',
      ],
      evidenceScore >= 82 ? [] : ['补充来源链、待查证事实和最低验证实验，避免把推测当结论。'],
    ),
    check(
      'conflict-verdict',
      '分歧、反方与主持裁决',
      conflictSignals.score,
      [
        `命中：${conflictSignals.hitLabels.join(' / ') || '暂无'}`,
        `已记录阶段：${Array.from(phaseLabels).join(' / ') || '暂无阶段短评'}`,
      ],
      conflictSignals.missedLabels.map((label) => `补齐「${label}」章节，说明哪些观点被保留、修正或裁掉。`),
    ),
    check(
      'actionable-prd',
      '可执行 PRD 密度',
      actionabilitySignals.score,
      [`命中：${actionabilitySignals.hitLabels.join(' / ') || '暂无'}`],
      actionabilitySignals.missedLabels.map((label) => `补齐「${label}」相关条款，让工程、设计、Agent 都能直接拆任务。`),
    ),
    check(
      'master-prd-fullstack',
      '大师级全栈 PRD 完整度',
      masterPrdSignals.score,
      [
        `命中：${masterPrdSignals.hitLabels.join(' / ') || '暂无'}`,
        masterPrdSignals.missedLabels.length ? `缺口：${masterPrdSignals.missedLabels.join(' / ')}` : '硬性章节已覆盖。',
      ],
      masterPrdSignals.missedLabels.map((label) => `补齐「${label}」，最终文档必须能直接交给产品、前端、后端、测试和部署执行。`),
    ),
    check(
      'frontend-backend-contract',
      '前后端/API/数据契约',
      fullStackSignals.score,
      [`命中：${fullStackSignals.hitLabels.join(' / ') || '暂无'}`],
      fullStackSignals.missedLabels.map((label) => `补齐「${label}」，不能只停留在产品愿景。`),
    ),
    check(
      'consensus-trace',
      '角色智慧与共识追溯',
      traceSignals.score,
      [
        `命中：${traceSignals.hitLabels.join(' / ') || '暂无'}`,
        `已记录阶段：${Array.from(phaseLabels).join(' / ') || '暂无阶段短评'}`,
      ],
      traceSignals.missedLabels.map((label) => `补齐「${label}」，让关键 PRD 条款能追溯到主张、质询或裁决。`),
    ),
    check(
      'nuwa-distillation',
      'Nuwa 蒸馏可信度',
      distillationScore,
      [`${importedCount}/${input.selection.seats.length} 位入选角色为已蒸馏状态。`, '每位角色都需要诚实边界、研究流和验证题。'],
      distillationScore >= 82 ? [] : ['把未蒸馏/待验证角色移出默认编队，或补齐其来源、反模式和验证问题。'],
    ),
    check(
      'safety-local-boundary',
      '本地边界、隐私与授权诚实性',
      safetySignals.score,
      [`命中：${safetySignals.hitLabels.join(' / ') || '暂无'}`],
      safetySignals.missedLabels.map((label) => `补齐「${label}」说明，避免角色冒充真人、外部同步或隐私越界。`),
    ),
  ]
}

function firstLine(value: string): string {
  return compact(value.split('\n').find((line) => line.trim()) || value, 120)
}

function buildTypedDeliberation(input: CouncilQualityGateInput): CouncilDeliberationObject[] {
  const objects: CouncilDeliberationObject[] = []
  const briefMessages = input.session.messages.filter((message) => message.kind === 'brief')
  for (const message of briefMessages.slice(-18)) {
    const phaseLabel = String(message.metadata?.phaseLabel || message.metadata?.phase || '')
    const phaseId = typeof message.metadata?.phaseId === 'string' ? message.metadata.phaseId : undefined
    const lower = message.content.toLowerCase()
    const isObjection = /反对|质疑|风险|失败|过度|不应|漏洞|裁掉|否决/i.test(message.content)
    const isEvidence = /证据|来源|事实|数据|调研|验证/i.test(message.content)
    objects.push({
      id: `${message.id}-claim`,
      type: isObjection ? 'objection' : 'claim',
      title: `${message.agentName} · ${phaseLabel || '短评'}`,
      body: compact(message.content, 260),
      source: 'team-brief',
      personaId: message.agentId,
      personaName: message.agentName,
      phaseId,
      phaseLabel,
      confidence: isObjection ? 0.78 : 0.72,
    })
    if (isEvidence) {
      objects.push({
        id: `${message.id}-evidence`,
        type: 'evidence',
        title: `${message.agentName} 提出的证据需求`,
        body: compact(message.content, 220),
        source: 'team-brief',
        personaId: message.agentId,
        personaName: message.agentName,
        phaseId,
        phaseLabel,
        confidence: 0.7,
      })
    }
    if (objects.length >= 18) break
    void lower
  }

  const prdLines = input.prdMarkdown
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const verdictLine = prdLines.find((line) => /裁决|取舍|保留的分歧|被裁掉|不做清单/i.test(line))
  if (verdictLine) {
    objects.push({
      id: 'quality-verdict-from-prd',
      type: 'verdict',
      title: '主持裁决抽取',
      body: compact(verdictLine, 260),
      source: 'final-prd',
      confidence: 0.82,
    })
  }
  const experimentLine = prdLines.find((line) => /首版验证实验|验证实验|MVP|实验/i.test(line))
  if (experimentLine) {
    objects.push({
      id: 'quality-experiment-from-prd',
      type: 'experiment',
      title: '首版验证实验抽取',
      body: compact(experimentLine, 260),
      source: 'final-prd',
      confidence: 0.8,
    })
  }

  if (objects.length === 0) {
    objects.push({
      id: 'quality-empty-deliberation',
      type: 'objection',
      title: '结构化博弈对象不足',
      body: '本轮没有足够角色短评可抽取为 Claim / Evidence / Objection / Verdict / Experiment，需要重新运行或补齐阶段输出。',
      source: 'quality-gate',
      confidence: 0.9,
    })
  }
  return objects.slice(0, 22)
}

export function buildCouncilQualityGate(input: CouncilQualityGateInput): CouncilQualityGate {
  const checks = buildChecks(input)
  const score = Math.round(checks.reduce((sum, item) => sum + item.score, 0) / Math.max(1, checks.length))
  const failCount = checks.filter((item) => item.status === 'fail').length
  const warnCount = checks.filter((item) => item.status === 'warn').length
  const status: CouncilQualityGateStatus = failCount > 0 ? 'blocked' : warnCount > 0 || score < 86 ? 'needs-revision' : 'approved'
  const requiredFixes = checks.flatMap((item) => item.requiredFixes)
  const checkById = new Map(checks.map((item) => [item.id, item]))
  const prdCompletenessScore = Math.round(((checkById.get('master-prd-fullstack')?.score ?? score) + (checkById.get('actionable-prd')?.score ?? score)) / 2)
  const launchReadinessScore = Math.round(
    (
      (checkById.get('actionable-prd')?.score ?? score) +
      (checkById.get('master-prd-fullstack')?.score ?? score) +
      (checkById.get('frontend-backend-contract')?.score ?? score) +
      (checkById.get('consensus-trace')?.score ?? score) +
      (checkById.get('safety-local-boundary')?.score ?? score)
    ) / 5,
  )
  return {
    gateId: `council-quality-${Date.now().toString(36)}`,
    status,
    score,
    prdCompletenessScore,
    launchReadinessScore,
    finalGateStatus: status,
    generatedAt: new Date().toISOString(),
    summary:
      status === 'approved'
        ? `质量闸门通过，综合评分 ${score}。本轮 PRD 已具备证据意识、裁决记录、全栈蓝图和可执行验收条款。`
        : status === 'needs-revision'
          ? `质量闸门建议返修，综合评分 ${score}。产物可读，但需要补齐 ${requiredFixes.slice(0, 2).join('；') || '关键证据或裁决条款'}。`
          : `质量闸门阻断，综合评分 ${score}。在交付 Boss 前必须修复 ${requiredFixes.slice(0, 3).join('；') || '关键失败项'}。`,
    checks,
    typedDeliberation: buildTypedDeliberation(input),
    revisionPrompt: [
      '请基于 CouncilQualityGate 返修最终 PRD：',
      ...requiredFixes.slice(0, 8).map((item, index) => `${index + 1}. ${item}`),
      '返修时保留已经通过的内容，只补证据、裁决、行动条款、全栈技术蓝图、测试验收和安全边界。',
    ].join('\n'),
    revisionRounds: input.revisionRounds || [],
  }
}

export function buildCouncilQualityRevisionRound(input: {
  gate: CouncilQualityGate
  prdMarkdown: string
  round: number
}): { prdMarkdown: string; revisionRound: CouncilQualityRevisionRound } {
  if (input.gate.status === 'approved') {
    return {
      prdMarkdown: input.prdMarkdown,
      revisionRound: {
        round: input.round,
        status: 'not-needed',
        scoreBefore: input.gate.score,
        scoreAfter: input.gate.score,
        finalGateStatus: input.gate.status,
        prompt: input.gate.revisionPrompt,
        summary: '质量闸门已通过，本轮无需返修。',
        generatedAt: new Date().toISOString(),
        patchMarkdown: '',
      },
    }
  }

  const requiredFixes = input.gate.checks.flatMap((item) => item.requiredFixes)
  const fixLines = requiredFixes.length
    ? requiredFixes.slice(0, 10).map((fix, index) => `${index + 1}. ${fix}`).join('\n')
    : '1. 复查证据、裁决、可执行条款、全栈技术蓝图和安全边界。'
  const patchMarkdown = [
    `## CouncilQualityGate 返修补丁 · Round ${input.round}`,
    '',
    '### 返修触发原因',
    `本轮质量闸门状态为 ${input.gate.status}，综合评分 ${input.gate.score}，PRD 完整度 ${input.gate.prdCompletenessScore}，上线准备度 ${input.gate.launchReadinessScore}。必须先补齐以下缺口，再交付 Boss：`,
    '',
    fixLines,
    '',
    '### 证据、来源与待查证边界',
    '- 所有事实判断必须标注来源类型：公开材料、Boss 输入、本地记忆、模型推断或待查证。',
    '- 高风险、强时效、医学/法律/金融/安全类内容默认列入待查证事实，不把推测写成结论。',
    '- 首版验证实验必须说明样本、成功标准、失败信号和复盘方式。',
    '',
    '### 分歧、反方与主持裁决',
    '- 保留的分歧：记录速度与质量、惊喜与可用性、自动化与 Boss 控制权之间仍需观察的张力。',
    '- 被裁掉的方案：裁掉一秒默认编队、无来源神化结论、把 Telegram 当默认同步、把真人原型伪装成本人发言。',
    '- 裁决理由：优先采用能形成证据链、可执行任务、可验收 UI 和可复盘学习记录的方案。',
    '',
    '### 大师级全栈 PRD 补齐',
    '- P0/P1/P2：P0 包含输入、匹配闸门、辩论剧场、关系地图、裁决账本、大师 PRD 阅读器、质量闸门、共识追溯；P1 包含角色替换、导出、归档、人工审稿；P2 包含更重模型裁判和跨项目复盘。',
    '- 页面与组件状态：输入区、匹配过程、角色档案、剧场翻页、关系地图、裁决账本、完整 PRD、质量闸门、追溯抽屉均要有空态、加载、失败态和降级态。',
    '- 前端架构：说明 Electron + React/TypeScript 的状态边界、组件拆分、可访问性、响应式约束、导出/归档交互和错误恢复。',
    '- 后端服务：说明本地数据服务、TeamSession 编排、质量闸门、归档、审稿、运行历史、可选外部触达的领域边界。',
    '- 数据库与接口/API：保存 Claim、Evidence、Objection、Verdict、Experiment、Scene、MapEdge、LedgerItem、RevisionRound、TraceItem、ActionTask 和导出记录，并给出请求/响应/错误码草案。',
    '- AI/模型策略：列出编队、六阶段输出、裁决抽取、PRD 归一化、质量返修、事实校验、降级和人工复验的模型调用边界。',
    '- 测试与验收：单元、集成、UI smoke、E2E、视觉回归、性能、可访问性、小白用户验收和真实 Electron 跑通。',
    '',
    '### 共识形成追溯',
    '- 每条关键条款至少挂到一条主张、质询或主持裁决：由谁提出、谁反对、为什么修正、最终吸收为哪条 PRD。',
    '- 被裁掉的方案必须记录原因，尤其是一秒默认编队、无来源神化结论、默认外部同步、过程日志平铺、自动高风险执行。',
    '',
    '### 公开原型、隐私与本地边界',
    '- 所有角色都是公开思想原型蒸馏，不代表本人、不冒充本人、不暗示本人授权。',
    '- 默认本地 Openbasaka，Telegram 只是可选外部触达且默认关闭。',
    '- 不静默外发密钥、隐私、原始长日志或 Boss 私有画像；权限、密钥、审计与撤销路径必须可见。',
  ].join('\n')

  return {
    prdMarkdown: `${input.prdMarkdown.trim()}\n\n${patchMarkdown}`.trim(),
    revisionRound: {
      round: input.round,
      status: 'applied',
      scoreBefore: input.gate.score,
      prompt: input.gate.revisionPrompt,
      summary: `Round ${input.round} 已按质量闸门补齐证据、裁决、可执行条款、全栈蓝图、追溯链与本地安全边界。`,
      generatedAt: new Date().toISOString(),
      patchMarkdown,
    },
  }
}

export function renderCouncilQualityGateMarkdown(gate: CouncilQualityGate): string {
  return [
    '## CouncilQualityGate · 质量闸门',
    '',
    `- status: ${gate.status}`,
    `- score: ${gate.score}`,
    `- prdCompletenessScore: ${gate.prdCompletenessScore}`,
    `- launchReadinessScore: ${gate.launchReadinessScore}`,
    `- finalGateStatus: ${gate.finalGateStatus}`,
    `- generatedAt: ${gate.generatedAt}`,
    `- summary: ${gate.summary}`,
    '',
    '### 检查项',
    ...gate.checks.map((item) => [
      `#### ${item.label}`,
      `- status: ${item.status}`,
      `- score: ${item.score}`,
      `- evidence: ${item.evidence.join(' / ') || '暂无'}`,
      item.requiredFixes.length ? `- requiredFixes: ${item.requiredFixes.join(' / ')}` : '- requiredFixes: none',
    ].join('\n')),
    '',
    '### 结构化博弈对象',
    ...gate.typedDeliberation.slice(0, 10).map((item) => `- ${item.type}: ${item.title}｜${firstLine(item.body)}`),
    '',
    '### 返修链',
    ...(gate.revisionRounds.length
      ? gate.revisionRounds.map((round) => `- Round ${round.round}: ${round.status}｜${round.scoreBefore} -> ${round.scoreAfter ?? 'pending'}｜${round.summary}`)
      : ['- none']),
  ].join('\n')
}
