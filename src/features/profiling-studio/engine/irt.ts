/**
 * IRT/CAT 自适应测试引擎
 *
 * 模型: 分级反应模型 (Graded Response Model, GRM)
 *   P(X ≥ k | θ) = 1 / (1 + exp(-a(θ - b_k)))
 *
 * 能力估计: 期望后验估计 (EAP)
 * 题目选择: 最大 Fisher 信息量
 * 终止条件: SE < threshold 或达到最大题目数
 */

// ── IRT Item Parameters ──
export interface IRTItemParams {
  questionId: string;
  dimension: string;
  subDimension: string;
  a: number;         // discrimination (区分度), typically 0.5 - 2.5
  b: number[];       // difficulty thresholds for each category boundary
                     // For 4-level SJT: 3 thresholds [b1, b2, b3]
                     // For binary/single: 1 threshold [b1]
  contentArea: string; // scale reference for content balancing
}

// ── CAT State ──
export interface CATState {
  theta: number;           // current ability estimate
  se: number;              // standard error of estimate
  responses: { itemId: string; response: number; theta: number; se: number }[];
  administeredItems: Set<string>;
  itemsPerDimension: Record<string, number>;
  converged: boolean;
}

// ── Configuration ──
export interface CATConfig {
  maxItems: number;        // maximum items to administer
  minItems: number;        // minimum before stopping
  seThreshold: number;     // stop when SE < this
  thetaPriorMean: number;  // prior mean for EAP
  thetaPriorSD: number;    // prior SD
  contentBalance: boolean; // balance across sub-dimensions
}

export const DEFAULT_CAT_CONFIG: CATConfig = {
  maxItems: 20,
  minItems: 5,
  seThreshold: 0.35,
  thetaPriorMean: 0,
  thetaPriorSD: 1,
  contentBalance: true,
};

// ═══════════════════════════════════════
// Core IRT Functions (GRM)
// ═══════════════════════════════════════

/** Logistic function */
function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Cumulative probability P(X ≥ k | θ) for GRM
 * k ranges from 1 to K (number of categories)
 * P(X ≥ 0) = 1 (by convention)
 * P(X ≥ K+1) = 0
 */
function cumulativeProb(theta: number, a: number, b: number[], k: number): number {
  if (k <= 0) return 1;
  if (k > b.length) return 0;
  return logistic(a * (theta - b[k - 1]));
}

/**
 * Category probability P(X = k | θ) for GRM
 * k ranges from 0 to K (number of thresholds)
 */
export function categoryProb(theta: number, a: number, b: number[], k: number): number {
  return cumulativeProb(theta, a, b, k) - cumulativeProb(theta, a, b, k + 1);
}

/**
 * Fisher Information for a single item at theta
 * I(θ) = a² * Σ_k [P'(k)² / P(k)]
 */
export function fisherInformation(theta: number, item: IRTItemParams): number {
  const K = item.b.length; // number of thresholds
  let info = 0;

  for (let k = 0; k <= K; k++) {
    const pk = categoryProb(theta, item.a, item.b, k);
    if (pk <= 0.0001) continue;

    // Derivative of category probability w.r.t. theta
    const pStarK = cumulativeProb(theta, item.a, item.b, k);
    const pStarK1 = cumulativeProb(theta, item.a, item.b, k + 1);
    const dPk = item.a * (pStarK * (1 - pStarK) - pStarK1 * (1 - pStarK1));

    info += (dPk * dPk) / pk;
  }

  return info;
}

// ═══════════════════════════════════════
// Ability Estimation (EAP)
// ═══════════════════════════════════════

/**
 * Log-likelihood of observed responses given theta
 */
function logLikelihood(
  theta: number,
  responses: { item: IRTItemParams; response: number }[]
): number {
  let ll = 0;
  for (const { item, response } of responses) {
    const p = categoryProb(theta, item.a, item.b, response);
    ll += Math.log(Math.max(p, 1e-10));
  }
  return ll;
}

/**
 * Expected A Posteriori (EAP) estimation
 * Uses Gaussian quadrature over [-4, 4]
 */
export function estimateTheta(
  responses: { item: IRTItemParams; response: number }[],
  config: CATConfig = DEFAULT_CAT_CONFIG
): { theta: number; se: number } {
  const QUAD_POINTS = 41;
  const MIN_THETA = -4;
  const MAX_THETA = 4;
  const step = (MAX_THETA - MIN_THETA) / (QUAD_POINTS - 1);

  let numerator = 0;
  let denominator = 0;
  let numerator2 = 0;

  for (let i = 0; i < QUAD_POINTS; i++) {
    const q = MIN_THETA + i * step;

    // Log prior (normal distribution)
    const logPrior = -0.5 * Math.pow((q - config.thetaPriorMean) / config.thetaPriorSD, 2);

    // Log likelihood
    const ll = logLikelihood(q, responses);

    // Posterior (unnormalized, in log space for stability)
    const logPosterior = ll + logPrior;
    const posterior = Math.exp(logPosterior);

    numerator += q * posterior;
    numerator2 += q * q * posterior;
    denominator += posterior;
  }

  if (denominator === 0) {
    return { theta: config.thetaPriorMean, se: config.thetaPriorSD };
  }

  const theta = numerator / denominator;
  const variance = numerator2 / denominator - theta * theta;
  const se = Math.sqrt(Math.max(variance, 0.01));

  return { theta, se };
}

// ═══════════════════════════════════════
// Item Selection
// ═══════════════════════════════════════

/**
 * Select next item using Maximum Fisher Information
 * with optional content balancing
 */
export function selectNextItem(
  theta: number,
  itemBank: IRTItemParams[],
  administered: Set<string>,
  itemsPerDimension: Record<string, number>,
  config: CATConfig = DEFAULT_CAT_CONFIG
): IRTItemParams | null {
  const available = itemBank.filter(item => !administered.has(item.questionId));
  if (available.length === 0) return null;

  // Content balancing: slightly boost under-represented sub-dimensions
  const dimCounts = itemsPerDimension;
  const maxDimCount = Math.max(1, ...Object.values(dimCounts));

  let bestItem: IRTItemParams | null = null;
  let bestScore = -Infinity;

  for (const item of available) {
    let info = fisherInformation(theta, item);

    // Content balancing factor
    if (config.contentBalance) {
      const dimCount = dimCounts[item.subDimension] || 0;
      const balanceFactor = 1 + (maxDimCount - dimCount) * 0.1;
      info *= balanceFactor;
    }

    if (info > bestScore) {
      bestScore = info;
      bestItem = item;
    }
  }

  return bestItem;
}

// ═══════════════════════════════════════
// CAT Controller
// ═══════════════════════════════════════

/**
 * Initialize a new CAT session
 */
export function initCAT(config: CATConfig = DEFAULT_CAT_CONFIG): CATState {
  return {
    theta: config.thetaPriorMean,
    se: config.thetaPriorSD,
    responses: [],
    administeredItems: new Set(),
    itemsPerDimension: {},
    converged: false,
  };
}

/**
 * Process a response and update CAT state
 * Returns updated state with new theta/se estimates
 */
export function processResponse(
  state: CATState,
  itemBank: IRTItemParams[],
  itemId: string,
  response: number,
  config: CATConfig = DEFAULT_CAT_CONFIG
): CATState {
  const item = itemBank.find(i => i.questionId === itemId);
  if (!item) return state;

  // Build response history for estimation
  const responseHistory = [
    ...state.responses.map(r => ({
      item: itemBank.find(i => i.questionId === r.itemId)!,
      response: r.response,
    })),
    { item, response },
  ].filter(r => r.item);

  // Estimate new theta
  const { theta, se } = estimateTheta(responseHistory, config);

  // Update dimension counts
  const newDimCounts = { ...state.itemsPerDimension };
  newDimCounts[item.subDimension] = (newDimCounts[item.subDimension] || 0) + 1;

  // Check convergence
  const itemCount = state.responses.length + 1;
  const converged =
    (itemCount >= config.minItems && se < config.seThreshold) ||
    itemCount >= config.maxItems;

  return {
    theta,
    se,
    responses: [...state.responses, { itemId, response, theta, se }],
    administeredItems: new Set([...state.administeredItems, itemId]),
    itemsPerDimension: newDimCounts,
    converged,
  };
}

/**
 * Check if CAT should terminate
 */
export function shouldTerminate(state: CATState, config: CATConfig = DEFAULT_CAT_CONFIG): boolean {
  return state.converged || state.responses.length >= config.maxItems;
}

/**
 * Convert theta (-4 to 4) to a 0-100 percentile-like score
 * Uses normal CDF approximation
 */
export function thetaToScore(theta: number): number {
  // Approximate Φ(θ) using error function approximation
  const z = theta / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429;
  const erf = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  const phi = 0.5 * (1 + (theta >= 0 ? erf : -erf));
  return Math.round(phi * 100);
}

/**
 * Get confidence interval for theta
 */
export function getConfidenceInterval(theta: number, se: number, level: number = 0.95): [number, number] {
  const z = level === 0.95 ? 1.96 : level === 0.99 ? 2.576 : 1.645;
  return [theta - z * se, theta + z * se];
}
