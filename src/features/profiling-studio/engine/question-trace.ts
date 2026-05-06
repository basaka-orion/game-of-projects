import { DIMENSIONS } from '../data/dimensions';
import { allModules } from '../data/questions';
import { catModules } from '../data/cat-questions';
import { getHumanMapQuestionFlow } from './human-map';
import { getMatrixReasoningItems } from './matrix-reasoning';
import type {
  CATResponse,
  HumanMapBlueprint,
  HumanMapMode,
  HumanMapQuestionDef,
  MatrixSessionResult,
  Question,
  QuestionPresentationSnapshot,
  QuestionType,
} from '../types';

interface BuildQuestionTraceInput {
  storedSnapshots: Record<string, QuestionPresentationSnapshot>;
  answers: Record<string, Record<string, string | number>>;
  catResponses: Record<string, CATResponse[]>;
  humanMapMode: HumanMapMode | null;
  humanMapAnswers: Record<string, string>;
  humanMapAIQuestions: HumanMapQuestionDef[];
  humanMapBlueprint: HumanMapBlueprint | null;
  matrixResults: MatrixSessionResult[];
}

function dimensionName(dimensionId: string): string {
  return DIMENSIONS.find(dimension => dimension.id === dimensionId)?.name || dimensionId;
}

function optionLabel(question: Question, value: string | number): string {
  const selected = String(value);
  const option = question.options?.find(item => String(item.value) === selected);
  if (option) return option.label;

  if (question.choiceOptions?.length) {
    const choice = question.choiceOptions.find(item => item.startsWith(`${selected}.`));
    if (choice) return choice;
  }

  return selected;
}

function humanMapSnapshot(
  question: HumanMapQuestionDef,
  answer: string,
  blueprint: HumanMapBlueprint | null,
): QuestionPresentationSnapshot {
  const timestamp = blueprint?.completedAt || new Date().toISOString();
  return {
    id: `human-map:${question.id}`,
    moduleId: 'human_map',
    moduleName: '人类数值地图 v1',
    questionId: question.id,
    dimensionId: 'human_map',
    dimensionName: '前置建模',
    questionType: 'open',
    personalized: true,
    originalText: question.prompt,
    renderedText: `${question.title}\n${question.prompt}`,
    scenePrompt: question.helper,
    whyAsked: question.isClarifier ? '系统追问，用来校准前置建模里的模糊区' : '前置建模核心题',
    displayedOptions: question.examples,
    currentFocusSnapshot: blueprint?.currentFocus,
    lifeStageSnapshot: blueprint?.lifeStage,
    answerValue: answer,
    answerLabel: answer,
    cachedAt: timestamp,
    answeredAt: timestamp,
  };
}

function questionnaireSnapshot(
  moduleId: string,
  question: Question,
  answer: string | number,
  blueprint: HumanMapBlueprint | null,
): QuestionPresentationSnapshot {
  const module = allModules.find(item => item.id === moduleId);
  const plan = blueprint?.dimensionPlans.find(item => item.dimensionId === moduleId);
  const personalized = Boolean(plan?.questionIds.includes(question.id));
  const timestamp = blueprint?.completedAt || new Date().toISOString();

  return {
    id: `questionnaire:${moduleId}:${question.id}`,
    moduleId,
    moduleName: module?.name || dimensionName(moduleId),
    questionId: question.id,
    dimensionId: moduleId,
    dimensionName: module?.name || dimensionName(moduleId),
    questionType: question.type,
    personalized,
    originalText: question.text,
    renderedText: personalized && plan
      ? `${question.text}\n\n定制题路：${plan.reason}`
      : question.text,
    whyAsked: personalized && plan ? plan.reason : question.scaleRef || question.subDimension,
    displayedOptions: question.options?.map(item => item.label) || question.choiceOptions || [],
    displayedSliderAnchors: question.sliderAnchors,
    currentFocusSnapshot: blueprint?.currentFocus,
    lifeStageSnapshot: blueprint?.lifeStage,
    answerValue: answer,
    answerLabel: optionLabel(question, answer),
    cachedAt: timestamp,
    answeredAt: timestamp,
  };
}

function catSnapshot(
  dimensionId: string,
  response: CATResponse,
  blueprint: HumanMapBlueprint | null,
): QuestionPresentationSnapshot | null {
  const module = catModules.find(item => item.id === dimensionId);
  const question = module?.questions.find(item => item.id === response.itemId);
  if (!question) return null;

  const answerLabel = response.openScoring?.text
    || response.selectedOptionLabel
    || `IRT 分档 ${response.response}`;
  const timestamp = response.answeredAt || blueprint?.completedAt || new Date().toISOString();

  return {
    id: `cat:${dimensionId}:${response.itemId}`,
    moduleId: `cat:${dimensionId}`,
    moduleName: `CAT 自适应 · ${module?.name || dimensionName(dimensionId)}`,
    questionId: response.itemId,
    dimensionId,
    dimensionName: module?.name || dimensionName(dimensionId),
    questionType: question.type,
    personalized: false,
    originalText: question.text,
    renderedText: question.text,
    whyAsked: `${question.scaleRef || 'IRT'} · theta ${response.theta.toFixed(2)} / SE ${response.se.toFixed(2)}`,
    displayedOptions: question.options?.map(item => item.label) || question.choiceOptions || [],
    currentFocusSnapshot: blueprint?.currentFocus,
    lifeStageSnapshot: blueprint?.lifeStage,
    answerValue: response.selectedOptionValue ?? response.response,
    answerLabel,
    cachedAt: timestamp,
    answeredAt: timestamp,
  };
}

function matrixSnapshot(
  result: MatrixSessionResult,
  response: MatrixSessionResult['responses'][number],
): QuestionPresentationSnapshot | null {
  const item = getMatrixReasoningItems().find(entry => entry.id === response.itemId);
  if (!item) return null;
  const selectedOption = item.options.find(option => option.id === response.selectedOptionId);
  const correctOption = item.options.find(option => option.id === response.correctOptionId);

  return {
    id: `matrix:${result.id}:${response.itemId}`,
    moduleId: 'matrix_reasoning',
    moduleName: '原创矩阵推理',
    questionId: response.itemId,
    dimensionId: 'cognitive',
    dimensionName: '认知架构',
    questionType: 'visual_pair_choice' as QuestionType,
    personalized: false,
    originalText: item.prompt,
    renderedText: `${item.prompt}\n规则 DSL：${item.ruleDsl}`,
    whyAsked: `原创规则族 ${item.family} · 难度 ${item.difficulty}`,
    displayedOptions: item.options.map(option => `${option.id}: ${option.rationale}`),
    answerValue: response.selectedOptionId,
    answerLabel: `${response.selectedOptionId} · ${selectedOption?.rationale || '未知选项'}${response.isCorrect ? '（正确）' : `（未命中；正确为 ${response.correctOptionId} · ${correctOption?.rationale || ''}）`}`,
    cachedAt: response.answeredAt || result.completedAt,
    answeredAt: response.answeredAt || result.completedAt,
  };
}

function mergeSnapshots(
  snapshots: QuestionPresentationSnapshot[],
  next: QuestionPresentationSnapshot | null,
): void {
  if (!next) return;
  if (snapshots.some(snapshot => snapshot.id === next.id)) return;
  snapshots.push(next);
}

export function buildQuestionTraceSnapshots(input: BuildQuestionTraceInput): QuestionPresentationSnapshot[] {
  const snapshots = Object.values(input.storedSnapshots)
    .filter(snapshot => Boolean(snapshot.answerLabel || snapshot.answerValue != null));

  if (input.humanMapMode && input.humanMapMode !== 'skip') {
    const flow = getHumanMapQuestionFlow(
      input.humanMapMode,
      input.humanMapAnswers,
      input.humanMapAIQuestions,
    );
    for (const question of flow) {
      const answer = input.humanMapAnswers[question.id]?.trim();
      if (!answer) continue;
      mergeSnapshots(snapshots, humanMapSnapshot(question, answer, input.humanMapBlueprint));
    }
  }

  for (const [moduleId, moduleAnswers] of Object.entries(input.answers)) {
    const module = allModules.find(item => item.id === moduleId);
    if (!module) continue;
    for (const [questionId, answer] of Object.entries(moduleAnswers)) {
      const question = module.questions.find(item => item.id === questionId);
      if (!question) continue;
      mergeSnapshots(snapshots, questionnaireSnapshot(moduleId, question, answer, input.humanMapBlueprint));
    }
  }

  for (const [dimensionId, responses] of Object.entries(input.catResponses)) {
    for (const response of responses) {
      mergeSnapshots(snapshots, catSnapshot(dimensionId, response, input.humanMapBlueprint));
    }
  }

  for (const result of input.matrixResults) {
    for (const response of result.responses) {
      mergeSnapshots(snapshots, matrixSnapshot(result, response));
    }
  }

  return snapshots.sort((left, right) => {
    const leftTime = new Date(left.answeredAt || left.cachedAt).getTime();
    const rightTime = new Date(right.answeredAt || right.cachedAt).getTime();
    return rightTime - leftTime;
  });
}
