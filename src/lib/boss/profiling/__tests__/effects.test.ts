import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedBossProfile } from '../types'

const mocks = vi.hoisted(() => ({
  dbSaveBossProfileSnapshot: vi.fn(),
  dbSaveMemory: vi.fn(),
  run: vi.fn(),
  getBossProfile: vi.fn(),
  setBossProfile: vi.fn(),
  saveAnchor: vi.fn(),
  recordBossCognitionImpact: vi.fn(),
  memorize: vi.fn(),
}))

vi.mock('../../../db/repository', () => ({
  dbSaveBossProfileSnapshot: mocks.dbSaveBossProfileSnapshot,
  dbSaveMemory: mocks.dbSaveMemory,
  run: mocks.run,
}))

vi.mock('../../../db/store', () => ({
  getBossProfile: mocks.getBossProfile,
  setBossProfile: mocks.setBossProfile,
}))

vi.mock('../../anchor', () => ({
  saveAnchor: mocks.saveAnchor,
}))

vi.mock('../../cognition-impact', () => ({
  recordBossCognitionImpact: mocks.recordBossCognitionImpact,
}))

vi.mock('../../../memory/mempalace', () => ({
  memorize: mocks.memorize,
}))

function makeNormalized(): NormalizedBossProfile {
  return {
    confidence: 0.8,
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
}

describe('profiling writeback effects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getBossProfile.mockReturnValue({})
    mocks.dbSaveBossProfileSnapshot.mockResolvedValue('snapshot-1')
    mocks.dbSaveMemory.mockResolvedValue('memory-1')
    mocks.run.mockResolvedValue(undefined)
    mocks.recordBossCognitionImpact.mockResolvedValue(undefined)
    mocks.memorize.mockResolvedValue('drawer-1')
  })

  it('writes Boss profile, boss_memory, MemPalace drawer, and self-agent constitution', async () => {
    const { applyNormalizedBossProfile } = await import('../effects')

    await applyNormalizedBossProfile('run-1', makeNormalized())

    const writtenProfile = mocks.setBossProfile.mock.calls[0]?.[0] as Record<string, string>
    expect(writtenProfile.self_agent_constitution_json).toContain('未来代理人宪法')
    expect(writtenProfile.agent_delegation_policy_json).toContain('mustAskUserTasks')
    expect(writtenProfile.profiling_evidence_trace_json).toContain('matrix_reasoning')
    expect(mocks.dbSaveMemory).toHaveBeenCalledWith(
      'pattern',
      expect.stringContaining('未来代理人宪法'),
      'profiling:run-1:self-agent',
      0.8,
    )
    expect(mocks.memorize).toHaveBeenCalledWith(expect.objectContaining({
      wing: 'profiling',
      hall: 'self-modeling',
      room: 'report',
      source: 'auto',
      content: expect.stringContaining('source: profiling:run-1'),
      metadata: expect.objectContaining({
        sourceId: 'profiling:run-1',
        runId: 'run-1',
        kind: 'profiling_writeback',
        folderPath: 'profiling/self-modeling',
      }),
    }))
  })

  it('falls back to a direct profiling drawer write when MemPalace helper fails', async () => {
    mocks.memorize.mockRejectedValueOnce(new Error('helper failed'))
    const { applyNormalizedBossProfile } = await import('../effects')

    await applyNormalizedBossProfile('run-1', makeNormalized())

    expect(mocks.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO mempalace_drawers'),
      expect.arrayContaining([
        'profiling_run-1',
        '画像写回：系统建模者',
        expect.stringContaining('Self Agent Constitution'),
      ]),
    )
  })
})
