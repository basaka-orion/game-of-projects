/**
 * PRD Generator — 4 轮专家审阅 + 16 章节智能 PRD 生成
 *
 * 流程：
 * 1. 骨架生成 — LLM 生成 16 章节框架
 * 2. 专家审阅 — 6 位角色各自提出改进意见
 * 3. 综合优化 — 整合所有意见，输出完整版
 * 4. 自检验证 — 逐项确认 16 章节完整性
 */
import { chatCompletion, LLMConfig, resolveAgentConfig } from '../ai/provider'
import { getSetting } from '../db/store'
import { getDefaultConfig } from '../ai/provider'
import { PRDAnswers } from './questions'
import { listAllAgents, type AgentDefinition } from '../agents/registry'
import type { Team } from '../teams/types'
import { buildUiMuseumPrdContext, type UiMuseumPrdContext } from '../ui-museum/context'

export interface PRDChapter {
  id: number
  title: string
  content: string
}

export interface PRDResult {
  chapters: PRDChapter[]
  totalRounds: number
  projectTitle: string
  generatedAt: string
  reviewerNames: string[]
  teamName?: string
  projectPath?: string
  uiStyleContext?: {
    styleNames: string[]
    reasoning: string
    savedFusionName?: string
  }
}

export interface PRDGenerationOptions {
  team?: Team | null
  agents?: AgentDefinition[]
  onRoleDeclaration?: (msg: string) => void
  uiStyleContext?: UiMuseumPrdContext | null
}

interface PRDReviewer {
  id: string
  name: string
  focus: string
  systemPrompt: string
  temperature: number
  config: LLMConfig
  source: 'team' | 'default'
  telegramConnected: boolean
}

const CHAPTERS = [
  { id: 1, title: '需求背景' },
  { id: 2, title: '产品定位' },
  { id: 3, title: '业务意图溯源' },
  { id: 4, title: '用户故事' },
  { id: 5, title: 'Agent 故事' },
  { id: 6, title: '用户旅程' },
  { id: 7, title: 'Agent 旅程与协作流' },
  { id: 8, title: '完整交互设计与信息架构' },
  { id: 9, title: '视觉语言、动效与图文表达系统' },
  { id: 10, title: '功能清单与详细说明' },
  { id: 11, title: '提示词设计与模型策略' },
  { id: 12, title: '数据模型、标签与记忆闭环' },
  { id: 13, title: '全技术栈与接口设计' },
  { id: 14, title: '异常处理、隐私合规与 AI 降级方案' },
  { id: 15, title: '测试标准、视觉验收与非功能性需求' },
  { id: 16, title: '附录' },
]

const EXPERTS = [
  { role: 'strategy', name: '策略师', focus: '商业模式可行性、市场定位、竞争差异化' },
  { role: 'technical', name: '技术师', focus: '技术栈选择、架构可行性、性能瓶颈、技术债风险' },
  { role: 'market', name: '市场师', focus: '目标市场规模、获客渠道、定价策略、GTM 路径' },
  { role: 'creative', name: '创意师', focus: '用户体验创新、差异化功能、增长黑客玩法' },
  { role: 'visual', name: '视觉大师', focus: 'UI/UX、视觉语言、动效叙事、信息密度、Baoyu 图文表达、Remotion 可生成资产' },
  { role: 'critic', name: '批判师', focus: '风险盲点、假设谬误、失败模式、资源陷阱' },
  { role: 'general', name: '综合评审', focus: '整体一致性、章节间逻辑连贯、执行可行性' },
]

function getLLMConfig(): LLMConfig {
  const provider = getSetting('llm_provider', 'deepseek')
  const defaults = getDefaultConfig(provider)
  return {
    provider: provider as LLMConfig['provider'],
    apiKey: getSetting('llm_api_key', ''),
    baseUrl: getSetting('llm_base_url', defaults.baseUrl),
    model: getSetting('llm_model', defaults.model),
  }
}

function buildDesktopProjectPath(projectName: string): string {
  const slug =
    projectName
      .trim()
      .replace(/[^\p{L}\p{N}_-]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36) || 'Openbasaka-Project'
  return `/Users/apple/Desktop/🚀-${slug}`
}

async function resolveReviewers(options?: PRDGenerationOptions): Promise<PRDReviewer[]> {
  const allAgents = options?.agents?.length ? options.agents : await listAllAgents()
  const byId = new Map(allAgents.map((agent) => [agent.id, agent]))

  if (options?.team?.agents?.length) {
    const reviewers = options.team.agents
      .map((teamAgent) => {
        const agent = byId.get(teamAgent.agentId)
        if (!agent) return null
        return buildReviewerFromAgent(agent, teamAgent.role, 'team')
      })
      .filter(Boolean) as PRDReviewer[]

    const visualAgent = byId.get('visual')
    if (visualAgent && !reviewers.some(reviewer => reviewer.id === 'visual')) {
      reviewers.push(buildReviewerFromAgent(visualAgent, 'UI/UX、视觉语言、动效叙事、Baoyu 图文表达、Remotion 可生成资产', 'default'))
    }

    if (reviewers.length > 0) return reviewers.slice(0, 10)
  }

  return EXPERTS.map((expert) => {
    const agent = byId.get(expert.role)
    return agent
      ? buildReviewerFromAgent(agent, expert.focus, 'default')
      : {
          id: expert.role,
          name: expert.name,
          focus: expert.focus,
          systemPrompt: `你是一位${expert.name}，专精于${expert.focus}。`,
          temperature: 0.55,
          config: getLLMConfig(),
          source: 'default' as const,
          telegramConnected: false,
        }
  })
}

function buildReviewerFromAgent(
  agent: AgentDefinition,
  teamRole: string | undefined,
  source: 'team' | 'default',
): PRDReviewer {
  let config: LLMConfig
  try {
    config = resolveAgentConfig(agent.id)
  } catch {
    config = getLLMConfig()
  }

  const platformTargets = Array.isArray(agent.platformConfig?.targets) ? agent.platformConfig.targets : []
  return {
    id: agent.id,
    name: agent.name,
    focus: teamRole || agent.systemPromptSuffix || agent.name,
    systemPrompt: [
      `你是 ${agent.name}。`,
      agent.systemPromptSuffix,
      teamRole ? `你在当前 PRD 团队里的职责是：${teamRole}。` : '',
      agent.botToken || platformTargets.length > 0
        ? '你已经被配置为可连接外部聊天平台的 Agent；PRD 审阅时要保持你在 Telegram/IM 中的同一人格、职责和判断标准。'
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
    temperature: agent.temperature,
    config,
    source,
    telegramConnected: Boolean(agent.botToken || platformTargets.length > 0),
  }
}

/** 构建用户答案摘要 */
function buildAnswerSummary(answers: PRDAnswers): string {
  return Object.entries(answers)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n')
}

function buildReviewerSummary(reviewers: PRDReviewer[], teamName?: string): string {
  return [
    teamName ? `当前 PRD 团队：${teamName}` : '当前 PRD 团队：默认专家组',
    ...reviewers.map((reviewer, index) => {
      const platform = reviewer.telegramConnected ? '，已连接 Telegram/IM 角色身份' : ''
      return `${index + 1}. ${reviewer.name}：${reviewer.focus}${platform}`
    }),
  ].join('\n')
}

function emitReviewerDeclarations(
  reviewers: PRDReviewer[],
  teamName: string | undefined,
  onRoleDeclaration?: (msg: string) => void,
): void {
  if (!onRoleDeclaration) return
  reviewers.forEach((reviewer, index) => {
    onRoleDeclaration(
      `【${index + 1}. ${reviewer.name}】本轮身份：${reviewer.focus}；职责：先从自己的专业视角审阅 PRD，再给出可执行修改意见；团队：${teamName || '默认专家组'}。`,
    )
  })
}

/** 第一轮：骨架生成 */
async function generateSkeleton(
  config: LLMConfig,
  answers: PRDAnswers,
  reviewers: PRDReviewer[],
  teamName: string | undefined,
  uiStyleContext: UiMuseumPrdContext | null,
  onProgress?: (msg: string) => void,
): Promise<string> {
  onProgress?.('第一轮：生成 PRD 骨架...')
  const chapterList = CHAPTERS.map(c => `${c.id}. ${c.title}`).join('\n')

  const prompt = `你是一个顶级产品经理、全栈架构师与体验设计总监。根据以下项目信息，生成一份大师级 PRD（产品需求文档）。

项目信息：
${buildAnswerSummary(answers)}

统一项目目录：
${buildDesktopProjectPath(answers.projectName || '未命名项目')}

${uiStyleContext?.promptFragment || ''}

参与审阅的角色：
${buildReviewerSummary(reviewers, teamName)}

要求：
1. 严格按照以下 16 个章节结构组织
2. 每个章节内容详实、专业、可直接用于开发、设计、测试和 Agent 后续执行
3. 用户故事使用 "As a... I want... So that..." 格式
4. 功能清单按 P0/P1/P2 优先级分级
5. 包含具体的验收标准和数据指标
6. 必须吸收上述团队角色的职责分工，预留 Agent 协作、Telegram/IM 触达、定时任务和知识库闭环
7. 必须包含完整 UI/UX、视觉语言、动效节奏、组件状态、响应式布局、视觉验收标准
7b. 若存在「UI风格馆自动视觉输入」，必须直接吸收其中的风格、色彩、材质、组件规则和视觉验收标准，不要只泛泛说“现代化 UI”
8. 必须包含全技术栈、核心数据表、关键 API、错误码、降级、监控和测试方案
9. 小白能看懂，工程师能拆任务，设计师能出稿，产品能验收
10. 如果涉及生成项目目录、代码工程、素材目录或执行脚本，必须统一放在 Mac 桌面路径：${buildDesktopProjectPath(answers.projectName || '未命名项目')}；不要使用 /tmp、/Users/Shared 或无 emoji 的临时目录

章节结构：
${chapterList}

每个章节用 "## [章节号]. [章节名]" 作为标题。直接输出完整 PRD，不要有额外的开场白。`

  return await chatCompletion(config, [
    { role: 'system', content: '你是一个拥有 10 年经验的产品总监、全栈架构师和体验设计总监，擅长撰写事无巨细、可直接落地的 PRD。用中文输出。' },
    { role: 'user', content: prompt },
  ], 0.55, 9000)
}

/** 第二轮：专家审阅 */
async function expertReview(reviewers: PRDReviewer[], prd: string, onProgress?: (msg: string) => void): Promise<string> {
  const reviews: string[] = []

  for (const reviewer of reviewers) {
    onProgress?.(`第二轮：${reviewer.name}审阅中...`)
    try {
      const review = await chatCompletion(reviewer.config, [
        { role: 'system', content: `${reviewer.systemPrompt}\n\n你正在审阅一份 PRD。只列出需要修改的章节编号和具体改进内容，不要重复原文；意见必须专业、尖锐、可执行，必须覆盖你负责领域的落地细节和验收标准。` },
        { role: 'user', content: prd.slice(0, 6000) },
      ], reviewer.temperature || 0.5, 2200)
      reviews.push(`### ${reviewer.name}审阅意见\n${review}`)
    } catch { /* skip failed review */ }
  }

  return reviews.join('\n\n')
}

/** 第三轮：综合优化 */
async function synthesize(
  config: LLMConfig,
  prd: string,
  reviews: string,
  reviewers: PRDReviewer[],
  teamName: string | undefined,
  uiStyleContext: UiMuseumPrdContext | null,
  onProgress?: (msg: string) => void,
): Promise<string> {
  onProgress?.('第三轮：综合优化...')
  return await chatCompletion(config, [
    { role: 'system', content: '你是一个顶级产品总监兼系统架构型 PRD 作者。根据团队专家的审阅意见，重写这份 PRD，整合所有合理建议。保持 16 章节结构，内容必须详实、专业、可执行，并补齐 UI/UX、视觉动效、全技术栈、数据模型、API、测试与验收。若有 UI风格馆视觉输入，必须把它转成明确页面、组件、动效和验收标准。直接输出完整 PRD。' },
    { role: 'user', content: `团队角色：\n${buildReviewerSummary(reviewers, teamName)}\n\n${uiStyleContext?.promptFragment || ''}\n\n原始 PRD：\n${prd.slice(0, 4500)}\n\n专家审阅意见：\n${reviews.slice(0, 4500)}` },
  ], 0.48, 9000)
}

/** 第四轮：自检验证 */
async function selfCheck(config: LLMConfig, prd: string, onProgress?: (msg: string) => void): Promise<string> {
  onProgress?.('第四轮：自检验证...')
  const missing = CHAPTERS.filter(c => !prd.includes(c.title))
  if (missing.length === 0) return prd

  const missingPrompt = missing.map(c => `## ${c.id}. ${c.title}`).join('\n')
  const supplements = await chatCompletion(config, [
    { role: 'system', content: '以下是 PRD 中缺失的章节，请补充完整。每个章节都要详实。' },
    { role: 'user', content: `请补充以下缺失章节：\n${missingPrompt}\n\n项目背景参考：\n${prd.slice(0, 2000)}` },
  ], 0.6, 3000)

  return `${prd}\n\n${supplements}`
}

/** 解析 PRD 文本为章节列表 */
function parseChapters(prdText: string): PRDChapter[] {
  const chapters: PRDChapter[] = []
  const regex = /##\s*(\d+)\.\s*(.+?)(?=\n##\s*\d+\.|$)/gs
  let match
  while ((match = regex.exec(prdText)) !== null) {
    chapters.push({
      id: parseInt(match[1]),
      title: match[2].trim().split('\n')[0],
      content: match[2].trim(),
    })
  }
  // 如果正则没匹配到，把整个文本作为一节
  if (chapters.length === 0) {
    chapters.push({ id: 1, title: '完整 PRD', content: prdText })
  }
  return chapters
}

/** 生成完整 PRD — 4 轮流程 */
export async function generatePRD(
  answers: PRDAnswers,
  onProgress?: (msg: string) => void,
  options?: PRDGenerationOptions,
): Promise<PRDResult> {
  const config = getLLMConfig()
  const reviewers = await resolveReviewers(options)
  const teamName = options?.team?.name
  const uiStyleContext =
    options && 'uiStyleContext' in options
      ? options.uiStyleContext || null
      : buildUiMuseumPrdContext(buildAnswerSummary(answers))
  emitReviewerDeclarations(reviewers, teamName, options?.onRoleDeclaration)

  // 第一轮：骨架
  const skeleton = await generateSkeleton(config, answers, reviewers, teamName, uiStyleContext, onProgress)

  // 第二轮：专家审阅
  const reviews = await expertReview(reviewers, skeleton, onProgress)

  // 第三轮：综合优化
  const optimized = await synthesize(config, skeleton, reviews, reviewers, teamName, uiStyleContext, onProgress)

  // 第四轮：自检
  const final = await selfCheck(config, optimized, onProgress)

  return {
    chapters: parseChapters(final),
    totalRounds: 4,
    projectTitle: answers.projectName || '未命名项目',
    generatedAt: new Date().toISOString(),
    reviewerNames: reviewers.map((reviewer) => reviewer.name),
    teamName,
    projectPath: buildDesktopProjectPath(answers.projectName || '未命名项目'),
    uiStyleContext: uiStyleContext
      ? {
          styleNames: uiStyleContext.styleNames,
          reasoning: uiStyleContext.reasoning,
          savedFusionName: uiStyleContext.savedFusionName,
        }
      : undefined,
  }
}

/** 导出为 Markdown */
export function exportPRDAsMarkdown(result: PRDResult): string {
  const lines = [
    `# ${result.projectTitle} — 产品需求文档 (PRD)`,
    '',
    `> 生成时间：${new Date(result.generatedAt).toLocaleString('zh-CN')}`,
    `> 生成引擎：Openbasaka PRD Generator v1.1（团队 Agent 协审）`,
    result.teamName ? `> 协作团队：${result.teamName}` : '',
    result.projectPath ? `> 建议项目目录：${result.projectPath}` : '',
    result.reviewerNames.length > 0 ? `> 审阅角色：${result.reviewerNames.join(' / ')}` : '',
    result.uiStyleContext
      ? `> UI风格馆：${result.uiStyleContext.styleNames.join(' / ')}${result.uiStyleContext.savedFusionName ? `（${result.uiStyleContext.savedFusionName}）` : ''}`
      : '',
    result.uiStyleContext ? `> 视觉选择理由：${result.uiStyleContext.reasoning}` : '',
    '',
    '---',
    '',
  ]
  for (const chapter of result.chapters) {
    lines.push(chapter.content)
    lines.push('')
  }
  return lines.join('\n')
}
