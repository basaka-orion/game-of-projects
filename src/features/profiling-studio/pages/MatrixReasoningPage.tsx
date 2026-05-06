import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from '../lib/motion-lite';
import { useAssessmentStore } from '../store';
import {
  MATRIX_LAB_VERSION,
  getMatrixReasoningItems,
  scoreMatrixSession,
} from '../engine/matrix-reasoning';
import { runMatrixReasoningProfiling } from '../../../lib/boss/profiling/service';
import type { MatrixCell, MatrixOption, MatrixResponse, MatrixSessionResult } from '../types';

const ACCENT_COLORS: Record<MatrixCell['accent'], string> = {
  cyan: '#64FFDA',
  violet: '#BB86FC',
  gold: '#FFD166',
  rose: '#FF7A90',
};

function MatrixGlyph({ cell, size = 86 }: { cell: MatrixCell; size?: number }) {
  const color = ACCENT_COLORS[cell.accent];
  const positions = [
    [0, 0],
    [-18, -14],
    [18, -14],
    [-18, 18],
  ].slice(0, cell.count);

  return (
    <svg width={size} height={size} viewBox="-48 -48 96 96" aria-hidden="true">
      {positions.map(([x, y], index) => (
        <g key={`${x}:${y}:${index}`} transform={`translate(${x} ${y}) rotate(${cell.rotation})`}>
          {cell.shape === 'circle' && (
            <circle
              r="13"
              fill={cell.fill === 'solid' ? color : 'transparent'}
              stroke={color}
              strokeWidth="4"
              strokeDasharray={cell.fill === 'striped' ? '5 5' : undefined}
            />
          )}
          {cell.shape === 'triangle' && (
            <path
              d="M 0 -16 L 15 13 L -15 13 Z"
              fill={cell.fill === 'solid' ? color : 'transparent'}
              stroke={color}
              strokeWidth="4"
              strokeLinejoin="round"
              strokeDasharray={cell.fill === 'striped' ? '5 5' : undefined}
            />
          )}
          {cell.shape === 'square' && (
            <rect
              x="-14"
              y="-14"
              width="28"
              height="28"
              rx="2"
              fill={cell.fill === 'solid' ? color : 'transparent'}
              stroke={color}
              strokeWidth="4"
              strokeDasharray={cell.fill === 'striped' ? '5 5' : undefined}
            />
          )}
          {cell.shape === 'diamond' && (
            <path
              d="M 0 -17 L 17 0 L 0 17 L -17 0 Z"
              fill={cell.fill === 'solid' ? color : 'transparent'}
              stroke={color}
              strokeWidth="4"
              strokeLinejoin="round"
              strokeDasharray={cell.fill === 'striped' ? '5 5' : undefined}
            />
          )}
        </g>
      ))}
    </svg>
  );
}

function MatrixGrid({ matrix }: { matrix: Array<MatrixCell | null> }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(82px, 1fr))',
      gap: 10,
      width: 'min(100%, 390px)',
    }}>
      {matrix.map((cell, index) => (
        <div
          key={index}
          style={{
            aspectRatio: '1 / 1',
            borderRadius: 16,
            border: cell ? '1px solid rgba(255,255,255,0.09)' : '1px dashed rgba(255,209,102,0.38)',
            background: cell
              ? 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.018))'
              : 'rgba(255,209,102,0.06)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {cell ? <MatrixGlyph cell={cell} size={78} /> : (
            <span style={{ color: '#FFD166', fontSize: 28, fontWeight: 700 }}>?</span>
          )}
        </div>
      ))}
    </div>
  );
}

function OptionButton({
  option,
  disabled,
  onChoose,
}: {
  option: MatrixOption;
  disabled: boolean;
  onChoose: (optionId: string) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChoose(option.id)}
      style={{
        minHeight: 110,
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 18,
        background: 'rgba(255,255,255,0.03)',
        color: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        display: 'grid',
        placeItems: 'center',
        opacity: disabled ? 0.72 : 1,
      }}
      title={option.rationale}
    >
      <MatrixGlyph cell={option.cell} size={76} />
    </button>
  );
}

function ResultPanel({ result }: { result: MatrixSessionResult }) {
  const bestRule = [...result.ruleBreakdown]
    .sort((left, right) => (right.correct / Math.max(right.attempted, 1)) - (left.correct / Math.max(left.attempted, 1)))[0];

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        padding: '28px 24px',
        borderRadius: 28,
        border: '1px solid rgba(100,255,218,0.16)',
        background: 'linear-gradient(180deg, rgba(100,255,218,0.08), rgba(255,255,255,0.025))',
      }}
    >
      <div style={{ fontSize: 12, color: '#64FFDA', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
        Matrix Reasoning Result
      </div>
      <h2 style={{ fontSize: 30, margin: '0 0 12px', fontFamily: 'var(--font-display)' }}>
        原创矩阵短测已写入本轮画像证据
      </h2>
      <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
        得分 {result.rawScore}/{result.maxScore}，难度加权 {result.difficultyWeightedScore}，平均反应时 {(result.meanResponseTimeMs / 1000).toFixed(1)} 秒。
        95% 二项置信区间为 {Math.round(result.confidenceInterval[0] * 100)}%-{Math.round(result.confidenceInterval[1] * 100)}%。
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          ['正确率', `${Math.round(result.accuracy * 100)}%`],
          ['规则族覆盖', `${result.ruleBreakdown.filter(item => item.attempted > 0).length}/${result.ruleBreakdown.length}`],
          ['探索版信度', result.reliabilityEstimate.toFixed(2)],
          ['优势规则', bestRule ? `${bestRule.family} ${bestRule.correct}/${bestRule.attempted}` : '待观察'],
        ].map(([label, value]) => (
          <div key={label} style={{
            padding: '14px 16px',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(0,0,0,0.16)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link to="/report" style={{
          padding: '12px 18px',
          borderRadius: 14,
          background: 'linear-gradient(135deg, #64FFDA, #D8FFF5)',
          color: '#07111d',
          fontWeight: 800,
          textDecoration: 'none',
        }}>
          生成综合报告
        </Link>
        <Link to="/assessment" style={{
          padding: '12px 18px',
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.03)',
          color: 'var(--text-secondary)',
          textDecoration: 'none',
        }}>
          返回题路
        </Link>
      </div>
    </motion.section>
  );
}

export default function MatrixReasoningPage() {
  const navigate = useNavigate();
  const items = useMemo(() => getMatrixReasoningItems(), []);
  const saveMatrixResult = useAssessmentStore(state => state.saveMatrixResult);
  const [started, setStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [startedAt, setStartedAt] = useState(() => performance.now());
  const [responses, setResponses] = useState<MatrixResponse[]>([]);
  const [result, setResult] = useState<MatrixSessionResult | null>(null);
  const [writebackStatus, setWritebackStatus] = useState<'idle' | 'writing' | 'done' | 'error'>('idle');

  const currentItem = items[currentIndex];
  const progress = Math.round((responses.length / items.length) * 100);

  const startLab = useCallback(() => {
    setStarted(true);
    setCurrentIndex(0);
    setResponses([]);
    setResult(null);
    setStartedAt(performance.now());
    setWritebackStatus('idle');
  }, []);

  const chooseOption = useCallback(async (optionId: string) => {
    if (!currentItem || result) return;
    const response: MatrixResponse = {
      itemId: currentItem.id,
      selectedOptionId: optionId,
      correctOptionId: currentItem.correctOptionId,
      isCorrect: optionId === currentItem.correctOptionId,
      responseTimeMs: Math.max(200, Math.round(performance.now() - startedAt)),
      answeredAt: new Date().toISOString(),
    };
    const nextResponses = [...responses, response];
    setResponses(nextResponses);

    if (currentIndex < items.length - 1) {
      setCurrentIndex(index => index + 1);
      setStartedAt(performance.now());
      return;
    }

    const finalResult = scoreMatrixSession(nextResponses, items);
    setResult(finalResult);
    saveMatrixResult(finalResult);
    setWritebackStatus('writing');
    try {
      await runMatrixReasoningProfiling(finalResult);
      setWritebackStatus('done');
    } catch {
      setWritebackStatus('error');
    }
  }, [currentIndex, currentItem, items, responses, result, saveMatrixResult, startedAt]);

  if (!started && !result) {
    return (
      <div style={{ minHeight: '100vh', padding: '42px 24px 90px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <Link to="/assessment" style={{ color: 'var(--text-tertiary)', textDecoration: 'none', fontSize: 13 }}>
            ← 返回统一题路
          </Link>
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              marginTop: 28,
              padding: '34px 30px',
              borderRadius: 32,
              border: '1px solid rgba(79,195,247,0.18)',
              background: 'radial-gradient(circle at top right, rgba(79,195,247,0.16), transparent 30%), linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
            }}
          >
            <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4FC3F7', marginBottom: 14 }}>
              Original Matrix Reasoning Lab / {MATRIX_LAB_VERSION}
            </div>
            <h1 style={{ fontSize: 'clamp(34px, 6vw, 58px)', lineHeight: 1.05, margin: '0 0 16px', fontFamily: 'var(--font-display)' }}>
              原创矩阵推理实验室
            </h1>
            <p style={{ maxWidth: 760, color: 'var(--text-secondary)', lineHeight: 1.9, margin: '0 0 24px' }}>
              这是 Openbasaka 自研的矩阵规则短测，用原创规则 DSL 生成题目和干扰项。它学习的是“矩阵推理”这种任务形态，不复制 Pearson Raven APM 原题，也不提供正式 IQ 或 Raven 分数换算。
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 24 }}>
              {[
                ['6 题短测', '覆盖递进、旋转、数量、叠加、分布、复合规则'],
                ['证据记录', '正确率、反应时、规则族难度、版本号都会写入报告'],
                ['严谨边界', '结果只作为自我建模证据，必须与其它来源融合解释'],
              ].map(([title, copy]) => (
                <div key={title} style={{
                  padding: '16px 18px',
                  borderRadius: 18,
                  border: '1px solid rgba(255,255,255,0.07)',
                  background: 'rgba(255,255,255,0.025)',
                }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{title}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{copy}</div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={startLab}
              style={{
                padding: '14px 24px',
                borderRadius: 16,
                border: 'none',
                background: 'linear-gradient(135deg, #4FC3F7, #DFF7FF)',
                color: '#07111d',
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              开始原创矩阵短测
            </button>
          </motion.section>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div style={{ minHeight: '100vh', padding: '42px 24px 90px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <ResultPanel result={result} />
          <div style={{ marginTop: 16, fontSize: 12, color: writebackStatus === 'error' ? '#FF7A90' : 'var(--text-tertiary)' }}>
            {writebackStatus === 'writing' && '正在写回 Boss、boss_memory 和记忆宫殿 profiling 抽屉…'}
            {writebackStatus === 'done' && '已完成 Boss 写回与记忆宫殿沉淀。'}
            {writebackStatus === 'error' && '本地短测结果已保存，但写回 Openbasaka 时失败，请稍后从报告页重新应用。'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', padding: '36px 24px 90px' }}>
      <div style={{ maxWidth: 1060, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 22 }}>
          <button
            type="button"
            onClick={() => navigate('/assessment')}
            style={{
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
              color: 'var(--text-secondary)',
              borderRadius: 12,
              padding: '9px 14px',
              cursor: 'pointer',
            }}
          >
            ← 退出短测
          </button>
          <div style={{ minWidth: 190, textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
              {currentIndex + 1}/{items.length} · {currentItem.family} · 难度 {currentItem.difficulty}
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: '#4FC3F7' }} />
            </div>
          </div>
        </div>

        <motion.section
          key={currentItem.id}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 26,
            alignItems: 'start',
          }}
        >
          <div style={{
            padding: '22px',
            borderRadius: 28,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.025)',
          }}>
            <div style={{ fontSize: 11, color: '#4FC3F7', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
              Rule DSL
            </div>
            <h2 style={{ fontSize: 22, margin: '0 0 12px', fontFamily: 'var(--font-display)' }}>{currentItem.prompt}</h2>
            <p style={{ margin: '0 0 18px', color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.7 }}>
              {currentItem.ruleDsl}
            </p>
            <MatrixGrid matrix={currentItem.matrix} />
          </div>

          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
              选择能补上右下角的选项。系统会记录正确率和反应时，但不会在作答过程中反馈对错。
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
              {currentItem.options.map(option => (
                <OptionButton
                  key={option.id}
                  option={option}
                  disabled={Boolean(result)}
                  onChoose={chooseOption}
                />
              ))}
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
