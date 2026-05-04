import { describeBaoyuModelRouting } from './model-routing'
import type { BaoyuStructuredCard, BaoyuVisualArtifact, BaoyuVisualArtifactKind, BiliLearningPack, BiliVideoInfo } from './types'

export const BAOYU_VISUAL_KIND_LABELS: Record<BaoyuVisualArtifactKind, string> = {
  'image-cards': '图文卡',
  infographic: '信息图',
  comic: '知识漫画',
  diagram: '图解',
  cover: '封面',
  'article-illustration': '文章插画',
}

export const BAOYU_VISUAL_FILTERS: Array<'recommended' | BaoyuVisualArtifactKind> = [
  'recommended',
  'image-cards',
  'infographic',
  'comic',
  'diagram',
  'cover',
  'article-illustration',
]

interface BuildBaoyuVisualPlanInput {
  video: BiliVideoInfo
  transcript?: string
  pack?: BiliLearningPack
  goal?: string
}

function compactText(value: string, max = 780): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function wrapText(value: string, maxChars: number, maxLines = 4): string[] {
  const chars = Array.from(compactText(value, maxChars * maxLines))
  const lines: string[] = []
  let current = ''
  for (const char of chars) {
    current += char
    if (Array.from(current).length >= maxChars || /[。！？；;]$/.test(current)) {
      lines.push(current.trim())
      current = ''
    }
    if (lines.length >= maxLines) break
  }
  if (current.trim() && lines.length < maxLines) lines.push(current.trim())
  return lines.length ? lines : ['暂无文字']
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42)
}

function includesAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word))
}

function contentSignals(input: BuildBaoyuVisualPlanInput) {
  const blob = compactText(
    [
      input.video.title,
      input.video.description,
      input.video.tags.join(' '),
      input.goal || '',
      input.pack?.summary || '',
      input.pack?.keyPoints.join(' ') || '',
      input.transcript || input.video.contentText || '',
    ].join('\n'),
    3000,
  ).toLowerCase()
  return {
    technical: includesAny(blob, ['api', '架构', '代码', '工程', '系统', 'workflow', 'agent', 'llm', '模型', '技术']),
    process: includesAny(blob, ['步骤', '流程', '时间线', '路线', '方法', '教程', 'how to', 'guide', 'workflow']),
    comparison: includesAny(blob, ['对比', ' versus ', ' vs ', '优缺点', 'before', 'after', '差异']),
    narrative: includesAny(blob, ['故事', '案例', '经历', '人物', '复盘', 'history', 'biography']),
    warning: includesAny(blob, ['风险', '避坑', '警告', '必须', 'critical', 'warning', '注意']),
    learning: includesAny(blob, ['学习', '知识', '课程', 'notebook', '教程', '概念', '总结', '资料']),
  }
}

function imageCardPreset(signals: ReturnType<typeof contentSignals>) {
  if (signals.warning) return { style: 'bold', layout: 'list', palette: 'neon', preset: 'warning' }
  if (signals.process) return { style: 'sketch-notes', layout: 'flow', palette: 'macaron', preset: 'hand-drawn-edu' }
  if (signals.technical) return { style: 'notion', layout: 'dense', palette: 'macaron', preset: 'knowledge-card' }
  return { style: 'minimal', layout: 'balanced', palette: 'macaron', preset: 'pro-summary' }
}

function infographicPreset(signals: ReturnType<typeof contentSignals>) {
  if (signals.comparison) return { style: 'corporate-memphis', layout: 'binary-comparison' }
  if (signals.process) return { style: 'hand-drawn-edu', layout: 'linear-progression' }
  if (signals.technical) return { style: 'technical-schematic', layout: 'structural-breakdown' }
  return { style: 'craft-handmade', layout: 'bento-grid' }
}

function sourceExcerpt(input: BuildBaoyuVisualPlanInput): string {
  const lines = [
    input.pack?.summary,
    input.video.description,
    input.transcript || input.video.contentText,
    input.pack?.keyPoints.join('；'),
  ].filter(Boolean)
  return compactText(lines.join('\n'), 900) || '当前来源还没有足够正文，请基于标题、简介和用户目标生成可继续补全的视觉理解稿。'
}

function basePrompt(input: BuildBaoyuVisualPlanInput): string {
  return `来源标题：${input.video.title}
平台/形态：${input.video.platformName} / ${input.video.sourceKind}
作者/来源：${input.video.owner}
用户目标：${input.goal || input.pack?.goal || '快速理解并归档为可复用知识'}
内容摘录：${sourceExcerpt(input)}

模型分工：
${describeBaoyuModelRouting()}`
}

function artifact(input: BuildBaoyuVisualPlanInput, patch: Omit<BaoyuVisualArtifact, 'id' | 'status' | 'createdAt' | 'generatedBy'>): BaoyuVisualArtifact {
  return {
    ...patch,
    id: `baoyu_${patch.kind}_${slug(input.video.id || input.video.bvid || input.video.title)}_${slug(patch.title)}`,
    status: 'ready',
    createdAt: Date.now(),
    generatedBy: 'baoyu-plan',
  }
}

export function buildBaoyuStructuredCards(input: BuildBaoyuVisualPlanInput): BaoyuStructuredCard[] {
  const title = compactText(input.video.title, 28) || '来源理解'
  const summary = compactText(input.pack?.summary || input.video.description || sourceExcerpt(input), 72)
  const outline = (input.pack?.outline || input.video.tags || []).slice(0, 4).map((item) => compactText(item, 28))
  const keyPoints = (input.pack?.keyPoints || []).slice(0, 4).map((item) => compactText(item, 34))
  const actionList = (input.pack?.actionList || []).slice(0, 4).map((item) => compactText(item, 34))
  const fallbackPoints = [summary, ...outline, ...keyPoints].filter(Boolean)
  return [
    {
      id: 'card_01_position',
      label: '01',
      title: '一句话秒懂',
      subtitle: title,
      points: [summary || title, compactText(input.goal || input.pack?.goal || '转成可复用知识', 32)].filter(Boolean),
      visualIntent: '用清晰标题、短摘要和来源标签帮助小白先抓住主题。',
      accent: '#67e8f9',
    },
    {
      id: 'card_02_structure',
      label: '02',
      title: '核心结构',
      subtitle: '先看骨架，再看细节',
      points: (outline.length ? outline : fallbackPoints).slice(0, 4),
      visualIntent: '把资料拆成 3-4 个节点，形成可归档的资料地图。',
      accent: '#bef264',
    },
    {
      id: 'card_03_evidence',
      label: '03',
      title: '关键提醒',
      subtitle: '要记住的判断',
      points: (keyPoints.length ? keyPoints : fallbackPoints).slice(0, 4),
      visualIntent: '突出值得核对、复用或追问的重点，避免只收藏不消化。',
      accent: '#f6c177',
    },
    {
      id: 'card_04_action',
      label: '04',
      title: '下一步动作',
      subtitle: '进入知识闭环',
      points: (actionList.length ? actionList : ['生成学习包', '归档到知识+大佬', '继续追问缺口']).slice(0, 4),
      visualIntent: '把理解转成今天能做的动作，并给出归档方向。',
      accent: '#c4b5fd',
    },
  ]
}

export function renderBaoyuCardSvg(card: BaoyuStructuredCard, index = 0, total = 4): string {
  const accent = card.accent || '#67e8f9'
  const titleLines = wrapText(card.title, 10, 2)
  const subtitleLines = wrapText(card.subtitle, 18, 2)
  const pointLines = card.points.slice(0, 4).map((point) => wrapText(point, 20, 2))
  const pointSvg = pointLines
    .map((lines, pointIndex) => {
      const y = 334 + pointIndex * 78
      const textRows = lines
        .map((line, lineIndex) => `<text x="118" y="${y + lineIndex * 26}" class="point">${xmlEscape(line)}</text>`)
        .join('')
      return `<g>
        <circle cx="82" cy="${y - 8}" r="10" fill="${accent}" opacity="0.92"/>
        ${textRows}
      </g>`
    })
    .join('\n')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#07131f"/>
      <stop offset="0.48" stop-color="#111827"/>
      <stop offset="1" stop-color="#171326"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#000000" flood-opacity="0.32"/>
    </filter>
    <style>
      .font { font-family: "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif; }
      .kicker { font: 700 30px "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif; fill: ${accent}; letter-spacing: 0; }
      .title { font: 900 82px "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif; fill: #f8fafc; letter-spacing: 0; }
      .subtitle { font: 500 36px "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif; fill: #b6c6d6; letter-spacing: 0; }
      .point { font: 600 34px "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif; fill: #eef7ff; letter-spacing: 0; }
      .meta { font: 500 25px "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif; fill: #8ea4b8; letter-spacing: 0; }
    </style>
    <pattern id="grid" width="54" height="54" patternUnits="userSpaceOnUse">
      <path d="M 54 0 L 0 0 0 54" fill="none" stroke="#8be9fd" stroke-opacity="0.08" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1080" height="1440" fill="url(#bg)"/>
  <rect width="1080" height="1440" fill="url(#grid)"/>
  <rect x="48" y="54" width="984" height="1332" rx="28" fill="#07121f" fill-opacity="0.72" stroke="${accent}" stroke-opacity="0.46" filter="url(#softShadow)"/>
  <circle cx="914" cy="144" r="94" fill="${accent}" opacity="0.13"/>
  <circle cx="150" cy="1238" r="130" fill="#67e8f9" opacity="0.08"/>
  <g class="font">
    <text x="78" y="126" class="kicker">BAOYU LOCAL SVG · ${xmlEscape(card.label)} / ${total}</text>
    ${titleLines.map((line, lineIndex) => `<text x="78" y="${222 + lineIndex * 92}" class="title">${xmlEscape(line)}</text>`).join('')}
    ${subtitleLines.map((line, lineIndex) => `<text x="80" y="${424 + lineIndex * 48}" class="subtitle">${xmlEscape(line)}</text>`).join('')}
    <line x1="78" y1="516" x2="1002" y2="516" stroke="${accent}" stroke-opacity="0.38" stroke-width="2"/>
    ${pointSvg}
    <text x="78" y="1290" class="meta">中文由本地字体渲染，图片模型不写字</text>
    <text x="78" y="1332" class="meta">${xmlEscape(card.visualIntent)}</text>
    <text x="872" y="1332" class="meta">${String(index + 1).padStart(2, '0')}</text>
  </g>
</svg>`
}

export function renderBaoyuCardSvgDataUrl(card: BaoyuStructuredCard, index = 0, total = 4): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderBaoyuCardSvg(card, index, total))}`
}

export function renderBaoyuCardDeck(cards: BaoyuStructuredCard[]): string[] {
  return cards.map((card, index) => renderBaoyuCardSvgDataUrl(card, index, cards.length))
}

export function buildBaoyuVisualPlan(input: BuildBaoyuVisualPlanInput): BaoyuVisualArtifact[] {
  const signals = contentSignals(input)
  const cards = imageCardPreset(signals)
  const info = infographicPreset(signals)
  const promptBase = basePrompt(input)
  const visualTone = `${cards.style} / ${cards.palette}，贴合 SourceOS 深色网格、紫青高光、纸卡通引导气质`
  const recommendedCover = !input.video.cover || input.video.sourceKind === 'webpage' || input.video.sourceKind === 'document'
  const structuredCards = buildBaoyuStructuredCards(input)
  const artifacts: BaoyuVisualArtifact[] = [
    artifact(input, {
      kind: 'image-cards',
      label: BAOYU_VISUAL_KIND_LABELS['image-cards'],
      title: '秒懂图文卡',
      rationale: `用 baoyu-image-cards 的 ${cards.preset} 路线，把复杂内容压成 3-5 张可扫读卡片。`,
      style: cards.style,
      layout: cards.layout,
      palette: cards.palette,
      isRecommended: true,
      structuredCards,
      imageDataUrls: renderBaoyuCardDeck(structuredCards),
      textRenderMode: 'local-svg',
      modelRoute: {
        primary: 'GLM-5.1 structured JSON',
        review: 'DeepSeek V4 Flash JSON review',
        renderer: 'local SVG Chinese text',
      },
      prompt: `${promptBase}

请先用 GLM-5.1 生成结构化 JSON：标题、短句、卡片层级、标签、配图意图。
再用本地 SVG/HTML/Canvas + 中文字体渲染文字，最后叠加无文字视觉资产。
请用 baoyu-image-cards 生成 4 张图文卡。
风格：${visualTone}
布局：${cards.layout}
要求：第一张讲一句话秒懂，第二张拆核心结构，第三张给例子/证据，第四张给行动或归档建议。文字必须短、清楚、适合小白快速理解。图片模型不能直接写中文。`,
      previewMarkdown: `1. 一句话秒懂：${input.pack?.summary || input.video.description || input.video.title}
2. 核心结构：${(input.pack?.outline || input.video.tags).slice(0, 4).join(' / ') || '问题 / 观点 / 证据 / 行动'}
3. 关键提醒：${(input.pack?.keyPoints || [input.video.description]).slice(0, 2).join('；') || '先确认来源，再进入知识库'}
4. 下一步：${(input.pack?.actionList || ['生成学习包', '归档到知识+大佬']).slice(0, 2).join('；')}`,
    }),
    artifact(input, {
      kind: 'infographic',
      label: BAOYU_VISUAL_KIND_LABELS.infographic,
      title: '高密度信息图',
      rationale: `用 baoyu-infographic 的 ${info.layout} × ${info.style}，把资料变成一张总览地图。`,
      style: info.style,
      layout: info.layout,
      palette: 'sourceos-neon',
      isRecommended: signals.process || signals.technical || signals.comparison,
      prompt: `${promptBase}

请用 baoyu-infographic 生成一张信息图。图片模型只负责无文字背景/插画，中文由本地排版层渲染。
layout=${info.layout}
style=${info.style}
要求：标题区、核心结论区、结构地图区、行动清单区、归档标签区都要清晰。整体保持优雅、简约、纸感卡通，不要过密。`,
      previewMarkdown: `信息图结构：标题 / 核心结论 / ${signals.process ? '流程步骤' : signals.comparison ? '对比矩阵' : '资料地图'} / 行动清单 / 归档建议`,
    }),
    artifact(input, {
      kind: 'comic',
      label: BAOYU_VISUAL_KIND_LABELS.comic,
      title: '知识漫画分镜',
      rationale: '用 baoyu-comic 把抽象内容变成 4 格纸卡通故事，新人更容易看懂。',
      style: signals.narrative ? 'manga' : 'ligne-claire',
      layout: signals.narrative ? 'standard' : 'four-panel',
      palette: signals.warning ? 'energetic' : 'warm',
      isRecommended: signals.narrative || signals.learning,
      prompt: `${promptBase}

请用 baoyu-comic 生成 4 格知识漫画分镜。对白和中文标题必须走本地 SVG/HTML 渲染，不直接交给图片模型写字。
画风：${signals.narrative ? 'manga + warm narrative' : 'ligne-claire + warm four-panel'}
要求：不要变成说明书堆字；每格一个动作或视觉隐喻，最后一格给用户下一步。`,
      previewMarkdown: `四格分镜：
1. 用户遇到信息过载。
2. SourceOS 把来源拆成封面、摘要、结构。
3. Baoyu 视觉把复杂点变成图文/漫画。
4. 用户选择归档到知识+大佬或后备文件夹。`,
    }),
    artifact(input, {
      kind: 'diagram',
      label: BAOYU_VISUAL_KIND_LABELS.diagram,
      title: '结构图解',
      rationale: '用 baoyu-diagram 思路把来源拆成节点、关系和流向，适合工程、流程、概念型内容。',
      style: signals.technical ? 'technical-schematic' : 'hand-drawn-edu',
      layout: signals.process ? 'flow' : 'hub-spoke',
      palette: 'cyan-purple',
      isRecommended: signals.technical || signals.process,
      prompt: `${promptBase}

请生成一个深色 SourceOS 风格图解：中心是来源主题，周围是问题、概念、证据、行动、归档五类节点；如果内容是流程，则用短箭头串起步骤。`,
      previewMarkdown: `中心主题 -> 问题 -> 关键概念 -> 证据/例子 -> 行动 -> 归档`,
    }),
    artifact(input, {
      kind: 'cover',
      label: BAOYU_VISUAL_KIND_LABELS.cover,
      title: '资料封面补全',
      rationale: recommendedCover ? '当前来源封面较弱或缺失，用 baoyu-cover-image 补一张可识别的资料封面。' : '保留为可选封面重绘，让资料库视觉更统一。',
      style: 'minimal',
      layout: 'hero-cover',
      palette: 'sourceos-purple-cyan',
      isRecommended: recommendedCover,
      prompt: `${promptBase}

请用 baoyu-cover-image 生成一张资料封面。图片模型只生成无文字封面视觉，中文标题由本地渲染层叠加。
要求：大标题不超过 10 个字，副标题说明来源价值；深色网格背景、紫青高光、纸卡通小标记，不能像营销海报。`,
      previewMarkdown: `封面标题：${compactText(input.video.title, 22)}
副标题：${compactText(input.video.description || input.goal || '一键转成资料地图', 42)}`,
    }),
    artifact(input, {
      kind: 'article-illustration',
      label: BAOYU_VISUAL_KIND_LABELS['article-illustration'],
      title: '文章插画提示',
      rationale: '用 baoyu-article-illustrator 思路给长文或网页配一张概念插画，辅助理解气质。',
      style: 'editorial-paper',
      layout: 'inline-illustration',
      palette: 'soft-cyan-gold',
      isRecommended: input.video.sourceKind === 'webpage' || input.video.sourceKind === 'document',
      prompt: `${promptBase}

请生成一张文章内插画：一个人把杂乱信息丢进 SourceOS，系统输出结构卡、漫画格和归档标签。画面要优雅、直观、克制。`,
      previewMarkdown: '插画构图：输入来源 / 秒懂视觉 / 知识归档三段式。',
    }),
  ]

  const localCardDeck = artifacts.find((item) => item.kind === 'image-cards')
  if (localCardDeck?.imageDataUrls?.length) {
    localCardDeck.status = 'generated'
    localCardDeck.generatedBy = 'local'
  }

  return artifacts.sort((a, b) => Number(b.isRecommended) - Number(a.isRecommended))
}

export function topRecommendedVisual(artifacts: BaoyuVisualArtifact[]): BaoyuVisualArtifact | undefined {
  return artifacts.find((artifact) => artifact.isRecommended) || artifacts[0]
}
