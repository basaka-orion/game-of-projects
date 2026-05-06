import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from '../lib/motion-lite';
import { useAssessmentStore } from '../store';
import { DIMENSIONS } from '../data/dimensions';
import { generateTopologyProfile } from '../engine/profiling';
import { buildSelfAgentConstitutionFromSandbox } from '../engine/self-agent-constitution';
import { buildQuestionTraceSnapshots } from '../engine/question-trace';
import { streamAISummary } from '../api/ai-summary';
import { buildOpenBasakaExportBundle, downloadOpenBasakaExportBundle } from '../utils/openbasaka-export';
import { buildRemotionNarrativeBundle, downloadRemotionNarrativeBundle } from '../utils/remotion-bundle';
import { importOpenBasakaExportBundle } from '../../../lib/boss/profiling/service';
import { navigateSandboxTab, type SandboxTabId } from '../../../views/SandboxMap/navigation';
import RemotionNarrativeStage from '../components/RemotionNarrativeStage';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, ResponsiveContainer,
} from 'recharts';
import { SAGE_DEFINITIONS } from '../data/sages';
import type { QuestionPresentationSnapshot } from '../types';

function formatTraceTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', { hour12: false });
}

const TRACE_CITATION_GROUP_REGEX = /【(Q\d+(?:\s*[、,，]\s*Q\d+)*)】/g;

function splitTraceRefs(value: string): string[] {
  return value
    .split(/[、,，]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeInsightText(value: string): string {
  return value
    .replace(/【(Q\d+(?:\s*[、,，]\s*Q\d+)*)】/g, '')
    .replace(/\*\*/g, '')
    .replace(/^[-•]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function SageProgressRow() {
  const sageSessions = useAssessmentStore(s => s.sageSessions);
  const completedCount = Object.values(sageSessions).filter(s => s?.status === 'completed').length;
  const activeCount = Object.values(sageSessions).filter(s => s?.status === 'active').length;

  if (completedCount === 0 && activeCount === 0) return null;

  return (
    <div style={{
      marginBottom: 20, padding: '14px 20px', borderRadius: 14,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 6, marginBottom: 10,
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          智者对话进度
        </span>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 10,
          background: 'rgba(100,255,218,0.1)', color: '#64FFDA',
        }}>
          {completedCount}/{SAGE_DEFINITIONS.length}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
        {SAGE_DEFINITIONS.map(sage => {
          const session = sageSessions[sage.id];
          const isComplete = session?.status === 'completed';
          const isActive = session?.status === 'active';
          return (
            <div key={sage.id} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 12,
              background: isComplete ? `${sage.color}15` : isActive ? `${sage.color}08` : 'rgba(255,255,255,0.02)',
              border: `1px solid ${isComplete ? `${sage.color}30` : isActive ? `${sage.color}15` : 'rgba(255,255,255,0.04)'}`,
              opacity: isComplete || isActive ? 1 : 0.4,
            }}>
              <span style={{ fontSize: 12 }}>{sage.icon}</span>
              <span style={{ fontSize: 10, color: isComplete ? sage.color : 'var(--text-tertiary)' }}>
                {sage.name}
                {isComplete && ' ✓'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProductConceptCards() {
  const concepts = useAssessmentStore(s => s.productConcepts);
  const plans = useAssessmentStore(s => s.implementationPlans);

  if (concepts.length === 0) return null;

  return (
    <div style={{
      marginBottom: 20, padding: '18px 20px', borderRadius: 14,
      background: 'linear-gradient(135deg, rgba(179,136,255,0.04), rgba(100,255,218,0.02))',
      border: '1px solid rgba(179,136,255,0.1)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 14,
      }}>
        <span style={{ fontSize: 16 }}>💎</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#B388FF' }}>
          产品构想
        </span>
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 10,
          background: 'rgba(179,136,255,0.1)', color: '#B388FF',
        }}>
          {concepts.length} 个方向
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {concepts.map(c => {
          const plan = plans.find(p => p.productId === c.id);
          return (
            <div key={c.id} style={{
              padding: '14px 16px', borderRadius: 12,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{
                  fontSize: 9, padding: '2px 6px', borderRadius: 6,
                  background: 'rgba(179,136,255,0.1)', color: '#B388FF',
                }}>
                  {c.productType === 'workflow' ? '流程' : c.productType === 'digital_tool' ? '工具' : c.productType}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{c.workingTitle}</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 6px', lineHeight: 1.6 }}>
                {c.corePromise}
              </p>
              {c.keyFeatures.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {c.keyFeatures.slice(0, 3).map((f, i) => (
                    <span key={i} style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 8,
                      background: 'rgba(100,255,218,0.06)', color: 'var(--text-tertiary)',
                    }}>{f}</span>
                  ))}
                </div>
              )}
              {plan && (
                <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-tertiary)' }}>
                  ⏱️ {plan.horizonMonths} 个月 · {plan.effortEstimate === 'low' ? '低努力' : plan.effortEstimate === 'medium' ? '中等努力' : '高努力'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Shared layout constants ─── */
const OUTER: React.CSSProperties = {
  maxWidth: 860,
  margin: '0 auto',
  padding: '0 24px',
};

const SECTION_GAP = 56; // px between sections
const TRACE_CARD_PREVIEW_COUNT = 6;
type StageAnchorId = 'remotion' | 'trace' | 'ai' | 'topology';

export default function ReportPage() {
  const navigate = useNavigate();
  const {
    topology, completedDimensions, avgCompleted, gameResults, matrixResults,
    answers, avgChoices, avgProfile, catResponses, setTopology,
    setSelfAgentConstitution,
    humanMapMode,
    humanMapAnswers,
    humanMapBlueprint,
    humanMapAIQuestions,
    questionPresentationSnapshots,
    sageSessions: allSageSessions,
    sageInsights,
    personalOS,
    productJobs,
    productConcepts,
    implementationPlans,
  } = useAssessmentStore();
  const [expandedDim, setExpandedDim] = useState<string | null>(null);
  const [expandedTrait, setExpandedTrait] = useState<string | null>(null);

  // AI Summary state
  const [aiSummary, setAiSummary] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<'idle' | 'done' | 'error'>('idle');
  const [remotionExportStatus, setRemotionExportStatus] = useState<'idle' | 'done' | 'error'>('idle');
  const [renderVideoStatus, setRenderVideoStatus] = useState<'idle' | 'rendering' | 'done' | 'error'>('idle');
  const [renderVideoProgress, setRenderVideoProgress] = useState<{
    phase: 'bundling' | 'rendering' | 'done' | 'error';
    progress: number;
    message?: string;
    renderedFrames?: number;
    encodedFrames?: number;
    outputPath?: string;
  } | null>(null);
  const [applyStatus, setApplyStatus] = useState<'idle' | 'done' | 'error' | 'applying'>('idle');
  const [traceDimensionFilter, setTraceDimensionFilter] = useState<'all' | string>('all');
  const [tracePersonalizedOnly, setTracePersonalizedOnly] = useState(false);
  const [traceExpanded, setTraceExpanded] = useState(false);
  const [highlightedTraceId, setHighlightedTraceId] = useState<string | null>(null);
  const [highlightedSummaryLine, setHighlightedSummaryLine] = useState<number | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const summaryLineRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const traceCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const remotionSectionRef = useRef<HTMLElement | null>(null);
  const traceSectionRef = useRef<HTMLElement | null>(null);
  const aiSectionRef = useRef<HTMLElement | null>(null);
  const topologySectionRef = useRef<HTMLElement | null>(null);
  const questionTraceSnapshots = useMemo<QuestionPresentationSnapshot[]>(() => {
    return buildQuestionTraceSnapshots({
      storedSnapshots: questionPresentationSnapshots,
      answers,
      catResponses,
      humanMapMode,
      humanMapAnswers,
      humanMapAIQuestions,
      humanMapBlueprint,
      matrixResults,
    });
  }, [answers, catResponses, humanMapAnswers, humanMapAIQuestions, humanMapBlueprint, humanMapMode, matrixResults, questionPresentationSnapshots]);
  const traceReferenceEntries = useMemo(() => (
    questionTraceSnapshots.map((snapshot, index) => ({
      refId: `Q${index + 1}`,
      snapshot,
    }))
  ), [questionTraceSnapshots]);
  const traceReferenceMap = useMemo(() => (
    Object.fromEntries(traceReferenceEntries.map((entry) => [entry.refId, entry.snapshot]))
  ), [traceReferenceEntries]);
  const traceRefBySnapshotId = useMemo(() => (
    Object.fromEntries(traceReferenceEntries.map((entry) => [entry.snapshot.id, entry.refId]))
  ), [traceReferenceEntries]);
  const traceDimensions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const snapshot of questionTraceSnapshots) {
      if (!seen.has(snapshot.dimensionId)) {
        seen.set(snapshot.dimensionId, snapshot.dimensionName);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [questionTraceSnapshots]);
  const filteredTraceSnapshots = useMemo(() => {
    return questionTraceSnapshots.filter((snapshot) => {
      if (traceDimensionFilter !== 'all' && snapshot.dimensionId !== traceDimensionFilter) return false;
      if (tracePersonalizedOnly && !snapshot.personalized) return false;
      return true;
    });
  }, [questionTraceSnapshots, traceDimensionFilter, tracePersonalizedOnly]);
  const visibleTraceSnapshots = useMemo(() => (
    traceExpanded ? filteredTraceSnapshots : filteredTraceSnapshots.slice(0, TRACE_CARD_PREVIEW_COUNT)
  ), [filteredTraceSnapshots, traceExpanded]);
  const personalizedTraceCount = useMemo(
    () => questionTraceSnapshots.filter((snapshot) => snapshot.personalized).length,
    [questionTraceSnapshots],
  );
  const traceDimensionCount = traceDimensions.length;
  const aiReferencedTraceRefs = useMemo(() => {
    const matches = Array.from(aiSummary.matchAll(TRACE_CITATION_GROUP_REGEX));
    const refs = matches.flatMap((match) => splitTraceRefs(match[1] || ''));
    return Array.from(new Set(refs.filter((refId) => Boolean(traceReferenceMap[refId]))));
  }, [aiSummary, traceReferenceMap]);
  const aiReferencedTraceIds = useMemo(() => (
    new Set(aiReferencedTraceRefs.map((refId) => traceReferenceMap[refId]?.id).filter(Boolean))
  ), [aiReferencedTraceRefs, traceReferenceMap]);
  const aiInsightCards = useMemo(() => {
    const cards: Array<{
      id: string;
      lineIndex: number;
      section: string;
      text: string;
      refs: string[];
    }> = [];
    if (!aiSummary.trim()) return cards;

    let currentSection = 'AI 全方位自我画像';
    for (const [index, rawLine] of aiSummary.split('\n').entries()) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('## ')) {
        currentSection = normalizeInsightText(line.replace(/^##\s+/, ''));
        continue;
      }
      if (line.startsWith('### ')) {
        currentSection = normalizeInsightText(line.replace(/^###\s+/, ''));
        continue;
      }

      const refs = Array.from(line.matchAll(TRACE_CITATION_GROUP_REGEX))
        .flatMap((match) => splitTraceRefs(match[1] || ''))
        .filter((refId, position, array) => Boolean(traceReferenceMap[refId]) && array.indexOf(refId) === position);
      if (refs.length === 0) continue;

      const text = normalizeInsightText(line);
      if (!text) continue;

      cards.push({
        id: `insight-${index}`,
        lineIndex: index,
        section: currentSection,
        text,
        refs,
      });
    }

    return cards.slice(0, 10);
  }, [aiSummary, traceReferenceMap]);
  const insightCardsByTraceId = useMemo(() => {
    const mapping: Record<string, typeof aiInsightCards> = {};
    for (const card of aiInsightCards) {
      for (const refId of card.refs) {
        const snapshot = traceReferenceMap[refId];
        if (!snapshot) continue;
        mapping[snapshot.id] = [...(mapping[snapshot.id] || []), card];
      }
    }
    return mapping;
  }, [aiInsightCards, traceReferenceMap]);
  const generatedSelfAgentConstitution = useMemo(() => {
    if (!topology) return null;
    return buildSelfAgentConstitutionFromSandbox({
      topology,
      matrixResults,
      sageInsights,
      personalOS,
    });
  }, [topology, matrixResults, sageInsights, personalOS]);

  useEffect(() => {
    if (!generatedSelfAgentConstitution) return;
    setSelfAgentConstitution(generatedSelfAgentConstitution);
  }, [generatedSelfAgentConstitution, setSelfAgentConstitution]);

  const reportExportInput = useMemo(() => {
    if (!topology) return null;
    return {
      topology,
      answers,
      avgChoices,
      avgProfile,
      avgCompleted,
      completedDimensions,
      gameResults,
      matrixResults,
      catResponses,
      sageSessions: allSageSessions,
      sageInsights,
      personalOS,
      productJobs,
      productConcepts,
      implementationPlans,
      selfAgentConstitution: generatedSelfAgentConstitution,
      aiSummary,
      humanMapBlueprint,
      questionPresentationSnapshots: questionTraceSnapshots,
    };
  }, [
    topology,
    answers,
    avgChoices,
    avgProfile,
    avgCompleted,
    completedDimensions,
    gameResults,
    matrixResults,
    catResponses,
    allSageSessions,
    sageInsights,
    personalOS,
    productJobs,
    productConcepts,
    implementationPlans,
    generatedSelfAgentConstitution,
    aiSummary,
    humanMapBlueprint,
    questionTraceSnapshots,
  ]);
  const remotionNarrativeBundle = useMemo(() => {
    if (!reportExportInput) return null;
    try {
      return buildRemotionNarrativeBundle(reportExportInput);
    } catch {
      return null;
    }
  }, [reportExportInput]);

  useEffect(() => {
    if (!window.electronAPI?.onRemotionRenderProgress) return undefined;
    return window.electronAPI.onRemotionRenderProgress((progress) => {
      setRenderVideoProgress(progress);
      if (progress.phase === 'bundling' || progress.phase === 'rendering') {
        setRenderVideoStatus('rendering');
        return;
      }
      if (progress.phase === 'done') {
        setRenderVideoStatus('done');
        return;
      }
      if (progress.phase === 'error') {
        setRenderVideoStatus('error');
      }
    });
  }, []);

  useEffect(() => {
    if (renderVideoStatus !== 'done' && renderVideoStatus !== 'error') return undefined;
    const timer = window.setTimeout(() => {
      setRenderVideoStatus('idle');
      if (renderVideoStatus === 'error') {
        setRenderVideoProgress(null);
      }
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [renderVideoStatus]);

  useEffect(() => {
    setTraceExpanded(false);
  }, [traceDimensionFilter, tracePersonalizedOnly]);

  useEffect(() => {
    if (!highlightedTraceId) return undefined;
    const timer = window.setTimeout(() => setHighlightedTraceId(null), 2800);
    return () => window.clearTimeout(timer);
  }, [highlightedTraceId]);

  useEffect(() => {
    if (highlightedSummaryLine == null) return undefined;
    const timer = window.setTimeout(() => setHighlightedSummaryLine(null), 2800);
    return () => window.clearTimeout(timer);
  }, [highlightedSummaryLine]);

  const focusTraceRef = useCallback((refId: string) => {
    const snapshot = traceReferenceMap[refId];
    if (!snapshot) return;

    setTraceDimensionFilter('all');
    setTracePersonalizedOnly(false);
    setTraceExpanded(true);
    setHighlightedTraceId(snapshot.id);

    window.setTimeout(() => {
      traceCardRefs.current[snapshot.id]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 180);
  }, [traceReferenceMap]);

  const focusSummaryLine = useCallback((lineIndex: number) => {
    setHighlightedSummaryLine(lineIndex);
    window.setTimeout(() => {
      const container = summaryRef.current;
      const lineNode = summaryLineRefs.current[lineIndex];
      if (!container || !lineNode) return;
      container.scrollTo({
        top: Math.max(0, lineNode.offsetTop - 56),
        behavior: 'smooth',
      });
    }, 80);
  }, []);

  const scrollToStageAnchor = useCallback((anchorId: StageAnchorId) => {
    const refMap: Record<StageAnchorId, HTMLElement | null> = {
      remotion: remotionSectionRef.current,
      trace: traceSectionRef.current,
      ai: aiSectionRef.current,
      topology: topologySectionRef.current,
    };
    refMap[anchorId]?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, []);

  const openSandboxSurface = useCallback((tab: SandboxTabId) => {
    window.location.hash = '#/sandbox';
    window.setTimeout(() => navigateSandboxTab(tab), 140);
    window.setTimeout(() => navigateSandboxTab(tab), 420);
  }, []);

  const renderInlineSummaryText = useCallback((text: string, lineKey: string) => {
    const parts = text.split(TRACE_CITATION_GROUP_REGEX);
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        const refIds = splitTraceRefs(part);
        return (
          <span key={`${lineKey}:refs:${index}`} style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', marginLeft: 4 }}>
            {refIds.map((refId) => (
              <button
                key={`${lineKey}:${refId}`}
                onClick={() => focusTraceRef(refId)}
                style={{
                  padding: '1px 8px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,209,102,0.24)',
                  background: 'rgba(255,209,102,0.1)',
                  color: '#FFD166',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {refId}
              </button>
            ))}
          </span>
        );
      }

      const boldParts = part.split(/\*\*(.+?)\*\*/g);
      return boldParts.map((boldPart, boldIndex) => (
        boldIndex % 2 === 1
          ? <strong key={`${lineKey}:bold:${index}:${boldIndex}`} style={{ color: 'var(--text-primary)' }}>{boldPart}</strong>
          : <span key={`${lineKey}:text:${index}:${boldIndex}`}>{boldPart}</span>
      ));
    });
  }, [focusTraceRef]);

  const handleGenerateAISummary = useCallback(async () => {
    if (!topology || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    setAiSummary('');

    try {
      const generator = streamAISummary({
        topology,
        completedDimensions,
        avgCompleted,
        gameResults,
        matrixResults,
        catResponses,
        humanMapBlueprint,
        questionPresentationSnapshots: questionTraceSnapshots,
      });

      for await (const chunk of generator) {
        setAiSummary(prev => prev + chunk);
        if (summaryRef.current) {
          summaryRef.current.scrollTop = summaryRef.current.scrollHeight;
        }
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : '生成失败，请重试');
    } finally {
      setAiLoading(false);
    }
  }, [topology, completedDimensions, avgCompleted, gameResults, matrixResults, catResponses, humanMapBlueprint, questionTraceSnapshots, aiLoading]);

  const handleExportOpenBasaka = useCallback(() => {
    if (!reportExportInput) return;

    try {
      const bundle = buildOpenBasakaExportBundle(reportExportInput);
      downloadOpenBasakaExportBundle(bundle);
      setExportStatus('done');
      window.setTimeout(() => setExportStatus('idle'), 2400);
    } catch {
      setExportStatus('error');
      window.setTimeout(() => setExportStatus('idle'), 2400);
    }
  }, [
    reportExportInput,
  ]);

  const handleExportRemotionBundle = useCallback(() => {
    if (!remotionNarrativeBundle) return;

    try {
      downloadRemotionNarrativeBundle(remotionNarrativeBundle);
      setRemotionExportStatus('done');
      window.setTimeout(() => setRemotionExportStatus('idle'), 2400);
    } catch {
      setRemotionExportStatus('error');
      window.setTimeout(() => setRemotionExportStatus('idle'), 2400);
    }
  }, [
    remotionNarrativeBundle,
  ]);

  const handleRenderRemotionVideo = useCallback(async (compositionId: 'portrait-reveal' | 'landscape-brief') => {
    if (!remotionNarrativeBundle || !window.electronAPI?.renderRemotionVideo) {
      setRenderVideoStatus('error');
      setRenderVideoProgress({
        phase: 'error',
        progress: 0,
        message: '当前环境不支持本地视频渲染，请在 Electron 应用内使用。',
      });
      return;
    }

    setRenderVideoStatus('rendering');
    setRenderVideoProgress({
      phase: 'bundling',
      progress: 0,
      message: '正在准备渲染任务…',
    });

    const result = await window.electronAPI.renderRemotionVideo({
      bundle: remotionNarrativeBundle,
      compositionId,
      fileBaseName: remotionNarrativeBundle.title,
    });

    if (result.cancelled) {
      setRenderVideoStatus('idle');
      setRenderVideoProgress(null);
      return;
    }

    if (!result.success) {
      setRenderVideoStatus('error');
      setRenderVideoProgress((current) => ({
        phase: 'error',
        progress: current?.progress ?? 0,
        message: result.error || current?.message || '视频渲染失败',
      }));
      return;
    }

    setRenderVideoStatus('done');
    setRenderVideoProgress((current) => ({
      phase: 'done',
      progress: 100,
      message: '视频已渲染完成',
      outputPath: result.outputPath || current?.outputPath,
      renderedFrames: current?.renderedFrames,
      encodedFrames: current?.encodedFrames,
    }));
  }, [remotionNarrativeBundle]);

  const handleApplyToOpenBasaka = useCallback(async () => {
    if (!reportExportInput || applyStatus === 'applying') return;

    setApplyStatus('applying');
    try {
      const bundle = buildOpenBasakaExportBundle(reportExportInput);
      await importOpenBasakaExportBundle(bundle);
      setApplyStatus('done');
    } catch {
      setApplyStatus('error');
    }
  }, [
    applyStatus,
    reportExportInput,
  ]);

  // 如果尚未生成拓扑但有足够数据，自动生成
  const canGenerate = completedDimensions.length >= 2 || avgCompleted || gameResults.length > 0 || matrixResults.length > 0;

  // ── 自动刷新：每次进入报告页时重新生成拓扑画像 ──
  useEffect(() => {
    if (canGenerate) {
      const profile = generateTopologyProfile(
        answers, avgChoices, avgProfile, gameResults, catResponses, matrixResults,
      );
      setTopology(profile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 仅在 mount 时执行

  const handleGenerate = () => {
    const profile = generateTopologyProfile(
      answers, avgChoices, avgProfile, gameResults, catResponses, matrixResults,
    );
    setTopology(profile);
  };

  /* ═══════ Empty state ═══════ */
  if (!topology) {
    return (
      <div style={{ ...OUTER, paddingTop: 120, paddingBottom: 80, textAlign: 'center' }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ fontSize: 72, marginBottom: 24, filter: 'drop-shadow(0 0 24px rgba(100,255,218,0.3))' }}>🌌</div>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>你的拓扑画像</h2>
          {canGenerate ? (
            <>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 28, lineHeight: 1.8 }}>
                你已完成 {completedDimensions.length} 个维度
                {avgCompleted ? ' + AVG' : ''}
                {gameResults.length > 0 ? ` + ${gameResults.length} 个游戏` : ''}
                {matrixResults.length > 0 ? ' + 矩阵推理' : ''}
                ，数据已就绪。
              </p>
              <button onClick={handleGenerate}
                style={{
                  background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))',
                  color: '#0a0a1a', border: 'none', borderRadius: 16,
                  padding: '16px 48px', fontSize: 16, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  boxShadow: '0 8px 32px rgba(100,255,218,0.2)',
                }}>
                🌌 生成拓扑画像
              </button>
            </>
          ) : (
            <>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 28 }}>
                完成至少 2 个维度的测评后即可生成你的拓扑画像
              </p>
              <Link to="/assessment" style={{
                display: 'inline-block', background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))',
                color: '#0a0a1a', borderRadius: 14, padding: '14px 40px', fontWeight: 700,
                textDecoration: 'none', fontSize: 15,
              }}>
                开始评测
              </Link>
            </>
          )}
        </motion.div>
      </div>
    );
  }

  const averageConfidence = Math.round(
    (Object.values(topology.confidenceMap).reduce((sum, value) => sum + value, 0)
      / Math.max(Object.keys(topology.confidenceMap).length, 1)) * 100,
  );
  const stageModeLabel = humanMapBlueprint
    ? humanMapBlueprint.mode === 'detailed'
      ? '《人类数值地图 v1》详细版本'
      : '《人类数值地图 v1》精简版本'
    : '统一问题版本';
  const stageFocus = humanMapBlueprint?.currentFocus
    || topology.crossReactions[0]?.title
    || topology.pendingVerification[0]
    || '系统已经形成初版张力判断';
  const stagePulseLine = topology.crossReactions[0]?.implication
    || humanMapBlueprint?.summary
    || topology.narrativeIdentity;
  const primaryDimensionId = humanMapBlueprint?.recommendedDimensions[0]
    || Object.entries(topology.confidenceMap).sort((left, right) => right[1] - left[1])[0]?.[0]
    || DIMENSIONS[0]?.id;
  const primaryDimensionMeta = DIMENSIONS.find((dimension) => dimension.id === primaryDimensionId);
  const heroStatCards = [
    {
      label: '可信读取度',
      value: `${averageConfidence}%`,
      accent: '#64FFDA',
      description: `${completedDimensions.length} 个维度 + ${gameResults.length} 个实验 + ${matrixResults.length} 个矩阵输入`,
    },
    {
      label: '题目留痕',
      value: `${questionTraceSnapshots.length}`,
      accent: '#FFD166',
      description: `${personalizedTraceCount} 道个性化版本已被缓存`,
    },
    {
      label: '优先维度',
      value: primaryDimensionMeta?.name || primaryDimensionId,
      accent: primaryDimensionMeta?.color || '#BB86FC',
      description: humanMapBlueprint
        ? `题路先围绕 ${humanMapBlueprint.currentFocus} 展开`
        : '统一题路里最先浮出的聚焦区',
    },
  ];
  const heroAnchorCards = [
    {
      id: 'remotion' as const,
      title: '叙事导演台',
      caption: remotionNarrativeBundle
        ? `${remotionNarrativeBundle.sceneOutline.length} 个镜头已经待命`
        : '视频叙事台等待结果包',
      accent: '#FFD60A',
    },
    {
      id: 'trace' as const,
      title: 'Question Trace',
      caption: `${questionTraceSnapshots.length} 条真实作答证据可回放`,
      accent: '#FFD166',
    },
    {
      id: 'ai' as const,
      title: 'AI 结论映射',
      caption: aiSummary
        ? `${aiInsightCards.length} 条关键结论已挂上证据`
        : '生成后可反查每条判断从哪里来',
      accent: '#64FFDA',
    },
    {
      id: 'topology' as const,
      title: '维度拓扑',
      caption: `${DIMENSIONS.length} 个维度的结构能量图谱`,
      accent: '#BB86FC',
    },
  ];
  const linkedSystemCards = [
    {
      key: 'boss',
      title: 'BOSS Core',
      icon: '👑',
      accent: '#64FFDA',
      summary: `把「${topology.selfArchetype}」写进主档，影响你的处事基调、协作角色与默认判断。`,
      effect: humanMapBlueprint
        ? `当前会优先沿着「${humanMapBlueprint.currentFocus}」去排布目标与解释风格`
        : '当前会用拓扑画像去重排目标、风格和行动偏好',
      action: () => openSandboxSurface('boss'),
      button: '查看 Boss 写回',
    },
    {
      key: 'warroom',
      title: '推演室',
      icon: '⚔️',
      accent: '#FFD166',
      summary: '把你的张力、风险容忍与偏好，直接投进项目推演和策略碰撞里。',
      effect: topology.crossReactions[0]
        ? `当前最适合围绕「${topology.crossReactions[0].title}」做推演`
        : '当前会拿这份画像去判断你会怎样做决策',
      action: () => openSandboxSurface('warroom'),
      button: '进入推演室',
    },
    {
      key: 'memory',
      title: '记忆宫殿',
      icon: '🏛️',
      accent: '#7EE8FA',
      summary: '让知识与记忆不再平铺，而是按你的主线、禁区和兴趣域重新归档。',
      effect: humanMapBlueprint
        ? `当前会偏向「${humanMapBlueprint.lifeStage}」阶段最需要的抽屉`
        : '当前会优先突出你最常回到的记忆线索',
      action: () => openSandboxSurface('memory'),
      button: '打开记忆宫殿',
    },
    {
      key: 'neurons',
      title: '神经元',
      icon: '🧠',
      accent: '#BB86FC',
      summary: '把你的画像分发给多视角代理，让不同认知器官围绕同一个你来工作。',
      effect: primaryDimensionMeta
        ? `当前更容易激活与「${primaryDimensionMeta.name}」相关的分析视角`
        : '当前更容易激活与你当前人格原型相配的分析视角',
      action: () => openSandboxSurface('neurons'),
      button: '查看神经元联动',
    },
  ];

  // ── Radar chart data ──
  const radarData = DIMENSIONS.map(d => ({
    dimension: d.icon + ' ' + d.name,
    value: Math.round((topology.confidenceMap[d.id] || 0) * 100),
  }));

  /* ═══════ Report view ═══════ */
  return (
    <div style={{ minHeight: '100vh', paddingBottom: 80 }}>
      {/* ── Global centered wrapper ── */}
      <div style={OUTER}>

        {/* Top nav */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
          <button onClick={() => navigate('/')}
            style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, padding: '8px 16px', cursor: 'pointer',
              color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'var(--font-sans)',
            }}>
            ← 首页
          </button>
          <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
            {new Date(topology.createdAt).toLocaleDateString('zh-CN')} · 拓扑画像报告
          </span>
        </div>

        {/* ═══ Hero Stage — 中轴舞台 + 证据与联动 ═══ */}
        <section style={{ marginTop: SECTION_GAP, marginBottom: SECTION_GAP }}>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 32,
              padding: '30px 24px 24px',
              background: `
                radial-gradient(circle at 15% 18%, rgba(100,255,218,0.16), transparent 26%),
                radial-gradient(circle at 84% 16%, rgba(187,134,252,0.18), transparent 30%),
                radial-gradient(circle at 50% 120%, rgba(255,209,102,0.14), transparent 38%),
                linear-gradient(180deg, rgba(8,19,25,0.96), rgba(9,14,24,0.92))
              `,
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 30px 80px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.03)',
            }}
          >
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.02), transparent)',
              pointerEvents: 'none',
              opacity: 0.5,
            }} />

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
              alignItems: 'center',
              marginBottom: 20,
            }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{
                  fontSize: 11,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: '#64FFDA',
                }}>
                  Topology Cockpit
                </span>
                <span style={{
                  padding: '5px 12px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)',
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                }}>
                  {stageModeLabel}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {heroStatCards.map((card) => (
                  <div
                    key={card.label}
                    style={{
                      minWidth: 118,
                      padding: '10px 12px',
                      borderRadius: 16,
                      background: 'rgba(255,255,255,0.028)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                      {card.label}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, color: card.accent }}>
                      {card.value}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                      {card.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{
              textAlign: 'center',
              padding: '10px 0 24px',
              maxWidth: 760,
              margin: '0 auto',
            }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderRadius: 999,
                background: 'rgba(255,209,102,0.08)',
                border: '1px solid rgba(255,209,102,0.16)',
                color: '#FFD166',
                fontSize: 12,
                marginBottom: 18,
              }}>
                <span>当前中轴</span>
                <span style={{ opacity: 0.6 }}>·</span>
                <span>{stageFocus}</span>
              </div>

              <h1 style={{
                fontSize: 'clamp(34px, 7vw, 58px)',
                lineHeight: 1.08,
                letterSpacing: '-0.03em',
                margin: '0 0 14px',
                color: '#F3F8FF',
                fontFamily: 'var(--font-display)',
                textShadow: '0 8px 40px rgba(100,255,218,0.14)',
              }}>
                {topology.selfArchetype}
              </h1>

              <p style={{
                margin: '0 auto 14px',
                maxWidth: 720,
                fontSize: 16,
                color: 'rgba(255,255,255,0.74)',
                lineHeight: 1.9,
              }}>
                {topology.narrativeIdentity}
              </p>

              <p style={{
                margin: '0 auto',
                maxWidth: 660,
                fontSize: 14,
                color: 'rgba(255,209,102,0.86)',
                lineHeight: 1.8,
              }}>
                {stagePulseLine}
              </p>

              <div style={{
                display: 'flex',
                gap: 10,
                justifyContent: 'center',
                flexWrap: 'wrap',
                marginTop: 24,
              }}>
                <button
                  onClick={() => scrollToStageAnchor('remotion')}
                  style={{
                    padding: '12px 20px',
                    borderRadius: 14,
                    border: '1px solid rgba(255,214,10,0.2)',
                    background: 'linear-gradient(135deg, rgba(255,214,10,0.12), rgba(255,128,171,0.08))',
                    color: '#FFE082',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  🎬 进入叙事导演台
                </button>
                <button
                  onClick={() => (aiSummary ? scrollToStageAnchor('ai') : handleGenerateAISummary())}
                  style={{
                    padding: '12px 20px',
                    borderRadius: 14,
                    border: '1px solid rgba(100,255,218,0.18)',
                    background: 'linear-gradient(135deg, rgba(100,255,218,0.11), rgba(79,195,247,0.08))',
                    color: '#64FFDA',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {aiSummary ? '🧠 查看 AI 证据结论' : aiLoading ? '🧠 正在生成 AI 证据结论' : '🧠 生成 AI 证据结论'}
                </button>
                <button
                  onClick={handleApplyToOpenBasaka}
                  type="button"
                  style={{
                    padding: '12px 20px',
                    borderRadius: 14,
                    border: applyStatus === 'error'
                      ? '1px solid rgba(255,107,107,0.18)'
                      : '1px solid rgba(187,134,252,0.18)',
                    background: applyStatus === 'error'
                      ? 'linear-gradient(135deg, rgba(255,107,107,0.12), rgba(255,152,0,0.08))'
                      : 'linear-gradient(135deg, rgba(187,134,252,0.12), rgba(100,255,218,0.08))',
                    color: applyStatus === 'error' ? 'var(--accent-red)' : '#D8C6FF',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {applyStatus === 'applying'
                    ? '正在写回 Openbasaka...'
                    : applyStatus === 'done'
                      ? '✅ 已写回 Openbasaka'
                      : applyStatus === 'error'
                        ? '⚠ 写回失败'
                        : '🧠 写回 Openbasaka'}
                </button>
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 16,
            }}>
              <div style={{
                borderRadius: 22,
                padding: '18px 18px 16px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 12 }}>
                  Evidence cockpit
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>证据不再藏在中后段</div>
                <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.8 }}>
                  从这里可以直跳回放题目、AI 证据映射和维度拓扑。用户第一屏就能看见这份报告是怎么被问出来、怎么被演出来、又会影响到哪些系统。
                </p>
                <div style={{ display: 'grid', gap: 10 }}>
                  {heroAnchorCards.map((card) => (
                    <button
                      key={card.id}
                      onClick={() => scrollToStageAnchor(card.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '12px 14px',
                        borderRadius: 16,
                        border: `1px solid ${card.accent}26`,
                        background: `${card.accent}10`,
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                        textAlign: 'left',
                      }}
                    >
                      <span>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: card.accent }}>{card.title}</span>
                        <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                          {card.caption}
                        </span>
                      </span>
                      <span style={{ color: card.accent, fontSize: 14 }}>→</span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{
                borderRadius: 22,
                padding: '18px 18px 16px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 12 }}>
                  Human map route
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
                  {humanMapBlueprint ? '这份报告先认识你，再问你' : '当前走的是统一问题版本'}
                </div>
                <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.85 }}>
                  {humanMapBlueprint
                    ? humanMapBlueprint.summary
                    : '用户没有先走《人类数值地图 v1》，所以系统会按统一题路生成一份可比对、可回放的基线画像。'}
                </p>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                  gap: 10,
                  marginBottom: 12,
                }}>
                  <div style={{ padding: '12px 12px', borderRadius: 16, background: 'rgba(255,255,255,0.025)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>当前阶段</div>
                    <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700 }}>
                      {humanMapBlueprint?.lifeStage || '统一基线'}
                    </div>
                  </div>
                  <div style={{ padding: '12px 12px', borderRadius: 16, background: 'rgba(255,255,255,0.025)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>当前主线</div>
                    <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700 }}>
                      {humanMapBlueprint?.currentFocus || '统一问题版本'}
                    </div>
                  </div>
                  <div style={{ padding: '12px 12px', borderRadius: 16, background: 'rgba(255,255,255,0.025)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>优先维度</div>
                    <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700 }}>
                      {humanMapBlueprint
                        ? humanMapBlueprint.recommendedDimensions
                          .slice(0, 2)
                          .map((dimensionId) => DIMENSIONS.find((dimension) => dimension.id === dimensionId)?.name || dimensionId)
                          .join(' / ')
                        : (primaryDimensionMeta?.name || '待生成')}
                    </div>
                  </div>
                </div>
                {humanMapBlueprint?.signalScores?.length ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {humanMapBlueprint.signalScores.slice(0, 4).map((signal) => (
                      <span
                        key={signal.id}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 999,
                          border: '1px solid rgba(255,255,255,0.08)',
                          background: 'rgba(255,255,255,0.03)',
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {signal.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div style={{
                borderRadius: 22,
                padding: '18px 18px 16px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 12 }}>
                  Linked systems
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>这份画像会直接写动这些系统</div>
                <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.8 }}>
                  联动不再藏在说明文字里。你可以直接点开 Boss、推演室、记忆宫殿和神经元，看同一份画像如何被不同系统接住。
                </p>
                <div style={{ display: 'grid', gap: 10 }}>
                  {linkedSystemCards.map((card) => (
                    <button
                      key={card.key}
                      onClick={card.action}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 16,
                        border: `1px solid ${card.accent}24`,
                        background: 'rgba(255,255,255,0.02)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 16 }}>{card.icon}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: card.accent }}>{card.title}</span>
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{card.button}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.75, marginBottom: 6 }}>
                        {card.summary}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.7 }}>
                        {card.effect}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {remotionNarrativeBundle && (
          <section ref={remotionSectionRef}>
            <RemotionNarrativeStage
              bundle={remotionNarrativeBundle}
              exportStatus={remotionExportStatus}
              onExport={handleExportRemotionBundle}
              onRenderVideo={handleRenderRemotionVideo}
              renderStatus={renderVideoStatus}
              renderProgress={renderVideoProgress}
            />
          </section>
        )}

        {questionTraceSnapshots.length > 0 && (
          <section ref={traceSectionRef} style={{ marginBottom: SECTION_GAP }}>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16 }}
              style={{
                borderRadius: 22,
                padding: '24px 24px',
                background:
                  'radial-gradient(circle at top right, rgba(255,209,102,0.14), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.018))',
                border: '1px solid rgba(255,209,102,0.16)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                    Question Trace
                  </div>
                  <h2 style={{ fontSize: 22, margin: 0, fontFamily: 'var(--font-display)' }}>系统是这样一步步问到你的</h2>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                  已留痕 {questionTraceSnapshots.length} 条真实作答证据
                </div>
              </div>

              <p style={{ margin: '0 0 18px', color: 'var(--text-secondary)', lineHeight: 1.9 }}>
                下面展示的是你这次测评里真正产生过的作答证据。若前端展示快照存在，系统优先使用当时实际呈现版本；若快照丢失，则从 Human Map、维度题、CAT 与矩阵响应中恢复可审计回放。
              </p>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
                marginBottom: 18,
              }}>
                <div style={{ padding: '13px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.028)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>已留痕题目</div>
                  <div style={{ marginTop: 8, fontSize: 20, fontWeight: 700, color: '#FFD166' }}>{questionTraceSnapshots.length}</div>
                </div>
                <div style={{ padding: '13px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.028)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>个性化版本</div>
                  <div style={{ marginTop: 8, fontSize: 20, fontWeight: 700, color: '#64FFDA' }}>{personalizedTraceCount}</div>
                </div>
                <div style={{ padding: '13px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.028)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>覆盖维度</div>
                  <div style={{ marginTop: 8, fontSize: 20, fontWeight: 700 }}>{traceDimensionCount}</div>
                </div>
                <div style={{ padding: '13px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.028)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>AI 已引用证据</div>
                  <div style={{ marginTop: 8, fontSize: 20, fontWeight: 700, color: '#FFD166' }}>{aiReferencedTraceRefs.length}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                <button
                  onClick={() => setTracePersonalizedOnly((value) => !value)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 999,
                    border: `1px solid ${tracePersonalizedOnly ? 'rgba(100,255,218,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    background: tracePersonalizedOnly ? 'rgba(100,255,218,0.08)' : 'rgba(255,255,255,0.03)',
                    color: tracePersonalizedOnly ? '#64FFDA' : 'var(--text-secondary)',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {tracePersonalizedOnly ? '只看个性化版本中' : '只看个性化版本'}
                </button>

                {filteredTraceSnapshots.length > TRACE_CARD_PREVIEW_COUNT && (
                  <button
                    onClick={() => setTraceExpanded((value) => !value)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 999,
                      border: '1px solid rgba(255,209,102,0.22)',
                      background: 'rgba(255,209,102,0.08)',
                      color: '#FFD166',
                      fontSize: 12,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    {traceExpanded ? '收起回放' : `展开全部 ${filteredTraceSnapshots.length} 道`}
                  </button>
                )}

                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  当前显示 {visibleTraceSnapshots.length} / {filteredTraceSnapshots.length} 道
                </div>
                {aiReferencedTraceRefs.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    AI 总结里的 `Q` 编号可以直接点回来定位这道题
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
                <button
                  onClick={() => setTraceDimensionFilter('all')}
                  style={{
                    padding: '7px 12px',
                    borderRadius: 999,
                    border: `1px solid ${traceDimensionFilter === 'all' ? 'rgba(255,209,102,0.28)' : 'rgba(255,255,255,0.08)'}`,
                    background: traceDimensionFilter === 'all' ? 'rgba(255,209,102,0.08)' : 'rgba(255,255,255,0.03)',
                    color: traceDimensionFilter === 'all' ? '#FFD166' : 'var(--text-secondary)',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  全部维度
                </button>
                {traceDimensions.map((dimension) => (
                  <button
                    key={dimension.id}
                    onClick={() => setTraceDimensionFilter(dimension.id)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 999,
                      border: `1px solid ${traceDimensionFilter === dimension.id ? 'rgba(100,255,218,0.24)' : 'rgba(255,255,255,0.08)'}`,
                      background: traceDimensionFilter === dimension.id ? 'rgba(100,255,218,0.08)' : 'rgba(255,255,255,0.03)',
                      color: traceDimensionFilter === dimension.id ? '#64FFDA' : 'var(--text-secondary)',
                      fontSize: 12,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    {dimension.name}
                  </button>
                ))}
              </div>

              {filteredTraceSnapshots.length === 0 ? (
                <div style={{
                  padding: '20px 18px',
                  borderRadius: 18,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  color: 'var(--text-tertiary)',
                  fontSize: 13,
                }}>
                  当前筛选下还没有匹配的题目回放，试试切回全部维度或关闭“只看个性化版本”。
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 14 }}>
                  {visibleTraceSnapshots.map((snapshot) => (
                  <div
                    key={snapshot.id}
                    ref={(node) => {
                      traceCardRefs.current[snapshot.id] = node;
                    }}
                    style={{
                      padding: '16px 18px',
                      borderRadius: 18,
                      background: highlightedTraceId === snapshot.id ? 'rgba(255,209,102,0.08)' : 'rgba(255,255,255,0.025)',
                      border: highlightedTraceId === snapshot.id
                        ? '1px solid rgba(255,209,102,0.28)'
                        : '1px solid rgba(255,255,255,0.06)',
                      boxShadow: highlightedTraceId === snapshot.id
                        ? '0 0 0 1px rgba(255,209,102,0.12), 0 16px 36px rgba(255,209,102,0.08)'
                        : 'none',
                      transition: 'all 0.35s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 10,
                          padding: '3px 8px',
                          borderRadius: 999,
                          background: 'rgba(255,209,102,0.1)',
                          border: '1px solid rgba(255,209,102,0.18)',
                          color: '#FFD166',
                          letterSpacing: '0.04em',
                        }}>
                          {traceRefBySnapshotId[snapshot.id] || 'Q?'}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#FFD166' }}>{snapshot.dimensionName}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{snapshot.moduleName}</span>
                        {snapshot.personalized && (
                          <span style={{
                            fontSize: 10,
                            padding: '3px 8px',
                            borderRadius: 999,
                            background: 'rgba(100,255,218,0.08)',
                            border: '1px solid rgba(100,255,218,0.18)',
                            color: '#64FFDA',
                          }}>
                            个性化版本
                          </span>
                        )}
                        {aiReferencedTraceIds.has(snapshot.id) && (
                          <span style={{
                            fontSize: 10,
                            padding: '3px 8px',
                            borderRadius: 999,
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            color: 'var(--text-secondary)',
                          }}>
                            AI 已引用
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {formatTraceTime(snapshot.answeredAt || snapshot.cachedAt)}
                      </div>
                    </div>

                    <div style={{ color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-line', marginBottom: 10 }}>
                      {snapshot.renderedText}
                    </div>

                    {snapshot.scenePrompt && (
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.8, marginBottom: 8 }}>
                        代入提醒：{snapshot.scenePrompt}
                      </div>
                    )}

                    {snapshot.whyAsked && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 8 }}>
                        为什么问这题：{snapshot.whyAsked}
                      </div>
                    )}

                    {snapshot.swingHint && (
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.8, marginBottom: 8 }}>
                        摇摆判断器：{snapshot.swingHint}
                      </div>
                    )}

                    {snapshot.optionInstruction && (
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.8, marginBottom: 8 }}>
                        作答提醒：{snapshot.optionInstruction}
                      </div>
                    )}

                    <div style={{ fontSize: 12, color: '#FFD166', lineHeight: 1.8, marginBottom: 8 }}>
                      你的作答：{snapshot.answerLabel || String(snapshot.answerValue ?? '未记录')}
                    </div>

                    {snapshot.originalText !== snapshot.renderedText && (
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7, marginBottom: 8 }}>
                        原始题干：{snapshot.originalText}
                      </div>
                    )}

                    {snapshot.displayedOptions.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {snapshot.displayedOptions.slice(0, 4).map((option: string, index: number) => (
                          <span
                            key={`${snapshot.id}:${index}`}
                            style={{
                              fontSize: 11,
                              padding: '5px 10px',
                              borderRadius: 999,
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid rgba(255,255,255,0.06)',
                              color: 'var(--text-tertiary)',
                            }}
                          >
                            {option}
                          </span>
                        ))}
                      </div>
                    )}

                    {snapshot.displayedSliderAnchors && snapshot.displayedSliderAnchors.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: snapshot.displayedOptions.length > 0 ? 8 : 0 }}>
                        {snapshot.displayedSliderAnchors.map((anchor, index) => (
                          <span
                            key={`${snapshot.id}:anchor:${index}`}
                            style={{
                              fontSize: 11,
                              padding: '5px 10px',
                              borderRadius: 999,
                              background: `${anchor.color}18`,
                              border: `1px solid ${anchor.color}30`,
                              color: anchor.color,
                            }}
                          >
                            {anchor.tag ? `${anchor.tag}｜${anchor.label}` : anchor.label}
                          </span>
                        ))}
                      </div>
                    )}

                    {(insightCardsByTraceId[snapshot.id] || []).length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                        {(insightCardsByTraceId[snapshot.id] || []).slice(0, 3).map((card, index) => (
                          <button
                            key={`${snapshot.id}:insight:${card.id}`}
                            onClick={() => focusSummaryLine(card.lineIndex)}
                            style={{
                              padding: '5px 10px',
                              borderRadius: 999,
                              border: '1px solid rgba(255,255,255,0.08)',
                              background: 'rgba(255,255,255,0.03)',
                              color: 'var(--text-secondary)',
                              fontSize: 11,
                              cursor: 'pointer',
                              fontFamily: 'var(--font-sans)',
                            }}
                          >
                            结论 {index + 1} · 回到原句
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  ))}
                </div>
              )}
            </motion.div>
          </section>
        )}

        {/* ═══ 置信度概览 ═══ */}
        <section ref={topologySectionRef} style={{ marginBottom: SECTION_GAP }}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
            style={{
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 20, padding: '24px 28px',
            }}>
            <h2 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 16, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center' }}>
              数据置信度
            </h2>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '12px 20px',
            }}>
              {Object.entries(topology.confidenceMap).map(([dimId, conf]) => {
                const dim = DIMENSIONS.find(d => d.id === dimId);
                const pct = Math.round(conf * 100);
                return (
                  <div key={dimId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{dim?.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                        <div style={{
                          height: '100%', borderRadius: 2,
                          width: `${pct}%`,
                          background: pct > 60 ? 'var(--accent-cyan)' : pct > 30 ? 'var(--accent-gold)' : 'var(--accent-red)',
                          transition: 'width 0.6s ease',
                        }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', minWidth: 30, textAlign: 'right' }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
            {topology.pendingVerification.length > 0 && (
              <p style={{ color: 'var(--accent-gold)', fontSize: 12, marginTop: 14, textAlign: 'center' }}>
                ⚠ {topology.pendingVerification[0]}
              </p>
            )}
          </motion.div>
        </section>

        {generatedSelfAgentConstitution && (
          <section style={{ marginBottom: SECTION_GAP }}>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              style={{
                background: 'rgba(100,255,218,0.035)',
                border: '1px solid rgba(100,255,218,0.16)',
                borderRadius: 20,
                padding: '24px 28px',
              }}>
              <h2 style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-cyan)', marginBottom: 16, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center' }}>
                未来代理人宪法
              </h2>
              <h3 style={{ fontSize: 18, fontWeight: 800, textAlign: 'center', marginBottom: 18 }}>
                {generatedSelfAgentConstitution.headline}
              </h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: 14,
              }}>
                {[
                  ['认知操作手册', generatedSelfAgentConstitution.cognitiveOperatingManual.slice(0, 3)],
                  ['可代理任务', generatedSelfAgentConstitution.delegableTasks.slice(0, 3)],
                  ['必须询问 Boss', generatedSelfAgentConstitution.mustAskUserTasks.slice(0, 3)],
                  ['禁区', generatedSelfAgentConstitution.forbiddenZones.slice(0, 3)],
                ].map(([title, lines]) => (
                  <div key={String(title)} style={{
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.07)',
                    background: 'rgba(255,255,255,0.025)',
                    padding: '14px 16px',
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: 8 }}>{String(title)}</div>
                    {(lines as string[]).map(line => (
                      <p key={line} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 6 }}>
                        {line}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              {generatedSelfAgentConstitution.evidenceLedger.length > 0 && (
                <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7 }}>
                  证据账本：{generatedSelfAgentConstitution.evidenceLedger.slice(0, 3).join(' ｜ ')}
                </div>
              )}
            </motion.div>
          </section>
        )}

        {/* ═══ 8 维雷达图 ═══ */}
        <section style={{ marginBottom: SECTION_GAP, textAlign: 'center' }}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24, letterSpacing: 1 }}>维度能量谱</h2>
            <div style={{
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 24, padding: '32px 20px',
              maxWidth: 480, margin: '0 auto',
            }}>
              <ResponsiveContainer width="100%" height={340}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="72%">
                  <PolarGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                  <PolarAngleAxis dataKey="dimension" tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="置信度" dataKey="value" stroke="#64FFDA" fill="#64FFDA" fillOpacity={0.12} strokeWidth={2}
                    dot={{ r: 3, fill: '#64FFDA', strokeWidth: 0 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </section>

        {/* ═══ 维度拓扑卡片 ═══ */}
        <section ref={aiSectionRef} style={{ marginBottom: SECTION_GAP }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24, textAlign: 'center', letterSpacing: 1 }}>维度拓扑画像</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {DIMENSIONS.map((dimMeta, i) => {
              const dt = topology.dimensionTopologies[dimMeta.id];
              if (!dt) return null;
              const isExpanded = expandedDim === dimMeta.id;

              return (
                <motion.div key={dimMeta.id}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.04 }}>
                  <div style={{
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 20, padding: '20px 24px', cursor: 'pointer',
                    transition: 'border-color 0.3s, background 0.3s',
                  }}
                    onClick={() => setExpandedDim(isExpanded ? null : dimMeta.id)}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = `${dimMeta.color}40`; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                  >
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <span style={{ fontSize: 28 }}>{dimMeta.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: dimMeta.color }}>{dt.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{dt.collaborationRole}</div>
                      </div>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 12, transition: 'transform 0.3s', transform: isExpanded ? 'rotate(180deg)' : '' }}>▼</span>
                    </div>

                    {/* Trait chips */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                      {dt.dominantTraits.filter(t => t.typology !== '待识别').map(t => (
                        <span key={t.subDimension} style={{
                          fontSize: 12, padding: '4px 12px', borderRadius: 20,
                          background: `${dimMeta.color}12`, color: dimMeta.color,
                          border: `1px solid ${dimMeta.color}25`,
                        }}>
                          {t.typology}
                        </span>
                      ))}
                    </div>

                    {/* Energy dynamics summary */}
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-tertiary)' }}>
                      <span>⚡ {dt.energyDynamics.flowZones.length} 个心流区</span>
                      <span>🔥 {dt.energyDynamics.drainZones.length} 个耗能区</span>
                    </div>

                    {/* Expanded content */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            {dt.dominantTraits.map(trait => {
                              const traitKey = `${dimMeta.id}:${trait.subDimension}`;
                              const isTraitExpanded = expandedTrait === traitKey;
                              return (
                                <div key={trait.subDimension}
                                  style={{
                                    marginBottom: 12, padding: '14px 16px', borderRadius: 14,
                                    background: 'rgba(255,255,255,0.02)', cursor: 'pointer',
                                  }}
                                  onClick={(e) => { e.stopPropagation(); setExpandedTrait(isTraitExpanded ? null : traitKey); }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: dimMeta.color }}>{trait.subDimensionName}</span>
                                    <span style={{
                                      fontSize: 11, padding: '2px 8px', borderRadius: 6,
                                      background: `${dimMeta.color}12`, color: dimMeta.color,
                                    }}>
                                      {trait.typology}
                                    </span>
                                  </div>
                                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 6 }}>{trait.description}</p>
                                  <div style={{ display: 'flex', gap: 16, fontSize: 12, flexWrap: 'wrap' }}>
                                    <span style={{ color: 'var(--accent-cyan)' }}>⚡ {trait.flowZone}</span>
                                    <span style={{ color: 'var(--accent-red)' }}>🔥 {trait.energyDrainer}</span>
                                  </div>

                                  {isTraitExpanded && trait.evidenceSources.length > 0 && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                      style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>🔗 证据链</p>
                                      {trait.evidenceSources.map((ev, j) => (
                                        <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                                          <span style={{
                                            fontSize: 12,
                                            color: ev.sourceType === 'game' ? 'var(--accent-purple)' : ev.sourceType === 'avg' ? 'var(--accent-gold)' : 'var(--accent-cyan)',
                                          }}>
                                            {ev.sourceType === 'questionnaire' ? '📋' : ev.sourceType === 'avg' ? '🎮' : ev.sourceType === 'game' ? '🔬' : '🎯'}
                                          </span>
                                          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                                            {ev.observation}
                                            <span style={{ opacity: 0.5, marginLeft: 4 }}>({Math.round(ev.confidence * 100)}%)</span>
                                          </span>
                                        </div>
                                      ))}
                                    </motion.div>
                                  )}
                                </div>
                              );
                            })}

                            {/* Theoretical insight */}
                            <div style={{
                              marginTop: 8, padding: '14px 16px', borderRadius: 14,
                              background: 'rgba(255,255,255,0.015)', borderLeft: `3px solid ${dimMeta.color}40`,
                            }}>
                              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7 }}>📖 {dt.theoreticalInsight}</p>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ═══ 跨维度化学反应 ═══ */}
        {topology.crossReactions.length > 0 && (
          <section style={{ marginBottom: SECTION_GAP }}>
            <h2 style={{
              fontSize: 18, fontWeight: 700, marginBottom: 24, textAlign: 'center',
              background: 'linear-gradient(135deg, #FF9800, #FF5722)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              跨维度化学反应
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {topology.crossReactions.map((r, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  style={{
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 20, padding: '20px 24px',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{
                      fontSize: 11, padding: '3px 10px', borderRadius: 20,
                      background: r.reactionType === 'resonance' ? 'rgba(100,255,218,0.1)' : r.reactionType === 'friction' ? 'rgba(255,107,107,0.1)' : r.reactionType === 'catalyst' ? 'rgba(255,215,0,0.1)' : 'rgba(187,134,252,0.1)',
                      color: r.reactionType === 'resonance' ? 'var(--accent-cyan)' : r.reactionType === 'friction' ? 'var(--accent-red)' : r.reactionType === 'catalyst' ? 'var(--accent-gold)' : 'var(--accent-purple)',
                    }}>
                      {r.reactionType === 'resonance' ? '共振' : r.reactionType === 'friction' ? '摩擦' : r.reactionType === 'catalyst' ? '催化' : '悖论'}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{r.title}</span>
                  </div>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.9, marginBottom: 10 }}>{r.narrative}</p>
                  <p style={{ fontSize: 13, color: 'var(--accent-cyan)' }}>💡 对创作的影响：{r.implication}</p>
                  {r.evidenceSources.length > 0 && (
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
                      🔗 基于 {r.evidenceSources.length} 条证据
                    </p>
                  )}
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* ═══ AI 全方位总结 ═══ */}
        <section style={{ marginBottom: SECTION_GAP }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
            <h2 style={{
              fontSize: 18, fontWeight: 700, marginBottom: 24, textAlign: 'center',
              background: 'linear-gradient(135deg, #FFD700, #FF9800)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              ✨ AI 全方位自我画像
            </h2>

            {!aiSummary && !aiLoading && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(255,215,0,0.025), rgba(255,152,0,0.025))',
                border: '1px solid rgba(255,215,0,0.1)', borderRadius: 24,
                padding: '48px 32px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 48, marginBottom: 16, filter: 'drop-shadow(0 0 20px rgba(255,215,0,0.2))' }}>🧠</div>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.9, marginBottom: 8, maxWidth: 440, margin: '0 auto 8px' }}>
                  基于你在所有维度的作答数据，AI 将为你生成一份
                  <strong style={{ color: '#FFD700' }}>个性化的全方位自我认知报告</strong>。
                </p>
                <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginBottom: 32 }}>
                  包含核心画像 · 优势 DNA · 能量管理地图 · 内在张力 · 工作建议 · 自我锚定短信
                </p>
                {questionTraceSnapshots.length > 0 && (
                  <p style={{
                    color: 'var(--text-secondary)',
                    fontSize: 12,
                    lineHeight: 1.8,
                    maxWidth: 520,
                    margin: '0 auto 24px',
                  }}>
                    这次 AI 还会参考 {questionTraceSnapshots.length} 道真实题目回溯，
                    包括你当时看到的个性化问法、代入提醒和真实作答，不再只看最终分数。
                  </p>
                )}
                {questionTraceSnapshots.length > 0 && (
                  <p style={{
                    color: 'var(--text-tertiary)',
                    fontSize: 12,
                    lineHeight: 1.8,
                    maxWidth: 560,
                    margin: '0 auto 24px',
                  }}>
                    生成后的 `Q1 / Q2 / Q3...` 证据编号都可以直接点击，跳回对应题目回放。
                  </p>
                )}
                <button
                  onClick={handleGenerateAISummary}
                  disabled={aiLoading}
                  style={{
                    background: 'linear-gradient(135deg, #FFD700, #FF9800)',
                    color: '#0a0a1a', border: 'none', borderRadius: 16,
                    padding: '16px 48px', fontSize: 15, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'var(--font-sans)',
                    boxShadow: '0 8px 32px rgba(255,215,0,0.15)',
                    transition: 'all 0.3s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(255,215,0,0.25)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 8px 32px rgba(255,215,0,0.15)'; }}
                >
                  ✨ 生成 AI 深度总结
                </button>
                {aiError && (
                  <p style={{ color: 'var(--accent-red)', fontSize: 12, marginTop: 16 }}>⚠ {aiError}</p>
                )}
              </div>
            )}

            {(aiLoading || aiSummary) && (
              <div style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 24, overflow: 'hidden',
              }}>
                {/* Header */}
                <div style={{
                  padding: '16px 24px',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'rgba(255,215,0,0.015)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>🧠</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#FFD700' }}>GLM 画像引擎深度分析</span>
                  </div>
                  {!aiLoading && aiReferencedTraceRefs.length > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      已引用 {aiReferencedTraceRefs.length} 条题目证据
                    </div>
                  )}
                  {aiLoading && (
                    <motion.span
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      style={{ fontSize: 12, color: 'var(--accent-cyan)' }}
                    >
                      ● 正在生成...
                    </motion.span>
                  )}
                  {!aiLoading && aiSummary && (
                    <button onClick={handleGenerateAISummary}
                      style={{
                        color: 'var(--text-tertiary)', background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
                        padding: '5px 14px', cursor: 'pointer', fontSize: 12,
                        fontFamily: 'var(--font-sans)',
                      }}>
                      🔄 重新生成
                    </button>
                  )}
                </div>

                {/* Content */}
                <div
                  ref={summaryRef}
                  style={{
                    padding: '28px 32px',
                    maxHeight: 640,
                    overflowY: 'auto',
                    fontSize: 14,
                    lineHeight: 2,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {aiInsightCards.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                        marginBottom: 14,
                      }}>
                        <div>
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                            Insight Map
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                            关键结论与证据映射
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                          点结论回到原句，点 `Q` 编号回到题目回放
                        </div>
                      </div>

                      <div style={{ display: 'grid', gap: 12 }}>
                        {aiInsightCards.map((card) => (
                          <div
                            key={card.id}
                            style={{
                              padding: '14px 16px',
                              borderRadius: 16,
                              background: 'rgba(255,255,255,0.026)',
                              border: '1px solid rgba(255,255,255,0.06)',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                              <span style={{ fontSize: 11, color: '#FFD166', letterSpacing: '0.04em' }}>{card.section}</span>
                              <button
                                onClick={() => focusSummaryLine(card.lineIndex)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 999,
                                  border: '1px solid rgba(255,255,255,0.08)',
                                  background: 'rgba(255,255,255,0.03)',
                                  color: 'var(--text-secondary)',
                                  fontSize: 11,
                                  cursor: 'pointer',
                                  fontFamily: 'var(--font-sans)',
                                }}
                              >
                                回到原句
                              </button>
                            </div>
                            <div style={{ color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.8, marginBottom: 10 }}>
                              {card.text}
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {card.refs.map((refId) => (
                                <button
                                  key={`${card.id}:${refId}`}
                                  onClick={() => focusTraceRef(refId)}
                                  style={{
                                    padding: '5px 10px',
                                    borderRadius: 999,
                                    border: '1px solid rgba(255,209,102,0.22)',
                                    background: 'rgba(255,209,102,0.08)',
                                    color: '#FFD166',
                                    fontSize: 11,
                                    cursor: 'pointer',
                                    fontFamily: 'var(--font-sans)',
                                  }}
                                >
                                  {refId}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {aiSummary.split('\n').map((line, i) => {
                    const lineWrapperStyle: React.CSSProperties = {
                      marginBottom: line.trim() === '' ? 0 : 4,
                      borderRadius: 12,
                      background: highlightedSummaryLine === i ? 'rgba(255,209,102,0.08)' : 'transparent',
                      boxShadow: highlightedSummaryLine === i ? '0 0 0 1px rgba(255,209,102,0.14)' : 'none',
                      transition: 'all 0.35s ease',
                    };
                    if (line.startsWith('### ')) {
                      return (
                        <div
                          key={i}
                          ref={(node) => { summaryLineRefs.current[i] = node; }}
                          style={lineWrapperStyle}
                        >
                          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '28px 0 14px', fontFamily: 'var(--font-serif, serif)' }}>
                            {renderInlineSummaryText(line.replace('### ', ''), `h3-${i}`)}
                          </h3>
                        </div>
                      );
                    }
                    if (line.startsWith('## ')) {
                      return (
                        <div
                          key={i}
                          ref={(node) => { summaryLineRefs.current[i] = node; }}
                          style={lineWrapperStyle}
                        >
                          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#FFD700', margin: '32px 0 16px', fontFamily: 'var(--font-serif, serif)' }}>
                            {renderInlineSummaryText(line.replace('## ', ''), `h2-${i}`)}
                          </h2>
                        </div>
                      );
                    }
                    if (line.startsWith('- **')) {
                      const match = line.match(/- \*\*(.+?)\*\*[:：]?\s*(.*)/);
                      if (match) {
                        return (
                          <div
                            key={i}
                            ref={(node) => { summaryLineRefs.current[i] = node; }}
                            style={lineWrapperStyle}
                          >
                            <div style={{ display: 'flex', gap: 8, marginBottom: 10, paddingLeft: 8 }}>
                              <span style={{ color: 'var(--accent-cyan)', flexShrink: 0, lineHeight: '28px' }}>▸</span>
                              <span>
                                <strong style={{ color: 'var(--text-primary)' }}>{renderInlineSummaryText(match[1], `bullet-title-${i}`)}</strong>
                                {' '}
                                {renderInlineSummaryText(match[2], `bullet-body-${i}`)}
                              </span>
                            </div>
                          </div>
                        );
                      }
                    }
                    if (line.startsWith('- ')) {
                      return (
                        <div
                          key={i}
                          ref={(node) => { summaryLineRefs.current[i] = node; }}
                          style={lineWrapperStyle}
                        >
                          <div style={{ display: 'flex', gap: 8, marginBottom: 8, paddingLeft: 8 }}>
                            <span style={{ color: 'var(--text-tertiary)', flexShrink: 0, lineHeight: '28px' }}>•</span>
                            <span>{renderInlineSummaryText(line.slice(2), `list-${i}`)}</span>
                          </div>
                        </div>
                      );
                    }
                    if (line.startsWith('> ')) {
                      return (
                        <div
                          key={i}
                          ref={(node) => { summaryLineRefs.current[i] = node; }}
                          style={lineWrapperStyle}
                        >
                          <blockquote style={{
                            borderLeft: '3px solid #FFD700', paddingLeft: 16,
                            margin: '20px 0', fontStyle: 'italic',
                            color: 'var(--text-secondary)', background: 'rgba(255,215,0,0.02)',
                            padding: '14px 20px', borderRadius: '0 12px 12px 0',
                          }}>
                            {renderInlineSummaryText(line.slice(2), `quote-${i}`)}
                          </blockquote>
                        </div>
                      );
                    }
                    if (line.trim() === '') {
                      return (
                        <div
                          key={i}
                          ref={(node) => { summaryLineRefs.current[i] = node; }}
                          style={{ height: 10 }}
                        />
                      );
                    }
                    return (
                      <div
                        key={i}
                        ref={(node) => { summaryLineRefs.current[i] = node; }}
                        style={lineWrapperStyle}
                      >
                        <p style={{ marginBottom: 10 }}>
                          {renderInlineSummaryText(line, `paragraph-${i}`)}
                        </p>
                      </div>
                    );
                  })}
                  {aiLoading && (
                    <motion.span
                      animate={{ opacity: [0, 1, 0] }}
                      transition={{ duration: 0.8, repeat: Infinity }}
                      style={{ display: 'inline-block', width: 8, height: 18, background: '#FFD700', borderRadius: 2, marginLeft: 2, verticalAlign: 'text-bottom' }}
                    />
                  )}
                </div>

                {aiError && (
                  <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(255,107,107,0.15)' }}>
                    <p style={{ color: 'var(--accent-red)', fontSize: 12 }}>⚠ {aiError}</p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </section>

        {/* ═══ CTA — 智者对话 ═══ */}
        <section style={{ marginBottom: SECTION_GAP }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
            style={{
              background: 'linear-gradient(135deg, rgba(187,134,252,0.05), rgba(100,255,218,0.03))',
              border: '1px solid rgba(187,134,252,0.1)', borderRadius: 24,
              padding: '40px 32px', textAlign: 'center',
              position: 'relative', overflow: 'hidden',
            }}>
            {/* Subtle animated ring */}
            <div style={{
              position: 'absolute', top: -60, right: -60,
              width: 200, height: 200, borderRadius: '50%',
              border: '1px solid rgba(187,134,252,0.06)',
              animation: 'sage-ring-pulse 4s ease-in-out infinite',
            }} />
            <div style={{ fontSize: 44, marginBottom: 12 }}>🏛️</div>
            <h3 style={{
              fontSize: 20, fontWeight: 700, marginBottom: 8,
              fontFamily: 'var(--font-serif, serif)',
              background: 'linear-gradient(135deg, #BB86FC, #64FFDA)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              与智者对话
            </h3>
            <p style={{
              color: 'var(--text-secondary)', fontSize: 14,
              marginBottom: 20, maxWidth: 420, margin: '0 auto 20px', lineHeight: 1.8,
            }}>
              7 位智者将从不同维度深入解读你的画像——认知模式、价值信念、内在张力、关系模式、创作审美、行动系统，直到帮你设计属于自己的产品。
            </p>

            {/* Sage icon row */}
            <div style={{
              display: 'flex', justifyContent: 'center', gap: 10,
              flexWrap: 'wrap', marginBottom: 24,
            }}>
              {SAGE_DEFINITIONS.map(sage => {
                const session = allSageSessions[sage.id];
                const isComplete = session?.status === 'completed';
                const isActive = session?.status === 'active';
                return (
                  <div key={sage.id} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '5px 12px', borderRadius: 14,
                    background: isComplete ? `${sage.color}12` : isActive ? `${sage.color}08` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isComplete ? `${sage.color}25` : 'rgba(255,255,255,0.05)'}`,
                    transition: 'all 0.3s',
                  }}>
                    <span style={{ fontSize: 14 }}>{sage.icon}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 500,
                      color: isComplete ? sage.color : isActive ? sage.color : 'var(--text-tertiary)',
                    }}>
                      {sage.name}
                      {isComplete && ' ✓'}
                    </span>
                  </div>
                );
              })}
            </div>

            <Link to="/dialogue" style={{
              display: 'inline-block',
              background: 'linear-gradient(135deg, #7C4DFF, #BB86FC)',
              color: '#fff', borderRadius: 16, padding: '14px 40px',
              fontWeight: 700, fontSize: 15, textDecoration: 'none',
              boxShadow: '0 8px 32px rgba(124,77,255,0.2)',
              transition: 'all 0.3s',
            }}>
              开始对话 →
            </Link>
          </motion.div>
          <style>{`
            @keyframes sage-ring-pulse {
              0%, 100% { transform: scale(1); opacity: 0.3; }
              50% { transform: scale(1.15); opacity: 0.6; }
            }
          `}</style>
        </section>

        {/* ═══ CTA — 进入锻造炉 ═══ */}
        <section style={{ marginBottom: SECTION_GAP }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
            style={{
              background: 'linear-gradient(135deg, rgba(100,255,218,0.03), rgba(187,134,252,0.03))',
              border: '1px solid rgba(100,255,218,0.08)', borderRadius: 24,
              padding: '40px 32px', textAlign: 'center',
            }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔮</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10, fontFamily: 'var(--font-serif, serif)' }}>
              进入锻造炉
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24, maxWidth: 400, margin: '0 auto 24px', lineHeight: 1.8 }}>
              告诉我你想在现实中创造什么——锻造炉会将你的拓扑画像与需求碰撞，生成一份只属于你的行动蓝图。
            </p>
            <Link to="/forge" style={{
              display: 'inline-block',
              background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))',
              color: '#0a0a1a', borderRadius: 16, padding: '14px 40px',
              fontWeight: 700, fontSize: 15, textDecoration: 'none',
              boxShadow: '0 8px 32px rgba(100,255,218,0.15)',
              transition: 'all 0.3s',
            }}>
              开始锻造 →
            </Link>
          </motion.div>
        </section>

        {/* ═══ Footer actions ═══ */}
        <section style={{ textAlign: 'center', paddingBottom: 40 }}>
          {/* Sage dialogue progress */}
          <SageProgressRow />

          {/* Product concept cards */}
          <ProductConceptCards />

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/dialogue" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'linear-gradient(135deg, rgba(187,134,252,0.1), rgba(100,255,218,0.1))',
              border: '1px solid rgba(187,134,252,0.15)',
              borderRadius: 14, padding: '12px 24px', color: 'var(--text-primary)',
              textDecoration: 'none', fontSize: 14, fontWeight: 600,
              transition: 'all 0.3s', fontFamily: 'var(--font-sans)',
            }}>
              🏛️ 智者对话
            </Link>
            <Link to="/poster" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'linear-gradient(135deg, rgba(187,134,252,0.1), rgba(255,107,157,0.1))',
              border: '1px solid rgba(187,134,252,0.15)',
              borderRadius: 14, padding: '12px 24px', color: 'var(--accent-purple)',
              textDecoration: 'none', fontSize: 14, fontWeight: 600,
              transition: 'all 0.3s', fontFamily: 'var(--font-sans)',
            }}>
              🖼️ 生成海报
            </Link>
            <button
              onClick={handleApplyToOpenBasaka}
              type="button"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: applyStatus === 'done'
                  ? 'linear-gradient(135deg, rgba(100,255,218,0.16), rgba(255,215,0,0.12))'
                  : applyStatus === 'error'
                    ? 'linear-gradient(135deg, rgba(255,107,107,0.12), rgba(255,152,0,0.08))'
                    : 'linear-gradient(135deg, rgba(100,255,218,0.08), rgba(79,195,247,0.08))',
                border: applyStatus === 'error'
                  ? '1px solid rgba(255,107,107,0.18)'
                  : '1px solid rgba(100,255,218,0.16)',
                borderRadius: 14, padding: '12px 24px',
                color: applyStatus === 'error' ? 'var(--accent-red)' : 'var(--accent-cyan)',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.3s', fontFamily: 'var(--font-sans)',
              }}
            >
              {applyStatus === 'applying'
                ? '正在写回 Openbasaka...'
                : applyStatus === 'done'
                  ? '✅ 已应用到 Openbasaka'
                  : applyStatus === 'error'
                    ? '⚠️ 应用失败'
                    : '🧠 应用到 Openbasaka'}
            </button>
            <button
              onClick={handleExportOpenBasaka}
              type="button"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: exportStatus === 'done'
                  ? 'linear-gradient(135deg, rgba(100,255,218,0.14), rgba(255,215,0,0.12))'
                  : exportStatus === 'error'
                    ? 'linear-gradient(135deg, rgba(255,107,107,0.12), rgba(255,152,0,0.08))'
                    : 'linear-gradient(135deg, rgba(100,255,218,0.08), rgba(187,134,252,0.08))',
                border: exportStatus === 'error'
                  ? '1px solid rgba(255,107,107,0.18)'
                  : '1px solid rgba(100,255,218,0.16)',
                borderRadius: 14, padding: '12px 24px',
                color: exportStatus === 'error' ? 'var(--accent-red)' : 'var(--accent-cyan)',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.3s', fontFamily: 'var(--font-sans)',
              }}
            >
              {exportStatus === 'done'
                ? '✅ 已导出完整样本'
                : exportStatus === 'error'
                  ? '⚠️ 导出失败'
                  : '⬇ 导出 Openbasaka 样本'}
            </button>
            <button
              onClick={handleExportRemotionBundle}
              type="button"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: remotionExportStatus === 'done'
                  ? 'linear-gradient(135deg, rgba(255,214,10,0.14), rgba(255,128,171,0.12))'
                  : remotionExportStatus === 'error'
                    ? 'linear-gradient(135deg, rgba(255,107,107,0.12), rgba(255,128,171,0.08))'
                    : 'linear-gradient(135deg, rgba(255,214,10,0.08), rgba(255,128,171,0.08))',
                border: remotionExportStatus === 'error'
                  ? '1px solid rgba(255,107,107,0.18)'
                  : '1px solid rgba(255,214,10,0.16)',
                borderRadius: 14, padding: '12px 24px',
                color: remotionExportStatus === 'error' ? 'var(--accent-red)' : '#FFD60A',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.3s', fontFamily: 'var(--font-sans)',
              }}
            >
              {remotionExportStatus === 'done'
                ? '🎬 已导出叙事包'
                : remotionExportStatus === 'error'
                  ? '⚠️ 导出失败'
                  : '🎬 导出 Remotion 结果包'}
            </button>
            <Link to="/tracking" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 14, padding: '12px 24px', color: 'var(--text-secondary)',
              textDecoration: 'none', fontSize: 14, fontWeight: 600,
              transition: 'all 0.3s', fontFamily: 'var(--font-sans)',
            }}>
              进入追踪 →
            </Link>
          </div>
          <p style={{
            marginTop: 12,
            fontSize: 11,
            color: 'var(--text-tertiary)',
            lineHeight: 1.8,
          }}>
            现在可以直接把完整测评结果写回 Openbasaka 的 Boss Core；如果你还想保留独立样本或视频素材，再导出 Openbasaka 样本与 Remotion 结果包。
          </p>
          {applyStatus === 'done' && (
            <div style={{
              marginTop: 14,
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}>
              <button
                type="button"
                onClick={() => { window.location.hash = '#/sandbox'; }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(100,255,218,0.08)',
                  border: '1px solid rgba(100,255,218,0.16)',
                  borderRadius: 14,
                  padding: '10px 20px',
                  color: 'var(--accent-cyan)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                查看沙盘画像工坊
              </button>
              <button
                type="button"
                onClick={() => { window.location.hash = '#/ghost'; }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(187,134,252,0.08)',
                  border: '1px solid rgba(187,134,252,0.16)',
                  borderRadius: 14,
                  padding: '10px 20px',
                  color: '#BB86FC',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                去推演室看变化
              </button>
            </div>
          )}
        </section>

      </div>{/* end OUTER wrapper */}
    </div>
  );
}
