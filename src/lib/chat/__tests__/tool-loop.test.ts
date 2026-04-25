/**
 * Tool Loop 单元测试
 * 验证 ReAct 循环的工具调用解析逻辑和 buildToolPrompt
 */
import { describe, it, expect } from 'vitest'
import { buildToolPrompt } from '../tool-loop'

describe('Tool Loop', () => {
  describe('buildToolPrompt', () => {
    it('空 skill 列表应返回空字符串', async () => {
      const result = await buildToolPrompt([])
      expect(result).toBe('')
    })

    it('不存在的 skill ID 应返回空字符串', async () => {
      const result = await buildToolPrompt(['nonexistent-skill-id-123'])
      expect(result).toBe('')
    })
  })
})

describe('Tool Call Regex', () => {
  // 验证工具调用正则匹配逻辑
  const TOOL_CALL_REGEX = /`?tool_call:(\w+(?:-\w+)*)\((.*?)\)`?/gs

  it('应匹配标准格式 tool_call:skill(args)', () => {
    const text = '我来搜索一下 tool_call:web-search("量子计算")'
    const matches = [...text.matchAll(TOOL_CALL_REGEX)]
    expect(matches).toHaveLength(1)
    expect(matches[0][1]).toBe('web-search')
    expect(matches[0][2]).toBe('"量子计算"')
  })

  it('应匹配带反引号格式', () => {
    const text = '`tool_call:kb-search("AI 趋势")`'
    const matches = [...text.matchAll(TOOL_CALL_REGEX)]
    expect(matches).toHaveLength(1)
    expect(matches[0][1]).toBe('kb-search')
  })

  it('应匹配多个工具调用', () => {
    const text = 'tool_call:search("A") 然后 tool_call:analyze("B")'
    const matches = [...text.matchAll(TOOL_CALL_REGEX)]
    expect(matches).toHaveLength(2)
  })

  it('不含工具调用时应无匹配', () => {
    const text = '这是一段普通的 AI 回复，不包含任何工具调用。'
    const matches = [...text.matchAll(TOOL_CALL_REGEX)]
    expect(matches).toHaveLength(0)
  })

  // JSON 格式工具调用
  const TOOL_CALL_JSON_REGEX = /\{"tool_call"\s*:\s*\{"id"\s*:\s*"([^"]+)"\s*,\s*"args"\s*:\s*"([^"]*)"\s*\}\}/g

  it('应匹配 JSON 格式工具调用', () => {
    const text = '{"tool_call":{"id":"web-search","args":"量子计算最新进展"}}'
    const matches = [...text.matchAll(TOOL_CALL_JSON_REGEX)]
    expect(matches).toHaveLength(1)
    expect(matches[0][1]).toBe('web-search')
    expect(matches[0][2]).toBe('量子计算最新进展')
  })
})
