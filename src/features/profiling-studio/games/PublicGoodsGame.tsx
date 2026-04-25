import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from '../lib/motion-lite';
import type { PublicGoodsResult } from '../types';

const ENDOWMENT = 100;
const GROUP_SIZE = 4;
const MULTIPLIER = 2;
const TOTAL_ROUNDS = 5;
const AI_CONTRIBUTIONS = [
  [40, 60, 50],
  [50, 40, 30],
  [30, 50, 60],
  [20, 40, 50],
  [60, 30, 40],
];

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

interface Props { onComplete: (result: PublicGoodsResult) => void; }

export default function PublicGoodsGame({ onComplete }: Props) {
  const navigate = useNavigate();
  const [stage, setStage] = useState<'intro' | 'playing' | 'feedback' | 'result'>('intro');
  const [round, setRound] = useState(0);
  const [contribution, setContribution] = useState(50);
  const [contributions, setContributions] = useState<number[]>([]);
  const [feedbackData, setFeedbackData] = useState({ myContribution: 0, totalPool: 0, perPerson: 0, myEarning: 0 });
  const [result, setResult] = useState<PublicGoodsResult | null>(null);

  const handleContribute = () => {
    setContributions(prev => [...prev, contribution]);
    const aiTotal = AI_CONTRIBUTIONS[round % AI_CONTRIBUTIONS.length].reduce((a, b) => a + b, 0);
    const totalPool = (contribution + aiTotal) * MULTIPLIER;
    const perPerson = Math.round(totalPool / GROUP_SIZE);
    const myEarning = (ENDOWMENT - contribution) + perPerson;
    setFeedbackData({ myContribution: contribution, totalPool, perPerson, myEarning });
    setStage('feedback');
  };

  const nextRound = useCallback(() => {
    const nextRd = round + 1;
    if (nextRd >= TOTAL_ROUNDS) {
      const avgContribution = contributions.length > 0 ? contributions.reduce((a, b) => a + b, 0) / contributions.length : 50;
      const trend = contributions.length >= 3
        ? contributions[contributions.length - 1] - contributions[0] : 0;
      const r: PublicGoodsResult = {
        avgContribution: Math.round(avgContribution),
        contributionTrend: trend > 5 ? 'increasing' : trend < -5 ? 'decreasing' : 'stable',
        freeRiderIndex: Math.round((1 - avgContribution / ENDOWMENT) * 100),
        cooperationIndex: Math.round(avgContribution / ENDOWMENT * 100),
        totalRounds: TOTAL_ROUNDS,
      };
      setResult(r); setStage('result'); onComplete(r);
    } else {
      setRound(nextRd); setContribution(50); setStage('playing');
    }
  }, [round, contributions, onComplete]);

  useEffect(() => {
    if (stage === 'feedback') {
      const timer = setTimeout(nextRound, 2500);
      return () => clearTimeout(timer);
    }
  }, [stage, nextRound]);

  // ── Intro ──
  if (stage === 'intro') {
    return (
      <div style={pageCenter}>
        <button onClick={() => navigate('/games')} style={homeBtn}><BackIcon /> 返回</button>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          style={{ textAlign: 'center', maxWidth: 480, width: '100%' }}>
          <div style={{ fontSize: 56, marginBottom: 20 }}>🌍</div>
          <h1 style={{
            fontSize: 32, fontWeight: 700, marginBottom: 10, fontFamily: 'var(--font-serif)',
            background: 'linear-gradient(135deg, #64FFDA, #4FC3F7)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>公共品博弈</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.8 }}>
            你和 {GROUP_SIZE - 1} 位虚拟成员组成一个小组。每人有 <strong style={{ color: 'var(--accent-gold)' }}>{ENDOWMENT} 元</strong>，
            可以选择投入<strong style={{ color: 'var(--accent-cyan)' }}>公共池</strong>。
            公共池总额会 <strong style={{ color: 'var(--accent-gold)' }}>×{MULTIPLIER}</strong> 然后平分给所有人。
          </p>
          <div style={{ ...glassCard, marginBottom: 28, textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
              {['你', '成员A', '成员B', '成员C'].map((name, i) => (
                <div key={i} style={{
                  width: 52, height: 52, borderRadius: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: i === 0 ? 'rgba(100,255,218,0.12)' : 'rgba(255,255,255,0.04)',
                  border: i === 0 ? '2px solid var(--accent-cyan)' : '1px solid rgba(255,255,255,0.06)',
                  fontSize: 11, fontWeight: 600,
                  color: i === 0 ? 'var(--accent-cyan)' : 'var(--text-tertiary)',
                }}>{name}</div>
              ))}
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: 20, color: 'var(--accent-gold)' }}>→ 🏦 ×{MULTIPLIER} → 均分</span>
              </div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 28 }}>
            共 {TOTAL_ROUNDS} 轮 · 约 2 分钟
          </p>
          <button onClick={() => setStage('playing')} style={{
            background: 'linear-gradient(135deg, #7C4DFF, #E040FB)',
            color: '#fff', border: 'none', borderRadius: 16,
            padding: '16px 48px', fontSize: 16, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-sans)', boxShadow: '0 8px 32px rgba(124,77,255,0.25)',
          }}>开始博弈</button>
        </motion.div>
      </div>
    );
  }

  // ── Feedback ──
  if (stage === 'feedback') {
    return (
      <div style={pageCenter}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ textAlign: 'center', maxWidth: 400, width: '100%' }}>
          <div style={{ ...glassCard }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-cyan)', marginBottom: 16 }}>第 {round + 1} 轮结果</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><p style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-gold)' }}>{feedbackData.myContribution}</p><p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>你投入</p></div>
              <div><p style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-cyan)' }}>{feedbackData.totalPool}</p><p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>池总额 (×{MULTIPLIER})</p></div>
              <div><p style={{ fontSize: 22, fontWeight: 700, color: '#64FFDA' }}>{feedbackData.perPerson}</p><p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>人均返还</p></div>
              <div><p style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{feedbackData.myEarning}</p><p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>你的收益</p></div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Result ──
  if (stage === 'result' && result) {
    return (
      <div style={pageCenter}>
        <button onClick={() => navigate('/games')} style={homeBtn}><BackIcon /> 返回</button>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          style={{ textAlign: 'center', maxWidth: 520, width: '100%' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🌍</div>
          <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 28, fontFamily: 'var(--font-serif)' }}>公共品博弈结果</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            {[
              { value: `${result.cooperationIndex}%`, label: '合作指数', color: 'var(--accent-cyan)' },
              { value: `${result.freeRiderIndex}%`, label: '搭便车指数', color: 'var(--accent-gold)' },
              { value: `${result.avgContribution}`, label: '平均投入', color: 'var(--accent-purple)' },
              { value: result.contributionTrend === 'increasing' ? '↑ 上升' : result.contributionTrend === 'decreasing' ? '↓ 下降' : '→ 稳定', label: '趋势', color: result.contributionTrend === 'increasing' ? 'var(--accent-cyan)' : result.contributionTrend === 'decreasing' ? 'var(--accent-red)' : 'var(--text-secondary)' },
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
              合作指数反映了你在社会困境中的合作程度。
              {result.contributionTrend === 'decreasing' && ' 投入呈下降趋势——这是典型的"条件合作者"模式。'}
              {result.contributionTrend === 'increasing' && ' 投入呈上升趋势——你倾向于正向互利。'}
              {result.cooperationIndex >= 60 && ' 你的合作水平高于大多数人。'}
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
  return (
    <div style={pageCenter}>
      <button onClick={() => navigate('/games')} style={homeBtn}><BackIcon /> 返回</button>
      <div style={{ position: 'absolute', top: 16, right: 24, fontSize: 12, color: 'var(--text-tertiary)' }}>
        第 {round + 1}/{TOTAL_ROUNDS} 轮
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ textAlign: 'center', maxWidth: 460, width: '100%' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🏦</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, fontFamily: 'var(--font-serif)' }}>
          你愿意投入公共池多少？
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 32 }}>
          公共池总额会 ×{MULTIPLIER} 后平均分配给所有 {GROUP_SIZE} 名成员
        </p>
        <div style={{ ...glassCard, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', gap: 32, alignItems: 'baseline' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>投入公池</p>
              <p style={{ fontSize: 48, fontWeight: 700, color: 'var(--accent-cyan)' }}>{contribution}</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>自己保留</p>
              <p style={{ fontSize: 48, fontWeight: 700, color: 'var(--text-secondary)' }}>{ENDOWMENT - contribution}</p>
            </div>
          </div>
          <input type="range" min="0" max={ENDOWMENT} step="10" value={contribution}
            onChange={e => setContribution(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#64FFDA' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 11, color: 'var(--text-tertiary)' }}>
            <span>搭便车</span><span>全部投入</span>
          </div>
        </div>
        <button onClick={handleContribute} style={{
          marginTop: 28, background: 'linear-gradient(135deg, #7C4DFF, #E040FB)',
          color: '#fff', border: 'none', borderRadius: 16,
          padding: '14px 40px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'var(--font-sans)', boxShadow: '0 8px 32px rgba(124,77,255,0.25)',
        }}>确认投入</button>
      </motion.div>
    </div>
  );
}
