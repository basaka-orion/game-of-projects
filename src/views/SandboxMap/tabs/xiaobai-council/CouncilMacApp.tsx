import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { archiveOutput } from '../../../../lib/knowledge/outputs'
import { COUNCIL_PERSONAS, type CouncilPersona } from '../../../../lib/xiaobai-council/personas'
import { buildCouncilCreativeEnhancement, type CouncilCreativeEnhancement } from '../../../../lib/xiaobai-council/creative-enhancement'
import { COUNCIL_DISTILLATION_STATUS_LABELS } from '../../../../lib/xiaobai-council/distillation'
import { buildCouncilPersonaProfile, type CouncilPersonaProfile } from '../../../../lib/xiaobai-council/profile'
import { runCouncilPrdWorkflow, type CouncilPrdRunResult } from '../../../../lib/xiaobai-council/workflow'
import { selectCouncilTeam, type CouncilSelection, type CouncilSelectedSeat } from '../../../../lib/xiaobai-council/selector'
import type { TeamMessage } from '../../../../lib/teams/types'
import { buildUiMuseumPrdContext } from '../../../../lib/ui-museum/context'
import { UI_STYLE_ITEMS } from '../../../../lib/ui-museum/catalog'
import CouncilDebateStage from './CouncilDebateStage'
import './CouncilMacApp.css'

const SAMPLE_PROMPT =
  '做一个小白也能用的 AI 项目 PRD 生成器：自动选择最合适的思想原型 agent，实时博弈，最后给出完整 PRD、动效和 Baoyu 图文解说。'

const WORKFLOW_STEPS = [
  '输入问题',
  '匹配闸门',
  '推荐编队',
  '确认激活',
  '实时博弈',
  '共识 PRD',
  'Baoyu 图文包',
]

export default function CouncilMacApp() {
  const [problem, setProblem] = useState('')
  const [selection, setSelection] = useState<CouncilSelection | null>(null)
  const [messages, setMessages] = useState<TeamMessage[]>([])
  const [result, setResult] = useState<CouncilPrdRunResult | null>(null)
  const [running, setRunning] = useState(false)
  const [activated, setActivated] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [preferredStyleIds, setPreferredStyleIds] = useState<string[]>([])
  const [creativePreview, setCreativePreview] = useState<CouncilCreativeEnhancement | null>(null)
  const [profilePersona, setProfilePersona] = useState<CouncilPersona | null>(null)
  const [personaProfile, setPersonaProfile] = useState<CouncilPersonaProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')

  const progressMessages = messages.filter((message) => message.kind !== 'reflection' && (message.kind === 'progress' || message.role === 'system'))
  const briefMessages = messages.filter((message) => message.kind === 'brief')
  const reflectionMessages = messages.filter((message) => message.kind === 'reflection')
  const artifactMessage = messages.find((message) => message.kind === 'artifact')
  const finalPrd = artifactMessage?.content || result?.session.summary || ''
  const selectedPersonaIds = useMemo(
    () => new Set(selection?.seats.map((seat) => seat.persona.id) || []),
    [selection],
  )
  const hiddenPersonas = useMemo(
    () => COUNCIL_PERSONAS.filter((persona) => !selectedPersonaIds.has(persona.id)).slice(0, 12),
    [selectedPersonaIds],
  )
  const matchGate = selection?.matchGate || result?.matchGate || null
  const currentStep = finalPrd ? 6 : running || briefMessages.length ? 4 : activated ? 3 : selection ? 2 : 0
  const uiStyleContext = useMemo(() => {
    const seed = [
      problem || SAMPLE_PROMPT,
      selection?.profile.domains.join(' / ') || '',
      selection?.seats.map((seat) => `${seat.persona.name} ${seat.seat.label}`).join('\n') || '',
      creativePreview?.promptFragment || '',
    ].join('\n\n')
    return result?.uiStyleContext || buildUiMuseumPrdContext(seed, preferredStyleIds)
  }, [creativePreview?.promptFragment, preferredStyleIds, problem, result?.uiStyleContext, selection])
  const styleOptions = useMemo(() => {
    const ids = new Set([
      ...uiStyleContext.styleIds,
      'agentic-os',
      'copilot-ai',
      'anthropic-serif',
      'holographic',
      'kinetic',
      'liquid-glass',
      'spatial',
      'data-ink',
    ])
    return Array.from(ids)
      .map((id) => UI_STYLE_ITEMS.find((item) => item.id === id))
      .filter((item): item is (typeof UI_STYLE_ITEMS)[number] => Boolean(item))
      .slice(0, 9)
  }, [uiStyleContext.styleIds])

  useEffect(() => {
    const text = problem.trim()
    if (!text) {
      setCreativePreview(null)
      return undefined
    }
    let cancelled = false
    buildCouncilCreativeEnhancement(text)
      .then((enhancement) => {
        if (!cancelled) setCreativePreview(enhancement)
      })
      .catch(() => {
        if (!cancelled) setCreativePreview(null)
      })
    return () => {
      cancelled = true
    }
  }, [problem])

  function resetRunState() {
    setResult(null)
    setMessages([])
    setSaved(false)
    setCopied(false)
    setError('')
    setActivated(false)
  }

  function loadSample() {
    setProblem(SAMPLE_PROMPT)
    setSelection(null)
    resetRunState()
  }

  function togglePreferredStyle(styleId: string) {
    setPreferredStyleIds((prev) =>
      prev.includes(styleId) ? prev.filter((id) => id !== styleId) : [styleId, ...prev].slice(0, 3),
    )
  }

  function recommendTeam(source = problem) {
    const text = source.trim()
    if (!text) {
      setError('先写下你要解决的问题，再让系统挑选最合适的智囊组合。')
      return
    }
    const next = selectCouncilTeam(text)
    setSelection(next)
    resetRunState()
  }

  function replaceSeat(target: CouncilSelectedSeat) {
    if (!selection) return
    const replacement =
      selection.alternates.find(
        (alternate) => alternate.seat.id === target.seat.id && !selectedPersonaIds.has(alternate.persona.id),
      ) || selection.alternates.find((alternate) => !selectedPersonaIds.has(alternate.persona.id))
    if (!replacement) return
    setSelection({
      ...selection,
      seats: selection.seats.map((seat) => (seat.seat.id === target.seat.id ? replacement : seat)),
      alternates: [target, ...selection.alternates.filter((item) => item.persona.id !== replacement.persona.id)],
    })
    resetRunState()
  }

  async function startCouncilRun() {
    const text = problem.trim()
    if (!text) {
      setError('先写下问题，再激活智囊团。')
      return
    }
    const current = selection || selectCouncilTeam(text)
    setSelection(current)
    setMessages([])
    setResult(null)
    setError('')
    setSaved(false)
    setCopied(false)
    setActivated(true)
    setRunning(true)
    try {
      const run = await runCouncilPrdWorkflow({
        problem: text,
        selection: current,
        preferredStyleIds,
        uiStyleContext,
        creativeEnhancement: creativePreview || undefined,
        onProgress: (message) => {
          setMessages((prev) => [...prev, message])
        },
      })
      setResult(run)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  async function copyPrd() {
    if (!finalPrd) return
    await navigator.clipboard.writeText(finalPrd)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  function downloadPrd() {
    if (!finalPrd) return
    const blob = new Blob([finalPrd], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `小白智囊团_PRD_${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  function downloadBaoyuPack() {
    if (!result?.baoyuVisualPlans.length) return
    const cards = result.baoyuVisualPlans.flatMap((plan) => plan.imageDataUrls || [])
    const html = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>小白智囊团 Baoyu 图文包</title>
<style>
body{margin:0;background:#07111f;color:#e8f7ff;font-family:"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC",sans-serif;padding:28px;}
h1{font-size:24px;margin:0 0 18px;}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;}
img{width:100%;border:1px solid rgba(103,232,249,.32);background:#050b14;}
pre{white-space:pre-wrap;border:1px solid rgba(255,255,255,.12);padding:16px;}
</style></head>
<body>
<h1>小白智囊团 Baoyu 本地中文图文包</h1>
<div class="grid">${cards.map((src, index) => `<img src="${src}" alt="Baoyu card ${index + 1}">`).join('')}</div>
<pre>${escapeHtml(buildExportMarkdown())}</pre>
</body></html>`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `小白智囊团_Baoyu_图文包_${Date.now()}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function savePrd() {
    if (!finalPrd) return
    await archiveOutput({
      question: `小白智囊团 PRD：${problem.slice(0, 100)}`,
      answer: buildExportMarkdown(),
      quality: 5,
      tags: ['小白智囊团', 'PRD', '群策', 'Baoyu'],
    })
    setSaved(true)
  }

  async function openPersonaProfile(persona: CouncilPersona) {
    setProfilePersona(persona)
    setPersonaProfile(null)
    setProfileError('')
    setProfileLoading(true)
    try {
      const profile = await buildCouncilPersonaProfile({
        persona,
        activatedAgents: result?.activatedAgents,
        messages,
      })
      setPersonaProfile(profile)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : String(err))
    } finally {
      setProfileLoading(false)
    }
  }

  function closePersonaProfile() {
    setProfilePersona(null)
    setPersonaProfile(null)
    setProfileError('')
    setProfileLoading(false)
  }

  function buildExportMarkdown(): string {
    const roster =
      selection?.seats
        .map((seat, index) => `${index + 1}. ${seat.persona.name} - ${seat.seat.label}`)
        .join('\n') || ''
    const visuals =
      result?.baoyuVisualPlans
        .map((item) => `### ${item.label}\n- command: ${item.command}\n- style: ${item.style}\n- layout: ${item.layout}\n\n${item.prompt}`)
        .join('\n\n') || ''
    return `# 小白智囊团 PRD

## 用户问题

${problem}

## 自动编队

${roster}

## CouncilMatchGate

${selection?.matchGate.explanation.map((item) => `- ${item}`).join('\n') || '尚未生成匹配闸门。'}

## Creative DNA / 创意增强

${result?.creativeEnhancement.promptFragment || creativePreview?.promptFragment || '尚未生成创意增强。'}

## UI风格馆主题

- styles: ${uiStyleContext.styleNames.join(' / ')}
- reasoning: ${uiStyleContext.reasoning}
- tokens: ${uiStyleContext.visual.palette.join(' / ')} · ${uiStyleContext.visual.motion}

## PRD

${finalPrd}

## Baoyu-ready 图文解说包

${visuals}
`
  }

  return (
    <div className="council-app">
      <section className="council-app__workflow" aria-label="小白智囊团流程">
        {WORKFLOW_STEPS.map((step, index) => (
          <div
            key={step}
            className={`council-app__workflow-step ${index <= currentStep ? 'council-app__workflow-step--active' : ''}`}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </section>

      <section className="council-app__workbench">
        <div className="council-app__composer">
          <div className="council-app__section-kicker">小白智囊团 · PRD 闭环</div>
          <div className="council-app__composer-head">
            <div>
              <h1>隐藏思想原型，先选对人再激活</h1>
              <p>系统会先进入 CouncilMatchGate，判断类型、难度、证据、工程、视觉、Nuwa 蒸馏可信度、dream 对齐和反方价值，再推荐最合适的团队。</p>
            </div>
            <button type="button" onClick={loadSample} disabled={running}>
              载入样例
            </button>
          </div>
          <textarea
            value={problem}
            onChange={(event) => {
              setProblem(event.target.value)
              if (selection || activated || result) {
                setSelection(null)
                resetRunState()
              }
            }}
            placeholder="描述你要解决的项目或世界级难题。比如：我要做一个什么应用，它服务谁，最终要产出 PRD、调研、图文解说还是执行路线..."
          />
          <div className="council-app__actions">
            <button type="button" className="council-app__primary" onClick={() => recommendTeam()} disabled={!problem.trim() || running}>
              生成推荐编队
            </button>
            <button type="button" onClick={startCouncilRun} disabled={!selection || running}>
              {running ? '智囊团博弈中...' : '激活推荐队伍并开始博弈'}
            </button>
          </div>
          {error && <div className="council-app__error">{error}</div>}

          {selection ? (
            <div className="council-app__profile">
              <div>
                <span>问题画像</span>
                <strong>PRD · 难度 {selection.profile.difficulty}/5 · 风险 {selection.profile.riskLevel}</strong>
              </div>
              <div>
                <span>领域</span>
                <strong>{selection.profile.domains.join(' / ')}</strong>
              </div>
              <div>
                <span>需求</span>
                <strong>
                  {[
                    selection.profile.needsEvidence ? '证据链' : '',
                    selection.profile.needsEngineering ? '工程落地' : '',
                    selection.profile.needsVisual ? '视觉图文' : '',
                  ]
                    .filter(Boolean)
                    .join(' / ') || '产品闭环'}
                </strong>
              </div>
            </div>
          ) : (
            <div className="council-app__empty-note">
              现在所有角色仍是隐藏角色，不会同步到副官或外部平台。生成推荐编队后，你可以看推荐理由、替换角色，再确认本地激活；Telegram 只作为以后可选绑定。
            </div>
          )}
        </div>

        <CouncilDebateStage
          selection={selection}
          messages={messages}
          running={running}
          activated={activated}
          uiStyleContext={uiStyleContext}
          creativeEnhancement={result?.creativeEnhancement || creativePreview}
          agentDreamStates={result?.agentDreamStates || []}
        />
      </section>

      <section className="council-app__intelligence-strip" aria-label="智囊团画像和风格输入">
        <article>
          <div className="council-app__section-kicker">Creative DNA</div>
          <h3>{creativePreview ? '创意孵化器增强已接入' : '等待问题生成画像线索'}</h3>
          <p>{creativePreview?.creativeDnaSummary || '输入问题后会读取创意孵化器画像、Boss 画像和本轮问题，生成六阶段创意增强。'}</p>
          {creativePreview && <small>{creativePreview.source} · 追问 / 发散 / 冲突 / 共识 / 设计 / 产出</small>}
        </article>
        <article>
          <div className="council-app__section-kicker">UI风格馆 · 自动+可覆写</div>
          <h3>{uiStyleContext.styleNames.join(' / ')}</h3>
          <p>{uiStyleContext.reasoning}</p>
          <div className="council-app__style-picks">
            {styleOptions.map((style) => (
              <button
                key={style.id}
                type="button"
                className={preferredStyleIds.includes(style.id) ? 'council-app__style-pick--active' : ''}
                onClick={() => togglePreferredStyle(style.id)}
                disabled={running}
              >
                {style.title.replace(/^\d+\.\s*/, '')}
              </button>
            ))}
          </div>
        </article>
      </section>

      {matchGate && (
        <section className="council-app__panel council-app__match-gate" aria-label="CouncilMatchGate 先匹配再解决">
          <div className="council-app__panel-head">
            <div>
              <div className="council-app__section-kicker">CouncilMatchGate · 先匹配再解决</div>
              <h2>本轮不是全员群聊，而是先选最高效协作阵容</h2>
              <p>{matchGate.explanation.join(' ')}</p>
            </div>
          </div>
          <div className="council-app__gate-readiness">
            <article>
              <span>Nuwa 覆盖</span>
              <strong>{matchGate.readiness.nuwaCoverage}</strong>
            </article>
            <article>
              <span>技能成熟</span>
              <strong>{matchGate.readiness.skillMaturity}</strong>
            </article>
            <article>
              <span>证据强度</span>
              <strong>{matchGate.readiness.evidenceStrength}</strong>
            </article>
            <article>
              <span>反方覆盖</span>
              <strong>{matchGate.readiness.riskCoverage}</strong>
            </article>
          </div>
          <div className="council-app__candidate-board">
            {matchGate.finalTeam.map((item) => (
              <article key={`${item.seatId}-${item.personaId}`}>
                <span>{item.role}</span>
                <h3>{item.personaName}</h3>
                <strong>{item.score.toFixed(1)}</strong>
                <p>{item.reasons.slice(0, 3).join(' / ') || '匹配本轮问题画像'}</p>
              </article>
            ))}
          </div>
          <div className="council-app__collab-map">
            {matchGate.collaborationMatrix.slice(0, 6).map((edge) => (
              <p key={`${edge.fromPersonaId}-${edge.toPersonaId}`}>
                <strong>{edge.relation}</strong>
                {edge.reason}
              </p>
            ))}
          </div>
        </section>
      )}

      {!selection && (
        <section className="council-app__panel">
          <div className="council-app__panel-head">
            <div>
              <div className="council-app__section-kicker">隐藏角色库</div>
              <h2>{COUNCIL_PERSONAS.length} 个公开思想原型等待被选择</h2>
              <p>当前 36 位只是第一批；以后只要是真实存在且公开资料足够的人类鬼才，都可以进入 Nuwa 逐个精修队列。</p>
            </div>
          </div>
          <div className="council-app__hidden-grid">
            {hiddenPersonas.map((persona) => (
              <button
                key={persona.id}
                type="button"
                className="council-app__hidden-persona"
                style={{ '--persona': persona.color } as CSSProperties}
                onClick={() => openPersonaProfile(persona)}
              >
                <span>{persona.icon}</span>
                <strong>{persona.name}</strong>
                <small>{persona.domains.slice(0, 3).join(' / ')}</small>
                <em>{COUNCIL_DISTILLATION_STATUS_LABELS[persona.distillationStatus]}</em>
              </button>
            ))}
          </div>
        </section>
      )}

      {selection && (
        <section className="council-app__grid">
          <div className="council-app__panel council-app__panel--wide">
            <div className="council-app__panel-head">
              <div>
                <div className="council-app__section-kicker">{activated ? '已激活队伍' : '推荐编队 · 待激活'}</div>
                <h2>{selection.seats.length} 位真实人类原型，按席位进入博弈</h2>
                <p>点击“替换”可以换掉某个席位；点击激活后才会写入 custom_agents，并出现在本地副官、群策和控制面板。Telegram 默认关闭，Nuwa 产物注册为本地 skill。</p>
              </div>
              <button type="button" className="council-app__primary" onClick={startCouncilRun} disabled={running || activated}>
                {running ? '博弈中...' : activated ? '已激活' : '激活推荐队伍'}
              </button>
            </div>
            <div className="council-app__roster">
              {selection.seats.map((seat) => (
                <article
                  key={seat.seat.id}
                  className="council-app__persona"
                  style={{ '--persona': seat.persona.color } as CSSProperties}
                  onClick={() => openPersonaProfile(seat.persona)}
                >
                  <div className="council-app__persona-top">
                    <span>{seat.persona.icon}</span>
                    <div>
                      <h3>{seat.persona.name}</h3>
                      <small>{seat.seat.label}</small>
                    </div>
                    <strong>{seat.score.toFixed(1)}</strong>
                  </div>
                  <p>{seat.seat.mission}</p>
                  <div className="council-app__score-grid">
                    <span>Nuwa {seat.scoreFactors.nuwaCredibility.toFixed(1)}</span>
                    <span>Dream {seat.scoreFactors.dreamAlignment.toFixed(1)}</span>
                    <span>技能 {seat.scoreFactors.skillMaturity.toFixed(1)}</span>
                    <span>反方 {seat.scoreFactors.oppositionValue.toFixed(1)}</span>
                  </div>
                  <div className="council-app__reasons">
                    {seat.reasons.slice(0, 3).map((reason) => (
                      <span key={reason}>{reason}</span>
                    ))}
                  </div>
                  <div className="council-app__policy">{seat.persona.publicBasis}</div>
                  <div className="council-app__nuwa-status">
                    {COUNCIL_DISTILLATION_STATUS_LABELS[seat.persona.distillationStatus]}
                    {seat.persona.nuwaSkillId ? ` · ${seat.persona.nuwaSkillId}` : ' · 待本地蒸馏'}
                  </div>
                  <button type="button" onClick={(event) => { event.stopPropagation(); replaceSeat(seat) }} disabled={running || activated}>
                    替换
                  </button>
                </article>
              ))}
            </div>
          </div>

          <div className="council-app__panel">
            <div className="council-app__section-kicker">过程直播</div>
            <h2>实时博弈</h2>
            <div className="council-app__timeline">
              {progressMessages.slice(-8).map((message) => (
                <div key={message.id}>
                  <span />
                  <p>{message.content}</p>
                </div>
              ))}
              {progressMessages.length === 0 && (
                <p className="council-app__muted">
                  推荐队伍尚未激活。激活后这里会显示编队、角色开工宣言、轮次发言和成稿进度。
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {briefMessages.length > 0 && (
        <section className="council-app__panel">
          <div className="council-app__section-kicker">角色博弈短评</div>
          <h2>每个角色独立发言，最后再收束</h2>
          <div className="council-app__briefs">
            {briefMessages.map((message) => (
              <article key={message.id}>
                <strong>{message.agentName}</strong>
                <span>{String(message.metadata?.phase || (message.round ? `Round ${message.round}` : 'brief'))}</span>
                <p>{message.content}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {reflectionMessages.length > 0 && (
        <section className="council-app__panel">
          <div className="council-app__section-kicker">Hermes 本轮学习</div>
          <h2>反思写入私有记忆，下轮再生效</h2>
          <div className="council-app__reflections">
            {reflectionMessages.slice(-10).map((message) => (
              <article key={message.id}>
                <strong>{message.agentName}</strong>
                <span>{String(message.metadata?.phase || 'reflection')}</span>
                <p>{message.content}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {finalPrd && (
        <section className="council-app__panel council-app__panel--artifact">
          <div className="council-app__panel-head">
            <div>
              <div className="council-app__section-kicker">共识成稿</div>
              <h2>事无巨细 PRD</h2>
              <p>已由智囊团收束，可复制、下载或归档到知识+大佬。</p>
            </div>
            <div className="council-app__artifact-actions">
              <button type="button" onClick={copyPrd}>{copied ? '已复制' : '复制'}</button>
              <button type="button" onClick={downloadPrd}>下载 Markdown</button>
              <button type="button" onClick={savePrd}>{saved ? '已归档' : '归档'}</button>
            </div>
          </div>
          <pre>{finalPrd}</pre>
        </section>
      )}

      {result?.baoyuVisualPlans.length ? (
        <section className="council-app__panel">
          <div className="council-app__section-kicker">Baoyu-ready 图文解说包</div>
          <div className="council-app__panel-head">
            <div>
              <h2>已生成本地中文图文卡</h2>
              <p>GLM-5.1 负责结构化文案，DeepSeek V4 Flash 做校对备选，本地 SVG 负责中文排版；图片模型不直接写中文。</p>
            </div>
            <button type="button" className="council-app__primary" onClick={downloadBaoyuPack}>
              导出图文包
            </button>
          </div>
          <div className="council-app__visuals">
            {result.baoyuVisualPlans.map((item) => (
              <article key={item.id}>
                <span>{item.label}</span>
                <h3>{item.title}</h3>
                {item.imageDataUrls?.length ? (
                  <div className="council-app__visual-images">
                    {item.imageDataUrls.slice(0, 4).map((src, index) => (
                      <img key={`${item.id}-${index}`} src={src} alt="" />
                    ))}
                  </div>
                ) : null}
                <p>{item.previewMarkdown}</p>
                <code>{item.command} · {item.style} · {item.layout} · {item.textRenderMode || 'prompt'}</code>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {profilePersona && (
        <div className="council-profile-modal" role="presentation" onClick={closePersonaProfile}>
          <section
            className="council-profile-modal__panel"
            role="dialog"
            aria-modal="true"
            aria-label={`${profilePersona.name} 角色档案`}
            style={{ '--persona': profilePersona.color } as CSSProperties}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="council-profile-modal__close" onClick={closePersonaProfile}>
              关闭
            </button>
            <div className="council-profile-modal__hero">
              <span>{profilePersona.icon}</span>
              <div>
                <div className="council-app__section-kicker">独立角色档案</div>
                <h2>{profilePersona.name}</h2>
                <p>{profilePersona.publicBasis}</p>
              </div>
            </div>

            {profileLoading && <div className="council-profile-modal__loading">正在读取本地 SOUL、MEMORY、reflection 和 dream state...</div>}
            {profileError && <div className="council-app__error">{profileError}</div>}

            {personaProfile && (
              <>
                <div className="council-profile-modal__dream">
                  <span>当前动态 Dream</span>
                  <strong>{personaProfile.dreamState.currentDream}</strong>
                  <p>{personaProfile.dreamState.freezeRule}</p>
                </div>

                <div className="council-profile-modal__nuwa">
                  <div>
                    <span>Nuwa 蒸馏状态</span>
                    <strong>{COUNCIL_DISTILLATION_STATUS_LABELS[personaProfile.distillationProfile.distillationStatus]}</strong>
                    <p>{personaProfile.distillationProfile.sourceSummary}</p>
                  </div>
                  <div>
                    <span>Skill 包</span>
                    <strong>{personaProfile.distillationProfile.skillPackagePath}SKILL.md</strong>
                    <p>{personaProfile.distillationProfile.nuwaSkillId ? `种子：${personaProfile.distillationProfile.nuwaSkillId}` : '等待逐个精修蒸馏。'}</p>
                  </div>
                </div>

                <div className="council-profile-modal__grid">
                  <article>
                    <h3>真实人类依据</h3>
                    <p>
                      {personaProfile.distillationProfile.realHumanBasis.displayName}<br />
                      {personaProfile.distillationProfile.realHumanBasis.publicMaterialSummary}
                    </p>
                    <small>{personaProfile.distillationProfile.realHumanBasis.seedReference || 'Openbasaka 本地逐个精修队列'}</small>
                  </article>
                  <article>
                    <h3>SOUL</h3>
                    <p>{personaProfile.soul?.identity || '尚未激活为本地 agent，当前展示公开原型种子。'}</p>
                    <small>{personaProfile.soul?.tone || profilePersona.temperament}</small>
                  </article>
                  <article>
                    <h3>本地资料</h3>
                    <p>
                      workspace: {personaProfile.agent?.workspaceScope || 'openbasaka-local-council'}<br />
                      surfaced: {(personaProfile.agent?.surfacedIn || ['openbasaka', 'teams', 'control']).join(' / ')}<br />
                      Telegram: {personaProfile.agent?.telegramEnabled ? 'enabled' : 'disabled'}
                    </p>
                    <small>{personaProfile.safety.privateDataRule}</small>
                  </article>
                  <article>
                    <h3>模型与技能</h3>
                    <p>
                      primary: {String(personaProfile.agent?.modelRoute?.primary || 'glm-5.1')}<br />
                      review: {String(personaProfile.agent?.modelRoute?.reviewFast || 'deepseek-v4-flash')}<br />
                      skills: {profilePersona.defaultSkills.join(' / ')}
                    </p>
                  </article>
                  <article>
                    <h3>贡献与分歧</h3>
                    <p>
                      brief {personaProfile.contributions.briefCount} · reflection {personaProfile.contributions.reflectionCount}<br />
                      {personaProfile.contributions.latest}
                    </p>
                  </article>
                </div>

                <div className="council-profile-modal__audit">
                  <article>
                    <h3>为什么必须有它</h3>
                    <p>{personaProfile.distillationProfile.auditCard.whyEssential}</p>
                    <strong>{personaProfile.distillationProfile.auditCard.irreplaceableAbility}</strong>
                  </article>
                  <article>
                    <h3>心智模型候选</h3>
                    {personaProfile.distillationProfile.mentalModels.slice(0, 5).map((model) => (
                      <p key={model.id}>
                        <strong>{model.label}</strong>
                        {model.description}
                      </p>
                    ))}
                  </article>
                  <article>
                    <h3>反模式与诚实边界</h3>
                    {personaProfile.distillationProfile.antiPatterns.slice(0, 5).map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                  </article>
                </div>

                <div className="council-profile-modal__columns">
                  <div>
                    <h3>让 Dream 变化的证据</h3>
                    {personaProfile.dreamState.evidence.map((item, index) => (
                      <p key={`${item.kind}-${index}`}>
                        <strong>{item.label}</strong>
                        {item.text}
                      </p>
                    ))}
                  </div>
                  <div>
                    <h3>下一阶段志向</h3>
                    <p>{personaProfile.dreamState.nextAspiration}</p>
                    <h3>记忆短摘</h3>
                    {personaProfile.memory.recentEntries.length ? (
                      personaProfile.memory.recentEntries.map((entry) => <p key={`${entry.createdAt}-${entry.text}`}>{entry.text}</p>)
                    ) : (
                      <p>还没有可展示的私有记忆短摘。</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
