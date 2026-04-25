import { ReactNode } from 'react'
import './TerminalBlock.css'

interface TerminalBlockProps {
  title?: string
  children: ReactNode
  className?: string
}

/** macOS 终端模拟器 — 红黄绿三点 + 等宽字体 */
export default function TerminalBlock({ title = 'TERMINAL', children, className = '' }: TerminalBlockProps) {
  return (
    <div className={`terminal-block ${className}`}>
      <div className="terminal-block__bar">
        <div className="terminal-block__dots">
          <span className="terminal-block__dot terminal-block__dot--red" />
          <span className="terminal-block__dot terminal-block__dot--yellow" />
          <span className="terminal-block__dot terminal-block__dot--green" />
        </div>
        <span className="terminal-block__title">{title}</span>
      </div>
      <div className="terminal-block__content">
        {children}
      </div>
    </div>
  )
}
