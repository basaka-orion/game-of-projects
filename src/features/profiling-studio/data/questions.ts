import type { DimensionModule } from '../types';
import { DIMENSIONS } from './dimensions';

// ── Helper to build module from dimension meta ──
function buildModule(dimId: string, questions: DimensionModule['questions']): DimensionModule {
  const meta = DIMENSIONS.find(d => d.id === dimId)!;
  return {
    id: meta.id,
    name: meta.name,
    nameEn: meta.nameEn,
    icon: meta.icon,
    color: meta.color,
    gradient: meta.gradient,
    description: meta.description,
    theoreticalBasis: meta.theoreticalBasis,
    estimatedTime: meta.estimatedTime,
    subDimensions: meta.subDimensions,
    questions,
  };
}



// ════════════════════════════════════════════════════════════
// Ⅰ. 认知架构与智识风格 (5 sub-dims → 15 questions, was 9)
// ════════════════════════════════════════════════════════════
export const cognitiveModule = buildModule('cognitive', [
  // ── fluid_reasoning (ICAR) ── 3 items
  { id: 'cog3', text: '数字序列：2, 6, 12, 20, 30, ?', type: 'single', dimension: 'cognitive', subDimension: 'fluid_reasoning', scaleRef: 'ICAR', sourceType: 'adapted_open',
    correct: 'C', options: [{ value: 'A', label: '36' }, { value: 'B', label: '40' }, { value: 'C', label: '42' }, { value: 'D', label: '44' }] },
  { id: 'cog4', text: '如果所有 A 是 B，有些 B 是 C，那么：', type: 'single', dimension: 'cognitive', subDimension: 'fluid_reasoning', scaleRef: 'ICAR', sourceType: 'adapted_open',
    correct: 'C', options: [{ value: 'A', label: '所有 A 是 C' }, { value: 'B', label: '没有 A 是 C' }, { value: 'C', label: '有些 A 可能是 C' }, { value: 'D', label: '所有 C 是 A' }] },
  { id: 'cog3b', text: '数字序列：1, 1, 2, 3, 5, 8, ?', type: 'single', dimension: 'cognitive', subDimension: 'fluid_reasoning', scaleRef: 'ICAR', sourceType: 'adapted_open',
    correct: 'B', options: [{ value: 'A', label: '10' }, { value: 'B', label: '13' }, { value: 'C', label: '11' }, { value: 'D', label: '15' }] },

  // ── cognitive_reflection (CRT) ── 3 items
  { id: 'cog1', text: '一根球拍和一个球一共花了1.10元，球拍比球贵1元。请问球多少钱？', type: 'single', dimension: 'cognitive', subDimension: 'cognitive_reflection', scaleRef: 'CRT', sourceType: 'adapted_open',
    correct: 'A', options: [{ value: 'A', label: '0.05元' }, { value: 'B', label: '0.10元' }, { value: 'C', label: '0.15元' }, { value: 'D', label: '0.01元' }] },
  { id: 'cog2', text: '如果5台机器用5分钟做5个零件，那么100台机器做100个零件要多少分钟？', type: 'single', dimension: 'cognitive', subDimension: 'cognitive_reflection', scaleRef: 'CRT', sourceType: 'adapted_open',
    correct: 'B', options: [{ value: 'A', label: '100分钟' }, { value: 'B', label: '5分钟' }, { value: 'C', label: '20分钟' }, { value: 'D', label: '50分钟' }] },
  { id: 'cog2b', text: '湖上有一片睡莲，每天面积翻一倍。48天能铺满整个湖面，请问铺满一半湖面需要多少天？', type: 'single', dimension: 'cognitive', subDimension: 'cognitive_reflection', scaleRef: 'CRT', sourceType: 'adapted_open',
    correct: 'C', options: [{ value: 'A', label: '24天' }, { value: 'B', label: '36天' }, { value: 'C', label: '47天' }, { value: 'D', label: '46天' }] },

  // ── thinking_style (REI) ── 3 SJT items
  { id: 'cog5', text: '面对复杂问题时，我更倾向于：', type: 'single', dimension: 'cognitive', subDimension: 'thinking_style', scaleRef: 'REI', sourceType: 'adapted_theory',
    options: [{ value: 4, label: '逐步分析、列出利弊再做决定' }, { value: 3, label: '分析和直觉结合' }, { value: 2, label: '先凭直觉判断，再理性验证' }, { value: 1, label: '相信第一感觉，直觉很少出错' }] },
  { id: 'cog5b', text: '你需要在两个看起来差不多好的选择中做决定，你的做法是：', type: 'sjt', dimension: 'cognitive', subDimension: 'thinking_style', scaleRef: 'REI', sourceType: 'adapted_theory',
    options: [
      { value: 4, label: '制作对比表格，逐项打分分析' },
      { value: 3, label: '搜集关键信息后综合判断' },
      { value: 2, label: '想一想就凭感觉选了' },
      { value: 1, label: '闭上眼，哪个让我更兴奋就选哪个' },
    ]},
  { id: 'cog5c', text: '数据分析告诉你方案A更好，但你的直觉强烈指向方案B：', type: 'sjt', dimension: 'cognitive', subDimension: 'thinking_style', scaleRef: 'REI', sourceType: 'adapted_theory',
    options: [
      { value: 1, label: '毫不犹豫选B，我对自己的直觉非常信任' },
      { value: 2, label: '倾向B，但再看看有没有遗漏的变量' },
      { value: 3, label: '倾向A，数据比直觉更可靠' },
      { value: 4, label: '必须选A，决策不能靠感觉' },
    ]},

  // ── need_for_cognition (NFC) ── 3 SJT items
  { id: 'cog6', text: '朋友推荐了一部据说"很烧脑"的悬疑电影：', type: 'sjt', dimension: 'cognitive', subDimension: 'need_for_cognition', scaleRef: 'NFC', sourceType: 'adapted_theory',
    options: [
      { value: 4, label: '太好了！我就喜欢那种需要全程高度集中注意力去推理的片子' },
      { value: 3, label: '可以看看，挑战大脑挺有意思' },
      { value: 2, label: '如果评分高就看，但有时候也怕看不懂' },
      { value: 1, label: '我更喜欢轻松的娱乐片' },
    ]},
  { id: 'cog7', text: '周末有两个活动可选：A是一场关于宇宙起源的讲座，B是朋友组织的户外BBQ：', type: 'sjt', dimension: 'cognitive', subDimension: 'need_for_cognition', scaleRef: 'NFC', sourceType: 'adapted_theory',
    options: [
      { value: 4, label: '毫不犹豫选A，探索抽象概念让我兴奋' },
      { value: 3, label: '两者都想去，但讲座更让我心动' },
      { value: 2, label: '选BBQ，周末就想放松' },
      { value: 1, label: '绝对选BBQ，讲座太"费脑"了' },
    ]},
  { id: 'cog7b', text: '工作中遇到一个极其复杂的技术难题，预计要花好几天才能解决：', type: 'sjt', dimension: 'cognitive', subDimension: 'need_for_cognition', scaleRef: 'NFC', sourceType: 'adapted_theory',
    options: [
      { value: 4, label: '兴奋！这种调动全部智力的挑战让我充满动力' },
      { value: 3, label: '虽然有压力但也享受攻克难题的过程' },
      { value: 2, label: '能做但更希望有更简单的替代方案' },
      { value: 1, label: '很头疼，希望能派给别人' },
    ]},

  // ── metacognition (MAI) ── 3 SJT items
  { id: 'cog8', text: '你要学一门完全陌生的技能（比如编程/乐器/新语言），你的第一步是：', type: 'sjt', dimension: 'cognitive', subDimension: 'metacognition', scaleRef: 'MAI', sourceType: 'adapted_theory',
    options: [
      { value: 4, label: '先研究最高效的学习路线图和方法论' },
      { value: 3, label: '了解一下大框架，然后边做边学' },
      { value: 2, label: '直接上手，实践出真知' },
      { value: 1, label: '打开教程就跟着做，不太考虑方法' },
    ]},
  { id: 'cog9', text: '你花了一整天准备的演讲效果不理想，你之后会：', type: 'sjt', dimension: 'cognitive', subDimension: 'metacognition', scaleRef: 'MAI', sourceType: 'adapted_theory',
    options: [
      { value: 4, label: '复盘全过程：哪里准备不足？节奏错在哪？下次如何改进？' },
      { value: 3, label: '想一想主要问题出在哪里' },
      { value: 2, label: '有些沮丧，但不太会细想原因' },
      { value: 1, label: '算了，下次再说' },
    ]},
  { id: 'cog9b', text: '你用了一种方法做某件事，进展很慢，你的反应：', type: 'sjt', dimension: 'cognitive', subDimension: 'metacognition', scaleRef: 'MAI', sourceType: 'adapted_theory',
    options: [
      { value: 4, label: '立刻暂停，分析瓶颈在哪，换一种策略' },
      { value: 3, label: '意识到效率低了，再坚持一会看看' },
      { value: 2, label: '继续做下去，也许慢慢会好' },
      { value: 1, label: '没意识到效率低，一直按老方法做' },
    ]},

  // ══════════════════════════════════════════════════════════
  // ── critical_thinking (WGCTA-style) ── 6 single_choice items (V2.1)
  // ══════════════════════════════════════════════════════════
  { id: 'ct_1', text: '某公司准备砍掉一条老产品线，经理在会上说：\n"这条产品线的利润率这两年明显下降，说明客户已经不太需要它了，我们应该把资源全部投入到新业务上。"\n下面哪一项，是这段话中隐含但没有直接说出的假设？', type: 'single_choice', dimension: 'cognitive', subDimension: 'critical_thinking', scaleRef: 'WGCTA', sourceType: 'original',
    choiceOptions: ['A. 公司现在的财务状况整体良好。', 'B. 利润率下降主要是因为客户需求减少，而不是成本或定价问题。', 'C. 新业务的利润率一定会高于老产品线。', 'D. 客户对公司品牌已经失去信任。'],
    correctOption: 'B' },
  { id: 'ct_2', text: '有同事提出：\n"我们不需要在官网上增加任何隐私说明，因为目前还没有用户因为隐私问题起诉我们。"\n从批判性思维的角度看，下列哪一项是对这个观点最有力的反驳？', type: 'single_choice', dimension: 'cognitive', subDimension: 'critical_thinking', scaleRef: 'WGCTA', sourceType: 'original',
    choiceOptions: ['A. 很多用户其实并不了解自己的隐私权利。', 'B. 竞争对手的网站都有详细的隐私说明。', 'C. 没有人起诉并不代表没有风险，隐私说明是预防性措施。', 'D. 法律环境在不断变化，将来可能会更严格。'],
    correctOption: 'C' },
  { id: 'ct_3', text: '公司一份内部报告写道：\n"参加过系统培训的新员工，在入职三个月内的离职率明显低于没有参加培训的新员工。"\n下面哪一项推论最合适？', type: 'single_choice', dimension: 'cognitive', subDimension: 'critical_thinking', scaleRef: 'WGCTA', sourceType: 'original',
    choiceOptions: ['A. 培训是导致所有员工长期留任的唯一原因。', 'B. 参加培训的新员工在能力上一定强于其他人。', 'C. 培训可能与降低前三个月离职率有关，但是否能长期留任还需要更多数据。', 'D. 以后所有员工都必须参加培训，否则一定会离职。'],
    correctOption: 'C' },
  { id: 'ct_4', text: '前提：\n1）所有进入"核心项目组"的员工都需要通过高级代码审查考核。\n2）小李已经通过了高级代码审查考核。\n在只根据上述前提的前提下，下面哪项结论是正确的？', type: 'single_choice', dimension: 'cognitive', subDimension: 'critical_thinking', scaleRef: 'WGCTA', sourceType: 'original',
    choiceOptions: ['A. 小李一定在核心项目组。', 'B. 小李不在核心项目组。', 'C. 小李有可能在核心项目组，但也可能还没被分配进去。', 'D. 小李肯定是公司技术最强的那一批人。'],
    correctOption: 'C' },
  { id: 'ct_5', text: '一位产品经理说：\n"最近我们的日活下降，主要原因是天气变冷，大家更愿意线下聚会而不是刷手机。"\n从解释质量来看，下面哪一项评价更合理？', type: 'single_choice', dimension: 'cognitive', subDimension: 'critical_thinking', scaleRef: 'WGCTA', sourceType: 'original',
    choiceOptions: ['A. 这个解释很合理，因为天气确实会影响所有 App 的日活。', 'B. 这个解释证据不足，需要看是否有数据支持"线下聚会增多"以及竞品是否也同步下降。', 'C. 只要产品经理这么说，就说明一定是这样。', 'D. 只要再多做几次促销活动，就可以证明这个解释是错的。'],
    correctOption: 'B' },
  { id: 'ct_6', text: '有同事反对公司推行弹性远程办公，他的论点是：\n"只要允许远程办公，员工就会越来越懒散，工作效率一定会大幅下降。"\n对这个论点的评价，哪一项最恰当？', type: 'single_choice', dimension: 'cognitive', subDimension: 'critical_thinking', scaleRef: 'WGCTA', sourceType: 'original',
    choiceOptions: ['A. 这是个很有力的论点，因为有些人在家确实效率很低。', 'B. 这是个很弱的论点，因为它把所有员工一概而论，又没有任何数据支撑。', 'C. 只要领导同意远程办公，这个论点就不重要了。', 'D. 只要别的公司也远程，我们跟着做就行，不必评价论证本身。'],
    correctOption: 'B' },
]);

// ════════════════════════════════════════════════════════════
// Ⅱ. 人格结构与气质特征 (8 sub-dims → 24 questions, was 13)
// ════════════════════════════════════════════════════════════
export const personalityModule = buildModule('personality', [
  // ── extraversion (IPIP-NEO) ── 3 SJT items
  { id: 'per1', text: '周五下班后，同事临时发起聚餐邀请。你已经很疲惫了，但是：', type: 'sjt', dimension: 'personality', subDimension: 'extraversion', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '立刻答应，和人在一起就是最好的充电' },
      { value: 3, label: '犹豫一下还是去了，社交还是挺开心的' },
      { value: 2, label: '看看去的人再决定，熟人才去' },
      { value: 1, label: '婉拒，独处才能恢复能量' },
    ]},
  { id: 'per2', text: '你走进一个几乎没有认识人的行业交流会，你最可能：', type: 'sjt', dimension: 'personality', subDimension: 'extraversion', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '主动找人攀谈，享受认识新朋友的过程' },
      { value: 3, label: '先观察一会儿，找到合适的人再搭话' },
      { value: 2, label: '找到角落坐下，等别人来和我说话' },
      { value: 1, label: '待一会儿就想离开，这种场合让我不自在' },
    ]},
  { id: 'per2b', text: '团队需要一个人在全公司面前做项目汇报，你的反应是：', type: 'sjt', dimension: 'personality', subDimension: 'extraversion', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '我来！喜欢成为焦点的感觉' },
      { value: 3, label: '可以，虽然有点紧张但挺期待' },
      { value: 2, label: '如果没人愿意，我勉强上' },
      { value: 1, label: '能推就推，太煎熬了' },
    ]},

  // ── openness (IPIP-NEO) ── 3 SJT items
  { id: 'per3', text: '旅行时突然发现一条未标记的小路，通向未知区域：', type: 'sjt', dimension: 'personality', subDimension: 'openness', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '兴奋！立刻走进去探索未知' },
      { value: 3, label: '拍个照标记一下，找时间再来' },
      { value: 2, label: '好奇但还是走计划好的路线' },
      { value: 1, label: '不感兴趣，按原定路线更安心' },
    ]},
  { id: 'per4', text: '朋友推荐了一部非常先锋的实验电影，和你平时看的完全不同：', type: 'sjt', dimension: 'personality', subDimension: 'openness', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '太好了，我就爱这种打破常规的东西' },
      { value: 3, label: '可以试试看，即使不喜欢也是一种体验' },
      { value: 2, label: '先看评价再决定，怕浪费时间' },
      { value: 1, label: '算了，我还是看自己熟悉的类型吧' },
    ]},
  { id: 'per4b', text: '你在书店无意中翻到一本完全陌生领域的书（量子物理/古希腊哲学/爵士乐理论）：', type: 'sjt', dimension: 'personality', subDimension: 'openness', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '买下来！沉浸在未知知识中让我兴奋' },
      { value: 3, label: '翻几页看看，有趣就买' },
      { value: 2, label: '拍个照，也许以后会看' },
      { value: 1, label: '放下，我更想找自己专业相关的书' },
    ]},

  // ── conscientiousness (IPIP-NEO) ── 3 SJT items
  { id: 'per5', text: '距离重要项目截止还有两周，你现在最可能的状态是：', type: 'sjt', dimension: 'personality', subDimension: 'conscientiousness', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '已经做了详细计划并稳步推进，现在进度过半' },
      { value: 3, label: '大致计划好了，正在按节奏执行' },
      { value: 2, label: '知道要做但还没真正开始，准备这周加油' },
      { value: 1, label: '还没仔细想过，到时候再说' },
    ]},
  { id: 'per6', text: '你发现桌上堆了一周的文件和杂物：', type: 'sjt', dimension: 'personality', subDimension: 'conscientiousness', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 1, label: '这是常态，我在混乱中反而效率更高' },
      { value: 2, label: '有点乱但不影响工作，周末集中收拾' },
      { value: 3, label: '觉得该整理了，花半小时归类' },
      { value: 4, label: '不可能发生，我每天都会整理桌面' },
    ]},
  { id: 'per6b', text: '你正在读一本很长的书，读了三分之一发现并不如预期精彩：', type: 'sjt', dimension: 'personality', subDimension: 'conscientiousness', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '既然开始了就读完，不喜欢半途而废' },
      { value: 3, label: '跳着读核心章节，不浪费前面的投入' },
      { value: 2, label: '放一放，也许之后会有心情继续' },
      { value: 1, label: '直接换一本，生命不该浪费在不喜欢的事上' },
    ]},

  // ── agreeableness (IPIP-NEO) ── 3 SJT items
  { id: 'per7', text: '网上一个陌生人请你帮忙推荐你所在城市的餐厅：', type: 'sjt', dimension: 'personality', subDimension: 'agreeableness', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '详细列了一份清单还附上点餐建议' },
      { value: 3, label: '推荐了两三家我常去的' },
      { value: 2, label: '随手分享了一个大众点评链接' },
      { value: 1, label: '没有回复，帮陌生人没有义务' },
    ]},
  { id: 'per8', text: '朋友半夜发消息说心情很差，但你明天有重要会议：', type: 'sjt', dimension: 'personality', subDimension: 'agreeableness', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '立刻打电话过去，朋友比睡眠重要' },
      { value: 3, label: '先文字安慰，约第二天下班细聊' },
      { value: 2, label: '回一句"我在，明天聊"就去睡了' },
      { value: 1, label: '看到了但选择明天再说' },
    ]},
  { id: 'per8b', text: '同事在会议上激烈批评了你的方案，你之后的反应是：', type: 'sjt', dimension: 'personality', subDimension: 'agreeableness', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '主动找对方聊，理解他的顾虑并寻求共识' },
      { value: 3, label: '私下思考对方的观点，承认有道理的部分' },
      { value: 2, label: '有点不爽但不说，保持专业距离' },
      { value: 1, label: '直接回击，捍卫自己的方案' },
    ]},

  // ── neuroticism (IPIP-NEO) ── 3 SJT items
  { id: 'per9', text: '你发出一条重要工作邮件后，对方超过24小时没回复：', type: 'sjt', dimension: 'personality', subDimension: 'neuroticism', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '反复检查邮件内容，焦虑自己是不是写错了什么' },
      { value: 3, label: '有些担心，但忍住没有催促' },
      { value: 2, label: '可能对方忙，再等等看' },
      { value: 1, label: '完全不在意，该回的时候自然会回' },
    ]},
  { id: 'per10', text: '你在公共场合不小心说错了话，引起了几个人的注意：', type: 'sjt', dimension: 'personality', subDimension: 'neuroticism', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '回家后反复回想这个尴尬场景，久久不能释怀' },
      { value: 3, label: '当时很尴尬，但过几个小时就忘了' },
      { value: 2, label: '笑着自嘲化解，不太在意' },
      { value: 1, label: '完全无感，人生就是这样' },
    ]},
  { id: 'per10b', text: '下周有一场不太确定能否通过的面试/考试，这几天你：', type: 'sjt', dimension: 'personality', subDimension: 'neuroticism', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '焦虑到失眠，脑子里全是"万一失败怎么办"' },
      { value: 3, label: '有些紧张，但尽量转移注意力' },
      { value: 2, label: '该准备的准备了，顺其自然' },
      { value: 1, label: '没什么感觉，结果如何都能接受' },
    ]},

  // ── honesty_humility (HEXACO) ── 3 SJT items
  { id: 'per11', text: '你在超市结账后发现收银员少收了50元，你会：', type: 'sjt', dimension: 'personality', subDimension: 'honesty_humility', scaleRef: 'HEXACO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '立刻返回告知收银员' },
      { value: 3, label: '犹豫一下但还是回去说了' },
      { value: 2, label: '心里有点纠结，但最终没有回去' },
      { value: 1, label: '运气好，不关我的事' },
    ]},
  { id: 'per11b', text: '朋友圈里有人在炫耀新买的奢侈品，你的真实内心反应：', type: 'sjt', dimension: 'personality', subDimension: 'honesty_humility', scaleRef: 'HEXACO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '随他去，物质对我来说没那么重要' },
      { value: 3, label: '看到了，没什么感觉' },
      { value: 2, label: '有一点小羡慕，但很快过去' },
      { value: 1, label: '挺羡慕的，也想拥有那种生活' },
    ]},
  { id: 'per11c', text: '你在团队项目中犯了一个没人发现的小错误：', type: 'sjt', dimension: 'personality', subDimension: 'honesty_humility', scaleRef: 'HEXACO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '主动在群里坦白并修正' },
      { value: 3, label: '悄悄改正，但不特别说明' },
      { value: 2, label: '先看看影响大不大，大了再说' },
      { value: 1, label: '既然没人发现，就让它过去吧' },
    ]},

  // ── resilience (BRS) ── 3 SJT items
  { id: 'per12', text: '你被心仪的公司拒绝了，收到拒信的那天你：', type: 'sjt', dimension: 'personality', subDimension: 'resilience', scaleRef: 'BRS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '难过一会儿，当晚就开始投下一家' },
      { value: 3, label: '允许自己沮丧两天，然后重新出发' },
      { value: 2, label: '低落了一周，但最终还是振作了' },
      { value: 1, label: '很长时间都走不出来，开始怀疑自己' },
    ]},
  { id: 'per12b', text: '你精心准备的活动因为意外原因被迫取消：', type: 'sjt', dimension: 'personality', subDimension: 'resilience', scaleRef: 'BRS', sourceType: 'adapted_open',
    options: [
      { value: 1, label: '崩溃，所有努力都白费了' },
      { value: 2, label: '很失望，需要一段时间消化' },
      { value: 3, label: '可惜，但开始想替代方案' },
      { value: 4, label: '也许是个机会，换个方式可能更好' },
    ]},
  { id: 'per12c', text: '生活中连续遭遇几件不顺心的事，你最可能的应对方式：', type: 'sjt', dimension: 'personality', subDimension: 'resilience', scaleRef: 'BRS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '告诉自己"坏运气总会过去"，积极找解决办法' },
      { value: 3, label: '虽然低落，但还是坚持日常节奏' },
      { value: 2, label: '暂时放弃一些目标，降低预期' },
      { value: 1, label: '感觉被打垮了，什么都不想做' },
    ]},

  // ── self_efficacy (GSE) ── 3 SJT items
  { id: 'per13', text: '老板交给你一个你从未接触过的领域的项目：', type: 'sjt', dimension: 'personality', subDimension: 'self_efficacy', scaleRef: 'GSE', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '虽然陌生但有信心搞定，我总能想到办法' },
      { value: 3, label: '有点忐忑但愿意挑战，边学边做' },
      { value: 2, label: '希望能有人带我，单独做没把握' },
      { value: 1, label: '很慌，觉得自己可能胜任不了' },
    ]},
  { id: 'per13b', text: '你提出的方案遭到了团队中大多数人的反对：', type: 'sjt', dimension: 'personality', subDimension: 'self_efficacy', scaleRef: 'GSE', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '冷静分析反对意见，用更多数据说服他们' },
      { value: 3, label: '调整方案吸收合理建议，但坚持核心思路' },
      { value: 2, label: '有些动摇，考虑是不是自己判断有误' },
      { value: 1, label: '既然多数人反对，那就按他们的来吧' },
    ]},
  { id: 'per13c', text: '你面临一个紧急且复杂的问题，时间非常有限：', type: 'sjt', dimension: 'personality', subDimension: 'self_efficacy', scaleRef: 'GSE', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '保持冷静，快速拆解问题逐步解决' },
      { value: 3, label: '有压力但还是能理性应对' },
      { value: 2, label: '先深呼吸让自己冷静下来再行动' },
      { value: 1, label: '脑子一片空白，不知道从哪开始' },
    ]},
]);

// ════════════════════════════════════════════════════════════
// Ⅲ. 情感系统与情绪能力 (5 sub-dims → 15 questions, was 9)
// ════════════════════════════════════════════════════════════
export const emotionModule = buildModule('emotion', [
  // ── self_emotion (WLEIS) ── 3 SJT items
  { id: 'emo1', text: '你突然对一个平时很喜欢的朋友产生了莫名的烦躁感，你会：', type: 'sjt', dimension: 'emotion', subDimension: 'self_emotion', scaleRef: 'WLEIS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '立刻意识到"这不是对TA的烦躁"，开始回溯真正的原因' },
      { value: 3, label: '觉得奇怪，花一些时间想想是怎么回事' },
      { value: 2, label: '感觉不对劲但说不上来为什么' },
      { value: 1, label: '直接对朋友表现出不耐烦' },
    ]},
  { id: 'emo2', text: '工作中突然感到一阵低落，你最可能的反应：', type: 'sjt', dimension: 'emotion', subDimension: 'self_emotion', scaleRef: 'WLEIS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '马上识别出：这是因为早上那件事触发的失落感' },
      { value: 3, label: '暂停手头工作，试着理清这种低落从何而来' },
      { value: 2, label: '知道自己心情不好，但不确定为什么' },
      { value: 1, label: '继续工作，无暇顾及情绪' },
    ]},
  { id: 'emo2b', text: '朋友问你"最近感觉怎么样"，你能做到：', type: 'sjt', dimension: 'emotion', subDimension: 'self_emotion', scaleRef: 'WLEIS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '精确描述：最近有些焦虑但也有期待，因为…' },
      { value: 3, label: '说出大致感受：挺好的/有点累' },
      { value: 2, label: '只能说"还行吧"，具体说不上来' },
      { value: 1, label: '习惯性说"挺好的"，没想过这个问题' },
    ]},

  // ── other_emotion (WLEIS) ── 3 SJT items
  { id: 'emo3', text: '视频通话中朋友说"我挺好的"，但你注意到TA的眼睛有点红：', type: 'sjt', dimension: 'emotion', subDimension: 'other_emotion', scaleRef: 'WLEIS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '轻声说"我感觉你今天不太对，想聊聊吗"' },
      { value: 3, label: '不直接戳破，但多待一会儿陪着' },
      { value: 2, label: '注意到了但不确定是不是自己多想' },
      { value: 1, label: '没有注意到这个细节' },
    ]},
  { id: 'emo3b', text: '同事平时很活跃，今天开会一言不发，你会：', type: 'sjt', dimension: 'emotion', subDimension: 'other_emotion', scaleRef: 'WLEIS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '会后私下问一句"今天看你不太在状态，还好吗"' },
      { value: 3, label: '心里记下来，看看之后会不会好起来' },
      { value: 2, label: '可能注意到了但没多想' },
      { value: 1, label: '完全没注意到异常' },
    ]},
  { id: 'emo3c', text: '接电话时对方用很平静的语气说了一句"没关系"，你判断：', type: 'sjt', dimension: 'emotion', subDimension: 'other_emotion', scaleRef: 'WLEIS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '从语调里听出了委屈/失望，直觉告诉我TA介意' },
      { value: 3, label: '觉得可能有微妙情绪，但不完全确定' },
      { value: 2, label: '觉得既然说没关系，应该就是没关系' },
      { value: 1, label: '没有特别注意对方的语气' },
    ]},

  // ── emotion_regulation (ERQ) ── 3 SJT items
  { id: 'emo4', text: '你收到一封让你非常愤怒的邮件，手指已经放在了回复键上：', type: 'sjt', dimension: 'emotion', subDimension: 'emotion_regulation', scaleRef: 'ERQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '切换视角：对方可能也有苦衷，先冷静构思回复' },
      { value: 3, label: '先存草稿，第二天再决定是否发送' },
      { value: 2, label: '深呼吸几次，但回复时语气还是带着不满' },
      { value: 1, label: '直接回复，当下的愤怒需要表达出来' },
    ]},
  { id: 'emo5', text: '你在重要的客户面前收到了一个非常沮丧的私人消息：', type: 'sjt', dimension: 'emotion', subDimension: 'emotion_regulation', scaleRef: 'ERQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '内心波动但面不改色，完美完成会议' },
      { value: 3, label: '稍微走神了一下但很快调整回来' },
      { value: 2, label: '勉强维持但对方可能察觉到了异样' },
      { value: 1, label: '情绪明显受影响，需要暂时中断' },
    ]},
  { id: 'emo5b', text: '你苦等了三个月的升职机会给了别人，而你觉得自己更适合：', type: 'sjt', dimension: 'emotion', subDimension: 'emotion_regulation', scaleRef: 'ERQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '重新解读：也许现在岗位有我没看到的成长空间' },
      { value: 3, label: '虽然失望，但理性分析差距在哪里' },
      { value: 2, label: '难过好几天，需要朋友的安慰才能振作' },
      { value: 1, label: '非常愤怒/沮丧，认为公司不公平' },
    ]},

  // ── empathy (IRI) ── 3 SJT items (emo6 already was SJT, keep & add 2)
  { id: 'emo6', text: '当朋友看起来很沮丧但说"没事"时，你通常会：', type: 'sjt', dimension: 'emotion', subDimension: 'empathy', scaleRef: 'IRI', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '温和追问，关注非语言线索' },
      { value: 3, label: '表示关心但尊重对方意愿' },
      { value: 2, label: '觉得对方说没事就是没事' },
      { value: 1, label: '不太注意到这些变化' },
    ]},
  { id: 'emo7', text: '你的同事在讨论中提出了一个你觉得明显错误的方案：', type: 'sjt', dimension: 'emotion', subDimension: 'empathy', scaleRef: 'IRI', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '先想想TA为什么会这样提议，理解TA的出发点再回应' },
      { value: 3, label: '委婉提出不同意见，同时肯定TA思考的方向' },
      { value: 2, label: '直接指出问题所在，效率第一' },
      { value: 1, label: '内心否定但不太想讨论' },
    ]},
  { id: 'emo7b', text: '刷社交媒体看到一个陌生人讲述自己的困境：', type: 'sjt', dimension: 'emotion', subDimension: 'empathy', scaleRef: 'IRI', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '会不由自主地代入对方处境，心里很不好受' },
      { value: 3, label: '觉得心酸，留下一句鼓励的评论' },
      { value: 2, label: '看到了，同情一下然后滑过' },
      { value: 1, label: '没什么感觉，网上的事不太触动我' },
    ]},

  // ── meta_mood (TMMS) ── 3 SJT items
  { id: 'emo8', text: '你发现自己这一周三次在同样的事情上莫名烦躁：', type: 'sjt', dimension: 'emotion', subDimension: 'meta_mood', scaleRef: 'TMMS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '坐下来分析：这个模式说明我底层有个需求没被满足' },
      { value: 3, label: '意识到这是个信号，开始留意触发条件' },
      { value: 2, label: '觉得最近运气不好，希望会自己过去' },
      { value: 1, label: '没注意到这是一个重复模式' },
    ]},
  { id: 'emo9', text: '你陷入了持续好几天的低落情绪，你如何应对：', type: 'sjt', dimension: 'emotion', subDimension: 'meta_mood', scaleRef: 'TMMS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '有自己的"情绪修复工具箱"——跑步/写日记/特定音乐' },
      { value: 3, label: '找朋友倾诉或者做点让自己开心的事' },
      { value: 2, label: '等着它自己过去，通常时间能解决' },
      { value: 1, label: '不知道怎么处理，只能硬扛' },
    ]},
  { id: 'emo9b', text: '回顾上个月你的情绪起伏，你能说出：', type: 'sjt', dimension: 'emotion', subDimension: 'meta_mood', scaleRef: 'TMMS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '具体是哪些事在哪些时刻触发了什么情绪' },
      { value: 3, label: '大致的情绪走向和几个关键节点' },
      { value: 2, label: '总体感觉好或不好，细节记不太清' },
      { value: 1, label: '完全说不出来，没有这个习惯' },
    ]},
]);

// ════════════════════════════════════════════════════════════
// Ⅳ. 动机引擎与价值体系 (6 sub-dims → 18 questions, was 8)
// ════════════════════════════════════════════════════════════
export const motivationModule = buildModule('motivation', [
  // ── self_direction (PVQ-RR) ── 3 SJT items
  { id: 'val1', text: '公司要求所有人统一使用一套"标准方法论"，但你觉得你的独特方法更高效：', type: 'sjt', dimension: 'motivation', subDimension: 'self_direction', scaleRef: 'PVQ-RR', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '坚持自己的方法并用结果证明，独立思考比服从更重要' },
      { value: 3, label: '在核心环节保留自己的做法，其他部分适配标准' },
      { value: 2, label: '虽然不太认同但还是照着公司的来' },
      { value: 1, label: '觉得统一标准挺好的，减少思考负担' },
    ]},
  { id: 'val4', text: '如果你获得一笔意外之财，你最想做什么？', type: 'single', dimension: 'motivation', subDimension: 'self_direction', scaleRef: 'PVQ-RR', sourceType: 'adapted_open',
    options: [
      { value: 'benevolence', label: '帮助需要的人' },
      { value: 'achievement', label: '投资自己，提升能力' },
      { value: 'hedonism', label: '享受生活，旅行放松' },
      { value: 'security', label: '存起来以备不时之需' },
    ]},
  { id: 'val1b', text: '朋友们都劝你选一条"更安全的路"，但你内心有另一个想法：', type: 'sjt', dimension: 'motivation', subDimension: 'self_direction', scaleRef: 'PVQ-RR', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '谢谢建议，但我需要走自己相信的路' },
      { value: 3, label: '认真考虑他们的意见，但最终还是遵循内心' },
      { value: 2, label: '会被他们的话动摇，犹豫不决' },
      { value: 1, label: '选安全的路，大家说得有道理' },
    ]},

  // ── achievement (PVQ-RR) ── 3 SJT items
  { id: 'val2', text: '你的项目取得了不错的成果，但最终只被归功给了团队，没提到你的名字：', type: 'sjt', dimension: 'motivation', subDimension: 'achievement', scaleRef: 'PVQ-RR', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '很在意，我需要我的贡献被看见和认可' },
      { value: 3, label: '有些失落，但总体能接受' },
      { value: 2, label: '无所谓，团队好就行' },
      { value: 1, label: '完全不在意个人名声' },
    ]},
  { id: 'val2b', text: '有两份工作可选：A稳定舒适但天花板低，B充满挑战但可能做到行业顶尖：', type: 'sjt', dimension: 'motivation', subDimension: 'achievement', scaleRef: 'PVQ-RR', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '毫不犹豫选B，我要做到最好' },
      { value: 3, label: '倾向B，但会评估风险再决定' },
      { value: 2, label: '倾向A，稳定对我更重要' },
      { value: 1, label: '选A，追求卓越太累了' },
    ]},
  { id: 'val2c', text: '周末你本想休息，但有个业内顶级线上课程限时免费：', type: 'sjt', dimension: 'motivation', subDimension: 'achievement', scaleRef: 'PVQ-RR', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '立刻报名，成长的机会不能错过' },
      { value: 3, label: '扫一眼大纲，值得就去' },
      { value: 2, label: '收藏但可能不会真的看' },
      { value: 1, label: '还是休息吧，工作日已经够累了' },
    ]},

  // ── benevolence (PVQ-RR) ── 3 SJT items
  { id: 'val3', text: '你发现楼下独居老人已经两天没出门了，你会：', type: 'sjt', dimension: 'motivation', subDimension: 'benevolence', scaleRef: 'PVQ-RR', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '主动敲门看看，需要的话帮忙买菜取药' },
      { value: 3, label: '敲门问一声是否需要帮助' },
      { value: 2, label: '心里有点担心但没有行动' },
      { value: 1, label: '不关我的事吧' },
    ]},
  { id: 'val3b', text: '好朋友创业遇到困难，急需有人周末帮忙，但你已经有自己的安排：', type: 'sjt', dimension: 'motivation', subDimension: 'benevolence', scaleRef: 'PVQ-RR', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '二话不说推掉自己的安排去帮忙' },
      { value: 3, label: '尽量协调，抽出半天时间' },
      { value: 2, label: '如果朋友再三请求才会去' },
      { value: 1, label: '还是优先自己的安排' },
    ]},
  { id: 'val3c', text: '你在路上看到一个迷路的外国游客在焦急地看地图：', type: 'sjt', dimension: 'motivation', subDimension: 'benevolence', scaleRef: 'PVQ-RR', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '主动上前帮忙，导航到目的地' },
      { value: 3, label: '指个方向或者帮叫个车' },
      { value: 2, label: '如果对方求助我会帮，但不主动' },
      { value: 1, label: '赶路要紧，没时间' },
    ]},

  // ── autonomy (BPNSFS) ── 3 SJT items
  { id: 'val5', text: '你的工作日程被老板排得满满的，完全没有自由支配的时间：', type: 'sjt', dimension: 'motivation', subDimension: 'autonomy', scaleRef: 'BPNSFS', sourceType: 'adapted_open',
    options: [
      { value: 1, label: '非常不舒服，强烈需要自主安排的空间' },
      { value: 2, label: '有些压抑但能忍受' },
      { value: 3, label: '还好，执行指令也挺好' },
      { value: 4, label: '反而觉得轻松，不用自己决定' },
    ]},
  { id: 'val5b', text: '回顾自己这周做的所有事情，有多少是你真正想做的？', type: 'sjt', dimension: 'motivation', subDimension: 'autonomy', scaleRef: 'BPNSFS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '大部分！我的生活很大程度上反映我的选择' },
      { value: 3, label: '大概一半一半' },
      { value: 2, label: '大部分是不得不做的事' },
      { value: 1, label: '几乎全是被迫/义务性的' },
    ]},
  { id: 'val5c', text: '早上闹钟响起，你起床的动力主要来自：', type: 'sjt', dimension: 'motivation', subDimension: 'autonomy', scaleRef: 'BPNSFS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '对今天要做的事情感到期待' },
      { value: 3, label: '有想做的事，也有必须做的事，混合动力' },
      { value: 2, label: '主要是责任和义务驱动' },
      { value: 1, label: '不想起，纯粹被迫' },
    ]},

  // ── competence (BPNSFS) ── 3 SJT items
  { id: 'val6', text: '你被分配了一个公认很难的任务，你的第一反应是：', type: 'sjt', dimension: 'motivation', subDimension: 'competence', scaleRef: 'BPNSFS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '"有挑战性！让我试试"，自信能搞定' },
      { value: 3, label: '可以做，但需要花时间研究' },
      { value: 2, label: '有些没把握，想找人帮忙' },
      { value: 1, label: '觉得自己不行，想推掉' },
    ]},
  { id: 'val6b', text: '和同领域的人交流时，你对自己专业水平的感受是：', type: 'sjt', dimension: 'motivation', subDimension: 'competence', scaleRef: 'BPNSFS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '有底气，能自信地分享观点' },
      { value: 3, label: '大部分话题能跟上且有见解' },
      { value: 2, label: '有些心虚，怕被问到不会的' },
      { value: 1, label: '总觉得自己不够好，冒充者综合症' },
    ]},
  { id: 'val6c', text: '你刚学了一项新技能，尝试了两次都没成功：', type: 'sjt', dimension: 'motivation', subDimension: 'competence', scaleRef: 'BPNSFS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '没关系，我学东西一向很快，再试几次就好' },
      { value: 3, label: '看看是哪里没掌握要领，调整方法再来' },
      { value: 2, label: '有点受挫但不至于放弃' },
      { value: 1, label: '怀疑自己是不是不适合这个' },
    ]},

  // ── relatedness (BPNSFS) ── 3 SJT items
  { id: 'val7', text: '你搬到一个新城市已经三个月了，你的社交状态是：', type: 'sjt', dimension: 'motivation', subDimension: 'relatedness', scaleRef: 'BPNSFS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '已经交到几个可以约出来吃饭的新朋友' },
      { value: 3, label: '有认识的人，但还没有深度联结' },
      { value: 2, label: '主要和老朋友线上联系，新关系很少' },
      { value: 1, label: '感到很孤独，很难建立新的联结' },
    ]},
  { id: 'val7b', text: '你最近心里有件事很想说，你最可能的做法是：', type: 'sjt', dimension: 'motivation', subDimension: 'relatedness', scaleRef: 'BPNSFS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '马上知道该找谁说，且对方一定会认真听' },
      { value: 3, label: '有几个朋友可以聊，但需要找合适的时机' },
      { value: 2, label: '写在日记里或发在匿名社区' },
      { value: 1, label: '憋在心里，没有合适的倾诉对象' },
    ]},
  { id: 'val7c', text: '节假日你发了条朋友圈，过了一天只有3个人点赞：', type: 'sjt', dimension: 'motivation', subDimension: 'relatedness', scaleRef: 'BPNSFS', sourceType: 'adapted_open',
    options: [
      { value: 1, label: '有些失落，怀疑自己是不是被"边缘化"了' },
      { value: 2, label: '无所谓，社交媒体不代表真实关系' },
      { value: 3, label: '不太在意，因为知道重要的人在线下' },
      { value: 4, label: '觉得很正常，我和朋友的联结不靠点赞维系' },
    ]},
]);

// ════════════════════════════════════════════════════════════
// Ⅴ. 社会联结与人际模式 (6 sub-dims → 18 questions, was 9)
// ════════════════════════════════════════════════════════════
export const socialModule = buildModule('social', [
  // ── attachment_anxiety (ECR-R) ── 3 SJT items
  { id: 'soc1', text: '你给最好的朋友发了一条很认真的消息，过了6小时还没回复：', type: 'sjt', dimension: 'social', subDimension: 'attachment_anxiety', scaleRef: 'ECR-R', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '开始焦虑：TA是不是生我的气了？是不是不想理我？' },
      { value: 3, label: '有些不安，忍不住看了好几次手机' },
      { value: 2, label: '可能在忙吧，虽然有点在意' },
      { value: 1, label: '完全没在意，人家有自己的事' },
    ]},
  { id: 'soc2', text: '伴侣/好朋友最近因为工作忙，主动联系你的频率明显下降了：', type: 'sjt', dimension: 'social', subDimension: 'attachment_anxiety', scaleRef: 'ECR-R', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '非常需要对方的明确表态来确认"我们的关系没变"' },
      { value: 3, label: '有些不安全感，但理智告诉我是忙' },
      { value: 2, label: '理解对方忙，自己也有自己的生活' },
      { value: 1, label: '没什么感觉，各自有各自的空间' },
    ]},
  { id: 'soc2b', text: '你在朋友圈发了一条心情感悟，你最在乎的人没有点赞也没评论：', type: 'sjt', dimension: 'social', subDimension: 'attachment_anxiety', scaleRef: 'ECR-R', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '会反复想：TA是不是不关心我了？' },
      { value: 3, label: '有点失落但不会多想' },
      { value: 2, label: '注意到了但无所谓' },
      { value: 1, label: '完全没在意谁点赞' },
    ]},

  // ── attachment_avoidance (ECR-R) ── 3 SJT items
  { id: 'soc3', text: '恋人/好朋友想和你分享TA的脆弱时刻，你的第一反应：', type: 'sjt', dimension: 'social', subDimension: 'attachment_avoidance', scaleRef: 'ECR-R', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '有些不舒服，太亲密的情感交流让我紧张' },
      { value: 3, label: '愿意听但不太知道怎么回应' },
      { value: 2, label: '可以面对，虽然不太擅长' },
      { value: 1, label: '很自然地倾听和回应' },
    ]},
  { id: 'soc4', text: '你遇到了一件让自己很难受的事，你会：', type: 'sjt', dimension: 'social', subDimension: 'attachment_avoidance', scaleRef: 'ECR-R', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '自己消化，不想让任何人知道我的脆弱' },
      { value: 3, label: '会提一句但不会深入聊，自己扛' },
      { value: 2, label: '选择一两个亲近的人倾诉' },
      { value: 1, label: '很自然地向朋友/家人寻求支持' },
    ]},
  { id: 'soc4b', text: '朋友主动提出要帮你解决一个困扰，你的反应：', type: 'sjt', dimension: 'social', subDimension: 'attachment_avoidance', scaleRef: 'ECR-R', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '谢了但婉拒，依赖别人让我不自在' },
      { value: 3, label: '感激但还是倾向自己解决' },
      { value: 2, label: '愿意接受帮助' },
      { value: 1, label: '很开心，朋友之间就该互相依赖' },
    ]},

  // ── interpersonal_warmth (IPIP-IPC) ── 3 SJT items
  { id: 'soc5', text: '电梯里遇到一个看起来有些局促的新同事：', type: 'sjt', dimension: 'social', subDimension: 'interpersonal_warmth', scaleRef: 'IPIP-IPC', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '主动微笑打招呼，问问TA来哪个部门' },
      { value: 3, label: '点头微笑示意' },
      { value: 2, label: '看了一眼但没有互动' },
      { value: 1, label: '看手机，不太在意' },
    ]},
  { id: 'soc5b', text: '团队来了一个性格内向的新人，前几天都独自吃午饭：', type: 'sjt', dimension: 'social', subDimension: 'interpersonal_warmth', scaleRef: 'IPIP-IPC', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '邀请TA一起吃饭，让TA感到被欢迎' },
      { value: 3, label: '在群里@TA说"欢迎随时加入我们"' },
      { value: 2, label: '内心同情但没有主动行动' },
      { value: 1, label: '跟我没关系，TA可能喜欢独处' },
    ]},
  { id: 'soc5c', text: '你知道一个朋友最近在经历低谷期，你会：', type: 'sjt', dimension: 'social', subDimension: 'interpersonal_warmth', scaleRef: 'IPIP-IPC', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '主动发消息关心，发现需要就约出来陪着' },
      { value: 3, label: '发条消息问候一下' },
      { value: 2, label: '如果对方找我我会在' },
      { value: 1, label: '心里记得但不太会主动关心' },
    ]},

  // ── interpersonal_dominance (IPIP-IPC) ── 3 SJT items
  { id: 'soc6', text: '团队讨论陷入僵局，大家面面相觑没人发言：', type: 'sjt', dimension: 'social', subDimension: 'interpersonal_dominance', scaleRef: 'IPIP-IPC', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '自然地接过话头，组织大家理清思路' },
      { value: 3, label: '提出自己的想法来推动讨论' },
      { value: 2, label: '等负责人来主持，自己不太会主动出头' },
      { value: 1, label: '沉默等待，冷场和我无关' },
    ]},
  { id: 'soc6b', text: '朋友在纠结一个重要选择，向你咨询：', type: 'sjt', dimension: 'social', subDimension: 'interpersonal_dominance', scaleRef: 'IPIP-IPC', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '给出明确建议并试图说服TA按我说的做' },
      { value: 3, label: '分析利弊后给出我的推荐' },
      { value: 2, label: '列出选项但强调"你自己决定"' },
      { value: 1, label: '只是倾听，不太想干预别人的决定' },
    ]},
  { id: 'soc6c', text: '团建活动中需要有人组织大家，你会：', type: 'sjt', dimension: 'social', subDimension: 'interpersonal_dominance', scaleRef: 'IPIP-IPC', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '自然而然地承担起组织角色' },
      { value: 3, label: '如果没人出头我可以来' },
      { value: 2, label: '等别人来安排' },
      { value: 1, label: '宁愿做个跟随者' },
    ]},

  // ── social_connectedness (SCS-R) ── 3 SJT items
  { id: 'soc7', text: '参加一个多元背景（不同行业/年龄/文化）的聚会，你的感受是：', type: 'sjt', dimension: 'social', subDimension: 'social_connectedness', scaleRef: 'SCS-R', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '觉得自己自然地融入，和谁都能找到共鸣' },
      { value: 3, label: '需要一点时间暖场，但总能找到连接点' },
      { value: 2, label: '有些格格不入，但还是努力参与' },
      { value: 1, label: '觉得自己和这群人完全不在同一个频道' },
    ]},
  { id: 'soc7b', text: '你看到社交媒体上同龄人晒出的生活日常，你的感受是：', type: 'sjt', dimension: 'social', subDimension: 'social_connectedness', scaleRef: 'SCS-R', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '觉得我和他们有很多共同的快乐和烦恼' },
      { value: 3, label: '部分能共鸣，部分是别人的世界' },
      { value: 2, label: '更多时候觉得自己的生活和他们很不一样' },
      { value: 1, label: '强烈地觉得自己是"局外人"' },
    ]},
  { id: 'soc7c', text: '每到周末，你的社交状态通常是：', type: 'sjt', dimension: 'social', subDimension: 'social_connectedness', scaleRef: 'SCS-R', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '有丰富的社交活动，感到被归属和需要' },
      { value: 3, label: '有一两个固定的朋友可以约' },
      { value: 2, label: '大部分时间独处，偶尔社交' },
      { value: 1, label: '经常感到孤立，和这个世界脱节' },
    ]},

  // ── conflict_style (ROCI-II) ── 3 items
  { id: 'soc8', text: '你的直属领导在下班后临时要求你加班处理一件不属于你职责的任务，你会：', type: 'sjt', dimension: 'social', subDimension: 'conflict_style', scaleRef: 'ROCI-II', sourceType: 'adapted_open',
    options: [
      { value: 'integrating', label: '提出替代方案：明早我提前一小时来处理' },
      { value: 'obliging', label: '马上答应并开始工作' },
      { value: 'avoiding', label: '假装没看到消息，明天再说' },
      { value: 'dominating', label: '直接表示这不在职责范围内' },
    ]},
  { id: 'soc9', text: '在团队协作中遇到分歧时，你通常怎么做？', type: 'sjt', dimension: 'social', subDimension: 'conflict_style', scaleRef: 'ROCI-II', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '协调双方，寻求共识' },
      { value: 3, label: '提出折中方案' },
      { value: 2, label: '坚持自己认为正确的立场' },
      { value: 1, label: '回避冲突，等别人解决' },
    ]},
  { id: 'soc9b', text: '当朋友之间发生分歧时，我通常扮演的角色是：', type: 'sjt', dimension: 'social', subDimension: 'conflict_style', scaleRef: 'ROCI-II', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '调解者 — 主动协调双方' },
      { value: 3, label: '折中者 — 各退一步达成妥协' },
      { value: 2, label: '旁观者 — 不介入等自行解决' },
      { value: 1, label: '选边站 — 明确支持我认为对的一方' },
    ]},
]);

// ════════════════════════════════════════════════════════════
// Ⅵ. 审美感知与创造潜能 (4 sub-dims → 12 questions, was 8)
// ════════════════════════════════════════════════════════════
export const aestheticModule = buildModule('aesthetic', [
  // ── divergent_thinking (AUT) ── 3 items
  { id: 'aes1', text: '请尽可能多地列举"砖头"的不寻常用途（用逗号分隔）：', type: 'open', dimension: 'aesthetic', subDimension: 'divergent_thinking', scaleRef: 'AUT', sourceType: 'adapted_open' },
  { id: 'aes2', text: '如果人类能飞行，世界会发生哪些变化？请列举（用逗号分隔）：', type: 'open', dimension: 'aesthetic', subDimension: 'divergent_thinking', scaleRef: 'AUT', sourceType: 'adapted_open' },
  { id: 'aes2b', text: '请尽可能多地列举"回形针"的不寻常用途（用逗号分隔）：', type: 'open', dimension: 'aesthetic', subDimension: 'divergent_thinking', scaleRef: 'AUT', sourceType: 'adapted_open' },

  // ── aesthetic_sensitivity (AESTHEMOS) ── 3 items
  { id: 'aes3', text: '当你欣赏一件令你震撼的艺术品时，最能描述你感受的是：', type: 'single', dimension: 'aesthetic', subDimension: 'aesthetic_sensitivity', scaleRef: 'AESTHEMOS', sourceType: 'adapted_open',
    options: [
      { value: 'awe', label: '敬畏和崇高感 — 被深深震撼' },
      { value: 'moved', label: '被感动 — 内心涌起温暖而深沉的触动' },
      { value: 'intellectual', label: '智识兴趣 — 好奇它是怎么做到的' },
      { value: 'nostalgia', label: '怀旧 — 勾起某段记忆或情感' },
    ]},
  { id: 'aes4', text: '你更被哪种艺术风格吸引？', type: 'single', dimension: 'aesthetic', subDimension: 'aesthetic_sensitivity', scaleRef: 'AESTHEMOS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '先锋实验 — 打破常规、挑战认知' },
      { value: 3, label: '写实细腻 — 精确还原真实之美' },
      { value: 2, label: '抽象表达 — 用色彩和形式传达情感' },
      { value: 1, label: '极简主义 — 少即是多，留白的力量' },
    ]},
  { id: 'aes8', text: '你平时会主动去博物馆看展览或欣赏艺术吗？', type: 'single', dimension: 'aesthetic', subDimension: 'aesthetic_sensitivity', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '经常，这是我的爱好' },
      { value: 3, label: '有时候会去' },
      { value: 2, label: '偶尔，朋友邀请时' },
      { value: 1, label: '基本不去' },
    ]},

  // ── creative_achievement (CAQ) ── 3 items
  { id: 'aes7', text: '你在以下哪些领域有过创作经历？（选最突出的一项）', type: 'single', dimension: 'aesthetic', subDimension: 'creative_achievement', scaleRef: 'CAQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '有公开发表/展示的原创作品' },
      { value: 3, label: '经常进行创作（写作/绘画/音乐等）' },
      { value: 2, label: '偶尔会进行一些创意活动' },
      { value: 1, label: '基本没有创作经历' },
    ]},
  { id: 'aes7b', text: '在过去一年中，你有多少次将自己的创意想法付诸实践？', type: 'single', dimension: 'aesthetic', subDimension: 'creative_achievement', scaleRef: 'CAQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '10次以上' },
      { value: 3, label: '5-10次' },
      { value: 2, label: '1-4次' },
      { value: 1, label: '没有' },
    ]},
  { id: 'aes7c', text: '你曾经的创造性成果中，最高获得的认可是：', type: 'sjt', dimension: 'aesthetic', subDimension: 'creative_achievement', scaleRef: 'CAQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '正式获奖/发表/展出/上线过' },
      { value: 3, label: '被同行/老师/同事公开称赞过' },
      { value: 2, label: '朋友点赞算不算？' },
      { value: 1, label: '没有作品被谁认可过' },
    ]},

  // ── creative_self (SSCS) ── 3 SJT items
  { id: 'aes5', text: '工作中遇到一个常规方法解决不了的问题，你的反应：', type: 'sjt', dimension: 'aesthetic', subDimension: 'creative_self', scaleRef: 'SSCS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '兴奋！这正是我发挥创造力的时候' },
      { value: 3, label: '可以想想有没有创新的做法' },
      { value: 2, label: '去搜搜别人怎么解决的' },
      { value: 1, label: '找有经验的人帮忙' },
    ]},
  { id: 'aes6', text: '别人介绍你时说"TA是个很有创造力的人"，你的内心感受：', type: 'sjt', dimension: 'aesthetic', subDimension: 'creative_self', scaleRef: 'SSCS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '觉得很贴切，创造力确实是我核心身份的一部分' },
      { value: 3, label: '有些受宠若惊但也认同' },
      { value: 2, label: '嗯...我不确定自己算不算有创造力' },
      { value: 1, label: '觉得不太准确，这不是我的标签' },
    ]},
  { id: 'aes6b', text: '学校/公司要求大家用统一的模板汇报工作，你会：', type: 'sjt', dimension: 'aesthetic', subDimension: 'creative_self', scaleRef: 'SSCS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '用模板但加入不寻常的呈现方式，让它与众不同' },
      { value: 3, label: '在框架内找到一些创新的表达空间' },
      { value: 2, label: '按模板来就好，没必要搞特殊' },
      { value: 1, label: '喜欢模板，统一格式效率高' },
    ]},

  // ══════════════════════════════════════════════════════════
  // ── aesthetic_sensitivity VAST-style (V2.1) ── 4 visual_pair_choice items
  // ══════════════════════════════════════════════════════════
  { id: 'vast_1', text: '下面两张图使用了同样的元素摆放，你觉得哪一张整体更协调、更舒服？请凭第一眼直觉选择。', type: 'visual_pair_choice', dimension: 'aesthetic', subDimension: 'aesthetic_sensitivity', scaleRef: 'VAST-R', sourceType: 'original',
    leftImageSrc: 'https://images.unsplash.com/photo-1509228627152-72ae9ae6848d?w=400&h=400&fit=crop', rightImageSrc: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop', correctSide: 'right' },
  { id: 'vast_2', text: '下面两张几何构图中，你觉得哪一张的重心更稳、视觉上不容易"倒下"？', type: 'visual_pair_choice', dimension: 'aesthetic', subDimension: 'aesthetic_sensitivity', scaleRef: 'VAST-R', sourceType: 'original',
    leftImageSrc: 'https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?w=400&h=400&fit=crop', rightImageSrc: 'https://images.unsplash.com/photo-1557672172-298e090bd0f1?w=400&h=400&fit=crop', correctSide: 'left' },
  { id: 'vast_3', text: '下面两张布局中，哪一张在留白、线条和元素疏密上更耐看？', type: 'visual_pair_choice', dimension: 'aesthetic', subDimension: 'aesthetic_sensitivity', scaleRef: 'VAST-R', sourceType: 'original',
    leftImageSrc: 'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?w=400&h=400&fit=crop', rightImageSrc: 'https://images.unsplash.com/photo-1550859492-d5da9d8e45f3?w=400&h=400&fit=crop', correctSide: 'right' },
  { id: 'vast_4', text: '下面两张图都试图表现"秩序感"，你主观上更认可哪一张的秩序？', type: 'visual_pair_choice', dimension: 'aesthetic', subDimension: 'aesthetic_sensitivity', scaleRef: 'VAST-R', sourceType: 'original',
    leftImageSrc: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=400&h=400&fit=crop', rightImageSrc: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=400&h=400&fit=crop', correctSide: 'left' },
]);

// ════════════════════════════════════════════════════════════
// Ⅶ. 世界观与意义建构 (6 sub-dims → 18 questions, was 10)
// ════════════════════════════════════════════════════════════
export const worldviewModule = buildModule('worldview', [
  // ── meaning_presence (MLQ) ── 3 SJT items
  { id: 'wv1', text: '有人问你"你活着是为了什么"，你的回答是：', type: 'sjt', dimension: 'worldview', subDimension: 'meaning_presence', scaleRef: 'MLQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '能清晰地说出我的人生使命和核心追求' },
      { value: 3, label: '有一个大概的方向，虽然还在探索细节' },
      { value: 2, label: '说不太清楚，但觉得生活还是有意思的' },
      { value: 1, label: '老实说，我自己也不太清楚' },
    ]},
  { id: 'wv2', text: '每天早上醒来，你对这一天的感觉是：', type: 'sjt', dimension: 'worldview', subDimension: 'meaning_presence', scaleRef: 'MLQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '知道自己在朝一个清晰的目标生活' },
      { value: 3, label: '大致有方向感，虽然有时也会迷茫' },
      { value: 2, label: '按照惯性生活，没什么特别的目的感' },
      { value: 1, label: '不知道为什么活着，有些空虚' },
    ]},
  { id: 'wv2b', text: '回顾过去三年，你觉得自己的生活：', type: 'sjt', dimension: 'worldview', subDimension: 'meaning_presence', scaleRef: 'MLQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '充实且有明确的使命驱动' },
      { value: 3, label: '还算充实，有些事让我觉得有价值' },
      { value: 2, label: '一般般，没什么特别充实的感觉' },
      { value: 1, label: '空虚，觉得大部分时间都在虚度' },
    ]},

  // ── meaning_search (MLQ) ── 3 SJT items
  { id: 'wv3', text: '你看到一本书叫《如何找到人生的意义》，你的反应是：', type: 'sjt', dimension: 'worldview', subDimension: 'meaning_search', scaleRef: 'MLQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '立刻拿起来，这正是我一直在思考的问题' },
      { value: 3, label: '翻翻看，也许能给我一些启发' },
      { value: 2, label: '感觉是鸡汤，不太感兴趣' },
      { value: 1, label: '我没有在思考这类问题' },
    ]},
  { id: 'wv10', text: '深夜独处时，你最可能的状态是：', type: 'sjt', dimension: 'worldview', subDimension: 'meaning_search', scaleRef: 'MLQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '试图分辨和理解涌上心头的复杂感受' },
      { value: 3, label: '思考人生方向 — 这样按部就班真的对吗？' },
      { value: 2, label: '享受安静的独处时光，不想太多' },
      { value: 1, label: '用手机短视频转移注意力直到困意来袭' },
    ]},
  { id: 'wv3b', text: '你和朋友聊天时，话题转向"什么是真正有意义的人生"：', type: 'sjt', dimension: 'worldview', subDimension: 'meaning_search', scaleRef: 'MLQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '激动地加入讨论，这是我经常思考的问题' },
      { value: 3, label: '感兴趣，认真分享自己的想法' },
      { value: 2, label: '听一听，但觉得太抽象了不太好聊' },
      { value: 1, label: '换个话题吧，聊点轻松的' },
    ]},

  // ── moral_care (MFQ) ── 3 SJT items
  { id: 'wv4', text: '在判断一件事是否道德时，"是否有人受到伤害"对你来说有多重要？', type: 'single', dimension: 'worldview', subDimension: 'moral_care', scaleRef: 'MFQ', sourceType: 'adapted_open',
    options: [
      { value: 5, label: '极其重要 — 这是道德的核心' },
      { value: 4, label: '非常重要' },
      { value: 3, label: '比较重要' },
      { value: 2, label: '有些重要' },
      { value: 1, label: '不太重要 — 道德不只是关于伤害' },
    ]},
  { id: 'wv4b', text: '你在新闻上看到外卖骑手因平台规则被罚款导致生活困难：', type: 'sjt', dimension: 'worldview', subDimension: 'moral_care', scaleRef: 'MFQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '强烈愤怒，转发并呼吁关注弱势群体权益' },
      { value: 3, label: '心里很不舒服，觉得这个社会需要改变' },
      { value: 2, label: '同情但觉得个人改变不了什么' },
      { value: 1, label: '各人有各人的命运吧' },
    ]},
  { id: 'wv4c', text: '朋友在背后说了一个不在场的人的坏话，你的态度是：', type: 'sjt', dimension: 'worldview', subDimension: 'moral_care', scaleRef: 'MFQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '制止并为不在场的人辩护，善待别人是底线' },
      { value: 3, label: '不参与也不附和' },
      { value: 2, label: '听着但不表态' },
      { value: 1, label: '可能也会跟着说两句' },
    ]},

  // ── moral_fairness (MFQ) ── 3 SJT items
  { id: 'wv5', text: '面对道德困境时，"是否公平"和"是否有人受苦"哪个更影响你的判断？', type: 'single', dimension: 'worldview', subDimension: 'moral_fairness', scaleRef: 'MFQ', sourceType: 'adapted_open',
    options: [
      { value: 'fairness', label: '公平正义更重要' },
      { value: 'care', label: '减少他人痛苦更重要' },
      { value: 'both', label: '两者同等重要' },
      { value: 'context', label: '取决于具体情况' },
    ]},
  { id: 'wv5b', text: '你发现一个同事因为和老板关系好就获得了升职，而更优秀的人没有：', type: 'sjt', dimension: 'worldview', subDimension: 'moral_fairness', scaleRef: 'MFQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '非常愤怒，这种不公正不能容忍' },
      { value: 3, label: '觉得不公平但社会就是这样' },
      { value: 2, label: '不太在意，关系本身也是能力的一部分' },
      { value: 1, label: '如果是我认识的人就说说，不认识就算了' },
    ]},
  { id: 'wv5c', text: '有人说"出身决定命运"，你的态度是：', type: 'sjt', dimension: 'worldview', subDimension: 'moral_fairness', scaleRef: 'MFQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '强烈反对，每个人都应该有公平的机会' },
      { value: 3, label: '理想上不该如此，但现实确实有影响' },
      { value: 2, label: '有一定道理，但努力也能改变' },
      { value: 1, label: '基本同意，这就是现实' },
    ]},

  // ── open_minded_thinking (AOT) ── 3 SJT items
  { id: 'wv6', text: '你非常坚信的一个观点被一个你很尊敬的人用充分论据反驳了：', type: 'sjt', dimension: 'worldview', subDimension: 'open_minded_thinking', scaleRef: 'AOT', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '认真考虑对方的论点，如果有道理我愿意修正自己的看法' },
      { value: 3, label: '承认对方说得有道理，但需要时间消化' },
      { value: 2, label: '表面接受但内心还是坚持原来的想法' },
      { value: 1, label: '不管谁说的，我就是坚信自己是对的' },
    ]},
  { id: 'wv7', text: '你在社交媒体上看到一篇和你政治立场完全相反的深度分析文章：', type: 'sjt', dimension: 'worldview', subDimension: 'open_minded_thinking', scaleRef: 'AOT', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '认真读完，思考对方的逻辑有哪些可取之处' },
      { value: 3, label: '大致浏览，尝试理解对方的出发点' },
      { value: 2, label: '看了标题就划走了' },
      { value: 1, label: '直接拉黑/取关' },
    ]},
  { id: 'wv7b', text: '你即将做一个重要决定，你会：', type: 'sjt', dimension: 'worldview', subDimension: 'open_minded_thinking', scaleRef: 'AOT', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '特意找持反对意见的人聊聊，看看自己有没有盲区' },
      { value: 3, label: '搜索一下正反两方面的观点' },
      { value: 2, label: '主要看支持自己想法的信息' },
      { value: 1, label: '已经想好了，不需要更多信息' },
    ]},

  // ── sense_of_coherence (SOC-13) ── 3 SJT items
  { id: 'wv8', text: '生活中连续发生了几件让你措手不及的事，你的感受是：', type: 'sjt', dimension: 'worldview', subDimension: 'sense_of_coherence', scaleRef: 'SOC-13', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '虽然意外，但我相信事物有其内在逻辑，慢慢会清晰' },
      { value: 3, label: '困惑但还是试着理解它们之间的联系' },
      { value: 2, label: '感觉生活变得不可预测，有些无力' },
      { value: 1, label: '这个世界完全混乱无序' },
    ]},
  { id: 'wv9', text: '你面临人生中一个重大挑战（搬家/换工作/分手），你的底层感觉：', type: 'sjt', dimension: 'worldview', subDimension: 'sense_of_coherence', scaleRef: 'SOC-13', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '我有足够的内在资源来应对' },
      { value: 3, label: '不容易，但我能找到办法' },
      { value: 2, label: '很焦虑，不确定能不能撑过去' },
      { value: 1, label: '觉得自己不够强大来面对这些' },
    ]},
  { id: 'wv9b', text: '回顾那些曾经看起来很糟糕的经历，现在你会觉得：', type: 'sjt', dimension: 'worldview', subDimension: 'sense_of_coherence', scaleRef: 'SOC-13', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '它们最终都有其意义，塑造了现在的我' },
      { value: 3, label: '有些确实让我成长了，但有些纯粹是不幸' },
      { value: 2, label: '大部分还是觉得毫无意义的痛苦' },
      { value: 1, label: '不愿意回想，过去就是过去了' },
    ]},
]);

// ════════════════════════════════════════════════════════════
// VIII. 品格优势与内在力量 (8 sub-dims x 3 = 24 questions, V2.1)
// ════════════════════════════════════════════════════════════
export const strengthsModule = buildModule('strengths', [
  // ── creativity 创造力 (VIA) ── 3 likert5 items
  { id: 'str_cre_1', text: '遇到一件麻烦事时，我很少只停留在别人惯用的做法上，总会想试试不一样的路子。', type: 'likert5', dimension: 'strengths', subDimension: 'creativity', scaleRef: 'VIA', sourceType: 'original' },
  { id: 'str_cre_2', text: '只要事情能按规矩完成，我基本不会主动去想有没有更有趣或更聪明的做法。', type: 'likert5', dimension: 'strengths', subDimension: 'creativity', scaleRef: 'VIA', sourceType: 'original', reverse: true },
  { id: 'str_cre_3', text: '看到别人很大胆又另类的点子时，我会下意识地联想出一堆自己可以延伸或改造的版本。', type: 'likert5', dimension: 'strengths', subDimension: 'creativity', scaleRef: 'VIA', sourceType: 'original' },

  // ── curiosity 好奇心 (VIA) ── 3 likert5 items
  { id: 'str_cur_1', text: '只要身边出现一个我不了解的新事物，我通常会忍不住去搜一搜、问一问它背后的故事。', type: 'likert5', dimension: 'strengths', subDimension: 'curiosity', scaleRef: 'VIA', sourceType: 'original' },
  { id: 'str_cur_2', text: '对大多数新概念、新趋势，我的第一反应是"跟我无关"，很少有兴趣弄清楚。', type: 'likert5', dimension: 'strengths', subDimension: 'curiosity', scaleRef: 'VIA', sourceType: 'original', reverse: true },
  { id: 'str_cur_3', text: '当我意识到自己在某个领域一知半解时，会真心想搞懂，而不是装作明白。', type: 'likert5', dimension: 'strengths', subDimension: 'curiosity', scaleRef: 'VIA', sourceType: 'original' },

  // ── perseverance 毅力 (VIA) ── 3 likert5 items
  { id: 'str_per_1', text: '一旦我认真决定做一件事，即使中途多次遇到挫折，我也会想办法把它收个尾。', type: 'likert5', dimension: 'strengths', subDimension: 'perseverance', scaleRef: 'VIA', sourceType: 'original' },
  { id: 'str_per_2', text: '只要一个计划连续几次不顺利，我通常会很快放弃，转去做别的轻松的事。', type: 'likert5', dimension: 'strengths', subDimension: 'perseverance', scaleRef: 'VIA', sourceType: 'original', reverse: true },
  { id: 'str_per_3', text: '当别人已经熬不住选择退出时，我往往还能再多扛一会儿，把该做的事情完成。', type: 'likert5', dimension: 'strengths', subDimension: 'perseverance', scaleRef: 'VIA', sourceType: 'original' },

  // ── kindness 仁慈 (VIA) ── 3 likert5 items
  { id: 'str_kin_1', text: '看到身边人明显状态不好时，我会自然而然地想要安慰、帮一把，而不是装作没看到。', type: 'likert5', dimension: 'strengths', subDimension: 'kindness', scaleRef: 'VIA', sourceType: 'original' },
  { id: 'str_kin_2', text: '别人遇到困难时，我更多会觉得"各过各的就好"，很少愿意多花心思在别人身上。', type: 'likert5', dimension: 'strengths', subDimension: 'kindness', scaleRef: 'VIA', sourceType: 'original', reverse: true },
  { id: 'str_kin_3', text: '即使是和我没有直接关系的人，只要我力所能及，我也愿意花一点时间帮他们省点麻烦。', type: 'likert5', dimension: 'strengths', subDimension: 'kindness', scaleRef: 'VIA', sourceType: 'original' },

  // ── fairness 公平 (VIA) ── 3 likert5 items
  { id: 'str_fair_1', text: '在做决定时，我会刻意避免偏心某一方，哪怕那一方是我更亲近的人。', type: 'likert5', dimension: 'strengths', subDimension: 'fairness', scaleRef: 'VIA', sourceType: 'original' },
  { id: 'str_fair_2', text: '只要对我自己更有利，我并不会太在意别人会不会觉得这件事不公平。', type: 'likert5', dimension: 'strengths', subDimension: 'fairness', scaleRef: 'VIA', sourceType: 'original', reverse: true },
  { id: 'str_fair_3', text: '当我获得一个机会时，如果知道有人明显比我更合适，我会认真考虑把机会让给对方。', type: 'likert5', dimension: 'strengths', subDimension: 'fairness', scaleRef: 'VIA', sourceType: 'original' },

  // ── prudence 审慎 (VIA) ── 3 likert5 items
  { id: 'str_pru_1', text: '在作出重要决定前，我会习惯性地列出几种可能后果，评估一下最糟情况是否能承受。', type: 'likert5', dimension: 'strengths', subDimension: 'prudence', scaleRef: 'VIA', sourceType: 'original' },
  { id: 'str_pru_2', text: '只要当下感觉对了，我很少会去细想这件事以后可能带来的风险。', type: 'likert5', dimension: 'strengths', subDimension: 'prudence', scaleRef: 'VIA', sourceType: 'original', reverse: true },
  { id: 'str_pru_3', text: '我不会把"冲动是真性情"当成自己做事的借口，更倾向于慢一点、想清楚再行动。', type: 'likert5', dimension: 'strengths', subDimension: 'prudence', scaleRef: 'VIA', sourceType: 'original' },

  // ── self_regulation 自我调节 (VIA) ── 3 likert5 items
  { id: 'str_sr_1', text: '就算很想拖延或放纵，我通常还能逼自己按计划完成最重要的那几件事。', type: 'likert5', dimension: 'strengths', subDimension: 'self_regulation', scaleRef: 'VIA', sourceType: 'original' },
  { id: 'str_sr_2', text: '只要情绪一上头，我往往很难控制自己，说出或做出一些之后会后悔的事。', type: 'likert5', dimension: 'strengths', subDimension: 'self_regulation', scaleRef: 'VIA', sourceType: 'original', reverse: true },
  { id: 'str_sr_3', text: '面对短期诱惑（比如冲动消费、熬夜刷手机），我有能力提醒自己停下来想一想长期后果。', type: 'likert5', dimension: 'strengths', subDimension: 'self_regulation', scaleRef: 'VIA', sourceType: 'original' },

  // ── hope 希望感 (VIA) ── 3 likert5 items
  { id: 'str_hope_1', text: '即使遇到很糟糕的阶段，我心里通常还能想象出几条"也许可以慢慢好起来"的路线图。', type: 'likert5', dimension: 'strengths', subDimension: 'hope', scaleRef: 'VIA', sourceType: 'original' },
  { id: 'str_hope_2', text: '一旦现实连续几次打击到我，我很快就会认定"以后大概率也不会好到哪里去"。', type: 'likert5', dimension: 'strengths', subDimension: 'hope', scaleRef: 'VIA', sourceType: 'original', reverse: true },
  { id: 'str_hope_3', text: '当身边人陷在绝望里时，我能真诚地陪他们一起想象另一种可能的未来，而不是只说几句空话。', type: 'likert5', dimension: 'strengths', subDimension: 'hope', scaleRef: 'VIA', sourceType: 'original' },
]);

// ── Export all modules (with anchor items injected) ──
import { getAnchorsForDimension } from './anchor-scales';

// Inject anchor items at the end of each matching dimension
function injectAnchors(mod: DimensionModule): DimensionModule {
  const anchors = getAnchorsForDimension(mod.id) as unknown as DimensionModule['questions'][number][];
  if (anchors.length === 0) return mod;
  return { ...mod, questions: [...mod.questions, ...anchors] };
}

export const allModules: DimensionModule[] = [
  cognitiveModule,
  personalityModule,
  emotionModule,
  motivationModule,
  socialModule,
  aestheticModule,
  worldviewModule,
  strengthsModule,
].map(injectAnchors);
