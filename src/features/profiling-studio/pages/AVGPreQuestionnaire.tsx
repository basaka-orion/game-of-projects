import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from '../lib/motion-lite';
import { useAssessmentStore } from '../store';

/**
 * AVG 前置画像 — 5 道极致精准题
 *
 * 设计原则:
 * - 每个选项描述一个极其具体的行为+内心独白，像照镜子
 * - 用户看到某个选项会瞬间觉得"这就是我"，不可能犹豫
 * - 3-4 个选项，每个锚定一种完全不同的核心动机
 * - 不是描述"你是什么样的人"，而是描述"你在那一秒钟的身体反应和脑子里的话"
 */

interface ProfileQuestion {
  id: string;
  scenario: string;
  options: { value: string; text: string }[];
}

const profileQuestions: ProfileQuestion[] = [
  {
    id: 'energy',
    scenario: '周五下班，同事喊你去喝酒。你今天工作强度一般，身体不累。',
    options: [
      { value: 'social_hunger',
        text: '还没等他说完你就在想去哪家了。一个人回去干嘛？跟人待在一起才是充电。' },
      { value: 'selective_social',
        text: '看是谁。如果是那几个聊得来的，去；如果是一大群不太熟的，算了。' },
      { value: 'solo_recharge',
        text: '嘴上说"下次吧"，心里已经在规划今晚的独处时间了。不是讨厌他们，是你更需要自己。' },
      { value: 'guilt_comply',
        text: '不太想去，但还是去了。你怕拒绝太多次以后没人叫你了。' },
    ],
  },
  {
    id: 'conflict',
    scenario: '你在群聊里说了一个观点，有人直接回了句"这也太天真了吧"。群里二十多个人。',
    options: [
      { value: 'confront',
        text: '手指已经在打回复了。你不怕争论，你怕的是错误的观点没人反驳。' },
      { value: 'strategic_retreat',
        text: '先退出聊天窗口，打开浏览器搜一下相关资料。等你有了数据，再精准反击。' },
      { value: 'internal_storm',
        text: '你没回复，但心跳加速了。接下来一个小时你在脑海里把那个人的话翻来覆去想了十遍。' },
      { value: 'dismiss',
        text: '翻了个白眼就划走了。一个群聊里的陌生人说什么你根本不在意。' },
    ],
  },
  {
    id: 'unknown',
    scenario: '你到了一个完全陌生的城市，手机只剩 8% 的电量。你面前是一条你不认识的路。',
    options: [
      { value: 'thrill',
        text: '你心里竟然有点兴奋。不知道会走到哪，就是这种感觉让你觉得活着。' },
      { value: 'solve',
        text: '你立刻在脑子里排优先级：先找一个有插座的咖啡馆充电，然后再规划路线。' },
      { value: 'freeze',
        text: '你的焦虑感直线上升。你不喜欢失控的感觉，现在就想回到一个你认识的地方。' },
      { value: 'ask',
        text: '你直接拦了一个路人问路。搞不定的事情找人帮忙，这是本能。' },
    ],
  },
  {
    id: 'depth',
    scenario: '深夜两点，你还醒着。不是因为手机好玩，而是因为脑子停不下来。',
    options: [
      { value: 'existential',
        text: '你在想那种大问题——我这辈子到底在追什么？我现在走的路是我真正想走的吗？' },
      { value: 'replay',
        text: '你在回放今天的某个瞬间，分析自己当时为什么那样说、对方是什么意思。' },
      { value: 'plan',
        text: '你在列清单——明天要做的事、这周要搞定的事、下个月的计划。你的大脑在工作模式。' },
      { value: 'body',
        text: '你翻了个身试图放空，但做不到。所以你起来泡了杯茶，或者做了几个拉伸。先照顾身体。' },
    ],
  },
  {
    id: 'compassion',
    scenario: '你的一个朋友连续三年在同一件事上失败，TA又来找你倾诉了。上次你给的建议TA完全没听。',
    options: [
      { value: 'honest',
        text: '你打算这次直说了："我觉得你根本没有想改变。你来找我不是要建议，是要安慰。"' },
      { value: 'listen',
        text: '你还是会认真听。你知道TA需要的不是方案，是有人在。即使这意味着你也跟着难过。' },
      { value: 'pattern',
        text: '你开始在心里分析TA的行为模式——为什么TA总是在这一步卡住？这个人的底层卡点到底是什么？' },
      { value: 'boundary',
        text: '你犹豫了一下，然后把对话时间控制在了二十分钟。你在意TA，但你也需要保护自己的情绪。' },
    ],
  },
];

// ── 画像标签生成 ──
function getProfileLabels(answers: Record<string, string>): string[] {
  const labels: string[] = [];
  const map: Record<string, Record<string, string>> = {
    energy: {
      social_hunger: '社交驱动者', selective_social: '精选社交者',
      solo_recharge: '独处蓄能者', guilt_comply: '关系维护者',
    },
    conflict: {
      confront: '正面交锋者', strategic_retreat: '数据说理者',
      internal_storm: '内在消化者', dismiss: '情绪免疫者',
    },
    unknown: {
      thrill: '未知寻鲜者', solve: '问题拆解者',
      freeze: '安全锚定者', ask: '即时求援者',
    },
    depth: {
      existential: '意义追问者', replay: '细节复盘者',
      plan: '清单引擎者', body: '身体优先者',
    },
    compassion: {
      honest: '诚实镜子者', listen: '深度陪伴者',
      pattern: '模式洞察者', boundary: '边界守护者',
    },
  };

  for (const [qId, val] of Object.entries(answers)) {
    if (map[qId]?.[val]) labels.push(map[qId][val]);
  }
  return labels;
}

function getArchetypeTitle(answers: Record<string, string>): string {
  const e = answers.energy;
  const c = answers.conflict;
  const d = answers.depth;
  const u = answers.unknown;

  if (e === 'social_hunger' && c === 'confront') return '热烈行动派';
  if (e === 'solo_recharge' && d === 'existential') return '孤独思索者';
  if (e === 'selective_social' && c === 'strategic_retreat') return '精准策略家';
  if (d === 'existential' && c === 'internal_storm') return '沉默深潜者';
  if (e === 'social_hunger' && d === 'plan') return '社交效率家';
  if (u === 'thrill' && d === 'existential') return '哲思冒险家';
  if (u === 'solve' && c === 'strategic_retreat') return '冷静工程师';
  if (u === 'thrill' && e === 'social_hunger') return '旋风探索者';
  if (e === 'guilt_comply' && c === 'internal_storm') return '隐忍温柔者';
  if (d === 'replay' && c === 'internal_storm') return '反刍思考者';
  if (u === 'ask' && e === 'selective_social') return '务实连接者';
  if (d === 'body' && u === 'freeze') return '感性守护者';
  if (d === 'plan' && u === 'solve') return '系统规划者';
  if (e === 'solo_recharge' && u === 'thrill') return '独行探险家';
  if (c === 'dismiss' && d === 'body') return '轻盈自在者';
  return e === 'solo_recharge' ? '内核稳定者' : '开放行动者';
}

export default function AVGPreQuestionnaire() {
  const navigate = useNavigate();
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [selectedValue, setSelectedValue] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);

  const q = profileQuestions[currentQ];
  const progress = ((currentQ + (showResult ? 1 : 0)) / profileQuestions.length) * 100;

  const handleSelect = (value: string) => {
    setSelectedValue(value);
    const newAnswers = { ...answers, [q.id]: value };
    setAnswers(newAnswers);

    setTimeout(() => {
      if (currentQ < profileQuestions.length - 1) {
        setCurrentQ(currentQ + 1);
        setSelectedValue(null);
      } else {
        const { setAVGProfile } = useAssessmentStore.getState();
        setAVGProfile(newAnswers);
        setShowResult(true);
      }
    }, 500);
  };

  const startJourney = () => navigate('/avg');

  // ═══════════ Result Screen ═══════════
  if (showResult) {
    const archetype = getArchetypeTitle(answers);
    const labels = getProfileLabels(answers);

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '40px 24px',
        background: 'linear-gradient(180deg, #0a0a1a 0%, #0f0c29 50%, #1a1a2e 100%)',
      }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          style={{ textAlign: 'center', maxWidth: 480 }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>🌌</div>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8, letterSpacing: 4 }}>
            你的旅途画像
          </p>
          <h1 style={{
            fontSize: 32, fontWeight: 700, marginBottom: 24,
            background: 'linear-gradient(135deg, #BB86FC, #64FFDA)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            fontFamily: 'var(--font-serif)',
          }}>
            {archetype}
          </h1>

          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 8,
            justifyContent: 'center', marginBottom: 32,
          }}>
            {labels.map((tag, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12,
                  background: 'rgba(124,77,255,0.1)',
                  border: '1px solid rgba(124,77,255,0.2)', color: '#BB86FC',
                }}
              >
                {tag}
              </motion.span>
            ))}
          </div>

          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.8, marginBottom: 36 }}>
            接下来的旅程将根据你的画像量身定制<br />
            你会遇到专属于你的情境和选择
          </p>

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={startJourney}
            style={{
              padding: '16px 48px', fontSize: 16, fontWeight: 600,
              borderRadius: 14, cursor: 'pointer', border: 'none',
              background: 'linear-gradient(135deg, #7C4DFF, #E040FB)',
              color: '#fff', letterSpacing: 1,
            }}
          >
            开始我的旅途 →
          </motion.button>
        </motion.div>
      </div>
    );
  }

  // ═══════════ Question Screen ═══════════
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '40px 24px',
      background: 'linear-gradient(180deg, #0a0a1a 0%, #0f0c29 50%, #1a1a2e 100%)',
    }}>
      {/* Progress */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: 3, background: 'rgba(255,255,255,0.06)',
      }}>
        <motion.div
          animate={{ width: `${progress}%` }}
          style={{
            height: '100%', borderRadius: 2,
            background: 'linear-gradient(90deg, #7C4DFF, #E040FB)',
          }}
          transition={{ duration: 0.4 }}
        />
      </div>

      {/* Header */}
      <div style={{
        position: 'absolute', top: 16, left: 0, right: 0,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        maxWidth: 640, margin: '0 auto', padding: '0 24px', width: '100%',
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {currentQ + 1} / {profileQuestions.length}
        </span>
        <span style={{
          fontSize: 11, padding: '4px 12px', borderRadius: 20,
          background: 'rgba(124,77,255,0.1)', color: '#BB86FC',
        }}>
          旅途准备
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={q.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.35 }}
          style={{ maxWidth: 640, width: '100%' }}
        >
          {/* Scenario */}
          <p style={{
            fontSize: 18, fontWeight: 500, lineHeight: 1.7,
            fontFamily: 'var(--font-serif)', textAlign: 'center',
            marginBottom: 28, color: 'var(--text-primary)', padding: '0 8px',
          }}>
            {q.scenario}
          </p>

          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {q.options.map((opt, i) => {
              const isSelected = selectedValue === opt.value;
              const isOther = selectedValue !== null && !isSelected;
              return (
                <motion.button
                  key={opt.value}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => !selectedValue && handleSelect(opt.value)}
                  style={{
                    padding: '16px 20px', borderRadius: 14,
                    background: isSelected
                      ? 'rgba(124,77,255,0.12)'
                      : 'rgba(255,255,255,0.02)',
                    border: isSelected
                      ? '1px solid rgba(124,77,255,0.4)'
                      : '1px solid rgba(255,255,255,0.06)',
                    cursor: selectedValue ? 'default' : 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.3s',
                    opacity: isOther ? 0.25 : 1,
                    fontSize: 14, lineHeight: 1.65,
                    color: 'var(--text-secondary)',
                  }}
                  onMouseEnter={(e) => {
                    if (!selectedValue) {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(124,77,255,0.06)';
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(124,77,255,0.2)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!selectedValue) {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
                    }
                  }}
                >
                  {opt.text}
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Bottom note */}
      <div style={{
        position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center',
      }}>
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          选让你身体有反应的那个
        </p>
      </div>
    </div>
  );
}
