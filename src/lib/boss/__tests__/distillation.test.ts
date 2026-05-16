import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dbListOperatingEvents } from '../../db/repository'
import {
  approveBossDistillation,
  getBossDistillationProposal,
  listBossDistillationProposals,
  loadApprovedBossDistillationContext,
  proposeBossDistillation,
  rejectBossDistillation,
} from '../distillation'

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

const bossVerbatimEvidence = {
  sourceKind: 'whiteboard' as const,
  sourceId: 'whiteboard-2026-05-08',
  quote: '我想用 openbasaka 蒸馏我自己。',
  locator: 'whiteboard.ai_result',
}

describe('Boss distillation proposal gate', () => {
  beforeEach(() => {
    const localStorage = createStorage()
    vi.stubGlobal('localStorage', localStorage)
    vi.stubGlobal('window', { localStorage })
  })

  it('creates pending proposals without mutating the long-term Boss profile', async () => {
    const proposal = await proposeBossDistillation({
      id: 'proposal_self_distill',
      title: '把 Openbasaka 定义为 Boss 自我蒸馏引擎',
      rationale: 'Boss 明确表示整个项目所有功能都应该服务蒸馏自己。',
      proposedBy: 'whiteboard',
      source: {
        kind: 'whiteboard',
        sourceId: 'whiteboard-2026-05-08',
        title: '白板｜Boss 自我蒸馏',
      },
      claims: [
        {
          id: 'claim_mission_self_distill',
          dimension: 'mission',
          claim: 'Openbasaka 的最高使命是持续蒸馏 Boss，而不是堆叠功能。',
          evidenceTier: 'boss_verbatim',
          evidenceRefs: [bossVerbatimEvidence],
          confidence: 0.96,
          temporalScope: 'long_term',
          affectsProfileKeys: ['long_term_vision'],
        },
      ],
      profilePatch: {
        long_term_vision: '把 Openbasaka 建成 Boss 自我蒸馏引擎。',
      },
      memoryWrites: [
        {
          category: 'goal',
          content: '长期:Openbasaka 的所有功能服务 Boss 自我蒸馏。',
          confidence: 0.96,
        },
      ],
    })

    const storedProfile = JSON.parse(localStorage.getItem('gop_boss_profile') || '{}') as Record<string, string>
    const pending = await listBossDistillationProposals('pending')
    const events = await dbListOperatingEvents(3)

    expect(proposal.status).toBe('pending')
    expect(proposal.claims[0]).toMatchObject({
      id: 'claim_mission_self_distill',
      evidenceTier: 'boss_verbatim',
      temporalScope: 'long_term',
      status: 'proposed',
    })
    expect(storedProfile.long_term_vision).toBeUndefined()
    expect(pending[0].id).toBe('proposal_self_distill')
    expect(events.some((event) => event.summary.includes('Boss 蒸馏提案待确认'))).toBe(true)
  })

  it('applies profile patches only after Boss approval and injects only approved claims', async () => {
    await proposeBossDistillation({
      id: 'proposal_approval',
      title: '确认长期使命',
      rationale: 'Boss 原话足以形成长期使命提案。',
      claims: [
        {
          id: 'claim_approval',
          dimension: 'mission',
          claim: 'Openbasaka 要优先服务 Boss 自我蒸馏。',
          evidenceTier: 'boss_verbatim',
          evidenceRefs: [bossVerbatimEvidence],
          confidence: 0.95,
          temporalScope: 'long_term',
          affectsProfileKeys: ['long_term_vision'],
        },
      ],
      profilePatch: {
        long_term_vision: 'Openbasaka 优先服务 Boss 自我蒸馏。',
      },
    })

    const approved = await approveBossDistillation('proposal_approval', 'Boss 确认这就是主线')
    const storedProfile = JSON.parse(localStorage.getItem('gop_boss_profile') || '{}') as Record<string, string>
    const context = await loadApprovedBossDistillationContext()
    const events = await dbListOperatingEvents(5)

    expect(approved?.status).toBe('approved')
    expect(approved?.claims[0].status).toBe('approved')
    expect(storedProfile.long_term_vision).toBe('Openbasaka 优先服务 Boss 自我蒸馏。')
    expect(context).toContain('<boss-distillation>')
    expect(context).toContain('Openbasaka 要优先服务 Boss 自我蒸馏。')
    expect(events.some((event) => event.summary.includes('Boss 蒸馏提案已确认'))).toBe(true)
  })

  it('keeps rejected proposals out of approved context', async () => {
    await proposeBossDistillation({
      id: 'proposal_reject',
      title: '错误推断',
      rationale: '示例拒绝路径。',
      claims: [
        {
          id: 'claim_reject',
          dimension: 'preference',
          claim: 'Boss 喜欢空泛总结。',
          evidenceTier: 'derived_inference',
          evidenceRefs: [bossVerbatimEvidence],
          confidence: 0.42,
          temporalScope: 'stage',
        },
      ],
    })

    await rejectBossDistillation('proposal_reject', 'Boss 明确不接受空泛总结')
    const rejected = await getBossDistillationProposal('proposal_reject')
    const context = await loadApprovedBossDistillationContext()

    expect(rejected?.status).toBe('rejected')
    expect(rejected?.claims[0].status).toBe('rejected')
    expect(context).not.toContain('Boss 喜欢空泛总结')
  })

  it('blocks external-only evidence from writing Boss profile or long-term memory', async () => {
    await expect(
      proposeBossDistillation({
        title: '外部资料不能直接塑造 Boss',
        rationale: '只有外部资料，没有 Boss 自身证据。',
        claims: [
          {
            dimension: 'learning_mode',
            claim: 'Boss 应该采用某外部专家的方法。',
            evidenceTier: 'external_context',
            evidenceRefs: [
              {
                sourceKind: 'wiki_page',
                sourceId: 'wiki-expert-method',
                quote: '某专家推荐的方法。',
              },
            ],
            confidence: 0.88,
            temporalScope: 'long_term',
            affectsProfileKeys: ['cognitive_profile_json'],
          },
        ],
        profilePatch: {
          cognitive_profile_json: '{}',
        },
      }),
    ).rejects.toThrow('外部参照不能直接写入 Boss')
  })
})
