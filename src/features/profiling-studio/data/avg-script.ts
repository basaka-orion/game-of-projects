import type { AVGNode } from '../types';

// ════════════════════════════════════════════════════════════
// 「城市漫游者」AVG 互动心理测评剧本
// 8 nodes × 3-4 choices each
// Silently measures: Big Five, ERQ, PVQ-RR, ECR-R/ROCI-II, NFC, AESTHEMOS, MLQ
// ════════════════════════════════════════════════════════════

export const avgScript: AVGNode[] = [
  {
    id: 'morning',
    title: '晨间邀约',
    narrative: '清晨，阳光穿透窗帘。今天是难得的、完全没有安排的周六。\n\n忽然手机震动，是大学时最活跃的好友发来的消息：\n\n"临时组了个去郊外露营的局，今天下午就走！来不来？有几个你不认识的朋友，刚好扩列！"',
    backgroundGradient: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)',
    backgroundEmoji: '🌅',
    choices: [
      { id: 'morning_a', text: '太棒了！虽然有不认识的人，但去了就认识了嘛，马上收拾东西。',
        dimensionMappings: [
          { dimension: 'personality', subDimension: 'extraversion', weight: 5 },
          { dimension: 'personality', subDimension: 'openness', weight: 4 },
        ]},
      { id: 'morning_b', text: '挺想去的……另外几个人是谁啊？有大致的行程安排吗？',
        dimensionMappings: [
          { dimension: 'personality', subDimension: 'extraversion', weight: 3 },
          { dimension: 'personality', subDimension: 'conscientiousness', weight: 5 },
        ]},
      { id: 'morning_c', text: '祝你们玩得开心！我这周有点累，更想一个人在家享受独处时光。',
        dimensionMappings: [
          { dimension: 'personality', subDimension: 'extraversion', weight: 1 },
          { dimension: 'motivation', subDimension: 'self_direction', weight: 4 },
        ]},
    ],
  },
  {
    id: 'cafe',
    title: '咖啡馆的领地侵犯',
    narrative: '你决定去街角最喜欢的咖啡馆看书。推门进去，发现你平时最爱坐的角落位置，被一个正大声打电话的陌生人占了。\n\n他的声音极其刺耳，周围人都微微皱眉。你感到一阵烦躁。',
    backgroundGradient: 'linear-gradient(180deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
    backgroundEmoji: '☕',
    choices: [
      { id: 'cafe_a', text: '深呼吸。也许他真的遇到了紧急的事，算了吧。平静地找了另一个位置坐下。',
        dimensionMappings: [
          { dimension: 'emotion', subDimension: 'emotion_regulation', weight: 5 },
          { dimension: 'personality', subDimension: 'agreeableness', weight: 4 },
        ]},
      { id: 'cafe_b', text: '面无表情地戴上降噪耳机，强行屏蔽他。但内心其实还在生闷气。',
        dimensionMappings: [
          { dimension: 'emotion', subDimension: 'emotion_regulation', weight: 2 },
          { dimension: 'social', subDimension: 'conflict_style', weight: 2 },
        ]},
      { id: 'cafe_c', text: '走过去，礼貌但坚决地说："不好意思，你的声音影响到其他人了，能小声一点吗？"',
        dimensionMappings: [
          { dimension: 'personality', subDimension: 'extraversion', weight: 4 },
          { dimension: 'social', subDimension: 'interpersonal_dominance', weight: 5 },
        ]},
      { id: 'cafe_d', text: '这种氛围太难受了，果断转身离开，换个地方。',
        dimensionMappings: [
          { dimension: 'social', subDimension: 'conflict_style', weight: 1 },
        ]},
    ],
  },
  {
    id: 'crossroad',
    title: '时间的岔路口',
    narrative: '坐定后翻看手机，发现今天下午有三件事可以做：\n\n一个是关注很久的自闭症儿童陪伴公益项目正缺志愿者；\n另一个是某摄影大师的线下工作坊刚好有退票名额（需自费）；\n第三个是你包里那本读了一半、一直没空看完的小说。',
    backgroundGradient: 'linear-gradient(180deg, #141E30 0%, #243B55 100%)',
    backgroundEmoji: '⏱️',
    choices: [
      { id: 'cross_a', text: '立刻报名公益志愿者。能帮到别人会让你觉得这一天没白过。',
        dimensionMappings: [
          { dimension: 'motivation', subDimension: 'benevolence', weight: 5 },
          { dimension: 'personality', subDimension: 'agreeableness', weight: 4 },
        ]},
      { id: 'cross_b', text: '毫不犹豫抢下摄影工作坊的名额。提升自我的机会不容错过。',
        dimensionMappings: [
          { dimension: 'motivation', subDimension: 'achievement', weight: 5 },
          { dimension: 'cognitive', subDimension: 'need_for_cognition', weight: 3 },
        ]},
      { id: 'cross_c', text: '哪里也不去，就坐在这里把小说看完。按自己的节奏做无用的事，才是自由。',
        dimensionMappings: [
          { dimension: 'motivation', subDimension: 'self_direction', weight: 5 },
          { dimension: 'personality', subDimension: 'openness', weight: 3 },
        ]},
    ],
  },
  {
    id: 'encounter',
    title: '街角的不期而遇',
    narrative: '下午走在街上，偶然碰到一个很久没见的大学同学。\n\nTA 显得非常激动，拉着你开始滔滔不绝地倒苦水，抱怨最近的生活和工作。\n\n你其实已经有点累了，而且待会儿还有自己的安排。',
    backgroundGradient: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    backgroundEmoji: '🤝',
    choices: [
      { id: 'enc_a', text: '把自己的安排往后推，耐心倾听并给予安慰。朋友需要支持的时候，你不忍心打断。',
        dimensionMappings: [
          { dimension: 'personality', subDimension: 'agreeableness', weight: 5 },
          { dimension: 'emotion', subDimension: 'empathy', weight: 5 },
        ]},
      { id: 'enc_b', text: '倾听十分钟后温和打断："我待会儿要去办事，要不我们改天约个饭好好聊？"',
        dimensionMappings: [
          { dimension: 'personality', subDimension: 'agreeableness', weight: 3 },
          { dimension: 'social', subDimension: 'interpersonal_dominance', weight: 4 },
        ]},
      { id: 'enc_c', text: '内心很烦躁，表面敷衍点头，几分钟后借口"突然有个急电"迅速逃离。',
        dimensionMappings: [
          { dimension: 'social', subDimension: 'attachment_avoidance', weight: 4 },
          { dimension: 'social', subDimension: 'conflict_style', weight: 1 },
        ]},
    ],
  },
  {
    id: 'lecture',
    title: '盲盒讲座',
    narrative: '路过一家装潢奇特的独立书店，门口海报写着正在举办一场讲座：\n\n《17世纪拜占庭星盘制造与宇宙观》\n\n这个领域你一无所知。但讲座是免费的，随时可以进去。',
    backgroundGradient: 'linear-gradient(180deg, #0c0c1d 0%, #1a1a3e 50%, #2d2d5e 100%)',
    backgroundEmoji: '📚',
    choices: [
      { id: 'lec_a', text: '标题就很迷人，充满好奇地推门进去听。',
        dimensionMappings: [
          { dimension: 'personality', subDimension: 'openness', weight: 5 },
          { dimension: 'cognitive', subDimension: 'need_for_cognition', weight: 5 },
        ]},
      { id: 'lec_b', text: '站在门口先查了一下什么是"拜占庭星盘"，觉得对自己没什么用，决定离开。',
        dimensionMappings: [
          { dimension: 'cognitive', subDimension: 'cognitive_reflection', weight: 3 },
          { dimension: 'personality', subDimension: 'openness', weight: 2 },
        ]},
      { id: 'lec_c', text: '完全不感兴趣，研究这种冷门东西有什么意义？直接走开。',
        dimensionMappings: [
          { dimension: 'cognitive', subDimension: 'need_for_cognition', weight: 1 },
          { dimension: 'personality', subDimension: 'openness', weight: 1 },
        ]},
    ],
  },
  {
    id: 'graffiti',
    title: '黄昏的街头涂鸦',
    narrative: '傍晚漫步到公园，你看到几个年轻人正在一面废弃的墙上进行街头涂鸦。\n\n色彩极其浓烈、笔触狂野，画面透出一种令人不安的混沌感。',
    backgroundGradient: 'linear-gradient(180deg, #1a0a2e 0%, #3d1a5c 40%, #e040fb20 100%)',
    backgroundEmoji: '🎨',
    choices: [
      { id: 'graf_a', text: '停下来看了很久。虽然有些混乱，但你感到一种强烈的情感冲击，甚至有点被震撼。',
        dimensionMappings: [
          { dimension: 'aesthetic', subDimension: 'aesthetic_sensitivity', weight: 5 },
          { dimension: 'personality', subDimension: 'openness', weight: 5 },
        ]},
      { id: 'graf_b', text: '仔细观察他们的色彩搭配和技巧，思考这种亚文化背后的社会表达。',
        dimensionMappings: [
          { dimension: 'aesthetic', subDimension: 'aesthetic_sensitivity', weight: 4 },
          { dimension: 'cognitive', subDimension: 'need_for_cognition', weight: 4 },
        ]},
      { id: 'graf_c', text: '太凌乱刺眼了，纯粹是噪音和视觉污染，看了一眼就走开。',
        dimensionMappings: [
          { dimension: 'aesthetic', subDimension: 'aesthetic_sensitivity', weight: 1 },
          { dimension: 'personality', subDimension: 'openness', weight: 1 },
        ]},
    ],
  },
  {
    id: 'overtime',
    title: '突如其来的职场侵入',
    narrative: '晚上 8 点，你正在享受一天中最放松的时刻。\n\n突然接到直属领导的电话，要求你今晚临时加班整理一份数据报告，明早开会要用。\n\n但你心里清楚，这其实并不属于你的紧急职责，是领导白天忘记了。',
    backgroundGradient: 'linear-gradient(180deg, #0d0d1a 0%, #1a1a2e 50%, #2d1b4e 100%)',
    backgroundEmoji: '📱',
    choices: [
      { id: 'ot_a', text: '"好的没问题，我马上处理。" 挂了电话虽然郁闷，但立刻开始工作。',
        dimensionMappings: [
          { dimension: 'personality', subDimension: 'conscientiousness', weight: 5 },
          { dimension: 'social', subDimension: 'conflict_style', weight: 2 },
        ]},
      { id: 'ot_b', text: '"领导，我今晚没电脑。我明早提前一小时去处理，绝不耽误开会。"',
        dimensionMappings: [
          { dimension: 'social', subDimension: 'interpersonal_dominance', weight: 4 },
          { dimension: 'social', subDimension: 'conflict_style', weight: 4 },
        ]},
      { id: 'ot_c', text: '看着来电显示，假装没听见手机响，打算明天再找借口应付。',
        dimensionMappings: [
          { dimension: 'social', subDimension: 'conflict_style', weight: 1 },
          { dimension: 'personality', subDimension: 'conscientiousness', weight: 1 },
        ]},
    ],
  },
  {
    id: 'midnight',
    title: '深夜的自我质询',
    narrative: '深夜 11 点，你站在窗前看着这座城市的灯火。\n\n回想这一天的人际碰撞、情绪起伏，一种说不清道不明的复杂感受涌上心头。',
    backgroundGradient: 'linear-gradient(180deg, #000000 0%, #0a0a1a 30%, #0f0c29 60%, #302b6320 100%)',
    backgroundEmoji: '🌌',
    choices: [
      { id: 'mid_a', text: '试图精准分辨这种感受里有多少是满足、多少是孤独，并探究它从何而来。',
        dimensionMappings: [
          { dimension: 'emotion', subDimension: 'meta_mood', weight: 5 },
          { dimension: 'emotion', subDimension: 'self_emotion', weight: 5 },
        ]},
      { id: 'mid_b', text: '你感到自己正在触碰一个终极问题：我现在这种生活，真的是我想要的吗？',
        dimensionMappings: [
          { dimension: 'worldview', subDimension: 'meaning_search', weight: 5 },
          { dimension: 'worldview', subDimension: 'meaning_presence', weight: 2 },
        ]},
      { id: 'mid_c', text: '想这些太累了。拿起手机打开短视频，把注意力转移掉，直到困意袭来。',
        dimensionMappings: [
          { dimension: 'emotion', subDimension: 'meta_mood', weight: 1 },
          { dimension: 'worldview', subDimension: 'meaning_search', weight: 1 },
        ]},
    ],
  },
];
