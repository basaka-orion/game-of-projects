import { Link } from 'react-router-dom';
import { motion } from '../lib/motion-lite';
import { useAssessmentStore } from '../store';
import { SAGE_DEFINITIONS } from '../data/sages';
import DailyMicroSampleCard from '../components/DailyMicroSampleCard';
import EasterEggReveal from '../components/EasterEggReveal';



const PATH_IMAGES: Record<string, string> = {
  avg: '/images/path-immersive.png',
  assessment: '/images/path-assessment.png',
  games: '/images/path-games.png',
  cat: '/images/path-ai.png',
};

/* ── Animation Variants ── */
const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6 },
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.1 } },
};

const staggerItem = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

/* ── Card Background Image Component ── */
function CardImage({ src, opacity = 0.12 }: { src: string; opacity?: number }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, overflow: 'hidden',
      borderRadius: 'inherit', pointerEvents: 'none',
    }}>
      <img
        src={src} alt="" loading="lazy"
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          opacity, filter: 'blur(1px) saturate(1.3)',
          mixBlendMode: 'screen',
        }}
      />
      {/* Gradient overlay for text readability */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(135deg, rgba(10,14,26,0.85) 0%, rgba(10,14,26,0.6) 50%, rgba(10,14,26,0.8) 100%)',
      }} />
    </div>
  );
}

/* ── Unlocked Features Section ── */
function UnlockedFeaturesSection() {
  const sageSessions = useAssessmentStore(s => s.sageSessions);
  const sageCompletedCount = Object.values(sageSessions).filter(s => s?.status === 'completed').length;

  const features = [
    {
      to: '/report',
      icon: '📊',
      title: '拓扑画像报告',
      desc: '跨维度融合分析，生成你独一无二的心理拓扑图——维度交互、化学反应、自我原型，一目了然。',
      color: '#64FFDA',
      gradient: 'linear-gradient(135deg, rgba(100,255,218,0.06), rgba(100,255,218,0.02))',
      borderColor: 'rgba(100,255,218,0.12)',
    },
    {
      to: '/dialogue',
      icon: '🏛️',
      title: '智者对话',
      desc: '7 位智者从认知、价值、情绪、关系、创作、行动、产品设计等维度，与你展开深度苏格拉底式对话。',
      color: '#BB86FC',
      gradient: 'linear-gradient(135deg, rgba(187,134,252,0.06), rgba(187,134,252,0.02))',
      borderColor: 'rgba(187,134,252,0.12)',
      extra: (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12,
        }}>
          {SAGE_DEFINITIONS.map(sage => {
            const session = sageSessions[sage.id];
            const done = session?.status === 'completed';
            const active = session?.status === 'active';
            return (
              <div key={sage.id} style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '3px 8px', borderRadius: 10,
                background: done ? `${sage.color}12` : active ? `${sage.color}08` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${done ? `${sage.color}25` : 'rgba(255,255,255,0.05)'}`,
                fontSize: 11,
              }}>
                <span>{sage.icon}</span>
                <span style={{ color: done ? sage.color : active ? sage.color : 'var(--text-tertiary)', fontWeight: done ? 600 : 400 }}>
                  {sage.name}{done && ' ✓'}
                </span>
              </div>
            );
          })}
        </div>
      ),
      badge: sageCompletedCount > 0 ? `${sageCompletedCount}/7` : undefined,
    },
    {
      to: '/forge',
      icon: '🔮',
      title: '锻造炉',
      desc: '将你的拓扑画像与现实需求碰撞，生成一份只属于你的行动蓝图——从个人定位到职业策略。',
      color: '#FFD740',
      gradient: 'linear-gradient(135deg, rgba(255,215,64,0.06), rgba(255,215,64,0.02))',
      borderColor: 'rgba(255,215,64,0.12)',
    },
  ];

  return (
    <section style={{ maxWidth: '1120px', margin: '0 auto', padding: '0 1.5rem 3rem' }}>
      {/* Section header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }} transition={{ duration: 0.6 }}
        style={{ textAlign: 'center', marginBottom: '2.5rem' }}
      >
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 22px', borderRadius: 999,
          background: 'linear-gradient(135deg, rgba(187,134,252,0.08), rgba(100,255,218,0.06))',
          border: '1px solid rgba(187,134,252,0.15)',
          marginBottom: '1.5rem',
        }}>
          <span style={{ fontSize: 14 }}>✦</span>
          <span style={{
            fontSize: '0.78rem', fontWeight: 500, letterSpacing: '0.06em',
            background: 'linear-gradient(135deg, #BB86FC, #64FFDA)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            测评完成 · 深度探索已解锁
          </span>
        </div>
        <h2 style={{
          fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 700, marginBottom: '0.6rem',
          fontFamily: 'var(--font-display)', letterSpacing: '-0.01em',
        }}>
          从了解自己到创造自己
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 300, maxWidth: 500, margin: '0 auto' }}>
          画像只是起点——智者对话、锻造炉帮你将洞察转化为行动
        </p>
      </motion.div>

      {/* Feature cards */}
      <motion.div
        variants={staggerContainer} initial="initial" whileInView="animate" viewport={{ once: true }}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}
      >
        {features.map((f) => (
          <motion.div key={f.to} variants={staggerItem}>
            <Link to={f.to} style={{ textDecoration: 'none', color: 'inherit', display: 'block', height: '100%' }}>
              <motion.div
                whileHover={{ y: -6, transition: { duration: 0.3 } }}
                style={{
                  padding: '30px 26px', height: '100%', borderRadius: 22,
                  background: f.gradient,
                  border: `1px solid ${f.borderColor}`,
                  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                  cursor: 'pointer', position: 'relative', overflow: 'hidden',
                }}
              >
                {/* Top glow line */}
                <div style={{
                  position: 'absolute', top: 0, left: '10%', right: '10%', height: 2,
                  background: `linear-gradient(90deg, transparent, ${f.color}, transparent)`,
                  opacity: 0.5,
                }} />

                {/* Badge */}
                {f.badge && (
                  <div style={{
                    position: 'absolute', top: 16, right: 16,
                    padding: '3px 10px', borderRadius: 12,
                    background: `${f.color}15`, border: `1px solid ${f.color}25`,
                    fontSize: '0.7rem', fontWeight: 600, color: f.color,
                  }}>
                    {f.badge}
                  </div>
                )}

                <div style={{
                  width: 48, height: 48, borderRadius: 14,
                  background: `${f.color}0D`, border: `1px solid ${f.color}18`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '16px', fontSize: 24,
                  boxShadow: `0 0 20px ${f.color}10`,
                }}>
                  {f.icon}
                </div>

                <h3 style={{
                  fontSize: '1.1rem', fontWeight: 700, marginBottom: '8px',
                  fontFamily: 'var(--font-display)', color: f.color,
                }}>
                  {f.title}
                </h3>
                <p style={{
                  color: 'var(--text-secondary)', fontSize: '0.82rem',
                  lineHeight: 1.7, marginBottom: 0,
                }}>
                  {f.desc}
                </p>

                {/* Extra content (e.g., sage icons) */}
                {f.extra}

                {/* Arrow hint */}
                <div style={{
                  marginTop: 16, fontSize: '0.78rem', fontWeight: 500,
                  color: f.color, opacity: 0.7,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  进入探索 <span style={{ transition: 'transform 0.3s' }}>→</span>
                </div>
              </motion.div>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

export default function HomePage() {
  const completedDimensions = useAssessmentStore((s) => s.completedDimensions);
  const avgCompleted = useAssessmentStore((s) => s.avgCompleted);
  const gameResults = useAssessmentStore((s) => s.gameResults);
  const catResponses = useAssessmentStore((s) => s.catResponses);

  const paths = [
    {
      to: '/avg/intro', key: 'avg', title: '城市漫游者', sub: '沉浸式互动叙事 · 约 10 分钟',
      desc: '在一个周六的生活情境中做出真实的行为选择，绕开社会赞许性偏差。',
      badges: ['SJT', 'IPIP-NEO', 'PVQ-RR'],
      done: avgCompleted, color: '#E040FB',
    },
    {
      to: '/assessment', key: 'assessment', title: '维度深潜', sub: '先做人类数值地图 v1，再进入定制题路',
      desc: '入口不再默认统一题库，而是先选择详细版本 / 精简版本 / 统一问题版本，然后系统再按你的阶段和问题生成更贴身的题目顺序。',
      badges: [`${completedDimensions.length}/8 已完成`, 'WLEIS', 'ECR-R'],
      done: completedDimensions.length >= 8, color: '#FFD700',
    },
    {
      to: '/games', key: 'games', title: '行为实验室', sub: '6 款认知 + 博弈游戏 · 各 1-2 分钟',
      desc: 'Stroop、N-back、Go/No-Go + 最后通牒、信任、公共品博弈。',
      badges: [`${gameResults.length}/6 已完成`, 'Stroop', 'Game Theory'],
      done: gameResults.length >= 6, color: '#BB86FC',
    },
    {
      to: '/cat/full', key: 'cat', title: 'CAT 自适应', sub: '智能测评 · 8-20 题 · 约 3 分钟',
      desc: '基于 IRT 项目反应理论，系统根据回答实时调整难度，精确定位能力。',
      badges: [`${Object.keys(catResponses).length}/8 维度`, 'IRT/GRM', 'EAP'],
      done: Object.keys(catResponses).length > 0, color: '#FF80AB',
    },
  ];

  const allPathsCompleted = avgCompleted && completedDimensions.length >= 8 && gameResults.length >= 6 && Object.keys(catResponses).length > 0;
  const hasProgress = completedDimensions.length > 0 || avgCompleted || gameResults.length > 0 || Object.keys(catResponses).length > 0;
  const nextStep = (() => {
    if (completedDimensions.length < 8) {
      return {
        to: '/assessment',
        label: hasProgress ? '继续维度深潜' : '立即开始完整测试',
        hint: hasProgress ? `八维量表已完成 ${completedDimensions.length}/8` : '先从八维专业量表开始，最直接也最稳定',
      };
    }

    if (!avgCompleted) {
      return {
        to: '/avg/intro',
        label: '进入城市漫游者',
        hint: '用沉浸式情境补齐行为与价值侧的真实信号',
      };
    }

    if (gameResults.length < 6) {
      return {
        to: '/games',
        label: '进入行为实验室',
        hint: `还差 ${6 - gameResults.length} 个认知/博弈实验`,
      };
    }

    if (Object.keys(catResponses).length === 0) {
      return {
        to: '/cat/full',
        label: '开启 CAT 自适应',
        hint: '3 分钟内完成更精细的能力定位',
      };
    }

    return {
      to: '/report',
      label: '查看画像结果',
      hint: '四条主路径已具备，直接生成并接入系统',
    };
  })();

  return (
    <div style={{ minHeight: '100vh', fontFamily: 'var(--font-sans)' }}>
      {/* ═══ Hero ═══ */}
      <section style={{
        minHeight: 'calc(100svh - 64px)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: '2rem 1.5rem 5.5rem', position: 'relative', overflow: 'hidden',
      }}>
        {/* Hero background image */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
        }}>
          <img
            src="/images/hero-banner.png" alt=""
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              opacity: 0.15, filter: 'blur(2px) saturate(1.2)',
            }}
          />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse at center, rgba(10,14,26,0.4) 0%, rgba(10,14,26,0.95) 70%)',
          }} />
        </div>

        {/* Decorative orbs */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
          <div style={{
            position: 'absolute', top: '15%', left: '15%', width: '380px', height: '380px',
            background: 'var(--accent-cyan)', borderRadius: '50%', opacity: 0.04, filter: 'blur(120px)',
          }} />
          <div style={{
            position: 'absolute', bottom: '25%', right: '15%', width: '320px', height: '320px',
            background: 'var(--accent-purple)', borderRadius: '50%', opacity: 0.05, filter: 'blur(100px)',
          }} />
        </div>

        <motion.div {...fadeUp} style={{ position: 'relative', zIndex: 1, maxWidth: '920px', width: '100%' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '8px 20px', borderRadius: '999px', fontSize: '0.78rem',
            background: 'rgba(100, 255, 218, 0.06)', border: '1px solid rgba(100, 255, 218, 0.12)',
            color: 'var(--accent-cyan)', marginBottom: '1.6rem',
            letterSpacing: '0.06em', fontWeight: 500,
          }}>
            ✦ 8 维 × 35+ 专业量表 × AI 深度解读
          </div>

          <h1 style={{
            fontSize: 'clamp(2.6rem, 5.5vw, 4.2rem)',
            fontWeight: 700, lineHeight: 1.08, marginBottom: '1.25rem',
            fontFamily: 'var(--font-display)',
            letterSpacing: '-0.02em',
          }}>
            <span style={{
              background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>全方位</span>
            <br />
            <span style={{ color: 'var(--text-primary)' }}>了解自己</span>
          </h1>

          <p style={{
            fontSize: 'clamp(0.9rem, 2vw, 1.08rem)', lineHeight: 1.8,
            color: 'var(--text-secondary)', maxWidth: '620px', margin: '0 auto 1.4rem',
            fontWeight: 300,
          }}>
            基于 CHC 智力理论、Big Five 人格模型、Schwartz 价值环、VIA 品格优势、依恋理论等心理学前沿框架，构建你独一无二的八维心理画像。
          </p>

          <p style={{
            fontSize: '0.82rem',
            color: 'var(--text-tertiary)',
            margin: '0 auto 1.4rem',
            letterSpacing: '0.03em',
          }}>
            {nextStep.hint}
          </p>

          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '12px',
            marginBottom: '1.3rem',
          }}>
            <Link
              to={nextStep.to}
              style={{
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                minWidth: 220,
                padding: '15px 22px',
                borderRadius: 999,
                color: '#041315',
                background: 'linear-gradient(135deg, rgba(100,255,218,0.95), rgba(137,247,254,0.88))',
                border: '1px solid rgba(255,255,255,0.16)',
                boxShadow: '0 18px 48px rgba(100,255,218,0.18)',
                fontSize: '0.95rem',
                fontWeight: 700,
                letterSpacing: '0.01em',
              }}
            >
              {nextStep.label} <span aria-hidden="true">→</span>
            </Link>

            <button
              type="button"
              onClick={() => {
                document.getElementById('profiling-path-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                minWidth: 220,
                padding: '15px 22px',
                borderRadius: 999,
                color: 'var(--text-primary)',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.12)',
                backdropFilter: 'blur(14px)',
                cursor: 'pointer',
                fontSize: '0.95rem',
                fontWeight: 600,
              }}
            >
              查看全部测试模块 <span aria-hidden="true">↓</span>
            </button>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))',
            gap: '12px',
            width: '100%',
            maxWidth: '880px',
            margin: '0 auto',
          }}>
            {paths.map((p) => (
              <Link
                key={`hero-${p.key}`}
                to={p.to}
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'block',
                }}
              >
                <div style={{
                  padding: '15px 16px',
                  borderRadius: 18,
                  textAlign: 'left',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
                  border: `1px solid ${p.done ? `${p.color}38` : 'rgba(255,255,255,0.09)'}`,
                  boxShadow: p.done ? `0 10px 28px ${p.color}10` : 'none',
                  backdropFilter: 'blur(12px)',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    marginBottom: 6,
                  }}>
                    <span style={{
                      fontSize: '0.86rem',
                      fontWeight: 700,
                      color: p.done ? p.color : 'var(--text-primary)',
                    }}>
                      {p.title}
                    </span>
                    <span style={{
                      fontSize: '0.68rem',
                      color: p.done ? p.color : 'var(--text-tertiary)',
                    }}>
                      {p.done ? '已完成' : '进入'}
                    </span>
                  </div>
                  <p style={{
                    margin: 0,
                    fontSize: '0.72rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.55,
                  }}>
                    {p.sub}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* Scroll hint */}
        <motion.div
          style={{ position: 'absolute', bottom: '28px', color: 'var(--text-tertiary)', zIndex: 1 }}
          initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ delay: 2 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', fontSize: '0.72rem', letterSpacing: '3px' }}>
            <span>首屏可直接开始</span>
            <motion.span animate={{ y: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>↓</motion.span>
          </div>
        </motion.div>
      </section>

      {/* ═══ Four Paths ═══ */}
      <section id="profiling-path-grid" style={{ maxWidth: '1120px', margin: '0 auto', padding: '3rem 1.5rem 4rem' }}>
        <motion.div {...fadeUp} style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
          <h2 style={{
            fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 700, marginBottom: '0.8rem',
            fontFamily: 'var(--font-display)', letterSpacing: '-0.01em',
          }}>四种探索路径</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 300 }}>选择你偏好的测评方式</p>
        </motion.div>

        <motion.div
          variants={staggerContainer} initial="initial" whileInView="animate" viewport={{ once: true }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '22px' }}
        >
          {paths.map((p) => (
            <motion.div key={p.to} variants={staggerItem}>
              <Link to={p.to} style={{ textDecoration: 'none', color: 'inherit', display: 'block', height: '100%' }}>
                <motion.div
                  className="glass-card"
                  whileHover={{ y: -6, transition: { duration: 0.3 } }}
                  style={{
                    padding: '32px 26px', height: '100%',
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    borderColor: p.done ? `${p.color}35` : undefined,
                    position: 'relative', overflow: 'hidden',
                    cursor: 'pointer',
                  }}
                >
                  {/* Real generated background image */}
                  <CardImage src={PATH_IMAGES[p.key]} opacity={0.14} />

                  {/* Top glow line */}
                  <div style={{
                    position: 'absolute', top: 0, left: '10%', right: '10%', height: 2,
                    background: `linear-gradient(90deg, transparent, ${p.color}, transparent)`,
                    opacity: p.done ? 0.7 : 0.3,
                  }} />

                  {/* Completion badge */}
                  {p.done && (
                    <div style={{
                      position: 'absolute', top: 16, right: 16, zIndex: 2,
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 14px', borderRadius: 20,
                      background: `${p.color}15`,
                      border: `1px solid ${p.color}30`,
                      fontSize: '0.72rem', fontWeight: 600, color: p.color,
                    }}>
                      ✅ 已完成
                    </div>
                  )}

                  <div style={{ position: 'relative', zIndex: 1 }}>
                    {/* Icon + title */}
                    <div style={{
                      width: 52, height: 52, borderRadius: 16,
                      background: `${p.color}0D`, border: `1px solid ${p.color}18`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginBottom: '18px',
                      boxShadow: `0 0 24px ${p.color}10`,
                    }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={p.color} strokeWidth="1.5" strokeLinecap="round">
                        {p.key === 'avg' && <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>}
                        {p.key === 'assessment' && <><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></>}
                        {p.key === 'games' && <><circle cx="12" cy="12" r="3"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/></>}
                        {p.key === 'cat' && <><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></>}
                      </svg>
                    </div>

                    <h3 style={{
                      fontSize: '1.1rem', fontWeight: 700, marginBottom: '6px',
                      fontFamily: 'var(--font-display)',
                    }}>
                      {p.title}
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', marginBottom: '12px', fontWeight: 400 }}>{p.sub}</p>
                    <p style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', lineHeight: 1.7, marginBottom: '16px' }}>{p.desc}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {p.badges.map((b) => (
                        <span key={b} className="badge" style={{ fontSize: '0.64rem' }}>{b}</span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ═══ Daily Micro Sample ═══ */}
      <DailyMicroSampleCard />

      {/* ═══ Easter Egg — unlocked when all 4 paths completed ═══ */}
      {allPathsCompleted && <EasterEggReveal />}

      {/* ═══ Unlocked Features — appears after all paths completed ═══ */}
      {allPathsCompleted && <UnlockedFeaturesSection />}

      {/* ═══ Progress Bar ═══ */}
      {hasProgress && (
        <section style={{ maxWidth: '760px', margin: '0 auto 3rem', padding: '0 1.5rem' }}>
          <motion.div {...fadeUp} className="glass-card" style={{ padding: '26px 32px' }}>
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontWeight: 700, fontSize: '1rem', fontFamily: 'var(--font-display)' }}>探索进度</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', textAlign: 'center' }}>
              {[
                { label: '问卷量表', value: `${completedDimensions.length}/8`, color: 'var(--accent-cyan)', active: completedDimensions.length > 0 },
                { label: '城市漫游者', value: avgCompleted ? '✓' : '—', color: 'var(--accent-gold)', active: avgCompleted },
                { label: '行为实验', value: `${gameResults.length}/6`, color: 'var(--accent-purple)', active: gameResults.length > 0 },
                { label: 'CAT 自适应', value: `${Object.keys(catResponses).length}/8`, color: '#FF80AB', active: Object.keys(catResponses).length > 0 },
              ].map((s) => (
                <div key={s.label}>
                  <p style={{ fontSize: '1.3rem', fontWeight: 700, color: s.active ? s.color : 'var(--text-tertiary)', fontFamily: 'var(--font-display)' }}>{s.value}</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>{s.label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </section>
      )}






      {/* ═══ Footer ═══ */}
      <footer style={{
        textAlign: 'center', padding: '3rem 1.5rem', fontSize: '0.72rem',
        color: 'var(--text-tertiary)', borderTop: '1px solid rgba(255,255,255,0.04)',
      }}>
        <p style={{ fontFamily: 'var(--font-sans)' }}>基于 CHC · Big Five · SDT · 依恋理论 · Frankl 意义治疗等国际主流心理学框架</p>
        <p style={{ marginTop: '6px' }}>探索性人格评估工具 · 非临床诊断</p>
        <Link to="/methodology" style={{
          display: 'inline-block', marginTop: '16px',
          fontSize: '0.68rem', color: 'rgba(100,255,218,0.35)',
          textDecoration: 'none', letterSpacing: '0.06em',
          padding: '6px 16px', borderRadius: 6,
          border: '1px solid rgba(100,255,218,0.06)',
          transition: 'all 0.3s ease',
        }}>
          [ 系统内核：科学依据与方法学声明 ]
        </Link>
      </footer>
    </div>
  );
}
