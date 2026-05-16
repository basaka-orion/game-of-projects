import type { ExecutionLearningSummary } from '../agents/execution-review'
import { buildExecutionLearningDeck } from '../agents/execution-review'
import type { BossState } from '../boss/profile'
import { loadBossState } from '../boss/profile'
import {
  dbGetAllSynapses,
  dbGetAllTaxonomies,
  dbGetDecisions,
  dbGetMemories,
  dbListOperatingEvents,
  dbSaveOperatingEvent,
  type OperatingEventRow,
  query,
  run,
} from '../db/repository'
import { getAllProjects, getSettingAsync, type StoredProject } from '../db/store'
import { createScheduledTask, updateScheduledTask } from '../automation/scheduler'
import { buildDailyBriefDeck, type DailyBriefDeck } from '../operating-loop/daily-brief'
import type { SynapseRow } from '../db/repository'
import type { ProjectTaxonomy, StructuredAnalysis } from '../ai/classifier'
import {
  chatCompletion,
  getDefaultConfig,
  normalizeProviderBaseUrl,
  verifyLLMConfig,
  type LLMConfig,
} from '../ai/provider'
import { computeVisionAlignmentReport, type VisionAlignmentReport, type VisionPillar } from '../vision/alignment'
import { createTeam, listTeams } from '../teams/store'
import { generatePromptTemplateFromWorkflow, saveWorkflowStudioItem } from '../workflow/studio'
import { runCouncilMatchGate } from '../xiaobai-council/match-gate'
import {
  selectCouncilTeam,
  type CouncilMatchDecisionSource,
  type CouncilSelection,
  type CouncilSelectedSeat,
} from '../xiaobai-council/selector'
import {
  createOpenbasakaDreamSeedState,
  runOpenbasakaDreamCycle,
  type OpenbasakaDreamState,
} from './dream'

export type OpenbasakaSelfAuditDomainId =
  | 'vision_product'
  | 'boss_modeling'
  | 'memory_wiki'
  | 'agent_os'
  | 'learning_evolution'
  | 'trust_safety'
  | 'ux_workflow'

export interface OpenbasakaSelfAuditDomain {
  id: OpenbasakaSelfAuditDomainId
  title: string
  score: number
  summary: string
  evidence: string[]
  risks: string[]
  nextActions: string[]
  councilSeats: Array<{
    seat: string
    personaId: string
    personaName: string
    score: number
  }>
  councilAudit: OpenbasakaSelfAuditCouncilAudit
}

export interface OpenbasakaSelfAuditCouncilSeatVerdict {
  seat: string
  personaId: string
  personaName: string
  score: number
  verdict: string
  objection: string
  repairFocus: string
}

export interface OpenbasakaSelfAuditCouncilAudit {
  decisionSource: CouncilMatchDecisionSource
  judgeSummary: string
  verdict: string
  evidenceClaims: string[]
  objections: string[]
  confidence: number
  risk: 'low' | 'medium' | 'high'
  repairProposals: string[]
  seatVerdicts: OpenbasakaSelfAuditCouncilSeatVerdict[]
  stageTrace: Array<{
    phaseId: string
    label: string
    status: string
    detail: string
  }>
}

export interface OpenbasakaSelfRepairPlan {
  id: string
  sourceAuditId: string
  priority: 'P0' | 'P1' | 'P2'
  title: string
  problem: string
  evidence: string[]
  ownerDomain: OpenbasakaSelfAuditDomainId
  councilSeats: string[]
  targetSubsystem: string
  workflowSteps: string[]
  acceptance: string[]
  riskGate: string
  status: 'queued' | 'workflow-ready' | 'scheduled-disabled' | 'completed' | 'blocked'
  workflowStudioId?: string
  scheduledTaskId?: string
  createdAt: string
}

export interface OpenbasakaSelfObservationWorkflow {
  id: string
  title: string
  status: 'not-started' | 'running-daily'
  enabled: boolean
  cadence: string
  plainSummary: string
  watches: string[]
  nextUserAction: string
  workflowStudioId?: string
  scheduledTaskId?: string
}

export interface OpenbasakaDailyLearningReport {
  generatedAt: string
  completedRepairs: string[]
  blockedRepairs: string[]
  skillEvolutionChanges: string[]
  councilDisagreements: string[]
  tomorrowRepair: string
}

export interface OpenbasakaSelfRepairRunResult {
  plan: OpenbasakaSelfRepairPlan
  success: boolean
  sessionId?: string
  summary: string
  bossMessage: string
  runSteps: Array<{
    title: string
    detail: string
    status: 'completed' | 'blocked'
  }>
  actionSummary: {
    total: number
    executed: number
    completed: number
    failed: number
    blocked: number
  }
}

export interface OpenbasakaRepairConfirmationGuard {
  enabled: boolean
  mode: 'safe-autopilot-reminder'
  label: string
  pendingCount: number
  autoHandledCount: number
  confirmationLocation: string
  schedulerLocation: string
  plainSummary: string
  nextReminder: string
  autopilotBoundary: string
  pendingPlans: Array<{
    id: string
    title: string
    priority: OpenbasakaSelfRepairPlan['priority']
    status: OpenbasakaSelfRepairPlan['status']
    reason: string
    nextSafeAction: string
  }>
  autoHandledPlans: Array<{
    id: string
    title: string
    status: OpenbasakaSelfRepairPlan['status']
  }>
}

export interface OpenbasakaSelfAuditReport {
  id: string
  generatedAt: string
  overallScore: number
  headline: string
  domains: OpenbasakaSelfAuditDomain[]
  learningProgress: {
    score: number
    summary: string
    signals: string[]
  }
  evolutionProgress: {
    score: number
    summary: string
    signals: string[]
  }
  dailyBrief: DailyBriefDeck
  visionReport: VisionAlignmentReport
  topRisks: string[]
  nextActions: string[]
  selfRepairPlans: OpenbasakaSelfRepairPlan[]
  observationWorkflow: OpenbasakaSelfObservationWorkflow
  dailyLearningReport: OpenbasakaDailyLearningReport
  modelRouteHealth: ModelRouteHealth[]
  repairAutonomyPolicy: RepairAutonomyPolicy
  repairConfirmationGuard: OpenbasakaRepairConfirmationGuard
  nightlyLog: OpenbasakaNightlyLog
  dreamState: OpenbasakaDreamState
}

export interface OpenbasakaSelfAuditInput {
  now?: Date
  projects: StoredProject[]
  taxonomies: Record<string, { taxonomy: ProjectTaxonomy; analysis: StructuredAnalysis }>
  synapses: SynapseRow[]
  bossState: BossState | null
  bossMemoryCount: number
  decisionCount: number
  pendingArchiveCount: number
  operatingEvents: OperatingEventRow[]
  wikiPageCount: number
  wikiSourceCount: number
  drawerCount: number
  uncompiledDrawerCount: number
  wingCount: number
  skillEvolutionCount: number
  scheduledTaskCount: number
  selfObservationTaskCount?: number
  selfObservationEnabledCount?: number
  teamCount: number
  customAgentCount: number
  evolutionEventCount?: number
}

export interface OpenbasakaSelfAuditRuntimeCounts {
  wikiPageCount: number
  wikiSourceCount: number
  drawerCount: number
  uncompiledDrawerCount: number
  wingCount: number
  skillEvolutionCount: number
  scheduledTaskCount: number
  selfObservationTaskCount: number
  selfObservationEnabledCount: number
  teamCount: number
  customAgentCount: number
  evolutionEventCount: number
}

export interface OpenbasakaSelfAuditCouncilOptions {
  runMatchGate?: typeof runCouncilMatchGate
  judgeCompletion?: (prompt: string) => Promise<string>
}

export type ModelRouteStatus =
  | 'ready'
  | 'not-checked'
  | 'not-configured'
  | 'invalid-key'
  | 'rate-limited'
  | 'timeout'
  | 'error'

export interface ModelRouteHealth {
  id: 'glm-5-1' | 'deepseek-v4'
  label: string
  provider: LLMConfig['provider']
  model: string
  baseUrl: string
  status: ModelRouteStatus
  ok: boolean
  keyPresent: boolean
  checkedAt: string
  message: string
}

export interface SelfAuditModelRoute {
  id: ModelRouteHealth['id']
  label: string
  priority: number
  source: string
  config: LLMConfig
}

export interface RepairAutonomyPolicy {
  mode: 'safe-autostart'
  label: string
  plainSummary: string
  autoStartRules: string[]
  bossConfirmRules: string[]
}

export interface OpenbasakaNightlyLog {
  id: string
  generatedAt: string
  title: string
  summary: string
  obviousCta: string
  tone: 'good' | 'watch' | 'urgent'
  bullets: string[]
  sections: Array<{
    title: string
    items: string[]
  }>
}

export interface OpenbasakaNightlyMaintenanceRun {
  id: string
  generatedAt: string
  trigger: 'cron' | 'manual' | 'catch-up'
  status: 'completed' | 'partial' | 'fallback'
  scheduledTaskId: string
  report: OpenbasakaSelfAuditReport
  modelRouteHealth: ModelRouteHealth[]
  log: OpenbasakaNightlyLog
  safeRepairRun?: OpenbasakaSelfRepairRunResult
  safeStartedPlans: OpenbasakaSelfRepairPlan[]
  bossConfirmPlans: OpenbasakaSelfRepairPlan[]
  catchUp: boolean
}

export interface OpenbasakaNightlyMaintenanceOptions {
  now?: Date
  trigger?: OpenbasakaNightlyMaintenanceRun['trigger']
  force?: boolean
  verifyModelRoutes?: boolean
  runSafeRepair?: boolean
  runMatchGate?: typeof runCouncilMatchGate
  judgeCompletion?: (prompt: string) => Promise<string>
}

export interface ProbeSelfAuditModelRouteOptions {
  now?: Date
  verifyConfig?: (config: LLMConfig, route: SelfAuditModelRoute) => Promise<{ ok: boolean; message: string }>
}

const SELF_REPAIR_TEAM_NAME = 'Openbasaka 自省修复群策'
const SELF_OBSERVER_WORKFLOW_ID = 'wfs_openbasaka_self_observer'
export const OPENBASAKA_NIGHTLY_TASK_ID = 'task_openbasaka_nightly_maintenance'
export const OPENBASAKA_NIGHTLY_TASK_TYPE = 'openbasaka-nightly-maintenance'
export const OPENBASAKA_NIGHTLY_CRON = '17 3 * * *'
export const OPENBASAKA_NIGHTLY_SOURCE = 'openbasaka-nightly-maintenance'
export const OPENBASAKA_CONFIRMATION_GUARD_SOURCE = 'openbasaka-confirmation-guard'

export const SAFE_REPAIR_AUTONOMY_POLICY: RepairAutonomyPolicy = {
  mode: 'safe-autostart',
  label: '安全自启',
  plainSummary: '它会自己巡检、自己生成工作流、自己跑低风险安全步骤；会动代码、删数据、外发信息、改权限或改密钥的动作，一律停下来给 Boss 确认。',
  autoStartRules: [
    '自动读取系统证据、生成日报和修复队列。',
    '自动创建可审查 workflow / scheduler 任务。',
    '自动试跑不会改代码、不会删数据、不会外发敏感信息的安全步骤。',
  ],
  bossConfirmRules: [
    '任何代码级修改都要 Boss 确认。',
    '任何删除、迁移、外发、权限和密钥动作都要 Boss 确认。',
    '任何高风险修复只生成醒目的确认卡，不静默执行。',
  ],
}

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function localDateKeyFromIso(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : localDateKey(date)
}

function routeHealthFromRoute(route: SelfAuditModelRoute, status: ModelRouteStatus, message: string, now = new Date()): ModelRouteHealth {
  return {
    id: route.id,
    label: route.label,
    provider: route.config.provider,
    model: route.config.model,
    baseUrl: route.config.baseUrl,
    status,
    ok: status === 'ready',
    keyPresent: route.config.provider === 'ollama' || Boolean(route.config.apiKey),
    checkedAt: now.toISOString(),
    message: sanitizeModelHealthMessage(message),
  }
}

function sanitizeModelHealthMessage(message: string): string {
  const text = String(message || '').replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***').replace(/[A-Za-z0-9_-]{32,}/g, '***')
  if (/401|unauthorized|invalid api|incorrect api|api key/i.test(text)) return '模型钥匙没接通：key 可能失效或不匹配。'
  if (/429|rate limit|too many/i.test(text)) return '模型现在太忙或被限流，系统会稍后再试。'
  if (/timeout|超时|AbortError/i.test(text)) return '模型没有按时回应，本轮不会卡住。'
  if (/balance|insufficient|402/i.test(text)) return '模型账户余额或额度不足。'
  return text.replace(/^✗\s*/, '').replace(/^✓\s*/, '').slice(0, 180) || '已完成检查。'
}

function statusFromModelMessage(ok: boolean, message: string): ModelRouteStatus {
  if (ok) return 'ready'
  if (/401|unauthorized|invalid api|incorrect api|api key|失效|不正确/i.test(message)) return 'invalid-key'
  if (/429|rate limit|too many|限流/i.test(message)) return 'rate-limited'
  if (/timeout|超时|AbortError/i.test(message)) return 'timeout'
  return 'error'
}

function firstNonEmpty(...values: string[]): string {
  return values.map(value => String(value || '').trim()).find(Boolean) || ''
}

function isProbablyProvider(provider: string, expected: string, model: string): boolean {
  return provider === expected || model.toLowerCase().includes(expected)
}

async function readSetting(key: string, fallback = ''): Promise<string> {
  try {
    return await getSettingAsync(key, fallback)
  } catch {
    return fallback
  }
}

export async function resolveSelfAuditModelRoutes(): Promise<SelfAuditModelRoute[]> {
  const globalProvider = (await readSetting('llm_provider', 'glm')) as LLMConfig['provider']
  const globalDefaults = getDefaultConfig(globalProvider)
  const globalApiKey = await readSetting('llm_api_key', '')
  const globalModel = await readSetting('llm_model', globalDefaults.model)
  const globalBaseUrl = normalizeProviderBaseUrl(
    globalProvider,
    await readSetting('llm_base_url', globalDefaults.baseUrl),
  )

  const glmDefaults = getDefaultConfig('glm')
  const glmRoleProvider = (await readSetting('model_role_knowledge_distill_provider', 'glm')) as LLMConfig['provider']
  const glmRoleDefaults = getDefaultConfig(glmRoleProvider)
  const glmApiKey = firstNonEmpty(
    isProbablyProvider(globalProvider, 'glm', globalModel) ? globalApiKey : '',
    await readSetting('model_role_knowledge_distill_api_key', ''),
    await readSetting('agent_knowledge_heavy_api_key', ''),
    await readSetting('agent_strategy_api_key', ''),
    globalApiKey,
  )
  const glmModel = firstNonEmpty(
    isProbablyProvider(globalProvider, 'glm', globalModel) ? globalModel : '',
    await readSetting('model_role_knowledge_distill_model', glmDefaults.model),
    glmDefaults.model,
  )
  const glmBaseUrl = normalizeProviderBaseUrl(
    'glm',
    firstNonEmpty(
      isProbablyProvider(globalProvider, 'glm', globalModel) ? globalBaseUrl : '',
      await readSetting('model_role_knowledge_distill_base_url', glmRoleDefaults.baseUrl || glmDefaults.baseUrl),
      glmDefaults.baseUrl,
    ),
  )

  const deepDefaults = getDefaultConfig('deepseek')
  const mainProvider = (await readSetting('model_role_main_reasoning_provider', 'deepseek')) as LLMConfig['provider']
  const mainDefaults = getDefaultConfig(mainProvider)
  const deepApiKey = firstNonEmpty(
    await readSetting('model_role_main_reasoning_api_key', ''),
    await readSetting('model_route_heavy_api_key', ''),
    isProbablyProvider(globalProvider, 'deepseek', globalModel) ? globalApiKey : '',
    await readSetting('agent_technical_heavy_api_key', ''),
    await readSetting('agent_general_heavy_api_key', ''),
    await readSetting('agent_critic_heavy_api_key', ''),
  )
  const deepModel = firstNonEmpty(
    await readSetting('model_role_main_reasoning_model', deepDefaults.model),
    isProbablyProvider(globalProvider, 'deepseek', globalModel) ? globalModel : '',
    deepDefaults.model,
  )
  const deepBaseUrl = normalizeProviderBaseUrl(
    'deepseek',
    firstNonEmpty(
      await readSetting('model_role_main_reasoning_base_url', mainDefaults.baseUrl || deepDefaults.baseUrl),
      isProbablyProvider(globalProvider, 'deepseek', globalModel) ? globalBaseUrl : '',
      deepDefaults.baseUrl,
    ),
  )

  return [
    {
      id: 'glm-5-1',
      label: 'GLM 5.1',
      priority: 1,
      source: isProbablyProvider(globalProvider, 'glm', globalModel) ? 'global-llm' : 'knowledge-distill-role',
      config: {
        provider: 'glm',
        apiKey: glmApiKey,
        baseUrl: glmBaseUrl,
        model: glmModel || glmDefaults.model,
      },
    },
    {
      id: 'deepseek-v4',
      label: 'DeepSeek V4',
      priority: 2,
      source: 'main-reasoning-role',
      config: {
        provider: 'deepseek',
        apiKey: deepApiKey,
        baseUrl: deepBaseUrl,
        model: deepModel || deepDefaults.model,
      },
    },
  ]
}

export async function probeSelfAuditModelRoutes(
  routes: SelfAuditModelRoute[],
  options: ProbeSelfAuditModelRouteOptions = {},
): Promise<ModelRouteHealth[]> {
  const now = options.now || new Date()
  const verifyConfig = options.verifyConfig || ((config: LLMConfig) => verifyLLMConfig(config))
  const health: ModelRouteHealth[] = []

  for (const route of [...routes].sort((a, b) => a.priority - b.priority)) {
    if (!route.config.apiKey && route.config.provider !== 'ollama') {
      health.push(routeHealthFromRoute(route, 'not-configured', '本地没有读到这把模型钥匙。', now))
      continue
    }
    try {
      const result = await verifyConfig(route.config, route)
      health.push(routeHealthFromRoute(route, statusFromModelMessage(result.ok, result.message), result.message, now))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      health.push(routeHealthFromRoute(route, statusFromModelMessage(false, message), message, now))
    }
  }

  return health
}

export function createSelfAuditJudgeCompletion(
  routes: SelfAuditModelRoute[],
  options: {
    complete?: (config: LLMConfig, prompt: string, route: SelfAuditModelRoute) => Promise<string>
  } = {},
): (prompt: string) => Promise<string> {
  const ordered = [...routes].sort((a, b) => a.priority - b.priority)
  return async (prompt: string) => {
    const errors: string[] = []
    for (const route of ordered) {
      if (!route.config.apiKey && route.config.provider !== 'ollama') {
        errors.push(`${route.label}: 没读到模型钥匙`)
        continue
      }
      try {
        const response = options.complete
          ? await options.complete(route.config, prompt, route)
          : await chatCompletion(
              route.config,
              [
                { role: 'system', content: '你是严苛的小白智囊团编队裁判。只输出 JSON，不要 Markdown。' },
                { role: 'user', content: prompt },
              ],
              0.24,
              2200,
            )
        if (String(response || '').trim()) return response
        errors.push(`${route.label}: 空回复`)
      } catch (error) {
        errors.push(`${route.label}: ${sanitizeModelHealthMessage(error instanceof Error ? error.message : String(error))}`)
      }
    }
    throw new Error(`GLM 5.1 和 DeepSeek V4 都没有稳定接通：${errors.join('；') || '没有可用模型路由'}`)
  }
}

function defaultUncheckedModelHealth(now = new Date()): ModelRouteHealth[] {
  const glmDefaults = getDefaultConfig('glm')
  const deepDefaults = getDefaultConfig('deepseek')
  return [
    {
      id: 'glm-5-1',
      label: 'GLM 5.1',
      provider: 'glm',
      model: glmDefaults.model,
      baseUrl: glmDefaults.baseUrl,
      status: 'not-checked',
      ok: false,
      keyPresent: false,
      checkedAt: now.toISOString(),
      message: '等夜巡时试连模型钥匙。',
    },
    {
      id: 'deepseek-v4',
      label: 'DeepSeek V4',
      provider: 'deepseek',
      model: deepDefaults.model,
      baseUrl: deepDefaults.baseUrl,
      status: 'not-checked',
      ok: false,
      keyPresent: false,
      checkedAt: now.toISOString(),
      message: '等 GLM 不通时作为第二条路。',
    },
  ]
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function findPillar(report: VisionAlignmentReport, id: VisionPillar['id']): VisionPillar {
  return report.pillars.find(pillar => pillar.id === id) || report.pillars[0]
}

function summarizeCouncilSeats(seats: CouncilSelectedSeat[]): OpenbasakaSelfAuditDomain['councilSeats'] {
  return seats.slice(0, 4).map(item => ({
    seat: item.seat.label,
    personaId: item.persona.id,
    personaName: item.persona.shortName,
    score: item.score,
  }))
}

function selectDomainCouncil(title: string, focus: string): OpenbasakaSelfAuditDomain['councilSeats'] {
  const selection = selectCouncilTeam(
    `Openbasaka 系统自省：${title}。请从 ${focus} 角度做客观分析、证据审查、风险反方和下一步修复。`,
    { minMembers: 5, maxMembers: 5 },
  )
  return summarizeCouncilSeats(selection.seats)
}

function domainRisk(score: number, riskCount: number): OpenbasakaSelfAuditCouncilAudit['risk'] {
  if (score < 52 || riskCount >= 2) return 'high'
  if (score < 72 || riskCount > 0) return 'medium'
  return 'low'
}

function compactText(value: string, max = 140): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized
}

function trimSentenceEnd(value: string): string {
  return value.replace(/[。.!！?？\s]+$/g, '')
}

function buildSeatVerdicts(domain: Pick<OpenbasakaSelfAuditDomain, 'title' | 'score' | 'summary' | 'risks' | 'nextActions' | 'councilSeats'>): OpenbasakaSelfAuditCouncilSeatVerdict[] {
  const risk = domain.risks[0] || '当前缺少足够反方证据。'
  const action = domain.nextActions[0] || '补一条可验证的下一步。'
  return domain.councilSeats.map((seat, index) => ({
    ...seat,
    verdict:
      index === 0
        ? `${seat.personaName} 先判定 ${domain.title} 当前是 ${domain.score}/100：主线成立，但必须看证据是否真的写回系统。`
        : `${seat.personaName} 从「${seat.seat}」席位确认：${compactText(domain.summary, 90)}`,
    objection:
      index % 2 === 0
        ? risk
        : `如果只停留在展示层，${domain.title} 会继续缺少可执行修复收据。`,
    repairFocus: action,
  }))
}

function buildLocalCouncilAudit(domain: Pick<OpenbasakaSelfAuditDomain, 'title' | 'score' | 'summary' | 'evidence' | 'risks' | 'nextActions' | 'councilSeats'>): OpenbasakaSelfAuditCouncilAudit {
  const risk = domainRisk(domain.score, domain.risks.length)
  const repairProposals = Array.from(new Set([...domain.nextActions, ...domain.risks])).filter(Boolean).slice(0, 3)
  return {
    decisionSource: 'local-fallback',
    judgeSummary: '本轮未完成深度模型裁判，已使用本地规则生成可审查的智囊团裁决基线。',
    verdict:
      domain.score >= 78
        ? `${domain.title} 基础较稳，下一步是保持证据回写和周期复盘。`
        : domain.score >= 58
          ? `${domain.title} 已有雏形，但还需要把风险转成可执行修复工作流。`
          : `${domain.title} 是当前薄弱领域，必须先补证据、流程和验收标准。`,
    evidenceClaims: domain.evidence.slice(0, 4),
    objections: domain.risks.length > 0 ? domain.risks.slice(0, 4) : ['当前没有足够反方证据，不能证明该领域长期可靠。'],
    confidence: risk === 'high' ? 0.56 : risk === 'medium' ? 0.68 : 0.78,
    risk,
    repairProposals,
    seatVerdicts: buildSeatVerdicts(domain),
    stageTrace: [
      {
        phaseId: 'local-fallback',
        label: '本地席位匹配',
        status: 'completed',
        detail: '已根据领域、风险和下一步动作完成确定性席位匹配；等待深度 CouncilMatchGate 复核。',
      },
    ],
  }
}

function domainFromPillar(
  id: OpenbasakaSelfAuditDomainId,
  title: string,
  pillar: VisionPillar,
  focus: string,
): OpenbasakaSelfAuditDomain {
  const domain = {
    id,
    title,
    score: pillar.score,
    summary: pillar.summary,
    evidence: pillar.evidence,
    risks: pillar.status === 'strong' ? [] : [pillar.nextMove],
    nextActions: [pillar.nextMove],
    councilSeats: selectDomainCouncil(title, focus),
  }
  return {
    ...domain,
    councilAudit: buildLocalCouncilAudit(domain),
  }
}

function buildAgentScore(input: OpenbasakaSelfAuditInput, executionSummary: ExecutionLearningSummary): number {
  const executionSignal = executionSummary.total > 0 ? executionSummary.averageScore * 0.5 : 10
  return clampScore(
    Math.min(input.scheduledTaskCount * 10, 28) +
    Math.min(input.teamCount * 8, 20) +
    Math.min(input.customAgentCount * 6, 18) +
    Math.min(input.operatingEvents.filter(event => event.stage === 'execute').length * 2, 16) +
    executionSignal,
  )
}

function buildTrustSafetyScore(input: OpenbasakaSelfAuditInput, executionSummary: ExecutionLearningSummary): number {
  const failedEvents = input.operatingEvents.filter(event => event.type === 'agent_action' && event.summary.includes('failed')).length
  const evidenceSignal = executionSummary.total > 0 ? executionSummary.evidenceCoverage * 0.32 : 14
  return clampScore(
    62 +
    evidenceSignal +
    Math.min(input.operatingEvents.filter(event => event.stage === 'review').length * 3, 12) -
    Math.min(failedEvents * 8, 24) -
    Math.min(input.pendingArchiveCount * 2, 16),
  )
}

function buildWorkflowScore(input: OpenbasakaSelfAuditInput): number {
  const recentActionKinds = new Set(input.operatingEvents.map(event => event.stage))
  return clampScore(
    Math.min(input.projects.length * 5, 22) +
    Math.min(input.synapses.length * 3, 18) +
    Math.min(recentActionKinds.size * 9, 36) +
    Math.min(input.decisionCount * 2, 14) +
    (input.pendingArchiveCount === 0 ? 10 : 0),
  )
}

function targetSubsystem(domainId: OpenbasakaSelfAuditDomainId): string {
  const labels: Record<OpenbasakaSelfAuditDomainId, string> = {
    vision_product: '愿景对齐 / 项目智能',
    boss_modeling: 'Boss 画像 / 认知档案',
    memory_wiki: 'MemPalace / Wiki / 来源证据',
    agent_os: 'Agent OS / Teams / Scheduler',
    learning_evolution: 'Hermes-style 学习与 skill_evolution',
    trust_safety: '证据链 / 失败复盘 / 安全边界',
    ux_workflow: 'SandboxMap 工作站 / 模块工作流',
  }
  return labels[domainId]
}

function repairPriority(score: number, risk: OpenbasakaSelfAuditCouncilAudit['risk']): OpenbasakaSelfRepairPlan['priority'] {
  if (score < 52 || risk === 'high') return 'P0'
  if (score < 72 || risk === 'medium') return 'P1'
  return 'P2'
}

function buildRepairSteps(domain: OpenbasakaSelfAuditDomain): string[] {
  const firstAction = domain.councilAudit.repairProposals[0] || domain.nextActions[0] || '先补一条可验证修复动作。'
  return [
    `复述 ${domain.title} 的当前问题、证据和反方意见，禁止直接进入方案。`,
    `由 ${domain.councilAudit.seatVerdicts.slice(0, 3).map(seat => seat.personaName).join(' / ')} 分别给出修复判断、风险质询和最低可行改动。`,
    `把「${firstAction}」拆成可执行任务，明确要触达的数据层、UI 层、历史记录和验收证据。`,
    '输出不会自动改代码的修复工作流：步骤、负责人席位、失败条件、回滚边界、验收命令。',
    '执行后必须写回 operating_events；若涉及学习或技能变化，再写回 evolution_events / skill_evolution。',
  ]
}

function buildRepairAcceptance(domain: OpenbasakaSelfAuditDomain): string[] {
  return [
    `${domain.title} 的修复结果能在系统自省页面看到状态变化，而不是只存在文本里。`,
    '至少写入一条 operating_events 证据，包含来源、工具、结果预览和风险边界。',
    '如果产生 workflow/scheduler/team-workflow，默认保持可审查或禁用状态，未经 Boss 确认不自动执行高风险动作。',
    '下一次系统自省能读取本次修复收据，并影响领域分、日报或进化信号。',
  ]
}

export function buildOpenbasakaSelfRepairPlans(report: Pick<OpenbasakaSelfAuditReport, 'id' | 'generatedAt' | 'domains'>): OpenbasakaSelfRepairPlan[] {
  const candidates = [...report.domains]
    .sort((a, b) => {
      const riskRank = { high: 0, medium: 1, low: 2 }
      return riskRank[a.councilAudit.risk] - riskRank[b.councilAudit.risk] || a.score - b.score
    })
    .slice(0, 5)

  return candidates.map((domain) => {
    const proposal = domain.councilAudit.repairProposals[0] || domain.nextActions[0] || '补齐证据和闭环。'
    return {
      id: `${report.id}-${domain.id}`,
      sourceAuditId: report.id,
      priority: repairPriority(domain.score, domain.councilAudit.risk),
      title: `${domain.title} 自我修复｜${compactText(proposal, 42)}`,
      problem: domain.councilAudit.objections[0] || domain.summary,
      evidence: domain.evidence.slice(0, 4),
      ownerDomain: domain.id,
      councilSeats: domain.councilAudit.seatVerdicts.slice(0, 5).map(seat => `${seat.seat}：${seat.personaName}`),
      targetSubsystem: targetSubsystem(domain.id),
      workflowSteps: buildRepairSteps(domain),
      acceptance: buildRepairAcceptance(domain),
      riskGate: '默认只生成可审查修复工作流和禁用定时任务；不自动修改代码、不删除数据、不外发敏感信息。',
      status: 'queued',
      createdAt: report.generatedAt,
    }
  })
}

export async function hydrateOpenbasakaSelfRepairWorkflowStatus(report: OpenbasakaSelfAuditReport): Promise<OpenbasakaSelfAuditReport> {
  const rows = await query<{ id: string; enabled: number; task_config_json: string }>(
    'SELECT id, enabled, task_config_json FROM scheduled_tasks ORDER BY created_at DESC',
  ).catch(() => [])
  const byPlanId = new Map<string, { scheduledTaskId: string; workflowStudioId?: string; enabled: boolean }>()
  for (const row of rows) {
    try {
      const config = JSON.parse(String(row.task_config_json || '{}')) as Record<string, unknown>
      const planId = typeof config.selfRepairPlanId === 'string' ? config.selfRepairPlanId : ''
      if (!planId || byPlanId.has(planId)) continue
      byPlanId.set(planId, {
        scheduledTaskId: String(row.id),
        workflowStudioId: typeof config.studioWorkflowId === 'string' ? config.studioWorkflowId : undefined,
        enabled: Number(row.enabled) === 1,
      })
    } catch {
      // Ignore unrelated scheduler rows.
    }
  }
  if (byPlanId.size === 0) return report

  const selfRepairPlans = report.selfRepairPlans.map((plan) => {
      const existing = byPlanId.get(plan.id)
      if (!existing) return plan
      const status: OpenbasakaSelfRepairPlan['status'] = existing.enabled ? 'workflow-ready' : 'scheduled-disabled'
      return {
        ...plan,
        workflowStudioId: existing.workflowStudioId || plan.workflowStudioId,
        scheduledTaskId: existing.scheduledTaskId,
        status,
      }
    })
  return withRepairConfirmationGuard({
    ...report,
    selfRepairPlans,
  })
}

function parsePayload(event: OperatingEventRow): Record<string, unknown> {
  try {
    const parsed = JSON.parse(event.payload_json || '{}') as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function buildDailyLearningReport(input: OpenbasakaSelfAuditInput, domains: OpenbasakaSelfAuditDomain[], repairPlans: OpenbasakaSelfRepairPlan[], generatedAt: string): OpenbasakaDailyLearningReport {
  const repairEvents = input.operatingEvents.filter(event =>
    event.source_id === 'openbasaka-self-repair' ||
    event.entities_json.includes('self-repair') ||
    event.title.includes('自我修复'),
  )
  const completedRepairs = repairEvents
    .filter(event => event.summary.includes('完成') || event.summary.includes('completed') || parsePayload(event).status === 'completed')
    .map(event => event.title)
    .slice(0, 4)
  const blockedRepairs = repairEvents
    .filter(event => event.summary.includes('阻塞') || event.summary.includes('blocked') || event.summary.includes('failed'))
    .map(event => event.title)
    .slice(0, 4)
  const skillEvolutionChanges = [
    `${input.skillEvolutionCount} 条 skill_evolution 可作为技能进化基线`,
    `${input.evolutionEventCount || 0} 条 evolution_events 可作为长期进化事件`,
    `${input.operatingEvents.filter(event => event.stage === 'review').length} 条 review 事件可被日报复盘`,
  ]
  const councilDisagreements = domains
    .filter(domain => domain.councilAudit.risk !== 'low' || domain.councilAudit.objections.length > 0)
    .map(domain => `${domain.title}: ${domain.councilAudit.objections[0] || domain.councilAudit.verdict}`)
    .slice(0, 5)

  return {
    generatedAt,
    completedRepairs: completedRepairs.length ? completedRepairs : ['暂无已完成的自我修复收据。'],
    blockedRepairs: blockedRepairs.length ? blockedRepairs : ['暂无明确阻塞；下一步需要让修复队列产生可执行回执。'],
    skillEvolutionChanges,
    councilDisagreements,
    tomorrowRepair: repairPlans[0]?.title || '先生成第一条自我修复工作流。',
  }
}

function healthPlainText(health: ModelRouteHealth[]): string {
  if (health.length === 0) return '模型钥匙等夜巡时再试。'
  const ready = health.filter(item => item.ok).map(item => item.label)
  if (ready.length > 0) return `${ready.join('、')} 已接通。`
  const configured = health.filter(item => item.keyPresent)
  if (configured.length > 0) return `读到了 ${configured.map(item => item.label).join('、')} 的钥匙，但还没稳定接通。`
  return '没有读到可用模型钥匙，本轮用本地规则兜底。'
}

function needsBossConfirmation(plan: OpenbasakaSelfRepairPlan): boolean {
  const text = [
    plan.title,
    plan.problem,
    plan.riskGate,
    ...plan.workflowSteps,
    ...plan.acceptance,
  ].join('\n')
  return /代码|删除|外发|密钥|权限|高风险|确认|迁移|支付|账号|敏感/i.test(text)
}

function bossConfirmationReason(plan: OpenbasakaSelfRepairPlan): string {
  const text = [
    plan.title,
    plan.problem,
    plan.riskGate,
    ...plan.workflowSteps,
    ...plan.acceptance,
  ].join('\n')
  const reasons = [
    [/代码/i, '可能触达代码或工程行为'],
    [/删除|迁移/i, '可能触达数据删除或迁移'],
    [/权限|账号/i, '可能触达权限或账号边界'],
    [/密钥|key/i, '可能触达模型钥匙或敏感配置'],
    [/外发|敏感/i, '可能触达外发或敏感信息'],
    [/高风险|确认/i, '风险闸门要求人工确认'],
  ] as Array<[RegExp, string]>
  const matched = reasons.filter(([pattern]) => pattern.test(text)).map(([, reason]) => reason)
  return Array.from(new Set(matched)).slice(0, 2).join('；') || '这条修复需要人工确认后才能进入真实改动。'
}

function buildAutoHandledPlans(safeRepairRun?: OpenbasakaSelfRepairRunResult, plans: OpenbasakaSelfRepairPlan[] = []): OpenbasakaRepairConfirmationGuard['autoHandledPlans'] {
  if (safeRepairRun) {
    return [{
      id: safeRepairRun.plan.id,
      title: safeRepairRun.plan.title,
      status: safeRepairRun.plan.status,
    }]
  }
  return plans
    .filter(plan => !needsBossConfirmation(plan) && plan.status === 'completed')
    .map(plan => ({
      id: plan.id,
      title: plan.title,
      status: plan.status,
    }))
    .slice(0, 5)
}

export function buildOpenbasakaRepairConfirmationGuard(input: {
  plans: OpenbasakaSelfRepairPlan[]
  safeRepairRun?: OpenbasakaSelfRepairRunResult
}): OpenbasakaRepairConfirmationGuard {
  const pendingPlans = input.plans
    .filter(plan => plan.status !== 'completed' && needsBossConfirmation(plan))
    .map(plan => ({
      id: plan.id,
      title: plan.title,
      priority: plan.priority,
      status: plan.status,
      reason: bossConfirmationReason(plan),
      nextSafeAction: plan.workflowSteps[2] || plan.acceptance[0] || '先运行安全部分，真实改动继续等 Boss 点头。',
    }))
  const autoHandledPlans = buildAutoHandledPlans(input.safeRepairRun, input.plans)
  const pendingCount = pendingPlans.length
  const confirmationLocation = '沙盘 → 系统自省 → Boss确认守护 / 接下来修哪里'
  const schedulerLocation = '沙盘 → 定时/群策 → 自省修复任务'

  return {
    enabled: true,
    mode: 'safe-autopilot-reminder',
    label: 'Boss确认守护',
    pendingCount,
    autoHandledCount: autoHandledPlans.length,
    confirmationLocation,
    schedulerLocation,
    plainSummary: pendingCount > 0
      ? `不会让 ${pendingCount} 个待确认修复沉掉：低风险步骤自动跑，高风险每天在晨报卡和系统自省页提醒。`
      : '当前没有待 Boss 点头的高风险修复；低风险动作仍会按安全自启策略处理。',
    nextReminder: pendingCount > 0
      ? `下一次 03:17 夜巡后继续提醒；你也可以现在到「${confirmationLocation}」处理最上面的确认卡。`
      : '下一次夜巡继续观察，如果出现高风险修复会自动生成确认卡。',
    autopilotBoundary: '不能替 Boss 静默确认代码、删除、数据迁移、权限、密钥或外发动作；只能自动跑低风险安全步骤并持续提醒。',
    pendingPlans,
    autoHandledPlans,
  }
}

function withRepairConfirmationGuard(report: OpenbasakaSelfAuditReport, safeRepairRun?: OpenbasakaSelfRepairRunResult): OpenbasakaSelfAuditReport {
  return {
    ...report,
    repairConfirmationGuard: buildOpenbasakaRepairConfirmationGuard({
      plans: report.selfRepairPlans,
      safeRepairRun,
    }),
  }
}

export function renderNightlyLogCard(input: {
  report: Pick<
    OpenbasakaSelfAuditReport,
    'id' | 'generatedAt' | 'overallScore' | 'domains' | 'selfRepairPlans' | 'dailyLearningReport' | 'learningProgress' | 'evolutionProgress' | 'modelRouteHealth' | 'dreamState' | 'repairConfirmationGuard'
  >
  safeRepairRun?: OpenbasakaSelfRepairRunResult
  modelRouteHealth?: ModelRouteHealth[]
  trigger?: OpenbasakaNightlyMaintenanceRun['trigger']
}): OpenbasakaNightlyLog {
  const report = input.report
  const health = input.modelRouteHealth || report.modelRouteHealth || []
  const riskyPlans = report.selfRepairPlans.filter(needsBossConfirmation)
  const safeStarted = input.safeRepairRun ? 1 : 0
  const urgentCount = report.selfRepairPlans.filter(plan => plan.priority === 'P0' || plan.priority === 'P1').length
  const worstDomain = [...report.domains].sort((a, b) => a.score - b.score)[0]
  const dreamCandidateCount = report.dreamState.candidates.length
  const deepDreamCount = report.dreamState.candidates.filter(candidate => candidate.score >= 72).length
  const dreamAppliedCount = report.dreamState.appliedWrites.filter(write => write.kind === 'evolution_event' || write.kind === 'memory_item').length
  const confirmationGuard = report.repairConfirmationGuard || buildOpenbasakaRepairConfirmationGuard({
    plans: report.selfRepairPlans,
    safeRepairRun: input.safeRepairRun,
  })
  const cta = riskyPlans.length > 0
    ? `${riskyPlans.length} 个修复等你点头，守护已盯住`
    : safeStarted > 0
      ? '安全修复已经自己跑完第一步'
      : '今天先观察，不乱动'

  return {
    id: `nightly-log-${localDateKeyFromIso(report.generatedAt)}`,
    generatedAt: report.generatedAt,
    title: `夜巡完成｜${report.overallScore}分｜${cta}`,
    summary: `昨晚我看了 ${report.domains.length} 个系统区域，发现 ${urgentCount} 个要紧问题，自己启动 ${safeStarted} 个安全修复；做梦提炼 ${dreamCandidateCount} 个学习模式，深睡生效 ${deepDreamCount} 个；Boss确认守护盯住 ${confirmationGuard.pendingCount} 个。`,
    obviousCta: cta,
    tone: report.overallScore < 58 || urgentCount >= 3 ? 'urgent' : urgentCount > 0 ? 'watch' : 'good',
    bullets: [
      `我看了：${report.domains.map(domain => domain.title).slice(0, 4).join('、')} 等 ${report.domains.length} 块。`,
      `模型钥匙：${healthPlainText(health)}`,
      `最薄的地方：${worstDomain ? `${worstDomain.title} ${worstDomain.score}分` : '暂时没发现明显短板'}。`,
      `梦境学习：${deepDreamCount > 0 ? `${deepDreamCount} 个深睡学习已生效，${dreamAppliedCount} 条写入长期账本。` : '本轮先留下梦境日记。'}`,
      `确认守护：${confirmationGuard.plainSummary}`,
      `明天先修：${report.dailyLearningReport.tomorrowRepair}`,
    ],
    sections: [
      {
        title: '昨晚发生了什么',
        items: [
          `系统总分 ${report.overallScore}/100。`,
          `学习进度 ${report.learningProgress.score}/100：${compactText(report.learningProgress.summary, 80)}`,
          `进化进度 ${report.evolutionProgress.score}/100：${compactText(report.evolutionProgress.summary, 80)}`,
        ],
      },
      {
        title: '我自己做了什么',
        items: input.safeRepairRun
          ? [
              input.safeRepairRun.summary,
              input.safeRepairRun.bossMessage,
            ]
          : ['本轮先完成巡检、智囊团判定和修复队列准备，没有乱改系统。'],
      },
      {
        title: '我梦见了什么',
        items: [
          report.dreamState.summary,
          `下一次梦境主题：${report.dreamState.nextDreamTopic}`,
        ],
      },
      {
        title: '还需要你点头什么',
        items: riskyPlans.length > 0
          ? confirmationGuard.pendingPlans.slice(0, 3).map(plan => `${plan.priority}：${plan.title}｜${plan.reason}`)
          : ['暂时没有必须 Boss 点头的高风险动作。'],
      },
      {
        title: '怕你忘了怎么办',
        items: [
          confirmationGuard.plainSummary,
          `确认入口：${confirmationGuard.confirmationLocation}`,
          confirmationGuard.autopilotBoundary,
        ],
      },
    ],
  }
}

function buildObservationWorkflow(input: OpenbasakaSelfAuditInput): OpenbasakaSelfObservationWorkflow {
  const enabled = (input.selfObservationEnabledCount || 0) > 0
  return {
    id: 'openbasaka-self-observer',
    title: '夜间自省工作流',
    status: enabled ? 'running-daily' : 'not-started',
    enabled,
    cadence: '每天 03:17 自动夜巡；错过会在下次打开时补跑',
    plainSummary: enabled
      ? '已经开启。它会在凌晨自己看系统、试模型钥匙、找 bug、生成晨报和修复队列。'
      : '还没开启夜间自省。现在只是打开页面时临时看一遍，还没有凌晨自动夜巡。',
    watches: [
      '昨晚系统自己看了哪些地方',
      '哪些修复完成或卡住',
      '记忆、Wiki、Agent、技能有没有成长',
      '下一件最该修的事是什么，以及需不需要 Boss 点头',
    ],
    nextUserAction: enabled
      ? '明早看晨报；如果看到“可以执行修复了”，优先处理最上面的确认卡。'
      : '开启夜间自省，让它每天凌晨自己检查自己。',
  }
}

function makeDomain(input: {
  id: OpenbasakaSelfAuditDomainId
  title: string
  score: number
  summary: string
  evidence: string[]
  risks: string[]
  nextActions: string[]
  focus: string
}): OpenbasakaSelfAuditDomain {
  const domain = {
    id: input.id,
    title: input.title,
    score: clampScore(input.score),
    summary: input.summary,
    evidence: input.evidence,
    risks: input.risks,
    nextActions: input.nextActions,
    councilSeats: selectDomainCouncil(input.title, input.focus),
  }
  return {
    ...domain,
    councilAudit: buildLocalCouncilAudit(domain),
  }
}

export function buildOpenbasakaSelfAuditReport(input: OpenbasakaSelfAuditInput): OpenbasakaSelfAuditReport {
  const now = input.now || new Date()
  const executionDeck = buildExecutionLearningDeck(input.operatingEvents, 6)
  const executionSummary = executionDeck.summary
  const classifiedProjectCount = Object.keys(input.taxonomies).length
  const highSignalSynapseCount = input.synapses.filter(synapse => synapse.strength >= 70).length

  const visionReport = computeVisionAlignmentReport({
    projects: input.projects,
    taxonomies: input.taxonomies,
    synapses: input.synapses,
    bossState: input.bossState,
    bossMemoryCount: input.bossMemoryCount,
    wikiPageCount: input.wikiPageCount,
    wikiSourceCount: input.wikiSourceCount,
    drawerCount: input.drawerCount,
    uncompiledDrawerCount: input.uncompiledDrawerCount,
    wingCount: input.wingCount,
    skillEvolutionCount: input.skillEvolutionCount,
    scheduledTaskCount: input.scheduledTaskCount,
    teamCount: input.teamCount,
    customAgentCount: input.customAgentCount,
  })

  const dailyBrief = buildDailyBriefDeck({
    now,
    projectCount: input.projects.length,
    classifiedProjectCount,
    synapseCount: input.synapses.length,
    highSignalSynapseCount,
    bossMemoryCount: input.bossMemoryCount,
    decisionCount: input.decisionCount,
    pendingArchiveCount: input.pendingArchiveCount,
    operatingEvents: input.operatingEvents,
    executionSummary,
  })

  const projectPillar = findPillar(visionReport, 'project_intelligence')
  const bossPillar = findPillar(visionReport, 'boss_modeling')
  const memoryPillar = findPillar(visionReport, 'memory_system')
  const knowledgePillar = findPillar(visionReport, 'knowledge_workflow')
  const evolutionPillar = findPillar(visionReport, 'evolution_loop')
  const agentScore = buildAgentScore(input, executionSummary)
  const trustScore = buildTrustSafetyScore(input, executionSummary)
  const workflowScore = buildWorkflowScore(input)

  const domains: OpenbasakaSelfAuditDomain[] = [
    domainFromPillar('vision_product', '愿景 / 产品', projectPillar, '产品主线、项目组合、功能是否回到 Boss 主循环'),
    domainFromPillar('boss_modeling', 'Boss 建模', bossPillar, '是否真正理解 Boss 的偏好、目标、认知方式和决策痕迹'),
    makeDomain({
      id: 'memory_wiki',
      title: '记忆 / Wiki',
      score: average([memoryPillar.score, knowledgePillar.score]),
      summary: `${memoryPillar.summary} ${knowledgePillar.summary}`,
      evidence: [...memoryPillar.evidence, ...knowledgePillar.evidence].slice(0, 6),
      risks: [memoryPillar.nextMove, knowledgePillar.nextMove],
      nextActions: [memoryPillar.nextMove, knowledgePillar.nextMove],
      focus: 'MemPalace、Wiki、来源证据和知识编译闭环',
    }),
    makeDomain({
      id: 'agent_os',
      title: 'Agent OS / 执行',
      score: agentScore,
      summary: agentScore >= 75 ? 'Agent、定时任务与执行收据开始形成可复盘运行层。' : 'Agent OS 仍需要更多真实执行收据、团队协作和任务回写。',
      evidence: [
        `${input.scheduledTaskCount} 个启用定时任务`,
        `${input.teamCount} 个团队`,
        `${input.customAgentCount} 个自定义代理`,
        `${executionSummary.total} 条可解析执行收据`,
      ],
      risks: executionSummary.total === 0 ? ['缺少真实执行收据，无法判断 Agent 是否真正推动系统。'] : [executionSummary.strongestSignal],
      nextActions: [executionSummary.nextAction],
      focus: 'Hermes-style 任务、子代理、执行收据和工具闭环',
    }),
    makeDomain({
      id: 'learning_evolution',
      title: '学习 / 进化',
      score: average([evolutionPillar.score, dailyBrief.readinessScore]),
      summary: evolutionPillar.summary,
      evidence: [
        `${input.skillEvolutionCount} 条 skill_evolution`,
        `${input.evolutionEventCount || 0} 条 evolution_events`,
        `${dailyBrief.readinessScore} 今日学习就绪分`,
      ],
      risks: [evolutionPillar.nextMove],
      nextActions: [evolutionPillar.nextMove, dailyBrief.focus],
      focus: 'Hermes Agent 的长期记忆、Auto Skills、Schedules 和自我进化闭环',
    }),
    makeDomain({
      id: 'trust_safety',
      title: '安全 / 可信',
      score: trustScore,
      summary: trustScore >= 76 ? '可信链路有基础，但仍要持续区分证据、推断和未验证结论。' : '可信链路还偏弱，必须优先补证据覆盖、失败复盘和历史记录。',
      evidence: [
        `执行证据覆盖 ${executionSummary.evidenceCoverage}%`,
        `${input.operatingEvents.filter(event => event.stage === 'review').length} 条 review 事件`,
        `${input.pendingArchiveCount} 条待归档`,
      ],
      risks: input.pendingArchiveCount > 0 ? ['待归档入口堆积会削弱长期记忆可信度。'] : ['需要继续保持“不能把未验证说成已完成”的硬边界。'],
      nextActions: [input.pendingArchiveCount > 0 ? '先处理待归档入口，再扩大自动化。' : '继续让每次执行产生来源、证据和复盘记录。'],
      focus: '证据链、历史记录、失败复盘、隐私与安全边界',
    }),
    makeDomain({
      id: 'ux_workflow',
      title: 'UX / 工作流',
      score: workflowScore,
      summary: workflowScore >= 75 ? '主要模块已经有工作站形态，下一步是减少跳转摩擦。' : '工作流仍容易被功能分散，需要让每个模块更清楚地暴露职责、状态和下一步。',
      evidence: [
        `${input.projects.length} 个项目神经元`,
        `${input.synapses.length} 条突触`,
        `${new Set(input.operatingEvents.map(event => event.stage)).size} 类运行阶段有记录`,
      ],
      risks: ['如果只增加页面而不接入主循环，会继续稀释 Openbasaka 的有机系统感。'],
      nextActions: ['把每个模块的当前状态、下一步和写回位置继续收束到沙盘工作站。'],
      focus: '沙盘导航、模块可理解性、下一步动作和信息密度',
    }),
  ]

  const overallScore = clampScore(average(domains.map(domain => domain.score)))
  const topRisks = domains.flatMap(domain => domain.risks.map(risk => `${domain.title}: ${risk}`)).slice(0, 5)
  const nextActions = Array.from(new Set([
    ...visionReport.nextActions,
    ...domains.flatMap(domain => domain.nextActions),
  ])).slice(0, 6)
  const generatedAt = now.toISOString()
  const generatedDateKey = localDateKey(now)
  const modelRouteHealth = defaultUncheckedModelHealth(now)
  const baseReportForRepair = {
    id: `openbasaka-self-audit-${generatedDateKey}`,
    generatedAt,
    domains,
  }
  const selfRepairPlans = buildOpenbasakaSelfRepairPlans(baseReportForRepair)
  const dailyLearningReport = buildDailyLearningReport(input, domains, selfRepairPlans, generatedAt)
  const observationWorkflow = buildObservationWorkflow(input)
  const dreamState = createOpenbasakaDreamSeedState({
    sourceAuditId: baseReportForRepair.id,
    generatedAt,
    headline: '夜巡完成后会进入 light、REM、deep 三段做梦，把高置信学习自动写入长期进化账本。',
    nextDreamTopic: selfRepairPlans[0]?.title || '下一次夜巡先观察学习、进化和修复队列是否真的产生收据。',
  })
  const repairConfirmationGuard = buildOpenbasakaRepairConfirmationGuard({
    plans: selfRepairPlans,
  })
  const reportCore = {
    id: baseReportForRepair.id,
    generatedAt,
    overallScore,
    domains,
    selfRepairPlans,
    dailyLearningReport,
    learningProgress: {
      score: dailyBrief.readinessScore,
      summary: dailyBrief.headline,
      signals: dailyBrief.sections.flatMap(section => section.items.map(item => `${item.title}: ${item.value}`)).slice(0, 6),
    },
    evolutionProgress: {
      score: evolutionPillar.score,
      summary: evolutionPillar.summary,
      signals: evolutionPillar.evidence,
    },
    modelRouteHealth,
    dreamState,
    repairConfirmationGuard,
  }
  const nightlyLog = renderNightlyLogCard({ report: reportCore })

  return {
    id: reportCore.id,
    generatedAt,
    overallScore,
    headline:
      overallScore >= 78
        ? 'Openbasaka 已经具备有机智能系统的主循环雏形。'
        : overallScore >= 58
          ? 'Openbasaka 主线成立，但学习、执行和可信闭环还需要加厚。'
          : 'Openbasaka 仍有功能集合感，先把 Boss、项目、记忆、知识和进化闭环接牢。',
    domains,
    learningProgress: reportCore.learningProgress,
    evolutionProgress: reportCore.evolutionProgress,
    dailyBrief,
    visionReport,
    topRisks,
    nextActions,
    selfRepairPlans,
    observationWorkflow,
    dailyLearningReport,
    modelRouteHealth,
    repairAutonomyPolicy: SAFE_REPAIR_AUTONOMY_POLICY,
    repairConfirmationGuard,
    nightlyLog,
    dreamState,
  }
}

async function countTable(sql: string): Promise<number> {
  try {
    const rows = await query<{ count: number }>(sql)
    return Number(rows[0]?.count || 0)
  } catch {
    return 0
  }
}

export async function loadOpenbasakaSelfAuditRuntimeCounts(): Promise<OpenbasakaSelfAuditRuntimeCounts> {
  const [
    wikiPageCount,
    wikiSourceCount,
    drawerCount,
    uncompiledDrawerCount,
    wingCount,
    skillEvolutionCount,
    scheduledTaskCount,
    selfObservationTaskCount,
    selfObservationEnabledCount,
    teamCount,
    customAgentCount,
    evolutionEventCount,
  ] = await Promise.all([
    countTable('SELECT COUNT(*) as count FROM wiki_pages'),
    countTable('SELECT COUNT(*) as count FROM wiki_sources'),
    countTable('SELECT COUNT(*) as count FROM mempalace_drawers'),
    countTable('SELECT COUNT(*) as count FROM mempalace_drawers WHERE is_compiled = 0'),
    countTable('SELECT COUNT(DISTINCT wing) as count FROM mempalace_drawers'),
    countTable('SELECT COUNT(*) as count FROM skill_evolution'),
    countTable('SELECT COUNT(*) as count FROM scheduled_tasks WHERE enabled = 1'),
    countTable(`SELECT COUNT(*) as count FROM scheduled_tasks WHERE task_type = '${OPENBASAKA_NIGHTLY_TASK_TYPE}' OR task_config_json LIKE '%openbasaka-self-observer%' OR task_config_json LIKE '%${OPENBASAKA_NIGHTLY_SOURCE}%'`),
    countTable(`SELECT COUNT(*) as count FROM scheduled_tasks WHERE enabled = 1 AND (task_type = '${OPENBASAKA_NIGHTLY_TASK_TYPE}' OR task_config_json LIKE '%openbasaka-self-observer%' OR task_config_json LIKE '%${OPENBASAKA_NIGHTLY_SOURCE}%')`),
    countTable('SELECT COUNT(*) as count FROM teams'),
    countTable('SELECT COUNT(*) as count FROM custom_agents'),
    countTable('SELECT COUNT(*) as count FROM evolution_events'),
  ])

  return {
    wikiPageCount,
    wikiSourceCount,
    drawerCount,
    uncompiledDrawerCount,
    wingCount,
    skillEvolutionCount,
    scheduledTaskCount,
    selfObservationTaskCount,
    selfObservationEnabledCount,
    teamCount,
    customAgentCount,
    evolutionEventCount,
  }
}

function buildDomainCouncilProblem(report: OpenbasakaSelfAuditReport, domain: OpenbasakaSelfAuditDomain): string {
  return [
    `Openbasaka 系统自省领域：${domain.title}`,
    `总分：${report.overallScore}/100；领域分：${domain.score}/100`,
    `当前结论：${domain.summary}`,
    `证据：${domain.evidence.join('；') || '暂无明确证据'}`,
    `风险：${domain.risks.join('；') || '暂无明确风险'}`,
    `下一步：${domain.nextActions.join('；') || '请提出最低可行修复'}`,
    '请用小白智囊团做深度匹配：需要产品、技术、反方、安全、学习进化和 UX 工作流视角。输出要能转成自我修复工作流，不要只给观点。',
  ].join('\n')
}

function buildSystemCouncilProblem(report: OpenbasakaSelfAuditReport): string {
  const domainRows = report.domains.map((domain, index) => [
    `${index + 1}. ${domain.title}: ${domain.score}/100`,
    `结论：${compactText(domain.summary, 180)}`,
    `证据：${domain.evidence.slice(0, 3).join('；') || '暂无'}`,
    `风险：${domain.risks.slice(0, 2).join('；') || '暂无'}`,
    `下一步：${domain.nextActions.slice(0, 2).join('；') || '请给出最低可行修复'}`,
  ].join('\n')).join('\n\n')

  return [
    'Openbasaka 系统自省总审。',
    `总分：${report.overallScore}/100`,
    `一句话：${report.headline}`,
    '',
    '请只做一件事：为整个系统自省选择最合适的小白智囊团席位，并给出总审逻辑。',
    '不要逐个领域长篇输出；领域落点会由本地证据评分系统负责。',
    '需要覆盖产品、技术、反方、安全、学习进化、UX 工作流。',
    '',
    '七个领域证据：',
    domainRows,
    '',
    '输出应帮助系统把低分领域转成可执行修复工作流；不要只给观点。',
  ].join('\n')
}

function councilSeatsFromSelection(selection: CouncilSelection): OpenbasakaSelfAuditDomain['councilSeats'] {
  return summarizeCouncilSeats(selection.seats)
}

function auditFromSelection(domain: OpenbasakaSelfAuditDomain, selection: CouncilSelection): OpenbasakaSelfAuditCouncilAudit {
  const seats = councilSeatsFromSelection(selection)
  const base = buildLocalCouncilAudit({ ...domain, councilSeats: seats })
  const trace = selection.matchGate.stageTrace.map(event => ({
    phaseId: event.phaseId,
    label: event.label,
    status: event.status,
    detail: event.detail,
  }))
  const judgeSummary = selection.matchGate.judgeSummary || base.judgeSummary
  const decisionSource = selection.matchGate.decisionSource || 'local-fallback'
  return {
    ...base,
    decisionSource,
    judgeSummary,
    verdict:
      decisionSource === 'deep-model'
        ? `小白智囊团已完成系统总审，落到「${domain.title}」的判断是：${domain.score >= 78 ? '这块基础较稳，继续保持证据回写。' : domain.score >= 58 ? '这块能用，但要继续把风险变成修复工作流。' : '这块是当前最该补的短板。'}`
        : base.verdict,
    evidenceClaims: Array.from(new Set([
      ...base.evidenceClaims,
      ...selection.matchGate.explanation.slice(0, 3),
    ])).slice(0, 6),
    objections: Array.from(new Set([
      ...base.objections,
      ...selection.seats.flatMap(seat => seat.reasons.slice(0, 1)).filter(Boolean),
    ])).slice(0, 6),
    confidence: decisionSource === 'deep-model' ? Math.max(base.confidence, 0.82) : base.confidence,
    seatVerdicts: buildSeatVerdicts({ ...domain, councilSeats: seats }),
    stageTrace: trace.length ? trace : base.stageTrace,
  }
}

async function enrichDomainCouncilAudit(
  report: OpenbasakaSelfAuditReport,
  domain: OpenbasakaSelfAuditDomain,
  options?: OpenbasakaSelfAuditCouncilOptions,
): Promise<OpenbasakaSelfAuditDomain> {
  const runMatch = options?.runMatchGate || runCouncilMatchGate
  try {
    const selection = await runMatch({ problem: buildDomainCouncilProblem(report, domain) })
    return {
      ...domain,
      councilSeats: councilSeatsFromSelection(selection),
      councilAudit: auditFromSelection(domain, selection),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ...domain,
      councilAudit: {
        ...buildLocalCouncilAudit(domain),
        judgeSummary: `深度 CouncilMatchGate 未完成，已退回本地 fallback。原因：${message}`,
      },
    }
  }
}

export async function runOpenbasakaSelfAuditCouncil(
  report: OpenbasakaSelfAuditReport,
  options?: OpenbasakaSelfAuditCouncilOptions,
): Promise<OpenbasakaSelfAuditReport> {
  const runMatch = options?.runMatchGate || runCouncilMatchGate
  let domains: OpenbasakaSelfAuditDomain[]
  try {
    const selection = await runMatch(
      { problem: buildSystemCouncilProblem(report) },
      {
        judgeCompletion: options?.judgeCompletion,
      },
    )
    domains = report.domains.map(domain => ({
      ...domain,
      councilSeats: councilSeatsFromSelection(selection),
      councilAudit: auditFromSelection(domain, selection),
    }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    domains = report.domains.map(domain => ({
      ...domain,
      councilAudit: {
        ...buildLocalCouncilAudit(domain),
        judgeSummary: `深度 CouncilMatchGate 总审未完成，已退回本地 fallback。原因：${message}`,
      },
    }))
  }
  const selfRepairPlans = buildOpenbasakaSelfRepairPlans({ id: report.id, generatedAt: report.generatedAt, domains })
  const nextReport = {
    ...report,
    domains,
    selfRepairPlans,
    repairConfirmationGuard: buildOpenbasakaRepairConfirmationGuard({ plans: selfRepairPlans }),
    dailyLearningReport: {
      ...report.dailyLearningReport,
      councilDisagreements: domains
        .filter(domain => domain.councilAudit.risk !== 'low' || domain.councilAudit.objections.length > 0)
        .map(domain => `${domain.title}: ${domain.councilAudit.objections[0] || domain.councilAudit.verdict}`)
        .slice(0, 5),
      tomorrowRepair: selfRepairPlans[0]?.title || report.dailyLearningReport.tomorrowRepair,
    },
  }
  return {
    ...nextReport,
    nightlyLog: renderNightlyLogCard({ report: nextReport }),
  }
}

async function ensureSelfRepairTeam(): Promise<string> {
  const teams = await listTeams({ status: 'active' }).catch(() => [])
  const existing = teams.find(team => team.name === SELF_REPAIR_TEAM_NAME)
  if (existing) return existing.id

  return createTeam({
    name: SELF_REPAIR_TEAM_NAME,
    description: '用于把系统自省中的风险、证据缺口和下一步动作转成可审查、可调度、可回写的 Openbasaka 自我修复工作流。',
    teamType: 'permanent',
    agents: [
      { agentId: 'general', role: '自省主持', skills: ['review', 'prd'] },
      { agentId: 'strategy', role: '愿景产品审查', skills: ['prd', 'review'] },
      { agentId: 'technical', role: 'Agent OS 技术修复', skills: ['codegen', 'terminal', 'review'] },
      { agentId: 'critic', role: '反方风险闸门', skills: ['review'] },
      { agentId: 'memory', role: '记忆与 Wiki 回写', skills: ['filesystem', 'review'] },
      { agentId: 'automation', role: '调度与进化闭环', skills: ['terminal', 'review'] },
    ],
    config: {
      communicationPattern: 'sequential',
      workflowType: 'automation',
      capabilities: ['filesystem', 'terminal', 'codegen', 'review'],
      executionMode: 'supervised',
      temperature: 0.42,
      tasks: [
        { id: 't1', description: '主持人复述问题、证据、不可自动执行边界', assignedAgent: 'general', dependsOn: [], outputKey: 'brief' },
        { id: 't2', description: '产品/愿景席判断是否回到 Boss 主循环', assignedAgent: 'strategy', dependsOn: ['t1'], outputKey: 'alignment' },
        { id: 't3', description: '技术席拆出数据层、UI 层、历史记录和测试修复点', assignedAgent: 'technical', dependsOn: ['t1'], outputKey: 'technical' },
        { id: 't4', description: '记忆席确认 operating_events、Wiki、Boss 画像或 evolution 写回位置', assignedAgent: 'memory', dependsOn: ['t1'], outputKey: 'memory' },
        { id: 't5', description: '反方席标注误报、过度自动化和安全边界', assignedAgent: 'critic', dependsOn: ['t2', 't3', 't4'], outputKey: 'risk' },
        { id: 't6', description: '自动化席形成可审查 workflow/scheduler 方案', assignedAgent: 'automation', dependsOn: ['t3', 't5'], outputKey: 'workflow' },
      ],
    },
  })
}

function buildRepairWorkflowPrompt(plan: OpenbasakaSelfRepairPlan): string {
  return generatePromptTemplateFromWorkflow({
    name: plan.title,
    goal: plan.problem,
    workflowType: 'automation',
    steps: plan.workflowSteps,
  })
}

async function upsertDisabledRepairSchedule(plan: OpenbasakaSelfRepairPlan, workflowStudioId: string, teamId: string): Promise<string> {
  const rows = await query<Record<string, unknown>>('SELECT id, task_config_json FROM scheduled_tasks ORDER BY created_at DESC').catch(() => [])
  const existing = rows.find(row => {
    try {
      const config = JSON.parse(String(row.task_config_json || '{}')) as Record<string, unknown>
      return config.selfRepairPlanId === plan.id
    } catch {
      return false
    }
  })
  const taskConfig: Record<string, string> = {
    prompt: `${plan.title}\n\n问题：${plan.problem}\n\n证据：${plan.evidence.join('；')}\n\n验收：${plan.acceptance.join('；')}`,
    goal: plan.problem,
    workflowCatalogId: `self-audit:${plan.id}`,
    workflowSource: 'openbasaka-self-audit',
    workflowId: workflowStudioId,
    studioWorkflowId: workflowStudioId,
    teamId,
    workflowType: 'automation',
    workflowLabel: plan.title,
    artifactLabel: 'Openbasaka 自我修复工作流',
    steps: plan.workflowSteps.join('\n'),
    selfRepairPlanId: plan.id,
    sourceAuditId: plan.sourceAuditId,
    riskGate: plan.riskGate,
    autonomyPolicy: SAFE_REPAIR_AUTONOMY_POLICY.mode,
  }

  if (existing?.id) {
    await updateScheduledTask(String(existing.id), {
      name: `自省修复｜${plan.title}`,
      cronExpression: '0 9 * * *',
      taskConfig,
      enabled: false,
    })
    return String(existing.id)
  }

  return createScheduledTask({
    name: `自省修复｜${plan.title}`,
    cronExpression: '0 9 * * *',
    taskType: 'team-workflow',
    taskConfig,
    enabled: false,
  })
}

export async function saveOpenbasakaSelfRepairWorkflows(report: OpenbasakaSelfAuditReport): Promise<OpenbasakaSelfRepairPlan[]> {
  const teamId = await ensureSelfRepairTeam()
  const saved: OpenbasakaSelfRepairPlan[] = []
  for (const plan of report.selfRepairPlans) {
    const workflowStudioId = await saveWorkflowStudioItem({
      id: `wfs_openbasaka_self_repair_${plan.ownerDomain}`,
      name: plan.title,
      goal: plan.problem,
      workflowType: 'automation',
      teamId,
      promptTemplate: buildRepairWorkflowPrompt(plan),
      steps: plan.workflowSteps,
      targetConsumers: ['teams', 'scheduler', 'xiaobai'],
    })
    const scheduledTaskId = await upsertDisabledRepairSchedule(plan, workflowStudioId, teamId)
    const nextPlan: OpenbasakaSelfRepairPlan = {
      ...plan,
      workflowStudioId,
      scheduledTaskId,
      status: 'scheduled-disabled',
    }
    await dbSaveOperatingEvent({
      id: `op_openbasaka_self_repair_${plan.ownerDomain}`,
      type: 'agent_action',
      stage: 'execute',
      agentId: 'openbasaka-self-repair',
      title: `自我修复工作流｜${plan.title}`,
      status: 'queued',
      toolRefs: ['xiaobai-council', 'workflow-studio', 'scheduled_tasks', 'operating_events'],
      resultPreview: `已生成可审查群策工作流，并创建禁用状态的 team-workflow 定时任务：${scheduledTaskId}。安全自启只跑低风险步骤，高风险动作停给 Boss。`,
      source: { kind: 'agent', sourceId: 'openbasaka-self-repair', title: '系统自省自我修复' },
      confidence: 0.78,
      entities: ['openbasaka', 'self-audit', 'self-repair', plan.ownerDomain],
    })
    saved.push(nextPlan)
  }
  return saved
}

function buildSelfRepairRunSteps(plan: OpenbasakaSelfRepairPlan): OpenbasakaSelfRepairRunResult['runSteps'] {
  const safeSteps: OpenbasakaSelfRepairRunResult['runSteps'] = [
    {
      title: '读懂问题',
      detail: `已读取「${plan.title}」的问题、证据和责任领域。`,
      status: 'completed',
    },
    {
      title: '写入运行历史',
      detail: '这次启动会写入 operating_events，下次系统自省能看见这次修复动作。',
      status: 'completed',
    },
    {
      title: '生成小白版下一步',
      detail: plan.workflowSteps[0] || '先把问题、证据、风险和下一步说清楚。',
      status: 'completed',
    },
  ]
  const needsBoss = plan.acceptance.some(item => /代码|删除|外发|高风险|确认/.test(item)) || plan.riskGate.includes('不自动修改代码')
  if (needsBoss) {
    safeSteps.push({
      title: '高风险动作先停住',
      detail: '这条修复可能影响代码、数据或系统行为；已经启动安全部分，真正改动前要让 Boss 看见并确认。',
      status: 'blocked',
    })
  }
  return safeSteps
}

export async function runOpenbasakaSelfRepairWorkflow(plan: OpenbasakaSelfRepairPlan): Promise<OpenbasakaSelfRepairRunResult> {
  if (!plan.workflowStudioId) {
    throw new Error('这条修复还没有生成工作流，请先点“交给群策生成修复工作流”。')
  }
  const runSteps = buildSelfRepairRunSteps(plan)
  const blockedCount = runSteps.filter(step => step.status === 'blocked').length
  const completedCount = runSteps.filter(step => step.status === 'completed').length
  const blocked = blockedCount > 0
  const nextPlan: OpenbasakaSelfRepairPlan = {
    ...plan,
    status: blocked ? 'blocked' : 'completed',
  }
  const summary = blocked
    ? `已启动安全修复流程：${trimSentenceEnd(plan.title)}。系统已完成 ${completedCount} 步安全动作，${blockedCount} 步高风险动作留给 Boss 确认。`
    : `已完成安全修复流程：${trimSentenceEnd(plan.title)}。系统已完成 ${completedCount} 步，并写入运行历史。`
  const bossMessage = blocked
    ? `我已经先把能安全做的部分跑起来了。下一步需要你确认：${plan.workflowSteps[2] || plan.acceptance[0] || '是否进入实际修复。'} 入口在「沙盘 → 系统自省 → Boss确认守护」，不会因为你忘记就沉掉。`
    : '这条修复的安全部分已经跑完，下次系统自省会把它算进修复历史。'

  await dbSaveOperatingEvent({
    id: `op_openbasaka_self_repair_run_${Date.now().toString(36)}`,
    type: 'agent_action',
    stage: blocked ? 'review' : 'execute',
    agentId: 'openbasaka-self-repair-runner',
    title: `已试跑自我修复｜${plan.title}`,
    status: blocked ? 'blocked' : 'completed',
    toolRefs: ['workflow-studio', 'team-workflow', 'team-actions', 'operating_events'],
    resultPreview: `${summary} ${bossMessage}`,
    source: { kind: 'agent', sourceId: 'openbasaka-self-repair', title: '系统自省自我修复试跑' },
    confidence: blocked ? 0.68 : 0.82,
    entities: ['openbasaka', 'self-audit', 'self-repair', 'workflow-run', plan.ownerDomain],
  })

  return {
    plan: nextPlan,
    success: !blocked,
    summary,
    bossMessage,
    runSteps,
    actionSummary: {
      total: runSteps.length,
      executed: runSteps.length,
      completed: completedCount,
      failed: 0,
      blocked: blockedCount,
    },
  }
}

function buildSelfObserverSteps(): string[] {
  return [
    '凌晨先看 Openbasaka 昨天做过什么：运行历史、定时任务、群策会话、工作流、记忆和 Wiki。',
    '试连 GLM 5.1 与 DeepSeek V4：只记录是否接通，不展示密钥。',
    '用小白能听懂的话说清楚：昨晚发生了什么、系统学到了什么、哪里卡住了。',
    '检查自我修复队列：哪些已经完成、哪些失败、哪些只是生成了但还没执行。',
    '只选一件明天最该修的事，并说明为什么它最重要。',
    '写回一份晨报收据：低风险安全步骤可自启；代码、删除、外发、密钥和权限动作必须停给 Boss 确认。',
  ]
}

function buildSelfObserverPrompt(report: OpenbasakaSelfAuditReport): string {
  return generatePromptTemplateFromWorkflow({
    name: 'Openbasaka 每日自观察',
    goal: '每天凌晨自动观察 Openbasaka 自己的学习、执行、记忆、知识和进化情况，生成小白能看懂的晨报和一件最该修的事。',
    workflowType: 'automation',
    steps: buildSelfObserverSteps(),
  })
    .split('{{input}}')
    .join([
      `今日系统总分：${report.overallScore}/100`,
      `今日一句话：${report.headline}`,
      `当前最该修：${report.selfRepairPlans[0]?.title || report.nextActions[0] || '先补证据和历史记录'}`,
      `模型钥匙：${healthPlainText(report.modelRouteHealth)}`,
      `需要解释给小白听：发生了什么、改变了什么、下一步按哪里。`,
    ].join('\n'))
}

async function upsertSelfObservationSchedule(report: OpenbasakaSelfAuditReport, workflowStudioId: string, teamId: string): Promise<string> {
  const rows = await query<Record<string, unknown>>('SELECT id, task_config_json FROM scheduled_tasks ORDER BY created_at DESC').catch(() => [])
  const existing = rows.find(row => {
    if (String(row.id) === OPENBASAKA_NIGHTLY_TASK_ID) return true
    try {
      const config = JSON.parse(String(row.task_config_json || '{}')) as Record<string, unknown>
      return config.workflowSource === 'openbasaka-self-observer' || config.workflowSource === OPENBASAKA_NIGHTLY_SOURCE
    } catch {
      return false
    }
  })
  const taskConfig: Record<string, string> = {
    prompt: [
      '请执行 Openbasaka 夜间自省。',
      `总分：${report.overallScore}/100`,
      `今日重点：${report.dailyLearningReport.tomorrowRepair}`,
      `模型钥匙：${healthPlainText(report.modelRouteHealth)}`,
      '必须用小白能听懂的话输出：昨晚发生了什么、学到了什么、进化了什么、下一步该修什么。',
      `边界：${SAFE_REPAIR_AUTONOMY_POLICY.plainSummary}`,
    ].join('\n'),
    goal: '每天凌晨观察 Openbasaka 自己，生成学习/进化/修复晨报。',
    workflowCatalogId: `self-observer:${workflowStudioId}`,
    workflowSource: OPENBASAKA_NIGHTLY_SOURCE,
    workflowId: workflowStudioId,
    studioWorkflowId: workflowStudioId,
    teamId,
    workflowType: 'automation',
    workflowLabel: 'Openbasaka 夜间自省',
    artifactLabel: '夜巡晨报',
    promptTemplate: buildSelfObserverPrompt(report),
    steps: buildSelfObserverSteps().join('\n'),
    sourceAuditId: report.id,
    safetyBoundary: SAFE_REPAIR_AUTONOMY_POLICY.mode,
  }

  if (existing?.id) {
    await updateScheduledTask(String(existing.id), {
      name: 'Openbasaka 夜间自省',
      cronExpression: OPENBASAKA_NIGHTLY_CRON,
      taskConfig,
      enabled: true,
    })
    return String(existing.id)
  }

  try {
    await run(
      `INSERT OR REPLACE INTO scheduled_tasks
       (id, name, cron_expression, task_type, task_config_json, last_run, next_run, enabled, agent_id, platform_config_json)
       VALUES (?, ?, ?, ?, ?, '', '', 1, '', '[]')`,
      [
        OPENBASAKA_NIGHTLY_TASK_ID,
        'Openbasaka 夜间自省',
        OPENBASAKA_NIGHTLY_CRON,
        OPENBASAKA_NIGHTLY_TASK_TYPE,
        JSON.stringify(taskConfig),
      ],
    )
    return OPENBASAKA_NIGHTLY_TASK_ID
  } catch {
    return createScheduledTask({
      name: 'Openbasaka 夜间自省',
      cronExpression: OPENBASAKA_NIGHTLY_CRON,
      taskType: OPENBASAKA_NIGHTLY_TASK_TYPE,
      taskConfig,
      enabled: true,
    })
  }
}

export async function saveOpenbasakaSelfObservationWorkflow(report: OpenbasakaSelfAuditReport): Promise<OpenbasakaSelfObservationWorkflow> {
  const teamId = await ensureSelfRepairTeam()
  const workflowStudioId = await saveWorkflowStudioItem({
    id: SELF_OBSERVER_WORKFLOW_ID,
    name: 'Openbasaka 夜间自省',
    goal: '每天凌晨自动观察 Openbasaka 自己的学习、执行、记忆、知识和进化情况，生成小白能看懂的晨报和一件最该修的事。',
    workflowType: 'automation',
    teamId,
    promptTemplate: buildSelfObserverPrompt(report),
    steps: buildSelfObserverSteps(),
    targetConsumers: ['teams', 'scheduler', 'xiaobai'],
  })
  const scheduledTaskId = await upsertSelfObservationSchedule(report, workflowStudioId, teamId)

  await dbSaveOperatingEvent({
    id: 'op_openbasaka_self_observer_workflow',
    type: 'agent_action',
    stage: 'execute',
    agentId: 'openbasaka-self-observer',
    title: '夜间自省工作流已开启',
    status: 'queued',
    toolRefs: ['xiaobai-council', 'workflow-studio', 'scheduled_tasks', 'operating_events'],
    resultPreview: `已创建并启用每日 03:17 夜间自省任务：${scheduledTaskId}。${SAFE_REPAIR_AUTONOMY_POLICY.plainSummary}`,
    source: { kind: 'agent', sourceId: OPENBASAKA_NIGHTLY_SOURCE, title: '系统自省夜间自省' },
    confidence: 0.82,
    entities: ['openbasaka', 'self-audit', 'self-observer', 'xiaobai-council'],
  })

  return {
    ...report.observationWorkflow,
    status: 'running-daily',
    enabled: true,
    title: '夜间自省工作流',
    cadence: '每天 03:17 自动夜巡；错过会在下次打开时补跑',
    plainSummary: '已经开启。它每天凌晨会自己看一遍 Openbasaka，留下小白能看懂的晨报。',
    nextUserAction: '明早看晨报；如果看到“可以执行修复了”，优先看最上面的 Boss 确认卡。',
    workflowStudioId,
    scheduledTaskId,
  }
}

function buildNightlyTaskConfig(report?: OpenbasakaSelfAuditReport): Record<string, string> {
  return {
    prompt: [
      '请执行 Openbasaka 夜间自省：检查学习、进化、系统 bug、升级机会、模型钥匙和修复队列。',
      report ? `上次总分：${report.overallScore}/100` : '启动时先建立夜巡任务，运行时再读取最新系统证据。',
      report ? `上次最该修：${report.dailyLearningReport.tomorrowRepair}` : '运行时选择一件最该修的事。',
      '必须用小白能听懂的话写晨报：昨晚发生了什么、自己修了什么、还需要 Boss 点头什么。',
      `边界：${SAFE_REPAIR_AUTONOMY_POLICY.plainSummary}`,
    ].join('\n'),
    goal: '每天凌晨 03:17 自动检查 Openbasaka 的学习、进化、bug、升级机会和修复队列。',
    workflowSource: OPENBASAKA_NIGHTLY_SOURCE,
    workflowType: 'automation',
    workflowLabel: 'Openbasaka 夜间自省',
    artifactLabel: '夜巡晨报',
    autonomyPolicy: SAFE_REPAIR_AUTONOMY_POLICY.mode,
    scheduledWindow: '03:00-06:00',
    safetyBoundary: SAFE_REPAIR_AUTONOMY_POLICY.plainSummary,
    sourceAuditId: report?.id || '',
  }
}

export async function ensureOpenbasakaNightlyMaintenanceTask(report?: OpenbasakaSelfAuditReport): Promise<string> {
  const taskConfig = buildNightlyTaskConfig(report)
  const rows = await query<Record<string, unknown>>(
    `SELECT id, task_config_json FROM scheduled_tasks
     WHERE id = ? OR task_type = ? OR task_config_json LIKE ?
     ORDER BY created_at DESC`,
    [OPENBASAKA_NIGHTLY_TASK_ID, OPENBASAKA_NIGHTLY_TASK_TYPE, `%${OPENBASAKA_NIGHTLY_SOURCE}%`],
  ).catch(() => [])
  const existing = rows[0]
  if (existing?.id) {
    await updateScheduledTask(String(existing.id), {
      name: 'Openbasaka 夜间自省',
      cronExpression: OPENBASAKA_NIGHTLY_CRON,
      taskConfig,
      enabled: true,
    })
    try {
      if (String(existing.id) !== OPENBASAKA_NIGHTLY_TASK_ID) {
        await run('UPDATE scheduled_tasks SET id = ? WHERE id = ?', [OPENBASAKA_NIGHTLY_TASK_ID, String(existing.id)])
      }
      await run('UPDATE scheduled_tasks SET task_type = ? WHERE id = ?', [OPENBASAKA_NIGHTLY_TASK_TYPE, OPENBASAKA_NIGHTLY_TASK_ID])
      return OPENBASAKA_NIGHTLY_TASK_ID
    } catch {
      return String(existing.id)
    }
  }

  try {
    await run(
      `INSERT OR REPLACE INTO scheduled_tasks
       (id, name, cron_expression, task_type, task_config_json, last_run, next_run, enabled, agent_id, platform_config_json)
       VALUES (?, ?, ?, ?, ?, '', '', 1, '', '[]')`,
      [
        OPENBASAKA_NIGHTLY_TASK_ID,
        'Openbasaka 夜间自省',
        OPENBASAKA_NIGHTLY_CRON,
        OPENBASAKA_NIGHTLY_TASK_TYPE,
        JSON.stringify(taskConfig),
      ],
    )
    return OPENBASAKA_NIGHTLY_TASK_ID
  } catch {
    return createScheduledTask({
      name: 'Openbasaka 夜间自省',
      cronExpression: OPENBASAKA_NIGHTLY_CRON,
      taskType: OPENBASAKA_NIGHTLY_TASK_TYPE,
      taskConfig,
      enabled: true,
    })
  }
}

function parseTaxonomyRows(rows: Array<{ project_id: string; taxonomy_json: string; analysis_json: string }>): Record<string, { taxonomy: ProjectTaxonomy; analysis: StructuredAnalysis }> {
  return rows.reduce<Record<string, { taxonomy: ProjectTaxonomy; analysis: StructuredAnalysis }>>((acc, row) => {
    try {
      acc[row.project_id] = {
        taxonomy: JSON.parse(row.taxonomy_json || '{}') as ProjectTaxonomy,
        analysis: JSON.parse(row.analysis_json || '{}') as StructuredAnalysis,
      }
    } catch {
      // Ignore invalid historical taxonomy rows.
    }
    return acc
  }, {})
}

async function buildSelfAuditInputFromRuntime(now: Date): Promise<OpenbasakaSelfAuditInput> {
  const [
    projects,
    taxonomyRows,
    synapses,
    bossState,
    bossMemories,
    bossDecisions,
    operatingEvents,
    counts,
    pendingArchiveCount,
  ] = await Promise.all([
    getAllProjects(),
    dbGetAllTaxonomies(),
    dbGetAllSynapses(),
    loadBossState().catch(() => null),
    dbGetMemories(undefined, 120).catch(() => []),
    dbGetDecisions().catch(() => []),
    dbListOperatingEvents(120).catch(() => []),
    loadOpenbasakaSelfAuditRuntimeCounts(),
    countTable("SELECT COUNT(*) as count FROM archive_candidates WHERE status = 'pending'"),
  ])

  return {
    now,
    projects,
    taxonomies: parseTaxonomyRows(taxonomyRows),
    synapses,
    bossState,
    bossMemoryCount: bossMemories.length,
    decisionCount: bossDecisions.length,
    pendingArchiveCount,
    operatingEvents,
    ...counts,
  }
}

function shouldRunNightlyCatchUp(events: OperatingEventRow[], now: Date): boolean {
  const today = localDateKey(now)
  const hasTodayRun = events.some(event =>
    event.source_id === OPENBASAKA_NIGHTLY_SOURCE &&
    localDateKeyFromIso(event.created_at) === today &&
    event.title.includes('夜巡'),
  )
  if (hasTodayRun) return false
  const hour = now.getHours()
  return hour >= 6
}

async function saveNightlyMaintenanceEvent(runResult: OpenbasakaNightlyMaintenanceRun): Promise<string> {
  const localKey = localDateKeyFromIso(runResult.generatedAt)
  return dbSaveOperatingEvent({
    id: `op_openbasaka_nightly_${localKey}`,
    type: 'agent_action',
    stage: 'review',
    agentId: OPENBASAKA_NIGHTLY_SOURCE,
    title: `夜巡晨报｜${localKey}`,
    status: runResult.status === 'completed' ? 'completed' : 'blocked',
    createdAt: runResult.generatedAt,
    toolRefs: [
      'scheduled_tasks',
      'xiaobai-council',
      'model-route-health',
      'workflow-studio',
      'operating_events',
      'hermes-agent',
    ],
    resultPreview: `${runResult.log.title}｜${runResult.log.summary}｜${runResult.log.obviousCta}`,
    source: { kind: 'agent', sourceId: OPENBASAKA_NIGHTLY_SOURCE, title: 'Openbasaka 夜间自省' },
    confidence: runResult.status === 'completed' ? 0.86 : 0.68,
    entities: ['openbasaka', 'self-audit', 'nightly-maintenance', 'self-repair', 'hermes-agent'],
  })
}

export async function saveOpenbasakaRepairConfirmationReminder(report: OpenbasakaSelfAuditReport): Promise<string | null> {
  const guard = report.repairConfirmationGuard
  if (!guard.enabled || guard.pendingCount <= 0) return null
  const localKey = localDateKeyFromIso(report.generatedAt)
  return dbSaveOperatingEvent({
    id: `op_openbasaka_confirmation_guard_${localKey}`,
    type: 'agent_action',
    stage: 'review',
    agentId: OPENBASAKA_CONFIRMATION_GUARD_SOURCE,
    title: `Boss确认守护｜${localKey}`,
    status: 'blocked',
    createdAt: report.generatedAt,
    toolRefs: ['operating_events', 'workflow-studio', 'scheduled_tasks', 'openbasaka-self-repair'],
    resultPreview: `${guard.plainSummary} 自动处理 ${guard.autoHandledCount} 条；待确认 ${guard.pendingCount} 条。入口：${guard.confirmationLocation}。${guard.autopilotBoundary}`,
    source: { kind: 'agent', sourceId: OPENBASAKA_CONFIRMATION_GUARD_SOURCE, title: '系统自省 Boss确认守护' },
    confidence: 0.82,
    entities: ['openbasaka', 'self-audit', 'self-repair', 'boss-confirmation', 'confirmation-guard'],
  })
}

export async function runOpenbasakaNightlyMaintenance(
  options: OpenbasakaNightlyMaintenanceOptions = {},
): Promise<OpenbasakaNightlyMaintenanceRun> {
  const now = options.now || new Date()
  const recentEvents = await dbListOperatingEvents(120).catch(() => [])
  const catchUp = options.trigger === 'catch-up' || (!options.force && shouldRunNightlyCatchUp(recentEvents, now))
  const trigger = options.trigger || (catchUp ? 'catch-up' : 'cron')
  const routes = await resolveSelfAuditModelRoutes()
  const modelRouteHealth = options.verifyModelRoutes === false
    ? routes.map(route => routeHealthFromRoute(route, 'not-checked', '本轮跳过模型试连。', now))
    : await probeSelfAuditModelRoutes(routes, { now })
  const input = await buildSelfAuditInputFromRuntime(now)
  let report = buildOpenbasakaSelfAuditReport(input)
  report = {
    ...report,
    modelRouteHealth,
    nightlyLog: renderNightlyLogCard({ report: { ...report, modelRouteHealth }, modelRouteHealth, trigger }),
  }

  const judgeCompletion = options.judgeCompletion || createSelfAuditJudgeCompletion(routes)
  report = await runOpenbasakaSelfAuditCouncil(report, {
    runMatchGate: options.runMatchGate,
    judgeCompletion,
  })
  report = {
    ...report,
    modelRouteHealth,
  }

  const savedPlans = await saveOpenbasakaSelfRepairWorkflows(report)
  report = withRepairConfirmationGuard({
    ...report,
    selfRepairPlans: savedPlans,
  })

  let safeRepairRun: OpenbasakaSelfRepairRunResult | undefined
  const autoStartPlan = savedPlans.find(plan => plan.priority === 'P0') || savedPlans.find(plan => plan.priority === 'P1')
  if (options.runSafeRepair !== false && autoStartPlan) {
    safeRepairRun = await runOpenbasakaSelfRepairWorkflow(autoStartPlan)
    report = withRepairConfirmationGuard({
      ...report,
      selfRepairPlans: savedPlans.map(plan => plan.id === autoStartPlan.id ? safeRepairRun!.plan : plan),
    }, safeRepairRun)
  }

  const dreamState = await runOpenbasakaDreamCycle({
    report,
    operatingEvents: recentEvents,
    now,
    persist: true,
  })
  report = withRepairConfirmationGuard({
    ...report,
    dreamState,
  }, safeRepairRun)

  const log = renderNightlyLogCard({
    report,
    modelRouteHealth,
    safeRepairRun,
    trigger,
  })
  report = { ...report, nightlyLog: log }
  const scheduledTaskId = await ensureOpenbasakaNightlyMaintenanceTask(report)
  await saveOpenbasakaSelfAuditReport(report)
  await saveOpenbasakaRepairConfirmationReminder(report)
  const hasDeepModel = report.domains.some(domain => domain.councilAudit.decisionSource === 'deep-model')
  const runResult: OpenbasakaNightlyMaintenanceRun = {
    id: `nightly-run-${now.getTime().toString(36)}`,
    generatedAt: now.toISOString(),
    trigger,
    status: hasDeepModel ? 'completed' : modelRouteHealth.some(item => item.ok) ? 'partial' : 'fallback',
    scheduledTaskId,
    report,
    modelRouteHealth,
    log,
    safeRepairRun,
    safeStartedPlans: safeRepairRun ? [safeRepairRun.plan] : [],
    bossConfirmPlans: report.selfRepairPlans.filter(needsBossConfirmation),
    catchUp,
  }
  await saveNightlyMaintenanceEvent(runResult)
  return runResult
}

export async function maybeRunOpenbasakaNightlyCatchUp(now = new Date()): Promise<OpenbasakaNightlyMaintenanceRun | null> {
  await ensureOpenbasakaNightlyMaintenanceTask()
  const recentEvents = await dbListOperatingEvents(120).catch(() => [])
  if (!shouldRunNightlyCatchUp(recentEvents, now)) return null
  return runOpenbasakaNightlyMaintenance({
    now,
    trigger: 'catch-up',
    force: true,
    verifyModelRoutes: true,
    runSafeRepair: true,
  })
}

export function shouldSaveDailySelfAudit(events: OperatingEventRow[], now = new Date()): boolean {
  if (now.getHours() < 6) return false
  const today = localDateKey(now)
  return !events.some(event =>
    (event.source_id === 'openbasaka-self-audit' || event.source_id === OPENBASAKA_NIGHTLY_SOURCE) &&
    localDateKeyFromIso(event.created_at) === today &&
    (event.title.includes('系统自省') || event.title.includes('夜巡')),
  )
}

export async function saveOpenbasakaSelfAuditReport(report: OpenbasakaSelfAuditReport): Promise<string> {
  const localKey = localDateKeyFromIso(report.generatedAt)
  return dbSaveOperatingEvent({
    id: `op_openbasaka_self_audit_${localKey}`,
    type: 'agent_action',
    stage: 'review',
    agentId: 'openbasaka-self-audit',
    title: `系统自省晨报｜${localKey}`,
    status: 'completed',
    createdAt: report.generatedAt,
    toolRefs: ['vision-alignment', 'daily-brief', 'xiaobai-council', 'workflow-studio', 'operating-events', 'model-route-health', 'openbasaka-dreaming'],
    resultPreview: `${report.nightlyLog.title}｜${report.nightlyLog.summary}｜${report.nightlyLog.obviousCta}｜梦境：${report.dreamState.summary}`,
    source: { kind: 'agent', sourceId: 'openbasaka-self-audit', title: '系统自省' },
    confidence: 0.84,
    entities: ['openbasaka', 'self-audit', 'self-repair', 'xiaobai-council', 'hermes-agent'],
  })
}
