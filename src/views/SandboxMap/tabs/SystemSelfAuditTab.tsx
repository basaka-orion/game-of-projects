import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BossState } from '../../../lib/boss/profile'
import { dbListOperatingEvents, type OperatingEventRow, type SynapseRow } from '../../../lib/db/repository'
import type { StoredProject } from '../../../lib/db/store'
import type { ProjectTaxonomy, StructuredAnalysis } from '../../../lib/ai/classifier'
import {
  buildOpenbasakaSelfAuditReport,
  createSelfAuditJudgeCompletion,
  ensureOpenbasakaNightlyMaintenanceTask,
  hydrateOpenbasakaSelfRepairWorkflowStatus,
  loadOpenbasakaSelfAuditRuntimeCounts,
  probeSelfAuditModelRoutes,
  resolveSelfAuditModelRoutes,
  runOpenbasakaNightlyMaintenance,
  runOpenbasakaSelfRepairWorkflow,
  runOpenbasakaSelfAuditCouncil,
  saveOpenbasakaSelfObservationWorkflow,
  saveOpenbasakaSelfAuditReport,
  saveOpenbasakaSelfRepairWorkflows,
  shouldSaveDailySelfAudit,
  type OpenbasakaSelfRepairRunResult,
  type OpenbasakaSelfAuditReport,
} from '../../../lib/openbasaka/self-audit'
import { loadOpenbasakaDreamState, renderDreamDiaryCard } from '../../../lib/openbasaka/dream'

interface SystemSelfAuditTabProps {
  neurons: Array<{
    project: StoredProject
    taxonomy?: {
      taxonomy: ProjectTaxonomy
      analysis: StructuredAnalysis
    }
  }>
  synapses: SynapseRow[]
  bossState: BossState | null
  bossMemoryCount: number
  decisionCount: number
  pendingArchiveCount: number
  operatingEvents: OperatingEventRow[]
}

function scoreColor(score: number): string {
  if (score >= 78) return '#64FFDA'
  if (score >= 58) return '#FFD166'
  return '#FF7A90'
}

function parseAuditHistory(events: OperatingEventRow[]): OperatingEventRow[] {
  return events.filter(event =>
    event.source_id === 'openbasaka-self-audit' ||
    event.source_id === 'openbasaka-self-repair' ||
    event.source_id === 'openbasaka-nightly-maintenance' ||
    event.source_id === 'openbasaka-dreaming' ||
    event.source_id === 'openbasaka-confirmation-guard' ||
    event.entities_json.includes('self-audit') ||
    event.entities_json.includes('self-repair') ||
    event.entities_json.includes('dreaming') ||
    event.entities_json.includes('confirmation-guard'),
  )
}

function decisionSourceLabel(source: string): string {
  return source === 'deep-model' ? '智囊团已经认真复核过' : '先用本地规则看了一遍'
}

function plainJudgeSummary(summary: string): string {
  const text = summary || ''
  if (/401|token expired|incorrect|auth|unauthorized/i.test(text)) {
    return '外部模型的钥匙失效或不正确，所以深度智囊团没有接通。系统已经先用本地规则完成审查，并保留了修复队列。'
  }
  if (/429|rate limit/i.test(text)) {
    return '外部模型现在太忙或额度被限流，所以这次没有硬等。系统已经先用本地规则完成审查，稍后可以重新生成。'
  }
  if (/超过|timeout|未返回/i.test(text)) {
    return '外部模型没有按时回答，所以系统没有卡住等待，而是先用本地规则完成审查。'
  }
  if (/fallback/i.test(text)) {
    return '深度智囊团这次没完整跑通，系统先用本地规则完成审查；这不是最终权威判断，但可以继续生成修复工作流。'
  }
  return text
}

function plainCouncilStatus(report: OpenbasakaSelfAuditReport): string {
  if (report.domains.every(domain => domain.councilAudit.decisionSource === 'deep-model')) {
    return '深度智囊团已接通，并完成了系统总审。'
  }
  const summaries = report.domains
    .map(domain => plainJudgeSummary(domain.councilAudit.judgeSummary))
    .filter(Boolean)
  const uniqueSummaries = Array.from(new Set(summaries))
  if (uniqueSummaries.length === 0) {
    return '深度智囊团这次没完整跑通，系统先用本地规则完成审查，并保留修复队列。'
  }
  if (uniqueSummaries.length === 1) {
    return `${uniqueSummaries[0]}（同类判断已覆盖 ${report.domains.length} 个系统领域。）`
  }
  return `${uniqueSummaries.slice(0, 2).join('；')}（另有 ${Math.max(0, uniqueSummaries.length - 2)} 条领域判断已收进下方卡片。）`
}

function riskColor(risk: string): string {
  if (risk === 'high') return '#FF7A90'
  if (risk === 'medium') return '#FFD166'
  return '#64FFDA'
}

function planStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: '还没放进工作流，点上面的按钮就会生成',
    'workflow-ready': '工作流已生成，可以准备执行',
    'scheduled-disabled': '已经放进“定时/群策”，可以先启动安全修复；真正高风险动作会等你确认',
    completed: '已完成',
    blocked: '安全部分已跑，高风险部分等 Boss 确认',
  }
  return labels[status] || status
}

function plainRiskLabel(risk: string): string {
  if (risk === 'high') return '很需要管'
  if (risk === 'medium') return '需要留意'
  return '基本稳'
}

function priorityLabel(priority: string): string {
  if (priority === 'P0') return '最急'
  if (priority === 'P1') return '优先'
  return '稍后'
}

function modelHealthLabel(status: string): string {
  const labels: Record<string, string> = {
    ready: '已接通',
    'not-checked': '等夜巡试连',
    'not-configured': '没读到钥匙',
    'invalid-key': '钥匙不通',
    'rate-limited': '被限流',
    timeout: '没等到回应',
    error: '连接失败',
  }
  return labels[status] || status
}

function parseEventPayload(event: OperatingEventRow): Record<string, unknown> {
  try {
    const payload = JSON.parse(event.payload_json || '{}') as Record<string, unknown>
    return payload && typeof payload === 'object' ? payload : {}
  } catch {
    return {}
  }
}

function formatAuditTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusText(status: unknown): string {
  if (status === 'completed') return '已完成'
  if (status === 'blocked') return '等 Boss 确认'
  if (status === 'queued') return '已排队'
  if (status === 'failed') return '失败'
  if (status === 'running') return '运行中'
  return '已记录'
}

function auditEventPlainMeta(event: OperatingEventRow): {
  label: string
  reason: string
  process: string
  status: string
} {
  const payload = parseEventPayload(event)
  const status = statusText(payload.status)
  if (event.source_id === 'openbasaka-dreaming') {
    return {
      label: '梦境日记',
      status,
      reason: '原因：夜巡结束后，系统会把历史记录重新整理成 light、REM、deep 三段学习。',
      process: '过程：回放运行历史、抽取重复模式、给候选学习打分；高分梦境自动写入进化账本，修复动作仍等 Boss 确认。',
    }
  }
  if (event.source_id === 'openbasaka-confirmation-guard') {
    return {
      label: 'Boss确认守护',
      status,
      reason: '原因：有些修复会碰代码、数据、权限、密钥或外发边界，不能替 Boss 静默点头。',
      process: '过程：低风险步骤继续自动跑；高风险确认卡每天留在系统自省和晨报里，不让它沉掉。',
    }
  }
  if (event.source_id === 'openbasaka-nightly-maintenance') {
    return {
      label: '自动夜巡晨报',
      status,
      reason: '原因：到每天 03:17，系统要自己检查学习、进化、bug 和修复队列。',
      process: '过程：看运行历史、试模型钥匙、让小白智囊团判断、生成修复队列，然后写回这条晨报。',
    }
  }
  if (event.source_id === 'openbasaka-self-audit') {
    return {
      label: '系统自省晨报',
      status,
      reason: '原因：把这次系统检查留下证据，方便你回头看它为什么这么判断。',
      process: '过程：汇总愿景、Boss 建模、记忆 Wiki、Agent、学习进化和安全可信，再写入历史。',
    }
  }
  if (event.title.includes('已试跑自我修复')) {
    return {
      label: '安全修复试跑',
      status,
      reason: '原因：自省发现有可修的地方，先跑不会乱改系统的安全步骤。',
      process: '过程：读懂问题、写入运行历史、生成下一步；涉及代码、数据、权限的部分先停住等你确认。',
    }
  }
  if (event.source_id === 'openbasaka-self-repair') {
    return {
      label: '修复工作流生成',
      status,
      reason: '原因：自省发现问题后，要先把问题变成可审查、可执行的修复队列。',
      process: '过程：生成群策工作流、创建定时任务，但默认保持安全边界，不静默改代码或删数据。',
    }
  }
  if (event.source_id === 'openbasaka-self-observer') {
    return {
      label: '夜间自省已开启',
      status,
      reason: '原因：让系统以后不用你手动点，也能每天自己留下检查记录。',
      process: '过程：创建工作流、启用定时任务、把开启动作写入运行历史。',
    }
  }
  return {
    label: '自省相关记录',
    status,
    reason: '原因：这条记录和系统自省或自我修复有关。',
    process: event.summary || '过程：已写入 Openbasaka 运行历史。',
  }
}

function nightlyToneColor(tone: string): string {
  if (tone === 'urgent') return '#FF7A90'
  if (tone === 'watch') return '#FFD166'
  return '#64FFDA'
}

export default function SystemSelfAuditTab({
  neurons,
  synapses,
  bossState,
  bossMemoryCount,
  decisionCount,
  pendingArchiveCount,
  operatingEvents,
}: SystemSelfAuditTabProps) {
  const [report, setReport] = useState<OpenbasakaSelfAuditReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [councilLoading, setCouncilLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [repairSaving, setRepairSaving] = useState(false)
  const [repairRunning, setRepairRunning] = useState(false)
  const [repairRun, setRepairRun] = useState<OpenbasakaSelfRepairRunResult | null>(null)
  const [nightlyRunning, setNightlyRunning] = useState(false)
  const [observerSaving, setObserverSaving] = useState(false)
  const [status, setStatus] = useState('')

  const projects = useMemo(() => neurons.map(neuron => neuron.project), [neurons])
  const taxonomies = useMemo(() => {
    const entries: Array<[string, { taxonomy: ProjectTaxonomy; analysis: StructuredAnalysis }]> = []
    for (const neuron of neurons) {
      if (neuron.taxonomy) entries.push([neuron.project.id, neuron.taxonomy])
    }
    return Object.fromEntries(entries)
  }, [neurons])
  const auditHistory = useMemo(() => parseAuditHistory(operatingEvents), [operatingEvents])

  const buildReport = useCallback(async (forceSave = false) => {
    setLoading(true)
    setStatus('')
    const counts = await loadOpenbasakaSelfAuditRuntimeCounts()
    const baseReport = buildOpenbasakaSelfAuditReport({
      projects,
      taxonomies,
      synapses,
      bossState,
      bossMemoryCount,
      decisionCount,
      pendingArchiveCount,
      operatingEvents,
      ...counts,
    })
    const routes = await resolveSelfAuditModelRoutes()
    const modelRouteHealth = await probeSelfAuditModelRoutes(routes)
    const taskId = await ensureOpenbasakaNightlyMaintenanceTask(baseReport)
    const latestDream = await loadOpenbasakaDreamState().catch(() => null)
    let hydratedBase: OpenbasakaSelfAuditReport = {
      ...baseReport,
      modelRouteHealth,
      dreamState: latestDream || baseReport.dreamState,
      nightlyLog: baseReport.nightlyLog,
      observationWorkflow: {
        ...baseReport.observationWorkflow,
        enabled: true,
        status: 'running-daily' as const,
        scheduledTaskId: taskId,
        plainSummary: '已经开启。它每天凌晨会自己看一遍 OpenBasaka，留下小白能看懂的晨报。',
        nextUserAction: '明早看晨报；如果看到“可以执行修复了”，优先看最上面的 Boss 确认卡。',
      },
    }
    hydratedBase = {
      ...hydratedBase,
      nightlyLog: {
        ...hydratedBase.nightlyLog,
        generatedAt: hydratedBase.generatedAt,
      },
    }
    setReport(hydratedBase)
    setLoading(false)
    setCouncilLoading(true)

    let nextReport: OpenbasakaSelfAuditReport = hydratedBase
    try {
      nextReport = await runOpenbasakaSelfAuditCouncil(hydratedBase, {
        judgeCompletion: createSelfAuditJudgeCompletion(routes),
      })
      nextReport = {
        ...nextReport,
        modelRouteHealth,
        dreamState: latestDream || nextReport.dreamState,
      }
      nextReport = await hydrateOpenbasakaSelfRepairWorkflowStatus(nextReport)
      setReport(nextReport)
    } catch {
      nextReport = await hydrateOpenbasakaSelfRepairWorkflowStatus(nextReport)
      setReport(nextReport)
      setStatus('系统自省已生成；深度小白智囊团本轮失败，已保留本地 fallback 裁决。')
    } finally {
      setCouncilLoading(false)
    }

    const latestEvents = await dbListOperatingEvents(120).catch(() => operatingEvents)
    if (forceSave || shouldSaveDailySelfAudit(latestEvents)) {
      setSaving(true)
      try {
        await saveOpenbasakaSelfAuditReport(nextReport)
        setStatus(forceSave ? '已手动写入系统自省历史。' : '已生成今天的系统自省晨报，并写入运行历史。')
      } catch {
        setStatus('自省报告已生成，但写入运行历史失败。')
      } finally {
        setSaving(false)
      }
    }
  }, [
    bossMemoryCount,
    bossState,
    decisionCount,
    operatingEvents,
    pendingArchiveCount,
    projects,
    synapses,
    taxonomies,
  ])

  const runNightlyNow = useCallback(async () => {
    setNightlyRunning(true)
    setStatus('正在真实跑夜间自省：会试模型钥匙、跑小白智囊团、生成修复队列，并只自动启动低风险安全步骤。')
    try {
      const result = await runOpenbasakaNightlyMaintenance({
        trigger: 'manual',
        force: true,
        verifyModelRoutes: true,
        runSafeRepair: true,
      })
      setReport(result.report)
      if (result.safeRepairRun) setRepairRun(result.safeRepairRun)
      setStatus(`${result.log.title}。${result.log.summary} ${result.report.dreamState.summary}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      setStatus(`夜间自省真实运行失败：${message}`)
    } finally {
      setNightlyRunning(false)
    }
  }, [])

  const createRepairWorkflows = useCallback(async () => {
    if (!report) return
    setRepairSaving(true)
    setStatus('')
    try {
      const savedPlans = await saveOpenbasakaSelfRepairWorkflows(report)
      let nextPlans = savedPlans
      setReport({ ...report, selfRepairPlans: nextPlans })
      const urgentPlan = savedPlans.find(plan => plan.priority === 'P0')
      if (urgentPlan) {
        setRepairRunning(true)
        setStatus(`已生成 ${savedPlans.length} 条群策自我修复工作流。最急的一条正在安全试跑，高风险动作会停给 Boss 确认。`)
        try {
          const runResult = await runOpenbasakaSelfRepairWorkflow(urgentPlan)
          setRepairRun(runResult)
          nextPlans = savedPlans.map(plan => plan.id === urgentPlan.id ? runResult.plan : plan)
          setReport({ ...report, selfRepairPlans: nextPlans })
          setStatus(runResult.success ? runResult.summary : `已试跑，但还有卡点：${runResult.summary}`)
        } catch (error) {
          const message = error instanceof Error ? error.message : '未知错误'
          setStatus(`工作流已生成，但最急修复自动试跑失败：${message}`)
        } finally {
          setRepairRunning(false)
        }
      } else {
        setStatus(`已生成 ${savedPlans.length} 条群策自我修复工作流，并创建为禁用状态的 team-workflow 定时任务。`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      setStatus(`自我修复工作流生成失败：${message}`)
    } finally {
      setRepairSaving(false)
    }
  }, [report])

  const runRepairWorkflow = useCallback(async (planId?: string) => {
    if (!report) return
    const target = planId ? report.selfRepairPlans.find(plan => plan.id === planId) : report.selfRepairPlans[0]
    if (!target) return
    setRepairRunning(true)
    setStatus('正在运行最急修复工作流。低风险动作会自己走，高风险动作会停下来等 Boss。')
    try {
      const runResult = await runOpenbasakaSelfRepairWorkflow(target)
      setRepairRun(runResult)
      setReport({
        ...report,
        selfRepairPlans: report.selfRepairPlans.map(plan => plan.id === target.id ? runResult.plan : plan),
      })
      setStatus(runResult.success ? runResult.summary : `已试跑，但还有卡点：${runResult.summary}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      setStatus(`修复工作流运行失败：${message}`)
    } finally {
      setRepairRunning(false)
    }
  }, [report])

  const enableObservationWorkflow = useCallback(async () => {
    if (!report) return
    setObserverSaving(true)
    setStatus('')
    try {
      const observationWorkflow = await saveOpenbasakaSelfObservationWorkflow(report)
      setReport({ ...report, observationWorkflow })
      setStatus('每日自观察已开启：它会每天自己看系统发生了什么，并留下小白能看懂的学习/进化日报。')
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      setStatus(`每日自观察开启失败：${message}`)
    } finally {
      setObserverSaving(false)
    }
  }, [report])

  const openScheduler = useCallback(() => {
    window.location.hash = '#/sandbox?tab=scheduler'
  }, [])

  useEffect(() => {
    void buildReport(false)
  }, [buildReport])

  if (loading && !report) {
    return (
      <div className="sandbox-map__tab" style={{ padding: 24 }}>
        <div className="sandbox-map__card" style={{ padding: 24 }}>
          正在让小白智囊团读取 Openbasaka 的项目、Boss、记忆、Wiki、Agent 和进化证据…
        </div>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="sandbox-map__tab" style={{ padding: 24 }}>
        <div className="sandbox-map__card" style={{ padding: 24 }}>
          系统自省暂时没有生成成功。
        </div>
      </div>
    )
  }

  const queuedRepairCount = report.selfRepairPlans.filter(plan => plan.status === 'queued').length
  const executableRepairCount = report.selfRepairPlans.filter(plan => plan.status === 'workflow-ready' || plan.status === 'scheduled-disabled').length
  const topRepair = report.selfRepairPlans[0]
  const dreamCard = renderDreamDiaryCard(report.dreamState)
  const confirmationGuard = report.repairConfirmationGuard

  return (
    <div className="sandbox-map__tab" style={{ padding: 22, gap: 18 }}>
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(240px, 0.35fr) minmax(0, 1fr)',
          gap: 16,
        }}
      >
        <div
          className="sandbox-map__card"
          style={{
            padding: 22,
            background: 'linear-gradient(180deg, rgba(100,255,218,0.10), rgba(255,255,255,0.025))',
            borderColor: 'rgba(100,255,218,0.18)',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--hd-accent-cyan)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            夜间自省 · 自动跑
          </div>
          <div style={{ fontSize: 54, fontWeight: 900, color: scoreColor(report.overallScore), lineHeight: 1.05, marginTop: 12 }}>
            {report.overallScore}
          </div>
          <div style={{ color: 'var(--hd-text-secondary)', fontSize: 13, lineHeight: 1.7, marginTop: 10 }}>
            {report.headline}
          </div>
          <div style={{ marginTop: 14, padding: 12, background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.07)', color: 'var(--hd-text-secondary)', fontSize: 12, lineHeight: 1.7 }}>
            每天 03:17 它会自己夜巡。错过凌晨窗口时，下次打开应用会补跑。低风险修复会自启；Boss确认守护会盯住高风险确认卡。
          </div>
          <button
            type="button"
            className="sandbox-map__btn sandbox-map__btn--primary"
            disabled={nightlyRunning}
            onClick={() => void runNightlyNow()}
            style={{ marginTop: 18, width: '100%' }}
          >
            {nightlyRunning ? '正在真实夜巡…' : '立即真实跑一次夜巡'}
          </button>
          <button
            type="button"
            className="sandbox-map__btn"
            disabled={saving}
            onClick={() => void buildReport(true)}
            style={{ marginTop: 10, width: '100%' }}
          >
            {saving ? '正在写入历史…' : '重新生成并写入历史'}
          </button>
          <button
            type="button"
            className="sandbox-map__btn"
            disabled={observerSaving}
            onClick={() => void enableObservationWorkflow()}
            style={{ marginTop: 10, width: '100%' }}
          >
            {observerSaving ? '正在开启夜间自省…' : report.observationWorkflow.enabled ? '夜间自省已开启' : '开启夜间自省'}
          </button>
          <button
            type="button"
            className="sandbox-map__btn"
            disabled={repairSaving}
            onClick={() => void createRepairWorkflows()}
            style={{ marginTop: 10, width: '100%' }}
          >
            {repairSaving ? '正在生成修复工作流…' : '交给群策生成修复工作流'}
          </button>
          <div style={{ marginTop: 10, color: councilLoading ? '#FFD166' : 'var(--hd-text-muted)', fontSize: 12, lineHeight: 1.6 }}>
            {councilLoading ? '小白智囊团正在认真看整个系统…' : `智囊团状态：${decisionSourceLabel(report.domains[0]?.councilAudit.decisionSource || 'local-fallback')}`}
          </div>
          <div style={{ marginTop: 8, color: 'var(--hd-text-secondary)', fontSize: 12, lineHeight: 1.65 }}>
            {plainCouncilStatus(report)}
          </div>
          {status && (
            <div style={{ marginTop: 10, color: 'var(--hd-text-muted)', fontSize: 12, lineHeight: 1.6 }}>
              {status}
            </div>
          )}
        </div>

        <div className="sandbox-map__card" style={{ padding: 22 }}>
          <div style={{ fontSize: 12, color: nightlyToneColor(report.nightlyLog.tone), letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            晨报卡 · 小白能懂
          </div>
          <h2 style={{ margin: '8px 0 8px', fontSize: 22 }}>{report.nightlyLog.title}</h2>
          <p style={{ margin: '0 0 14px', color: 'var(--hd-text-secondary)', lineHeight: 1.7 }}>
            {report.nightlyLog.summary}
          </p>
          <div style={{ marginBottom: 14, padding: 12, border: `1px solid ${nightlyToneColor(report.nightlyLog.tone)}55`, background: 'rgba(0,0,0,0.18)', color: nightlyToneColor(report.nightlyLog.tone), fontWeight: 800 }}>
            {report.nightlyLog.obviousCta}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
            {report.modelRouteHealth.map(item => (
              <div key={item.id} style={{ padding: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.14)' }}>
                <div style={{ fontSize: 11, color: 'var(--hd-text-muted)' }}>{item.label} 钥匙</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: item.ok ? '#64FFDA' : item.status === 'not-checked' ? 'var(--hd-text-primary)' : '#FFD166' }}>
                  {modelHealthLabel(item.status)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--hd-text-secondary)', lineHeight: 1.55 }}>{item.message}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {[
              ['今天学得怎么样', report.learningProgress.score, report.learningProgress.summary],
              ['有没有真的进化', report.evolutionProgress.score, report.evolutionProgress.summary],
              ['有没有做事证据', report.dailyBrief.sections.find(section => section.id === 'agents')?.items[0]?.value || '待观察', '有没有留下可复盘的执行记录'],
              ['会不会自己观察', report.observationWorkflow.enabled ? '已开启' : '未开启', report.observationWorkflow.plainSummary],
            ].map(([label, value, copy]) => (
              <div key={label} style={{ padding: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.14)' }}>
                <div style={{ fontSize: 11, color: 'var(--hd-text-muted)' }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: typeof value === 'number' ? scoreColor(value) : 'var(--hd-text-primary)' }}>{value}</div>
                <div style={{ fontSize: 12, color: 'var(--hd-text-secondary)', lineHeight: 1.55 }}>{copy}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 14 }}>
            {[
              ['昨天修好了什么', report.dailyLearningReport.completedRepairs.slice(0, 2).join('；')],
              ['哪里卡住了', report.dailyLearningReport.blockedRepairs.slice(0, 2).join('；')],
              ['明天先修什么', report.dailyLearningReport.tomorrowRepair],
            ].map(([label, copy]) => (
              <div key={label} style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--hd-text-muted)' }}>{label}</div>
                <div style={{ fontSize: 12, color: 'var(--hd-text-secondary)', lineHeight: 1.6, marginTop: 4 }}>{copy}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sandbox-map__card" style={{ padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 0.35fr) minmax(0, 1fr)', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: nightlyToneColor(dreamCard.tone), letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              昨夜梦境 · 学习即进化
            </div>
            <h2 style={{ margin: '8px 0 8px', fontSize: 22 }}>{dreamCard.title}</h2>
            <p style={{ margin: 0, color: 'var(--hd-text-secondary)', lineHeight: 1.7, fontSize: 13 }}>
              {dreamCard.summary}
            </p>
            <div style={{ marginTop: 12, padding: 12, border: `1px solid ${nightlyToneColor(dreamCard.tone)}55`, color: nightlyToneColor(dreamCard.tone), background: 'rgba(0,0,0,0.16)', fontWeight: 800, lineHeight: 1.55, fontSize: 13 }}>
              {dreamCard.appliedSummary}
            </div>
            <div style={{ marginTop: 10, color: 'var(--hd-text-muted)', fontSize: 12, lineHeight: 1.65 }}>
              {report.dreamState.safetyBoundary}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              {report.dreamState.stages.map(stage => (
                <div key={stage.id} style={{ padding: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.14)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontSize: 12, color: 'var(--hd-accent-cyan)', fontWeight: 900 }}>{stage.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: scoreColor(stage.score) }}>{stage.score}</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--hd-text-secondary)', lineHeight: 1.6, marginTop: 6 }}>{stage.summary}</div>
                  <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
                    {stage.items.slice(0, 3).map(item => (
                      <div key={item} style={{ fontSize: 11, color: 'var(--hd-text-muted)', lineHeight: 1.5 }}>{item}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(220px, 0.42fr)', gap: 10 }}>
              <div style={{ padding: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.14)' }}>
                <div style={{ fontSize: 11, color: 'var(--hd-text-muted)', marginBottom: 8 }}>学到了什么</div>
                {report.dreamState.candidates.length > 0 ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {report.dreamState.candidates.slice(0, 3).map(candidate => (
                      <div key={candidate.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 900 }}>{candidate.title}</div>
                          <div style={{ color: scoreColor(candidate.score), fontWeight: 900 }}>{candidate.score}</div>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--hd-text-secondary)', lineHeight: 1.55, marginTop: 4 }}>{candidate.learnedWhat}</div>
                        <div style={{ fontSize: 11, color: '#FFD166', lineHeight: 1.5, marginTop: 4 }}>下一步：{candidate.nextAction}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--hd-text-secondary)', lineHeight: 1.65 }}>
                    还没有新的梦境候选。下一次真实夜巡会先回放历史再判断是否自动生效。
                  </div>
                )}
              </div>

              <div style={{ padding: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.14)' }}>
                <div style={{ fontSize: 11, color: 'var(--hd-text-muted)', marginBottom: 8 }}>已经进化了什么</div>
                {report.dreamState.appliedWrites.length > 0 ? (
                  <div style={{ display: 'grid', gap: 7 }}>
                    {report.dreamState.appliedWrites.slice(0, 6).map(write => (
                      <div key={`${write.kind}-${write.id}`} style={{ fontSize: 12, color: 'var(--hd-text-secondary)', lineHeight: 1.5 }}>
                        <span style={{ color: '#64FFDA', fontWeight: 900 }}>{write.kind}</span>｜{write.title}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--hd-text-secondary)', lineHeight: 1.65 }}>
                    暂无自动生效写入。Boss 能先看到过程，等深睡分数足够才会进长期账本。
                  </div>
                )}
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 11, color: 'var(--hd-text-muted)' }}>下一次梦什么</div>
                  <div style={{ fontSize: 12, color: 'var(--hd-text-secondary)', lineHeight: 1.55, marginTop: 4 }}>{dreamCard.nextDreamTopic}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className="sandbox-map__card"
        style={{
          padding: 20,
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 0.35fr) minmax(0, 1fr)',
          gap: 16,
          borderColor: confirmationGuard.pendingCount > 0 ? 'rgba(255,209,102,0.34)' : 'rgba(100,255,218,0.20)',
          background: confirmationGuard.pendingCount > 0
            ? 'linear-gradient(90deg, rgba(255,209,102,0.14), rgba(255,255,255,0.025))'
            : 'linear-gradient(90deg, rgba(100,255,218,0.10), rgba(255,255,255,0.025))',
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: confirmationGuard.pendingCount > 0 ? '#FFD166' : 'var(--hd-accent-cyan)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Boss确认守护 · 不怕忘
          </div>
          <h2 style={{ margin: '8px 0 8px', fontSize: 22 }}>
            低风险自己做，高风险每天提醒
          </h2>
          <p style={{ margin: 0, color: 'var(--hd-text-secondary)', lineHeight: 1.7, fontSize: 13 }}>
            {confirmationGuard.plainSummary}
          </p>
          <div style={{ marginTop: 12, padding: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.16)', color: 'var(--hd-text-muted)', lineHeight: 1.65, fontSize: 12 }}>
            确认入口：{confirmationGuard.confirmationLocation}
            <br />
            队列入口：{confirmationGuard.schedulerLocation}
          </div>
          <div style={{ marginTop: 10, color: '#FFD166', fontSize: 12, lineHeight: 1.65 }}>
            {confirmationGuard.autopilotBoundary}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {[
              ['自动处理', confirmationGuard.autoHandledCount, '已经先跑的低风险安全部分'],
              ['等你点头', confirmationGuard.pendingCount, '不会静默执行的高风险确认卡'],
              ['下次提醒', confirmationGuard.pendingCount > 0 ? '03:17 后' : '按需生成', confirmationGuard.nextReminder],
            ].map(([label, value, copy]) => (
              <div key={label} style={{ padding: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.14)' }}>
                <div style={{ fontSize: 11, color: 'var(--hd-text-muted)' }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: typeof value === 'number' && value > 0 ? '#FFD166' : 'var(--hd-text-primary)' }}>{value}</div>
                <div style={{ fontSize: 12, color: 'var(--hd-text-secondary)', lineHeight: 1.55 }}>{copy}</div>
              </div>
            ))}
          </div>

          <div style={{ padding: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.14)' }}>
            <div style={{ fontSize: 11, color: 'var(--hd-text-muted)', marginBottom: 8 }}>待确认卡</div>
            {confirmationGuard.pendingPlans.length > 0 ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {confirmationGuard.pendingPlans.slice(0, 3).map(plan => (
                  <div key={plan.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 900 }}>{plan.title}</div>
                      <div style={{ color: plan.priority === 'P0' ? '#FF7A90' : '#FFD166', fontWeight: 900 }}>{priorityLabel(plan.priority)}</div>
                    </div>
                    <div style={{ fontSize: 12, color: '#FFD166', lineHeight: 1.55, marginTop: 4 }}>为什么要点头：{plan.reason}</div>
                    <div style={{ fontSize: 12, color: 'var(--hd-text-secondary)', lineHeight: 1.55, marginTop: 4 }}>安全下一步：{plan.nextSafeAction}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--hd-text-secondary)', lineHeight: 1.65, fontSize: 12 }}>
                暂时没有待确认卡。下一次夜巡如果发现高风险修复，会自动放到这里。
              </div>
            )}
          </div>
        </div>
      </section>

      <section
        className="sandbox-map__card"
        style={{
          padding: 18,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          gap: 14,
          alignItems: 'center',
          background: executableRepairCount > 0
            ? 'linear-gradient(90deg, rgba(255,209,102,0.20), rgba(255,122,144,0.10))'
            : 'linear-gradient(90deg, rgba(100,255,218,0.12), rgba(255,255,255,0.03))',
          borderColor: executableRepairCount > 0 ? 'rgba(255,209,102,0.32)' : 'rgba(100,255,218,0.20)',
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: executableRepairCount > 0 ? '#FFD166' : 'var(--hd-accent-cyan)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {executableRepairCount > 0 ? '可以执行修复了' : queuedRepairCount > 0 ? '已经找到可修的地方' : '观察工作流状态'}
          </div>
          <h2 style={{ margin: '6px 0 6px', fontSize: 20 }}>
            {executableRepairCount > 0
              ? `已有 ${executableRepairCount} 条修复工作流准备好了`
              : queuedRepairCount > 0
                ? `发现 ${queuedRepairCount} 个可以修的点，先生成工作流`
                : report.observationWorkflow.plainSummary}
          </h2>
          <p style={{ margin: 0, color: 'var(--hd-text-secondary)', lineHeight: 1.65, fontSize: 13 }}>
            {executableRepairCount > 0
              ? `最优先：${topRepair?.title || '先处理第一条修复'}。点“立即运行”后，系统会先跑安全部分；真正会动代码、数据或权限的部分会停下来，并由 Boss确认守护每天提醒。`
              : queuedRepairCount > 0
                ? `最优先：${topRepair?.title || '先生成第一条修复'}。点右侧按钮后，系统会把它变成群策工作流和可调度任务。`
                : report.observationWorkflow.nextUserAction}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {executableRepairCount > 0 ? (
            <>
              <button type="button" className="sandbox-map__btn sandbox-map__btn--primary" disabled={repairRunning} onClick={() => void runRepairWorkflow(topRepair?.id)}>
                {repairRunning ? '正在运行最急修复…' : topRepair?.priority === 'P0' ? '立即运行最急修复' : '运行第一条修复'}
              </button>
              <button type="button" className="sandbox-map__btn" onClick={openScheduler}>
                去定时里看队列
              </button>
            </>
          ) : (
            <button type="button" className="sandbox-map__btn sandbox-map__btn--primary" disabled={repairSaving} onClick={() => void createRepairWorkflows()}>
              {repairSaving ? '正在生成…' : '生成修复工作流'}
            </button>
          )}
          {!report.observationWorkflow.enabled && (
            <button type="button" className="sandbox-map__btn" disabled={observerSaving} onClick={() => void enableObservationWorkflow()}>
              {observerSaving ? '正在开启…' : '开启每日自观察'}
            </button>
          )}
        </div>
      </section>

      <section>
        <div style={{ fontSize: 12, color: 'var(--hd-accent-cyan)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
          智囊团怎么看
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {report.domains.map(domain => (
          <article key={domain.id} className="sandbox-map__card" style={{ padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{domain.title}</div>
                <div style={{ color: riskColor(domain.councilAudit.risk), fontSize: 11, marginTop: 4 }}>
                  {decisionSourceLabel(domain.councilAudit.decisionSource)} · {plainRiskLabel(domain.councilAudit.risk)}
                </div>
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: scoreColor(domain.score) }}>{domain.score}</div>
            </div>
            <p style={{ margin: 0, color: 'var(--hd-text-secondary)', lineHeight: 1.65, fontSize: 12 }}>
              {domain.councilAudit.verdict}
            </p>
            <div style={{ padding: 10, background: 'rgba(0,0,0,0.16)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 11, color: 'var(--hd-text-muted)', marginBottom: 6 }}>
                它们合起来的判断
              </div>
              <div style={{ fontSize: 12, color: 'var(--hd-text-primary)', lineHeight: 1.55 }}>
                {plainJudgeSummary(domain.councilAudit.judgeSummary)}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {domain.councilAudit.seatVerdicts.slice(0, 3).map(seat => (
                <div key={`${domain.id}-${seat.personaId}`} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--hd-accent-gold)' }}>{seat.seat} · {seat.personaName}</div>
                  <div style={{ fontSize: 12, color: 'var(--hd-text-secondary)', lineHeight: 1.55, marginTop: 4 }}>{seat.verdict}</div>
                  <div style={{ fontSize: 12, color: '#FFD166', lineHeight: 1.55, marginTop: 4 }}>它担心：{seat.objection}</div>
                </div>
              ))}
            </div>
            <div style={{ color: 'var(--hd-text-muted)', fontSize: 11, lineHeight: 1.7 }}>
              它有多确定：{Math.round(domain.councilAudit.confidence * 100)}% · {domain.councilAudit.evidenceClaims.slice(0, 2).join('；')}
            </div>
          </article>
        ))}
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 0.42fr)', gap: 14 }}>
        <div className="sandbox-map__card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: 'var(--hd-accent-cyan)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
            接下来修哪里
          </div>
          {repairRun && (
            <div style={{ marginTop: 12, padding: 12, border: '1px solid rgba(255,209,102,0.20)', background: 'rgba(255,209,102,0.08)', color: 'var(--hd-text-secondary)', lineHeight: 1.65, fontSize: 12 }}>
              刚刚启动：{repairRun.summary}
              {repairRun.sessionId ? ` 群策会话：${repairRun.sessionId}` : ''}
              <div style={{ marginTop: 8, color: 'var(--hd-text-primary)' }}>{repairRun.bossMessage}</div>
              <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                {repairRun.runSteps.map(step => (
                  <div key={step.title} style={{ color: step.status === 'blocked' ? '#FFD166' : 'var(--hd-text-secondary)' }}>
                    {step.status === 'blocked' ? '待确认' : '完成'}：{step.title}｜{step.detail}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: 'grid', gap: 9 }}>
            {report.selfRepairPlans.map((plan) => (
              <div key={plan.id} style={{ padding: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.14)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
                  <div>
                    <div style={{ color: 'var(--hd-text-primary)', fontWeight: 800, fontSize: 13 }}>{plan.title}</div>
                    <div style={{ color: 'var(--hd-text-muted)', fontSize: 11, marginTop: 4 }}>{plan.targetSubsystem}</div>
                  </div>
                  <div style={{ color: plan.priority === 'P0' ? '#FF7A90' : plan.priority === 'P1' ? '#FFD166' : '#64FFDA', fontWeight: 900 }}>
                    {priorityLabel(plan.priority)}
                  </div>
                </div>
                <div style={{ color: 'var(--hd-text-secondary)', lineHeight: 1.6, fontSize: 12, marginTop: 8 }}>
                  {plan.problem}
                </div>
                <div style={{ color: '#FFD166', lineHeight: 1.6, fontSize: 12, marginTop: 8 }}>
                  现在能做什么：{planStatusLabel(plan.status)}
                </div>
                <div style={{ color: 'var(--hd-text-muted)', lineHeight: 1.6, fontSize: 11, marginTop: 6 }}>
                  怎么算修好：{plan.acceptance[0]}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="sandbox-map__card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: 'var(--hd-accent-gold)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
            为什么这么说
          </div>
          <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--hd-text-muted)' }}>系统有没有学到东西</div>
              <div style={{ fontSize: 12, color: 'var(--hd-text-secondary)', lineHeight: 1.55 }}>
                {report.dailyLearningReport.skillEvolutionChanges.slice(0, 2).join('；')}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--hd-text-muted)' }}>智囊团还在担心什么</div>
              <div style={{ fontSize: 12, color: 'var(--hd-text-secondary)', lineHeight: 1.55 }}>
                {report.dailyLearningReport.councilDisagreements.slice(0, 2).join('；')}
              </div>
            </div>
          </div>
          {auditHistory.length > 0 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {auditHistory.slice(0, 4).map(event => (
                <div key={event.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 9 }}>
                  {(() => {
                    const meta = auditEventPlainMeta(event)
                    return (
                      <>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: '#64FFDA', fontWeight: 900 }}>{meta.label}</span>
                          <span style={{ fontSize: 11, color: '#FFD166' }}>{meta.status}</span>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 800, marginTop: 5 }}>{event.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--hd-text-muted)', marginTop: 3 }}>时间：{formatAuditTime(event.created_at)}</div>
                        <div style={{ fontSize: 12, color: 'var(--hd-text-secondary)', lineHeight: 1.55, marginTop: 4 }}>{meta.reason}</div>
                        <div style={{ fontSize: 12, color: 'var(--hd-text-secondary)', lineHeight: 1.55, marginTop: 4 }}>{meta.process}</div>
                      </>
                    )
                  })()}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--hd-text-secondary)', lineHeight: 1.7, fontSize: 13 }}>
              今天第一次打开 09:00 后会自动写入一条日报；也可以手动生成。
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
