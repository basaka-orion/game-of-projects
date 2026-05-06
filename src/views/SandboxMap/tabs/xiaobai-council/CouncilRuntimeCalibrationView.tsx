import type { CouncilRuntimeCalibrationPlan } from '../../../../lib/xiaobai-council/runtime-calibration'

interface CouncilRuntimeCalibrationViewProps {
  plan: CouncilRuntimeCalibrationPlan
}

const STATUS_LABELS: Record<CouncilRuntimeCalibrationPlan['status'], string> = {
  'needs-baseline': '基线缺失',
  'needs-deep-run': '等待长跑',
  'needs-user-validation': '等待用户验证',
  'candidate-95': '95 候选',
}

export function CouncilRuntimeCalibrationView({ plan }: CouncilRuntimeCalibrationViewProps) {
  const weakest = [...plan.checks].sort((a, b) => a.score - b.score).slice(0, 3)

  return (
    <section className="council-app__panel council-runtime-calibration" aria-label="95 真实长跑评测协议">
      <div className="council-app__panel-head">
        <div>
          <div className="council-app__section-kicker">95 真实长跑评测协议 · 不伪造通过</div>
          <h2>{plan.label}</h2>
          <p>{plan.summary}</p>
        </div>
        <div className="council-runtime-calibration__score" data-status={plan.status}>
          <strong>{plan.score}</strong>
          <span>{STATUS_LABELS[plan.status]}</span>
        </div>
      </div>

      <div className="council-runtime-calibration__checks">
        {plan.checks.map((item) => (
          <article key={item.id} data-status={item.status}>
            <div>
              <span>{item.status}</span>
              <strong>{item.score}</strong>
            </div>
            <h3>{item.label}</h3>
            <p>{item.proof}</p>
            <small>{item.requiredAction}</small>
          </article>
        ))}
      </div>

      <div className="council-runtime-calibration__grid">
        <article>
          <h3>最弱三项</h3>
          {weakest.map((item) => (
            <p key={item.id}>
              <strong>{item.label} · {item.score}</strong>
              {item.requiredAction}
            </p>
          ))}
        </article>
        <article>
          <h3>下一次深度运行</h3>
          {plan.nextDeepRunProtocol.slice(0, 5).map((item) => <p key={item}>{item}</p>)}
        </article>
        <article>
          <h3>停止条件</h3>
          {plan.stopConditions.slice(0, 5).map((item) => <p key={item}>{item}</p>)}
        </article>
      </div>

      <div className="council-runtime-calibration__users">
        <h3>真实小白用户验证</h3>
        {plan.userValidationProtocol.map((item, index) => (
          <p key={item}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            {item}
          </p>
        ))}
      </div>
    </section>
  )
}
