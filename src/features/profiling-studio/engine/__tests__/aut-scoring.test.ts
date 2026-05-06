import { describe, expect, it } from 'vitest';
import { scoreCreativeOpenResponse } from '../aut-scoring';

describe('AUT open response scoring', () => {
  it('scores fluency, flexibility and category for open creative answers', () => {
    const result = scoreCreativeOpenResponse(`
      作为临时支架固定一盏灯；
      拆开后做一个影子装置；
      用它设计一个课堂互动游戏；
      在野外作为求救标记；
      变成流程卡片的分类标签。
    `);

    expect(result.fluency).toBeGreaterThanOrEqual(5);
    expect(result.flexibility).toBeGreaterThanOrEqual(3);
    expect(result.category).toBeGreaterThanOrEqual(2);
    expect(result.notes.join(' ')).toContain('AUT 开放题');
  });

  it('keeps sparse answers in a low category', () => {
    const result = scoreCreativeOpenResponse('不知道，随便用。');

    expect(result.fluency).toBeLessThanOrEqual(1);
    expect(result.category).toBeLessThanOrEqual(1);
  });
});
