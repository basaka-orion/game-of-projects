import { describe, expect, it } from 'vitest';
import { buildQuestionTraceSnapshots } from '../question-trace';
import { getMatrixReasoningItems, scoreMatrixSession } from '../matrix-reasoning';
import type { MatrixResponse } from '../../types';

describe('question trace reconstruction', () => {
  it('reconstructs auditable traces from Human Map, dimension answers, CAT and matrix results', () => {
    const matrixItems = getMatrixReasoningItems();
    const matrixResponses: MatrixResponse[] = matrixItems.slice(0, 2).map((item, index) => ({
      itemId: item.id,
      selectedOptionId: index === 0 ? item.correctOptionId : item.options.find(option => option.id !== item.correctOptionId)!.id,
      correctOptionId: item.correctOptionId,
      isCorrect: index === 0,
      responseTimeMs: 1200 + index * 200,
      answeredAt: `2026-05-05T00:00:0${index}.000Z`,
    }));

    const traces = buildQuestionTraceSnapshots({
      storedSnapshots: {},
      humanMapMode: 'detailed',
      humanMapAnswers: {
        preferred_name: 'Boss',
        life_stage: '爆发前夜',
        current_issues: '稳定执行与代理人建模',
      },
      humanMapAIQuestions: [],
      humanMapBlueprint: null,
      answers: {
        personality: {
          per5: 4,
        },
      },
      catResponses: {
        cognitive: [{
          itemId: 'cat_cog3',
          response: 1,
          theta: 0.3,
          se: 0.42,
          selectedOptionValue: 'B',
          selectedOptionLabel: '48',
          answeredAt: '2026-05-05T00:01:00.000Z',
        }],
      },
      matrixResults: [scoreMatrixSession(matrixResponses, matrixItems, '2026-05-05T00:02:00.000Z')],
    });

    expect(traces.length).toBeGreaterThanOrEqual(7);
    expect(traces.some(trace => trace.moduleId === 'human_map')).toBe(true);
    expect(traces.some(trace => trace.moduleId === 'personality')).toBe(true);
    expect(traces.some(trace => trace.moduleId === 'cat:cognitive')).toBe(true);
    expect(traces.some(trace => trace.moduleId === 'matrix_reasoning')).toBe(true);
  });
});
