import { describe, expect, it } from 'vitest'
import { computeVisionAlignmentReport } from '../alignment'
import type { VisionAlignmentInput } from '../alignment'

function createInput(overrides: Partial<VisionAlignmentInput> = {}): VisionAlignmentInput {
  return {
    projects: [],
    taxonomies: {},
    synapses: [],
    bossState: null,
    bossMemoryCount: 0,
    wikiPageCount: 0,
    wikiSourceCount: 0,
    drawerCount: 0,
    uncompiledDrawerCount: 0,
    wingCount: 0,
    skillEvolutionCount: 0,
    scheduledTaskCount: 0,
    teamCount: 0,
    customAgentCount: 0,
    ...overrides,
  }
}

describe('computeVisionAlignmentReport', () => {
  it('scores a mature system as building-to-strong and surfaces breakthrough work', () => {
    const input = createInput({
      projects: [
        {
          id: 'p1',
          title: 'Agent OS',
          oneLiner: '个人操作系统',
          tags: ['AI', '系统'],
          radar: {
            era_fit: 82,
            boss_match: 88,
            monetization: 72,
            tech_breakthrough: 86,
            resource_cost: 48,
            risk_index: 40,
          },
          survivalRate: 78,
          survivalGrade: 'A',
          summary: '',
          recommendation: '',
          warLogs: [],
          rawContent: '',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'p2',
          title: 'Knowledge Forge',
          oneLiner: '知识编译器',
          tags: ['Wiki'],
          radar: {
            era_fit: 76,
            boss_match: 70,
            monetization: 64,
            tech_breakthrough: 75,
            resource_cost: 55,
            risk_index: 46,
          },
          survivalRate: 69,
          survivalGrade: 'B',
          summary: '',
          recommendation: '',
          warLogs: [],
          rawContent: '',
          createdAt: '',
          updatedAt: '',
        },
      ],
      taxonomies: {
        p1: {
          taxonomy: {
            industry: 'AI/ML',
            subIndustry: 'Agent',
            techStack: [],
            businessModel: 'subscription',
            marketSize: 'large',
            stage: 'build',
            innovationType: 'platform',
            complexity: 70,
            timeToMarket: '6-12 months',
            resourceRequirements: 'moderate',
          },
          analysis: {
            strengths: ['系统性强', 'Boss 适配度高'],
            weaknesses: ['范围较大'],
            opportunities: ['可以连接其它项目'],
            threats: [],
            eraRelevance: 84,
            breakthroughPotential: 87,
            differentiation: 80,
          },
        },
        p2: {
          taxonomy: {
            industry: 'Knowledge',
            subIndustry: 'Wiki',
            techStack: [],
            businessModel: 'internal',
            marketSize: 'mid',
            stage: 'build',
            innovationType: 'workflow',
            complexity: 62,
            timeToMarket: '3-6 months',
            resourceRequirements: 'lean',
          },
          analysis: {
            strengths: ['知识沉淀能力强'],
            weaknesses: ['需要更强自动化'],
            opportunities: ['可成为项目总中枢'],
            threats: [],
            eraRelevance: 72,
            breakthroughPotential: 74,
            differentiation: 76,
          },
        },
      },
      synapses: [
        {
          id: 's1',
          source_id: 'p1',
          target_id: 'p2',
          type: 'synergistic',
          strength: 82,
          reason: '知识编译器可为 Agent OS 提供长期记忆与知识积累',
          action_items_json: '[]',
          created_at: '',
        },
      ],
      bossState: {
        name: 'Boss',
        interests: ['AI', '系统设计', '创作'],
        dislikes: ['重复劳动'],
        preferredStyle: 'visionary',
        riskTolerance: 68,
        innovationBias: 76,
        resourceStyle: 'balanced',
        conversationStyle: '',
        decisionSpeed: 'analytical',
        recurringThemes: ['做成外脑系统'],
        cognitivePatterns: [],
        communicationPreferences: [],
        domainExpertise: [],
        cognitiveProfile: {
          excitementTriggers: ['跨学科连接'],
          resonanceHooks: ['模式'],
          explanationPreferences: ['框架化'],
          addictiveFormats: ['知识地图'],
          understandingModes: ['先总后分'],
          antiPatterns: ['空话'],
          integrationGoals: ['外脑系统'],
          mission: '把知识转译成可并入自身认知体系的形态',
        },
        shortTermGoals: ['完成外脑闭环'],
        longTermVision: '建立自己的智能系统',
        currentFocus: '',
        profilingHeadline: '愿景牵引型 Boss',
        profilingSummaryText: '风格: 愿景牵引 | 兴趣: AI、系统设计、创作',
        projectsEvaluated: 5,
        projectsPursued: 2,
        projectsAbandoned: 0,
        projectsPivoted: 1,
        averageSurvivalOfChosen: 74,
      },
      bossMemoryCount: 16,
      wikiPageCount: 18,
      wikiSourceCount: 12,
      drawerCount: 24,
      uncompiledDrawerCount: 3,
      wingCount: 5,
      skillEvolutionCount: 6,
      scheduledTaskCount: 3,
      teamCount: 2,
      customAgentCount: 4,
    })

    const report = computeVisionAlignmentReport(input)

    expect(report.overallScore).toBeGreaterThanOrEqual(60)
    expect(report.pillars.find(pillar => pillar.id === 'project_intelligence')?.status).not.toBe('lagging')
    expect(report.projectInsights[0]?.title).toContain('突破候选')
    expect(report.portfolioBreakthroughs.length).toBeGreaterThan(0)
  })

  it('marks an empty system as lagging and points to missing loops', () => {
    const report = computeVisionAlignmentReport(createInput())

    expect(report.overallScore).toBeLessThan(45)
    expect(report.pillars.every(pillar => pillar.status === 'lagging')).toBe(true)
    expect(report.portfolioGaps).toContain('系统还没有承载真实项目样本，很多高级能力暂时无从发挥')
    expect(report.nextActions).toContain('把研究、编译、回顾和提醒变成自动化任务，建立真正的学习闭环')
  })
})
