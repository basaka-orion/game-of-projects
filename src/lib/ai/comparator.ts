/**
 * 项目比较引擎
 * 输入两个项目的结构化数据，输出比较分析
 */
import { chatCompletion, LLMConfig, ChatMessage } from './provider'
import { PROMPTS } from './prompts'
import type { ProjectTaxonomy, StructuredAnalysis } from './classifier'

export interface ComparisonResult {
  overlapScore: number
  complementaryScore: number
  cannibalizationRisk: number
  synergyPoints: string[]
  recommendation: string
}

/** 比较两个项目 */
export async function compareProjects(
  config: LLMConfig,
  projectA: {
    title: string
    oneLiner: string
    taxonomy: ProjectTaxonomy
    analysis: StructuredAnalysis
  },
  projectB: {
    title: string
    oneLiner: string
    taxonomy: ProjectTaxonomy
    analysis: StructuredAnalysis
  }
): Promise<ComparisonResult> {
  const brief = `
项目A：「${projectA.title}」— ${projectA.oneLiner}
行业：${projectA.taxonomy.industry}/${projectA.taxonomy.subIndustry}
技术栈：${projectA.taxonomy.techStack.join(', ')}
商业模式：${projectA.taxonomy.businessModel}
创新类型：${projectA.taxonomy.innovationType}
阶段：${projectA.taxonomy.stage}
优势：${projectA.analysis.strengths.join('；')}
劣势：${projectA.analysis.weaknesses.join('；')}

项目B：「${projectB.title}」— ${projectB.oneLiner}
行业：${projectB.taxonomy.industry}/${projectB.taxonomy.subIndustry}
技术栈：${projectB.taxonomy.techStack.join(', ')}
商业模式：${projectB.taxonomy.businessModel}
创新类型：${projectB.taxonomy.innovationType}
阶段：${projectB.taxonomy.stage}
优势：${projectB.analysis.strengths.join('；')}
劣势：${projectB.analysis.weaknesses.join('；')}
`.trim()

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: PROMPTS.comparator },
      { role: 'user', content: `请比较以下两个项目：\n${brief}` },
    ]

    const response = await chatCompletion(config, messages, 0.4, 1536)
    const match = response.match(/\{[\s\S]*\}/)
    if (match) {
      const data = JSON.parse(match[0]) as Record<string, unknown>
      return {
        overlapScore: clamp((data.overlap_score as number) ?? 0),
        complementaryScore: clamp((data.complementary_score as number) ?? 0),
        cannibalizationRisk: clamp((data.cannibalization_risk as number) ?? 0),
        synergyPoints: (data.synergy_points as string[]) || [],
        recommendation: (data.recommendation as string) || '建议分别推进',
      }
    }
  } catch { /* fallback */ }

  return fallbackCompare(projectA, projectB)
}

function clamp(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v)))
}

/** 基于分类重叠的轻量比较 */
function fallbackCompare(
  a: { taxonomy: ProjectTaxonomy; analysis: StructuredAnalysis },
  b: { taxonomy: ProjectTaxonomy; analysis: StructuredAnalysis }
): ComparisonResult {
  // 行业重叠
  const industryOverlap = a.taxonomy.industry === b.taxonomy.industry ? 30 : 0
  const subOverlap = a.taxonomy.subIndustry === b.taxonomy.subIndustry ? 20 : 0

  // 技术栈重叠
  const sharedTech = a.taxonomy.techStack.filter(t =>
    b.taxonomy.techStack.some(bt => bt.toLowerCase() === t.toLowerCase())
  )
  const techOverlap = Math.min(30, sharedTech.length * 10)

  // 互补性
  const complementary = a.taxonomy.innovationType !== b.taxonomy.innovationType ? 25 : 10

  // 竞争风险
  const cannibalization = industryOverlap + subOverlap > 30 ? 40 : 10

  return {
    overlapScore: industryOverlap + subOverlap + techOverlap,
    complementaryScore: complementary,
    cannibalizationRisk: cannibalization,
    synergyPoints: sharedTech.length > 0
      ? [`共享技术栈：${sharedTech.join('、')}`]
      : [],
    recommendation: cannibalization > 30
      ? '两个项目在相近领域，注意资源分配'
      : '两个项目方向不同，可以并行推进',
  }
}
