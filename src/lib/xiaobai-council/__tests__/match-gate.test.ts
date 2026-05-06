import { describe, expect, it, vi } from 'vitest'
import { runCouncilMatchGate } from '../match-gate'
import { selectCouncilTeam } from '../selector'
import type { CouncilCreativeEnhancement } from '../creative-enhancement'

const creativeEnhancement: CouncilCreativeEnhancement = {
  creativeDnaSummary: 'Boss 喜欢高密度、强审美、能落地的系统型作品。',
  source: 'fallback',
  phaseContributions: {},
  artifactPrompts: ['哲思内核', '首版验证实验'],
  promptFragment: '## 创意孵化器增强输入\n- mock',
}

describe('xiaobai council deep match gate', () => {
  it('emits six completed progress phases and returns a deep-model judged selection', async () => {
    const problem = '做一个 AI 项目管理应用，需要事无巨细 PRD、用户流程、技术实现和风险审查'
    const local = selectCouncilTeam(problem)
    const events: any[] = []
    const judgeCompletion = vi.fn(async (_prompt: string) =>
      JSON.stringify({
        judgeSummary: '保留本地最高互补阵容，并强化反方与视觉席位。',
        finalTeam: local.seats.map((seat) => ({
          seatId: seat.seat.id,
          personaId: seat.persona.id,
          reasons: [`${seat.persona.shortName} 命中 ${seat.seat.label}`, '与其他席位互补'],
        })),
        alternatePersonaIds: local.alternates.slice(0, 3).map((seat) => seat.persona.id),
        explanation: ['模型裁判复核候选池', '保留冲突与互补关系'],
      }),
    )

    const selection = await runCouncilMatchGate(
      {
        problem,
        creativeEnhancement,
        uiStyleContext: null,
        runtimeWisdomContext: {
          historyCount: 1,
          confidence: 0.7,
          lastRunId: 'run-before',
          intelligenceSignals: [],
          avoidRepeating: ['不要重复 local-fallback。'],
          nextRunConstraints: ['必须完整 stage trace。'],
          requiredProof: ['必须保存 runtime history record。'],
          promptFragment: '## 运行智慧反馈\n上一轮 fallback，需要复验。',
          summary: '已从 1 次运行学习。',
        },
        runtimeCalibrationPlan: {
          score: 62,
          status: 'needs-baseline',
          label: '需要第一条真实深度基线',
          summary: '需要第一条真实深度基线。当前校准分 62/100。',
          checks: [],
          nextDeepRunProtocol: ['必须完整运行 2-5 分钟。'],
          userValidationProtocol: ['必须 5-8 人稳审真实小白验证。'],
          stopConditions: ['fallback 停止 95 认证。'],
          modelRunInputHints: [],
          promptFragment: '## 95 真实长跑评测协议\n需要第一条真实深度基线。',
        },
      },
      { judgeCompletion, onProgress: (event) => events.push(event) },
    )

    expect(judgeCompletion).toHaveBeenCalledTimes(1)
    expect(judgeCompletion).toHaveBeenCalledWith(expect.stringContaining('运行智慧反馈'))
    expect(judgeCompletion).toHaveBeenCalledWith(expect.stringContaining('上一轮 fallback'))
    expect(judgeCompletion).toHaveBeenCalledWith(expect.stringContaining('95 真实长跑评测协议'))
    expect(selection.matchGate.decisionSource).toBe('deep-model')
    expect(selection.matchGate.judgeSummary).toContain('最高互补阵容')
    expect(selection.matchGate.stageTrace).toHaveLength(6)
    expect(selection.matchGate.stageTrace.every((event) => event.status === 'completed')).toBe(true)
    expect(selection.matchGate.stageTrace.map((event) => event.phaseId)).toEqual([
      'problem-profile',
      'creative-dna',
      'candidate-pool',
      'model-judge',
      'collaboration-matrix',
      'recommendation',
    ])
    expect(events.some((event) => event.status === 'running' && event.phaseId === 'model-judge')).toBe(true)
  })

  it('falls back to local selection when the model judge returns invalid JSON', async () => {
    const problem = '给我做 Baoyu 图文卡、信息图、Remotion 动效和小白秒懂漫画分镜'
    const events: any[] = []
    const selection = await runCouncilMatchGate(
      { problem, creativeEnhancement, uiStyleContext: null },
      { judgeCompletion: vi.fn(async () => 'not json'), onProgress: (event) => events.push(event) },
    )

    expect(selection.matchGate.decisionSource).toBe('local-fallback')
    expect(selection.matchGate.judgeSummary).toContain('本地规则推荐')
    expect(selection.seats.length).toBeGreaterThanOrEqual(5)
    expect(selection.matchGate.stageTrace).toHaveLength(6)
    expect(events.some((event) => event.phaseId === 'model-judge' && event.status === 'failed')).toBe(true)
  })

  it('repairs common missing-comma JSON from model judge before falling back', async () => {
    const problem = '重构人生规划智能系统，需要产品、工程、风险、视觉和小白解释协作'
    const local = selectCouncilTeam(problem)
    const valid = JSON.stringify({
      judgeSummary: '模型裁判输出少了一个逗号，但语义完整，应该被修复。',
      finalTeam: local.seats.map((seat) => ({
        seatId: seat.seat.id,
        personaId: seat.persona.id,
        reasons: [`${seat.persona.shortName} 负责 ${seat.seat.label}`],
      })),
      alternatePersonaIds: local.alternates.slice(0, 3).map((seat) => seat.persona.id),
      explanation: ['保留主持、技术、产品、反方和视觉表达。'],
    })
    const malformed = valid.replace('},{"seatId"', '}{"seatId"')
    const events: any[] = []

    const selection = await runCouncilMatchGate(
      { problem, creativeEnhancement, uiStyleContext: null },
      { judgeCompletion: vi.fn(async () => malformed), onProgress: (event) => events.push(event) },
    )

    expect(selection.matchGate.decisionSource).toBe('deep-model')
    expect(selection.matchGate.judgeSummary).toContain('少了一个逗号')
    expect(selection.matchGate.stageTrace).toHaveLength(6)
    expect(selection.matchGate.stageTrace.every((event) => event.status === 'completed')).toBe(true)
    expect(events.some((event) => event.phaseId === 'model-judge' && event.status === 'failed')).toBe(false)
  })
})
