import { getSetting } from '../db/store'
import { chatCompletion, getDefaultConfig, getLLMConfig, normalizeProviderBaseUrl, type ChatMessage, type LLMConfig } from '../ai/provider'
import { createFusionVisual, createLocalFusion, createLocalProjectPrd } from './state'
import type { UiFusionResult, UiProjectPrd, UiStyleItem, UiVisualTokens } from './types'

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  try {
    return JSON.parse(trimmed)
  } catch {}
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1))
  throw new Error('AI response is not JSON')
}

async function readRuntimeSetting(key: string, fallback = ''): Promise<string> {
  const electronAPI = typeof window !== 'undefined' ? (window as any)?.electronAPI : undefined
  if (electronAPI?.dbQuery) {
    try {
      const rows = (await electronAPI.dbQuery('SELECT value FROM settings WHERE key = ?', [key])) as Array<{ value: string }>
      if (rows[0]?.value) return rows[0].value
    } catch {
      // fallback below
    }
  }
  return getSetting(key, fallback)
}

async function resolveUiMuseumConfig(kind: 'visual' | 'critic'): Promise<LLMConfig | null> {
  if (kind === 'visual') {
    const global = getLLMConfig()
    const provider = (await readRuntimeSetting('ui_museum_visual_provider', global.provider)) as LLMConfig['provider']
    const defaults = getDefaultConfig(provider)
    const apiKey =
      (await readRuntimeSetting('ui_museum_visual_api_key', '')) ||
      (await readRuntimeSetting('llm_api_key', global.provider === provider ? global.apiKey : ''))
    return {
      provider,
      apiKey,
      baseUrl: normalizeProviderBaseUrl(provider, await readRuntimeSetting('ui_museum_visual_base_url', global.baseUrl || defaults.baseUrl)),
      model: await readRuntimeSetting('ui_museum_visual_model', global.model || defaults.model),
    }
  }

  const provider = (await readRuntimeSetting('ui_museum_critic_provider', 'deepseek')) as LLMConfig['provider']
  const defaults = getDefaultConfig(provider)
  const apiKey =
    (await readRuntimeSetting('ui_museum_critic_api_key', '')) ||
    (await readRuntimeSetting('model_role_main_reasoning_api_key', ''))
  if (!apiKey && provider !== 'ollama') return null
  return {
    provider,
    apiKey,
    baseUrl: normalizeProviderBaseUrl(
      provider,
      (await readRuntimeSetting('ui_museum_critic_base_url', '')) ||
        (await readRuntimeSetting('model_role_main_reasoning_base_url', defaults.baseUrl)),
    ),
    model:
      (await readRuntimeSetting('ui_museum_critic_model', '')) ||
      (await readRuntimeSetting('model_role_main_reasoning_model', defaults.model)),
  }
}

async function callUiMuseumAI(messages: ChatMessage[], maxTokens = 3200, kind: 'visual' | 'critic' = 'visual'): Promise<string> {
  const config = await resolveUiMuseumConfig(kind)
  if (!config) throw new Error(`${kind} LLM is not configured`)
  if (!config.apiKey && config.provider !== 'ollama') throw new Error('LLM is not configured')
  return chatCompletion(config, messages, 0.62, maxTokens)
}

function normalizeVisual(input: unknown, fallback: UiVisualTokens): UiVisualTokens {
  const value = (input || {}) as Partial<UiVisualTokens>
  return {
    ...fallback,
    ...value,
    palette: Array.isArray(value.palette) && value.palette.length >= 3 ? value.palette.slice(0, 5) : fallback.palette,
    pattern: value.pattern || fallback.pattern,
  }
}

async function refineFusionWithCritic(result: UiFusionResult, styles: UiStyleItem[]): Promise<UiFusionResult> {
  try {
    const response = await callUiMuseumAI(
      [
        {
          role: 'system',
          content:
            '你是严苛的产品设计审稿人。只输出 JSON，不要 Markdown。你要提升 UI 融合结果的可执行性和视觉识别度，但保留原始风格组合。',
        },
        {
          role: 'user',
          content: `请审校并强化这个 UI 风格融合方案。重点：预览必须能转成明确视觉 token，Web/iOS/macOS/Android/Mini 指南必须可执行。

父风格：${JSON.stringify(styles.map((item) => ({ id: item.id, title: item.title, visual: item.visual, specs: item.specs })))}

当前方案：${JSON.stringify(result)}

返回 JSON，字段同原方案，允许改 name、description、specs、visual、web、ios、android、mini、prompt。`,
        },
      ],
      3200,
      'critic',
    )
    const parsed = extractJsonObject(response) as Partial<UiFusionResult>
    return {
      ...result,
      name: String(parsed.name || result.name),
      description: String(parsed.description || result.description),
      specs: parsed.specs || result.specs,
      visual: normalizeVisual(parsed.visual, result.visual),
      web: String(parsed.web || result.web),
      ios: String(parsed.ios || result.ios),
      mac: String(parsed.mac || result.mac || 'macOS 版本必须用 Toolbar、Sidebar/Split View、Inspector、键盘焦点和窗口状态承接桌面效率。'),
      android: String(parsed.android || result.android),
      mini: String(parsed.mini || result.mini),
      prompt: String(parsed.prompt || result.prompt),
      generatedBy: 'ai',
    }
  } catch {
    return result
  }
}

export async function fuseUiStyles(styles: UiStyleItem[]): Promise<UiFusionResult> {
  const fallback = createLocalFusion(styles)
  try {
    const response = await callUiMuseumAI(
      [
        {
          role: 'system',
          content:
            '你是前卫 UI 创意技术总监。输出必须是 JSON，不要 Markdown 代码块。语言为简体中文。设计必须拒绝标准后台模板。',
        },
        {
          role: 'user',
          content: `融合这些 UI 风格，生成一个新视觉语言：${JSON.stringify(styles.map((item) => ({
            id: item.id,
            title: item.title,
            tier: item.tier,
            description: item.description,
            application: item.application,
            specs: item.specs,
            visual: item.visual,
          })))}

返回 JSON：
{
  "name": "新风格名",
  "description": "艺术描述",
  "specs": {"radius":"", "shadow":"", "font":"", "colors":""},
  "visual": {"palette":["#000000"],"background":"","surface":"","text":"","accent":"","border":"","radius":"","shadow":"","pattern":"fusion","density":"balanced","typography":"","motif":"","texture":"","motion":""},
  "web": "Web 实现指南",
  "ios": "iOS 实现指南",
  "mac": "macOS 实现指南",
  "android": "Android 实现指南",
  "mini": "小程序实现指南",
  "prompt": "给设计/编码 AI 复刻该风格的提示词"
}`,
        },
      ],
      2600,
    )
    const parsed = extractJsonObject(response) as Partial<UiFusionResult>
    const result: UiFusionResult = {
      ...fallback,
      name: String(parsed.name || fallback.name),
      description: String(parsed.description || fallback.description),
      specs: parsed.specs || fallback.specs,
      visual: normalizeVisual(parsed.visual, createFusionVisual(styles, String(parsed.name || fallback.name))),
      web: String(parsed.web || fallback.web),
      ios: String(parsed.ios || fallback.ios),
      mac: String(parsed.mac || fallback.mac || 'macOS 版本必须用 Toolbar、Sidebar/Split View、Inspector、键盘焦点和窗口状态承接桌面效率。'),
      android: String(parsed.android || fallback.android),
      mini: String(parsed.mini || fallback.mini),
      prompt: String(parsed.prompt || fallback.prompt),
      generatedBy: 'ai',
    }
    return refineFusionWithCritic(result, styles)
  } catch {
    return fallback
  }
}

export async function generateUiProjectPrd(
  idea: string,
  availableStyles: UiStyleItem[],
  preferredStyles: UiStyleItem[],
  onStatus?: (status: string) => void,
): Promise<UiProjectPrd> {
  const selected = preferredStyles.length > 0 ? preferredStyles : availableStyles.filter((item) => item.tier === 'T0').slice(0, 3)
  const fallback = createLocalProjectPrd(idea, selected)
  const fallbackVisual = createFusionVisual(selected, fallback.title)
  try {
    onStatus?.('正在让 CPO/CTO/设计总监围绕创意开会...')
    const response = await callUiMuseumAI(
      [
        {
          role: 'system',
          content:
            '你是由 CPO、CTO、Design Director 组成的项目 Genesis 团队。必须输出 JSON，不要 Markdown 代码块。语言为简体中文。方案要完整、可执行、反模板。',
        },
        {
          role: 'user',
          content: `用户想法：${idea}

可用风格：${JSON.stringify(availableStyles.slice(0, 60).map((item) => ({
  id: item.id,
  title: item.title,
  tier: item.tier,
  description: item.description,
  visual: item.visual,
})))}

优先融合风格：${JSON.stringify(selected.map((item) => item.id))}

返回 JSON：
{
  "title": "项目名",
  "elevatorPitch": "电梯演讲",
  "targetAudience": "目标用户",
  "researchReport": "市场和竞品判断",
  "teamBrainstorming": [{"role":"CPO|CTO|Design Director","name":"","focus":"","opinion":""}],
  "visualStyleFusion": {"styleIds":[""],"reasoning":"","colorPalette":["#111827"],"visual":{"palette":["#000000"],"background":"","surface":"","text":"","accent":"","border":"","radius":"","shadow":"","pattern":"fusion","density":"balanced","typography":"","motif":"","texture":"","motion":""}},
  "features": [{"name":"","description":"","priority":"P0|P1|P2"}],
  "techStack": {"frontend":"","backend":"","database":"","infrastructure":""},
  "databaseSchema": "schema text",
  "apiEndpoints": "endpoint text",
  "prdManual": "完整 Markdown PRD 手册"
}`,
        },
      ],
      5200,
    )
    const parsed = extractJsonObject(response) as Partial<UiProjectPrd>
    return {
      ...fallback,
      title: String(parsed.title || fallback.title),
      elevatorPitch: String(parsed.elevatorPitch || fallback.elevatorPitch),
      targetAudience: String(parsed.targetAudience || fallback.targetAudience),
      researchReport: String(parsed.researchReport || fallback.researchReport),
      teamBrainstorming: Array.isArray(parsed.teamBrainstorming) ? parsed.teamBrainstorming : fallback.teamBrainstorming,
      visualStyleFusion: {
        ...fallback.visualStyleFusion,
        ...(parsed.visualStyleFusion || {}),
        visual: normalizeVisual(parsed.visualStyleFusion?.visual, fallbackVisual),
      },
      features: Array.isArray(parsed.features) ? parsed.features : fallback.features,
      techStack: parsed.techStack || fallback.techStack,
      databaseSchema: String(parsed.databaseSchema || fallback.databaseSchema),
      apiEndpoints: String(parsed.apiEndpoints || fallback.apiEndpoints),
      prdManual: String(parsed.prdManual || fallback.prdManual),
      generatedBy: 'ai',
    }
  } catch {
    return fallback
  }
}
