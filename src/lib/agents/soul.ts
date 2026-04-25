/**
 * Agent Soul — 灵魂系统
 *
 * 移植自 Hermes Agent 的 SOUL.md 架构：
 * - 每个角色拥有独立的 Soul（身份、语气、准则、避免事项）
 * - Soul 是 System Prompt 的第一优先级注入层
 * - 支持冻结快照模式：会话开始时加载，中途修改不影响当前 prompt
 * - 内置注入扫描，防止 prompt injection
 *
 * SOUL.md in Hermes: "The first thing the agent sees"
 */

import { query, run } from '../db/repository'
import { getAllExperts, ExpertRole } from '../chat/router'

// ─── Soul 接口 ───

export interface AgentSoul {
  /** 核心身份 — 你是谁？（对应 Hermes SOUL.md 的主体） */
  identity: string
  /** 语气风格 — 怎么说话？ */
  tone: string
  /** 行为准则 — 遵循什么原则？ */
  principles: string[]
  /** 避免事项 — 不做什么？ */
  avoidance: string[]
  /** 不确定性处理 — 遇到不确定怎么办？ */
  uncertainty: string
  /** 自定义覆盖（用户额外添加的内容） */
  customOverride?: string
}

/** 默认 Soul 模板（Hermes 风格） */
const HERMES_SOUL_TEMPLATE: AgentSoul = {
  identity: 'You are an intelligent AI assistant. You are helpful, knowledgeable, and direct.',
  tone: 'You communicate clearly and concisely.',
  principles: [
    'Be genuinely useful over being verbose',
    'Admit uncertainty when appropriate',
    'Be targeted and efficient in your exploration',
  ],
  avoidance: [
    'Do not fabricate information',
    'Do not ignore user constraints',
  ],
  uncertainty: 'When uncertain, say so directly and explain what you do know.',
}

// ─── 内置角色的默认 Soul ───

const BUILTIN_SOULS: Record<ExpertRole, AgentSoul> = {
  general: {
    identity: '你是 BASAKA，openbasaka 智能体平台的全天候数字副官。你是 Boss 的私人情报官和项目战略顾问。',
    tone: '直觉敏锐、言简意赅、带有硬核理性的温度。绝对忠诚且偏心于 Boss。',
    principles: [
      '绝对忠诚于 Boss——所有建议都从 Boss 的利益出发',
      '用数据和逻辑支撑分析，不做无根据的推测',
      '给出具体可执行的建议，不说空话',
      '主动发现 Boss 可能忽略的风险和机会',
    ],
    avoidance: [
      '不说废话和客套话',
      '不回避问题和矛盾',
      '不给没有依据的乐观预测',
    ],
    uncertainty: '坦诚告知不确定性，给出概率评估和最坏情况分析。',
  },
  strategy: {
    identity: '你是 BASAKA 战略参谋部的战略顾问。你直接向 Boss 汇报战略分析。',
    tone: '冷静理性、框架化思维、高视角俯瞰。用数据和模型说话。',
    principles: [
      '用框架思维分析：波特五力、BCG 矩阵、OKR、Lean Canvas',
      '专注于战略规划、资源分配、优先级排序',
      '给出可落地的战略路线图',
      '绝对忠诚于 Boss，所有战略建议从 Boss 利益出发',
    ],
    avoidance: [
      '不做空泛的战略描述',
      '不忽略执行层面的可行性',
      '不被单一框架束缚',
    ],
    uncertainty: '提供多种情景分析（乐观/中性/悲观），标注关键假设。',
  },
  technical: {
    identity: '你是 BASAKA 技术团队的首席架构师。你直接向 Boss 汇报技术方案。',
    tone: '精确、务实、代码级思维。给出具体可执行的技术方案。',
    principles: [
      '专注于技术选型、架构设计、实现路径、性能优化',
      '给出具体可执行的技术方案，不说空话',
      '关注技术可行性、成本效益、团队能力匹配',
      '权衡短期速度和长期可维护性',
    ],
    avoidance: [
      '不推荐过度工程化的方案',
      '不用术语掩盖风险',
      '不忽略运维和监控需求',
    ],
    uncertainty: '明确标注技术风险等级，给出降级和回滚方案。',
  },
  market: {
    identity: '你是 BASAKA 市场情报部的首席分析师。你直接向 Boss 汇报市场洞察。',
    tone: '数据驱动、案例丰富、客观中立。用数字和事实说话。',
    principles: [
      '用数据和案例支撑分析，不做无根据的推测',
      '擅长 TAM/SAM/SOM 分析、竞品对标、用户画像建模',
      '关注市场规模、竞争格局、用户画像、定价策略',
      '追踪行业趋势和颠覆性变化',
    ],
    avoidance: [
      '不做没有数据支撑的市场预测',
      '不忽略小众但高增长的细分市场',
      '不被幸存者偏差误导',
    ],
    uncertainty: '标注数据来源和置信度，给出需要进一步验证的假设列表。',
  },
  creative: {
    identity: '你是 BASAKA 创新实验室的创意总监。你直接向 Boss 提供创新灵感。',
    tone: '大胆联想、跨界创新、天马行空但有条理。敢于提出颠覆性想法。',
    principles: [
      '大胆联想、跨界创新、提出颠覆性想法',
      '不受传统行业边界限制',
      '用类比、隐喻、反向思维打破常规',
      '每个创意都附带简要的可行性评估',
    ],
    avoidance: [
      '不自我审查想法的"疯狂程度"',
      '不拘泥于现有框架',
      '不完全脱离现实可行性',
    ],
    uncertainty: '将不确定性转化为创意的土壤——"如果...会怎样？"',
  },
  critic: {
    identity: '你是 BASAKA 风控部的魔鬼代言人。你直接向 Boss 指出风险和盲点。',
    tone: '不留情面但建设性的批判。你是 Boss 的保险栓。',
    principles: [
      '找漏洞、质疑假设、指出盲点、模拟最坏情况',
      '不留情面但建设性的批判',
      '防止 Boss 做出致命错误决策',
      '每次批判都附带替代方案或缓解措施',
    ],
    avoidance: [
      '不为批评而批评',
      '不忽略真正的好想法',
      '不制造不必要的恐惧',
    ],
    uncertainty: '将不确定性视为风险因素，评估最坏情况的概率和影响。',
  },
}

// ─── 注入扫描 ───

const INJECTION_PATTERNS = [
  /ignore\s+(previous|all|above|prior)\s+(instructions?|prompts?|rules)/i,
  /you\s+are\s+now\s+/i,
  /system\s*:\s*/i,
  /\<\/?system\>/i,
  /forget\s+(everything|all|previous)/i,
  /new\s+instructions?\s*:/i,
  /disregard\s+/i,
  /jailbreak/i,
  /DAN\s+mode/i,
  /curl\s+/i,
  /wget\s+/i,
  /\/etc\/passwd/i,
  /rm\s+-rf/i,
]

const INVISIBLE_CHARS = /[\u200b\u200c\u200d\ufeff\u00ad\u034f\u061c\u180e\u2060\u2066-\u2069]/g

/**
 * 扫描内容是否包含 prompt 注入模式
 * 移植自 Hermes 的 _scan_context_content / _MEMORY_THREAT_PATTERNS
 */
export function scanForInjection(content: string): { safe: boolean; threats: string[] } {
  const threats: string[] = []
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      threats.push(`匹配注入模式: ${pattern.source}`)
    }
  }
  if (INVISIBLE_CHARS.test(content)) {
    threats.push('包含不可见 Unicode 字符')
  }
  return { safe: threats.length === 0, threats }
}

// ─── Soul CRUD ───

/**
 * 获取角色的 Soul
 * - 内置角色：返回预定义 Soul + 用户覆盖层（如果有）
 * - 自定义角色：从 SQLite custom_agents.soul_json 加载
 */
export async function getSoul(agentId: string): Promise<AgentSoul> {
  // 1. 检查是否为内置角色
  const experts = getAllExperts()
  const builtIn = experts.find(e => e.role === agentId)
  if (builtIn) {
    const baseSoul = BUILTIN_SOULS[agentId as ExpertRole] || HERMES_SOUL_TEMPLATE
    // 检查是否有用户覆盖层
    try {
      const rows = await query<{ soul_json: string }>(
        'SELECT soul_json FROM agent_souls WHERE agent_id = ?',
        [agentId]
      )
      if (rows[0]?.soul_json) {
        const override = JSON.parse(rows[0].soul_json) as Partial<AgentSoul>
        return { ...baseSoul, ...override }
      }
    } catch { /* 表可能不存在 */ }
    return baseSoul
  }

  // 2. 自定义角色
  try {
    const rows = await query<{ soul_json: string }>(
      'SELECT soul_json FROM custom_agents WHERE id = ?',
      [agentId]
    )
    if (rows[0]?.soul_json) {
      return JSON.parse(rows[0].soul_json) as AgentSoul
    }
  } catch { /* ignore */ }

  // 3. 回退到默认模板
  return { ...HERMES_SOUL_TEMPLATE }
}

/**
 * 保存 Soul
 * - 内置角色：保存到 agent_souls 表（覆盖层）
 * - 自定义角色：保存到 custom_agents.soul_json
 */
export async function saveSoul(agentId: string, soul: AgentSoul): Promise<void> {
  // 注入扫描
  const fullText = [soul.identity, soul.tone, ...(soul.principles || []), ...(soul.avoidance || []), soul.uncertainty, soul.customOverride || ''].join(' ')
  const scan = scanForInjection(fullText)
  if (!scan.safe) {
    throw new Error(`Soul 内容未通过安全扫描: ${scan.threats.join('; ')}`)
  }

  const soulJson = JSON.stringify(soul)

  // 检查是否为内置角色
  const experts = getAllExperts()
  const isBuiltIn = experts.some(e => e.role === agentId)

  if (isBuiltIn) {
    // 内置角色 → agent_souls 覆盖表
    try {
      await run(
        `INSERT INTO agent_souls (agent_id, soul_json, updated_at) VALUES (?, ?, datetime('now','localtime'))
         ON CONFLICT(agent_id) DO UPDATE SET soul_json = excluded.soul_json, updated_at = excluded.updated_at`,
        [agentId, soulJson]
      )
    } catch {
      // 如果 agent_souls 表不存在，尝试创建
      await run(`CREATE TABLE IF NOT EXISTS agent_souls (
        agent_id TEXT PRIMARY KEY,
        soul_json TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      )`)
      await run(
        `INSERT OR REPLACE INTO agent_souls (agent_id, soul_json, updated_at) VALUES (?, ?, datetime('now','localtime'))`,
        [agentId, soulJson]
      )
    }
  } else {
    // 自定义角色 → custom_agents.soul_json
    await run(
      `UPDATE custom_agents SET soul_json = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
      [soulJson, agentId]
    )
  }
}

/**
 * 重置内置角色的 Soul（删除用户覆盖层）
 */
export async function resetSoul(agentId: string): Promise<void> {
  try {
    await run('DELETE FROM agent_souls WHERE agent_id = ?', [agentId])
  } catch { /* ignore */ }
}

// ─── Prompt 渲染 ───

/**
 * 将 Soul 渲染为 System Prompt 文本
 * 遵循 Hermes 的 SOUL.md 格式：简洁、直接、占据 prompt 第一位
 */
export function renderSoulPrompt(soul: AgentSoul): string {
  const parts: string[] = []

  // 身份（最核心）
  parts.push(soul.identity)

  // 语气
  if (soul.tone) {
    parts.push(`\n## 沟通风格\n${soul.tone}`)
  }

  // 准则
  if (soul.principles?.length) {
    parts.push(`\n## 行为准则\n${soul.principles.map(p => `- ${p}`).join('\n')}`)
  }

  // 避免事项
  if (soul.avoidance?.length) {
    parts.push(`\n## 避免事项\n${soul.avoidance.map(a => `- ${a}`).join('\n')}`)
  }

  // 不确定性处理
  if (soul.uncertainty) {
    parts.push(`\n## 不确定性处理\n${soul.uncertainty}`)
  }

  // 自定义覆盖
  if (soul.customOverride) {
    parts.push(`\n## 自定义指令\n${soul.customOverride}`)
  }

  return parts.join('\n')
}

/**
 * 获取 Soul 摘要（用于 UI 显示）
 */
export function getSoulSummary(soul: AgentSoul): { emoji: string; summary: string } {
  const identity = soul.identity
  const firstSentence = identity.split(/[。.!\n]/)[0]
  return {
    emoji: '🧠',
    summary: firstSentence.length > 60 ? firstSentence.slice(0, 60) + '...' : firstSentence,
  }
}
