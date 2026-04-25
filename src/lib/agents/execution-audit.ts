import { dbSaveOperatingEvent } from '../db/repository'
import type {
  AgentExecutionReceipt,
  ExecutionEvidenceRef,
  ExecutionReceiptStatus,
  ExecutionRiskLevel,
  ExecutionToolRef,
} from './execution-receipt'
import { clampExecutionText } from './execution-receipt'
import type { OperatingLoopSourceRef, OperatingLoopStageId } from '../operating-loop'

export interface AgentExecutionAuditInput {
  id?: string
  agentId: string
  subject: string
  input: string
  output: string
  status: ExecutionReceiptStatus
  stage?: OperatingLoopStageId
  tools?: ExecutionToolRef[]
  evidenceRefs?: ExecutionEvidenceRef[]
  projectIds?: string[]
  source?: OperatingLoopSourceRef
  durationMs?: number
  confidence?: number
  entities?: string[]
  risk?: ExecutionRiskLevel
  retry?: {
    recommended: boolean
    reason: string
    nextStep: string
  }
}

function strongestRisk(tools: ExecutionToolRef[], fallback: ExecutionRiskLevel): ExecutionRiskLevel {
  if (tools.some((tool) => tool.risk === 'high')) return 'high'
  if (tools.some((tool) => tool.risk === 'medium')) return 'medium'
  return fallback
}

function defaultRetry(input: AgentExecutionAuditInput) {
  if (input.status === 'completed') {
    return {
      recommended: false,
      reason: '执行已完成，等待复盘或下游模块消费。',
      nextStep: '如果输出有长期价值，归档到记忆、知识或项目状态。',
    }
  }

  return {
    recommended: true,
    reason: /api key|未配置|timeout|超时|network|网络|quota|限额/i.test(input.output)
      ? '失败更像配置、网络或外部服务问题。'
      : '执行失败，需要补充上下文、收窄目标或更换工具。',
    nextStep: '保留当前收据，修正输入或工具配置后重试。',
  }
}

export function buildAgentExecutionReceipt(input: AgentExecutionAuditInput): AgentExecutionReceipt {
  const defaultToolStatus: ExecutionToolRef['status'] = input.status === 'failed' ? 'failed' : 'completed'
  const tools: ExecutionToolRef[] = input.tools?.length
    ? input.tools
    : [
        {
          id: 'llm',
          label: 'LLM completion',
          risk: 'low',
          status: defaultToolStatus,
        },
      ]
  const risk = input.risk || strongestRisk(tools, 'low')
  const retry = input.retry || defaultRetry(input)
  const duration = typeof input.durationMs === 'number' ? `，耗时 ${input.durationMs}ms` : ''

  return {
    id: `receipt_agent_${input.agentId}_${Date.now().toString(36)}`,
    subject: input.subject,
    agentId: input.agentId,
    status: input.status,
    inputPreview: clampExecutionText(input.input),
    outputPreview: clampExecutionText(input.output),
    tools,
    evidenceRefs: input.evidenceRefs || [],
    cost: {
      inputChars: input.input.length,
      outputChars: input.output.length,
      note: `本地估算字符数${duration}；尚未接入 provider token/cost 回传。`,
    },
    retry,
    trust: {
      risk,
      confidence: input.confidence ?? (input.status === 'completed' ? 0.74 : 0.36),
      rationale:
        input.status === 'completed'
          ? '执行已完成并写入主循环账本；可信度取决于证据引用和后续复盘。'
          : '执行失败或被阻塞，不能作为事实依据，只能作为复盘信号。',
    },
  }
}

export async function recordAgentExecutionReceipt(input: AgentExecutionAuditInput): Promise<string | undefined> {
  const receipt = buildAgentExecutionReceipt(input)
  const status = input.status === 'completed' ? 'completed' : 'failed'

  try {
    return await dbSaveOperatingEvent({
      id: input.id || `op_agent_run_${input.agentId}_${Date.now().toString(36)}`,
      type: 'agent_action',
      stage: input.stage || 'execute',
      agentId: input.agentId,
      title: `Agent 执行：${input.subject}`,
      status,
      toolRefs: receipt.tools.map((tool) => tool.id),
      resultPreview: receipt.outputPreview,
      projectIds: input.projectIds || [],
      source: input.source || { kind: 'agent', sourceId: input.agentId, title: input.subject },
      confidence: receipt.trust.confidence,
      entities: [input.agentId, ...receipt.tools.map((tool) => tool.id), ...(input.entities || [])].filter(Boolean),
      receipt,
    })
  } catch (err) {
    console.warn('[execution-audit] failed to record agent receipt:', err)
    return undefined
  }
}
