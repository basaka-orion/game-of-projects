import type { TeamMessage } from '../teams/types'
import type { CouncilQualityGate } from './quality-gate'
import type { CouncilSelection } from './selector'

export type CouncilDebateRelation = 'support' | 'oppose' | 'revise' | 'absorb' | 'cut'

export interface CouncilDebateScene {
  id: string
  sceneNo: number
  phaseId?: string
  phaseLabel: string
  sceneTitle: string
  speakerPersonaId: string
  speakerName: string
  targetPersonaIds: string[]
  targetNames: string[]
  claim: string
  objection: string
  evidence: string
  verdictImpact: string
  sourceMessageIds: string[]
  sourceExcerpt: string
}

export interface CouncilDebateMapNode {
  id: string
  label: string
  kind: 'persona' | 'verdict' | 'quality'
  personaId?: string
  weight: number
}

export interface CouncilDebateMapEdge {
  id: string
  fromId: string
  toId: string
  relation: CouncilDebateRelation
  label: string
  strength: number
  sourceSceneId: string
}

export interface CouncilDebateMap {
  nodes: CouncilDebateMapNode[]
  edges: CouncilDebateMapEdge[]
  summary: string
}

export interface CouncilVerdictLedgerItem {
  id: string
  label: string
  sourceSceneId?: string
  sourceMessageIds: string[]
}

export interface CouncilVerdictLedger {
  kept: CouncilVerdictLedgerItem[]
  cut: CouncilVerdictLedgerItem[]
  revised: CouncilVerdictLedgerItem[]
  evidenceGaps: CouncilVerdictLedgerItem[]
  prdImpacts: CouncilVerdictLedgerItem[]
  openDisagreements: CouncilVerdictLedgerItem[]
  summary: string
}

export interface CouncilDebateTheater {
  scenes: CouncilDebateScene[]
  debateMap: CouncilDebateMap
  verdictLedger: CouncilVerdictLedger
}

interface CouncilDebateTheaterInput {
  selection: CouncilSelection
  messages: TeamMessage[]
  prdMarkdown?: string
  qualityGate?: CouncilQualityGate
}

function compact(value: string, max = 220): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function section(content: string, title: string): string {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = content.match(new RegExp(`【${escaped}】([\\s\\S]*?)(?=【[^】]+】|$)`))
  return compact(match?.[1] || '', 420)
}

function firstMeaningfulLine(content: string): string {
  return compact(content.split('\n').map((line) => line.trim()).find(Boolean) || content, 260)
}

function personaForMessage(selection: CouncilSelection, message: TeamMessage): {
  id: string
  name: string
} {
  const match = selection.seats.find((seat) =>
    [seat.persona.name, seat.persona.shortName, seat.persona.id].some((name) =>
      name && (message.agentName.includes(name) || name.includes(message.agentName) || message.agentId === name),
    ),
  )
  return match ? { id: match.persona.id, name: match.persona.name } : { id: message.agentId, name: message.agentName }
}

function inferTargets(selection: CouncilSelection, message: TeamMessage, speakerPersonaId: string): Array<{ id: string; name: string }> {
  const metadataTargets = Array.isArray(message.metadata?.challengedPersonaIds)
    ? message.metadata?.challengedPersonaIds.map(String)
    : []
  const targets = selection.seats
    .filter((seat) => seat.persona.id !== speakerPersonaId)
    .filter((seat) => {
      if (metadataTargets.includes(seat.persona.id)) return true
      return [seat.persona.name, seat.persona.shortName]
        .filter(Boolean)
        .some((name) => message.content.includes(name))
    })
    .map((seat) => ({ id: seat.persona.id, name: seat.persona.name }))

  if (targets.length > 0) return targets.slice(0, 4)
  if (/质询|反对|不同意|裁掉|否决|失败|漏洞|风险/.test(message.content)) {
    return selection.seats
      .filter((seat) => seat.persona.id !== speakerPersonaId)
      .slice(0, 2)
      .map((seat) => ({ id: seat.persona.id, name: seat.persona.name }))
  }
  return []
}

function inferRelation(content: string, phaseLabel: string): CouncilDebateRelation {
  if (/裁掉|砍掉|否决|不做|暂缓/.test(content)) return 'cut'
  if (/反对|质询|不同意|失败|漏洞|风险|过度/.test(content)) return 'oppose'
  if (/修正|补充|改为|替换|调整/.test(content)) return 'revise'
  if (/采纳|吸收|保留|裁决/.test(content) || /主持裁决|共识成稿/.test(phaseLabel)) return 'absorb'
  return 'support'
}

function extractEvidence(content: string): string {
  const explicit = section(content, '证据/来源需求') || section(content, '判断与风险')
  if (explicit) return explicit
  const sentence = content
    .split(/[。！？\n]/)
    .map((item) => item.trim())
    .find((item) => /证据|来源|事实|数据|验证|实验|验收|待查证/.test(item))
  return compact(sentence || '', 220)
}

function extractVerdict(content: string): string {
  const explicit = section(content, 'PRD条款')
  if (explicit) return explicit
  const sentence = content
    .split(/[。！？\n]/)
    .map((item) => item.trim())
    .find((item) => /裁决|采纳|保留|裁掉|不做|P0|验收|PRD/.test(item))
  return compact(sentence || '', 260)
}

export function buildCouncilDebateScenes(input: CouncilDebateTheaterInput): CouncilDebateScene[] {
  const briefMessages = input.messages.filter((message) => message.kind === 'brief')
  if (briefMessages.length === 0) {
    return [
      {
        id: 'scene-waiting-for-briefs',
        sceneNo: 1,
        phaseLabel: '等待博弈',
        sceneTitle: '等待大师发言形成第一幕',
        speakerPersonaId: 'team-engine',
        speakerName: '小白智囊团',
        targetPersonaIds: [],
        targetNames: [],
        claim: '推荐队伍激活后，系统会把六阶段发言转成可翻页辩论剧场。',
        objection: '',
        evidence: '',
        verdictImpact: '',
        sourceMessageIds: [],
        sourceExcerpt: '',
      },
    ]
  }

  return briefMessages.map((message, index) => {
    const speaker = personaForMessage(input.selection, message)
    const targets = inferTargets(input.selection, message, speaker.id)
    const phaseLabel = String(message.metadata?.phaseLabel || message.metadata?.phase || `第 ${message.round || index + 1} 轮`)
    const claim = section(message.content, '核心判断') || section(message.content, '关键发现') || firstMeaningfulLine(message.content)
    const objection = section(message.content, '冲突/补充') || section(message.content, '判断与风险')
    const evidence = extractEvidence(message.content)
    const verdictImpact = extractVerdict(message.content)
    const relation = inferRelation(message.content, phaseLabel)
    const sceneTitlePrefix =
      relation === 'oppose'
        ? '质询'
        : relation === 'cut'
          ? '裁剪'
          : relation === 'revise'
            ? '修正'
            : relation === 'absorb'
              ? '吸收'
              : '主张'
    return {
      id: `scene-${index + 1}-${message.id}`,
      sceneNo: index + 1,
      phaseId: typeof message.metadata?.phaseId === 'string' ? message.metadata.phaseId : undefined,
      phaseLabel,
      sceneTitle: `${sceneTitlePrefix} · ${speaker.name}`,
      speakerPersonaId: speaker.id,
      speakerName: speaker.name,
      targetPersonaIds: targets.map((target) => target.id),
      targetNames: targets.map((target) => target.name),
      claim,
      objection,
      evidence,
      verdictImpact,
      sourceMessageIds: [message.id],
      sourceExcerpt: compact(message.content, 520),
    }
  })
}

export function buildCouncilDebateMap(selection: CouncilSelection, scenes: CouncilDebateScene[], qualityGate?: CouncilQualityGate): CouncilDebateMap {
  const nodeMap = new Map<string, CouncilDebateMapNode>()
  for (const seat of selection.seats) {
    nodeMap.set(seat.persona.id, {
      id: seat.persona.id,
      label: seat.persona.shortName,
      kind: 'persona',
      personaId: seat.persona.id,
      weight: 1,
    })
  }
  nodeMap.set('final-verdict', { id: 'final-verdict', label: '主持裁决', kind: 'verdict', weight: 1.4 })
  nodeMap.set('quality-gate', { id: 'quality-gate', label: `质量闸门 ${qualityGate?.score ?? '-'}`, kind: 'quality', weight: 1.2 })

  const edges: CouncilDebateMapEdge[] = []
  for (const scene of scenes) {
    if (!nodeMap.has(scene.speakerPersonaId)) {
      nodeMap.set(scene.speakerPersonaId, {
        id: scene.speakerPersonaId,
        label: scene.speakerName,
        kind: 'persona',
        personaId: scene.speakerPersonaId,
        weight: 1,
      })
    }
    const relation = inferRelation(`${scene.claim}\n${scene.objection}\n${scene.verdictImpact}`, scene.phaseLabel)
    const targetIds = scene.targetPersonaIds.length ? scene.targetPersonaIds : ['final-verdict']
    for (const targetId of targetIds.slice(0, 3)) {
      edges.push({
        id: `edge-${scene.id}-${targetId}`,
        fromId: scene.speakerPersonaId,
        toId: targetId,
        relation,
        label: compact(scene.objection || scene.verdictImpact || scene.claim, 96),
        strength: relation === 'oppose' || relation === 'cut' ? 0.9 : relation === 'absorb' ? 0.82 : 0.68,
        sourceSceneId: scene.id,
      })
    }
  }
  if (qualityGate) {
    edges.push({
      id: `edge-final-quality-${qualityGate.gateId}`,
      fromId: 'final-verdict',
      toId: 'quality-gate',
      relation: qualityGate.status === 'approved' ? 'support' : 'revise',
      label: qualityGate.summary,
      strength: qualityGate.status === 'approved' ? 0.92 : 0.76,
      sourceSceneId: scenes[scenes.length - 1]?.id || 'scene-waiting-for-briefs',
    })
  }
  return {
    nodes: Array.from(nodeMap.values()),
    edges: edges.slice(0, 36),
    summary: `关系地图包含 ${nodeMap.size} 个节点、${Math.min(edges.length, 36)} 条支持/反对/修正/吸收路径。`,
  }
}

function itemFromScene(prefix: string, scene: CouncilDebateScene, text: string): CouncilVerdictLedgerItem {
  return {
    id: `${prefix}-${scene.id}`,
    label: compact(text, 220),
    sourceSceneId: scene.id,
    sourceMessageIds: scene.sourceMessageIds,
  }
}

function uniqueItems(items: CouncilVerdictLedgerItem[], max = 8): CouncilVerdictLedgerItem[] {
  const seen = new Set<string>()
  const output: CouncilVerdictLedgerItem[] = []
  for (const item of items) {
    const key = item.label.slice(0, 72)
    if (seen.has(key) || !item.label) continue
    seen.add(key)
    output.push(item)
    if (output.length >= max) break
  }
  return output
}

export function buildCouncilVerdictLedger(scenes: CouncilDebateScene[], qualityGate?: CouncilQualityGate): CouncilVerdictLedger {
  const kept: CouncilVerdictLedgerItem[] = []
  const cut: CouncilVerdictLedgerItem[] = []
  const revised: CouncilVerdictLedgerItem[] = []
  const evidenceGaps: CouncilVerdictLedgerItem[] = []
  const prdImpacts: CouncilVerdictLedgerItem[] = []
  const openDisagreements: CouncilVerdictLedgerItem[] = []

  for (const scene of scenes) {
    const source = `${scene.claim}\n${scene.objection}\n${scene.verdictImpact}`
    if (/保留|采纳|吸收|同意|P0/.test(source)) kept.push(itemFromScene('kept', scene, scene.verdictImpact || scene.claim))
    if (/裁掉|砍掉|不做|否决|暂缓/.test(source)) cut.push(itemFromScene('cut', scene, scene.objection || scene.verdictImpact || scene.claim))
    if (/修正|补充|改为|替换|调整|降级/.test(source)) revised.push(itemFromScene('revised', scene, scene.objection || scene.verdictImpact || scene.claim))
    if (/证据|来源|待查证|信息缺口|验证|实验|验收/.test(source)) evidenceGaps.push(itemFromScene('evidence', scene, scene.evidence || scene.objection || scene.claim))
    if (scene.verdictImpact) prdImpacts.push(itemFromScene('prd', scene, scene.verdictImpact))
    if (/反对|质询|不同意|风险|失败/.test(source)) openDisagreements.push(itemFromScene('open', scene, scene.objection || scene.claim))
  }

  for (const check of qualityGate?.checks || []) {
    for (const fix of check.requiredFixes) {
      evidenceGaps.push({
        id: `quality-gap-${check.id}`,
        label: fix,
        sourceMessageIds: [],
      })
    }
  }

  const ledger: CouncilVerdictLedger = {
    kept: uniqueItems(kept),
    cut: uniqueItems(cut),
    revised: uniqueItems(revised),
    evidenceGaps: uniqueItems(evidenceGaps),
    prdImpacts: uniqueItems(prdImpacts),
    openDisagreements: uniqueItems(openDisagreements),
    summary: '',
  }
  ledger.summary = `裁决账本：保留 ${ledger.kept.length} 项，裁掉 ${ledger.cut.length} 项，修正 ${ledger.revised.length} 项，证据缺口 ${ledger.evidenceGaps.length} 项。`
  return ledger
}

export function buildCouncilDebateTheater(input: CouncilDebateTheaterInput): CouncilDebateTheater {
  const scenes = buildCouncilDebateScenes(input)
  return {
    scenes,
    debateMap: buildCouncilDebateMap(input.selection, scenes, input.qualityGate),
    verdictLedger: buildCouncilVerdictLedger(scenes, input.qualityGate),
  }
}

export function renderCouncilDebateTheaterMarkdown(theater: CouncilDebateTheater): string {
  return [
    '## 小白辩论剧场',
    '',
    `- scenes: ${theater.scenes.length}`,
    `- map: ${theater.debateMap.summary}`,
    `- ledger: ${theater.verdictLedger.summary}`,
    '',
    '### 剧场场景',
    ...theater.scenes.slice(0, 12).map((scene) =>
      [
        `#### ${scene.sceneNo}. ${scene.sceneTitle}`,
        `- phase: ${scene.phaseLabel}`,
        `- speaker: ${scene.speakerName}`,
        `- targets: ${scene.targetNames.join(' / ') || '最终裁决'}`,
        `- claim: ${scene.claim}`,
        scene.objection ? `- objection: ${scene.objection}` : '',
        scene.verdictImpact ? `- verdictImpact: ${scene.verdictImpact}` : '',
        `- sourceMessageIds: ${scene.sourceMessageIds.join(', ') || 'none'}`,
      ].filter(Boolean).join('\n'),
    ),
  ].join('\n')
}
