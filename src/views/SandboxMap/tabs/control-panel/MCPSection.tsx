/**
 * MCPSection — MCP 服务器管理面板子组件
 * 从 ControlPanelTab 中拆分，负责 MCP 服务器的管理、启停和配置
 */
import { useState } from 'react'
import StatusBadge from '../../../../components/StatusBadge'
import CollapsibleSection from '../../../../components/CollapsibleSection'
import { MCPServer, MCPServerStatus, saveMCPServers } from '../../../../lib/mcp/registry'

/** 内置 MCP ID 列表，不可被移除 */
const BUILTIN_MCP_IDS = [
  'mcp-fetch', 'mcp-filesystem', 'mcp-sqlite', 'mcp-memory',
  'mcp-brave-search', 'mcp-sequential-thinking',
  'mcp-context7', 'mcp-markitdown', 'mcp-exa', 'mcp-playwright',
]

interface MCPSectionProps {
  mcpServers: MCPServer[]
  mcpOnline: number
  mcpTotal: number
  mcpTotalTools: number
  onMCPStart: (server: MCPServer) => void
  onMCPStop: (server: MCPServer) => void
  onAddServer: (server: MCPServer) => void
  onRemoveServer: (id: string) => void
  onUpdateEnv: (serverId: string, key: string, value: string) => void
}

export default function MCPSection({
  mcpServers,
  mcpOnline,
  mcpTotal,
  mcpTotalTools,
  onMCPStart,
  onMCPStop,
  onAddServer,
  onRemoveServer,
  onUpdateEnv,
}: MCPSectionProps) {
  const [showAddMcp, setShowAddMcp] = useState(false)
  const [newMcp, setNewMcp] = useState({ name: '', command: 'npx', args: '', env: '', description: '' })

  const handleAdd = () => {
    if (!newMcp.name.trim()) return
    const server: MCPServer = {
      id: 'mcp_custom_' + Date.now().toString(36),
      name: newMcp.name.trim(),
      description: newMcp.description.trim(),
      command: newMcp.command || 'npx',
      args: newMcp.args ? newMcp.args.split(' ') : [],
      env: {},
      status: 'not-installed',
      tools: 0,
      category: '自定义',
      icon: '🔌',
      installHint: newMcp.command + ' ' + newMcp.args,
    }
    onAddServer(server)
    setNewMcp({ name: '', command: 'npx', args: '', env: '', description: '' })
    setShowAddMcp(false)
  }

  return (
    <CollapsibleSection title={`MCP 服务器 — ${mcpOnline}/${mcpTotal} 在线 · ${mcpTotalTools} 工具可用`} defaultOpen={false}>
      <div className="cp__mcp">
        <div className="cp__mcp-list">
          {mcpServers.map(server => (
            <div key={server.id} className={`cp__mcp-card ${server.recommended ? 'cp__mcp-card--recommended' : ''}`}>
              <div className="cp__mcp-header">
                <div className="cp__mcp-title">
                  <span className="cp__mcp-icon">{server.icon}</span>
                  <span className="cp__mcp-name">{server.name}</span>
                  {server.recommended && <span className="cp__mcp-recommend">推荐</span>}
                </div>
                <StatusBadge
                  status={server.status === 'online' ? 'active' : server.status === 'pending' ? 'warning' : server.status === 'error' ? 'error' : 'inactive'}
                  label={server.status === 'online' ? '在线' : server.status === 'pending' ? '启动中' : server.status === 'error' ? '错误' : server.status === 'not-installed' ? '未安装' : '离线'}
                />
              </div>
              <div className="cp__mcp-desc">{server.description}</div>
              <div className="cp__mcp-meta">
                <span className="cp__mcp-category">{server.category}</span>
                <span className="cp__mcp-tools-count">{server.tools} 工具</span>
                <span className="cp__mcp-command">{server.command} {server.args.join(' ')}</span>
              </div>
              <div className="cp__mcp-install-hint">{server.installHint}</div>
              {Object.keys(server.env).length > 0 && (
                <div className="cp__mcp-env">
                  {Object.entries(server.env).map(([key, val]) => (
                    <div key={key} className="cp__mcp-env-field">
                      <label className="cp__label">{key}</label>
                      <input
                        className="cp__input"
                        type="password"
                        value={val}
                        placeholder={`输入 ${key}...`}
                        onChange={e => onUpdateEnv(server.id, key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="cp__mcp-actions">
                {server.status !== 'online' ? (
                  <button className="cp__action-btn" onClick={() => onMCPStart(server)} disabled={server.status === 'pending'}>
                    {server.status === 'pending' ? '启动中...' : '启动'}
                  </button>
                ) : (
                  <button className="cp__action-btn" onClick={() => onMCPStop(server)}>
                    停止
                  </button>
                )}
                {!BUILTIN_MCP_IDS.includes(server.id) && (
                  <button className="cp__action-btn cp__action-btn--danger" onClick={() => onRemoveServer(server.id)}>
                    移除
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {showAddMcp ? (
          <div className="cp__mcp-add">
            <div className="cp__field">
              <label className="cp__label">名称</label>
              <input className="cp__input" value={newMcp.name}
                onChange={e => setNewMcp(p => ({ ...p, name: e.target.value }))}
                placeholder="My Custom MCP" />
            </div>
            <div className="cp__field">
              <label className="cp__label">命令</label>
              <input className="cp__input" value={newMcp.command}
                onChange={e => setNewMcp(p => ({ ...p, command: e.target.value }))}
                placeholder="npx" />
            </div>
            <div className="cp__field">
              <label className="cp__label">参数</label>
              <input className="cp__input" value={newMcp.args}
                onChange={e => setNewMcp(p => ({ ...p, args: e.target.value }))}
                placeholder="-y @anthropic/mcp-server-fetch" />
            </div>
            <div className="cp__field">
              <label className="cp__label">描述</label>
              <input className="cp__input" value={newMcp.description}
                onChange={e => setNewMcp(p => ({ ...p, description: e.target.value }))}
                placeholder="该服务器提供的功能..." />
            </div>
            <div className="cp__mcp-add-actions">
              <button className="cp__save-btn" onClick={handleAdd}>添加</button>
              <button className="cp__action-btn" onClick={() => setShowAddMcp(false)}>取消</button>
            </div>
          </div>
        ) : (
          <button className="cp__add-mcp-btn" onClick={() => setShowAddMcp(true)}>
            + 添加自定义 MCP 服务器
          </button>
        )}
      </div>
    </CollapsibleSection>
  )
}
