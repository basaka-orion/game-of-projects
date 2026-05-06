import { describe, expect, it } from 'vitest';
import {
  MATRIX_LAB_VERSION,
  getMatrixReasoningItems,
  scoreMatrixSession,
} from '../matrix-reasoning';
import type { MatrixResponse } from '../../types';

describe('original matrix reasoning engine', () => {
  it('generates original matrix items with answer keys and six options', () => {
    const items = getMatrixReasoningItems();

    expect(items.length).toBeGreaterThanOrEqual(6);
    expect(new Set(items.map(item => item.id)).size).toBe(items.length);

    for (const item of items) {
      expect(item.version).toBe(MATRIX_LAB_VERSION);
      expect(item.sourceType).toBe('original');
      expect(item.ruleDsl.length).toBeGreaterThan(10);
      expect(item.options).toHaveLength(6);
      expect(item.options.some(option => option.id === item.correctOptionId)).toBe(true);
      expect(item.measurementNotes.join(' ')).toMatch(/原创|不复制|不对应/);
      expect(item.measurementNotes.join(' ')).not.toMatch(/APM\s*\d+/i);
      expect(item.matrix).toHaveLength(9);
      expect(item.matrix[8]).toBeNull();
    }
  });

  it('scores accuracy, difficulty weighting, rule breakdown and confidence interval', () => {
    const items = getMatrixReasoningItems();
    const responses: MatrixResponse[] = items.map((item, index) => ({
      itemId: item.id,
      selectedOptionId: index % 2 === 0 ? item.correctOptionId : item.options.find(option => option.id !== item.correctOptionId)?.id || item.correctOptionId,
      correctOptionId: item.correctOptionId,
      isCorrect: index % 2 === 0,
      responseTimeMs: 1200 + index * 250,
      answeredAt: '2026-05-05T00:00:00.000Z',
    }));

    const result = scoreMatrixSession(responses, items, '2026-05-05T00:05:00.000Z');

    expect(result.rawScore).toBe(Math.ceil(items.length / 2));
    expect(result.maxScore).toBe(items.length);
    expect(result.accuracy).toBeGreaterThan(0);
    expect(result.difficultyWeightedScore).toBeGreaterThan(0);
    expect(result.ruleBreakdown.length).toBeGreaterThan(3);
    expect(result.confidenceInterval[0]).toBeLessThanOrEqual(result.confidenceInterval[1]);
    expect(result.pendingVerification.join(' ')).toContain('不能换算 Raven APM');
  });
});
