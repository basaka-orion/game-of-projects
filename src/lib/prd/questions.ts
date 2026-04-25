/**
 * PRD 问答 — 5 个关键问题
 *
 * 精简但精准的问答，为 16 章节 PRD 生成提供核心输入
 */

export interface PRDQuestion {
  id: string
  question: string
  placeholder: string
  type: 'text' | 'textarea' | 'select'
  options?: string[]
}

export const PRD_QUESTIONS: PRDQuestion[] = [
  {
    id: 'projectName',
    question: '项目/产品名称是什么？',
    placeholder: '例如：AI 笔记助手、智能健身教练...',
    type: 'text',
  },
  {
    id: 'targetUsers',
    question: '目标用户是谁？（他们的核心痛点是什么）',
    placeholder: '例如：独立开发者，苦于没有好的项目管理工具；小企业主，想要低成本获客...',
    type: 'textarea',
  },
  {
    id: 'coreProblem',
    question: '你想解决的核心问题是什么？',
    placeholder: '描述用户目前遇到的最大的麻烦、效率瓶颈或未被满足的需求...',
    type: 'textarea',
  },
  {
    id: 'techPreference',
    question: '技术偏好或限制？',
    placeholder: '例如：Web 应用、移动优先、AI 原生、必须离线可用...',
    type: 'select',
    options: ['Web 应用', '移动应用 (iOS/Android)', '桌面应用', 'API/后端服务', 'AI 原生应用', '跨平台', '不限'],
  },
  {
    id: 'businessGoal',
    question: '商业目标是什么？',
    placeholder: '例如：SaaS 订阅收入、广告变现、数据服务、API 收费、平台抽成...',
    type: 'select',
    options: ['SaaS 订阅', '广告变现', '交易抽成', '数据服务/API', '硬件+软件', '免费增值', '探索中'],
  },
]

export type PRDAnswers = Record<string, string>
