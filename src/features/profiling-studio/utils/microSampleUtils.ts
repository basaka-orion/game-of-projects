/**
 * 微采样工具函数
 */
import { microSamplePresets } from '../data/microSamplePresets';
import type { MicroSampleQuestion } from '../types';

const DEFAULT_PRESET_KEY = 'emotion_regulation';

/**
 * 根据用户画像中的高优先级子维度 ID 列表，选择今日的微采样题目。
 *
 * 当前逻辑（简单版本）：
 * 1. 遍历 topDimensionIds，找到第一个命中 preset key 的维度
 * 2. 如果都没命中，fallback 到 emotion_regulation
 *
 * TODO: 后续可扩展为更智能的选择算法：
 * - 基于用户历史作答频率轮换模板（避免连续多天相同模板）
 * - 根据画像分数动态加权（高风险维度更频繁出现）
 * - 引入随机性 + 最近 N 天去重
 * - 支持自定义模板优先级排序
 */
export function pickTodayMicroSampleQuestions(
  topDimensionIds: string[],
): MicroSampleQuestion[] {
  const availableKeys = Object.keys(microSamplePresets);

  for (const dimId of topDimensionIds) {
    if (availableKeys.includes(dimId)) {
      return microSamplePresets[dimId];
    }
  }

  // 无命中，使用默认模板
  return microSamplePresets[DEFAULT_PRESET_KEY];
}

/**
 * 获取今天的日期字符串（本地时区）
 */
export function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
