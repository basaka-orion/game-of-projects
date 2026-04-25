/**
 * 科学依据与方法学白皮书
 *
 * 顶级学术审美的静态页面 — prose-invert 暗色长文排版
 * 记录本系统的理论根基、方法原创性声明、伦理边界
 */
import { Link } from 'react-router-dom';
import { motion } from '../lib/motion-lite';

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6 },
};

export default function MethodologyPage() {
  return (
    <div style={{
      minHeight: '100vh',
      fontFamily: 'var(--font-sans)',
      background: 'linear-gradient(180deg, #0a0a1a 0%, #0f0c29 50%, #0a0a1a 100%)',
    }}>
      {/* ── Nav ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        <Link to="/" style={{
          display: 'flex', alignItems: 'center', gap: 6,
          color: 'var(--text-tertiary)', fontSize: '0.82rem',
          textDecoration: 'none',
        }}>
          ← 返回主页
        </Link>
      </nav>

      {/* ── Content ── */}
      <motion.article
        {...fadeUp}
        style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: '4rem 1.5rem 6rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.9,
          fontSize: '0.92rem',
        }}
      >
        {/* Title */}
        <header style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 18px', borderRadius: 999, fontSize: '0.72rem',
            background: 'rgba(100,255,218,0.06)', border: '1px solid rgba(100,255,218,0.12)',
            color: 'var(--accent-cyan)', marginBottom: '2rem',
            letterSpacing: '0.08em', fontWeight: 500,
          }}>
            SYSTEM KERNEL
          </div>
          <h1 style={{
            fontSize: 'clamp(1.8rem, 4vw, 2.6rem)',
            fontWeight: 700,
            fontFamily: 'var(--font-display)',
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
            background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '1rem',
          }}>
            科学依据与方法学声明
          </h1>
          <p style={{
            fontSize: '0.84rem', color: 'var(--text-tertiary)',
            maxWidth: 520, margin: '0 auto',
          }}>
            Methodology & Scientific Foundation White Paper
          </p>
        </header>

        {/* ── §1 理论根基 ── */}
        <Section title="§1　理论根基" icon="🧬">
          <p>
            本系统的评估框架建立在当代心理学最具共识度的学术构念之上，覆盖认知、人格、情感、动机、社会、审美与世界观七大维度。
            底层理论涵盖但不限于：
          </p>
          <TheoryGrid theories={[
            { name: 'CHC 智力理论', desc: 'Cattell–Horn–Carroll 三层智力模型，指导认知架构维度的子维度拆分（流体推理、工作记忆、加工速度）', color: '#64FFDA' },
            { name: 'Big Five / HEXACO', desc: 'Big Five 五因素人格 + HEXACO 六因素模型，覆盖外向性、尽责性、宜人性、情绪稳定性、开放性与诚实谦逊', color: '#BB86FC' },
            { name: 'VIA 品格优势', desc: 'Peterson & Seligman 24 项品格优势分类，指导 strengths 维度的创造力、好奇心、毅力、善良、公平、审慎、自我调节、希望感评估', color: '#FFD700' },
            { name: 'Schwartz 价值观 (PVQ-RR)', desc: '19 类精炼价值观圆环理论，指导动机与价值体系维度的分析', color: '#E040FB' },
            { name: 'Watson–Glaser 批判性思维', desc: 'WGCTA 经典批判性思维评估框架，指导逻辑推理、假设识别、演绎推论子维度', color: '#FF6E40' },
            { name: 'VAST 视觉审美敏感度', desc: 'Visual Aesthetic Sensitivity Test，指导审美维度的纯视觉直觉判断任务', color: '#80DEEA' },
            { name: 'SDT 自我决定理论', desc: 'Deci & Ryan 自主性、胜任感、归属感三大基本心理需求理论', color: '#A5D6A7' },
            { name: 'Frankl 意义治疗 / 存在主义', desc: '引导世界观维度中关于人生意义、存在焦虑、自由意志的深层探索', color: '#FFAB91' },
          ]} />
        </Section>

        {/* ── §2 方法学原创性声明 ── */}
        <Section title="§2　方法学原创性声明" icon="⚡">
          <Callout type="core">
            本系统底层全面对标 Schwartz 价值观、VIA 品格优势、Watson–Glaser 批判性思维等国际顶级学术构念，
            但彻底摒弃了枯燥反人性的 Likert-5 自陈量表。所有交互场景均基于当代真实语境 100% 原创重构，
            打造独一无二的沉浸式探索体验。
          </Callout>
          <p>具体而言，我们的原创方法包括：</p>
          <ul style={{ paddingLeft: '1.5rem', margin: '1.2rem 0' }}>
            <li style={{ marginBottom: '0.8rem' }}>
              <strong style={{ color: 'var(--accent-cyan)' }}>动态心智滑块 (0–100)</strong>
              　——　取代传统 5 点量表。每个档位配备"扎心潜台词"锚定文本，
              迫使被试在极端真实的当代生活场景中暴露底层反应模式，而非选择社会期望答案。
            </li>
            <li style={{ marginBottom: '0.8rem' }}>
              <strong style={{ color: 'var(--accent-purple)' }}>情境判断测试 (SJT) + 沉浸式叙事</strong>
              　——　以 AVG（视觉小说）形式呈现的城市漫游剧本，通过行为选择推断特质类型，
              绕开自陈偏差和社会赞许性效应。
            </li>
            <li style={{ marginBottom: '0.8rem' }}>
              <strong style={{ color: '#FF6E40' }}>逻辑刺客任务</strong>
              　——　将 Watson-Glaser 批判性思维测试从干瘪的考卷改造为"漏洞刺客"职场侦探剧本，
              在沉浸式场景中检测假设识别、演绎推理、论证评估等硬核逻辑能力。
            </li>
            <li style={{ marginBottom: '0.8rem' }}>
              <strong style={{ color: '#80DEEA' }}>纯视觉审美盲选</strong>
              　——　完全隐藏文字选项，仅以高分辨率图片对的直觉二择一任务，
              测量审美敏感度 (VAST-R)，消除语言干扰。
            </li>
            <li>
              <strong style={{ color: '#FFD700' }}>行为博弈实验</strong>
              　——　嵌入最后通牒博弈、信任博弈、公共品博弈等经典行为经济学范式，
              通过真实决策行为（而非自我报告）采集社会取向数据。
            </li>
          </ul>
        </Section>

        {/* ── §3 合规与版权 ── */}
        <Section title="§3　合规与版权" icon="🛡️">
          <p>
            系统内所有题目均进行了 <code style={codeStyle}>sourceType</code> 溯源打标。
            题目来源类型包括：
          </p>
          <table style={{
            width: '100%', margin: '1.4rem 0', borderCollapse: 'collapse',
            fontSize: '0.84rem',
          }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={thStyle}>标签</th>
                <th style={thStyle}>含义</th>
              </tr>
            </thead>
            <tbody>
              <tr style={trStyle}><td style={tdStyle}><code style={codeStyle}>original</code></td><td style={tdStyle}>100% 团队原创场景文本</td></tr>
              <tr style={trStyle}><td style={tdStyle}><code style={codeStyle}>adapted_open</code></td><td style={tdStyle}>改编自公开版本量表（如 IPIP）</td></tr>
              <tr style={trStyle}><td style={tdStyle}><code style={codeStyle}>adapted_theory</code></td><td style={tdStyle}>参考理论框架后原创重写</td></tr>
              <tr style={trStyle}><td style={tdStyle}><code style={codeStyle}>sensitive_copyright</code></td><td style={tdStyle}>涉及版权受限素材，需注意</td></tr>
            </tbody>
          </table>
          <p>
            本系统引用的所有学术理论和量表名称（如 VIA、WGCTA、VAST 等）均为描述性引用，
            旨在向用户说明评估的理论根基。系统内的具体测试场景文本均为原创或合规改编。
          </p>
        </Section>

        {/* ── §4 伦理与免责 ── */}
        <Section title="§4　伦理边界与免责声明" icon="⚖️">
          <Callout type="ethics">
            本系统为深度自我探索工具，不提供任何临床精神医学诊断。
            若您长期存在严重情绪困扰，请优先寻求专业医疗机构支持。
          </Callout>
          <ul style={{ paddingLeft: '1.5rem', margin: '1.2rem 0' }}>
            <li style={{ marginBottom: '0.6rem' }}>所有评估结果仅供自我认知参考，不具有医学、法律或雇佣决策效力。</li>
            <li style={{ marginBottom: '0.6rem' }}>AI 苏格拉底对话仅为辅助反思工具，不替代持证心理咨询师或治疗师的专业服务。</li>
            <li style={{ marginBottom: '0.6rem' }}>用户数据仅存储于本地浏览器和用户指定的 Supabase 账户中，不会被共享或出售。</li>
            <li>本系统不对因使用评估结果而做出的任何决策承担责任。</li>
          </ul>
        </Section>

        {/* ── §5 技术架构 ── */}
        <Section title="§5　评估引擎技术架构" icon="⚙️">
          <ul style={{ paddingLeft: '1.5rem', margin: '1.2rem 0' }}>
            <li style={{ marginBottom: '0.6rem' }}>
              <strong>拓扑画像 (Topology Profile)</strong>　——　摈弃数值分数，采用特质类型 + 证据链 + 跨维度化学反应模型
            </li>
            <li style={{ marginBottom: '0.6rem' }}>
              <strong>CAT 自适应测评</strong>　——　基于项目反应理论 (IRT/GRM)，使用 EAP 能力估计和信息量最大化选题
            </li>
            <li style={{ marginBottom: '0.6rem' }}>
              <strong>AI 苏格拉底对话</strong>　——　DeepSeek V3.2 streaming + 苏格拉底反诘法四阶段结构化对话
            </li>
            <li>
              <strong>多路径交叉验证</strong>　——　量表 + SJT + 行为博弈 + CAT 四源数据融合
            </li>
          </ul>
        </Section>

        {/* ── Footer ── */}
        <footer style={{
          marginTop: '5rem', paddingTop: '2rem',
          borderTop: '1px solid rgba(255,255,255,0.04)',
          textAlign: 'center',
          fontSize: '0.72rem', color: 'var(--text-tertiary)',
        }}>
          <p>Multi-Dimension Profiling · Methodology White Paper</p>
          <p style={{ marginTop: 4 }}>© 2024–2026 · All rights reserved</p>
        </footer>
      </motion.article>
    </div>
  );
}

/* ── Sub-components ── */

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }} transition={{ duration: 0.5 }}
      style={{ marginBottom: '3.5rem' }}
    >
      <h2 style={{
        fontSize: '1.3rem', fontWeight: 700, marginBottom: '1.4rem',
        fontFamily: 'var(--font-display)',
        display: 'flex', alignItems: 'center', gap: 10,
        color: 'var(--text-primary)',
      }}>
        <span>{icon}</span> {title}
      </h2>
      <div style={{ color: 'var(--text-secondary)' }}>
        {children}
      </div>
    </motion.section>
  );
}

function Callout({ type, children }: { type: 'core' | 'ethics'; children: React.ReactNode }) {
  const isCore = type === 'core';
  return (
    <div style={{
      margin: '1.6rem 0',
      padding: '20px 24px',
      borderRadius: 12,
      background: isCore
        ? 'linear-gradient(135deg, rgba(100,255,218,0.04), rgba(187,134,252,0.04))'
        : 'rgba(255,107,107,0.04)',
      border: `1px solid ${isCore ? 'rgba(100,255,218,0.12)' : 'rgba(255,107,107,0.12)'}`,
      fontSize: '0.88rem',
      lineHeight: 1.9,
      color: isCore ? 'rgba(100,255,218,0.9)' : 'rgba(255,200,200,0.9)',
      fontWeight: 400,
    }}>
      {children}
    </div>
  );
}

function TheoryGrid({ theories }: { theories: { name: string; desc: string; color: string }[] }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: 14, margin: '1.4rem 0',
    }}>
      {theories.map((t) => (
        <div key={t.name} style={{
          padding: '16px 20px', borderRadius: 12,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)',
        }}>
          <h4 style={{
            fontSize: '0.84rem', fontWeight: 700, color: t.color,
            marginBottom: 6, fontFamily: 'var(--font-display)',
          }}>{t.name}</h4>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', lineHeight: 1.7 }}>{t.desc}</p>
        </div>
      ))}
    </div>
  );
}

const codeStyle: React.CSSProperties = {
  fontSize: '0.8rem', padding: '2px 8px', borderRadius: 6,
  background: 'rgba(100,255,218,0.06)', color: 'var(--accent-cyan)',
  fontFamily: 'var(--font-mono, monospace)',
};
const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '10px 16px', fontWeight: 600,
  color: 'var(--text-primary)', fontSize: '0.82rem',
};
const tdStyle: React.CSSProperties = {
  padding: '10px 16px',
};
const trStyle: React.CSSProperties = {
  borderBottom: '1px solid rgba(255,255,255,0.04)',
};
