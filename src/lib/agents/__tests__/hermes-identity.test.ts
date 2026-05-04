import { describe, expect, it } from 'vitest'
import { buildMemorySnapshot, renderAgentHermesPrompt } from '../hermes-identity'
import type { AgentMemory } from '../agent-memory'
import type { AgentSoul } from '../soul'

describe('Hermes local agent identity', () => {
  it('renders a frozen private soul and memory snapshot', () => {
    const soul: AgentSoul = {
      identity: '你是独立角色。',
      tone: '直接、具体。',
      principles: ['保持独立判断'],
      avoidance: ['不要冒充其他角色'],
      uncertainty: '不确定就说明缺口。',
    }
    const memory: AgentMemory = {
      agentId: 'agent_a',
      charLimit: 2200,
      entries: [
        {
          rowid: 1,
          text: '本角色擅长把 PRD 拆成用户动作、系统反应和验收标准。',
          createdAt: '2026-05-04T00:00:00.000Z',
        },
      ],
    }

    const rendered = renderAgentHermesPrompt({
      id: 'snapshot_1',
      agentId: 'agent_a',
      sessionId: 'session_1',
      topic: 'PRD',
      soul,
      memory: buildMemorySnapshot(memory, ['PRD']),
      createdAt: '2026-05-04T00:00:00.000Z',
    })

    expect(rendered).toContain('snapshot_id: snapshot_1')
    expect(rendered).toContain('private to this agent')
    expect(rendered).toContain('future sessions only')
    expect(rendered).toContain('本角色擅长把 PRD')
  })
})
