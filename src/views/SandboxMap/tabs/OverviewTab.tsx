import type { NeuronData } from '../SandboxMap'
import type { OperatingEventRow, SynapseRow } from '../../../lib/db/repository'
import type { BossState } from '../../../lib/boss/profile'
import type { SandboxTabId } from '../navigation'
import type { AgentExecutionReceipt, ExecutionRiskLevel } from '../../../lib/agents/execution-receipt'
import {
  buildExecutionLearningDeck,
  parseAgentExecutionReceipt,
  type AgentExecutionReview,
} from '../../../lib/agents/execution-review'
import { SystemStageFlowItem, SystemStagePanel, SystemStageShell, SystemStageState } from '../components/SystemStage'
import {
  buildDailyBriefDeck,
  buildProjectIntelligenceItems,
  buildProjectNeuralNetwork,
  dailyIntakeItems,
  executionLayerItems,
  operatingLoopStages,
  type OperatingLoopDeckItem,
  type OperatingLoopTarget,
  type ProjectNeuralNode,
  type ProjectNeuralNodeType,
} from '../../../lib/operating-loop'

interface OverviewTabProps {
  neurons: NeuronData[]
  loading: boolean
  synapses: SynapseRow[]
  bossState: BossState | null
  bossMemories: Array<{ category: string; content: string; confidence: number; created_at: string }>
  bossDecisions: Array<{ decision_type: string; reasoning: string; created_at: string }>
  operatingEvents: OperatingEventRow[]
  pendingArchiveCount: number
  onNavigate: (tab: SandboxTabId) => void
  onReload: () => void
  onRefreshBoss: () => void
}

const sandboxTargetMap: Record<OperatingLoopTarget, SandboxTabId> = {
  memory: 'memory',
  profiling: 'profiling',
  knowledge: 'knowledge',
  warroom: 'warroom',
  teams: 'teams',
  scheduler: 'scheduler',
  control: 'control',
  neurons: 'neurons',
  synapses: 'synapses',
}

function bossLabel(bossState: BossState | null): string {
  if (!bossState) return '待同步'
  return bossState.name || 'Boss 已接入'
}

function latestMemorySummary(items: OverviewTabProps['bossMemories']): string {
  if (items.length === 0) return '暂无最近记忆，先从启蒙或对话沉淀开始。'
  return items[0].content.length > 90 ? `${items[0].content.slice(0, 90)}...` : items[0].content
}

function compactDateLabel(value: string): string {
  if (!value) return '未记录时间'
  return value.slice(0, 16).replace('T', ' ')
}

const stageLabels: Record<OperatingEventRow['stage'], string> = {
  capture: '捕获',
  understand: '理解',
  remember: '沉淀',
  compile: '编译',
  explore: '探索',
  simulate: '推演',
  execute: '执行',
  review: '复盘',
}

const eventTypeLabels: Record<OperatingEventRow['type'], string> = {
  input_event: '输入',
  memory_candidate: '记忆',
  boss_signal: '画像',
  knowledge_source: '知识',
  project_signal: '项目',
  agent_action: '行动',
}

function eventSummary(event: OperatingEventRow): string {
  return event.summary || event.source_title || event.title || '主循环事件已记录'
}

function eventTypeLabel(type: OperatingEventRow['type']): string {
  return eventTypeLabels[type] || '事件'
}

function riskLabel(risk: ExecutionRiskLevel): string {
  if (risk === 'high') return '高风险'
  if (risk === 'medium') return '中风险'
  return '低风险'
}

function receiptActionLabel(receipt: AgentExecutionReceipt): string {
  if (receipt.status === 'failed' || receipt.retry.recommended) return '处理'
  if (receipt.evidenceRefs.length === 0) return '补证据'
  return '复盘'
}

function receiptTarget(receipt: AgentExecutionReceipt): SandboxTabId {
  if (receipt.status === 'failed' || receipt.retry.recommended) {
    return receipt.tools.some((tool) => tool.id === 'scheduled_tasks') ? 'scheduler' : 'control'
  }
  if (receipt.evidenceRefs.some((ref) => ref.kind === 'knowledge')) return 'knowledge'
  if (receipt.evidenceRefs.some((ref) => ref.kind === 'memory')) return 'memory'
  if (receipt.evidenceRefs.some((ref) => ref.kind === 'project')) return 'neurons'
  if (receipt.evidenceRefs.some((ref) => ref.kind === 'schedule')) return 'scheduler'
  return 'teams'
}

function receiptTone(receipt: AgentExecutionReceipt): 'accent' | 'success' | 'warning' | 'danger' {
  if (receipt.status === 'failed') return 'danger'
  if (receipt.trust.risk === 'high') return 'warning'
  if (receipt.trust.risk === 'medium') return 'accent'
  return 'success'
}

function reviewTone(review: AgentExecutionReview): 'accent' | 'success' | 'warning' | 'danger' {
  if (review.priority === 'intervene') return 'danger'
  if (review.priority === 'review') return 'warning'
  if (review.priority === 'promote') return 'success'
  return 'accent'
}

function renderDeckItem(item: OperatingLoopDeckItem, onNavigate: (tab: SandboxTabId) => void) {
  return (
    <SystemStageFlowItem
      key={item.id}
      title={item.title}
      value={item.value}
      description={item.description}
      tone={item.tone}
      onClick={() => onNavigate(sandboxTargetMap[item.target])}
      actionLabel="打开"
    />
  )
}

const networkTypeLabels: Record<ProjectNeuralNodeType, string> = {
  project: '项目节点',
  memory: '记忆节点',
  knowledge: '知识节点',
  agent: '执行节点',
}

function renderNetworkNode(node: ProjectNeuralNode, onNavigate: (tab: SandboxTabId) => void) {
  return (
    <button
      key={node.id}
      type="button"
      className={`sandbox-map__network-node sandbox-map__network-node--${node.type}`}
      onClick={() => onNavigate(sandboxTargetMap[node.target])}
    >
      <span className="sandbox-map__network-node-head">
        <span>{node.title}</span>
        <strong>{node.score}</strong>
      </span>
      <span className="sandbox-map__network-node-subtitle">{node.subtitle}</span>
    </button>
  )
}

export default function OverviewTab({
  neurons,
  loading,
  synapses,
  bossState,
  bossMemories,
  bossDecisions,
  operatingEvents,
  pendingArchiveCount,
  onNavigate,
  onReload,
  onRefreshBoss,
}: OverviewTabProps) {
  const classifiedProjects = neurons.filter((item) => item.taxonomy).length
  const highSignalSynapses = synapses.filter((item) => Number(item.strength || 0) >= 0.72).length
  const bossMemoryCount = bossMemories.length
  const decisionCount = bossDecisions.length
  const projectIntelligenceItems = buildProjectIntelligenceItems(neurons.length, synapses.length)
  const executionLearning = buildExecutionLearningDeck(operatingEvents, 4)
  const executionReceipts = operatingEvents
    .map((event) => ({ event, receipt: parseAgentExecutionReceipt(event) }))
    .filter((item): item is { event: OperatingEventRow; receipt: AgentExecutionReceipt } => Boolean(item.receipt))
    .slice(0, 3)
  const learningSummary = executionLearning.summary
  const dailyBrief = buildDailyBriefDeck({
    projectCount: neurons.length,
    classifiedProjectCount: classifiedProjects,
    synapseCount: synapses.length,
    highSignalSynapseCount: highSignalSynapses,
    bossMemoryCount,
    decisionCount,
    pendingArchiveCount,
    operatingEvents,
    executionSummary: learningSummary,
  })
  const projectNeuralNetwork = buildProjectNeuralNetwork({
    projects: neurons.map(({ project, taxonomy }) => ({
      id: project.id,
      title: project.title,
      oneLiner: project.oneLiner,
      tags: project.tags,
      survivalRate: project.survivalRate,
      taxonomyLabel: taxonomy?.taxonomy.innovationType || taxonomy?.taxonomy.industry,
    })),
    synapses,
    memories: bossMemories,
    operatingEvents,
  })

  return (
    <div className="sandbox-map__tab sandbox-map__overview">
      <SystemStageShell
        eyebrow="外脑总控"
        title="沙盘总控台"
        description={
          <>
            这里不再只是项目列表，而是整个外脑 OS 的巡检面板：项目神经元、Boss 画像、记忆宫殿、知识库、推演室、 Agent
            执行与复盘学习都从同一条闭环被看见和推进。
          </>
        }
        metrics={[
          { label: '项目神经元', value: loading ? '同步中' : neurons.length, detail: `${classifiedProjects} 个已分类` },
          { label: '突触连接', value: synapses.length, detail: `${highSignalSynapses} 条高强度` },
          { label: 'Boss 记忆', value: bossMemoryCount, detail: bossLabel(bossState), tone: 'accent' },
          { label: '关键决策', value: decisionCount, detail: '最近 20 条决策视窗' },
          {
            label: '执行学习',
            value: learningSummary.total > 0 ? learningSummary.averageScore : '待启动',
            detail:
              learningSummary.total > 0
                ? `${learningSummary.retryRecommended} 个需重试 · 证据 ${learningSummary.evidenceCoverage}%`
                : '等待收据',
            tone: learningSummary.failed > 0 || learningSummary.highRisk > 0 ? 'warning' : 'success',
          },
        ]}
        actions={[
          { label: '刷新沙盘', onClick: onReload },
          { label: '同步 Boss', onClick: onRefreshBoss },
          { label: '进入推演室', onClick: () => onNavigate('warroom'), variant: 'primary' },
        ]}
        leftRail={
          <>
            <SystemStagePanel
              eyebrow="入口队列"
              title="今日入口"
              description="先处理会堵住闭环的入口，再进入具体模块。"
            >
              {loading ? (
                <SystemStageState
                  state="loading"
                  title="沙盘正在同步"
                  description="正在拉取项目、突触和主循环事件；入口仍可继续打开。"
                  compact
                />
              ) : null}
              {dailyIntakeItems.map((item) =>
                renderDeckItem(
                  item.id === 'qimeng-inbox'
                    ? {
                        ...item,
                        value: pendingArchiveCount > 0 ? pendingArchiveCount : item.value,
                        description:
                          pendingArchiveCount > 0
                            ? `还有 ${pendingArchiveCount} 条启蒙候选等待确认入宫。`
                            : item.description,
                      }
                    : item,
                  onNavigate,
                ),
              )}
            </SystemStagePanel>

            <SystemStagePanel
              eyebrow="Boss 信号"
              title="最近 Boss 记忆"
              description={
                bossMemories.length > 0
                  ? latestMemorySummary(bossMemories)
                  : 'Boss 画像需要持续从启蒙、对话和执行复盘补血。'
              }
            >
              {bossMemories.length > 0 ? (
                bossMemories
                  .slice(0, 3)
                  .map((memory) => (
                    <SystemStageFlowItem
                      key={`${memory.category}-${memory.created_at}-${memory.content.slice(0, 24)}`}
                      title={memory.category || 'Boss 记忆'}
                      value={`${Math.round(memory.confidence * 100)}%`}
                      description={memory.content}
                      meta={compactDateLabel(memory.created_at)}
                      tone={memory.confidence >= 0.82 ? 'success' : 'accent'}
                    />
                  ))
              ) : (
                <SystemStageState
                  state="empty"
                  title="Boss 记忆待同步"
                  description="启蒙归档、对话沉淀和执行复盘都会补充这里。"
                  detail="建议先同步 Boss，再处理启蒙候选。"
                  actionLabel="同步 Boss"
                  onAction={onRefreshBoss}
                  compact
                />
              )}
            </SystemStagePanel>

            <SystemStagePanel
              eyebrow="主循环账本"
              title="主循环事件流"
              description={
                operatingEvents.length > 0 ? '最近写入的跨模块状态变化。' : '等待启蒙、画像、知识或推演写入第一批事件。'
              }
            >
              {operatingEvents.length > 0 ? (
                operatingEvents
                  .slice(0, 4)
                  .map((event) => (
                    <SystemStageFlowItem
                      key={event.id}
                      title={event.title}
                      value={stageLabels[event.stage]}
                      description={eventSummary(event)}
                      actionLabel={eventTypeLabel(event.type)}
                    />
                  ))
              ) : (
                <SystemStageState
                  state="empty"
                  title="主循环账本还没有事件"
                  description="完成一次启蒙归档、画像更新、知识编译或推演后，这里会出现第一条跨模块记录。"
                  actionLabel="刷新沙盘"
                  onAction={onReload}
                  compact
                />
              )}
            </SystemStagePanel>
          </>
        }
        centerRail={
          <SystemStagePanel
            eyebrow="循环路径"
            title="外脑主循环"
            description="每个模块都要服务这条闭环，否则就会变成孤岛功能。"
            focal
          >
            {operatingLoopStages.map((item) => (
              <SystemStageFlowItem
                key={item.id}
                title={item.title}
                value={item.value}
                description={item.description}
                tone={item.tone}
                onClick={() => onNavigate(sandboxTargetMap[item.target])}
                actionLabel="进入"
              />
            ))}
          </SystemStagePanel>
        }
        rightRail={
          <>
            <SystemStagePanel
              eyebrow="项目智能"
              title="项目网络"
              description="先看项目分类，再看项目之间能否通过突触产生复利。"
            >
              {projectIntelligenceItems.map((item) => renderDeckItem(item, onNavigate))}
            </SystemStagePanel>

            <SystemStagePanel
              eyebrow="执行层"
              title="执行与自动化"
              description="把推演结果交给 Agent、定时器和控制面板，而不是停留在报告。"
            >
              {executionLayerItems.map((item) => renderDeckItem(item, onNavigate))}
            </SystemStagePanel>

            <SystemStagePanel
              eyebrow="学习队列"
              title="复盘学习"
              description={
                learningSummary.total > 0
                  ? `平均可信分 ${learningSummary.averageScore}，证据覆盖 ${learningSummary.evidenceCoverage}%。`
                  : '等待执行收据后自动生成复盘队列。'
              }
            >
              {executionLearning.reviews.length > 0 ? (
                executionLearning.reviews.map((review) => (
                  <SystemStageFlowItem
                    key={review.id}
                    title={review.subject}
                    value={`${review.score} · ${review.label}`}
                    description={review.summary}
                    meta={review.nextStep}
                    tone={reviewTone(review)}
                    onClick={() => onNavigate(sandboxTargetMap[review.target])}
                    actionLabel="复盘"
                  />
                ))
              ) : (
                <SystemStageState
                  state="empty"
                  title={learningSummary.strongestSignal}
                  description={learningSummary.nextAction}
                  detail="下一次 Agent、Cron 或工具调用写入收据后，系统会自动生成复盘队列。"
                  actionLabel="打开执行层"
                  onAction={() => onNavigate('control')}
                  compact
                />
              )}
            </SystemStagePanel>

            <SystemStagePanel
              eyebrow="执行证据"
              title="执行收据"
              description={
                executionReceipts.length > 0
                  ? '最近 Agent 与工具执行的可信度、风险和复盘出口。'
                  : '等待 Agent 或工具执行写入收据。'
              }
            >
              {executionReceipts.length > 0 ? (
                executionReceipts.map(({ event, receipt }) => (
                  <SystemStageFlowItem
                    key={event.id}
                    title={receipt.subject}
                    value={riskLabel(receipt.trust.risk)}
                    description={receipt.outputPreview}
                    meta={receipt.retry.nextStep}
                    tone={receiptTone(receipt)}
                    onClick={() => onNavigate(receiptTarget(receipt))}
                    actionLabel={receiptActionLabel(receipt)}
                  />
                ))
              ) : (
                <SystemStageState
                  state="empty"
                  title="等待执行收据"
                  description="下一次 Agent、Cron 或工具调用后会在这里出现可信度、风险和复盘出口。"
                  detail="没有收据时不再误判为系统空白。"
                  actionLabel="查看团队 Agent"
                  onAction={() => onNavigate('teams')}
                  compact
                />
              )}
            </SystemStagePanel>
          </>
        }
        footer={
          <>
            <SystemStagePanel
              eyebrow="每日指挥简报"
              title="沙盘每日简报"
              description={`${dailyBrief.dateLabel} · ${dailyBrief.headline}`}
              className="sandbox-map__daily-brief"
            >
              <div className="sandbox-map__daily-brief-summary">
                <div className="sandbox-map__daily-brief-score">
                  <span className="sandbox-map__daily-brief-score-label">就绪度</span>
                  <span className="sandbox-map__daily-brief-score-value">{dailyBrief.readinessScore}</span>
                </div>
                <div className="sandbox-map__daily-brief-focus">
                  <span>今日主线</span>
                  <strong>{dailyBrief.focus}</strong>
                </div>
              </div>

              <div className="sandbox-map__daily-brief-grid">
                {dailyBrief.sections.map((section) => (
                  <div key={section.id} className="sandbox-map__daily-brief-section">
                    <div className="sandbox-map__daily-brief-section-header">
                      <span>{section.eyebrow}</span>
                      <strong>{section.title}</strong>
                    </div>
                    {section.items.map((item) => renderDeckItem(item, onNavigate))}
                  </div>
                ))}
              </div>
            </SystemStagePanel>

            <SystemStagePanel
              eyebrow="神经网络"
              title="项目神经网络"
              description={`${projectNeuralNetwork.nodes.length} 个节点 · ${projectNeuralNetwork.links.length} 条连接 · ${projectNeuralNetwork.summary.strongestSignal}`}
              className="sandbox-map__network"
            >
              <div className="sandbox-map__network-stats">
                <div>
                  <span>项目节点</span>
                  <strong>{projectNeuralNetwork.summary.projectNodes}</strong>
                </div>
                <div>
                  <span>记忆节点</span>
                  <strong>{projectNeuralNetwork.summary.memoryNodes}</strong>
                </div>
                <div>
                  <span>知识节点</span>
                  <strong>{projectNeuralNetwork.summary.knowledgeNodes}</strong>
                </div>
                <div>
                  <span>执行节点</span>
                  <strong>{projectNeuralNetwork.summary.agentNodes}</strong>
                </div>
              </div>

              <div className="sandbox-map__network-grid">
                {(['project', 'memory', 'knowledge', 'agent'] as ProjectNeuralNodeType[]).map((type) => {
                  const nodes = projectNeuralNetwork.nodes.filter((node) => node.type === type).slice(0, 5)
                  return (
                    <div key={type} className="sandbox-map__network-lane">
                      <div className="sandbox-map__network-lane-title">{networkTypeLabels[type]}</div>
                      {nodes.length > 0 ? (
                        nodes.map((node) => renderNetworkNode(node, onNavigate))
                      ) : (
                        <SystemStageState
                          state="empty"
                          title={`${networkTypeLabels[type]}待接入`}
                          description="当对应数据写入主循环后，这一列会自动出现节点。"
                          compact
                        />
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="sandbox-map__network-links">
                {projectNeuralNetwork.links.length > 0 ? (
                  projectNeuralNetwork.links.slice(0, 6).map((link) => (
                    <div key={link.id} className="sandbox-map__network-link">
                      <span>{link.label}</span>
                      <strong>{link.strength}</strong>
                    </div>
                  ))
                ) : (
                  <SystemStageState
                    state="empty"
                    title="等待第一条跨节点连接"
                    description="项目突触、知识编译、Boss 记忆或执行行动回写后，这里会形成可追踪连接。"
                    compact
                  />
                )}
              </div>
            </SystemStagePanel>
          </>
        }
      />
    </div>
  )
}
