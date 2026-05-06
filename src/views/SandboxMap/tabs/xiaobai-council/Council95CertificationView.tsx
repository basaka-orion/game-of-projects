import type { Council95CertificationGate } from '../../../../lib/xiaobai-council/certification'

interface Council95CertificationViewProps {
  gate: Council95CertificationGate
}

const STATUS_LABEL: Record<Council95CertificationGate['status'], string> = {
  blocked: '禁止声称 95',
  'needs-human-proof': '缺外部证据',
  'candidate-95': '95 候选',
}

export function Council95CertificationView({ gate }: Council95CertificationViewProps) {
  const weakest = [...gate.checks].sort((a, b) => a.score - b.score).slice(0, 3)

  return (
    <section className="council-app__panel council-certification95" aria-label="95 真实认证闸门">
      <div className="council-app__panel-head">
        <div>
          <div className="council-app__section-kicker">95 真实认证闸门 · 用证据允许声称</div>
          <h2>{gate.label}</h2>
          <p>{gate.claimText}</p>
        </div>
        <div className="council-certification95__score" data-status={gate.status}>
          <strong>{gate.score}</strong>
          <span>{STATUS_LABEL[gate.status]}</span>
        </div>
      </div>

      <div className="council-certification95__claim" data-allowed={gate.claimAllowed}>
        <strong>{gate.claimAllowed ? '允许进入 95 候选' : '禁止声称已达 95'}</strong>
        <p>{gate.hardGatePassed ? '所有硬证据闸门已通过，仍要保留人工终审。' : '至少一个硬证据闸门未通过，系统必须诚实显示缺口。'}</p>
      </div>

      <div className="council-certification95__checks">
        {gate.checks.map((item) => (
          <article key={item.id} data-status={item.status} data-hard={item.hardGate}>
            <div>
              <span>{item.hardGate ? 'hard gate' : 'supporting'} · {item.status}</span>
              <h3>{item.label}</h3>
            </div>
            <strong>{item.score}</strong>
            <p>{item.proof}</p>
            {item.status !== 'pass' && <small>{item.requiredProof}</small>}
          </article>
        ))}
      </div>

      <div className="council-certification95__bottom">
        <article>
          <h3>最弱三项</h3>
          {weakest.map((item) => (
            <p key={item.id}>{item.label} · {item.score}</p>
          ))}
        </article>
        <article>
          <h3>下一步补证</h3>
          {(gate.nextProof.length ? gate.nextProof : ['等待真实运行后生成补证清单。']).slice(0, 5).map((item) => (
            <p key={item}>{item}</p>
          ))}
        </article>
        <article>
          <h3>证据链</h3>
          {gate.proofChain.slice(0, 7).map((item) => (
            <p key={item}>{item}</p>
          ))}
        </article>
      </div>
    </section>
  )
}
