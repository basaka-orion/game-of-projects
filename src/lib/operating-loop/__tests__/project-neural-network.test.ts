import { describe, expect, it } from 'vitest'
import type { OperatingEventRow, SynapseRow } from '../../db/repository'
import { buildProjectNeuralNetwork } from '../project-neural-network'

function event(overrides: Partial<OperatingEventRow>): OperatingEventRow {
  return {
    id: 'op-1',
    type: 'agent_action',
    stage: 'execute',
    title: 'Agent 执行',
    summary: 'Openbasaka 行动已经完成。',
    source_kind: 'agent',
    source_id: 'strategy',
    source_title: 'WarRoom Agent',
    confidence: 0.84,
    entities_json: '[]',
    project_ids_json: '[]',
    payload_json: '{}',
    created_at: '2026-04-25T00:00:00.000Z',
    updated_at: '2026-04-25T00:00:00.000Z',
    ...overrides,
  }
}

describe('project neural network', () => {
  it('connects project, memory, knowledge, and agent action nodes', () => {
    const synapse: SynapseRow = {
      id: 'syn-1',
      source_id: 'project-openbasaka',
      target_id: 'project-mempalace',
      type: '复用',
      strength: 88,
      reason: '记忆宫殿能支撑 Openbasaka 的长期沉淀。',
      action_items_json: '[]',
      created_at: '2026-04-25T00:00:00.000Z',
    }

    const network = buildProjectNeuralNetwork({
      projects: [
        {
          id: 'project-openbasaka',
          title: 'Openbasaka',
          oneLiner: '本地优先外脑 OS。',
          tags: ['外脑', 'Agent'],
          survivalRate: 91,
          taxonomyLabel: 'personal intelligent system',
        },
        {
          id: 'project-mempalace',
          title: 'MemPalace',
          oneLiner: '长期记忆宫殿。',
          tags: ['记忆', '归档'],
          survivalRate: 82,
        },
      ],
      synapses: [synapse],
      memories: [
        {
          category: 'openbasaka',
          content: 'Openbasaka 需要把启蒙、知识、Agent 都串成外脑闭环。',
          confidence: 0.9,
          created_at: '2026-04-25T00:00:00.000Z',
        },
      ],
      operatingEvents: [
        event({
          id: 'op-knowledge',
          type: 'knowledge_source',
          stage: 'compile',
          source_kind: 'wiki',
          source_title: 'Openbasaka 架构笔记',
          summary: '知识库补上 Openbasaka 的证据链。',
          project_ids_json: JSON.stringify(['project-openbasaka']),
        }),
        event({
          id: 'op-agent',
          source_title: 'WarRoom｜行动计划',
          project_ids_json: JSON.stringify(['project-openbasaka']),
        }),
      ],
    })

    expect(network.summary).toMatchObject({
      projectNodes: 2,
      memoryNodes: 1,
      knowledgeNodes: 1,
      agentNodes: 1,
    })
    expect(network.links.map((link) => link.label)).toEqual(
      expect.arrayContaining(['复用', '记忆指向', '知识支撑', '行动回写']),
    )
  })
})
