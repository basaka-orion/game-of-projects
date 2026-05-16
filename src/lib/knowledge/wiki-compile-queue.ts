import { dbSaveOperatingEvent } from '../db/repository'
import type { OperatingLoopSourceRef } from '../operating-loop'

export type WikiCompileQueueTrigger =
  | 'archive-message'
  | 'archive-inbox-confirm'
  | 'archive-inbox-bulk'
  | 'manual'
  | 'wanxiang-absorption'
  | 'wanxiang-archive'

export interface WikiCompileQueueRequest {
  id?: string
  trigger: WikiCompileQueueTrigger
  candidateIds?: string[]
  drawerIds?: string[]
  sourceIds?: string[]
  sourceKind?: OperatingLoopSourceRef['kind']
  sourceId?: string
  sourceTitle?: string
  count?: number
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const result: string[] = []
  for (const value of values) {
    const normalized = typeof value === 'string' ? value.trim() : ''
    if (!normalized || result.includes(normalized)) continue
    result.push(normalized)
  }
  return result
}

function normalizeIdPart(value: string): string {
  return value.replace(/[^\w.-]+/g, '_').slice(0, 120)
}

function buildQueueEventId(request: WikiCompileQueueRequest, candidateIds: string[]): string {
  if (request.id) return request.id
  if (candidateIds.length === 1) return `op_wiki_compile_queue_${normalizeIdPart(candidateIds[0])}`
  return `op_wiki_compile_queue_${request.trigger}_${Date.now().toString(36)}`
}

export async function requestWikiCompile(request: WikiCompileQueueRequest): Promise<string> {
  const candidateIds = uniqueStrings(request.candidateIds || [])
  const drawerIds = uniqueStrings(request.drawerIds || [])
  const sourceIds = uniqueStrings(request.sourceIds || [])
  const count = Math.max(request.count || 0, candidateIds.length, drawerIds.length, sourceIds.length, 1)
  const sourceId = request.sourceId || sourceIds[0] || drawerIds[0] || candidateIds[0] || request.trigger
  const isBulk = count > 1

  return dbSaveOperatingEvent({
    id: buildQueueEventId(request, candidateIds),
    type: 'agent_action',
    stage: 'compile',
    agentId: 'wiki-compiler',
    title: isBulk ? `Wiki 编译队列已接收 ${count} 条新归档` : 'Wiki 编译队列已接收新归档',
    status: 'queued',
    toolRefs: ['wiki-compiler', 'mempalace_drawers', 'wiki_sources'],
    resultPreview: isBulk
      ? `${count} 条归档已经进入待编译池；下一次手动或定时 Wiki 编译会处理这些 drawer。`
      : '这条归档已经进入待编译池；下一次手动或定时 Wiki 编译会处理这个 drawer。',
    source: {
      kind: request.sourceKind || 'qimeng',
      sourceId,
      title: request.sourceTitle || '启蒙归档',
    },
    confidence: 0.78,
    entities: uniqueStrings([...sourceIds, ...drawerIds, ...candidateIds]).slice(0, 20),
  })
}
