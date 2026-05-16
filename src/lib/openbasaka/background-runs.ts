import { getLLMConfig, chatCompletion, type LLMConfig } from '../ai/provider'
import { createScheduledTask, updateScheduledTask } from '../automation/scheduler'
import { dbGetDecisions, dbGetMemories, dbListOperatingEvents, dbSaveMemory, dbSaveOperatingEvent, query, run } from '../db/repository'
import { generateId } from '../db/schema'
import { queryWikiEnhanced, type QueryResult } from '../knowledge/query-engine'
import { createTeam, getTeam, listTeamActions } from '../teams/store'
import { runTeamSession } from '../teams/engine'
import type { Team, TeamAction, TeamMessage, TeamSession, TeamWorkflowType } from '../teams/types'
import { buildUiMuseumPrdContext } from '../ui-museum/context'
import { executeWorkflow } from '../workflow/executor'
import { generatePromptTemplateFromWorkflow, saveWorkflowStudioItem, type WorkflowStudioTarget } from '../workflow/studio'
import type { Workflow, WorkflowRun } from '../workflow/types'
import { buildOpenbasakaSelfAuditReport, loadOpenbasakaSelfAuditRuntimeCounts } from './self-audit'

export type OpenbasakaRunStatus = 'queued' | 'running' | 'blocked' | 'completed' | 'failed'
export type OpenbasakaRunStepStatus = OpenbasakaRunStatus
export type SimplifyAppPlatform = 'ios' | 'macos'
export type SimplifyExecutableNodeId =
  | 'control'
  | 'boss'
  | 'knowledge'
  | 'workflow'
  | 'teams'
  | 'scheduler'
  | 'audit'
  | 'memory'
  | 'xiaobai'
export type SimplifyMissionRouteMode = 'auto' | 'manual'
export type SimplifyMissionDeliverableKind = 'app' | 'prd' | 'knowledge' | 'automation' | 'plan'
export type SimplifyMissionCapabilityMap = Partial<Record<SimplifyExecutableNodeId, string[]>>

export interface SimplifyMissionDeliverable {
  kind: SimplifyMissionDeliverableKind
  platform?: SimplifyAppPlatform
  title: string
  summary: string
  artifactLocation: string
  projectLocation: string
  fileEntrypoints: string[]
  runCommand: string
  verification: string
  statusLabel: string
  nextStep: string
  evidenceRefs: string[]
  createdFiles?: string[]
  verificationCommand?: string
  moduleArtifacts?: SimplifyMissionModuleArtifact[]
}

export interface SimplifyMissionModuleArtifact {
  kind: 'workflow-studio' | 'scheduled-task'
  id: string
  label: string
  location: string
  status: string
  enabled?: boolean
}

export interface OpenbasakaRun {
  id: string
  moduleId: string
  moduleName: string
  bossDemand: string
  title: string
  status: OpenbasakaRunStatus
  currentStepId: string
  resultPreview: string
  error: string
  createdAt: string
  updatedAt: string
  completedAt: string
}

export interface OpenbasakaRunStep {
  id: string
  runId: string
  nodeId: string
  targetTab: string
  title: string
  detail: string
  status: OpenbasakaRunStepStatus
  startedAt: string
  completedAt: string
  outputPreview: string
  orderIndex: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface OpenbasakaRunStepMetadata extends Record<string, unknown> {
  phase?: string
  evidenceRefs?: string[]
  artifactId?: string
  serviceName?: string
  progressDetail?: string
  blockingReason?: string
  startedAt?: string
  completedAt?: string
}

export interface OpenbasakaRunWithSteps extends OpenbasakaRun {
  steps: OpenbasakaRunStep[]
}

export interface OpenbasakaMissionStepContext {
  run: OpenbasakaRun
  demand: string
  step: OpenbasakaRunStep
  previous: MissionStepOutcome[]
  llmConfig: LLMConfig
}

export interface MissionStepOutcome {
  status?: 'completed' | 'blocked'
  outputPreview: string
  metadata?: OpenbasakaRunStepMetadata
}

export interface OpenbasakaMissionServices {
  resolveModelConfig: () => LLMConfig
  lockBossIntent: (context: OpenbasakaMissionStepContext) => Promise<MissionStepOutcome>
  queryKnowledge: (context: OpenbasakaMissionStepContext) => Promise<MissionStepOutcome>
  executeWorkflow: (context: OpenbasakaMissionStepContext) => Promise<MissionStepOutcome>
  runTeamCouncil: (context: OpenbasakaMissionStepContext) => Promise<MissionStepOutcome>
  planSchedule: (context: OpenbasakaMissionStepContext) => Promise<MissionStepOutcome>
  runSelfAudit: (context: OpenbasakaMissionStepContext) => Promise<MissionStepOutcome>
  translateForXiaobai: (context: OpenbasakaMissionStepContext) => Promise<MissionStepOutcome>
  synthesizeFinal: (context: OpenbasakaMissionStepContext) => Promise<MissionStepOutcome>
  writeMemory: (context: OpenbasakaMissionStepContext) => Promise<MissionStepOutcome>
}

interface RawRunRow {
  id: string
  module_id: string
  module_name: string
  boss_demand: string
  title: string
  status: OpenbasakaRunStatus
  current_step_id: string
  result_preview: string
  error: string
  created_at: string
  updated_at: string
  completed_at: string
}

interface RawStepRow {
  id: string
  run_id: string
  node_id: string
  target_tab: string
  title: string
  detail: string
  status: OpenbasakaRunStepStatus
  started_at: string
  completed_at: string
  output_preview: string
  order_index: number
  metadata_json: string
  created_at: string
  updated_at: string
}

interface SimplifyAppDeliveryMaterialization {
  materialized: boolean
  platform: SimplifyAppPlatform
  projectName: string
  projectLocation: string
  xcodeProjectPath: string
  createdFiles: string[]
  runCommand: string
  verificationCommand: string
  verification: string
  statusLabel: string
  nextStep: string
  evidenceRefs: string[]
  error?: string
}

interface SimplifyModuleMaterialization {
  artifacts: SimplifyMissionModuleArtifact[]
  workflowStudioId?: string
  scheduledTaskId?: string
  evidenceRefs: string[]
  error?: string
}

interface ElectronDeliveryApi {
  writeFile?: (filePath: string, content: string) => Promise<{ success?: boolean; error?: string } | void>
  executeCommand?: (
    command: string,
    timeout?: number,
  ) => Promise<{ success?: boolean; stdout?: string; stderr?: string; error?: string; exitCode?: number } | string>
}

const STEP_DELAY_MS = 0
const KNOWLEDGE_QUERY_TIMEOUT_MS = 45_000
const WORKFLOW_EXECUTION_TIMEOUT_MS = 30_000
const TEAM_SESSION_TIMEOUT_MS = 55_000
const FINAL_SYNTHESIS_TIMEOUT_MS = 45_000
const listeners = new Set<(runs: OpenbasakaRunWithSteps[]) => void>()
const memoryRuns = new Map<string, OpenbasakaRun>()
const memorySteps = new Map<string, OpenbasakaRunStep[]>()
const timers = new Set<ReturnType<typeof setTimeout>>()
let schemaReady: Promise<void> | null = null
let recoveryChecked = false
let lastSnapshot: OpenbasakaRunWithSteps[] = []
const runtimeBootedAt = Date.now()
const DETACHED_RECOVERY_GRACE_MS = 2 * 60 * 1000

const TARGET_TABS: Record<string, string> = {
  boss: 'boss',
  memory: 'memory',
  knowledge: 'knowledge',
  workflow: 'workflow',
  teams: 'teams',
  scheduler: 'scheduler',
  audit: 'system-audit',
  xiaobai: 'xiaobai',
  control: 'control',
  neurons: 'neurons',
  synapses: 'synapses',
}

const STEP_COPY: Record<string, { title: string; detail: string; output: string }> = {
  control: {
    title: '准备工具',
    detail: '先确认能安全开工。',
    output: '工具已准备好。',
  },
  boss: {
    title: '读懂你的话',
    detail: '弄清楚真正目标。',
    output: '已经读懂本轮任务。',
  },
  knowledge: {
    title: '找资料',
    detail: '需要证据时才查资料。',
    output: '资料已整理。',
  },
  teams: {
    title: '大家一起想',
    detail: '复杂问题先定方案。',
    output: '方案已收拢。',
  },
  workflow: {
    title: '排步骤',
    detail: '把事情拆成可执行顺序。',
    output: '步骤已排好。',
  },
  scheduler: {
    title: '设提醒',
    detail: '需要长期跟进时再安排。',
    output: '提醒方案已准备。',
  },
  audit: {
    title: '检查一遍',
    detail: '确认没有乱承诺。',
    output: '检查完成。',
  },
  memory: {
    title: '记下来',
    detail: '把有用经验留给下次。',
    output: '已经记下。',
  },
  xiaobai: {
    title: '讲人话',
    detail: '把下一步说简单。',
    output: '下一步已说清楚。',
  },
}

const EXECUTABLE_NODE_IDS = new Set<SimplifyExecutableNodeId>([
  'control',
  'boss',
  'knowledge',
  'workflow',
  'teams',
  'scheduler',
  'audit',
  'memory',
  'xiaobai',
])

const KNOWLEDGE_ROUTE_PATTERN =
  /知识|资料|来源|证据|引用|视频|字幕|PDF|网页|笔记|wiki|notebook|调研|研究|市场|竞品|用户|天气|地区|iOS|app|产品|神经元|突触|推演室|项目网络/i
const TEAM_ROUTE_PATTERN =
  /群策|智囊|PRD|评审|视觉|UI|UX|设计|产品|app|实现|开发|架构|复杂|全方位|完整|高明|方案|模块|落地|协作|创意|广告|分镜|素材|大片|视频创意|游戏|斗地主|扑克牌|Mac|macOS/i
const SCHEDULER_ROUTE_PATTERN =
  /每天|每周|每月|定时|周期|自动化|自动推送|自动检查|自动运行|自动推进|提醒|推送|复盘|夜巡|cron|schedule|scheduler/i
const XIAOBAI_ROUTE_PATTERN = /小白|新手|教教我|一步步|看不懂|解释|翻译|简单|傻瓜/i

export interface SimplifyMissionRoutePlan {
  route: SimplifyExecutableNodeId[]
  skipped: SimplifyExecutableNodeId[]
  rationale: string
  mode: SimplifyMissionRouteMode
  plannerNodeId: SimplifyExecutableNodeId
  manualNodeIds: SimplifyExecutableNodeId[]
}

export interface SimplifyMissionRouteOptions {
  routeMode?: SimplifyMissionRouteMode
  manualNodeIds?: SimplifyExecutableNodeId[]
  manualCapabilityIds?: SimplifyMissionCapabilityMap
}

export interface StartSimplifyMissionOptions extends SimplifyMissionRouteOptions {
  autoAdvance?: boolean
  stepDelayMs?: number
  services?: Partial<OpenbasakaMissionServices>
}

export async function ensureOpenbasakaRunSchema(): Promise<void> {
  if (schemaReady) return schemaReady
  schemaReady = (async () => {
    await run(`
      CREATE TABLE IF NOT EXISTS openbasaka_runs (
        id TEXT PRIMARY KEY,
        module_id TEXT NOT NULL,
        module_name TEXT DEFAULT '',
        boss_demand TEXT DEFAULT '',
        title TEXT DEFAULT '',
        status TEXT DEFAULT 'queued',
        current_step_id TEXT DEFAULT '',
        result_preview TEXT DEFAULT '',
        error TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime')),
        completed_at TEXT DEFAULT ''
      )
    `)
    await run(`
      CREATE TABLE IF NOT EXISTS openbasaka_run_steps (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        node_id TEXT DEFAULT '',
        target_tab TEXT DEFAULT '',
        title TEXT DEFAULT '',
        detail TEXT DEFAULT '',
        status TEXT DEFAULT 'queued',
        started_at TEXT DEFAULT '',
        completed_at TEXT DEFAULT '',
        output_preview TEXT DEFAULT '',
        order_index INTEGER DEFAULT 0,
        metadata_json TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      )
    `)
    await ensureColumn('openbasaka_runs', 'module_name', "TEXT DEFAULT ''")
    await ensureColumn('openbasaka_runs', 'completed_at', "TEXT DEFAULT ''")
    await ensureColumn('openbasaka_run_steps', 'metadata_json', "TEXT DEFAULT '{}'")
    await run('CREATE INDEX IF NOT EXISTS idx_openbasaka_runs_status ON openbasaka_runs(status, updated_at DESC)')
    await run('CREATE INDEX IF NOT EXISTS idx_openbasaka_run_steps_run ON openbasaka_run_steps(run_id, order_index ASC)')
  })()
  return schemaReady
}

export async function listOpenbasakaRuns(limit = 12): Promise<OpenbasakaRunWithSteps[]> {
  await ensureOpenbasakaRunSchema()
  await recoverDetachedRuns()
  const dbRuns = await query<RawRunRow>('SELECT * FROM openbasaka_runs ORDER BY updated_at DESC, created_at DESC LIMIT ?', [limit]).catch(() => [])
  const dbRunIds = dbRuns.map((row) => row.id)
  const dbSteps = dbRunIds.length
    ? await query<RawStepRow>(
        `SELECT * FROM openbasaka_run_steps WHERE run_id IN (${dbRunIds.map(() => '?').join(',')}) ORDER BY order_index ASC`,
        dbRunIds,
      ).catch(() => [])
    : []

  const byRunId = new Map<string, OpenbasakaRunStep[]>()
  for (const step of dbSteps.map(rowToStep)) {
    byRunId.set(step.runId, [...(byRunId.get(step.runId) || []), step])
  }

  const merged = new Map<string, OpenbasakaRunWithSteps>()
  for (const runRow of dbRuns) {
    const nextRun = rowToRun(runRow)
    merged.set(nextRun.id, { ...nextRun, steps: byRunId.get(nextRun.id) || [] })
  }
  for (const run of memoryRuns.values()) {
    merged.set(run.id, { ...run, steps: memorySteps.get(run.id) || byRunId.get(run.id) || [] })
  }

  lastSnapshot = Array.from(merged.values())
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
  return lastSnapshot
}

export function subscribeOpenbasakaRuns(listener: (runs: OpenbasakaRunWithSteps[]) => void): () => void {
  listeners.add(listener)
  listener(lastSnapshot)
  listOpenbasakaRuns().then(listener).catch(() => listener(lastSnapshot))
  return () => {
    listeners.delete(listener)
  }
}

export async function startSimplifyMission(
  demand: string,
  options: StartSimplifyMissionOptions = {},
): Promise<OpenbasakaRun> {
  const trimmed = demand.trim()
  if (!trimmed) throw new Error('empty_demand')
  await ensureOpenbasakaRunSchema()

  const now = new Date().toISOString()
  const runId = `obr_${generateId()}`
  const steps = createSimplifyMissionSteps(runId, trimmed, now, options)
  const firstStep = steps[0]
  const runRecord: OpenbasakaRun = {
    id: runId,
    moduleId: 'simplify',
    moduleName: '化繁为简',
    bossDemand: trimmed,
    title: `一句话任务｜${compact(trimmed, 38)}`,
    status: 'running',
    currentStepId: firstStep?.id || '',
    resultPreview: '小白已收到，正在安排本轮任务。',
    error: '',
    createdAt: now,
    updatedAt: now,
    completedAt: '',
  }

  memoryRuns.set(runId, runRecord)
  memorySteps.set(runId, steps)
  await persistRun(runRecord)
  for (const step of steps) await persistStep(step)
  await writeRunEvent(runRecord, 'capture', '启动化繁为简任务', runRecord.resultPreview)
  await notifyListeners()

  if (options.autoAdvance !== false) {
    runOpenbasakaMissionPipeline(runId, {
      stepDelayMs: options.stepDelayMs ?? STEP_DELAY_MS,
      services: options.services,
    }).catch((error) => {
      failRun(runId, error instanceof Error ? error.message : String(error)).catch(() => undefined)
    })
  }
  return runRecord
}

export async function updateOpenbasakaRunStep(
  runId: string,
  stepId: string,
  patch: Partial<Pick<OpenbasakaRunStep, 'status' | 'startedAt' | 'completedAt' | 'outputPreview' | 'metadata'>>,
): Promise<void> {
  await ensureOpenbasakaRunSchema()
  const steps = memorySteps.get(runId) || []
  const current = steps.find((step) => step.id === stepId)
  if (!current) return
  const now = new Date().toISOString()
  const nextStep: OpenbasakaRunStep = {
    ...current,
    ...patch,
    startedAt: patch.status === 'running' && !patch.startedAt ? now : patch.startedAt ?? current.startedAt,
    completedAt:
      (patch.status === 'completed' || patch.status === 'failed' || patch.status === 'blocked') && !patch.completedAt
        ? now
        : patch.completedAt ?? current.completedAt,
    updatedAt: now,
  }
  memorySteps.set(
    runId,
    steps.map((step) => (step.id === stepId ? nextStep : step)),
  )
  await persistStep(nextStep)
  await patchRun(runId, {
    currentStepId: nextStep.id,
    resultPreview: nextStep.outputPreview || nextStep.detail,
    status: nextStep.status === 'failed' ? 'failed' : nextStep.status === 'blocked' ? 'blocked' : 'running',
    updatedAt: now,
  })
  await writeStepEvent(nextStep)
  await notifyListeners()
}

export async function finishOpenbasakaRun(runId: string, resultPreview: string): Promise<void> {
  const now = new Date().toISOString()
  await patchRun(runId, {
    status: 'completed',
    resultPreview,
    updatedAt: now,
    completedAt: now,
  })
  const runRecord = memoryRuns.get(runId)
  if (runRecord) await writeRunEvent({ ...runRecord, resultPreview }, 'review', '完成化繁为简任务', resultPreview)
  await notifyListeners()
}

export function resetOpenbasakaRunRuntimeForTest(): void {
  for (const timer of timers) clearTimeout(timer)
  timers.clear()
  listeners.clear()
  memoryRuns.clear()
  memorySteps.clear()
  lastSnapshot = []
  schemaReady = null
  recoveryChecked = false
}

async function runOpenbasakaMissionPipeline(
  runId: string,
  options: { stepDelayMs?: number; services?: Partial<OpenbasakaMissionServices> } = {},
): Promise<void> {
  const runRecord = memoryRuns.get(runId)
  if (!runRecord) return
  const steps = memorySteps.get(runId) || []
  const services = createMissionServices(options.services)
  const llmConfig = services.resolveModelConfig()
  const outcomes: MissionStepOutcome[] = []

  for (const step of steps) {
    await updateOpenbasakaRunStep(runId, step.id, {
      status: 'running',
      outputPreview: `${step.title}正在真实运行。`,
      metadata: {
        ...step.metadata,
        phase: 'running',
        serviceName: missionServiceName(step.nodeId),
        progressDetail: step.detail,
      },
    })
    await wait(options.stepDelayMs ?? 0)

    const currentRun = memoryRuns.get(runId) || runRecord
    const latestStep = (memorySteps.get(runId) || steps).find((item) => item.id === step.id) || step
    const outcome = await runMissionStep(services, {
      run: currentRun,
      demand: runRecord.bossDemand,
      step: latestStep,
      previous: outcomes,
      llmConfig,
    })
    outcomes.push(outcome)

    await updateOpenbasakaRunStep(runId, step.id, {
      status: outcome.status === 'blocked' ? 'blocked' : 'completed',
      outputPreview: outcome.outputPreview,
      metadata: {
        ...latestStep.metadata,
        ...outcome.metadata,
        phase: outcome.status === 'blocked' ? 'blocked' : 'completed',
        completedAt: new Date().toISOString(),
      },
    })

    if (outcome.status === 'blocked') {
      await patchRun(runId, {
        status: 'blocked',
        resultPreview: outcome.outputPreview,
        error: outcome.metadata?.blockingReason || '',
        updatedAt: new Date().toISOString(),
      })
      await notifyListeners()
      return
    }
  }
  const finalOutput = outcomes[outcomes.length - 1]?.outputPreview || '本轮任务已完成。'
  await finishOpenbasakaRun(runId, finalOutput)
}

async function failRun(runId: string, error: string): Promise<void> {
  const now = new Date().toISOString()
  const steps = memorySteps.get(runId) || []
  const runningStep = steps.find((step) => step.status === 'running')
  if (runningStep) {
    const nextStep: OpenbasakaRunStep = {
      ...runningStep,
      status: 'failed',
      completedAt: now,
      outputPreview: `运行失败：${error}`,
      metadata: {
        ...runningStep.metadata,
        phase: 'failed',
        blockingReason: '',
        progressDetail: error,
      },
      updatedAt: now,
    }
    memorySteps.set(
      runId,
      steps.map((step) => (step.id === runningStep.id ? nextStep : step)),
    )
    await persistStep(nextStep)
    await writeStepEvent(nextStep)
  }
  await patchRun(runId, {
    status: 'failed',
    error,
    resultPreview: `运行失败：${error}`,
    updatedAt: now,
    completedAt: now,
  })
  await notifyListeners()
}

function createSimplifyMissionSteps(
  runId: string,
  demand: string,
  now: string,
  routeOptions: SimplifyMissionRouteOptions = {},
): OpenbasakaRunStep[] {
  const routePlan = planSimplifyMissionRoute(demand, routeOptions)
  const capabilityMap = normalizeCapabilityMap(routeOptions.manualCapabilityIds)
  return routePlan.route.map((nodeId, index) => {
    const copy = STEP_COPY[nodeId] || STEP_COPY.workflow
    const capabilityLabels = capabilityLabelsForNode(nodeId, demand, capabilityMap)
    return {
      id: `obrs_${generateId()}`,
      runId,
      nodeId,
      targetTab: TARGET_TABS[nodeId] || 'workflow',
      title: copy.title,
      detail: copy.detail,
      status: index === 0 ? 'running' : 'queued',
      startedAt: index === 0 ? now : '',
      completedAt: '',
      outputPreview: index === 0 ? `${copy.title}中。` : '等前一步。',
      orderIndex: index,
      metadata: {
        demand,
        phase: index === 0 ? 'queued' : 'waiting',
        serviceName: missionServiceName(nodeId),
        progressDetail: copy.detail,
        routeRationale: routePlan.rationale,
        routeMode: routePlan.mode,
        plannerNodeId: routePlan.plannerNodeId,
        manualNodeIds: routePlan.manualNodeIds,
        capabilityLabels,
        skippedNodeIds: routePlan.skipped,
      },
      createdAt: now,
      updatedAt: now,
    }
  })
}

const ROUTE_START: SimplifyExecutableNodeId[] = ['control', 'boss']
const ROUTE_END: SimplifyExecutableNodeId[] = ['audit', 'memory']
const MANUAL_SELECTABLE_NODE_IDS = new Set<SimplifyExecutableNodeId>([
  'knowledge',
  'workflow',
  'teams',
  'scheduler',
  'xiaobai',
])

const DEFAULT_CAPABILITY_LABELS: Record<SimplifyExecutableNodeId, string[]> = {
  control: ['工具预检'],
  boss: ['读懂需求'],
  knowledge: ['找资料', '核来源'],
  workflow: ['排步骤', '验收清单'],
  teams: ['群策定方案', '反方审视'],
  scheduler: ['设提醒', '留记录'],
  audit: ['检查一遍'],
  memory: ['记下来'],
  xiaobai: ['讲人话', '新手引导'],
}

function uniqueExecutableRoute(nodes: SimplifyExecutableNodeId[]): SimplifyExecutableNodeId[] {
  return Array.from(new Set(nodes)).filter(isSimplifyExecutableNodeId)
}

function normalizeManualMissionNodes(manualNodeIds: SimplifyExecutableNodeId[] = []): SimplifyExecutableNodeId[] {
  return uniqueExecutableRoute(manualNodeIds).filter((nodeId) => MANUAL_SELECTABLE_NODE_IDS.has(nodeId))
}

function normalizeCapabilityMap(map: SimplifyMissionCapabilityMap = {}): SimplifyMissionCapabilityMap {
  const next: SimplifyMissionCapabilityMap = {}
  for (const [rawNodeId, labels] of Object.entries(map)) {
    if (!isSimplifyExecutableNodeId(rawNodeId)) continue
    const cleanLabels = Array.from(
      new Set((labels || []).map((label) => compact(String(label || ''), 24)).filter(Boolean)),
    ).slice(0, 5)
    if (cleanLabels.length > 0) next[rawNodeId] = cleanLabels
  }
  return next
}

function capabilityLabelsForNode(
  nodeId: SimplifyExecutableNodeId,
  demand: string,
  capabilityMap: SimplifyMissionCapabilityMap,
): string[] {
  const selected = capabilityMap[nodeId]
  if (selected?.length) return selected
  if (nodeId === 'teams' && /机会|灵感|无中生有|新方向|反茧房|惯性|偏好|盲点/i.test(demand)) {
    return ['机会生成', '反方审视']
  }
  if (nodeId === 'workflow' && /app|iOS|项目|代码|Xcode|落地|执行/i.test(demand)) {
    return ['项目落点', '验证路径']
  }
  if (nodeId === 'knowledge' && /来源|证据|资料|调研|知识|视频|PDF|网页/i.test(demand)) {
    return ['找资料', '证据整理']
  }
  return DEFAULT_CAPABILITY_LABELS[nodeId] || []
}

function finalizeSimplifyMissionRoute(params: {
  route: SimplifyExecutableNodeId[]
  reasons: string[]
  mode: SimplifyMissionRouteMode
  plannerNodeId: SimplifyExecutableNodeId
  manualNodeIds?: SimplifyExecutableNodeId[]
}): SimplifyMissionRoutePlan {
  const route = uniqueExecutableRoute(params.route)
  const skipped = Array.from(EXECUTABLE_NODE_IDS).filter((nodeId) => !route.includes(nodeId))
  return {
    route,
    skipped,
    rationale: params.reasons.join('；'),
    mode: params.mode,
    plannerNodeId: params.plannerNodeId,
    manualNodeIds: params.manualNodeIds || [],
  }
}

export function planSimplifyMissionRoute(
  demand: string,
  options: SimplifyMissionRouteOptions = {},
): SimplifyMissionRoutePlan {
  const text = demand.trim()
  if (options.routeMode === 'manual') {
    const selected = normalizeManualMissionNodes(options.manualNodeIds)
    const manualMiddle: SimplifyExecutableNodeId[] = selected.length > 0 ? selected : ['workflow']
    return finalizeSimplifyMissionRoute({
      route: [...ROUTE_START, ...manualMiddle, ...ROUTE_END],
      reasons: [
        selected.length > 0
          ? `按 Boss 选择的顺序跑`
          : '没有选择模块，先跑最小步骤',
        '保留准备、检查和记忆，避免无证据完成',
      ],
      mode: 'manual',
      plannerNodeId: manualMiddle[0],
      manualNodeIds: manualMiddle,
    })
  }

  const route: SimplifyExecutableNodeId[] = [...ROUTE_START]
  const reasons: string[] = ['自动选择：先读懂任务']

  const needsKnowledge = KNOWLEDGE_ROUTE_PATTERN.test(text)
  const needsTeam = TEAM_ROUTE_PATTERN.test(text)
  const needsScheduler = SCHEDULER_ROUTE_PATTERN.test(text)
  const needsXiaobai = XIAOBAI_ROUTE_PATTERN.test(text)
  const plannerNodeId: SimplifyExecutableNodeId = needsTeam ? 'teams' : needsScheduler ? 'workflow' : 'xiaobai'

  if (needsKnowledge) {
    route.push('knowledge')
    reasons.push('需要资料时才查资料')
  }

  if (needsTeam) {
    route.push('teams')
    reasons.push('复杂问题先定方案')
  } else if (needsScheduler) {
    reasons.push('周期任务先落到工作流和定时中心')
  } else {
    route.push('xiaobai')
    reasons.push('简单问题先讲清楚')
  }

  route.push('workflow')
  reasons.push('只跑必要步骤')

  if (needsScheduler) {
    route.push('scheduler')
    reasons.push('需要长期推进时才设提醒')
  }

  if (needsXiaobai && !route.includes('xiaobai')) {
    route.push('xiaobai')
    reasons.push('需要小白时再讲人话')
  }

  return finalizeSimplifyMissionRoute({
    route: [...route, ...ROUTE_END],
    reasons,
    mode: 'auto',
    plannerNodeId,
  })
}

function isSimplifyExecutableNodeId(value: string): value is SimplifyExecutableNodeId {
  return EXECUTABLE_NODE_IDS.has(value as SimplifyExecutableNodeId)
}

function createMissionServices(overrides: Partial<OpenbasakaMissionServices> = {}): OpenbasakaMissionServices {
  return {
    resolveModelConfig: defaultResolveModelConfig,
    lockBossIntent: defaultLockBossIntent,
    queryKnowledge: defaultQueryKnowledge,
    executeWorkflow: defaultExecuteWorkflow,
    runTeamCouncil: defaultRunTeamCouncil,
    planSchedule: defaultPlanSchedule,
    runSelfAudit: defaultRunSelfAudit,
    translateForXiaobai: defaultTranslateForXiaobai,
    synthesizeFinal: defaultSynthesizeFinal,
    writeMemory: defaultWriteMemory,
    ...overrides,
  }
}

async function runMissionStep(
  services: OpenbasakaMissionServices,
  context: OpenbasakaMissionStepContext,
): Promise<MissionStepOutcome> {
  try {
    if (context.step.nodeId === 'control') return runPreflightStep(context)
    if (context.step.nodeId === 'boss') return services.lockBossIntent(context)
    if (context.step.nodeId === 'knowledge') return services.queryKnowledge(context)
    if (context.step.nodeId === 'workflow') return services.executeWorkflow(context)
    if (context.step.nodeId === 'teams') return services.runTeamCouncil(context)
    if (context.step.nodeId === 'scheduler') return services.planSchedule(context)
    if (context.step.nodeId === 'audit') return services.runSelfAudit(context)
    if (context.step.nodeId === 'xiaobai') return services.translateForXiaobai(context)
    if (context.step.nodeId === 'memory') {
      const final = await services.synthesizeFinal(context)
      const saved = await services.writeMemory({ ...context, previous: [...context.previous, final] })
      return {
        status: saved.status || final.status,
        outputPreview: saved.outputPreview || final.outputPreview,
        metadata: {
          ...final.metadata,
          ...saved.metadata,
          evidenceRefs: mergeEvidenceRefs(final.metadata?.evidenceRefs, saved.metadata?.evidenceRefs),
        },
      }
    }
    throw new MissionBlockedError(`节点 ${context.step.nodeId} 还没有接入真实执行器，已停止，避免伪造完成。`, {
      serviceName: missionServiceName(context.step.nodeId),
      evidenceRefs: [context.step.id],
    })
  } catch (error) {
    if (error instanceof MissionBlockedError) {
      return {
        status: 'blocked',
        outputPreview: error.message,
        metadata: {
          ...error.metadata,
          blockingReason: error.message,
          serviceName: missionServiceName(context.step.nodeId),
        },
      }
    }
    throw error
  }
}

class MissionBlockedError extends Error {
  metadata: OpenbasakaRunStepMetadata

  constructor(message: string, metadata: OpenbasakaRunStepMetadata = {}) {
    super(message)
    this.name = 'MissionBlockedError'
    this.metadata = metadata
  }
}

function defaultResolveModelConfig(): LLMConfig {
  return getLLMConfig()
}

async function runPreflightStep(context: OpenbasakaMissionStepContext): Promise<MissionStepOutcome> {
  const tables = await query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('wiki_pages','wiki_sources','workflow_runs','teams','team_sessions','scheduled_tasks','operating_events','boss_memory')",
  ).catch(() => [])
  const tableNames = tables.map((row) => row.name).filter(Boolean)
  if (!isModelConfigured(context.llmConfig)) {
    return {
      outputPreview: '模型还没有可用配置：本轮只继续做确定性编排、禁用候选和历史记录；需要模型生成或外部动作时不会假装完成。',
      metadata: {
        serviceName: 'model-preflight + deterministicFallback',
        phase: 'degraded',
        evidenceRefs: [...tableNames, 'model:not-configured'],
        progressDetail: '允许继续生成任务合同、工作流草稿、禁用定时候选和运行记录；不进行需要模型的真实内容生成。',
      },
    }
  }
  return {
    outputPreview: `预检通过：模型 ${context.llmConfig.provider}/${context.llmConfig.model} 与 ${tableNames.length} 个运行表可用。`,
    metadata: {
      serviceName: 'model-preflight',
      phase: 'completed',
      evidenceRefs: tableNames,
      progressDetail: '模型、数据库、知识、群策、工作流与历史表已完成基础检查。',
    },
  }
}

function buildDeterministicBossContract(context: OpenbasakaMissionStepContext): string {
  const kind = classifySimplifyDemand(context.demand)
  const target =
    kind === 'automation'
      ? '生成一个可试跑、默认禁用、不会自动外发的周期任务候选。'
      : kind === 'app'
        ? '把 Boss 的 App 设想转成可开工、可验证、可继续迭代的产品包。'
        : kind === 'knowledge'
          ? '把输入转成有来源、有证据缺口、有下一步的知识任务。'
          : '把复杂目标拆成必要模块、执行步骤、验收标准和下一步。'
  return [
    `真正目标：${target}`,
    `Boss 原话：${compact(context.demand, 120)}`,
    '成功标准：有清楚产物入口、执行步骤、验证方式、下一步和历史记录。',
    '边界：不自动删除、不自动外发、不自动付款、不改账号权限、不在未验证时声称完成。',
    '下一步运行策略：优先走确定性编排；需要模型、文件写入或外部动作时保留证据并等待确认。',
  ].join('\n')
}

interface SensitiveActionGuard {
  label: string
  pattern: RegExp
}

interface SensitiveActionHit {
  label: string
}

const SENSITIVE_ACTION_GUARDS: SensitiveActionGuard[] = [
  {
    label: '删除/移动/覆盖真实文件或数据',
    pattern: /(删除|清空|移除|移动|覆盖|销毁|格式化).{0,28}(文件|资料|目录|代码|项目|桌面|下载|数据库|记录|数据)/gi,
  },
  {
    label: '外发/上传/发布到外部渠道',
    pattern: /(外发|发送|发给|上传|发布|推送|群发|邮件给|私信给).{0,32}(别人|外部|客户|用户|微信|telegram|微博|x|twitter|邮箱|服务器|平台|账号|密钥|文件|报告|资料)/gi,
  },
  {
    label: '密钥/账号/密码暴露',
    pattern: /(输出|展示|打印|复制|发送|上传|公开|外发).{0,28}(密钥|api\s*key|apikey|token|密码|账号|cookie|secret)/gi,
  },
  {
    label: '支付/购买/转账',
    pattern: /(付款|支付|购买|下单|转账|扣款|订阅).{0,28}(账号|服务|套餐|订单|权限|外部|供应商|平台)?/gi,
  },
  {
    label: '账号或系统权限变更',
    pattern: /(授权|改权限|修改权限|开放权限|提升权限|sudo|chmod|chown).{0,28}(账号|权限|密钥|目录|文件|系统|应用|数据库)?/gi,
  },
  {
    label: '账号登录/注册/重置',
    pattern: /(登录|注册|改密码|重置密码|绑定账号|解绑账号).{0,28}(账号|平台|服务|权限)?/gi,
  },
]

function hasLocalSafetyNegation(text: string, matchIndex: number): boolean {
  const before = text.slice(Math.max(0, matchIndex - 16), matchIndex)
  return /(不|不要|不得|禁止|别|不许|无需|不必|避免|防止|不要自动|不自动|只出|只列|只生成|先出|先列|先生成).{0,8}$/i.test(before)
}

function detectSensitiveActionRequests(demand: string): SensitiveActionHit[] {
  const text = demand.trim()
  const hits: SensitiveActionHit[] = []
  for (const guard of SENSITIVE_ACTION_GUARDS) {
    guard.pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = guard.pattern.exec(text)) && hits.length < 6) {
      if (!hasLocalSafetyNegation(text, match.index)) {
        hits.push({ label: guard.label })
        break
      }
    }
  }
  return hits
}

async function defaultLockBossIntent(context: OpenbasakaMissionStepContext): Promise<MissionStepOutcome> {
  const sensitiveActions = detectSensitiveActionRequests(context.demand)
  if (sensitiveActions.length > 0) {
    const blockingReason = sensitiveActions.map((hit) => hit.label).join('；')
    return {
      status: 'blocked',
      outputPreview: `已停在 Boss 确认：检测到${blockingReason}。本轮不会继续执行、不会外发、不会删除、不会改权限，也不会输出密钥。`,
      metadata: {
        serviceName: 'action-guard',
        phase: 'boss-confirmation',
        artifactId: context.run.id,
        evidenceRefs: ['guard:sensitive-action', ...sensitiveActions.map((hit) => `guard:${hit.label}`)],
        blockingReason,
        progressDetail: JSON.stringify({
          blocked: true,
          guard: 'sensitive-action',
          actions: sensitiveActions.map((hit) => hit.label),
          policy: '必须由 Boss 明确确认后才能执行删除、外发、付款、账号、密钥或权限类动作。',
        }),
      },
    }
  }

  if (!isModelConfigured(context.llmConfig)) {
    const content = buildDeterministicBossContract(context)
    return {
      outputPreview: compact(content, 180),
      metadata: {
        serviceName: 'boss-intent-locker + deterministicFallback',
        artifactId: context.run.id,
        evidenceRefs: ['deterministic:boss-contract', ...collectOutcomeEvidence(context.previous).slice(0, 4)],
        progressDetail: content,
        recoveredFrom: 'model_not_configured',
      },
    }
  }
  let content = ''
  let recoveredFrom = ''
  try {
    content = await chatCompletion(
      context.llmConfig,
      [
        {
          role: 'system',
          content:
            '你是 Openbasaka 的 Boss 意图锁定器。必须把 Boss 的一句话压缩成真实目标、验收标准、边界、不做事项和下一步。不要空泛夸赞；也不要把 Boss 明确点名的体验气质当废话删掉，要把它们翻译成产品、视觉、交互和验收标准。',
        },
        {
          role: 'user',
          content: `Boss 原话：${context.demand}\n\n请输出：1. 真正目标 2. 成功标准 3. 必须动用的系统模块 4. 不做事项 5. 下一步运行策略。若原话包含有趣、用心、优雅、卡通、严谨等体验要求，必须保留并转成可检查条款。`,
        },
      ],
      0.28,
      1200,
    )
  } catch (error) {
    recoveredFrom = error instanceof Error ? error.message : String(error)
    content = buildDeterministicBossContract(context)
  }
  return {
    outputPreview: compact(content, 180),
    metadata: {
      serviceName: recoveredFrom ? 'boss-intent-locker + deterministicRecovery' : 'boss-intent-locker',
      artifactId: context.run.id,
      evidenceRefs: [recoveredFrom ? 'deterministic:boss-contract' : 'chatCompletion', context.llmConfig.model],
      progressDetail: content,
      recoveredFrom,
    },
  }
}

async function defaultQueryKnowledge(context: OpenbasakaMissionStepContext): Promise<MissionStepOutcome> {
  if (!isModelConfigured(context.llmConfig)) {
    return {
      outputPreview: '模型未配置：本轮先不做语义检索，只保留知识任务入口、证据缺口和后续补来源动作。',
      metadata: {
        serviceName: 'queryWikiEnhanced + deterministicFallback',
        artifactId: context.run.id,
        evidenceRefs: ['deterministic:knowledge-gap', ...collectOutcomeEvidence(context.previous).slice(0, 4)],
        progressDetail: '需要模型或检索配置后再生成可引用结论；当前不能把推测当证据。',
        recoveredFrom: 'model_not_configured',
      },
    }
  }
  let result: QueryResult | null = null
  let recoveredFrom = ''
  try {
    result = await withTimeout(
      queryWikiEnhanced(
        `围绕 Boss 这句话找出已有知识、证据、历史经验和可能相关来源：${context.demand}`,
        context.llmConfig,
        undefined,
        'Openbasaka 一句话 mission 知识检索员',
      ),
      KNOWLEDGE_QUERY_TIMEOUT_MS,
      'knowledge_query_timeout',
    )
  } catch (error) {
    recoveredFrom = error instanceof Error ? error.message : String(error)
  }
  const failedAnswer = result?.answer && isTransientWorkflowFailure(result.answer) ? result.answer : ''
  if (recoveredFrom || failedAnswer) {
    const detail = recoveredFrom || failedAnswer
    return {
      outputPreview:
        '知识库检索已走完：本轮没有拿到可引用的成品文档，先按 Boss 意图、已有运行上下文和后续工作流推进。',
      metadata: {
        serviceName: 'queryWikiEnhanced + gracefulFallback',
        artifactId: result?.sourcePageIds[0] || '',
        evidenceRefs: (result?.sourcePageIds || []).slice(0, 4).map((id) => `wiki:${id}`),
        progressDetail: result ? summarizeQueryResult(result) : '知识检索服务在限定时间内没有返回可用正文。',
        recoveredFrom: detail,
      },
    }
  }
  if (!result) {
    throw new Error('knowledge_result_unreachable')
  }
  const citations = result.citations || []
  const evidenceRefs = [
    ...result.sourcePageIds.map((id) => `wiki:${id}`),
    ...citations.slice(0, 6).map((citation) => `${citation.label}:${citation.title}`),
  ]
  return {
    outputPreview: compact(result.answer || '知识检索完成，但没有生成长答案。', 190),
    metadata: {
      serviceName: 'queryWikiEnhanced',
      artifactId: result.sourcePageIds[0] || '',
      evidenceRefs,
      progressDetail: summarizeQueryResult(result),
    },
  }
}

async function defaultExecuteWorkflow(context: OpenbasakaMissionStepContext): Promise<MissionStepOutcome> {
  if (!isModelConfigured(context.llmConfig)) {
    const recovered = buildDeterministicMissionBlueprint(context, 'workflow')
    return {
      outputPreview: compact(recovered, 900),
      metadata: {
        serviceName: 'executeWorkflow + deterministicFallback',
        artifactId: `wf_simplify_${context.run.id}`,
        evidenceRefs: [
          `wf_simplify_${context.run.id}`,
          'deterministic:workflow',
          ...collectOutcomeEvidence(context.previous).slice(0, 6),
        ],
        progressDetail: recovered,
        recoveredFrom: 'model_not_configured',
      },
    }
  }
  const workflow = buildMissionWorkflow(context.run.id)
  const runResults: WorkflowRun[] = []
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const runResult = await withTimeout(
      executeWorkflow(workflow, buildMissionInput(context)),
      WORKFLOW_EXECUTION_TIMEOUT_MS,
      'workflow_execution_timeout',
    ).catch((error) => buildSyntheticWorkflowFailure(workflow, error))
    runResults.push(runResult)
    if (runResult.status !== 'failed') {
      return {
        outputPreview: compact(formatWorkflowResults(runResult.results) || '工作流试跑完成。', 190),
        metadata: {
          serviceName: 'executeWorkflow',
          artifactId: runResult.id,
          evidenceRefs: [runResult.id, workflow.id, ...runResults.slice(0, -1).map((item) => item.id)],
          progressDetail: JSON.stringify({
            attempts: runResults.length,
            results: runResult.results,
          }),
        },
      }
    }
    const reason = workflowFailureReason(runResult)
    if (!isTransientWorkflowFailure(reason) || attempt === 1) break
    await wait(1800)
  }
  const runResult = runResults[runResults.length - 1]
  if (runResult.status === 'failed') {
    const partial = formatWorkflowResults(runResult.results)
    const reason = workflowFailureReason(runResult)
    if (isTransientWorkflowFailure(reason) && context.previous.length >= 2) {
      const recovered = buildDeterministicMissionBlueprint(context, 'workflow')
      return {
        outputPreview: compact(recovered, 900),
        metadata: {
          serviceName: 'executeWorkflow + deterministicRecovery',
          artifactId: runResult.id,
          evidenceRefs: [
            runResult.id,
            workflow.id,
            ...runResults.slice(0, -1).map((item) => item.id),
            ...collectOutcomeEvidence(context.previous).slice(0, 6),
          ],
          progressDetail: recovered,
          recoveredFrom: reason,
          attempts: runResults.length,
        },
      }
    }
    return {
      status: 'blocked',
      outputPreview: `Workflow Executor 未通过：${compact(reason, 150)}。已保留运行 ${runResult.id} 和部分回执，不能继续包装成完成。`,
      metadata: {
        serviceName: 'executeWorkflow',
        artifactId: runResult.id,
        evidenceRefs: [
          runResult.id,
          workflow.id,
          ...runResults.slice(0, -1).map((item) => item.id),
          runResult.failedStepId || runResult.results.__failedStepId || 'workflow-failed',
        ],
        blockingReason: `workflow_failed:${runResult.failedStepId || runResult.results.__failedStepId || 'unknown'}:${reason}`,
        progressDetail: JSON.stringify({
          error: reason,
          attempts: runResults.length,
          failedStepId: runResult.failedStepId || runResult.results.__failedStepId || '',
          partial,
          results: runResult.results,
        }),
      },
    }
  }
  throw new Error('workflow_result_unreachable')
}

async function defaultPlanSchedule(context: OpenbasakaMissionStepContext): Promise<MissionStepOutcome> {
  const rows = await query<{
    id: string
    name: string
    cron_expression: string
    task_type: string
    enabled: number
    next_run: string
  }>(
    'SELECT id, name, cron_expression, task_type, enabled, next_run FROM scheduled_tasks ORDER BY created_at DESC LIMIT 8',
  ).catch(() => [])
  const activeCount = rows.filter((row) => Number(row.enabled) === 1).length
  const recurring = SCHEDULER_ROUTE_PATTERN.test(context.demand)
  const proposal = recurring
    ? '检测到定时/持续推进需求：本轮只生成节律候选，不自动开启定时任务；满意后再由 Boss 明确确认。'
    : '没有检测到必须开启的周期任务，先保持人工推进。'
  return {
    outputPreview: `${proposal} 当前已有 ${rows.length} 个定时任务，启用 ${activeCount} 个。`,
    metadata: {
      serviceName: 'scheduled_tasks-preflight',
      evidenceRefs: rows.slice(0, 6).map((row) => `scheduled:${row.id}`),
      progressDetail: JSON.stringify({
        recurring,
        activeCount,
        candidates: rows.map((row) => ({
          id: row.id,
          name: row.name,
          cron: row.cron_expression,
          type: row.task_type,
          enabled: Boolean(row.enabled),
          nextRun: row.next_run,
        })),
        proposal,
      }),
    },
  }
}

async function defaultRunTeamCouncil(context: OpenbasakaMissionStepContext): Promise<MissionStepOutcome> {
  if (!isModelConfigured(context.llmConfig)) {
    return deterministicTeamCouncilOutcome(context, `team_deterministic_${context.run.id}`, [], [], 'model_not_configured')
  }
  let team: Team
  try {
    team = await createMissionTeam(context)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return deterministicTeamCouncilOutcome(context, `team_create_failed_${generateId()}`, [], [], reason)
  }
  const messages: TeamMessage[] = []
  let session: TeamSession
  try {
    session = await withTimeout(
      runTeamSession(
        team,
        buildMissionInput(context),
        (message) => messages.push(message),
      ),
      TEAM_SESSION_TIMEOUT_MS,
      'team_session_timeout',
    )
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return deterministicTeamCouncilOutcome(context, `team_timeout_${team.id}`, messages, [], reason)
  }
  const actions = await listTeamActions({ sessionId: session.id }).catch(() => [])
  const qualityBlocker = teamSessionQualityBlocker(session)
  if (qualityBlocker) {
    const repaired = await repairTeamCouncilOutcome(context, session, messages, actions, qualityBlocker)
    if (repaired) return repaired
    return deterministicTeamCouncilOutcome(context, session.id, messages, actions, qualityBlocker)
  }
  const blockers = actions.filter((action) => isBlockedTeamAction(action))
  if (blockers.length > 0) {
    return {
      status: 'blocked',
      outputPreview: `群策已完成，但发现 ${blockers.length} 个需要 Boss 明确确认的敏感动作：${blockers[0].title}`,
        metadata: {
          serviceName: 'runTeamSession',
          artifactId: session.id,
          evidenceRefs: [session.id, ...blockers.slice(0, 4).map((action) => action.id)],
        blockingReason: blockers.map((action) => `${action.title}｜${action.toolId}｜${actionBoundaryLabel(action.risk)}`).join('；'),
        progressDetail: compact(session.summary || messages.map((message) => message.content).join('\n'), 900),
      },
    }
  }
  return {
    outputPreview: compact(session.summary || '群策会话已完成。', 190),
    metadata: {
      serviceName: 'runTeamSession',
      artifactId: session.id,
      evidenceRefs: [session.id, ...messages.slice(-4).map((message) => message.id)],
      progressDetail: compact(session.summary || messages.map((message) => message.content).join('\n'), 1200),
    },
  }
}

async function repairTeamCouncilOutcome(
  context: OpenbasakaMissionStepContext,
  session: TeamSession,
  capturedMessages: TeamMessage[],
  actions: TeamAction[],
  qualityBlocker: string,
): Promise<MissionStepOutcome | null> {
  const teamEvidence = formatTeamMessagesForRepair(session, capturedMessages)
  if (!teamEvidence.trim()) return null

  try {
    const content = await chatCompletion(
      context.llmConfig,
      [
        {
          role: 'system',
          content:
            '你是 Openbasaka 的群策恢复合成器。群策主持人的最终成稿不稳定，但真实团队短评、前置回执和执行动作已经存在。你的任务不是假装原主持人成功，而是基于这些真实材料重新合成一份可交付成果。不要输出失败页，不要让用户继续补充，不要声称执行了没有证据的动作。用户可见正文不要提“主持失败、成稿不稳定、崩了、恢复合成”等内部故障词；这些只留在元数据证据里。普通产品构想不得被敏感动作拦住；只把删除、写文件、外发、账号、密钥、付款、权限变化列为需 Boss 点头的确认线。',
        },
        {
          role: 'user',
          content: [
            `Boss 原话：${context.demand}`,
            '',
            '## 前置真实回执',
            formatPreviousOutcomes(context.previous),
            '',
            '## 群策主持失败原因',
            qualityBlocker,
            '',
            '## 团队真实消息与短评',
            teamEvidence,
            '',
            actions.length
              ? `## 本轮动作候选\n${actions.map((action) => `- ${action.title}｜${action.toolId}｜${actionBoundaryLabel(action.risk)}｜${action.requiresApproval ? '需确认' : '可建议'}`).join('\n')}`
              : '## 本轮动作候选\n没有生成需要执行的外部动作。',
            '',
            '请输出一份给 Boss 看的最终群策成果，必须具体、有审美、有执行价值。若这是 App 或产品构想，请包含：产品名、一句话定位、目标用户、核心场景、关键界面、数据/权限、MVP 路线、项目落点、验证方式、下一步开工动作。',
          ].join('\n'),
        },
      ],
      0.38,
      2400,
    )
    if (!isUsableTeamRepair(content)) return null
    return {
      outputPreview: compact(content, 900),
      metadata: {
        serviceName: 'runTeamSession + repairSynthesis',
        artifactId: session.id,
        evidenceRefs: [
          session.id,
          'chatCompletion',
          context.llmConfig.model,
          ...capturedMessages.slice(-4).map((message) => message.id),
          ...actions.slice(0, 4).map((action) => action.id),
        ],
        progressDetail: content,
        recoveredFrom: qualityBlocker,
      },
    }
  } catch {
    return null
  }
}

async function defaultRunSelfAudit(context: OpenbasakaMissionStepContext): Promise<MissionStepOutcome> {
  const [counts, events, memories, decisions] = await Promise.all([
    loadOpenbasakaSelfAuditRuntimeCounts(),
    dbListOperatingEvents(24).catch(() => []),
    dbGetMemories(undefined, 24).catch(() => []),
    dbGetDecisions().catch(() => []),
  ])
  const report = buildOpenbasakaSelfAuditReport({
    projects: [],
    taxonomies: {},
    synapses: [],
    bossState: null,
    bossMemoryCount: memories.length,
    decisionCount: decisions.length,
    pendingArchiveCount: 0,
    operatingEvents: events,
    ...counts,
  })
  const weakest = report.domains.slice().sort((a, b) => a.score - b.score)[0]
  return {
    outputPreview: compact(`${report.headline}；最低领域：${weakest?.title || '暂无'}。${weakest?.summary || ''}`, 190),
    metadata: {
      serviceName: 'buildOpenbasakaSelfAuditReport',
      artifactId: report.id,
      evidenceRefs: [`audit:${report.id}`, `events:${events.length}`, `memories:${memories.length}`],
      progressDetail: JSON.stringify({
        overallScore: report.overallScore,
        headline: report.headline,
        weakest: weakest?.title,
        nextActions: weakest?.nextActions || [],
      }),
    },
  }
}

async function defaultTranslateForXiaobai(context: OpenbasakaMissionStepContext): Promise<MissionStepOutcome> {
  if (!isModelConfigured(context.llmConfig)) {
    const content = [
      '小白版下一步：',
      '1. 先看本轮结果里的产物入口和验证状态。',
      '2. 如果是定时任务，先试跑，满意后再手动开启。',
      '3. 如果需要模型生成正文、外发、写文件、删除或权限变更，必须先让 Boss 确认。',
      `4. 本轮需求：${compact(context.demand, 100)}`,
    ].join('\n')
    return {
      outputPreview: compact(content, 190),
      metadata: {
        serviceName: 'xiaobai-execution-translator + deterministicFallback',
        artifactId: context.run.id,
        evidenceRefs: ['deterministic:xiaobai', ...collectOutcomeEvidence(context.previous).slice(0, 6)],
        progressDetail: content,
        recoveredFrom: 'model_not_configured',
      },
    }
  }
  const content = await chatCompletion(
    context.llmConfig,
    [
      {
        role: 'system',
        content:
          '你是 Openbasaka 的小白执行翻译器。只基于本轮真实回执，把复杂结果翻译成 Boss 现在能判断、能点击、能执行的 3 到 5 个最小动作。不要声称执行了没有证据的事。',
      },
      {
        role: 'user',
        content: `Boss 原话：${context.demand}\n\n真实回执：\n${formatPreviousOutcomes(context.previous)}\n\n请输出小白可执行版。`,
      },
    ],
    0.22,
    900,
  )
  return {
    outputPreview: compact(content, 190),
    metadata: {
      serviceName: 'xiaobai-execution-translator',
      artifactId: context.run.id,
      evidenceRefs: ['chatCompletion', ...collectOutcomeEvidence(context.previous).slice(0, 6)],
      progressDetail: content,
    },
  }
}

function classifySimplifyDemand(demand: string): SimplifyMissionDeliverableKind {
  if (isWormholeLandlordAppDemand(demand)) return 'app'
  if (/iOS|SwiftUI|Xcode|App\b|应用|客户端|手机软件|小程序/i.test(demand)) return 'app'
  if (/PRD|产品需求|需求文档|产品文档|原型说明/i.test(demand)) return 'prd'
  if (/知识|资料|来源|证据|引用|调研|研究|视频|字幕|PDF|网页|notebook|wiki|神经元|突触|推演室|项目网络/i.test(demand)) return 'knowledge'
  if (/每天|每周|每月|定时|周期|自动化|自动推送|自动检查|提醒|复盘|夜巡|cron|schedule/i.test(demand)) {
    return 'automation'
  }
  return 'plan'
}

function buildSimplifyMissionDeliverable(
  context: OpenbasakaMissionStepContext,
  kind: SimplifyMissionDeliverableKind,
  content: string,
  appDelivery?: SimplifyAppDeliveryMaterialization,
  moduleDelivery?: SimplifyModuleMaterialization,
): SimplifyMissionDeliverable {
  const evidenceRefs = [
    'run:' + context.run.id,
    ...collectOutcomeEvidence(context.previous).slice(0, 8),
    ...(appDelivery?.evidenceRefs || []),
    ...(moduleDelivery?.evidenceRefs || []),
  ]
  const moduleArtifacts = moduleDelivery?.artifacts.length ? moduleDelivery.artifacts : undefined
  const baseLocation = `openbasaka_runs/${context.run.id}`
  const demandTitle = compact(context.demand, 34)

  if (kind === 'app') {
    const projectLocation = appDelivery?.projectLocation || simplifyAppProjectLocation(context.run.id)
    const platform = appDelivery?.platform || 'ios'
    const projectName = appDelivery?.projectName || (platform === 'macos' ? 'WormholeLandlord' : 'OpenbasakaBossApp')
    return {
      kind,
      platform,
      title: `App 开工包｜${demandTitle}`,
      summary: compact(content || '已把 App 需求整理成可开工路径。', 180),
      artifactLocation: `${baseLocation}#deliverable`,
      projectLocation,
      fileEntrypoints:
        platform === 'macos'
          ? [
              'Package.swift',
              'script/build_and_run.sh',
              `Sources/${projectName}/App/${projectName}App.swift`,
              `Sources/${projectName}/Stores/GameStore.swift`,
              `Tests/${projectName}Tests/LandlordRulesTests.swift`,
            ]
          : [
              `${projectName}.xcodeproj`,
              'README.md',
              `${projectName}App.swift`,
              'ContentView.swift',
              'Features/WorkflowPlan.swift',
            ],
      runCommand:
        appDelivery?.runCommand ||
        (platform === 'macos'
          ? `bash ${projectLocation}/script/build_and_run.sh --verify`
          : `open ${projectLocation}/OpenbasakaBossApp.xcodeproj；xcodebuild -project ${projectLocation}/OpenbasakaBossApp.xcodeproj -target OpenbasakaBossApp -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build`),
      verification:
        appDelivery?.verification ||
        (platform === 'macos'
          ? '本轮没有拿到桌面端文件写入能力，不能声称已创建或已运行 macOS App。'
          : '本轮没有拿到桌面端文件写入能力，不能声称已创建或已构建。'),
      statusLabel: appDelivery?.statusLabel || '等待桌面端创建',
      nextStep:
        appDelivery?.nextStep ||
        '在 Electron 桌面端重新运行本轮任务，生成 SwiftUI 工程并跑 xcodebuild。',
      evidenceRefs,
      createdFiles: appDelivery?.createdFiles,
      verificationCommand: appDelivery?.verificationCommand,
      moduleArtifacts,
    }
  }

  if (kind === 'prd') {
    return {
      kind,
      title: `PRD 交付包｜${demandTitle}`,
      summary: compact(content || '已生成 PRD 结构与验收线。', 180),
      artifactLocation: `${baseLocation}#prd`,
      projectLocation: '本轮记录与长期记忆',
      fileEntrypoints: ['PRD 正文', '验收标准', '风险与下一步'],
      runCommand: '在化繁为简结果面板查看；需要导出时再确认写入文件。',
      verification: '已由本轮自省检查；尚未经过真人评审。',
      statusLabel: '可评审',
      nextStep: '交给小白评审或外部真人评测，按反馈修订。',
      evidenceRefs,
      moduleArtifacts,
    }
  }

  if (kind === 'knowledge') {
    return {
      kind,
      title: `知识结果｜${demandTitle}`,
      summary: compact(content || '已完成知识路径整理。', 180),
      artifactLocation: `${baseLocation}#knowledge`,
      projectLocation: '知识＋大佬 / 记忆宫殿',
      fileEntrypoints: ['来源列表', '证据摘要', '可追问结论'],
      runCommand: '打开知识＋大佬查看来源；需要补证据时继续导入资料。',
      verification: evidenceRefs.some((ref) => ref.startsWith('wiki:')) ? '已有知识库来源参与本轮结果。' : '本轮没有拿到可引用来源，已在结果里标明。',
      statusLabel: '证据待查',
      nextStep: '补充来源或让知识库继续检索，再生成可引用版本。',
      evidenceRefs,
      moduleArtifacts,
    }
  }

  if (kind === 'automation') {
    return {
      kind,
      title: `自动化候选｜${demandTitle}`,
      summary: compact(content || '已生成自动化候选。', 180),
      artifactLocation: `${baseLocation}#automation`,
      projectLocation: '定时 / 运行记录',
      fileEntrypoints: [
        '任务边界',
        '触发节律',
        moduleDelivery?.scheduledTaskId ? `scheduled:${moduleDelivery.scheduledTaskId}` : '运行记录',
      ],
      runCommand: moduleDelivery?.scheduledTaskId
        ? '打开定时模块，先点“试跑”；满意后再手动开启。'
        : '先在定时模块试跑；启用前需要 Boss 明确确认。',
      verification: moduleDelivery?.scheduledTaskId
        ? '已生成禁用状态的定时候选；本轮没有自动开启。'
        : '本轮只生成候选，没有自动开启定时任务。',
      statusLabel: '待确认启用',
      nextStep: '确认频率、权限和输出位置后再启用。',
      evidenceRefs,
      moduleArtifacts,
    }
  }

  return {
    kind,
    title: `执行路径｜${demandTitle}`,
    summary: compact(content || '已把需求整理成可执行路径。', 180),
    artifactLocation: `${baseLocation}#plan`,
    projectLocation: '化繁为简本轮记录',
    fileEntrypoints: ['路线', '结果', '下一步'],
    runCommand: '按本轮路线继续推进；需要写文件或外部动作时先确认。',
    verification: '已完成本轮流程检查；外部交付需按下一步继续验证。',
    statusLabel: '可继续',
    nextStep: '从结果面板的下一步开始执行。',
    evidenceRefs,
    moduleArtifacts,
  }
}

function workflowTypeForSimplifyKind(kind: SimplifyMissionDeliverableKind): TeamWorkflowType {
  if (kind === 'app') return 'build'
  if (kind === 'prd') return 'prd'
  if (kind === 'knowledge') return 'research'
  if (kind === 'automation') return 'automation'
  return 'custom'
}

function workflowTargetsForSimplifyKind(kind: SimplifyMissionDeliverableKind): WorkflowStudioTarget[] {
  if (kind === 'automation') return ['scheduler', 'teams', 'xiaobai']
  if (kind === 'knowledge') return ['knowledge', 'teams', 'xiaobai']
  if (kind === 'prd') return ['teams', 'xiaobai', 'knowledge']
  if (kind === 'app') return ['teams', 'xiaobai']
  return ['teams', 'xiaobai']
}

function workflowStepsForSimplifyKind(kind: SimplifyMissionDeliverableKind, demand: string): string[] {
  if (kind === 'app' && isLumaSenseAppDemand(demand)) {
    return [
      '锁定 LumaSense 的视觉、心情、认知卡片、花园历史和每日复盘闭环',
      '把输入、情绪选择、生成结果、历史沉淀和复盘仪式拆成 SwiftUI 状态模型',
      '设计第一屏可直接操作的 iOS 垂直切片，不停留在 PRD 或欢迎页',
      '生成本地 Xcode 工程、运行脚本、构建日志和 Simulator 截图出口',
      '用 xcodebuild + simctl 完成构建、安装、启动、截图验收',
      '把本轮运行证据写回化繁为简结果，后续再接真实 AI 与持久化',
    ]
  }
  if (kind === 'app' && isWormholeLandlordAppDemand(demand)) {
    return [
      '锁定高压验收目标：用原创沙漠科幻 Mac 斗地主检验化繁为简和 Openbasaka 的真实编排能力',
      '拆出 macOS SwiftPM 工程、斗地主规则引擎、SwiftUI 桌面牌桌、AI 对手和规则测试',
      '生成本地 macOS App 工程、运行脚本、Codex Run 入口、构建日志和截图出口',
      '先跑 swift test 覆盖牌型、压制关系、发牌和胜负，再构建并启动 .app',
      '把运行证据写回化繁为简结果，评估模块路由、工作流落点和交付真实性',
    ]
  }
  if (kind === 'app' && isWeatherBagAppDemand(demand)) {
    return [
      '锁定天气、女性外出场景和包包清单的真实目标',
      '把当地天气、场景模式、包包物品和打钩状态拆成产品模型',
      '设计首屏天气卡、场景选择、清单分组、完成度和全武装出门反馈',
      '标注定位、天气 API、健康安全建议和隐私权限边界',
      '生成 SwiftUI 工程并运行 xcodebuild 验证',
      '把本轮经验写回记忆，后续迭代接入真实天气数据',
    ]
  }
  if (kind === 'app') {
    return [
      '锁定 App 的真实目标、用户和第一天留存理由',
      '设计首屏、核心状态流、失败态和验收线',
      '拆分 SwiftUI 工程结构、数据模型、权限和测试命令',
      '生成本地工程并尝试构建验证',
      '写回运行证据和下一轮开发任务',
    ]
  }
  if (kind === 'automation') {
    return [
      '锁定周期任务的输入、频率、输出和禁止动作',
      '生成禁用状态的定时候选，避免未经确认自动运行',
      '先试跑一次并检查 cron_execution_log',
      '满意后由 Boss 手动开启定时',
      '把每次运行回执写入 operating_events',
    ]
  }
  if (kind === 'knowledge') {
    return [
      '接收网页、视频、PDF、截图或笔记等素材',
      '抽取来源、证据、可疑点和待补材料',
      '生成知识包、学习包或可追问结论',
      '写入知识＋大佬与记忆宫殿的复用入口',
      '安排必要的复盘或补证据动作',
    ]
  }
  if (kind === 'prd') {
    return [
      '锁定目标用户、核心场景和成功标准',
      '拆出功能范围、非目标和关键交互',
      '生成 PRD、验收标准、风险和下一步任务',
      '交给群策或小白评审',
      '按反馈形成 v2',
    ]
  }
  return [
    '读懂 Boss 输入和边界',
    '选择必要模块并跳过无关模块',
    '生成可执行步骤和验收标准',
    '检查风险、证据和下一步',
    '写入长期记忆与可复用流程',
  ]
}

function cronForSimplifyDemand(demand: string): string {
  if (/每周|weekly|周报|周更/i.test(demand)) return '0 9 * * 1'
  if (/每月|monthly|月报/i.test(demand)) return '0 9 1 * *'
  if (/每小时|hourly|小时/i.test(demand)) return '0 * * * *'
  if (/晚上|夜巡|夜间|凌晨/i.test(demand)) return '0 22 * * *'
  return '0 9 * * *'
}

function scheduledTaskNameForSimplifyDemand(demand: string): string {
  if (/自省|学习进度|进化进度|OpenBasaka|openbasaka/i.test(demand)) return '化繁为简候选｜OpenBasaka 自省'
  if (/知识|视频|网页|复盘|学习包/i.test(demand)) return '化繁为简候选｜知识复盘'
  return `化繁为简候选｜${compact(demand, 24)}`
}

async function upsertSimplifyScheduledCandidate(params: {
  context: OpenbasakaMissionStepContext
  workflowStudioId: string
  content: string
}): Promise<string> {
  const taskConfig: Record<string, string> = {
    prompt: params.context.demand,
    goal: params.context.demand,
    simplifyRunId: params.context.run.id,
    workflowStudioId: params.workflowStudioId,
    workflowCatalogId: `studio:${params.workflowStudioId}`,
    workflowSource: 'simplify',
    resultSummary: compact(params.content, 360),
  }
  const rows = await query<Record<string, unknown>>('SELECT id, task_config_json FROM scheduled_tasks ORDER BY created_at DESC').catch(() => [])
  const existing = rows.find((row) => {
    try {
      const parsed = JSON.parse(String(row.task_config_json || '{}')) as Record<string, unknown>
      return parsed.simplifyRunId === params.context.run.id
    } catch {
      return false
    }
  })
  const payload = {
    name: scheduledTaskNameForSimplifyDemand(params.context.demand),
    cronExpression: cronForSimplifyDemand(params.context.demand),
    taskConfig,
    enabled: false,
    agentId: 'general',
    platformTargets: [],
  }
  if (existing?.id) {
    await updateScheduledTask(String(existing.id), {
      ...payload,
      taskConfig,
    })
    return String(existing.id)
  }
  return createScheduledTask({
    ...payload,
    taskType: 'custom',
  })
}

async function materializeSimplifyModuleArtifacts(
  context: OpenbasakaMissionStepContext,
  kind: SimplifyMissionDeliverableKind,
  content: string,
): Promise<SimplifyModuleMaterialization> {
  const artifacts: SimplifyMissionModuleArtifact[] = []
  const evidenceRefs: string[] = []
  const workflowName =
    kind === 'app' && isWormholeLandlordAppDemand(context.demand)
      ? 'Sandstorm Landlord macOS App 高压验收流程'
      : kind === 'app' && isLumaSenseAppDemand(context.demand)
      ? 'LumaSense iOS App 真运行流程'
      : kind === 'app' && isWeatherBagAppDemand(context.demand)
        ? '包里晴雨 iOS App 开工流程'
        : `化繁为简｜${compact(context.demand, 28)}`
  const workflowType = workflowTypeForSimplifyKind(kind)
  const steps = workflowStepsForSimplifyKind(kind, context.demand)
  const workflowStudioId = await saveWorkflowStudioItem({
    id: `wfs_simplify_${context.run.id}`,
    name: workflowName,
    goal: context.demand,
    workflowType,
    teamId: '',
    promptTemplate: generatePromptTemplateFromWorkflow({
      name: workflowName,
      goal: context.demand,
      workflowType,
      steps,
    }),
    steps,
    targetConsumers: workflowTargetsForSimplifyKind(kind),
  })
  artifacts.push({
    kind: 'workflow-studio',
    id: workflowStudioId,
    label: '工作流草稿',
    location: '工作流',
    status: '待试跑',
  })
  evidenceRefs.push(`workflow:${workflowStudioId}`)

  let scheduledTaskId = ''
  if (kind === 'automation' || SCHEDULER_ROUTE_PATTERN.test(context.demand)) {
    scheduledTaskId = await upsertSimplifyScheduledCandidate({ context, workflowStudioId, content })
    artifacts.push({
      kind: 'scheduled-task',
      id: scheduledTaskId,
      label: '定时候选',
      location: '定时',
      status: '禁用，待 Boss 试跑后开启',
      enabled: false,
    })
    evidenceRefs.push(`scheduled:${scheduledTaskId}`)
  }

  await dbSaveOperatingEvent({
    id: `op_simplify_artifacts_${context.run.id}_${Date.now()}`,
    type: 'agent_action',
    stage: 'execute',
    agentId: 'simplify',
    title: `化繁为简｜生成模块落点`,
    status: 'completed',
    resultPreview: artifacts.map((artifact) => `${artifact.label}:${artifact.id}`).join('；'),
    source: { kind: 'agent', sourceId: context.run.id, title: context.run.title },
    toolRefs: ['workflow_studio_items', scheduledTaskId ? 'scheduled_tasks' : ''].filter(Boolean),
    entities: ['simplify', 'workflow-studio', scheduledTaskId ? 'scheduler-candidate' : 'workflow-draft'].filter(Boolean),
    createdAt: new Date().toISOString(),
  }).catch(() => undefined)

  return {
    artifacts,
    workflowStudioId,
    scheduledTaskId: scheduledTaskId || undefined,
    evidenceRefs,
  }
}

function getElectronDeliveryApi(): ElectronDeliveryApi | null {
  if (typeof window === 'undefined') return null
  return ((window as unknown as { electronAPI?: ElectronDeliveryApi }).electronAPI || null)
}

function simplifyAppProjectLocation(runId: string): string {
  return `/Users/apple/Desktop/【项目的游戏】/deliveries/${runId}/ios-app`
}

function simplifyMacAppProjectLocation(runId: string): string {
  return `/Users/apple/Desktop/【项目的游戏】/deliveries/${runId}/macos-app`
}

function isWormholeLandlordAppDemand(demand: string): boolean {
  return /斗地主|Dou\s*Dizhu|Landlord|扑克牌|牌局|叫地主|抢地主|沙丘|沙漠|沙海|星际|虫洞|黑洞|interstellar|wormhole/i.test(demand)
}

function simplifyAppPlatform(demand: string): SimplifyAppPlatform {
  if (isWormholeLandlordAppDemand(demand)) return 'macos'
  if (/(macOS|Mac\s*版|Mac版本|Mac\s*App|桌面端|桌面版|电脑端|独立\s*Mac)/i.test(demand) && !/iOS|iPhone|手机|小程序/i.test(demand)) {
    return 'macos'
  }
  return 'ios'
}

function isWeatherBagAppDemand(demand: string): boolean {
  return /女性|女生|女孩|出门|外出|包包|包里|天气|雨伞|防晒|随身|清单|打钩|全武装/i.test(demand)
}

function isLumaSenseAppDemand(demand: string): boolean {
  return /LumaSense|视觉意识|认知卡片|花园历史|每日复盘|心情|情绪|画面|感受|认知花园/i.test(demand)
}

function buildLumaSenseUiStyleContext(demand: string) {
  return buildUiMuseumPrdContext(
    [
      demand,
      'iOS 原生 SwiftUI App，必须适配 iPhone 17 Pro Max、Dynamic Island、安全区、底部手势条和现代手机屏占比。',
      '产品气质是情绪自适应、视觉意识、个人认知花园、低压但高审美的每日复盘工具。',
      '拒绝旧 iPhone letterbox、落伍大卡片欢迎页、模板化深色壳和不可用流程。',
    ].join('\n'),
    ['emotion-adaptive', 'liquid-glass', 'spatial'],
  )
}

function simplifyAppProjectName(demand: string, platform: SimplifyAppPlatform = simplifyAppPlatform(demand)): string {
  if (platform === 'macos' && isWormholeLandlordAppDemand(demand)) return 'WormholeLandlord'
  if (platform === 'macos') return 'OpenbasakaMacApp'
  if (isLumaSenseAppDemand(demand)) return 'LumaSense'
  if (isWeatherBagAppDemand(demand)) return 'WeatherBagChecklist'
  return 'OpenbasakaBossApp'
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function bundleSuffixForRun(runId: string): string {
  return runId.replace(/[^A-Za-z0-9]/g, '').toLowerCase().slice(-14) || 'mission'
}

async function writeDeliveryFile(api: ElectronDeliveryApi, filePath: string, content: string): Promise<void> {
  if (!api.writeFile) throw new Error('desktop_file_writer_unavailable')
  const result = await api.writeFile(filePath, content)
  if (result && result.success === false) throw new Error(result.error || `write_failed:${filePath}`)
}

function normalizeCommandResult(
  result: Awaited<ReturnType<NonNullable<ElectronDeliveryApi['executeCommand']>>>,
): { success: boolean; stdout: string; stderr: string; error: string } {
  if (typeof result === 'string') {
    return { success: result.trim().length > 0, stdout: result, stderr: '', error: '' }
  }
  return {
    success: result?.success !== false && Number(result?.exitCode || 0) === 0,
    stdout: result?.stdout || '',
    stderr: result?.stderr || '',
    error: result?.error || '',
  }
}

function extractCommandOutputValue(output: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = output.match(new RegExp(`^${escaped}=(.+)$`, 'm'))
  return match?.[1]?.trim() || ''
}

async function materializeSimplifyAppDelivery(
  context: OpenbasakaMissionStepContext,
  synthesis: string,
): Promise<SimplifyAppDeliveryMaterialization> {
  const platform = simplifyAppPlatform(context.demand)
  const projectName = simplifyAppProjectName(context.demand, platform)
  const projectLocation = platform === 'macos' ? simplifyMacAppProjectLocation(context.run.id) : simplifyAppProjectLocation(context.run.id)
  const xcodeProjectPath = platform === 'macos' ? `${projectLocation}/Package.swift` : `${projectLocation}/${projectName}.xcodeproj`
  const verificationScriptPath =
    platform === 'macos' ? `${projectLocation}/script/build_and_run.sh` : `${projectLocation}/scripts/build-and-run.mjs`
  const verificationCommand =
    platform === 'macos' ? `bash ${shellQuote(verificationScriptPath)} --verify` : `node ${shellQuote(verificationScriptPath)}`
  const runCommand = platform === 'macos' ? verificationCommand : `open ${shellQuote(xcodeProjectPath)}；${verificationCommand}`
  const api = getElectronDeliveryApi()
  const baseEvidence = [`delivery:${context.run.id}`, `project:${projectLocation}`]

  if (!api?.writeFile) {
    return {
      materialized: false,
      platform,
      projectName,
      projectLocation,
      xcodeProjectPath,
      createdFiles: [],
      runCommand,
      verificationCommand,
      verification:
        platform === 'macos'
          ? '浏览器预览环境没有文件写入能力；本轮没有创建本地 macOS SwiftPM 工程，也没有启动 Mac App。'
          : '浏览器预览环境没有文件写入能力；本轮没有创建本地 Xcode 项目，也没有跑 Simulator。',
      statusLabel: '等待桌面端创建',
      nextStep:
        platform === 'macos'
          ? '在 Electron 桌面端重新运行，系统会写入 macOS SwiftUI 工程并尝试构建、启动和进程验证。'
          : '在 Electron 桌面端重新运行，系统会写入 SwiftUI 工程并尝试构建、安装、启动和截图。',
      evidenceRefs: [...baseEvidence, 'electronAPI.writeFile:missing'],
      error: 'electron_write_file_unavailable',
    }
  }

  const files = buildSimplifyAppDeliveryFiles({
    platform,
    projectLocation,
    projectName,
    bundleId: `com.openbasaka.simplify.${bundleSuffixForRun(context.run.id)}`,
    demand: context.demand,
    synthesis,
    runId: context.run.id,
  })
  const createdFiles: string[] = []

  try {
    for (const file of files) {
      await writeDeliveryFile(api, file.path, file.content)
      createdFiles.push(file.relativePath)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      materialized: false,
      platform,
      projectName,
      projectLocation,
      xcodeProjectPath,
      createdFiles,
      runCommand,
      verificationCommand,
      verification: `写入 SwiftUI 项目时受阻：${compact(message, 120)}。已保留本轮记录，不能声称已生成工程。`,
      statusLabel: '写入受阻',
      nextStep: '检查桌面端文件权限后重新运行本轮任务。',
      evidenceRefs: [...baseEvidence, 'electronAPI.writeFile:failed'],
      error: message,
    }
  }

  if (!api.executeCommand) {
    return {
      materialized: true,
      platform,
      projectName,
      projectLocation,
      xcodeProjectPath,
      createdFiles,
      runCommand,
      verificationCommand,
	      verification:
	        platform === 'macos'
	          ? `已写入 ${createdFiles.length} 个 macOS SwiftPM/SwiftUI 项目文件；当前桌面端没有命令执行能力，尚未跑构建、启动和进程验证。`
	          : `已写入 ${createdFiles.length} 个 SwiftUI/Xcode 项目文件；当前桌面端没有命令执行能力，尚未跑构建、安装、启动和截图。`,
	      statusLabel: '源码已生成',
	      nextStep:
	        platform === 'macos'
	          ? '用 Xcode 打开 Package.swift，或复制运行命令做一次 macOS App 真运行验收。'
	          : '用 Xcode 打开工程，或复制运行命令做一次 Simulator 真运行验收。',
      evidenceRefs: [...baseEvidence, 'electronAPI.writeFile:ok', `files:${createdFiles.length}`],
    }
  }

  try {
	    const rawResult = await api.executeCommand(verificationCommand, 900_000)
	    const buildResult = normalizeCommandResult(rawResult)
	    if (buildResult.success) {
	      const combinedOutput = [buildResult.stdout, buildResult.stderr].filter(Boolean).join('\n')
	      const deviceLine = extractCommandOutputValue(combinedOutput, 'device')
	      const processLine = extractCommandOutputValue(combinedOutput, 'process')
	      const appLine = extractCommandOutputValue(combinedOutput, 'app')
	      const screenshotLine = extractCommandOutputValue(combinedOutput, 'screenshot')
	      const logLine = extractCommandOutputValue(combinedOutput, 'log')
	      return {
	        materialized: true,
        platform,
        projectName,
        projectLocation,
        xcodeProjectPath,
        createdFiles,
        runCommand,
        verificationCommand,
	        verification: [
	          platform === 'macos'
	            ? `已写入 ${createdFiles.length} 个项目文件，并完成 macOS App 真运行：SwiftPM 测试、构建、.app 打包、启动和进程验证均通过。`
	            : `已写入 ${createdFiles.length} 个项目文件，并完成 iOS Simulator 真运行：xcodebuild 构建、安装、启动、截图均通过。`,
	          deviceLine ? `设备：${deviceLine}` : '',
	          processLine ? `进程：${processLine}` : '',
	          appLine ? `App：${appLine}` : '',
	          screenshotLine ? `截图：${screenshotLine}` : '',
	          logLine ? `日志：${logLine}` : '',
	        ].filter(Boolean).join(' '),
	        statusLabel: platform === 'macos' ? 'Mac 真运行通过' : '真机链路通过',
	        nextStep: platform === 'macos' ? '打开 Package.swift 或运行脚本继续打磨牌局体验。' : '打开 Xcode 工程查看源码，或用截图和日志做本轮验收复盘。',
	        evidenceRefs: [
	          ...baseEvidence,
	          'electronAPI.writeFile:ok',
	          platform === 'macos' ? 'swift-test:passed' : 'xcodebuild:passed',
	          platform === 'macos' ? 'macos-app:launched' : 'simctl:launched',
	          screenshotLine ? `screenshot:${screenshotLine}` : '',
	          logLine ? `log:${logLine}` : '',
	          `files:${createdFiles.length}`,
	        ].filter(Boolean),
	      }
	    }
	    const reason = compact([buildResult.error, buildResult.stderr, buildResult.stdout].filter(Boolean).join('\n'), 180)
    return {
      materialized: true,
      platform,
      projectName,
      projectLocation,
      xcodeProjectPath,
      createdFiles,
      runCommand,
      verificationCommand,
	      verification: `已写入 ${createdFiles.length} 个项目文件；构建/安装/启动/截图链路未通过：${reason || '未知错误'}。`,
	      statusLabel: '源码已生成，真运行受阻',
	      nextStep: '查看 scripts/build-and-run.mjs 输出和 artifacts/native-build.log，先修 Xcode/Simulator 或编译错误。',
	      evidenceRefs: [...baseEvidence, 'electronAPI.writeFile:ok', platform === 'macos' ? 'macos-run:failed' : 'simulator-run:failed', `files:${createdFiles.length}`],
      error: reason,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      materialized: true,
      platform,
      projectName,
      projectLocation,
      xcodeProjectPath,
      createdFiles,
      runCommand,
      verificationCommand,
	      verification:
	        platform === 'macos'
	          ? `已写入 ${createdFiles.length} 个项目文件；调用 macOS 真运行脚本时受阻：${compact(message, 160)}。`
	          : `已写入 ${createdFiles.length} 个项目文件；调用 Simulator 真运行脚本时受阻：${compact(message, 160)}。`,
	      statusLabel: '源码已生成，验证受阻',
	      nextStep: platform === 'macos' ? '确认 Xcode.app 可用后，复制运行命令重新验证。' : '确认 Xcode/Simulator 可用后，复制运行命令重新验证。',
	      evidenceRefs: [...baseEvidence, 'electronAPI.writeFile:ok', platform === 'macos' ? 'macos-run:error' : 'simulator-run:error', `files:${createdFiles.length}`],
      error: message,
    }
  }
}

function buildSimplifyAppDeliveryFiles(params: {
  platform: SimplifyAppPlatform
  projectLocation: string
  projectName: string
  bundleId: string
  demand: string
  synthesis: string
  runId: string
}): Array<{ relativePath: string; path: string; content: string }> {
  if (params.platform === 'macos') return buildSimplifyMacAppDeliveryFiles(params)
  const appDir = params.projectName
  const files = [
    {
      relativePath: 'README.md',
      content: buildSimplifyAppReadme(params),
    },
    {
      relativePath: `${params.projectName}.xcodeproj/project.pbxproj`,
      content: buildSimplifyAppPbxproj(params.projectName, params.bundleId),
    },
    {
      relativePath: `${appDir}/${params.projectName}App.swift`,
      content: buildSimplifyAppEntrySwift(params.projectName),
    },
    {
      relativePath: `${appDir}/ContentView.swift`,
      content: buildSimplifyAppContentSwift(params.demand),
    },
    {
      relativePath: `${appDir}/Features/WorkflowPlan.swift`,
      content: buildSimplifyAppWorkflowSwift(params.demand, params.synthesis, params.runId),
    },
    {
      relativePath: `${appDir}/LaunchScreen.storyboard`,
      content: buildSimplifyLaunchScreenStoryboard(params.projectName, params.demand),
    },
    {
      relativePath: 'scripts/build-and-run.mjs',
      content: buildSimplifyAppRunScript(params),
    },
    {
      relativePath: `${appDir}/Assets.xcassets/Contents.json`,
      content: JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2),
    },
    {
      relativePath: `${appDir}/Assets.xcassets/AccentColor.colorset/Contents.json`,
      content: JSON.stringify(
        {
          colors: [
            {
              color: {
                'color-space': 'srgb',
                components: { alpha: '1.000', blue: '0.420', green: '0.280', red: '0.120' },
              },
              idiom: 'universal',
            },
          ],
          info: { author: 'xcode', version: 1 },
        },
        null,
        2,
      ),
    },
    {
      relativePath: `${appDir}/Assets.xcassets/AppIcon.appiconset/Contents.json`,
      content: JSON.stringify({ images: [], info: { author: 'xcode', version: 1 } }, null, 2),
    },
  ]
  return files.map((file) => ({ ...file, path: `${params.projectLocation}/${file.relativePath}` }))
}

function buildSimplifyMacAppDeliveryFiles(params: {
  projectLocation: string
  projectName: string
  bundleId: string
  demand: string
  synthesis: string
  runId: string
}): Array<{ relativePath: string; path: string; content: string }> {
  const targetRoot = `Sources/${params.projectName}`
  const testRoot = `Tests/${params.projectName}Tests`
  const files = [
    {
      relativePath: 'README.md',
      content: buildWormholeLandlordReadme(params),
    },
    {
      relativePath: 'Package.swift',
      content: buildWormholeLandlordPackageSwift(params.projectName),
    },
    {
      relativePath: 'script/build_and_run.sh',
      content: buildWormholeLandlordRunScript(params),
    },
    {
      relativePath: '.codex/environments/environment.toml',
      content: buildWormholeLandlordCodexEnvironment(params.projectName),
    },
    {
      relativePath: `${targetRoot}/App/${params.projectName}App.swift`,
      content: buildWormholeLandlordAppSwift(params),
    },
    {
      relativePath: `${targetRoot}/Models/CardModels.swift`,
      content: buildWormholeLandlordCardModelsSwift(),
    },
    {
      relativePath: `${targetRoot}/Services/LandlordRules.swift`,
      content: buildWormholeLandlordRulesSwift(),
    },
    {
      relativePath: `${targetRoot}/Stores/GameStore.swift`,
      content: buildWormholeLandlordGameStoreSwift(),
    },
    {
      relativePath: `${targetRoot}/Views/ContentView.swift`,
      content: buildWormholeLandlordContentViewSwift(),
    },
    {
      relativePath: `${targetRoot}/Views/GameTableView.swift`,
      content: buildWormholeLandlordGameTableViewSwift(),
    },
    {
      relativePath: `${targetRoot}/Views/InspectorView.swift`,
      content: buildWormholeLandlordInspectorViewSwift(),
    },
    {
      relativePath: `${targetRoot}/Support/WormholeTheme.swift`,
      content: buildWormholeLandlordThemeSwift(),
    },
    {
      relativePath: `${testRoot}/LandlordRulesTests.swift`,
      content: buildWormholeLandlordRulesTestsSwift(params.projectName),
    },
  ]
  return files.map((file) => ({ ...file, path: `${params.projectLocation}/${file.relativePath}` }))
}

function buildWormholeLandlordReadme(params: {
  projectName: string
  projectLocation: string
  demand: string
  synthesis: string
  runId: string
}): string {
  return [
    '# Sandstorm Landlord / 沙海斗地主',
    '',
    'Openbasaka 化繁为简生成的 macOS SwiftUI App 高压验收包。游戏只是测试载荷，核心验收目标是证明化繁为简能够把 Boss 的一句话变成真实可运行的桌面产物，并留下构建、运行、规则测试和历史证据。',
    '',
    `- Run ID: ${params.runId}`,
    `- Boss 需求: ${params.demand}`,
    `- 项目目录: ${params.projectLocation}`,
    `- Xcode 入口: ${params.projectLocation}/Package.swift`,
    `- 运行脚本: ${params.projectLocation}/script/build_and_run.sh`,
    `- 构建日志: ${params.projectLocation}/artifacts/native-macos-build.log`,
    `- 截图尝试: ${params.projectLocation}/artifacts/native-macos-window.png`,
    '',
    '## 当前已落地',
    '',
    '- 独立 macOS SwiftPM + SwiftUI App，采用原创沙漠科幻视觉，不依赖电影素材、Logo 或人物。',
    '- 54 张牌、三名玩家、地主牌、叫地主/不叫、出牌、过牌、胜负判定。',
    '- 规则引擎覆盖单张、对子、三张、三带一、顺子、连对、炸弹、火箭。',
    '- 基础 AI 会按合法牌型出牌或过牌，不会绕过规则。',
    '- 桌面体验包含沙海主牌桌、右侧 inspector、回合日志、规则面板、工具栏和键盘快捷键。',
    '- `swift test` 先跑规则测试，再构建并启动 `.app`。',
    '',
    '## 运行',
    '',
    `1. 打开 Xcode: \`open ${shellQuote(`${params.projectLocation}/Package.swift`)}\``,
    `2. 真运行验收: \`bash ${shellQuote(`${params.projectLocation}/script/build_and_run.sh`)} --verify\``,
    `3. 普通启动: \`bash ${shellQuote(`${params.projectLocation}/script/build_and_run.sh`)}\``,
    '',
    '## 顶级验收线',
    '',
    '- 不是 README 演示，必须通过 SwiftPM 规则测试和 macOS 进程验证。',
    '- 视觉必须读成原创沙漠科幻牌桌，而不是旧模板或普通深色壳。',
    '- 进入窗口后直接可玩，不做欢迎页。',
    '- 非法出牌必须被拦截并写入日志。',
    '- 运行证据必须回写到化繁为简结果面板。',
    '',
    '## 本轮方案摘要',
    '',
    params.synthesis || '本轮方案见化繁为简结果面板。',
  ].join('\n')
}

function buildWormholeLandlordPackageSwift(projectName: string): string {
  return `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "${projectName}",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "${projectName}", targets: ["${projectName}"])
    ],
    targets: [
        .executableTarget(
            name: "${projectName}",
            path: "Sources/${projectName}"
        ),
        .testTarget(
            name: "${projectName}Tests",
            dependencies: ["${projectName}"],
            path: "Tests/${projectName}Tests"
        )
    ]
)
`
}

function buildWormholeLandlordRunScript(params: {
  projectName: string
  bundleId: string
}): string {
  return `#!/usr/bin/env bash
set -euo pipefail

MODE="\${1:-run}"
APP_NAME="${params.projectName}"
BUNDLE_ID="${params.bundleId}"
MIN_SYSTEM_VERSION="14.0"
DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"

ROOT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
ARTIFACTS_DIR="$ROOT_DIR/artifacts"
LOG_FILE="$ARTIFACTS_DIR/native-macos-build.log"
SCREENSHOT="$ARTIFACTS_DIR/native-macos-window.png"
APP_BUNDLE="$DIST_DIR/$APP_NAME.app"
APP_CONTENTS="$APP_BUNDLE/Contents"
APP_MACOS="$APP_CONTENTS/MacOS"
APP_BINARY="$APP_MACOS/$APP_NAME"
INFO_PLIST="$APP_CONTENTS/Info.plist"

mkdir -p "$ARTIFACTS_DIR"
: >"$LOG_FILE"

log() {
  printf "%s\\n" "$*" | tee -a "$LOG_FILE"
}

run() {
  log "$ $*"
  DEVELOPER_DIR="$DEVELOPER_DIR" "$@" 2>&1 | tee -a "$LOG_FILE"
}

if [[ ! -x "$DEVELOPER_DIR/usr/bin/xcodebuild" ]]; then
  log "missing Xcode at $DEVELOPER_DIR"
  exit 1
fi

pkill -x "$APP_NAME" >/dev/null 2>&1 || true

cd "$ROOT_DIR"
run swift test
run swift build
BUILD_BINARY="$(DEVELOPER_DIR="$DEVELOPER_DIR" swift build --show-bin-path)/$APP_NAME"

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_MACOS"
cp "$BUILD_BINARY" "$APP_BINARY"
chmod +x "$APP_BINARY"

cat >"$INFO_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>$APP_NAME</string>
  <key>CFBundleIdentifier</key>
  <string>$BUNDLE_ID</string>
  <key>CFBundleName</key>
  <string>Sandstorm Landlord</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>$MIN_SYSTEM_VERSION</string>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
</dict>
</plist>
PLIST

open_app() {
  /usr/bin/open -n "$APP_BUNDLE"
}

case "$MODE" in
  run)
    open_app
    ;;
  --debug|debug)
    lldb -- "$APP_BINARY"
    ;;
  --logs|logs)
    open_app
    /usr/bin/log stream --info --style compact --predicate "process == \\"$APP_NAME\\""
    ;;
  --telemetry|telemetry)
    open_app
    /usr/bin/log stream --info --style compact --predicate "subsystem == \\"$BUNDLE_ID\\""
    ;;
  --verify|verify)
    open_app
    sleep 2
    pgrep -x "$APP_NAME" >/dev/null
    /usr/sbin/screencapture -x "$SCREENSHOT" >/dev/null 2>&1 || true
    log "Sandstorm Landlord macOS build and launch passed"
    echo "process=$APP_NAME"
    echo "app=$APP_BUNDLE"
    if [[ -s "$SCREENSHOT" ]]; then
      echo "screenshot=$SCREENSHOT"
    fi
    echo "log=$LOG_FILE"
    ;;
  *)
    echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac
`
}

function buildWormholeLandlordCodexEnvironment(projectName: string): string {
  return `# THIS IS AUTOGENERATED. DO NOT EDIT MANUALLY
version = 1
name = "${projectName}"

[setup]
script = ""

[[actions]]
name = "Run"
icon = "run"
command = "./script/build_and_run.sh"
`
}

function buildWormholeLandlordAppSwift(params: {
  projectName: string
  bundleId: string
}): string {
  return `import AppKit
import SwiftUI

@main
struct ${params.projectName}App: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var store = LandlordGameStore()

    var body: some Scene {
        WindowGroup("Sandstorm Landlord") {
            ContentView(store: store)
                .frame(minWidth: 1180, minHeight: 760)
        }
        .commands {
            CommandMenu("Sandstorm Landlord") {
                Button("New Deal") {
                    store.startNewRound()
                }
                .keyboardShortcut("n")

                Button("Hint") {
                    store.selectHint()
                }
                .keyboardShortcut("h")

                Button("Pass") {
                    store.passTurn()
                }
                .keyboardShortcut(.space, modifiers: [])
            }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }
}
`
}

function buildWormholeLandlordCardModelsSwift(): string {
  return `import Foundation
import SwiftUI

enum Suit: String, CaseIterable, Codable {
    case spades
    case hearts
    case clubs
    case diamonds
    case joker

    var symbol: String {
        switch self {
        case .spades: return "♠"
        case .hearts: return "♥"
        case .clubs: return "♣"
        case .diamonds: return "♦"
        case .joker: return "★"
        }
    }

    var color: Color {
        switch self {
        case .hearts, .diamonds: return WormholeTheme.redSuit
        case .joker: return WormholeTheme.gold
        default: return WormholeTheme.ink
        }
    }
}

enum Rank: Int, CaseIterable, Comparable, Codable {
    case three = 3
    case four = 4
    case five = 5
    case six = 6
    case seven = 7
    case eight = 8
    case nine = 9
    case ten = 10
    case jack = 11
    case queen = 12
    case king = 13
    case ace = 14
    case two = 15
    case blackJoker = 16
    case redJoker = 17

    static func < (lhs: Rank, rhs: Rank) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    var label: String {
        switch self {
        case .jack: return "J"
        case .queen: return "Q"
        case .king: return "K"
        case .ace: return "A"
        case .two: return "2"
        case .blackJoker: return "BLACK"
        case .redJoker: return "RED"
        default: return String(rawValue)
        }
    }
}

struct PlayingCard: Identifiable, Hashable, Comparable, Codable {
    let suit: Suit
    let rank: Rank

    var id: String { "\\(suit.rawValue)-\\(rank.rawValue)" }
    var shortLabel: String { rank == .blackJoker || rank == .redJoker ? rank.label : rank.label + suit.symbol }

    static func < (lhs: PlayingCard, rhs: PlayingCard) -> Bool {
        if lhs.rank == rhs.rank {
            return lhs.suit.rawValue < rhs.suit.rawValue
        }
        return lhs.rank < rhs.rank
    }

    static func deck() -> [PlayingCard] {
        let normalRanks: [Rank] = [.three, .four, .five, .six, .seven, .eight, .nine, .ten, .jack, .queen, .king, .ace, .two]
        var cards = Suit.allCases
            .filter { $0 != .joker }
            .flatMap { suit in normalRanks.map { PlayingCard(suit: suit, rank: $0) } }
        cards.append(PlayingCard(suit: .joker, rank: .blackJoker))
        cards.append(PlayingCard(suit: .joker, rank: .redJoker))
        return cards
    }
}

enum Seat: String, CaseIterable, Identifiable, Codable {
    case left
    case player
    case right

    var id: String { rawValue }

    var title: String {
        switch self {
        case .left: return "Dune Scout AI"
        case .player: return "Boss"
        case .right: return "Storm Oracle AI"
        }
    }

    var shortTitle: String {
        switch self {
        case .left: return "Scout"
        case .player: return "Boss"
        case .right: return "Oracle"
        }
    }

    var isHuman: Bool { self == .player }
}

enum PlayKind: String, Codable {
    case pass
    case single
    case pair
    case triple
    case tripleWithSingle
    case straight
    case pairSequence
    case bomb
    case rocket

    var label: String {
        switch self {
        case .pass: return "Pass"
        case .single: return "Single"
        case .pair: return "Pair"
        case .triple: return "Triple"
        case .tripleWithSingle: return "Triple + Wing"
        case .straight: return "Straight"
        case .pairSequence: return "Pair Run"
        case .bomb: return "Bomb"
        case .rocket: return "Rocket"
        }
    }
}

struct Play: Equatable, Codable {
    let kind: PlayKind
    let cards: [PlayingCard]
    let primaryRank: Rank?
    let sequenceLength: Int

    static let pass = Play(kind: .pass, cards: [], primaryRank: nil, sequenceLength: 0)
}

struct TablePlay: Identifiable, Codable {
    let id = UUID()
    let seat: Seat
    let play: Play
}

enum RoundPhase: String, Codable {
    case bidding
    case playing
    case finished
}

struct LogEntry: Identifiable, Codable {
    let id = UUID()
    let text: String
}
`
}

function buildWormholeLandlordRulesSwift(): string {
  return `import Foundation

enum LandlordRuleEngine {
    static func shuffledDeck(seed: UInt64) -> [PlayingCard] {
        var generator = SeededGenerator(seed: seed == 0 ? 7 : seed)
        return PlayingCard.deck().shuffled(using: &generator)
    }

    static func deal(seed: UInt64) -> ([Seat: [PlayingCard]], [PlayingCard]) {
        let deck = shuffledDeck(seed: seed)
        var hands: [Seat: [PlayingCard]] = [.left: [], .player: [], .right: []]
        for index in 0..<51 {
            let seat = Seat.allCases[index % 3]
            hands[seat, default: []].append(deck[index])
        }
        let landlordCards = Array(deck.suffix(3)).sorted()
        for seat in Seat.allCases {
            hands[seat] = (hands[seat] ?? []).sorted()
        }
        return (hands, landlordCards)
    }

    static func classify(_ rawCards: [PlayingCard]) -> Play? {
        let cards = rawCards.sorted()
        guard !cards.isEmpty else { return nil }
        let ranks = cards.map(\\.rank).sorted()
        let counts = Dictionary(grouping: ranks, by: { $0 }).mapValues(\\.count)
        let groupedCounts = counts.values.sorted(by: >)

        if cards.count == 2 && Set(ranks) == Set([.blackJoker, .redJoker]) {
            return Play(kind: .rocket, cards: cards, primaryRank: .redJoker, sequenceLength: 2)
        }
        if cards.count == 4 && groupedCounts == [4] {
            return Play(kind: .bomb, cards: cards, primaryRank: ranks[0], sequenceLength: 1)
        }
        if cards.count == 1 {
            return Play(kind: .single, cards: cards, primaryRank: ranks[0], sequenceLength: 1)
        }
        if cards.count == 2 && groupedCounts == [2] {
            return Play(kind: .pair, cards: cards, primaryRank: ranks[0], sequenceLength: 1)
        }
        if cards.count == 3 && groupedCounts == [3] {
            return Play(kind: .triple, cards: cards, primaryRank: ranks[0], sequenceLength: 1)
        }
        if cards.count == 4 && groupedCounts == [3, 1], let triple = counts.first(where: { $0.value == 3 })?.key {
            return Play(kind: .tripleWithSingle, cards: cards, primaryRank: triple, sequenceLength: 1)
        }
        if cards.count >= 5 && isConsecutive(ranks) {
            return Play(kind: .straight, cards: cards, primaryRank: ranks.last, sequenceLength: cards.count)
        }
        if cards.count >= 6 && cards.count.isMultiple(of: 2) {
            let pairRanks = counts.filter { $0.value == 2 }.map(\\.key).sorted()
            if pairRanks.count == cards.count / 2 && isConsecutive(pairRanks) {
                return Play(kind: .pairSequence, cards: cards, primaryRank: pairRanks.last, sequenceLength: pairRanks.count)
            }
        }
        return nil
    }

    static func canBeat(_ candidate: Play, previous: Play?) -> Bool {
        guard candidate.kind != .pass else { return false }
        guard let previous, previous.kind != .pass else { return true }
        if candidate.kind == .rocket { return true }
        if previous.kind == .rocket { return false }
        if candidate.kind == .bomb && previous.kind != .bomb { return true }
        if candidate.kind != previous.kind { return false }
        if candidate.sequenceLength != previous.sequenceLength { return false }
        guard let candidateRank = candidate.primaryRank, let previousRank = previous.primaryRank else { return false }
        return candidateRank > previousRank
    }

    static func legalPlays(from hand: [PlayingCard], beating previous: Play?) -> [[PlayingCard]] {
        var plays: [[PlayingCard]] = []
        let byRank = Dictionary(grouping: hand, by: \\.rank)
        let ranks = byRank.keys.sorted()

        for rank in ranks {
            let cards = byRank[rank] ?? []
            if let first = cards.first { plays.append([first]) }
            if cards.count >= 2 { plays.append(Array(cards.prefix(2))) }
            if cards.count >= 3 { plays.append(Array(cards.prefix(3))) }
            if cards.count == 4 { plays.append(cards) }
        }

        for rank in ranks {
            let cards = byRank[rank] ?? []
            guard cards.count >= 3 else { continue }
            for kicker in hand where kicker.rank != rank {
                plays.append(Array(cards.prefix(3)) + [kicker])
                break
            }
        }

        let black = hand.first { $0.rank == .blackJoker }
        let red = hand.first { $0.rank == .redJoker }
        if let black, let red {
            plays.append([black, red])
        }

        plays.append(contentsOf: sequencePlays(from: hand, pairMode: false))
        plays.append(contentsOf: sequencePlays(from: hand, pairMode: true))

        return plays
            .compactMap { cards -> (Play, [PlayingCard])? in
                guard let play = classify(cards), canBeat(play, previous: previous) else { return nil }
                return (play, cards.sorted())
            }
            .sorted { lhs, rhs in
                if lhs.0.cards.count != rhs.0.cards.count { return lhs.0.cards.count < rhs.0.cards.count }
                return (lhs.0.primaryRank?.rawValue ?? 0) < (rhs.0.primaryRank?.rawValue ?? 0)
            }
            .map(\\.1)
    }

    private static func sequencePlays(from hand: [PlayingCard], pairMode: Bool) -> [[PlayingCard]] {
        let byRank = Dictionary(grouping: hand, by: \\.rank)
        let ranks = byRank.keys.filter { $0.rawValue < Rank.two.rawValue }.sorted()
        let minimum = pairMode ? 3 : 5
        var results: [[PlayingCard]] = []

        for start in ranks.indices {
            var chain: [Rank] = []
            var expected = ranks[start].rawValue
            for rank in ranks[start...] {
                if rank.rawValue != expected { break }
                let cards = byRank[rank] ?? []
                if pairMode && cards.count < 2 { break }
                chain.append(rank)
                expected += 1
                if chain.count >= minimum {
                    let selected = chain.flatMap { rank in
                        Array((byRank[rank] ?? []).prefix(pairMode ? 2 : 1))
                    }
                    results.append(selected)
                }
            }
        }
        return results
    }

    private static func isConsecutive(_ ranks: [Rank]) -> Bool {
        guard ranks.count >= 2 else { return false }
        if ranks.contains(where: { $0.rawValue >= Rank.two.rawValue }) { return false }
        let unique = Array(Set(ranks)).sorted()
        guard unique.count == ranks.count else { return false }
        return zip(unique, unique.dropFirst()).allSatisfy { $0.rawValue + 1 == $1.rawValue }
    }
}

struct SeededGenerator: RandomNumberGenerator {
    private var state: UInt64

    init(seed: UInt64) {
        self.state = seed
    }

    mutating func next() -> UInt64 {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return state
    }
}
`
}

function buildWormholeLandlordGameStoreSwift(): string {
  return `import Foundation
import SwiftUI

@MainActor
final class LandlordGameStore: ObservableObject {
    @Published private(set) var hands: [Seat: [PlayingCard]] = [:]
    @Published private(set) var landlordCards: [PlayingCard] = []
    @Published private(set) var phase: RoundPhase = .bidding
    @Published private(set) var landlord: Seat?
    @Published private(set) var currentSeat: Seat = .player
    @Published private(set) var lastPlay: TablePlay?
    @Published private(set) var logs: [LogEntry] = []
    @Published private(set) var winner: Seat?
    @Published var selectedCards: Set<PlayingCard> = []

    private var passCount = 0
    private var seed: UInt64 = 177869

    init() {
        LandlordRuleSelfTests.runSmoke()
        startNewRound()
    }

    var humanHand: [PlayingCard] {
        hands[.player, default: []].sorted()
    }

    var selectedPlay: Play? {
        LandlordRuleEngine.classify(Array(selectedCards))
    }

    var selectedPlayIsLegal: Bool {
        guard phase == .playing, currentSeat == .player, let selectedPlay else { return false }
        return LandlordRuleEngine.canBeat(selectedPlay, previous: activePreviousPlay)
    }

    var activePreviousPlay: Play? {
        guard let lastPlay, lastPlay.seat != currentSeat else { return nil }
        return lastPlay.play
    }

    var phaseTitle: String {
        switch phase {
        case .bidding: return "Bidding for the desert claim"
        case .playing: return "\\(currentSeat.shortTitle)'s turn"
        case .finished: return winner.map { "\\($0.shortTitle) wins" } ?? "Round complete"
        }
    }

    func startNewRound() {
        seed = UInt64(Date().timeIntervalSince1970) ^ seed &+ 31
        let deal = LandlordRuleEngine.deal(seed: seed)
        hands = deal.0
        landlordCards = deal.1
        phase = .bidding
        landlord = nil
        currentSeat = .player
        lastPlay = nil
        winner = nil
        passCount = 0
        selectedCards = []
        logs = [
            LogEntry(text: "Openbasaka dealt a fresh sandstorm table."),
            LogEntry(text: "Boss chooses whether to claim the desert seat.")
        ]
    }

    func toggle(_ card: PlayingCard) {
        guard phase == .playing, currentSeat == .player else { return }
        if selectedCards.contains(card) {
            selectedCards.remove(card)
        } else {
            selectedCards.insert(card)
        }
    }

    func callLandlord() {
        guard phase == .bidding else { return }
        assignLandlord(.player, reason: "Boss claimed landlord and took the desert seat.")
    }

    func passBidding() {
        guard phase == .bidding else { return }
        let aiSeat = strongestAISeat()
        assignLandlord(aiSeat, reason: "Boss passed. \\(aiSeat.shortTitle) claimed the desert seat.")
        advanceAIsIfNeeded()
    }

    func playSelected() {
        guard phase == .playing, currentSeat == .player else { return }
        let cards = Array(selectedCards).sorted()
        guard let play = LandlordRuleEngine.classify(cards) else {
            append("Illegal pattern blocked: \\(cards.map(\\.shortLabel).joined(separator: " "))")
            return
        }
        guard LandlordRuleEngine.canBeat(play, previous: activePreviousPlay) else {
            append("Play blocked. \\(play.kind.label) cannot beat the current table signal.")
            return
        }
        commit(play: play, from: .player)
        selectedCards = []
        advanceAIsIfNeeded()
    }

    func passTurn() {
        guard phase == .playing, currentSeat == .player else { return }
        guard lastPlay != nil else {
            append("You lead this storm line. Passing is disabled until a table signal exists.")
            return
        }
        commitPass(from: .player)
        advanceAIsIfNeeded()
    }

    func selectHint() {
        guard phase == .playing, currentSeat == .player else { return }
        let options = LandlordRuleEngine.legalPlays(from: humanHand, beating: activePreviousPlay)
        selectedCards = Set(options.first ?? [])
        if selectedCards.isEmpty {
            append("No legal hint. Passing is the clean move.")
        } else {
            append("Hint selected: \\(selectedCards.sorted().map(\\.shortLabel).joined(separator: " "))")
        }
    }

    private func assignLandlord(_ seat: Seat, reason: String) {
        landlord = seat
        hands[seat, default: []].append(contentsOf: landlordCards)
        hands[seat] = hands[seat, default: []].sorted()
        phase = .playing
        currentSeat = seat
        append(reason)
        append("Landlord cards: \\(landlordCards.map(\\.shortLabel).joined(separator: " "))")
    }

    private func strongestAISeat() -> Seat {
        let score: (Seat) -> Int = { seat in
            let cards = self.hands[seat, default: []]
            return cards.reduce(0) { total, card in total + card.rank.rawValue } + LandlordRuleEngine.legalPlays(from: cards, beating: nil).count
        }
        return score(.left) >= score(.right) ? .left : .right
    }

    private func advanceAIsIfNeeded() {
        while phase == .playing, currentSeat != .player, winner == nil {
            aiAct(currentSeat)
        }
    }

    private func aiAct(_ seat: Seat) {
        let options = LandlordRuleEngine.legalPlays(from: hands[seat, default: []], beating: activePreviousPlay)
        if let playCards = options.first, let play = LandlordRuleEngine.classify(playCards) {
            commit(play: play, from: seat)
        } else {
            commitPass(from: seat)
        }
    }

    private func commit(play: Play, from seat: Seat) {
        for card in play.cards {
            hands[seat]?.removeAll { $0 == card }
        }
        lastPlay = TablePlay(seat: seat, play: play)
        passCount = 0
        append("\\(seat.shortTitle) played \\(play.kind.label): \\(play.cards.map(\\.shortLabel).joined(separator: " "))")
        if hands[seat, default: []].isEmpty {
            winner = seat
            phase = .finished
            append("\\(seat.shortTitle) crossed the storm line first.")
            return
        }
        currentSeat = nextSeat(after: seat)
    }

    private func commitPass(from seat: Seat) {
        append("\\(seat.shortTitle) passed.")
        passCount += 1
        if passCount >= 2, let leader = lastPlay?.seat {
            append("Orbit resets. \\(leader.shortTitle) leads again.")
            currentSeat = leader
            lastPlay = nil
            passCount = 0
        } else {
            currentSeat = nextSeat(after: seat)
        }
    }

    private func nextSeat(after seat: Seat) -> Seat {
        switch seat {
        case .left: return .player
        case .player: return .right
        case .right: return .left
        }
    }

    private func append(_ text: String) {
        logs.insert(LogEntry(text: text), at: 0)
        logs = Array(logs.prefix(18))
    }
}

enum LandlordRuleSelfTests {
    static func runSmoke() {
        assert(PlayingCard.deck().count == 54)
        let deal = LandlordRuleEngine.deal(seed: 42)
        assert(deal.1.count == 3)
        assert(Seat.allCases.allSatisfy { deal.0[$0, default: []].count == 17 })
    }
}
`
}

function buildWormholeLandlordContentViewSwift(): string {
  return `import SwiftUI

struct ContentView: View {
    @ObservedObject var store: LandlordGameStore

    var body: some View {
        HStack(spacing: 0) {
            GameTableView(store: store)
                .frame(minWidth: 820)

            Divider()
                .overlay(WormholeTheme.line)

            InspectorView(store: store)
                .frame(width: 340)
        }
        .background(WormholeTheme.space)
        .toolbar {
            ToolbarItemGroup {
                Button("New Deal", systemImage: "arrow.clockwise") {
                    store.startNewRound()
                }
                Button("Hint", systemImage: "sparkle.magnifyingglass") {
                    store.selectHint()
                }
                Button("Pass", systemImage: "forward.end") {
                    store.passTurn()
                }
                .disabled(store.phase != .playing || store.currentSeat != .player)
            }
        }
    }
}
`
}

function buildWormholeLandlordGameTableViewSwift(): string {
  return `import SwiftUI

struct GameTableView: View {
    @ObservedObject var store: LandlordGameStore

    var body: some View {
        ZStack {
            WormholeBackdrop()

            VStack(spacing: 18) {
                topRow
                centerTable
                playerHand
                actionBar
            }
            .padding(24)
        }
    }

    private var topRow: some View {
        HStack(spacing: 16) {
            OpponentPanel(seat: .left, count: store.hands[.left, default: []].count, isLandlord: store.landlord == .left, isCurrent: store.currentSeat == .left)
            Spacer()
            landlordCards
            Spacer()
            OpponentPanel(seat: .right, count: store.hands[.right, default: []].count, isLandlord: store.landlord == .right, isCurrent: store.currentSeat == .right)
        }
    }

    private var landlordCards: some View {
        VStack(spacing: 8) {
            Text("Desert Claim")
                .font(.caption.weight(.bold))
                .foregroundStyle(WormholeTheme.muted)
            HStack(spacing: -8) {
                ForEach(store.landlordCards) { card in
                    CardView(card: card, isSelected: false, isCompact: true)
                        .frame(width: 46, height: 64)
                }
            }
        }
        .padding(14)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var centerTable: some View {
        VStack(spacing: 16) {
            Text("Sandstorm Landlord")
                .font(.system(size: 42, weight: .black, design: .rounded))
                .foregroundStyle(WormholeTheme.ink)
                .minimumScaleFactor(0.72)
            Text(store.phaseTitle)
                .font(.headline.weight(.semibold))
                .foregroundStyle(WormholeTheme.cyan)

            ZStack {
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .fill(WormholeTheme.table)
                    .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(WormholeTheme.line, lineWidth: 1))

                VStack(spacing: 12) {
                    if let last = store.lastPlay {
                        Text("\\(last.seat.shortTitle) played \\(last.play.kind.label)")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(WormholeTheme.muted)
                        HStack(spacing: -4) {
                            ForEach(last.play.cards) { card in
                                CardView(card: card, isSelected: false, isCompact: true)
                                    .frame(width: 50, height: 70)
                            }
                        }
                    } else {
                        Text(store.phase == .bidding ? "Claim the desert seat to take the hidden cards." : "Lead this storm line with any legal pattern.")
                            .font(.title3.weight(.bold))
                            .foregroundStyle(WormholeTheme.muted)
                    }
                }
                .padding()
            }
            .frame(height: 220)
        }
    }

    private var playerHand: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label(store.landlord == .player ? "Boss Landlord" : "Boss Hand", systemImage: store.landlord == .player ? "crown.fill" : "person.fill")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(WormholeTheme.ink)
                Spacer()
                Text("\\(store.humanHand.count) cards")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(WormholeTheme.muted)
            }

            ScrollView(.horizontal) {
                HStack(spacing: -18) {
                    ForEach(store.humanHand) { card in
                        CardView(card: card, isSelected: store.selectedCards.contains(card), isCompact: false)
                            .frame(width: 74, height: 104)
                            .offset(y: store.selectedCards.contains(card) ? -18 : 0)
                            .onTapGesture { store.toggle(card) }
                    }
                }
                .padding(.top, 22)
                .padding(.horizontal, 12)
                .padding(.bottom, 6)
            }
            .scrollIndicators(.hidden)
        }
    }

    private var actionBar: some View {
        HStack(spacing: 12) {
            if store.phase == .bidding {
                Button("Claim Desert Seat", systemImage: "crown.fill") {
                    store.callLandlord()
                }
                .buttonStyle(PrimarySpaceButton())

                Button("Hold Position", systemImage: "moon.zzz") {
                    store.passBidding()
                }
                .buttonStyle(SecondarySpaceButton())
            } else if store.phase == .finished {
                Button("New Deal", systemImage: "arrow.clockwise") {
                    store.startNewRound()
                }
                .buttonStyle(PrimarySpaceButton())
            } else {
                Button("Play Selected", systemImage: "paperplane.fill") {
                    store.playSelected()
                }
                .buttonStyle(PrimarySpaceButton())
                .disabled(!store.selectedPlayIsLegal)

                Button("Hint", systemImage: "sparkle.magnifyingglass") {
                    store.selectHint()
                }
                .buttonStyle(SecondarySpaceButton())

                Button("Pass", systemImage: "forward.end.fill") {
                    store.passTurn()
                }
                .buttonStyle(SecondarySpaceButton())
            }
        }
    }
}

struct OpponentPanel: View {
    let seat: Seat
    let count: Int
    let isLandlord: Bool
    let isCurrent: Bool

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(isCurrent ? WormholeTheme.cyan.opacity(0.24) : WormholeTheme.panel)
                Image(systemName: isLandlord ? "crown.fill" : "cpu")
                    .foregroundStyle(isLandlord ? WormholeTheme.gold : WormholeTheme.cyan)
            }
            .frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: 3) {
                Text(seat.title)
                    .font(.headline)
                    .foregroundStyle(WormholeTheme.ink)
                Text("\\(count) cards")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(WormholeTheme.muted)
            }
        }
        .padding(14)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(isCurrent ? WormholeTheme.cyan : WormholeTheme.line, lineWidth: 1))
    }
}

struct CardView: View {
    let card: PlayingCard
    let isSelected: Bool
    let isCompact: Bool

    var body: some View {
        VStack(alignment: .leading) {
            Text(card.rank.label)
                .font(.system(size: isCompact ? 14 : 18, weight: .black, design: .rounded))
            Spacer()
            Text(card.suit.symbol)
                .font(.system(size: isCompact ? 20 : 28, weight: .bold))
            Spacer()
            Text(card.rank.label)
                .font(.system(size: isCompact ? 11 : 14, weight: .bold, design: .rounded))
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .foregroundStyle(card.suit.color)
        .padding(isCompact ? 8 : 10)
        .background(
            LinearGradient(colors: [Color.white, Color(red: 0.78, green: 0.84, blue: 0.94)], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: isCompact ? 9 : 13, style: .continuous)
        )
        .overlay(RoundedRectangle(cornerRadius: isCompact ? 9 : 13).stroke(isSelected ? WormholeTheme.gold : Color.black.opacity(0.12), lineWidth: isSelected ? 3 : 1))
        .shadow(color: Color.black.opacity(0.30), radius: isSelected ? 14 : 8, x: 0, y: 8)
    }
}

struct WormholeBackdrop: View {
    var body: some View {
        Canvas { context, size in
            let rect = CGRect(origin: .zero, size: size)
            context.fill(Path(rect), with: .linearGradient(
                Gradient(colors: [
                    Color(red: 0.07, green: 0.045, blue: 0.055),
                    Color(red: 0.30, green: 0.18, blue: 0.08),
                    Color(red: 0.82, green: 0.55, blue: 0.22)
                ]),
                startPoint: .zero,
                endPoint: CGPoint(x: size.width, y: size.height)
            ))

            var sun = Path(ellipseIn: CGRect(x: size.width * 0.68, y: size.height * 0.08, width: 120, height: 120))
            context.fill(sun, with: .color(WormholeTheme.gold.opacity(0.30)))

            for index in 0..<8 {
                let y = size.height * (0.36 + CGFloat(index) * 0.075)
                var dune = Path()
                dune.move(to: CGPoint(x: -80, y: y))
                dune.addCurve(
                    to: CGPoint(x: size.width + 80, y: y + CGFloat(index % 2 == 0 ? 44 : -34)),
                    control1: CGPoint(x: size.width * 0.28, y: y - 70),
                    control2: CGPoint(x: size.width * 0.68, y: y + 90)
                )
                dune.addLine(to: CGPoint(x: size.width + 80, y: size.height + 80))
                dune.addLine(to: CGPoint(x: -80, y: size.height + 80))
                dune.closeSubpath()
                context.fill(dune, with: .color((index.isMultiple(of: 2) ? WormholeTheme.sand : WormholeTheme.spice).opacity(0.08 + Double(index) * 0.012)))
            }

            for index in 0..<14 {
                var line = Path()
                let y = CGFloat(index) * size.height / 14 + 26
                line.move(to: CGPoint(x: size.width * 0.05, y: y))
                line.addLine(to: CGPoint(x: size.width * 0.95, y: y + CGFloat(index % 3 - 1) * 34))
                context.stroke(line, with: .color(WormholeTheme.cyan.opacity(0.035)), lineWidth: 1)
            }
        }
        .ignoresSafeArea()
    }
}

struct PrimarySpaceButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline.weight(.black))
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .foregroundStyle(Color.black)
            .background(LinearGradient(colors: [WormholeTheme.gold, WormholeTheme.cyan], startPoint: .leading, endPoint: .trailing), in: Capsule())
            .opacity(configuration.isPressed ? 0.72 : 1)
    }
}

struct SecondarySpaceButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline.weight(.semibold))
            .padding(.horizontal, 18)
            .padding(.vertical, 11)
            .foregroundStyle(WormholeTheme.ink)
            .background(WormholeTheme.panel, in: Capsule())
            .overlay(Capsule().stroke(WormholeTheme.line, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.72 : 1)
    }
}
`
}

function buildWormholeLandlordInspectorViewSwift(): string {
  return `import SwiftUI

struct InspectorView: View {
    @ObservedObject var store: LandlordGameStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                status
                rules
                log
            }
            .padding(18)
        }
        .background(WormholeTheme.inspector)
    }

    private var status: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Openbasaka Run Evidence")
                .font(.headline.weight(.black))
            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 8) {
                GridRow {
                    Text("Phase").foregroundStyle(WormholeTheme.muted)
                    Text(store.phase.rawValue.capitalized)
                }
                GridRow {
                    Text("Turn").foregroundStyle(WormholeTheme.muted)
                    Text(store.currentSeat.title)
                }
                GridRow {
                    Text("Landlord").foregroundStyle(WormholeTheme.muted)
                    Text(store.landlord?.title ?? "Pending")
                }
                GridRow {
                    Text("Selected").foregroundStyle(WormholeTheme.muted)
                    Text(store.selectedPlay?.kind.label ?? "No legal pattern")
                }
            }
            .font(.caption.weight(.semibold))
        }
        .inspectorPanel()
    }

    private var rules: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Rules Covered")
                .font(.headline.weight(.black))
            ForEach(["Single", "Pair", "Triple", "Triple + Wing", "Straight", "Pair Run", "Bomb", "Rocket"], id: \\.self) { rule in
                Label(rule, systemImage: "checkmark.seal.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(WormholeTheme.ink)
            }
            Text("Illegal patterns are blocked before they can hit the table.")
                .font(.caption)
                .foregroundStyle(WormholeTheme.muted)
        }
        .inspectorPanel()
    }

    private var log: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Orbit Log")
                .font(.headline.weight(.black))
            ForEach(store.logs) { entry in
                Text(entry.text)
                    .font(.caption)
                    .foregroundStyle(WormholeTheme.ink.opacity(0.86))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(9)
                    .background(Color.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
        .inspectorPanel()
    }
}

extension View {
    func inspectorPanel() -> some View {
        self
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(WormholeTheme.line, lineWidth: 1))
    }
}
`
}

function buildWormholeLandlordThemeSwift(): string {
  return `import SwiftUI

enum WormholeTheme {
    static let space = Color(red: 0.055, green: 0.038, blue: 0.045)
    static let table = Color(red: 0.12, green: 0.074, blue: 0.045).opacity(0.88)
    static let inspector = Color(red: 0.060, green: 0.043, blue: 0.052)
    static let panel = Color(red: 1.00, green: 0.79, blue: 0.42).opacity(0.12)
    static let line = Color(red: 1.00, green: 0.75, blue: 0.42).opacity(0.22)
    static let ink = Color(red: 1.00, green: 0.94, blue: 0.82)
    static let muted = Color(red: 1.00, green: 0.87, blue: 0.68).opacity(0.68)
    static let cyan = Color(red: 0.38, green: 0.88, blue: 0.84)
    static let gold = Color(red: 1.00, green: 0.66, blue: 0.22)
    static let sand = Color(red: 0.91, green: 0.65, blue: 0.34)
    static let spice = Color(red: 0.75, green: 0.31, blue: 0.12)
    static let redSuit = Color(red: 0.78, green: 0.10, blue: 0.18)
}
`
}

function buildWormholeLandlordRulesTestsSwift(projectName: string): string {
  return `import XCTest
@testable import ${projectName}

final class LandlordRulesTests: XCTestCase {
    func testDeckAndDealAreDeterministic() {
        XCTAssertEqual(PlayingCard.deck().count, 54)
        let first = LandlordRuleEngine.deal(seed: 177869)
        let second = LandlordRuleEngine.deal(seed: 177869)
        XCTAssertEqual(first.1, second.1)
        XCTAssertEqual(first.0[.player]?.count, 17)
        XCTAssertEqual(first.0[.left]?.count, 17)
        XCTAssertEqual(first.0[.right]?.count, 17)
        XCTAssertEqual(first.1.count, 3)
    }

    func testClassifiesRequiredPatterns() {
        XCTAssertEqual(LandlordRuleEngine.classify(cards([.three]))?.kind, .single)
        XCTAssertEqual(LandlordRuleEngine.classify(cards([.four, .four]))?.kind, .pair)
        XCTAssertEqual(LandlordRuleEngine.classify(cards([.five, .five, .five]))?.kind, .triple)
        XCTAssertEqual(LandlordRuleEngine.classify(cards([.six, .six, .six, .nine]))?.kind, .tripleWithSingle)
        XCTAssertEqual(LandlordRuleEngine.classify(cards([.three, .four, .five, .six, .seven]))?.kind, .straight)
        XCTAssertEqual(LandlordRuleEngine.classify(cards([.three, .three, .four, .four, .five, .five]))?.kind, .pairSequence)
        XCTAssertEqual(LandlordRuleEngine.classify(cards([.eight, .eight, .eight, .eight]))?.kind, .bomb)
        XCTAssertEqual(LandlordRuleEngine.classify([PlayingCard(suit: .joker, rank: .blackJoker), PlayingCard(suit: .joker, rank: .redJoker)])?.kind, .rocket)
    }

    func testBeatingRules() {
        let pairFives = LandlordRuleEngine.classify(cards([.five, .five]))!
        let pairSixes = LandlordRuleEngine.classify(cards([.six, .six]))!
        let bomb = LandlordRuleEngine.classify(cards([.three, .three, .three, .three]))!
        let rocket = LandlordRuleEngine.classify([PlayingCard(suit: .joker, rank: .blackJoker), PlayingCard(suit: .joker, rank: .redJoker)])!
        XCTAssertTrue(LandlordRuleEngine.canBeat(pairSixes, previous: pairFives))
        XCTAssertFalse(LandlordRuleEngine.canBeat(pairFives, previous: pairSixes))
        XCTAssertTrue(LandlordRuleEngine.canBeat(bomb, previous: pairSixes))
        XCTAssertTrue(LandlordRuleEngine.canBeat(rocket, previous: bomb))
    }

    @MainActor
    func testLegalPlaysIncludePassableResponsesAndGameCanFinish() {
        let previous = LandlordRuleEngine.classify(cards([.seven, .seven]))!
        let hand = cards([.three, .four, .eight, .eight, .king, .king, .king, .king])
        let legal = LandlordRuleEngine.legalPlays(from: hand, beating: previous)
        XCTAssertTrue(legal.contains { LandlordRuleEngine.classify($0)?.kind == .pair && LandlordRuleEngine.classify($0)?.primaryRank == .eight })
        XCTAssertTrue(legal.contains { LandlordRuleEngine.classify($0)?.kind == .bomb && LandlordRuleEngine.classify($0)?.primaryRank == .king })

        let store = LandlordGameStore()
        store.callLandlord()
        XCTAssertEqual(store.phase, .playing)
    }

    private func cards(_ ranks: [Rank]) -> [PlayingCard] {
        let suits: [Suit] = [.spades, .hearts, .clubs, .diamonds]
        return ranks.enumerated().map { index, rank in
            PlayingCard(suit: rank == .blackJoker || rank == .redJoker ? .joker : suits[index % suits.count], rank: rank)
        }
    }
}
`
}

function buildSimplifyAppReadme(params: {
  projectName: string
  projectLocation: string
  demand: string
  synthesis: string
  runId: string
}): string {
  if (isLumaSenseAppDemand(params.demand)) return buildLumaSenseAppReadme(params)
  if (isWeatherBagAppDemand(params.demand)) return buildWeatherBagAppReadme(params)

  const xcodeProject = `${params.projectLocation}/${params.projectName}.xcodeproj`
  const runScript = `${params.projectLocation}/scripts/build-and-run.mjs`
  return [
    `# ${params.projectName}`,
    '',
    `Openbasaka 化繁为简本轮 App 交付包。`,
    '',
    `- Run ID: ${params.runId}`,
    `- Boss 需求: ${params.demand}`,
    `- Xcode 工程: ${xcodeProject}`,
    '',
    '## 运行',
    '',
    `1. 打开工程: \`open ${shellQuote(xcodeProject)}\``,
    `2. 真运行验收: \`node ${shellQuote(runScript)}\``,
    `3. 构建日志: \`${params.projectLocation}/artifacts/native-build.log\``,
    `4. Simulator 截图: \`${params.projectLocation}/artifacts/native-ios-simulator.png\``,
    '',
    '## 本轮方案摘要',
    '',
    params.synthesis || '本轮方案见化繁为简结果面板。',
    '',
    '## 验收线',
    '',
    '- 工程能被 Xcode 打开。',
    '- iOS Simulator 构建、安装、启动通过。',
    '- 截图文件真实存在且非空。',
    '- 首屏显示 Boss 原始需求、本轮路线和下一步。',
    '- 后续业务界面必须继续用真实数据与真实验证补齐。',
  ].join('\n')
}

function buildLumaSenseAppReadme(params: {
  projectName: string
  projectLocation: string
  demand: string
  synthesis: string
  runId: string
}): string {
  const xcodeProject = `${params.projectLocation}/${params.projectName}.xcodeproj`
  const runScript = `${params.projectLocation}/scripts/build-and-run.mjs`
  const uiStyleContext = buildLumaSenseUiStyleContext(params.demand)
  return [
    `# ${params.projectName}`,
    '',
    'Openbasaka 化繁为简生成的 iOS App 真运行验收包：LumaSense 视觉意识花园。',
    '',
    `- Run ID: ${params.runId}`,
    `- Boss 需求: ${params.demand}`,
    `- Xcode 工程: ${xcodeProject}`,
    `- 真运行脚本: ${runScript}`,
    `- 构建日志: ${params.projectLocation}/artifacts/native-build.log`,
    `- Simulator 截图: ${params.projectLocation}/artifacts/native-ios-simulator.png`,
    '',
    '## 产品定位',
    '',
    '把每日看到的画面、当下心情和一个内在问题，转成一张可保存、可复盘的认知卡片；用户像打理花园一样积累自己的观察和情绪线索。',
    '',
    '## 当前已落地',
    '',
    `- UI 风格馆 DNA：${uiStyleContext.styleNames.join(' / ')}。`,
    `- iOS 适配：${uiStyleContext.platformNotes.ios.replace(/\n/g, ' ')}`,
    '- SwiftUI 首屏：现代安全区、底部命令 dock、工作台分段、今日输入、情绪选择、生成认知卡片、花园历史、复盘仪式。',
    '- 核心交互：输入画面/心情，选择情绪，一键生成卡片并保存到本地状态。',
    '- 工程适配：包含 LaunchScreen.storyboard，避免现代 iPhone 被系统按旧机型 letterbox 显示。',
    '- 验收脚本：自动调用 Xcode，构建、安装、启动 Simulator，并保存截图和日志。',
    '- 诚实边界：当前是离线可运行垂直切片，未接真实云端 AI 或账号同步。',
    '',
    '## 运行',
    '',
    `1. 打开工程: \`open ${shellQuote(xcodeProject)}\``,
    `2. 真运行验收: \`node ${shellQuote(runScript)}\``,
    '',
    '## 下一轮必须补',
    '',
    '- 接入真实模型服务，把离线卡片生成替换为可解释的 AI 生成。',
    '- 加本地持久化或 CloudKit，同步花园历史。',
    '- 加分享、导出和一周复盘。',
    '',
    '## 本轮方案摘要',
    '',
    params.synthesis || '本轮方案见化繁为简结果面板。',
  ].join('\n')
}

function buildWeatherBagAppReadme(params: {
  projectName: string
  projectLocation: string
  demand: string
  synthesis: string
  runId: string
}): string {
  const xcodeProject = `${params.projectLocation}/${params.projectName}.xcodeproj`
  const runScript = `${params.projectLocation}/scripts/build-and-run.mjs`
  return [
    `# ${params.projectName}`,
    '',
    'Openbasaka 化繁为简生成的 iOS App 开工包：包里晴雨 / Weather Bag Checklist。',
    '',
    `- Run ID: ${params.runId}`,
    `- Boss 需求: ${params.demand}`,
    `- Xcode 工程: ${xcodeProject}`,
    '',
    '## 产品定位',
    '',
    '为女性出门在外，根据当地实际天气和外出场景，详细、有趣、用心、优雅、卡通、严谨地准备包包清单；用户逐项打钩，确认后全武装出门。',
    '',
    '## 当前已落地',
    '',
    '- SwiftUI 首屏：天气卡、场景选择、完成度、四组包包清单。',
    '- 清单交互：每个物品可打钩，完成度实时变化。',
    '- 严谨提示：未接入真实天气时，界面明确标注样例天气。',
    '- 体验方向：柔和、轻卡通、可扫读，不做空泛欢迎页。',
    '',
    '## 运行',
    '',
    `1. 打开工程: \`open ${shellQuote(xcodeProject)}\``,
    `2. 真运行验收: \`node ${shellQuote(runScript)}\``,
    `3. 构建日志: \`${params.projectLocation}/artifacts/native-build.log\``,
    `4. Simulator 截图: \`${params.projectLocation}/artifacts/native-ios-simulator.png\``,
    '',
    '## 下一轮必须补',
    '',
    '- 接入 WeatherKit 或可信天气 API。',
    '- 增加城市/定位权限说明。',
    '- 增加通勤、约会、旅行、运动、夜归的清单差异。',
    '- 做真实 iPhone 模拟器截图验收。',
    '',
    '## 本轮方案摘要',
    '',
    params.synthesis || '本轮方案见化繁为简结果面板。',
  ].join('\n')
}

function buildSimplifyLaunchScreenStoryboard(projectName: string, demand: string): string {
  const isLumaSense = isLumaSenseAppDemand(demand)
  const title = isLumaSense ? 'LumaSense' : projectName
  const subtitle = isLumaSense ? 'Visual Garden' : 'Openbasaka Delivery'
  const background = isLumaSense ? '0.031 0.039 0.055 1' : '0.090 0.106 0.137 1'
  const accent = isLumaSense ? '0.557 0.929 0.741 1' : '0.620 0.720 1.000 1'

  return `<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="23504" targetRuntime="iOS.CocoaTouch" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" colorMatched="YES" initialViewController="01J-lp-oVM">
    <device id="retina6_12" orientation="portrait" appearance="dark"/>
    <dependencies>
        <plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="23506"/>
        <capability name="Safe area layout guides" minToolsVersion="9.0"/>
        <capability name="documents saved in the Xcode 8 format" minToolsVersion="8.0"/>
    </dependencies>
    <scenes>
        <scene sceneID="EHf-IW-A2E">
            <objects>
                <viewController id="01J-lp-oVM" sceneMemberID="viewController">
                    <view key="view" contentMode="scaleToFill" id="Ze5-6b-2t3">
                        <rect key="frame" x="0.0" y="0.0" width="393" height="852"/>
                        <autoresizingMask key="autoresizingMask" widthSizable="YES" heightSizable="YES"/>
                        <subviews>
                            <stackView opaque="NO" contentMode="scaleToFill" axis="vertical" alignment="center" spacing="12" translatesAutoresizingMaskIntoConstraints="NO" id="xvH-WK-oXj">
                                <rect key="frame" x="57" y="381" width="279" height="90"/>
                                <subviews>
                                    <label opaque="NO" userInteractionEnabled="NO" contentMode="left" text="${title}" textAlignment="center" lineBreakMode="tailTruncation" baselineAdjustment="alignBaselines" adjustsFontSizeToFit="YES" translatesAutoresizingMaskIntoConstraints="NO" id="uzY-K8-fNW">
                                        <rect key="frame" x="0.0" y="0.0" width="279" height="50"/>
                                        <fontDescription key="fontDescription" type="system" weight="heavy" pointSize="42"/>
                                        <color key="textColor" red="0.968" green="0.985" blue="1" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>
                                    </label>
                                    <label opaque="NO" userInteractionEnabled="NO" contentMode="left" text="${subtitle}" textAlignment="center" lineBreakMode="tailTruncation" baselineAdjustment="alignBaselines" translatesAutoresizingMaskIntoConstraints="NO" id="b2L-mu-rYw">
                                        <rect key="frame" x="73" y="62" width="133" height="28"/>
                                        <fontDescription key="fontDescription" type="system" weight="semibold" pointSize="20"/>
                                        <color key="textColor" red="${accent.split(' ')[0]}" green="${accent.split(' ')[1]}" blue="${accent.split(' ')[2]}" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>
                                    </label>
                                </subviews>
                            </stackView>
                        </subviews>
                        <viewLayoutGuide key="safeArea" id="Bcu-3y-fUS"/>
                        <color key="backgroundColor" red="${background.split(' ')[0]}" green="${background.split(' ')[1]}" blue="${background.split(' ')[2]}" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>
                        <constraints>
                            <constraint firstItem="xvH-WK-oXj" firstAttribute="centerX" secondItem="Ze5-6b-2t3" secondAttribute="centerX" id="M8v-ck-hCu"/>
                            <constraint firstItem="xvH-WK-oXj" firstAttribute="centerY" secondItem="Ze5-6b-2t3" secondAttribute="centerY" id="o9Z-g3-qxE"/>
                            <constraint firstItem="xvH-WK-oXj" firstAttribute="leading" relation="greaterThanOrEqual" secondItem="Bcu-3y-fUS" secondAttribute="leading" constant="36" id="pQP-no-v4I"/>
                            <constraint firstItem="Bcu-3y-fUS" firstAttribute="trailing" relation="greaterThanOrEqual" secondItem="xvH-WK-oXj" secondAttribute="trailing" constant="36" id="tPe-wB-xLg"/>
                        </constraints>
                    </view>
                </viewController>
                <placeholder placeholderIdentifier="IBFirstResponder" id="iYj-Kq-Ea1" userLabel="First Responder" sceneMemberID="firstResponder"/>
            </objects>
            <point key="canvasLocation" x="53" y="375"/>
        </scene>
    </scenes>
</document>
`
}

function buildSimplifyAppRunScript(params: {
  projectLocation: string
  projectName: string
  bundleId: string
}): string {
  return `import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const artifactsDir = path.join(root, "artifacts")
const buildDir = path.join(root, "build")
const logFile = path.join(artifactsDir, "native-build.log")
const developerDir = "/Applications/Xcode.app/Contents/Developer"
const projectName = ${JSON.stringify(params.projectName)}
const bundleId = ${JSON.stringify(params.bundleId)}
const xcodeProject = path.join(root, projectName + ".xcodeproj")

fs.mkdirSync(artifactsDir, { recursive: true })
fs.writeFileSync(logFile, "")

function writeLog(text) {
  fs.appendFileSync(logFile, text + "\\n")
}

function fail(message, detail = "") {
  writeLog("FAIL: " + message)
  if (detail) writeLog(detail)
  console.error(message)
  if (detail) console.error(detail)
  process.exit(1)
}

function run(command, args, options = {}) {
  writeLog("$ " + command + " " + args.join(" "))
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: { ...process.env, DEVELOPER_DIR: developerDir },
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 24,
    timeout: options.timeout || 300000,
  })
  if (result.stdout) writeLog(result.stdout)
  if (result.stderr) writeLog(result.stderr)
  if (result.status !== 0 && !options.allowFailure) {
    fail("命令失败: " + command + " " + args.join(" "), (result.stdout || "") + "\\n" + (result.stderr || ""))
  }
  return result
}

function runtimeVersion(runtime) {
  const match = String(runtime).match(/iOS-(\\d+)-(\\d+)/)
  return match ? match[1] + "." + match[2] : ""
}

function versionScore(version) {
  return String(version)
    .split(".")
    .map((part) => Number(part) || 0)
    .reduce((score, part, index) => score + part / Math.pow(100, index), 0)
}

if (!fs.existsSync(developerDir)) {
  fail("找不到 Xcode: " + developerDir)
}

if (!fs.existsSync(xcodeProject)) {
  fail("找不到 Xcode 工程: " + xcodeProject)
}

const devicesResult = run("xcrun", ["simctl", "list", "devices", "available", "-j"], { timeout: 120000 })
let devicesJson
try {
  devicesJson = JSON.parse(devicesResult.stdout)
} catch (error) {
  fail("无法解析 simctl 设备列表", String(error))
}

const allDevices = Object.entries(devicesJson.devices || {})
  .filter(([runtime]) => String(runtime).includes("iOS"))
  .flatMap(([runtime, devices]) => devices.map((device) => ({
    ...device,
    runtime,
    osVersion: runtimeVersion(runtime),
  })))
  .filter((device) => device.osVersion)
  .sort((a, b) => versionScore(b.osVersion) - versionScore(a.osVersion))

const preferred =
  allDevices.find((device) => device.name === "iPhone 17 Pro Max") ||
  allDevices.find((device) => device.name === "iPhone 17 Pro") ||
  allDevices.find((device) => device.name === "iPhone 16 Pro") ||
  allDevices.find((device) => String(device.name).includes("iPhone")) ||
  allDevices[0]

if (!preferred) {
  fail("没有可用 iOS 模拟器")
}

run("xcodebuild", [
  "-project", xcodeProject,
  "-target", projectName,
  "-sdk", "iphonesimulator",
  "-configuration", "Debug",
  "CODE_SIGNING_ALLOWED=NO",
  "SYMROOT=" + buildDir,
  "OBJROOT=" + buildDir,
  "build",
], { timeout: 600000 })

run("xcrun", ["simctl", "boot", preferred.udid], { allowFailure: true, timeout: 120000 })
run("xcrun", ["simctl", "bootstatus", preferred.udid, "-b"], { timeout: 300000 })

const productsDir = path.join(buildDir, "Debug-iphonesimulator")
const appPath = path.join(productsDir, projectName + ".app")
if (!fs.existsSync(appPath)) {
  fail("构建产物不存在: " + appPath)
}

run("xcrun", ["simctl", "terminate", preferred.udid, bundleId], { allowFailure: true, timeout: 60000 })
run("xcrun", ["simctl", "uninstall", preferred.udid, bundleId], { allowFailure: true, timeout: 60000 })
run("xcrun", ["simctl", "install", preferred.udid, appPath], { timeout: 180000 })
run("xcrun", ["simctl", "ui", preferred.udid, "appearance", "dark"], { allowFailure: true, timeout: 60000 })
run("xcrun", ["simctl", "launch", preferred.udid, bundleId], { timeout: 120000 })
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3200)

const screenshot = path.join(artifactsDir, "native-ios-simulator.png")
run("xcrun", ["simctl", "io", preferred.udid, "screenshot", screenshot], { timeout: 120000 })

if (!fs.existsSync(screenshot) || fs.statSync(screenshot).size < 1000) {
  fail("截图验收失败: " + screenshot)
}

console.log("Native iOS build and simulator launch passed")
console.log("device=" + preferred.name + " " + preferred.udid)
console.log("app=" + appPath)
console.log("screenshot=" + screenshot)
console.log("log=" + logFile)
`
}

function buildSimplifyAppEntrySwift(projectName: string): string {
  return `import SwiftUI

@main
struct ${projectName}App: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
`
}

function buildSimplifyAppContentSwift(demand: string): string {
  if (isLumaSenseAppDemand(demand)) return buildLumaSenseContentSwift()
  if (isWeatherBagAppDemand(demand)) return buildWeatherBagChecklistContentSwift(demand)

  return `import SwiftUI

struct ContentView: View {
    private let plan = WorkflowPlan.current

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    ForEach(plan.steps) { step in
                        StepCard(step: step)
                    }
                    nextStep
                }
                .padding(20)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("本轮结果")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Boss 需求")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(${JSON.stringify(demand)})
                .font(.title3.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
            Text("这不是空白模板。它已经把本轮需求变成可打开、可构建、可继续迭代的 SwiftUI 起点。")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(.background)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var nextStep: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("下一步")
                .font(.headline)
            Text(plan.nextStep)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(.background)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct StepCard: View {
    let step: WorkflowStep

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(step.title)
                    .font(.headline)
                Spacer()
                Text(step.status)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Color.accentColor.opacity(0.14))
                    .foregroundStyle(Color.accentColor)
                    .clipShape(Capsule())
            }
            Text(step.detail)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(.background)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

#Preview {
    ContentView()
}
`
}

function buildLumaSenseContentSwift(): string {
  return `import SwiftUI

struct ContentView: View {
    @State private var selectedMode: StudioMode = .capture
    @State private var imageNote = "傍晚的玻璃幕墙反射出一片金色，我突然意识到自己这一周一直在追赶，却很少停下来确认真正重要的东西。"
    @State private var questionNote = "今天这幅画面想提醒我什么？"
    @State private var selectedMood = MoodOption.all[0]
    @State private var generatedCard: GardenEntry? = GardenEntry.featured
    @State private var garden = GardenEntry.seed
    @State private var checkedReviewTasks: Set<String> = ["signal"]
    @State private var generationPulse = 0

    private var reviewProgress: Int {
        Int((Double(checkedReviewTasks.count) / Double(ReviewTask.all.count)) * 100)
    }

    var body: some View {
        ZStack {
            LumaBackground()
                .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    modeSwitch

                    switch selectedMode {
                    case .capture:
                        captureStudio
                        latestCard
                        gardenPreview(limit: 3)
                    case .garden:
                        gardenHeader
                        gardenPreview(limit: 8)
                    case .review:
                        reviewStudio
                        latestCard
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 12)
                .padding(.bottom, 122)
            }
            .scrollIndicators(.hidden)
        }
        .preferredColorScheme(.dark)
        .foregroundStyle(AppTheme.ink)
        .safeAreaInset(edge: .bottom) {
            commandDock
        }
        .sensoryFeedback(.success, trigger: generationPulse)
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 14) {
            SignalLens(mood: selectedMood)
                .frame(width: 62, height: 62)

            VStack(alignment: .leading, spacing: 4) {
                Text("LumaSense")
                    .font(.system(size: 30, weight: .black, design: .rounded))
                    .minimumScaleFactor(0.82)
                Text("视觉意识花园")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(AppTheme.mist)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                Text("今日")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(AppTheme.mist)
                Text("\\(garden.count)")
                    .font(.title2.weight(.heavy))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial, in: Capsule())
        }
    }

    private var modeSwitch: some View {
        HStack(spacing: 8) {
            ForEach(StudioMode.allCases) { mode in
                Button {
                    withAnimation(.spring(response: 0.36, dampingFraction: 0.82)) {
                        selectedMode = mode
                    }
                } label: {
                    Label(mode.rawValue, systemImage: mode.icon)
                        .font(.footnote.weight(.bold))
                        .labelStyle(.titleAndIcon)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(selectedMode == mode ? AppTheme.ink.opacity(0.16) : Color.white.opacity(0.055), in: Capsule())
                        .overlay(Capsule().stroke(selectedMode == mode ? AppTheme.mint.opacity(0.72) : Color.white.opacity(0.08), lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var captureStudio: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 10) {
                Text("把今天看见的画面转成认知卡片")
                    .font(.system(size: 28, weight: .heavy, design: .rounded))
                    .lineLimit(2)
                    .minimumScaleFactor(0.74)
                Text("先记录画面，再选择情绪。LumaSense 会把它压成洞察、行动和复盘线索。")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(AppTheme.subtle)
                    .lineSpacing(3)
            }

            VStack(alignment: .leading, spacing: 10) {
                Label("今日画面", systemImage: "viewfinder")
                    .font(.headline)
                TextEditor(text: $imageNote)
                    .frame(minHeight: 124)
                    .scrollContentBackground(.hidden)
                    .foregroundColor(AppTheme.ink)
                    .padding(14)
                    .background(Color.white.opacity(0.075), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Color.white.opacity(0.12), lineWidth: 1))
            }

            VStack(alignment: .leading, spacing: 10) {
                Label("正在追问", systemImage: "quote.bubble")
                    .font(.headline)
                TextField("今天这幅画面想提醒我什么？", text: $questionNote, axis: .vertical)
                    .lineLimit(2...3)
                    .font(.body.weight(.medium))
                    .padding(16)
                    .background(Color.black.opacity(0.22), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(AppTheme.mint.opacity(0.24), lineWidth: 1))
            }

            moodDeck

            HStack(spacing: 10) {
                MetricPill(icon: "camera.aperture", title: "画面信号", value: "清晰")
                MetricPill(icon: "brain.head.profile", title: "认知负荷", value: selectedMood.load)
            }
        }
        .glassPanel(radius: 34, border: AppTheme.mint.opacity(0.32))
    }

    private var moodDeck: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("情绪光谱", systemImage: "slider.horizontal.3")
                    .font(.headline)
                Spacer()
                Text(selectedMood.title)
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(selectedMood.colors[0])
            }

            ScrollView(.horizontal) {
                HStack(spacing: 10) {
                    ForEach(MoodOption.all) { option in
                        Button {
                            withAnimation(.spring(response: 0.34, dampingFraction: 0.78)) {
                                selectedMood = option
                            }
                        } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                Image(systemName: option.symbol)
                                    .font(.title2.weight(.bold))
                                Text(option.title)
                                    .font(.headline)
                                Text(option.subtitle)
                                    .font(.caption.weight(.medium))
                                    .foregroundStyle(AppTheme.subtle)
                            }
                            .frame(width: 132, alignment: .leading)
                            .padding(14)
                            .background(
                                LinearGradient(colors: option.colors.map { $0.opacity(selectedMood.id == option.id ? 0.44 : 0.16) }, startPoint: .topLeading, endPoint: .bottomTrailing),
                                in: RoundedRectangle(cornerRadius: 24, style: .continuous)
                            )
                            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(selectedMood.id == option.id ? option.colors[0].opacity(0.82) : Color.white.opacity(0.08), lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .scrollIndicators(.hidden)
        }
    }

    private var latestCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("最新认知卡", systemImage: "sparkle.magnifyingglass")
                    .font(.headline)
                Spacer()
                Text(generatedCard?.mood ?? selectedMood.title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(AppTheme.mint)
            }
            GardenCard(entry: generatedCard ?? GardenEntry.featured, highlighted: true)
        }
    }

    private var gardenHeader: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 5) {
                Text("花园历史")
                    .font(.system(size: 30, weight: .heavy, design: .rounded))
                Text("每张卡片都保留画面、情绪、洞察和下一步。")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.subtle)
            }
            Spacer()
            Text("\\(garden.count) 张")
                .font(.headline.weight(.black))
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(AppTheme.mint.opacity(0.15), in: Capsule())
        }
    }

    private func gardenPreview(limit: Int) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if selectedMode != .garden {
                HStack {
                    Text("花园历史")
                        .font(.headline)
                    Spacer()
                    Button {
                        withAnimation { selectedMode = .garden }
                    } label: {
                        Label("查看", systemImage: "arrow.right")
                            .font(.caption.weight(.bold))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(AppTheme.mint)
                }
            }

            ForEach(garden.prefix(limit)) { entry in
                GardenCard(entry: entry, highlighted: false)
            }
        }
    }

    private var reviewStudio: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("每日复盘")
                        .font(.system(size: 30, weight: .heavy, design: .rounded))
                    Text("不追求长篇日记，只完成三个高信号动作。")
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.subtle)
                }
                Spacer()
                ZStack {
                    Circle()
                        .stroke(Color.white.opacity(0.1), lineWidth: 8)
                    Circle()
                        .trim(from: 0, to: CGFloat(reviewProgress) / 100)
                        .stroke(AppTheme.mint, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Text("\\(reviewProgress)%")
                        .font(.caption.weight(.black))
                }
                .frame(width: 64, height: 64)
            }

            ForEach(ReviewTask.all) { task in
                Button {
                    if checkedReviewTasks.contains(task.id) {
                        checkedReviewTasks.remove(task.id)
                    } else {
                        checkedReviewTasks.insert(task.id)
                    }
                } label: {
                    HStack(spacing: 14) {
                        Image(systemName: checkedReviewTasks.contains(task.id) ? "checkmark.circle.fill" : "circle")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(checkedReviewTasks.contains(task.id) ? AppTheme.mint : AppTheme.subtle)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(task.title)
                                .font(.headline)
                            Text(task.detail)
                                .font(.caption)
                                .foregroundStyle(AppTheme.subtle)
                        }
                        Spacer()
                    }
                    .padding(16)
                    .background(Color.white.opacity(0.065), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .glassPanel(radius: 34, border: AppTheme.lilac.opacity(0.28))
    }

    private var commandDock: some View {
        HStack(spacing: 12) {
            Button {
                withAnimation(.spring(response: 0.36, dampingFraction: 0.82)) {
                    selectedMode = .capture
                }
            } label: {
                Image(systemName: "viewfinder")
                    .font(.title3.weight(.bold))
                    .frame(width: 48, height: 48)
                    .background(Color.white.opacity(0.08), in: Circle())
            }
            .buttonStyle(.plain)

            Button {
                createCard()
            } label: {
                Label("生成认知卡片", systemImage: "wand.and.stars")
                    .font(.headline.weight(.heavy))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .background(
                        LinearGradient(colors: [AppTheme.mint, AppTheme.lilac], startPoint: .leading, endPoint: .trailing),
                        in: Capsule()
                    )
                    .foregroundStyle(Color(red: 0.02, green: 0.03, blue: 0.045))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 18)
        .padding(.top, 12)
        .padding(.bottom, 10)
        .background(.ultraThinMaterial)
    }

    private func createCard() {
        let entry = GardenEntry(
            title: selectedMood.generatedTitle,
            mood: selectedMood.title,
            scene: imageNote,
            question: questionNote,
            insight: selectedMood.generatedInsight,
            action: selectedMood.generatedAction,
            tint: selectedMood.colors[0],
            score: selectedMood.score
        )
        withAnimation(.spring(response: 0.46, dampingFraction: 0.82)) {
            generatedCard = entry
            garden.insert(entry, at: 0)
            selectedMode = .garden
            generationPulse += 1
        }
    }
}

struct GardenCard: View {
    let entry: GardenEntry
    let highlighted: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label(entry.mood, systemImage: highlighted ? "sparkle.magnifyingglass" : "leaf.fill")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(entry.tint)
                Spacer()
                Text("\\(entry.score)% 信号")
                    .font(.caption)
                    .foregroundStyle(AppTheme.subtle)
            }

            Text(entry.title)
                .font((highlighted ? Font.title2 : Font.headline).weight(.black))
                .lineLimit(2)
                .minimumScaleFactor(0.82)

            Text(entry.insight)
                .font(.subheadline)
                .foregroundStyle(AppTheme.subtle)
                .lineSpacing(4)

            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "arrowshape.turn.up.right.circle.fill")
                    .foregroundStyle(entry.tint)
                Text(entry.action)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(AppTheme.ink.opacity(0.82))
            }
            .padding(12)
            .background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .padding(highlighted ? 20 : 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: highlighted ? 30 : 24, style: .continuous))
        .background(
            LinearGradient(colors: [entry.tint.opacity(highlighted ? 0.20 : 0.10), Color.white.opacity(0.03)], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: highlighted ? 30 : 24, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: highlighted ? 30 : 24, style: .continuous)
                .stroke(entry.tint.opacity(highlighted ? 0.36 : 0.16), lineWidth: 1)
        )
    }
}

struct GardenEntry: Identifiable {
    let id = UUID()
    let title: String
    let mood: String
    let scene: String
    let question: String
    let insight: String
    let action: String
    let tint: Color
    let score: Int
    var dateLabel: String = "今天"

    static let featured = GardenEntry(
        title: "光线提醒你重新选择注意力",
        mood: "清醒",
        scene: "金色反光落在玻璃幕墙上。",
        question: "我真正想保护什么？",
        insight: "你不是缺更多输入，而是需要把注意力从噪声里收回来，给一个真实信号更多空间。",
        action: "今晚删除一个低价值输入，保留一个能继续追问的线索。",
        tint: AppTheme.mint,
        score: 86,
        dateLabel: "样例"
    )

    static let seed: [GardenEntry] = [
        GardenEntry(
            title: "把注意力从噪音里收回来",
            mood: "清醒",
            scene: "桌面很乱，但一束光只照亮了其中一本书。",
            question: "我到底在回避哪个选择？",
            insight: "你真正需要的不是更多信息，而是判断哪一个信号值得被留下。",
            action: "删除一个无关输入，保留一个真实线索。",
            tint: AppTheme.mint,
            score: 84,
            dateLabel: "样例"
        ),
        GardenEntry(
            title: "给还没成形的想法一点空气",
            mood: "温柔",
            scene: "雨后路面反光，像一张没有写完的纸。",
            question: "我是不是太快要求答案？",
            insight: "模糊不是失败，它可能是想法正在组合。",
            action: "把这个想法画成三个关键词。",
            tint: AppTheme.petal,
            score: 77,
            dateLabel: "昨天"
        )
    ]
}

struct MoodOption: Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let symbol: String
    let colors: [Color]
    let load: String
    let generatedTitle: String
    let generatedInsight: String
    let generatedAction: String
    let score: Int

    static let all: [MoodOption] = [
        MoodOption(
            id: "lucid",
            title: "清醒",
            subtitle: "提炼信号",
            symbol: "sun.max.fill",
            colors: [AppTheme.mint, AppTheme.aqua],
            load: "低",
            generatedTitle: "光线正在替你指出边界",
            generatedInsight: "这段画面不是随机出现的。它提醒你把模糊感受变成一个可命名的问题，再把问题压缩成一个今天能做的小动作。",
            generatedAction: "把最想保护的一件事写成一句话。",
            score: 88
        ),
        MoodOption(
            id: "gentle",
            title: "温柔",
            subtitle: "降低压力",
            symbol: "heart.text.square.fill",
            colors: [AppTheme.petal, AppTheme.lilac],
            load: "柔和",
            generatedTitle: "你可以慢一点，但不要放弃看见",
            generatedInsight: "今天的画面在提醒你，感受不必马上变成结论。先让它被准确命名，行动自然会变小、变清楚。",
            generatedAction: "给这件事取一个不责备自己的名字。",
            score: 81
        ),
        MoodOption(
            id: "mist",
            title: "迷雾",
            subtitle: "保存未知",
            symbol: "cloud.fog.fill",
            colors: [Color(red: 0.45, green: 0.56, blue: 0.78), AppTheme.aqua],
            load: "中",
            generatedTitle: "未知不是墙，是还没有命名的门",
            generatedInsight: "迷雾感说明你已经接近真实问题，但还缺一个角度。不要急着判断，先把不确定拆开。",
            generatedAction: "写下三个你不确定的词，不急着判断。",
            score: 73
        ),
        MoodOption(
            id: "brave",
            title: "勇敢",
            subtitle: "转成行动",
            symbol: "bolt.heart.fill",
            colors: [AppTheme.gold, AppTheme.petal],
            load: "高",
            generatedTitle: "你已经接近真正的问题",
            generatedInsight: "这个画面不是让你继续解释自己，而是在催促你把一个选择落地。先做最小的一步。",
            generatedAction: "把拖延最久的动作压缩成 15 分钟。",
            score: 92
        )
    ]
}

enum StudioMode: String, CaseIterable, Identifiable {
    case capture = "捕捉"
    case garden = "花园"
    case review = "复盘"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .capture: return "viewfinder"
        case .garden: return "leaf.circle"
        case .review: return "moon.stars"
        }
    }
}

struct ReviewTask: Identifiable {
    let id: String
    let title: String
    let detail: String

    static let all: [ReviewTask] = [
        ReviewTask(id: "signal", title: "留下一个高信号画面", detail: "今天最值得被保存的画面是什么？"),
        ReviewTask(id: "emotion", title: "确认主要情绪", detail: "不是评价自己，只标记现在的状态。"),
        ReviewTask(id: "action", title: "压缩成小行动", detail: "明天 15 分钟内可以完成的一步。")
    ]
}

struct SignalLens: View {
    let mood: MoodOption

    var body: some View {
        ZStack {
            Circle()
                .fill(LinearGradient(colors: mood.colors, startPoint: .topLeading, endPoint: .bottomTrailing))
                .shadow(color: mood.colors[0].opacity(0.42), radius: 22, x: 0, y: 12)
            Circle()
                .stroke(Color.white.opacity(0.42), lineWidth: 1)
                .padding(7)
            Image(systemName: mood.symbol)
                .font(.title2.weight(.black))
                .foregroundStyle(Color(red: 0.02, green: 0.03, blue: 0.045))
        }
    }
}

struct MetricPill: View {
    let icon: String
    let title: String
    let value: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .foregroundStyle(AppTheme.mint)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(AppTheme.subtle)
                Text(value)
                    .font(.callout.weight(.black))
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(Color.white.opacity(0.065), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

struct LumaBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.016, green: 0.020, blue: 0.032),
                    Color(red: 0.035, green: 0.056, blue: 0.070),
                    Color(red: 0.065, green: 0.047, blue: 0.072)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            VStack(spacing: 34) {
                ForEach(0..<9, id: \\.self) { index in
                    Capsule()
                        .fill(index.isMultiple(of: 2) ? AppTheme.mint.opacity(0.08) : AppTheme.lilac.opacity(0.07))
                        .frame(height: 2)
                        .rotationEffect(.degrees(-18))
                        .offset(x: index.isMultiple(of: 2) ? -70 : 54)
                }
            }
            .padding(.horizontal, -120)
            .opacity(0.72)

            LinearGradient(
                colors: [Color.clear, AppTheme.aqua.opacity(0.12), Color.clear, AppTheme.gold.opacity(0.10)],
                startPoint: .topTrailing,
                endPoint: .bottomLeading
            )
            .blendMode(.screen)
        }
    }
}

enum AppTheme {
    static let ink = Color(red: 0.96, green: 0.98, blue: 1.00)
    static let subtle = Color.white.opacity(0.66)
    static let mist = Color.white.opacity(0.58)
    static let mint = Color(red: 0.52, green: 0.94, blue: 0.74)
    static let aqua = Color(red: 0.36, green: 0.72, blue: 0.92)
    static let lilac = Color(red: 0.70, green: 0.58, blue: 0.98)
    static let petal = Color(red: 0.98, green: 0.55, blue: 0.72)
    static let gold = Color(red: 0.96, green: 0.76, blue: 0.42)
}

extension View {
    func glassPanel(radius: CGFloat, border: Color) -> some View {
        self
            .padding(18)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .background(
                LinearGradient(colors: [Color.white.opacity(0.13), Color.white.opacity(0.035)], startPoint: .topLeading, endPoint: .bottomTrailing),
                in: RoundedRectangle(cornerRadius: radius, style: .continuous)
            )
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(border, lineWidth: 1))
            .shadow(color: Color.black.opacity(0.28), radius: 32, x: 0, y: 22)
    }
}

#Preview {
    ContentView()
}
`
}

function buildWeatherBagChecklistContentSwift(demand: string): string {
  return `import SwiftUI

struct ContentView: View {
    @State private var packedItemIds: Set<String> = []
    @State private var selectedScene = "通勤"

    private let sections = BagChecklistSection.defaultSections
    private var totalCount: Int { sections.reduce(0) { $0 + $1.items.count } }
    private var packedCount: Int {
        sections.reduce(0) { total, section in
            total + section.items.filter { packedItemIds.contains($0.id) }.count
        }
    }
    private var progress: Double {
        totalCount == 0 ? 0 : Double(packedCount) / Double(totalCount)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    hero
                    scenePicker
                    ForEach(sections) { section in
                        ChecklistSectionCard(
                            section: section,
                            packedItemIds: $packedItemIds
                        )
                    }
                    readyCard
                }
                .padding(20)
            }
            .background(
                LinearGradient(
                    colors: [Color(red: 0.98, green: 0.94, blue: 0.91), Color(red: 0.89, green: 0.96, blue: 0.98)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .navigationTitle("包里晴雨")
        }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("今日外出")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                    Text("晴转多云 · 26°C")
                        .font(.largeTitle.weight(.bold))
                    Text("样例天气：待接入真实定位与天气 API 后，将按当地降雨、温度、紫外线和风力自动调整包包清单。")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                ZStack {
                    Circle()
                        .fill(Color.yellow.opacity(0.25))
                    Text("☀️")
                        .font(.system(size: 42))
                }
                .frame(width: 86, height: 86)
            }

            ProgressView(value: progress)
                .tint(Color(red: 0.92, green: 0.35, blue: 0.42))
            Text("\\(packedCount)/\\(totalCount) 已打钩，准备到 100% 就可以全武装出门。")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .padding(20)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var scenePicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("今天的场景")
                .font(.headline)
            HStack {
                ForEach(["通勤", "约会", "旅行", "夜归"], id: \\.self) { scene in
                    Button {
                        selectedScene = scene
                    } label: {
                        Text(scene)
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 9)
                            .background(selectedScene == scene ? Color.accentColor.opacity(0.18) : Color.white.opacity(0.7))
                            .foregroundStyle(selectedScene == scene ? Color.accentColor : Color.primary)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var readyCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(progress >= 1 ? "全武装出门" : "还差一点点")
                .font(.title3.weight(.bold))
            Text(progress >= 1 ? "天气、防护、补给和安全小物都确认好了。优雅出门。" : "优先确认雨伞/防晒、证件、手机电量和夜归安全物品。")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(Color.white.opacity(0.78))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

struct ChecklistSectionCard: View {
    let section: BagChecklistSection
    @Binding var packedItemIds: Set<String>

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(section.emoji)
                    .font(.title2)
                VStack(alignment: .leading, spacing: 3) {
                    Text(section.title)
                        .font(.headline)
                    Text(section.subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }

            ForEach(section.items) { item in
                Button {
                    toggle(item)
                } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: packedItemIds.contains(item.id) ? "checkmark.circle.fill" : "circle")
                            .font(.title3)
                            .foregroundStyle(packedItemIds.contains(item.id) ? Color.accentColor : Color.secondary)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(item.title)
                                .font(.subheadline.weight(.semibold))
                            Text(item.reason)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(18)
        .background(Color.white.opacity(0.82))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func toggle(_ item: BagChecklistItem) {
        if packedItemIds.contains(item.id) {
            packedItemIds.remove(item.id)
        } else {
            packedItemIds.insert(item.id)
        }
    }
}

struct BagChecklistSection: Identifiable {
    let id: String
    let emoji: String
    let title: String
    let subtitle: String
    let items: [BagChecklistItem]

    static let defaultSections: [BagChecklistSection] = [
        BagChecklistSection(
            id: "weather",
            emoji: "🌦️",
            title: "天气防护",
            subtitle: "根据当地天气优先提醒",
            items: [
                BagChecklistItem(id: "umbrella", title: "折叠伞或轻雨衣", reason: "降雨概率一高就先放进包里。"),
                BagChecklistItem(id: "sunscreen", title: "防晒霜与墨镜", reason: "紫外线强时保护皮肤和眼睛。"),
                BagChecklistItem(id: "cardigan", title: "薄外套", reason: "早晚温差或空调场景更稳。")
            ]
        ),
        BagChecklistSection(
            id: "beauty",
            emoji: "✨",
            title: "精致补给",
            subtitle: "优雅、干净、随时补状态",
            items: [
                BagChecklistItem(id: "lip", title: "润唇膏/口红", reason: "补气色，也防止干裂。"),
                BagChecklistItem(id: "powder", title: "小镜子与吸油纸", reason: "出汗或赶路后快速整理。"),
                BagChecklistItem(id: "hair", title: "发圈/小发夹", reason: "风大或运动时马上切换。")
            ]
        ),
        BagChecklistSection(
            id: "safety",
            emoji: "🛡️",
            title: "健康安全",
            subtitle: "认真严谨，不拿安全开玩笑",
            items: [
                BagChecklistItem(id: "power", title: "充电宝与数据线", reason: "夜归、打车、导航都靠它。"),
                BagChecklistItem(id: "medicine", title: "常用药/创可贴", reason: "头痛、过敏或磨脚时不慌。"),
                BagChecklistItem(id: "alarm", title: "紧急联系人快捷入口", reason: "不是放进包里，但必须出门前确认。")
            ]
        ),
        BagChecklistSection(
            id: "commute",
            emoji: "👜",
            title: "包包底仓",
            subtitle: "每天都该稳定存在的小物",
            items: [
                BagChecklistItem(id: "id", title: "证件/门禁/银行卡", reason: "少一样就可能影响行程。"),
                BagChecklistItem(id: "tissue", title: "纸巾与湿巾", reason: "餐厅、雨天、补妆都用得上。"),
                BagChecklistItem(id: "keys", title: "钥匙与耳机", reason: "回家和通勤体验的基本盘。")
            ]
        )
    ]
}

struct BagChecklistItem: Identifiable, Hashable {
    let id: String
    let title: String
    let reason: String
}

#Preview {
    ContentView()
}
`
}

function buildSimplifyAppWorkflowSwift(demand: string, synthesis: string, runId: string): string {
  const summary = compact((synthesis || demand).replace(/\s+/g, ' '), 180)
  if (isLumaSenseAppDemand(demand)) {
    return `import Foundation

struct WorkflowStep: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
    let status: String
}

struct WorkflowPlan {
    let runId: String
    let summary: String
    let steps: [WorkflowStep]
    let nextStep: String

    static let current = WorkflowPlan(
        runId: ${JSON.stringify(runId)},
        summary: ${JSON.stringify(summary)},
        steps: [
            WorkflowStep(title: "需求锁定", detail: "把视觉、心情、认知卡片、花园历史和每日复盘收成一个离线可跑的 SwiftUI 垂直切片。", status: "已完成"),
            WorkflowStep(title: "UI风格馆", detail: "吸收 Emotion Adaptive、Liquid Glass、Spatial Bento，转成现代 iPhone 安全区、底部命令 dock、情绪光谱和玻璃工作台。", status: "已落地"),
            WorkflowStep(title: "核心体验", detail: "首屏直接提供输入、情绪选择、生成卡片、保存历史和复盘仪式，不做空欢迎页。", status: "已落地"),
            WorkflowStep(title: "真实验证", detail: "本包附带 LaunchScreen 与 build-and-run.mjs，负责构建、安装、启动 Simulator 并保存截图。", status: "已写入"),
            WorkflowStep(title: "后续接入", detail: "下一轮再把离线生成替换为真实 AI、持久化和同步。", status: "下一步")
        ],
        nextStep: "先以 Simulator 截图验收这个真实运行切片，再决定是否接入模型服务和 CloudKit。"
    )
}
`
  }
  if (isWeatherBagAppDemand(demand)) {
    return `import Foundation

struct WorkflowStep: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
    let status: String
}

struct WorkflowPlan {
    let runId: String
    let summary: String
    let steps: [WorkflowStep]
    let nextStep: String

    static let current = WorkflowPlan(
        runId: ${JSON.stringify(runId)},
        summary: ${JSON.stringify(summary)},
        steps: [
            WorkflowStep(title: "天气与定位", detail: "接入真实天气 API，按城市、降雨、温度、紫外线和风力生成包包建议。", status: "下一步"),
            WorkflowStep(title: "包包清单", detail: "把天气防护、精致补给、健康安全、通勤底仓做成可打钩列表。", status: "已落首屏"),
            WorkflowStep(title: "场景模式", detail: "通勤、约会、旅行、夜归会影响推荐物品和文案语气。", status: "已占位"),
            WorkflowStep(title: "严谨验收", detail: "未接实时天气时必须标明样例天气，不能假装拿到真实数据。", status: "已写入")
        ],
        nextStep: "优先接入 WeatherKit 或可信天气 API，再把样例天气替换为真实当地天气。"
    )
}
`
  }
  return `import Foundation

struct WorkflowStep: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
    let status: String
}

struct WorkflowPlan {
    let runId: String
    let summary: String
    let steps: [WorkflowStep]
    let nextStep: String

    static let current = WorkflowPlan(
        runId: ${JSON.stringify(runId)},
        summary: ${JSON.stringify(summary)},
        steps: [
            WorkflowStep(title: "先定方案", detail: "把需求收成一个可执行 App 骨架。", status: "已完成"),
            WorkflowStep(title: "创建工程", detail: "本地写入 SwiftUI 源码和 Xcode 工程。", status: "已生成"),
            WorkflowStep(title: "跑验证", detail: "用 xcodebuild 检查 iOS Simulator 构建。", status: "看结果"),
            WorkflowStep(title: "继续迭代", detail: "补真实业务数据、界面细节和端到端验收。", status: "下一步")
        ],
        nextStep: "从这个 SwiftUI 起点继续补业务功能；每次改动后重新跑构建和真机/模拟器检查。"
    )
}
`
}

function buildSimplifyAppPbxproj(projectName: string, bundleId: string): string {
  return `// !$*UTF8*$!
{
	archiveVersion = 1;
	classes = {
	};
	objectVersion = 60;
	objects = {

/* Begin PBXBuildFile section */
		000000000000000000000101 /* ${projectName}App.swift in Sources */ = {isa = PBXBuildFile; fileRef = 000000000000000000000201 /* ${projectName}App.swift */; };
		000000000000000000000102 /* ContentView.swift in Sources */ = {isa = PBXBuildFile; fileRef = 000000000000000000000202 /* ContentView.swift */; };
		000000000000000000000103 /* WorkflowPlan.swift in Sources */ = {isa = PBXBuildFile; fileRef = 000000000000000000000203 /* WorkflowPlan.swift */; };
		000000000000000000000104 /* Assets.xcassets in Resources */ = {isa = PBXBuildFile; fileRef = 000000000000000000000204 /* Assets.xcassets */; };
		000000000000000000000105 /* LaunchScreen.storyboard in Resources */ = {isa = PBXBuildFile; fileRef = 000000000000000000000206 /* LaunchScreen.storyboard */; };
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
		000000000000000000000201 /* ${projectName}App.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ${projectName}App.swift; sourceTree = "<group>"; };
		000000000000000000000202 /* ContentView.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ContentView.swift; sourceTree = "<group>"; };
		000000000000000000000203 /* WorkflowPlan.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = WorkflowPlan.swift; sourceTree = "<group>"; };
		000000000000000000000204 /* Assets.xcassets */ = {isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = Assets.xcassets; sourceTree = "<group>"; };
		000000000000000000000205 /* ${projectName}.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = ${projectName}.app; sourceTree = BUILT_PRODUCTS_DIR; };
		000000000000000000000206 /* LaunchScreen.storyboard */ = {isa = PBXFileReference; lastKnownFileType = file.storyboard; path = LaunchScreen.storyboard; sourceTree = "<group>"; };
/* End PBXFileReference section */

/* Begin PBXFrameworksBuildPhase section */
		000000000000000000000301 /* Frameworks */ = {
			isa = PBXFrameworksBuildPhase;
			buildActionMask = 2147483647;
			files = (
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
		000000000000000000000401 = {
			isa = PBXGroup;
			children = (
				000000000000000000000402 /* ${projectName} */,
				000000000000000000000405 /* Products */,
			);
			sourceTree = "<group>";
		};
		000000000000000000000402 /* ${projectName} */ = {
			isa = PBXGroup;
			children = (
				000000000000000000000201 /* ${projectName}App.swift */,
				000000000000000000000202 /* ContentView.swift */,
				000000000000000000000403 /* Features */,
				000000000000000000000204 /* Assets.xcassets */,
				000000000000000000000206 /* LaunchScreen.storyboard */,
			);
			path = ${projectName};
			sourceTree = "<group>";
		};
		000000000000000000000403 /* Features */ = {
			isa = PBXGroup;
			children = (
				000000000000000000000203 /* WorkflowPlan.swift */,
			);
			path = Features;
			sourceTree = "<group>";
		};
		000000000000000000000405 /* Products */ = {
			isa = PBXGroup;
			children = (
				000000000000000000000205 /* ${projectName}.app */,
			);
			name = Products;
			sourceTree = "<group>";
		};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
		000000000000000000000501 /* ${projectName} */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = 000000000000000000000701 /* Build configuration list for PBXNativeTarget "${projectName}" */;
			buildPhases = (
				000000000000000000000601 /* Sources */,
				000000000000000000000301 /* Frameworks */,
				000000000000000000000602 /* Resources */,
			);
			buildRules = (
			);
			dependencies = (
			);
			name = ${projectName};
			productName = ${projectName};
			productReference = 000000000000000000000205 /* ${projectName}.app */;
			productType = "com.apple.product-type.application";
		};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
		000000000000000000000001 /* Project object */ = {
			isa = PBXProject;
			attributes = {
				BuildIndependentTargetsInParallel = 1;
				LastSwiftUpdateCheck = 1600;
				LastUpgradeCheck = 1600;
				TargetAttributes = {
					000000000000000000000501 = {
						CreatedOnToolsVersion = 16.0;
					};
				};
			};
			buildConfigurationList = 000000000000000000000702 /* Build configuration list for PBXProject "${projectName}" */;
			compatibilityVersion = "Xcode 15.0";
			developmentRegion = en;
			hasScannedForEncodings = 0;
			knownRegions = (
				en,
				Base,
			);
			mainGroup = 000000000000000000000401;
			productRefGroup = 000000000000000000000405 /* Products */;
			projectDirPath = "";
			projectRoot = "";
			targets = (
				000000000000000000000501 /* ${projectName} */,
			);
		};
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
		000000000000000000000602 /* Resources */ = {
			isa = PBXResourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				000000000000000000000104 /* Assets.xcassets in Resources */,
				000000000000000000000105 /* LaunchScreen.storyboard in Resources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
		000000000000000000000601 /* Sources */ = {
			isa = PBXSourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				000000000000000000000101 /* ${projectName}App.swift in Sources */,
				000000000000000000000102 /* ContentView.swift in Sources */,
				000000000000000000000103 /* WorkflowPlan.swift in Sources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXSourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
		000000000000000000000801 /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				ALWAYS_SEARCH_USER_PATHS = NO;
				CLANG_ANALYZER_NONNULL = YES;
				CLANG_ANALYZER_NUMBER_OBJECT_CONVERSION = YES_AGGRESSIVE;
				CLANG_CXX_LANGUAGE_STANDARD = "gnu++20";
				CLANG_ENABLE_MODULES = YES;
				CLANG_ENABLE_OBJC_ARC = YES;
				CLANG_ENABLE_OBJC_WEAK = YES;
				CLANG_WARN_BLOCK_CAPTURE_AUTORELEASING = YES;
				CLANG_WARN_BOOL_CONVERSION = YES;
				CLANG_WARN_COMMA = YES;
				CLANG_WARN_CONSTANT_CONVERSION = YES;
				CLANG_WARN_DEPRECATED_OBJC_IMPLEMENTATIONS = YES;
				CLANG_WARN_DIRECT_OBJC_ISA_USAGE = YES_ERROR;
				CLANG_WARN_DOCUMENTATION_COMMENTS = YES;
				CLANG_WARN_EMPTY_BODY = YES;
				CLANG_WARN_ENUM_CONVERSION = YES;
				CLANG_WARN_INFINITE_RECURSION = YES;
				CLANG_WARN_INT_CONVERSION = YES;
				CLANG_WARN_NON_LITERAL_NULL_CONVERSION = YES;
				CLANG_WARN_OBJC_IMPLICIT_RETAIN_SELF = YES;
				CLANG_WARN_OBJC_LITERAL_CONVERSION = YES;
				CLANG_WARN_OBJC_ROOT_CLASS = YES_ERROR;
				CLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER = YES;
				CLANG_WARN_RANGE_LOOP_ANALYSIS = YES;
				CLANG_WARN_STRICT_PROTOTYPES = YES;
				CLANG_WARN_SUSPICIOUS_MOVE = YES;
				CLANG_WARN_UNGUARDED_AVAILABILITY = YES_AGGRESSIVE;
				CLANG_WARN_UNREACHABLE_CODE = YES;
				CLANG_WARN__DUPLICATE_METHOD_MATCH = YES;
				COPY_PHASE_STRIP = NO;
				DEBUG_INFORMATION_FORMAT = dwarf;
				ENABLE_STRICT_OBJC_MSGSEND = YES;
				ENABLE_TESTABILITY = YES;
				ENABLE_USER_SCRIPT_SANDBOXING = YES;
				GCC_C_LANGUAGE_STANDARD = gnu17;
				GCC_DYNAMIC_NO_PIC = NO;
				GCC_NO_COMMON_BLOCKS = YES;
				GCC_OPTIMIZATION_LEVEL = 0;
				GCC_PREPROCESSOR_DEFINITIONS = (
					"DEBUG=1",
					"$(inherited)",
				);
				GCC_WARN_64_TO_32_BIT_CONVERSION = YES;
				GCC_WARN_ABOUT_RETURN_TYPE = YES_ERROR;
				GCC_WARN_UNDECLARED_SELECTOR = YES;
				GCC_WARN_UNINITIALIZED_AUTOS = YES_AGGRESSIVE;
				GCC_WARN_UNUSED_FUNCTION = YES;
				GCC_WARN_UNUSED_VARIABLE = YES;
				IPHONEOS_DEPLOYMENT_TARGET = 17.0;
				MTL_ENABLE_DEBUG_INFO = INCLUDE_SOURCE;
				MTL_FAST_MATH = YES;
				ONLY_ACTIVE_ARCH = YES;
				SDKROOT = iphoneos;
				SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;
				SWIFT_OPTIMIZATION_LEVEL = "-Onone";
			};
			name = Debug;
		};
		000000000000000000000802 /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				ALWAYS_SEARCH_USER_PATHS = NO;
				CLANG_ANALYZER_NONNULL = YES;
				CLANG_ANALYZER_NUMBER_OBJECT_CONVERSION = YES_AGGRESSIVE;
				CLANG_CXX_LANGUAGE_STANDARD = "gnu++20";
				CLANG_ENABLE_MODULES = YES;
				CLANG_ENABLE_OBJC_ARC = YES;
				CLANG_ENABLE_OBJC_WEAK = YES;
				CLANG_WARN_BLOCK_CAPTURE_AUTORELEASING = YES;
				CLANG_WARN_BOOL_CONVERSION = YES;
				CLANG_WARN_COMMA = YES;
				CLANG_WARN_CONSTANT_CONVERSION = YES;
				CLANG_WARN_DEPRECATED_OBJC_IMPLEMENTATIONS = YES;
				CLANG_WARN_DIRECT_OBJC_ISA_USAGE = YES_ERROR;
				CLANG_WARN_DOCUMENTATION_COMMENTS = YES;
				CLANG_WARN_EMPTY_BODY = YES;
				CLANG_WARN_ENUM_CONVERSION = YES;
				CLANG_WARN_INFINITE_RECURSION = YES;
				CLANG_WARN_INT_CONVERSION = YES;
				CLANG_WARN_NON_LITERAL_NULL_CONVERSION = YES;
				CLANG_WARN_OBJC_IMPLICIT_RETAIN_SELF = YES;
				CLANG_WARN_OBJC_LITERAL_CONVERSION = YES;
				CLANG_WARN_OBJC_ROOT_CLASS = YES_ERROR;
				CLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER = YES;
				CLANG_WARN_RANGE_LOOP_ANALYSIS = YES;
				CLANG_WARN_STRICT_PROTOTYPES = YES;
				CLANG_WARN_SUSPICIOUS_MOVE = YES;
				CLANG_WARN_UNGUARDED_AVAILABILITY = YES_AGGRESSIVE;
				CLANG_WARN_UNREACHABLE_CODE = YES;
				CLANG_WARN__DUPLICATE_METHOD_MATCH = YES;
				COPY_PHASE_STRIP = NO;
				DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";
				ENABLE_NS_ASSERTIONS = NO;
				ENABLE_STRICT_OBJC_MSGSEND = YES;
				ENABLE_USER_SCRIPT_SANDBOXING = YES;
				GCC_C_LANGUAGE_STANDARD = gnu17;
				GCC_NO_COMMON_BLOCKS = YES;
				GCC_WARN_64_TO_32_BIT_CONVERSION = YES;
				GCC_WARN_ABOUT_RETURN_TYPE = YES_ERROR;
				GCC_WARN_UNDECLARED_SELECTOR = YES;
				GCC_WARN_UNINITIALIZED_AUTOS = YES_AGGRESSIVE;
				GCC_WARN_UNUSED_FUNCTION = YES;
				GCC_WARN_UNUSED_VARIABLE = YES;
				IPHONEOS_DEPLOYMENT_TARGET = 17.0;
				MTL_ENABLE_DEBUG_INFO = NO;
				MTL_FAST_MATH = YES;
				SDKROOT = iphoneos;
				SWIFT_COMPILATION_MODE = wholemodule;
				VALIDATE_PRODUCT = YES;
			};
			name = Release;
		};
		000000000000000000000803 /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
				ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;
				CODE_SIGN_STYLE = Automatic;
				CURRENT_PROJECT_VERSION = 1;
				DEVELOPMENT_TEAM = "";
				ENABLE_PREVIEWS = YES;
				GENERATE_INFOPLIST_FILE = YES;
				INFOPLIST_KEY_CFBundleDisplayName = ${projectName};
				INFOPLIST_KEY_UILaunchStoryboardName = LaunchScreen;
				INFOPLIST_KEY_UIStatusBarStyle = UIStatusBarStyleLightContent;
				INFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents = YES;
				INFOPLIST_KEY_UIUserInterfaceStyle = Dark;
				IPHONEOS_DEPLOYMENT_TARGET = 17.0;
				MARKETING_VERSION = 1.0;
				PRODUCT_BUNDLE_IDENTIFIER = ${bundleId};
				PRODUCT_NAME = "$(TARGET_NAME)";
				SUPPORTED_PLATFORMS = "iphoneos iphonesimulator";
				SUPPORTS_MACCATALYST = NO;
				SWIFT_EMIT_LOC_STRINGS = YES;
				SWIFT_VERSION = 5.0;
				TARGETED_DEVICE_FAMILY = 1;
			};
			name = Debug;
		};
		000000000000000000000804 /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
				ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;
				CODE_SIGN_STYLE = Automatic;
				CURRENT_PROJECT_VERSION = 1;
				DEVELOPMENT_TEAM = "";
				ENABLE_PREVIEWS = YES;
				GENERATE_INFOPLIST_FILE = YES;
				INFOPLIST_KEY_CFBundleDisplayName = ${projectName};
				INFOPLIST_KEY_UILaunchStoryboardName = LaunchScreen;
				INFOPLIST_KEY_UIStatusBarStyle = UIStatusBarStyleLightContent;
				INFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents = YES;
				INFOPLIST_KEY_UIUserInterfaceStyle = Dark;
				IPHONEOS_DEPLOYMENT_TARGET = 17.0;
				MARKETING_VERSION = 1.0;
				PRODUCT_BUNDLE_IDENTIFIER = ${bundleId};
				PRODUCT_NAME = "$(TARGET_NAME)";
				SUPPORTED_PLATFORMS = "iphoneos iphonesimulator";
				SUPPORTS_MACCATALYST = NO;
				SWIFT_EMIT_LOC_STRINGS = YES;
				SWIFT_VERSION = 5.0;
				TARGETED_DEVICE_FAMILY = 1;
			};
			name = Release;
		};
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
		000000000000000000000701 /* Build configuration list for PBXNativeTarget "${projectName}" */ = {
			isa = XCConfigurationList;
			buildConfigurations = (
				000000000000000000000803 /* Debug */,
				000000000000000000000804 /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Release;
		};
		000000000000000000000702 /* Build configuration list for PBXProject "${projectName}" */ = {
			isa = XCConfigurationList;
			buildConfigurations = (
				000000000000000000000801 /* Debug */,
				000000000000000000000802 /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Release;
		};
/* End XCConfigurationList section */
	};
	rootObject = 000000000000000000000001 /* Project object */;
}
`
}

async function defaultSynthesizeFinal(context: OpenbasakaMissionStepContext): Promise<MissionStepOutcome> {
  let content = ''
  let recoveredFrom = ''
  const kind = classifySimplifyDemand(context.demand)
  if (!isModelConfigured(context.llmConfig)) {
    recoveredFrom = 'model_not_configured'
    content = buildDeterministicMissionBlueprint(context, 'final')
  } else {
    try {
      content = await withTimeout(
        chatCompletion(
          context.llmConfig,
          [
            {
              role: 'system',
              content:
                '你是 Openbasaka 化繁为简总控。只能基于本轮真实步骤回执合成最终结果；不要声称执行了没有证据的事情。输出给 Boss 的最终答案要清楚、可行动、带下一步。遇到 App、PRD、知识任务或自动化任务时，要给出对应的落地入口、文件/记录位置、运行方式、验证状态和下一步。不要把 Boss 点名的审美与体验要求删掉，要落成具体体验。用户可见正文不要用内部故障开场；证据链保留在 metadata 即可。',
            },
            {
              role: 'user',
              content: `Boss 原话：${context.demand}\n\n本轮类型：${kind}\n\n本轮真实回执：\n${formatPreviousOutcomes(context.previous)}\n\n请合成最终结果。必须包含：1. 本轮结果 2. 产物/记录入口 3. 文件或项目落点 4. 运行或使用方式 5. 验证状态 6. 下一步。若没有真实创建代码或文件，必须明确写“未创建/未验证”，并说明需要 Boss 确认的边界。`,
            },
          ],
          0.32,
          2600,
        ),
        FINAL_SYNTHESIS_TIMEOUT_MS,
        'final_synthesis_timeout',
      )
    } catch (error) {
      recoveredFrom = error instanceof Error ? error.message : String(error)
      content = buildDeterministicMissionBlueprint(context, 'final')
    }
  }
  const appDelivery = kind === 'app' ? await materializeSimplifyAppDelivery(context, content) : undefined
  const moduleDelivery = await materializeSimplifyModuleArtifacts(context, kind, content).catch((error) => ({
    artifacts: [],
    evidenceRefs: ['module-materialization:failed'],
    error: error instanceof Error ? error.message : String(error),
  }))
  const deliverable = buildSimplifyMissionDeliverable(context, kind, content, appDelivery, moduleDelivery)
  return {
    outputPreview: compact(content, 900),
    metadata: {
      serviceName: [
        recoveredFrom ? 'mission-final-synthesis + deterministicRecovery' : 'mission-final-synthesis',
        appDelivery ? 'app-delivery-materializer' : '',
        moduleDelivery.artifacts.length ? 'module-artifact-materializer' : '',
      ].filter(Boolean).join(' + '),
      artifactId: context.run.id,
      evidenceRefs: [
        recoveredFrom ? 'deterministic:final' : 'chatCompletion',
        ...collectOutcomeEvidence(context.previous).slice(0, 8),
        ...(appDelivery?.evidenceRefs || []),
        ...moduleDelivery.evidenceRefs,
      ],
      progressDetail: content,
      recoveredFrom,
      deliverable,
      appDelivery,
      moduleDelivery,
    },
  }
}

async function defaultWriteMemory(context: OpenbasakaMissionStepContext): Promise<MissionStepOutcome> {
  const finalOutcome = context.previous[context.previous.length - 1]
  const memoryContent = [
    `Boss 一句话：${context.demand}`,
    `最终结果：${finalOutcome?.outputPreview || context.run.resultPreview}`,
    `真实证据：${collectOutcomeEvidence(context.previous).slice(0, 10).join('；') || '见 operating_events'}`,
  ].join('\n')
  const memoryId = await dbSaveMemory('goal', memoryContent, `openbasaka mission ${context.run.id}`, 0.88)
  return {
    outputPreview: `本轮任务已完成并写回长期记忆：${memoryId}。${finalOutcome?.outputPreview || ''}`.trim(),
    metadata: {
      serviceName: 'dbSaveMemory',
      artifactId: memoryId,
      evidenceRefs: [memoryId, ...collectOutcomeEvidence(context.previous).slice(0, 8)],
      progressDetail: memoryContent,
    },
  }
}

function isModelConfigured(config: LLMConfig): boolean {
  return config.provider === 'ollama' || Boolean(config.apiKey?.trim())
}

function missionServiceName(nodeId: string): string {
  const names: Record<string, string> = {
    control: 'model-preflight',
    boss: 'chatCompletion',
    knowledge: 'queryWikiEnhanced',
    workflow: 'executeWorkflow',
    teams: 'runTeamSession',
    scheduler: 'scheduled_tasks-preflight',
    audit: 'buildOpenbasakaSelfAuditReport',
    memory: 'chatCompletion + dbSaveMemory',
    xiaobai: 'xiaobai-execution-translator',
  }
  return names[nodeId] || nodeId
}

function buildMissionWorkflow(runId: string): Workflow {
  return {
    id: `wf_simplify_${runId}`,
    name: '化繁为简任务工作流',
    nameEn: 'Simplify Mission Workflow',
    goal: '把 Boss 一句话转成有证据、有协作、有反证、有下一步的最终成果。',
    status: 'active',
    agents: [
      { role: 'general', skills: [] },
      { role: 'strategy', skills: [] },
      { role: 'critic', skills: [] },
    ],
    steps: [
      {
        id: 'understand',
        agentRole: 'general',
        task: '读懂 Boss 的一句话，提炼真实目标、隐含约束和最可能想要的最终成果。',
        dependsOn: [],
        outputKey: 'intent',
      },
      {
        id: 'plan',
        agentRole: 'strategy',
        task: '把目标拆成可执行路径，明确顺序、模块分工、证据需求和验收方式。',
        dependsOn: ['understand'],
        outputKey: 'plan',
      },
      {
        id: 'review',
        agentRole: 'critic',
        task: '做反证审查：找出过度承诺、缺证据、需要 Boss 明确确认的动作和下一轮验证点。',
        dependsOn: ['plan'],
        outputKey: 'review',
      },
    ],
  }
}

async function createMissionTeam(context: OpenbasakaMissionStepContext): Promise<Team> {
  const teamId = await createTeam({
    name: `化繁为简 Mission 群策｜${compact(context.demand, 24)}`,
    description: `围绕 Boss 一句话任务自动编组：${context.demand}`,
    teamType: 'brainstorm',
    agents: [
      { agentId: 'general', role: '总控主持', skills: [] },
      { agentId: 'strategy', role: '战略拆解', skills: [] },
      { agentId: 'technical', role: '技术执行', skills: [] },
      { agentId: 'visual', role: '体验视觉', skills: [] },
      { agentId: 'critic', role: '反方审查', skills: [] },
    ],
    config: {
      communicationPattern: 'sequential',
      workflowType: 'build',
      executionMode: 'supervised',
      capabilities: ['prd', 'review', 'web-search'],
      temperature: 0.52,
    },
  })
  const team = await getTeam(teamId)
  if (!team) throw new Error('群策团队创建后无法读取。')
  return team
}

function buildMissionInput(context: OpenbasakaMissionStepContext): string {
  return [
    `Boss 原话：${context.demand}`,
    '',
    '## 已完成真实回执',
    formatPreviousOutcomes(context.previous) || '暂无，当前是第一轮真实执行。',
    '',
    '## 安全边界',
    '可以真实调用知识、群策、工作流、自省、记忆等内部服务；不得自动执行删除、文件写入、外部发送、系统权限、账号密钥等敏感动作，必须停在待确认状态等 Boss 点头。',
  ].join('\n')
}

function isBlockedTeamAction(action: { toolId: string; risk: string; requiresApproval: boolean; title: string }): boolean {
  if (action.risk === 'high') return true
  if (action.toolId === 'file_write' || action.toolId === 'desktop_control' || action.toolId === 'xcode_action') return true
  if (action.requiresApproval && /删除|密钥|密码|发布|发送|上传|权限|付款|sudo|rm\s+-rf/i.test(action.title)) return true
  return false
}

function actionBoundaryLabel(risk: string): string {
  if (risk === 'high') return '需确认'
  if (risk === 'medium') return '需留意'
  return '可建议'
}

function teamSessionQualityBlocker(session: { status?: string; summary?: string }): string {
  const summary = session.summary || ''
  if (session.status === 'failed') return compact(summary || 'Team Engine 会话失败，等待重跑群策。', 180)
  if (/生成失败|模型主持人没有稳定返回|质量闸门不能把返修清单当作正文交付|会话失败/.test(summary)) {
    return compact(summary, 180)
  }
  return ''
}

function formatTeamMessagesForRepair(session: TeamSession, capturedMessages: TeamMessage[]): string {
  const byId = new Map<string, TeamMessage>()
  for (const message of [...session.messages, ...capturedMessages]) {
    byId.set(message.id, message)
  }
  const meaningful = Array.from(byId.values())
    .filter((message) => {
      if (!message.content?.trim()) return false
      if (message.kind === 'error') return true
      if (message.kind === 'brief' || message.kind === 'artifact' || message.kind === 'reflection') return true
      if (message.role === 'assistant' && !/正在|已启动|能力清单|执行权限|项目生成路径/.test(message.content)) return true
      return false
    })
    .map((message) => {
      const label = [message.agentName || message.agentId, message.kind || message.role].filter(Boolean).join(' / ')
      return `### ${label}\n${message.content.trim()}`
    })
    .join('\n\n')
  return compact(meaningful || session.summary || capturedMessages.map((message) => message.content).join('\n'), 5200)
}

function isUsableTeamRepair(content: string): boolean {
  const normalized = content.trim()
  if (normalized.length < 420) return false
  if (/生成失败|模型主持人没有稳定返回|质量闸门不能把返修清单当作正文交付|会话失败/.test(normalized)) {
    return false
  }
  return /产品|体验|MVP|下一步|清单|流程|定位/.test(normalized)
}

function buildSyntheticWorkflowFailure(workflow: Workflow, error: unknown): WorkflowRun {
  const message = error instanceof Error ? error.message : String(error)
  return {
    id: `wf_timeout_${generateId()}`,
    workflowId: workflow.id,
    results: {
      intent: `步骤未在限定时间内返回：${message}`,
      __error: message,
      __failedStepId: 'timeout',
    },
    status: 'failed',
    createdAt: new Date().toISOString(),
    error: message,
    failedStepId: 'timeout',
  }
}

function deterministicTeamCouncilOutcome(
  context: OpenbasakaMissionStepContext,
  sessionId: string,
  messages: TeamMessage[],
  actions: TeamAction[],
  qualityBlocker: string,
): MissionStepOutcome {
  const content = buildDeterministicMissionBlueprint(context, 'teams')
  return {
    outputPreview: compact(content, 900),
    metadata: {
      serviceName: 'runTeamSession + deterministicRecovery',
      artifactId: sessionId,
      evidenceRefs: [
        sessionId,
        ...messages.slice(-4).map((message) => message.id),
        ...actions.slice(0, 4).map((action) => action.id),
        ...collectOutcomeEvidence(context.previous).slice(0, 6),
      ],
      progressDetail: content,
      recoveredFrom: qualityBlocker,
    },
  }
}

function buildDeterministicMissionBlueprint(
  context: OpenbasakaMissionStepContext,
  stage: 'workflow' | 'teams' | 'final',
): string {
  const evidenceRefs = collectOutcomeEvidence(context.previous).slice(0, 8)
  const evidenceText = evidenceRefs.length
    ? evidenceRefs.map((ref) => `- ${ref}`).join('\n')
    : '- Boss 原话已进入本轮任务，并形成可继续推进的执行上下文。'
  const kind = classifySimplifyDemand(context.demand)
  const heading =
    stage === 'workflow'
      ? '### 化繁为简｜工作流成果蓝图'
      : stage === 'teams'
        ? '### 化繁为简｜群策成效看板'
        : '### 化繁为简｜本轮结果'

  if (kind === 'app') {
    if (isWormholeLandlordAppDemand(context.demand)) {
      return buildWormholeLandlordAppBlueprint(context, heading, evidenceText)
    }
    if (isLumaSenseAppDemand(context.demand)) {
      return buildLumaSenseAppBlueprint(context, heading, evidenceText)
    }
    if (isWeatherBagAppDemand(context.demand)) {
      return buildWeatherBagAppBlueprint(context, heading, evidenceText)
    }
    return [
      heading,
      '',
      '#### 1. 本轮结果',
      `已把「${compact(context.demand, 72)}」整理成 App 开工包：先定产品骨架，再生成本地 SwiftUI 工程，并尽量跑一次构建验证。`,
      '',
      '#### 2. App 方案',
      '- 一句话定位：把 Boss 的需求变成一个可点、可测、可迭代的 iOS 产品。',
      '- 首屏必须直接承载核心任务，不做空泛欢迎页。',
      '- 先做 3 个关键状态：首次进入、核心操作、完成/失败反馈。',
      '- 所有体验要求都要转成界面、状态、文案和验收标准。',
      '',
      '#### 3. 项目落点',
      `- 项目目录：/Users/apple/Desktop/【项目的游戏】/deliveries/${context.run.id}/ios-app`,
      '- 代码入口：OpenbasakaBossApp.xcodeproj、README.md、OpenbasakaBossAppApp.swift、ContentView.swift、Features/WorkflowPlan.swift。',
      '- 当前状态：最终结果会显示是否已经写入文件，以及 xcodebuild 是否通过。',
      '',
      '#### 4. 运行与验证',
      '- 运行：用 Xcode 打开工程，或跑结果面板里的 xcodebuild 命令。',
      '- 验证线：能编译、首屏不空白、核心按钮可点、失败态可见、截图留证。',
      '',
      '#### 5. 下一步',
      '若构建通过，继续补业务界面；若构建受阻，先处理结果面板里的 Xcode 环境或编译错误。',
      '',
      '#### 6. 本轮真实依据',
      evidenceText,
    ].join('\n')
  }

  if (kind === 'prd') {
    return [
      heading,
      '',
      '#### 1. 本轮结果',
      `已把「${compact(context.demand, 72)}」整理成 PRD 交付路径。`,
      '',
      '#### 2. PRD 骨架',
      '- 目标：说明要解决的问题和成功标准。',
      '- 范围：明确做什么、不做什么。',
      '- 用户流程：入口、关键动作、完成态、失败态。',
      '- 验收：每条需求都有可检查标准。',
      '',
      '#### 3. 记录入口',
      `- 本轮记录：openbasaka_runs/${context.run.id}#prd`,
      '- 当前状态：可进入评审；若要落成文件，需要 Boss 确认导出位置。',
      '',
      '#### 4. 下一步',
      '交给小白评审或真人评测，按缺口补齐证据和交互细节。',
      '',
      '#### 5. 本轮真实依据',
      evidenceText,
    ].join('\n')
  }

  if (kind === 'knowledge') {
    return [
      heading,
      '',
      '#### 1. 本轮结果',
      `已把「${compact(context.demand, 72)}」转成知识任务路径。`,
      '',
      '#### 2. 交付入口',
      '- 来源：优先看知识＋大佬和本轮引用。',
      '- 结果：输出结论、证据、缺口、下一步。',
      '- 当前状态：没有来源时必须标明，不把推测当事实。',
      '',
      '#### 3. 下一步',
      '补充网页、PDF、视频或笔记来源后，再生成可引用版本。',
      '',
      '#### 4. 本轮真实依据',
      evidenceText,
    ].join('\n')
  }

  if (kind === 'automation') {
    return [
      heading,
      '',
      '#### 1. 本轮结果',
      `已把「${compact(context.demand, 72)}」整理成自动化候选。`,
      '',
      '#### 2. 配置边界',
      '- 触发：先确认频率、时间和输入来源。',
      '- 输出：明确写到哪里、通知谁、是否需要记录。',
      '- 权限：本轮不自动启用任务，不外发，不改权限。',
      '',
      '#### 3. 下一步',
      '系统先生成禁用状态的定时候选；Boss 确认频率、权限和输出位置后，再试跑并手动开启。',
      '',
      '#### 4. 本轮真实依据',
      evidenceText,
    ].join('\n')
  }

  return [
    heading,
    '',
    '#### 1. 本轮结果',
    `已把「${compact(context.demand, 72)}」压缩成可执行路径。`,
    '',
    '#### 2. 路线',
    '- 先读懂目标和边界。',
    '- 只调用本轮必要模块。',
    '- 产出结果、下一步和证据入口。',
    '',
    '#### 3. 下一步',
    '按结果面板继续推进；涉及写文件、外发、账号、权限或删除时先停下确认。',
    '',
    '#### 4. 本轮真实依据',
    evidenceText,
  ].join('\n')
}

function buildWeatherBagAppBlueprint(
  context: OpenbasakaMissionStepContext,
  heading: string,
  evidenceText: string,
): string {
  return [
    heading,
    '',
    '#### 1. 本轮结果',
    `已把「${compact(context.demand, 72)}」整理成一款 iOS App 开工包：它不是普通待办，而是“当地天气 + 女性外出场景 + 包包清单 + 打钩出门”的细致助手。`,
    '',
    '#### 2. 产品定位',
    '- 产品名：包里晴雨 / Weather Bag Checklist。',
    '- 一句话定位：出门前看一眼天气和当天场景，App 用优雅卡通的方式提醒女性包里该带什么，确认后安心出门。',
    '- 目标用户：通勤、约会、旅行、带娃、运动、看展等需要快速准备包包的女性。',
    '- 情绪价值：不是命令式提醒，而是像贴心朋友一样把防晒、雨具、补妆、安全、健康、通勤小物都想在前面。',
    '',
    '#### 3. 核心功能',
    '- 天气感知：按当地温度、降雨、紫外线、风力生成今日重点。',
    '- 包包清单：天气防护、精致补给、健康安全、通勤应急四组打钩项。',
    '- 场景模式：通勤、约会、旅行、运动、夜归，不同场景自动增减物品。',
    '- 完成反馈：打钩到 100% 后显示“全武装出门”。',
    '- 严谨边界：天气数据、定位权限和健康建议必须透明，不能假装已经拿到实时天气。',
    '',
    '#### 4. 首版界面',
    '- 首屏直接显示今日天气卡、完成度、四组包包清单和下一步。',
    '- 视觉要求：柔和但不幼稚，卡通感来自插画化天气和圆润图标，排版保持优雅、可扫读。',
    '- 交互要求：每个物品都有“为什么带它”的短说明，方便用户判断是否需要。',
    '',
    '#### 5. 项目落点',
    `- 项目目录：/Users/apple/Desktop/【项目的游戏】/deliveries/${context.run.id}/ios-app`,
    '- 代码入口：WeatherBagChecklist.xcodeproj、README.md、WeatherBagChecklistApp.swift、ContentView.swift、Features/WorkflowPlan.swift。',
    '- 当前状态：最终结果会显示是否已经写入文件，以及 xcodebuild 是否通过。',
    '',
    '#### 6. 验证线',
    '- 能被 Xcode 打开并构建。',
    '- 首屏能看到“包里晴雨”、天气卡、包包清单和全武装出门反馈。',
    '- 清单可打钩，完成度会变化。',
    '- 未接实时天气前，界面必须明确这是样例天气或待接入天气。',
    '',
    '#### 7. 本轮真实依据',
    evidenceText,
  ].join('\n')
}

function buildWormholeLandlordAppBlueprint(
  context: OpenbasakaMissionStepContext,
  heading: string,
  evidenceText: string,
): string {
  return [
    heading,
    '',
    '#### 1. 本轮结果',
    `已把「${compact(context.demand, 72)}」整理成 Openbasaka 高压验收包：一款原创沙漠科幻 macOS SwiftUI 斗地主垂直切片，用来检验化繁为简是否真的能读懂、编排、生成、试跑和留证据。`,
    '',
    '#### 2. 产品定位',
    '- 产品名：Sandstorm Landlord / 沙海斗地主。',
    '- 一句话定位：在原创沙漠科幻牌桌上打一局可验证规则的 macOS 斗地主，游戏本身可玩，背后证明 Openbasaka 的执行链不是空壳。',
    '- IP 边界：原创沙漠科幻视觉语言，不使用电影素材、Logo 或人物。',
    '',
    '#### 3. 可玩性要求',
    '- 牌局：54 张牌、三名玩家、地主牌、叫地主/不叫、出牌、过牌、胜负判定。',
    '- 牌型：单张、对子、三张、三带一、顺子、连对、炸弹、火箭。',
    '- AI：两个基础 AI 对手只会打合法牌或过牌。',
    '- 拦截：非法牌型或压不过上家的牌必须在 UI 中被拒绝并写入日志。',
    '',
    '#### 4. Mac 体验',
    '- 工程形态：SwiftPM + SwiftUI macOS App，可用 Xcode 打开 Package.swift。',
    '- 桌面结构：主牌桌、右侧 inspector、规则覆盖清单、回合日志、工具栏、键盘快捷键。',
    '- 运行方式：script/build_and_run.sh 先跑 swift test，再构建、打包 .app、启动并验证进程。',
    '',
    '#### 5. 项目落点',
    `- 项目目录：/Users/apple/Desktop/【项目的游戏】/deliveries/${context.run.id}/macos-app`,
    '- 代码入口：Package.swift、Sources/WormholeLandlord、Tests/WormholeLandlordTests、script/build_and_run.sh。',
    '- 运行证据：artifacts/native-macos-build.log、artifacts/native-macos-window.png（若系统允许截屏）、进程验证。',
    '',
    '#### 6. 本轮真实依据',
    evidenceText,
  ].join('\n')
}

function buildLumaSenseAppBlueprint(
  context: OpenbasakaMissionStepContext,
  heading: string,
  evidenceText: string,
): string {
  const uiStyleContext = buildLumaSenseUiStyleContext(context.demand)
  return [
    heading,
    '',
    '#### 1. 本轮结果',
    `已把「${compact(context.demand, 72)}」整理成一款可真实运行的 iOS App 验收包：LumaSense 视觉意识花园。`,
    '',
    '#### 2. 产品定位',
    '- 产品名：LumaSense。',
    '- 一句话定位：把每日看到的画面和心情，转成一张可保存、可复盘的认知卡片。',
    '- 目标用户：希望通过图像、情绪和短反思持续理解自己的创作者、产品人和学习者。',
    '- 情绪价值：不是普通日记，而是把模糊感受整理成可行动的小线索。',
    '',
    '#### 3. 核心功能',
    '- 今日输入：记录一段画面、心情或内在问题。',
    '- 情绪选择：清醒、温柔、迷雾、勇敢四个模式影响卡片口吻。',
    '- 生成卡片：一键生成标题、洞察和今日小行动。',
    '- 花园历史：生成后立刻进入历史列表，可回看最近卡片。',
    '- 复盘仪式：给用户一个晚上可执行的问题和下一步。',
    '',
    '#### 4. UI 风格馆落地',
    `- 选用风格：${uiStyleContext.styleNames.join(' / ')}。`,
    '- iPhone 适配：写入 LaunchScreen.storyboard，使用现代安全区、底部手势区命令 dock 和全屏 SwiftUI 背景，避免旧机型 letterbox。',
    '- 视觉规则：情绪自适应色谱、液态玻璃层、空间便当式信息分组；不能退化成单张深色大卡片。',
    '- 可用性规则：入口直接给记录、情绪选择、生成、历史、复盘三个工作台，不做欢迎页。',
    '',
    '#### 5. 项目落点',
    `- 项目目录：/Users/apple/Desktop/【项目的游戏】/deliveries/${context.run.id}/ios-app`,
    '- 代码入口：LumaSense.xcodeproj、README.md、LumaSenseApp.swift、ContentView.swift、Features/WorkflowPlan.swift、scripts/build-and-run.mjs。',
    '- 运行证据：artifacts/native-build.log 与 artifacts/native-ios-simulator.png。',
    '',
    '#### 6. 验证线',
    '- 能被 Xcode 打开。',
    '- build-and-run.mjs 必须完成 xcodebuild、simctl boot、install、launch、screenshot。',
    '- 首屏必须以 iPhone 17 Pro Max 全屏比例显示，能看到 LumaSense、现代模式切换、今日输入、情绪光谱、生成命令、最新卡片、花园历史和复盘入口。',
    '- 当前不伪装云端 AI：这是离线可运行垂直切片，后续再接真实模型与持久化。',
    '',
    '#### 7. 本轮真实依据',
    evidenceText,
  ].join('\n')
}

function summarizeQueryResult(result: QueryResult): string {
  const citationText = (result.citations || [])
    .slice(0, 5)
    .map((citation) => `${citation.label} ${citation.title}`)
    .join('；')
  return [
    `answerMode=${result.answerMode || 'synthesis'}`,
    `confidence=${result.confidence}`,
    `fromWiki=${result.fromWiki}`,
    result.evidence ? `evidence=${JSON.stringify(result.evidence)}` : '',
    citationText ? `citations=${citationText}` : '',
  ].filter(Boolean).join('\n')
}

function formatPreviousOutcomes(outcomes: MissionStepOutcome[]): string {
  return outcomes
    .map((outcome, index) => {
      const service = outcome.metadata?.serviceName ? `｜服务：${outcome.metadata.serviceName}` : ''
      const evidence = outcome.metadata?.evidenceRefs?.length ? `｜证据：${outcome.metadata.evidenceRefs.slice(0, 5).join('、')}` : ''
      const blocked = outcome.status === 'blocked' ? '｜状态：待确认' : ''
      return `${index + 1}. ${outcome.outputPreview}${service}${evidence}${blocked}`
    })
    .join('\n')
}

function formatWorkflowResults(results: Record<string, string>): string {
  return Object.entries(results)
    .filter(([key]) => !key.startsWith('__'))
    .map(([key, value]) => `## ${key}\n${value}`)
    .join('\n\n')
}

function workflowFailureReason(runResult: { error?: string; results: Record<string, string> }): string {
  return runResult.error || runResult.results.__error || '未知工作流错误'
}

function isTransientWorkflowFailure(reason: string): boolean {
  return /fetch failed|timeout|超时|network|ECONNRESET|ETIMEDOUT|ENOTFOUND|连接失败|模型连接失败/i.test(reason)
}

function collectOutcomeEvidence(outcomes: MissionStepOutcome[]): string[] {
  const refs = outcomes.flatMap((outcome) => outcome.metadata?.evidenceRefs || [])
  return Array.from(new Set(refs.filter(Boolean)))
}

function mergeEvidenceRefs(first?: string[], second?: string[]): string[] {
  return Array.from(new Set([...(first || []), ...(second || [])].filter(Boolean)))
}

async function recoverDetachedRuns(): Promise<void> {
  if (recoveryChecked) return
  recoveryChecked = true
  const rows = await query<RawRunRow>(
    "SELECT * FROM openbasaka_runs WHERE status IN ('running','queued') ORDER BY updated_at DESC LIMIT 8",
  ).catch(() => [])
  const detached = rows.filter((row) => {
    if (memoryRuns.has(row.id)) return false
    const updatedMs = parseRunTimestamp(row.updated_at || row.created_at)
    if (!Number.isFinite(updatedMs)) return true
    if (updatedMs >= runtimeBootedAt - 1000) return false
    if (Date.now() - updatedMs < DETACHED_RECOVERY_GRACE_MS) return false
    return true
  })
  for (const row of detached) {
    const now = new Date().toISOString()
    const message = '上次应用退出或刷新时任务仍在运行；为避免伪造完成，已安全暂停，等待 Boss 确认是否重跑真实服务。'
    await run(
      `UPDATE openbasaka_runs SET status = 'blocked', result_preview = ?, error = ?, updated_at = ? WHERE id = ?`,
      [message, 'detached-run-recovery', now, row.id],
    ).catch(() => undefined)
    await run(
      `UPDATE openbasaka_run_steps
       SET status = 'blocked', output_preview = ?, metadata_json = ?, completed_at = ?, updated_at = ?
       WHERE run_id = ? AND status IN ('running','queued')`,
      [
        message,
        JSON.stringify({
          phase: 'blocked',
          serviceName: 'detached-run-recovery',
          blockingReason: message,
          evidenceRefs: [row.id],
        }),
        now,
        now,
        row.id,
      ],
    ).catch(() => undefined)
  }
}

function parseRunTimestamp(value: string): number {
  if (!value) return Number.NaN
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

async function ensureColumn(table: string, name: string, definition: string): Promise<void> {
  const columns = await query<{ name: string }>(`PRAGMA table_info(${table})`).catch(() => [])
  if (columns.some((column) => column.name === name)) return
  await run(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`).catch(() => undefined)
}

async function persistRun(record: OpenbasakaRun): Promise<void> {
  await run(
    `INSERT OR REPLACE INTO openbasaka_runs
     (id, module_id, module_name, boss_demand, title, status, current_step_id, result_preview, error, created_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.moduleId,
      record.moduleName,
      record.bossDemand,
      record.title,
      record.status,
      record.currentStepId,
      record.resultPreview,
      record.error,
      record.createdAt,
      record.updatedAt,
      record.completedAt,
    ],
  ).catch(() => undefined)
}

async function persistStep(step: OpenbasakaRunStep): Promise<void> {
  await run(
    `INSERT OR REPLACE INTO openbasaka_run_steps
     (id, run_id, node_id, target_tab, title, detail, status, started_at, completed_at, output_preview, order_index, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      step.id,
      step.runId,
      step.nodeId,
      step.targetTab,
      step.title,
      step.detail,
      step.status,
      step.startedAt,
      step.completedAt,
      step.outputPreview,
      step.orderIndex,
      JSON.stringify(step.metadata || {}),
      step.createdAt,
      step.updatedAt,
    ],
  ).catch(() => undefined)
}

async function patchRun(runId: string, patch: Partial<OpenbasakaRun>): Promise<void> {
  const current = memoryRuns.get(runId)
  if (!current) return
  const next = { ...current, ...patch }
  memoryRuns.set(runId, next)
  await persistRun(next)
}

async function notifyListeners(): Promise<void> {
  const snapshot = await listOpenbasakaRuns().catch(() => lastSnapshot)
  for (const listener of listeners) listener(snapshot)
}

async function writeRunEvent(
  record: OpenbasakaRun,
  stage: 'capture' | 'review',
  title: string,
  summary: string,
): Promise<void> {
  await dbSaveOperatingEvent({
    id: `op_${record.id}_${stage}`,
    type: 'agent_action',
    stage,
    agentId: 'openbasaka-runner',
    title,
    status: record.status === 'failed' ? 'failed' : record.status === 'completed' ? 'completed' : 'running',
    resultPreview: summary,
    source: { kind: 'agent', sourceId: record.id, title: record.title },
    toolRefs: ['openbasaka_runs', 'openbasaka_run_steps', 'operating_events'],
    entities: ['openbasaka', record.moduleId, 'background-run'],
    createdAt: new Date().toISOString(),
  }).catch(() => undefined)
}

async function writeStepEvent(step: OpenbasakaRunStep): Promise<void> {
  if (step.status !== 'running' && step.status !== 'completed' && step.status !== 'blocked' && step.status !== 'failed') return
  await dbSaveOperatingEvent({
    id: `op_${step.id}_${step.status}`,
    type: 'agent_action',
    stage: step.status === 'completed' ? 'execute' : step.status === 'running' ? 'understand' : 'review',
    agentId: 'openbasaka-runner',
    title: `化繁为简｜${step.title}`,
    status: step.status === 'completed' ? 'completed' : step.status === 'failed' ? 'failed' : step.status === 'blocked' ? 'blocked' : 'running',
    resultPreview: step.outputPreview || step.detail,
    source: { kind: 'agent', sourceId: step.runId, title: '化繁为简任务' },
    toolRefs: ['openbasaka_runs', 'openbasaka_run_steps', step.targetTab],
    entities: ['simplify', step.nodeId, step.targetTab, 'run-progress'],
    createdAt: new Date().toISOString(),
  }).catch(() => undefined)
}

function rowToRun(row: RawRunRow): OpenbasakaRun {
  return {
    id: String(row.id || ''),
    moduleId: String(row.module_id || ''),
    moduleName: String(row.module_name || ''),
    bossDemand: String(row.boss_demand || ''),
    title: String(row.title || ''),
    status: row.status || 'queued',
    currentStepId: String(row.current_step_id || ''),
    resultPreview: String(row.result_preview || ''),
    error: String(row.error || ''),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    completedAt: String(row.completed_at || ''),
  }
}

function rowToStep(row: RawStepRow): OpenbasakaRunStep {
  return {
    id: String(row.id || ''),
    runId: String(row.run_id || ''),
    nodeId: String(row.node_id || ''),
    targetTab: String(row.target_tab || ''),
    title: String(row.title || ''),
    detail: String(row.detail || ''),
    status: row.status || 'queued',
    startedAt: String(row.started_at || ''),
    completedAt: String(row.completed_at || ''),
    outputPreview: String(row.output_preview || ''),
    orderIndex: Number(row.order_index || 0),
    metadata: parseMetadata(row.metadata_json),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  }
}

function parseMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(label))
    }, timeoutMs)
    promise.then(resolve, reject).finally(() => {
      if (timer) clearTimeout(timer)
    })
  })
}

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      resolve()
    }, ms)
    timers.add(timer)
  })
}

function compact(value: string, limit: number): string {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text
}
