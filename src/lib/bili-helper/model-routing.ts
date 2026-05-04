import { getSetting } from '../db/store'
import { getDefaultConfig, normalizeProviderBaseUrl, type LLMConfig } from '../ai/provider'

export type BaoyuModelRoute = 'primary-structured' | 'flash-review' | 'pro-review'

export interface BaoyuModelRouteSelection {
  route: BaoyuModelRoute
  config: LLMConfig
  label: string
  responsibility: string
}

function readConfig(prefix: string, fallbackModel: string): LLMConfig | null {
  const provider = getSetting(`${prefix}_provider`, '')
  if (!provider) return null
  const defaults = getDefaultConfig(provider)
  return {
    provider: provider as LLMConfig['provider'],
    apiKey: getSetting(`${prefix}_api_key`, ''),
    baseUrl: normalizeProviderBaseUrl(provider, getSetting(`${prefix}_base_url`, defaults.baseUrl)),
    model: getSetting(`${prefix}_model`, fallbackModel || defaults.model),
  }
}

function configuredOrDefault(params: {
  prefix: string
  provider: LLMConfig['provider']
  model: string
  keyFallbacks: string[]
}): LLMConfig {
  const explicit = readConfig(params.prefix, params.model)
  if (explicit) return explicit
  const defaults = getDefaultConfig(params.provider)
  const apiKey =
    params.keyFallbacks
      .map((key) => getSetting(key, ''))
      .find(Boolean) || ''
  return {
    provider: params.provider,
    apiKey,
    baseUrl: defaults.baseUrl,
    model: params.model,
  }
}

export function getBaoyuModelRoute(route: BaoyuModelRoute): BaoyuModelRouteSelection {
  if (route === 'flash-review') {
    return {
      route,
      label: 'DeepSeek V4 Flash',
      responsibility: '超长来源快速摘要、低成本二审、事实遗漏检查和 JSON 修复。',
      config:
        readConfig('baoyu_review_fast', 'deepseek-v4-flash') ||
        readConfig('agent_visual_fast', 'deepseek-v4-flash') ||
        configuredOrDefault({
          prefix: 'baoyu_review_fast',
          provider: 'deepseek',
          model: 'deepseek-v4-flash',
          keyFallbacks: ['agent_visual_fast_api_key', 'llm_api_key'],
        }),
    }
  }

  if (route === 'pro-review') {
    return {
      route,
      label: 'DeepSeek V4 Pro',
      responsibility: '高难长文与复杂推理的可选重型审稿，不作为默认生成路径。',
      config: configuredOrDefault({
        prefix: 'baoyu_review_heavy',
        provider: 'deepseek',
        model: 'deepseek-v4-pro',
        keyFallbacks: ['agent_visual_heavy_api_key', 'agent_general_heavy_api_key', 'llm_api_key'],
      }),
    }
  }

  return {
    route,
    label: 'GLM-5.1',
    responsibility: 'Baoyu 主脑：中文结构化生成、学习包、卡片文案、分镜和 PRD 图文包 JSON。',
    config:
      readConfig('baoyu_primary', 'glm-5.1') ||
      readConfig('agent_general_heavy', 'glm-5.1') ||
      configuredOrDefault({
        prefix: 'baoyu_primary',
        provider: 'glm',
        model: 'glm-5.1',
        keyFallbacks: ['model_route_heavy_api_key', 'llm_api_key'],
      }),
  }
}

export function describeBaoyuModelRouting(): string {
  const primary = getBaoyuModelRoute('primary-structured')
  const review = getBaoyuModelRoute('flash-review')
  const pro = getBaoyuModelRoute('pro-review')
  return [
    `${primary.label}: ${primary.responsibility}`,
    `${review.label}: ${review.responsibility}`,
    `${pro.label}: ${pro.responsibility}`,
    '本地 SVG/HTML/Canvas: 负责中文排版渲染；图片模型只生成无文字背景、插画或图标。',
  ].join('\n')
}
