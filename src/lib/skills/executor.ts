/**
 * Skills Executor — 技能执行引擎
 *
 * 将 skill ID 映射到实际的执行逻辑：
 * - builtin + module: 调用 lib/ 模块
 * - mcp + mcpDeps: 调用 MCP 工具（动态发现）
 * - llm: 通过 LLM 执行（支持进化后的 prompt）
 */
import { loadSkills, Skill } from './registry'
import { callMCPTool, listMCPTools } from '../mcp/client'
import { getSetting } from '../db/store'
import { LLMConfig, getDefaultConfig, chatCompletion } from '../ai/provider'
import { query } from '../db/repository'
import { recordSkillUsage } from './evolution'

export interface SkillInput {
  prompt: string
  context?: string
  /** 附加数据（如项目 ID、文件内容等） */
  data?: Record<string, unknown>
}

export interface SkillOutput {
  success: boolean
  result: string
  /** 执行耗时 ms */
  duration?: number
  /** 使用的 MCP 服务器 */
  mcpServerUsed?: string
}

/** 执行指定技能 */
export async function executeSkill(
  skillId: string,
  input: SkillInput,
  llmConfig?: LLMConfig
): Promise<SkillOutput> {
  const start = Date.now()
  const skills = loadSkills()
  const skill = skills.find(s => s.id === skillId)

  if (!skill) {
    return { success: false, result: `技能 "${skillId}" 未找到`, duration: Date.now() - start }
  }

  if (!skill.enabled) {
    return { success: false, result: `技能 "${skill.name}" 已禁用`, duration: Date.now() - start }
  }

  try {
    // MCP 依赖的技能
    if (skill.mcpDeps && skill.mcpDeps.length > 0) {
      const result = await executeMCPSkill(skill, input)
      recordSkillUsage(skillId, result.success)
      return { ...result, duration: Date.now() - start }
    }

    // 内置 LLM 技能
    if (skill.requires.includes('llm')) {
      const config = llmConfig || getLLMConfig()
      const result = await executeLLMSkill(skill, input, config)
      recordSkillUsage(skillId, result.success)
      return { ...result, duration: Date.now() - start }
    }

    // 纯本地技能
    const result = await executeLocalSkill(skill, input)
    recordSkillUsage(skillId, true)
    return { ...result, duration: Date.now() - start }
  } catch (err) {
    recordSkillUsage(skillId, false)
    return {
      success: false,
      result: `技能执行错误: ${(err as Error).message}`,
      duration: Date.now() - start,
    }
  }
}

/** 通过 MCP 执行 — 动态工具发现 */
async function executeMCPSkill(skill: Skill, input: SkillInput): Promise<SkillOutput> {
  if (!skill.mcpDeps || skill.mcpDeps.length === 0) {
    return { success: false, result: '无 MCP 依赖' }
  }

  // 依次尝试每个 MCP 依赖
  for (const serverId of skill.mcpDeps) {
    try {
      // 动态发现可用工具
      const tools = await listMCPTools(serverId)
      if (!tools || tools.length === 0) continue

      // 根据技能类型选择工具
      let toolName = ''
      let toolArgs: Record<string, unknown> = {}

      if (skill.id === 'web-search' || skill.id === 'market-research' || skill.id === 'competitor-scan') {
        const searchTool = tools.find(t => t.name === 'brave_web_search' || t.name === 'search')
        if (searchTool) {
          toolName = searchTool.name
          toolArgs = { query: input.prompt }
        }
      } else if (skill.id === 'sentiment-analyzer') {
        const fetchTool = tools.find(t => t.name === 'fetch' || t.name === 'fetch_html')
        if (fetchTool) {
          toolName = fetchTool.name
          toolArgs = { url: input.prompt }
        }
      }

      // 没有匹配到特定工具，使用第一个可用的
      if (!toolName) {
        toolName = tools[0].name
        toolArgs = { query: input.prompt, url: input.prompt }
      }

      const result = await callMCPTool(serverId, toolName, toolArgs)
      return {
        success: !result.isError,
        result: result.content,
        mcpServerUsed: serverId,
      }
    } catch {
      continue // 尝试下一个服务器
    }
  }

  return { success: false, result: '所有 MCP 服务器不可用，请先启动 MCP 服务' }
}

/** 通过 LLM 执行 — 支持进化后的 prompt */
async function executeLLMSkill(
  skill: Skill,
  input: SkillInput,
  config: LLMConfig
): Promise<SkillOutput> {
  // 查询是否有进化后的 prompt
  let systemPrompt = `你是一个执行"${skill.name}"技能的专家。${skill.description}。
直接给出结果，不要解释你的思考过程。用中文回答。`

  try {
    const rows = await query<{ improved_prompt: string }>(
      'SELECT improved_prompt FROM skill_evolution WHERE skill_id = ? AND improved_prompt != ""',
      [skill.id]
    )
    if (rows[0]?.improved_prompt) {
      systemPrompt = rows[0].improved_prompt
    }
  } catch { /* use default prompt */ }

  const result = await chatCompletion(
    config,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input.context ? `${input.context}\n\n${input.prompt}` : input.prompt },
    ],
    0.7,
    2048
  )

  return { success: true, result }
}

/** 本地执行 */
async function executeLocalSkill(skill: Skill, input: SkillInput): Promise<SkillOutput> {
  return {
    success: true,
    result: `[${skill.name}] 已处理: ${input.prompt.slice(0, 100)}`,
  }
}

/** 获取 LLM 配置 */
function getLLMConfig(): LLMConfig {
  const provider = getSetting('llm_provider', 'deepseek')
  const defaults = getDefaultConfig(provider)
  return {
    provider: provider as LLMConfig['provider'],
    apiKey: getSetting('llm_api_key', ''),
    baseUrl: getSetting('llm_base_url', defaults.baseUrl),
    model: getSetting('llm_model', defaults.model),
  }
}
