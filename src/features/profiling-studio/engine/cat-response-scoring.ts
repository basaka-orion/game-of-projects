import type { Question } from '../types';
import type { IRTItemParams } from './irt';

export function scoreCATOption(
  question: Question | null,
  item: IRTItemParams,
  value: string | number,
): number {
  const selected = String(value);
  const correct = question?.correct || question?.correctOption || question?.correctSide;

  if (correct) {
    return selected === String(correct) ? 1 : 0;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;

  if (item.b.length <= 1) {
    return numeric > 0 ? 1 : 0;
  }

  return Math.max(0, Math.min(item.b.length, Math.round(numeric) - 1));
}

export function labelCATOption(question: Question | null, value: string | number): string {
  const selected = String(value);
  const option = question?.options?.find(item => String(item.value) === selected);
  if (option) return option.label;

  if (question?.choiceOptions?.length) {
    const choice = question.choiceOptions.find(item => item.startsWith(`${selected}.`));
    if (choice) return choice;
  }

  return selected;
}
