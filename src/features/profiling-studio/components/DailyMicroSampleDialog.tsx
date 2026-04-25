/**
 * DailyMicroSampleDialog — 今日快照弹窗
 *
 * 全屏对话框：展示 3 道微采样题目，支持单选和 Likert5。
 * 使用项目已有的 Neuro-morphic 风格（glass-card、accent colors）。
 */
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from '../lib/motion-lite';
import type { MicroSampleQuestion, MicroSampleAnswer } from '../types';
import { createMicroSample } from '../api/microSamples';
import { useMicroSampleStore } from '../store/microSample';
import { useAuthStore } from '../store/auth';
import { getTodayDateString } from '../utils/microSampleUtils';
import { insforge } from '../api/insforge';

interface Props {
  open: boolean;
  onClose: () => void;
  questions: MicroSampleQuestion[];
}

const LIKERT_LABELS = ['完全不同意', '不同意', '一般', '同意', '非常同意'];

export default function DailyMicroSampleDialog({ open, onClose, questions }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<MicroSampleAnswer[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const user = useAuthStore((s) => s.user);
  const { setTodayRecord, addToLocalHistory } = useMicroSampleStore();

  const currentQ = questions[currentIndex];
  const total = questions.length;
  const currentAnswer = answers.find((a) => a.questionId === currentQ?.id);
  const isLast = currentIndex === total - 1;

  const handleSelect = useCallback(
    (value: string) => {
      setAnswers((prev) => {
        const existing = prev.findIndex((a) => a.questionId === currentQ.id);
        const entry: MicroSampleAnswer = { questionId: currentQ.id, answerValue: value };
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = entry;
          return next;
        }
        return [...prev, entry];
      });
    },
    [currentQ],
  );

  const handleNext = () => {
    if (isLast) {
      handleSubmit();
    } else {
      setCurrentIndex((i) => i + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  };

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    setErrorMsg('');

    const isLoggedIn = !!insforge;
    const relatedDimensionIds = [...new Set(questions.map((q) => q.dimensionId))];

    try {
      const record = await createMicroSample(
        {
          userId: user.id,
          date: getTodayDateString(),
          questions,
          answers,
          relatedDimensionIds,
        },
        isLoggedIn,
      );

      setTodayRecord(record);

      // 如果是本地记录，也存到 localHistory
      if (record.id.startsWith('local_')) {
        addToLocalHistory(record);
      }

      setSubmitting(false);
      setCurrentIndex(0);
      setAnswers([]);
      onClose();
    } catch {
      setSubmitting(false);
      setErrorMsg('保存失败，请稍后重试');
    }
  };

  const handleClose = () => {
    setCurrentIndex(0);
    setAnswers([]);
    setErrorMsg('');
    onClose();
  };

  if (!currentQ) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(10, 14, 26, 0.88)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            style={{
              width: '100%', maxWidth: 560, margin: '0 1rem',
              background: 'rgba(20, 27, 45, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 20, overflow: 'hidden',
              position: 'relative',
            }}
          >
            {/* Top accent line */}
            <div style={{
              position: 'absolute', top: 0, left: '10%', right: '10%', height: 2,
              background: 'linear-gradient(90deg, transparent, var(--accent-cyan), transparent)',
              opacity: 0.5,
            }} />

            {/* Header */}
            <div style={{
              padding: '28px 32px 0', display: 'flex',
              alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <h3 style={{
                  fontFamily: 'var(--font-display)', fontWeight: 700,
                  fontSize: '1.15rem', marginBottom: 4,
                }}>
                  今日快照
                </h3>
                <p style={{
                  fontSize: '0.76rem', color: 'var(--text-tertiary)',
                }}>
                  第 {currentIndex + 1} 题 / 共 {total} 题
                </p>
              </div>
              <button
                onClick={handleClose}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-tertiary)',
                  fontSize: '1.2rem', cursor: 'pointer', padding: 8,
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
              >
                ✕
              </button>
            </div>

            {/* Progress bar */}
            <div style={{ padding: '16px 32px 0' }}>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${((currentIndex + 1) / total) * 100}%` }}
                />
              </div>
            </div>

            {/* Question body */}
            <div style={{ padding: '28px 32px 32px', minHeight: 320 }}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentQ.id}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.25 }}
                >
                  {/* Prompt */}
                  <p style={{
                    fontSize: '1.05rem', lineHeight: 1.8,
                    fontWeight: 500, marginBottom: 28,
                    color: 'var(--text-primary)',
                  }}>
                    {currentQ.prompt}
                  </p>

                  {/* Options */}
                  {currentQ.type === 'single_choice' && currentQ.options && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {currentQ.options.map((opt, i) => {
                        const selected = currentAnswer?.answerValue === opt;
                        return (
                          <motion.button
                            key={i}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => handleSelect(opt)}
                            style={{
                              display: 'block', width: '100%', textAlign: 'left',
                              padding: '14px 18px',
                              background: selected
                                ? 'rgba(100, 255, 218, 0.08)'
                                : 'rgba(255, 255, 255, 0.03)',
                              border: `1px solid ${selected
                                ? 'rgba(100, 255, 218, 0.3)'
                                : 'rgba(255, 255, 255, 0.08)'}`,
                              borderRadius: 12, cursor: 'pointer',
                              color: selected ? 'var(--accent-cyan)' : 'var(--text-primary)',
                              fontSize: '0.9rem', lineHeight: 1.6,
                              transition: 'all 0.25s ease',
                              fontFamily: 'var(--font-sans)',
                            }}
                          >
                            {opt}
                          </motion.button>
                        );
                      })}
                    </div>
                  )}

                  {currentQ.type === 'likert5' && (
                    <div style={{
                      display: 'flex', gap: 8, justifyContent: 'center',
                      flexWrap: 'wrap',
                    }}>
                      {LIKERT_LABELS.map((label, i) => {
                        const value = String(i + 1);
                        const selected = currentAnswer?.answerValue === value;
                        return (
                          <motion.button
                            key={value}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleSelect(value)}
                            style={{
                              flex: '1 1 auto', minWidth: 80,
                              padding: '14px 10px',
                              background: selected
                                ? 'rgba(100, 255, 218, 0.10)'
                                : 'rgba(255, 255, 255, 0.03)',
                              border: `1px solid ${selected
                                ? 'rgba(100, 255, 218, 0.35)'
                                : 'rgba(255, 255, 255, 0.08)'}`,
                              borderRadius: 12, cursor: 'pointer',
                              color: selected ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                              fontSize: '0.76rem', lineHeight: 1.3,
                              textAlign: 'center',
                              transition: 'all 0.25s ease',
                              fontFamily: 'var(--font-sans)',
                              fontWeight: selected ? 600 : 400,
                            }}
                          >
                            {label}
                          </motion.button>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer buttons */}
            <div style={{
              padding: '0 32px 28px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              {currentIndex > 0 ? (
                <button
                  onClick={handlePrev}
                  className="btn-secondary"
                  style={{ padding: '10px 22px', fontSize: '0.85rem' }}
                >
                  ← 上一步
                </button>
              ) : (
                <div />
              )}

              {errorMsg && (
                <p style={{
                  color: '#ff6b6b', fontSize: '0.78rem',
                  position: 'absolute', bottom: 62, left: 32, right: 32,
                  textAlign: 'center',
                }}>
                  {errorMsg}
                </p>
              )}

              <button
                onClick={handleNext}
                disabled={!currentAnswer || submitting}
                className="btn-primary"
                style={{
                  padding: '10px 28px', fontSize: '0.85rem',
                  opacity: !currentAnswer || submitting ? 0.4 : 1,
                  cursor: !currentAnswer || submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting
                  ? '提交中…'
                  : isLast
                    ? '提交 ✦'
                    : '下一题 →'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
