/**
 * 产品设计引擎 (Product Design Engine)
 *
 * 四大模块：
 * 1. Need & Pain Explorer — 从画像+智者洞见提取候选 Jobs
 * 2. Talent-Aesthetic-Resource Matcher — 计算 SelfSolverFit
 * 3. Product Forge — 构建 ProductConcept
 * 4. Implementation Orchestrator — 生成 ImplementationPlan
 */

import type {
  TopologyProfile,
  SageInsight,
  Job,
  PainPoint,
  SelfSolverFit,
  ProductConcept,
  ImplementationPlan,
  CreatorInsight,
  SystemBuilderInsight,
} from '../types';

// ── 工具函数 ──

let _counter = 0;
function uid(): string {
  return `pde-${Date.now()}-${++_counter}`;
}

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

// ══════════════════════════════════════════════════════════════
// 1. Need & Pain Explorer
// ══════════════════════════════════════════════════════════════

/**
 * 从 TopologyProfile + 智者洞见中提取候选 Jobs
 * 这是初始化 Product Sage 对话前的"热启动"数据
 */
export function extractJobCandidates(
  topology: TopologyProfile,
  insights: SageInsight[],
): Job[] {
  const jobs: Job[] = [];

  // 1. 从内在张力 → 潜在 Jobs
  const crossReactions = topology.crossReactions ?? [];
  for (const rx of crossReactions) {
    if (rx.reactionType === 'friction' || rx.reactionType === 'paradox') {
      jobs.push({
        id: uid(),
        title: `解决「${rx.title}」带来的内在摩擦`,
        context: {
          lifeArea: 'other',
          frequency: 'episodic',
          currentWorkflow: rx.narrative,
          desiredOutcome: rx.implication,
        },
        constraints: [],
        emotionalJobs: ['减少内在冲突带来的消耗'],
        socialJobs: [],
        importanceScore: 0,
        satisfactionScore: 0,
      });
    }
  }

  // 2. 从 Analyst（阴影分析师）洞见 → 痛点驱动 Jobs
  const analystInsight = insights.find(i => i.sageId === 'analyst');
  if (analystInsight && 'conflictMap' in analystInsight) {
    for (const t of analystInsight.conflictMap.tensions) {
      jobs.push({
        id: uid(),
        title: `转化「${t.pair}」这组阴影张力`,
        context: {
          lifeArea: 'other',
          frequency: 'daily',
          currentWorkflow: t.narrative,
          desiredOutcome: `将 ${t.shadowSide} 转化为建设性力量`,
        },
        constraints: ['需要持续自我觉察'],
        emotionalJobs: ['获得内在整合感'],
        socialJobs: [],
        importanceScore: 0,
        satisfactionScore: 0,
      });
    }
  }

  // 3. 从 System Builder 的升级主题 → 行动 Jobs
  const sbInsight = insights.find(i => i.sageId === 'system_builder');
  if (sbInsight && 'upgradePlan' in sbInsight) {
    for (const theme of sbInsight.upgradePlan.themes) {
      jobs.push({
        id: uid(),
        title: `构建「${theme.name}」的支持系统`,
        context: {
          lifeArea: 'work',
          frequency: 'weekly',
          currentWorkflow: theme.motivation,
          desiredOutcome: `${theme.name}达到可持续运转的状态`,
        },
        constraints: theme.experiments.map(e => `每次 ${e.timeBoxMinutes} 分钟`),
        emotionalJobs: ['感到有掌控感和进步感'],
        socialJobs: [],
        importanceScore: 0,
        satisfactionScore: 0,
      });
    }
  }

  // 4. 从能力高耗能区 → 需要工具辅助的 Jobs
  const dimTopos = topology.dimensionTopologies ?? {};
  for (const [, dt] of Object.entries(dimTopos)) {
    for (const drain of dt.energyDynamics?.drainZones ?? []) {
      jobs.push({
        id: uid(),
        title: `用工具减轻「${drain}」的消耗`,
        context: {
          lifeArea: 'work',
          frequency: 'daily',
          currentWorkflow: `当前在 ${dt.name} 领域中，${drain} 是主要耗能点`,
          desiredOutcome: '通过工具/流程降低认知负荷',
        },
        constraints: ['不想牺牲产出质量'],
        emotionalJobs: ['减少疲惫感'],
        socialJobs: [],
        importanceScore: 0,
        satisfactionScore: 0,
      });
    }
  }

  return jobs;
}

/**
 * 从 Job 提取关联 PainPoints（简化版，由 AI 对话深化）
 */
export function derivePainPoints(job: Job): PainPoint[] {
  return job.constraints.map(c => ({
    id: uid(),
    jobId: job.id,
    symptom: c,
    suspectedRootCause: '待对话中深入探索',
    intensity: 0.5,
    recurrence: 'frequent' as const,
    examples: [],
  }));
}

// ══════════════════════════════════════════════════════════════
// 2. Talent-Aesthetic-Resource Matcher
// ══════════════════════════════════════════════════════════════

/**
 * 计算某个 Job 的"自我解决适配度"
 */
export function computeSelfSolverFit(
  job: Job,
  topology: TopologyProfile,
  creatorInsight?: CreatorInsight,
): SelfSolverFit {
  const rationale: string[] = [];
  const dimTopos = topology.dimensionTopologies ?? {};

  // talentMatch: 心流区与 Job 领域的重叠度
  const allFlowZones = Object.values(dimTopos).flatMap(d => d.energyDynamics?.flowZones ?? []);
  const jobKeywords = [job.title, job.context.desiredOutcome, ...job.emotionalJobs].join(' ');
  const flowOverlap = allFlowZones.filter(f => jobKeywords.includes(f) || f.length > 2).length;
  const talentMatch = clamp(flowOverlap * 0.2 + 0.3);
  if (talentMatch > 0.6) rationale.push('你在相关领域有天然心流区');

  // aestheticMatch: 创作审美与产品形态的契合度
  let aestheticMatch = 0.5;
  if (creatorInsight?.aestheticProfile) {
    const creativeProcess = creatorInsight.aestheticProfile.creativeProcess ?? '';
    if (job.context.lifeArea === 'creation' || creativeProcess.length > 20) {
      aestheticMatch = 0.8;
      rationale.push('你的审美偏好与该问题的设计空间高度契合');
    }
  }

  // resourceFeasibility: 基于约束数量的粗估
  const resourceFeasibility = clamp(1 - job.constraints.length * 0.15);
  if (resourceFeasibility < 0.4) rationale.push('约束较多，MVP 需要精简');

  // learningLeverage: 解决此问题能带来的成长
  const motivationDims = Object.keys(dimTopos).filter(k => k.startsWith('motivation'));
  const learningLeverage = clamp(0.5 + motivationDims.length * 0.1);
  if (learningLeverage > 0.6) rationale.push('解决此问题能加速你关注的成长方向');

  const overallScore = clamp(
    talentMatch * 0.3 + aestheticMatch * 0.25 + resourceFeasibility * 0.25 + learningLeverage * 0.2
  );

  return {
    jobId: job.id,
    talentMatch,
    aestheticMatch,
    resourceFeasibility,
    learningLeverage,
    overallScore,
    rationale,
  };
}

// ══════════════════════════════════════════════════════════════
// 3. Product Forge
// ══════════════════════════════════════════════════════════════

/**
 * 从 Job + Fit 构建初始 ProductConcept（脚手架，由 AI 对话完善）
 */
export function buildProductConcept(
  job: Job,
  fit: SelfSolverFit,
  creatorInsight?: CreatorInsight,
): ProductConcept {
  const aestheticKeywords = creatorInsight?.aestheticProfile?.stylePreferences ?? ['简洁', '高效'];

  return {
    id: uid(),
    jobId: job.id,
    workingTitle: `为「${job.title.slice(0, 15)}」设计的个人产品`,
    productType: fit.resourceFeasibility > 0.6 ? 'digital_tool' : 'workflow',
    targetUser: 'self',
    corePromise: job.context.desiredOutcome,
    keyFeatures: [],
    experiencePrinciples: [],
    aestheticSpec: {
      keywords: aestheticKeywords,
      references: [],
    },
  };
}

// ══════════════════════════════════════════════════════════════
// 4. Implementation Orchestrator
// ══════════════════════════════════════════════════════════════

/**
 * 从 ProductConcept 生成初始 ImplementationPlan（脚手架，由 AI 对话完善）
 */
export function buildImplementationPlan(
  concept: ProductConcept,
  sbInsight?: SystemBuilderInsight,
): ImplementationPlan {
  const horizonMonths = sbInsight?.upgradePlan?.horizonMonths ?? 3;

  return {
    id: uid(),
    productId: concept.id,
    horizonMonths,
    scope: concept.targetUser === 'self' ? 'personal_mvp' : 'inner_circle',
    localComponents: [
      {
        type: 'ritual',
        description: '每日/周固定时段投入产品使用与优化',
        tooling: ['日历', '计时器'],
      },
    ],
    webComponents: concept.productType === 'digital_tool' ? [
      {
        type: 'no_code',
        description: '使用 Notion/Obsidian/低代码平台搭建 MVP',
        integrationLevel: 'semi_auto',
      },
    ] : [],
    effortEstimate: 'medium',
    risks: ['过度设计导致无法启动', '对工具迷恋超过真正使用'],
    successMetrics: [concept.corePromise],
  };
}

/**
 * 辅助函数：检查 Product Sage 的解锁条件
 */
export function isProductSageUnlocked(
  sageSessions: Partial<Record<string, { status: string }>>,
): boolean {
  const creatorDone = sageSessions.creator?.status === 'completed';
  const sbDone = sageSessions.system_builder?.status === 'completed';
  return creatorDone && sbDone;
}
