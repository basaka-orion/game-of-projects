/**
 * Settings — 设置面板
 */
import { useState, useEffect, useCallback } from 'react'
import { getSetting, setSetting } from '../../lib/db/store'
import { dbGetSetting, dbSetSetting } from '../../lib/db/repository'
import { getDefaultConfig, LLMConfig } from '../../lib/ai/provider'
import GridCard from '../../components/GridCard'
import StatusBadge from '../../components/StatusBadge'
import WarningBanner from '../../components/WarningBanner'
import './Settings.css'

type SettingsTab = 'ai' | 'boss' | 'data' | 'about'

const PROVIDERS = [
  { id: 'deepseek', name: 'DeepSeek', defaultModel: 'deepseek-chat' },
  { id: 'minimax', name: 'MiniMax', defaultModel: 'minimax-M2.7' },
  { id: 'glm', name: 'GLM', defaultModel: 'glm-5.1' },
  { id: 'ollama', name: 'Ollama', defaultModel: 'llama3' },
  { id: 'custom', name: '自定义', defaultModel: '' },
]

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai')
  const [provider, setProvider] = useState(getSetting('llm_provider', 'deepseek'))
  const [apiKey, setApiKey] = useState(getSetting('llm_api_key', ''))
  const [baseUrl, setBaseUrl] = useState(getSetting('llm_base_url', ''))
  const [model, setModel] = useState(getSetting('llm_model', ''))
  const [bossName, setBossName] = useState(getSetting('boss_name', ''))
  const [bossInterests, setBossInterests] = useState(getSetting('boss_interests', ''))
  const [bossHates, setBossHates] = useState(getSetting('boss_hates', ''))
  const [saved, setSaved] = useState(false)

  const saveAI = useCallback(() => {
    setSetting('llm_provider', provider)
    setSetting('llm_api_key', apiKey)
    setSetting('llm_base_url', baseUrl)
    setSetting('llm_model', model)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [provider, apiKey, baseUrl, model])

  const saveBoss = useCallback(() => {
    setSetting('boss_name', bossName)
    setSetting('boss_interests', bossInterests)
    setSetting('boss_hates', bossHates)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [bossName, bossInterests, bossHates])

  const handleProviderChange = (id: string) => {
    setProvider(id)
    const defaults = getDefaultConfig(id)
    setBaseUrl(getSetting('llm_base_url', defaults.baseUrl))
    setModel(getSetting('llm_model', defaults.model))
  }

  const handleExport = async () => {
    try {
      await window.electronAPI?.dbRun('SELECT 1', []) // 测试 DB 连接
      const result = await window.electronAPI?.dbQuery('SELECT * FROM projects', [])
      const blob = new Blob([JSON.stringify({ projects: result, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `game-of-projects-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Fallback: 从 localStorage 导出
      const data: Record<string, string> = {}
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith('gop_')) data[key] = localStorage.getItem(key) || ''
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `game-of-projects-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const handleClearData = () => {
    if (!confirm('确定要清除所有本地数据吗？此操作不可撤销。')) return
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('gop_')) keysToRemove.push(key)
    }
    keysToRemove.forEach(k => localStorage.removeItem(k))
    window.location.reload()
  }

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'ai', label: 'AI 配置' },
    { id: 'boss', label: 'Boss Profile' },
    { id: 'data', label: '数据管理' },
    { id: 'about', label: '关于' },
  ]

  return (
    <div className="settings">
      <div className="settings__nav hd-nav">
        <div className="hd-nav__item">
          <span style={{ fontFamily: 'var(--hd-font-display)', fontSize: '1rem', fontWeight: 700 }}>
            ⚙️ 设置
          </span>
        </div>
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`hd-nav__item hd-nav__item--clickable ${activeTab === tab.id ? 'hd-nav__item--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </div>
        ))}
        <div className="hd-nav__item hd-nav__item--clickable" onClick={() => window.history.back()}>
          ← 返回
        </div>
      </div>

      <div className="settings__content">
        {saved && (
          <div className="settings__saved hd-fade-in">✓ 已保存</div>
        )}

        {/* AI 配置 */}
        {activeTab === 'ai' && (
          <div className="settings__section">
            {!apiKey && provider !== 'ollama' && (
              <WarningBanner
                type="warning"
                message="API Key 未配置 — AI 功能不可用"
              />
            )}
            <GridCard title="AI Provider">
              <div className="settings__field">
                <label className="settings__label">提供商</label>
                <div className="settings__provider-grid">
                  {PROVIDERS.map(p => (
                    <button
                      key={p.id}
                      className={`settings__provider-btn ${provider === p.id ? 'settings__provider-btn--active' : ''}`}
                      onClick={() => handleProviderChange(p.id)}
                    >
                      {p.name}
                      {provider === p.id && (
                        <StatusBadge status="active" label="已生效" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings__field">
                <label className="settings__label">API Key</label>
                <input
                  className="settings__input"
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-..."
                />
              </div>
              <div className="settings__field">
                <label className="settings__label">Base URL</label>
                <input
                  className="settings__input"
                  value={baseUrl}
                  onChange={e => setBaseUrl(e.target.value)}
                  placeholder="https://api.deepseek.com"
                />
              </div>
              <div className="settings__field">
                <label className="settings__label">Model</label>
                <input
                  className="settings__input"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  placeholder="deepseek-chat"
                />
              </div>
              <button className="settings__save-btn" onClick={saveAI}>保存</button>
            </GridCard>
          </div>
        )}

        {/* Boss Profile */}
        {activeTab === 'boss' && (
          <div className="settings__section">
            <GridCard title="Boss Profile">
              <div className="settings__field">
                <label className="settings__label">名字</label>
                <input
                  className="settings__input"
                  value={bossName}
                  onChange={e => setBossName(e.target.value)}
                  placeholder="你的名字"
                />
              </div>
              <div className="settings__field">
                <label className="settings__label">兴趣领域（逗号分隔）</label>
                <input
                  className="settings__input"
                  value={bossInterests}
                  onChange={e => setBossInterests(e.target.value)}
                  placeholder="AI, 教育, 游戏, 创业..."
                />
              </div>
              <div className="settings__field">
                <label className="settings__label">讨厌的事物（逗号分隔）</label>
                <input
                  className="settings__input"
                  value={bossHates}
                  onChange={e => setBossHates(e.target.value)}
                  placeholder="低效, 官僚..."
                />
              </div>
              <button className="settings__save-btn" onClick={saveBoss}>保存</button>
            </GridCard>
          </div>
        )}

        {/* 数据管理 */}
        {activeTab === 'data' && (
          <div className="settings__section">
            <GridCard title="数据管理">
              <div className="settings__data-actions">
                <button className="settings__data-btn settings__data-btn--export" onClick={handleExport}>
                  📦 导出数据
                </button>
                <button className="settings__data-btn settings__data-btn--clear" onClick={handleClearData}>
                  🗑️ 清除所有数据
                </button>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--hd-text-muted)', marginTop: 'var(--hd-space-sm)' }}>
                数据存储在本地（SQLite + localStorage），不会上传到任何服务器。
              </p>
            </GridCard>
          </div>
        )}

        {/* 关于 */}
        {activeTab === 'about' && (
          <div className="settings__section">
            <GridCard title="关于">
              <div className="settings__about">
                <div className="settings__about-logo">🔮</div>
                <div className="settings__about-title">项目的游戏</div>
                <div className="settings__about-version">v0.2.0</div>
                <p className="settings__about-desc">
                  个人元宇宙外脑操作系统 & 现实世界战略推演沙盘
                </p>
                <p className="settings__about-desc">
                  项目即神经元 · 连接即突触 · 全维度服务用户
                </p>
                <div className="settings__about-tech">
                  <span className="settings__tag">Electron 41</span>
                  <span className="settings__tag">React 19</span>
                  <span className="settings__tag">TypeScript</span>
                  <span className="settings__tag">SQLite</span>
                  <span className="settings__tag">Hermes Dark</span>
                </div>
              </div>
            </GridCard>
          </div>
        )}
      </div>
    </div>
  )
}
