/**
 * Telegram 消息处理器 — 多 Agent 版
 * 每个 Bot 实例的消息自动绑定对应 Agent 角色
 * 路由：/ask → 知识库搜索 | /search → 网络搜索 | 普通消息 → AI 对话 | /status → 系统状态
 */
import { sendMessage, onMessage } from './bot'
import { query, run } from '../database'

// ─── LLM 配置 ───

const DEFAULT_LLM_CONFIGS: Record<string, { baseUrl: string; model: string }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  minimax: { baseUrl: 'https://api.minimax.chat/v1', model: 'minimax-M2.7' },
  ollama: { baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:14b' },
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

/** 获取 Agent 专属 LLM 配置 — 优先使用角色专属配置，无则回退全局 */
function resolveAgentLLMConfig(agentId: string): LLMConfig | null {
  if (!agentId || agentId === '__global__') return getLLMConfig()

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
      if (!apiKey && provider !== 'ollama') return getLLMConfig()
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

  return getLLMConfig()
}

/** 非流式 LLM 调用（主进程无 CORS 限制，支持每 Agent 独立模型） */
async function llmChat(messages: Array<{ role: string; content: string }>, agentId?: string): Promise<string> {
  const config = agentId ? resolveAgentLLMConfig(agentId) : getLLMConfig()
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
        signal: AbortSignal.timeout(60000),
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
      body: JSON.stringify({ model: config.model, messages, temperature: 0.7, max_tokens: 2048 }),
      signal: AbortSignal.timeout(60000),
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

function buildAgentPrompt(agentId: string): string {
  // 自定义 Agent → 读库
  if (agentId && agentId !== '__global__') {
    try {
      const agentRows = query('SELECT name, system_prompt FROM custom_agents WHERE id = ?', [agentId]) as Array<{
        name: string
        system_prompt: string
      }>
      if (agentRows[0]) {
        return `你是"${agentRows[0].name}"——OpenBasaka 知识系统的 AI 角色。用户通过 Telegram 与你对话。\n${agentRows[0].system_prompt}\n\n规则：用中文回答，简洁有力，用 Markdown 格式。`
      }
    } catch {
      /* fallback */
    }

    // 内置专家角色映射（与 src/lib/chat/router.ts EXPERTS 保持一致）
    const builtInMap: Record<string, { name: string; desc: string }> = {
      general: { name: 'BASAKA', desc: '全天候数字副官，Boss 的私人情报官和项目战略顾问' },
      strategy: { name: '战略顾问', desc: '战略参谋部，框架思维（波特五力/BCG/OKR/Lean Canvas）' },
      technical: { name: '技术架构师', desc: '首席架构师，技术选型/架构设计/性能优化' },
      market: { name: '市场分析师', desc: '市场情报部，TAM/SAM/SOM/竞品对标/用户画像' },
      creative: { name: '创意火花', desc: '创新实验室，大胆联想/跨界创新/颠覆性想法' },
      critic: { name: '魔鬼代言人', desc: '风控部，找漏洞/质疑假设/模拟最坏情况' },
    }
    const expert = builtInMap[agentId]
    if (expert) {
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
  // 新的处理器签名包含 agentId
  onMessage(async (chatId, text, username, agentId) => {
    console.log(`[Telegram:${agentId}] ${username}: ${text.slice(0, 50)}`)

    try {
      // /start | /help
      if (text.startsWith('/start') || text.startsWith('/help')) {
        await sendMessage(
          chatId,
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
        await sendMessage(
          chatId,
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
          await sendMessage(chatId, `🎭 已切换为 **${matched.name}** (${matched.icon})。后续对话将以该角色身份回复。`)
        } else {
          await sendMessage(chatId, `❌ 未找到 Agent "${agentName}"。用 /agent 查看可用角色。`)
        }
        return
      }

      // /remind HH:MM 内容
      if (text.startsWith('/remind ')) {
        const reminderText = text.slice(8).trim()
        const timeMatch = reminderText.match(/^(\d{1,2}):(\d{2})\s+(.+)$/)
        if (!timeMatch) {
          await sendMessage(chatId, '⚠️ 格式: `/remind HH:MM 提醒内容`\n例: `/remind 09:00 每日简报`')
          return
        }
        const hour = parseInt(timeMatch[1])
        const minute = parseInt(timeMatch[2])
        const content = timeMatch[3]
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
          await sendMessage(chatId, '❌ 时间格式无效')
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
          await sendMessage(
            chatId,
            `⏰ 已创建定时提醒：每天 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} — ${content}${agentLabel}`,
          )
        } catch (err) {
          await sendMessage(chatId, `❌ 创建失败: ${(err as Error).message}`)
        }
        return
      }

      if (text.startsWith('/ask ')) {
        const keywords = text.slice(5).trim()
        if (!keywords) {
          await sendMessage(chatId, '请输入搜索关键词')
          return
        }
        await sendMessage(chatId, '🔍 搜索知识库...')
        const result = searchWiki(keywords) || '📖 知识库中未找到相关内容'
        await sendMessage(chatId, result)
        recordTelegramExecution({
          agentId: chatAgentOverride.get(chatId) || agentId,
          chatId,
          subject: 'Telegram｜知识库搜索',
          input: keywords,
          output: result,
          status: 'completed',
          tools: [{ id: 'telegram-ask', label: 'Telegram /ask', risk: 'low', status: 'completed' }],
          evidenceRefs: [{ kind: 'knowledge', title: 'Wiki search' }],
        })
        return
      }

      if (text.startsWith('/search ')) {
        const q = text.slice(8).trim()
        if (!q) {
          await sendMessage(chatId, '请输入搜索内容')
          return
        }
        await sendMessage(chatId, '🔍 搜索网络...')
        const result = await webSearch(q)
        await sendMessage(chatId, result)
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
        await sendMessage(chatId, status)
        return
      }

      // ─── 默认：AI 对话（深度知识注入 + Agent 角色） ───

      // 1. 确定当前 Agent
      const resolvedAgentId = chatAgentOverride.get(chatId) || agentId

      // 2. 构建 Agent System Prompt
      const agentPrompt = buildAgentPrompt(resolvedAgentId)

      // 3. 组装完整知识上下文
      const knowledgeCtx = assembleKnowledgeContext(text)

      // 4. Boss Profile 注入
      const bossCtx = getBossContext()

      // 5. 拼装最终 system prompt
      const contextParts: string[] = [agentPrompt]
      if (bossCtx) {
        contextParts.push(`\n<boss-profile>\n${bossCtx}\n</boss-profile>`)
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
      )
      await sendMessage(chatId, answer)
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
      await sendMessage(chatId, `❌ 处理失败: ${(err as Error).message}`).catch(() => {})
    }
  })
}
