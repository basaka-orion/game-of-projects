import type {
  CouncilAudienceMode,
  CouncilDeliveryModes,
  CouncilTraceSignal,
} from '../../../../lib/xiaobai-council/delivery-modes'

interface CouncilModeSwitchProps {
  mode: CouncilAudienceMode
  onModeChange: (mode: CouncilAudienceMode) => void
}

export function CouncilModeSwitch({ mode, onModeChange }: CouncilModeSwitchProps) {
  return (
    <div className="council-mode-switch" role="tablist" aria-label="智囊团结果呈现模式">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'boss-review'}
        className={mode === 'boss-review' ? 'council-mode-switch__item--active' : ''}
        onClick={() => onModeChange('boss-review')}
      >
        Boss 复盘
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'xiaobai-execute'}
        className={mode === 'xiaobai-execute' ? 'council-mode-switch__item--active' : ''}
        onClick={() => onModeChange('xiaobai-execute')}
      >
        小白执行
      </button>
    </div>
  )
}

interface CouncilDeliveryModePanelProps {
  deliveryModes: CouncilDeliveryModes
  mode: CouncilAudienceMode
  onModeChange: (mode: CouncilAudienceMode) => void
}

export function CouncilDeliveryModePanel({ deliveryModes, mode, onModeChange }: CouncilDeliveryModePanelProps) {
  return (
    <section className="council-app__panel council-delivery" aria-label="智囊团双模式结果层">
      <div className="council-app__panel-head">
        <div>
          <div className="council-app__section-kicker">双模式结果层</div>
          <h2>{mode === 'boss-review' ? deliveryModes.bossReview.headline : deliveryModes.xiaobaiExecute.headline}</h2>
          <p>
            {mode === 'boss-review'
              ? '完整剧场保留给 Boss 审计、复盘和调参；小白执行模式会隐藏角色争论，只给下一步。'
              : '同一份大师博弈被压缩成低负担执行卡，小白不用理解所有争论也能开始。'}
          </p>
        </div>
        <CouncilModeSwitch mode={mode} onModeChange={onModeChange} />
      </div>
      {mode === 'boss-review' ? <BossReviewCard deliveryModes={deliveryModes} /> : <XiaobaiActionCard deliveryModes={deliveryModes} />}
    </section>
  )
}

function BossReviewCard({ deliveryModes }: { deliveryModes: CouncilDeliveryModes }) {
  return (
    <div className="council-delivery__boss">
      <article className="council-delivery__thesis">
        <span>关键产品张力</span>
        <p>{deliveryModes.bossReview.criticalTension}</p>
      </article>
      <TraceSignals signals={deliveryModes.bossReview.traceSignals} />
      <p className="council-delivery__summary">{deliveryModes.bossReview.summary}</p>
    </div>
  )
}

function XiaobaiActionCard({ deliveryModes }: { deliveryModes: CouncilDeliveryModes }) {
  const brief = deliveryModes.xiaobaiExecute
  return (
    <div className="council-delivery__xiaobai">
      <article className="council-delivery__promise">
        <span>系统承诺</span>
        <p>{brief.promise}</p>
      </article>
      <article className="council-delivery__first-action">
        <span>现在只做这一件事</span>
        <h3>{brief.firstAction}</h3>
      </article>
      <div className="council-delivery__steps">
        {brief.nextSteps.map((step, index) => (
          <article key={`${step}-${index}`}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <p>{step}</p>
          </article>
        ))}
      </div>
      <div className="council-delivery__split">
        <article>
          <h3>系统替小白隐藏了什么</h3>
          {brief.whatSystemHides.map((item) => <p key={item}>{item}</p>)}
        </article>
        <article>
          <h3>本轮明确不做</h3>
          {brief.doNotDo.length ? brief.doNotDo.map((item) => <p key={item}>{item}</p>) : <p>没有抽取到明确否决项。</p>}
        </article>
      </div>
      <TraceSignals signals={brief.trustSignals} />
      <div className="council-delivery__traceback">
        <strong>可回溯底层</strong>
        <span>
          {brief.traceBack.scenes} 幕 · {brief.traceBack.relations} 条关系 · 保留 {brief.traceBack.kept} / 裁掉 {brief.traceBack.cut} / 修正 {brief.traceBack.revised}
        </span>
      </div>
    </div>
  )
}

function TraceSignals({ signals }: { signals: CouncilTraceSignal[] }) {
  return (
    <div className="council-delivery__signals">
      {signals.map((signal) => (
        <article key={signal.label}>
          <span>{signal.label}</span>
          <strong>{signal.value}</strong>
          <p>{signal.detail}</p>
        </article>
      ))}
    </div>
  )
}
