import { useEffect, useMemo, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { motion } from '../lib/motion-lite';
import { buildRemotionDimensionMoodMap, type RemotionNarrativeBundle } from '../utils/remotion-bundle';
import NarrativeRevealComposition from '../remotion/NarrativeRevealComposition';

const COMPOSITION_META: Record<
  RemotionNarrativeBundle['defaultCompositionId'],
  {
    label: string;
    ratio: string;
    note: string;
  }
> = {
  'portrait-reveal': {
    label: '竖屏揭示片',
    ratio: '9:16',
    note: '适合手机端结果揭示与短视频传播',
  },
  'landscape-brief': {
    label: '横屏演示片',
    ratio: '16:9',
    note: '适合官网嵌入、桌面展示与现场讲解',
  },
};

const COMPOSITION_HINT_LABELS: Record<string, string> = {
  hero: '开场主镜头',
  dimensions: '维度展示',
  tension: '张力演绎',
  sage: '智者镜头',
  trajectory: '方向轨迹',
  outro: '结尾卡',
};

const TRANSITION_LABELS: Record<string, string> = {
  glow: 'Glow',
  crossfade: 'Crossfade',
  prism: 'Prism',
  beam: 'Beam',
};

const PACE_LABELS: Record<string, string> = {
  slow: '慢镜头',
  steady: '稳定推进',
  elevated: '抬升推进',
};

function formatSeconds(value?: number): string {
  if (!Number.isFinite(value)) return '0s';
  return `${Math.round(value || 0)}s`;
}

function formatTimeWindow(startSec?: number, endSec?: number): string {
  const safeStart = Number.isFinite(startSec) ? startSec as number : 0;
  const safeEnd = Number.isFinite(endSec) ? endSec as number : safeStart;
  return `${safeStart.toFixed(0)}s - ${safeEnd.toFixed(0)}s`;
}

function normalizeFrameCount(value: number): string {
  return `${Math.round(value).toLocaleString('zh-CN')} 帧`;
}

function compositionLayout(id: RemotionNarrativeBundle['defaultCompositionId']): 'portrait' | 'landscape' {
  return id === 'portrait-reveal' ? 'portrait' : 'landscape';
}

type ExportStatus = 'idle' | 'done' | 'error';
type VideoRenderStatus = 'idle' | 'rendering' | 'done' | 'error';

export default function RemotionNarrativeStage({
  bundle,
  exportStatus = 'idle',
  onExport,
  onRenderVideo,
  renderStatus = 'idle',
  renderProgress,
}: {
  bundle: RemotionNarrativeBundle;
  exportStatus?: ExportStatus;
  onExport?: () => void;
  onRenderVideo?: (compositionId: RemotionNarrativeBundle['defaultCompositionId']) => void;
  renderStatus?: VideoRenderStatus;
  renderProgress?: {
    phase: 'bundling' | 'rendering' | 'done' | 'error';
    progress: number;
    message?: string;
    renderedFrames?: number;
    encodedFrames?: number;
    outputPath?: string;
  } | null;
}) {
  const [compositionId, setCompositionId] = useState(bundle.defaultCompositionId);
  const [currentFrame, setCurrentFrame] = useState(0);
  const playerRef = useRef<PlayerRef>(null);

  useEffect(() => {
    if (!bundle.compositions.some((composition) => composition.id === compositionId)) {
      setCompositionId(bundle.defaultCompositionId);
    }
  }, [bundle.compositions, bundle.defaultCompositionId, compositionId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return undefined;

    const handleFrameUpdate = ({ detail }: { detail: { frame: number } }) => {
      setCurrentFrame(detail.frame);
    };

    player.addEventListener('frameupdate', handleFrameUpdate);
    player.addEventListener('seeked', handleFrameUpdate);

    return () => {
      player.removeEventListener('frameupdate', handleFrameUpdate);
      player.removeEventListener('seeked', handleFrameUpdate);
    };
  }, [bundle.exportedAt]);

  useEffect(() => {
    setCurrentFrame(0);
    playerRef.current?.pause();
    playerRef.current?.seekTo(0);
  }, [compositionId]);

  const composition = bundle.compositions.find((item) => item.id === compositionId) || bundle.compositions[0];
  const frameWindow = bundle.sceneOutline.map((scene) => ({
    ...scene,
    startFrame: Math.floor(scene.startSec * bundle.fps),
    endFrame: Math.floor(scene.endSec * bundle.fps),
  }));
  const activeScene =
    frameWindow.find((scene) => currentFrame >= scene.startFrame && currentFrame < scene.endFrame) ||
    frameWindow[frameWindow.length - 1];
  const activeVoiceover = bundle.voiceoverScript.find((segment) => segment.sceneId === activeScene?.id);
  const activeCaptions = bundle.captionBlocks.filter((caption) => caption.sceneId === activeScene?.id);
  const dimensionMoodMap = useMemo(() => buildRemotionDimensionMoodMap(bundle), [bundle]);
  const highlightedMotifs = useMemo(() => {
    const motifPool = bundle.visualMotifs;
    if (motifPool.length === 0) return [];
    const sceneIndex = bundle.sceneOutline.findIndex((scene) => scene.id === activeScene?.id);
    const start = sceneIndex < 0 ? 0 : sceneIndex % motifPool.length;
    return [
      motifPool[start],
      motifPool[(start + 1) % motifPool.length],
    ].filter(Boolean);
  }, [activeScene?.id, bundle.sceneOutline, bundle.visualMotifs]);

  if (!activeScene || !composition) return null;

  return (
    <section style={{ marginBottom: 56 }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        style={{
          borderRadius: 28,
          padding: '28px 26px',
          background: `radial-gradient(circle at top right, ${bundle.themeTokens.primary}1F, transparent 28%), radial-gradient(circle at bottom left, ${bundle.themeTokens.secondary}1A, transparent 26%), linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))`,
          border: `1px solid ${bundle.themeTokens.primary}2A`,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', marginBottom: 20 }}>
          <div style={{ maxWidth: 760 }}>
            <div style={{ fontSize: 11, color: bundle.themeTokens.primary, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
              Remotion Narrative Stage
            </div>
            <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', margin: '0 0 10px', fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}>
              这份画像，已经能被导演成一支结果揭示片
            </h2>
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.9, maxWidth: 760 }}>
              项目里原本就有 Remotion 叙事包生成器，我把它从“只会导出 JSON”推进成了真正可预演的导演台。你现在能直接看到片子的结构、镜头、字幕、旁白、音色和视觉母题。
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))', gap: 10, minWidth: 260 }}>
            <div style={{ padding: '12px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>总时长</div>
              <div style={{ marginTop: 8, fontSize: 20, fontWeight: 700, color: bundle.themeTokens.primary }}>{formatSeconds(bundle.durationSec)}</div>
            </div>
            <div style={{ padding: '12px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>场景数</div>
              <div style={{ marginTop: 8, fontSize: 20, fontWeight: 700 }}>{bundle.sceneOutline.length}</div>
            </div>
            <div style={{ padding: '12px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>字幕块</div>
              <div style={{ marginTop: 8, fontSize: 20, fontWeight: 700 }}>{bundle.captionBlocks.length}</div>
            </div>
            <div style={{ padding: '12px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>默认画幅</div>
              <div style={{ marginTop: 8, fontSize: 20, fontWeight: 700 }}>{COMPOSITION_META[bundle.defaultCompositionId].ratio}</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
          {bundle.compositions.map((item) => {
            const meta = COMPOSITION_META[item.id];
            const selected = item.id === compositionId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCompositionId(item.id)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 999,
                  border: `1px solid ${selected ? `${bundle.themeTokens.primary}40` : 'rgba(255,255,255,0.08)'}`,
                  background: selected ? `${bundle.themeTokens.primary}14` : 'rgba(255,255,255,0.03)',
                  color: selected ? bundle.themeTokens.primary : 'var(--text-secondary)',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {meta.label} · {meta.ratio}
              </button>
            );
          })}

          {onExport && (
            <>
              {onRenderVideo && (
                <button
                  type="button"
                  onClick={() => onRenderVideo(composition.id)}
                  disabled={renderStatus === 'rendering'}
                  style={{
                    marginLeft: 'auto',
                    padding: '10px 16px',
                    borderRadius: 999,
                    border: renderStatus === 'error'
                      ? '1px solid rgba(255,107,107,0.2)'
                      : '1px solid rgba(100,255,218,0.18)',
                    background: renderStatus === 'done'
                      ? 'linear-gradient(135deg, rgba(100,255,218,0.18), rgba(255,214,10,0.12))'
                      : renderStatus === 'rendering'
                        ? 'linear-gradient(135deg, rgba(100,255,218,0.16), rgba(79,195,247,0.12))'
                        : renderStatus === 'error'
                          ? 'linear-gradient(135deg, rgba(255,107,107,0.12), rgba(255,152,0,0.08))'
                          : 'linear-gradient(135deg, rgba(100,255,218,0.08), rgba(79,195,247,0.08))',
                    color: renderStatus === 'error' ? 'var(--accent-red)' : '#64FFDA',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: renderStatus === 'rendering' ? 'progress' : 'pointer',
                    fontFamily: 'var(--font-sans)',
                    opacity: renderStatus === 'rendering' ? 0.92 : 1,
                  }}
                >
                  {renderStatus === 'done'
                    ? '🎥 已渲染成片'
                    : renderStatus === 'rendering'
                      ? `🎥 ${renderProgress?.message || '正在渲染'}`
                      : renderStatus === 'error'
                        ? '⚠️ 渲染失败'
                        : '🎥 渲染当前构图为 MP4'}
                </button>
              )}
              <button
                type="button"
                onClick={onExport}
                style={{
                  padding: '10px 16px',
                  borderRadius: 999,
                  border: exportStatus === 'error'
                    ? '1px solid rgba(255,107,107,0.2)'
                    : '1px solid rgba(255,214,10,0.18)',
                  background: exportStatus === 'done'
                    ? 'linear-gradient(135deg, rgba(255,214,10,0.18), rgba(255,128,171,0.12))'
                    : exportStatus === 'error'
                      ? 'linear-gradient(135deg, rgba(255,107,107,0.12), rgba(255,128,171,0.08))'
                      : 'linear-gradient(135deg, rgba(255,214,10,0.08), rgba(255,128,171,0.08))',
                  color: exportStatus === 'error' ? 'var(--accent-red)' : '#FFD60A',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {exportStatus === 'done'
                  ? '🎬 已导出叙事包'
                  : exportStatus === 'error'
                    ? '⚠️ 导出失败'
                    : '🎬 导出 Remotion 叙事包'}
              </button>
            </>
          )}
        </div>

        {renderProgress && (
          <div style={{ marginBottom: 18 }}>
            <div style={{
              height: 8,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.06)',
              overflow: 'hidden',
              marginBottom: 8,
            }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.max(0, Math.min(100, renderProgress.progress))}%`,
                  borderRadius: 999,
                  background: 'linear-gradient(90deg, rgba(100,255,218,0.92), rgba(255,214,10,0.9))',
                  transition: 'width 0.25s ease',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-tertiary)' }}>
              <span>{renderProgress.message || '等待渲染'}</span>
              <span>
                {Math.max(0, Math.min(100, Math.round(renderProgress.progress)))}%
                {typeof renderProgress.renderedFrames === 'number' ? ` · 已渲染 ${renderProgress.renderedFrames} 帧` : ''}
                {typeof renderProgress.encodedFrames === 'number' ? ` · 已编码 ${renderProgress.encodedFrames} 帧` : ''}
              </span>
            </div>
            {renderProgress.outputPath && (
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                导出路径：{renderProgress.outputPath}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(300px, 0.9fr)', gap: 18, alignItems: 'start' }}>
          <div>
            <div
              style={{
                position: 'relative',
                borderRadius: 26,
                padding: 14,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  borderRadius: 22,
                  overflow: 'hidden',
                  background: bundle.themeTokens.background,
                }}
              >
                <Player
                  ref={playerRef}
                  component={NarrativeRevealComposition}
                  inputProps={{
                    bundle,
                    layout: compositionLayout(composition.id),
                  }}
                  durationInFrames={composition.durationInFrames}
                  compositionWidth={composition.width}
                  compositionHeight={composition.height}
                  fps={composition.fps}
                  controls
                  clickToPlay
                  doubleClickToFullscreen={false}
                  showVolumeControls={false}
                  allowFullscreen
                  initiallyShowControls
                  acknowledgeRemotionLicense
                  style={{
                    width: '100%',
                    borderRadius: 22,
                    overflow: 'hidden',
                    aspectRatio: `${composition.width} / ${composition.height}`,
                    background: bundle.themeTokens.background,
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {frameWindow.map((scene) => {
                const selected = scene.id === activeScene.id;
                return (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => {
                      playerRef.current?.pause();
                      playerRef.current?.seekTo(scene.startFrame);
                      setCurrentFrame(scene.startFrame);
                    }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '78px minmax(0, 1fr) 92px',
                      gap: 12,
                      alignItems: 'center',
                      textAlign: 'left',
                      padding: '12px 14px',
                      borderRadius: 16,
                      border: `1px solid ${selected ? `${bundle.themeTokens.primary}2E` : 'rgba(255,255,255,0.06)'}`,
                      background: selected ? `${bundle.themeTokens.primary}10` : 'rgba(255,255,255,0.025)',
                      color: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: 11, color: selected ? bundle.themeTokens.primary : 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      {formatTimeWindow(scene.startSec, scene.endSec)}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{scene.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                        {scene.purpose}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{TRANSITION_LABELS[scene.transition]}</div>
                      <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: selected ? bundle.themeTokens.primary : 'var(--text-primary)' }}>
                        {formatSeconds(scene.durationSec)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ padding: '18px 18px', borderRadius: 18, background: bundle.themeTokens.surface, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 11, color: bundle.themeTokens.primary, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                当前镜头
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, fontFamily: 'var(--font-display)' }}>
                {activeScene.title}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                  {COMPOSITION_HINT_LABELS[activeScene.compositionHint]}
                </span>
                <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                  {PACE_LABELS[activeVoiceover?.pace || 'steady']}
                </span>
                <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                  {TRANSITION_LABELS[activeScene.transition]}
                </span>
              </div>
              <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                {activeScene.visualDirection}
              </p>
            </div>

            {activeVoiceover && (
              <div style={{ padding: '18px 18px', borderRadius: 18, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 11, color: '#FFD166', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                  旁白脚本
                </div>
                <div style={{ fontSize: 15, lineHeight: 1.9, color: 'var(--text-primary)' }}>
                  {activeVoiceover.text}
                </div>
              </div>
            )}

            {activeCaptions.length > 0 && (
              <div style={{ padding: '18px 18px', borderRadius: 18, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
                  字幕节奏
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {activeCaptions.map((caption) => (
                    <div key={caption.id} style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.03)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>
                        {formatTimeWindow(caption.startSec, caption.endSec)} · {caption.style}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-primary)' }}>{caption.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ padding: '18px 18px', borderRadius: 18, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 11, color: '#BB86FC', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
                动效与声场
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>Motion Notes</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {activeScene.motionNotes.map((note, index) => (
                      <div key={`${activeScene.id}:motion:${index}`} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                        {note}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>Audio Direction</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    {bundle.audioDirection.mood} · {bundle.audioDirection.texture} · BPM {bundle.audioDirection.bpmRange}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, marginTop: 18 }}>
          <div style={{ padding: '18px 18px', borderRadius: 18, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 11, color: bundle.themeTokens.primary, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
              视觉母题
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {highlightedMotifs.map((motif) => (
                <div key={motif.id} style={{ padding: '12px 12px', borderRadius: 16, background: 'rgba(255,255,255,0.03)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{motif.label}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {motif.colors.slice(0, 3).map((color) => (
                        <span
                          key={`${motif.id}:${color}`}
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                            background: color,
                            boxShadow: `0 0 0 1px ${color}55`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 8 }}>
                    {motif.description}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {motif.keywords.slice(0, 4).map((keyword) => (
                      <span
                        key={`${motif.id}:${keyword}`}
                        style={{
                          fontSize: 11,
                          padding: '5px 8px',
                          borderRadius: 999,
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          color: 'var(--text-tertiary)',
                        }}
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '18px 18px', borderRadius: 18, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 11, color: '#FFD166', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
              维度情绪板
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {bundle.dataSnapshot.topDimensions.slice(0, 4).map((dimension) => {
                const mood = dimensionMoodMap[dimension.id];
                return (
                  <div
                    key={dimension.id}
                    style={{
                      padding: '12px 12px',
                      borderRadius: 16,
                      background: mood?.gradient || bundle.themeTokens.gradient,
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#081019',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>
                        {dimension.icon} {dimension.name}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{dimension.confidence}%</div>
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {dimension.traitHighlights.map((trait) => (
                        <span
                          key={`${dimension.id}:${trait}`}
                          style={{
                            fontSize: 11,
                            padding: '4px 8px',
                            borderRadius: 999,
                            background: 'rgba(255,255,255,0.22)',
                            color: '#081019',
                          }}
                        >
                          {trait}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.8 }}>
          当前构图：{COMPOSITION_META[composition.id].label} · {COMPOSITION_META[composition.id].note} · {normalizeFrameCount(composition.durationInFrames)} @ {bundle.fps}fps
        </div>
      </motion.div>
    </section>
  );
}
