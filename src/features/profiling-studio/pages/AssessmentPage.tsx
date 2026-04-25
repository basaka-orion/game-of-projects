import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from '../lib/motion-lite';
import { allModules } from '../data/questions';
import { HUMAN_MAP_ANSWERING_GUIDE, HUMAN_MAP_MODE_META } from '../data/human-map';
import { useAssessmentStore } from '../store';
import { DIMENSION_MAP } from '../data/dimensions';
import { buildPersonalizedQuestionPresentation } from '../engine/question-personalization';
import type { Question, QuestionPresentationSnapshot } from '../types';

function truncateAnswer(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function buildAnswerLabel(
  question: Question,
  answer: string | number | undefined,
  displayChoiceOptions: string[],
  displayOptions: Array<{ value: number | string; label: string }>,
  sliderAnchors: QuestionPresentationSnapshot['displayedSliderAnchors'],
): string | undefined {
  if (answer == null) return undefined;

  if (question.type === 'open') {
    return truncateAnswer(String(answer).trim());
  }

  if (question.type === 'single_choice') {
    const index = String(answer).charCodeAt(0) - 65;
    return displayChoiceOptions[index] || String(answer);
  }

  if (question.type === 'visual_pair_choice') {
    return answer === 'left' ? '选择左侧图像' : answer === 'right' ? '选择右侧图像' : String(answer);
  }

  if ((question.type === 'likert5' || question.type === 'dynamic_slider') && sliderAnchors?.length) {
    const sliderValue = question.type === 'likert5'
      ? (Number(answer) - 1) * 25 + 10
      : Number(answer);
    const anchor = sliderAnchors.find((item) => sliderValue >= item.range[0] && sliderValue <= item.range[1]);
    if (anchor) {
      return anchor.tag ? `${anchor.tag}｜${anchor.label}` : anchor.label;
    }
  }

  const matchedOption = displayOptions.find((option) => String(option.value) === String(answer));
  return matchedOption?.label || String(answer);
}

export default function AssessmentPage() {
  const { dimensionId } = useParams<{ dimensionId?: string }>();
  const navigate = useNavigate();
  const {
    answers,
    setAnswer,
    completeModule,
    humanMapMode,
    humanMapBlueprint,
    saveQuestionPresentationSnapshot,
  } = useAssessmentStore();

  useEffect(() => {
    if (!humanMapMode) {
      navigate('/assessment', { replace: true });
      return;
    }

    if (humanMapMode !== 'skip' && !humanMapBlueprint) {
      navigate(`/intake/${humanMapMode}`, { replace: true });
    }
  }, [humanMapBlueprint, humanMapMode, navigate]);

  const mod = useMemo(() => {
    if (dimensionId) return allModules.find((m) => m.id === dimensionId);
    return allModules[0];
  }, [dimensionId]);

  const [currentQ, setCurrentQ] = useState(0);
  const [direction, setDirection] = useState(1);
  const [hoveredSide, setHoveredSide] = useState<'left' | 'right' | null>(null);
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);
  const rippleCounter = useRef(0);
  const snapshotSignatureRef = useRef('');

  if (!mod) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 16 }}>维度未找到</p>
        <Link to="/assessment" style={{ color: 'var(--accent-cyan)', textDecoration: 'none' }}>返回</Link>
      </div>
    );
  }

  const dimMeta = DIMENSION_MAP[mod.id];
  const personalizedPlan = humanMapBlueprint?.dimensionPlans.find((plan) => plan.dimensionId === mod.id) || null;
  const questions = useMemo(() => {
    if (humanMapMode === 'skip' || !personalizedPlan) return mod.questions;
    const selected = mod.questions.filter((question) => personalizedPlan.questionIds.includes(question.id));
    return selected.length > 0 ? selected : mod.questions;
  }, [humanMapMode, mod.questions, personalizedPlan]);
  const q = questions[currentQ];
  const modAnswers = answers[mod.id] || {};
  const progress = ((currentQ + 1) / questions.length) * 100;
  const currentAnswer = modAnswers[q?.id];
  const isLast = currentQ === questions.length - 1;
  const answerGuide = personalizedPlan ? HUMAN_MAP_ANSWERING_GUIDE[1] : HUMAN_MAP_ANSWERING_GUIDE[0];
  const personalizedQuestion = useMemo(
    () => buildPersonalizedQuestionPresentation(q, humanMapBlueprint, personalizedPlan),
    [humanMapBlueprint, personalizedPlan, q],
  );
  const displayChoiceOptions = personalizedQuestion?.rewrittenChoiceOptions || q.choiceOptions || [];
  const displayOptions = personalizedQuestion?.rewrittenOptions || q.options || [];
  const openPlaceholder = personalizedQuestion?.rewrittenPlaceholder || '请在此输入你的回答…';
  const displaySliderAnchors = personalizedQuestion?.rewrittenSliderAnchors || q.sliderAnchors;
  const currentSnapshot = useMemo<QuestionPresentationSnapshot>(() => ({
    id: `${mod.id}:${q.id}`,
    moduleId: mod.id,
    moduleName: mod.name,
    questionId: q.id,
    dimensionId: q.dimension,
    dimensionName: dimMeta?.name || mod.name,
    questionType: q.type,
    personalized: Boolean(personalizedQuestion),
    originalText: q.text,
    renderedText: personalizedQuestion?.rewrittenText || q.text,
    scenePrompt: personalizedQuestion?.scenePrompt,
    whyAsked: personalizedQuestion?.whyAsked,
    swingHint: personalizedQuestion?.swingHint,
    optionInstruction: personalizedQuestion?.optionInstruction,
    optionLead: personalizedQuestion?.optionLead,
    displayedOptions: displayChoiceOptions.length > 0
      ? displayChoiceOptions
      : displayOptions.map((option) => option.label),
    displayedSliderAnchors: displaySliderAnchors,
    currentFocusSnapshot: humanMapBlueprint?.currentFocus,
    lifeStageSnapshot: humanMapBlueprint?.lifeStage,
    answerValue: currentAnswer == null ? undefined : currentAnswer,
    answerLabel: buildAnswerLabel(q, currentAnswer as string | number | undefined, displayChoiceOptions, displayOptions, displaySliderAnchors),
    cachedAt: new Date().toISOString(),
    answeredAt: currentAnswer == null ? undefined : new Date().toISOString(),
  }), [
    currentAnswer,
    dimMeta?.name,
    displayChoiceOptions,
    displayOptions,
    displaySliderAnchors,
    humanMapBlueprint?.currentFocus,
    humanMapBlueprint?.lifeStage,
    mod.id,
    mod.name,
    personalizedQuestion,
    q,
  ]);

  useEffect(() => {
    setCurrentQ(0);
    setDirection(1);
    setHoveredSide(null);
    setRipple(null);
  }, [mod.id, questions.length]);

  useEffect(() => {
    const signature = JSON.stringify({
      id: currentSnapshot.id,
      renderedText: currentSnapshot.renderedText,
      answerValue: currentSnapshot.answerValue,
      answerLabel: currentSnapshot.answerLabel,
      displayedOptions: currentSnapshot.displayedOptions,
      displayedSliderAnchors: currentSnapshot.displayedSliderAnchors,
      personalized: currentSnapshot.personalized,
      currentFocusSnapshot: currentSnapshot.currentFocusSnapshot,
      lifeStageSnapshot: currentSnapshot.lifeStageSnapshot,
    });
    if (snapshotSignatureRef.current === signature) return;
    snapshotSignatureRef.current = signature;
    saveQuestionPresentationSnapshot(currentSnapshot);
  }, [currentSnapshot, saveQuestionPresentationSnapshot]);

  const autoAdvance = useCallback((delayMs: number) => {
    setTimeout(() => {
      if (currentQ < questions.length - 1) {
        setDirection(1);
        setCurrentQ((prev) => prev + 1);
        setHoveredSide(null);
        setRipple(null);
      }
    }, delayMs);
  }, [currentQ, questions.length]);

  const handleAnswer = (value: string | number) => {
    setAnswer(mod.id, q.id, value);
    if (q.type !== 'open') {
      setTimeout(() => {
        if (currentQ < questions.length - 1) {
          setDirection(1);
          setCurrentQ((prev) => prev + 1);
        }
      }, 350);
    }
  };

  const handleSingleChoiceAnswer = (optionLetter: string) => {
    setAnswer(mod.id, q.id, optionLetter);
    autoAdvance(600);
  };

  const handleVisualPairAnswer = (side: 'left' | 'right', e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    rippleCounter.current += 1;
    setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, key: rippleCounter.current });
    setAnswer(mod.id, q.id, side);
    autoAdvance(600);
  };

  const handleNext = () => {
    if (currentQ < questions.length - 1) {
      setDirection(1);
      setCurrentQ((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentQ > 0) {
      setDirection(-1);
      setCurrentQ((prev) => prev - 1);
      setHoveredSide(null);
      setRipple(null);
    }
  };

  const handleComplete = () => {
    completeModule(mod.id);
    navigate('/assessment');
  };

  const dimColor = dimMeta?.color || mod.color;

  // ══════════════════════════════════════════════════════════
  // Render helper: single_choice — 逻辑黑客模式
  // ══════════════════════════════════════════════════════════
  const renderSingleChoice = () => {
    const choices = displayChoiceOptions;
    return (
      <div>
        {/* Hacker mode tag */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              display: 'inline-block',
              padding: '5px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700,
              letterSpacing: '0.08em',
              background: 'linear-gradient(135deg, rgba(100,255,218,0.12), rgba(255,107,107,0.12))',
              border: '1px solid rgba(100,255,218,0.25)',
              color: 'var(--accent-cyan)',
            }}
          >
            ⚠️ 逻辑探测激活
          </motion.span>
        </div>

        {personalizedQuestion?.optionLead && (
          <div
            style={{
              textAlign: 'center',
              color: 'var(--text-tertiary)',
              fontSize: 12,
              lineHeight: 1.8,
              margin: '0 auto 16px',
              maxWidth: 560,
            }}
          >
            {personalizedQuestion.optionLead}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {choices.map((optText, idx) => {
            const letter = String.fromCharCode(65 + idx);
            const isSelected = currentAnswer === letter;
            return (
              <motion.button
                key={letter}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.08, duration: 0.35 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleSingleChoiceAnswer(letter)}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '16px 20px', borderRadius: 14,
                  background: isSelected
                    ? 'rgba(100,255,218,0.08)'
                    : 'rgba(255,255,255,0.025)',
                  border: `1.5px solid ${isSelected ? 'rgba(100,255,218,0.5)' : 'rgba(255,255,255,0.07)'}`,
                  color: isSelected ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                  fontSize: 14, lineHeight: 1.6, fontWeight: isSelected ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'border-color 0.3s, box-shadow 0.3s, background 0.3s',
                  boxShadow: isSelected
                    ? '0 0 24px rgba(100,255,218,0.2)'
                    : 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(100,255,218,0.35)';
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 0 20px rgba(100,255,218,0.15)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)';
                    (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                  }
                }}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 26, height: 26, borderRadius: '50%', marginRight: 14,
                  background: isSelected
                    ? 'var(--accent-cyan)'
                    : 'rgba(255,255,255,0.06)',
                  color: isSelected ? '#0a0a1a' : 'var(--text-tertiary)',
                  fontSize: 12, fontWeight: 700, flexShrink: 0,
                  transition: 'all 0.3s',
                }}>
                  {letter}
                </span>
                {optText}
              </motion.button>
            );
          })}
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════
  // Render helper: visual_pair_choice — 直觉盲选模式
  // ══════════════════════════════════════════════════════════
  const renderVisualPairChoice = () => {
    const isLeftSelected = currentAnswer === 'left';
    const isRightSelected = currentAnswer === 'right';
    return (
      <div>
        <div style={{
          display: 'flex', gap: 16, justifyContent: 'center', alignItems: 'center',
          flexWrap: 'wrap',
        }}>
          {/* Left image */}
          <motion.div
            style={{
              position: 'relative', flex: '1 1 45%', maxWidth: 320,
              aspectRatio: '1', borderRadius: 16, overflow: 'hidden',
              cursor: 'pointer',
              border: isLeftSelected
                ? '2px solid var(--accent-cyan)'
                : '2px solid transparent',
              boxShadow: isLeftSelected
                ? '0 0 30px rgba(100,255,218,0.3), 0 8px 32px rgba(0,0,0,0.4)'
                : '0 8px 32px rgba(0,0,0,0.4)',
            }}
            animate={{
              scale: hoveredSide === 'left' ? 1.02 : hoveredSide === 'right' ? 0.98 : 1,
              opacity: hoveredSide === 'right' ? 0.5 : 1,
            }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            onMouseEnter={() => setHoveredSide('left')}
            onMouseLeave={() => setHoveredSide(null)}
            onClick={(e) => handleVisualPairAnswer('left', e)}
          >
            <img
              src={q.leftImageSrc}
              alt="选项 A"
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                display: 'block',
              }}
            />
            {/* Ripple effect */}
            {ripple && isLeftSelected && (
              <div
                key={ripple.key}
                style={{
                  position: 'absolute',
                  left: ripple.x, top: ripple.y,
                  width: 120, height: 120,
                  borderRadius: '50%',
                  background: 'rgba(100,255,218,0.25)',
                  pointerEvents: 'none',
                  animation: 'ripple-out 0.7s ease-out forwards',
                }}
              />
            )}
          </motion.div>

          {/* VS indicator */}
          <div style={{
            fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 700,
            letterSpacing: '0.12em', flexShrink: 0,
          }}>
            VS
          </div>

          {/* Right image */}
          <motion.div
            style={{
              position: 'relative', flex: '1 1 45%', maxWidth: 320,
              aspectRatio: '1', borderRadius: 16, overflow: 'hidden',
              cursor: 'pointer',
              border: isRightSelected
                ? '2px solid var(--accent-cyan)'
                : '2px solid transparent',
              boxShadow: isRightSelected
                ? '0 0 30px rgba(100,255,218,0.3), 0 8px 32px rgba(0,0,0,0.4)'
                : '0 8px 32px rgba(0,0,0,0.4)',
            }}
            animate={{
              scale: hoveredSide === 'right' ? 1.02 : hoveredSide === 'left' ? 0.98 : 1,
              opacity: hoveredSide === 'left' ? 0.5 : 1,
            }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            onMouseEnter={() => setHoveredSide('right')}
            onMouseLeave={() => setHoveredSide(null)}
            onClick={(e) => handleVisualPairAnswer('right', e)}
          >
            <img
              src={q.rightImageSrc}
              alt="选项 B"
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                display: 'block',
              }}
            />
            {/* Ripple effect */}
            {ripple && isRightSelected && (
              <div
                key={ripple.key}
                style={{
                  position: 'absolute',
                  left: ripple.x, top: ripple.y,
                  width: 120, height: 120,
                  borderRadius: '50%',
                  background: 'rgba(100,255,218,0.25)',
                  pointerEvents: 'none',
                  animation: 'ripple-out 0.7s ease-out forwards',
                }}
              />
            )}
          </motion.div>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: 'var(--bg-primary)',
    }}>
      {/* Header */}
      <div style={{
        maxWidth: q.type === 'visual_pair_choice' ? 900 : 680,
        width: '100%', margin: '0 auto',
        padding: '24px 24px 16px',
      }}>
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button
            onClick={() => navigate('/assessment')}
            style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, padding: '8px 16px', fontSize: 13,
              color: 'var(--text-tertiary)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            返回
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>{dimMeta?.icon || mod.icon}</span>
            <span style={{ fontWeight: 600, fontSize: 15, color: dimColor }}>
              {mod.name}
            </span>
          </div>

          <div style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: 20,
            padding: '6px 14px', fontSize: 12, color: 'var(--text-secondary)',
            fontWeight: 600,
          }}>
            {currentQ + 1} / {questions.length}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{
          height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
        }}>
          <motion.div
            style={{
              height: '100%', borderRadius: 2,
              background: `linear-gradient(90deg, ${dimColor}, ${dimColor}88)`,
            }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>

        {personalizedPlan && humanMapMode && humanMapMode !== 'skip' && (
          <div
            style={{
              marginTop: 16,
              padding: '16px 18px',
              borderRadius: 18,
              border: `1px solid ${dimColor}22`,
              background: `linear-gradient(180deg, ${dimColor}12, rgba(255,255,255,0.02))`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.04)',
                  fontSize: 11,
                  color: dimColor,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                定制题包 · {HUMAN_MAP_MODE_META[humanMapMode].poster}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                这组题是系统根据你的前置建模优先挑出来的
              </div>
            </div>

            <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.8, marginBottom: 6 }}>
              {personalizedPlan.reason}
            </div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.7 }}>
              {personalizedPlan.immersivePrompt}
            </div>
          </div>
        )}
      </div>

      {/* Question Area */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
        maxWidth: q.type === 'visual_pair_choice' ? 900 : 680,
        width: '100%', margin: '0 auto', padding: '0 24px',
      }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={q.id}
            initial={{ opacity: 0, x: direction * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -40 }}
            transition={{ duration: 0.3 }}
          >
            {/* Sub-dimension badge */}
            {q.subDimension && dimMeta && (
              <div style={{ marginBottom: 16, textAlign: 'center' }}>
                <span style={{
                  fontSize: 11, padding: '4px 12px', borderRadius: 20,
                  background: `${dimColor}12`, color: `${dimColor}99`,
                  border: `1px solid ${dimColor}20`,
                }}>
                  {dimMeta.subDimensions.find(s => s.id === q.subDimension)?.name || q.subDimension}
                  {q.scaleRef && ` · ${q.scaleRef}`}
                </span>
              </div>
            )}

            <div
              style={{
                marginBottom: 18,
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontSize: 12,
                lineHeight: 1.7,
              }}
            >
              作答锚点：{answerGuide}
            </div>

            {personalizedQuestion && (
              <div
                style={{
                  marginBottom: 18,
                  padding: '16px 18px',
                  borderRadius: 18,
                  border: `1px solid ${dimColor}20`,
                  background: `linear-gradient(180deg, ${dimColor}10, rgba(255,255,255,0.02))`,
                }}
              >
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 12, color: dimColor, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    场景代入
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.8 }}>
                    {personalizedQuestion.scenePrompt}
                  </div>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.7 }}>
                    {personalizedQuestion.whyAsked}
                  </div>
                </div>
              </div>
            )}

            {/* Question text */}
            <h2 style={{
              fontSize: q.type === 'visual_pair_choice' ? 18 : 22,
              fontWeight: 700, lineHeight: 1.6,
              fontFamily: 'var(--font-serif)', marginBottom: q.type === 'visual_pair_choice' ? 24 : 32,
              color: 'var(--text-primary)', textAlign: 'center',
              whiteSpace: 'pre-line',
            }}>
              {personalizedQuestion?.rewrittenText || q.text}
            </h2>

            {personalizedQuestion && (
              <div
                style={{
                  margin: q.type === 'visual_pair_choice' ? '-8px auto 20px' : '-10px auto 24px',
                  maxWidth: 600,
                  padding: '12px 16px',
                  borderRadius: 16,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  textAlign: 'center',
                  color: 'var(--text-tertiary)',
                  fontSize: 12,
                  lineHeight: 1.8,
                }}
              >
                摇摆判定器：{personalizedQuestion.swingHint}
                <br />
                选项提醒：{personalizedQuestion.optionInstruction}
              </div>
            )}

            {/* ══ OPTIONS RENDERING — 5 BRANCHES ══ */}
            {q.type === 'open' ? (
              /* ── Branch 1: Open text ── */
              <div>
                {personalizedQuestion?.optionLead && (
                  <div
                    style={{
                      textAlign: 'center',
                      color: 'var(--text-tertiary)',
                      fontSize: 12,
                      lineHeight: 1.8,
                      margin: '0 auto 16px',
                      maxWidth: 560,
                    }}
                  >
                    {personalizedQuestion.optionLead}
                  </div>
                )}
                <textarea
                  style={{
                    width: '100%', minHeight: 130, resize: 'none',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 14, padding: 16, fontSize: 14,
                    color: 'var(--text-primary)', outline: 'none',
                    fontFamily: 'inherit', lineHeight: 1.6,
                  }}
                  placeholder={openPlaceholder}
                  value={(currentAnswer as string) || ''}
                  onChange={(e) => setAnswer(mod.id, q.id, e.target.value)}
                />
                <button
                  onClick={isLast ? handleComplete : handleNext}
                  disabled={!currentAnswer}
                  style={{
                    width: '100%', marginTop: 16, padding: '14px 0',
                    background: currentAnswer ? `linear-gradient(135deg, ${dimColor}, ${dimColor}88)` : 'rgba(255,255,255,0.04)',
                    color: currentAnswer ? '#0a0a1a' : 'var(--text-tertiary)',
                    border: 'none', borderRadius: 14, fontSize: 15,
                    fontWeight: 700, cursor: currentAnswer ? 'pointer' : 'default',
                  }}
                >
                  {isLast ? `完成 ${mod.name} 评估 ✦` : '下一题 →'}
                </button>
              </div>
            ) : q.type === 'single_choice' ? (
              /* ── Branch 2: Single choice — 逻辑黑客模式 ── */
              renderSingleChoice()
            ) : q.type === 'visual_pair_choice' ? (
              /* ── Branch 3: Visual pair choice — 直觉盲选模式 ── */
              renderVisualPairChoice()
            ) : (q.type === 'sjt' || q.type === 'dynamic_slider' || q.type === 'portrait' || q.type === 'likert5') && ((q.options && q.options.length >= 3) || q.type === 'likert5') ? (
              /* ── Branch 4: Dynamic Mind Slider — 逐题感知模式 ── */
              (() => {
                const isLikert = q.type === 'likert5';

                // Zone boundaries & colors — 5 zones for likert5, 4 for others
                const zoneRanges: [number, number][] = isLikert
                  ? [[0, 20], [21, 40], [41, 60], [61, 80], [81, 100]]
                  : [[0, 20], [21, 60], [61, 89], [90, 100]];
                const zoneColors = isLikert
                  ? ['#FF6B6B', '#FFB74D', '#B0BEC5', '#81C784', '#64FFDA']
                  : ['#64B5F6', '#B0BEC5', '#FFB74D', '#FF6B6B'];

                // Smart-split each option label into [感知tag, 潜台词explanation]
                const splitLabel = (label: string): [string, string] => {
                  const m = label.match(/^(.+?)[，,、](.+)$/);
                  if (m) return [m[1].trim(), m[2].trim()];
                  return [label, ''];
                };

                const defaultLikert5Options = [
                  { value: 1, label: '非常不同意，这完全不像我' },
                  { value: 2, label: '不太同意，偶尔如此' },
                  { value: 3, label: '说不准，看情况' },
                  { value: 4, label: '比较同意，经常如此' },
                  { value: 5, label: '非常同意，这就是我' },
                ];
                const opts = displayOptions.length >= 3 ? displayOptions : defaultLikert5Options;
                const anchors = personalizedQuestion?.rewrittenSliderAnchors || q.sliderAnchors || zoneRanges.map((range, idx) => {
                  const optLabel = opts[Math.min(idx, opts.length - 1)]?.label || '';
                  const [tag, explanation] = splitLabel(optLabel);
                  return { range, tag, label: explanation, color: zoneColors[idx] };
                });

                // For likert5: map slider 0-100 to stored value 1-5; for others: store raw 0-100
                const sliderToLikert = (v: number) => Math.max(1, Math.min(5, Math.ceil(v / 20) || 1));
                const likertToSlider = (v: number) => (v - 1) * 25 + 10; // center of each zone

                const rawSlider = isLikert
                  ? (typeof currentAnswer === 'number' ? likertToSlider(currentAnswer) : 50)
                  : (typeof currentAnswer === 'number' ? currentAnswer : 0);
                const [sliderVal, setSliderVal] = [rawSlider, (v: number) => {
                  if (isLikert) {
                    setAnswer(mod.id, q.id, sliderToLikert(v));
                  } else {
                    setAnswer(mod.id, q.id, v);
                  }
                }];
                const hasTouched = currentAnswer != null;
                const currentAnchor = anchors.find(a => sliderVal >= a.range[0] && sliderVal <= a.range[1]) || anchors[0];
                const intensity = sliderVal >= 90 ? 'high' : sliderVal >= 61 ? 'medium' : 'low';

                return (
                  <div>
                    {personalizedQuestion?.optionLead && (
                      <div
                        style={{
                          textAlign: 'center',
                          color: 'var(--text-tertiary)',
                          fontSize: 12,
                          lineHeight: 1.8,
                          margin: '0 auto 16px',
                          maxWidth: 560,
                        }}
                      >
                        {personalizedQuestion.optionLead}
                      </div>
                    )}
                    {/* Slider */}
                    <div style={{ padding: '0 4px' }}>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={sliderVal}
                        data-intensity={intensity}
                        className="mind-slider"
                        style={{
                          background: isLikert
                            ? 'linear-gradient(90deg, #FF6B6B 0%, #FFB74D 25%, #B0BEC5 50%, #81C784 75%, #64FFDA 100%)'
                            : 'linear-gradient(90deg, #64B5F6 0%, #B0BEC5 33%, #FFB74D 66%, #FF6B6B 100%)',
                        }}
                        onChange={(e) => setSliderVal(parseInt(e.target.value, 10))}
                      />
                    </div>

                    {/* ★ Perception tag — 紧贴滑块正下方 */}
                    <motion.div
                      key={currentAnchor.tag}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ textAlign: 'center', marginTop: 14 }}
                    >
                      <span style={{
                        fontSize: '0.95rem', fontWeight: 700,
                        color: currentAnchor.color,
                        letterSpacing: '0.04em',
                        textShadow: sliderVal >= 90 ? `0 0 16px ${currentAnchor.color}80` : 'none',
                      }}>
                        {currentAnchor.tag}
                      </span>
                    </motion.div>

                    {/* Explanatory subtext — 柔和解释 */}
                    {currentAnchor.label && (
                      <motion.div
                        key={currentAnchor.label}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.05 }}
                        style={{
                          marginTop: 10, padding: '14px 20px',
                          borderRadius: 12,
                          background: `${currentAnchor.color}06`,
                          border: `1px solid ${currentAnchor.color}15`,
                          textAlign: 'center',
                        }}
                      >
                        <p style={{
                          fontSize: '0.82rem', lineHeight: 1.7,
                          color: `${currentAnchor.color}99`,
                          fontWeight: 400, margin: 0,
                        }}>
                          {currentAnchor.label}
                        </p>
                      </motion.div>
                    )}

                    {/* Confirm button */}
                    <div style={{ textAlign: 'center', marginTop: 28 }}>
                      <motion.button
                        whileHover={{ scale: 1.03, borderColor: `${dimColor}60` }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => {
                          if (!hasTouched) setAnswer(mod.id, q.id, 0);
                          if (isLast) {
                            handleComplete();
                          } else {
                            setDirection(1);
                            setCurrentQ((prev) => prev + 1);
                          }
                        }}
                        style={{
                          padding: '12px 36px', fontSize: '0.88rem',
                          fontWeight: 600, fontFamily: 'var(--font-sans)',
                          color: hasTouched ? dimColor : 'var(--text-tertiary)',
                          background: hasTouched ? `${dimColor}08` : 'transparent',
                          border: `1.5px solid ${hasTouched ? `${dimColor}30` : 'rgba(255,255,255,0.08)'}`,
                          borderRadius: 12,
                          cursor: 'pointer',
                          letterSpacing: '0.04em',
                          transition: 'all 0.3s ease',
                        }}
                      >
                        {isLast ? '完成评估 ✦' : '确认'}
                      </motion.button>
                    </div>
                  </div>
                );
              })()
            ) : (
              /* ── Branch 5: Fallback — plain option buttons ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {personalizedQuestion?.optionLead && (
                  <div
                    style={{
                      textAlign: 'center',
                      color: 'var(--text-tertiary)',
                      fontSize: 12,
                      lineHeight: 1.8,
                      margin: '0 auto 6px',
                      maxWidth: 560,
                    }}
                  >
                    {personalizedQuestion.optionLead}
                  </div>
                )}
                {displayOptions.map((opt, idx) => {
                  const isSelected = String(currentAnswer) === String(opt.value);
                  return (
                    <motion.button
                      key={String(opt.value)}
                      whileTap={{ scale: 0.98 }}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      onClick={() => handleAnswer(opt.value)}
                      style={{
                        width: '100%', textAlign: 'left',
                        padding: '14px 20px', borderRadius: 14,
                        background: isSelected
                          ? `${dimColor}15`
                          : 'rgba(255,255,255,0.02)',
                        border: `1.5px solid ${isSelected ? `${dimColor}60` : 'rgba(255,255,255,0.06)'}`,
                        color: isSelected ? dimColor : 'var(--text-secondary)',
                        fontSize: 14, fontWeight: isSelected ? 600 : 400,
                        cursor: 'pointer', transition: 'all 0.2s',
                        lineHeight: 1.5,
                      }}
                    >
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 24, height: 24, borderRadius: '50%', marginRight: 12,
                        background: isSelected ? dimColor : 'rgba(255,255,255,0.06)',
                        color: isSelected ? '#0a0a1a' : 'var(--text-tertiary)',
                        fontSize: 12, fontWeight: 700, flexShrink: 0,
                        verticalAlign: 'middle',
                      }}>
                        {String.fromCharCode(65 + idx)}
                      </span>
                      {opt.label}
                    </motion.button>
                  );
                })}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer navigation */}
      <div style={{
        maxWidth: q.type === 'visual_pair_choice' ? 900 : 680,
        width: '100%', margin: '0 auto',
        padding: '16px 24px 32px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <button
          onClick={handlePrev}
          disabled={currentQ === 0}
          style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10, padding: '8px 20px', fontSize: 13,
            color: currentQ === 0 ? 'rgba(255,255,255,0.15)' : 'var(--text-tertiary)',
            cursor: currentQ === 0 ? 'default' : 'pointer',
          }}
        >
          ← 上一题
        </button>

        {isLast && q.type !== 'open' && currentAnswer != null && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={handleComplete}
            style={{
              background: `linear-gradient(135deg, ${dimColor}, ${dimColor}88)`,
              color: '#0a0a1a', border: 'none', borderRadius: 14,
              padding: '12px 32px', fontSize: 15, fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            完成评估 ✦
          </motion.button>
        )}

        {!isLast && q.type !== 'open' && (
          <button
            onClick={handleNext}
            disabled={currentAnswer == null}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, padding: '8px 20px', fontSize: 13,
              color: currentAnswer == null ? 'rgba(255,255,255,0.15)' : 'var(--text-tertiary)',
              cursor: currentAnswer == null ? 'default' : 'pointer',
            }}
          >
            跳过 →
          </button>
        )}
      </div>
    </div>
  );
}
