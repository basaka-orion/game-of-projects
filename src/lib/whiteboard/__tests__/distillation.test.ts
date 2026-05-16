import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listBossDistillationProposals, loadApprovedBossDistillationContext } from '../../boss/distillation'
import { createEmptyWhiteboardDraft, saveWhiteboardHistory, type WhiteboardDraft } from '../module'

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

describe('whiteboard Boss distillation handoff', () => {
  beforeEach(() => {
    const localStorage = createStorage()
    vi.stubGlobal('localStorage', localStorage)
    vi.stubGlobal('window', { localStorage })
  })

  it('saves Boss original text as evidence and AI Result as a pending proposal', async () => {
    const draft: WhiteboardDraft = {
      ...createEmptyWhiteboardDraft(),
      text: '我想用 openbasaka 蒸馏我自己，整个项目所有功能都要服务这个。',
      aiResult: {
        mode: 'openbasakaPrompt',
        title: 'Openbasaka 系统 Prompt',
        content: '系统应建立 Boss 蒸馏重构计划，但需要 Boss 确认。',
        createdAt: '2026-05-08T04:17:54.628Z',
      },
    }

    const item = await saveWhiteboardHistory(draft, 'inspiration', 'Boss 自我蒸馏')
    const proposals = await listBossDistillationProposals('pending')
    const approvedContext = await loadApprovedBossDistillationContext()

    expect(item?.title).toBe('Boss 自我蒸馏')
    expect(proposals).toHaveLength(1)
    expect(proposals[0].source?.kind).toBe('whiteboard')
    expect(proposals[0].claims.map((claim) => claim.evidenceTier)).toEqual(['boss_verbatim', 'derived_inference'])
    expect(proposals[0].claims[0].claim).toContain('蒸馏我自己')
    expect(approvedContext).toBe('')
  })
})
