import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from '../lib/motion-lite';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useTrackingStore } from '../store';
import { useAssessmentStore } from '../store';
import { DIMENSIONS } from '../data/dimensions';

const EMOTIONS = [
  { emoji: '😊', label: '愉悦', color: '#64FFDA' },
  { emoji: '😌', label: '平静', color: '#4FC3F7' },
  { emoji: '😤', label: '愤怒', color: '#FF6B6B' },
  { emoji: '😢', label: '悲伤', color: '#BB86FC' },
  { emoji: '😰', label: '焦虑', color: '#FFD700' },
  { emoji: '🤔', label: '困惑', color: '#FF80AB' },
  { emoji: '💪', label: '自信', color: '#64FFDA' },
  { emoji: '😴', label: '疲惫', color: '#4FC3F7' },
];

const GAME_LABELS: Record<string, { icon: string; name: string }> = {
  stroop: { icon: '🎨', name: 'Stroop 色词测验' },
  nback: { icon: '🧠', name: 'N-Back 工作记忆' },
  gonogo: { icon: '🚦', name: 'Go/No-Go 抑制控制' },
  ultimatum: { icon: '⚖️', name: '最后通牒博弈' },
  trust: { icon: '🤝', name: '信任博弈' },
  publicgoods: { icon: '🌍', name: '公共品博弈' },
};

export default function TrackingPage() {
  const { entries, addEntry } = useTrackingStore();
  const { gameResults, catResponses } = useAssessmentStore();
  const [selectedEmotion, setSelectedEmotion] = useState('');
  const [intensity, setIntensity] = useState(5);
  const [trigger, setTrigger] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    if (!selectedEmotion) return;
    addEntry({
      type: 'emotion',
      emotion: selectedEmotion,
      intensity,
      trigger: trigger || undefined,
      notes: notes || undefined,
    });
    setSelectedEmotion('');
    setIntensity(5);
    setTrigger('');
    setNotes('');
  };

  const chartData = entries
    .slice(0, 14)
    .reverse()
    .map((e) => ({
      date: new Date(e.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
      intensity: e.intensity || 5,
    }));

  const cardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: '24px',
    marginBottom: 20,
  };

  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px 80px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <Link
            to="/"
            style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, padding: '8px 16px', fontSize: 13,
              color: 'var(--text-tertiary)', textDecoration: 'none',
            }}
          >
            ← 返回
          </Link>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>追踪中心</h1>
          <div />
        </div>

        {/* Emotion Log */}
        <div style={cardStyle}>
          <h3 style={{ fontWeight: 700, marginBottom: 20, fontSize: 16 }}>记录此刻的感受</h3>

          {/* Emotion picker */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
            {EMOTIONS.map((emo) => (
              <button
                key={emo.label}
                style={{
                  background: selectedEmotion === emo.label ? `${emo.color}12` : 'rgba(255,255,255,0.02)',
                  border: `1.5px solid ${selectedEmotion === emo.label ? emo.color : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 14, padding: '12px 8px', cursor: 'pointer',
                  textAlign: 'center', transition: 'all 0.2s',
                }}
                onClick={() => setSelectedEmotion(emo.label)}
              >
                <div style={{ fontSize: 24, marginBottom: 4 }}>{emo.emoji}</div>
                <div style={{ fontSize: 12, color: selectedEmotion === emo.label ? emo.color : 'var(--text-secondary)' }}>
                  {emo.label}
                </div>
              </button>
            ))}
          </div>

          {/* Intensity slider */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>
              <span>强度</span>
              <span>{intensity}/10</span>
            </div>
            <input
              type="range" min="1" max="10" value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
            />
          </div>

          {/* Trigger */}
          <input
            style={{
              width: '100%', background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12,
              padding: '12px 16px', fontSize: 14, color: 'var(--text-primary)',
              outline: 'none', marginBottom: 12, boxSizing: 'border-box',
            }}
            placeholder="触发因素（可选）"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
          />

          {/* Notes */}
          <textarea
            style={{
              width: '100%', background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12,
              padding: '12px 16px', fontSize: 14, color: 'var(--text-primary)',
              outline: 'none', minHeight: 80, resize: 'none', marginBottom: 16,
              fontFamily: 'inherit', boxSizing: 'border-box',
            }}
            placeholder="想说的话…（可选）"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <button
            onClick={handleSubmit}
            disabled={!selectedEmotion}
            style={{
              width: '100%', padding: '14px 0',
              background: selectedEmotion
                ? 'linear-gradient(135deg, #64FFDA, #00BFA5)'
                : 'rgba(255,255,255,0.04)',
              color: selectedEmotion ? '#0a0a1a' : 'var(--text-tertiary)',
              border: 'none', borderRadius: 14, fontSize: 15,
              fontWeight: 700, cursor: selectedEmotion ? 'pointer' : 'default',
            }}
          >
            记录感受
          </button>
        </div>

        {/* Trend Chart */}
        {entries.length >= 2 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={cardStyle}>
            <h3 style={{ fontWeight: 700, marginBottom: 16, fontSize: 16 }}>情绪趋势</h3>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} />
                <YAxis domain={[0, 10]} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} />
                <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text-primary)' }} />
                <Line type="monotone" dataKey="intensity" stroke="#64FFDA" strokeWidth={2} dot={{ fill: '#64FFDA', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        )}

        {/* Behavioral Snapshot */}
        {gameResults.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={cardStyle}>
            <h3 style={{ fontWeight: 700, marginBottom: 16, fontSize: 16, color: 'var(--accent-purple)' }}>🔬 行为实验记录</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {gameResults.map((gr) => {
                const info = GAME_LABELS[gr.gameType] || { icon: '🔬', name: gr.gameType };
                return (
                  <div key={gr.gameType} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px', borderRadius: 12,
                    background: 'rgba(255,255,255,0.02)',
                  }}>
                    <span style={{ fontSize: 20 }}>{info.icon}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 14, fontWeight: 600 }}>{info.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {new Date(gr.completedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <span style={{
                      fontSize: 11, padding: '4px 10px', borderRadius: 20,
                      background: 'rgba(100,255,218,0.1)', color: 'var(--accent-cyan)',
                    }}>已完成</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* CAT */}
        {Object.keys(catResponses).length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={cardStyle}>
            <h3 style={{ fontWeight: 700, marginBottom: 16, fontSize: 16, color: '#FF80AB' }}>🎯 CAT 精度评估</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(catResponses).map(([dimId, responses]) => {
                const dim = DIMENSIONS.find(d => d.id === dimId);
                const lastResponse = Array.isArray(responses) && responses.length > 0 ? responses[responses.length - 1] : null;
                return (
                  <div key={dimId} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px', borderRadius: 12,
                    background: 'rgba(255,255,255,0.02)',
                  }}>
                    <span style={{ fontSize: 20 }}>{dim?.icon || '📊'}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 14, fontWeight: 600 }}>{dim?.name || dimId}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>IRT 自适应评估 · {Array.isArray(responses) ? responses.length : 0} 题</p>
                    </div>
                    <span style={{ fontSize: 16, fontWeight: 800, color: dim?.color || '#FF80AB' }}>
                      {lastResponse && typeof lastResponse === 'object' && 'se' in lastResponse
                        ? `SE ${(lastResponse as { se: number }).se.toFixed(2)}`
                        : '✓'}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Emotion History */}
        <div>
          <h3 style={{ fontWeight: 700, marginBottom: 16, fontSize: 16 }}>情绪记录</h3>
          {entries.length === 0 ? (
            <p style={{ fontSize: 14, textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)' }}>
              开始记录你的第一条情绪日记吧
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {entries.slice(0, 20).map((entry) => {
                const emo = EMOTIONS.find((e) => e.label === entry.emotion);
                return (
                  <div key={entry.id} style={{
                    ...cardStyle, marginBottom: 0,
                    display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16,
                  }}>
                    <span style={{ fontSize: 24 }}>{emo?.emoji || '◻️'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{entry.emotion}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>强度 {entry.intensity}/10</span>
                      </div>
                      {entry.trigger && (
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>触发：{entry.trigger}</p>
                      )}
                      {entry.notes && (
                        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>{entry.notes}</p>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                      {new Date(entry.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
