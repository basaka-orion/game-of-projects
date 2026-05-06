import type {
  MatrixCell,
  MatrixOption,
  MatrixReasoningItem,
  MatrixResponse,
  MatrixRuleBreakdown,
  MatrixRuleFamily,
  MatrixSessionResult,
} from '../types';

export const MATRIX_LAB_VERSION = 'original-matrix-reasoning-v1';

type CellFactory = (row: number, col: number) => MatrixCell;

const SHAPES: MatrixCell['shape'][] = ['circle', 'triangle', 'square', 'diamond'];
const FILLS: MatrixCell['fill'][] = ['outline', 'solid', 'striped'];
const ACCENTS: MatrixCell['accent'][] = ['cyan', 'violet', 'gold', 'rose'];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cellKey(cell: MatrixCell): string {
  return `${cell.shape}:${cell.count}:${cell.rotation}:${cell.fill}:${cell.accent}`;
}

function cell(shape: MatrixCell['shape'], count: number, rotation: number, fill: MatrixCell['fill'], accent: MatrixCell['accent']): MatrixCell {
  return {
    shape,
    count: clamp(Math.round(count), 1, 4),
    rotation: ((Math.round(rotation / 45) * 45) % 360 + 360) % 360,
    fill,
    accent,
  };
}

function rotateList<T>(values: T[], offset: number): T {
  return values[((offset % values.length) + values.length) % values.length];
}

function seededOrder<T>(values: T[], seed: number): T[] {
  return [...values]
    .map((value, index) => ({
      value,
      rank: ((seed + 31) * (index + 7) * 17) % 97,
    }))
    .sort((left, right) => left.rank - right.rank)
    .map(item => item.value);
}

function makeOptions(
  itemId: string,
  correct: MatrixCell,
  distractors: MatrixCell[],
  seed: number,
): { options: MatrixOption[]; correctOptionId: string } {
  const seen = new Set<string>();
  const pool: Array<{ cell: MatrixCell; rationale: string; correct?: boolean }> = [
    { cell: correct, rationale: '同时满足行列规则', correct: true },
    ...distractors.map((candidate, index) => ({
      cell: candidate,
      rationale: `干扰项 ${index + 1}：只满足部分规则`,
    })),
  ];

  let supplement = 0;
  while (pool.length < 7) {
    pool.push({
      cell: cell(
        rotateList(SHAPES, seed + supplement),
        1 + ((seed + supplement) % 4),
        45 * ((seed + supplement) % 8),
        rotateList(FILLS, seed + supplement),
        rotateList(ACCENTS, seed + supplement + 1),
      ),
      rationale: '补充干扰项：控制单一属性相似度',
    });
    supplement += 1;
  }

  const uniquePool = pool.filter((entry) => {
    const key = cellKey(entry.cell);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const firstSix = seededOrder(uniquePool, seed).slice(0, 6);
  if (!firstSix.some(option => option.correct)) {
    firstSix[firstSix.length - 1] = uniquePool.find(option => option.correct) || firstSix[firstSix.length - 1];
  }

  const options = firstSix.map((entry, index) => ({
    id: `${itemId}-o${index + 1}`,
    cell: entry.cell,
    rationale: entry.rationale,
  }));
  const correctIndex = firstSix.findIndex(option => option.correct);
  return {
    options,
    correctOptionId: options[Math.max(0, correctIndex)]?.id || options[0].id,
  };
}

function buildItem(params: {
  id: string;
  family: MatrixRuleFamily;
  difficulty: MatrixReasoningItem['difficulty'];
  prompt: string;
  ruleDsl: string;
  factory: CellFactory;
  distractors: MatrixCell[];
  notes: string[];
}): MatrixReasoningItem {
  const matrix = Array.from({ length: 9 }, (_, index) => {
    const row = Math.floor(index / 3);
    const col = index % 3;
    return index === 8 ? null : params.factory(row, col);
  });
  const correct = params.factory(2, 2);
  const { options, correctOptionId } = makeOptions(params.id, correct, params.distractors, params.id.length * 13 + params.difficulty * 11);

  return {
    id: params.id,
    version: MATRIX_LAB_VERSION,
    family: params.family,
    difficulty: params.difficulty,
    prompt: params.prompt,
    ruleDsl: params.ruleDsl,
    matrix,
    options,
    correctOptionId,
    sourceType: 'original',
    measurementNotes: [
      ...params.notes,
      'Openbasaka 原创矩阵规则题，不复制 Raven APM 或其它受版权保护测验原题。',
    ],
  };
}

export function getMatrixReasoningItems(): MatrixReasoningItem[] {
  return [
    buildItem({
      id: 'omr-progression-01',
      family: 'progression',
      difficulty: 1,
      prompt: '找出右下角缺失图形。观察每一行的数量推进。',
      ruleDsl: 'grid[3x3].count=(row+col)%3+1; shape=circle; fill=row_parity; rotation=col*45',
      factory: (row, col) => cell('circle', ((row + col) % 3) + 1, col * 45, row % 2 === 0 ? 'outline' : 'solid', 'cyan'),
      distractors: [
        cell('circle', 1, 90, 'outline', 'cyan'),
        cell('circle', 3, 90, 'outline', 'cyan'),
        cell('circle', 2, 45, 'solid', 'cyan'),
        cell('triangle', 2, 90, 'outline', 'cyan'),
        cell('circle', 2, 180, 'striped', 'cyan'),
      ],
      notes: ['单一数量递进，作为校准题；不对应任何 Raven APM 原题。'],
    }),
    buildItem({
      id: 'omr-rotation-02',
      family: 'rotation',
      difficulty: 2,
      prompt: '三角形在行列间按固定角度旋转，同时填充随行变化。',
      ruleDsl: 'rotation=(row*90+col*45)%360; shape=triangle; count=2+row%2; fill=cycle(row)',
      factory: (row, col) => cell('triangle', 2 + (row % 2), row * 90 + col * 45, rotateList(FILLS, row), 'violet'),
      distractors: [
        cell('triangle', 2, 180, 'striped', 'violet'),
        cell('triangle', 3, 180, 'outline', 'violet'),
        cell('triangle', 2, 135, 'striped', 'violet'),
        cell('square', 2, 180, 'striped', 'violet'),
        cell('triangle', 4, 225, 'solid', 'violet'),
      ],
      notes: ['旋转与行填充双规则，记录反应时以区分速度与准确性。'],
    }),
    buildItem({
      id: 'omr-count-03',
      family: 'count',
      difficulty: 3,
      prompt: '每一行的第三格由前两格的数量关系压缩得到。',
      ruleDsl: 'count[*,2]=abs(count[*,0]-count[*,1])+1; shape=cycle(row+col); fill=solid_if_col2',
      factory: (row, col) => {
        const base = [3, 1, 4][row];
        const delta = [1, 3, 2][row];
        const count = col === 0 ? base : col === 1 ? delta : Math.abs(base - delta) + 1;
        return cell(rotateList(SHAPES, row + col), count, row * 45, col === 2 ? 'solid' : 'outline', 'gold');
      },
      distractors: [
        cell('circle', 1, 90, 'solid', 'gold'),
        cell('diamond', 2, 90, 'outline', 'gold'),
        cell('circle', 4, 90, 'solid', 'gold'),
        cell('circle', 3, 45, 'solid', 'gold'),
        cell('square', 1, 90, 'solid', 'gold'),
      ],
      notes: ['原创数量变换题，难点是同时保留形状循环线索。'],
    }),
    buildItem({
      id: 'omr-overlay-04',
      family: 'overlay',
      difficulty: 4,
      prompt: '第三列像是前两列信息叠加后的稳定摘要。',
      ruleDsl: 'col2.shape=shape(row+2); col2.count=max(col0,col1)-1; fill=overlay(fill0,fill1)',
      factory: (row, col) => {
        if (col === 0) return cell(rotateList(SHAPES, row), row + 2, row * 45, 'outline', 'rose');
        if (col === 1) return cell(rotateList(SHAPES, row + 1), 4 - row, row * 45 + 45, 'striped', 'rose');
        return cell(rotateList(SHAPES, row + 2), Math.max(row + 2, 4 - row) - 1, row * 45 + 90, 'solid', 'rose');
      },
      distractors: [
        cell('circle', 2, 180, 'solid', 'rose'),
        cell('diamond', 3, 180, 'striped', 'rose'),
        cell('circle', 4, 135, 'solid', 'rose'),
        cell('triangle', 2, 180, 'outline', 'rose'),
        cell('circle', 3, 225, 'solid', 'gold'),
      ],
      notes: ['叠加摘要规则用于观察复合线索保持能力。'],
    }),
    buildItem({
      id: 'omr-distribution-05',
      family: 'distribution',
      difficulty: 4,
      prompt: '每一行和每一列都要保持形状、填充和颜色各出现一次的分布约束。',
      ruleDsl: 'latin_square(shape,fill,accent); count=row+1; rotation=(row+col)*45',
      factory: (row, col) => cell(
        rotateList(['circle', 'triangle', 'square'], row + col),
        row + 1,
        (row + col) * 45,
        rotateList(FILLS, row + col),
        rotateList(['cyan', 'violet', 'gold'], row + col),
      ),
      distractors: [
        cell('triangle', 3, 180, 'striped', 'gold'),
        cell('square', 2, 180, 'solid', 'violet'),
        cell('circle', 3, 135, 'solid', 'cyan'),
        cell('square', 3, 225, 'outline', 'gold'),
        cell('circle', 4, 180, 'striped', 'rose'),
      ],
      notes: ['分布约束题，主要看能否同时检查行列唯一性。'],
    }),
    buildItem({
      id: 'omr-compound-06',
      family: 'compound',
      difficulty: 5,
      prompt: '综合判断：形状沿对角线循环，数量由行列共同决定，填充与旋转形成交叉线索。',
      ruleDsl: 'shape=(row*2+col)%4; count=((row*2+col)%4)+1; fill=cycle(row-col); rotation=(row*90-col*45)',
      factory: (row, col) => cell(
        rotateList(SHAPES, row * 2 + col),
        ((row * 2 + col) % 4) + 1,
        row * 90 - col * 45,
        rotateList(FILLS, row - col),
        rotateList(ACCENTS, row + col),
      ),
      distractors: [
        cell('circle', 2, 90, 'outline', 'rose'),
        cell('circle', 3, 90, 'solid', 'rose'),
        cell('triangle', 2, 90, 'outline', 'gold'),
        cell('circle', 2, 135, 'striped', 'rose'),
        cell('diamond', 2, 90, 'outline', 'rose'),
      ],
      notes: ['短测最高难题，只能作为探索性推理证据，不可解释为正式 IQ。'],
    }),
  ];
}

function wilsonInterval(correct: number, total: number): [number, number] {
  if (total <= 0) return [0, 0];
  const z = 1.96;
  const phat = correct / total;
  const denom = 1 + (z * z) / total;
  const centre = phat + (z * z) / (2 * total);
  const margin = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * total)) / total);
  return [
    Number(clamp((centre - margin) / denom, 0, 1).toFixed(2)),
    Number(clamp((centre + margin) / denom, 0, 1).toFixed(2)),
  ];
}

export function scoreMatrixSession(
  responses: MatrixResponse[],
  items: MatrixReasoningItem[] = getMatrixReasoningItems(),
  now = new Date().toISOString(),
): MatrixSessionResult {
  const itemById = new Map(items.map(item => [item.id, item]));
  const validResponses = responses.filter(response => itemById.has(response.itemId));
  const rawScore = validResponses.filter(response => response.isCorrect).length;
  const maxScore = items.length;
  const totalDifficulty = items.reduce((sum, item) => sum + item.difficulty, 0);
  const earnedDifficulty = validResponses.reduce((sum, response) => {
    const item = itemById.get(response.itemId);
    return sum + (response.isCorrect ? item?.difficulty || 0 : 0);
  }, 0);
  const meanResponseTimeMs = validResponses.length > 0
    ? Math.round(validResponses.reduce((sum, response) => sum + response.responseTimeMs, 0) / validResponses.length)
    : 0;

  const families = Array.from(new Set(items.map(item => item.family)));
  const ruleBreakdown: MatrixRuleBreakdown[] = families.map((family) => {
    const familyItems = items.filter(item => item.family === family);
    const familyResponses = validResponses.filter(response => familyItems.some(item => item.id === response.itemId));
    return {
      family,
      attempted: familyResponses.length,
      correct: familyResponses.filter(response => response.isCorrect).length,
      meanResponseTimeMs: familyResponses.length > 0
        ? Math.round(familyResponses.reduce((sum, response) => sum + response.responseTimeMs, 0) / familyResponses.length)
        : 0,
    };
  });

  const attemptedRatio = validResponses.length / Math.max(items.length, 1);
  const accuracy = maxScore > 0 ? rawScore / maxScore : 0;
  const reliabilityEstimate = Number(clamp(
    0.46 + attemptedRatio * 0.2 + Math.min(items.length, 10) * 0.018 + (ruleBreakdown.length >= 4 ? 0.08 : 0),
    0.42,
    0.82,
  ).toFixed(2));

  return {
    id: `matrix-${Date.now()}`,
    version: MATRIX_LAB_VERSION,
    itemIds: items.map(item => item.id),
    responses: validResponses,
    accuracy: Number(accuracy.toFixed(2)),
    rawScore,
    maxScore,
    meanResponseTimeMs,
    difficultyWeightedScore: Number(((earnedDifficulty / Math.max(totalDifficulty, 1)) * 100).toFixed(1)),
    confidenceInterval: wilsonInterval(rawScore, maxScore),
    reliabilityEstimate,
    ruleBreakdown,
    pendingVerification: [
      '当前为原创短测探索版，样本量不足，不能换算 Raven APM 或 IQ 分数。',
      '需要后续积累常模样本、重测信度和题目参数后，才能提供更稳定的百分位解释。',
    ],
    measurementNotes: [
      '题目由 Openbasaka 原创规则 DSL 生成，不复制 Pearson Raven APM 原题。',
      '本实验记录正确率、规则族表现、难度加权分和反应时，用于补充流体推理画像。',
      '解释时必须和 Human Map、CAT、行为实验、对话证据一起融合，不能单点高风险判断。',
    ],
    completedAt: now,
  };
}
