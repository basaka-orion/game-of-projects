import { getSetting } from '../db/store'
import { getModelRoleConfig } from './model-roles'
import { getDefaultConfig, normalizeProviderBaseUrl, resolveAgentConfig, type LLMConfig } from './provider'

export type AgentModelTier = 'fast' | 'heavy'

export interface AgentModelSelection {
  config: LLMConfig
  fallbackConfig: LLMConfig
  tier: AgentModelTier
  reason: string
  score: number
}

const HEAVY_ACTION_RE =
  /设计|实现|开发|构建|重构|架构|PRD|prd|产品|项目|app|App|APP|方案|计划|路线图|战略|评估|分析|调研|复盘|代码|debug|修复|数据库|工程|全方位|完整|深度|复杂|比较|权衡|竞品|商业模式|商业|系统/

const FAST_ACTION_RE =
  /是什么|是谁|在哪|多少|几次|上次|之前|刚刚|刚才|最近|总结一下|解释一下|翻译|改写|润色|笑话|状态|列出|查一下|回忆|记得/

function readSettingModelConfig(prefix: string): LLMConfig | null {
  const provider = getSetting(`${prefix}_provider`, '')
  if (!provider) return null

  const defaults = getDefaultConfig(provider)
  return {
    provider: provider as LLMConfig['provider'],
    apiKey: getSetting(`${prefix}_api_key`, ''),
    baseUrl: normalizeProviderBaseUrl(provider, getSetting(`${prefix}_base_url`, defaults.baseUrl)),
    model: getSetting(`${prefix}_model`, defaults.model),
  }
}

function estimateComplexityScore(text: string): number {
  const normalized = text.trim()
  let score = 0
  if (normalized.length > 120) score += 2
  if (normalized.length > 260) score += 2
  if (/[？?].*[？?]/.test(normalized)) score += 1
  if (HEAVY_ACTION_RE.test(normalized)) score += 3
  if (/做一个|做出|搭建|生成|产出|写一份|给我方案|怎么办|最好的方案|最有智慧/.test(normalized)) score += 2
  if (FAST_ACTION_RE.test(normalized)) score -= 2
  if (/上次|之前|刚刚|刚才|最近/.test(normalized) && normalized.length < 80) score -= 2
  return score
}

function getHeavyAgentConfig(agentRole: string): LLMConfig {
  const explicitHeavy = readSettingModelConfig(`agent_${agentRole}_heavy`)
  if (explicitHeavy) return explicitHeavy

  const hasLegacyAgentConfig = !!getSetting(`agent_${agentRole}_provider`, '')
  const legacyOrGlobalConfig = resolveAgentConfig(agentRole)
  if (hasLegacyAgentConfig || legacyOrGlobalConfig.provider === 'glm') return legacyOrGlobalConfig

  const heavyProvider = getSetting('model_route_heavy_provider', '')
  if (heavyProvider) {
    const defaults = getDefaultConfig(heavyProvider)
    return {
      provider: heavyProvider as LLMConfig['provider'],
      apiKey: getSetting('model_route_heavy_api_key', legacyOrGlobalConfig.apiKey),
      baseUrl: normalizeProviderBaseUrl(
        heavyProvider,
        getSetting('model_route_heavy_base_url', defaults.baseUrl || legacyOrGlobalConfig.baseUrl),
      ),
      model: getSetting('model_route_heavy_model', defaults.model || legacyOrGlobalConfig.model),
    }
  }

  return legacyOrGlobalConfig
}

function getFastAgentConfig(agentRole: string): LLMConfig {
  return readSettingModelConfig(`agent_${agentRole}_fast`) || getModelRoleConfig('local_fast')
}

function isFastModelEnabled(): boolean {
  return getSetting('model_route_fast_enabled', 'true') !== 'false'
}

export function selectAgentModel(agentRole: string, userText: string): AgentModelSelection {
  const fallbackConfig = getHeavyAgentConfig(agentRole)
  const score = estimateComplexityScore(userText)
  const shouldUseFast = isFastModelEnabled() && score <= 1

  if (shouldUseFast) {
    const fast = getFastAgentConfig(agentRole)
    return {
      config: fast,
      fallbackConfig,
      tier: 'fast',
      score,
      reason: '短指令/轻问答，优先走轻量快速模型；失败时回退重模型。',
    }
  }

  return {
    config: fallbackConfig,
    fallbackConfig,
    tier: 'heavy',
    score,
    reason: '复杂产品、项目、APP、PRD、分析或长任务，使用重模型。',
  }
}
