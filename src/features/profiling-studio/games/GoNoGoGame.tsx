import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from '../lib/motion-lite';
import type { GoNoGoResult } from '../types';

const GO_STIMULUS = '⬤';
const NOGO_STIMULUS = '◆';
const STIMULUS_DURATION = 800;
const ISI = 600;
const TOTAL_TRIALS = 30;
const NOGO_COUNT = 6;

function generateTrials(): ('go' | 'nogo')[] {
  const trials: ('go' | 'nogo')[] = [];
  const nogoPositions = new Set<number>();
  while (nogoPositions.size < NOGO_COUNT) {
    const pos = 2 + Math.floor(Math.random() * (TOTAL_TRIALS - 2));
    if (!nogoPositions.has(pos - 1) && !nogoPositions.has(pos + 1)) nogoPositions.add(pos);
  }
  for (let i = 0; i < TOTAL_TRIALS; i++) trials.push(nogoPositions.has(i) ? 'nogo' : 'go');
  return trials;
}

/* ── Shared Styles ── */
const pageCenter: React.CSSProperties = {
  minHeight: '100vh', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  padding: '24px 20px', position: 'relative',
  background: 'linear-gradient(180deg, #0a0a1a 0%, #0f0c29 50%, #1a1a2e 100%)',
};
const glassCard: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20,
  padding: '28px 28px', width: '100%', maxWidth: 520,
};
const homeBtn: React.CSSProperties = {
  position: 'absolute', top: 16, left: 20, zIndex: 30,
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', borderRadius: 24,
  border: '1px solid rgba(255,255,255,0.08)',
  color: 'var(--text-tertiary)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)',
};
const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
);

interface Props { onComplete: (result: GoNoGoResult) => void; }

export default function GoNoGoGame({ onComplete }: Props) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'intro' | 'playing' | 'result'>('intro');
  const [trials] = useState(generateTrials);
  const [currentTrial, setCurrentTrial] = useState(0);
  const [showStimulus, setShowStimulus] = useState(false);
  const [responded, setResponded] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [result, setResult] = useState<GoNoGoResult | null>(null);
  const startTime = useRef(0);
  const goRTs = useRef<number[]>([]);
  const commissions = useRef(0);
  const omissions = useRef(0);
  const goCorrect = useRef(0);
  const nogoCorrect = useRef(0);
  const respondedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const endTrial = useCallback((wasResponded = respondedRef.current) => {
    const trial = trials[currentTrial];
    if (trial === 'go' && !wasResponded) { omissions.current++; setFeedback('miss'); }
    else if (trial === 'nogo' && !wasResponded) { nogoCorrect.current++; setFeedback('hold'); }
    setTimeout(() => {
      if (currentTrial + 1 >= TOTAL_TRIALS) {
        const goTotal = TOTAL_TRIALS - NOGO_COUNT;
        const r: GoNoGoResult = {
          goAccuracy: Math.round((goCorrect.current / goTotal) * 100),
          noGoAccuracy: Math.round((nogoCorrect.current / NOGO_COUNT) * 100),
          commissionErrors: commissions.current, omissionErrors: omissions.current,
          avgGoRT: goRTs.current.length > 0 ? Math.round(goRTs.current.reduce((a, b) => a + b, 0) / goRTs.current.length) : 0,
          totalTrials: TOTAL_TRIALS,
        };
        setResult(r); setPhase('result'); onComplete(r);
      } else {
        respondedRef.current = false;
        setResponded(false);
        setFeedback(null);
        setCurrentTrial(prev => prev + 1);
      }
    }, 300);
  }, [currentTrial, trials, onComplete]);

  useEffect(() => {
    if (phase !== 'playing') return;
    const showTimer = setTimeout(() => {
      setShowStimulus(true); startTime.current = performance.now();
      timerRef.current = setTimeout(() => { setShowStimulus(false); endTrial(); }, STIMULUS_DURATION);
    }, ISI);
    return () => { clearTimeout(showTimer); clearTimeout(timerRef.current); };
  }, [phase, currentTrial, endTrial]);

  const handleTap = () => {
    if (!showStimulus || respondedRef.current || phase !== 'playing') return;
    respondedRef.current = true;
    setResponded(true);
    const rt = performance.now() - startTime.current;
    const trial = trials[currentTrial];
    if (trial === 'go') { goCorrect.current++; goRTs.current.push(rt); setFeedback('hit'); }
    else { commissions.current++; setFeedback('error'); }
    clearTimeout(timerRef.current); setShowStimulus(false); endTrial(true);
  };

  // ── Intro ──
  if (phase === 'intro') {
    return (
      <div style={pageCenter}>
        <button onClick={() => navigate('/games')} style={homeBtn}><BackIcon /> 返回</button>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          style={{ textAlign: 'center', maxWidth: 480, width: '100%' }}>
          <div style={{ fontSize: 56, marginBottom: 20 }}>⚡</div>
          <h1 style={{
            fontSize: 32, fontWeight: 700, marginBottom: 10, fontFamily: 'var(--font-serif)',
            background: 'linear-gradient(135deg, #64FFDA, #4FC3F7)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>Go / No-Go 抑制控制</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.8 }}>
            看到<strong style={{ color: 'var(--accent-cyan)' }}> ⬤ 圆形</strong>时<strong>点击</strong>，
            看到<strong style={{ color: 'var(--accent-red)' }}> ◆ 菱形</strong>时<strong>忍住不点</strong>。
          </p>
          <div style={{ ...glassCard, marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 48 }}>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: 52, color: 'var(--accent-cyan)' }}>{GO_STIMULUS}</span>
                <p style={{ fontSize: 12, marginTop: 8, color: 'var(--accent-cyan)' }}>Go → 点击!</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: 52, color: 'var(--accent-red)' }}>{NOGO_STIMULUS}</span>
                <p style={{ fontSize: 12, marginTop: 8, color: 'var(--accent-red)' }}>No-Go → 忍住!</p>
              </div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 28 }}>
            共 {TOTAL_TRIALS} 轮 · 速度很快 · 约 45 秒
          </p>
          <button onClick={() => setPhase('playing')} style={{
            background: 'linear-gradient(135deg, #7C4DFF, #E040FB)',
            color: '#fff', border: 'none', borderRadius: 16,
            padding: '16px 48px', fontSize: 16, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-sans)', boxShadow: '0 8px 32px rgba(124,77,255,0.25)',
          }}>准备好了</button>
        </motion.div>
      </div>
    );
  }

  // ── Result ──
  if (phase === 'result' && result) {
    return (
      <div style={pageCenter}>
        <button onClick={() => navigate('/games')} style={homeBtn}><BackIcon /> 返回</button>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          style={{ textAlign: 'center', maxWidth: 520, width: '100%' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
          <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 28, fontFamily: 'var(--font-serif)' }}>Go/No-Go 结果</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            {[
              { value: `${result.goAccuracy}%`, label: 'Go 正确率', color: 'var(--accent-cyan)' },
              { value: `${result.noGoAccuracy}%`, label: 'No-Go 抑制成功', color: result.noGoAccuracy >= 80 ? 'var(--accent-cyan)' : 'var(--accent-gold)' },
              { value: `${result.commissionErrors}`, label: '冲动误按', color: 'var(--accent-red)' },
              { value: `${result.avgGoRT}ms`, label: '平均反应时', color: 'var(--text-secondary)' },
            ].map(item => (
              <div key={item.label} style={{ ...glassCard, padding: '20px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 28, fontWeight: 700, color: item.color, marginBottom: 4 }}>{item.value}</p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{item.label}</p>
              </div>
            ))}
          </div>
          <div style={{ ...glassCard, textAlign: 'left', marginBottom: 24 }}>
            <p style={{ fontSize: 12, color: 'var(--accent-cyan)', marginBottom: 8 }}>📖 科学解读</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              No-Go 正确率反映了<strong>抑制控制</strong>能力——在自动反应冲动面前"刹车"的能力。
              {result.noGoAccuracy >= 80 ? ' 你的抑制控制非常出色！' : result.noGoAccuracy >= 50 ? ' 表现不错，有提升空间。' : ' 正念练习可以提升抑制控制力。'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => navigate('/games')} style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 14, padding: '14px 28px', fontSize: 14, fontWeight: 600,
              color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>返回实验室</button>
            <button onClick={() => navigate('/report')} style={{
              background: 'linear-gradient(135deg, #7C4DFF, #E040FB)', color: '#fff',
              border: 'none', borderRadius: 14, padding: '14px 28px', fontSize: 14,
              fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>查看画像</button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Playing ──
  const trialType = trials[currentTrial];
  const progress = ((currentTrial + 1) / TOTAL_TRIALS) * 100;

  return (
    <div style={{ ...pageCenter, cursor: 'pointer' }} onClick={handleTap}>
      <button onClick={(e) => { e.stopPropagation(); navigate('/games'); }} style={homeBtn}><BackIcon /> 返回</button>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.04)' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #64FFDA, #4FC3F7)', transition: 'width 0.3s ease' }} />
      </div>

      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <AnimatePresence mode="wait">
          {showStimulus ? (
            <motion.div key={`stim-${currentTrial}`} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.1 }}>
              <span style={{
                fontSize: 120, userSelect: 'none',
                color: trialType === 'go' ? 'var(--accent-cyan)' : 'var(--accent-red)',
                filter: `drop-shadow(0 0 40px ${trialType === 'go' ? 'rgba(100,255,218,0.4)' : 'rgba(255,107,107,0.4)'})`,
              }}>{trialType === 'go' ? GO_STIMULUS : NOGO_STIMULUS}</span>
            </motion.div>
          ) : (
            <motion.div key="blank" initial={{ opacity: 0 }} animate={{ opacity: 0.3 }}>
              <span style={{ fontSize: 32, color: 'var(--text-tertiary)' }}>+</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {feedback && (
        <div style={{
          marginTop: 24, fontSize: 14, fontWeight: 600,
          color: feedback === 'hit' || feedback === 'hold' ? 'var(--accent-cyan)' : feedback === 'miss' ? 'var(--accent-gold)' : 'var(--accent-red)',
        }}>
          {feedback === 'hit' ? '✓' : feedback === 'hold' ? '✓ 忍住了' : feedback === 'miss' ? '遗漏' : '✗ 冲动误按'}
        </div>
      )}

      <p style={{ position: 'absolute', bottom: 32, fontSize: 13, color: 'var(--text-tertiary)' }}>
        点击屏幕任意处响应 ⬤ · 忍住不点 ◆
      </p>
    </div>
  );
}
