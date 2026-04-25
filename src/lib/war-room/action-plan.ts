import type { StoredProject } from '../db/store'
import { dbSaveOperatingEvent } from '../db/repository'
import { createScheduledTask } from '../automation/scheduler'

export interface WarRoomPlanInput {
  project: StoredProject
  nextActions?: string[]
  roleSignals?: Array<{
    roleName: string
    verdict?: string
    risks?: string[]
    opportunities?: string[]
    advice?: string
  }>
}

export interface WarRoomPlanItem {
  id: string
  title: string
  detail: string
}

export interface WarRoomExecutionAction {
  id: string
  title: string
  agentId: 'strategy' | 'critic' | 'market' | 'technical' | 'general'
  taskType: 'agent-task' | 'research' | 'custom'
  cronExpression: string
  goal: string
}

export interface WarRoomActionPlan {
  projectId: string
  projectTitle: string
  summary: string
  reviewAt: string
  hypotheses: WarRoomPlanItem[]
  risks: WarRoomPlanItem[]
  actions: WarRoomExecutionAction[]
  metrics: WarRoomPlanItem[]
}

function clampText(value: string, fallback: string, max = 220): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return fallback
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}...`
}

function makeReviewDate(days = 7): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function riskLabel(score: number): string {
  if (score >= 72) return '高压'
  if (score >= 55) return '中压'
  return '可控'
}

function buildActionGoal(
  plan: Pick<WarRoomActionPlan, 'projectTitle' | 'summary' | 'reviewAt'>,
  focus: string,
): string {
  return [
    `项目：${plan.projectTitle}`,
    `推演结论：${plan.summary}`,
    `任务焦点：${focus}`,
    `复盘日期：${plan.reviewAt}`,
    '输出要求：给出可执行步骤、需要验证的证据、失败信号、下一次复盘问题。',
  ].join('\n')
}

export function buildWarRoomActionPlan(input: WarRoomPlanInput): WarRoomActionPlan {
  const { project } = input
  const radar = project.radar || {
    era_fit: 50,
    boss_match: 50,
    monetization: 50,
    tech_breakthrough: 50,
    resource_cost: 50,
    risk_index: 50,
  }
  const reviewAt = makeReviewDate()
  const summary = clampText(
    project.recommendation || project.summary || project.oneLiner,
    '这轮推演还缺少明确建议，先用一周验证实验把核心假设压实。',
  )
  const roleRisk = input.roleSignals?.flatMap((signal) => signal.risks || []).filter(Boolean)[0] || ''
  const roleOpportunity = input.roleSignals?.flatMap((signal) => signal.opportunities || []).filter(Boolean)[0] || ''

  const hypotheses: WarRoomPlanItem[] = [
    {
      id: 'boss-fit',
      title: 'Boss 匹配假设',
      detail:
        radar.boss_match >= 70
          ? `如果 Boss 匹配分 ${radar.boss_match} 能被真实行动持续验证，这个项目可以进入一周推进池。`
          : `如果 Boss 匹配分只有 ${radar.boss_match}，下一步必须验证它是否真的贴合当前主线。`,
    },
    {
      id: 'survival',
      title: '存活率假设',
      detail:
        project.survivalRate >= 70
          ? `存活率 ${project.survivalRate}% 暂时支持小步推进，但仍要验证最关键的转化证据。`
          : `存活率 ${project.survivalRate}% 暂不支持重投入，先找到一个能改变评分的关键证据。`,
    },
    {
      id: 'opportunity',
      title: '突破口假设',
      detail: roleOpportunity || input.nextActions?.[0] || summary,
    },
  ]

  const risks: WarRoomPlanItem[] = [
    {
      id: 'risk-index',
      title: `${riskLabel(radar.risk_index)}风险`,
      detail: `风险指数 ${radar.risk_index}，需要在复盘前拿到能降低风险的证据或反证。`,
    },
    {
      id: 'resource-cost',
      title: `${riskLabel(radar.resource_cost)}资源消耗`,
      detail: `资源消耗 ${radar.resource_cost}，一周实验必须限制投入边界，避免推演变成长期空耗。`,
    },
    {
      id: 'role-risk',
      title: '角色红旗',
      detail: roleRisk || '角色推演还没有给出强红旗，下一轮需要专门让批判角色做反证审计。',
    },
  ]

  const actionSeed = {
    projectTitle: project.title,
    summary,
    reviewAt,
  }
  const actions: WarRoomExecutionAction[] = [
    {
      id: 'seven-day-experiment',
      title: '拆一周验证实验',
      agentId: 'strategy',
      taskType: 'agent-task',
      cronExpression: '0 9 * * 1',
      goal: buildActionGoal(actionSeed, '把推演结论拆成 7 天内能完成的验证实验。'),
    },
    {
      id: 'premortem',
      title: '做失败预演与反证清单',
      agentId: 'critic',
      taskType: 'agent-task',
      cronExpression: '0 21 * * 3',
      goal: buildActionGoal(actionSeed, '从风险、资源、Boss 匹配三条线做失败预演。'),
    },
    {
      id: 'evidence-search',
      title: '检索市场与知识证据',
      agentId: 'market',
      taskType: 'research',
      cronExpression: '0 10 * * 2',
      goal: `${project.title} ${project.oneLiner} ${project.tags.join(' ')} 市场证据 竞品 风险`,
    },
    {
      id: 'review',
      title: '复盘推演行动',
      agentId: 'general',
      taskType: 'custom',
      cronExpression: '0 21 * * 5',
      goal: buildActionGoal(actionSeed, '按观察指标复盘是否继续、转向、放弃或归档。'),
    },
  ]

  const metrics: WarRoomPlanItem[] = [
    { id: 'evidence', title: '证据', detail: '至少收集 3 条真实用户、市场、技术或知识库证据。' },
    { id: 'score-delta', title: '评分变化', detail: '复盘时重新判断 Boss 匹配、风险指数、资源消耗是否改善。' },
    { id: 'decision', title: '决策出口', detail: '复盘时必须给出推进、转向、放弃或继续观察中的一个出口。' },
  ]

  return {
    projectId: project.id,
    projectTitle: project.title,
    summary,
    reviewAt,
    hypotheses,
    risks,
    actions,
    metrics,
  }
}

export async function materializeWarRoomActionPlan(plan: WarRoomActionPlan): Promise<{
  taskIds: string[]
  eventIds: string[]
}> {
  const taskIds: string[] = []
  const eventIds: string[] = []

  eventIds.push(
    await dbSaveOperatingEvent({
      id: `op_warroom_plan_${plan.projectId}_${Date.now().toString(36)}`,
      type: 'project_signal',
      stage: 'simulate',
      projectId: plan.projectId,
      projectIds: [plan.projectId],
      title: `推演行动计划：${plan.projectTitle}`,
      signalKind: 'decision',
      nextStep: plan.actions[0]?.title || plan.summary,
      source: { kind: 'project', sourceId: plan.projectId, title: plan.projectTitle },
      confidence: 0.84,
    }),
  )

  for (const action of plan.actions) {
    const taskId = await createScheduledTask({
      name: `WarRoom｜${plan.projectTitle}｜${action.title}`,
      cronExpression: action.cronExpression,
      taskType: action.taskType,
      taskConfig: {
        goal: action.goal,
        prompt: action.goal,
        projectId: plan.projectId,
        reviewAt: plan.reviewAt,
      },
      enabled: false,
      agentId: action.agentId,
    })
    taskIds.push(taskId)
    eventIds.push(
      await dbSaveOperatingEvent({
        id: `op_warroom_action_${plan.projectId}_${action.id}_${Date.now().toString(36)}`,
        type: 'agent_action',
        stage: 'execute',
        agentId: action.agentId,
        title: `推演行动已生成：${action.title}`,
        status: 'queued',
        toolRefs: ['scheduled_tasks', action.taskType, 'war_room'],
        resultPreview: `${plan.projectTitle} 的行动任务已进入 Scheduler，可在自动化面板启用。`,
        projectIds: [plan.projectId],
        source: { kind: 'project', sourceId: plan.projectId, title: plan.projectTitle },
        confidence: 0.82,
        entities: [action.agentId, action.taskType, plan.reviewAt],
      }),
    )
  }

  return { taskIds, eventIds }
}
