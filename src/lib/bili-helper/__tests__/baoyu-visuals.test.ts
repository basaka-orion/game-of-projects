import { describe, expect, it } from 'vitest'
import { buildBaoyuVisualPlan, renderBaoyuCardSvg, topRecommendedVisual } from '../baoyu-visuals'
import { createLocalArtifactPack, createLocalVideoInfo } from '../state'

describe('Baoyu visual plan', () => {
  it('creates recommended visual artifacts for a webpage source', () => {
    const video = createLocalVideoInfo('https://example.com/agent-workflow', {
      platform: 'website',
      platformName: 'Website',
      sourceKind: 'webpage',
      title: 'Agent workflow guide',
      description: 'A technical workflow tutorial about LLM agent systems.',
      cover: '',
      tags: ['agent', 'workflow', 'learning'],
      durationSeconds: 0,
      stats: { views: 0, danmaku: 0, likes: 0, coins: 0, favorites: 0, shares: 0 },
    })
    const pack = createLocalArtifactPack(video, '00:00 workflow starts\n03:00 agent system design', '快速理解 agent workflow', 'tutorial', 70)
    const plan = buildBaoyuVisualPlan({ video, transcript: video.contentText, pack, goal: pack.goal })

    expect(plan.length).toBeGreaterThanOrEqual(5)
    expect(plan[0].isRecommended).toBe(true)
    expect(plan.some((artifact) => artifact.kind === 'image-cards')).toBe(true)
    expect(plan.some((artifact) => artifact.kind === 'infographic')).toBe(true)
    expect(plan.some((artifact) => artifact.kind === 'cover' && artifact.isRecommended)).toBe(true)
    expect(topRecommendedVisual(plan)?.prompt).toContain('baoyu')
  })

  it('renders Chinese image cards locally instead of relying on model text', () => {
    const video = createLocalVideoInfo('manual://zh', {
      title: '中文智能体学习资料',
      description: '这是一份关于本地智能体、独立记忆和图文卡生成的中文资料。',
      sourceKind: 'document',
      platform: 'local-file',
      platformName: '本地文件',
      stats: { views: 0, danmaku: 0, likes: 0, coins: 0, favorites: 0, shares: 0 },
    })
    const pack = createLocalArtifactPack(video, '00:00 本地智能体\n01:00 中文图文卡', '生成中文图文包', 'tutorial', 70)
    const imageCards = buildBaoyuVisualPlan({ video, transcript: video.contentText, pack }).find((artifact) => artifact.kind === 'image-cards')

    expect(imageCards?.status).toBe('generated')
    expect(imageCards?.generatedBy).toBe('local')
    expect(imageCards?.textRenderMode).toBe('local-svg')
    expect(imageCards?.structuredCards).toHaveLength(4)
    expect(imageCards?.imageDataUrls).toHaveLength(4)

    const svg = renderBaoyuCardSvg(imageCards!.structuredCards![0], 0, 4)
    expect(svg).toContain('PingFang SC')
    expect(svg).toContain('中文由本地字体渲染')
    expect(svg).toContain('一句话秒懂')
  })

  it('routes comparison content toward comparison visuals', () => {
    const video = createLocalVideoInfo('manual://comparison', {
      title: 'A vs B 工具对比',
      description: '对比两个工具的优缺点和差异。',
      sourceKind: 'document',
      platform: 'local-file',
      platformName: '本地文件',
      stats: { views: 0, danmaku: 0, likes: 0, coins: 0, favorites: 0, shares: 0 },
    })
    const plan = buildBaoyuVisualPlan({ video, transcript: 'A vs B before after 优缺点 对比矩阵' })
    const infographic = plan.find((artifact) => artifact.kind === 'infographic')

    expect(infographic?.layout).toBe('binary-comparison')
  })
})
