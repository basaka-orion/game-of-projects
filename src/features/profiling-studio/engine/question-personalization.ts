import { HUMAN_MAP_SIGNAL_LABELS } from '../data/human-map';
import { DIMENSION_MAP } from '../data/dimensions';
import type { HumanMapBlueprint, PersonalizedDimensionPlan, Question } from '../types';

export interface PersonalizedQuestionPresentation {
  rewrittenText: string;
  scenePrompt: string;
  whyAsked: string;
  swingHint: string;
  optionInstruction: string;
  optionLead?: string;
  rewrittenChoiceOptions?: string[];
  rewrittenOptions?: Array<{ value: number | string; label: string }>;
  rewrittenPlaceholder?: string;
  rewrittenSliderAnchors?: Array<{
    range: [number, number];
    tag?: string;
    label: string;
    color: string;
  }>;
}

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function topSignalText(blueprint: HumanMapBlueprint, plan: PersonalizedDimensionPlan | null): string {
  const signalIds = plan?.focusSignals?.length ? plan.focusSignals : blueprint.signalScores.slice(0, 2).map((signal) => signal.id);
  return signalIds
    .map((signalId) => HUMAN_MAP_SIGNAL_LABELS[signalId])
    .filter(Boolean)
    .join('、');
}

function buildSceneLead(
  dimensionId: string,
  blueprint: HumanMapBlueprint,
): string {
  const focus = blueprint.currentFocus;

  switch (dimensionId) {
    case 'cognitive':
      return `把自己代入最近一次你在处理「${focus}」时，必须做判断、拆解或取舍的那一刻。`;
    case 'personality':
      return `想最近 30 天里最常出现的你，尤其是你没有刻意表演、最自然流露出来的那一面。`;
    case 'emotion':
      return `回到最近一次你情绪最明显被牵动的真实场景里，再回答这题。`;
    case 'motivation':
      return `请代入你最近在推进「${focus}」时，真正会让你启动或放弃的那个瞬间。`;
    case 'social':
      return `请想一段最近真的发生过的人际摩擦、靠近或边界拉扯场景。`;
    case 'aesthetic':
      return `把自己放进最近一次你明显感到“有灵感”或“完全没感觉”的表达场景里。`;
    case 'worldview':
      return `请代入你最近对方向、意义或“自己到底要成为什么人”最有感的时刻。`;
    case 'strengths':
      return `想一想最近一次你明显比平时更有力量、也更像自己的时刻。`;
    default:
      return `请代入最近一个与你当前主线「${focus}」最相关的真实场景。`;
  }
}

function buildSwingHint(question: Question, dimensionId: string): string {
  if (question.type === 'single_choice' || question.type === 'single' || question.type === 'sjt') {
    switch (dimensionId) {
      case 'cognitive':
        return '如果你在两个选项间摇摆，优先选你在时间紧、压力大时最自然会走的判断路径。';
      case 'social':
        return '摇摆时不要选“更成熟”的那个，选你受伤或被触发时最常出现的动作。';
      case 'motivation':
        return '如果想选“应该选”的答案，先停一下，回忆你最近三次真实是怎么做的。';
      default:
        return '选那个“不用刻意提醒自己，也会自然发生”的答案，而不是最好看的答案。';
    }
  }

  if (question.type === 'likert5' || question.type === 'dynamic_slider') {
    return '评分前先想最近三次类似情境，按出现频率作答，不按一次极端状态作答。';
  }

  if (question.type === 'open') {
    return '先写最近一次具体例子，再写你从那次里反复出现的模式。';
  }

  return '优先选最常发生的一边，而不是你希望自己成为的一边。';
}

function buildOptionInstruction(question: Question): string {
  if (question.type === 'single_choice' || question.type === 'single' || question.type === 'sjt') {
    return '把每个选项都当成“不同版本的你最近会做的动作”，不要只按字面选最正确的。';
  }
  if (question.type === 'likert5' || question.type === 'dynamic_slider') {
    return '滑动前先想最近三次类似场景，再按平均状态而不是单次高光来定位。';
  }
  if (question.type === 'visual_pair_choice') {
    return '别想哪张更“高级”，选你第一眼更自然靠近、且更像你的那一边。';
  }
  return '作答时优先回忆真实动作和频率，再决定答案。';
}

function buildOptionLead(question: Question, blueprint: HumanMapBlueprint): string | undefined {
  if (question.type === 'single_choice') {
    return `这题先别急着选“最聪明”的答案。请把自己放回现在这段节奏里，看看你更自然会启动哪种推理路径。`;
  }
  if (question.type === 'single' || question.type === 'sjt') {
    return `下面这些不是抽象人设，而是你在处理「${blueprint.currentFocus}」这类场景时，最可能自然做出的动作。`;
  }
  if (question.type === 'dynamic_slider' || question.type === 'likert5') {
    return `请沿着滑块回想你最近三次类似场景，再把自己放在最常出现的位置。`;
  }
  if (question.type === 'open') {
    return `先写一个具体场景，再写它为什么反复代表你当前这阶段。`;
  }
  return undefined;
}

function rewriteBehaviorOptionLabel(
  label: string,
  question: Question,
  blueprint: HumanMapBlueprint,
): string {
  const normalized = clean(label);
  if (!normalized) return label;
  if (question.type !== 'single' && question.type !== 'sjt') return normalized;

  if (/^(立刻|直接|主动|先|会|毫不犹豫|兴奋|可以|倾向|笑着|完全|绝对)/.test(normalized)) {
    return `最近的你更可能会：${normalized}`;
  }
  if (/^(有点|有些|犹豫|看看|勉强|拍个照|放一放|先观察)/.test(normalized)) {
    return `最近的你偶尔会：${normalized}`;
  }
  if (/^(不|没|不会|不太|算了|希望能|婉拒|放下)/.test(normalized)) {
    return `最近的你更容易：${normalized}`;
  }

  return `放回「${blueprint.currentFocus}」这条主线里，你更像：${normalized}`;
}

function rewriteChoiceOptionLabel(
  label: string,
  question: Question,
): string {
  const normalized = clean(label);
  if (!normalized) return label;
  if (question.type !== 'single_choice') return normalized;
  return normalized;
}

function buildRewrittenPlaceholder(
  question: Question,
  blueprint: HumanMapBlueprint,
): string | undefined {
  if (question.type !== 'open') return undefined;
  return `例如：最近一次我在处理「${blueprint.currentFocus}」时，最先出现的是……这很像我现在「${blueprint.lifeStage}」阶段的模式，因为……`;
}

function buildSliderAnchors(
  question: Question,
  blueprint: HumanMapBlueprint,
): PersonalizedQuestionPresentation['rewrittenSliderAnchors'] | undefined {
  if (question.type !== 'likert5' && question.type !== 'dynamic_slider') return undefined;

  const focus = blueprint.currentFocus;
  const stage = blueprint.lifeStage;
  const palettes = question.type === 'likert5'
    ? ['#FF6B6B', '#FFB74D', '#B0BEC5', '#81C784', '#64FFDA']
    : ['#64B5F6', '#B0BEC5', '#FFB74D', '#FF6B6B'];
  const ranges = question.type === 'likert5'
    ? [[0, 20], [21, 40], [41, 60], [61, 80], [81, 100]] as Array<[number, number]>
    : [[0, 20], [21, 60], [61, 89], [90, 100]] as Array<[number, number]>;

  const dimensionAnchorMap: Record<string, Array<{ tag: string; label: string }>> = {
    cognitive: question.type === 'likert5'
      ? [
          { tag: '几乎不像你', label: `在处理「${focus}」时，这种思路很少自动出现。` },
          { tag: '偶尔会这样', label: `你偶尔会这么想，但还不是现在的默认推理路径。` },
          { tag: '两边摇摆', label: `在「${stage}」这阶段，你会看情境决定要不要这样判断。` },
          { tag: '经常这样', label: `最近的你在处理复杂问题时，已经常常会走这条推理路径。` },
          { tag: '几乎就是你', label: `这几乎就是你现在处理「${focus}」时最自然的大脑动作。` },
        ]
      : [
          { tag: '几乎不会这样', label: `这很少是你现在面对「${focus}」时的第一反应。` },
          { tag: '有时会这样', label: `在某些情境里你会这样，但还不稳定。` },
          { tag: '经常这样', label: `最近的你已经常常用这种方式去理解和拆解问题。` },
          { tag: '强烈就是这样', label: `这几乎是你当前阶段最稳定的认知路径。` },
        ],
    motivation: question.type === 'likert5'
      ? [
          { tag: '点不燃现在的你', label: `这类状态很难推动你去处理「${focus}」。` },
          { tag: '偶尔能推动', label: `有时能启动你，但持续性还不够。` },
          { tag: '看情境而定', label: `在「${stage}」这阶段，这股驱动力有时强有时弱。` },
          { tag: '经常会点燃你', label: `最近的你常常会被这种状态拉起来行动。` },
          { tag: '这就是你的发动机', label: `这几乎是你当前推进「${focus}」时最稳定的内驱力。` },
        ]
      : [
          { tag: '几乎无推动', label: `它很难真正把你往前推。` },
          { tag: '有一点推动', label: `它偶尔能拉你一把，但不算稳定。` },
          { tag: '会明显推动', label: `最近它已经是你推进「${focus}」的重要燃料。` },
          { tag: '强力牵引', label: `这几乎是你当前阶段最核心的行动引擎。` },
        ],
    emotion: question.type === 'likert5'
      ? [
          { tag: '几乎不会这样', label: `这种反应并不是你最近最常见的情绪模式。` },
          { tag: '偶尔会被碰到', label: `在某些触发点下会这样，但还不是主旋律。` },
          { tag: '中间地带', label: `你对这种情绪反应有些熟悉，但强度和频率都看场景。` },
          { tag: '最近经常这样', label: `这已经是你当前阶段比较常见的情绪走向。` },
          { tag: '非常贴近现在', label: `这几乎就是你最近被牵动时最真实的情绪轨迹。` },
        ]
      : [
          { tag: '几乎不被牵动', label: `它现在还不是你最主要的情绪反应。` },
          { tag: '有时会被牵动', label: `它会出现，但还没有强到主导你。` },
          { tag: '明显会被牵动', label: `最近它已经明显影响你的感受和判断。` },
          { tag: '高度贴近你', label: `这几乎就是你当前阶段最常出现的情绪模式。` },
        ],
    social: question.type === 'likert5'
      ? [
          { tag: '几乎不像你', label: `在关系里，你很少自然走到这一边。` },
          { tag: '偶尔会这样', label: `你在某些关系场景会这样，但并不稳定。` },
          { tag: '看人也看伤口', label: `你会根据关系亲疏和当时是否被触发来变化。` },
          { tag: '最近常这样', label: `这已经很接近你最近在关系里的自然动作。` },
          { tag: '就是你的关系习惯', label: `这几乎就是你当前关系模式的默认反应。` },
        ]
      : [
          { tag: '几乎不会这样', label: `这很少是你面对关系张力时的动作。` },
          { tag: '有时会这样', label: `在一些场景里你会这样，但未必总如此。` },
          { tag: '经常会这样', label: `最近你在关系里已经常常表现出这一面。` },
          { tag: '高度就是你', label: `这几乎就是你当前最自然的关系反应。` },
        ],
    aesthetic: question.type === 'likert5'
      ? [
          { tag: '几乎无感', label: `这种表达或审美张力很少真正触到现在的你。` },
          { tag: '偶尔有感', label: `你会被触动，但还没强到稳定拉动表达。` },
          { tag: '有时有火花', label: `在「${stage}」这阶段，它有时能带你进入状态。` },
          { tag: '最近很有感', label: `它已经越来越接近你最近会被点亮的审美区域。` },
          { tag: '强烈就是你', label: `这几乎就是你现在最容易被激活的表达与审美通道。` },
        ]
      : [
          { tag: '很难点亮你', label: `这种东西现在很难真正激发你的表达欲。` },
          { tag: '偶尔点亮', label: `它会触发你，但还不算稳定。` },
          { tag: '明显点亮', label: `最近它已经明显能把你带进表达状态。` },
          { tag: '核心点火源', label: `这几乎就是你当前最稳定的灵感点火源。` },
        ],
    worldview: question.type === 'likert5'
      ? [
          { tag: '离你较远', label: `这种意义感或价值取向还不是你现在的重心。` },
          { tag: '偶尔会想到', label: `你会碰到它，但还没有稳定把它活出来。` },
          { tag: '处在拉扯中', label: `在「${stage}」这阶段，你正在和这股方向感反复磨合。` },
          { tag: '最近越来越真', label: `这已经越来越接近你最近真实在意的方向。` },
          { tag: '非常贴近内核', label: `这几乎就是你当前理解自己与世界的核心坐标。` },
        ]
      : [
          { tag: '还不是核心', label: `它现在还不是最驱动你的意义坐标。` },
          { tag: '有一点牵引', label: `它会牵动你，但还没成为主轴。` },
          { tag: '明显在牵引', label: `最近它已经很明显地影响你的选择和判断。` },
          { tag: '核心坐标', label: `这几乎就是你当前阶段最稳定的意义与方向坐标。` },
        ],
    strengths: question.type === 'likert5'
      ? [
          { tag: '还不常出现', label: `这项力量在你最近的生活里还没有稳定冒出来。` },
          { tag: '偶尔会出现', label: `你身上有这股资源，但还没有稳定被调动。` },
          { tag: '看场景而定', label: `在对的关系、节奏或任务里，它会明显长出来。` },
          { tag: '最近常出现', label: `这已经越来越像你最近会自然拿出来用的力量。` },
          { tag: '就是你的长板', label: `这几乎就是你当前最稳定、最像你的内在资源。` },
        ]
      : [
          { tag: '还没被调动', label: `这项力量最近还没有稳定出现。` },
          { tag: '偶尔会冒出来', label: `在某些场景里你已经能看到它。` },
          { tag: '经常能调动', label: `最近它已经常常帮你扛住事情或把事情做成。` },
          { tag: '核心长板', label: `这几乎就是你当前最可依赖的内在资源。` },
        ],
    personality: question.type === 'likert5'
      ? [
          { tag: '离你较远', label: `这一面并不是你最近最自然的样子。` },
          { tag: '偶尔这样', label: `在一些场景下你会这样，但还不是默认状态。` },
          { tag: '有时这样有时不', label: `你会受到关系、压力和场景影响而来回切换。` },
          { tag: '最近很像你', label: `这已经很接近你最近最常出现的状态。` },
          { tag: '几乎就是你', label: `这几乎就是你当前阶段最自然的人格呈现。` },
        ]
      : [
          { tag: '不太像你', label: `这现在还不是你的主状态。` },
          { tag: '有时像你', label: `在某些情境里你会进入这一面。` },
          { tag: '经常像你', label: `最近你已经常常呈现出这种样子。` },
          { tag: '就是你现在', label: `这几乎就是你当前阶段最稳定的人格轮廓。` },
        ],
  };

  const anchors = dimensionAnchorMap[question.dimension] || dimensionAnchorMap.personality;
  return anchors.map((anchor, index) => ({
    range: ranges[index],
    tag: anchor.tag,
    label: anchor.label,
    color: palettes[index],
  }));
}

export function buildPersonalizedQuestionPresentation(
  question: Question,
  blueprint: HumanMapBlueprint | null,
  plan: PersonalizedDimensionPlan | null,
): PersonalizedQuestionPresentation | null {
  if (!blueprint || !plan) return null;

  const sceneLead = buildSceneLead(question.dimension, blueprint);
  const signalText = topSignalText(blueprint, plan);
  const dimensionLabel = DIMENSION_MAP[question.dimension]?.name || question.dimension;
  const whyAsked = signalText
    ? `系统把这题放在这里，是因为你前置建模里反复出现了「${signalText}」，需要进一步确认你在 ${dimensionLabel} 上的真实反应。`
    : `系统想用这题确认你在 ${dimensionLabel} 上更接近哪种底层模式。`;

  return {
    rewrittenText: `${sceneLead}\n${clean(question.text)}`,
    scenePrompt: `${blueprint.immersivePrompt} 这一题更贴近你现在的「${blueprint.lifeStage}」阶段与主线「${blueprint.currentFocus}」。`,
    whyAsked,
    swingHint: buildSwingHint(question, question.dimension),
    optionInstruction: buildOptionInstruction(question),
    optionLead: buildOptionLead(question, blueprint),
    rewrittenChoiceOptions: question.choiceOptions?.map((label) => rewriteChoiceOptionLabel(label, question)),
    rewrittenOptions: question.options?.map((option) => ({
      ...option,
      label: rewriteBehaviorOptionLabel(option.label, question, blueprint),
    })),
    rewrittenPlaceholder: buildRewrittenPlaceholder(question, blueprint),
    rewrittenSliderAnchors: buildSliderAnchors(question, blueprint),
  };
}
