import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from '../lib/motion-lite';
import { generateDynamicScript, type ProfileAxis } from '../data/avg-dynamic';
import { avgScript as fallbackScript } from '../data/avg-script';
import { useAssessmentStore } from '../store';

export default function AVGPage() {
  const navigate = useNavigate();
  const { setAVGChoice, completeAVG, avgProfile } = useAssessmentStore();

  // Generate personalized script if profile exists, otherwise fallback
  const script = useMemo(() => {
    if (avgProfile && Object.keys(avgProfile).length >= 5) {
      return generateDynamicScript(avgProfile as unknown as ProfileAxis);
    }
    return fallbackScript;
  }, [avgProfile]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const [showChoices, setShowChoices] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const [isEntering, setIsEntering] = useState(true);

  const currentNode = script[currentIndex];
  const isLastNode = currentIndex === script.length - 1;

  // Entry animation
  useEffect(() => {
    const t = setTimeout(() => setIsEntering(false), 800);
    return () => clearTimeout(t);
  }, []);

  // Typewriter effect
  useEffect(() => {
    if (isEntering || !currentNode) return;
    setDisplayedText('');
    setShowChoices(false);
    setIsTyping(true);

    const text = currentNode.narrative;
    let idx = 0;

    const interval = setInterval(() => {
      idx++;
      setDisplayedText(text.slice(0, idx));
      if (idx >= text.length) {
        clearInterval(interval);
        setIsTyping(false);
        setTimeout(() => setShowChoices(true), 400);
      }
    }, 35);

    return () => clearInterval(interval);
  }, [currentIndex, currentNode, isEntering]);

  // Skip typewriter on click
  const skipTypewriter = useCallback(() => {
    if (isTyping && currentNode) {
      setDisplayedText(currentNode.narrative);
      setIsTyping(false);
      setTimeout(() => setShowChoices(true), 200);
    }
  }, [isTyping, currentNode]);

  const handleChoice = (choiceId: string) => {
    setAVGChoice(currentNode.id, choiceId);
    setIsFading(true);

    setTimeout(() => {
      if (isLastNode) {
        completeAVG();
        navigate('/assessment');
      } else {
        setCurrentIndex((prev) => prev + 1);
        setIsFading(false);
      }
    }, 700);
  };

  const handleGoBack = () => {
    if (currentIndex > 0) {
      setIsFading(true);
      setTimeout(() => {
        setCurrentIndex((prev) => prev - 1);
        setIsFading(false);
      }, 500);
    }
  };

  if (!currentNode) return null;

  // Determine if this is a personalized journey
  const isPersonalized = avgProfile && Object.keys(avgProfile).length >= 5;

  return (
    <div className="avg-scene" onClick={isTyping ? skipTypewriter : undefined}>
      {/* Background gradient */}
      <div
        className="absolute inset-0 transition-all duration-1000"
        style={{ background: currentNode.backgroundGradient }}
      />

      {/* Background emoji */}
      {currentNode.backgroundEmoji && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[200px] opacity-[0.03] select-none">{currentNode.backgroundEmoji}</span>
        </div>
      )}

      {/* Entry overlay */}
      <AnimatePresence>
        {isEntering && (
          <motion.div
            className="absolute inset-0 z-50 flex items-center justify-center"
            style={{ background: 'var(--bg-primary)' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center"
            >
              <div className="text-5xl mb-4">🏙️</div>
              <h2 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
                城市漫游者
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                {isPersonalized ? '为你量身定制的 8 个情境' : '一个普通周六的 8 个选择'}
              </p>
              {isPersonalized && (
                <div style={{
                  marginTop: 12, padding: '4px 16px', borderRadius: 20,
                  background: 'rgba(124,77,255,0.1)', display: 'inline-block',
                  fontSize: 11, color: '#BB86FC',
                }}>
                  个性化旅途
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 z-30">
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${((currentIndex + (isFading ? 1 : 0)) / script.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Back button — top left */}
      <button
        onClick={(e) => { e.stopPropagation(); navigate('/assessment'); }}
        className="absolute top-3 left-4 z-30"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderRadius: 20,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'var(--text-tertiary)', fontSize: 12,
          cursor: 'pointer', transition: 'all .3s',
        }}
        onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.12)'; }}
        onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
        返回
      </button>

      {/* Node title */}
      <motion.div
        key={`title-${currentNode.id}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute top-8 left-0 right-0 text-center z-20"
      >
        <span className="badge-accent text-xs">
          {currentIndex + 1} / {script.length} · {currentNode.title}
        </span>
      </motion.div>

      {/* Narrative text */}
      <motion.div
        key={`text-${currentNode.id}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="relative z-20 avg-narrative"
      >
        <p style={{ whiteSpace: 'pre-line' }}>
          {displayedText}
          {isTyping && <span className="typewriter-cursor" />}
        </p>
      </motion.div>

      {/* Choices */}
      <AnimatePresence>
        {showChoices && !isFading && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="relative z-20 avg-choices mt-6"
          >
            {currentNode.choices.map((choice, i) => (
              <motion.button
                key={choice.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="avg-choice-card"
                onClick={(e) => {
                  e.stopPropagation();
                  handleChoice(choice.id);
                }}
              >
                <span style={{ color: 'var(--text-tertiary)', marginRight: '0.75rem', fontSize: '0.8rem' }}>
                  {String.fromCharCode(65 + i)}
                </span>
                {choice.text}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fade-to-black overlay */}
      <AnimatePresence>
        {isFading && (
          <motion.div
            className="absolute inset-0 z-40"
            style={{ background: 'var(--bg-primary)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          />
        )}
      </AnimatePresence>

      {/* Go back button — bottom left */}
      {currentIndex > 0 && showChoices && !isFading && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={(e) => { e.stopPropagation(); handleGoBack(); }}
          className="absolute bottom-6 left-4 z-30"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 14px', borderRadius: 20,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.06)',
            color: 'var(--text-tertiary)', fontSize: 12,
            cursor: 'pointer', transition: 'all .3s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          上一题
        </motion.button>
      )}

      {/* Footer hint */}
      {isTyping && (
        <div className="absolute bottom-6 text-center w-full z-20">
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>点击任意处跳过</span>
        </div>
      )}
    </div>
  );
}
