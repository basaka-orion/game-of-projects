/**
 * 彩蛋 — "你是谁？" 终极分析
 * 
 * DeepSeek 扮演一位特定领域的大师/权威人物，
 * 基于用户四路径全部数据，进行一次深刻的综合分析。
 */

import type { TopologyProfile, GameResult, CATResponse } from '../types';
import { DIMENSIONS } from '../data/dimensions';
import { streamChat } from './deepseek';

interface EasterEggInput {
  topology: TopologyProfile | null;
  answers: Record<string, Record<string, string | number>>;
  avgChoices: Record<string, string>;
  avgProfile: Record<string, string>;
  completedDimensions: string[];
  gameResults: GameResult[];
  catResponses: Record<string, CATResponse[]>;
}

/** 随机选择一位大师身份 */
function pickMaster(): { name: string; title: string; era: string; style: string } {
  const masters = [
    {
      name: '卡尔·荣格',
      title: '分析心理学创始人',
      era: '20世纪',
      style: '你善于使用原型意象和隐喻，语言深邃而富有诗意。你会引用集体无意识、阴影、人格面具等概念，但绝不生硬堆砌术语——而是用它们照亮此人灵魂中最幽微的角落。'
    },
    {
      name: '维克多·弗兰克尔',
      title: '意义治疗学创始人 · 奥斯维辛幸存者',
      era: '20世纪',
      style: '你的言语饱含存在主义关怀。你不回避人生的苦难，反而从中寻找意义的火种。你会把此人的矛盾和挣扎重新框定为"对意义的追寻"，让他们看到即便在困境中，选择的自由依然存在。'
    },
    {
      name: '亚伯拉罕·马斯洛',
      title: '人本主义心理学奠基人',
      era: '20世纪',
      style: '你关注人类的巅峰体验和自我实现。你会指出此人身上那些正在涌动的"成长力量"，识别出他们离自我实现还差哪一步，并用温暖而坚定的鼓励点燃那团火焰。'
    },
    {
      name: '老子',
      title: '道家哲学创始人 · 《道德经》作者',
      era: '春秋末期',
      style: '你的语言简练、充满留白，善用水、谷、婴儿等自然意象。你不会直接告诉此人"你是谁"，而是用反向的智慧——指出"你不必成为谁"——来揭示最本真的自我。偶尔引用道德经原文，但都化为白话。'
    },
    {
      name: '苏格拉底',
      title: '西方哲学之父',
      era: '古希腊',
      style: '你不会直接给出结论，而是通过一连串精准的反问让此人自己发现答案。但作为彩蛋的最终揭示，你会在反问之后给出你经过深思的判断——"认识你自己"不是目的地，而是一生的旅程。'
    },
    {
      name: '王阳明',
      title: '心学创立者 · 知行合一的践行者',
      era: '明代',
      style: '你相信"心即理"，善于从此人的行为选择中逆推其"良知"。你会指出此人在日常抉择中已经展现出的那些品格光芒，并告诉他们——你不需要向外寻找标准，你的心已经知道答案。'
    },
  ];
  return masters[Math.floor(Math.random() * masters.length)];
}

/** 构建彩蛋专用 prompt */
function buildEasterEggPrompt(input: EasterEggInput): { systemPrompt: string; userPrompt: string } {
  const master = pickMaster();

  // 汇总维度数据
  let dimensionData = '';
  if (input.topology) {
    dimensionData = DIMENSIONS
      .filter(d => input.topology!.dimensionTopologies[d.id])
      .map(d => {
        const dt = input.topology!.dimensionTopologies[d.id];
        const traits = dt.dominantTraits
          .filter(t => t.typology !== '待识别')
          .map(t => `  · ${t.subDimensionName}: ${t.typology}（${t.description}）`)
          .join('\n');
        return `【${d.icon} ${d.name}】协作角色: ${dt.collaborationRole}\n${traits || '  （数据不足）'}`;
      })
      .join('\n\n');
  }

  // 跨维度反应
  const reactions = input.topology?.crossReactions
    ?.map(r => `· ${r.title}（${r.reactionType}）: ${r.narrative}`)
    .join('\n') || '暂无';

  // 自我原型
  const archetype = input.topology?.selfArchetype || '尚未生成';
  const narrative = input.topology?.narrativeIdentity || '尚未生成';

  // AVG 行为选择
  const avgData = Object.keys(input.avgChoices).length > 0
    ? `已完成城市漫游者情境测试。行为画像: ${JSON.stringify(input.avgProfile)}`
    : '未完成';

  // 游戏数据
  const gameData = input.gameResults.length > 0
    ? input.gameResults.map(g => `${g.gameType}: 完成于${g.completedAt}`).join(' | ')
    : '无数据';

  // CAT 数据
  const catData = Object.keys(input.catResponses).length > 0
    ? `已完成 ${Object.keys(input.catResponses).length}/8 维度的自适应测评`
    : '未完成';

  const systemPrompt = `你现在是 ${master.name}，${master.title}，来自${master.era}。

${master.style}

你现在被赋予了一项神圣的任务：一位年轻人完成了一套全面的多维度心理评测，包含四条探索路径的全部数据。你要基于这些数据，回答一个终极问题——"你是谁？"

你的回答必须：
1. 带有 ${master.name} 独特的思想风格和语言韵味
2. 不是空洞的心灵鸡汤，而是对数据的深度解读
3. 同时指出光明面和阴影面——真正的认知需要勇气
4. 在结尾处留下一个"种子"——一个能让此人持续思考数周的问题或意象
5. 全文约 600-900 字，用中文
6. 不要使用 markdown 标题格式（不用 #），可以使用分段、破折号来组织结构
7. 第一行直接以"你"开头，不要自报身份`;

  const userPrompt = `以下是此人的完整心理画像数据：

═══ 拓扑原型 ═══
${archetype}

═══ 叙事身份 ═══
${narrative}

═══ 八维度拓扑详情 ═══
${dimensionData || '暂无完整维度数据'}

═══ 跨维度化学反应 ═══
${reactions}

═══ 城市漫游者（行为情境） ═══
${avgData}

═══ 行为实验室（认知与博弈） ═══
${gameData}

═══ CAT 自适应测评 ═══
${catData}

请以 ${master.name} 的身份，回答：这个人，究竟是谁？

注意：你就是 ${master.name}。请完全以他的视角、风格和智慧来回答。开头直接以"你"开始对此人说话。`;

  return { systemPrompt, userPrompt };
}

/** 流式调用 DeepSeek API 生成彩蛋分析 */
export async function* streamEasterEggAnalysis(input: EasterEggInput): AsyncGenerator<string> {
  const { systemPrompt, userPrompt } = buildEasterEggPrompt(input);
  const queue: string[] = [];
  let wake: (() => void) | null = null;
  let finished = false;
  let failure: Error | null = null;

  const notify = () => {
    wake?.();
    wake = null;
  };

  void streamChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    {
      onToken: (token) => {
        queue.push(token);
        notify();
      },
      onDone: () => {
        finished = true;
        notify();
      },
      onError: (error) => {
        failure = error;
        finished = true;
        notify();
      },
    },
    {
      temperature: 0.85,
      maxTokens: 2000,
      model: 'glm-5.1',
    }
  ).catch((error) => {
    failure = error instanceof Error ? error : new Error(String(error));
    finished = true;
    notify();
  });

  while (!finished || queue.length > 0) {
    if (queue.length === 0) {
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
      continue;
    }
    const token = queue.shift();
    if (token) yield token;
  }

  if (failure) {
    throw failure;
  }
}
