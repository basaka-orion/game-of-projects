import type { SelfAgentConstitution } from '../../../features/profiling-studio/types'

export type ProfilingMode = 'quick' | 'deep' | 'dialogue'

export interface QuickProfilingAnswers {
  name?: string
  interests: string[]
  dislikes: string[]
  longTermVision: string
  currentFocus: string
  workStyle: 'analytical' | 'visionary' | 'pragmatic' | 'creative'
  riskTolerance: number
  innovationBias: number
  socialEnergy: number
  executionDiscipline: number
  emotionalSensitivity: number
  aestheticSensitivity: number
  curiosityBreadth: number
  worldviewDrive: number
  excitementTriggers: string[]
  explanationPreferences: string[]
  antiPatterns: string[]
}

export interface ExternalProfilingResult {
  source: 'multi_dimension_profiling' | 'creative_profile' | 'matrix_reasoning' | 'self_agent_distillation'
  mode: ProfilingMode
  profileVersion: string
  raw: Record<string, unknown>
}

export interface ProfilingEvidenceTrace {
  source: 'quick' | 'human_map' | 'cat' | 'games' | 'matrix_reasoning' | 'dialogue' | 'self_agent_distillation' | 'openbasaka_export'
  reference: string
  insight: string
  confidence: number
}

export interface ProfilingSummary {
  headline: string
  narrative: string
  keyStrengths: string[]
  watchouts: string[]
  recommendedAgents: string[]
  recommendedResearchTopics: string[]
  recommendedProjectDirections: string[]
  promptSummary: string
}

export interface NormalizedBossProfile {
  summary: ProfilingSummary
  confidence: number
  evidenceTrace?: ProfilingEvidenceTrace[]
  confidenceInterval?: [number, number]
  pendingVerification?: string[]
  measurementNotes?: string[]
  selfAgentConstitution?: SelfAgentConstitution
  dimensions: {
    cognition: Record<string, number>
    personality: Record<string, number>
    emotion: Record<string, number>
    motivation: Record<string, number>
    social: Record<string, number>
    aesthetic: Record<string, number>
    worldview: Record<string, number>
    strengths: {
      top: string[]
      risks: string[]
    }
  }
  operational: {
    name?: string
    preferredStyle: 'analytical' | 'visionary' | 'pragmatic' | 'creative'
    riskTolerance: number
    innovationBias: number
    resourceStyle: 'bootstrapper' | 'investor-backed' | 'balanced'
    decisionSpeed: 'impulsive' | 'deliberate' | 'analytical'
    excitementTriggers: string[]
    resonanceHooks: string[]
    explanationPreferences: string[]
    addictiveFormats: string[]
    understandingModes: string[]
    antiPatterns: string[]
    integrationGoals: string[]
    shortTermGoals: string[]
    longTermVision: string
    currentFocus: string
    interests: string[]
    dislikes: string[]
  }
  recommendations: {
    recommendedAgents: string[]
    recommendedResearchTopics: string[]
    recommendedProjectDirections: string[]
  }
}

export interface BossAssessmentRun {
  id: string
  mode: ProfilingMode
  confidence: number
  createdAt: string
  normalized: NormalizedBossProfile
}
