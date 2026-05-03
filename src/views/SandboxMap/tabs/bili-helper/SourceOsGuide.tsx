import { useEffect, useState } from 'react'
import { Player } from '@remotion/player'
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import type { SourceOsGuideProps, SourceOsGuideState } from '../../../../lib/bili-helper/source-os-guide'

export const SOURCE_OS_GUIDE_FPS = 30
export const SOURCE_OS_GUIDE_DURATION = 210
export const SOURCE_OS_GUIDE_SIZE = { width: 1280, height: 420 }
export const SOURCE_OS_GUIDE_COMPACT_SIZE = { width: 1280, height: 190 }

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
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function colorFor(index: number): string {
  return ['#74f6d6', '#b9a7ff', '#f5d083', '#f08ab8', '#7db7ff', '#81e89a', '#f5f0df'][index % 7]
}

export function SourceOsGuideComposition({ state, compact = false, reducedMotion = false }: SourceOsGuideProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const pulse = reducedMotion
    ? 1
    : spring({
        frame,
        fps,
        config: { damping: 18, stiffness: 90, mass: 0.8 },
      })
  const sweep = reducedMotion
    ? 0
    : interpolate(frame % SOURCE_OS_GUIDE_DURATION, [0, SOURCE_OS_GUIDE_DURATION], [-22, 122], {
        easing: Easing.inOut(Easing.cubic),
      })
  const float = reducedMotion ? 0 : Math.sin((frame / fps) * Math.PI * 2) * 7
  const activeColor = colorFor(state.activeIndex)
  const canvasHeight = compact ? SOURCE_OS_GUIDE_COMPACT_SIZE.height : SOURCE_OS_GUIDE_SIZE.height

  return (
    <AbsoluteFill
      style={{
        width: '100%',
        height: '100%',
        background: 'linear-gradient(135deg, #070713 0%, #11121f 48%, #071c19 100%)',
        color: '#f7f2e8',
        fontFamily: 'Inter, "SF Pro Text", "PingFang SC", system-ui, sans-serif',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: compact ? '74px 74px' : '96px 96px',
          opacity: 0.45,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '-18%',
          left: `${sweep}%`,
          width: compact ? 280 : 430,
          height: compact ? 280 : 430,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${activeColor}66 0%, ${activeColor}22 42%, transparent 70%)`,
          filter: 'blur(2px)',
          transform: `translateY(${float}px)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: compact ? 20 : 30,
          border: '1px solid rgba(255,255,255,0.16)',
          borderRadius: compact ? 34 : 44,
          background: 'linear-gradient(145deg, rgba(255,255,255,0.1), rgba(255,255,255,0.035))',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 30px 80px rgba(0,0,0,0.34)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(90deg, transparent, ${activeColor}18, transparent)`,
            transform: `translateX(${reducedMotion ? 0 : interpolate(frame % 120, [0, 120], [-100, 100])}%)`,
          }}
        />
        <div
          style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: compact ? '1fr 360px' : 'minmax(0, 0.96fr) 470px',
            gap: compact ? 22 : 26,
            height: canvasHeight - (compact ? 40 : 60),
            padding: compact ? 22 : 30,
            alignItems: 'center',
          }}
        >
          <section style={{ minWidth: 0 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: compact ? '8px 12px' : '10px 14px',
                border: `1px solid ${activeColor}70`,
                borderRadius: 999,
                background: `${activeColor}18`,
                color: activeColor,
                fontSize: compact ? 22 : 24,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: activeColor, boxShadow: `0 0 26px ${activeColor}` }} />
              SourceOS Guide
            </div>
            <h2
              style={{
                margin: compact ? '16px 0 9px' : '24px 0 12px',
                fontFamily: 'Georgia, "Songti SC", serif',
                fontSize: compact ? 38 : 48,
                lineHeight: 0.98,
                letterSpacing: 0,
              }}
            >
              {safeText(state.headline, compact ? 34 : 42)}
            </h2>
            <p
              style={{
                margin: 0,
                maxWidth: 760,
                color: 'rgba(247,242,232,0.7)',
                fontSize: compact ? 20 : 22,
                lineHeight: 1.48,
              }}
            >
              {safeText(state.caption, compact ? 52 : 86)}
            </p>
            {!compact && (
              <div
                style={{
                  marginTop: 24,
                  display: 'grid',
                  gridTemplateColumns: `minmax(0, ${state.progress}fr) minmax(0, ${100 - state.progress}fr)`,
                  height: 9,
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.15)',
                  overflow: 'hidden',
                }}
              >
                <i style={{ display: 'block', background: `linear-gradient(90deg, ${activeColor}, #f5d083)` }} />
                <i style={{ display: 'block', background: 'rgba(255,255,255,0.055)' }} />
              </div>
            )}
          </section>

          <section
            style={{
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: compact ? '1fr' : 'repeat(2, minmax(0, 1fr))',
              gap: compact ? 7 : 7,
              transform: `scale(${0.96 + pulse * 0.04})`,
            }}
          >
            {state.steps.map((step, index) => {
              const active = step.status === 'current'
              const complete = step.status === 'complete'
              return (
                <div
                  key={step.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: compact ? '38px 1fr' : '40px 1fr',
                    gap: compact ? 10 : 10,
                    alignItems: 'center',
                    padding: compact ? '7px 9px' : '7px 10px',
                    border: `1px solid ${active ? activeColor : complete ? 'rgba(116,246,214,0.45)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: compact ? 18 : 22,
                    background: active ? `${activeColor}1f` : complete ? 'rgba(116,246,214,0.08)' : 'rgba(255,255,255,0.035)',
                    opacity: step.status === 'upcoming' ? 0.62 : 1,
                  }}
                >
                  <strong
                    style={{
                      width: compact ? 34 : 42,
                      height: compact ? 34 : 36,
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: '50%',
                      background: active ? activeColor : complete ? 'rgba(116,246,214,0.2)' : 'rgba(255,255,255,0.06)',
                      color: active ? '#07120f' : complete ? '#74f6d6' : 'rgba(247,242,232,0.55)',
                      fontSize: compact ? 16 : 16,
                    }}
                  >
                    {complete ? '✓' : String(index + 1).padStart(2, '0')}
                  </strong>
                  <span style={{ minWidth: 0 }}>
                    <b style={{ display: 'block', color: '#f7f2e8', fontSize: compact ? 18 : 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {step.title}
                    </b>
                  </span>
                </div>
              )
            })}
          </section>
        </div>
      </div>
    </AbsoluteFill>
  )
}

function SourceOsGuideStatic({ state, compact = false }: SourceOsGuideProps) {
  return (
    <div className={compact ? 'sourceos-guide sourceos-guide--compact sourceos-guide--static' : 'sourceos-guide sourceos-guide--static'}>
      <div>
        <span>SourceOS Guide</span>
        <strong>{state.headline}</strong>
        <p>{state.caption}</p>
      </div>
      <ol>
        {state.steps.map((step) => (
          <li key={step.id} data-status={step.status}>
            {step.label}
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function SourceOsGuidePlayer({ state, compact = false }: SourceOsGuideProps) {
  const reducedMotion = usePrefersReducedMotion()
  const size = compact ? SOURCE_OS_GUIDE_COMPACT_SIZE : SOURCE_OS_GUIDE_SIZE

  if (reducedMotion) {
    return <SourceOsGuideStatic state={state} compact={compact} reducedMotion />
  }

  return (
    <div className={compact ? 'sourceos-guide sourceos-guide--compact' : 'sourceos-guide'} data-intensity={state.intensity}>
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
          borderRadius: compact ? 26 : 34,
          overflow: 'hidden',
          background: '#070713',
        }}
      />
    </div>
  )
}
