import { describe, expect, it } from 'vitest'
import { buildCouncilLaunchReadinessPack, renderCouncilActionPackMarkdown } from '../action-pack'
import { buildCouncilDebateTheater } from '../debate-theater'
import { buildCouncilDeliveryModes } from '../delivery-modes'
import { buildCouncilQualityGate } from '../quality-gate'
import { selectCouncilTeam } from '../selector'
import type { TeamMessage, TeamSession } from '../../teams/types'

describe('xiaobai council 90-point action pack', () => {
  it('turns PRD, verdict ledger, quality gate, and Baoyu plans into direct work lanes', () => {
    const problem = '做一个小白也能用的 AI 项目 PRD 生成器'
    const selection = selectCouncilTeam(problem)
    const speaker = selection.seats[0].persona
    const messages: TeamMessage[] = [
      {
        id: 'brief_1',
        agentId: speaker.id,
        agentName: speaker.name,
        role: 'assistant',
        kind: 'brief',
        timestamp: 1,
        content: '【核心判断】P0 必须先跑通输入、匹配闸门、辩论剧场和质量闸门。【冲突/补充】裁掉一秒默认推荐。【PRD条款】保留可追溯导出。',
        metadata: { phaseId: 'host-verdict', phaseLabel: '主持裁决' },
      },
    ]
    const prdMarkdown = [
      '# PRD',
      '**定位**：帮助小白把模糊项目想法转成可开工 PRD。',
      '**北极星指标**：用户首次使用后能说出下一步。',
      '- P0：输入、匹配闸门、辩论剧场、质量闸门、导出。',
      '- 页面状态：输入区、匹配过程、空态、加载态、失败态、完成态。',
      '- 数据/API：Scene、MapEdge、LedgerItem、QualityGate、ActionPack。',
      '- 测试验收：vitest、typecheck、smoke:ui、build、Electron 跑通。',
      '- 首版验证实验：找 5-8 个小白用户完成一次从输入到导出的闭环，至少 5 人留证且 4 人通过。',
      '- 本地边界：公开思想原型，不代表本人，Telegram 默认关闭，隐私安全可审计。',
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
    const baoyuVisualPlans = [
      { id: 'card_1', kind: 'image-cards' as const, label: '图文卡', title: '第一步', prompt: '中文卡', command: 'baoyu-image-cards', style: 'editorial', layout: 'single', previewMarkdown: 'preview', textRenderMode: 'local-svg' as const },
      { id: 'card_2', kind: 'image-cards' as const, label: '图文卡', title: '路径', prompt: '中文卡', command: 'baoyu-image-cards', style: 'editorial', layout: 'single', previewMarkdown: 'preview', textRenderMode: 'local-svg' as const },
      { id: 'card_3', kind: 'image-cards' as const, label: '图文卡', title: '裁决', prompt: '中文卡', command: 'baoyu-image-cards', style: 'editorial', layout: 'single', previewMarkdown: 'preview', textRenderMode: 'local-svg' as const },
      { id: 'card_4', kind: 'image-cards' as const, label: '图文卡', title: '验证', prompt: '中文卡', command: 'baoyu-image-cards', style: 'editorial', layout: 'single', previewMarkdown: 'preview', textRenderMode: 'local-svg' as const },
    ]
    const theater = buildCouncilDebateTheater({ selection, messages, prdMarkdown })
    const qualityGate = buildCouncilQualityGate({
      problem,
      selection,
      session,
      prdMarkdown,
      baoyuVisualPlans,
    })
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

    const pack = buildCouncilLaunchReadinessPack({
      problem,
      selection,
      prdMarkdown,
      deliveryModes,
      verdictLedger: theater.verdictLedger,
      qualityGate,
      baoyuVisualPlans,
    })

    expect(pack.score).toBeGreaterThanOrEqual(80)
    expect(pack.taskGroups.map((group) => group.area)).toEqual(['product', 'design', 'engineering', 'test', 'validation'])
    expect(pack.taskGroups.every((group) => group.tasks.length >= 2)).toBe(true)
    expect(pack.nowAction).toBeTruthy()
    expect(pack.riskControls.join('\n')).toContain('裁掉一秒默认推荐')
    expect(renderCouncilActionPackMarkdown(pack)).toContain('90 分行动面板')
    expect(renderCouncilActionPackMarkdown(pack)).toContain('产品定义')
  })
})
