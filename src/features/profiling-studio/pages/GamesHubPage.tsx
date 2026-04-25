import { useNavigate } from 'react-router-dom';
import { motion } from '../lib/motion-lite';
import { useAssessmentStore } from '../store';
import { GAME_ICONS, IconContainer } from '../components/DimensionIcons';

const COGNITIVE_GAMES = [
  {
    id: 'stroop',
    name: 'Stroop 色词测验',
    nameEn: 'Stroop Color-Word',
    description: '你能无视字义、只看墨色吗？测量认知控制与选择性注意',
    time: '~90s',
    color: '#FF6B6B',
    measures: ['认知控制', '选择性注意', '处理速度'],
  },
  {
    id: 'nback',
    name: '2-Back 工作记忆',
    nameEn: 'N-Back Working Memory',
    description: '持续监控信息流，你的工作记忆缓冲区有多大？',
    time: '~60s',
    color: '#4FC3F7',
    measures: ['工作记忆', '注意持续性', '信息更新'],
  },
  {
    id: 'gonogo',
    name: 'Go/No-Go 抑制控制',
    nameEn: 'Go/No-Go Inhibition',
    description: '能在冲动面前急刹车吗？测量反应抑制能力',
    time: '~45s',
    color: '#64FFDA',
    measures: ['抑制控制', '冲动性', '反应速度'],
  },
];

const GAME_THEORY_GAMES = [
  {
    id: 'ultimatum',
    name: '最后通牒博弈',
    nameEn: 'Ultimatum Game',
    description: '分 100 元的艺术——你的公平感阈值在哪里？',
    time: '~2min',
    color: '#FFD700',
    measures: ['公平感', '惩罚倾向', '慷慨度'],
  },
  {
    id: 'trust',
    name: '信任博弈',
    nameEn: 'Trust Game',
    description: '你愿意把多少钱交给陌生人？测量人际信任与互惠',
    time: '~2min',
    color: '#BB86FC',
    measures: ['人际信任', '互惠动机', '风险偏好'],
  },
  {
    id: 'publicgoods',
    name: '公共品博弈',
    nameEn: 'Public Goods Game',
    description: '合作还是搭便车？经典的社会困境实验',
    time: '~2min',
    color: '#64FFDA',
    measures: ['合作倾向', '搭便车', '条件合作'],
  },
];

/* ── Card Background Image ── */
function CardImage({ src, opacity = 0.1 }: { src: string; opacity?: number }) {
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
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(135deg, rgba(10,14,26,0.88) 0%, rgba(10,14,26,0.55) 50%, rgba(10,14,26,0.82) 100%)',
      }} />
    </div>
  );
}

interface GameCardProps {
  game: typeof COGNITIVE_GAMES[number];
  completed: boolean;
  onClick: () => void;
  idx: number;
  bgImage: string;
}

function GameCard({ game, completed, onClick, idx, bgImage }: GameCardProps) {
  const IconComponent = GAME_ICONS[game.id];

  return (
    <motion.button
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.08, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={{ y: -6, transition: { duration: 0.3 } }}
      onClick={onClick}
      style={{
        background: 'rgba(255,255,255,0.015)',
        border: `1px solid ${completed ? `${game.color}25` : 'rgba(255,255,255,0.05)'}`,
        borderRadius: 22, padding: '30px 26px 26px',
        textAlign: 'left', width: '100%', cursor: 'pointer',
        position: 'relative', overflow: 'hidden',
        transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        fontFamily: 'var(--font-sans)',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = 'rgba(255,255,255,0.035)';
        el.style.borderColor = `${game.color}35`;
        el.style.boxShadow = `0 12px 40px rgba(0,0,0,0.3), 0 0 30px ${game.color}08`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = 'rgba(255,255,255,0.015)';
        el.style.borderColor = completed ? `${game.color}25` : 'rgba(255,255,255,0.05)';
        el.style.boxShadow = '';
      }}
    >
      {/* Real generated background */}
      <CardImage src={bgImage} opacity={0.08} />

      {/* Top glow line */}
      <div style={{
        position: 'absolute', top: 0, left: '10%', right: '10%', height: 2,
        background: `linear-gradient(90deg, transparent, ${game.color}, transparent)`,
        opacity: completed ? 0.7 : 0.25,
      }} />

      {completed && (
        <div style={{
          position: 'absolute', top: 14, right: 14, zIndex: 2,
          background: `${game.color}12`, color: game.color,
          fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20,
          border: `1px solid ${game.color}18`,
        }}>
          ✓ 已完成
        </div>
      )}

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ marginBottom: 16 }}>
          <IconContainer color={game.color} size={50}>
            {IconComponent && <IconComponent size={26} color={game.color} />}
          </IconContainer>
        </div>
        <h3 style={{
          fontSize: 17, fontWeight: 700, color: game.color, marginBottom: 4,
          fontFamily: 'var(--font-display)',
        }}>{game.name}</h3>
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12, letterSpacing: '0.03em' }}>{game.nameEn}</p>
        <p style={{
          fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 18,
        }}>
          {game.description}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {game.measures.map(m => (
              <span key={m} style={{
                fontSize: 10, padding: '4px 10px', borderRadius: 20,
                background: `${game.color}08`, color: `${game.color}99`,
                border: `1px solid ${game.color}12`,
              }}>
                {m}
              </span>
            ))}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>{game.time}</span>
        </div>
      </div>
    </motion.button>
  );
}

export default function GamesHubPage() {
  const navigate = useNavigate();
  const { gameResults } = useAssessmentStore();
  const completedGames = new Set(gameResults?.map(r => r.gameType) ?? []);

  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px 80px', fontFamily: 'var(--font-sans)' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 48 }}>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'none', border: 'none', color: 'var(--text-tertiary)',
              fontSize: 13, cursor: 'pointer', marginBottom: 24, padding: 0,
              display: 'flex', alignItems: 'center', gap: 4,
              transition: 'color 0.2s', fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
          >
            ← 返回首页
          </button>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <h1 style={{
                fontSize: 38, fontWeight: 700, marginBottom: 10,
                fontFamily: 'var(--font-display)',
                background: 'linear-gradient(135deg, #BB86FC, #4FC3F7)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.01em',
              }}>
                行为实验室
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 500, lineHeight: 1.7, fontWeight: 300 }}>
                通过游戏化认知任务和行为经济学博弈，捕获传统量表无法测量的
                <strong style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>行为层</strong>心理特质。
              </p>
            </div>
            <div style={{
              background: 'rgba(100,255,218,0.04)', borderRadius: 20,
              padding: '10px 22px', fontSize: 13, fontWeight: 600,
              color: 'var(--accent-cyan)',
              border: '1px solid rgba(100,255,218,0.1)',
              fontFamily: 'var(--font-display)',
            }}>
              {completedGames.size}/6 已完成
            </div>
          </div>
        </motion.div>

        {/* Cognitive Games */}
        <section style={{ marginBottom: 52 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 12,
              background: 'rgba(79,195,247,0.08)', border: '1px solid rgba(79,195,247,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4FC3F7" strokeWidth="1.5" strokeLinecap="round">
                <path d="M12 2a8 8 0 0 0-8 8c0 3.5 2 6 5 7.5V20h6v-2.5c3-1.5 5-4 5-7.5a8 8 0 0 0-8-8z"/>
                <line x1="10" y1="22" x2="14" y2="22"/>
              </svg>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)' }}>认知实验室</h2>
            <span style={{
              fontSize: 11, padding: '4px 12px', borderRadius: 20,
              background: 'rgba(79,195,247,0.06)', color: '#4FC3F7',
              border: '1px solid rgba(79,195,247,0.1)',
            }}>
              Cognitive Lab
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 24, lineHeight: 1.6 }}>
            三大经典认知心理学范式，测量你的注意力、工作记忆和抑制控制
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 22,
          }}>
            {COGNITIVE_GAMES.map((g, i) => (
              <GameCard
                key={g.id} game={g} idx={i}
                bgImage="/images/game-cognitive.png"
                completed={completedGames.has(g.id as any)}
                onClick={() => navigate(`/games/${g.id}`)}
              />
            ))}
          </div>
        </section>

        {/* Game Theory */}
        <section style={{ marginBottom: 52 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 12,
              background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFD700" strokeWidth="1.5" strokeLinecap="round">
                <rect x="4" y="4" width="7" height="7" rx="1.5"/>
                <rect x="13" y="4" width="7" height="7" rx="1.5"/>
                <rect x="4" y="13" width="7" height="7" rx="1.5"/>
                <rect x="13" y="13" width="7" height="7" rx="1.5"/>
              </svg>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)' }}>博弈剧场</h2>
            <span style={{
              fontSize: 11, padding: '4px 12px', borderRadius: 20,
              background: 'rgba(255,215,0,0.06)', color: '#FFD700',
              border: '1px solid rgba(255,215,0,0.1)',
            }}>
              Game Theory
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 24, lineHeight: 1.6 }}>
            三大行为经济学博弈，揭示你在资源分配和社会合作中的真实偏好
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 22,
          }}>
            {GAME_THEORY_GAMES.map((g, i) => (
              <GameCard
                key={g.id} game={g} idx={i + 3}
                bgImage="/images/game-theory.png"
                completed={completedGames.has(g.id as any)}
                onClick={() => navigate(`/games/${g.id}`)}
              />
            ))}
          </div>
        </section>

        {/* Theory note */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          style={{
            background: 'rgba(255,255,255,0.015)', borderRadius: 22, padding: '28px 32px',
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <div style={{
            position: 'absolute', top: -20, left: -20, width: 100, height: 100,
            background: 'radial-gradient(circle, rgba(187,134,252,0.06), transparent 70%)',
            pointerEvents: 'none',
          }} />
          <p style={{
            fontSize: 14, fontWeight: 700, color: 'var(--accent-purple)', marginBottom: 12,
            position: 'relative', fontFamily: 'var(--font-display)',
          }}>
            为什么要做这些游戏？
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, position: 'relative' }}>
            传统量表测量的是你「知道的自己」——你认为自己是什么样的人。
            认知游戏和博弈论实验测量的是你「行为中的自己」——你在真实情境中实际做出的选择。
            两者结合，能更全面地理解你的心理画像。
          </p>
        </motion.div>
      </div>
    </div>
  );
}
