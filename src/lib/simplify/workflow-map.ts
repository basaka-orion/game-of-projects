import type { OperatingEventRow } from '../db/repository'

export type SimplifyNodeId =
  | 'boss'
  | 'neurons'
  | 'synapses'
  | 'memory'
  | 'knowledge'
  | 'workflow'
  | 'teams'
  | 'scheduler'
  | 'audit'
  | 'xiaobai'
  | 'control'

export type SimplifyNodeStatus = 'quiet' | 'active' | 'warning' | 'current'
export type SimplifyInsightKind = 'opportunity' | 'response' | 'anti_echo'

export interface SimplifyCoreNode {
  id: SimplifyNodeId
  label: string
  shortLabel: string
  role: string
  targetTab: string
  status: SimplifyNodeStatus
  activityCount: number
  timestampLabel: string
  detail: string
}

export interface SimplifyWorkflowEdge {
  id: string
  source: SimplifyNodeId
  target: SimplifyNodeId
  label: string
  timestampLabel: string
  strength: number
  active: boolean
  eventIds: string[]
}

export interface SimplifyCurrentFlow {
  demand: string
  createdAt: string
  createdAtLabel: string
  recommendedNodeIds: SimplifyNodeId[]
  firstAction: string
  steps: Array<{
    id: string
    nodeId: SimplifyNodeId
    title: string
    detail: string
  }>
}

export interface SimplifyInsight {
  id: string
  kind: SimplifyInsightKind
  title: string
  summary: string
  targetNodeIds: SimplifyNodeId[]
  actionLabel: string
  targetTab: string
}

export interface SimplifyWorkflowMap {
  windowDays: number
  sinceLabel: string
  headline: string
  summary: {
    eventCount: number
    activeNodeCount: number
    strongestCollaboration: string
    currentMode: 'history' | 'current'
  }
  nodes: SimplifyCoreNode[]
  edges: SimplifyWorkflowEdge[]
  currentFlow?: SimplifyCurrentFlow
  insights: SimplifyInsight[]
}

export interface BuildSimplifyWorkflowMapInput {
  operatingEvents: OperatingEventRow[]
  now?: Date
  windowDays?: number
  currentDemand?: string
  projectCount?: number
  synapseCount?: number
  bossMemoryCount?: number
  pendingArchiveCount?: number
  workflowCount?: number
}

const CORE_NODES: Array<Omit<SimplifyCoreNode, 'status' | 'activityCount' | 'timestampLabel' | 'detail'>> = [
  { id: 'boss', label: 'Boss', shortLabel: 'Boss', role: '北极星', targetTab: 'boss' },
  { id: 'neurons', label: '项目神经元', shortLabel: '项目', role: '现实抓手', targetTab: 'neurons' },
  { id: 'synapses', label: '突触', shortLabel: '连接', role: '组合创新', targetTab: 'synapses' },
  { id: 'memory', label: '记忆宫殿', shortLabel: '记忆', role: '长期沉淀', targetTab: 'memory' },
  { id: 'knowledge', label: '知识＋大佬', shortLabel: '知识', role: '资料编译', targetTab: 'knowledge' },
  { id: 'workflow', label: '工作流', shortLabel: '流程', role: '稳定复用', targetTab: 'workflow' },
  { id: 'teams', label: '群策', shortLabel: '群策', role: '多角色协作', targetTab: 'teams' },
  { id: 'scheduler', label: '定时', shortLabel: '定时', role: '主动节律', targetTab: 'scheduler' },
  { id: 'audit', label: '系统自省', shortLabel: '自省', role: '进化审查', targetTab: 'system-audit' },
  { id: 'xiaobai', label: '小白', shortLabel: '小白', role: '翻译执行', targetTab: 'xiaobai' },
  { id: 'control', label: '控制', shortLabel: '控制', role: '模型工具', targetTab: 'control' },
]

const KEYWORDS: Record<SimplifyNodeId, RegExp[]> = {
  boss: [/boss/i, /画像|偏好|认知|长期愿景|当前焦点|自我蒸馏/],
  neurons: [/project/i, /项目|神经元|产品|创意|生存率|推演室|WarRoom/i],
  synapses: [/synapse/i, /突触|连接|组合|混种|跨界/],
  memory: [/memory|mempalace|archive/i, /记忆|归档|入宫|启蒙|沉淀|抽屉/],
  knowledge: [/knowledge|wiki|notebook|source/i, /知识|资料|页面|引用|来源|视频|字幕|PDF|网页|万象/],
  workflow: [/workflow|studio/i, /工作流|流程|试跑|植入|复用/],
  teams: [/team|council|agent/i, /群策|智囊团|角色|协作|PRD|评审/],
  scheduler: [/cron|schedule|task/i, /定时|每天|每周|夜巡|任务|提醒|推送/],
  audit: [/audit|nightly|dream|self-repair/i, /自省|审计|进化|学习进度|安全修复|梦境|夜巡/],
  xiaobai: [/xiaobai|rljb|wanxiang|ui-museum|food-ad/i, /小白|人类基本盘|灵犀|万象学习|风格馆|广告大片/],
  control: [/control|mcp|model|gateway|setting/i, /控制|模型|API|MCP|工具|配置|密钥|路由/],
}

const CURRENT_STEPS: Record<SimplifyNodeId, string> = {
  boss: '先校准 Boss 画像和当前焦点。',
  neurons: '把需求落到一个项目神经元或新项目假设。',
  synapses: '找出可迁移、可组合、可反用的连接。',
  memory: '判断哪些内容值得成为长期记忆。',
  knowledge: '导入或选择资料，再编译成可引用知识。',
  workflow: '把重复路径固化为可试跑工作流。',
  teams: '让多角色围绕同一目标产出可检查成果。',
  scheduler: '把稳定任务设成先试跑、再开启的节律。',
  audit: '用系统自省检查愿景、证据、风险和进化缺口。',
  xiaobai: '把复杂需求翻译成小白也能执行的第一步。',
  control: '确认模型、工具、权限和运行环境可用。',
}

function parseTime(value: string): number {
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : 0
}

function compactText(value: string, limit = 82): string {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text
}

function dateTimeLabel(value: string, now: Date): string {
  const time = parseTime(value)
  if (!time) return '未记录时间'
  const diff = Math.max(0, now.getTime() - time)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 2) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} 小时前`
  return value.slice(0, 16).replace('T', ' ')
}

function includesKeyword(text: string, nodeId: SimplifyNodeId): boolean {
  return KEYWORDS[nodeId].some((pattern) => pattern.test(text))
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value || '[]') as unknown
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : []
  } catch {
    return []
  }
}

export function inferSimplifyNodeIds(text: string): SimplifyNodeId[] {
  const source = text.trim()
  if (!source) return ['xiaobai', 'workflow', 'boss']
  const matches = CORE_NODES.map((node) => node.id).filter((nodeId) => includesKeyword(source, nodeId))
  if (matches.length > 0) return Array.from(new Set(matches)).slice(0, 4)
  return ['xiaobai', 'workflow', 'teams']
}

function eventNodeIds(event: OperatingEventRow): SimplifyNodeId[] {
  const text = [
    event.id,
    event.type,
    event.stage,
    event.title,
    event.summary,
    event.source_kind,
    event.source_id,
    event.source_title,
    ...parseStringArray(event.entities_json),
  ].join(' ')
  const nodes = CORE_NODES.map((node) => node.id).filter((nodeId) => includesKeyword(text, nodeId))

  if (event.type === 'memory_candidate') nodes.push('memory')
  if (event.type === 'knowledge_source') nodes.push('knowledge')
  if (event.type === 'project_signal') nodes.push('neurons')
  if (event.type === 'boss_signal') nodes.push('boss')
  if (event.stage === 'review') nodes.push('audit')
  if (event.stage === 'compile') nodes.push('knowledge')
  if (event.stage === 'remember') nodes.push('memory')
  if (event.stage === 'capture') nodes.push('boss')

  return Array.from(new Set(nodes)).slice(0, 4)
}

function stageHub(event: OperatingEventRow, nodeId: SimplifyNodeId): SimplifyNodeId {
  if (event.stage === 'capture') return 'boss'
  if (event.stage === 'understand') return 'xiaobai'
  if (event.stage === 'remember') return 'memory'
  if (event.stage === 'compile') return 'knowledge'
  if (event.stage === 'review') return 'audit'
  if (event.stage === 'execute') return nodeId === 'teams' ? 'workflow' : 'teams'
  if (event.stage === 'explore') return 'synapses'
  if (event.stage === 'simulate') return 'workflow'
  return 'workflow'
}

function edgeLabel(source: SimplifyNodeId, target: SimplifyNodeId): string {
  const labels: Partial<Record<`${SimplifyNodeId}:${SimplifyNodeId}`, string>> = {
    'boss:xiaobai': '需求翻译',
    'boss:workflow': '需求成流',
    'boss:memory': '偏好沉淀',
    'boss:neurons': '项目牵引',
    'xiaobai:workflow': '化繁为简',
    'workflow:teams': '交给群策',
    'workflow:scheduler': '固化节律',
    'teams:knowledge': '成果成库',
    'teams:audit': '执行复盘',
    'knowledge:memory': '知识入宫',
    'knowledge:neurons': '知识支撑',
    'memory:boss': '反哺画像',
    'synapses:teams': '组合实验',
    'audit:workflow': '修补流程',
    'control:workflow': '能力供给',
  }
  return labels[`${source}:${target}`] || '协作'
}

function addEdge(
  edges: Map<string, { edge: SimplifyWorkflowEdge; lastTime: number }>,
  source: SimplifyNodeId,
  target: SimplifyNodeId,
  event: OperatingEventRow,
  now: Date,
) {
  if (source === target) return
  const key = `${source}:${target}`
  const existing = edges.get(key)
  const eventTime = parseTime(event.created_at)
  if (existing) {
    existing.edge.strength += 1
    existing.edge.eventIds = Array.from(new Set([...existing.edge.eventIds, event.id])).slice(0, 8)
    if (eventTime >= existing.lastTime) {
      existing.lastTime = eventTime
      existing.edge.timestampLabel = dateTimeLabel(event.created_at, now)
    }
    return
  }
  edges.set(key, {
    lastTime: eventTime,
    edge: {
      id: `simplify-edge-${key}`,
      source,
      target,
      label: edgeLabel(source, target),
      timestampLabel: dateTimeLabel(event.created_at, now),
      strength: 1,
      active: true,
      eventIds: [event.id],
    },
  })
}

function buildCurrentFlow(demand: string, now: Date): SimplifyCurrentFlow | undefined {
  const compact = compactText(demand, 140)
  if (!compact) return undefined
  const recommendedNodeIds = inferSimplifyNodeIds(compact)
  const steps = recommendedNodeIds.map((nodeId, index) => ({
    id: `current-${nodeId}-${index}`,
    nodeId,
    title: CORE_NODES.find((node) => node.id === nodeId)?.label || nodeId,
    detail: CURRENT_STEPS[nodeId],
  }))
  return {
    demand: compact,
    createdAt: now.toISOString(),
    createdAtLabel: dateTimeLabel(now.toISOString(), now),
    recommendedNodeIds,
    firstAction: CURRENT_STEPS[recommendedNodeIds[0]] || '先把需求翻译成最小下一步。',
    steps,
  }
}

function buildNodeDetail(nodeId: SimplifyNodeId, input: BuildSimplifyWorkflowMapInput): string {
  if (nodeId === 'boss') return `${input.bossMemoryCount || 0} 条 Boss 记忆燃料`
  if (nodeId === 'neurons') return `${input.projectCount || 0} 个项目神经元`
  if (nodeId === 'synapses') return `${input.synapseCount || 0} 条项目连接`
  if (nodeId === 'memory') return `${input.pendingArchiveCount || 0} 条待确认入口`
  if (nodeId === 'workflow') return `${input.workflowCount || 0} 条可复用流程`
  return '等待真实协作信号'
}

function buildInsights(input: BuildSimplifyWorkflowMapInput, currentFlow: SimplifyCurrentFlow | undefined): SimplifyInsight[] {
  const hasKnowledge = input.operatingEvents.some((event) => eventNodeIds(event).includes('knowledge'))
  const hasReview = input.operatingEvents.some((event) => event.stage === 'review' || eventNodeIds(event).includes('audit'))
  const opportunityTarget: SimplifyNodeId = (input.synapseCount || 0) > 0 ? 'synapses' : 'teams'
  const responseTarget = currentFlow?.recommendedNodeIds[0] || 'xiaobai'

  return [
    {
      id: 'simplify-insight-opportunity',
      kind: 'opportunity',
      title: '无中生有',
      summary:
        (input.projectCount || 0) > 0 || (input.bossMemoryCount || 0) > 0
          ? '把 Boss 画像、近期项目和资料沉淀合成一个小实验，不先做大系统。'
          : '先接入一个真实输入，让系统有机会长出第一条新连接。',
      targetNodeIds: ['boss', opportunityTarget, 'teams'],
      actionLabel: opportunityTarget === 'synapses' ? '看连接' : '开群策',
      targetTab: CORE_NODES.find((node) => node.id === opportunityTarget)?.targetTab || 'teams',
    },
    {
      id: 'simplify-insight-response',
      kind: 'response',
      title: currentFlow ? '当下需求' : '灵感入口',
      summary: currentFlow
        ? `先走：${CURRENT_STEPS[responseTarget]}`
        : 'Boss 输入一句话后，这里会把复杂需求变成当下工作流地图。',
      targetNodeIds: currentFlow?.recommendedNodeIds || ['xiaobai', 'workflow'],
      actionLabel: '看路径',
      targetTab: CORE_NODES.find((node) => node.id === responseTarget)?.targetTab || 'xiaobai',
    },
    {
      id: 'simplify-insight-anti-echo',
      kind: 'anti_echo',
      title: '反茧房',
      summary: hasKnowledge && hasReview
        ? '近期已有知识和复盘信号，下一步要找一个反证来避免自嗨。'
        : '近期证据或复盘偏少，先补来源和审查，别让系统只会顺着想法往前冲。',
      targetNodeIds: hasReview ? ['audit', 'knowledge'] : ['knowledge', 'audit'],
      actionLabel: hasReview ? '找反证' : '补证据',
      targetTab: hasReview ? 'system-audit' : 'knowledge',
    },
  ]
}

export function buildSimplifyWorkflowMap(input: BuildSimplifyWorkflowMapInput): SimplifyWorkflowMap {
  const now = input.now || new Date()
  const windowDays = input.windowDays ?? 30
  const floor = now.getTime() - windowDays * 24 * 60 * 60 * 1000
  const recentEvents = input.operatingEvents
    .filter((event) => parseTime(event.created_at) >= floor)
    .slice()
    .sort((a, b) => parseTime(b.created_at) - parseTime(a.created_at))

  const currentFlow = buildCurrentFlow(input.currentDemand || '', now)
  const activity = new Map<SimplifyNodeId, { count: number; lastEvent?: OperatingEventRow }>()
  const edgeMap = new Map<string, { edge: SimplifyWorkflowEdge; lastTime: number }>()

  for (const event of recentEvents) {
    const nodes = eventNodeIds(event)
    nodes.forEach((nodeId) => {
      const existing = activity.get(nodeId)
      if (!existing || parseTime(event.created_at) > parseTime(existing.lastEvent?.created_at || '')) {
        activity.set(nodeId, { count: (existing?.count || 0) + 1, lastEvent: event })
      } else {
        activity.set(nodeId, { ...existing, count: existing.count + 1 })
      }
    })

    nodes.forEach((nodeId) => addEdge(edgeMap, stageHub(event, nodeId), nodeId, event, now))
    for (let index = 0; index < nodes.length - 1; index += 1) {
      addEdge(edgeMap, nodes[index], nodes[index + 1], event, now)
    }
  }

  if (currentFlow) {
    addEdge(edgeMap, 'boss', currentFlow.recommendedNodeIds[0], {
      id: 'current-demand',
      type: 'input_event',
      stage: 'capture',
      title: 'Boss 当前需求',
      summary: currentFlow.demand,
      source_kind: 'manual',
      source_id: 'simplify',
      source_title: '化繁为简',
      confidence: 0.9,
      entities_json: '[]',
      project_ids_json: '[]',
      payload_json: '{}',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    }, now)
    for (let index = 0; index < currentFlow.recommendedNodeIds.length - 1; index += 1) {
      addEdge(edgeMap, currentFlow.recommendedNodeIds[index], currentFlow.recommendedNodeIds[index + 1], {
        id: `current-demand-${index}`,
        type: 'agent_action',
        stage: 'understand',
        title: '化繁为简当下路径',
        summary: currentFlow.demand,
        source_kind: 'agent',
        source_id: 'simplify',
        source_title: '化繁为简',
        confidence: 0.9,
        entities_json: '[]',
        project_ids_json: '[]',
        payload_json: '{}',
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      }, now)
    }
  }

  const currentSet = new Set(currentFlow?.recommendedNodeIds || [])
  const nodes = CORE_NODES.map<SimplifyCoreNode>((node) => {
    const stats = activity.get(node.id)
    const status: SimplifyNodeStatus =
      currentSet.has(node.id)
        ? 'current'
        : node.id === 'memory' && (input.pendingArchiveCount || 0) > 0
          ? 'warning'
          : stats
            ? 'active'
            : 'quiet'
    return {
      ...node,
      status,
      activityCount: stats?.count || 0,
      timestampLabel: stats?.lastEvent ? dateTimeLabel(stats.lastEvent.created_at, now) : '近 30 天未触发',
      detail: stats?.lastEvent ? compactText(stats.lastEvent.summary || stats.lastEvent.title) : buildNodeDetail(node.id, input),
    }
  })

  const edges = Array.from(edgeMap.values())
    .map((entry) => entry.edge)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 18)

  const strongest = edges[0]
  return {
    windowDays,
    sinceLabel: new Date(floor).toISOString().slice(0, 10),
    headline: currentFlow ? '当下需求已经压缩成一条可走路径。' : '最近 30 天的核心功能合作已经收束成一张图。',
    summary: {
      eventCount: recentEvents.length,
      activeNodeCount: nodes.filter((node) => node.status === 'active' || node.status === 'current').length,
      strongestCollaboration: strongest ? `${strongest.label} · ${strongest.strength} 次` : '等待第一条真实协作',
      currentMode: currentFlow ? 'current' : 'history',
    },
    nodes,
    edges,
    currentFlow,
    insights: buildInsights({ ...input, operatingEvents: recentEvents }, currentFlow),
  }
}
