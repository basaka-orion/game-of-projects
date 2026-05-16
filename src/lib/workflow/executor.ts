/**
 * Workflow Executor — 工作流执行器
 * 基于 DAG 拓扑排序，顺序执行步骤
 */
import { Workflow, WorkflowStep, WorkflowRun } from './types'
import { getAgentById, AgentDefinition } from '../agents/registry'
import { chatCompletion, getLLMConfig } from '../ai/provider'
import { run as dbRun, query } from '../db/repository'
import { generateId } from '../db/schema'
import { executeSkill, SkillInput } from '../skills/executor'

/** 拓扑排序 */
function topologicalSort(steps: WorkflowStep[]): WorkflowStep[] {
  const sorted: WorkflowStep[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const stepMap = new Map(steps.map(s => [s.id, s]))

  function visit(id: string) {
    if (visited.has(id)) return
    if (visiting.has(id)) throw new Error(`循环依赖: ${id}`)
    visiting.add(id)
    const step = stepMap.get(id)
    if (step) {
      for (const dep of step.dependsOn) visit(dep)
      sorted.push(step)
    }
    visiting.delete(id)
    visited.add(id)
  }

  steps.forEach(s => visit(s.id))
  return sorted
}

/** 执行工作流 */
export async function executeWorkflow(
  workflow: Workflow,
  input: string,
  onProgress?: (stepId: string, status: 'running' | 'done' | 'error', result?: string) => void
): Promise<WorkflowRun> {
  const runId = 'wf_run_' + generateId()
  const llmConfig = getLLMConfig()
  const results: Record<string, string> = {}
  const sorted = topologicalSort(workflow.steps)
  let currentStep: WorkflowStep | null = null

  await dbRun(
    `INSERT OR IGNORE INTO workflows
      (id, name, name_en, goal, steps_json, agents_json, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`,
    [
      workflow.id,
      workflow.name,
      workflow.nameEn,
      workflow.goal,
      JSON.stringify(workflow.steps),
      JSON.stringify(workflow.agents),
      workflow.status,
    ],
  )

  // 创建运行记录
  await dbRun(
    "INSERT INTO workflow_runs (id, workflow_id, results_json, status, created_at) VALUES (?, ?, ?, ?, datetime('now','localtime'))",
    [runId, workflow.id, '{}', 'running']
  )

  try {
    for (const step of sorted) {
      currentStep = step
      onProgress?.(step.id, 'running')

      const agent = await getAgentById(step.agentRole)
      if (!agent) {
        const message = `Agent "${step.agentRole}" 未找到，工作流无法真实执行该步骤。`
        results[step.outputKey] = message
        onProgress?.(step.id, 'error', message)
        throw new Error(message)
      }

      // 构建上下文：输入 + 前置步骤结果
      const depsContext = step.dependsOn
        .map(depId => {
          const depStep = workflow.steps.find(s => s.id === depId)
          return depId ? `## ${depStep?.task || depId}\n${results[depStep?.outputKey || depId] || '无结果'}` : ''
        })
        .filter(Boolean)
        .join('\n\n')

      const systemPrompt = agent.systemPromptSuffix
        ? `你是 ${agent.name}。${agent.systemPromptSuffix}`
        : `你是 ${agent.name}，openbasaka 智能体。`

      const userPrompt = depsContext
        ? `## 任务\n${step.task}\n\n## 输入\n${input}\n\n## 前置分析\n${depsContext}\n\n请完成你的任务。`
        : `## 任务\n${step.task}\n\n## 输入\n${input}\n\n请完成你的任务。`

      const result = await chatCompletion(
        llmConfig,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        agent.temperature,
        2048
      )

      results[step.outputKey] = result
      onProgress?.(step.id, 'done', result)
    }

    // 更新运行记录
    await dbRun(
      'UPDATE workflow_runs SET results_json = ?, status = ? WHERE id = ?',
      [JSON.stringify(results), 'completed', runId]
    )

    return { id: runId, workflowId: workflow.id, results, status: 'completed', createdAt: new Date().toISOString() }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const failedStepId = currentStep?.id || ''
    if (currentStep && !results[currentStep.outputKey]) {
      results[currentStep.outputKey] = `步骤失败：${message}`
    }
    results.__error = message
    results.__failedStepId = failedStepId
    await dbRun(
      'UPDATE workflow_runs SET results_json = ?, status = ? WHERE id = ?',
      [JSON.stringify(results), 'failed', runId]
    )
    return {
      id: runId,
      workflowId: workflow.id,
      results,
      status: 'failed',
      createdAt: new Date().toISOString(),
      error: message,
      failedStepId,
    }
  }
}
