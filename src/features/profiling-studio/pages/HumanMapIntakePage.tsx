import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from '../lib/motion-lite';
import { useAssessmentStore } from '../store';
import {
  HUMAN_MAP_ANSWERING_GUIDE,
  HUMAN_MAP_MODE_META,
  getHumanMapQuestions,
} from '../data/human-map';
import { buildHumanMapBlueprint, getHumanMapProgress, getHumanMapQuestionFlow } from '../engine/human-map';
import { recordModuleResponse } from '../engine/data-collection';
import type { HumanMapMode } from '../types';
import { runHumanMapProfiling } from '../../../lib/boss/profiling/service';
import { generateAdaptiveHumanMapClarifiers } from '../api/adaptive-human-map';

function isIntakeMode(mode: string | undefined): mode is Exclude<HumanMapMode, 'skip'> {
  return mode === 'detailed' || mode === 'compact';
}

export default function HumanMapIntakePage() {
  const { mode: modeParam } = useParams<{ mode: string }>();
  const navigate = useNavigate();
  const {
    humanMapMode,
    humanMapAnswers,
    humanMapAIQuestions,
    setHumanMapMode,
    setHumanMapAnswer,
    setHumanMapAIQuestions,
    completeHumanMap,
  } = useAssessmentStore();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiStatus, setAIStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [aiError, setAIError] = useState<string | null>(null);
  const startedAtRef = useRef(Date.now());
  const aiSignatureRef = useRef('');
  const invalidMode = !isIntakeMode(modeParam);
  const mode: Exclude<HumanMapMode, 'skip'> = isIntakeMode(modeParam) ? modeParam : 'compact';

  useEffect(() => {
    if (invalidMode) {
      navigate('/assessment', { replace: true });
    }
  }, [invalidMode, navigate]);

  const meta = HUMAN_MAP_MODE_META[mode];
  const baseQuestions = useMemo(() => getHumanMapQuestions(mode), [mode]);
  const questions = useMemo(
    () => getHumanMapQuestionFlow(mode, humanMapAnswers, humanMapAIQuestions),
    [mode, humanMapAnswers, humanMapAIQuestions],
  );
  const progress = getHumanMapProgress(mode, humanMapAnswers, humanMapAIQuestions);
  const baseAnswered = useMemo(
    () => baseQuestions.filter((question) => humanMapAnswers[question.id]?.trim()).length,
    [baseQuestions, humanMapAnswers],
  );

  useEffect(() => {
    if (humanMapMode !== mode) {
      setHumanMapMode(mode);
      startedAtRef.current = Date.now();
    }
  }, [humanMapMode, mode, setHumanMapMode]);

  useEffect(() => {
    if (humanMapAIQuestions.length > 0) {
      setAIStatus('ready');
      setAIError(null);
    } else if (aiStatus === 'ready') {
      setAIStatus('idle');
    }
  }, [aiStatus, humanMapAIQuestions.length]);

  const preview = useMemo(() => {
    if (progress.answered < 2) return null;
    return buildHumanMapBlueprint(mode, humanMapAnswers, humanMapAIQuestions);
  }, [humanMapAIQuestions, humanMapAnswers, mode, progress.answered]);

  const aiGenerationReady = baseAnswered >= (mode === 'detailed' ? 4 : 3);

  useEffect(() => {
    if (!aiGenerationReady || humanMapAIQuestions.length > 0 || !preview || isSubmitting) return;

    const signature = [
      mode,
      preview.lifeStage,
      preview.currentFocus,
      ...preview.sourceDigest,
      ...preview.signalScores.slice(0, 3).map((signal) => `${signal.id}:${signal.score.toFixed(2)}`),
    ].join('|');

    if (aiSignatureRef.current === signature) return;
    aiSignatureRef.current = signature;
    setAIStatus('loading');
    setAIError(null);

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const generatedQuestions = await generateAdaptiveHumanMapClarifiers({
            mode,
            answers: humanMapAnswers,
            blueprint: preview,
          });
          setHumanMapAIQuestions(generatedQuestions);
          setAIStatus(generatedQuestions.length > 0 ? 'ready' : 'idle');
        } catch (generationError) {
          setAIStatus('error');
          setAIError(generationError instanceof Error ? generationError.message : 'AI 追问生成失败');
        }
      })();
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [
    aiGenerationReady,
    humanMapAIQuestions.length,
    humanMapAnswers,
    isSubmitting,
    mode,
    preview,
    setHumanMapAIQuestions,
  ]);

  const handleChange = (questionId: string, value: string) => {
    setHumanMapAnswer(questionId, value);
    if (error) setError(null);
  };

  const handleComplete = () => {
    const missingRequired = questions.filter((question) => question.required && !humanMapAnswers[question.id]?.trim());
    if (missingRequired.length > 0) {
      setError(`还有 ${missingRequired.length} 个必答问题没完成，先把它们补上，我们的定制路由才会稳。`);
      return;
    }

    setIsSubmitting(true);
    const blueprint = buildHumanMapBlueprint(mode, humanMapAnswers, humanMapAIQuestions);
    completeHumanMap(blueprint);

    void (async () => {
      try {
        recordModuleResponse(
          `human_map_${mode}`,
          'anchor',
          humanMapAnswers as Record<string, string | number>,
          startedAtRef.current,
        );
        await runHumanMapProfiling(blueprint);
      } catch {
        // intake should still succeed even if Boss profile application fails
      } finally {
        startTransition(() => {
          navigate('/assessment');
        });
      }
    })();
  };

  if (invalidMode) {
    return null;
  }

  return (
    <div style={{ minHeight: '100vh', padding: '32px 24px 80px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ marginBottom: 32 }}>
          <Link
            to="/assessment"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--text-tertiary)',
              textDecoration: 'none',
              fontSize: 13,
            }}
          >
            ← 返回画像工坊入口
          </Link>
        </div>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.4fr) minmax(300px, 0.9fr)',
            gap: 24,
            alignItems: 'start',
          }}
        >
          <div>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                borderRadius: 28,
                padding: '32px 28px',
                background:
                  'radial-gradient(circle at top right, rgba(100,255,218,0.15), transparent 35%), linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
                border: '1px solid rgba(255,255,255,0.08)',
                marginBottom: 22,
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 14px',
                  borderRadius: 999,
                  marginBottom: 18,
                  border: `1px solid ${meta.accent}33`,
                  background: `${meta.accent}14`,
                  color: meta.accent,
                  fontSize: 12,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                <span>Human Map v1</span>
                <span>{meta.poster}</span>
              </div>

              <h1
                style={{
                  fontSize: 'clamp(30px, 5vw, 44px)',
                  lineHeight: 1.08,
                  margin: '0 0 14px',
                  fontFamily: 'var(--font-display)',
                  letterSpacing: '-0.03em',
                }}
              >
                {meta.title}
              </h1>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.9, maxWidth: 680, margin: 0 }}>
                {meta.description}
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 14,
                  marginTop: 24,
                }}
              >
                <div
                  style={{
                    padding: '16px 18px',
                    borderRadius: 18,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    预估时长
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>{meta.estimatedMinutes} 分钟</div>
                </div>
                <div
                  style={{
                    padding: '16px 18px',
                    borderRadius: 18,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    当前进度
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>
                    {progress.answered}/{progress.total}
                  </div>
                </div>
                <div
                  style={{
                    padding: '16px 18px',
                    borderRadius: 18,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    这一步的意义
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>让后续题目不再一刀切</div>
                </div>
              </div>
            </motion.div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {questions.map((question, index) => (
                <motion.section
                  key={question.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.04, 0.28) }}
                  style={{
                    padding: '24px 22px',
                    borderRadius: 24,
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  {(() => {
                    const isAIQuestion = question.id.startsWith('ai_clarifier_');
                    return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 11, color: question.isClarifier ? '#FFD166' : 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        {question.section}
                      </div>
                      <h2 style={{ fontSize: 20, margin: '6px 0 0', fontFamily: 'var(--font-display)' }}>
                        {question.title}
                      </h2>
                    </div>
                    {question.isClarifier && (
                      <div
                        style={{
                          alignSelf: 'start',
                          padding: '6px 10px',
                          borderRadius: 999,
                          fontSize: 11,
                          border: isAIQuestion ? '1px solid rgba(100,255,218,0.18)' : '1px solid rgba(255,209,102,0.18)',
                          color: isAIQuestion ? '#64FFDA' : '#FFD166',
                          background: isAIQuestion ? 'rgba(100,255,218,0.08)' : 'rgba(255,209,102,0.08)',
                        }}
                      >
                        {isAIQuestion ? 'AI 追问' : '自动补问'}
                      </div>
                    )}
                    {question.required && (
                      <div
                        style={{
                          alignSelf: 'start',
                          padding: '6px 10px',
                          borderRadius: 999,
                          fontSize: 11,
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: 'var(--text-tertiary)',
                        }}
                      >
                        必答
                      </div>
                    )}
                  </div>
                    );
                  })()}

                  <p style={{ margin: '0 0 8px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>{question.prompt}</p>
                  <p style={{ margin: '0 0 16px', color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.7 }}>{question.helper}</p>

                  <textarea
                    value={humanMapAnswers[question.id] || ''}
                    onChange={(event) => handleChange(question.id, event.target.value)}
                    placeholder={question.placeholder}
                    style={{
                      width: '100%',
                      minHeight: 124,
                      resize: 'vertical',
                      borderRadius: 18,
                      padding: '16px 18px',
                      background: 'rgba(8,10,18,0.78)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: 'var(--text-primary)',
                      fontSize: 14,
                      lineHeight: 1.8,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                    {question.examples.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => {
                          const current = humanMapAnswers[question.id]?.trim();
                          handleChange(question.id, current ? `${current}\n- ${example}` : example);
                        }}
                        style={{
                          border: '1px solid rgba(255,255,255,0.08)',
                          background: 'rgba(255,255,255,0.03)',
                          color: 'var(--text-secondary)',
                          borderRadius: 999,
                          padding: '8px 12px',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </motion.section>
              ))}
            </div>

            {error && (
              <div
                style={{
                  marginTop: 18,
                  padding: '14px 16px',
                  borderRadius: 16,
                  color: '#FFB4AB',
                  background: 'rgba(255,107,107,0.08)',
                  border: '1px solid rgba(255,107,107,0.18)',
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => navigate('/assessment')}
                style={{
                  borderRadius: 16,
                  padding: '14px 18px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                稍后再做
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleComplete}
                style={{
                  borderRadius: 18,
                  padding: '14px 26px',
                  border: 'none',
                  background: `linear-gradient(135deg, ${meta.accent}, #f7f1d1)`,
                  color: '#0d1117',
                  fontWeight: 700,
                  cursor: 'pointer',
                  minWidth: 220,
                }}
              >
                {isSubmitting ? '正在生成你的定制题路…' : '生成我的定制题路'}
              </button>
            </div>
          </div>

          <div style={{ position: 'sticky', top: 88, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <section
              style={{
                padding: '22px 20px',
                borderRadius: 24,
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
                作答锚点
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {HUMAN_MAP_ANSWERING_GUIDE.map((item) => (
                  <div key={item} style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.8 }}>
                    {item}
                  </div>
                ))}
              </div>
            </section>

            <section
              style={{
                padding: '22px 20px',
                borderRadius: 24,
                background:
                  aiStatus === 'error'
                    ? 'linear-gradient(180deg, rgba(255,107,107,0.10), rgba(255,255,255,0.02))'
                    : 'linear-gradient(180deg, rgba(100,255,218,0.10), rgba(255,255,255,0.02))',
                border: aiStatus === 'error'
                  ? '1px solid rgba(255,107,107,0.18)'
                  : '1px solid rgba(100,255,218,0.18)',
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
                AI 定制追问
              </div>

              {!aiGenerationReady && (
                <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: 13 }}>
                  再回答 {Math.max((mode === 'detailed' ? 4 : 3) - baseAnswered, 0)} 道基础题后，GLM 5.1 会开始帮你生成更贴身的追问题。
                </p>
              )}

              {aiGenerationReady && aiStatus === 'loading' && (
                <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: 13 }}>
                  正在根据你的阶段、主线和摇摆点生成 AI 追问，让后面的题更像是在问“你”。
                </p>
              )}

              {aiGenerationReady && humanMapAIQuestions.length > 0 && (
                <>
                  <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: 13 }}>
                    已生成 {humanMapAIQuestions.length} 道 AI 澄清题。它们会专门补你当前最容易模糊、最需要落地的地方。
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {humanMapAIQuestions.map((question) => (
                      <div
                        key={question.id}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 16,
                          background: 'rgba(10,14,26,0.46)',
                          border: '1px solid rgba(255,255,255,0.06)',
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#64FFDA' }}>{question.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 5, lineHeight: 1.7 }}>
                          {question.helper}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {aiGenerationReady && aiStatus === 'idle' && humanMapAIQuestions.length === 0 && (
                <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: 13 }}>
                  这轮基础输入已经相对清晰，系统先不额外加题，避免为了追问而追问。
                </p>
              )}

              {aiGenerationReady && aiStatus === 'error' && (
                <p style={{ margin: 0, color: '#FFB4AB', lineHeight: 1.8, fontSize: 13 }}>
                  {aiError || 'AI 追问暂时生成失败，但你仍然可以继续完成前置建模。'}
                </p>
              )}
            </section>

            <section
              style={{
                padding: '22px 20px',
                borderRadius: 24,
                background:
                  'linear-gradient(180deg, rgba(179,136,255,0.10), rgba(255,255,255,0.02))',
                border: '1px solid rgba(179,136,255,0.18)',
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
                实时预览
              </div>
              {preview ? (
                <>
                  <h3 style={{ fontSize: 18, margin: '0 0 8px', fontFamily: 'var(--font-display)' }}>
                    {preview.displayName === '你' ? '你的路由初稿' : `${preview.displayName} 的路由初稿`}
                  </h3>
                  <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: 13 }}>
                    {preview.summary}
                  </p>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                    {preview.signalScores.slice(0, 3).map((signal) => (
                      <div
                        key={signal.id}
                        style={{
                          padding: '7px 10px',
                          borderRadius: 999,
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {signal.label}
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {preview.dimensionPlans.slice(0, 4).map((plan) => (
                      <div
                        key={plan.dimensionId}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 18,
                          background: 'rgba(10,14,26,0.46)',
                          border: '1px solid rgba(255,255,255,0.06)',
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700 }}>
                          {plan.priority} · {plan.dimensionId}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                          {plan.questionIds.length} 题 · {plan.reason}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: 13 }}>
                  至少回答 2 题后，我会开始推测你的优先维度、信号主线和题路顺序。
                </p>
              )}
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}
