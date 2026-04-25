import { useMemo, useState, useCallback, useEffect } from 'react'
import GridCard from '../../../components/GridCard'
import HexRadar, { RadarData } from '../../../components/HexRadar'
import TerminalBlock from '../../../components/TerminalBlock'
import SearchStatsBar from '../../../components/SearchStatsBar'
import EmptyState from '../../../components/EmptyState'
import StatusBadge from '../../../components/StatusBadge'
import CollapsibleSection from '../../../components/CollapsibleSection'
import { updateProject, type StoredProject } from '../../../lib/db/store'
import { NeuronData } from '../SandboxMap'
import { listAllAgents, AgentDefinition } from '../../../lib/agents/registry'
import { getAgentPerspective } from '../../../lib/ai/agent-perspective'
import { navigateSandboxTab } from '../navigation'
import { SystemStageFlowItem, SystemStagePanel, SystemStageShell } from '../components/SystemStage'

interface NeuronsTabProps {
  neurons: NeuronData[]
  loading: boolean
  selectedId: string | null
  setSelectedId: (id: string) => void
  onReload?: () => void
}

export default function NeuronsTab({ neurons, loading, selectedId, setSelectedId, onReload }: NeuronsTabProps) {
  const [search, setSearch] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editOneLiner, setEditOneLiner] = useState('')
  const [editTags, setEditTags] = useState('')

  // Agent 视角评估
  const [agents, setAgents] = useState<AgentDefinition[]>([])
  const [perspectiveAgentId, setPerspectiveAgentId] = useState('')
  const [perspectiveText, setPerspectiveText] = useState('')
  const [perspectiveLoading, setPerspectiveLoading] = useState(false)

  useEffect(() => {
    listAllAgents().then(list => setAgents(list.filter(a => a.isCustom)))
  }, [])
  const [editSummary, setEditSummary] = useState('')
  const [editRecommendation, setEditRecommendation] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const filtered = useMemo(() => {
    if (!search.trim()) return neurons
    const q = search.toLowerCase()
    return neurons.filter(n =>
      n.project.title.toLowerCase().includes(q) ||
      n.project.tags.some(t => t.toLowerCase().includes(q)) ||
      n.taxonomy?.taxonomy.industry.toLowerCase().includes(q)
    )
  }, [neurons, search])

  const highCount = neurons.filter(n => n.project.survivalRate >= 75).length
  const lowCount = neurons.filter(n => n.project.survivalRate < 50).length

  const selected = useMemo(
    () => neurons.find(n => n.project.id === selectedId),
    [neurons, selectedId]
  )

  const selectedRadar: RadarData[] = useMemo(() => {
    if (!selected) return []
    const r = selected.project.radar
    return [
      { label: '时代契合', value: r.era_fit },
      { label: 'Boss匹配', value: r.boss_match },
      { label: '商业变现', value: r.monetization },
      { label: '技术突破', value: r.tech_breakthrough },
      { label: '资源消耗', value: r.resource_cost },
      { label: '风险指数', value: r.risk_index },
    ]
  }, [selected])

  const startEdit = useCallback(() => {
    if (!selected) return
    setEditTitle(selected.project.title)
    setEditOneLiner(selected.project.oneLiner)
    setEditTags(selected.project.tags.join(', '))
    setEditSummary(selected.project.summary)
    setEditRecommendation(selected.project.recommendation)
    setIsEditing(true)
  }, [selected])

  const cancelEdit = useCallback(() => {
    setIsEditing(false)
  }, [])

  const handleSave = useCallback(async () => {
    if (!selected || isSaving) return
    setIsSaving(true)
    try {
      const tagsArray = editTags.split(/[,，]/).map(t => t.trim()).filter(Boolean)
      await updateProject(selected.project.id, {
        title: editTitle,
        oneLiner: editOneLiner,
        tags: tagsArray,
        summary: editSummary,
        recommendation: editRecommendation,
      })
      setIsEditing(false)
      onReload?.()
    } catch (err) {
      console.error('保存失败:', err)
    }
    setIsSaving(false)
  }, [selected, editTitle, editOneLiner, editTags, editSummary, editRecommendation, isSaving, onReload])

  // 当 selectedId 变化时退出编辑
  const handleSelect = useCallback((id: string) => {
    setIsEditing(false)
    setSelectedId(id)
  }, [setSelectedId])

  return (
    <>
      {/* 左侧：神经元列表 */}
      <div className="sandbox-map__sidebar">
        <SearchStatsBar
          searchValue={search}
          onSearchChange={setSearch}
          placeholder="搜索神经元..."
          stats={[
            { label: '总计', value: neurons.length },
            { label: '高存活', value: highCount, color: 'var(--hd-success)' },
            ...(lowCount > 0 ? [{ label: '低存活', value: lowCount, color: 'var(--hd-danger)' }] : []),
          ]}
        />
        {loading ? (
          <div style={{ padding: 'var(--hd-space-md)', color: 'var(--hd-text-muted)' }}>
            加载中...
          </div>
        ) : filtered.length === 0 ? (
          neurons.length === 0 ? (
            <EmptyState
              icon="🧬"
              title="尚无神经元"
              description="前往推演室拖入 PRD 开始第一次推演"
            />
          ) : (
            <EmptyState icon="🔍" title="无匹配结果" description="尝试其他关键词" />
          )
        ) : (
          filtered.map(({ project, taxonomy }) => (
            <div
              key={project.id}
              className={`sandbox-map__neuron-card ${selectedId === project.id ? 'sandbox-map__neuron-card--selected' : ''}`}
              onClick={() => handleSelect(project.id)}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <StatusBadge
                  status={
                    project.survivalRate >= 75 ? 'active' :
                    project.survivalRate >= 50 ? 'warning' : 'error'
                  }
                />
                <div style={{ flex: 1 }}>
                  <div className="sandbox-map__neuron-title">{project.title}</div>
                  <div className="sandbox-map__neuron-tags">
                    {taxonomy?.taxonomy ? (
                      <>
                        <span className="sandbox-map__tag">{taxonomy.taxonomy.industry}</span>
                        <span className="sandbox-map__tag">{taxonomy.taxonomy.innovationType}</span>
                      </>
                    ) : (
                      project.tags.slice(0, 2).map(tag => (
                        <span key={tag} className="sandbox-map__tag">{tag}</span>
                      ))
                    )}
                  </div>
                </div>
                <div className={`sandbox-map__neuron-rate ${
                  project.survivalRate >= 75 ? 'sandbox-map__neuron-rate--high' :
                  project.survivalRate >= 50 ? 'sandbox-map__neuron-rate--mid' :
                  'sandbox-map__neuron-rate--low'
                }`}>
                  {project.survivalRate}%
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 右侧：项目详情面板 */}
      <div className="sandbox-map__main">
        {selected ? (
          <div className="sandbox-map__stage-view">
            <SystemStageShell
              eyebrow="project neuron"
              title={`${selected.project.title} 不是一张项目卡，而是一颗正在影响全局判断的神经元`}
              description={selected.project.oneLiner || selected.project.summary || '这颗神经元已经进入系统，但还需要更清晰的一句话定位。'}
              metrics={[
                { label: '存活率', value: `${selected.project.survivalRate}%`, detail: selected.project.survivalGrade, tone: selected.project.survivalRate >= 75 ? 'success' : selected.project.survivalRate >= 50 ? 'warning' : 'danger' },
                { label: '战争日志', value: selected.project.warLogs.length, detail: '红蓝军推演痕迹' },
                { label: '标签', value: selected.project.tags.length, detail: '项目语义切面' },
                { label: '分类状态', value: selected.taxonomy ? '已分类' : '待分类', detail: selected.taxonomy?.taxonomy.innovationType || '等待再次推演', tone: selected.taxonomy ? 'accent' : 'warning' },
              ]}
              actions={[
                { label: isEditing ? '取消编辑' : '编辑项目', onClick: isEditing ? cancelEdit : startEdit, variant: 'primary' },
                { label: '去推演室', onClick: () => navigateSandboxTab('warroom') },
              ]}
              leftRail={
                <>
                  <SystemStagePanel
                    eyebrow="identity"
                    title="项目画像"
                    description="先知道这颗神经元属于哪个行业、哪种创新类型，再去看更细的分析。"
                  >
                    <SystemStageFlowItem
                      title="行业"
                      value={selected.taxonomy?.taxonomy.industry || '待分类'}
                      description={selected.taxonomy?.taxonomy.subIndustry || selected.project.tags.slice(0, 3).join(' · ') || '等待更多语义'}
                      tone="accent"
                    />
                    <SystemStageFlowItem
                      title="商业模式"
                      value={selected.taxonomy?.taxonomy.businessModel || '待识别'}
                      description={selected.taxonomy?.taxonomy.marketSize || selected.project.oneLiner || '尚未补全'}
                    />
                    <SystemStageFlowItem
                      title="创新类型"
                      value={selected.taxonomy?.taxonomy.innovationType || '待识别'}
                      description={selected.taxonomy?.taxonomy.timeToMarket || '等待推演'}
                      tone="warning"
                    />
                  </SystemStagePanel>
                </>
              }
              centerRail={
                <SystemStagePanel
                  eyebrow="focal verdict"
                  title={selected.project.summary || selected.project.oneLiner || '这颗神经元等待更清晰的主判断'}
                  description="右侧所有雷达、SWOT 和 Agent 评估都应该服务于这一句：这颗项目神经元究竟为什么值得你继续盯住。"
                  focal
                  tone="accent"
                >
                  <div className="sandbox-map__focal-stats">
                    <div className="sandbox-map__focal-stat">
                      <span className="sandbox-map__focal-stat-label">时代契合</span>
                      <span className="sandbox-map__focal-stat-value">{selected.project.radar.era_fit}</span>
                    </div>
                    <div className="sandbox-map__focal-stat">
                      <span className="sandbox-map__focal-stat-label">Boss 匹配</span>
                      <span className="sandbox-map__focal-stat-value">{selected.project.radar.boss_match}</span>
                    </div>
                    <div className="sandbox-map__focal-stat">
                      <span className="sandbox-map__focal-stat-label">技术突破</span>
                      <span className="sandbox-map__focal-stat-value">{selected.project.radar.tech_breakthrough}</span>
                    </div>
                  </div>

                  <div className="sandbox-map__focal-band">
                    <div className="sandbox-map__focal-band-title">当前标签语义</div>
                    <div className="sandbox-map__stage-chip-cloud">
                      {selected.project.tags.length > 0 ? selected.project.tags.map(tag => (
                        <span key={tag} className="sandbox-map__boss-tag">{tag}</span>
                      )) : (
                        <span className="sandbox-map__boss-tag">尚未设置标签</span>
                      )}
                    </div>
                  </div>

                  {!isEditing && selected.project.recommendation && (
                    <div className="sandbox-map__focal-band">
                      <div className="sandbox-map__focal-band-title">当前战略建议</div>
                      <div className="sandbox-map__stage-note-list">
                        <div className="sandbox-map__stage-note-item">{selected.project.recommendation}</div>
                      </div>
                    </div>
                  )}
                </SystemStagePanel>
              }
              rightRail={
                <>
                  <SystemStagePanel
                    eyebrow="linked rooms"
                    title="神经元联动"
                    description="一颗项目神经元会继续影响推演、突触与 Boss 判断。"
                  >
                    <SystemStageFlowItem
                      title="推演室"
                      value="多角色推演"
                      description="去看这颗神经元在红蓝军对抗里会被如何质询。"
                      actionLabel="open"
                      tone="accent"
                      onClick={() => navigateSandboxTab('warroom')}
                    />
                    <SystemStageFlowItem
                      title="突触"
                      value="跨项目连接"
                      description="检查它和其他项目之间已经形成了哪些高价值连接。"
                      actionLabel="open"
                      onClick={() => navigateSandboxTab('synapses')}
                    />
                    <SystemStageFlowItem
                      title="Boss"
                      value="主脑偏好"
                      description="回到 Boss，观察这颗神经元为何会被偏爱或被否决。"
                      actionLabel="open"
                      onClick={() => navigateSandboxTab('boss')}
                    />
                  </SystemStagePanel>

                  <SystemStagePanel
                    eyebrow="current pressure"
                    title="当前压力点"
                    description="真正应该先看的不是所有信息，而是最可能让项目变强或出问题的地方。"
                  >
                    <SystemStageFlowItem
                      title="最大短板"
                      description={selected.taxonomy?.analysis?.weaknesses[0] || '等待分类分析'}
                      tone="danger"
                    />
                    <SystemStageFlowItem
                      title="最大机会"
                      description={selected.taxonomy?.analysis?.opportunities[0] || '等待分类分析'}
                      tone="success"
                    />
                    <SystemStageFlowItem
                      title="最强推演记录"
                      description={selected.project.warLogs[0]?.verdict || '暂无推演日志'}
                      meta={selected.project.warLogs[0]?.role || '等待推演'}
                      tone="warning"
                    />
                  </SystemStagePanel>
                </>
              }
            />

            <div className="sandbox-map__grid">
            {/* 编辑/查看切换 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '4px' }}>
              {isEditing ? (
                <>
                  <button className="sandbox-map__action-btn" onClick={cancelEdit} disabled={isSaving}>
                    取消
                  </button>
                  <button className="sandbox-map__action-btn sandbox-map__action-btn--primary" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? '保存中...' : '💾 保存'}
                  </button>
                </>
              ) : (
                <button className="sandbox-map__action-btn" onClick={startEdit}>
                  ✏️ 编辑
                </button>
              )}
            </div>

            {/* 可编辑字段 */}
            {isEditing ? (
              <CollapsibleSection title="编辑项目信息" defaultOpen={true}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hd-space-sm)' }}>
                  <div>
                    <label className="hd-label" style={{ marginBottom: '4px', display: 'block' }}>标题</label>
                    <input className="sandbox-map__edit-input" value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      placeholder="项目标题" />
                  </div>
                  <div>
                    <label className="hd-label" style={{ marginBottom: '4px', display: 'block' }}>一句话描述</label>
                    <input className="sandbox-map__edit-input" value={editOneLiner}
                      onChange={e => setEditOneLiner(e.target.value)}
                      placeholder="一句话概括项目" />
                  </div>
                  <div>
                    <label className="hd-label" style={{ marginBottom: '4px', display: 'block' }}>标签（逗号分隔）</label>
                    <input className="sandbox-map__edit-input" value={editTags}
                      onChange={e => setEditTags(e.target.value)}
                      placeholder="标签1, 标签2, ..." />
                  </div>
                  <div>
                    <label className="hd-label" style={{ marginBottom: '4px', display: 'block' }}>摘要</label>
                    <textarea className="sandbox-map__edit-textarea" value={editSummary}
                      onChange={e => setEditSummary(e.target.value)}
                      placeholder="项目摘要..."
                      rows={4} />
                  </div>
                  <div>
                    <label className="hd-label" style={{ marginBottom: '4px', display: 'block' }}>战略建议</label>
                    <textarea className="sandbox-map__edit-textarea" value={editRecommendation}
                      onChange={e => setEditRecommendation(e.target.value)}
                      placeholder="战略建议..."
                      rows={3} />
                  </div>
                </div>
              </CollapsibleSection>
            ) : (
              <>
                {/* 六维雷达 */}
                <CollapsibleSection title={`六维雷达 — ${selected.project.title}`} defaultOpen={true}>
                  <HexRadar data={selectedRadar} size={300} />
                  <div style={{ textAlign: 'center', marginTop: 'var(--hd-space-sm)' }}>
                    <span className={`sandbox-map__survival ${
                      selected.project.survivalRate >= 75 ? 'sandbox-map__survival--high' :
                      selected.project.survivalRate >= 50 ? 'sandbox-map__survival--mid' :
                      'sandbox-map__survival--low'
                    }`}>
                      {selected.project.survivalRate}% [{selected.project.survivalGrade}]
                    </span>
                  </div>
                </CollapsibleSection>
              </>
            )}

            {/* 推演日志 — 始终只读 */}
            <CollapsibleSection title="红蓝军推演日志" defaultOpen={false}
              count={selected.project.warLogs.length}
            >
              <TerminalBlock title="WAR ROOM">
                {selected.project.warLogs.length > 0 ? (
                  selected.project.warLogs.map((log, i) => (
                    <div key={i}>
                      <span className="terminal-prompt">[{log.role}] {log.verdict}</span>
                    </div>
                  ))
                ) : (
                  <div>
                    <span style={{ color: 'var(--hd-text-muted)' }}>无推演日志</span>
                  </div>
                )}
                {selected.project.summary && !isEditing && (
                  <div style={{ marginTop: 8 }}>
                    <span style={{ color: 'var(--hd-success)' }}>✦ {selected.project.summary}</span>
                  </div>
                )}
              </TerminalBlock>
            </CollapsibleSection>

            {/* 分类信息 — 始终只读 */}
            <CollapsibleSection title="项目分类" defaultOpen={true}>
              {selected.taxonomy ? (
                <div style={{ fontFamily: 'var(--hd-font-mono)', fontSize: '0.8rem', lineHeight: 2, color: 'var(--hd-text-secondary)' }}>
                  <div>🏭 行业：<span style={{ color: 'var(--hd-text-primary)' }}>{selected.taxonomy.taxonomy.industry} / {selected.taxonomy.taxonomy.subIndustry}</span></div>
                  <div>💡 商业模式：<span style={{ color: 'var(--hd-text-primary)' }}>{selected.taxonomy.taxonomy.businessModel}</span></div>
                  <div>📦 市场规模：<span style={{ color: 'var(--hd-text-primary)' }}>{selected.taxonomy.taxonomy.marketSize}</span></div>
                  <div>🚀 创新类型：<span style={{ color: 'var(--hd-text-primary)' }}>{selected.taxonomy.taxonomy.innovationType}</span></div>
                  <div>⏱ 上线周期：<span style={{ color: 'var(--hd-text-primary)' }}>{selected.taxonomy.taxonomy.timeToMarket}</span></div>
                  <div>📊 资源需求：<span style={{ color: 'var(--hd-text-primary)' }}>{selected.taxonomy.taxonomy.resourceRequirements}</span></div>
                  <div>🎯 复杂度：<span style={{ color: 'var(--hd-text-primary)' }}>{selected.taxonomy.taxonomy.complexity}/100</span></div>
                </div>
              ) : (
                <EmptyState icon="📊" title="尚未分类" description="重新推演项目可自动生成分类" />
              )}
            </CollapsibleSection>

            {/* SWOT 分析 — 始终只读 */}
            <CollapsibleSection title="SWOT 分析" defaultOpen={true}>
              {selected.taxonomy?.analysis ? (
                <div className="sandbox-map__swot">
                  <div className="sandbox-map__swot-quadrant sandbox-map__swot--strengths">
                    <div className="sandbox-map__swot-label">优势</div>
                    {selected.taxonomy.analysis.strengths.map((s, i) => (
                      <div key={i}>+ {s}</div>
                    ))}
                  </div>
                  <div className="sandbox-map__swot-quadrant sandbox-map__swot--weaknesses">
                    <div className="sandbox-map__swot-label">劣势</div>
                    {selected.taxonomy.analysis.weaknesses.map((w, i) => (
                      <div key={i}>- {w}</div>
                    ))}
                  </div>
                  <div className="sandbox-map__swot-quadrant sandbox-map__swot--opportunities">
                    <div className="sandbox-map__swot-label">机会</div>
                    {selected.taxonomy.analysis.opportunities.map((o, i) => (
                      <div key={i}>* {o}</div>
                    ))}
                  </div>
                  <div className="sandbox-map__swot-quadrant sandbox-map__swot--threats">
                    <div className="sandbox-map__swot-label">威胁</div>
                    {selected.taxonomy.analysis.threats.map((t, i) => (
                      <div key={i}>! {t}</div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState icon="🎯" title="需要分类分析" description="完成项目分类后自动生成 SWOT" />
              )}
            </CollapsibleSection>

            {/* 时代潜力评分 — 始终只读 */}
            {selected.taxonomy?.analysis && (
              <CollapsibleSection title="时代潜力评分" defaultOpen={true}>
                <div style={{ display: 'flex', gap: 'var(--hd-space-lg)', justifyContent: 'center', padding: 'var(--hd-space-md)' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--hd-font-display)', fontSize: '2rem', fontWeight: 900, color: 'var(--hd-accent-cyan)' }}>
                      {selected.taxonomy.analysis.eraRelevance}
                    </div>
                    <div className="hd-label">时代相关性</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--hd-font-display)', fontSize: '2rem', fontWeight: 900, color: 'var(--hd-success)' }}>
                      {selected.taxonomy.analysis.breakthroughPotential}
                    </div>
                    <div className="hd-label">突破潜力</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--hd-font-display)', fontSize: '2rem', fontWeight: 900, color: 'var(--hd-warning)' }}>
                      {selected.taxonomy.analysis.differentiation}
                    </div>
                    <div className="hd-label">差异化</div>
                  </div>
                </div>
              </CollapsibleSection>
            )}

            {/* 战略建议 — 只读展示（非编辑模式时） */}
            {!isEditing && selected.project.recommendation && (
              <CollapsibleSection title="战略建议" defaultOpen={true}>
                <p style={{ fontSize: '0.85rem', lineHeight: 1.8, color: 'var(--hd-text-secondary)' }}>
                  {selected.project.recommendation}
                </p>
              </CollapsibleSection>
            )}

            {/* Agent 视角评估 */}
            {agents.length > 0 && !isEditing && (
              <CollapsibleSection title="Agent 视角评估" defaultOpen={false}>
                <div style={{ display: 'flex', gap: 'var(--hd-space-sm)', marginBottom: 'var(--hd-space-sm)', alignItems: 'center' }}>
                  <select
                    style={{
                      fontSize: '0.78rem',
                      background: 'var(--hd-bg-deep)',
                      color: 'var(--hd-text-secondary)',
                      border: '1px solid var(--hd-border)',
                      borderRadius: 'var(--hd-radius-sm)',
                      padding: '4px 8px',
                      flex: 1,
                      cursor: 'pointer',
                    }}
                    value={perspectiveAgentId}
                    onChange={e => { setPerspectiveAgentId(e.target.value); setPerspectiveText('') }}
                  >
                    <option value="">选择 Agent...</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
                    ))}
                  </select>
                  <button
                    style={{
                      fontSize: '0.78rem',
                      padding: '4px 12px',
                      background: 'var(--hd-accent-cyan)',
                      color: 'var(--hd-bg-deep)',
                      border: 'none',
                      borderRadius: 'var(--hd-radius-sm)',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                    disabled={!perspectiveAgentId || perspectiveLoading}
                    onClick={async () => {
                      if (!perspectiveAgentId) return
                      setPerspectiveLoading(true)
                      setPerspectiveText('')
                      try {
                        const text = await getAgentPerspective(perspectiveAgentId, selected.project)
                        setPerspectiveText(text)
                      } catch (err) {
                        setPerspectiveText(`评估失败: ${String(err)}`)
                      }
                      setPerspectiveLoading(false)
                    }}
                  >
                    {perspectiveLoading ? '⏳ 评估中...' : '评估'}
                  </button>
                </div>
                {perspectiveText && (
                  <div style={{
                    background: 'var(--hd-bg-deep)',
                    border: '1px solid var(--hd-border)',
                    padding: 'var(--hd-space-md)',
                    borderRadius: 'var(--hd-radius-sm)',
                    fontSize: '0.82rem',
                    lineHeight: 1.8,
                    color: 'var(--hd-text-secondary)',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {perspectiveText}
                  </div>
                )}
              </CollapsibleSection>
            )}
            </div>
          </div>
        ) : (
          <EmptyState icon="🔮" title="选择一个神经元查看详情" />
        )}
      </div>
    </>
  )
}
