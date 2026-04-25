import './WarningBanner.css'

interface WarningBannerProps {
  type: 'warning' | 'error' | 'success' | 'info'
  message: string
  dismissible?: boolean
  onDismiss?: () => void
  action?: { label: string; onClick: () => void }
}

const ICONS: Record<string, string> = {
  warning: '⚠',
  error: '✕',
  success: '✓',
  info: 'ℹ',
}

export default function WarningBanner({ type, message, dismissible, onDismiss, action }: WarningBannerProps) {
  return (
    <div className={`hd-banner hd-banner--${type} hd-fade-in`}>
      <span className="hd-banner__icon">{ICONS[type]}</span>
      <span className="hd-banner__message">{message}</span>
      {action && (
        <button className="hd-banner__action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      {dismissible && onDismiss && (
        <button className="hd-banner__dismiss" onClick={onDismiss}>×</button>
      )}
    </div>
  )
}
