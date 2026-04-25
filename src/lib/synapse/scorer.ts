/**
 * 突触评分算法
 * 基于分类重叠 + LLM 增强的项目连接发现
 */
import { chatCompletion, LLMConfig, ChatMessage } from '../ai/provider'
import { PROMPTS } from '../ai/prompts'
import type { ProjectTaxonomy, StructuredAnalysis } from '../ai/classifier'

export type SynapseType =
  | 'complementary'   // 资源共享
  | 'sequential'      // A 启用 B
  | 'synergistic'     // 1+1>2
  | 'conflicting'     // 资源竞争
  | 'inspiration'     // 跨界灵感
  | 'skill-transfer'  // 技能迁移

export interface SynapseCandidate {
  sourceId: string
  targetId: string
  type: SynapseType
  strength: number       // 0-100
  reason: string
  actionItems: string[]
}

export interface SynapseInput {
  id: string
  title: string
  oneLiner: string
  taxonomy: ProjectTaxonomy
  analysis: StructuredAnalysis
}

/** 计算两个项目之间的分类重叠基础分 */
export function calculateOverlapScore(
  a: SynapseInput,
  b: SynapseInput
): number {
  let score = 0

  // 行业重叠
  if (a.taxonomy.industry === b.taxonomy.industry) score += 20
  if (a.taxonomy.subIndustry === b.taxonomy.subIndustry) score += 15

  // 技术栈重叠
  const sharedTech = a.taxonomy.techStack.filter(t =>
    b.taxonomy.techStack.some(bt => bt.toLowerCase() === t.toLowerCase())
  )
  score += Math.min(25, sharedTech.length * 8)

  // 市场阶段互补
  const stages = ['idea', 'validation', 'mvp', 'growth', 'scale']
  const aIdx = stages.indexOf(a.taxonomy.stage)
  const bIdx = stages.indexOf(b.taxonomy.stage)
  if (Math.abs(aIdx - bIdx) === 1) score += 10

  // 创新类型互补
  if (a.taxonomy.innovationType !== b.taxonomy.innovationType) score += 15

  return Math.min(100, score)
}

/** 计算所有项目对的突触候选（纯分类计算，不调用 LLM） */
export function precomputeSynapseCandidates(
  projects: SynapseInput[]
): Array<{ source: SynapseInput; target: SynapseInput; overlap: number }> {
  const pairs: Array<{ source: SynapseInput; target: SynapseInput; overlap: number }> = []

  for (let i = 0; i < projects.length; i++) {
    for (let j = i + 1; j < projects.length; j++) {
      const overlap = calculateOverlapScore(projects[i], projects[j])
      // 只保留有意义的连接（阈值 15）
      if (overlap >= 15) {
        pairs.push({ source: projects[i], target: projects[j], overlap })
      }
    }
  }

  return pairs.sort((a, b) => b.overlap - a.overlap)
}

/** 用 LLM 增强高分对的突触分析 */
export async function enhanceSynapseWithLLM(
  config: LLMConfig,
  source: SynapseInput,
  target: SynapseInput,
  overlapScore: number
): Promise<SynapseCandidate | null> {
  const brief = `
项目A：「${source.title}」— ${source.oneLiner}
行业：${source.taxonomy.industry}/${source.taxonomy.subIndustry}
技术栈：${source.taxonomy.techStack.join(', ')}
创新类型：${source.taxonomy.innovationType}
优势：${source.analysis.strengths.join('；')}

项目B：「${target.title}」— ${target.oneLiner}
行业：${target.taxonomy.industry}/${target.taxonomy.subIndustry}
技术栈：${target.taxonomy.techStack.join(', ')}
创新类型：${target.taxonomy.innovationType}
优势：${target.analysis.strengths.join('；')}

初步重叠分：${overlapScore}/100
`.trim()

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: PROMPTS.synapseDiscoverer },
      { role: 'user', content: `分析这两个项目的突触连接：\n${brief}` },
    ]

    const response = await chatCompletion(config, messages, 0.6, 1536)
    const match = response.match(/\{[\s\S]*\}/)
    if (!match) return null

    const data = JSON.parse(match[0]) as Record<string, unknown>
    return {
      sourceId: source.id,
      targetId: target.id,
      type: validateSynapseType(data.type as string),
      strength: clamp((data.strength as number) ?? overlapScore),
      reason: (data.reason as string) || '',
      actionItems: (data.action_items as string[]) || [],
    }
  } catch {
    // LLM 失败时用基础分类生成轻量突触
    return {
      sourceId: source.id,
      targetId: target.id,
      type: overlapScore > 50 ? 'complementary' : 'inspiration',
      strength: overlapScore,
      reason: `基于分类重叠（${overlapScore}分）的潜在连接`,
      actionItems: [],
    }
  }
}

function validateSynapseType(type: string): SynapseType {
  const valid: SynapseType[] = ['complementary', 'sequential', 'synergistic', 'conflicting', 'inspiration', 'skill-transfer']
  return valid.includes(type as SynapseType) ? (type as SynapseType) : 'inspiration'
}

function clamp(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v)))
}

/** 批量计算突触（对高分对使用 LLM 增强） */
export async function batchComputeSynapses(
  config: LLMConfig,
  projects: SynapseInput[],
  onProgress?: (done: number, total: number) => void
): Promise<SynapseCandidate[]> {
  const pairs = precomputeSynapseCandidates(projects)
  const results: SynapseCandidate[] = []

  // 对前 20 个最高分对做 LLM 增强（控制 API 成本）
  const llmPairs = pairs.slice(0, 20)

  for (let i = 0; i < llmPairs.length; i++) {
    const { source, target, overlap } = llmPairs[i]
    const candidate = await enhanceSynapseWithLLM(config, source, target, overlap)
    if (candidate) results.push(candidate)
    onProgress?.(i + 1, llmPairs.length)
  }

  // 剩余对只做基础连接
  for (let i = llmPairs.length; i < pairs.length; i++) {
    const { source, target, overlap } = pairs[i]
    results.push({
      sourceId: source.id,
      targetId: target.id,
      type: 'inspiration',
      strength: overlap,
      reason: `分类重叠 ${overlap} 分`,
      actionItems: [],
    })
  }

  // MemPalace: 将突触发现写入记忆宫殿
  try {
    const { extractFromSynapse } = await import('../memory/extractor')
    for (const r of results.slice(0, 10)) {
      const sourceTitle = projects.find(p => p.id === r.sourceId)?.title || r.sourceId
      const targetTitle = projects.find(p => p.id === r.targetId)?.title || r.targetId
      await extractFromSynapse(sourceTitle, targetTitle, r.type, r.reason)
    }
  } catch { /* ignore */ }

  return results
}
