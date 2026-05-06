import { describe, expect, it } from 'vitest'
import {
  buildCouncilDebateMap,
  buildCouncilDebateScenes,
  buildCouncilDebateTheater,
  buildCouncilVerdictLedger,
  renderCouncilDebateTheaterMarkdown,
} from '../debate-theater'
import { selectCouncilTeam } from '../selector'
import type { CouncilSelection } from '../selector'
import type { TeamMessage } from '../../teams/types'

function debateMessages(selection: CouncilSelection): TeamMessage[] {
  const speaker = selection.seats[0].persona
  const target = selection.seats[1]?.persona || selection.seats[0].persona
  return [
    {
      id: 'brief_speaker',
      agentId: speaker.id,
      agentName: speaker.name,
      role: 'assistant',
      content: '【核心判断】P0 必须让 Boss 一眼看懂思考如何发生。【冲突/补充】反对一秒默认编队，会削弱信任。【PRD条款】保留辩论剧场与质量闸门。',
      timestamp: 1,
      kind: 'brief',
      metadata: { phaseId: 'clash', phaseLabel: '冲突质询', challengedPersonaIds: [target.id] },
    },
    {
      id: 'brief_target',
      agentId: target.id,
      agentName: target.name,
      role: 'assistant',
      content: '【核心判断】必须把观点写成证据、反证、裁决和验收。【判断与风险】没有来源、待查证事实和验证实验的结论都要暂缓。【PRD条款】修正 PRD 为可开工巨细版。',
      timestamp: 2,
      kind: 'brief',
      metadata: { phaseId: 'host-verdict', phaseLabel: '主持裁决' },
    },
  ]
}

describe('xiaobai council debate theater', () => {
  it('extracts pageable scenes from six-stage team messages', () => {
    const selection = selectCouncilTeam('小白智囊团需要辩论剧场、关系地图、裁决账本和巨细 PRD')
    const messages = debateMessages(selection)
    const scenes = buildCouncilDebateScenes({ selection, messages })

    expect(scenes).toHaveLength(2)
    expect(scenes[0].phaseLabel).toBe('冲突质询')
    expect(scenes[0].claim).toContain('一眼看懂')
    expect(scenes[0].targetPersonaIds).toContain(selection.seats[1].persona.id)
    expect(scenes[0].sourceMessageIds).toEqual(['brief_speaker'])
  })

  it('builds a relation map with opposition, revision, and verdict flow', () => {
    const selection = selectCouncilTeam('小白智囊团需要辩论剧场、关系地图、裁决账本和巨细 PRD')
    const scenes = buildCouncilDebateScenes({ selection, messages: debateMessages(selection) })
    const map = buildCouncilDebateMap(selection, scenes)

    expect(map.nodes.some((node) => node.id === 'final-verdict')).toBe(true)
    expect(map.edges.some((edge) => edge.relation === 'oppose')).toBe(true)
    expect(map.edges.some((edge) => edge.relation === 'revise' || edge.relation === 'cut')).toBe(true)
    expect(map.summary).toContain('关系地图')
  })

  it('builds a verdict ledger and export markdown from scenes', () => {
    const selection = selectCouncilTeam('小白智囊团需要辩论剧场、关系地图、裁决账本和巨细 PRD')
    const theater = buildCouncilDebateTheater({ selection, messages: debateMessages(selection) })
    const ledger = buildCouncilVerdictLedger(theater.scenes)

    expect(ledger.kept.length).toBeGreaterThan(0)
    expect(ledger.revised.length).toBeGreaterThan(0)
    expect(ledger.evidenceGaps.length).toBeGreaterThan(0)
    expect(renderCouncilDebateTheaterMarkdown(theater)).toContain('小白辩论剧场')
  })
})
