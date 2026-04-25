import { ReactNode } from 'react'
import './SearchStatsBar.css'

interface Stat {
  label: string
  value: number | string
  color?: string
}

interface SearchStatsBarProps {
  searchValue: string
  onSearchChange: (value: string) => void
  placeholder?: string
  stats?: Stat[]
  actions?: ReactNode
}

export default function SearchStatsBar({
  searchValue,
  onSearchChange,
  placeholder = '搜索...',
  stats,
  actions,
}: SearchStatsBarProps) {
  return (
    <div className="hd-search-stats">
      <input
        className="hd-search-stats__input"
        type="text"
        value={searchValue}
        onChange={e => onSearchChange(e.target.value)}
        placeholder={placeholder}
      />
      {stats && stats.length > 0 && (
        <div className="hd-search-stats__stats">
          {stats.map((s, i) => (
            <span key={i} className="hd-search-stats__stat" style={s.color ? { color: s.color } : undefined}>
              {s.value} {s.label}
            </span>
          ))}
        </div>
      )}
      {actions && <div className="hd-search-stats__actions">{actions}</div>}
    </div>
  )
}
