import type { CouncilSelection } from './selector'
import { renderBaoyuCardDeck } from '../bili-helper/baoyu-visuals'
import type { BaoyuStructuredCard } from '../bili-helper/types'

export type CouncilBaoyuVisualKind = 'image-cards' | 'infographic' | 'diagram' | 'comic' | 'cover'

export interface CouncilBaoyuVisualPlan {
  id: string
  kind: CouncilBaoyuVisualKind
  label: string
  title: string
  command: string
  style: string
  layout: string
  prompt: string
  previewMarkdown: string
  structuredCards?: BaoyuStructuredCard[]
  imageDataUrls?: string[]
  textRenderMode?: 'local-svg'
  modelRoute?: {
    primary: string
    review: string
    renderer: string
  }
}

const LABELS: Record<CouncilBaoyuVisualKind, string> = {
  'image-cards': '秒懂图文卡',
  infographic: '高密度信息图',
  diagram: '结构图解',
  comic: '知识漫画',
  cover: 'PRD 封面',
}

export function buildCouncilBaoyuVisualPlans(params: {
  problem: string
  selection: CouncilSelection
  prdMarkdown?: string
}): CouncilBaoyuVisualPlan[] {
  const title = compact(params.problem, 42) || '小白智囊团 PRD'
  const profile = params.selection.profile
  const selectedNames = params.selection.seats.map((seat) => seat.persona.shortName).join(' / ')
  const structuredCards = buildCouncilStructuredCards({
    title,
    selectedNames,
    domains: profile.domains,
    prdMarkdown: params.prdMarkdown || params.problem,
  })
  const base = `主题：${title}
智囊团：${selectedNames}
难度：${profile.difficulty}/5
领域：${profile.domains.join(' / ')}
PRD 摘要：${compact(params.prdMarkdown || params.problem, 900)}`

  return [
    {
      id: 'council_image_cards',
      kind: 'image-cards',
      label: LABELS['image-cards'],
      title: '4 张小白秒懂卡',
      command: 'baoyu-image-cards',
      style: profile.needsVisual ? 'notion' : 'study-notes',
      layout: 'flow',
      structuredCards,
      imageDataUrls: renderBaoyuCardDeck(structuredCards),
      textRenderMode: 'local-svg',
      modelRoute: {
        primary: 'GLM-5.1 structured JSON',
        review: 'DeepSeek V4 Flash JSON review',
        renderer: 'local SVG Chinese text',
      },
      prompt: `${base}

请先用 GLM-5.1 生成结构化 JSON，再用本地 SVG/HTML/Canvas 和中文字体渲染文字；DeepSeek V4 Flash 只做二审、遗漏检查和 JSON 修复。图片模型只生成无文字视觉资产。
请用 baoyu-image-cards 生成 4 张图文卡：
1. 这个产品一句话是什么。
2. 用户第一步怎么用。
3. 系统背后怎么工作。
4. 下一步开发/验证清单。
每张卡文字短，适合小白扫读。`,
      previewMarkdown: `1. 一句话定位：${title}
2. 核心闭环：输入问题 -> 智囊博弈 -> 共识 PRD -> 图文解释
3. 关键角色：${selectedNames}
4. 下一步：按 PRD 拆任务并验证`,
    },
    {
      id: 'council_infographic',
      kind: 'infographic',
      label: LABELS.infographic,
      title: 'PRD 决策地图',
      command: 'baoyu-infographic',
      style: profile.needsEngineering ? 'technical-schematic' : 'editorial-infographic',
      layout: profile.needsEvidence ? 'layers-stack' : 'journey-path',
      prompt: `${base}

请用 baoyu-infographic 生成一张 PRD 决策地图。
结构必须包含：用户问题、自动编队、角色冲突、最终共识、P0/P1/P2、风险、验证方式。`,
      previewMarkdown: `信息图结构：问题画像 / 推荐编队 / 博弈过程 / 共识 PRD / 风险与验收`,
    },
    {
      id: 'council_diagram',
      kind: 'diagram',
      label: LABELS.diagram,
      title: '系统与数据流图',
      command: 'baoyu-diagram',
      style: 'technical-schematic',
      layout: 'structural',
      prompt: `${base}

请用 baoyu-diagram 生成一个结构图：
用户输入 -> 问题画像 -> 角色选择 -> 激活 custom_agents -> runTeamSession -> PRD artifact -> Baoyu-ready 视觉包 -> 归档/下载。`,
      previewMarkdown: `用户输入 -> 编队 -> 激活 Agent -> 群策运行 -> PRD -> 图文包 -> 归档`,
    },
    {
      id: 'council_comic',
      kind: 'comic',
      label: LABELS.comic,
      title: '智囊团四格漫画',
      command: 'baoyu-comic',
      style: 'ligne-claire',
      layout: 'standard',
      prompt: `${base}

请用 baoyu-comic 生成 4 格知识漫画：
1. 用户带着困难问题进入小白。
2. 隐藏智囊角色被点亮。
3. 多角色激烈但优雅地争论。
4. 共识变成 PRD 和秒懂图文。`,
      previewMarkdown: `四格：遇到难题 / 激活角色 / 博弈共识 / PRD 成稿`,
    },
    {
      id: 'council_cover',
      kind: 'cover',
      label: LABELS.cover,
      title: '项目 PRD 封面',
      command: 'baoyu-cover-image',
      style: 'blueprint',
      layout: 'hero-cover',
      prompt: `${base}

请用 baoyu-cover-image 生成 PRD 封面。
要求：标题不超过 12 字，副标题点出“智囊团共识 PRD”。视觉是优雅深色工作台、细网格、纸卡、紫青高光，不像营销海报。`,
      previewMarkdown: `封面标题：${compact(title, 12)}
副标题：小白智囊团共识 PRD`,
    },
  ]
}

function compact(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function buildCouncilStructuredCards(params: {
  title: string
  selectedNames: string
  domains: string[]
  prdMarkdown: string
}): BaoyuStructuredCard[] {
  const summary = compact(params.prdMarkdown, 96) || params.title
  return [
    {
      id: 'council_card_01_position',
      label: '01',
      title: '一句话定位',
      subtitle: params.title,
      points: [summary, `智囊团：${params.selectedNames || '自动编队'}`],
      visualIntent: '让小白先知道这个 PRD 到底在解决什么。',
      accent: '#67e8f9',
    },
    {
      id: 'council_card_02_flow',
      label: '02',
      title: '核心闭环',
      subtitle: '从问题到共识 PRD',
      points: ['输入问题', '角色独立初稿', '互相质询', '主持人裁决成稿'],
      visualIntent: '把多角色协作变成一条可理解的流程。',
      accent: '#bef264',
    },
    {
      id: 'council_card_03_agents',
      label: '03',
      title: '谁在贡献',
      subtitle: '独立人格与分歧',
      points: [`席位：${params.selectedNames || '自动选择'}`, `领域：${params.domains.slice(0, 4).join(' / ') || '产品 / 工程 / 风险'}`, 'SOUL 与 MEMORY 私有', '反思下轮生效'],
      visualIntent: '解释每个角色不是同一个 prompt 的左右互搏。',
      accent: '#f6c177',
    },
    {
      id: 'council_card_04_next',
      label: '04',
      title: '下一步验证',
      subtitle: '把 PRD 变成行动',
      points: ['拆 P0 任务', '跑 UI/模型/数据测试', '归档到知识+大佬', '继续让角色学习进化'],
      visualIntent: '把共识 PRD 送进可执行和可复用的系统闭环。',
      accent: '#c4b5fd',
    },
  ]
}
