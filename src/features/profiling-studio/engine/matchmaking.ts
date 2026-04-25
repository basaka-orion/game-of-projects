/**
 * V3.0 创世蓝图引擎 — 锻造炉 (The Forge)
 *
 * 将用户的 TopologyProfile 与创作需求碰撞，
 * 通过 DeepSeek 多轮生成 6 章专业级开发文档。
 */

import type { TopologyProfile, ForgeGenesisDoc, ForgeChapter, ForgeChapterKey } from '../types';
import { streamChat } from '../api/deepseek';

/* ─── 章节定义 ─── */

interface ChapterDef {
  key: ForgeChapterKey;
  title: string;
  icon: string;
  promptFn: (ctx: PromptCtx) => string;
  maxTokens: number;
}

interface PromptCtx {
  topology: TopologyProfile;
  demand: string;
  traitSummary: string;
  reactionSummary: string;
  collabRoles: string;
  prevChapters: string;
}

function buildCtx(topology: TopologyProfile, demand: string, chapters: ForgeChapter[]): PromptCtx {
  const traitSummary = Object.values(topology.dimensionTopologies)
    .flatMap(dt => dt.dominantTraits)
    .filter(t => t.typology !== '待识别')
    .map(t => `• [${t.subDimensionName}] ${t.typology} — 心流区：${t.flowZone} / 高耗能区：${t.energyDrainer}`)
    .join('\n');

  const reactionSummary = topology.crossReactions
    .map(r => `• ${r.title}(${r.reactionType}): ${r.narrative} → ${r.implication}`)
    .join('\n');

  const collabRoles = Object.values(topology.dimensionTopologies)
    .map(dt => `• ${dt.name}: ${dt.collaborationRole}`)
    .join('\n');

  const prevChapters = chapters
    .filter(c => c.status === 'done' && c.markdownContent)
    .map(c => `### ${c.title}\n${c.markdownContent.slice(0, 600)}...`)
    .join('\n\n');

  return { topology, demand, traitSummary, reactionSummary, collabRoles, prevChapters };
}

const BASE_SYSTEM = (ctx: PromptCtx) => `你是一位顶级产品架构师兼技术总监，正在为一位特殊的创造者撰写专业级项目开发文档。

## 创造者拓扑画像

原型: ${ctx.topology.selfArchetype}
叙事身份: ${ctx.topology.narrativeIdentity}

### 显性特质清单
${ctx.traitSummary}

### 跨维度化学反应
${ctx.reactionSummary || '(暂无)'}

### 协作角色
${ctx.collabRoles}

## 创作需求
${ctx.demand}

## 写作原则
1. 每条建议必须引用创造者的具体特质（用【特质名】标注）
2. 禁止通用建议，一切基于这位创造者的独特画像
3. 用 Markdown 格式输出，使用标题、列表、表格、引用等丰富排版
4. 语言精炼专业，像顶级咨询公司的交付物
5. 对于技术建议，要考虑创造者的认知风格和能量模式`;

const CHAPTERS: ChapterDef[] = [
  {
    key: 'overview',
    title: '项目概览',
    icon: '📐',
    maxTokens: 2048,
    promptFn: (ctx) => `${BASE_SYSTEM(ctx)}

请撰写【第一章：项目概览】，包含以下部分：

## 1. 项目愿景
一段有感召力的愿景描述，说明这个项目为什么值得做，以及它将如何改变目标用户的生活。要结合创造者的【特质】说明为什么 TA 就是做这件事的最佳人选。

## 2. 目标用户画像
- 核心用户群体（2-3个细分人群）
- 用户痛点与需求
- 使用场景描述

## 3. 核心价值主张
- 一句话价值主张
- 3-5个差异化卖点
- 竞品对比分析表格（至少3个竞品，用表格对比）

## 4. 成功指标
- MVP 阶段 KPI（量化指标）
- 6个月目标
- 12个月愿景

请直接输出 Markdown 内容，不要包裹在代码块中。`,
  },
  {
    key: 'architecture',
    title: '技术架构',
    icon: '🏗️',
    maxTokens: 3000,
    promptFn: (ctx) => `${BASE_SYSTEM(ctx)}

${ctx.prevChapters ? `## 前文参考\n${ctx.prevChapters}\n` : ''}

请撰写【第二章：技术架构】，包含以下部分：

## 1. 技术栈推荐
基于创造者的认知特质推荐技术栈。例如：
- 如果创造者是【直觉驱动型】→ 推荐快速原型工具
- 如果创造者是【结构依赖型】→ 推荐强类型/强框架
用表格列出前端、后端、数据库、部署、AI/ML 等层的推荐选型及选择理由。

## 2. 系统架构设计
- 高层架构图描述（用文字描述模块关系）
- 核心模块划分
- 数据流说明
- API 设计原则

## 3. 基础设施
- 部署方案
- CI/CD 流程
- 监控与告警
- 安全考量

## 4. 技术决策备忘录
3-5个关键技术决策，每个说明：选择什么、为什么（结合创造者特质）、替代方案、风险

请直接输出 Markdown 内容。`,
  },
  {
    key: 'modules',
    title: '功能模块',
    icon: '🧩',
    maxTokens: 4096,
    promptFn: (ctx) => `${BASE_SYSTEM(ctx)}

${ctx.prevChapters ? `## 前文参考\n${ctx.prevChapters}\n` : ''}

请撰写【第三章：核心功能模块】，包含 MVP 阶段需要实现的完整功能规格。

对于每个功能模块（至少 4-6 个模块），请按以下格式详细描述：

### 模块名称
**优先级**: P0/P1/P2
**与创造者特质的关联**: 说明这个模块为什么适合/不适合创造者亲自做

#### 用户故事
- [ ] 作为[用户角色]，我想要[功能]，以便[价值]

#### 功能细节
详细描述功能的交互流程、核心逻辑、边界条件。

#### 验收标准
- 条件1
- 条件2

#### 数据模型（如适用）
用表格描述关键字段。

---

请确保功能清单完整、可执行，每个模块都有具体的验收标准。直接输出 Markdown。`,
  },
  {
    key: 'roadmap',
    title: '开发路线图',
    icon: '🗺️',
    maxTokens: 3000,
    promptFn: (ctx) => `${BASE_SYSTEM(ctx)}

${ctx.prevChapters ? `## 前文参考\n${ctx.prevChapters}\n` : ''}

请撰写【第四章：开发路线图】，包含以下部分：

## 1. 开发阶段规划
将项目分为 4-6 个阶段（Sprint/里程碑），每个阶段包含：

### 阶段 N: [名称]（时间周期）
**目标**: 一句话描述
**交付物**: 列表
**关键任务**:
| 任务 | 预计时间 | 执行者建议 | 与特质的关系 |
|------|---------|-----------|------------|
每个任务要说明是创造者自己做（心流区）还是建议外包/AI辅助（耗能区）

## 2. 里程碑检查点
每个阶段结束时的 Go/No-go 决策标准

## 3. 能量管理时间表
基于创造者的心流区和耗能区，规划每天/每周的最佳工作节奏。
例如：上午做创意性工作（心流区）→ 下午做结构性工作 → 晚上复盘

## 4. 依赖关系图
关键任务间的依赖关系说明

请直接输出 Markdown。`,
  },
  {
    key: 'risks',
    title: '风险与缓解',
    icon: '🛡️',
    maxTokens: 2048,
    promptFn: (ctx) => `${BASE_SYSTEM(ctx)}

${ctx.prevChapters ? `## 前文参考\n${ctx.prevChapters}\n` : ''}

请撰写【第五章：风险评估与缓解策略】。

基于创造者的拓扑画像（特别是高耗能区和跨维度摩擦），识别并分析项目风险。

## 1. 风险矩阵
用表格列出所有风险：
| 风险类别 | 风险描述 | 概率 | 影响 | 风险等级 | 来源特质 |
|---------|---------|------|------|---------|---------|

风险类别包括：执行风险、技术风险、市场风险、团队风险、创造者个人风险。

## 2. 创造者特质风险深度分析
针对创造者画像中的 3-5 个关键耗能区，细详分析：
- 具体会在什么场景触发
- 历史上类似创造者如何踩坑
- 预防措施和应急方案

## 3. 缓解策略矩阵
每个高风险项的：
- 预防措施
- 监控指标（如何发现问题）
- 应急响应计划
- 恢复策略

## 4. 韧性建设
如何利用创造者的心流区和共振反应来对冲风险

请直接输出 Markdown。`,
  },
  {
    key: 'team',
    title: '团队与工具',
    icon: '👥',
    maxTokens: 2048,
    promptFn: (ctx) => `${BASE_SYSTEM(ctx)}

${ctx.prevChapters ? `## 前文参考\n${ctx.prevChapters}\n` : ''}

请撰写【第六章：团队组建与工具生态】。

## 1. 理想团队架构
基于创造者的协作角色画像，设计互补的团队：

### 创造者定位
明确创造者在团队中的最佳角色（基于协作角色画像）

### 核心补位需求
| 角色 | 核心职责 | 为什么需要 | 互补特质 | 招募渠道 |
|------|---------|-----------|---------|---------|

## 2. AI 工具矩阵
推荐具体的 AI 工具来弥补创造者的耗能区：
| 耗能区 | 推荐工具 | 使用场景 | 预期效果 |
|--------|---------|---------|---------|

## 3. 协作工作流
- 日常协作流程
- 沟通规范
- 决策机制
- 知识管理

## 4. 成本估算
| 项目 | 单价 | 月成本 | 备注 |
|------|------|--------|------|
列出工具订阅、外包、基础设施等月度开支预算

## 5. 启动清单
一份可直接执行的 Day-1 行动清单（10-15项具体待办）

请直接输出 Markdown。`,
  },
];

/* ─── 初始化创世文档 ─── */

export function createGenesisDoc(demand: string, topologyId: string): ForgeGenesisDoc {
  return {
    id: Date.now().toString(),
    demand,
    topologyId,
    chapters: CHAPTERS.map(ch => ({
      key: ch.key,
      title: `${ch.icon} ${ch.title}`,
      icon: ch.icon,
      markdownContent: '',
      status: 'pending' as const,
    })),
    createdAt: new Date().toISOString(),
  };
}

/* ─── 多轮流式生成 ─── */

export async function streamForgeGenesis(
  topology: TopologyProfile,
  demand: string,
  callbacks: {
    onChapterStart: (chapterIndex: number) => void;
    onToken: (chapterIndex: number, token: string) => void;
    onChapterDone: (chapterIndex: number, content: string) => void;
    onAllDone: (doc: ForgeGenesisDoc) => void;
    onError: (error: string) => void;
  },
): Promise<ForgeGenesisDoc> {
  const doc = createGenesisDoc(demand, topology.id);

  for (let i = 0; i < CHAPTERS.length; i++) {
    const chDef = CHAPTERS[i];
    const ctx = buildCtx(topology, demand, doc.chapters);
    const prompt = chDef.promptFn(ctx);

    doc.chapters[i].status = 'streaming';
    callbacks.onChapterStart(i);

    try {
      let chapterContent = '';

      await new Promise<void>((resolve, reject) => {
        streamChat(
          [
            { role: 'system', content: prompt },
            { role: 'user', content: `请撰写「${chDef.title}」这一章。要求极致专业、详尽、可执行。所有建议都必须引用我的拓扑画像中的具体特质。` },
          ],
          {
            onToken: (token: string) => {
              chapterContent += token;
              callbacks.onToken(i, token);
            },
            onDone: () => {
              resolve();
            },
            onError: (err: Error) => {
              // If partial content, still resolve
              if (chapterContent.length > 50) {
                resolve();
              } else {
                reject(err);
              }
            },
          },
          { model: 'deepseek/deepseek-v3.2', maxTokens: chDef.maxTokens },
        );
      });

      // Clean up markdown code fences if AI wraps the output
      chapterContent = chapterContent
        .replace(/^```markdown\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();

      doc.chapters[i].markdownContent = chapterContent;
      doc.chapters[i].status = 'done';
      callbacks.onChapterDone(i, chapterContent);

    } catch (err) {
      // Fallback: generate a placeholder
      doc.chapters[i].markdownContent = generateFallbackChapter(chDef, topology, demand);
      doc.chapters[i].status = 'done';
      callbacks.onChapterDone(i, doc.chapters[i].markdownContent);
      callbacks.onError(`第 ${i + 1} 章生成遇到问题，已使用预设内容`);
    }
  }

  callbacks.onAllDone(doc);
  return doc;
}

/* ─── 降级内容 ─── */

function generateFallbackChapter(
  chDef: ChapterDef,
  topology: TopologyProfile,
  demand: string,
): string {
  const traits = Object.values(topology.dimensionTopologies)
    .flatMap(dt => dt.dominantTraits)
    .filter(t => t.typology !== '待识别');

  switch (chDef.key) {
    case 'overview':
      return `## 项目愿景\n\n基于你作为「${topology.selfArchetype}」的独特优势，「${demand}」将成为一个结合你的${traits.slice(0, 3).map(t => `【${t.typology}】`).join('、')}等核心特质的创新项目。\n\n## 目标用户\n\n需要进一步明确目标用户画像。建议先进行目标用户调研。\n\n## 核心价值主张\n\n融合你的多维认知优势，打造差异化产品体验。`;
    case 'architecture':
      return `## 技术栈建议\n\n基于你的认知风格，推荐选择与你心流区匹配的技术栈。\n\n## 系统架构\n\n建议采用模块化架构，便于你在心流区高效开发核心模块。`;
    case 'modules':
      return `## MVP 功能清单\n\n基于项目需求，以下是建议的核心功能模块：\n\n1. 用户认证模块\n2. 核心业务逻辑\n3. 数据存储层\n4. 管理后台`;
    case 'roadmap':
      return `## 开发路线图\n\n### 阶段一：概念验证（2周）\n启动探索，利用你的心流区快速原型。\n\n### 阶段二：MVP 开发（4-6周）\n核心功能开发。\n\n### 阶段三：测试优化（2周）\n用户测试和迭代。`;
    case 'risks':
      return `## 风险评估\n\n基于你的耗能区分析，以下环节需要特别注意：\n${traits.filter(t => t.energyDrainer && t.energyDrainer !== '—').slice(0, 3).map(t => `- 【${t.typology}】的耗能区「${t.energyDrainer}」可能在项目执行期间造成能量下降`).join('\n')}`;
    case 'team':
      return `## 团队建议\n\n作为团队中的「${Object.values(topology.dimensionTopologies)[0]?.collaborationRole || '核心创造者'}」，你需要以下类型的协作者来补位。`;
    default:
      return `> AI 生成暂不可用，请稍后重试。`;
  }
}

/* ─── 兼容旧API（保留 streamForgeBlueprint） ─── */

import type { ForgeBlueprint } from '../types';

export function parseBlueprint(
  aiResponse: string,
  demand: string,
  topologyId: string,
): ForgeBlueprint {
  try {
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      id: Date.now().toString(),
      demand,
      topologyId,
      flowStrategy: parsed.flowStrategy || [],
      drainMitigation: parsed.drainMitigation || [],
      collaboratorSpec: parsed.collaboratorSpec || '',
      actionPlan: parsed.actionPlan || [],
      createdAt: new Date().toISOString(),
    };
  } catch {
    return {
      id: Date.now().toString(),
      demand,
      topologyId,
      flowStrategy: [aiResponse],
      drainMitigation: [],
      collaboratorSpec: '',
      actionPlan: [],
      createdAt: new Date().toISOString(),
    };
  }
}

export async function streamForgeBlueprint(
  topology: TopologyProfile,
  demand: string,
  onChunk: (text: string) => void,
  onComplete: (blueprint: ForgeBlueprint) => void,
  onError: (error: string) => void,
): Promise<void> {
  // Legacy wrapper — not used in v3 but kept for compatibility
  const messages = buildLegacyPrompt(topology, demand);
  let fullResponse = '';

  try {
    await streamChat(
      messages,
      {
        onToken: (chunk: string) => { fullResponse += chunk; onChunk(chunk); },
        onDone: () => { onComplete(parseBlueprint(fullResponse, demand, topology.id)); },
        onError: (err: Error) => {
          if (fullResponse) onComplete(parseBlueprint(fullResponse, demand, topology.id));
          onError(err.message);
        },
      },
      { model: 'deepseek/deepseek-v3.2' },
    );
  } catch (err) {
    onError(err instanceof Error ? err.message : 'AI 服务暂不可用');
  }
}

function buildLegacyPrompt(topology: TopologyProfile, demand: string) {
  const traitSummary = Object.values(topology.dimensionTopologies)
    .flatMap(dt => dt.dominantTraits)
    .filter(t => t.typology !== '待识别')
    .map(t => `• ${t.subDimensionName}: ${t.typology}`)
    .join('\n');
  return [
    { role: 'system' as const, content: `根据用户画像生成执行蓝图。用户原型: ${topology.selfArchetype}\n${traitSummary}` },
    { role: 'user' as const, content: `需求：${demand}` },
  ];
}
