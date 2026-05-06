import type {
  MatrixSessionResult,
  PersonalOS,
  SageInsight,
  SelfAgentConstitution,
  TopologyProfile,
} from '../types';

function unique(values: Array<string | undefined | null>, limit = 10): string[] {
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

function topDimensionLines(topology: TopologyProfile): string[] {
  return Object.values(topology.dimensionTopologies)
    .map((dimension) => {
      const traits = dimension.dominantTraits
        .filter(trait => trait.typology !== '待识别')
        .slice(0, 2)
        .map(trait => `${trait.subDimensionName}:${trait.typology}`)
        .join(' / ');
      return traits ? `${dimension.name} -> ${traits}` : '';
    })
    .filter(Boolean)
    .slice(0, 6);
}

function sageInsightLine(insight: SageInsight): string {
  switch (insight.sageId) {
    case 'scientist':
      return `scientist: ${insight.cognitiveWorkflow.decisionStyle} / ${insight.cognitiveWorkflow.learningStyle}`;
    case 'philosopher':
      return `philosopher: ${insight.worldviewModel.coreValues.join('、')}`;
    case 'analyst':
      return `analyst: ${insight.conflictMap.currentFocus}`;
    case 'relationalist':
      return `relationalist: ${insight.relationshipPattern.attachmentSummary}`;
    case 'creator':
      return `creator: ${insight.aestheticProfile.aestheticManifesto}`;
    case 'system_builder':
      return `system_builder: ${insight.upgradePlan.themes.map(theme => theme.name).join('、')}`;
    case 'product_sage':
      return `product_sage: ${insight.productConcepts.map(concept => concept.workingTitle).join('、') || '待解锁产品化证据'}`;
  }
}

export function buildSelfAgentConstitutionFromSandbox(input: {
  topology: TopologyProfile;
  matrixResults?: MatrixSessionResult[];
  sageInsights?: SageInsight[];
  personalOS?: PersonalOS | null;
}): SelfAgentConstitution {
  const latestMatrix = input.matrixResults?.[0];
  const confidencePairs = Object.entries(input.topology.confidenceMap || {})
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([dimension, confidence]) => `${dimension}:${Math.round(confidence * 100)}%`);

  const evidenceLedger = unique([
    ...topDimensionLines(input.topology),
    latestMatrix ? `matrix_reasoning: ${latestMatrix.rawScore}/${latestMatrix.maxScore}, weighted ${latestMatrix.difficultyWeightedScore}, CI ${latestMatrix.confidenceInterval.join('-')}` : '',
    ...(input.sageInsights || []).map(sageInsightLine),
    input.personalOS ? `personal_os: ${input.personalOS.cognitiveModel}` : '',
  ], 10);

  return {
    id: `self-agent-sandbox-${input.topology.id}`,
    generatedAt: new Date().toISOString(),
    sourceRunId: input.topology.id,
    headline: `未来代理人宪法：${input.topology.selfArchetype}`,
    cognitiveOperatingManual: unique([
      input.topology.narrativeIdentity,
      latestMatrix ? '处理抽象问题时先识别显性规则，再检查隐藏约束和反例。' : '',
      input.personalOS?.cognitiveModel,
      '回答必须区分已验证证据、画像推断和待验证假设。',
    ], 8),
    expressionDNA: unique([
      '先给结论，再给证据链和置信边界。',
      '用结构化清单承载复杂判断，用具体例子降低理解成本。',
      input.personalOS?.aestheticBaseline,
    ], 8),
    decisionBoundaries: [
      '低风险学习、创作、产品推演可以直接给草案。',
      '中风险方向必须给备选方案、成本和回滚条件。',
      '高风险或不可逆事项只能辅助分析，不能代替 Boss 决定。',
    ],
    authorizationBoundaries: [
      '默认权限：整理、归纳、生成草案、提出问题、设计低风险实验。',
      '需要确认：公开发布、付款、删除、承诺、改变长期策略。',
      '证据不足时必须先询问，不得用画像填补事实空白。',
    ],
    forbiddenZones: [
      '不得把画像解释为医学诊断、招聘筛选、正式 IQ 或资质认证。',
      '不得把原创矩阵短测解释为 Raven APM 分数。',
      '不得在没有来源证据时声称了解 Boss 的稳定特质。',
    ],
    evidenceLedger,
    delegableTasks: [
      '整理知识材料并提炼为可执行计划。',
      '根据画像偏好改写报告、提示词和任务拆解。',
      '为低风险学习、创作、产品方向设计实验。',
      '持续追踪待验证画像假设并提醒复盘。',
    ],
    mustAskUserTasks: [
      '医学、法律、财务、亲密关系、职业重大转向。',
      '任何需要代表 Boss 发出外部承诺的行为。',
      '画像证据冲突、置信度低、或当前状态明显波动时。',
    ],
    calibrationQuestions: unique([
      `「${input.topology.selfArchetype}」这个原型哪里最不像你？`,
      input.topology.pendingVerification[0],
      '哪些事情你愿意交给未来代理人，哪些必须由你本人决定？',
      '最近一周的真实行为是否支持这份画像？',
    ], 6),
    measurementBoundaries: unique([
      ...input.topology.pendingVerification,
      ...(latestMatrix?.pendingVerification || []),
      '当前画像是自我理解与代理人建模工具，不是临床、招聘或认证测评。',
      `当前高置信维度：${confidencePairs.join(' / ') || '暂无'}`,
    ], 8),
  };
}
