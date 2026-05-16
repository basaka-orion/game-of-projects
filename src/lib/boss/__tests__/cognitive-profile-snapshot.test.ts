import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dbListOperatingEvents } from '../../db/repository'
import type { CognitiveProfile } from '../cognitive-profile'
import {
  buildCognitiveProfileSnapshot,
  diffCognitiveProfile,
  listCognitiveProfileSnapshots,
  restoreCognitiveProfileSnapshot,
  saveCognitiveProfileSnapshot,
} from '../cognitive-profile-snapshot'

function createStorage() {
  const data = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key)
    }),
    clear: vi.fn(() => {
      data.clear()
    }),
  }
}

const previousProfile: CognitiveProfile = {
  mission: '旧使命',
  excitementTriggers: ['闭环'],
  resonanceHooks: ['张力'],
  explanationPreferences: ['短句'],
  addictiveFormats: ['路线图'],
  understandingModes: ['分层'],
  antiPatterns: ['空泛'],
  integrationGoals: ['外脑'],
}

const nextProfile: CognitiveProfile = {
  ...previousProfile,
  mission: '本地优先个人认知操作系统',
  antiPatterns: ['空泛', '过拟合'],
}

describe('Boss cognitive profile snapshots', () => {
  beforeEach(() => {
    const localStorage = createStorage()
    vi.stubGlobal('localStorage', localStorage)
    vi.stubGlobal('window', { localStorage })
  })

  it('builds reviewable profile diffs with affected surfaces', () => {
    expect(diffCognitiveProfile(previousProfile, nextProfile)).toEqual(['mission', 'antiPatterns'])

    const snapshot = buildCognitiveProfileSnapshot({
      id: 'snapshot_1',
      previousProfile,
      profile: nextProfile,
      source: 'manual_edit',
      affectedTargets: ['WarRoom', 'Knowledge Query'],
      confidence: 0.91,
      createdAt: '2026-05-08T00:00:00.000Z',
    })

    expect(snapshot.changedKeys).toEqual(['mission', 'antiPatterns'])
    expect(snapshot.affectedTargets).toEqual(['WarRoom', 'Knowledge Query'])
    expect(snapshot.confidence).toBe(0.91)
  })

  it('persists snapshots and emits review-required Boss events in fallback storage', async () => {
    const snapshot = await saveCognitiveProfileSnapshot({
      id: 'snapshot_2',
      previousProfile,
      profile: nextProfile,
      source: 'manual_edit',
      affectedTargets: ['WarRoom'],
    })
    const snapshots = await listCognitiveProfileSnapshots(3)
    const events = await dbListOperatingEvents(3)

    expect(snapshot.id).toBe('snapshot_2')
    expect(snapshots[0]).toMatchObject({ id: 'snapshot_2', changedKeys: ['mission', 'antiPatterns'] })
    expect(events[0].source_title).toBe('cognitive_profile_manual_edit')
    expect(JSON.parse(events[0].payload_json)).toMatchObject({
      bossProfileImpact: 'high',
      reviewRequired: true,
    })
  })

  it('restores a snapshot back into boss_profile.cognitive_profile_json', async () => {
    await saveCognitiveProfileSnapshot({
      id: 'snapshot_restore',
      previousProfile,
      profile: nextProfile,
      source: 'manual_edit',
      affectedTargets: ['WarRoom'],
    })

    const restored = await restoreCognitiveProfileSnapshot('snapshot_restore')
    const storedProfile = JSON.parse(localStorage.getItem('gop_boss_profile') || '{}') as Record<string, string>

    expect(restored?.mission).toBe('本地优先个人认知操作系统')
    expect(JSON.parse(storedProfile.cognitive_profile_json || '{}')).toMatchObject({
      mission: '本地优先个人认知操作系统',
    })
  })
})
