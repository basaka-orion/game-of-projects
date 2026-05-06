import { useState } from 'react'
import type {
  CouncilArtifactFinalVerdict,
  CouncilArtifactReviewerKind,
  CouncilArtifactReviewLedger,
  SaveCouncilArtifactReviewInput,
} from '../../../../lib/xiaobai-council/artifact-review'

interface CouncilArtifactReviewViewProps {
  ledger: CouncilArtifactReviewLedger
  latestRunId?: string
  onSave: (input: SaveCouncilArtifactReviewInput) => void
  onClear?: () => void
}

type CheckId =
  | 'prdDirectlyActionable'
  | 'theaterTraceClear'
  | 'baoyuChineseReadable'
  | 'visualTasteProfessional'
  | 'noFakeProgress'
  | 'wouldUseForRealPlanning'

const CHECKS: Array<{ id: CheckId; label: string }> = [
  { id: 'prdDirectlyActionable', label: 'PRD 能直接拆任务' },
  { id: 'theaterTraceClear', label: '剧场能追溯冲突与裁决' },
  { id: 'baoyuChineseReadable', label: '技术蓝图清晰可实施' },
  { id: 'visualTasteProfessional', label: '整体审美专业优雅' },
  { id: 'noFakeProgress', label: '没有假进度或假思考' },
  { id: 'wouldUseForRealPlanning', label: '愿意用于真实规划' },
]

const STATUS_LABELS: Record<CouncilArtifactReviewLedger['stats']['certificationStatus'], string> = {
  missing: '缺审美验收',
  collecting: '审美验收中',
  passed: '审美已过线',
  failed: '审美未过线',
}

const REVIEWER_KIND_LABELS: Record<CouncilArtifactReviewerKind, string> = {
  boss: 'Boss 终审',
  'external-human': '外部真人审稿',
  'designer-or-team': '设计/团队人工审稿',
  'model-simulation': '模型模拟审稿',
}

const VERDICT_LABELS: Record<CouncilArtifactFinalVerdict, string> = {
  use: '可用于真实规划',
  repair: '返修后再用',
  reject: '拒绝使用',
}

function defaultChecks(): Record<CheckId, boolean> {
  return {
    prdDirectlyActionable: false,
    theaterTraceClear: false,
    baoyuChineseReadable: false,
    visualTasteProfessional: false,
    noFakeProgress: false,
    wouldUseForRealPlanning: false,
  }
}

export function CouncilArtifactReviewView({
  ledger,
  latestRunId,
  onSave,
  onClear,
}: CouncilArtifactReviewViewProps) {
  const [reviewerAlias, setReviewerAlias] = useState('')
  const [reviewerKind, setReviewerKind] = useState<CouncilArtifactReviewerKind>('boss')
  const [reviewedExportRef, setReviewedExportRef] = useState('')
  const [artifactScore, setArtifactScore] = useState('90')
  const [prdScore, setPrdScore] = useState('90')
  const [theaterScore, setTheaterScore] = useState('90')
  const [baoyuScore, setBaoyuScore] = useState('90')
  const [trustScore, setTrustScore] = useState('90')
  const [prdNotes, setPrdNotes] = useState('')
  const [theaterNotes, setTheaterNotes] = useState('')
  const [baoyuNotes, setBaoyuNotes] = useState('')
  const [trustNotes, setTrustNotes] = useState('')
  const [dissatisfaction, setDissatisfaction] = useState('')
  const [repairRequired, setRepairRequired] = useState(false)
  const [repairResolved, setRepairResolved] = useState(false)
  const [repairNotes, setRepairNotes] = useState('')
  const [finalVerdict, setFinalVerdict] = useState<CouncilArtifactFinalVerdict>('repair')
  const [notes, setNotes] = useState('')
  const [checks, setChecks] = useState<Record<CheckId, boolean>>(defaultChecks)

  const stats = ledger.stats
  const canSubmit = reviewerAlias.trim().length > 0 && reviewedExportRef.trim().length > 0

  function toggleCheck(id: CheckId) {
    setChecks((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function submit() {
    if (!canSubmit) return
    onSave({
      runId: latestRunId,
      reviewerAlias,
      reviewerKind,
      reviewedExportRef,
      artifactScore: Number(artifactScore) || 0,
      prdScore: Number(prdScore) || 0,
      theaterScore: Number(theaterScore) || 0,
      baoyuScore: Number(baoyuScore) || 0,
      trustScore: Number(trustScore) || 0,
      ...checks,
      prdNotes,
      theaterNotes,
      baoyuNotes,
      trustNotes,
      dissatisfaction,
      repairRequired,
      repairResolved,
      repairNotes,
      finalVerdict,
      notes,
    })
    setReviewerAlias('')
    setReviewedExportRef('')
    setDissatisfaction('')
    setRepairRequired(false)
    setRepairResolved(false)
    setRepairNotes('')
    setFinalVerdict('repair')
    setNotes('')
    setPrdNotes('')
    setTheaterNotes('')
    setBaoyuNotes('')
    setTrustNotes('')
    setChecks(defaultChecks())
  }

  return (
    <section className="council-app__panel council-artifact-review" aria-label="人工审美与产物验收账本">
      <div className="council-app__panel-head">
        <div>
          <div className="council-app__section-kicker">人工审美与产物验收 · 95 最后一公里</div>
          <h2>{STATUS_LABELS[stats.certificationStatus]}：{stats.passedReviews}/{stats.totalReviews} 名审稿人通过</h2>
          <p>至少 2 名人工审稿人，Boss 终审必须通过；PRD、辩论剧场、技术蓝图和整体可信度都要 90+，模型模拟审稿会被记录但不会放行 95。</p>
        </div>
        {onClear && ledger.records.length > 0 && (
          <button type="button" onClick={onClear}>
            清空审美验收
          </button>
        )}
      </div>

      <div className="council-artifact-review__stats">
        <article>
          <span>状态</span>
          <strong>{STATUS_LABELS[stats.certificationStatus]}</strong>
        </article>
        <article>
          <span>审稿人</span>
          <strong>{stats.totalReviews}/{stats.requiredReviews}</strong>
        </article>
        <article>
          <span>通过</span>
          <strong>{stats.passedReviews}/{stats.requiredPasses}</strong>
        </article>
        <article>
          <span>Boss 终审</span>
          <strong>{stats.bossFinalPassed ? 'yes' : 'no'}</strong>
        </article>
        <article>
          <span>非 Boss 审稿</span>
          <strong>{stats.peerReviewPassed ? 'yes' : 'no'}</strong>
        </article>
        <article>
          <span>返修未闭环</span>
          <strong>{stats.unresolvedRepairs}</strong>
        </article>
      </div>

      <div className="council-artifact-review__stats council-artifact-review__stats--dimensions">
        <article>
          <span>PRD</span>
          <strong>{stats.prdAverageScore}</strong>
        </article>
        <article>
          <span>剧场</span>
          <strong>{stats.theaterAverageScore}</strong>
        </article>
        <article>
          <span>技术蓝图</span>
          <strong>{stats.baoyuAverageScore}</strong>
        </article>
        <article>
          <span>可信度</span>
          <strong>{stats.trustAverageScore}</strong>
        </article>
      </div>

      <div className="council-artifact-review__form">
        <label>
          <span>审稿代号</span>
          <input value={reviewerAlias} onChange={(event) => setReviewerAlias(event.target.value)} placeholder="Boss / 审稿人 A" />
        </label>
        <label>
          <span>审稿来源</span>
          <select value={reviewerKind} onChange={(event) => setReviewerKind(event.target.value as CouncilArtifactReviewerKind)}>
            {Object.entries(REVIEWER_KIND_LABELS).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>被验收导出物</span>
          <input value={reviewedExportRef} onChange={(event) => setReviewedExportRef(event.target.value)} placeholder={latestRunId || 'PRD 文件 / HTML 导出 / 共识追溯 / 截图编号'} />
        </label>
        <label>
          <span>总分</span>
          <input value={artifactScore} onChange={(event) => setArtifactScore(event.target.value)} inputMode="numeric" />
        </label>
        <label>
          <span>PRD 分</span>
          <input value={prdScore} onChange={(event) => setPrdScore(event.target.value)} inputMode="numeric" />
        </label>
        <label>
          <span>剧场分</span>
          <input value={theaterScore} onChange={(event) => setTheaterScore(event.target.value)} inputMode="numeric" />
        </label>
        <label>
          <span>技术蓝图分</span>
          <input value={baoyuScore} onChange={(event) => setBaoyuScore(event.target.value)} inputMode="numeric" />
        </label>
        <label>
          <span>可信度分</span>
          <input value={trustScore} onChange={(event) => setTrustScore(event.target.value)} inputMode="numeric" />
        </label>
        <div className="council-artifact-review__checks">
          {CHECKS.map((item) => (
            <button key={item.id} type="button" data-checked={checks[item.id]} onClick={() => toggleCheck(item.id)}>
              <span>{checks[item.id] ? 'pass' : 'fail'}</span>
              {item.label}
            </button>
          ))}
        </div>
        <label className="council-artifact-review__notes">
          <span>PRD 审稿摘要</span>
          <textarea value={prdNotes} onChange={(event) => setPrdNotes(event.target.value)} placeholder="是否能直接拆工程、设计、测试任务；缺口在哪里。" />
        </label>
        <label className="council-artifact-review__notes">
          <span>剧场审稿摘要</span>
          <textarea value={theaterNotes} onChange={(event) => setTheaterNotes(event.target.value)} placeholder="冲突、反驳、裁决账本是否能追溯；哪里不可信。" />
        </label>
        <label className="council-artifact-review__notes">
          <span>技术蓝图审稿摘要</span>
          <textarea value={baoyuNotes} onChange={(event) => setBaoyuNotes(event.target.value)} placeholder="前端、后端、API、数据、部署和测试是否清晰可实施。" />
        </label>
        <label className="council-artifact-review__notes">
          <span>整体可信度摘要</span>
          <textarea value={trustNotes} onChange={(event) => setTrustNotes(event.target.value)} placeholder="是否存在假进度、假思考、无法对应证据的声称；是否值得真实规划。" />
        </label>
        <label className="council-artifact-review__notes">
          <span>不满意点</span>
          <textarea value={dissatisfaction} onChange={(event) => setDissatisfaction(event.target.value)} placeholder="没有就写 none；有就写需要返修的具体点。" />
        </label>
        <div className="council-artifact-review__checks">
          <button type="button" data-checked={repairRequired} onClick={() => setRepairRequired((value) => !value)}>
            <span>{repairRequired ? 'yes' : 'no'}</span>
            需要返修
          </button>
          <button type="button" data-checked={repairResolved} onClick={() => setRepairResolved((value) => !value)}>
            <span>{repairResolved ? 'yes' : 'no'}</span>
            返修已闭环
          </button>
        </div>
        <label className="council-artifact-review__notes">
          <span>返修记录</span>
          <textarea value={repairNotes} onChange={(event) => setRepairNotes(event.target.value)} placeholder="如果需要返修，写具体修了什么以及复验结论。" />
        </label>
        <label>
          <span>最终裁决</span>
          <select value={finalVerdict} onChange={(event) => setFinalVerdict(event.target.value as CouncilArtifactFinalVerdict)}>
            {Object.entries(VERDICT_LABELS).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </label>
        <label className="council-artifact-review__notes">
          <span>审稿备注</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="只写摘要：哪里惊艳、哪里不够、是否愿意真实使用。" />
        </label>
        <button type="button" className="council-app__primary" onClick={submit} disabled={!canSubmit}>
          记录一次人工审美验收
        </button>
      </div>

      <div className="council-artifact-review__records">
        {ledger.records.length ? (
          ledger.records.slice(0, 5).map((record) => (
            <article key={record.id} data-status={record.passed ? 'passed' : 'failed'}>
              <div>
                <span>{record.passed ? 'passed' : 'failed'} · {record.artifactScore} · {record.reviewerKind || 'unknown'}</span>
                <h3>{record.reviewerAlias}</h3>
                <small>{record.savedAt} · run {record.runId || 'none'}</small>
              </div>
              <p>{record.trustNotes || record.notes || record.reviewedExportRef}</p>
              <small>分项：PRD {record.prdScore} / 剧场 {record.theaterScore} / 技术蓝图 {record.baoyuScore} / 可信度 {record.trustScore}</small>
              <small>返修 {record.repairRequired ? (record.repairResolved ? '已闭环' : '未闭环') : '无'} · 裁决 {record.finalVerdict || 'missing'}</small>
              {record.failureReasons.length > 0 && <small>{record.failureReasons.join(' / ')}</small>}
            </article>
          ))
        ) : (
          <article data-status="missing">
            <div>
              <span>等待人工审稿</span>
              <h3>还没有审美验收记录</h3>
              <small>这不是模型自评，必须由 Boss 或真实审稿人确认。</small>
            </div>
            <p>95 候选必须过人工审美与可用性验收，不能只靠自动评分。</p>
          </article>
        )}
      </div>
    </section>
  )
}
