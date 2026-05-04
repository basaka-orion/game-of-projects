import { loadBossState } from '../boss/profile'
import { getLatestAssessmentRun } from '../boss/profiling/service'
import { CHUANGYI_DEBATE_PHASES, loadChuangyiState } from '../chuangyi/state'

export interface CouncilCreativeEnhancement {
  creativeDnaSummary: string
  source: 'chuangyi-state' | 'boss-profile' | 'fallback'
  phaseContributions: Record<string, string>
  artifactPrompts: string[]
  promptFragment: string
}

function compact(value: string, max = 260): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function buildPhaseContributions(problem: string, creativeDna: string): Record<string, string> {
  return {
    questioning: `追问「${compact(problem, 72)}」背后的真实动机、使用场景和第一眼价值。`,
    divergence: `允许方案越界：结合 Creative DNA「${compact(creativeDna || '暂无', 72)}」提出哲思、技术、叙事和体验角度。`,
    clash: '强制制造冲突：删除炫技复杂度，同时保留足够的惊喜、规则感和长期记忆点。',
    synthesis: '把分歧收束成一个可命名、可验证、可转 PRD 的产品命题。',
    design: '把命题压到页面层级、组件状态、动效节奏、空态/失败态和小白理解路径。',
    output: '输出 PRD、UI/UX prompts、Baoyu 图文卡、Remotion 舞台和第一版验证实验。',
  }
}

function buildPromptFragment(input: {
  problem: string
  creativeDnaSummary: string
  source: CouncilCreativeEnhancement['source']
  phaseContributions: Record<string, string>
  artifactPrompts: string[]
}): string {
  return [
    '## 创意孵化器增强输入',
    `- 画像来源：${input.source}。`,
    `- Creative DNA / Boss 画像摘要：${input.creativeDnaSummary || '暂无完整画像，需在输出中标记为低置信假设。'}`,
    '- 六阶段创意增强：',
    ...CHUANGYI_DEBATE_PHASES.map((phase) => `  - ${phase.label}: ${input.phaseContributions[phase.id] || phase.description}`),
    `- 必须进入 PRD 的创意维度：${input.artifactPrompts.join('；')}`,
    '- 原则：不要把创意孵化器页面搬进智囊团；只吸收 Creative DNA、六阶段辩论、蓝图/资产库和有灵魂作品公式。',
  ].join('\n')
}

export async function buildCouncilCreativeEnhancement(problem: string): Promise<CouncilCreativeEnhancement> {
  let creativeDnaSummary = ''
  let source: CouncilCreativeEnhancement['source'] = 'fallback'

  try {
    const state = loadChuangyiState()
    if (state.userProfile.analysis) {
      creativeDnaSummary = state.userProfile.analysis
      source = 'chuangyi-state'
    }
  } catch {
    /* browser localStorage may be unavailable in tests */
  }

  if (!creativeDnaSummary) {
    try {
      const latest = await getLatestAssessmentRun()
      const promptSummary = latest?.normalized.summary.promptSummary || latest?.normalized.summary.narrative || ''
      if (promptSummary) {
        creativeDnaSummary = promptSummary
        source = 'boss-profile'
      }
    } catch {
      /* optional context */
    }
  }

  if (!creativeDnaSummary) {
    try {
      const boss = await loadBossState()
      creativeDnaSummary = [
        boss.profilingHeadline,
        boss.profilingSummaryText,
        boss.cognitiveProfile.mission,
        boss.cognitiveProfile.excitementTriggers.join('、'),
      ].filter(Boolean).join(' | ')
      if (creativeDnaSummary) source = 'boss-profile'
    } catch {
      /* optional context */
    }
  }

  if (!creativeDnaSummary) {
    creativeDnaSummary = '用户还没有完整 Creative DNA，先把本轮输入当作低置信创意画像种子。'
  }

  const phaseContributions = buildPhaseContributions(problem, creativeDnaSummary)
  const artifactPrompts = [
    '哲思内核',
    '设计表达',
    '趣味性',
    '直觉可用性',
    '可持续留存',
    '惊喜机制',
    '体验隐喻',
    '首版验证实验',
    'UI/UX prompts 与产品资产清单',
  ]

  return {
    creativeDnaSummary: compact(creativeDnaSummary, 480),
    source,
    phaseContributions,
    artifactPrompts,
    promptFragment: buildPromptFragment({
      problem,
      creativeDnaSummary: compact(creativeDnaSummary, 480),
      source,
      phaseContributions,
      artifactPrompts,
    }),
  }
}
