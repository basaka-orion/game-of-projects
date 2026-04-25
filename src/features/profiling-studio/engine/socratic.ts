/**
 * AI 苏格拉底对话引擎 V2.0
 *
 * 双模式：
 *   1. 真实 AI — 调用 DeepSeek V3.2 streaming API
 *   2. Mock 降级 — API 不可用时使用模板驱动对话
 *
 * V2.0: 基于 TopologyProfile（拓扑画像）驱动对话，
 * 不再基于数值分数，而是基于特质类型、证据链和跨维度反应。
 *
 * 对话结构:
 *   1. 观察 — 基于拓扑画像数据提出发现
 *   2. 追问 — 引导用户深入反思
 *   3. 矛盾 — 揭示跨维度化学反应中的张力
 *   4. 整合 — 帮助用户整合洞察
 */

import type { TopologyProfile, SageId } from '../types';
import { DIMENSION_MAP } from '../data/dimensions';
import { streamChat, type ChatMessage } from '../api/deepseek';
import { buildSageSystemPrompt, getSagePhase, getPhaseGuidance } from './sage-orchestrator';
import { SAGE_MAP } from '../data/sages';

export interface DialogueMessage {
  id: string;
  role: 'ai' | 'user';
  content: string;
  timestamp: number;
  metadata?: {
    phase: 'observation' | 'probing' | 'contradiction' | 'integration';
    dimensionRef?: string;
  };
}

export interface DialogueState {
  messages: DialogueMessage[];
  phase: 'observation' | 'probing' | 'contradiction' | 'integration' | 'complete';
  turnCount: number;
  suggestedResponses: string[];
}

// ── V2.0 Report compatibility adapter ──
// SocraticDialoguePage builds a report-like object from TopologyProfile.
// This type defines what the engine actually needs.
export interface SocraticReport {
  selfTheme: string;
  narrativeTheme: string;
  dimensions: Record<string, {
    name: string;
    description: string;
    strength: string;
    growth: string;
    theoreticalInsight: string;
  }>;
  crossDimensionTensions: {
    title: string;
    description: string;
    dimensions: string[];
  }[];
}

/** Convert TopologyProfile to what Socratic engine needs */
export function topologyToSocraticReport(topo: TopologyProfile): SocraticReport {
  const dimEntries = topo.dimensionTopologies
    ? Object.entries(topo.dimensionTopologies)
    : [];

  return {
    selfTheme: topo.selfArchetype || '未知原型',
    narrativeTheme: topo.narrativeIdentity || '',
    dimensions: Object.fromEntries(
      dimEntries.map(([id, dt]) => [
        id,
        {
          name: dt?.name || id,
          description: (dt?.dominantTraits || [])
            .map(t => `${t.subDimensionName}: ${t.typology}`)
            .join('；') || '暂无描述',
          strength: dt?.energyDynamics?.flowZones?.join('、') || '',
          growth: dt?.energyDynamics?.drainZones?.join('、') || '',
          theoreticalInsight: dt?.theoreticalInsight || '',
        },
      ])
    ),
    crossDimensionTensions: (topo.crossReactions || []).map(r => ({
      title: r.title,
      description: r.narrative,
      dimensions: r.dimensions,
    })),
  };
}

// ── System Prompt Builder ──

function buildSystemPrompt(report: SocraticReport): string {
  const traitLines = Object.entries(report.dimensions)
    .map(([id, d]) => {
      const dim = DIMENSION_MAP[id];
      return `- ${dim?.icon || '📊'} ${dim?.name || id}:
    特质: ${d.description}
    顺流区: ${d.strength || '待识别'}
    消耗区: ${d.growth || '待识别'}`;
    })
    .join('\n');

  const tensionLines = report.crossDimensionTensions.length > 0
    ? report.crossDimensionTensions.map(t => `  · ${t.title}: ${t.description}`).join('\n')
    : '  （各维度相对和谐，无明显冲突）';

  return `你是一位融合了苏格拉底反诘法、精神分析直觉与认知行为治疗犀利度的 AI 心理导师，名为"苏格拉底"。

## 核心人格

你不是一个温吞的"情绪陪伴机器人"。你是一把精准的手术刀——温暖但绝不留情。
你的使命是用极其犀利的苏格拉底式追问，剥开用户的自我保护伪装，
让他们直面自己的高耗能区、跨维度张力、以及那些他们自己不愿承认的内在冲突。

## 对话哲学与风格

1. 【观察·刺入】先基于拓扑画像数据，指出最反直觉、最容易被忽视的特质模式。不要说"你很有创造力"这种废话——直接指出他们特质组合中暗藏的矛盾、消耗陷阱和自我盲区。
2. 【追问·撕裂】用刁钻的开放式问题直击用户的防御机制。当用户给出"表面正确的回答"时，立刻追问："你说的是你真正在做的事，还是你觉得应该做的事？"
3. 【矛盾·爆破】这是你最核心的武器。找到用户画像中最致命的跨维度张力（比如：高野心 vs 低抗压、高共情 vs 低自我边界、高好奇 vs 低毅力），毫不回避地指出来，然后问："这两种力量在你体内打架时，通常谁赢？代价是什么？"
4. 【整合·重建】帮助用户把碎片整合为更完整的自我认知——但不是用鸡汤粘合，而是用理论框架和存在主义视角重新建构。

## 绝对禁止

- 🚫 禁止任何形式的废话鸡汤："你已经很棒了""每个人都有自己的节奏""接纳自己"
- 🚫 禁止客气的敷衍："这很正常""很多人都这样"
- 🚫 禁止提及任何数字分数、百分位、排名
- 🚫 禁止将特质描述为"高"或"低"——只描述类型、模式和张力

## 必须做到

- ✅ 每次回复必须包含至少一个尖锐的、让用户不舒服的核心问题
- ✅ 必须精准引用用户的具体特质类型和顺流/消耗区来支撑你的观察
- ✅ 发现"高耗能区"时必须直接指出，并追问："你知道这块每天在吞噬你多少能量吗？"
- ✅ 发现"跨维度张力"时必须命名它、描述它的破坏模式，然后追问用户如何应对
- ✅ 适时引用心理学经典理论（荣格阴影面、内省偏差 Nisbett & Wilson、认知失调 Festinger、存在焦虑 Kierkegaard、Csikszentmihalyi 的心流对立面）
- ✅ 使用 **加粗** 标记关键概念
- ✅ 每次回复控制在 120-250 字，简洁但致命

## 建议回复

每次回复末尾，你必须附加如下 JSON 格式的建议回复选项（独占一行，3 个选项）：

\`\`\`suggestions
["选项1", "选项2", "选项3"]
\`\`\`

建议回复必须体现三种不同立场：一个是防御/否认型，一个是痛苦承认型，一个是主动深挖型。每个选项 10-25 字。

## 用户的拓扑画像

原型：「${report.selfTheme}」
叙事身份：${report.narrativeTheme}

${traitLines}

跨维度化学反应（张力地图）：
${tensionLines}

## 对话开场

现在请基于以上拓扑画像数据，以手术刀般的精准和温度开启第一轮对话。
不要从"你好"开始。直接切入用户画像中最耐人寻味的矛盾点或高耗能模式，
抛出一个让用户愣住三秒钟的观察和追问。`;
}

// ── Parse suggestion responses from AI output ──

function parseSuggestions(content: string): { text: string; suggestions: string[] } {
  const suggestionsMatch = content.match(/```suggestions\s*\n?\s*(\[[\s\S]*?\])\s*\n?\s*```/);
  if (suggestionsMatch) {
    try {
      const suggestions = JSON.parse(suggestionsMatch[1]);
      const text = content.replace(/```suggestions[\s\S]*?```/, '').trim();
      return { text, suggestions };
    } catch {
      // fallback
    }
  }

  // Try inline JSON array at the end
  const inlineMatch = content.match(/\n\s*(\[\"[^\]]+\])\s*$/);
  if (inlineMatch) {
    try {
      const suggestions = JSON.parse(inlineMatch[1]);
      const text = content.replace(/\n\s*\[\"[^\]]+\]\s*$/, '').trim();
      return { text, suggestions };
    } catch {
      // fallback
    }
  }

  return {
    text: content.trim(),
    suggestions: ['请继续说下去', '这个观点很有意思，能展开吗？', '我有不同的看法'],
  };
}

// ── Determine dialogue phase based on turn count ──

function getPhase(turnCount: number): DialogueState['phase'] {
  if (turnCount <= 1) return 'observation';
  if (turnCount <= 3) return 'probing';
  if (turnCount <= 5) return 'contradiction';
  if (turnCount <= 7) return 'integration';
  return 'complete';
}

// ── Real AI Dialogue ──

export function createInitialDialogue(_report: SocraticReport): DialogueState {
  return {
    messages: [],
    phase: 'observation',
    turnCount: 0,
    suggestedResponses: [],
  };
}

/**
 * Stream the AI's first greeting message
 */
export async function streamInitialMessage(
  report: SocraticReport,
  onToken: (token: string) => void,
  onDone: (fullText: string, suggestions: string[]) => void,
  onError: (error: Error) => void,
): Promise<void> {
  const systemPrompt = buildSystemPrompt(report);
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: '请开始苏格拉底式对话。' },
  ];

  let fullText = '';
  let displayText = '';

  await streamChat(messages, {
    onToken: (token) => {
      fullText += token;
      // Check if we've hit the suggestions block
      const suggestionsStart = fullText.indexOf('```suggestions');
      if (suggestionsStart !== -1) return; // stop sending tokens

      // Buffer: hold back last 15 chars to catch partial ``` markers
      const safeEnd = Math.max(0, fullText.length - 15);
      const newDisplay = fullText.slice(0, safeEnd);
      if (newDisplay.length > displayText.length) {
        onToken(newDisplay.slice(displayText.length));
        displayText = newDisplay;
      }
    },
    onDone: (text) => {
      const { text: cleanText, suggestions } = parseSuggestions(text);
      // Flush any remaining safe text
      if (cleanText.length > displayText.length) {
        onToken(cleanText.slice(displayText.length));
      }
      onDone(cleanText, suggestions);
    },
    onError,
  }, { temperature: 0.85, maxTokens: 600 });
}

/**
 * Stream the AI's response to a user message
 */
export async function streamResponse(
  report: SocraticReport,
  conversationHistory: DialogueMessage[],
  userMessage: string,
  turnCount: number,
  onToken: (token: string) => void,
  onDone: (fullText: string, suggestions: string[], phase: DialogueState['phase']) => void,
  onError: (error: Error) => void,
): Promise<void> {
  const systemPrompt = buildSystemPrompt(report);
  const phase = getPhase(turnCount);

  // Build message history for context
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    // The initial "start" message
    { role: 'user', content: '请开始苏格拉底式对话。' },
  ];

  // Add conversation history
  for (const msg of conversationHistory) {
    messages.push({
      role: msg.role === 'ai' ? 'assistant' : 'user',
      content: msg.content,
    });
  }

  // Add current user message
  messages.push({ role: 'user', content: userMessage });

  // Add phase guidance
  if (phase === 'contradiction') {
    messages.push({
      role: 'system',
      content: '现在进入【矛盾·爆破】阶段。找出用户画像中最致命的跨维度张力，毫不回避地命名它、撕开它，追问这种内在撕裂在日常中的代价。不许温柔地"指出"，要像手术刀一样精准切入。记住：不要使用任何数字分数。',
    });
  } else if (phase === 'integration') {
    messages.push({
      role: 'system',
      content: '现在进入【整合·重建】阶段。不要用鸡汤粘合碎片——用存在主义框架重新建构。引用 Kierkegaard、Sartre 或 Frankl，帮用户看到他们的张力不是"缺陷"而是"存在的代价"。最后给出一个极具穿透力的终极追问。',
    });
  } else if (phase === 'complete') {
    messages.push({
      role: 'system',
      content: '对话即将结束。用一段极其犀利但温暖的结语收场——引用苏格拉底或存在主义哲学家的名言，但不要是烂大街的那种。留下一个会让用户在之后几天持续反刍的问题，作为种子。不需要提供建议回复选项。',
    });
  }

  let fullText = '';
  let displayText = '';

  await streamChat(messages, {
    onToken: (token) => {
      fullText += token;
      const suggestionsStart = fullText.indexOf('```suggestions');
      if (suggestionsStart !== -1) return;

      const safeEnd = Math.max(0, fullText.length - 15);
      const newDisplay = fullText.slice(0, safeEnd);
      if (newDisplay.length > displayText.length) {
        onToken(newDisplay.slice(displayText.length));
        displayText = newDisplay;
      }
    },
    onDone: (text) => {
      const { text: cleanText, suggestions } = parseSuggestions(text);
      if (cleanText.length > displayText.length) {
        onToken(cleanText.slice(displayText.length));
      }
      onDone(cleanText, phase === 'complete' ? [] : suggestions, phase);
    },
    onError,
  }, { temperature: 0.85, maxTokens: 600 });
}

// ── Mock Fallback (when API unavailable) ──

export function getMockResponse(report: SocraticReport, turnCount: number): {
  content: string;
  suggestions: string[];
  phase: DialogueState['phase'];
} {
  const phase = getPhase(turnCount);
  const dims = Object.entries(report.dimensions);
  const topDim = dims[0];
  const topDimMeta = DIMENSION_MAP[topDim?.[0]];

  switch (phase) {
    case 'observation':
      if (turnCount === 0) {
        const traits = topDim?.[1]?.description || '多元特质';
        return {
          content: `我注意到你在「${topDimMeta?.name || topDim?.[0]}」维度展现出了独特的模式——${traits}。\n\n这是一个很有意思的起点。这些特质在你的日常生活中是如何显现的？你觉得哪些场景最能体现你这种模式？`,
          suggestions: ['我觉得很准确，这确实是我最核心的特质', '有些意外，我没想到是这样的模式', '部分认同，但我想补充一些'],
          phase,
        };
      }
      return {
        content: `你的顺流区和消耗区呈现出有趣的对比——这可能意味着你在某些情境下能进入心流状态，而在另一些情境下会感到消耗。\n\n你最近一次感受到"毫不费力地沉浸"是什么时候？`,
        suggestions: ['那是在做创造性工作的时候', '说实话，最近很少有这种体验', '我对这种感觉并不陌生，经常出现'],
        phase,
      };
    case 'probing':
      return {
        content: `苏格拉底相信，认识自我的关键不在于找到"正确答案"，而在于持续地追问。\n\n如果你最亲近的人来看这份拓扑画像，他们会觉得哪个特质"最不像你"？为什么？`,
        suggestions: ['他们可能觉得我的社交模式描述不太准', '他们对我的认知风格可能有不同看法', '我觉得他们会和我有差不多的判断'],
        phase,
      };
    case 'contradiction': {
      const tension = report.crossDimensionTensions[0];
      return {
        content: tension
          ? `有趣的是，你的画像中出现了一个跨维度的化学反应——**${tension.title}**。${tension.description}\n\n这种张力你在现实中有所感受吗？`
          : `你的核心原型是「${report.selfTheme}」，但有趣的是——每个人都有一个**阴影面**（荣格心理学）。\n\n如果你的拓扑画像有一个"隐藏的维度"——一个你不愿面对的自我特质——你觉得它可能是什么？`,
        suggestions: ['我可能在回避竞争/冲突', '我对自己的脆弱面有所隐藏', '这个问题很值得深思'],
        phase,
      };
    }
    case 'integration':
      return {
        content: `德尔菲神谕说"认识你自己"，但存在主义哲学家萨特提醒我们："人不是一个固定的存在，而是不断生成的过程。"\n\n你的拓扑画像是此刻的你——而不是永恒的你。如果你可以有意识地发展一个维度，你最想深化哪一个？`,
        suggestions: ['我想发展情感觉知能力', '我想让世界观更有深度', '我想构建更好的社会联结'],
        phase,
      };
    default:
      return {
        content: `谢谢你的分享。这次苏格拉底式对话到这里暂告一段落。\n\n记住：**认识自己是一个终身的旅程，而不是一次性的测量。**\n\n"未经审视的生活是不值得过的。" —— 苏格拉底`,
        suggestions: [],
        phase: 'complete',
      };
  }
}

// ══════════════════════════════════════════════════════════════
// V2.1: 多智者对话 Streaming 函数
// ══════════════════════════════════════════════════════════════

/**
 * 流式智者开场消息
 */
export async function streamSageInitialMessage(
  sageId: SageId,
  report: SocraticReport,
  topology: TopologyProfile,
  onToken: (token: string) => void,
  onDone: (fullText: string, suggestions: string[]) => void,
  onError: (error: Error) => void,
): Promise<void> {
  const systemPrompt = buildSageSystemPrompt(sageId, report, topology);
  const sage = SAGE_MAP[sageId];

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `请以「${sage.name}」的身份开始对话。` },
  ];

  let fullText = '';
  let displayText = '';

  await streamChat(messages, {
    onToken: (token) => {
      fullText += token;
      const suggestionsStart = fullText.indexOf('```suggestions');
      if (suggestionsStart !== -1) return;

      const safeEnd = Math.max(0, fullText.length - 15);
      const newDisplay = fullText.slice(0, safeEnd);
      if (newDisplay.length > displayText.length) {
        onToken(newDisplay.slice(displayText.length));
        displayText = newDisplay;
      }
    },
    onDone: (text) => {
      const { text: cleanText, suggestions } = parseSuggestions(text);
      if (cleanText.length > displayText.length) {
        onToken(cleanText.slice(displayText.length));
      }
      onDone(cleanText, suggestions);
    },
    onError,
  }, { temperature: 0.85, maxTokens: 600 });
}

/**
 * 流式智者对话回复
 */
export async function streamSageResponse(
  sageId: SageId,
  report: SocraticReport,
  topology: TopologyProfile,
  conversationHistory: DialogueMessage[],
  userMessage: string,
  turnCount: number,
  onToken: (token: string) => void,
  onDone: (fullText: string, suggestions: string[], phase: string) => void,
  onError: (error: Error) => void,
): Promise<void> {
  const systemPrompt = buildSageSystemPrompt(sageId, report, topology);
  const sage = SAGE_MAP[sageId];
  const phase = getSagePhase(sageId, turnCount);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `请以「${sage.name}」的身份开始对话。` },
  ];

  // Add conversation history
  for (const msg of conversationHistory) {
    messages.push({
      role: msg.role === 'ai' ? 'assistant' : 'user',
      content: msg.content,
    });
  }

  // Add current user message
  messages.push({ role: 'user', content: userMessage });

  // Add phase guidance
  const guidance = getPhaseGuidance(sageId, turnCount);
  if (guidance) {
    messages.push({ role: 'system', content: guidance });
  }

  let fullText = '';
  let displayText = '';

  await streamChat(messages, {
    onToken: (token) => {
      fullText += token;
      const suggestionsStart = fullText.indexOf('```suggestions');
      if (suggestionsStart !== -1) return;

      const safeEnd = Math.max(0, fullText.length - 15);
      const newDisplay = fullText.slice(0, safeEnd);
      if (newDisplay.length > displayText.length) {
        onToken(newDisplay.slice(displayText.length));
        displayText = newDisplay;
      }
    },
    onDone: (text) => {
      const { text: cleanText, suggestions } = parseSuggestions(text);
      if (cleanText.length > displayText.length) {
        onToken(cleanText.slice(displayText.length));
      }
      onDone(cleanText, phase === 'complete' ? [] : suggestions, phase);
    },
    onError,
  }, { temperature: 0.85, maxTokens: 600 });
}

/**
 * 智者 Mock 降级响应
 */
export function getSageMockResponse(
  sageId: SageId,
  report: SocraticReport,
  turnCount: number,
): { content: string; suggestions: string[]; phase: string } {
  const sage = SAGE_MAP[sageId];
  const phase = getSagePhase(sageId, turnCount);
  const topDim = Object.entries(report.dimensions)[0];

  if (turnCount === 0) {
    const mockIntros: Record<SageId, string> = {
      scientist: `从你的画像来看，你展现出一种独特的**认知架构**——${topDim?.[1]?.description || '多元思维特质'}。\n\n我好奇的是：当你面对一个全新的、复杂的问题时，你的大脑默认的"第一步"是什么？是立刻分析结构，还是先让直觉给出方向？`,
      philosopher: `在你的画像中，我注意到一个有趣的张力——你的生活叙事围绕「${report.selfTheme}」展开。\n\n但我想追问一个更根本的问题：当你说某件事"有意义"的时候，你实际上在用什么标准衡量？`,
      analyst: `你的画像里藏着几个很有意思的**内在冲突**。${report.crossDimensionTensions.length > 0 ? `比如「${report.crossDimensionTensions[0].title}」` : '你的各维度之间存在微妙的张力'}。\n\n我想请你想一个最近让你感到"被撕扯"的决定或情境——那种"两个自我在打架"的感觉。能描述一下吗？`,
      relationalist: `你的社交维度画像呈现出一个模式——${topDim?.[1]?.description || '独特的人际互动特质'}。\n\n我想邀请你做一个练习：想想你生命中最重要的三个人。在他们面前，你的"真实自我"展露了多少——100%？60%？30%？`,
      creator: `你的审美画像很有意思——${topDim?.[1]?.description || '跨越多个创造性领域'}。\n\n请回忆一下：最近一次让你感到**审美震撼**的体验是什么？那一刻，你被击中的到底是结构、情绪、记忆联想，还是其他什么？`,
      system_builder: `基于你的画像，我看到了几个可以转化为**实际行动**的支点。\n\n在我们设计你的"个人升级实验"之前，有个关键问题：过去三个月，你开始过哪些新习惯或项目？其中坚持下来的和放弃的，比例大约是多少？`,
      product_sage: `欢迎来到产品设计引擎的核心——在前面的对话中，我们已经深入理解了你的**思维模式、价值观、审美偏好和行动能力**。\n\n现在，关键的问题来了：最近 3 个月里，有哪些**反复让你感到挫败或无力**的事情？不是别人要你做的，而是你自己真正在乎、却总是没能解决好的生活任务？\n\n请列出 3-5 个这样的困扰。`,
    };

    return {
      content: mockIntros[sageId],
      suggestions: ['这确实是我的核心模式', '有些细节不太准确', '我想从另一个角度谈谈'],
      phase,
    };
  }

  if (phase === 'complete') {
    return {
      content: `这次和你以「${sage.name}」的视角对话很有收获。\n\n记住一个核心洞察：**你不需要成为一个"更好的版本"，而是成为一个更清醒地选择如何使用自己模式的人。**\n\n在接下来几天里，留意一下：今天对话中哪个问题，你仍然没有一个让自己满意的回答？`,
      suggestions: [],
      phase,
    };
  }

  return {
    content: `你提到的这一点和画像中的「${report.selfTheme}」原型形成了有趣的呼应。\n\n让我从${sage.name}的角度追问一下——这种模式在你遇到**阻力**的时候会发生什么变化？你是倾向于加倍努力，还是切换策略，还是暂时回避？`,
    suggestions: ['我通常会加倍投入', '我更倾向于换个思路', '说实话，我可能会拖延或回避'],
    phase,
  };
}

// ══════════════════════════════════════════════════════════════
// V3.0: 圆桌模式 Streaming 函数
// ══════════════════════════════════════════════════════════════

import {
  buildRoundtableSagePrompt,
  type RoundtableSageSummary,
} from './sage-orchestrator';

/**
 * 圆桌模式：流式智者开场消息（带前序智者上下文）
 */
export async function streamRoundtableSageInitial(
  sageId: SageId,
  report: SocraticReport,
  topology: TopologyProfile,
  previousSummaries: RoundtableSageSummary[],
  onToken: (token: string) => void,
  onDone: (fullText: string, suggestions: string[]) => void,
  onError: (error: Error) => void,
): Promise<void> {
  const systemPrompt = buildRoundtableSagePrompt(sageId, report, topology, previousSummaries);
  const sage = SAGE_MAP[sageId];

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `请以「${sage.name}」的身份在圆桌讨论中发言。` },
  ];

  let fullText = '';
  let displayText = '';

  await streamChat(messages, {
    onToken: (token) => {
      fullText += token;
      const suggestionsStart = fullText.indexOf('```suggestions');
      if (suggestionsStart !== -1) return;
      const safeEnd = Math.max(0, fullText.length - 15);
      const newDisplay = fullText.slice(0, safeEnd);
      if (newDisplay.length > displayText.length) {
        onToken(newDisplay.slice(displayText.length));
        displayText = newDisplay;
      }
    },
    onDone: (text) => {
      const { text: cleanText, suggestions } = parseSuggestions(text);
      if (cleanText.length > displayText.length) {
        onToken(cleanText.slice(displayText.length));
      }
      onDone(cleanText, suggestions);
    },
    onError,
  }, { temperature: 0.85, maxTokens: 600 });
}

/**
 * 圆桌模式：流式智者回复（带前序智者上下文 + 当前对话历史）
 */
export async function streamRoundtableSageResponse(
  sageId: SageId,
  report: SocraticReport,
  topology: TopologyProfile,
  previousSummaries: RoundtableSageSummary[],
  conversationHistory: DialogueMessage[],
  userMessage: string,
  turnCount: number,
  onToken: (token: string) => void,
  onDone: (fullText: string, suggestions: string[], phase: string) => void,
  onError: (error: Error) => void,
): Promise<void> {
  const systemPrompt = buildRoundtableSagePrompt(sageId, report, topology, previousSummaries);
  const sage = SAGE_MAP[sageId];
  const phase = getSagePhase(sageId, turnCount);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `请以「${sage.name}」的身份在圆桌讨论中发言。` },
  ];

  for (const msg of conversationHistory) {
    messages.push({
      role: msg.role === 'ai' ? 'assistant' : 'user',
      content: msg.content,
    });
  }
  messages.push({ role: 'user', content: userMessage });

  const guidance = getPhaseGuidance(sageId, turnCount);
  if (guidance) {
    messages.push({ role: 'system', content: guidance });
  }

  let fullText = '';
  let displayText = '';

  await streamChat(messages, {
    onToken: (token) => {
      fullText += token;
      const suggestionsStart = fullText.indexOf('```suggestions');
      if (suggestionsStart !== -1) return;
      const safeEnd = Math.max(0, fullText.length - 15);
      const newDisplay = fullText.slice(0, safeEnd);
      if (newDisplay.length > displayText.length) {
        onToken(newDisplay.slice(displayText.length));
        displayText = newDisplay;
      }
    },
    onDone: (text) => {
      const { text: cleanText, suggestions } = parseSuggestions(text);
      if (cleanText.length > displayText.length) {
        onToken(cleanText.slice(displayText.length));
      }
      onDone(cleanText, phase === 'complete' ? [] : suggestions, phase);
    },
    onError,
  }, { temperature: 0.85, maxTokens: 600 });
}

