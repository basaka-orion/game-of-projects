import { useMemo } from 'react'
import type {
  CouncilDebateMap,
  CouncilDebateRelation,
  CouncilDebateScene,
  CouncilVerdictLedger,
  CouncilVerdictLedgerItem,
} from '../../../../lib/xiaobai-council/debate-theater'
import type { CouncilQualityRevisionRound } from '../../../../lib/xiaobai-council/quality-gate'

const RELATION_LABELS: Record<CouncilDebateRelation, string> = {
  support: '支持',
  oppose: '反对',
  revise: '修正',
  absorb: '吸收',
  cut: '裁掉',
}

const MOVE_LABELS: Record<CouncilDebateRelation, string> = {
  support: '提出主张',
  oppose: '正面质询',
  revise: '修正补强',
  absorb: '裁决吸收',
  cut: '裁掉方案',
}

interface DebateTheaterViewProps {
  scenes: CouncilDebateScene[]
  currentIndex: number
  onCurrentIndexChange: (index: number) => void
  onStartDebate?: () => void
  canStartDebate?: boolean
  startDisabled?: boolean
}

interface CouncilDebateActSummary {
  phaseLabel: string
  firstIndex: number
  count: number
  dominantMove: string
  verdict: string
}

function compact(value: string, max = 96): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function buildActSummaries(scenes: CouncilDebateScene[]): CouncilDebateActSummary[] {
  const summaries: CouncilDebateActSummary[] = []
  for (const scene of scenes) {
    const existing = summaries.find((item) => item.phaseLabel === scene.phaseLabel)
    const move = scene.objection ? '冲突' : scene.verdictImpact ? '裁决' : scene.evidence ? '证据' : '主张'
    if (existing) {
      existing.count += 1
      if (!existing.verdict && scene.verdictImpact) existing.verdict = compact(scene.verdictImpact)
      if (existing.dominantMove === '主张' && move !== '主张') existing.dominantMove = move
      continue
    }
    summaries.push({
      phaseLabel: scene.phaseLabel,
      firstIndex: scene.sceneNo - 1,
      count: 1,
      dominantMove: move,
      verdict: scene.verdictImpact ? compact(scene.verdictImpact) : '',
    })
  }
  return summaries
}

function sceneMove(scene: CouncilDebateScene): CouncilDebateRelation {
  const content = `${scene.claim}\n${scene.objection}\n${scene.verdictImpact}`
  if (/裁掉|砍掉|否决|不做|暂缓/.test(content)) return 'cut'
  if (/反对|质询|不同意|失败|漏洞|风险|过度/.test(content)) return 'oppose'
  if (/修正|补充|改为|替换|调整|降级/.test(content)) return 'revise'
  if (/采纳|吸收|保留|裁决/.test(content) || /主持裁决|共识成稿/.test(scene.phaseLabel)) return 'absorb'
  return 'support'
}

export function DebateTheaterView({
  scenes,
  currentIndex,
  onCurrentIndexChange,
  onStartDebate,
  canStartDebate = false,
  startDisabled = false,
}: DebateTheaterViewProps) {
  const safeIndex = Math.min(Math.max(currentIndex, 0), Math.max(0, scenes.length - 1))
  const scene = scenes[safeIndex]
  const actSummaries = useMemo(() => buildActSummaries(scenes), [scenes])
  const move = scene ? sceneMove(scene) : 'support'

  if (!scene || scene.id === 'scene-waiting-for-briefs') {
    return (
      <section className="council-theater">
        <div className="council-app__section-kicker">辩论剧场</div>
        <h2>{canStartDebate ? '推荐队伍已就位，下一步必须开会' : '六阶段会场正在形成第一幕'}</h2>
        <p>
          {canStartDebate
            ? '这里不能再伪装成“提出主张”。只有真正开始六阶段博弈后，方法论提取、反方质询、主持裁决和 PRD 条款才会逐幕写入。'
            : '系统会先写入启动快照和阶段推进；角色发言返回后，这里会自动变成可翻页、可追溯的真实剧场。'}
        </p>
        {canStartDebate && onStartDebate && (
          <button type="button" className="council-app__primary" onClick={onStartDebate} disabled={startDisabled}>
            开始六阶段博弈并生成 PRD
          </button>
        )}
      </section>
    )
  }

  return (
    <section className="council-theater" aria-label="小白智囊团辩论剧场">
      <div className="council-theater__head">
        <div>
          <div className="council-app__section-kicker">认知剧场 · 分幕推进</div>
          <h2>{scene.sceneTitle}</h2>
          <p>{scene.phaseLabel} · 第 {scene.sceneNo} 幕 / 共 {scenes.length} 幕</p>
        </div>
        <strong className={`council-theater__move council-theater__move--${move}`}>{MOVE_LABELS[move]}</strong>
        <div className="council-theater__controls">
          <button type="button" onClick={() => onCurrentIndexChange(safeIndex - 1)} disabled={safeIndex === 0}>
            上一幕
          </button>
          <button type="button" onClick={() => onCurrentIndexChange(safeIndex + 1)} disabled={safeIndex >= scenes.length - 1}>
            下一幕
          </button>
        </div>
      </div>

      <div className="council-theater__acts" aria-label="剧情章节">
        {actSummaries.map((act, index) => (
          <button
            key={`${act.phaseLabel}-${index}`}
            type="button"
            className={safeIndex >= act.firstIndex && safeIndex < act.firstIndex + act.count ? 'council-theater__act--active' : ''}
            onClick={() => onCurrentIndexChange(act.firstIndex)}
          >
            <span>Act {index + 1} · {act.count} 幕</span>
            <strong>{act.phaseLabel}</strong>
            <p>{act.dominantMove}{act.verdict ? `：${act.verdict}` : ''}</p>
          </button>
        ))}
      </div>

      <div className="council-theater__stage">
        <aside className="council-theater__rail" aria-label="场景索引">
          {scenes.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={index === safeIndex ? 'council-theater__rail-item--active' : ''}
              onClick={() => onCurrentIndexChange(index)}
            >
              <span>{String(item.sceneNo).padStart(2, '0')}</span>
              <strong>{item.phaseLabel}</strong>
            </button>
          ))}
        </aside>

        <article className="council-theater__scene">
          <div className="council-theater__dialogue">
            <div>
              <span>发言者</span>
              <strong>{scene.speakerName}</strong>
            </div>
            <i aria-hidden="true" />
            <div>
              <span>指向对象</span>
              <strong>{scene.targetNames.join(' / ') || '主持裁决'}</strong>
            </div>
          </div>
          <div className="council-theater__claim">
            <span>核心主张</span>
            <p>{scene.claim || '本幕没有抽取到明确主张。'}</p>
          </div>
          {scene.objection && (
            <div className="council-theater__objection">
              <span>质询 / 修正</span>
              <p>{scene.objection}</p>
            </div>
          )}
          {scene.evidence && (
            <div>
              <span>证据线索</span>
              <p>{scene.evidence}</p>
            </div>
          )}
          {scene.verdictImpact && (
            <div>
              <span>影响 PRD 条款</span>
              <p>{scene.verdictImpact}</p>
            </div>
          )}
          <details>
            <summary>展开原始发言与来源消息</summary>
            <p>{scene.sourceExcerpt || '暂无原始短摘。'}</p>
            <small>{scene.sourceMessageIds.join(' / ') || '无来源消息 id'}</small>
          </details>
        </article>
      </div>
    </section>
  )
}

interface CouncilRelationMapProps {
  debateMap: CouncilDebateMap
  activeSceneId?: string
}

export function CouncilRelationMap({ debateMap, activeSceneId }: CouncilRelationMapProps) {
  const activeEdges = useMemo(
    () => debateMap.edges.filter((edge) => !activeSceneId || edge.sourceSceneId === activeSceneId),
    [activeSceneId, debateMap.edges],
  )
  const nodeName = (id: string) => debateMap.nodes.find((node) => node.id === id)?.label || id
  const edges = activeEdges.length ? activeEdges : debateMap.edges.slice(0, 12)

  return (
    <section className="council-map" aria-label="大师关系地图">
      <div className="council-app__section-kicker">关系地图 · 协作张力</div>
      <h2>支持、反对、修正、吸收如何流向裁决</h2>
      <p>{debateMap.summary}</p>
      <div className="council-map__nodes">
        {debateMap.nodes.map((node) => (
          <span key={node.id} data-kind={node.kind}>
            {node.label}
          </span>
        ))}
      </div>
      <div className="council-map__edges">
        {edges.map((edge) => (
          <article key={edge.id} data-relation={edge.relation}>
            <strong>{nodeName(edge.fromId)} {'->'} {nodeName(edge.toId)}</strong>
            <span>{RELATION_LABELS[edge.relation]} · {Math.round(edge.strength * 100)}%</span>
            <p>{edge.label}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

interface VerdictLedgerPanelProps {
  ledger: CouncilVerdictLedger
  revisionHistory: CouncilQualityRevisionRound[]
}

export function VerdictLedgerPanel({ ledger, revisionHistory }: VerdictLedgerPanelProps) {
  return (
    <section className="council-ledger" aria-label="裁决账本">
      <div className="council-app__section-kicker">裁决账本 · 可追溯取舍</div>
      <h2>最终 PRD 为什么这样写</h2>
      <p>{ledger.summary}</p>
      <div className="council-ledger__grid">
        <LedgerSection title="保留观点" items={ledger.kept} />
        <LedgerSection title="被裁掉方案" items={ledger.cut} />
        <LedgerSection title="修正吸收" items={ledger.revised} />
        <LedgerSection title="证据缺口" items={ledger.evidenceGaps} />
        <LedgerSection title="影响 PRD 条款" items={ledger.prdImpacts} />
        <LedgerSection title="仍保留分歧" items={ledger.openDisagreements} />
      </div>
      <div className="council-ledger__revisions">
        <h3>质量闸门返修链</h3>
        {revisionHistory.length ? (
          revisionHistory.map((round) => (
            <article key={round.round}>
              <strong>Round {round.round} · {round.status}</strong>
              <span>{round.scoreBefore} {'->'} {round.scoreAfter ?? 'pending'} · {round.finalGateStatus || 'pending'}</span>
              <p>{round.summary}</p>
            </article>
          ))
        ) : (
          <p>本轮没有触发自动返修，或还未进入质量闸门。</p>
        )}
      </div>
    </section>
  )
}

function LedgerSection({ title, items }: { title: string; items: CouncilVerdictLedgerItem[] }) {
  return (
    <article className="council-ledger__section">
      <h3>{title}</h3>
      {items.length ? (
        items.map((item) => (
          <p key={item.id}>
            {item.label}
            {item.sourceMessageIds.length > 0 && <small>{item.sourceMessageIds.join(' / ')}</small>}
          </p>
        ))
      ) : (
        <p className="council-app__muted">暂无明确记录。</p>
      )}
    </article>
  )
}
