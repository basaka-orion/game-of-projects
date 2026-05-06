import { useState } from 'react'
import {
  COUNCIL_USER_VALIDATION_TASK_SCRIPT,
  type CouncilUserValidationLedger,
  type CouncilUserValidationParticipantKind,
  type SaveCouncilUserValidationInput,
} from '../../../../lib/xiaobai-council/user-validation'

interface CouncilUserValidationViewProps {
  ledger: CouncilUserValidationLedger
  problem: string
  latestRunId?: string
  onSave: (input: SaveCouncilUserValidationInput) => void
  onClear?: () => void
}

type CheckId =
  | 'completedInput'
  | 'understoodMatchReason'
  | 'foundNextAction'
  | 'namedCutAndKeptReason'
  | 'exportedOutcome'

const CHECKS: Array<{ id: CheckId; label: string }> = [
  { id: 'completedInput', label: '能独立输入真实问题' },
  { id: 'understoodMatchReason', label: '能看懂推荐编队理由' },
  { id: 'foundNextAction', label: '能找到下一步行动' },
  { id: 'namedCutAndKeptReason', label: '能说出保留/裁掉理由' },
  { id: 'exportedOutcome', label: '能复制 PRD 或导出追溯简报' },
]

const STATUS_LABELS: Record<CouncilUserValidationLedger['stats']['certificationStatus'], string> = {
  missing: '缺验证',
  collecting: '收集中',
  passed: '已过线',
  failed: '未过线',
}

const PARTICIPANT_KIND_LABELS: Record<CouncilUserValidationParticipantKind, string> = {
  'external-human': '外部真人小白',
  'designer-or-team': '设计/团队成员',
  'boss-self-check': 'Boss 自测',
  'model-simulation': '模型模拟',
}

function defaultChecks(): Record<CheckId, boolean> {
  return {
    completedInput: false,
    understoodMatchReason: false,
    foundNextAction: false,
    namedCutAndKeptReason: false,
    exportedOutcome: false,
  }
}

export function CouncilUserValidationView({
  ledger,
  problem,
  latestRunId,
  onSave,
  onClear,
}: CouncilUserValidationViewProps) {
  const [participantAlias, setParticipantAlias] = useState('')
  const [participantKind, setParticipantKind] = useState<CouncilUserValidationParticipantKind>('external-human')
  const [observerAlias, setObserverAlias] = useState('')
  const [taskPrompt, setTaskPrompt] = useState('')
  const [completionMinutes, setCompletionMinutes] = useState('')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [usedRealProblem, setUsedRealProblem] = useState(false)
  const [uncoachedAttempt, setUncoachedAttempt] = useState(false)
  const [consentAndPrivacyConfirmed, setConsentAndPrivacyConfirmed] = useState(false)
  const [participantSummary, setParticipantSummary] = useState('')
  const [nextActionEvidence, setNextActionEvidence] = useState('')
  const [cutAndKeptEvidence, setCutAndKeptEvidence] = useState('')
  const [exportedArtifactRef, setExportedArtifactRef] = useState('')
  const [dissatisfaction, setDissatisfaction] = useState('')
  const [repairRequired, setRepairRequired] = useState(false)
  const [repairResolved, setRepairResolved] = useState(false)
  const [repairNotes, setRepairNotes] = useState('')
  const [finalWorthUsing, setFinalWorthUsing] = useState(false)
  const [notes, setNotes] = useState('')
  const [checks, setChecks] = useState<Record<CheckId, boolean>>(defaultChecks)

  const stats = ledger.stats
  const canSubmit = participantAlias.trim().length > 0 && observerAlias.trim().length > 0
  const defaultTask = taskPrompt.trim() || problem.trim() || '让小白用户独立完成一次：输入问题 -> 看推荐编队 -> 开始协作 -> 找到 PRD/导出。'

  function toggleCheck(id: CheckId) {
    setChecks((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function startTimer() {
    setStartedAt(Date.now())
    setCompletionMinutes('')
  }

  function finishTimer() {
    if (!startedAt) return
    const minutes = Math.max(0.1, Math.round(((Date.now() - startedAt) / 60000) * 10) / 10)
    setCompletionMinutes(String(minutes))
  }

  function submit() {
    if (!canSubmit) return
    onSave({
      runId: latestRunId,
      problem: problem || defaultTask,
      participantAlias,
      participantKind,
      observerAlias,
      taskPrompt: defaultTask,
      taskScript: COUNCIL_USER_VALIDATION_TASK_SCRIPT,
      completionMinutes: Number(completionMinutes) || 0,
      ...checks,
      usedRealProblem,
      uncoachedAttempt,
      consentAndPrivacyConfirmed,
      participantSummary,
      nextActionEvidence,
      cutAndKeptEvidence,
      exportedArtifactRef,
      dissatisfaction,
      repairRequired,
      repairResolved,
      repairNotes,
      finalWorthUsing,
      notes,
    })
    setParticipantAlias('')
    setObserverAlias('')
    setCompletionMinutes('')
    setStartedAt(null)
    setParticipantSummary('')
    setNextActionEvidence('')
    setCutAndKeptEvidence('')
    setExportedArtifactRef('')
    setDissatisfaction('')
    setRepairRequired(false)
    setRepairResolved(false)
    setRepairNotes('')
    setFinalWorthUsing(false)
    setNotes('')
    setChecks(defaultChecks())
  }

  return (
    <section className="council-app__panel council-user-validation" aria-label="真实小白用户验证账本">
      <div className="council-app__panel-head">
        <div>
          <div className="council-app__section-kicker">真实小白用户验证账本 · 95 外部校准</div>
          <h2>{STATUS_LABELS[stats.certificationStatus]}：{stats.passedParticipants}/{stats.totalParticipants} 人通过</h2>
          <p>
            采用 5-8 人稳审：至少 {stats.requiredParticipants} 名外部真人完成记录，且 {stats.requiredPasses} 人通过；失败记录会保留为返修证据，但不会放行 95。
          </p>
        </div>
        {onClear && ledger.records.length > 0 && (
          <button type="button" onClick={onClear}>
            清空验证
          </button>
        )}
      </div>

      <div className="council-user-validation__stats">
        <article>
          <span>状态</span>
          <strong>{STATUS_LABELS[stats.certificationStatus]}</strong>
        </article>
        <article>
          <span>参与者</span>
          <strong>{stats.totalParticipants}/{stats.requiredParticipants}</strong>
        </article>
        <article>
          <span>通过</span>
          <strong>{stats.passedParticipants}/{stats.requiredPasses}</strong>
        </article>
        <article>
          <span>返修未闭环</span>
          <strong>{stats.unresolvedRepairs}</strong>
        </article>
      </div>

      <div className="council-user-validation__protocol">
        <strong>现场测试脚本</strong>
        {COUNCIL_USER_VALIDATION_TASK_SCRIPT.map((step, index) => (
          <p key={step}>{index + 1}. {step}</p>
        ))}
      </div>

      <div className="council-user-validation__form">
        <label>
          <span>参与者匿名代号</span>
          <input value={participantAlias} onChange={(event) => setParticipantAlias(event.target.value)} placeholder="小白用户 A" />
        </label>
        <label>
          <span>观察员代号</span>
          <input value={observerAlias} onChange={(event) => setObserverAlias(event.target.value)} placeholder="观察员 B" />
        </label>
        <label>
          <span>参与者类型</span>
          <select value={participantKind} onChange={(event) => setParticipantKind(event.target.value as CouncilUserValidationParticipantKind)}>
            {Object.entries(PARTICIPANT_KIND_LABELS).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>完成分钟</span>
          <input value={completionMinutes} onChange={(event) => setCompletionMinutes(event.target.value)} inputMode="decimal" placeholder="计时或手动填写" />
        </label>
        <div className="council-user-validation__timer">
          <button type="button" onClick={startTimer}>开始计时</button>
          <button type="button" onClick={finishTimer} disabled={!startedAt}>标记完成</button>
        </div>
        <label className="council-user-validation__task">
          <span>给用户的真实任务</span>
          <textarea value={taskPrompt} onChange={(event) => setTaskPrompt(event.target.value)} placeholder={defaultTask} />
        </label>
        <div className="council-user-validation__checks">
          {CHECKS.map((item) => (
            <button key={item.id} type="button" data-checked={checks[item.id]} onClick={() => toggleCheck(item.id)}>
              <span>{checks[item.id] ? 'pass' : 'fail'}</span>
              {item.label}
            </button>
          ))}
        </div>
        <div className="council-user-validation__checks">
          <button type="button" data-checked={usedRealProblem} onClick={() => setUsedRealProblem((value) => !value)}>
            <span>{usedRealProblem ? 'yes' : 'no'}</span>
            使用参与者真实问题
          </button>
          <button type="button" data-checked={uncoachedAttempt} onClick={() => setUncoachedAttempt((value) => !value)}>
            <span>{uncoachedAttempt ? 'yes' : 'no'}</span>
            未引导/未代操作
          </button>
          <button type="button" data-checked={consentAndPrivacyConfirmed} onClick={() => setConsentAndPrivacyConfirmed((value) => !value)}>
            <span>{consentAndPrivacyConfirmed ? 'yes' : 'no'}</span>
            匿名与隐私确认
          </button>
          <button type="button" data-checked={finalWorthUsing} onClick={() => setFinalWorthUsing((value) => !value)}>
            <span>{finalWorthUsing ? 'yes' : 'no'}</span>
            最终愿意真实使用
          </button>
        </div>
        <label className="council-user-validation__task">
          <span>参与者复述</span>
          <textarea value={participantSummary} onChange={(event) => setParticipantSummary(event.target.value)} placeholder="参与者用自己的话说：这个智囊团给了什么判断。" />
        </label>
        <label className="council-user-validation__task">
          <span>下一步证据</span>
          <textarea value={nextActionEvidence} onChange={(event) => setNextActionEvidence(event.target.value)} placeholder="参与者指出的下一步行动、按钮、任务或导出位置。" />
        </label>
        <label className="council-user-validation__task">
          <span>取舍证据</span>
          <textarea value={cutAndKeptEvidence} onChange={(event) => setCutAndKeptEvidence(event.target.value)} placeholder="参与者说出的一个保留理由和一个被裁掉方向。" />
        </label>
        <label className="council-user-validation__task">
          <span>导出物引用</span>
          <input value={exportedArtifactRef} onChange={(event) => setExportedArtifactRef(event.target.value)} placeholder="PRD 文件名 / 共识追溯 / runId / 截图编号" />
        </label>
        <label className="council-user-validation__task">
          <span>不满意点</span>
          <textarea value={dissatisfaction} onChange={(event) => setDissatisfaction(event.target.value)} placeholder="没有就写 none；有就写具体卡点。" />
        </label>
        <div className="council-user-validation__checks">
          <button type="button" data-checked={repairRequired} onClick={() => setRepairRequired((value) => !value)}>
            <span>{repairRequired ? 'yes' : 'no'}</span>
            需要返修
          </button>
          <button type="button" data-checked={repairResolved} onClick={() => setRepairResolved((value) => !value)}>
            <span>{repairResolved ? 'yes' : 'no'}</span>
            返修已闭环
          </button>
        </div>
        <label className="council-user-validation__task">
          <span>返修记录</span>
          <textarea value={repairNotes} onChange={(event) => setRepairNotes(event.target.value)} placeholder="如有返修，写改了什么以及用户是否复验。" />
        </label>
        <label className="council-user-validation__task">
          <span>观察备注</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="只写摘要，不写隐私、账号、密钥或原始长日志。" />
        </label>
        <button type="button" className="council-app__primary" onClick={submit} disabled={!canSubmit}>
          记录一次真实验证
        </button>
      </div>

      <div className="council-user-validation__records">
        {ledger.records.length ? (
          ledger.records.slice(0, 6).map((record) => (
            <article key={record.id} data-status={record.passed ? 'passed' : 'failed'}>
              <div>
                <span>{record.passed ? 'passed' : 'failed'} · {record.completionMinutes} 分钟 · {record.participantKind || 'unknown'}</span>
                <h3>{record.participantAlias}</h3>
                <small>{record.savedAt} · observer {record.observerAlias || 'missing'} · run {record.runId || 'none'}</small>
              </div>
              <p>{record.participantSummary || record.taskPrompt}</p>
              <small>导出：{record.exportedArtifactRef || 'missing'} · 返修 {record.repairRequired ? (record.repairResolved ? '已闭环' : '未闭环') : '无'}</small>
              {record.failureReasons.length > 0 && <small>{record.failureReasons.join(' / ')}</small>}
            </article>
          ))
        ) : (
          <article data-status="missing">
            <div>
              <span>等待真实用户</span>
              <h3>还没有验证记录</h3>
              <small>这里记录匿名摘要，不保存密钥、账号或原始隐私材料。</small>
            </div>
            <p>95 分候选必须走外部小白验证，不能只靠模型自己评分。</p>
          </article>
        )}
      </div>
    </section>
  )
}
