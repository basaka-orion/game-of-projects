/**
 * Telegram 消息处理器 — 多 Agent 版
 * 每个 Bot 实例的消息自动绑定对应 Agent 角色
 * 路由：/ask → 知识库搜索 | /search → 网络搜索 | 普通消息 → AI 对话 | /status → 系统状态
 */
import { sendMessage, onMessage, sendChatAction } from './bot'
import { query, run } from '../database'
import {
  answerSharedAgentRecallQuestion,
  appendTelegramConversationMessage,
  formatSharedAgentRecentContext,
  formatTelegramRecentContext,
  loadTelegramConversation,
  normalizeTelegramAgentId,
} from './conversation'
import { consumeOpenbasakaMirroredUserMessage } from './user-sync'

// ─── LLM 配置 ───

const DEFAULT_LLM_CONFIGS: Record<string, { baseUrl: string; model: string }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  minimax: { baseUrl: 'https://api.minimax.chat/v1', model: 'minimax-M2.7' },
  ollama: { baseUrl: 'http://localhost:11434/v1', model: 'gemma3:4b' },
  glm: { baseUrl: 'https://api.z.ai/api/coding/paas/v4', model: 'glm-5.1' },
}

function normalizeBaseUrl(provider: string, baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (provider === 'glm' && trimmed === 'https://api.z.ai/api/paas/v4') {
    return 'https://api.z.ai/api/coding/paas/v4'
  }
  return trimmed || baseUrl
}

interface LLMConfig {
  provider: string
  apiKey: string
  baseUrl: string
  model: string
}

function getLLMConfig(): LLMConfig | null {
  try {
    const providerRow = query('SELECT value FROM settings WHERE key = ?', ['llm_provider']) as Array<{ value: string }>
    const apiKeyRow = query('SELECT value FROM settings WHERE key = ?', ['llm_api_key']) as Array<{ value: string }>
    const baseUrlRow = query('SELECT value FROM settings WHERE key = ?', ['llm_base_url']) as Array<{ value: string }>
    const modelRow = query('SELECT value FROM settings WHERE key = ?', ['llm_model']) as Array<{ value: string }>

    const provider = providerRow[0]?.value || 'deepseek'
    const apiKey = apiKeyRow[0]?.value || ''
    const defaults = DEFAULT_LLM_CONFIGS[provider] || DEFAULT_LLM_CONFIGS.deepseek
    const baseUrl = normalizeBaseUrl(provider, baseUrlRow[0]?.value || defaults.baseUrl)
    const model = modelRow[0]?.value || defaults.model

    if (!apiKey && provider !== 'ollama') return null
    return { provider, apiKey, baseUrl, model }
  } catch {
    return null
  }
}

function configFromSettingsPrefix(prefix: string): LLMConfig | null {
  const provider = getSettingValue(`${prefix}_provider`, '')
  if (!provider) return null

  const defaults = DEFAULT_LLM_CONFIGS[provider] || DEFAULT_LLM_CONFIGS.deepseek
  const apiKey = getSettingValue(`${prefix}_api_key`, '')
  if (!apiKey && provider !== 'ollama') return null

  return {
    provider,
    apiKey,
    baseUrl: normalizeBaseUrl(provider, getSettingValue(`${prefix}_base_url`, defaults.baseUrl)),
    model: getSettingValue(`${prefix}_model`, defaults.model),
  }
}

function configFromUnknown(value: unknown): LLMConfig | null {
  if (!value || typeof value !== 'object') return null
  const llm = value as Record<string, string>
  if (!llm.provider) return null

  const defaults = DEFAULT_LLM_CONFIGS[llm.provider] || DEFAULT_LLM_CONFIGS.deepseek
  if (!llm.apiKey && llm.provider !== 'ollama') return null
  return {
    provider: llm.provider,
    apiKey: llm.apiKey || '',
    baseUrl: normalizeBaseUrl(llm.provider, llm.baseUrl || defaults.baseUrl),
    model: llm.model || defaults.model,
  }
}

function readCustomAgentTierConfig(agentId: string, tier: 'fast' | 'heavy'): LLMConfig | null {
  const agentRows = query('SELECT platform_config_json FROM custom_agents WHERE id = ?', [agentId]) as Array<{
    platform_config_json: string
  }>
  if (!agentRows[0]?.platform_config_json) return null

  try {
    const config = JSON.parse(agentRows[0].platform_config_json) as Record<string, unknown>
    const llm = config.llm as Record<string, unknown> | undefined
    if (!llm) return null
    return configFromUnknown(llm[tier]) || (tier === 'heavy' ? configFromUnknown(llm) : null)
  } catch {
    return null
  }
}

function resolveAgentTierLLMConfig(agentId: string | undefined, tier: 'fast' | 'heavy'): LLMConfig | null {
  if (!agentId || agentId === '__global__') return null

  const explicitTier = configFromSettingsPrefix(`agent_${agentId}_${tier}`)
  if (explicitTier) return explicitTier

  if (tier === 'heavy') {
    const legacy = configFromSettingsPrefix(`agent_${agentId}`)
    if (legacy) return legacy
  }

  return readCustomAgentTierConfig(agentId, tier)
}

/** 获取 Agent 专属 LLM 配置 — 优先使用角色专属配置，无则回退全局 */
function resolveAgentLLMConfig(agentId: string): LLMConfig | null {
  if (!agentId || agentId === '__global__') return getHeavyLLMConfig()

  const heavyConfig = resolveAgentTierLLMConfig(agentId, 'heavy')
  if (heavyConfig) return heavyConfig

  try {
    // 1. 检查 settings 表中的角色专属配置（agent_{id}_* 前缀）
    const providerRow = query('SELECT value FROM settings WHERE key = ?', [`agent_${agentId}_provider`]) as Array<{
      value: string
    }>
    if (providerRow[0]?.value) {
      const provider = providerRow[0].value
      const defaults = DEFAULT_LLM_CONFIGS[provider] || DEFAULT_LLM_CONFIGS.deepseek
      const apiKeyRow = query('SELECT value FROM settings WHERE key = ?', [`agent_${agentId}_api_key`]) as Array<{
        value: string
      }>
      const baseUrlRow = query('SELECT value FROM settings WHERE key = ?', [`agent_${agentId}_base_url`]) as Array<{
        value: string
      }>
      const modelRow = query('SELECT value FROM settings WHERE key = ?', [`agent_${agentId}_model`]) as Array<{
        value: string
      }>
      const apiKey = apiKeyRow[0]?.value || ''
      if (!apiKey && provider !== 'ollama') return getHeavyLLMConfig()
      return {
        provider,
        apiKey,
        baseUrl: normalizeBaseUrl(provider, baseUrlRow[0]?.value || defaults.baseUrl),
        model: modelRow[0]?.value || defaults.model,
      }
    }

    // 2. 检查 custom_agents 的 platform_config_json 中的 LLM 配置
    const agentRows = query('SELECT platform_config_json FROM custom_agents WHERE id = ?', [agentId]) as Array<{
      platform_config_json: string
    }>
    if (agentRows[0]?.platform_config_json) {
      const config = JSON.parse(agentRows[0].platform_config_json) as Record<string, unknown>
      const llm = config.llm as Record<string, string> | undefined
      if (llm?.provider) {
        const defaults = DEFAULT_LLM_CONFIGS[llm.provider] || DEFAULT_LLM_CONFIGS.deepseek
        return {
          provider: llm.provider,
          apiKey: llm.apiKey || '',
          baseUrl: normalizeBaseUrl(llm.provider, llm.baseUrl || defaults.baseUrl),
          model: llm.model || defaults.model,
        }
      }
    }
  } catch {
    /* fallback to global */
  }

  return getHeavyLLMConfig()
}

function getLLMTimeoutMs(config: LLMConfig, maxTokens: number): number {
  if (config.provider === 'glm' || /^glm-5/i.test(config.model)) {
    return Math.min(240000, Math.max(120000, maxTokens * 60))
  }
  return Math.min(120000, Math.max(60000, maxTokens * 25))
}

function shouldDisableThinking(config: LLMConfig, maxTokens: number): boolean {
  return (config.provider === 'glm' || /^glm-5/i.test(config.model)) && maxTokens <= 2048
}

const TELEGRAM_HEAVY_ACTION_RE =
  /设计|实现|开发|构建|重构|架构|PRD|prd|产品|项目|app|App|APP|方案|计划|路线图|战略|评估|分析|调研|复盘|代码|debug|修复|数据库|工程|全方位|完整|深度|复杂|比较|权衡|竞品|商业模式|商业|系统/

const TELEGRAM_FAST_ACTION_RE =
  /是什么|是谁|在哪|多少|几次|上次|之前|刚刚|刚才|最近|总结一下|解释一下|翻译|改写|润色|笑话|状态|列出|查一下|回忆|记得/

function getSettingValue(key: string, fallback = ''): string {
  try {
    const rows = query('SELECT value FROM settings WHERE key = ?', [key]) as Array<{ value: string }>
    return rows[0]?.value || fallback
  } catch {
    return fallback
  }
}

function estimateTelegramTaskScore(text: string): number {
  const normalized = text.trim()
  let score = 0
  if (normalized.length > 120) score += 2
  if (normalized.length > 260) score += 2
  if (TELEGRAM_HEAVY_ACTION_RE.test(normalized)) score += 3
  if (/做一个|做出|搭建|生成|产出|写一份|给我方案|怎么办|最好的方案|最有智慧/.test(normalized)) score += 2
  if (TELEGRAM_FAST_ACTION_RE.test(normalized)) score -= 2
  if (/上次|之前|刚刚|刚才|最近/.test(normalized) && normalized.length < 80) score -= 2
  return score
}

function getFastLLMConfig(): LLMConfig {
  const provider = (getSettingValue('model_role_local_fast_provider', 'ollama') || 'ollama') as LLMConfig['provider']
  const defaults = DEFAULT_LLM_CONFIGS[provider] || DEFAULT_LLM_CONFIGS.ollama
  return {
    provider,
    apiKey: getSettingValue('model_role_local_fast_api_key', ''),
    baseUrl: normalizeBaseUrl(provider, getSettingValue('model_role_local_fast_base_url', defaults.baseUrl)),
    model: getSettingValue('model_role_local_fast_model', 'gemma3:4b'),
  }
}

function getHeavyLLMConfig(): LLMConfig | null {
  const fallback = getLLMConfig()
  const provider = getSettingValue('model_route_heavy_provider', '')
  if (!provider) return fallback

  const defaults = DEFAULT_LLM_CONFIGS[provider] || DEFAULT_LLM_CONFIGS.deepseek
  const apiKey = getSettingValue('model_route_heavy_api_key', fallback?.apiKey || '')
  if (!apiKey && provider !== 'ollama') return fallback

  return {
    provider,
    apiKey,
    baseUrl: normalizeBaseUrl(provider, getSettingValue('model_route_heavy_base_url', defaults.baseUrl)),
    model: getSettingValue('model_route_heavy_model', defaults.model),
  }
}

function selectTelegramLLMConfig(agentId: string | undefined, routeText: string): {
  config: LLMConfig | null
  fallbackConfig: LLMConfig | null
  tier: 'fast' | 'heavy'
  score: number
} {
  const fallbackConfig = agentId ? resolveAgentLLMConfig(agentId) : getHeavyLLMConfig()
  const score = estimateTelegramTaskScore(routeText)
  const fastEnabled = getSettingValue('model_route_fast_enabled', 'true') !== 'false'
  if (fastEnabled && score <= 1) {
    return { config: resolveAgentTierLLMConfig(agentId, 'fast') || getFastLLMConfig(), fallbackConfig, tier: 'fast', score }
  }
  return { config: fallbackConfig, fallbackConfig, tier: 'heavy', score }
}

/** 非流式 LLM 调用（主进程无 CORS 限制，支持每 Agent 独立模型） */
async function llmChat(
  messages: Array<{ role: string; content: string }>,
  agentId?: string,
  routeText = '',
): Promise<string> {
  const selection = selectTelegramLLMConfig(agentId, routeText || messages[messages.length - 1]?.content || '')
  const primary = await llmChatWithConfig(selection.config, messages)
  if (selection.tier === 'fast' && primary.startsWith('❌')) {
    const fallback = await llmChatWithConfig(selection.fallbackConfig, messages)
    return fallback.startsWith('❌') ? primary : fallback
  }
  return primary
}

async function llmChatWithConfig(
  config: LLMConfig | null,
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  if (!config) return '❌ AI 未配置，请先在设置中配置 API Key'

  try {
    const isAnthropic = config.baseUrl.includes('/api/anthropic')
    const headers: Record<string, string> = isAnthropic
      ? { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' }
      : { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` }

    if (isAnthropic) {
      let systemPrompt: string | undefined
      const filtered = messages.filter((m) => {
        if (m.role === 'system') {
          systemPrompt = m.content
          return false
        }
        return true
      })
      const res = await fetch(`${config.baseUrl}/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          system: systemPrompt,
          messages: filtered,
          temperature: 0.7,
          max_tokens: 2048,
        }),
        signal: AbortSignal.timeout(getLLMTimeoutMs(config, 2048)),
      })
      if (!res.ok) return `❌ AI 错误: ${res.status}`
      const data = (await res.json()) as { content: Array<{ type: string; text: string }> }
      return (
        data.content
          ?.filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('') || ''
      )
    }

    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.7,
        max_tokens: 2048,
        ...(shouldDisableThinking(config, 2048) ? { thinking: { type: 'disabled' } } : {}),
      }),
      signal: AbortSignal.timeout(getLLMTimeoutMs(config, 2048)),
    })
    if (!res.ok) return `❌ AI 错误: ${res.status}`
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> }
    return data.choices?.[0]?.message?.content || ''
  } catch (err) {
    return `❌ AI 调用失败: ${(err as Error).message}`
  }
}

// ─── Brave Search ───

async function webSearch(queryText: string): Promise<string> {
  const apiKeyRow = query('SELECT value FROM settings WHERE key = ?', ['brave_api_key']) as Array<{ value: string }>
  const apiKey = apiKeyRow[0]?.value?.trim() || process.env.BRAVE_API_KEY?.trim() || ''

  if (!apiKey) return '搜索失败: 未配置 brave_api_key'

  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(queryText)}&count=5`,
      {
        headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      },
    )
    if (!res.ok) return `搜索失败: ${res.status}`
    const data = (await res.json()) as {
      web?: { results?: Array<{ title: string; url: string; description: string }> }
    }
    const results = data.web?.results || []
    if (results.length === 0) return '未找到相关结果'
    return results.map((r, i) => `${i + 1}. ${r.title}\n${r.description}\n${r.url}`).join('\n\n')
  } catch (err) {
    return `搜索失败: ${(err as Error).message}`
  }
}

// ─── 知识检索（完整深度版） ───

/** 搜索 Wiki 页面 */
function searchWiki(keywords: string): string {
  try {
    // FTS5 尝试
    try {
      const ftsRows = query(
        `SELECT title, summary, content FROM wiki_pages_fts f JOIN wiki_pages p ON p.rowid = f.rowid
         WHERE wiki_pages_fts MATCH ? LIMIT 3`,
        [keywords],
      ) as Array<{ title: string; summary: string; content: string }>
      if (ftsRows.length > 0) {
        return ftsRows.map((r) => `📖 **${r.title}**\n${(r.summary || r.content).slice(0, 300)}`).join('\n\n---\n\n')
      }
    } catch {
      /* FTS fallback */
    }

    // LIKE 回退
    const kws = keywords.match(/[\u4e00-\u9fff]{2,}|[a-zA-Z0-9]+/g) || [keywords]
    const conditions: string[] = []
    const params: unknown[] = []
    for (const kw of kws.slice(0, 6)) {
      const like = `%${kw}%`
      conditions.push('(title LIKE ? OR content LIKE ?)')
      params.push(like, like)
    }
    params.push(3)
    const rows = query(
      `SELECT title, summary, content FROM wiki_pages WHERE (${conditions.join(' OR ')}) ORDER BY importance DESC LIMIT ?`,
      params,
    ) as Array<{ title: string; summary: string; content: string }>

    if (rows.length === 0) return ''
    return rows.map((r) => `📖 **${r.title}**\n${(r.summary || r.content).slice(0, 300)}`).join('\n\n---\n\n')
  } catch {
    return ''
  }
}

/** 搜索记忆宫殿 */
function searchMemory(keywords: string): string {
  try {
    const kws = keywords.match(/[\u4e00-\u9fff]{2,}|[a-zA-Z0-9]+/g) || [keywords]
    const conditions: string[] = []
    const params: unknown[] = []
    for (const kw of kws.slice(0, 4)) {
      conditions.push('content LIKE ?')
      params.push(`%${kw}%`)
    }
    if (conditions.length === 0) return ''
    params.push(3)
    const rows = query(
      `SELECT content, source, importance FROM memory_items WHERE (${conditions.join(' OR ')}) ORDER BY importance DESC, created_at DESC LIMIT ?`,
      params,
    ) as Array<{ content: string; source: string; importance: number }>

    if (rows.length === 0) return ''
    return rows.map((r) => `🧠 [${r.source}] ${r.content.slice(0, 200)}`).join('\n\n')
  } catch {
    return ''
  }
}

/** 查询知识三元组 */
function searchTriples(keywords: string): string {
  try {
    const kws = keywords.match(/[\u4e00-\u9fff]{2,}|[a-zA-Z0-9]+/g) || [keywords]
    const conditions: string[] = []
    const params: unknown[] = []
    for (const kw of kws.slice(0, 3)) {
      const like = `%${kw}%`
      conditions.push('(subject LIKE ? OR object LIKE ?)')
      params.push(like, like)
    }
    if (conditions.length === 0) return ''
    params.push(5)
    const rows = query(
      `SELECT subject, predicate, object FROM knowledge_triples WHERE (${conditions.join(' OR ')}) LIMIT ?`,
      params,
    ) as Array<{ subject: string; predicate: string; object: string }>

    if (rows.length === 0) return ''
    return rows.map((r) => `🔗 ${r.subject} —[${r.predicate}]→ ${r.object}`).join('\n')
  } catch {
    return ''
  }
}

interface OpenbasakaMessage {
  role: string
  content: string
  time?: string
}

interface OpenbasakaConversationRow {
  id: string
  title: string
  messages_json: string
  updated_at: string
}

interface OpenbasakaArchiveCandidateRow {
  id: string
  title: string
  content: string
  status: string
  suggested_tags: string
  updated_at: string
}

const OPENBASAKA_QUERY_STOPWORDS = new Set([
  '这个',
  '那个',
  '刚刚',
  '刚才',
  '最近',
  '我们',
  '项目',
  '什么',
  '怎么',
  '一下',
  'basaka',
  'openbasaka',
])

function extractOpenbasakaKeywords(text: string): string[] {
  return (text.match(/[\u4e00-\u9fff]{2,6}|[a-zA-Z][a-zA-Z0-9_\-]{1,}/g) || [])
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !OPENBASAKA_QUERY_STOPWORDS.has(w.toLowerCase()))
    .slice(0, 6)
}

function isRecentOpenbasakaQuestion(text: string): boolean {
  return /刚刚|刚才|刚做|最近|上一轮|上次|前面|上面|这次|我们.*(做|聊|讨论|推进)|做了.*项目|什么项目|openbasaka|basaka/i.test(
    text,
  )
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function compactContextText(value: string, max = 260): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}...`
}

function parseOpenbasakaMessages(raw: string): OpenbasakaMessage[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { messages?: unknown }).messages)
        ? (parsed as { messages: unknown[] }).messages
        : []

    return list
      .map((item): OpenbasakaMessage | null => {
        const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
        const content = asString(row.content) || asString(row.text) || asString(row.message)
        if (!content.trim()) return null
        const time = asString(row.createdAt) || asString(row.timestamp) || asString(row.time)
        return {
          role: asString(row.role) || asString(row.sender) || 'unknown',
          content,
          ...(time ? { time } : {}),
        }
      })
      .filter((item): item is OpenbasakaMessage => item !== null)
  } catch {
    return []
  }
}

function renderOpenbasakaConversation(row: OpenbasakaConversationRow): string {
  const title = row.title || row.id
  const messages = parseOpenbasakaMessages(row.messages_json).slice(-6)
  const lines = messages
    .map((message) => {
      const speaker = message.role === 'assistant' ? 'BASAKA' : message.role === 'user' ? 'Boss' : message.role
      const time = message.time ? ` (${message.time})` : ''
      return `- ${speaker}${time}: ${compactContextText(message.content)}`
    })
    .join('\n')

  return [`会话: ${title}`, `更新时间: ${row.updated_at}`, lines || '- 无可读消息'].join('\n')
}

function searchOpenbasakaConversations(text: string): string {
  try {
    const recentQuestion = isRecentOpenbasakaQuestion(text)
    const keywords = extractOpenbasakaKeywords(text)
    let rows: OpenbasakaConversationRow[] = []

    if (recentQuestion || keywords.length === 0) {
      rows = query(
        `SELECT id, title, messages_json, updated_at
         FROM conversations
         WHERE context_type LIKE 'openbasaka%'
         ORDER BY updated_at DESC
         LIMIT 4`,
      ) as OpenbasakaConversationRow[]
    } else {
      const conditions: string[] = []
      const params: unknown[] = []
      for (const kw of keywords) {
        const like = `%${kw}%`
        conditions.push('(title LIKE ? OR messages_json LIKE ?)')
        params.push(like, like)
      }
      params.push(4)
      rows = query(
        `SELECT id, title, messages_json, updated_at
         FROM conversations
         WHERE context_type LIKE 'openbasaka%' AND (${conditions.join(' OR ')})
         ORDER BY updated_at DESC
         LIMIT ?`,
        params,
      ) as OpenbasakaConversationRow[]
    }

    if (rows.length === 0) return ''
    return rows.map(renderOpenbasakaConversation).join('\n\n')
  } catch {
    return ''
  }
}

function renderOpenbasakaArchiveCandidate(row: OpenbasakaArchiveCandidateRow): string {
  let tags = ''
  try {
    const parsed = JSON.parse(row.suggested_tags || '[]') as unknown
    if (Array.isArray(parsed)) tags = parsed.filter((tag) => typeof tag === 'string').join('、')
  } catch {
    tags = ''
  }

  return [
    `候选: ${row.title || row.id}`,
    `状态: ${row.status} | 更新时间: ${row.updated_at}${tags ? ` | 标签: ${tags}` : ''}`,
    compactContextText(row.content, 320),
  ]
    .filter(Boolean)
    .join('\n')
}

function searchOpenbasakaArchiveCandidates(text: string): string {
  try {
    const recentQuestion = isRecentOpenbasakaQuestion(text)
    const keywords = extractOpenbasakaKeywords(text)
    let rows: OpenbasakaArchiveCandidateRow[] = []

    if (recentQuestion || keywords.length === 0) {
      rows = query(
        `SELECT id, title, content, status, suggested_tags, updated_at
         FROM archive_candidates
         WHERE source_surface = 'openbasaka'
         ORDER BY updated_at DESC
         LIMIT 5`,
      ) as OpenbasakaArchiveCandidateRow[]
    } else {
      const conditions: string[] = []
      const params: unknown[] = []
      for (const kw of keywords) {
        const like = `%${kw}%`
        conditions.push('(title LIKE ? OR content LIKE ? OR suggested_tags LIKE ?)')
        params.push(like, like, like)
      }
      params.push(5)
      rows = query(
        `SELECT id, title, content, status, suggested_tags, updated_at
         FROM archive_candidates
         WHERE source_surface = 'openbasaka' AND (${conditions.join(' OR ')})
         ORDER BY updated_at DESC
         LIMIT ?`,
        params,
      ) as OpenbasakaArchiveCandidateRow[]
    }

    if (rows.length === 0) return ''
    return rows.map(renderOpenbasakaArchiveCandidate).join('\n\n')
  } catch {
    return ''
  }
}

function buildOpenbasakaLiveContext(text: string): string {
  const parts: string[] = []
  const conversations = searchOpenbasakaConversations(text)
  if (conversations) parts.push(`[Openbasaka 最近会话]\n${conversations}`)

  const archiveCandidates = searchOpenbasakaArchiveCandidates(text)
  if (archiveCandidates) parts.push(`[Openbasaka 归档候选]\n${archiveCandidates}`)

  if (parts.length === 0) return ''
  return `这是 Openbasaka 桌面端的实时会话与归档候选上下文，时效性高于旧 Wiki/记忆。用户问“刚刚/刚才/最近/我们做了什么/这个项目”时必须优先使用这里的证据；证据不足时直接说明不足，不要用旧知识库补成确定事实。\n\n${parts.join('\n\n')}`
}

/** 获取 Boss Profile 上下文 */
function renderBossCognitionForTelegram(json?: string): string {
  if (!json) return ''
  try {
    const profile = JSON.parse(json) as {
      mission?: string
      excitementTriggers?: string[]
      resonanceHooks?: string[]
      explanationPreferences?: string[]
      addictiveFormats?: string[]
      understandingModes?: string[]
      antiPatterns?: string[]
      integrationGoals?: string[]
    }
    const lines: string[] = []
    if (profile.mission) lines.push(`核心使命: ${profile.mission}`)
    if (profile.excitementTriggers?.length) lines.push(`激发入口: ${profile.excitementTriggers.join('、')}`)
    if (profile.resonanceHooks?.length) lines.push(`共鸣抓手: ${profile.resonanceHooks.join('、')}`)
    if (profile.explanationPreferences?.length) lines.push(`讲解偏好: ${profile.explanationPreferences.join('、')}`)
    if (profile.addictiveFormats?.length) lines.push(`呈现形式: ${profile.addictiveFormats.join('、')}`)
    if (profile.understandingModes?.length) lines.push(`理解路径: ${profile.understandingModes.join('、')}`)
    if (profile.integrationGoals?.length) lines.push(`认知整合: ${profile.integrationGoals.join('、')}`)
    if (profile.antiPatterns?.length) lines.push(`避免: ${profile.antiPatterns.join('、')}`)
    return lines.join(' | ')
  } catch {
    return ''
  }
}

function getBossContext(): string {
  try {
    const rows = query(
      "SELECT key, value FROM boss_profile WHERE key IN ('name', 'interests', 'hates', 'current_focus', 'currentFocus', 'long_term_vision', 'longTermVision', 'profiling_summary_json', 'cognitive_profile_json')",
    ) as Array<{ key: string; value: string }>
    const profile: Record<string, string> = {}
    for (const r of rows) profile[r.key] = r.value
    if (!profile.name && !profile.interests) return ''

    let profilingHeadline = ''
    let profilingPromptSummary = ''
    try {
      if (profile.profiling_summary_json) {
        const parsed = JSON.parse(profile.profiling_summary_json) as {
          headline?: string
          promptSummary?: string
        }
        profilingHeadline = parsed.headline || ''
        profilingPromptSummary = parsed.promptSummary || ''
      }
    } catch {
      /* ignore malformed profiling summary */
    }

    const currentFocus = profile.current_focus || profile.currentFocus || ''
    const longTermVision = profile.long_term_vision || profile.longTermVision || ''
    const parts: string[] = []
    if (profile.name) parts.push(`Boss: ${profile.name}`)
    if (profile.interests) parts.push(`兴趣: ${profile.interests}`)
    if (profile.hates) parts.push(`厌恶: ${profile.hates}`)
    if (currentFocus) parts.push(`当前焦点: ${currentFocus}`)
    if (longTermVision) parts.push(`长期愿景: ${longTermVision}`)
    if (profilingHeadline) parts.push(`画像标题: ${profilingHeadline}`)
    if (profilingPromptSummary) parts.push(`画像摘要: ${profilingPromptSummary}`)
    const cognition = renderBossCognitionForTelegram(profile.cognitive_profile_json)
    if (cognition) parts.push(`认知操作系统: ${cognition}`)
    return parts.join(' | ')
  } catch {
    return ''
  }
}

/** 组装完整的知识上下文 */
function assembleKnowledgeContext(text: string): string {
  const kws = text.match(/[\u4e00-\u9fff]{2,6}|[a-zA-Z][a-zA-Z0-9_\-]{1,}/g) || []
  const filtered = kws.filter((w) => w.length > 1).slice(0, 5)
  if (filtered.length === 0) return ''

  const searchQuery = filtered.join(' ')
  const parts: string[] = []

  const wiki = searchWiki(searchQuery)
  if (wiki) parts.push(wiki)

  const memory = searchMemory(searchQuery)
  if (memory) parts.push(memory)

  const triples = searchTriples(searchQuery)
  if (triples) parts.push(triples)

  return parts.join('\n\n')
}

// ─── 系统状态 ───

function getSystemStatus(): string {
  try {
    const pageCount = query('SELECT COUNT(*) as cnt FROM wiki_pages WHERE is_index = 0 AND is_log = 0') as Array<{
      cnt: number
    }>
    const sourceCount = query('SELECT COUNT(*) as cnt FROM wiki_sources') as Array<{ cnt: number }>
    const drawerCount = query('SELECT COUNT(*) as cnt FROM mempalace_drawers') as Array<{ cnt: number }>
    const uncompiled = query('SELECT COUNT(*) as cnt FROM mempalace_drawers WHERE is_compiled = 0') as Array<{
      cnt: number
    }>
    const agentCount = query('SELECT COUNT(*) as cnt FROM custom_agents') as Array<{ cnt: number }>

    return `📊 **OpenBasaka 状态**

Wiki 页面: ${pageCount[0]?.cnt || 0}
来源数量: ${sourceCount[0]?.cnt || 0}
记忆抽屉: ${drawerCount[0]?.cnt || 0}
未编译: ${uncompiled[0]?.cnt || 0}
Agent 数量: ${agentCount[0]?.cnt || 0}

运行时间: ${new Date().toLocaleString('zh-CN')}`
  } catch {
    return '❌ 获取状态失败'
  }
}

// ─── Agent 列表 ───

interface AgentInfo {
  id: string
  name: string
  icon: string
}

function listAgents(): AgentInfo[] {
  const agents: AgentInfo[] = [
    { id: 'general', name: 'BASAKA', icon: '◈' },
    { id: 'strategy', name: '战略顾问', icon: '🎯' },
    { id: 'technical', name: '技术架构师', icon: '🔧' },
    { id: 'market', name: '市场分析师', icon: '📊' },
    { id: 'creative', name: '创意火花', icon: '💡' },
    { id: 'critic', name: '魔鬼代言人', icon: '🔥' },
  ]
  try {
    const rows = query('SELECT id, name, icon FROM custom_agents ORDER BY created_at DESC') as Array<{
      id: string
      name: string
      icon: string
    }>
    for (const row of rows) {
      agents.push({ id: row.id, name: row.name, icon: row.icon || '🎭' })
    }
  } catch {
    /* ignore */
  }
  return agents
}

// ─── 构建 Agent System Prompt ───

const DEFAULT_SYSTEM_PROMPT = `你是"小白"——OpenBasaka 知识系统的 AI 助手。用户通过 Telegram 与你对话。
规则：
- 用中文回答
- 简洁有力，直接给干货
- 用 Markdown 格式
- 如果不确定实时信息，明确告知`

const BUILT_IN_AGENT_META: Record<string, { name: string; desc: string; progress: string }> = {
  general: {
    name: 'BASAKA',
    desc: '全天候数字副官，Boss 的私人情报官和项目战略顾问',
    progress: 'BASAKA 正在对齐最近上下文、知识库线索和 Boss 当前目标。',
  },
  strategy: {
    name: '战略顾问',
    desc: '战略参谋部，框架思维（波特五力/BCG/OKR/Lean Canvas）',
    progress: '战略顾问正在拆目标、资源、路线图和关键取舍。',
  },
  technical: {
    name: '技术架构师',
    desc: '首席架构师，技术选型/架构设计/性能优化',
    progress: '技术架构师正在检查实现路径、架构边界和工程风险。',
  },
  market: {
    name: '市场分析师',
    desc: '市场情报部，TAM/SAM/SOM/竞品对标/用户画像',
    progress: '市场分析师正在对齐用户、竞品、定价和需求证据。',
  },
  creative: {
    name: '创意火花',
    desc: '创新实验室，大胆联想/跨界创新/颠覆性想法',
    progress: '创意火花正在做跨界联想，寻找更有生命力的表达与玩法。',
  },
  critic: {
    name: '魔鬼代言人',
    desc: '风控部，找漏洞/质疑假设/模拟最坏情况',
    progress: '魔鬼代言人正在做压力测试：先找假设漏洞，再给缓解方案。',
  },
}

function renderTelegramSoulPrompt(soulJson?: string): string {
  if (!soulJson) return ''
  try {
    const soul = JSON.parse(soulJson) as {
      identity?: string
      tone?: string
      principles?: string[]
      avoidance?: string[]
      uncertainty?: string
      customOverride?: string
    }
    const parts = [soul.identity || '']
    if (soul.tone) parts.push(`\n## 沟通风格\n${soul.tone}`)
    if (soul.principles?.length) parts.push(`\n## 行为准则\n${soul.principles.map((p) => `- ${p}`).join('\n')}`)
    if (soul.avoidance?.length) parts.push(`\n## 避免事项\n${soul.avoidance.map((a) => `- ${a}`).join('\n')}`)
    if (soul.uncertainty) parts.push(`\n## 不确定性处理\n${soul.uncertainty}`)
    if (soul.customOverride) parts.push(`\n## 自定义指令\n${soul.customOverride}`)
    return parts.filter(Boolean).join('\n')
  } catch {
    return ''
  }
}

function isIdentityQuestion(text: string): boolean {
  return /你是谁|你能做什么|能帮我做什么|介绍一下自己|who are you/i.test(text) && text.length <= 60
}

function buildTelegramProgressMessage(agentId: string, text: string): string {
  if (isIdentityQuestion(text)) return ''
  const meta = BUILT_IN_AGENT_META[agentId]
  if (meta) return meta.progress
  return '收到。这个 Agent 正在对齐最近上下文、知识库线索和当前任务。'
}

function buildAgentPrompt(agentId: string): string {
  // 自定义 Agent → 读库
  if (agentId && agentId !== '__global__') {
    try {
      const agentRows = query('SELECT name, system_prompt, soul_json FROM custom_agents WHERE id = ?', [agentId]) as Array<{
        name: string
        system_prompt: string
        soul_json: string
      }>
      if (agentRows[0]) {
        const soulPrompt = renderTelegramSoulPrompt(agentRows[0].soul_json)
        return [
          soulPrompt || `你是"${agentRows[0].name}"——OpenBasaka 知识系统的 AI 角色。`,
          agentRows[0].system_prompt ? `\n## 角色补充\n${agentRows[0].system_prompt}` : '',
          '\n规则：用户通过 Telegram 与你对话；用中文回答，简洁有力，用 Markdown 格式。',
        ]
          .filter(Boolean)
          .join('\n')
      }
    } catch {
      /* fallback */
    }

    // 内置专家角色映射（与 src/lib/chat/router.ts EXPERTS 保持一致）
    const expert = BUILT_IN_AGENT_META[agentId]
    if (expert) {
      try {
        const soulRows = query('SELECT soul_json FROM agent_souls WHERE agent_id = ?', [agentId]) as Array<{
          soul_json: string
        }>
        const soulPrompt = renderTelegramSoulPrompt(soulRows[0]?.soul_json)
        if (soulPrompt) {
          return `${soulPrompt}\n\n规则：用户通过 Telegram 与你对话；用中文回答，简洁有力，用 Markdown 格式。`
        }
      } catch {
        /* use default built-in prompt */
      }
      return `你是"${expert.name}"——${expert.desc}。用户通过 Telegram 与你对话。\n\n规则：用中文回答，简洁有力，用 Markdown 格式。`
    }
  }

  return DEFAULT_SYSTEM_PROMPT
}

// ─── chatAgent 手动切换映射（按 chatId） ───
const chatAgentOverride = new Map<number, string>()

function clampText(value: string, max = 420): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return '无可读内容。'
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}...`
}

function recordTelegramExecution(params: {
  agentId: string
  chatId: number
  subject: string
  input: string
  output: string
  status: 'completed' | 'failed'
  tools?: Array<{ id: string; label: string; risk: 'low' | 'medium' | 'high'; status: 'completed' | 'failed' }>
  evidenceRefs?: Array<{ kind: string; id?: string; title: string }>
}) {
  const tools = params.tools?.length
    ? params.tools
    : [{ id: 'telegram-agent', label: 'Telegram Agent', risk: 'low' as const, status: params.status }]
  const receipt = {
    id: `receipt_telegram_${params.agentId || 'global'}_${Date.now().toString(36)}`,
    subject: params.subject,
    agentId: params.agentId || 'telegram',
    status: params.status,
    inputPreview: clampText(params.input),
    outputPreview: clampText(params.output),
    tools,
    evidenceRefs: params.evidenceRefs || [],
    cost: {
      inputChars: params.input.length,
      outputChars: params.output.length,
      note: '主进程本地估算字符数；尚未接入 provider token/cost 回传。',
    },
    retry: {
      recommended: params.status === 'failed',
      reason:
        params.status === 'failed'
          ? 'Telegram Agent 执行失败，需要检查模型、网络或命令输入。'
          : '执行已完成，等待复盘或下游模块消费。',
      nextStep:
        params.status === 'failed' ? '修正配置或输入后重试。' : '如输出有长期价值，归档到记忆、知识或项目状态。',
    },
    trust: {
      risk: tools.some((tool) => tool.risk === 'high')
        ? 'high'
        : tools.some((tool) => tool.risk === 'medium')
          ? 'medium'
          : 'low',
      confidence: params.status === 'completed' ? 0.72 : 0.34,
      rationale:
        params.status === 'completed' ? 'Telegram Agent 已返回结果并写入主循环账本。' : '执行失败，只作为复盘信号。',
    },
  }
  const eventId = `op_telegram_${params.agentId || 'global'}_${Date.now().toString(36)}`

  try {
    run(
      `INSERT OR REPLACE INTO operating_events
       (id, type, stage, title, summary, source_kind, source_id, source_title, confidence,
        entities_json, project_ids_json, payload_json, created_at, updated_at)
       VALUES (?, 'agent_action', 'execute', ?, ?, 'agent', ?, 'Telegram Agent', ?, ?, '[]', ?, datetime('now','localtime'), datetime('now','localtime'))`,
      [
        eventId,
        `Agent 执行：${params.subject}`,
        receipt.outputPreview,
        `telegram:${params.agentId || 'global'}`,
        receipt.trust.confidence,
        JSON.stringify(['telegram', params.agentId || 'global', ...tools.map((tool) => tool.id)]),
        JSON.stringify({
          type: 'agent_action',
          stage: 'execute',
          agentId: params.agentId || 'telegram',
          title: `Agent 执行：${params.subject}`,
          status: params.status,
          toolRefs: tools.map((tool) => tool.id),
          resultPreview: receipt.outputPreview,
          source: { kind: 'agent', sourceId: `telegram:${params.agentId || 'global'}`, title: 'Telegram Agent' },
          confidence: receipt.trust.confidence,
          entities: ['telegram', params.agentId || 'global', ...tools.map((tool) => tool.id)],
          receipt,
        }),
      ],
    )
  } catch (err) {
    console.warn('[Telegram] failed to record execution receipt:', err)
  }
}

// ─── 消息路由 ───

export function initTelegramHandler(): void {
  // 处理器签名包含 agentId 与接收消息的 botToken；回复要沿用同一个 botToken，避免多 Bot 串台。
  onMessage(async (chatId, text, username, agentId, botToken) => {
    console.log(`[Telegram:${agentId}] ${username}: ${text.slice(0, 50)}`)
    const reply = (content: string, parseMode: 'Markdown' | 'HTML' = 'Markdown') =>
      sendMessage(chatId, content, parseMode, botToken)
    const typing = (action = 'typing') => sendChatAction(chatId, action, botToken)

    try {
      // /start | /help
      if (text.startsWith('/start') || text.startsWith('/help')) {
        await reply(
          `👋 你好 ${username}！我是 OpenBasaka AI 助手。

**命令：**
/ask 关键词 — 搜索知识库
/search 关键词 — 网络搜索
/status — 系统状态
/agent — 列出可用 Agent 角色
/agent 角色名 — 切换对话角色
/remind HH:MM 内容 — 创建定时提醒
其他消息 — AI 对话`,
        )
        return
      }

      // /agent 列出可用 Agent
      if (text === '/agent') {
        const agents = listAgents()
        const lines = agents.map((a) => `${a.icon} ${a.name} (\`${a.id}\`)`).join('\n')
        const currentId = chatAgentOverride.get(chatId) || agentId
        const currentAgent = agents.find((a) => a.id === currentId)
        const currentLabel = currentAgent ? `${currentAgent.icon} ${currentAgent.name}` : agentId
        await reply(
          `🎭 **可用 Agent 角色：**\n\n${lines}\n\n当前: ${currentLabel}\n用 \`/agent 角色名\` 切换。`,
        )
        return
      }

      // /agent <name> 切换角色
      if (text.startsWith('/agent ') && text.length > 7) {
        const agentName = text.slice(7).trim()
        const agents = listAgents()
        const matched = agents.find((a) => a.name === agentName || a.id === agentName || a.name.includes(agentName))
        if (matched) {
          chatAgentOverride.set(chatId, matched.id)
          await reply(`🎭 已切换为 **${matched.name}** (${matched.icon})。后续对话将以该角色身份回复。`)
        } else {
          await reply(`❌ 未找到 Agent "${agentName}"。用 /agent 查看可用角色。`)
        }
        return
      }

      // /remind HH:MM 内容
      if (text.startsWith('/remind ')) {
        const reminderText = text.slice(8).trim()
        const timeMatch = reminderText.match(/^(\d{1,2}):(\d{2})\s+(.+)$/)
        if (!timeMatch) {
          await reply('⚠️ 格式: `/remind HH:MM 提醒内容`\n例: `/remind 09:00 每日简报`')
          return
        }
        const hour = parseInt(timeMatch[1])
        const minute = parseInt(timeMatch[2])
        const content = timeMatch[3]
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
          await reply('❌ 时间格式无效')
          return
        }
        const cronExpr = `${minute} ${hour} * * *`
        const resolvedAgentId = chatAgentOverride.get(chatId) || (agentId !== '__global__' ? agentId : '')
        try {
          const taskId = `task_tg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          run(
            `INSERT INTO scheduled_tasks (id, name, cron_expression, task_type, task_config_json, last_run, next_run, enabled, agent_id, platform_config_json)
             VALUES (?, ?, ?, 'custom', ?, '', '', 1, ?, ?)`,
            [
              taskId,
              `提醒: ${content}`,
              cronExpr,
              JSON.stringify({ prompt: content }),
              resolvedAgentId,
              JSON.stringify([{ platform: 'telegram', targetId: String(chatId), enabled: true }]),
            ],
          )
          const agentLabel = resolvedAgentId ? ` (角色: ${resolvedAgentId})` : ''
          await reply(
            `⏰ 已创建定时提醒：每天 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} — ${content}${agentLabel}`,
          )
        } catch (err) {
          await reply(`❌ 创建失败: ${(err as Error).message}`)
        }
        return
      }

      if (text.startsWith('/ask ')) {
        const keywords = text.slice(5).trim()
        if (!keywords) {
          await reply('请输入搜索关键词')
          return
        }
        await reply('🔍 搜索知识库...')
        const resolvedAgentId = normalizeTelegramAgentId(chatAgentOverride.get(chatId) || agentId)
        const sharedAgentCtx = formatSharedAgentRecentContext(resolvedAgentId, 18)
        const openbasakaLiveCtx = buildOpenbasakaLiveContext(keywords)
        const wikiResult = searchWiki(keywords)
        const result =
          [sharedAgentCtx ? `[同角色共享对话]\n${sharedAgentCtx}` : '', openbasakaLiveCtx, wikiResult]
            .filter(Boolean)
            .join('\n\n---\n\n') || '📖 知识库中未找到相关内容'
        await reply(result)
        recordTelegramExecution({
          agentId: chatAgentOverride.get(chatId) || agentId,
          chatId,
          subject: 'Telegram｜知识库搜索',
          input: keywords,
          output: result,
          status: 'completed',
          tools: [{ id: 'telegram-ask', label: 'Telegram /ask', risk: 'low', status: 'completed' }],
          evidenceRefs: [
            ...(sharedAgentCtx ? [{ kind: 'conversation', title: 'Shared agent context' }] : []),
            ...(openbasakaLiveCtx ? [{ kind: 'conversation', title: 'Openbasaka live context' }] : []),
            ...(wikiResult ? [{ kind: 'knowledge', title: 'Wiki search' }] : []),
          ],
        })
        return
      }

      if (text.startsWith('/search ')) {
        const q = text.slice(8).trim()
        if (!q) {
          await reply('请输入搜索内容')
          return
        }
        await reply('🔍 搜索网络...')
        const result = await webSearch(q)
        await reply(result)
        recordTelegramExecution({
          agentId: chatAgentOverride.get(chatId) || agentId,
          chatId,
          subject: 'Telegram｜网络搜索',
          input: q,
          output: result,
          status: result.startsWith('搜索失败') ? 'failed' : 'completed',
          tools: [
            {
              id: 'telegram-search',
              label: 'Telegram /search',
              risk: 'low',
              status: result.startsWith('搜索失败') ? 'failed' : 'completed',
            },
          ],
          evidenceRefs: [{ kind: 'tool', id: 'brave_search', title: 'Brave Search' }],
        })
        return
      }

      if (text === '/status') {
        const status = getSystemStatus()
        await reply(status)
        return
      }

      // ─── 默认：AI 对话（深度知识注入 + Agent 角色） ───

      // 1. 确定当前 Agent
      const resolvedAgentId = normalizeTelegramAgentId(chatAgentOverride.get(chatId) || agentId)
      if (consumeOpenbasakaMirroredUserMessage(resolvedAgentId, text)) {
        return
      }
      appendTelegramConversationMessage(chatId, resolvedAgentId, 'user', text, 'telegram')

      const groundedRecall = answerSharedAgentRecallQuestion(resolvedAgentId, text)
      if (groundedRecall) {
        await reply(groundedRecall)
        appendTelegramConversationMessage(chatId, resolvedAgentId, 'assistant', groundedRecall, 'telegram')
        recordTelegramExecution({
          agentId: resolvedAgentId,
          chatId,
          subject: 'Telegram｜共享账本精确回忆',
          input: text,
          output: groundedRecall,
          status: 'completed',
          tools: [{ id: 'shared-agent-ledger', label: 'Shared Agent Ledger', risk: 'low', status: 'completed' }],
          evidenceRefs: [{ kind: 'conversation', title: 'Shared agent context' }],
        })
        return
      }

      const recentTelegramCtx = formatTelegramRecentContext(loadTelegramConversation(chatId, resolvedAgentId, 12))
      const sharedAgentCtx = formatSharedAgentRecentContext(resolvedAgentId, 18)
      await typing()

      // 2. 构建 Agent System Prompt
      const agentPrompt = buildAgentPrompt(resolvedAgentId)

      // 3. 组装完整知识上下文
      const openbasakaLiveCtx = buildOpenbasakaLiveContext(text)
      const knowledgeCtx = assembleKnowledgeContext(text)

      // 4. Boss Profile 注入
      const bossCtx = getBossContext()
      const progressMessage = buildTelegramProgressMessage(resolvedAgentId, text)
      if (progressMessage) {
        await reply(progressMessage)
      }

      // 5. 拼装最终 system prompt
      const contextParts: string[] = [agentPrompt]
      if (bossCtx) {
        contextParts.push(`\n<boss-profile>\n${bossCtx}\n</boss-profile>`)
      }
      if (recentTelegramCtx) {
        contextParts.push(
          `\n<telegram-recent-context>\n${recentTelegramCtx}\n</telegram-recent-context>\n\n这是 Telegram 最近对话上下文，可能包含定时任务主动推送。用户说“第二个”“刚才那个”“上面那条”“没懂”时，必须优先从这里解析指代，不要轻易回答“没有上下文”。`,
        )
      }
      if (sharedAgentCtx) {
        contextParts.push(
          `\n<shared-agent-context>\n${sharedAgentCtx}\n</shared-agent-context>\n\n这是同一 Agent 角色在 Openbasaka、Telegram、Cron、Codex 入口的共享对话账本。用户问“之前/刚刚/最近做了什么”“同步暗号”“专属暗号”时，必须优先使用这里的最新跨入口记录；遇到 SYNC-*、*-ONLY-*、Codex 工作记录等精确标记，必须逐字引用最新用户记录，不要只从旧项目档案里猜。`,
        )
      }
      if (openbasakaLiveCtx) {
        contextParts.push(
          `\n<openbasaka-live-context>\n${openbasakaLiveCtx}\n</openbasaka-live-context>\n\n这是 Openbasaka 桌面端最近真实上下文。它比旧 Wiki/记忆更适合回答“刚刚我们做了什么”“最近聊了哪个项目”等问题。回答时要引用这里的具体会话线索；如果这里没有覆盖用户所指内容，要明确说证据不足。`,
        )
      }
      if (knowledgeCtx) {
        contextParts.push(
          `\n<knowledge-context>\n${knowledgeCtx}\n</knowledge-context>\n\n请优先参考上述知识库与记忆内容来回答用户的问题。如果知识库中没有相关信息，用你自身的知识回答。`,
        )
      }

      const answer = await llmChat(
        [
          { role: 'system', content: contextParts.join('\n') },
          { role: 'user', content: text },
        ],
        resolvedAgentId,
        text,
      )
      await reply(answer)
      appendTelegramConversationMessage(chatId, resolvedAgentId, 'assistant', answer, 'telegram')
      recordTelegramExecution({
        agentId: resolvedAgentId,
        chatId,
        subject: 'Telegram｜Agent 对话',
        input: text,
        output: answer,
        status: answer.startsWith('❌') ? 'failed' : 'completed',
        tools: [
          {
            id: 'telegram-agent',
            label: 'Telegram Agent',
            risk: 'low',
            status: answer.startsWith('❌') ? 'failed' : 'completed',
          },
        ],
        evidenceRefs: [
          ...(bossCtx ? [{ kind: 'memory', title: 'Boss profile context' }] : []),
          ...(recentTelegramCtx ? [{ kind: 'memory', title: 'Telegram recent context' }] : []),
          ...(sharedAgentCtx ? [{ kind: 'conversation', title: 'Shared agent context' }] : []),
          ...(openbasakaLiveCtx ? [{ kind: 'conversation', title: 'Openbasaka live context' }] : []),
          ...(knowledgeCtx ? [{ kind: 'knowledge', title: 'Telegram knowledge context' }] : []),
        ],
      })
    } catch (err) {
      console.error('[Telegram] handler error:', err)
      recordTelegramExecution({
        agentId,
        chatId,
        subject: 'Telegram｜处理失败',
        input: text,
        output: (err as Error).message,
        status: 'failed',
        tools: [{ id: 'telegram-agent', label: 'Telegram Agent', risk: 'low', status: 'failed' }],
      })
      await reply(`❌ 处理失败: ${(err as Error).message}`).catch(() => {})
    }
  })
}
