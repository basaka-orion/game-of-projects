/**
 * TeamsTab — 群策群力 · 团队协作面板
 *
 * 功能：
 * - 团队列表（全部/永久/自动/头脑风暴）
 * - 创建团队（选成员、选类型、选通信模式）
 * - 编辑团队（修改名称、描述、成员）
 * - 发起群聊（输入话题 → 各 Agent 依次回复）
 * - 解散团队
 * - 自定义 Agent 管理（创建/编辑/删除）
 *
 * 后端调用：
 * - src/lib/teams/store.ts — CRUD
 * - src/lib/teams/factory.ts — 创建工厂
 * - src/lib/teams/engine.ts — 会话执行
 * - src/lib/agents/registry.ts — Agent 列表
 */
import { useState, useEffect, useCallback } from 'react'
import { listTeams, createTeam, updateTeam, deleteTeam } from '../../../lib/teams/store'
import { runTeamSession } from '../../../lib/teams/engine'
import { createPermanentTeam, createBrainstormTeam } from '../../../lib/teams/factory'
import { listAllAgents, AgentDefinition, createCustomAgent, updateCustomAgent, deleteCustomAgent } from '../../../lib/agents/registry'
import { loadAgentMemory, addMemoryEntry, removeMemoryEntry, AgentMemory, MemoryEntry } from '../../../lib/agents/agent-memory'
import { Team, TeamType, TeamAgent, TeamMessage, TeamSession } from '../../../lib/teams/types'
import { getSoul, getSoulSummary } from '../../../lib/agents/soul'
import { generatePRD, exportPRDAsMarkdown, PRDResult, PRDChapter } from '../../../lib/prd/generator'
import { PRD_QUESTIONS, PRDAnswers } from '../../../lib/prd/questions'
import WorkflowDiagram from './WorkflowDiagram'
import './TeamsTab.css'

type FilterType = 'all' | 'permanent' | 'agency' | 'brainstorm' | 'my-agents'

interface TeamWithSession extends Team {
  latestSession?: TeamSession
}

export default function TeamsTab() {
  const [teams, setTeams] = useState<Team[]>([])
  const [agents, setAgents] = useState<AgentDefinition[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')
  const [loading, setLoading] = useState(true)

  // 创建/编辑模态
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [createTab, setCreateTab] = useState<'team' | 'agent'>('team')
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formType, setFormType] = useState<TeamType>('permanent')
  const [formMembers, setFormMembers] = useState<string[]>([])
  const [formCommPattern, setFormCommPattern] = useState<'sequential' | 'round-robin' | 'broadcast'>('sequential')

  // 自定义 Agent 表单
  const [agentName, setAgentName] = useState('')
  const [agentIcon, setAgentIcon] = useState('🤖')
  const [agentRole, setAgentRole] = useState('')
  const [agentColor, setAgentColor] = useState('#00d4aa')
  const [agentTemp, setAgentTemp] = useState(0.6)
  const [agentBotToken, setAgentBotToken] = useState('')
  const [agentImPlatform, setAgentImPlatform] = useState<'telegram' | 'discord' | 'slack'>('telegram')
  const [agentImTargetId, setAgentImTargetId] = useState('')
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)

  // Agent 管理面板
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  // Agent 记忆
  const [agentMemory, setAgentMemory] = useState<AgentMemory | null>(null)
  const [newMemoryText, setNewMemoryText] = useState('')

  // 加载 Agent 记忆
  useEffect(() => {
    if (selectedAgentId) {
      loadAgentMemory(selectedAgentId).then(setAgentMemory)
    } else {
      setAgentMemory(null)
    }
  }, [selectedAgentId])

  const AGENT_EMOJIS = ['🤖', '🧠', '💡', '🔬', '🎯', '📊', '🎨', '⚡', '🔮', '🛡️', '🚀', '⚙️']
  const AGENT_COLORS = ['#00d4aa', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#10b981', '#f97316']

  // 群聊
  const [chatTopic, setChatTopic] = useState('')
  const [chatMessages, setChatMessages] = useState<TeamMessage[]>([])
  const [chatRunning, setChatRunning] = useState(false)
  const [chatSummary, setChatSummary] = useState('')

  // PRD 生成
  const [showPrdModal, setShowPrdModal] = useState(false)
  const [prdAnswers, setPrdAnswers] = useState<PRDAnswers>({})
  const [prdResult, setPrdResult] = useState<PRDResult | null>(null)
  const [prdGenerating, setPrdGenerating] = useState(false)
  const [prdProgress, setPrdProgress] = useState('')
  const [prdExpandedChapters, setPrdExpandedChapters] = useState<Set<number>>(new Set())

  // 加载数据
  useEffect(() => {
    async function load() {
      setLoading(true)
      const [teamList, agentList] = await Promise.all([
        listTeams({ status: 'active' }),
        listAllAgents(),
      ])
      setTeams(teamList)
      setAgents(agentList)
      if (teamList.length > 0 && !selectedTeamId) {
        setSelectedTeamId(teamList[0].id)
      }
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 刷新 agent 列表
  const refreshAgents = useCallback(async () => {
    const agentList = await listAllAgents()
    setAgents(agentList)
  }, [])

  // 自定义 Agent 列表
  const customAgents = agents.filter(a => a.isCustom)

  // 筛选后的团队
  const filteredTeams = filter === 'all' ? teams : filter === 'my-agents' ? [] : teams.filter(t => t.teamType === filter)

  // 选中的团队
  const selectedTeam = teams.find(t => t.id === selectedTeamId) || null

  // 选中的自定义 Agent
  const selectedCustomAgent = selectedAgentId ? customAgents.find(a => a.id === selectedAgentId) : null

  // 创建/更新团队
  const handleSaveTeam = useCallback(async () => {
    if (!formName.trim() || formMembers.length === 0) return

    const teamAgents: TeamAgent[] = formMembers.map(id => {
      const agent = agents.find(a => a.id === id)
      return { agentId: id, role: agent?.name || id, skills: agent?.skills || [] }
    })

    if (editingTeam) {
      await updateTeam(editingTeam.id, {
        name: formName,
        description: formDesc,
        agents: teamAgents,
        config: { communicationPattern: formCommPattern },
      })
    } else {
      if (formType === 'brainstorm') {
        await createBrainstormTeam({
          topic: formName,
          agentIds: formMembers,
        })
      } else {
        await createPermanentTeam({
          name: formName,
          description: formDesc,
          agents: teamAgents,
          communicationPattern: formCommPattern,
        })
      }
    }

    const updated = await listTeams({ status: 'active' })
    setTeams(updated)
    setShowCreateModal(false)
    setEditingTeam(null)
    resetForm()
  }, [formName, formDesc, formType, formMembers, formCommPattern, agents, editingTeam])

  // 编辑团队
  const handleEditTeam = useCallback((team: Team) => {
    setEditingTeam(team)
    setFormName(team.name)
    setFormDesc(team.description)
    setFormType(team.teamType)
    setFormMembers(team.agents.map(a => a.agentId))
    setFormCommPattern(team.config.communicationPattern)
    setCreateTab('team')
    setShowCreateModal(true)
  }, [])

  // 解散团队
  const handleDisbandTeam = useCallback(async (id: string) => {
    if (!confirm('确定要解散这个团队吗？')) return
    await deleteTeam(id)
    setTeams(prev => prev.filter(t => t.id !== id))
    if (selectedTeamId === id) setSelectedTeamId(null)
  }, [selectedTeamId])

  // 发起群聊
  const handleStartChat = useCallback(async () => {
    if (!selectedTeam || !chatTopic.trim()) return
    setChatRunning(true)
    setChatMessages([])
    setChatSummary('')

    try {
      const session = await runTeamSession(selectedTeam, chatTopic, (msg) => {
        setChatMessages(prev => [...prev, msg])
      })
      setChatSummary(session.summary)
    } catch (err) {
      setChatMessages(prev => [...prev, {
        id: 'error',
        agentId: 'system',
        agentName: '系统',
        role: 'system',
        content: `会话失败: ${(err as Error).message}`,
        timestamp: Date.now(),
      }])
    }
    setChatRunning(false)
  }, [selectedTeam, chatTopic])

  // PRD 生成
  const handleGeneratePRD = useCallback(async () => {
    setPrdGenerating(true)
    setPrdResult(null)
    setPrdProgress('准备中...')
    try {
      const result = await generatePRD(prdAnswers, (msg) => setPrdProgress(msg))
      setPrdResult(result)
      setPrdExpandedChapters(new Set(result.chapters.map(c => c.id)))
    } catch (err) {
      setPrdProgress(`生成失败: ${(err as Error).message}`)
    }
    setPrdGenerating(false)
  }, [prdAnswers])

  // PRD 下载
  const handleDownloadPRD = useCallback(() => {
    if (!prdResult) return
    const md = exportPRDAsMarkdown(prdResult)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${prdResult.projectTitle}_PRD.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [prdResult])

  // PRD 章节折叠
  const toggleChapter = useCallback((id: number) => {
    setPrdExpandedChapters(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // 重置表单
  const resetForm = () => {
    setFormName('')
    setFormDesc('')
    setFormType('permanent')
    setFormMembers([])
    setFormCommPattern('sequential')
  }

  // 创建或更新自定义 Agent
  const handleSaveAgent = useCallback(async () => {
    if (!agentName.trim() || !agentRole.trim()) return

    // 组装 IM 渠道配置
    const platformConfig: Record<string, unknown> = agentImTargetId ? {
      defaultPlatform: agentImPlatform,
      targets: [{ platform: agentImPlatform, targetId: agentImTargetId, enabled: true }],
    } : {}

    if (editingAgentId) {
      // 更新
      await updateCustomAgent(editingAgentId, {
        name: agentName,
        nameEn: agentName,
        icon: agentIcon,
        systemPromptSuffix: agentRole,
        temperature: agentTemp,
        skills: [],
        avatarStyle: 'default',
        color: agentColor,
        botToken: agentBotToken,
        platformConfig,
      })
      setEditingAgentId(null)
    } else {
      // 创建
      await createCustomAgent({
        name: agentName,
        nameEn: agentName,
        icon: agentIcon,
        systemPromptSuffix: agentRole,
        temperature: agentTemp,
        skills: [],
        avatarStyle: 'default',
        color: agentColor,
        botToken: agentBotToken,
        platformConfig,
      })
    }

    await refreshAgents()
    resetAgentForm()
    setFilter('my-agents')
    setShowCreateModal(false)
  }, [agentName, agentRole, agentIcon, agentColor, agentTemp, editingAgentId, refreshAgents])

  // 编辑自定义 Agent
  const handleEditCustomAgent = useCallback((agent: AgentDefinition) => {
    setEditingAgentId(agent.id)
    setAgentName(agent.name)
    setAgentIcon(agent.icon)
    setAgentRole(agent.systemPromptSuffix)
    setAgentColor(agent.color)
    setAgentTemp(agent.temperature)
    setAgentBotToken(agent.botToken || '')
    // 加载 IM 渠道配置
    const pc = agent.platformConfig as Record<string, unknown> | undefined
    if (pc?.defaultPlatform && typeof pc.defaultPlatform === 'string') {
      setAgentImPlatform(pc.defaultPlatform as 'telegram' | 'discord' | 'slack')
      const targets = pc.targets as Array<{ platform: string; targetId: string }> | undefined
      setAgentImTargetId(targets?.[0]?.targetId || '')
    } else {
      setAgentImPlatform('telegram')
      setAgentImTargetId('')
    }
    setCreateTab('agent')
    setShowCreateModal(true)
  }, [])

  // 删除自定义 Agent
  const handleDeleteCustomAgent = useCallback(async (id: string) => {
    if (!confirm('确定要删除这个自定义 Agent 吗？')) return
    await deleteCustomAgent(id)
    if (selectedAgentId === id) setSelectedAgentId(null)
    await refreshAgents()
  }, [selectedAgentId, refreshAgents])

  const resetAgentForm = () => {
    setAgentName('')
    setAgentRole('')
    setAgentIcon('🤖')
    setAgentColor('#00d4aa')
    setAgentTemp(0.6)
    setAgentBotToken('')
    setAgentImPlatform('telegram')
    setAgentImTargetId('')
    setEditingAgentId(null)
  }

  // 切换成员选择
  const toggleMember = (agentId: string) => {
    setFormMembers(prev =>
      prev.includes(agentId)
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    )
  }

  // 类型标签
  const typeLabels: Record<TeamType, { label: string; color: string }> = {
    permanent: { label: '永久', color: '#00d4aa' },
    agency: { label: '自动', color: '#f59e0b' },
    brainstorm: { label: '头脑风暴', color: '#8b5cf6' },
  }

  // Agent 彩色映射
  const agentColors: Record<string, string> = {
    strategy: '#00d4aa',
    technical: '#3b82f6',
    market: '#f59e0b',
    creative: '#8b5cf6',
    critic: '#ef4444',
    general: '#06b6d4',
  }

  const getAgentColor = (agentId: string): string => {
    for (const [key, color] of Object.entries(agentColors)) {
      if (agentId.includes(key)) return color
    }
    return '#00d4aa'
  }

  return (
    <div className="teams-tab">
      {/* 顶部操作栏 */}
      <div className="teams-tab__header">
        <div className="teams-tab__filters">
          {(['all', 'permanent', 'agency', 'brainstorm', 'my-agents'] as FilterType[]).map(f => (
            <button
              key={f}
              className={`teams-tab__filter-btn ${filter === f ? 'teams-tab__filter-btn--active' : ''}`}
              onClick={() => { setFilter(f); setSelectedAgentId(null) }}
            >
              {f === 'all' ? '全部' : f === 'my-agents' ? '🤖 我的 Agent' : typeLabels[f]?.label || f}
              {f === 'all' && teams.length > 0 && <span className="teams-tab__badge">{teams.length}</span>}
              {f === 'my-agents' && customAgents.length > 0 && <span className="teams-tab__badge">{customAgents.length}</span>}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {filter === 'my-agents' ? (
            <button
              className="teams-tab__create-btn"
              onClick={() => { resetAgentForm(); setEditingAgentId(null); setCreateTab('agent'); setShowCreateModal(true) }}
            >+ 创建 Agent</button>
          ) : (
            <>
              <button
                className="teams-tab__create-btn"
                style={{ background: 'transparent', border: '1px solid var(--hd-accent-cyan)', color: 'var(--hd-accent-cyan)' }}
                onClick={() => { resetAgentForm(); setEditingAgentId(null); setCreateTab('agent'); setShowCreateModal(true) }}
              >+ Agent</button>
              <button
                className="teams-tab__create-btn"
                onClick={() => { resetForm(); setEditingTeam(null); setCreateTab('team'); setShowCreateModal(true) }}
              >+ 创建团队</button>
            </>
          )}
        </div>
      </div>

      {/* 主体 */}
      <div className="teams-tab__body">

        {/* ─── 我的 Agent 模式 ─── */}
        {filter === 'my-agents' ? (
          <>
            {/* 左侧：Agent 列表 */}
            <div className="teams-tab__list">
              {loading ? (
                <div className="teams-tab__empty">加载中...</div>
              ) : customAgents.length === 0 ? (
                <div className="teams-tab__empty">
                  <div className="teams-tab__empty-icon">🤖</div>
                  <div>暂无自定义 Agent</div>
                  <div className="teams-tab__empty-hint">点击右上角「+ 创建 Agent」开始</div>
                </div>
              ) : (
                customAgents.map(agent => (
                  <button
                    key={agent.id}
                    className={`teams-tab__card ${selectedAgentId === agent.id ? 'teams-tab__card--active' : ''}`}
                    onClick={() => setSelectedAgentId(agent.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.3rem' }}>{agent.icon}</span>
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div className="teams-tab__card-name">{agent.name}</div>
                        <div className="teams-tab__card-meta">
                          <span className="teams-tab__type-tag" style={{ borderColor: agent.color, color: agent.color }}>
                            自定义
                          </span>
                          <span className="teams-tab__card-members" style={{ fontSize: '0.65rem' }}>
                            T={agent.temperature}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* 右侧：Agent 详情 */}
            <div className="teams-tab__detail">
              {!selectedCustomAgent ? (
                <div className="teams-tab__empty">
                  <div className="teams-tab__empty-icon">←</div>
                  <div>选择一个 Agent 查看详情</div>
                </div>
              ) : (
                <div style={{ padding: 'var(--hd-space-lg)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--hd-space-md)', marginBottom: 'var(--hd-space-lg)' }}>
                    <span style={{ fontSize: '2.5rem' }}>{selectedCustomAgent.icon}</span>
                    <div>
                      <h3 style={{ fontSize: '1.2rem', margin: 0, color: selectedCustomAgent.color }}>{selectedCustomAgent.name}</h3>
                      <span className="teams-tab__type-tag" style={{ borderColor: selectedCustomAgent.color, color: selectedCustomAgent.color }}>
                        自定义 Agent
                      </span>
                      <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: 'var(--hd-text-muted)' }}>温度: {selectedCustomAgent.temperature}</span>
                    </div>
                  </div>

                  <div className="teams-tab__section-title">角色描述 (System Prompt)</div>
                  <div style={{
                    background: 'var(--hd-bg-deep)',
                    border: '1px solid var(--hd-border)',
                    padding: 'var(--hd-space-md)',
                    borderRadius: 'var(--hd-radius-sm)',
                    fontFamily: 'var(--hd-font-mono)',
                    fontSize: '0.82rem',
                    lineHeight: 1.7,
                    color: 'var(--hd-text-secondary)',
                    marginBottom: 'var(--hd-space-lg)',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {selectedCustomAgent.systemPromptSuffix || '(无描述)'}
                  </div>

                  {/* Bot Token 状态 */}
                  <div className="teams-tab__section-title">平台连接</div>
                  <div style={{
                    background: 'var(--hd-bg-deep)',
                    border: '1px solid var(--hd-border)',
                    padding: 'var(--hd-space-sm) var(--hd-space-md)',
                    borderRadius: 'var(--hd-radius-sm)',
                    fontSize: '0.8rem',
                    marginBottom: 'var(--hd-space-lg)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--hd-space-sm)',
                  }}>
                    <span>🤖 Telegram</span>
                    {selectedCustomAgent.botToken ? (
                      <>
                        <span style={{ color: 'var(--hd-success)', fontWeight: 600 }}>● 已配置</span>
                        <span style={{ fontFamily: 'var(--hd-font-mono)', color: 'var(--hd-text-muted)', fontSize: '0.7rem' }}>
                          {selectedCustomAgent.botToken.slice(0, 8)}...{selectedCustomAgent.botToken.slice(-4)}
                        </span>
                      </>
                    ) : (
                      <span style={{ color: 'var(--hd-text-muted)' }}>未配置 — 编辑 Agent 添加 Token</span>
                    )}
                  </div>

                  {/* Agent 记忆宫殿 */}
                  <div className="teams-tab__section-title">记忆宫殿</div>
                  <div style={{
                    background: 'var(--hd-bg-deep)',
                    border: '1px solid var(--hd-border)',
                    borderRadius: 'var(--hd-radius-sm)',
                    padding: 'var(--hd-space-md)',
                    marginBottom: 'var(--hd-space-lg)',
                  }}>
                    {/* 容量条 */}
                    {agentMemory && (
                      <div style={{ marginBottom: 'var(--hd-space-sm)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--hd-text-muted)' }}>
                          {agentMemory.entries.reduce((sum, e) => sum + e.text.length, 0)} / {agentMemory.charLimit} 字符
                        </span>
                        <div style={{ flex: 1, height: 4, background: 'var(--hd-border)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%',
                            width: `${Math.min(100, (agentMemory.entries.reduce((sum, e) => sum + e.text.length, 0) / agentMemory.charLimit) * 100)}%`,
                            background: agentMemory.entries.reduce((sum, e) => sum + e.text.length, 0) > agentMemory.charLimit * 0.8
                              ? 'var(--hd-error)' : 'var(--hd-accent-cyan)',
                            borderRadius: 2,
                            transition: 'width 0.3s',
                          }} />
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--hd-text-muted)' }}>
                          {agentMemory.entries.length} 条
                        </span>
                      </div>
                    )}

                    {/* 记忆条目列表 */}
                    <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 'var(--hd-space-sm)' }}>
                      {agentMemory && agentMemory.entries.length > 0 ? (
                        agentMemory.entries.map(entry => (
                          <div key={entry.rowid} style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            padding: '6px 0',
                            borderBottom: '1px solid var(--hd-border)',
                            fontSize: '0.78rem',
                          }}>
                            <span style={{ color: 'var(--hd-text-secondary)', flex: 1, lineHeight: 1.6 }}>{entry.text}</span>
                            <button
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--hd-text-muted)',
                                cursor: 'pointer',
                                fontSize: '0.7rem',
                                padding: '2px 4px',
                                flexShrink: 0,
                              }}
                              onClick={async () => {
                                await removeMemoryEntry(selectedAgentId!, entry.rowid)
                                const updated = await loadAgentMemory(selectedAgentId!)
                                setAgentMemory(updated)
                              }}
                            >✕</button>
                          </div>
                        ))
                      ) : (
                        <div style={{ fontSize: '0.75rem', color: 'var(--hd-text-muted)', padding: 'var(--hd-space-sm)' }}>
                          暂无记忆条目
                        </div>
                      )}
                    </div>

                    {/* 添加记忆 */}
                    <div style={{ display: 'flex', gap: 'var(--hd-space-sm)' }}>
                      <input
                        className="teams-tab__form-input"
                        style={{ flex: 1, fontSize: '0.78rem' }}
                        value={newMemoryText}
                        onChange={e => setNewMemoryText(e.target.value)}
                        placeholder="添加记忆条目..."
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && newMemoryText.trim() && selectedAgentId) {
                            await addMemoryEntry(selectedAgentId, newMemoryText.trim())
                            setNewMemoryText('')
                            const updated = await loadAgentMemory(selectedAgentId)
                            setAgentMemory(updated)
                          }
                        }}
                      />
                      <button
                        className="teams-tab__action-btn teams-tab__action-btn--edit"
                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        disabled={!newMemoryText.trim()}
                        onClick={async () => {
                          if (newMemoryText.trim() && selectedAgentId) {
                            await addMemoryEntry(selectedAgentId, newMemoryText.trim())
                            setNewMemoryText('')
                            const updated = await loadAgentMemory(selectedAgentId)
                            setAgentMemory(updated)
                          }
                        }}
                      >+ 添加</button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--hd-space-sm)' }}>
                    <button
                      className="teams-tab__action-btn teams-tab__action-btn--edit"
                      onClick={() => handleEditCustomAgent(selectedCustomAgent)}
                    >✏️ 编辑</button>
                    <button
                      className="teams-tab__action-btn teams-tab__action-btn--disband"
                      onClick={() => handleDeleteCustomAgent(selectedCustomAgent.id)}
                    >🗑️ 删除</button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* ─── 团队模式（原逻辑） ─── */}
            {/* 左侧：团队列表 */}
            <div className="teams-tab__list">
              {loading ? (
                <div className="teams-tab__empty">加载中...</div>
              ) : filteredTeams.length === 0 ? (
                <div className="teams-tab__empty">
                  <div className="teams-tab__empty-icon">🤝</div>
                  <div>暂无团队</div>
                  <div className="teams-tab__empty-hint">点击右上角「+ 创建团队」开始协作</div>
                </div>
              ) : (
                filteredTeams.map(team => (
                  <button
                    key={team.id}
                    className={`teams-tab__card ${selectedTeamId === team.id ? 'teams-tab__card--active' : ''}`}
                    onClick={() => setSelectedTeamId(team.id)}
                  >
                    <div className="teams-tab__card-name">{team.name}</div>
                    <div className="teams-tab__card-meta">
                      <span
                        className="teams-tab__type-tag"
                        style={{ borderColor: typeLabels[team.teamType]?.color, color: typeLabels[team.teamType]?.color }}
                      >
                        {typeLabels[team.teamType]?.label}
                      </span>
                      <span className="teams-tab__card-members">
                        {team.agents.length} 成员
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* 右侧：团队详情 */}
            <div className="teams-tab__detail">
              {!selectedTeam ? (
                <div className="teams-tab__empty">
                  <div className="teams-tab__empty-icon">←</div>
                  <div>选择一个团队查看详情</div>
                </div>
              ) : (
                <>
                  {/* 团队信息 */}
                  <div className="teams-tab__info">
                    <div className="teams-tab__info-header">
                      <div>
                        <h3 className="teams-tab__info-name">{selectedTeam.name}</h3>
                        <span
                          className="teams-tab__type-tag"
                          style={{ borderColor: typeLabels[selectedTeam.teamType]?.color, color: typeLabels[selectedTeam.teamType]?.color }}
                        >
                          {typeLabels[selectedTeam.teamType]?.label}
                        </span>
                      </div>
                      <div className="teams-tab__info-actions">
                        <button className="teams-tab__action-btn teams-tab__action-btn--edit" onClick={() => handleEditTeam(selectedTeam)}>
                          编辑
                        </button>
                        <button className="teams-tab__action-btn teams-tab__action-btn--disband" onClick={() => handleDisbandTeam(selectedTeam.id)}>
                          解散
                        </button>
                      </div>
                    </div>
                    {selectedTeam.description && (
                      <p className="teams-tab__info-desc">{selectedTeam.description}</p>
                    )}
                    <div className="teams-tab__info-config">
                      通信模式: {selectedTeam.config.communicationPattern === 'sequential' ? '顺序' : selectedTeam.config.communicationPattern === 'round-robin' ? '轮次' : '广播'}
                    </div>
                  </div>

                  {/* 成员列表 */}
                  <div className="teams-tab__members">
                    <div className="teams-tab__section-title">团队成员</div>
                    <div className="teams-tab__member-list">
                      {selectedTeam.agents.map((agent, i) => {
                        const agentDef = agents.find(a => a.id === agent.agentId)
                        return (
                          <div key={`${agent.agentId}-${i}`} className="teams-tab__member">
                            <span className="teams-tab__member-icon">{agentDef?.icon || '◈'}</span>
                            <span className="teams-tab__member-name">{agentDef?.name || agent.role}</span>
                            <span className="teams-tab__member-role">{agent.role}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* PRD 生成区 */}
                  <div className="teams-tab__prd-section">
                    <div className="teams-tab__section-title">智能 PRD 生成</div>
                    <div className="teams-tab__prd-desc">
                      回答 5 个关键问题，6 位专家协审，4 轮优化生成 16 章节 PRD
                    </div>
                    <div className="teams-tab__prd-actions">
                      <button
                        className="teams-tab__prd-btn"
                        onClick={() => { setPrdAnswers({}); setPrdResult(null); setShowPrdModal(true) }}
                      >
                        生成 PRD
                      </button>
                      {prdResult && (
                        <button className="teams-tab__prd-btn teams-tab__prd-btn--download" onClick={handleDownloadPRD}>
                          下载 Markdown
                        </button>
                      )}
                    </div>

                    {prdGenerating && (
                      <div className="teams-tab__prd-progress">
                        <div className="teams-tab__prd-spinner" />
                        <span>{prdProgress}</span>
                      </div>
                    )}

                    {prdResult && !prdGenerating && (
                      <div className="teams-tab__prd-result">
                        <div className="teams-tab__prd-result-header">
                          <span className="teams-tab__prd-result-title">{prdResult.projectTitle} — PRD</span>
                          <span className="teams-tab__prd-result-meta">
                            {prdResult.chapters.length} 章节 · 4 轮专家审阅
                          </span>
                        </div>
                        {prdResult.chapters.map(chapter => (
                          <div key={chapter.id} className="teams-tab__prd-chapter">
                            <button
                              className="teams-tab__prd-chapter-header"
                              onClick={() => toggleChapter(chapter.id)}
                            >
                              <span className="teams-tab__prd-chapter-num">{chapter.id}</span>
                              <span className="teams-tab__prd-chapter-title">{chapter.title}</span>
                              <span className="teams-tab__prd-chapter-toggle">
                                {prdExpandedChapters.has(chapter.id) ? '−' : '+'}
                              </span>
                            </button>
                            {prdExpandedChapters.has(chapter.id) && (
                              <div className="teams-tab__prd-chapter-content">
                                <div className="teams-tab__prd-chapter-text">{chapter.content}</div>
                                <button
                                  className="teams-tab__prd-copy-btn"
                                  onClick={() => navigator.clipboard.writeText(chapter.content)}
                                >
                                  复制
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 群聊区 */}
                  <div className="teams-tab__chat-section">
                    <div className="teams-tab__section-title">发起群聊</div>

                    {/* 工作流 DAG */}
                    {selectedTeam.config.tasks && selectedTeam.config.tasks.length > 0 && (
                      <WorkflowDiagram
                        tasks={selectedTeam.config.tasks}
                        agents={agents.map(a => ({ id: a.id, name: a.name, icon: a.icon || '◈' }))}
                      />
                    )}
                    <div className="teams-tab__chat-input-row">
                      <input
                        className="teams-tab__chat-input"
                        placeholder="输入讨论话题..."
                        value={chatTopic}
                        onChange={e => setChatTopic(e.target.value)}
                        disabled={chatRunning}
                      />
                      <button
                        className="teams-tab__chat-start-btn"
                        onClick={handleStartChat}
                        disabled={chatRunning || !chatTopic.trim()}
                      >
                        {chatRunning ? '讨论中...' : '开始'}
                      </button>
                    </div>

                    {/* 群聊消息 */}
                    {chatMessages.length > 0 && (
                      <div className="teams-tab__chat-messages">
                        {chatMessages.map(msg => {
                          const color = msg.role === 'system' ? '#ef4444' : getAgentColor(msg.agentId)
                          return (
                            <div
                              key={msg.id}
                              className={`teams-tab__chat-msg ${msg.role === 'system' ? 'teams-tab__chat-msg--system' : 'teams-tab__chat-msg--colored'}`}
                              style={{ '--agent-color': color } as React.CSSProperties}
                            >
                              <span
                                className="teams-tab__chat-msg-avatar teams-tab__chat-msg-avatar--colored"
                                style={{ borderColor: color, color }}
                              >
                                {agents.find(a => a.id === msg.agentId)?.icon || '◈'}
                              </span>
                              <div className="teams-tab__chat-msg-body">
                                <div className="teams-tab__chat-msg-name teams-tab__chat-msg-name--colored" style={{ color }}>
                                  {msg.agentName}
                                </div>
                                <div className="teams-tab__chat-msg-content">{msg.content}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* 综合结论 */}
                    {chatSummary && (
                      <div className="teams-tab__chat-summary">
                        <div className="teams-tab__section-title">
                          综合结论
                          <button
                            className="teams-tab__prd-copy-btn"
                            style={{ marginLeft: 8 }}
                            onClick={() => {
                              const text = chatMessages.map(m => `[${m.agentName}]: ${m.content}`).join('\n\n') + '\n\n---\n综合结论:\n' + chatSummary
                              const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
                              const url = URL.createObjectURL(blob)
                              const a = document.createElement('a')
                              a.href = url
                              a.download = `${selectedTeam?.name || 'team'}_讨论记录.txt`
                              a.click()
                              URL.revokeObjectURL(url)
                            }}
                          >
                            下载记录
                          </button>
                        </div>
                        <div className="teams-tab__chat-summary-text">{chatSummary}</div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* 创建/编辑团队模态 */}
      {showCreateModal && (
        <div className="teams-tab__modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="teams-tab__modal" onClick={e => e.stopPropagation()}>
            <div className="teams-tab__modal-header">
              <div className="teams-tab__modal-tabs">
                <button
                  className={`teams-tab__modal-tab ${createTab === 'team' ? 'teams-tab__modal-tab--active' : ''}`}
                  onClick={() => setCreateTab('team')}
                >
                  {editingTeam ? '编辑团队' : '创建团队'}
                </button>
                {!editingTeam && (
                  <button
                    className={`teams-tab__modal-tab ${createTab === 'agent' ? 'teams-tab__modal-tab--active' : ''}`}
                    onClick={() => setCreateTab('agent')}
                  >
                    {editingAgentId ? '编辑 Agent' : '自定义 Agent'}
                  </button>
                )}
              </div>
              <button className="teams-tab__modal-close" onClick={() => { setShowCreateModal(false); setEditingAgentId(null) }}>✕</button>
            </div>

            {createTab === 'team' ? (
              <>
                <div className="teams-tab__modal-body">
                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">团队名称</label>
                    <input
                      className="teams-tab__form-input"
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      placeholder="给团队起个名字..."
                    />
                  </div>

                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">描述</label>
                    <input
                      className="teams-tab__form-input"
                      value={formDesc}
                      onChange={e => setFormDesc(e.target.value)}
                      placeholder="团队的目标或描述..."
                    />
                  </div>

                  {!editingTeam && (
                    <div className="teams-tab__form-group">
                      <label className="teams-tab__form-label">团队类型</label>
                      <div className="teams-tab__form-radio-group">
                        <button
                          className={`teams-tab__form-radio ${formType === 'permanent' ? 'teams-tab__form-radio--active' : ''}`}
                          onClick={() => setFormType('permanent')}
                        >
                          永久团队
                        </button>
                        <button
                          className={`teams-tab__form-radio ${formType === 'brainstorm' ? 'teams-tab__form-radio--active' : ''}`}
                          onClick={() => setFormType('brainstorm')}
                        >
                          头脑风暴
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">通信模式</label>
                    <div className="teams-tab__form-radio-group">
                      <button
                        className={`teams-tab__form-radio ${formCommPattern === 'sequential' ? 'teams-tab__form-radio--active' : ''}`}
                        onClick={() => setFormCommPattern('sequential')}
                      >
                        顺序（依次发言）
                      </button>
                      <button
                        className={`teams-tab__form-radio ${formCommPattern === 'round-robin' ? 'teams-tab__form-radio--active' : ''}`}
                        onClick={() => setFormCommPattern('round-robin')}
                      >
                        轮次（多轮讨论）
                      </button>
                      <button
                        className={`teams-tab__form-radio ${formCommPattern === 'broadcast' ? 'teams-tab__form-radio--active' : ''}`}
                        onClick={() => setFormCommPattern('broadcast')}
                      >
                        广播（并行发言）
                      </button>
                    </div>
                  </div>

                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">
                      选择成员 ({formMembers.length} 已选)
                    </label>
                    <div className="teams-tab__member-picker">
                      {agents.map(agent => (
                        <button
                          key={agent.id}
                          className={`teams-tab__member-pick-btn ${formMembers.includes(agent.id) ? 'teams-tab__member-pick-btn--active' : ''}`}
                          onClick={() => toggleMember(agent.id)}
                        >
                          <span>{agent.icon}</span>
                          <span>{agent.name}</span>
                          {formMembers.includes(agent.id) && <span className="teams-tab__pick-check">✓</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="teams-tab__modal-footer">
                  <button className="teams-tab__modal-btn teams-tab__modal-btn--cancel" onClick={() => setShowCreateModal(false)}>
                    取消
                  </button>
                  <button
                    className="teams-tab__modal-btn teams-tab__modal-btn--save"
                    onClick={handleSaveTeam}
                    disabled={!formName.trim() || formMembers.length === 0}
                  >
                    {editingTeam ? '保存修改' : '创建团队'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="teams-tab__modal-body">
                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">Agent 名称</label>
                    <input
                      className="teams-tab__form-input"
                      value={agentName}
                      onChange={e => setAgentName(e.target.value)}
                      placeholder="给你的 Agent 起个名字..."
                    />
                  </div>

                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">Emoji 图标</label>
                    <div className="teams-tab__form-radio-group">
                      {AGENT_EMOJIS.map(emoji => (
                        <button
                          key={emoji}
                          className={`teams-tab__form-radio ${agentIcon === emoji ? 'teams-tab__form-radio--active' : ''}`}
                          onClick={() => setAgentIcon(emoji)}
                          style={{ fontSize: '1rem', padding: '4px 8px' }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">角色描述 (System Prompt)</label>
                    <textarea
                      className="teams-tab__form-textarea"
                      value={agentRole}
                      onChange={e => setAgentRole(e.target.value)}
                      placeholder="描述这个 Agent 的专长和行为方式..."
                      rows={3}
                    />
                  </div>

                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">主题色</label>
                    <div className="teams-tab__form-radio-group">
                      {AGENT_COLORS.map(c => (
                        <button
                          key={c}
                          className={`teams-tab__form-radio ${agentColor === c ? 'teams-tab__form-radio--active' : ''}`}
                          onClick={() => setAgentColor(c)}
                          style={{
                            backgroundColor: c,
                            borderColor: agentColor === c ? '#fff' : c,
                            width: 28,
                            height: 28,
                            padding: 0,
                            minWidth: 28,
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">温度 ({agentTemp})</label>
                    <input
                      type="range"
                      min="0.0"
                      max="1"
                      step="0.1"
                      value={agentTemp}
                      onChange={e => setAgentTemp(parseFloat(e.target.value))}
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">
                      Telegram Bot Token
                      <span style={{ fontSize: '0.7rem', color: 'var(--hd-text-muted)', fontWeight: 400, marginLeft: 6 }}>
                        可选 — 绑定后该 Agent 可通过独立 Bot 对话
                      </span>
                    </label>
                    <input
                      className="teams-tab__form-input"
                      value={agentBotToken}
                      onChange={e => setAgentBotToken(e.target.value)}
                      placeholder="123456789:ABCdefGHI..."
                      style={{ fontFamily: 'var(--hd-font-mono, monospace)', fontSize: '0.8rem' }}
                    />
                    {agentBotToken && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--hd-success)', marginTop: 4 }}>
                        ✓ Token 已填写 — 创建后将自动启动该 Bot 的轮询
                      </div>
                    )}
                  </div>

                  {/* IM 渠道配置 */}
                  <div className="teams-tab__form-group">
                    <label className="teams-tab__form-label">
                      IM 推送渠道
                      <span style={{ fontSize: '0.7rem', color: 'var(--hd-text-muted)', fontWeight: 400, marginLeft: 6 }}>
                        可选 — 定时任务结果推送到该 Agent 专属渠道
                      </span>
                    </label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <select
                        className="teams-tab__form-input"
                        value={agentImPlatform}
                        onChange={e => setAgentImPlatform(e.target.value as 'telegram' | 'discord' | 'slack')}
                        style={{ width: 140, flexShrink: 0 }}
                      >
                        <option value="telegram">Telegram</option>
                        <option value="discord">Discord</option>
                        <option value="slack">Slack</option>
                      </select>
                      <input
                        className="teams-tab__form-input"
                        value={agentImTargetId}
                        onChange={e => setAgentImTargetId(e.target.value)}
                        placeholder={agentImPlatform === 'telegram' ? 'Chat ID' : 'Webhook URL'}
                        style={{ flex: 1 }}
                      />
                    </div>
                    {agentImTargetId && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--hd-success)', marginTop: 4 }}>
                        ✓ 推送目标已配置 — 该 Agent 的定时任务将推送到 {agentImPlatform}
                      </div>
                    )}
                  </div>
                </div>

                <div className="teams-tab__modal-footer">
                  <button className="teams-tab__modal-btn teams-tab__modal-btn--cancel" onClick={() => { setShowCreateModal(false); setEditingAgentId(null) }}>
                    取消
                  </button>
                  <button
                    className="teams-tab__modal-btn teams-tab__modal-btn--save"
                    onClick={handleSaveAgent}
                    disabled={!agentName.trim() || !agentRole.trim()}
                  >
                    {editingAgentId ? '保存修改' : '创建 Agent'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* PRD 问答模态 */}
      {showPrdModal && (
        <div className="teams-tab__modal-overlay" onClick={() => { if (!prdGenerating) setShowPrdModal(false) }}>
          <div className="teams-tab__modal teams-tab__modal--prd" onClick={e => e.stopPropagation()}>
            <div className="teams-tab__modal-header">
              <h3>智能 PRD 生成 — 5 个关键问题</h3>
              <button className="teams-tab__modal-close" onClick={() => { if (!prdGenerating) setShowPrdModal(false) }}>✕</button>
            </div>

            <div className="teams-tab__modal-body">
              {PRD_QUESTIONS.map(q => (
                <div key={q.id} className="teams-tab__form-group">
                  <label className="teams-tab__form-label">{q.question}</label>
                  {q.type === 'select' ? (
                    <div className="teams-tab__form-radio-group">
                      {q.options?.map(opt => (
                        <button
                          key={opt}
                          className={`teams-tab__form-radio ${prdAnswers[q.id] === opt ? 'teams-tab__form-radio--active' : ''}`}
                          onClick={() => setPrdAnswers(prev => ({ ...prev, [q.id]: opt }))}
                          disabled={prdGenerating}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : q.type === 'textarea' ? (
                    <textarea
                      className="teams-tab__form-textarea"
                      value={prdAnswers[q.id] || ''}
                      onChange={e => setPrdAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder={q.placeholder}
                      rows={3}
                      disabled={prdGenerating}
                    />
                  ) : (
                    <input
                      className="teams-tab__form-input"
                      value={prdAnswers[q.id] || ''}
                      onChange={e => setPrdAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder={q.placeholder}
                      disabled={prdGenerating}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="teams-tab__modal-footer">
              <button
                className="teams-tab__modal-btn teams-tab__modal-btn--cancel"
                onClick={() => setShowPrdModal(false)}
                disabled={prdGenerating}
              >
                取消
              </button>
              <button
                className="teams-tab__modal-btn teams-tab__modal-btn--save"
                onClick={handleGeneratePRD}
                disabled={prdGenerating || !prdAnswers.projectName?.trim() || !prdAnswers.coreProblem?.trim()}
              >
                {prdGenerating ? prdProgress : '开始生成 (4 轮)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
