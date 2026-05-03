import { query } from '../db/repository'
import { listTeams } from '../teams/store'
import type { AgentCapabilityId, Team, TeamWorkflowType } from '../teams/types'
import { PRESET_WORKFLOWS } from './presets'
import { listWorkflowStudioItems } from './studio'

export type WorkflowCatalogSource = 'studio' | 'team' | 'preset' | 'saved' | 'module'
export type WorkflowConsumer = 'scheduler' | 'teams' | 'knowledge' | 'xiaobai' | 'memory' | 'control'

export interface WorkflowCatalogItem {
  id: string
  label: string
  subtitle: string
  summary: string
  source: WorkflowCatalogSource
  sourceId: string
  status: 'active' | 'draft' | 'available' | 'tested' | 'published'
  consumers: WorkflowConsumer[]
  capabilities: string[]
  artifactLabel: string
  workflowType?: TeamWorkflowType
  teamId?: string
  teamName?: string
  steps?: string[]
}

async function listStudioWorkflows(): Promise<WorkflowCatalogItem[]> {
  const items = await listWorkflowStudioItems().catch(() => [])
  return items.map((item) => {
    const meta = getTeamWorkflowMeta(item.workflowType)
    return {
      id: `studio:${item.id}`,
      label: item.name,
      subtitle: '工作流工坊',
      summary: item.goal,
      source: 'studio',
      sourceId: item.id,
      status: item.status,
      consumers: item.targetConsumers,
      capabilities: ['已定义', item.lastTestStatus === 'success' ? '试跑通过' : '待试跑', ...formatCapabilities(meta.defaultCapabilities)].slice(0, 6),
      artifactLabel: meta.artifactLabel,
      workflowType: item.workflowType,
      teamId: item.teamId,
      steps: item.steps,
    }
  })
}

export interface TeamWorkflowMeta {
  type: TeamWorkflowType
  label: string
  hint: string
  defaultCapabilities: AgentCapabilityId[]
  artifactLabel: string
}

export const TEAM_WORKFLOW_OPTIONS: TeamWorkflowMeta[] = [
  {
    type: 'prd',
    label: 'PRD 设计',
    hint: '产品需求、交互、验收',
    defaultCapabilities: ['prd', 'review', 'web-search'],
    artifactLabel: 'PRD 成稿',
  },
  {
    type: 'research',
    label: '深度调研',
    hint: '趋势、竞品、证据链',
    defaultCapabilities: ['web-search', 'review'],
    artifactLabel: '调研报告',
  },
  {
    type: 'build',
    label: '产品落地',
    hint: '架构、代码、测试',
    defaultCapabilities: ['filesystem', 'terminal', 'codegen', 'review'],
    artifactLabel: '实现方案',
  },
  {
    type: 'xcode-mac-app',
    label: 'Mac App 自动落地',
    hint: 'Swift、Xcode、看图验收',
    defaultCapabilities: ['filesystem', 'terminal', 'xcode', 'desktop-control', 'vision', 'codegen', 'review'],
    artifactLabel: 'Xcode 落地方案',
  },
  {
    type: 'visual-review',
    label: '视觉审查',
    hint: '截图、UI、动效、可用性',
    defaultCapabilities: ['vision', 'review'],
    artifactLabel: '视觉审查报告',
  },
  {
    type: 'automation',
    label: '自动化工作流',
    hint: 'Cron、Telegram、状态机',
    defaultCapabilities: ['terminal', 'browser', 'telegram', 'review'],
    artifactLabel: '自动化运行手册',
  },
  {
    type: 'custom',
    label: '自定义协作',
    hint: '按团队灵魂自由分工',
    defaultCapabilities: ['review'],
    artifactLabel: '群策方案',
  },
]

const MODULE_WORKFLOWS: WorkflowCatalogItem[] = [
  {
    id: 'module:knowledge:notebook-loop',
    label: 'Notebook 联动',
    subtitle: '知识＋大佬',
    summary: '导入网页、视频、PDF、截图或笔记后，先解析为资料地图，再生成学习包、行动清单与可归档成果。',
    source: 'module',
    sourceId: 'knowledge',
    status: 'available',
    consumers: ['knowledge', 'scheduler', 'teams', 'xiaobai'],
    capabilities: ['资料解析', '来源地图', '学习包', '归档标签'],
    artifactLabel: '学习包',
    steps: ['接收素材', '解析内容', '生成资料地图', '产出学习包', '归档再利用'],
  },
  {
    id: 'module:scheduler:test-before-enable',
    label: '试跑后开启',
    subtitle: '定时',
    summary: 'Boss 先设置任务，系统立即跑完整流程；结果满意后再打开定时开关，避免把不满意的任务自动化。',
    source: 'module',
    sourceId: 'scheduler',
    status: 'available',
    consumers: ['scheduler', 'teams'],
    capabilities: ['手动试跑', '执行日志', 'Telegram 推送', '满意后开启'],
    artifactLabel: '测试回执',
    steps: ['设置任务', '立即试跑', '检查结果', '开启定时', '持续记录'],
  },
  {
    id: 'module:xiaobai:explain-and-do',
    label: '小白解释器',
    subtitle: '小白',
    summary: '把复杂模块、错误、术语和流程翻译成最小可执行步骤，让 Boss 知道现在该看哪里、点哪里、判断什么。',
    source: 'module',
    sourceId: 'xiaobai',
    status: 'available',
    consumers: ['xiaobai', 'knowledge', 'scheduler'],
    capabilities: ['小白解释', '步骤拆解', '错误翻译', '下一步提示'],
    artifactLabel: '小白教程',
    steps: ['读懂问题', '翻译成人话', '给最小路径', '检查是否完成'],
  },
]

const CAPABILITY_LABELS: Record<AgentCapabilityId, string> = {
  vision: '看图',
  'desktop-control': '桌面控制',
  xcode: 'Xcode',
  filesystem: '文件读写',
  terminal: '终端',
  browser: '浏览器',
  'web-search': '实时搜索',
  codegen: '代码',
  prd: 'PRD',
  review: '审查',
  telegram: 'Telegram',
}

export function getTeamWorkflowMeta(type?: TeamWorkflowType): TeamWorkflowMeta {
  return TEAM_WORKFLOW_OPTIONS.find((item) => item.type === type) || TEAM_WORKFLOW_OPTIONS[TEAM_WORKFLOW_OPTIONS.length - 1]
}

export function formatCapabilities(capabilities: AgentCapabilityId[] = []): string[] {
  return capabilities.map((capability) => CAPABILITY_LABELS[capability] || capability)
}

function teamToWorkflowCatalogItem(team: Team): WorkflowCatalogItem {
  const workflowType = team.config.workflowType || 'custom'
  const meta = getTeamWorkflowMeta(workflowType)
  return {
    id: `team:${team.id}`,
    label: `${team.name}｜${meta.label}`,
    subtitle: '群策工作流',
    summary: team.description || meta.hint,
    source: 'team',
    sourceId: team.id,
    status: 'active',
    consumers: ['teams', 'scheduler'],
    capabilities: formatCapabilities(team.config.capabilities || meta.defaultCapabilities),
    artifactLabel: meta.artifactLabel,
    workflowType,
    teamId: team.id,
    teamName: team.name,
    steps: (team.config.tasks || []).map((task) => task.description),
  }
}

function presetToWorkflowCatalogItem(preset: (typeof PRESET_WORKFLOWS)[number], index: number): WorkflowCatalogItem {
  return {
    id: `preset:${preset.nameEn || index}`,
    label: preset.name,
    subtitle: '预设 DAG 工作流',
    summary: preset.goal,
    source: 'preset',
    sourceId: preset.nameEn || preset.name,
    status: 'available',
    consumers: ['teams', 'scheduler', 'knowledge'],
    capabilities: Array.from(new Set(preset.agents.flatMap((agent) => agent.skills))).slice(0, 6),
    artifactLabel: '工作流报告',
    steps: preset.steps.map((step) => step.task),
  }
}

async function listSavedWorkflows(): Promise<WorkflowCatalogItem[]> {
  try {
    const rows = await query<{
      id: string
      name: string
      name_en: string
      goal: string
      steps_json: string
      agents_json: string
      status: 'draft' | 'active' | 'completed'
    }>('SELECT id, name, name_en, goal, steps_json, agents_json, status FROM workflows ORDER BY updated_at DESC')

    return rows.map((row) => {
      let steps: string[] = []
      let capabilities: string[] = []
      try {
        const parsedSteps = JSON.parse(row.steps_json || '[]') as Array<{ task?: string }>
        steps = parsedSteps.map((step) => step.task || '').filter(Boolean)
      } catch {
        steps = []
      }
      try {
        const parsedAgents = JSON.parse(row.agents_json || '[]') as Array<{ skills?: string[] }>
        capabilities = Array.from(new Set(parsedAgents.flatMap((agent) => agent.skills || []))).slice(0, 6)
      } catch {
        capabilities = []
      }
      return {
        id: `saved:${row.id}`,
        label: row.name,
        subtitle: row.name_en || '保存的工作流',
        summary: row.goal,
        source: 'saved',
        sourceId: row.id,
        status: row.status === 'active' ? 'active' : row.status === 'draft' ? 'draft' : 'available',
        consumers: ['teams', 'scheduler', 'knowledge'],
        capabilities,
        artifactLabel: '工作流报告',
        steps,
      }
    })
  } catch {
    return []
  }
}

export async function listWorkflowCatalog(): Promise<WorkflowCatalogItem[]> {
  const [studio, teams, saved] = await Promise.all([
    listStudioWorkflows(),
    listTeams({ status: 'active' }).catch(() => []),
    listSavedWorkflows(),
  ])

  return [
    ...studio,
    ...teams.map(teamToWorkflowCatalogItem),
    ...saved,
    ...PRESET_WORKFLOWS.map(presetToWorkflowCatalogItem),
    ...MODULE_WORKFLOWS,
  ]
}

export function findDefaultTeamWorkflow(items: WorkflowCatalogItem[]): WorkflowCatalogItem | undefined {
  return (
    items.find((item) => item.source === 'studio' && (item.status === 'tested' || item.status === 'published')) ||
    items.find((item) => item.source === 'studio') ||
    items.find((item) => item.source === 'team') ||
    items.find((item) => item.source === 'preset')
  )
}
