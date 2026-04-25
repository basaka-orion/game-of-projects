/**
 * Agent 模板系统 — 快速克隆和批量创建
 */
import { createCustomAgent, AgentDefinition } from './registry'
import type { AgentSoul } from './soul'

export interface AgentTemplate {
  id: string
  name: string
  description: string
  icon: string
  /** Soul 模板 */
  soulTemplate?: Partial<AgentSoul>
  /** 默认系统提示 */
  defaultSystemPrompt: string
  /** 默认技能 */
  defaultSkills: string[]
  /** 默认温度 */
  defaultTemperature: number
  /** 默认颜色 */
  defaultColor: string
  /** 分类标签 */
  tags: string[]
}

/** 内置模板库 */
export const BUILTIN_TEMPLATES: AgentTemplate[] = [
  {
    id: 'tpl_strategy',
    name: '战略顾问',
    description: '专注于商业战略、市场分析和竞争格局',
    icon: '🎯',
    defaultSystemPrompt: '你是一位资深战略顾问。你擅长商业分析、竞品研究、市场趋势判断和战略规划。回答时注重数据支撑和逻辑推演。',
    defaultSkills: ['strategy', 'market-analysis'],
    defaultTemperature: 0.5,
    defaultColor: '#00d4aa',
    tags: ['战略', '商业', '分析'],
  },
  {
    id: 'tpl_technical',
    name: '技术专家',
    description: '精通架构设计、代码审查和技术选型',
    icon: '💻',
    defaultSystemPrompt: '你是一位全栈技术专家。你精通系统架构设计、代码质量评估、技术选型和性能优化。回答时给出具体的技术方案和实现建议。',
    defaultSkills: ['architecture', 'code-review'],
    defaultTemperature: 0.3,
    defaultColor: '#3b82f6',
    tags: ['技术', '架构', '编程'],
  },
  {
    id: 'tpl_creative',
    name: '创意总监',
    description: '擅长创意策划、品牌定位和用户增长',
    icon: '🎨',
    defaultSystemPrompt: '你是一位创意总监。你擅长品牌策划、用户增长策略、内容创意和营销活动设计。回答时富有想象力，善于从跨界视角提出创新方案。',
    defaultSkills: ['creative', 'branding'],
    defaultTemperature: 0.9,
    defaultColor: '#8b5cf6',
    tags: ['创意', '品牌', '营销'],
  },
  {
    id: 'tpl_researcher',
    name: '研究员',
    description: '深度研究和知识整理专家',
    icon: '🔬',
    defaultSystemPrompt: '你是一位严谨的研究员。你擅长深度调研、信息验证、知识整理和学术分析。回答时注重信息来源、事实核查和逻辑链完整性。',
    defaultSkills: ['research', 'fact-check'],
    defaultTemperature: 0.4,
    defaultColor: '#f59e0b',
    tags: ['研究', '分析', '知识'],
  },
  {
    id: 'tpl_writer',
    name: '文案写作',
    description: '专业文案撰写和内容创作',
    icon: '✍️',
    defaultSystemPrompt: '你是一位资深文案。你擅长各类文案撰写：广告文案、产品描述、社交媒体内容、邮件和报告。回答时注重文字的感染力和说服力。',
    defaultSkills: ['writing', 'copywriting'],
    defaultTemperature: 0.7,
    defaultColor: '#ef4444',
    tags: ['写作', '文案', '内容'],
  },
]

/** 从模板创建 Agent */
export async function createFromTemplate(
  template: AgentTemplate,
  overrides?: Partial<Pick<AgentDefinition, 'name' | 'systemPromptSuffix' | 'temperature' | 'color'>>
): Promise<string> {
  return createCustomAgent({
    name: overrides?.name || template.name,
    nameEn: overrides?.name || template.name,
    icon: template.icon,
    systemPromptSuffix: overrides?.systemPromptSuffix || template.defaultSystemPrompt,
    temperature: overrides?.temperature ?? template.defaultTemperature,
    skills: template.defaultSkills,
    avatarStyle: 'default',
    color: overrides?.color || template.defaultColor,
  })
}

/** 批量创建（从模板列表） */
export async function batchCreateFromTemplates(
  templates: AgentTemplate[]
): Promise<string[]> {
  const ids: string[] = []
  for (const tpl of templates) {
    const id = await createFromTemplate(tpl)
    ids.push(id)
  }
  return ids
}
