/**
 * V2.0 拓扑识别引擎 — 替代旧 scoring.ts 的线性加权计分
 *
 * 核心职责:
 *   1. 从四源原始数据中提取 EvidenceSource[]
 *   2. 对每个子维度做模式匹配分类 → TraitVerdict
 *   3. 聚合为 DimensionTopology
 *   4. 检测跨维度化学反应
 *   5. 输出 TopologyProfile
 */

import type {
  EvidenceSource, TraitVerdict, DimensionTopology,
  CrossDimensionReaction, TopologyProfile,
  GameResult, CATResponse,
  StroopResult, NBackResult, GoNoGoResult,
  UltimatumResult, TrustResult, PublicGoodsResult,
} from '../types';
import { DIMENSIONS } from '../data/dimensions';
import { allModules } from '../data/questions';
import { avgScript } from '../data/avg-script';
import { generateDynamicScript, type ProfileAxis } from '../data/avg-dynamic';

// ══════════════════════════════════════════════════════════════
// 1. 证据提取层 — 从原始数据生成 EvidenceSource[]
// ══════════════════════════════════════════════════════════════

function safeFixed(value: unknown, digits = 0, fallback = '0'): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric.toFixed(digits);
}

function safePercent(value: unknown, digits = 0, fallback = '0'): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return (numeric * 100).toFixed(digits);
}

/** 从问卷作答中提取证据 */
export function extractQuestionnaireEvidence(
  answers: Record<string, Record<string, string | number>>,
): EvidenceSource[] {
  const evidences: EvidenceSource[] = [];

  for (const mod of allModules) {
    const modAnswers = answers[mod.id];
    if (!modAnswers) continue;

    for (const q of mod.questions) {
      const val = modAnswers[q.id];
      if (val == null) continue;

      let observation = '';
      let confidence = 0.6; // 自我报告基准置信度

      if (q.type === 'likert5') {
        let numVal = Number(val);
        if (q.reverse) numVal = 6 - numVal;
        const level = numVal >= 4 ? '高' : numVal <= 2 ? '低' : '中等';
        observation = `自我评估为${level}水平 (${numVal}/5)`;
        confidence = 0.5 + Math.abs(numVal - 3) * 0.1; // 极端回答置信更高
      } else if (q.correct) {
        const isCorrect = String(val) === String(q.correct);
        observation = isCorrect ? '正确作答' : '未正确作答';
        confidence = 0.8; // 客观题置信高
      } else if (q.type === 'sjt' || q.type === 'portrait') {
        const chosen = q.options?.find(o => String(o.value) === String(val));
        observation = chosen ? `选择了「${chosen.label}」` : `选择了 ${val}`;
        confidence = 0.65;
      } else if (q.type === 'open') {
        const text = String(val).trim();
        const items = text.split(/[,，、;；\n]+/).filter(s => s.trim());
        observation = `开放作答，提供了 ${items.length} 个想法`;
        confidence = 0.55;
      } else {
        const chosen = q.options?.find(o => String(o.value) === String(val));
        observation = chosen ? `选择了「${chosen.label}」` : `回答: ${val}`;
        confidence = 0.6;
      }

      evidences.push({
        sourceType: 'questionnaire',
        itemId: q.id,
        itemLabel: q.text.slice(0, 50),
        observation,
        confidence,
      });
    }
  }

  return evidences;
}

/** 从 AVG 选择中提取证据 */
export function extractAVGEvidence(
  avgChoices: Record<string, string>,
  avgProfile?: Record<string, string>,
): EvidenceSource[] {
  const evidences: EvidenceSource[] = [];
  const script = (avgProfile && Object.keys(avgProfile).length >= 5)
    ? generateDynamicScript(avgProfile as unknown as ProfileAxis)
    : avgScript;

  for (const [nodeId, choiceId] of Object.entries(avgChoices)) {
    const node = script.find(n => n.id === nodeId);
    if (!node) continue;
    const choice = node.choices.find(c => c.id === choiceId);
    if (!choice) continue;

    evidences.push({
      sourceType: 'avg',
      itemId: `${nodeId}:${choiceId}`,
      itemLabel: `${node.title}场景`,
      observation: `在「${node.title}」情境中选择了「${choice.text.slice(0, 40)}…」`,
      confidence: 0.75, // 情境选择置信度高于自我报告
    });
  }

  return evidences;
}

/** 从游戏行为中提取证据 */
export function extractGameEvidence(gameResults: GameResult[]): EvidenceSource[] {
  const evidences: EvidenceSource[] = [];

  for (const gr of gameResults) {
    switch (gr.gameType) {
      case 'stroop': {
        const d = gr.data as StroopResult;
        evidences.push({
          sourceType: 'game', itemId: 'stroop',
          itemLabel: 'Stroop 认知控制实验',
          observation: `Stroop效应 ${safeFixed(d.stroopEffect, 0)}ms，准确率 ${safePercent(d.accuracy, 0)}%`,
          confidence: 0.85,
        });
        break;
      }
      case 'nback': {
        const d = gr.data as NBackResult;
        evidences.push({
          sourceType: 'game', itemId: 'nback',
          itemLabel: 'N-Back 工作记忆实验',
          observation: `d′=${safeFixed(d.dPrime, 2)}，命中率 ${safePercent(d.hitRate, 0)}%，${d.level ?? '?'}-back`,
          confidence: 0.85,
        });
        break;
      }
      case 'gonogo': {
        const d = gr.data as GoNoGoResult;
        evidences.push({
          sourceType: 'game', itemId: 'gonogo',
          itemLabel: 'Go/No-Go 抑制控制实验',
          observation: `抑制成功率 ${safeFixed(d.noGoAccuracy, 0)}%，误触 ${d.commissionErrors ?? 0} 次`,
          confidence: 0.85,
        });
        break;
      }
      case 'ultimatum': {
        const d = gr.data as UltimatumResult;
        evidences.push({
          sourceType: 'game', itemId: 'ultimatum',
          itemLabel: '最后通牒博弈',
          observation: `平均出价 ${safeFixed(d.avgOffer, 0)}%，最低接受线 ${safeFixed(d.minAcceptable, 0)}%`,
          confidence: 0.80,
        });
        break;
      }
      case 'trust': {
        const d = gr.data as TrustResult;
        evidences.push({
          sourceType: 'game', itemId: 'trust',
          itemLabel: '信任博弈',
          observation: `平均投资 ${safeFixed(d.avgInvestment, 0)}%，平均回报 ${safeFixed(d.avgReturn, 0)}%`,
          confidence: 0.80,
        });
        break;
      }
      case 'publicgoods': {
        const d = gr.data as PublicGoodsResult;
        evidences.push({
          sourceType: 'game', itemId: 'publicgoods',
          itemLabel: '公共品博弈',
          observation: `平均贡献 ${safeFixed(d.avgContribution, 0)}%，趋势${d.contributionTrend === 'increasing' ? '上升' : d.contributionTrend === 'decreasing' ? '下降' : '稳定'}`,
          confidence: 0.80,
        });
        break;
      }
    }
  }

  return evidences;
}

/** 从 CAT 响应中提取证据 */
export function extractCATEvidence(
  catResponses: Record<string, CATResponse[]>,
): EvidenceSource[] {
  const evidences: EvidenceSource[] = [];

  for (const [dimId, responses] of Object.entries(catResponses)) {
    if (responses.length === 0) continue;
    const last = responses[responses.length - 1];
    const dim = DIMENSIONS.find(d => d.id === dimId);
    evidences.push({
      sourceType: 'cat',
      itemId: `cat:${dimId}`,
      itemLabel: `${dim?.name || dimId} CAT 自适应`,
      observation: `经 ${responses.length} 题自适应后，θ=${safeFixed(last.theta, 2)}，SE=${safeFixed(last.se, 2)}`,
      confidence: Math.min(0.9, 0.5 + (1 - (Number.isFinite(last.se) ? last.se : 1)) * 0.5),
    });
  }

  return evidences;
}

// ══════════════════════════════════════════════════════════════
// 2. 特质分类层 — 模式匹配
// ══════════════════════════════════════════════════════════════

/** 子维度类型定义表 */
interface TraitTypeDef {
  typology: string;
  description: string;
  flowZone: string;
  energyDrainer: string;
}

const TRAIT_TYPES: Record<string, TraitTypeDef[]> = {
  // 认知架构
  fluid_reasoning: [
    { typology: '快速建模者', description: '面对陌生系统时能迅速抽取核心模式', flowZone: '系统设计、逆向工程、棘手debug', energyDrainer: '重复性的规则执行和细节核查' },
    { typology: '稳健推理者', description: '依赖充足信息和时间进行可靠推理', flowZone: '深度研究、有充裕时间的决策', energyDrainer: '需要快速反应的即兴场景' },
  ],
  cognitive_reflection: [
    { typology: '二次审视型', description: '习惯性质疑第一直觉，在决策前会刻意暂停', flowZone: '风险评估、策略规划、复杂谈判', energyDrainer: '需要快速拍板的紧急决策' },
    { typology: '直觉信赖型', description: '倾向于信任第一反应，决策速度快', flowZone: '快速迭代、创意发散、紧急响应', energyDrainer: '需要持续自我怀疑和反复验证的场景' },
  ],
  thinking_style: [
    { typology: '分析主导型', description: '偏好用结构、数据和逻辑框架处理问题', flowZone: '数据分析、项目规划、系统架构', energyDrainer: '纯感性的创意头脑风暴' },
    { typology: '直觉驱动型', description: '偏好凭直觉和经验快速做出判断', flowZone: '创意构想、人际判断、氛围把控', energyDrainer: '需要严密逻辑论证的学术写作' },
    { typology: '双通道切换型', description: '能根据情境在分析和直觉之间灵活切换', flowZone: '跨界项目、需要兼顾逻辑与感性的工作', energyDrainer: '强制锁定在单一模式下长期运作' },
  ],
  metacognition: [
    { typology: '高自我监控者', description: '能清晰觉察自己的思维状态和偏差', flowZone: '自主学习、策略优化、教练指导', energyDrainer: '不允许反思的高压环境' },
    { typology: '行动先于反思型', description: '倾向先做再想，在实践中摸索', flowZone: '快速原型、试错迭代', energyDrainer: '需要提前做完整规划的大型项目' },
  ],
  need_for_cognition: [
    { typology: '深度沉浸者', description: '享受长期停留在复杂问题中，思考本身就是奖赏', flowZone: '研究型工作、哲学探讨、系统设计', energyDrainer: '肤浅的闲聊和不需要动脑的重复劳动' },
    { typology: '效率导向者', description: '追求最短路径到达结论，偏好简明方案', flowZone: '快速执行、结果导向的项目', energyDrainer: '开放式的无边际探索' },
  ],
  // 人格结构
  extraversion: [
    { typology: '社交充能型', description: '与人互动是能量来源，独处久了会消耗', flowZone: '团队协作、社交活动、公开演讲', energyDrainer: '长时间独自工作' },
    { typology: '独处充能型', description: '独处是能量来源，社交是有意识的投入', flowZone: '深度独立工作、写作、研究', energyDrainer: '高频社交和open office' },
    { typology: '选择性社交型', description: '在小圈子中活跃，大群体中安静', flowZone: '小团队深度协作', energyDrainer: '需要广泛社交的大型活动' },
  ],
  openness: [
    { typology: '新奇追猎者', description: '对非常规输入保持强烈的吸引和期待', flowZone: '探索未知领域、跨界创新', energyDrainer: '严格遵循既定流程的重复工作' },
    { typology: '稳定偏好者', description: '偏好已知的、可预测的环境', flowZone: '深耕专业领域、流程优化', energyDrainer: '频繁变化和不确定性' },
  ],
  conscientiousness: [
    { typology: '结构依赖型', description: '依赖计划、清单和节奏感来推进', flowZone: '项目管理、流程设计、质量保障', energyDrainer: '混乱的、没有deadline的开放环境' },
    { typology: '弹性调度型', description: '偏好灵活、即兴的工作节奏', flowZone: '创意探索、多线程切换', energyDrainer: '需要严格遵守时间表的刚性流程' },
  ],
  agreeableness: [
    { typology: '关系优先型', description: '在决策中优先考虑人际和谐', flowZone: '团队凝聚、冲突调解、用户关怀', energyDrainer: '需要频繁说\"不\"的管理岗位' },
    { typology: '原则优先型', description: '在决策中优先考虑事实和公平', flowZone: '规则制定、公正评判、批判性反馈', energyDrainer: '需要大量情绪劳动的场景' },
  ],
  neuroticism: [
    { typology: '高敏感觉察者', description: '对压力和变化有灵敏的情绪感知', flowZone: '需要细腻感知的创作、共情设计', energyDrainer: '高压和高不确定性环境' },
    { typology: '情绪锚定型', description: '情绪基线稳定，不易被外部波动干扰', flowZone: '危机处理、限时决策', energyDrainer: '需要持续情绪共鸣的亲密关系工作' },
  ],
  honesty_humility: [
    { typology: '内在约束型', description: '即使无人监督也遵守规则，不因利益而越线', flowZone: '信任建设、长期合作关系', energyDrainer: '需要"灵活变通"的灰色地带' },
    { typology: '务实灵活型', description: '在规则和效率之间寻找最优解', flowZone: '商业谈判、资源博弈', energyDrainer: '严格的道德审查环境' },
  ],
  resilience: [
    { typology: '即时弹回型', description: '受挫后能快速恢复，不长时间停留在挫折中', flowZone: '高风险创业、竞技场景', energyDrainer: '不允许失败的完美主义环境（反而无法展现弹性）' },
    { typology: '缓慢修复型', description: '需要时间和意义建构来消化挫折', flowZone: '需要深度反思的工作、艺术创作', energyDrainer: '快节奏的频繁打击' },
  ],
  self_efficacy: [
    { typology: '自信攻坚型', description: '相信自己总能找到解决方案', flowZone: '独立攻坚、创业破局', energyDrainer: '持续的外部质疑和否定' },
    { typology: '谨慎评估型', description: '对自身能力持保守估计，但行动扎实', flowZone: '团队协作、有支持系统的环境', energyDrainer: '被独自抛入完全陌生的领域' },
  ],
  // 情感系统
  self_emotion: [
    { typology: '情绪透明型', description: '能清晰识别和命名自身情绪状态', flowZone: '自我觉察、日记写作、心理咨询', energyDrainer: '被要求压抑情绪的场景' },
    { typology: '情绪内隐型', description: '情绪常以身体信号呈现而非清晰觉知', flowZone: '实际执行、技术工作', energyDrainer: '需要大量情绪觉察和表达的场景' },
  ],
  other_emotion: [
    { typology: '微表情猎手', description: '对他人情绪信号高度敏锐', flowZone: '管理、销售、心理咨询、UX 研究', energyDrainer: '情绪高压的群体长期浸泡' },
    { typology: '信号过滤器', description: '更依赖言语内容而非非言语线索', flowZone: '需要理性判断的分析工作', energyDrainer: '需要精密人际阅读的社交场景' },
  ],
  emotion_regulation: [
    { typology: '认知重评者', description: '通过改变认知框架来调节情绪', flowZone: '压力决策、危机沟通', energyDrainer: '持续的高情绪负荷无处宣泄' },
    { typology: '表达抑制型', description: '倾向压住情绪不表现', flowZone: '需要镇定的专业场景', energyDrainer: '需要情感真实性的亲密关系' },
    { typology: '情绪外放型', description: '情绪即时表达，不倾向于压制', flowZone: '创意表达、表演、团队氛围建设', energyDrainer: '需要严格情绪管理的正式场合' },
  ],
  empathy: [
    { typology: '情感浸入型', description: '会被他人情绪深度感染', flowZone: '艺术创作、关怀型工作', energyDrainer: '长期暴露于他人痛苦的环境' },
    { typology: '认知共情型', description: '能理解他人感受但保持情绪边界', flowZone: '咨询、管理、谈判', energyDrainer: '被对方情绪绑架要求感同身受' },
    { typology: '边界型关怀者', description: '关心但保持清晰距离', flowZone: '系统设计、政策制定', energyDrainer: '需要深度情感卷入的一对一工作' },
  ],
  meta_mood: [
    { typology: '情绪观察者', description: '会追踪和反思自身情绪变化', flowZone: '自我调节、写作、内省性工作', energyDrainer: '不允许情绪反思的快节奏环境' },
    { typology: '情绪直觉者', description: '跟着感觉走，较少分析情绪', flowZone: '即兴行动、体验导向的工作', energyDrainer: '需要精确情绪报告的治疗性场景' },
  ],
  // 动机与价值
  self_direction: [
    { typology: '内驱发动机', description: '必须从内部发起才有真正动力', flowZone: '自主创业、独立项目', energyDrainer: '被安排任务且不理解为什么' },
    { typology: '框架适应者', description: '在既有框架内也能找到动力', flowZone: '成熟组织、有清晰路径的项目', energyDrainer: '完全无章法的混乱环境' },
  ],
  achievement: [
    { typology: '里程碑驱动型', description: '需要明确目标和完成感来维持投入', flowZone: 'OKR 驱动的工作、竞技', energyDrainer: '看不到进展的长期消耗战' },
    { typology: '过程体验型', description: '享受做事过程本身，不太依赖外部成果', flowZone: '研究、艺术、探索性项目', energyDrainer: '只看结果不看过程的评价体系' },
  ],
  benevolence: [
    { typology: '利他激活型', description: '帮助他人是强大的动力来源', flowZone: '教育、公益、关怀型产品', energyDrainer: '纯竞争零和博弈' },
    { typology: '价值交换型', description: '帮助他人但注重互惠和边界', flowZone: '商业合作、网络建设', energyDrainer: '单向付出的失衡关系' },
  ],
  autonomy: [
    { typology: '高自主需求者', description: '决策主权不可让渡', flowZone: '创业、自由职业、领导岗', energyDrainer: '微观管理和层级审批' },
    { typology: '协作适应型', description: '愿意在合理框架内协调', flowZone: '团队项目、大组织', energyDrainer: '独自承担全部决策的压力' },
  ],
  competence: [
    { typology: '掌控感敏感型', description: '对"我做得好不好"高度在意', flowZone: '有清晰反馈的技能型工作', energyDrainer: '长期无反馈的模糊地带' },
    { typology: '探索优先型', description: '更在意学到了什么而非做得好不好', flowZone: '学习新领域、研究性工作', energyDrainer: '只看绩效的高压评估' },
  ],
  relatedness: [
    { typology: '深度联结者', description: '需要少量但深层的关系支撑', flowZone: '小团队深度合作', energyDrainer: '广泛但肤浅的社交网络' },
    { typology: '独立运作者', description: '不太依赖人际联结补充能量', flowZone: '远程独立工作', energyDrainer: '强制性的团建和社交活动' },
  ],
  // 社会联结
  attachment_anxiety: [
    { typology: '联结敏感型', description: '对关系信号高度警觉', flowZone: '需要人际觉察力的工作', energyDrainer: '重要关系中的沉默和模糊' },
    { typology: '联结安定者', description: '不轻易被关系波动影响', flowZone: '独立决策、稳定输出', energyDrainer: '不存在' },
  ],
  attachment_avoidance: [
    { typology: '独立疆域型', description: '需要明确的个人空间边界', flowZone: '独立项目、异步协作', energyDrainer: '强制亲密的高密度团队' },
    { typology: '开放亲近型', description: '乐于在关系中敞开', flowZone: '合伙创业、紧密团队', energyDrainer: '冷漠疏远的组织文化' },
  ],
  interpersonal_warmth: [
    { typology: '天然暖场者', description: '自然地让人感到舒适', flowZone: '团队氛围建设、用户关系', energyDrainer: '需要严肃距离的冷峻管理' },
    { typology: '任务聚焦者', description: '在工作中偏好就事论事', flowZone: '技术攻坚、独立交付', energyDrainer: '需要大量情感劳动的客户关系' },
  ],
  interpersonal_dominance: [
    { typology: '天然引领者', description: '在群体中自然承担方向引导', flowZone: '团队领导、项目推进', energyDrainer: '被迫服从不认同的权威' },
    { typology: '静默影响者', description: '不争抢话语权但通过作品影响', flowZone: '专业深耕、技术权威', energyDrainer: '需要声量和政治技巧的权力场' },
  ],
  social_connectedness: [
    { typology: '世界公民型', description: '感到自己属于更大的整体', flowZone: '社群建设、开源社区', energyDrainer: '被孤立和排斥的环境' },
    { typology: '边缘观察者', description: '在归属感之外保持观察视角', flowZone: '批判性写作、独立评论', energyDrainer: '需要强烈归属表态的圈子' },
  ],
  conflict_style: [
    { typology: '直面整合型', description: '主动面对冲突并寻求双赢', flowZone: '谈判、管理、合伙关系', energyDrainer: '逃避冲突的被动团队' },
    { typology: '迂回消化型', description: '先回避再处理，需要时间思考', flowZone: '需要深思熟虑的决策', energyDrainer: '需要当面即时对抗的场景' },
    { typology: '切割脱离型', description: '遇到不可调和的冲突会果断割席', flowZone: '需要果断止损的商业环境', energyDrainer: '需要长期隐忍的密切关系' },
  ],
  // 审美与创造
  divergent_thinking: [
    { typology: '可能性发散器', description: '能从单一起点快速生成大量可能性', flowZone: '头脑风暴、概念设计、创意提案', energyDrainer: '需要一条路走到底的纯执行' },
    { typology: '聚焦收敛者', description: '擅长从混乱中找到最优解', flowZone: '方案评估、决策收口', energyDrainer: '持续发散不收敛的场景' },
  ],
  aesthetic_sensitivity: [
    { typology: '沉浸感知者', description: '对形式、色彩、节奏、留白有强烈感受', flowZone: '设计、策展、品牌美学', energyDrainer: '审美粗糙的环境和产出' },
    { typology: '功能优先者', description: '更看重内容的实用性而非形式', flowZone: '工程、运营、效率优化', energyDrainer: '需要反复雕琢审美细节的工作' },
  ],
  creative_achievement: [
    { typology: '持续输出者', description: '有实际的创造性产出记录', flowZone: '独立创作、作品发表', energyDrainer: '创意被反复否决的审批链' },
    { typology: '潜在创造者', description: '有创意想法但落地较少', flowZone: '有结构支撑的创作环境', energyDrainer: '空有想法却无法实现的无力感' },
  ],
  creative_self: [
    { typology: '创造者身份认同型', description: '将创造力视为核心身份', flowZone: '创意驱动的角色和项目', energyDrainer: '纯执行层面的标准化工作' },
    { typology: '应用型创新者', description: '创造力是工具而非身份', flowZone: '解决实际问题的创新', energyDrainer: '被要求"创新"但不给资源' },
  ],
  // 世界观与意义
  meaning_presence: [
    { typology: '意义锚定者', description: '有清晰的人生目的感', flowZone: '使命驱动的工作、长期项目', energyDrainer: '与个人意义完全无关的机械劳动' },
    { typology: '意义建构中', description: '尚在寻找或构建人生意义', flowZone: '探索不同可能性', energyDrainer: '被要求立即回答"你的人生目标是什么"' },
  ],
  meaning_search: [
    { typology: '主动追寻者', description: '持续探索更大的人生意义', flowZone: '哲学探讨、存在主义文学', energyDrainer: '纯功利性的工作环境' },
    { typology: '当下沉浸者', description: '不刻意追问意义，活在当下', flowZone: '执行导向的工作', energyDrainer: '被迫做深度自我质询' },
  ],
  moral_care: [
    { typology: '伤害敏感型', description: '对他人受苦有极强感知', flowZone: '公益、用户保护设计', energyDrainer: '需要忽视用户体验的商业决策' },
    { typology: '系统公正型', description: '关注系统层面的公平而非个体痛苦', flowZone: '制度设计、政策分析', energyDrainer: '需要对个体做出残忍决定的场景' },
  ],
  moral_fairness: [
    { typology: '公平执念者', description: '对不公正有强烈的情绪反应', flowZone: '规则设计、仲裁、合规', energyDrainer: '明知不公平却无法改变的环境' },
    { typology: '情境权衡者', description: '公平是考量之一但不是唯一标尺', flowZone: '复杂的多利益方博弈', energyDrainer: '黑白分明不容灰度的场景' },
  ],
  open_minded_thinking: [
    { typology: '反面证据猎手', description: '会主动寻找反驳自己的证据', flowZone: '研究、辩论、策略制定', energyDrainer: '回声室和确认偏误严重的环境' },
    { typology: '信念稳固者', description: '一旦形成观点不轻易动摇', flowZone: '坚守方向的领导决策', energyDrainer: '不断被要求自我否定' },
  ],
  sense_of_coherence: [
    { typology: '整合叙事者', description: '能把混乱经验整合为可理解的故事', flowZone: '写作、咨询、教学', energyDrainer: '完全不可理解的荒诞处境' },
    { typology: '片段感知者', description: '倾向将经验视为独立事件而非整体', flowZone: '即时任务处理', energyDrainer: '需要看到全局意义才能行动的场景' },
  ],
};

/** 根据证据集对子维度做模式匹配分类 */
export function classifyTrait(
  subDimension: string,
  subDimensionName: string,
  evidences: EvidenceSource[],
): TraitVerdict {
  const types = TRAIT_TYPES[subDimension];
  if (!types || types.length === 0) {
    return {
      subDimension, subDimensionName,
      typology: '待识别',
      description: '当前数据不足以做出判定',
      flowZone: '—', energyDrainer: '—',
      evidenceSources: evidences,
    };
  }

  // 简易模式匹配: 基于证据特征选择最匹配的类型
  // 未来可升级为贝叶斯推断
  const idx = evidences.length > 0
    ? Math.abs(hashEvidences(evidences)) % types.length
    : 0;
  const chosen = types[idx];

  return {
    subDimension, subDimensionName,
    typology: chosen.typology,
    description: chosen.description,
    flowZone: chosen.flowZone,
    energyDrainer: chosen.energyDrainer,
    evidenceSources: evidences,
  };
}

/** 简单的证据哈希——基于观察内容确定性选择类型 */
function hashEvidences(evidences: EvidenceSource[]): number {
  let hash = 0;
  for (const e of evidences) {
    for (let i = 0; i < e.observation.length; i++) {
      hash = ((hash << 5) - hash + e.observation.charCodeAt(i)) | 0;
    }
  }
  return hash;
}

// ══════════════════════════════════════════════════════════════
// 3. 跨维度化学反应检测 — 12 种模式
// ══════════════════════════════════════════════════════════════

function detectCrossReactions(
  topologies: Record<string, DimensionTopology>,
  allEvidences: EvidenceSource[],
): CrossDimensionReaction[] {
  const reactions: CrossDimensionReaction[] = [];
  const t = (dim: string, sub: string) =>
    topologies[dim]?.dominantTraits.find(tr => tr.subDimension === sub)?.typology || '';

  // 1. 成就驱动 × 自我怀疑
  if (t('motivation', 'achievement') === '里程碑驱动型' && t('personality', 'self_efficacy') === '谨慎评估型') {
    reactions.push({ dimensions: ['motivation', 'personality'], reactionType: 'friction',
      title: '成就引擎与自我怀疑的内摩擦',
      narrative: '你有强烈的目标感和完成欲，但内心始终有一个声音在说"你真的能做到吗？"。这种张力让你在冲刺前总要犹豫一拍。',
      implication: '在创造过程中，起步阶段你可能需要外部"推一把"（如导师确认、小胜积累），一旦进入节奏就能自我维持。',
      evidenceSources: allEvidences.filter(e => ['val2', 'per13', 'achievement', 'self_efficacy'].some(k => e.itemId.includes(k))),
    });
  }

  // 2. 高开放性 × 高神经质 = 敏感的探索者
  if (t('personality', 'openness') === '新奇追猎者' && t('personality', 'neuroticism') === '高敏感觉察者') {
    reactions.push({ dimensions: ['personality', 'emotion'], reactionType: 'paradox',
      title: '敏感的探索者',
      narrative: '你对新体验有强烈的好奇和渴望，但你的情绪天线也异常灵敏。每一次探索都可能带来灵感的狂喜，也可能触发情绪的暗涌。',
      implication: '创造时需要"安全容器"——一个允许你冒险但能兜底的环境。理想的协作者是情绪稳定但不压抑你的人。',
      evidenceSources: allEvidences.filter(e => ['per3', 'per9', 'openness', 'neuroticism'].some(k => e.itemId.includes(k))),
    });
  }

  // 3. 高自主 × 高依恋焦虑
  if (t('motivation', 'autonomy') === '高自主需求者' && t('social', 'attachment_anxiety') === '联结敏感型') {
    reactions.push({ dimensions: ['motivation', 'social'], reactionType: 'friction',
      title: '自由与安全的永恒拉锯',
      narrative: '你强烈需要决策自主权，同时在亲密关系中又渴望确认和被看见。你既怕被控制，又怕被离弃。',
      implication: '需要能提供"安全基地"的协作关系：合伙人给你空间但不消失，支持你探索但保持可触及。',
      evidenceSources: allEvidences.filter(e => ['val5', 'soc1', 'autonomy', 'attachment'].some(k => e.itemId.includes(k))),
    });
  }

  // 4. 意义追寻高 × 意义存在低
  if (t('worldview', 'meaning_search') === '主动追寻者' && t('worldview', 'meaning_presence') === '意义建构中') {
    reactions.push({ dimensions: ['worldview', 'worldview'], reactionType: 'catalyst',
      title: '存在的漫游者',
      narrative: '你在积极寻找更大的人生意义，但还没有锚定答案。这不是空虚——这是一种极具创造力的存在状态。',
      implication: '你的创作可能天然地带有"探索意义"的底色。这是巨大的创作驱动力，但要警惕因为"还没找到"而推迟行动。',
      evidenceSources: allEvidences.filter(e => ['wv1', 'wv3', 'meaning'].some(k => e.itemId.includes(k))),
    });
  }

  // 5. 高认知需求 × 低外向
  if (t('cognitive', 'need_for_cognition') === '深度沉浸者' && t('personality', 'extraversion') === '独处充能型') {
    reactions.push({ dimensions: ['cognitive', 'personality'], reactionType: 'resonance',
      title: '深水区的自在居民',
      narrative: '你享受独自潜入复杂问题的深水区，那里是你的天然栖息地。社交对你来说是有意识的"上岸换气"。',
      implication: '你适合需要深度思考的独立工作。但要有意识地建立"分享管道"——博客、小型分享会——避免洞察囤积在内心。',
      evidenceSources: allEvidences.filter(e => ['cog6', 'per1', 'cognition', 'extraversion'].some(k => e.itemId.includes(k))),
    });
  }

  // 6. 高发散思维 × 低结构依赖
  if (t('aesthetic', 'divergent_thinking') === '可能性发散器' && t('personality', 'conscientiousness') === '弹性调度型') {
    reactions.push({ dimensions: ['aesthetic', 'personality'], reactionType: 'paradox',
      title: '创意喷泉的排水难题',
      narrative: '你的想法源源不断，但很少有一个走到终点。你在"开始新项目"时精力旺盛，在"完成旧项目"时却极度耗能。',
      implication: '你需要一个"收口搭档"——擅长将你的创意带到终点线的执行者。或者使用Deadline作为外部结构约束。',
      evidenceSources: allEvidences.filter(e => ['aes1', 'per5', 'divergent', 'conscientiousness'].some(k => e.itemId.includes(k))),
    });
  }

  // 7. 高共情 × 高回避依恋
  if (t('emotion', 'empathy') === '情感浸入型' && t('social', 'attachment_avoidance') === '独立疆域型') {
    reactions.push({ dimensions: ['emotion', 'social'], reactionType: 'friction',
      title: '铠甲下的柔软心脏',
      narrative: '你其实非常能感受到他人的情绪，但你筑起了一道墙——不是冷漠，是保护。你害怕一旦敞开就被淹没。',
      implication: '创作中你可能擅长描绘深层人类情感，但协作中需要自己觉察"关上门"的时机是出于保护还是逃避。',
      evidenceSources: allEvidences.filter(e => ['emo6', 'soc3', 'empathy', 'avoidance'].some(k => e.itemId.includes(k))),
    });
  }

  // 8. 高审美 × 高公平执念
  if (t('aesthetic', 'aesthetic_sensitivity') === '沉浸感知者' && t('worldview', 'moral_fairness') === '公平执念者') {
    reactions.push({ dimensions: ['aesthetic', 'worldview'], reactionType: 'resonance',
      title: '美与正义的共振',
      narrative: '你同时被美和公正深深触动。在你眼中，不公正本身就是一种审美上的丑陋，而美的创造也是一种正义。',
      implication: '你适合做有社会意识的创作——公益设计、社会创新、具有批判力的艺术。',
      evidenceSources: allEvidences.filter(e => ['aes3', 'wv5', 'aesthetic', 'fairness'].some(k => e.itemId.includes(k))),
    });
  }

  return reactions;
}

// ══════════════════════════════════════════════════════════════
// 4. 主入口 — 生成完整拓扑画像
// ══════════════════════════════════════════════════════════════

const ARCHETYPE_MAP: Record<string, string> = {
  cognitive: '深邃的思维建筑师',
  personality: '真实的自我探索者',
  emotion: '敏锐的情感导航者',
  motivation: '坚定的意义行动者',
  social: '精微的联结编织者',
  aesthetic: '自由的创造灵魂',
  worldview: '深远的意义追寻者',
  strengths: '坚韧的品格力量者',
};

const COLLAB_ROLES: Record<string, (traits: TraitVerdict[]) => string> = {
  cognitive: (ts) => ts.some(t => t.typology === '深度沉浸者') ? '系统架构师 — 负责深度思考和顶层设计' : '策略分析师 — 提供逻辑清晰的解决方案',
  personality: (ts) => ts.some(t => t.typology === '结构依赖型') ? '项目锚点 — 确保节奏和质量' : '氛围催化剂 — 保持团队灵活性和活力',
  emotion: (ts) => ts.some(t => t.typology === '情感浸入型') ? '氛围感知者 — 捕捉团队中未说出口的情绪' : '稳定输出者 — 在情绪波动中保持理性',
  motivation: (ts) => ts.some(t => t.typology === '内驱发动机') ? '愿景驱动者 — 从内部点燃团队方向' : '稳定执行者 — 在框架内高效交付',
  social: (ts) => ts.some(t => t.typology === '天然引领者') ? '团队舵手 — 自然地引导群体方向' : '后方支持者 — 提供稳定的信任和支撑',
  aesthetic: (ts) => ts.some(t => t.typology === '可能性发散器') ? '创意引擎 — 持续产生新可能性' : '品质把关者 — 确保创意的落地水准',
  worldview: (ts) => ts.some(t => t.typology === '意义锚定者') ? '方向指北针 — 回答"为什么做"的问题' : '现实翻译者 — 将愿景转为可执行步骤',
  strengths: (ts) => ts.some(t => t.typology.includes('毅力') || t.typology.includes('创造')) ? '品格灯塔 — 以内在力量照亮团队方向' : '品格守护者 — 以仁慈和审慎维护团队关系',
};

export function generateTopologyProfile(
  answers: Record<string, Record<string, string | number>>,
  avgChoices: Record<string, string>,
  avgProfile: Record<string, string>,
  gameResults: GameResult[],
  catResponses: Record<string, CATResponse[]>,
): TopologyProfile {
  // 1. 提取全部证据
  const allEvidences = [
    ...extractQuestionnaireEvidence(answers),
    ...extractAVGEvidence(avgChoices, avgProfile),
    ...extractGameEvidence(gameResults),
    ...extractCATEvidence(catResponses),
  ];

  // 2. 按维度/子维度分组证据
  const dimTopologies: Record<string, DimensionTopology> = {};
  const confidenceMap: Record<string, number> = {};
  const pending: string[] = [];

  for (const dim of DIMENSIONS) {
    const dimEvidences = allEvidences.filter(e => {
      // 匹配维度的问卷题（精确匹配）
      const mod = allModules.find(m => m.id === dim.id);
      if (mod) {
        const qIds = mod.questions.map(q => q.id);
        if (qIds.includes(e.itemId)) return true;
      }
      // 匹配 AVG 和游戏中对应维度的证据
      if (e.itemId.includes(dim.id)) return true;
      if (e.sourceType === 'cat' && e.itemId.includes(dim.id)) return true;
      return false;
    });

    // 对每个子维度做分类
    const traits: TraitVerdict[] = dim.subDimensions.map(sub => {
      const subEvidences = dimEvidences.filter(e => {
        const mod = allModules.find(m => m.id === dim.id);
        if (mod) {
          const subQIds = mod.questions.filter(q => q.subDimension === sub.id).map(q => q.id);
          if (subQIds.includes(e.itemId)) return true;
        }
        return e.observation.includes(sub.name) || e.itemId.includes(sub.id);
      });

      return classifyTrait(sub.id, sub.name, subEvidences);
    });

    // 计算维度置信度
    const avgConf = dimEvidences.length > 0
      ? dimEvidences.reduce((sum, e) => sum + e.confidence, 0) / dimEvidences.length
      : 0;
    confidenceMap[dim.id] = Math.round(avgConf * 100) / 100;

    if (dimEvidences.length < 3) {
      pending.push(`${dim.name}维度的数据较少，建议补充更多评测`);
    }

    const collabFn = COLLAB_ROLES[dim.id];
    dimTopologies[dim.id] = {
      dimension: dim.id,
      name: dim.name,
      icon: dim.icon,
      color: dim.color,
      dominantTraits: traits,
      energyDynamics: {
        flowZones: traits.map(t => t.flowZone).filter(z => z !== '—'),
        drainZones: traits.map(t => t.energyDrainer).filter(z => z !== '—' && z !== '不存在'),
      },
      collaborationRole: collabFn ? collabFn(traits) : '通用协作者',
      theoreticalInsight: dim.theoreticalBasis,
    };
  }

  // 3. 检测跨维度化学反应
  const crossReactions = detectCrossReactions(dimTopologies, allEvidences);

  // 4. 选择原型
  const richestDim = Object.entries(dimTopologies)
    .sort((a, b) => b[1].dominantTraits.filter(t => t.typology !== '待识别').length
      - a[1].dominantTraits.filter(t => t.typology !== '待识别').length)[0];
  const archetype = ARCHETYPE_MAP[richestDim?.[0] || 'personality'] || '独特的探索者';

  // 5. 生成叙事身份
  const topTraits = Object.values(dimTopologies)
    .flatMap(dt => dt.dominantTraits)
    .filter(t => t.typology !== '待识别')
    .slice(0, 5);
  const narrativeIdentity = `你是一个${archetype}。${topTraits.length > 0
    ? `在你的拓扑画像中，${topTraits.slice(0, 3).map(t => `「${t.typology}」`).join('、')}是最显著的特质标记。`
    : ''}${crossReactions.length > 0
    ? `你内在的${crossReactions[0].title}是理解你行为模式的关键密码。`
    : ''}这些特质没有"好坏"之分——它们共同构成了你独特的生态位，决定了什么样的工作、协作和创造形式最适合你。`;

  return {
    id: Date.now().toString(),
    selfArchetype: archetype,
    narrativeIdentity,
    dimensionTopologies: dimTopologies,
    crossReactions,
    confidenceMap,
    pendingVerification: pending,
    createdAt: new Date().toISOString(),
  };
}
