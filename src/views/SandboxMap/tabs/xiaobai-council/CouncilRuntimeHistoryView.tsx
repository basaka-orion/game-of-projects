import {
  normalizeCouncilRuntimeHistoryProof,
  type CouncilRuntimeHistoryLedger,
} from '../../../../lib/xiaobai-council/runtime-history'

interface CouncilRuntimeHistoryViewProps {
  history: CouncilRuntimeHistoryLedger
  onClear?: () => void
}

const STATUS_LABELS: Record<string, string> = {
  proved: '已认证',
  partial: '部分成立',
  missing: '未认证',
}

export function CouncilRuntimeHistoryView({ history, onClear }: CouncilRuntimeHistoryViewProps) {
  return (
    <section className="council-app__panel council-runtime-history" aria-label="真实长跑历史">
      <div className="council-app__panel-head">
        <div>
          <div className="council-app__section-kicker">真实长跑历史 · 本地复验证据</div>
          <h2>每次完整运行都会沉淀证据，不把短跑伪装成神作</h2>
          <p>
            已保存 {history.stats.totalRuns} 次运行；深度长跑认证 {history.stats.provedDeepRuns} 次，
            partial {history.stats.partialDeepRuns} 次，fallback {history.stats.fallbackRuns} 次。
          </p>
        </div>
        {onClear && history.records.length > 0 && (
          <button type="button" onClick={onClear}>
            清空历史
          </button>
        )}
      </div>

      <div className="council-runtime-history__stats">
        <article>
          <span>总运行</span>
          <strong>{history.stats.totalRuns}</strong>
        </article>
        <article>
          <span>proved 长跑</span>
          <strong>{history.stats.provedDeepRuns}</strong>
        </article>
        <article>
          <span>fallback</span>
          <strong>{history.stats.fallbackRuns}</strong>
        </article>
        <article>
          <span>最佳质量</span>
          <strong>{history.stats.bestQualityScore}</strong>
        </article>
      </div>

      <div className="council-runtime-history__list">
        {history.records.length ? (
          history.records.map((record) => (
            <article key={record.id} data-status={record.deepRunStatus}>
              <div>
                <span>{STATUS_LABELS[record.deepRunStatus] || record.deepRunStatus} · {record.decisionSource}</span>
                <h3>{record.problemPreview || record.runId}</h3>
                <small>{record.savedAt} · {Math.round(record.durationMs / 1000)}s · quality {record.qualityScore}/{record.qualityStatus}</small>
              </div>
              <p>{record.deepRunLabel}。{record.proofSummary}</p>
              <div className="council-runtime-history__team">
                {record.teamSummary.map((item) => <span key={item}>{item}</span>)}
              </div>
              {record.blockers.length > 0 && (
                <details>
                  <summary>查看未达 95 的硬证据缺口</summary>
                  {record.blockers.slice(0, 6).map((blocker, index) => {
                    const normalized = normalizeCouncilRuntimeHistoryProof(blocker)
                    return <p key={`${index}-${normalized}`}>{normalized}</p>
                  })}
                </details>
              )}
            </article>
          ))
        ) : (
          <article data-status="missing">
            <div>
              <span>等待第一次运行</span>
              <h3>还没有可回看的长跑记录</h3>
              <small>激活推荐队伍并完成一次 PRD run 后，证据账本会自动写入这里。</small>
            </div>
            <p>历史只保存摘要和运行证据，不保存 API key、密钥或原始长日志。</p>
          </article>
        )}
      </div>
    </section>
  )
}
