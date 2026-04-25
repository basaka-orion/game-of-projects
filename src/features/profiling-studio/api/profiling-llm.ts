import { getSetting } from '../../../lib/db/store';
import { getDefaultConfig, normalizeProviderBaseUrl, type LLMConfig } from '../../../lib/ai/provider';

const ENV_PROVIDER = import.meta.env.VITE_PROFILING_LLM_PROVIDER || 'glm';
const ENV_API_KEY = import.meta.env.VITE_PROFILING_LLM_API_KEY || '';
const ENV_BASE_URL = import.meta.env.VITE_PROFILING_LLM_BASE_URL || '';
const ENV_MODEL = import.meta.env.VITE_PROFILING_LLM_MODEL || '';

export function getProfilingLLMConfig(): LLMConfig {
  const provider = (getSetting('profiling_llm_provider', ENV_PROVIDER) || ENV_PROVIDER) as LLMConfig['provider'];
  const defaults = getDefaultConfig(provider);
  const globalProvider = getSetting('llm_provider', '');
  const canBorrowGlobal = globalProvider === provider;

  return {
    provider,
    apiKey: getSetting(
      'profiling_llm_api_key',
      ENV_API_KEY || (canBorrowGlobal ? getSetting('llm_api_key', '') : '')
    ),
    baseUrl: normalizeProviderBaseUrl(provider, getSetting(
      'profiling_llm_base_url',
      ENV_BASE_URL || (canBorrowGlobal ? getSetting('llm_base_url', defaults.baseUrl) : defaults.baseUrl)
    )),
    model: getSetting(
      'profiling_llm_model',
      ENV_MODEL || (canBorrowGlobal ? getSetting('llm_model', defaults.model) : defaults.model)
    ),
  };
}
