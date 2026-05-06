import type {
  CATResponse,
  GameResult,
  ImplementationPlan,
  Job,
  MatrixSessionResult,
  PersonalOS,
  ProductConcept,
  QuestionPresentationSnapshot,
  SageInsight,
  SageSession,
  SelfAgentConstitution,
  TopologyProfile,
} from '../types';
import type { HumanMapBlueprint } from '../types';
import { DIMENSION_MAP } from '../data/dimensions';

type PreferredStyle = 'analytical' | 'visionary' | 'pragmatic' | 'creative';
type ResourceStyle = 'bootstrapper' | 'balanced' | 'investor-backed';
type DecisionSpeed = 'impulsive' | 'deliberate' | 'analytical';

export interface OpenBasakaExportInput {
  topology: TopologyProfile;
  answers: Record<string, Record<string, string | number>>;
  avgChoices: Record<string, string>;
  avgProfile: Record<string, string>;
  avgCompleted: boolean;
  completedDimensions: string[];
  gameResults: GameResult[];
  matrixResults: MatrixSessionResult[];
  catResponses: Record<string, CATResponse[]>;
  sageSessions: Partial<Record<string, SageSession>>;
  sageInsights: SageInsight[];
  personalOS: PersonalOS | null;
  productJobs: Job[];
  productConcepts: ProductConcept[];
  implementationPlans: ImplementationPlan[];
  selfAgentConstitution?: SelfAgentConstitution | null;
  aiSummary?: string;
  humanMapBlueprint?: HumanMapBlueprint | null;
  questionPresentationSnapshots?: QuestionPresentationSnapshot[];
}

export interface OpenBasakaEvidenceTrace {
  source: 'questionnaire' | 'avg' | 'game' | 'cat' | 'matrix_reasoning' | 'dialogue' | 'topology' | 'product' | 'human_map' | 'question_trace' | 'self_agent_distillation';
  reference: string;
  insight: string;
}

export interface OpenBasakaBossCore {
  headline: string;
  promptSummary: string;
  currentFocus: string;
  longTermVision: string;
  mission: string;
  preferredStyle: PreferredStyle;
  resourceStyle: ResourceStyle;
  decisionSpeed: DecisionSpeed;
  riskTolerance: number;
  innovationBias: number;
  socialEnergy: number;
  executionDiscipline: number;
  emotionalSensitivity: number;
  aestheticSensitivity: number;
  curiosityBreadth: number;
  worldviewDrive: number;
  explanationPreferences: string[];
  excitementTriggers: string[];
  antiPatterns: string[];
  integrationGoals: string[];
  recommendedAgents: string[];
  recommendedResearchTopics: string[];
  evidenceTrace: OpenBasakaEvidenceTrace[];
}

export interface OpenBasakaExportBundle {
  schemaVersion: 'openbasaka-export-v1';
  sourceSystem: 'multi-dimension-profiling';
  exportedAt: string;
  rawSignalBundle: {
    completedDimensions: string[];
    avgCompleted: boolean;
    answers: Record<string, Record<string, string | number>>;
    avgChoices: Record<string, string>;
    avgProfile: Record<string, string>;
    gameResults: GameResult[];
    matrixResults: MatrixSessionResult[];
    catResponses: Record<string, CATResponse[]>;
    sageSessions: Partial<Record<string, SageSession>>;
    selfAgentConstitution?: SelfAgentConstitution | null;
    humanMapBlueprint?: HumanMapBlueprint | null;
    questionPresentationSnapshots?: QuestionPresentationSnapshot[];
  };
  fusedProfileBundle: {
    topology: TopologyProfile;
    sageInsights: SageInsight[];
    personalOS: PersonalOS | null;
    productJobs: Job[];
    productConcepts: ProductConcept[];
    implementationPlans: ImplementationPlan[];
    selfAgentConstitution?: SelfAgentConstitution | null;
    aiSummary: string;
  };
  openbasakaBundle: {
    bossCore: OpenBasakaBossCore;
  };
}

function unique(values: Array<string | undefined | null>, limit = 8): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = (value || '').trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
    if (result.length >= limit) break;
  }
  return result;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function pickFirst(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    const cleaned = (value || '').trim();
    if (cleaned) return cleaned;
  }
  return '';
}

function truncate(text: string, max = 180): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function keywordScore(text: string, keywords: string[]): number {
  const lowered = text.toLowerCase();
  return keywords.reduce((sum, keyword) => (
    lowered.includes(keyword.toLowerCase()) ? sum + 1 : sum
  ), 0);
}

function collectHumanMapText(input: OpenBasakaExportInput): string {
  const blueprint = input.humanMapBlueprint;
  if (!blueprint) return '';
  return [
    blueprint.summary,
    blueprint.lifeStage,
    blueprint.currentFocus,
    blueprint.immersivePrompt,
    ...blueprint.sourceDigest,
    ...blueprint.dimensionPlans.slice(0, 3).map(plan => `${plan.reason} ${plan.immersivePrompt}`),
  ].join(' ');
}

function pickHumanMapFutureSignal(input: OpenBasakaExportInput): string {
  return input.humanMapBlueprint?.sourceDigest.find(item => /(10 年|10年|未来|最终|成为|理想|数字化身)/.test(item)) || '';
}

function normalizeHumanMapWeights(input: OpenBasakaExportInput): Record<string, number> {
  const weights = input.humanMapBlueprint?.dimensionWeights;
  if (!weights) return {};

  const entries = Object.entries(weights);
  if (entries.length === 0) return {};
  const values = entries.map(([, value]) => Number(value) || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return Object.fromEntries(entries.map(([key, value]) => {
    if (max === min) return [key, 58];
    return [key, clamp(38 + ((value - min) / (max - min)) * 54)];
  }));
}

function humanMapSignalScore(input: OpenBasakaExportInput, signalId: HumanMapBlueprint['signalScores'][number]['id']): number {
  const blueprint = input.humanMapBlueprint;
  if (!blueprint) return 0;
  const maxScore = Math.max(4, ...blueprint.signalScores.map(signal => signal.score));
  const target = blueprint.signalScores.find(signal => signal.id === signalId);
  if (!target) return 0;
  return Math.min(1, target.score / maxScore);
}

function humanMapWatchouts(input: OpenBasakaExportInput): string[] {
  if (!input.humanMapBlueprint) return [];

  const watchouts: string[] = [];
  if (humanMapSignalScore(input, 'career_execution') >= 0.6) {
    watchouts.push('目标感很强时容易同时开太多战线');
  }
  if (humanMapSignalScore(input, 'emotion_healing') >= 0.55) {
    watchouts.push('高压阶段容易被情绪摩擦放大判断成本');
  }
  if (humanMapSignalScore(input, 'relationship_pattern') >= 0.55) {
    watchouts.push('关系波动可能牵动执行节奏');
  }
  if (humanMapSignalScore(input, 'identity_meaning') >= 0.6) {
    watchouts.push('宏大方向感需要进一步落到可执行路径');
  }
  if (humanMapSignalScore(input, 'creativity_expression') >= 0.55) {
    watchouts.push('不要只在有灵感时才允许自己输出');
  }

  return unique(watchouts, 4);
}

function inferPreferredStyle(input: OpenBasakaExportInput): PreferredStyle {
  const sourceText = [
    input.topology.selfArchetype,
    input.topology.narrativeIdentity,
    input.personalOS?.cognitiveModel,
    input.personalOS?.worldviewAnchor,
    input.personalOS?.narrative,
    collectHumanMapText(input),
    ...input.productConcepts.map(concept => `${concept.workingTitle} ${concept.corePromise}`),
    ...input.sageInsights.map(insight => JSON.stringify(insight)),
  ].join(' ');

  const scores: Record<PreferredStyle, number> = {
    analytical: keywordScore(sourceText, ['分析', '逻辑', '结构', '系统', '模型', '研究', '推理']),
    visionary: keywordScore(sourceText, ['愿景', '未来', '意义', '世界观', '蓝图', '长期', '哲学']),
    pragmatic: keywordScore(sourceText, ['执行', '落地', '效率', '节奏', '计划', '交付', '流程']),
    creative: keywordScore(sourceText, ['创作', '审美', '灵感', '表达', '设计', '叙事', '美感']),
  };

  const humanMapTopDimensions = input.humanMapBlueprint?.recommendedDimensions.slice(0, 3) || [];
  for (const dimensionId of humanMapTopDimensions) {
    if (dimensionId === 'cognitive') scores.analytical += 2;
    if (dimensionId === 'worldview') scores.visionary += 2;
    if (dimensionId === 'motivation') scores.pragmatic += 2;
    if (dimensionId === 'aesthetic') scores.creative += 2;
  }

  let best: PreferredStyle = 'analytical';
  for (const style of Object.keys(scores) as PreferredStyle[]) {
    if (scores[style] > scores[best]) best = style;
  }
  return best;
}

function inferDecisionSpeed(input: OpenBasakaExportInput): DecisionSpeed {
  const sourceText = [
    input.topology.narrativeIdentity,
    input.personalOS?.cognitiveModel,
    collectHumanMapText(input),
    ...input.sageInsights.map(insight => JSON.stringify(insight)),
  ].join(' ');

  if (input.humanMapBlueprint?.recommendedDimensions[0] === 'cognitive') return 'analytical';
  if (keywordScore(sourceText, ['快速', '直觉', '立即', '即兴']) >= 2) return 'impulsive';
  if (keywordScore(sourceText, ['分析', '复盘', '验证', '推理']) >= 2) return 'analytical';
  return 'deliberate';
}

function inferResourceStyle(input: OpenBasakaExportInput): ResourceStyle {
  const highEffort = input.implementationPlans.filter(plan => plan.effortEstimate === 'high').length;
  const publicFacing = input.productConcepts.filter(concept => concept.targetUser === 'public_niche').length;
  const customApps = input.implementationPlans.flatMap(plan => plan.webComponents)
    .filter(component => component.type === 'custom_app').length;

  if (highEffort + publicFacing + customApps >= 3) return 'investor-backed';
  if (input.implementationPlans.length > 0 && highEffort === 0 && customApps === 0) return 'bootstrapper';
  return 'balanced';
}

function collectFlowZones(input: OpenBasakaExportInput): string[] {
  return unique(
    Object.values(input.topology.dimensionTopologies)
      .flatMap(dimension => dimension.energyDynamics.flowZones)
  , 10);
}

function collectDrainZones(input: OpenBasakaExportInput): string[] {
  return unique(
    Object.values(input.topology.dimensionTopologies)
      .flatMap(dimension => dimension.energyDynamics.drainZones)
  , 10);
}

function collectDominantTypologies(input: OpenBasakaExportInput): string[] {
  return unique(
    Object.values(input.topology.dimensionTopologies)
      .flatMap(dimension => dimension.dominantTraits.map(trait => trait.typology))
  , 12);
}

function inferCurrentFocus(input: OpenBasakaExportInput): string {
  const analystInsight = input.sageInsights.find(insight => insight.sageId === 'analyst');
  const analyzedFocus = analystInsight && 'conflictMap' in analystInsight
    ? analystInsight.conflictMap.currentFocus
    : '';

  return pickFirst(
    input.humanMapBlueprint?.currentFocus,
    analyzedFocus,
    input.productConcepts[0]?.workingTitle,
    input.productJobs[0]?.title,
    input.topology.crossReactions[0]?.title,
    input.topology.selfArchetype,
  );
}

function inferLongTermVision(input: OpenBasakaExportInput): string {
  return pickFirst(
    pickHumanMapFutureSignal(input),
    input.personalOS?.worldviewAnchor,
    input.productConcepts[0]?.corePromise,
    input.personalOS?.narrative,
    input.topology.narrativeIdentity,
  );
}

function inferMission(input: OpenBasakaExportInput): string {
  return pickFirst(
    input.personalOS?.worldviewAnchor,
    input.humanMapBlueprint?.summary,
    input.productJobs[0]?.context.desiredOutcome,
    input.productConcepts[0]?.corePromise,
    input.topology.narrativeIdentity,
  );
}

function inferExplanationPreferences(style: PreferredStyle, input: OpenBasakaExportInput): string[] {
  const preferences: string[] = [];
  if (style === 'analytical') preferences.push('先框架后案例', '先定义问题再给方案');
  if (style === 'visionary') preferences.push('先愿景再拆路径', '把信息放进长期叙事里');
  if (style === 'pragmatic') preferences.push('先结论后步骤', '优先可执行清单');
  if (style === 'creative') preferences.push('先意象再结构', '需要强画面感与类比');
  if (input.humanMapBlueprint) preferences.push('先贴着你的阶段和原话解释');
  if ((input.questionPresentationSnapshots?.filter(snapshot => snapshot.personalized).length || 0) > 0) {
    preferences.push('先用贴身场景进入，再抽象成结论');
  }

  const creatorInsight = input.sageInsights.find(insight => insight.sageId === 'creator');
  if (creatorInsight && 'aestheticProfile' in creatorInsight) {
    preferences.push('适合用视觉语言辅助理解');
  }

  return unique(preferences, 6);
}

function inferExcitementTriggers(input: OpenBasakaExportInput): string[] {
  return unique([
    input.humanMapBlueprint?.currentFocus,
    ...(input.humanMapBlueprint?.sourceDigest.slice(0, 2) || []),
    ...collectFlowZones(input),
    ...input.productConcepts.flatMap(concept => concept.aestheticSpec.keywords),
    ...input.productConcepts.map(concept => concept.workingTitle),
    input.topology.crossReactions[0]?.title,
  ], 8);
}

function inferAntiPatterns(input: OpenBasakaExportInput): string[] {
  return unique([
    ...humanMapWatchouts(input),
    ...collectDrainZones(input),
    ...input.topology.pendingVerification,
    ...input.implementationPlans.flatMap(plan => plan.risks),
    ...input.sageInsights.flatMap(insight => {
      if (insight.sageId === 'creator') return insight.aestheticProfile.blockPatterns;
      if (insight.sageId === 'scientist') return insight.cognitiveWorkflow.risks;
      return [];
    }),
  ], 8);
}

function inferIntegrationGoals(input: OpenBasakaExportInput): string[] {
  return unique([
    input.humanMapBlueprint?.currentFocus ? `围绕 ${input.humanMapBlueprint.currentFocus} 建立更稳的阶段结构` : '',
    ...(input.personalOS?.upgradeRoadmap || []),
    ...input.implementationPlans.flatMap(plan => plan.successMetrics),
    ...input.productJobs.map(job => job.context.desiredOutcome),
  ], 6);
}

function inferRecommendedAgents(style: PreferredStyle, input: OpenBasakaExportInput): string[] {
  const agents = ['general'];
  if (style === 'analytical') agents.push('technical', 'critic');
  if (style === 'visionary') agents.push('strategy', 'market');
  if (style === 'pragmatic') agents.push('strategy', 'technical');
  if (style === 'creative') agents.push('creative', 'strategy');

  if (input.productConcepts.length > 0) agents.push('creative');
  if (input.implementationPlans.some(plan => plan.webComponents.some(component => component.type === 'custom_app'))) {
    agents.push('technical');
  }
  if (input.topology.crossReactions.some(reaction => reaction.reactionType === 'friction')) {
    agents.push('critic');
  }
  if (humanMapSignalScore(input, 'creativity_expression') >= 0.6) agents.push('creative');
  if (humanMapSignalScore(input, 'identity_meaning') >= 0.6) agents.push('strategy');

  return unique(agents, 4);
}

function inferRecommendedResearchTopics(input: OpenBasakaExportInput): string[] {
  return unique([
    ...((input.humanMapBlueprint?.signalScores.slice(0, 3).map(signal => signal.label)) || []),
    ...((input.humanMapBlueprint?.recommendedDimensions.slice(0, 2).map(dimensionId => `深化${DIMENSION_MAP[dimensionId]?.name || dimensionId}`)) || []),
    ...input.productConcepts.map(concept => concept.workingTitle),
    ...input.productConcepts.flatMap(concept => concept.keyFeatures),
    ...input.implementationPlans.flatMap(plan => plan.successMetrics),
    ...input.topology.crossReactions.map(reaction => reaction.title),
  ], 8);
}

function buildQuestionTraceInsights(input: OpenBasakaExportInput): OpenBasakaEvidenceTrace[] {
  const snapshots = [...(input.questionPresentationSnapshots || [])]
    .filter(snapshot => Boolean(snapshot.answerLabel || snapshot.answerValue != null))
    .sort((left, right) => {
      const leftTime = new Date(left.answeredAt || left.cachedAt).getTime();
      const rightTime = new Date(right.answeredAt || right.cachedAt).getTime();
      return rightTime - leftTime;
    })
    .slice(0, 4);

  return snapshots.map((snapshot) => {
    const reference = `${snapshot.dimensionName} / ${snapshot.personalized ? '个性化问法' : '题目回溯'}`;
    const narrative = [
      truncate(snapshot.renderedText, 48),
      snapshot.answerLabel ? `作答：${truncate(snapshot.answerLabel, 28)}` : '',
      snapshot.whyAsked ? `为什么问：${truncate(snapshot.whyAsked, 42)}` : '',
    ].filter(Boolean).join('｜');

    return {
      source: 'question_trace',
      reference,
      insight: narrative,
    };
  });
}

function buildMatrixReasoningTrace(input: OpenBasakaExportInput): OpenBasakaEvidenceTrace[] {
  const latest = input.matrixResults?.[0];
  if (!latest) return [];

  return [
    {
      source: 'matrix_reasoning',
      reference: `原创矩阵推理 / ${latest.version}`,
      insight: `得分 ${latest.rawScore}/${latest.maxScore}，正确率 ${Math.round(latest.accuracy * 100)}%，难度加权 ${latest.difficultyWeightedScore}，平均反应时 ${(latest.meanResponseTimeMs / 1000).toFixed(1)} 秒`,
    },
    {
      source: 'matrix_reasoning',
      reference: '规则族表现',
      insight: latest.ruleBreakdown
        .filter(rule => rule.attempted > 0)
        .map(rule => `${rule.family} ${rule.correct}/${rule.attempted}`)
        .join('｜') || '规则族样本不足',
    },
    {
      source: 'matrix_reasoning',
      reference: '测量边界',
      insight: latest.measurementNotes[0] || '原创矩阵短测仅作为自我建模证据，不能换算正式 IQ 或 Raven 分数',
    },
  ];
}

function buildEvidenceTrace(input: OpenBasakaExportInput): OpenBasakaEvidenceTrace[] {
  const traces: OpenBasakaEvidenceTrace[] = [];

  if (input.humanMapBlueprint) {
    traces.push({
      source: 'human_map',
      reference: 'Human Map 阶段判断',
      insight: `${input.humanMapBlueprint.lifeStage}｜${input.humanMapBlueprint.summary}`,
    });
    traces.push({
      source: 'human_map',
      reference: 'Human Map 当前主线',
      insight: input.humanMapBlueprint.currentFocus,
    });

    for (const signal of input.humanMapBlueprint.signalScores.slice(0, 3)) {
      traces.push({
        source: 'human_map',
        reference: `Human Map 信号 / ${signal.label}`,
        insight: signal.evidence.join('、') || `${signal.label} 是当前高频信号`,
      });
    }

    for (const digest of input.humanMapBlueprint.sourceDigest.slice(0, 3)) {
      traces.push({
        source: 'human_map',
        reference: 'Human Map 原话摘录',
        insight: digest,
      });
    }
  }

  for (const dimension of Object.values(input.topology.dimensionTopologies)) {
    for (const trait of dimension.dominantTraits.slice(0, 2)) {
      traces.push({
        source: 'topology',
        reference: `${dimension.name} / ${trait.subDimensionName}`,
        insight: `${trait.typology}｜${trait.description}`,
      });

      for (const evidence of trait.evidenceSources.slice(0, 2)) {
        traces.push({
          source: evidence.sourceType,
          reference: evidence.itemLabel,
          insight: evidence.observation,
        });
      }
    }
  }

  for (const reaction of input.topology.crossReactions.slice(0, 4)) {
    traces.push({
      source: 'topology',
      reference: reaction.title,
      insight: `${reaction.narrative}｜${reaction.implication}`,
    });
  }

  for (const concept of input.productConcepts.slice(0, 3)) {
    traces.push({
      source: 'product',
      reference: concept.workingTitle,
      insight: concept.corePromise,
    });
  }

  traces.push(...buildMatrixReasoningTrace(input));

  traces.push(...buildQuestionTraceInsights(input));

  if (input.selfAgentConstitution) {
    traces.push({
      source: 'self_agent_distillation',
      reference: input.selfAgentConstitution.headline,
      insight: [
        ...input.selfAgentConstitution.delegableTasks.slice(0, 2),
        ...input.selfAgentConstitution.mustAskUserTasks.slice(0, 1),
      ].join('｜'),
    });
  }

  return unique(
    traces.map(trace => JSON.stringify(trace)),
    18,
  ).map(trace => JSON.parse(trace) as OpenBasakaEvidenceTrace);
}

function traitSignalScore(typologies: string[], positive: string[], negative: string[], base: number): number {
  const positiveHits = typologies.reduce((sum, typology) => (
    sum + (positive.some(keyword => typology.includes(keyword)) ? 1 : 0)
  ), 0);
  const negativeHits = typologies.reduce((sum, typology) => (
    sum + (negative.some(keyword => typology.includes(keyword)) ? 1 : 0)
  ), 0);
  return clamp(base + positiveHits * 14 - negativeHits * 12);
}

function inferSignals(input: OpenBasakaExportInput) {
  const typologies = collectDominantTypologies(input);
  const creatorInsight = input.sageInsights.find(insight => insight.sageId === 'creator');
  const hasCreatorSignal = Boolean(creatorInsight && 'aestheticProfile' in creatorInsight);
  const humanMapWeights = normalizeHumanMapWeights(input);
  const latestMatrix = input.matrixResults?.[0];
  const matrixAccuracyBoost = latestMatrix ? (latestMatrix.accuracy - 0.5) * 18 : 0;
  const matrixWeightedBoost = latestMatrix ? (latestMatrix.difficultyWeightedScore - 45) * 0.18 : 0;

  return {
    riskTolerance: clamp(traitSignalScore(
      typologies,
      ['新奇追猎者', '即时弹回型', '自信攻坚型', '直觉信赖型'],
      ['稳定偏好者', '谨慎评估型', '缓慢修复型', '二次审视型'],
      52,
    ) +
      humanMapSignalScore(input, 'career_execution') * 10 +
      humanMapSignalScore(input, 'creativity_expression') * 6 -
      humanMapSignalScore(input, 'emotion_healing') * 8),
    innovationBias: clamp(traitSignalScore(
      typologies,
      ['新奇追猎者', '深度沉浸者', '直觉驱动型', '双通道切换型'],
      ['稳定偏好者', '效率导向者'],
      58,
    ) +
      humanMapSignalScore(input, 'creativity_expression') * 8 +
      humanMapSignalScore(input, 'cognition_learning') * 5 +
      Math.max(0, matrixAccuracyBoost * 0.4)),
    socialEnergy: clamp(traitSignalScore(
      typologies,
      ['社交充能型'],
      ['独处充能型'],
      typologies.some(item => item.includes('选择性社交型')) ? 48 : 50,
    ) +
      humanMapSignalScore(input, 'relationship_pattern') * 5 +
      keywordScore(collectHumanMapText(input), ['连接', '关系', '合作', '团队']) * 3 -
      keywordScore(collectHumanMapText(input), ['独处', '安静', '边界']) * 3),
    executionDiscipline: clamp(traitSignalScore(
      typologies,
      ['结构依赖型', '内在约束型', '即时弹回型', '高自我监控者'],
      ['弹性调度型', '行动先于反思型'],
      55,
    ) +
      (humanMapWeights.motivation || 0) * 0.08 +
      humanMapSignalScore(input, 'career_execution') * 8 -
      humanMapSignalScore(input, 'emotion_healing') * 3),
    emotionalSensitivity: clamp(traitSignalScore(
      typologies,
      ['高敏感觉察者', '微表情猎手', '情绪透明型'],
      ['情绪锚定型'],
      50,
    ) +
      (humanMapWeights.emotion || 0) * 0.12 +
      humanMapSignalScore(input, 'emotion_healing') * 12 +
      humanMapSignalScore(input, 'relationship_pattern') * 6),
    aestheticSensitivity: clamp((hasCreatorSignal ? 68 : 54) + input.productConcepts.length * 4 + (humanMapWeights.aesthetic || 0) * 0.16 + humanMapSignalScore(input, 'creativity_expression') * 12),
    curiosityBreadth: clamp(traitSignalScore(
      typologies,
      ['新奇追猎者', '深度沉浸者'],
      ['稳定偏好者'],
      57,
    ) +
      (humanMapWeights.cognitive || 0) * 0.14 +
      humanMapSignalScore(input, 'cognition_learning') * 10 +
      humanMapSignalScore(input, 'identity_meaning') * 5 +
      matrixAccuracyBoost +
      matrixWeightedBoost),
    worldviewDrive: clamp(
      52 +
      (input.personalOS?.upgradeRoadmap.length || 0) * 4 +
      (input.personalOS?.worldviewAnchor ? 12 : 0) +
      (input.topology.crossReactions.length > 0 ? 6 : 0) +
      (humanMapWeights.worldview || 0) * 0.12 +
      humanMapSignalScore(input, 'identity_meaning') * 12
    ),
  };
}

function buildPromptSummary(core: Omit<OpenBasakaBossCore, 'promptSummary' | 'evidenceTrace'>): string {
  const segments = [
    `画像原型是「${core.headline}」`,
    core.currentFocus ? `当前更适合围绕「${truncate(core.currentFocus, 36)}」推进` : '',
    core.longTermVision ? `长期方向是「${truncate(core.longTermVision, 44)}」` : '',
    core.excitementTriggers.length > 0 ? `容易被 ${core.excitementTriggers.slice(0, 3).join('、')} 激活` : '',
    core.antiPatterns.length > 0 ? `需要尽量避免 ${core.antiPatterns.slice(0, 2).join('、')}` : '',
    core.recommendedResearchTopics.length > 0 ? `优先研究 ${core.recommendedResearchTopics.slice(0, 3).join('、')}` : '',
  ].filter(Boolean);

  return segments.join('；');
}

export function buildOpenBasakaExportBundle(input: OpenBasakaExportInput): OpenBasakaExportBundle {
  const preferredStyle = inferPreferredStyle(input);
  const decisionSpeed = inferDecisionSpeed(input);
  const resourceStyle = inferResourceStyle(input);
  const currentFocus = inferCurrentFocus(input);
  const longTermVision = inferLongTermVision(input);
  const mission = inferMission(input);
  const explanationPreferences = inferExplanationPreferences(preferredStyle, input);
  const excitementTriggers = inferExcitementTriggers(input);
  const antiPatterns = inferAntiPatterns(input);
  const integrationGoals = inferIntegrationGoals(input);
  const recommendedAgents = inferRecommendedAgents(preferredStyle, input);
  const recommendedResearchTopics = inferRecommendedResearchTopics(input);
  const signals = inferSignals(input);
  const evidenceTrace = buildEvidenceTrace(input);

  const baseBossCore: Omit<OpenBasakaBossCore, 'promptSummary' | 'evidenceTrace'> = {
    headline: input.topology.selfArchetype,
    currentFocus,
    longTermVision,
    mission,
    preferredStyle,
    resourceStyle,
    decisionSpeed,
    riskTolerance: signals.riskTolerance,
    innovationBias: signals.innovationBias,
    socialEnergy: signals.socialEnergy,
    executionDiscipline: signals.executionDiscipline,
    emotionalSensitivity: signals.emotionalSensitivity,
    aestheticSensitivity: signals.aestheticSensitivity,
    curiosityBreadth: signals.curiosityBreadth,
    worldviewDrive: signals.worldviewDrive,
    explanationPreferences,
    excitementTriggers,
    antiPatterns,
    integrationGoals,
    recommendedAgents,
    recommendedResearchTopics,
  };

  const bossCore: OpenBasakaBossCore = {
    ...baseBossCore,
    promptSummary: buildPromptSummary(baseBossCore),
    evidenceTrace,
  };

  return {
    schemaVersion: 'openbasaka-export-v1',
    sourceSystem: 'multi-dimension-profiling',
    exportedAt: new Date().toISOString(),
    rawSignalBundle: {
      completedDimensions: input.completedDimensions,
      avgCompleted: input.avgCompleted,
      answers: input.answers,
      avgChoices: input.avgChoices,
      avgProfile: input.avgProfile,
      gameResults: input.gameResults,
      matrixResults: input.matrixResults || [],
      catResponses: input.catResponses,
      sageSessions: input.sageSessions,
      selfAgentConstitution: input.selfAgentConstitution || null,
      humanMapBlueprint: input.humanMapBlueprint || null,
      questionPresentationSnapshots: input.questionPresentationSnapshots || [],
    },
    fusedProfileBundle: {
      topology: input.topology,
      sageInsights: input.sageInsights,
      personalOS: input.personalOS,
      productJobs: input.productJobs,
      productConcepts: input.productConcepts,
      implementationPlans: input.implementationPlans,
      selfAgentConstitution: input.selfAgentConstitution || null,
      aiSummary: input.aiSummary || '',
    },
    openbasakaBundle: {
      bossCore,
    },
  };
}

export function downloadOpenBasakaExportBundle(bundle: OpenBasakaExportBundle): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `openbasaka-export-${bundle.exportedAt.slice(0, 10)}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
