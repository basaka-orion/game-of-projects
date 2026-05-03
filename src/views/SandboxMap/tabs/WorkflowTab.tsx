import { useEffect, useMemo, useState } from 'react'
import { listAllAgents, type AgentDefinition } from '../../../lib/agents/registry'
import type { PlatformTarget } from '../../../lib/automation/scheduler'
import { query } from '../../../lib/db/repository'
import { listTeams } from '../../../lib/teams/store'
import type { Team, TeamMessage } from '../../../lib/teams/types'
import {
  ensureMacAppDevelopmentWorkflow,
  generatePromptTemplateFromWorkflow,
  getDefaultWorkflowTemplate,
  listWorkflowStudioItems,
  optimizeWorkflowStudioItem,
  publishWorkflowStudioItem,
  saveWorkflowStudioItem,
  testWorkflowStudioItem,
  type WorkflowKnowledgePublishConfig,
  type WorkflowPublishOptions,
  type WorkflowSchedulerPublishConfig,
  type WorkflowStudioDraft,
  type WorkflowStudioItem,
  type WorkflowStudioTarget,
  type WorkflowTeamsPublishConfig,
  type WorkflowXiaobaiPublishConfig,
} from '../../../lib/workflow/studio'
import { TEAM_WORKFLOW_OPTIONS } from '../../../lib/workflow/registry'
import {
  buildWorkflowTestInput,
  GENERIC_WORKFLOW_TEST_INPUT,
  isStaleWorkflowTestInput,
  resolveWorkflowTestInput,
} from '../../../lib/workflow/test-input'
import { buildUiMuseumPrdContext } from '../../../lib/ui-museum/context'
import { navigateSandboxTab } from '../navigation'
import './WorkflowTab.css'

const TARGET_LABELS: Record<WorkflowStudioTarget, string> = {
  scheduler: '定时',
  teams: '群策',
  knowledge: '知识＋大佬',
  xiaobai: '小白',
}

const TARGET_HINTS: Record<WorkflowStudioTarget, string> = {
  scheduler: '弹窗配置时间、任务、推送与开关，再同步成完整定时任务。',
  teams: '标记为群策可用，让团队协作优先使用这套流程。',
  knowledge: '标记为知识＋大佬可用，服务资料解析、学习包和归档。',
  xiaobai: '标记为小白可用，用来把复杂流程翻译成可执行步骤。',
}

const TARGETS: WorkflowStudioTarget[] = ['scheduler', 'teams', 'knowledge', 'xiaobai']
const CRON_PRESETS = [
  { label: '每天 9:00', value: '0 9 * * *' },
  { label: '每天 17:00', value: '0 17 * * *' },
  { label: '每天 21:00', value: '0 21 * * *' },
  { label: '每周一 10:00', value: '0 10 * * 1' },
  { label: '每 6 小时', value: '0 */6 * * *' },
]

interface SchedulerPublishDraft {
  name: string
  cronExpression: string
  prompt: string
  pushAgentId: string
  telegramEnabled: boolean
  telegramTarget: string
  enabled: boolean
}

interface ModulePublishDraft {
  target: Exclude<WorkflowStudioTarget, 'scheduler'>
  entryName: string
  defaultTask: string
  teamId: string
  artifactLabel: string
  collectionName: string
  tagsText: string
  archiveMode: WorkflowKnowledgePublishConfig['archiveMode']
  sourcePolicy: string
  audience: string
  outputStyle: string
  maxSteps: number
  firstAction: string
}

function toDraft(item: WorkflowStudioItem): WorkflowStudioDraft {
  return {
    id: item.id,
    name: item.name,
    goal: item.goal,
    workflowType: item.workflowType,
    teamId: item.teamId,
    promptTemplate: item.promptTemplate,
    steps: item.steps,
    targetConsumers: item.targetConsumers,
  }
}

function statusLabel(item?: WorkflowStudioItem | null): string {
  if (!item) return '未保存'
  if (item.status === 'published') return '已植入'
  if (item.lastTestStatus === 'success') return '试跑通过'
  if (item.lastTestStatus === 'error') return '试跑失败'
  return '草稿'
}

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function buildPromptFromDraft(draft: WorkflowStudioDraft, stepsText: string): string {
  return generatePromptTemplateFromWorkflow({
    name: draft.name,
    goal: draft.goal,
    workflowType: draft.workflowType,
    steps: splitLines(stepsText),
  })
}

function parseTelegramTargets(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export default function WorkflowTab() {
  const [items, setItems] = useState<WorkflowStudioItem[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [agents, setAgents] = useState<AgentDefinition[]>([])
  const [knownTelegramChatIds, setKnownTelegramChatIds] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState<WorkflowStudioDraft>(getDefaultWorkflowTemplate())
  const [stepsText, setStepsText] = useState(getDefaultWorkflowTemplate().steps.join('\n'))
  const [promptManuallyEdited, setPromptManuallyEdited] = useState(false)
  const [testInput, setTestInput] = useState(buildWorkflowTestInput(getDefaultWorkflowTemplate()))
  const [testInputManuallyEdited, setTestInputManuallyEdited] = useState(false)
  const [testOutput, setTestOutput] = useState('')
  const [testTimeline, setTestTimeline] = useState<TeamMessage[]>([])
  const [optimizeFeedback, setOptimizeFeedback] = useState('')
  const [optimizeOutput, setOptimizeOutput] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [publishingTarget, setPublishingTarget] = useState<WorkflowStudioTarget | ''>('')
  const [schedulerPublishDraft, setSchedulerPublishDraft] = useState<SchedulerPublishDraft | null>(null)
  const [modulePublishDraft, setModulePublishDraft] = useState<ModulePublishDraft | null>(null)

  const selectedItem = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId])
  const canPublish = selectedItem?.lastTestStatus === 'success'
  const uiStyleContext = useMemo(
    () => buildUiMuseumPrdContext(`${draft.name}\n${draft.goal}\n${testInput}`),
    [draft.name, draft.goal, testInput],
  )

  function currentDraftWithSteps(source: WorkflowStudioDraft = draft, rawSteps = stepsText): WorkflowStudioDraft {
    return { ...source, steps: splitLines(rawSteps) }
  }

  function resetTestInputFromDraft(source: WorkflowStudioDraft = draft, rawSteps = stepsText) {
    setTestInput(buildWorkflowTestInput(currentDraftWithSteps(source, rawSteps)))
    setTestInputManuallyEdited(false)
    setNotice('已用当前工作流目标重新生成试跑输入，不再使用旧示例。')
  }

  async function loadAll(preferredId?: string, options: { preserveTestInput?: boolean } = {}) {
    setLoading(true)
    try {
      const demoWorkflowId = await ensureMacAppDevelopmentWorkflow().catch((err) => {
        console.error('[WorkflowTab] ensure demo workflow failed:', err)
        return ''
      })
      const [nextItems, nextTeams, nextAgents, telegramRows] = await Promise.all([
        listWorkflowStudioItems(),
        listTeams({ status: 'active' }).catch(() => []),
        listAllAgents().catch(() => []),
        query<{ value: string }>("SELECT value FROM settings WHERE key = 'telegram_chat_ids'").catch(() => []),
      ])
      setItems(nextItems)
      setTeams(nextTeams)
      setAgents(nextAgents)
      setKnownTelegramChatIds(parseTelegramTargets(telegramRows[0]?.value || ''))

      const nextSelected = preferredId || selectedId || demoWorkflowId || nextItems[0]?.id || ''
      if (nextSelected) {
        const item = nextItems.find((entry) => entry.id === nextSelected) || nextItems[0]
        if (item) {
          setSelectedId(item.id)
          setDraft(toDraft(item))
          setStepsText(item.steps.join('\n'))
          setPromptManuallyEdited(false)
          if (!options.preserveTestInput) {
            setTestInput(resolveWorkflowTestInput(item))
            setTestInputManuallyEdited(false)
          }
          setTestOutput(item.lastTestOutput || '')
          setOptimizeFeedback(item.lastOptimizationFeedback || '')
          setOptimizeOutput(item.lastOptimizationOutput || '')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function selectItem(item: WorkflowStudioItem) {
    setSelectedId(item.id)
    setDraft(toDraft(item))
    setStepsText(item.steps.join('\n'))
    setPromptManuallyEdited(false)
    setTestInput(resolveWorkflowTestInput(item))
    setTestInputManuallyEdited(false)
    setTestOutput(item.lastTestOutput || '')
    setTestTimeline([])
    setOptimizeFeedback(item.lastOptimizationFeedback || '')
    setOptimizeOutput(item.lastOptimizationOutput || '')
    setNotice('')
  }

  function createNewWorkflow() {
    const template = getDefaultWorkflowTemplate()
    setSelectedId('')
    setDraft({
      ...template,
      teamId: teams[0]?.id || '',
    })
    setStepsText(template.steps.join('\n'))
    setPromptManuallyEdited(false)
    setTestInput(buildWorkflowTestInput(template))
    setTestInputManuallyEdited(false)
    setTestOutput('')
    setTestTimeline([])
    setOptimizeFeedback('')
    setOptimizeOutput('')
    setNotice('正在创建新的工作流草稿。')
  }

  function patchDraft(patch: Partial<WorkflowStudioDraft>) {
    setDraft((current) => {
      const next = { ...current, ...patch }
      if (!promptManuallyEdited && ('name' in patch || 'goal' in patch || 'workflowType' in patch)) {
        const nextWithPrompt = { ...next, promptTemplate: buildPromptFromDraft(next, stepsText) }
        if (!testInputManuallyEdited) {
          setTestInput(buildWorkflowTestInput(currentDraftWithSteps(nextWithPrompt, stepsText)))
        }
        return nextWithPrompt
      }
      if (!testInputManuallyEdited && ('name' in patch || 'goal' in patch || 'workflowType' in patch)) {
        setTestInput(buildWorkflowTestInput(currentDraftWithSteps(next, stepsText)))
      }
      return next
    })
  }

  function updateStepsText(value: string) {
    setStepsText(value)
    if (!promptManuallyEdited) {
      setDraft((current) => ({ ...current, promptTemplate: buildPromptFromDraft(current, value) }))
    }
    if (!testInputManuallyEdited) {
      setTestInput(buildWorkflowTestInput(currentDraftWithSteps(draft, value)))
    }
  }

  function regeneratePromptTemplate() {
    setDraft((current) => ({ ...current, promptTemplate: buildPromptFromDraft(current, stepsText) }))
    setPromptManuallyEdited(false)
    setNotice('已根据名称、目标、类型和步骤自动生成提示词模板。')
  }

  function resolveEffectiveTestInput(): string {
    const candidate = testInput.trim()
    const source = currentDraftWithSteps()
    if (!candidate || isStaleWorkflowTestInput(source, candidate)) {
      const fresh = buildWorkflowTestInput(source)
      setTestInput(fresh)
      setTestInputManuallyEdited(false)
      return `${fresh}\n\n${uiStyleContext.promptFragment}`
    }
    return `${candidate}\n\n${uiStyleContext.promptFragment}`
  }

  function toggleTarget(target: WorkflowStudioTarget) {
    setDraft((current) => {
      const exists = current.targetConsumers.includes(target)
      const next = exists
        ? current.targetConsumers.filter((item) => item !== target)
        : [...current.targetConsumers, target]
      return { ...current, targetConsumers: next.length > 0 ? next : [target] }
    })
  }

  async function saveDraft(): Promise<string> {
    if (!draft.name.trim()) {
      setNotice('先给工作流取一个名字。')
      return ''
    }
    if (!draft.teamId) {
      setNotice('先选择一个群策团队作为试跑执行者。')
      return ''
    }
    const steps = splitLines(stepsText)
    const id = await saveWorkflowStudioItem({
      ...draft,
      name: draft.name.trim(),
      goal: draft.goal.trim(),
      promptTemplate: draft.promptTemplate.trim() || buildPromptFromDraft({ ...draft, name: draft.name.trim(), goal: draft.goal.trim() }, stepsText),
      steps,
    })
    setNotice('工作流已保存。下一步是试跑。')
    await loadAll(id, { preserveTestInput: true })
    return id
  }

  async function runTest() {
    const effectiveTestInput = resolveEffectiveTestInput()
    const id = await saveDraft()
    if (!id) return
    setRunning(true)
    setTestOutput('')
    setTestTimeline([
      {
        id: 'workflow-test-start',
        agentId: 'workflow-studio',
        agentName: '工作流工坊',
        role: 'system',
        content: '试跑已启动：正在保存输入、装配提示词，并把任务交给群策团队。',
        timestamp: Date.now(),
        kind: 'progress',
      },
    ])
    setNotice('正在试跑工作流：会调用群策团队，并自动执行低/中风险电脑动作。')
    try {
      const result = await testWorkflowStudioItem(id, effectiveTestInput, (message) => {
        setTestTimeline((current) => [...current, message])
      })
      setTestOutput(result.output)
      setNotice(result.success ? '试跑通过。现在可以选择植入到模块。' : `试跑失败：${result.output}`)
      await loadAll(id)
    } finally {
      setRunning(false)
    }
  }

  async function runOptimization() {
    const id = await saveDraft()
    if (!id) return
    setOptimizing(true)
    setOptimizeOutput('')
    setNotice('正在让群策团队审查并优化这个工作流。')
    try {
      const result = await optimizeWorkflowStudioItem(id, optimizeFeedback)
      setOptimizeOutput(result.output)
      setNotice(result.success ? '群策优化已完成。你可以按建议改步骤，再重新生成提示词和试跑。' : `群策优化失败：${result.output}`)
      await loadAll(id)
    } finally {
      setOptimizing(false)
    }
  }

  function createSchedulerPublishDraft(item: WorkflowStudioItem): SchedulerPublishDraft {
    return {
      name: `工作流｜${item.name}`,
      cronExpression: '0 9 * * *',
      prompt: item.lastTestInput || item.goal,
      pushAgentId: 'general',
      telegramEnabled: false,
      telegramTarget: knownTelegramChatIds[0] || '',
      enabled: false,
    }
  }

  function createModulePublishDraft(item: WorkflowStudioItem, target: Exclude<WorkflowStudioTarget, 'scheduler'>): ModulePublishDraft {
    const tags = ['工作流', TARGET_LABELS[target], item.workflowType, item.name].filter(Boolean).join('，')
    return {
      target,
      entryName: `工作流｜${item.name}`,
      defaultTask: item.lastTestInput || item.goal,
      teamId: item.teamId,
      artifactLabel: item.workflowType === 'prd' ? 'PRD 成稿' : item.workflowType === 'research' ? '调研报告' : '工作流成果',
      collectionName: target === 'knowledge' ? `工作流成果｜${item.name}` : item.name,
      tagsText: tags,
      archiveMode: 'candidate',
      sourcePolicy: '保留原始输入、群策过程、最终成果和植入配置，便于以后复盘。',
      audience: '超级小白 Boss',
      outputStyle: '一步一步、短句、先做什么后做什么，不讲黑话。',
      maxSteps: 6,
      firstAction: item.steps[0] || '先读懂 Boss 的输入',
    }
  }

  function buildSchedulerPublishConfig(config: SchedulerPublishDraft): WorkflowSchedulerPublishConfig {
    const platformTargets: PlatformTarget[] = config.telegramEnabled
      ? [{ platform: 'telegram', targetId: config.telegramTarget.trim() || knownTelegramChatIds[0] || 'default', enabled: true }]
      : []
    return {
      name: config.name,
      cronExpression: config.cronExpression,
      prompt: config.prompt,
      pushAgentId: config.pushAgentId || 'general',
      platformTargets,
      enabled: config.enabled,
    }
  }

  function buildModulePublishOptions(config: ModulePublishDraft): WorkflowPublishOptions {
    if (config.target === 'teams') {
      const teamsConfig: WorkflowTeamsPublishConfig = {
        entryName: config.entryName.trim() || `工作流｜${draft.name}`,
        teamId: config.teamId || draft.teamId,
        defaultTask: config.defaultTask.trim() || draft.goal,
        artifactLabel: config.artifactLabel.trim() || '工作流成果',
      }
      return { teams: teamsConfig }
    }
    if (config.target === 'knowledge') {
      const knowledgeConfig: WorkflowKnowledgePublishConfig = {
        collectionName: config.collectionName.trim() || `工作流成果｜${draft.name}`,
        tags: config.tagsText
          .split(/[，,\n]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
        archiveMode: config.archiveMode,
        sourcePolicy: config.sourcePolicy.trim() || '保留原始输入、过程、最终成果和来源。',
      }
      return { knowledge: knowledgeConfig }
    }
    const xiaobaiConfig: WorkflowXiaobaiPublishConfig = {
      audience: config.audience.trim() || '超级小白 Boss',
      outputStyle: config.outputStyle.trim() || '一步一步、短句、可执行。',
      maxSteps: Math.max(3, Math.min(12, Number(config.maxSteps) || 6)),
      firstAction: config.firstAction.trim() || draft.steps[0] || '先读懂输入',
    }
    return { xiaobai: xiaobaiConfig }
  }

  function openSchedulerPublishDialog() {
    if (!selectedItem) {
      setNotice('请先保存并试跑工作流。')
      return
    }
    if (!canPublish) {
      setNotice('请先试跑成功，再配置定时植入。')
      return
    }
    setSchedulerPublishDraft(createSchedulerPublishDraft(selectedItem))
  }

  function openModulePublishDialog(target: Exclude<WorkflowStudioTarget, 'scheduler'>) {
    if (!selectedItem) {
      setNotice('请先保存并试跑工作流。')
      return
    }
    if (!canPublish) {
      setNotice(`请先试跑成功，再配置${TARGET_LABELS[target]}植入。`)
      return
    }
    setModulePublishDraft(createModulePublishDraft(selectedItem, target))
  }

  async function publish(target: WorkflowStudioTarget, options?: WorkflowPublishOptions) {
    if (!selectedItem) {
      setNotice('请先保存并试跑工作流。')
      return
    }
    if (!canPublish) {
      setNotice('请先试跑成功，再植入模块。')
      return
    }
    setPublishingTarget(target)
    try {
      await publishWorkflowStudioItem(selectedItem.id, target, options)
      setNotice(
        target === 'scheduler'
          ? '已同步到定时：时间、任务、推送与开关都按这次弹窗配置写入。'
          : `已按弹窗配置植入「${TARGET_LABELS[target]}」。`,
      )
      setSchedulerPublishDraft(null)
      setModulePublishDraft(null)
      await loadAll(selectedItem.id)
    } finally {
      setPublishingTarget('')
    }
  }

  const testProgressMessages = testTimeline.filter((message) => message.kind === 'progress')
  const testBriefMessages = testTimeline.filter((message) => message.kind !== 'progress' && message.kind !== 'artifact')
  const testArtifactMessage = testTimeline.find((message) => message.kind === 'artifact')
  const actionRunMessages = testTimeline.filter((message) => message.agentId === 'workflow-action-runner')
  const activeTestMessage = testProgressMessages[testProgressMessages.length - 1]
  const testStageLabel = running
    ? actionRunMessages.length > 0
      ? '电脑执行层正在试跑'
      : '群策团队正在试跑'
    : testOutput
      ? '试跑结果已生成'
      : '等待试跑'
  const testProgressStep = testOutput ? 4 : actionRunMessages.length > 0 ? 3 : testTimeline.length > 0 ? 2 : 1

  function renderMessageKind(message: TeamMessage): string {
    if (message.kind === 'error') return '异常'
    if (message.kind === 'artifact') return '最终产物'
    if (message.kind === 'progress') return '过程'
    return message.round ? `第 ${message.round} 轮短评` : '角色短评'
  }

  return (
    <div className="workflow-tab">
      <header className="workflow-tab__header">
        <div>
          <div className="workflow-tab__eyebrow">Workflow Studio</div>
          <h3>工作流工坊</h3>
          <p>先在这里定义流程，真实试跑顺利后，再决定一键植入到定时、群策、知识＋大佬或小白。</p>
        </div>
        <div className="workflow-tab__header-actions">
          <button className="sandbox-map__btn" onClick={() => loadAll(selectedId)}>刷新</button>
          <button className="sandbox-map__btn sandbox-map__btn--primary" onClick={createNewWorkflow}>新建工作流</button>
        </div>
      </header>

      <section className="workflow-tab__loop">
        <div><span>1</span><strong>定义</strong><small>写清楚目标、步骤、执行团队和提示词。</small></div>
        <div><span>2</span><strong>试跑</strong><small>用真实群策团队跑一遍，看到结果再判断。</small></div>
        <div><span>3</span><strong>植入</strong><small>满意后再给定时、群策、知识或小白使用。</small></div>
      </section>

      {notice && <div className="workflow-tab__notice">{notice}</div>}

      <div className="workflow-tab__studio">
        <aside className="workflow-tab__list">
          <div className="workflow-tab__panel-title">已定义工作流</div>
          {loading ? (
            <div className="workflow-tab__empty">正在同步工作流...</div>
          ) : items.length === 0 ? (
            <div className="workflow-tab__empty">还没有工作流。点“新建工作流”，先做一条能试跑的流程。</div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                className={`workflow-tab__item ${selectedId === item.id ? 'workflow-tab__item--active' : ''}`}
                onClick={() => selectItem(item)}
              >
                <span>{statusLabel(item)}</span>
                <strong>{item.name}</strong>
                <small>{item.goal || '未填写目标'}</small>
                {item.publishedTargets.length > 0 && (
                  <em>已植入：{item.publishedTargets.map((target) => TARGET_LABELS[target]).join(' / ')}</em>
                )}
              </button>
            ))
          )}
        </aside>

        <main className="workflow-tab__editor">
          <section className="workflow-tab__panel">
            <div className="workflow-tab__panel-head">
              <div>
                <div className="workflow-tab__panel-title">定义工作流</div>
                <div className="workflow-tab__panel-sub">这里决定流程本身，不在定时、群策、小白里重复搭一遍。</div>
              </div>
              <span className={`workflow-tab__status-pill workflow-tab__status-pill--${selectedItem?.lastTestStatus || 'idle'}`}>
                {statusLabel(selectedItem)}
              </span>
            </div>

            <div className="workflow-tab__form-grid">
              <label>
                <span>工作流名称</span>
                <input className="sandbox-map__input" value={draft.name} onChange={(event) => patchDraft({ name: event.target.value })} />
              </label>
              <label>
                <span>工作流类型</span>
                <select
                  className="sandbox-map__input"
                  value={draft.workflowType}
                  onChange={(event) => patchDraft({ workflowType: event.target.value as WorkflowStudioDraft['workflowType'] })}
                >
                  {TEAM_WORKFLOW_OPTIONS.map((option) => (
                    <option key={option.type} value={option.type}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="workflow-tab__field">
              <span>目标</span>
              <textarea
                className="sandbox-map__input"
                value={draft.goal}
                onChange={(event) => patchDraft({ goal: event.target.value })}
                rows={3}
                placeholder="这个工作流最终要稳定产出什么？"
              />
            </label>

            <label className="workflow-tab__field">
              <span>试跑执行团队</span>
              <select
                className="sandbox-map__input"
                value={draft.teamId}
                onChange={(event) => patchDraft({ teamId: event.target.value })}
              >
                <option value="">选择一个群策团队</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </label>

            <label className="workflow-tab__field">
              <span>步骤</span>
              <textarea
                className="sandbox-map__input"
                value={stepsText}
                onChange={(event) => updateStepsText(event.target.value)}
                rows={5}
                placeholder="一行一个步骤"
              />
            </label>

            <label className="workflow-tab__field">
              <span>提示词模板</span>
              <div className="workflow-tab__field-tools">
                <small>写好步骤后，系统会自动生成精准模板；你也可以手动刷新。</small>
                <button type="button" className="sandbox-map__btn" onClick={regeneratePromptTemplate}>
                  根据步骤生成
                </button>
              </div>
              <textarea
                className="sandbox-map__input workflow-tab__mono"
                value={draft.promptTemplate}
                onChange={(event) => {
                  setPromptManuallyEdited(true)
                  patchDraft({ promptTemplate: event.target.value })
                }}
                rows={7}
              />
              <small>可用变量：{'{{goal}}'}、{'{{input}}'}、{'{{steps}}'}</small>
            </label>

            <div className="workflow-tab__field">
              <span>UI风格馆自动输入</span>
              <div className="workflow-tab__output workflow-tab__output--compact">
                已自动匹配：{uiStyleContext.styleNames.join(' / ')}
                {uiStyleContext.savedFusionName ? `（复用融合：${uiStyleContext.savedFusionName}）` : ''}
                <br />
                {uiStyleContext.reasoning}
              </div>
              <small>试跑、群策和 PRD 产物会自动吸收这套视觉气质，不需要你手动复制风格。</small>
            </div>

            <div className="workflow-tab__target-picker">
              <div>
                <div className="workflow-tab__panel-title">准备植入哪里</div>
                <div className="workflow-tab__panel-sub">这里只是计划；必须试跑通过后才真正植入。</div>
              </div>
              <div className="workflow-tab__target-buttons">
                {TARGETS.map((target) => (
                  <button
                    key={target}
                    type="button"
                    className={`workflow-tab__target-btn ${draft.targetConsumers.includes(target) ? 'workflow-tab__target-btn--active' : ''}`}
                    onClick={() => toggleTarget(target)}
                    title={TARGET_HINTS[target]}
                  >
                    {TARGET_LABELS[target]}
                  </button>
                ))}
              </div>
            </div>

            <div className="workflow-tab__actions">
              <button className="sandbox-map__btn" onClick={saveDraft}>保存草稿</button>
              <button className="sandbox-map__btn sandbox-map__btn--primary" disabled={running} onClick={runTest}>
                {running ? '试跑中' : '保存并试跑'}
              </button>
            </div>
          </section>

          <section className="workflow-tab__panel">
            <div className="workflow-tab__panel-head">
              <div>
                <div className="workflow-tab__panel-title">试跑结果</div>
                <div className="workflow-tab__panel-sub">这一块是 Boss 判断“顺不顺、好不好、能不能自动化”的地方。</div>
              </div>
            </div>
            <label className="workflow-tab__field">
              <span>试跑输入</span>
              <div className="workflow-tab__field-tools">
                <small>这里是本次真实任务。工作流目标或步骤变化时会自动刷新；旧示例会被隔离。</small>
                <button type="button" className="sandbox-map__btn" onClick={() => resetTestInputFromDraft()}>
                  用当前目标生成
                </button>
              </div>
              <textarea
                className="sandbox-map__input"
                value={testInput}
                onChange={(event) => {
                  setTestInput(event.target.value)
                  setTestInputManuallyEdited(true)
                }}
                rows={5}
                placeholder={GENERIC_WORKFLOW_TEST_INPUT}
              />
            </label>

            {(running || testTimeline.length > 0 || testOutput) && (
              <div className="workflow-tab__run-dock">
                <div>
                  <div className="workflow-tab__eyebrow">Live Run</div>
                  <strong>{testStageLabel}</strong>
                  <small>{activeTestMessage?.content || testArtifactMessage?.content.slice(0, 80) || '保存并试跑后，这里会实时显示每个角色正在做什么。'}</small>
                </div>
                <div className="workflow-tab__run-steps" aria-label="试跑进度">
                  {[
                    { index: 1, label: '接收任务', value: draft.steps.length },
                    { index: 2, label: '角色处理', value: testBriefMessages.length },
                    { index: 3, label: '电脑执行', value: actionRunMessages.length },
                    { index: 4, label: '成果验收', value: testOutput ? 1 : 0 },
                  ].map((step) => (
                    <div
                      key={step.index}
                      className={`workflow-tab__run-step ${testProgressStep >= step.index ? 'workflow-tab__run-step--active' : ''}`}
                    >
                      <span>{step.index}</span>
                      <strong>{step.label}</strong>
                      <small>{step.value}</small>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {testProgressMessages.length > 0 && (
              <div className="workflow-tab__progress-strip">
                {testProgressMessages.map((message) => (
                  <div key={message.id} className="workflow-tab__progress-item">
                    <span className="workflow-tab__progress-dot" />
                    <span>{message.content}</span>
                  </div>
                ))}
              </div>
            )}

            {testBriefMessages.length > 0 && running && (
              <div className="workflow-tab__brief-grid">
                {testBriefMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`workflow-tab__brief-card ${message.kind === 'error' || message.role === 'system' ? 'workflow-tab__brief-card--error' : ''}`}
                  >
                    <div className="workflow-tab__brief-head">
                      <span className="workflow-tab__brief-avatar">
                        {agents.find((agent) => agent.id === message.agentId)?.icon || '◈'}
                      </span>
                      <div>
                        <div className="workflow-tab__brief-name">{message.agentName}</div>
                        <div className="workflow-tab__brief-kind">{renderMessageKind(message)}</div>
                      </div>
                    </div>
                    <div className="workflow-tab__brief-content">{message.content}</div>
                  </div>
                ))}
              </div>
            )}

            {testOutput && testBriefMessages.length > 0 && !running && (
              <div className="workflow-tab__brief-archive">
                <span>角色过程已收束</span>
                <strong>{testBriefMessages.length}</strong>
                <small>最终成果在下方；过程保留在本次界面中，方便判断哪里需要优化。</small>
              </div>
            )}

            <div className="workflow-tab__output">
              {running && !testOutput ? '正在收束最终成果...' : testOutput || '还没有试跑结果。'}
            </div>
          </section>

          <section className="workflow-tab__panel">
            <div className="workflow-tab__panel-head">
              <div>
                <div className="workflow-tab__panel-title">群策修改与迭代</div>
                <div className="workflow-tab__panel-sub">如果试跑效果不好，直接写不满意点，让同一支群策团队给 v2 修改方案。</div>
              </div>
              <button className="sandbox-map__btn" disabled={optimizing} onClick={runOptimization}>
                {optimizing ? '优化中' : '让群策优化'}
              </button>
            </div>
            <label className="workflow-tab__field">
              <span>Boss 反馈</span>
              <textarea
                className="sandbox-map__input"
                value={optimizeFeedback}
                onChange={(event) => setOptimizeFeedback(event.target.value)}
                rows={3}
                placeholder="例：结果太泛、视觉不够明确、技术落地不细、定时任务不够好用。"
              />
            </label>
            <div className="workflow-tab__output workflow-tab__output--compact">
              {optimizing ? '正在让群策团队审查工作流并提出 v2...' : optimizeOutput || '还没有优化记录。试跑不满意时，在这里生成修改方案。'}
            </div>
          </section>

          <section className="workflow-tab__panel">
            <div className="workflow-tab__panel-head">
              <div>
                <div className="workflow-tab__panel-title">植入模块</div>
                <div className="workflow-tab__panel-sub">只有试跑通过的工作流才能植入，避免把坏流程自动化。</div>
              </div>
            </div>
            <div className="workflow-tab__publish-grid">
              {TARGETS.map((target) => {
                const published = selectedItem?.publishedTargets.includes(target)
                return (
                  <div key={target} className="workflow-tab__publish-card">
                    <strong>{TARGET_LABELS[target]}</strong>
                    <p>{TARGET_HINTS[target]}</p>
                    <button
                      className="sandbox-map__btn"
                      disabled={!canPublish || publishingTarget === target}
                      onClick={() => {
                        if (target === 'scheduler') {
                          openSchedulerPublishDialog()
                          return
                        }
                        openModulePublishDialog(target)
                      }}
                    >
                      {publishingTarget === target ? '植入中' : published ? '再次同步' : `植入${TARGET_LABELS[target]}`}
                    </button>
                    {target === 'scheduler' && selectedItem?.publishedTargets.includes('scheduler') && (
                      <button className="sandbox-map__btn" onClick={() => navigateSandboxTab('scheduler')}>去定时查看</button>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </main>
      </div>

      {modulePublishDraft && (
        <div className="workflow-tab__modal-backdrop" role="presentation">
          <div className="workflow-tab__modal" role="dialog" aria-modal="true" aria-label={`配置${TARGET_LABELS[modulePublishDraft.target]}植入`}>
            <div className="workflow-tab__modal-head">
              <div>
                <div className="workflow-tab__eyebrow">Publish to {modulePublishDraft.target}</div>
                <h4>配置{TARGET_LABELS[modulePublishDraft.target]}植入</h4>
                <p>先把这个模块真正需要的信息补齐，再写入系统；避免“点了植入，后面还要到处补”。</p>
              </div>
              <button className="sandbox-map__btn" onClick={() => setModulePublishDraft(null)}>
                关闭
              </button>
            </div>

            {modulePublishDraft.target === 'teams' && (
              <>
                <div className="workflow-tab__form-grid">
                  <label>
                    <span>群策入口名称</span>
                    <input
                      className="sandbox-map__input"
                      value={modulePublishDraft.entryName}
                      onChange={(event) => setModulePublishDraft({ ...modulePublishDraft, entryName: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>默认产物类型</span>
                    <input
                      className="sandbox-map__input"
                      value={modulePublishDraft.artifactLabel}
                      onChange={(event) => setModulePublishDraft({ ...modulePublishDraft, artifactLabel: event.target.value })}
                    />
                  </label>
                </div>
                <label className="workflow-tab__field">
                  <span>默认执行团队</span>
                  <select
                    className="sandbox-map__input"
                    value={modulePublishDraft.teamId}
                    onChange={(event) => setModulePublishDraft({ ...modulePublishDraft, teamId: event.target.value })}
                  >
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </label>
                <label className="workflow-tab__field">
                  <span>群策默认任务</span>
                  <textarea
                    className="sandbox-map__input"
                    value={modulePublishDraft.defaultTask}
                    onChange={(event) => setModulePublishDraft({ ...modulePublishDraft, defaultTask: event.target.value })}
                    rows={5}
                  />
                </label>
              </>
            )}

            {modulePublishDraft.target === 'knowledge' && (
              <>
                <div className="workflow-tab__form-grid">
                  <label>
                    <span>知识集合名称</span>
                    <input
                      className="sandbox-map__input"
                      value={modulePublishDraft.collectionName}
                      onChange={(event) => setModulePublishDraft({ ...modulePublishDraft, collectionName: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>归档方式</span>
                    <select
                      className="sandbox-map__input"
                      value={modulePublishDraft.archiveMode}
                      onChange={(event) =>
                        setModulePublishDraft({
                          ...modulePublishDraft,
                          archiveMode: event.target.value as WorkflowKnowledgePublishConfig['archiveMode'],
                        })
                      }
                    >
                      <option value="candidate">先进入候选，Boss 再确认</option>
                      <option value="auto">试跑成果自动入库</option>
                    </select>
                  </label>
                </div>
                <label className="workflow-tab__field">
                  <span>默认标签</span>
                  <input
                    className="sandbox-map__input"
                    value={modulePublishDraft.tagsText}
                    onChange={(event) => setModulePublishDraft({ ...modulePublishDraft, tagsText: event.target.value })}
                    placeholder="用逗号分隔"
                  />
                </label>
                <label className="workflow-tab__field">
                  <span>来源与证据保留规则</span>
                  <textarea
                    className="sandbox-map__input"
                    value={modulePublishDraft.sourcePolicy}
                    onChange={(event) => setModulePublishDraft({ ...modulePublishDraft, sourcePolicy: event.target.value })}
                    rows={4}
                  />
                </label>
              </>
            )}

            {modulePublishDraft.target === 'xiaobai' && (
              <>
                <div className="workflow-tab__form-grid">
                  <label>
                    <span>解释对象</span>
                    <input
                      className="sandbox-map__input"
                      value={modulePublishDraft.audience}
                      onChange={(event) => setModulePublishDraft({ ...modulePublishDraft, audience: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>最多步骤</span>
                    <input
                      className="sandbox-map__input"
                      type="number"
                      min={3}
                      max={12}
                      value={modulePublishDraft.maxSteps}
                      onChange={(event) =>
                        setModulePublishDraft({ ...modulePublishDraft, maxSteps: Number(event.target.value) || 6 })
                      }
                    />
                  </label>
                </div>
                <label className="workflow-tab__field">
                  <span>小白输出风格</span>
                  <textarea
                    className="sandbox-map__input"
                    value={modulePublishDraft.outputStyle}
                    onChange={(event) => setModulePublishDraft({ ...modulePublishDraft, outputStyle: event.target.value })}
                    rows={4}
                  />
                </label>
                <label className="workflow-tab__field">
                  <span>第一步引导</span>
                  <input
                    className="sandbox-map__input"
                    value={modulePublishDraft.firstAction}
                    onChange={(event) => setModulePublishDraft({ ...modulePublishDraft, firstAction: event.target.value })}
                  />
                </label>
              </>
            )}

            <div className="workflow-tab__modal-actions">
              <button className="sandbox-map__btn" onClick={() => setModulePublishDraft(null)}>
                取消
              </button>
              <button
                className="sandbox-map__btn sandbox-map__btn--primary"
                disabled={publishingTarget === modulePublishDraft.target}
                onClick={() => publish(modulePublishDraft.target, buildModulePublishOptions(modulePublishDraft))}
              >
                {publishingTarget === modulePublishDraft.target ? '植入中' : `确认植入${TARGET_LABELS[modulePublishDraft.target]}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {schedulerPublishDraft && (
        <div className="workflow-tab__modal-backdrop" role="presentation">
          <div className="workflow-tab__modal" role="dialog" aria-modal="true" aria-label="配置定时植入">
            <div className="workflow-tab__modal-head">
              <div>
                <div className="workflow-tab__eyebrow">Publish to Cron</div>
                <h4>配置定时植入</h4>
                <p>这里一次性设置时间、任务、Telegram 推送和是否开启，保存后定时模块不用再补参数。</p>
              </div>
              <button className="sandbox-map__btn" onClick={() => setSchedulerPublishDraft(null)}>
                关闭
              </button>
            </div>

            <div className="workflow-tab__form-grid">
              <label>
                <span>定时任务名称</span>
                <input
                  className="sandbox-map__input"
                  value={schedulerPublishDraft.name}
                  onChange={(event) => setSchedulerPublishDraft({ ...schedulerPublishDraft, name: event.target.value })}
                />
              </label>
              <label>
                <span>推送身份</span>
                <select
                  className="sandbox-map__input"
                  value={schedulerPublishDraft.pushAgentId}
                  onChange={(event) => setSchedulerPublishDraft({ ...schedulerPublishDraft, pushAgentId: event.target.value })}
                >
                  <option value="general">BASAKA</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.icon} {agent.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="workflow-tab__field">
              <span>执行时间</span>
              <div className="workflow-tab__preset-row">
                {CRON_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className={`workflow-tab__target-btn ${schedulerPublishDraft.cronExpression === preset.value ? 'workflow-tab__target-btn--active' : ''}`}
                    onClick={() => setSchedulerPublishDraft({ ...schedulerPublishDraft, cronExpression: preset.value })}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <input
                className="sandbox-map__input workflow-tab__mono"
                value={schedulerPublishDraft.cronExpression}
                onChange={(event) => setSchedulerPublishDraft({ ...schedulerPublishDraft, cronExpression: event.target.value })}
                placeholder="例：每天 09:00 或 0 9 * * *"
              />
              <small>支持“每天 09:00”，也支持标准 Cron 表达式。</small>
            </label>

            <label className="workflow-tab__field">
              <span>定时执行时交给群策团队的任务</span>
              <textarea
                className="sandbox-map__input"
                value={schedulerPublishDraft.prompt}
                onChange={(event) => setSchedulerPublishDraft({ ...schedulerPublishDraft, prompt: event.target.value })}
                rows={5}
              />
            </label>

            <div className="workflow-tab__modal-options">
              <label>
                <input
                  type="checkbox"
                  checked={schedulerPublishDraft.telegramEnabled}
                  onChange={(event) => setSchedulerPublishDraft({ ...schedulerPublishDraft, telegramEnabled: event.target.checked })}
                />
                推送到 Telegram
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={schedulerPublishDraft.enabled}
                  onChange={(event) => setSchedulerPublishDraft({ ...schedulerPublishDraft, enabled: event.target.checked })}
                />
                保存后立即开启
              </label>
            </div>

            {schedulerPublishDraft.telegramEnabled && (
              <label className="workflow-tab__field">
                <span>Telegram Chat ID</span>
                <input
                  className="sandbox-map__input"
                  value={schedulerPublishDraft.telegramTarget}
                  onChange={(event) => setSchedulerPublishDraft({ ...schedulerPublishDraft, telegramTarget: event.target.value })}
                  placeholder={knownTelegramChatIds[0] ? `默认 ${knownTelegramChatIds[0]}` : '留空则使用已连接会话'}
                />
                {knownTelegramChatIds.length > 0 && (
                  <div className="workflow-tab__preset-row">
                    {knownTelegramChatIds.map((chatId) => (
                      <button
                        key={chatId}
                        type="button"
                        className="workflow-tab__target-btn"
                        onClick={() => setSchedulerPublishDraft({ ...schedulerPublishDraft, telegramTarget: chatId })}
                      >
                        {chatId}
                      </button>
                    ))}
                  </div>
                )}
              </label>
            )}

            <div className="workflow-tab__modal-actions">
              <button className="sandbox-map__btn" onClick={() => setSchedulerPublishDraft(null)}>
                取消
              </button>
              <button
                className="sandbox-map__btn sandbox-map__btn--primary"
                disabled={publishingTarget === 'scheduler'}
                onClick={() => publish('scheduler', { scheduler: buildSchedulerPublishConfig(schedulerPublishDraft) })}
              >
                {publishingTarget === 'scheduler' ? '同步中' : '同步到定时任务'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
