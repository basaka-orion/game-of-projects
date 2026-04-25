/**
 * 锚定量表题目 (Anchor Scale Items)
 *
 * 经过大量实证验证的经典心理量表原题,
 * 嵌入系统中用于聚合效度 (convergent validity) 验证
 *
 * 规则:
 *   ① 这些题的分数 **不参与** 系统正常评分和画像生成
 *   ② 使用 `isAnchor: true` 标记, 评分引擎自动跳过
 *   ③ 数据采集服务会单独记录这些题的作答
 *
 * 量表来源:
 *   BFI-10 (Big Five Inventory 10-item) — Rammstedt & John, 2007
 *   PHQ-2 (Patient Health Questionnaire 2) — Kroenke et al., 2003
 *   BMPN (Balanced Measure of Psychological Needs) — Sheldon & Hilpert, 2012
 */

import type { Question } from '../types';

// 扩展 Question 加 anchor 标记
export type AnchorQuestion = Question & {
  isAnchor: true;
  anchorScale: string;
  anchorSubScale: string;
};

// ─── 通用构建器 ───
function anchor(
  id: string, text: string, dimension: string, subDimension: string,
  anchorScale: string, anchorSubScale: string, reverse: boolean,
  anchors: { range: [number, number]; tag: string; label: string; color: string }[],
): AnchorQuestion {
  return {
    id, text, type: 'dynamic_slider', dimension, subDimension,
    scaleRef: anchorScale, reverse,
    sourceType: 'adapted_open',
    // 需要 options 数组(≥3)才能触发 dynamic_slider 分支
    options: [
      { value: 0, label: anchors[0]?.tag || '' },
      { value: 33, label: anchors[1]?.tag || '' },
      { value: 66, label: anchors[2]?.tag || '' },
      { value: 100, label: anchors[3]?.tag || '' },
    ],
    sliderAnchors: anchors,
    isAnchor: true, anchorScale, anchorSubScale,
  };
}

// ═══════════════════════════════════════════
// BFI-10: 10 题, 每维 2 题 (1正1反)
// ═══════════════════════════════════════════

const AGREE_ANCHORS = (positiveWord: string, negativeWord: string) => [
  { range: [0, 20] as [number, number], tag: '强烈不同意', label: negativeWord, color: '#64B5F6' },
  { range: [21, 45] as [number, number], tag: '不太同意', label: '偶尔如此但不典型', color: '#90A4AE' },
  { range: [46, 65] as [number, number], tag: '中立', label: '说不好，看情况', color: '#B0BEC5' },
  { range: [66, 85] as [number, number], tag: '比较同意', label: '大部分时候是这样', color: '#FFB74D' },
  { range: [86, 100] as [number, number], tag: '非常同意', label: positiveWord, color: '#FF7043' },
];

export const BFI10_ANCHORS: AnchorQuestion[] = [
  anchor('anchor_bfi_e1', '我觉得自己是一个外向的、喜欢社交的人。',
    'personality', 'extraversion', 'BFI-10', 'extraversion', false,
    AGREE_ANCHORS('社交是我的能量来源', '我一点也不外向')),
  anchor('anchor_bfi_e2', '我觉得自己是一个内敛的、安静的人。',
    'personality', 'extraversion', 'BFI-10', 'extraversion', true,
    AGREE_ANCHORS('确实很安静内向', '我一点也不内敛')),
  anchor('anchor_bfi_a1', '我通常信任别人，觉得大多数人本性善良。',
    'personality', 'agreeableness', 'BFI-10', 'agreeableness', false,
    AGREE_ANCHORS('天生信任他人', '我信任度很低')),
  anchor('anchor_bfi_a2', '我有时候对别人会比较挑剔和苛刻。',
    'personality', 'agreeableness', 'BFI-10', 'agreeableness', true,
    AGREE_ANCHORS('标准确实很高', '几乎从不挑剔')),
  anchor('anchor_bfi_c1', '我做事一般都很彻底，不喜欢半途而废。',
    'personality', 'conscientiousness', 'BFI-10', 'conscientiousness', false,
    AGREE_ANCHORS('不做完绝不罢休', '经常虎头蛇尾')),
  anchor('anchor_bfi_c2', '我有时会比较懒散，不太自律。',
    'personality', 'conscientiousness', 'BFI-10', 'conscientiousness', true,
    AGREE_ANCHORS('拖延症晚期', '我很自律')),
  anchor('anchor_bfi_n1', '我容易感到紧张和焦虑。',
    'emotion', 'self_emotion', 'BFI-10', 'neuroticism', false,
    AGREE_ANCHORS('焦虑是我的日常', '情绪非常稳定')),
  anchor('anchor_bfi_n2', '我情绪稳定，不容易心烦意乱。',
    'emotion', 'emotion_regulation', 'BFI-10', 'neuroticism', true,
    AGREE_ANCHORS('很少被情绪影响', '我很容易心烦')),
  anchor('anchor_bfi_o1', '我想象力丰富，喜欢探索新事物和新想法。',
    'aesthetic', 'creative_self', 'BFI-10', 'openness', false,
    AGREE_ANCHORS('脑子里永远有新点子', '偏好务实和确定')),
  anchor('anchor_bfi_o2', '我对艺术和审美方面没什么兴趣。',
    'aesthetic', 'aesthetic_sensitivity', 'BFI-10', 'openness', true,
    AGREE_ANCHORS('艺术跟我没关系', '我超爱艺术和美')),
];

// ═══════════════════════════════════════════
// PHQ-2: 2 题 (抑郁筛查)
// ═══════════════════════════════════════════

const PHQ_ANCHORS = (noneLabel: string, dailyLabel: string) => [
  { range: [0, 15] as [number, number], tag: '完全没有', label: noneLabel, color: '#66BB6A' },
  { range: [16, 40] as [number, number], tag: '偶尔几天', label: '有那么一两天不太对', color: '#90A4AE' },
  { range: [41, 65] as [number, number], tag: '差不多一半时间', label: '确实有所下降', color: '#FFA726' },
  { range: [66, 100] as [number, number], tag: '几乎每天', label: dailyLabel, color: '#EF5350' },
];

export const PHQ2_ANCHORS: AnchorQuestion[] = [
  anchor('anchor_phq_1', '在过去两周里，你是否经常觉得做什么事情都提不起兴趣或乐趣？',
    'emotion', 'meta_mood', 'PHQ-2', 'depression_screen', false,
    PHQ_ANCHORS('这两周状态挺好', '很难提起兴致做事')),
  anchor('anchor_phq_2', '在过去两周里，你是否经常感到心情低落、沮丧或绝望？',
    'emotion', 'meta_mood', 'PHQ-2', 'depression_screen', false,
    PHQ_ANCHORS('心情一直不错', '被低迷感笼罩')),
];

// ═══════════════════════════════════════════
// BMPN-6: 6 题 (自主/胜任/归属)
// ═══════════════════════════════════════════

export const BMPN_ANCHORS: AnchorQuestion[] = [
  anchor('anchor_bmpn_a1', '在日常生活中，我感觉自己可以自由地做出选择和决定。',
    'motivation', 'autonomy', 'BMPN', 'autonomy', false,
    AGREE_ANCHORS('我的生活我做主', '感觉处处被约束')),
  anchor('anchor_bmpn_a2', '我经常感觉不得不做很多我并不真正想做的事。',
    'motivation', 'autonomy', 'BMPN', 'autonomy', true,
    AGREE_ANCHORS('大部分事都是被迫的', '很少被迫做事')),
  anchor('anchor_bmpn_c1', '我觉得自己有能力把事情做好。',
    'motivation', 'competence', 'BMPN', 'competence', false,
    AGREE_ANCHORS('对自己能力很有信心', '经常觉得自己不行')),
  anchor('anchor_bmpn_c2', '我经常怀疑自己能不能把重要的事情做好。',
    'motivation', 'competence', 'BMPN', 'competence', true,
    AGREE_ANCHORS('时刻都在自我质疑', '我很少怀疑自己')),
  anchor('anchor_bmpn_r1', '我觉得身边有真正关心我的人，我和他们的关系很亲密。',
    'social', 'social_connectedness', 'BMPN', 'relatedness', false,
    AGREE_ANCHORS('被爱包围的感觉', '感觉很孤立')),
  anchor('anchor_bmpn_r2', '我经常感到孤独，缺少知心的人。',
    'social', 'social_connectedness', 'BMPN', 'relatedness', true,
    AGREE_ANCHORS('深深的孤独是日常', '不孤独，有伴')),
];

// ═══════════════════════════════════════════
// 按维度分组的锚定题 (供 questions.ts 注入用)
// ═══════════════════════════════════════════

const ALL = [...BFI10_ANCHORS, ...PHQ2_ANCHORS, ...BMPN_ANCHORS];

export function getAnchorsForDimension(dimensionId: string): AnchorQuestion[] {
  return ALL.filter(q => q.dimension === dimensionId);
}

export const ALL_ANCHOR_ITEMS = ALL;
