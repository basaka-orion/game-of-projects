import { useEffect, useState } from 'react'
import HexRadar from '../../../components/HexRadar'
import TerminalBlock from '../../../components/TerminalBlock'
import EmptyState from '../../../components/EmptyState'
import CollapsibleSection from '../../../components/CollapsibleSection'
import { BossState, calculateBossLevel, getBossTitle } from '../../../lib/boss/profile'
import { CognitiveProfile, saveCognitiveProfile } from '../../../lib/boss/cognitive-profile'
import ProfilingPanel from './boss-profiling/ProfilingPanel'
import { navigateSandboxTab } from '../navigation'
import { SystemStageFlowItem, SystemStagePanel, SystemStageShell } from '../components/SystemStage'

interface BossTabProps {
  bossState: BossState | null
  bossMemories: Array<{ category: string; content: string; confidence: number; created_at: string }>
  bossDecisions: Array<{ decision_type: string; reasoning: string; created_at: string }>
  onProfileRefresh?: () => Promise<void> | void
}

export default function BossTab({ bossState, bossMemories, bossDecisions, onProfileRefresh }: BossTabProps) {
  const [isEditingCognition, setIsEditingCognition] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [cognitiveDraft, setCognitiveDraft] = useState<CognitiveProfile | null>(bossState?.cognitiveProfile || null)

  useEffect(() => {
    setCognitiveDraft(bossState?.cognitiveProfile || null)
  }, [bossState])

  if (!bossState) {
    return (
      <div className="sandbox-map__placeholder">
        <div className="sandbox-map__empty-icon">👑</div>
        <div className="sandbox-map__empty-text">加载 Boss 画像中...</div>
      </div>
    )
  }

  const cognitiveProfile = cognitiveDraft || bossState.cognitiveProfile

  function updateListField(key: keyof CognitiveProfile, value: string) {
    setCognitiveDraft(prev => {
      if (!prev) return prev
      return {
        ...prev,
        [key]: value.split(/[\n,，、]/).map(item => item.trim()).filter(Boolean),
      } as CognitiveProfile
    })
  }

  function updateTextField(key: keyof CognitiveProfile, value: string) {
    setCognitiveDraft(prev => {
      if (!prev) return prev
      return { ...prev, [key]: value } as CognitiveProfile
    })
  }

  function renderTagList(values: string[], emptyText: string) {
    if (values.length === 0) {
      return <span style={{ color: 'var(--hd-text-muted)', fontSize: '0.82rem' }}>{emptyText}</span>
    }
    return (
      <div className="sandbox-map__boss-tags">
        {values.map(value => (
          <span key={value} className="sandbox-map__boss-tag">{value}</span>
        ))}
      </div>
    )
  }

  async function handleSaveCognition() {
    if (!cognitiveDraft) return
    const saved = saveCognitiveProfile(cognitiveDraft)
    setCognitiveDraft(saved)
    setIsEditingCognition(false)
    setSaveStatus('已保存，新的知识呈现与 agent 协作会开始使用这份画像。')
    window.setTimeout(() => setSaveStatus(''), 2500)
  }

  return (
    <div className="sandbox-map__stage-view sandbox-map__boss-stage-view">
      <SystemStageShell
        eyebrow="boss core"
        title={`Boss ${bossState.name} 不是资料集合，而是整个系统做判断时的统帅台`}
        description="这里现在把 Boss 的身份、操作系统、外部联动和历史证据拆成不同层。先看这个 Boss 当前以什么逻辑统治系统，再钻进认知细节和记忆。"
        metrics={[
          { label: '已评估', value: bossState.projectsEvaluated, detail: '进入 Boss 视野的样本' },
          { label: '推进', value: bossState.projectsPursued, detail: '被允许投入推进', tone: 'success' },
          { label: '转型', value: bossState.projectsPivoted, detail: '战略发生过重构', tone: 'warning' },
          { label: '放弃', value: bossState.projectsAbandoned, detail: '被 Boss 明确否决', tone: 'danger' },
        ]}
        actions={[
          { label: '回到画像工坊', onClick: () => navigateSandboxTab('profiling'), variant: 'primary' },
          { label: '查看推演室', onClick: () => navigateSandboxTab('warroom') },
        ]}
        leftRail={
          <>
            <SystemStagePanel
              eyebrow="identity"
              title={`Lv.${calculateBossLevel(bossState)} — ${getBossTitle(calculateBossLevel(bossState))}`}
              description="这不是装饰头衔，而是系统当前的判断成熟度。"
              tone="accent"
            >
              <div className="sandbox-map__boss-header">
                <div className="sandbox-map__boss-avatar">👑</div>
                <div className="sandbox-map__boss-info">
                  <div className="sandbox-map__boss-style">
                    {bossState.preferredStyle} · {bossState.resourceStyle} · {bossState.decisionSpeed}
                  </div>
                  <div className="sandbox-map__stage-caption">选择眼光 {bossState.averageSurvivalOfChosen || '--'} / 100</div>
                </div>
              </div>
            </SystemStagePanel>

            <SystemStagePanel
              eyebrow="active vectors"
              title="当前偏好向量"
              description="Boss 现在最敏感、最会被点燃和最容易否决什么。"
            >
              <SystemStageFlowItem
                title="兴趣领域"
                value={bossState.interests.length}
                description={bossState.interests.slice(0, 4).join(' · ') || '尚未显性定义'}
                tone="accent"
              />
              <SystemStageFlowItem
                title="禁区 / 厌恶"
                value={bossState.dislikes.length}
                description={bossState.dislikes.slice(0, 4).join(' · ') || '暂未写明'}
                tone="danger"
              />
              <SystemStageFlowItem
                title="短期目标"
                value={bossState.shortTermGoals.length}
                description={bossState.shortTermGoals[0] || '暂未设定'}
                tone="warning"
              />
            </SystemStagePanel>
          </>
        }
        centerRail={
          <SystemStagePanel
            eyebrow="operating doctrine"
            title={cognitiveProfile.mission || 'Boss 的认知使命仍待定义'}
            description="Boss 页的中心应该是这套系统真正如何理解世界、吸收知识、做出取舍，而不是一排抽象数字。"
            focal
            tone="accent"
          >
            <div className="sandbox-map__focal-stats">
              <div className="sandbox-map__focal-stat">
                <span className="sandbox-map__focal-stat-label">讲解偏好</span>
                <span className="sandbox-map__focal-stat-value">{cognitiveProfile.explanationPreferences[0] || '等待画像写入'}</span>
              </div>
              <div className="sandbox-map__focal-stat">
                <span className="sandbox-map__focal-stat-label">理解路径</span>
                <span className="sandbox-map__focal-stat-value">{cognitiveProfile.understandingModes[0] || '等待画像写入'}</span>
              </div>
              <div className="sandbox-map__focal-stat">
                <span className="sandbox-map__focal-stat-label">应避开的表达</span>
                <span className="sandbox-map__focal-stat-value">{cognitiveProfile.antiPatterns[0] || '目前未设置'}</span>
              </div>
            </div>

            <div className="sandbox-map__focal-band">
              <div className="sandbox-map__focal-band-title">Boss 会优先要求系统这样服务自己</div>
              <div className="sandbox-map__stage-chip-cloud">
                {[
                  ...cognitiveProfile.excitementTriggers.slice(0, 4),
                  ...cognitiveProfile.resonanceHooks.slice(0, 3),
                ].filter(Boolean).slice(0, 7).map(value => (
                  <span key={value} className="sandbox-map__boss-tag">{value}</span>
                ))}
              </div>
            </div>

            <div className="sandbox-map__focal-band">
              <div className="sandbox-map__focal-band-title">想并入主脑的框架</div>
              <div className="sandbox-map__stage-note-list">
                {(cognitiveProfile.integrationGoals.length > 0 ? cognitiveProfile.integrationGoals : ['还没有写入明确的长期认知框架。']).slice(0, 4).map(goal => (
                  <div key={goal} className="sandbox-map__stage-note-item">{goal}</div>
                ))}
              </div>
            </div>
          </SystemStagePanel>
        }
        rightRail={
          <>
            <SystemStagePanel
              eyebrow="linked rooms"
              title="Boss 联动"
              description="Boss 不应该是孤岛。这里直接跳去看它正在指挥哪些模块。"
            >
              <SystemStageFlowItem
                title="画像工坊"
                value="重写 Boss Core"
                description="重新测一轮，Boss 的行为模型和解释方式就会继续演化。"
                actionLabel="open"
                tone="accent"
                onClick={() => navigateSandboxTab('profiling')}
              />
              <SystemStageFlowItem
                title="推演室"
                value="项目取舍"
                description="去看当前 Boss 风格如何直接改变愿景对齐和多角色推演。"
                actionLabel="open"
                onClick={() => navigateSandboxTab('warroom')}
              />
              <SystemStageFlowItem
                title="记忆宫殿"
                value="记忆编排"
                description="看看 Boss 画像如何影响知识吸收路径与记忆归档。"
                actionLabel="open"
                onClick={() => navigateSandboxTab('memory')}
              />
              <SystemStageFlowItem
                title="群策协作"
                value="外脑分工"
                description="把这套 Boss 偏好进一步下放给团队和协作角色。"
                actionLabel="jump"
                onClick={() => navigateSandboxTab('teams')}
              />
            </SystemStagePanel>

            <SystemStagePanel
              eyebrow="memory trace"
              title="最近学习记忆"
              description="这些不是日志碎片，而是 Boss 最近真正吸收进来的信号。"
            >
              {bossMemories.length > 0 ? (
                bossMemories.slice(0, 4).map((memory, index) => (
                  <SystemStageFlowItem
                    key={`${memory.category}-${index}`}
                    title={memory.category}
                    value={`${Math.round(memory.confidence * 100)}%`}
                    description={memory.content}
                    meta={new Date(memory.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    tone="success"
                  />
                ))
              ) : (
                <EmptyState icon="🧠" title="尚无学习记忆" description="与 Openbasaka 对话和做项目决策后会自动积累。" />
              )}
            </SystemStagePanel>
          </>
        }
      />

      {/* 偏好雷达 */}
      <CollapsibleSection title="偏好画像" defaultOpen={true}>
        <HexRadar
          data={[
            { label: '风险偏好', value: bossState.riskTolerance },
            { label: '创新偏好', value: bossState.innovationBias },
            { label: '领域广度', value: Math.min(100, bossState.interests.length * 12) },
            { label: '决策活跃度', value: Math.min(100, bossState.projectsEvaluated * 8) },
            { label: '选择眼光', value: bossState.averageSurvivalOfChosen || 0 },
            { label: '探索深度', value: Math.min(100, bossMemories.length * 3) },
          ]}
          size={260}
        />
      </CollapsibleSection>

      {/* 兴趣领域 */}
      <CollapsibleSection title="兴趣领域" defaultOpen={true}>
        <div className="sandbox-map__boss-tags">
          {bossState.interests.length > 0 ? (
            bossState.interests.map(i => (
              <span key={i} className="sandbox-map__boss-tag">{i}</span>
            ))
          ) : (
            <span style={{ color: 'var(--hd-text-muted)', fontSize: '0.85rem' }}>未设置</span>
          )}
        </div>
        {bossState.dislikes.length > 0 && (
          <div style={{ marginTop: 'var(--hd-space-sm)' }}>
            <div className="hd-label" style={{ marginBottom: 'var(--hd-space-xs)' }}>厌恶</div>
            <div className="sandbox-map__boss-tags">
              {bossState.dislikes.map(d => (
                <span key={d} className="sandbox-map__boss-tag sandbox-map__boss-tag--negative">{d}</span>
              ))}
            </div>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="认知操作系统" defaultOpen={true}>
        <div className="sandbox-map__cognition-header">
          <div className="sandbox-map__cognition-copy">
            这里定义系统应该怎样把知识“译成你会兴奋、会吸收、会纳入自己框架”的形式。
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {saveStatus && <span className="sandbox-map__cognition-status">{saveStatus}</span>}
            {isEditingCognition ? (
              <>
                <button className="sandbox-map__btn sandbox-map__btn--primary" onClick={handleSaveCognition}>保存画像</button>
                <button className="sandbox-map__btn" onClick={() => { setCognitiveDraft(bossState.cognitiveProfile); setIsEditingCognition(false) }}>取消</button>
              </>
            ) : (
              <button className="sandbox-map__btn" onClick={() => setIsEditingCognition(true)}>编辑画像</button>
            )}
          </div>
        </div>

        {isEditingCognition ? (
          <div className="sandbox-map__cognition-grid">
            <label className="sandbox-map__cognition-field">
              <span className="sandbox-map__cognition-label">使命</span>
              <textarea
                className="sandbox-map__edit-textarea"
                value={cognitiveProfile.mission}
                onChange={e => updateTextField('mission', e.target.value)}
                placeholder="例如：把任何资料转译成我会起感觉、会上瘾、能迅速理解并并入认知框架的形式。"
              />
            </label>
            <label className="sandbox-map__cognition-field">
              <span className="sandbox-map__cognition-label">让我兴奋的入口</span>
              <textarea
                className="sandbox-map__edit-textarea"
                value={cognitiveProfile.excitementTriggers.join('\n')}
                onChange={e => updateListField('excitementTriggers', e.target.value)}
                placeholder="每行一个，例如：第一性原理、跨学科连接、文明级视角"
              />
            </label>
            <label className="sandbox-map__cognition-field">
              <span className="sandbox-map__cognition-label">容易有感觉的抓手</span>
              <textarea
                className="sandbox-map__edit-textarea"
                value={cognitiveProfile.resonanceHooks.join('\n')}
                onChange={e => updateListField('resonanceHooks', e.target.value)}
                placeholder="例如：反差、张力、底层模式、暗线"
              />
            </label>
            <label className="sandbox-map__cognition-field">
              <span className="sandbox-map__cognition-label">偏好的讲解方式</span>
              <textarea
                className="sandbox-map__edit-textarea"
                value={cognitiveProfile.explanationPreferences.join('\n')}
                onChange={e => updateListField('explanationPreferences', e.target.value)}
                placeholder="例如：先总后分、类比、框架化、案例驱动"
              />
            </label>
            <label className="sandbox-map__cognition-field">
              <span className="sandbox-map__cognition-label">容易上瘾的呈现形式</span>
              <textarea
                className="sandbox-map__edit-textarea"
                value={cognitiveProfile.addictiveFormats.join('\n')}
                onChange={e => updateListField('addictiveFormats', e.target.value)}
                placeholder="例如：路线图、清单、张力对照、知识地图"
              />
            </label>
            <label className="sandbox-map__cognition-field">
              <span className="sandbox-map__cognition-label">容易吸收的理解路径</span>
              <textarea
                className="sandbox-map__edit-textarea"
                value={cognitiveProfile.understandingModes.join('\n')}
                onChange={e => updateListField('understandingModes', e.target.value)}
                placeholder="例如：先看模式，再看例子，再看行动"
              />
            </label>
            <label className="sandbox-map__cognition-field">
              <span className="sandbox-map__cognition-label">要避开的表达</span>
              <textarea
                className="sandbox-map__edit-textarea"
                value={cognitiveProfile.antiPatterns.join('\n')}
                onChange={e => updateListField('antiPatterns', e.target.value)}
                placeholder="例如：空话、过度学术化、没证据的判断"
              />
            </label>
            <label className="sandbox-map__cognition-field">
              <span className="sandbox-map__cognition-label">想融入的认知框架</span>
              <textarea
                className="sandbox-map__edit-textarea"
                value={cognitiveProfile.integrationGoals.join('\n')}
                onChange={e => updateListField('integrationGoals', e.target.value)}
                placeholder="例如：世界模型、决策框架、长期提示词"
              />
            </label>
          </div>
        ) : (
          <div className="sandbox-map__cognition-stack">
            {cognitiveProfile.mission && (
              <div className="sandbox-map__cognition-card">
                <div className="sandbox-map__cognition-label">使命</div>
                <div className="sandbox-map__cognition-text">{cognitiveProfile.mission}</div>
              </div>
            )}
            <div className="sandbox-map__cognition-card">
              <div className="sandbox-map__cognition-label">让我兴奋的入口</div>
              {renderTagList(cognitiveProfile.excitementTriggers, '还没有定义。')}
            </div>
            <div className="sandbox-map__cognition-card">
              <div className="sandbox-map__cognition-label">有感觉的抓手</div>
              {renderTagList(cognitiveProfile.resonanceHooks, '还没有定义。')}
            </div>
            <div className="sandbox-map__cognition-card">
              <div className="sandbox-map__cognition-label">偏好的讲解方式</div>
              {renderTagList(cognitiveProfile.explanationPreferences, '还没有定义。')}
            </div>
            <div className="sandbox-map__cognition-card">
              <div className="sandbox-map__cognition-label">容易上瘾的呈现</div>
              {renderTagList(cognitiveProfile.addictiveFormats, '还没有定义。')}
            </div>
            <div className="sandbox-map__cognition-card">
              <div className="sandbox-map__cognition-label">吸收路径</div>
              {renderTagList(cognitiveProfile.understandingModes, '还没有定义。')}
            </div>
            <div className="sandbox-map__cognition-card">
              <div className="sandbox-map__cognition-label">想融入的认知框架</div>
              {renderTagList(cognitiveProfile.integrationGoals, '还没有定义。')}
            </div>
            <div className="sandbox-map__cognition-card">
              <div className="sandbox-map__cognition-label">应避开的表达</div>
              {renderTagList(cognitiveProfile.antiPatterns, '目前没有设置禁区。')}
            </div>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="多维画像" defaultOpen={true}>
        <ProfilingPanel bossState={bossState} onApplied={onProfileRefresh} />
      </CollapsibleSection>

      {/* 学习记忆 */}
      <CollapsibleSection title="学习记忆" defaultOpen={false} count={bossMemories.length}>
        {bossMemories.length > 0 ? (
          <div className="sandbox-map__memory-list">
            {bossMemories.slice(0, 15).map((m, i) => (
              <div key={i} className="sandbox-map__memory-item">
                <span className={`sandbox-map__memory-cat sandbox-map__memory-cat--${m.category}`}>
                  {m.category}
                </span>
                <span className="sandbox-map__memory-content">{m.content}</span>
                <span className="sandbox-map__memory-confidence">
                  {Math.round(m.confidence * 100)}%
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon="🧠" title="尚无学习记忆" description="与 Openbasaka 对话和做项目决策后会自动积累" />
        )}
      </CollapsibleSection>

      {/* 决策历史 */}
      <CollapsibleSection title="决策历史" defaultOpen={false} count={bossDecisions.length}>
        {bossDecisions.length > 0 ? (
          <TerminalBlock title="DECISIONS">
            {bossDecisions.map((d, i) => (
              <div key={i}>
                <span style={{ color: d.decision_type === 'pursue' ? 'var(--hd-success)' : d.decision_type === 'abandon' ? 'var(--hd-danger)' : 'var(--hd-warning)' }}>
                  [{d.decision_type.toUpperCase()}]
                </span>
                {' '}{d.reasoning}
              </div>
            ))}
          </TerminalBlock>
        ) : (
          <EmptyState icon="📋" title="尚无决策记录" description="在推演完成后做出你的第一个决策" />
        )}
      </CollapsibleSection>

      {/* 目标 */}
      {(bossState.shortTermGoals.length > 0 || bossState.longTermVision) && (
        <CollapsibleSection title="目标与愿景" defaultOpen={false}>
          {bossState.longTermVision && (
            <div style={{ marginBottom: 'var(--hd-space-sm)' }}>
              <div className="hd-label">长期愿景</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--hd-text-secondary)' }}>{bossState.longTermVision}</div>
            </div>
          )}
          {bossState.shortTermGoals.length > 0 && (
            <div>
              <div className="hd-label">短期目标</div>
              {bossState.shortTermGoals.map((g, i) => (
                <div key={i} style={{ fontSize: '0.85rem', color: 'var(--hd-text-secondary)', paddingLeft: 'var(--hd-space-sm)' }}>
                  * {g}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}
    </div>
  )
}
