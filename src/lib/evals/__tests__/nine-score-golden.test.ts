import { describe, expect, it } from 'vitest'
import { runNineScoreGoldenEvals } from '../nine-score-golden'

describe('nine-score golden evals', () => {
  it('keeps the external-brain critical paths above the regression floor', () => {
    const results = runNineScoreGoldenEvals()
    const failed = results.filter((result) => !result.passed)

    expect(results.map((result) => result.id)).toEqual([
      'knowledge.collection-count',
      'knowledge.self-anchor-relation',
      'knowledge.personal-affection',
      'knowledge.personal-values',
      'qimeng.archive-routing',
      'boss.context-targets',
      'agent.execution-learning',
      'sandbox.daily-brief',
      'sandbox.project-neural-network',
    ])
    expect(failed).toEqual([])
  })
})
