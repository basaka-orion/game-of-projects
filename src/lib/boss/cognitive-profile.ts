import { getBossProfile, setBossProfile } from '../db/store'
import { recordBossCognitionImpact } from './cognition-impact'

export interface CognitiveProfile {
  excitementTriggers: string[]
  resonanceHooks: string[]
  explanationPreferences: string[]
  addictiveFormats: string[]
  understandingModes: string[]
  antiPatterns: string[]
  integrationGoals: string[]
  mission: string
}

export const DEFAULT_COGNITIVE_PROFILE: CognitiveProfile = {
  excitementTriggers: [],
  resonanceHooks: [],
  explanationPreferences: [],
  addictiveFormats: [],
  understandingModes: [],
  antiPatterns: [],
  integrationGoals: [],
  mission: '',
}

function uniqueClean(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].slice(0, 12)
}

function normalizeProfile(input?: Partial<CognitiveProfile> | null): CognitiveProfile {
  return {
    excitementTriggers: uniqueClean(input?.excitementTriggers || []),
    resonanceHooks: uniqueClean(input?.resonanceHooks || []),
    explanationPreferences: uniqueClean(input?.explanationPreferences || []),
    addictiveFormats: uniqueClean(input?.addictiveFormats || []),
    understandingModes: uniqueClean(input?.understandingModes || []),
    antiPatterns: uniqueClean(input?.antiPatterns || []),
    integrationGoals: uniqueClean(input?.integrationGoals || []),
    mission: (input?.mission || '').trim(),
  }
}

export function hasMeaningfulCognitiveProfile(profile?: CognitiveProfile | null): boolean {
  if (!profile) return false
  return Boolean(
    profile.mission ||
    profile.excitementTriggers.length ||
    profile.resonanceHooks.length ||
    profile.explanationPreferences.length ||
    profile.addictiveFormats.length ||
    profile.understandingModes.length ||
    profile.antiPatterns.length ||
    profile.integrationGoals.length,
  )
}

export function loadCognitiveProfile(): CognitiveProfile {
  const raw = getBossProfile()
  const json = raw.cognitive_profile_json
  if (!json) return { ...DEFAULT_COGNITIVE_PROFILE }

  try {
    return normalizeProfile(JSON.parse(json) as Partial<CognitiveProfile>)
  } catch {
    return { ...DEFAULT_COGNITIVE_PROFILE }
  }
}

export function saveCognitiveProfile(profile: CognitiveProfile): CognitiveProfile {
  const current = getBossProfile()
  const normalized = normalizeProfile(profile)
  let previous = { ...DEFAULT_COGNITIVE_PROFILE }
  try {
    previous = normalizeProfile(
      current.cognitive_profile_json ? (JSON.parse(current.cognitive_profile_json) as Partial<CognitiveProfile>) : null,
    )
  } catch {
    previous = { ...DEFAULT_COGNITIVE_PROFILE }
  }
  setBossProfile({
    ...current,
    cognitive_profile_json: JSON.stringify(normalized),
  })

  const changedKeys = (Object.keys(normalized) as Array<keyof CognitiveProfile>).filter(
    (key) => JSON.stringify(normalized[key]) !== JSON.stringify(previous[key]),
  )
  if (changedKeys.length > 0) {
    recordBossCognitionImpact({
      changedKeys,
      source: 'manual_edit',
      confidence: 0.82,
    }).catch(() => {})
  }

  return normalized
}

export function renderCognitivePrompt(profile: CognitiveProfile, mode: 'system' | 'context' = 'system'): string {
  if (!hasMeaningfulCognitiveProfile(profile)) return ''

  const lines: string[] = []
  if (profile.mission) lines.push(`- 核心使命: ${profile.mission}`)
  if (profile.excitementTriggers.length > 0) lines.push(`- 容易被激发的入口: ${profile.excitementTriggers.join('、')}`)
  if (profile.resonanceHooks.length > 0) lines.push(`- 容易产生感觉的抓手: ${profile.resonanceHooks.join('、')}`)
  if (profile.explanationPreferences.length > 0)
    lines.push(`- 更偏好的讲解方式: ${profile.explanationPreferences.join('、')}`)
  if (profile.addictiveFormats.length > 0) lines.push(`- 更容易上瘾的呈现形式: ${profile.addictiveFormats.join('、')}`)
  if (profile.understandingModes.length > 0)
    lines.push(`- 更容易快速理解的吸收路径: ${profile.understandingModes.join('、')}`)
  if (profile.integrationGoals.length > 0)
    lines.push(`- 最终要融入的认知框架方向: ${profile.integrationGoals.join('、')}`)
  if (profile.antiPatterns.length > 0) lines.push(`- 尽量避免: ${profile.antiPatterns.join('、')}`)

  if (mode === 'context') {
    return `<boss-cognition>\n${lines.join('\n')}\n</boss-cognition>`
  }

  return [
    '你必须把信息组织成更贴近 Boss 认知节律的形式。',
    '要求：',
    '- 不只是给结论，也要给能让 Boss 产生感觉和理解欲望的切入点',
    '- 优先把资料组织成模式、张力、对比、线索、框架，而不是平铺摘录',
    '- 回答最后尽量补一句“这可以怎样并入 Boss 的认知体系”',
    ...lines,
  ].join('\n')
}
