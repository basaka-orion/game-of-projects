import { dbSaveOperatingEvent } from '../db/repository'

export const BOSS_COGNITION_CONTEXT_TARGETS = [
  'Openbasaka',
  'Knowledge Query',
  'Teams',
  'WarRoom',
  'Telegram Bot',
  'XiaoBai Diagnose',
] as const

export type BossCognitionContextTarget = (typeof BOSS_COGNITION_CONTEXT_TARGETS)[number]

export interface BossCognitionImpactEvent {
  runId?: string
  changedKeys?: string[]
  source?: 'profiling_apply' | 'manual_edit'
  confidence?: number
}

export function formatBossCognitionTargets(
  targets: readonly BossCognitionContextTarget[] = BOSS_COGNITION_CONTEXT_TARGETS,
): string {
  return targets.join('、')
}

export async function recordBossCognitionImpact(event: BossCognitionImpactEvent = {}): Promise<string> {
  const changedKeys = (event.changedKeys || []).filter(Boolean)
  const source = event.source || 'manual_edit'
  const targets = formatBossCognitionTargets()

  return dbSaveOperatingEvent({
    id: `op_boss_cognition_${event.runId || source}_${Date.now().toString(36)}`,
    type: 'boss_signal',
    stage: 'understand',
    signalKind: 'cognitive_style',
    summary:
      changedKeys.length > 0
        ? `Boss 认知画像已更新：${changedKeys.join('、')}。影响入口：${targets}。`
        : `Boss 认知画像已更新。影响入口：${targets}。`,
    profileImpact: 'high',
    source: {
      kind: source === 'profiling_apply' ? 'agent' : 'manual',
      sourceId: event.runId || source,
      title: source === 'profiling_apply' ? '画像工坊' : 'Boss 手动画像',
    },
    confidence: event.confidence ?? 0.86,
    entities: [...changedKeys, ...BOSS_COGNITION_CONTEXT_TARGETS].slice(0, 20),
  })
}
