import { useEffect, useState } from 'react'
import { Player } from '@remotion/player'
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import type { SourceOsGuideProps, SourceOsGuideState } from '../../../../lib/bili-helper/source-os-guide'

export const SOURCE_OS_GUIDE_FPS = 30
export const SOURCE_OS_GUIDE_DURATION = 210
export const SOURCE_OS_GUIDE_SIZE = { width: 960, height: 260 }
export const SOURCE_OS_GUIDE_COMPACT_SIZE = { width: 700, height: 220 }

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return reduced
}

function safeText(value: string, max = 64): string {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value
}

function colorFor(index: number): string {
  return ['#31e6d1', '#7a57ff', '#f1d48a', '#86a6ff', '#31e6d1', '#8af0b8', '#f6f1df'][index % 7]
}

function targetLabel(target: string): string {
  switch (target) {
    case 'source-input':
      return '输入框与解析键'
    case 'source-card':
      return '来源身份卡'
    case 'artifact-dashboard':
      return 'AI 产物仪表盘'
    case 'learning-pack':
      return '学习包预览'
    case 'chat-export':
      return '对话与导出'
    default:
      return '当前操作区'
  }
}

function railText(state: SourceOsGuideState): string {
  return state.steps
    .map((step, index) => (index === state.activeIndex ? `0${index + 1}` : step.status === 'complete' ? 'OK' : `0${index + 1}`))
    .join(' / ')
}

export function SourceOsGuideComposition({ state, compact = false, reducedMotion = false }: SourceOsGuideProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const entrance = reducedMotion
    ? 1
    : spring({
        frame,
        fps,
        config: { damping: 16, stiffness: 82, mass: 0.72 },
      })
  const loopFrame = frame % SOURCE_OS_GUIDE_DURATION
  const lineDraw = reducedMotion
    ? 1
    : interpolate(loopFrame, [0, 32, 130, SOURCE_OS_GUIDE_DURATION], [0.18, 1, 1, 0.18], {
        easing: Easing.inOut(Easing.cubic),
      })
  const dotPulse = reducedMotion ? 1 : interpolate(loopFrame % 54, [0, 27, 54], [1, 1.12, 1])
  const float = reducedMotion ? 0 : Math.sin((frame / fps) * Math.PI * 2) * 4
  const accent = colorFor(state.activeIndex)
  const width = compact ? SOURCE_OS_GUIDE_COMPACT_SIZE.width : SOURCE_OS_GUIDE_SIZE.width
  const height = compact ? SOURCE_OS_GUIDE_COMPACT_SIZE.height : SOURCE_OS_GUIDE_SIZE.height
  const cardWidth = compact ? 430 : 590
  const cardLeft = compact ? 18 : 24
  const cardTop = compact ? 22 : 28
  const cardHeight = compact ? 162 : 188
  const lineStart = cardLeft + cardWidth - 4
  const lineEnd = width - (compact ? 150 : 190)

  return (
    <AbsoluteFill
      style={{
        width: '100%',
        height: '100%',
        background: 'transparent',
        color: '#10202a',
        fontFamily: 'Inter, "SF Pro Text", "PingFang SC", system-ui, sans-serif',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: cardLeft,
          top: cardTop + float,
          width: cardWidth,
          minHeight: cardHeight,
          padding: compact ? '17px 20px 15px' : '20px 24px 18px',
          border: '2px solid rgba(12, 21, 31, 0.9)',
          borderRadius: compact ? 22 : 26,
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.74), rgba(255,255,255,0.2)), linear-gradient(135deg, #fbf5e6 0%, #efe3cb 100%)',
          boxShadow: `8px 10px 0 rgba(0,0,0,0.34), 0 0 38px ${accent}33`,
          transform: `translateY(${(1 - entrance) * 24}px) rotate(${reducedMotion ? 0 : -0.8 + entrance * 0.8}deg)`,
          transformOrigin: '22% 50%',
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: compact ? 36 : 48,
            top: -12,
            width: 86,
            height: 22,
            border: '1px solid rgba(255,255,255,0.45)',
            borderRadius: 7,
            background: 'rgba(255,255,255,0.42)',
            boxShadow: '0 8px 18px rgba(0,0,0,0.16)',
            transform: 'rotate(-3deg)',
          }}
        />
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            border: `1px solid ${accent}88`,
            borderRadius: 999,
            background: `${accent}1f`,
            color: '#13212c',
            padding: compact ? '6px 10px' : '7px 11px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: compact ? 15 : 16,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          <i style={{ width: 8, height: 8, borderRadius: '50%', background: accent, boxShadow: `0 0 18px ${accent}` }} />
          Next step
        </span>
        <h2
          style={{
            margin: compact ? '12px 0 7px' : '15px 0 8px',
            color: '#111827',
            fontSize: compact ? 24 : 32,
            lineHeight: 1.05,
            letterSpacing: 0,
            fontWeight: 840,
          }}
        >
          {safeText(state.cta, compact ? 25 : 32)}
        </h2>
        <p
          style={{
            margin: 0,
            maxWidth: compact ? 380 : 520,
            color: 'rgba(16, 32, 42, 0.72)',
            fontSize: compact ? 16 : 19,
            lineHeight: 1.45,
          }}
        >
          {safeText(state.activeStep.description || state.caption, compact ? 42 : 62)}
        </p>
        <div
          style={{
            marginTop: compact ? 12 : 16,
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            color: 'rgba(16, 32, 42, 0.58)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: compact ? 13 : 14,
            letterSpacing: '0.08em',
          }}
        >
          <b style={{ color: accent, fontWeight: 800 }}>{state.activeStep.label}</b>
          <span>{railText(state)}</span>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: lineStart,
          top: compact ? 108 : 118,
          width: Math.max(80, lineEnd - lineStart),
          height: 44,
          transform: `scaleX(${lineDraw})`,
          transformOrigin: 'left center',
        }}
      >
        <svg width="100%" height="44" viewBox="0 0 320 44" preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
          <path
            d="M4 24 C80 4 140 42 218 22 S292 12 316 26"
            fill="none"
            stroke={accent}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="9 12"
            opacity="0.92"
          />
          <path d="M304 14 L320 26 L300 34" fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div
        style={{
          position: 'absolute',
          right: compact ? 18 : 26,
          top: compact ? 76 : 82,
          width: compact ? 142 : 170,
          minHeight: compact ? 74 : 92,
          display: 'grid',
          placeItems: 'center',
          border: `1px solid ${accent}88`,
          borderRadius: compact ? 24 : 28,
          background: 'linear-gradient(160deg, rgba(11, 18, 31, 0.96), rgba(7, 29, 30, 0.9))',
          boxShadow: `0 0 34px ${accent}30, inset 0 1px 0 rgba(255,255,255,0.12)`,
          transform: `scale(${dotPulse})`,
        }}
      >
        <span
          style={{
            width: compact ? 36 : 44,
            height: compact ? 36 : 44,
            display: 'grid',
            placeItems: 'center',
            borderRadius: '50%',
            background: accent,
            color: '#07131d',
            fontWeight: 900,
            fontSize: compact ? 15 : 17,
            boxShadow: `0 0 22px ${accent}`,
          }}
        >
          {String(state.activeIndex + 1).padStart(2, '0')}
        </span>
        <strong
          style={{
            marginTop: compact ? -4 : -6,
            maxWidth: compact ? 118 : 140,
            color: '#f4f7fb',
            fontSize: compact ? 14 : 16,
            lineHeight: 1.18,
            textAlign: 'center',
          }}
        >
          {targetLabel(state.focusTarget)}
        </strong>
      </div>
    </AbsoluteFill>
  )
}

function SourceOsGuideStatic({ state, compact = false, className = '' }: SourceOsGuideProps) {
  const rootClass = ['sourceos-guide', compact ? 'sourceos-guide--compact' : '', 'sourceos-guide--static', className].filter(Boolean).join(' ')
  return (
    <div className={rootClass} data-intensity={state.intensity}>
      <div className="sourceos-guide__paper">
        <span>Next step</span>
        <strong>{state.cta}</strong>
        <p>{state.activeStep.description}</p>
      </div>
      <ol>
        {state.steps.map((step) => (
          <li key={step.id} data-status={step.status} data-sourceos-guide-step={step.id}>
            {step.label}
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function SourceOsGuidePlayer({ state, compact = false, className = '' }: SourceOsGuideProps) {
  const reducedMotion = usePrefersReducedMotion()
  const size = compact ? SOURCE_OS_GUIDE_COMPACT_SIZE : SOURCE_OS_GUIDE_SIZE
  const rootClass = ['sourceos-guide', compact ? 'sourceos-guide--compact' : '', className].filter(Boolean).join(' ')

  if (reducedMotion) {
    return <SourceOsGuideStatic state={state} compact={compact} reducedMotion className={className} />
  }

  return (
    <div className={rootClass} data-intensity={state.intensity}>
      <Player
        component={SourceOsGuideComposition}
        inputProps={{ state, compact, reducedMotion: false }}
        durationInFrames={SOURCE_OS_GUIDE_DURATION}
        compositionWidth={size.width}
        compositionHeight={size.height}
        fps={SOURCE_OS_GUIDE_FPS}
        loop
        autoPlay
        controls={false}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        showVolumeControls={false}
        acknowledgeRemotionLicense
        style={{
          width: '100%',
          aspectRatio: `${size.width} / ${size.height}`,
          overflow: 'visible',
          background: 'transparent',
        }}
      />
    </div>
  )
}
