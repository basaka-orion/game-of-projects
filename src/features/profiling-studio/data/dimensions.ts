import type { SubDimension } from '../types';

// ── Seven-Dimension Framework Constants ──
// Based on NotebookLM「全方位了解自己」research documents

export interface DimensionMeta {
  id: string;
  name: string;
  nameEn: string;
  icon: string;
  color: string;
  gradient: string;
  description: string;
  theoreticalBasis: string;
  subDimensions: SubDimension[];
  estimatedTime: number;
}

export const DIMENSIONS: DimensionMeta[] = [
  {
    id: 'cognitive',
    name: '认知架构',
    nameEn: 'Cognitive Architecture',
    icon: '🧠',
    color: '#64FFDA',
    gradient: 'linear-gradient(135deg, #64FFDA 0%, #00BFA5 100%)',
    description: '你如何思考 — 推理力、认知风格与元认知觉知',
    theoreticalBasis: 'CHC智力层级理论 · Kahneman双加工理论 · Flavell元认知理论',
    estimatedTime: 3,
    subDimensions: [
      { id: 'fluid_reasoning', name: '流体推理', nameEn: 'Fluid Reasoning', description: '抽象推理与模式识别能力', scaleRef: 'ICAR' },
      { id: 'cognitive_reflection', name: '认知反思', nameEn: 'Cognitive Reflection', description: '抵抗直觉陷阱，启动深度分析', scaleRef: 'CRT' },
      { id: 'thinking_style', name: '思维风格', nameEn: 'Thinking Style', description: '理性-分析 vs. 直觉-经验的偏好', scaleRef: 'REI' },
      { id: 'metacognition', name: '元认知觉知', nameEn: 'Metacognitive Awareness', description: '对自身思维过程的监控和调节', scaleRef: 'MAI' },
      { id: 'need_for_cognition', name: '认知需求', nameEn: 'Need for Cognition', description: '对深度思考的内在热爱程度', scaleRef: 'NFC' },
      { id: 'critical_thinking', name: '批判性思维', nameEn: 'Critical Thinking', description: '识别隐含假设、评估论证强弱与推理边界', scaleRef: 'WGCTA' },
    ],
  },
  {
    id: 'personality',
    name: '人格结构',
    nameEn: 'Personality Structure',
    icon: '🎭',
    color: '#BB86FC',
    gradient: 'linear-gradient(135deg, #BB86FC 0%, #6200EE 100%)',
    description: '你是谁 — 核心人格特质、气质倾向与心理韧性',
    theoreticalBasis: 'Big Five五因素模型 · HEXACO六因素 · Gray强化敏感性理论',
    estimatedTime: 4,
    subDimensions: [
      { id: 'extraversion', name: '外向性', nameEn: 'Extraversion', description: '社交活力、热情与主动性', scaleRef: 'IPIP-NEO' },
      { id: 'openness', name: '开放性', nameEn: 'Openness', description: '对新体验、想象力和智识好奇心的开放程度', scaleRef: 'IPIP-NEO' },
      { id: 'conscientiousness', name: '尽责性', nameEn: 'Conscientiousness', description: '条理性、自律和目标坚持', scaleRef: 'IPIP-NEO' },
      { id: 'agreeableness', name: '宜人性', nameEn: 'Agreeableness', description: '信任、合作与共情关怀', scaleRef: 'IPIP-NEO' },
      { id: 'neuroticism', name: '情绪稳定性', nameEn: 'Emotional Stability', description: '情绪波动性与压力抵抗（反向）', scaleRef: 'IPIP-NEO' },
      { id: 'honesty_humility', name: '诚实-谦逊', nameEn: 'Honesty-Humility', description: 'HEXACO第六因素：真诚、公正、不贪婪', scaleRef: 'HEXACO' },
      { id: 'resilience', name: '心理韧性', nameEn: 'Resilience', description: '从逆境中弹回的特质性能力', scaleRef: 'BRS' },
      { id: 'self_efficacy', name: '自我效能', nameEn: 'Self-Efficacy', description: '面对挑战时对自身能力的信心', scaleRef: 'GSE' },
    ],
  },
  {
    id: 'emotion',
    name: '情感系统',
    nameEn: 'Emotional System',
    icon: '💫',
    color: '#FF6B6B',
    gradient: 'linear-gradient(135deg, #FF6B6B 0%, #EE5A24 100%)',
    description: '你如何感受 — 情绪觉知、调节策略与共情能力',
    theoreticalBasis: 'Mayer-Salovey情绪智力四分支 · Gross情绪调节过程模型 · Davis多维共情',
    estimatedTime: 3,
    subDimensions: [
      { id: 'self_emotion', name: '自我情绪感知', nameEn: 'Self-Emotion Appraisal', description: '识别和理解自身情绪', scaleRef: 'WLEIS' },
      { id: 'other_emotion', name: '他人情绪感知', nameEn: 'Others-Emotion Appraisal', description: '感知和理解他人情绪', scaleRef: 'WLEIS' },
      { id: 'emotion_regulation', name: '情绪调节', nameEn: 'Emotion Regulation', description: '认知重评 vs. 表达抑制的策略偏好', scaleRef: 'ERQ' },
      { id: 'empathy', name: '共情能力', nameEn: 'Empathy', description: '认知共情(视角采择) + 情感共情(关怀)', scaleRef: 'IRI' },
      { id: 'meta_mood', name: '元情绪觉知', nameEn: 'Meta-Mood Awareness', description: '对自身情绪的注意、清晰度与修复力', scaleRef: 'TMMS' },
    ],
  },
  {
    id: 'motivation',
    name: '动机与价值',
    nameEn: 'Motivation & Values',
    icon: '🔥',
    color: '#FFD700',
    gradient: 'linear-gradient(135deg, #FFD700 0%, #FF8C00 100%)',
    description: '什么在驱动你 — 核心价值观、心理需求与时间视角',
    theoreticalBasis: 'Schwartz精炼价值理论 · Deci-Ryan自我决定理论 · Zimbardo时间视角',
    estimatedTime: 3,
    subDimensions: [
      { id: 'self_direction', name: '自我导向', nameEn: 'Self-Direction', description: '对自主思考和行动的重视', scaleRef: 'PVQ-RR' },
      { id: 'achievement', name: '成就追求', nameEn: 'Achievement', description: '对个人成功和能力展示的重视', scaleRef: 'PVQ-RR' },
      { id: 'benevolence', name: '仁慈关怀', nameEn: 'Benevolence', description: '对亲近之人福祉的重视', scaleRef: 'PVQ-RR' },
      { id: 'autonomy', name: '自主需求', nameEn: 'Autonomy Need', description: '自我决定理论三大基本需求之一', scaleRef: 'BPNSFS' },
      { id: 'competence', name: '胜任需求', nameEn: 'Competence Need', description: '对有效性和掌控感的需求', scaleRef: 'BPNSFS' },
      { id: 'relatedness', name: '关联需求', nameEn: 'Relatedness Need', description: '对归属和联结的需求', scaleRef: 'BPNSFS' },
    ],
  },
  {
    id: 'social',
    name: '社会联结',
    nameEn: 'Social Connection',
    icon: '🤝',
    color: '#4FC3F7',
    gradient: 'linear-gradient(135deg, #4FC3F7 0%, #0288D1 100%)',
    description: '你如何与人建立关系 — 依恋风格、人际模式与冲突策略',
    theoreticalBasis: 'Bowlby依恋理论 · Wiggins人际环形模型 · Rahim冲突处理理论',
    estimatedTime: 3,
    subDimensions: [
      { id: 'attachment_anxiety', name: '依恋焦虑', nameEn: 'Attachment Anxiety', description: '对被抛弃和不被爱的担忧', scaleRef: 'ECR-R' },
      { id: 'attachment_avoidance', name: '依恋回避', nameEn: 'Attachment Avoidance', description: '对亲密和依赖的不适', scaleRef: 'ECR-R' },
      { id: 'interpersonal_warmth', name: '人际温暖', nameEn: 'Interpersonal Warmth', description: '人际环形模型的温暖性维度', scaleRef: 'IPIP-IPC' },
      { id: 'interpersonal_dominance', name: '人际支配', nameEn: 'Interpersonal Dominance', description: '人际环形模型的支配性维度', scaleRef: 'IPIP-IPC' },
      { id: 'social_connectedness', name: '社会联结感', nameEn: 'Social Connectedness', description: '与社会世界的主观联结体验', scaleRef: 'SCS-R' },
      { id: 'conflict_style', name: '冲突处理', nameEn: 'Conflict Style', description: '整合/顺从/支配/回避/妥协五种风格', scaleRef: 'ROCI-II' },
    ],
  },
  {
    id: 'aesthetic',
    name: '审美与创造',
    nameEn: 'Aesthetics & Creativity',
    icon: '🎨',
    color: '#FF80AB',
    gradient: 'linear-gradient(135deg, #FF80AB 0%, #F50057 100%)',
    description: '你如何感受美与创造新事物 — 审美偏好、发散思维与创意自信',
    theoreticalBasis: 'Guilford发散思维理论 · Berlyne实验美学 · 创造力自我概念模型',
    estimatedTime: 4,
    subDimensions: [
      { id: 'divergent_thinking', name: '发散思维', nameEn: 'Divergent Thinking', description: '替代用途任务：流畅性、灵活性、独创性', scaleRef: 'AUT' },
      { id: 'aesthetic_sensitivity', name: '审美敏感', nameEn: 'Aesthetic Sensitivity', description: '对美的感受深度和审美情绪类型', scaleRef: 'AESTHEMOS' },
      { id: 'creative_achievement', name: '创意成就', nameEn: 'Creative Achievement', description: '十大领域的实际创造性产出', scaleRef: 'CAQ' },
      { id: 'creative_self', name: '创造力自我', nameEn: 'Creative Self-Concept', description: '创造力自我效能 + 创造性身份认同', scaleRef: 'SSCS' },
    ],
  },
  {
    id: 'worldview',
    name: '世界观与意义',
    nameEn: 'Worldview & Meaning',
    icon: '🌌',
    color: '#E040FB',
    gradient: 'linear-gradient(135deg, #E040FB 0%, #7C4DFF 100%)',
    description: '你如何理解世界与自我 — 生命意义、道德直觉与认知开放性',
    theoreticalBasis: 'Frankl意义治疗 · Haidt道德基础理论 · Antonovsky健康起源学',
    estimatedTime: 3,
    subDimensions: [
      { id: 'meaning_presence', name: '意义存在', nameEn: 'Presence of Meaning', description: '对生命目的和意义的清晰感', scaleRef: 'MLQ' },
      { id: 'meaning_search', name: '意义追寻', nameEn: 'Search for Meaning', description: '积极寻找生活意义的倾向', scaleRef: 'MLQ' },
      { id: 'moral_care', name: '关怀基础', nameEn: 'Care/Harm', description: '道德判断中的关怀/伤害敏感性', scaleRef: 'MFQ' },
      { id: 'moral_fairness', name: '公平基础', nameEn: 'Fairness/Cheating', description: '道德判断中的公平/欺骗敏感性', scaleRef: 'MFQ' },
      { id: 'open_minded_thinking', name: '开放思维', nameEn: 'Open-Minded Thinking', description: '积极寻求反面证据并更新信念', scaleRef: 'AOT' },
      { id: 'sense_of_coherence', name: '生活意义感', nameEn: 'Sense of Coherence', description: '世界可理解、可管理、有意义的信念', scaleRef: 'SOC-13' },
    ],
  },
  {
    id: 'strengths',
    name: '品格优势',
    nameEn: 'Character Strengths',
    icon: '💎',
    color: '#FF9800',
    gradient: 'linear-gradient(135deg, #FF9800 0%, #F57C00 100%)',
    description: '你的内在力量 — 品格资源、毅力、仁慈与希望感',
    theoreticalBasis: 'Peterson-Seligman VIA品格优势框架 · 积极心理学六大美德',
    estimatedTime: 4,
    subDimensions: [
      { id: 'creativity', name: '创造力', nameEn: 'Creativity', description: '用新颖有效的方式思考和行动', scaleRef: 'VIA' },
      { id: 'curiosity', name: '好奇心', nameEn: 'Curiosity', description: '对未知事物的探索欲和开放性', scaleRef: 'VIA' },
      { id: 'perseverance', name: '毅力', nameEn: 'Perseverance', description: '面对障碍仍坚持完成目标', scaleRef: 'VIA' },
      { id: 'kindness', name: '仁慈', nameEn: 'Kindness', description: '对他人慷慨、关爱、善意的倾向', scaleRef: 'VIA' },
      { id: 'fairness', name: '公平', nameEn: 'Fairness', description: '按公正原则平等对待所有人', scaleRef: 'VIA' },
      { id: 'prudence', name: '审慎', nameEn: 'Prudence', description: '谨慎选择，不做令自己后悔的事', scaleRef: 'VIA' },
      { id: 'self_regulation', name: '自我调节', nameEn: 'Self-Regulation', description: '对自身反应和欲望的管理能力', scaleRef: 'VIA' },
      { id: 'hope', name: '希望感', nameEn: 'Hope', description: '对美好未来的预期并积极行动', scaleRef: 'VIA' },
    ],
  },
];

// ── Lookup helpers ──
export const DIMENSION_MAP = Object.fromEntries(DIMENSIONS.map(d => [d.id, d]));
export const DIMENSION_IDS = DIMENSIONS.map(d => d.id);
export const DIMENSION_NAMES: Record<string, string> = Object.fromEntries(DIMENSIONS.map(d => [d.id, d.name]));
export const DIMENSION_COLORS: Record<string, string> = Object.fromEntries(DIMENSIONS.map(d => [d.id, d.color]));
