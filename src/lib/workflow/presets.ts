/**
 * Workflow Presets — 预设工作流模板
 */
import { Workflow } from './types'

export const PRESET_WORKFLOWS: Omit<Workflow, 'id' | 'status'>[] = [
  {
    name: '项目全面评估',
    nameEn: 'Full Project Evaluation',
    goal: '对一个项目想法进行全方位深度评估',
    steps: [
      { id: 's1', agentRole: 'market', task: '分析市场规模、竞争格局和目标用户', dependsOn: [], outputKey: 'market_analysis' },
      { id: 's2', agentRole: 'technical', task: '评估技术可行性、推荐技术栈', dependsOn: [], outputKey: 'tech_analysis' },
      { id: 's3', agentRole: 'critic', task: '找出所有风险和潜在问题', dependsOn: ['s1', 's2'], outputKey: 'risk_analysis' },
      { id: 's4', agentRole: 'strategy', task: '基于以上分析给出战略建议', dependsOn: ['s1', 's2', 's3'], outputKey: 'strategy' },
      { id: 's5', agentRole: 'general', task: '综合所有分析，给出最终评估结论', dependsOn: ['s4'], outputKey: 'summary' },
    ],
    agents: [
      { role: 'market', skills: ['market-research', 'competitor-scan'] },
      { role: 'technical', skills: ['tech-feasibility', 'risk-scanner'] },
      { role: 'critic', skills: ['risk-scanner'] },
      { role: 'strategy', skills: ['go-no-go', 'mvp-scoper'] },
      { role: 'general', skills: ['report-generator'] },
    ],
  },
  {
    name: '创意探索',
    nameEn: 'Creative Exploration',
    goal: '从一个想法出发，探索所有可能的创新方向',
    steps: [
      { id: 's1', agentRole: 'creative', task: '大胆联想，生成多个创新方向', dependsOn: [], outputKey: 'ideas' },
      { id: 's2', agentRole: 'critic', task: '对每个创意进行严格批判', dependsOn: ['s1'], outputKey: 'critique' },
      { id: 's3', agentRole: 'general', task: '综合创意和批判，筛选出最佳方向', dependsOn: ['s1', 's2'], outputKey: 'recommendation' },
    ],
    agents: [
      { role: 'creative', skills: ['hybrid-innovator'] },
      { role: 'critic', skills: ['risk-scanner'] },
      { role: 'general', skills: [] },
    ],
  },
  {
    name: '深度研究',
    nameEn: 'Deep Research',
    goal: '对特定主题进行多视角深度研究',
    steps: [
      { id: 's1', agentRole: 'market', task: '研究市场现状和趋势', dependsOn: [], outputKey: 'market' },
      { id: 's2', agentRole: 'technical', task: '调研技术现状和前沿', dependsOn: [], outputKey: 'tech' },
      { id: 's3', agentRole: 'strategy', task: '基于研究发现给出行动建议', dependsOn: ['s1', 's2'], outputKey: 'action_plan' },
    ],
    agents: [
      { role: 'market', skills: ['web-search', 'market-research'] },
      { role: 'technical', skills: ['web-search', 'tech-feasibility'] },
      { role: 'strategy', skills: ['go-no-go', 'timeline-planner'] },
    ],
  },
]
