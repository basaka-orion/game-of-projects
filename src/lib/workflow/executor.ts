/**
 * Workflow Executor — 工作流执行器
 * 基于 DAG 拓扑排序，顺序执行步骤
 */
import { Workflow, WorkflowStep, WorkflowRun } from './types'
import { getAgentById, AgentDefinition } from '../agents/registry'
import { chatCompletion, LLMConfig, getDefaultConfig } from '../ai/provider'
import { getSetting } from '../db/store'
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

function getLLMConfig(): LLMConfig {
  const provider = getSetting('llm_provider', 'deepseek')
  const defaults = getDefaultConfig(provider)
  return {
    provider: provider as LLMConfig['provider'],
    apiKey: getSetting('llm_api_key', ''),
    baseUrl: getSetting('llm_base_url', defaults.baseUrl),
    model: getSetting('llm_model', defaults.model),
  }
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

  // 创建运行记录
  await dbRun(
    'INSERT INTO workflow_runs (id, workflow_id, results_json, status, created_at) VALUES (?, ?, ?, ?, datetime("now","localtime"))',
    [runId, workflow.id, '{}', 'running']
  )

  try {
    for (const step of sorted) {
      onProgress?.(step.id, 'running')

      const agent = await getAgentById(step.agentRole)
      if (!agent) {
        results[step.outputKey] = `Agent "${step.agentRole}" 未找到`
        onProgress?.(step.id, 'error', results[step.outputKey])
        continue
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
    await dbRun(
      'UPDATE workflow_runs SET results_json = ?, status = ? WHERE id = ?',
      [JSON.stringify(results), 'failed', runId]
    )
    return { id: runId, workflowId: workflow.id, results, status: 'failed', createdAt: new Date().toISOString() }
  }
}
