import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TeamAction, TeamSession } from '../../teams/types'

const mocks = vi.hoisted(() => {
  const workflowRow = {
    id: 'wfs_test',
    name: '测试工作流',
    goal: '验证实时过程',
    workflow_type: 'custom',
    team_id: 'team_test',
    prompt_template: '目标 {{goal}}\n输入 {{input}}\n步骤 {{steps}}',
    steps_json: JSON.stringify(['第一步', '第二步']),
    target_consumers_json: JSON.stringify(['teams']),
    status: 'draft',
    last_test_status: 'idle',
    last_test_input: '',
    last_test_output: '',
    last_optimization_feedback: '',
    last_optimization_output: '',
    published_targets_json: '[]',
    publish_configs_json: '{}',
    created_at: '2026-04-29 00:00:00',
    updated_at: '2026-04-29 00:00:00',
  }
  return {
    workflowRow,
    actions: [] as TeamAction[],
    run: vi.fn(async () => undefined),
    approveTeamAction: vi.fn(async (action: TeamAction) => ({ ...action, status: 'approved' as const })),
    executeTeamAction: vi.fn(async (action: TeamAction) => {
      const completed = { ...action, status: 'completed' as const, result: { success: true, output: 'done' } }
      mocks.actions = mocks.actions.map((item) => (item.id === action.id ? completed : item))
      return completed
    }),
    createTeamActions: vi.fn(async (actions: Array<Omit<TeamAction, 'id' | 'createdAt' | 'updatedAt'>>) => {
      const created = actions.map((action, index) => ({
        ...action,
        id: `ta_delivery_${index + 1}`,
        createdAt: '',
        updatedAt: '',
      }))
      mocks.actions = [...mocks.actions, ...created]
      return created.map((action) => action.id)
    }),
    listTeamActions: vi.fn(async () => mocks.actions),
    query: vi.fn(async (sql: string) => {
      if (sql.includes('FROM workflow_studio_items WHERE id')) return [workflowRow]
      if (sql.includes('FROM team_actions')) return []
      return []
    }),
  }
})

vi.mock('../../db/repository', () => ({
  run: mocks.run,
  query: mocks.query,
}))

vi.mock('../../teams/store', () => ({
  getTeam: vi.fn(async () => ({
    id: 'team_test',
    name: '测试群策团队',
    description: '',
    teamType: 'permanent',
    agents: [],
    config: { communicationPattern: 'sequential' },
    status: 'active',
    createdAt: '',
    updatedAt: '',
  })),
  createTeam: vi.fn(),
  createTeamAction: vi.fn(),
  createTeamActions: mocks.createTeamActions,
  getTeamSession: vi.fn(),
  listTeamActions: mocks.listTeamActions,
  listTeams: vi.fn(async () => []),
  saveTeamSession: vi.fn(),
  updateTeamAction: vi.fn(),
}))

vi.mock('../../teams/action-broker', () => ({
  approveTeamAction: mocks.approveTeamAction,
  executeTeamAction: mocks.executeTeamAction,
  isExecutableTeamAction: vi.fn((action: TeamAction) => action.toolId !== 'manual_review'),
}))

vi.mock('../../teams/engine', () => ({
  runTeamSession: vi.fn(async (_team, _topic, onProgress) => {
    onProgress?.({
      id: 'progress-1',
      agentId: 'team-engine',
      agentName: '群策引擎',
      role: 'system',
      content: '群策已启动',
      timestamp: 1,
      kind: 'progress',
    })
    onProgress?.({
      id: 'brief-1',
      agentId: 'general',
      agentName: 'BASAKA',
      role: 'assistant',
      content: '角色短评',
      timestamp: 2,
      kind: 'brief',
    })
    return {
      id: 'ts_test',
      teamId: 'team_test',
      title: '测试会话',
      topic: '测试输入',
      messages: [
        {
          id: 'artifact-1',
          agentId: 'team-synthesizer',
          agentName: '群策主持人',
          role: 'assistant',
          content: '最终成果',
          timestamp: 3,
          kind: 'artifact',
        },
      ],
      summary: '最终成果',
      tags: [],
      isPinned: false,
      isStarred: false,
      status: 'completed',
      createdAt: '',
      updatedAt: '',
    } satisfies TeamSession
  }),
}))

import { testWorkflowStudioItem } from '../studio'
import { buildWorkflowDeliveryActions, buildWorkflowDeliveryRoot } from '../delivery'

describe('workflow studio progress', () => {
  beforeEach(() => {
    Object.assign(mocks.workflowRow, {
      id: 'wfs_test',
      name: '测试工作流',
      goal: '验证实时过程',
      workflow_type: 'custom',
      team_id: 'team_test',
      prompt_template: '目标 {{goal}}\n输入 {{input}}\n步骤 {{steps}}',
      steps_json: JSON.stringify(['第一步', '第二步']),
      target_consumers_json: JSON.stringify(['teams']),
      status: 'draft',
      last_test_status: 'idle',
      last_test_input: '',
      last_test_output: '',
      last_optimization_feedback: '',
      last_optimization_output: '',
      published_targets_json: '[]',
      publish_configs_json: '{}',
      created_at: '2026-04-29 00:00:00',
      updated_at: '2026-04-29 00:00:00',
    })
    mocks.actions = []
    mocks.run.mockClear()
    mocks.approveTeamAction.mockClear()
    mocks.executeTeamAction.mockClear()
    mocks.createTeamActions.mockClear()
  })

  it('passes team progress messages through during test runs', async () => {
    const progress: string[] = []

    const result = await testWorkflowStudioItem('wfs_test', '测试输入', (message) => {
      progress.push(`${message.kind}:${message.agentName}:${message.content}`)
    })

    expect(result).toMatchObject({
      success: true,
      output: '最终成果',
      sessionId: 'ts_test',
      actionRun: { total: 0, executed: 0, completed: 0, failed: 0, blocked: 0 },
    })
    expect(progress).toEqual([
      'progress:群策引擎:群策已启动',
      'brief:BASAKA:角色短评',
      'progress:电脑执行层:本轮没有生成电脑动作队列：只产出了文档成果，没有需要电脑执行的动作。',
    ])
    expect(mocks.run).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'tested'"),
      ['测试输入', '最终成果', 'wfs_test'],
    )
  })

  it('autopilots runnable workflow actions during test runs', async () => {
    const action: TeamAction = {
      id: 'ta_1',
      sessionId: 'ts_test',
      teamId: 'team_test',
      ownerAgentId: 'team-engine',
      ownerAgentName: '执行总控',
      capability: 'terminal',
      toolId: 'terminal',
      title: '创建桌面项目目录',
      description: '创建一个安全的桌面项目目录。',
      params: { command: "mkdir -p '/Users/apple/Desktop/🚀-Test'", timeout: 30000 },
      risk: 'low',
      requiresApproval: false,
      status: 'proposed',
      createdAt: '',
      updatedAt: '',
    }
    mocks.actions = [action]
    mocks.executeTeamAction.mockImplementationOnce(async (approved: TeamAction) => {
      const completed = { ...approved, status: 'completed' as const, result: { success: true, output: 'done' } }
      mocks.actions = [completed]
      return completed
    })

    const progress: string[] = []
    const result = await testWorkflowStudioItem('wfs_test', '测试输入', (message) => {
      progress.push(message.content)
    })

    expect(mocks.approveTeamAction).toHaveBeenCalledWith(action)
    expect(mocks.executeTeamAction).toHaveBeenCalledWith({ ...action, status: 'approved' })
    expect(result.actionRun).toMatchObject({ total: 1, executed: 1, completed: 1, failed: 0, blocked: 0 })
    expect(result.output).toContain('## 试跑自动执行回执')
    expect(result.output).toContain('创建桌面项目目录｜terminal｜low｜可自动｜completed')
    expect(progress.join('\n')).toContain('正在执行电脑动作 1：创建桌面项目目录')
  })

  it('replaces stale demo input before saving a workflow test run', async () => {
    Object.assign(mocks.workflowRow, {
      name: 'iOS App 开发测试｜LumaSense 视觉意识花园',
      goal: '把一个关于 AI 视觉与认知碰撞的 iOS App 想法推进成可落地成果。',
      workflow_type: 'build',
      steps_json: JSON.stringify(['压缩产品承诺', '定义 UI 气质', '规划 SwiftUI 技术架构']),
    })

    const result = await testWorkflowStudioItem(
      'wfs_test',
      '请用这个工作流设计一个新的 Mac App：LumaDesk 灵感航海仪。',
    )

    expect(result.success).toBe(true)
    expect(mocks.run).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'tested'"),
      [
        expect.stringContaining('LumaSense'),
        expect.any(String),
        'wfs_test',
      ],
    )
    const runCalls = mocks.run.mock.calls as unknown as Array<[string, unknown[]]>
    expect(runCalls.map((call) => String(call[1]?.[0] || '')).join('\n')).not.toContain('LumaDesk')
  })

  it('materializes app build workflows into runnable prototype and verification actions', async () => {
    Object.assign(mocks.workflowRow, {
      name: 'iOS App 开发测试｜LumaSense 视觉意识花园',
      goal: '把一个关于 AI 视觉与认知碰撞的 iOS App 想法推进成可运行原型。',
      workflow_type: 'build',
      steps_json: JSON.stringify(['定义产品承诺', '设计首屏', '生成 SwiftUI 技术架构']),
    })

    const progress: string[] = []
    const result = await testWorkflowStudioItem('wfs_test', '请真实落地这个 iOS App，并跑出可验收原型。', (message) => {
      progress.push(message.content)
    })

    const createdTitles = mocks.createTeamActions.mock.calls
      .flatMap((call) => call[0] as Array<Omit<TeamAction, 'id' | 'createdAt' | 'updatedAt'>>)
      .map((action) => action.title)

    expect(result.success).toBe(true)
    expect(progress.join('\n')).toContain('交付执行循环已接管')
    expect(createdTitles).toContain('生成可运行 HTML 原型')
    expect(createdTitles).toContain('生成 SwiftUI 源码骨架')
    expect(createdTitles).toContain('生成 Native iOS 工程配置')
    expect(createdTitles).toContain('构建并截图验收 Native iOS App')
    expect(createdTitles).toContain('运行交付项目验证脚本')
    expect(result.actionRun).toMatchObject({ total: 14, executed: 14, completed: 14, failed: 0, blocked: 0 })
    expect(result.output).toContain('打开可运行原型｜terminal｜low｜可自动｜completed')
  })

  it('keeps delivery files in the same desktop project root and uses the real product name', () => {
    const item = {
      id: 'wfs_luma',
      name: 'iOS App 开发测试｜LumaSense 视觉意识花园',
      goal: '把一个关于 AI 视觉与认知碰撞的 iOS App 想法推进成可运行原型。',
      workflowType: 'build' as const,
      teamId: 'team_test',
      promptTemplate: '',
      steps: ['定义产品承诺'],
      targetConsumers: [],
      status: 'draft' as const,
      lastTestStatus: 'idle' as const,
      lastTestInput: '',
      lastTestOutput: '',
      lastOptimizationFeedback: '',
      lastOptimizationOutput: '',
      publishedTargets: [],
      publishConfigs: {},
      createdAt: '',
      updatedAt: '',
    }
    const input = '请用这个工作流试跑当前任务：iOS App 开发测试｜LumaSense 视觉意识花园。\n当前稳定目标：生成可运行原型。'

    const root = buildWorkflowDeliveryRoot(item, input)
    const actions = buildWorkflowDeliveryActions({
      item,
      input,
      sessionId: 'ts_test',
      artifactContent: '最终成果',
    })
    const htmlAction = actions.find((action) => action.title === '生成可运行 HTML 原型')

    expect(root).toBe('/Users/apple/Desktop/🚀-iOS-App-开发测试-LumaSense-视觉意识花园')
    expect(JSON.stringify(actions.map((action) => action.params))).not.toContain('🚀-App-iOS-App')
    expect(String(htmlAction?.params.content)).toContain('<h1>LumaSense</h1>')
    expect(JSON.stringify(actions.map((action) => action.params))).toContain('native-ios')
    expect(JSON.stringify(actions.map((action) => action.params))).toContain('build-and-screenshot.mjs')
  })
})
