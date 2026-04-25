import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from '../lib/motion-lite';
import type { StroopResult } from '../types';

// ── Color/Word pairs ──
const COLORS = [
  { name: '红', hex: '#FF6B6B' },
  { name: '蓝', hex: '#4FC3F7' },
  { name: '绿', hex: '#64FFDA' },
  { name: '黄', hex: '#FFD700' },
  { name: '紫', hex: '#BB86FC' },
];

interface Trial {
  word: string;
  inkColor: typeof COLORS[number];
  isCongruent: boolean;
}

function generateTrials(count: number): Trial[] {
  const trials: Trial[] = [];
  const half = Math.floor(count / 2);

  for (let i = 0; i < half; i++) {
    const c = COLORS[Math.floor(Math.random() * COLORS.length)];
    trials.push({ word: c.name, inkColor: c, isCongruent: true });
  }

  for (let i = 0; i < count - half; i++) {
    const wordIdx = Math.floor(Math.random() * COLORS.length);
    let inkIdx = Math.floor(Math.random() * COLORS.length);
    while (inkIdx === wordIdx) inkIdx = Math.floor(Math.random() * COLORS.length);
    trials.push({ word: COLORS[wordIdx].name, inkColor: COLORS[inkIdx], isCongruent: false });
  }

  for (let i = trials.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [trials[i], trials[j]] = [trials[j], trials[i]];
  }
  return trials;
}

const TOTAL_TRIALS = 20;

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
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: 'var(--text-tertiary)', fontSize: 13,
  cursor: 'pointer', transition: 'all .3s',
  fontFamily: 'var(--font-sans)',
};

const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
);

interface Props {
  onComplete: (result: StroopResult) => void;
}

export default function StroopGame({ onComplete }: Props) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'intro' | 'playing' | 'result'>('intro');
  const [trials] = useState(() => generateTrials(TOTAL_TRIALS));
  const [currentTrial, setCurrentTrial] = useState(0);
  const [showStimulus, setShowStimulus] = useState(false);
  const startTime = useRef(0);
  const congruentRTs = useRef<number[]>([]);
  const incongruentRTs = useRef<number[]>([]);
  const correctCount = useRef(0);
  const [result, setResult] = useState<StroopResult | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);

  const startTrial = useCallback(() => {
    setFeedback(null);
    setShowStimulus(false);
    setTimeout(() => {
      setShowStimulus(true);
      startTime.current = performance.now();
    }, 500);
  }, []);

  useEffect(() => {
    if (phase === 'playing') startTrial();
  }, [phase, currentTrial, startTrial]);

  const handleAnswer = (colorName: string) => {
    if (!showStimulus) return;
    const rt = performance.now() - startTime.current;
    const trial = trials[currentTrial];
    const isCorrect = colorName === trial.inkColor.name;

    if (isCorrect) {
      correctCount.current++;
      if (trial.isCongruent) congruentRTs.current.push(rt);
      else incongruentRTs.current.push(rt);
    }

    setFeedback(isCorrect ? 'correct' : 'wrong');
    setShowStimulus(false);

    setTimeout(() => {
      if (currentTrial + 1 >= TOTAL_TRIALS) {
        const avgCong = congruentRTs.current.length > 0
          ? congruentRTs.current.reduce((a, b) => a + b, 0) / congruentRTs.current.length : 500;
        const avgIncong = incongruentRTs.current.length > 0
          ? incongruentRTs.current.reduce((a, b) => a + b, 0) / incongruentRTs.current.length : 700;
        const r: StroopResult = {
          congruentRT: Math.round(avgCong),
          incongruentRT: Math.round(avgIncong),
          stroopEffect: Math.round(avgIncong - avgCong),
          accuracy: Math.round((correctCount.current / TOTAL_TRIALS) * 100),
          totalTrials: TOTAL_TRIALS,
        };
        setResult(r);
        setPhase('result');
        onComplete(r);
      } else {
        setCurrentTrial(prev => prev + 1);
      }
    }, 400);
  };

  // ── Intro ──
  if (phase === 'intro') {
    return (
      <div style={pageCenter}>
        <button onClick={() => navigate('/games')} style={homeBtn}><BackIcon /> 返回</button>

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          style={{ textAlign: 'center', maxWidth: 480, width: '100%' }}>
          <div style={{ fontSize: 56, marginBottom: 20 }}>🎨</div>
          <h1 style={{
            fontSize: 32, fontWeight: 700, marginBottom: 10,
            fontFamily: 'var(--font-serif)',
            background: 'linear-gradient(135deg, #FF6B6B, #BB86FC)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>Stroop 色词测验</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.8 }}>
            屏幕会显示一个<strong style={{ color: 'var(--accent-cyan)' }}>彩色文字</strong>。
            识别文字的<strong style={{ color: 'var(--accent-gold)' }}>墨水颜色</strong>，而不是文字含义。
          </p>

          <div style={{ ...glassCard, marginBottom: 28, textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>例如：</p>
            <p style={{ fontSize: 52, fontWeight: 700, color: '#64FFDA', fontFamily: 'var(--font-serif)', marginBottom: 16 }}>红</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              正确答案是 <strong style={{ color: '#64FFDA' }}>绿</strong>（墨水颜色），不是「红」
            </p>
          </div>

          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 28 }}>
            共 {TOTAL_TRIALS} 轮 · 尽量又快又准 · 约 90 秒
          </p>
          <button onClick={() => setPhase('playing')} style={{
            background: 'linear-gradient(135deg, #7C4DFF, #E040FB)',
            color: '#fff', border: 'none', borderRadius: 16,
            padding: '16px 48px', fontSize: 16, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-sans)', letterSpacing: '0.02em',
            boxShadow: '0 8px 32px rgba(124,77,255,0.25)',
          }}>
            开始测验
          </button>
        </motion.div>
      </div>
    );
  }

  // ── Result ──
  if (phase === 'result' && result) {
    const stroopScore = Math.max(0, Math.min(100, 100 - Math.round(result.stroopEffect / 5)));
    return (
      <div style={pageCenter}>
        <button onClick={() => navigate('/games')} style={homeBtn}><BackIcon /> 返回</button>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          style={{ textAlign: 'center', maxWidth: 520, width: '100%' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🧠</div>
          <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 28, fontFamily: 'var(--font-serif)' }}>
            Stroop 测验结果
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            {[
              { value: `${result.accuracy}%`, label: '正确率', color: 'var(--accent-cyan)' },
              { value: `${result.stroopEffect}ms`, label: 'Stroop 效应', color: 'var(--accent-gold)' },
              { value: `${result.congruentRT}ms`, label: '一致条件 RT', color: 'var(--text-secondary)' },
              { value: `${result.incongruentRT}ms`, label: '不一致条件 RT', color: 'var(--text-secondary)' },
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
              Stroop 效应越小说明你的<strong>认知控制力</strong>越强——能有效抑制自动化反应。
              {stroopScore > 70 && ' 你的得分非常出色！'}
              {stroopScore < 40 && ' 多练习正念冥想可以显著提升这一能力。'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => navigate('/games')} style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 14, padding: '14px 28px', fontSize: 14, fontWeight: 600,
              color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>返回实验室</button>
            <button onClick={() => navigate('/report')} style={{
              background: 'linear-gradient(135deg, #7C4DFF, #E040FB)',
              color: '#fff', border: 'none', borderRadius: 14,
              padding: '14px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}>查看画像</button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Playing ──
  const trial = trials[currentTrial];
  const progress = ((currentTrial + 1) / TOTAL_TRIALS) * 100;

  return (
    <div style={pageCenter}>
      <button onClick={() => navigate('/games')} style={homeBtn}><BackIcon /> 返回</button>

      {/* Progress bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.04)' }}>
        <div style={{
          height: '100%', width: `${progress}%`,
          background: 'linear-gradient(90deg, #7C4DFF, #E040FB)',
          transition: 'width 0.3s ease',
        }} />
      </div>

      {/* Counter */}
      <div style={{ position: 'absolute', top: 16, right: 24, fontSize: 12, color: 'var(--text-tertiary)' }}>
        {currentTrial + 1}/{TOTAL_TRIALS}
      </div>

      {/* Stimulus area */}
      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 48 }}>
        <AnimatePresence mode="wait">
          {!showStimulus ? (
            <motion.div key="fix" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <span style={{ fontSize: 32, color: 'var(--text-tertiary)' }}>+</span>
            </motion.div>
          ) : (
            <motion.div key={`stim-${currentTrial}`} initial={{ opacity: 0, scale: 1.2 }} animate={{ opacity: 1, scale: 1 }}>
              <span style={{
                fontSize: 80, fontWeight: 700, color: trial.inkColor.hex,
                fontFamily: 'var(--font-serif)',
                textShadow: `0 0 40px ${trial.inkColor.hex}30`,
              }}>
                {trial.word}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Feedback flash */}
      {feedback && (
        <div style={{
          position: 'absolute', top: '40%',
          fontSize: 14, fontWeight: 600,
          color: feedback === 'correct' ? 'var(--accent-cyan)' : 'var(--accent-red)',
        }}>
          {feedback === 'correct' ? '✓' : '✗'}
        </div>
      )}

      {/* Answer buttons */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        {COLORS.map(c => (
          <motion.button
            key={c.name}
            whileTap={{ scale: 0.9 }}
            style={{
              width: 72, height: 72, borderRadius: 18,
              fontWeight: 700, fontSize: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${c.hex}10`,
              border: `2px solid ${c.hex}35`,
              color: c.hex, cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              transition: 'all .2s',
            }}
            onClick={() => handleAnswer(c.name)}
            disabled={!showStimulus}
          >
            {c.name}
          </motion.button>
        ))}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 32 }}>
        选择文字的<strong>墨水颜色</strong>
      </p>
    </div>
  );
}
