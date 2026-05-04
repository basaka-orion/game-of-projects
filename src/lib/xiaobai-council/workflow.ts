import { activateCouncilPersonas, type CouncilActivatedAgent } from './activation'
import { buildCouncilBaoyuVisualPlans, type CouncilBaoyuVisualPlan } from './baoyu'
import { buildCouncilCreativeEnhancement, type CouncilCreativeEnhancement } from './creative-enhancement'
import { loadAgentDreamState, type AgentDreamState } from './dream'
import { selectCouncilTeam, type CouncilMatchGate, type CouncilSelection } from './selector'
import { createTeam, getTeam } from '../teams/store'
import { runTeamSession } from '../teams/engine'
import type { Team, TeamAgent, TeamMessage, TeamSession } from '../teams/types'
import { buildUiMuseumPrdContext, type UiMuseumPrdContext } from '../ui-museum/context'

export interface CouncilPrdRunInput {
  problem: string
  selection?: CouncilSelection
  preferredStyleIds?: string[]
  uiStyleContext?: UiMuseumPrdContext | null
  creativeEnhancement?: CouncilCreativeEnhancement
  onProgress?: (message: TeamMessage) => void
}

export interface CouncilPrdRunResult {
  selection: CouncilSelection
  matchGate: CouncilMatchGate
  activatedAgents: CouncilActivatedAgent[]
  creativeEnhancement: CouncilCreativeEnhancement
  uiStyleContext: UiMuseumPrdContext
  preferredStyleIds: string[]
  agentDreamStates: AgentDreamState[]
  team: Team
  session: TeamSession
  baoyuVisualPlans: CouncilBaoyuVisualPlan[]
}

export async function runCouncilPrdWorkflow(input: CouncilPrdRunInput): Promise<CouncilPrdRunResult> {
  const problem = input.problem.trim()
  if (!problem) throw new Error('请输入要交给小白智囊团处理的问题或项目构想。')

  const selection = input.selection || selectCouncilTeam(problem)
  const matchGate = selection.matchGate
  const creativeEnhancement = input.creativeEnhancement || await buildCouncilCreativeEnhancement(problem)
  const styleSeed = [
    problem,
    selection.profile.domains.join(' / '),
    selection.seats.map((seat) => `${seat.persona.name} ${seat.seat.label}`).join('\n'),
    creativeEnhancement.promptFragment,
  ].join('\n\n')
  const uiStyleContext = input.uiStyleContext || buildUiMuseumPrdContext(styleSeed, input.preferredStyleIds || [])
  const activatedAgents = await activateCouncilPersonas(selection.seats.map((seat) => seat.persona), {
    telegramEnabled: false,
    workspaceScope: 'openbasaka-local-council',
  })
  const agentDreamStates = await Promise.all(
    activatedAgents.map((item) => loadAgentDreamState(item.persona, { agentId: item.agent.id })),
  )
  const team = await createCouncilTeam(problem, selection, activatedAgents)
  const session = await runTeamSession(
    team,
    buildCouncilTopic(problem, selection, {
      creativeEnhancement,
      uiStyleContext,
      agentDreamStates,
    }),
    input.onProgress,
    { uiStyleContext },
  )
  const baoyuVisualPlans = buildCouncilBaoyuVisualPlans({
    problem,
    selection,
    prdMarkdown: session.summary,
  })

  return {
    selection,
    matchGate,
    activatedAgents,
    creativeEnhancement,
    uiStyleContext,
    preferredStyleIds: input.preferredStyleIds || [],
    agentDreamStates,
    team,
    session,
    baoyuVisualPlans,
  }
}

async function createCouncilTeam(
  problem: string,
  selection: CouncilSelection,
  activatedAgents: CouncilActivatedAgent[],
): Promise<Team> {
  const byPersonaId = new Map(activatedAgents.map((item) => [item.persona.id, item.agent]))
  const agents: TeamAgent[] = selection.seats
    .map((seat): TeamAgent | null => {
      const agent = byPersonaId.get(seat.persona.id)
      if (!agent) return null
      return {
        agentId: agent.id,
        role: `${seat.seat.label}：${seat.seat.mission}`,
        skills: Array.from(new Set([...seat.persona.defaultSkills, 'prd', 'review'])),
        systemPromptOverride: [
          seat.persona.promptSeed,
          `本轮席位：${seat.seat.label}。`,
          `席位任务：${seat.seat.mission}`,
          `推荐理由：${seat.reasons.join('；') || '匹配本轮问题画像'}`,
          `匹配评分：Nuwa ${seat.scoreFactors.nuwaCredibility} / Dream ${seat.scoreFactors.dreamAlignment} / 技能 ${seat.scoreFactors.skillMaturity} / 证据 ${seat.scoreFactors.evidenceStrength} / 反方 ${seat.scoreFactors.oppositionValue}`,
        ].join('\n'),
      }
    })
    .filter((item): item is TeamAgent => item !== null)

  const teamId = await createTeam({
    name: `小白智囊团｜${problem.slice(0, 22) || 'PRD'}`,
    description: `由小白模块自动编队，围绕 PRD 闭环进行思想原型博弈、共识收束和图文解释。`,
    teamType: 'brainstorm',
    agents,
    config: {
      communicationPattern: 'round-robin',
      workflowType: 'prd',
      executionMode: 'advisory',
      maxRounds: Math.max(2, selection.profile.difficulty >= 5 ? 3 : 2),
      temperature: 0.72,
      capabilities: ['prd', 'review', 'web-search', 'vision'],
    },
  })
  const team = await getTeam(teamId)
  if (!team) throw new Error('小白智囊团创建失败。')
  return team
}

function buildCouncilTopic(
  problem: string,
  selection: CouncilSelection,
  context: {
    creativeEnhancement: CouncilCreativeEnhancement
    uiStyleContext: UiMuseumPrdContext
    agentDreamStates: AgentDreamState[]
  },
): string {
  const profile = selection.profile
  const roster = selection.seats
    .map(
      (seat, index) =>
        `${index + 1}. ${seat.persona.name}｜${seat.seat.label}｜${seat.reasons.join('；') || seat.seat.mission}`,
    )
    .join('\n')
  const dreamLines = context.agentDreamStates
    .map((dream) => {
      const seat = selection.seats.find((item) => item.persona.id === dream.personaId)
      return `- ${seat?.persona.name || dream.personaId}: ${dream.currentDream} 下一阶段：${dream.nextAspiration}`
    })
    .join('\n')
  const gate = selection.matchGate
  const gateLines = [
    ...gate.explanation,
    `Nuwa 覆盖：${gate.readiness.nuwaCoverage}`,
    `技能成熟：${gate.readiness.skillMaturity}`,
    `证据强度：${gate.readiness.evidenceStrength}`,
    `反方覆盖：${gate.readiness.riskCoverage}`,
    `速度成本：${gate.readiness.speedCost}`,
  ].join('\n- ')
  const finalTeam = gate.finalTeam
    .map((item, index) => `${index + 1}. ${item.personaName}｜${item.role}｜score ${item.score}｜${item.reasons.join('；')}`)
    .join('\n')

  return `# 小白智囊团 PRD 闭环任务

## 用户问题
${problem}

## 问题画像
- artifactIntent: ${profile.artifactIntent}
- difficulty: ${profile.difficulty}/5
- domains: ${profile.domains.join(' / ')}
- needsEvidence: ${profile.needsEvidence ? 'yes' : 'no'}
- needsEngineering: ${profile.needsEngineering ? 'yes' : 'no'}
- needsVisual: ${profile.needsVisual ? 'yes' : 'no'}
- riskLevel: ${profile.riskLevel}

## 自动编队
${roster}

## CouncilMatchGate：先匹配再解决
- ${gateLines}

### 最终编队依据
${finalTeam}

## Agent 动态 Dream
${dreamLines || '本轮没有已激活 agent dream。'}

${context.creativeEnhancement.promptFragment}

${context.uiStyleContext.promptFragment}

## 输出要求
请进行有冲突、有取舍、有共识的 PRD 讨论。最终产物必须包含：
1. 项目定位、目标用户、用户旅程、P0/P1/P2、不做清单。
2. 关键页面、组件状态、空态/加载/失败态、动效节奏和小白理解路径。
3. Agent/模型策略、数据模型、独立 SOUL、私有记忆、Telegram 可选外部触达、归档与审计。
4. 技术架构、接口草案、异常处理、隐私安全、性能和降级。
5. 测试与验收：单元、集成、UI、视觉、真实运行、用户验收。
6. Baoyu-ready 图文解说建议：图文卡、信息图、图解、漫画、封面。
7. 创意孵化器增强条款：哲思内核、设计表达、趣味性、直觉可用性、留存机制、惊喜机制、体验隐喻和首版验证实验。

角色必须记住：自己是公开思想原型，不是真人本人，不代表本人授权；默认只在本地 Openbasaka、群策和控制面板生效，Telegram 不是默认同步目标。`
}
