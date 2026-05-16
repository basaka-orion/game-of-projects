import { describe, expect, it } from 'vitest'
import { classifyWorldExplorationSignal, getWorldExplorationModeDefinition } from '../world-radar'

describe('world exploration radar', () => {
  it('respects explicit exploration mode metadata', () => {
    const signal = classifyWorldExplorationSignal({
      title: '外部来源',
      content: '这条来源本身不明显。',
      metadata: { explorationMode: 'serendipity' },
    })

    expect(signal.mode).toBe('serendipity')
    expect(signal.reviewRequired).toBe(true)
    expect(signal.reason).toContain('元数据')
  })

  it('classifies contrarian and adjacent world signals', () => {
    const contrarian = classifyWorldExplorationSignal({
      title: '失败预演：Openbasaka 为什么会过拟合 Boss 偏好',
      content: '这是一份反证和盲点清单。',
    })
    const adjacent = classifyWorldExplorationSignal({
      title: '生物学范式映射到产品策略',
      content: '跨界迁移与类比框架。',
    })

    expect(contrarian.mode).toBe('contrarian')
    expect(contrarian.bossProfileImpact).toBe('high')
    expect(adjacent.mode).toBe('adjacent')
    expect(adjacent.bossProfileImpact).toBe('medium')
  })

  it('keeps the four required modes available to UI surfaces', () => {
    expect((['aligned', 'adjacent', 'contrarian', 'serendipity'] as const).map(getWorldExplorationModeDefinition)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'aligned', label: '贴合当前目标' }),
        expect.objectContaining({ id: 'adjacent', label: '相邻迁移' }),
        expect.objectContaining({ id: 'contrarian', label: '反共识挑战' }),
        expect.objectContaining({ id: 'serendipity', label: '随机奇遇' }),
      ]),
    )
  })
})
