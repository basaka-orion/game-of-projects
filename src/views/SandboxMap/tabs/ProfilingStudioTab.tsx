import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../../../components/EmptyState'
import type { BossAssessmentRun } from '../../../lib/boss/profiling/types'
import { getAssessmentRuns, getAssessmentTimeline, getLatestAssessmentRun } from '../../../lib/boss/profiling/service'
import { dbGetLatestBossProfileSnapshot, dbListBossProfileSnapshots, type BossProfileSnapshotRow } from '../../../lib/db/repository'
import { navigateSandboxTab } from '../navigation'
import { SystemStageFlowItem, SystemStagePanel, SystemStageShell } from '../components/SystemStage'

interface SnapshotDiff {
  changedKeys?: string[]
  previous?: Record<string, string>
  next?: Record<string, string>
}

interface MetricConfig {
  key: string
  label: string
  color: string
  value: (run: BossAssessmentRun) => number
}

function modeLabel(mode: BossAssessmentRun['mode'] | 'quick' | 'deep' | 'dialogue'): string {
  switch (mode) {
    case 'quick':
      return '快速画像'
    case 'deep':
      return '完整测评'
    case 'dialogue':
      return '对话锚定'
  }
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function parseSnapshotDiff(row: BossProfileSnapshotRow | null): SnapshotDiff | null {
  if (!row?.diff_json) return null
  try {
    return JSON.parse(row.diff_json) as SnapshotDiff
  } catch {
    return null
  }
}

function humanizeKey(key: string): string {
  const labels: Record<string, string> = {
    name: 'Boss 名称',
    interests: '兴趣领域',
    hates: '禁区 / 厌恶',
    preferredStyle: '工作风格',
    riskTolerance: '风险容忍',
    innovationBias: '创新偏好',
    resourceStyle: '资源风格',
    decisionSpeed: '决策节奏',
    long_term_vision: '长期愿景',
    current_focus: '当前焦点',
    cognitive_profile_json: '认知操作系统',
    profiling_summary_json: '画像摘要',
  }
  return labels[key] || key
}

function formatDelta(value: number): string {
  if (value === 0) return '持平'
  return `${value > 0 ? '+' : ''}${value}`
}

function summarizeStageShift(current: BossAssessmentRun, previous: BossAssessmentRun): string[] {
  const notes: string[] = []

  if (current.normalized.operational.preferredStyle !== previous.normalized.operational.preferredStyle) {
    notes.push(`工作风格从「${previous.normalized.summary.headline}」进一步转向「${current.normalized.summary.headline}」`)
  }

  if (current.normalized.operational.currentFocus !== previous.normalized.operational.currentFocus) {
    notes.push(
      current.normalized.operational.currentFocus
        ? `阶段焦点从「${previous.normalized.operational.currentFocus || '未定义'}」切换到「${current.normalized.operational.currentFocus}」`
        : '当前阶段焦点被收回，系统需要重新收束短期方向'
    )
  }

  if (current.normalized.operational.longTermVision !== previous.normalized.operational.longTermVision) {
    notes.push(
      current.normalized.operational.longTermVision
        ? `长期愿景从「${previous.normalized.operational.longTermVision || '未定义'}」演化为「${current.normalized.operational.longTermVision}」`
        : '长期愿景暂时被置空，说明系统在等待新的北极星'
    )
  }

  const deltas = [
    {
      label: '执行纪律',
      value: current.normalized.dimensions.motivation.execution_drive - previous.normalized.dimensions.motivation.execution_drive,
      higher: '执行推进更稳了',
      lower: '执行节奏有所回落，需要外部约束',
    },
    {
      label: '探索广度',
      value: current.normalized.dimensions.cognition.curiosity_breadth - previous.normalized.dimensions.cognition.curiosity_breadth,
      higher: '探索半径明显变大了',
      lower: '探索半径收束，说明系统在进入聚焦态',
    },
    {
      label: '世界观驱动',
      value: current.normalized.dimensions.worldview.meaning_drive - previous.normalized.dimensions.worldview.meaning_drive,
      higher: '更偏向长期叙事和意义牵引',
      lower: '更偏向阶段执行与现实推进',
    },
  ].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))

  if (deltas[0] && Math.abs(deltas[0].value) >= 6) {
    notes.push(`${deltas[0].label} ${formatDelta(deltas[0].value)}，${deltas[0].value > 0 ? deltas[0].higher : deltas[0].lower}`)
  }

  return notes.slice(0, 4)
}

function SignalTrajectory({
  title,
  color,
  values,
}: {
  title: string
  color: string
  values: number[]
}) {
  const width = 220
  const height = 76
  const paddingX = 8
  const paddingY = 10

  if (values.length === 0) return null

  const points = values.map((value, index) => {
    const x = paddingX + (index * (width - paddingX * 2)) / Math.max(values.length - 1, 1)
    const y = height - paddingY - ((value / 100) * (height - paddingY * 2))
    return `${x},${y}`
  }).join(' ')

  const latest = values[values.length - 1]
  const previous = values[Math.max(values.length - 2, 0)]
  const delta = latest - previous

  return (
    <div className="sandbox-map__profiling-metric-card">
      <div className="sandbox-map__profiling-metric-head">
        <span className="sandbox-map__profiling-metric-title">{title}</span>
        <span className="sandbox-map__profiling-metric-value">{latest}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="sandbox-map__profiling-metric-chart" role="img" aria-label={`${title}成长轨迹`}>
        <defs>
          <linearGradient id={`metric-${title}`} x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} className="sandbox-map__profiling-axis" />
        <polyline
          points={`${paddingX},${height - paddingY} ${points} ${width - paddingX},${height - paddingY}`}
          fill={`url(#metric-${title})`}
          stroke="none"
        />
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="sandbox-map__profiling-metric-foot">
        <span>{values.length} 个画像样本</span>
        <span className={delta >= 0 ? 'sandbox-map__profiling-delta--up' : 'sandbox-map__profiling-delta--down'}>
          {formatDelta(delta)}
        </span>
      </div>
    </div>
  )
}

export default function ProfilingStudioTab() {
  const [latestRun, setLatestRun] = useState<BossAssessmentRun | null>(null)
  const [runs, setRuns] = useState<BossAssessmentRun[]>([])
  const [timeline, setTimeline] = useState<Array<{
    id: string
    mode: 'quick' | 'deep' | 'dialogue'
    createdAt: string
    confidence: number
  }>>([])
  const [latestSnapshot, setLatestSnapshot] = useState<BossProfileSnapshotRow | null>(null)
  const [snapshotTimeline, setSnapshotTimeline] = useState<BossProfileSnapshotRow[]>([])

  useEffect(() => {
    async function load() {
      const [run, runRows, timelineRows, snapshot, snapshots] = await Promise.all([
        getLatestAssessmentRun(),
        getAssessmentRuns(8),
        getAssessmentTimeline(),
        dbGetLatestBossProfileSnapshot(),
        dbListBossProfileSnapshots(8),
      ])
      setLatestRun(run)
      setRuns(runRows)
      setTimeline(timelineRows)
      setLatestSnapshot(snapshot || null)
      setSnapshotTimeline(snapshots)
    }

    load().catch(() => {})
  }, [])

  const latestDiff = useMemo(() => parseSnapshotDiff(latestSnapshot), [latestSnapshot])
  const totalRuns = timeline.length
  const deepRuns = timeline.filter(item => item.mode === 'deep').length
  const latestChangedKeys = latestDiff?.changedKeys || []
  const latestSummary = latestRun?.normalized.summary
  const recommendedResearchTopics = latestSummary?.recommendedResearchTopics || []
  const recommendedAgents = latestSummary?.recommendedAgents || []
  const orderedRuns = useMemo(() => [...runs].reverse(), [runs])
  const previousRun = runs[1] || null
  const stageShiftNotes = useMemo(
    () => (latestRun && previousRun ? summarizeStageShift(latestRun, previousRun) : []),
    [latestRun, previousRun]
  )
  const metricConfigs: MetricConfig[] = useMemo(() => ([
    {
      key: 'execution',
      label: '执行纪律',
      color: 'var(--hd-accent-cyan)',
      value: run => run.normalized.dimensions.motivation.execution_drive,
    },
    {
      key: 'curiosity',
      label: '探索广度',
      color: '#FFD740',
      value: run => run.normalized.dimensions.cognition.curiosity_breadth,
    },
    {
      key: 'worldview',
      label: '世界观驱动',
      color: '#BB86FC',
      value: run => run.normalized.dimensions.worldview.meaning_drive,
    },
    {
      key: 'innovation',
      label: '创新偏好',
      color: '#4FC3F7',
      value: run => run.normalized.operational.innovationBias,
    },
  ]), [])

  return (
    <div className="sandbox-map__tab">
      <div className="sandbox-map__profiling-hub-view sandbox-map__stage-view">
        <SystemStageShell
          eyebrow="profiling orchestration"
          title="画像工坊不该是一堆报告卡片，而应该是系统里最清晰的自我镜面"
          description="这里现在把画像的主角、阶段变迁、下游联动和证据时间线拆开了。你会先看到当下的核心画像，再看到它如何反向牵引 Boss、推演室、记忆宫殿和知识整理。"
          metrics={[
            { label: '画像样本', value: totalRuns || '--', detail: totalRuns > 0 ? '进入主循环' : '等待首个样本' },
            { label: '完整测评', value: deepRuns || '--', detail: '决定主画像置信度', tone: 'accent' },
            { label: '最近可信度', value: latestRun ? `${Math.round(latestRun.confidence * 100)}%` : '--', detail: latestRun ? modeLabel(latestRun.mode) : '未生成', tone: 'success' },
            { label: '写回字段', value: latestChangedKeys.length || '--', detail: latestChangedKeys.length > 0 ? '本轮已经影响系统' : '等待写回', tone: latestChangedKeys.length > 0 ? 'warning' : 'default' },
          ]}
          actions={[
            { label: '进入完整画像工坊', href: '#/profiling', variant: 'primary' },
            { label: '返回 Openbasaka', href: '#/' },
          ]}
          leftRail={
            <>
              <SystemStagePanel
                eyebrow="upstream"
                title="输入证据"
                description="先看画像为什么成立，再去看它改写了哪里。"
              >
                {timeline.length === 0 ? (
                  <EmptyState icon="🧠" title="还没有画像记录" description="先做第一次画像，整个系统联动才会真正活起来。" />
                ) : (
                  timeline.slice(0, 4).map(item => (
                    <SystemStageFlowItem
                      key={item.id}
                      title={modeLabel(item.mode)}
                      value={`${Math.round(item.confidence * 100)}%`}
                      description={formatTime(item.createdAt)}
                      meta={`run ${item.id.slice(0, 8)}`}
                      tone={item.mode === 'deep' ? 'accent' : 'default'}
                    />
                  ))
                )}
              </SystemStagePanel>

              <SystemStagePanel
                eyebrow="stage shift"
                title="阶段偏移"
                description="这不是把两个报告并排，而是告诉你这轮画像究竟把方向推向了哪里。"
              >
                {!latestRun || !previousRun ? (
                  <EmptyState icon="🪞" title="还没有可对照阶段" description="至少两次画像后，这里才会出现真正的阶段迁移。" />
                ) : (
                  <>
                    <div className="sandbox-map__stage-compare">
                      <div className="sandbox-map__stage-compare-card">
                        <span className="sandbox-map__stage-compare-label">上一阶段</span>
                        <div className="sandbox-map__stage-compare-title">{previousRun.normalized.summary.headline}</div>
                        <div className="sandbox-map__stage-compare-meta">{formatTime(previousRun.createdAt)}</div>
                      </div>
                      <div className="sandbox-map__stage-compare-arrow">→</div>
                      <div className="sandbox-map__stage-compare-card sandbox-map__stage-compare-card--active">
                        <span className="sandbox-map__stage-compare-label">当前阶段</span>
                        <div className="sandbox-map__stage-compare-title">{latestRun.normalized.summary.headline}</div>
                        <div className="sandbox-map__stage-compare-meta">{formatTime(latestRun.createdAt)}</div>
                      </div>
                    </div>
                    <div className="sandbox-map__stage-note-list">
                      {(stageShiftNotes.length > 0 ? stageShiftNotes : ['这一阶段更像持续校准，而不是方向突变。']).map(note => (
                        <div key={note} className="sandbox-map__stage-note-item">{note}</div>
                      ))}
                    </div>
                  </>
                )}
              </SystemStagePanel>
            </>
          }
          centerRail={
            <>
              <SystemStagePanel
                eyebrow="focal portrait"
                title={latestRun ? latestRun.normalized.summary.headline : '等待你的第一张画像'}
                description={latestRun ? latestRun.normalized.summary.narrative : '现在的中轴会在完成画像后出现。它会成为后续 Boss、推演室、记忆与知识编排的中心参考。'}
                focal
                tone="accent"
              >
                {latestRun ? (
                  <>
                    <div className="sandbox-map__focal-stats">
                      <div className="sandbox-map__focal-stat">
                        <span className="sandbox-map__focal-stat-label">当前焦点</span>
                        <span className="sandbox-map__focal-stat-value">{latestRun.normalized.operational.currentFocus || '等待你亲自命名'}</span>
                      </div>
                      <div className="sandbox-map__focal-stat">
                        <span className="sandbox-map__focal-stat-label">长期方向</span>
                        <span className="sandbox-map__focal-stat-value">{latestRun.normalized.operational.longTermVision || '还未显性展开'}</span>
                      </div>
                      <div className="sandbox-map__focal-stat">
                        <span className="sandbox-map__focal-stat-label">最近写回</span>
                        <span className="sandbox-map__focal-stat-value">{latestChangedKeys.length > 0 ? `${latestChangedKeys.length} 个字段被重写` : '暂未写回'}</span>
                      </div>
                    </div>

                    <div className="sandbox-map__focal-band">
                      <div className="sandbox-map__focal-band-title">系统会优先按这张画像调整</div>
                      <div className="sandbox-map__stage-chip-cloud">
                        {['聊天上下文', '推演室 Boss Match', '自动研究', '知识整理', '群策协作'].map(item => (
                          <span key={item} className="sandbox-map__boss-tag">{item}</span>
                        ))}
                      </div>
                    </div>

                    {recommendedResearchTopics.length > 0 && (
                      <div className="sandbox-map__focal-band">
                        <div className="sandbox-map__focal-band-title">推荐研究方向</div>
                        <div className="sandbox-map__stage-chip-cloud">
                          {recommendedResearchTopics.map(item => (
                            <span key={item} className="sandbox-map__boss-tag">{item}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {recommendedAgents.length > 0 && (
                      <div className="sandbox-map__focal-band">
                        <div className="sandbox-map__focal-band-title">推荐角色路由</div>
                        <div className="sandbox-map__stage-chip-cloud">
                          {recommendedAgents.map(item => (
                            <span key={item} className="sandbox-map__boss-tag">{item}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <EmptyState icon="🧠" title="画像中轴等待生成" description="先进入完整画像工坊完成一次测评，系统才会知道该围绕什么来组织自己。" />
                )}
              </SystemStagePanel>

            </>
          }
          rightRail={
            <>
              <SystemStagePanel
                eyebrow="downstream"
                title="系统联动"
                description="这里现在是可点击的，不再只是说“会影响”，而是直接带你去看被影响的房间。"
              >
                <SystemStageFlowItem
                  title="Boss Core"
                  value={latestRun ? '画像已接管主档' : '等待画像'}
                  description="查看这张画像如何改写 Boss 的风格、焦点和认知操作系统。"
                  actionLabel="open"
                  tone="accent"
                  onClick={() => navigateSandboxTab('boss')}
                />
                <SystemStageFlowItem
                  title="推演室"
                  value="Boss Match / 愿景对齐"
                  description="去看这张画像会如何改变项目推演时的取舍与倾向。"
                  actionLabel="open"
                  onClick={() => navigateSandboxTab('warroom')}
                />
                <SystemStageFlowItem
                  title="记忆宫殿"
                  value="记忆编排"
                  description="查看画像如何影响记忆提炼、归档路径和后续回忆优先级。"
                  actionLabel="open"
                  onClick={() => navigateSandboxTab('memory')}
                />
                <SystemStageFlowItem
                  title="知识库 / 神经元"
                  value="解释方式"
                  description="回到知识与项目模块，看系统如何按你的画像改写表达与聚焦。"
                  actionLabel="jump"
                  onClick={() => navigateSandboxTab('knowledge')}
                />
              </SystemStagePanel>

              <SystemStagePanel
                eyebrow="latest rewrite"
                title="最近一次写回差异"
                description="最重要的不是“做了测评”，而是哪些字段真的被改写了。"
              >
                {!latestDiff || latestChangedKeys.length === 0 ? (
                  <EmptyState icon="📼" title="暂时没有画像差异" description="做完一次完整测评并写回 Boss 后，这里会显示被重写的字段。" />
                ) : (
                  latestChangedKeys.slice(0, 5).map(key => (
                    <SystemStageFlowItem
                      key={key}
                      title={humanizeKey(key)}
                      description={latestDiff.next?.[key] || '空'}
                      meta={`从 ${latestDiff.previous?.[key] || '空'} → 现在`}
                      tone="warning"
                    />
                  ))
                )}
              </SystemStagePanel>

              <SystemStagePanel
                eyebrow="snapshot memory"
                title="写回快照"
                description="每次画像进入主档时，系统都会留下这轮影响的痕迹。"
              >
                {snapshotTimeline.length === 0 ? (
                  <EmptyState icon="🗃️" title="还没有快照记录" description="当画像真正写回系统主档时，这里会开始沉淀每次应用的快照。" />
                ) : (
                  snapshotTimeline.slice(0, 4).map(item => {
                    const diff = parseSnapshotDiff(item)
                    const keys = diff?.changedKeys || []
                    return (
                      <SystemStageFlowItem
                        key={item.id}
                        title={formatTime(item.created_at)}
                        description={keys.length > 0 ? keys.map(humanizeKey).join(' · ') : '无字段变化'}
                        meta={item.source}
                        tone={keys.length > 0 ? 'success' : 'default'}
                      />
                    )
                  })
                )}
              </SystemStagePanel>
            </>
          }
          footer={
            <div className="sandbox-map__profiling-footer-stack">
              <SystemStagePanel
                eyebrow="growth signature"
                title="成长轨迹"
                description="不再把数值堆成表，而是直接展示你在关键维度上的推移方向。"
                className="sandbox-map__profiling-growth-panel"
              >
                {orderedRuns.length < 2 ? (
                  <EmptyState icon="📈" title="成长轨迹尚未形成" description="至少完成两次画像后，系统才知道你是在发散、收束还是转向。" />
                ) : (
                  <div className="sandbox-map__profiling-metrics-grid">
                    {metricConfigs.map(metric => (
                      <SignalTrajectory
                        key={metric.key}
                        title={metric.label}
                        color={metric.color}
                        values={orderedRuns.map(run => metric.value(run))}
                      />
                    ))}
                  </div>
                )}
              </SystemStagePanel>

              <div className="sandbox-map__stage-footer-grid sandbox-map__profiling-footer-grid">
                <SystemStagePanel
                  eyebrow="full timeline"
                  title="画像时间线"
                  description="把画像看成一条不断修正自己的线，而不是一份一次性的测试结果。"
                >
                  {timeline.length === 0 ? (
                    <EmptyState icon="⏳" title="暂无时间线" description="测评 run 会按时间记录在这里，方便你看画像是如何变化的。" />
                  ) : (
                    <div className="sandbox-map__profiling-timeline">
                      {timeline.map(item => (
                        <div key={item.id} className="sandbox-map__profiling-timeline-item">
                          <div className="sandbox-map__profiling-timeline-dot" />
                          <div className="sandbox-map__profiling-timeline-body">
                            <div className="sandbox-map__profiling-timeline-head">
                              <span className="sandbox-map__profiling-timeline-mode">{modeLabel(item.mode)}</span>
                              <span className="sandbox-map__profiling-timeline-time">{formatTime(item.createdAt)}</span>
                            </div>
                            <div className="sandbox-map__profiling-timeline-meta">
                              run: {item.id.slice(0, 8)} · 可信度 {Math.round(item.confidence * 100)}%
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SystemStagePanel>

                <SystemStagePanel
                  eyebrow="snapshot archive"
                  title="写回快照档案"
                  description="这里保存的是“系统被你哪一轮画像推偏了什么”。"
                >
                  {snapshotTimeline.length === 0 ? (
                    <EmptyState icon="🗂️" title="暂无快照档案" description="当画像真正写回主档时，这里会自动生成影响档案。" />
                  ) : (
                    <div className="sandbox-map__profiling-snapshots">
                      {snapshotTimeline.map(item => {
                        const diff = parseSnapshotDiff(item)
                        const keys = diff?.changedKeys || []
                        return (
                          <div key={item.id} className="sandbox-map__profiling-snapshot-item">
                            <div className="sandbox-map__profiling-snapshot-head">
                              <span>{formatTime(item.created_at)}</span>
                              <span>{item.source}</span>
                            </div>
                            <div className="sandbox-map__stage-chip-cloud">
                              {keys.length > 0 ? keys.map(key => (
                                <span key={key} className="sandbox-map__boss-tag">{humanizeKey(key)}</span>
                              )) : (
                                <span className="sandbox-map__boss-tag">无字段变化</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </SystemStagePanel>
              </div>
            </div>
          }
        />
      </div>
    </div>
  )
}
