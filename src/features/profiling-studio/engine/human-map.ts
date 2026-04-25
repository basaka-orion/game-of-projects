import { getHumanMapQuestions } from '../data/human-map';
import { HUMAN_MAP_SIGNAL_LABELS } from '../data/human-map';
import { DIMENSIONS, DIMENSION_MAP } from '../data/dimensions';
import { allModules } from '../data/questions';
import type {
  HumanMapBlueprint,
  HumanMapMode,
  HumanMapQuestionDef,
  HumanMapSignalId,
  HumanMapSignalScore,
  PersonalizedDimensionPlan,
} from '../types';

const MODULE_LOOKUP = Object.fromEntries(allModules.map((module) => [module.id, module]));
const DEFAULT_DIMENSION_WEIGHT = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension.id, 36]));

const SIGNAL_KEYWORDS: Record<
  HumanMapSignalId,
  {
    keywords: string[];
    questionIds: string[];
    dimensionBoosts: Partial<Record<string, number>>;
  }
> = {
  identity_meaning: {
    keywords: ['意义', '方向', '身份', '人生', '迷茫', '价值', '信念', '成为', '未来'],
    questionIds: ['life_stage', 'ideal_state', 'values_tradeoffs', 'future_boundary'],
    dimensionBoosts: { worldview: 20, motivation: 14, personality: 8, strengths: 6 },
  },
  career_execution: {
    keywords: ['执行', '工作', '职业', '项目', '赚钱', '创业', '拖延', '目标', '效率', '节奏'],
    questionIds: ['current_issues', 'ideal_state', 'learning_pattern', 'motivation_drive', 'shadow_loop'],
    dimensionBoosts: { motivation: 20, personality: 14, cognitive: 12, strengths: 10 },
  },
  emotion_healing: {
    keywords: ['焦虑', '情绪', '心累', '压抑', '失控', '羞耻', '修复', '疗愈', '崩', '内耗'],
    questionIds: ['key_events', 'energy_environment', 'emotional_triggers', 'shadow_loop'],
    dimensionBoosts: { emotion: 22, personality: 14, social: 8, worldview: 6 },
  },
  relationship_pattern: {
    keywords: ['关系', '亲密', '边界', '信任', '沟通', '冲突', '被误解', '被抛弃', '家庭', '伴侣'],
    questionIds: ['key_events', 'current_issues', 'emotional_triggers', 'relationship_pattern', 'future_boundary'],
    dimensionBoosts: { social: 22, emotion: 14, personality: 10, worldview: 4 },
  },
  creativity_expression: {
    keywords: ['创造', '表达', '审美', '设计', '写作', '灵感', '作品', '创作', '美感', '内容'],
    questionIds: ['ideal_state', 'energy_environment', 'motivation_drive', 'talents_strengths', 'future_boundary'],
    dimensionBoosts: { aesthetic: 22, strengths: 14, cognitive: 10, worldview: 6 },
  },
  cognition_learning: {
    keywords: ['学习', '思考', '逻辑', '结构', '专注', '分析', '理解', '模型', '认知', '洞察'],
    questionIds: ['current_issues', 'learning_pattern', 'talents_strengths'],
    dimensionBoosts: { cognitive: 22, strengths: 10, motivation: 8, personality: 4 },
  },
};

const DIMENSION_CORE_QUESTIONS: Record<string, string[]> = {
  cognitive: ['cog5', 'cog8', 'cog9b', 'ct_1'],
  personality: ['per5', 'per9', 'per12', 'per13'],
  emotion: ['emo1', 'emo4', 'emo6', 'emo8'],
  motivation: ['val1', 'val2', 'val5', 'val6'],
  social: ['soc1', 'soc3', 'soc5', 'soc8'],
  aesthetic: ['aes1', 'aes3', 'aes5', 'aes7'],
  worldview: ['wv1', 'wv3', 'wv6', 'wv8'],
  strengths: ['str_cur_1', 'str_per_1', 'str_sr_1', 'str_hope_1'],
};

const SIGNAL_QUESTION_PACKS: Partial<Record<HumanMapSignalId, Partial<Record<string, string[]>>>> = {
  identity_meaning: {
    worldview: ['wv1', 'wv3', 'wv6', 'wv8'],
    motivation: ['val1', 'val1b', 'val5', 'val7c'],
    personality: ['per12', 'per13', 'per4'],
    strengths: ['str_hope_1', 'str_cur_3'],
  },
  career_execution: {
    cognitive: ['cog8', 'cog9', 'cog9b', 'ct_2'],
    motivation: ['val2', 'val5', 'val6', 'val6c'],
    personality: ['per5', 'per12c', 'per13c'],
    strengths: ['str_per_1', 'str_sr_1', 'str_pru_1'],
  },
  emotion_healing: {
    emotion: ['emo1', 'emo4', 'emo5', 'emo8'],
    personality: ['per9', 'per10', 'per12'],
    social: ['soc1', 'soc2', 'soc8'],
    strengths: ['str_sr_2', 'str_hope_1'],
  },
  relationship_pattern: {
    social: ['soc1', 'soc3', 'soc5', 'soc8'],
    emotion: ['emo3', 'emo6', 'emo7'],
    personality: ['per7', 'per8', 'per8b'],
  },
  creativity_expression: {
    aesthetic: ['aes1', 'aes3', 'aes5', 'aes7'],
    cognitive: ['cog5', 'cog6', 'cog7'],
    strengths: ['str_cre_1', 'str_cur_1', 'str_hope_1'],
    worldview: ['wv3', 'wv6'],
  },
  cognition_learning: {
    cognitive: ['cog3', 'cog1', 'cog8', 'ct_1'],
    strengths: ['str_cur_1', 'str_pru_1'],
    personality: ['per4', 'per13'],
    motivation: ['val6', 'val6b'],
  },
};

function cleanText(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function shorten(value: string | undefined, max = 38): string {
  const text = cleanText(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function ensureQuestionIds(dimensionId: string, questionIds: string[]): string[] {
  const module = MODULE_LOOKUP[dimensionId];
  if (!module) return [];
  const available = new Set(module.questions.map((question) => question.id));
  return questionIds.filter((questionId) => available.has(questionId));
}

function uniqueOrdered(ids: string[]): string[] {
  return [...new Set(ids)];
}

function uniqueQuestions(questions: HumanMapQuestionDef[]): HumanMapQuestionDef[] {
  const seen = new Set<string>();
  return questions.filter((question) => {
    if (seen.has(question.id)) return false;
    seen.add(question.id);
    return true;
  });
}

function textCoverageScore(text: string): number {
  if (!text) return 0;
  if (text.length < 20) return 0.65;
  if (text.length < 60) return 1;
  return 1.25;
}

function buildSignalScores(
  answers: Record<string, string>,
  mode: Exclude<HumanMapMode, 'skip'>,
  adaptiveQuestions: HumanMapQuestionDef[] = [],
): HumanMapSignalScore[] {
  const joined = Object.values(answers).map(cleanText).join(' ');
  const questions = getHumanMapQuestions(mode);

  const signalScores = Object.entries(SIGNAL_KEYWORDS).map(([signalId, meta]) => {
    let score = 0;
    const evidence = new Set<string>();

    for (const keyword of meta.keywords) {
      if (joined.includes(keyword)) {
        score += joined.split(keyword).length - 1;
        evidence.add(keyword);
      }
    }

    for (const questionId of meta.questionIds) {
      const answer = cleanText(answers[questionId]);
      if (!answer) continue;
      score += 1.2 * textCoverageScore(answer);
      const question = questions.find((item) => item.id === questionId);
      if (question) evidence.add(question.title);
    }

    return {
      id: signalId as HumanMapSignalId,
      label: HUMAN_MAP_SIGNAL_LABELS[signalId as HumanMapSignalId],
      score,
      evidence: [...evidence].slice(0, 4),
    };
  });

  for (const question of adaptiveQuestions) {
    const answer = cleanText(answers[question.id]);
    if (!answer || !question.signalHints?.length) continue;
    const contribution = 1.3 * textCoverageScore(answer);
    for (const signalId of question.signalHints) {
      const target = signalScores.find((signal) => signal.id === signalId);
      if (!target) continue;
      target.score += contribution;
      if (!target.evidence.includes(question.title)) {
        target.evidence = [...target.evidence, question.title].slice(0, 4);
      }
    }
  }

  const hasAnyScore = signalScores.some((signal) => signal.score > 0);
  if (!hasAnyScore) {
    return [
      {
        id: 'identity_meaning',
        label: HUMAN_MAP_SIGNAL_LABELS.identity_meaning,
        score: 2,
        evidence: ['基础建模'],
      },
      {
        id: 'career_execution',
        label: HUMAN_MAP_SIGNAL_LABELS.career_execution,
        score: 1.6,
        evidence: ['默认路由'],
      },
    ];
  }

  return signalScores.sort((left, right) => right.score - left.score);
}

function isShortAnswer(text: string): boolean {
  return cleanText(text).length > 0 && cleanText(text).length < 18;
}

function containsAmbivalence(text: string): boolean {
  return /(不知道|不确定|也许|可能|看情况|说不清|摇摆|纠结|都想|都要|一半|有时候)/.test(cleanText(text));
}

function mentionsAny(text: string, keywords: string[]): boolean {
  const normalized = cleanText(text);
  return keywords.some((keyword) => normalized.includes(keyword));
}

export function buildHumanMapClarifiers(
  mode: Exclude<HumanMapMode, 'skip'>,
  answers: Record<string, string>,
): HumanMapQuestionDef[] {
  const clarifiers: HumanMapQuestionDef[] = [];
  const signalScores = buildSignalScores(answers, mode);
  const signalIds = signalScores.filter((signal) => signal.score > 0).map((signal) => signal.id);
  const currentIssues = cleanText(answers.current_issues);
  const valuesTradeoffs = cleanText(answers.values_tradeoffs);
  const emotionalTriggers = cleanText(answers.emotional_triggers);
  const shadowLoop = cleanText(answers.shadow_loop);
  const relationshipPattern = cleanText(answers.relationship_pattern);
  const learningPattern = cleanText(answers.learning_pattern);
  const talentsStrengths = cleanText(answers.talents_strengths);
  const lifeStage = cleanText(answers.life_stage);

  if (
    containsAmbivalence(currentIssues) ||
    containsAmbivalence(valuesTradeoffs) ||
    isShortAnswer(currentIssues)
  ) {
    clarifiers.push({
      id: 'clarifier_tradeoff_90d',
      section: '系统追问 · 取舍校准',
      title: '如果未来 90 天只能先救一件事，你会先救什么？',
      prompt: '只能选一个优先目标：情绪稳定、关系修复、赚钱/工作推进、自我方向清晰、创作表达恢复。请写你会先救哪个，以及为什么。',
      helper: '这题专门用来打破“都重要”的模糊区，让系统知道你真正的第一优先级。',
      placeholder: '例如：我会先救工作推进。因为只要节奏回来，我的自信和情绪都会跟着恢复；如果继续失速，我会越来越内耗。',
      examples: ['情绪稳定', '工作推进', '关系修复', '方向清晰', '创作恢复'],
      isClarifier: true,
      dimensionBias: { motivation: 16, worldview: 12, personality: 8 },
      signalHints: ['career_execution', 'identity_meaning'],
    });
  }

  if (
    mentionsAny(`${emotionalTriggers} ${shadowLoop}`, ['焦虑', '崩', '内耗', '失控', '羞耻', '心累']) ||
    isShortAnswer(emotionalTriggers) ||
    signalIds.includes('emotion_healing')
  ) {
    clarifiers.push({
      id: 'clarifier_pressure_loss',
      section: '系统追问 · 压力反应',
      title: '压力最大的时候，你最先失去的到底是什么？',
      prompt: '请在“耐心、判断力、行动力、情绪稳定、社交能力、自信、专注”里选 1-2 个最先掉线的，并举一个最近的例子。',
      helper: '很多人会说“我都失去”，但系统更想知道最先断掉的是哪根线。',
      placeholder: '例如：我最先失去的是专注和耐心。最近一次被连续催促时，我明明知道要处理什么，却不断切任务，最后整个人变得非常烦躁。',
      examples: ['耐心', '判断力', '行动力', '情绪稳定', '专注'],
      isClarifier: true,
      dimensionBias: { emotion: 18, personality: 12, social: 6 },
      signalHints: ['emotion_healing'],
    });
  }

  if (
    mentionsAny(`${currentIssues} ${relationshipPattern}`, ['关系', '边界', '信任', '伴侣', '家庭', '误解', '抛弃']) ||
    isShortAnswer(relationshipPattern) ||
    signalIds.includes('relationship_pattern')
  ) {
    clarifiers.push({
      id: 'clarifier_relationship_conflict',
      section: '系统追问 · 关系场景',
      title: '当你在关系里受伤时，你更常见的动作是什么？',
      prompt: '请在“追问解释、冷处理、讨好维稳、讲理澄清、直接退场、突然爆发”里选最像你的 1-2 个，并写一个具体场景。',
      helper: '这题不是问你觉得哪种成熟，而是问你受伤时最自然的动作。',
      placeholder: '例如：我更像讲理澄清 + 退场。先想把事情讲明白，但如果感到继续说也不会被理解，就会迅速抽离。',
      examples: ['追问解释', '冷处理', '讨好维稳', '讲理澄清', '直接退场', '突然爆发'],
      isClarifier: true,
      dimensionBias: { social: 18, emotion: 12, personality: 8 },
      signalHints: ['relationship_pattern'],
    });
  }

  if (
    mentionsAny(`${learningPattern} ${talentsStrengths}`, ['学习', '结构', '逻辑', '系统', '理解', '表达', '分析']) ||
    isShortAnswer(learningPattern) ||
    signalIds.includes('cognition_learning')
  ) {
    clarifiers.push({
      id: 'clarifier_learning_edge',
      section: '系统追问 · 认知边界',
      title: '哪类问题你会越做越兴奋，哪类问题你会很快掉电？',
      prompt: '请各写一类，并说明“兴奋/掉电”最主要是因为它们的什么特征。',
      helper: '这题会直接影响系统给你推更多结构题、关系题、执行题还是创造题。',
      placeholder: '例如：系统设计类问题会让我越做越兴奋，因为能不断看到底层模式；高频协调和琐碎重复会让我很快掉电，因为没有足够的思考空间。',
      examples: ['系统设计', '人际判断', '执行推进', '创意表达', '琐碎协调'],
      isClarifier: true,
      dimensionBias: { cognitive: 18, strengths: 10, aesthetic: 6, motivation: 4 },
      signalHints: ['cognition_learning', 'creativity_expression'],
    });
  }

  if (
    containsAmbivalence(lifeStage) ||
    mentionsAny(lifeStage, ['转型', '迷茫', '修复', '重建']) ||
    signalIds.includes('identity_meaning')
  ) {
    clarifiers.push({
      id: 'clarifier_identity_transition',
      section: '系统追问 · 身份切换',
      title: '你觉得现在最该离开的旧自己，和最想长出来的新自己，分别是什么？',
      prompt: '请分别写一句“我要离开的旧模式”和“我要长出来的新模式”。',
      helper: '这题会让系统更清楚你现在是修复旧结构，还是要建新结构。',
      placeholder: '例如：我要离开的旧模式是只靠情绪和短期爆发推进；我想长出来的新模式是稳定、自主、能持续产出的自己。',
      examples: ['旧模式', '新模式', '想放下什么', '想长出什么'],
      isClarifier: true,
      dimensionBias: { worldview: 16, motivation: 12, strengths: 8 },
      signalHints: ['identity_meaning'],
    });
  }

  return clarifiers.slice(0, 3);
}

export function getHumanMapQuestionFlow(
  mode: Exclude<HumanMapMode, 'skip'>,
  answers: Record<string, string>,
  adaptiveQuestions: HumanMapQuestionDef[] = [],
): HumanMapQuestionDef[] {
  return uniqueQuestions([
    ...getHumanMapQuestions(mode),
    ...buildHumanMapClarifiers(mode, answers),
    ...adaptiveQuestions,
  ]);
}

function inferDisplayName(answers: Record<string, string>): string {
  const raw = cleanText(answers.preferred_name);
  if (!raw) return '你';
  const first = raw.split(/[，。,；;\/\n]/)[0]?.trim();
  return first || '你';
}

function inferLifeStage(answers: Record<string, string>): string {
  return shorten(answers.life_stage, 30) || '当前探索期';
}

function inferCurrentFocus(answers: Record<string, string>): string {
  return shorten(answers.current_issues, 40) || shorten(answers.ideal_state, 40) || '更清晰地理解自己';
}

function buildSourceDigest(
  answers: Record<string, string>,
  adaptiveQuestions: HumanMapQuestionDef[] = [],
): string[] {
  return [
    'current_issues',
    'shadow_loop',
    'relationship_pattern',
    'motivation_drive',
    'future_boundary',
    ...adaptiveQuestions.slice(0, 2).map((question) => question.id),
  ]
    .map((questionId) => cleanText(answers[questionId]))
    .filter(Boolean)
    .slice(0, 4)
    .map((item) => shorten(item, 60));
}

function applyQuestionBiases(
  questions: HumanMapQuestionDef[],
  answers: Record<string, string>,
  weights: Record<string, number>,
): void {
  for (const question of questions) {
    const answer = cleanText(answers[question.id]);
    if (!answer || !question.dimensionBias) continue;
    const multiplier = textCoverageScore(answer);
    for (const [dimensionId, boost] of Object.entries(question.dimensionBias)) {
      weights[dimensionId] = (weights[dimensionId] || 0) + (boost || 0) * multiplier;
    }
  }
}

function applySignalBoosts(
  signalScores: HumanMapSignalScore[],
  weights: Record<string, number>,
): void {
  for (const signal of signalScores) {
    if (signal.score <= 0) continue;
    const meta = SIGNAL_KEYWORDS[signal.id];
    const intensity = Math.min(2.4, 0.6 + signal.score * 0.18);
    for (const [dimensionId, boost] of Object.entries(meta.dimensionBoosts)) {
      weights[dimensionId] = (weights[dimensionId] || 0) + (boost || 0) * intensity;
    }
  }
}

function buildDimensionPlan(
  dimensionId: string,
  mode: Exclude<HumanMapMode, 'skip'>,
  displayName: string,
  lifeStage: string,
  currentFocus: string,
  dimensionWeights: Record<string, number>,
  signalScores: HumanMapSignalScore[],
): PersonalizedDimensionPlan {
  const module = MODULE_LOOKUP[dimensionId];
  const matchedSignals = signalScores
    .filter((signal) => SIGNAL_QUESTION_PACKS[signal.id]?.[dimensionId]?.length)
    .slice(0, 2);

  const seededIds = [
    ...(DIMENSION_CORE_QUESTIONS[dimensionId] || []),
    ...matchedSignals.flatMap((signal) => SIGNAL_QUESTION_PACKS[signal.id]?.[dimensionId] || []),
  ];

  const safeIds = ensureQuestionIds(dimensionId, uniqueOrdered(seededIds));
  const orderedByModule = module
    ? module.questions.map((question) => question.id).filter((questionId) => safeIds.includes(questionId))
    : safeIds;

  const targetCount = mode === 'detailed'
    ? dimensionWeights[dimensionId] > 95 ? 7 : 6
    : dimensionWeights[dimensionId] > 85 ? 5 : 4;

  const selectedIds = [...orderedByModule];
  if (module) {
    for (const question of module.questions) {
      if (selectedIds.length >= targetCount) break;
      if (!selectedIds.includes(question.id)) selectedIds.push(question.id);
    }
  }

  const focusSignals = matchedSignals.map((signal) => signal.id);
  const signalLabelText = matchedSignals.map((signal) => signal.label).join('、');
  const reason = signalLabelText
    ? `你前置建模里反复出现了「${signalLabelText}」，所以这一组题会优先确认 ${DIMENSION_MAP[dimensionId]?.name || dimensionId} 的真实模式。`
    : `${DIMENSION_MAP[dimensionId]?.name || dimensionId} 是你的基础校准维度，系统会先用一小组题目判断你更接近哪种底层结构。`;

  return {
    dimensionId,
    questionIds: selectedIds.slice(0, targetCount),
    reason,
    focusSignals,
    immersivePrompt: `${displayName === '你' ? '' : `${displayName}，`}请代入“${lifeStage}、正在处理${currentFocus}”的自己来回答。`,
    priority: Math.round(dimensionWeights[dimensionId] || 0),
  };
}

export function getHumanMapProgress(
  mode: Exclude<HumanMapMode, 'skip'>,
  answers: Record<string, string>,
  adaptiveQuestions: HumanMapQuestionDef[] = [],
): { answered: number; total: number } {
  const questions = getHumanMapQuestionFlow(mode, answers, adaptiveQuestions);
  const answered = questions.filter((question) => cleanText(answers[question.id])).length;
  return { answered, total: questions.length };
}

export function buildHumanMapBlueprint(
  mode: Exclude<HumanMapMode, 'skip'>,
  answers: Record<string, string>,
  adaptiveQuestions: HumanMapQuestionDef[] = [],
): HumanMapBlueprint {
  const signalScores = buildSignalScores(answers, mode, adaptiveQuestions);
  const displayName = inferDisplayName(answers);
  const lifeStage = inferLifeStage(answers);
  const currentFocus = inferCurrentFocus(answers);
  const dimensionWeights = { ...DEFAULT_DIMENSION_WEIGHT };

  applyQuestionBiases(getHumanMapQuestions(mode), answers, dimensionWeights);
  applyQuestionBiases(buildHumanMapClarifiers(mode, answers), answers, dimensionWeights);
  applyQuestionBiases(adaptiveQuestions, answers, dimensionWeights);
  applySignalBoosts(signalScores, dimensionWeights);

  const recommendedDimensions = [...DIMENSIONS]
    .sort((left, right) => (dimensionWeights[right.id] || 0) - (dimensionWeights[left.id] || 0))
    .map((dimension) => dimension.id);

  const dimensionPlans = recommendedDimensions.map((dimensionId) =>
    buildDimensionPlan(
      dimensionId,
      mode,
      displayName,
      lifeStage,
      currentFocus,
      dimensionWeights,
      signalScores,
    )
  );

  const topSignals = signalScores.slice(0, 3).map((signal) => signal.label).join('、');
  const topDimensions = recommendedDimensions
    .slice(0, 3)
    .map((dimensionId) => DIMENSION_MAP[dimensionId]?.name || dimensionId)
    .join(' / ');
  const { answered, total } = getHumanMapProgress(mode, answers, adaptiveQuestions);

  return {
    mode,
    displayName,
    lifeStage,
    currentFocus,
    summary: `你当前像是处在「${lifeStage}」的人，主线问题聚焦在“${currentFocus}”。系统会优先从 ${topDimensions} 切入，并在 ${topSignals || '基础维度'} 上多问几题。`,
    immersivePrompt: `${displayName === '你' ? '' : `${displayName}，`}后续题目都请优先代入最近 30 天最真实、最常出现的你，而不是理想中的你。`,
    answerCount: answered,
    signalScores,
    dimensionWeights,
    recommendedDimensions,
    dimensionPlans,
    sourceDigest: buildSourceDigest(answers, adaptiveQuestions),
    completedAt: new Date().toISOString(),
  };
}
