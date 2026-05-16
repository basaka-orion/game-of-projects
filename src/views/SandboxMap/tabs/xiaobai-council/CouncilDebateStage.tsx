import { useEffect, useMemo, useState } from 'react'
import { Player } from '@remotion/player'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { UiMuseumPrdContext } from '../../../../lib/ui-museum/context'
import type { CouncilBaoyuVisualPlan } from '../../../../lib/xiaobai-council/baoyu'
import type { CouncilCreativeEnhancement } from '../../../../lib/xiaobai-council/creative-enhancement'
import type { CouncilDebateMap, CouncilDebateScene } from '../../../../lib/xiaobai-council/debate-theater'
import type { AgentDreamState } from '../../../../lib/xiaobai-council/dream'
import type { CouncilQualityGate } from '../../../../lib/xiaobai-council/quality-gate'
import type { CouncilSelection } from '../../../../lib/xiaobai-council/selector'
import type { TeamMessage } from '../../../../lib/teams/types'

interface CouncilDebateStageProps {
  selection: CouncilSelection | null
  messages: TeamMessage[]
  running: boolean
  activated: boolean
  uiStyleContext?: UiMuseumPrdContext | null
  creativeEnhancement?: CouncilCreativeEnhancement | null
  agentDreamStates?: AgentDreamState[]
  debateScenes?: CouncilDebateScene[]
  debateMap?: CouncilDebateMap | null
  qualityGate?: CouncilQualityGate | null
  baoyuVisualPlans?: CouncilBaoyuVisualPlan[]
}

interface CouncilDebateCompositionProps {
  names: string[]
  headline: string
  phase: string
  running: boolean
  activated: boolean
  styleNames: string[]
  theme: {
    background: string
    surface: string
    accent: string
    text: string
    border: string
    motion: string
  }
  creativeSource: string
  dreamLines: string[]
  currentSceneTitle: string
  currentSpeaker: string
  currentTarget: string
  conflictCount: number
  qualityScore?: number
  qualityStatus?: string
  baoyuCount: number
}

function CouncilDebateComposition({
  names,
  headline,
  phase,
  running,
  activated,
  styleNames,
  theme,
  creativeSource,
  dreamLines,
  currentSceneTitle,
  currentSpeaker,
  currentTarget,
  conflictCount,
  qualityScore,
  qualityStatus,
  baoyuCount,
}: CouncilDebateCompositionProps) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const pulse = interpolate(frame % 90, [0, 45, 90], [0.22, 0.72, 0.22])
  const orbit = interpolate(frame, [0, durationInFrames], [0, 360])
  const scan = interpolate(frame % 120, [0, 120], [-20, 120])
  const cast = names.length ? names.slice(0, 7) : ['隐藏角色', '问题画像', '推荐编队', '等待激活']

  return (
    <AbsoluteFill
      style={{
        background:
          `radial-gradient(circle at 18% 16%, ${theme.accent}42, transparent 28%), radial-gradient(circle at 86% 76%, ${theme.border}26, transparent 24%), linear-gradient(135deg, ${theme.background}, #111827 52%, ${theme.surface})`,
        color: theme.text,
        fontFamily: 'Inter, ui-sans-serif, system-ui',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 24,
          border: `1px solid ${theme.border}66`,
          background:
            'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: `${scan}%`,
          top: 24,
          bottom: 24,
          width: 120,
          background: `linear-gradient(90deg, transparent, ${theme.accent}1F, transparent)`,
          transform: 'skewX(-10deg)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 34,
          left: 40,
          right: 40,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          letterSpacing: 0,
          fontSize: 13,
          color: 'rgba(236, 254, 255, 0.74)',
        }}
      >
        <span>XIAOBAI COUNCIL</span>
        <span>{phase} · {styleNames.slice(0, 2).join(' / ') || 'UI Museum'}</span>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 86,
          left: 42,
          width: 330,
          fontSize: 32,
          lineHeight: 1.08,
          fontWeight: 800,
          letterSpacing: 0,
        }}
      >
        {headline}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 190,
          left: 44,
          width: 310,
          display: 'grid',
          gap: 8,
          fontSize: 13,
          lineHeight: 1.45,
          color: 'rgba(236, 254, 255, 0.72)',
        }}
      >
        <div style={{ color: theme.accent, fontWeight: 800 }}>Creative DNA · {creativeSource}</div>
        {(dreamLines.length ? dreamLines : ['Dream 将随角色私有记忆与反思进化']).slice(0, 3).map((line) => (
          <div key={line} style={{ borderLeft: `2px solid ${theme.accent}`, paddingLeft: 9 }}>{line}</div>
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 60,
          bottom: 48,
          display: 'flex',
          gap: 10,
          maxWidth: 500,
          flexWrap: 'wrap',
        }}
      >
        {cast.map((name, index) => (
          <div
            key={name}
            style={{
              border: `1px solid ${index % 2 ? theme.accent : theme.border}55`,
              background: 'rgba(2, 6, 23, 0.52)',
              padding: '8px 10px',
              fontSize: 13,
              color: index % 2 ? theme.accent : '#bae6fd',
            }}
          >
            {name}
          </div>
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          width: 280,
          height: 280,
          right: 70,
          top: 82,
          borderRadius: '50%',
          border: `1px solid ${theme.border}88`,
          transform: `rotate(${orbit}deg)`,
        }}
      >
        {cast.map((name, index, list) => {
          const angle = (Math.PI * 2 * index) / Math.max(1, list.length)
          const x = 128 + Math.cos(angle) * 124
          const y = 128 + Math.sin(angle) * 124
          return (
            <div
              key={name}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: index % 2 ? theme.accent : theme.border,
                boxShadow: `0 0 ${18 + pulse * 18}px ${theme.accent}55`,
                transform: `rotate(${-orbit}deg)`,
              }}
            />
          )
        })}
      </div>
      <div
        style={{
          position: 'absolute',
          right: 168,
          top: 180,
          width: 90,
          height: 90,
          display: 'grid',
          placeItems: 'center',
          border: `1px solid ${theme.accent}88`,
          background: `rgba(15, 23, 42, ${0.58 + pulse * 0.18})`,
          fontSize: 18,
          fontWeight: 800,
        }}
      >
        PRD
      </div>
      <div
        style={{
          position: 'absolute',
          right: 42,
          top: 292,
          width: 282,
          border: `1px solid ${theme.border}66`,
          background: 'rgba(2, 6, 23, 0.66)',
          padding: 14,
          display: 'grid',
          gap: 8,
          fontSize: 12,
          lineHeight: 1.4,
        }}
      >
        <div style={{ color: theme.accent, fontWeight: 800 }}>真实剧场信号</div>
        <strong style={{ fontSize: 15 }}>{currentSceneTitle}</strong>
        <span>{currentSpeaker}{currentTarget ? ` -> ${currentTarget}` : ' -> 主持裁决'}</span>
        <span>冲突边 {conflictCount} · 质量 {qualityScore ?? '-'} {qualityStatus || ''} · 追溯 {baoyuCount}</span>
      </div>
      <div
        style={{
          position: 'absolute',
          right: 42,
          bottom: 38,
          color: running ? theme.accent : theme.border,
          fontSize: 13,
        }}
      >
        {running ? `debate in progress · ${theme.motion}` : activated ? 'activated council' : 'waiting for one-key start'}
      </div>
    </AbsoluteFill>
  )
}

export default function CouncilDebateStage({
  selection,
  messages,
  running,
  activated,
  uiStyleContext,
  creativeEnhancement,
  agentDreamStates = [],
  debateScenes = [],
  debateMap,
  qualityGate,
  baoyuVisualPlans = [],
}: CouncilDebateStageProps) {
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => {
    setReducedMotion(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false)
  }, [])

  const names = useMemo(() => selection?.seats.map((seat) => seat.persona.shortName) || [], [selection])
  const briefCount = messages.filter((message) => message.kind === 'brief').length
  const artifactCount = messages.filter((message) => message.kind === 'artifact').length
  const phase = artifactCount ? '共识成稿' : briefCount || running ? '角色博弈' : selection ? '自动编队完成' : '等待问题'
  const headline = artifactCount
    ? '共识 PRD 已生成'
    : running
      ? `${selection?.seats.length || 0} 位思想原型正在博弈`
      : selection
        ? `${selection.seats.length} 位推荐角色已进入自动开会队列`
        : '输入问题，系统再挑最合适的人'
  const palette = uiStyleContext?.visual.palette || []
  const theme = {
    background: palette[0] || '#08130f',
    surface: palette[1] || '#1b1024',
    accent: uiStyleContext?.visual.accent || palette[2] || '#bef264',
    text: uiStyleContext?.visual.text || palette[3] || '#ecfeff',
    border: uiStyleContext?.visual.border || palette[2] || '#67e8f9',
    motion: uiStyleContext?.visual.motion || 'guided motion',
  }
  const dreamLines = agentDreamStates.map((dream) => dream.currentDream)
  const realScenes = debateScenes.filter((scene) => scene.id !== 'scene-waiting-for-briefs')
  const currentScene = realScenes[realScenes.length - 1] || debateScenes[0]
  const currentSceneTitle = currentScene?.id === 'scene-waiting-for-briefs'
    ? running
      ? '正在形成第一幕，角色发言返回后自动写入'
    : activated
      ? '会场已激活，等待第一条角色发言'
      : '推荐队伍就位，点击开始进入博弈'
    : currentScene?.sceneTitle || (running ? '正在形成第一幕，角色发言返回后自动写入' : '等待剧场场景')
  const conflictCount = debateMap?.edges.filter((edge) => edge.relation === 'oppose' || edge.relation === 'cut').length || 0

  if (reducedMotion) {
    return (
      <div className="council-stage council-stage--static">
        <div className="council-stage__kicker">XIAOBAI COUNCIL</div>
        <div className="council-stage__headline">{headline}</div>
        <div className="council-stage__phase">{phase}</div>
        <div className="council-stage__phase">{currentSceneTitle}</div>
        <div className="council-stage__phase">{uiStyleContext?.styleNames.join(' / ') || 'UI Museum theme'}</div>
      </div>
    )
  }

  return (
    <div className="council-stage">
      <Player
        component={CouncilDebateComposition}
        inputProps={{
          names,
          headline,
          phase,
          running,
          activated,
          styleNames: uiStyleContext?.styleNames || [],
          theme,
          creativeSource: creativeEnhancement?.source || 'fallback',
          dreamLines,
          currentSceneTitle,
          currentSpeaker: currentScene?.speakerName || '小白智囊团',
          currentTarget: currentScene?.targetNames.join(' / ') || '',
          conflictCount,
          qualityScore: qualityGate?.score,
          qualityStatus: qualityGate?.finalGateStatus || qualityGate?.status,
          baoyuCount: baoyuVisualPlans.length,
        }}
        durationInFrames={210}
        fps={30}
        compositionWidth={720}
        compositionHeight={420}
        style={{ width: '100%', height: '100%' }}
        loop
        autoPlay
        acknowledgeRemotionLicense
      />
    </div>
  )
}
