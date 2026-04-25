import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  TrackingEntry,
  GameResult,
  TopologyProfile,
  ForgeBlueprint,
  ForgeGenesisDoc,
  CATResponse,
  SageId,
  SageSession,
  SageInsight,
  PersonalOS,
  SageDialogueMessage,
  Job,
  ProductConcept,
  ImplementationPlan,
  HumanMapMode,
  HumanMapBlueprint,
  QuestionPresentationSnapshot,
} from '../types';
import { recordModuleResponse } from '../engine/data-collection';

// ══════════════════════════════════════════════════════════════
// V2.0 Assessment Store — 拓扑识别 + 证据链 + 智者对话
// ══════════════════════════════════════════════════════════════

interface AssessmentState {
  // ── 原始采集数据（保留） ──
  answers: Record<string, Record<string, string | number>>;
  avgChoices: Record<string, string>;
  avgProfile: Record<string, string>;
  avgCompleted: boolean;
  completedDimensions: string[];
  gameResults: GameResult[];
  humanMapMode: HumanMapMode | null;
  humanMapAnswers: Record<string, string>;
  humanMapBlueprint: HumanMapBlueprint | null;
  humanMapAIQuestions: import('../types').HumanMapQuestionDef[];
  questionPresentationSnapshots: Record<string, QuestionPresentationSnapshot>;

  // ── V2.0: CAT 原始响应 ──
  catResponses: Record<string, CATResponse[]>;

  // ── V2.0: 拓扑画像 + 锻造蓝图 ──
  topology: TopologyProfile | null;
  forgeBlueprint: ForgeBlueprint | null;
  forgeGenesisDoc: ForgeGenesisDoc | null;

  // ── V2.1: 多智者对话系统 ──
  sageSessions: Partial<Record<SageId, SageSession>>;
  activeSageId: SageId | null;
  sageInsights: SageInsight[];
  personalOS: PersonalOS | null;

  // ── V2.2: 产品设计引擎 ──
  productJobs: Job[];
  productConcepts: ProductConcept[];
  implementationPlans: ImplementationPlan[];

  // ── Actions ──
  setAnswer: (moduleId: string, questionId: string, value: string | number) => void;
  completeModule: (moduleId: string) => void;
  setAVGChoice: (nodeId: string, choiceId: string) => void;
  setAVGProfile: (profile: Record<string, string>) => void;
  completeAVG: () => void;
  saveGameResult: (result: GameResult) => void;
  setHumanMapMode: (mode: HumanMapMode | null) => void;
  setHumanMapAnswer: (questionId: string, value: string) => void;
  setHumanMapAIQuestions: (questions: import('../types').HumanMapQuestionDef[]) => void;
  saveQuestionPresentationSnapshot: (snapshot: QuestionPresentationSnapshot) => void;
  completeHumanMap: (blueprint: HumanMapBlueprint) => void;
  resetHumanMap: () => void;
  saveCATResponses: (dimensionId: string, responses: CATResponse[]) => void;
  setTopology: (topology: TopologyProfile) => void;
  setForgeBlueprint: (blueprint: ForgeBlueprint) => void;
  setForgeGenesisDoc: (doc: ForgeGenesisDoc) => void;
  resetAVG: () => void;
  resetAll: () => void;

  // ── V2.1 Sage Actions ──
  setActiveSage: (sageId: SageId | null) => void;
  updateSageSession: (sageId: SageId, session: SageSession) => void;
  addSageMessage: (sageId: SageId, message: SageDialogueMessage) => void;
  saveSageInsight: (insight: SageInsight) => void;
  setPersonalOS: (os: PersonalOS) => void;

  // ── V2.2 Product Engine Actions ──
  saveProductJobs: (jobs: Job[]) => void;
  saveProductConcept: (concept: ProductConcept) => void;
  saveImplementationPlan: (plan: ImplementationPlan) => void;
}

export const useAssessmentStore = create<AssessmentState>()(
  persist(
    (set, get) => ({
      answers: {},
      avgChoices: {},
      avgProfile: {},
      avgCompleted: false,
      completedDimensions: [],
      gameResults: [],
      humanMapMode: null,
      humanMapAnswers: {},
      humanMapBlueprint: null,
      humanMapAIQuestions: [],
      questionPresentationSnapshots: {},
      catResponses: {},
      topology: null,
      forgeBlueprint: null,
      forgeGenesisDoc: null,
      sageSessions: {},
      activeSageId: null,
      sageInsights: [],
      personalOS: null,
      productJobs: [],
      productConcepts: [],
      implementationPlans: [],

      setAnswer: (moduleId, questionId, value) =>
        set((s) => ({
          answers: {
            ...s.answers,
            [moduleId]: { ...(s.answers[moduleId] || {}), [questionId]: value },
          },
        })),

      completeModule: (moduleId) => {
        const state = get();
        set({
          completedDimensions: state.completedDimensions.includes(moduleId)
            ? state.completedDimensions
            : [...state.completedDimensions, moduleId],
        });
        // 数据采集：记录该模块的完整作答
        const moduleAnswers = state.answers[moduleId];
        if (moduleAnswers) {
          recordModuleResponse(moduleId, 'questionnaire', moduleAnswers, Date.now() - 180000);
        }
      },

      setAVGChoice: (nodeId, choiceId) =>
        set((s) => ({
          avgChoices: { ...s.avgChoices, [nodeId]: choiceId },
        })),

      setAVGProfile: (profile) => set({ avgProfile: profile }),

      completeAVG: () => {
        const state = get();
        set({ avgCompleted: true });
        // 数据采集：记录 AVG 选择数据
        recordModuleResponse('avg', 'avg', state.avgChoices, Date.now() - 300000);
      },

      saveGameResult: (result) => {
        set((s) => ({
          gameResults: [
            ...s.gameResults.filter(r => r.gameType !== result.gameType),
            result,
          ],
        }));
        // 数据采集：记录游戏结果
        recordModuleResponse(`game_${result.gameType}`, 'game', result.data as unknown as Record<string, string | number>, Date.now() - 60000);
      },

      setHumanMapMode: (mode) =>
        set((s) => ({
          humanMapMode: mode,
          humanMapAnswers: mode === s.humanMapMode ? s.humanMapAnswers : {},
          humanMapBlueprint: mode === s.humanMapMode ? s.humanMapBlueprint : null,
          humanMapAIQuestions: mode === s.humanMapMode ? s.humanMapAIQuestions : [],
          questionPresentationSnapshots: mode === s.humanMapMode ? s.questionPresentationSnapshots : {},
        })),

      setHumanMapAnswer: (questionId, value) =>
        set((s) => ({
          humanMapAnswers: {
            ...s.humanMapAnswers,
            [questionId]: value,
          },
        })),

      setHumanMapAIQuestions: (questions) =>
        set({
          humanMapAIQuestions: questions,
        }),

      saveQuestionPresentationSnapshot: (snapshot) =>
        set((s) => ({
          questionPresentationSnapshots: {
            ...s.questionPresentationSnapshots,
            [snapshot.id]: snapshot,
          },
        })),

      completeHumanMap: (blueprint) =>
        set({
          humanMapMode: blueprint.mode,
          humanMapBlueprint: blueprint,
        }),

      resetHumanMap: () =>
        set({
          humanMapMode: null,
          humanMapAnswers: {},
          humanMapBlueprint: null,
          humanMapAIQuestions: [],
          questionPresentationSnapshots: {},
        }),

      saveCATResponses: (dimensionId, responses) =>
        set((s) => ({
          catResponses: { ...s.catResponses, [dimensionId]: responses },
          completedDimensions: s.completedDimensions.includes(dimensionId)
            ? s.completedDimensions
            : [...s.completedDimensions, dimensionId],
        })),

      setTopology: (topology) => set({ topology }),

      setForgeBlueprint: (blueprint) => set({ forgeBlueprint: blueprint }),
      setForgeGenesisDoc: (doc) => set({ forgeGenesisDoc: doc }),

      resetAVG: () =>
        set({ avgChoices: {}, avgProfile: {}, avgCompleted: false }),

      resetAll: () =>
        set({
          answers: {},
          avgChoices: {},
          avgProfile: {},
          avgCompleted: false,
          completedDimensions: [],
          gameResults: [],
          humanMapMode: null,
          humanMapAnswers: {},
          humanMapBlueprint: null,
          humanMapAIQuestions: [],
          questionPresentationSnapshots: {},
          catResponses: {},
          topology: null,
          forgeBlueprint: null,
          sageSessions: {},
          activeSageId: null,
          sageInsights: [],
          personalOS: null,
          productJobs: [],
          productConcepts: [],
          implementationPlans: [],
        }),

      // ── V2.1 Sage Actions ──
      setActiveSage: (sageId) => set({ activeSageId: sageId }),

      updateSageSession: (sageId, session) =>
        set((s) => ({
          sageSessions: { ...s.sageSessions, [sageId]: session },
        })),

      addSageMessage: (sageId, message) =>
        set((s) => {
          const existing = s.sageSessions[sageId];
          if (!existing) return s;
          return {
            sageSessions: {
              ...s.sageSessions,
              [sageId]: {
                ...existing,
                messages: [...existing.messages, message],
              },
            },
          };
        }),

      saveSageInsight: (insight) =>
        set((s) => ({
          sageInsights: [
            ...s.sageInsights.filter(i => i.sageId !== insight.sageId),
            insight,
          ],
        })),

      setPersonalOS: (os) => set({ personalOS: os }),

      // ── V2.2 Product Engine Actions ──
      saveProductJobs: (jobs) => set({ productJobs: jobs }),

      saveProductConcept: (concept) =>
        set((s) => ({
          productConcepts: [
            ...s.productConcepts.filter(c => c.id !== concept.id),
            concept,
          ],
        })),

      saveImplementationPlan: (plan) =>
        set((s) => ({
          implementationPlans: [
            ...s.implementationPlans.filter(p => p.id !== plan.id),
            plan,
          ],
        })),
    }),
    { name: 'assessment-store-v3' }
  )
);

// ══════════════════════════════════════════════════════════════
// Tracking Store（保持不变）
// ══════════════════════════════════════════════════════════════

interface TrackingState {
  entries: TrackingEntry[];
  addEntry: (entry: Omit<TrackingEntry, 'id' | 'createdAt'>) => void;
}

export const useTrackingStore = create<TrackingState>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (entry) =>
        set((s) => ({
          entries: [
            { ...entry, id: Date.now().toString(), createdAt: new Date().toISOString() },
            ...s.entries,
          ],
        })),
    }),
    { name: 'tracking-store-v2' }
  )
);
