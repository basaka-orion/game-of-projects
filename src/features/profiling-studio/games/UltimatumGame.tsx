import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from '../lib/motion-lite';
import type { UltimatumResult } from '../types';

const TOTAL_POT = 100;
const TOTAL_ROUNDS = 4;
const AI_OFFERS = [40, 30, 20, 50];

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

interface Props { onComplete: (result: UltimatumResult) => void; }

export default function UltimatumGame({ onComplete }: Props) {
  const navigate = useNavigate();
  const [stage, setStage] = useState<'intro' | 'playing' | 'feedback' | 'result'>('intro');
  const [phase, setPhase] = useState<'propose' | 'respond'>('propose');
  const [round, setRound] = useState(0);
  const [offer, setOffer] = useState(50);
  const [proposals, setProposals] = useState<number[]>([]);
  const [rejections, setRejections] = useState<boolean[]>([]);
  const [feedbackData, setFeedbackData] = useState({ offered: 0, accepted: true });
  const [result, setResult] = useState<UltimatumResult | null>(null);

  const responderIdx = Math.floor(round / 2);

  const handlePropose = () => {
    setProposals(prev => [...prev, offer]);
    const accepted = Math.random() > (offer < 20 ? 0.8 : offer < 30 ? 0.4 : 0.1);
    setFeedbackData({ offered: offer, accepted });
    setStage('feedback');
  };

  const handleRespond = (accept: boolean) => {
    setRejections(prev => [...prev, !accept]);
    setFeedbackData({ offered: AI_OFFERS[responderIdx], accepted: accept });
    setStage('feedback');
  };

  const nextRound = useCallback(() => {
    const nextRd = round + 1;
    if (nextRd >= TOTAL_ROUNDS) {
      const avgOffer = proposals.length > 0 ? proposals.reduce((a, b) => a + b, 0) / proposals.length : 50;
      const rejectionRate = rejections.length > 0 ? rejections.filter(Boolean).length / rejections.length : 0;
      const r: UltimatumResult = {
        avgOffer: Math.round(avgOffer),
        minAcceptable: Math.min(...(rejections.map((rej, i) => !rej ? AI_OFFERS[i] || 20 : 999).filter(v => v < 999)), 50),
        rejectionCount: rejections.filter(Boolean).length,
        rejectionRate: Math.round(rejectionRate * 100),
        fairnessIndex: Math.round(avgOffer / TOTAL_POT * 100),
        punishmentTendency: Math.round(rejectionRate * 100),
        totalRounds: TOTAL_ROUNDS,
      };
      setResult(r); setStage('result'); onComplete(r);
    } else {
      setRound(nextRd);
      setPhase(nextRd % 2 === 0 ? 'propose' : 'respond');
      setOffer(50); setStage('playing');
    }
  }, [round, proposals, rejections, onComplete]);

  useEffect(() => {
    if (stage === 'feedback') {
      const timer = setTimeout(nextRound, 2000);
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
          <div style={{ fontSize: 56, marginBottom: 20 }}>⚖️</div>
          <h1 style={{
            fontSize: 32, fontWeight: 700, marginBottom: 10, fontFamily: 'var(--font-serif)',
            background: 'linear-gradient(135deg, #FFD700, #FFA726)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>最后通牒博弈</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.8 }}>
            你和伙伴轮流分配 <strong style={{ color: 'var(--accent-gold)' }}>{TOTAL_POT} 元</strong>。
            <strong style={{ color: 'var(--accent-cyan)' }}>提议者</strong>提出分配方案，<strong style={{ color: 'var(--accent-red)' }}>回应者</strong>决定接受或拒绝——拒绝则双方都拿不到。
          </p>
          <div style={{ ...glassCard, marginBottom: 28, textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
              <div><div style={{ fontSize: 32, marginBottom: 8 }}>📤</div><p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>提议分配</p></div>
              <span style={{ fontSize: 28, color: 'var(--text-tertiary)' }}>→</span>
              <div><div style={{ fontSize: 32, marginBottom: 8 }}>✅❌</div><p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>接受 / 拒绝</p></div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 28 }}>共 {TOTAL_ROUNDS} 轮 · 约 2 分钟</p>
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
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: feedbackData.accepted ? 'var(--accent-cyan)' : 'var(--accent-red)' }}>
              {feedbackData.accepted ? '✅ 已接受' : '❌ 已拒绝'} · 第 {round + 1} 轮
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {feedbackData.accepted
                ? `提议者获得 ${TOTAL_POT - feedbackData.offered}，回应者获得 ${feedbackData.offered}`
                : '双方都一无所获'}
            </p>
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
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚖️</div>
          <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 28, fontFamily: 'var(--font-serif)' }}>最后通牒结果</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            {[
              { value: `${result.fairnessIndex}%`, label: '公平指数', color: 'var(--accent-gold)' },
              { value: `${result.punishmentTendency}%`, label: '惩罚倾向', color: 'var(--accent-red)' },
              { value: `${result.avgOffer}`, label: '平均出价', color: 'var(--accent-cyan)' },
              { value: `${result.rejectionRate}%`, label: '拒绝率', color: 'var(--text-secondary)' },
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
              公平指数反映了你在分配中的慷慨程度。惩罚倾向越高，说明你越不能容忍不公平——宁可两败俱伤也要惩罚不公。
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

  // ── Playing: Propose ──
  if (phase === 'propose') {
    return (
      <div style={pageCenter}>
        <button onClick={() => navigate('/games')} style={homeBtn}><BackIcon /> 返回</button>
        <div style={{ position: 'absolute', top: 16, right: 24, fontSize: 12, color: 'var(--text-tertiary)' }}>
          第 {round + 1}/{TOTAL_ROUNDS} 轮 · 提议者
        </div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ textAlign: 'center', maxWidth: 460, width: '100%' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📤</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, fontFamily: 'var(--font-serif)' }}>
            你给对方多少？
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 32 }}>
            总共 {TOTAL_POT} 元。对方拒绝的话双方都没有。
          </p>
          <div style={{ ...glassCard, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <div style={{ display: 'flex', gap: 32, alignItems: 'baseline' }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>给对方</p>
                <p style={{ fontSize: 48, fontWeight: 700, color: 'var(--accent-gold)' }}>{offer}</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>你保留</p>
                <p style={{ fontSize: 48, fontWeight: 700, color: 'var(--text-secondary)' }}>{TOTAL_POT - offer}</p>
              </div>
            </div>
            <input type="range" min="0" max={TOTAL_POT} step="5" value={offer}
              onChange={e => setOffer(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#FFD700' }} />
          </div>
          <button onClick={handlePropose} style={{
            marginTop: 28, background: 'linear-gradient(135deg, #7C4DFF, #E040FB)',
            color: '#fff', border: 'none', borderRadius: 16,
            padding: '14px 40px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-sans)', boxShadow: '0 8px 32px rgba(124,77,255,0.25)',
          }}>提出方案</button>
        </motion.div>
      </div>
    );
  }

  // ── Playing: Respond ──
  const aiOffer = AI_OFFERS[responderIdx];
  return (
    <div style={pageCenter}>
      <button onClick={() => navigate('/games')} style={homeBtn}><BackIcon /> 返回</button>
      <div style={{ position: 'absolute', top: 16, right: 24, fontSize: 12, color: 'var(--text-tertiary)' }}>
        第 {round + 1}/{TOTAL_ROUNDS} 轮 · 回应者
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ textAlign: 'center', maxWidth: 460, width: '100%' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🤔</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, fontFamily: 'var(--font-serif)' }}>
          对方提议给你 <span style={{ color: 'var(--accent-gold)' }}>{aiOffer}</span>
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 32 }}>
          对方保留 {TOTAL_POT - aiOffer}。你接受还是拒绝？
        </p>

        <div style={{ ...glassCard, marginBottom: 28, paddingTop: 20, paddingBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>你获得</p>
              <p style={{ fontSize: 36, fontWeight: 700, color: 'var(--accent-gold)' }}>{aiOffer}</p>
            </div>
            <span style={{ fontSize: 18, color: 'var(--text-tertiary)' }}>vs</span>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>对方获得</p>
              <p style={{ fontSize: 36, fontWeight: 700, color: 'var(--text-secondary)' }}>{TOTAL_POT - aiOffer}</p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          <button onClick={() => handleRespond(false)} style={{
            background: 'rgba(255,107,107,0.08)', border: '2px solid rgba(255,107,107,0.2)',
            borderRadius: 16, padding: '16px 36px', fontSize: 16, fontWeight: 600,
            color: 'var(--accent-red)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}>❌ 拒绝</button>
          <button onClick={() => handleRespond(true)} style={{
            background: 'linear-gradient(135deg, #7C4DFF, #E040FB)',
            color: '#fff', border: 'none', borderRadius: 16,
            padding: '16px 36px', fontSize: 16, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-sans)', boxShadow: '0 8px 32px rgba(124,77,255,0.25)',
          }}>✅ 接受</button>
        </div>
      </motion.div>
    </div>
  );
}
