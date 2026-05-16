import type { CouncilActivatedAgent } from './activation'
import type { CouncilLaunchReadinessPack } from './action-pack'
import type { CouncilBaoyuVisualPlan } from './baoyu'
import type { CouncilDebateMap, CouncilDebateScene, CouncilVerdictLedger } from './debate-theater'
import type { CouncilNuwaEvidenceRegistry } from './distillation-evidence'
import type { CouncilQualityGate, CouncilQualityRevisionRound } from './quality-gate'
import type { CouncilRuntimeEvidenceLedger } from './runtime-evidence'
import type { CouncilSelection } from './selector'

export type CouncilExcellenceDimensionId =
  | 'distillation-depth'
  | 'match-debate-trace'
  | 'prd-actionability'
  | 'quality-revision'
  | 'master-prd-fullstack'
  | 'runtime-validation'

export interface CouncilExcellenceDimension {
  id: CouncilExcellenceDimensionId
  label: string
  score: number
  weight: number
  evidence: string[]
  gaps: string[]
  nextMoves: string[]
}

export interface CouncilExcellenceSprintItem {
  label: string
  ownerHint: string
  proof: string
}

export interface CouncilExcellenceAudit {
  score: number
  targetScore: number
  gapToTarget: number
  scoreLabel: string
  verdict: string
  dimensions: CouncilExcellenceDimension[]
  mustNotClaimYet: string[]
  nextSprint: CouncilExcellenceSprintItem[]
  proofChain: string[]
}

interface CouncilExcellenceAuditInput {
  selection: CouncilSelection
  activatedAgents: CouncilActivatedAgent[]
  qualityGate: CouncilQualityGate
  qualityRevisionHistory: CouncilQualityRevisionRound[]
  debateScenes: CouncilDebateScene[]
  debateMap: CouncilDebateMap
  verdictLedger: CouncilVerdictLedger
  actionPack: CouncilLaunchReadinessPack
  baoyuVisualPlans: CouncilBaoyuVisualPlan[]
  runtimeEvidence?: CouncilRuntimeEvidenceLedger
  nuwaEvidenceRegistry?: CouncilNuwaEvidenceRegistry
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function scoreLabel(score: number): string {
  if (score >= 95) return '95 分代表性候选'
  if (score >= 90) return '90 分可开工版本'
  if (score >= 82) return '高潜力原型'
  return '必须继续返修'
}

function weightedAverage(dimensions: CouncilExcellenceDimension[]): number {
  const totalWeight = dimensions.reduce((sum, item) => sum + item.weight, 0)
  if (totalWeight <= 0) return 0
  return clampScore(dimensions.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight)
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

function phaseCount(scenes: CouncilDebateScene[]): number {
  return new Set(scenes.map((scene) => scene.phaseLabel).filter(Boolean)).size
}

function dimension(
  id: CouncilExcellenceDimensionId,
  label: string,
  score: number,
  weight: number,
  evidence: string[],
  gaps: string[],
  nextMoves: string[],
): CouncilExcellenceDimension {
  return {
    id,
    label,
    score: clampScore(score),
    weight,
    evidence: unique(evidence, 5),
    gaps: unique(gaps, 4),
    nextMoves: unique(nextMoves, 4),
  }
}

export function buildCouncilExcellenceAudit(input: CouncilExcellenceAuditInput): CouncilExcellenceAudit {
  const seats = input.selection.seats
  const importedCount = seats.filter((seat) => seat.persona.distillationStatus === 'imported').length
  const sixStreamCount = seats.filter((seat) => seat.persona.sourceCoverage.researchStreams.length >= 6).length
  const nuwaSeedCount = seats.filter((seat) => Boolean(seat.persona.nuwaSkillId)).length
  const verdictCount =
    input.verdictLedger.kept.length +
    input.verdictLedger.cut.length +
    input.verdictLedger.revised.length +
    input.verdictLedger.prdImpacts.length
  const revisionPassed =
    input.qualityGate.finalGateStatus === 'approved' ||
    input.qualityRevisionHistory.some((round) => round.finalGateStatus === 'approved')
  const runtimeEvidence = input.runtimeEvidence
  const nuwaEvidenceRegistry = input.nuwaEvidenceRegistry
  const nuwaEvidenceAverage = nuwaEvidenceRegistry
    ? Math.round((nuwaEvidenceRegistry.averageLocalUseScore * 0.72) + (nuwaEvidenceRegistry.averageSourceAuditScore * 0.28))
    : undefined
  const provedRuntimeItems = runtimeEvidence?.evidenceItems.filter((item) => item.status === 'proved').length || 0
  const runtimeItemCount = runtimeEvidence?.evidenceItems.length || 0
  const runtimeEvidenceScore = runtimeEvidence
    ? 78 +
      (runtimeEvidence.modelJudgeUsed ? 5 : 0) +
      (runtimeEvidence.stageTrace.length >= 6 ? 3 : 0) +
      (runtimeEvidence.sceneCount >= 12 ? 3 : 0) +
      (runtimeEvidence.qualityStatus === 'approved' ? 3 : 0) +
      (runtimeEvidence.actionTaskCount >= 10 ? 3 : 0) +
      (runtimeItemCount ? (provedRuntimeItems / runtimeItemCount) * 3 : 0)
    : 82 + (input.activatedAgents.length >= seats.length ? 3 : 0) + (input.qualityGate.finalGateStatus === 'approved' ? 2 : 0)
  const qualityRevisionBaseScore = Math.round((input.qualityGate.score + input.qualityGate.prdCompletenessScore + input.qualityGate.launchReadinessScore) / 3) + (revisionPassed ? 2 : 0)
  const qualityRevisionScore = Math.max(
    qualityRevisionBaseScore,
    input.qualityGate.checks.length >= 8 && input.qualityGate.typedDeliberation.length > 0 ? 88 : qualityRevisionBaseScore,
  )
  const masterFullstackBaseScore = Math.round((input.qualityGate.prdCompletenessScore + input.qualityGate.launchReadinessScore + input.actionPack.score) / 3)
  const masterFullstackScore = Math.max(
    masterFullstackBaseScore,
    input.actionPack.score >= 80 && input.baoyuVisualPlans.length >= 4 ? 88 : masterFullstackBaseScore,
  )

  const dimensions: CouncilExcellenceDimension[] = [
    dimension(
      'distillation-depth',
      '真实人类蒸馏深度',
      nuwaEvidenceAverage ??
        82 + (importedCount / Math.max(1, seats.length)) * 8 + (sixStreamCount / Math.max(1, seats.length)) * 5 + (nuwaSeedCount / Math.max(1, seats.length)) * 3,
      0.14,
      nuwaEvidenceRegistry
        ? [
            nuwaEvidenceRegistry.summary,
            `localUseScore=${nuwaEvidenceRegistry.averageLocalUseScore}，sourceAuditScore=${nuwaEvidenceRegistry.averageSourceAuditScore}。`,
            `${nuwaEvidenceRegistry.sourceSeededCount}/${nuwaEvidenceRegistry.personaCount} 位有 Nuwa seed 或本地映射。`,
            `${nuwaEvidenceRegistry.manualSourceAuditedCount}/${nuwaEvidenceRegistry.personaCount} 位完成人工来源级复核。`,
          ]
        : [
            `${importedCount}/${seats.length} 位入选角色标记为已蒸馏。`,
            `${sixStreamCount}/${seats.length} 位具备六路调研结构。`,
            `${nuwaSeedCount}/${seats.length} 位已有 nuwa-skill 种子或本地 Nuwa 映射。`,
          ],
      [
        '95 分前必须把每位入选角色的 SKILL.md 与来源索引做人工抽样审阅。',
        '不能把“本地初蒸馏完成”夸大成真人授权或完整人格复制。',
        ...(nuwaEvidenceRegistry?.gapTo95.slice(0, 2) || []),
      ],
      [
        '逐个抽查 6 个入选角色的来源、反模式、诚实边界和验证题。',
        '为每个角色补一条真实案例验证问题，并记录通过/不通过。',
      ],
    ),
    dimension(
      'match-debate-trace',
      '深度匹配与辩论可追溯',
      72 + phaseCount(input.debateScenes) * 3 + Math.min(12, input.debateMap.edges.length * 0.35) + Math.min(8, verdictCount),
      0.2,
      [
        `${input.debateScenes.length} 幕辩论场景。`,
        `${phaseCount(input.debateScenes)} 个阶段。`,
        `${input.debateMap.edges.length} 条关系边。`,
        `${verdictCount} 条裁决账本记录。`,
      ],
      input.debateScenes.length >= 18 && input.debateMap.edges.length >= 12
        ? ['95 分前仍要人工抽查 5 条结论是否能回到原始发言。']
        : ['剧场场景或关系边不足，Boss 还不能充分看见思考发生。'],
      [
        '抽查 PRD 中 5 个关键结论，逐条标注来源场景、质询对象和裁决结果。',
        '把最强反方意见提升为可点击的“为什么没采用”解释。',
      ],
    ),
    dimension(
      'prd-actionability',
      'PRD 与行动包可开工性',
      input.actionPack.score,
      0.2,
      [
        `行动包评分 ${input.actionPack.score}。`,
        `${input.actionPack.taskGroups.length} 条任务泳道。`,
        `${input.actionPack.milestones.length} 个里程碑。`,
      ],
      input.actionPack.score >= 92
        ? ['95 分前仍要用真实工程拆票验证任务粒度。']
        : ['行动包尚未达到 92，说明任务或验收标准仍可继续细化。'],
      [
        '把行动包导出为工程任务清单，检查每条是否有 owner、验收、来源。',
        '把 P0 任务压成 1 周内可完成的最小闭环。',
      ],
    ),
    dimension(
      'quality-revision',
      '质量闸门与返修诚实性',
      qualityRevisionScore,
      0.2,
      [
        `质量闸门 ${input.qualityGate.score}。`,
        `PRD 完整度 ${input.qualityGate.prdCompletenessScore}。`,
        `上线准备度 ${input.qualityGate.launchReadinessScore}。`,
        `${input.qualityRevisionHistory.length} 轮返修记录。`,
      ],
      input.qualityGate.status === 'approved'
        ? ['95 分前需要真实运行日志与导出复验，不只依赖静态质量门。']
        : input.qualityGate.checks.flatMap((check) => check.requiredFixes).slice(0, 4),
      [
        '把质量闸门失败项转成下一轮自动返修输入。',
        '导出后复查质量闸门、行动包、剧场是否同时存在。',
      ],
    ),
    dimension(
      'master-prd-fullstack',
      '大师级全栈 PRD 与技术蓝图',
      masterFullstackScore,
      0.14,
      [
        `PRD 完整度 ${input.qualityGate.prdCompletenessScore}。`,
        `上线准备度 ${input.qualityGate.launchReadinessScore}。`,
        `行动包 ${input.actionPack.score}。`,
      ],
      [
        '95 分前需要抽查前端、后端、数据库、API、AI 策略、安全、部署和测试章节是否能直接拆票。',
        '共识追溯里的关键裁决需要能回到原始角色发言或裁决账本。',
      ],
      [
        '从 PRD 中抽 8 条关键条款，分别拆成工程任务、API 契约或测试验收。',
        '检查共识追溯是否覆盖主张、质询、吸收、裁掉四条证据线。',
      ],
    ),
    dimension(
      'runtime-validation',
      '真实运行与用户验证',
      runtimeEvidenceScore,
      0.12,
      runtimeEvidence
        ? [
            `runtime runId=${runtimeEvidence.runId}，durationMs=${runtimeEvidence.durationMs}。`,
            `decisionSource=${runtimeEvidence.decisionSource}，stageTrace=${runtimeEvidence.stageTrace.length}。`,
            `messages=${runtimeEvidence.messageCount}，scenes=${runtimeEvidence.sceneCount}，quality=${runtimeEvidence.qualityScore}/${runtimeEvidence.qualityStatus}。`,
            `proved runtime items=${provedRuntimeItems}/${runtimeItemCount}。`,
          ]
        : [
            `${input.activatedAgents.length}/${seats.length} 位角色已进入激活结果。`,
            '自动化测试、类型检查、构建和浏览器 DOM 检查可作为工程证据。',
          ],
      [
        runtimeEvidence
          ? runtimeEvidence.nextProofNeeded.find((proof) => proof.includes('深度匹配裁判')) || ''
          : '仍缺一次带真实 LLM 配置的 2-5 分钟完整深度运行录像或日志。',
        '仍缺 5-8 人稳审真实小白用户验证。',
        'Electron CDP 未暴露 page target 时，只能说进程启动，不能冒充完整 Electron DOM 验证。',
      ].filter(Boolean),
      [
        '跑一次真实模型深度匹配到 PRD、共识追溯和行动包导出的完整链路，保存运行摘要。',
        '找 5-8 个用户按小白执行模式完成一次输入、阅读、导出，至少 5 人留证且 4 人通过。',
      ],
    ),
  ]

  const score = weightedAverage(dimensions)
  const targetScore = 95
  const gapToTarget = Math.max(0, targetScore - score)
  const weakest = [...dimensions].sort((a, b) => a.score - b.score).slice(0, 3)

  return {
    score,
    targetScore,
    gapToTarget,
    scoreLabel: scoreLabel(score),
    verdict:
      score >= 95
        ? '已具备 95 分代表性候选条件，但仍必须保留真实用户复验。'
        : `当前可客观视为 ${score} 分版本；距离 95 分还差 ${gapToTarget} 分，主要卡在 ${weakest.map((item) => item.label).join('、')}。`,
    dimensions,
    mustNotClaimYet: unique(
      [
        '不能声称 36 位角色已完成真人级、来源级、人工复核级深蒸馏。',
        '不能声称已经通过真实小白用户验证。',
        runtimeEvidence?.modelJudgeUsed
          ? ''
          : '不能声称已经完成真实深度模型裁判长跑；fallback 必须标记为 fallback。',
        '不能声称 Electron 页面 DOM 已完整自动验收，除非实际拿到 page target 或截图证据。',
        '不能声称 Remotion 舞台已达到电影级，除非剧场 Act、冲突和质量分数已绑定真实分镜并截图/视频验收。',
      ].filter(Boolean),
      4,
    ),
    nextSprint: [
      {
        label: '6 角色来源抽检',
        ownerHint: 'Nuwa 蒸馏席位',
        proof: '每个角色提交 SKILL.md、六路来源索引、反模式、诚实边界和 2 道验证题。',
      },
      {
        label: '真实深度运行日志',
        ownerHint: '工程 + 主持席位',
        proof: '保存一次从深度匹配、博弈、质量闸门、完整 PRD、共识追溯到行动包导出的完整运行摘要。',
      },
      {
        label: 'Remotion 剧场分镜复验',
        ownerHint: '视觉 + 前端席位',
        proof: '每个 Act 显示当前冲突、吸收路径、质量分和 PRD 条款映射，并通过截图检查。',
      },
      {
        label: '5-8 人小白稳审验证',
        ownerHint: 'Boss + 研究席位',
        proof: '至少 5 人留证且 4 人能不解释完成一次输入、看懂下一步、导出或复制结果。',
      },
    ],
    proofChain: [
      `selection=${seats.length} seats`,
      `scenes=${input.debateScenes.length}`,
      `edges=${input.debateMap.edges.length}`,
      `quality=${input.qualityGate.score}/${input.qualityGate.finalGateStatus}`,
      `actionPack=${input.actionPack.score}`,
      `masterPrd=${input.qualityGate.prdCompletenessScore}/${input.qualityGate.launchReadinessScore}`,
      nuwaEvidenceRegistry ? `nuwaEvidence=${nuwaEvidenceRegistry.localReadyCount}/${nuwaEvidenceRegistry.personaCount}/manual=${nuwaEvidenceRegistry.manualSourceAuditedCount}` : 'nuwaEvidence=not-recorded',
      runtimeEvidence ? `runtime=${runtimeEvidence.runId}/${runtimeEvidence.decisionSource}/${runtimeEvidence.durationMs}ms` : 'runtime=not-recorded',
    ],
  }
}

export function renderCouncilExcellenceAuditMarkdown(audit: CouncilExcellenceAudit): string {
  return [
    '## 95 分卓越审计',
    '',
    `- score: ${audit.score} / ${audit.targetScore}`,
    `- gapToTarget: ${audit.gapToTarget}`,
    `- label: ${audit.scoreLabel}`,
    `- verdict: ${audit.verdict}`,
    '',
    '### 维度评分',
    ...audit.dimensions.map((item) =>
      [
        `#### ${item.label}`,
        `- score: ${item.score}`,
        `- evidence: ${item.evidence.join(' / ')}`,
        `- gaps: ${item.gaps.join(' / ') || 'none'}`,
        `- nextMoves: ${item.nextMoves.join(' / ')}`,
      ].join('\n'),
    ),
    '',
    '### 现在不能声称',
    ...audit.mustNotClaimYet.map((item) => `- ${item}`),
    '',
    '### 下一轮冲刺',
    ...audit.nextSprint.map((item) => `- ${item.label}｜owner: ${item.ownerHint}｜proof: ${item.proof}`),
    '',
    `### 证据链`,
    ...audit.proofChain.map((item) => `- ${item}`),
  ].join('\n')
}
