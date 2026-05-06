import { Link, useNavigate } from 'react-router-dom';
import { motion } from '../lib/motion-lite';
import { DIMENSIONS, DIMENSION_MAP } from '../data/dimensions';
import {
  getHumanMapQuestions,
  HUMAN_MAP_MODE_META,
} from '../data/human-map';
import { getHumanMapProgress } from '../engine/human-map';
import { useAssessmentStore } from '../store';
import type { HumanMapMode } from '../types';

const UNIVERSAL_PATHS = [
  {
    key: 'avg',
    title: '城市漫游者',
    subtitle: '情境式选择 · 绕开社会赞许偏差',
    to: '/avg/intro',
    color: '#FF7EDB',
  },
  {
    key: 'cat',
    title: 'CAT 自适应',
    subtitle: '更少题数锁定能力区间',
    to: '/cat/full',
    color: '#64FFDA',
  },
  {
    key: 'games',
    title: '行为实验室',
    subtitle: '认知控制 + 博弈偏好',
    to: '/games',
    color: '#FFD166',
  },
  {
    key: 'matrix',
    title: '矩阵推理',
    subtitle: '原创规则 DSL · 流体推理短测',
    to: '/matrix',
    color: '#4FC3F7',
  },
];

const MODE_PERSONA_LABELS: Record<HumanMapMode, string> = {
  detailed: '推荐',
  compact: '有个性的懒人',
  skip: '随大流',
};

function SectionTitle({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 10 }}>
        {eyebrow}
      </div>
      <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', margin: '0 0 10px', fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}>
        {title}
      </h2>
      <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.8, maxWidth: 720 }}>{copy}</p>
    </div>
  );
}

function HumanMapModeCard({
  mode,
  onChoose,
}: {
  mode: HumanMapMode;
  onChoose: (mode: HumanMapMode) => void;
}) {
  const meta = HUMAN_MAP_MODE_META[mode];
  return (
    <motion.button
      type="button"
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.99 }}
      onClick={() => onChoose(mode)}
      style={{
        textAlign: 'left',
        padding: '24px 22px',
        borderRadius: 24,
        border: `1px solid ${meta.accent}22`,
        background:
          `radial-gradient(circle at top right, ${meta.accent}16, transparent 32%), rgba(255,255,255,0.025)`,
        color: 'inherit',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 12px',
            borderRadius: 999,
            border: `1px solid ${meta.accent}26`,
            color: meta.accent,
            background: `${meta.accent}12`,
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          <span>{meta.poster}</span>
          <span>{meta.estimatedMinutes > 0 ? `${meta.estimatedMinutes} 分钟` : '立刻进入'}</span>
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '7px 12px',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.035)',
            color: 'var(--text-secondary)',
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {MODE_PERSONA_LABELS[mode]}
        </div>
      </div>

      <h3 style={{ fontSize: 22, margin: '0 0 8px', fontFamily: 'var(--font-display)' }}>{meta.title}</h3>
      <p style={{ margin: '0 0 12px', color: 'var(--text-primary)', fontWeight: 600 }}>{meta.subtitle}</p>
      <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.8 }}>{meta.description}</p>
    </motion.button>
  );
}

function UniversalDimensionGrid({
  completedDimensions,
  humanMapMode,
}: {
  completedDimensions: string[];
  humanMapMode: HumanMapMode | null;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
      {DIMENSIONS.map((dimension) => {
        const done = completedDimensions.includes(dimension.id);
        return (
          <motion.div
            key={dimension.id}
            whileHover={{ y: -4 }}
            style={{
              padding: '20px 18px',
              borderRadius: 22,
              border: `1px solid ${done ? `${dimension.color}33` : 'rgba(255,255,255,0.06)'}`,
              background: `linear-gradient(180deg, ${done ? `${dimension.color}12` : 'rgba(255,255,255,0.02)'}, rgba(255,255,255,0.02))`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 28 }}>{dimension.icon}</div>
                <h3 style={{ fontSize: 18, margin: '10px 0 6px', fontFamily: 'var(--font-display)' }}>{dimension.name}</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: 13 }}>
                  {dimension.description}
                </p>
              </div>
              {done && (
                <div
                  style={{
                    alignSelf: 'start',
                    padding: '6px 10px',
                    borderRadius: 999,
                    fontSize: 11,
                    color: dimension.color,
                    background: `${dimension.color}15`,
                  }}
                >
                  已完成
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                {humanMapMode === 'skip' || !humanMapMode ? '统一题库' : '也可作为补充维度'}
              </div>
              <Link
                to={`/assessment/${dimension.id}`}
                style={{
                  padding: '10px 14px',
                  borderRadius: 14,
                  textDecoration: 'none',
                  background: `${dimension.color}16`,
                  color: dimension.color,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                开始 →
              </Link>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function PersonalizedRouteSection() {
  const navigate = useNavigate();
  const {
    humanMapBlueprint,
    completedDimensions,
    avgCompleted,
    gameResults,
    matrixResults,
    humanMapMode,
    resetHumanMap,
    setHumanMapMode,
  } = useAssessmentStore();

  if (!humanMapBlueprint || humanMapMode === 'skip') return null;

  const canGenerateReport = completedDimensions.length >= 2 || avgCompleted || gameResults.length > 0 || matrixResults.length > 0;

  return (
    <>
      <section style={{ marginBottom: 34 }}>
        <SectionTitle
          eyebrow="Personalized Route"
          title="你的定制题路已经生成"
          copy={humanMapBlueprint.summary}
        />

        <div
          style={{
            padding: '24px 22px',
            borderRadius: 28,
            border: '1px solid rgba(100,255,218,0.14)',
            background:
              'radial-gradient(circle at top right, rgba(100,255,218,0.14), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.02))',
            marginBottom: 18,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                建模版本
              </div>
              <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700 }}>
                {HUMAN_MAP_MODE_META[humanMapBlueprint.mode].title}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                你当前阶段
              </div>
              <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700 }}>{humanMapBlueprint.lifeStage}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                这轮主线
              </div>
              <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700 }}>{humanMapBlueprint.currentFocus}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
            {humanMapBlueprint.signalScores.slice(0, 4).map((signal) => (
              <div
                key={signal.id}
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                }}
              >
                {signal.label}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          {humanMapBlueprint.dimensionPlans.map((plan, index) => {
            const dimension = DIMENSION_MAP[plan.dimensionId];
            const done = completedDimensions.includes(plan.dimensionId);
            return (
              <motion.div
                key={plan.dimensionId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.04, 0.22) }}
                style={{
                  padding: '22px 20px',
                  borderRadius: 24,
                  border: `1px solid ${dimension?.color ? `${dimension.color}24` : 'rgba(255,255,255,0.08)'}`,
                  background: `linear-gradient(180deg, ${dimension?.color ? `${dimension.color}12` : 'rgba(255,255,255,0.03)'}, rgba(255,255,255,0.02))`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ maxWidth: 760 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 28 }}>{dimension?.icon}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        Priority {String(index + 1).padStart(2, '0')}
                      </div>
                      <div
                        style={{
                          padding: '6px 10px',
                          borderRadius: 999,
                          background: 'rgba(255,255,255,0.04)',
                          fontSize: 11,
                          color: 'var(--text-tertiary)',
                        }}
                      >
                        {plan.questionIds.length} 题
                      </div>
                      {done && (
                        <div
                          style={{
                            padding: '6px 10px',
                            borderRadius: 999,
                            background: `${dimension?.color || '#64FFDA'}16`,
                            fontSize: 11,
                            color: dimension?.color || '#64FFDA',
                          }}
                        >
                          已完成
                        </div>
                      )}
                    </div>

                    <h3 style={{ fontSize: 24, margin: '12px 0 8px', fontFamily: 'var(--font-display)' }}>
                      {dimension?.name || plan.dimensionId}
                    </h3>
                    <p style={{ margin: '0 0 10px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                      {plan.reason}
                    </p>
                    <p style={{ margin: 0, color: 'var(--text-tertiary)', fontSize: 13, lineHeight: 1.8 }}>
                      {plan.immersivePrompt}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                      type="button"
                      onClick={() => navigate(`/assessment/${plan.dimensionId}`)}
                      style={{
                        padding: '12px 18px',
                        borderRadius: 16,
                        border: 'none',
                        background: `linear-gradient(135deg, ${dimension?.color || '#64FFDA'}, rgba(247,241,209,0.95))`,
                        color: '#0f172a',
                        fontWeight: 700,
                        cursor: 'pointer',
                        minWidth: 126,
                      }}
                    >
                      {done ? '再测一次' : '开始这组'}
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section
        style={{
          padding: '20px 18px',
          borderRadius: 22,
          border: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.025)',
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              Route Control
            </div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>想换一条建模方案，或者切回统一问题版本？</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => navigate(`/intake/${humanMapBlueprint.mode}`)}
              style={{
                padding: '10px 14px',
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              修改前置建模
            </button>
            <button
              type="button"
              onClick={() => {
                resetHumanMap();
                setHumanMapMode('skip');
              }}
              style={{
                padding: '10px 14px',
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              切换到统一问题版本
            </button>
          </div>
        </div>
      </section>

      {canGenerateReport && (
        <section style={{ marginBottom: 28 }}>
          <Link
            to="/report"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'center',
              textDecoration: 'none',
              padding: '20px 18px',
              borderRadius: 22,
              background: 'linear-gradient(135deg, rgba(100,255,218,0.10), rgba(179,136,255,0.08))',
              border: '1px solid rgba(100,255,218,0.18)',
              color: 'inherit',
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>Report Ready</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>你的画像数据已经足够生成第一版拓扑报告</div>
            </div>
            <div style={{ color: '#64FFDA', fontWeight: 700 }}>去看报告 →</div>
          </Link>
        </section>
      )}
    </>
  );
}

function ModeChooser() {
  const navigate = useNavigate();
  const { setHumanMapMode, resetHumanMap } = useAssessmentStore();

  const handleChoose = (mode: HumanMapMode) => {
    resetHumanMap();
    setHumanMapMode(mode);
    if (mode === 'skip') {
      return;
    }
    navigate(`/intake/${mode}`);
  };

  return (
    <section style={{ marginBottom: 34 }}>
      <SectionTitle
        eyebrow="Stage 01"
        title="先从三种入口里选一种"
        copy="这是完整画像工坊的必经入口。详细版和精简版会先完成《人类数值地图 v1》，做完后才会开放属于你的后续测试；统一问题版本则直接进入标准题库。"
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <HumanMapModeCard mode="detailed" onChoose={handleChoose} />
        <HumanMapModeCard mode="compact" onChoose={handleChoose} />
        <HumanMapModeCard mode="skip" onChoose={handleChoose} />
      </div>
    </section>
  );
}

function ResumeIntakeSection({
  mode,
  answers,
}: {
  mode: Exclude<HumanMapMode, 'skip'>;
  answers: Record<string, string>;
}) {
  const navigate = useNavigate();
  const { resetHumanMap } = useAssessmentStore();
  const progress = getHumanMapProgress(mode, answers);
  const questionCount = getHumanMapQuestions(mode).length;

  return (
    <section
      style={{
        padding: '26px 24px',
        borderRadius: 28,
        border: '1px solid rgba(255,255,255,0.08)',
        background:
          'radial-gradient(circle at top right, rgba(255,215,102,0.16), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
        marginBottom: 34,
      }}
    >
      <SectionTitle
        eyebrow="Continue Intake"
        title={`${HUMAN_MAP_MODE_META[mode].title} 还没做完`}
        copy={`你已经开始了 ${progress.answered}/${questionCount} 题。先把这一步做完，系统才会解锁后面的定制测试；在此之前，其它测试入口都会被收起。`}
      />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => navigate(`/intake/${mode}`)}
          style={{
            padding: '12px 18px',
            borderRadius: 16,
            border: 'none',
            background: 'linear-gradient(135deg, #FFD166, #FFE6A7)',
            color: '#0f172a',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          继续完成前置建模
        </button>
        <button
          type="button"
          onClick={() => resetHumanMap()}
          style={{
            padding: '12px 18px',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.03)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          重新选择方案
        </button>
      </div>
    </section>
  );
}

export default function AssessmentSelectPage() {
  const {
    completedDimensions,
    avgCompleted,
    gameResults,
    matrixResults,
    humanMapMode,
    humanMapBlueprint,
    humanMapAnswers,
  } = useAssessmentStore();

  const canGenerateReport = completedDimensions.length >= 2 || avgCompleted || gameResults.length > 0 || matrixResults.length > 0;
  const selectionPending = !humanMapMode;
  const intakePending = humanMapMode !== null && humanMapMode !== 'skip' && !humanMapBlueprint;
  const toolkitUnlocked = humanMapMode === 'skip' || Boolean(humanMapBlueprint);

  let heroEyebrow = 'Profiling Studio / Adaptive Intake';
  let heroTitle = '进入完整画像工坊前，先选一种入口。';
  let heroCopy =
    '第一，《人类数值地图 v1》详细版本（推荐）；第二，《人类数值地图 v1》精简版本（有个性的懒人）；第三，统一问题版本（随大流）。前两种都要先完成前置建模，后续测试才会开放。';

  if (intakePending && humanMapMode) {
    heroEyebrow = 'Profiling Studio / Intake Required';
    heroTitle = '你已经选了入口，但前置建模还没完成。';
    heroCopy = `继续完成 ${HUMAN_MAP_MODE_META[humanMapMode].title} 后，系统才会放开属于你的其它测试入口。`;
  } else if (humanMapMode === 'skip') {
    heroEyebrow = 'Profiling Studio / Unified Route';
    heroTitle = '你已进入统一问题版本。';
    heroCopy = '当前开放的是标准化题库与通用工具。如果之后想让题目更贴近你，随时可以回到这里改走详细版或精简版。';
  } else if (humanMapBlueprint) {
    heroEyebrow = 'Profiling Studio / Personalized Route';
    heroTitle = '你的前置建模已完成，定制题路已经解锁。';
    heroCopy = '现在你看到的顺序、题量和切入角度，都已经开始围绕你的阶段、主线和信号来排布。';
  }

  return (
    <div style={{ minHeight: '100vh', padding: '38px 24px 90px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ marginBottom: 26 }}>
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--text-tertiary)',
              textDecoration: 'none',
              fontSize: 13,
            }}
          >
            ← 返回画像工坊首页
          </Link>
        </div>

        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: '34px 28px',
            borderRadius: 32,
            border: '1px solid rgba(255,255,255,0.08)',
            background:
              'radial-gradient(circle at top right, rgba(100,255,218,0.18), transparent 28%), radial-gradient(circle at bottom left, rgba(179,136,255,0.16), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
            marginBottom: 34,
          }}
        >
          <div style={{ maxWidth: 760 }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>
              {heroEyebrow}
            </div>
            <h1 style={{ fontSize: 'clamp(34px, 7vw, 56px)', margin: '0 0 14px', fontFamily: 'var(--font-display)', letterSpacing: '-0.05em', lineHeight: 1.02 }}>
              {heroTitle}
            </h1>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.9 }}>
              {heroCopy}
            </p>
          </div>
        </motion.section>

        {selectionPending && <ModeChooser />}

        {intakePending && humanMapMode && (
          <ResumeIntakeSection mode={humanMapMode} answers={humanMapAnswers} />
        )}

        <PersonalizedRouteSection />

        {toolkitUnlocked && (
          <>
            <section style={{ marginBottom: 34 }}>
              <SectionTitle
                eyebrow="Universal Toolkit"
                title={humanMapMode === 'skip' ? '统一问题版本与通用工具' : '补充路径与统一问题版本'}
                copy={
                  humanMapMode === 'skip'
                    ? '你当前选择的是统一问题版本，所以这里是标准化入口。之后随时可以回到上面，切换成详细版或精简版。'
                    : '即使系统已经给你排好了优先题路，你仍然可以自由进入其它维度、行为实验和自适应测试，作为补充证据。'
                }
              />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
                {UNIVERSAL_PATHS.map((path) => (
                  <Link
                    key={path.key}
                    to={path.to}
                    style={{
                      textDecoration: 'none',
                      color: 'inherit',
                      padding: '18px 18px',
                      borderRadius: 22,
                      border: `1px solid ${path.color}24`,
                      background: `linear-gradient(180deg, ${path.color}12, rgba(255,255,255,0.02))`,
                    }}
                  >
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{path.title}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.8, marginTop: 8 }}>{path.subtitle}</div>
                    <div style={{ marginTop: 12, color: path.color, fontSize: 12, fontWeight: 700 }}>进入 →</div>
                  </Link>
                ))}
              </div>

              <UniversalDimensionGrid completedDimensions={completedDimensions} humanMapMode={humanMapMode} />
            </section>

            {canGenerateReport && (
              <section>
                <Link
                  to="/report"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 14,
                    alignItems: 'center',
                    textDecoration: 'none',
                    padding: '20px 18px',
                    borderRadius: 22,
                    background: 'linear-gradient(135deg, rgba(100,255,218,0.10), rgba(179,136,255,0.08))',
                    border: '1px solid rgba(100,255,218,0.18)',
                    color: 'inherit',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>Report Ready</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>已有足够证据生成拓扑画像报告</div>
                  </div>
                  <div style={{ color: '#64FFDA', fontWeight: 700 }}>去生成 →</div>
                </Link>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
