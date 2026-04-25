/**
 * Skill Evolution — 技能自动进化引擎（Hermes 风格增强）
 *
 * 移植自 Hermes Agent 的技能自我改进机制：
 * - 当技能使用 >= 5 次 + 成功率 < 80% → LLM 分析失败模式 → 自动修补 prompt
 * - 进化后的 prompt 写入 skill_evolution.improved_prompt
 * - 支持从经验创建新技能
 * - Hermes 的渐进式改进：保持核心意图，优化输出格式和错误预防
 */
import { query, run } from '../db/repository'
import { chatCompletion, LLMConfig, getDefaultConfig } from '../ai/provider'
import { getSetting } from '../db/store'

/** 检查技能是否需要进化 */
export async function shouldEvolve(skillId: string): Promise<boolean> {
  try {
    const rows = await query<{ usage_count: number; success_count: number }>(
      'SELECT usage_count, success_count FROM skill_evolution WHERE skill_id = ?',
      [skillId]
    )
    if (!rows[0]) return false
    const { usage_count, success_count } = rows[0]
    if (usage_count < 5) return false
    if (usage_count % 10 !== 0) return false
    const successRate = usage_count > 0 ? success_count / usage_count : 0
    return successRate < 0.8
  } catch {
    return false
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

/** 进化技能的 prompt */
export async function evolveSkillPrompt(skillId: string, currentPrompt: string): Promise<string | null> {
  const config = getLLMConfig()

  const rows = await query<{ usage_count: number; success_count: number; improved_prompt: string }>(
    'SELECT usage_count, success_count, improved_prompt FROM skill_evolution WHERE skill_id = ?',
    [skillId]
  )
  if (!rows[0]) return null

  const data = rows[0]
  const successRate = data.usage_count > 0 ? Math.round((data.success_count / data.usage_count) * 100) : 0

  const evolutionPrompt = `你是一个技能优化引擎。根据使用统计数据优化这个技能的系统提示词。

${currentPrompt ? `当前提示词：\n${currentPrompt}\n` : '当前没有专门的提示词，请根据技能 ID 创建一个。'}

技能 ID: ${skillId}
使用统计：
- 总使用次数：${data.usage_count}
- 成功次数：${data.success_count}
- 成功率：${successRate}%

规则：
- 保持提示词的核心意图不变
- 添加更具体的输出格式要求
- 如果成功率低，添加错误预防指导
- 如果成功率高，添加更高级的使用场景
- 提示词长度控制在 200 字以内
- 直接输出优化后的提示词，不要解释`

  try {
    const improved = await chatCompletion(config, [
      { role: 'system', content: evolutionPrompt },
      { role: 'user', content: `优化技能 "${skillId}" 的提示词。` },
    ], 0.5, 512)

    if (improved && improved.length > 20) {
      await run(
        'UPDATE skill_evolution SET improved_prompt = ?, updated_at = datetime("now","localtime") WHERE skill_id = ?',
        [improved, skillId]
      )
      return improved
    }
  } catch { /* ignore */ }

  return null
}

/** 运行所有需要进化的技能检查 */
export async function runEvolutionCycle(): Promise<string[]> {
  try {
    const rows = await query<{ skill_id: string; usage_count: number }>(
      'SELECT skill_id, usage_count FROM skill_evolution WHERE usage_count >= 5'
    )

    const evolved: string[] = []
    for (const row of rows) {
      if (await shouldEvolve(row.skill_id)) {
        const result = await evolveSkillPrompt(row.skill_id, '')
        if (result) evolved.push(row.skill_id)
      }
    }
    return evolved
  } catch {
    return []
  }
}

/** 从经验创建新技能（Hermes 风格：对话后自动提取可复用的技能模式） */
export async function createSkillFromExperience(
  conversationSummary: string,
  taskType: string
): Promise<{ skillName: string; skillPrompt: string } | null> {
  const config = getLLMConfig()

  const prompt = `你是一个技能创建引擎。分析以下对话摘要，提取可复用的技能模式。

对话摘要：
${conversationSummary}

任务类型: ${taskType}

规则：
- 识别对话中反复出现的任务模式
- 为这个模式创建一个简洁的技能指令（markdown 格式）
- 包含：技能名称、适用场景、执行步骤、输出格式
- 技能指令控制在 200 字以内
- 如果没有发现可复用的模式，返回空

输出 JSON 格式：
{"skillName": "技能名称", "skillPrompt": "技能指令内容"}`

  try {
    const result = await chatCompletion(config, [
      { role: 'system', content: prompt },
      { role: 'user', content: `从这段对话中提取技能模式。` },
    ], 0.5, 512)

    const jsonMatch = result?.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as { skillName: string; skillPrompt: string }
    }
  } catch { /* ignore */ }

  return null
}

/** 记录技能使用（成功或失败） */
export async function recordSkillUsage(skillId: string, success: boolean): Promise<void> {
  try {
    const rows = await query<{ usage_count: number; success_count: number }>(
      'SELECT usage_count, success_count FROM skill_evolution WHERE skill_id = ?',
      [skillId]
    )
    if (rows[0]) {
      await run(
        `UPDATE skill_evolution SET usage_count = usage_count + 1, success_count = success_count + ?, last_used = datetime('now','localtime'), updated_at = datetime('now','localtime') WHERE skill_id = ?`,
        [success ? 1 : 0, skillId]
      )
    } else {
      await run(
        `INSERT INTO skill_evolution (skill_id, usage_count, success_count, last_used, updated_at) VALUES (?, 1, ?, datetime('now','localtime'), datetime('now','localtime'))`,
        [skillId, success ? 1 : 0]
      )
    }

    // 检查是否需要进化
    if (await shouldEvolve(skillId)) {
      evolveSkillPrompt(skillId, '').catch(() => {})
    }
  } catch { /* ignore */ }
}
