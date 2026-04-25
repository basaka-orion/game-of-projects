import { useEffect, useMemo, useState } from 'react'
import type { BossState } from '../../../../lib/boss/profile'
import type { QuickProfilingAnswers } from '../../../../lib/boss/profiling/types'
import { getLatestAssessmentRun, runQuickProfiling } from '../../../../lib/boss/profiling/service'

interface ProfilingPanelProps {
  bossState: BossState
  onApplied?: () => Promise<void> | void
}

function parseList(value: string): string[] {
  return value.split(/[\n,，、]/).map(item => item.trim()).filter(Boolean)
}

function SliderField({
  label,
  value,
  min = 0,
  max = 100,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="sandbox-map__profiling-slider">
      <span className="sandbox-map__cognition-label">{label}</span>
      <div className="sandbox-map__profiling-slider-row">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={e => onChange(parseInt(e.target.value || '0'))}
        />
        <span>{value}</span>
      </div>
    </label>
  )
}

export default function ProfilingPanel({ bossState, onApplied }: ProfilingPanelProps) {
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [latestRun, setLatestRun] = useState<Awaited<ReturnType<typeof getLatestAssessmentRun>>>(null)
  const [draft, setDraft] = useState<QuickProfilingAnswers>({
    name: bossState.name,
    interests: bossState.interests,
    dislikes: bossState.dislikes,
    longTermVision: bossState.longTermVision,
    currentFocus: bossState.currentFocus,
    workStyle: bossState.preferredStyle,
    riskTolerance: bossState.riskTolerance,
    innovationBias: bossState.innovationBias,
    socialEnergy: 50,
    executionDiscipline: bossState.decisionSpeed === 'analytical' ? 72 : 58,
    emotionalSensitivity: 55,
    aestheticSensitivity: bossState.cognitiveProfile.resonanceHooks.length > 0 ? 70 : 50,
    curiosityBreadth: Math.min(100, Math.max(40, bossState.interests.length * 12)),
    worldviewDrive: bossState.longTermVision ? 72 : 50,
    excitementTriggers: bossState.cognitiveProfile.excitementTriggers,
    explanationPreferences: bossState.cognitiveProfile.explanationPreferences,
    antiPatterns: bossState.cognitiveProfile.antiPatterns,
  })

  useEffect(() => {
    setDraft({
      name: bossState.name,
      interests: bossState.interests,
      dislikes: bossState.dislikes,
      longTermVision: bossState.longTermVision,
      currentFocus: bossState.currentFocus,
      workStyle: bossState.preferredStyle,
      riskTolerance: bossState.riskTolerance,
      innovationBias: bossState.innovationBias,
      socialEnergy: 50,
      executionDiscipline: bossState.decisionSpeed === 'analytical' ? 72 : 58,
      emotionalSensitivity: 55,
      aestheticSensitivity: bossState.cognitiveProfile.resonanceHooks.length > 0 ? 70 : 50,
      curiosityBreadth: Math.min(100, Math.max(40, bossState.interests.length * 12)),
      worldviewDrive: bossState.longTermVision ? 72 : 50,
      excitementTriggers: bossState.cognitiveProfile.excitementTriggers,
      explanationPreferences: bossState.cognitiveProfile.explanationPreferences,
      antiPatterns: bossState.cognitiveProfile.antiPatterns,
    })
  }, [bossState])

  useEffect(() => {
    getLatestAssessmentRun().then(setLatestRun).catch(() => {})
  }, [])

  const impactPreview = useMemo(() => {
    const impacts: string[] = ['聊天回答结构']
    if (draft.currentFocus) impacts.push('自动研究主题')
    if (draft.longTermVision) impacts.push('War Room 的 Boss Match')
    if (draft.explanationPreferences.length > 0) impacts.push('知识整理方式')
    return impacts
  }, [draft.currentFocus, draft.longTermVision, draft.explanationPreferences.length])

  async function handleApplyQuickProfile() {
    setSaving(true)
    setStatus('正在生成并应用画像...')
    try {
      const result = await runQuickProfiling(draft)
      const refreshed = await getLatestAssessmentRun()
      setLatestRun(refreshed)
      await onApplied?.()
      setStatus(`已应用 ${result.normalized.summary.headline}，更新了 ${result.changedKeys.length} 个核心字段。`)
    } catch (err) {
      setStatus(`画像应用失败：${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sandbox-map__profiling-stack">
      <div className="sandbox-map__cognition-header">
        <div className="sandbox-map__cognition-copy">
          基于 `multi-dimension-profiling` 的轻量版接入骨架。先用快速画像收束 Boss 的工作风格、风险偏好、理解方式与阶段焦点，
          再把结果回写到系统主档，立即影响对话、推演和知识整理。
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {status && <span className="sandbox-map__cognition-status">{status}</span>}
          <button className="sandbox-map__btn" onClick={() => { window.location.hash = '#/profiling' }}>
            打开完整画像工坊
          </button>
          <button className="sandbox-map__btn sandbox-map__btn--primary" onClick={handleApplyQuickProfile} disabled={saving}>
            {saving ? '应用中...' : '应用快速画像'}
          </button>
        </div>
      </div>

      <div className="sandbox-map__profiling-grid">
        <label className="sandbox-map__cognition-field">
          <span className="sandbox-map__cognition-label">Boss 名称</span>
          <input
            className="sandbox-map__input"
            value={draft.name || ''}
            onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Boss"
          />
        </label>

        <label className="sandbox-map__cognition-field">
          <span className="sandbox-map__cognition-label">工作风格</span>
          <select
            className="sandbox-map__input"
            value={draft.workStyle}
            onChange={e => setDraft(prev => ({ ...prev, workStyle: e.target.value as QuickProfilingAnswers['workStyle'] }))}
          >
            <option value="analytical">分析建模</option>
            <option value="visionary">愿景牵引</option>
            <option value="pragmatic">务实推进</option>
            <option value="creative">创意表达</option>
          </select>
        </label>

        <label className="sandbox-map__cognition-field">
          <span className="sandbox-map__cognition-label">兴趣领域</span>
          <textarea
            className="sandbox-map__input"
            value={draft.interests.join('\n')}
            onChange={e => setDraft(prev => ({ ...prev, interests: parseList(e.target.value) }))}
            placeholder="每行一个兴趣"
          />
        </label>

        <label className="sandbox-map__cognition-field">
          <span className="sandbox-map__cognition-label">厌恶/禁区</span>
          <textarea
            className="sandbox-map__input"
            value={draft.dislikes.join('\n')}
            onChange={e => setDraft(prev => ({ ...prev, dislikes: parseList(e.target.value) }))}
            placeholder="每行一个禁区"
          />
        </label>

        <label className="sandbox-map__cognition-field">
          <span className="sandbox-map__cognition-label">长期愿景</span>
          <textarea
            className="sandbox-map__input"
            value={draft.longTermVision}
            onChange={e => setDraft(prev => ({ ...prev, longTermVision: e.target.value }))}
            placeholder="例如：建立自己的智能系统"
          />
        </label>

        <label className="sandbox-map__cognition-field">
          <span className="sandbox-map__cognition-label">当前焦点</span>
          <textarea
            className="sandbox-map__input"
            value={draft.currentFocus}
            onChange={e => setDraft(prev => ({ ...prev, currentFocus: e.target.value }))}
            placeholder="例如：把现有外脑闭环先跑通"
          />
        </label>
      </div>

      <div className="sandbox-map__profiling-sliders">
        <SliderField label="风险容忍" value={draft.riskTolerance} onChange={value => setDraft(prev => ({ ...prev, riskTolerance: value }))} />
        <SliderField label="创新偏好" value={draft.innovationBias} onChange={value => setDraft(prev => ({ ...prev, innovationBias: value }))} />
        <SliderField label="社交能量" value={draft.socialEnergy} onChange={value => setDraft(prev => ({ ...prev, socialEnergy: value }))} />
        <SliderField label="执行纪律" value={draft.executionDiscipline} onChange={value => setDraft(prev => ({ ...prev, executionDiscipline: value }))} />
        <SliderField label="情绪敏感度" value={draft.emotionalSensitivity} onChange={value => setDraft(prev => ({ ...prev, emotionalSensitivity: value }))} />
        <SliderField label="审美敏感度" value={draft.aestheticSensitivity} onChange={value => setDraft(prev => ({ ...prev, aestheticSensitivity: value }))} />
        <SliderField label="探索广度" value={draft.curiosityBreadth} onChange={value => setDraft(prev => ({ ...prev, curiosityBreadth: value }))} />
        <SliderField label="世界观驱动" value={draft.worldviewDrive} onChange={value => setDraft(prev => ({ ...prev, worldviewDrive: value }))} />
      </div>

      <div className="sandbox-map__profiling-grid">
        <label className="sandbox-map__cognition-field">
          <span className="sandbox-map__cognition-label">让我兴奋的入口</span>
          <textarea
            className="sandbox-map__input"
            value={draft.excitementTriggers.join('\n')}
            onChange={e => setDraft(prev => ({ ...prev, excitementTriggers: parseList(e.target.value) }))}
            placeholder="例如：第一性原理、跨学科连接"
          />
        </label>

        <label className="sandbox-map__cognition-field">
          <span className="sandbox-map__cognition-label">偏好的讲解方式</span>
          <textarea
            className="sandbox-map__input"
            value={draft.explanationPreferences.join('\n')}
            onChange={e => setDraft(prev => ({ ...prev, explanationPreferences: parseList(e.target.value) }))}
            placeholder="例如：先框架后案例"
          />
        </label>

        <label className="sandbox-map__cognition-field">
          <span className="sandbox-map__cognition-label">避免的表达</span>
          <textarea
            className="sandbox-map__input"
            value={draft.antiPatterns.join('\n')}
            onChange={e => setDraft(prev => ({ ...prev, antiPatterns: parseList(e.target.value) }))}
            placeholder="例如：空话、无证据判断"
          />
        </label>

        <div className="sandbox-map__profiling-impact">
          <div className="sandbox-map__cognition-label">本次画像会影响</div>
          <div className="sandbox-map__boss-tags">
            {impactPreview.map(item => (
              <span key={item} className="sandbox-map__boss-tag">{item}</span>
            ))}
          </div>
        </div>
      </div>

      {latestRun && (
        <div className="sandbox-map__profiling-latest">
          <div className="sandbox-map__profiling-latest-head">
            <div>
              <div className="sandbox-map__cognition-label">最近一次画像</div>
              <div className="sandbox-map__profiling-title">{latestRun.normalized.summary.headline}</div>
            </div>
            <div className="sandbox-map__profiling-meta">
              {latestRun.mode.toUpperCase()} · 可信度 {Math.round(latestRun.confidence * 100)}%
            </div>
          </div>
          <div className="sandbox-map__profiling-text">{latestRun.normalized.summary.narrative}</div>
          <div className="sandbox-map__profiling-columns">
            <div className="sandbox-map__profiling-card">
              <div className="sandbox-map__cognition-label">关键长板</div>
              <div className="sandbox-map__boss-tags">
                {latestRun.normalized.summary.keyStrengths.map(item => (
                  <span key={item} className="sandbox-map__boss-tag">{item}</span>
                ))}
              </div>
            </div>
            <div className="sandbox-map__profiling-card">
              <div className="sandbox-map__cognition-label">需要警惕</div>
              <div className="sandbox-map__boss-tags">
                {latestRun.normalized.summary.watchouts.map(item => (
                  <span key={item} className="sandbox-map__boss-tag sandbox-map__boss-tag--negative">{item}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
