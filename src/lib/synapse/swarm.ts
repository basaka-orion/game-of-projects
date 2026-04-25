/**
 * Neuron Swarm — 神经元集群模拟引擎（MiroFish 启发）
 *
 * 灵感源自 MiroFish 的群体智能 + GraphRAG：
 * - 将每个项目/知识节点模拟为一个"神经元"
 * - 神经元之间有权重连接（突触强度 × 语义相似度）
 * - 模拟激活扩散（Spreading Activation）发现隐含连接
 * - 突破性发现：当两个看似不相关的神经元产生强激活路径时
 * - 社会进化：模拟多轮交互，神经元权重随"经验"调整
 * - 与现有 synapse/scorer.ts 集成，提供更深层的关系发现
 */
import { query, run } from '../db/repository'
import { chatCompletion, LLMConfig, getDefaultConfig } from '../ai/provider'
import { getSetting } from '../db/store'
import { generateId } from '../db/schema'
import { precomputeSynapseCandidates, type SynapseInput } from './scorer'
import { getAllEntities, queryEntity, type KnowledgeTriple, type GraphEntity } from '../memory/knowledge-graph'
import { getRoomByType, addMemoryItem } from '../memory/palace'

// ─── 接口 ───

export interface NeuronNode {
  id: string
  label: string
  type: 'project' | 'entity' | 'concept'
  activation: number      // 0-1 当前激活水平
  baseActivation: number  // 0-1 基线激活
  metadata: Record<string, unknown>
}

export interface NeuronEdge {
  source: string
  target: string
  weight: number         // 0-1 连接强度
  edgeType: string       // 关系类型
  decay: number          // 0-1 衰减率
}

export interface SwarmSimulation {
  id: string
  name: string
  neurons: NeuronNode[]
  edges: NeuronEdge[]
  breakthroughs: Breakthrough[]
  stats: SimulationStats
  createdAt: string
}

export interface Breakthrough {
  id: string
  sourceNeuron: string
  targetNeuron: string
  pathLength: number
  activationStrength: number
  insight: string
  novelty: number        // 0-1 新颖程度
  feasibility: number    // 0-1 可行程度
}

export interface SimulationStats {
  totalNeurons: number
  totalEdges: number
  iterations: number
  convergent: boolean
  peakActivation: number
  breakthroughCount: number
}

export type ActivationMode = 'spreading' | 'resonance' | 'competitive'

// ─── 表初始化 ───

async function ensureTable(): Promise<void> {
  await run(`CREATE TABLE IF NOT EXISTS swarm_simulations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    config_json TEXT DEFAULT '{}',
    results_json TEXT DEFAULT '{}',
    breakthroughs_json TEXT DEFAULT '[]',
    stats_json TEXT DEFAULT '{}',
    status TEXT DEFAULT 'completed',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)
}

// ─── 构建神经元网络 ───

/** 从项目数据构建神经元网络 */
export function buildNetworkFromProjects(projects: SynapseInput[]): {
  neurons: NeuronNode[]
  edges: NeuronEdge[]
} {
  const neurons: NeuronNode[] = projects.map(p => ({
    id: p.id,
    label: p.title,
    type: 'project' as const,
    activation: 0.5,
    baseActivation: 0.3 + ((p.analysis as any)?.survivalRate || 50) / 200,
    metadata: {
      oneLiner: p.oneLiner,
      industry: p.taxonomy?.industry,
      innovationType: p.taxonomy?.innovationType,
    },
  }))

  // 使用现有 scorer 计算边
  const candidates = precomputeSynapseCandidates(projects)
  const edges: NeuronEdge[] = candidates.slice(0, 50).map(c => ({
    source: c.source.id,
    target: c.target.id,
    weight: Math.min(c.overlap / 100, 1),
    edgeType: 'synaptic_overlap',
    decay: 0.05,
  }))

  return { neurons, edges }
}

/** 从 Knowledge Graph 构建神经元网络 */
export async function buildNetworkFromKnowledgeGraph(): Promise<{
  neurons: NeuronNode[]
  edges: NeuronEdge[]
}> {
  const entities = await getAllEntities()
  if (entities.length === 0) return { neurons: [], edges: [] }

  // 将 KG 实体映射为神经元
  const neurons: NeuronNode[] = entities.map(e => ({
    id: `kg_${Buffer.from(e.name).toString('base64').slice(0, 16)}`,
    label: e.name,
    type: 'entity' as const,
    activation: Math.min(0.3 + e.avgConfidence * 0.5, 1.0),
    baseActivation: Math.min(0.1 + e.tripleCount / 20, 0.6),
    metadata: {
      tripleCount: e.tripleCount,
      avgConfidence: e.avgConfidence,
      relationTypes: e.types,
      source: 'knowledge_graph',
    },
  }))

  // 从三元组构建边
  const edges: NeuronEdge[] = []
  const neuronIdMap = new Map(entities.map((e, i) => [e.name, neurons[i].id]))
  const seenEdges = new Set<string>()

  for (const entity of entities.slice(0, 30)) {
    const triples = await queryEntity(entity.name)
    for (const t of triples) {
      const sourceId = neuronIdMap.get(t.subject)
      const targetId = neuronIdMap.get(t.object)
      if (!sourceId || !targetId || sourceId === targetId) continue

      const edgeKey = [sourceId, targetId].sort().join('→')
      if (seenEdges.has(edgeKey)) continue
      seenEdges.add(edgeKey)

      edges.push({
        source: sourceId,
        target: targetId,
        weight: t.confidence,
        edgeType: t.predicate,
        decay: 0.03,
      })
    }
  }

  return { neurons, edges }
}

/** 构建混合网络：项目数据 + Knowledge Graph */
export async function buildHybridNetwork(projects: SynapseInput[]): Promise<{
  neurons: NeuronNode[]
  edges: NeuronEdge[]
}> {
  // 从项目构建基础网络
  const projectNetwork = buildNetworkFromProjects(projects)

  // 从 Knowledge Graph 增补
  const kgNetwork = await buildNetworkFromKnowledgeGraph()

  // 合并神经元（去重：项目名可能与 KG 实体重叠）
  const neuronMap = new Map<string, NeuronNode>()
  for (const n of [...projectNetwork.neurons, ...kgNetwork.neurons]) {
    const existing = neuronMap.get(n.label)
    if (existing) {
      // 项目节点优先，保留更高激活值
      existing.activation = Math.max(existing.activation, n.activation)
      existing.baseActivation = Math.max(existing.baseActivation, n.baseActivation)
    } else {
      neuronMap.set(n.label, { ...n })
    }
  }

  // 合并边
  const allEdges = [...projectNetwork.edges, ...kgNetwork.edges]
  // 重新映射边的 source/target 为统一后的 neuron id
  const labelToId = new Map([...neuronMap.values()].map(n => [n.label, n.id]))
  const seenEdges = new Set<string>()
  const mergedEdges: NeuronEdge[] = []

  for (const e of allEdges) {
    const key = [e.source, e.target].sort().join('→')
    if (seenEdges.has(key)) continue
    seenEdges.add(key)
    mergedEdges.push(e)
  }

  return {
    neurons: Array.from(neuronMap.values()),
    edges: mergedEdges,
  }
}

// ─── 激活扩散模拟 ───

/**
 * 运行激活扩散模拟
 * 核心算法：从种子节点注入能量，沿边扩散，观察哪些远距离节点被激活
 */
export function runSpreadingActivation(
  neurons: NeuronNode[],
  edges: NeuronEdge[],
  seedIds: string[],
  config: {
    mode?: ActivationMode
    iterations?: number
    decayRate?: number
    threshold?: number
    lateralInhibition?: number
  } = {}
): { neurons: NeuronNode[]; breakthroughs: Breakthrough[] } {
  const {
    mode = 'spreading',
    iterations = 10,
    decayRate = 0.1,
    threshold = 0.15,
    lateralInhibition = 0.3,
  } = config

  const nodeMap = new Map(neurons.map(n => [n.id, { ...n }]))
  const edgeMap = new Map<string, NeuronEdge[]>()
  for (const e of edges) {
    const list = edgeMap.get(e.source) || []
    list.push(e)
    edgeMap.set(e.source, list)
    // 双向
    const revList = edgeMap.get(e.target) || []
    revList.push({ ...e, source: e.target, target: e.source })
    edgeMap.set(e.target, revList)
  }

  // 初始激活：种子节点注入能量
  for (const seedId of seedIds) {
    const node = nodeMap.get(seedId)
    if (node) node.activation = 1.0
  }

  const breakthroughs: Breakthrough[] = []
  const previousActivations = new Map<string, number>()

  for (let iter = 0; iter < iterations; iter++) {
    // 保存上一轮激活值
    for (const [id, node] of nodeMap) {
      previousActivations.set(id, node.activation)
    }

    // 激活扩散
    for (const [id, node] of nodeMap) {
      const prevActivation = previousActivations.get(id) || 0
      if (prevActivation < threshold) continue

      const connectedEdges = edgeMap.get(id) || []
      for (const edge of connectedEdges) {
        const target = nodeMap.get(edge.target)
        if (!target) continue

        let transfer = prevActivation * edge.weight * (1 - decayRate)

        // 竞争模式：横向抑制
        if (mode === 'competitive' && target.activation > 0.5) {
          transfer *= (1 - lateralInhibition)
        }

        // 共振模式：如果目标已经激活，增强传递
        if (mode === 'resonance' && target.activation > threshold) {
          transfer *= 1.5
        }

        target.activation = Math.min(1.0, target.activation + transfer)
      }
    }

    // 衰减
    for (const node of nodeMap.values()) {
      if (!seedIds.includes(node.id)) {
        node.activation = Math.max(
          node.baseActivation,
          node.activation * (1 - decayRate * 0.5)
        )
      }
    }
  }

  // 检测突破：高激活的远距离节点
  const seedSet = new Set(seedIds)
  for (const node of nodeMap.values()) {
    if (seedSet.has(node.id)) continue
    if (node.activation < threshold * 2) continue

    // 检查与种子节点的最短路径
    for (const seedId of seedIds) {
      const pathLen = findShortestPathLength(edges, seedId, node.id)
      if (pathLen >= 2 && pathLen <= 5) {
        // 距离远但激活强 = 突破性发现
        const novelty = Math.min(1.0, pathLen / 5)
        breakthroughs.push({
          id: generateId(),
          sourceNeuron: seedId,
          targetNeuron: node.id,
          pathLength: pathLen,
          activationStrength: node.activation,
          insight: '', // 将由 LLM 填充
          novelty,
          feasibility: node.activation * (1 - novelty * 0.3),
        })
      }
    }
  }

  return {
    neurons: Array.from(nodeMap.values()),
    breakthroughs: breakthroughs.sort((a, b) => b.activationStrength * b.novelty - a.activationStrength * a.novelty),
  }
}

/** BFS 最短路径长度 */
function findShortestPathLength(edges: NeuronEdge[], from: string, to: string): number {
  const adjMap = new Map<string, string[]>()
  for (const e of edges) {
    const list = adjMap.get(e.source) || []
    list.push(e.target)
    adjMap.set(e.source, list)
    const revList = adjMap.get(e.target) || []
    revList.push(e.source)
    adjMap.set(e.target, revList)
  }

  const visited = new Set<string>([from])
  const queue: Array<{ id: string; dist: number }> = [{ id: from, dist: 0 }]

  while (queue.length > 0) {
    const { id, dist } = queue.shift()!
    if (id === to) return dist

    const neighbors = adjMap.get(id) || []
    for (const n of neighbors) {
      if (!visited.has(n)) {
        visited.add(n)
        queue.push({ id: n, dist: dist + 1 })
      }
    }
  }

  return Infinity
}

// ─── LLM 增强突破分析 ───

/** 用 LLM 为突破性发现生成洞察 */
export async function enrichBreakthroughs(
  breakthroughs: Breakthrough[],
  neurons: NeuronNode[],
  context?: string
): Promise<Breakthrough[]> {
  if (breakthroughs.length === 0) return []

  const provider = getSetting('llm_provider', 'deepseek')
  const defaults = getDefaultConfig(provider)
  const config: LLMConfig = {
    provider: provider as LLMConfig['provider'],
    apiKey: getSetting('llm_api_key', ''),
    baseUrl: getSetting('llm_base_url', defaults.baseUrl),
    model: getSetting('llm_model', defaults.model),
  }

  const nodeMap = new Map(neurons.map(n => [n.id, n]))
  const topBreakthroughs = breakthroughs.slice(0, 5)

  for (const bt of topBreakthroughs) {
    const source = nodeMap.get(bt.sourceNeuron)
    const target = nodeMap.get(bt.targetNeuron)

    try {
      const insight = await chatCompletion(config, [
        {
          role: 'system',
          content: `你是一个创新发现引擎。两个看似不相关的概念通过隐含路径产生了强关联。

概念 A: ${source?.label || bt.sourceNeuron} — ${JSON.stringify(source?.metadata || {})}
概念 B: ${target?.label || bt.targetNeuron} — ${JSON.stringify(target?.metadata || {})}
路径距离: ${bt.pathLength}
激活强度: ${(bt.activationStrength * 100).toFixed(0)}%
新颖度: ${(bt.novelty * 100).toFixed(0)}%
${context ? `背景: ${context}` : ''}

请用一句话描述这两个概念之间的隐含关联，以及可能产生的创新洞察。
格式：直接输出洞察文字，不超过 50 字。`,
        },
        { role: 'user', content: '生成洞察' },
      ], 0.8, 200)

      bt.insight = insight?.trim() || ''
    } catch {
      bt.insight = `${source?.label || bt.sourceNeuron} 与 ${target?.label || bt.targetNeuron} 存在隐含关联`
    }
  }

  return topBreakthroughs
}

// ─── 完整模拟流程 ───

/** 运行完整的集群模拟 */
export async function runSwarmSimulation(
  projects: SynapseInput[],
  options: {
    seedProjectIds?: string[]
    mode?: ActivationMode
    iterations?: number
    enrich?: boolean
    /** 是否从 Knowledge Graph 增补网络（默认 true） */
    useKnowledgeGraph?: boolean
  } = {}
): Promise<SwarmSimulation> {
  await ensureTable()

  // 1. 构建网络（混合项目数据 + Knowledge Graph）
  const useKG = options.useKnowledgeGraph !== false
  const { neurons, edges } = useKG
    ? await buildHybridNetwork(projects)
    : buildNetworkFromProjects(projects)

  // 2. 选择种子节点
  const seedIds = options.seedProjectIds?.length
    ? options.seedProjectIds
    : projects.slice(0, 3).map(p => p.id)

  // 3. 运行三种模式的模拟，取最佳结果
  const modes: ActivationMode[] = options.mode ? [options.mode] : ['spreading', 'resonance', 'competitive']
  let bestResult: { neurons: NeuronNode[]; breakthroughs: Breakthrough[] } | null = null
  let bestMode: ActivationMode = 'spreading'

  for (const mode of modes) {
    const result = runSpreadingActivation(neurons, edges, seedIds, {
      mode,
      iterations: options.iterations || 15,
    })
    if (!bestResult || result.breakthroughs.length > bestResult.breakthroughs.length) {
      bestResult = result
      bestMode = mode
    }
  }

  // 4. LLM 增强（可选）
  const finalResult = bestResult!
  if (options.enrich !== false && finalResult.breakthroughs.length > 0) {
    finalResult.breakthroughs = await enrichBreakthroughs(finalResult.breakthroughs, finalResult.neurons)
  }

  // 4.5 突破写入 Memory Palace Innovation Lab
  if (finalResult.breakthroughs.length > 0) {
    writeBreakthroughsToPalace(finalResult.breakthroughs, finalResult.neurons).catch(() => {})
  }

  // 5. 计算统计
  const stats: SimulationStats = {
    totalNeurons: finalResult.neurons.length,
    totalEdges: edges.length,
    iterations: options.iterations || 15,
    convergent: finalResult.breakthroughs.length < 3,
    peakActivation: Math.max(...finalResult.neurons.map(n => n.activation)),
    breakthroughCount: finalResult.breakthroughs.length,
  }

  // 6. 保存结果
  const simulation: SwarmSimulation = {
    id: generateId(),
    name: `Swarm-${bestMode}-${Date.now()}`,
    neurons: finalResult.neurons,
    edges,
    breakthroughs: finalResult.breakthroughs,
    stats,
    createdAt: new Date().toISOString(),
  }

  try {
    await run(
      `INSERT INTO swarm_simulations (id, name, config_json, results_json, breakthroughs_json, stats_json, status)
       VALUES (?, ?, ?, ?, ?, ?, 'completed')`,
      [
        simulation.id,
        simulation.name,
        JSON.stringify({ mode: bestMode, seedIds }),
        JSON.stringify({ neuronCount: stats.totalNeurons, edgeCount: stats.totalEdges }),
        JSON.stringify(simulation.breakthroughs),
        JSON.stringify(stats),
      ]
    )
  } catch { /* ignore save failure */ }

  return simulation
}

/** 获取历史模拟 */
export async function getSimulationHistory(limit: number = 10): Promise<Array<{
  id: string; name: string; stats: SimulationStats; breakthroughs: Breakthrough[]; createdAt: string
}>> {
  await ensureTable()
  const rows = await query<{
    id: string; name: string; stats_json: string; breakthroughs_json: string; created_at: string
  }>(
    'SELECT id, name, stats_json, breakthroughs_json, created_at FROM swarm_simulations ORDER BY created_at DESC LIMIT ?',
    [limit]
  )
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    stats: JSON.parse(r.stats_json || '{}'),
    breakthroughs: JSON.parse(r.breakthroughs_json || '[]'),
    createdAt: r.created_at,
  }))
}

/** 渲染模拟结果为 Prompt */
export function renderSwarmPrompt(simulation: SwarmSimulation): string {
  if (simulation.breakthroughs.length === 0) return ''

  const lines = simulation.breakthroughs.slice(0, 5).map(b =>
    `- ${b.insight || `${b.sourceNeuron} ↔ ${b.targetNeuron}`} [新颖度 ${(b.novelty * 100).toFixed(0)}%, 可行度 ${(b.feasibility * 100).toFixed(0)}%]`
  )

  return `<swarm-breakthroughs>
Discovered through neuron swarm simulation (${simulation.stats.totalNeurons} neurons, ${simulation.stats.totalEdges} edges):
${lines.join('\n')}
</swarm-breakthroughs>`
}

/** 将突破性发现写入 Memory Palace Innovation Lab */
async function writeBreakthroughsToPalace(
  breakthroughs: Breakthrough[],
  neurons: NeuronNode[]
): Promise<void> {
  try {
    const room = await getRoomByType('innovation')
    if (!room) return

    const nodeMap = new Map(neurons.map(n => [n.id, n]))

    for (const bt of breakthroughs.slice(0, 3)) {
      const source = nodeMap.get(bt.sourceNeuron)
      const target = nodeMap.get(bt.targetNeuron)
      const content = bt.insight || `${source?.label || bt.sourceNeuron} ↔ ${target?.label || bt.targetNeuron}`

      await addMemoryItem({
        roomId: room.id,
        type: 'breakthrough',
        content: `[Swarm突破] ${content} (新颖度 ${(bt.novelty * 100).toFixed(0)}%, 路径距离 ${bt.pathLength})`,
        source: 'neuron_swarm',
        importance: Math.round(bt.novelty * 8 + bt.feasibility * 2),
        metadataJson: JSON.stringify({
          activationStrength: bt.activationStrength,
          novelty: bt.novelty,
          feasibility: bt.feasibility,
          sourceNeuron: source?.label,
          targetNeuron: target?.label,
        }),
      })
    }
  } catch { /* ignore */ }
}

/** 获取最近一次 Swarm 模拟状态（供工具循环注入用） */
export async function getLatestSwarmState(): Promise<{
  breakthroughs: Breakthrough[]
  stats: SimulationStats | null
} | null> {
  const history = await getSimulationHistory(1)
  if (history.length === 0) return null
  return {
    breakthroughs: history[0].breakthroughs,
    stats: history[0].stats,
  }
}
