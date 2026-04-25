/**
 * 多源数据融合引擎
 *
 * 将 4 种数据源融合为最终七维画像:
 *   1. 问卷量表 (Likert/CRT/SJT) — 自我报告
 *   2. AVG 城市漫游者 — 情境行为选择
 *   3. 认知/博弈游戏 — 客观行为观测
 *   4. CAT 自适应 — IRT 精度估计
 *
 * 融合策略: 加权贝叶斯融合 (Weighted Bayesian Fusion)
 *   每个数据源提供一个 evidence signal,
 *   权重基于测量方法的信度特征:
 *     - 行为客观数据 (游戏/CAT) 权重最高 (0.35)
 *     - 问卷自我报告权重适中 (0.30)
 *     - 情境选择 (AVG) 权重适中 (0.25)
 *     - 融合调整 (0.10)
 */

import type { GameResult, StroopResult, NBackResult, GoNoGoResult, UltimatumResult, TrustResult, PublicGoodsResult } from '../types';
import { thetaToScore } from './irt';

// ── Dimension mapping for game results ──
export interface GameDimensionMapping {
  dimension: string;
  subDimension: string;
  score: number;    // 0-100
  weight: number;   // evidence strength
}

/**
 * Extract dimension scores from Stroop game results
 */
function mapStroopToDimensions(data: StroopResult): GameDimensionMapping[] {
  // Stroop effect → cognitive control, attention
  const stroopEffect = data.stroopEffect; // ms difference
  const controlScore = Math.max(10, Math.min(95, 80 - stroopEffect * 0.3));
  const accuracy = data.accuracy * 100;

  return [
    { dimension: 'cognitive', subDimension: 'cognitive_reflection', score: controlScore, weight: 0.7 },
    { dimension: 'cognitive', subDimension: 'thinking_style', score: accuracy > 80 ? 75 : 50, weight: 0.3 },
    { dimension: 'emotion', subDimension: 'emotion_regulation', score: controlScore > 60 ? 70 : 45, weight: 0.2 },
  ];
}

/**
 * Extract dimension scores from N-Back game results
 */
function mapNBackToDimensions(data: NBackResult): GameDimensionMapping[] {
  const d = data.dPrime;
  const workingMemoryScore = Math.max(10, Math.min(95, 20 + d * 25));
  const hitPct = data.hitRate * 100;

  return [
    { dimension: 'cognitive', subDimension: 'fluid_reasoning', score: workingMemoryScore, weight: 0.8 },
    { dimension: 'cognitive', subDimension: 'need_for_cognition', score: hitPct > 70 ? 65 : 40, weight: 0.2 },
  ];
}

/**
 * Extract dimension scores from Go/No-Go game results
 */
function mapGoNoGoToDimensions(data: GoNoGoResult): GameDimensionMapping[] {
  const commissionRate = data.commissionErrors / Math.max(1, data.totalTrials) * 100;
  const inhibitionScore = Math.max(10, Math.min(95, 95 - commissionRate * 3));
  const goAcc = data.goAccuracy;

  return [
    { dimension: 'cognitive', subDimension: 'cognitive_reflection', score: inhibitionScore, weight: 0.5 },
    { dimension: 'personality', subDimension: 'conscientiousness', score: inhibitionScore > 60 ? 70 : 40, weight: 0.3 },
    { dimension: 'emotion', subDimension: 'emotion_regulation', score: goAcc > 80 ? 65 : 40, weight: 0.3 },
  ];
}

/**
 * Extract dimension scores from Ultimatum game results
 */
function mapUltimatumToDimensions(data: UltimatumResult): GameDimensionMapping[] {
  const fairness = data.minAcceptable;
  const generosity = data.avgOffer;

  return [
    { dimension: 'worldview', subDimension: 'moral_fairness', score: fairness > 60 ? fairness : 40, weight: 0.6 },
    { dimension: 'worldview', subDimension: 'moral_care', score: Math.min(90, generosity * 3), weight: 0.3 },
    { dimension: 'social', subDimension: 'interpersonal_warmth', score: generosity > 25 ? 65 : 40, weight: 0.3 },
    { dimension: 'social', subDimension: 'conflict_style', score: fairness > 50 ? 55 : 70, weight: 0.2 },
  ];
}

/**
 * Extract dimension scores from Trust game results
 */
function mapTrustToDimensions(data: TrustResult): GameDimensionMapping[] {
  const trustLevel = Math.min(90, data.avgInvestment);
  const reciprocityLevel = Math.min(90, data.avgReturn);

  return [
    { dimension: 'social', subDimension: 'attachment_anxiety', score: trustLevel > 50 ? 30 : 70, weight: 0.4 },
    { dimension: 'social', subDimension: 'attachment_avoidance', score: trustLevel > 50 ? 30 : 65, weight: 0.3 },
    { dimension: 'social', subDimension: 'social_connectedness', score: trustLevel, weight: 0.5 },
    { dimension: 'motivation', subDimension: 'benevolence', score: reciprocityLevel, weight: 0.3 },
  ];
}

/**
 * Extract dimension scores from Public Goods game results
 */
function mapPublicGoodsToDimensions(data: PublicGoodsResult): GameDimensionMapping[] {
  const cooperationLevel = Math.min(90, data.avgContribution);
  const increasing = data.contributionTrend === 'increasing';

  return [
    { dimension: 'social', subDimension: 'social_connectedness', score: cooperationLevel, weight: 0.4 },
    { dimension: 'motivation', subDimension: 'benevolence', score: cooperationLevel, weight: 0.5 },
    { dimension: 'motivation', subDimension: 'relatedness', score: cooperationLevel > 50 ? 65 : 40, weight: 0.3 },
    { dimension: 'worldview', subDimension: 'moral_care', score: increasing ? 70 : 45, weight: 0.2 },
  ];
}

/**
 * Main fusion function: merge game results into dimension scores
 */
export function fuseGameResults(
  gameResults: GameResult[]
): { dimensionScores: Record<string, number>; subScores: Record<string, Record<string, number>> } {
  const allMappings: GameDimensionMapping[] = [];

  for (const result of gameResults) {
    switch (result.gameType) {
      case 'stroop': allMappings.push(...mapStroopToDimensions(result.data as StroopResult)); break;
      case 'nback': allMappings.push(...mapNBackToDimensions(result.data as NBackResult)); break;
      case 'gonogo': allMappings.push(...mapGoNoGoToDimensions(result.data as GoNoGoResult)); break;
      case 'ultimatum': allMappings.push(...mapUltimatumToDimensions(result.data as UltimatumResult)); break;
      case 'trust': allMappings.push(...mapTrustToDimensions(result.data as TrustResult)); break;
      case 'publicgoods': allMappings.push(...mapPublicGoodsToDimensions(result.data as PublicGoodsResult)); break;
    }
  }

  // Aggregate by dimension and sub-dimension using weighted average
  const dimSubs: Record<string, Record<string, { weightedSum: number; totalWeight: number }>> = {};

  for (const mapping of allMappings) {
    if (!dimSubs[mapping.dimension]) dimSubs[mapping.dimension] = {};
    if (!dimSubs[mapping.dimension][mapping.subDimension]) {
      dimSubs[mapping.dimension][mapping.subDimension] = { weightedSum: 0, totalWeight: 0 };
    }
    dimSubs[mapping.dimension][mapping.subDimension].weightedSum += mapping.score * mapping.weight;
    dimSubs[mapping.dimension][mapping.subDimension].totalWeight += mapping.weight;
  }

  const dimensionScores: Record<string, number> = {};
  const subScores: Record<string, Record<string, number>> = {};

  for (const [dim, subs] of Object.entries(dimSubs)) {
    subScores[dim] = {};
    const dimValues: number[] = [];
    for (const [sub, agg] of Object.entries(subs)) {
      const score = Math.round(agg.weightedSum / agg.totalWeight);
      subScores[dim][sub] = score;
      dimValues.push(score);
    }
    dimensionScores[dim] = Math.round(dimValues.reduce((a, b) => a + b, 0) / dimValues.length);
  }

  return { dimensionScores, subScores };
}

/**
 * Fuse CAT theta estimates into dimension scores
 */
export function fuseCATResults(
  catDimensionThetas: Record<string, number> // dimensionId -> theta
): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const [dim, theta] of Object.entries(catDimensionThetas)) {
    scores[dim] = thetaToScore(theta);
  }
  return scores;
}

/**
 * Multi-source fusion: combine all evidence into final scores
 *
 * Strategy: Weighted average with source-specific weights
 *   questionnaire: 0.30 (self-report, social desirability bias possible)
 *   AVG:           0.25 (situated behavior, less biased)
 *   games/behavior:0.25 (objective, but narrow)
 *   CAT/IRT:       0.20 (precise, but limited coverage)
 *
 * If a source doesn't have data for a dimension, its weight redistributes
 */
export function fuseAllSources(
  questionnaireScores: Record<string, number>,
  avgScores: Record<string, number>,
  gameScores: Record<string, number>,
  catScores: Record<string, number>,
): Record<string, number> {
  const allDims = new Set([
    ...Object.keys(questionnaireScores),
    ...Object.keys(avgScores),
    ...Object.keys(gameScores),
    ...Object.keys(catScores),
  ]);

  const result: Record<string, number> = {};

  for (const dim of allDims) {
    const sources: { score: number; weight: number }[] = [];

    if (questionnaireScores[dim] != null) sources.push({ score: questionnaireScores[dim], weight: 0.30 });
    if (avgScores[dim] != null) sources.push({ score: avgScores[dim], weight: 0.25 });
    if (gameScores[dim] != null) sources.push({ score: gameScores[dim], weight: 0.25 });
    if (catScores[dim] != null) sources.push({ score: catScores[dim], weight: 0.20 });

    if (sources.length === 0) continue;

    // Normalize weights to sum to 1
    const totalWeight = sources.reduce((a, s) => a + s.weight, 0);
    result[dim] = Math.round(
      sources.reduce((a, s) => a + s.score * (s.weight / totalWeight), 0)
    );
  }

  return result;
}
