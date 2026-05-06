import { describe, expect, it } from 'vitest'
import { buildCouncilDebateTheater } from '../debate-theater'
import { buildCouncilDeliveryModes, renderCouncilDeliveryModesMarkdown } from '../delivery-modes'
import { buildCouncilQualityGate } from '../quality-gate'
import { selectCouncilTeam } from '../selector'
import type { TeamMessage, TeamSession } from '../../teams/types'

describe('xiaobai council delivery modes', () => {
  it('turns the same debate result into boss review and xiaobai execution modes', () => {
    const problem = '做一个小白也能用的 AI 项目 PRD 生成器'
    const selection = selectCouncilTeam(problem)
    const speaker = selection.seats[0].persona
    const target = selection.seats[1].persona
    const messages: TeamMessage[] = [
      {
        id: 'brief_1',
        agentId: speaker.id,
        agentName: speaker.name,
        role: 'assistant',
        kind: 'brief',
        timestamp: 1,
        content: '【核心判断】系统是决策脚手架，不是文档生成器。【冲突/补充】不要让用户看到6个agent在博弈。【PRD条款】用户输入后只展示下一步。',
        metadata: { phaseId: 'clash', phaseLabel: '冲突质询', challengedPersonaIds: [target.id] },
      },
    ]
    const prdMarkdown = [
      '# PRD',
      '**定位**：一个帮助小白把模糊想法压缩成明天第一步的决策脚手架。',
      '**北极星指标**：用户首次产出后能说出明天第一步该做什么。',
      '- **背景：** 许多产品经理、创业者卡在从“模糊想法”到“可执行文档”的第一步，现有 AI 工具要么生成过长 PRD，要么给空白模板。',
      '- **核心痛点：** 用户面对空白页产生决策瘫痪。',
      '- 结构化追问系统：用户输入一句话需求后，系统提出 3 个核心追问。',
      '- 输入方式：只接受自然语言类比句（如“类似小红书但给程序员”）。',
      '- 输入一个真实项目想法，不需要先写完整 PRD。',
      '- 选择最大限制，先生成最小可执行方案。',
      '- 按验收标准完成一次首版验证。',
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
    const theater = buildCouncilDebateTheater({ selection, messages, prdMarkdown })
    const qualityGate = buildCouncilQualityGate({
      problem,
      selection,
      session,
      prdMarkdown,
      baoyuVisualPlans: [],
    })

    const modes = buildCouncilDeliveryModes({
      problem,
      selection,
      prdMarkdown,
      scenes: theater.scenes,
      debateMap: theater.debateMap,
      verdictLedger: theater.verdictLedger,
      qualityGate,
      baoyuVisualPlans: [],
    })

    expect(modes.defaultMode).toBe('boss-review')
    expect(modes.bossReview.summary).toContain('幕剧场')
    expect(modes.bossReview.criticalTension).toContain('不要让用户看到')
    expect(modes.xiaobaiExecute.headline).toContain('小白执行')
    expect(modes.xiaobaiExecute.firstAction).toBe('输入一句自然语言类比句，例如“类似小红书但给程序员”。')
    expect(modes.xiaobaiExecute.firstAction).not.toContain('背景')
    expect(modes.xiaobaiExecute.whatSystemHides.join('\n')).toContain('隐藏')
    expect(modes.xiaobaiExecute.traceBack.scenes).toBe(theater.scenes.length)
    expect(renderCouncilDeliveryModesMarkdown(modes)).toContain('双模式结果层')
  })
})
