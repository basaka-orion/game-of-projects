import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dbListOperatingEvents, query } from '../../db/repository'
import { createScheduledTask, listScheduledTasks, runScheduledTaskNow } from '../scheduler'

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

describe('scheduled task run now', () => {
  beforeEach(() => {
    const localStorage = createStorage()
    vi.stubGlobal('localStorage', localStorage)
    vi.stubGlobal('window', { localStorage })
  })

  it('runs report tasks in browser fallback mode and records logs plus operating events', async () => {
    const taskId = await createScheduledTask({
      name: '每日总局报告',
      cronExpression: '0 9 * * *',
      taskType: 'report',
      taskConfig: {},
      enabled: true,
      platformTargets: [],
    })

    const result = await runScheduledTaskNow(taskId)
    const tasks = await listScheduledTasks()
    const logs = await query<{ task_id: string; status: string; message: string; duration_ms: number }>(
      'SELECT * FROM cron_execution_log ORDER BY created_at DESC LIMIT 10',
    )
    const events = await dbListOperatingEvents(10)

    expect(result.success).toBe(true)
    expect(result.delegatedToElectron).toBe(false)
    expect(tasks[0]).toMatchObject({ id: taskId })
    expect(tasks[0].lastRun).toBeTruthy()
    expect(tasks[0].nextRun).toBeTruthy()
    expect(logs[0]).toMatchObject({ task_id: taskId, status: 'success' })
    expect(logs[0].message).toContain('本地报告试跑完成')
    expect(events.some((event) => event.title.includes('定时试跑'))).toBe(true)
  })

  it('records actionable blocked logs when browser fallback cannot truly execute a task', async () => {
    const taskId = await createScheduledTask({
      name: '工作流自动化',
      cronExpression: '0 */2 * * *',
      taskType: 'team-workflow',
      taskConfig: { studioWorkflowId: 'wfs_demo' },
      enabled: true,
      platformTargets: [],
    })

    const result = await runScheduledTaskNow(taskId)
    const logs = await query<{ task_id: string; status: string; message: string }>(
      'SELECT * FROM cron_execution_log ORDER BY created_at DESC LIMIT 10',
    )

    expect(result.success).toBe(false)
    expect(result.message).toContain('浏览器沙盘暂不能真实执行 team-workflow')
    expect(logs[0]).toMatchObject({ task_id: taskId, status: 'error' })
    expect(logs[0].message).toContain('Electron 定时引擎')
  })
})
