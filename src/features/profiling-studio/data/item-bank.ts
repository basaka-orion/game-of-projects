/**
 * IRT 题目参数库 (V2.0 — SJT 微情境判断题)
 *
 * 为现有题库中的每道题分配 IRT-GRM 参数 (a=区分度, b=难度阈值)
 *
 * SJT 4-level 题: 3 个边界阈值 [b1, b2, b3]
 *   b1 = P(X≥2|θ) 的 50% 点
 *   b2 = P(X≥3|θ) 的 50% 点
 *   b3 = P(X≥4|θ) 的 50% 点
 *
 * 客观题 (CRT/ICAR): 二分参数 [b1]
 * 开放题 (AUT): 基于评分的梯度参数
 * 单选分类题 (value=string): 不参与 IRT（用于类型映射）
 *
 * 参数来源: 基于公开心理测量学研究数据校准
 * (本版本使用专家估计值, 待实际施测数据后可用 MMLE 重新校准)
 */

import type { IRTItemParams } from '../engine/irt';

// ── Helper: SJT 4-level 的 3 个边界阈值 ──
function sjtParams(
  questionId: string,
  dimension: string,
  subDimension: string,
  a: number,
  center: number,
  spread: number = 1.0,
  contentArea: string = ''
): IRTItemParams {
  return {
    questionId, dimension, subDimension, a,
    // 3 thresholds for 4 categories (GRM)
    b: [center - spread, center, center + spread],
    contentArea,
  };
}

// ── Helper: 二分题 (single correct) ──
function binaryParams(
  questionId: string,
  dimension: string,
  subDimension: string,
  a: number,
  b: number,
  contentArea: string = ''
): IRTItemParams {
  return { questionId, dimension, subDimension, a, b: [b], contentArea };
}

// ── Helper: 开放题 (AUT 评分系统) ──
function openParams(
  questionId: string,
  dimension: string,
  subDimension: string,
  a: number,
  center: number,
  contentArea: string = ''
): IRTItemParams {
  // 开放题按评分梯度: 低/中/高创意 → 3 阈值
  return {
    questionId, dimension, subDimension, a,
    b: [center - 0.8, center, center + 0.8],
    contentArea,
  };
}

// ═══════════════════════════════════════════════
// 完整题目参数库 — 对齐 questions.ts 的 ~120 SJT 题
// ═══════════════════════════════════════════════

export const ITEM_BANK: IRTItemParams[] = [
  // ── Ⅰ. 认知架构 (15 items) ──
  // fluid_reasoning (binary/objective)
  binaryParams('cog3',  'cognitive', 'fluid_reasoning',       2.0, 0.8, 'ICAR'),
  binaryParams('cog4',  'cognitive', 'fluid_reasoning',       1.5, 1.2, 'ICAR'),
  binaryParams('cog3b', 'cognitive', 'fluid_reasoning',       1.7, 0.4, 'ICAR'),
  // cognitive_reflection (binary/objective)
  binaryParams('cog1',  'cognitive', 'cognitive_reflection',  1.8, 0.5, 'CRT'),
  binaryParams('cog2',  'cognitive', 'cognitive_reflection',  1.6, 0.3, 'CRT'),
  binaryParams('cog2b', 'cognitive', 'cognitive_reflection',  1.9, 0.7, 'CRT'),
  // thinking_style (SJT + single)
  sjtParams('cog5',  'cognitive', 'thinking_style',       1.2, 0.0, 1.0, 'REI'),
  sjtParams('cog5b', 'cognitive', 'thinking_style',       1.3, -0.2, 1.1, 'REI'),
  sjtParams('cog5c', 'cognitive', 'thinking_style',       1.1, 0.3, 1.0, 'REI'),
  // need_for_cognition (SJT)
  sjtParams('cog6',  'cognitive', 'need_for_cognition',   1.4, -0.3, 1.1, 'NFC'),
  sjtParams('cog7',  'cognitive', 'need_for_cognition',   1.3, 0.2, 1.0, 'NFC'),
  sjtParams('cog7b', 'cognitive', 'need_for_cognition',   1.5, -0.1, 1.1, 'NFC'),
  // metacognition (SJT)
  sjtParams('cog8',  'cognitive', 'metacognition',        1.1, -0.5, 1.2, 'MAI'),
  sjtParams('cog9',  'cognitive', 'metacognition',        1.2, -0.2, 1.1, 'MAI'),
  sjtParams('cog9b', 'cognitive', 'metacognition',        1.3, -0.3, 1.0, 'MAI'),

  // ── Ⅱ. 人格拓扑 (24 items, all SJT) ──
  // extraversion
  sjtParams('per1',   'personality', 'extraversion',       1.5, -0.3, 1.0, 'IPIP-NEO'),
  sjtParams('per2',   'personality', 'extraversion',       1.4, 0.3, 1.1, 'IPIP-NEO'),
  sjtParams('per2b',  'personality', 'extraversion',       1.6, 0.5, 1.0, 'IPIP-NEO'),
  // openness
  sjtParams('per3',   'personality', 'openness',           1.4, -0.4, 1.0, 'IPIP-NEO'),
  sjtParams('per4',   'personality', 'openness',           1.3, 0.1, 1.1, 'IPIP-NEO'),
  sjtParams('per4b',  'personality', 'openness',           1.2, -0.1, 1.2, 'IPIP-NEO'),
  // conscientiousness
  sjtParams('per5',   'personality', 'conscientiousness',  1.3, -0.5, 1.2, 'IPIP-NEO'),
  sjtParams('per6',   'personality', 'conscientiousness',  1.4, 0.2, 1.0, 'IPIP-NEO'),
  sjtParams('per6b',  'personality', 'conscientiousness',  1.5, -0.1, 1.0, 'IPIP-NEO'),
  // agreeableness
  sjtParams('per7',   'personality', 'agreeableness',      1.2, -0.4, 1.0, 'IPIP-NEO'),
  sjtParams('per8',   'personality', 'agreeableness',      1.3, -0.6, 1.1, 'IPIP-NEO'),
  sjtParams('per8b',  'personality', 'agreeableness',      1.1, -0.2, 1.2, 'IPIP-NEO'),
  // neuroticism
  sjtParams('per9',   'personality', 'neuroticism',        1.6, 0.0, 1.0, 'IPIP-NEO'),
  sjtParams('per10',  'personality', 'neuroticism',        1.5, 0.3, 1.0, 'IPIP-NEO'),
  sjtParams('per10b', 'personality', 'neuroticism',        1.4, 0.5, 1.1, 'IPIP-NEO'),
  // honesty_humility
  sjtParams('per11',  'personality', 'honesty_humility',   1.3, -0.6, 1.0, 'HEXACO'),
  sjtParams('per11b', 'personality', 'honesty_humility',   1.2, -0.2, 1.1, 'HEXACO'),
  sjtParams('per11c', 'personality', 'honesty_humility',   1.4, -0.4, 1.0, 'HEXACO'),
  // resilience
  sjtParams('per12',  'personality', 'resilience',         1.3, 0.1, 1.2, 'BRS'),
  sjtParams('per12b', 'personality', 'resilience',         1.2, 0.4, 1.0, 'BRS'),
  sjtParams('per12c', 'personality', 'resilience',         1.4, -0.1, 1.1, 'BRS'),
  // self_efficacy
  sjtParams('per13',  'personality', 'self_efficacy',      1.4, -0.2, 1.1, 'GSE'),
  sjtParams('per13b', 'personality', 'self_efficacy',      1.3, 0.1, 1.0, 'GSE'),
  sjtParams('per13c', 'personality', 'self_efficacy',      1.5, -0.3, 1.0, 'GSE'),

  // ── Ⅲ. 情感动力 (15 items, all SJT) ──
  // self_emotion
  sjtParams('emo1',  'emotion', 'self_emotion',         1.5, -0.4, 1.0, 'WLEIS'),
  sjtParams('emo2',  'emotion', 'self_emotion',         1.3, 0.0, 1.1, 'WLEIS'),
  sjtParams('emo2b', 'emotion', 'self_emotion',         1.4, -0.2, 1.0, 'WLEIS'),
  // other_emotion
  sjtParams('emo3',  'emotion', 'other_emotion',        1.4, -0.3, 1.0, 'WLEIS'),
  sjtParams('emo3b', 'emotion', 'other_emotion',        1.3, 0.1, 1.1, 'WLEIS'),
  sjtParams('emo3c', 'emotion', 'other_emotion',        1.5, -0.1, 1.0, 'WLEIS'),
  // emotion_regulation
  sjtParams('emo4',  'emotion', 'emotion_regulation',   1.6, 0.3, 1.0, 'ERQ'),
  sjtParams('emo5',  'emotion', 'emotion_regulation',   1.4, 0.5, 1.2, 'ERQ'),
  sjtParams('emo5b', 'emotion', 'emotion_regulation',   1.3, 0.1, 1.0, 'ERQ'),
  // empathy
  sjtParams('emo6',  'emotion', 'empathy',              1.2, -0.6, 1.0, 'IRI'),
  sjtParams('emo7',  'emotion', 'empathy',              1.3, -0.3, 1.1, 'IRI'),
  sjtParams('emo7b', 'emotion', 'empathy',              1.4, -0.5, 1.0, 'IRI'),
  // meta_mood
  sjtParams('emo8',  'emotion', 'meta_mood',            1.1, 0.2, 1.2, 'TMMS'),
  sjtParams('emo9',  'emotion', 'meta_mood',            1.4, -0.1, 1.0, 'TMMS'),
  sjtParams('emo9b', 'emotion', 'meta_mood',            1.2, 0.0, 1.1, 'TMMS'),

  // ── Ⅳ. 动机引擎 (18 items, SJT + 1 single) ──
  // self_direction
  sjtParams('val1',  'motivation', 'self_direction',    1.4, -0.2, 1.0, 'PVQ-RR'),
  sjtParams('val4',  'motivation', 'self_direction',    1.2, 0.0, 1.1, 'PVQ-RR'), // single-choice → approx params
  sjtParams('val1b', 'motivation', 'self_direction',    1.3, -0.4, 1.0, 'PVQ-RR'),
  // achievement
  sjtParams('val2',  'motivation', 'achievement',       1.5, 0.0, 1.1, 'PVQ-RR'),
  sjtParams('val2b', 'motivation', 'achievement',       1.4, 0.3, 1.0, 'PVQ-RR'),
  sjtParams('val2c', 'motivation', 'achievement',       1.6, 0.1, 1.0, 'PVQ-RR'),
  // benevolence
  sjtParams('val3',  'motivation', 'benevolence',       1.3, -0.5, 1.0, 'PVQ-RR'),
  sjtParams('val3b', 'motivation', 'benevolence',       1.4, -0.3, 1.1, 'PVQ-RR'),
  sjtParams('val3c', 'motivation', 'benevolence',       1.2, -0.6, 1.0, 'PVQ-RR'),
  // autonomy
  sjtParams('val5',  'motivation', 'autonomy',          1.6, 0.2, 1.0, 'BPNSFS'),
  sjtParams('val5b', 'motivation', 'autonomy',          1.4, -0.1, 1.1, 'BPNSFS'),
  sjtParams('val5c', 'motivation', 'autonomy',          1.3, 0.4, 1.0, 'BPNSFS'),
  // competence
  sjtParams('val6',  'motivation', 'competence',        1.4, -0.1, 1.1, 'BPNSFS'),
  sjtParams('val6b', 'motivation', 'competence',        1.3, -0.3, 1.0, 'BPNSFS'),
  sjtParams('val6c', 'motivation', 'competence',        1.5, 0.2, 1.1, 'BPNSFS'),
  // relatedness
  sjtParams('val7',  'motivation', 'relatedness',       1.3, -0.4, 1.0, 'BPNSFS'),
  sjtParams('val7b', 'motivation', 'relatedness',       1.4, -0.2, 1.1, 'BPNSFS'),
  sjtParams('val7c', 'motivation', 'relatedness',       1.2, 0.3, 1.0, 'BPNSFS'),

  // ── Ⅴ. 社会联结 (18 items, SJT + existing SJT) ──
  // attachment_anxiety
  sjtParams('soc1',  'social', 'attachment_anxiety',      1.5, 0.0, 1.0, 'ECR-R'),
  sjtParams('soc2',  'social', 'attachment_anxiety',      1.4, 0.3, 1.1, 'ECR-R'),
  sjtParams('soc2b', 'social', 'attachment_anxiety',      1.6, 0.1, 1.0, 'ECR-R'),
  // attachment_avoidance
  sjtParams('soc3',  'social', 'attachment_avoidance',    1.4, 0.2, 1.1, 'ECR-R'),
  sjtParams('soc4',  'social', 'attachment_avoidance',    1.3, 0.5, 1.0, 'ECR-R'),
  sjtParams('soc4b', 'social', 'attachment_avoidance',    1.5, 0.1, 1.0, 'ECR-R'),
  // interpersonal_warmth
  sjtParams('soc5',  'social', 'interpersonal_warmth',    1.2, -0.5, 1.2, 'IPIP-IPC'),
  sjtParams('soc5b', 'social', 'interpersonal_warmth',    1.4, -0.3, 1.0, 'IPIP-IPC'),
  sjtParams('soc5c', 'social', 'interpersonal_warmth',    1.3, -0.1, 1.1, 'IPIP-IPC'),
  // interpersonal_dominance
  sjtParams('soc6',  'social', 'interpersonal_dominance', 1.3, 0.0, 1.0, 'IPIP-IPC'),
  sjtParams('soc6b', 'social', 'interpersonal_dominance', 1.2, 0.3, 1.1, 'IPIP-IPC'),
  sjtParams('soc6c', 'social', 'interpersonal_dominance', 1.4, 0.1, 1.0, 'IPIP-IPC'),
  // social_connectedness
  sjtParams('soc7',  'social', 'social_connectedness',    1.5, 0.1, 1.0, 'SCS-R'),
  sjtParams('soc7b', 'social', 'social_connectedness',    1.3, -0.2, 1.1, 'SCS-R'),
  sjtParams('soc7c', 'social', 'social_connectedness',    1.4, 0.4, 1.0, 'SCS-R'),
  // conflict_style
  sjtParams('soc8',  'social', 'conflict_style',          1.1, 0.0, 1.2, 'ROCI-II'),
  sjtParams('soc9',  'social', 'conflict_style',          1.2, 0.4, 1.0, 'ROCI-II'),
  sjtParams('soc9b', 'social', 'conflict_style',          1.3, 0.2, 1.1, 'ROCI-II'),

  // ── Ⅵ. 审美与创造 (12 items) ──
  // divergent_thinking (open-ended → scored)
  openParams('aes1',  'aesthetic', 'divergent_thinking',     1.3, 0.2, 'AUT'),
  openParams('aes2',  'aesthetic', 'divergent_thinking',     1.4, -0.1, 'AUT'),
  openParams('aes2b', 'aesthetic', 'divergent_thinking',     1.2, 0.3, 'AUT'),
  // aesthetic_sensitivity (single-choice)
  sjtParams('aes3',  'aesthetic', 'aesthetic_sensitivity',  1.4, -0.3, 1.1, 'AESTHEMOS'),
  sjtParams('aes4',  'aesthetic', 'aesthetic_sensitivity',  1.2, 0.0, 1.0, 'AESTHEMOS'),
  sjtParams('aes8',  'aesthetic', 'aesthetic_sensitivity',  1.3, 0.2, 1.2, 'AESTHEMOS'),
  // creative_achievement (SJT + single)
  sjtParams('aes7',  'aesthetic', 'creative_achievement',   1.1, 0.5, 1.1, 'CAQ'),
  sjtParams('aes7b', 'aesthetic', 'creative_achievement',   1.2, 0.3, 1.0, 'CAQ'),
  sjtParams('aes7c', 'aesthetic', 'creative_achievement',   1.3, 0.6, 1.1, 'CAQ'),
  // creative_self (SJT)
  sjtParams('aes5',  'aesthetic', 'creative_self',          1.5, -0.2, 1.0, 'SSCS'),
  sjtParams('aes6',  'aesthetic', 'creative_self',          1.3, 0.3, 1.2, 'SSCS'),
  sjtParams('aes6b', 'aesthetic', 'creative_self',          1.4, 0.0, 1.0, 'SSCS'),

  // ── Ⅶ. 世界观与意义 (18 items) ──
  // meaning_presence (SJT)
  sjtParams('wv1',  'worldview', 'meaning_presence',       1.5, 0.0, 1.0, 'MLQ'),
  sjtParams('wv2',  'worldview', 'meaning_presence',       1.4, -0.2, 1.1, 'MLQ'),
  sjtParams('wv2b', 'worldview', 'meaning_presence',       1.3, 0.3, 1.0, 'MLQ'),
  // meaning_search (SJT)
  sjtParams('wv3',  'worldview', 'meaning_search',         1.3, 0.3, 1.1, 'MLQ'),
  sjtParams('wv10', 'worldview', 'meaning_search',         1.2, 0.1, 1.0, 'MLQ'),
  sjtParams('wv3b', 'worldview', 'meaning_search',         1.4, -0.1, 1.1, 'MLQ'),
  // moral_care (SJT + single)
  sjtParams('wv4',  'worldview', 'moral_care',             1.2, -0.5, 1.2, 'MFQ'),
  sjtParams('wv4b', 'worldview', 'moral_care',             1.4, -0.3, 1.0, 'MFQ'),
  sjtParams('wv4c', 'worldview', 'moral_care',             1.3, -0.4, 1.1, 'MFQ'),
  // moral_fairness (SJT + single)
  sjtParams('wv5',  'worldview', 'moral_fairness',         1.4, -0.2, 1.0, 'MFQ'),
  sjtParams('wv5b', 'worldview', 'moral_fairness',         1.3, -0.1, 1.1, 'MFQ'),
  sjtParams('wv5c', 'worldview', 'moral_fairness',         1.5, -0.3, 1.0, 'MFQ'),
  // open_minded_thinking (SJT)
  sjtParams('wv6',  'worldview', 'open_minded_thinking',   1.3, 0.1, 1.0, 'AOT'),
  sjtParams('wv7',  'worldview', 'open_minded_thinking',   1.4, 0.4, 1.1, 'AOT'),
  sjtParams('wv7b', 'worldview', 'open_minded_thinking',   1.2, 0.2, 1.0, 'AOT'),
  // sense_of_coherence (SJT)
  sjtParams('wv8',  'worldview', 'sense_of_coherence',     1.1, -0.3, 1.0, 'SOC-13'),
  sjtParams('wv9',  'worldview', 'sense_of_coherence',     1.2, 0.2, 1.2, 'SOC-13'),
  sjtParams('wv9b', 'worldview', 'sense_of_coherence',     1.3, -0.1, 1.0, 'SOC-13'),

  // ── Ⅷ. 品格优势 (24 items) ──
  sjtParams('str_cre_1',  'strengths', 'creativity',       1.4, -0.2, 1.0, 'VIA'),
  sjtParams('str_cre_2',  'strengths', 'creativity',       1.3, 0.2, 1.1, 'VIA'),
  sjtParams('str_cre_3',  'strengths', 'creativity',       1.5, -0.1, 1.0, 'VIA'),
  sjtParams('str_cur_1',  'strengths', 'curiosity',        1.5, -0.3, 1.0, 'VIA'),
  sjtParams('str_cur_2',  'strengths', 'curiosity',        1.3, 0.1, 1.1, 'VIA'),
  sjtParams('str_cur_3',  'strengths', 'curiosity',        1.4, -0.2, 1.0, 'VIA'),
  sjtParams('str_per_1',  'strengths', 'perseverance',     1.5, 0.0, 1.0, 'VIA'),
  sjtParams('str_per_2',  'strengths', 'perseverance',     1.4, 0.4, 1.1, 'VIA'),
  sjtParams('str_per_3',  'strengths', 'perseverance',     1.3, 0.2, 1.0, 'VIA'),
  sjtParams('str_kin_1',  'strengths', 'kindness',         1.2, -0.4, 1.1, 'VIA'),
  sjtParams('str_kin_2',  'strengths', 'kindness',         1.3, -0.1, 1.0, 'VIA'),
  sjtParams('str_kin_3',  'strengths', 'kindness',         1.2, -0.3, 1.0, 'VIA'),
  sjtParams('str_fair_1', 'strengths', 'fairness',         1.4, -0.2, 1.0, 'VIA'),
  sjtParams('str_fair_2', 'strengths', 'fairness',         1.3, 0.2, 1.1, 'VIA'),
  sjtParams('str_fair_3', 'strengths', 'fairness',         1.4, 0.0, 1.0, 'VIA'),
  sjtParams('str_pru_1',  'strengths', 'prudence',         1.5, 0.1, 1.0, 'VIA'),
  sjtParams('str_pru_2',  'strengths', 'prudence',         1.4, 0.4, 1.0, 'VIA'),
  sjtParams('str_pru_3',  'strengths', 'prudence',         1.3, 0.2, 1.1, 'VIA'),
  sjtParams('str_sr_1',   'strengths', 'self_regulation',  1.5, 0.2, 1.0, 'VIA'),
  sjtParams('str_sr_2',   'strengths', 'self_regulation',  1.4, 0.5, 1.1, 'VIA'),
  sjtParams('str_sr_3',   'strengths', 'self_regulation',  1.3, 0.3, 1.0, 'VIA'),
  sjtParams('str_hope_1', 'strengths', 'hope',             1.4, -0.1, 1.0, 'VIA'),
  sjtParams('str_hope_2', 'strengths', 'hope',             1.3, 0.3, 1.1, 'VIA'),
  sjtParams('str_hope_3', 'strengths', 'hope',             1.4, 0.1, 1.0, 'VIA'),
];

/**
 * Get item bank for a specific dimension
 */
export function getDimensionItemBank(dimension: string): IRTItemParams[] {
  return ITEM_BANK.filter(item => item.dimension === dimension);
}

/**
 * Get all unique dimensions in the item bank
 */
export function getItemBankDimensions(): string[] {
  return [...new Set(ITEM_BANK.map(item => item.dimension))];
}

// ═══════════════════════════════════════════════
// CAT 专用题目参数库 — 对齐 cat-questions.ts 的 120 题
// ID 带 cat_ 前缀，参数值做微调以体现平行测验差异
// ═══════════════════════════════════════════════

export const CAT_ITEM_BANK: IRTItemParams[] = [
  // ── Ⅰ. 认知架构 (15 items) ──
  binaryParams('cat_cog3',  'cognitive', 'fluid_reasoning',       1.9, 0.9, 'ICAR'),
  binaryParams('cat_cog4',  'cognitive', 'fluid_reasoning',       1.6, 1.1, 'ICAR'),
  binaryParams('cat_cog3b', 'cognitive', 'fluid_reasoning',       1.8, 0.5, 'ICAR'),
  binaryParams('cat_cog1',  'cognitive', 'cognitive_reflection',  1.7, 0.6, 'CRT'),
  binaryParams('cat_cog2',  'cognitive', 'cognitive_reflection',  1.5, 0.4, 'CRT'),
  binaryParams('cat_cog2b', 'cognitive', 'cognitive_reflection',  2.0, 0.8, 'CRT'),
  sjtParams('cat_cog5',  'cognitive', 'thinking_style',       1.3, 0.1, 1.0, 'REI'),
  sjtParams('cat_cog5b', 'cognitive', 'thinking_style',       1.2, -0.1, 1.1, 'REI'),
  sjtParams('cat_cog5c', 'cognitive', 'thinking_style',       1.1, 0.2, 1.0, 'REI'),
  sjtParams('cat_cog6',  'cognitive', 'need_for_cognition',   1.5, -0.2, 1.1, 'NFC'),
  sjtParams('cat_cog7',  'cognitive', 'need_for_cognition',   1.4, 0.3, 1.0, 'NFC'),
  sjtParams('cat_cog7b', 'cognitive', 'need_for_cognition',   1.3, 0.0, 1.1, 'NFC'),
  sjtParams('cat_cog8',  'cognitive', 'metacognition',        1.2, -0.4, 1.2, 'MAI'),
  sjtParams('cat_cog9',  'cognitive', 'metacognition',        1.1, -0.1, 1.1, 'MAI'),
  sjtParams('cat_cog9b', 'cognitive', 'metacognition',        1.4, -0.2, 1.0, 'MAI'),

  // ── Ⅱ. 人格拓扑 (24 items) ──
  sjtParams('cat_per1',   'personality', 'extraversion',       1.4, -0.2, 1.0, 'IPIP-NEO'),
  sjtParams('cat_per2',   'personality', 'extraversion',       1.5, 0.4, 1.1, 'IPIP-NEO'),
  sjtParams('cat_per2b',  'personality', 'extraversion',       1.3, 0.6, 1.0, 'IPIP-NEO'),
  sjtParams('cat_per3',   'personality', 'openness',           1.5, -0.3, 1.0, 'IPIP-NEO'),
  sjtParams('cat_per4',   'personality', 'openness',           1.2, 0.2, 1.1, 'IPIP-NEO'),
  sjtParams('cat_per4b',  'personality', 'openness',           1.3, 0.0, 1.2, 'IPIP-NEO'),
  sjtParams('cat_per5',   'personality', 'conscientiousness',  1.4, -0.4, 1.2, 'IPIP-NEO'),
  sjtParams('cat_per6',   'personality', 'conscientiousness',  1.3, 0.3, 1.0, 'IPIP-NEO'),
  sjtParams('cat_per6b',  'personality', 'conscientiousness',  1.5, 0.0, 1.0, 'IPIP-NEO'),
  sjtParams('cat_per7',   'personality', 'agreeableness',      1.3, -0.3, 1.0, 'IPIP-NEO'),
  sjtParams('cat_per8',   'personality', 'agreeableness',      1.2, -0.5, 1.1, 'IPIP-NEO'),
  sjtParams('cat_per8b',  'personality', 'agreeableness',      1.1, -0.1, 1.2, 'IPIP-NEO'),
  sjtParams('cat_per9',   'personality', 'neuroticism',        1.5, 0.1, 1.0, 'IPIP-NEO'),
  sjtParams('cat_per10',  'personality', 'neuroticism',        1.6, 0.4, 1.0, 'IPIP-NEO'),
  sjtParams('cat_per10b', 'personality', 'neuroticism',        1.3, 0.6, 1.1, 'IPIP-NEO'),
  sjtParams('cat_per11',  'personality', 'honesty_humility',   1.4, -0.5, 1.0, 'HEXACO'),
  sjtParams('cat_per11b', 'personality', 'honesty_humility',   1.3, -0.1, 1.1, 'HEXACO'),
  sjtParams('cat_per11c', 'personality', 'honesty_humility',   1.5, -0.3, 1.0, 'HEXACO'),
  sjtParams('cat_per12',  'personality', 'resilience',         1.2, 0.2, 1.2, 'BRS'),
  sjtParams('cat_per12b', 'personality', 'resilience',         1.3, 0.5, 1.0, 'BRS'),
  sjtParams('cat_per12c', 'personality', 'resilience',         1.5, 0.0, 1.1, 'BRS'),
  sjtParams('cat_per13',  'personality', 'self_efficacy',      1.3, -0.1, 1.1, 'GSE'),
  sjtParams('cat_per13b', 'personality', 'self_efficacy',      1.4, 0.2, 1.0, 'GSE'),
  sjtParams('cat_per13c', 'personality', 'self_efficacy',      1.6, -0.2, 1.0, 'GSE'),

  // ── Ⅲ. 情感动力 (15 items) ──
  sjtParams('cat_emo1',  'emotion', 'self_emotion',         1.4, -0.3, 1.0, 'WLEIS'),
  sjtParams('cat_emo2',  'emotion', 'self_emotion',         1.3, 0.1, 1.1, 'WLEIS'),
  sjtParams('cat_emo2b', 'emotion', 'self_emotion',         1.5, -0.1, 1.0, 'WLEIS'),
  sjtParams('cat_emo3',  'emotion', 'other_emotion',        1.3, -0.2, 1.0, 'WLEIS'),
  sjtParams('cat_emo3b', 'emotion', 'other_emotion',        1.4, 0.2, 1.1, 'WLEIS'),
  sjtParams('cat_emo3c', 'emotion', 'other_emotion',        1.5, 0.0, 1.0, 'WLEIS'),
  sjtParams('cat_emo4',  'emotion', 'emotion_regulation',   1.5, 0.4, 1.0, 'ERQ'),
  sjtParams('cat_emo5',  'emotion', 'emotion_regulation',   1.3, 0.6, 1.2, 'ERQ'),
  sjtParams('cat_emo5b', 'emotion', 'emotion_regulation',   1.4, 0.2, 1.0, 'ERQ'),
  sjtParams('cat_emo6',  'emotion', 'empathy',              1.3, -0.5, 1.0, 'IRI'),
  sjtParams('cat_emo7',  'emotion', 'empathy',              1.2, -0.2, 1.1, 'IRI'),
  sjtParams('cat_emo7b', 'emotion', 'empathy',              1.4, -0.4, 1.0, 'IRI'),
  sjtParams('cat_emo8',  'emotion', 'meta_mood',            1.2, 0.3, 1.2, 'TMMS'),
  sjtParams('cat_emo9',  'emotion', 'meta_mood',            1.3, 0.0, 1.0, 'TMMS'),
  sjtParams('cat_emo9b', 'emotion', 'meta_mood',            1.1, 0.1, 1.1, 'TMMS'),

  // ── Ⅳ. 动机引擎 (18 items) ──
  sjtParams('cat_val1',  'motivation', 'self_direction',    1.3, -0.1, 1.0, 'PVQ-RR'),
  sjtParams('cat_val4',  'motivation', 'self_direction',    1.2, 0.1, 1.1, 'PVQ-RR'),
  sjtParams('cat_val1b', 'motivation', 'self_direction',    1.4, -0.3, 1.0, 'PVQ-RR'),
  sjtParams('cat_val2',  'motivation', 'achievement',       1.4, 0.1, 1.1, 'PVQ-RR'),
  sjtParams('cat_val2b', 'motivation', 'achievement',       1.5, 0.4, 1.0, 'PVQ-RR'),
  sjtParams('cat_val2c', 'motivation', 'achievement',       1.3, 0.2, 1.0, 'PVQ-RR'),
  sjtParams('cat_val3',  'motivation', 'benevolence',       1.4, -0.4, 1.0, 'PVQ-RR'),
  sjtParams('cat_val3b', 'motivation', 'benevolence',       1.3, -0.2, 1.1, 'PVQ-RR'),
  sjtParams('cat_val3c', 'motivation', 'benevolence',       1.2, -0.5, 1.0, 'PVQ-RR'),
  sjtParams('cat_val5',  'motivation', 'autonomy',          1.5, 0.3, 1.0, 'BPNSFS'),
  sjtParams('cat_val5b', 'motivation', 'autonomy',          1.3, 0.0, 1.1, 'BPNSFS'),
  sjtParams('cat_val5c', 'motivation', 'autonomy',          1.4, 0.5, 1.0, 'BPNSFS'),
  sjtParams('cat_val6',  'motivation', 'competence',        1.3, 0.0, 1.1, 'BPNSFS'),
  sjtParams('cat_val6b', 'motivation', 'competence',        1.4, -0.2, 1.0, 'BPNSFS'),
  sjtParams('cat_val6c', 'motivation', 'competence',        1.5, 0.3, 1.1, 'BPNSFS'),
  sjtParams('cat_val7',  'motivation', 'relatedness',       1.4, -0.3, 1.0, 'BPNSFS'),
  sjtParams('cat_val7b', 'motivation', 'relatedness',       1.3, -0.1, 1.1, 'BPNSFS'),
  sjtParams('cat_val7c', 'motivation', 'relatedness',       1.2, 0.4, 1.0, 'BPNSFS'),

  // ── Ⅴ. 社会联结 (18 items) ──
  sjtParams('cat_soc1',  'social', 'attachment_anxiety',      1.4, 0.1, 1.0, 'ECR-R'),
  sjtParams('cat_soc2',  'social', 'attachment_anxiety',      1.5, 0.4, 1.1, 'ECR-R'),
  sjtParams('cat_soc2b', 'social', 'attachment_anxiety',      1.3, 0.2, 1.0, 'ECR-R'),
  sjtParams('cat_soc3',  'social', 'attachment_avoidance',    1.3, 0.3, 1.1, 'ECR-R'),
  sjtParams('cat_soc4',  'social', 'attachment_avoidance',    1.4, 0.6, 1.0, 'ECR-R'),
  sjtParams('cat_soc4b', 'social', 'attachment_avoidance',    1.5, 0.2, 1.0, 'ECR-R'),
  sjtParams('cat_soc5',  'social', 'interpersonal_warmth',    1.3, -0.4, 1.2, 'IPIP-IPC'),
  sjtParams('cat_soc5b', 'social', 'interpersonal_warmth',    1.4, -0.2, 1.0, 'IPIP-IPC'),
  sjtParams('cat_soc5c', 'social', 'interpersonal_warmth',    1.2, 0.0, 1.1, 'IPIP-IPC'),
  sjtParams('cat_soc6',  'social', 'interpersonal_dominance', 1.4, 0.1, 1.0, 'IPIP-IPC'),
  sjtParams('cat_soc6b', 'social', 'interpersonal_dominance', 1.3, 0.4, 1.1, 'IPIP-IPC'),
  sjtParams('cat_soc6c', 'social', 'interpersonal_dominance', 1.5, 0.2, 1.0, 'IPIP-IPC'),
  sjtParams('cat_soc7',  'social', 'social_connectedness',    1.4, 0.2, 1.0, 'SCS-R'),
  sjtParams('cat_soc7b', 'social', 'social_connectedness',    1.3, -0.1, 1.1, 'SCS-R'),
  sjtParams('cat_soc7c', 'social', 'social_connectedness',    1.5, 0.5, 1.0, 'SCS-R'),
  sjtParams('cat_soc8',  'social', 'conflict_style',          1.2, 0.1, 1.2, 'ROCI-II'),
  sjtParams('cat_soc9',  'social', 'conflict_style',          1.1, 0.5, 1.0, 'ROCI-II'),
  sjtParams('cat_soc9b', 'social', 'conflict_style',          1.3, 0.3, 1.1, 'ROCI-II'),

  // ── Ⅵ. 审美与创造 (12 items) ──
  openParams('cat_aes1',  'aesthetic', 'divergent_thinking',     1.4, 0.3, 'AUT'),
  openParams('cat_aes2',  'aesthetic', 'divergent_thinking',     1.3, 0.0, 'AUT'),
  openParams('cat_aes2b', 'aesthetic', 'divergent_thinking',     1.2, 0.4, 'AUT'),
  sjtParams('cat_aes3',  'aesthetic', 'aesthetic_sensitivity',  1.3, -0.2, 1.1, 'AESTHEMOS'),
  sjtParams('cat_aes4',  'aesthetic', 'aesthetic_sensitivity',  1.2, 0.1, 1.0, 'AESTHEMOS'),
  sjtParams('cat_aes8',  'aesthetic', 'aesthetic_sensitivity',  1.4, 0.3, 1.2, 'AESTHEMOS'),
  sjtParams('cat_aes7',  'aesthetic', 'creative_achievement',   1.2, 0.6, 1.1, 'CAQ'),
  sjtParams('cat_aes7b', 'aesthetic', 'creative_achievement',   1.1, 0.4, 1.0, 'CAQ'),
  sjtParams('cat_aes7c', 'aesthetic', 'creative_achievement',   1.3, 0.7, 1.1, 'CAQ'),
  sjtParams('cat_aes5',  'aesthetic', 'creative_self',          1.4, -0.1, 1.0, 'SSCS'),
  sjtParams('cat_aes6',  'aesthetic', 'creative_self',          1.3, 0.4, 1.2, 'SSCS'),
  sjtParams('cat_aes6b', 'aesthetic', 'creative_self',          1.5, 0.1, 1.0, 'SSCS'),

  // ── Ⅶ. 世界观与意义 (18 items) ──
  sjtParams('cat_wv1',  'worldview', 'meaning_presence',       1.4, 0.1, 1.0, 'MLQ'),
  sjtParams('cat_wv2',  'worldview', 'meaning_presence',       1.3, -0.1, 1.1, 'MLQ'),
  sjtParams('cat_wv2b', 'worldview', 'meaning_presence',       1.4, 0.4, 1.0, 'MLQ'),
  sjtParams('cat_wv3',  'worldview', 'meaning_search',         1.2, 0.4, 1.1, 'MLQ'),
  sjtParams('cat_wv10', 'worldview', 'meaning_search',         1.3, 0.2, 1.0, 'MLQ'),
  sjtParams('cat_wv3b', 'worldview', 'meaning_search',         1.4, 0.0, 1.1, 'MLQ'),
  sjtParams('cat_wv4',  'worldview', 'moral_care',             1.3, -0.4, 1.2, 'MFQ'),
  sjtParams('cat_wv4b', 'worldview', 'moral_care',             1.4, -0.2, 1.0, 'MFQ'),
  sjtParams('cat_wv4c', 'worldview', 'moral_care',             1.2, -0.3, 1.1, 'MFQ'),
  sjtParams('cat_wv5',  'worldview', 'moral_fairness',         1.3, -0.1, 1.0, 'MFQ'),
  sjtParams('cat_wv5b', 'worldview', 'moral_fairness',         1.4, 0.0, 1.1, 'MFQ'),
  sjtParams('cat_wv5c', 'worldview', 'moral_fairness',         1.5, -0.2, 1.0, 'MFQ'),
  sjtParams('cat_wv6',  'worldview', 'open_minded_thinking',   1.4, 0.2, 1.0, 'AOT'),
  sjtParams('cat_wv7',  'worldview', 'open_minded_thinking',   1.3, 0.5, 1.1, 'AOT'),
  sjtParams('cat_wv7b', 'worldview', 'open_minded_thinking',   1.2, 0.3, 1.0, 'AOT'),
  sjtParams('cat_wv8',  'worldview', 'sense_of_coherence',     1.2, -0.2, 1.0, 'SOC-13'),
  sjtParams('cat_wv9',  'worldview', 'sense_of_coherence',     1.3, 0.3, 1.2, 'SOC-13'),
  sjtParams('cat_wv9b', 'worldview', 'sense_of_coherence',     1.4, 0.0, 1.0, 'SOC-13'),

  // ── Ⅷ. 品格优势 (24 items) ──
  sjtParams('cat_str1',  'strengths', 'creativity',       1.4, -0.1, 1.0, 'VIA'),
  sjtParams('cat_str1b', 'strengths', 'creativity',       1.3, 0.1, 1.1, 'VIA'),
  sjtParams('cat_str1c', 'strengths', 'creativity',       1.5, 0.0, 1.0, 'VIA'),
  sjtParams('cat_str2',  'strengths', 'curiosity',        1.5, -0.2, 1.0, 'VIA'),
  sjtParams('cat_str2b', 'strengths', 'curiosity',        1.3, 0.0, 1.1, 'VIA'),
  sjtParams('cat_str2c', 'strengths', 'curiosity',        1.4, -0.1, 1.0, 'VIA'),
  sjtParams('cat_str3',  'strengths', 'perseverance',     1.5, 0.1, 1.0, 'VIA'),
  sjtParams('cat_str3b', 'strengths', 'perseverance',     1.4, 0.5, 1.1, 'VIA'),
  sjtParams('cat_str3c', 'strengths', 'perseverance',     1.3, 0.3, 1.0, 'VIA'),
  sjtParams('cat_str4',  'strengths', 'kindness',         1.2, -0.3, 1.1, 'VIA'),
  sjtParams('cat_str4b', 'strengths', 'kindness',         1.3, 0.0, 1.0, 'VIA'),
  sjtParams('cat_str4c', 'strengths', 'kindness',         1.2, -0.2, 1.0, 'VIA'),
  sjtParams('cat_str5',  'strengths', 'fairness',         1.4, -0.1, 1.0, 'VIA'),
  sjtParams('cat_str5b', 'strengths', 'fairness',         1.3, 0.1, 1.1, 'VIA'),
  sjtParams('cat_str5c', 'strengths', 'fairness',         1.4, 0.0, 1.0, 'VIA'),
  sjtParams('cat_str6',  'strengths', 'prudence',         1.5, 0.2, 1.0, 'VIA'),
  sjtParams('cat_str6b', 'strengths', 'prudence',         1.4, 0.4, 1.0, 'VIA'),
  sjtParams('cat_str6c', 'strengths', 'prudence',         1.3, 0.3, 1.1, 'VIA'),
  sjtParams('cat_str7',  'strengths', 'self_regulation',  1.5, 0.3, 1.0, 'VIA'),
  sjtParams('cat_str7b', 'strengths', 'self_regulation',  1.4, 0.5, 1.1, 'VIA'),
  sjtParams('cat_str7c', 'strengths', 'self_regulation',  1.3, 0.4, 1.0, 'VIA'),
  sjtParams('cat_str8',  'strengths', 'hope',             1.4, 0.0, 1.0, 'VIA'),
  sjtParams('cat_str8b', 'strengths', 'hope',             1.3, 0.2, 1.1, 'VIA'),
  sjtParams('cat_str8c', 'strengths', 'hope',             1.4, 0.1, 1.0, 'VIA'),
];

/**
 * Get CAT item bank for a specific dimension
 */
export function getCATDimensionItemBank(dimension: string): IRTItemParams[] {
  return CAT_ITEM_BANK.filter(item => item.dimension === dimension);
}
