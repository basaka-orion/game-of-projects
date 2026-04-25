import type { OperatingLoopDeckItem } from './types'

export const dailyIntakeItems: OperatingLoopDeckItem[] = [
  {
    id: 'qimeng-inbox',
    title: '启蒙收件箱',
    value: '沉淀',
    description: '确认哪些对话和材料值得进入长期记忆。',
    target: 'memory',
    tone: 'accent',
  },
  {
    id: 'profiling-studio',
    title: '画像工坊',
    value: '理解',
    description: '更新 Boss 的认知、偏好、表达和行动风格。',
    target: 'profiling',
    tone: 'success',
  },
  {
    id: 'knowledge-vault',
    title: '知识库',
    value: '证据',
    description: '导入、编译、检索并验证可引用来源。',
    target: 'knowledge',
  },
]

export const operatingLoopStages: OperatingLoopDeckItem[] = [
  {
    id: 'capture',
    title: '捕获输入',
    value: 'Openbasaka',
    description: '日常对话、网页剪藏、项目灵感和启蒙候选都先进入副官入口。',
    target: 'memory',
    tone: 'accent',
  },
  {
    id: 'understand',
    title: '理解 Boss',
    value: '画像工坊',
    description: '把测评、对话与偏好沉淀成可被所有 Agent 复用的 Boss 画像。',
    target: 'profiling',
    tone: 'success',
  },
  {
    id: 'remember',
    title: '沉淀记忆',
    value: '记忆宫殿',
    description: '将可长期保留的信息归入宫殿结构，形成可追踪的个人语义地形。',
    target: 'memory',
  },
  {
    id: 'compile',
    title: '编译知识',
    value: '知识库',
    description: '把来源材料编译成可问答、可引用、可回到原文的 Wiki 知识层。',
    target: 'knowledge',
  },
  {
    id: 'simulate',
    title: '推演行动',
    value: '推演室',
    description: '围绕项目、风险、资源与机会生成行动假设和下一步策略。',
    target: 'warroom',
    tone: 'warning',
  },
  {
    id: 'execute',
    title: 'Agent 执行',
    value: '群策/定时',
    description: '把推演结果交给 Agent、MCP、Telegram 或定时任务执行并回写。',
    target: 'teams',
    tone: 'accent',
  },
]

export function buildProjectIntelligenceItems(projectCount: number, synapseCount: number): OperatingLoopDeckItem[] {
  return [
    {
      id: 'project-neurons',
      title: '神经元地图',
      value: projectCount,
      description: '项目作为节点，承载分类、存活率和状态。',
      target: 'neurons',
    },
    {
      id: 'project-synapses',
      title: '突触发现',
      value: synapseCount,
      description: '寻找项目之间的复用、协作和组合创新机会。',
      target: 'synapses',
    },
  ]
}

export const executionLayerItems: OperatingLoopDeckItem[] = [
  {
    id: 'agent-teams',
    title: '群策 Agent',
    value: '协作',
    description: '组织多角色 Agent 对项目、知识和行动进行分工。',
    target: 'teams',
    tone: 'accent',
  },
  {
    id: 'scheduler-control',
    title: '定时与控制',
    value: '运行',
    description: '查看定时任务、MCP、网关和外部通道状态。',
    target: 'scheduler',
    tone: 'success',
  },
]
