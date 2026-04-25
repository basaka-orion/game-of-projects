import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from '../lib/motion-lite';
import { useAssessmentStore } from '../store';
import { streamForgeGenesis } from '../engine/matchmaking';
import type { DimensionTopology, CrossDimensionReaction } from '../types';

/* ═══════════════════════════════════════════════════
   常量 & 颜色系统
   ═══════════════════════════════════════════════════ */

const PRESETS = [
  { label: '开发一款 App', icon: '📱', demand: '开发一款面向用户的数字产品（App），从概念到上线完整规划' },
  { label: '写一本书', icon: '📖', demand: '写一本有深度和影响力的书，从选题到出版全流程' },
  { label: '建一个品牌', icon: '🏷️', demand: '从零打造一个有辨识度的个人或商业品牌' },
  { label: '做一个开源项目', icon: '🌐', demand: '创建并维护一个有影响力的开源项目' },
  { label: '创作一门课程', icon: '🎓', demand: '设计一门有体系的在线课程或教学内容' },
  { label: '搭建一个社区', icon: '🏘️', demand: '建设一个有凝聚力的线上或线下社区' },
  { label: '发起一个创业项目', icon: '🚀', demand: '从零启动一个创业项目并完成MVP验证' },
  { label: '制作一部短纪录片', icon: '🎬', demand: '独立制作一部有意义的短纪录片' },
];

const CHAPTER_COLORS: Record<string, string> = {
  overview: '#64FFDA',
  architecture: '#BB86FC',
  modules: '#FF80AB',
  roadmap: '#FFD740',
  risks: '#FF6B6B',
  team: '#4FC3F7',
};

const REACTION_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  resonance: { bg: 'rgba(100,255,218,0.06)', border: 'rgba(100,255,218,0.2)', text: '#64FFDA' },
  friction:  { bg: 'rgba(255,128,171,0.06)', border: 'rgba(255,128,171,0.2)', text: '#FF80AB' },
  paradox:   { bg: 'rgba(187,134,252,0.06)', border: 'rgba(187,134,252,0.2)', text: '#BB86FC' },
  catalyst:  { bg: 'rgba(255,215,64,0.06)',  border: 'rgba(255,215,64,0.2)',  text: '#FFD740' },
};

const REACTION_LABELS: Record<string, string> = {
  resonance: '共振', friction: '摩擦', paradox: '悖论', catalyst: '催化',
};

/* ═══════════════════════════════════════════════════
   Markdown → React 渲染器
   ═══════════════════════════════════════════════════ */

function renderMarkdown(md: string): React.ReactNode[] {
  if (!md) return [];
  const lines = md.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let listItems: React.ReactNode[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let tableRows: string[][] = [];
  let tableHeader: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      if (listType === 'ol') {
        elements.push(<ol key={`ol-${elements.length}`} style={listStyle}>{listItems}</ol>);
      } else {
        elements.push(<ul key={`ul-${elements.length}`} style={listStyle}>{listItems}</ul>);
      }
      listItems = [];
      listType = null;
    }
  };

  const flushTable = () => {
    if (tableHeader.length > 0) {
      elements.push(
        <div key={`tbl-${elements.length}`} style={{ overflowX: 'auto', margin: '16px 0' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                {tableHeader.map((h, hi) => (
                  <th key={hi} style={thStyle}>{inlineFormat(h.trim())}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={tdStyle}>{inlineFormat(cell.trim())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableHeader = [];
      tableRows = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Table row
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      flushList();
      const cells = line.trim().slice(1, -1).split('|').map(c => c.trim());
      // Check if this is a separator row
      if (cells.every(c => /^[-:]+$/.test(c))) {
        i++;
        continue;
      }
      if (tableHeader.length === 0) {
        tableHeader = cells;
      } else {
        tableRows.push(cells);
      }
      i++;
      continue;
    } else {
      flushTable();
    }

    // Heading
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4';
      elements.push(
        <Tag key={`h-${i}`} style={{
          ...headingStyles[level],
          marginTop: level <= 2 ? 28 : 20,
          marginBottom: level <= 2 ? 12 : 8,
        }}>{inlineFormat(text)}</Tag>
      );
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      flushList();
      elements.push(
        <blockquote key={`bq-${i}`} style={quoteStyle}>
          {inlineFormat(line.slice(2))}
        </blockquote>
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      flushList();
      elements.push(<hr key={`hr-${i}`} style={hrStyle} />);
      i++;
      continue;
    }

    // Checkbox list
    const cbMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)/);
    if (cbMatch) {
      if (listType !== 'ul') { flushList(); listType = 'ul'; }
      const checked = cbMatch[1] !== ' ';
      listItems.push(
        <li key={`li-${i}`} style={{ ...liStyle, listStyle: 'none', paddingLeft: 0 }}>
          <span style={{ marginRight: 8, opacity: checked ? 1 : 0.4 }}>{checked ? '✅' : '⬜'}</span>
          {inlineFormat(cbMatch[2])}
        </li>
      );
      i++;
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^[-*]\s+(.*)/);
    if (ulMatch) {
      if (listType !== 'ul') { flushList(); listType = 'ul'; }
      listItems.push(
        <li key={`li-${i}`} style={liStyle}>{inlineFormat(ulMatch[1])}</li>
      );
      i++;
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\d+\.\s+(.*)/);
    if (olMatch) {
      if (listType !== 'ol') { flushList(); listType = 'ol'; }
      listItems.push(
        <li key={`li-${i}`} style={liStyle}>{inlineFormat(olMatch[1])}</li>
      );
      i++;
      continue;
    }

    // Empty line
    if (!line.trim()) {
      flushList();
      i++;
      continue;
    }

    // Paragraph
    flushList();
    elements.push(
      <p key={`p-${i}`} style={pStyle}>{inlineFormat(line)}</p>
    );
    i++;
  }

  flushList();
  flushTable();
  return elements;
}

/** Inline formatting: **bold**, *italic*, `code`, 【trait】 */
function inlineFormat(text: string): React.ReactNode {
  // Split by patterns and reconstruct
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\【(.+?)\】)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Push text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // **bold**
      parts.push(<strong key={`b-${keyIdx++}`} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{match[2]}</strong>);
    } else if (match[3]) {
      // *italic*
      parts.push(<em key={`i-${keyIdx++}`} style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>{match[4]}</em>);
    } else if (match[5]) {
      // `code`
      parts.push(
        <code key={`c-${keyIdx++}`} style={{
          padding: '1px 6px', borderRadius: 4,
          background: 'rgba(100,255,218,0.08)',
          border: '1px solid rgba(100,255,218,0.12)',
          color: '#64FFDA', fontSize: '0.82em', fontFamily: 'var(--font-mono, monospace)',
        }}>{match[6]}</code>
      );
    } else if (match[7]) {
      // 【trait】
      parts.push(
        <span key={`t-${keyIdx++}`} style={{
          padding: '1px 8px', borderRadius: 10,
          background: 'rgba(187,134,252,0.1)',
          border: '1px solid rgba(187,134,252,0.2)',
          color: '#BB86FC', fontSize: '0.88em', fontWeight: 500,
        }}>{'【'}{match[8]}{'】'}</span>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Push remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 0 ? text : <>{parts}</>;
}

/* Styles */
const headingStyles: Record<number, React.CSSProperties> = {
  1: { fontSize: '1.3rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', letterSpacing: '-0.01em' },
  2: { fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' },
  3: { fontSize: '0.95rem', fontWeight: 600, color: '#64FFDA' },
  4: { fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' },
};
const pStyle: React.CSSProperties = { fontSize: '0.85rem', lineHeight: 1.8, color: 'var(--text-secondary)', margin: '6px 0' };
const listStyle: React.CSSProperties = { margin: '8px 0', paddingLeft: 20 };
const liStyle: React.CSSProperties = { fontSize: '0.84rem', lineHeight: 1.75, color: 'var(--text-secondary)', marginBottom: 4 };
const quoteStyle: React.CSSProperties = {
  margin: '12px 0', padding: '10px 16px', borderLeft: '3px solid #BB86FC',
  background: 'rgba(187,134,252,0.04)', borderRadius: '0 8px 8px 0',
  fontSize: '0.84rem', lineHeight: 1.7, color: 'var(--text-secondary)', fontStyle: 'italic',
};
const hrStyle: React.CSSProperties = {
  border: 'none', height: 1, margin: '24px 0',
  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
};
const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem',
};
const thStyle: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left', fontWeight: 600,
  color: '#64FFDA', borderBottom: '2px solid rgba(100,255,218,0.15)',
  fontSize: '0.72rem', textTransform: 'uppercase' as const, letterSpacing: 0.5,
};
const tdStyle: React.CSSProperties = {
  padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)',
  color: 'var(--text-secondary)', lineHeight: 1.6,
};

/* ═══════════════════════════════════════════════════
   主组件
   ═══════════════════════════════════════════════════ */

export default function ForgePage() {
  const navigate = useNavigate();
  const { topology, setForgeGenesisDoc } = useAssessmentStore();
  const [demand, setDemand] = useState('');
  const [isForging, setIsForging] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [activeChapter, setActiveChapter] = useState(0);
  const [chapterStreams, setChapterStreams] = useState<string[]>(Array(6).fill(''));
  const [chapterDone, setChapterDone] = useState<boolean[]>(Array(6).fill(false));
  const [error, setError] = useState('');
  const [showProfile, setShowProfile] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const chapterRefs = useRef<(HTMLDivElement | null)[]>([]);

  /* Auto-scroll during streaming */
  useEffect(() => {
    if (isForging) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  }, [chapterStreams, isForging]);

  /* ── 下载完整 Markdown ── */
  const downloadMarkdown = () => {
    const CHAPTER_NAMES = ['📐 项目概览', '🏗️ 技术架构', '🧩 功能模块', '🗺️ 开发路线图', '🛡️ 风险与缓解', '👥 团队与工具'];
    const lines: string[] = [
      `# 创世蓝图 · ${topology?.selfArchetype || ''}`,
      '',
      `> 需求描述：${demand}`,
      `> 生成时间：${new Date().toLocaleString('zh-CN')}`,
      '',
      '---',
      '',
    ];
    chapterStreams.forEach((md, idx) => {
      if (md) {
        lines.push(`# ${CHAPTER_NAMES[idx]}`, '', md, '', '---', '');
      }
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `创世蓝图_${demand.slice(0, 20).replace(/[\s/\\]/g, '_')}_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── 未解锁 ── */
  if (!topology) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: '2rem 1.5rem',
        fontFamily: 'var(--font-sans)',
      }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🔮</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '1rem', fontFamily: 'var(--font-display)' }}>
            尚无拓扑画像
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2rem', maxWidth: 400 }}>
            完成评测并生成你的拓扑画像后，即可进入锻造炉
          </p>
          <Link to="/assessment" style={{
            display: 'inline-block', padding: '12px 28px', borderRadius: 12,
            background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))',
            color: '#0A0E1A', fontWeight: 600, fontSize: '0.9rem', textDecoration: 'none',
          }}>去评测 →</Link>
        </motion.div>
      </div>
    );
  }

  /* ── 派生数据 ── */
  const dims = Object.values(topology.dimensionTopologies);
  const allTraits = dims.flatMap(d => d.dominantTraits).filter(t => t.typology !== '待识别');
  const totalFlow = dims.reduce((n, d) => n + d.energyDynamics.flowZones.length, 0);
  const totalDrain = dims.reduce((n, d) => n + d.energyDynamics.drainZones.length, 0);

  /* ── 锻造 ── */
  const handleForge = async () => {
    if (!demand.trim() || isForging) return;
    setIsForging(true);
    setIsComplete(false);
    setChapterStreams(Array(6).fill(''));
    setChapterDone(Array(6).fill(false));
    setError('');
    setShowProfile(false);
    setActiveChapter(0);

    await streamForgeGenesis(
      topology,
      demand,
      {
        onChapterStart: (idx) => {
          setActiveChapter(idx);
        },
        onToken: (idx, token) => {
          setChapterStreams(prev => {
            const next = [...prev];
            next[idx] = (next[idx] || '') + token;
            return next;
          });
        },
        onChapterDone: (idx, content) => {
          // Ensure chapterStreams is synced with final content
          setChapterStreams(prev => {
            const next = [...prev];
            next[idx] = content;
            return next;
          });
          setChapterDone(prev => {
            const next = [...prev];
            next[idx] = true;
            return next;
          });
        },
        onAllDone: (doc) => {
          setForgeGenesisDoc(doc);
          setIsForging(false);
          setIsComplete(true);
        },
        onError: (err) => {
          setError(err);
        },
      },
    );
  };

  const scrollToChapter = (idx: number) => {
    setActiveChapter(idx);
    chapterRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* ── 章节元数据 ── */
  const chapterMeta = [
    { key: 'overview', title: '📐 项目概览', icon: '📐' },
    { key: 'architecture', title: '🏗️ 技术架构', icon: '🏗️' },
    { key: 'modules', title: '🧩 功能模块', icon: '🧩' },
    { key: 'roadmap', title: '🗺️ 开发路线图', icon: '🗺️' },
    { key: 'risks', title: '🛡️ 风险与缓解', icon: '🛡️' },
    { key: 'team', title: '👥 团队与工具', icon: '👥' },
  ];

  const hasOutput = isForging || isComplete || chapterStreams.some(s => s.length > 0);

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '4rem', fontFamily: 'var(--font-sans)' }}>
      {/* ═══ Header ═══ */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '1.5rem 2rem', maxWidth: 960, margin: '0 auto',
      }}>
        <button onClick={() => navigate(-1)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-tertiary)', fontSize: '0.85rem',
          padding: '6px 12px', borderRadius: 8,
        }}>← 返回</button>
        <span style={{
          fontSize: '0.72rem', color: 'var(--text-tertiary)',
          padding: '4px 12px', borderRadius: 20,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
        }}>锻造炉</span>
      </div>

      {/* ═══ Hero ═══ */}
      <section style={{ textAlign: 'center', padding: '1.5rem 1.5rem 2rem', maxWidth: 720, margin: '0 auto' }}>
        <div style={{ animation: 'fadeSlideIn 0.4s ease-out both' }}>
          <div style={{
            fontSize: '3.5rem', marginBottom: '1rem',
            filter: 'drop-shadow(0 0 24px rgba(255,215,64,0.3))',
          }}>🔮</div>
          <h1 style={{
            fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', fontWeight: 700,
            marginBottom: '0.6rem', fontFamily: 'var(--font-display)',
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #FFD740, #FF80AB)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>锻造你的创世蓝图</h1>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
            基于你的拓扑画像 · <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>{topology.selfArchetype}</span>
          </p>
          <p style={{
            fontSize: '0.78rem', color: 'var(--text-tertiary)',
            lineHeight: 1.7, maxWidth: 540, margin: '0 auto',
          }}>
            锻造炉将深度分析你的认知特质、能量图谱与创作需求，生成一份<strong style={{ color: 'var(--text-secondary)' }}>六章专业级开发文档</strong>——从项目愿景到技术架构，从功能规格到风险评估，全方位可执行
          </p>
        </div>
      </section>

      {/* ═══ 画像速览 ═══ */}
      {showProfile && !hasOutput && (
        <ProfileSection
          topology={topology}
          dims={dims}
          allTraits={allTraits}
          totalFlow={totalFlow}
          totalDrain={totalDrain}
          onCollapse={() => setShowProfile(false)}
        />
      )}

      {!showProfile && !hasOutput && (
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <button onClick={() => setShowProfile(true)} style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.06)',
            padding: '5px 18px', borderRadius: 20, cursor: 'pointer',
            fontSize: '0.7rem', color: 'var(--text-tertiary)',
          }}>展开画像速览 ▼</button>
        </div>
      )}

      {/* ═══ Input Section ═══ */}
      {!hasOutput && (
        <section style={{ maxWidth: 640, margin: '0 auto', padding: '0 1.5rem' }}>
          <div style={{ animation: 'fadeSlideIn 0.35s ease-out 0.15s both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '0 2px' }}>
              <span style={{ fontSize: 14 }}>🎯</span>
              <span style={{
                fontSize: '0.72rem', fontWeight: 600, color: '#FF80AB',
                textTransform: 'uppercase' as const, letterSpacing: 1,
              }}>定义你的造物目标</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: '1.2rem' }}>
              {PRESETS.map(p => {
                const active = demand === p.demand;
                return (
                  <motion.button
                    key={p.label}
                    whileHover={{ y: -2, transition: { duration: 0.2 } }}
                    onClick={() => setDemand(p.demand)}
                    style={{
                      padding: '7px 14px', borderRadius: 20, fontSize: '0.75rem', cursor: 'pointer',
                      background: active ? 'rgba(100,255,218,0.12)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${active ? 'rgba(100,255,218,0.35)' : 'rgba(255,255,255,0.08)'}`,
                      color: active ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                      fontWeight: active ? 600 : 400, transition: 'all 0.3s ease',
                    }}
                  >{p.icon} {p.label}</motion.button>
                );
              })}
            </div>

            <div className="glass-card" style={{
              padding: '18px 22px', position: 'relative',
              borderColor: demand.trim() ? 'rgba(100,255,218,0.15)' : undefined,
              transition: 'border-color 0.3s',
            }}>
              {demand.trim() && (
                <div style={{
                  position: 'absolute', top: 0, left: '15%', right: '15%', height: 2,
                  background: 'linear-gradient(90deg, transparent, var(--accent-cyan), transparent)',
                  opacity: 0.4,
                }} />
              )}
              <textarea
                value={demand}
                onChange={e => setDemand(e.target.value)}
                placeholder={'描述你想创造的东西...\n例如：开发一款帮助焦虑人群冥想的 App，核心是用声音引导呼吸'}
                rows={4}
                style={{
                  width: '100%', background: 'transparent', border: 'none',
                  outline: 'none', resize: 'none', fontSize: '0.85rem',
                  color: 'var(--text-primary)', lineHeight: 1.7, fontFamily: 'var(--font-sans)',
                }}
              />
            </div>

            {demand.trim() && allTraits.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                style={{
                  margin: '12px 0', padding: '10px 16px',
                  background: 'rgba(100,255,218,0.04)', borderRadius: 10,
                  border: '1px solid rgba(100,255,218,0.08)',
                }}
              >
                <div style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)', fontWeight: 600, marginBottom: 6 }}>
                  ✨ 将与以下特质碰撞 · 生成 6 章专业开发文档
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {allTraits.slice(0, 6).map((t, i) => (
                    <span key={i} style={{
                      fontSize: '0.68rem', padding: '3px 10px', borderRadius: 12,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
                    }}>{t.typology}</span>
                  ))}
                  {allTraits.length > 6 && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>+{allTraits.length - 6} 更多</span>
                  )}
                </div>
              </motion.div>
            )}

            <div style={{ textAlign: 'center', marginTop: '1.2rem' }}>
              <motion.button
                whileHover={demand.trim() && !isForging ? { scale: 1.03, y: -2 } : {}}
                whileTap={demand.trim() && !isForging ? { scale: 0.97 } : {}}
                onClick={handleForge}
                disabled={!demand.trim() || isForging}
                style={{
                  padding: '14px 40px', borderRadius: 14, border: 'none',
                  fontSize: '1rem', fontWeight: 700,
                  cursor: demand.trim() && !isForging ? 'pointer' : 'not-allowed',
                  background: demand.trim()
                    ? 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))'
                    : 'rgba(255,255,255,0.06)',
                  color: demand.trim() ? '#0A0E1A' : 'var(--text-tertiary)',
                  opacity: demand.trim() && !isForging ? 1 : 0.5,
                  transition: 'all 0.3s ease',
                  boxShadow: demand.trim() ? '0 4px 20px rgba(100,255,218,0.15)' : 'none',
                }}
              >
                {isForging ? '⚡ 锻造中...' : '🔮 开始锻造 · 创世蓝图'}
              </motion.button>
            </div>
          </div>
        </section>
      )}

      {/* ═══ 生成输出 ═══ */}
      {hasOutput && (
          <div style={{ animation: 'fadeSlideIn 0.4s ease-out both' }}>
            {/* ── Progress Header ── */}
            <section style={{ maxWidth: 960, margin: '0 auto 1.5rem', padding: '0 1.5rem' }}>
              <div className="glass-card" style={{
                padding: '20px 24px', position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                  background: 'linear-gradient(90deg, #64FFDA, #BB86FC, #FF80AB, #FFD740, #FF6B6B, #4FC3F7)',
                }} />

                {/* Title row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <span style={{ fontSize: 28 }}>⚒️</span>
                  <div>
                    <h2 style={{
                      fontSize: '1.1rem', fontWeight: 700, margin: 0,
                      fontFamily: 'var(--font-display)',
                      background: 'linear-gradient(135deg, #64FFDA, #BB86FC)',
                      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>{isForging ? '创世蓝图锻造中...' : '创世蓝图锻造完成'}</h2>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
                      基于「{topology.selfArchetype}」× {allTraits.length} 项特质
                    </p>
                  </div>
                  {/* Action buttons */}
                  {isComplete && (
                    <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                      <button
                        onClick={downloadMarkdown}
                        style={{
                          padding: '6px 14px', borderRadius: 10, cursor: 'pointer',
                          fontSize: '0.72rem', fontWeight: 600,
                          background: 'linear-gradient(135deg, #64FFDA20, #64FFDA10)',
                          border: '1px solid #64FFDA40', color: '#64FFDA',
                          display: 'flex', alignItems: 'center', gap: 5,
                          transition: 'all 0.2s',
                        }}
                      >📥 导出 Markdown</button>
                      <button
                        onClick={() => {
                          setIsComplete(false);
                          setChapterStreams(Array(6).fill(''));
                          setChapterDone(Array(6).fill(false));
                        }}
                        style={{
                          padding: '6px 14px', borderRadius: 10, cursor: 'pointer',
                          fontSize: '0.72rem', fontWeight: 600,
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-secondary)',
                          transition: 'all 0.2s',
                        }}
                      >🔄 重新锻造</button>
                    </div>
                  )}
                </div>

                {/* Chapter navigation chips */}
                <div style={{
                  display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12,
                }}
                >
                  {chapterMeta.map((ch, idx) => {
                    const color = CHAPTER_COLORS[ch.key] || '#64FFDA';
                    const content = chapterStreams[idx];
                    const isDone = chapterDone[idx];
                    const isCurrent = idx === activeChapter && isForging;
                    const isPending = !isDone && !isCurrent && !content;
                    return (
                      <button
                        key={ch.key}
                        onClick={() => scrollToChapter(idx)}
                        style={{
                          padding: '5px 12px', borderRadius: 16, cursor: 'pointer',
                          fontSize: '0.68rem', fontWeight: isCurrent || isDone ? 600 : 400,
                          background: isCurrent ? `${color}15` : isDone ? `${color}0A` : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${isCurrent ? `${color}40` : isDone ? `${color}15` : 'rgba(255,255,255,0.04)'}`,
                          color: isPending ? 'var(--text-tertiary)' : color,
                          transition: 'all 0.3s',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        {isCurrent && (
                          <motion.span
                            animate={{ opacity: [0.4, 1, 0.4] }}
                            transition={{ repeat: Infinity, duration: 1.2 }}
                            style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: color }}
                          />
                        )}
                        {isDone && <span>✓</span>}
                        {ch.title}
                      </button>
                    );
                  })}
                </div>

                {/* Progress bar */}
                {isForging && (
                  <div style={{
                    marginTop: 12, height: 3, borderRadius: 2,
                    background: 'rgba(255,255,255,0.04)', overflow: 'hidden',
                  }}>
                    <motion.div
                      animate={{ width: `${((activeChapter + 1) / 6) * 100}%` }}
                      transition={{ duration: 0.5 }}
                      style={{
                        height: '100%', borderRadius: 2,
                        background: 'linear-gradient(90deg, #64FFDA, #BB86FC)',
                      }}
                    />
                  </div>
                )}
              </div>
            </section>

            {/* ── 文档主体 ── */}
            <section ref={contentRef} style={{ maxWidth: 820, margin: '0 auto', padding: '0 1.5rem' }}>
              {chapterMeta.map((ch, idx) => {
                const color = CHAPTER_COLORS[ch.key] || '#64FFDA';
                const content = chapterStreams[idx];
                if (!content && idx > activeChapter) return null; // Don't render pending chapters

                return (
                  <div
                    key={ch.key}
                    ref={(el: HTMLDivElement | null) => { chapterRefs.current[idx] = el; }}
                    style={{
                      marginBottom: 32,
                      animation: 'fadeSlideIn 0.4s ease-out both',
                      animationDelay: `${idx * 80}ms`,
                    }}
                  >
                    {/* Chapter header */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      marginBottom: 16, padding: '0 2px',
                    }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `${color}10`, border: `1px solid ${color}25`,
                        fontSize: 18,
                      }}>{ch.icon}</div>
                      <div>
                        <div style={{
                          fontSize: '0.62rem', color, fontWeight: 600,
                          textTransform: 'uppercase' as const, letterSpacing: 1.5,
                          marginBottom: 1,
                        }}>第 {idx + 1} 章</div>
                        <h2 style={{
                          fontSize: '1.05rem', fontWeight: 700, margin: 0,
                          fontFamily: 'var(--font-display)', color: 'var(--text-primary)',
                        }}>{ch.title.replace(/^.\s/, '')}</h2>
                      </div>
                      {isForging && idx === activeChapter && (
                        <motion.div
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ repeat: Infinity, duration: 1.5 }}
                          style={{
                            marginLeft: 'auto', fontSize: '0.65rem',
                            color, padding: '3px 10px', borderRadius: 12,
                            background: `${color}08`, border: `1px solid ${color}15`,
                          }}
                        >生成中...</motion.div>
                      )}
                    </div>

                    {/* Chapter content */}
                    <div className="glass-card" style={{
                      padding: '24px 28px',
                      borderTop: `2px solid ${color}30`,
                      position: 'relative', overflow: 'hidden',
                    }}>
                      {/* Subtle glow in top-right */}
                      <div style={{
                        position: 'absolute', top: -30, right: -30,
                        width: 100, height: 100, borderRadius: '50%',
                        background: `${color}06`, filter: 'blur(30px)',
                      }} />

                      <div style={{ position: 'relative' }}>
                        {content ? renderMarkdown(content) : (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '20px 0', color: 'var(--text-tertiary)', fontSize: '0.82rem',
                          }}>
                            <motion.div
                              animate={{ opacity: [0.3, 1, 0.3] }}
                              transition={{ repeat: Infinity, duration: 1.5 }}
                              style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: color, boxShadow: `0 0 8px ${color}`,
                              }}
                            />
                            正在连接 AI 引擎...
                          </div>
                        )}
                      </div>

                      {/* Streaming cursor */}
                      {isForging && idx === activeChapter && (
                        <motion.span
                          animate={{ opacity: [0, 1, 0] }}
                          transition={{ repeat: Infinity, duration: 0.8 }}
                          style={{
                            display: 'inline-block', width: 2, height: 16,
                            background: color, verticalAlign: 'text-bottom',
                            marginLeft: 2,
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </section>

            {/* ── Error ── */}
            {error && (
              <section style={{ maxWidth: 820, margin: '1rem auto', padding: '0 1.5rem' }}>
                <div className="glass-card" style={{
                  padding: '12px 20px', textAlign: 'center',
                  borderColor: 'rgba(255,215,64,0.2)',
                }}>
                  <p style={{ fontSize: '0.78rem', color: '#FFD740' }}>⚠️ {error}</p>
                </div>
              </section>
            )}

            {/* ── Bottom Actions ── */}
            {!isForging && isComplete && (
              <section style={{ maxWidth: 820, margin: '2rem auto 0', padding: '0 1.5rem', textAlign: 'center' }}>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <ActionButton onClick={() => { setIsComplete(false); setDemand(''); setShowProfile(true); setChapterStreams(Array(6).fill('')); setChapterDone(Array(6).fill(false)); }}>
                    🔄 重新锻造
                  </ActionButton>
                  <ActionLink to="/report">← 查看画像</ActionLink>
                  <ActionLink to="/">回到首页</ActionLink>
                </div>
              </section>
            )}
          </div>
        )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Profile Section (extracted)
   ═══════════════════════════════════════════════════ */

function ProfileSection({ topology, dims, allTraits, totalFlow, totalDrain, onCollapse }: {
  topology: any;
  dims: DimensionTopology[];
  allTraits: any[];
  totalFlow: number;
  totalDrain: number;
  onCollapse: () => void;
}) {
  return (
    <section
      style={{ maxWidth: 720, margin: '0 auto 1.5rem', padding: '0 1.5rem', animation: 'fadeSlideIn 0.4s ease-out 0.1s both' }}
    >
      {/* Narrative */}
      <div className="glass-card" style={{
        padding: '20px 24px', marginBottom: 16, borderLeft: '3px solid var(--accent-cyan)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 16 }}>📜</span>
          <span style={{
            fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent-cyan)',
            textTransform: 'uppercase' as const, letterSpacing: 1,
          }}>你的叙事身份</span>
        </div>
        <p style={{ fontSize: '0.85rem', lineHeight: 1.8, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          "{topology.narrativeIdentity}"
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard value={allTraits.length} label="已识别特质" color="#64FFDA" icon="🧬" />
        <StatCard value={totalFlow} label="心流舒适区" color="#BB86FC" icon="⚡" />
        <StatCard value={totalDrain} label="高耗能区" color="#FFD740" icon="🔥" />
      </div>

      {/* Dimension cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12, marginBottom: 16 }}>
        {dims.map((dim, i) => (
          <DimensionCard key={dim.dimension} dim={dim} delay={i * 0.05} />
        ))}
      </div>

      {/* Cross reactions */}
      {topology.crossReactions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '0 2px' }}>
            <span style={{ fontSize: 14 }}>⚗️</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#BB86FC', textTransform: 'uppercase' as const, letterSpacing: 1 }}>跨维度化学反应</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>{topology.crossReactions.length} 组反应</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topology.crossReactions.slice(0, 4).map((r: CrossDimensionReaction, i: number) => (
              <ReactionCard key={i} reaction={r} />
            ))}
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center' }}>
        <button onClick={onCollapse} style={{
          background: 'none', border: '1px solid rgba(255,255,255,0.08)',
          padding: '6px 20px', borderRadius: 20, cursor: 'pointer',
          fontSize: '0.72rem', color: 'var(--text-tertiary)', transition: 'all 0.2s',
        }}>收起画像 ▲</button>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════
   小组件
   ═══════════════════════════════════════════════════ */

function StatCard({ value, label, color, icon }: { value: number; label: string; color: string; icon: string }) {
  return (
    <div className="glass-card" style={{ padding: '14px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color, fontFamily: 'var(--font-display)' }}>{value}</div>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function DimensionCard({ dim, delay }: { dim: DimensionTopology; delay: number }) {
  const traits = dim.dominantTraits.filter(t => t.typology !== '待识别');
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="glass-card"
      style={{ padding: '14px 16px', position: 'relative', overflow: 'hidden' }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: dim.color, opacity: 0.5 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>{dim.icon}</span>
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: dim.color }}>{dim.name}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {traits.slice(0, 3).map((t, i) => (
          <span key={i} style={{
            fontSize: '0.63rem', padding: '2px 7px', borderRadius: 8,
            background: `${dim.color}0D`, border: `1px solid ${dim.color}20`, color: dim.color,
          }}>{t.typology}</span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, fontSize: '0.62rem' }}>
        <span style={{ color: '#64FFDA' }}>⚡{dim.energyDynamics.flowZones.length} 心流</span>
        <span style={{ color: '#FFD740' }}>🔥{dim.energyDynamics.drainZones.length} 耗能</span>
      </div>
      {dim.collaborationRole && (
        <div style={{
          marginTop: 8, fontSize: '0.63rem', color: 'var(--text-tertiary)', fontStyle: 'italic',
          borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 6,
        }}>🤝 {dim.collaborationRole.slice(0, 40)}</div>
      )}
    </motion.div>
  );
}

function ReactionCard({ reaction }: { reaction: CrossDimensionReaction }) {
  const style = REACTION_COLORS[reaction.reactionType] || REACTION_COLORS.resonance;
  return (
    <div style={{ padding: '12px 16px', borderRadius: 12, background: style.bg, border: `1px solid ${style.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          fontSize: '0.6rem', padding: '2px 8px', borderRadius: 10,
          background: `${style.text}15`, color: style.text, fontWeight: 600, textTransform: 'uppercase' as const,
        }}>{REACTION_LABELS[reaction.reactionType] || reaction.reactionType}</span>
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: style.text }}>{reaction.title}</span>
      </div>
      <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{reaction.narrative}</p>
      {reaction.implication && (
        <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', marginTop: 4, fontStyle: 'italic' }}>→ {reaction.implication}</p>
      )}
    </div>
  );
}

function ActionButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '10px 22px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
      background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)',
      fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.3s ease',
    }}>{children}</button>
  );
}

function ActionLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} style={{
      padding: '10px 22px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
      background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)',
      fontSize: '0.82rem', fontWeight: 500, textDecoration: 'none', transition: 'all 0.3s ease',
    }}>{children}</Link>
  );
}
