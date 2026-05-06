import type { CATOpenResponseScore } from '../types';

const FLEXIBILITY_KEYWORDS: Array<[string, string[]]> = [
  ['tool', ['工具', '固定', '支撑', '撬', '量', '挡', '挂', '夹', '搅拌', '清洁']],
  ['art', ['画', '装置', '雕塑', '舞台', '摄影', '影子', '纹理', '拼贴', '设计']],
  ['social', ['游戏', '教学', '表演', '礼物', '沟通', '仪式', '互动', '故事']],
  ['survival', ['急救', '避雨', '防身', '求救', '野外', '临时', '保护', '过滤']],
  ['system', ['分类', '流程', '标记', '提醒', '管理', '记录', '模板', '实验']],
];

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

function splitIdeas(text: string): string[] {
  return unique(
    text
      .replace(/\r/g, '\n')
      .split(/[\n,，;；、。.!！?？]+/)
      .map(part => part.replace(/^\d+[.)、]\s*/, '').trim())
      .filter(part => part.length >= 2)
      .filter(part => !/^(不知道|不清楚|没有|随便|都行|想不到|不会)$/.test(part)),
  );
}

function countFlexibility(ideas: string[]): { count: number; tags: string[] } {
  const tags = new Set<string>();
  for (const idea of ideas) {
    for (const [tag, keywords] of FLEXIBILITY_KEYWORDS) {
      if (keywords.some(keyword => idea.includes(keyword))) tags.add(tag);
    }
  }
  return { count: tags.size, tags: Array.from(tags) };
}

function originalityScore(ideas: string[]): number {
  let score = 0;
  for (const idea of ideas) {
    const hasMetaphor = /像|变成|作为|替代|模拟|隐喻|象征/.test(idea);
    const hasConstraint = /临时|组合|反向|拆开|折叠|透明|声音|影子|气味|记忆/.test(idea);
    if (idea.length >= 18) score += 1;
    if (hasMetaphor) score += 1;
    if (hasConstraint) score += 1;
  }
  return score;
}

export function scoreCreativeOpenResponse(text: string): CATOpenResponseScore {
  const trimmed = text.trim();
  const ideas = splitIdeas(trimmed);
  const flexibility = countFlexibility(ideas);
  const originality = originalityScore(ideas);
  const elaboration = ideas.filter(idea => idea.length >= 14).length;
  const total = ideas.length * 1.2 + flexibility.count * 1.4 + originality * 0.7 + elaboration * 0.5;
  const category = total >= 15 ? 3 : total >= 9 ? 2 : total >= 4 ? 1 : 0;

  return {
    text: trimmed,
    fluency: ideas.length,
    flexibility: flexibility.count,
    originalityProxy: originality,
    elaboration,
    category,
    notes: [
      `识别到 ${ideas.length} 个可分辨用途`,
      flexibility.tags.length > 0 ? `覆盖 ${flexibility.tags.length} 类用途策略：${flexibility.tags.join(', ')}` : '用途策略类别较少',
      'AUT 开放题为启发式评分，正式解释仍需人工或模型复核',
    ],
  };
}
