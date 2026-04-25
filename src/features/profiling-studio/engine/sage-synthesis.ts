/**
 * 智者综合整合引擎 (Sage Synthesis Engine)
 *
 * 功能：
 * - 将多位智者的结构化洞见整合为「个人操作系统与升级路线图」
 * - 调用 AI 生成全文叙事
 * - 提供 Mock 降级
 */

import type { TopologyProfile, SageInsight, PersonalOS } from '../types';
import { streamChat, type ChatMessage } from '../api/deepseek';
import { topologyToSocraticReport } from './socratic';
import { SAGE_MAP } from '../data/sages';

function formatInsights(insights: SageInsight[]): string {
  return insights.map(insight => {
    const sage = SAGE_MAP[insight.sageId];
    let detail = '';

    switch (insight.sageId) {
      case 'philosopher':
        detail = `核心价值: ${insight.worldviewModel.coreValues.join('、')}
意义来源: ${insight.worldviewModel.meaningSources.join('、')}
内在假设: ${insight.worldviewModel.assumptions.join('、')}
价值张力: ${insight.worldviewModel.tensions.join('、')}`;
        break;
      case 'scientist':
        detail = `决策风格: ${insight.cognitiveWorkflow.decisionStyle}
学习风格: ${insight.cognitiveWorkflow.learningStyle}
认知优势: ${insight.cognitiveWorkflow.strengths.join('、')}
认知风险: ${insight.cognitiveWorkflow.risks.join('、')}`;
        break;
      case 'analyst':
        detail = `当前聚焦: ${insight.conflictMap.currentFocus}
张力对: ${insight.conflictMap.tensions.map(t => t.pair).join('；')}`;
        break;
      case 'relationalist':
        detail = `依恋摘要: ${insight.relationshipPattern.attachmentSummary}
默认剧本: ${insight.relationshipPattern.defaultScript}
期望状态: ${insight.relationshipPattern.desiredState}`;
        break;
      case 'creator':
        detail = `审美偏好: ${insight.aestheticProfile.stylePreferences.join('、')}
创作流程: ${insight.aestheticProfile.creativeProcess}
审美宣言: ${insight.aestheticProfile.aestheticManifesto}`;
        break;
      case 'system_builder':
        detail = `时间跨度: ${insight.upgradePlan.horizonMonths}个月
主题数: ${insight.upgradePlan.themes.length}
实验数: ${insight.upgradePlan.themes.reduce((n, t) => n + t.experiments.length, 0)}`;
        break;
    }

    return `### ${sage.icon} ${sage.name}（${sage.nameEn}）
${detail}`;
  }).join('\n\n');
}

function buildSynthesisPrompt(
  topology: TopologyProfile,
  insights: SageInsight[],
): string {
  const report = topologyToSocraticReport(topology);

  return `你是一位综合心理学顾问，负责将六位不同视角的智者的洞见整合为一份「个人操作系统与升级路线图」。

## 用户画像概览

原型：「${report.selfTheme}」
叙事身份：${report.narrativeTheme}

## 各智者洞见

${formatInsights(insights)}

## 输出要求

请生成一份整合报告，格式为 JSON：

\`\`\`json
{
  "cognitiveModel": "一段 50-100 字的核心认知模型概述",
  "worldviewAnchor": "一段 50-100 字的世界观与意义锚定",
  "tensionMap": ["张力1", "张力2", "张力3"],
  "relationshipSummary": "一段 50-80 字的关系模式摘要",
  "aestheticBaseline": "一段 50-80 字的审美与创作基线",
  "upgradeRoadmap": ["路线1", "路线2", "路线3"],
  "narrative": "一段 200-400 字的全文叙事，第二人称，温暖但犀利"
}
\`\`\`

核心原则：
1. 不是六份小结的简单拼接，而是向上抽象出统一的人格叙事
2. 找出各智者洞见之间的呼应与矛盾，这些是最有价值的
3. 升级路线图必须可执行、有时间框、有成功指标
4. 全文叙事应该像一封写给未来一年的自己的信`;
}

/**
 * 流式生成个人操作系统
 */
export async function streamPersonalOS(
  topology: TopologyProfile,
  insights: SageInsight[],
  onToken: (token: string) => void,
  onDone: (os: PersonalOS) => void,
  onError: (error: Error) => void,
): Promise<void> {
  const prompt = buildSynthesisPrompt(topology, insights);

  const messages: ChatMessage[] = [
    { role: 'system', content: prompt },
    { role: 'user', content: '请生成我的个人操作系统与升级路线图。' },
  ];

  let fullText = '';

  await streamChat(messages, {
    onToken: (token) => {
      fullText += token;
      // 在 JSON 解析前，将非 JSON 部分作为进度显示
      const jsonStart = fullText.indexOf('```json');
      if (jsonStart === -1) {
        onToken(token);
      }
    },
    onDone: (text) => {
      const os = parsePersonalOS(text);
      if (os) {
        onDone(os);
      } else {
        // 降级：将全文作为 narrative
        onDone(generateFallbackOS(topology, insights));
      }
    },
    onError,
  }, { temperature: 0.7, maxTokens: 1200 });
}

function parsePersonalOS(text: string): PersonalOS | null {
  const jsonMatch = text.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[1]);
    return {
      id: `os_${Date.now()}`,
      cognitiveModel: parsed.cognitiveModel || '',
      worldviewAnchor: parsed.worldviewAnchor || '',
      tensionMap: parsed.tensionMap || [],
      relationshipSummary: parsed.relationshipSummary || '',
      aestheticBaseline: parsed.aestheticBaseline || '',
      upgradeRoadmap: parsed.upgradeRoadmap || [],
      narrative: parsed.narrative || '',
      createdAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * 本地降级生成 PersonalOS
 */
export function generateFallbackOS(
  topology: TopologyProfile,
  insights: SageInsight[],
): PersonalOS {
  const report = topologyToSocraticReport(topology);

  const tensionMap = report.crossDimensionTensions.map(t => t.title);
  const upgradeRoadmap: string[] = [];

  for (const insight of insights) {
    if (insight.sageId === 'system_builder') {
      for (const theme of insight.upgradePlan.themes) {
        upgradeRoadmap.push(`${theme.name}: ${theme.motivation}`);
      }
    }
  }

  // Fallback: extract key phrases from each insight
  const cognitiveModel = insights.find(i => i.sageId === 'scientist')
    ? `决策风格倾向 ${(insights.find(i => i.sageId === 'scientist') as Extract<SageInsight, { sageId: 'scientist' }>)?.cognitiveWorkflow?.decisionStyle || '综合型'}`
    : `画像原型「${report.selfTheme}」`;

  return {
    id: `os_${Date.now()}`,
    cognitiveModel,
    worldviewAnchor: `叙事身份：${report.narrativeTheme}`,
    tensionMap: tensionMap.length > 0 ? tensionMap : ['等待更多智者对话以发现内在张力'],
    relationshipSummary: insights.find(i => i.sageId === 'relationalist')
      ? (insights.find(i => i.sageId === 'relationalist') as Extract<SageInsight, { sageId: 'relationalist' }>)?.relationshipPattern?.attachmentSummary || '待探索'
      : '待探索',
    aestheticBaseline: insights.find(i => i.sageId === 'creator')
      ? (insights.find(i => i.sageId === 'creator') as Extract<SageInsight, { sageId: 'creator' }>)?.aestheticProfile?.aestheticManifesto || '待探索'
      : '待探索',
    upgradeRoadmap: upgradeRoadmap.length > 0 ? upgradeRoadmap : ['完成更多智者对话以生成升级路线图'],
    narrative: `你是一位「${report.selfTheme}」型的人。你的叙事身份围绕「${report.narrativeTheme}」展开。通过与多位智者的对话，你正在逐步揭开自己内在世界的多层面貌。每一次对话都是一面新的镜子，而真正的整合，发生在所有镜子搭建完成之后。`,
    createdAt: new Date().toISOString(),
  };
}
