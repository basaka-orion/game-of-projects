/**
 * Team Action Broker — 群策执行动作闸门
 *
 * 群策 Agent 只能提出动作；真正执行必须经过这里，便于权限、状态和证据统一审计。
 */
import { executeTool, ToolResult } from '../tools'
import { chatCompletion } from '../ai/provider'
import { getModelRoleConfig } from '../ai/model-roles'
import { generateId } from '../db/schema'
import { createTeamAction, getTeam, getTeamSession, saveTeamSession, updateTeamAction } from './store'
import { AgentCapabilityId, TeamAction, TeamActionRisk, TeamActionToolId } from './types'

type ActionReflectionVerdict = 'success' | 'failed' | 'next_step' | 'boss_handoff'

interface ActionReflection {
  verdict: ActionReflectionVerdict
  confidence: number
  reason: string
  nextStep: string
  bossQuestion?: string
}

interface FollowUpActionDraft {
  capability: AgentCapabilityId
  toolId: TeamActionToolId
  title: string
  description: string
  params: Record<string, unknown>
  risk: TeamActionRisk
}

const FOLLOW_UP_TOOLS: TeamActionToolId[] = [
  'terminal',
  'file_read',
  'file_write',
  'web_search',
  'web_extract',
  'vision_analyze',
  'desktop_screenshot',
  'desktop_control',
  'xcode_action',
  'execute_code',
  'manual_review',
]

function stringifyOutput(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function summarizeResult(result: ToolResult): NonNullable<TeamAction['result']> {
  return {
    success: result.success,
    output: stringifyOutput(result.data).slice(0, 12000),
    error: result.error,
    raw: result,
  }
}

function shouldCapturePostActionObservation(action: TeamAction): boolean {
  return action.toolId === 'desktop_control' || action.toolId === 'xcode_action'
}

async function capturePostActionObservation(action: TeamAction): Promise<ToolResult | null> {
  if (!shouldCapturePostActionObservation(action)) return null
  try {
    return await executeTool('desktop_screenshot', {
      includeOcr: true,
      fileBaseName: `after-${action.toolId}-${action.id.slice(-8)}`,
    })
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function mergePostActionObservation(
  result: NonNullable<TeamAction['result']>,
  observation: ToolResult | null,
): NonNullable<TeamAction['result']> {
  if (!observation) return result
  const observationText = observation.success
    ? stringifyOutput(observation.data).slice(0, 8000)
    : observation.error || '自动二次观察失败'
  return {
    ...result,
    output: [
      result.output,
      '',
      '---',
      '自动二次观察：',
      observationText,
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 16000),
    raw: {
      toolResult: result.raw,
      postActionObservation: observation,
    },
  }
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim() || trimmed
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function extractFirstUrl(text: string): string {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i)
  return match?.[0]?.replace(/[),.;，。]+$/, '') || ''
}

function normalizeFollowUpTool(value: unknown): TeamActionToolId {
  const toolId = String(value || '')
  return FOLLOW_UP_TOOLS.includes(toolId as TeamActionToolId) ? (toolId as TeamActionToolId) : 'manual_review'
}

function inferCapabilityForTool(toolId: TeamActionToolId, fallback: AgentCapabilityId): AgentCapabilityId {
  switch (toolId) {
    case 'terminal':
      return 'terminal'
    case 'file_read':
    case 'file_write':
      return 'filesystem'
    case 'web_search':
    case 'web_extract':
      return 'web-search'
    case 'vision_analyze':
    case 'desktop_screenshot':
      return 'vision'
    case 'desktop_control':
      return 'desktop-control'
    case 'xcode_action':
      return 'xcode'
    case 'execute_code':
      return 'codegen'
    case 'manual_review':
      return 'review'
    default:
      return fallback
  }
}

function normalizeFollowUpRisk(value: unknown, toolId: TeamActionToolId): TeamActionRisk {
  const risk = String(value || '').toLowerCase()
  if (risk === 'low' || risk === 'medium' || risk === 'high') return risk
  if (toolId === 'desktop_control' || toolId === 'file_write' || toolId === 'execute_code') return 'high'
  if (toolId === 'terminal' || toolId === 'xcode_action' || toolId === 'desktop_screenshot') return 'medium'
  return 'low'
}

function normalizeFollowUpParams(value: unknown, toolId: TeamActionToolId): Record<string, unknown> {
  const params = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  switch (toolId) {
    case 'terminal':
      return { command: String(params.command || ''), timeout: Number(params.timeout || 30000) }
    case 'file_read':
      return { path: String(params.path || ''), encoding: String(params.encoding || 'utf-8') }
    case 'file_write':
      return { path: String(params.path || ''), content: String(params.content || '') }
    case 'web_search':
      return { query: String(params.query || ''), max_results: Number(params.max_results || 5) }
    case 'web_extract':
      return { url: String(params.url || ''), format: String(params.format || 'text') }
    case 'vision_analyze':
      return { image: String(params.image || ''), prompt: String(params.prompt || '请分析这张图片') }
    case 'desktop_screenshot':
      return {
        includeOcr: params.includeOcr !== false,
        fileBaseName: String(params.fileBaseName || 'follow-up-observation'),
      }
    case 'desktop_control':
      return {
        action: String(params.action || 'activate_app'),
        appName: String(params.appName || ''),
        path: String(params.path || ''),
        url: String(params.url || ''),
        text: String(params.text || ''),
        key: String(params.key || ''),
        modifiers: Array.isArray(params.modifiers) ? params.modifiers : [],
        x: Number(params.x || 0),
        y: Number(params.y || 0),
        menuPath: Array.isArray(params.menuPath) ? params.menuPath : [],
      }
    case 'xcode_action':
      return {
        action: String(params.action || 'list'),
        projectPath: String(params.projectPath || ''),
        scheme: String(params.scheme || ''),
        destination: String(params.destination || ''),
        configuration: String(params.configuration || ''),
        sdk: String(params.sdk || ''),
        simctlKind: String(params.simctlKind || ''),
        timeout: Number(params.timeout || 120000),
      }
    case 'execute_code':
      return {
        code: String(params.code || ''),
        language: String(params.language || 'javascript'),
        timeout: Number(params.timeout || 60000),
      }
    case 'manual_review':
    default:
      return params
  }
}

function normalizeFollowUpDraft(value: Record<string, unknown> | null, fallback: FollowUpActionDraft): FollowUpActionDraft {
  if (!value || value.create === false) return fallback
  const toolId = normalizeFollowUpTool(value.toolId || value.tool_id)
  const risk = normalizeFollowUpRisk(value.risk, toolId)
  return {
    capability: inferCapabilityForTool(toolId, fallback.capability),
    toolId,
    title: String(value.title || fallback.title).slice(0, 120),
    description: String(value.description || fallback.description).slice(0, 1000),
    params: normalizeFollowUpParams(value.params, toolId),
    risk,
  }
}

function normalizeReflectionVerdict(value: unknown): ActionReflectionVerdict {
  const verdict = String(value || '').toLowerCase()
  if (verdict === 'success' || verdict === 'failed' || verdict === 'next_step' || verdict === 'boss_handoff') {
    return verdict
  }
  return 'next_step'
}

function normalizeReflection(value: Record<string, unknown> | null, fallback: ActionReflection): ActionReflection {
  if (!value) return fallback
  const confidence = Number(value.confidence)
  return {
    verdict: normalizeReflectionVerdict(value.verdict),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : fallback.confidence,
    reason: String(value.reason || fallback.reason).slice(0, 1200),
    nextStep: String(value.nextStep || value.next_step || fallback.nextStep).slice(0, 1200),
    bossQuestion: value.bossQuestion || value.boss_question ? String(value.bossQuestion || value.boss_question).slice(0, 600) : undefined,
  }
}

function buildFallbackReflection(
  action: TeamAction,
  result: NonNullable<TeamAction['result']>,
): ActionReflection {
  if (!result.success) {
    return {
      verdict: 'failed',
      confidence: 0.78,
      reason: result.error || '工具执行返回失败，需要查看错误与动作参数。',
      nextStep: action.risk === 'high' ? '暂停自动推进，让 Boss 或执行总控确认下一步。' : '修正参数后重新提出低风险动作。',
    }
  }
  if (shouldCapturePostActionObservation(action) && result.output.includes('自动二次观察：')) {
    return {
      verdict: 'next_step',
      confidence: 0.68,
      reason: '动作已执行并完成屏幕复核，但仍需要结合截图/OCR 判断是否达到最终目标。',
      nextStep: '基于自动二次观察继续提出下一步动作，或让 Boss 确认当前屏幕状态。',
    }
  }
  return {
    verdict: 'success',
    confidence: 0.72,
    reason: '工具执行成功且没有返回显式错误。',
    nextStep: '把本次证据写入协作历史，并进入下一项待执行动作。',
  }
}

async function reflectOnAction(
  action: TeamAction,
  result: NonNullable<TeamAction['result']>,
): Promise<ActionReflection> {
  const fallback = buildFallbackReflection(action, result)
  try {
    const config = getModelRoleConfig('evolution_review')
    const raw = await chatCompletion(
      config,
      [
        {
          role: 'system',
          content:
            '你是 Openbasaka 群策系统的执行复盘官。你只判断一次工具执行是否真的达成目标，不编造未观察到的结果。只输出 JSON。',
        },
        {
          role: 'user',
          content: [
            '请复盘这个执行动作，判断后续状态。',
            'verdict 只能是 success、failed、next_step、boss_handoff。',
            '当证据不足、涉及高风险桌面控制、需要用户肉眼确认时，用 boss_handoff。',
            '输出 JSON 字段：verdict, confidence, reason, nextStep, bossQuestion。',
            '',
            `动作标题：${action.title}`,
            `工具：${action.toolId}`,
            `风险：${action.risk}`,
            `参数：${stringifyOutput(action.params).slice(0, 1800)}`,
            '',
            `执行结果：${stringifyOutput(result).slice(0, 9000)}`,
          ].join('\n'),
        },
      ],
      0.15,
      700,
    )
    return normalizeReflection(extractJsonObject(raw), fallback)
  } catch {
    return fallback
  }
}

function formatActionReflection(action: TeamAction, reflection: ActionReflection): string {
  const verdictLabel: Record<ActionReflectionVerdict, string> = {
    success: '成功',
    failed: '失败',
    next_step: '需要下一步',
    boss_handoff: '需要 Boss 接管',
  }
  return [
    `复盘动作：${action.title}`,
    `结论：${verdictLabel[reflection.verdict]}`,
    `置信度：${Math.round(reflection.confidence * 100)}%`,
    '',
    `原因：${reflection.reason}`,
    `下一步：${reflection.nextStep}`,
    reflection.bossQuestion ? `需要 Boss 确认：${reflection.bossQuestion}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function mergeActionReflection(
  result: NonNullable<TeamAction['result']>,
  reflection: ActionReflection,
): NonNullable<TeamAction['result']> {
  const summary = [
    '',
    '---',
    '执行复盘：',
    `verdict=${reflection.verdict}`,
    `confidence=${Math.round(reflection.confidence * 100)}%`,
    `nextStep=${reflection.nextStep}`,
  ].join('\n')
  return {
    ...result,
    output: `${result.output || ''}${summary}`.trim().slice(0, 18000),
    raw: {
      result: result.raw,
      reflection,
    },
  }
}

function formatActionObservation(action: TeamAction, result: NonNullable<TeamAction['result']>): string {
  const status = result.success ? '成功' : '失败'
  const body = result.error || result.output || '无输出'
  return [
    `执行动作：${action.title}`,
    `状态：${status}`,
    `工具：${action.toolId}`,
    `风险：${action.risk}`,
    '',
    '参数：',
    stringifyOutput(action.params).slice(0, 1600),
    '',
    '结果证据：',
    body.slice(0, 8000),
  ].join('\n')
}

async function appendActionObservation(
  action: TeamAction,
  status: TeamAction['status'],
  result: NonNullable<TeamAction['result']>,
): Promise<void> {
  const session = await getTeamSession(action.sessionId)
  if (!session) return
  session.messages.push({
    id: 'obs_' + generateId(),
    agentId: 'action-broker',
    agentName: '执行观察回路',
    role: 'system',
    content: formatActionObservation({ ...action, status, result }, result),
    timestamp: Date.now(),
    kind: result.success ? 'progress' : 'error',
  })
  await saveTeamSession(session)
}

async function appendActionReflection(action: TeamAction, reflection: ActionReflection): Promise<void> {
  const session = await getTeamSession(action.sessionId)
  if (!session) return
  session.messages.push({
    id: 'reflection_' + generateId(),
    agentId: 'action-reflector',
    agentName: '执行复盘官',
    role: 'system',
    content: formatActionReflection(action, reflection),
    timestamp: Date.now(),
    kind: reflection.verdict === 'failed' || reflection.verdict === 'boss_handoff' ? 'error' : 'progress',
  })
  await saveTeamSession(session)
}

async function createBossCheckpointIfNeeded(action: TeamAction, reflection: ActionReflection): Promise<void> {
  if (reflection.verdict !== 'boss_handoff') return
  await createTeamAction({
    sessionId: action.sessionId,
    teamId: action.teamId,
    ownerAgentId: 'action-reflector',
    ownerAgentName: '执行复盘官',
    capability: 'review',
    toolId: 'manual_review',
    title: 'Boss 接管确认',
    description: reflection.bossQuestion || reflection.nextStep || '该动作需要 Boss 确认后再继续推进。',
    params: {
      sourceActionId: action.id,
      sourceToolId: action.toolId,
      verdict: reflection.verdict,
      reason: reflection.reason,
      nextStep: reflection.nextStep,
      bossQuestion: reflection.bossQuestion || '',
    },
    risk: action.risk === 'high' ? 'high' : 'medium',
    requiresApproval: true,
    status: 'proposed',
  })
}

function buildFallbackFollowUpDraft(
  action: TeamAction,
  result: NonNullable<TeamAction['result']>,
  reflection: ActionReflection,
): FollowUpActionDraft {
  const path = String(action.params.path || '')
  const url = extractFirstUrl(result.output)
  if (action.toolId === 'file_write' && path) {
    return {
      capability: 'filesystem',
      toolId: 'file_read',
      title: '读取刚刚写入的文件',
      description: '验证文件内容是否已经按预期落地，并给下一步代码/构建动作提供证据。',
      params: { path, encoding: 'utf-8' },
      risk: 'low',
    }
  }
  if (action.toolId === 'web_search' && url) {
    return {
      capability: 'web-search',
      toolId: 'web_extract',
      title: '抽取最相关网页内容',
      description: '从搜索结果里抽取第一条可用来源，补足后续研判证据。',
      params: { url, format: 'text' },
      risk: 'low',
    }
  }
  if (action.toolId === 'desktop_control' || action.toolId === 'xcode_action') {
    return {
      capability: 'review',
      toolId: 'manual_review',
      title: '确认屏幕复核后的下一步',
      description: reflection.nextStep || '结合自动截图/OCR 复核结果，确认是否继续执行下一步桌面或 Xcode 操作。',
      params: {
        sourceActionId: action.id,
        sourceToolId: action.toolId,
        reflection,
      },
      risk: action.risk === 'high' ? 'high' : 'medium',
    }
  }
  return {
    capability: 'review',
    toolId: 'manual_review',
    title: '确认下一步动作',
    description: reflection.nextStep || '当前动作已经产生结果，需要确认下一步执行策略。',
    params: {
      sourceActionId: action.id,
      sourceToolId: action.toolId,
      resultSummary: (result.error || result.output || '').slice(0, 1600),
      reflection,
    },
    risk: action.risk === 'high' ? 'medium' : 'low',
  }
}

async function proposeFollowUpAction(
  action: TeamAction,
  result: NonNullable<TeamAction['result']>,
  reflection: ActionReflection,
): Promise<FollowUpActionDraft> {
  const fallback = buildFallbackFollowUpDraft(action, result, reflection)
  try {
    const config = getModelRoleConfig('evolution_review')
    const raw = await chatCompletion(
      config,
      [
        {
          role: 'system',
          content:
            '你是 Openbasaka 群策执行调度器。你只为下一步生成一条可审计动作，不连续执行，不编造文件路径，不生成破坏性命令。只输出 JSON。',
        },
        {
          role: 'user',
          content: [
            '基于动作结果和复盘结论，生成一条下一步动作。',
            `允许 toolId: ${FOLLOW_UP_TOOLS.join(', ')}`,
            '优先生成观察、读取、验证、抽取、人工确认类动作。',
            '涉及桌面控制、写文件、执行代码、Xcode 构建，risk 必须是 high 或 medium。',
            '输出 JSON 字段：create, toolId, title, description, params, risk。',
            '',
            `上一动作：${action.title}`,
            `上一工具：${action.toolId}`,
            `上一风险：${action.risk}`,
            `上一参数：${stringifyOutput(action.params).slice(0, 1600)}`,
            '',
            `复盘：${stringifyOutput(reflection).slice(0, 1800)}`,
            '',
            `结果证据：${stringifyOutput(result).slice(0, 7000)}`,
          ].join('\n'),
        },
      ],
      0.15,
      700,
    )
    return normalizeFollowUpDraft(extractJsonObject(raw), fallback)
  } catch {
    return fallback
  }
}

async function requiresFollowUpApproval(action: TeamAction, draft: FollowUpActionDraft): Promise<boolean> {
  const team = await getTeam(action.teamId)
  const mode = team?.config.executionMode || 'supervised'
  if (mode === 'advisory') return true
  if (draft.toolId === 'manual_review') return true
  if (draft.risk === 'high') return true
  if (draft.toolId === 'desktop_control') return true
  const paramsText = stringifyOutput(draft.params).toLowerCase()
  if (/\bsudo\b|password|passwd|密码|keychain|delete|remove|rm\s+-rf|killall/i.test(paramsText)) return true
  return false
}

async function appendFollowUpCreatedMessage(
  action: TeamAction,
  draft: FollowUpActionDraft,
  followUpId: string,
): Promise<void> {
  const session = await getTeamSession(action.sessionId)
  if (!session) return
  session.messages.push({
    id: 'followup_' + generateId(),
    agentId: 'action-scheduler',
    agentName: '续跑调度器',
    role: 'system',
    content: [
      `已生成后续动作：${draft.title}`,
      `动作 ID：${followUpId}`,
      `工具：${draft.toolId}`,
      `风险：${draft.risk}`,
      '',
      `原因：${draft.description}`,
    ].join('\n'),
    timestamp: Date.now(),
    kind: 'progress',
  })
  await saveTeamSession(session)
}

async function createFollowUpActionIfNeeded(
  action: TeamAction,
  result: NonNullable<TeamAction['result']>,
  reflection: ActionReflection,
): Promise<void> {
  if (reflection.verdict !== 'next_step') return
  if (!result.success) return
  const draft = await proposeFollowUpAction(action, result, reflection)
  const followUpId = await createTeamAction({
    sessionId: action.sessionId,
    teamId: action.teamId,
    ownerAgentId: 'action-scheduler',
    ownerAgentName: '续跑调度器',
    capability: draft.capability,
    toolId: draft.toolId,
    title: draft.title,
    description: draft.description,
    params: {
      ...draft.params,
      sourceActionId: action.id,
      sourceToolId: action.toolId,
      generatedBy: 'next_step',
      reflectionVerdict: reflection.verdict,
    },
    risk: draft.risk,
    requiresApproval: await requiresFollowUpApproval(action, draft),
    status: 'proposed',
  })
  await appendFollowUpCreatedMessage(action, draft, followUpId)
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function getResultText(result: NonNullable<TeamAction['result']>): string {
  return [result.error || '', result.output || ''].join('\n')
}

function isAutoRepairAction(action: TeamAction): boolean {
  return action.params?.generatedBy === 'auto_repair' || Boolean(action.params?.repairForActionId)
}

function buildRepairActionDraft(
  action: TeamAction,
  result: NonNullable<TeamAction['result']>,
): FollowUpActionDraft | null {
  if (result.success) return null
  if (action.toolId === 'manual_review') return null
  if (isAutoRepairAction(action)) return null

  const text = getResultText(result)
  if (action.toolId === 'xcode_action') {
    if (/requires Xcode|CommandLineTools|xcode-select|developer directory/i.test(text)) {
      return {
        capability: 'terminal',
        toolId: 'terminal',
        title: '自动诊断 Xcode 工具链',
        description:
          'Xcode 动作失败后自动检查当前 developer directory、已安装 Xcode.app 和 xcodebuild 版本，判断能否自行修复或是否进入系统级阻塞。',
        params: {
          command: 'xcode-select -p; ls -d /Applications/Xcode*.app 2>/dev/null; xcodebuild -version',
          timeout: 30000,
        },
        risk: 'medium',
      }
    }
    return {
      capability: 'terminal',
      toolId: 'terminal',
      title: '自动收集 Xcode 失败证据',
      description: 'Xcode 动作失败后自动收集工具链路径和 xcrun 诊断，避免让 Boss 手动排查基础环境。',
      params: {
        command: 'xcode-select -p; xcrun --find xcodebuild; xcrun simctl list runtimes',
        timeout: 30000,
      },
      risk: 'medium',
    }
  }

  if (action.toolId === 'desktop_control') {
    return {
      capability: 'vision',
      toolId: 'desktop_screenshot',
      title: '自动截图复核桌面失败',
      description: '桌面控制失败后自动截屏并做 OCR，判断是窗口焦点、权限还是目标控件变化导致。',
      params: { includeOcr: true, fileBaseName: `repair-desktop-${action.id.slice(-8)}` },
      risk: 'medium',
    }
  }

  if (action.toolId === 'file_read' || action.toolId === 'file_write') {
    const path = String(action.params.path || '')
    if (path) {
      return {
        capability: 'terminal',
        toolId: 'terminal',
        title: '自动诊断文件路径',
        description: '文件动作失败后自动检查路径、父目录和权限信息，减少用户手工定位。',
        params: {
          command: `ls -la ${shellQuote(path)}; stat ${shellQuote(path)}`,
          timeout: 30000,
        },
        risk: 'medium',
      }
    }
  }

  if (action.toolId === 'web_extract') {
    const url = String(action.params.url || '') || extractFirstUrl(text)
    if (url) {
      return {
        capability: 'web-search',
        toolId: 'web_search',
        title: '自动寻找替代网页来源',
        description: '网页抽取失败后自动搜索同一 URL 或主题，寻找可读取的替代来源。',
        params: { query: url, max_results: 5 },
        risk: 'low',
      }
    }
  }

  if (action.toolId === 'terminal') {
    return {
      capability: 'vision',
      toolId: 'desktop_screenshot',
      title: '自动截屏记录终端失败现场',
      description: '终端动作失败后自动记录当前桌面状态，给后续修复动作提供上下文证据。',
      params: { includeOcr: true, fileBaseName: `repair-terminal-${action.id.slice(-8)}` },
      risk: 'medium',
    }
  }

  return {
    capability: 'vision',
    toolId: 'desktop_screenshot',
    title: '自动收集失败现场证据',
    description: '动作失败后先自动收集屏幕和 OCR 证据，再决定是否需要更高风险操作。',
    params: { includeOcr: true, fileBaseName: `repair-${action.toolId}-${action.id.slice(-8)}` },
    risk: 'medium',
  }
}

async function appendRepairCreatedMessage(
  action: TeamAction,
  draft: FollowUpActionDraft,
  repairId: string,
): Promise<void> {
  const session = await getTeamSession(action.sessionId)
  if (!session) return
  session.messages.push({
    id: 'repair_' + generateId(),
    agentId: 'auto-repair-scheduler',
    agentName: '自愈调度器',
    role: 'system',
    content: [
      `已自动生成修复/诊断动作：${draft.title}`,
      `动作 ID：${repairId}`,
      `工具：${draft.toolId}`,
      `风险：${draft.risk}`,
      '',
      `原因：${draft.description}`,
    ].join('\n'),
    timestamp: Date.now(),
    kind: 'progress',
  })
  await saveTeamSession(session)
}

async function createSystemBoundaryCheckpoint(
  action: TeamAction,
  result: NonNullable<TeamAction['result']>,
  reflection: ActionReflection,
): Promise<void> {
  await createTeamAction({
    sessionId: action.sessionId,
    teamId: action.teamId,
    ownerAgentId: 'auto-repair-scheduler',
    ownerAgentName: '自愈调度器',
    capability: 'review',
    toolId: 'manual_review',
    title: '系统级阻塞接管点',
    description:
      '自动修复/诊断动作仍然失败，可能涉及安装完整 Xcode、系统授权、开发者目录切换或其他不可静默完成的系统边界。这里保留证据，只在这类极少数场景等待一次确认。',
    params: {
      sourceActionId: action.id,
      sourceToolId: action.toolId,
      resultSummary: getResultText(result).slice(0, 2400),
      reflection,
      generatedBy: 'auto_repair_boundary',
    },
    risk: 'high',
    requiresApproval: true,
    status: 'proposed',
  })
}

async function createRepairActionIfNeeded(
  action: TeamAction,
  result: NonNullable<TeamAction['result']>,
  reflection: ActionReflection,
): Promise<void> {
  if (result.success) return
  if (action.toolId === 'manual_review') return

  if (isAutoRepairAction(action)) {
    await createSystemBoundaryCheckpoint(action, result, reflection)
    return
  }

  const draft = buildRepairActionDraft(action, result)
  if (!draft) return

  const repairId = await createTeamAction({
    sessionId: action.sessionId,
    teamId: action.teamId,
    ownerAgentId: 'auto-repair-scheduler',
    ownerAgentName: '自愈调度器',
    capability: draft.capability,
    toolId: draft.toolId,
    title: draft.title,
    description: draft.description,
    params: {
      ...draft.params,
      sourceActionId: action.id,
      sourceToolId: action.toolId,
      generatedBy: 'auto_repair',
      repairForActionId: action.id,
      reflectionVerdict: reflection.verdict,
    },
    risk: draft.risk,
    requiresApproval: await requiresFollowUpApproval(action, draft),
    status: 'proposed',
  })
  await appendRepairCreatedMessage(action, draft, repairId)
}

export function isExecutableTeamAction(action: TeamAction): boolean {
  return action.toolId !== 'manual_review'
}

export async function approveTeamAction(action: TeamAction): Promise<TeamAction> {
  const approved: TeamAction = {
    ...action,
    status: 'approved',
    updatedAt: new Date().toISOString(),
  }
  await updateTeamAction(action.id, { status: 'approved' })
  return approved
}

export async function rejectTeamAction(action: TeamAction): Promise<TeamAction> {
  const rejected: TeamAction = {
    ...action,
    status: 'rejected',
    updatedAt: new Date().toISOString(),
  }
  await updateTeamAction(action.id, { status: 'rejected' })
  return rejected
}

export async function executeTeamAction(action: TeamAction): Promise<TeamAction> {
  if (!isExecutableTeamAction(action)) {
    const result = {
      success: false,
      output: '',
      error: '该动作是人工确认项，没有可直接执行的工具。',
    }
    await updateTeamAction(action.id, { status: 'failed', result })
    await appendActionObservation(action, 'failed', result)
    const reflection = buildFallbackReflection(action, result)
    const reflectedResult = mergeActionReflection(result, reflection)
    await updateTeamAction(action.id, { result: reflectedResult })
    await appendActionReflection(action, reflection)
    await createBossCheckpointIfNeeded(action, reflection)
    await createRepairActionIfNeeded(action, reflectedResult, reflection)
    await createFollowUpActionIfNeeded(action, reflectedResult, reflection)
    return { ...action, status: 'failed', result: reflectedResult, updatedAt: new Date().toISOString() }
  }

  await updateTeamAction(action.id, { status: 'running' })
  try {
    const toolResult = await executeTool(action.toolId, action.params)
    const observation = await capturePostActionObservation(action)
    const result = mergePostActionObservation(summarizeResult(toolResult), observation)
    const status = toolResult.success ? 'completed' : 'failed'
    await appendActionObservation(action, status, result)
    const reflection = await reflectOnAction(action, result)
    const reflectedResult = mergeActionReflection(result, reflection)
    await updateTeamAction(action.id, { status, result: reflectedResult })
    await appendActionReflection(action, reflection)
    await createBossCheckpointIfNeeded(action, reflection)
    await createRepairActionIfNeeded(action, reflectedResult, reflection)
    await createFollowUpActionIfNeeded(action, reflectedResult, reflection)
    return { ...action, status, result: reflectedResult, updatedAt: new Date().toISOString() }
  } catch (err) {
    const result = {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : String(err),
    }
    await updateTeamAction(action.id, { status: 'failed', result })
    await appendActionObservation(action, 'failed', result)
    const reflection = buildFallbackReflection(action, result)
    const reflectedResult = mergeActionReflection(result, reflection)
    await updateTeamAction(action.id, { result: reflectedResult })
    await appendActionReflection(action, reflection)
    await createBossCheckpointIfNeeded(action, reflection)
    await createRepairActionIfNeeded(action, reflectedResult, reflection)
    await createFollowUpActionIfNeeded(action, reflectedResult, reflection)
    return { ...action, status: 'failed', result: reflectedResult, updatedAt: new Date().toISOString() }
  }
}
