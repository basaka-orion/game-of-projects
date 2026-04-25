import { dbSaveOperatingEvent } from '../db/repository'
import type { CommandValidation } from '../security/command-guard'
import type { ToolDefinition, ToolResult } from './index'
import type { ExecutionRiskLevel } from '../agents/execution-receipt'
import { clampExecutionText } from '../agents/execution-receipt'

const HIGH_RISK_TOOLS = new Set([
  'terminal',
  'file_write',
  'code_execute',
  'execute_code',
  'process',
  'patch',
  'skill_manage',
  'ha_call_service',
])

const MEDIUM_RISK_TOOLS = new Set([
  'file_read',
  'search_files',
  'web_extract',
  'browser_click',
  'browser_type',
  'browser_press',
])

function safeStringify(value: unknown, max = 360): string {
  try {
    return clampExecutionText(JSON.stringify(redactSecrets(value)), max)
  } catch {
    return clampExecutionText(String(value), max)
  }
}

function redactSecrets(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(redactSecrets)

  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/token|key|secret|password|authorization/i.test(key)) {
      result[key] = '[redacted]'
    } else {
      result[key] = redactSecrets(item)
    }
  }
  return result
}

export function getToolRisk(definition: Pick<ToolDefinition, 'id' | 'tier'>): ExecutionRiskLevel {
  if (HIGH_RISK_TOOLS.has(definition.id)) return 'high'
  if (MEDIUM_RISK_TOOLS.has(definition.id)) return 'medium'
  if (definition.tier === 1) return 'low'
  if (definition.tier === 2) return 'medium'
  return 'medium'
}

export function toolTrustLabel(risk: ExecutionRiskLevel): string {
  if (risk === 'high') return '高风险工具，需要确认输入、权限和副作用。'
  if (risk === 'medium') return '中风险工具，需要保留输入与结果摘要。'
  return '低风险工具，主要用于检索、澄清或只读上下文。'
}

export async function recordToolExecution(params: {
  definition: ToolDefinition
  input: Record<string, unknown>
  result: ToolResult
  durationMs: number
  commandValidation?: CommandValidation
}): Promise<string | undefined> {
  const { definition, input, result, durationMs, commandValidation } = params
  const risk = getToolRisk(definition)
  const status = result.success ? 'completed' : 'failed'
  const reason = commandValidation?.reason ? `Command guard: ${commandValidation.reason}` : toolTrustLabel(risk)
  const resultText = result.success ? safeStringify(result.data) : result.error || '工具执行失败'

  try {
    return await dbSaveOperatingEvent({
      id: `op_tool_${definition.id}_${Date.now().toString(36)}`,
      type: 'agent_action',
      stage: 'execute',
      agentId: 'tool-runtime',
      title: `工具调用：${definition.name}`,
      status,
      toolRefs: [
        'tool-runtime',
        definition.id,
        `tier-${definition.tier}`,
        ...(definition.mcpServer ? [definition.mcpServer] : []),
      ],
      resultPreview: `${status === 'completed' ? '完成' : '失败'} · ${definition.id} · ${safeStringify(input)} -> ${clampExecutionText(resultText, 260)} (${durationMs}ms)`,
      source: { kind: 'agent', sourceId: definition.id, title: definition.name },
      confidence: result.success ? 0.76 : 0.38,
      entities: [
        definition.id,
        `tier-${definition.tier}`,
        risk,
        definition.mcpServer || '',
        commandValidation?.reason || '',
      ].filter(Boolean),
      receipt: {
        id: `receipt_tool_${definition.id}_${Date.now().toString(36)}`,
        subject: definition.name,
        agentId: 'tool-runtime',
        status,
        inputPreview: safeStringify(input),
        outputPreview: clampExecutionText(resultText),
        tools: [{ id: definition.id, label: definition.name, risk, status }],
        evidenceRefs: definition.mcpServer
          ? [{ kind: 'tool', id: definition.mcpServer, title: definition.mcpServer }]
          : [],
        cost: {
          inputChars: safeStringify(input).length,
          outputChars: resultText.length,
          note: `工具运行耗时 ${durationMs}ms；不含 LLM token 成本。`,
        },
        retry: {
          recommended: !result.success,
          reason: result.success ? '工具调用已完成。' : reason,
          nextStep: result.success ? '将结果交给上层 Agent 继续推理。' : '检查工具配置、参数和权限后重试。',
        },
        trust: {
          risk,
          confidence: result.success ? 0.76 : 0.38,
          rationale: reason,
        },
      },
    })
  } catch (err) {
    console.warn('[tool-trust] failed to record tool execution:', err)
    return undefined
  }
}
