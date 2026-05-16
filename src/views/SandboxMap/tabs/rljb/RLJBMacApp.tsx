import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  RLJB_ACHIEVEMENTS,
  RLJB_BADGES,
  RLJB_DISCOVERIES,
  RLJB_QUESTS,
  getFallbackInsight,
  requestRLJBInsight,
} from '../../../../lib/rljb/content'
import {
  addDynamicChild,
  applyQuestImpact,
  cloneTree,
  findNode,
  findParent,
  flattenTree,
  getNodePath,
  loadRLJBState,
  masterNode,
  saveRLJBState,
} from '../../../../lib/rljb/state'
import type { DailyDiscovery, KnowledgeInsight, RLJBMacState, RLJBTreeNode } from '../../../../lib/rljb/types'
import { recordOpenbasakaOperationQuietly } from '../../../../lib/openbasaka/operation-history'
import './RLJBMacApp.css'

type RljbView = 'tree' | 'discover' | 'game' | 'social'
type LearningStage = 'intuition' | 'shift' | 'quiz' | 'paths'
type SocialView = 'profile' | 'achievements' | 'friends'

const viewTabs: Array<[RljbView, string, string]> = [
  ['tree', '知识树', '解锁人类基本盘'],
  ['discover', '每日发现', '把新知识接入节点'],
  ['game', '意识流', '选择塑造认知画像'],
  ['social', '社交档案', '等级/徽章/好友'],
]

const socialTabs: Array<[SocialView, string]> = [
  ['profile', '我的档案'],
  ['achievements', '成就徽章'],
  ['friends', '好友排行'],
]

function shortLabel(name: string): string {
  return name.replace(/\s*\(.+?\)\s*/g, '').trim()
}

function nodeDepth(root: RLJBTreeNode, id: string): number {
  return Math.max(0, getNodePath(root, id).length - 1)
}

function nodeOpacity(node: RLJBTreeNode): number {
  if (node.isMastered) return 1
  if (node.isActivated) return 0.92
  if (node.isSourceNode) return 0.72
  return 0.44
}

function levelProgress(state: RLJBMacState): number {
  const next = Math.max(1, state.profile.level * 100)
  return Math.min(100, Math.round((state.profile.experience / next) * 100))
}

function fallbackDiscovery(state: RLJBMacState): DailyDiscovery {
  return state.lastDiscovery || RLJB_DISCOVERIES[0]
}

function patchState(
  state: RLJBMacState,
  updater: (next: RLJBMacState) => void,
): RLJBMacState {
  const next = cloneTree(state)
  updater(next)
  saveRLJBState(next)
  return next
}

export default function RLJBMacApp() {
  const [state, setState] = useState<RLJBMacState>(() => loadRLJBState())
  const [view, setView] = useState<RljbView>('tree')
  const [selectedNodeId, setSelectedNodeId] = useState('root')
  const [stage, setStage] = useState<LearningStage>('intuition')
  const [socialView, setSocialView] = useState<SocialView>('profile')
  const [insight, setInsight] = useState<KnowledgeInsight>(() => getFallbackInsight('存在 (Existence)'))
  const [isLoadingInsight, setIsLoadingInsight] = useState(false)
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({})
  const [branchIdea, setBranchIdea] = useState('')
  const [discoveryAnswer, setDiscoveryAnswer] = useState<number | null>(null)

  useEffect(() => {
    saveRLJBState(state)
  }, [state])

  const allNodes = useMemo(() => flattenTree(state.tree), [state.tree])
  const selectedNode = useMemo(() => findNode(state.tree, selectedNodeId) || state.tree, [state.tree, selectedNodeId])
  const selectedPath = useMemo(() => getNodePath(state.tree, selectedNode.id).map((node) => shortLabel(node.name)), [state.tree, selectedNode.id])
  const discovery = fallbackDiscovery(state)
  const activeQuest = state.lastQuest || RLJB_QUESTS[0]

  useEffect(() => {
    let cancelled = false
    setQuizAnswers({})
    setIsLoadingInsight(true)
    requestRLJBInsight(selectedNode.name, state.profile.traits)
      .then((next) => {
        if (!cancelled) setInsight(next)
      })
      .catch(() => {
        if (!cancelled) setInsight(getFallbackInsight(selectedNode.name))
      })
      .finally(() => {
        if (!cancelled) setIsLoadingInsight(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedNode.id, selectedNode.name, state.profile.traits])

  const positionedNodes = useMemo(() => {
    const levelBuckets = new Map<number, RLJBTreeNode[]>()
    allNodes.forEach((node) => {
      const depth = nodeDepth(state.tree, node.id)
      levelBuckets.set(depth, [...(levelBuckets.get(depth) || []), node])
    })
    return allNodes.map((node) => {
      const depth = nodeDepth(state.tree, node.id)
      const bucket = levelBuckets.get(depth) || []
      const index = Math.max(0, bucket.findIndex((item) => item.id === node.id))
      const total = Math.max(1, bucket.length)
      const x = 72 + depth * 170
      const y = 72 + (index + 1) * (520 / (total + 1))
      return { node, x, y }
    })
  }, [allNodes, state.tree])

  function selectNode(node: RLJBTreeNode) {
    setSelectedNodeId(node.id)
    setStage('intuition')
    recordOpenbasakaOperationQuietly({
      moduleId: 'rljb',
      moduleName: '人类基本盘',
      action: '选择知识节点',
      summary: `查看知识树节点：${node.name}`,
      toolRefs: ['rljb', 'operating_events'],
      entities: [node.id, node.name],
    })
  }

  function completeSelectedNode() {
    const mistakes = insight.verifications.reduce((count, quiz, index) => {
      return count + (quizAnswers[index] === quiz.correctIndex ? 0 : 1)
    }, 0)
    setState((current) =>
      patchState(current, (next) => {
        const node = findNode(next.tree, selectedNode.id)
        if (node) masterNode(next, node, mistakes)
      }),
    )
    recordOpenbasakaOperationQuietly({
      moduleId: 'rljb',
      moduleName: '人类基本盘',
      action: '掌握知识节点',
      summary: `完成 ${selectedNode.name} 的验证，错误数 ${mistakes}，解锁后续分支。`,
      toolRefs: ['rljb', 'operating_events'],
      entities: [selectedNode.id, selectedNode.name],
    })
  }

  function addBranch(label: string, description: string) {
    setState((current) =>
      patchState(current, (next) => {
        const node = findNode(next.tree, selectedNode.id)
        if (node) addDynamicChild(node, label, description)
      }),
    )
    recordOpenbasakaOperationQuietly({
      moduleId: 'rljb',
      moduleName: '人类基本盘',
      action: '添加知识延伸',
      summary: `为 ${selectedNode.name} 添加延伸节点：${label}`,
      toolRefs: ['rljb', 'operating_events'],
      entities: [selectedNode.id, label],
    })
  }

  function answerDiscovery(index: number) {
    setDiscoveryAnswer(index)
    const correct = index === discovery.experiment.correctIndex
    setState((current) =>
      patchState(current, (next) => {
        next.lastDiscovery = discovery
        next.discoveryAnswered = {
          discoveryTitle: discovery.title,
          selectedIndex: index,
          correct,
        }
        const impactNode = findNode(next.tree, discovery.impactNodeId)
        if (impactNode) {
          impactNode.isLocked = false
          impactNode.isActivated = true
          impactNode.learningStatus = correct ? 'exploring' : 'review'
        }
      }),
    )
    recordOpenbasakaOperationQuietly({
      moduleId: 'rljb',
      moduleName: '人类基本盘',
      action: '每日发现实验',
      summary: `${discovery.title} 实验选择：${discovery.experiment.options[index]}`,
      toolRefs: ['rljb', 'daily-discovery', 'operating_events'],
      entities: [discovery.title, discovery.impactNodeId],
    })
  }

  function answerQuest(index: number) {
    const option = activeQuest.options[index]
    setState((current) =>
      patchState(current, (next) => {
        next.lastQuest = activeQuest
        next.questResult = { questId: activeQuest.id, selectedIndex: index, option }
        applyQuestImpact(next, option)
      }),
    )
    recordOpenbasakaOperationQuietly({
      moduleId: 'rljb',
      moduleName: '人类基本盘',
      action: '意识流选择',
      summary: `场景 ${activeQuest.id} 选择：${option.text}`,
      toolRefs: ['rljb', 'consciousness-quest', 'operating_events'],
      entities: [activeQuest.id, option.archetypeWeight],
    })
  }

  function renderTreeView() {
    const selectedPosition = positionedNodes.find((item) => item.node.id === selectedNode.id)
    const quizComplete = insight.verifications.length > 0 && insight.verifications.every((_, index) => quizAnswers[index] !== undefined)

    return (
      <div className="rljb-tree">
        <div className="rljb-tree__canvas-panel">
          <div className="rljb-tree__canvas-toolbar">
            <div>
              <strong>COGNITIVE TREE</strong>
              <span>{allNodes.length} 个节点 · {state.profile.masteredNodeIDs.length} 个已掌握</span>
            </div>
            <button onClick={() => selectNode(state.tree)}>回到根节点</button>
          </div>
          <svg className="rljb-tree__svg" viewBox="0 0 980 620" role="img" aria-label="RLJB knowledge tree">
            {positionedNodes.map(({ node, x, y }) => {
              const parent = findParent(state.tree, node.id)
              if (!parent) return null
              const parentPosition = positionedNodes.find((item) => item.node.id === parent.id)
              if (!parentPosition) return null
              return (
                <path
                  key={`edge-${node.id}`}
                  className={`rljb-tree__edge ${node.connectionType === 'dashed' ? 'rljb-tree__edge--dashed' : ''} ${
                    node.isLocked ? 'rljb-tree__edge--ghost' : ''
                  }`}
                  d={`M ${parentPosition.x + 18} ${parentPosition.y} C ${parentPosition.x + 90} ${parentPosition.y}, ${x - 90} ${y}, ${x - 18} ${y}`}
                />
              )
            })}
            {selectedPosition &&
              selectedNode.relatedNodeIDs.map((id) => {
                const target = positionedNodes.find((item) => item.node.id === id)
                if (!target) return null
                return (
                  <line
                    key={`relation-${id}`}
                    className="rljb-tree__relation"
                    x1={selectedPosition.x}
                    y1={selectedPosition.y}
                    x2={target.x}
                    y2={target.y}
                  />
                )
              })}
            {positionedNodes.map(({ node, x, y }) => (
              <g
                key={node.id}
                className={`rljb-tree__node ${node.id === selectedNode.id ? 'rljb-tree__node--selected' : ''}`}
                transform={`translate(${x} ${y})`}
                onClick={() => selectNode(node)}
              >
                <circle
                  r={node.category === 'root' ? 24 : node.category === 'stem' ? 19 : 15}
                  fill={node.isMastered ? '#30d158' : node.isLocked ? '#222831' : node.color}
                  opacity={nodeOpacity(node)}
                  stroke={node.id === selectedNode.id ? '#f7f4df' : 'rgba(255,255,255,0.35)'}
                  strokeWidth={node.id === selectedNode.id ? 3 : 1}
                />
                <text className="rljb-tree__label" x={node.category === 'root' ? 32 : 24} y={4}>
                  {shortLabel(node.name)}
                </text>
              </g>
            ))}
          </svg>
          <div className="rljb-tree__legend">
            <span><i className="rljb-dot" /> 可探索</span>
            <span><i className="rljb-dot rljb-dot--dash" /> 灵感延伸</span>
            <span><i className="rljb-dot rljb-dot--mastered" /> 已掌握</span>
            <span><i className="rljb-dot rljb-dot--fog" /> 未解锁</span>
          </div>
        </div>

        <div className="rljb-node-panel">
          <div className="rljb-node-panel__head">
            <div className="rljb-node-panel__color" style={{ background: selectedNode.color }} />
            <div>
              <div className="rljb-node-panel__path">{selectedPath.join(' / ')}</div>
              <h3>{selectedNode.name}</h3>
              <p>{selectedNode.description || `${shortLabel(selectedNode.name)} 是知识树里等待被理解、验证和延伸的节点。`}</p>
            </div>
          </div>

          <div className="rljb-node-panel__stage">
            {[
              ['intuition', '直觉'],
              ['shift', '范式'],
              ['quiz', '验证'],
              ['paths', '分支'],
            ].map(([id, label]) => (
              <button
                key={id}
                className={stage === id ? 'rljb-node-panel__stage-btn--active' : ''}
                onClick={() => setStage(id as LearningStage)}
              >
                {label}
              </button>
            ))}
          </div>

          {isLoadingInsight ? (
            <div className="rljb-node-panel__loading">
              <div className="rljb-loader-ring" />
              <strong>正在提取节点洞见...</strong>
              <p>如果模型未配置，会立即回落到本地知识引擎。</p>
            </div>
          ) : stage === 'intuition' ? (
            <div className="rljb-learn">
              <div className="rljb-insight-card">
                <span>INTUITION</span>
                <p>{insight.intuition}</p>
              </div>
              <div className="rljb-insight-card">
                <span>DEPTH</span>
                <p>{insight.depth}</p>
              </div>
            </div>
          ) : stage === 'shift' ? (
            <div className="rljb-learn">
              <div className="rljb-insight-card">
                <span>PARADIGM SHIFT</span>
                <p>{insight.paradigmShift}</p>
              </div>
              <div className="rljb-insight-card">
                <span>INSPIRATION</span>
                <p>{insight.inspiration}</p>
              </div>
            </div>
          ) : stage === 'quiz' ? (
            <div className="rljb-quiz">
              {insight.verifications.map((quiz, index) => {
                const selected = quizAnswers[index]
                return (
                  <div key={quiz.question} className="rljb-insight-card">
                    <div className="rljb-quiz__meta">QUESTION {index + 1}</div>
                    <h4>{quiz.question}</h4>
                    <div className="rljb-quiz__options">
                      {quiz.options.map((option, optionIndex) => {
                        const isSelected = selected === optionIndex
                        const isCorrect = selected !== undefined && optionIndex === quiz.correctIndex
                        const isWrong = isSelected && optionIndex !== quiz.correctIndex
                        return (
                          <button
                            key={option}
                            className={`${isSelected ? 'rljb-quiz__option--selected' : ''} ${
                              isCorrect ? 'rljb-quiz__option--correct' : ''
                            } ${isWrong ? 'rljb-quiz__option--wrong' : ''}`}
                            onClick={() => setQuizAnswers((prev) => ({ ...prev, [index]: optionIndex }))}
                          >
                            <span>{String.fromCharCode(65 + optionIndex)}</span>
                            {option}
                          </button>
                        )
                      })}
                    </div>
                    {selected !== undefined && (
                      <div className={`rljb-quiz__feedback ${selected === quiz.correctIndex ? 'rljb-quiz__feedback--ok' : 'rljb-quiz__feedback--review'}`}>
                        <strong>{selected === quiz.correctIndex ? '理解到位' : '需要换个角度'}</strong>
                        <p>{quiz.explanation}</p>
                      </div>
                    )}
                  </div>
                )
              })}
              <button className="rljb-primary-btn" disabled={!quizComplete} onClick={completeSelectedNode}>
                掌握节点并解锁下一层
              </button>
            </div>
          ) : (
            <div className="rljb-paths">
              <div className="rljb-paths__head">
                <span>PERSONAL PATHS</span>
                <p>选一条分支，把概念接到你的真实问题上。</p>
              </div>
              {insight.suggestedPaths.map((path) => (
                <div className="rljb-path-card" key={path.label}>
                  <div>
                    <strong>{path.label}</strong>
                    <span>{path.description}</span>
                  </div>
                  <button onClick={() => addBranch(path.label, path.description)}>加入树</button>
                </div>
              ))}
              <div className="rljb-path-card">
                <div>
                  <strong>自定义延伸</strong>
                  <input
                    value={branchIdea}
                    onChange={(event) => setBranchIdea(event.target.value)}
                    placeholder="写下你自己的下一层问题..."
                    style={{
                      minHeight: 34,
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'rgba(0,0,0,0.18)',
                      color: '#eef7f6',
                      padding: '0 10px',
                    }}
                  />
                </div>
                <button
                  onClick={() => {
                    addBranch(branchIdea, `Boss 自定义延伸：${branchIdea}`)
                    setBranchIdea('')
                  }}
                  disabled={!branchIdea.trim()}
                >
                  添加
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderDiscoveryView() {
    const selected = discoveryAnswer ?? state.discoveryAnswered?.selectedIndex
    return (
      <div className="rljb-discover">
        <div className="rljb-discover__feature">
          <span className="rljb-section-kicker">{discovery.field}</span>
          <h3>{discovery.title}</h3>
          <p>{discovery.summary}</p>
          <div className="rljb-discover__deep">{discovery.detailedExplanation}</div>
          <button
            className="rljb-primary-btn"
            onClick={() => {
              const node = findNode(state.tree, discovery.impactNodeId)
              if (node) {
                setSelectedNodeId(node.id)
                setView('tree')
              }
            }}
          >
            查看受影响节点
          </button>
        </div>
        <div className="rljb-experiment">
          <span>THOUGHT EXPERIMENT</span>
          <h4>{discovery.experiment.scenario}</h4>
          <p>{discovery.experiment.question}</p>
          <div className="rljb-experiment__options">
            {discovery.experiment.options.map((option, index) => (
              <button
                key={option}
                className={`${selected === index ? 'rljb-experiment__option--selected' : ''} ${
                  selected !== undefined && index === discovery.experiment.correctIndex ? 'rljb-experiment__option--correct' : ''
                }`}
                onClick={() => answerDiscovery(index)}
              >
                {option}
              </button>
            ))}
          </div>
          {selected !== undefined && (
            <div className="rljb-experiment__result">
              <strong>{selected === discovery.experiment.correctIndex ? '实验通过' : '实验已记录'}</strong>
              <p>{discovery.experiment.outcomeExplanation}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderQuestView() {
    const selected = state.questResult?.questId === activeQuest.id ? state.questResult.selectedIndex : null
    return (
      <div className="rljb-game">
        <div className="rljb-game__scenario">
          <span className="rljb-section-kicker">{activeQuest.date}</span>
          <h3>意识流抉择</h3>
          <p>{activeQuest.scenario}</p>
        </div>
        <div className="rljb-game__options">
          {activeQuest.options.map((option, index) => (
            <button
              key={option.text}
              className={selected === index ? 'rljb-game__option--selected' : ''}
              onClick={() => answerQuest(index)}
            >
              <strong>{option.text}</strong>
              <span>{option.archetypeWeight}</span>
              <small>{option.treeImpact}</small>
            </button>
          ))}
        </div>
        <div className="rljb-game__result">
          <span>COGNITIVE IMPACT</span>
          {selected === null ? (
            <p>选择会改变 Boss 的认知特质，并在知识树根节点生成新的动态延伸。</p>
          ) : (
            <>
              <strong>{state.questResult?.option.archetypeWeight}</strong>
              <p>{state.questResult?.option.treeImpact}</p>
            </>
          )}
        </div>
      </div>
    )
  }

  function renderSocialView() {
    const progressStyle = { ['--progress' as string]: `${levelProgress(state)}%` } as CSSProperties
    return (
      <div className="rljb-social">
        <div className="rljb-social__tabs">
          {socialTabs.map(([id, label]) => (
            <button
              key={id}
              className={socialView === id ? 'rljb-social__tab--active' : ''}
              onClick={() => setSocialView(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {socialView === 'profile' ? (
          <div className="rljb-social__profile">
            <div className="rljb-profile-card">
              <div>
                <span>LEVEL {state.profile.level}</span>
                <h3>{state.profile.name}</h3>
                <p>{state.profile.archetype}</p>
                <p>{state.profile.traits.join(' / ')}</p>
              </div>
              <div className="rljb-profile-card__ring" style={progressStyle}>
                {levelProgress(state)}%
              </div>
            </div>
            <div className="rljb-cognitive-chart">
              {state.profile.traits.slice(0, 6).map((trait, index) => (
                <div key={trait} style={{ ['--i' as string]: index } as CSSProperties}>
                  <span>{trait}</span>
                </div>
              ))}
            </div>
            <div className="rljb-social__stats-grid">
              <div className="rljb-stat"><strong>{state.profile.masteredNodeIDs.length}</strong><span>已掌握</span></div>
              <div className="rljb-stat"><strong>{state.profile.unlockedNodeIDs.length}</strong><span>已解锁</span></div>
              <div className="rljb-stat"><strong>{state.profile.streak}</strong><span>连续学习</span></div>
              <div className="rljb-stat"><strong>{state.profile.totalExperience}</strong><span>总经验</span></div>
            </div>
          </div>
        ) : socialView === 'achievements' ? (
          <div className="rljb-achievements">
            {RLJB_ACHIEVEMENTS.map((achievement) => (
              <div
                key={achievement.id}
                className={state.profile.achievements.includes(achievement.id) ? 'rljb-achievement--unlocked' : ''}
              >
                <strong>{achievement.name}</strong>
                <small>{achievement.description}</small>
              </div>
            ))}
            {RLJB_BADGES.map((badge) => (
              <div key={badge.id} className={state.profile.badges.includes(badge.id) ? 'rljb-achievement--unlocked' : ''}>
                <strong>{badge.name}</strong>
                <small>{badge.rarity} · {badge.description}</small>
              </div>
            ))}
          </div>
        ) : (
          <div className="rljb-friends">
            {[
              ['Boss', '当前认知树拥有者', '在线'],
              ['Ada', '自然科学路径', '42 节点'],
              ['Da Vinci', '跨学科发明家', '36 节点'],
              ['Laozi', '抽象思维路径', '31 节点'],
            ].map(([name, desc, score]) => (
              <div key={name}>
                <strong>{name}</strong>
                <span>{score}</span>
                <p>{desc}</p>
                <button>查看路径</button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rljb-mac">
      <div className="rljb-mac__glow rljb-mac__glow--blue" />
      <div className="rljb-mac__glow rljb-mac__glow--rose" />
      <aside className="rljb-mac__rail">
        <div className="rljb-mac__brand">
          <div className="rljb-mac__brand-mark">R</div>
          <div>
            <div className="rljb-mac__brand-title">人类基本盘</div>
            <div className="rljb-mac__brand-sub">RLJB / Cognitive Tree</div>
          </div>
        </div>
        <div className="rljb-mac__profile-chip">
          <span>Boss Lv.{state.profile.level}</span>
          <strong>{state.profile.archetype}</strong>
          <small>{state.profile.traits.join(' · ')}</small>
        </div>
        <div className="rljb-mac__tab-list">
          {viewTabs.map(([id, label, desc]) => (
            <button
              key={id}
              className={`rljb-mac__tab ${view === id ? 'rljb-mac__tab--active' : ''}`}
              onClick={() => setView(id)}
            >
              <span>{label}</span>
              <small>{desc}</small>
            </button>
          ))}
        </div>
        <div className="rljb-mac__rail-metrics">
          <div><span>{state.profile.level}</span><small>等级</small></div>
          <div><span>{state.profile.masteredNodeIDs.length}</span><small>掌握</small></div>
          <div><span>{state.profile.badges.length}</span><small>徽章</small></div>
        </div>
      </aside>
      <main className="rljb-mac__main">
        <header className="rljb-mac__top">
          <div>
            <div className="rljb-mac__eyebrow">OPENBASAKA XIAOBAI MODULE</div>
            <h2>{view === 'tree' ? selectedNode.name : viewTabs.find(([id]) => id === view)?.[1]}</h2>
            <p>把概念变成可验证的理解，再把理解沉淀成 Boss 的长期认知资产。</p>
          </div>
          <div className="rljb-mac__top-actions">
            <div className="rljb-mac__status-pill">XP {state.profile.experience}/{state.profile.level * 100}</div>
            <div className="rljb-mac__status-pill">{state.sessions.length} sessions</div>
          </div>
        </header>
        {view === 'tree' && renderTreeView()}
        {view === 'discover' && renderDiscoveryView()}
        {view === 'game' && renderQuestView()}
        {view === 'social' && renderSocialView()}
      </main>
    </div>
  )
}
