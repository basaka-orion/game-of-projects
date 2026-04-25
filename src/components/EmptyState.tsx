import './EmptyState.css'

interface EmptyStateProps {
  icon: string
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export default function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="hd-empty hd-fade-in">
      <div className="hd-empty__icon">{icon}</div>
      <div className="hd-empty__title">{title}</div>
      {description && <div className="hd-empty__desc">{description}</div>}
      {actionLabel && onAction && (
        <button className="hd-empty__action" onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  )
}
