import { generateId } from '../db/schema'
import { dbSaveOperatingEvent, query, run } from '../db/repository'
import type { OperatingLoopStageId } from '../operating-loop'

export type OpenbasakaInputEventKind =
  | 'boss_input'
  | 'module_action'
  | 'cron_run'
  | 'telegram_message'
  | 'workflow_run'
  | 'xiaobai_action'
  | 'self_audit'

export type OpenbasakaRiskLevel = 'low' | 'medium' | 'high'
export type OpenbasakaRuleRunStatus = 'planned' | 'blocked' | 'completed' | 'failed'

export interface OpenbasakaInputEvent {
  id: string
  kind: OpenbasakaInputEventKind
  title: string
  content: string
  actor: 'boss' | 'agent' | 'system' | 'scheduler' | 'telegram'
  moduleId: string
  sourceId: string
  sourceTitle: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface OpenbasakaRuleCondition {
  keywords?: string[]
  kinds?: OpenbasakaInputEventKind[]
  moduleIds?: string[]
  riskSignals?: string[]
}

export interface OpenbasakaRuleActionPlan {
  route: string
  modules: string[]
  context: string[]
  toolPolicy: OpenbasakaToolPolicy
  expectedStage: OperatingLoopStageId
  expectedReceiptTitle: string
}

export interface OpenbasakaRule {
  id: string
  name: string
  enabled: boolean
  scope: 'global' | 'openbasaka' | 'module' | 'automation' | 'gateway'
  triggerKind: string
  condition: OpenbasakaRuleCondition
  actionPlan: OpenbasakaRuleActionPlan
  riskLevel: OpenbasakaRiskLevel
  requiresApproval: boolean
}

export interface OpenbasakaToolPolicy {
  mode: 'read-only' | 'safe-write' | 'approval-required'
  allowedTools: string[]
  blockedTools: string[]
  reason: string
}

export interface OpenbasakaDecisionPlan {
  id: string
  inputEventId: string
  matchedRuleIds: string[]
  route: string
  modules: string[]
  requiredContext: string[]
  toolPolicy: OpenbasakaToolPolicy
  riskLevel: OpenbasakaRiskLevel
  approval: {
    required: boolean
    reason: string
    gate: string
  }
  expectedReceipt: {
    type: 'agent_action'
    stage: OperatingLoopStageId
    title: string
    status: 'queued' | 'blocked' | 'completed'
  }
  learningFeedback: {
    writeOperatingEvent: boolean
    updateRuleRun: boolean
    memoryCandidate: boolean
    summary: string
  }
  createdAt: string
}

export interface OpenbasakaKernelProcessResult {
  inputEvent: OpenbasakaInputEvent
  decisionPlan: OpenbasakaDecisionPlan
  matchedRules: OpenbasakaRule[]
  inputOperatingEventId?: string
  ruleRunId?: string
  receiptOperatingEventId?: string
}

interface RawOpenbasakaRuleRow {
  id: string
  name: string
  enabled: number
  scope: OpenbasakaRule['scope']
  trigger_kind: string
  condition_json: string
  action_plan_json: string
  risk_level: OpenbasakaRiskLevel
  requires_approval: number
}

const HIGH_RISK_SIGNALS = [
  '删除',
  '清空',
  '重置',
  '迁移',
  '改代码',
  '写文件',
  '提交',
  'push',
  '支付',
  '付款',
  '密钥',
  'token',
  'api key',
  '权限',
  '账号',
  '外发',
  '发送',
  'telegram',
  'email',
  'rm -rf',
  'git reset',
]

const MEDIUM_RISK_SIGNALS = ['执行', '运行', '创建', '开启', '定时', '下载', '安装', '同步', '归档', '写入']
const LOW_RISK_SIGNALS = ['查看', '总结', '分析', '诊断', '自省', '审计', '读取', '搜索', '报告', '计划']

function readOnlyPolicy(reason: string): OpenbasakaToolPolicy {
  return {
    mode: 'read-only',
    allowedTools: ['boss-profile.read', 'wiki.query', 'memory.read', 'operating-events.write', 'self-audit.read'],
    blockedTools: ['file.write', 'code.edit', 'external.send', 'credential.read', 'payment', 'delete'],
    reason,
  }
}

function safeWritePolicy(reason: string): OpenbasakaToolPolicy {
  return {
    mode: 'safe-write',
    allowedTools: ['operating-events.write', 'workflow.plan', 'memory.candidate', 'scheduler.plan', 'self-audit.report'],
    blockedTools: ['code.edit', 'delete', 'credential.read', 'payment', 'external.send'],
    reason,
  }
}

function approvalPolicy(reason: string): OpenbasakaToolPolicy {
  return {
    mode: 'approval-required',
    allowedTools: ['context.read', 'workflow.plan', 'risk.explain', 'approval.request'],
    blockedTools: ['file.write', 'code.edit', 'delete', 'credential.read', 'payment', 'external.send', 'permission.change'],
    reason,
  }
}

export const OPENBASAKA_BUILTIN_RULES: OpenbasakaRule[] = [
  {
    id: 'ob_rule_high_risk_guard',
    name: '高风险动作必须 Boss 确认',
    enabled: true,
    scope: 'global',
    triggerKind: 'risk_guard',
    condition: { riskSignals: HIGH_RISK_SIGNALS },
    actionPlan: {
      route: 'approval-gate',
      modules: ['control', 'system-audit'],
      context: ['boss-profile', 'operating-events', 'risk-policy'],
      toolPolicy: approvalPolicy('涉及代码、文件、账号、密钥、外发、付款或删除类动作。'),
      expectedStage: 'review',
      expectedReceiptTitle: 'OpenBasaka 智能内核｜高风险动作已拦截',
    },
    riskLevel: 'high',
    requiresApproval: true,
  },
  {
    id: 'ob_rule_self_audit',
    name: '系统自省进入夜巡/审计链路',
    enabled: true,
    scope: 'openbasaka',
    triggerKind: 'self_audit',
    condition: { kinds: ['self_audit'], keywords: ['自省', '夜巡', '审计', '检查'] },
    actionPlan: {
      route: 'system-self-audit',
      modules: ['system-audit', 'scheduler', 'operating-events'],
      context: ['vision-alignment', 'daily-brief', 'model-route-health', 'operating-events'],
      toolPolicy: safeWritePolicy('系统自省可以写入审计报告和运行收据，但不能静默做高风险修复。'),
      expectedStage: 'review',
      expectedReceiptTitle: 'OpenBasaka 智能内核｜系统自省计划',
    },
    riskLevel: 'low',
    requiresApproval: false,
  },
  {
    id: 'ob_rule_knowledge_capture',
    name: '资料/知识请求进入记忆与 Wiki 编译链路',
    enabled: true,
    scope: 'module',
    triggerKind: 'knowledge',
    condition: { keywords: ['资料', '知识', 'wiki', '记忆', '归档', '学习包', '文件', '视频', '图片'] },
    actionPlan: {
      route: 'knowledge-memory-loop',
      modules: ['knowledge', 'memory', 'xiaobai'],
      context: ['source-registry', 'mempalace', 'wiki-pages', 'query-citations'],
      toolPolicy: safeWritePolicy('知识吸收可以写候选、学习包和索引收据；真实外发和文件破坏仍需确认。'),
      expectedStage: 'compile',
      expectedReceiptTitle: 'OpenBasaka 智能内核｜知识吸收计划',
    },
    riskLevel: 'medium',
    requiresApproval: false,
  },
  {
    id: 'ob_rule_automation',
    name: '周期任务进入 Scheduler 与收据链路',
    enabled: true,
    scope: 'automation',
    triggerKind: 'automation',
    condition: { keywords: ['每天', '每周', '定时', '提醒', '自动', 'cron', 'schedule', 'run now'] },
    actionPlan: {
      route: 'automation-scheduler',
      modules: ['scheduler', 'workflow', 'system-audit'],
      context: ['scheduled-tasks', 'cron-execution-log', 'operating-events'],
      toolPolicy: safeWritePolicy('可以创建或计划低风险自动化；涉及外发、代码和账号动作时转入确认。'),
      expectedStage: 'execute',
      expectedReceiptTitle: 'OpenBasaka 智能内核｜自动化计划',
    },
    riskLevel: 'medium',
    requiresApproval: false,
  },
  {
    id: 'ob_rule_xiaobai',
    name: '小白任务进入翻译/执行工作台',
    enabled: true,
    scope: 'module',
    triggerKind: 'xiaobai',
    condition: { kinds: ['xiaobai_action'], moduleIds: ['xiaobai', 'xiaobai-wanxiang', 'xiaobai-council', 'simplify'] },
    actionPlan: {
      route: 'xiaobai-workbench',
      modules: ['xiaobai', 'workflow', 'teams', 'knowledge'],
      context: ['boss-intent', 'module-state', 'knowledge-context', 'execution-receipts'],
      toolPolicy: safeWritePolicy('小白可以把任务拆解为可执行流程；高风险动作必须停在 Boss 确认卡。'),
      expectedStage: 'understand',
      expectedReceiptTitle: 'OpenBasaka 智能内核｜小白任务计划',
    },
    riskLevel: 'medium',
    requiresApproval: false,
  },
  {
    id: 'ob_rule_observe',
    name: '低风险观察走只读诊断',
    enabled: true,
    scope: 'global',
    triggerKind: 'observe',
    condition: { riskSignals: LOW_RISK_SIGNALS },
    actionPlan: {
      route: 'observe-and-explain',
      modules: ['openbasaka', 'knowledge', 'system-audit'],
      context: ['boss-profile', 'recent-events', 'wiki-context'],
      toolPolicy: readOnlyPolicy('低风险观察只读系统事实并写入可复盘收据。'),
      expectedStage: 'understand',
      expectedReceiptTitle: 'OpenBasaka 智能内核｜只读诊断计划',
    },
    riskLevel: 'low',
    requiresApproval: false,
  },
]

let schemaReady: Promise<void> | null = null

export async function ensureOpenbasakaIntelligenceKernelSchema(): Promise<void> {
  if (schemaReady) return schemaReady
  schemaReady = (async () => {
    await run(`
      CREATE TABLE IF NOT EXISTS openbasaka_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        enabled INTEGER DEFAULT 1,
        scope TEXT NOT NULL DEFAULT 'global',
        trigger_kind TEXT NOT NULL DEFAULT '',
        condition_json TEXT DEFAULT '{}',
        action_plan_json TEXT DEFAULT '{}',
        risk_level TEXT NOT NULL DEFAULT 'medium',
        requires_approval INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      )
    `)
    await run(`
      CREATE TABLE IF NOT EXISTS openbasaka_rule_runs (
        id TEXT PRIMARY KEY,
        rule_id TEXT DEFAULT '',
        input_event_json TEXT DEFAULT '{}',
        decision_plan_json TEXT DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'planned',
        receipt_event_id TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      )
    `)
    await run('CREATE INDEX IF NOT EXISTS idx_openbasaka_rules_scope ON openbasaka_rules(scope, enabled)')
    await run('CREATE INDEX IF NOT EXISTS idx_openbasaka_rule_runs_rule ON openbasaka_rule_runs(rule_id, created_at DESC)')
    await run('CREATE INDEX IF NOT EXISTS idx_openbasaka_rule_runs_status ON openbasaka_rule_runs(status, updated_at DESC)')
    await seedBuiltinRules()
  })()
  return schemaReady
}

async function seedBuiltinRules(): Promise<void> {
  for (const rule of OPENBASAKA_BUILTIN_RULES) {
    await run(
      `INSERT OR IGNORE INTO openbasaka_rules
       (id, name, enabled, scope, trigger_kind, condition_json, action_plan_json, risk_level, requires_approval)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        rule.id,
        rule.name,
        rule.enabled ? 1 : 0,
        rule.scope,
        rule.triggerKind,
        JSON.stringify(rule.condition),
        JSON.stringify(rule.actionPlan),
        rule.riskLevel,
        rule.requiresApproval ? 1 : 0,
      ],
    )
  }
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function rowToRule(row: RawOpenbasakaRuleRow): OpenbasakaRule {
  return {
    id: row.id,
    name: row.name,
    enabled: Boolean(row.enabled),
    scope: row.scope,
    triggerKind: row.trigger_kind,
    condition: parseJson<OpenbasakaRuleCondition>(row.condition_json, {}),
    actionPlan: parseJson<OpenbasakaRuleActionPlan>(row.action_plan_json, OPENBASAKA_BUILTIN_RULES[0].actionPlan),
    riskLevel: row.risk_level || 'medium',
    requiresApproval: Boolean(row.requires_approval),
  }
}

export async function loadOpenbasakaRules(): Promise<OpenbasakaRule[]> {
  await ensureOpenbasakaIntelligenceKernelSchema()
  const rows = await query<RawOpenbasakaRuleRow>('SELECT * FROM openbasaka_rules WHERE enabled = 1 ORDER BY created_at ASC')
  return rows.length ? rows.map(rowToRule) : OPENBASAKA_BUILTIN_RULES
}

function includesAny(text: string, signals: string[] = []): boolean {
  const lower = text.toLowerCase()
  return signals.some((signal) => lower.includes(signal.toLowerCase()))
}

function compactText(value: string, limit = 180): string {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text
}

export function normalizeOpenbasakaInputEvent(input: Partial<OpenbasakaInputEvent> & { kind: OpenbasakaInputEventKind; content: string }): OpenbasakaInputEvent {
  const now = input.createdAt || new Date().toISOString()
  const moduleId = input.moduleId || moduleFromKind(input.kind)
  return {
    id: input.id || `ob_input_${generateId()}`,
    kind: input.kind,
    title: input.title || titleFromKind(input.kind, input.content),
    content: input.content,
    actor: input.actor || actorFromKind(input.kind),
    moduleId,
    sourceId: input.sourceId || moduleId,
    sourceTitle: input.sourceTitle || moduleId,
    metadata: input.metadata || {},
    createdAt: now,
  }
}

function moduleFromKind(kind: OpenbasakaInputEventKind): string {
  if (kind === 'cron_run') return 'scheduler'
  if (kind === 'telegram_message') return 'telegram'
  if (kind === 'workflow_run') return 'workflow'
  if (kind === 'xiaobai_action') return 'xiaobai'
  if (kind === 'self_audit') return 'system-audit'
  return 'openbasaka'
}

function actorFromKind(kind: OpenbasakaInputEventKind): OpenbasakaInputEvent['actor'] {
  if (kind === 'cron_run') return 'scheduler'
  if (kind === 'telegram_message') return 'telegram'
  if (kind === 'module_action' || kind === 'workflow_run' || kind === 'xiaobai_action' || kind === 'self_audit') return 'agent'
  return 'boss'
}

function titleFromKind(kind: OpenbasakaInputEventKind, content: string): string {
  const labels: Record<OpenbasakaInputEventKind, string> = {
    boss_input: 'Boss 输入',
    module_action: '模块动作',
    cron_run: '定时任务',
    telegram_message: 'Telegram 消息',
    workflow_run: '工作流运行',
    xiaobai_action: '小白动作',
    self_audit: '系统自省',
  }
  return `${labels[kind]}｜${compactText(content, 34)}`
}

export function classifyOpenbasakaRisk(event: OpenbasakaInputEvent): OpenbasakaRiskLevel {
  const text = `${event.title}\n${event.content}\n${event.moduleId}\n${JSON.stringify(event.metadata)}`
  if (includesAny(text, HIGH_RISK_SIGNALS)) return 'high'
  if (includesAny(text, MEDIUM_RISK_SIGNALS)) return 'medium'
  if (includesAny(text, LOW_RISK_SIGNALS)) return 'low'
  if (event.kind === 'self_audit') return 'low'
  if (event.kind === 'module_action' || event.kind === 'workflow_run' || event.kind === 'cron_run') return 'medium'
  return 'low'
}

function ruleMatches(rule: OpenbasakaRule, event: OpenbasakaInputEvent, risk: OpenbasakaRiskLevel): boolean {
  const condition = rule.condition
  const text = `${event.title}\n${event.content}\n${event.moduleId}`.toLowerCase()
  if (condition.kinds?.length && !condition.kinds.includes(event.kind)) return false
  if (condition.moduleIds?.length && !condition.moduleIds.includes(event.moduleId)) return false
  if (condition.riskSignals?.length && includesAny(text, condition.riskSignals)) return true
  if (condition.keywords?.length && includesAny(text, condition.keywords)) return true
  if (rule.id === 'ob_rule_high_risk_guard' && risk === 'high') return true
  return Boolean(condition.kinds?.includes(event.kind) || condition.moduleIds?.includes(event.moduleId))
}

export function matchOpenbasakaRules(event: OpenbasakaInputEvent, rules: OpenbasakaRule[] = OPENBASAKA_BUILTIN_RULES): OpenbasakaRule[] {
  const risk = classifyOpenbasakaRisk(event)
  const matches = rules.filter((rule) => rule.enabled && ruleMatches(rule, event, risk))
  if (matches.some((rule) => rule.id === 'ob_rule_high_risk_guard')) {
    return matches.filter((rule) => rule.id === 'ob_rule_high_risk_guard')
  }
  return matches.length ? matches : [OPENBASAKA_BUILTIN_RULES.find((rule) => rule.id === 'ob_rule_observe') || OPENBASAKA_BUILTIN_RULES[0]]
}

export function buildOpenbasakaDecisionPlan(event: OpenbasakaInputEvent, matchedRules: OpenbasakaRule[]): OpenbasakaDecisionPlan {
  const risk = classifyOpenbasakaRisk(event)
  const primaryRule = matchedRules.find((rule) => rule.riskLevel === risk) || matchedRules[0]
  const approvalRequired = risk === 'high' || primaryRule.requiresApproval
  const actionPlan = approvalRequired ? OPENBASAKA_BUILTIN_RULES[0].actionPlan : primaryRule.actionPlan
  const route = approvalRequired ? 'approval-gate' : actionPlan.route
  const modules = Array.from(new Set([event.moduleId, ...actionPlan.modules].filter(Boolean)))
  const requiredContext = Array.from(new Set(['boss-profile', 'operating-events', ...actionPlan.context]))
  const status = approvalRequired ? 'blocked' : 'completed'

  return {
    id: `ob_plan_${generateId()}`,
    inputEventId: event.id,
    matchedRuleIds: matchedRules.map((rule) => rule.id),
    route,
    modules,
    requiredContext,
    toolPolicy: approvalRequired ? approvalPolicy('命中高风险守护规则，必须先给 Boss 明确确认。') : actionPlan.toolPolicy,
    riskLevel: risk,
    approval: {
      required: approvalRequired,
      reason: approvalRequired ? '涉及高风险动作或规则明确要求确认。' : '低/中风险规划可继续，但仍要留下证据链。',
      gate: approvalRequired ? 'boss-confirmation-required' : 'safe-autopilot',
    },
    expectedReceipt: {
      type: 'agent_action',
      stage: approvalRequired ? 'review' : actionPlan.expectedStage,
      title: actionPlan.expectedReceiptTitle,
      status,
    },
    learningFeedback: {
      writeOperatingEvent: true,
      updateRuleRun: true,
      memoryCandidate: risk !== 'low',
      summary: approvalRequired
        ? '已阻断高风险动作，等待 Boss 确认后才允许进入执行。'
        : '已形成可复盘决策计划，后续模块动作必须回写收据。',
    },
    createdAt: new Date().toISOString(),
  }
}

export async function planOpenbasakaInputEvent(
  input: Partial<OpenbasakaInputEvent> & { kind: OpenbasakaInputEventKind; content: string },
  rules: OpenbasakaRule[] = OPENBASAKA_BUILTIN_RULES,
): Promise<OpenbasakaKernelProcessResult> {
  const inputEvent = normalizeOpenbasakaInputEvent(input)
  const matchedRules = matchOpenbasakaRules(inputEvent, rules)
  const decisionPlan = buildOpenbasakaDecisionPlan(inputEvent, matchedRules)
  return { inputEvent, decisionPlan, matchedRules }
}

export async function processOpenbasakaInputEvent(
  input: Partial<OpenbasakaInputEvent> & { kind: OpenbasakaInputEventKind; content: string },
  options: { persistInputEvent?: boolean; persistReceipt?: boolean } = {},
): Promise<OpenbasakaKernelProcessResult> {
  const rules = await loadOpenbasakaRules()
  const result = await planOpenbasakaInputEvent(input, rules)
  const persistInputEvent = options.persistInputEvent !== false
  const persistReceipt = options.persistReceipt !== false

  let inputOperatingEventId: string | undefined
  if (persistInputEvent) {
    inputOperatingEventId = await dbSaveOperatingEvent({
      id: `op_${result.inputEvent.id}_capture`,
      type: 'input_event',
      stage: 'capture',
      inputKind: inputKindForOperatingEvent(result.inputEvent.kind),
      title: result.inputEvent.title,
      contentPreview: compactText(result.inputEvent.content, 260),
      source: { kind: 'agent', sourceId: result.inputEvent.sourceId, title: result.inputEvent.sourceTitle },
      confidence: 0.82,
      entities: ['openbasaka-intelligence-kernel', result.inputEvent.kind, result.inputEvent.moduleId],
      createdAt: result.inputEvent.createdAt,
    })
  }

  const ruleRunId = `ob_rule_run_${generateId()}`
  await run(
    `INSERT OR REPLACE INTO openbasaka_rule_runs
     (id, rule_id, input_event_json, decision_plan_json, status, receipt_event_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ruleRunId,
      result.decisionPlan.matchedRuleIds[0] || '',
      JSON.stringify(result.inputEvent),
      JSON.stringify(result.decisionPlan),
      'planned',
      '',
      result.decisionPlan.createdAt,
      result.decisionPlan.createdAt,
    ],
  )

  let receiptOperatingEventId: string | undefined
  if (persistReceipt) {
    receiptOperatingEventId = await dbSaveOperatingEvent({
      id: `op_${result.decisionPlan.id}_receipt`,
      type: 'agent_action',
      stage: result.decisionPlan.expectedReceipt.stage,
      agentId: 'openbasaka-intelligence-kernel',
      title: result.decisionPlan.expectedReceipt.title,
      status: result.decisionPlan.expectedReceipt.status,
      resultPreview: `${result.decisionPlan.route}｜${result.decisionPlan.riskLevel}｜${result.decisionPlan.learningFeedback.summary}`,
      source: { kind: 'agent', sourceId: result.inputEvent.sourceId, title: result.inputEvent.sourceTitle },
      toolRefs: ['openbasaka_rules', 'openbasaka_rule_runs', 'operating_events', ...result.decisionPlan.modules],
      confidence: result.decisionPlan.approval.required ? 0.72 : 0.86,
      entities: ['openbasaka', 'hermes-native-kernel', result.decisionPlan.route, ...result.decisionPlan.modules],
      createdAt: result.decisionPlan.createdAt,
    })
  }

  await run(
    `UPDATE openbasaka_rule_runs
     SET status = ?, receipt_event_id = ?, updated_at = datetime('now','localtime')
     WHERE id = ?`,
    [
      result.decisionPlan.approval.required ? 'blocked' : 'completed',
      receiptOperatingEventId || '',
      ruleRunId,
    ],
  )

  return {
    ...result,
    inputOperatingEventId,
    ruleRunId,
    receiptOperatingEventId,
  }
}

function inputKindForOperatingEvent(kind: OpenbasakaInputEventKind) {
  if (kind === 'boss_input' || kind === 'telegram_message') return 'conversation' as const
  if (kind === 'module_action' || kind === 'workflow_run' || kind === 'xiaobai_action' || kind === 'self_audit') return 'agent_result' as const
  return 'manual_note' as const
}

export async function renderOpenbasakaKernelPrompt(input: {
  content: string
  kind?: OpenbasakaInputEventKind
  moduleId?: string
}): Promise<string> {
  const { inputEvent, decisionPlan } = await planOpenbasakaInputEvent({
    kind: input.kind || 'boss_input',
    content: input.content,
    moduleId: input.moduleId || 'openbasaka',
    title: '当前对话意图',
  })

  return `<openbasaka-intelligence-kernel>
mode: Hermes-native TS/Electron kernel, not Python hermes-agent sidecar.
input_kind: ${inputEvent.kind}
route: ${decisionPlan.route}
risk: ${decisionPlan.riskLevel}
approval_gate: ${decisionPlan.approval.gate}
modules: ${decisionPlan.modules.join(', ')}
context_required: ${decisionPlan.requiredContext.join(', ')}
tool_policy: ${decisionPlan.toolPolicy.mode} — ${decisionPlan.toolPolicy.reason}
receipt_rule: every module action must write operating_events + openbasaka_rule_runs evidence.
hard_boundary: code/data/deletion/credentials/external-send/payment/permission actions require Boss confirmation.
</openbasaka-intelligence-kernel>`
}
