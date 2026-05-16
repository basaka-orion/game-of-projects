import { describe, expect, it, vi } from 'vitest'
import { buildCouncilWorkflowDraft, dispatchCouncilPrdToWorkflow } from '../workflow-dispatch'
import type { CouncilPrdRunResult } from '../workflow'

const workflowStudioMock = vi.hoisted(() => ({
  saveWorkflowStudioItem: vi.fn(async (draft: any) => draft.id || 'wfs_mock'),
  generatePromptTemplateFromWorkflow: vi.fn((params: any) => [
    `workflow:${params.name}`,
    `goal:${params.goal}`,
    `steps:${params.steps.join(' / ')}`,
    '{{input}}',
  ].join('\n')),
}))

const repositoryMock = vi.hoisted(() => ({
  dbSaveOperatingEvent: vi.fn(async (draft: any) => draft.id || 'op_mock'),
}))

vi.mock('../../workflow/studio', () => ({
  saveWorkflowStudioItem: workflowStudioMock.saveWorkflowStudioItem,
  generatePromptTemplateFromWorkflow: workflowStudioMock.generatePromptTemplateFromWorkflow,
}))

vi.mock('../../db/repository', () => ({
  dbSaveOperatingEvent: repositoryMock.dbSaveOperatingEvent,
}))

function resultFixture(): CouncilPrdRunResult {
  return {
    team: { id: 'team_weather_bag' },
    uiStyleContext: {
      styleIds: ['agentic-os', 'liquid-glass'],
      styleNames: ['Agentic OS', 'Liquid Glass'],
      reasoning: '天气包包 App 需要自主执行状态与轻盈 iOS 质感。',
      visual: {
        palette: ['#08130f', '#67e8f9'],
        background: '#08130f',
        surface: '#10231f',
        text: '#ecfeff',
        accent: '#67e8f9',
        border: '#1f6f68',
        radius: '16px',
        shadow: 'soft',
        pattern: 'cute',
        density: 'balanced',
        typography: 'rounded',
        motif: 'weather-ribbon',
        texture: 'glass',
        motion: 'soft checklist tick',
      },
      platformNotes: { web: '', ios: '', mac: '', android: '', mini: '' },
      componentStates: [],
      acceptanceChecklist: [],
      evolutionNotes: [],
      promptFragment: '## UI风格馆自动视觉输入\nAgentic OS / Liquid Glass',
    },
    qualityGate: {
      score: 92,
      finalGateStatus: 'approved',
    },
    runtimeEvidence: {
      runId: 'xiaobai-runtime-weather-bag',
    },
  } as unknown as CouncilPrdRunResult
}

describe('xiaobai council workflow dispatch', () => {
  it('builds a workflow draft that carries the PRD copy and UI museum DNA', () => {
    const draft = buildCouncilWorkflowDraft({
      problem: '我想做一款为女性出门在外，根据当地实际天气准备包包的 iOS app',
      result: resultFixture(),
      exportMarkdown: '# 包里晴雨签 iOS App｜小白智囊团大师共识 PRD\n\n## 产品定位与北极星\n真实天气包包清单。',
    })

    expect(draft.id).toBe('wfs_xiaobai_council_xiaobai-runtime-weather-bag')
    expect(draft.name).toContain('包里晴雨签 iOS App')
    expect(draft.goal).toContain('UI 风格馆 DNA：Agentic OS / Liquid Glass')
    expect(draft.promptTemplate).toContain('小白智囊团自动投递的超顶级 PRD 副本')
    expect(draft.promptTemplate).toContain('包里晴雨签 iOS App')
    expect(draft.steps.join('\n')).toContain('外发、删除、付款、账号、权限、密钥必须停给 Boss')
    expect(draft.targetConsumers).toEqual(['teams', 'knowledge', 'xiaobai'])
  })

  it('saves the workflow draft and writes an operating event receipt', async () => {
    workflowStudioMock.saveWorkflowStudioItem.mockClear()
    repositoryMock.dbSaveOperatingEvent.mockClear()

    const receipt = await dispatchCouncilPrdToWorkflow({
      problem: '女性天气包包 iOS app',
      result: resultFixture(),
      exportMarkdown: '# 包里晴雨签 PRD',
    })

    expect(receipt.workflowStudioId).toBe('wfs_xiaobai_council_xiaobai-runtime-weather-bag')
    expect(workflowStudioMock.saveWorkflowStudioItem).toHaveBeenCalledWith(expect.objectContaining({
      id: 'wfs_xiaobai_council_xiaobai-runtime-weather-bag',
      workflowType: 'prd',
    }))
    expect(repositoryMock.dbSaveOperatingEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'agent_action',
      stage: 'execute',
      agentId: 'xiaobai-council',
      toolRefs: expect.arrayContaining(['workflow_studio_items', 'operating_events', 'ui-museum']),
    }))
  })

  it('redacts secrets before saving a workflow copy', () => {
    const draft = buildCouncilWorkflowDraft({
      problem: '做 Soul.md 记忆宫殿 Mac App。deepseek-apikey：sk-1234567890abcdef1234567890abcdef',
      result: resultFixture(),
      exportMarkdown: [
        '# Soul.md 记忆宫殿 Mac App｜小白智囊团大师共识 PRD',
        'GLM5.1:5317add67a3e413e93cb818ca461bc9d.Bp7iy76Nz9CN3BFg',
      ].join('\n'),
    })

    expect(draft.name).toContain('Soul.md 记忆宫殿 Mac App')
    expect(draft.goal).not.toContain('sk-1234567890abcdef1234567890abcdef')
    expect(draft.promptTemplate).not.toContain('5317add67a3e413e93cb818ca461bc9d.Bp7iy76Nz9CN3BFg')
    expect(draft.promptTemplate).toContain('[REDACTED]')
  })
})
