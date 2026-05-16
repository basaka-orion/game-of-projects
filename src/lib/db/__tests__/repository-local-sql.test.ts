import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createScheduledTask, listScheduledTasks, updateScheduledTask } from '../../automation/scheduler'
import {
  createTeam,
  createTeamAction,
  createTeamSession,
  listTeamActions,
  listTeams,
  updateTeamAction,
} from '../../teams/store'
import { dbGetMemories, dbSaveMemory, query, run } from '../repository'

function createStorage() {
  const data = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key)
    }),
    clear: vi.fn(() => {
      data.clear()
    }),
  }
}

describe('repository localStorage SQL fallback', () => {
  beforeEach(() => {
    const localStorage = createStorage()
    vi.stubGlobal('localStorage', localStorage)
    vi.stubGlobal('window', { localStorage })
  })

  it('persists Workflow Studio rows through insert, update, select, and order clauses', async () => {
    await run(`
      CREATE TABLE IF NOT EXISTS workflow_studio_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `)
    await run(
      `INSERT INTO workflow_studio_items
       (id, name, goal, workflow_type, team_id, prompt_template, steps_json, target_consumers_json, status, last_test_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'idle')`,
      ['wfs_local', '本地工作流', '保存并试跑', 'custom', 'team_1', 'prompt', JSON.stringify(['读懂', '执行']), JSON.stringify(['teams'])],
    )
    await run(
      `UPDATE workflow_studio_items
       SET status = 'tested', last_test_status = 'success', last_test_input = ?, last_test_output = ?,
           updated_at = datetime('now','localtime')
       WHERE id = ?`,
      ['input', 'output', 'wfs_local'],
    )

    const rows = await query<Record<string, unknown>>('SELECT * FROM workflow_studio_items ORDER BY updated_at DESC, created_at DESC')

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'wfs_local',
      name: '本地工作流',
      status: 'tested',
      last_test_status: 'success',
      last_test_output: 'output',
    })
  })

  it('keeps Teams, sessions, and action queue functional without Electron SQLite', async () => {
    const teamId = await createTeam({
      name: '恢复验证群策',
      description: '验证本地 fallback',
      teamType: 'permanent',
      agents: [{ agentId: 'general', role: '总控', skills: ['review'] }],
      config: { communicationPattern: 'sequential', workflowType: 'custom' },
    })
    const sessionId = await createTeamSession(teamId, '验证功能保存')
    const actionId = await createTeamAction({
      sessionId,
      teamId,
      ownerAgentId: 'general',
      ownerAgentName: '总控',
      capability: 'review',
      toolId: 'manual_review',
      title: '检查结果',
      description: '必须进入动作队列',
      params: { target: 'sandbox' },
      risk: 'medium',
      requiresApproval: true,
      status: 'proposed',
    })
    await updateTeamAction(actionId, { status: 'completed', result: { success: true, output: 'ok' } })

    const teams = await listTeams({ status: 'active' })
    const actions = await listTeamActions({ sessionId })

    expect(teams.map((team) => team.id)).toContain(teamId)
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({ id: actionId, status: 'completed', title: '检查结果' })
    expect(actions[0].result).toEqual({ success: true, output: 'ok' })
  })

  it('keeps scheduler and Boss memory records queryable in browser mode', async () => {
    const taskId = await createScheduledTask({
      name: '每日自省',
      cronExpression: '0 9 * * *',
      taskType: 'openbasaka-nightly-maintenance',
      taskConfig: { source: 'test' },
      enabled: false,
      platformTargets: [],
    })
    await updateScheduledTask(taskId, { enabled: true })
    const memoryId = await dbSaveMemory('goal', '恢复到 5 月 12 日中午前的完整版本', 'test', 0.91)

    const tasks = await listScheduledTasks()
    const memories = await dbGetMemories('goal', 10)

    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ id: taskId, enabled: true, taskType: 'openbasaka-nightly-maintenance' })
    expect(memories).toHaveLength(1)
    expect(memories[0]).toMatchObject({ id: memoryId, content: '恢复到 5 月 12 日中午前的完整版本' })
  })

  it('persists 化繁为简 background run rows and step rows', async () => {
    await run(
      `INSERT OR REPLACE INTO openbasaka_runs
       (id, module_id, module_name, boss_demand, title, status, current_step_id, result_preview, error, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'obr_local',
        'simplify',
        '化繁为简',
        '做完整功能恢复',
        '一句话任务',
        'running',
        'step_1',
        '正在执行',
        '',
        '2026-05-12T11:50:00.000Z',
        '2026-05-12T11:51:00.000Z',
        '',
      ],
    )
    await run(
      `INSERT OR REPLACE INTO openbasaka_run_steps
       (id, run_id, node_id, target_tab, title, detail, status, started_at, completed_at, output_preview, order_index, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'step_1',
        'obr_local',
        'workflow',
        'workflow',
        '调度工作流',
        '生成执行计划',
        'completed',
        '2026-05-12T11:50:00.000Z',
        '2026-05-12T11:51:00.000Z',
        '完成',
        0,
        JSON.stringify({ evidenceRefs: ['openbasaka_runs/obr_local'] }),
        '2026-05-12T11:50:00.000Z',
        '2026-05-12T11:51:00.000Z',
      ],
    )

    const runs = await query<Record<string, unknown>>('SELECT * FROM openbasaka_runs ORDER BY updated_at DESC, created_at DESC LIMIT ?', [12])
    const steps = await query<Record<string, unknown>>('SELECT * FROM openbasaka_run_steps WHERE run_id IN (?) ORDER BY order_index ASC', [
      'obr_local',
    ])

    expect(runs[0]).toMatchObject({ id: 'obr_local', module_id: 'simplify', result_preview: '正在执行' })
    expect(steps[0]).toMatchObject({ id: 'step_1', run_id: 'obr_local', status: 'completed' })
  })
})
