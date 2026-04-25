import './SidebarNav.css'

export interface SidebarItem {
  id: string
  icon: string
  label: string
  badge?: string | number
}

interface SidebarNavProps {
  items: SidebarItem[]
  activeId: string
  onSelect: (id: string) => void
}

export default function SidebarNav({ items, activeId, onSelect }: SidebarNavProps) {
  return (
    <nav className="hd-sidebar">
      {items.map(item => (
        <div
          key={item.id}
          className={`hd-sidebar__item ${activeId === item.id ? 'hd-sidebar__item--active' : ''}`}
          onClick={() => onSelect(item.id)}
        >
          <span className="hd-sidebar__icon">{item.icon}</span>
          <span className="hd-sidebar__label">{item.label}</span>
          {item.badge !== undefined && item.badge !== '' && item.badge !== 0 && (
            <span className="hd-sidebar__badge">{item.badge}</span>
          )}
        </div>
      ))}
    </nav>
  )
}
