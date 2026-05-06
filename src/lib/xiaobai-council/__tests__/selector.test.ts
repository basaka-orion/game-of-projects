import { describe, expect, it } from 'vitest'
import { analyzeCouncilProblem, selectCouncilTeam } from '../selector'

function uniquePersonaIds(ids: string[]): string[] {
  return Array.from(new Set(ids))
}

describe('xiaobai council selector', () => {
  it('selects a stable 5-7 member PRD council for app problems', () => {
    const selection = selectCouncilTeam('做一个 AI 项目管理应用，需要事无巨细 PRD、用户流程、技术实现和风险审查')
    const seatIds = selection.seats.map((seat) => seat.seat.id)
    const personaIds = selection.seats.map((seat) => seat.persona.id)

    expect(selection.seats.length).toBeGreaterThanOrEqual(5)
    expect(selection.seats.length).toBeLessThanOrEqual(7)
    expect(uniquePersonaIds(personaIds)).toHaveLength(personaIds.length)
    expect(seatIds).toEqual(expect.arrayContaining(['host', 'product-strategy', 'technical', 'user-market', 'critic', 'visual']))
    expect(selection.profile.artifactIntent).toBe('prd')
    expect(selection.matchGate.explanation.join('\n')).toContain('匹配闸门')
    expect(selection.matchGate.finalTeam).toHaveLength(selection.seats.length)
    expect(selection.matchGate.decisionSource).toBe('local-fallback')
    expect(selection.matchGate.judgeSummary).toContain('本地规则评分')
    expect(selection.seats[0].scoreFactors.nuwaCredibility).toBeGreaterThan(0)
  })

  it('adds evidence and cross-domain coverage for complex real-world research problems', () => {
    const selection = selectCouncilTeam(
      '我要解决一个复杂跨界平台问题，需要真实世界资讯、市场证据、技术架构、视觉图文解说和高风险审查',
      { maxMembers: 7 },
    )

    expect(selection.profile.difficulty).toBeGreaterThanOrEqual(4)
    expect(selection.profile.needsEvidence).toBe(true)
    expect(selection.profile.needsEngineering).toBe(true)
    expect(selection.profile.needsVisual).toBe(true)
    expect(selection.seats.some((seat) => seat.seat.id === 'research')).toBe(true)
    expect(selection.seats.length).toBeLessThanOrEqual(7)
    expect(selection.matchGate.readiness.evidenceStrength).toContain('证据')
    expect(selection.matchGate.collaborationMatrix.length).toBeGreaterThan(0)
  })

  it('keeps visual and Baoyu/Remotion skills visible for visual explanation requests', () => {
    const profile = analyzeCouncilProblem('给我做 Baoyu 图文卡、信息图、Remotion 动效和小白秒懂漫画分镜')
    const selection = selectCouncilTeam('给我做 Baoyu 图文卡、信息图、Remotion 动效和小白秒懂漫画分镜')
    const visualSeat = selection.seats.find((seat) => seat.seat.id === 'visual')

    expect(profile.needsVisual).toBe(true)
    expect(visualSeat).toBeTruthy()
    expect(visualSeat?.persona.artifactStrengths).toEqual(
      expect.arrayContaining([expect.stringMatching(/baoyu-visuals|remotion-motion|visual-brief/)]),
    )
  })
})
