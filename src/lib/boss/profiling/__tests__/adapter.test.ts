import { describe, expect, it } from 'vitest'
import { getMatrixReasoningItems, scoreMatrixSession } from '../../../../features/profiling-studio/engine/matrix-reasoning'
import {
  buildMatrixReasoningProfilingResult,
  buildQuickProfilingResult,
  normalizeProfilingResult,
} from '../adapter'
import type { MatrixResponse } from '../../../../features/profiling-studio/types'

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

  it('should normalize original matrix reasoning into evidence-backed boss profile', () => {
    const items = getMatrixReasoningItems()
    const responses: MatrixResponse[] = items.map((item, index) => ({
      itemId: item.id,
      selectedOptionId: index < 4 ? item.correctOptionId : item.options.find(option => option.id !== item.correctOptionId)?.id || item.correctOptionId,
      correctOptionId: item.correctOptionId,
      isCorrect: index < 4,
      responseTimeMs: 1800 + index * 300,
      answeredAt: '2026-05-05T00:00:00.000Z',
    }))
    const result = scoreMatrixSession(responses, items, '2026-05-05T00:05:00.000Z')
    const external = buildMatrixReasoningProfilingResult(result)

    const normalized = normalizeProfilingResult(external)

    expect(normalized.evidenceTrace?.[0]?.source).toBe('matrix_reasoning')
    expect(normalized.measurementNotes?.join(' ')).toContain('不复制 Pearson Raven APM 原题')
    expect(normalized.pendingVerification?.join(' ')).toContain('不能换算 Raven APM')
    expect(normalized.dimensions.cognition.fluid_reasoning).toBeGreaterThan(50)
    expect(normalized.operational.antiPatterns).toContain('矩阵推理不能替代真实项目中的长期判断与执行证据')
  })
})
