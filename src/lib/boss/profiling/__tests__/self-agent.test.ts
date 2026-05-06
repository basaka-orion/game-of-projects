import { describe, expect, it } from 'vitest'
import { buildSelfAgentConstitution } from '../self-agent'
import type { NormalizedBossProfile } from '../types'

describe('self agent constitution', () => {
  it('creates delegation boundaries from normalized evidence', () => {
    const normalized: NormalizedBossProfile = {
      confidence: 0.78,
      evidenceTrace: [{
        source: 'matrix_reasoning',
        reference: '原创矩阵推理',
        insight: '得分 4/6',
        confidence: 0.72,
      }],
      pendingVerification: ['短测样本少，需要复测'],
      measurementNotes: ['原创矩阵短测不能换算正式 IQ'],
      summary: {
        headline: '系统建模者',
        narrative: '偏好结构化理解。',
        keyStrengths: ['抽象建模'],
        watchouts: ['避免无证据判断'],
        recommendedAgents: ['technical'],
        recommendedResearchTopics: ['题参估计'],
        recommendedProjectDirections: ['自我建模'],
        promptSummary: '先证据后结论',
      },
      dimensions: {
        cognition: { curiosity_breadth: 76, execution_discipline: 70 },
        personality: { preferred_style: 82, innovation_bias: 74 },
        emotion: { sensitivity: 55 },
        motivation: { long_term_drive: 80, execution_drive: 70 },
        social: { energy: 50 },
        aesthetic: { sensitivity: 62 },
        worldview: { meaning_drive: 82, risk_tolerance: 58 },
        strengths: { top: ['抽象建模'], risks: ['过度分析'] },
      },
      operational: {
        preferredStyle: 'analytical',
        riskTolerance: 58,
        innovationBias: 74,
        resourceStyle: 'balanced',
        decisionSpeed: 'analytical',
        excitementTriggers: ['复杂系统'],
        resonanceHooks: ['规则图谱'],
        explanationPreferences: ['先框架后案例'],
        addictiveFormats: ['规则表'],
        understandingModes: ['先定义问题'],
        antiPatterns: ['空泛判断'],
        integrationGoals: ['建立外脑'],
        shortTermGoals: ['闭环画像'],
        longTermVision: '未来代理人',
        currentFocus: '自我建模',
        interests: ['AI'],
        dislikes: ['空话'],
      },
      recommendations: {
        recommendedAgents: ['technical'],
        recommendedResearchTopics: ['题参估计'],
        recommendedProjectDirections: ['自我建模'],
      },
    }

    const constitution = buildSelfAgentConstitution(normalized, 'run-1')

    expect(constitution.sourceRunId).toBe('run-1')
    expect(constitution.evidenceLedger[0]).toContain('matrix_reasoning')
    expect(constitution.forbiddenZones.join(' ')).toContain('Raven APM')
    expect(constitution.mustAskUserTasks.join(' ')).toContain('医学')
    expect(constitution.delegableTasks.length).toBeGreaterThan(1)
  })
})
