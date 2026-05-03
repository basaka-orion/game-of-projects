import { describe, expect, it } from 'vitest'

import {
  buildRealtimeSearchQueries,
  filterRealtimeSearchItemsForFreshness,
  formatGroundedSearchPrompt,
  needsRealtimeGrounding,
  normalizeRealtimeSearchItems,
  resolveRealtimeFreshnessWindow,
  stripToolCallArtifacts,
} from '../realtime-grounding'

describe('realtime grounding helpers', () => {
  it('treats today/latest AI questions as mandatory grounded questions', () => {
    expect(needsRealtimeGrounding('今日有什么惊艳的ai')).toBe(true)
    expect(needsRealtimeGrounding('最新 AI 前沿动态')).toBe(true)
  })

  it('builds stronger AI news queries instead of only searching the raw Chinese question', () => {
    const queries = buildRealtimeSearchQueries('今日有什么惊艳的ai', new Date('2026-04-26T00:00:00Z'))
    expect(queries.length).toBeGreaterThan(1)
    expect(queries.join(' ')).toContain('latest AI breakthroughs')
    expect(queries.join(' ')).toContain('2026')
    expect(queries.join(' ')).toContain('past 7 days')
  })

  it('normalizes Brave-style search results into source cards', () => {
    const items = normalizeRealtimeSearchItems(
      [{ title: '<b>OpenAI</b> news', url: 'https://openai.com/news', description: '  hello   world ', age: '2 days ago' }],
      { endpoint: 'news', date: new Date('2026-04-26T00:00:00Z') },
    )
    expect(items[0]).toMatchObject({
        title: 'OpenAI news',
        url: 'https://openai.com/news',
        description: 'hello world',
        age: '2 days ago',
        ageDays: 2,
        endpoint: 'news',
        sourceTier: 'official',
      })
  })

  it('keeps realtime news inside the freshness window', () => {
    const freshnessWindow = resolveRealtimeFreshnessWindow('今日有什么惊艳的ai')
    const items = normalizeRealtimeSearchItems(
      [
        { title: 'Fresh item', url: 'https://techcrunch.com/fresh', description: '', age: '1 day ago' },
        { title: 'Old item', url: 'https://techcrunch.com/old', description: '', age: '2 months ago' },
        { title: 'Undated item', url: 'https://techcrunch.com/unknown', description: '' },
      ],
      { endpoint: 'news', date: new Date('2026-04-26T00:00:00Z') },
    )

    expect(filterRealtimeSearchItemsForFreshness(items, freshnessWindow, new Date('2026-04-26T00:00:00Z'))).toEqual([
      expect.objectContaining({ title: 'Fresh item' }),
    ])
  })

  it('tells the model not to use old months as current news', () => {
    const freshnessWindow = resolveRealtimeFreshnessWindow('今日有什么惊艳的ai')
    const prompt = formatGroundedSearchPrompt({
      todayLabel: '2026/04/26',
      freshnessWindow,
      queries: ['latest AI news past 7 days'],
      results: [
        {
          title: 'Fresh AI news',
          url: 'https://techcrunch.com/fresh',
          description: 'fresh',
          age: '1 day ago',
          ageDays: 1,
          endpoint: 'news',
          sourceTier: 'tech-news',
        },
      ],
    })

    expect(prompt).toContain('最近 7 天')
    expect(prompt).toContain('不要把 2 月、3 月')
  })

  it('removes fake tool-call artifacts from model output', () => {
    const clean = stripToolCallArtifacts(
      '我来搜\n<tool_call: web_search>\n{"query":"AI","max_results":10}\n</tool_call_use>\n结果如下',
    )
    expect(clean).toBe('我来搜\n\n结果如下')
  })
})
