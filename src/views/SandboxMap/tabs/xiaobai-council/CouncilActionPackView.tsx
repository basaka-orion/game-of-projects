import type { CouncilActionTaskArea, CouncilLaunchReadinessPack } from '../../../../lib/xiaobai-council/action-pack'

const AREA_HINTS: Record<CouncilActionTaskArea, string> = {
  product: '定义',
  design: '体验',
  engineering: '工程',
  test: '验收',
  validation: '验证',
}

interface CouncilActionPackViewProps {
  actionPack: CouncilLaunchReadinessPack
}

export function CouncilActionPackView({ actionPack }: CouncilActionPackViewProps) {
  return (
    <section className="council-app__panel council-action-pack" aria-label="90 分行动面板">
      <div className="council-app__panel-head">
        <div>
          <div className="council-app__section-kicker">90 分行动面板 · 可直接开工</div>
          <h2>{actionPack.scoreLabel}</h2>
          <p>{actionPack.oneScreenBrief}</p>
        </div>
        <strong className="council-action-pack__score">{actionPack.score}</strong>
      </div>

      <div className="council-action-pack__hero">
        <article>
          <span>当前只做</span>
          <h3>{actionPack.nowAction}</h3>
        </article>
        <article>
          <span>主按钮</span>
          <h3>{actionPack.primaryCta}</h3>
        </article>
        <article>
          <span>成功指标</span>
          <p>{actionPack.successMetric}</p>
        </article>
      </div>

      <div className="council-action-pack__milestones">
        {actionPack.milestones.map((milestone) => (
          <article key={milestone.label}>
            <span>{milestone.timeframe}</span>
            <h3>{milestone.label}</h3>
            <p>{milestone.outcome}</p>
          </article>
        ))}
      </div>

      <div className="council-action-pack__lanes">
        {actionPack.taskGroups.map((group) => (
          <article key={group.area} className="council-action-pack__lane">
            <div>
              <span>{AREA_HINTS[group.area]}</span>
              <h3>{group.label}</h3>
              <p>{group.intent}</p>
            </div>
            {group.tasks.map((task) => (
              <section key={task.id} className="council-action-pack__task" data-priority={task.priority}>
                <span>{task.priority} · {task.ownerHint}</span>
                <strong>{task.title}</strong>
                <p>{task.acceptance}</p>
                <small>{task.source}</small>
              </section>
            ))}
          </article>
        ))}
      </div>

      <div className="council-action-pack__bottom">
        <article>
          <h3>风险控制</h3>
          {actionPack.riskControls.slice(0, 6).map((item) => <p key={item}>{item}</p>)}
        </article>
        <article>
          <h3>导出必须包含</h3>
          {actionPack.exportChecklist.slice(0, 6).map((item) => <p key={item}>{item}</p>)}
        </article>
        <article>
          <h3>来源追踪</h3>
          {actionPack.sourceTrace.map((item) => <p key={item}>{item}</p>)}
        </article>
      </div>
    </section>
  )
}
