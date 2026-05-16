import { describe, expect, it } from 'vitest';
import { CAT_DIMENSION_IDS, backfillCATRunFromResponses, getCATCoverageStatus } from '../cat-status';
import type { CATResponse } from '../../types';

function response(itemId: string): CATResponse {
  return {
    itemId,
    response: 1,
    theta: 0.2,
    se: 0.4,
    answeredAt: '2026-05-08T01:00:00.000Z',
  };
}

describe('CAT coverage status', () => {
  it('backfills legacy dimension responses without pretending coverage is complete', () => {
    const legacy = {
      cognitive: [response('cat_cog3')],
      personality: [response('cat_per1')],
      emotion: [response('cat_emo1')],
      motivation: [response('cat_val1')],
      social: [response('cat_soc1')],
    };

    const status = getCATCoverageStatus(legacy);

    expect(status.source).toBe('legacy-responses');
    expect(status.coveredCount).toBe(5);
    expect(status.totalDimensions).toBe(CAT_DIMENSION_IDS.length);
    expect(status.complete).toBe(false);
    expect(status.missingDimensions).toEqual(expect.arrayContaining(['aesthetic', 'worldview', 'strengths']));
  });

  it('treats all eight dimensions as complete when legacy responses cover them all', () => {
    const legacy = Object.fromEntries(CAT_DIMENSION_IDS.map(dimensionId => [dimensionId, [response(`cat_${dimensionId}_sample`)]]));
    const run = backfillCATRunFromResponses(legacy);
    const status = getCATCoverageStatus(legacy);

    expect(run?.coveredDimensions).toHaveLength(CAT_DIMENSION_IDS.length);
    expect(status.coveredCount).toBe(CAT_DIMENSION_IDS.length);
    expect(status.complete).toBe(true);
  });
});
