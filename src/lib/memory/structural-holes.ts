/**
 * Structural Holes Scanner — 结构洞扫描 + 自动混合创新
 *
 * 跨知识簇检测未连接但具潜力的"结构洞"，
 * 并利用 LLM 进行跨领域混合创新生成。
 *
 * 灵感来源：Ronald Burt 的结构洞理论 —
 * 信息中介（brokerage）是创新的源泉
 */
import { query } from '../db/repository'
import { detectClusters, queryEntity, type KnowledgeCluster, type KnowledgeTriple } from './knowledge-graph'
import { generateHybridIdeas, type HybridIdea } from '../synapse/innovator'
import { getSetting } from '../db/store'
import { getDefaultConfig, LLMConfig } from '../ai/provider'

// ─── 接口 ───

export interface StructuralHole {
  clusterA: string[]     // 簇 A 的实体列表
  clusterB: string[]     // 簇 B 的实体列表
  topicA: string         // 簇 A 中心主题
  topicB: string         // 簇 B 中心主题
  bridgePotential: number // 0-100
  sharedContext: string   // 为什么它们可能相关
}

export interface InnovationResult {
  hole: StructuralHole
  ideas: HybridIdea[]
}

// ─── 扫描结构洞 ───

/** 扫描知识图谱中未连接但具潜力的知识簇对 */
export async function findStructuralHoles(): Promise<StructuralHole[]> {
  let clusters: KnowledgeCluster[]
  try {
    clusters = await detectClusters(2)
  } catch {
    return []
  }
  if (clusters.length < 2) return []

  const holes: StructuralHole[] = []

  // 遍历所有簇对
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const clusterA = clusters[i]
      const clusterB = clusters[j]

      // 检查两个簇之间是否已有连接
      const existingConnections = await countCrossClusterConnections(
        clusterA.entities,
        clusterB.entities
      )

      if (existingConnections === 0) {
        // 潜在结构洞
        const bridgePotential = calculateBridgePotential(clusterA, clusterB)
        if (bridgePotential >= 30) {
          holes.push({
            clusterA: clusterA.entities.slice(0, 5),
            clusterB: clusterB.entities.slice(0, 5),
            topicA: clusterA.centralTopic,
            topicB: clusterB.centralTopic,
            bridgePotential,
            sharedContext: `"${clusterA.centralTopic}" 与 "${clusterB.centralTopic}" 无直接连接，但可能存在隐秘关联`,
          })
        }
      }
    }
  }

  return holes.sort((a, b) => b.bridgePotential - a.bridgePotential).slice(0, 10)
}

/** 计算两个簇之间的交叉连接数 */
async function countCrossClusterConnections(
  entitiesA: string[],
  entitiesB: string[]
): Promise<number> {
  if (entitiesA.length === 0 || entitiesB.length === 0) return 0

  try {
    const placeholdersA = entitiesA.map(() => '?').join(',')
    const placeholdersB = entitiesB.map(() => '?').join(',')

    const rows = await query(
      `SELECT COUNT(*) as cnt FROM knowledge_triples
       WHERE (subject IN (${placeholdersA}) AND object IN (${placeholdersB}))
          OR (object IN (${placeholdersA}) AND subject IN (${placeholdersB}))`,
      [...entitiesA, ...entitiesB, ...entitiesA, ...entitiesB]
    ) as unknown as Array<{ cnt: number }>

    return rows[0]?.cnt || 0
  } catch {
    return 0
  }
}

/** 计算桥接潜力分数 */
function calculateBridgePotential(a: KnowledgeCluster, b: KnowledgeCluster): number {
  // 两个簇都信息丰富（三元组数量多）时潜力更高
  const richnessA = Math.min(a.tripleCount, 10) / 10
  const richnessB = Math.min(b.tripleCount, 10) / 10
  const richnessScore = Math.min(richnessA, richnessB) * 50

  // 高置信度 = 更可靠的知识基础
  const confidenceScore = ((a.avgConfidence + b.avgConfidence) / 2) * 50

  return Math.round(richnessScore + confidenceScore)
}

// ─── 自动混合创新 ───

/** 对结构洞进行跨领域混合创新 */
export async function innovateOnStructuralHoles(
  holes: StructuralHole[],
  maxHoles: number = 3
): Promise<InnovationResult[]> {
  const config = getLLMConfig()
  const results: InnovationResult[] = []

  for (const hole of holes.slice(0, maxHoles)) {
    try {
      const ideas = await generateHybridIdeas(
        config,
        {
          id: '',
          title: hole.topicA,
          oneLiner: hole.sharedContext,
          taxonomy: { industry: hole.topicA, subIndustry: '', techStack: [], businessModel: '', marketSize: '', stage: '', innovationType: '', complexity: 0, timeToMarket: '', resourceRequirements: '' },
          analysis: { strengths: hole.clusterA.slice(0, 3), weaknesses: [], opportunities: [], threats: [], eraRelevance: 50, breakthroughPotential: 50, differentiation: 50 },
        },
        {
          id: '',
          title: hole.topicB,
          oneLiner: hole.sharedContext,
          taxonomy: { industry: hole.topicB, subIndustry: '', techStack: [], businessModel: '', marketSize: '', stage: '', innovationType: '', complexity: 0, timeToMarket: '', resourceRequirements: '' },
          analysis: { strengths: hole.clusterB.slice(0, 3), weaknesses: [], opportunities: [], threats: [], eraRelevance: 50, breakthroughPotential: 50, differentiation: 50 },
        },
        'inspiration'
      )

      if (ideas.length > 0) {
        results.push({ hole, ideas })
      }
    } catch { /* skip failed innovation */ }
  }

  return results
}

// ─── 辅助 ───

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
