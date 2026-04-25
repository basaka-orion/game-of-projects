import { useState } from 'react'
import GridCard from '../../../components/GridCard'
import SearchStatsBar from '../../../components/SearchStatsBar'
import EmptyState from '../../../components/EmptyState'
import CollapsibleSection from '../../../components/CollapsibleSection'
import NetworkGraph from '../NetworkGraph'
import { NeuronData } from '../SandboxMap'
import { SynapseRow, dbDeleteAllSynapses, dbSaveSynapse } from '../../../lib/db/repository'
import { batchComputeSynapses, SynapseInput, SynapseType } from '../../../lib/synapse/scorer'
import { generateHybridIdeas, HybridIdea } from '../../../lib/synapse/innovator'
import { LLMConfig } from '../../../lib/ai/provider'
import { findStructuralHoles, innovateOnStructuralHoles, StructuralHole, InnovationResult } from '../../../lib/memory/structural-holes'

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    complementary: '#00d4aa', sequential: '#6366f1', synergistic: '#f59e0b',
    conflicting: '#ef4444', inspiration: '#a78bfa', 'skill-transfer': '#06b6d4',
  }
  return colors[type] || '#666'
}

interface SynapsesTabProps {
  neurons: NeuronData[]
  synapses: SynapseRow[]
  setSynapses: (s: SynapseRow[]) => void
  synapseScanning: boolean
  setSynapseScanning: (v: boolean) => void
  synapseProgress: string
  setSynapseProgress: (v: string) => void
  hybridIdeas: HybridIdea[]
  setHybridIdeas: (v: HybridIdea[]) => void
  selectedSynapse: SynapseRow | null
  setSelectedSynapse: (v: SynapseRow | null) => void
  selectedId: string | null
  setSelectedId: (v: string | null) => void
  getLLMConfig: () => LLMConfig
}

export default function SynapsesTab({
  neurons, synapses, setSynapses,
  synapseScanning, setSynapseScanning,
  synapseProgress, setSynapseProgress,
  hybridIdeas, setHybridIdeas,
  selectedSynapse, setSelectedSynapse,
  selectedId, setSelectedId,
  getLLMConfig,
}: SynapsesTabProps) {
  const typeBreakdown = synapses.reduce<Record<string, number>>((acc, s) => {
    acc[s.type] = (acc[s.type] || 0) + 1
    return acc
  }, {})

  return (
    <div className="sandbox-map__synapse-view">
      <SearchStatsBar
        searchValue=""
        onSearchChange={() => {}}
        placeholder=""
        stats={[
          { label: '突触', value: synapses.length },
          ...Object.entries(typeBreakdown).map(([type, count]) => ({
            label: type,
            value: count,
            color: getTypeColor(type),
          })),
        ]}
        actions={
          <button
            className="sandbox-map__scan-btn"
            onClick={async () => {
              if (synapseScanning || neurons.length < 2) return
              setSynapseScanning(true)
              setSynapseProgress('准备中...')
              try {
                await dbDeleteAllSynapses()
                const inputs: SynapseInput[] = neurons
                  .filter(n => n.taxonomy)
                  .map(n => ({
                    id: n.project.id,
                    title: n.project.title,
                    oneLiner: n.project.oneLiner,
                    taxonomy: n.taxonomy!.taxonomy,
                    analysis: n.taxonomy!.analysis,
                  }))
                if (inputs.length < 2) {
                  setSynapseProgress('需要至少 2 个已完成分类的项目')
                  setSynapseScanning(false)
                  return
                }
                const results = await batchComputeSynapses(
                  getLLMConfig(),
                  inputs,
                  (done, total) => setSynapseProgress(`扫描中 ${done}/${total}...`)
                )
                for (const s of results) {
                  await dbSaveSynapse(s.sourceId, s.targetId, s.type, s.strength, s.reason, s.actionItems)
                }
                setSynapses(results.map(s => ({
                  id: '',
                  source_id: s.sourceId,
                  target_id: s.targetId,
                  type: s.type,
                  strength: s.strength,
                  reason: s.reason,
                  action_items_json: JSON.stringify(s.actionItems),
                  created_at: new Date().toISOString(),
                })))
                setSynapseProgress(`发现 ${results.length} 条突触连接`)
              } catch (err) {
                setSynapseProgress(`扫描失败: ${(err as Error).message}`)
              }
              setSynapseScanning(false)
            }}
            disabled={synapseScanning || neurons.length < 2}
          >
            {synapseScanning ? synapseProgress : '扫描突触'}
          </button>
        }
      />

      {/* 网络图 */}
      <CollapsibleSection title="神经元网络图" defaultOpen={true}>
        <div className="sandbox-map__network-panel" style={{ margin: 0 }}>
          {neurons.length >= 2 ? (
            <NetworkGraph
              projects={neurons.map(n => ({
                id: n.project.id,
                title: n.project.title,
                survivalRate: n.project.survivalRate,
                survivalGrade: n.project.survivalGrade,
                industry: n.taxonomy?.taxonomy.industry,
              }))}
              synapses={synapses}
              selectedId={selectedId}
              onSelectNode={setSelectedId}
              width={760}
              height={480}
            />
          ) : (
            <EmptyState icon="🔗" title="需要更多项目" description="至少 2 个已评估的项目才能生成网络图" />
          )}
        </div>
      </CollapsibleSection>

      {/* 突触列表 */}
      <CollapsibleSection title="突触连接" defaultOpen={true} count={synapses.length}>
        {synapses.length === 0 ? (
          <EmptyState icon="🔗" title="尚未发现突触" description="点击扫描按钮发现项目间的连接" />
        ) : (
          <div className="sandbox-map__synapse-list" style={{ marginTop: 'var(--hd-space-sm)' }}>
            {synapses.map((s, i) => {
              const sourceName = neurons.find(n => n.project.id === s.source_id)?.project.title || s.source_id
              const targetName = neurons.find(n => n.project.id === s.target_id)?.project.title || s.target_id
              return (
                <div
                  key={i}
                  className={`sandbox-map__synapse-card ${selectedSynapse === s ? 'sandbox-map__synapse-card--selected' : ''}`}
                  onClick={() => setSelectedSynapse(s === selectedSynapse ? null : s)}
                >
                  <div className="sandbox-map__synapse-header">
                    <span className="sandbox-map__synapse-type" style={{ borderColor: getTypeColor(s.type), color: getTypeColor(s.type) }}>
                      {s.type}
                    </span>
                    <span className="sandbox-map__synapse-strength">{Math.round(s.strength)}%</span>
                  </div>
                  <div className="sandbox-map__synapse-pair">
                    {sourceName} ↔ {targetName}
                  </div>
                  {s.reason && (
                    <div className="sandbox-map__synapse-reason">{s.reason}</div>
                  )}
                  {selectedSynapse === s && (
                    <div className="sandbox-map__synapse-detail">
                      {(() => {
                        const items = JSON.parse(s.action_items_json || '[]') as string[]
                        return items.length > 0 ? (
                          <div>
                            <div className="hd-label" style={{ marginBottom: 4 }}>行动建议</div>
                            {items.map((item, j) => (
                              <div key={j} style={{ fontSize: '0.8rem', color: 'var(--hd-text-secondary)', paddingLeft: 8 }}>
                              * {item}
                              </div>
                            ))}
                            <button
                              className="sandbox-map__hybrid-btn"
                              onClick={async (e) => {
                                e.stopPropagation()
                                const src = neurons.find(n => n.project.id === s.source_id)
                                const tgt = neurons.find(n => n.project.id === s.target_id)
                                if (!src?.taxonomy || !tgt?.taxonomy) return
                                const ideas = await generateHybridIdeas(
                                  getLLMConfig(),
                                  { id: src.project.id, title: src.project.title, oneLiner: src.project.oneLiner, taxonomy: src.taxonomy.taxonomy, analysis: src.taxonomy.analysis },
                                  { id: tgt.project.id, title: tgt.project.title, oneLiner: tgt.project.oneLiner, taxonomy: tgt.taxonomy.taxonomy, analysis: tgt.taxonomy.analysis },
                                  s.type
                                )
                                setHybridIdeas(ideas)
                              }}
                            >
                              探索混合创新
                            </button>
                          </div>
                        ) : null
                      })()}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CollapsibleSection>

      {/* 混合创新 */}
      {hybridIdeas.length > 0 && (
        <CollapsibleSection title="混合创新想法" defaultOpen={true} count={hybridIdeas.length}>
          <div className="sandbox-map__hybrid-ideas">
            {hybridIdeas.map((idea, i) => (
              <GridCard key={i} title={idea.title} accent={idea.excitement >= 70}>
                <div style={{ fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--hd-text-secondary)' }}>
                  <div>{idea.oneLiner}</div>
                  <div style={{ marginTop: 4 }}>{idea.description}</div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 'var(--hd-space-md)' }}>
                    <span style={{ color: 'var(--hd-success)' }}>可行性 {idea.feasibility}%</span>
                    <span style={{ color: 'var(--hd-accent-cyan)' }}>兴奋度 {idea.excitement}%</span>
                    <span style={{ color: 'var(--hd-warning)' }}>投入 {idea.effort}</span>
                  </div>
                  {idea.whyNow && (
                    <div style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--hd-text-muted)' }}>
                      为什么是现在：{idea.whyNow}
                    </div>
                  )}
                </div>
              </GridCard>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* 灵感涌现 */}
      <CollapsibleSection title="灵感涌现" defaultOpen={false}>
        <InspirationEmergencePanel getLLMConfig={getLLMConfig} onIdeasGenerated={setHybridIdeas} />
      </CollapsibleSection>
    </div>
  )
}

// ─── 灵感涌现面板 ───

function InspirationEmergencePanel({
  getLLMConfig,
  onIdeasGenerated,
}: {
  getLLMConfig: () => LLMConfig
  onIdeasGenerated: (ideas: HybridIdea[]) => void
}) {
  const [holes, setHoles] = useState<StructuralHole[]>([])
  const [innovations, setInnovations] = useState<InnovationResult[]>([])
  const [scanning, setScanning] = useState(false)
  const [innovating, setInnovating] = useState(false)
  const [status, setStatus] = useState('')

  const scanHoles = async () => {
    setScanning(true)
    setStatus('扫描知识图谱中的结构洞...')
    try {
      const found = await findStructuralHoles()
      setHoles(found)
      setStatus(found.length > 0 ? `发现 ${found.length} 个结构洞` : '未发现结构洞（需要更多知识三元组）')
    } catch (err) {
      setStatus(`扫描失败: ${(err as Error).message}`)
    }
    setScanning(false)
  }

  const innovate = async () => {
    if (holes.length === 0) return
    setInnovating(true)
    setStatus('正在跨领域混合创新...')
    try {
      const results = await innovateOnStructuralHoles(holes, 3)
      setInnovations(results)
      const allIdeas = results.flatMap(r => r.ideas)
      if (allIdeas.length > 0) {
        onIdeasGenerated(allIdeas)
      }
      setStatus(`生成了 ${allIdeas.length} 个跨界创新想法`)
    } catch (err) {
      setStatus(`创新失败: ${(err as Error).message}`)
    }
    setInnovating(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hd-space-md)' }}>
      <div style={{ display: 'flex', gap: 'var(--hd-space-sm)', alignItems: 'center' }}>
        <button
          className="sandbox-map__scan-btn"
          onClick={scanHoles}
          disabled={scanning}
        >
          {scanning ? '扫描中...' : '扫描结构洞'}
        </button>
        {holes.length > 0 && (
          <button
            className="sandbox-map__scan-btn"
            onClick={innovate}
            disabled={innovating}
          >
            {innovating ? '创新中...' : '生成跨界创新'}
          </button>
        )}
        {status && <span style={{ fontSize: '0.8rem', color: 'var(--hd-text-secondary)' }}>{status}</span>}
      </div>

      {holes.length > 0 && (
        <div style={{ display: 'grid', gap: 'var(--hd-space-sm)' }}>
          {holes.map((hole, i) => (
            <div
              key={i}
              className="sandbox-map__synapse-card"
              style={{ cursor: 'default' }}
            >
              <div className="sandbox-map__synapse-header">
                <span className="sandbox-map__synapse-type" style={{ borderColor: '#a78bfa', color: '#a78bfa' }}>
                  结构洞
                </span>
                <span className="sandbox-map__synapse-strength">{hole.bridgePotential}%</span>
              </div>
              <div className="sandbox-map__synapse-pair">
                {hole.topicA} ↔ {hole.topicB}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--hd-text-muted)', marginTop: 4 }}>
                {hole.sharedContext}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--hd-text-muted)', marginTop: 2 }}>
                簇A: {hole.clusterA.slice(0, 3).join(', ')} | 簇B: {hole.clusterB.slice(0, 3).join(', ')}
              </div>
            </div>
          ))}
        </div>
      )}

      {innovations.length > 0 && (
        <div style={{ display: 'grid', gap: 'var(--hd-space-sm)' }}>
          {innovations.map((result, i) => (
            <div key={i}>
              <div style={{ fontSize: '0.8rem', color: 'var(--hd-accent-cyan)', marginBottom: 4 }}>
                {result.hole.topicA} x {result.hole.topicB}:
              </div>
              {result.ideas.map((idea, j) => (
                <div key={j} style={{ fontSize: '0.85rem', color: 'var(--hd-text-secondary)', paddingLeft: 8, marginBottom: 4 }}>
                  <strong>{idea.title}</strong> — {idea.oneLiner}
                  <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'var(--hd-success)' }}>
                    可行{idea.feasibility}%
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
