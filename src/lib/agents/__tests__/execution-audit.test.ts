import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dbListOperatingEvents } from '../../db/repository'
import { recordAgentExecutionReceipt } from '../execution-audit'

function createStorage() {
  const data = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key)
    }),
    clear: vi.fn(() => {
      data.clear()
    }),
  }
}

describe('agent execution audit', () => {
  beforeEach(() => {
    const localStorage = createStorage()
    vi.stubGlobal('localStorage', localStorage)
    vi.stubGlobal('window', { localStorage })
  })

  it('writes a reusable execution receipt into the operating ledger', async () => {
    await recordAgentExecutionReceipt({
      agentId: 'strategy',
      subject: '团队推演｜策略拆解',
      input: '把项目拆成一周验证实验。',
      output: '先验证用户需求，再验证知识库证据，最后复盘是否推进。',
      status: 'completed',
      tools: [{ id: 'team-engine', label: 'Team Engine', risk: 'low', status: 'completed' }],
      evidenceRefs: [{ kind: 'knowledge', title: 'Knowledge middleware quick context' }],
      projectIds: ['project-1'],
      source: { kind: 'agent', sourceId: 'session-1', title: '团队推演' },
      durationMs: 120,
    })

    const events = await dbListOperatingEvents(5)
    const payload = JSON.parse(events[0].payload_json)

    expect(events[0]).toMatchObject({
      type: 'agent_action',
      stage: 'execute',
      title: 'Agent 执行：团队推演｜策略拆解',
      source_kind: 'agent',
      source_id: 'session-1',
    })
    expect(JSON.parse(events[0].project_ids_json)).toEqual(['project-1'])
    expect(payload.receipt).toMatchObject({
      agentId: 'strategy',
      subject: '团队推演｜策略拆解',
      status: 'completed',
      retry: { recommended: false },
    })
  })
})
