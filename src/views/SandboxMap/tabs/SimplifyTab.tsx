import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import type { OperatingEventRow } from '../../../lib/db/repository'
import { dbListOperatingEvents, dbSaveOperatingEvent } from '../../../lib/db/repository'
import { recordOpenbasakaOperation } from '../../../lib/openbasaka/operation-history'
import {
  listOpenbasakaRuns,
  planSimplifyMissionRoute,
  startSimplifyMission,
  subscribeOpenbasakaRuns,
  type SimplifyExecutableNodeId,
  type SimplifyMissionRouteMode,
  type SimplifyMissionCapabilityMap,
  type SimplifyMissionDeliverable,
  type OpenbasakaRunStep,
  type OpenbasakaRunWithSteps,
} from '../../../lib/openbasaka/background-runs'
import {
  buildSimplifyWorkflowMap,
  getSimplifyEnvironment,
  loadSimplifyEnvironment,
  resolveSimplifyManualLocation,
  type SimplifyEnvironment,
  type SimplifyEnvironmentLocation,
  type SimplifyWeatherCondition,
  type SimplifyCoreNode,
  type SimplifyNodeId,
} from '../../../lib/simplify'
import { listWorkflowCatalog } from '../../../lib/workflow/registry'
import type { SandboxTabId } from '../navigation'
import './SimplifyTab.css'

interface SimplifyTabProps {
  operatingEvents: OperatingEventRow[]
  projectCount: number
  synapseCount: number
  bossMemoryCount: number
  pendingArchiveCount: number
  onNavigate: (tab: SandboxTabId) => void
}

type CanvasNodeId = Extract<
  SimplifyNodeId,
  'boss' | 'memory' | 'knowledge' | 'workflow' | 'teams' | 'scheduler' | 'audit' | 'xiaobai' | 'control'
>
type ExpertRouteNodeId = Extract<SimplifyExecutableNodeId, 'knowledge' | 'workflow' | 'teams' | 'scheduler' | 'xiaobai'>

const CANVAS_NODE_IDS: CanvasNodeId[] = [
  'boss',
  'memory',
  'knowledge',
  'workflow',
  'teams',
  'scheduler',
  'audit',
  'xiaobai',
  'control',
]
const CANVAS_NODE_POSITIONS: Record<CanvasNodeId, { x: number; y: number }> = {
  boss: { x: 50, y: 12 },
  memory: { x: 22, y: 24 },
  knowledge: { x: 78, y: 24 },
  teams: { x: 20, y: 46 },
  workflow: { x: 50, y: 46 },
  scheduler: { x: 82, y: 46 },
  audit: { x: 22, y: 68 },
  xiaobai: { x: 50, y: 75 },
  control: { x: 78, y: 68 },
}

const CANVAS_LINKS: Array<{ source: CanvasNodeId; target: CanvasNodeId }> = [
  { source: 'boss', target: 'workflow' },
  { source: 'memory', target: 'workflow' },
  { source: 'teams', target: 'workflow' },
  { source: 'audit', target: 'workflow' },
  { source: 'workflow', target: 'knowledge' },
  { source: 'workflow', target: 'scheduler' },
  { source: 'workflow', target: 'xiaobai' },
  { source: 'workflow', target: 'control' },
]

const NODE_RUN_COPY: Record<CanvasNodeId, { title: string; detail: string; shortTitle: string }> = {
  boss: {
    title: '读懂你的话',
    shortTitle: '读懂',
    detail: '先弄清楚你真正想要什么。',
  },
  knowledge: {
    title: '找资料',
    shortTitle: '资料',
    detail: '需要证据时才去找资料。',
  },
  teams: {
    title: '大家一起想',
    shortTitle: '群策',
    detail: '复杂问题先一起定方案。',
  },
  workflow: {
    title: '排步骤',
    shortTitle: '步骤',
    detail: '把事情拆成可执行顺序。',
  },
  scheduler: {
    title: '设提醒',
    shortTitle: '提醒',
    detail: '需要长期跟进时再安排。',
  },
  audit: {
    title: '检查一遍',
    shortTitle: '检查',
    detail: '确认没有乱承诺。',
  },
  memory: {
    title: '记下来',
    shortTitle: '记忆',
    detail: '把有用经验留给下次。',
  },
  xiaobai: {
    title: '讲人话',
    shortTitle: '小白',
    detail: '把下一步说得简单清楚。',
  },
  control: {
    title: '准备工具',
    shortTitle: '工具',
    detail: '先确认能安全开工。',
  },
}

const NODE_MODULE_LABELS: Record<CanvasNodeId, string> = {
  boss: 'Boss',
  memory: '记忆宫殿',
  knowledge: '知识＋大佬',
  workflow: '工作流',
  teams: '群策',
  scheduler: '定时',
  audit: '系统自省',
  xiaobai: '小白',
  control: '控制',
}

const EXPERT_MODULES: Array<{
  id: ExpertRouteNodeId
  moduleName: string
  summary: string
  abilities: string[]
}> = [
  {
    id: 'knowledge',
    moduleName: '知识＋大佬',
    summary: '找来源，核证据。',
    abilities: ['找资料', '来源核对', '证据整理'],
  },
  {
    id: 'teams',
    moduleName: '群策',
    summary: '多人一起定方案。',
    abilities: ['群策定方案', '多角色评审', '反方审视'],
  },
  {
    id: 'workflow',
    moduleName: '工作流',
    summary: '把事排成步骤。',
    abilities: ['排步骤', '项目落点', '验证路径'],
  },
  {
    id: 'scheduler',
    moduleName: '定时',
    summary: '只在需要长期跟进时启用。',
    abilities: ['设提醒', '周期检查', '运行记录'],
  },
  {
    id: 'xiaobai',
    moduleName: '小白',
    summary: '把复杂事讲清楚。',
    abilities: ['小白解释', '小白智囊团', '小白评审', '小白执行翻译', '小白新手引导'],
  },
]

const DEFAULT_MANUAL_CAPABILITIES: SimplifyMissionCapabilityMap = {
  teams: ['群策定方案', '反方审视'],
  workflow: ['排步骤', '验证路径'],
}

const POSSIBILITY_LOOP_LABELS: Record<string, string> = {
  opportunity: '找机会',
  response: '回应需求',
  anti_echo: '反茧房',
}

const NODE_ICONS: Record<CanvasNodeId, string> = {
  boss: 'user',
  memory: 'bank',
  knowledge: 'cap',
  teams: 'users',
  workflow: 'flow',
  scheduler: 'clock',
  audit: 'pulse',
  xiaobai: 'smile',
  control: 'sliders',
}

const DEFAULT_WEATHER_CONDITION: SimplifyWeatherCondition = 'clear'
const MANUAL_ENVIRONMENT_LOCATION_KEY = 'openbasaka:simplify:manual-location'
const AUTHORIZED_ENVIRONMENT_LOCATION_KEY = 'openbasaka:simplify:authorized-location'

function asSandboxTabId(value: string): SandboxTabId {
  return value as SandboxTabId
}

function submitIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 19V5" />
      <path d="M6.5 10.5 12 5l5.5 5.5" />
    </svg>
  )
}

function ambientIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 9 5 6 5-6" />
    </svg>
  )
}

function nodeIcon(kind: string) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {kind === 'user' && (
        <>
          <circle cx="12" cy="8" r="3" />
          <path d="M6.5 19a5.5 5.5 0 0 1 11 0" />
        </>
      )}
      {kind === 'bank' && (
        <>
          <path d="M4 9h16L12 4 4 9z" />
          <path d="M6 10v7" />
          <path d="M10 10v7" />
          <path d="M14 10v7" />
          <path d="M18 10v7" />
          <path d="M4 19h16" />
        </>
      )}
      {kind === 'cap' && (
        <>
          <path d="m3.5 9 8.5-4 8.5 4-8.5 4-8.5-4z" />
          <path d="M7 11.5v4c2.8 1.7 7.2 1.7 10 0v-4" />
        </>
      )}
      {kind === 'users' && (
        <>
          <circle cx="9" cy="9" r="2.5" />
          <circle cx="16" cy="10" r="2" />
          <path d="M4.5 18a4.6 4.6 0 0 1 9 0" />
          <path d="M14 18a3.7 3.7 0 0 1 5.5-2.8" />
        </>
      )}
      {kind === 'flow' && (
        <>
          <circle cx="12" cy="5" r="2" />
          <circle cx="6" cy="18" r="2" />
          <circle cx="18" cy="18" r="2" />
          <path d="M12 7v4" />
          <path d="M12 11H6v5" />
          <path d="M12 11h6v5" />
        </>
      )}
      {kind === 'clock' && (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7.5V12l3 2" />
        </>
      )}
      {kind === 'pulse' && (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M6.5 12h3l1.5-3.5 2.2 7 1.3-3.5h3" />
        </>
      )}
      {kind === 'smile' && (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M9 10h.01" />
          <path d="M15 10h.01" />
          <path d="M8.8 14.2c1.8 1.8 4.6 1.8 6.4 0" />
        </>
      )}
      {kind === 'sliders' && (
        <>
          <path d="M5 7h14" />
          <path d="M5 17h14" />
          <circle cx="9" cy="7" r="2" />
          <circle cx="15" cy="17" r="2" />
        </>
      )}
    </svg>
  )
}

function sparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5 13.7 9l5.3 2-5.3 2L12 18.5 10.3 13 5 11l5.3-2L12 3.5z" />
      <path d="M19 3v4" />
      <path d="M17 5h4" />
    </svg>
  )
}

function formatTime(value: string | undefined): string {
  if (!value) return '等待信号'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '等待信号'
  const pad = (input: number) => String(input).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function curvePath(source: CanvasNodeId, target: CanvasNodeId): string {
  const from = CANVAS_NODE_POSITIONS[source]
  const to = CANVAS_NODE_POSITIONS[target]
  const midX = (from.x + to.x) / 2
  return `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`
}

function runStatusClass(status: OpenbasakaRunStep['status'] | undefined, fallbackActive: boolean): string {
  if (status === 'queued') return 'queued'
  if (status === 'running') return 'running'
  if (status === 'completed') return 'completed'
  if (fallbackActive) return 'online'
  if (status === 'blocked') return 'blocked'
  if (status === 'failed') return 'failed'
  return 'offline'
}

function cleanUserFacingCopy(value: string): string {
  return value
    .replace(/\bmission\b/gi, '任务')
    .replace(/Openbasaka/g, '小白')
    .replace(/synthesis/gi, '整理')
    .replace(/metadata/gi, '记录')
    .replace(/高风险动作/g, '需确认动作')
    .replace(/高风险/g, '需确认')
    .replace(/中风险/g, '需留意')
    .replace(/低风险/g, '可自动处理')
    .replace(/风险/g, '边界')
    .replace(/\bblocked\b/g, '待确认')
}

function compactDisplayText(value: string, maxLength = 42): string {
  const clean = cleanUserFacingCopy(value).replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, maxLength - 1)}…`
}

function routeSummaryCopy(routePreview: ReturnType<typeof planSimplifyMissionRoute>): { title: string; detail: string } {
  const middleCount = Math.max(0, routePreview.route.length - 4)
  if (routePreview.mode === 'manual') {
    return {
      title: '按你选的跑',
      detail: `本轮只走 ${middleCount || 1} 个重点模块。`,
    }
  }
  return {
    title: routePreview.plannerNodeId === 'teams' ? '先定方案' : '先理清楚',
    detail: `我会自动选择，没必要的先不打扰。`,
  }
}

function runHeadline(run: OpenbasakaRunWithSteps | null): { tone: string; label: string; headline: string; detail: string } {
  if (!run) {
    return {
      tone: 'idle',
      label: '未开始',
      headline: '等你一句话',
      detail: '写下新任务，我会只跑需要的步骤。',
    }
  }
  if (run.status === 'completed') {
    return {
      tone: 'completed',
      label: '已完成',
      headline: '本轮完成',
      detail: compactDisplayText(run.resultPreview || '本轮已完成，结果已记下。', 86),
    }
  }
  if (run.status === 'running') {
    return {
      tone: 'running',
      label: '运行中',
      headline: '正在处理',
      detail: compactDisplayText(run.resultPreview || '小白正在处理本轮任务。', 86),
    }
  }
  if (run.status === 'queued') {
    return {
      tone: 'queued',
      label: '等待',
      headline: '已排队',
      detail: compactDisplayText(run.resultPreview || '任务已经排好，等前一步完成。', 86),
    }
  }
  if (run.status === 'blocked') {
    return {
      tone: 'blocked',
      label: '待确认',
      headline: '等你点头',
      detail: compactDisplayText(run.resultPreview || run.error || '有一步需要你确认。', 86),
    }
  }
  return {
    tone: 'failed',
    label: '异常',
    headline: '本轮停住',
    detail: compactDisplayText(run.error || run.resultPreview || '请看异常后重跑。', 86),
  }
}

function bestStepOutput(step?: OpenbasakaRunStep): string {
  if (!step) return ''
  const progressDetail = typeof step.metadata?.progressDetail === 'string' ? step.metadata.progressDetail : ''
  return cleanUserFacingCopy(progressDetail || step.outputPreview || step.detail)
}

function bestOutcomeText(run: OpenbasakaRunWithSteps | null): string {
  if (!run) return '新任务会显示在这里。'
  const memoryStep = run.steps.find((step) => step.nodeId === 'memory' && step.status === 'completed')
  const latestCompleted = run.steps.slice().reverse().find((step) => step.status === 'completed')
  const detail = bestStepOutput(memoryStep || latestCompleted)
  return compactDisplayText(detail || run.resultPreview || run.bossDemand, 120)
}

function runTimeValue(value: string | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function newestRun(runs: OpenbasakaRunWithSteps[]): OpenbasakaRunWithSteps | null {
  return (
    runs
      .slice()
      .sort(
        (a, b) =>
          runTimeValue(b.createdAt || b.updatedAt) - runTimeValue(a.createdAt || a.updatedAt) ||
          runTimeValue(b.updatedAt) - runTimeValue(a.updatedAt),
      )[0] || null
  )
}

function metadataString(step: OpenbasakaRunStep | undefined, key: string): string {
  const value = step?.metadata?.[key]
  return typeof value === 'string' ? value : ''
}

function metadataStringArray(step: OpenbasakaRunStep | undefined, key: string): string[] {
  const value = step?.metadata?.[key]
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : []
}

function routeReasonPills(value: string): string[] {
  return value
    .split('；')
    .map((item) => compactDisplayText(item.replace(/^自动选择：/, ''), 20))
    .filter(Boolean)
    .slice(0, 4)
}

function isDeliverable(value: unknown): value is SimplifyMissionDeliverable {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<SimplifyMissionDeliverable>
  return Boolean(item.title && item.summary && item.statusLabel)
}

function readRunDeliverable(run: OpenbasakaRunWithSteps | null): SimplifyMissionDeliverable | null {
  if (!run) return null
  const candidates = run.steps
    .slice()
    .reverse()
    .map((step) => step.metadata?.deliverable)
  const match = candidates.find(isDeliverable)
  return match || null
}

function demandKindForFallback(demand: string): SimplifyMissionDeliverable['kind'] {
  if (/斗地主|Dou\s*Dizhu|Landlord|扑克牌|牌局|叫地主|抢地主|星际|虫洞|黑洞|interstellar|wormhole/i.test(demand)) return 'app'
  if (/iOS|SwiftUI|Xcode|App\b|应用|客户端|手机软件|小程序/i.test(demand)) return 'app'
  if (/PRD|产品需求|需求文档|产品文档|原型说明/i.test(demand)) return 'prd'
  if (/知识|资料|来源|证据|引用|调研|研究|视频|字幕|PDF|网页|notebook|wiki/i.test(demand)) return 'knowledge'
  if (/每天|每周|每月|定时|周期|自动化|自动推送|自动检查|提醒|复盘|夜巡|cron|schedule/i.test(demand)) return 'automation'
  return 'plan'
}

function demandPlatformForFallback(demand: string): SimplifyMissionDeliverable['platform'] {
  if (/斗地主|Dou\s*Dizhu|Landlord|macOS|Mac\s*版|Mac版本|Mac\s*App|桌面端|桌面版|电脑端|独立\s*Mac/i.test(demand) && !/iOS|iPhone|手机|小程序/i.test(demand)) {
    return 'macos'
  }
  return 'ios'
}

function fallbackRunDeliverable(run: OpenbasakaRunWithSteps | null): SimplifyMissionDeliverable | null {
  if (!run || (run.status !== 'failed' && run.status !== 'blocked')) return null
  const kind = demandKindForFallback(run.bossDemand)
  const platform = kind === 'app' ? demandPlatformForFallback(run.bossDemand) : undefined
  const reason = compactDisplayText(run.error || run.resultPreview || '本轮没有完成。', 90)
  const base = `openbasaka_runs/${run.id}`
  const projectLocation =
    kind === 'app'
      ? `/Users/apple/Desktop/【项目的游戏】/deliveries/${run.id}/${platform === 'macos' ? 'macos-app' : 'ios-app'}`
      : kind === 'automation'
        ? '定时 / 运行记录'
        : kind === 'knowledge'
          ? '知识＋大佬 / 记忆宫殿'
          : '化繁为简本轮记录'
  return {
    kind,
    platform,
    title: kind === 'app' ? `App 落地路径｜${compactDisplayText(run.bossDemand, 28)}` : `本轮未完成｜${compactDisplayText(run.bossDemand, 28)}`,
    summary: `本轮停在：${reason}`,
    artifactLocation: `${base}#failure`,
    projectLocation,
    fileEntrypoints:
      kind === 'app' && platform === 'macos'
        ? ['Package.swift', 'script/build_and_run.sh', 'Sources/.../ContentView.swift']
        : kind === 'app'
          ? ['README.md', 'App.swift', 'ContentView.swift']
          : ['失败原因', '已完成步骤', '下一步'],
    runCommand:
      kind === 'app'
        ? platform === 'macos'
          ? `待修复本轮失败后：bash ${projectLocation}/script/build_and_run.sh --verify。`
          : `待修复本轮失败后：open ${projectLocation} 或运行 xcodebuild 验证。`
        : '先修复失败步骤，再继续本轮路线。',
    verification:
      kind === 'app'
        ? platform === 'macos'
          ? '没有创建代码，也没有运行 macOS App；当前只确认了可落地路径和失败原因。'
          : '没有创建代码，也没有运行 Xcode；当前只确认了可落地路径和失败原因。'
        : '本轮没有完成，不能当作已交付。',
    statusLabel: run.status === 'blocked' ? '待确认' : '未完成',
    nextStep: run.status === 'blocked' ? '先处理确认边界，再继续执行。' : '先修复失败模块，再继续执行后续步骤。',
    evidenceRefs: [run.id, ...run.steps.filter((step) => step.status === 'failed' || step.status === 'blocked').map((step) => step.id)].slice(0, 5),
  }
}

function deliveryRows(deliverable: SimplifyMissionDeliverable): Array<{ label: string; value: string; wide?: boolean }> {
  const moduleSummary = deliverable.moduleArtifacts
    ?.map((artifact) => `${artifact.label}：${artifact.status}`)
    .join(' / ') || ''
  return [
    { label: '产物', value: deliverable.statusLabel },
    { label: '平台', value: deliverable.platform === 'macos' ? 'macOS SwiftUI' : deliverable.platform === 'ios' ? 'iOS SwiftUI' : '' },
    { label: '位置', value: deliverable.projectLocation || deliverable.artifactLocation },
    { label: '入口', value: deliverable.fileEntrypoints.slice(0, 3).join(' / ') || '本轮记录' },
    { label: '模块', value: moduleSummary, wide: true },
    { label: '文件', value: deliverable.createdFiles?.slice(0, 4).join(' / ') || '' },
    { label: '运行', value: deliverable.runCommand, wide: true },
    { label: '验证命令', value: deliverable.verificationCommand || '', wide: true },
    { label: '验证', value: deliverable.verification, wide: true },
    { label: '下一步', value: deliverable.nextStep, wide: true },
  ].filter((item) => item.value)
}

function nextStepLabel(runSteps: OpenbasakaRunStep[], step?: OpenbasakaRunStep): string {
  if (!step) return '等本轮需要时再接入'
  const next = runSteps.find((item) => item.orderIndex === step.orderIndex + 1)
  if (next) return `交给${next.title}`
  if (step.status === 'completed') return '进入本轮结果'
  return '等当前步骤完成'
}

function nodeTooltipRows(params: {
  nodeId: CanvasNodeId
  step?: OpenbasakaRunStep
  skipped?: boolean
  hint: string
  runSteps: OpenbasakaRunStep[]
  routeRationale: string
}): Array<{ label: string; value: string }> {
  const { nodeId, step, skipped, hint, runSteps, routeRationale } = params
  const capabilityLabels = metadataStringArray(step, 'capabilityLabels')
  const why = skipped
    ? '本轮不需要它'
    : metadataString(step, 'routeRationale') || routeRationale || NODE_RUN_COPY[nodeId].detail
  return [
    { label: '属于', value: NODE_MODULE_LABELS[nodeId] },
    { label: '当前', value: hint },
    { label: '为什么', value: capabilityLabels.length ? capabilityLabels.join('、') : why },
    { label: '产出', value: bestStepOutput(step) || NODE_RUN_COPY[nodeId].detail },
    { label: '下一步', value: nextStepLabel(runSteps, step) },
  ].map((item) => ({ ...item, value: compactDisplayText(item.value, 34) }))
}

function nodeHintText(params: {
  step?: OpenbasakaRunStep
  activeRun?: OpenbasakaRunWithSteps | null
  skipped?: boolean
  fallbackActive?: boolean
}): string {
  const { step, activeRun, skipped, fallbackActive } = params
  if (step?.status === 'running') return '正在做'
  if (step?.status === 'queued') return '等前一步'
  if (step?.status === 'completed') return '已完成'
  if (step?.status === 'blocked') return '等你确认'
  if (step?.status === 'failed') return '需修复'
  if (skipped) return '这次不用'
  if (!activeRun && fallbackActive) return '可能会用'
  return '先不用'
}

function weatherLabel(condition: SimplifyWeatherCondition): string {
  const labels: Record<SimplifyWeatherCondition, string> = {
    clear: '晴朗',
    cloudy: '云层',
    rain: '雨意',
    fog: '薄雾',
    snow: '雪光',
    storm: '风暴',
  }
  return labels[condition]
}

function ambientLabel(ambient: SimplifyEnvironment['timeOfDay']): string {
  const labels: Record<SimplifyEnvironment['timeOfDay'], string> = {
    dawn: '晨光',
    day: '日光',
    dusk: '黄昏',
    night: '星夜',
  }
  return labels[ambient]
}

function sourceLabel(source: SimplifyEnvironment['source']): string {
  if (source === 'manual-location') return '手动地区'
  if (source === 'authorized-location') return '授权定位'
  if (source === 'fallback') return '默认环境'
  return '系统时区'
}

function readEnvironmentLocation(key: string): SimplifyEnvironmentLocation | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SimplifyEnvironmentLocation
    if (typeof parsed.latitude !== 'number' || typeof parsed.longitude !== 'number' || !parsed.label) return null
    return parsed
  } catch {
    return null
  }
}

function writeEnvironmentLocation(location: SimplifyEnvironmentLocation): void {
  if (typeof window === 'undefined') return
  const key =
    location.source === 'manual-location' ? MANUAL_ENVIRONMENT_LOCATION_KEY : AUTHORIZED_ENVIRONMENT_LOCATION_KEY
  window.localStorage.setItem(key, JSON.stringify(location))
}

function getPreferredEnvironmentLocation(): SimplifyEnvironmentLocation | null {
  return readEnvironmentLocation(MANUAL_ENVIRONMENT_LOCATION_KEY) || readEnvironmentLocation(AUTHORIZED_ENVIRONMENT_LOCATION_KEY)
}

function getBrowserLocation(): Promise<SimplifyEnvironmentLocation> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('geolocation_unavailable'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: '当前位置',
          source: 'authorized-location',
        })
      },
      (error) => reject(error),
      { enableHighAccuracy: false, maximumAge: 30 * 60 * 1000, timeout: 8000 },
    )
  })
}

export default function SimplifyTab({
  operatingEvents,
  projectCount,
  synapseCount,
  bossMemoryCount,
  pendingArchiveCount,
  onNavigate,
}: SimplifyTabProps) {
  const [text, setText] = useState('')
  const [currentDemand, setCurrentDemand] = useState('')
  const [localEvents, setLocalEvents] = useState<OperatingEventRow[]>([])
  const [workflowCount, setWorkflowCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [runs, setRuns] = useState<OpenbasakaRunWithSteps[]>([])
  const [focusedRunId, setFocusedRunId] = useState('')
  const [canvasScale, setCanvasScale] = useState(1)
  const [routeMode, setRouteMode] = useState<SimplifyMissionRouteMode>('auto')
  const [manualRouteNodeIds, setManualRouteNodeIds] = useState<ExpertRouteNodeId[]>(['teams', 'workflow'])
  const [manualCapabilityIds, setManualCapabilityIds] = useState<SimplifyMissionCapabilityMap>(DEFAULT_MANUAL_CAPABILITIES)
  const [environment, setEnvironment] = useState<SimplifyEnvironment>(() => getSimplifyEnvironment())
  const [environmentLoading, setEnvironmentLoading] = useState(false)
  const [cityText, setCityText] = useState('')
  const [ambientPinned, setAmbientPinned] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    setLocalEvents(operatingEvents)
  }, [operatingEvents])

  useEffect(() => {
    let cancelled = false
    listWorkflowCatalog()
      .then((items) => {
        if (!cancelled) setWorkflowCount(items.length)
      })
      .catch(() => {
        if (!cancelled) setWorkflowCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function refreshEnvironment(location = getPreferredEnvironmentLocation()) {
      const next = await loadSimplifyEnvironment({ location }).catch(() => getSimplifyEnvironment())
      if (!cancelled) setEnvironment(next)
    }
    refreshEnvironment()
    const timer = window.setInterval(() => refreshEnvironment(), 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const unsubscribe = subscribeOpenbasakaRuns((items) => {
      if (!cancelled) setRuns(items.filter((item) => item.moduleId === 'simplify'))
    })
    listOpenbasakaRuns().then((items) => {
      if (!cancelled) setRuns(items.filter((item) => item.moduleId === 'simplify'))
    }).catch(() => undefined)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const activeRun = useMemo(() => {
    const focusedRun = focusedRunId ? runs.find((run) => run.id === focusedRunId) : undefined
    if (focusedRun) return focusedRun
    return newestRun(runs)
  }, [focusedRunId, runs])

  const activeDemand = activeRun?.bossDemand || currentDemand
  const routeSeedDemand = text.trim() || activeDemand || '帮我把复杂任务拆成可执行路径'
  const routePreview = useMemo(
    () =>
      planSimplifyMissionRoute(
        routeSeedDemand,
        routeMode === 'manual'
          ? { routeMode: 'manual', manualNodeIds: manualRouteNodeIds }
          : { routeMode: 'auto' },
      ),
    [manualRouteNodeIds, routeMode, routeSeedDemand],
  )
  const plannedCanvasNodeIds = routePreview.route.filter((nodeId): nodeId is CanvasNodeId =>
    CANVAS_NODE_IDS.includes(nodeId as CanvasNodeId),
  )

  const workflowMap = useMemo(
    () =>
      buildSimplifyWorkflowMap({
        operatingEvents: localEvents.length > 0 ? localEvents : operatingEvents,
        windowDays: 30,
        currentDemand: activeDemand,
        projectCount,
        synapseCount,
        bossMemoryCount,
        pendingArchiveCount,
        workflowCount,
      }),
    [
      bossMemoryCount,
      activeDemand,
      localEvents,
      operatingEvents,
      pendingArchiveCount,
      projectCount,
      synapseCount,
      workflowCount,
    ],
  )

  const canvasNodes = useMemo(() => {
    const byId = new Map(workflowMap.nodes.map((node) => [node.id, node]))
    return CANVAS_NODE_IDS.map((nodeId) => byId.get(nodeId)).filter((node): node is SimplifyCoreNode => Boolean(node))
  }, [workflowMap.nodes])

  const runSteps = activeRun?.steps || []
  const runningStep = runSteps.find((step) => step.status === 'running')
  const activeRunHeadline = runHeadline(activeRun)
  const outcomeText = bestOutcomeText(activeRun)
  const deliverable = readRunDeliverable(activeRun)
  const visibleDeliverable = deliverable || fallbackRunDeliverable(activeRun)
  const routeSummary = routeSummaryCopy(routePreview)
  const routeReasons = routeReasonPills(routePreview.rationale)
  const possibilityLoop = workflowMap.insights.map((insight) => ({
    id: insight.id,
    label: POSSIBILITY_LOOP_LABELS[insight.kind] || insight.title,
    summary: compactDisplayText(insight.summary, 36),
    targetTab: insight.targetTab,
  }))
  const foldedRunCount = activeRun ? Math.max(0, runs.filter((run) => run.id !== activeRun.id).length) : runs.length
  const foldedRuns = activeRun ? runs.filter((run) => run.id !== activeRun.id).slice(0, 4) : runs.slice(0, 4)
  const visibleDemand = compactDisplayText(text.trim() || activeRun?.bossDemand || currentDemand || '写一句就开始', 46)
  const doneNodeIds = new Set(runSteps.filter((step) => step.status === 'completed').map((step) => step.nodeId as CanvasNodeId))
  const runNodeIds = new Set(runSteps.map((step) => step.nodeId as CanvasNodeId))
  const activeNodeIds = new Set([
    ...doneNodeIds,
    ...(runningStep ? [runningStep.nodeId as CanvasNodeId] : []),
    ...(activeRun && runSteps.length > 0 ? [] : plannedCanvasNodeIds),
  ])

  function missionRouteOptions() {
    return routeMode === 'manual'
      ? { routeMode: 'manual' as const, manualNodeIds: manualRouteNodeIds, manualCapabilityIds }
      : { routeMode: 'auto' as const }
  }

  function toggleManualRouteNode(nodeId: ExpertRouteNodeId) {
    setManualRouteNodeIds((current) => {
      if (current.includes(nodeId)) return current.filter((item) => item !== nodeId)
      return [...current, nodeId]
    })
  }

  function toggleManualCapability(nodeId: ExpertRouteNodeId, label: string) {
    setManualCapabilityIds((current) => {
      const existing = current[nodeId] || []
      const nextLabels = existing.includes(label) ? existing.filter((item) => item !== label) : [...existing, label]
      return { ...current, [nodeId]: nextLabels }
    })
    setManualRouteNodeIds((current) => (current.includes(nodeId) ? current : [...current, nodeId]))
  }

  function moveManualRouteNode(nodeId: ExpertRouteNodeId, direction: -1 | 1) {
    setManualRouteNodeIds((current) => {
      const index = current.indexOf(nodeId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item)
      return next
    })
  }

  async function focusStartedRun(run: Awaited<ReturnType<typeof startSimplifyMission>>) {
    setFocusedRunId(run.id)
    setRuns((current) => [
      { ...run, steps: [] },
      ...current.filter((item) => item.id !== run.id),
    ])
    const refreshedRuns = await listOpenbasakaRuns().catch(() => [])
    const simplifyRuns = refreshedRuns.filter((item) => item.moduleId === 'simplify')
    if (simplifyRuns.length > 0) setRuns(simplifyRuns)
  }

  async function submitDemand(runImmediately = true) {
    const demand = text.trim()
    if (!demand || saving) return

    setSaving(true)
    setNotice('')
    const now = new Date().toISOString()
    try {
      await dbSaveOperatingEvent({
        id: `op_simplify_capture_${Date.now().toString(36)}`,
        type: 'input_event',
        stage: 'capture',
        inputKind: 'manual_note',
        title: '化繁为简｜Boss 新需求',
        contentPreview: demand,
        source: { kind: 'manual', sourceId: 'simplify', title: '化繁为简' },
        confidence: 0.9,
        entities: ['simplify', 'boss-demand', 'openbasaka'],
        createdAt: now,
      })
      await recordOpenbasakaOperation({
        moduleId: 'simplify',
        moduleName: '化繁为简',
        action: '启动一句话运行',
        summary: `已接收 Boss 新需求，并启动化繁为简运行画布：${demand}`,
        stage: 'understand',
        source: { kind: 'agent', sourceId: 'simplify', title: '化繁为简' },
        toolRefs: ['operating_events', 'simplify-workflow-map', 'simplify-run-canvas'],
        entities: ['simplify', 'workflow-map', 'current-demand'],
      })
      const refreshed = await dbListOperatingEvents(120).catch(() => [])
      if (refreshed.length > 0) setLocalEvents(refreshed)
      setCurrentDemand(demand)
      setText('')
      if (runImmediately) {
        const run = await startSimplifyMission(demand, missionRouteOptions())
        await focusStartedRun(run)
        setNotice('任务已接收，正在检查工具与执行路径。')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice(`启动失败：${message}`)
    } finally {
      setSaving(false)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    submitDemand(true)
  }

  function handleRunClick() {
    if (saving) return
    const demand = text.trim() || currentDemand
    if (text.trim()) {
      submitDemand(true)
      return
    }
    if (activeRun?.status === 'running') return
    if (!demand.trim()) {
      inputRef.current?.focus()
      return
    }
    startSimplifyMission(demand, missionRouteOptions())
      .then((run) => {
        focusStartedRun(run).catch(() => undefined)
        setNotice('本轮已继续，正在检查工具与执行路径。')
      })
      .catch((error) => setNotice(`启动失败：${error instanceof Error ? error.message : String(error)}`))
  }

  async function refreshEnvironmentWith(location: SimplifyEnvironmentLocation | null) {
    setEnvironmentLoading(true)
    try {
      const next = await loadSimplifyEnvironment({ location })
      setEnvironment(next)
      if (next.degraded) setNotice(next.message)
    } finally {
      setEnvironmentLoading(false)
    }
  }

  async function handleManualCitySync() {
    const city = cityText.trim()
    if (!city) return
    setEnvironmentLoading(true)
    try {
      const location = await resolveSimplifyManualLocation(city)
      if (!location) {
        setNotice('没有找到这个地区，先继续使用本地时间环境。')
        return
      }
      writeEnvironmentLocation(location)
      setCityText('')
      await refreshEnvironmentWith(location)
    } catch (error) {
      setNotice(`天气暂未同步：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setEnvironmentLoading(false)
    }
  }

  async function handleAuthorizedLocationSync() {
    setEnvironmentLoading(true)
    try {
      const location = await getBrowserLocation()
      writeEnvironmentLocation(location)
      await refreshEnvironmentWith(location)
    } catch {
      setNotice('没有获得定位授权，先继续使用本地时间环境。')
    } finally {
      setEnvironmentLoading(false)
    }
  }

  const progressTotal = runSteps.length || plannedCanvasNodeIds.length || (workflowMap.currentFlow?.recommendedNodeIds.length || 0) + 2
  const progressDone = runSteps.filter((step) => step.status === 'completed').length
  const progressPercent = Math.min(100, Math.round((progressDone / Math.max(progressTotal, 1)) * 100))
  const runNoteCopy = runningStep
    ? `${runningStep.title}：${runningStep.detail}`
    : activeRun && (activeRun.status === 'failed' || activeRun.status === 'blocked' || activeRun.status === 'completed')
      ? activeRunHeadline.detail
      : notice || workflowMap.headline

  return (
    <div
      className="simplify-frame"
      data-ambient={environment.timeOfDay}
      data-weather={environment.weatherCondition || DEFAULT_WEATHER_CONDITION}
      data-weather-source={environment.source}
      data-weather-degraded={environment.degraded ? 'true' : 'false'}
    >
      <div className="simplify-frame__body">
        <section className="simplify-intake" aria-label="化繁为简输入">
          <div className="simplify-intake__clouds" aria-hidden="true">
            <span className="simplify-intake__stars" />
            <span className="simplify-intake__weather simplify-intake__weather--rain" />
            <span className="simplify-intake__weather simplify-intake__weather--snow" />
            <span className="simplify-intake__weather simplify-intake__weather--mist" />
          </div>
          <form className="simplify-intake__center" onSubmit={handleSubmit}>
            <h1>化繁为简</h1>
            <div className="simplify-intake__composer">
              <span className="simplify-intake__spark">{sparkleIcon()}</span>
              <textarea
                ref={inputRef}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    submitDemand(true)
                  }
                }}
                placeholder="把复杂的事交给我"
                rows={1}
                autoFocus
              />
              <button type="submit" className="simplify-intake__submit" disabled={!text.trim() || saving}>
                {submitIcon()}
                <span className="sr-only">启动化繁为简</span>
              </button>
            </div>
            <div
              className="simplify-intake__ambient"
              data-pinned={ambientPinned ? 'true' : 'false'}
              aria-label="云图环境状态"
            >
              <button
                type="button"
                className="simplify-intake__ambient-trigger"
                aria-expanded={ambientPinned}
                onClick={() => setAmbientPinned((value) => !value)}
              >
                {ambientIcon()}
                <span className="sr-only">查看环境与本轮状态</span>
              </button>
              <div className="simplify-intake__ambient-popover" role="tooltip">
                <div className="simplify-intake__ambient-section">
                  <span>云图环境</span>
                  <strong>
                    {environment.locationLabel} · {ambientLabel(environment.timeOfDay)} · {weatherLabel(environment.weatherCondition)}
                    {environment.temperature !== null ? ` · ${Math.round(environment.temperature)}°C` : ''}
                  </strong>
                  <small>{environment.degraded ? '天气暂未同步，先按本地时间生成云图。' : environment.message}</small>
                </div>
                <div className="simplify-intake__ambient-actions">
                  <input
                    value={cityText}
                    onChange={(event) => setCityText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        handleManualCitySync()
                      }
                    }}
                    placeholder="城市"
                    aria-label="手动设置天气城市"
                  />
                  <button type="button" disabled={environmentLoading || !cityText.trim()} onClick={handleManualCitySync}>
                    城市天气
                  </button>
                  <button type="button" disabled={environmentLoading} onClick={handleAuthorizedLocationSync}>
                    定位天气
                  </button>
                </div>
                <div className="simplify-intake__ambient-section">
                  <span>{activeRun ? '本轮任务' : '待开始'}</span>
                  <strong>{visibleDemand}</strong>
                  <small>{activeRun ? activeRunHeadline.detail : '写一句，按下箭头，我会开始。'}</small>
                </div>
                {foldedRunCount > 0 ? <p className="simplify-intake__folded">旧任务已收起 {foldedRunCount} 条</p> : null}
              </div>
            </div>
          </form>
          <footer className="simplify-intake__footer">
            <span>Openbasaka Sandbox</span>
            <strong>化繁为简</strong>
            <span>{sourceLabel(environment.source)}</span>
          </footer>
        </section>

        <div className="simplify-frame__split-handle" aria-hidden="true">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </div>

        <section className="simplify-canvas" aria-label="化繁为简工作流画布">
          <div className="simplify-canvas__topbar">
            <div className="simplify-canvas__crumb">
              <span aria-hidden="true" />
              <strong>化繁为简</strong>
              <em>·</em>
              <strong>工作流画布</strong>
            </div>
            <div className={`simplify-canvas__mission-status simplify-canvas__mission-status--${activeRunHeadline.tone}`}>
              <span>{activeRunHeadline.label}</span>
              <strong>{activeRunHeadline.headline}</strong>
              <em>{activeRun ? visibleDemand : '新任务优先显示'}</em>
              <i style={{ '--simplify-progress': `${progressPercent}%` } as CSSProperties} />
            </div>
            <button type="button" className="simplify-canvas__back" onClick={() => onNavigate('overview')}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
              返回沙盘
            </button>
          </div>

          <div className="simplify-canvas__route-panel">
            <div className="simplify-canvas__route-head">
              <div>
                <span>怎么跑</span>
                <strong>{routeMode === 'auto' ? '自动选择' : '你来排序'}</strong>
              </div>
              <div className="simplify-canvas__mode-switch" role="tablist" aria-label="工作流运行模式">
                <button
                  type="button"
                  role="tab"
                  aria-selected={routeMode === 'auto'}
                  className={routeMode === 'auto' ? 'simplify-canvas__mode-btn simplify-canvas__mode-btn--active' : 'simplify-canvas__mode-btn'}
                  onClick={() => setRouteMode('auto')}
                >
                  自动
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={routeMode === 'manual'}
                  className={routeMode === 'manual' ? 'simplify-canvas__mode-btn simplify-canvas__mode-btn--active' : 'simplify-canvas__mode-btn'}
                  onClick={() => setRouteMode('manual')}
                >
                  自选
                </button>
              </div>
            </div>

            <div className="simplify-canvas__route-summary">
              <span>{routeSummary.title}</span>
              <small>{routeSummary.detail}</small>
              <div className="simplify-canvas__route-reasons" aria-label="自动选择原因">
                {routeReasons.map((reason, index) => (
                  <em key={`${reason}-${index}`}>{reason}</em>
                ))}
              </div>
            </div>

            <div className="simplify-canvas__possibility" aria-label="无中生有闭环">
              <div>
                <span>无中生有</span>
                <strong>机会 · 需求 · 反茧房</strong>
              </div>
              <div>
                {possibilityLoop.map((item) => (
                  <button key={item.id} type="button" onClick={() => onNavigate(asSandboxTabId(item.targetTab))}>
                    <strong>{item.label}</strong>
                    <small>{item.summary}</small>
                  </button>
                ))}
              </div>
            </div>

            {routeMode === 'manual' && (
              <div className="simplify-canvas__expert">
                <div className="simplify-canvas__module-picker" aria-label="专家模式模块选择">
                  {EXPERT_MODULES.map((module) => {
                    const activeIndex = manualRouteNodeIds.indexOf(module.id)
                    const selectedCapabilities = manualCapabilityIds[module.id] || []
                    return (
                      <div
                        key={module.id}
                        className={
                          activeIndex >= 0
                            ? 'simplify-canvas__module-card simplify-canvas__module-card--active'
                            : 'simplify-canvas__module-card'
                        }
                      >
                        <button
                          type="button"
                          aria-pressed={activeIndex >= 0}
                          className="simplify-canvas__module-chip"
                          onClick={() => toggleManualRouteNode(module.id)}
                        >
                          <span>{activeIndex >= 0 ? activeIndex + 1 : '+'}</span>
                          <strong>{module.moduleName}</strong>
                          <small>{module.summary}</small>
                        </button>
                        <div className="simplify-canvas__capabilities" aria-label={`${module.moduleName}子能力`}>
                          {module.abilities.map((ability) => {
                            const selected = selectedCapabilities.includes(ability)
                            return (
                              <button
                                key={ability}
                                type="button"
                                aria-pressed={selected}
                                className={
                                  selected
                                    ? 'simplify-canvas__capability simplify-canvas__capability--active'
                                    : 'simplify-canvas__capability'
                                }
                                onClick={() => toggleManualCapability(module.id, ability)}
                              >
                                {ability}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="simplify-canvas__manual-order" aria-label="专家模式执行顺序">
                  {(manualRouteNodeIds.length > 0 ? manualRouteNodeIds : (['workflow'] as ExpertRouteNodeId[])).map((nodeId, index) => (
                    <div key={nodeId} className="simplify-canvas__manual-step">
                      <span>{index + 1}</span>
                      <strong>{EXPERT_MODULES.find((module) => module.id === nodeId)?.moduleName || NODE_RUN_COPY[nodeId].title}</strong>
                      <small>{(manualCapabilityIds[nodeId] || []).slice(0, 2).join('、') || NODE_RUN_COPY[nodeId].detail}</small>
                      <div>
                        <button type="button" disabled={index === 0} onClick={() => moveManualRouteNode(nodeId, -1)}>
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={index === manualRouteNodeIds.length - 1}
                          onClick={() => moveManualRouteNode(nodeId, 1)}
                        >
                          ↓
                        </button>
                        <button type="button" onClick={() => toggleManualRouteNode(nodeId)}>
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="simplify-canvas__route-chain" aria-label="本轮预计路线">
              {routePreview.route.map((nodeId) => (
                <span key={nodeId}>{NODE_RUN_COPY[nodeId].shortTitle}</span>
              ))}
            </div>
          </div>

          <div
            className="simplify-canvas__stage"
            style={{ '--simplify-canvas-scale': canvasScale } as CSSProperties}
          >
            <svg className="simplify-canvas__links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {CANVAS_LINKS.map((link) => {
                const active = activeNodeIds.has(link.source) || activeNodeIds.has(link.target)
                return (
                  <path
                    key={`${link.source}-${link.target}`}
                    d={curvePath(link.source, link.target)}
                    className={active ? 'simplify-canvas__link simplify-canvas__link--active' : 'simplify-canvas__link'}
                  />
                )
              })}
            </svg>

            {canvasNodes.map((node) => {
              const nodeId = node.id as CanvasNodeId
              const position = CANVAS_NODE_POSITIONS[nodeId]
              const step = runSteps.find((item) => item.nodeId === nodeId)
              const skipped = Boolean(activeRun && runSteps.length > 0 && !runNodeIds.has(nodeId))
              const fallbackActive = node.activityCount > 0 || activeNodeIds.has(nodeId)
              const status = step ? runStatusClass(step.status, false) : skipped ? 'skipped' : runStatusClass(undefined, fallbackActive)
              const hint = nodeHintText({ step, activeRun, skipped, fallbackActive })
              const tooltipRows = nodeTooltipRows({
                nodeId,
                step,
                skipped,
                hint,
                runSteps,
                routeRationale: routePreview.rationale,
              })
              return (
                <button
                  key={node.id}
                  type="button"
                  className={`simplify-canvas__node simplify-canvas__node--${status}`}
                  style={{ left: `${position.x}%`, top: `${position.y}%` }}
                  data-tooltip-x={position.x < 30 ? 'right' : position.x > 70 ? 'left' : 'center'}
                  data-tooltip-y={position.y > 58 ? 'above' : 'below'}
                  aria-describedby={`simplify-node-tip-${node.id}`}
                  onClick={() => onNavigate(asSandboxTabId(node.targetTab))}
                >
                  <span className="simplify-canvas__node-head">
                    <span className="simplify-canvas__node-icon">{nodeIcon(NODE_ICONS[nodeId])}</span>
                    <strong>{NODE_RUN_COPY[nodeId].title}</strong>
                  </span>
                  <span className="simplify-canvas__node-hint">
                    <span className={`simplify-canvas__dot simplify-canvas__dot--${status}`} />
                    {hint}
                  </span>
                  <span id={`simplify-node-tip-${node.id}`} className="simplify-canvas__node-tooltip" role="tooltip">
                    {tooltipRows.map((row) => (
                      <span key={row.label}>
                        <b>{row.label}</b>
                        <em>{row.value}</em>
                      </span>
                    ))}
                  </span>
                </button>
              )
            })}
          </div>

          <div className={`simplify-canvas__outcome simplify-canvas__outcome--${activeRunHeadline.tone}`}>
            <div className="simplify-canvas__outcome-head">
              <span>本轮结果</span>
              <strong>{visibleDeliverable?.title || activeRunHeadline.headline}</strong>
              <em>{activeRun ? formatTime(activeRun.completedAt || activeRun.updatedAt || activeRun.createdAt) : '等待输入'}</em>
            </div>
            <div className="simplify-canvas__outcome-body">
              <p>{visibleDeliverable?.summary || activeRunHeadline.detail}</p>
              {visibleDeliverable ? (
                <div className="simplify-canvas__delivery" aria-label="最终产物">
                  {deliveryRows(visibleDeliverable).map((row) => (
                    <div key={row.label} className={row.wide ? 'simplify-canvas__delivery-wide' : undefined}>
                      <span>{row.label}</span>
                      <strong>{row.value}</strong>
                    </div>
                  ))}
                  {visibleDeliverable.evidenceRefs.length > 0 ? (
                    <div className="simplify-canvas__evidence">
                      {visibleDeliverable.evidenceRefs.slice(0, 4).map((ref) => (
                        <em key={ref}>{compactDisplayText(ref, 24)}</em>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <blockquote>{outcomeText}</blockquote>
              )}
            </div>
          </div>

          {foldedRuns.length > 0 ? (
            <details className="simplify-canvas__history">
              <summary>旧任务已收起 {foldedRunCount} 条</summary>
              <div>
                {foldedRuns.map((run) => (
                  <button key={run.id} type="button" onClick={() => setFocusedRunId(run.id)}>
                    <strong>{compactDisplayText(run.bossDemand, 28)}</strong>
                    <span>{runHeadline(run).label}</span>
                  </button>
                ))}
              </div>
            </details>
          ) : null}

          <footer className="simplify-canvas__footer">
            <div className="simplify-canvas__zoom">
              <span>大小</span>
              <button type="button" onClick={() => setCanvasScale((value) => Math.max(0.85, Number((value - 0.05).toFixed(2))))}>
                -
              </button>
              <strong>{Math.round(canvasScale * 100)}%</strong>
              <button type="button" onClick={() => setCanvasScale((value) => Math.min(1.15, Number((value + 0.05).toFixed(2))))}>
                +
              </button>
            </div>
            <div className="simplify-canvas__run-note">
              {cleanUserFacingCopy(runNoteCopy)}
            </div>
            <div className="simplify-canvas__legend">
              <span><i className="simplify-canvas__dot simplify-canvas__dot--running" /> 正在做</span>
              <span><i className="simplify-canvas__dot simplify-canvas__dot--completed" /> 做完</span>
              <span><i className="simplify-canvas__dot simplify-canvas__dot--skipped" /> 不用</span>
              {foldedRunCount > 0 ? <span>旧任务 {foldedRunCount} 条已收起</span> : null}
            </div>
          </footer>
        </section>
      </div>
    </div>
  )
}
