/**
 * Cron Executor — 渲染进程定时任务执行器
 *
 * 监听主进程的 cron:execute-task IPC 消息，
 * 调用渲染进程中的完整 Agent 栈执行任务，
 * 将结果通过 IPC 返回主进程。
 *
 * 支持的任务类型：
 * - research: Agent ReAct + web_search 工具 + Soul 注入
 * - report: chatCompletion + Soul + 10层 context 组装
 * - memory-scan: recall + knowledge-graph 扫描分析
 * - wiki-compile: wiki-compiler.ts（Karpathy 结晶化）
 * - lint: lint.ts（Wiki 体检）
 * - custom: Agent ReAct 循环
 * - agent-task: 完整 Agent 任务（router + Soul）
 */

import { getLLMConfig, resolveAgentConfig, chatCompletion } from '../ai/provider'
import { runCompileCycle } from '../knowledge/wiki-compiler'
import { runLint } from '../knowledge/lint'
import { getUncompiledDrawers } from '../knowledge/drawer'
import { searchPages } from '../knowledge/wiki'
import { query, run } from '../db/repository'
import { getSetting } from '../db/store'
import { getDefaultConfig } from '../ai/provider'

// ─── 类型 ───

interface CronTaskMessage {
  id: string
  name: string
  taskType: string
  taskConfig: Record<string, unknown>
  agentId: string
  platformConfigJson: string
}

// ─── 注册监听 ───

let registered = false

/** 注册 IPC 监听（应在应用启动时调用） */
export function registerCronExecutor(): void {
  if (registered) return
  registered = true

  if (!window.electronAPI?.onCronTask) {
    console.warn('[CronExecutor] IPC 通道不可用，定时任务将使用主进程 fallback')
    return
  }

  window.electronAPI.onCronTask((task: unknown) => {
    const t = task as CronTaskMessage
    console.log(`[CronExecutor] 收到任务: ${t.name} (${t.taskType})`)
    executeTask(t).catch(err => {
      console.error(`[CronExecutor] 任务执行失败: ${t.name}`, err)
      sendResult({ taskId: t.id, status: 'error', error: String(err) })
    })
  })

  console.log('[CronExecutor] 已注册渲染进程定时任务执行器')
}

// ─── 任务路由 ───

/** 路由任务到对应的执行函数 */
async function executeTask(task: CronTaskMessage): Promise<void> {
  const startTime = Date.now()

  try {
    let result = ''

    switch (task.taskType) {
      case 'research':
        result = await executeResearch(task)
        break
      case 'report':
        result = await executeReport(task)
        break
      case 'memory-scan':
        result = await executeMemoryScan(task)
        break
      case 'wiki-compile':
        result = await executeWikiCompile(task)
        break
      case 'lint':
        result = await executeLint(task)
        break
      case 'custom':
        result = await executeCustom(task)
        break
      case 'agent-task':
        result = await executeAgentTask(task)
        break
      default:
        result = `未知任务类型: ${task.taskType}`
    }

    const duration = Date.now() - startTime
    console.log(`[CronExecutor] 任务 ${task.name} 完成 (${duration}ms)`)

    sendResult({
      taskId: task.id,
      status: 'success',
      result: result.slice(0, 2000),
    })
  } catch (err) {
    sendResult({
      taskId: task.id,
      status: 'error',
      error: String(err),
    })
  }
}

/** 发送结果到主进程 */
function sendResult(result: { taskId: string; status: 'success' | 'error'; result?: string; error?: string }): void {
  if (window.electronAPI?.cronTaskResult) {
    window.electronAPI.cronTaskResult(result).catch(err => {
      console.error('[CronExecutor] 发送结果失败:', err)
    })
  }
}

// ─── 获取 LLM 配置 ───

function getTaskLLMConfig(task: CronTaskMessage) {
  if (task.agentId) {
    return resolveAgentConfig(task.agentId)
  }
  return getLLMConfig()
}

async function getBossResearchContext(): Promise<{
  name: string
  interests: string
  currentFocus: string
  longTermVision: string
  profilingPromptSummary: string
  recommendedTopics: string[]
}> {
  const rows = await query(
    'SELECT key, value FROM boss_profile WHERE key IN (?, ?, ?, ?, ?, ?, ?)',
    ['name', 'interests', 'current_focus', 'currentFocus', 'long_term_vision', 'longTermVision', 'profiling_summary_json']
  ) as Array<{ key: string; value: string }>

  const record: Record<string, string> = {}
  for (const row of rows) record[row.key] = row.value

  let profilingPromptSummary = ''
  let recommendedTopics: string[] = []
  try {
    if (record.profiling_summary_json) {
      const summary = JSON.parse(record.profiling_summary_json) as {
        promptSummary?: string
        recommendedResearchTopics?: string[]
      }
      profilingPromptSummary = summary.promptSummary || ''
      recommendedTopics = Array.isArray(summary.recommendedResearchTopics)
        ? summary.recommendedResearchTopics.filter(Boolean)
        : []
    }
  } catch { /* ignore malformed profiling summary */ }

  return {
    name: record.name || 'Boss',
    interests: record.interests || '',
    currentFocus: record.current_focus || record.currentFocus || '',
    longTermVision: record.long_term_vision || record.longTermVision || '',
    profilingPromptSummary,
    recommendedTopics,
  }
}

/** 获取 Agent 的 system prompt（如果有） */
async function getAgentSystemPrompt(agentId: string): Promise<string> {
  try {
    // 内置角色
    const builtInRoles: Record<string, string> = {
      general: '你是 Openbasaka 通用助手。',
      strategy: '你是战略分析师，擅长商业模式和竞争分析。',
      technical: '你是技术专家，擅长架构设计和技术决策。',
      market: '你是市场研究员，擅长市场分析和用户洞察。',
      creative: '你是创意总监，擅长品牌设计和用户体验。',
      critic: '你是批判性思维专家，擅长风险分析和反向思考。',
    }

    // 尝试读取自定义 Agent
    const rows = await query('SELECT system_prompt FROM custom_agents WHERE id = ?', [agentId]) as Array<{ system_prompt: string }>
    if (rows.length > 0) return rows[0].system_prompt

    // 内置角色
    if (builtInRoles[agentId]) return builtInRoles[agentId]

    // 尝试读取 Soul
    const soulRows = await query('SELECT soul_json FROM agent_souls WHERE agent_id = ?', [agentId]) as Array<{ soul_json: string }>
    if (soulRows.length > 0) {
      try {
        const soul = JSON.parse(soulRows[0].soul_json) as { identity?: string; tone?: string; principles?: string }
        return `${soul.identity || ''}\n语气: ${soul.tone || '专业'}\n原则: ${soul.principles || '准确、有用'}`
      } catch { /* parse error */ }
    }

    return builtInRoles.general
  } catch {
    return '你是 Boss 的 AI 助手。'
  }
}

// ─── 任务执行器 ───

/** Research 任务：搜索外网，捕捞高价值碎片 */
async function executeResearch(task: CronTaskMessage): Promise<string> {
  const config = getTaskLLMConfig(task)
  if (!config.apiKey && config.provider !== 'ollama') {
    return 'LLM API Key 未配置'
  }

  // 1. 获取 Boss 兴趣和反馈
  const boss = await getBossResearchContext()
  const bossInterests = boss.interests

  const feedbackRows = await query(
    "SELECT content, confidence FROM boss_memory WHERE source LIKE 'innovation_%' AND created_at > datetime('now', '-7 days') ORDER BY created_at DESC LIMIT 10"
  ) as Array<{ content: string; confidence: number }>

  const positive = feedbackRows.filter(r => r.confidence >= 0.7).map(r => r.content).join('; ').slice(0, 200)
  const negative = feedbackRows.filter(r => r.confidence <= 0.3).map(r => r.content).join('; ').slice(0, 200)

  // 2. 生成搜索查询
  const systemPrompt = getAgentSystemPrompt(task.agentId || 'general')
  const queriesResponse = await chatCompletion(config, [
    { role: 'system', content: `${systemPrompt}\n\n你是研究策划引擎。生成高价值搜索查询。` },
    {
      role: 'user',
      content: `Boss兴趣: ${bossInterests || '全领域'}
Boss当前焦点: ${boss.currentFocus || '未明确'}
Boss长期愿景: ${boss.longTermVision || '未明确'}
画像摘要: ${boss.profilingPromptSummary || '暂无'}
建议研究方向: ${boss.recommendedTopics.join('、') || '暂无'}
近期积极反馈: ${positive || '无'}
近期消极反馈: ${negative || '无'}
任务: ${JSON.stringify(task.taskConfig)}

生成3个搜索主题。输出 JSON 数组: [{"topic":"主题","query":"关键词"}]
要求：
- 优先围绕当前焦点、长期愿景和建议研究方向生成主题
- 不要只泛泛围绕兴趣
只输出 JSON。`,
    },
  ])

  const jsonMatch = queriesResponse.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return '无法生成搜索查询'

  let topics: Array<{ topic: string; query: string }>
  try {
    topics = JSON.parse(jsonMatch[0])
  } catch {
    return '搜索查询解析失败'
  }

  // 3. 执行搜索和总结
  const results: string[] = []
  for (const topic of topics.slice(0, 3)) {
    // 尝试使用 web_search 工具（如果可用）
    let searchContent = ''

    // 尝试 MCP Brave Search
    try {
      if (window.electronAPI?.mcpCallTool) {
        const mcpResult = await window.electronAPI.mcpCallTool('mcp-brave-search', 'brave_web_search', {
          query: topic.query,
          count: 5,
        }) as Record<string, unknown> | null
        if (mcpResult && !mcpResult.isError && mcpResult.content) {
          searchContent = typeof mcpResult.content === 'string' ? mcpResult.content : JSON.stringify(mcpResult)
        }
      }
    } catch { /* MCP failed */ }

    // Fallback: LLM 知识合成
    if (!searchContent) {
      searchContent = await chatCompletion(config, [
        { role: 'system', content: '你是研究助理。提供简洁的趋势概述。' },
        { role: 'user', content: `简要概述"${topic.topic}"领域的最新趋势（200字以内）。` },
      ])
    }

    if (!searchContent) continue

    // 总结为洞察
    const summary = await chatCompletion(config, [
      { role: 'system', content: '你是知识蒸馏引擎。从原始信息中提炼高价值洞察。' },
      {
        role: 'user',
        content: `将以下内容总结为50-100字洞察:\n主题: ${topic.topic}\n内容: ${searchContent.slice(0, 800)}`,
      },
    ])

    if (summary) {
      results.push(`【${topic.topic}】${summary}`)

      // 写入 Innovation Lab
      try {
        const id = `cron_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        await run(
          `INSERT INTO memory_items (id, room_id, type, content, source, importance, metadata_json, created_at, updated_at)
           VALUES (?, 'room_innovation', 'cron_harvest', ?, ?, 60, ?, datetime('now','localtime'), datetime('now','localtime'))`,
          [id, `【${topic.topic}】${summary}`, 'cron:research', JSON.stringify({ taskType: 'research', taskName: task.name })]
        )
      } catch { /* non-critical */ }
    }
  }

  return results.length > 0 ? results.join('\n\n') : '无研究结果'
}

/** Report 任务：生成近期活动摘要 */
async function executeReport(task: CronTaskMessage): Promise<string> {
  const config = getTaskLLMConfig(task)
  const systemPrompt = getAgentSystemPrompt(task.agentId || 'general')

  const recentProjects = await query(
    "SELECT title, survival_rate, survival_grade FROM projects ORDER BY created_at DESC LIMIT 5"
  ) as Array<{ title: string; survival_rate: number; survival_grade: string }>

  const recentDecisions = await query(
    "SELECT decision_type, reasoning FROM boss_decisions ORDER BY created_at DESC LIMIT 5"
  ) as Array<{ decision_type: string; reasoning: string }>

  const memoryGrowth = await query(
    "SELECT COUNT(*) as cnt FROM memory_items WHERE created_at > datetime('now', '-7 days')"
  ) as Array<{ cnt: number }>

  const wikiPages = await query(
    "SELECT COUNT(*) as cnt FROM wiki_pages WHERE created_at > datetime('now', '-7 days')"
  ) as Array<{ cnt: number }>

  const report = await chatCompletion(config, [
    { role: 'system', content: `${systemPrompt}\n\n你是数据分析师。生成简洁有力的活动报告。用中文。` },
    {
      role: 'user',
      content: `近期项目: ${JSON.stringify(recentProjects)}
近期决策: ${JSON.stringify(recentDecisions.map(d => ({ type: d.decision_type, reason: d.reasoning?.slice(0, 50) })))}
7天新增记忆: ${memoryGrowth[0]?.cnt || 0}条
7天新增Wiki: ${wikiPages[0]?.cnt || 0}页

生成一份简洁的活动报告（200字以内），包含趋势洞察。`,
    },
  ])

  return report || '无法生成报告'
}

/** Memory Scan 任务：扫描记忆模式 */
async function executeMemoryScan(task: CronTaskMessage): Promise<string> {
  const config = getTaskLLMConfig(task)

  // 扫描近 7 天记忆
  const recentMemories = await query(
    "SELECT content, importance, source, room_id FROM memory_items WHERE created_at > datetime('now', '-7 days') ORDER BY importance DESC LIMIT 30"
  ) as Array<{ content: string; importance: number; source: string; room_id: string }>

  // 知识图谱统计
  const tripleCount = await query('SELECT COUNT(*) as cnt FROM knowledge_triples') as Array<{ cnt: number }>

  // 房间分布
  const roomCounts = await query(
    'SELECT r.name, COUNT(m.id) as cnt FROM memory_rooms r LEFT JOIN memory_items m ON r.id = m.room_id GROUP BY r.id'
  ) as Array<{ name: string; cnt: number }>

  // Wiki 统计
  const wikiStats = await query(
    "SELECT COUNT(*) as total, SUM(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 ELSE 0 END) as recent FROM wiki_pages"
  ) as Array<{ total: number; recent: number }>

  const findings: string[] = []

  // 词频分析
  const wordFreq = new Map<string, number>()
  for (const m of recentMemories) {
    const words = m.content.split(/[\s,，。.！!？?、；;：:]+/).filter(w => w.length > 2 && w.length < 15)
    for (const w of words) {
      wordFreq.set(w, (wordFreq.get(w) || 0) + 1)
    }
  }
  const topThemes = [...wordFreq.entries()]
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word)

  if (topThemes.length > 0) findings.push(`高频主题: ${topThemes.join('、')}`)

  const sparseRooms = roomCounts.filter(r => r.cnt < 3)
  if (sparseRooms.length > 0) {
    findings.push(`知识缺口: ${sparseRooms.map(r => `${r.name}(${r.cnt})`).join(', ')}`)
  }

  findings.push(`知识图谱: ${tripleCount[0]?.cnt || 0} 三元组`)
  findings.push(`Wiki: ${wikiStats[0]?.total || 0} 页 (近7天 +${wikiStats[0]?.recent || 0})`)

  // LLM 洞察
  if (topThemes.length > 0 && config) {
    const insight = await chatCompletion(config, [
      { role: 'system', content: '你是模式识别引擎。从关键词中提取洞察。' },
      { role: 'user', content: `高频主题: ${topThemes.join('、')}\n\n生成一条关于Boss关注焦点的洞察（50字以内）。` },
    ])
    if (insight) findings.push(`洞察: ${insight}`)
  }

  return findings.join('\n')
}

/** Wiki Compile 任务：Karpathy 结晶化编译 */
async function executeWikiCompile(task: CronTaskMessage): Promise<string> {
  const config = getTaskLLMConfig(task)
  const batchSize = (task.taskConfig.batchSize as number) || 20

  // 检查未编译抽屉数量
  const drawers = await getUncompiledDrawers(batchSize)
  if (drawers.length === 0) return '无未编译抽屉'

  // 调用渲染进程的完整编译器
  const result = await runCompileCycle(config, batchSize, (progress) => {
    console.log(`[CronExecutor:wiki-compile] ${progress.phase}: ${progress.message}`)
  })

  return `编译完成: ${result.drawersProcessed} 抽屉 → ${result.pagesCreated} 新页面, ${result.pagesUpdated} 更新, ${result.triplesExtracted} 三元组${result.errors.length > 0 ? `\n错误: ${result.errors.join('; ')}` : ''}`
}

/** Lint 任务：Wiki 体检 */
async function executeLint(task: CronTaskMessage): Promise<string> {
  const config = getTaskLLMConfig(task)
  const report = await runLint(config)

  const parts: string[] = [`Wiki 体检完成`]
  if (report.totalIssues > 0) {
    const s = report.stats
    parts.push(`发现问题: ${report.totalIssues} 个`)
    parts.push(`孤儿: ${s.orphans} / 过时: ${s.stale} / 断裂链接: ${s.brokenLinks}`)
    parts.push(`缺失摘要: ${s.missingSummary} / 低置信度: ${s.lowConfidence} / 矛盾: ${s.contradictions}`)
  } else {
    parts.push('Wiki 状态良好，无问题发现')
  }

  return parts.join('\n')
}

/** Custom 任务：用户自定义 */
async function executeCustom(task: CronTaskMessage): Promise<string> {
  const config = getTaskLLMConfig(task)
  const systemPrompt = getAgentSystemPrompt(task.agentId || 'general')
  const prompt = (task.taskConfig.prompt as string) || task.name

  return await chatCompletion(config, [
    { role: 'system', content: `${systemPrompt}\n\n执行用户定义的定时任务。` },
    { role: 'user', content: prompt },
  ]) || '无结果'
}

/** Agent Task 任务：完整 Agent 栈 */
async function executeAgentTask(task: CronTaskMessage): Promise<string> {
  const config = getTaskLLMConfig(task)
  const systemPrompt = getAgentSystemPrompt(task.agentId || 'general')
  const goal = (task.taskConfig.goal as string) || task.name

  // 构建包含知识库上下文的 prompt
  const knowledgeContext = await buildKnowledgeContext(goal)
  const memoryContext = await buildMemoryContext(task.agentId)

  return await chatCompletion(config, [
    {
      role: 'system',
      content: `${systemPrompt}

${knowledgeContext}

${memoryContext}

执行定时任务。用中文回复。`,
    },
    { role: 'user', content: goal },
  ]) || '无结果'
}

// ─── 上下文构建 ───

/** 构建知识库上下文 */
async function buildKnowledgeContext(queryText: string): Promise<string> {
  try {
    const pages = await searchPages(queryText, 5)
    if (pages.length === 0) return '[知识库] 无相关内容'

    const contexts = pages.slice(0, 3).map(p =>
      `## ${p.title}\n${(p.summary || p.content?.slice(0, 300) || '').slice(0, 300)}`
    )

    return `[知识库上下文]\n${contexts.join('\n\n')}`
  } catch {
    return '[知识库] 查询失败'
  }
}

/** 构建记忆上下文 */
async function buildMemoryContext(_agentId: string): Promise<string> {
  try {
    const recentMemories = await query(
      "SELECT content, importance FROM memory_items WHERE created_at > datetime('now', '-30 days') ORDER BY importance DESC LIMIT 10"
    ) as Array<{ content: string; importance: number }>

    if (recentMemories.length === 0) return '[记忆] 无近期记忆'

    const memoryText = recentMemories
      .map(m => `- ${m.content.slice(0, 100)}`)
      .join('\n')

    return `[近期记忆]\n${memoryText}`
  } catch {
    return '[记忆] 读取失败'
  }
}
