import { useState } from 'react'
import type { CouncilNuwaEvidenceRegistry } from '../../../../lib/xiaobai-council/distillation-evidence'
import type { CouncilNuwaLocalPreflightReport } from '../../../../lib/xiaobai-council/source-preflight'
import type { CouncilNuwaSourceAuditLedger, SaveCouncilNuwaSourceAuditInput } from '../../../../lib/xiaobai-council/source-audit'

interface CouncilNuwaSourceAuditViewProps {
  registry: CouncilNuwaEvidenceRegistry
  ledger: CouncilNuwaSourceAuditLedger
  onSave: (input: SaveCouncilNuwaSourceAuditInput) => void
  onClear?: () => void
  preflight?: CouncilNuwaLocalPreflightReport | null
  preflightRunning?: boolean
  preflightError?: string
  onRunPreflight?: () => void
}

type CheckId =
  | 'checkedSkillMd'
  | 'checkedEvidenceMd'
  | 'checkedSixStreams'
  | 'uncertaintyBoundaryConfirmed'
  | 'noAuthorizationClaimConfirmed'

const CHECKS: Array<{ id: CheckId; label: string }> = [
  { id: 'checkedSkillMd', label: '已抽查 SKILL.md' },
  { id: 'checkedEvidenceMd', label: '已抽查 EVIDENCE.md' },
  { id: 'checkedSixStreams', label: '已核对六路来源索引' },
  { id: 'uncertaintyBoundaryConfirmed', label: '已确认“不确定”边界' },
  { id: 'noAuthorizationClaimConfirmed', label: '已排除真人授权暗示' },
]

export function CouncilNuwaSourceAuditView({
  registry,
  ledger,
  onSave,
  onClear,
  preflight,
  preflightRunning = false,
  preflightError = '',
  onRunPreflight,
}: CouncilNuwaSourceAuditViewProps) {
  const [personaId, setPersonaId] = useState(registry.packs[0]?.personaId || '')
  const [reviewerAlias, setReviewerAlias] = useState('')
  const [sourceIndexSummary, setSourceIndexSummary] = useState('')
  const [validationQuestionsRun, setValidationQuestionsRun] = useState('2')
  const [notes, setNotes] = useState('')
  const [checks, setChecks] = useState<Record<CheckId, boolean>>({
    checkedSkillMd: true,
    checkedEvidenceMd: true,
    checkedSixStreams: false,
    uncertaintyBoundaryConfirmed: true,
    noAuthorizationClaimConfirmed: true,
  })
  const selectedPack = registry.packs.find((pack) => pack.personaId === personaId) || registry.packs[0]
  const selectedPreflight = preflight?.reports.find((report) => report.personaId === selectedPack?.personaId)
  const canSubmit = Boolean(selectedPack && reviewerAlias.trim() && sourceIndexSummary.trim())

  function toggle(id: CheckId) {
    setChecks((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function submit() {
    if (!selectedPack || !canSubmit) return
    onSave({
      personaId: selectedPack.personaId,
      reviewerAlias,
      sourceIndexSummary,
      validationQuestionsRun: Number(validationQuestionsRun) || 0,
      ...checks,
      notes,
    })
    setSourceIndexSummary('')
    setNotes('')
  }

  return (
    <section className="council-app__panel council-nuwa-source-audit" aria-label="Nuwa 来源级人工复核账本">
      <div className="council-app__panel-head">
        <div>
          <div className="council-app__section-kicker">Nuwa 来源级人工复核账本 · 不把模板当证据</div>
          <h2>{ledger.stats.auditedPersonaCount}/{ledger.stats.personaCount} 位完成来源复核</h2>
          <p>
            只有复核 SKILL.md、EVIDENCE.md、六路来源索引、至少 2 道验证题、不确定边界和授权边界后，角色才会进入 source-audit-ready。
          </p>
        </div>
        <div className="council-nuwa-source-audit__head-actions">
          {onRunPreflight && (
            <button type="button" onClick={onRunPreflight} disabled={preflightRunning}>
              {preflightRunning ? '预检中...' : '运行本地包预检'}
            </button>
          )}
          {onClear && ledger.records.length > 0 && (
            <button type="button" onClick={onClear}>
              清空复核
            </button>
          )}
        </div>
      </div>

      <div className="council-nuwa-source-audit__stats">
        <article>
          <span>复核角色</span>
          <strong>{ledger.stats.auditedPersonaCount}/{ledger.stats.personaCount}</strong>
        </article>
        <article>
          <span>记录数</span>
          <strong>{ledger.stats.totalRecords}</strong>
        </article>
        <article>
          <span>失败记录</span>
          <strong>{ledger.stats.failedRecordCount}</strong>
        </article>
        <article>
          <span>覆盖率</span>
          <strong>{ledger.stats.coverageRatio}%</strong>
        </article>
      </div>

      {(preflight || preflightRunning || preflightError) && (
        <div className="council-nuwa-source-audit__preflight" aria-label="Nuwa 本地包自动预检">
          <div>
            <span>自动预检</span>
            <h3>{preflightRunning ? '正在读取本地 Nuwa skill 包' : preflight?.summary || '预检失败'}</h3>
            <p>
              自动预检只证明本地包结构和诚实边界；它不能替代来源级人工复核，也不能替代真实用户验证。
            </p>
            {preflightError && <small>{preflightError}</small>}
          </div>
          {preflight && (
            <>
              <div className="council-nuwa-source-audit__preflight-stats">
                <article>
                  <span>本地可用</span>
                  <strong>{preflight.localReadyCount}/{preflight.personaCount}</strong>
                </article>
                <article>
                  <span>本地分</span>
                  <strong>{preflight.averageLocalPackageScore}</strong>
                </article>
                <article>
                  <span>来源深度</span>
                  <strong>{preflight.averageSourceIndexDepthScore}</strong>
                </article>
                <article>
                  <span>模板槽位</span>
                  <strong>{preflight.templateOnlyResearchFileCount}</strong>
                </article>
              </div>
              <div className="council-nuwa-source-audit__preflight-truth">
                {preflight.hardTruth.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
              {selectedPreflight && (
                <article className="council-nuwa-source-audit__preflight-persona" data-status={selectedPreflight.packageStatus}>
                  <div>
                    <span>当前角色预检</span>
                    <h3>{selectedPreflight.personaName}</h3>
                    <small>
                      local {selectedPreflight.localPackageScore} · source depth {selectedPreflight.sourceIndexDepthScore} ·{' '}
                      {selectedPreflight.canUseAsLocalSkill ? '本地可调用' : '本地包需修复'}
                    </small>
                  </div>
                  <p>{selectedPreflight.missingProof.join(' / ') || '本地包结构通过；仍需人工来源复核。'}</p>
                  <div className="council-nuwa-source-audit__stream-list">
                    {selectedPreflight.researchStreams.map((stream) => (
                      <span key={stream.id} data-template={stream.templateOnly}>
                        {stream.label} {stream.depthScore}
                      </span>
                    ))}
                  </div>
                </article>
              )}
            </>
          )}
        </div>
      )}

      <div className="council-nuwa-source-audit__form">
        <label>
          <span>角色</span>
          <select value={selectedPack?.personaId || ''} onChange={(event) => setPersonaId(event.target.value)}>
            {registry.packs.map((pack) => (
              <option key={pack.personaId} value={pack.personaId}>
                {pack.personaName}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>复核者</span>
          <input value={reviewerAlias} onChange={(event) => setReviewerAlias(event.target.value)} placeholder="Boss / reviewer A" />
        </label>
        <label>
          <span>验证题数量</span>
          <input value={validationQuestionsRun} onChange={(event) => setValidationQuestionsRun(event.target.value)} inputMode="numeric" />
        </label>
        <label className="council-nuwa-source-audit__wide">
          <span>来源索引摘要</span>
          <textarea
            value={sourceIndexSummary}
            onChange={(event) => setSourceIndexSummary(event.target.value)}
            placeholder="写清楚已核对的著作/长文、访谈、表达 DNA、他评、真实决策、时间线摘要或本地文件索引。"
          />
        </label>
        <div className="council-nuwa-source-audit__checks">
          {CHECKS.map((item) => (
            <button key={item.id} type="button" data-checked={checks[item.id]} onClick={() => toggle(item.id)}>
              <span>{checks[item.id] ? 'pass' : 'fail'}</span>
              {item.label}
            </button>
          ))}
        </div>
        <label className="council-nuwa-source-audit__wide">
          <span>复核备注</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="只写摘要，不写密钥、账号或原始隐私长日志。" />
        </label>
        <button type="button" className="council-app__primary" onClick={submit} disabled={!canSubmit}>
          保存来源复核
        </button>
      </div>

      <div className="council-nuwa-source-audit__records">
        {ledger.records.length ? (
          ledger.records.slice(0, 8).map((record) => (
            <article key={record.id} data-status={record.passed ? 'passed' : 'failed'}>
              <div>
                <span>{record.passed ? 'passed' : 'failed'} · {record.reviewerAlias}</span>
                <h3>{record.personaName}</h3>
                <small>{record.savedAt} · {record.validationQuestionsRun} validation questions</small>
              </div>
              <p>{record.sourceIndexSummary}</p>
              {record.failureReasons.length > 0 && <small>{record.failureReasons.join(' / ')}</small>}
            </article>
          ))
        ) : (
          <article data-status="missing">
            <div>
              <span>等待来源复核</span>
              <h3>还没有人工来源级复核记录</h3>
              <small>当前 36 位仍只能称为本地结构化 Nuwa skill，不可声称来源级深蒸馏完成。</small>
            </div>
            <p>先抽检本轮入选角色，再逐步扩展到全部 36 位。</p>
          </article>
        )}
      </div>
    </section>
  )
}
