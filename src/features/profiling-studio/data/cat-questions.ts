/**
 * CAT 自适应测试专用题库 (V2.1)
 *
 * 完全独立于 questions.ts 的平行题库，用于 CAT 自适应路径。
 * 所有题目测量相同的构念 (subDimension)，但使用不同的情境和措辞。
 * 所有题目 ID 以 `cat_` 前缀区分。
 *
 * 设计原则:
 *   ① 平行测验: 测量同一心理构念，但避免与维度深潜路径的题目重复
 *   ② 情境化: SJT (微情境判断) 使用全新生活场景
 *   ③ 分值结构: 保持与原题一致的选项数量和分值范围
 */

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
// Ⅰ. 认知架构与智识风格 (6 sub-dims → 15 questions)
// ════════════════════════════════════════════════════════════
export const catCognitiveModule = buildModule('cognitive', [
  // ── fluid_reasoning (ICAR) ── 3 items (binary/objective)
  { id: 'cat_cog3', text: '数字序列：3, 8, 15, 24, 35, ?', type: 'single', dimension: 'cognitive', subDimension: 'fluid_reasoning', scaleRef: 'ICAR', sourceType: 'adapted_open',
    correct: 'B', options: [{ value: 'A', label: '44' }, { value: 'B', label: '48' }, { value: 'C', label: '46' }, { value: 'D', label: '50' }] },
  { id: 'cat_cog4', text: '如果 ★ = 3, ◆ = 5, 那么 ★ × ◆ + ★ = ?', type: 'single', dimension: 'cognitive', subDimension: 'fluid_reasoning', scaleRef: 'ICAR', sourceType: 'adapted_open',
    correct: 'C', options: [{ value: 'A', label: '15' }, { value: 'B', label: '20' }, { value: 'C', label: '18' }, { value: 'D', label: '21' }] },
  { id: 'cat_cog3b', text: '规律填空：A1, C3, E5, G7, ?', type: 'single', dimension: 'cognitive', subDimension: 'fluid_reasoning', scaleRef: 'ICAR', sourceType: 'adapted_open',
    correct: 'A', options: [{ value: 'A', label: 'I9' }, { value: 'B', label: 'H8' }, { value: 'C', label: 'I8' }, { value: 'D', label: 'H9' }] },

  // ── cognitive_reflection (CRT) ── 3 items (binary/objective)
  { id: 'cat_cog1', text: '一根绳子被连续对折了3次，然后在中间剪一刀。绳子会变成几段？', type: 'single', dimension: 'cognitive', subDimension: 'cognitive_reflection', scaleRef: 'CRT', sourceType: 'adapted_open',
    correct: 'C', options: [{ value: 'A', label: '4段' }, { value: 'B', label: '6段' }, { value: 'C', label: '9段' }, { value: 'D', label: '8段' }] },
  { id: 'cat_cog2', text: '一个水池有进水管和出水管。进水管5小时注满，出水管8小时排空。两管同开，多久注满？', type: 'single', dimension: 'cognitive', subDimension: 'cognitive_reflection', scaleRef: 'CRT', sourceType: 'adapted_open',
    correct: 'B', options: [{ value: 'A', label: '10小时' }, { value: 'B', label: '13.3小时' }, { value: 'C', label: '6.5小时' }, { value: 'D', label: '3小时' }] },
  { id: 'cat_cog2b', text: '小明说："我前天还是15岁，明年就18岁了。"这可能吗？（提示：考虑生日和时间点）', type: 'single', dimension: 'cognitive', subDimension: 'cognitive_reflection', scaleRef: 'CRT', sourceType: 'adapted_open',
    correct: 'A', options: [{ value: 'A', label: '可能——如果今天是1月1日，他的生日是12月31日' }, { value: 'B', label: '不可能，年龄差距太大' }, { value: 'C', label: '只有闰年才可能' }, { value: 'D', label: '可能——如果他按虚岁算' }] },

  // ── thinking_style (REI) ── 3 SJT items
  { id: 'cat_cog5', text: '你在超市选购一台新手机，面前摆着五款差不多价位的产品：', type: 'sjt', dimension: 'cognitive', subDimension: 'thinking_style', scaleRef: 'REI', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '打开参数对比表，逐项打分后选综合得分最高的' },
      { value: 3, label: '先看评测数据，但最终还是凭手感和眼缘决定' },
      { value: 2, label: '拿起来试试手感，直觉觉得哪个顺眼就选哪个' },
      { value: 1, label: '朋友推荐什么就买什么，不想花时间比较' },
    ]},
  { id: 'cat_cog5b', text: '和朋友争论一个话题时，你更倾向于：', type: 'sjt', dimension: 'cognitive', subDimension: 'thinking_style', scaleRef: 'REI', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '拿出数据和论据来一条条分析' },
      { value: 3, label: '用逻辑推理但也会参考自己的直觉判断' },
      { value: 2, label: '更多靠自己的经验和感觉来表达观点' },
      { value: 1, label: '懒得争论，感觉对就行了' },
    ]},
  { id: 'cat_cog5c', text: '你需要规划一次为期两周的自由行旅程：', type: 'sjt', dimension: 'cognitive', subDimension: 'thinking_style', scaleRef: 'REI', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '做一份详细的Excel表，列好每天行程、预算和备选方案' },
      { value: 3, label: '查攻略列出想去的地方，但实际到了可以随意调整' },
      { value: 2, label: '大致知道几个目的地，到了再说' },
      { value: 1, label: '买张机票就出发，全程随心走' },
    ]},

  // ── need_for_cognition (NFC) ── 3 SJT items
  { id: 'cat_cog6', text: '在一次聚餐中有人提出了一个关于"意识是否能被上传到电脑"的问题：', type: 'sjt', dimension: 'cognitive', subDimension: 'need_for_cognition', scaleRef: 'NFC', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '太有趣了，立刻加入讨论并在回家后继续思考' },
      { value: 3, label: '感兴趣地听一会儿，提出几个自己的想法' },
      { value: 2, label: '听听就好，这种问题想多了头疼' },
      { value: 1, label: '赶紧换个话题，聊点有用的' },
    ]},
  { id: 'cat_cog7', text: '你在书店里面对一本讲"博弈论如何影响日常决策"的书：', type: 'sjt', dimension: 'cognitive', subDimension: 'need_for_cognition', scaleRef: 'NFC', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '立刻拿起来翻看，这种跨学科的内容正合我意' },
      { value: 3, label: '感兴趣，看看目录再决定要不要买' },
      { value: 2, label: '听起来太学术了，不太想看' },
      { value: 1, label: '只对实用类或消遣类的书感兴趣' },
    ]},
  { id: 'cat_cog7b', text: '周末你有一整天的空闲时间，你最想做的事：', type: 'sjt', dimension: 'cognitive', subDimension: 'need_for_cognition', scaleRef: 'NFC', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '钻研一个自己感兴趣的复杂课题或写点东西' },
      { value: 3, label: '看看纪录片或听播客，学点新知识' },
      { value: 2, label: '刷剧、打游戏，放松为主' },
      { value: 1, label: '出去逛逛街或跟朋友聊天，不想动脑' },
    ]},

  // ── metacognition (MAI) ── 3 SJT items
  { id: 'cat_cog8', text: '你刚看完一篇文章的论点但感觉似乎哪里不太对劲：', type: 'sjt', dimension: 'cognitive', subDimension: 'metacognition', scaleRef: 'MAI', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '停下来分析自己的困惑来源——是逻辑漏洞还是概念不清' },
      { value: 3, label: '重新读一遍，标注有疑问的段落' },
      { value: 2, label: '算了，可能是我理解力不够' },
      { value: 1, label: '直接关掉，反正读不懂就不读了' },
    ]},
  { id: 'cat_cog9', text: '考试/面试前一晚，你会：', type: 'sjt', dimension: 'cognitive', subDimension: 'metacognition', scaleRef: 'MAI', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '复盘自己的知识盲区清单，针对性查漏补缺' },
      { value: 3, label: '把重点内容过一遍，大致心里有数' },
      { value: 2, label: '随便翻翻资料，考到哪算哪' },
      { value: 1, label: '直接去睡觉，临阵磨枪没啥用' },
    ]},
  { id: 'cat_cog9b', text: '你在学一项新技能时反复犯同一个错误：', type: 'sjt', dimension: 'cognitive', subDimension: 'metacognition', scaleRef: 'MAI', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '暂停练习，先分析错误模式——是理解错了还是习惯动作干扰' },
      { value: 3, label: '换个方法试试，总结一下为什么之前会出错' },
      { value: 2, label: '多练几次，熟能生巧应该就好了' },
      { value: 1, label: '可能我不适合这个，考虑放弃' },
    ]},
]);

// ════════════════════════════════════════════════════════════
// Ⅱ. 人格结构 (8 sub-dims → 24 questions)
// ════════════════════════════════════════════════════════════
export const catPersonalityModule = buildModule('personality', [
  // ── extraversion (IPIP-NEO) ── 3 SJT items
  { id: 'cat_per1', text: '你被邀请参加一个大部分人你都不认识的行业聚会：', type: 'sjt', dimension: 'personality', subDimension: 'extraversion', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '太好了，又能认识新朋友！我会主动找人聊天' },
      { value: 3, label: '去看看吧，遇到聊得来的就多聊几句' },
      { value: 2, label: '有点犹豫，可能会找个角落待着' },
      { value: 1, label: '不想去，一群陌生人的场合让我不舒服' },
    ]},
  { id: 'cat_per2', text: '一个普通的工作日结束后，你希望的晚上是：', type: 'sjt', dimension: 'personality', subDimension: 'extraversion', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '约几个朋友出去吃饭聊天，越热闹越好' },
      { value: 3, label: '和一两个好友出去散步或吃个饭' },
      { value: 2, label: '回家看部电影或看书，安静放松一下' },
      { value: 1, label: '一个人待着，最好谁也不要打扰我' },
    ]},
  { id: 'cat_per2b', text: '在团队头脑风暴中，你通常是：', type: 'sjt', dimension: 'personality', subDimension: 'extraversion', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '点子王，第一个开口的总是我' },
      { value: 3, label: '积极参与，气氛好的时候特别活跃' },
      { value: 2, label: '先听别人说，有好想法再补充' },
      { value: 1, label: '不太说话，会后再把想法写成文字发过去' },
    ]},

  // ── openness (IPIP-NEO) ── 3 SJT items
  { id: 'cat_per3', text: '一个朋友推荐你尝试一种你从没接触过的运动（比如攀岩/冲浪/飞盘）：', type: 'sjt', dimension: 'personality', subDimension: 'openness', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '马上报名！新东西就是要体验一下才知道' },
      { value: 3, label: '先搜搜视频了解一下，感兴趣就去试试' },
      { value: 2, label: '想想再说，不确定自己会不会喜欢' },
      { value: 1, label: '不太想折腾，还是做自己熟悉的活动吧' },
    ]},
  { id: 'cat_per4', text: '你在博物馆里看到一幅完全看不懂的当代艺术作品：', type: 'sjt', dimension: 'personality', subDimension: 'openness', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '太有意思了！我要琢磨一下艺术家想表达什么' },
      { value: 3, label: '虽然看不太懂，但还是愿意停下来感受一下' },
      { value: 2, label: '看了一眼就走了，看不懂就不看了' },
      { value: 1, label: '这也算艺术？浪费时间' },
    ]},
  { id: 'cat_per4b', text: '有人给你推荐一本与你平时阅读偏好完全不同类型的书：', type: 'sjt', dimension: 'personality', subDimension: 'openness', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '正好想打开一个新的视野，借来看看' },
      { value: 3, label: '翻翻前几页，有点意思就继续读' },
      { value: 2, label: '可能会放在那里很久都不会碰' },
      { value: 1, label: '不感兴趣，我只看自己喜欢的内容' },
    ]},

  // ── conscientiousness (IPIP-NEO) ── 3 SJT items
  { id: 'cat_per5', text: '你同时接到了三个不同截止日期的任务：', type: 'sjt', dimension: 'personality', subDimension: 'conscientiousness', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '立刻按紧急程度排序，制定每天的推进计划' },
      { value: 3, label: '先把最紧急的做了，其他的抽空处理' },
      { value: 2, label: '有点慌，可能会拖到快截止才开始赶' },
      { value: 1, label: '随缘吧，到时候再说' },
    ]},
  { id: 'cat_per6', text: '你的房间/工作桌面现在是什么状态？', type: 'sjt', dimension: 'personality', subDimension: 'conscientiousness', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '井井有条，每样东西都有固定位置' },
      { value: 3, label: '大体整洁，偶尔会乱一两天再收拾' },
      { value: 2, label: '挺乱的，但我知道东西在哪（大概）' },
      { value: 1, label: '很混乱，但我觉得无所谓' },
    ]},
  { id: 'cat_per6b', text: '你答应朋友帮忙做一件事，但后来发现比预想的麻烦得多：', type: 'sjt', dimension: 'personality', subDimension: 'conscientiousness', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '答应了就要做到，再麻烦也得善始善终' },
      { value: 3, label: '尽力做好，实在不行跟朋友坦诚沟通' },
      { value: 2, label: '嘴上说着在做，实际上拖着没怎么动' },
      { value: 1, label: '找个借口推掉算了' },
    ]},

  // ── agreeableness (IPIP-NEO) ── 3 SJT items
  { id: 'cat_per7', text: '你在团队讨论中和一个同事的观点完全相反：', type: 'sjt', dimension: 'personality', subDimension: 'agreeableness', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '认真听对方说完，尽量找到双方都能接受的方案' },
      { value: 3, label: '表达自己的观点，但也愿意做出让步' },
      { value: 2, label: '坚持自己的看法，不太想妥协' },
      { value: 1, label: '直接反驳对方，他说的明显不对' },
    ]},
  { id: 'cat_per8', text: '排队时有人插到你前面了：', type: 'sjt', dimension: 'personality', subDimension: 'agreeableness', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '算了，也许人家有急事儿' },
      { value: 3, label: '友善地提醒一下对方这里在排队' },
      { value: 2, label: '心里不爽但不说，暗暗翻个白眼' },
      { value: 1, label: '直接怼回去，凭什么插队' },
    ]},
  { id: 'cat_per8b', text: '你的邻居深夜放音乐很大声影响你休息：', type: 'sjt', dimension: 'personality', subDimension: 'agreeableness', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '第二天友善地去敲门聊一聊，相互理解' },
      { value: 3, label: '发个消息温和地提醒一下' },
      { value: 2, label: '忍着，但心里对邻居的印象变差了' },
      { value: 1, label: '直接去敲门理论，该强硬就强硬' },
    ]},

  // ── neuroticism (IPIP-NEO) ── 3 SJT items
  { id: 'cat_per9', text: '你在等一个重要的面试/考试结果，已经过了预计的通知时间：', type: 'sjt', dimension: 'personality', subDimension: 'neuroticism', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 1, label: '淡定地等着，该来的总会来' },
      { value: 2, label: '有点紧张但还能正常做事' },
      { value: 3, label: '不停地刷邮件/消息，很难集中注意力' },
      { value: 4, label: '焦虑得睡不着觉，反复回想自己是不是搞砸了' },
    ]},
  { id: 'cat_per10', text: '你不小心犯了一个工作上的小失误被同事指出来了：', type: 'sjt', dimension: 'personality', subDimension: 'neuroticism', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 1, label: '谢谢提醒，改了就好，不放心上' },
      { value: 2, label: '稍微有点不好意思，但很快就过去了' },
      { value: 3, label: '挺难受的，之后好一阵子还在想这件事' },
      { value: 4, label: '反复自责，觉得自己太差劲了' },
    ]},
  { id: 'cat_per10b', text: '临近重要截止日期，突然又加了一堆额外的工作：', type: 'sjt', dimension: 'personality', subDimension: 'neuroticism', scaleRef: 'IPIP-NEO', sourceType: 'adapted_open',
    options: [
      { value: 1, label: '冷静拆解，一件件来，有优先级就不慌' },
      { value: 2, label: '虽然有些压力，但还能有条理地应对' },
      { value: 3, label: '心里很烦躁，效率明显下降' },
      { value: 4, label: '整个人都崩了，感觉什么都做不好' },
    ]},

  // ── honesty_humility (HEXACO) ── 3 SJT items
  { id: 'cat_per11', text: '你在餐厅收到的找零多了50元，你会：', type: 'sjt', dimension: 'personality', subDimension: 'honesty_humility', scaleRef: 'HEXACO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '立刻退回去，这不是我的钱' },
      { value: 3, label: '犹豫一下，但还是会退回去' },
      { value: 2, label: '看心情，如果麻烦就算了' },
      { value: 1, label: '直接收下，是他们的失误' },
    ]},
  { id: 'cat_per11b', text: '你的工作成果里有相当一部分其实是另一个同事帮忙完成的：', type: 'sjt', dimension: 'personality', subDimension: 'honesty_humility', scaleRef: 'HEXACO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '在汇报时主动提到同事的贡献，把功劳分出去' },
      { value: 3, label: '不会邀功，但也不会特别强调别人的贡献' },
      { value: 2, label: '如果领导不问就不主动提' },
      { value: 1, label: '这是我的成果，谁让功劳是挂在我名下的' },
    ]},
  { id: 'cat_per11c', text: '朋友请你帮忙写一份推荐信，但你觉得他在某方面确实不够优秀：', type: 'sjt', dimension: 'personality', subDimension: 'honesty_humility', scaleRef: 'HEXACO', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '写，但会如实描述，突出优势的同时不夸大' },
      { value: 3, label: '帮忙写，措辞上适当美化但不编造' },
      { value: 2, label: '全往好了说呗，反正都是帮朋友' },
      { value: 1, label: '写最好的版本，管它真不真实' },
    ]},

  // ── resilience (BRS) ── 3 SJT items
  { id: 'cat_per12', text: '你花了很长时间准备的一个项目方案被领导当众否决了：', type: 'sjt', dimension: 'personality', subDimension: 'resilience', scaleRef: 'BRS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '虽然失望，但问清楚原因后很快投入到改进版中' },
      { value: 3, label: '低落几天，但慢慢调整过来重新开始' },
      { value: 2, label: '挺受打击的，好一阵子都提不起劲' },
      { value: 1, label: '彻底泄气了，不想再做类似的事' },
    ]},
  { id: 'cat_per12b', text: '你连续投了几十份简历都石沉大海：', type: 'sjt', dimension: 'personality', subDimension: 'resilience', scaleRef: 'BRS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '分析一下哪里出了问题，优化简历继续投' },
      { value: 3, label: '有点气馁，但还是坚持投，调整一下策略' },
      { value: 2, label: '非常沮丧，虽然还在投但心态已经很差了' },
      { value: 1, label: '算了，是不是我就不适合找工作' },
    ]},
  { id: 'cat_per12c', text: '你和亲密的人发生了一次很伤感情的冲突：', type: 'sjt', dimension: 'personality', subDimension: 'resilience', scaleRef: 'BRS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '虽然难过，但相信通过沟通能修复关系' },
      { value: 3, label: '情绪低落了一段时间，但慢慢能走出来' },
      { value: 2, label: '反复回想冲突细节，很久都走不出来' },
      { value: 1, label: '感觉被背叛了，不想再信任人了' },
    ]},

  // ── self_efficacy (GSE) ── 3 SJT items
  { id: 'cat_per13', text: '你被分配了一个从来没做过的全新类型的任务：', type: 'sjt', dimension: 'personality', subDimension: 'self_efficacy', scaleRef: 'GSE', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '有挑战就有成长，我查查资料一定能搞定' },
      { value: 3, label: '虽然没经验但可以边学边做' },
      { value: 2, label: '有点担心做不好，希望有人能带我入门' },
      { value: 1, label: '完了，我肯定搞不定这个' },
    ]},
  { id: 'cat_per13b', text: '你决定学习一门全新的技能（如编程/乐器/外语）：', type: 'sjt', dimension: 'personality', subDimension: 'self_efficacy', scaleRef: 'GSE', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '只要方法对、肯下功夫，没什么学不会的' },
      { value: 3, label: '可能需要一些时间，但我有信心至少入门' },
      { value: 2, label: '不确定自己能不能学好，走一步看一步' },
      { value: 1, label: '我学东西一向很慢，估计又要半途而废' },
    ]},
  { id: 'cat_per13c', text: '你的一个朋友创业成功了，问你要不要一起做一个新项目：', type: 'sjt', dimension: 'personality', subDimension: 'self_efficacy', scaleRef: 'GSE', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '好机会！我相信自己能在里面发挥价值' },
      { value: 3, label: '有兴趣，先了解一下具体需要我做什么' },
      { value: 2, label: '不太行吧，我感觉自己能力还不够' },
      { value: 1, label: '算了，创业太难了，我肯定做不来' },
    ]},
]);

// ════════════════════════════════════════════════════════════
// Ⅲ. 情感系统 (5 sub-dims → 15 questions)
// ════════════════════════════════════════════════════════════
export const catEmotionModule = buildModule('emotion', [
  // ── self_emotion (WLEIS) ── 3 SJT items
  { id: 'cat_emo1', text: '你在工作中突然心情很差，但说不清楚为什么：', type: 'sjt', dimension: 'emotion', subDimension: 'self_emotion', scaleRef: 'WLEIS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '暂停一下，仔细分辨——是疲惫、失望还是被忽视了？' },
      { value: 3, label: '大概知道是什么触发的，但不太确定具体是哪种情绪' },
      { value: 2, label: '就是心情不好，不想深究原因' },
      { value: 1, label: '完全说不清楚自己怎么了' },
    ]},
  { id: 'cat_emo2', text: '看完一部让你很受触动的电影后：', type: 'sjt', dimension: 'emotion', subDimension: 'self_emotion', scaleRef: 'WLEIS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '能精确地说出它触动了我的哪些情感——感动、遗憾还是对命运的敬畏' },
      { value: 3, label: '知道自己很受感动，但表达不出特别准确的感受' },
      { value: 2, label: '就觉得"好看"或"难过"，没有更细的分辨' },
      { value: 1, label: '没什么特别感觉，看完就完了' },
    ]},
  { id: 'cat_emo2b', text: '面对一个你很在意的人的批评时，你对自己情绪的把握：', type: 'sjt', dimension: 'emotion', subDimension: 'self_emotion', scaleRef: 'WLEIS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '清楚地意识到自己是感到受伤、自尊被触碰还是不甘心' },
      { value: 3, label: '知道自己很不舒服，大致能判断是哪方面受到了冲击' },
      { value: 2, label: '就是生气或难过，分不清更细的东西' },
      { value: 1, label: '整个人蒙住了，什么感觉都分不清' },
    ]},

  // ── other_emotion (WLEIS) ── 3 SJT items
  { id: 'cat_emo3', text: '你的同事今天一直很沉默，和平时表现完全不同：', type: 'sjt', dimension: 'emotion', subDimension: 'other_emotion', scaleRef: 'WLEIS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '马上注意到了，主动找个私密的场合关心一下对方' },
      { value: 3, label: '觉察到不太一样，但犹豫要不要主动问' },
      { value: 2, label: '隐约感觉不对，但没太在意' },
      { value: 1, label: '完全没注意到别人状态有变化' },
    ]},
  { id: 'cat_emo3b', text: '你在视频通话中注意到朋友虽然在笑，但眼神里似乎有些落寞：', type: 'sjt', dimension: 'emotion', subDimension: 'other_emotion', scaleRef: 'WLEIS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '直觉告诉我对方在硬撑，小心地试探"你是不是有心事？"' },
      { value: 3, label: '感觉有些异样，但不确定要不要戳破' },
      { value: 2, label: '稍微觉得不自然，但没有多想' },
      { value: 1, label: '对方在笑说明没问题吧' },
    ]},
  { id: 'cat_emo3c', text: '参加家庭聚餐时，你注意父母之间似乎气氛有些微妙：', type: 'sjt', dimension: 'emotion', subDimension: 'other_emotion', scaleRef: 'WLEIS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '从对话的语气和眼神就能判断大概是什么矛盾' },
      { value: 3, label: '感觉到了紧张的氛围，但不太确定原因' },
      { value: 2, label: '隐约觉得有点奇怪，但很快就不在意了' },
      { value: 1, label: '什么氛围？我只顾着吃' },
    ]},

  // ── emotion_regulation (ERQ) ── 3 SJT items
  { id: 'cat_emo4', text: '你被客户当面指责，但实际上不是你的责任：', type: 'sjt', dimension: 'emotion', subDimension: 'emotion_regulation', scaleRef: 'ERQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '告诉自己客户只是在发泄情绪，从他的角度看问题后冷静解释' },
      { value: 3, label: '深呼吸让自己先平静，然后心平气和地说明情况' },
      { value: 2, label: '虽然很生气但忍住不说，事后跟同事吐槽' },
      { value: 1, label: '当场就反驳/沉脸式对抗' },
    ]},
  { id: 'cat_emo5', text: '马上要上台演讲/汇报，你非常紧张：', type: 'sjt', dimension: 'emotion', subDimension: 'emotion_regulation', scaleRef: 'ERQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '把"紧张"重新定义为"兴奋"——这是身体在为我准备能量' },
      { value: 3, label: '做几次深呼吸，默念"我准备好了"来稳定情绪' },
      { value: 2, label: '强装镇定，用表面的冷静掩盖内心的慌乱' },
      { value: 1, label: '脑子一片空白，完全被紧张淹没了' },
    ]},
  { id: 'cat_emo5b', text: '你在等一个非常重要的消息（录取/offer/检查结果），焦虑感越来越强：', type: 'sjt', dimension: 'emotion', subDimension: 'emotion_regulation', scaleRef: 'ERQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '提醒自己焦虑改变不了结果，转去做一些能掌控的事' },
      { value: 3, label: '找朋友聊聊天分散注意力' },
      { value: 2, label: '虽然知道焦虑没用，但就是停不下来胡思乱想' },
      { value: 1, label: '反复刷手机，越想越慌，完全无法自控' },
    ]},

  // ── empathy (IRI) ── 3 SJT items
  { id: 'cat_emo6', text: '你在地铁上看到一位老人颤巍巍地站着，车厢里所有座位都有人坐：', type: 'sjt', dimension: 'emotion', subDimension: 'empathy', scaleRef: 'IRI', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '立刻站起来让座，并能感受到对方站着时的不适' },
      { value: 3, label: '会让座，觉得应该帮助老人' },
      { value: 2, label: '想让座但犹豫了，怕引起注意' },
      { value: 1, label: '低头看手机，假装没注意到' },
    ]},
  { id: 'cat_emo7', text: '好朋友向你倾诉他刚分手，哭得很伤心：', type: 'sjt', dimension: 'emotion', subDimension: 'empathy', scaleRef: 'IRI', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '心里跟着一阵揪紧，静静陪着对方，等对方想说话时再回应' },
      { value: 3, label: '认真倾听，安慰对方慢慢会好的' },
      { value: 2, label: '表示同情但不太确定该说什么' },
      { value: 1, label: '觉得也不是什么大事，分手又不是世界末日' },
    ]},
  { id: 'cat_emo7b', text: '你在纪录片中看到另一个国家的孩子因贫困无法上学：', type: 'sjt', dimension: 'emotion', subDimension: 'empathy', scaleRef: 'IRI', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '眼眶湿润，心里沉甸甸的，想着能做点什么帮助他们' },
      { value: 3, label: '觉得很心酸，希望世界能变得更好' },
      { value: 2, label: '有点感触但很快就过去了' },
      { value: 1, label: '看看就完了，跟我有什么关系' },
    ]},

  // ── meta_mood (TMMS) ── 3 SJT items
  { id: 'cat_emo8', text: '最近一段时间你总是很容易发脾气，你会怎么看待这件事：', type: 'sjt', dimension: 'emotion', subDimension: 'meta_mood', scaleRef: 'TMMS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '开始观察自己——什么时候最容易炸？是累了还是有未解决的压力？' },
      { value: 3, label: '意识到自己状态不太对，试着想一想原因' },
      { value: 2, label: '知道自己脾气不好，但也没想过为什么' },
      { value: 1, label: '有吗？我没觉得自己脾气有变化' },
    ]},
  { id: 'cat_emo9', text: '一件事让你既开心又有些酸楚（比如老朋友结婚）：', type: 'sjt', dimension: 'emotion', subDimension: 'meta_mood', scaleRef: 'TMMS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '清楚地知道自己在经历"苦乐交织"——为朋友高兴的同时感叹时光流逝' },
      { value: 3, label: '感觉到复杂情绪，大概理解自己为什么会这样' },
      { value: 2, label: '说不清自己什么感觉，就是有点怪怪的' },
      { value: 1, label: '没啥特别感觉，正常参加就行了' },
    ]},
  { id: 'cat_emo9b', text: '你发现自己连续好几天都无精打采，以前喜欢做的事也提不起兴趣：', type: 'sjt', dimension: 'emotion', subDimension: 'meta_mood', scaleRef: 'TMMS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '警觉地自查——这是正常的阶段性低落还是需要关注的信号？' },
      { value: 3, label: '注意到了，决定先让自己休息调整一下' },
      { value: 2, label: '不知道怎么回事，但也没想采取什么行动' },
      { value: 1, label: '没觉得有什么异常' },
    ]},
]);

// ════════════════════════════════════════════════════════════
// Ⅳ. 动机与价值 (6 sub-dims → 18 questions)
// ════════════════════════════════════════════════════════════
export const catMotivationModule = buildModule('motivation', [
  // ── self_direction (PVQ-RR) ── 3 SJT items
  { id: 'cat_val1', text: '公司要求所有人统一使用标准化的工作流程，你的反应：', type: 'sjt', dimension: 'motivation', subDimension: 'self_direction', scaleRef: 'PVQ-RR', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '我会在框架内尝试找到自己的高效方式' },
      { value: 3, label: '配合执行，但会提出自己认为可以优化的部分' },
      { value: 2, label: '按要求来就好，不想太折腾' },
      { value: 1, label: '公司规定的就是最好的，跟着做就行' },
    ]},
  { id: 'cat_val4', text: '如果你获得一笔不大不小的意外之财，你最想用来：', type: 'single', dimension: 'motivation', subDimension: 'self_direction', scaleRef: 'PVQ-RR', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '做一件我一直想尝试但没条件做的事' },
      { value: 3, label: '学一项新技能或去一个新地方旅行' },
      { value: 2, label: '存起来或买点实用的东西' },
      { value: 1, label: '请朋友吃饭或给家人买礼物' },
    ]},
  { id: 'cat_val1b', text: '在选择职业/项目方向时，最影响你的因素是：', type: 'sjt', dimension: 'motivation', subDimension: 'self_direction', scaleRef: 'PVQ-RR', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '这个方向是否能让我自由发挥、做自己想做的事' },
      { value: 3, label: '是否有足够的自主空间和创新机会' },
      { value: 2, label: '薪酬和稳定性更重要' },
      { value: 1, label: '大家都做什么我就做什么，跟上主流就好' },
    ]},

  // ── achievement (PVQ-RR) ── 3 SJT items
  { id: 'cat_val2', text: '你完成了一个不错的项目，你最希望得到的反馈是：', type: 'sjt', dimension: 'motivation', subDimension: 'achievement', scaleRef: 'PVQ-RR', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '"你的表现超出预期，已经达到了业内高水准"' },
      { value: 3, label: '"做得真好，可以看出你下了不少功夫"' },
      { value: 2, label: '"辛苦了，任务完成了就好"' },
      { value: 1, label: '其实不太需要别人的评价' },
    ]},
  { id: 'cat_val2b', text: '你和同龄人相比事业发展得更慢一些，你的感受：', type: 'sjt', dimension: 'motivation', subDimension: 'achievement', scaleRef: 'PVQ-RR', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '焦虑，我需要加倍努力赶上甚至超过他们' },
      { value: 3, label: '有点介意，但更专注于自己的节奏' },
      { value: 2, label: '无所谓，每个人有自己的路' },
      { value: 1, label: '完全不在意别人的进度，我只看自己开不开心' },
    ]},
  { id: 'cat_val2c', text: '你可以选择两份工作：A轻松但普通，B高压但很有成就含金量：', type: 'sjt', dimension: 'motivation', subDimension: 'achievement', scaleRef: 'PVQ-RR', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '毫不犹豫选B，我需要挑战来证明自己' },
      { value: 3, label: '倾向B，但需要衡量一下是否能承受高压' },
      { value: 2, label: '倾向A，为什么要那么拼呢' },
      { value: 1, label: '选A，生活的舒适度比成就重要得多' },
    ]},

  // ── benevolence (PVQ-RR) ── 3 SJT items
  { id: 'cat_val3', text: '你的好朋友半夜发消息说心情很差想找人聊聊，但你明天一早有重要会议：', type: 'sjt', dimension: 'motivation', subDimension: 'benevolence', scaleRef: 'PVQ-RR', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '立刻回拨电话，朋友需要我的时候我一定在' },
      { value: 3, label: '回消息安慰几句，约明晚拿出专门时间好好聊' },
      { value: 2, label: '简单回复说"我明天早起，改天聊？"' },
      { value: 1, label: '看到了但假装没看到，自己的事更重要' },
    ]},
  { id: 'cat_val3b', text: '你在回家路上看到一位陌生人的车抛锚了，你赶时间：', type: 'sjt', dimension: 'motivation', subDimension: 'benevolence', scaleRef: 'PVQ-RR', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '停下来帮忙，帮助别人比准时到家更让我心安' },
      { value: 3, label: '至少停下来问一句需不需要帮忙打电话' },
      { value: 2, label: '心里想帮但赶时间，开过去了' },
      { value: 1, label: '不是我的事，有保险公司处理吧' },
    ]},
  { id: 'cat_val3c', text: '年底你有一笔可自由支配的钱，你倾向于：', type: 'sjt', dimension: 'motivation', subDimension: 'benevolence', scaleRef: 'PVQ-RR', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '给家人和好友买一些暖心的礼物，看到他们开心我就满足' },
      { value: 3, label: '一部分给家人，一部分留给自己' },
      { value: 2, label: '主要用在自己身上，过年意思意思就好' },
      { value: 1, label: '全部留给自己，何必为别人花钱' },
    ]},

  // ── autonomy (BPNSFS) ── 3 SJT items
  { id: 'cat_val5', text: '你的老板微观管理你的工作——每件事都要报备审批：', type: 'sjt', dimension: 'motivation', subDimension: 'autonomy', scaleRef: 'BPNSFS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '严重影响我的积极性，我需要自主决策的空间' },
      { value: 3, label: '比较受不了，但能理解老板的出发点' },
      { value: 2, label: '有点不爽但习惯了，听从安排也省事' },
      { value: 1, label: '无所谓，反正老板做决定我就不用操心了' },
    ]},
  { id: 'cat_val5b', text: '父母/长辈对你的人生大事（工作/婚恋）有很多意见和安排：', type: 'sjt', dimension: 'motivation', subDimension: 'autonomy', scaleRef: 'BPNSFS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '我的生活我自己选择，可以参考但不接受安排' },
      { value: 3, label: '认真听取建议，但最终按自己的想法来' },
      { value: 2, label: '家人的意见很重要，只要不太离谱就可以接受' },
      { value: 1, label: '按他们说的做，毕竟他们经验多' },
    ]},
  { id: 'cat_val5c', text: '你手头有一个项目可以自由决定做法，也可以完全按照已有模板来做：', type: 'sjt', dimension: 'motivation', subDimension: 'autonomy', scaleRef: 'BPNSFS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '必须自己设计方案，照模板做没有灵魂' },
      { value: 3, label: '参考模板但会加入自己的改造' },
      { value: 2, label: '先用模板做完，有时间再微调' },
      { value: 1, label: '模板已经有了为什么还要自己想？' },
    ]},

  // ── competence (BPNSFS) ── 3 SJT items
  { id: 'cat_val6', text: '你被安排做一件以你目前能力来看刚好在舒适区边缘的任务：', type: 'sjt', dimension: 'motivation', subDimension: 'competence', scaleRef: 'BPNSFS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '正合我意，有点挑战才有成长的感觉' },
      { value: 3, label: '有点兴奋也有点焦虑，但愿意试试' },
      { value: 2, label: '更希望做自己已经很擅长的事' },
      { value: 1, label: '压力太大了，我更想在舒适区里待着' },
    ]},
  { id: 'cat_val6b', text: '在某个领域你已经掌握得不错了，你会：', type: 'sjt', dimension: 'motivation', subDimension: 'competence', scaleRef: 'BPNSFS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '继续精进，追求从"不错"变成"专家级"' },
      { value: 3, label: '保持现有水平，同时尝试拓展相关领域' },
      { value: 2, label: '够用就行，不想再花更多时间在上面了' },
      { value: 1, label: '差不多得了，学那么深有什么意义' },
    ]},
  { id: 'cat_val6c', text: '你参加了一场比赛/测评，结果比你预期的差很多：', type: 'sjt', dimension: 'motivation', subDimension: 'competence', scaleRef: 'BPNSFS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '复盘分析哪里不足，制定练习计划下次一定要证明自己' },
      { value: 3, label: '有点失望，但打算重点提升薄弱环节' },
      { value: 2, label: '沮丧了一阵，但不打算再参加了' },
      { value: 1, label: '果然我就是不行，不适合做这个' },
    ]},

  // ── relatedness (BPNSFS) ── 3 SJT items
  { id: 'cat_val7', text: '搬到一个新城市后，最让你不适应的是：', type: 'sjt', dimension: 'motivation', subDimension: 'relatedness', scaleRef: 'BPNSFS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '没有可以随时约出来聊天的朋友，很渴望建立新的联结' },
      { value: 3, label: '想念老朋友，正在努力认识新的人' },
      { value: 2, label: '有点孤单，但一个人也能过' },
      { value: 1, label: '无所谓，我一个人待着也挺自在的' },
    ]},
  { id: 'cat_val7b', text: '你在做一件事时取得了不错的成果：', type: 'sjt', dimension: 'motivation', subDimension: 'relatedness', scaleRef: 'BPNSFS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '第一反应是找人分享——如果没人分享，快乐会减半' },
      { value: 3, label: '会跟亲近的人说一下，分享让快乐更完整' },
      { value: 2, label: '自己知道就好，不一定要跟别人说' },
      { value: 1, label: '不需要分享，独自享受成果感' },
    ]},
  { id: 'cat_val7c', text: '你理想中完美的周末是：', type: 'sjt', dimension: 'motivation', subDimension: 'relatedness', scaleRef: 'BPNSFS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '和家人朋友在一起——吃饭、聊天、一起做点什么' },
      { value: 3, label: '白天和朋友出去，晚上回家一个人放松' },
      { value: 2, label: '大部分时间自己待着，偶尔联系一下朋友' },
      { value: 1, label: '最好谁都不要打扰我，独处就是最好的充电' },
    ]},
]);

// ════════════════════════════════════════════════════════════
// Ⅴ. 社会联结 (6 sub-dims → 18 questions)
// ════════════════════════════════════════════════════════════
export const catSocialModule = buildModule('social', [
  // ── attachment_anxiety (ECR-R) ── 3 SJT items
  { id: 'cat_soc1', text: '你的另一半/最亲密的朋友回消息比平时慢了很多：', type: 'sjt', dimension: 'social', subDimension: 'attachment_anxiety', scaleRef: 'ECR-R', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '心里发慌，忍不住反复确认对方是不是生气了或者对我有意见' },
      { value: 3, label: '有点担心，但提醒自己可能只是在忙' },
      { value: 2, label: '稍微注意到了，但没太放在心上' },
      { value: 1, label: '完全不会多想，各有各的节奏' },
    ]},
  { id: 'cat_soc2', text: '你在朋友群里发了一条消息，过了很久没有人回应：', type: 'sjt', dimension: 'social', subDimension: 'attachment_anxiety', scaleRef: 'ECR-R', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '开始焦虑——是不是我说错话了？他们是不是不喜欢我？' },
      { value: 3, label: '有点小失落，但很快就不在意了' },
      { value: 2, label: '无所谓，可能大家都在忙' },
      { value: 1, label: '根本不会注意谁回没回' },
    ]},
  { id: 'cat_soc2b', text: '你和亲近的人闹了一点小矛盾还没解决：', type: 'sjt', dimension: 'social', subDimension: 'attachment_anxiety', scaleRef: 'ECR-R', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '坐立不安，不停地想对方是不是要跟我绝交了' },
      { value: 3, label: '有些不安，主动找对方道歉或沟通' },
      { value: 2, label: '心里有些别扭，但等过两天自然就好了' },
      { value: 1, label: '小矛盾而已，不至于影响什么' },
    ]},

  // ── attachment_avoidance (ECR-R) ── 3 SJT items
  { id: 'cat_soc3', text: '你的好朋友想跟你聊一些很私人的心里话：', type: 'sjt', dimension: 'social', subDimension: 'attachment_avoidance', scaleRef: 'ECR-R', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '有点不自在，我不太习惯这种深入的情感交流' },
      { value: 3, label: '愿意听，但自己不太会主动分享类似的话题' },
      { value: 2, label: '可以聊，气氛到了我也会说说自己的事' },
      { value: 1, label: '很愿意，亲密的人之间就应该互相打开' },
    ]},
  { id: 'cat_soc4', text: '你的伴侣/最好的朋友说想拥抱你一下（在一个让你觉得有点突然的时刻）：', type: 'sjt', dimension: 'social', subDimension: 'attachment_avoidance', scaleRef: 'ECR-R', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '身体有点僵硬，对突然的亲密接触感到不自在' },
      { value: 3, label: '虽然有点意外，但还是接受了' },
      { value: 2, label: '没什么感觉，给个拥抱也正常' },
      { value: 1, label: '很自然地回应，身体接触让我感到温暖' },
    ]},
  { id: 'cat_soc4b', text: '朋友提议定期约一个"深度聊天局"，每次认真聊彼此最近的困惑和内心世界：', type: 'sjt', dimension: 'social', subDimension: 'attachment_avoidance', scaleRef: 'ECR-R', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '我更喜欢一起做事而不是坐下来"聊心事"' },
      { value: 3, label: '偶尔可以，但每次都这么深入让人有压力' },
      { value: 2, label: '还挺好的，但我可能不会每次都参加' },
      { value: 1, label: '太棒了，正缺这样交流心事的机会' },
    ]},

  // ── interpersonal_warmth (IPIP-IPC) ── 3 SJT items
  { id: 'cat_soc5', text: '公司新来了一个人，看起来有些局促不安：', type: 'sjt', dimension: 'social', subDimension: 'interpersonal_warmth', scaleRef: 'IPIP-IPC', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '主动走过去带他认识大家，帮他融入' },
      { value: 3, label: '友好地打个招呼，有问题让他找我' },
      { value: 2, label: '等对方主动找人，不想太热情显得奇怪' },
      { value: 1, label: '各管各的，新人融入是他自己的事' },
    ]},
  { id: 'cat_soc5b', text: '在社交场合中，你跟不太熟的人聊天时：', type: 'sjt', dimension: 'social', subDimension: 'interpersonal_warmth', scaleRef: 'IPIP-IPC', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '真心对对方感兴趣，会主动倾听和回应' },
      { value: 3, label: '保持友好，聊一些轻松的话题' },
      { value: 2, label: '礼貌应付，但内心觉得尬聊没意思' },
      { value: 1, label: '尽量避免，能不交谈就不交谈' },
    ]},
  { id: 'cat_soc5c', text: '朋友送了你一个并不太合心意的礼物：', type: 'sjt', dimension: 'social', subDimension: 'interpersonal_warmth', scaleRef: 'IPIP-IPC', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '真诚地感谢对方的心意，礼物不重要，关系最重要' },
      { value: 3, label: '开心地收下，不会让对方感到尷尬' },
      { value: 2, label: '收了，但心里觉得有点可惜' },
      { value: 1, label: '直接说不太喜欢，下次别买了' },
    ]},

  // ── interpersonal_dominance (IPIP-IPC) ── 3 SJT items
  { id: 'cat_soc6', text: '你们一群人出去玩，没有人拿主意，大家都面面相觑：', type: 'sjt', dimension: 'social', subDimension: 'interpersonal_dominance', scaleRef: 'IPIP-IPC', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '我来定吧！很快列出几个选项让大家投票' },
      { value: 3, label: '提出一个建议，看大家怎么说' },
      { value: 2, label: '等别人先说，然后附和' },
      { value: 1, label: '随便，你们说去哪就去哪' },
    ]},
  { id: 'cat_soc6b', text: '在一个项目中，你觉得团队的方向走偏了：', type: 'sjt', dimension: 'social', subDimension: 'interpersonal_dominance', scaleRef: 'IPIP-IPC', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '直接在会上指出问题，强力推动团队回到正轨' },
      { value: 3, label: '找负责人私下沟通自己的担忧' },
      { value: 2, label: '想说但怕得罪人，先观望一下' },
      { value: 1, label: '不是我负责的就不管了' },
    ]},
  { id: 'cat_soc6c', text: '同事之间发生了分歧需要有人裁决，大家看向你：', type: 'sjt', dimension: 'social', subDimension: 'interpersonal_dominance', scaleRef: 'IPIP-IPC', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '自然地承担裁决角色，给出明确判断' },
      { value: 3, label: '愿意帮忙协调，但尽量让双方自己达成共识' },
      { value: 2, label: '觉得有压力，不太想当这个"裁判"' },
      { value: 1, label: '推给别人，我不想卷入别人的纷争' },
    ]},

  // ── social_connectedness (SCS-R) ── 3 SJT items
  { id: 'cat_soc7', text: '你走在热闹的商业街上，看着人来人往：', type: 'sjt', dimension: 'social', subDimension: 'social_connectedness', scaleRef: 'SCS-R', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '感觉自己是这个世界的一部分，和周围的人有一种无形的联结' },
      { value: 3, label: '心情挺好的，喜欢有人气的氛围' },
      { value: 2, label: '嗯，就是在逛街，跟别人没什么联系' },
      { value: 1, label: '觉得自己是人群中的一座孤岛' },
    ]},
  { id: 'cat_soc7b', text: '你看到一群陌生人在公园里自发组织活动（打球/弹唱/跳舞）：', type: 'sjt', dimension: 'social', subDimension: 'social_connectedness', scaleRef: 'SCS-R', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '感到暖心，想加入或在旁边看着也觉得开心' },
      { value: 3, label: '觉得挺好的，会停下来欣赏一下' },
      { value: 2, label: '看一眼就走了，不太感兴趣' },
      { value: 1, label: '不理解为什么一群陌生人要凑在一起' },
    ]},
  { id: 'cat_soc7c', text: '你在异国旅行时遇到一个也在独自旅行的人，对方向你微笑打招呼：', type: 'sjt', dimension: 'social', subDimension: 'social_connectedness', scaleRef: 'SCS-R', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '开心地聊起来，甚至约着一起逛下一个景点' },
      { value: 3, label: '友好地回应，寒暄几句' },
      { value: 2, label: '礼貌点头后继续自己的行程' },
      { value: 1, label: '不太想搭理陌生人' },
    ]},

  // ── conflict_style (ROCI-II) ── 3 SJT items
  { id: 'cat_soc8', text: '你和室友/伴侣在家务分工上产生了矛盾：', type: 'sjt', dimension: 'social', subDimension: 'conflict_style', scaleRef: 'ROCI-II', sourceType: 'adapted_open',
    options: [
      { value: 'integrating', label: '坐下来一起讨论各自的需求，找到一个双方都满意的方案' },
      { value: 'compromising', label: '各退一步，轮流多做或平分任务' },
      { value: 'avoiding', label: '算了，不想因为这种小事吵架' },
      { value: 'dominating', label: '明确告诉对方哪些是TA该做的，不容商量' },
    ]},
  { id: 'cat_soc9', text: '团队开会时你的方案和另一个同事的方案冲突了：', type: 'sjt', dimension: 'social', subDimension: 'conflict_style', scaleRef: 'ROCI-II', sourceType: 'adapted_open',
    options: [
      { value: 'integrating', label: '仔细分析两个方案的优缺点，看能否整合成更好的版本' },
      { value: 'obliging', label: '如果对方感受很强烈，我可以退让' },
      { value: 'dominating', label: '据理力争，我的方案明显更好' },
      { value: 'avoiding', label: '不想起冲突，等领导来裁决吧' },
    ]},
  { id: 'cat_soc9b', text: '你和朋友对假期去哪里旅行有不同想法：', type: 'sjt', dimension: 'social', subDimension: 'conflict_style', scaleRef: 'ROCI-II', sourceType: 'adapted_open',
    options: [
      { value: 'integrating', label: '两个目的地各取一部分优点，设计一条兼顾的路线' },
      { value: 'compromising', label: '这次听我的，下次听你的' },
      { value: 'obliging', label: '你开心就好，去哪我都行' },
      { value: 'dominating', label: '我更了解旅行，听我的准没错' },
    ]},
]);

// ════════════════════════════════════════════════════════════
// Ⅵ. 审美与创造 (4 sub-dims → 12 questions)
// ════════════════════════════════════════════════════════════
export const catAestheticModule = buildModule('aesthetic', [
  // ── divergent_thinking (AUT) ── 3 open items
  { id: 'cat_aes1', text: '请在90秒内列出"一把伞"的所有非常规用途——越不寻常、越有创意越好。', type: 'open', dimension: 'aesthetic', subDimension: 'divergent_thinking', scaleRef: 'AUT', sourceType: 'original' },
  { id: 'cat_aes2', text: '请在90秒内列出"一根筷子"的所有非常规用途。', type: 'open', dimension: 'aesthetic', subDimension: 'divergent_thinking', scaleRef: 'AUT', sourceType: 'original' },
  { id: 'cat_aes2b', text: '请在90秒内列出"一张A4纸"的所有非常规用途。', type: 'open', dimension: 'aesthetic', subDimension: 'divergent_thinking', scaleRef: 'AUT', sourceType: 'original' },

  // ── aesthetic_sensitivity (AESTHEMOS) ── 3 SJT items
  { id: 'cat_aes3', text: '你在咖啡厅偶然听到一段钢琴曲，旋律优美得让你停下了手上的事：', type: 'sjt', dimension: 'aesthetic', subDimension: 'aesthetic_sensitivity', scaleRef: 'AESTHEMOS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '全身起鸡皮疙瘩，一种说不出的感动涌上心头' },
      { value: 3, label: '觉得很好听，停下来认真欣赏了一会儿' },
      { value: 2, label: '注意到了，觉得还不错，但没什么特别感触' },
      { value: 1, label: '背景音乐而已，没在意' },
    ]},
  { id: 'cat_aes4', text: '你看到一张光影绝美的摄影作品（比如金色阳光穿过森林薄雾）：', type: 'sjt', dimension: 'aesthetic', subDimension: 'aesthetic_sensitivity', scaleRef: 'AESTHEMOS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '呆住了好几秒，心里涌起一种敬畏和宁静混合的感觉' },
      { value: 3, label: '感叹"好美"，保存下来或分享给朋友' },
      { value: 2, label: '嗯，确实拍得不错' },
      { value: 1, label: '看了一眼就滑过了' },
    ]},
  { id: 'cat_aes8', text: '你走过一栋旧建筑，注意到它的外墙砖块在阳光下呈现出深浅不一的红棕色渐变：', type: 'sjt', dimension: 'aesthetic', subDimension: 'aesthetic_sensitivity', scaleRef: 'AESTHEMOS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '停下脚步仔细看，被时间在建筑上留下的美感打动了' },
      { value: 3, label: '注意到了，觉得有一种独特的旧时代美' },
      { value: 2, label: '瞥了一眼，没什么特别感觉' },
      { value: 1, label: '旧就是旧，有什么好看的' },
    ]},

  // ── creative_achievement (CAQ) ── 3 SJT items
  { id: 'cat_aes7', text: '回想一下你过去几年的生活，在创造性活动方面（写作/绘画/编曲/编程/手作/策划等）：', type: 'sjt', dimension: 'aesthetic', subDimension: 'creative_achievement', scaleRef: 'CAQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '有好几个我引以为傲的作品/成果，在特定圈子里获得了认可' },
      { value: 3, label: '做过一些有创意的东西，虽然不一定很正式' },
      { value: 2, label: '偶尔有想法但很少真正动手去做' },
      { value: 1, label: '基本没有任何创造性产出' },
    ]},
  { id: 'cat_aes7b', text: '如果有人说"你是一个有创造力的人"，你的感受是：', type: 'sjt', dimension: 'aesthetic', subDimension: 'creative_achievement', scaleRef: 'CAQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '完全认同，创造是我的核心身份之一' },
      { value: 3, label: '有点意外但觉得有道理，我确实喜欢创造' },
      { value: 2, label: '不太确定，我觉得自己创造力一般' },
      { value: 1, label: '不同意，我不是那种有创造力的人' },
    ]},
  { id: 'cat_aes7c', text: '你有一个创意想法闪过脑海（一个故事/一个产品设计/一首曲子），你会：', type: 'sjt', dimension: 'aesthetic', subDimension: 'creative_achievement', scaleRef: 'CAQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '立刻记下来，找时间把它变成现实' },
      { value: 3, label: '记下来，但不一定会去实现' },
      { value: 2, label: '想了想觉得挺有趣，但转眼就忘了' },
      { value: 1, label: '很少会有什么创意想法闪过' },
    ]},

  // ── creative_self (SSCS) ── 3 SJT items
  { id: 'cat_aes5', text: '有人让你用一种完全不同的方式重新设计自己的房间布局：', type: 'sjt', dimension: 'aesthetic', subDimension: 'creative_self', scaleRef: 'SSCS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '兴奋！脑子里立刻蹦出好几种大胆的方案' },
      { value: 3, label: '有点想法，虽然不确定实不实际' },
      { value: 2, label: '不太擅长这种事，可能需要看看别人的案例' },
      { value: 1, label: '现在这样挺好的，为什么要折腾' },
    ]},
  { id: 'cat_aes6', text: '当一件事有"标准做法"时，你更倾向于：', type: 'sjt', dimension: 'aesthetic', subDimension: 'creative_self', scaleRef: 'SSCS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '先想想有没有更好/更有趣的做法，标准只是起点' },
      { value: 3, label: '基本按标准做，但会加入一些个人创意' },
      { value: 2, label: '按模板来就好，没必要搞特殊' },
      { value: 1, label: '喜欢标准化，统一做法效率高' },
    ]},
  { id: 'cat_aes6b', text: '你面对一个没有标准答案的开放式问题（如"如何改善社区活力"）：', type: 'sjt', dimension: 'aesthetic', subDimension: 'creative_self', scaleRef: 'SSCS', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '正合我意！最喜欢这种可以自由发挥的问题' },
      { value: 3, label: '有些想法，思考的过程本身让我享受' },
      { value: 2, label: '有点茫然，不知道从哪里入手' },
      { value: 1, label: '更喜欢有明确答案的问题' },
    ]},
]);

// ════════════════════════════════════════════════════════════
// Ⅶ. 世界观与意义建构 (6 sub-dims → 18 questions)
// ════════════════════════════════════════════════════════════
export const catWorldviewModule = buildModule('worldview', [
  // ── meaning_presence (MLQ) ── 3 SJT items
  { id: 'cat_wv1', text: '如果有人问你"你这辈子最想实现的事是什么"：', type: 'sjt', dimension: 'worldview', subDimension: 'meaning_presence', scaleRef: 'MLQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '能立刻说出来，这个答案已经在我心里很久了' },
      { value: 3, label: '有一些模糊的方向，但还在理清中' },
      { value: 2, label: '没认真想过这个问题' },
      { value: 1, label: '说不出来，对未来没什么特别想法' },
    ]},
  { id: 'cat_wv2', text: '你在一天结束时回顾自己做的事情：', type: 'sjt', dimension: 'worldview', subDimension: 'meaning_presence', scaleRef: 'MLQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '觉得今天做的事和我的人生大方向高度一致' },
      { value: 3, label: '大部分时间还算有意义，虽然也有些是应付' },
      { value: 2, label: '就是按惯例过了一天，没什么特别' },
      { value: 1, label: '又是一天白活了的感觉' },
    ]},
  { id: 'cat_wv2b', text: '当别人问"你为什么选择现在的工作/方向"：', type: 'sjt', dimension: 'worldview', subDimension: 'meaning_presence', scaleRef: 'MLQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '因为这和我的人生使命紧密相连' },
      { value: 3, label: '因为我喜欢并且觉得有价值' },
      { value: 2, label: '没太多原因，就是这么走过来的' },
      { value: 1, label: '为了赚钱/迫于现实，没有更深的原因' },
    ]},

  // ── meaning_search (MLQ) ── 3 SJT items
  { id: 'cat_wv3', text: '你参加了一个关于"人生目的"的工作坊，你的态度是：', type: 'sjt', dimension: 'worldview', subDimension: 'meaning_search', scaleRef: 'MLQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '求之不得！我一直在寻找能帮我理清人生方向的资源' },
      { value: 3, label: '挺好的，也许能给我一些新的视角' },
      { value: 2, label: '可能有点鸡汤，但去听听也无妨' },
      { value: 1, label: '这种东西太虚了，不感兴趣' },
    ]},
  { id: 'cat_wv10', text: '你在洗澡或散步时突然开始想"我到底想要怎样的人生"：', type: 'sjt', dimension: 'worldview', subDimension: 'meaning_search', scaleRef: 'MLQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '经常这样，这类思考已经是我的日常了' },
      { value: 3, label: '偶尔会想，但不会纠结太久' },
      { value: 2, label: '很少有这种moment' },
      { value: 1, label: '从不想这些，活在当下就好' },
    ]},
  { id: 'cat_wv3b', text: '你读到一本让你重新审视自己生活方式的书/文章：', type: 'sjt', dimension: 'worldview', subDimension: 'meaning_search', scaleRef: 'MLQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '深深被触动，开始认真思考要不要做一些改变' },
      { value: 3, label: '有些启发，但不会因此彻底改变什么' },
      { value: 2, label: '当时有感触，过几天就忘了' },
      { value: 1, label: '看看就好，不会影响我的生活' },
    ]},

  // ── moral_care (MFQ) ── 3 SJT items
  { id: 'cat_wv4', text: '你在评判一个社会事件时，"有人因此受到了伤害"这个因素：', type: 'single', dimension: 'worldview', subDimension: 'moral_care', scaleRef: 'MFQ', sourceType: 'adapted_open',
    options: [
      { value: 5, label: '是我判断的第一要素——任何导致人受伤的都是不对的' },
      { value: 4, label: '非常重要，但也要看具体情况' },
      { value: 3, label: '比较重要' },
      { value: 2, label: '是考量之一，但不是最重要的' },
      { value: 1, label: '不太会从"有没有人受伤"这个角度思考' },
    ]},
  { id: 'cat_wv4b', text: '你看到路边有人在训斥一个看起来很害怕的小孩：', type: 'sjt', dimension: 'worldview', subDimension: 'moral_care', scaleRef: 'MFQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '心里很不舒服，考虑是否要上前关心一下' },
      { value: 3, label: '觉得这样做不好，但犹豫要不要介入别人的家事' },
      { value: 2, label: '注意到了但觉得管不了别人' },
      { value: 1, label: '不关我的事' },
    ]},
  { id: 'cat_wv4c', text: '一个食品公司为了利润偷偷降低了成本导致产品质量下降（虽然仍然合法）：', type: 'sjt', dimension: 'worldview', subDimension: 'moral_care', scaleRef: 'MFQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '这是对消费者的伤害，即使合法也在道德上不可接受' },
      { value: 3, label: '觉得不太好，但确实没违法' },
      { value: 2, label: '商家追求利润很正常' },
      { value: 1, label: '只要合法就没问题' },
    ]},

  // ── moral_fairness (MFQ) ── 3 SJT items
  { id: 'cat_wv5', text: '你知道一个能力一般的人通过走关系获得了好的职位：', type: 'sjt', dimension: 'worldview', subDimension: 'moral_fairness', scaleRef: 'MFQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '深感不公，这种事从根本上破坏了社会公平' },
      { value: 3, label: '觉得不对，但在现实中太常见了' },
      { value: 2, label: '有能力不等于有用，关系也是一种资源' },
      { value: 1, label: '很正常，适应社会规则就好' },
    ]},
  { id: 'cat_wv5b', text: '在一个团队项目中，贡献最少的人和你分得了同样的奖金：', type: 'sjt', dimension: 'worldview', subDimension: 'moral_fairness', scaleRef: 'MFQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '很不公平，应该按贡献分配' },
      { value: 3, label: '有些不满，但团队和谐也很重要' },
      { value: 2, label: '无所谓，拿到钱就好' },
      { value: 1, label: '大家平分是最简单的方式' },
    ]},
  { id: 'cat_wv5c', text: '你发现自己的工资比做同样工作的同事低了很多：', type: 'sjt', dimension: 'worldview', subDimension: 'moral_fairness', scaleRef: 'MFQ', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '同工同酬是基本原则，必须找HR或领导谈' },
      { value: 3, label: '很不舒服，会考虑找合适的时机提出来' },
      { value: 2, label: '有点介意但不想因此影响关系' },
      { value: 1, label: '薪酬这东西不好比，算了' },
    ]},

  // ── open_minded_thinking (AOT) ── 3 SJT items
  { id: 'cat_wv6', text: '你特别确信的一个"常识"被最新研究推翻了：', type: 'sjt', dimension: 'worldview', subDimension: 'open_minded_thinking', scaleRef: 'AOT', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '认真读完研究，如果证据充分就更新自己的认知' },
      { value: 3, label: '有些震惊，但愿意了解一下新发现' },
      { value: 2, label: '半信半疑，新研究不一定靠谱' },
      { value: 1, label: '不可能，这些研究肯定有问题' },
    ]},
  { id: 'cat_wv7', text: '在讨论一个敏感话题时，有人分享了一个你完全不认同的亲身经历：', type: 'sjt', dimension: 'worldview', subDimension: 'open_minded_thinking', scaleRef: 'AOT', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '认真倾听，虽然不同意但承认对方的经历是真实的' },
      { value: 3, label: '尊重对方的感受，同时表达自己不同的看法' },
      { value: 2, label: '心里不以为然，但礼貌性地听着' },
      { value: 1, label: '直接反驳，个人经历不能代表真相' },
    ]},
  { id: 'cat_wv7b', text: '你正在做一个重大生活决策，你会：', type: 'sjt', dimension: 'worldview', subDimension: 'open_minded_thinking', scaleRef: 'AOT', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '主动找不同背景和立场的人咨询，尤其是可能反对的人' },
      { value: 3, label: '多方了解信息，但主要依赖自己的判断' },
      { value: 2, label: '问问和自己想法相似的人，确认一下方向' },
      { value: 1, label: '自己想好了就行，不需要别人的意见' },
    ]},

  // ── sense_of_coherence (SOC-13) ── 3 SJT items
  { id: 'cat_wv8', text: '你的人生目前经历了一个意想不到的大转折（比如突然失业/搬家/分手）：', type: 'sjt', dimension: 'worldview', subDimension: 'sense_of_coherence', scaleRef: 'SOC-13', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '虽然措手不及，但相信这件事终究会以某种方式变成一种成长' },
      { value: 3, label: '困惑但还能保持乐观，慢慢适应新的状况' },
      { value: 2, label: '感觉生活一下子失去了方向' },
      { value: 1, label: '世界太荒诞了，什么计划都没用' },
    ]},
  { id: 'cat_wv9', text: '你面对一件很困难的事情，需要你全力以赴地去应对：', type: 'sjt', dimension: 'worldview', subDimension: 'sense_of_coherence', scaleRef: 'SOC-13', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '虽然辛苦但觉得值得，这个挑战于我有意义' },
      { value: 3, label: '不容易，但我可以调动身边的资源来应对' },
      { value: 2, label: '压力很大，不确定有什么意义' },
      { value: 1, label: '觉得很无力，不知道为什么要这么辛苦' },
    ]},
  { id: 'cat_wv9b', text: '回想你这些年的经历——那些好的坏的、意料之中和之外的：', type: 'sjt', dimension: 'worldview', subDimension: 'sense_of_coherence', scaleRef: 'SOC-13', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '都是拼图的一部分，拼在一起构成了现在独一无二的我' },
      { value: 3, label: '有些经历让我成长了，有些只是运气' },
      { value: 2, label: '好的不嫌多，坏的纯粹是倒霉' },
      { value: 1, label: '感觉人生就是一团乱麻，没什么逻辑可言' },
    ]},
]);

// ════════════════════════════════════════════════════════════
// Ⅷ. 品格优势 (8 sub-dims → 24 questions)
// ════════════════════════════════════════════════════════════
export const catStrengthsModule = buildModule('strengths', [
  // ── creativity (VIA) ── 3 SJT items
  { id: 'cat_str1', text: '面对一个常规的工作任务，你已经知道标准做法了：', type: 'sjt', dimension: 'strengths', subDimension: 'creativity', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '还是会先想想有没有更好玩、更高效的新方法' },
      { value: 3, label: '偶尔会尝试改进，但大多数时候按老办法来' },
      { value: 2, label: '标准做法就挺好，不需要折腾' },
      { value: 1, label: '按规矩来最省事，创新只会增加风险' },
    ]},
  { id: 'cat_str1b', text: '朋友遇到一个棘手的问题向你求助，常规方法都试过了不管用：', type: 'sjt', dimension: 'strengths', subDimension: 'creativity', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '兴奋起来了！开始从完全不同的角度想各种"歪招"' },
      { value: 3, label: '试着换个思路想想，也许能找到不同的解法' },
      { value: 2, label: '想不出来就算了，建议去找专业人士' },
      { value: 1, label: '常规方法不行那就真没办法了' },
    ]},
  { id: 'cat_str1c', text: '你在做一份PPT/方案，内容已经写好了：', type: 'sjt', dimension: 'strengths', subDimension: 'creativity', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '会花很多时间在呈现方式上——让它既有创意又让人印象深刻' },
      { value: 3, label: '在内容基础上适当美化，加点设计感' },
      { value: 2, label: '内容对了就行，形式不太重要' },
      { value: 1, label: '用默认模板就好，何必在形式上浪费时间' },
    ]},

  // ── curiosity (VIA) ── 3 SJT items
  { id: 'cat_str2', text: '你在刷手机时看到一个你完全不了解的领域的科普视频（比如量子生物学）：', type: 'sjt', dimension: 'strengths', subDimension: 'curiosity', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '立刻点进去看，然后可能会花一个小时深挖相关内容' },
      { value: 3, label: '好奇，看看有什么有趣的' },
      { value: 2, label: '瞥一眼标题就划走了' },
      { value: 1, label: '不感兴趣的领域完全不会点进去' },
    ]},
  { id: 'cat_str2b', text: '到一个新城市旅行，你的探索方式是：', type: 'sjt', dimension: 'strengths', subDimension: 'curiosity', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '钻进当地人才会去的小巷，随机走进一家看起来有故事的小店' },
      { value: 3, label: '除了热门景点，也会找些本地推荐的地方' },
      { value: 2, label: '按旅行攻略走就好' },
      { value: 1, label: '就去几个必打卡的景点就够了' },
    ]},
  { id: 'cat_str2c', text: '在聚会上遇到一个从事你完全不了解的职业的人（比如深海打捞员/气味设计师）：', type: 'sjt', dimension: 'strengths', subDimension: 'curiosity', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '眼睛亮了！一定要详细问问这个职业是什么样的' },
      { value: 3, label: '挺好奇的，会多聊几句了解一下' },
      { value: 2, label: '礼貌性地问一两个问题就换话题了' },
      { value: 1, label: '不感兴趣，聊自己熟悉的话题就好' },
    ]},

  // ── perseverance (VIA) ── 3 SJT items
  { id: 'cat_str3', text: '你正在做一个很重要的事情，但进展非常缓慢，看不到终点：', type: 'sjt', dimension: 'strengths', subDimension: 'perseverance', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '一步一步来，坚持做完是我对自己的承诺' },
      { value: 3, label: '调整期望和节奏，咬牙继续' },
      { value: 2, label: '动力在消退，可能会考虑放弃' },
      { value: 1, label: '太难了，这不适合我' },
    ]},
  { id: 'cat_str3b', text: '你学一项新技能已经几个月了，但还是停留在"入门水平"：', type: 'sjt', dimension: 'strengths', subDimension: 'perseverance', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '正常，突破瓶颈需要时间——继续练下去' },
      { value: 3, label: '有点沮丧，但还是不想放弃' },
      { value: 2, label: '怀疑自己是不是没天赋，可能会慢慢停下来' },
      { value: 1, label: '早就放弃了，学不会就是学不会' },
    ]},
  { id: 'cat_str3c', text: '你的一个计划因为意外因素被迫推倒重来：', type: 'sjt', dimension: 'strengths', subDimension: 'perseverance', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '心态上接受现实，行动上立刻开始重新规划' },
      { value: 3, label: '失望一阵子，但慢慢重新开始' },
      { value: 2, label: '很沮丧，过了很久才重新提起劲来' },
      { value: 1, label: '彻底泄气了，不想再做了' },
    ]},

  // ── kindness (VIA) ── 3 SJT items
  { id: 'cat_str4', text: '你在便利店排队结账，后面的人只拿了一瓶水，而你的购物车满满的：', type: 'sjt', dimension: 'strengths', subDimension: 'kindness', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '自然地让对方先结账，这种小善意是本能' },
      { value: 3, label: '会考虑让一下，取决于当时心情' },
      { value: 2, label: '谁会在意这种事？按顺序来就好' },
      { value: 1, label: '不会让，我先来的凭什么让别人' },
    ]},
  { id: 'cat_str4b', text: '你注意到一个同事最近总是一个人吃午饭，看起来有些孤单：', type: 'sjt', dimension: 'strengths', subDimension: 'kindness', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '主动邀请对方一起吃饭，让TA感受到被接纳' },
      { value: 3, label: '抽个机会跟对方聊聊，看看是不是遇到什么事了' },
      { value: 2, label: '注意到了但觉得不太方便主动' },
      { value: 1, label: '每个人有自己的社交方式，不用管太多' },
    ]},
  { id: 'cat_str4c', text: '你在街上看到一位显然迷路的游客在看地图：', type: 'sjt', dimension: 'strengths', subDimension: 'kindness', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '主动走过去帮忙指路，如果顺路甚至愿意带一段' },
      { value: 3, label: '如果对方看向我就会帮忙' },
      { value: 2, label: '等对方来问我再说' },
      { value: 1, label: '自己赶路，没时间管别人' },
    ]},

  // ── fairness (VIA) ── 3 SJT items
  { id: 'cat_str5', text: '你带领一个小组完成项目，有两个人的贡献明显更多：', type: 'sjt', dimension: 'strengths', subDimension: 'fairness', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '按实际贡献分配功劳和回报，对多干的人必须有体现' },
      { value: 3, label: '在表彰时重点提到贡献大的人' },
      { value: 2, label: '大家一起做的就一起分，不好太区分' },
      { value: 1, label: '谁分功劳多少无所谓，完成就好' },
    ]},
  { id: 'cat_str5b', text: '你在分组讨论中，发现一个人的观点被其他人忽略了：', type: 'sjt', dimension: 'strengths', subDimension: 'fairness', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '主动把话题拉回来——"刚才XX说的观点我觉得值得讨论"' },
      { value: 3, label: '等合适的时机帮对方补充一下' },
      { value: 2, label: '注意到了但没有行动' },
      { value: 1, label: '强者说了算，被忽略说明观点不够好' },
    ]},
  { id: 'cat_str5c', text: '你发现公司的某个规则对特定群体不太公平（比如弹性工作制度对有小孩的家长不友好）：', type: 'sjt', dimension: 'strengths', subDimension: 'fairness', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '虽然和我无关，但会通过正式渠道反映这个问题' },
      { value: 3, label: '跟同事讨论一下，看大家是不是也觉得不合理' },
      { value: 2, label: '觉得不太公平，但不想惹麻烦' },
      { value: 1, label: '规则就是规则，不影响我就不管' },
    ]},

  // ── prudence (VIA) ── 3 SJT items
  { id: 'cat_str6', text: '你的朋友拉你参与一个"稳赚不赔"的投资机会，年化收益30%：', type: 'sjt', dimension: 'strengths', subDimension: 'prudence', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '高回报必然高风险——先仔细研究，搞清楚所有细节再说' },
      { value: 3, label: '感兴趣但保持谨慎，只拿少量资金试水' },
      { value: 2, label: '朋友推荐的应该靠谱，可以考虑投一笔' },
      { value: 1, label: '赶紧入场，怕错过好机会' },
    ]},
  { id: 'cat_str6b', text: '你在争吵中想到了一句很解气但可能会伤害对方的话：', type: 'sjt', dimension: 'strengths', subDimension: 'prudence', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '咽下去——逞一时之快不值得破坏关系' },
      { value: 3, label: '犹豫了一下，用更温和的方式表达同样的意思' },
      { value: 2, label: '脱口而出了，虽然事后有点后悔' },
      { value: 1, label: '想到什么就说什么，不吐不快' },
    ]},
  { id: 'cat_str6c', text: '你面前有一个很诱人的短期机会，但它可能会影响你长期的计划：', type: 'sjt', dimension: 'strengths', subDimension: 'prudence', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '仔细权衡长短期利弊，不会因为一时冲动偏离轨道' },
      { value: 3, label: '有些犹豫，会征求信任的人的意见' },
      { value: 2, label: '短期收益太诱人了，忍不住想试试' },
      { value: 1, label: '哪来那么多长远计划，抓住眼前的再说' },
    ]},

  // ── self_regulation (VIA) ── 3 SJT items
  { id: 'cat_str7', text: '你正在节食/健身，面前放着一块特别好吃的蛋糕：', type: 'sjt', dimension: 'strengths', subDimension: 'self_regulation', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '目标优先——虽然很馋但会选择不吃或只吃很小一口' },
      { value: 3, label: '纠结一下，可能吃一小块但会增加运动量来弥补' },
      { value: 2, label: '今天破例了，明天再严格执行吧' },
      { value: 1, label: '直接吃了，人生在世就该享受' },
    ]},
  { id: 'cat_str7b', text: '你计划早起学习/锻炼，闹钟响了但被窝太暖和：', type: 'sjt', dimension: 'strengths', subDimension: 'self_regulation', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '闹钟一响就起——承诺了自己的事没有商量余地' },
      { value: 3, label: '磨蹭几分钟但还是起来了' },
      { value: 2, label: '又按了贪睡键，可能起也可能不起' },
      { value: 1, label: '直接关掉闹钟继续睡' },
    ]},
  { id: 'cat_str7c', text: '你手头有一个重要的任务要做，但手机上弹出了一个很想看的视频推送：', type: 'sjt', dimension: 'strengths', subDimension: 'self_regulation', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '把手机翻过去或放远处——先完成任务再说' },
      { value: 3, label: '犹豫了一下，把推送划掉继续工作' },
      { value: 2, label: '先看一个吧……然后可能就刷了半小时' },
      { value: 1, label: '工作什么时候做不是做，先看视频' },
    ]},

  // ── hope (VIA) ── 3 SJT items
  { id: 'cat_str8', text: '你的一个重要计划遇到了很大的挫折，前途不明朗：', type: 'sjt', dimension: 'strengths', subDimension: 'hope', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '虽然困难但相信会好起来——同时积极寻找新的路径' },
      { value: 3, label: '有些低落但还是保持希望，慢慢调整方向' },
      { value: 2, label: '对未来很悲观，但还没有完全放弃' },
      { value: 1, label: '觉得一切都完了，不抱什么希望了' },
    ]},
  { id: 'cat_str8b', text: '你看到很多关于社会问题（环境/不公/贫困）的新闻：', type: 'sjt', dimension: 'strengths', subDimension: 'hope', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '虽然问题很多，但我相信每个人的小行动都能推动积极变化' },
      { value: 3, label: '有些忧虑，但对人类解决问题的能力还是有信心的' },
      { value: 2, label: '越看越觉得世界不会变好' },
      { value: 1, label: '都是注定的，改变不了什么' },
    ]},
  { id: 'cat_str8c', text: '展望未来五年，你的感觉是：', type: 'sjt', dimension: 'strengths', subDimension: 'hope', scaleRef: 'VIA', sourceType: 'adapted_open',
    options: [
      { value: 4, label: '充满期待！有具体的目标和实现路径，相信自己能达成' },
      { value: 3, label: '大致乐观，虽然不确定但相信会越来越好' },
      { value: 2, label: '不太敢想，感觉未来充满不确定性' },
      { value: 1, label: '没什么期待，走一步看一步吧' },
    ]},
]);

// ── Export all CAT modules ──
export const catModules: DimensionModule[] = [
  catCognitiveModule,
  catPersonalityModule,
  catEmotionModule,
  catMotivationModule,
  catSocialModule,
  catAestheticModule,
  catWorldviewModule,
  catStrengthsModule,
];
