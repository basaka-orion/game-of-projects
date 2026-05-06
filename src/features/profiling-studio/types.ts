// ══════════════════════════════════════════════════════════════
// V2.0 类型系统 — 拓扑识别 + 证据链 + 造物匹配
// ══════════════════════════════════════════════════════════════

// ── Sub-dimension definition ──
export interface SubDimension {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  scaleRef?: string;
}

// ── Question types ──
export type QuestionType =
  | 'likert5'
  | 'single'
  | 'sort'
  | 'open'
  | 'raven'
  | 'portrait'
  | 'sjt'
  | 'dynamic_slider'
  | 'single_choice'
  | 'visual_pair_choice';

// ── Item source tracking (版权与方法学标注) ──
export type ItemSourceType =
  | 'original'             // 完全原创
  | 'adapted_open'         // 来自开放题库 (如 IPIP)，有明确开放许可
  | 'adapted_theory'       // 参考某理论/量表构念，但未直接翻译原题
  | 'sensitive_copyright';  // 参考了受版权保护量表的原题，需后续替换/授权

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  dimension: string;
  subDimension?: string;
  reverse?: boolean;
  options?: { value: number | string; label: string }[];
  correct?: string;
  scaleRef?: string;
  // ── V2.1 追加字段 ──
  /** single_choice 题型：选项文本列表 */
  choiceOptions?: string[];
  /** single_choice 题型：正确选项标识 (如 "A"/"B"/"C"/"D") */
  correctOption?: string;
  /** visual_pair_choice 题型：左侧图片路径 */
  leftImageSrc?: string;
  /** visual_pair_choice 题型：右侧图片路径 */
  rightImageSrc?: string;
  /** visual_pair_choice 题型：设计学公认的正确一侧 */
  correctSide?: 'left' | 'right';
  /** 题目来源类型 (版权与方法学标注) */
  sourceType?: ItemSourceType;
  /** dynamic_slider 题型：滑块锚点潜台词映射 */
  sliderAnchors?: {
    range: [number, number];
    tag?: string;    // 感知标签，如「完全不是我」
    label: string;
    color: string;
  }[];
}

// ── Dimension module ──
export interface DimensionModule {
  id: string;
  name: string;
  nameEn: string;
  icon: string;
  color: string;
  gradient: string;
  description: string;
  theoreticalBasis: string;
  estimatedTime: number;
  subDimensions: SubDimension[];
  questions: Question[];
}

// ══════════════════════════════════════════════════════════════
// 人类数值地图 v1 — 前置建模与定制测评路由
// ══════════════════════════════════════════════════════════════

export type HumanMapMode = 'detailed' | 'compact' | 'skip';

export type HumanMapSignalId =
  | 'identity_meaning'
  | 'career_execution'
  | 'emotion_healing'
  | 'relationship_pattern'
  | 'creativity_expression'
  | 'cognition_learning';

export interface HumanMapQuestionDef {
  id: string;
  section: string;
  title: string;
  prompt: string;
  helper: string;
  placeholder: string;
  examples: string[];
  required?: boolean;
  isClarifier?: boolean;
  dimensionBias?: Partial<Record<string, number>>;
  signalHints?: HumanMapSignalId[];
}

export interface HumanMapSignalScore {
  id: HumanMapSignalId;
  label: string;
  score: number;
  evidence: string[];
}

export interface PersonalizedDimensionPlan {
  dimensionId: string;
  questionIds: string[];
  reason: string;
  focusSignals: HumanMapSignalId[];
  immersivePrompt: string;
  priority: number;
}

export interface HumanMapBlueprint {
  mode: Exclude<HumanMapMode, 'skip'>;
  displayName: string;
  lifeStage: string;
  currentFocus: string;
  summary: string;
  immersivePrompt: string;
  answerCount: number;
  signalScores: HumanMapSignalScore[];
  dimensionWeights: Record<string, number>;
  recommendedDimensions: string[];
  dimensionPlans: PersonalizedDimensionPlan[];
  sourceDigest: string[];
  completedAt: string;
}

export interface QuestionPresentationSnapshot {
  id: string;
  moduleId: string;
  moduleName: string;
  questionId: string;
  dimensionId: string;
  dimensionName: string;
  questionType: QuestionType;
  personalized: boolean;
  originalText: string;
  renderedText: string;
  scenePrompt?: string;
  whyAsked?: string;
  swingHint?: string;
  optionInstruction?: string;
  optionLead?: string;
  displayedOptions: string[];
  displayedSliderAnchors?: Array<{
    range: [number, number];
    tag?: string;
    label: string;
    color: string;
  }>;
  currentFocusSnapshot?: string;
  lifeStageSnapshot?: string;
  answerValue?: string | number;
  answerLabel?: string;
  cachedAt: string;
  answeredAt?: string;
}

// ══════════════════════════════════════════════════════════════
// V2.0 拓扑画像 — 核心数据契约
// ══════════════════════════════════════════════════════════════

// ── 证据来源 — 铁证链条的基本单元 ──
export interface EvidenceSource {
  sourceType: 'questionnaire' | 'avg' | 'game' | 'cat' | 'matrix_reasoning';
  itemId: string;           // 题目/场景/游戏 ID
  itemLabel: string;        // 人类可读描述
  observation: string;      // 观察到的具体行为或选择
  confidence: number;       // 0-1 置信度
}

// ── 特质判定 — 单个子维度的拓扑结论 ──
export interface TraitVerdict {
  subDimension: string;
  subDimensionName: string;
  typology: string;          // 类型名，如"直觉驱动型"、"结构依赖型"
  description: string;       // 对该类型的描述
  flowZone: string;          // 心流舒适区描述
  energyDrainer: string;     // 高耗能摩擦区描述
  evidenceSources: EvidenceSource[];
}

// ── 维度拓扑 — 单个维度的完整画像 ──
export interface DimensionTopology {
  dimension: string;
  name: string;
  icon: string;
  color: string;
  dominantTraits: TraitVerdict[];
  energyDynamics: {
    flowZones: string[];     // 心流区列表
    drainZones: string[];    // 高耗能区列表
  };
  collaborationRole: string;  // 协作中的天然角色
  theoreticalInsight: string;
}

// ── 跨维度化学反应 ──
export interface CrossDimensionReaction {
  dimensions: [string, string];
  reactionType: 'resonance' | 'friction' | 'paradox' | 'catalyst';
  title: string;
  narrative: string;
  implication: string;        // 对创作/协作的具体影响
  evidenceSources: EvidenceSource[];
}

// ── 完整拓扑画像 ──
export interface TopologyProfile {
  id: string;
  selfArchetype: string;       // 原型标题，如"深沉的系统思考者"
  narrativeIdentity: string;   // 叙事性自我描述（一段文字）
  dimensionTopologies: Record<string, DimensionTopology>;
  crossReactions: CrossDimensionReaction[];
  confidenceMap: Record<string, number>;  // 每个维度判定的置信度 0-1
  pendingVerification: string[];          // 待验证区域
  createdAt: string;
}

// ── 锻造蓝图（V1 — 保留兼容） ──
export interface ForgeBlueprint {
  id: string;
  demand: string;
  topologyId: string;
  flowStrategy: string[];
  drainMitigation: string[];
  collaboratorSpec: string;
  actionPlan: {
    phase: string;
    tasks: string[];
    rationale: string;
  }[];
  createdAt: string;
}

// ── 创世蓝图文档 V2 — 6 章专业开发手册 ──
export type ForgeChapterKey = 'overview' | 'architecture' | 'modules' | 'roadmap' | 'risks' | 'team';

export interface ForgeChapter {
  key: ForgeChapterKey;
  title: string;
  icon: string;
  markdownContent: string;
  status: 'pending' | 'streaming' | 'done';
}

export interface ForgeGenesisDoc {
  id: string;
  demand: string;
  topologyId: string;
  chapters: ForgeChapter[];
  createdAt: string;
}

// ══════════════════════════════════════════════════════════════
// V1.0 兼容层 — 过渡期保留（供旧页面适配使用）
// ══════════════════════════════════════════════════════════════

/** @deprecated V1.0 — 将在页面适配后移除 */
export interface DimensionScore {
  dimension: string;
  name: string;
  score: number;
  percentile: number;
  description: string;
  strength: string;
  growth: string;
  subScores?: Record<string, number>;
  theoreticalInsight?: string;
}

/** @deprecated V1.0 — 将在页面适配后移除 */
export interface CrossDimensionTension {
  dimensions: [string, string];
  tensionType: 'conflict' | 'synergy' | 'paradox';
  title: string;
  description: string;
  suggestion: string;
}

/** @deprecated V1.0 — 将在页面适配后移除 */
export interface Report {
  id: string;
  summary: string;
  selfTheme: string;
  narrativeTheme?: string;
  dimensions: Record<string, DimensionScore>;
  crossDimensionTensions: CrossDimensionTension[];
  themes: { name: string; description: string; suggestion: string }[];
  insights: { type: string; title: string; description: string }[];
  recommendations: { action: string; reason: string; expectedOutcome: string }[];
  createdAt: string;
}

// ── AVG Interactive Script types ──
export interface AVGChoice {
  id: string;
  text: string;
  dimensionMappings: { dimension: string; subDimension: string; weight: number }[];
}

export interface AVGNode {
  id: string;
  title: string;
  narrative: string;
  backgroundGradient: string;
  backgroundEmoji?: string;
  choices: AVGChoice[];
}

// ── Tracking ──
export interface TrackingEntry {
  id: string;
  type: 'emotion' | 'decision' | 'reflection';
  emotion?: string;
  intensity?: number;
  trigger?: string;
  notes?: string;
  relatedDimension?: string;
  createdAt: string;
}

// ── Game types ──
export type GameType = 'stroop' | 'nback' | 'gonogo' | 'ultimatum' | 'trust' | 'publicgoods';

export interface StroopResult {
  congruentRT: number;
  incongruentRT: number;
  stroopEffect: number;
  accuracy: number;
  totalTrials: number;
}

export interface NBackResult {
  hitRate: number;
  falseAlarmRate: number;
  dPrime: number;
  level: number;
  totalTrials: number;
}

export interface GoNoGoResult {
  goAccuracy: number;
  noGoAccuracy: number;
  commissionErrors: number;
  omissionErrors: number;
  avgGoRT: number;
  totalTrials: number;
}

export interface UltimatumResult {
  avgOffer: number;
  minAcceptable: number;
  rejectionCount: number;
  rejectionRate: number;
  fairnessIndex: number;
  punishmentTendency: number;
  totalRounds: number;
}

export interface TrustResult {
  avgInvestment: number;
  avgReturn: number;
  trustIndex: number;
  reciprocityIndex: number;
  totalRounds: number;
}

export interface PublicGoodsResult {
  avgContribution: number;
  contributionTrend: 'increasing' | 'decreasing' | 'stable';
  freeRiderIndex: number;
  cooperationIndex: number;
  totalRounds: number;
}

export interface GameResult {
  gameType: GameType;
  data: StroopResult | NBackResult | GoNoGoResult | UltimatumResult | TrustResult | PublicGoodsResult;
  completedAt: string;
}

// ── CAT Response (V2.0 — 保留原始响应而非压成单一分数) ──
export interface CATResponse {
  itemId: string;
  response: number;
  theta: number;       // 当时的能力估计
  se: number;          // 标准误
  selectedOptionValue?: string | number;
  selectedOptionLabel?: string;
  answeredAt?: string;
  openScoring?: CATOpenResponseScore;
}

export interface CATOpenResponseScore {
  text: string;
  fluency: number;
  flexibility: number;
  originalityProxy: number;
  elaboration: number;
  category: 0 | 1 | 2 | 3;
  notes: string[];
}

// ── Original Matrix Reasoning Lab (原创矩阵推理，不复制 Raven APM 原题) ──
export type MatrixRuleFamily =
  | 'progression'
  | 'rotation'
  | 'count'
  | 'overlay'
  | 'distribution'
  | 'compound';

export interface MatrixCell {
  shape: 'circle' | 'triangle' | 'square' | 'diamond';
  count: number;
  rotation: number;
  fill: 'outline' | 'solid' | 'striped';
  accent: 'cyan' | 'violet' | 'gold' | 'rose';
}

export interface MatrixOption {
  id: string;
  cell: MatrixCell;
  rationale: string;
}

export interface MatrixReasoningItem {
  id: string;
  version: string;
  family: MatrixRuleFamily;
  difficulty: 1 | 2 | 3 | 4 | 5;
  prompt: string;
  ruleDsl: string;
  matrix: Array<MatrixCell | null>;
  options: MatrixOption[];
  correctOptionId: string;
  sourceType: 'original';
  measurementNotes: string[];
}

export interface MatrixResponse {
  itemId: string;
  selectedOptionId: string;
  correctOptionId: string;
  isCorrect: boolean;
  responseTimeMs: number;
  answeredAt: string;
}

export interface MatrixRuleBreakdown {
  family: MatrixRuleFamily;
  attempted: number;
  correct: number;
  meanResponseTimeMs: number;
}

export interface MatrixSessionResult {
  id: string;
  version: string;
  itemIds: string[];
  responses: MatrixResponse[];
  accuracy: number;
  rawScore: number;
  maxScore: number;
  meanResponseTimeMs: number;
  difficultyWeightedScore: number;
  confidenceInterval: [number, number];
  reliabilityEstimate: number;
  ruleBreakdown: MatrixRuleBreakdown[];
  pendingVerification: string[];
  measurementNotes: string[];
  completedAt: string;
}

export interface SelfAgentConstitution {
  id: string;
  generatedAt: string;
  sourceRunId?: string;
  headline: string;
  cognitiveOperatingManual: string[];
  expressionDNA: string[];
  decisionBoundaries: string[];
  authorizationBoundaries: string[];
  forbiddenZones: string[];
  evidenceLedger: string[];
  delegableTasks: string[];
  mustAskUserTasks: string[];
  calibrationQuestions: string[];
  measurementBoundaries: string[];
}

// ── User state ──
export interface UserState {
  name: string;
  avatar: string;
  subscription: 'free' | 'premium';
  completedDimensions: string[];
  avgCompleted: boolean;
  avgChoices: Record<string, string>;
  assessmentLayer: 'quick' | 'deep' | 'integration';
}

// ══════════════════════════════════════════════════════════════
// 日常微采样（Daily Micro Sampling） — 信号源⑤
// ══════════════════════════════════════════════════════════════

export type MicroSampleQuestionType = 'single_choice' | 'likert5';

export interface MicroSampleQuestion {
  /** 例如 'emotion_peak_event' */
  id: string;
  /** 关联的子维度，如 'emotion_regulation' */
  dimensionId: string;
  type: MicroSampleQuestionType;
  /** 中文题面 */
  prompt: string;
  /** 单选题的选项（likert5 不需要） */
  options?: string[];
}

export interface MicroSampleAnswer {
  questionId: string;
  /** 选项值（单选题），或 likert 分数 '1'~'5' */
  answerValue: string;
}

export interface MicroSampleRecord {
  id: string;
  userId: string;
  /** 格式：'2026-03-19' */
  date: string;
  createdAt: string;
  questions: MicroSampleQuestion[];
  answers: MicroSampleAnswer[];
  relatedDimensionIds: string[];
}

// ══════════════════════════════════════════════════════════════
// 多智者对话系统（Multi-Sage Dialogue System）
// ══════════════════════════════════════════════════════════════

export type SageId = 'philosopher' | 'scientist' | 'analyst' | 'relationalist' | 'creator' | 'system_builder' | 'product_sage';

export interface SageDefinition {
  id: SageId;
  name: string;
  nameEn: string;
  icon: string;
  color: string;
  archetype: string;
  description: string;
  focusDimensions: string[];
  /** 对话阶段标签 */
  phaseLabels: string[];
  /** 默认对话轮次上限 */
  maxTurns: number;
  /** 解锁条件：需要哪些智者已完成 */
  unlockCondition?: SageId[];
}

export interface SageDialogueMessage {
  id: string;
  role: 'sage' | 'user';
  content: string;
  timestamp: number;
  sageId: SageId;
  metadata?: {
    phase: string;
    dimensionRef?: string;
  };
}

export interface SageSession {
  sageId: SageId;
  messages: SageDialogueMessage[];
  phase: string;
  turnCount: number;
  status: 'idle' | 'active' | 'completed';
  structuredOutput?: SageInsight;
}

/** 各智者的结构化洞见输出 */
export type SageInsight =
  | PhilosopherInsight
  | ScientistInsight
  | AnalystInsight
  | RelationalistInsight
  | CreatorInsight
  | SystemBuilderInsight
  | ProductSageInsight;

export interface PhilosopherInsight {
  sageId: 'philosopher';
  worldviewModel: {
    coreValues: string[];
    meaningSources: string[];
    assumptions: string[];
    tensions: string[];
  };
}

export interface ScientistInsight {
  sageId: 'scientist';
  cognitiveWorkflow: {
    decisionStyle: string;
    learningStyle: string;
    strengths: string[];
    risks: string[];
    suggestedPractices: string[];
  };
}

export interface AnalystInsight {
  sageId: 'analyst';
  conflictMap: {
    tensions: { pair: string; narrative: string; shadowSide: string }[];
    currentFocus: string;
  };
}

export interface RelationalistInsight {
  sageId: 'relationalist';
  relationshipPattern: {
    attachmentSummary: string;
    defaultScript: string;
    desiredState: string;
    experiments: string[];
  };
}

export interface CreatorInsight {
  sageId: 'creator';
  aestheticProfile: {
    stylePreferences: string[];
    creativeProcess: string;
    blockPatterns: string[];
    aestheticManifesto: string;
  };
}

export interface SystemBuilderInsight {
  sageId: 'system_builder';
  upgradePlan: {
    horizonMonths: number;
    themes: {
      name: string;
      motivation: string;
      experiments: {
        title: string;
        cadence: string;
        timeBoxMinutes: number;
        successMetric: string;
      }[];
    }[];
  };
}

export interface PersonalOS {
  id: string;
  /** 核心认知模型概述 */
  cognitiveModel: string;
  /** 世界观与意义锚定 */
  worldviewAnchor: string;
  /** 内在张力地图 */
  tensionMap: string[];
  /** 关系模式摘要 */
  relationshipSummary: string;
  /** 审美与创作基线 */
  aestheticBaseline: string;
  /** 6个月升级路线图 */
  upgradeRoadmap: string[];
  /** 全文叙事（AI 生成） */
  narrative: string;
  createdAt: string;
}

// ══════════════════════════════════════════════════════════════
// 产品设计引擎（Product Design Engine）
// ══════════════════════════════════════════════════════════════

/** JTBD 生活任务 */
export interface Job {
  id: string;
  title: string;
  context: {
    lifeArea: 'work' | 'health' | 'relationship' | 'creation' | 'finance' | 'learning' | 'other';
    frequency: 'daily' | 'weekly' | 'monthly' | 'episodic';
    currentWorkflow: string;
    desiredOutcome: string;
  };
  constraints: string[];
  emotionalJobs: string[];
  socialJobs: string[];
  importanceScore: number;
  satisfactionScore: number;
}

/** 痛点 */
export interface PainPoint {
  id: string;
  jobId: string;
  symptom: string;
  suspectedRootCause: string;
  intensity: number;
  recurrence: 'rare' | 'occasional' | 'frequent' | 'chronic';
  examples: string[];
}

/** 自我解决适配度 */
export interface SelfSolverFit {
  jobId: string;
  talentMatch: number;
  aestheticMatch: number;
  resourceFeasibility: number;
  learningLeverage: number;
  overallScore: number;
  rationale: string[];
}

/** 产品概念 */
export interface ProductConcept {
  id: string;
  jobId: string;
  workingTitle: string;
  productType: 'workflow' | 'digital_tool' | 'physical_tool' | 'service' | 'hybrid';
  targetUser: 'self' | 'self_plus_inner_circle' | 'public_niche';
  corePromise: string;
  keyFeatures: string[];
  experiencePrinciples: string[];
  aestheticSpec: {
    keywords: string[];
    references: string[];
  };
}

/** 实现计划 */
export interface ImplementationPlan {
  id: string;
  productId: string;
  horizonMonths: number;
  scope: 'personal_mvp' | 'inner_circle' | 'public_beta';
  localComponents: {
    type: 'ritual' | 'physical_setup' | 'automation_script';
    description: string;
    tooling: string[];
  }[];
  webComponents: {
    type: 'no_code' | 'saas' | 'custom_app';
    description: string;
    integrationLevel: 'manual' | 'semi_auto' | 'full_auto';
  }[];
  effortEstimate: 'low' | 'medium' | 'high';
  risks: string[];
  successMetrics: string[];
}

/** Product Sage 的结构化洞见输出 */
export interface ProductSageInsight {
  sageId: 'product_sage';
  discoveredJobs: Job[];
  painPoints: PainPoint[];
  selfSolverFits: SelfSolverFit[];
  productConcepts: ProductConcept[];
  implementationPlans: ImplementationPlan[];
}
