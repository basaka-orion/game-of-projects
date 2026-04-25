import './StatusBadge.css'

interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'warning' | 'error' | 'info'
  label?: string
  count?: string | number
}

export default function StatusBadge({ status, label, count }: StatusBadgeProps) {
  return (
    <span className={`hd-badge hd-badge--${status}`}>
      <span className="hd-badge__dot" />
      {label && <span className="hd-badge__label">{label}</span>}
      {count !== undefined && <span className="hd-badge__count">{count}</span>}
    </span>
  )
}
