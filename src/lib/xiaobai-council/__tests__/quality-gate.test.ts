import { describe, expect, it } from 'vitest'
import { buildCouncilQualityGate, buildCouncilQualityRevisionRound, renderCouncilQualityGateMarkdown } from '../quality-gate'
import { selectCouncilTeam } from '../selector'
import type { TeamSession } from '../../teams/types'

function sessionWithBriefs(): TeamSession {
  return {
    id: 'session_quality',
    teamId: 'team_quality',
    title: 'quality',
    topic: '做一个世界级难题处理系统',
    summary: '',
    tags: [],
    isPinned: false,
    isStarred: false,
    status: 'completed',
    createdAt: '',
    updatedAt: '',
    messages: [
      {
        id: 'brief_1',
        agentId: 'jobs-product-director',
        agentName: '乔布斯式产品导演',
        role: 'assistant',
        content: '【核心判断】P0 必须是一眼可懂的用户旅程。【冲突/补充】反对把功能堆满首页，会让小白失败。【PRD条款】保留极简入口。',
        timestamp: 1,
        kind: 'brief',
        metadata: { phaseId: 'clash', phaseLabel: '冲突质询' },
      },
      {
        id: 'brief_2',
        agentId: 'research',
        agentName: '事实证据席位',
        role: 'assistant',
        content: '【关键发现】所有真实世界判断必须保留来源、证据和待查证事实。【判断与风险】没有验证实验就不能进入最终共识。',
        timestamp: 2,
        kind: 'brief',
        metadata: { phaseId: 'host-verdict', phaseLabel: '主持裁决' },
      },
    ],
  }
}

const strongPrd = `
# 共识 PRD

## 产品定位与北极星
产品定位：小白智囊团把复杂难题转成可开工大师 PRD。北极星：用户看完成稿后能直接执行第一步。

## P0/P1/P2 与不做清单
P0 是问题画像、匹配闸门、六阶段博弈和质量闸门。P1 是自动外部研究。P2 是多模型委员会。不做清单：不冒充真人，不默认同步 Telegram。

## 页面、组件与状态
页面包含输入区、匹配过程、角色档案、博弈舞台、质量闸门、大师 PRD 阅读器和共识追溯。所有组件都有空态、加载、失败态。

## 目标用户与端到端用户旅程
目标用户是不会写 PRD 的小白 Boss。用户旅程：输入真实问题 -> 看推荐编队 -> 启动六阶段脑暴 -> 阅读完整 PRD -> 回看追溯 -> 复制行动包。

## 信息架构、前端技术栈与状态管理
前端使用 Electron + React + TypeScript，组件架构包含 CouncilMasterPrdView、CouncilDebateStage、QualityGate 和 EvidenceVault；状态管理由 workflow result、TeamMessage 和本地 ledger 驱动。

## 后端服务与领域边界
后端服务包含 TeamSession 编排、MatchGate、质量闸门、归档、运行历史、人工审稿与用户验证领域。队列任务只做本地编排，不默认外部同步。

## 数据库、存储与数据模型
数据库使用 SQLite 保存 Claim、Evidence、Objection、Verdict、Experiment、Scene、TraceItem、ActionTask、RevisionRound 和导出记录，并给 personaId、runId、sourceMessageId 建索引。

## API、接口草案与错误码
API 包含 POST /council/run、GET /council/runs/:id、POST /council/archive、POST /council/review；请求、响应、错误码、幂等键和 schema 都要留档。

## AI/模型策略与提示词边界
AI 模型策略：LLM 负责六阶段输出、裁决抽取、PRD 归一化和质量返修；RAG 负责本地证据；prompt 必须保留事实校验、待查证和降级边界。

## 证据、来源与待验证事实
事实必须带来源。高时效信息列为待查证。研究席位负责证据地图。

## 保留的分歧、被裁掉的方案与裁决理由
保留分歧：速度与质量的冲突。被裁掉：一秒生成默认编队。裁决理由：先匹配再协作才可靠。

## 部署、运维、性能与回滚
部署为本地 Electron 应用，运维包含日志、监控、性能预算、导出失败回滚和本地数据迁移。

## 里程碑与任务拆解
里程碑：Day 1 完成 PRD 阅读器，Week 1 完成质量闸门、共识追溯和导出，Week 2 做 5-8 人验收。

## 测试矩阵与验收标准
首版验证实验：用 20 个真实难题跑匹配、冲突、裁决和 PRD 可执行性评分。测试包含单元、集成、E2E、视觉回归和小白验收。

## 角色共识形成追溯
由产品席位提出先展示完整 PRD，被反方席位质询过程太乱，主持裁决后吸收为“主文档优先、过程折叠”。裁掉默认图文包和过程日志平铺。

## 隐私、安全与公开原型边界
所有角色只是公开思想原型，不代表本人或授权。默认本地 Openbasaka，Telegram 只是可选外部触达。密钥、隐私和权限必须审计。
`

describe('xiaobai council quality gate', () => {
  it('approves a source-aware, verdict-rich PRD and exposes typed deliberation objects', () => {
    const problem = '做一个能处理世界级难题的小白智囊团，需要真实来源、证据、UI、全栈技术和安全边界'
    const selection = selectCouncilTeam(problem)
    const gate = buildCouncilQualityGate({
      problem,
      selection,
      session: sessionWithBriefs(),
      prdMarkdown: strongPrd,
      baoyuVisualPlans: [],
    })

    expect(gate.status).toBe('approved')
    expect(gate.score).toBeGreaterThanOrEqual(86)
    expect(gate.prdCompletenessScore).toBeGreaterThanOrEqual(90)
    expect(gate.launchReadinessScore).toBeGreaterThanOrEqual(80)
    expect(gate.finalGateStatus).toBe(gate.status)
    expect(gate.revisionRounds).toEqual([])
    expect(gate.checks.map((item) => item.id)).toContain('conflict-verdict')
    expect(gate.checks.map((item) => item.id)).toContain('master-prd-fullstack')
    expect(gate.checks.map((item) => item.id)).not.toContain('baoyu-ready')
    expect(gate.typedDeliberation.some((item) => item.type === 'objection')).toBe(true)
    expect(gate.typedDeliberation.some((item) => item.type === 'evidence')).toBe(true)
    expect(renderCouncilQualityGateMarkdown(gate)).toContain('CouncilQualityGate')
  })

  it('blocks weak PRD output that skips evidence, verdict, actionability and safety boundaries', () => {
    const problem = '我要解决一个复杂的世界级难题'
    const selection = selectCouncilTeam(problem)
    const gate = buildCouncilQualityGate({
      problem,
      selection,
      session: { ...sessionWithBriefs(), messages: [] },
      prdMarkdown: '这是一个很棒的方向，我们之后继续完善。',
      baoyuVisualPlans: [],
    })

    expect(gate.status).toBe('blocked')
    expect(gate.checks.some((item) => item.status === 'fail')).toBe(true)
    expect(gate.revisionPrompt).toContain('返修最终 PRD')
  })

  it('creates a bounded revision round that can be fed back into the gate', () => {
    const problem = '我要解决一个复杂的世界级难题'
    const selection = selectCouncilTeam(problem)
    const weakPrd = '这是一个方向，需要更多思考。'
    const firstGate = buildCouncilQualityGate({
      problem,
      selection,
      session: { ...sessionWithBriefs(), messages: [] },
      prdMarkdown: weakPrd,
      baoyuVisualPlans: [],
    })
    const revision = buildCouncilQualityRevisionRound({
      gate: firstGate,
      prdMarkdown: weakPrd,
      round: 1,
    })
    const nextGate = buildCouncilQualityGate({
      problem,
      selection,
      session: sessionWithBriefs(),
      prdMarkdown: revision.prdMarkdown,
      baoyuVisualPlans: [],
      revisionRounds: [{ ...revision.revisionRound, scoreAfter: 88, finalGateStatus: 'approved' }],
    })

    expect(revision.revisionRound.round).toBe(1)
    expect(revision.prdMarkdown).toContain('CouncilQualityGate 返修补丁')
    expect(nextGate.score).toBeGreaterThan(firstGate.score)
    expect(nextGate.revisionRounds).toHaveLength(1)
    expect(renderCouncilQualityGateMarkdown(nextGate)).toContain('返修链')
  })
})
