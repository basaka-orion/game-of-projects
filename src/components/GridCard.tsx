import { ReactNode } from 'react'
import './GridCard.css'

interface GridCardProps {
  title?: string
  children: ReactNode
  className?: string
  accent?: boolean
}

/** 1px 边框 Brutalist 卡片 — Hermes Agent 风格 */
export default function GridCard({ title, children, className = '', accent }: GridCardProps) {
  return (
    <div className={`grid-card ${accent ? 'grid-card--accent' : ''} ${className}`}>
      {title && (
        <div className="grid-card__header">
          <span className="hd-label">{title}</span>
        </div>
      )}
      <div className="grid-card__body">{children}</div>
    </div>
  )
}
