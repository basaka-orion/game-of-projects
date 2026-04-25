import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from '../lib/motion-lite';
import type { TrustResult } from '../types';

const ENDOWMENT = 100;
const MULTIPLIER = 3;
const TOTAL_ROUNDS = 5;
const AI_INVESTMENTS = [30, 50, 70, 40, 60];
const AI_RETURNS = [0.3, 0.5, 0.4, 0.35, 0.45];

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

interface Props { onComplete: (result: TrustResult) => void; }

export default function TrustGame({ onComplete }: Props) {
  const navigate = useNavigate();
  const [stage, setStage] = useState<'intro' | 'playing' | 'feedback' | 'result'>('intro');
  const [phase, setPhase] = useState<'invest' | 'trustee'>('invest');
  const [round, setRound] = useState(0);
  const [investment, setInvestment] = useState(50);
  const [returnAmount, setReturnAmount] = useState(50);
  const [investments, setInvestments] = useState<number[]>([]);
  const [returns, setReturns] = useState<number[]>([]);
  const [feedbackData, setFeedbackData] = useState({ invested: 0, tripled: 0, returned: 0, kept: 0 });
  const [result, setResult] = useState<TrustResult | null>(null);

  const trusteeIdx = Math.floor(round / 2);

  const handleInvest = () => {
    setInvestments(prev => [...prev, investment]);
    const tripled = investment * MULTIPLIER;
    const aiReturn = Math.round(tripled * AI_RETURNS[round % AI_RETURNS.length]);
    setFeedbackData({ invested: investment, tripled, returned: aiReturn, kept: tripled - aiReturn });
    setStage('feedback');
  };

  const handleReturn = () => {
    setReturns(prev => [...prev, returnAmount]);
    const received = AI_INVESTMENTS[trusteeIdx] * MULTIPLIER;
    setFeedbackData({ invested: AI_INVESTMENTS[trusteeIdx], tripled: received, returned: returnAmount, kept: received - returnAmount });
    setStage('feedback');
  };

  const nextRound = useCallback(() => {
    const nextRd = round + 1;
    if (nextRd >= TOTAL_ROUNDS) {
      const avgInv = investments.length > 0 ? investments.reduce((a, b) => a + b, 0) / investments.length : 50;
      const avgRet = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 50;
      const r: TrustResult = {
        avgInvestment: Math.round(avgInv), avgReturn: Math.round(avgRet),
        trustIndex: Math.round(avgInv / ENDOWMENT * 100),
        reciprocityIndex: Math.round(avgRet / (AI_INVESTMENTS[0] * MULTIPLIER) * 100),
        totalRounds: TOTAL_ROUNDS,
      };
      setResult(r); setStage('result'); onComplete(r);
    } else {
      setRound(nextRd);
      setPhase(nextRd % 2 === 0 ? 'invest' : 'trustee');
      setInvestment(50); setReturnAmount(50);
      setStage('playing');
    }
  }, [round, investments, returns, onComplete]);

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
          <div style={{ fontSize: 56, marginBottom: 20 }}>🤝</div>
          <h1 style={{
            fontSize: 32, fontWeight: 700, marginBottom: 10, fontFamily: 'var(--font-serif)',
            background: 'linear-gradient(135deg, #BB86FC, #E040FB)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>信任博弈</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.8 }}>
            你和一位虚拟伙伴轮流扮演<strong style={{ color: 'var(--accent-purple)' }}>投资者</strong>和<strong style={{ color: 'var(--accent-cyan)' }}>受托者</strong>。
            投资者决定投入多少，金额会<strong style={{ color: 'var(--accent-gold)' }}>×{MULTIPLIER}</strong>，然后受托者决定返还多少。
          </p>
          <div style={{ ...glassCard, marginBottom: 28, textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>💰</div>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>投资{ENDOWMENT}元</p>
              </div>
              <span style={{ fontSize: 24, color: 'var(--accent-gold)' }}>→ ×{MULTIPLIER} →</span>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🎁</div>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>受托者返还部分</p>
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
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-purple)', marginBottom: 16 }}>第 {round + 1} 轮结果</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><p style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-gold)' }}>{feedbackData.invested}</p><p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>投入</p></div>
              <div><p style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-cyan)' }}>{feedbackData.tripled}</p><p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>×{MULTIPLIER}后</p></div>
              <div><p style={{ fontSize: 22, fontWeight: 700, color: '#64FFDA' }}>{feedbackData.returned}</p><p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>返还</p></div>
              <div><p style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-secondary)' }}>{feedbackData.kept}</p><p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>保留</p></div>
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
          <div style={{ fontSize: 48, marginBottom: 16 }}>🤝</div>
          <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 28, fontFamily: 'var(--font-serif)' }}>信任博弈结果</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            {[
              { value: `${result.trustIndex}%`, label: '信任指数', color: 'var(--accent-purple)' },
              { value: `${result.reciprocityIndex}%`, label: '互惠指数', color: 'var(--accent-cyan)' },
              { value: `${result.avgInvestment}`, label: '平均投资额', color: 'var(--accent-gold)' },
              { value: `${result.avgReturn}`, label: '平均返还额', color: 'var(--text-secondary)' },
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
              信任指数越高说明你对他人越信任，愿意承担更多风险来建立合作关系。
              互惠指数反映了你的"以德报德"倾向。
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

  // ── Playing: Invest Phase ──
  if (phase === 'invest') {
    return (
      <div style={pageCenter}>
        <button onClick={() => navigate('/games')} style={homeBtn}><BackIcon /> 返回</button>
        <div style={{ position: 'absolute', top: 16, right: 24, fontSize: 12, color: 'var(--text-tertiary)' }}>
          第 {round + 1}/{TOTAL_ROUNDS} 轮 · 投资者
        </div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ textAlign: 'center', maxWidth: 460, width: '100%' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>💰</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, fontFamily: 'var(--font-serif)' }}>
            你愿意投资多少？
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 32 }}>
            你的投资会被 ×{MULTIPLIER} 后转给伙伴，伙伴可以返还部分给你
          </p>
          <div style={{
            ...glassCard, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
          }}>
            <p style={{ fontSize: 56, fontWeight: 700, color: 'var(--accent-gold)' }}>{investment}</p>
            <input type="range" min="0" max={ENDOWMENT} step="10" value={investment}
              onChange={e => setInvestment(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#FFD700' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 11, color: 'var(--text-tertiary)' }}>
              <span>0</span><span>不投资</span><span style={{ color: 'var(--accent-gold)' }}>→ ×{MULTIPLIER} = {investment * MULTIPLIER}</span><span>{ENDOWMENT}</span>
            </div>
          </div>
          <button onClick={handleInvest} style={{
            marginTop: 28, background: 'linear-gradient(135deg, #7C4DFF, #E040FB)',
            color: '#fff', border: 'none', borderRadius: 16,
            padding: '14px 40px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-sans)', boxShadow: '0 8px 32px rgba(124,77,255,0.25)',
          }}>确认投资</button>
        </motion.div>
      </div>
    );
  }

  // ── Playing: Trustee Phase ──
  const received = AI_INVESTMENTS[trusteeIdx] * MULTIPLIER;
  return (
    <div style={pageCenter}>
      <button onClick={() => navigate('/games')} style={homeBtn}><BackIcon /> 返回</button>
      <div style={{ position: 'absolute', top: 16, right: 24, fontSize: 12, color: 'var(--text-tertiary)' }}>
        第 {round + 1}/{TOTAL_ROUNDS} 轮 · 受托者
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ textAlign: 'center', maxWidth: 460, width: '100%' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🎁</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, fontFamily: 'var(--font-serif)' }}>
          你愿意返还多少？
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 32 }}>
          伙伴投资了 {AI_INVESTMENTS[trusteeIdx]}，经过 ×{MULTIPLIER} 后你收到了 <strong style={{ color: 'var(--accent-cyan)' }}>{received}</strong>
        </p>
        <div style={{
          ...glassCard, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
        }}>
          <p style={{ fontSize: 56, fontWeight: 700, color: 'var(--accent-cyan)' }}>{returnAmount}</p>
          <input type="range" min="0" max={received} step="10" value={returnAmount}
            onChange={e => setReturnAmount(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#64FFDA' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 11, color: 'var(--text-tertiary)' }}>
            <span>0</span><span>自留 {received - returnAmount}</span><span>{received}</span>
          </div>
        </div>
        <button onClick={handleReturn} style={{
          marginTop: 28, background: 'linear-gradient(135deg, #7C4DFF, #E040FB)',
          color: '#fff', border: 'none', borderRadius: 16,
          padding: '14px 40px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'var(--font-sans)', boxShadow: '0 8px 32px rgba(124,77,255,0.25)',
        }}>确认返还</button>
      </motion.div>
    </div>
  );
}
