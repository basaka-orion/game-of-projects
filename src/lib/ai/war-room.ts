/**
 * 红蓝军推演引擎
 * 三角色串行推演 → 汇总评分 → 存活率
 */
import { chatCompletion, LLMConfig, ChatMessage } from './provider'
import { PROMPTS } from './prompts'
import { ParsedPRD } from './prd-parser'
import { getEraVariables, buildEraContext } from '../game/era-variables'
import { loadBossState } from '../boss/profile'
import { scoreBossProjectFit } from '../boss/profiling/scoring'
import { renderCognitivePrompt } from '../boss/cognitive-profile'

export interface RadarScores {
  era_fit: number
  boss_match: number
  monetization: number
  tech_breakthrough: number
  resource_cost: number
  risk_index: number
}

export interface WarRoomResult {
  radar: RadarScores
  survivalRate: number
  survivalGrade: string
  summary: string
  recommendation: string
  logs: WarRoomLog[]
  bossMatchBreakdown?: {
    llmScore: number
    structuredScore: number
    finalScore: number
    reasons: string[]
  }
}

export interface WarRoomLog {
  role: string
  verdict: string
  timestamp: number
}

/** 安全解析 JSON */
function safeParseJSON(text: string): Record<string, unknown> | null {
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
  } catch { /* 忽略 */ }
  return null
}

/** 运行红蓝军推演 */
export async function runWarRoom(
  config: LLMConfig,
  prd: ParsedPRD,
  onLog?: (log: WarRoomLog) => void
): Promise<WarRoomResult> {
  // 获取时代变量上下文
  let eraContext = ''
  let bossContext = ''
  let bossCognitiveSystem = ''
  try {
    const era = await getEraVariables(config)
    eraContext = buildEraContext(era)
  } catch { /* 静默降级 */ }
  try {
    const boss = await loadBossState()
    const parts = [
      boss.name && boss.name !== 'Boss' ? `Boss: ${boss.name}` : '',
      boss.interests.length > 0 ? `兴趣: ${boss.interests.join('、')}` : '',
      boss.longTermVision ? `长期愿景: ${boss.longTermVision}` : '',
      boss.currentFocus ? `当前焦点: ${boss.currentFocus}` : '',
      boss.profilingSummaryText ? `画像摘要: ${boss.profilingSummaryText}` : '',
    ].filter(Boolean)
    bossCognitiveSystem = renderCognitivePrompt(boss.cognitiveProfile)
    const cognitiveContext = renderCognitivePrompt(boss.cognitiveProfile, 'context')
    if (cognitiveContext) parts.push(`认知操作系统: ${cognitiveContext}`)
    if (parts.length > 0) bossContext = `Boss画像：${parts.join(' | ')}`
  } catch { /* ignore boss context failure */ }

  const projectBrief = `
${bossContext}
项目：${prd.title}
定位：${prd.oneLiner}
目标用户：${prd.targetAudience}
痛点：${prd.painPoint}
商业模式：${prd.businessModel}
技术栈：${prd.techStack.join(', ')}
竞品：${prd.competitors.join(', ')}
差异化：${prd.uniqueValue}
风险：${prd.risks.join(', ')}
`.trim()

  const logs: WarRoomLog[] = []

  // ─── 角色 1：竞品分析师 ───
  const analystMsg: ChatMessage[] = [
    { role: 'system', content: [PROMPTS.competitorAnalyst, bossCognitiveSystem].filter(Boolean).join('\n\n') },
    { role: 'user', content: `请评估这个项目：\n${projectBrief}` },
  ]
  const analystResp = await chatCompletion(config, analystMsg, 0.5, 1024)
  const analystData = safeParseJSON(analystResp)
  const analystLog: WarRoomLog = {
    role: '竞品分析师',
    verdict: (analystData?.verdict as string) || '无法评估',
    timestamp: Date.now(),
  }
  logs.push(analystLog)
  onLog?.(analystLog)

  // ─── 角色 2：挑剔用户 ───
  const userMsg: ChatMessage[] = [
    { role: 'system', content: [PROMPTS.pickyUser, bossCognitiveSystem].filter(Boolean).join('\n\n') },
    { role: 'user', content: `请评估这个项目：\n${projectBrief}` },
  ]
  const userResp = await chatCompletion(config, userMsg, 0.5, 1024)
  const userData = safeParseJSON(userResp)
  const userLog: WarRoomLog = {
    role: '挑剔用户',
    verdict: (userData?.verdict as string) || '无法评估',
    timestamp: Date.now(),
  }
  logs.push(userLog)
  onLog?.(userLog)

  // ─── 角色 3：冷酷投资人 ───
  const investorMsg: ChatMessage[] = [
    { role: 'system', content: [PROMPTS.coldInvestor, bossCognitiveSystem].filter(Boolean).join('\n\n') },
    { role: 'user', content: `请评估这个项目：\n${projectBrief}` },
  ]
  const investorResp = await chatCompletion(config, investorMsg, 0.5, 1024)
  const investorData = safeParseJSON(investorResp)
  const investorLog: WarRoomLog = {
    role: '冷酷投资人',
    verdict: (investorData?.verdict as string) || '无法评估',
    timestamp: Date.now(),
  }
  logs.push(investorLog)
  onLog?.(investorLog)

  // ─── 汇总评分 ───
  const allResults = JSON.stringify({
    competitor_analyst: analystData,
    picky_user: userData,
    cold_investor: investorData,
  })

  const summaryMsg: ChatMessage[] = [
    {
      role: 'system',
      content: [PROMPTS.survivalAssessor, eraContext, bossCognitiveSystem].filter(Boolean).join('\n\n'),
    },
    { role: 'user', content: `三个角色的评估结果：\n${allResults}` },
  ]
  const summaryResp = await chatCompletion(config, summaryMsg, 0.3, 1024)
  const summaryData = safeParseJSON(summaryResp)

  // 提取雷达分数
  const radarRaw = (summaryData?.radar as Record<string, number>) || {}
  const radar: RadarScores = {
    era_fit: clamp(radarRaw.era_fit ?? 50),
    boss_match: clamp(radarRaw.boss_match ?? 50),
    monetization: clamp(radarRaw.monetization ?? 50),
    tech_breakthrough: clamp(radarRaw.tech_breakthrough ?? 50),
    resource_cost: clamp(radarRaw.resource_cost ?? 50),
    risk_index: clamp(radarRaw.risk_index ?? 50),
  }

  let bossMatchBreakdown: WarRoomResult['bossMatchBreakdown']
  try {
    const boss = await loadBossState()
    const breakdown = scoreBossProjectFit(boss, prd, radar)
    radar.boss_match = breakdown.finalScore
    bossMatchBreakdown = {
      llmScore: breakdown.llmScore,
      structuredScore: breakdown.structuredScore,
      finalScore: breakdown.finalScore,
      reasons: breakdown.reasons,
    }
    const modelingLog: WarRoomLog = {
      role: 'Boss建模引擎',
      verdict: `Boss匹配修正 ${breakdown.llmScore} → ${breakdown.finalScore}（结构化 ${breakdown.structuredScore}）｜${breakdown.reasons.join('；')}`,
      timestamp: Date.now(),
    }
    logs.push(modelingLog)
    onLog?.(modelingLog)
  } catch { /* profiling-weighted score is best effort */ }

  const fallbackSurvival = calculateFallback(radar)
  const survivalRate = clamp(
    typeof summaryData?.survival_rate === 'number'
      ? ((summaryData.survival_rate as number) * 0.6 + fallbackSurvival * 0.4)
      : fallbackSurvival
  )

  return {
    radar,
    survivalRate,
    survivalGrade: (summaryData?.survival_grade as string) || gradeFromRate(survivalRate),
    summary: (summaryData?.summary as string) || '推演数据不足，仅供参考',
    recommendation: (summaryData?.recommendation as string) || '建议补充更多项目信息后重新推演',
    logs,
    bossMatchBreakdown,
  }
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(v)))
}

function calculateFallback(r: RadarScores): number {
  return clamp(
    (r.era_fit + r.boss_match + r.monetization + r.tech_breakthrough - r.resource_cost * 0.5 - r.risk_index * 0.5) / 4
  )
}

function gradeFromRate(rate: number): string {
  if (rate >= 95) return 'S'
  if (rate >= 80) return 'A'
  if (rate >= 65) return 'B'
  if (rate >= 50) return 'C'
  if (rate >= 35) return 'D'
  return 'F'
}
