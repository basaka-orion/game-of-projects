import { useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from '../lib/motion-lite';
import { useAssessmentStore } from '../store';
import { DIMENSIONS } from '../data/dimensions';

export default function SharePosterPage() {
  const navigate = useNavigate();
  const { topology } = useAssessmentStore();
  const posterRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const topTraits = useMemo(() => {
    if (!topology) return [];
    return Object.values(topology.dimensionTopologies)
      .flatMap(dt => dt.dominantTraits)
      .filter(t => t.typology !== '待识别')
      .slice(0, 5)
      .map(t => ({
        name: t.subDimensionName,
        typology: t.typology,
        flowZone: t.flowZone,
      }));
  }, [topology]);

  if (!topology) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="text-6xl mb-4">🖼️</div>
        <h2 className="text-xl font-bold mb-3">生成画像海报</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          需要先完成测评并生成拓扑画像
        </p>
        <button onClick={() => navigate('/assessment')} className="btn-primary">前往评估</button>
      </div>
    );
  }

  const dateStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });

  const handleDownload = async () => {
    if (!posterRef.current) return;
    try {
      const el = posterRef.current;
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = el.offsetWidth * scale;
      canvas.height = el.offsetHeight * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const svgData = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">
          <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml" style="transform: scale(${scale}); transform-origin: top left;">
              ${el.outerHTML}
            </div>
          </foreignObject>
        </svg>`;
      const img = new Image();
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        const link = document.createElement('a');
        link.download = `拓扑画像-${dateStr}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      };
      img.src = url;
    } catch {
      handleCopyText();
    }
  };

  const handleCopyText = () => {
    const text = `🌌 我的拓扑画像 — ${dateStr}\n\n` +
      `原型：「${topology.selfArchetype}」\n\n` +
      `核心特质：\n` +
      topTraits.map(t => `• ${t.name}: ${t.typology}`).join('\n') +
      `\n\n💡 ${topology.narrativeIdentity.slice(0, 100)}...\n\n🔗 多维拓扑画像平台`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--glass-border)' }}>
        <button onClick={() => navigate('/report')} className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          ← 返回画像
        </button>
        <h2 className="text-sm font-medium">拓扑海报</h2>
        <div className="w-16" />
      </div>

      {/* Poster Card */}
      <div className="flex justify-center px-4 py-8">
        <motion.div
          ref={posterRef}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          style={{
            width: '380px',
            background: 'linear-gradient(145deg, #0A0E1A 0%, #141B2D 40%, #0F1629 100%)',
            borderRadius: '24px',
            padding: '32px 24px',
            border: '1px solid rgba(100, 255, 218, 0.15)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '120px',
            background: 'radial-gradient(ellipse 80% 80% at 30% -20%, rgba(100,255,218,0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          {/* Title */}
          <div className="text-center mb-6" style={{ position: 'relative' }}>
            <p className="text-xs mb-2" style={{ color: 'var(--accent-cyan)', letterSpacing: '3px' }}>TOPOLOGY PROFILING</p>
            <h2 className="text-xl font-bold mb-1" style={{ fontFamily: 'var(--font-serif)' }}>
              拓扑画像
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{dateStr}</p>
          </div>

          {/* Archetype */}
          <div className="text-center mb-6 px-4">
            <div className="inline-block px-4 py-2 rounded-full" style={{
              background: 'linear-gradient(135deg, rgba(100,255,218,0.1), rgba(187,134,252,0.1))',
              border: '1px solid rgba(100,255,218,0.2)',
            }}>
              <span className="text-sm font-medium" style={{ color: 'var(--accent-cyan)' }}>
                「{topology.selfArchetype}」
              </span>
            </div>
          </div>

          {/* Dimension Topologies as chips */}
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {DIMENSIONS.map(dim => {
              const dt = topology.dimensionTopologies[dim.id];
              if (!dt) return null;
              const topTrait = dt.dominantTraits.find(t => t.typology !== '待识别');
              return topTrait ? (
                <span key={dim.id} className="text-xs px-2 py-1 rounded-full"
                  style={{ background: `${dim.color}12`, color: dim.color, border: `1px solid ${dim.color}20` }}>
                  {dim.icon} {topTrait.typology}
                </span>
              ) : null;
            })}
          </div>

          {/* Top Traits */}
          <div className="space-y-2 mb-6">
            {topTraits.slice(0, 3).map((t, i) => (
              <div key={t.name} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.05)',
              }}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{t.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t.typology}</p>
                </div>
                <span className="text-xs" style={{
                  color: i === 0 ? 'var(--accent-cyan)' : i === 1 ? 'var(--accent-gold)' : 'var(--accent-purple)',
                }}>
                  ⚡ {t.flowZone.slice(0, 15)}…
                </span>
              </div>
            ))}
          </div>

          {/* Cross-reaction */}
          {topology.crossReactions.length > 0 && (
            <div className="px-3 py-3 rounded-xl mb-6" style={{
              background: 'rgba(255,255,255,0.02)',
              borderLeft: '2px solid var(--accent-cyan)',
            }}>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                ⚡ {topology.crossReactions[0].title}: {topology.crossReactions[0].narrative.slice(0, 80)}…
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="text-center pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)', letterSpacing: '1px' }}>
              拓扑识别 · 多维画像平台
            </p>
          </div>
        </motion.div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center gap-3 px-6">
        <button onClick={handleDownload} className="btn-primary px-8 py-3 text-sm">
          📥 下载海报
        </button>
        <button onClick={handleCopyText}
          className="btn-secondary px-6 py-3 text-sm"
          style={{ position: 'relative' }}
        >
          {copied ? '✅ 已复制' : '📋 复制文案'}
        </button>
      </div>

      <p className="text-center text-xs mt-4" style={{ color: 'var(--text-tertiary)' }}>
        截图分享你的拓扑画像给朋友 ✨
      </p>
    </div>
  );
}
