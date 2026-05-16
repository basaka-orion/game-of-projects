import { CAT_ITEM_BANK } from '../data/item-bank';
import type { CATCoverageStatus, CATAssessmentRun, CATResponse, CATScope } from '../types';
import type { CATState, IRTItemParams } from './irt';

export const CAT_DIMENSION_IDS = Array.from(new Set(CAT_ITEM_BANK.map(item => item.dimension)));

function precisionFromSe(se: number, thetaPriorSD: number): number {
  if (!Number.isFinite(se) || thetaPriorSD <= 0) return 0;
  return Math.min(99, Math.max(0, Math.round((1 - se / thetaPriorSD) * 100)));
}

function groupResponsesByDimension(
  responses: CATResponse[],
  itemBank: IRTItemParams[] = CAT_ITEM_BANK,
): Record<string, CATResponse[]> {
  const itemLookup = new Map(itemBank.map(item => [item.questionId, item.dimension]));
  return responses.reduce<Record<string, CATResponse[]>>((groups, response) => {
    const dimensionId = itemLookup.get(response.itemId);
    if (!dimensionId) return groups;
    groups[dimensionId] = [...(groups[dimensionId] || []), response];
    return groups;
  }, {});
}

function uniqueDimensionsFromResponses(catResponses: Record<string, CATResponse[]>): string[] {
  return CAT_DIMENSION_IDS.filter(dimensionId => (catResponses[dimensionId]?.length || 0) > 0);
}

export function buildCATAssessmentRun(input: {
  scope: CATScope;
  dimensionId?: string;
  state: CATState;
  responses: CATResponse[];
  itemBank?: IRTItemParams[];
  maxItems: number;
  thetaPriorSD: number;
  completedAt?: string;
  durationMs?: number;
}): CATAssessmentRun {
  const completedAt = input.completedAt || new Date().toISOString();
  const responsesByDimension = groupResponsesByDimension(input.responses, input.itemBank || CAT_ITEM_BANK);
  const coveredDimensions = input.scope === 'dimension' && input.dimensionId
    ? [input.dimensionId]
    : CAT_DIMENSION_IDS.filter(dimensionId => (responsesByDimension[dimensionId]?.length || 0) > 0);
  const requiredDimensions = input.scope === 'dimension' && input.dimensionId ? [input.dimensionId] : CAT_DIMENSION_IDS;
  const missingDimensions = requiredDimensions.filter(dimensionId => !coveredDimensions.includes(dimensionId));

  return {
    id: `cat-run-${input.scope}-${completedAt.replace(/[^0-9]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 7)}`,
    scope: input.scope,
    dimensionId: input.dimensionId,
    answeredCount: input.responses.length,
    maxItems: input.maxItems,
    coveredDimensions,
    missingDimensions,
    precision: precisionFromSe(input.state.se, input.thetaPriorSD),
    theta: input.state.theta,
    se: input.state.se,
    converged: input.state.converged,
    durationMs: input.durationMs || 0,
    responsesByDimension,
    completedAt,
  };
}

export function backfillCATRunFromResponses(
  catResponses: Record<string, CATResponse[]>,
  completedAt?: string,
): CATAssessmentRun | null {
  const coveredDimensions = uniqueDimensionsFromResponses(catResponses);
  const allResponses = Object.values(catResponses).flat();
  if (coveredDimensions.length === 0 || allResponses.length === 0) return null;

  const latestResponse = [...allResponses]
    .sort((left, right) => (right.answeredAt || '').localeCompare(left.answeredAt || ''))[0];
  const lastTheta = latestResponse?.theta ?? 0;
  const lastSe = latestResponse?.se ?? 1;

  return {
    id: `cat-run-legacy-${completedAt || latestResponse?.answeredAt || 'unknown'}`,
    scope: 'full',
    answeredCount: allResponses.length,
    maxItems: 24,
    coveredDimensions,
    missingDimensions: CAT_DIMENSION_IDS.filter(dimensionId => !coveredDimensions.includes(dimensionId)),
    precision: precisionFromSe(lastSe, 1),
    theta: lastTheta,
    se: lastSe,
    converged: coveredDimensions.length >= CAT_DIMENSION_IDS.length,
    durationMs: 0,
    responsesByDimension: catResponses,
    completedAt: completedAt || latestResponse?.answeredAt || new Date().toISOString(),
  };
}

export function getCATCoverageStatus(
  catResponses: Record<string, CATResponse[]>,
  catRuns: CATAssessmentRun[] = [],
): CATCoverageStatus {
  const latestRun = [...catRuns].sort((left, right) => right.completedAt.localeCompare(left.completedAt))[0];
  const latestFullRun = [...catRuns]
    .filter(run => run.scope === 'full')
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))[0];
  const runForCoverage = latestFullRun || latestRun;

  if (runForCoverage) {
    const coveredDimensions = CAT_DIMENSION_IDS.filter(dimensionId => runForCoverage.coveredDimensions.includes(dimensionId));
    const missingDimensions = CAT_DIMENSION_IDS.filter(dimensionId => !coveredDimensions.includes(dimensionId));
    return {
      totalDimensions: CAT_DIMENSION_IDS.length,
      coveredDimensions,
      missingDimensions,
      coveredCount: coveredDimensions.length,
      latestRun,
      latestFullRun,
      latestAnsweredCount: runForCoverage.answeredCount,
      latestMaxItems: runForCoverage.maxItems,
      latestPrecision: runForCoverage.precision,
      complete: missingDimensions.length === 0,
      source: 'run',
    };
  }

  const legacyRun = backfillCATRunFromResponses(catResponses);
  if (legacyRun) {
    return {
      totalDimensions: CAT_DIMENSION_IDS.length,
      coveredDimensions: legacyRun.coveredDimensions,
      missingDimensions: legacyRun.missingDimensions,
      coveredCount: legacyRun.coveredDimensions.length,
      latestRun: legacyRun,
      latestFullRun: legacyRun,
      latestAnsweredCount: legacyRun.answeredCount,
      latestMaxItems: legacyRun.maxItems,
      latestPrecision: legacyRun.precision,
      complete: legacyRun.missingDimensions.length === 0,
      source: 'legacy-responses',
    };
  }

  return {
    totalDimensions: CAT_DIMENSION_IDS.length,
    coveredDimensions: [],
    missingDimensions: CAT_DIMENSION_IDS,
    coveredCount: 0,
    latestAnsweredCount: 0,
    latestMaxItems: 24,
    latestPrecision: 0,
    complete: false,
    source: 'empty',
  };
}
