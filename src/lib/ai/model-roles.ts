import { getSetting, setSetting } from '../db/store'
import { getDefaultConfig, normalizeProviderBaseUrl, type LLMConfig } from './provider'

export type ModelRoleId =
  | 'main_reasoning'
  | 'local_fast'
  | 'archive_gate'
  | 'tagging'
  | 'knowledge_compile'
  | 'evolution_review'

export interface ModelRoleDefinition {
  id: ModelRoleId
  label: string
  taskHint: string
  defaultProvider: LLMConfig['provider']
  defaultBaseUrl: string
  defaultModel: string
  fallbackRoleId?: ModelRoleId
}

export interface ModelRoleConfig extends LLMConfig {
  roleId: ModelRoleId
  label: string
  taskHint: string
  fallbackRoleId?: ModelRoleId
  inherited: boolean
}

export const LOCAL_FAST_MODEL = 'gemma3:4b'
export const LOCAL_FAST_BASE_URL = 'http://localhost:11434/v1'

export const MODEL_ROLE_DEFINITIONS: ModelRoleDefinition[] = [
  {
    id: 'main_reasoning',
    label: '主脑推理',
    taskHint: '复杂分析、长计划、项目总控和需要完整上下文的任务。',
    defaultProvider: 'deepseek',
    defaultBaseUrl: getDefaultConfig('deepseek').baseUrl,
    defaultModel: getDefaultConfig('deepseek').model,
  },
  {
    id: 'local_fast',
    label: '轻量快答',
    taskHint: '短响应、记忆回忆、状态查询、低风险草稿，优先走低延迟轻量模型。',
    defaultProvider: 'ollama',
    defaultBaseUrl: LOCAL_FAST_BASE_URL,
    defaultModel: LOCAL_FAST_MODEL,
    fallbackRoleId: 'main_reasoning',
  },
  {
    id: 'archive_gate',
    label: '归档门',
    taskHint: '判断内容是否值得留下，以及进入启蒙、知识还是大佬技能。',
    defaultProvider: 'ollama',
    defaultBaseUrl: LOCAL_FAST_BASE_URL,
    defaultModel: LOCAL_FAST_MODEL,
    fallbackRoleId: 'local_fast',
  },
  {
    id: 'tagging',
    label: '标签与分区',
    taskHint: '给创作、对话、资料生成可点击标签、Facet 和分区建议。',
    defaultProvider: 'ollama',
    defaultBaseUrl: LOCAL_FAST_BASE_URL,
    defaultModel: LOCAL_FAST_MODEL,
    fallbackRoleId: 'local_fast',
  },
  {
    id: 'knowledge_compile',
    label: '知识编译',
    taskHint: '把来源拆成 Karpathy Wiki 页面、证据链和可检索 chunk。',
    defaultProvider: 'deepseek',
    defaultBaseUrl: getDefaultConfig('deepseek').baseUrl,
    defaultModel: getDefaultConfig('deepseek').model,
    fallbackRoleId: 'main_reasoning',
  },
  {
    id: 'evolution_review',
    label: '进化复盘',
    taskHint: '总结 Hermes/MemPalace/项目实践学到了什么，以及该连接哪些神经元和突触。',
    defaultProvider: 'ollama',
    defaultBaseUrl: LOCAL_FAST_BASE_URL,
    defaultModel: LOCAL_FAST_MODEL,
    fallbackRoleId: 'main_reasoning',
  },
]

export function getModelRoleDefinition(roleId: ModelRoleId): ModelRoleDefinition {
  return MODEL_ROLE_DEFINITIONS.find((role) => role.id === roleId) || MODEL_ROLE_DEFINITIONS[0]
}

export function getModelRoleConfig(roleId: ModelRoleId): ModelRoleConfig {
  const definition = getModelRoleDefinition(roleId)
  const provider = getSetting(`model_role_${roleId}_provider`, '')
  const inherited = !provider
  const resolvedProvider = (provider || definition.defaultProvider) as LLMConfig['provider']
  const defaults = getDefaultConfig(resolvedProvider)
  const baseUrl = getSetting(`model_role_${roleId}_base_url`, definition.defaultBaseUrl || defaults.baseUrl)

  return {
    roleId,
    label: definition.label,
    taskHint: definition.taskHint,
    fallbackRoleId: definition.fallbackRoleId,
    inherited,
    provider: resolvedProvider,
    apiKey: getSetting(`model_role_${roleId}_api_key`, ''),
    baseUrl: normalizeProviderBaseUrl(resolvedProvider, baseUrl || defaults.baseUrl),
    model: getSetting(`model_role_${roleId}_model`, definition.defaultModel || defaults.model),
  }
}

export function saveModelRoleConfig(roleId: ModelRoleId, config: Partial<LLMConfig>): void {
  const definition = getModelRoleDefinition(roleId)
  const provider = (config.provider || definition.defaultProvider) as LLMConfig['provider']
  const defaults = getDefaultConfig(provider)
  setSetting(`model_role_${roleId}_provider`, provider)
  setSetting(`model_role_${roleId}_api_key`, config.apiKey || '')
  setSetting(`model_role_${roleId}_base_url`, config.baseUrl || definition.defaultBaseUrl || defaults.baseUrl)
  setSetting(`model_role_${roleId}_model`, config.model || definition.defaultModel || defaults.model)
}

export function clearModelRoleConfig(roleId: ModelRoleId): void {
  setSetting(`model_role_${roleId}_provider`, '')
  setSetting(`model_role_${roleId}_api_key`, '')
  setSetting(`model_role_${roleId}_base_url`, '')
  setSetting(`model_role_${roleId}_model`, '')
}

export function initializeLocalFastModelRoles(): void {
  for (const roleId of ['local_fast', 'archive_gate', 'tagging', 'evolution_review'] as ModelRoleId[]) {
    saveModelRoleConfig(roleId, {
      provider: 'ollama',
      apiKey: '',
      baseUrl: LOCAL_FAST_BASE_URL,
      model: LOCAL_FAST_MODEL,
    })
  }
}
