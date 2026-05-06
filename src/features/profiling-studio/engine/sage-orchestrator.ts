/**
 * 智者编排引擎 (Sage Orchestrator)
 *
 * 负责：
 * 1. 根据 TopologyProfile 计算每位智者的优先级排序
 * 2. 为每位智者构建专属 System Prompt
 * 3. 解析智者的结构化 JSON 输出
 */

import type { PersonalOS, TopologyProfile, SageId, SageInsight } from '../types';
import { DEFAULT_SAGE_ORDER, SAGE_MAP } from '../data/sages';
import { DIMENSION_MAP } from '../data/dimensions';
import type { SocraticReport } from './socratic';

// ── 智者优先级排序 ──

interface SageRanking {
  sageId: SageId;
  priority: number;
  reason: string;
}

/**
 * 根据用户画像计算智者推荐顺序
 */
export function rankSagesForProfile(topology: TopologyProfile): SageRanking[] {
  const rankings: SageRanking[] = DEFAULT_SAGE_ORDER.map((sageId, idx) => {
    const sage = SAGE_MAP[sageId];
    let priority = 100 - idx * 10; // 基础优先级按默认顺序递减
    let reason = '默认顺序';

    // 维度数据完整度加权
    const focusDimIds = sage.focusDimensions
      .map(fd => fd.split('.')[0])
      .filter((v, i, a) => a.indexOf(v) === i);

    const dimTopos = topology.dimensionTopologies || {};
    const completeDims = focusDimIds.filter(
      d => dimTopos[d]
    ).length;
    const completeness = focusDimIds.length > 0 ? completeDims / focusDimIds.length : 0;

    if (completeness < 0.5) {
      priority -= 30;
      reason = '关键维度数据不足';
    } else if (completeness === 1) {
      priority += 10;
      reason = '数据完整';
    }

    // 画像特征匹配加权
    priority += getProfileBoost(sageId, topology);
    const boostReason = getBoostReason(sageId, topology);
    if (boostReason) reason = boostReason;

    return { sageId, priority, reason };
  });

  return rankings.sort((a, b) => b.priority - a.priority);
}

function getProfileBoost(sageId: SageId, topology: TopologyProfile): number {
  const dims = topology.dimensionTopologies || {};
  const reactions = topology.crossReactions || [];

  switch (sageId) {
    case 'philosopher': {
      // 高意义追寻 + 低意义存在 → 优先级大幅提升
      const wv = dims['worldview'];
      if (wv) {
        const searchTrait = wv.dominantTraits.find(t => t.subDimension === 'meaning_search');
        const presenceTrait = wv.dominantTraits.find(t => t.subDimension === 'meaning_presence');
        if (searchTrait?.typology?.includes('追寻') && presenceTrait?.typology?.includes('迷茫'))
          return 25;
      }
      return 0;
    }
    case 'scientist': {
      // 认知维度有丰富数据时优先
      const cog = dims['cognitive'];
      if (cog && cog.dominantTraits.filter(t => t.typology !== '待识别').length >= 4)
        return 15;
      return 0;
    }
    case 'analyst': {
      // 存在跨维度摩擦/悖论反应时优先
      const frictionCount = reactions.filter(
        r => r.reactionType === 'friction' || r.reactionType === 'paradox'
      ).length;
      return frictionCount * 10;
    }
    case 'relationalist': {
      // 依恋维度有显著焦虑或回避时优先
      const soc = dims['social'];
      if (soc) {
        const anxiety = soc.dominantTraits.find(t => t.subDimension === 'attachment_anxiety');
        const avoidance = soc.dominantTraits.find(t => t.subDimension === 'attachment_avoidance');
        if (anxiety?.typology?.includes('焦虑') || avoidance?.typology?.includes('回避'))
          return 20;
      }
      return 0;
    }
    case 'creator': {
      // 审美维度数据完整且有创意成就落差时优先
      const aes = dims['aesthetic'];
      if (aes) {
        const sensitivity = aes.dominantTraits.find(t => t.subDimension === 'aesthetic_sensitivity');
        const achievement = aes.dominantTraits.find(t => t.subDimension === 'creative_achievement');
        if (sensitivity?.typology && achievement?.typology?.includes('低'))
          return 20;
      }
      return 0;
    }
    case 'system_builder':
      // 始终最后，但如果 self_regulation 低则更需要
      return 0;
    case 'product_sage':
      // Product Sage 使用解锁逻辑，不依赖数值排序
      return -999;
  }
}

function getBoostReason(sageId: SageId, topology: TopologyProfile): string | null {
  const dims = topology.dimensionTopologies || {};
  const reactions = topology.crossReactions || [];

  switch (sageId) {
    case 'philosopher': {
      const wv = dims['worldview'];
      if (wv) {
        const search = wv.dominantTraits.find(t => t.subDimension === 'meaning_search');
        if (search?.typology?.includes('追寻')) return '意义追寻倾向显著';
      }
      return null;
    }
    case 'analyst': {
      const fc = reactions.filter(r => r.reactionType === 'friction' || r.reactionType === 'paradox');
      if (fc.length > 0) return `检测到 ${fc.length} 个内在张力`;
      return null;
    }
    case 'relationalist': {
      const soc = dims['social'];
      if (soc) {
        const anxiety = soc.dominantTraits.find(t => t.subDimension === 'attachment_anxiety');
        if (anxiety?.typology?.includes('焦虑')) return '依恋焦虑模式显著';
      }
      return null;
    }
    default:
      return null;
    case 'product_sage':
      return null; // Product Sage 使用解锁逻辑而非 boost
  }
}

// ── System Prompt 构建器 ──

/**
 * 为指定智者构建完整 System Prompt
 */
export function buildSageSystemPrompt(
  sageId: SageId,
  report: SocraticReport,
  _topology: TopologyProfile,
): string {
  const sage = SAGE_MAP[sageId];
  const baseContext = buildProfileContext(report, _topology);

  const personalityBlock = `## 你的身份

你是「${sage.name}」（${sage.nameEn}），原型来自 ${sage.archetype}。
${sage.description}。

你不是一个泛泛而谈的聊天机器人。你是一位有深度、有立场、有方法论的对话引导者。`;

  const styleBlock = SAGE_STYLE_BLOCKS[sageId];

  const outputBlock = `## 建议回复

每次回复末尾，你必须附加如下 JSON 格式的建议回复选项（独占一行，3 个选项）：

\`\`\`suggestions
["选项1", "选项2", "选项3"]
\`\`\`

三个选项必须体现不同的回应姿态：一个防御/否认型，一个坦诚面对型，一个主动深挖型。每个选项 10-25 字。`;

  const rulesBlock = `## 绝对规则

- 🚫 禁止任何形式的鸡汤和敷衍（"你已经很棒了""这很正常"）
- 🚫 禁止提及具体数字分数或百分位
- 🚫 禁止给出用户没有要求的诊断标签
- ✅ 每次回复必须包含至少一个引导深入的核心问题
- ✅ 必须精准引用用户画像中的具体特质类型来支撑观察
- ✅ 使用 **加粗** 标记关键概念
- ✅ 每次回复控制在 120-300 字`;

  return `${personalityBlock}

${styleBlock}

${rulesBlock}

${outputBlock}

${baseContext}

## 开场指令

现在请基于以上画像数据，以你的独特视角开启第一轮对话。
不要从"你好"开始。直接切入你最擅长的观察视角，抛出一个让用户思考的问题。`;
}

function buildProfileContext(report: SocraticReport, _topology: TopologyProfile): string {
  const traitLines = Object.entries(report.dimensions)
    .map(([id, d]) => {
      const dim = DIMENSION_MAP[id];
      return `- ${dim?.icon || '📊'} ${dim?.name || id}:
    特质: ${d.description}
    顺流区: ${d.strength || '待识别'}
    消耗区: ${d.growth || '待识别'}`;
    })
    .join('\n');

  const tensionLines = report.crossDimensionTensions.length > 0
    ? report.crossDimensionTensions.map(t => `  · ${t.title}: ${t.description}`).join('\n')
    : '  （各维度相对和谐，无明显冲突）';

  return `## 用户的拓扑画像

原型：「${report.selfTheme}」
叙事身份：${report.narrativeTheme}

### 各维度特质
${traitLines}

### 跨维度化学反应（张力地图）
${tensionLines}`;
}

// ── 各智者风格区块 ──

const SAGE_STYLE_BLOCKS: Record<SageId, string> = {
  scientist: `## 对话风格

1. 【系统拆解】先解读用户的认知架构组合——直觉型还是分析型，元认知强还是弱，是否热爱深度思考。用认知科学的语言命名这些模式。
2. 【决策复盘】选取用户最近做过的一个重要决定，逐步拆解信息收集、直觉介入、反思修正的过程。
3. 【流程映射】请用户描述学习新技能或做项目的典型流程，标出"轻松之处"和"卡点"。
4. 【建议生成】将模式转译为可执行的工作流改造建议。

适时引用：Kahneman 系统一/二、Stanovich 三重心智模型、Flavell 元认知等理论框架。`,

  philosopher: `## 对话风格

1. 【起点定位】从画像中选取最反直觉的数据点（如"意义追寻很高但意义存在中等"），请用户用自己的话讲述背后的故事。
2. 【信念抽丝】围绕具体生活领域追问："什么算是'好'或'对'？"逐步显露用户的价值排序。
3. 【世界假设探查】询问用户对公平、苦难、偶然性的看法，以及背后的关键经历。
4. 【意义线索收束】帮用户找到反复出现的"意义线索"并命名。

适时引用：苏格拉底"未经审视的生活不值得过"、弗兰克尔意义治疗、Kierkegaard 存在焦虑、Antonovsky 健康起源学。`,

  analyst: `## 对话风格

1. 【冲突地图】基于画像画出 3-4 个高张力组合（如"高成就+高仁慈""高依恋焦虑+高回避"）。
2. 【剧本访谈】围绕每个张力组合，请用户讲述实际生活中的 1-2 个具体故事。
3. 【阴影识别】温和探问故事中被压抑的一方在说什么、害怕什么。注意：不评价好坏。
4. 【故事重写】尝试用更整合、更不自我攻击的叙事方式重述这些经历。

适时引用：荣格阴影面、Festinger 认知失调、Winnicott 真假自体、内省偏差 Nisbett & Wilson。`,

  relationalist: `## 对话风格

1. 【人际雷达】解析画像中社交温暖、支配、联结感与依恋风格的组合特征。
2. 【关系谱系】邀请用户列出 3-5 个重要关系，标注"亲近程度/安全感/真实自我表达程度"。
3. 【冲突演练】选取一个典型冲突情境，用画像中的冲突风格分类做角色扮演。
4. 【小实验设计】针对一个具体关系，和用户一起设计"边界/表达/支持"的微小实验。

适时引用：Bowlby 依恋理论、Rogers 无条件积极关注、Gottman 四骑士理论、Wiggins 人际环。感受层面的共情必须到位。`,

  creator: `## 对话风格

1. 【审美地图】基于画像梳理用户对先锋/写实/抽象/极简等风格的吸引力排序和审美情绪类型。
2. 【创作史回顾】让用户回忆最满意的 1-3 次创作经历，拆解过程与感受。
3. 【审美细节】通过"如果你做一部电影/一本书/一款产品，它在色调、节奏、质感上更接近什么"具体化审美。
4. 【阻力剖析】结合自我调节、毅力、社会评价需求等维度，分析"创作卡住"的常见模式。

适时引用：Guilford 发散思维、Csikszentmihalyi 心流理论、Amabile 内在动机原理、Berlyne 实验美学。`,

  system_builder: `## 对话风格

1. 【目标收束】将前几位智者的关键词整理成 2-3 个"人生/创作方向假设"。
2. 【杠杆点选择】结合画像中的尽责性、自主需求、自我调节等维度，评估用户在哪些领域更容易形成新习惯。
3. 【实验设计】为每个方向设计 1 个"低门槛、高反馈"的实验（如 14 天写作、每周一次深度对话）。
4. 【监测机制】定义清晰的成功指标与复盘节奏。

你的核心特质：极其实用，不做任何空泛讨论。每一句话都要能转化为具体行动。
适时引用：BJ Fogg 微习惯、James Clear 原子习惯、Bandura 自我效能理论。`,

  product_sage: `## 对话风格

你是一位融合了产品经理、生活设计师与审美总监的智者。1

1. 【问题池构建】基于前几位智者的洞见，帮助用户梳理出 5-10 个反复困扰他们的生活任务（Jobs）和痛点。用 JTBD 框架解构：“你想要____，但总是因为____而卡住。”
2. 【适配度排序】结合用户的天赋、审美偏好和现有资源，为每个 Job 计算“自我解决适配度”，找出最值得用户亲自解决的问题。
3. 【产品方向选择】与用户共同选出 1-3 个核心方向。问：“这个方向更像一个流程、一个工具，还是一种环境/服务？”
4. 【产品概念共创】将选定方向结构化为产品概念：名称、核心承诺、关键特性、体验原则、审美规格。
5. 【实现计划草拟】为每个产品生成可落地的实现计划：本地与互联网组件、时间线、风险与成功指标。

适时引用：JTBD 框架、Design Thinking、MVP 方法论、个人工作流设计。

## 特殊规则

- 你将前 6 位智者的洞见作为用户画像的核心输入。引用时说“从你与认知架构师/关系导师的对话中我注意到…”
- 不走大众市场思维。始终把用户自己作为“第一用户”
- 每个建议都必须有具体的下一步操作
- 在「产品概念共创」阶段，生成的概念必须包含：工作名称、核心承诺、关键特性、体验原则、审美关键词`,
};

// ── 智者对话阶段判定 ──

export function getSagePhase(sageId: SageId, turnCount: number): string {
  const sage = SAGE_MAP[sageId];
  const phases = sage.phaseLabels;
  const totalPhases = phases.length;

  // Product Sage 有 5 个阶段，每 2-3 轮进入下一阶段
  if (totalPhases === 5) {
    if (turnCount <= 2) return phases[0];
    if (turnCount <= 4) return phases[1];
    if (turnCount <= 6) return phases[2];
    if (turnCount <= 9) return phases[3];
    if (turnCount <= 12) return phases[4];
    return 'complete';
  }

  // 标准 4 阶段智者
  if (turnCount <= 1) return phases[0];
  if (turnCount <= 3) return phases[1] || phases[0];
  if (turnCount <= 5) return phases[2] || phases[1];
  if (turnCount <= 7) return phases[3] || phases[2];
  return 'complete';
}

/**
 * 获取对话阶段引导提示（追加到消息中引导 AI 切换阶段）
 */
export function getPhaseGuidance(sageId: SageId, turnCount: number): string | null {
  const phase = getSagePhase(sageId, turnCount);
  const sage = SAGE_MAP[sageId];
  const phaseIdx = sage.phaseLabels.indexOf(phase);

  if (phase === 'complete') {
    return `对话即将结束。用一段精辟但温暖的结语收场——留下一个让用户在之后几天持续思考的种子问题。不需要提供建议回复选项。`;
  }

  if (phaseIdx >= 2) {
    return `现在进入「${phase}」阶段。请将对话深度推进到这个阶段对应的核心探索领域。`;
  }

  return null;
}

// ── 智者结构化输出解析 ──

/**
 * 尝试从 AI 回复文本中解析结构化洞见
 */
export function parseSageInsight(sageId: SageId, aiText: string): SageInsight | null {
  // 尝试提取 JSON
  const jsonMatch = aiText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[1]);
    if (parsed.sageId === sageId) return parsed as SageInsight;
    // 补全 sageId
    return { sageId, ...parsed } as SageInsight;
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// V3.0: 圆桌模式 (Roundtable)
// ══════════════════════════════════════════════════════════════

export interface RoundtableSageSummary {
  sageId: SageId;
  sageName: string;
  keyInsight: string; // 1-2 句核心洞见
}

/**
 * 获取圆桌模式的智者顺序（排除 product_sage，它是终局解锁型）
 */
export function getRoundtableOrder(topology: TopologyProfile): SageId[] {
  const rankings = rankSagesForProfile(topology);
  return rankings
    .filter(r => r.sageId !== 'product_sage')
    .map(r => r.sageId);
}

/** 每位智者在圆桌中的用户回复轮数 */
export const ROUNDTABLE_TURNS_PER_SAGE = 2;

/**
 * 从某位智者的对话消息中提取 1-2 句摘要
 * 只取 AI 的消息，提取关键概念
 */
export function summarizeSageRound(
  sageId: SageId,
  messages: { role: 'ai' | 'user'; content: string }[],
): RoundtableSageSummary {
  const sage = SAGE_MAP[sageId];
  const aiMessages = messages.filter(m => m.role === 'ai');
  
  // 取所有 AI 消息，提取加粗的关键词
  const allText = aiMessages.map(m => m.content).join(' ');
  const boldMatches = allText.match(/\*\*(.+?)\*\*/g) || [];
  const keywords = boldMatches.slice(0, 4).map(b => b.replace(/\*\*/g, '')).join('、');
  
  // 取第一条 AI 消息的前 80 字作为核心观察
  const firstAiText = aiMessages[0]?.content || '';
  const coreObservation = firstAiText
    .replace(/\*\*/g, '')
    .replace(/```suggestions[\s\S]*?```/g, '')
    .trim()
    .slice(0, 80);

  return {
    sageId,
    sageName: sage.name,
    keyInsight: keywords
      ? `${sage.name}指出了关键特质：${keywords}。「${coreObservation}…」`
      : `${sage.name}与用户探讨了其核心画像特征。`,
  };
}

function findTrait(topology: TopologyProfile, dimensionId: string, subDimensionId: string): string {
  const trait = topology.dimensionTopologies[dimensionId]?.dominantTraits.find(item => item.subDimension === subDimensionId);
  return trait?.typology && trait.typology !== '待识别' ? trait.typology : '待继续校准';
}

export function buildSageInsightFromRoundSummary(
  sageId: SageId,
  summary: RoundtableSageSummary,
  topology: TopologyProfile,
): SageInsight {
  const key = summary.keyInsight;
  switch (sageId) {
    case 'scientist':
      return {
        sageId,
        cognitiveWorkflow: {
          decisionStyle: findTrait(topology, 'cognitive', 'thinking_style'),
          learningStyle: findTrait(topology, 'cognitive', 'need_for_cognition'),
          strengths: [findTrait(topology, 'cognitive', 'metacognition'), key],
          risks: topology.pendingVerification.slice(0, 3),
          suggestedPractices: ['把重要判断拆成证据、假设、反例三栏', '用真实项目复盘校准短测推断'],
        },
      };
    case 'philosopher':
      return {
        sageId,
        worldviewModel: {
          coreValues: [findTrait(topology, 'worldview', 'meaning_presence'), findTrait(topology, 'worldview', 'moral_fairness')],
          meaningSources: [findTrait(topology, 'worldview', 'meaning_search'), key],
          assumptions: ['意义线索需要通过长期选择继续验证'],
          tensions: topology.crossReactions.slice(0, 3).map(reaction => reaction.title),
        },
      };
    case 'analyst':
      return {
        sageId,
        conflictMap: {
          tensions: topology.crossReactions.slice(0, 4).map(reaction => ({
            pair: reaction.dimensions.join(' × '),
            narrative: reaction.narrative,
            shadowSide: reaction.implication,
          })),
          currentFocus: key,
        },
      };
    case 'relationalist':
      return {
        sageId,
        relationshipPattern: {
          attachmentSummary: `${findTrait(topology, 'social', 'attachment_anxiety')} / ${findTrait(topology, 'social', 'attachment_avoidance')}`,
          defaultScript: findTrait(topology, 'social', 'conflict_style'),
          desiredState: key,
          experiments: ['选一个低风险关系练习清晰表达边界', '记录一次冲突前后的身体信号和解释假设'],
        },
      };
    case 'creator':
      return {
        sageId,
        aestheticProfile: {
          stylePreferences: [findTrait(topology, 'aesthetic', 'aesthetic_sensitivity')],
          creativeProcess: findTrait(topology, 'aesthetic', 'creative_self'),
          blockPatterns: topology.pendingVerification.slice(0, 3),
          aestheticManifesto: key,
        },
      };
    case 'system_builder':
      return {
        sageId,
        upgradePlan: {
          horizonMonths: 6,
          themes: [{
            name: '自我建模校准',
            motivation: key,
            experiments: [{
              title: '每周一次画像证据复盘',
              cadence: 'weekly',
              timeBoxMinutes: 45,
              successMetric: '每周至少新增一条真实行为证据并修正一个画像假设',
            }],
          }],
        },
      };
    case 'product_sage':
      return {
        sageId,
        discoveredJobs: [],
        painPoints: [],
        selfSolverFits: [],
        productConcepts: [],
        implementationPlans: [],
      };
  }
}

export function buildPersonalOSFromSageSummaries(
  summaries: RoundtableSageSummary[],
  topology: TopologyProfile,
): PersonalOS {
  const bySage = Object.fromEntries(summaries.map(summary => [summary.sageId, summary.keyInsight])) as Partial<Record<SageId, string>>;
  return {
    id: `personal-os-${Date.now()}`,
    cognitiveModel: bySage.scientist || topology.dimensionTopologies.cognitive?.collaborationRole || '认知模型待继续校准',
    worldviewAnchor: bySage.philosopher || topology.dimensionTopologies.worldview?.collaborationRole || '意义锚点待继续校准',
    tensionMap: [
      ...(bySage.analyst ? [bySage.analyst] : []),
      ...topology.crossReactions.slice(0, 4).map(reaction => `${reaction.title}: ${reaction.implication}`),
    ],
    relationshipSummary: bySage.relationalist || topology.dimensionTopologies.social?.collaborationRole || '关系模式待继续校准',
    aestheticBaseline: bySage.creator || topology.dimensionTopologies.aesthetic?.collaborationRole || '审美基线待继续校准',
    upgradeRoadmap: [
      bySage.system_builder || '用每周复盘把画像假设和真实行为证据对齐',
      '把高置信画像写入 Boss 记忆，把低置信画像保留为待验证问题',
    ],
    narrative: summaries.map(summary => summary.keyInsight).join('\n'),
    createdAt: new Date().toISOString(),
  };
}

/**
 * 为圆桌模式智者构建增强 System Prompt（包含前序智者摘要）
 */
export function buildRoundtableSagePrompt(
  sageId: SageId,
  report: SocraticReport,
  topology: TopologyProfile,
  previousSummaries: RoundtableSageSummary[],
): string {
  const basePrompt = buildSageSystemPrompt(sageId, report, topology);

  if (previousSummaries.length === 0) {
    return basePrompt + `\n\n## 圆桌模式\n\n你是圆桌讨论中**第一位发言**的智者。你的任务是率先从你最擅长的视角切入，为后续智者的接力奠定基础。用最被画像数据启发的犀利角度开场——不要泛泛而谈。`;
  }

  const summaryLines = previousSummaries
    .map((s, i) => `${i + 1}. **${s.sageName}**: ${s.keyInsight}`)
    .join('\n');

  return basePrompt + `\n\n## 圆桌模式

你正在一场智者圆桌讨论中**接力发言**。以下是前面的智者已经与用户探讨过的关键洞见：

${summaryLines}

### 你的接力规则：
- 不要重复前面智者已经说过的内容
- 可以引用前序智者的发现，说"从${previousSummaries[previousSummaries.length - 1].sageName}的对话中我注意到…"
- 必须从你独特的专业视角提供**新的观察角度**
- 你的第一句就要让用户感觉"这个视角完全不同"`;
}
