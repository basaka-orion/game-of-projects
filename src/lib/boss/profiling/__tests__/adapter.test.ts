import { describe, expect, it } from 'vitest'
import { buildQuickProfilingResult, normalizeProfilingResult } from '../adapter'

describe('boss profiling adapter', () => {
  it('should normalize quick profiling answers into operational boss profile', () => {
    const external = buildQuickProfilingResult({
      name: 'Boss',
      interests: ['AI', '系统设计', '创作'],
      dislikes: ['空话'],
      longTermVision: '建立自己的智能系统',
      currentFocus: '先把外脑闭环跑通',
      workStyle: 'analytical',
      riskTolerance: 62,
      innovationBias: 74,
      socialEnergy: 48,
      executionDiscipline: 81,
      emotionalSensitivity: 57,
      aestheticSensitivity: 68,
      curiosityBreadth: 77,
      worldviewDrive: 84,
      excitementTriggers: ['第一性原理', '跨学科连接'],
      explanationPreferences: ['先框架后案例'],
      antiPatterns: ['空话', '无证据判断'],
    })

    const normalized = normalizeProfilingResult(external)

    expect(normalized.operational.preferredStyle).toBe('analytical')
    expect(normalized.operational.shortTermGoals).toContain('先把外脑闭环跑通')
    expect(normalized.operational.integrationGoals[0]).toContain('建立自己的智能系统')
    expect(normalized.summary.headline).toContain('Boss')
    expect(normalized.summary.recommendedAgents.length).toBeGreaterThan(0)
    expect(normalized.dimensions.strengths.top.length).toBeGreaterThan(0)
  })
})
