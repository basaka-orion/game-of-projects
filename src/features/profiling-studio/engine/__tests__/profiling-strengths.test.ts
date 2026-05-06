import { describe, expect, it } from 'vitest';
import { classifyTrait } from '../profiling';

describe('profiling strengths traits', () => {
  it('classifies VIA character strength subdimensions instead of leaving them unidentified', () => {
    const verdict = classifyTrait('creativity', '创造力', [{
      sourceType: 'cat',
      itemId: 'cat_str1',
      itemLabel: '品格优势 CAT',
      observation: '经 3 题自适应后，theta=0.8',
      confidence: 0.76,
    }]);

    expect(verdict.typology).not.toBe('待识别');
    expect(verdict.flowZone).not.toBe('—');
    expect(verdict.evidenceSources).toHaveLength(1);
  });
});
