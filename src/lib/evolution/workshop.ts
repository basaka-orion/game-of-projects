import { query } from '../db/repository'

export interface EvolutionEvent {
  id: string
  sourceKind: string
  sourceId: string
  eventType: string
  learnedWhat: string
  evidence: Array<Record<string, unknown>>
  suggestedSynapses: Array<Record<string, unknown>>
  suggestedSkillPatternIds: string[]
  confidence: number
  nextAction: string
  status: 'pending' | 'accepted' | 'dismissed' | 'applied'
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

function safeParseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function safeParseArray(value: string): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : []
  } catch {
    return []
  }
}

function safeParseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

export async function listEvolutionEvents(limit = 8): Promise<EvolutionEvent[]> {
  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT *
         FROM evolution_events
        ORDER BY updated_at DESC
        LIMIT ?`,
      [limit],
    )

    return rows.map((row) => ({
      id: (row.id as string) || '',
      sourceKind: (row.source_kind as string) || '',
      sourceId: (row.source_id as string) || '',
      eventType: (row.event_type as string) || '',
      learnedWhat: (row.learned_what as string) || '',
      evidence: safeParseArray((row.evidence_json as string) || '[]'),
      suggestedSynapses: safeParseArray((row.suggested_synapses_json as string) || '[]'),
      suggestedSkillPatternIds: safeParseStringArray((row.suggested_skill_pattern_ids_json as string) || '[]'),
      confidence: (row.confidence as number) || 0,
      nextAction: (row.next_action as string) || '',
      status: ((row.status as string) || 'pending') as EvolutionEvent['status'],
      metadata: safeParseObject((row.metadata_json as string) || '{}'),
      createdAt: (row.created_at as string) || '',
      updatedAt: (row.updated_at as string) || '',
    }))
  } catch {
    return []
  }
}
