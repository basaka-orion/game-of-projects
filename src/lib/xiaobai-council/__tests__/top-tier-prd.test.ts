import { describe, expect, it } from 'vitest'
import {
  buildCouncilTopTierPrdEvaluation,
  buildCouncilTopTierPrdExport,
  buildCouncilTopTierPrdProcessMarkdown,
} from '../top-tier-prd'
import type { UiMuseumPrdContext } from '../../ui-museum/context'

const uiStyleContext: UiMuseumPrdContext = {
  styleIds: ['liquid-glass', 'digicute'],
  styleNames: ['Liquid Glass', 'DigiCute'],
  reasoning: 'iOS 消费级产品需要优雅、轻盈、卡通但严谨的界面。',
  visual: {
    palette: ['#F8FAFC', '#38BDF8', '#F472B6', '#111827'],
    background: '柔和浅色天气渐变',
    surface: '半透明玻璃卡片',
    text: '#111827',
    accent: '#F472B6',
    border: 'rgba(15,23,42,.12)',
    radius: '18px',
    shadow: 'soft elevation',
    pattern: 'glass',
    density: 'balanced',
    typography: 'SF Pro Rounded + PingFang SC',
    motif: '天气签章与包包贴纸',
    texture: '细腻纸感和玻璃高光',
    motion: '220ms 轻弹与 reduced-motion 降级',
  },
  platformNotes: {
    web: '响应式卡片和键盘可达。',
    ios: 'SwiftUI、Dynamic Type、VoiceOver、WidgetKit。',
    mac: 'Sidebar + Inspector。',
    android: 'Material 动态色。',
    mini: '轻量卡片。',
  },
  componentStates: ['空态', '加载态', '失败态', '完成态'],
  acceptanceChecklist: ['五张关键截图', 'VoiceOver 可读', '大字模式不溢出'],
  evolutionNotes: [],
  styleProfiles: [
    {
      styleId: 'liquid-glass',
      styleName: 'Liquid Glass',
      referenceBrief: '参考 Apple 材质体系、空间计算和动态玻璃，强调内容之上的可读流体材质。',
      identityRules: ['透明、折射、流动边缘、内容感知高光必须出现。'],
      antiPatterns: ['不能只是透明白卡片或固定模糊。'],
      restorationScores: {
        identity: 94,
        craft: 94,
        interaction: 94,
        platformFit: 94,
        openbasakaUsefulness: 95,
      },
    },
    {
      styleId: 'digicute',
      styleName: 'DigiCute',
      referenceBrief: '参考数字萌系、盲盒、宠物和二次元社区，强调软萌但可控。',
      identityRules: ['马卡龙、软圆角、像素/贴纸和可爱状态必须出现。'],
      antiPatterns: ['不能把可爱做成低龄混乱。'],
      restorationScores: {
        identity: 91,
        craft: 91,
        interaction: 90,
        platformFit: 91,
        openbasakaUsefulness: 92,
      },
    },
  ],
  promptFragment: '## UI风格馆自动视觉输入',
}

const strongPrd = [
  '## 产品定位与北极星',
  '一句话定位：包里晴雨签是女性出门前 90 秒完成包包准备的 iOS App。北极星是 90 秒完成率。',
  '## 目标用户与端到端旅程',
  '目标用户是通勤、约会、旅行和夜归女性；真实场景覆盖晴天、雨天、降温、大风和无定位。',
  '痛点是忘带伞、充电宝、证件、防晒、药品和安全物品。',
  '## 市场判断与增长',
  '竞品包括天气 App、待办清单和穿搭工具；差异是天气触发的包包清单。冷启动靠小组件、分享签章和通勤场景留存。商业模式是订阅皮肤和高级包模板。',
  '## P0/P1/P2 与不做清单',
  'P0 天气清单、包模板、打勾完成；P1 Widget 和日历；P2 社区。裁掉复杂天气图表。',
  '## 信息架构、页面与组件状态',
  '页面包括今日出门、我的包包、天气灵感、记录偏好；组件有空态、加载、失败态、完成态。',
  '## UI风格馆视觉 DNA 与像素级规格',
  'UI风格馆给出色彩 token、字体、材质、动效、截图验收和 VoiceOver 可访问性。',
  '## 前端技术栈与状态管理',
  'SwiftUI + SwiftData + WidgetKit。状态流 WeatherSnapshot -> ChecklistRun。',
  '## 数据库、存储与数据模型',
  '数据模型包含 UserProfile、BagTemplate、BagItem、ChecklistRun。',
  '## API、接口草案与错误码',
  'WeatherProvider.current 返回 WeatherSnapshot；错误码 LOCATION_DENIED、WEATHER_UNAVAILABLE，接口幂等。',
  '## 权限、隐私、安全与审计',
  '定位仅用于天气；离线降级使用缓存；不上传精准位置。',
  '## 测试矩阵与验收标准',
  'TestFlight 小范围验证、用户访谈、MVP 验证实验、App Store 审核风险和回滚策略。',
].join('\n')

describe('xiaobai council top-tier PRD export', () => {
  it('scores a market, UI, engineering and launch ready PRD as a strong draft or better', () => {
    const evaluation = buildCouncilTopTierPrdEvaluation({
      projectTitle: '包里晴雨签 iOS App',
      problem: '女性出门根据天气准备包包的 iOS App',
      finalPrd: strongPrd,
      uiStyleContext,
      qualityGate: { score: 92, finalGateStatus: 'approved' } as any,
      consensusTrace: { sourcedScenes: 8, totalScenes: 10 } as any,
      actionPack: { taskGroups: [{ tasks: new Array(10).fill({}) }] } as any,
    })

    expect(evaluation.score).toBeGreaterThanOrEqual(82)
    expect(evaluation.status).not.toBe('blocked')
    expect(evaluation.dimensions.map((item) => item.id)).toContain('market-judgment')
    expect(evaluation.dimensions.map((item) => item.id)).toContain('ui-implementation')
  })

  it('blocks contaminated final exports instead of pretending they are elite PRDs', () => {
    const evaluation = buildCouncilTopTierPrdEvaluation({
      projectTitle: 'OpenBasaka 项目共识 PRD',
      problem: '输入一个真实项目想法',
      finalPrd: '## PRD\n漫画回看\n正在自动发给工作流模块...',
      uiStyleContext,
    })

    expect(evaluation.status).toBe('blocked')
    expect(evaluation.blockers.join('\n')).toContain('移除通用占位')
  })

  it('exports a clean product PRD without process evidence mixed into the document', () => {
    const markdown = buildCouncilTopTierPrdExport({
      projectTitle: '包里晴雨签 iOS App',
      problem: '女性出门根据天气准备包包的 iOS App',
      finalPrd: `# 小白智囊团大师共识 PRD\n\n${strongPrd}\n\n## 共识形成追溯\n\n内部过程。`,
      workflowDispatchLabel: '正在自动发给工作流模块...',
      qualityGate: { score: 92, finalGateStatus: 'approved' } as any,
      uiStyleContext,
      consensusTrace: {
        generatedAt: '2026-05-14T00:00:00.000Z',
        summary: '已整理过程。',
        totalScenes: 2,
        sourcedScenes: 2,
        totalTasks: 3,
        lanes: [],
      },
      actionPack: {
        taskGroups: [{
          label: 'iOS 工程',
          tasks: [{
            priority: 'P0',
            title: '实现今日出门清单',
            acceptance: '能按天气生成并勾选。',
            ownerHint: 'iOS 工程',
          }],
        }],
      } as any,
      appendixMarkdown: '## 质量门\n\nquality=92。',
    })

    expect(markdown).toContain('# 包里晴雨签 iOS App PRD')
    expect(markdown).toContain('## 大师级开工判定')
    expect(markdown).toContain('## UI 风格馆落地规格')
    expect(markdown).toContain('## 团队开发执行版')
    expect(markdown).not.toContain('## 超顶级 PRD 评分尺')
    expect(markdown).not.toContain('## 附录：过程证据与决策追溯')
    expect(markdown).not.toContain('## 共识形成追溯')
    expect(markdown).not.toContain('工作流投递已触发')
    expect(markdown).not.toContain('quality=92')
    expect(markdown).not.toContain('正在自动发给工作流模块')
    expect(markdown).not.toContain('漫画回看')
  })

  it('keeps legacy process evidence out of the product PRD and exposes master blockers', () => {
    const markdown = buildCouncilTopTierPrdExport({
      projectTitle: '星际番茄钟 iOS App',
      problem: '做一个星际穿越主题番茄钟',
      finalPrd: [
        '## 产品定位与北极星',
        '目标用户是深度工作者，痛点是倒计时焦虑，成功标准是完成率。',
        '## P0/P1/P2 与不做清单',
        'P0 控制中心启动；页面包括今日跃迁；组件有空态、加载态、失败态。',
        '## 超顶级 PRD 评分尺',
        '- 状态：blocked',
        '## 小白辩论剧场',
        '内部过程。',
      ].join('\n'),
      qualityGate: { score: 100, finalGateStatus: 'approved' } as any,
      uiStyleContext,
    })

    expect(markdown).toContain('## 大师级开工判定')
    expect(markdown).toContain('不可以；必须先补齐下列缺口')
    expect(markdown).not.toContain('## 超顶级 PRD 评分尺')
    expect(markdown).not.toContain('## 小白辩论剧场')
    expect(markdown).not.toContain('状态：blocked')
  })

  it('exports debate, quality and workflow evidence into a separate process markdown', () => {
    const markdown = buildCouncilTopTierPrdProcessMarkdown({
      projectTitle: '包里晴雨签 iOS App',
      problem: '女性出门根据天气准备包包的 iOS App',
      finalPrd: strongPrd,
      workflowDispatchLabel: '正在自动发给工作流模块...',
      qualityGate: { score: 92, finalGateStatus: 'approved' } as any,
      uiStyleContext,
      consensusTrace: {
        generatedAt: '2026-05-14T00:00:00.000Z',
        summary: '已整理过程。',
        totalScenes: 2,
        sourcedScenes: 2,
        totalTasks: 3,
        lanes: [],
      },
      actionPack: {
        taskGroups: [{
          label: 'iOS 工程',
          tasks: [{
            priority: 'P0',
            title: '实现今日出门清单',
            acceptance: '能按天气生成并勾选。',
            ownerHint: 'iOS 工程',
          }],
        }],
      } as any,
      appendixMarkdown: '## 质量门\n\nquality=92。',
    })

    expect(markdown).toContain('# 包里晴雨签 iOS App｜小白智囊团辩论过程与证据')
    expect(markdown).toContain('## 工作流行动包')
    expect(markdown).toContain('工作流投递已触发，最终回执请以 OpenBasaka 历史记录为准')
    expect(markdown).toContain('quality=92')
    expect(markdown).not.toContain('正在自动发给工作流模块')
  })
})
