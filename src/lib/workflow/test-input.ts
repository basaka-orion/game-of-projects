import type { TeamWorkflowType } from '../teams/types'

export interface WorkflowTestInputSource {
  name: string
  goal: string
  workflowType: TeamWorkflowType
  steps: string[]
  lastTestInput?: string
}

export const GENERIC_WORKFLOW_TEST_INPUT = '请用这个工作流试跑当前任务：围绕当前目标完整执行一次。'

const LEGACY_DEMO_PATTERNS = [
  /LumaDesk/i,
  /灵感航海仪/,
  /AI\s*产品机会简报/i,
]

function currentWorkflowText(source: WorkflowTestInputSource): string {
  return [source.name, source.goal, ...(source.steps || [])].filter(Boolean).join('\n')
}

function workflowMentionsCurrentDemo(source: WorkflowTestInputSource): boolean {
  return /LumaDesk|灵感航海仪|AI\s*产品机会简报/i.test(currentWorkflowText(source))
}

export function buildWorkflowTestInput(source: WorkflowTestInputSource): string {
  const name = source.name.trim() || '未命名工作流'
  const goal = source.goal.trim() || '围绕当前目标产出一份可检查、可保存、可复用的结果。'
  const steps = (source.steps || []).filter(Boolean).slice(0, 6)
  const stepText = steps.length ? `\n\n本次必须跟随这些步骤：\n${steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}` : ''
  const executionHint =
    source.workflowType === 'build' || source.workflowType === 'xcode-mac-app'
      ? '\n\n如果本次目标要求产品落地或 App 开发，请生成可保存的成果文档，并拆出真实电脑动作、文件产物、验证命令和验收证据；不要只给泛泛建议。'
      : ''

  return [
    `请用这个工作流试跑当前任务：${name}。`,
    '',
    '当前稳定目标：',
    goal,
    stepText,
    executionHint,
    '',
    '硬性要求：',
    '1. 只围绕上面的当前任务执行。',
    '2. 不要引用历史示例、旧项目名、旧缓存任务或无关 Mac/iOS App。',
    '3. 每一步都要产出可检查的中间结果。',
  ]
    .filter(Boolean)
    .join('\n')
    .trim()
}

export function isStaleWorkflowTestInput(source: WorkflowTestInputSource, input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed) return true

  const currentText = currentWorkflowText(source)
  if (/iOS|LumaSense|视觉意识花园/i.test(currentText) && /LumaDesk|灵感航海仪|新的\s*Mac\s*App/i.test(trimmed)) {
    return true
  }

  if (!workflowMentionsCurrentDemo(source) && LEGACY_DEMO_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return true
  }

  return false
}

export function resolveWorkflowTestInput(source: WorkflowTestInputSource): string {
  const lastInput = source.lastTestInput?.trim() || ''
  if (lastInput && !isStaleWorkflowTestInput(source, lastInput)) return lastInput
  return buildWorkflowTestInput(source) || GENERIC_WORKFLOW_TEST_INPUT
}
