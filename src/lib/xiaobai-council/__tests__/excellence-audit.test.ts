import { describe, expect, it } from 'vitest'
import { buildCouncilLaunchReadinessPack } from '../action-pack'
import { buildCouncilBaoyuVisualPlans } from '../baoyu'
import { buildCouncilDebateTheater } from '../debate-theater'
import { buildCouncilDeliveryModes } from '../delivery-modes'
import { buildCouncilExcellenceAudit, renderCouncilExcellenceAuditMarkdown } from '../excellence-audit'
import { buildCouncilQualityGate } from '../quality-gate'
import { selectCouncilTeam } from '../selector'
import type { TeamMessage, TeamSession } from '../../teams/types'

describe('xiaobai council excellence audit', () => {
  it('scores the 95-point gap without pretending missing runtime validation is done', () => {
    const problem = '做一个能解决复杂人生规划的小白智囊团'
    const selection = selectCouncilTeam(problem)
    const messages: TeamMessage[] = selection.seats.slice(0, 6).map((seat, index) => ({
      id: `brief_${index}`,
      agentId: seat.persona.id,
      agentName: seat.persona.name,
      role: 'assistant',
      kind: 'brief',
      timestamp: index,
      content: `【核心判断】P0 必须可追溯。【冲突/补充】反对黑箱神化结论。【PRD条款】保留剧场、质量闸门和首版验证。`,
      metadata: { phaseId: index % 2 ? 'clash' : 'host-verdict', phaseLabel: index % 2 ? '冲突质询' : '主持裁决' },
    }))
    const prdMarkdown = [
      '# PRD',
      '**定位**：把复杂人生规划压成可执行路线。',
      '**北极星指标**：用户能说出下一步并愿意验证。',
      '- P0：输入、匹配闸门、辩论剧场、质量闸门、导出。',
      '- 页面状态：空态、加载态、失败态、完成态。',
      '- 数据/API：Scene、MapEdge、LedgerItem、QualityGate、ActionPack。',
      '- 测试验收：vitest、typecheck、smoke:ui、build、Electron 跑通。',
      '- 首版验证实验：找 5-8 个真实小白用户完成一次闭环，至少 5 人留证且 4 人通过。',
      '- 公开思想原型，不代表本人；本地 Openbasaka，Telegram 默认关闭；隐私安全可审计。',
    ].join('\n')
    const session: TeamSession = {
      id: 'session_1',
      teamId: 'team_1',
      title: 'session',
      topic: problem,
      messages,
      summary: prdMarkdown,
      tags: [],
      isPinned: false,
      isStarred: false,
      status: 'completed',
      createdAt: '',
      updatedAt: '',
    }
    const baoyuVisualPlans = buildCouncilBaoyuVisualPlans({ problem, selection, prdMarkdown })
    const qualityGate = buildCouncilQualityGate({ problem, selection, session, prdMarkdown, baoyuVisualPlans })
    const theater = buildCouncilDebateTheater({ selection, messages, prdMarkdown, qualityGate })
    const deliveryModes = buildCouncilDeliveryModes({
      problem,
      selection,
      prdMarkdown,
      scenes: theater.scenes,
      debateMap: theater.debateMap,
      verdictLedger: theater.verdictLedger,
      qualityGate,
      baoyuVisualPlans,
    })
    const actionPack = buildCouncilLaunchReadinessPack({
      problem,
      selection,
      prdMarkdown,
      deliveryModes,
      verdictLedger: theater.verdictLedger,
      qualityGate,
      baoyuVisualPlans,
    })

    const audit = buildCouncilExcellenceAudit({
      selection,
      activatedAgents: selection.seats.map((seat) => ({ persona: seat.persona, created: false, agent: { id: seat.persona.id } as any })),
      qualityGate,
      qualityRevisionHistory: [],
      debateScenes: theater.scenes,
      debateMap: theater.debateMap,
      verdictLedger: theater.verdictLedger,
      actionPack,
      baoyuVisualPlans,
    })

    expect(audit.targetScore).toBe(95)
    expect(audit.score).toBeGreaterThanOrEqual(88)
    expect(audit.gapToTarget).toBeGreaterThanOrEqual(0)
    expect(audit.dimensions.map((item) => item.id)).toContain('runtime-validation')
    expect(audit.dimensions.map((item) => item.id)).toContain('master-prd-fullstack')
    expect(audit.mustNotClaimYet.join('\n')).toContain('真实小白用户验证')
    expect(renderCouncilExcellenceAuditMarkdown(audit)).toContain('95 分卓越审计')
  })
})
