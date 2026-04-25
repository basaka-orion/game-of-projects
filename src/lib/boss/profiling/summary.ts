import type { NormalizedBossProfile, ProfilingSummary } from './types'

function styleLabel(style: NormalizedBossProfile['operational']['preferredStyle']): string {
  switch (style) {
    case 'analytical':
      return '分析建模'
    case 'visionary':
      return '愿景牵引'
    case 'pragmatic':
      return '务实推进'
    case 'creative':
      return '创意表达'
  }
}

export function buildProfilingSummary(profile: Omit<NormalizedBossProfile, 'summary'>): ProfilingSummary {
  const style = styleLabel(profile.operational.preferredStyle)
  const headline = `${style}型 Boss`
  const strengthText = profile.dimensions.strengths.top.slice(0, 3).join('、') || '跨域探索'
  const riskText = profile.dimensions.strengths.risks.slice(0, 2).join('、') || '过载分心'
  const narrative = [
    `当前更偏向 ${style} 的认知与行动方式。`,
    profile.operational.longTermVision
      ? `长期愿景集中在“${profile.operational.longTermVision}”。`
      : '长期愿景仍需要继续收束。',
    profile.operational.currentFocus
      ? `当前焦点是“${profile.operational.currentFocus}”。`
      : '当前焦点尚未被清晰定义。',
    `最明显的长板是 ${strengthText}，需要注意 ${riskText}。`,
  ].join('')

  const promptSummary = [
    `风格: ${style}`,
    `兴趣: ${profile.operational.interests.join('、') || '全领域探索'}`,
    profile.operational.currentFocus ? `当前焦点: ${profile.operational.currentFocus}` : '',
    profile.operational.longTermVision ? `长期愿景: ${profile.operational.longTermVision}` : '',
    profile.operational.explanationPreferences.length > 0
      ? `偏好表达: ${profile.operational.explanationPreferences.join('、')}`
      : '',
    profile.operational.antiPatterns.length > 0
      ? `避免表达: ${profile.operational.antiPatterns.join('、')}`
      : '',
  ].filter(Boolean).join(' | ')

  return {
    headline,
    narrative,
    keyStrengths: profile.dimensions.strengths.top,
    watchouts: profile.dimensions.strengths.risks,
    recommendedAgents: profile.recommendations.recommendedAgents,
    recommendedResearchTopics: profile.recommendations.recommendedResearchTopics,
    recommendedProjectDirections: profile.recommendations.recommendedProjectDirections,
    promptSummary,
  }
}

export function renderProfilingContext(summary?: ProfilingSummary | null): string {
  if (!summary?.promptSummary) return ''
  return `<boss-profiling>\n${summary.promptSummary}\n</boss-profiling>`
}
