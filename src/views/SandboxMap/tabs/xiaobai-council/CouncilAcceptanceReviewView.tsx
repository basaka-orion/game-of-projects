import type { CouncilAcceptanceReview } from '../../../../lib/xiaobai-council/acceptance-review'

interface CouncilAcceptanceReviewViewProps {
  review: CouncilAcceptanceReview
}

const STATUS_LABEL: Record<CouncilAcceptanceReview['status'], string> = {
  'needs-deep-run': '缺长跑',
  'needs-revision': '需返修',
  'needs-human-validation': '缺真人验收',
  'candidate-95': '95 候选',
}

export function CouncilAcceptanceReviewView({ review }: CouncilAcceptanceReviewViewProps) {
  const failed = review.gates.filter((gate) => gate.status !== 'pass')

  return (
    <section className="council-app__panel council-acceptance" aria-label="95 验收闭环总闸门">
      <div className="council-app__panel-head">
        <div>
          <div className="council-app__section-kicker">95 验收闭环总闸门 · 长跑 / 审美 / 真人</div>
          <h2>{review.label}</h2>
          <p>{review.summary}</p>
        </div>
        <div className="council-acceptance__score" data-status={review.status}>
          <strong>{review.score}</strong>
          <span>{STATUS_LABEL[review.status]}</span>
        </div>
      </div>

      <div className="council-acceptance__claim" data-allowed={review.claimAllowed}>
        <strong>{review.claimAllowed ? '允许进入 95 候选' : '禁止声称已达 95'}</strong>
        <p>
          {review.claimAllowed
            ? '机器证据、人工审美和真实小白验证均已过线，仍保留最终人工终审。'
            : '任何一项硬证据缺失，系统只能显示缺口与下一步，不能把结果包装成天才应用。'}
        </p>
      </div>

      <div className="council-acceptance__gates">
        {review.gates.map((gate) => (
          <article key={gate.id} data-status={gate.status} data-hard={gate.hardGate}>
            <div>
              <span>{gate.hardGate ? 'hard gate' : 'supporting'} · {gate.status}</span>
              <h3>{gate.label}</h3>
            </div>
            <strong>{gate.score}</strong>
            <p>{gate.proof}</p>
            {gate.status !== 'pass' && <small>{gate.requiredProof}</small>}
          </article>
        ))}
      </div>

      <div className="council-acceptance__protocols">
        <article>
          <h3>{failed.length ? '下一步必须补齐' : '最终人工终审'}</h3>
          {(review.nextActions.length ? review.nextActions : ['复看导出、截图、用户记录和来源索引。']).slice(0, 6).map((item) => (
            <p key={item}>{item}</p>
          ))}
        </article>
        <article>
          <h3>2-5 分钟深度长跑协议</h3>
          {review.deepRunProtocol.slice(0, 5).map((item) => (
            <p key={item}>{item}</p>
          ))}
        </article>
        <article>
          <h3>真人与审美验收协议</h3>
          {review.humanValidationProtocol.slice(0, 6).map((item) => (
            <p key={item}>{item}</p>
          ))}
        </article>
      </div>
    </section>
  )
}
