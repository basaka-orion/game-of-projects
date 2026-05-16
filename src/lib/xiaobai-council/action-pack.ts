import type { CouncilBaoyuVisualPlan } from './baoyu'
import type { CouncilDeliveryModes } from './delivery-modes'
import type { CouncilVerdictLedger } from './debate-theater'
import type { CouncilQualityGate } from './quality-gate'
import type { CouncilSelection } from './selector'

export type CouncilActionTaskArea = 'product' | 'design' | 'engineering' | 'test' | 'validation'
export type CouncilActionTaskPriority = 'P0' | 'P1' | 'P2'

export interface CouncilActionTask {
  id: string
  area: CouncilActionTaskArea
  priority: CouncilActionTaskPriority
  title: string
  ownerHint: string
  acceptance: string
  source: string
}

export interface CouncilActionTaskGroup {
  area: CouncilActionTaskArea
  label: string
  intent: string
  tasks: CouncilActionTask[]
}

export interface CouncilActionMilestone {
  label: string
  timeframe: string
  outcome: string
  taskIds: string[]
}

export interface CouncilLaunchReadinessPack {
  score: number
  scoreLabel: string
  oneScreenBrief: string
  primaryCta: string
  nowAction: string
  successMetric: string
  milestones: CouncilActionMilestone[]
  taskGroups: CouncilActionTaskGroup[]
  riskControls: string[]
  exportChecklist: string[]
  sourceTrace: string[]
}

interface CouncilLaunchReadinessPackInput {
  problem: string
  selection: CouncilSelection
  prdMarkdown: string
  deliveryModes: CouncilDeliveryModes
  verdictLedger: CouncilVerdictLedger
  qualityGate: CouncilQualityGate
  baoyuVisualPlans: CouncilBaoyuVisualPlan[]
}

const AREA_LABELS: Record<CouncilActionTaskArea, string> = {
  product: '产品定义',
  design: '体验设计',
  engineering: '工程实现',
  test: '测试验收',
  validation: '首版验证',
}

const AREA_INTENTS: Record<CouncilActionTaskArea, string> = {
  product: '把大师共识压成一句话、边界和 P0 范围，避免 PRD 继续膨胀。',
  design: '把 UI 风格馆、小白理解路径和 PRD 阅读器落到具体页面、状态和动效节奏。',
  engineering: '把深度匹配、辩论剧场、质量闸门和导出变成可追踪的数据流。',
  test: '用自动化和真实 Electron 路径证明不是纸面神作。',
  validation: '用小样本真实用户检查小白是否能完成第一次行动。',
}

function compact(value: string, max = 160): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function stripMarkdown(value: string): string {
  return compact(
    value
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .replace(/^#+\s*/gm, '')
      .replace(/^\s*[-*]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, ''),
    220,
  )
}

function firstMatch(markdown: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = markdown.match(pattern)
    if (match?.[1]) return stripMarkdown(match[1])
  }
  return ''
}

function firstLineMatching(markdown: string, patterns: RegExp[]): string {
  const lines = markdown.split('\n').map((line) => line.trim()).filter(Boolean)
  for (const pattern of patterns) {
    const line = lines.find((item) => pattern.test(item))
    if (line) return stripMarkdown(line)
  }
  return ''
}

function unique(values: string[], max: number): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values) {
    const next = compact(value, 180)
    if (!next || seen.has(next)) continue
    seen.add(next)
    output.push(next)
    if (output.length >= max) break
  }
  return output
}

function scoreLabel(score: number): string {
  if (score >= 92) return '可开工巨细版'
  if (score >= 86) return '接近 90 分，还需真实用户复验'
  if (score >= 76) return '可读但未到代表性版本'
  return '需要返修后再交付'
}

function task(
  area: CouncilActionTaskArea,
  priority: CouncilActionTaskPriority,
  id: string,
  title: string,
  ownerHint: string,
  acceptance: string,
  source: string,
): CouncilActionTask {
  return { id: `${area}-${id}`, area, priority, title, ownerHint, acceptance, source }
}

export function buildCouncilLaunchReadinessPack(input: CouncilLaunchReadinessPackInput): CouncilLaunchReadinessPack {
  const positioning =
    firstMatch(input.prdMarkdown, [/\*\*定位\*\*[：:]\s*([^\n]+)/, /定位[：:]\s*([^\n]+)/]) ||
    firstMatch(input.prdMarkdown, [/项目一句话定位[^\n]*\n+([^\n]+)/, /一句话定位[^\n]*\n+([^\n]+)/]) ||
    input.deliveryModes.xiaobaiExecute.promise
  const northStar =
    firstMatch(input.prdMarkdown, [/\*\*北极星指标\*\*[：:]\s*([^\n]+)/, /北极星指标[：:]\s*([^\n]+)/]) ||
    '用户首次使用后能说出下一步，并愿意继续推进一次。'
  const firstP0 =
    firstLineMatching(input.prdMarkdown, [/P0|优先级|输入|匹配闸门|辩论剧场|质量闸门/i]) ||
    'P0 锁定输入、深度匹配、辩论剧场、质量闸门和导出闭环。'
  const firstValidation =
    firstLineMatching(input.prdMarkdown, [/首版验证|验证实验|用户访谈|可验证|实验/i]) ||
    '找 5-8 个目标用户完成一次从问题输入到可执行 PRD 的完整路径，至少 5 人留证且 4 人通过。'
  const firstDesign =
    firstLineMatching(input.prdMarkdown, [/页面|组件|空态|加载|失败态|动效|UI风格馆|Remotion/i]) ||
    '画出输入区、匹配过程、辩论剧场、关系地图、行动面板、质量闸门和导出状态。'
  const firstEngineering =
    firstLineMatching(input.prdMarkdown, [/接口|API|数据|状态流|数据库|workflow|TeamMessage/i]) ||
    '把 MatchGate、TeamMessage、Scene、Map、Ledger、QualityGate、ActionPack 和导出记录串成状态流。'
  const firstTest =
    firstLineMatching(input.prdMarkdown, [/测试|验收|smoke|typecheck|build|Electron|视觉回归/i]) ||
    '通过 targeted vitest、typecheck、smoke:ui、build 和 Electron 完整路径复验。'
  const doNotDo = unique(
    [
      ...input.verdictLedger.cut.map((item) => item.label),
      ...input.deliveryModes.xiaobaiExecute.doNotDo,
      '不把真人原型伪装成本人发言，不把 Telegram 当默认同步。',
    ],
    4,
  )

  const tasks: CouncilActionTask[] = [
    task(
      'product',
      'P0',
      'positioning',
      '锁定一句话定位、北极星指标和不做清单',
      'Boss + 产品席位',
      `PRD 顶部能看到一句话定位「${compact(positioning, 72)}」、北极星指标「${compact(northStar, 72)}」和至少 3 条本轮明确不做。`,
      'PRD 定位 / 裁决账本',
    ),
    task(
      'product',
      'P0',
      'scope',
      '把 P0/P1/P2 切成首版边界',
      '产品席位 + 主持裁决',
      `${firstP0} P0 项必须能在首版闭环中被点击、看到结果、导出或复盘。`,
      '质量闸门 actionable-prd',
    ),
    task(
      'design',
      'P0',
      'first-screen',
      '画出小白第一屏和剧场翻页路径',
      '设计席位',
      `${firstDesign} 每个页面至少有空态、加载、失败态、完成态和 reduced-motion 降级。`,
      'UI风格馆 / PRD 页面状态',
    ),
    task(
      'design',
      'P1',
      'master-prd-reader',
      '把最终 PRD 变成可阅读、可追溯、可复制的主界面',
      '设计席位 + 工程席位',
      '首屏先展示完整 PRD 和全技术栈蓝图；共识形成过程折叠成主张、质询、吸收、裁掉四条证据线。',
      '大师 PRD 阅读器 / 共识追溯',
    ),
    task(
      'engineering',
      'P0',
      'state-flow',
      '实现从问题到 ActionPack 的端到端状态流',
      '工程席位',
      `${firstEngineering} result 中必须同时包含 selection、scenes、map、ledger、qualityGate、deliveryModes、actionPack。`,
      'workflow result',
    ),
    task(
      'engineering',
      'P1',
      'export',
      '导出 PRD、共识追溯、裁决、质量闸门和行动包',
      '工程席位',
      'Markdown/HTML 导出里能回看推荐编队、完整 PRD、共识形成追溯、辩论剧场、双模式结果、90分行动面板和质量闸门。',
      '导出清单',
    ),
    task(
      'test',
      'P0',
      'automated-gates',
      '建立自动化验收门',
      '测试席位',
      `${firstTest} 失败时必须显示未通过原因或返修链，不允许静默当作通过。`,
      'CouncilQualityGate',
    ),
    task(
      'test',
      'P1',
      'traceability',
      '抽查每个最终结论的可追溯性',
      '测试席位 + 反方席位',
      '抽查至少 5 条最终 PRD 结论，每条都能追溯到场景、质询、裁决账本或质量闸门之一。',
      '辩论剧场 / 关系地图',
    ),
    task(
      'validation',
      'P0',
      'first-users',
      '做 5-8 人小白稳审验证',
      'Boss + 研究席位',
      `${firstValidation} 成功标准是至少 5 人完成记录且 4 人不解释也能完成第一次输入、看懂下一步、导出或复制结果。`,
      '首版验证实验',
    ),
    task(
      'validation',
      'P1',
      'review-loop',
      '把真实反馈写回 Boss 画像和角色 reflection',
      'Boss + Hermes 记忆层',
      '每次验证后生成反馈摘要、置信度、来源、时间和可撤销版本，下轮才影响 dream 和匹配。',
      'Hermes 冻结规则 / Creative DNA',
    ),
  ]

  const taskGroups: CouncilActionTaskGroup[] = (Object.keys(AREA_LABELS) as CouncilActionTaskArea[]).map((area) => ({
    area,
    label: AREA_LABELS[area],
    intent: AREA_INTENTS[area],
    tasks: tasks.filter((item) => item.area === area),
  }))

  const requiredFixes = input.qualityGate.checks.flatMap((check) => check.requiredFixes)
  const riskControls = unique(
    [
      ...doNotDo,
      ...requiredFixes,
      '所有动画、进度和剧场页面必须绑定真实 TeamMessage、QualityGate 或导出状态。',
      '强时效、高风险或外部事实默认标注待查证，不用模型自信语气掩盖不确定。',
      '本地资料只展示安全摘要，不导出密钥、原始长日志或私有画像明文。',
    ],
    7,
  )
  const actionCoverageBonus = taskGroups.every((group) => group.tasks.length >= 2) ? 4 : 0
  const exportCoverageBonus = input.qualityGate.checks.some((check) => check.id === 'master-prd-fullstack' && check.status !== 'fail') ? 3 : 1
  const qualityAverage = Math.round((input.qualityGate.score + input.qualityGate.prdCompletenessScore + input.qualityGate.launchReadinessScore) / 3)
  const taskCoverageScore = taskGroups.every((group) => group.tasks.length >= 2) ? 92 : 70 + taskGroups.filter((group) => group.tasks.length > 0).length * 4
  const riskCoverageScore = riskControls.length >= 5 ? 90 : 72 + riskControls.length * 3
  const exportChecklistScore = input.baoyuVisualPlans.length >= 4 ? 92 : 88
  const sourceTraceScore = input.verdictLedger.kept.length + input.verdictLedger.cut.length + input.verdictLedger.revised.length > 0 ? 90 : 82
  const qualityStatusPenalty =
    input.qualityGate.finalGateStatus === 'approved'
      ? 0
      : input.qualityGate.finalGateStatus === 'needs-revision'
        ? 3
        : 6
  const score = Math.min(
    100,
    Math.round(
      taskCoverageScore * 0.38 +
        riskCoverageScore * 0.18 +
        exportChecklistScore * 0.16 +
        sourceTraceScore * 0.12 +
        Math.max(60, qualityAverage) * 0.16,
    ) +
      actionCoverageBonus +
      exportCoverageBonus -
      qualityStatusPenalty,
  )

  return {
    score,
    scoreLabel: scoreLabel(score),
    oneScreenBrief: `把「${compact(input.problem, 54)}」从大师博弈结果压成可开工任务：先完成定位、P0 范围、首屏路径、状态流、自动化验收和 5-8 人稳审验证。`,
    primaryCta: '生成 90 分行动包并进入首版验证',
    nowAction: input.deliveryModes.xiaobaiExecute.firstAction,
    successMetric: `${northStar}；首版验证至少 5 人留证且 4 人完成一次闭环。`,
    milestones: [
      {
        label: '今天',
        timeframe: '0-1 天',
        outcome: '锁定定位、P0 边界、首屏草图和验收清单。',
        taskIds: ['product-positioning', 'product-scope', 'design-first-screen'],
      },
      {
        label: '本周',
        timeframe: '2-5 天',
        outcome: '跑通工作流、导出和自动化验收。',
        taskIds: ['engineering-state-flow', 'engineering-export', 'test-automated-gates'],
      },
      {
        label: '首版复验',
        timeframe: '5-7 天',
        outcome: '完成小白用户验证，把反馈写回画像与 reflection。',
        taskIds: ['test-traceability', 'validation-first-users', 'validation-review-loop'],
      },
    ],
    taskGroups,
    riskControls,
    exportChecklist: [
      'PRD：可拆产品、设计、工程、测试和验证任务。',
      '辩论剧场：每条结论有场景来源、质询或裁决账本记录。',
      '关系地图：支持、反对、修正、吸收路径可回看。',
      '质量闸门：显示评分、返修链、未通过原因和最终状态。',
      '行动面板：显示当前一步、里程碑、任务分组、验收标准和风险控制。',
      '共识追溯：主张、质询、吸收、裁掉四条证据线可回看。',
    ],
    sourceTrace: [
      `${input.selection.seats.length} 位入选角色`,
      `${input.verdictLedger.kept.length} 条保留 / ${input.verdictLedger.cut.length} 条裁掉 / ${input.verdictLedger.revised.length} 条修正`,
      `质量闸门 ${input.qualityGate.score} / PRD 完整度 ${input.qualityGate.prdCompletenessScore} / 上线准备度 ${input.qualityGate.launchReadinessScore}`,
      `全栈 PRD 检查 ${input.qualityGate.checks.find((check) => check.id === 'master-prd-fullstack')?.score ?? input.qualityGate.prdCompletenessScore}`,
    ],
  }
}

export function renderCouncilActionPackMarkdown(pack: CouncilLaunchReadinessPack): string {
  return [
    '## 90 分行动面板',
    '',
    `- score: ${pack.score} · ${pack.scoreLabel}`,
    `- oneScreenBrief: ${pack.oneScreenBrief}`,
    `- primaryCta: ${pack.primaryCta}`,
    `- nowAction: ${pack.nowAction}`,
    `- successMetric: ${pack.successMetric}`,
    '',
    '### 里程碑',
    ...pack.milestones.map((item) => `- ${item.label}（${item.timeframe}）：${item.outcome}`),
    '',
    '### 任务分组',
    ...pack.taskGroups.map((group) =>
      [
        `#### ${group.label}`,
        group.intent,
        ...group.tasks.map((item) => `- ${item.priority} ${item.title}｜owner: ${item.ownerHint}｜验收: ${item.acceptance}`),
      ].join('\n'),
    ),
    '',
    '### 风险控制',
    ...pack.riskControls.map((item) => `- ${item}`),
    '',
    '### 导出清单',
    ...pack.exportChecklist.map((item) => `- ${item}`),
  ].join('\n')
}
