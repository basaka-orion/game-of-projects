import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
} from 'remotion';
import type { RemotionNarrativeBundle } from '../utils/remotion-bundle';

type LayoutMode = 'portrait' | 'landscape';

function makeFrameWindows(bundle: RemotionNarrativeBundle) {
  return bundle.sceneOutline.map((scene) => ({
    ...scene,
    startFrame: Math.floor(scene.startSec * bundle.fps),
    endFrame: Math.floor(scene.endSec * bundle.fps),
  }));
}

function formatMetricLabel(bundle: RemotionNarrativeBundle) {
  const topDimension = bundle.dataSnapshot.topDimensions[0];
  if (!topDimension) return '画像结构正在成形';
  return `${topDimension.icon} ${topDimension.name} ${topDimension.confidence}%`;
}

function activeCaptionText(bundle: RemotionNarrativeBundle, currentFrame: number): string {
  const currentSec = currentFrame / bundle.fps;
  const block = bundle.captionBlocks.find((caption) => currentSec >= caption.startSec && currentSec <= caption.endSec);
  return block?.text || '';
}

function entryProgress(frame: number, fps: number, delay = 0) {
  return spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: {
      damping: 18,
      stiffness: 110,
      mass: 0.9,
      overshootClamping: false,
    },
  });
}

function sceneVisualAccent(
  hint: RemotionNarrativeBundle['sceneOutline'][number]['compositionHint'],
  bundle: RemotionNarrativeBundle,
) {
  switch (hint) {
    case 'dimensions':
      return bundle.dataSnapshot.topDimensions.slice(0, 3).map((dimension) => ({
        title: dimension.name,
        subtitle: `${dimension.confidence}% · ${dimension.traitHighlights.slice(0, 2).join(' / ')}`,
        color: dimension.color,
      }));
    case 'tension':
      return bundle.dataSnapshot.crossReactions.slice(0, 2).map((reaction, index) => ({
        title: reaction.title,
        subtitle: reaction.implication,
        color: index === 0 ? bundle.themeTokens.primary : bundle.themeTokens.accent,
      }));
    case 'sage':
      return bundle.visualMotifs.slice(0, 3).map((motif, index) => ({
        title: motif.label,
        subtitle: motif.keywords.slice(0, 2).join(' · '),
        color: motif.colors[0] || (index % 2 === 0 ? bundle.themeTokens.secondary : bundle.themeTokens.primary),
      }));
    case 'trajectory':
      return [
        ...bundle.dataSnapshot.recommendedResearchTopics.slice(0, 2).map((topic) => ({
          title: topic,
          subtitle: '研究主题',
          color: bundle.themeTokens.primary,
        })),
        ...bundle.dataSnapshot.productConcepts.slice(0, 1).map((concept) => ({
          title: concept.title,
          subtitle: concept.promise,
          color: bundle.themeTokens.accent,
        })),
      ];
    case 'outro':
      return [
        {
          title: `${bundle.remotionProps.highlightMetrics.topConfidence}%`,
          subtitle: '最强证据维度',
          color: bundle.themeTokens.primary,
        },
        {
          title: `${bundle.remotionProps.highlightMetrics.crossReactionCount}`,
          subtitle: '跨维度化学反应',
          color: bundle.themeTokens.secondary,
        },
        {
          title: `${bundle.remotionProps.highlightMetrics.researchTopicCount}`,
          subtitle: '优先研究主题',
          color: bundle.themeTokens.accent,
        },
      ];
    default:
      return [
        {
          title: bundle.dataSnapshot.archetype,
          subtitle: bundle.dataSnapshot.currentFocus || formatMetricLabel(bundle),
          color: bundle.themeTokens.primary,
        },
      ];
  }
}

export default function NarrativeRevealComposition({
  bundle,
  layout = 'portrait',
}: {
  bundle: RemotionNarrativeBundle;
  layout?: LayoutMode;
}) {
  const currentFrame = useCurrentFrame();
  const frameWindows = makeFrameWindows(bundle);
  const activeScene =
    frameWindows.find((scene) => currentFrame >= scene.startFrame && currentFrame < scene.endFrame) ||
    frameWindows[frameWindows.length - 1];
  const localFrame = Math.max(0, currentFrame - activeScene.startFrame);
  const intro = entryProgress(localFrame, bundle.fps, 0);
  const subIntro = entryProgress(localFrame, bundle.fps, 8);
  const captionIntro = entryProgress(localFrame, bundle.fps, 18);
  const currentSec = currentFrame / bundle.fps;
  const visualAccent = sceneVisualAccent(activeScene.compositionHint, bundle);
  const captionText = activeCaptionText(bundle, currentFrame);
  const voiceover = bundle.voiceoverScript.find((segment) => segment.sceneId === activeScene.id);
  const orbDriftA = Math.sin(currentFrame / 22) * 28;
  const orbDriftB = Math.cos(currentFrame / 31) * 32;
  const grainOpacity = interpolate(Math.sin(currentFrame / 15), [-1, 1], [0.03, 0.09]);
  const primaryGlow = interpolate(intro, [0, 1], [0.18, 0.3], { extrapolateRight: 'clamp' });
  const secondaryGlow = interpolate(subIntro, [0, 1], [0.12, 0.24], { extrapolateRight: 'clamp' });
  const headlineTranslate = interpolate(intro, [0, 1], [42, 0], { easing: Easing.out(Easing.cubic), extrapolateRight: 'clamp' });
  const bodyTranslate = interpolate(subIntro, [0, 1], [26, 0], { easing: Easing.out(Easing.cubic), extrapolateRight: 'clamp' });
  const captionTranslate = interpolate(captionIntro, [0, 1], [16, 0], { easing: Easing.out(Easing.cubic), extrapolateRight: 'clamp' });
  const cardColumns = layout === 'portrait' ? 1 : Math.min(visualAccent.length, 3);
  const horizontalPadding = layout === 'portrait' ? 82 : 110;
  const topPadding = layout === 'portrait' ? 92 : 72;
  const headlineMaxWidth = layout === 'portrait' ? '100%' : '74%';
  const headlineSize = layout === 'portrait' ? 88 : 78;
  const subtitleSize = layout === 'portrait' ? 28 : 24;
  const bodySize = layout === 'portrait' ? 28 : 22;
  const labelSize = layout === 'portrait' ? 18 : 16;

  return (
    <AbsoluteFill
      style={{
        background: bundle.themeTokens.background,
        fontFamily: '"IBM Plex Sans", "PingFang SC", "Helvetica Neue", sans-serif',
        color: bundle.themeTokens.textPrimary,
        overflow: 'hidden',
      }}
    >
      <AbsoluteFill
        style={{
          background: `
            radial-gradient(circle at 18% 18%, ${bundle.themeTokens.primary}${Math.round(primaryGlow * 255).toString(16).padStart(2, '0')}, transparent 28%),
            radial-gradient(circle at 82% 22%, ${bundle.themeTokens.secondary}${Math.round(secondaryGlow * 255).toString(16).padStart(2, '0')}, transparent 32%),
            radial-gradient(circle at 50% 84%, ${bundle.themeTokens.accent}20, transparent 30%),
            linear-gradient(135deg, ${bundle.themeTokens.background} 0%, rgba(255,255,255,0.04) 100%)
          `,
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 90 + orbDriftA,
          left: 90,
          width: layout === 'portrait' ? 320 : 420,
          height: layout === 'portrait' ? 320 : 420,
          borderRadius: '50%',
          background: `${bundle.themeTokens.primary}26`,
          filter: 'blur(90px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 90,
          top: 140 + orbDriftB,
          width: layout === 'portrait' ? 260 : 360,
          height: layout === 'portrait' ? 260 : 360,
          borderRadius: '50%',
          background: `${bundle.themeTokens.secondary}22`,
          filter: 'blur(90px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: grainOpacity,
          backgroundImage:
            'radial-gradient(circle, rgba(255,255,255,0.8) 0.8px, transparent 0.8px)',
          backgroundSize: '22px 22px',
          mixBlendMode: 'soft-light',
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          padding: `${topPadding}px ${horizontalPadding}px ${layout === 'portrait' ? 120 : 88}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 24,
              marginBottom: layout === 'portrait' ? 54 : 36,
              alignItems: 'center',
              fontSize: labelSize,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: bundle.themeTokens.textSecondary,
            }}
          >
            <div>{bundle.title}</div>
            <div>{activeScene.title}</div>
          </div>

          <div
            style={{
              maxWidth: headlineMaxWidth,
              opacity: intro,
              transform: `translateY(${headlineTranslate}px)`,
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 16,
                padding: '10px 18px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: bundle.themeTokens.primary,
                fontSize: labelSize,
                marginBottom: layout === 'portrait' ? 28 : 18,
              }}
            >
              <span>{activeScene.compositionHint}</span>
              <span>{activeScene.transition}</span>
              <span>{Math.round(activeScene.durationSec)}s</span>
            </div>

            <div
              style={{
                fontSize: headlineSize,
                lineHeight: 1.04,
                fontWeight: 700,
                letterSpacing: '-0.06em',
                marginBottom: layout === 'portrait' ? 22 : 16,
                fontFamily: '"IBM Plex Serif", "Songti SC", serif',
              }}
            >
              {activeScene.headline}
            </div>

            <div
              style={{
                fontSize: subtitleSize,
                lineHeight: 1.7,
                color: bundle.themeTokens.textSecondary,
                maxWidth: layout === 'portrait' ? '92%' : '80%',
              }}
            >
              {bundle.subtitle}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cardColumns}, minmax(0, 1fr))`,
            gap: 18,
            marginBottom: layout === 'portrait' ? 40 : 22,
            opacity: subIntro,
            transform: `translateY(${bodyTranslate}px)`,
          }}
        >
          {visualAccent.map((item, index) => {
            const itemIntro = entryProgress(localFrame, bundle.fps, 12 + index * 4);
            return (
              <div
                key={`${activeScene.id}:${item.title}:${index}`}
                style={{
                  padding: layout === 'portrait' ? '22px 24px' : '20px 22px',
                  borderRadius: 28,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  boxShadow: `0 20px 60px ${item.color}22`,
                  opacity: itemIntro,
                  transform: `translateY(${interpolate(itemIntro, [0, 1], [24, 0])}px) scale(${interpolate(itemIntro, [0, 1], [0.97, 1])})`,
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: item.color,
                    boxShadow: `0 0 0 6px ${item.color}22`,
                    marginBottom: 18,
                  }}
                />
                <div style={{ fontSize: bodySize, lineHeight: 1.2, fontWeight: 700, marginBottom: 10 }}>
                  {item.title}
                </div>
                <div style={{ fontSize: labelSize, lineHeight: 1.7, color: bundle.themeTokens.textSecondary }}>
                  {item.subtitle}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 28,
          }}
        >
          <div
            style={{
              flex: 1,
              padding: layout === 'portrait' ? '22px 24px' : '18px 22px',
              borderRadius: 24,
              background: 'rgba(8, 14, 24, 0.42)',
              border: '1px solid rgba(255,255,255,0.1)',
              opacity: captionIntro,
              transform: `translateY(${captionTranslate}px)`,
            }}
          >
            <div
              style={{
                fontSize: labelSize,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: bundle.themeTokens.primary,
                marginBottom: 12,
              }}
            >
              Caption
            </div>
            <div
              style={{
                fontSize: layout === 'portrait' ? 34 : 26,
                lineHeight: 1.45,
                fontWeight: 600,
              }}
            >
              {captionText || activeScene.supportingLines[0] || formatMetricLabel(bundle)}
            </div>
          </div>

          {voiceover && (
            <div
              style={{
                width: layout === 'portrait' ? 280 : 360,
                flexShrink: 0,
                padding: layout === 'portrait' ? '18px 20px' : '16px 18px',
                borderRadius: 22,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.1)',
                opacity: captionIntro,
              }}
            >
              <div
                style={{
                  fontSize: labelSize,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: bundle.themeTokens.textSecondary,
                  marginBottom: 10,
                }}
              >
                Voiceover · {voiceover.pace}
              </div>
              <div
                style={{
                  fontSize: layout === 'portrait' ? 20 : 16,
                  lineHeight: 1.7,
                  color: bundle.themeTokens.textPrimary,
                }}
              >
                {voiceover.text}
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          right: horizontalPadding,
          bottom: layout === 'portrait' ? 54 : 42,
          fontSize: labelSize,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: bundle.themeTokens.textSecondary,
        }}
      >
        {(Number.isFinite(currentSec) ? currentSec : 0).toFixed(1)}s / {(Number.isFinite(bundle.durationSec) ? bundle.durationSec : 0).toFixed(0)}s
      </div>
    </AbsoluteFill>
  );
}
