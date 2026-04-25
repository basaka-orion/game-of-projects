/**
 * TelegramSection — Telegram Bot 管理子组件
 * 从 ControlPanelTab 中拆分，负责全局 Bot、自定义 Agent Bot 和默认角色 Bot 管理
 */
import { useState, useCallback } from 'react'
import StatusBadge from '../../../../components/StatusBadge'
import CollapsibleSection from '../../../../components/CollapsibleSection'
import { AgentDefinition, saveBuiltInAgentIMConfig } from '../../../../lib/agents/registry'
import { setSetting } from '../../../../lib/db/store'

interface ExpertEntry {
  role: string
  name: string
  emoji: string
}

interface TelegramSectionProps {
  customAgents: AgentDefinition[]
  builtInExperts: ExpertEntry[]
  builtInBotTokens: Record<string, string>
  onBuiltInTokenChange: (role: string, token: string) => void
  tgBotToken: string
  tgStatus: 'disconnected' | 'connected'
  tgConnecting: boolean
  botStatusList: Array<{ agentId: string; name: string; running: boolean }>
  onTokenChange: (token: string) => void
  onToggleConnection: () => void
  onRefreshStatus: () => void
}

export default function TelegramSection({
  customAgents,
  builtInExperts,
  builtInBotTokens,
  onBuiltInTokenChange,
  tgBotToken,
  tgStatus,
  tgConnecting,
  botStatusList,
  onTokenChange,
  onToggleConnection,
  onRefreshStatus,
}: TelegramSectionProps) {
  const [verifyingBot, setVerifyingBot] = useState<string | null>(null)
  const [botVerifyResults, setBotVerifyResults] = useState<Record<string, { ok: boolean; msg: string }>>({})

  const agentsWithBots = customAgents.filter(a => a.botToken)

  const handleVerifyToken = useCallback(async (key: string, token: string) => {
    setVerifyingBot(key)
    setBotVerifyResults(prev => { const n = { ...prev }; delete n[key]; return n })
    try {
      const electronAPI = (window as any)?.electronAPI
      const result = await electronAPI?.telegramAgentVerify?.(token) as { ok: boolean; botName?: string; error?: string }
      setBotVerifyResults(prev => ({
        ...prev,
        [key]: result?.ok
          ? { ok: true, msg: `验证成功: @${result.botName}` }
          : { ok: false, msg: result?.error || '验证失败' },
      }))
    } catch (err) {
      setBotVerifyResults(prev => ({
        ...prev,
        [key]: { ok: false, msg: String(err) },
      }))
    }
    setVerifyingBot(null)
  }, [])

  const handleToggleAgentBot = useCallback(async (agentId: string, token: string, name: string, isOnline: boolean) => {
    const electronAPI = (window as any)?.electronAPI
    if (isOnline) {
      await electronAPI?.telegramAgentStop?.(agentId)
    } else {
      await electronAPI?.telegramAgentStart?.(agentId, token, name)
    }
    onRefreshStatus()
  }, [onRefreshStatus])

  return (
    <CollapsibleSection title="IM 渠道 — Telegram" defaultOpen={true} count={1 + agentsWithBots.length + builtInExperts.length}>
      <div className="cp__channels">
        {/* 全局 Bot */}
        <div className="cp__channel-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="cp__channel-icon">✈️</span>
              <span className="cp__channel-name">全局 BOT</span>
              <StatusBadge
                status={tgStatus === 'connected' ? 'active' : 'inactive'}
                label={tgStatus === 'connected' ? '已连接' : '未连接'}
              />
            </div>
            <button
              className="cp__btn"
              disabled={tgConnecting || !tgBotToken.trim()}
              onClick={onToggleConnection}
            >
              {tgConnecting ? '⏳' : tgStatus === 'connected' ? '断开' : '连接'}
            </button>
          </div>
          <input
            className="cp__input"
            type="password"
            placeholder="全局 Bot Token (从 @BotFather 获取)"
            value={tgBotToken}
            onChange={e => onTokenChange(e.target.value)}
            onBlur={() => setSetting('telegram_bot_token', tgBotToken)}
          />
          <div style={{ fontSize: '0.7rem', color: 'var(--hd-text-muted)' }}>
            命令: /ask 关键词 → 知识库 | /search → 网络搜索 | /status → 系统状态 | 其他 → AI 对话
          </div>
        </div>

        {/* 自定义 Agent Bot 管理 */}
        {agentsWithBots.length > 0 && (
          <div style={{ marginTop: 'var(--hd-space-md)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--hd-text-secondary)', marginBottom: 'var(--hd-space-sm)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🤖</span> 自定义 Agent Bot 管理
            </div>
            {agentsWithBots.map(agent => {
              const botStatus = botStatusList.find(b => b.agentId === agent.id)
              const isOnline = botStatus?.running || false
              const isVerifying = verifyingBot === agent.id
              const verifyResult = botVerifyResults[agent.id]
              return (
                <div key={agent.id} className="cp__channel-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.1rem' }}>{agent.icon}</span>
                      <span style={{ fontWeight: 600, color: agent.color }}>{agent.name}</span>
                      <StatusBadge
                        status={isOnline ? 'active' : 'inactive'}
                        label={isOnline ? '在线' : '离线'}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="cp__btn"
                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        disabled={isVerifying}
                        onClick={() => handleVerifyToken(agent.id, agent.botToken!)}
                      >
                        {isVerifying ? '⏳' : '🔍 验证'}
                      </button>
                      <button
                        className="cp__btn"
                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        onClick={() => handleToggleAgentBot(agent.id, agent.botToken!, agent.name, isOnline)}
                      >
                        {isOnline ? '断开' : '连接'}
                      </button>
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--hd-font-mono)', fontSize: '0.7rem', color: 'var(--hd-text-muted)' }}>
                    {agent.botToken!.slice(0, 8)}...{agent.botToken!.slice(-4)}
                  </div>
                  {verifyResult && (
                    <div style={{
                      fontSize: '0.75rem',
                      color: verifyResult.ok ? 'var(--hd-success)' : 'var(--hd-error)',
                      fontWeight: 600,
                    }}>
                      {verifyResult.ok ? '✓' : '✕'} {verifyResult.msg}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {agentsWithBots.length === 0 && (
          <div style={{ fontSize: '0.75rem', color: 'var(--hd-text-muted)', marginTop: 'var(--hd-space-sm)' }}>
            提示: 在「群策 → 我的 Agent」中为 Agent 配置 Bot Token 后，可在此管理
          </div>
        )}

        {/* ═══ 默认角色 IM 渠道配置 ═══ */}
        <div style={{ marginTop: 'var(--hd-space-md)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--hd-text-secondary)', marginBottom: 'var(--hd-space-sm)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>◈</span> 默认角色 IM 渠道
          </div>
          {builtInExperts.map(expert => {
            const token = builtInBotTokens[expert.role] || ''
            const hasToken = token.trim().length > 0
            const verifyKey = `builtin_${expert.role}`
            const botStatus = botStatusList.find(b => b.agentId === expert.role)
            const isOnline = botStatus?.running || false
            const isVerifying = verifyingBot === verifyKey
            const verifyResult = botVerifyResults[verifyKey]
            return (
              <div key={expert.role} className="cp__channel-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.1rem' }}>{expert.emoji}</span>
                    <span style={{ fontWeight: 600, color: '#00d4aa' }}>{expert.name}</span>
                    {hasToken && (
                      <StatusBadge
                        status={isOnline ? 'active' : 'inactive'}
                        label={isOnline ? '在线' : '离线'}
                      />
                    )}
                  </div>
                  {hasToken && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="cp__btn"
                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        disabled={isVerifying}
                        onClick={() => handleVerifyToken(verifyKey, token)}
                      >
                        {isVerifying ? '⏳' : '🔍 验证'}
                      </button>
                      <button
                        className="cp__btn"
                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        onClick={() => handleToggleAgentBot(expert.role, token, expert.name, isOnline)}
                      >
                        {isOnline ? '断开' : '连接'}
                      </button>
                    </div>
                  )}
                </div>
                <input
                  className="cp__input"
                  type="password"
                  placeholder={`可选 — 为 ${expert.name} 绑定独立 Bot Token`}
                  value={token}
                  onChange={e => onBuiltInTokenChange(expert.role, e.target.value)}
                  onBlur={() => saveBuiltInAgentIMConfig(expert.role, token)}
                />
                {hasToken && (
                  <div style={{ fontFamily: 'var(--hd-font-mono)', fontSize: '0.7rem', color: 'var(--hd-text-muted)' }}>
                    {token.slice(0, 8)}...{token.slice(-4)}
                  </div>
                )}
                {verifyResult && (
                  <div style={{
                    fontSize: '0.75rem',
                    color: verifyResult.ok ? 'var(--hd-success)' : 'var(--hd-error)',
                    fontWeight: 600,
                  }}>
                    {verifyResult.ok ? '✓' : '✕'} {verifyResult.msg}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </CollapsibleSection>
  )
}
