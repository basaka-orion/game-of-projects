/**
 * 六位智者原型配置
 *
 * 基于开发文档第 3-4 节，每位智者负责不同维度组合，
 * 以独特的思想传统和对话风格与用户互动。
 */

import type { SageId, SageDefinition } from '../types';

export const SAGE_DEFINITIONS: SageDefinition[] = [
  {
    id: 'scientist',
    name: '认知架构师',
    nameEn: 'The Scientist',
    icon: '🔬',
    color: '#64FFDA',
    archetype: '卡尼曼 × 现代认知科学',
    description: '剖析你的思维操作系统——推理偏好、决策惯性、学习工作流',
    focusDimensions: ['cognitive', 'personality.openness', 'personality.conscientiousness', 'personality.self_efficacy'],
    phaseLabels: ['画像解读', '决策复盘', '学习流程映射', '工作流建议'],
    maxTurns: 8,
  },
  {
    id: 'philosopher',
    name: '世界观哲人',
    nameEn: 'The Philosopher',
    icon: '🏛️',
    color: '#E040FB',
    archetype: '苏格拉底 × 弗兰克尔',
    description: '追问信念、意义与人生叙事——从"做什么"上升到"为什么而活"',
    focusDimensions: ['worldview', 'motivation.self_direction', 'motivation.benevolence', 'strengths.hope', 'strengths.fairness'],
    phaseLabels: ['起点定位', '信念抽丝', '世界假设探查', '意义线索收束'],
    maxTurns: 8,
  },
  {
    id: 'analyst',
    name: '阴影分析师',
    nameEn: 'The Analyst',
    icon: '🔮',
    color: '#FF6B6B',
    archetype: '荣格 × 当代深度心理学',
    description: '看见内在冲突与阴影面——情绪剧本、动机矛盾、自我攻击模式',
    focusDimensions: ['emotion', 'motivation', 'social.attachment_anxiety', 'social.attachment_avoidance', 'strengths'],
    phaseLabels: ['冲突地图', '剧本访谈', '阴影识别', '故事重写'],
    maxTurns: 8,
  },
  {
    id: 'relationalist',
    name: '关系导师',
    nameEn: 'The Relationalist',
    icon: '🤝',
    color: '#4FC3F7',
    archetype: '鲍尔比 × 罗杰斯',
    description: '解码人际默认剧本——依恋风格、边界感、冲突应对与关系升级',
    focusDimensions: ['social', 'emotion.empathy', 'emotion.emotion_regulation'],
    phaseLabels: ['人际雷达', '关系谱系', '冲突风格演练', '小实验设计'],
    maxTurns: 8,
  },
  {
    id: 'creator',
    name: '创造导师',
    nameEn: 'The Creator',
    icon: '🎨',
    color: '#FF80AB',
    archetype: '达芬奇 × 当代创意总监',
    description: '将抽象审美转化为可描述的作品特征与创作工作流',
    focusDimensions: ['aesthetic', 'strengths.creativity', 'strengths.curiosity', 'motivation.self_direction'],
    phaseLabels: ['审美地图', '创作史回顾', '审美细节', '阻力剖析'],
    maxTurns: 8,
  },
  {
    id: 'system_builder',
    name: '行动架构师',
    nameEn: 'The System Builder',
    icon: '⚙️',
    color: '#FFD700',
    archetype: '富兰克林 × 行为科学',
    description: '把所有洞见收束为可执行的习惯系统与升级实验方案',
    focusDimensions: ['personality.conscientiousness', 'strengths.perseverance', 'strengths.self_regulation', 'personality.self_efficacy', 'motivation.autonomy', 'motivation.competence'],
    phaseLabels: ['目标收束', '杠杆点选择', '实验设计', '监测机制'],
    maxTurns: 8,
  },
  {
    id: 'product_sage',
    name: '个人产品导师',
    nameEn: 'The Product Sage',
    icon: '💎',
    color: '#B388FF',
    archetype: '产品经理 × 生活设计师 × 审美总监',
    description: '将前几位智者输出的世界观、天赋、审美、行动建议收束为“产品与工具”的层面——用你的痛点和天赋，为自己设计产品',
    focusDimensions: ['motivation', 'aesthetic', 'strengths', 'cognitive'],
    phaseLabels: ['问题池构建', '适配度排序', '产品方向选择', '产品概念共创', '实现计划草拟'],
    maxTurns: 12,
    unlockCondition: ['creator', 'system_builder'],
  },
];

/** 推荐的默认对话顺序 */
export const DEFAULT_SAGE_ORDER: SageId[] = [
  'scientist',
  'philosopher',
  'analyst',
  'relationalist',
  'creator',
  'system_builder',
  'product_sage',
];

/** 快速查找表 */
export const SAGE_MAP: Record<SageId, SageDefinition> = Object.fromEntries(
  SAGE_DEFINITIONS.map(s => [s.id, s])
) as Record<SageId, SageDefinition>;
