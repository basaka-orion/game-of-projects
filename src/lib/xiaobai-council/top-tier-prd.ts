import type { CouncilLaunchReadinessPack } from './action-pack'
import type { CouncilConsensusTrace } from './master-prd'
import { renderCouncilConsensusTraceMarkdown } from './master-prd'
import type { CouncilQualityGate } from './quality-gate'
import { redactSensitiveText } from './export-safety'
import type { UiMuseumPrdContext } from '../ui-museum/context'

export type CouncilTopTierPrdStatus = 'elite-candidate' | 'strong-draft' | 'needs-editorial-work' | 'blocked'

export interface CouncilTopTierPrdDimension {
  id: string
  label: string
  status: 'pass' | 'warn' | 'fail'
  score: number
  evidence: string[]
  requiredFixes: string[]
}

export interface CouncilTopTierPrdEvaluation {
  score: number
  status: CouncilTopTierPrdStatus
  summary: string
  dimensions: CouncilTopTierPrdDimension[]
  blockers: string[]
  developmentReady: boolean
  masterClaimAllowed: boolean
  claimLabel: string
}

export interface CouncilTopTierPrdExportInput {
  projectTitle: string
  problem: string
  finalPrd: string
  generatedAt?: number | string | Date
  runId?: string
  workflowDispatchLabel?: string
  qualityGate?: CouncilQualityGate | null
  uiStyleContext: UiMuseumPrdContext
  actionPack?: CouncilLaunchReadinessPack | null
  consensusTrace?: CouncilConsensusTrace | null
  appendixMarkdown?: string
}

export interface CouncilTopTierPrdProcessInput extends CouncilTopTierPrdExportInput {
  liveSnapshotsMarkdown?: string
  theaterMarkdown?: string
  deliveryModesMarkdown?: string
  actionPackMarkdown?: string
  auditMarkdown?: string
}

const FORBIDDEN_FINAL_EXPORT_PATTERNS = [
  /输入一个真实项目想法/i,
  /正在自动发给工作流模块/i,
  /漫画回看/i,
  /超顶级\s*PRD\s*评分尺/i,
  /附录：过程证据与决策追溯/i,
  /小白辩论剧场/i,
  /实时运行快照/i,
  /质量闸门补丁/i,
  /CouncilQualityGate\s*返修补丁/i,
  /PRD\s*成稿生成失败/i,
  /模型主持人没有稳定返回/i,
]

const INTERNAL_TAIL_HEADING_PATTERNS = [
  /^##\s+超顶级\s*PRD\s*评分尺/im,
  /^##\s+附录：过程证据与决策追溯/im,
  /^##\s+共识形成追溯/im,
  /^##\s+实时运行快照/im,
  /^##\s+小白辩论剧场/im,
  /^##\s+CouncilQualityGate\s*·?\s*质量闸门/im,
  /^##\s+真实运行证据账本/im,
  /^##\s+人工审美与产物验收账本/im,
  /^##\s+Nuwa\s+来源级人工复核账本/im,
]

function compact(value: string, max = 180): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function formatDate(value: number | string | Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return formatDate(new Date())
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function sectionScore(markdown: string, checks: Array<{ label: string; patterns: RegExp[] }>): {
  score: number
  hitLabels: string[]
  missedLabels: string[]
} {
  const hitLabels: string[] = []
  const missedLabels: string[] = []
  for (const check of checks) {
    if (check.patterns.some((pattern) => pattern.test(markdown))) hitLabels.push(check.label)
    else missedLabels.push(check.label)
  }
  return {
    score: Math.round((hitLabels.length / Math.max(1, checks.length)) * 100),
    hitLabels,
    missedLabels,
  }
}

function dimension(
  id: string,
  label: string,
  score: number,
  evidence: string[],
  requiredFixes: string[],
): CouncilTopTierPrdDimension {
  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)))
  return {
    id,
    label,
    score: normalizedScore,
    status: normalizedScore >= 86 ? 'pass' : normalizedScore >= 68 ? 'warn' : 'fail',
    evidence,
    requiredFixes,
  }
}

function buildDimensionFromSections(
  id: string,
  label: string,
  markdown: string,
  checks: Array<{ label: string; patterns: RegExp[] }>,
  fixPrefix: string,
): CouncilTopTierPrdDimension {
  const signals = sectionScore(markdown, checks)
  return dimension(
    id,
    label,
    signals.score,
    [`命中：${signals.hitLabels.join(' / ') || '暂无'}`],
    signals.missedLabels.map((item) => `${fixPrefix}：补齐「${item}」。`),
  )
}

export function buildCouncilTopTierPrdEvaluation(input: {
  projectTitle: string
  problem: string
  finalPrd: string
  qualityGate?: CouncilQualityGate | null
  uiStyleContext?: UiMuseumPrdContext | null
  actionPack?: CouncilLaunchReadinessPack | null
  consensusTrace?: CouncilConsensusTrace | null
  workflowDispatchLabel?: string
}): CouncilTopTierPrdEvaluation {
  const markdown = redactSensitiveText(`${input.projectTitle}\n${input.problem}\n${input.finalPrd}`)
  const forbiddenHits = FORBIDDEN_FINAL_EXPORT_PATTERNS
    .filter((pattern) => pattern.test(markdown))
    .map((pattern) => pattern.source)

  const dimensions: CouncilTopTierPrdDimension[] = [
    buildDimensionFromSections('user-insight', '真实用户洞察', markdown, [
      { label: '目标用户', patterns: [/目标用户|用户画像|核心用户|人群/i] },
      { label: '真实场景', patterns: [/场景|旅程|端到端|首次进入|日常旅程/i] },
      { label: '痛点/动机', patterns: [/痛点|动机|焦虑|需求|为什么/i] },
      { label: '成功标准', patterns: [/成功标准|北极星|完成率|转化率|留存|指标/i] },
    ], '顶级 PRD 必须先证明为谁解决什么真实问题'),
    buildDimensionFromSections('market-judgment', '市场判断与赢法', markdown, [
      { label: '竞品/替代方案', patterns: [/竞品|替代方案|对标|差异/i] },
      { label: '定位', patterns: [/定位|一句话|北极星|核心承诺/i] },
      { label: '增长', patterns: [/增长|获客|冷启动|传播|留存/i] },
      { label: '商业模式', patterns: [/商业模式|付费|订阅|定价|收入/i] },
    ], '顶级 PRD 不能只可做，还要解释为什么会赢'),
    buildDimensionFromSections('product-completeness', '功能规格完整度', markdown, [
      { label: 'P0/P1/P2', patterns: [/P0|P1|P2|优先级/i] },
      { label: '不做清单', patterns: [/不做清单|暂缓|裁掉|不做/i] },
      { label: '页面清单', patterns: [/页面|Tab|Screen|View|信息架构/i] },
      { label: '组件状态', patterns: [/组件|空态|加载|失败态|完成态|状态/i] },
    ], '顶级 PRD 必须让产品和设计直接拆解'),
    buildDimensionFromSections('ui-implementation', 'UI 风格馆与像素级落地', markdown, [
      { label: 'UI风格馆', patterns: [/UI\s*风格馆|视觉 DNA|视觉输入/i] },
      { label: '色彩/字体/材质', patterns: [/色彩|字体|材质|token|调色板|palette/i] },
      { label: '动效/交互', patterns: [/动效|交互|hover|pressed|转场|反馈/i] },
      { label: '截图验收', patterns: [/截图验收|视觉验收|可访问性|VoiceOver|响应式/i] },
    ], '顶级 PRD 必须能落到页面、组件、状态和截图验收'),
    buildDimensionFromSections('engineering-feasibility', '工程约束与可开工性', markdown, [
      { label: '技术栈', patterns: [/技术栈|SwiftUI|React|Electron|后端|前端/i] },
      { label: '数据模型', patterns: [/数据模型|表结构|schema|SwiftData|SQLite|Postgres/i] },
      { label: 'API/接口', patterns: [/API|接口|请求|响应|错误码|幂等/i] },
      { label: '异常/降级', patterns: [/异常|错误|降级|离线|兜底|失败/i] },
    ], '顶级 PRD 必须让工程无需二次猜测'),
    buildDimensionFromSections('launch-validation', '商业验证与上线实验', markdown, [
      { label: 'MVP', patterns: [/MVP|首版|最小可行|P0/i] },
      { label: '验证实验', patterns: [/验证实验|用户访谈|小范围|TestFlight|试点/i] },
      { label: '验收标准', patterns: [/验收|测试矩阵|成功标准|指标/i] },
      { label: '上线风险', patterns: [/风险|App Store|审核|隐私说明|回滚/i] },
    ], '顶级 PRD 必须告诉团队如何验证而不是只描述愿景'),
    dimension(
      'evidence-trace',
      '证据链与动态追溯',
      Math.min(
        100,
        (input.consensusTrace?.sourcedScenes || 0) >= 6 ? 92 : (input.consensusTrace?.sourcedScenes || 0) * 12,
        input.qualityGate ? Math.max(input.qualityGate.score, 60) : 70,
      ),
      [
        input.consensusTrace ? `${input.consensusTrace.sourcedScenes}/${input.consensusTrace.totalScenes} 幕可追溯。` : '暂无共识追溯。',
        input.qualityGate ? `质量闸门 ${input.qualityGate.score}/${input.qualityGate.finalGateStatus}。` : '暂无质量闸门。',
      ],
      input.consensusTrace?.sourcedScenes
        ? []
        : ['补齐主张、反方质询、主持裁决和来源消息，不能只给最终结论。'],
    ),
    dimension(
      'action-closure',
      '行动闭环与工作流可分发',
      Math.min(
        100,
        (input.actionPack?.taskGroups.reduce((sum, group) => sum + group.tasks.length, 0) || 0) * 7 + 36,
      ),
      [
        input.actionPack
          ? `行动任务 ${input.actionPack.taskGroups.reduce((sum, group) => sum + group.tasks.length, 0)} 条。`
          : '暂无行动包。',
        input.workflowDispatchLabel ? sanitizeWorkflowLabel(input.workflowDispatchLabel) : '暂无工作流投递回执。',
      ],
      input.actionPack ? [] : ['补齐工作流任务包、owner hint、验收方式和历史记录。'],
    ),
  ]

  if (forbiddenHits.length > 0) {
    dimensions.push(dimension(
      'editorial-cleanliness',
      '最终编辑洁净度',
      35,
      [`命中不应进入最终 PRD 的内部语：${forbiddenHits.length} 项。`],
      ['移除通用占位、漫画弹窗文案、进行中投递状态、模型失败报告和返修补丁痕迹。'],
    ))
  } else {
    dimensions.push(dimension('editorial-cleanliness', '最终编辑洁净度', 94, ['没有命中内部过程污染词。'], []))
  }

  const score = Math.round(dimensions.reduce((sum, item) => sum + item.score, 0) / Math.max(1, dimensions.length))
  const blockers = dimensions.flatMap((item) => item.status === 'fail' ? item.requiredFixes.slice(0, 2) : [])
  const status: CouncilTopTierPrdStatus = blockers.length > 0 || forbiddenHits.length > 0
    ? 'blocked'
    : score >= 92
      ? 'elite-candidate'
      : score >= 82
        ? 'strong-draft'
        : 'needs-editorial-work'
  const developmentReady = status === 'elite-candidate' || status === 'strong-draft'
  const masterClaimAllowed = status === 'elite-candidate' && input.qualityGate?.finalGateStatus === 'approved'
  const claimLabel = masterClaimAllowed
    ? '大师级候选，可进入团队开发；仍需真人/审美/市场验证后才能对外称顶级'
    : developmentReady
      ? '强开发草案，可开工；不得声称最终大师级'
      : '候选稿需返修；暂不应交给团队直接照单开发'

  return {
    score,
    status,
    summary:
      status === 'elite-candidate'
        ? `超顶级 PRD 候选，综合 ${score}/100。仍需真实用户与人工审美验收后才能对外声称顶级。`
        : status === 'strong-draft'
          ? `强 PRD 草案，综合 ${score}/100。已经可进入工程拆解，但还需要补齐市场、验证或编辑洁净度。`
          : status === 'blocked'
            ? `最终交付阻断，综合 ${score}/100。存在内部过程污染或硬性缺口，不能伪装成顶级 PRD。`
            : `仍需总编辑返修，综合 ${score}/100。素材充分，但结构、证据、落地或增长闭环不够。`,
    dimensions,
    blockers,
    developmentReady,
    masterClaimAllowed,
    claimLabel,
  }
}

function sanitizeWorkflowLabel(value: string): string {
  if (/正在自动发给工作流模块/i.test(value)) {
    return '工作流投递已触发，最终回执请以 OpenBasaka 历史记录为准。'
  }
  return redactSensitiveText(value)
}

function stripInternalSections(markdown: string): string {
  const sectionsToStrip = [
    /##\s+共识形成追溯[\s\S]*?(?=\n##\s+|$)/gi,
    /##\s+自动补齐清单：仍需人工复验的 PRD 章节[\s\S]*?(?=\n##\s+|$)/gi,
    /##\s+CouncilQualityGate\s+返修补丁[\s\S]*?(?=\n##\s+|$)/gi,
    /##\s+质量闸门补丁[\s\S]*?(?=\n##\s+|$)/gi,
  ]
  let result = markdown
    .replace(/^#\s+.*(?:小白智囊团|大师共识|方法论共识).*\n+/i, '')
    .replace(/^\*\*(?:项目代号|文档版本|最后更新|执行权限|共识机制|用户问题|入选智囊)\*\*[：:]\s*.*\n?/gim, '')
  for (const pattern of sectionsToStrip) result = result.replace(pattern, '\n')
  const tailStart = INTERNAL_TAIL_HEADING_PATTERNS
    .map((pattern) => result.search(pattern))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0]
  if (typeof tailStart === 'number') result = result.slice(0, tailStart)
  return result
    .split('\n')
    .filter((line) => !FORBIDDEN_FINAL_EXPORT_PATTERNS.some((pattern) => pattern.test(line)))
    .join('\n')
    .trim()
}

function firstUsefulLine(markdown: string, fallback: string): string {
  const line = markdown
    .split('\n')
    .map((item) => item.replace(/^[-*>#\s]+/, '').trim())
    .find((item) => item.length >= 12 && !/本轮远程模型|原因|小白智囊团|最后更新|执行权限/.test(item))
  return compact(line || fallback, 180)
}

function renderDimensionTable(evaluation: CouncilTopTierPrdEvaluation): string {
  return [
    '| 维度 | 分数 | 状态 | 证据 | 必须补齐 |',
    '| --- | ---: | --- | --- | --- |',
    ...evaluation.dimensions.map((item) => [
      item.label,
      String(item.score),
      item.status,
      compact(item.evidence.join('；'), 180),
      compact(item.requiredFixes.join('；') || '暂无硬性返修项。', 180),
    ].map((cell) => cell.replace(/\|/g, '/')).join(' | ')).map((row) => `| ${row} |`),
  ].join('\n')
}

function renderActionTasks(actionPack?: CouncilLaunchReadinessPack | null): string {
  const tasks = actionPack?.taskGroups.flatMap((group) =>
    group.tasks.slice(0, 4).map((task) => ({
      area: group.label,
      title: task.title,
      priority: task.priority,
      acceptance: task.acceptance,
      ownerHint: task.ownerHint,
    })),
  ) || []
  if (!tasks.length) return '- 暂无行动包；本轮不能标记为可分发执行。'
  return tasks
    .slice(0, 14)
    .map((task, index) => `${index + 1}. **${task.priority}｜${task.area}｜${task.title}**：${task.acceptance}（${task.ownerHint}）`)
    .join('\n')
}

function renderMasterReadinessGate(evaluation: CouncilTopTierPrdEvaluation): string {
  const blockers = evaluation.blockers.length
    ? evaluation.blockers.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : '暂无硬阻断；下一步用真实用户、人工审美和工程 spike 验证。'
  const failedDimensions = evaluation.dimensions
    .filter((item) => item.status !== 'pass')
    .map((item) => `- ${item.label}: ${item.score}/100，${item.requiredFixes.join('；') || '需要人工复验。'}`)
    .join('\n') || '- 暂无低分维度。'
  return [
    `- 开工等级：${evaluation.claimLabel}`,
    `- 综合评分：${evaluation.score}/100 · ${evaluation.status}`,
    `- 是否可直接声称大师级：${evaluation.masterClaimAllowed ? '可以作为候选声称，但必须附带外部验证边界' : '不可以；必须先补齐下列缺口'}`,
    '',
    '### 硬缺口',
    '',
    blockers,
    '',
    '### 低分维度',
    '',
    failedDimensions,
  ].join('\n')
}

function renderDeveloperHandoff(actionPack?: CouncilLaunchReadinessPack | null): string {
  const tasks = actionPack?.taskGroups.flatMap((group) =>
    group.tasks.slice(0, 5).map((task) => ({
      area: group.label,
      title: task.title,
      priority: task.priority,
      acceptance: task.acceptance,
      ownerHint: task.ownerHint,
    })),
  ) || []
  if (!tasks.length) {
    return [
      '- P0: 产品负责人先把首版用户旅程、P0/P1/P2、不做清单和验收截图补成可拆票版本。',
      '- P0: 设计负责人补齐首屏、核心状态、异常状态、动效降级和截图验收。',
      '- P0: 工程负责人补齐数据模型、状态流、API/系统能力边界和测试门。',
    ].join('\n')
  }
  return tasks
    .slice(0, 16)
    .map((task, index) => `${index + 1}. **${task.priority}｜${task.area}｜${task.title}**：${task.acceptance}（${task.ownerHint}）`)
    .join('\n')
}

function renderUiMuseumSpec(uiStyleContext: UiMuseumPrdContext): string {
  return [
    `- 选用风格：${uiStyleContext.styleNames.join(' / ') || 'UI风格馆自动推荐'}。`,
    `- 选择理由：${uiStyleContext.reasoning}`,
    `- 色彩与材质：${uiStyleContext.visual.palette.join(' / ')}；背景 ${uiStyleContext.visual.background}；界面层 ${uiStyleContext.visual.surface}；强调色 ${uiStyleContext.visual.accent}。`,
    `- 组件规则：半径 ${uiStyleContext.visual.radius}；阴影 ${uiStyleContext.visual.shadow}；字体 ${uiStyleContext.visual.typography}；密度 ${uiStyleContext.visual.density}；动效 ${uiStyleContext.visual.motion}。`,
    `- iOS 落地：${uiStyleContext.platformNotes.ios}`,
    `- Web 落地：${uiStyleContext.platformNotes.web}`,
    `- 组件状态：${uiStyleContext.componentStates.join('；')}`,
    `- 视觉验收：${uiStyleContext.acceptanceChecklist.join('；')}`,
  ].join('\n')
}

function renderGapUpgradeBrief(evaluation: CouncilTopTierPrdEvaluation): string {
  const gaps = evaluation.dimensions
    .filter((item) => item.status !== 'pass')
    .flatMap((item) => item.requiredFixes.slice(0, 2))
    .slice(0, 10)
  if (!gaps.length) return '- 当前主文档已达到强候选；下一步以真实用户、人工审美和工程 Spike 做外部验证。'
  return gaps.map((gap, index) => `${index + 1}. ${gap}`).join('\n')
}

export function renderCouncilTopTierPrdEvaluationMarkdown(evaluation: CouncilTopTierPrdEvaluation): string {
  return [
    '## 超顶级 PRD 评分尺',
    '',
    `- 综合分：${evaluation.score}/100`,
    `- 状态：${evaluation.status}`,
    `- 结论：${evaluation.summary}`,
    '',
    renderDimensionTable(evaluation),
    '',
    '### 继续往上顶的缺口',
    '',
    renderGapUpgradeBrief(evaluation),
  ].join('\n')
}

export function buildCouncilTopTierPrdExport(input: CouncilTopTierPrdExportInput): string {
  const cleanedMainPrd = stripInternalSections(redactSensitiveText(input.finalPrd || '尚未生成 PRD 正文。'))
  const generatedAt = formatDate(input.generatedAt || new Date())
  const evaluation = buildCouncilTopTierPrdEvaluation({
    projectTitle: input.projectTitle,
    problem: input.problem,
    finalPrd: cleanedMainPrd,
    qualityGate: input.qualityGate,
    uiStyleContext: input.uiStyleContext,
    actionPack: input.actionPack,
    consensusTrace: input.consensusTrace,
  })

  const markdown = [
    `# ${input.projectTitle} PRD`,
    '',
    '> 这份文档只描述产品本身：用户、体验、功能、UI、工程、商业验证和验收标准。辩论过程、质量门、运行证据、工作流回执另见独立过程文档。',
    '',
    '## 文档元信息',
    '',
    `- 项目名：${input.projectTitle}`,
    `- 生成日期：${generatedAt}`,
    '- 文档类型：产品需求文档 PRD',
    '',
    '## Boss 3 分钟总览',
    '',
    `- 一句话：${firstUsefulLine(cleanedMainPrd, input.problem)}`,
    `- 产品原始需求：${compact(redactSensitiveText(input.problem), 260)}`,
    '- 阅读方式：产品、设计、工程、增长、测试都应只按本文档拆需求；过程证据不混入 PRD 正文。',
    '',
    '## 大师级开工判定',
    '',
    renderMasterReadinessGate(evaluation),
    '',
    '## 主 PRD 正文',
    '',
    cleanedMainPrd || '本轮没有生成可交付 PRD 正文。',
    '',
    '## UI 风格馆落地规格',
    '',
    renderUiMuseumSpec(input.uiStyleContext),
    '',
    '## 团队开发执行版',
    '',
    renderDeveloperHandoff(input.actionPack),
  ].filter(Boolean).join('\n')

  return redactSensitiveText(markdown)
}

export function buildCouncilTopTierPrdProcessMarkdown(input: CouncilTopTierPrdProcessInput): string {
  const evaluation = buildCouncilTopTierPrdEvaluation(input)
  const generatedAt = formatDate(input.generatedAt || new Date())
  const workflowLabel = input.workflowDispatchLabel ? sanitizeWorkflowLabel(input.workflowDispatchLabel) : '完成后会写入 OpenBasaka 历史与工作流候选。'
  const qualityText = input.qualityGate
    ? `${input.qualityGate.score}/100 · ${input.qualityGate.finalGateStatus}`
    : '未生成质量闸门'
  const markdown = [
    `# ${input.projectTitle}｜小白智囊团辩论过程与证据`,
    '',
    '> 这是过程文档，不是产品 PRD。它记录为什么形成这个产品判断、谁提出了关键主张、哪些意见被质询或裁掉、质量门如何评估、后续行动如何投递。',
    '',
    '## 过程元信息',
    '',
    `- 项目名：${input.projectTitle}`,
    `- 生成日期：${generatedAt}`,
    input.runId ? `- 运行 ID：${input.runId}` : '',
    `- 质量闸门：${qualityText}`,
    `- 超顶级评分：${evaluation.score}/100 · ${evaluation.status}`,
    `- 工作流记录：${workflowLabel}`,
    `- 原始需求：${compact(redactSensitiveText(input.problem), 360)}`,
    '',
    renderCouncilTopTierPrdEvaluationMarkdown(evaluation),
    '',
    '## 工作流行动包',
    '',
    renderActionTasks(input.actionPack),
    '',
    input.consensusTrace ? renderCouncilConsensusTraceMarkdown(input.consensusTrace) : '## 共识形成追溯\n\n暂无可追溯辩论记录。',
    input.liveSnapshotsMarkdown || '',
    input.theaterMarkdown || '',
    input.deliveryModesMarkdown || '',
    input.actionPackMarkdown || '',
    input.auditMarkdown || '',
    input.appendixMarkdown || '',
  ].filter(Boolean).join('\n\n')

  return redactSensitiveText(markdown)
}
