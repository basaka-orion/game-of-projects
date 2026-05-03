/**
 * Team Engine — 团队会话执行引擎
 *
 * 根据团队类型执行不同的协作模式：
 * - permanent: 顺序执行，每个 Agent 引用前序输出
 * - agency: DAG 拓扑排序执行
 * - brainstorm: 轮次讨论 + 综合
 */
import {
  AgentCapabilityId,
  Team,
  TeamSession,
  TeamMessage,
  TeamTask,
  TeamAgent,
  TeamWorkflowType,
  TeamExecutionMode,
  TeamAction,
  TeamActionRisk,
  TeamActionToolId,
} from './types'
import { getTeamSession, saveTeamSession, createTeamSession, createTeamActions } from './store'
import { getAgentById } from '../agents/registry'
import { chatCompletion, LLMConfig, getDefaultConfig, resolveAgentConfig } from '../ai/provider'
import { getSetting } from '../db/store'
import { generateId } from '../db/schema'
import { retrieveAndInject } from '../chat/knowledge-middleware'
import { loadCognitiveProfile, renderCognitivePrompt } from '../boss/cognitive-profile'
import { recordAgentExecutionReceipt } from '../agents/execution-audit'
import type { ExecutionEvidenceRef } from '../agents/execution-receipt'
import { getSoul, renderSoulPrompt } from '../agents/soul'
import { buildUiMuseumPrdContext, type UiMuseumPrdContext } from '../ui-museum/context'

const TEAM_AGENT_MAX_TOKENS = 760
const TEAM_BRAINSTORM_MAX_TOKENS = 620
const TEAM_ARTIFACT_MAX_TOKENS = 7600
const TEAM_ACTION_MAX_TOKENS = 1800

const EXECUTABLE_ACTION_TOOLS: TeamActionToolId[] = [
  'terminal',
  'file_read',
  'file_write',
  'web_search',
  'web_extract',
  'vision_analyze',
  'desktop_screenshot',
  'desktop_control',
  'xcode_action',
  'execute_code',
]

interface TeamExecutionPolicy {
  label: string
  summary: string
  agentRule: string
  artifactRule: string
}

function getExecutionPolicy(mode: TeamExecutionMode = 'supervised'): TeamExecutionPolicy {
  switch (mode) {
    case 'advisory':
      return {
        label: '只出方案',
        summary: '只生成 PRD、调研、设计方案或人工执行清单；不得改文件、跑命令、控制桌面或声称已经完成真实操作。',
        agentRule:
          '本轮是只出方案模式。你只能提出判断、PRD、设计、风险和人工执行建议；不要输出会被解释为立即执行的命令，也不要声称已经修改文件、运行 Xcode 或操控桌面。',
        artifactRule:
          '最终产物必须保持为文档/方案交付。如确实需要后续落地，只能放入“可选执行清单”，并标注需要 Boss 切换到确认后执行或自动执行。',
      }
    case 'autonomous':
      return {
        label: '自动执行',
        summary:
          '允许低风险动作进入自动执行链路；涉及文件写入、Xcode、桌面控制、网络发布、密钥和删除操作时仍必须有风险分级与证据回传。',
        agentRule:
          '本轮是自动执行模式。你可以提出可机器执行的动作，但必须按低/中/高风险拆分，并说明每步需要的工具、输入、预期证据和失败回滚。',
        artifactRule:
          '最终产物必须包含“自动执行计划”：动作编号、负责人、工具、风险级别、预期证据、失败兜底。没有工具回执时，不得伪造已执行结果。',
      }
    case 'supervised':
    default:
      return {
        label: '确认后执行',
        summary: '可以拆出真实工具动作，但每一步都先进入待确认队列；未经确认不得改代码、跑命令或控制 Mac。',
        agentRule:
          '本轮是确认后执行模式。你可以提出具体文件、终端、Xcode、浏览器、截图或桌面控制动作，但必须写成待确认动作，不要声称已经执行。',
        artifactRule:
          '最终产物必须包含“待确认执行队列”：动作编号、负责人、工具/能力、参数摘要、风险级别、预期证据和需要 Boss 确认的原因。',
      }
  }
}

const VISUAL_MASTER_AGENT: TeamAgent = {
  agentId: 'visual',
  role: '视觉与交互设计总监',
  skills: ['remotion-motion-design', 'baoyu-visual-kit', 'openbasaka-visual-master'],
}

interface TeamWorkflowProfile {
  type: TeamWorkflowType
  label: string
  artifactLabel: string
  artifactType: NonNullable<TeamMessage['artifactType']>
  hostName: string
  defaultTags: string[]
  requiredCapabilities: AgentCapabilityId[]
  briefSections: string[]
  artifactStructure: string[]
  synthesisFocus: string
}

const WORKFLOW_PROFILES: Record<TeamWorkflowType, TeamWorkflowProfile> = {
  prd: {
    type: 'prd',
    label: 'PRD 设计',
    artifactLabel: 'PRD 成稿',
    artifactType: 'prd',
    hostName: 'PRD 主持人',
    defaultTags: ['PRD', '群策'],
    requiredCapabilities: ['prd', 'review', 'web-search'],
    briefSections: ['【核心判断】', '【冲突/补充】', '【PRD条款】'],
    synthesisFocus: '把多角色意见压缩、裁决、合并成一份大师级、可执行、可交给团队开工的 PRD。',
    artifactStructure: [
      '1. 项目一句话定位与北极星指标',
      '2. 背景、痛点、目标用户、核心使用场景',
      '3. 产品边界：P0 必做、P1 增强、P2 暂缓、不做清单',
      '4. 端到端用户旅程：首次进入、核心循环、异常、留存、退出',
      '5. 完整交互设计：页面结构、导航、关键组件、空状态、加载、失败、确认、快捷操作',
      '6. 视觉与动效设计：气质关键词、色彩/字体/栅格/密度、动效节奏、可生成视觉资产',
      '7. 全功能需求：按模块列出用户故事、规则、输入输出、状态流转、验收标准',
      '8. AI/模型策略：模型选择、本地/云端分工、提示词模板、成本、延迟、降级、事实校验',
      '9. 数据与记忆闭环：数据模型、标签、收藏、归档、知识库/大佬技能/记忆宫殿去向',
      '10. 全技术栈方案：客户端、后端、数据库、队列/定时、API、文件/对象存储、权限、安全、部署',
      '11. 关键接口与数据表草案：字段、请求/响应、错误码、幂等与审计',
      '12. 风险、隐私、合规、性能、可访问性与回滚方案',
      '13. 测试方案：单元、集成、E2E、视觉回归、可用性、小白验收、性能验收',
      '14. 里程碑与任务拆解：Day 1-2、Week 1、Week 2-4、V1',
      '15. 最终可交付物清单：设计稿、组件、API、测试、文档、可归档标签',
      '16. 建议标签',
    ],
  },
  research: {
    type: 'research',
    label: '深度调研',
    artifactLabel: '调研报告',
    artifactType: 'research-report',
    hostName: '调研总编',
    defaultTags: ['调研', '群策'],
    requiredCapabilities: ['web-search', 'review'],
    briefSections: ['【关键发现】', '【证据/来源需求】', '【判断与风险】'],
    synthesisFocus: '把多角色观点合并成带证据意识、可二次验证、可转入决策的调研报告。',
    artifactStructure: [
      '1. 研究问题与判断摘要',
      '2. 已知事实、待验证事实、关键不确定性',
      '3. 行业/技术/用户/竞争格局拆解',
      '4. 证据链与来源检查清单',
      '5. 可执行机会、风险、反例',
      '6. 下一步验证实验与信息缺口',
      '7. 建议标签',
    ],
  },
  build: {
    type: 'build',
    label: '产品落地',
    artifactLabel: '实现方案',
    artifactType: 'implementation-plan',
    hostName: '交付总控',
    defaultTags: ['实现', '群策'],
    requiredCapabilities: ['filesystem', 'terminal', 'codegen', 'review'],
    briefSections: ['【本角色结论】', '【交付物/操作】', '【依赖与风险】'],
    synthesisFocus: '把多角色观点收束成能直接进入代码实现、测试与验收的交付方案。',
    artifactStructure: [
      '1. 目标、范围与成功标准',
      '2. 当前系统假设与需要读取的文件/模块',
      '3. 架构方案与数据流',
      '4. 文件级改动计划',
      '5. 关键代码任务拆分与负责人',
      '6. 命令行、构建、测试、回滚步骤',
      '7. 风险、阻塞、降级与验收清单',
      '8. 下一步执行顺序',
      '9. 建议标签',
    ],
  },
  'xcode-mac-app': {
    type: 'xcode-mac-app',
    label: 'Mac App 自动落地',
    artifactLabel: 'Xcode 落地方案',
    artifactType: 'implementation-plan',
    hostName: 'Mac 交付总控',
    defaultTags: ['Mac应用', 'Xcode', 'Swift', '群策'],
    requiredCapabilities: ['filesystem', 'terminal', 'xcode', 'desktop-control', 'vision', 'codegen', 'review'],
    briefSections: ['【本角色判断】', '【Xcode/代码动作】', '【验证与兜底】'],
    synthesisFocus: '把产品、设计、Swift 实现、Xcode 运行、屏幕检查、失败兜底串成可执行的 Mac App 落地方案。',
    artifactStructure: [
      '1. Mac App 目标与本轮交付边界',
      '2. Swift/SwiftUI/AppKit 架构改动',
      '3. 文件级实现计划与模块责任',
      '4. 菜单栏、窗口、权限、Keychain、网络与本地存储方案',
      '5. 视觉/截图检查点：需要看的页面、状态、异常',
      '6. Xcode/命令行运行步骤：build、run、日志、失败定位',
      '7. Agent 工具授权清单：文件、终端、Xcode、桌面控制、看图',
      '8. 验收标准、回滚方案与下一步',
      '9. 建议标签',
    ],
  },
  'visual-review': {
    type: 'visual-review',
    label: '视觉审查',
    artifactLabel: '视觉审查报告',
    artifactType: 'visual-review',
    hostName: '视觉总监',
    defaultTags: ['视觉审查', '群策'],
    requiredCapabilities: ['vision', 'review'],
    briefSections: ['【视觉判断】', '【交互问题】', '【修改指令】'],
    synthesisFocus: '把角色观点合并成能直接指导 UI 修改、截图复核和视觉验收的审查报告。',
    artifactStructure: [
      '1. 总体气质与第一屏判断',
      '2. 信息架构、层级、密度、可读性',
      '3. 交互状态、空态、加载、错误、移动端/桌面端适配',
      '4. 视觉资产、颜色、字体、间距、动效建议',
      '5. 必改/建议/暂缓清单',
      '6. 截图复核点与验收标准',
      '7. 建议标签',
    ],
  },
  automation: {
    type: 'automation',
    label: '自动化工作流',
    artifactLabel: '自动化运行手册',
    artifactType: 'automation-runbook',
    hostName: '自动化编排官',
    defaultTags: ['自动化', '群策'],
    requiredCapabilities: ['terminal', 'browser', 'telegram', 'review'],
    briefSections: ['【流程判断】', '【触发/动作】', '【监控与兜底】'],
    synthesisFocus: '把需求拆成可触发、可监控、可恢复、可审计的自动化流程。',
    artifactStructure: [
      '1. 触发器、输入、输出与成功标准',
      '2. 工作流 DAG：步骤、依赖、角色、工具',
      '3. Telegram/Openbasaka/定时任务联动规则',
      '4. 状态机、幂等、重试、告警与人工接管',
      '5. 数据记录、审计、权限与安全边界',
      '6. 测试用例与上线顺序',
      '7. 建议标签',
    ],
  },
  custom: {
    type: 'custom',
    label: '自定义协作',
    artifactLabel: '群策方案',
    artifactType: 'workflow-plan',
    hostName: '群策主持人',
    defaultTags: ['群策', '自定义工作流'],
    requiredCapabilities: ['review'],
    briefSections: ['【关键判断】', '【建议动作】', '【风险/依赖】'],
    synthesisFocus: '按用户输入的真实目标收束成可执行方案，不强行套 PRD 模板。',
    artifactStructure: [
      '1. 目标与当前判断',
      '2. 团队分工与角色贡献',
      '3. 推荐路径、取舍与任务拆解',
      '4. 工具/能力需求',
      '5. 风险、阻塞、验收与下一步',
      '6. 建议标签',
    ],
  },
}

/** 获取全局 LLM 配置 */
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

/** 获取 Agent 的 LLM 配置 — 优先使用角色专属配置，无则回退全局 */
function getAgentLLMConfig(agentId?: string): LLMConfig {
  if (agentId) {
    try {
      return resolveAgentConfig(agentId)
    } catch {
      /* fallback to global */
    }
  }
  return getLLMConfig()
}

function describeLLMConfig(config: LLMConfig): string {
  return `${config.provider}/${config.model} @ ${config.baseUrl}`
}

function formatTeamAgentError(err: unknown, agentName: string, config: LLMConfig): string {
  const raw = err instanceof Error ? err.message : String(err)
  const source = describeLLMConfig(config)
  if (/fetch failed|failed to fetch|network|ECONN|ETIMEDOUT|timeout/i.test(raw)) {
    return `${agentName} 的模型连接失败（${source}）。请检查该角色在控制台里的模型地址、API Key 与网络连通性。原始错误：${raw}`
  }
  if (/API key not configured|API Key|401|unauthorized/i.test(raw)) {
    return `${agentName} 的模型鉴权失败（${source}）。请检查该角色或全局模型的 API Key。原始错误：${raw}`
  }
  return `${agentName} 调用失败（${source}）：${raw}`
}

function pushSystemTeamMessage(
  session: TeamSession,
  content: string,
  onProgress?: (msg: TeamMessage) => void,
  kind: TeamMessage['kind'] = 'progress',
): void {
  const msg: TeamMessage = {
    id: generateId(),
    agentId: 'team-engine',
    agentName: '群策引擎',
    role: 'system',
    content,
    timestamp: Date.now(),
    kind,
  }
  session.messages.push(msg)
  onProgress?.(msg)
}

function buildTeamProgressMessage(agentName: string, detail: string): string {
  return `${agentName} 正在处理：${detail}`
}

function shouldAttachVisualMaster(topic: string): boolean {
  return /prd|产品|应用|app|网站|工具|系统|界面|交互|视觉|设计|ui|ux|动效|体验|落地|开发/i.test(topic)
}

function ensureEssentialAgents(team: Team, topic: string): Team {
  if (!shouldAttachVisualMaster(topic)) return team
  if (team.agents.some((agent) => agent.agentId === 'visual')) return team
  return {
    ...team,
    agents: [...team.agents, VISUAL_MASTER_AGENT],
  }
}

function inferWorkflowType(topic: string): TeamWorkflowType {
  if (/xcode|swift|swiftui|mac app|macos|菜单栏|keychain/i.test(topic)) return 'xcode-mac-app'
  if (/敲代码|写代码|实现|开发|build|跑起来|编译|测试|修复/i.test(topic)) return 'build'
  if (/调研|研究|搜索|竞品|趋势|资料|来源|证据/i.test(topic)) return 'research'
  if (/视觉|ui|ux|截图|界面|动效|设计审查/i.test(topic)) return 'visual-review'
  if (/自动化|workflow|cron|定时|telegram|bot|联动|同步|触发/i.test(topic)) return 'automation'
  if (/prd|产品需求|需求文档/i.test(topic)) return 'prd'
  return 'custom'
}

function getWorkflowProfile(team: Team, topic: string): TeamWorkflowProfile {
  return WORKFLOW_PROFILES[team.config.workflowType || inferWorkflowType(topic)] || WORKFLOW_PROFILES.custom
}

function getEffectiveCapabilities(team: Team, profile: TeamWorkflowProfile): AgentCapabilityId[] {
  return Array.from(new Set([...(team.config.capabilities || []), ...profile.requiredCapabilities]))
}

function formatCapabilityLabel(capability: AgentCapabilityId): string {
  const labels: Record<AgentCapabilityId, string> = {
    vision: '看图/截图理解',
    'desktop-control': 'Mac 桌面控制',
    xcode: 'Xcode 构建运行',
    filesystem: '文件读写',
    terminal: '终端命令',
    browser: '浏览器操作',
    'web-search': '实时搜索',
    codegen: '代码实现',
    prd: 'PRD 设计',
    review: '审查验收',
    telegram: 'Telegram 联动',
  }
  return labels[capability]
}

type TeamRoleKey = 'general' | 'strategy' | 'technical' | 'market' | 'creative' | 'critic' | 'visual' | 'custom'

export interface TeamRoleMission {
  responsibility: string
  focus: string
  deliverable: string
  capabilityBridge: string
  boundary: string
}

function inferTeamRoleKey(agentId: string, agentName: string, teamRole: string): TeamRoleKey {
  const source = `${agentId} ${agentName} ${teamRole}`.toLowerCase()
  if (/visual|视觉|ui|ux|design/.test(source)) return 'visual'
  if (/strategy|战略|路线|顾问/.test(source)) return 'strategy'
  if (/technical|tech|架构|技术|工程|code|xcode|swift/.test(source)) return 'technical'
  if (/market|市场|用户|增长|竞品|商业/.test(source)) return 'market'
  if (/creative|创意|火花|创新|玩法/.test(source)) return 'creative'
  if (/critic|devil|魔鬼|风控|风险|反对/.test(source)) return 'critic'
  if (/general|basaka|副官|总控/.test(source)) return 'general'
  return 'custom'
}

function buildCapabilityBridge(
  roleKey: TeamRoleKey,
  workflow: TeamWorkflowProfile,
  capabilities: AgentCapabilityId[],
): string {
  const preferred: Record<TeamRoleKey, AgentCapabilityId[]> = {
    general: ['review', 'prd', 'web-search'],
    strategy: ['review', 'web-search', 'prd'],
    technical: ['codegen', 'filesystem', 'terminal', 'xcode', 'review'],
    market: ['web-search', 'review'],
    creative: ['vision', 'prd', 'review'],
    critic: ['review', 'vision', 'terminal'],
    visual: ['vision', 'review'],
    custom: workflow.requiredCapabilities,
  }
  const available = new Set(capabilities)
  const selected = (preferred[roleKey] || []).filter((capability) => available.has(capability))
  const fallback = selected.length > 0 ? selected : workflow.requiredCapabilities.filter((capability) => available.has(capability))
  return fallback.length > 0 ? fallback.map(formatCapabilityLabel).join('、') : '专业审查与协作收束'
}

function getWorkflowRoleMission(
  workflowType: TeamWorkflowType,
  roleKey: TeamRoleKey,
  agentName: string,
  teamRole: string,
  artifactLabel: string,
): Omit<TeamRoleMission, 'capabilityBridge'> {
  const generic: Record<TeamRoleKey, Omit<TeamRoleMission, 'capabilityBridge'>> = {
    general: {
      responsibility: '担任 Boss 视角的协作总控：锁定目标、压住跑题、把角色分歧转成可裁决的问题。',
      focus: '确认本轮到底要解决什么、哪些结论可以进入最终产物、哪些需要二次验证。',
      deliverable: `输出总控判断、优先级和需要并入「${artifactLabel}」的关键取舍。`,
      boundary: '不替专业角色写细节实现，不把所有观点混成平均意见。',
    },
    strategy: {
      responsibility: '负责战略取舍：判断方向、优先级、资源投入和长期收益是否成立。',
      focus: '找出最该先做的部分、最不该分散注意力的部分，以及成功判断标准。',
      deliverable: `输出战略优先级、取舍理由和「${artifactLabel}」必须体现的主线。`,
      boundary: '不下沉到代码细节，不用空泛愿景替代可执行判断。',
    },
    technical: {
      responsibility: '负责工程可行性：把想法拆成架构、模块、状态、性能、测试和失败兜底。',
      focus: '判断哪些设计能落地、需要哪些组件/文件/工具、风险在哪里。',
      deliverable: `输出技术落地路径、验证点和「${artifactLabel}」里的工程约束。`,
      boundary: '不做纯审美判断，不声称已执行未发生的代码或 Xcode 操作。',
    },
    market: {
      responsibility: '负责用户和市场视角：判断目标用户、差异化、传播卖点、留存和商业合理性。',
      focus: '看这个方案是否能被用户一眼理解、愿意尝试、愿意继续使用或传播。',
      deliverable: `输出用户价值、差异化卖点和「${artifactLabel}」里的市场风险。`,
      boundary: '不编造数据，不把个人偏好包装成市场结论。',
    },
    creative: {
      responsibility: '负责突破性创意：提出能让方案更有记忆点、更有情绪张力的可落地创意。',
      focus: '寻找主题表达、玩法惊喜、交互细节和可复用资产的创新点。',
      deliverable: `输出创意增强点、体验亮点和「${artifactLabel}」可采用的灵感清单。`,
      boundary: '不只给天马行空点子，必须说明如何落地或如何验证。',
    },
    critic: {
      responsibility: '负责反方审查：找漏洞、违和感、过度设计、误导用户、性能和执行风险。',
      focus: '指出最可能失败的地方，并给出必须修复或暂缓的理由。',
      deliverable: `输出必改清单、否决条件和「${artifactLabel}」里的风险警戒线。`,
      boundary: '不为了反对而反对，每个批评都要带修复方向。',
    },
    visual: {
      responsibility: '负责视觉、交互与动效导演：建立气质、层级、动效语法和截图验收标准。',
      focus: '把功能、情绪、主题、可读性、动效节奏和第一眼冲击统一成体验系统。',
      deliverable: `输出视觉语言、交互修改指令、动效/声效建议和「${artifactLabel}」验收标准。`,
      boundary: '不只说“好看/高级”，必须落到颜色、排版、组件、状态和动效细节。',
    },
    custom: {
      responsibility: `负责「${teamRole || agentName}」对应的专业视角，补足内置角色没有覆盖的判断。`,
      focus: '围绕自己的专长给出不可替代的判断、证据需求和执行建议。',
      deliverable: `输出可并入「${artifactLabel}」的专业结论和下一步动作。`,
      boundary: '不重复其他角色观点，不泛泛描述自己的能力。',
    },
  }

  const byWorkflow: Partial<Record<TeamWorkflowType, Partial<Record<TeamRoleKey, Omit<TeamRoleMission, 'capabilityBridge'>>>>> = {
    'visual-review': {
      general: {
        responsibility: '担任视觉审查总控：用 Boss 目标校准审查口径，决定哪些视觉问题影响最终体验。',
        focus: '判断星际斗地主是否真正“好玩、顶级、第一眼有吸引力”，并把分歧压成修改优先级。',
        deliverable: '输出整体视觉判定、P0/P1 修改优先级和截图复核口径。',
        boundary: '不重复每个角色的审美描述，只负责收束和裁决。',
      },
      strategy: {
        responsibility: '从产品定位和资源优先级审查视觉方案：判断星际穿越主题是否服务核心玩法和留存。',
        focus: '区分必须强化的主题卖点、可以暂缓的视觉野心、会拖慢落地的过度设计。',
        deliverable: '输出视觉策略取舍、核心卖点优先级和阶段性交付边界。',
        boundary: '不沉迷酷炫概念，必须保护主玩法和交付节奏。',
      },
      technical: {
        responsibility: '从实现和性能审查视觉/声效/动效：把效果拆成可实现组件、状态机和性能预算。',
        focus: '判断牌桌、牌面、动画、音效触发、粒子/光效是否能稳定运行和测试。',
        deliverable: '输出工程可行性、实现路径、性能风险、截图/动效验证点。',
        boundary: '不只说“能做/不能做”，要指出具体实现约束和兜底方案。',
      },
      market: {
        responsibility: '从用户吸引和传播审查视觉：判断截图、主题、卖相是否能让目标用户愿意点开和继续玩。',
        focus: '识别差异化记忆点、目标用户兴奋点、竞品同质化风险和传播素材价值。',
        deliverable: '输出用户感知、市场卖点、竞品风险和首屏/宣传图建议。',
        boundary: '不编造市场数据，只给可验证的用户与传播假设。',
      },
      creative: {
        responsibility: '负责星际主题创意增强：提出能强化沉浸感、玩法反馈、声画联动的可落地创意。',
        focus: '围绕虫洞、引力、跃迁、星舰、黑洞等主题，设计独特但不干扰规则理解的体验亮点。',
        deliverable: '输出 3-5 个视觉/声效/动效创意，以及每个创意的触发时机。',
        boundary: '不堆概念名词，创意必须能被技术和视觉角色接住。',
      },
      critic: {
        responsibility: '负责反方视觉验收：找出炫技压过玩法、信息不可读、动效过载、审美跑题等问题。',
        focus: '检查牌面识别、按钮可点性、节奏疲劳、低配机器性能和用户误操作风险。',
        deliverable: '输出必改问题、否决条件、失败截图特征和最低验收线。',
        boundary: '不做情绪化否定，每个问题都要给出修改方向。',
      },
      visual: {
        responsibility: '担任视觉与动效主设计：定义星际斗地主的画面气质、组件层级、动效语法和声画反馈。',
        focus: '把牌桌、牌面、按钮、背景、音效、胜负反馈和过场动效统一成可验收的设计系统。',
        deliverable: '输出色彩/字体/间距/组件/动效/声效修改指令与截图验收标准。',
        boundary: '不只给审美形容词，必须给可执行的设计参数和状态规范。',
      },
    },
    prd: {
      general: {
        responsibility: '担任 PRD 总控：确认产品目标、用户价值、边界和验收标准是否闭合。',
        focus: '压缩分歧，决定哪些需求进入 P0，哪些放入暂缓或不做。',
        deliverable: '输出 PRD 主线、范围裁决和最终验收口径。',
        boundary: '不把 PRD 写成愿景散文，必须服务落地。',
      },
      technical: {
        responsibility: '负责 PRD 的技术可实现性：补齐架构、数据、接口、权限、性能和测试约束。',
        focus: '把需求翻译成模块边界、状态流、接口和工程验收。',
        deliverable: '输出技术章节、数据/接口草案和实现风险。',
        boundary: '不提前过度工程化，不忽略关键失败路径。',
      },
      visual: {
        responsibility: '负责 PRD 的体验与视觉章节：定义页面结构、状态、动效和可用性验收。',
        focus: '让需求能转成界面和交互，而不是停留在功能清单。',
        deliverable: '输出 UI/UX、视觉气质、组件状态和截图验收标准。',
        boundary: '不只描述风格，必须描述用户如何完成任务。',
      },
    },
    build: {
      general: {
        responsibility: '担任交付总控：确认目标、范围、验收、风险和产物路径。',
        focus: '把角色意见收束成执行顺序，避免空转。',
        deliverable: '输出交付路线、优先级和完成定义。',
        boundary: '不声称未执行的真实操作已经完成。',
      },
      technical: {
        responsibility: '担任实现主程：拆文件、模块、命令、测试和修复路径。',
        focus: '找最小可运行版本和最可信验证链。',
        deliverable: '输出文件级改动计划、命令、测试与回滚方案。',
        boundary: '不跳过构建/测试证据。',
      },
    },
    'xcode-mac-app': {
      technical: {
        responsibility: '担任 Swift/macOS 交付架构师：负责 Xcode、SwiftUI/AppKit、权限、构建和运行验证。',
        focus: '把需求拆成工程目录、目标、文件、scheme、build/run 和失败修复。',
        deliverable: '输出 Xcode 落地动作、文件级改动、运行验证和兜底方案。',
        boundary: '不把缺少 Xcode 或构建失败包装成成功。',
      },
      visual: {
        responsibility: '担任 macOS 视觉体验负责人：负责菜单栏、窗口、状态、动效和截图验收。',
        focus: '确保 Mac App 第一屏、菜单栏交互、错误状态和动效符合产品气质。',
        deliverable: '输出 macOS UI 规范、截图复核点和视觉修正指令。',
        boundary: '不只按网页思路设计，必须遵守 macOS 使用习惯。',
      },
    },
    research: {
      market: {
        responsibility: '担任市场证据负责人：拆行业、竞品、用户、渠道和商业化假设。',
        focus: '区分已知事实、待查证事实和不可直接相信的推测。',
        deliverable: '输出证据需求、竞品对照和市场判断。',
        boundary: '不把模型常识当作实时事实。',
      },
      critic: {
        responsibility: '担任事实与反例审查：寻找来源缺口、反证和过度推断。',
        focus: '标记未经验证的结论和需要二次搜索的关键点。',
        deliverable: '输出风险、反例和查证清单。',
        boundary: '不为了完整而堆砌无关资料。',
      },
    },
    automation: {
      technical: {
        responsibility: '担任自动化架构师：负责触发器、状态机、幂等、重试、日志和失败恢复。',
        focus: '把 Telegram、Cron、Openbasaka 和工具动作串成可观测流程。',
        deliverable: '输出流程 DAG、接口、状态与监控兜底。',
        boundary: '不设计无法追踪、无法回滚的黑箱自动化。',
      },
      critic: {
        responsibility: '担任自动化安全审查：识别误触发、权限越界、重复执行和敏感操作风险。',
        focus: '明确哪些动作可自动，哪些必须接管或留证。',
        deliverable: '输出风险分级、确认边界和告警条件。',
        boundary: '不把高风险动作伪装成低风险便利操作。',
      },
    },
  }

  return byWorkflow[workflowType]?.[roleKey] || generic[roleKey]
}

function buildTeamRoleMission(params: {
  agentId: string
  agentName: string
  teamRole: string
  workflow: TeamWorkflowProfile
  capabilities: AgentCapabilityId[]
}): TeamRoleMission {
  const roleKey = inferTeamRoleKey(params.agentId, params.agentName, params.teamRole)
  const base = getWorkflowRoleMission(
    params.workflow.type,
    roleKey,
    params.agentName,
    params.teamRole,
    params.workflow.artifactLabel,
  )
  return {
    ...base,
    capabilityBridge: buildCapabilityBridge(roleKey, params.workflow, params.capabilities),
  }
}

export function describeTeamRoleMission(params: {
  agentId: string
  agentName: string
  teamRole: string
  workflowType?: TeamWorkflowType
  capabilities?: AgentCapabilityId[]
}): TeamRoleMission {
  const workflow = WORKFLOW_PROFILES[params.workflowType || 'custom'] || WORKFLOW_PROFILES.custom
  return buildTeamRoleMission({
    agentId: params.agentId,
    agentName: params.agentName,
    teamRole: params.teamRole,
    workflow,
    capabilities: params.capabilities || workflow.requiredCapabilities,
  })
}

function extractMarkdownSection(topic: string, title: string): string {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = topic.match(new RegExp(`(?:^|\\n)##\\s*${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i'))
  return match?.[1]?.trim() || ''
}

function cleanProjectSeedLine(line: string): string {
  return line
    .replace(/^[-*#\s\d.、]+/g, '')
    .replace(/^请用这个工作流(?:试跑当前任务|设计一个新的)?[：:]\s*/i, '')
    .replace(/^围绕当前工作流目标完整执行一次[。.]?$/i, '')
    .replace(/^工作流[：:]\s*/i, '')
    .replace(/^当前稳定目标[：:]?\s*/i, '')
    .trim()
}

function extractProjectSeed(topic: string, profile?: TeamWorkflowProfile): string {
  const bossInput = extractMarkdownSection(topic, 'Boss 本次输入')
  const stableGoal = extractMarkdownSection(topic, '稳定目标')
  const source = bossInput || stableGoal || topic
  const candidate = source
    .split('\n')
    .map(cleanProjectSeedLine)
    .find((line) => {
      if (!line) return false
      if (/^(硬性要求|必须|不要引用|每一步|如果|输出要求|执行规则)/.test(line)) return false
      if (/^\{\{.+\}\}$/.test(line)) return false
      return true
    })
  return candidate || profile?.label || 'Openbasaka-Project'
}

function buildDesktopProjectDir(topic: string, profile?: TeamWorkflowProfile): string {
  const seed = extractProjectSeed(topic, profile)
  const slug =
    seed
      .replace(/[^\p{L}\p{N}_-]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36) || 'Openbasaka-Project'
  return `/Users/apple/Desktop/🚀-${slug}`
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function shouldMoveIntoDesktopProject(path: string): boolean {
  if (!path.trim()) return true
  if (!path.startsWith('/')) return true
  if (path.startsWith('/tmp/') || path === '/tmp') return true
  if (path.startsWith('/Users/Shared/') || path === '/Users/Shared') return true
  return false
}

function rewriteIntoDesktopProject(path: string, desktopProjectDir: string, fallbackName: string): string {
  const name = path.split('/').filter(Boolean).pop() || fallbackName
  return `${desktopProjectDir}/${name}`
}

function enforceDesktopProjectParams(
  params: Record<string, unknown>,
  toolId: TeamActionToolId,
  desktopProjectDir: string,
): Record<string, unknown> {
  if (toolId === 'file_write' || toolId === 'file_read') {
    const path = String(params.path || '')
    if (shouldMoveIntoDesktopProject(path)) {
      return { ...params, path: rewriteIntoDesktopProject(path, desktopProjectDir, 'README.md') }
    }
  }

  if (toolId === 'xcode_action') {
    const projectPath = String(params.projectPath || '')
    if (shouldMoveIntoDesktopProject(projectPath)) {
      return {
        ...params,
        projectPath: projectPath ? rewriteIntoDesktopProject(projectPath, desktopProjectDir, '') : desktopProjectDir,
      }
    }
  }

  if (toolId === 'terminal') {
    const command = String(params.command || '')
      .replace(/\/tmp\/[^\s"'`]+/g, desktopProjectDir)
      .replace(/\/Users\/Shared\/[^\s"'`]+/g, desktopProjectDir)
    return { ...params, command }
  }

  return params
}

async function pushTeamRoleDeclarations(params: {
  team: Team
  session: TeamSession
  topic: string
  workflow: TeamWorkflowProfile
  capabilities: AgentCapabilityId[]
  onProgress?: (msg: TeamMessage) => void
}): Promise<void> {
  for (const [index, teamAgent] of params.team.agents.entries()) {
    const agent = await getAgentById(teamAgent.agentId)
    const agentName = agent?.name || teamAgent.role
    const mission = buildTeamRoleMission({
      agentId: teamAgent.agentId,
      agentName,
      teamRole: teamAgent.role,
      workflow: params.workflow,
      capabilities: params.capabilities,
    })
    const msg: TeamMessage = {
      id: generateId(),
      agentId: teamAgent.agentId,
      agentName,
      role: 'system',
      content: [
        `【角色开工宣言 ${index + 1}】`,
        `身份：${agentName}`,
        `本轮职责：${mission.responsibility}`,
        `独占任务：${mission.focus}`,
        `交付物：${mission.deliverable}`,
        `能力衔接：${mission.capabilityBridge}。`,
        `边界：${mission.boundary}`,
        `任务焦点：${params.topic.slice(0, 120)}`,
      ].join('\n'),
      timestamp: Date.now(),
      kind: 'progress',
    }
    params.session.messages.push(msg)
    params.onProgress?.(msg)
  }
}

async function buildTeamAgentPrompt(params: {
  agentId: string
  agentName: string
  teamRole: string
  roleBrief?: string
  roleMission?: TeamRoleMission
  mode: 'sequential' | 'agency' | 'brainstorm'
  workflow: TeamWorkflowProfile
  capabilities: AgentCapabilityId[]
  executionMode: TeamExecutionMode
  uiStyleContext?: UiMuseumPrdContext | null
}): Promise<string> {
  let soulPrompt = ''
  try {
    soulPrompt = renderSoulPrompt(await getSoul(params.agentId))
  } catch {
    /* fallback below */
  }

  const fallbackIdentity = `你是 ${params.agentName}。${params.roleBrief || params.teamRole || ''}`
  const capabilityLine = params.capabilities.length
    ? `- 本团队可调用/需要衔接的能力：${params.capabilities.map(formatCapabilityLabel).join('、')}。你要明确指出自己需要哪些能力输入或输出。`
    : ''
  const executionPolicy = getExecutionPolicy(params.executionMode)
  const collaborationRules = [
    '## 群策协作协议',
    `- 你当前只代表「${params.agentName}」发言，不要冒充其他角色，也不要替全队下最终结论。`,
    '- 你的回答必须服务本次任务，不要泛泛介绍能力。',
    `- 本次工作流是「${params.workflow.label}」，你输出的是给「${params.workflow.hostName}」使用的角色短评，不是完整文章。`,
    `- 执行权限：${executionPolicy.label}。${executionPolicy.agentRule}`,
    capabilityLine,
    '- 严格控制在 260-460 个中文字符内；不要写长篇章节、不要写客套话、不要问“是否需要继续”。',
    `- 固定使用三段：${params.workflow.briefSections.map((section) => `\`${section}\``).join('、')}。`,
    params.mode === 'sequential'
      ? '- 如果已有前序观点，明确指出你同意、反对或补充哪一点。'
      : '- 和其他角色形成互补，不重复空泛观点。',
  ].join('\n')

  const roleMission = params.roleMission
    ? [
        '## 本次角色任务',
        `- 本轮职责：${params.roleMission.responsibility}`,
        `- 独占任务：${params.roleMission.focus}`,
        `- 交付物：${params.roleMission.deliverable}`,
        `- 能力衔接：${params.roleMission.capabilityBridge}`,
        `- 边界：${params.roleMission.boundary}`,
      ].join('\n')
    : ''
  const roleBrief = params.roleBrief ? `## 角色长期设定\n${params.roleBrief}` : ''
  const uiStylePrompt = params.uiStyleContext
    ? [
        params.uiStyleContext.promptFragment,
        '你在角色短评中要把这份视觉输入转成当前工作流可用的页面、组件、动效或验收建议；不要只说“参考 UI 风格馆”。',
      ].join('\n')
    : ''
  return [soulPrompt || fallbackIdentity, roleMission, roleBrief, uiStylePrompt, collaborationRules].filter(Boolean).join('\n\n')
}

function buildTeamEvidenceRefs(knowledgeCtx: string, cognitivePrompt: string, team: Team): ExecutionEvidenceRef[] {
  const refs: ExecutionEvidenceRef[] = []
  if (team.projectId) refs.push({ kind: 'project', id: team.projectId, title: team.name })
  if (knowledgeCtx) refs.push({ kind: 'knowledge', title: 'Knowledge middleware quick context' })
  if (cognitivePrompt) refs.push({ kind: 'memory', title: 'Boss cognitive profile' })
  return refs
}

function recordTeamAgentExecution(params: {
  team: Team
  session: TeamSession
  agentId: string
  agentName: string
  input: string
  output: string
  status: 'completed' | 'failed'
  evidenceRefs: ExecutionEvidenceRef[]
  durationMs: number
  round?: number
}) {
  recordAgentExecutionReceipt({
    agentId: params.agentId,
    subject: `${params.team.name}｜${params.agentName}`,
    input: params.input,
    output: params.output,
    status: params.status,
    tools: [{ id: 'team-engine', label: 'Team Engine', risk: 'low', status: params.status }],
    evidenceRefs: params.evidenceRefs,
    projectIds: params.team.projectId ? [params.team.projectId] : [],
    source: { kind: 'agent', sourceId: params.session.id, title: params.team.name },
    durationMs: params.durationMs,
    entities: [
      params.team.id,
      params.session.id,
      params.team.teamType,
      params.round ? `round-${params.round}` : '',
    ].filter(Boolean),
  }).catch(() => {})
}

function suggestArtifactTags(team: Team, topic: string, profile: TeamWorkflowProfile): string[] {
  const tags = new Set<string>([...profile.defaultTags, profile.label, team.name])
  if (/mac|macos|桌面|壁纸/i.test(topic)) tags.add('Mac应用')
  if (/壁纸|wallpaper/i.test(topic)) tags.add('壁纸')
  if (/ai|大模型|模型|agent/i.test(topic)) tags.add('AI产品')
  if (/telegram|bot|机器人/i.test(topic)) tags.add('Agent Bot')
  if (/xcode|swift|swiftui/i.test(topic)) tags.add('Swift')
  if (/代码|开发|实现|build|跑起来/i.test(topic)) tags.add('工程落地')
  return [...tags].slice(0, 8)
}

function collectTeamBriefs(session: TeamSession): string {
  return session.messages
    .filter((msg) => msg.role === 'assistant' && msg.kind !== 'artifact')
    .map((msg) => `### ${msg.agentName}${msg.round ? ` / Round ${msg.round}` : ''}\n${msg.content}`)
    .join('\n\n')
}

function buildDesktopArtifactMarkdown(params: {
  team: Team
  session: TeamSession
  topic: string
  profile: TeamWorkflowProfile
  projectRoot: string
}): string {
  const roleDeclarations = params.session.messages
    .filter((msg) => msg.content.startsWith('【角色开工宣言'))
    .map((msg) => `### ${msg.agentName}\n${msg.content}`)
    .join('\n\n')
  return [
    `# ${params.session.title || `${params.profile.label}｜${params.team.name}`}`,
    '',
    `> 团队：${params.team.name}`,
    `> 工作流：${params.profile.label}`,
    `> 桌面项目目录：${params.projectRoot}`,
    `> 会话：${params.session.id}`,
    `> 时间：${new Date().toLocaleString('zh-CN')}`,
    '',
    '---',
    '',
    '## 角色职责与任务',
    '',
    roleDeclarations || '本轮未记录角色开工宣言。',
    '',
    '## 原始议题',
    '',
    params.topic,
    '',
    '## 最终产物',
    '',
    params.session.summary || '本轮没有生成可用产物。',
    '',
  ].join('\n')
}

async function saveTeamArtifactToDesktop(params: {
  team: Team
  session: TeamSession
  topic: string
  profile: TeamWorkflowProfile
  onProgress?: (msg: TeamMessage) => void
}): Promise<void> {
  const projectRoot = buildDesktopProjectDir(params.topic, params.profile)
  const fileName = `📄-${params.profile.artifactLabel}.md`
  const filePath = `${projectRoot}/${fileName}`
  const electronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : null
  if (!electronAPI?.writeFile) {
    pushSystemTeamMessage(
      params.session,
      `桌面产物落盘失败：Electron 文件写入能力不可用。目标路径：${filePath}`,
      params.onProgress,
      'error',
    )
    return
  }

  const result = await electronAPI.writeFile(
    filePath,
    buildDesktopArtifactMarkdown({
      team: params.team,
      session: params.session,
      topic: params.topic,
      profile: params.profile,
      projectRoot,
    }),
  )
  if (result?.success) {
    pushSystemTeamMessage(
      params.session,
      `桌面产物已落盘：${filePath}`,
      params.onProgress,
    )
    return
  }

  pushSystemTeamMessage(
    params.session,
    `桌面产物落盘失败：${result?.error || '未知错误'}。目标路径：${filePath}`,
    params.onProgress,
    'error',
  )
}

function extractJsonArray(raw: string): unknown[] {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim() || trimmed
  const start = candidate.indexOf('[')
  const end = candidate.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return []
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeActionTool(toolId: unknown, capability: AgentCapabilityId): TeamActionToolId {
  const proposed = String(toolId || '')
  if ((EXECUTABLE_ACTION_TOOLS as string[]).includes(proposed)) return proposed as TeamActionToolId
  if (capability === 'xcode') return 'xcode_action'
  if (capability === 'desktop-control') return 'desktop_control'
  if (capability === 'vision') return 'desktop_screenshot'
  if (capability === 'terminal') return 'terminal'
  if (capability === 'filesystem') return 'file_read'
  if (capability === 'web-search') return 'web_search'
  return 'manual_review'
}

function normalizeActionCapability(value: unknown, capabilities: AgentCapabilityId[]): AgentCapabilityId {
  const capability = String(value || '') as AgentCapabilityId
  if (capabilities.includes(capability)) return capability
  return capabilities[0] || 'review'
}

function normalizeActionRisk(value: unknown, toolId: TeamActionToolId): TeamActionRisk {
  const risk = String(value || '').toLowerCase()
  if (risk === 'low' || risk === 'medium' || risk === 'high') return risk
  if (
    toolId === 'file_write' ||
    toolId === 'terminal' ||
    toolId === 'execute_code' ||
    toolId === 'xcode_action' ||
    toolId === 'desktop_control'
  )
    return 'high'
  if (toolId === 'vision_analyze' || toolId === 'desktop_screenshot' || toolId === 'web_extract') return 'medium'
  return 'low'
}

function normalizeActionParams(value: unknown, toolId: TeamActionToolId): Record<string, unknown> {
  const params = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  switch (toolId) {
    case 'terminal':
      return { command: String(params.command || ''), timeout: Number(params.timeout || 30000) }
    case 'file_read':
      return { path: String(params.path || ''), encoding: String(params.encoding || 'utf-8') }
    case 'file_write':
      return { path: String(params.path || ''), content: String(params.content || '') }
    case 'web_search':
      return { query: String(params.query || ''), max_results: Number(params.max_results || 5) }
    case 'web_extract':
      return { url: String(params.url || ''), format: String(params.format || 'text') }
    case 'vision_analyze':
      return { image: String(params.image || ''), prompt: String(params.prompt || '请分析这张截图/图片') }
    case 'desktop_screenshot':
      return {
        includeOcr: params.includeOcr !== false,
        fileBaseName: String(params.fileBaseName || 'team-observation'),
        ...(params.region ? { region: params.region } : {}),
      }
    case 'desktop_control':
      return {
        action: String(params.action || 'activate_app'),
        appName: String(params.appName || ''),
        path: String(params.path || ''),
        url: String(params.url || ''),
        text: String(params.text || ''),
        key: String(params.key || ''),
        modifiers: Array.isArray(params.modifiers) ? params.modifiers : [],
        x: Number(params.x || 0),
        y: Number(params.y || 0),
        menuPath: Array.isArray(params.menuPath) ? params.menuPath : [],
      }
    case 'xcode_action':
      return {
        action: String(params.action || 'list'),
        projectPath: String(params.projectPath || ''),
        scheme: String(params.scheme || ''),
        destination: String(params.destination || ''),
        configuration: String(params.configuration || ''),
        sdk: String(params.sdk || ''),
        simctlKind: String(params.simctlKind || ''),
        timeout: Number(params.timeout || 120000),
      }
    case 'execute_code':
      return {
        code: String(params.code || ''),
        language: String(params.language || 'python'),
        timeout: Number(params.timeout || 60000),
      }
    default:
      return params
  }
}

function actionHasRequiredParams(action: Pick<TeamAction, 'toolId' | 'params'>): boolean {
  switch (action.toolId) {
    case 'terminal':
      return Boolean(String(action.params.command || '').trim())
    case 'file_read':
    case 'file_write':
      return Boolean(String(action.params.path || '').trim())
    case 'web_search':
      return Boolean(String(action.params.query || '').trim())
    case 'web_extract':
      return Boolean(String(action.params.url || '').trim())
    case 'vision_analyze':
      return Boolean(String(action.params.image || '').trim())
    case 'desktop_screenshot':
      return true
    case 'desktop_control':
      return Boolean(String(action.params.action || '').trim())
    case 'xcode_action':
      return Boolean(String(action.params.action || '').trim())
    case 'execute_code':
      return Boolean(String(action.params.code || '').trim())
    case 'manual_review':
      return true
  }
}

function shouldRequireActionApproval(
  executionMode: TeamExecutionMode,
  risk: TeamActionRisk,
  toolId: TeamActionToolId,
  params: Record<string, unknown>,
): boolean {
  if (executionMode === 'advisory') return true
  if (toolId === 'manual_review') return true
  if (risk === 'high') return true
  if (toolId === 'desktop_control') return true
  const paramsText = JSON.stringify(params || {}).toLowerCase()
  if (/\bsudo\b|password|passwd|密码|keychain|delete|remove|rm\s+-rf|killall/i.test(paramsText)) return true
  return false
}

function fallbackActions(params: {
  team: Team
  session: TeamSession
  topic: string
  capabilities: AgentCapabilityId[]
  executionMode: TeamExecutionMode
  projectRoot: string
}): Array<Omit<TeamAction, 'id' | 'createdAt' | 'updatedAt'>> {
  if (params.executionMode === 'advisory') return []
  const base = {
    sessionId: params.session.id,
    teamId: params.team.id,
    ownerAgentId: 'team-engine',
    ownerAgentName: '执行总控',
    status: 'proposed' as const,
  }
	if (params.capabilities.includes('xcode')) {
	  return [
	    {
	      ...base,
	      capability: 'terminal',
	      toolId: 'terminal',
	      title: '创建桌面项目目录',
	      description: '所有项目生成物统一落在 Mac 桌面醒目 emoji 目录，避免散落到 /tmp 或共享目录。',
	      params: { command: `mkdir -p ${shellQuote(params.projectRoot)}`, timeout: 30000 },
	      risk: 'low',
	      requiresApproval: shouldRequireActionApproval(params.executionMode, 'low', 'terminal', {
	        command: `mkdir -p ${shellQuote(params.projectRoot)}`,
	        timeout: 30000,
	      }),
	    },
	    {
	      ...base,
	      capability: 'filesystem',
	      toolId: 'file_write',
	      title: '写入本轮项目任务说明',
	      description: '把 Boss 当前任务落成项目目录里的可复用说明，避免只停留在聊天结果里。',
	      params: {
	        path: `${params.projectRoot}/PROJECT-BRIEF.md`,
	        content: `# Openbasaka 自动落地任务\n\n## 当前任务\n\n${params.topic}\n`,
	      },
	      risk: 'medium',
	      requiresApproval: shouldRequireActionApproval(params.executionMode, 'medium', 'file_write', {
	        path: `${params.projectRoot}/PROJECT-BRIEF.md`,
	      }),
	    },
	    {
	      ...base,
	      capability: 'xcode',
	      toolId: 'xcode_action',
	      title: '检查 Xcode 工程与构建环境',
	      description: '确认当前目录、Xcode/Swift 工具链和可构建目标，为后续自动落地建立证据。',
	      params: { action: 'list', projectPath: params.projectRoot, timeout: 60000 },
	      risk: 'medium',
	      requiresApproval: shouldRequireActionApproval(params.executionMode, 'medium', 'xcode_action', {
	        action: 'list',
	        projectPath: params.projectRoot,
	        timeout: 60000,
	      }),
	    },
	    {
	      ...base,
	      capability: 'vision',
	      toolId: 'desktop_screenshot',
	      title: '截取当前桌面状态',
	      description: '获取当前 Mac 屏幕与 OCR 文本，作为后续 UI/Xcode 验收证据。',
	      params: { includeOcr: true, fileBaseName: 'xcode-observation' },
	      risk: 'medium',
	      requiresApproval: shouldRequireActionApproval(params.executionMode, 'medium', 'desktop_screenshot', {
	        includeOcr: true,
	        fileBaseName: 'xcode-observation',
	      }),
	    },
	    {
	      ...base,
	      capability: 'desktop-control',
	      toolId: 'desktop_control',
	      title: '激活 Xcode 或目标应用',
	      description: '把目标应用带到前台，为后续人工确认、截图观察或菜单操作做准备。',
	      params: { action: 'activate_app', appName: 'Xcode' },
	      risk: 'high',
	      requiresApproval: true,
	    },
	  ]
	}
  if (params.capabilities.includes('filesystem')) {
    return [
      {
        ...base,
        capability: 'filesystem',
        toolId: 'terminal',
        title: '创建并读取桌面项目目录',
        description: '在 Mac 桌面创建醒目 emoji 项目目录，并列出目录结构给后续代码落地和验证使用。',
        params: {
          command: `mkdir -p ${shellQuote(params.projectRoot)}; find ${shellQuote(params.projectRoot)} -maxdepth 2 -type f | head -80`,
          timeout: 30000,
        },
        risk: 'low',
        requiresApproval: shouldRequireActionApproval(params.executionMode, 'low', 'terminal', {
          command: `mkdir -p ${shellQuote(params.projectRoot)}; find ${shellQuote(params.projectRoot)} -maxdepth 2 -type f | head -80`,
          timeout: 30000,
        }),
      },
      {
        ...base,
        capability: 'filesystem',
        toolId: 'file_write',
        title: '写入本轮项目任务说明',
        description: '把 Boss 当前任务落成项目目录里的可复用说明，避免只停留在聊天结果里。',
        params: {
          path: `${params.projectRoot}/PROJECT-BRIEF.md`,
          content: `# Openbasaka 自动落地任务\n\n## 当前任务\n\n${params.topic}\n`,
        },
        risk: 'medium',
        requiresApproval: shouldRequireActionApproval(params.executionMode, 'medium', 'file_write', {
          path: `${params.projectRoot}/PROJECT-BRIEF.md`,
        }),
      },
    ]
  }
  return [
    {
      ...base,
      capability: 'review',
      toolId: 'manual_review',
      title: '人工确认下一步',
      description: `围绕「${params.topic.slice(0, 80)}」确认是否进入真实执行。`,
      params: {},
      risk: 'low',
      requiresApproval: true,
    },
  ]
}

async function buildAndSaveTeamActions(params: {
  team: Team
  session: TeamSession
  topic: string
  profile: TeamWorkflowProfile
  capabilities: AgentCapabilityId[]
  onProgress?: (msg: TeamMessage) => void
}): Promise<void> {
  const executionMode = params.team.config.executionMode || 'supervised'
  if (executionMode === 'advisory') return

  const policy = getExecutionPolicy(executionMode)
  const projectRoot = buildDesktopProjectDir(params.topic, params.profile)
  pushSystemTeamMessage(
    params.session,
    `执行总控正在把「${params.profile.artifactLabel}」转成可审计动作队列：${policy.label}。项目生成根目录：${projectRoot}`,
    params.onProgress,
  )

  const allowedTools = [...EXECUTABLE_ACTION_TOOLS, 'manual_review'].join(', ')
  const prompt = [
    '你是 Openbasaka 群策执行总控。请把最终产物拆成 1-6 个结构化动作。',
    `当前执行权限：${policy.label}。${policy.summary}`,
    `可用能力：${params.capabilities.map(formatCapabilityLabel).join('、')}`,
    `允许 toolId：${allowedTools}`,
    '只返回 JSON 数组，不要 Markdown，不要解释。',
    '字段：ownerAgentId, ownerAgentName, capability, toolId, title, description, params, risk。',
    'risk 只能是 low/medium/high。文件写入、终端、代码执行、Xcode、桌面控制默认 medium 或 high。',
    'desktop_screenshot 参数形如 {"includeOcr":true,"fileBaseName":"ui-check"}，用于观察当前屏幕状态。',
    'desktop_control 参数形如 {"action":"activate_app","appName":"Xcode"} 或 {"action":"shortcut","appName":"Xcode","key":"b","modifiers":["command"]}。只能用于受限模板，必须 high 风险并等待确认。',
    'xcode_action 参数形如 {"action":"list","projectPath":"/path/App.xcodeproj","timeout":60000}；action 可为 list/build/test/clean/archive/open/simctl-list。',
    'terminal 只用于非 Xcode 的受控命令，Xcode 构建运行优先使用 xcode_action。',
    'file_write 必须给 path 和 content；如果无法确定内容，改用 manual_review。',
    `任何新项目、Playground、代码工程、素材、文档和脚本都必须放在 Mac 桌面目录：${projectRoot}。目录名已经带 emoji，不要使用 /tmp、/Users/Shared、相对路径或无 emoji 临时目录。`,
    `如果需要创建目录，优先生成 terminal 动作：{"command":"mkdir -p ${shellQuote(projectRoot)}","timeout":30000}。`,
    '如果议题要求“开发 App / 创建项目 / 自动执行 / 跑出成品”，动作队列不能只有 manual_review；至少生成创建项目目录、写入项目说明或 PRD 文件、检查环境/构建验证中的可执行动作。',
    '如果当前只能先生成文档，也必须把文档保存到项目目录，并把尚不能自动完成的原因写入动作说明。',
    '不要伪造执行结果；动作只是队列。',
  ].join('\n')

  let parsed: unknown[] = []
  try {
    const raw = await chatCompletion(
      getLLMConfig(),
      [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: `## 议题\n${params.topic}\n\n## 最终产物\n${params.session.summary}\n\n请生成动作队列 JSON。`,
        },
      ],
      0.18,
      TEAM_ACTION_MAX_TOKENS,
    )
    parsed = extractJsonArray(raw)
  } catch {
    parsed = []
  }

  const actions = parsed
    .slice(0, 6)
    .map((item) => {
      const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      const capability = normalizeActionCapability(raw.capability, params.capabilities)
      const toolId = normalizeActionTool(raw.toolId, capability)
      const risk = normalizeActionRisk(raw.risk, toolId)
      const normalizedParams = enforceDesktopProjectParams(normalizeActionParams(raw.params, toolId), toolId, projectRoot)
      const requiresApproval = shouldRequireActionApproval(executionMode, risk, toolId, normalizedParams)
      return {
        sessionId: params.session.id,
        teamId: params.team.id,
        ownerAgentId: String(raw.ownerAgentId || 'team-engine'),
        ownerAgentName: String(raw.ownerAgentName || '执行总控'),
        capability,
        toolId,
        title: String(raw.title || '未命名动作').slice(0, 90),
        description: String(raw.description || ''),
        params: normalizedParams,
        risk,
        requiresApproval,
        status: 'proposed' as const,
      } satisfies Omit<TeamAction, 'id' | 'createdAt' | 'updatedAt'>
    })
    .filter(actionHasRequiredParams)

  const finalActions = actions.length
    ? actions
    : fallbackActions({
        team: params.team,
        session: params.session,
        topic: params.topic,
        capabilities: params.capabilities,
        executionMode,
        projectRoot,
      })
  if (finalActions.length === 0) return

  await createTeamActions(finalActions)
  pushSystemTeamMessage(
    params.session,
    `已生成 ${finalActions.length} 个执行动作，全部写入本轮协作历史。高风险动作必须由 Boss 确认。`,
    params.onProgress,
  )
}

async function synthesizeTeamArtifact(
  team: Team,
  session: TeamSession,
  topic: string,
  profile: TeamWorkflowProfile,
  uiStyleContext: UiMuseumPrdContext | null,
  onProgress?: (msg: TeamMessage) => void,
): Promise<void> {
  const briefs = collectTeamBriefs(session)
  if (!briefs.trim()) {
    session.summary = '没有可综合的角色短评。'
    return
  }

  pushSystemTeamMessage(
    session,
    `${profile.hostName} 正在收束多角色短评，生成一份可留存、可标签化、可执行的「${profile.artifactLabel}」。`,
    onProgress,
  )

  const capabilities = getEffectiveCapabilities(team, profile)
  const executionPolicy = getExecutionPolicy(team.config.executionMode)
  const synthesisPrompt = [
    `你是 Openbasaka 的群策主持人，当前身份是「${profile.hostName}」。`,
    `本次工作流：${profile.label}。`,
    `最终产物：${profile.artifactLabel}。`,
    `执行权限：${executionPolicy.label}。${executionPolicy.artifactRule}`,
    `你的任务不是复述每个角色，而是${profile.synthesisFocus}`,
    '必须处理角色之间的冲突：保留有价值的分歧，给出最终取舍。',
    '输出必须是 Markdown，标题清晰，适合直接存入知识库与后续标签化。',
    '不要出现“综合结论”式拼接，不要逐字复制角色长段，不要给用户继续提问。',
    '如果角色短评不够细，你必须基于用户原始任务补齐产品、体验、技术、测试、运营、验证层面的可执行细节。',
    '写作标准：小白能看懂，工程师能照着拆任务，设计师能照着出高保真，Agent 能照着继续工作并知道需要哪些工具。',
    '成稿标准：最终必须是一份单一完整文档，不是会议纪要、不是角色观点汇总、不是“下一步要不要我继续”。',
    '信息密度标准：每个关键功能都要写清楚用户动作、系统反应、数据去向、异常状态、验收标准和测试方式。',
    '体验标准：视觉与交互权重等同于功能；必须明确页面层级、组件状态、动效节奏、空态/加载/失败态和小白理解路径。',
    uiStyleContext ? 'UI风格馆标准：必须吸收自动视觉输入，把风格转成可执行 UI/UX 条款、组件状态、动效和视觉验收标准；不要只写“美观”。' : '',
    `本团队能力清单：${capabilities.length ? capabilities.map(formatCapabilityLabel).join('、') : '仅做策略协作'}。需要严格按执行权限判断哪些只是建议、哪些可进入待确认队列、哪些未来才允许自动执行。`,
    uiStyleContext ? `\n${uiStyleContext.promptFragment}` : '',
    '',
    `${profile.artifactLabel} 结构必须包含：`,
    ...profile.artifactStructure,
  ].join('\n')

  try {
    const summary = await chatCompletion(
      getLLMConfig(),
      [
        { role: 'system', content: synthesisPrompt },
        {
          role: 'user',
          content: `## 用户原始任务\n${topic}\n\n## 团队名称\n${team.name}\n\n## 执行模式\n${executionPolicy.label}\n${executionPolicy.summary}\n\n## 团队能力\n${capabilities.map(formatCapabilityLabel).join('、') || '未声明'}\n\n${uiStyleContext?.promptFragment || ''}\n\n## 角色短评\n${briefs}\n\n请生成最终「${profile.artifactLabel}」。要求细到可以直接拆任务、调工具、跑验证，但不要堆砌空话，也不要越过当前执行权限。`,
        },
      ],
      0.42,
      TEAM_ARTIFACT_MAX_TOKENS,
    )
    session.summary = summary.trim()
  } catch (err) {
    session.summary = formatTeamAgentError(err, profile.hostName, getLLMConfig())
    pushSystemTeamMessage(session, session.summary, onProgress, 'error')
    return
  }

  const artifact: TeamMessage = {
    id: generateId(),
    agentId: `team-${profile.type}-synthesizer`,
    agentName: profile.hostName,
    role: 'assistant',
    content: session.summary,
    timestamp: Date.now(),
    kind: 'artifact',
    artifactType: profile.artifactType,
    tags: suggestArtifactTags(team, topic, profile),
  }
  session.title = `${profile.label}｜${topic.trim().slice(0, 60) || team.name}`
  session.tags = artifact.tags || []
  session.messages.push(artifact)
  onProgress?.(artifact)
}

/** 运行团队会话 */
export async function runTeamSession(
  team: Team,
  topic: string,
  onProgress?: (msg: TeamMessage) => void,
): Promise<TeamSession> {
  const executionTeam = ensureEssentialAgents(team, topic)
  const workflow = getWorkflowProfile(executionTeam, topic)
  const uiStyleContext = buildUiMuseumPrdContext(topic)
  const sessionId = await createTeamSession(team.id, topic)
  const session = await getTeamSession(sessionId)
  if (!session) throw new Error('Failed to create team session')

  const llmConfig = getLLMConfig()
  pushSystemTeamMessage(
    session,
    `群策已启动：${executionTeam.name}，工作流「${workflow.label}」，${executionTeam.agents.length} 个角色将围绕任务分工发言。`,
    onProgress,
  )
  const capabilities = getEffectiveCapabilities(executionTeam, workflow)
  if (capabilities.length > 0) {
    pushSystemTeamMessage(session, `本轮能力清单：${capabilities.map(formatCapabilityLabel).join('、')}。`, onProgress)
  }
  const executionPolicy = getExecutionPolicy(executionTeam.config.executionMode)
  pushSystemTeamMessage(
    session,
    `执行权限：${executionPolicy.label}。${executionPolicy.summary}`,
    onProgress,
  )
  pushSystemTeamMessage(
    session,
    `项目生成路径规则：所有新项目、工程、素材和脚本默认进入 ${buildDesktopProjectDir(topic, workflow)}；禁止散落到 /tmp 或 /Users/Shared。`,
    onProgress,
  )
  if (executionTeam.agents.length > team.agents.length) {
    pushSystemTeamMessage(
      session,
      '已自动加入「视觉大师」：负责 UI/UX、动效、Baoyu 图文表达与 Remotion 叙事设计。',
      onProgress,
    )
  }
  pushSystemTeamMessage(
    session,
    `UI风格馆已自动接入：${uiStyleContext.styleNames.join(' / ')}${uiStyleContext.savedFusionName ? `；复用融合「${uiStyleContext.savedFusionName}」` : ''}。`,
    onProgress,
  )
  await pushTeamRoleDeclarations({
    team: executionTeam,
    session,
    topic,
    workflow,
    capabilities,
    onProgress,
  })

  try {
    switch (executionTeam.teamType) {
      case 'permanent':
        await runPermanentSession(executionTeam, session, topic, workflow, capabilities, llmConfig, uiStyleContext, onProgress)
        break
      case 'agency':
        await runAgencySession(executionTeam, session, topic, workflow, capabilities, llmConfig, uiStyleContext, onProgress)
        break
      case 'brainstorm':
        await runBrainstormSession(executionTeam, session, topic, workflow, capabilities, llmConfig, uiStyleContext, onProgress)
        break
    }

    await synthesizeTeamArtifact(executionTeam, session, topic, workflow, uiStyleContext, onProgress)
    await saveTeamArtifactToDesktop({
      team: executionTeam,
      session,
      topic,
      profile: workflow,
      onProgress,
    })
    await buildAndSaveTeamActions({
      team: executionTeam,
      session,
      topic,
      profile: workflow,
      capabilities,
      onProgress,
    })
    session.status = 'completed'
  } catch (err) {
    session.status = 'failed'
    session.summary = `会话失败: ${(err as Error).message}`
    pushSystemTeamMessage(session, session.summary, onProgress, 'error')
    recordAgentExecutionReceipt({
      agentId: 'team-engine',
      subject: `${team.name}｜团队会话失败`,
      input: topic,
      output: session.summary,
      status: 'failed',
      tools: [{ id: 'team-engine', label: 'Team Engine', risk: 'low', status: 'failed' }],
      projectIds: team.projectId ? [team.projectId] : [],
      source: { kind: 'agent', sourceId: session.id, title: team.name },
      entities: [team.id, session.id, team.teamType],
    }).catch(() => {})
  }

  await saveTeamSession(session)
  return session
}

/** 永久团队：顺序执行（每个 Agent 使用各自 LLM 配置） */
async function runPermanentSession(
  team: Team,
  session: TeamSession,
  topic: string,
  workflow: TeamWorkflowProfile,
  capabilities: AgentCapabilityId[],
  _llmConfig: LLMConfig,
  uiStyleContext: UiMuseumPrdContext | null,
  onProgress?: (msg: TeamMessage) => void,
): Promise<void> {
  let priorContext = ''
  const cognitivePrompt = renderCognitivePrompt(loadCognitiveProfile())

  for (const agentConfig of team.agents) {
    const agent = await getAgentById(agentConfig.agentId)
    const agentLLM = getAgentLLMConfig(agentConfig.agentId)
    const agentName = agent?.name || agentConfig.role
    const roleMission = buildTeamRoleMission({
      agentId: agentConfig.agentId,
      agentName,
      teamRole: agentConfig.role,
      workflow,
      capabilities,
    })
    const agentPrompt = await buildTeamAgentPrompt({
      agentId: agentConfig.agentId,
      agentName,
      teamRole: agentConfig.role,
      roleBrief: agentConfig.systemPromptOverride || agent?.systemPromptSuffix || '',
      roleMission,
      mode: 'sequential',
      workflow,
      capabilities,
      executionMode: team.config.executionMode || 'supervised',
      uiStyleContext,
    })

    // 知识库注入
    let knowledgeCtx = ''
    try {
      const { promptFragment } = await retrieveAndInject({
        userMessage: topic,
        agentId: agentConfig.agentId,
        depth: 'quick',
      })
      knowledgeCtx = promptFragment
    } catch {
      /* non-critical */
    }

    const systemPrompt = [agentPrompt, cognitivePrompt, knowledgeCtx].filter(Boolean).join('\n\n')

    const userPrompt = priorContext
      ? `## 讨论主题\n${topic}\n\n## 工作流\n${workflow.label}\n\n## 前序短评\n${priorContext}\n\n请输出你的顾问短评，服务最终「${workflow.artifactLabel}」。`
      : `## 讨论主题\n${topic}\n\n## 工作流\n${workflow.label}\n\n请输出你的顾问短评，服务最终「${workflow.artifactLabel}」。`

    const startedAt = Date.now()
    let result = ''
    pushSystemTeamMessage(
      session,
      buildTeamProgressMessage(
        agentName,
        `读取任务与前序观点，准备给出 ${team.config.communicationPattern} 模式下的专业判断。`,
      ),
      onProgress,
    )
    try {
      result = await chatCompletion(
        agentLLM,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        agent?.temperature || 0.7,
        TEAM_AGENT_MAX_TOKENS,
      )
    } catch (err) {
      result = formatTeamAgentError(err, agentName, agentLLM)
      recordTeamAgentExecution({
        team,
        session,
        agentId: agentConfig.agentId,
        agentName,
        input: userPrompt,
        output: result,
        status: 'failed',
        evidenceRefs: buildTeamEvidenceRefs(knowledgeCtx, cognitivePrompt, team),
        durationMs: Date.now() - startedAt,
      })
      pushSystemTeamMessage(session, result, onProgress, 'error')
      priorContext += `\n\n### ${agentName}\n${result}`
      continue
    }
    recordTeamAgentExecution({
      team,
      session,
      agentId: agentConfig.agentId,
      agentName,
      input: userPrompt,
      output: result,
      status: 'completed',
      evidenceRefs: buildTeamEvidenceRefs(knowledgeCtx, cognitivePrompt, team),
      durationMs: Date.now() - startedAt,
    })

    const msg: TeamMessage = {
      id: generateId(),
      agentId: agentConfig.agentId,
      agentName,
      role: 'assistant',
      content: result,
      timestamp: Date.now(),
      kind: 'brief',
    }

    session.messages.push(msg)
    onProgress?.(msg)

    priorContext += `\n\n### ${agentName}\n${result}`
  }

  session.summary = priorContext
}

/** Agency 团队：DAG 拓扑排序执行（每个 Agent 使用各自 LLM 配置） */
async function runAgencySession(
  team: Team,
  session: TeamSession,
  topic: string,
  workflow: TeamWorkflowProfile,
  capabilities: AgentCapabilityId[],
  _llmConfig: LLMConfig,
  uiStyleContext: UiMuseumPrdContext | null,
  onProgress?: (msg: TeamMessage) => void,
): Promise<void> {
  const tasks = team.config.tasks || []
  const results: Record<string, string> = {}
  const cognitivePrompt = renderCognitivePrompt(loadCognitiveProfile())

  // 拓扑排序
  const sorted = topologicalSort(tasks)

  for (const task of sorted) {
    const agent = await getAgentById(task.assignedAgent)
    const agentLLM = getAgentLLMConfig(task.assignedAgent)
    const agentName = agent?.name || task.assignedAgent
    const roleMission = buildTeamRoleMission({
      agentId: task.assignedAgent,
      agentName,
      teamRole: task.description || task.assignedAgent,
      workflow,
      capabilities,
    })
    const agentPrompt = await buildTeamAgentPrompt({
      agentId: task.assignedAgent,
      agentName,
      teamRole: task.assignedAgent,
      roleBrief: agent?.systemPromptSuffix || task.description,
      roleMission,
      mode: 'agency',
      workflow,
      capabilities,
      executionMode: team.config.executionMode || 'supervised',
      uiStyleContext,
    })

    // 知识库注入
    let knowledgeCtx = ''
    try {
      const { promptFragment } = await retrieveAndInject({
        userMessage: `${topic} ${task.description}`,
        agentId: task.assignedAgent,
        depth: 'quick',
      })
      knowledgeCtx = promptFragment
    } catch {
      /* non-critical */
    }

    const systemPrompt = [agentPrompt, cognitivePrompt, knowledgeCtx].filter(Boolean).join('\n\n')

    // 构建依赖上下文
    const depsContext = task.dependsOn
      .map((depId) => {
        const depTask = tasks.find((t) => t.id === depId)
        return depId ? `### ${depTask?.description || depId}\n${results[depId] || '无结果'}` : ''
      })
      .filter(Boolean)
      .join('\n\n')

    const userPrompt = depsContext
      ? `## 任务\n${task.description}\n\n## 工作流\n${workflow.label}\n\n## 输入\n${topic}\n\n## 前置短评\n${depsContext}\n\n请完成你的任务，输出能直接进入最终「${workflow.artifactLabel}」的顾问短评。`
      : `## 任务\n${task.description}\n\n## 工作流\n${workflow.label}\n\n## 输入\n${topic}\n\n请完成你的任务，输出能直接进入最终「${workflow.artifactLabel}」的顾问短评。`

    const startedAt = Date.now()
    let result = ''
    pushSystemTeamMessage(
      session,
      buildTeamProgressMessage(agentName, `执行任务「${task.description}」，依赖项 ${task.dependsOn.length} 个。`),
      onProgress,
    )
    try {
      result = await chatCompletion(
        agentLLM,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        agent?.temperature || 0.5,
        TEAM_AGENT_MAX_TOKENS,
      )
    } catch (err) {
      result = formatTeamAgentError(err, agentName, agentLLM)
      recordTeamAgentExecution({
        team,
        session,
        agentId: task.assignedAgent,
        agentName,
        input: userPrompt,
        output: result,
        status: 'failed',
        evidenceRefs: buildTeamEvidenceRefs(knowledgeCtx, cognitivePrompt, team),
        durationMs: Date.now() - startedAt,
      })
      results[task.outputKey] = result
      pushSystemTeamMessage(session, result, onProgress, 'error')
      continue
    }
    recordTeamAgentExecution({
      team,
      session,
      agentId: task.assignedAgent,
      agentName,
      input: userPrompt,
      output: result,
      status: 'completed',
      evidenceRefs: buildTeamEvidenceRefs(knowledgeCtx, cognitivePrompt, team),
      durationMs: Date.now() - startedAt,
    })

    results[task.outputKey] = result

    const msg: TeamMessage = {
      id: generateId(),
      agentId: task.assignedAgent,
      agentName,
      role: 'assistant',
      content: result,
      timestamp: Date.now(),
      kind: 'brief',
    }
    session.messages.push(msg)
    onProgress?.(msg)
  }

  // 综合所有结果
  const summaryParts = Object.entries(results)
    .map(([key, value]) => `### ${key}\n${value}`)
    .join('\n\n')
  session.summary = summaryParts
}

/** Brainstorm 团队：轮次讨论（每个 Agent 使用各自 LLM 配置） */
async function runBrainstormSession(
  team: Team,
  session: TeamSession,
  topic: string,
  workflow: TeamWorkflowProfile,
  capabilities: AgentCapabilityId[],
  _llmConfig: LLMConfig,
  uiStyleContext: UiMuseumPrdContext | null,
  onProgress?: (msg: TeamMessage) => void,
): Promise<void> {
  const maxRounds = team.config.maxRounds || 3
  let roundContext = `## 头脑风暴主题\n${topic}`
  const cognitivePrompt = renderCognitivePrompt(loadCognitiveProfile())

  for (let round = 1; round <= maxRounds; round++) {
    for (const agentConfig of team.agents) {
      const agent = await getAgentById(agentConfig.agentId)
      const agentLLM = getAgentLLMConfig(agentConfig.agentId)
      const agentName = agent?.name || agentConfig.role
      const roleMission = buildTeamRoleMission({
        agentId: agentConfig.agentId,
        agentName,
        teamRole: agentConfig.role,
        workflow,
        capabilities,
      })
      const agentPrompt = await buildTeamAgentPrompt({
        agentId: agentConfig.agentId,
        agentName,
        teamRole: agentConfig.role,
        roleBrief: `在头脑风暴中大胆发言。${agent?.systemPromptSuffix || agentConfig.systemPromptOverride || ''}`,
        roleMission,
        mode: 'brainstorm',
        workflow,
        capabilities,
        executionMode: team.config.executionMode || 'supervised',
        uiStyleContext,
      })

      // 知识库注入
      let knowledgeCtx = ''
      try {
        const { promptFragment } = await retrieveAndInject({
          userMessage: topic,
          agentId: agentConfig.agentId,
          depth: 'quick',
        })
        knowledgeCtx = promptFragment
      } catch {
        /* non-critical */
      }

      const systemPrompt = [agentPrompt, cognitivePrompt, knowledgeCtx].filter(Boolean).join('\n\n')

      const userPrompt = `${roundContext}\n\n## 工作流\n${workflow.label}\n\n这是第 ${round}/${maxRounds} 轮。请给出你的顾问短评，服务最终「${workflow.artifactLabel}」。`

      const startedAt = Date.now()
      let result = ''
      pushSystemTeamMessage(
        session,
        buildTeamProgressMessage(agentName, `第 ${round}/${maxRounds} 轮发散，正在结合已有观点生成互补想法。`),
        onProgress,
      )
      try {
        result = await chatCompletion(
          agentLLM,
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          team.config.temperature || 0.9,
          TEAM_BRAINSTORM_MAX_TOKENS,
        )
      } catch (err) {
        result = formatTeamAgentError(err, agentName, agentLLM)
        recordTeamAgentExecution({
          team,
          session,
          agentId: agentConfig.agentId,
          agentName,
          input: userPrompt,
          output: result,
          status: 'failed',
          evidenceRefs: buildTeamEvidenceRefs(knowledgeCtx, cognitivePrompt, team),
          durationMs: Date.now() - startedAt,
          round,
        })
        pushSystemTeamMessage(session, result, onProgress, 'error')
        roundContext += `\n\n### ${agentName} (Round ${round})\n${result}`
        continue
      }
      recordTeamAgentExecution({
        team,
        session,
        agentId: agentConfig.agentId,
        agentName,
        input: userPrompt,
        output: result,
        status: 'completed',
        evidenceRefs: buildTeamEvidenceRefs(knowledgeCtx, cognitivePrompt, team),
        durationMs: Date.now() - startedAt,
        round,
      })

      const msg: TeamMessage = {
        id: generateId(),
        agentId: agentConfig.agentId,
        agentName,
        role: 'assistant',
        content: result,
        timestamp: Date.now(),
        round,
        kind: 'brief',
      }
      session.messages.push(msg)
      onProgress?.(msg)

      roundContext += `\n\n### ${agentName} (Round ${round})\n${result}`
    }
  }

  session.summary = roundContext
}

/** 拓扑排序 */
function topologicalSort(tasks: TeamTask[]): TeamTask[] {
  const sorted: TeamTask[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const taskMap = new Map(tasks.map((t) => [t.id, t]))

  function visit(id: string) {
    if (visited.has(id)) return
    if (visiting.has(id)) return // 跳过循环
    visiting.add(id)
    const task = taskMap.get(id)
    if (task) {
      for (const dep of task.dependsOn) visit(dep)
      sorted.push(task)
    }
    visiting.delete(id)
    visited.add(id)
  }

  tasks.forEach((t) => visit(t.id))
  return sorted
}
