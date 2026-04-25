import type { ReactNode } from 'react'
import './SystemStage.css'

type StageTone = 'default' | 'accent' | 'success' | 'warning' | 'danger'
type StageState = 'loading' | 'empty' | 'error' | 'ready'

interface StageMetric {
  label: string
  value: ReactNode
  detail?: ReactNode
  tone?: StageTone
}

interface StageAction {
  label: string
  onClick?: () => void
  href?: string
  variant?: 'primary' | 'ghost'
}

interface SystemStageShellProps {
  className?: string
  eyebrow?: string
  title: ReactNode
  description: ReactNode
  metrics?: StageMetric[]
  actions?: StageAction[]
  leftRail?: ReactNode
  centerRail?: ReactNode
  rightRail?: ReactNode
  footer?: ReactNode
}

interface SystemStagePanelProps {
  title: ReactNode
  eyebrow?: ReactNode
  description?: ReactNode
  tone?: StageTone
  focal?: boolean
  className?: string
  children?: ReactNode
}

interface SystemStageFlowItemProps {
  title: ReactNode
  value?: ReactNode
  description?: ReactNode
  meta?: ReactNode
  tone?: StageTone
  onClick?: () => void
  actionLabel?: string
}

interface SystemStageStateProps {
  state?: StageState
  title: ReactNode
  description?: ReactNode
  detail?: ReactNode
  tone?: StageTone
  compact?: boolean
  actionLabel?: string
  onAction?: () => void
}

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function toneClassName(tone: StageTone = 'default') {
  return tone === 'default' ? '' : `system-stage__tone--${tone}`
}

export function SystemStageShell({
  className,
  eyebrow,
  title,
  description,
  metrics = [],
  actions = [],
  leftRail,
  centerRail,
  rightRail,
  footer,
}: SystemStageShellProps) {
  return (
    <div className={joinClassNames('system-stage', className)}>
      {metrics.length > 0 && (
        <div className="system-stage__metrics">
          {metrics.map((metric) => (
            <div
              key={`${metric.label}-${String(metric.value)}`}
              className={joinClassNames('system-stage__metric', toneClassName(metric.tone))}
            >
              <span className="system-stage__metric-label">{metric.label}</span>
              <span className="system-stage__metric-value">{metric.value}</span>
              {metric.detail ? <span className="system-stage__metric-detail">{metric.detail}</span> : null}
            </div>
          ))}
        </div>
      )}

      <div className="system-stage__hero">
        <div className="system-stage__hero-copy">
          {eyebrow ? <div className="system-stage__eyebrow">{eyebrow}</div> : null}
          <h1 className="system-stage__title">{title}</h1>
          <div className="system-stage__description">{description}</div>
        </div>

        {actions.length > 0 && (
          <div className="system-stage__actions">
            {actions.map((action) => {
              if (action.href) {
                return (
                  <a
                    key={action.label}
                    href={action.href}
                    className={joinClassNames(
                      'system-stage__action',
                      action.variant === 'primary' && 'system-stage__action--primary',
                    )}
                  >
                    {action.label}
                  </a>
                )
              }

              return (
                <button
                  key={action.label}
                  type="button"
                  className={joinClassNames(
                    'system-stage__action',
                    action.variant === 'primary' && 'system-stage__action--primary',
                  )}
                  onClick={action.onClick}
                >
                  {action.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="system-stage__matrix">
        <div className="system-stage__rail">{leftRail}</div>
        <div className="system-stage__center">{centerRail}</div>
        <div className="system-stage__rail">{rightRail}</div>
      </div>

      {footer ? <div className="system-stage__footer">{footer}</div> : null}
    </div>
  )
}

export function SystemStagePanel({
  title,
  eyebrow,
  description,
  tone = 'default',
  focal = false,
  className,
  children,
}: SystemStagePanelProps) {
  return (
    <section
      className={joinClassNames(
        'system-stage__panel',
        toneClassName(tone),
        focal && 'system-stage__panel--focal',
        className,
      )}
    >
      <div className="system-stage__panel-header">
        {eyebrow ? <div className="system-stage__panel-eyebrow">{eyebrow}</div> : null}
        <div className="system-stage__panel-title">{title}</div>
        {description ? <div className="system-stage__panel-description">{description}</div> : null}
      </div>
      {children ? <div className="system-stage__panel-body">{children}</div> : null}
    </section>
  )
}

export function SystemStageState({
  state = 'empty',
  title,
  description,
  detail,
  tone = state === 'error' ? 'danger' : state === 'loading' ? 'accent' : 'default',
  compact = false,
  actionLabel,
  onAction,
}: SystemStageStateProps) {
  const role = state === 'error' ? 'alert' : 'status'

  return (
    <div
      className={joinClassNames(
        'system-stage__state',
        `system-stage__state--${state}`,
        toneClassName(tone),
        compact && 'system-stage__state--compact',
      )}
      role={role}
      aria-live={state === 'error' ? 'assertive' : 'polite'}
    >
      <span className="system-stage__state-orbit" aria-hidden="true" />
      <div className="system-stage__state-copy">
        <div className="system-stage__state-title">{title}</div>
        {description ? <div className="system-stage__state-description">{description}</div> : null}
        {detail ? <div className="system-stage__state-detail">{detail}</div> : null}
      </div>
      {actionLabel && onAction ? (
        <button type="button" className="system-stage__state-action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

export function SystemStageFlowItem({
  title,
  value,
  description,
  meta,
  tone = 'default',
  onClick,
  actionLabel,
}: SystemStageFlowItemProps) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={joinClassNames(
        'system-stage__flow-item',
        toneClassName(tone),
        onClick && 'system-stage__flow-item--interactive',
      )}
      onClick={onClick}
    >
      <div className="system-stage__flow-main">
        <div className="system-stage__flow-head">
          <span className="system-stage__flow-title">{title}</span>
          {value ? <span className="system-stage__flow-value">{value}</span> : null}
        </div>
        {description ? <div className="system-stage__flow-description">{description}</div> : null}
        {meta ? <div className="system-stage__flow-meta">{meta}</div> : null}
      </div>
      {actionLabel ? <span className="system-stage__flow-action">{actionLabel}</span> : null}
    </Tag>
  )
}
