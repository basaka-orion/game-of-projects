import type { OperatingEventRow, SynapseRow } from '../db/repository'
import type { OperatingLoopTarget, OperatingLoopTone } from './types'

export type ProjectNeuralNodeType = 'project' | 'memory' | 'knowledge' | 'agent'

export interface ProjectNetworkProject {
  id: string
  title: string
  oneLiner?: string
  tags: string[]
  survivalRate: number
  taxonomyLabel?: string
}

export interface ProjectNetworkMemory {
  category: string
  content: string
  confidence: number
  created_at: string
}

export interface ProjectNeuralNode {
  id: string
  type: ProjectNeuralNodeType
  title: string
  subtitle: string
  score: number
  target: OperatingLoopTarget
  tone?: OperatingLoopTone
}

export interface ProjectNeuralLink {
  id: string
  source: string
  target: string
  label: string
  strength: number
}

export interface ProjectNeuralNetwork {
  nodes: ProjectNeuralNode[]
  links: ProjectNeuralLink[]
  summary: {
    projectNodes: number
    memoryNodes: number
    knowledgeNodes: number
    agentNodes: number
    linkedNodes: number
    strongestSignal: string
  }
}

interface BuildProjectNeuralNetworkInput {
  projects: ProjectNetworkProject[]
  synapses: SynapseRow[]
  memories: ProjectNetworkMemory[]
  operatingEvents: OperatingEventRow[]
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function safeJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function truncate(value: string, max = 64): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}...`
}

function nodeTone(score: number): OperatingLoopTone {
  if (score >= 78) return 'success'
  if (score >= 55) return 'accent'
  return 'warning'
}

function textMatchesProject(text: string, project: ProjectNetworkProject): boolean {
  const haystack = text.toLowerCase()
  if (project.title && haystack.includes(project.title.toLowerCase())) return true
  return project.tags.some((tag) => tag.length >= 2 && haystack.includes(tag.toLowerCase()))
}

function eventText(event: OperatingEventRow): string {
  return [event.title, event.summary, event.source_title].filter(Boolean).join(' ')
}

function addLink(links: ProjectNeuralLink[], link: ProjectNeuralLink) {
  if (link.source === link.target) return
  if (links.some((item) => item.source === link.source && item.target === link.target && item.label === link.label))
    return
  links.push(link)
}

export function buildProjectNeuralNetwork(input: BuildProjectNeuralNetworkInput): ProjectNeuralNetwork {
  const projectNodes = input.projects
    .slice()
    .sort((a, b) => b.survivalRate - a.survivalRate)
    .slice(0, 8)
    .map<ProjectNeuralNode>((project) => ({
      id: `project:${project.id}`,
      type: 'project',
      title: project.title,
      subtitle: project.taxonomyLabel || project.oneLiner || project.tags.slice(0, 3).join(' · ') || '项目神经元',
      score: clampScore(project.survivalRate),
      target: 'neurons',
      tone: nodeTone(project.survivalRate),
    }))

  const projectIds = new Set(projectNodes.map((node) => node.id.replace('project:', '')))
  const nodes: ProjectNeuralNode[] = [...projectNodes]
  const links: ProjectNeuralLink[] = []

  for (const synapse of input.synapses.slice(0, 12)) {
    if (!projectIds.has(synapse.source_id) || !projectIds.has(synapse.target_id)) continue
    addLink(links, {
      id: `synapse:${synapse.id}`,
      source: `project:${synapse.source_id}`,
      target: `project:${synapse.target_id}`,
      label: synapse.type || '项目突触',
      strength: clampScore(Number(synapse.strength || 0)),
    })
  }

  input.memories.slice(0, 5).forEach((memory, index) => {
    const nodeId = `memory:${index}:${memory.created_at}`
    nodes.push({
      id: nodeId,
      type: 'memory',
      title: memory.category || 'Boss 记忆',
      subtitle: truncate(memory.content),
      score: clampScore(memory.confidence * 100),
      target: 'memory',
      tone: nodeTone(memory.confidence * 100),
    })

    for (const project of input.projects) {
      if (!projectIds.has(project.id) || !textMatchesProject(memory.content, project)) continue
      addLink(links, {
        id: `memory-link:${index}:${project.id}`,
        source: nodeId,
        target: `project:${project.id}`,
        label: '记忆指向',
        strength: clampScore(memory.confidence * 100),
      })
    }
  })

  input.operatingEvents.slice(0, 12).forEach((event) => {
    const projectRefs = safeJsonArray(event.project_ids_json).filter((id) => projectIds.has(id))
    const matchedProjects = input.projects
      .filter((project) => projectIds.has(project.id) && textMatchesProject(eventText(event), project))
      .map((project) => project.id)
    const targets = Array.from(new Set([...projectRefs, ...matchedProjects]))

    if (event.type === 'knowledge_source' || event.stage === 'compile' || event.source_kind === 'wiki') {
      const nodeId = `knowledge:${event.id}`
      nodes.push({
        id: nodeId,
        type: 'knowledge',
        title: event.source_title || event.title || '知识来源',
        subtitle: truncate(event.summary || '已进入知识编译链路。'),
        score: clampScore((event.confidence ?? 0.72) * 100),
        target: 'knowledge',
        tone: 'accent',
      })
      targets.forEach((projectId) =>
        addLink(links, {
          id: `knowledge-link:${event.id}:${projectId}`,
          source: nodeId,
          target: `project:${projectId}`,
          label: '知识支撑',
          strength: clampScore((event.confidence ?? 0.72) * 100),
        }),
      )
    }

    if (event.type === 'agent_action' || event.stage === 'execute') {
      const nodeId = `agent:${event.id}`
      nodes.push({
        id: nodeId,
        type: 'agent',
        title: event.source_title || event.title || '执行行动',
        subtitle: truncate(event.summary || '执行结果等待复盘。'),
        score: clampScore((event.confidence ?? 0.62) * 100),
        target: 'teams',
        tone: event.confidence && event.confidence >= 0.8 ? 'success' : 'accent',
      })
      targets.forEach((projectId) =>
        addLink(links, {
          id: `agent-link:${event.id}:${projectId}`,
          source: nodeId,
          target: `project:${projectId}`,
          label: '行动回写',
          strength: clampScore((event.confidence ?? 0.62) * 100),
        }),
      )
    }
  })

  const nodeIdsWithLinks = new Set<string>()
  links.forEach((link) => {
    nodeIdsWithLinks.add(link.source)
    nodeIdsWithLinks.add(link.target)
  })
  const strongest = links.slice().sort((a, b) => b.strength - a.strength)[0]

  return {
    nodes,
    links: links
      .slice()
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 18),
    summary: {
      projectNodes: nodes.filter((node) => node.type === 'project').length,
      memoryNodes: nodes.filter((node) => node.type === 'memory').length,
      knowledgeNodes: nodes.filter((node) => node.type === 'knowledge').length,
      agentNodes: nodes.filter((node) => node.type === 'agent').length,
      linkedNodes: nodeIdsWithLinks.size,
      strongestSignal: strongest ? `${strongest.label} · ${strongest.strength}` : '等待第一条跨节点连接',
    },
  }
}
