import type { CouncilRuntimeEvidenceLedger } from '../../../../lib/xiaobai-council/runtime-evidence'
import { normalizeCouncilRuntimeHistoryProof } from '../../../../lib/xiaobai-council/runtime-history'

interface CouncilRuntimeEvidenceViewProps {
  ledger: CouncilRuntimeEvidenceLedger
}

export function CouncilRuntimeEvidenceView({ ledger }: CouncilRuntimeEvidenceViewProps) {
  const judgeTraceVerified = ledger.deepRunCertification.modelJudgeTraceVerified
  const stageTraceVerified = ledger.deepRunCertification.stageTraceVerified
  const temporalTraceVerified = ledger.deepRunCertification.temporalTraceVerified

  return (
    <section className="council-app__panel council-runtime" aria-label="真实运行证据账本">
      <div className="council-app__panel-head">
        <div>
          <div className="council-app__section-kicker">真实运行证据账本 · 可导出复验</div>
          <h2>
            {judgeTraceVerified
              ? '已核验深度模型裁判 trace'
              : ledger.modelJudgeUsed
                ? '模型裁判字段存在，但 trace 未核验'
                : '已记录本地 fallback 链路'}
          </h2>
          <p>
            runId {ledger.runId} · {Math.round(ledger.durationMs / 1000)}s · {ledger.decisionSource}
          </p>
        </div>
        <strong className={`council-runtime__badge council-runtime__badge--${judgeTraceVerified ? 'deep' : 'fallback'}`}>
          {judgeTraceVerified ? 'verified deep-model' : ledger.modelJudgeUsed ? 'unverified model trace' : 'fallback'}
        </strong>
      </div>

      <div className="council-runtime__metrics">
        <article>
          <span>阶段 trace</span>
          <strong>{stageTraceVerified ? '6/6 verified' : `${ledger.stageTrace.length}/6 raw`}</strong>
        </article>
        <article>
          <span>消息 / 短评</span>
          <strong>{ledger.messageCount}/{ledger.briefCount}</strong>
        </article>
        <article>
          <span>剧场 / 关系</span>
          <strong>{ledger.sceneCount}/{ledger.relationCount}</strong>
        </article>
        <article>
          <span>质量</span>
          <strong>{ledger.qualityScore} · {ledger.qualityStatus}</strong>
        </article>
        <article>
          <span>行动任务</span>
          <strong>{ledger.actionTaskCount}</strong>
        </article>
        <article>
          <span>追溯导出</span>
          <strong>{ledger.actionTaskCount}</strong>
        </article>
      </div>

      <div className="council-runtime__cert" data-status={ledger.deepRunCertification.status}>
        <div>
          <span>深度长跑认证</span>
          <h3>{ledger.deepRunCertification.label}</h3>
          <p>{ledger.deepRunCertification.proofSummary}</p>
          <p>
            裁判 trace {judgeTraceVerified ? '已核验' : '未核验'} · 阶段顺序 {stageTraceVerified ? '已核验' : '未核验'} · 时间线 {temporalTraceVerified ? '可信' : '待补证'}
          </p>
        </div>
        <strong>{Math.round(ledger.deepRunCertification.actualDurationMs / 1000)}s / {Math.round(ledger.deepRunCertification.requiredDurationMs / 1000)}s</strong>
      </div>

      <div className="council-runtime__replay" aria-label="运行回放时间线">
        <h3>真实运行回放</h3>
        <div>
          {ledger.replayFrames.map((frame) => (
            <article key={frame.id} data-status={frame.status} data-source={frame.source}>
              <span>{Math.round(frame.atMs / 1000)}s · {frame.source}</span>
              <strong>{frame.title}</strong>
              <p>{frame.summary}</p>
              {frame.evidenceRefs.length > 0 && <small>{frame.evidenceRefs.slice(0, 4).join(' / ')}</small>}
            </article>
          ))}
        </div>
      </div>

      <div className="council-runtime__proofs">
        {ledger.evidenceItems.map((proof) => (
          <article key={proof.id} data-status={proof.status}>
            <span>{proof.status}</span>
            <strong>{proof.label}</strong>
            <p>{proof.detail}</p>
          </article>
        ))}
      </div>

      <div className="council-runtime__bottom">
        <article>
          <h3>导出证明</h3>
          {ledger.exportProof.map((proof) => <p key={proof}>{proof}</p>)}
        </article>
        <article>
          <h3>仍需补证</h3>
          {[...ledger.deepRunCertification.blockers, ...ledger.nextProofNeeded].slice(0, 7).map((proof, index) => {
            const normalized = normalizeCouncilRuntimeHistoryProof(proof)
            return <p key={`${index}-${normalized}`}>{normalized}</p>
          })}
        </article>
      </div>
    </section>
  )
}
