import type { BossState } from '../boss/profile'
import type { StoredProject } from '../db/store'
import type { SynapseRow } from '../db/repository'
import type { ProjectTaxonomy, StructuredAnalysis } from '../ai/classifier'

export type VisionPillarId =
  | 'project_intelligence'
  | 'boss_modeling'
  | 'memory_system'
  | 'knowledge_workflow'
  | 'evolution_loop'

export type VisionStatus = 'strong' | 'building' | 'lagging'

export interface VisionPillar {
  id: VisionPillarId
  title: string
  score: number
  status: VisionStatus
  summary: string
  evidence: string[]
  nextMove: string
}

export interface ProjectInsight {
  id: string
  title: string
  posture: 'breakthrough' | 'connect' | 'stabilize' | 'rebuild'
  score: number
  synergyCount: number
  strengths: string[]
  weaknesses: string[]
  breakthroughs: string[]
}

export interface VisionAlignmentReport {
  overallScore: number
  narrative: string
  pillars: VisionPillar[]
  portfolioStrengths: string[]
  portfolioGaps: string[]
  portfolioBreakthroughs: string[]
  nextActions: string[]
  topSynapses: Array<{ label: string; strength: number; reason: string }>
  projectInsights: ProjectInsight[]
}

export interface VisionAlignmentInput {
  projects: StoredProject[]
  taxonomies: Record<string, { taxonomy: ProjectTaxonomy; analysis: StructuredAnalysis }>
  synapses: SynapseRow[]
  bossState: BossState | null
  bossMemoryCount: number
  wikiPageCount: number
  wikiSourceCount: number
  drawerCount: number
  uncompiledDrawerCount: number
  wingCount: number
  skillEvolutionCount: number
  scheduledTaskCount: number
  teamCount: number
  customAgentCount: number
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function ratio(part: number, total: number): number {
  if (total <= 0) return 0
  return part / total
}

function statusFromScore(score: number): VisionStatus {
  if (score >= 75) return 'strong'
  if (score >= 45) return 'building'
  return 'lagging'
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function uniquePush(target: string[], value: string | undefined) {
  if (!value) return
  if (!target.includes(value)) target.push(value)
}

function describeProjectPosture(score: number, synergyCount: number, survivalRate: number): ProjectInsight['posture'] {
  if (score >= 74 && survivalRate >= 60) return 'breakthrough'
  if (synergyCount >= 2 && survivalRate >= 55) return 'connect'
  if (survivalRate >= 55) return 'stabilize'
  return 'rebuild'
}

function postureLabel(posture: ProjectInsight['posture']): string {
  switch (posture) {
    case 'breakthrough':
      return '突破候选'
    case 'connect':
      return '连接放大'
    case 'stabilize':
      return '继续孵化'
    case 'rebuild':
      return '需要重构'
  }
}

export function computeVisionAlignmentReport(input: VisionAlignmentInput): VisionAlignmentReport {
  const {
    projects,
    taxonomies,
    synapses,
    bossState,
    bossMemoryCount,
    wikiPageCount,
    wikiSourceCount,
    drawerCount,
    uncompiledDrawerCount,
    wingCount,
    skillEvolutionCount,
    scheduledTaskCount,
    teamCount,
    customAgentCount,
  } = input

  const taxonomyEntries = Object.values(taxonomies)
  const taxonomyCoverage = ratio(taxonomyEntries.length, projects.length)
  const avgEraRelevance = average(taxonomyEntries.map(t => t.analysis.eraRelevance))
  const avgBreakthrough = average(taxonomyEntries.map(t => t.analysis.breakthroughPotential))
  const avgSurvival = average(projects.map(project => project.survivalRate))
  const synapseDensity = projects.length > 1 ? synapses.length / Math.max(projects.length - 1, 1) : 0

  const projectPillarScore = clamp(
    taxonomyCoverage * 42 +
    avgEraRelevance * 0.24 +
    avgBreakthrough * 0.22 +
    Math.min(synapseDensity * 18, 18) +
    avgSurvival * 0.12
  )

  const interestsCount = bossState?.interests.length || 0
  const dislikesCount = bossState?.dislikes.length || 0
  const goalSignals = (bossState?.shortTermGoals.length || 0) + (bossState?.longTermVision ? 1 : 0)
  const hasCurrentFocus = Boolean(bossState?.currentFocus)
  const hasProfilingSummary = Boolean(bossState?.profilingSummaryText)
  const cognitiveSignalCount =
    (bossState?.cognitiveProfile.excitementTriggers.length || 0) +
    (bossState?.cognitiveProfile.explanationPreferences.length || 0) +
    (bossState?.cognitiveProfile.integrationGoals.length || 0)
  const bossIdentityCompleteness = clamp(
    (bossState?.name && bossState.name !== 'Boss' ? 18 : 0) +
    Math.min(interestsCount * 10, 24) +
    Math.min(dislikesCount * 6, 12) +
    Math.min(goalSignals * 12, 24) +
    (hasCurrentFocus ? 10 : 0) +
    (hasProfilingSummary ? 12 : 0) +
    Math.min(cognitiveSignalCount * 2, 14) +
    Math.min(bossMemoryCount * 2, 18)
  )

  const bossPillarScore = clamp(
    bossIdentityCompleteness * 0.68 +
    Math.min((bossState?.projectsEvaluated || 0) * 3, 18) +
    Math.min((bossState?.projectsPursued || 0) * 3, 14)
  )

  const drawerCompileRatio = ratio(Math.max(drawerCount - uncompiledDrawerCount, 0), drawerCount)
  const memoryPillarScore = clamp(
    Math.min(drawerCount * 4, 34) +
    Math.min(wingCount * 8, 24) +
    drawerCompileRatio * 24 +
    Math.min(bossMemoryCount * 1.5, 18)
  )

  const knowledgePillarScore = clamp(
    Math.min(wikiSourceCount * 3, 28) +
    Math.min(wikiPageCount * 2.2, 32) +
    ratio(wikiPageCount, wikiSourceCount || 1) * 18 +
    Math.min(drawerCompileRatio * 22, 22)
  )

  const evolutionPillarScore = clamp(
    Math.min(skillEvolutionCount * 8, 34) +
    Math.min(scheduledTaskCount * 9, 26) +
    Math.min(teamCount * 10, 20) +
    Math.min(customAgentCount * 5, 20)
  )

  const projectPillar: VisionPillar = {
    id: 'project_intelligence',
    title: '项目智能',
    score: projectPillarScore,
    status: statusFromScore(projectPillarScore),
    summary:
      projectPillarScore >= 75
        ? '项目已经不只是列表，而是在向“可分类、可比较、可连接”的神经元系统靠拢。'
        : projectPillarScore >= 45
          ? '已经有项目分类和推演基础，但组合层分析和突破方向仍然偏弱。'
          : '当前更像项目面板，还没有真正变成面向未来的项目神经系统。',
    evidence: [
      `${projects.length} 个项目`,
      `分类覆盖 ${clamp(taxonomyCoverage * 100)}%`,
      `平均时代相关性 ${clamp(avgEraRelevance)}`,
      `${synapses.length} 条突触`,
    ],
    nextMove:
      taxonomyCoverage < 0.8
        ? '先补齐所有项目的结构化分类，再做跨项目策略。'
        : synapses.length < Math.max(projects.length - 1, 1)
          ? '下一步该把项目之间的合作链、迁移链、混种链补全。'
          : '开始把“项目组合拳”作为默认决策单位，而不是单项目判断。',
  }

  const bossPillar: VisionPillar = {
    id: 'boss_modeling',
    title: 'Boss 建模',
    score: bossPillarScore,
    status: statusFromScore(bossPillarScore),
    summary:
      bossPillarScore >= 75
        ? '系统已经开始围绕 Boss 的偏好、目标和历史决策在持续建模。'
        : bossPillarScore >= 45
          ? 'Boss 画像开始形成，但还没有进入“持续理解用户内核”的稳定状态。'
          : 'Boss 目前仍偏向一个资料卡，而不是这个系统真正的指挥核心。',
    evidence: [
      `${interestsCount} 项兴趣`,
      `${goalSignals} 个目标信号`,
      hasCurrentFocus ? `当前焦点已定义` : '当前焦点待定义',
      hasProfilingSummary ? '多维画像已接入' : '多维画像待接入',
      `${bossMemoryCount} 条 Boss 记忆`,
      `${bossState?.projectsEvaluated || 0} 次项目决策样本`,
    ],
    nextMove:
      !hasCurrentFocus || goalSignals === 0
        ? '补齐长期愿景、短期目标和当前焦点，Boss 才能成为系统的真正北极星。'
        : !hasProfilingSummary
          ? '把多维画像结果稳定写回 Boss 建模层，让项目、知识和自动研究都吃到同一份用户方向。'
        : bossMemoryCount < 12
          ? '提升从对话、项目决策、知识摄取中抽取 Boss 模式的密度。'
          : '把 Boss 的画像继续转成可执行约束，影响项目、知识和代理的排序。',
  }

  const memoryPillar: VisionPillar = {
    id: 'memory_system',
    title: '记忆系统',
    score: memoryPillarScore,
    status: statusFromScore(memoryPillarScore),
    summary:
      memoryPillarScore >= 75
        ? '记忆层已经开始具备“可存、可找、可编译”的长期积累能力。'
        : memoryPillarScore >= 45
          ? 'MemPalace 结构已经有了，但还需要更稳定的采集和编译闭环。'
          : '记忆层还停留在基础仓储阶段，离长期外脑还有明显距离。',
    evidence: [
      `${drawerCount} 个抽屉`,
      `${wingCount} 个翼楼`,
      `${uncompiledDrawerCount} 个待编译`,
      `编译完成率 ${clamp(drawerCompileRatio * 100)}%`,
    ],
    nextMove:
      drawerCount === 0
        ? '先让项目、对话、外部资料都稳定写入抽屉，记忆系统才会有厚度。'
        : uncompiledDrawerCount > Math.max(3, Math.round(drawerCount * 0.35))
          ? '优先清理待编译抽屉，避免记忆层和知识层脱节。'
          : '继续提升对重要抽屉的锻造、确认与可追溯性。',
  }

  const knowledgePillar: VisionPillar = {
    id: 'knowledge_workflow',
    title: '知识工作流',
    score: knowledgePillarScore,
    status: statusFromScore(knowledgePillarScore),
    summary:
      knowledgePillarScore >= 75
        ? '知识库已经接近 Karpathy 的“原始来源 → Wiki → 索引/日志”工作流。'
        : knowledgePillarScore >= 45
          ? '知识工作流基础不错，但离真正的编译型 Wiki 还有运维和规范差距。'
          : '知识库更像内容容器，尚未稳定体现出编译型 Wiki 的积累优势。',
    evidence: [
      `${wikiSourceCount} 个来源`,
      `${wikiPageCount} 个知识页`,
      `每源平均 ${wikiSourceCount > 0 ? (wikiPageCount / wikiSourceCount).toFixed(1) : '0.0'} 页`,
      `抽屉编译率 ${clamp(drawerCompileRatio * 100)}%`,
    ],
    nextMove:
      wikiSourceCount === 0
        ? '先让来源采集成为高频动作，Knowledge Vault 才能真正活起来。'
        : wikiPageCount < wikiSourceCount
          ? '加强每次 ingest 对多页面、多双链和日志的维护。'
          : '下一步要强化 lint、差异更新和查询结果回写，形成自增厚度。',
  }

  const evolutionPillar: VisionPillar = {
    id: 'evolution_loop',
    title: '学习与进化',
    score: evolutionPillarScore,
    status: statusFromScore(evolutionPillarScore),
    summary:
      evolutionPillarScore >= 75
        ? '系统已经拥有代理、自动任务和技能进化的雏形，开始像真正会成长的系统。'
        : evolutionPillarScore >= 45
          ? '进化能力已经发芽，但自动化和多代理协作还没有成为主驱动。'
          : '目前仍然主要依赖手动操作，学习与进化更多停留在概念层。',
    evidence: [
      `${skillEvolutionCount} 条技能进化记录`,
      `${scheduledTaskCount} 个启用任务`,
      `${teamCount} 个团队`,
      `${customAgentCount} 个自定义代理`,
    ],
    nextMove:
      scheduledTaskCount === 0
        ? '先把会重复发生的扫描、编译、研究、提醒变成自动化任务。'
        : skillEvolutionCount < 5
          ? '让技能使用和成功率真正进入记录闭环，进化才不是装饰。'
          : '下一步要强化任务结果回写记忆与知识库，形成完整学习回路。',
  }

  const pillars = [projectPillar, bossPillar, memoryPillar, knowledgePillar, evolutionPillar]
  const overallScore = clamp(average(pillars.map(pillar => pillar.score)))

  const synapseCountByProject = new Map<string, number>()
  for (const synapse of synapses) {
    synapseCountByProject.set(synapse.source_id, (synapseCountByProject.get(synapse.source_id) || 0) + 1)
    synapseCountByProject.set(synapse.target_id, (synapseCountByProject.get(synapse.target_id) || 0) + 1)
  }

  const projectInsights = projects.map(project => {
    const taxonomyEntry = taxonomies[project.id]
    const strengths: string[] = []
    const weaknesses: string[] = []
    const breakthroughs: string[] = []
    const synergyCount = synapseCountByProject.get(project.id) || 0

    uniquePush(strengths, taxonomyEntry?.analysis.strengths[0])
    uniquePush(strengths, taxonomyEntry?.analysis.strengths[1])
    if (project.radar.boss_match >= 70) uniquePush(strengths, '与你的内核和长期驱动力贴合度高')
    if (project.radar.monetization >= 70) uniquePush(strengths, '变现牵引已经初步成型')
    if (project.radar.tech_breakthrough >= 72) uniquePush(strengths, '技术突破空间较大')

    uniquePush(weaknesses, taxonomyEntry?.analysis.weaknesses[0])
    uniquePush(weaknesses, taxonomyEntry?.analysis.weaknesses[1])
    if (project.radar.resource_cost >= 70) uniquePush(weaknesses, '资源消耗偏高，容易拖慢推进速度')
    if (project.radar.risk_index >= 68) uniquePush(weaknesses, '核心风险仍然偏高，需要提前压制')
    if (synergyCount === 0 && projects.length > 1) uniquePush(weaknesses, '尚未进入项目网络，孤岛效应明显')

    uniquePush(breakthroughs, taxonomyEntry?.analysis.opportunities[0])
    uniquePush(
      breakthroughs,
      taxonomyEntry
        ? `可围绕「${taxonomyEntry.taxonomy.industry} × ${taxonomyEntry.taxonomy.innovationType}」做跨界升级`
        : undefined
    )
    if (synergyCount > 0) uniquePush(breakthroughs, `已有 ${synergyCount} 条突触，可从合作链路中放大价值`)
    if (project.radar.era_fit >= 70) uniquePush(breakthroughs, '与当下时代需求贴得较近，适合加快验证')

    const score = clamp(
      project.survivalRate * 0.34 +
      project.radar.era_fit * 0.18 +
      project.radar.boss_match * 0.18 +
      project.radar.tech_breakthrough * 0.18 +
      Math.min(synergyCount * 6, 12)
    )

    return {
      id: project.id,
      title: project.title,
      posture: describeProjectPosture(score, synergyCount, project.survivalRate),
      score,
      synergyCount,
      strengths: strengths.slice(0, 3),
      weaknesses: weaknesses.slice(0, 3),
      breakthroughs: breakthroughs.slice(0, 3),
    }
  }).sort((a, b) => b.score - a.score)

  const industryCounts = new Map<string, number>()
  for (const entry of taxonomyEntries) {
    const industry = entry.taxonomy.industry || '未分类'
    industryCounts.set(industry, (industryCounts.get(industry) || 0) + 1)
  }
  const topIndustry = [...industryCounts.entries()].sort((a, b) => b[1] - a[1])[0]

  const portfolioStrengths: string[] = []
  const portfolioGaps: string[] = []
  const portfolioBreakthroughs: string[] = []
  const nextActions: string[] = []

  if (projects.length > 0) uniquePush(portfolioStrengths, `已经沉淀出 ${projects.length} 个可被系统持续分析的项目神经元`)
  if (taxonomyCoverage >= 0.8) uniquePush(portfolioStrengths, '大部分项目已经进入结构化分类层，后续更容易比较和组合')
  if (synapses.length >= Math.max(projects.length - 1, 1) && projects.length > 1) uniquePush(portfolioStrengths, '项目之间开始形成突触网络，而不是各自独立存在')
  if (wikiPageCount >= 8) uniquePush(portfolioStrengths, '知识页数量已经足以支撑编译式知识积累')
  if (bossMemoryCount >= 10) uniquePush(portfolioStrengths, 'Boss 的行为与偏好开始对系统形成真实约束')

  if (projects.length === 0) uniquePush(portfolioGaps, '系统还没有承载真实项目样本，很多高级能力暂时无从发挥')
  if (taxonomyCoverage < 0.8) uniquePush(portfolioGaps, '项目还没有形成稳定的分类层，分析结果容易停留在描述而不是比较')
  if (projects.length > 1 && synapses.length === 0) uniquePush(portfolioGaps, '项目之间还没有显式突触，离“组合涌现”还有距离')
  if (drawerCount === 0 || wikiSourceCount === 0) uniquePush(portfolioGaps, '记忆层和知识层尚未形成稳定输入流，长期增厚不足')
  if (scheduledTaskCount === 0) uniquePush(portfolioGaps, '系统仍过度依赖人工驱动，没有进入自我巡航阶段')

  if (topIndustry) uniquePush(portfolioBreakthroughs, `当前最浓的主战场是「${topIndustry[0]}」；可以围绕它打造真正的主线世界观和能力栈`)
  const breakthroughCandidates = projectInsights.filter(project => project.posture === 'breakthrough').slice(0, 2)
  for (const candidate of breakthroughCandidates) {
    uniquePush(
      portfolioBreakthroughs,
      `${candidate.title} 已达到 ${candidate.score} 分，适合被推上“主突破项目”的位置`
    )
  }
  const connectCandidates = projectInsights.filter(project => project.posture === 'connect').slice(0, 2)
  for (const candidate of connectCandidates) {
    uniquePush(
      portfolioBreakthroughs,
      `${candidate.title} 更适合作为连接器项目，去放大其它项目而不是单兵突进`
    )
  }
  if (synapses.length > 0) {
    uniquePush(portfolioBreakthroughs, '最值得做的突破，不一定是新开坑，而是把已有项目重组出新物种')
  }

  if (taxonomyCoverage < 1 && projects.length > 0) {
    uniquePush(nextActions, '把所有现有项目补齐结构化分类、优势短板和时代突破方向')
  }
  if (projects.length > 1 && synapses.length < Math.max(projects.length - 1, 1)) {
    uniquePush(nextActions, '补齐高价值项目之间的突触，特别是合作链、迁移链和混种链')
  }
  if (goalSignals === 0 || bossMemoryCount < 12) {
    uniquePush(nextActions, '继续增加 Boss 的愿景、偏好和决策记忆，让系统更像“为你服务”而不是“展示功能”')
  }
  if (uncompiledDrawerCount > 0) {
    uniquePush(nextActions, '清理待编译抽屉，让 MemPalace 与 Wiki 重新对齐')
  }
  if (scheduledTaskCount === 0) {
    uniquePush(nextActions, '把研究、编译、回顾和提醒变成自动化任务，建立真正的学习闭环')
  }

  const projectTitleMap = new Map(projects.map(project => [project.id, project.title]))
  const topSynapses = [...synapses]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 4)
    .map(synapse => ({
      label: `${projectTitleMap.get(synapse.source_id) || '未知项目'} ↔ ${projectTitleMap.get(synapse.target_id) || '未知项目'}`,
      strength: clamp(synapse.strength),
      reason: synapse.reason || '已有连接，但还缺少进一步解释',
    }))

  const narrative =
    overallScore >= 75
      ? '这个项目已经开始从“功能集合”转向“围绕 Boss 运行的外脑系统”，下一阶段的重点是把自动化和跨项目涌现做深。'
      : overallScore >= 45
        ? '当前已经有不少正确的模块，但主线仍然分散。最重要的不是继续长页面，而是把项目、Boss、记忆、知识和进化闭成一个循环。'
        : '项目现在更像宏大愿景的原型集合，还没有真正回到“为 Boss 的认知、探索、生存与创作服务”的主线。'

  return {
    overallScore,
    narrative,
    pillars,
    portfolioStrengths,
    portfolioGaps,
    portfolioBreakthroughs,
    nextActions,
    topSynapses,
    projectInsights: projectInsights.map(project => ({
      ...project,
      title: `${project.title} · ${postureLabel(project.posture)}`,
    })),
  }
}
