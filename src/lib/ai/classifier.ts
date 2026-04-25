/**
 * 项目分类学引擎
 * 将项目从扁平标签升级为多维度科学分类
 */
import { chatCompletion, LLMConfig, ChatMessage } from './provider'
import { PROMPTS } from './prompts'
import type { ParsedPRD } from './prd-parser'
import type { RadarScores, WarRoomResult } from './war-room'

export interface ProjectTaxonomy {
  industry: string
  subIndustry: string
  techStack: string[]
  businessModel: string
  marketSize: string
  stage: string
  innovationType: string
  complexity: number
  timeToMarket: string
  resourceRequirements: string
}

export interface StructuredAnalysis {
  strengths: string[]
  weaknesses: string[]
  opportunities: string[]
  threats: string[]
  eraRelevance: number
  breakthroughPotential: number
  differentiation: number
}

export interface ClassificationResult {
  taxonomy: ProjectTaxonomy
  analysis: StructuredAnalysis
}

/** 安全解析 JSON */
function safeParseJSON(text: string): Record<string, unknown> | null {
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
  } catch { /* 忽略 */ }
  return null
}

/** 对项目进行分类 + 结构化分析 */
export async function classifyProject(
  config: LLMConfig,
  prd: ParsedPRD,
  warRoomResult?: WarRoomResult
): Promise<ClassificationResult> {
  const projectBrief = `
项目：${prd.title}
定位：${prd.oneLiner}
目标用户：${prd.targetAudience}
痛点：${prd.painPoint}
商业模式：${prd.businessModel}
技术栈：${prd.techStack.join(', ')}
竞品：${prd.competitors.join(', ')}
差异化：${prd.uniqueValue}
风险：${prd.risks.join(', ')}
${warRoomResult ? `
推演结果：存活率 ${warRoomResult.survivalRate}% [${warRoomResult.survivalGrade}]
雷达分数：时代契合=${warRoomResult.radar.era_fit} Boss匹配=${warRoomResult.radar.boss_match} 商业变现=${warRoomResult.radar.monetization} 技术突破=${warRoomResult.radar.tech_breakthrough} 资源消耗=${warRoomResult.radar.resource_cost} 风险=${warRoomResult.radar.risk_index}
推演总结：${warRoomResult.summary}
战略建议：${warRoomResult.recommendation}` : ''}
`.trim()

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: PROMPTS.classifier },
      { role: 'user', content: `请对以下项目进行分类和结构化分析：\n${projectBrief}` },
    ]

    const response = await chatCompletion(config, messages, 0.3, 2048)
    const data = safeParseJSON(response)

    if (data) {
      return {
        taxonomy: {
          industry: (data.industry as string) || '未分类',
          subIndustry: (data.sub_industry as string) || '未分类',
          techStack: (data.tech_stack as string[]) || prd.techStack,
          businessModel: (data.business_model as string) || prd.businessModel,
          marketSize: (data.market_size as string) || 'emerging',
          stage: (data.stage as string) || 'idea',
          innovationType: (data.innovation_type as string) || 'incremental',
          complexity: clamp((data.complexity as number) ?? 50),
          timeToMarket: (data.time_to_market as string) || '3-6 months',
          resourceRequirements: (data.resource_requirements as string) || 'moderate',
        },
        analysis: {
          strengths: (data.strengths as string[]) || [],
          weaknesses: (data.weaknesses as string[]) || [],
          opportunities: (data.opportunities as string[]) || [],
          threats: (data.threats as string[]) || [],
          eraRelevance: clamp((data.era_relevance as number) ?? 50),
          breakthroughPotential: clamp((data.breakthrough_potential as number) ?? 50),
          differentiation: clamp((data.differentiation as number) ?? 50),
        },
      }
    }
  } catch {
    // LLM 失败，使用基于 PRD 的轻量 fallback
  }

  return fallbackClassify(prd, warRoomResult)
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(v)))
}

/** 无 LLM 时的智能 fallback */
function fallbackClassify(prd: ParsedPRD, warRoom?: WarRoomResult): ClassificationResult {
  const techStackLower = prd.techStack.join(' ').toLowerCase()
  const tagsLower = prd.tags.join(' ').toLowerCase()
  const allText = `${techStackLower} ${tagsLower} ${prd.title} ${prd.oneLiner}`.toLowerCase()

  // 简单行业推断
  let industry = '综合'
  let subIndustry = '通用'
  if (/ai|gpt|llm|机器学习|深度学习|nlp|cv/.test(allText)) { industry = 'AI/ML'; subIndustry = 'AI应用' }
  else if (/区块链|blockchain|web3|defi|nft/.test(allText)) { industry = '区块链'; subIndustry = 'Web3' }
  else if (/saas|企业服务|b2b/.test(allText)) { industry = '企业服务'; subIndustry = 'SaaS' }
  else if (/游戏|game|gaming/.test(allText)) { industry = '游戏'; subIndustry = '游戏开发' }
  else if (/教育|edu|学习|课程/.test(allText)) { industry = '教育'; subIndustry = 'EdTech' }
  else if (/健康|医疗|health|医/.test(allText)) { industry = '医疗健康'; subIndustry = '数字健康' }
  else if (/金融|fintech|支付|理财/.test(allText)) { industry = '金融'; subIndustry = 'FinTech' }

  const radar = warRoom?.radar
  return {
    taxonomy: {
      industry,
      subIndustry,
      techStack: prd.techStack,
      businessModel: prd.businessModel || '未明确',
      marketSize: 'emerging',
      stage: 'idea',
      innovationType: 'incremental',
      complexity: radar ? Math.round((radar.resource_cost + radar.risk_index) / 2) : 50,
      timeToMarket: '3-6 months',
      resourceRequirements: 'moderate',
    },
    analysis: {
      strengths: [prd.uniqueValue].filter(s => s && s !== '未明确'),
      weaknesses: prd.risks.slice(0, 3),
      opportunities: [],
      threats: prd.competitors.slice(0, 3),
      eraRelevance: radar?.era_fit ?? 50,
      breakthroughPotential: radar?.tech_breakthrough ?? 50,
      differentiation: radar?.boss_match ?? 50,
    },
  }
}
