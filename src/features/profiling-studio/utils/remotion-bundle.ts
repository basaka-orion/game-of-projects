import { DIMENSION_MAP } from '../data/dimensions';
import type { OpenBasakaExportBundle, OpenBasakaExportInput } from './openbasaka-export';
import { buildOpenBasakaExportBundle } from './openbasaka-export';

type NarrativeTone = 'analytical' | 'visionary' | 'poetic' | 'grounded';
type CompositionId = 'portrait-reveal' | 'landscape-brief';
type CaptionStyle = 'headline' | 'body' | 'quote' | 'metric';
type MotionStyle = 'drift' | 'pulse' | 'parallax' | 'radar' | 'bloom';

export interface RemotionCompositionSpec {
  id: CompositionId;
  name: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  purpose: string;
}

export interface RemotionThemeTokens {
  tone: NarrativeTone;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  gradient: string;
}

export interface RemotionDimensionSnapshot {
  id: string;
  name: string;
  icon: string;
  color: string;
  confidence: number;
  traitHighlights: string[];
}

export interface RemotionDataSnapshot {
  archetype: string;
  currentFocus: string;
  longTermVision: string;
  mission: string;
  topDimensions: RemotionDimensionSnapshot[];
  crossReactions: Array<{
    title: string;
    reactionType: string;
    implication: string;
  }>;
  recommendedResearchTopics: string[];
  productConcepts: Array<{
    title: string;
    promise: string;
    productType: string;
  }>;
}

export interface RemotionSceneOutline {
  id: string;
  title: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  purpose: string;
  compositionHint: 'hero' | 'dimensions' | 'tension' | 'sage' | 'trajectory' | 'outro';
  transition: 'glow' | 'crossfade' | 'prism' | 'beam';
  headline: string;
  supportingLines: string[];
  visualDirection: string;
  motionNotes: string[];
  dataRefs: string[];
}

export interface RemotionCaptionBlock {
  id: string;
  sceneId: string;
  startSec: number;
  endSec: number;
  text: string;
  style: CaptionStyle;
}

export interface RemotionVoiceoverSegment {
  sceneId: string;
  startSec: number;
  endSec: number;
  pace: 'slow' | 'steady' | 'elevated';
  text: string;
}

export interface RemotionVisualMotif {
  id: string;
  label: string;
  description: string;
  colors: string[];
  motionStyle: MotionStyle;
  keywords: string[];
  assetSuggestions: string[];
}

export interface RemotionAudioDirection {
  mood: string;
  bpmRange: string;
  texture: string;
  cues: string[];
}

export interface RemotionNarrativeBundle {
  schemaVersion: 'remotion-narrative-v1';
  sourceSystem: 'multi-dimension-profiling';
  exportedAt: string;
  title: string;
  subtitle: string;
  fps: number;
  durationSec: number;
  defaultCompositionId: CompositionId;
  compositions: RemotionCompositionSpec[];
  themeTokens: RemotionThemeTokens;
  dataSnapshot: RemotionDataSnapshot;
  sceneOutline: RemotionSceneOutline[];
  captionBlocks: RemotionCaptionBlock[];
  voiceoverScript: RemotionVoiceoverSegment[];
  visualMotifs: RemotionVisualMotif[];
  audioDirection: RemotionAudioDirection;
  remotionProps: {
    title: string;
    subtitle: string;
    themeTokens: RemotionThemeTokens;
    scenes: RemotionSceneOutline[];
    captions: RemotionCaptionBlock[];
    voiceover: RemotionVoiceoverSegment[];
    highlightMetrics: {
      topConfidence: number;
      crossReactionCount: number;
      researchTopicCount: number;
    };
  };
  bridge: {
    openbasakaBundle: OpenBasakaExportBundle['openbasakaBundle'];
    fusedProfileBundle: OpenBasakaExportBundle['fusedProfileBundle'];
  };
}

function unique(values: Array<string | undefined | null>, limit = 8): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = (value || '').trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
    if (result.length >= limit) break;
  }
  return result;
}

function truncate(text: string, max = 72): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function pickFirst(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    const cleaned = (value || '').trim();
    if (cleaned) return cleaned;
  }
  return '';
}

function deriveTone(style: OpenBasakaExportBundle['openbasakaBundle']['bossCore']['preferredStyle']): NarrativeTone {
  if (style === 'analytical') return 'analytical';
  if (style === 'visionary') return 'visionary';
  if (style === 'creative') return 'poetic';
  return 'grounded';
}

function buildThemeTokens(bundle: OpenBasakaExportBundle): RemotionThemeTokens {
  const bossCore = bundle.openbasakaBundle.bossCore;
  const tone = deriveTone(bossCore.preferredStyle);
  const topDimensions = Object.values(bundle.fusedProfileBundle.topology.dimensionTopologies)
    .sort((a, b) => (
      (bundle.fusedProfileBundle.topology.confidenceMap[b.dimension] || 0) -
      (bundle.fusedProfileBundle.topology.confidenceMap[a.dimension] || 0)
    ));
  const primary = topDimensions[0]?.color || '#64FFDA';
  const secondary = topDimensions[1]?.color || '#BB86FC';
  const accent = topDimensions[2]?.color || '#FF80AB';

  const backgrounds: Record<NarrativeTone, { background: string; surface: string; textPrimary: string; textSecondary: string }> = {
    analytical: {
      background: '#06131A',
      surface: 'rgba(10, 30, 38, 0.72)',
      textPrimary: '#F5FFFD',
      textSecondary: 'rgba(220, 246, 242, 0.76)',
    },
    visionary: {
      background: '#120A23',
      surface: 'rgba(29, 17, 52, 0.72)',
      textPrimary: '#FBF6FF',
      textSecondary: 'rgba(235, 227, 246, 0.78)',
    },
    poetic: {
      background: '#170D19',
      surface: 'rgba(41, 18, 39, 0.7)',
      textPrimary: '#FFF7FB',
      textSecondary: 'rgba(247, 230, 239, 0.78)',
    },
    grounded: {
      background: '#15120D',
      surface: 'rgba(42, 30, 20, 0.7)',
      textPrimary: '#FFF8F2',
      textSecondary: 'rgba(244, 231, 214, 0.78)',
    },
  };

  return {
    tone,
    primary,
    secondary,
    accent,
    gradient: `linear-gradient(135deg, ${primary} 0%, ${secondary} 55%, ${accent} 100%)`,
    ...backgrounds[tone],
  };
}

function collectDimensionSnapshot(bundle: OpenBasakaExportBundle): RemotionDimensionSnapshot[] {
  return Object.values(bundle.fusedProfileBundle.topology.dimensionTopologies)
    .map(dimension => ({
      id: dimension.dimension,
      name: dimension.name,
      icon: dimension.icon,
      color: dimension.color,
      confidence: Math.round((bundle.fusedProfileBundle.topology.confidenceMap[dimension.dimension] || 0) * 100),
      traitHighlights: unique(dimension.dominantTraits.map(trait => trait.typology), 3),
    }))
    .sort((a, b) => b.confidence - a.confidence);
}

function collectSageHighlights(input: OpenBasakaExportInput): string[] {
  return unique(input.sageInsights.flatMap(insight => {
    switch (insight.sageId) {
      case 'philosopher':
        return [
          insight.worldviewModel.coreValues[0],
          insight.worldviewModel.meaningSources[0],
          insight.worldviewModel.tensions[0],
        ];
      case 'scientist':
        return [
          insight.cognitiveWorkflow.decisionStyle,
          insight.cognitiveWorkflow.learningStyle,
          insight.cognitiveWorkflow.suggestedPractices[0],
        ];
      case 'analyst':
        return [
          insight.conflictMap.currentFocus,
          insight.conflictMap.tensions[0]?.narrative,
        ];
      case 'relationalist':
        return [
          insight.relationshipPattern.desiredState,
          insight.relationshipPattern.experiments[0],
        ];
      case 'creator':
        return [
          insight.aestheticProfile.aestheticManifesto,
          insight.aestheticProfile.creativeProcess,
          insight.aestheticProfile.stylePreferences[0],
        ];
      case 'system_builder':
        return [
          insight.upgradePlan.themes[0]?.name,
          insight.upgradePlan.themes[0]?.experiments[0]?.title,
        ];
      case 'product_sage':
        return [
          insight.productConcepts[0]?.workingTitle,
          insight.discoveredJobs[0]?.context.desiredOutcome,
        ];
      default:
        return [];
    }
  }), 6);
}

function buildDataSnapshot(input: OpenBasakaExportInput, bundle: OpenBasakaExportBundle): RemotionDataSnapshot {
  const bossCore = bundle.openbasakaBundle.bossCore;

  return {
    archetype: bundle.fusedProfileBundle.topology.selfArchetype,
    currentFocus: bossCore.currentFocus,
    longTermVision: bossCore.longTermVision,
    mission: bossCore.mission,
    topDimensions: collectDimensionSnapshot(bundle).slice(0, 4),
    crossReactions: bundle.fusedProfileBundle.topology.crossReactions.slice(0, 3).map(reaction => ({
      title: reaction.title,
      reactionType: reaction.reactionType,
      implication: reaction.implication,
    })),
    recommendedResearchTopics: bossCore.recommendedResearchTopics.slice(0, 5),
    productConcepts: input.productConcepts.slice(0, 3).map(concept => ({
      title: concept.workingTitle,
      promise: concept.corePromise,
      productType: concept.productType,
    })),
  };
}

function buildSceneDefinitions(input: OpenBasakaExportInput, bundle: OpenBasakaExportBundle) {
  const bossCore = bundle.openbasakaBundle.bossCore;
  const dataSnapshot = buildDataSnapshot(input, bundle);
  const sageHighlights = collectSageHighlights(input);
  const topDimensions = dataSnapshot.topDimensions;
  const leadReaction = dataSnapshot.crossReactions[0];
  const secondReaction = dataSnapshot.crossReactions[1];
  const productLead = dataSnapshot.productConcepts[0];
  const topResearchTopics = dataSnapshot.recommendedResearchTopics.slice(0, 3);
  const topConfidence = topDimensions[0]?.confidence || 0;

  return [
    {
      id: 'archetype-reveal',
      title: '原型揭示',
      durationSec: 6,
      purpose: '用一句话建立人格原型与视频主情绪。',
      compositionHint: 'hero' as const,
      transition: 'glow' as const,
      headline: bossCore.headline,
      supportingLines: unique([
        truncate(bundle.fusedProfileBundle.topology.narrativeIdentity, 54),
        bossCore.currentFocus ? `当前焦点：${truncate(bossCore.currentFocus, 30)}` : '',
      ], 2),
      visualDirection: '中心标题从暗场中浮现，背景使用主色 aurora 漂移与柔和颗粒。',
      motionNotes: [
        '标题使用慢速 scale + opacity reveal',
        '背景层保持轻微漂移，不要过度晃动',
      ],
      dataRefs: [
        'topology.selfArchetype',
        'topology.narrativeIdentity',
        'openbasakaBundle.bossCore.currentFocus',
      ],
      voiceover: `你不是一组分数，而是一种正在成形的生态位。你的画像原型，是${bossCore.headline}。`,
      pace: 'slow' as const,
    },
    {
      id: 'dimension-montage',
      title: '维度发光点',
      durationSec: 8,
      purpose: '展示最具代表性的维度与特质组合。',
      compositionHint: 'dimensions' as const,
      transition: 'prism' as const,
      headline: '最亮的维度，正在这样排列',
      supportingLines: unique(topDimensions.slice(0, 3).map(dimension => (
        `${dimension.icon} ${dimension.name} ${dimension.confidence}% · ${dimension.traitHighlights.slice(0, 2).join(' / ')}`
      )), 3),
      visualDirection: '维度卡片沿对角线排布，配合雷达线条与局部数字跳出。',
      motionNotes: [
        '维度卡片使用 staggered reveal',
        '置信度数字使用轻微 count-up',
      ],
      dataRefs: [
        'topology.dimensionTopologies',
        'topology.confidenceMap',
      ],
      voiceover: `最值得被看见的，不是平均值，而是你最亮的排列方式。当前证据最充足的维度里，${topDimensions.slice(0, 2).map(dimension => dimension.name).join('和')}尤其鲜明。`,
      pace: 'steady' as const,
    },
    {
      id: 'chemistry-reveal',
      title: '化学反应',
      durationSec: 7,
      purpose: '强调真正定义行为模式的跨维度张力与共振。',
      compositionHint: 'tension' as const,
      transition: 'beam' as const,
      headline: pickFirst(leadReaction?.title, '你的内在化学反应，才是关键密码'),
      supportingLines: unique([
        leadReaction?.implication,
        secondReaction?.implication,
        bundle.fusedProfileBundle.topology.pendingVerification[0],
      ], 3).map(line => truncate(line, 58)),
      visualDirection: '用两组颜色束相互穿插，形成张力轨迹与文字浮标。',
      motionNotes: [
        '使用交错路径线模拟 resonance / friction',
        '避免太多粒子，重点突出一句话张力',
      ],
      dataRefs: [
        'topology.crossReactions',
        'topology.pendingVerification',
      ],
      voiceover: leadReaction
        ? `真正定义你的，不是单点特质，而是${leadReaction.title}这样的内部化学反应。它会直接影响你的创作方式、协作方式，以及你如何选择方向。`
        : '即使画像还在成长，跨维度之间的呼应与摩擦，已经开始勾勒你的行动风格。',
      pace: 'steady' as const,
    },
    {
      id: 'sage-lens',
      title: '智者镜头',
      durationSec: 7,
      purpose: '把智者对话与个人操作系统提炼成一组更有温度的洞见。',
      compositionHint: 'sage' as const,
      transition: 'crossfade' as const,
      headline: '多智者正在这样理解你',
      supportingLines: unique([
        ...sageHighlights,
        input.personalOS?.worldviewAnchor,
        input.personalOS?.cognitiveModel,
      ], 3).map(line => truncate(line, 58)),
      visualDirection: '用圆环肖像位与侧边字幕带，营造被多位观察者同时照亮的感觉。',
      motionNotes: [
        '头像位或 icon 使用轻微 pulse',
        '字幕从左右两侧交替滑入',
      ],
      dataRefs: [
        'fusedProfileBundle.sageInsights',
        'fusedProfileBundle.personalOS',
      ],
      voiceover: `从多智者视角看，你的方向感并不来自单一能力，而来自一套稳定的认知与意义系统。${truncate(pickFirst(input.personalOS?.worldviewAnchor, sageHighlights[0]), 32)}，是这套系统最值得继续放大的部分。`,
      pace: 'slow' as const,
    },
    {
      id: 'trajectory-map',
      title: '方向轨迹',
      durationSec: 8,
      purpose: '把测试结果转成接下来几个月的重点方向与研究议题。',
      compositionHint: 'trajectory' as const,
      transition: 'prism' as const,
      headline: '下一阶段，更适合这样推进',
      supportingLines: unique([
        bossCore.longTermVision ? `长期愿景：${truncate(bossCore.longTermVision, 34)}` : '',
        topResearchTopics.length > 0 ? `优先研究：${topResearchTopics.join(' / ')}` : '',
        productLead ? `可转化方向：${productLead.title} · ${truncate(productLead.promise, 26)}` : '',
      ], 3),
      visualDirection: '把愿景线、研究主题和产品构想压成三层轨道，形成前进路径。',
      motionNotes: [
        '使用时间轴推进而不是爆炸式切换',
        '结尾留 1 秒给愿景句停留',
      ],
      dataRefs: [
        'openbasakaBundle.bossCore.longTermVision',
        'openbasakaBundle.bossCore.recommendedResearchTopics',
        'fusedProfileBundle.productConcepts',
      ],
      voiceover: `如果把这份结果真正变成方向，那么接下来最适合围绕${pickFirst(bossCore.currentFocus, productLead?.title, bossCore.headline)}推进，并持续把研究主题收束到少数几个真正会点亮你的问题上。`,
      pace: 'elevated' as const,
    },
    {
      id: 'outro-card',
      title: '行动结语',
      durationSec: 6,
      purpose: '给用户一个可分享、可记忆、可进入下一步的结尾。',
      compositionHint: 'outro' as const,
      transition: 'glow' as const,
      headline: '这不是标签，而是一份导演提纲',
      supportingLines: unique([
        bossCore.integrationGoals[0] ? `接下来优先兑现：${truncate(bossCore.integrationGoals[0], 34)}` : '',
        bossCore.recommendedAgents.length > 0 ? `适合协作：${bossCore.recommendedAgents.join(' / ')}` : '',
        topConfidence > 0 ? `当前证据最强维度置信度：${topConfidence}%` : '',
      ], 3),
      visualDirection: '用一张静态感更强的结尾卡收束，适合被截帧和分享。',
      motionNotes: [
        '末尾保持更克制，让信息落地',
        '可留出 QR 或分享文案位置',
      ],
      dataRefs: [
        'openbasakaBundle.bossCore.integrationGoals',
        'openbasakaBundle.bossCore.recommendedAgents',
      ],
      voiceover: '把这份画像当成接下来几个月的导演提纲，而不是静态标签。真正重要的，是你接下来会如何把它变成作品、关系与行动。',
      pace: 'slow' as const,
    },
  ];
}

function withTimeline(
  sceneDefs: ReturnType<typeof buildSceneDefinitions>,
): Array<RemotionSceneOutline & { voiceover: string; pace: RemotionVoiceoverSegment['pace'] }> {
  let cursor = 0;
  return sceneDefs.map(scene => {
    const startSec = cursor;
    const endSec = startSec + scene.durationSec;
    cursor = endSec;
    return {
      id: scene.id,
      title: scene.title,
      startSec,
      endSec,
      durationSec: scene.durationSec,
      purpose: scene.purpose,
      compositionHint: scene.compositionHint,
      transition: scene.transition,
      headline: scene.headline,
      supportingLines: scene.supportingLines,
      visualDirection: scene.visualDirection,
      motionNotes: scene.motionNotes,
      dataRefs: scene.dataRefs,
      voiceover: scene.voiceover,
      pace: scene.pace,
    };
  });
}

function buildCaptionBlocks(scenes: Array<RemotionSceneOutline & { voiceover: string }>): RemotionCaptionBlock[] {
  const blocks: RemotionCaptionBlock[] = [];

  for (const scene of scenes) {
    const bodyLines = scene.supportingLines.slice(0, 2);
    blocks.push({
      id: `${scene.id}-headline`,
      sceneId: scene.id,
      startSec: scene.startSec,
      endSec: Math.min(scene.endSec, scene.startSec + Math.max(2.4, scene.durationSec * 0.46)),
      text: scene.headline,
      style: 'headline',
    });

    bodyLines.forEach((line, index) => {
      const segmentStart = scene.startSec + 1.4 + index * 1.7;
      const segmentEnd = Math.min(scene.endSec, segmentStart + 2.8);
      blocks.push({
        id: `${scene.id}-body-${index + 1}`,
        sceneId: scene.id,
        startSec: segmentStart,
        endSec: segmentEnd,
        text: line,
        style: index === 0 && line.includes('：') ? 'metric' : 'body',
      });
    });
  }

  return blocks;
}

function buildVoiceoverScript(scenes: Array<RemotionSceneOutline & { voiceover: string; pace: RemotionVoiceoverSegment['pace'] }>): RemotionVoiceoverSegment[] {
  return scenes.map(scene => ({
    sceneId: scene.id,
    startSec: scene.startSec,
    endSec: scene.endSec,
    pace: scene.pace,
    text: scene.voiceover,
  }));
}

function buildVisualMotifs(input: OpenBasakaExportInput, bundle: OpenBasakaExportBundle, themeTokens: RemotionThemeTokens): RemotionVisualMotif[] {
  const topDimensions = collectDimensionSnapshot(bundle).slice(0, 3);
  const productLead = input.productConcepts[0];
  const reaction = bundle.fusedProfileBundle.topology.crossReactions[0];
  const creatorInsight = input.sageInsights.find(insight => insight.sageId === 'creator');

  return [
    {
      id: 'aura-lattice',
      label: '原型光场',
      description: '围绕 archetype 形成渐进发光的中心光场，适合开场 reveal。',
      colors: [themeTokens.primary, themeTokens.secondary, themeTokens.accent],
      motionStyle: 'bloom',
      keywords: unique([
        bundle.fusedProfileBundle.topology.selfArchetype,
        topDimensions[0]?.name,
        topDimensions[1]?.name,
      ], 4),
      assetSuggestions: [
        '柔和颗粒背景',
        '中心环形 glow',
        '细微星点或噪点层',
      ],
    },
    {
      id: 'dimension-radar',
      label: '维度雷达',
      description: '把维度强弱与特质标签组合成雷达 + 标签展开。',
      colors: topDimensions.map(item => item.color),
      motionStyle: 'radar',
      keywords: unique(topDimensions.flatMap(item => [item.name, ...item.traitHighlights]), 6),
      assetSuggestions: [
        '极坐标线框',
        '数字 count-up',
        '标签 staggered reveal',
      ],
    },
    {
      id: 'reaction-threads',
      label: '张力轨迹',
      description: '用两组轨迹线交叉来表达跨维度化学反应。',
      colors: [themeTokens.primary, themeTokens.accent],
      motionStyle: 'parallax',
      keywords: unique([
        reaction?.title,
        reaction?.reactionType,
        reaction?.implication,
      ], 4),
      assetSuggestions: [
        '双色能量线',
        '文字锚点浮标',
        '交错 mask reveal',
      ],
    },
    {
      id: 'atelier-board',
      label: '造物情绪板',
      description: '把产品构想、审美关键词与研究主题压成情绪板结尾。',
      colors: [themeTokens.secondary, themeTokens.accent, '#F6D365'],
      motionStyle: 'drift',
      keywords: unique([
        productLead?.workingTitle,
        productLead?.aestheticSpec.keywords[0],
        creatorInsight && 'aestheticProfile' in creatorInsight
          ? creatorInsight.aestheticProfile.stylePreferences[0]
          : '',
        ...bundle.openbasakaBundle.bossCore.recommendedResearchTopics.slice(0, 2),
      ], 6),
      assetSuggestions: [
        '拼贴图块或 moodboard',
        '小标签贴纸',
        '结尾卡片留白区',
      ],
    },
  ];
}

function buildAudioDirection(themeTokens: RemotionThemeTokens): RemotionAudioDirection {
  const config: Record<NarrativeTone, RemotionAudioDirection> = {
    analytical: {
      mood: '冷静、精确、带一点未来感',
      bpmRange: '82-96',
      texture: 'granular synth + soft ticks',
      cues: [
        '维度数字出现时加轻点击',
        '转场使用短促 shimmer',
      ],
    },
    visionary: {
      mood: '开阔、上升、带世界感',
      bpmRange: '76-92',
      texture: 'warm pads + celestial pulse',
      cues: [
        '开场加入长尾上升音',
        '结尾保留 1 秒空白余韵',
      ],
    },
    poetic: {
      mood: '亲密、感性、带细小闪光',
      bpmRange: '68-84',
      texture: 'felt piano + airy pads',
      cues: [
        '字幕切入时用轻刷感',
        '避免过重的鼓点',
      ],
    },
    grounded: {
      mood: '稳健、清晰、向前推进',
      bpmRange: '88-104',
      texture: 'soft percussion + analog bass',
      cues: [
        '方向轨迹段落加入节奏推进',
        '结尾保持清爽收束',
      ],
    },
  };

  return config[themeTokens.tone];
}

export function buildRemotionNarrativeBundle(input: OpenBasakaExportInput): RemotionNarrativeBundle {
  const openbasakaBundle = buildOpenBasakaExportBundle(input);
  const themeTokens = buildThemeTokens(openbasakaBundle);
  const dataSnapshot = buildDataSnapshot(input, openbasakaBundle);
  const scenes = withTimeline(buildSceneDefinitions(input, openbasakaBundle));
  const captionBlocks = buildCaptionBlocks(scenes);
  const voiceoverScript = buildVoiceoverScript(scenes);
  const visualMotifs = buildVisualMotifs(input, openbasakaBundle, themeTokens);
  const durationSec = scenes[scenes.length - 1]?.endSec || 0;
  const fps = 30;
  const title = `画像揭示片 · ${openbasakaBundle.fusedProfileBundle.topology.selfArchetype}`;
  const subtitle = pickFirst(
    openbasakaBundle.openbasakaBundle.bossCore.promptSummary,
    truncate(openbasakaBundle.fusedProfileBundle.topology.narrativeIdentity, 72),
  );
  const compositions: RemotionCompositionSpec[] = [
    {
      id: 'portrait-reveal',
      name: 'Portrait Reveal',
      width: 1080,
      height: 1920,
      fps,
      durationInFrames: durationSec * fps,
      purpose: '短视频分享 / 结果揭示 / 手机端传播',
    },
    {
      id: 'landscape-brief',
      name: 'Landscape Brief',
      width: 1920,
      height: 1080,
      fps,
      durationInFrames: durationSec * fps,
      purpose: '演示汇报 / 桌面展示 / 官网嵌入',
    },
  ];

  return {
    schemaVersion: 'remotion-narrative-v1',
    sourceSystem: 'multi-dimension-profiling',
    exportedAt: new Date().toISOString(),
    title,
    subtitle,
    fps,
    durationSec,
    defaultCompositionId: 'portrait-reveal',
    compositions,
    themeTokens,
    dataSnapshot,
    sceneOutline: scenes.map(({ voiceover, pace, ...scene }) => scene),
    captionBlocks,
    voiceoverScript,
    visualMotifs,
    audioDirection: buildAudioDirection(themeTokens),
    remotionProps: {
      title,
      subtitle,
      themeTokens,
      scenes: scenes.map(({ voiceover, pace, ...scene }) => scene),
      captions: captionBlocks,
      voiceover: voiceoverScript,
      highlightMetrics: {
        topConfidence: dataSnapshot.topDimensions[0]?.confidence || 0,
        crossReactionCount: dataSnapshot.crossReactions.length,
        researchTopicCount: dataSnapshot.recommendedResearchTopics.length,
      },
    },
    bridge: {
      openbasakaBundle: openbasakaBundle.openbasakaBundle,
      fusedProfileBundle: openbasakaBundle.fusedProfileBundle,
    },
  };
}

export function downloadRemotionNarrativeBundle(bundle: RemotionNarrativeBundle): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `remotion-narrative-${bundle.exportedAt.slice(0, 10)}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function buildRemotionDimensionMoodMap(bundle: RemotionNarrativeBundle): Record<string, { color: string; gradient: string }> {
  return Object.fromEntries(bundle.dataSnapshot.topDimensions.map(dimension => {
    const meta = DIMENSION_MAP[dimension.id];
    return [
      dimension.id,
      {
        color: dimension.color,
        gradient: meta?.gradient || bundle.themeTokens.gradient,
      },
    ];
  }));
}
