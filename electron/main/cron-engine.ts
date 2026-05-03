/**
 * Cron Engine — 定时任务执行引擎 v2 (委托模式)
 *
 * 60 秒轮询 scheduled_tasks 表，发现到期任务后：
 * 1. 优先委托给渲染进程执行（可使用完整 Agent 栈）
 * 2. 渲染进程不可用时 fallback 到主进程极简执行
 *
 * 任务类型：
 * - research: 基于 Boss 偏好搜索外网
 * - report: 生成近期活动摘要
 * - memory-scan: 扫描记忆模式，发现知识缺口
 * - wiki-compile: Wiki 编译（Karpathy 结晶化）
 * - lint: Wiki 体检
 * - custom: 用户自定义任务
 * - agent-task: 通用 Agent 任务（完整 Agent 栈）
 * - team-workflow: 群策团队工作流（需要渲染进程）
 */
import { CronExpressionParser } from 'cron-parser'
import { BrowserWindow } from 'electron'
import { query, run } from './database'

// ─── 类型 ───

interface CronTask {
  id: string
  name: string
  cronExpression: string
  taskType: string
  taskConfig: Record<string, unknown>
  enabled: boolean
  lastRun: string
  agentId: string
  platformConfigJson: string
}

interface LLMConfigMain {
  provider: string
  apiKey: string
  baseUrl: string
  model: string
}

/** 渲染进程返回的任务执行结果 */
interface CronTaskResult {
  taskId: string
  status: 'success' | 'error'
  result?: string
  error?: string
}

// ─── 状态 ───

let pollInterval: ReturnType<typeof setInterval> | null = null
const runningTasks = new Set<string>()

/** 等待渲染进程任务结果的 Promise 解析器 */
const pendingResults = new Map<string, {
  resolve: (result: CronTaskResult) => void
  timer: ReturnType<typeof setTimeout>
}>()

function normalizeCronExpression(expression: string): string {
  const text = String(expression || '').trim()
  const daily = text.match(/^(?:每天\s*)?(\d{1,2})[:：](\d{1,2})$/)
  if (daily) {
    const hour = Math.max(0, Math.min(23, Number(daily[1])))
    const minute = Math.max(0, Math.min(59, Number(daily[2])))
    return `${minute} ${hour} * * *`
  }
  return text
}

// ─── LLM 配置读取 ───

const DEFAULT_LLM_CONFIGS: Record<string, { baseUrl: string; model: string }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  minimax: { baseUrl: 'https://api.minimax.chat/v1', model: 'MiniMax-Text-01' },
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

function getSettingValue(key: string, fallback = ''): string {
  try {
    const rows = query('SELECT value FROM settings WHERE key = ?', [key]) as Array<{ value: string }>
    return rows[0]?.value || fallback
  } catch {
    return fallback
  }
}

function getLLMConfig(): LLMConfigMain | null {
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
}

function getFastLLMConfig(): LLMConfigMain | null {
  const provider = getSettingValue('model_role_local_fast_provider', 'deepseek')
  const defaults = DEFAULT_LLM_CONFIGS[provider] || DEFAULT_LLM_CONFIGS.deepseek
  const apiKey = getSettingValue('model_role_local_fast_api_key', '')
  if (!apiKey && provider !== 'ollama') return null
  return {
    provider,
    apiKey,
    baseUrl: normalizeBaseUrl(provider, getSettingValue('model_role_local_fast_base_url', defaults.baseUrl)),
    model: getSettingValue('model_role_local_fast_model', defaults.model),
  }
}

/** 解析 Agent 专属 LLM 配置，fallback 到全局配置 */
function resolveAgentLLMConfig(agentId: string): LLMConfigMain | null {
  const heavyProviderRow = query('SELECT value FROM settings WHERE key = ?', [`agent_${agentId}_heavy_provider`]) as Array<{ value: string }>
  const legacyProviderRow = query('SELECT value FROM settings WHERE key = ?', [`agent_${agentId}_provider`]) as Array<{ value: string }>
  const agentProvider = heavyProviderRow[0]?.value || legacyProviderRow[0]?.value
  if (!agentProvider) return getLLMConfig()

  const prefix = heavyProviderRow[0]?.value ? `agent_${agentId}_heavy` : `agent_${agentId}`
  const agentApiKeyRow = query('SELECT value FROM settings WHERE key = ?', [`${prefix}_api_key`]) as Array<{ value: string }>
  const agentBaseUrlRow = query('SELECT value FROM settings WHERE key = ?', [`${prefix}_base_url`]) as Array<{ value: string }>
  const agentModelRow = query('SELECT value FROM settings WHERE key = ?', [`${prefix}_model`]) as Array<{ value: string }>

  const defaults = DEFAULT_LLM_CONFIGS[agentProvider] || DEFAULT_LLM_CONFIGS.deepseek
  const apiKey = agentApiKeyRow[0]?.value || ''
  const baseUrl = normalizeBaseUrl(agentProvider, agentBaseUrlRow[0]?.value || defaults.baseUrl)
  const model = agentModelRow[0]?.value || defaults.model

  if (!apiKey && agentProvider !== 'ollama') return getLLMConfig()
  return { provider: agentProvider, apiKey, baseUrl, model }
}

function getTaskLLMConfig(task: CronTask): LLMConfigMain | null {
  if (task.agentId) return resolveAgentLLMConfig(task.agentId)
  return getLLMConfig()
}

function getTaskGoal(task: CronTask): string {
  const candidates = [
    task.taskConfig.goal,
    task.taskConfig.prompt,
    task.taskConfig.query,
    task.taskConfig.topic,
    task.taskConfig.description,
    task.taskConfig.objective,
    task.name,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return task.name || '未命名任务'
}

function isFailureLikeTaskResult(task: CronTask, result: string): boolean {
  const text = result.trim()
  if (!text) return true
  if (/LLM.*未配置|LLM 配置不可用|无法生成|解析失败|执行失败|调用失败|搜索失败|无研究结果/i.test(text)) {
    return true
  }
  if (
    (task.taskType === 'lint' || task.taskType === 'agent-task' || task.taskType === 'team-workflow') &&
    /fallback 不可用|需要渲染进程支持/i.test(text)
  ) {
    return true
  }
  return false
}

function getBossResearchContext(): {
  interests: string
  currentFocus: string
  longTermVision: string
  profilingPromptSummary: string
  recommendedTopics: string[]
} {
  const rows = query(
    "SELECT key, value FROM boss_profile WHERE key IN ('interests', 'current_focus', 'currentFocus', 'long_term_vision', 'longTermVision', 'profiling_summary_json')"
  ) as Array<{ key: string; value: string }>

  const profile: Record<string, string> = {}
  for (const row of rows) profile[row.key] = row.value

  let profilingPromptSummary = ''
  let recommendedTopics: string[] = []
  try {
    if (profile.profiling_summary_json) {
      const parsed = JSON.parse(profile.profiling_summary_json) as {
        promptSummary?: string
        recommendedResearchTopics?: string[]
      }
      profilingPromptSummary = parsed.promptSummary || ''
      recommendedTopics = Array.isArray(parsed.recommendedResearchTopics)
        ? parsed.recommendedResearchTopics.filter(Boolean)
        : []
    }
  } catch { /* ignore malformed profiling summary */ }

  return {
    interests: profile.interests || '',
    currentFocus: profile.current_focus || profile.currentFocus || '',
    longTermVision: profile.long_term_vision || profile.longTermVision || '',
    profilingPromptSummary,
    recommendedTopics,
  }
}

// ─── 主进程 LLM 调用（Fallback 极简版） ───

async function llmChat(prompt: string, systemPrompt: string, config?: LLMConfigMain): Promise<string> {
  const cfg = config || getLLMConfig()
  if (!cfg) return ''

  const primary = await llmChatWithConfig(prompt, systemPrompt, cfg)
  if (primary) return primary

  const fallback = getFastLLMConfig()
  if (!fallback || (fallback.provider === cfg.provider && fallback.model === cfg.model && fallback.baseUrl === cfg.baseUrl)) {
    return ''
  }
  return llmChatWithConfig(prompt, systemPrompt, fallback)
}

async function llmChatWithConfig(prompt: string, systemPrompt: string, cfg: LLMConfigMain): Promise<string> {
  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ]
    const maxTokens = 1024
    const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: 0.5,
        max_tokens: maxTokens,
        ...(shouldDisableThinking(cfg, maxTokens) ? { thinking: { type: 'disabled' } } : {}),
      }),
      signal: AbortSignal.timeout(getLLMTimeoutMs(cfg, maxTokens)),
    })
    if (!response.ok) {
      console.warn(`[Cron:llm] ${cfg.provider}/${cfg.model} returned ${response.status}: ${(await response.text()).slice(0, 180)}`)
      return ''
    }
    const data = await response.json()
    return data.choices?.[0]?.message?.content || ''
  } catch (err) {
    console.error('[Cron:llm] Error:', err)
    return ''
  }
}

function getLLMTimeoutMs(config: LLMConfigMain, maxTokens: number): number {
  if (config.provider === 'glm' || /^glm-5/i.test(config.model)) {
    return Math.min(180000, Math.max(90000, maxTokens * 50))
  }
  return Math.min(90000, Math.max(30000, maxTokens * 20))
}

function shouldDisableThinking(config: LLMConfigMain, maxTokens: number): boolean {
  return (config.provider === 'glm' || /^glm-5/i.test(config.model)) && maxTokens <= 2048
}

// ─── 写入 Innovation Lab ───

function writeToInnovationLab(content: string, taskType: string, taskName: string, source: string): void {
  const id = `cron_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  run(
    `INSERT INTO memory_items (id, room_id, type, content, source, importance, metadata_json, created_at, updated_at)
     VALUES (?, 'room_innovation', 'cron_harvest', ?, ?, 60, ?, datetime('now','localtime'), datetime('now','localtime'))`,
    [id, content, source, JSON.stringify({ taskType, taskName })]
  )

  // Telegram 推送
  try {
    const tokenRow = query('SELECT value FROM settings WHERE key = ?', ['telegram_bot_token']) as Array<{ value: string }>
    if (tokenRow[0]?.value) {
      const { sendMessage } = require('./telegram/bot') as typeof import('./telegram/bot')
      const chatIdsRow = query('SELECT value FROM settings WHERE key = ?', ['telegram_chat_ids']) as Array<{ value: string }>
      const chatIds = (chatIdsRow[0]?.value || '').split(',').map(Number).filter(n => !isNaN(n))
      const msg = `⏰ *Cron: ${taskName}*\n${content.slice(0, 500)}`
      for (const chatId of chatIds) {
        sendMessage(chatId, msg).catch(() => {})
      }
    }
  } catch { /* non-critical */ }
}

// ─── 渲染进程委托 ───

/** 获取可用的渲染进程窗口 */
function getAvailableWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  // 优先使用 sandbox 窗口（全功能）
  const sandbox = windows.find(w => {
    const title = w.getTitle()
    return title.includes('Sandbox') || title.includes('沙盘')
  })
  if (sandbox && !sandbox.isDestroyed()) return sandbox

  // 其次使用 ghost 窗口
  const ghost = windows.find(w => {
    const title = w.getTitle()
    return title.includes('Ghost') || title.includes('幽灵')
  })
  if (ghost && !ghost.isDestroyed()) return ghost

  // 最后使用任何可用窗口
  return windows.find(w => !w.isDestroyed()) || null
}

/** 委托任务到渲染进程执行，带超时 */
function delegateToRenderer(task: CronTask): Promise<CronTaskResult> {
  return new Promise((resolve) => {
    const win = getAvailableWindow()
    if (!win) {
      resolve({ taskId: task.id, status: 'error', error: '无可用渲染进程窗口' })
      return
    }

    // 注册结果等待
    const timer = setTimeout(() => {
      pendingResults.delete(task.id)
      resolve({ taskId: task.id, status: 'error', error: `渲染进程执行超时（${Math.round(getDelegateTimeoutMs(task) / 60_000)}分钟）` })
    }, getDelegateTimeoutMs(task))

    pendingResults.set(task.id, { resolve, timer })

    // 发送任务到渲染进程
    win.webContents.send('cron:execute-task', {
      id: task.id,
      name: task.name,
      taskType: task.taskType,
      taskConfig: task.taskConfig,
      agentId: task.agentId,
      platformConfigJson: task.platformConfigJson,
    })
  })
}

/** 接收渲染进程的任务执行结果（由 IPC handler 调用） */
export function handleCronTaskResult(result: CronTaskResult): void {
  const pending = pendingResults.get(result.taskId)
  if (pending) {
    clearTimeout(pending.timer)
    pendingResults.delete(result.taskId)
    pending.resolve(result)
  }
}

// ─── Fallback 任务执行器（主进程极简版） ───

async function fallbackExecuteResearch(task: CronTask): Promise<string> {
  const config = getTaskLLMConfig(task)
  if (!config) return 'LLM 配置不可用'

  const boss = getBossResearchContext()
  const bossInterests = boss.interests || '全领域'
  const taskGoal = getTaskGoal(task)
  const runTime = new Date().toLocaleString('zh-CN')

  const result = await llmChat(
    `任务名称: ${task.name}
用户原始需求: ${taskGoal}
执行时间: ${runTime}
任务配置: ${JSON.stringify({ name: task.name, goal: taskGoal, config: task.taskConfig }, null, 2)}

Boss兴趣: ${bossInterests}
Boss当前焦点: ${boss.currentFocus || '未明确'}
Boss长期愿景: ${boss.longTermVision || '未明确'}
画像摘要: ${boss.profilingPromptSummary || '暂无'}
建议研究方向: ${boss.recommendedTopics.join('、') || '暂无'}

生成3条有价值的研究洞察（每条50字以内）。
要求：
- 必须直接回应用户原始需求，不要被 Boss 画像改写成抽象人格/认知模型主题
- 如果用户原始需求要求“AI最新趋势”，三条都必须围绕 AI 最新模型、Agent、产品、研究或产业事件
- 当前为主进程 fallback，无法保证实时搜索；开头必须标注“未接入实时搜索（fallback）”
- 不要只给宽泛趋势词，要尽量给出可行动观察点`,
    '你是研究助理。主进程 fallback 没有完整工具链时，必须诚实标注实时搜索不可用，并严格贴合任务名称。',
    config
  )
  const finalResult = result ? `任务对齐：${taskGoal}\n执行时间：${runTime}\n${result}` : ''
  if (finalResult) writeToInnovationLab(finalResult, task.taskType, task.name, 'fallback:research')
  return finalResult || '无结果'
}

async function fallbackExecuteReport(task: CronTask): Promise<string> {
  const config = getTaskLLMConfig(task)
  if (!config) return 'LLM 配置不可用'

  const recentProjects = query(
    "SELECT title, survival_grade FROM projects ORDER BY created_at DESC LIMIT 5"
  ) as Array<{ title: string; survival_grade: string }>
  const memoryGrowth = query(
    "SELECT COUNT(*) as cnt FROM memory_items WHERE created_at > datetime('now', '-7 days')"
  ) as Array<{ cnt: number }>

  const result = await llmChat(
    `近期项目: ${JSON.stringify(recentProjects)}\n7天新增记忆: ${memoryGrowth[0]?.cnt || 0}\n\n生成简短活动报告。`,
    '你是数据分析师。生成简洁的活动报告。',
    config
  )
  if (result) writeToInnovationLab(result, task.taskType, task.name, 'fallback:report')
  return result || '无结果'
}

async function fallbackExecuteMemoryScan(task: CronTask): Promise<string> {
  const recentMemories = query(
    "SELECT content, importance FROM memory_items WHERE created_at > datetime('now', '-7 days') ORDER BY importance DESC LIMIT 30"
  ) as Array<{ content: string; importance: number }>

  const roomCounts = query(
    'SELECT r.name, COUNT(m.id) as cnt FROM memory_rooms r LEFT JOIN memory_items m ON r.id = m.room_id GROUP BY r.id'
  ) as Array<{ name: string; cnt: number }>

  const findings: string[] = []
  if (recentMemories.length > 0) {
    findings.push(`近7天记忆: ${recentMemories.length}条`)
  }
  const sparse = roomCounts.filter(r => r.cnt < 3)
  if (sparse.length > 0) {
    findings.push(`知识缺口: ${sparse.map(r => `${r.name}(${r.cnt})`).join(', ')}`)
  }

  const result = findings.join('\n') || '无足够数据'
  writeToInnovationLab(result, task.taskType, task.name, 'fallback:scan')
  return result
}

async function fallbackExecuteCustom(task: CronTask): Promise<string> {
  const config = getTaskLLMConfig(task)
  if (!config) return 'LLM 配置不可用'

  const prompt = (task.taskConfig.prompt as string) || task.name
  const result = await llmChat(prompt, '你是 Boss 的 AI 助手。', config)
  if (result) writeToInnovationLab(result, task.taskType, task.name, 'fallback:custom')
  return result || '无结果'
}

async function fallbackExecuteWikiCompile(task: CronTask): Promise<string> {
  const config = getTaskLLMConfig(task)
  if (!config) return 'LLM 配置不可用'

  const countRows = query(
    'SELECT COUNT(*) as cnt FROM mempalace_drawers WHERE is_compiled = 0'
  ) as Array<{ cnt: number }>
  const uncompiledCount = countRows[0]?.cnt || 0

  if (uncompiledCount < 1) return '无未编译抽屉'

  const batchSize = (task.taskConfig.batchSize as number) || 20
  const drawers = query(
    'SELECT * FROM mempalace_drawers WHERE is_compiled = 0 ORDER BY created_at ASC LIMIT ?',
    [batchSize]
  ) as Array<Record<string, unknown>>

  if (drawers.length === 0) return '无未编译抽屉'

  // 简化编译：直接让 LLM 处理
  const rawBundle = drawers.map(d =>
    `--- Drawer: ${d.id} ---\n${(d.raw_content as string || '').slice(0, 3000)}`
  ).join('\n\n')

  const COMPILE_SYSTEM = `你是知识结晶引擎。将原始内容编译为 Wiki 页面。
输出 JSON 数组: [{"title":"...","summary":"...","content":"Markdown...","category":"general","tags":[],"importance":50}]`
  const result = await llmChat(rawBundle, COMPILE_SYSTEM, config)

  if (result) {
    const jsonMatch = result.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      try {
        const pages = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>
        for (const page of pages) {
          const title = (page.title as string) || 'Untitled'
          const slug = title.toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)
          const pageId = `page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

          const existing = query('SELECT id FROM wiki_pages WHERE slug = ?', [slug]) as Array<{ id: string }>
          if (existing.length > 0) {
            run(
              `UPDATE wiki_pages SET content = ?, summary = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
              [page.content || '', page.summary || '', existing[0].id]
            )
          } else {
            run(
              `INSERT OR IGNORE INTO wiki_pages (id, title, slug, content, summary, category, tags, source_ids, importance, confidence, metadata_json, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0.7, ?, datetime('now','localtime'), datetime('now','localtime'))`,
              [pageId, title, slug, page.content || '', page.summary || '', page.category || 'general',
               JSON.stringify(page.tags || []), JSON.stringify(drawers.map(d => d.id)),
               page.importance || 50, JSON.stringify({ compiledBy: 'fallback' })]
            )
          }

          for (const d of drawers) {
            run("UPDATE mempalace_drawers SET is_compiled = 1, compiled_page_id = ?, updated_at = datetime('now','localtime') WHERE id = ?",
              [pageId, d.id])
          }
        }
        return `编译完成: ${pages.length} 页面, ${drawers.length} 抽屉`
      } catch { /* parse error */ }
    }
  }
  return result || '无结果'
}

/** Fallback 执行映射 */
async function fallbackExecute(task: CronTask): Promise<string> {
  switch (task.taskType) {
    case 'research': return fallbackExecuteResearch(task)
    case 'report': return fallbackExecuteReport(task)
    case 'memory-scan': return fallbackExecuteMemoryScan(task)
    case 'custom': return fallbackExecuteCustom(task)
    case 'wiki-compile': return fallbackExecuteWikiCompile(task)
    case 'lint': return 'Lint 任务需要渲染进程支持，fallback 不可用'
    case 'agent-task': return 'Agent 任务需要渲染进程支持，fallback 不可用'
    case 'team-workflow': return '群策工作流需要渲染进程支持，fallback 不可用'
    default: return `未知任务类型: ${task.taskType}`
  }
}

function getDelegateTimeoutMs(task: CronTask): number {
  const configured = Number(task.taskConfig.timeoutMs || task.taskConfig.timeout_ms)
  if (Number.isFinite(configured) && configured >= 30_000) return Math.min(configured, 30 * 60 * 1000)
  if (task.taskType === 'team-workflow') return 15 * 60 * 1000
  if (task.taskType === 'agent-task') return 8 * 60 * 1000
  return 5 * 60 * 1000
}

function hasEnabledPlatformTarget(raw: string): boolean {
  try {
    const targets = JSON.parse(raw || '[]') as Array<{ enabled?: boolean }>
    return Array.isArray(targets) && targets.some((target) => target.enabled)
  } catch {
    return false
  }
}

// ─── 引擎核心 ───

/** 启动 cron 引擎 */
export function startCronEngine(): void {
  // Bootstrap 默认任务
  try {
    run(`INSERT OR IGNORE INTO scheduled_tasks (id, name, cron_expression, task_type, task_config_json, enabled)
         VALUES ('task_wiki_compile', 'Wiki Compiler', '0 */6 * * *', 'wiki-compile', '{"batchSize":20}', 1)`)
    // Hermes 闭环：知识衰减扫描（每天凌晨3点 — 降低长期未访问记忆的重要性）
    run(`INSERT OR IGNORE INTO scheduled_tasks (id, name, cron_expression, task_type, task_config_json, enabled)
         VALUES ('task_memory_decay', 'Memory Decay', '0 3 * * *', 'memory-scan', '{"mode":"decay","decayRate":0.95,"minImportance":10}', 1)`)
    // Wiki 体检（每天凌晨4点）
    run(`INSERT OR IGNORE INTO scheduled_tasks (id, name, cron_expression, task_type, task_config_json, enabled)
         VALUES ('task_wiki_lint', 'Wiki Lint', '0 4 * * *', 'lint', '{}', 1)`)
  } catch { /* ignore */ }

  pollInterval = setInterval(tick, 60_000)
  setTimeout(tick, 5000)
  console.log('[Cron] Engine v2 started (delegate mode)')
}

/** 停止 cron 引擎 */
export function stopCronEngine(): void {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
  // 清理所有待处理的结果
  for (const [id, pending] of pendingResults) {
    clearTimeout(pending.timer)
    pending.resolve({ taskId: id, status: 'error', error: '引擎已停止' })
  }
  pendingResults.clear()
  console.log('[Cron] Engine stopped')
}

/** 单次 tick：检查并执行到期任务 */
async function tick(): Promise<void> {
  try {
    const tasks = await getDueTasks()
    for (const task of tasks) {
      if (runningTasks.has(task.id)) continue
      runTask(task).catch(err => console.error(`[Cron] Task ${task.id} failed:`, err))
    }
  } catch (err) {
    console.error('[Cron] tick error:', err)
  }
}

/** 获取到期任务 */
async function getDueTasks(): Promise<CronTask[]> {
  const now = new Date()
  const rows = query('SELECT * FROM scheduled_tasks WHERE enabled = 1') as Array<{
    id: string
    name: string
    cron_expression: string
    task_type: string
    task_config_json: string
    last_run: string
    enabled: number
    agent_id?: string
    platform_config_json?: string
  }>

  const due: CronTask[] = []
  for (const row of rows) {
    try {
      const interval = CronExpressionParser.parse(normalizeCronExpression(row.cron_expression))
      const prevRun = interval.prev().toDate()

      const lastRunTime = row.last_run ? new Date(row.last_run).getTime() : 0
      if (lastRunTime < prevRun.getTime() && prevRun <= now) {
        due.push({
          id: row.id,
          name: row.name,
          cronExpression: row.cron_expression,
          taskType: row.task_type,
          taskConfig: JSON.parse(row.task_config_json || '{}'),
          enabled: true,
          lastRun: row.last_run,
          agentId: row.agent_id || '',
          platformConfigJson: row.platform_config_json || '[]',
        })
      }
    } catch {
      // 无效 cron 表达式，跳过
    }
  }
  return due
}

/** 执行单个任务（委托模式） */
async function runTask(task: CronTask): Promise<void> {
  runningTasks.add(task.id)
  const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const startTime = Date.now()
  let status: 'running' | 'success' | 'error' = 'running'
  let message = ''
  let taskResultForPush = ''

  // 写入开始日志
  run(
    `INSERT INTO cron_execution_log (id, task_id, task_name, task_type, status, message, duration_ms)
     VALUES (?, ?, ?, ?, 'running', '', 0)`,
    [logId, task.id, task.name, task.taskType]
  )

  try {
    console.log(`[Cron] Running task: ${task.name} (${task.taskType})`)

    // 更新 last_run / next_run
    run("UPDATE scheduled_tasks SET last_run = datetime('now','localtime') WHERE id = ?", [task.id])
    try {
      const interval = CronExpressionParser.parse(normalizeCronExpression(task.cronExpression))
      const nextRun = interval.next().toDate().toISOString()
      run('UPDATE scheduled_tasks SET next_run = ? WHERE id = ?', [nextRun, task.id])
    } catch { /* invalid cron */ }

    // ── 委托模式：优先发送到渲染进程 ──
    const result = await delegateToRenderer(task)

    if (result.status === 'success') {
      const rendererResult = result.result || '渲染进程执行完成'
      taskResultForPush = rendererResult
      message = rendererResult.slice(0, 500)
      if (isFailureLikeTaskResult(task, rendererResult)) {
        status = 'error'
        console.warn(`[Cron] Task ${task.name} returned failure-like renderer result: ${message}`)
      } else {
        status = 'success'
        console.log(`[Cron] Task ${task.name} completed via renderer`)
      }
    } else {
      // 渲染进程失败或不可用，fallback 到主进程
      console.warn(`[Cron] Renderer failed for ${task.name}: ${result.error}, falling back to main process`)
      const fallbackResult = await fallbackExecute(task)
      message = `[fallback] ${fallbackResult.slice(0, 500)}`
      taskResultForPush = fallbackResult
      if (isFailureLikeTaskResult(task, fallbackResult)) {
        status = 'error'
        console.warn(`[Cron] Task ${task.name} fallback returned failure-like result: ${message}`)
      } else {
        status = 'success'
        console.log(`[Cron] Task ${task.name} completed via fallback`)
      }
    }

    // Agent Soul 渲染 + 平台推送
    if (task.agentId || hasEnabledPlatformTarget(task.platformConfigJson)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { executeCronWithAgent } = require('./agent-cron-bridge') as {
          executeCronWithAgent: (
            taskId: string,
            taskName: string,
            message: string,
          ) => Promise<{ attempted: number; sent: number; skipped: number; errors: string[] }>
        }
        const pushReport = await executeCronWithAgent(task.id, task.name, taskResultForPush || message)
        if (pushReport.attempted > 0 || pushReport.errors.length > 0) {
          message = `${message}\n[push] telegram sent ${pushReport.sent}/${pushReport.attempted}${
            pushReport.errors.length > 0 ? `; ${pushReport.errors.join('; ').slice(0, 180)}` : ''
          }`
        }
      } catch (err) {
        console.error('[Cron] Agent bridge error:', err)
        message = `${message}\n[push] error: ${err instanceof Error ? err.message : String(err)}`
      }
    }
  } catch (err) {
    status = 'error'
    message = String(err)
    console.error(`[Cron] Task ${task.id} execution error:`, err)
  } finally {
    runningTasks.delete(task.id)
    const duration = Date.now() - startTime
    run(
      `UPDATE cron_execution_log SET status = ?, message = ?, duration_ms = ? WHERE id = ?`,
      [status, message, duration, logId]
    )
  }
}

// ── Wiki 编译导出（兼容手动触发） ──

/** 手动触发 Wiki 编译（委托到渲染进程，fallback 到本地） */
export async function executeWikiCompileTask(task: CronTask): Promise<void> {
  console.log('[Cron:wiki-compile] Manual trigger:', task.name)

  // 先尝试委托到渲染进程
  const result = await delegateToRenderer({
    ...task,
    taskType: 'wiki-compile',
  })

  if (result.status !== 'success') {
    // Fallback 到本地编译
    console.log('[Cron:wiki-compile] Falling back to local compile')
    await fallbackExecuteWikiCompile(task)
  }
}

export async function runScheduledTaskNow(taskId: string): Promise<{ success: boolean; error?: string }> {
  const rows = query('SELECT * FROM scheduled_tasks WHERE id = ?', [taskId]) as Array<{
    id: string
    name: string
    cron_expression: string
    task_type: string
    task_config_json: string
    last_run: string
    enabled: number
    agent_id?: string
    platform_config_json?: string
  }>
  const row = rows[0]
  if (!row) return { success: false, error: 'task_not_found' }
  if (runningTasks.has(row.id)) return { success: false, error: 'task_already_running' }

  await runTask({
    id: row.id,
    name: row.name,
    cronExpression: row.cron_expression,
    taskType: row.task_type,
    taskConfig: JSON.parse(row.task_config_json || '{}'),
    enabled: row.enabled === 1,
    lastRun: row.last_run,
    agentId: row.agent_id || '',
    platformConfigJson: row.platform_config_json || '[]',
  })

  return { success: true }
}
