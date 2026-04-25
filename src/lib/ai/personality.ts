/**
 * Personality System — 人格切换器（Hermes Agent 风格）
 *
 * 支持 AI Agent 在不同人格模式间切换：
 * - default: 标准 BASAKA 人格
 * - creative: 创意模式（更高 temperature，更发散）
 * - analyst: 分析模式（更严谨，更数据驱动）
 * - mentor: 导师模式（循循善诱，苏格拉底式提问）
 * - challenger: 挑战者模式（魔鬼代言人，极力反驳）
 * - custom: 用户自定义人格
 */
import { getSetting, setSetting } from '../db/store'

// ─── 接口 ───

export interface PersonalityMode {
  id: string
  name: string
  nameEn: string
  icon: string
  description: string
  systemPromptOverlay: string
  temperature: number
  isBuiltin: boolean
}

// ─── 内置人格 ───

const BUILTIN_PERSONALITIES: PersonalityMode[] = [
  {
    id: 'default',
    name: '标准模式',
    nameEn: 'Default',
    icon: '🎯',
    description: '平衡的 BASAKA 标准人格',
    systemPromptOverlay: '',
    temperature: 0.7,
    isBuiltin: true,
  },
  {
    id: 'creative',
    name: '创意模式',
    nameEn: 'Creative',
    icon: '🎨',
    description: '更发散的思维，更多类比和意外联想',
    systemPromptOverlay: `你现在处于创意模式。请：
- 用更多类比和隐喻来解释概念
- 主动提出非常规的解决方案
- 鼓励头脑风暴式的发散思维
- 不要过早否定任何想法`,
    temperature: 0.9,
    isBuiltin: true,
  },
  {
    id: 'analyst',
    name: '分析模式',
    nameEn: 'Analyst',
    icon: '📊',
    description: '严谨的数据驱动分析，结构化输出',
    systemPromptOverlay: `你现在处于分析模式。请：
- 所有观点必须有数据或逻辑支撑
- 使用结构化格式（表格、优劣对比、SWOT）
- 明确标注假设和不确定性
- 优先给出可量化的指标`,
    temperature: 0.4,
    isBuiltin: true,
  },
  {
    id: 'mentor',
    name: '导师模式',
    nameEn: 'Mentor',
    icon: '🧙',
    description: '苏格拉底式提问，引导而非直接告知',
    systemPromptOverlay: `你现在处于导师模式。请：
- 用提问引导思考，而非直接给出答案
- 逐步拆解复杂问题
- 鼓励自主思考和探索
- 在适当时候给出关键提示`,
    temperature: 0.6,
    isBuiltin: true,
  },
  {
    id: 'challenger',
    name: '挑战者模式',
    nameEn: 'Challenger',
    icon: '⚔️',
    description: '魔鬼代言人，极力寻找漏洞和反例',
    systemPromptOverlay: `你现在处于挑战者模式。请：
- 对每个观点寻找反面证据
- 指出计划中的潜在失败点
- 提出最坏情况的场景分析
- 不要附和——要批判性思考`,
    temperature: 0.5,
    isBuiltin: true,
  },
]

// ─── API ───

/** 获取当前活跃人格 */
export function getActivePersonality(): PersonalityMode {
  const activeId = getSetting('active_personality', 'default')
  return getPersonality(activeId) || BUILTIN_PERSONALITIES[0]
}

/** 获取指定人格 */
export function getPersonality(id: string): PersonalityMode | undefined {
  // 先查内置
  const builtin = BUILTIN_PERSONALITIES.find(p => p.id === id)
  if (builtin) return builtin

  // 查自定义
  const customJson = getSetting('custom_personalities', '[]')
  try {
    const customs = JSON.parse(customJson) as PersonalityMode[]
    return customs.find(p => p.id === id)
  } catch {
    return undefined
  }
}

/** 获取所有可用人格 */
export function getAllPersonalities(): PersonalityMode[] {
  const customs = getCustomPersonalities()
  return [...BUILTIN_PERSONALITIES, ...customs]
}

/** 切换人格 */
export function switchPersonality(id: string): PersonalityMode {
  const personality = getPersonality(id)
  if (!personality) throw new Error(`未知人格: ${id}`)
  setSetting('active_personality', id)
  return personality
}

/** 获取人格的系统提示词覆盖层 */
export function getPersonalityPromptOverlay(): string {
  const personality = getActivePersonality()
  if (!personality.systemPromptOverlay) return ''
  return `\n\n<personality-mode>\n${personality.systemPromptOverlay}\n</personality-mode>`
}

/** 获取人格的 temperature */
export function getPersonalityTemperature(): number {
  return getActivePersonality().temperature
}

// ─── 自定义人格管理 ───

/** 获取自定义人格列表 */
function getCustomPersonalities(): PersonalityMode[] {
  const json = getSetting('custom_personalities', '[]')
  try {
    return JSON.parse(json) as PersonalityMode[]
  } catch {
    return []
  }
}

/** 添加自定义人格 */
export function addCustomPersonality(personality: Omit<PersonalityMode, 'isBuiltin'>): void {
  const customs = getCustomPersonalities()
  customs.push({ ...personality, isBuiltin: false })
  setSetting('custom_personalities', JSON.stringify(customs))
}

/** 删除自定义人格 */
export function removeCustomPersonality(id: string): void {
  const customs = getCustomPersonalities().filter(p => p.id !== id)
  setSetting('custom_personalities', JSON.stringify(customs))
  // 如果删除的是当前激活人格，回退到默认
  if (getSetting('active_personality', 'default') === id) {
    setSetting('active_personality', 'default')
  }
}
