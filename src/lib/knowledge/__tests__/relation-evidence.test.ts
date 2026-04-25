import { describe, expect, it } from 'vitest'
import { rankAndFilterRelationItems, scoreRelationEvidence } from '../relation-evidence'

describe('relation-evidence', () => {
  it('keeps relationship-cluster notes while excluding noisy single-name matches', () => {
    const items = [
      {
        title: '“圆，能帮我吹个头发吗？”',
        text: '圆宠溺地帮莎吹头发，两人亲密拥吻，圆说莎是自己的。',
        score: 90,
      },
      {
        title: '希望你现在是睡眠模式啦，莎^_^～',
        text: '我很喜欢你，也信任我们俩的陪伴与相互扶持。',
        score: 70,
      },
      {
        title: '莎，还记得我之前是如何去定义直觉的嘛？',
        text: '这是一种能力哦，莎。因为有莎宝之前的历练与觉悟。',
        score: 60,
      },
      {
        title: '韩莎莎, 手机号码: 185...',
        text: '所在地区: 新疆，详细地址: 中亚南路334号。',
        score: 80,
      },
      {
        title: '4-14',
        text: '2030年的圆依然会让自己更睿智。',
        score: 50,
      },
    ]

    const filtered = rankAndFilterRelationItems(items, ['圆', '莎'], {
      getTitle: item => item.title,
      getText: item => item.text,
      getSearchScore: item => item.score,
    })

    expect(filtered.map(item => item.title)).toEqual([
      '“圆，能帮我吹个头发吗？”',
      '希望你现在是睡眠模式啦，莎^_^～',
      '莎，还记得我之前是如何去定义直觉的嘛？',
    ])
  })

  it('treats one entity as the self anchor and keeps target-centric relationship clues', () => {
    const items = [
      {
        title: '希望你现在是睡眠模式啦，莎^_^～',
        text: '我很喜欢你，也信任我们俩的陪伴与相互扶持。',
        score: 70,
      },
      {
        title: '4-14',
        text: '2030年的圆依然会让自己更睿智。',
        score: 90,
      },
    ]

    const filtered = rankAndFilterRelationItems(items, ['圆', '莎'], {
      getTitle: item => item.title,
      getText: item => item.text,
      getSearchScore: item => item.score,
      selfAliases: ['圆', '阿圆'],
    })

    expect(filtered.map(item => item.title)).toEqual(['希望你现在是睡眠模式啦，莎^_^～'])
  })

  it('gives higher scores to full-coverage anchor evidence than noisy mentions', () => {
    const anchor = scoreRelationEvidence(
      '莎，我是圆',
      '我喜欢你，也信任我们俩未来的陪伴。',
      ['圆', '莎'],
    )
    const noise = scoreRelationEvidence(
      '韩莎莎, 手机号码: 185...',
      '所在地区: 新疆，详细地址: 中亚南路334号。',
      ['圆', '莎'],
    )

    expect(anchor.fullCoverage).toBe(true)
    expect(noise.fullCoverage).toBe(false)
    expect(anchor.relationScore).toBeGreaterThan(noise.relationScore)
    expect(noise.cueHits).toBe(0)
  })
})
