import type { DimensionModule, DimensionScore, Report, CrossDimensionTension } from '../types';
import { DIMENSION_NAMES } from '../data/dimensions';
import type { AVGNode } from '../types';

// ── Likert Scoring (with sub-dimension breakdown) ──
export function scoreLikert(
  answers: Record<string, number>,
  questions: DimensionModule['questions']
): { overall: number; subScores: Record<string, number> } {
  const subs: Record<string, { total: number; count: number }> = {};
  const overall = { total: 0, count: 0 };

  questions.forEach((q) => {
    if (answers[q.id] == null) return;
    let val = Number(answers[q.id]);
    if (q.reverse) val = 6 - val;
    overall.total += val;
    overall.count += 1;
    const sub = q.subDimension || q.dimension;
    if (!subs[sub]) subs[sub] = { total: 0, count: 0 };
    subs[sub].total += val;
    subs[sub].count += 1;
  });

  const subScores: Record<string, number> = {};
  for (const s in subs) {
    subScores[s] = Math.round((subs[s].total / subs[s].count / 5) * 100);
  }

  return {
    overall: overall.count > 0 ? Math.round((overall.total / overall.count / 5) * 100) : 50,
    subScores,
  };
}

// ── Correct Choice Scoring ──
export function scoreCorrectChoice(
  answers: Record<string, string | number>,
  questions: DimensionModule['questions']
): number {
  let correct = 0;
  let total = 0;
  questions.forEach((q) => {
    if (q.correct && answers[q.id] != null) {
      total++;
      if (String(answers[q.id]) === String(q.correct)) correct++;
    }
  });
  return total > 0 ? Math.round((correct / total) * 100) : 50;
}

// ── Single/SJT/Portrait/Slider Average Scoring ──
export function scoreSingleAverage(
  answers: Record<string, string | number>,
  questions: DimensionModule['questions']
): { overall: number; subScores: Record<string, number> } {
  const subs: Record<string, { total: number; count: number; max: number }> = {};
  const overall = { total: 0, count: 0 };

  questions.forEach((q) => {
    if (answers[q.id] == null) return;
    const val = Number(answers[q.id]);
    if (isNaN(val)) return;

    // Detect if this is a slider answer (0-100) or option answer (1-4/5)
    const isSliderAnswer = (q.type === 'sjt' || q.type === 'dynamic_slider' || q.type === 'portrait')
      && val >= 0 && val <= 100
      && (!q.options || val > Math.max(...q.options.map(o => Number(o.value)).filter(v => !isNaN(v))));

    let normalizedVal: number;
    if (isSliderAnswer) {
      // Slider 0-100 → already a percentage
      normalizedVal = val;
    } else {
      if (val <= 0) return;
      const maxVal = q.options ? Math.max(...q.options.map(o => Number(o.value)).filter(v => !isNaN(v))) : 5;
      normalizedVal = (val / maxVal) * 100;
    }

    overall.total += normalizedVal;
    overall.count += 1;
    const sub = q.subDimension || q.dimension;
    if (!subs[sub]) subs[sub] = { total: 0, count: 0, max: 100 };
    subs[sub].total += normalizedVal;
    subs[sub].count += 1;
  });

  const subScores: Record<string, number> = {};
  for (const s in subs) {
    subScores[s] = Math.round(subs[s].total / subs[s].count);
  }

  return {
    overall: overall.count > 0 ? Math.round(overall.total / overall.count) : 50,
    subScores,
  };
}

// ── Creativity / Open-ended Scoring ──
export function scoreCreativity(answers: Record<string, string>): number {
  let totalItems = 0;
  Object.values(answers).forEach((ans) => {
    if (typeof ans === 'string' && ans.trim()) {
      const items = ans.split(/[,，、;；\n]+/).filter((s) => s.trim());
      totalItems += items.length;
    }
  });
  return Math.min(95, Math.max(20, Math.round(20 + totalItems * 5)));
}

// ── Single Choice Scoring (strict match correctOption) ──
export function scoreSingleChoice(
  answers: Record<string, string | number>,
  questions: DimensionModule['questions']
): { overall: number; subScores: Record<string, number> } {
  const subs: Record<string, { correct: number; total: number }> = {};
  let totalCorrect = 0;
  let totalCount = 0;

  questions.forEach((q) => {
    if (q.type !== 'single_choice' || !q.correctOption || answers[q.id] == null) return;
    const isCorrect = String(answers[q.id]).trim().toUpperCase() === String(q.correctOption).trim().toUpperCase();
    totalCount++;
    if (isCorrect) totalCorrect++;
    const sub = q.subDimension || q.dimension;
    if (!subs[sub]) subs[sub] = { correct: 0, total: 0 };
    subs[sub].total++;
    if (isCorrect) subs[sub].correct++;
  });

  const subScores: Record<string, number> = {};
  for (const s in subs) {
    subScores[s] = subs[s].total > 0 ? Math.round((subs[s].correct / subs[s].total) * 100) : 50;
  }

  return {
    overall: totalCount > 0 ? Math.round((totalCorrect / totalCount) * 100) : 50,
    subScores,
  };
}

// ── Visual Pair Choice Scoring (strict match correctSide) ──
export function scoreVisualPairChoice(
  answers: Record<string, string | number>,
  questions: DimensionModule['questions']
): { overall: number; subScores: Record<string, number> } {
  const subs: Record<string, { correct: number; total: number }> = {};
  let totalCorrect = 0;
  let totalCount = 0;

  questions.forEach((q) => {
    if (q.type !== 'visual_pair_choice' || !q.correctSide || answers[q.id] == null) return;
    const isCorrect = String(answers[q.id]).trim().toLowerCase() === q.correctSide;
    totalCount++;
    if (isCorrect) totalCorrect++;
    const sub = q.subDimension || q.dimension;
    if (!subs[sub]) subs[sub] = { correct: 0, total: 0 };
    subs[sub].total++;
    if (isCorrect) subs[sub].correct++;
  });

  const subScores: Record<string, number> = {};
  for (const s in subs) {
    subScores[s] = subs[s].total > 0 ? Math.round((subs[s].correct / subs[s].total) * 100) : 50;
  }

  return {
    overall: totalCount > 0 ? Math.round((totalCorrect / totalCount) * 100) : 50,
    subScores,
  };
}

// ── AVG Choice Scoring ──
export function scoreAVG(
  avgChoices: Record<string, string>,
  avgNodes: AVGNode[]
): Record<string, Record<string, number[]>> {
  const dimSubWeights: Record<string, Record<string, number[]>> = {};

  for (const [nodeId, choiceId] of Object.entries(avgChoices)) {
    const node = avgNodes.find(n => n.id === nodeId);
    if (!node) continue;
    const choice = node.choices.find(c => c.id === choiceId);
    if (!choice) continue;

    for (const mapping of choice.dimensionMappings) {
      if (!dimSubWeights[mapping.dimension]) dimSubWeights[mapping.dimension] = {};
      if (!dimSubWeights[mapping.dimension][mapping.subDimension]) {
        dimSubWeights[mapping.dimension][mapping.subDimension] = [];
      }
      dimSubWeights[mapping.dimension][mapping.subDimension].push(mapping.weight);
    }
  }

  return dimSubWeights;
}

// ── Main scoring dispatcher ──
export function scoreModule(
  _moduleId: string,
  answers: Record<string, string | number>,
  questions: DimensionModule['questions']
): { score: number; subScores: Record<string, number> } {
  // ── 过滤掉锚定量表题目, 它们不参与评分 ──
  const scoringQuestions = questions.filter(q => !q.id.startsWith('anchor_'));

  const likertQs = scoringQuestions.filter(q => q.type === 'likert5');
  const correctQs = scoringQuestions.filter(q => q.correct);
  const singleQs = scoringQuestions.filter(q => ['single', 'sjt', 'portrait'].includes(q.type) && !q.correct);
  const openQs = scoringQuestions.filter(q => q.type === 'open');
  const singleChoiceQs = scoringQuestions.filter(q => q.type === 'single_choice');
  const visualPairQs = scoringQuestions.filter(q => q.type === 'visual_pair_choice');

  let scores: number[] = [];
  let allSubScores: Record<string, number> = {};

  if (likertQs.length > 0) {
    const r = scoreLikert(answers as Record<string, number>, likertQs);
    scores.push(r.overall);
    allSubScores = { ...allSubScores, ...r.subScores };
  }

  if (correctQs.length > 0) {
    const s = scoreCorrectChoice(answers, correctQs);
    scores.push(s);
  }

  if (singleQs.length > 0) {
    const r = scoreSingleAverage(answers, singleQs);
    scores.push(r.overall);
    allSubScores = { ...allSubScores, ...r.subScores };
  }

  if (openQs.length > 0) {
    const openAnswers: Record<string, string> = {};
    openQs.forEach(q => { if (typeof answers[q.id] === 'string') openAnswers[q.id] = answers[q.id] as string; });
    const s = scoreCreativity(openAnswers);
    scores.push(s);
    allSubScores['divergent_thinking'] = s;
  }

  // ── V2.1: single_choice → strict correctOption match (100/0 per item) ──
  if (singleChoiceQs.length > 0) {
    const r = scoreSingleChoice(answers, singleChoiceQs);
    scores.push(r.overall);
    allSubScores = { ...allSubScores, ...r.subScores };
  }

  // ── V2.1: visual_pair_choice → strict correctSide match (100/0 per item) ──
  if (visualPairQs.length > 0) {
    const r = scoreVisualPairChoice(answers, visualPairQs);
    scores.push(r.overall);
    allSubScores = { ...allSubScores, ...r.subScores };
  }

  const overall = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 50;

  return { score: overall, subScores: allSubScores };
}

// ── Cross-Dimension Tension Detection ──
export function detectCrossDimensionTensions(
  scores: Record<string, number>,
  subScores: Record<string, Record<string, number>>
): CrossDimensionTension[] {
  const tensions: CrossDimensionTension[] = [];

  // High achievement + Low self-efficacy = Internal friction
  const achScore = subScores['motivation']?.['achievement'] ?? 0;
  const seScore = subScores['personality']?.['self_efficacy'] ?? 0;
  if (achScore > 70 && seScore < 40) {
    tensions.push({
      dimensions: ['motivation', 'personality'],
      tensionType: 'conflict',
      title: '成就驱动与自我怀疑的内耗',
      description: '你有强烈的成就动机，但对自身能力的信心不足。这种组合可能导致"想做但不敢做"的内耗模式。',
      suggestion: '尝试设定渐进式的小目标，通过积累成功体验来强化自我效能感。',
    });
  }

  // High openness + Low emotional stability = Creative sensitivity
  const openScore = subScores['personality']?.['openness'] ?? scores['personality'] ?? 0;
  const neuroScore = subScores['personality']?.['neuroticism'] ?? 0;
  if (openScore > 70 && neuroScore > 60) {
    tensions.push({
      dimensions: ['personality', 'emotion'],
      tensionType: 'paradox',
      title: '敏感的探索者',
      description: '你对新体验高度开放，但情绪也容易波动。这种"艺术家气质"同时是你最大的天赋和挑战。',
      suggestion: '将情绪波动视为创造力的燃料，同时发展正念冥想等情绪稳定技术。',
    });
  }

  // High autonomy need + High attachment anxiety = Freedom-love paradox
  const autoScore = subScores['motivation']?.['self_direction'] ?? subScores['motivation']?.['autonomy'] ?? 0;
  const anxScore = subScores['social']?.['attachment_anxiety'] ?? 0;
  if (autoScore > 65 && anxScore > 65) {
    tensions.push({
      dimensions: ['motivation', 'social'],
      tensionType: 'conflict',
      title: '自由与依恋的拉锯',
      description: '你重视独立和自由，但在亲密关系中又渴望确认和安全感。这种张力让关系既充满活力也充满不确定。',
      suggestion: '学会在关系中建立"安全基地"，从安全感出发去探索自由，而非在自由中寻找安全。',
    });
  }

  // High meaning search + Low meaning presence = Existential exploration
  const searchScore = subScores['worldview']?.['meaning_search'] ?? 0;
  const presScore = subScores['worldview']?.['meaning_presence'] ?? 0;
  if (searchScore > 70 && presScore < 40) {
    tensions.push({
      dimensions: ['worldview', 'worldview'],
      tensionType: 'paradox',
      title: '存在的漫游者',
      description: '你积极追寻生命的意义，但尚未找到清晰的答案。这种状态既充满焦虑也蕴含巨大的成长潜能。',
      suggestion: '阅读存在主义哲学（如Frankl《活出生命的意义》），将追寻本身视为意义的一部分。',
    });
  }

  // High cognitive + Low extraversion = Inner world rich
  if ((scores['cognitive'] ?? 0) > 75 && (subScores['personality']?.['extraversion'] ?? 50) < 35) {
    tensions.push({
      dimensions: ['cognitive', 'personality'],
      tensionType: 'synergy',
      title: '深沉的思考者',
      description: '你拥有强大的认知能力和丰富的内在世界，偏好独处和深度思考。这是哲学家和创造者的经典特质组合。',
      suggestion: '珍视你的独处时间作为思维的温室，同时有意识地创造分享洞察的渠道（写作、博客、小型讨论组）。',
    });
  }

  return tensions;
}

// ── Theory-Driven Dimension Analysis ──
const DESCRIPTIONS: Record<string, (s: number, sub: Record<string, number>) => { description: string; strength: string; growth: string; theoreticalInsight: string }> = {
  cognitive: (s, sub) => ({
    description: s > 70 ? '你展现出卓越的认知反思力和元认知觉察，善于跳出直觉陷阱进行深度分析。' : s > 50 ? '你的认知能力均衡发展，在分析和直觉之间保持良好平衡。' : '你的思维风格偏向直觉和经验，这是一种高效但有时可能遗漏细节的模式。',
    strength: (sub['cognitive_reflection'] ?? 0) > 60 ? '出色的认知反思力——不轻信第一直觉' : (sub['need_for_cognition'] ?? 0) > 60 ? '对深度思考的内在热爱' : '扎实的基础推理能力',
    growth: (sub['metacognition'] ?? 0) < 50 ? '发展元认知策略——学会"思考自己的思考"' : '挑战更复杂的系统性问题',
    theoreticalInsight: `基于Kahneman双加工理论，你的System 2（分析系统）活跃度${s > 60 ? '较高' : '适中'}。认知反思得分反映了你抵抗直觉陷阱的能力。`,
  }),
  personality: (_s, sub) => ({
    description: `你的人格画像展现了${(sub['openness'] ?? 50) > 60 ? '高度的好奇心和创新精神' : '稳重务实的行事风格'}，${(sub['conscientiousness'] ?? 50) > 60 ? '强烈的自律和目标感' : '灵活适应的处事方式'}。`,
    strength: (sub['resilience'] ?? 0) > 60 ? '出色的心理韧性——从逆境中快速弹回' : (sub['self_efficacy'] ?? 0) > 60 ? '坚定的自我效能信念' : '均衡发展的核心人格特质',
    growth: (sub['neuroticism'] ?? 0) > 60 ? '发展情绪调节技术，增强压力抵抗力' : '在舒适区边缘进行有意识的探索',
    theoreticalInsight: `基于Big Five五因素模型和HEXACO框架的综合分析。${(sub['honesty_humility'] ?? 0) > 0 ? `诚实-谦逊维度得分${(sub['honesty_humility'] ?? 0) > 60 ? '较高' : '适中'}，这是HEXACO模型中Big Five无法捕获的独特维度。` : ''}`,
  }),
  emotion: (s, sub) => ({
    description: s > 70 ? '你拥有出色的情绪智力——既能精准感知自身和他人的情绪，又善于运用认知重评等策略进行调节。' : s > 50 ? '你的情绪系统运作良好，具有基础的情绪觉知和调节能力。' : '你的情绪感知可能更偏向内隐层面，发展外显的情绪觉知将带来显著收益。',
    strength: (sub['empathy'] ?? 0) > 60 ? '敏锐的共情能力——认知共情与情感共情兼具' : (sub['emotion_regulation'] ?? 0) > 60 ? '有效的情绪调节策略' : '理性冷静的情绪处理方式',
    growth: (sub['meta_mood'] ?? 0) < 50 ? '培养"元情绪觉知"——学会观察自己的情绪过程' : '在高压情境中实践情绪调节',
    theoreticalInsight: `基于Mayer-Salovey情绪智力四分支模型和Gross情绪调节过程模型。你的情绪调节策略${(sub['emotion_regulation'] ?? 50) > 60 ? '偏向认知重评（更健康的策略）' : '可能更多依赖表达抑制'}。`,
  }),
  motivation: (_s, sub) => ({
    description: `你的价值体系中，${(sub['self_direction'] ?? 0) > (sub['benevolence'] ?? 0) ? '自主与自我导向' : '仁慈与关怀他人'}占据核心位置。${(sub['achievement'] ?? 0) > 60 ? '成就动机强烈，' : ''}你的三大基本心理需求${(sub['autonomy'] ?? 0) > 60 && (sub['competence'] ?? 0) > 60 && (sub['relatedness'] ?? 0) > 60 ? '均得到良好满足' : '中存在一些待关注的领域'}。`,
    strength: (sub['autonomy'] ?? 0) > 60 ? '强烈的自主性——清楚自己想要什么' : (sub['benevolence'] ?? 0) > 60 ? '深层的利他动机和关怀精神' : '清晰的价值优先级排序',
    growth: (sub['competence'] ?? 0) < 50 ? '在能力建设上投入更多，提升胜任感' : (sub['relatedness'] ?? 0) < 50 ? '有意识地培养和维护深度人际联结' : '探索价值观在日常行为中的具体落地',
    theoreticalInsight: `基于Schwartz精炼价值理论的19种价值取向和Deci-Ryan自我决定理论的三大基本心理需求模型。`,
  }),
  social: (_s, sub) => {
    const anxHigh = (sub['attachment_anxiety'] ?? 0) > 60;
    const avdHigh = (sub['attachment_avoidance'] ?? 0) > 60;
    const attachStyle = !anxHigh && !avdHigh ? '安全型' : anxHigh && !avdHigh ? '焦虑型' : !anxHigh && avdHigh ? '回避型' : '恐惧型';
    return {
      description: `你的依恋风格倾向于「${attachStyle}」。${(sub['social_connectedness'] ?? 50) > 60 ? '你与社会世界有着良好的联结感。' : '你可能在归属感方面有进一步发展的空间。'}`,
      strength: (sub['interpersonal_warmth'] ?? 0) > 60 ? '温暖的人际风格——容易建立良好关系' : (sub['interpersonal_dominance'] ?? 0) > 60 ? '自信的人际影响力' : '稳健的社会适应能力',
      growth: anxHigh ? '发展安全感的内在来源，减少对外部确认的依赖' : avdHigh ? '在安全的关系中练习渐进式的情感开放' : '深化现有的高质量关系',
      theoreticalInsight: `基于Bowlby依恋理论(ECR-R测量)和Wiggins人际环形模型。依恋维度：焦虑${(sub['attachment_anxiety'] ?? 50)}% / 回避${(sub['attachment_avoidance'] ?? 50)}%。`,
    };
  },
  aesthetic: (_s, sub) => {
    const avgAes = Object.values(sub).length > 0 ? Math.round(Object.values(sub).reduce((a, b) => a + b, 0) / Object.values(sub).length) : 50;
    return {
      description: avgAes > 70 ? '你拥有丰富的审美感知力和创造潜能，对美有独特而深入的理解。' : avgAes > 50 ? '你具有良好的审美感知力和创新意识。' : '你的风格偏向实用主义，审美和创造力领域有广阔的探索空间。',
      strength: (sub['divergent_thinking'] ?? 0) > 60 ? '出色的发散思维——能从多角度看待问题' : (sub['aesthetic_sensitivity'] ?? 0) > 60 ? '敏锐的审美感知力' : (sub['creative_self'] ?? 0) > 60 ? '强烈的创造力身份认同' : '务实的问题解决方式',
      growth: (sub['creative_self'] ?? 0) < 50 ? '培养"创造力自我效能"——相信自己有创造力' : '将审美洞察转化为实际的创造性产出',
      theoreticalInsight: `基于Guilford发散思维理论(AUT)和Schindler审美情绪模型(AESTHEMOS)。创造力是能力(发散思维)和信念(创造力自我概念)的组合。`,
    };
  },
  worldview: (_s, sub) => {
    const hasPresence = (sub['meaning_presence'] ?? 0) > 60;
    const hasSearch = (sub['meaning_search'] ?? 0) > 60;
    const meaningState = hasPresence && !hasSearch ? '满足状态' : !hasPresence && hasSearch ? '探索状态' : hasPresence && hasSearch ? '深度参与' : '需要关注';
    return {
      description: `你的生命意义感处于「${meaningState}」。${(sub['open_minded_thinking'] ?? 50) > 60 ? '你展现出积极的开放思维——能够认真考虑与自身信念相矛盾的观点。' : '你的认知框架相对稳定，可以尝试有意识地接触不同视角。'}`,
      strength: hasPresence ? '清晰的生命目的感' : (sub['open_minded_thinking'] ?? 0) > 60 ? '积极的开放思维和求知精神' : (sub['sense_of_coherence'] ?? 0) > 60 ? '对世界的coherent理解' : '对人生意义的持续探索',
      growth: !hasPresence && hasSearch ? '将追寻本身视为意义的一部分（弗兰克尔的洞察）' : !hasPresence ? '通过价值行动（而非纯思考）来建立意义感' : '分享你的人生智慧，成为他人意义探索的引路人',
      theoreticalInsight: `基于Frankl意义治疗理论(MLQ)和Haidt道德基础理论(MFQ)。你的道德直觉结构中，${(sub['moral_care'] ?? 0) > (sub['moral_fairness'] ?? 0) ? '关怀基础更突出' : '公平基础更突出'}。`,
    };
  },
  strengths: (_s: number, sub: Record<string, number>) => {
    const avgStr = Object.values(sub).length > 0 ? Math.round(Object.values(sub).reduce((a, b) => a + b, 0) / Object.values(sub).length) : 50;
    return {
      description: avgStr > 70 ? '你拥有丰富的品格资源和强大的内在力量，在逆境和日常中都能展现出色的品格优势。' : avgStr > 50 ? '你具有良好的品格基础，在多个方面展现出积极的品格特质。' : '你的品格优势有广阔的发展空间，积极心理学认为这些优势可以通过刻意练习来培养。',
      strength: (sub['perseverance'] ?? 0) > 60 ? '出色的毅力——坚持把事情做到底' : (sub['kindness'] ?? 0) > 60 ? '深厚的仁慈之心——关爱他人' : (sub['curiosity'] ?? 0) > 60 ? '强烈的好奇心——对世界充满探索欲' : '均衡发展的品格基础',
      growth: (sub['self_regulation'] ?? 0) < 50 ? '发展自我调节能力——管理冲动和欲望' : (sub['hope'] ?? 0) < 50 ? '培养希望感——对未来保持积极预期' : '将品格优势应用到更多生活场景中',
      theoreticalInsight: `基于Peterson-Seligman VIA品格优势分类体系，涵盖六大美德中的核心品格资源。你的品格优势组合${avgStr > 60 ? '展现出明显的积极心理资本' : '蕴含着丰富的发展潜能'}。`,
    };
  },
};

// ── Theme Map (upgraded) ──
const THEME_MAP: Record<string, string> = {
  cognitive: '敏锐的认知建筑师',
  personality: '真实的自我探索者',
  emotion: '温暖的情感导航者',
  motivation: '坚定的价值引领者',
  social: '深刻的关系编织者',
  aesthetic: '自由的创意灵魂',
  worldview: '深邃的意义追寻者',
  strengths: '坚韧的品格守护者',
};

// ── Generate Full Report ──
export function generateReport(
  scores: Record<string, number>,
  subScoresAll: Record<string, Record<string, number>> = {},
  avgData?: Record<string, Record<string, number[]>>
): Report {
  // Merge AVG data into subScores
  if (avgData) {
    for (const [dim, subs] of Object.entries(avgData)) {
      if (!subScoresAll[dim]) subScoresAll[dim] = {};
      for (const [sub, weights] of Object.entries(subs)) {
        const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
        const normalized = Math.round((avg / 5) * 100);
        if (subScoresAll[dim][sub]) {
          subScoresAll[dim][sub] = Math.round((subScoresAll[dim][sub] + normalized) / 2);
        } else {
          subScoresAll[dim][sub] = normalized;
        }
      }
    }
  }

  // Build dimension scores
  const dims: Record<string, DimensionScore> = {};
  for (const [key, score] of Object.entries(scores)) {
    const subs = subScoresAll[key] || {};
    const gen = DESCRIPTIONS[key]?.(score, subs) || { description: '', strength: '', growth: '', theoreticalInsight: '' };
    dims[key] = {
      dimension: key,
      name: DIMENSION_NAMES[key] || key,
      score,
      percentile: Math.min(99, Math.max(5, score + Math.round((Math.random() - 0.5) * 10))),
      subScores: subs,
      ...gen,
    };
  }

  // Detect tensions
  const crossDimensionTensions = detectCrossDimensionTensions(scores, subScoresAll);

  // Sort dimensions
  const topDims = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const top = topDims[0];
  const bottom = topDims[topDims.length - 1];
  const avgScore = Object.values(scores).reduce((a, b) => a + b, 0) / Math.max(Object.keys(scores).length, 1);

  return {
    id: Date.now().toString(),
    summary: avgScore > 70
      ? `你是一个${THEME_MAP[top?.[0] || 'personality']}，拥有深度的自我认知和丰富的内在世界。你的七维画像展现了一个在多个领域全面发展的个体。`
      : avgScore > 50
        ? `你是一个均衡发展的人，在${DIMENSION_NAMES[top?.[0] || '']}方面表现尤为突出。你的画像中蕴含着独特的维度间组合模式。`
        : `你拥有独特的个人特质画像。在${DIMENSION_NAMES[top?.[0] || '']}和${DIMENSION_NAMES[bottom?.[0] || '']}之间的张力中，蕴含着巨大的成长潜能。`,
    selfTheme: THEME_MAP[top?.[0] || 'personality'] || '独特的探索者',
    narrativeTheme: crossDimensionTensions.length > 0 ? crossDimensionTensions[0].title : undefined,
    dimensions: dims,
    crossDimensionTensions,
    themes: [
      {
        name: '核心驱动力',
        description: `你的${DIMENSION_NAMES[top?.[0] || '']}得分最高（${top?.[1]}分），这是你最核心的心理资源。`,
        suggestion: '深化这一优势，将其转化为生活和事业中的竞争壁垒。',
      },
      {
        name: '成长潜力区',
        description: `${DIMENSION_NAMES[bottom?.[0] || '']}得分相对较低（${bottom?.[1]}分），这里蕴含着最大的成长机遇。`,
        suggestion: '用你最擅长的维度来撬动薄弱维度的发展——维度之间是相互促进的。',
      },
      ...(crossDimensionTensions.length > 0 ? [{
        name: '跨维度张力',
        description: crossDimensionTensions[0].description,
        suggestion: crossDimensionTensions[0].suggestion,
      }] : []),
    ],
    insights: [
      {
        type: '优势',
        title: `${DIMENSION_NAMES[top?.[0] || '']}是你的超能力`,
        description: `你在这一维度的表现超过了${dims[top?.[0] || '']?.percentile || 50}%的人。${dims[top?.[0] || '']?.theoreticalInsight || ''}`,
      },
      {
        type: '模式',
        title: '行为模式洞察',
        description: avgScore > 65
          ? '你的七维画像整体偏高，展现出积极主动的生活态度和良好的心理资源。'
          : '你的画像呈现出有趣的高低组合，这种差异化模式往往比全面均衡更有特色。',
      },
      ...(crossDimensionTensions.map(t => ({
        type: t.tensionType === 'synergy' ? '协同' : t.tensionType === 'conflict' ? '张力' : '悖论',
        title: t.title,
        description: t.description,
      }))),
    ],
    recommendations: [
      {
        action: `每天花10分钟练习${avgScore > 60 ? '正念冥想' : '情绪日记'}`,
        reason: '这有助于提升自我认知和情绪调节能力',
        expectedOutcome: '1个月后，你对自己的内在状态将有更清晰的认识',
      },
      {
        action: `深入阅读一本关于${DIMENSION_NAMES[bottom?.[0] || '']}的书籍`,
        reason: `理论理解是发展这一维度的第一步`,
        expectedOutcome: '获得全新的自我认知视角',
      },
      {
        action: '找一位信任的朋友分享你的七维画像结果',
        reason: '外部视角能帮助你发现"自我认知的盲区"——内省准确性有天花板',
        expectedOutcome: '获得更完整的自我了解，可能发现你不知道的自己',
      },
    ],
    createdAt: new Date().toISOString(),
  };
}
