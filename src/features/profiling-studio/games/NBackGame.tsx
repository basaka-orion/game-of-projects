import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from '../lib/motion-lite';
import type { NBackResult } from '../types';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const STIMULUS_DURATION = 1500;
const N = 2;
const TOTAL_STIMULI = 20;
const MATCH_COUNT = 6;

function generateSequence(): { letter: string; isTarget: boolean }[] {
  const seq: { letter: string; isTarget: boolean }[] = [];
  for (let i = 0; i < N; i++) {
    seq.push({ letter: LETTERS[Math.floor(Math.random() * LETTERS.length)], isTarget: false });
  }
  const matchPositions = new Set<number>();
  while (matchPositions.size < MATCH_COUNT) {
    matchPositions.add(N + Math.floor(Math.random() * (TOTAL_STIMULI - N)));
  }
  for (let i = N; i < TOTAL_STIMULI; i++) {
    if (matchPositions.has(i)) {
      seq.push({ letter: seq[i - N].letter, isTarget: true });
    } else {
      let letter;
      do { letter = LETTERS[Math.floor(Math.random() * LETTERS.length)]; } while (letter === seq[i - N].letter);
      seq.push({ letter, isTarget: false });
    }
  }
  return seq;
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
  color: 'var(--text-tertiary)', fontSize: 13, cursor: 'pointer',
  fontFamily: 'var(--font-sans)',
};
const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
);

interface Props { onComplete: (result: NBackResult) => void; }

export default function NBackGame({ onComplete }: Props) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'intro' | 'playing' | 'result'>('intro');
  const [sequence] = useState(() => generateSequence());
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showLetter, setShowLetter] = useState(true);
  const [responded, setResponded] = useState(false);
  const [result, setResult] = useState<NBackResult | null>(null);
  const [lastFeedback, setLastFeedback] = useState<'hit' | 'miss' | 'false_alarm' | null>(null);
  const hits = useRef(0);
  const misses = useRef(0);
  const falseAlarms = useRef(0);
  const correctRejections = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const advanceTrial = useCallback(() => {
    const stim = sequence[currentIdx];
    if (stim.isTarget && !responded) { misses.current++; setLastFeedback('miss'); }
    else if (!stim.isTarget && !responded) { correctRejections.current++; }
    if (currentIdx + 1 >= TOTAL_STIMULI) {
      const hitRate = (hits.current + misses.current) > 0 ? hits.current / (hits.current + misses.current) : 0;
      const far = (falseAlarms.current + correctRejections.current) > 0 ? falseAlarms.current / (falseAlarms.current + correctRejections.current) : 0;
      const zHit = Math.max(-3, Math.min(3, hitRate === 1 ? 2.5 : hitRate === 0 ? -2.5 : Math.log(hitRate / (1 - hitRate))));
      const zFA = Math.max(-3, Math.min(3, far === 1 ? 2.5 : far === 0 ? -2.5 : Math.log(far / (1 - far))));
      const r: NBackResult = {
        hitRate: Math.round(hitRate * 100) / 100, falseAlarmRate: Math.round(far * 100) / 100,
        dPrime: Math.round((zHit - zFA) * 100) / 100, level: N, totalTrials: TOTAL_STIMULI,
      };
      setResult(r); setPhase('result'); onComplete(r);
    } else {
      setResponded(false); setLastFeedback(null); setCurrentIdx(prev => prev + 1); setShowLetter(true);
    }
  }, [currentIdx, sequence, responded, onComplete]);

  useEffect(() => {
    if (phase !== 'playing') return;
    timerRef.current = setTimeout(() => { setShowLetter(false); setTimeout(advanceTrial, 300); }, STIMULUS_DURATION);
    return () => clearTimeout(timerRef.current);
  }, [phase, currentIdx, advanceTrial]);

  const handleResponse = () => {
    if (responded || phase !== 'playing') return;
    setResponded(true);
    const stim = sequence[currentIdx];
    if (stim.isTarget) { hits.current++; setLastFeedback('hit'); }
    else { falseAlarms.current++; setLastFeedback('false_alarm'); }
  };

  // ── Intro ──
  if (phase === 'intro') {
    return (
      <div style={pageCenter}>
        <button onClick={() => navigate('/games')} style={homeBtn}><BackIcon /> 返回</button>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          style={{ textAlign: 'center', maxWidth: 480, width: '100%' }}>
          <div style={{ fontSize: 56, marginBottom: 20 }}>🧮</div>
          <h1 style={{
            fontSize: 32, fontWeight: 700, marginBottom: 10, fontFamily: 'var(--font-serif)',
            background: 'linear-gradient(135deg, #4FC3F7, #64FFDA)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>{N}-Back 工作记忆</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.8 }}>
            屏幕依次闪现字母。当前字母和<strong style={{ color: 'var(--accent-cyan)' }}>{N} 步之前</strong>的字母<strong style={{ color: 'var(--accent-gold)' }}>相同</strong>时按下按钮。
          </p>
          <div style={{ ...glassCard, marginBottom: 28, textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>例如序列：A - B - A</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
              {['A', 'B', 'A'].map((l, i) => (
                <div key={i} style={{
                  width: 52, height: 52, borderRadius: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, fontWeight: 700,
                  background: i === 2 ? 'rgba(100,255,218,0.12)' : 'rgba(255,255,255,0.04)',
                  color: i === 2 ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                  border: i === 2 ? '2px solid var(--accent-cyan)' : '1px solid rgba(255,255,255,0.06)',
                }}>{l}</div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              第三个 A 和 2 步前的 A 相同 → <strong style={{ color: 'var(--accent-cyan)' }}>按按钮!</strong>
            </p>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 28 }}>
            共 {TOTAL_STIMULI} 个刺激 · 每个显示 {STIMULUS_DURATION / 1000}s · 约 60 秒
          </p>
          <button onClick={() => setPhase('playing')} style={{
            background: 'linear-gradient(135deg, #7C4DFF, #E040FB)',
            color: '#fff', border: 'none', borderRadius: 16,
            padding: '16px 48px', fontSize: 16, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-sans)', boxShadow: '0 8px 32px rgba(124,77,255,0.25)',
          }}>开始测试</button>
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
          <div style={{ fontSize: 48, marginBottom: 16 }}>🧠</div>
          <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 28, fontFamily: 'var(--font-serif)' }}>{N}-Back 测试结果</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            {[
              { value: `${Math.round(result.hitRate * 100)}%`, label: '命中率', color: 'var(--accent-cyan)' },
              { value: `${Math.round(result.falseAlarmRate * 100)}%`, label: '虚报率', color: result.falseAlarmRate > 0.3 ? 'var(--accent-red)' : 'var(--accent-gold)' },
            ].map(item => (
              <div key={item.label} style={{ ...glassCard, padding: '20px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 28, fontWeight: 700, color: item.color, marginBottom: 4 }}>{item.value}</p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{item.label}</p>
              </div>
            ))}
          </div>
          <div style={{ ...glassCard, padding: '20px 16px', textAlign: 'center', marginBottom: 20 }}>
            <p style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent-purple)', marginBottom: 4 }}>{result.dPrime}</p>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>d' 敏感度指数</p>
          </div>
          <div style={{ ...glassCard, textAlign: 'left', marginBottom: 24 }}>
            <p style={{ fontSize: 12, color: 'var(--accent-cyan)', marginBottom: 8 }}>📖 科学解读</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              d' 越高说明工作记忆越好——既能抓住真正的匹配，又不会被干扰混淆。
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
  const stim = sequence[currentIdx];
  const progress = ((currentIdx + 1) / TOTAL_STIMULI) * 100;

  return (
    <div style={pageCenter}>
      <button onClick={() => navigate('/games')} style={homeBtn}><BackIcon /> 返回</button>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.04)' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #4FC3F7, #64FFDA)', transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ position: 'absolute', top: 16, right: 24, fontSize: 12, color: 'var(--text-tertiary)' }}>
        {currentIdx + 1}/{TOTAL_STIMULI}
      </div>

      {/* History trail */}
      <div style={{ position: 'absolute', top: 52, display: 'flex', gap: 10 }}>
        {sequence.slice(Math.max(0, currentIdx - 3), currentIdx).map((s, i) => (
          <span key={i} style={{ fontSize: 14, color: 'var(--text-tertiary)', opacity: 0.3 + i * 0.2 }}>{s.letter}</span>
        ))}
      </div>

      <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 48 }}>
        <AnimatePresence mode="wait">
          {showLetter ? (
            <motion.div key={`letter-${currentIdx}`} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
              style={{
                width: 140, height: 140, borderRadius: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
              }}>
              <span style={{ fontSize: 64, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{stim.letter}</span>
            </motion.div>
          ) : (
            <motion.div key="blank" initial={{ opacity: 0 }} animate={{ opacity: 0.3 }}>
              <span style={{ fontSize: 32, color: 'var(--text-tertiary)' }}>·</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {lastFeedback && (
        <div style={{
          position: 'absolute', top: '55%', fontSize: 13, fontWeight: 600,
          color: lastFeedback === 'hit' ? 'var(--accent-cyan)' : lastFeedback === 'miss' ? 'var(--accent-red)' : 'var(--accent-gold)',
        }}>
          {lastFeedback === 'hit' ? '✓ 命中' : lastFeedback === 'miss' ? '✗ 遗漏' : '⚠ 虚报'}
        </div>
      )}

      <motion.button whileTap={{ scale: 0.9 }} onClick={handleResponse} disabled={responded}
        style={{
          width: 140, height: 140, borderRadius: '50%', fontWeight: 700, fontSize: 18,
          background: responded ? 'rgba(100,255,218,0.15)' : 'rgba(255,255,255,0.04)',
          border: `3px solid ${responded ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.08)'}`,
          color: responded ? 'var(--accent-cyan)' : 'var(--text-secondary)',
          cursor: 'pointer', fontFamily: 'var(--font-sans)',
          boxShadow: responded ? '0 0 30px rgba(100,255,218,0.1)' : 'none',
        }}>
        {responded ? '已按' : '匹配!'}
      </motion.button>
      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 28 }}>
        当前字母和 {N} 步前相同时按下
      </p>
    </div>
  );
}
