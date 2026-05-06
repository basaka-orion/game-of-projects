import { useState, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from '../lib/motion-lite';
import {
  initCAT,
  processResponse,
  selectNextItem,
  shouldTerminate,
  thetaToScore,
  getConfidenceInterval,
  DEFAULT_CAT_CONFIG,
} from '../engine/irt';
import type { CATState, IRTItemParams, CATConfig } from '../engine/irt';
import { CAT_ITEM_BANK, getCATDimensionItemBank } from '../data/item-bank';
import { catModules } from '../data/cat-questions';
import { DIMENSIONS } from '../data/dimensions';
import { useAssessmentStore } from '../store';
import { scoreCreativeOpenResponse } from '../engine/aut-scoring';
import { labelCATOption, scoreCATOption } from '../engine/cat-response-scoring';
import type { CATOpenResponseScore } from '../types';

const L5 = [
  { value: 1, label: '非常不同意' }, { value: 2, label: '不同意' },
  { value: 3, label: '中立' }, { value: 4, label: '同意' }, { value: 5, label: '非常同意' },
];

function getQuestionById(questionId: string) {
  for (const mod of catModules) {
    const q = mod.questions.find(q => q.id === questionId);
    if (q) return q;
  }
  return null;
}

export default function CATAssessmentPage() {
  const navigate = useNavigate();
  const { dimensionId } = useParams<{ dimensionId: string }>();

  const itemBank = useMemo(() => {
    if (dimensionId && dimensionId !== 'full') return getCATDimensionItemBank(dimensionId);
    return CAT_ITEM_BANK;
  }, [dimensionId]);

  const config: CATConfig = useMemo(() => ({
    ...DEFAULT_CAT_CONFIG,
    maxItems: dimensionId && dimensionId !== 'full' ? 8 : 24,
    minItems: dimensionId && dimensionId !== 'full' ? 3 : 8,
  }), [dimensionId]);

  const dimension = dimensionId ? DIMENSIONS.find(d => d.id === dimensionId) : null;
  const isFullCAT = !dimensionId || dimensionId === 'full';
  const requiredDimensionIds = useMemo(
    () => Array.from(new Set(itemBank.map(item => item.dimension))),
    [itemBank],
  );

  const getCoveredDimensions = useCallback((state: CATState) => {
    return new Set(
      state.responses
        .map(response => itemBank.find(item => item.questionId === response.itemId)?.dimension)
        .filter((dimId): dimId is string => Boolean(dimId)),
    );
  }, [itemBank]);

  const hasRequiredDimensionCoverage = useCallback((state: CATState) => {
    if (!isFullCAT) return true;
    const covered = getCoveredDimensions(state);
    return requiredDimensionIds.every(dimId => covered.has(dimId));
  }, [getCoveredDimensions, isFullCAT, requiredDimensionIds]);

  const selectBalancedNextItem = useCallback((state: CATState) => {
    if (isFullCAT) {
      const covered = getCoveredDimensions(state);
      const uncoveredItems = itemBank.filter(item => !covered.has(item.dimension));
      if (uncoveredItems.length > 0) {
        const nextUncovered = selectNextItem(
          state.theta,
          uncoveredItems,
          state.administeredItems,
          state.itemsPerDimension,
          config,
        );
        if (nextUncovered) return nextUncovered;
      }
    }

    return selectNextItem(state.theta, itemBank, state.administeredItems, state.itemsPerDimension, config);
  }, [config, getCoveredDimensions, isFullCAT, itemBank]);

  const [catState, setCatState] = useState<CATState>(() => initCAT(config));
  const [phase, setPhase] = useState<'intro' | 'testing' | 'result'>('intro');
  const [currentItem, setCurrentItem] = useState<IRTItemParams | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [openText, setOpenText] = useState('');
  const [openScores, setOpenScores] = useState<Record<string, CATOpenResponseScore>>({});
  const [responseMeta, setResponseMeta] = useState<Record<string, {
    selectedOptionValue?: string | number;
    selectedOptionLabel?: string;
    answeredAt: string;
  }>>({});

  const startTest = useCallback(() => {
    const state = initCAT(config);
    setCatState(state);
    setOpenText('');
    setOpenScores({});
    setResponseMeta({});
    const item = selectBalancedNextItem(state);
    setCurrentItem(item);
    setPhase('testing');
  }, [config, selectBalancedNextItem]);

  const handleResponse = useCallback((
    value: number,
    openScoring?: CATOpenResponseScore,
    meta?: { selectedOptionValue?: string | number; selectedOptionLabel?: string },
  ) => {
    if (!currentItem) return;
    const newState = processResponse(catState, itemBank, currentItem.questionId, value, config);
    setCatState(newState);
    const mergedOpenScores = openScoring
      ? { ...openScores, [currentItem.questionId]: openScoring }
      : openScores;
    if (openScoring) setOpenScores(mergedOpenScores);
    const mergedResponseMeta = {
      ...responseMeta,
      [currentItem.questionId]: {
        selectedOptionValue: meta?.selectedOptionValue,
        selectedOptionLabel: meta?.selectedOptionLabel,
        answeredAt: new Date().toISOString(),
      },
    };
    setResponseMeta(mergedResponseMeta);
    const sePct = Math.round((1 - newState.se / config.thetaPriorSD) * 100);
    setFeedback(`精度 ${Math.min(99, Math.max(10, sePct))}%`);

    setTimeout(() => {
      setFeedback(null);
      const shouldStop = shouldTerminate(newState, config) && hasRequiredDimensionCoverage(newState);

      if (shouldStop) {
        const { saveCATResponses } = useAssessmentStore.getState();
        // Convert IRT responses to V2.0 CATResponse format
        const catResps = newState.responses.map(r => ({
          itemId: r.itemId,
          response: r.response,
          theta: r.theta,
          se: r.se,
          ...mergedResponseMeta[r.itemId],
          openScoring: mergedOpenScores[r.itemId],
        }));

        if (dimensionId && dimensionId !== 'full') {
          saveCATResponses(dimensionId, catResps);
        } else {
          // Group by dimension
          const dimGroups: Record<string, typeof catResps> = {};
          for (const r of catResps) {
            const item = itemBank.find(i => i.questionId === r.itemId);
            if (!item) continue;
            if (!dimGroups[item.dimension]) dimGroups[item.dimension] = [];
            dimGroups[item.dimension].push(r);
          }
          for (const [dimId, resps] of Object.entries(dimGroups)) {
            saveCATResponses(dimId, resps);
          }
        }
        setPhase('result');
      } else {
        const next = selectBalancedNextItem(newState);
        setCurrentItem(next);
        setOpenText('');
      }
    }, 500);
  }, [catState, currentItem, itemBank, config, dimensionId, openScores, responseMeta, hasRequiredDimensionCoverage, selectBalancedNextItem]);

  const handleOpenSubmit = useCallback(() => {
    if (!currentItem || openText.trim().length < 8) return;
    const scored = scoreCreativeOpenResponse(openText);
    handleResponse(scored.category, scored, {
      selectedOptionLabel: openText.trim(),
    });
  }, [currentItem, handleResponse, openText]);

  const handleChoice = useCallback((value: number | string) => {
    if (!currentItem) return;
    const question = getQuestionById(currentItem.questionId);
    handleResponse(scoreCATOption(question, currentItem, value), undefined, {
      selectedOptionValue: value,
      selectedOptionLabel: labelCATOption(question, value),
    });
  }, [currentItem, handleResponse]);

  // ═══════════════════ INTRO ═══════════════════
  if (phase === 'intro') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '40px 24px',
      }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          style={{ maxWidth: 560, width: '100%', textAlign: 'center' }}>

          <div style={{ fontSize: 56, marginBottom: 20 }}>🎯</div>

          <h1 style={{
            fontSize: 30, fontWeight: 800, marginBottom: 12,
            fontFamily: 'var(--font-serif)',
          }}>
            {dimension ? `${dimension.icon} ${dimension.name}` : '全维度'} · 自适应评估
          </h1>

          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 32 }}>
            基于 <strong style={{ color: 'var(--accent-cyan)' }}>项目反应理论 (IRT)</strong> 的智能测评。
            系统会根据你的回答实时调整题目难度，用更少的题目达到更高的精度。
          </p>

          {/* Feature Cards */}
          <div style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 16, padding: '24px', marginBottom: 32, textAlign: 'left',
          }}>
            {[
              { icon: '📐', title: '分级反应模型 (GRM)', desc: 'Samejima (1969) 提出的多类别 IRT 模型，精确建模 Likert 量表的有序反应', color: 'var(--accent-cyan)' },
              { icon: '🧮', title: '期望后验估计 (EAP)', desc: '每道题后重新估计你的能力值 θ，精度实时收敛', color: '#FFD700' },
              { icon: '🎯', title: '最大 Fisher 信息量选题', desc: '每次选择对当前能力估计最有信息量的题目', color: 'var(--accent-purple)' },
            ].map((f, i) => (
              <div key={i} style={{
                display: 'flex', gap: 14, alignItems: 'flex-start',
                padding: '12px 0',
                borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{f.icon}</span>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: f.color, marginBottom: 4 }}>{f.title}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 24 }}>
            最多 {config.maxItems} 题 · SE &lt; {config.seThreshold} 时提前终止 · 约 3-5 分钟
          </p>

          <button onClick={startTest} style={{
            background: 'linear-gradient(135deg, #64FFDA, #00BFA5)',
            color: '#0a0a1a', border: 'none', borderRadius: 14,
            padding: '16px 48px', fontSize: 17, fontWeight: 700,
            cursor: 'pointer', marginBottom: 16, width: '100%', maxWidth: 320,
          }}>
            开始自适应测评
          </button>

          <div>
            <button onClick={() => navigate('/assessment')} style={{
              background: 'none', border: 'none', fontSize: 13,
              color: 'var(--text-tertiary)', cursor: 'pointer',
            }}>
              ← 返回
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ═══════════════════ RESULT ═══════════════════
  if (phase === 'result') {
    const score = thetaToScore(catState.theta);
    const [ciLow, ciHigh] = getConfidenceInterval(catState.theta, catState.se);
    const scoreLow = thetaToScore(ciLow);
    const scoreHigh = thetaToScore(ciHigh);
    const precision = Math.round((1 - catState.se / config.thetaPriorSD) * 100);

    const dimResults: { dim: string; name: string; icon: string; color: string; score: number; items: number }[] = [];
    if (!dimensionId || dimensionId === 'full') {
      const dimThetas: Record<string, { sum: number; count: number }> = {};
      for (const r of catState.responses) {
        const item = itemBank.find(i => i.questionId === r.itemId);
        if (!item) continue;
        if (!dimThetas[item.dimension]) dimThetas[item.dimension] = { sum: 0, count: 0 };
        dimThetas[item.dimension].sum += r.theta;
        dimThetas[item.dimension].count++;
      }
      for (const [dimId, data] of Object.entries(dimThetas)) {
        const d = DIMENSIONS.find(d => d.id === dimId);
        if (!d) continue;
        dimResults.push({
          dim: dimId, name: d.name, icon: d.icon, color: d.color,
          score: thetaToScore(data.sum / data.count), items: data.count,
        });
      }
    }

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '40px 24px',
      }}>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          style={{ maxWidth: 640, width: '100%', textAlign: 'center' }}>

          <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
          <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>自适应评估完成</h2>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 28 }}>
            {catState.responses.length} 题 · {catState.converged ? '精度达标提前终止' : '达到最大题数'}
          </p>

          {/* Main score */}
          <div style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 16, padding: 24, marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32,
          }}>
            <div>
              <p style={{ fontSize: 48, fontWeight: 800, color: 'var(--accent-cyan)' }}>{score}</p>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>总分 (百分位)</p>
            </div>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>θ = <strong>{catState.theta.toFixed(2)}</strong></p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>SE = <strong>{catState.se.toFixed(3)}</strong></p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>95% CI: [{scoreLow}, {scoreHigh}]</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                精度: <strong style={{ color: precision > 70 ? 'var(--accent-cyan)' : '#FFD700' }}>{precision}%</strong>
              </p>
            </div>
          </div>

          {/* Convergence */}
          <div style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 16, padding: '16px 20px', marginBottom: 20,
          }}>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>能力估计收敛曲线</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 64, justifyContent: 'center' }}>
              {catState.responses.map((r, i) => {
                const n = (r.theta + 4) / 8;
                return (
                  <div key={i} style={{
                    flex: 1, maxWidth: 24, height: `${n * 56}px`, minHeight: 4,
                    borderRadius: '3px 3px 0 0',
                    background: 'linear-gradient(to top, var(--accent-cyan), var(--accent-purple))',
                    opacity: 0.6 + (i / catState.responses.length) * 0.4,
                  }} />
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Q1</span>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Q{catState.responses.length}</span>
            </div>
          </div>

          {/* SE trace */}
          <div style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 16, padding: '16px 20px', marginBottom: 20,
          }}>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>标准误差收敛 (越低越精确)</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 48, justifyContent: 'center' }}>
              {catState.responses.map((r, i) => (
                <div key={i} style={{
                  flex: 1, maxWidth: 24,
                  height: `${(r.se / config.thetaPriorSD) * 40}px`, minHeight: 2,
                  borderRadius: '3px 3px 0 0',
                  background: r.se < config.seThreshold ? 'var(--accent-cyan)' : '#FFD700',
                  opacity: 0.7,
                }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>SE</span>
              <span style={{ fontSize: 10, color: 'var(--accent-cyan)' }}>阈值 {config.seThreshold}</span>
            </div>
          </div>

          {/* Per-dim results */}
          {dimResults.length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: 10, marginBottom: 20,
            }}>
              {dimResults.map(dr => (
                <div key={dr.dim} style={{
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 14, padding: '14px 10px', textAlign: 'center',
                }}>
                  <p style={{ fontSize: 18 }}>{dr.icon}</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: dr.color }}>{dr.score}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{dr.name} ({dr.items}题)</p>
                </div>
              ))}
            </div>
          )}

          {/* Science note */}
          <div style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 16, padding: '16px 20px', marginBottom: 24, textAlign: 'left',
          }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-purple)', marginBottom: 6 }}>📖 什么是自适应测试？</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              传统测试给每个人同样的题目。CAT 就像一个聪明的考官——如果你答对了难题，它会出更难的；
              如果你答错了，它会适当降低难度。这样用更少的题目就能精确定位你的能力水平。
              GRE、托福等标准化考试都采用了这一原理。
            </p>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => navigate('/assessment')} style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12, padding: '12px 28px', fontSize: 14,
              color: 'var(--text-secondary)', cursor: 'pointer',
            }}>返回选择</button>
            <button onClick={() => navigate('/report')} style={{
              background: 'linear-gradient(135deg, #64FFDA, #00BFA5)',
              color: '#0a0a1a', border: 'none', borderRadius: 12,
              padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>查看画像</button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ═══════════════════ TESTING ═══════════════════
  if (!currentItem) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-tertiary)' }}>题库已用尽</p>
      </div>
    );
  }

  const question = getQuestionById(currentItem.questionId);
  const itemNum = catState.responses.length + 1;
  const maxItems = config.maxItems;
  const sePct = catState.responses.length > 0 ? Math.round((1 - catState.se / config.thetaPriorSD) * 100) : 0;
  const options = question?.options || L5;
  const isBinary = currentItem.b.length === 1;
  const isOpen = question?.type === 'open';
  const openPreview = isOpen && openText.trim().length >= 8 ? scoreCreativeOpenResponse(openText) : null;

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '60px 24px 40px',
      position: 'relative',
    }}>
      {/* Progress bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.06)' }}>
        <motion.div animate={{ width: `${(itemNum / maxItems) * 100}%` }}
          style={{ height: '100%', background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-purple))', borderRadius: 2 }}
          transition={{ duration: 0.4 }} />
      </div>

      {/* Back button — top left */}
      <button
        onClick={() => navigate('/assessment')}
        style={{
          position: 'absolute', top: 12, left: 16, zIndex: 30,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderRadius: 20,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'var(--text-tertiary)', fontSize: 12,
          cursor: 'pointer', transition: 'all .3s',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        返回
      </button>

      {/* Status bar */}
      <div style={{
        position: 'absolute', top: 12, left: 24, right: 24,
        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16,
        maxWidth: 560, margin: '0 auto', width: '100%',
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Q{itemNum}/{maxItems}</span>
        <span style={{
          fontSize: 11, padding: '4px 12px', borderRadius: 20,
          background: sePct > 70 ? 'rgba(100,255,218,0.1)' : 'rgba(255,215,0,0.1)',
          color: sePct > 70 ? 'var(--accent-cyan)' : '#FFD700',
        }}>精度 {sePct}%</span>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>θ={catState.theta.toFixed(1)}</span>
      </div>

      {/* Theta indicator */}
      <div style={{ position: 'absolute', top: 38, left: 24, right: 24, maxWidth: 560, margin: '0 auto', width: '100%' }}>
        <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.05)' }}>
          <div style={{
            height: '100%', borderRadius: 2, transition: 'width 0.5s',
            width: `${((catState.theta + 4) / 8) * 100}%`,
            background: 'linear-gradient(to right, var(--accent-cyan), var(--accent-purple))',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
          <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>-4</span>
          <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>0</span>
          <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>+4</span>
        </div>
      </div>

      {/* Feedback */}
      <AnimatePresence>
        {feedback && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{
              position: 'absolute', top: 60, fontSize: 12, padding: '5px 14px', borderRadius: 20,
              background: 'rgba(100,255,218,0.1)', color: 'var(--accent-cyan)',
            }}>
            {feedback}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Question */}
      <motion.div
        key={currentItem.questionId}
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -30 }}
        style={{ maxWidth: 560, width: '100%', textAlign: 'center' }}
      >
        {/* Badges */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{
            fontSize: 11, padding: '4px 12px', borderRadius: 20,
            background: 'rgba(187,134,252,0.1)', color: 'var(--accent-purple)',
          }}>{currentItem.contentArea}</span>
          <span style={{
            fontSize: 11, padding: '4px 10px', borderRadius: 20,
            background: 'rgba(255,255,255,0.04)', color: 'var(--text-tertiary)',
          }}>a={currentItem.a.toFixed(1)}</span>
        </div>

        {/* Question text */}
        <p style={{
          fontSize: 20, lineHeight: 1.7, fontFamily: 'var(--font-serif)',
          marginBottom: 32, fontWeight: 500,
        }}>
          {question?.text || `[题目 ${currentItem.questionId}]`}
        </p>

        {/* Options */}
        {isOpen ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' }}>
            <textarea
              value={openText}
              onChange={(event) => setOpenText(event.target.value)}
              placeholder="逐条写下你的想法，可以用换行、顿号或分号分隔。系统会先做启发式 AUT 评分，后续报告会标注需要复核。"
              style={{
                minHeight: 160,
                width: '100%',
                resize: 'vertical',
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
                color: 'var(--text-primary)',
                padding: '16px 18px',
                fontSize: 14,
                lineHeight: 1.7,
                outline: 'none',
              }}
            />
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 8,
            }}>
              {[
                ['流畅性', openPreview?.fluency ?? 0],
                ['灵活性', openPreview?.flexibility ?? 0],
                ['独创线索', openPreview?.originalityProxy ?? 0],
                ['精细化', openPreview?.elaboration ?? 0],
              ].map(([label, value]) => (
                <div key={label} style={{
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(255,255,255,0.02)',
                  padding: '10px 8px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 18, color: 'var(--accent-cyan)', fontWeight: 700 }}>{value}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{label}</div>
                </div>
              ))}
            </div>
            <button
              onClick={handleOpenSubmit}
              disabled={openText.trim().length < 8}
              style={{
                border: 'none',
                borderRadius: 14,
                padding: '14px 18px',
                background: openText.trim().length >= 8
                  ? 'linear-gradient(135deg, #64FFDA, #00BFA5)'
                  : 'rgba(255,255,255,0.06)',
                color: openText.trim().length >= 8 ? '#0a0a1a' : 'var(--text-tertiary)',
                fontSize: 14,
                fontWeight: 700,
                cursor: openText.trim().length >= 8 ? 'pointer' : 'not-allowed',
              }}
            >
              提交开放作答
            </button>
          </div>
        ) : isBinary && question?.options ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {question.options.map((opt, i) => (
              <motion.button
                key={i} whileTap={{ scale: 0.98 }}
                onClick={() => handleChoice(opt.value)}
                style={{
                  width: '100%', textAlign: 'left', padding: '14px 20px',
                  borderRadius: 14, background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer',
                }}
              >{opt.label}</motion.button>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {options.map((opt, i) => (
              <motion.button
                key={i} whileTap={{ scale: 0.9 }}
                onClick={() => handleChoice(opt.value)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '14px 16px', borderRadius: 14, minWidth: 72,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(100,255,218,0.08)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(100,255,218,0.3)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
                }}
              >
                <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-cyan)' }}>{opt.value}</span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{opt.label}</span>
              </motion.button>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
