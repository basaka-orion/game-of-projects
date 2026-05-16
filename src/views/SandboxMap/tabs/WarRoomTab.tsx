/**
 * WarRoomTab — 愿景对齐中枢 + 多角色推演室
 *
 * 这一页不再只是“再跑一次角色评估”，而是负责回答两件事：
 * 1. 这个系统离 Boss 想要的外脑操作系统还有多远？
 * 2. 当前项目组合里，最值得突破、连接、重构的点在哪里？
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import GridCard from '../../../components/GridCard'
import EmptyState from '../../../components/EmptyState'
import StatusBadge from '../../../components/StatusBadge'
import CollapsibleSection from '../../../components/CollapsibleSection'
import { getAllProjects, type StoredProject } from '../../../lib/db/store'
import { dbGetAllSynapses, query } from '../../../lib/db/repository'
import { listAllAgents, AgentDefinition } from '../../../lib/agents/registry'
import { getAllWarRoles, runRole } from '../../../lib/ai/roles'
import { resolveAgentConfig } from '../../../lib/ai/provider'
import type { ProjectTaxonomy, StructuredAnalysis } from '../../../lib/ai/classifier'
import { loadBossState } from '../../../lib/boss/profile'
import {
  computeVisionAlignmentReport,
  type VisionAlignmentReport,
  type VisionStatus,
} from '../../../lib/vision/alignment'
import { navigateSandboxTab } from '../navigation'
import { SystemStageFlowItem, SystemStagePanel, SystemStageShell } from '../components/SystemStage'
import { buildWarRoomActionPlan, materializeWarRoomActionPlan } from '../../../lib/war-room/action-plan'
import './WarRoomTab.css'

interface WarResult {
  roleId: string
  roleName: string
  roleIcon: string
  data: Record<string, unknown> | null
  verdict: string
  loading: boolean
  error?: string
}

interface TaxonomySnapshotRow {
  project_id: string
  taxonomy_json: string
  analysis_json: string
}

type TaxonomySnapshot = Record<string, { taxonomy: ProjectTaxonomy; analysis: StructuredAnalysis }>

async function getCount(sql: string, params: unknown[] = []): Promise<number> {
  try {
    const rows = await query<{ cnt: number }>(sql, params)
    return rows[0]?.cnt || 0
  } catch {
    return 0
  }
}

export default function WarRoomTab() {
  const [projects, setProjects] = useState<StoredProject[]>([])
  const [agents, setAgents] = useState<AgentDefinition[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<WarResult[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [actionStatus, setActionStatus] = useState('')
  const [alignmentReport, setAlignmentReport] = useState<VisionAlignmentReport | null>(null)
  const [alignmentLoading, setAlignmentLoading] = useState(true)

  const loadAlignment = useCallback(async (projectSnapshot: StoredProject[]) => {
    setAlignmentLoading(true)

    try {
      const [
        synapses,
        bossState,
        taxonomyRows,
        bossMemoryCount,
        drawerCount,
        uncompiledDrawerCount,
        wingCount,
        wikiPageCount,
        wikiSourceCount,
        skillEvolutionCount,
        scheduledTaskCount,
        teamCount,
        customAgentCount,
      ] = await Promise.all([
        dbGetAllSynapses(),
        loadBossState(),
        query<TaxonomySnapshotRow>('SELECT project_id, taxonomy_json, analysis_json FROM project_taxonomy'),
        getCount('SELECT COUNT(*) as cnt FROM boss_memory'),
        getCount('SELECT COUNT(*) as cnt FROM mempalace_drawers'),
        getCount('SELECT COUNT(*) as cnt FROM mempalace_drawers WHERE is_compiled = 0'),
        getCount('SELECT COUNT(DISTINCT wing) as cnt FROM mempalace_drawers'),
        getCount('SELECT COUNT(*) as cnt FROM wiki_pages WHERE is_index = 0 AND is_log = 0'),
        getCount('SELECT COUNT(*) as cnt FROM wiki_sources'),
        getCount('SELECT COUNT(*) as cnt FROM skill_evolution'),
        getCount('SELECT COUNT(*) as cnt FROM scheduled_tasks WHERE enabled = 1'),
        getCount("SELECT COUNT(*) as cnt FROM teams WHERE status = 'active'"),
        getCount('SELECT COUNT(*) as cnt FROM custom_agents'),
      ])

      const taxonomies = taxonomyRows.reduce<TaxonomySnapshot>((acc, row) => {
        try {
          acc[row.project_id] = {
            taxonomy: JSON.parse(row.taxonomy_json || '{}') as ProjectTaxonomy,
            analysis: JSON.parse(row.analysis_json || '{}') as StructuredAnalysis,
          }
        } catch {
          // ignore invalid rows
        }
        return acc
      }, {})

      setAlignmentReport(
        computeVisionAlignmentReport({
          projects: projectSnapshot,
          taxonomies,
          synapses,
          bossState,
          bossMemoryCount,
          wikiPageCount,
          wikiSourceCount,
          drawerCount,
          uncompiledDrawerCount,
          wingCount,
          skillEvolutionCount,
          scheduledTaskCount,
          teamCount,
          customAgentCount,
        }),
      )
    } catch {
      setAlignmentReport(
        computeVisionAlignmentReport({
          projects: projectSnapshot,
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
        }),
      )
    } finally {
      setAlignmentLoading(false)
    }
  }, [])

  useEffect(() => {
    async function bootstrap() {
      const [projectList, agentList] = await Promise.all([getAllProjects(), listAllAgents()])
      setProjects(projectList)
      setAgents(agentList.filter((agent) => agent.isCustom))
      if (projectList.length > 0) setSelectedProjectId(projectList[0].id)
      await loadAlignment(projectList)
    }

    bootstrap()
  }, [loadAlignment])

  const allRoles = getAllWarRoles(agents)
  const selectedProject = projects.find((project) => project.id === selectedProjectId)
  const actionPlan = useMemo(() => {
    if (!selectedProject) return null
    return buildWarRoomActionPlan({
      project: selectedProject,
      nextActions: alignmentReport?.nextActions,
      roleSignals: results
        .filter((result) => !result.loading)
        .map((result) => ({
          roleName: result.roleName,
          verdict: result.verdict,
          risks: readStringArray(result.data, 'risks', 'red_flags', 'threats'),
          opportunities: readStringArray(result.data, 'opportunities', 'strengths'),
          advice: readStringValue(result.data, 'advice', 'suggested_pivot'),
        })),
    })
  }, [alignmentReport?.nextActions, results, selectedProject])

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) => {
      const next = new Set(prev)
      if (next.has(roleId)) next.delete(roleId)
      else next.add(roleId)
      return next
    })
  }

  const selectAllDefault = () => {
    const defaultIds = allRoles.filter((role) => !role.unlockRequirement).map((role) => role.id)
    setSelectedRoleIds(new Set(defaultIds))
  }

  const runWarRoom = useCallback(async () => {
    if (!selectedProject || selectedRoleIds.size === 0) return
    setIsRunning(true)
    setActionStatus('')

    const brief = `项目: ${selectedProject.title}
一句话: ${selectedProject.oneLiner || '无'}
标签: ${selectedProject.tags.join(', ') || '无'}
生存率: ${selectedProject.survivalRate ?? '未评估'}%
摘要: ${selectedProject.summary || '暂无'}`

    const initResults: WarResult[] = allRoles
      .filter((role) => selectedRoleIds.has(role.id))
      .map((role) => ({
        roleId: role.id,
        roleName: role.name,
        roleIcon: role.icon,
        data: null,
        verdict: '',
        loading: true,
      }))

    setResults(initResults)

    for (const role of allRoles.filter((candidate) => selectedRoleIds.has(candidate.id))) {
      try {
        const config = resolveAgentConfig(role.id)
        const result = await runRole(config, role, brief)
        setResults((prev) =>
          prev.map((item) =>
            item.roleId === role.id ? { ...item, data: result.data, verdict: result.verdict, loading: false } : item,
          ),
        )
      } catch (err) {
        setResults((prev) =>
          prev.map((item) => (item.roleId === role.id ? { ...item, loading: false, error: String(err) } : item)),
        )
      }
    }

    setIsRunning(false)
  }, [selectedProject, selectedRoleIds, allRoles])

  const materializeActionPlan = useCallback(async () => {
    if (!actionPlan) return
    setActionStatus('正在生成执行任务...')
    try {
      const result = await materializeWarRoomActionPlan(actionPlan)
      setActionStatus(
        `已生成 ${result.taskIds.length} 个 Scheduler 任务，并写入 ${result.eventIds.length} 条主循环事件。`,
      )
    } catch (err) {
      setActionStatus(`生成失败：${String(err)}`)
    }
  }, [actionPlan])

  const overallRoleScore =
    results
      .filter((result) => result.data?.scores)
      .reduce((sum, result) => {
        const scores = result.data?.scores as Record<string, number>
        const avg =
          Object.values(scores).reduce((acc, value) => acc + value, 0) / Math.max(Object.values(scores).length, 1)
        return sum + avg
      }, 0) / Math.max(results.filter((result) => result.data?.scores).length, 1)

  return (
    <div className="warroom-tab">
      <SystemStageShell
        eyebrow="推演室"
        title="推演室应该先给出此刻战局的主判断，再带你拆支柱、项目与突触"
        description={
          alignmentLoading
            ? '正在核对项目、Boss、记忆、知识与进化这五条主线...'
            : alignmentReport?.narrative || '等待对齐分析生成战局判断。'
        }
        metrics={[
          {
            label: '愿景对齐度',
            value: alignmentLoading ? '--' : (alignmentReport?.overallScore ?? 0),
            detail: '当前主线拉直程度',
            tone: 'accent',
          },
          { label: '项目样本', value: projects.length, detail: '进入战局的项目' },
          {
            label: '参战角色',
            value: selectedRoleIds.size,
            detail: `${allRoles.length} 个角色可调用`,
            tone: 'warning',
          },
          {
            label: '突触连接',
            value: alignmentReport?.topSynapses.length ?? 0,
            detail: '当前最强跨项目连接',
            tone: 'success',
          },
        ]}
        actions={[
          { label: '去看神经元', onClick: () => navigateSandboxTab('neurons') },
          { label: '查看 Boss', onClick: () => navigateSandboxTab('boss'), variant: 'primary' },
        ]}
        leftRail={
          <>
            <SystemStagePanel
              eyebrow="战局状态"
              title="当前战局"
              description="先知道现在是开始成形、正在拉直，还是已经明显偏离。"
            >
              <SystemStageFlowItem
                title="总体状态"
                value={
                  alignmentLoading
                    ? '--'
                    : (alignmentReport?.overallScore ?? 0) >= 75
                      ? '开始成形'
                      : (alignmentReport?.overallScore ?? 0) >= 45
                        ? '正在拉直'
                        : '偏离明显'
                }
                description={alignmentReport?.narrative || '等待分析'}
                tone="accent"
              />
              {(alignmentReport?.nextActions || []).slice(0, 3).map((action) => (
                <SystemStageFlowItem key={action} title="下一步" description={action} tone="warning" />
              ))}
            </SystemStagePanel>

            <SystemStagePanel
              eyebrow="跨项目张力"
              title="关键突触"
              description="真正值得优先看的，是项目之间最强的连接张力。"
            >
              {alignmentReport?.topSynapses.length ? (
                alignmentReport.topSynapses
                  .slice(0, 3)
                  .map((synapse) => (
                    <SystemStageFlowItem
                      key={`${synapse.label}-${synapse.strength}`}
                      title={synapse.label}
                      value={synapse.strength}
                      description={synapse.reason}
                      tone="success"
                    />
                  ))
              ) : (
                <EmptyState
                  icon="🔗"
                  title="还没有强突触"
                  description="等更多项目样本和连接被识别后，这里会出现最强的联动支点。"
                />
              )}
            </SystemStagePanel>
          </>
        }
        centerRail={
          <SystemStagePanel
            eyebrow="主判断"
            title={alignmentLoading ? '对齐分析生成中...' : `愿景对齐度 ${alignmentReport?.overallScore ?? 0}`}
            description="推演室的中心不该是按钮和列表，而是这一轮最关键的总判断，以及它为什么成立。"
            focal
            tone="accent"
          >
            {alignmentLoading ? (
              <div className="warroom-tab__loading-card">对齐分析加载中...</div>
            ) : alignmentReport ? (
              <>
                <div className="sandbox-map__focal-stats">
                  <div className="sandbox-map__focal-stat">
                    <span className="sandbox-map__focal-stat-label">长板数</span>
                    <span className="sandbox-map__focal-stat-value">{alignmentReport.portfolioStrengths.length}</span>
                  </div>
                  <div className="sandbox-map__focal-stat">
                    <span className="sandbox-map__focal-stat-label">短板数</span>
                    <span className="sandbox-map__focal-stat-value">{alignmentReport.portfolioGaps.length}</span>
                  </div>
                  <div className="sandbox-map__focal-stat">
                    <span className="sandbox-map__focal-stat-label">突破口</span>
                    <span className="sandbox-map__focal-stat-value">
                      {alignmentReport.portfolioBreakthroughs.length}
                    </span>
                  </div>
                </div>

                <div className="sandbox-map__focal-band">
                  <div className="sandbox-map__focal-band-title">这一轮最该做的事</div>
                  <div className="sandbox-map__stage-note-list">
                    {alignmentReport.nextActions.slice(0, 4).map((item) => (
                      <div key={item} className="sandbox-map__stage-note-item">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="sandbox-map__focal-band">
                  <div className="sandbox-map__focal-band-title">组合突破口</div>
                  <div className="sandbox-map__stage-chip-cloud">
                    {alignmentReport.portfolioBreakthroughs.slice(0, 5).map((item) => (
                      <span key={item} className="sandbox-map__boss-tag">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </SystemStagePanel>
        }
        rightRail={
          <>
            <SystemStagePanel
              eyebrow="联动房间"
              title="推演室联动"
              description="去看战局上下游，而不是把它当成孤立评分器。"
            >
              <SystemStageFlowItem
                title="神经元"
                value="项目母样本"
                description="回到项目列表，看看哪些样本正在拖累或推动战局。"
                actionLabel="打开"
                tone="accent"
                onClick={() => navigateSandboxTab('neurons')}
              />
              <SystemStageFlowItem
                title="Boss"
                value="愿景主线"
                description="查看这轮战局判断和 Boss 主脑是否仍在同一条叙事线上。"
                actionLabel="打开"
                onClick={() => navigateSandboxTab('boss')}
              />
              <SystemStageFlowItem
                title="突触"
                value="组合连接"
                description="进入突触页，追踪项目之间的高价值连接。"
                actionLabel="打开"
                onClick={() => navigateSandboxTab('synapses')}
              />
            </SystemStagePanel>

            <SystemStagePanel
              eyebrow="项目压力"
              title="高压项目"
              description="先看最值得盯住的项目，而不是平均看一圈。"
            >
              {alignmentReport?.projectInsights.slice(0, 3).map((project) => (
                <SystemStageFlowItem
                  key={project.id}
                  title={project.title}
                  value={project.score}
                  description={
                    project.breakthroughs[0] || project.strengths[0] || project.weaknesses[0] || '等待更清晰的突破口'
                  }
                  meta={`${project.synergyCount} 条突触`}
                  tone={project.score >= 70 ? 'success' : project.score >= 50 ? 'warning' : 'danger'}
                />
              ))}
            </SystemStagePanel>
          </>
        }
        footer={
          alignmentLoading ? null : alignmentReport ? (
            <>
              <div className="warroom-tab__pillars">
                {alignmentReport.pillars.map((pillar) => (
                  <GridCard key={pillar.id} title={pillar.title}>
                    <div className="warroom-tab__pillar-head">
                      <div className="warroom-tab__pillar-score">{pillar.score}</div>
                      <StatusBadge status={statusToBadge(pillar.score)} label={statusLabel(pillar.status)} />
                    </div>
                    <div className="warroom-tab__pillar-summary">{pillar.summary}</div>
                    <div className="warroom-tab__chip-row">
                      {pillar.evidence.map((item) => (
                        <span key={item} className="warroom-tab__chip">
                          {item}
                        </span>
                      ))}
                    </div>
                    <div className="warroom-tab__nextmove">
                      <span className="warroom-tab__nextmove-label">下一步</span>
                      <span>{pillar.nextMove}</span>
                    </div>
                  </GridCard>
                ))}
              </div>

              <div className="warroom-tab__strategy-grid">
                <GridCard title="当前长板 / 短板">
                  {renderSectionList('长板', alignmentReport.portfolioStrengths)}
                  {renderSectionList('短板', alignmentReport.portfolioGaps)}
                  {renderSectionList('这一轮最该做的事', alignmentReport.nextActions)}
                </GridCard>

                <GridCard title="组合突破口">
                  {renderSectionList('突破方向', alignmentReport.portfolioBreakthroughs)}
                  {alignmentReport.topSynapses.length > 0 && (
                    <div className="warroom-tab__synapse-list">
                      {alignmentReport.topSynapses.map((synapse) => (
                        <div key={`${synapse.label}-${synapse.strength}`} className="warroom-tab__synapse-item">
                          <div className="warroom-tab__synapse-head">
                            <span>{synapse.label}</span>
                            <span className="warroom-tab__synapse-strength">{synapse.strength}</span>
                          </div>
                          <div className="warroom-tab__synapse-reason">{synapse.reason}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </GridCard>
              </div>

              <div className="warroom-tab__project-grid">
                {alignmentReport.projectInsights.slice(0, 4).map((project) => (
                  <GridCard key={project.id} title={project.title}>
                    <div className="warroom-tab__project-head">
                      <div className="warroom-tab__project-score">{project.score}</div>
                      <div className="warroom-tab__project-meta">
                        <span>{project.synergyCount} 条突触</span>
                      </div>
                    </div>
                    {renderInlineList('优势', project.strengths)}
                    {renderInlineList('短板', project.weaknesses)}
                    {renderInlineList('突破口', project.breakthroughs)}
                  </GridCard>
                ))}
              </div>
            </>
          ) : null
        }
      />

      {actionPlan && (
        <CollapsibleSection title="推演行动计划" defaultOpen={true}>
          <div className="warroom-tab__action-head">
            <div>
              <div className="warroom-tab__field-label">选中项目</div>
              <div className="warroom-tab__action-title">{actionPlan.projectTitle}</div>
              <div className="warroom-tab__action-summary">{actionPlan.summary}</div>
            </div>
            <div className="warroom-tab__action-control">
              <span className="warroom-tab__review-date">复盘 {actionPlan.reviewAt}</span>
              <button className="warroom-tab__run-btn" onClick={materializeActionPlan}>
                生成 Agent/Cron 任务
              </button>
            </div>
          </div>
          {actionStatus && <div className="warroom-tab__action-status">{actionStatus}</div>}
          <div className="warroom-tab__action-grid">
            <GridCard title="假设">
              {actionPlan.hypotheses.map((item) => (
                <div key={item.id} className="warroom-tab__action-item">
                  <span className="warroom-tab__action-item-title">{item.title}</span>
                  <span>{item.detail}</span>
                </div>
              ))}
            </GridCard>
            <GridCard title="风险">
              {actionPlan.risks.map((item) => (
                <div key={item.id} className="warroom-tab__action-item">
                  <span className="warroom-tab__action-item-title">{item.title}</span>
                  <span>{item.detail}</span>
                </div>
              ))}
            </GridCard>
            <GridCard title="行动">
              {actionPlan.actions.map((action) => (
                <div key={action.id} className="warroom-tab__action-item">
                  <span className="warroom-tab__action-item-title">{action.title}</span>
                  <span>
                    {action.agentId} / {action.taskType} / {action.cronExpression}
                  </span>
                </div>
              ))}
            </GridCard>
            <GridCard title="观察指标">
              {actionPlan.metrics.map((item) => (
                <div key={item.id} className="warroom-tab__action-item">
                  <span className="warroom-tab__action-item-title">{item.title}</span>
                  <span>{item.detail}</span>
                </div>
              ))}
            </GridCard>
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="多角色推演" defaultOpen={false}>
        {projects.length === 0 ? (
          <EmptyState
            icon="⚔️"
            title="暂无项目样本"
            description="先在「神经元」里沉淀几个真实项目，这里的多角色推演才会真正有意义。"
          />
        ) : (
          <>
            <div className="warroom-tab__setup">
              <div className="warroom-tab__project-select">
                <label className="warroom-tab__field-label">选择项目</label>
                <select
                  className="warroom-tab__select"
                  value={selectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title} ({project.survivalRate ?? '?'}%)
                    </option>
                  ))}
                </select>
              </div>

              <div className="warroom-tab__roles">
                <div className="warroom-tab__roles-head">
                  <span className="warroom-tab__field-label">
                    选择参战角色 ({selectedRoleIds.size} / {allRoles.length})
                  </span>
                  <button className="warroom-tab__inline-btn" onClick={selectAllDefault}>
                    全选默认角色
                  </button>
                </div>
                <div className="warroom-tab__role-list">
                  {allRoles.map((role) => (
                    <button
                      key={role.id}
                      className={`warroom-tab__role-chip ${selectedRoleIds.has(role.id) ? 'warroom-tab__role-chip--active' : ''}`}
                      onClick={() => toggleRole(role.id)}
                    >
                      <span>{role.icon}</span>
                      <span>{role.name}</span>
                      {role.unlockRequirement && <span className="warroom-tab__lock">🔒</span>}
                    </button>
                  ))}
                </div>
              </div>

              <button
                className="warroom-tab__run-btn"
                disabled={!selectedProjectId || selectedRoleIds.size === 0 || isRunning}
                onClick={runWarRoom}
              >
                {isRunning ? '推演中...' : `发起推演 (${selectedRoleIds.size} 角色)`}
              </button>
            </div>

            {results.length > 0 && results.every((result) => !result.loading) && (
              <div className="warroom-tab__overall">
                <span className="warroom-tab__overall-label">多角色综合评分</span>
                <span className="warroom-tab__overall-value">{overallRoleScore.toFixed(0)}</span>
                <StatusBadge
                  status={statusToBadge(overallRoleScore)}
                  label={overallRoleScore >= 70 ? '推荐推进' : overallRoleScore >= 50 ? '谨慎考虑' : '建议重构'}
                />
              </div>
            )}

            {results.length > 0 && (
              <div className="warroom-tab__results">
                {results.map((result) => (
                  <div key={result.roleId} className="warroom-tab__result-card">
                    <div className="warroom-tab__result-header">
                      <span className="warroom-tab__result-icon">{result.roleIcon}</span>
                      <span className="warroom-tab__result-name">{result.roleName}</span>
                      {result.loading && <span className="warroom-tab__pending">评估中...</span>}
                      {!result.loading && result.data && (
                        <StatusBadge status={getRoleStatus(result.data)} label={result.verdict.slice(0, 20)} />
                      )}
                      {result.error && <span className="warroom-tab__error-label">失败</span>}
                    </div>
                    {result.data && (
                      <div className="warroom-tab__result-body">
                        {renderScores(result.data.scores as Record<string, number>)}
                        {renderListField(result.data, 'threats', '威胁')}
                        {renderListField(result.data, 'opportunities', '机会')}
                        {renderListField(result.data, 'strengths', '优势')}
                        {renderListField(result.data, 'risks', '风险')}
                        {renderListField(result.data, 'red_flags', '红旗')}
                        {renderTextField(result.data, 'advice', '建议')}
                        {renderTextField(result.data, 'suggested_pivot', '调整建议')}
                      </div>
                    )}
                    {result.error && <div className="warroom-tab__error-body">{result.error}</div>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CollapsibleSection>
    </div>
  )
}

function readStringArray(data: Record<string, unknown> | null, ...fields: string[]): string[] {
  if (!data) return []
  const result: string[] = []
  for (const field of fields) {
    const value = data[field]
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.trim() && !result.includes(item.trim())) result.push(item.trim())
      }
    }
  }
  return result
}

function readStringValue(data: Record<string, unknown> | null, ...fields: string[]): string {
  if (!data) return ''
  for (const field of fields) {
    const value = data[field]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function statusToBadge(score: number): 'active' | 'warning' | 'error' {
  return score >= 70 ? 'active' : score >= 45 ? 'warning' : 'error'
}

function statusLabel(status: VisionStatus): string {
  if (status === 'strong') return '强'
  if (status === 'building') return '补强中'
  return '待重构'
}

function renderSectionList(title: string, items: string[]) {
  if (items.length === 0) return null
  return (
    <div className="warroom-tab__list-section">
      <div className="warroom-tab__list-title">{title}</div>
      {items.map((item) => (
        <div key={item} className="warroom-tab__list-item">
          <span className="warroom-tab__dot">•</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  )
}

function renderInlineList(label: string, items: string[]) {
  if (items.length === 0) return null
  return (
    <div className="warroom-tab__inline-section">
      <span className="warroom-tab__inline-label">{label}</span>
      <div className="warroom-tab__inline-items">
        {items.map((item) => (
          <span key={item} className="warroom-tab__chip warroom-tab__chip--muted">
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

function getRoleStatus(data: Record<string, unknown>): 'active' | 'warning' | 'error' {
  const scores = data.scores as Record<string, number> | undefined
  if (!scores) return 'warning'
  const avg = Object.values(scores).reduce((sum, value) => sum + value, 0) / Math.max(Object.values(scores).length, 1)
  return avg >= 70 ? 'active' : avg >= 50 ? 'warning' : 'error'
}

function renderScores(scores: Record<string, number> | undefined) {
  if (!scores) return null
  return (
    <div className="warroom-tab__score-grid">
      {Object.entries(scores).map(([key, value]) => (
        <div key={key} className="warroom-tab__score-item">
          <div
            className="warroom-tab__score-value"
            style={{
              color: value >= 70 ? 'var(--hd-success)' : value >= 50 ? 'var(--hd-warning)' : 'var(--hd-error)',
            }}
          >
            {value}
          </div>
          <div className="warroom-tab__score-label">{key}</div>
        </div>
      ))}
    </div>
  )
}

function renderListField(data: Record<string, unknown>, field: string, label: string) {
  const items = data[field] as string[] | undefined
  if (!items || items.length === 0) return null
  return (
    <div className="warroom-tab__field-block">
      <span className="warroom-tab__field-title">{label}:</span>
      <div className="warroom-tab__field-content">
        {items.map((item) => (
          <div key={item}>• {item}</div>
        ))}
      </div>
    </div>
  )
}

function renderTextField(data: Record<string, unknown>, field: string, label: string) {
  const text = data[field] as string | undefined
  if (!text) return null
  return (
    <div className="warroom-tab__field-block">
      <span className="warroom-tab__field-title">{label}:</span>
      <span className="warroom-tab__field-text">{text}</span>
    </div>
  )
}
