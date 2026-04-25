/**
 * PRD Generator — 4 轮专家审阅 + 16 章节智能 PRD 生成
 *
 * 流程：
 * 1. 骨架生成 — LLM 生成 16 章节框架
 * 2. 专家审阅 — 6 位角色各自提出改进意见
 * 3. 综合优化 — 整合所有意见，输出完整版
 * 4. 自检验证 — 逐项确认 16 章节完整性
 */
import { chatCompletion, LLMConfig } from '../ai/provider'
import { getSetting } from '../db/store'
import { getDefaultConfig } from '../ai/provider'
import { PRDAnswers } from './questions'

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
}

const CHAPTERS = [
  { id: 1, title: '需求背景' },
  { id: 2, title: '产品定位' },
  { id: 3, title: '业务意图溯源' },
  { id: 4, title: '用户故事' },
  { id: 5, title: 'Agent 故事' },
  { id: 6, title: '用户旅程' },
  { id: 7, title: 'Agent 旅程与协作流' },
  { id: 8, title: '功能清单与详细说明' },
  { id: 9, title: '提示词设计策略' },
  { id: 10, title: '数据集需求' },
  { id: 11, title: '测试标准' },
  { id: 12, title: '异常处理与 AI 降级方案' },
  { id: 13, title: '数据隐私与合规性' },
  { id: 14, title: '技术可行性与风险预判' },
  { id: 15, title: '非功能性需求' },
  { id: 16, title: '附录' },
]

const EXPERTS = [
  { role: 'strategy', name: '策略师', focus: '商业模式可行性、市场定位、竞争差异化' },
  { role: 'technical', name: '技术师', focus: '技术栈选择、架构可行性、性能瓶颈、技术债风险' },
  { role: 'market', name: '市场师', focus: '目标市场规模、获客渠道、定价策略、GTM 路径' },
  { role: 'creative', name: '创意师', focus: '用户体验创新、差异化功能、增长黑客玩法' },
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

/** 构建用户答案摘要 */
function buildAnswerSummary(answers: PRDAnswers): string {
  return Object.entries(answers)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n')
}

/** 第一轮：骨架生成 */
async function generateSkeleton(config: LLMConfig, answers: PRDAnswers, onProgress?: (msg: string) => void): Promise<string> {
  onProgress?.('第一轮：生成 PRD 骨架...')
  const chapterList = CHAPTERS.map(c => `${c.id}. ${c.title}`).join('\n')

  const prompt = `你是一个顶级产品经理。根据以下项目信息，生成一份完整的 PRD（产品需求文档）。

项目信息：
${buildAnswerSummary(answers)}

要求：
1. 严格按照以下 16 个章节结构组织
2. 每个章节内容详实、专业、可直接用于开发指导
3. 用户故事使用 "As a... I want... So that..." 格式
4. 功能清单按 P0/P1/P2 优先级分级
5. 包含具体的验收标准和数据指标

章节结构：
${chapterList}

每个章节用 "## [章节号]. [章节名]" 作为标题。直接输出完整 PRD，不要有额外的开场白。`

  return await chatCompletion(config, [
    { role: 'system', content: '你是一个拥有 10 年经验的产品总监，擅长撰写事无巨细的 PRD。用中文输出。' },
    { role: 'user', content: prompt },
  ], 0.6, 8000)
}

/** 第二轮：专家审阅 */
async function expertReview(config: LLMConfig, prd: string, onProgress?: (msg: string) => void): Promise<string> {
  const reviews: string[] = []

  for (const expert of EXPERTS) {
    onProgress?.(`第二轮：${expert.name}审阅中...`)
    try {
      const review = await chatCompletion(config, [
        { role: 'system', content: `你是一位${expert.name}，专精于${expert.focus}。审阅这份 PRD 并给出具体的改进建议。只列出需要修改的章节编号和具体的改进内容，不要重复原文。` },
        { role: 'user', content: prd.slice(0, 6000) },
      ], 0.5, 2000)
      reviews.push(`### ${expert.name}审阅意见\n${review}`)
    } catch { /* skip failed review */ }
  }

  return reviews.join('\n\n')
}

/** 第三轮：综合优化 */
async function synthesize(config: LLMConfig, prd: string, reviews: string, onProgress?: (msg: string) => void): Promise<string> {
  onProgress?.('第三轮：综合优化...')
  return await chatCompletion(config, [
    { role: 'system', content: '你是一个顶级产品总监。根据多位专家的审阅意见，重写这份 PRD，整合所有合理的改进建议。保持 16 章节结构，内容更加详实专业。直接输出完整 PRD。' },
    { role: 'user', content: `原始 PRD：\n${prd.slice(0, 4000)}\n\n专家审阅意见：\n${reviews.slice(0, 3000)}` },
  ], 0.5, 8000)
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
): Promise<PRDResult> {
  const config = getLLMConfig()

  // 第一轮：骨架
  const skeleton = await generateSkeleton(config, answers, onProgress)

  // 第二轮：专家审阅
  const reviews = await expertReview(config, skeleton, onProgress)

  // 第三轮：综合优化
  const optimized = await synthesize(config, skeleton, reviews, onProgress)

  // 第四轮：自检
  const final = await selfCheck(config, optimized, onProgress)

  return {
    chapters: parseChapters(final),
    totalRounds: 4,
    projectTitle: answers.projectName || '未命名项目',
    generatedAt: new Date().toISOString(),
  }
}

/** 导出为 Markdown */
export function exportPRDAsMarkdown(result: PRDResult): string {
  const lines = [
    `# ${result.projectTitle} — 产品需求文档 (PRD)`,
    '',
    `> 生成时间：${new Date(result.generatedAt).toLocaleString('zh-CN')}`,
    `> 生成引擎：Openbasaka PRD Generator v1.0（4 轮专家审阅）`,
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
