import { describe, expect, it } from 'vitest'
import { parseToolCall } from '../index'

describe('parseToolCall', () => {
  it('parses complete XML tool calls', () => {
    expect(parseToolCall('<tool_call id="web_search">{"query":"OpenAI latest news","max_results":3}</tool_call>')).toEqual({
      tool: 'web_search',
      params: { query: 'OpenAI latest news', max_results: 3 },
    })
  })

  it('tolerates partial XML and incomplete max_results emitted by the model', () => {
    expect(parseToolCall('<tool_call id="web_search">\n{"query": "OpenAI latest news May 2026", "max_results": }\n</tool_call')).toEqual({
      tool: 'web_search',
      params: { query: 'OpenAI latest news May 2026', max_results: 5 },
    })
  })
})
