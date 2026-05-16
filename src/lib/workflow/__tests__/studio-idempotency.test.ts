import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listTeams } from '../../teams/store'
import { ensureMacAppDevelopmentWorkflow, listWorkflowStudioItems } from '../studio'

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

describe('Workflow Studio seed idempotency', () => {
  beforeEach(() => {
    const localStorage = createStorage()
    vi.stubGlobal('localStorage', localStorage)
    vi.stubGlobal('window', { localStorage })
  })

  it('does not create duplicate Mac App seed teams during concurrent loads', async () => {
    await Promise.all([
      ensureMacAppDevelopmentWorkflow(),
      ensureMacAppDevelopmentWorkflow(),
      ensureMacAppDevelopmentWorkflow(),
    ])

    const teams = await listTeams({ status: 'active' })
    const workflows = await listWorkflowStudioItems()

    expect(teams.filter((team) => team.name === 'Mac App 大师开发群策')).toHaveLength(1)
    expect(workflows.filter((item) => item.id === 'wfs_mac_app_lumadesk_master')).toHaveLength(1)
  })
})
