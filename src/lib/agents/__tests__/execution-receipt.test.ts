import { describe, expect, it } from 'vitest'
import { buildScheduledTaskExecutionReceipt } from '../execution-receipt'

describe('agent execution receipt', () => {
  it('summarizes scheduled WarRoom execution with retry and evidence metadata', () => {
    const receipt = buildScheduledTaskExecutionReceipt(
      {
        id: 'task-warroom-1',
        name: 'WarRoom｜External Brain OS｜复盘推演行动',
        taskType: 'agent-task',
        agentId: 'critic',
        taskConfig: {
          goal: '检查推演结果是否真的形成行动闭环。',
          projectId: 'project-1',
          reviewAt: '2026-05-02',
        },
      },
      {
        status: 'error',
        message: 'LLM API Key 未配置',
        durationMs: 88,
      },
    )

    expect(receipt.status).toBe('failed')
    expect(receipt.agentId).toBe('critic')
    expect(receipt.tools.map((tool) => tool.id)).toEqual(['scheduled_tasks', 'agent-task', 'war_room'])
    expect(receipt.evidenceRefs).toContainEqual({ kind: 'project', id: 'project-1', title: '关联项目' })
    expect(receipt.retry).toMatchObject({
      recommended: true,
      reason: '失败更像配置或外部服务问题。',
    })
    expect(receipt.trust.risk).toBe('medium')
  })
})
