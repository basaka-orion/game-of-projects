import { useState, useEffect } from 'react'
import { loadGameState, GameState } from '../../lib/game/progression'
import './StatusBar.css'

interface StatusBarProps {
  state: 'idle' | 'ingesting' | 'analyzing' | 'reporting'
  onXpGained?: number
}

const STATE_MAP = {
  idle: { text: '待命中', color: 'var(--hd-text-muted)' },
  ingesting: { text: '正在吞噬', color: 'var(--hd-warning)' },
  analyzing: { text: '推演中', color: 'var(--hd-accent-cyan)' },
  reporting: { text: '报告就绪', color: 'var(--hd-success)' },
}

export default function StatusBar({ state, onXpGained }: StatusBarProps) {
  const [gameState, setGameState] = useState<GameState | null>(null)

  useEffect(() => {
    loadGameState().then(setGameState)
  }, [state, onXpGained])

  const info = STATE_MAP[state]
  const xpPercent = gameState ? Math.round((gameState.xp / gameState.xpToNext) * 100) : 0

  return (
    <div className="status-bar">
      <div className="status-bar__indicator" style={{ background: info.color }} />
      <span className="status-bar__text">{info.text}</span>
      {gameState && (
        <div className="status-bar__xp">
          <span className="status-bar__level">Lv.{gameState.level}</span>
          <span className="status-bar__title">{gameState.title}</span>
          <div className="status-bar__xp-bar">
            <div className="status-bar__xp-fill" style={{ width: `${xpPercent}%` }} />
          </div>
          <span className="status-bar__xp-text">{gameState.xp}/{gameState.xpToNext}</span>
        </div>
      )}
      <span className="status-bar__version">v0.2.0</span>
    </div>
  )
}
