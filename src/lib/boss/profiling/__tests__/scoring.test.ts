import { describe, expect, it } from 'vitest'
import type { ParsedPRD } from '../../../ai/prd-parser'
import type { RadarScores } from '../../../ai/war-room'
import type { BossState } from '../../profile'
import { scoreBossProjectFit } from '../scoring'

function buildBossState(overrides: Partial<BossState> = {}): BossState {
  return {
    name: 'Boss',
    interests: ['AI', '系统设计', '自动化'],
    dislikes: ['纯流量生意'],
    preferredStyle: 'analytical',
    riskTolerance: 60,
    innovationBias: 72,
    resourceStyle: 'balanced',
    conversationStyle: '',
    decisionSpeed: 'analytical',
    recurringThemes: [],
    cognitivePatterns: [],
    communicationPreferences: [],
    domainExpertise: [],
    cognitiveProfile: {
      excitementTriggers: ['第一性原理', 'Agent'],
      resonanceHooks: ['工作流'],
      explanationPreferences: ['框架优先'],
      addictiveFormats: [],
      understandingModes: [],
      antiPatterns: ['空泛'],
      integrationGoals: ['构建自己的智能系统'],
      mission: '让系统真正理解自己',
    },
    shortTermGoals: ['搭建研究闭环'],
    longTermVision: '构建自己的智能系统',
    currentFocus: 'AI Agent 工作流',
    profilingHeadline: '系统型建造者',
    profilingSummaryText: '偏好 AI、系统设计、自动化，正在聚焦 Agent 工作流。',
    projectsEvaluated: 0,
    projectsPursued: 0,
    projectsAbandoned: 0,
    projectsPivoted: 0,
    averageSurvivalOfChosen: 0,
    ...overrides,
  }
}

function buildPRD(overrides: Partial<ParsedPRD> = {}): ParsedPRD {
  return {
    title: 'AI Agent Workflow Studio',
    oneLiner: '面向创作者的多 Agent 工作流搭建平台',
    targetAudience: '独立开发者与研究型创作者',
    painPoint: '复杂流程难以自动化，研究碎片无法形成闭环',
    businessModel: '订阅制 SaaS',
    techStack: ['AI', 'workflow', 'automation'],
    competitors: ['Zapier', 'n8n'],
    uniqueValue: '把 Agent 编排、知识沉淀和决策推演放进一个系统',
    risks: ['模型稳定性'],
    tags: ['agent', '系统设计'],
    ...overrides,
  }
}

describe('boss project fit scoring', () => {
  it('should raise boss match when project strongly aligns with profiling', () => {
    const boss = buildBossState()
    const radar: RadarScores = {
      era_fit: 70,
      boss_match: 58,
      monetization: 62,
      tech_breakthrough: 76,
      resource_cost: 52,
      risk_index: 55,
    }

    const breakdown = scoreBossProjectFit(boss, buildPRD(), radar)

    expect(breakdown.matchedInterests).toContain('AI')
    expect(breakdown.matchedFocus.length).toBeGreaterThan(0)
    expect(breakdown.structuredScore).toBeGreaterThan(70)
    expect(breakdown.finalScore).toBeGreaterThan(breakdown.llmScore)
  })

  it('should apply dislike penalty when project enters a known red zone', () => {
    const boss = buildBossState()
    const radar: RadarScores = {
      era_fit: 70,
      boss_match: 64,
      monetization: 70,
      tech_breakthrough: 45,
      resource_cost: 40,
      risk_index: 38,
    }

    const breakdown = scoreBossProjectFit(
      boss,
      buildPRD({
        title: '纯流量变现工厂',
        oneLiner: '围绕短视频流量套利的自动化系统',
        uniqueValue: '快速复制流量打法',
        tags: ['流量', '自动化'],
      }),
      radar
    )

    expect(breakdown.dislikePenalty).toBeGreaterThan(0)
    expect(breakdown.reasons.some(reason => reason.includes('潜在禁区'))).toBe(true)
  })
})
