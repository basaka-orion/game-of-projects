import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  finishOpenbasakaRun,
  listOpenbasakaRuns,
  resetOpenbasakaRunRuntimeForTest,
  startSimplifyMission,
  subscribeOpenbasakaRuns,
  updateOpenbasakaRunStep,
  planSimplifyMissionRoute,
  type SimplifyMissionDeliverable,
  type OpenbasakaMissionServices,
} from '../background-runs'
import { listScheduledTasks } from '../../automation/scheduler'
import { listWorkflowStudioItems } from '../../workflow/studio'

const fakeModel = {
  provider: 'ollama' as const,
  apiKey: '',
  baseUrl: 'http://localhost:11434/v1',
  model: 'test-model',
}

const unconfiguredModel = {
  provider: 'deepseek' as const,
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
}

function fakeServices(overrides: Partial<OpenbasakaMissionServices> = {}): Partial<OpenbasakaMissionServices> {
  const base: OpenbasakaMissionServices = {
    resolveModelConfig: () => fakeModel,
    lockBossIntent: async ({ step }) => ({
      outputPreview: 'Boss 真需求已锁定。',
      metadata: { serviceName: 'test-boss', evidenceRefs: [step.id], progressDetail: '验收标准已确认。' },
    }),
    queryKnowledge: async ({ step }) => ({
      outputPreview: '知识库返回 2 条证据。',
      metadata: { serviceName: 'test-knowledge', evidenceRefs: ['wiki-1', step.id] },
    }),
    executeWorkflow: async ({ run }) => ({
      outputPreview: '工作流试跑完成。',
      metadata: { serviceName: 'test-workflow', artifactId: `wf-${run.id}`, evidenceRefs: ['wf-run-1'] },
    }),
    runTeamCouncil: async () => ({
      outputPreview: '群策会话完成。',
      metadata: { serviceName: 'test-team', artifactId: 'team-session-1', evidenceRefs: ['team-session-1'] },
    }),
    planSchedule: async () => ({
      outputPreview: '已生成节律候选，没有自动开启定时。',
      metadata: { serviceName: 'test-scheduler', artifactId: 'schedule-candidate-1', evidenceRefs: ['scheduled-task-1'] },
    }),
    runSelfAudit: async () => ({
      outputPreview: '系统自省完成。',
      metadata: { serviceName: 'test-audit', artifactId: 'audit-1', evidenceRefs: ['audit-1'] },
    }),
    translateForXiaobai: async () => ({
      outputPreview: '小白执行版已生成。',
      metadata: { serviceName: 'test-xiaobai', evidenceRefs: ['xiaobai-1'] },
    }),
    synthesizeFinal: async () => ({
      outputPreview: '最终 synthesis 完成。',
      metadata: { serviceName: 'test-synthesis', evidenceRefs: ['final-1'] },
    }),
    writeMemory: async () => ({
      outputPreview: '最终成果已写回长期记忆。',
      metadata: { serviceName: 'test-memory', artifactId: 'memory-1', evidenceRefs: ['memory-1'] },
    }),
  }
  return { ...base, ...overrides }
}

async function waitForLatestStatus(status: string) {
  for (let index = 0; index < 30; index += 1) {
    const latest = await listOpenbasakaRuns()
    if (latest[0]?.status === status) return latest[0]
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return (await listOpenbasakaRuns())[0]
}

describe('openbasaka background runs', () => {
  beforeEach(() => {
    resetOpenbasakaRunRuntimeForTest()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    resetOpenbasakaRunRuntimeForTest()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('creates a durable simplify mission with ordered steps', async () => {
    const run = await startSimplifyMission('我想把知识库视频资料变成每天自动推送的工作流', { autoAdvance: false })
    const runs = await listOpenbasakaRuns()

    expect(run.moduleId).toBe('simplify')
    expect(run.status).toBe('running')
    expect(runs[0].bossDemand).toContain('知识库视频资料')
    expect(runs[0].steps.length).toBeGreaterThan(3)
    expect(runs[0].steps[0]).toMatchObject({
      nodeId: 'control',
      status: 'running',
      targetTab: 'control',
    })
    expect(runs[0].steps.map((step) => step.nodeId)).toContain('scheduler')
    expect(runs[0].steps.map((step) => step.orderIndex)).toEqual(runs[0].steps.map((_, index) => index))
  })

  it('plans a lean route and skips modules that are not useful for the demand', () => {
    const route = planSimplifyMissionRoute('帮我把这个复杂任务拆成可执行路径')

    expect(route.route).toEqual(['control', 'boss', 'teams', 'workflow', 'audit', 'memory'])
    expect(route.mode).toBe('auto')
    expect(route.plannerNodeId).toBe('teams')
    expect(route.skipped).toContain('knowledge')
    expect(route.skipped).toContain('scheduler')
  })

  it('does not treat a forbidden automatic action as a scheduler request', () => {
    const route = planSimplifyMissionRoute('把一个复杂想法压缩成可执行路径，不得自动写文件或外发')

    expect(route.route).toEqual(['control', 'boss', 'teams', 'workflow', 'audit', 'memory'])
    expect(route.skipped).toContain('scheduler')
    expect(route.skipped).toContain('knowledge')
  })

  it('stops destructive or external sensitive demands at the Boss action guard', async () => {
    await startSimplifyMission('请删除桌面旧文件，并把 API Key 发给 Telegram 群', {
      stepDelayMs: 0,
      services: {
        resolveModelConfig: () => unconfiguredModel,
      },
    })

    const latest = await waitForLatestStatus('blocked')
    const bossStep = latest.steps.find((step) => step.nodeId === 'boss')

    expect(latest.status).toBe('blocked')
    expect(bossStep?.status).toBe('blocked')
    expect(bossStep?.metadata.serviceName).toBe('action-guard')
    expect(bossStep?.metadata.blockingReason).toContain('删除/移动/覆盖真实文件或数据')
    expect(bossStep?.metadata.blockingReason).toContain('外发/上传/发布到外部渠道')
    expect(latest.steps.find((step) => step.nodeId === 'workflow')?.status).toBe('queued')
  })

  it('allows safe file-organization planning when destructive actions are explicitly forbidden', async () => {
    await startSimplifyMission('帮我整理桌面文件，先列计划和验收标准，不删除、不移动、不外发任何文件', {
      stepDelayMs: 0,
      services: {
        resolveModelConfig: () => unconfiguredModel,
      },
    })

    const latest = await waitForLatestStatus('completed')
    const bossStep = latest.steps.find((step) => step.nodeId === 'boss')

    expect(latest.status).toBe('completed')
    expect(bossStep?.metadata.serviceName).toContain('boss-intent-locker')
    expect(latest.steps.find((step) => step.nodeId === 'workflow')?.status).toBe('completed')
  })

  it('routes iOS app demands through evidence, council, workflow, audit, and memory without enabling scheduler by default', () => {
    const route = planSimplifyMissionRoute('帮我做一个完整 iOS App，要能落地验证')

    expect(route.route).toEqual(['control', 'boss', 'knowledge', 'teams', 'workflow', 'audit', 'memory'])
    expect(route.skipped).toContain('scheduler')
    expect(route.plannerNodeId).toBe('teams')
    expect(route.rationale).toContain('复杂问题先定方案')
  })

  it('covers a complex mission matrix through the required sand table modules', () => {
    const missions = [
      {
        demand:
          '我想做一款为女性出门在外，根据当地实际的天气情况，认真准备包包清单，打钩后全武装出门的 iOS app',
        required: ['knowledge', 'teams', 'workflow', 'audit', 'memory'],
        forbidden: ['scheduler'],
      },
      {
        demand: '把一个网页和视频学习资料整理成知识包，并每周提醒我复盘一次',
        required: ['knowledge', 'workflow', 'scheduler', 'audit', 'memory'],
        forbidden: [],
      },
      {
        demand: '每天生成 OpenBasaka 自省报告，发现失败模式和学习进度，但不要自动外发',
        required: ['workflow', 'scheduler', 'audit', 'memory'],
        forbidden: [],
      },
      {
        demand: '帮我整理桌面文件，先列计划和验收标准，不删除、不移动、不外发任何文件',
        required: ['workflow', 'audit', 'memory'],
        forbidden: ['scheduler'],
      },
    ]

    for (const mission of missions) {
      const route = planSimplifyMissionRoute(mission.demand)
      expect(route.route.slice(0, 2)).toEqual(['control', 'boss'])
      for (const nodeId of mission.required) {
        expect(route.route).toContain(nodeId)
      }
      for (const nodeId of mission.forbidden) {
        expect(route.route).not.toContain(nodeId)
      }
    }
  })

  it('runs the Boss-selected expert route in the chosen module order', async () => {
    const run = await startSimplifyMission('按我的专家顺序推进这个任务', {
      autoAdvance: false,
      routeMode: 'manual',
      manualNodeIds: ['knowledge', 'teams', 'scheduler'],
      manualCapabilityIds: {
        knowledge: ['来源核对'],
        teams: ['多角色评审', '反方审视'],
      },
    })
    const latest = (await listOpenbasakaRuns()).find((item) => item.id === run.id)

    expect(latest?.steps.map((step) => step.nodeId)).toEqual([
      'control',
      'boss',
      'knowledge',
      'teams',
      'scheduler',
      'audit',
      'memory',
    ])
    expect(latest?.steps[2].metadata.routeMode).toBe('manual')
    expect(latest?.steps[2].metadata.manualNodeIds).toEqual(['knowledge', 'teams', 'scheduler'])
    expect(latest?.steps[2].metadata.capabilityLabels).toEqual(['来源核对'])
    expect(latest?.steps[3].metadata.capabilityLabels).toEqual(['多角色评审', '反方审视'])
  })

  it('notifies subscribers when steps progress and runs finish', async () => {
    const snapshots: string[] = []
    const unsubscribe = subscribeOpenbasakaRuns((runs) => {
      const run = runs[0]
      if (run) snapshots.push(`${run.status}:${run.steps.filter((step) => step.status === 'completed').length}`)
    })

    const run = await startSimplifyMission('帮我把这个复杂任务拆成可执行路径', { autoAdvance: false })
    const firstStep = (await listOpenbasakaRuns())[0].steps[0]
    await updateOpenbasakaRunStep(run.id, firstStep.id, {
      status: 'completed',
      outputPreview: 'Boss 输入已确认。',
    })
    await finishOpenbasakaRun(run.id, '首轮路径已完成。')
    unsubscribe()

    expect(snapshots).toContain('running:1')
    expect(snapshots).toContain('completed:1')
  })

  it('keeps running after the original subscriber leaves', async () => {
    const seen: string[] = []
    const unsubscribe = subscribeOpenbasakaRuns((runs) => {
      const run = runs[0]
      if (run) seen.push(run.status)
    })

    await startSimplifyMission('请让整个 Openbasaka 围绕这句话工作', {
      stepDelayMs: 0,
      services: fakeServices(),
    })
    unsubscribe()
    const latest = await waitForLatestStatus('completed')

    expect(seen).toContain('running')
    expect(latest.status).toBe('completed')
    expect(latest.steps.every((step) => step.status === 'completed')).toBe(true)
    expect(latest.steps.some((step) => step.metadata.evidenceRefs)).toBe(true)
  })

  it('blocks the mission instead of pretending completion when a real service needs Boss confirmation', async () => {
    await startSimplifyMission('帮我生成一套需要写文件落地的方案', {
      stepDelayMs: 0,
      services: fakeServices({
        runTeamCouncil: async () => ({
          status: 'blocked',
          outputPreview: '群策发现 1 个需要 Boss 确认的文件写入动作。',
          metadata: {
            serviceName: 'test-team',
            blockingReason: 'file_write 需要 Boss 确认。',
            evidenceRefs: ['team-action-1'],
          },
        }),
      }),
    })

    const latest = await waitForLatestStatus('blocked')

    expect(latest.status).toBe('blocked')
    expect(latest.steps.find((step) => step.nodeId === 'teams')?.status).toBe('blocked')
    expect(latest.steps.find((step) => step.nodeId === 'teams')?.metadata.blockingReason).toContain('file_write')
  })

  it('continues deterministic safe orchestration without a configured model', async () => {
    const run = await startSimplifyMission('每天生成 OpenBasaka 自省报告，发现失败模式和学习进度，但不要自动外发', {
      stepDelayMs: 0,
      services: {
        resolveModelConfig: () => unconfiguredModel,
      },
    })

    const latest = await waitForLatestStatus('completed')
    const deliverable = latest.steps
      .slice()
      .reverse()
      .map((step) => step.metadata.deliverable)
      .find(Boolean) as SimplifyMissionDeliverable | undefined
    const workflows = await listWorkflowStudioItems()
    const tasks = await listScheduledTasks()
    const task = tasks.find((item) => item.taskConfig.simplifyRunId === run.id)

    expect(latest.id).toBe(run.id)
    expect(latest.steps.find((step) => step.nodeId === 'control')?.metadata.serviceName).toContain('deterministicFallback')
    expect(latest.steps.find((step) => step.nodeId === 'control')?.metadata.evidenceRefs).toContain('model:not-configured')
    expect(latest.steps.find((step) => step.nodeId === 'xiaobai')).toBeUndefined()
    expect(deliverable?.kind).toBe('automation')
    expect(deliverable?.moduleArtifacts?.map((artifact) => artifact.kind)).toEqual(['workflow-studio', 'scheduled-task'])
    expect(workflows.some((workflow) => workflow.id === `wfs_simplify_${run.id}` && workflow.targetConsumers.includes('scheduler'))).toBe(true)
    expect(task?.enabled).toBe(false)
    expect(task?.cronExpression).toBe('0 9 * * *')
  })
})
