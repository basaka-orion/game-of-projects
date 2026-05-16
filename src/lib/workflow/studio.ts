import { createScheduledTask, updateScheduledTask, type PlatformTarget } from '../automation/scheduler'
import { query, run } from '../db/repository'
import { generateId } from '../db/schema'
import { approveTeamAction, executeTeamAction, isExecutableTeamAction } from '../teams/action-broker'
import { runTeamSession } from '../teams/engine'
import { createTeam, createTeamActions, getTeam, listTeamActions, listTeams, updateTeam } from '../teams/store'
import type { TeamAction, TeamMessage, TeamWorkflowType } from '../teams/types'
import { buildUiMuseumPrdContext } from '../ui-museum/context'
import { buildWorkflowDeliveryActions, shouldMaterializeWorkflowDelivery } from './delivery'
import { buildWorkflowTestInput, isStaleWorkflowTestInput } from './test-input'

export type WorkflowStudioTarget = 'scheduler' | 'teams' | 'knowledge' | 'xiaobai'
export type WorkflowStudioStatus = 'draft' | 'tested' | 'published'
export type WorkflowStudioTestStatus = 'idle' | 'success' | 'error'

export interface WorkflowStudioItem {
  id: string
  name: string
  goal: string
  workflowType: TeamWorkflowType
  teamId: string
  promptTemplate: string
  steps: string[]
  targetConsumers: WorkflowStudioTarget[]
  status: WorkflowStudioStatus
  lastTestStatus: WorkflowStudioTestStatus
  lastTestInput: string
  lastTestOutput: string
  lastOptimizationFeedback: string
  lastOptimizationOutput: string
  publishedTargets: WorkflowStudioTarget[]
  publishConfigs: WorkflowPublishOptions
  createdAt: string
  updatedAt: string
}

export interface WorkflowStudioDraft {
  id?: string
  name: string
  goal: string
  workflowType: TeamWorkflowType
  teamId: string
  promptTemplate: string
  steps: string[]
  targetConsumers: WorkflowStudioTarget[]
}

export interface WorkflowStudioTestResult {
  success: boolean
  output: string
  sessionId?: string
  actionRun?: WorkflowActionRunSummary
}

export interface WorkflowActionRunSummary {
  sessionId: string
  total: number
  executed: number
  completed: number
  failed: number
  blocked: number
  actions: WorkflowActionRunItem[]
}

export interface WorkflowActionRunItem {
  id: string
  title: string
  toolId: string
  risk: string
  status: string
  requiresApproval: boolean
  error?: string
}

export interface WorkflowSchedulerPublishConfig {
  name: string
  cronExpression: string
  prompt: string
  pushAgentId?: string
  platformTargets?: PlatformTarget[]
  enabled?: boolean
}

export interface WorkflowTeamsPublishConfig {
  entryName: string
  teamId: string
  defaultTask: string
  artifactLabel: string
}

export interface WorkflowKnowledgePublishConfig {
  collectionName: string
  tags: string[]
  archiveMode: 'candidate' | 'auto'
  sourcePolicy: string
}

export interface WorkflowXiaobaiPublishConfig {
  audience: string
  outputStyle: string
  maxSteps: number
  firstAction: string
}

export interface WorkflowPublishOptions {
  scheduler?: WorkflowSchedulerPublishConfig
  teams?: WorkflowTeamsPublishConfig
  knowledge?: WorkflowKnowledgePublishConfig
  xiaobai?: WorkflowXiaobaiPublishConfig
}

const DEFAULT_STEPS = ['读懂 Boss 的输入', '按角色分工分析', '合成最终成果', '给出可执行下一步']
const DEFAULT_PROMPT_TEMPLATE = generatePromptTemplateFromWorkflow({
  name: '新的工作流',
  goal: '把一个重复出现的问题，稳定产出可保存、可复用的结果。',
  workflowType: 'custom',
  steps: DEFAULT_STEPS,
})
const MAC_APP_DEVELOPMENT_TEAM_NAME = 'Mac App 大师开发群策'
const MAC_APP_DEVELOPMENT_WORKFLOW_ID = 'wfs_mac_app_lumadesk_master'
let macAppDevelopmentTeamPromise: Promise<string> | null = null
let macAppDevelopmentWorkflowPromise: Promise<string> | null = null

const MAC_APP_DEVELOPMENT_STEPS = [
  '把 Boss 的一句 Mac App 想法压缩成一句清晰产品承诺，并明确不做什么',
  '拆出目标用户、真实使用场景、痛点强度、使用频率和第一天留存理由',
  '设计小白 3 分钟能跑通的核心闭环：打开、授权、执行、看到成果、撤回',
  '由视觉大师定义独有 UI 气质、主界面信息层级、按钮状态、动效节奏和截图验收标准',
  '设计 macOS 交互：菜单栏、主窗口、设置、通知、权限引导、状态栏反馈和失败态',
  '规划 SwiftUI/AppKit 技术架构：模块、数据流、本地存储、系统权限、可替换 AI 接口',
  '列出电脑操作能力：文件夹监听、截图/OCR、壁纸/通知/快捷键/打开文件，并逐项标注权限',
  '输出全技术栈落地路径：目录结构、关键类、核心 API、错误处理、日志与回滚',
  '生成可执行开发任务清单：P0/P1/P2、验收标准、测试命令和手动体验检查点',
  '让魔鬼代言人做风险审查：隐私、性能、误操作、模型成本、审核合规和可维护性',
  '合成一份大师级 PRD：产品、交互、视觉、技术、数据、权限、测试、发布与迭代',
  '如果 Boss 不满意，根据反馈给出 v2 修改版：保留、删除、增强、重新试跑',
]

const MAC_APP_DEVELOPMENT_GOAL = '把一个有趣但可落地的 Mac App 想法，推进成一份大师级 PRD、视觉交互规范、SwiftUI/AppKit 技术方案、电脑操作清单、测试计划和下一步开发任务。'
const MAC_APP_DEVELOPMENT_TEST_INPUT = `请用这个工作流试跑当前任务：围绕当前工作流目标完整执行一次。

硬性要求：
1. 只围绕当前工作流名称、目标和步骤执行。
2. 不要引用历史示例、旧项目名或旧缓存任务。
3. 如果 Boss 想要真实落地，请拆出电脑动作、文件产物、验证命令和验收证据。`

function workflowTypeLabel(type: TeamWorkflowType): string {
  const labels: Record<TeamWorkflowType, string> = {
    prd: 'PRD 设计',
    research: '深度调研',
    build: '产品落地',
    'xcode-mac-app': 'Mac App 自动落地',
    'visual-review': '视觉审查',
    automation: '自动化工作流',
    custom: '自定义协作',
  }
  return labels[type] || '自定义协作'
}

export function generatePromptTemplateFromWorkflow(params: {
  name: string
  goal: string
  workflowType: TeamWorkflowType
  steps: string[]
}): string {
  const steps = normalizeSteps(params.steps.length > 0 ? params.steps : DEFAULT_STEPS)
  const stepText = steps.map((step, index) => `${index + 1}. ${step}`).join('\n')
  return `你正在执行 Openbasaka 工作流《${params.name || '未命名工作流'}》。

## 工作流类型
${workflowTypeLabel(params.workflowType)}

## 稳定目标
{{goal}}

## Boss 本次输入
{{input}}

## 必须按顺序推进的步骤
{{steps}}

## 执行规则
1. 先复述你理解的目标，但不要啰嗦。
2. 严格按步骤推进；如果某一步信息不足，先提出合理假设并继续。
3. 每个步骤都要产出可检查的中间结果，不要只说观点。
4. 最终成果必须能保存、复用、归档，并适合后续植入定时、群策、知识＋大佬或小白模块。
5. 如果这是 App / 产品落地类任务（包含 iOS、macOS、Web 或桌面工具），最终必须包含：产品定位、用户路径、界面结构、视觉语言、技术栈、数据结构、权限、测试方案、风险清单、开发任务。
6. 如果 Boss 表示不满意，必须给出 v2 迭代方向：保留什么、删除什么、增强什么、下一次试跑怎么改。

## 当前步骤明细
${stepText}

请直接开始执行，最后输出一份结构清晰的成果文档。`.trim()
}

async function ensureWorkflowStudioSchema(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS workflow_studio_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      goal TEXT DEFAULT '',
      workflow_type TEXT DEFAULT 'custom',
      team_id TEXT DEFAULT '',
      prompt_template TEXT DEFAULT '',
      steps_json TEXT DEFAULT '[]',
      target_consumers_json TEXT DEFAULT '[]',
      status TEXT DEFAULT 'draft',
      last_test_status TEXT DEFAULT 'idle',
      last_test_input TEXT DEFAULT '',
      last_test_output TEXT DEFAULT '',
      last_optimization_feedback TEXT DEFAULT '',
      last_optimization_output TEXT DEFAULT '',
      published_targets_json TEXT DEFAULT '[]',
      publish_configs_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `)
  await run('ALTER TABLE workflow_studio_items ADD COLUMN last_optimization_feedback TEXT DEFAULT ""').catch(() => undefined)
  await run('ALTER TABLE workflow_studio_items ADD COLUMN last_optimization_output TEXT DEFAULT ""').catch(() => undefined)
  await run('ALTER TABLE workflow_studio_items ADD COLUMN publish_configs_json TEXT DEFAULT "{}"').catch(() => undefined)
}

function parseStringArray(raw: string, fallback: string[] = []): string[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : fallback
  } catch {
    return fallback
  }
}

function parseTargets(raw: string): WorkflowStudioTarget[] {
  const allowed = new Set<WorkflowStudioTarget>(['scheduler', 'teams', 'knowledge', 'xiaobai'])
  return parseStringArray(raw).filter((target): target is WorkflowStudioTarget => allowed.has(target as WorkflowStudioTarget))
}

function parsePublishConfigs(raw: string): WorkflowPublishOptions {
  try {
    const parsed = JSON.parse(raw || '{}') as WorkflowPublishOptions
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function normalizeSteps(steps: string[]): string[] {
  return steps.map((step) => step.trim()).filter(Boolean).slice(0, 12)
}

function rowToItem(row: Record<string, unknown>): WorkflowStudioItem {
  return {
    id: String(row.id || ''),
    name: String(row.name || ''),
    goal: String(row.goal || ''),
    workflowType: (String(row.workflow_type || 'custom') as TeamWorkflowType) || 'custom',
    teamId: String(row.team_id || ''),
    promptTemplate: String(row.prompt_template || DEFAULT_PROMPT_TEMPLATE),
    steps: parseStringArray(String(row.steps_json || '[]'), DEFAULT_STEPS),
    targetConsumers: parseTargets(String(row.target_consumers_json || '[]')),
    status: (String(row.status || 'draft') as WorkflowStudioStatus) || 'draft',
    lastTestStatus: (String(row.last_test_status || 'idle') as WorkflowStudioTestStatus) || 'idle',
    lastTestInput: String(row.last_test_input || ''),
    lastTestOutput: String(row.last_test_output || ''),
    lastOptimizationFeedback: String(row.last_optimization_feedback || ''),
    lastOptimizationOutput: String(row.last_optimization_output || ''),
    publishedTargets: parseTargets(String(row.published_targets_json || '[]')),
    publishConfigs: parsePublishConfigs(String(row.publish_configs_json || '{}')),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  }
}

export function getDefaultWorkflowTemplate(): WorkflowStudioDraft {
  return {
    name: '新的工作流',
    goal: '把一个重复出现的问题，稳定产出可保存、可复用的结果。',
    workflowType: 'custom',
    teamId: '',
    promptTemplate: DEFAULT_PROMPT_TEMPLATE,
    steps: DEFAULT_STEPS,
    targetConsumers: ['scheduler'],
  }
}

export async function listWorkflowStudioItems(): Promise<WorkflowStudioItem[]> {
  await ensureWorkflowStudioSchema()
  const rows = await query<Record<string, unknown>>('SELECT * FROM workflow_studio_items ORDER BY updated_at DESC, created_at DESC')
  return rows.map(rowToItem)
}

export async function getWorkflowStudioItem(id: string): Promise<WorkflowStudioItem | null> {
  await ensureWorkflowStudioSchema()
  const rows = await query<Record<string, unknown>>('SELECT * FROM workflow_studio_items WHERE id = ?', [id])
  return rows[0] ? rowToItem(rows[0]) : null
}

export async function saveWorkflowStudioItem(draft: WorkflowStudioDraft): Promise<string> {
  await ensureWorkflowStudioSchema()
  const id = draft.id || `wfs_${generateId()}`
  const existing = draft.id ? await getWorkflowStudioItem(draft.id) : null
  const status: WorkflowStudioStatus = existing?.status || 'draft'
  const lastTestStatus: WorkflowStudioTestStatus = existing?.lastTestStatus || 'idle'

  if (existing) {
    await run(
      `UPDATE workflow_studio_items
       SET name = ?, goal = ?, workflow_type = ?, team_id = ?, prompt_template = ?, steps_json = ?,
           target_consumers_json = ?, status = ?, last_test_status = ?, updated_at = datetime('now','localtime')
       WHERE id = ?`,
      [
        draft.name,
        draft.goal,
        draft.workflowType,
        draft.teamId,
        draft.promptTemplate || DEFAULT_PROMPT_TEMPLATE,
        JSON.stringify(normalizeSteps(draft.steps)),
        JSON.stringify(draft.targetConsumers),
        status === 'published' ? 'tested' : status,
        lastTestStatus === 'success' ? 'idle' : lastTestStatus,
        id,
      ],
    )
  } else {
    await run(
      `INSERT INTO workflow_studio_items
       (id, name, goal, workflow_type, team_id, prompt_template, steps_json, target_consumers_json, status, last_test_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'idle')`,
      [
        id,
        draft.name,
        draft.goal,
        draft.workflowType,
        draft.teamId,
        draft.promptTemplate || DEFAULT_PROMPT_TEMPLATE,
        JSON.stringify(normalizeSteps(draft.steps)),
        JSON.stringify(draft.targetConsumers),
      ],
    )
  }
  return id
}

function renderPrompt(item: WorkflowStudioItem, input: string): string {
  const steps = item.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')
  return (item.promptTemplate || DEFAULT_PROMPT_TEMPLATE)
    .split('{{goal}}').join(item.goal)
    .split('{{input}}').join(input)
    .split('{{steps}}').join(steps)
    .trim()
}

function resolveEffectiveWorkflowInput(item: WorkflowStudioItem, input: string): string {
  const candidate = input.trim()
  if (!candidate || isStaleWorkflowTestInput(item, candidate)) return buildWorkflowTestInput(item)
  return candidate
}

function appendUiMuseumContext(input: string, contextSeed: string): string {
  const uiStyleContext = buildUiMuseumPrdContext(contextSeed)
  if (input.includes('## UI风格馆自动视觉输入')) return input
  return `${input.trim()}\n\n${uiStyleContext.promptFragment}`.trim()
}

function buildWorkflowRunTopic(item: WorkflowStudioItem, input: string): string {
  const visualInput = appendUiMuseumContext(input, `${item.name}\n${item.goal}\n${input}`)
  const steps = item.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')
  return [
    `工作流：${item.name}`,
    `工作流类型：${workflowTypeLabel(item.workflowType)}`,
    '',
    '## 稳定目标',
    item.goal,
    '',
    '## Boss 本次输入',
    visualInput,
    '',
    '## 必须按顺序推进的步骤',
    steps,
    '',
    '## 完整执行模板',
    renderPrompt(item, visualInput),
  ].join('\n').trim()
}

async function buildTeamActionSummary(sessionId: string): Promise<string> {
  const actions = await query<{
    title: string
    tool_id: string
    risk: string
    requires_approval: number
    status: string
  }>(
    'SELECT title, tool_id, risk, requires_approval, status FROM team_actions WHERE session_id = ? ORDER BY created_at ASC LIMIT 8',
    [sessionId],
  ).catch(() => [])

  if (actions.length === 0) return ''
  return [
    '',
    '---',
    '',
    '## 电脑动作队列',
    `群策会话：${sessionId}`,
    ...actions.map((action, index) => {
      const gate = action.requires_approval ? '需确认' : '可自动'
      return `${index + 1}. ${action.title}｜工具：${action.tool_id}｜风险：${action.risk}｜${gate}｜状态：${action.status}`
    }),
  ].join('\n')
}

function pushWorkflowActionMessage(
  content: string,
  onProgress?: (message: TeamMessage) => void,
  kind: TeamMessage['kind'] = 'progress',
): void {
  onProgress?.({
    id: generateId(),
    agentId: 'workflow-action-runner',
    agentName: '电脑执行层',
    role: 'system',
    content,
    timestamp: Date.now(),
    kind,
  })
}

async function ensureWorkflowDeliveryActions(params: {
  item: WorkflowStudioItem
  sessionId: string
  input: string
  artifactContent: string
  onProgress?: (message: TeamMessage) => void
}): Promise<void> {
  if (!shouldMaterializeWorkflowDelivery(params.item, params.input)) return
  const existing = await listTeamActions({ sessionId: params.sessionId }).catch(() => [])
  const alreadyHasDelivery = existing.some((action) => action.ownerAgentId === 'workflow-delivery-runner')
  const alreadyHasRunnableCode = existing.some((action) => {
    const rawPath = typeof action.params?.path === 'string' ? action.params.path : ''
    const rawCommand = typeof action.params?.command === 'string' ? action.params.command : ''
    return /prototype\/index\.html|package\.json|\.swift|xcodebuild|npm\s+run|node\s+.*verify/i.test(`${rawPath}\n${rawCommand}`)
  })
  if (alreadyHasDelivery || alreadyHasRunnableCode) return

  const deliveryActions = buildWorkflowDeliveryActions({
    item: params.item,
    sessionId: params.sessionId,
    input: params.input,
    artifactContent: params.artifactContent,
  })
  await createTeamActions(deliveryActions)
  pushWorkflowActionMessage(
    `交付执行循环已接管：本轮是产品/App 落地任务，已追加 ${deliveryActions.length} 个动作，用于生成可运行原型、源码骨架、验证脚本并打开本地成果。`,
    params.onProgress,
  )
}

function actionParamsText(action: TeamAction): string {
  try {
    return JSON.stringify(action.params || {}).toLowerCase()
  } catch {
    return ''
  }
}

function needsBossConfirmation(action: TeamAction): boolean {
  if (!action.requiresApproval) return false
  if (action.toolId === 'manual_review') return true
  if (action.risk === 'high') return true
  if (action.toolId === 'desktop_control') return true
  return /\bsudo\b|password|passwd|密码|keychain|delete|remove|rm\s+-rf|killall/i.test(actionParamsText(action))
}

function isAutopilotAction(action: TeamAction): boolean {
  return (
    isExecutableTeamAction(action) &&
    (action.status === 'proposed' || action.status === 'approved') &&
    !needsBossConfirmation(action)
  )
}

function toWorkflowActionRunItem(action: TeamAction): WorkflowActionRunItem {
  return {
    id: action.id,
    title: action.title,
    toolId: action.toolId,
    risk: action.risk,
    status: action.status,
    requiresApproval: action.requiresApproval,
    error: action.result?.error,
  }
}

async function runWorkflowAutopilotActions(
  sessionId: string,
  onProgress?: (message: TeamMessage) => void,
): Promise<WorkflowActionRunSummary> {
  let actions = await listTeamActions({ sessionId }).catch(() => [])
  const initialTotal = actions.length
  if (initialTotal === 0) {
    pushWorkflowActionMessage('本轮没有生成电脑动作队列：只产出了文档成果，没有需要电脑执行的动作。', onProgress)
    return { sessionId, total: 0, executed: 0, completed: 0, failed: 0, blocked: 0, actions: [] }
  }

  pushWorkflowActionMessage(
    `发现 ${initialTotal} 个电脑动作。现在自动执行低/中风险动作；高风险、桌面控制、删除、密码、密钥相关动作会留给 Boss 确认。`,
    onProgress,
  )

  let executedCount = 0
  for (let index = 0; index < 22; index += 1) {
    const next = actions.find(isAutopilotAction)
    if (!next) break

    pushWorkflowActionMessage(
      `正在执行电脑动作 ${executedCount + 1}：${next.title}（${next.toolId} / ${next.risk}）`,
      onProgress,
    )
    const approved = next.status === 'proposed' ? await approveTeamAction(next) : next
    const executed = await executeTeamAction(approved)
    executedCount += 1
    pushWorkflowActionMessage(
      `${executed.status === 'completed' ? '已完成' : '执行失败'}：${executed.title}${executed.result?.error ? `。错误：${executed.result.error}` : ''}`,
      onProgress,
      executed.status === 'failed' ? 'error' : 'progress',
    )
    actions = await listTeamActions({ sessionId }).catch(() => actions)
    if (executed.status === 'failed') break
  }

  const completed = actions.filter((action) => action.status === 'completed').length
  const failed = actions.filter((action) => action.status === 'failed').length
  const blocked = actions.filter(
    (action) => (action.status === 'proposed' || action.status === 'approved') && !isAutopilotAction(action),
  ).length

  pushWorkflowActionMessage(
    `电脑执行层收束：已自动执行 ${executedCount} 步，完成 ${completed} 步，失败 ${failed} 步，留给 Boss 确认 ${blocked} 步。`,
    onProgress,
    failed > 0 ? 'error' : 'progress',
  )

  return {
    sessionId,
    total: actions.length,
    executed: executedCount,
    completed,
    failed,
    blocked,
    actions: actions.map(toWorkflowActionRunItem),
  }
}

function buildActionRunSummary(summary: WorkflowActionRunSummary): string {
  if (summary.total === 0) return ''
  return [
    '',
    '---',
    '',
    '## 试跑自动执行回执',
    `会话：${summary.sessionId}`,
    `动作总数：${summary.total}`,
    `自动执行：${summary.executed}`,
    `已完成：${summary.completed}`,
    `失败：${summary.failed}`,
    `需 Boss 确认：${summary.blocked}`,
    '',
    ...summary.actions.map((action, index) => {
      const gate = action.requiresApproval ? '需确认' : '可自动'
      const error = action.error ? `｜错误：${action.error}` : ''
      return `${index + 1}. ${action.title}｜${action.toolId}｜${action.risk}｜${gate}｜${action.status}${error}`
    }),
  ].join('\n')
}

export async function testWorkflowStudioItem(
  id: string,
  input: string,
  onProgress?: (message: TeamMessage) => void,
): Promise<WorkflowStudioTestResult> {
  const item = await getWorkflowStudioItem(id)
  if (!item) throw new Error('workflow_not_found')
  if (!item.teamId) throw new Error('请先选择一个群策团队作为试跑执行者。')
  const team = await getTeam(item.teamId)
  if (!team) throw new Error('找不到这个群策团队。')

  const effectiveInput = resolveEffectiveWorkflowInput(item, input || item.goal)
  const prompt = buildWorkflowRunTopic(item, effectiveInput)
  try {
    const session = await runTeamSession(
      { ...team, config: { ...team.config, workflowType: item.workflowType } },
      prompt,
      onProgress,
    )
    const artifact = session.messages.filter((message) => message.kind === 'artifact').slice(-1)[0]
    await ensureWorkflowDeliveryActions({
      item,
      sessionId: session.id,
      input: effectiveInput,
      artifactContent: artifact?.content || session.summary || '',
      onProgress,
    })
    const actionRun = await runWorkflowAutopilotActions(session.id, onProgress)
    const actionSummary = await buildTeamActionSummary(session.id)
    const output = `${artifact?.content || session.summary || '试跑完成，但没有可读成果。'}${buildActionRunSummary(actionRun)}${actionSummary}`
    await run(
      `UPDATE workflow_studio_items
       SET status = 'tested', last_test_status = 'success', last_test_input = ?, last_test_output = ?,
           updated_at = datetime('now','localtime')
      WHERE id = ?`,
      [effectiveInput, output, id],
    )
    return { success: true, output, sessionId: session.id, actionRun }
  } catch (err) {
    const output = err instanceof Error ? err.message : String(err)
    await run(
      `UPDATE workflow_studio_items
       SET last_test_status = 'error', last_test_input = ?, last_test_output = ?,
           updated_at = datetime('now','localtime')
      WHERE id = ?`,
      [effectiveInput, output, id],
    )
    return { success: false, output }
  }
}

export async function optimizeWorkflowStudioItem(id: string, feedback: string): Promise<WorkflowStudioTestResult> {
  const item = await getWorkflowStudioItem(id)
  if (!item) throw new Error('workflow_not_found')
  if (!item.teamId) throw new Error('请先选择一个群策团队作为优化执行者。')
  const team = await getTeam(item.teamId)
  if (!team) throw new Error('找不到这个群策团队。')

  const prompt = [
    `请作为「${item.name}」的群策优化团队，审查并改进这个工作流。`,
    '',
    '## 当前目标',
    item.goal,
    '',
    '## 当前步骤',
    item.steps.map((step, index) => `${index + 1}. ${step}`).join('\n'),
    '',
    '## 当前提示词模板',
    item.promptTemplate,
    '',
    '## Boss 的不满意或优化要求',
    feedback || '请从小白可用性、结果质量、视觉交互、技术可落地性、定时/群策/知识复用度五个方向做一次严格优化。',
    '',
    '## 输出要求',
    '1. 先指出当前工作流最影响效果的 3 个问题。',
    '2. 给出 v2 工作流步骤，必须比当前更清晰、更可测试。',
    '3. 给出 v2 提示词模板的修改原则，不要只说“优化”。',
    '4. 给出下一次试跑输入建议和验收标准。',
  ].join('\n')

  try {
    const session = await runTeamSession(
      { ...team, config: { ...team.config, workflowType: item.workflowType } },
      prompt,
    )
    const artifact = session.messages.filter((message) => message.kind === 'artifact').slice(-1)[0]
    const output = artifact?.content || session.summary || '优化完成，但没有可读成果。'
    await run(
      `UPDATE workflow_studio_items
       SET last_optimization_feedback = ?, last_optimization_output = ?, updated_at = datetime('now','localtime')
       WHERE id = ?`,
      [feedback, output, id],
    )
    return { success: true, output }
  } catch (err) {
    const output = err instanceof Error ? err.message : String(err)
    await run(
      `UPDATE workflow_studio_items
       SET last_optimization_feedback = ?, last_optimization_output = ?, updated_at = datetime('now','localtime')
       WHERE id = ?`,
      [feedback, output, id],
    )
    return { success: false, output }
  }
}

function buildScheduledTaskConfig(item: WorkflowStudioItem, config?: WorkflowSchedulerPublishConfig): Record<string, string> {
  const rawTaskPrompt = (config?.prompt || item.lastTestInput || item.goal).trim()
  const uiStyleContext = buildUiMuseumPrdContext(`${item.name}\n${item.goal}\n${rawTaskPrompt}`)
  const taskPrompt = appendUiMuseumContext(rawTaskPrompt, `${item.name}\n${item.goal}\n${rawTaskPrompt}`)
  return {
    prompt: taskPrompt,
    goal: taskPrompt,
    uiStyleStyleIds: uiStyleContext.styleIds.join(','),
    uiStyleStyleNames: uiStyleContext.styleNames.join(' / '),
    uiStyleReasoning: uiStyleContext.reasoning,
    uiStyleVisualJson: JSON.stringify(uiStyleContext.visual),
    uiStyleComponentStates: uiStyleContext.componentStates.join('\n'),
    uiStyleAcceptanceChecklist: uiStyleContext.acceptanceChecklist.join('\n'),
    workflowCatalogId: `studio:${item.id}`,
    workflowSource: 'studio',
    workflowId: item.id,
    studioWorkflowId: item.id,
    teamId: item.teamId,
    workflowType: item.workflowType,
    workflowLabel: item.name,
    artifactLabel: item.workflowType === 'prd' ? 'PRD 成稿' : item.workflowType === 'research' ? '调研报告' : '工作流成果',
    promptTemplate: item.promptTemplate,
    steps: item.steps.join('\n'),
    pushAgentId: config?.pushAgentId || 'general',
  }
}

async function publishToScheduler(item: WorkflowStudioItem, config?: WorkflowSchedulerPublishConfig): Promise<void> {
  const existing = await query<Record<string, unknown>>('SELECT id, task_config_json FROM scheduled_tasks ORDER BY created_at DESC')
  const found = existing.find((row) => {
    try {
      const config = JSON.parse(String(row.task_config_json || '{}')) as Record<string, unknown>
      return config.studioWorkflowId === item.id
    } catch {
      return false
    }
  })

  const payload = {
    name: config?.name?.trim() || `工作流｜${item.name}`,
    cronExpression: config?.cronExpression?.trim() || '0 9 * * *',
    taskType: 'team-workflow' as const,
    taskConfig: buildScheduledTaskConfig(item, config),
    enabled: Boolean(config?.enabled),
    agentId: undefined,
    platformTargets: config?.platformTargets,
  }

  if (found?.id) {
    await updateScheduledTask(String(found.id), payload)
    return
  }

  await createScheduledTask({
    ...payload,
  })
}

export async function publishWorkflowStudioItem(
  id: string,
  target: WorkflowStudioTarget,
  options?: WorkflowPublishOptions,
): Promise<void> {
  const item = await getWorkflowStudioItem(id)
  if (!item) throw new Error('workflow_not_found')
  if (item.lastTestStatus !== 'success') throw new Error('请先试跑成功，再植入模块。')

  if (target === 'scheduler') await publishToScheduler(item, options?.scheduler)

  const publishedTargets = Array.from(new Set([...item.publishedTargets, target]))
  const publishConfigs: WorkflowPublishOptions = {
    ...item.publishConfigs,
    ...options,
  }
  await run(
    `UPDATE workflow_studio_items
     SET status = 'published', published_targets_json = ?, publish_configs_json = ?, updated_at = datetime('now','localtime')
     WHERE id = ?`,
    [JSON.stringify(publishedTargets), JSON.stringify(publishConfigs), id],
  )
}

async function ensureMacAppDevelopmentTeamRecord(): Promise<string> {
  const teams = await listTeams({ status: 'active' }).catch(() => [])
  const matching = teams
    .filter((team) => team.name === MAC_APP_DEVELOPMENT_TEAM_NAME)
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
  const existing = matching[0]
  if (existing) {
    await Promise.all(
      matching.slice(1).map((team) => updateTeam(team.id, { status: 'archived' }).catch(() => undefined)),
    )
    return existing.id
  }

  return createTeam({
    name: MAC_APP_DEVELOPMENT_TEAM_NAME,
    description: '专门用于把 Mac App 想法推进成 PRD、视觉交互、SwiftUI/AppKit 技术方案、测试计划和迭代方案的群策团队。',
    teamType: 'permanent',
    agents: [
      { agentId: 'general', role: '总控编剧', skills: ['prd', 'review'] },
      { agentId: 'strategy', role: '产品战略', skills: ['prd', 'review'] },
      { agentId: 'technical', role: 'macOS 架构师', skills: ['xcode', 'codegen', 'filesystem', 'terminal'] },
      { agentId: 'visual', role: '视觉大师', skills: ['vision', 'review', 'remotion-motion-design', 'baoyu-visual-kit'] },
      { agentId: 'creative', role: '体验创意', skills: ['vision', 'prd'] },
      { agentId: 'market', role: '用户与市场', skills: ['web-search', 'review'] },
      { agentId: 'critic', role: '风险审查', skills: ['review', 'terminal'] },
    ],
    config: {
      communicationPattern: 'sequential',
      workflowType: 'xcode-mac-app',
      capabilities: ['filesystem', 'terminal', 'xcode', 'desktop-control', 'vision', 'codegen', 'review'],
      executionMode: 'supervised',
      temperature: 0.58,
      tasks: [
        { id: 't1', description: '总控提炼产品承诺、边界和最终 PRD 骨架', assignedAgent: 'general', dependsOn: [], outputKey: 'brief' },
        { id: 't2', description: '战略顾问判断目标用户、频率、留存和阶段目标', assignedAgent: 'strategy', dependsOn: ['t1'], outputKey: 'strategy' },
        { id: 't3', description: '视觉大师定义 UI/UX 气质、组件状态、动效语法和截图验收', assignedAgent: 'visual', dependsOn: ['t1'], outputKey: 'visual' },
        { id: 't4', description: '技术架构师输出 SwiftUI/AppKit 架构、权限、文件操作和测试链路', assignedAgent: 'technical', dependsOn: ['t1', 't3'], outputKey: 'technical' },
        { id: 't5', description: '创意火花提出有趣但可实现的 Mac 交互亮点', assignedAgent: 'creative', dependsOn: ['t1'], outputKey: 'creative' },
        { id: 't6', description: '市场分析师审查真实需求、竞品和分发路径', assignedAgent: 'market', dependsOn: ['t2'], outputKey: 'market' },
        { id: 't7', description: '魔鬼代言人做隐私、性能、权限、误操作和合规压力测试', assignedAgent: 'critic', dependsOn: ['t3', 't4', 't6'], outputKey: 'risk' },
        { id: 't8', description: '总控合成大师级 PRD 与 v1 开发任务', assignedAgent: 'general', dependsOn: ['t2', 't3', 't4', 't5', 't6', 't7'], outputKey: 'final_prd' },
      ],
    },
  })
}

async function ensureMacAppDevelopmentTeam(): Promise<string> {
  if (!macAppDevelopmentTeamPromise) {
    macAppDevelopmentTeamPromise = ensureMacAppDevelopmentTeamRecord().finally(() => {
      macAppDevelopmentTeamPromise = null
    })
  }
  return macAppDevelopmentTeamPromise
}

async function ensureMacAppDevelopmentWorkflowRecord(): Promise<string> {
  await ensureWorkflowStudioSchema()
  const teamId = await ensureMacAppDevelopmentTeam()
  const existing = await getWorkflowStudioItem(MAC_APP_DEVELOPMENT_WORKFLOW_ID)
  if (existing) return existing.id

  const promptTemplate = generatePromptTemplateFromWorkflow({
    name: 'Mac App 开发测试｜LumaDesk 灵感航海仪',
    goal: MAC_APP_DEVELOPMENT_GOAL,
    workflowType: 'xcode-mac-app',
    steps: MAC_APP_DEVELOPMENT_STEPS,
  })

  await run(
    `INSERT OR REPLACE INTO workflow_studio_items
     (id, name, goal, workflow_type, team_id, prompt_template, steps_json, target_consumers_json,
      status, last_test_status, last_test_input, last_test_output, published_targets_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'idle', ?, '', ?)`,
    [
      MAC_APP_DEVELOPMENT_WORKFLOW_ID,
      'Mac App 开发测试｜LumaDesk 灵感航海仪',
      MAC_APP_DEVELOPMENT_GOAL,
      'xcode-mac-app',
      teamId,
      promptTemplate,
      JSON.stringify(MAC_APP_DEVELOPMENT_STEPS),
      JSON.stringify(['teams', 'scheduler', 'knowledge', 'xiaobai']),
      MAC_APP_DEVELOPMENT_TEST_INPUT,
      JSON.stringify([]),
    ],
  )
  return MAC_APP_DEVELOPMENT_WORKFLOW_ID
}

export async function ensureMacAppDevelopmentWorkflow(): Promise<string> {
  if (!macAppDevelopmentWorkflowPromise) {
    macAppDevelopmentWorkflowPromise = ensureMacAppDevelopmentWorkflowRecord().finally(() => {
      macAppDevelopmentWorkflowPromise = null
    })
  }
  return macAppDevelopmentWorkflowPromise
}
