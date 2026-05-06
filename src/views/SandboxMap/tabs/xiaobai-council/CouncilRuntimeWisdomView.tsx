import type { CouncilRuntimeWisdomContext } from '../../../../lib/xiaobai-council/runtime-wisdom'

interface CouncilRuntimeWisdomViewProps {
  wisdom: CouncilRuntimeWisdomContext
}

const SEVERITY_LABELS: Record<CouncilRuntimeWisdomContext['intelligenceSignals'][number]['severity'], string> = {
  low: '观察',
  medium: '警惕',
  high: '硬约束',
}

export function CouncilRuntimeWisdomView({ wisdom }: CouncilRuntimeWisdomViewProps) {
  return (
    <section className="council-app__panel council-runtime-wisdom" aria-label="运行智慧反馈">
      <div className="council-app__panel-head">
        <div>
          <div className="council-app__section-kicker">运行智慧反馈 · 自我进化约束</div>
          <h2>历史不是摆设，会进入下一轮匹配与博弈</h2>
          <p>{wisdom.summary}</p>
        </div>
        <strong>{Math.round(wisdom.confidence * 100)}%</strong>
      </div>

      <div className="council-runtime-wisdom__meta">
        <article>
          <span>历史样本</span>
          <strong>{wisdom.historyCount}</strong>
        </article>
        <article>
          <span>最近 run</span>
          <strong>{wisdom.lastRunId || 'baseline'}</strong>
        </article>
        <article>
          <span>智慧信号</span>
          <strong>{wisdom.intelligenceSignals.length}</strong>
        </article>
        <article>
          <span>下轮证据</span>
          <strong>{wisdom.requiredProof.length}</strong>
        </article>
      </div>

      <div className="council-runtime-wisdom__signals">
        {wisdom.intelligenceSignals.length ? (
          wisdom.intelligenceSignals.map((item) => (
            <article key={item.id} data-severity={item.severity}>
              <span>{SEVERITY_LABELS[item.severity]}</span>
              <h3>{item.label}</h3>
              <p>{item.evidence}</p>
            </article>
          ))
        ) : (
          <article data-severity="low">
            <span>稳定</span>
            <h3>最近没有硬性运行缺口</h3>
            <p>下一轮仍需继续留证，尤其是真实用户验证和导出复验。</p>
          </article>
        )}
      </div>

      <div className="council-runtime-wisdom__columns">
        <article>
          <h3>下一轮必须做到</h3>
          {wisdom.nextRunConstraints.map((item) => <p key={item}>{item}</p>)}
        </article>
        <article>
          <h3>不要重复</h3>
          {wisdom.avoidRepeating.length
            ? wisdom.avoidRepeating.map((item) => <p key={item}>{item}</p>)
            : <p>没有历史反模式；第一轮会作为基线沉淀。</p>}
        </article>
        <article>
          <h3>必须留下证据</h3>
          {wisdom.requiredProof.map((item) => <p key={item}>{item}</p>)}
        </article>
      </div>
    </section>
  )
}
