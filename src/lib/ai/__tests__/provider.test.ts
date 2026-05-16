/**
 * AI Provider 单元测试
 * 验证 LLM 配置解析、角色配置解析、默认值回退等核心逻辑
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

import { buildElectronConfigOverride, getDefaultConfig, getLLMConfig, resolveAgentConfig } from '../provider'
import { getSetting } from '../../db/store'

describe('AI Provider', () => {
  beforeEach(async () => {
    vi.stubEnv('VITE_OPENBASAKA_LLM_PROVIDER', '')
    vi.stubEnv('VITE_OPENBASAKA_LLM_API_KEY', '')
    vi.stubEnv('VITE_OPENBASAKA_LLM_BASE_URL', '')
    vi.stubEnv('VITE_OPENBASAKA_LLM_MODEL', '')
    vi.stubEnv('VITE_PROFILING_LLM_PROVIDER', '')
    vi.stubEnv('VITE_PROFILING_LLM_API_KEY', '')
    vi.stubEnv('VITE_PROFILING_LLM_BASE_URL', '')
    vi.stubEnv('VITE_PROFILING_LLM_MODEL', '')
    const mod = vi.mocked(await import('../../db/store')) as any
    mod.__resetStore()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
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

    it('store 无配置时可使用本机环境变量 fallback', () => {
      vi.stubEnv('VITE_OPENBASAKA_LLM_PROVIDER', 'glm')
      vi.stubEnv('VITE_OPENBASAKA_LLM_API_KEY', 'env-key')
      vi.stubEnv('VITE_OPENBASAKA_LLM_BASE_URL', 'https://api.z.ai/api/paas/v4/')
      vi.stubEnv('VITE_OPENBASAKA_LLM_MODEL', 'glm-5.1')

      const config = getLLMConfig()
      expect(config.provider).toBe('glm')
      expect(config.apiKey).toBe('env-key')
      expect(config.baseUrl).toBe('https://api.z.ai/api/coding/paas/v4')
      expect(config.model).toBe('glm-5.1')
    })
  })

  describe('buildElectronConfigOverride', () => {
    it('遇到 safe-storage 引用时不覆盖主进程 SQLite 配置', () => {
      const override = buildElectronConfigOverride({
        provider: 'glm',
        apiKey: 'safe-storage:llm_api_key',
        baseUrl: 'https://api.z.ai/api/coding/paas/v4',
        model: 'glm-5.1',
      })
      expect(override).toBeUndefined()
    })

    it('明文运行时 key 才作为显式覆盖传给主进程', () => {
      const override = buildElectronConfigOverride({
        provider: 'glm',
        apiKey: 'runtime-key',
        baseUrl: 'https://api.z.ai/api/coding/paas/v4',
        model: 'glm-5.1',
      })
      expect(JSON.parse(override || '{}')).toMatchObject({ provider: 'glm', apiKey: 'runtime-key', model: 'glm-5.1' })
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
