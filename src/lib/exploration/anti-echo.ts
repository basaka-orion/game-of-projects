import { createScheduledTask, listScheduledTasks } from '../automation/scheduler'
import type { OperatingEventRow } from '../db/repository'
import { dbSaveOperatingEvent } from '../db/repository'

export interface AntiEchoReviewInput {
  operatingEvents: OperatingEventRow[]
  now?: Date
}

export interface AntiEchoReviewPlan {
  title: string
  prompt: string
  blindSpots: string[]
  sourceEventIds: string[]
  cronExpression: string
  agentId: 'critic'
}

function parseEntities(event: OperatingEventRow): string[] {
  try {
    const parsed = JSON.parse(event.entities_json || '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function nextMonthLabel(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function buildAntiEchoReviewPlan(input: AntiEchoReviewInput): AntiEchoReviewPlan {
  const now = input.now || new Date()
  const recent = input.operatingEvents.slice(0, 60)
  const decisionEvents = recent.filter((event) => event.type === 'project_signal' || /决策|推演|WarRoom/i.test(event.title))
  const executionEvents = recent.filter((event) => event.type === 'agent_action')
  const knowledgeEvents = recent.filter((event) => event.type === 'knowledge_source')
  const contrarianEvents = recent.filter((event) => parseEntities(event).includes('contrarian') || /反共识|反证|盲点|失败/i.test(event.summary))

  const blindSpots = [
    decisionEvents.length === 0 ? '最近缺少明确项目决策样本，容易停在认知展示而不是现实行动。' : '',
    executionEvents.length < 3 ? '最近 Agent 执行收据偏少，行动闭环可能没有足够证据。' : '',
    knowledgeEvents.length < 3 ? '最近世界来源摄入偏少，系统可能过度依赖旧记忆。' : '',
    contrarianEvents.length === 0 ? '最近没有足够反证/反共识事件，Boss 可能被自身偏好过拟合。' : '',
  ].filter(Boolean)

  const sourceEventIds = recent.slice(0, 12).map((event) => event.id)
  const prompt = [
    '你是 Openbasaka 的未来人/大师反茧房审视流程。',
    '你必须综合 strategy + critic + domain expert 三个视角，严厉但可执行地审视 Boss 最近一个周期。',
    `周期：${nextMonthLabel(now)}`,
    `证据事件：${sourceEventIds.join(', ') || '暂无事件'}`,
    `初步盲点：${blindSpots.join('；') || '暂无显著盲点，但仍需主动找反证。'}`,
    '输出要求：1）最危险的过拟合；2）被忽略的世界信号；3）必须反证的假设；4）下一步 WarRoom/Scheduler 行动。',
  ].join('\n')

  return {
    title: 'Openbasaka｜未来人/大师月度反茧房审视',
    prompt,
    blindSpots: blindSpots.length > 0 ? blindSpots : ['没有明显异常，也必须主动寻找一个反证方向。'],
    sourceEventIds,
    cronExpression: '0 9 1 * *',
    agentId: 'critic',
  }
}

export async function ensureAntiEchoReviewTask(plan: AntiEchoReviewPlan): Promise<{
  taskId: string
  eventId: string
  created: boolean
}> {
  const existing = (await listScheduledTasks()).find((task) => task.name === plan.title)
  const taskId =
    existing?.id ||
    (await createScheduledTask({
      name: plan.title,
      cronExpression: plan.cronExpression,
      taskType: 'agent-task',
      taskConfig: {
        prompt: plan.prompt,
        goal: plan.prompt,
        reviewKind: 'anti-echo-master-review',
        sourceEventIds: plan.sourceEventIds.join(','),
      },
      enabled: false,
      agentId: plan.agentId,
    }))

  const eventId = await dbSaveOperatingEvent({
    id: `op_anti_echo_${Date.now().toString(36)}`,
    type: 'agent_action',
    stage: 'review',
    agentId: plan.agentId,
    title: existing ? '未来人/大师反茧房审视任务已存在' : '未来人/大师反茧房审视任务已固化',
    status: 'queued',
    toolRefs: ['scheduled_tasks', 'anti-echo-master-review'],
    resultPreview: existing
      ? '月度反茧房审视已经在 Scheduler 中，可启用或试跑。'
      : '已把月度反茧房审视写入 Scheduler，默认先保持关闭，等待 Boss 启用。',
    explorationMode: 'contrarian',
    bossProfileImpact: 'high',
    reviewRequired: true,
    source: { kind: 'agent', sourceId: taskId, title: plan.title },
    confidence: 0.86,
    entities: ['anti-echo', 'future-master-review', ...plan.blindSpots.slice(0, 4)],
  })

  return { taskId, eventId, created: !existing }
}
