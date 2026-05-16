import { dbSaveOperatingEvent } from '../db/repository'
import { getBossProfile, setBossProfile } from '../db/store'
import type { CognitiveProfile } from './cognitive-profile'

const STORAGE_KEY = 'gop_cognitive_profile_snapshots'

export interface CognitiveProfileSnapshot {
  id: string
  profile: CognitiveProfile
  previousProfile?: CognitiveProfile
  changedKeys: Array<keyof CognitiveProfile>
  source: string
  affectedTargets: string[]
  confidence: number
  createdAt: string
}

export function diffCognitiveProfile(
  previousProfile: CognitiveProfile,
  profile: CognitiveProfile,
): Array<keyof CognitiveProfile> {
  return (Object.keys(profile) as Array<keyof CognitiveProfile>).filter((key) => {
    return JSON.stringify(previousProfile[key]) !== JSON.stringify(profile[key])
  })
}

export function buildCognitiveProfileSnapshot(input: {
  id?: string
  previousProfile?: CognitiveProfile
  profile: CognitiveProfile
  source: string
  affectedTargets?: string[]
  confidence?: number
  createdAt?: string
}): CognitiveProfileSnapshot {
  return {
    id: input.id || `cog_snapshot_${Date.now().toString(36)}`,
    previousProfile: input.previousProfile,
    profile: input.profile,
    changedKeys: input.previousProfile ? diffCognitiveProfile(input.previousProfile, input.profile) : (Object.keys(input.profile) as Array<keyof CognitiveProfile>),
    source: input.source,
    affectedTargets: input.affectedTargets || [],
    confidence: input.confidence ?? 0.78,
    createdAt: input.createdAt || new Date().toISOString(),
  }
}

function loadSnapshots(): CognitiveProfileSnapshot[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as CognitiveProfileSnapshot[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveSnapshots(snapshots: CognitiveProfileSnapshot[]) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots.slice(0, 80)))
}

export async function saveCognitiveProfileSnapshot(input: {
  id?: string
  previousProfile?: CognitiveProfile
  profile: CognitiveProfile
  source: string
  affectedTargets?: string[]
  confidence?: number
}): Promise<CognitiveProfileSnapshot> {
  const snapshot = buildCognitiveProfileSnapshot(input)
  const snapshots = loadSnapshots().filter((item) => item.id !== snapshot.id)
  saveSnapshots([snapshot, ...snapshots].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
  await dbSaveOperatingEvent({
    id: `op_cognitive_profile_${snapshot.id}`,
    type: 'boss_signal',
    stage: 'review',
    signalKind: 'cognitive_style',
    summary: `Boss 认知画像快照待复核：${snapshot.changedKeys.join('、') || '无变化'}`,
    profileImpact: snapshot.changedKeys.length > 0 ? 'high' : 'low',
    source: { kind: 'manual', sourceId: snapshot.id, title: `cognitive_profile_${snapshot.source}` },
    confidence: snapshot.confidence,
    entities: ['cognitive-profile', ...snapshot.changedKeys.map(String), ...snapshot.affectedTargets],
    bossProfileImpact: snapshot.changedKeys.length > 0 ? 'high' : 'low',
    reviewRequired: true,
  } as never)
  return snapshot
}

export async function listCognitiveProfileSnapshots(limit = 12): Promise<CognitiveProfileSnapshot[]> {
  return loadSnapshots()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
}

export async function restoreCognitiveProfileSnapshot(id: string): Promise<CognitiveProfile | undefined> {
  const snapshot = loadSnapshots().find((item) => item.id === id)
  if (!snapshot) return undefined
  setBossProfile({
    ...getBossProfile(),
    cognitive_profile_json: JSON.stringify(snapshot.profile),
  })
  return snapshot.profile
}
