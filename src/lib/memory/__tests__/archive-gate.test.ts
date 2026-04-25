import { describe, expect, it } from 'vitest'
import { formatArchivePath, previewQimengArchive, shouldOfferArchiveTag } from '../archive-gate'

describe('archive gate', () => {
  it('does not offer archive tag for welcome or short/error messages', () => {
    expect(shouldOfferArchiveTag({ id: 'welcome', role: 'assistant', content: '欢迎来到 BASAKA' })).toBe(false)
    expect(shouldOfferArchiveTag({ id: 'err-1', role: 'assistant', content: '⚠️ 连接失败' })).toBe(false)
    expect(shouldOfferArchiveTag({ id: 'm1', role: 'user', content: '太短了' })).toBe(false)
  })

  it('classifies system-evolution conversations into the openbasaka wing', () => {
    const suggestion = previewQimengArchive(
      {
        content: '我想把记忆宫殿和 openbasaka 做成一个真正长期成长的个人智能系统，让点击标签后再归档成为全局规则。',
      },
      'technical',
    )

    expect(suggestion.wing).toBe('openbasaka')
    expect(suggestion.hall).toBe('technical')
    expect(suggestion.room).toBe('项目-个人智能系统')
    expect(formatArchivePath(suggestion)).toContain('系统演化')
  })

  it('routes profiling language into the profiling wing', () => {
    const suggestion = previewQimengArchive({
      content: '画像工坊里最终的全部测试，是我探索与认知这个世界的指导方向。',
    })

    expect(suggestion.wing).toBe('profiling')
    expect(suggestion.room).toBe('画像工坊-阶段信号')
    expect(suggestion.facets).toContain('fact')
  })

  it('routes worldview reflections into worldview and consciousness', () => {
    const suggestion = previewQimengArchive({
      content: '我对这个世界、社会与技术时代之间关系的判断，正在慢慢形成稳定世界模型。',
    })

    expect(suggestion.wing).toBe('worldview')
    expect(suggestion.hall).toBe('consciousness')
    expect(suggestion.room).toBe('世界观-时代判断')
  })
})
