import { useState, ReactNode } from 'react'
import StatusBadge from './StatusBadge'
import './CollapsibleSection.css'

interface CollapsibleSectionProps {
  title: string
  defaultOpen?: boolean
  count?: string | number
  badge?: { status: 'active' | 'inactive' | 'warning' | 'error'; label?: string }
  children: ReactNode
}

export default function CollapsibleSection({
  title,
  defaultOpen = true,
  count,
  badge,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`hd-collapsible ${open ? 'hd-collapsible--open' : ''}`}>
      <div className="hd-collapsible__header" onClick={() => setOpen(!open)}>
        <span className="hd-collapsible__arrow">{open ? '▼' : '▶'}</span>
        <span className="hd-collapsible__title">{title}</span>
        {count !== undefined && <span className="hd-collapsible__count">{count}</span>}
        {badge && <StatusBadge status={badge.status} label={badge.label} />}
      </div>
      <div className="hd-collapsible__body">
        <div className="hd-collapsible__content">{children}</div>
      </div>
    </div>
  )
}
