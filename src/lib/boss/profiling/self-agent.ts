import type { NormalizedBossProfile, ProfilingEvidenceTrace } from './types'
import type { SelfAgentConstitution } from '../../../features/profiling-studio/types'

function unique(values: Array<string | undefined | null>, limit = 10): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const cleaned = (value || '').trim()
    if (!cleaned || seen.has(cleaned)) continue
    seen.add(cleaned)
    result.push(cleaned)
    if (result.length >= limit) break
  }
  return result
}

function evidenceLine(trace: ProfilingEvidenceTrace): string {
  return `${trace.source} / ${trace.reference}: ${trace.insight}（置信 ${Math.round(trace.confidence * 100)}%）`
}

export function buildSelfAgentConstitution(
  normalized: NormalizedBossProfile,
  runId?: string,
): SelfAgentConstitution {
  const style = normalized.operational.preferredStyle
  const evidenceTrace = normalized.evidenceTrace || []
  const measurementBoundaries = unique([
    ...(normalized.measurementNotes || []),
    ...(normalized.pendingVerification || []),
    '这份画像服务于自我理解与个人代理人建模，不用于医学诊断、招聘筛选、信贷、保险或正式资质认证。',
    '代理人只能把画像作为偏好和工作方式线索，不能把任何单一测验结果当作高风险判断依据。',
  ], 8)

  const cognitiveOperatingManual = unique([
    normalized.summary.promptSummary,
    style === 'analytical' ? '先建立变量、证据和边界，再给方案。' : '',
    style === 'visionary' ? '先确认长期意义和方向，再拆成阶段路径。' : '',
    style === 'pragmatic' ? '先收束优先级，再给可执行动作。' : '',
    style === 'creative' ? '先保留意象、风格和表达张力，再补结构。' : '',
    ...normalized.operational.understandingModes,
    ...normalized.operational.integrationGoals,
  ], 8)

  const expressionDNA = unique([
    ...normalized.operational.explanationPreferences,
    ...normalized.operational.addictiveFormats,
    ...normalized.operational.resonanceHooks.slice(0, 3),
  ], 8)

  const decisionBoundaries = unique([
    normalized.operational.decisionSpeed === 'analytical'
      ? '遇到复杂决策时必须先列证据和替代解释。'
      : '',
    normalized.operational.riskTolerance >= 70
      ? '高兴奋、高风险方向必须加一层反事实检查。'
      : '风险较高的行动要先做小样本验证。',
    normalized.operational.innovationBias >= 70
      ? '允许提出非传统方案，但必须写清实验成本和回滚条件。'
      : '',
    ...normalized.operational.antiPatterns.map(item => `避免触发：${item}`),
  ], 8)

  const delegableTasks = unique([
    '整理资料、归纳证据、生成备选方案。',
    '根据既有画像偏好改写解释方式、报告结构和任务拆解。',
    '为低风险学习、创作、产品构思生成草案和检查清单。',
    ...normalized.recommendations.recommendedAgents.map(agent => `可调度 ${agent} 视角做辅助分析。`),
  ], 8)

  const mustAskUserTasks = unique([
    '涉及医学、法律、财务、招聘、升学、重大关系或不可逆承诺的判断。',
    '需要代表用户发出承诺、付款、公开发布、删除数据或改变长期策略的任务。',
    '画像证据冲突、置信区间过宽、或者用户表达出强烈不确定时。',
    ...measurementBoundaries.slice(0, 2),
  ], 8)

  return {
    id: `self-agent-${runId || Date.now()}`,
    generatedAt: new Date().toISOString(),
    sourceRunId: runId,
    headline: `未来代理人宪法：${normalized.summary.headline}`,
    cognitiveOperatingManual,
    expressionDNA,
    decisionBoundaries,
    authorizationBoundaries: [
      '默认只做建议、整理、推演、草案和提醒。',
      '任何高风险或外部不可逆动作都必须先询问用户。',
      '如果画像证据不足，代理人必须说明不确定性，而不是替用户下结论。',
    ],
    forbiddenZones: [
      '不得基于画像自动诊断疾病、评估智商认证、筛选雇佣或给出资质结论。',
      '不得把原创矩阵短测解释为 Raven APM 正式分数。',
      '不得在缺少证据链时冒充了解用户。',
    ],
    evidenceLedger: evidenceTrace.length > 0
      ? evidenceTrace.slice(0, 8).map(evidenceLine)
      : ['当前画像来自已完成测评源的融合结果；后续每次写回都应补充证据账本。'],
    delegableTasks,
    mustAskUserTasks,
    calibrationQuestions: unique([
      `当我把你描述为「${normalized.summary.headline}」时，哪里最不像你？`,
      `当前阶段「${normalized.operational.currentFocus || '主线'}」是否仍然成立？`,
      '哪些偏好是稳定的，哪些只是最近状态造成的？',
      '哪些任务你愿意交给未来代理人，哪些必须自己决定？',
    ], 6),
    measurementBoundaries,
  }
}
