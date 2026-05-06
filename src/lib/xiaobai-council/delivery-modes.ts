import type { CouncilBaoyuVisualPlan } from './baoyu'
import type { CouncilDebateMap, CouncilDebateScene, CouncilVerdictLedger } from './debate-theater'
import type { CouncilQualityGate } from './quality-gate'
import type { CouncilSelection } from './selector'

export type CouncilAudienceMode = 'boss-review' | 'xiaobai-execute'

export interface CouncilTraceSignal {
  label: string
  value: string
  detail: string
}

export interface CouncilBossReviewMode {
  mode: 'boss-review'
  headline: string
  summary: string
  traceSignals: CouncilTraceSignal[]
  criticalTension: string
}

export interface CouncilXiaobaiActionMode {
  mode: 'xiaobai-execute'
  headline: string
  promise: string
  firstAction: string
  nextSteps: string[]
  whatSystemHides: string[]
  trustSignals: CouncilTraceSignal[]
  doNotDo: string[]
  traceBack: {
    scenes: number
    relations: number
    kept: number
    cut: number
    revised: number
    sourceSceneIds: string[]
  }
}

export interface CouncilDeliveryModes {
  defaultMode: CouncilAudienceMode
  bossReview: CouncilBossReviewMode
  xiaobaiExecute: CouncilXiaobaiActionMode
}

interface CouncilDeliveryModesInput {
  problem: string
  selection: CouncilSelection
  prdMarkdown: string
  scenes: CouncilDebateScene[]
  debateMap: CouncilDebateMap
  verdictLedger: CouncilVerdictLedger
  qualityGate?: CouncilQualityGate
  baoyuVisualPlans?: CouncilBaoyuVisualPlan[]
}

function compact(value: string, max = 180): string {
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
    240,
  )
}

function firstMatch(markdown: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = markdown.match(pattern)
    if (match?.[1]) return stripMarkdown(match[1])
  }
  return ''
}

function listCandidates(markdown: string): string[] {
  return markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+|^\d+\.\s+/.test(line))
    .map(toActionCandidate)
    .filter(Boolean)
}

function toActionCandidate(line: string): string {
  const cleaned = stripMarkdown(line)
  if (!cleaned) return ''

  if (/^(背景|痛点|核心痛点|目标用户|用户画像|核心场景|使用场景|一句话定位|北极星指标|项目范围|技术架构|设计原则)[：:]/.test(cleaned)) {
    return ''
  }

  if (/^输入方式[：:]/.test(cleaned) || /自然语言类比句|类似小红书但给程序员/.test(cleaned)) {
    return '输入一句自然语言类比句，例如“类似小红书但给程序员”。'
  }

  if (/^生成[：:]/.test(cleaned) || /点击“?生成文档/.test(cleaned)) {
    return '点击“生成文档”，让系统在 5 秒内输出四段可编辑文档。'
  }

  if (/^完成[：:]/.test(cleaned) || /截图或复制文本/.test(cleaned)) {
    return '满意后截图或复制文本，发给团队开始讨论。'
  }

  if (/结构化追问|用户输入一句话需求后|输入一句话需求/.test(cleaned)) {
    return '输入一句话真实项目想法，先回答目标用户、核心功能、不做清单这 3 个追问。'
  }

  if (/三轨并行|预置选项|自由输入|待定/.test(cleaned)) {
    return '每个追问先选一个预置选项；不确定就选“待定”，系统会保留可回来的路径。'
  }

  if (/PRD\s*骨架|确认骨架|骨架生成/.test(cleaned)) {
    return '确认 1 页 PRD 骨架，再让系统展开完整 PRD。'
  }

  if (/首版验证|验证实验|用户访谈/.test(cleaned)) {
    return '用一个真实用户做首版验证，记录是否愿意继续推进。'
  }

  if (/^(输入|选择|点击|确认|回答|完成|验证|测试|访谈|归档|生成|打开|收集|导出|保存)/.test(cleaned)) {
    return cleaned
  }

  return ''
}

function unique(values: string[], max: number): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const next = compact(value, 150)
    if (!next || seen.has(next)) continue
    seen.add(next)
    result.push(next)
    if (result.length >= max) break
  }
  return result
}

function fallbackAction(problem: string): string {
  return `先把「${compact(problem, 42) || '这个项目'}」写成 1 句话目标，再选择最大限制：时间、预算、技能、人脉或失败容忍度。`
}

export function buildCouncilDeliveryModes(input: CouncilDeliveryModesInput): CouncilDeliveryModes {
  const positioning =
    firstMatch(input.prdMarkdown, [/\*\*定位\*\*[：:]\s*([^\n]+)/, /定位[：:]\s*([^\n]+)/]) ||
    firstMatch(input.prdMarkdown, [/项目一句话定位[^\n]*\n+([^\n]+)/, /一句话定位[^\n]*\n+([^\n]+)/]) ||
    `把「${compact(input.problem, 48)}」压缩成可执行的第一步。`
  const northStar =
    firstMatch(input.prdMarkdown, [/\*\*北极星指标\*\*[：:]\s*([^\n]+)/, /北极星指标[：:]\s*([^\n]+)/]) ||
    '用户看完后能说出明天第一步该做什么。'
  const nextSteps = unique(
    [
      ...listCandidates(input.prdMarkdown),
      '输入一个真实项目想法，不需要先写完整 PRD。',
      '确认系统复述是否理解正确。',
      '选择最大限制，先生成最小可执行方案。',
      '按验收标准完成一次首版验证。',
    ],
    5,
  )
  const firstAction =
    nextSteps.find((step) => /自然语言类比句|类比句|类似/.test(step)) ||
    nextSteps.find((step) => /输入|选择|确认|第一步|明天/.test(step)) ||
    fallbackAction(input.problem)
  const cutLabels = input.verdictLedger.cut.map((item) => item.label)
  const openLabels = input.verdictLedger.openDisagreements.map((item) => item.label)
  const sceneTensions = input.scenes.flatMap((scene) => [scene.objection, scene.verdictImpact, scene.claim]).filter(Boolean)
  const hiddenComplexity = [
    `隐藏 ${input.scenes.length} 幕大师博弈，只给小白展示当前一步、下一步和可跳过项。`,
    `隐藏 ${input.debateMap.edges.length} 条支持/反对/修正关系，只保留“为什么这样建议”的折叠解释。`,
    '隐藏角色名称和长篇争论，避免把决策焦虑转移给用户。',
    '保留 Boss 复盘入口，必要时可以回看每条结论的来源场景。',
  ]
  const trustSignals: CouncilTraceSignal[] = [
    {
      label: '质量闸门',
      value: input.qualityGate ? `${input.qualityGate.score} · ${input.qualityGate.finalGateStatus || input.qualityGate.status}` : '未完成',
      detail: input.qualityGate?.summary || '等待 PRD 成稿后进入质量闸门。',
    },
    {
      label: '辩论来源',
      value: `${input.scenes.length} 幕`,
      detail: '每个结论至少可回到一条角色主张、反方质询或主持裁决。',
    },
    {
      label: '裁决账本',
      value: `${input.verdictLedger.kept.length}/${input.verdictLedger.cut.length}/${input.verdictLedger.revised.length}`,
      detail: '分别代表保留、裁掉、修正吸收的观点数量。',
    },
    {
      label: 'PRD 蓝图',
      value: input.qualityGate ? `${input.qualityGate.prdCompletenessScore} 分` : '待生成',
      detail: '完整 PRD、全栈技术章节和共识追溯默认进入主产物。',
    },
  ]
  const criticalTension =
    unique(
      [...openLabels, ...cutLabels, ...sceneTensions].filter((label) => /不要让用户看到|黑箱|博弈|焦虑|自动生成|未授权/.test(label)),
      1,
    )[0] || 'Boss 需要完整复盘，小白需要低负担执行；系统必须同时提供审计层和简洁层。'

  return {
    defaultMode: 'boss-review',
    bossReview: {
      mode: 'boss-review',
      headline: 'Boss 复盘模式：看见思考如何发生',
      summary: `本轮由 ${input.selection.seats.length} 位角色形成 ${input.scenes.length} 幕剧场、${input.debateMap.edges.length} 条关系边和 ${input.verdictLedger.prdImpacts.length} 条 PRD 影响记录。`,
      traceSignals: trustSignals,
      criticalTension,
    },
    xiaobaiExecute: {
      mode: 'xiaobai-execute',
      headline: '小白执行模式：只给下一步，不暴露脑内风暴',
      promise: `${positioning} 北极星：${northStar}`,
      firstAction,
      nextSteps,
      whatSystemHides: hiddenComplexity,
      trustSignals,
      doNotDo: unique(
        [...cutLabels, ...openLabels, ...sceneTensions.filter((label) => /不要|不能|不应|否决|裁掉|未授权/.test(label))],
        4,
      ),
      traceBack: {
        scenes: input.scenes.length,
        relations: input.debateMap.edges.length,
        kept: input.verdictLedger.kept.length,
        cut: input.verdictLedger.cut.length,
        revised: input.verdictLedger.revised.length,
        sourceSceneIds: input.scenes.slice(0, 8).map((scene) => scene.id),
      },
    },
  }
}

export function renderCouncilDeliveryModesMarkdown(deliveryModes: CouncilDeliveryModes): string {
  const brief = deliveryModes.xiaobaiExecute
  return [
    '## 双模式结果层',
    '',
    `### Boss 复盘模式`,
    '',
    `- ${deliveryModes.bossReview.summary}`,
    `- 关键张力：${deliveryModes.bossReview.criticalTension}`,
    '',
    `### 小白执行模式`,
    '',
    `- 系统承诺：${brief.promise}`,
    `- 现在只做这一件事：${brief.firstAction}`,
    '',
    '#### 下一步',
    ...brief.nextSteps.map((step, index) => `${index + 1}. ${step}`),
    '',
    '#### 系统隐藏的复杂度',
    ...brief.whatSystemHides.map((item) => `- ${item}`),
    '',
    '#### 本轮明确不做',
    ...(brief.doNotDo.length ? brief.doNotDo.map((item) => `- ${item}`) : ['- 未抽取到明确否决项。']),
    '',
    `#### 可回溯底层`,
    `- ${brief.traceBack.scenes} 幕 / ${brief.traceBack.relations} 条关系 / 保留 ${brief.traceBack.kept} / 裁掉 ${brief.traceBack.cut} / 修正 ${brief.traceBack.revised}`,
  ].join('\n')
}
