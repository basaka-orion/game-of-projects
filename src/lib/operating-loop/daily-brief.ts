import type { ExecutionLearningSummary } from '../agents/execution-review'
import type { OperatingEventRow } from '../db/repository'
import type { OperatingLoopTarget, OperatingLoopTone } from './types'

export type DailyBriefSectionKind = 'deposits' | 'actions' | 'gaps' | 'agents'

export interface DailyBriefItem {
  id: string
  title: string
  value: string | number
  description: string
  target: OperatingLoopTarget
  tone?: OperatingLoopTone
}

export interface DailyBriefSection {
  id: DailyBriefSectionKind
  title: string
  eyebrow: string
  target: OperatingLoopTarget
  tone?: OperatingLoopTone
  items: DailyBriefItem[]
}

export interface DailyBriefDeck {
  dateLabel: string
  readinessScore: number
  headline: string
  focus: string
  sections: DailyBriefSection[]
}

export interface BuildDailyBriefInput {
  now?: Date
  projectCount: number
  classifiedProjectCount: number
  synapseCount: number
  highSignalSynapseCount: number
  bossMemoryCount: number
  decisionCount: number
  pendingArchiveCount: number
  operatingEvents: OperatingEventRow[]
  executionSummary: ExecutionLearningSummary
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function dateLabel(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseTime(value: string): number {
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : 0
}

function recentEvents(events: OperatingEventRow[], now: Date, hours: number): OperatingEventRow[] {
  const floor = now.getTime() - hours * 60 * 60 * 1000
  return events.filter((event) => parseTime(event.created_at) >= floor)
}

function buildReadinessScore(input: BuildDailyBriefInput): number {
  const projectCoverage = input.projectCount > 0 ? input.classifiedProjectCount / input.projectCount : 0
  const synapseSignal =
    input.synapseCount > 0 ? Math.min(1, input.highSignalSynapseCount / Math.max(1, input.synapseCount)) : 0
  const bossSignal = Math.min(1, input.bossMemoryCount / 10)
  const loopSignal = Math.min(1, input.operatingEvents.length / 8)
  const executionSignal = input.executionSummary.total > 0 ? input.executionSummary.evidenceCoverage / 100 : 0

  return clampPercent(
    projectCoverage * 28 + bossSignal * 18 + loopSignal * 18 + executionSignal * 24 + synapseSignal * 12,
  )
}

function buildHeadline(score: number): string {
  if (score >= 88) return '外脑主循环已经可以进入主动推进。'
  if (score >= 72) return '外脑主循环可用，但仍有关键缺口要补。'
  if (score >= 52) return '先补入口、画像、证据和执行收据，避免系统只会展示。'
  return '今天的重点是把第一批真实输入接进闭环。'
}

function buildFocus(input: BuildDailyBriefInput): string {
  if (input.pendingArchiveCount > 0) return '先清启蒙收件箱，让可长期记忆的材料入宫。'
  if (input.executionSummary.retryRecommended > 0 || input.executionSummary.failed > 0) {
    return '先处理失败、重试和高风险执行，避免错误结果进入长期系统。'
  }
  if (input.projectCount > 0 && input.classifiedProjectCount < input.projectCount) {
    return '先补项目分类，让神经元可以被推演室和 Agent 稳定调用。'
  }
  if (input.executionSummary.total === 0) return '启动一次 Agent 或 Cron 执行，生成第一批可复盘收据。'
  return '进入推演室推进一个高价值项目，并让行动结果回写。'
}

function fallbackItem(target: OperatingLoopTarget, title: string, description: string): DailyBriefItem {
  return {
    id: `fallback-${target}`,
    title,
    value: '正常',
    description,
    target,
    tone: 'success',
  }
}

export function buildDailyBriefDeck(input: BuildDailyBriefInput): DailyBriefDeck {
  const now = input.now ?? new Date()
  const recent = recentEvents(input.operatingEvents, now, 24)
  const recentDeposits = recent.filter((event) => ['remember', 'compile', 'review'].includes(event.stage)).length
  const recentExecutions = recent.filter((event) => event.stage === 'execute').length
  const unclassifiedProjects = Math.max(0, input.projectCount - input.classifiedProjectCount)
  const readinessScore = buildReadinessScore(input)

  const depositItems: DailyBriefItem[] = [
    {
      id: 'recent-deposits',
      title: '昨日沉淀',
      value: recentDeposits,
      description:
        recentDeposits > 0
          ? '最近 24 小时已有记忆、知识或复盘事件写入主循环。'
          : '最近 24 小时还没有新的沉淀事件，先让启蒙或执行结果入宫。',
      target: 'memory',
      tone: recentDeposits > 0 ? 'success' : 'warning',
    },
    {
      id: 'boss-memory-count',
      title: 'Boss 画像燃料',
      value: input.bossMemoryCount,
      description:
        input.bossMemoryCount > 0
          ? '已有可被 Agent 复用的 Boss 记忆，继续补充偏好和行动风格。'
          : 'Boss 记忆仍为空，Agent 很难稳定以你的方式判断。',
      target: 'profiling',
      tone: input.bossMemoryCount > 0 ? 'accent' : 'warning',
    },
  ]

  const actionItems: DailyBriefItem[] = [
    {
      id: 'pending-archive',
      title: '今日入口',
      value: input.pendingArchiveCount > 0 ? input.pendingArchiveCount : '清爽',
      description:
        input.pendingArchiveCount > 0
          ? '先确认启蒙候选，避免长期记忆入口堆积。'
          : '启蒙入口没有明显堵塞，可以直接进入推演或执行。',
      target: 'memory',
      tone: input.pendingArchiveCount > 0 ? 'warning' : 'success',
    },
    {
      id: 'project-classification',
      title: '项目分类',
      value: unclassifiedProjects > 0 ? unclassifiedProjects : '完成',
      description:
        unclassifiedProjects > 0
          ? '还有项目没有分类，推演、突触和 Agent 编排会受影响。'
          : '项目分类已经能支撑下一轮推演和突触发现。',
      target: 'neurons',
      tone: unclassifiedProjects > 0 ? 'warning' : 'success',
    },
  ]

  const gapItems: DailyBriefItem[] = []
  if (input.executionSummary.total === 0) {
    gapItems.push({
      id: 'missing-execution-receipts',
      title: '缺执行收据',
      value: '待启动',
      description: '还没有 Agent/Cron/工具执行结果，系统无法复盘真实行动。',
      target: 'teams',
      tone: 'warning',
    })
  } else if (input.executionSummary.evidenceCoverage < 70) {
    gapItems.push({
      id: 'weak-evidence',
      title: '证据覆盖不足',
      value: `${input.executionSummary.evidenceCoverage}%`,
      description: '执行结果需要挂到知识、记忆、项目或排程来源后再扩大复用。',
      target: 'knowledge',
      tone: 'warning',
    })
  }
  if (input.projectCount === 0) {
    gapItems.push({
      id: 'missing-projects',
      title: '缺项目神经元',
      value: '0',
      description: '没有项目节点，推演室和突触网络都缺少现实抓手。',
      target: 'neurons',
      tone: 'warning',
    })
  }
  if (input.bossMemoryCount === 0) {
    gapItems.push({
      id: 'missing-boss-memory',
      title: '缺 Boss 记忆',
      value: '0',
      description: '先同步 Boss 或归档启蒙，让 Agent 有可复用的判断背景。',
      target: 'profiling',
      tone: 'warning',
    })
  }
  if (gapItems.length === 0) {
    gapItems.push(fallbackItem('control', '暂无硬缺口', '入口、画像、证据和执行层都有基本信号，可以推进高价值行动。'))
  }

  const agentItems: DailyBriefItem[] = [
    {
      id: 'execution-review',
      title: '执行复盘',
      value: input.executionSummary.retryRecommended > 0 ? input.executionSummary.retryRecommended : recentExecutions,
      description:
        input.executionSummary.retryRecommended > 0
          ? '优先处理需要重试的执行记录，再让结果沉淀。'
          : recentExecutions > 0
            ? '已有近期执行，可继续观察是否推动项目状态变化。'
            : '安排一次 Agent 或 Cron 任务，生成可评分执行收据。',
      target: input.executionSummary.retryRecommended > 0 ? 'control' : 'teams',
      tone: input.executionSummary.retryRecommended > 0 ? 'warning' : 'accent',
    },
    {
      id: 'synapse-agent',
      title: '组合创新',
      value: input.highSignalSynapseCount,
      description:
        input.highSignalSynapseCount > 0
          ? '让群策 Agent 围绕高强突触生成可执行组合方案。'
          : '先扫描项目突触，找到能复用、协作或组合创新的节点。',
      target: input.highSignalSynapseCount > 0 ? 'teams' : 'synapses',
      tone: input.highSignalSynapseCount > 0 ? 'success' : 'accent',
    },
  ]

  return {
    dateLabel: dateLabel(now),
    readinessScore,
    headline: buildHeadline(readinessScore),
    focus: buildFocus(input),
    sections: [
      {
        id: 'deposits',
        eyebrow: '昨日',
        title: '昨日沉淀',
        target: 'memory',
        tone: 'success',
        items: depositItems,
      },
      { id: 'actions', eyebrow: '今日', title: '今日行动', target: 'warroom', tone: 'accent', items: actionItems },
      {
        id: 'gaps',
        eyebrow: '缺口',
        title: '系统缺口',
        target: 'control',
        tone: 'warning',
        items: gapItems.slice(0, 3),
      },
      { id: 'agents', eyebrow: '智能体', title: 'Agent 建议', target: 'teams', tone: 'accent', items: agentItems },
    ],
  }
}
