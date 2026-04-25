import { DIMENSIONS } from '../data/dimensions';
import { getHumanMapQuestions } from '../data/human-map';
import { buildHumanMapClarifiers } from '../engine/human-map';
import { chatCompletion } from './deepseek';
import type { HumanMapBlueprint, HumanMapQuestionDef, HumanMapSignalId } from '../types';

const DIMENSION_IDS = new Set(DIMENSIONS.map((dimension) => dimension.id));
const SIGNAL_IDS = new Set<HumanMapSignalId>([
  'identity_meaning',
  'career_execution',
  'emotion_healing',
  'relationship_pattern',
  'creativity_expression',
  'cognition_learning',
]);

interface AdaptiveClarifierInput {
  mode: Exclude<import('../types').HumanMapMode, 'skip'>;
  answers: Record<string, string>;
  blueprint: HumanMapBlueprint;
}

function stripMarkdownFence(text: string): string {
  return text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
}

function extractJSONObject(text: string): string {
  const cleaned = stripMarkdownFence(text);
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AI 追问返回的不是有效 JSON。');
  }
  return cleaned.slice(start, end + 1);
}

function limit(text: unknown, max: number, fallback: string): string {
  const normalized = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (!normalized) return fallback;
  return normalized.length > max ? `${normalized.slice(0, max - 1).trim()}…` : normalized;
}

function sanitizeExamples(value: unknown): string[] {
  if (!Array.isArray(value)) return ['最近一次', '最卡的一次', '最真实的一次'];
  return value
    .map((item) => limit(item, 20, ''))
    .filter(Boolean)
    .slice(0, 4);
}

function sanitizeDimensionBias(value: unknown): Partial<Record<string, number>> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([dimensionId, bias]) => DIMENSION_IDS.has(dimensionId) && Number.isFinite(Number(bias)))
    .slice(0, 3)
    .map(([dimensionId, bias]) => [dimensionId, Math.max(4, Math.min(18, Math.round(Number(bias))))]);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function sanitizeSignalHints(value: unknown): HumanMapSignalId[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const signals = value
    .filter((item): item is HumanMapSignalId => typeof item === 'string' && SIGNAL_IDS.has(item as HumanMapSignalId))
    .slice(0, 2);
  return signals.length > 0 ? signals : undefined;
}

function normalizeQuestion(raw: unknown, index: number): HumanMapQuestionDef | null {
  if (!raw || typeof raw !== 'object') return null;
  const question = raw as Record<string, unknown>;
  const title = limit(question.title, 34, '');
  const prompt = limit(question.prompt, 200, '');
  if (!title || !prompt) return null;

  return {
    id: `ai_clarifier_${index + 1}`,
    section: limit(question.section, 24, 'AI 定制追问'),
    title,
    prompt,
    helper: limit(question.helper, 120, '优先回忆最近一次真实发生的场景，再写你最自然会怎么做。'),
    placeholder: limit(question.placeholder, 220, '例如：最近一次我在类似场景里，最先出现的是……因为……'),
    examples: sanitizeExamples(question.examples),
    required: false,
    isClarifier: true,
    dimensionBias: sanitizeDimensionBias(question.dimensionBias),
    signalHints: sanitizeSignalHints(question.signalHints),
  };
}

export async function generateAdaptiveHumanMapClarifiers(
  input: AdaptiveClarifierInput,
): Promise<HumanMapQuestionDef[]> {
  const baseQuestions = getHumanMapQuestions(input.mode);
  const ruleClarifiers = buildHumanMapClarifiers(input.mode, input.answers);

  const systemPrompt = `
你是“画像工坊”的顶级追问设计师。你的任务不是分析用户，而是生成 1-3 道极其好答、能打破摇摆的中文追问题。

要求：
1. 题目必须让小白也能回答，不能抽象、不能哲学空转。
2. 每题只问一件事，最好逼用户回忆一个最近的具体场景，或做一个明确取舍。
3. 不要重复已有基础题和规则追问，不要再问“你是谁”“你的人生阶段是什么”这类已经问过的问题。
4. 每题都要更贴近这个人的阶段、主线问题和摇摆点。
5. 语气要锐利但不压迫，像一个很懂人的采访者。
6. 输出必须是 JSON，不要加解释，不要 Markdown。

输出格式：
{
  "questions": [
    {
      "section": "AI 定制追问 · XXX",
      "title": "不超过 22 个字",
      "prompt": "完整追问",
      "helper": "一句简短作答引导",
      "placeholder": "一个具体示例",
      "examples": ["提示词1", "提示词2", "提示词3"],
      "dimensionBias": { "motivation": 14, "emotion": 8 },
      "signalHints": ["career_execution", "emotion_healing"]
    }
  ]
}
`.trim();

  const userPrompt = `
模式：${input.mode === 'detailed' ? '详细版' : '精简版'}
当前阶段：${input.blueprint.lifeStage}
当前主线：${input.blueprint.currentFocus}
当前摘要：${input.blueprint.summary}
高频信号：${input.blueprint.signalScores.slice(0, 4).map((signal) => `${signal.label}(${signal.score.toFixed(1)})`).join(' / ')}
优先维度：${input.blueprint.recommendedDimensions.slice(0, 4).join(' / ')}

已有基础题：
${baseQuestions.map((question) => `- ${question.title}`).join('\n')}

已有规则追问：
${ruleClarifiers.map((question) => `- ${question.title}`).join('\n') || '- 暂无'}

用户已回答摘录：
${Object.entries(input.answers)
  .filter(([, answer]) => Boolean(answer.trim()))
  .slice(0, 12)
  .map(([questionId, answer]) => `- ${questionId}: ${limit(answer, 180, '')}`)
  .join('\n')}

请只输出 JSON。
`.trim();

  const raw = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.45, maxTokens: 900, model: 'glm-5.1' },
  );

  const parsed = JSON.parse(extractJSONObject(raw)) as { questions?: unknown[] };
  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
  return questions
    .map((question, index) => normalizeQuestion(question, index))
    .filter((question): question is HumanMapQuestionDef => Boolean(question))
    .slice(0, 3);
}
