import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from '../lib/motion-lite';
import { useAssessmentStore } from '../store';
import {
  topologyToSocraticReport,
  getSageMockResponse,
  streamRoundtableSageInitial,
  streamRoundtableSageResponse,
} from '../engine/socratic';
import type { DialogueMessage } from '../engine/socratic';
import type { SageId } from '../types';
import { SAGE_MAP } from '../data/sages';
import {
  getRoundtableOrder,
  summarizeSageRound,
  ROUNDTABLE_TURNS_PER_SAGE,
  type RoundtableSageSummary,
} from '../engine/sage-orchestrator';

// ── 圆桌消息 —— 扩展标准 DialogueMessage 带上 sageId ──
interface RoundtableMessage extends DialogueMessage {
  sageId?: SageId;
}

export default function SocraticDialoguePage() {
  const navigate = useNavigate();
  const topology = useAssessmentStore(s => s.topology);
  const report = topology ? topologyToSocraticReport(topology) : null;

  // ── 圆桌核心状态 ──
  const [sageOrder, setSageOrder] = useState<SageId[]>([]);
  const [currentSageIdx, setCurrentSageIdx] = useState(0);
  const [userTurnsForCurrentSage, setUserTurnsForCurrentSage] = useState(0);
  const [sageSummaries, setSageSummaries] = useState<RoundtableSageSummary[]>([]);
  const [currentSageMessages, setCurrentSageMessages] = useState<RoundtableMessage[]>([]);

  // 全部消息（含所有智者和切换卡片）
  const [allMessages, setAllMessages] = useState<RoundtableMessage[]>([]);
  const [suggestedResponses, setSuggestedResponses] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [inputText, setInputText] = useState('');
  const [useMock, setUseMock] = useState(false);
  const [roundtableComplete, setRoundtableComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initCalled = useRef(false);

  const currentSageId = sageOrder[currentSageIdx] || null;
  const currentSage = currentSageId ? SAGE_MAP[currentSageId] : null;

  // ── 自动滚动 ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages.length, streamingText]);

  // ── 初始化圆桌 ──
  useEffect(() => {
    if (!topology || !report || initCalled.current) return;
    initCalled.current = true;

    const order = getRoundtableOrder(topology);
    setSageOrder(order);

    // 启动第一位智者
    const firstSageId = order[0];
    if (!firstSageId) return;

    startSageRound(firstSageId, 0, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topology, report]);

  // ── 启动某位智者的圆桌回合 ──
  const startSageRound = useCallback((sageId: SageId, sageIdx: number, prevSummaries: RoundtableSageSummary[]) => {
    if (!report || !topology) return;

    // 插入切换卡片
    if (sageIdx > 0) {
      const prevSage = sageOrder[sageIdx - 1];
      const prevName = prevSage ? SAGE_MAP[prevSage].name : '';
      const transitionMsg: RoundtableMessage = {
        id: `transition-${sageIdx}`,
        role: 'ai',
        content: `__TRANSITION__`,
        timestamp: Date.now(),
        sageId: sageId,
        metadata: { phase: 'observation' },
      };
      // Store prevName in a data attribute by encoding in content
      transitionMsg.content = `__TRANSITION__${prevName}__TO__${SAGE_MAP[sageId].name}`;
      setAllMessages(prev => [...prev, transitionMsg]);
    }

    setCurrentSageMessages([]);
    setUserTurnsForCurrentSage(0);
    setIsStreaming(true);
    setStreamingText('');

    streamRoundtableSageInitial(
      sageId,
      report,
      topology,
      prevSummaries,
      (token) => setStreamingText(prev => prev + token),
      (fullText, suggestions) => {
        setIsStreaming(false);
        setStreamingText('');
        const msg: RoundtableMessage = {
          id: `sage-${sageId}-0`,
          role: 'ai',
          content: fullText,
          timestamp: Date.now(),
          sageId,
          metadata: { phase: 'observation' },
        };
        setAllMessages(prev => [...prev, msg]);
        setCurrentSageMessages(prev => [...prev, msg]);
        setSuggestedResponses(suggestions);
      },
      (err) => {
        console.warn('Roundtable AI failed, using mock:', err);
        setIsStreaming(false);
        setStreamingText('');
        setUseMock(true);
        const mock = getSageMockResponse(sageId, report, 0);
        const msg: RoundtableMessage = {
          id: `sage-${sageId}-0`,
          role: 'ai',
          content: mock.content,
          timestamp: Date.now(),
          sageId,
          metadata: { phase: 'observation' },
        };
        setAllMessages(prev => [...prev, msg]);
        setCurrentSageMessages(prev => [...prev, msg]);
        setSuggestedResponses(mock.suggestions);
        setError('AI 服务暂不可用，已切换为预设对话模式');
      },
    );
  }, [report, topology, sageOrder]);

  // ── 发送消息 ──
  const handleSend = useCallback((text: string) => {
    if (!text.trim() || isStreaming || !currentSageId || !report || !topology) return;

    const userMsg: RoundtableMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };
    setAllMessages(prev => [...prev, userMsg]);
    setCurrentSageMessages(prev => [...prev, userMsg]);
    setInputText('');
    setSuggestedResponses([]);

    const newUserTurns = userTurnsForCurrentSage + 1;
    setUserTurnsForCurrentSage(newUserTurns);

    // 检查是否该切换到下一位智者
    if (newUserTurns >= ROUNDTABLE_TURNS_PER_SAGE) {
      // 当前智者回最后一轮，然后切换
      setIsStreaming(true);
      setStreamingText('');

      const replyFn = useMock ? handleMockReply : handleAIReply;
      replyFn(currentSageId, text.trim(), newUserTurns, true);
    } else {
      // 还在当前智者回合内
      setIsStreaming(true);
      setStreamingText('');

      const replyFn = useMock ? handleMockReply : handleAIReply;
      replyFn(currentSageId, text.trim(), newUserTurns, false);
    }
  }, [isStreaming, currentSageId, report, topology, userTurnsForCurrentSage, useMock, currentSageMessages, sageSummaries, currentSageIdx, sageOrder]);

  // ── AI 回复 ──
  const handleAIReply = useCallback((sageId: SageId, userText: string, turnCount: number, shouldTransition: boolean) => {
    if (!report || !topology) return;

    // Build history from currentSageMessages (only for this sage's round)
    const history = [...currentSageMessages];

    streamRoundtableSageResponse(
      sageId,
      report,
      topology,
      sageSummaries,
      history,
      userText,
      turnCount,
      (token) => setStreamingText(prev => prev + token),
      (fullText, suggestions) => {
        setIsStreaming(false);
        setStreamingText('');
        const msg: RoundtableMessage = {
          id: `sage-${sageId}-${turnCount}`,
          role: 'ai',
          content: fullText,
          timestamp: Date.now(),
          sageId,
          metadata: { phase: 'observation' },
        };
        setAllMessages(prev => [...prev, msg]);
        setCurrentSageMessages(prev => [...prev, msg]);
        setSuggestedResponses(suggestions);

        if (shouldTransition) {
          transitionToNextSage(sageId, msg);
        }
      },
      (err) => {
        console.warn('AI reply failed:', err);
        handleMockReply(sageId, userText, turnCount, shouldTransition);
      },
    );
  }, [report, topology, sageSummaries, currentSageMessages]);

  // ── Mock 回复 ──
  const handleMockReply = useCallback((sageId: SageId, _userText: string, turnCount: number, shouldTransition: boolean) => {
    if (!report) return;

    const mock = getSageMockResponse(sageId, report, turnCount);
    const msg: RoundtableMessage = {
      id: `sage-${sageId}-${turnCount}`,
      role: 'ai',
      content: mock.content,
      timestamp: Date.now(),
      sageId,
      metadata: { phase: 'observation' },
    };
    setIsStreaming(false);
    setStreamingText('');
    setAllMessages(prev => [...prev, msg]);
    setCurrentSageMessages(prev => [...prev, msg]);
    setSuggestedResponses(mock.suggestions);

    if (shouldTransition) {
      transitionToNextSage(sageId, msg);
    }
  }, [report]);

  // ── 切换到下一位智者 ──
  const transitionToNextSage = useCallback((completedSageId: SageId, _lastMsg: RoundtableMessage) => {
    // 生成当前智者的摘要
    const allCurrent = [...currentSageMessages];
    const summary = summarizeSageRound(completedSageId, allCurrent);
    const newSummaries = [...sageSummaries, summary];
    setSageSummaries(newSummaries);

    const nextIdx = currentSageIdx + 1;
    if (nextIdx >= sageOrder.length) {
      // 圆桌结束
      setRoundtableComplete(true);
      return;
    }

    setCurrentSageIdx(nextIdx);
    const nextSageId = sageOrder[nextIdx];

    // 延迟启动下一位智者（给用户喘息时间）
    setTimeout(() => {
      startSageRound(nextSageId, nextIdx, newSummaries);
    }, 1500);
  }, [currentSageMessages, sageSummaries, currentSageIdx, sageOrder, startSageRound]);

  // ── 无数据 fallback ──
  if (!topology || !report) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-primary)', color: 'var(--text-primary)', flexDirection: 'column', gap: 16,
      }}>
        <p style={{ fontSize: 48 }}>🏛️</p>
        <h2 style={{ fontSize: 20 }}>需要先完成测评</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>完成所有维度的测评后，智者圆桌将为你开启</p>
        <button onClick={() => navigate('/')} style={{
          marginTop: 12, padding: '10px 24px', borderRadius: 12, fontSize: 14,
          background: 'linear-gradient(135deg, #7C4DFF, #E040FB)',
          color: '#fff', border: 'none', cursor: 'pointer',
        }}>返回首页</button>
      </div>
    );
  }

  // ── 清理内容（移除 suggestions 块残留） ──
  const cleanContent = (text: string) => text
    .replace(/```suggestions[\s\S]*?```/g, '')
    .replace(/```suggestions[\s\S]*/g, '')
    .trim();

  // ── 渲染消息 ──
  const renderMessage = (msg: RoundtableMessage, index: number) => {
    // 切换卡片
    if (msg.content.startsWith('__TRANSITION__')) {
      const parts = msg.content.replace('__TRANSITION__', '').split('__TO__');
      const fromName = parts[0] || '';
      const toName = parts[1] || '';
      const toSage = msg.sageId ? SAGE_MAP[msg.sageId] : null;

      return (
        <motion.div
          key={msg.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          style={{
            margin: '24px auto', padding: '16px 24px', maxWidth: 420,
            textAlign: 'center', borderRadius: 16, position: 'relative',
            background: `linear-gradient(135deg, ${toSage?.color || '#7C4DFF'}08, ${toSage?.color || '#7C4DFF'}15)`,
            border: `1px solid ${toSage?.color || '#7C4DFF'}30`,
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
            {fromName} 观察完毕
          </div>
          <div style={{ fontSize: 24, marginBottom: 6 }}>{toSage?.icon || '🔄'}</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: toSage?.color || '#E040FB' }}>
            {toName} 接力发言
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
            {toSage?.description?.slice(0, 40)}…
          </div>
        </motion.div>
      );
    }

    const isAI = msg.role === 'ai';
    const sage = msg.sageId ? SAGE_MAP[msg.sageId] : null;

    return (
      <motion.div
        key={msg.id}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        style={{
          display: 'flex', gap: 12, marginBottom: 16,
          flexDirection: isAI ? 'row' : 'row-reverse',
        }}
      >
        {/* 智者头像 */}
        {isAI && sage && (
          <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${sage.color}20`, border: `1px solid ${sage.color}40`,
            fontSize: 18,
          }}>
            {sage.icon}
          </div>
        )}

        <div style={{ maxWidth: '75%' }}>
          {/* 智者名称 */}
          {isAI && sage && (
            <div style={{
              fontSize: 11, fontWeight: 600, marginBottom: 4,
              color: sage.color, letterSpacing: '0.5px',
            }}>
              {sage.icon} {sage.name}
            </div>
          )}

          {/* 消息气泡 */}
          <div style={{
            padding: '12px 16px', borderRadius: isAI ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
            fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            background: isAI
              ? `linear-gradient(135deg, ${sage?.color || '#E040FB'}08, ${sage?.color || '#E040FB'}15)`
              : 'rgba(255,255,255,0.06)',
            border: isAI
              ? `1px solid ${sage?.color || '#E040FB'}20`
              : '1px solid rgba(255,255,255,0.08)',
            color: 'var(--text-primary)',
          }}
            dangerouslySetInnerHTML={{
              __html: cleanContent(msg.content || '')
                .replace(/\*\*(.+?)\*\*/g, '<strong style="color:' + (sage?.color || '#E040FB') + '">$1</strong>')
                .replace(/\n/g, '<br/>'),
            }}
          />
        </div>
      </motion.div>
    );
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: 'var(--bg-primary)',
    }}>
      {/* ── 顶部圆桌进度条 ── */}
      <div style={{
        padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        {/* 标题 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <button onClick={() => navigate(-1)} style={{
            background: 'none', border: 'none', color: 'var(--text-secondary)',
            cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4,
          }}>
            ← 返回
          </button>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            🏛️ 智者圆桌
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {currentSageIdx + 1}/{sageOrder.length}
          </div>
        </div>

        {/* 智者进度芯片 */}
        <div style={{
          display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4,
          scrollbarWidth: 'none',
        }}>
          {sageOrder.map((sageId, idx) => {
            const sage = SAGE_MAP[sageId];
            const isActive = idx === currentSageIdx;
            const isDone = idx < currentSageIdx;
            const isFuture = idx > currentSageIdx;

            return (
              <div
                key={sageId}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: isActive ? '6px 14px' : '6px 10px',
                  borderRadius: 20, fontSize: 12, fontWeight: isActive ? 600 : 400,
                  whiteSpace: 'nowrap', flexShrink: 0,
                  transition: 'all 0.3s ease',
                  background: isActive
                    ? `${sage.color}20`
                    : isDone
                      ? 'rgba(100,255,218,0.08)'
                      : 'rgba(255,255,255,0.03)',
                  border: isActive
                    ? `1.5px solid ${sage.color}60`
                    : isDone
                      ? '1px solid rgba(100,255,218,0.2)'
                      : '1px solid rgba(255,255,255,0.06)',
                  color: isActive
                    ? sage.color
                    : isDone
                      ? '#64FFDA'
                      : 'var(--text-tertiary)',
                  opacity: isFuture ? 0.5 : 1,
                  transform: isActive ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                <span style={{ fontSize: isActive ? 16 : 13 }}>{isDone ? '✓' : sage.icon}</span>
                {(isActive || isDone) && <span>{sage.name}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 消息流 ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
        {/* 开场横幅 */}
        {allMessages.length === 0 && !isStreaming && (
          <div style={{
            textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)',
          }}>
            <p style={{ fontSize: 40, marginBottom: 12 }}>🏛️</p>
            <p style={{ fontSize: 16, fontWeight: 600 }}>智者圆桌即将开始</p>
            <p style={{ fontSize: 13, marginTop: 8, color: 'var(--text-tertiary)' }}>
              {sageOrder.length} 位智者将依次从不同视角解读你的拓扑画像
            </p>
          </div>
        )}

        <AnimatePresence>
          {allMessages.map((msg, i) => renderMessage(msg, i))}
        </AnimatePresence>

        {/* streaming 气泡 */}
        {isStreaming && streamingText && currentSage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ display: 'flex', gap: 12, marginBottom: 16 }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${currentSage.color}20`, border: `1px solid ${currentSage.color}40`,
              fontSize: 18,
            }}>
              {currentSage.icon}
            </div>
            <div style={{ maxWidth: '75%' }}>
              <div style={{
                fontSize: 11, fontWeight: 600, marginBottom: 4,
                color: currentSage.color, letterSpacing: '0.5px',
              }}>
                {currentSage.icon} {currentSage.name}
                <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 10 }}>正在思考…</span>
              </div>
              <div style={{
                padding: '12px 16px', borderRadius: '4px 16px 16px 16px',
                fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap',
                background: `linear-gradient(135deg, ${currentSage.color}08, ${currentSage.color}15)`,
                border: `1px solid ${currentSage.color}20`,
                color: 'var(--text-primary)',
              }}
                dangerouslySetInnerHTML={{
                  __html: cleanContent(streamingText)
                    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:' + currentSage.color + '">$1</strong>')
                    .replace(/\n/g, '<br/>'),
                }}
              />
            </div>
          </motion.div>
        )}

        {/* streaming loading 指示 */}
        {isStreaming && !streamingText && currentSage && (
          <div style={{
            display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${currentSage.color}20`, border: `1px solid ${currentSage.color}40`,
              fontSize: 18, animation: 'pulse 1.5s ease-in-out infinite',
            }}>
              {currentSage.icon}
            </div>
            <div style={{
              fontSize: 13, color: currentSage.color, opacity: 0.7,
            }}>
              {currentSage.name} 正在组织观察…
            </div>
          </div>
        )}

        {error && (
          <div style={{
            margin: '8px 0', padding: '8px 14px', borderRadius: 8,
            fontSize: 12, background: 'rgba(255,107,107,0.1)',
            border: '1px solid rgba(255,107,107,0.2)', color: '#FF6B6B',
          }}>⚠️ {error}</div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── 建议回复 ── */}
      {suggestedResponses.length > 0 && !isStreaming && !roundtableComplete && (
        <div style={{
          padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.04)',
        }}>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>建议回复:</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {suggestedResponses.map((s, i) => (
              <button
                key={i}
                onClick={() => handleSend(s)}
                style={{
                  padding: '8px 14px', borderRadius: 20, fontSize: 12,
                  background: `${currentSage?.color || '#E040FB'}10`,
                  border: `1px solid ${currentSage?.color || '#E040FB'}30`,
                  color: currentSage?.color || '#E040FB',
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
              >{s}</button>
            ))}
          </div>
        </div>
      )}

      {/* ── 底部输入区 / 完成状态 ── */}
      {!roundtableComplete ? (
        <div style={{
          padding: '16px 16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend(inputText)}
              placeholder={currentSage ? `对 ${currentSage.name} 说…` : '说说你的想法…'}
              disabled={isStreaming}
              style={{
                flex: 1, padding: '12px 18px', borderRadius: 14,
                fontSize: 14, background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${currentSage?.color || '#fff'}15`,
                color: 'var(--text-primary)', outline: 'none',
              }}
            />
            <button
              onClick={() => handleSend(inputText)}
              disabled={!inputText.trim() || isStreaming}
              style={{
                padding: '12px 24px', borderRadius: 14,
                fontSize: 14, fontWeight: 600,
                background: `linear-gradient(135deg, ${currentSage?.color || '#E040FB'}CC, ${currentSage?.color || '#E040FB'})`,
                color: '#fff', border: 'none', cursor: 'pointer',
                opacity: !inputText.trim() || isStreaming ? 0.4 : 1,
                transition: 'opacity 0.2s',
              }}
            >发送</button>
          </div>
          <p style={{
            fontSize: 11, marginTop: 8, textAlign: 'center',
            color: 'var(--text-tertiary)',
          }}>
            {currentSage && (
              <>
                {currentSage.icon} {currentSage.name} ·
                {useMock ? ' 预设对话模式' : ' AI 驱动'} ·
                轮次 {userTurnsForCurrentSage}/{ROUNDTABLE_TURNS_PER_SAGE}
              </>
            )}
          </p>
        </div>
      ) : (
        <div style={{
          padding: '24px 20px', textAlign: 'center',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>✨</p>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            智者圆桌讨论完成
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
            {sageSummaries.length} 位智者从不同视角剖析了你的拓扑画像
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/')}
              style={{
                padding: '10px 24px', borderRadius: 12, fontSize: 13,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >返回首页</button>
            <button
              onClick={() => navigate('/forge')}
              style={{
                padding: '10px 24px', borderRadius: 12, fontSize: 13,
                background: 'linear-gradient(135deg, #7C4DFF, #E040FB)',
                color: '#fff', border: 'none', cursor: 'pointer',
              }}
            >进入锻造炉 →</button>
            <button
              onClick={() => {
                initCalled.current = false;
                setAllMessages([]);
                setCurrentSageIdx(0);
                setSageSummaries([]);
                setRoundtableComplete(false);
                setUseMock(false);
                setError(null);
                const order = getRoundtableOrder(topology!);
                setSageOrder(order);
                startSageRound(order[0], 0, []);
              }}
              style={{
                padding: '10px 24px', borderRadius: 12, fontSize: 13,
                background: 'rgba(100,255,218,0.08)',
                border: '1px solid rgba(100,255,218,0.2)',
                color: '#64FFDA', cursor: 'pointer',
              }}
            >重新开始圆桌</button>
          </div>
        </div>
      )}

      {/* pulse 动画 */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.95); }
        }
      `}</style>
    </div>
  );
}
