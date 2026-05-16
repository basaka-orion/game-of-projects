import type { ParsedPRD } from '../../ai/prd-parser'
import type { RadarScores } from '../../ai/war-room'
import type { BossState } from '../profile'

export interface BossProjectFitBreakdown {
  llmScore: number
  structuredScore: number
  finalScore: number
  interestScore: number
  focusScore: number
  excitementScore: number
  styleScore: number
  riskFitScore: number
  innovationFitScore: number
  resourceFitScore: number
  dislikePenalty: number
  matchedInterests: string[]
  matchedFocus: string[]
  matchedExcitement: string[]
  reasons: string[]
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function normalize(text: string): string {
  return text.toLowerCase()
}

function buildProjectText(prd: ParsedPRD): string {
  return normalize([
    prd.title,
    prd.oneLiner,
    prd.targetAudience,
    prd.painPoint,
    prd.businessModel,
    prd.uniqueValue,
    ...prd.techStack,
    ...prd.competitors,
    ...prd.risks,
    ...prd.tags,
  ].join(' | '))
}

function buildPhraseVariants(phrase: string): string[] {
  const cleaned = normalize(phrase.trim())
  if (!cleaned) return []
  const parts = cleaned.split(/[\s,/，、|_\-]+/).filter(part => part.length >= 2)
  return [...new Set([cleaned, ...parts])]
}

function phraseMatches(text: string, phrase: string): boolean {
  return buildPhraseVariants(phrase).some(variant => text.includes(variant))
}

function collectMatches(text: string, phrases: string[]): string[] {
  return phrases.filter(phrase => phraseMatches(text, phrase))
}

function ratioScore(matched: number, total: number, emptyFallback = 55): number {
  if (total <= 0) return emptyFallback
  return clamp((matched / total) * 100)
}

function styleKeywords(style: BossState['preferredStyle']): string[] {
  switch (style) {
    case 'analytical':
      return ['系统', '架构', '分析', '引擎', '平台', '工具', 'workflow', 'agent', 'automation']
    case 'visionary':
      return ['未来', '生态', '世界', '操作系统', '平台', '网络', '文明', '叙事', 'system']
    case 'pragmatic':
      return ['效率', '执行', '自动化', '工具', '流程', '管理', '运营', 'saas', '工作流']
    case 'creative':
      return ['创意', '设计', '品牌', '体验', '内容', '游戏', '叙事', '灵感', '社区']
  }
}

function resourcePreference(style: BossState['resourceStyle']): number {
  switch (style) {
    case 'bootstrapper':
      return 25
    case 'balanced':
      return 50
    case 'investor-backed':
      return 72
  }
}

export function scoreBossProjectFit(
  boss: BossState,
  prd: ParsedPRD,
  radar: RadarScores
): BossProjectFitBreakdown {
  const projectText = buildProjectText(prd)
  const matchedInterests = collectMatches(projectText, boss.interests)
  const focusPhrases = [boss.currentFocus, boss.longTermVision].filter(Boolean)
  const matchedFocus = collectMatches(projectText, focusPhrases)
  const excitementPhrases = [
    ...boss.cognitiveProfile.excitementTriggers,
    ...boss.cognitiveProfile.resonanceHooks,
  ]
  const matchedExcitement = collectMatches(projectText, excitementPhrases)

  const interestScore = ratioScore(matchedInterests.length, boss.interests.length, 50)
  const focusScore = ratioScore(matchedFocus.length, focusPhrases.length, 58)
  const excitementScore = ratioScore(matchedExcitement.length, excitementPhrases.length, 55)

  const styleHits = styleKeywords(boss.preferredStyle).filter(keyword => projectText.includes(normalize(keyword)))
  const styleScore = ratioScore(styleHits.length, styleKeywords(boss.preferredStyle).length, 58)

  const riskFitScore = clamp(100 - Math.abs(radar.risk_index - boss.riskTolerance))
  const innovationFitScore = clamp(100 - Math.abs(radar.tech_breakthrough - boss.innovationBias))
  const resourceFitScore = clamp(100 - Math.abs(radar.resource_cost - resourcePreference(boss.resourceStyle)))

  const dislikeMatches = collectMatches(projectText, boss.dislikes)
  const dislikePenalty = boss.dislikes.length > 0
    ? clamp((dislikeMatches.length / boss.dislikes.length) * 20, 0, 20)
    : 0

  const structuredScore = clamp(
    interestScore * 0.24 +
    focusScore * 0.16 +
    excitementScore * 0.10 +
    styleScore * 0.12 +
    riskFitScore * 0.14 +
    innovationFitScore * 0.14 +
    resourceFitScore * 0.10 -
    dislikePenalty
  )

  const llmScore = clamp(radar.boss_match)
  const finalScore = clamp(llmScore * 0.55 + structuredScore * 0.45)

  const reasons: string[] = []
  if (matchedInterests.length > 0) reasons.push(`兴趣重合: ${matchedInterests.slice(0, 3).join('、')}`)
  if (matchedFocus.length > 0) reasons.push(`焦点/愿景重合: ${matchedFocus.slice(0, 2).join('、')}`)
  if (matchedExcitement.length > 0) reasons.push(`激发点重合: ${matchedExcitement.slice(0, 2).join('、')}`)
  if (styleHits.length > 0) reasons.push(`风格贴合: ${styleHits.slice(0, 3).join('、')}`)
  if (dislikeMatches.length > 0) reasons.push(`潜在禁区: ${dislikeMatches.slice(0, 2).join('、')}`)
  if (reasons.length === 0) reasons.push('当前项目文本与画像的显式锚点重合还不够强')

  return {
    llmScore,
    structuredScore,
    finalScore,
    interestScore,
    focusScore,
    excitementScore,
    styleScore,
    riskFitScore,
    innovationFitScore,
    resourceFitScore,
    dislikePenalty,
    matchedInterests,
    matchedFocus,
    matchedExcitement,
    reasons,
  }
}
