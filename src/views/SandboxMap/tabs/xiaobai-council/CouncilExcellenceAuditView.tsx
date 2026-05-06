import type { CouncilExcellenceAudit } from '../../../../lib/xiaobai-council/excellence-audit'

interface CouncilExcellenceAuditViewProps {
  audit: CouncilExcellenceAudit
}

export function CouncilExcellenceAuditView({ audit }: CouncilExcellenceAuditViewProps) {
  const weakest = [...audit.dimensions].sort((a, b) => a.score - b.score).slice(0, 3)

  return (
    <section className="council-app__panel council-excellence" aria-label="95 分卓越审计">
      <div className="council-app__panel-head">
        <div>
          <div className="council-app__section-kicker">95 分卓越审计 · 不自欺评分</div>
          <h2>{audit.scoreLabel}</h2>
          <p>{audit.verdict}</p>
        </div>
        <div className="council-excellence__score">
          <strong>{audit.score}</strong>
          <span>gap {audit.gapToTarget}</span>
        </div>
      </div>

      <div className="council-excellence__radar">
        {audit.dimensions.map((dimension) => (
          <article key={dimension.id}>
            <div>
              <span>{dimension.label}</span>
              <strong>{dimension.score}</strong>
            </div>
            <meter min={0} max={100} value={dimension.score} />
            <p>{dimension.evidence[0]}</p>
          </article>
        ))}
      </div>

      <div className="council-excellence__grid">
        <article>
          <h3>最弱三项</h3>
          {weakest.map((dimension) => (
            <p key={dimension.id}>
              <strong>{dimension.label} · {dimension.score}</strong>
              {dimension.gaps[0] || '等待真实复验。'}
            </p>
          ))}
        </article>
        <article>
          <h3>现在不能声称</h3>
          {audit.mustNotClaimYet.map((item) => <p key={item}>{item}</p>)}
        </article>
        <article>
          <h3>下一轮冲刺</h3>
          {audit.nextSprint.map((item) => (
            <p key={item.label}>
              <strong>{item.label}</strong>
              {item.proof}
            </p>
          ))}
        </article>
      </div>

      <div className="council-excellence__proof">
        {audit.proofChain.map((item) => <span key={item}>{item}</span>)}
      </div>
    </section>
  )
}
