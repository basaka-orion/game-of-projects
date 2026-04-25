/**
 * Agent Perspective — 用 Agent 的 Soul + LLM 配置生成项目评估
 */
import { chatCompletion, type LLMConfig } from './provider'
import { resolveAgentConfig } from './provider'
import { getSoul, renderSoulPrompt } from '../agents/soul'
import type { StoredProject } from '../db/store'

export async function getAgentPerspective(
  agentId: string,
  project: StoredProject
): Promise<string> {
  const config: LLMConfig = resolveAgentConfig(agentId)

  let soulPrompt = ''
  try {
    const soul = await getSoul(agentId)
    soulPrompt = renderSoulPrompt(soul)
  } catch { /* ignore */ }

  const messages = [
    {
      role: 'system' as const,
      content: `${soulPrompt}\n\n请从你的专业视角，对这个项目给出简短评估（200 字以内）。包括：\n- 核心洞察\n- 关键风险\n- 行动建议`,
    },
    {
      role: 'user' as const,
      content: `项目: ${project.title}\n一句话: ${project.oneLiner || '无'}\n标签: ${project.tags || '无'}\n当前生存率: ${project.survivalRate ?? '未评估'}%`,
    },
  ]

  return chatCompletion(config, messages, 0.6, 512)
}
