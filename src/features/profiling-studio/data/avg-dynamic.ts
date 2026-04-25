/**
 * 动态 AVG 剧本生成器
 *
 * 根据前置问卷画像生成 8 个定制场景
 * 每个场景的叙事和选项都根据画像量身定制
 *
 * 核心设计原则:
 *   每个选项必须让用户想"这就是我会做的事"
 *   选项不是描述抽象倾向，而是描述"在那一刻你的身体反应和脑子里的话"
 *   选项之间的差异是动机层面的，不是行为表面的
 *
 * 5 轴 (每轴 4 种):
 *   energy:     social_hunger | selective_social | solo_recharge | guilt_comply
 *   conflict:   confront | strategic_retreat | internal_storm | dismiss
 *   unknown:    thrill | solve | freeze | ask
 *   depth:      existential | replay | plan | body
 *   compassion: honest | listen | pattern | boundary
 */

import type { AVGNode } from '../types';

export type ProfileAxis = Record<string, string>;

// Helper: is socially oriented
function isSocial(p: ProfileAxis): boolean {
  return p.energy === 'social_hunger' || p.energy === 'selective_social';
}
// Helper: is confrontational
function isConfronter(p: ProfileAxis): boolean {
  return p.conflict === 'confront' || p.conflict === 'strategic_retreat';
}
// Helper: embraces unknown
function isExplorer(p: ProfileAxis): boolean {
  return p.unknown === 'thrill' || p.unknown === 'ask';
}
// Helper: is reflective depth
function isDeep(p: ProfileAxis): boolean {
  return p.depth === 'existential' || p.depth === 'replay';
}

/**
 * 根据 profile 生成 8 个定制化 AVG 节点
 */
export function generateDynamicScript(profile: ProfileAxis): AVGNode[] {
  const social = isSocial(profile);
  const confronter = isConfronter(profile);
  const explorer = isExplorer(profile);
  const deep = isDeep(profile);

  return [
    // ═══════════════════════════════════════
    // Scene 1: 晨起 — 根据社交能量轴定制
    // ═══════════════════════════════════════
    {
      id: 'morning',
      title: social ? '热闹的邀约' : '安静的清晨',
      narrative: social
        ? '周六清晨，你睁开眼，群消息已经 99+。\n\n老朋友约露营车已经到了楼下。同时一个聊得来的同事发了一张限量艺术展的票给你，今天最后一天。\n\n两件事撞了。你的手停在屏幕上。'
        : '周六清晨。光线透过窗帘缝照在你脸上。\n\n你拿起手机：朋友群在约露营、一个不太熟的同事转了张艺术展门票。\n\n你其实有一个小想法：昨晚追到凌晨三点的小说还剩最后五十页。外面的阳光很好，但你更想……',
      backgroundGradient: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)',
      backgroundEmoji: '🌅',
      choices: social ? [
        { id: 'morning_a', text: '二话不说冲下楼。说好的露营就得去，人齐了在一起才叫周末。',
          dimensionMappings: [
            { dimension: 'personality', subDimension: 'extraversion', weight: 5 },
            { dimension: 'social', subDimension: 'social_connectedness', weight: 4 },
          ]},
        { id: 'morning_b', text: '你更想去展——不是不爱朋友，是这种独自浸泡在美里的机会太少了。',
          dimensionMappings: [
            { dimension: 'personality', subDimension: 'openness', weight: 5 },
            { dimension: 'aesthetic', subDimension: 'aesthetic_sensitivity', weight: 4 },
          ]},
        { id: 'morning_c', text: '你试图两个都去——先露营到中午，下午赶展。累点无所谓，怕的是错过。',
          dimensionMappings: [
            { dimension: 'personality', subDimension: 'extraversion', weight: 3 },
            { dimension: 'personality', subDimension: 'openness', weight: 3 },
            { dimension: 'motivation', subDimension: 'achievement', weight: 3 },
          ]},
      ] : [
        { id: 'morning_a', text: '把手机扣过去。钻回被子里继续看书。谁的消息都不回，这才是你的周末。',
          dimensionMappings: [
            { dimension: 'personality', subDimension: 'extraversion', weight: 1 },
            { dimension: 'motivation', subDimension: 'autonomy', weight: 5 },
          ]},
        { id: 'morning_b', text: '艺术展可以一个人安静待着，比一群人露营舒服多了。你回了同事一句"谢"。',
          dimensionMappings: [
            { dimension: 'aesthetic', subDimension: 'aesthetic_sensitivity', weight: 4 },
            { dimension: 'personality', subDimension: 'openness', weight: 4 },
          ]},
        { id: 'morning_c', text: '犹豫了很久，还是回了露营的群："来了。"你怕不去会被说不合群。',
          dimensionMappings: [
            { dimension: 'social', subDimension: 'attachment_anxiety', weight: 4 },
            { dimension: 'social', subDimension: 'social_connectedness', weight: 3 },
          ]},
      ],
    },

    // ═══════════════════════════════════════
    // Scene 2: 冲突 — 根据冲突应对轴定制
    // ═══════════════════════════════════════
    {
      id: 'conflict',
      title: confronter ? '被偷走的成果' : '突如其来的眼泪',
      narrative: confronter
        ? '你帮新同事额外做了两天的数据整理。周会上，TA 把你做的部分当作自己的成果汇报了。\n\n领导表扬了TA。TA 看了你一眼，没有说话。\n\n你的胃部收紧了。'
        : '午饭时间，一个不太熟的同事突然坐到你对面，开始讲自己被分手的事。\n\n越说越激动，声音发抖，眼眶红了。旁边走过的人看了你们一眼。\n\n你咽下嘴里的饭，不知道手该放哪。',
      backgroundGradient: 'linear-gradient(180deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
      backgroundEmoji: confronter ? '😤' : '😰',
      choices: confronter ? [
        { id: 'conf_a', text: '你直接找TA了。不是吵架，但你需要TA亲口承认这件事。公平是你的底线。',
          dimensionMappings: [
            { dimension: 'worldview', subDimension: 'moral_fairness', weight: 5 },
            { dimension: 'social', subDimension: 'interpersonal_dominance', weight: 5 },
          ]},
        { id: 'conf_b', text: '你没有当面说，但你把所有工作记录整理好，发了一封邮件抄送领导。让证据说话。',
          dimensionMappings: [
            { dimension: 'cognitive', subDimension: 'cognitive_reflection', weight: 5 },
            { dimension: 'worldview', subDimension: 'moral_fairness', weight: 4 },
          ]},
        { id: 'conf_c', text: '你记住了这个人，但没有做任何事。不值得。以后不帮就是了。',
          dimensionMappings: [
            { dimension: 'emotion', subDimension: 'emotion_regulation', weight: 4 },
            { dimension: 'personality', subDimension: 'conscientiousness', weight: 3 },
          ]},
      ] : [
        { id: 'conf_a', text: '你放下筷子，看着TA的眼睛，认真听。你不知道怎么安慰，但"有人在"这件事本身就够了。',
          dimensionMappings: [
            { dimension: 'emotion', subDimension: 'empathy', weight: 5 },
            { dimension: 'personality', subDimension: 'agreeableness', weight: 5 },
          ]},
        { id: 'conf_b', text: '"走，去外面说。这里不方便。"你站起来，拉着TA往外走。换个环境，但也隐含着一条界线。',
          dimensionMappings: [
            { dimension: 'social', subDimension: 'interpersonal_warmth', weight: 4 },
            { dimension: 'social', subDimension: 'interpersonal_dominance', weight: 3 },
          ]},
        { id: 'conf_c', text: '你在心里倒数十分钟。时间到了你会找一个合理的借口离开。你在意TA，但别人的情绪会入侵你。',
          dimensionMappings: [
            { dimension: 'social', subDimension: 'attachment_avoidance', weight: 4 },
            { dimension: 'emotion', subDimension: 'emotion_regulation', weight: 3 },
          ]},
      ],
    },

    // ═══════════════════════════════════════
    // Scene 3: 未知 — 根据未知耐受轴定制
    // ═══════════════════════════════════════
    {
      id: 'crossroad',
      title: explorer ? '意料之外' : '精算的抉择',
      narrative: explorer
        ? '你路过一家手工坊，门口写着"今日最后一节刺绣体验课，50 元"。\n\n你从没碰过针线。但你看了一眼成品——那个质感让你停下了脚步。\n\n老板已经在拉椅子了。'
        : '你收到两个面试通知。\n\n公司 A：大厂，薪资高 40%，加班严重，直属领导风格你不喜欢。\n公司 B：初创，薪资一般，团队氛围好，做的事你真心感兴趣。\n\n你打开了一个空白文档。',
      backgroundGradient: 'linear-gradient(180deg, #141E30 0%, #243B55 100%)',
      backgroundEmoji: explorer ? '🧵' : '⚖️',
      choices: explorer ? [
        { id: 'cross_a', text: '你已经坐下了。50 块算什么？这种"没试过"的事就是你最不想错过的。',
          dimensionMappings: [
            { dimension: 'personality', subDimension: 'openness', weight: 5 },
            { dimension: 'aesthetic', subDimension: 'creative_self', weight: 4 },
          ]},
        { id: 'cross_b', text: '你很想试，但你先问了要做多久、能不能带走、难度怎么样。了解清楚后才坐下。',
          dimensionMappings: [
            { dimension: 'cognitive', subDimension: 'metacognition', weight: 4 },
            { dimension: 'personality', subDimension: 'openness', weight: 3 },
          ]},
        { id: 'cross_c', text: '你犹豫了一下，走了。不是因为钱——是你今天没有"迎接新事物"的能量，你对自己很诚实。',
          dimensionMappings: [
            { dimension: 'emotion', subDimension: 'self_emotion', weight: 4 },
            { dimension: 'emotion', subDimension: 'meta_mood', weight: 3 },
          ]},
      ] : [
        { id: 'cross_a', text: '选 B。再高的薪水也买不回每天的八小时。做不喜欢的事会把一个人掏空的。',
          dimensionMappings: [
            { dimension: 'motivation', subDimension: 'autonomy', weight: 5 },
            { dimension: 'motivation', subDimension: 'self_direction', weight: 5 },
          ]},
        { id: 'cross_b', text: '选 A。先保障经济安全。你可以忍一个你不喜欢的领导，但你忍不了焦虑的银行卡余额。',
          dimensionMappings: [
            { dimension: 'motivation', subDimension: 'achievement', weight: 5 },
            { dimension: 'motivation', subDimension: 'competence', weight: 4 },
          ]},
        { id: 'cross_c', text: '两个都不选。你发现自己在用"选哪个"来逃避一个更大的问题：你到底想过什么样的生活？',
          dimensionMappings: [
            { dimension: 'worldview', subDimension: 'meaning_search', weight: 5 },
            { dimension: 'cognitive', subDimension: 'cognitive_reflection', weight: 4 },
          ]},
      ],
    },

    // ═══════════════════════════════════════
    // Scene 4: 共情考验
    // ═══════════════════════════════════════
    {
      id: 'encounter',
      title: '地铁上的陌生人',
      narrative: social
        ? '地铁上，你旁边站着一个小女孩，大概五岁。她一直在偷看你手机屏幕。\n\n你正在回一条重要的消息。她的妈妈在另一头车厢挤着，没注意到她。\n\n小女孩突然开口了："你在跟谁聊天呀？"'
        : '地铁上，坐你旁边的老人把头靠到了你的肩膀上——TA 睡着了。\n\n车厢很挤，没有办法换位置。你的肩膀开始酸了。TA 的呼吸很浅，脸上的皱纹里藏着疲惫。\n\n下一站就是你要下的站。',
      backgroundGradient: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      backgroundEmoji: '🚇',
      choices: social ? [
        { id: 'enc_a', text: '你把手机放低让她看得清楚一些，笑着说："在跟一个朋友聊天。你想看吗？"',
          dimensionMappings: [
            { dimension: 'social', subDimension: 'interpersonal_warmth', weight: 5 },
            { dimension: 'personality', subDimension: 'agreeableness', weight: 4 },
          ]},
        { id: 'enc_b', text: '你笑了一下但没回答，继续打字。你喜欢小孩，但你更需要先把消息回完。分寸。',
          dimensionMappings: [
            { dimension: 'personality', subDimension: 'conscientiousness', weight: 4 },
            { dimension: 'emotion', subDimension: 'emotion_regulation', weight: 3 },
          ]},
        { id: 'enc_c', text: '你把手机翻到一个有趣的表情包给她看，然后跟她聊了起来。消息等会儿再回。',
          dimensionMappings: [
            { dimension: 'social', subDimension: 'social_connectedness', weight: 5 },
            { dimension: 'personality', subDimension: 'extraversion', weight: 4 },
          ]},
      ] : [
        { id: 'enc_a', text: '你没有动。让TA多睡一会儿。你可以再坐一站走路回去。肩膀酸就酸吧。',
          dimensionMappings: [
            { dimension: 'emotion', subDimension: 'empathy', weight: 5 },
            { dimension: 'motivation', subDimension: 'benevolence', weight: 5 },
          ]},
        { id: 'enc_b', text: '你轻轻地碰了碰TA的手臂："大爷/大妈，我要下车了。"温和但不为难自己。',
          dimensionMappings: [
            { dimension: 'personality', subDimension: 'agreeableness', weight: 3 },
            { dimension: 'social', subDimension: 'interpersonal_warmth', weight: 3 },
          ]},
        { id: 'enc_c', text: '你已经在焦虑了。不是不善良，是你对被陌生人触碰这件事生理性地不舒服。你站了起来。',
          dimensionMappings: [
            { dimension: 'social', subDimension: 'attachment_avoidance', weight: 4 },
            { dimension: 'emotion', subDimension: 'self_emotion', weight: 3 },
          ]},
      ],
    },

    // ═══════════════════════════════════════
    // Scene 5: 知识边界
    // ═══════════════════════════════════════
    {
      id: 'lecture',
      title: explorer ? '听不懂的沙龙' : '200 页交接文档',
      narrative: explorer
        ? '你误打误撞走进了一个学术沙龙。讲的是量子计算，在场的人都在激烈讨论，你一个字也听不懂。\n\n但那种智力碰撞的氛围让你着迷。有人注意到你了——\n\n"你是做这个领域的吗？"'
        : '领导把你调到了一个完全陌生的项目。同事们深耕三年的领域，你连术语都不认识。\n\n交接文档 200 页，密密麻麻。你打开第一页，头三行就有五个你不懂的缩写。',
      backgroundGradient: 'linear-gradient(180deg, #0c0c1d 0%, #1a1a3e 50%, #2d2d5e 100%)',
      backgroundEmoji: explorer ? '🔬' : '📑',
      choices: explorer ? [
        { id: 'lec_a', text: '"不是，我完全是门外汉。但你们刚才说的那个东西太让我好奇了——能给我讲讲吗？"',
          dimensionMappings: [
            { dimension: 'personality', subDimension: 'openness', weight: 5 },
            { dimension: 'cognitive', subDimension: 'need_for_cognition', weight: 5 },
          ]},
        { id: 'lec_b', text: '你摇头微笑，安静地坐到角落里。虽然听不懂，但浸泡在一群认真的人中间感觉很好。',
          dimensionMappings: [
            { dimension: 'aesthetic', subDimension: 'aesthetic_sensitivity', weight: 4 },
            { dimension: 'personality', subDimension: 'openness', weight: 3 },
          ]},
        { id: 'lec_c', text: '你礼貌地走了。不是怯场——是你的好奇心有方向，这个方向不是你的。',
          dimensionMappings: [
            { dimension: 'motivation', subDimension: 'self_direction', weight: 4 },
            { dimension: 'cognitive', subDimension: 'metacognition', weight: 3 },
          ]},
      ] : [
        { id: 'lec_a', text: '你做了一个 30 天学习计划：先泛读标注，再拆分模块逐个攻克。一步步来，你最擅长这个。',
          dimensionMappings: [
            { dimension: 'personality', subDimension: 'conscientiousness', weight: 5 },
            { dimension: 'cognitive', subDimension: 'metacognition', weight: 5 },
          ]},
        { id: 'lec_b', text: '你先找了团队里最好说话的人："给我一小时，帮我画一张全景图？"你知道好的问题比苦学有效。',
          dimensionMappings: [
            { dimension: 'social', subDimension: 'interpersonal_warmth', weight: 4 },
            { dimension: 'motivation', subDimension: 'relatedness', weight: 4 },
          ]},
        { id: 'lec_c', text: '你焦虑到失眠了。你受不了"什么都不会"的感觉。你开始怀疑自己是不是选错了行。',
          dimensionMappings: [
            { dimension: 'personality', subDimension: 'neuroticism', weight: 4 },
            { dimension: 'motivation', subDimension: 'competence', weight: 2 },
          ]},
      ],
    },

    // ═══════════════════════════════════════
    // Scene 6: 审美碰撞
    // ═══════════════════════════════════════
    {
      id: 'graffiti',
      title: deep ? '那幅画叫《等》' : '墙上的涂鸦',
      narrative: deep
        ? '博物馆里，你在一幅画前停了很久。\n\n画面很简单：一个空房间，一把椅子，一扇半开的门。光线从门缝里漏进来。\n\n你说不上为什么，但你的眼眶开始发热了。\n\n导览牌上写着画名：《等》。'
        : '傍晚路过一个公园，一群年轻人在一面白墙上涂鸦。色彩浓烈，笔触疯狂。\n\n一个路人停下来大声说："这就是乱画，有什么美的。"\n\n涂鸦的人回头笑了笑，继续画。你也停下了脚步。',
      backgroundGradient: 'linear-gradient(180deg, #1a0a2e 0%, #3d1a5c 40%, #e040fb20 100%)',
      backgroundEmoji: deep ? '🖼️' : '🎨',
      choices: deep ? [
        { id: 'graf_a', text: '你站了十分钟。你在那把椅子和那道光之间看到了一种你非常熟悉但说不出口的孤独。',
          dimensionMappings: [
            { dimension: 'aesthetic', subDimension: 'aesthetic_sensitivity', weight: 5 },
            { dimension: 'emotion', subDimension: 'meta_mood', weight: 5 },
          ]},
        { id: 'graf_b', text: '你开始想：画家为什么画这个？那个人在等谁？门开了以后会发生什么？你需要知道创作背景。',
          dimensionMappings: [
            { dimension: 'cognitive', subDimension: 'need_for_cognition', weight: 5 },
            { dimension: 'aesthetic', subDimension: 'aesthetic_sensitivity', weight: 4 },
          ]},
        { id: 'graf_c', text: '你拍了张照片。"真好看"，然后走了。你感受到了些什么，但没有想深入追究。',
          dimensionMappings: [
            { dimension: 'aesthetic', subDimension: 'aesthetic_sensitivity', weight: 2 },
            { dimension: 'personality', subDimension: 'openness', weight: 2 },
          ]},
      ] : [
        { id: 'graf_a', text: '那个路人说的不对。这种不管不顾的喷发力本身就是美。你站在那儿被某种能量击中了。',
          dimensionMappings: [
            { dimension: 'personality', subDimension: 'openness', weight: 5 },
            { dimension: 'aesthetic', subDimension: 'aesthetic_sensitivity', weight: 5 },
          ]},
        { id: 'graf_b', text: '你走过去问他们在画什么。不是为了评价——你就是想知道这种冲动从哪来的。',
          dimensionMappings: [
            { dimension: 'cognitive', subDimension: 'need_for_cognition', weight: 4 },
            { dimension: 'social', subDimension: 'interpersonal_warmth', weight: 3 },
          ]},
        { id: 'graf_c', text: '你看了几秒就走了。不丑，但也没打动你。你对美有自己的标准。',
          dimensionMappings: [
            { dimension: 'aesthetic', subDimension: 'aesthetic_sensitivity', weight: 1 },
            { dimension: 'motivation', subDimension: 'self_direction', weight: 3 },
          ]},
      ],
    },

    // ═══════════════════════════════════════
    // Scene 7: 权力与公平
    // ═══════════════════════════════════════
    {
      id: 'overtime',
      title: confronter ? '替罪羊' : '晚上九点的消息',
      narrative: confronter
        ? '项目出了线上事故。不是你负责的模块，但你参与了review。\n\n复盘会上，领导看了你一眼："这块你也过了眼，你来说说怎么回事。"\n\n你能感觉到，TA在找一个人来扛这件事。而那个人好像就是你。'
        : '晚上九点，你刚洗完澡准备睡觉。领导发来消息：\n\n"明早八点要用一份数据，今晚能搞完吗？"\n\n你心里清楚——这是TA白天忘了安排的事。也不在你的职责范围内。',
      backgroundGradient: 'linear-gradient(180deg, #0d0d1a 0%, #1a1a2e 50%, #2d1b4e 100%)',
      backgroundEmoji: confronter ? '⚡' : '📱',
      choices: confronter ? [
        { id: 'ot_a', text: '你打断了领导："这不是我负责的模块。我review的范围和意见在文档里都有记录。"你不允许模糊边界。',
          dimensionMappings: [
            { dimension: 'social', subDimension: 'interpersonal_dominance', weight: 5 },
            { dimension: 'worldview', subDimension: 'moral_fairness', weight: 5 },
          ]},
        { id: 'ot_b', text: '你没有当场反驳，但会后你整理了一份事故时间线和责任归属图发给了所有人。让事实自己说话。',
          dimensionMappings: [
            { dimension: 'cognitive', subDimension: 'cognitive_reflection', weight: 5 },
            { dimension: 'worldview', subDimension: 'moral_fairness', weight: 4 },
          ]},
        { id: 'ot_c', text: '你配合完成了复盘，但心里记下了这一笔。你不吵架——但你开始考虑这个团队值不值得继续待。',
          dimensionMappings: [
            { dimension: 'emotion', subDimension: 'emotion_regulation', weight: 4 },
            { dimension: 'motivation', subDimension: 'self_direction', weight: 3 },
          ]},
      ] : [
        { id: 'ot_a', text: '"好的我看看。"挂了电话你骂了自己一句——但你已经在打开电脑了。你做不到拒绝权威。',
          dimensionMappings: [
            { dimension: 'personality', subDimension: 'conscientiousness', weight: 4 },
            { dimension: 'social', subDimension: 'attachment_anxiety', weight: 4 },
          ]},
        { id: 'ot_b', text: '"领导，这块不在我负责范围。我明早提前来处理可以吗？"你的声音礼貌但坚定。你在画线。',
          dimensionMappings: [
            { dimension: 'social', subDimension: 'interpersonal_dominance', weight: 4 },
            { dimension: 'worldview', subDimension: 'moral_fairness', weight: 4 },
          ]},
        { id: 'ot_c', text: '你看着消息想了很久。最后回了一句"今晚不太方便"然后锁屏了。你心跳很快，但你没有解释原因。',
          dimensionMappings: [
            { dimension: 'emotion', subDimension: 'emotion_regulation', weight: 3 },
            { dimension: 'motivation', subDimension: 'autonomy', weight: 4 },
          ]},
      ],
    },

    // ═══════════════════════════════════════
    // Scene 8: 深夜 — 根据内在深度轴定制
    // ═══════════════════════════════════════
    {
      id: 'midnight',
      title: deep ? '深夜的提问' : '凌晨的拖延',
      narrative: deep
        ? '凌晨一点。你的身体很累，但你的意识异常清澈。\n\n你不是在想明天的事——你在想更远的事。\n\n一个你一直逃避的问题突然变得非常清晰：你现在过的这个人生，和你心里真正想活成的样子，差了多远？'
        : '凌晨一点，你还醒着。\n\n明天有一件你一直拖延的事。不难，但你就是不想做。你知道自己在逃避。\n\n你又打开了短视频。刷了两分钟就关了。又打开了。又关了。',
      backgroundGradient: 'linear-gradient(180deg, #000 0%, #0a0a1a 30%, #0f0c29 60%, #302b6320 100%)',
      backgroundEmoji: '🌌',
      choices: deep ? [
        { id: 'mid_a', text: '你打开备忘录试着写下来。你知道这种清澈稍纵即逝。写不出完整的答案没关系，写的过程本身就是答案的一部分。',
          dimensionMappings: [
            { dimension: 'emotion', subDimension: 'meta_mood', weight: 5 },
            { dimension: 'worldview', subDimension: 'meaning_search', weight: 5 },
          ]},
        { id: 'mid_b', text: '你在想：也许重要的不是"答案是什么"，而是"我愿不愿意一直带着这个问题活"。你接受了这个没有终点的旅程。',
          dimensionMappings: [
            { dimension: 'worldview', subDimension: 'meaning_presence', weight: 5 },
            { dimension: 'worldview', subDimension: 'open_minded_thinking', weight: 4 },
          ]},
        { id: 'mid_c', text: '你深呼吸，关了灯。今晚不适合想这些。你不是在逃避——是你知道自己此刻没有能量承接这个问题。',
          dimensionMappings: [
            { dimension: 'emotion', subDimension: 'emotion_regulation', weight: 5 },
            { dimension: 'emotion', subDimension: 'self_emotion', weight: 4 },
          ]},
      ] : [
        { id: 'mid_a', text: '你设了三个闹钟，把明天要做的事写成了一条条清单贴在床头。你用"系统"来对抗"懒"。',
          dimensionMappings: [
            { dimension: 'personality', subDimension: 'conscientiousness', weight: 5 },
            { dimension: 'motivation', subDimension: 'competence', weight: 4 },
          ]},
        { id: 'mid_b', text: '你干脆现在就打开电脑做完了它。两点半做完躺下的那一刻松了口气——你需要"做完"才能睡着。',
          dimensionMappings: [
            { dimension: 'personality', subDimension: 'conscientiousness', weight: 4 },
            { dimension: 'motivation', subDimension: 'achievement', weight: 4 },
          ]},
        { id: 'mid_c', text: '你允许自己今晚就这样了。不批判自己。拖延就拖延了。你翻了个身，几分钟后竟然睡着了。',
          dimensionMappings: [
            { dimension: 'emotion', subDimension: 'self_emotion', weight: 3 },
            { dimension: 'emotion', subDimension: 'emotion_regulation', weight: 2 },
          ]},
      ],
    },
  ];
}
