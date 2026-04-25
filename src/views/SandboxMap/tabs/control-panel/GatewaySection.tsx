/**
 * GatewaySection — 网关状态面板子组件
 * 从 ControlPanelTab 中拆分出来，负责网关状态显示和操作
 */
import { useCallback } from 'react'
import StatusBadge from '../../../../components/StatusBadge'
import CollapsibleSection from '../../../../components/CollapsibleSection'
import { MCPServer, MCPServerStatus, saveMCPServers } from '../../../../lib/mcp/registry'

interface GatewaySectionProps {
  provider: string
  providerName: string
  model: string
  engineStatus: 'checking' | 'online' | 'offline' | 'error'
  gatewayStatus: 'stopped' | 'starting' | 'running' | 'error'
  totalCapabilities: number
  mcpOnline: number
  mcpTotal: number
  onStartGateway: () => void
  onForceRestart: () => void
  onSelfRepair: () => void
  onRepairPlugins: () => void
  onStopAndExit: () => void
}

const GATEWAY_STATUS_MAP = {
  stopped: { status: 'error' as const, label: '已停止' },
  starting: { status: 'warning' as const, label: '启动中...' },
  running: { status: 'active' as const, label: '运行中' },
  error: { status: 'error' as const, label: '异常' },
}

export default function GatewaySection({
  provider,
  providerName,
  model,
  engineStatus,
  gatewayStatus,
  totalCapabilities,
  mcpOnline,
  mcpTotal,
  onStartGateway,
  onForceRestart,
  onSelfRepair,
  onRepairPlugins,
  onStopAndExit,
}: GatewaySectionProps) {
  const gw = GATEWAY_STATUS_MAP[gatewayStatus]

  return (
    <CollapsibleSection title="网关状态" defaultOpen={true} badge={{ status: gw.status, label: gw.label }}>
      <div className="cp__gateway-status">
        <div className="cp__gateway-header">
          <StatusBadge
            status={gatewayStatus === 'running' ? 'active' : gatewayStatus === 'starting' ? 'warning' : 'error'}
            label={gatewayStatus === 'running' ? '在线' : gatewayStatus === 'starting' ? '启动中...' : '已停止'}
          />
          <span className="cp__gateway-model">
            {model || '未设置'} · via {providerName || provider}
          </span>
        </div>
        <div className="cp__gateway-btns">
          <button className="cp__g-btn" onClick={onStartGateway} disabled={gatewayStatus === 'starting'}>
            启动网关
          </button>
          <button className="cp__g-btn" onClick={onForceRestart} disabled={gatewayStatus === 'starting'}>
            强制重启
          </button>
          <button className="cp__g-btn cp__g-btn--success" onClick={onSelfRepair}>
            自检修复
          </button>
          <button className="cp__g-btn" onClick={onRepairPlugins}>
            修复插件环境
          </button>
          {gatewayStatus === 'running' && (
            <button className="cp__g-btn cp__g-btn--danger" onClick={onStopAndExit}>
              停止网关
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 'var(--hd-space-lg)', flexWrap: 'wrap', paddingTop: 'var(--hd-space-xs)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="cp__label">引擎</span>
            <StatusBadge
              status={engineStatus === 'online' ? 'active' : engineStatus === 'checking' ? 'warning' : 'error'}
              label={engineStatus === 'online' ? '在线' : engineStatus === 'checking' ? '检测中...' : '离线'}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="cp__label">能力</span>
            <span style={{ fontFamily: 'var(--hd-font-display)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--hd-accent-cyan)' }}>
              {totalCapabilities}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="cp__label">MCP</span>
            <span style={{ fontFamily: 'var(--hd-font-mono)', fontSize: '0.7rem', color: 'var(--hd-text-muted)' }}>
              {mcpOnline}/{mcpTotal} 在线
            </span>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  )
}
