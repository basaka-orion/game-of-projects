/**
 * AgentEditorModal — 自定义 Agent 创建/编辑模态框
 *
 * 从 TeamsTab 提取，负责：
 * - Agent 表单（名称/图标/角色/温度/颜色/Bot Token）
 * - 创建新 Agent
 * - 编辑现有 Agent
 */
import React, { useState, useEffect } from 'react'

const AGENT_EMOJIS = ['🤖', '🧠', '💡', '🔬', '🎯', '📊', '🎨', '⚡', '🔮', '🛡️', '🚀', '⚙️']
const AGENT_COLORS = ['#00d4aa', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#10b981', '#f97316']

interface AgentFormData {
  name: string
  icon: string
  role: string
  color: string
  temperature: number
  botToken: string
}

interface AgentEditorModalProps {
  /** 正在编辑的 agent ID（null = 创建模式） */
  editingId: string | null
  /** 初始数据（编辑模式时传入） */
  initialData?: Partial<AgentFormData>
  /** 保存回调 */
  onSave: (data: AgentFormData) => Promise<void>
  /** 关闭回调 */
  onClose: () => void
}

export default function AgentEditorModal({ editingId, initialData, onSave, onClose }: AgentEditorModalProps) {
  const [name, setName] = useState(initialData?.name || '')
  const [icon, setIcon] = useState(initialData?.icon || '🤖')
  const [role, setRole] = useState(initialData?.role || '')
  const [color, setColor] = useState(initialData?.color || '#00d4aa')
  const [temperature, setTemperature] = useState(initialData?.temperature ?? 0.6)
  const [botToken, setBotToken] = useState(initialData?.botToken || '')
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!name.trim() || !role.trim()) return
    setSaving(true)
    await onSave({ name, icon, role, color, temperature, botToken })
    setSaving(false)
  }

  return (
    <div className="teams-tab__modal-overlay" onClick={onClose}>
      <div className="teams-tab__modal" onClick={e => e.stopPropagation()}>
        <div className="teams-tab__modal-header">
          <h3 className="teams-tab__modal-title">
            {editingId ? '✏️ 编辑 Agent' : '🤖 创建自定义 Agent'}
          </h3>
          <button className="teams-tab__modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="teams-tab__modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hd-space-md)' }}>
          {/* 名称 */}
          <div className="teams-tab__form-group">
            <label className="teams-tab__form-label">Agent 名称</label>
            <input className="teams-tab__form-input" value={name} onChange={e => setName(e.target.value)}
              placeholder="如：产品经理、技术架构师"
            />
          </div>

          {/* 图标选择 */}
          <div className="teams-tab__form-group">
            <label className="teams-tab__form-label">图标</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {AGENT_EMOJIS.map(e => (
                <button key={e} onClick={() => setIcon(e)}
                  style={{
                    fontSize: '1.3rem', padding: '4px 8px', borderRadius: 'var(--hd-radius-sm)',
                    border: icon === e ? '2px solid var(--hd-accent-cyan)' : '1px solid var(--hd-border)',
                    background: icon === e ? 'rgba(0,212,170,0.1)' : 'transparent', cursor: 'pointer',
                  }}
                >{e}</button>
              ))}
            </div>
          </div>

          {/* 颜色选择 */}
          <div className="teams-tab__form-group">
            <label className="teams-tab__form-label">主题色</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {AGENT_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                    border: color === c ? '3px solid white' : '2px solid transparent',
                    boxShadow: color === c ? `0 0 0 2px ${c}` : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {/* 角色描述 */}
          <div className="teams-tab__form-group">
            <label className="teams-tab__form-label">角色描述 (System Prompt)</label>
            <textarea className="teams-tab__form-input" value={role} onChange={e => setRole(e.target.value)}
              placeholder="描述这个 Agent 的角色、专长和行为风格..."
              style={{ minHeight: 100, resize: 'vertical' }}
            />
          </div>

          {/* 温度 */}
          <div className="teams-tab__form-group">
            <label className="teams-tab__form-label">温度: {temperature.toFixed(1)}</label>
            <input type="range" min="0" max="2" step="0.1" value={temperature}
              onChange={e => setTemperature(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          {/* Bot Token */}
          <div className="teams-tab__form-group">
            <label className="teams-tab__form-label">Telegram Bot Token (可选)</label>
            <input className="teams-tab__form-input" value={botToken}
              onChange={e => setBotToken(e.target.value)}
              placeholder="123456789:ABCdef..."
              type="password"
            />
          </div>
        </div>

        <div className="teams-tab__modal-footer">
          <button className="teams-tab__action-btn" onClick={onClose}>取消</button>
          <button className="teams-tab__create-btn" disabled={!name.trim() || !role.trim() || saving}
            onClick={handleSubmit}
          >{saving ? '保存中...' : editingId ? '更新' : '创建'}</button>
        </div>
      </div>
    </div>
  )
}
