/**
 * AI Provider 单元测试
 * 验证 LLM 配置解析、角色配置解析、默认值回退等核心逻辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock store (避免实际 localStorage 访问)
vi.mock('../../db/store', () => {
  const store = new Map<string, string>()
  return {
    getSetting: (key: string, defaultVal: string = '') => store.get(key) ?? defaultVal,
    setSetting: (key: string, value: string) => store.set(key, value),
    __resetStore: () => store.clear(),
    __setStore: (key: string, value: string) => store.set(key, value),
  }
})

import { getDefaultConfig, getLLMConfig, resolveAgentConfig } from '../provider'
import { getSetting } from '../../db/store'

describe('AI Provider', () => {
  beforeEach(async () => {
    const mod = vi.mocked(await import('../../db/store')) as any
    mod.__resetStore()
  })

  describe('getDefaultConfig', () => {
    it('应该返回 DeepSeek 默认配置', () => {
      const config = getDefaultConfig('deepseek')
      expect(config.provider).toBe('deepseek')
      expect(config.baseUrl).toContain('deepseek.com')
      expect(config.model).toBe('deepseek-v4-flash')
    })

    it('应该返回 GLM 默认配置', () => {
      const config = getDefaultConfig('glm')
      expect(config.provider).toBe('glm')
      expect(config.model).toBe('glm-5.1')
    })

    it('应该返回 Ollama 默认配置', () => {
      const config = getDefaultConfig('ollama')
      expect(config.provider).toBe('ollama')
      expect(config.baseUrl).toContain('localhost:11434')
    })

    it('未知 provider 应回退到 deepseek', () => {
      const config = getDefaultConfig('unknown-provider')
      expect(config.provider).toBe('deepseek')
    })
  })

  describe('getLLMConfig', () => {
    it('无配置时应返回 deepseek 默认值', () => {
      const config = getLLMConfig()
      expect(config.provider).toBe('deepseek')
      expect(config.apiKey).toBe('')
    })

    it('应使用 store 中的配置', async () => {
      const mod = vi.mocked(await import('../../db/store')) as any
      mod.__setStore('llm_provider', 'glm')
      mod.__setStore('llm_api_key', 'test-key-123')
      mod.__setStore('llm_model', 'glm-4-plus')

      const config = getLLMConfig()
      expect(config.provider).toBe('glm')
      expect(config.apiKey).toBe('test-key-123')
      expect(config.model).toBe('glm-4-plus')
    })
  })

  describe('resolveAgentConfig', () => {
    it('无角色配置时应回退到全局配置', () => {
      const config = resolveAgentConfig('strategist')
      // 无角色专属配置，等于全局默认
      expect(config.provider).toBe('deepseek')
    })

    it('有角色专属配置时应用角色配置', async () => {
      const mod = vi.mocked(await import('../../db/store')) as any
      mod.__setStore('agent_strategist_provider', 'minimax')
      mod.__setStore('agent_strategist_api_key', 'agent-key')
      mod.__setStore('agent_strategist_model', 'minimax-M2.7')

      const config = resolveAgentConfig('strategist')
      expect(config.provider).toBe('minimax')
      expect(config.apiKey).toBe('agent-key')
      expect(config.model).toBe('minimax-M2.7')
    })
  })
})
