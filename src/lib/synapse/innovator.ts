/**
 * 混合创新引擎
 * 输入两个有连接的项目，生成跨界创新想法
 */
import { chatCompletion, LLMConfig, ChatMessage } from '../ai/provider'
import { PROMPTS } from '../ai/prompts'
import type { SynapseInput } from './scorer'

export interface HybridIdea {
  title: string
  oneLiner: string
  whyNow: string
  feasibility: number
  excitement: number
  effort: string
  description: string
}

/** 从两个项目的突触连接中生成混合创新想法 */
export async function generateHybridIdeas(
  config: LLMConfig,
  source: SynapseInput,
  target: SynapseInput,
  connectionType: string
): Promise<HybridIdea[]> {
  const brief = `
项目A：「${source.title}」— ${source.oneLiner}
行业：${source.taxonomy.industry}
技术栈：${source.taxonomy.techStack.join(', ')}
优势：${source.analysis.strengths.join('；')}
机会：${source.analysis.opportunities.join('；')}

项目B：「${target.title}」— ${target.oneLiner}
行业：${target.taxonomy.industry}
技术栈：${target.taxonomy.techStack.join(', ')}
优势：${target.analysis.strengths.join('；')}
机会：${target.analysis.opportunities.join('；')}

连接类型：${connectionType}
`.trim()

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: PROMPTS.hybridInnovator },
      { role: 'user', content: `生成混合创新想法：\n${brief}` },
    ]

    const response = await chatCompletion(config, messages, 0.8, 2048)

    // 尝试解析 JSON 数组
    const arrayMatch = response.match(/\[[\s\S]*\]/)
    if (arrayMatch) {
      const ideas = JSON.parse(arrayMatch[0]) as Record<string, unknown>[]
      return ideas.map(idea => ({
        title: (idea.title as string) || '未命名创意',
        oneLiner: (idea.one_liner as string) || '',
        whyNow: (idea.why_now as string) || '',
        feasibility: clamp((idea.feasibility as number) ?? 50),
        excitement: clamp((idea.excitement as number) ?? 50),
        effort: (idea.effort as string) || 'medium',
        description: (idea.description as string) || '',
      }))
    }

    // 尝试解析单个对象
    const objMatch = response.match(/\{[\s\S]*\}/)
    if (objMatch) {
      const idea = JSON.parse(objMatch[0]) as Record<string, unknown>
      return [{
        title: (idea.title as string) || '未命名创意',
        oneLiner: (idea.one_liner as string) || '',
        whyNow: (idea.why_now as string) || '',
        feasibility: clamp((idea.feasibility as number) ?? 50),
        excitement: clamp((idea.excitement as number) ?? 50),
        effort: (idea.effort as string) || 'medium',
        description: (idea.description as string) || '',
      }]
    }
  } catch { /* fallback */ }

  return fallbackHybridIdeas(source, target, connectionType)
}

function clamp(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v)))
}

/** 无 LLM 时的轻量 fallback */
function fallbackHybridIdeas(
  source: SynapseInput,
  target: SynapseInput,
  connectionType: string
): HybridIdea[] {
  return [{
    title: `${source.title} × ${target.title}`,
    oneLiner: `融合 ${source.taxonomy.industry} 与 ${target.taxonomy.industry} 的跨界创新`,
    whyNow: `两个领域都在快速发展，技术交叉点已出现`,
    feasibility: 40,
    excitement: 70,
    effort: 'high',
    description: `基于 ${connectionType} 连接，探索 ${source.title} 和 ${target.title} 的融合可能性。需要进一步推演验证。`,
  }]
}
