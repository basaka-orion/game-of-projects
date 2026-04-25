import type { HumanMapMode, HumanMapQuestionDef, HumanMapSignalId } from '../types';

export const HUMAN_MAP_SIGNAL_LABELS: Record<HumanMapSignalId, string> = {
  identity_meaning: '身份与意义',
  career_execution: '目标与执行',
  emotion_healing: '情绪与修复',
  relationship_pattern: '关系与边界',
  creativity_expression: '创造与表达',
  cognition_learning: '认知与学习',
};

export const HUMAN_MAP_MODE_META: Record<
  HumanMapMode,
  {
    title: string;
    subtitle: string;
    description: string;
    estimatedMinutes: number;
    accent: string;
    poster: string;
  }
> = {
  detailed: {
    title: '《人类数值地图 v1》详细版本',
    subtitle: '推荐 · 先用更完整的自我建模，再生成你的专属题路',
    description:
      '适合第一次认真做画像的人。系统会先收集你的阶段、困境、关系、价值、阴影与未来边界，再为你定制维度顺序和题目组合。',
    estimatedMinutes: 12,
    accent: '#64FFDA',
    poster: '长镜头建模',
  },
  compact: {
    title: '《人类数值地图 v1》精简版本',
    subtitle: '有个性的懒人 · 用更少的问题，快速搭出可用的人类骨架',
    description:
      '适合想快速进入测试、但又不想被统一题库粗暴对待的人。系统会抓最关键的输入，生成一条高密度定制路线。',
    estimatedMinutes: 7,
    accent: '#FFD166',
    poster: '高密度首版',
  },
  skip: {
    title: '统一问题版本',
    subtitle: '随大流 · 直接进入统一题库',
    description:
      '适合只想马上开始测评的人。你仍然可以之后再回来自定义路线，但这次题目会更偏统一化。',
    estimatedMinutes: 0,
    accent: '#B388FF',
    poster: '统一题库',
  },
};

export const HUMAN_MAP_ANSWERING_GUIDE = [
  '别选理想中的自己，优先回忆最近 30 天最常发生的一次。',
  '如果在两个选项间摇摆，想一想压力最大时你更像哪一边。',
  '如果还是犹豫，优先选那个“不用刻意用力就会自然发生”的答案。',
];

const DETAILED_QUESTIONS: HumanMapQuestionDef[] = [
  {
    id: 'preferred_name',
    section: '身份锚点',
    title: '怎么称呼你，最像真正的你？',
    prompt: '写下你希望系统如何称呼你，如果有多个名字，也可以分公开名、亲近名、内心名。',
    helper: '先写最舒服的称呼，再补一句为什么它最像你。',
    placeholder: '例如：大家叫我阿澈。这个名字最像我，因为它比身份证上的名字更轻、更真。',
    examples: ['公开名 / 亲近名 / 内心名', '哪个名字最像真正的你'],
    required: true,
  },
  {
    id: 'life_stage',
    section: '人生阶段',
    title: '你现在正处在人生的什么阶段？',
    prompt: '请用 1 个阶段词 + 1 段解释，描述你现在站在哪里。',
    helper: '可以先写“修复期 / 转型期 / 蓄力期 / 爆发前夜 / 迷茫期”等，再写原因。',
    placeholder: '例如：我像在转型期。旧的身份还没完全退出，新的方向已经在拉我前进，但节奏和资源都还没完全对齐。',
    examples: ['修复期', '转型期', '爆发前夜'],
    required: true,
    dimensionBias: { worldview: 10, motivation: 8, personality: 5 },
    signalHints: ['identity_meaning', 'career_execution'],
  },
  {
    id: 'key_events',
    section: '塑形经历',
    title: '哪些关键事件把你塑造成了现在这样？',
    prompt: '写 3-5 件最改变你的事，不分大小，不必体面。',
    helper: '每件事后面补一句：它把我改成了什么样。',
    placeholder: '例如：高三那次失败让我第一次意识到，我并不是靠天赋稳定赢的人；后来某段关系让我开始重建边界感。',
    examples: ['成功事件', '遗憾事件', '关系事件'],
    dimensionBias: { worldview: 8, emotion: 8, personality: 6, strengths: 4 },
    signalHints: ['identity_meaning', 'emotion_healing', 'relationship_pattern'],
  },
  {
    id: 'current_issues',
    section: '当前主线',
    title: '你现在最想解决的 3 个问题是什么？',
    prompt: '按重要性排序，越具体越好。',
    helper: '尽量写“卡在哪、为什么卡、你想变成什么样”。',
    placeholder: '例如：1. 执行力不稳定，知道该做什么却难以持续；2. 对未来方向焦虑；3. 亲密关系里边界感不稳。',
    examples: ['执行', '关系', '情绪', '职业', '方向'],
    required: true,
    dimensionBias: { motivation: 10, personality: 7, emotion: 6, worldview: 6 },
    signalHints: ['career_execution', 'emotion_healing', 'relationship_pattern'],
  },
  {
    id: 'ideal_state',
    section: '目标终点',
    title: '如果一切开始变顺，你最想抵达什么状态？',
    prompt: '不要写口号，写成你能看见的生活状态。',
    helper: '可以从工作、关系、身体、情绪、金钱、表达几个方面选你最在乎的。',
    placeholder: '例如：我希望自己每天起床知道先做什么，不再被情绪拖着走，有稳定输出，也有几段真正轻松的关系。',
    examples: ['更稳定', '更自由', '更清晰', '更有力量'],
    dimensionBias: { motivation: 8, worldview: 8, strengths: 6 },
    signalHints: ['career_execution', 'identity_meaning'],
  },
  {
    id: 'energy_environment',
    section: '能量系统',
    title: '什么环境让你像满血版自己，什么环境会让你迅速变形？',
    prompt: '请分别写“最充电的环境”和“最消耗的环境”。',
    helper: '从光线、噪音、人群、节奏、关系氛围、空间感这几个角度想。',
    placeholder: '例如：我在安静、可控、审美干净的空间里最清醒；在高频打断、情绪混乱、被催促的场里会迅速失真。',
    examples: ['安静/高刺激', '独处/多人', '可控/被催促'],
    dimensionBias: { emotion: 8, personality: 8, aesthetic: 5 },
    signalHints: ['emotion_healing', 'creativity_expression'],
  },
  {
    id: 'learning_pattern',
    section: '认知方式',
    title: '你学东西、做判断时，通常是怎么运作的？',
    prompt: '写你更像先抓结构、先上手、先模仿、先拆原理，还是先找高手。',
    helper: '顺便写一类你总能很快看懂的问题，和一类你总会卡住的问题。',
    placeholder: '例如：我通常先抓框架，再开始动手。只要是系统型问题我会很快上头，但涉及大量琐碎协调时容易掉线。',
    examples: ['先看全局', '先上手', '先拆原理', '容易卡住的类型'],
    dimensionBias: { cognitive: 12, strengths: 4, motivation: 3 },
    signalHints: ['cognition_learning', 'career_execution'],
  },
  {
    id: 'emotional_triggers',
    section: '情绪系统',
    title: '什么最容易让你愤怒、焦虑、羞耻或心寒？',
    prompt: '不必四种都答，写最常发生、最刺你的那几种即可。',
    helper: '最好带一个具体情境，而不是只写抽象名词。',
    placeholder: '例如：被误解、被轻视、被突然控制会让我很快炸掉；最深的羞耻是被看见自己不够强的时候。',
    examples: ['被误解', '被控制', '被否定', '被抛弃'],
    dimensionBias: { emotion: 12, personality: 7, social: 6 },
    signalHints: ['emotion_healing', 'relationship_pattern'],
  },
  {
    id: 'values_tradeoffs',
    section: '价值排序',
    title: '在真实取舍里，你更会优先什么？',
    prompt: '写一写当真相和关系、自由和稳定、长期意义和短期收益发生冲突时，你通常站哪边。',
    helper: '不写理想答案，写你真实反复做出的选择。',
    placeholder: '例如：我嘴上想要稳定，但真到关键时还是会选自由；真相和关系冲突时，我会先保留真相，但表达方式会更谨慎。',
    examples: ['真相 vs 关系', '自由 vs 稳定', '意义 vs 收益'],
    dimensionBias: { worldview: 12, motivation: 10, social: 4 },
    signalHints: ['identity_meaning', 'career_execution', 'relationship_pattern'],
  },
  {
    id: 'motivation_drive',
    section: '驱动力',
    title: '真正驱动你往前走的是什么？',
    prompt: '写能让你启动、让你持续、让你熬过去的东西。',
    helper: '可以写成：我靠什么启动，我靠什么坚持，我最深的欲望是什么。',
    placeholder: '例如：我靠好奇和不甘心启动，靠责任和想证明自己坚持；最深层其实是想活成一个不被定义的人。',
    examples: ['好奇', '成就', '被认可', '金钱', '不甘心', '使命'],
    dimensionBias: { motivation: 12, worldview: 6, strengths: 6 },
    signalHints: ['career_execution', 'identity_meaning', 'creativity_expression'],
  },
  {
    id: 'relationship_pattern',
    section: '关系模式',
    title: '你在亲密和冲突里，通常是什么样子？',
    prompt: '写你建立信任的速度、最怕关系里发生什么、冲突时更像追问、讲理、退场、讨好还是爆发。',
    helper: '如果你说不清，就想最近一次关系摩擦里你做了什么。',
    placeholder: '例如：我对人慢热，但一旦认定就会投入很深。冲突里我表面讲理，其实内心很怕被误解，所以会一边解释一边后撤。',
    examples: ['慢热 / 很快相信', '讲理 / 冷处理 / 爆发', '最怕被误解 / 被抛弃'],
    dimensionBias: { social: 12, emotion: 8, personality: 6 },
    signalHints: ['relationship_pattern', 'emotion_healing'],
  },
  {
    id: 'talents_strengths',
    section: '天赋与长板',
    title: '别人最常因为什么来找你？你哪部分明显比别人长？',
    prompt: '写别人常找你帮忙的地方、你学得快的能力、你怎么努力都不自然的能力。',
    helper: '把“擅长”和“低匹配”一起写，后面定制题才会更准。',
    placeholder: '例如：别人常来找我做结构梳理和表达润色；我学系统类东西很快，但纯机械重复和高频寒暄一直不自然。',
    examples: ['表达', '审美', '系统分析', '洞察人心', '执行', '创作'],
    dimensionBias: { strengths: 12, cognitive: 8, aesthetic: 6, personality: 4 },
    signalHints: ['cognition_learning', 'creativity_expression', 'career_execution'],
  },
  {
    id: 'shadow_loop',
    section: '阴影与坏循环',
    title: '你最反复出现的坏循环是什么？',
    prompt: '尽量写成“我常常先……然后……最后……”的句子。',
    helper: '比如：先兴奋、后过载、再自责；先讨好、后委屈、再抽离。',
    placeholder: '例如：我常常先把目标拉得很高，然后在失控时开始拖延，最后又靠临时爆发收尾，循环往复。',
    examples: ['先上头后透支', '先忍耐后爆发', '先理想化后失望'],
    dimensionBias: { personality: 10, emotion: 10, strengths: 6, social: 4 },
    signalHints: ['emotion_healing', 'career_execution', 'relationship_pattern'],
  },
  {
    id: 'future_boundary',
    section: '未来与分身边界',
    title: '10 年后的你想成为什么样？如果做数字化身，哪些决定绝不能替你做？',
    prompt: '写理想中的自己、你不要的成功，以及数字化身不能碰的底线。',
    helper: '这一题会直接影响系统怎么生成你后续的画像解释和分身权限。',
    placeholder: '例如：10 年后我想成为一个稳定、强韧、能持续创造的人。数字化身不能替我做感情承诺、价值观表态和大额金钱决定。',
    examples: ['理想中的自己', '不要的成功', '数字化身边界'],
    dimensionBias: { worldview: 10, strengths: 6, motivation: 6, social: 4 },
    signalHints: ['identity_meaning', 'creativity_expression'],
  },
];

const COMPACT_QUESTIONS: HumanMapQuestionDef[] = [
  DETAILED_QUESTIONS[0],
  DETAILED_QUESTIONS[1],
  DETAILED_QUESTIONS[3],
  DETAILED_QUESTIONS[5],
  DETAILED_QUESTIONS[6],
  DETAILED_QUESTIONS[7],
  DETAILED_QUESTIONS[10],
  DETAILED_QUESTIONS[13],
];

export const HUMAN_MAP_QUESTION_SETS: Record<Exclude<HumanMapMode, 'skip'>, HumanMapQuestionDef[]> = {
  detailed: DETAILED_QUESTIONS,
  compact: COMPACT_QUESTIONS,
};

export function getHumanMapQuestions(mode: Exclude<HumanMapMode, 'skip'>): HumanMapQuestionDef[] {
  return HUMAN_MAP_QUESTION_SETS[mode];
}
