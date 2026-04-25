import { describe, expect, it } from 'vitest'
import {
  analyzeKnowledgeQuery,
  buildFtsQuery,
  countOccurrences,
  detectCorpusCountIntent,
  extractSearchTerms,
} from '../query-analysis'
import { extractSearchKeywords } from '../../chat/knowledge-middleware'

describe('query-analysis', () => {
  it('extracts the exact corpus-count term from Chinese natural questions', () => {
    expect(detectCorpusCountIntent('莎一共被提及了几次？')).toEqual({ term: '莎', mode: 'mentions', wantsGrouping: false })
    expect(detectCorpusCountIntent('“莎”出现了多少次')).toEqual({ term: '莎', mode: 'mentions', wantsGrouping: false })
  })

  it('recognizes corpus-scale item counting and grouping questions', () => {
    expect(detectCorpusCountIntent('只言片语我一共写了多少篇，怎么去归类它们呢，从内容出发')).toEqual({
      term: '只言片语',
      mode: 'items',
      wantsGrouping: true,
    })

    const analysis = analyzeKnowledgeQuery('只言片语我一共写了多少篇，怎么去归类它们呢，从内容出发')
    expect(analysis.countIntent).toEqual({
      term: '只言片语',
      mode: 'items',
      wantsGrouping: true,
    })
    expect(analysis.searchText).toBe('只言片语')
    expect(analysis.wantsExhaustiveCoverage).toBe(true)
    expect(analysis.wantsCanonicalAnswer).toBe(true)
    expect(analysis.wantsClassification).toBe(true)
  })

  it('marks exhaustive and canonical requests for broader evidence gathering', () => {
    const analysis = analyzeKnowledgeQuery('请系统全面地梳理这个项目的整体架构，要求准确严谨')
    expect(analysis.wantsExhaustiveCoverage).toBe(true)
    expect(analysis.wantsCanonicalAnswer).toBe(true)
    expect(analysis.wantsClassification).toBe(false)
  })

  it('detects collection-level curation questions and preserves the collection anchor', () => {
    const analysis = analyzeKnowledgeQuery('你觉得哪一篇只言片语对现世与未来更有启发性与指引性？')
    expect(analysis.collectionIntent).toEqual({
      term: '只言片语',
      aspectTerms: ['现世', '未来', '启发', '指引'],
    })
    expect(analysis.searchText).toBe('只言片语')
    expect(analysis.searchTerms).toContain('只言片语')
    expect(analysis.relationEntities).toEqual([])
    expect(analysis.wantsExhaustiveCoverage).toBe(true)
    expect(analysis.wantsCanonicalAnswer).toBe(true)
  })

  it('keeps the collection anchor clean when the question starts with the collection name', () => {
    const analysis = analyzeKnowledgeQuery('只言片语对于现世与未来最有启发与引导性的是哪一篇？')
    expect(analysis.collectionIntent).toEqual({
      term: '只言片语',
      aspectTerms: ['现世', '未来', '启发', '引导'],
    })
    expect(analysis.searchText).toBe('只言片语')
    expect(analysis.searchTerms).toContain('只言片语')
  })

  it('detects autobiographical affection-discovery questions and expands search cues', () => {
    const analysis = analyzeKnowledgeQuery('我对哪一些人有过情愫？')
    expect(analysis.personalIntent).toEqual({
      subject: 'self',
      targetType: 'person',
      dimension: 'affection',
    })
    expect(analysis.searchText).toContain('喜欢')
    expect(analysis.searchTerms).toContain('情愫')
    expect(analysis.searchTerms).toContain('喜欢')
    expect(analysis.searchTerms).toContain('上头')
    expect(analysis.wantsExhaustiveCoverage).toBe(true)
    expect(analysis.wantsCanonicalAnswer).toBe(true)
  })

  it('detects broader autobiographical self-discovery questions instead of treating them as plain search', () => {
    const analysis = analyzeKnowledgeQuery('我最在乎什么，我的原则与底线是什么？')
    expect(analysis.personalIntent).toEqual({
      subject: 'self',
      targetType: 'self',
      dimension: 'value',
    })
    expect(analysis.searchTerms).toContain('价值观')
    expect(analysis.searchTerms).toContain('原则')
    expect(analysis.searchTerms).toContain('底线')
    expect(analysis.wantsExhaustiveCoverage).toBe(true)
    expect(analysis.wantsCanonicalAnswer).toBe(true)
  })

  it('reduces entity questions to the encyclopedia lookup term', () => {
    const analysis = analyzeKnowledgeQuery('莎是谁？')
    expect(analysis.searchText).toBe('莎')
    expect(analysis.searchTerms).toContain('莎')
    expect(analysis.searchTerms).not.toContain('莎是谁')
  })

  it('extracts both entities from relationship questions with short Chinese names', () => {
    const analysis = analyzeKnowledgeQuery('圆与莎什么关系')
    expect(analysis.relationEntities).toEqual(['圆', '莎'])
    expect(analysis.searchText).toBe('圆 莎')
    expect(analysis.searchTerms).toContain('圆')
    expect(analysis.searchTerms).toContain('莎')
    expect(analysis.searchTerms).not.toContain('与莎')
    expect(analysis.searchTerms).not.toContain('什么')
    expect(analysis.searchTerms).not.toContain('关系')
    expect(buildFtsQuery('圆与莎什么关系')).toContain('"圆"')
    expect(buildFtsQuery('圆与莎什么关系')).toContain('"莎"')
  })

  it('keeps mixed Chinese and English knowledge terms searchable', () => {
    const terms = extractSearchTerms('关于 Karpathy 工作流 的资料')
    expect(terms).toContain('Karpathy 工作流')
    expect(terms).toContain('Karpathy')
    expect(terms).toContain('工作流')
  })

  it('builds a focused FTS query instead of the full noisy sentence', () => {
    expect(buildFtsQuery('莎是谁？')).toBe('"莎"')
  })

  it('supports single-character mention counting and ascii case-insensitive counting', () => {
    expect(countOccurrences('莎莎莎', '莎')).toBe(3)
    expect(countOccurrences('Claude claude CLAUDE', 'claude')).toBe(3)
  })
})

describe('knowledge-middleware search keywords', () => {
  it('reuses the shared query analysis for natural-language prompts', () => {
    const keywords = extractSearchKeywords('请帮我查一下莎是谁')
    expect(keywords[0]).toBe('莎')
    expect(keywords).toContain('莎')
  })
})
