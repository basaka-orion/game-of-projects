/**
 * 彩蛋揭示组件 — "你是谁？"
 *
 * 四路径全部完成后解锁。
 * 点击后：彩蛋旋转 → 对话框展开 → 大师分析逐字流出
 */

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from '../lib/motion-lite';
import { useAssessmentStore } from '../store';
import { streamEasterEggAnalysis } from '../api/easter-egg';
import { getProfilingLLMConfig } from '../api/profiling-llm';

/* ── Keyframe CSS (injected once) ── */
const STYLE_ID = 'easter-egg-keyframes';
function injectKeyframes() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes egg-float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-8px); }
    }
    @keyframes egg-glow-pulse {
      0%, 100% { box-shadow: 0 0 30px rgba(255,215,0,0.15), 0 0 60px rgba(187,134,252,0.08); }
      50% { box-shadow: 0 0 50px rgba(255,215,0,0.3), 0 0 90px rgba(187,134,252,0.15); }
    }
    @keyframes egg-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes particles {
      0% { opacity: 1; transform: scale(0) translateY(0); }
      50% { opacity: 0.8; }
      100% { opacity: 0; transform: scale(1.5) translateY(-60px); }
    }
  `;
  document.head.appendChild(style);
}

/* ── Main component ── */
type RevealFailure = {
  title: string;
  summary: string;
  detail: string;
  action: string;
};

function normalizeRevealFailure(raw: string): RevealFailure {
  const message = raw.replace(/^Error:\s*/i, '').trim();

  if (message.includes('余额不足') || message.toLowerCase().includes('balance')) {
    return {
      title: '召唤被中断',
      summary: '本次不是“大师没有洞见”，而是画像工坊调用的大模型账户余额不足。',
      detail: '彩蛋分析没有真正开始生成，当前看到的是底层计费失败，而不是人格判断或内容解析出错。',
      action: '请先为画像工坊当前绑定的模型账户充值，再重新召唤大师。',
    };
  }

  if (message.includes('API Key 无效') || message.toLowerCase().includes('api key')) {
    return {
      title: '召唤被拒绝',
      summary: '画像工坊当前绑定的 API Key 无效、过期，或和目标模型不匹配。',
      detail: '这意味着彩蛋请求在进入生成前就被服务端拦下了，并不是测评数据本身有问题。',
      action: '请检查画像工坊专用模型配置中的 Key、Base URL 和模型名称。',
    };
  }

  if (message.includes('频率') || message.includes('429') || message.toLowerCase().includes('rate')) {
    return {
      title: '召唤过于频繁',
      summary: '当前模型服务触发了限流，本次彩蛋请求被临时拒绝。',
      detail: '这通常不是永久故障，更多是短时间请求过多或平台当前负载较高。',
      action: '稍等一会儿再重试，或更换更稳定的模型通道。',
    };
  }

  if (message.includes('超时') || message.toLowerCase().includes('timeout')) {
    return {
      title: '召唤超时',
      summary: '请求已经发出，但在限定时间内没有收到足够响应。',
      detail: '这通常与网络状态、模型服务延迟或当前生成负载过高有关。',
      action: '检查网络后重新尝试，必要时切换更快的模型通道。',
    };
  }

  if (message.includes('网络') || message.includes('fetch') || message.toLowerCase().includes('network')) {
    return {
      title: '召唤链路断开',
      summary: '当前是网络或网关链路问题，不是画像内容本身的问题。',
      detail: '请求没有稳定到达模型服务，或服务响应没有正常回传到前端。',
      action: '先确认网络和 API 地址，再重新尝试召唤。',
    };
  }

  return {
    title: '召唤失败',
    summary: '彩蛋分析未能正常完成，但这更像底层服务故障，而不是你的数据异常。',
    detail: message || '未知错误',
    action: '可以稍后再试，或先检查画像工坊当前绑定的模型配置。',
  };
}

export default function EasterEggReveal() {
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'streaming' | 'done'>('idle');
  const [text, setText] = useState('');
  const [error, setError] = useState<RevealFailure | null>(null);
  const textRef = useRef<HTMLDivElement>(null);

  const store = useAssessmentStore();
  const profilingConfig = getProfilingLLMConfig();

  injectKeyframes();

  const handleClick = useCallback(async () => {
    if (phase !== 'idle' && phase !== 'done') return;
    setPhase('spinning');
    setText('');
    setError(null);

    // Spin for 2 seconds before starting stream
    await new Promise(r => setTimeout(r, 2000));
    setPhase('streaming');

    try {
      const gen = streamEasterEggAnalysis({
        topology: store.topology,
        answers: store.answers,
        avgChoices: store.avgChoices,
        avgProfile: store.avgProfile,
        completedDimensions: store.completedDimensions,
        gameResults: store.gameResults,
        catResponses: store.catResponses,
      });

      let accumulated = '';
      for await (const chunk of gen) {
        accumulated += chunk;
        setText(accumulated);
        // Auto-scroll
        if (textRef.current) {
          textRef.current.scrollTop = textRef.current.scrollHeight;
        }
      }
      setPhase('done');
    } catch (err) {
      setError(normalizeRevealFailure(err instanceof Error ? err.message : '生成失败'));
      setPhase('done');
    }
  }, [phase, store]);

  const title = error
    ? error.title
    : phase === 'idle'
      ? '终极彩蛋已解锁'
      : phase === 'spinning'
        ? '正在召唤大师...'
        : '大师的洞见';

  const subtitle = error
    ? `${profilingConfig.provider} · ${profilingConfig.model}`
    : phase === 'idle'
      ? '四条路径已全部完成。点击彩蛋，一位大师将为你揭示——你是谁？'
      : phase === 'spinning'
        ? '穿越时空的连接正在建立...'
        : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.3 }}
      style={{
        maxWidth: '760px',
        margin: '0 auto 3rem',
        padding: '0 1.5rem',
      }}
    >
      <div
        style={{
          position: 'relative',
          borderRadius: 24,
          overflow: 'hidden',
          background: 'linear-gradient(170deg, rgba(20,16,36,0.95) 0%, rgba(10,14,26,0.98) 100%)',
          border: '1px solid rgba(255,215,0,0.12)',
        }}
      >
        {/* ── Background particles ── */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden',
        }}>
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                width: 4, height: 4, borderRadius: '50%',
                background: i % 2 === 0 ? 'rgba(255,215,0,0.4)' : 'rgba(187,134,252,0.4)',
                left: `${15 + i * 14}%`, top: `${20 + (i % 3) * 25}%`,
                animation: `particles ${2 + i * 0.5}s ease-in-out infinite`,
                animationDelay: `${i * 0.4}s`,
              }}
            />
          ))}
        </div>

        {/* ── Egg area ── */}
        <div
          onClick={handleClick}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '48px 32px 32px',
            cursor: phase === 'idle' || phase === 'done' ? 'pointer' : 'default',
            position: 'relative', zIndex: 1,
          }}
        >
          {/* The Egg */}
          <div
            style={{
              width: 100, height: 120,
              position: 'relative',
              animation: phase === 'spinning'
                ? 'egg-spin 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite'
                : phase === 'idle'
                  ? 'egg-float 3s ease-in-out infinite'
                  : 'none',
              transition: 'all 0.5s ease',
            }}
          >
            {/* Egg shape */}
            <div
              style={{
                width: '100%', height: '100%',
                borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
                background: phase === 'streaming' || phase === 'done'
                  ? 'linear-gradient(135deg, #FFD700 0%, #FFA000 30%, #FF6F00 60%, #FFD700 100%)'
                  : 'linear-gradient(135deg, rgba(255,215,0,0.15) 0%, rgba(187,134,252,0.1) 50%, rgba(100,255,218,0.08) 100%)',
                border: phase === 'streaming' || phase === 'done'
                  ? '2px solid rgba(255,215,0,0.6)'
                  : '1px solid rgba(255,215,0,0.2)',
                animation: 'egg-glow-pulse 2s ease-in-out infinite',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative', overflow: 'hidden',
                transition: 'all 0.8s ease',
              }}
            >
              {/* Inner shimmer */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 3s linear infinite',
              }} />

              {/* Center symbol */}
              <span style={{
                fontSize: phase === 'streaming' || phase === 'done' ? 36 : 32,
                filter: phase === 'idle' ? 'grayscale(0.3)' : 'none',
                transition: 'all 0.5s ease',
                position: 'relative', zIndex: 1,
              }}>
                {phase === 'spinning' ? '✦' : phase === 'streaming' || phase === 'done' ? '🔮' : '🥚'}
              </span>
            </div>
          </div>

          {/* Title */}
          <motion.h3
            style={{
              marginTop: 24, fontSize: '1.2rem', fontWeight: 700,
              fontFamily: 'var(--font-display)',
              background: 'linear-gradient(135deg, #FFD700, #FFA000)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              letterSpacing: '0.05em',
            }}
          >
            {title}
          </motion.h3>

          <p style={{
            color: 'var(--text-tertiary)', fontSize: '0.8rem', marginTop: 8,
            textAlign: 'center', lineHeight: 1.6,
          }}>
            {subtitle}
          </p>
        </div>

        {/* ── Expanding dialogue area ── */}
        <AnimatePresence>
          {(phase === 'streaming' || phase === 'done' || error) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{
                borderTop: '1px solid rgba(255,215,0,0.1)',
                margin: '0 24px',
              }} />

              <div
                ref={textRef}
                style={{
                  padding: '28px 32px 36px',
                  maxHeight: '55vh',
                  overflowY: 'auto',
                  scrollBehavior: 'smooth',
                }}
              >
                {error ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                      padding: '18px 20px',
                      borderRadius: 18,
                      border: '1px solid rgba(255,107,107,0.22)',
                      background: 'linear-gradient(180deg, rgba(255,107,107,0.08), rgba(255,255,255,0.02))',
                    }}
                  >
                    <div style={{ color: '#FFB4B4', fontSize: '1rem', fontWeight: 700 }}>
                      ⚠ {error.summary}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.8 }}>
                      {error.detail}
                    </div>
                    <div style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', lineHeight: 1.7 }}>
                      当前通道：{profilingConfig.provider} · {profilingConfig.model}
                    </div>
                    <div style={{ color: '#FFD38A', fontSize: '0.82rem', lineHeight: 1.8 }}>
                      建议动作：{error.action}
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={handleClick}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 12,
                          border: '1px solid rgba(255,215,0,0.24)',
                          background: 'rgba(255,215,0,0.12)',
                          color: '#FFE8A3',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        重新召唤
                      </button>
                      <button
                        type="button"
                        onClick={() => { window.location.hash = '#/settings'; }}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 12,
                          border: '1px solid rgba(255,255,255,0.12)',
                          background: 'rgba(255,255,255,0.04)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                        }}
                      >
                        检查模型设置
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    color: 'var(--text-secondary)',
                    fontSize: '0.92rem',
                    lineHeight: 2,
                    letterSpacing: '0.02em',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'var(--font-sans)',
                  }}>
                    {text}
                    {phase === 'streaming' && (
                      <motion.span
                        animate={{ opacity: [1, 0] }}
                        transition={{ repeat: Infinity, duration: 0.8 }}
                        style={{
                          display: 'inline-block',
                          width: 2, height: '1em',
                          background: 'var(--accent-gold)',
                          marginLeft: 2,
                          verticalAlign: 'text-bottom',
                        }}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Done footer */}
              {phase === 'done' && !error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  style={{
                    padding: '16px 32px 24px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <span style={{
                    fontSize: '0.7rem', color: 'var(--text-tertiary)',
                    fontStyle: 'italic',
                  }}>
                    — 来自跨越时空的对话
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClick();
                    }}
                    style={{
                      background: 'rgba(255,215,0,0.08)',
                      border: '1px solid rgba(255,215,0,0.15)',
                      color: 'var(--accent-gold)',
                      padding: '8px 20px',
                      borderRadius: 12,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(255,215,0,0.15)';
                      e.currentTarget.style.borderColor = 'rgba(255,215,0,0.3)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(255,215,0,0.08)';
                      e.currentTarget.style.borderColor = 'rgba(255,215,0,0.15)';
                    }}
                  >
                    再次召唤 ✦
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
