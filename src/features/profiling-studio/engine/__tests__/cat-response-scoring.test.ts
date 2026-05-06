import { describe, expect, it } from 'vitest';
import { scoreCATOption, labelCATOption } from '../cat-response-scoring';
import type { IRTItemParams } from '../irt';
import type { Question } from '../../types';

const binaryItem: IRTItemParams = {
  questionId: 'cat_cog3',
  dimension: 'cognitive',
  subDimension: 'fluid_reasoning',
  a: 1.5,
  b: [0.4],
  contentArea: 'ICAR',
};

const sjtItem: IRTItemParams = {
  questionId: 'cat_per5',
  dimension: 'personality',
  subDimension: 'conscientiousness',
  a: 1.3,
  b: [-0.5, 0, 0.5],
  contentArea: 'IPIP-NEO',
};

describe('CAT response scoring', () => {
  it('scores objective A/B/C/D options as correct or incorrect instead of collapsing to zero', () => {
    const question: Question = {
      id: 'cat_cog3',
      text: '规律填空',
      type: 'single',
      dimension: 'cognitive',
      correct: 'B',
      options: [
        { value: 'A', label: '44' },
        { value: 'B', label: '48' },
      ],
    };

    expect(scoreCATOption(question, binaryItem, 'B')).toBe(1);
    expect(scoreCATOption(question, binaryItem, 'A')).toBe(0);
    expect(labelCATOption(question, 'B')).toBe('48');
  });

  it('maps ordered SJT choices into GRM categories', () => {
    expect(scoreCATOption(null, sjtItem, 1)).toBe(0);
    expect(scoreCATOption(null, sjtItem, 4)).toBe(3);
    expect(scoreCATOption(null, sjtItem, 5)).toBe(3);
  });
});
