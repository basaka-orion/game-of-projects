import { dbSaveOperatingEvent } from '../db/repository'
import type { OperatingLoopSourceRef, OperatingLoopStageId } from '../operating-loop'

type OperationStatus = 'queued' | 'running' | 'blocked' | 'completed' | 'failed'

export interface OpenbasakaOperationHistoryInput {
  id?: string
  moduleId: string
  moduleName: string
  action: string
  summary: string
  status?: OperationStatus
  stage?: OperatingLoopStageId
  source?: OperatingLoopSourceRef
  toolRefs?: string[]
  entities?: string[]
  projectIds?: string[]
  confidence?: number
}

function compactId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'operation'
}

function compactText(value: string, limit = 260): string {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text
}

export async function recordOpenbasakaOperation(
  input: OpenbasakaOperationHistoryInput,
): Promise<string | undefined> {
  const moduleId = compactId(input.moduleId)
  const actionId = compactId(input.action)
  const status = input.status || 'completed'

  try {
    return await dbSaveOperatingEvent({
      id: input.id || `op_openbasaka_${moduleId}_${actionId}_${Date.now().toString(36)}`,
      type: 'agent_action',
      stage: input.stage || 'execute',
      agentId: moduleId,
      title: `${input.moduleName}｜${input.action}`,
      status,
      toolRefs: input.toolRefs || [moduleId],
      resultPreview: compactText(input.summary),
      projectIds: input.projectIds || [],
      source: input.source || { kind: 'agent', sourceId: moduleId, title: input.moduleName },
      confidence: input.confidence ?? (status === 'completed' ? 0.78 : 0.36),
      entities: Array.from(new Set([moduleId, input.action, ...(input.entities || [])].filter(Boolean))),
    })
  } catch (error) {
    console.warn('[openbasaka-operation-history] failed to record operation:', error)
    return undefined
  }
}

export function recordOpenbasakaOperationQuietly(input: OpenbasakaOperationHistoryInput): void {
  recordOpenbasakaOperation(input).catch(() => {})
}
