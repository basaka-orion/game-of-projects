import {
  normalizeCouncilRuntimeHistoryProof,
  type CouncilRuntimeHistoryLedger,
  type CouncilRuntimeHistoryRecord,
} from './runtime-history'
import type { CouncilUserValidationLedger } from './user-validation'

export interface CouncilRuntimeWisdomSignal {
  id: string
  label: string
  severity: 'low' | 'medium' | 'high'
  evidence: string
}

export interface CouncilRuntimeWisdomContext {
  historyCount: number
  confidence: number
  lastRunId?: string
  intelligenceSignals: CouncilRuntimeWisdomSignal[]
  avoidRepeating: string[]
  nextRunConstraints: string[]
  requiredProof: string[]
  promptFragment: string
  summary: string
}

function unique(values: string[], max: number): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values) {
    const next = value.replace(/\s+/g, ' ').trim()
    if (!next || seen.has(next)) continue
    seen.add(next)
    output.push(next)
    if (output.length >= max) break
  }
  return output
}

function recent(records: CouncilRuntimeHistoryRecord[], count = 5): CouncilRuntimeHistoryRecord[] {
  return records.slice(0, count)
}

function signal(id: string, label: string, severity: CouncilRuntimeWisdomSignal['severity'], evidence: string): CouncilRuntimeWisdomSignal {
  return { id, label, severity, evidence }
}

export function buildCouncilRuntimeWisdomContext(
  history: CouncilRuntimeHistoryLedger,
  userValidation?: CouncilUserValidationLedger,
): CouncilRuntimeWisdomContext {
  const records = recent(history.records)
  const latest = records[0]
  const signals: CouncilRuntimeWisdomSignal[] = []
  const blockers = unique(records.flatMap((record) => record.blockers.map(normalizeCouncilRuntimeHistoryProof)), 10)

  if (history.stats.totalRuns === 0) {
    signals.push(signal('no-history', '没有历史运行证据', 'medium', '系统还没有可学习的真实 run，第一轮必须严格留证。'))
  }
  if (history.stats.provedDeepRuns === 0) {
    signals.push(signal('no-proved-deep-run', '尚无 proved 深度长跑', 'high', '历史中没有任何一轮同时满足 deep-model、120s、完整 trace、剧场和质量门。'))
  }
  if (history.stats.fallbackRuns > 0) {
    signals.push(signal('fallback-seen', '历史出现 fallback', 'high', `${history.stats.fallbackRuns} 次运行使用 local-fallback，下一轮必须优先检查模型裁判链路。`))
  }
  if (records.some((record) => record.qualityScore < 90)) {
    signals.push(signal('quality-under-90', '质量门低于 90', 'medium', '最近运行里出现 90 分以下质量门，下一轮要提高 PRD 细度和验收条款。'))
  }
  if (userValidation?.stats.certificationStatus === 'passed') {
    signals.push(
      signal(
        'user-validation-passed',
        '真实用户验证已过线',
        'low',
        `${userValidation.stats.passedParticipants}/${userValidation.stats.totalParticipants} 个小白验证通过，可作为外部校准证据。`,
      ),
    )
  } else {
    signals.push(signal('missing-user-validation', '缺真实用户验证', 'high', '历史缺口反复出现真实小白用户验证，不能只靠模型自评。'))
  }
  if (blockers.some((item) => item.includes('运行时长') || item.includes('120s'))) {
    signals.push(signal('short-run', '运行时长不足', 'medium', '历史运行未达到默认深度模式 120 秒，下一轮不能把短跑当深度长跑。'))
  }

  const avoidRepeating = unique(
    [
      history.stats.fallbackRuns > 0 ? '不要把 local-fallback 当成模型深度裁判；必须在推荐理由里标记降级。' : '',
      history.stats.provedDeepRuns === 0 ? '不要声称已完成 2-5 分钟深度长跑，除非本轮证据账本 proved。' : '',
      ...blockers.map((item) => `不要重复缺口：${item}`),
    ],
    8,
  )
  const nextRunConstraints = unique(
    [
      '匹配阶段必须产生 6 个 stage trace：问题画像、Creative DNA、候选池、模型裁判、协作矩阵、推荐成型。',
      '六阶段博弈必须把反对、修正、吸收、裁掉写成可回放场景。',
      '质量闸门必须达到 90+ approved，否则进入返修链，不得假装神作。',
      history.stats.provedDeepRuns === 0 ? '如果本轮使用 deep-model，目标是产生第一条 deepRunCertification=proved 的真实历史记录。' : '',
      '导出必须包含 PRD、辩论剧场、关系地图、裁决账本、质量闸门、运行证据、Nuwa 证据和 Baoyu 图文计划。',
    ],
    7,
  )
  const requiredProof = unique(
    [
      '本轮结束后必须保存 runtime history record。',
      '必须显示 proved/partial/missing/fallback，不得隐藏不通过项。',
      userValidation?.stats.certificationStatus === 'passed'
        ? `必须引用真实小白用户验证账本：${userValidation.stats.passedParticipants}/${userValidation.stats.totalParticipants} 通过。`
        : '必须继续要求 5-8 人稳审真实小白用户验证作为系统智慧外部校准。',
      ...signals.filter((item) => item.severity === 'high').map((item) => item.evidence),
    ],
    7,
  )
  const confidence = Math.min(0.94, 0.42 + history.stats.totalRuns * 0.06 + history.stats.provedDeepRuns * 0.12)
  const summary = history.stats.totalRuns
    ? `已从 ${history.stats.totalRuns} 次运行学习：proved=${history.stats.provedDeepRuns}，partial=${history.stats.partialDeepRuns}，fallback=${history.stats.fallbackRuns}，bestQuality=${history.stats.bestQualityScore}。`
    : '尚无历史运行，系统会把第一轮作为严肃留证基线。'
  const promptFragment = [
    '## 运行智慧反馈',
    summary,
    '',
    '### 智慧信号',
    ...signals.map((item) => `- ${item.severity}: ${item.label}｜${item.evidence}`),
    '',
    '### 下一轮约束',
    ...nextRunConstraints.map((item) => `- ${item}`),
    '',
    '### 不要重复',
    ...avoidRepeating.map((item) => `- ${item}`),
    '',
    '### 必须留下的证据',
    ...requiredProof.map((item) => `- ${item}`),
  ].join('\n')

  return {
    historyCount: history.stats.totalRuns,
    confidence,
    lastRunId: latest?.runId,
    intelligenceSignals: signals,
    avoidRepeating,
    nextRunConstraints,
    requiredProof,
    promptFragment,
    summary,
  }
}

export function renderCouncilRuntimeWisdomMarkdown(wisdom: CouncilRuntimeWisdomContext): string {
  return [
    '## 运行智慧反馈',
    '',
    `- historyCount: ${wisdom.historyCount}`,
    `- confidence: ${wisdom.confidence.toFixed(2)}`,
    `- lastRunId: ${wisdom.lastRunId || 'none'}`,
    `- summary: ${wisdom.summary}`,
    '',
    '### 智慧信号',
    ...wisdom.intelligenceSignals.map((item) => `- ${item.severity}: ${item.label}｜${item.evidence}`),
    '',
    '### 下一轮约束',
    ...wisdom.nextRunConstraints.map((item) => `- ${item}`),
    '',
    '### 不要重复',
    ...wisdom.avoidRepeating.map((item) => `- ${item}`),
    '',
    '### 必须留下的证据',
    ...wisdom.requiredProof.map((item) => `- ${item}`),
  ].join('\n')
}
