/**
 * MemoryTab — MemPalace 三列宫殿浏览器
 *
 * 左列: Wing 翼楼列表
 * 中列: Hall 大厅列表
 * 右列: Drawer 抽屉内容
 */
import { useState, useEffect, useCallback } from 'react'
import EmptyState from '../../../components/EmptyState'
import {
  getPalaceOverview,
  getHalls,
  getHallDrawers,
  palaceSearch,
  memorize,
  migrateFromLegacy,
  type PalaceOverview,
  type WingInfo,
  type HallInfo,
} from '../../../lib/memory/mempalace'
import { deleteDrawer, type Drawer } from '../../../lib/knowledge/drawer'
import { navigateSandboxTab } from '../navigation'
import { SystemStageFlowItem, SystemStagePanel, SystemStageShell } from '../components/SystemStage'

export default function MemoryTab() {
  const [overview, setOverview] = useState<PalaceOverview | null>(null)
  const [selectedWing, setSelectedWing] = useState<string | null>(null)
  const [halls, setHalls] = useState<HallInfo[]>([])
  const [selectedHall, setSelectedHall] = useState<string | null>(null)
  const [drawers, setDrawers] = useState<Drawer[]>([])
  const [expandedDrawer, setExpandedDrawer] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<Drawer & { score: number }>>([])
  const [quickAddText, setQuickAddText] = useState('')
  const [migrating, setMigrating] = useState(false)

  // 加载总览
  const loadOverview = useCallback(async () => {
    const ov = await getPalaceOverview()
    setOverview(ov)
    // 自动选择第一个有内容的翼楼
    if (!selectedWing && ov.wings.length > 0) {
      const firstActive = ov.wings.find(w => w.drawerCount > 0) || ov.wings[0]
      setSelectedWing(firstActive.name)
    }
  }, [selectedWing])

  useEffect(() => { loadOverview() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 加载 Halls
  useEffect(() => {
    if (!selectedWing) return
    getHalls(selectedWing).then(h => {
      setHalls(h)
      setSelectedHall(null)
      setDrawers([])
      setExpandedDrawer(null)
      if (h.length > 0) setSelectedHall(h[0].name)
    })
  }, [selectedWing])

  // 加载 Drawers
  useEffect(() => {
    if (!selectedWing || !selectedHall) return
    getHallDrawers(selectedWing, selectedHall).then(setDrawers)
  }, [selectedWing, selectedHall])

  // 搜索
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    const results = await palaceSearch(searchQuery, 15)
    setSearchResults(results)
  }

  // 快速记忆
  const handleQuickAdd = async () => {
    if (!quickAddText.trim()) return
    await memorize({
      content: quickAddText,
      wing: selectedWing || undefined,
      hall: selectedHall || undefined,
    })
    setQuickAddText('')
    // 刷新
    loadOverview()
    if (selectedWing && selectedHall) {
      getHallDrawers(selectedWing, selectedHall).then(setDrawers)
    }
  }

  // 删除抽屉
  const handleDelete = async (id: string) => {
    await deleteDrawer(id)
    setDrawers(prev => prev.filter(d => d.id !== id))
    loadOverview()
  }

  // 迁移旧数据
  const handleMigrate = async () => {
    setMigrating(true)
    try {
      const result = await migrateFromLegacy()
      alert(`迁移完成：${result.migrated} 条记忆已导入\n${result.errors.length > 0 ? `错误: ${result.errors.length}` : ''}`)
      loadOverview()
    } finally {
      setMigrating(false)
    }
  }

  const wingMeta: Record<string, { icon: string }> = {
    'experience': { icon: '⚔️' },
    'knowledge': { icon: '📚' },
    'insight': { icon: '💡' },
    'identity': { icon: '👑' },
    'emotion': { icon: '💭' },
    'default': { icon: '📦' },
  }

  return (
    <div className="sandbox-map__memory-view sandbox-map__stage-view" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SystemStageShell
        eyebrow="memory palace"
        title="记忆宫殿应该像一座可以走进去的建筑，而不是后台数据表"
        description="这里先告诉你当前站在哪个翼楼、要怎么回忆、这批记忆又会继续喂给谁。用户先有方向，再进入抽屉。"
        metrics={[
          { label: '记忆抽屉', value: overview?.totalDrawers || 0, detail: '已沉淀的记忆单元' },
          { label: '翼楼', value: overview?.totalWings || 0, detail: '记忆主区' },
          { label: '大厅', value: overview?.totalHalls || 0, detail: '主题房间' },
          { label: '待编译', value: overview?.uncompiledCount || 0, detail: '尚未整理成知识', tone: (overview?.uncompiledCount || 0) > 0 ? 'warning' : 'default' },
        ]}
        actions={[
          { label: migrating ? '迁移中...' : '导入旧记忆', onClick: handleMigrate, variant: 'primary' },
          { label: '查看 Boss', onClick: () => navigateSandboxTab('boss') },
        ]}
        leftRail={
          <>
            <SystemStagePanel
              eyebrow="terrain"
              title="当前所在"
              description="先知道自己在哪个翼楼和大厅，浏览才有真正的空间感。"
            >
              <SystemStageFlowItem
                title="翼楼"
                value={selectedWing || '未选择'}
                description={selectedWing ? `${wingMeta[selectedWing]?.icon || '🏛️'} ${selectedWing}` : '等待选择一个翼楼'}
                tone="accent"
              />
              <SystemStageFlowItem
                title="大厅"
                value={selectedHall || '未选择'}
                description={selectedHall ? `${drawers.length} 个抽屉正在等待浏览` : '先进入某个大厅'}
              />
              <SystemStageFlowItem
                title="展开抽屉"
                value={expandedDrawer ? '1' : '0'}
                description={expandedDrawer ? '你正在阅读一个具体记忆' : '当前仍在浏览外层结构'}
                tone="success"
              />
            </SystemStagePanel>

            <SystemStagePanel
              eyebrow="wings"
              title="主翼楼"
              description="优先把地形感知出来，比先看长列表重要得多。"
            >
              {(overview?.wings || []).slice(0, 5).map(wing => (
                <SystemStageFlowItem
                  key={wing.name}
                  title={`${wingMeta[wing.name]?.icon || '🏛️'} ${wing.name}`}
                  value={wing.drawerCount}
                  description={`${wing.hallCount} 个大厅`}
                  tone={selectedWing === wing.name ? 'accent' : 'default'}
                  actionLabel="open"
                  onClick={() => setSelectedWing(wing.name)}
                />
              ))}
            </SystemStagePanel>
          </>
        }
        centerRail={
          <SystemStagePanel
            eyebrow="recall interface"
            title={selectedWing ? `${wingMeta[selectedWing]?.icon || '🏛️'} ${selectedWing}` : '选择一个翼楼开始浏览'}
            description={selectedHall ? `当前正在 ${selectedHall} 中浏览抽屉。这里把搜索、快速沉淀和当前房间状态放到一个中轴里。` : '选中大厅后，这里会更像一间真正可以工作的记忆中控室。'}
            focal
            tone="accent"
          >
            <div className="sandbox-map__memory-search-shell">
              <input
                className="sandbox-map__memory-search-input"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
                placeholder="搜索记忆宫殿..."
              />
              <button className="sandbox-map__scan-btn" disabled={!searchQuery.trim()} onClick={handleSearch}>
                回忆
              </button>
            </div>

            <div className="sandbox-map__focal-stats">
              <div className="sandbox-map__focal-stat">
                <span className="sandbox-map__focal-stat-label">搜索命中</span>
                <span className="sandbox-map__focal-stat-value">{searchResults.length}</span>
              </div>
              <div className="sandbox-map__focal-stat">
                <span className="sandbox-map__focal-stat-label">快速记忆</span>
                <span className="sandbox-map__focal-stat-value">{quickAddText.trim() ? '准备写入' : '等待输入'}</span>
              </div>
              <div className="sandbox-map__focal-stat">
                <span className="sandbox-map__focal-stat-label">未编译</span>
                <span className="sandbox-map__focal-stat-value">{overview?.uncompiledCount || 0}</span>
              </div>
            </div>

            <div className="sandbox-map__memory-quick-add">
              <input
                type="text"
                value={quickAddText}
                onChange={e => setQuickAddText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleQuickAdd() }}
                placeholder="把一个念头直接存进当前大厅..."
                className="sandbox-map__memory-search-input"
              />
              <button className="sandbox-map__scan-btn" onClick={handleQuickAdd} disabled={!quickAddText.trim()}>
                入宫
              </button>
            </div>
          </SystemStagePanel>
        }
        rightRail={
          <>
            <SystemStagePanel
              eyebrow="linked rooms"
              title="宫殿联动"
              description="记忆不是终点，它会继续牵动 Boss、知识整理和画像校准。"
            >
              <SystemStageFlowItem
                title="Boss Core"
                value="吸收路径"
                description="查看这批记忆如何被 Boss 的认知操作系统再翻译。"
                actionLabel="open"
                tone="accent"
                onClick={() => navigateSandboxTab('boss')}
              />
              <SystemStageFlowItem
                title="知识库"
                value="编译记忆"
                description="把记忆进一步整理成结构化知识和可检索页面。"
                actionLabel="open"
                onClick={() => navigateSandboxTab('knowledge')}
              />
              <SystemStageFlowItem
                title="画像工坊"
                value="反向校准"
                description="看这批记忆如何反向塑造系统主画像。"
                actionLabel="open"
                onClick={() => navigateSandboxTab('profiling')}
              />
            </SystemStagePanel>

            <SystemStagePanel
              eyebrow="search recall"
              title="最近回忆结果"
              description="搜索命中不再躲在折叠区里，而是直接回到主舞台。"
            >
              {searchResults.length > 0 ? (
                searchResults.slice(0, 4).map(result => (
                  <SystemStageFlowItem
                    key={result.id}
                    title={result.title || result.rawContent.slice(0, 32)}
                    value={Math.round(result.score)}
                    description={`${wingMeta[result.wing]?.icon || '🏛️'} ${result.wing} / ${result.hall}`}
                    meta="点击跳到对应抽屉"
                    tone="success"
                    actionLabel="jump"
                    onClick={() => {
                      setSelectedWing(result.wing)
                      setSelectedHall(result.hall)
                      setExpandedDrawer(result.id)
                      setSearchResults([])
                    }}
                  />
                ))
              ) : (
                <EmptyState icon="🪞" title="还没有回忆结果" description="输入关键词并点击“回忆”，命中结果会先出现在这里。" />
              )}
            </SystemStagePanel>
          </>
        }
        footer={
          <div className="sandbox-map__stage-footer-grid">
            {searchResults.length > 0 && (
              <SystemStagePanel
                eyebrow="search archive"
                title="完整搜索结果"
                description="这里保留所有命中，方便连续跳转和复盘。"
              >
                <div className="sandbox-map__memory-list">
                  {searchResults.map(result => (
                    <div
                      key={result.id}
                      className="sandbox-map__memory-item sandbox-map__memory-item--interactive"
                      onClick={() => {
                        setSelectedWing(result.wing)
                        setSelectedHall(result.hall)
                        setExpandedDrawer(result.id)
                        setSearchResults([])
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--hd-space-xs)' }}>
                        <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>
                          {wingMeta[result.wing]?.icon || '🏛️'} {result.wing}/{result.hall}
                        </span>
                      </div>
                      <span className="sandbox-map__memory-content">{result.title || result.rawContent.slice(0, 100)}</span>
                      <span className="sandbox-map__memory-confidence">得分 {Math.round(result.score)}</span>
                    </div>
                  ))}
                </div>
              </SystemStagePanel>
            )}

            <SystemStagePanel
              eyebrow="palace browser"
              title="宫殿浏览器"
              description="左边选翼楼，中间选大厅，右边阅读抽屉。这才像一座真正可以行走的宫殿。"
            >
              <div className="sandbox-map__memory-browser-grid">
                <div className="sandbox-map__memory-browser-column sandbox-map__memory-browser-column--split">
                  <div className="sandbox-map__memory-browser-label">翼楼 Wings</div>
                  {(overview?.wings || []).map(wing => (
                    <div
                      key={wing.name}
                      className={`sandbox-map__room-card ${selectedWing === wing.name ? 'sandbox-map__room-card--selected' : ''}`}
                      onClick={() => setSelectedWing(wing.name)}
                      style={{ marginBottom: 'var(--hd-space-xs)', padding: 'var(--hd-space-sm)', cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--hd-space-xs)' }}>
                        <span>{wingMeta[wing.name]?.icon || '🏛️'}</span>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{wing.name}</span>
                      </div>
                      <div style={{ fontSize: '0.7rem', opacity: 0.5, marginTop: 2 }}>
                        {wing.drawerCount} 记忆 · {wing.hallCount} 厅
                      </div>
                    </div>
                  ))}
                </div>

                <div className="sandbox-map__memory-browser-column sandbox-map__memory-browser-column--split">
                  <div className="sandbox-map__memory-browser-label">大厅 Halls</div>
                  {halls.length === 0 ? (
                    <div style={{ opacity: 0.3, fontSize: '0.8rem', padding: 'var(--hd-space-md)' }}>
                      选择翼楼查看大厅
                    </div>
                  ) : (
                    halls.map(hall => (
                      <div
                        key={hall.name}
                        className={`sandbox-map__room-card ${selectedHall === hall.name ? 'sandbox-map__room-card--selected' : ''}`}
                        onClick={() => setSelectedHall(hall.name)}
                        style={{ marginBottom: 'var(--hd-space-xs)', padding: 'var(--hd-space-sm)', cursor: 'pointer' }}
                      >
                        <span style={{ fontSize: '0.85rem' }}>{hall.name}</span>
                        <span style={{ fontSize: '0.7rem', opacity: 0.5, marginLeft: 'var(--hd-space-xs)' }}>
                          {hall.drawerCount}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                <div className="sandbox-map__memory-browser-column">
                  <div className="sandbox-map__memory-browser-label">抽屉 Drawers ({drawers.length})</div>
                  {drawers.length === 0 ? (
                    <EmptyState icon="🏛️" title="此大厅尚无记忆" description="通过对话、推演和手动输入自动积累。" />
                  ) : (
                    <div className="sandbox-map__memory-list">
                      {drawers.map(drawer => (
                        <div
                          key={drawer.id}
                          className="sandbox-map__memory-item sandbox-map__memory-item--drawer"
                          onClick={() => setExpandedDrawer(expandedDrawer === drawer.id ? null : drawer.id)}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="sandbox-map__memory-content" style={{ fontWeight: 500, fontSize: '0.85rem' }}>
                              {drawer.title || drawer.rawContent.slice(0, 60)}
                            </span>
                            <div style={{ display: 'flex', gap: 'var(--hd-space-xs)', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.65rem', opacity: 0.4 }}>
                                {drawer.sourceType}
                              </span>
                              {drawer.isCompiled && (
                                <span style={{ fontSize: '0.6rem', color: 'var(--hd-success)' }}>✓编译</span>
                              )}
                              <button
                                className="sandbox-map__memory-del-btn"
                                onClick={event => {
                                  event.stopPropagation()
                                  handleDelete(drawer.id)
                                }}
                              >
                                ×
                              </button>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 'var(--hd-space-sm)', fontSize: '0.65rem', opacity: 0.4, marginTop: 2 }}>
                            <span>{new Date(drawer.createdAt).toLocaleDateString('zh-CN')}</span>
                            {drawer.tags.length > 0 && (
                              <span>{drawer.tags.slice(0, 3).join(' · ')}</span>
                            )}
                          </div>

                          {expandedDrawer === drawer.id && (
                            <div className="sandbox-map__memory-drawer-content">
                              {drawer.rawContent}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </SystemStagePanel>
          </div>
        }
      />
    </div>
  )
}
