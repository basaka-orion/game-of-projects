import { describe, expect, it } from 'vitest'
import {
  buildCouncilConsensusTrace,
  formatCouncilPrdDate,
  isCouncilMasterPrdSynthesisFailure,
  normalizeCouncilMasterPrdMarkdown,
  validateCouncilMasterPrd,
} from '../master-prd'
import type { CouncilLaunchReadinessPack } from '../action-pack'
import type { CouncilDebateScene, CouncilVerdictLedger } from '../debate-theater'

describe('xiaobai council master PRD', () => {
  it('replaces stale model dates with the actual run date', () => {
    const markdown = [
      '# OpenBasaka 「认知沙盘」 V1.0 产品需求文档（PRD）',
      '**项目代号**: Cognitive Sandbox',
      '**最后更新**: 2024-05-20',
      '## 产品定位与北极星',
      '最后更新: 2024-05-20',
    ].join('\n')
    const normalized = normalizeCouncilMasterPrdMarkdown(markdown, {
      problem: '认知沙盘',
      generatedAt: new Date('2026-05-06T08:30:00+08:00'),
    })

    expect(normalized).toContain('**最后更新**: 2026-05-06')
    expect(normalized).not.toContain('2024-05-20')
    expect(formatCouncilPrdDate(new Date('2026-05-06T08:30:00+08:00'))).toBe('2026-05-06')
  })

  it('requires product, frontend, backend, database, API, AI, security, deployment and testing sections', () => {
    const fullStackPrd = [
      '## 产品定位与北极星',
      '目标用户与用户旅程覆盖首次进入。',
      '## P0/P1/P2 与不做清单',
      '## 信息架构、页面与组件状态',
      '## 前端技术栈与状态管理',
      'React + TypeScript。',
      '## 后端服务与领域边界',
      'Node 服务、队列和鉴权。',
      '## 数据库、存储与数据模型',
      'SQLite 表结构和索引。',
      '## API、接口草案与错误码',
      '请求、响应、幂等和错误码。',
      '## AI/模型策略与提示词边界',
      'LLM prompt、RAG、事实校验和降级。',
      '## 权限、隐私、安全与审计',
      '## 部署、运维、性能与回滚',
      '## 测试矩阵与验收标准',
      '单元、集成、E2E、smoke、视觉回归。',
      '## 里程碑与任务拆解',
      '## 共识形成追溯',
      '主张、质询、裁决、吸收。',
    ].join('\n')

    const validation = validateCouncilMasterPrd(fullStackPrd)

    expect(validation.score).toBe(100)
    expect(validation.missedLabels).toEqual([])
  })

  it('does not count a model failure report as a complete master PRD', () => {
    const failedArtifact = [
      '# PRD 成稿生成失败',
      '',
      '## 发生了什么',
      '模型主持人没有稳定返回，所以系统没有生成可交付的「PRD 成稿」。',
      '',
      '## 模型错误摘要',
      'PRD 主持人 的所有模型路由都失败：DeepSeek V4: terminated；GLM 5.1: fetch failed',
      '',
      '## 原始任务',
      '请生成产品定位与北极星、目标用户与端到端旅程、P0/P1/P2、信息架构、前端、后端、数据库、API、AI、权限、部署、测试矩阵、里程碑与共识追溯。',
      '',
      '## 自动补齐清单：仍需人工复验的 PRD 章节',
      '1. 产品定位与北极星',
      '2. 目标用户与端到端旅程',
    ].join('\n')

    const validation = validateCouncilMasterPrd(failedArtifact)

    expect(isCouncilMasterPrdSynthesisFailure(failedArtifact)).toBe(true)
    expect(validation.score).toBe(0)
    expect(validation.hitLabels).toEqual([])
    expect(validation.missedLabels).toHaveLength(validation.sections.length)
  })

  it('extracts claim, challenge, absorb and cut lanes from sourced debate scenes', () => {
    const scenes: CouncilDebateScene[] = [
      {
        id: 'scene_1',
        sceneNo: 1,
        phaseId: 'independent-claim',
        phaseLabel: '独立主张',
        sceneTitle: '先成稿',
        speakerPersonaId: 'p1',
        speakerName: '产品席位',
        targetPersonaIds: [],
        targetNames: [],
        claim: '由产品席位提出：主界面先展示完整 PRD。',
        objection: '',
        evidence: 'brief_1',
        verdictImpact: '主持裁决后吸收为大师 PRD 阅读器。',
        sourceMessageIds: ['brief_1'],
        sourceExcerpt: '主界面先展示完整 PRD。',
      },
      {
        id: 'scene_2',
        sceneNo: 2,
        phaseId: 'clash',
        phaseLabel: '冲突质询',
        sceneTitle: '裁掉图文包默认线',
        speakerPersonaId: 'p2',
        speakerName: '反方席位',
        targetPersonaIds: ['p1'],
        targetNames: ['产品席位'],
        claim: '默认生成图文会稀释 PRD 质量。',
        objection: '质询：如果默认画图，前端、后端、API 和测试会被挤掉。',
        evidence: 'brief_2',
        verdictImpact: '裁掉默认图文包，把全栈蓝图作为质量主指标。',
        sourceMessageIds: ['brief_2'],
        sourceExcerpt: '裁掉默认图文包。',
      },
    ]
    const actionPack = {
      taskGroups: [{
        area: 'engineering',
        label: '工程实现',
        intent: '落地',
        tasks: [{
          id: 'engineering-api',
          area: 'engineering',
          priority: 'P0',
          title: '补齐前端、后端、API 与数据库契约',
          ownerHint: '工程席位',
          acceptance: 'API、数据库、测试全部可验收。',
          source: '大师 PRD',
        }],
      }],
    } as CouncilLaunchReadinessPack
    const verdictLedger = {
      kept: [],
      cut: [{ id: 'cut_1', label: '默认图文包', sourceSceneId: 'scene_2' }],
      revised: [],
      evidenceGaps: [],
      prdImpacts: [{ id: 'impact_1', label: '大师 PRD 阅读器', sourceSceneId: 'scene_1' }],
      openDisagreements: [],
      summary: '裁决账本',
    } as unknown as CouncilVerdictLedger

    const trace = buildCouncilConsensusTrace({ scenes, actionPack, verdictLedger })

    expect(trace.sourcedScenes).toBe(2)
    expect(trace.lanes.map((lane) => lane.id)).toEqual(['claim', 'challenge', 'absorb', 'cut'])
    expect(trace.lanes.find((lane) => lane.id === 'challenge')?.items[0]?.sourceMessageIds).toContain('brief_2')
    expect(trace.lanes.find((lane) => lane.id === 'cut')?.items[0]?.cutOrRisk).toContain('默认图文包')
  })
})
