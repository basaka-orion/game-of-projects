export type UiMuseumTier = 'T0' | 'T1' | 'T2' | 'T3'

export interface UiStyleSpec {
  radius: string
  shadow: string
  font: string
  colors: string
}

export type UiVisualPattern =
  | 'organism'
  | 'prismatic'
  | 'aura'
  | 'brutal'
  | 'agent'
  | 'ambient'
  | 'data'
  | 'zen'
  | 'metal'
  | 'kinetic'
  | 'aero'
  | 'spatial'
  | 'hologram'
  | 'dither'
  | 'print'
  | 'editorial'
  | 'blueprint'
  | 'skeuo'
  | 'atomic'
  | 'googie'
  | 'solarpunk'
  | 'bento'
  | 'material'
  | 'minimal'
  | 'glass'
  | 'acid'
  | 'memphis'
  | 'natural'
  | 'cute'
  | 'industrial'
  | 'snapshot'
  | 'floral'
  | 'neon'
  | 'retro'
  | 'terminal'
  | 'doodle'
  | 'paper'
  | 'swiss'
  | 'gothic'
  | 'fusion'

export interface UiVisualTokens {
  palette: string[]
  background: string
  surface: string
  text: string
  accent: string
  border: string
  radius: string
  shadow: string
  pattern: UiVisualPattern
  density: 'quiet' | 'balanced' | 'dense' | 'chaotic'
  typography: string
  motif: string
  texture: string
  motion: string
}

export interface UiStyleRestorationScore {
  identity: number
  craft: number
  interaction: number
  platformFit: number
  openbasakaUsefulness: number
}

export interface UiStyleMasterProfile {
  referenceBrief: string
  identityRules: string[]
  visualTokens: string[]
  componentGrammar: string[]
  platformRules: {
    web: string
    ios: string
    mac: string
    android: string
    mini: string
  }
  promptRules: string[]
  antiPatterns: string[]
  acceptanceChecklist: string[]
  restorationScores: UiStyleRestorationScore
}

export interface UiStyleItem {
  id: string
  title: string
  tier: UiMuseumTier
  description: string
  application: string
  specs: UiStyleSpec
  visual: UiVisualTokens
  web: string
  ios: string
  mac?: string
  android: string
  mini: string
  masterProfile: UiStyleMasterProfile
}

export interface UiFusionResult {
  id: string
  name: string
  description: string
  parentStyleIds: string[]
  parentStyles: string[]
  specs: UiStyleSpec
  visual: UiVisualTokens
  web: string
  ios: string
  mac?: string
  android: string
  mini: string
  prompt: string
  createdAt: number
  generatedBy: 'ai' | 'local'
}

export interface UiStyleEvolutionEvent {
  id: string
  targetId: string
  targetName: string
  sourceStyleIds: string[]
  sourceStyleNames: string[]
  generation: number
  trigger: 'single-style' | 'fusion' | 'project-genesis' | 'manual-refine'
  critique: string
  improvements: string[]
  platformImpact: {
    web: string
    ios: string
    mac: string
    android: string
    mini: string
  }
  promptPatch: string
  createdAt: number
}

export interface UiExpertOpinion {
  role: 'CPO' | 'CTO' | 'Design Director'
  name: string
  focus: string
  opinion: string
}

export interface UiProjectPrd {
  id: string
  title: string
  userIdea: string
  elevatorPitch: string
  targetAudience: string
  researchReport: string
  teamBrainstorming: UiExpertOpinion[]
  visualStyleFusion: {
    styleIds: string[]
    reasoning: string
    colorPalette: string[]
    visual?: UiVisualTokens
  }
  features: Array<{
    name: string
    description: string
    priority: 'P0' | 'P1' | 'P2'
  }>
  techStack: {
    frontend: string
    backend: string
    database: string
    infrastructure: string
  }
  databaseSchema: string
  apiEndpoints: string
  prdManual: string
  createdAt: number
  generatedBy: 'ai' | 'local'
}

export interface UiMuseumState {
  savedFusions: UiFusionResult[]
  savedProjects: UiProjectPrd[]
  styleEvolutionEvents: UiStyleEvolutionEvent[]
}
