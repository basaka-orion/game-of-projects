import { describe, expect, it } from 'vitest';
import { CAT_ITEM_BANK, getCATDimensionItemBank } from '../../data/item-bank';
import { catModules } from '../../data/cat-questions';

describe('CAT item bank coverage', () => {
  it('covers every CAT module, including character strengths', () => {
    const moduleIds = catModules.map(module => module.id);
    const bankDimensions = new Set(CAT_ITEM_BANK.map(item => item.dimension));

    for (const moduleId of moduleIds) {
      expect(bankDimensions.has(moduleId)).toBe(true);
    }

    expect(getCATDimensionItemBank('strengths')).toHaveLength(24);
  });

  it('keeps CAT item ids aligned with the CAT question modules', () => {
    const questionIds = new Set(catModules.flatMap(module => module.questions.map(question => question.id)));
    const missing = CAT_ITEM_BANK.map(item => item.questionId).filter(itemId => !questionIds.has(itemId));

    expect(missing).toEqual([]);
  });
});
