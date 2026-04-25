/**
 * DeepSeek AI 总结服务
 * 将用户的多维度评测数据发送给 DeepSeek V3，生成个性化的全方位自我画像叙事
 */

import type {
  TopologyProfile,
  GameResult,
  CATResponse,
  HumanMapBlueprint,
  QuestionPresentationSnapshot,
} from '../types';
import { DIMENSIONS } from '../data/dimensions';
import { chatCompletion, streamChat } from './deepseek';

interface AISummaryInput {
  topology: TopologyProfile;
  completedDimensions: string[];
  avgCompleted: boolean;
  gameResults: GameResult[];
  catResponses: Record<string, CATResponse[]>;
  humanMapBlueprint?: HumanMapBlueprint | null;
  questionPresentationSnapshots?: QuestionPresentationSnapshot[];
}

interface QuestionTraceReferenceEntry {
  refId: string;
  snapshot: QuestionPresentationSnapshot;
}

function truncate(text: string, max = 84): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function buildQuestionTraceContext(
  snapshots?: QuestionPresentationSnapshot[],
): string {
  const answeredSnapshots: QuestionTraceReferenceEntry[] = (snapshots || [])
    .filter((snapshot) => Boolean(snapshot.answerLabel || snapshot.answerValue != null))
    .sort((left, right) => {
      if (left.personalized !== right.personalized) return left.personalized ? -1 : 1;
      const leftTime = new Date(left.answeredAt || left.cachedAt).getTime();
      const rightTime = new Date(right.answeredAt || right.cachedAt).getTime();
      return rightTime - leftTime;
    })
    .slice(0, 6)
    .map((snapshot, index) => ({
      refId: `Q${index + 1}`,
      snapshot,
    }));

  if (answeredSnapshots.length === 0) return '';

  return `## 题目回溯证据
这些是用户这次测评里真正看到过、真正回答过的题目版本，请优先把它们当作“系统是如何一步步问到这个人”的证据。
${answeredSnapshots.map(({ refId, snapshot }) => {
    const lines = [
      `- 【${refId}】[${snapshot.dimensionName}${snapshot.personalized ? ' / 个性化版本' : ''}] 题目：${truncate(snapshot.renderedText, 78)}`,
      snapshot.answerLabel ? `  作答：${truncate(snapshot.answerLabel, 52)}` : '',
      snapshot.whyAsked ? `  为什么问：${truncate(snapshot.whyAsked, 72)}` : '',
      snapshot.scenePrompt ? `  代入提醒：${truncate(snapshot.scenePrompt, 72)}` : '',
      snapshot.originalText !== snapshot.renderedText ? `  原始题干：${truncate(snapshot.originalText, 64)}` : '',
    ].filter(Boolean);
    return lines.join('\n');
  }).join('\n')}`;
}

/** 构建发送给 AI 的结构化 prompt */
function buildPrompt(input: AISummaryInput): string {
  const {
    topology,
    completedDimensions,
    avgCompleted,
    gameResults,
    catResponses,
    humanMapBlueprint,
    questionPresentationSnapshots,
  } = input;

  // 1. 收集维度拓扑数据
  const dimensionSummaries = DIMENSIONS
    .filter(d => topology.dimensionTopologies[d.id])
    .map(d => {
      const dt = topology.dimensionTopologies[d.id];
      const traits = dt.dominantTraits
        .filter(t => t.typology !== '待识别')
        .map(t => `  - ${t.subDimensionName}: ${t.typology}（${t.description}）\n    心流区: ${t.flowZone} | 耗能区: ${t.energyDrainer}`)
        .join('\n');
      return `### ${d.icon} ${d.name}\n协作角色: ${dt.collaborationRole}\n${traits || '  （数据不足）'}`;
    })
    .join('\n\n');

  // 2. 跨维度化学反应
  const reactions = topology.crossReactions
    .map(r => `- **${r.title}**（${r.reactionType === 'resonance' ? '共振' : r.reactionType === 'friction' ? '摩擦' : r.reactionType === 'catalyst' ? '催化' : '悖论'}）: ${r.narrative}`)
    .join('\n');

  // 3. 数据完备度
  const dataCompleteness = [
    `问卷量表: ${completedDimensions.length}/8 维度`,
    `AVG 情境: ${avgCompleted ? '已完成' : '未完成'}`,
    `行为实验: ${gameResults.length}/6 个游戏`,
    `CAT 自适应: ${Object.keys(catResponses).length}/8 维度`,
  ].join(' | ');

  // 4. 置信度信息
  const confidenceInfo = Object.entries(topology.confidenceMap)
    .map(([dimId, conf]) => {
      const dim = DIMENSIONS.find(d => d.id === dimId);
      return `${dim?.icon || '📊'} ${dim?.name || dimId}: ${Math.round(conf * 100)}%`;
    })
    .join(' | ');

  const humanMapContext = humanMapBlueprint
    ? `## 前置人类数值地图
版本: ${humanMapBlueprint.mode === 'detailed' ? '详细版' : '精简版'}
当前阶段: ${humanMapBlueprint.lifeStage}
当前主线: ${humanMapBlueprint.currentFocus}
前置摘要: ${humanMapBlueprint.summary}
高频信号: ${humanMapBlueprint.signalScores.slice(0, 4).map(signal => signal.label).join(' / ')}
原始自述摘录:
${humanMapBlueprint.sourceDigest.map(item => `- ${item}`).join('\n')}`
    : '';

  const questionTraceContext = buildQuestionTraceContext(questionPresentationSnapshots);

  return `你是一位资深的心理学研究者和个人发展顾问，擅长将复杂的心理测量数据转化为有温度、有深度、有洞察力的个人画像报告。

以下是一位用户通过多维度心理评测系统得到的拓扑画像数据。请基于这些数据，为该用户生成一份**全方位自我认知总结报告**。

## 用户的拓扑原型
**${topology.selfArchetype}**

## 叙事身份
${topology.narrativeIdentity}

## 各维度画像
${dimensionSummaries}

## 跨维度化学反应
${reactions || '暂无检测到的跨维度反应'}

## 数据完备度
${dataCompleteness}

## 各维度置信度
${confidenceInfo}

${humanMapContext}

${questionTraceContext}

---

## 输出要求

请生成一份 중综合报告，包含以下部分（使用 Markdown 格式）：

### 1. 🌟 你的核心画像（约 200 字）
用第二人称「你」写一段温暖但精准的整体画像描述，概括此人最显著的特质组合。避免空洞的夸赞。

### 2. 🔮 独特优势 DNA（3-5 条）
列出此人最有辨识度的优势组合，每条包含一个具体的应用建议。

### 3. ⚡ 能量管理地图
分两栏：
- **心流触发器**：什么场景、任务、人际结构能让此人进入最佳状态
- **能量黑洞**：什么会快速耗尽此人的心理资源

### 4. 🧬 内在张力与成长契机（2-3 个）
指出此人性格中的内在矛盾/张力，并将其重新框定为成长机遇。

### 5. 🎯 理想工作与协作建议
基于全部数据，推荐最适合此人的：
- 工作类型和角色
- 理想协作伙伴特质
- 需要避免的工作环境

### 6. 📝 给自己的一封短信（约 100 字）
以此人的视角，写一段给自己的话，帮助他们在迷茫时重新锚定自我。

### 7. 🧭 系统是怎么一步步问到你的（2-4 条）
如果提供了“题目回溯证据”，请指出系统是通过哪些贴身题目、场景提示或个性化追问逐步看见这个人的。这里要引用真实的问法线索，而不是只重复维度名。
如果引用题目回溯证据，必须在句尾或相关短语后使用类似 \`【Q1】\` 的编号标注；不要编造不存在的编号。

请确保报告：
- 使用中文
- 语气温暖但不浮夸，洞察力强但不评判
- 每个结论都有数据支撑（引用具体的类型名称）
- 如果存在题目回溯证据，优先把“真实题目版本 + 用户真实作答”当作辅助证据
- 如果存在题目回溯证据，优先在“系统是怎么一步步问到你的”部分使用 \`【Qx】\` 标注引用
- 避免通用的、谁都适用的建议`;
}

/** 调用 DeepSeek API */
export async function generateAISummary(input: AISummaryInput): Promise<string> {
  const prompt = buildPrompt(input);
  return chatCompletion([
    { role: 'system', content: '你是一位专业的心理测量数据分析师和生涯发展顾问。' },
    { role: 'user', content: prompt },
  ], {
    temperature: 0.7,
    maxTokens: 3000,
    model: 'glm-5.1',
  });
}

/** 流式调用 DeepSeek API（用于 UI 打字机效果） */
export async function* streamAISummary(input: AISummaryInput): AsyncGenerator<string> {
  const prompt = buildPrompt(input);
  const queue: string[] = [];
  let wake: (() => void) | null = null;
  let finished = false;
  let failure: Error | null = null;

  const notify = () => {
    wake?.();
    wake = null;
  };

  void streamChat([
    { role: 'system', content: '你是一位专业的心理测量数据分析师和生涯发展顾问。' },
    { role: 'user', content: prompt },
  ], {
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
  }, {
    temperature: 0.7,
    maxTokens: 3000,
    model: 'glm-5.1',
  }).catch((error) => {
    failure = error instanceof Error ? error : new Error(String(error));
    finished = true;
    notify();
  });

  while (!finished || queue.length > 0) {
    if (queue.length === 0) {
      await new Promise<void>(resolve => { wake = resolve; });
      continue;
    }
    const next = queue.shift();
    if (next) yield next;
  }

  if (failure) {
    throw failure;
  }
}
