import { dbSaveOperatingEvent } from '../db/repository'
import { generatePromptTemplateFromWorkflow, saveWorkflowStudioItem, type WorkflowStudioDraft } from '../workflow/studio'
import { deriveCouncilProjectTitle, redactSensitiveText, sanitizeCouncilFileBaseName } from './export-safety'
import type { CouncilPrdRunResult } from './workflow'

function compact(value: string, max = 80): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function workflowSafeId(value: string): string {
  return sanitizeCouncilFileBaseName(value)
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || Date.now().toString(36)
}

export interface CouncilWorkflowDispatchInput {
  problem: string
  result: CouncilPrdRunResult
  exportMarkdown: string
}

export interface CouncilWorkflowDispatchReceipt {
  workflowStudioId: string
  operatingEventId?: string
  draft: WorkflowStudioDraft
}

export function buildCouncilWorkflowDraft(input: CouncilWorkflowDispatchInput): WorkflowStudioDraft {
  const safeProblem = redactSensitiveText(input.problem)
  const safeMarkdown = redactSensitiveText(input.exportMarkdown)
  const productName = deriveCouncilProjectTitle(safeProblem, safeMarkdown)
  const name = `小白智囊团｜${productName}`
  const goal = [
    `把本轮小白智囊团共识 PRD 转成工作流可试跑任务：${compact(safeProblem, 160)}`,
    `UI 风格馆 DNA：${input.result.uiStyleContext.styleNames.join(' / ') || '自动推荐'}`,
    `质量闸门：${input.result.qualityGate.score}/${input.result.qualityGate.finalGateStatus}`,
    `运行证据：${input.result.runtimeEvidence.runId}`,
  ].join('\n')
  const steps = [
    '复核产品定位、目标用户、端到端旅程、P0/P1/P2 与不做清单',
    '把 UI风格馆 DNA 落到页面层级、组件状态、动效节奏、截图验收和可访问性',
    '把 P0 拆成设计、前端、后端、数据、AI、测试和隐私安全任务',
    '执行时遵守安全边界：外发、删除、付款、账号、权限、密钥必须停给 Boss',
    '运行构建、测试、截图或人工验收后写回 operating_events 与工作流结果',
    '交付超顶级 PRD、共识追溯、质量闸门、证据缺口和下一步行动包',
  ]
  const basePrompt = generatePromptTemplateFromWorkflow({
    name,
    goal,
    workflowType: 'prd',
    steps,
  })
  const markdown = safeMarkdown.trim()
  return {
    id: `wfs_xiaobai_council_${workflowSafeId(input.result.runtimeEvidence.runId)}`,
    name,
    goal,
    workflowType: 'prd',
    teamId: input.result.team.id,
    promptTemplate: [
      basePrompt,
      '',
      '## 小白智囊团自动投递的超顶级 PRD 副本',
      markdown.length > 56000 ? `${markdown.slice(0, 56000)}\n\n> 已截断超长导出，完整版本请从小白智囊团下载 Markdown。` : markdown,
    ].join('\n'),
    steps,
    targetConsumers: ['teams', 'knowledge', 'xiaobai'],
  }
}

export async function dispatchCouncilPrdToWorkflow(input: CouncilWorkflowDispatchInput): Promise<CouncilWorkflowDispatchReceipt> {
  const draft = buildCouncilWorkflowDraft(input)
  const workflowStudioId = await saveWorkflowStudioItem(draft)
  const operatingEventId = await dbSaveOperatingEvent({
    id: `op_xiaobai_workflow_dispatch_${workflowSafeId(input.result.runtimeEvidence.runId)}`,
    type: 'agent_action',
    stage: 'execute',
    agentId: 'xiaobai-council',
    title: `小白智囊团｜自动投递工作流`,
    status: 'completed',
    resultPreview: `已把 ${draft.name} 的超顶级 PRD 副本投递到工作流草稿：${workflowStudioId}。`,
    source: {
      kind: 'agent',
      sourceId: input.result.runtimeEvidence.runId,
      title: draft.name,
    },
    confidence: 0.86,
    entities: ['xiaobai-council', 'workflow-studio', 'ui-museum', 'master-prd'],
    toolRefs: ['xiaobai-council', 'workflow_studio_items', 'operating_events', 'ui-museum'],
  }).catch(() => undefined)
  return { workflowStudioId, operatingEventId, draft }
}
