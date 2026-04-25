import { describe, expect, it } from 'vitest'
import {
  extractAffectionTargets,
  rankPersonalDiscoveryItems,
  rankPersonalAffectionItems,
  scorePersonalDiscoveryEvidence,
  scorePersonalAffectionEvidence,
} from '../personal-evidence'

describe('personal-evidence', () => {
  it('extracts explicit named affection targets from direct confession notes', () => {
    const targets = extractAffectionTargets(
      '✉️我亲爱的小笨蛋：',
      '杨弘，我喜欢你。我希望那时你还能在我身边。',
      ['圆', '阿圆'],
    )

    expect(targets).toContain('杨弘')
  })

  it('extracts repeated counterpart names from romantic narrative around the self alias', () => {
    const targets = extractAffectionTargets(
      '“圆，能帮我吹个头发吗？”',
      '圆看着镜子里的莎宝，吻了下去。莎，我想你。',
      ['圆', '阿圆'],
    )

    expect(targets.some(name => name.includes('莎'))).toBe(true)
  })

  it('scores generic relationship advice lower than direct personal confession', () => {
    const direct = scorePersonalAffectionEvidence(
      '我喜欢你，跟我在一起交往吧。',
      '我喜欢你，跟我在一起交往吧。我用余生去保护你。',
      ['圆', '阿圆'],
    )
    const generic = scorePersonalAffectionEvidence(
      '一个真正喜欢你的人，即使在跟你语音聊天时...',
      '一个真正喜欢你的人，即使在跟你语音聊天时，你的状态是懒洋洋的，她也会很开心。',
      ['圆', '阿圆'],
    )

    expect(direct.explicitConfessionHits).toBeGreaterThan(0)
    expect(direct.score).toBeGreaterThan(generic.score)
    expect(generic.isGenericAdvice).toBe(true)
  })

  it('keeps named and direct emotional records while filtering generic pages', () => {
    const items = [
      {
        title: '✉️我亲爱的小笨蛋：',
        text: '杨弘，我喜欢你。我希望那时你还能在我身边。',
        importance: 90,
      },
      {
        title: '其实，与其说上头，还不如说，大胆又实际地为彼此创造机会。',
        text: '我喜欢阿芳的性格，阿芳的努力，阿芳的耐心以及阿芳的率真。',
        importance: 80,
      },
      {
        title: '一个真正喜欢你的人，即使在跟你语音聊天时...',
        text: '一个真正喜欢你的人，即使在跟你语音聊天时，她也会很开心。',
        importance: 95,
      },
    ]

    const ranked = rankPersonalAffectionItems(items, {
      getTitle: item => item.title,
      getText: item => item.text,
      getSearchScore: item => item.importance,
      selfAliases: ['圆', '阿圆'],
    })

    expect(ranked.map(item => item.title)).toEqual([
      '✉️我亲爱的小笨蛋：',
      '其实，与其说上头，还不如说，大胆又实际地为彼此创造机会。',
    ])
  })

  it('extracts first-person values while suppressing generic moralizing pages', () => {
    const direct = scorePersonalDiscoveryEvidence(
      'value',
      '我真正看重什么',
      '我最在乎的是信任、真诚和长期主义。这是我的原则。',
      ['圆', '阿圆'],
    )
    const generic = scorePersonalDiscoveryEvidence(
      'value',
      '任何人都应该善良',
      '这个社会需要价值观，每个人都应该真诚。',
      ['圆', '阿圆'],
    )

    expect(direct.explicitSignalHits).toBeGreaterThan(0)
    expect(direct.firstPersonHits).toBeGreaterThan(0)
    expect(direct.score).toBeGreaterThan(generic.score)
    expect(generic.isGenericAdvice).toBe(true)
  })

  it('ranks self-discovery records ahead of generic advice for non-affection dimensions', () => {
    const items = [
      {
        title: '我真正看重什么',
        text: '我最在乎的是信任、真诚和长期主义。这是我的原则。',
        importance: 88,
      },
      {
        title: '任何人都应该善良',
        text: '这个社会需要价值观，每个人都应该真诚。',
        importance: 95,
      },
      {
        title: '我的底线',
        text: '我不接受反复失信，这是我的底线。',
        importance: 84,
      },
    ]

    const ranked = rankPersonalDiscoveryItems(items, 'value', {
      getTitle: item => item.title,
      getText: item => item.text,
      getSearchScore: item => item.importance,
      selfAliases: ['圆', '阿圆'],
    })

    expect(ranked.map(item => item.title)).toEqual([
      '我真正看重什么',
      '我的底线',
    ])
  })
})
