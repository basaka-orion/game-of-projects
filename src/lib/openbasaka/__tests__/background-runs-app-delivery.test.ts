import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exec } from 'node:child_process'
import { dirname, join } from 'node:path'
import { promises as fs } from 'node:fs'
import { promisify } from 'node:util'
import type { SQLInputValue } from 'node:sqlite'

vi.mock('../ai/provider', () => ({
  getLLMConfig: () => ({
    provider: 'ollama',
    apiKey: '',
    baseUrl: 'http://localhost:11434/v1',
    model: 'test-model',
  }),
  chatCompletion: vi.fn(async () => '本轮已经形成 App 方案，并准备写入本地 SwiftUI 工程。'),
}))

import {
  listOpenbasakaRuns,
  resetOpenbasakaRunRuntimeForTest,
  startSimplifyMission,
  type SimplifyMissionDeliverable,
  type OpenbasakaMissionServices,
  type OpenbasakaRunWithSteps,
} from '../background-runs'
import { listScheduledTasks } from '../../automation/scheduler'
import { listWorkflowStudioItems } from '../../workflow/studio'

const fakeModel = {
  provider: 'ollama' as const,
  apiKey: '',
  baseUrl: 'http://localhost:11434/v1',
  model: 'test-model',
}

const execAsync = promisify(exec)

async function waitForCompleted(runId?: string, timeoutMs = 5_000, pollMs = 10): Promise<OpenbasakaRunWithSteps> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const runs = await listOpenbasakaRuns()
    const latest = runId ? runs.find((run) => run.id === runId) : runs[0]
    if (latest && ['completed', 'failed', 'blocked'].includes(latest.status)) return latest
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
  const runs = await listOpenbasakaRuns()
  return (runId ? runs.find((run) => run.id === runId) : runs[0]) || runs[0]
}

function fakeServices(overrides: Partial<OpenbasakaMissionServices> = {}): Partial<OpenbasakaMissionServices> {
  return {
    resolveModelConfig: () => fakeModel,
    lockBossIntent: async ({ step }) => ({
      outputPreview: 'Boss 需求已锁定。',
      metadata: { serviceName: 'test-boss', evidenceRefs: [step.id] },
    }),
    queryKnowledge: async () => ({
      outputPreview: '知识证据已纳入。',
      metadata: { serviceName: 'test-knowledge', evidenceRefs: ['wiki-app-1'] },
    }),
    executeWorkflow: async ({ run }) => ({
      outputPreview: '工作流已排出项目落点和验证路径。',
      metadata: { serviceName: 'test-workflow', artifactId: `wf-${run.id}`, evidenceRefs: ['wf-app-1'] },
    }),
    runTeamCouncil: async () => ({
      outputPreview: '群策已完成 App 骨架评审。',
      metadata: { serviceName: 'test-team', artifactId: 'team-app-1', evidenceRefs: ['team-app-1'] },
    }),
    runSelfAudit: async () => ({
      outputPreview: '自省确认不能伪造交付。',
      metadata: { serviceName: 'test-audit', artifactId: 'audit-app-1', evidenceRefs: ['audit-app-1'] },
    }),
    writeMemory: async ({ previous }) => ({
      outputPreview: previous[previous.length - 1]?.outputPreview || '最终成果已写回长期记忆。',
      metadata: { serviceName: 'test-memory', artifactId: 'memory-app-1', evidenceRefs: ['memory-app-1'] },
    }),
    ...overrides,
  }
}

describe('simplify app delivery materialization', () => {
  beforeEach(() => {
    resetOpenbasakaRunRuntimeForTest()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined,
    })
    resetOpenbasakaRunRuntimeForTest()
    vi.restoreAllMocks()
  })

  it('writes a local SwiftUI Xcode project and records xcodebuild verification for App demands', async () => {
    const written = new Map<string, string>()
    const executeCommand = vi.fn(async () => ({
      success: true,
      stdout:
        'Native iOS build and simulator launch passed\n' +
        'device=iPhone 17 Pro Max TEST-DEVICE\n' +
        '/tmp/ignored\n' +
        'screenshot=/tmp/native-ios-simulator.png\n' +
        'log=/tmp/native-build.log\n',
      stderr: '',
      exitCode: 0,
    }))

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        writeFile: vi.fn(async (filePath: string, content: string) => {
          written.set(filePath, content)
          return { success: true }
        }),
        executeCommand,
      },
    })

    const run = await startSimplifyMission('做一个完整 iOS App，要有项目落点、运行方式和验证状态', {
      stepDelayMs: 0,
      services: fakeServices(),
    })

    const latest = await waitForCompleted(run.id)
    const deliverable = latest.steps
      .slice()
      .reverse()
      .map((step) => step.metadata.deliverable)
      .find(Boolean) as SimplifyMissionDeliverable | undefined
    const workflows = await listWorkflowStudioItems()

    expect(deliverable?.statusLabel).toBe('真机链路通过')
    expect(deliverable?.createdFiles).toContain('OpenbasakaBossApp.xcodeproj/project.pbxproj')
    expect(deliverable?.createdFiles).toContain('OpenbasakaBossApp/ContentView.swift')
    expect(deliverable?.createdFiles).toContain('scripts/build-and-run.mjs')
    expect(deliverable?.verification).toContain('xcodebuild')
    expect(deliverable?.verification).toContain('截图：/tmp/native-ios-simulator.png')
    expect(deliverable?.moduleArtifacts?.some((artifact) => artifact.kind === 'workflow-studio')).toBe(true)
    expect(workflows.some((workflow) => workflow.id === `wfs_simplify_${latest.id}` && workflow.goal.includes('完整 iOS App'))).toBe(true)
    expect(executeCommand).toHaveBeenCalledWith(expect.stringContaining('scripts/build-and-run.mjs'), 900000)
    expect(Array.from(written.keys()).some((filePath) => filePath.endsWith('OpenbasakaBossApp.xcodeproj/project.pbxproj'))).toBe(true)
    expect(Array.from(written.keys()).some((filePath) => filePath.endsWith('OpenbasakaBossApp/Features/WorkflowPlan.swift'))).toBe(true)
  })

  it('turns the LumaSense brief into a concrete native iOS app and records simulator evidence', async () => {
    const written = new Map<string, string>()
    const executeCommand = vi.fn(async () => ({
      success: true,
      stdout:
        'Native iOS build and simulator launch passed\n' +
        'device=iPhone 17 Pro Max SIM-123\n' +
        'app=/tmp/LumaSense.app\n' +
        'screenshot=/tmp/lumasense-shot.png\n' +
        'log=/tmp/lumasense-build.log\n',
      stderr: '',
      exitCode: 0,
    }))

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        writeFile: vi.fn(async (filePath: string, content: string) => {
          written.set(filePath, content)
          return { success: true }
        }),
        executeCommand,
      },
    })

    const run = await startSimplifyMission(
      '做一个复杂 iOS App：LumaSense 视觉意识花园，记录今日画面和心情，选择情绪，生成认知卡片，保存到花园历史，再做每日复盘。',
      {
        stepDelayMs: 0,
        services: fakeServices(),
      },
    )

    const latest = await waitForCompleted(run.id)
    const contentView = Array.from(written.entries()).find(([filePath]) => filePath.endsWith('LumaSense/ContentView.swift'))?.[1] || ''
    const readme = Array.from(written.entries()).find(([filePath]) => filePath.endsWith('README.md'))?.[1] || ''
    const runScript = Array.from(written.entries()).find(([filePath]) => filePath.endsWith('scripts/build-and-run.mjs'))?.[1] || ''
    const deliverable = latest.steps
      .slice()
      .reverse()
      .map((step) => step.metadata.deliverable)
      .find(Boolean) as SimplifyMissionDeliverable | undefined
    const workflows = await listWorkflowStudioItems()

    expect(deliverable?.statusLabel).toBe('真机链路通过')
    expect(deliverable?.createdFiles).toContain('LumaSense.xcodeproj/project.pbxproj')
    expect(deliverable?.createdFiles).toContain('LumaSense/ContentView.swift')
    expect(deliverable?.createdFiles).toContain('LumaSense/LaunchScreen.storyboard')
    expect(deliverable?.createdFiles).toContain('scripts/build-and-run.mjs')
    expect(contentView).toContain('LumaSense')
    expect(contentView).toContain('花园历史')
    expect(contentView).toContain('StudioMode')
    expect(contentView).toContain('safeAreaInset')
    expect(contentView).toContain('生成认知卡片')
    expect(readme).toContain('LumaSense 视觉意识花园')
    expect(readme).toContain('UI 风格馆 DNA')
    expect(readme).toContain('LaunchScreen.storyboard')
    expect(runScript).toContain('xcrun')
    expect(runScript).toContain('simctl')
    expect(runScript).toContain('native-ios-simulator.png')
    expect(deliverable?.verification).toContain('设备：iPhone 17 Pro Max SIM-123')
    expect(deliverable?.verification).toContain('截图：/tmp/lumasense-shot.png')
    expect(workflows.some((workflow) => workflow.name === 'LumaSense iOS App 真运行流程')).toBe(true)
    expect(executeCommand).toHaveBeenCalledWith(expect.stringContaining('scripts/build-and-run.mjs'), 900000)
  })

  it('turns the women weather bag idea into a concrete checklist app instead of a generic result shell', async () => {
    const written = new Map<string, string>()
    const executeCommand = vi.fn(async () => ({
      success: true,
      stdout:
        'Native iOS build and simulator launch passed\n' +
        'device=iPhone 17 Pro Max WEATHER-DEVICE\n' +
        'screenshot=/tmp/weather-shot.png\n' +
        'log=/tmp/weather-build.log\n',
      stderr: '',
      exitCode: 0,
    }))

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        writeFile: vi.fn(async (filePath: string, content: string) => {
          written.set(filePath, content)
          return { success: true }
        }),
        executeCommand,
      },
    })

    const run = await startSimplifyMission(
      '我想做一款为女性出门在外，根据当地实际的天气情况，为她们详细、有趣、用心、优雅、卡通、严谨认真地准备外出需要带的东西，特别是包包里的。然后女性打钩，全武装出门。发挥想象，应该很受欢迎的iOS app',
      {
        stepDelayMs: 0,
        services: fakeServices(),
      },
    )

    const latest = await waitForCompleted(run.id)
    const contentView = Array.from(written.entries()).find(([filePath]) => filePath.endsWith('WeatherBagChecklist/ContentView.swift'))?.[1] || ''
    const readme = Array.from(written.entries()).find(([filePath]) => filePath.endsWith('README.md'))?.[1] || ''
    const deliverable = latest.steps
      .slice()
      .reverse()
      .map((step) => step.metadata.deliverable)
      .find(Boolean) as SimplifyMissionDeliverable | undefined

    expect(latest.steps.map((step) => step.nodeId)).toEqual(['control', 'boss', 'knowledge', 'teams', 'workflow', 'audit', 'memory'])
    expect(deliverable?.statusLabel).toBe('真机链路通过')
    expect(deliverable?.createdFiles).toContain('WeatherBagChecklist.xcodeproj/project.pbxproj')
    expect(deliverable?.createdFiles).toContain('scripts/build-and-run.mjs')
    expect(contentView).toContain('包里晴雨')
    expect(contentView).toContain('天气防护')
    expect(contentView).toContain('精致补给')
    expect(contentView).toContain('全武装出门')
    expect(readme).toContain('根据当地实际天气')
    expect(deliverable?.moduleArtifacts?.some((artifact) => artifact.label === '工作流草稿')).toBe(true)
    expect(executeCommand).toHaveBeenCalledWith(expect.stringContaining('scripts/build-and-run.mjs'), 900000)
  })

  it('turns the interstellar landlord stress prompt into a runnable macOS SwiftPM game package', async () => {
    const written = new Map<string, string>()
    const executeCommand = vi.fn(async () => ({
      success: true,
      stdout:
        'Wormhole Landlord macOS build and launch passed\n' +
        'process=WormholeLandlord\n' +
        'app=/tmp/WormholeLandlord.app\n' +
        'screenshot=/tmp/wormhole-landlord.png\n' +
        'log=/tmp/wormhole-landlord.log\n',
      stderr: '',
      exitCode: 0,
    }))

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        writeFile: vi.fn(async (filePath: string, content: string) => {
          written.set(filePath, content)
          return { success: true }
        }),
        executeCommand,
      },
    })

    const run = await startSimplifyMission(
      '使用化繁为简和 Openbasaka 做一个原创星际风 Mac 版斗地主游戏，必须可玩、能叫地主、合法出牌、AI 对手、真实运行。',
      {
        stepDelayMs: 0,
        services: fakeServices(),
      },
    )

    const latest = await waitForCompleted(run.id)
    const packageSwift = Array.from(written.entries()).find(([filePath]) => filePath.endsWith('Package.swift'))?.[1] || ''
    const rules = Array.from(written.entries()).find(([filePath]) => filePath.endsWith('Services/LandlordRules.swift'))?.[1] || ''
    const tests = Array.from(written.entries()).find(([filePath]) => filePath.endsWith('Tests/WormholeLandlordTests/LandlordRulesTests.swift'))?.[1] || ''
    const table = Array.from(written.entries()).find(([filePath]) => filePath.endsWith('Views/GameTableView.swift'))?.[1] || ''
    const script = Array.from(written.entries()).find(([filePath]) => filePath.endsWith('script/build_and_run.sh'))?.[1] || ''
    const environment = Array.from(written.entries()).find(([filePath]) => filePath.endsWith('.codex/environments/environment.toml'))?.[1] || ''
    const deliverable = latest.steps
      .slice()
      .reverse()
      .map((step) => step.metadata.deliverable)
      .find(Boolean) as SimplifyMissionDeliverable | undefined
    const workflows = await listWorkflowStudioItems()

    expect(deliverable?.platform).toBe('macos')
    expect(deliverable?.statusLabel).toBe('Mac 真运行通过')
    expect(deliverable?.projectLocation).toBe(`/Users/apple/Desktop/【项目的游戏】/deliveries/${latest.id}/macos-app`)
    expect(deliverable?.createdFiles).toContain('Package.swift')
    expect(deliverable?.createdFiles).toContain('script/build_and_run.sh')
    expect(deliverable?.createdFiles).toContain('Sources/WormholeLandlord/Services/LandlordRules.swift')
    expect(deliverable?.createdFiles).toContain('Tests/WormholeLandlordTests/LandlordRulesTests.swift')
    expect(deliverable?.verificationCommand).toContain('script/build_and_run.sh')
    expect(deliverable?.verification).toContain('macOS App 真运行')
    expect(deliverable?.verification).toContain('进程：WormholeLandlord')
    expect(packageSwift).toContain('.macOS(.v14)')
    expect(packageSwift).toContain('WormholeLandlordTests')
    expect(rules).toContain('.rocket')
    expect(rules).toContain('static func legalPlays')
    expect(rules).toContain('static func deal')
    expect(tests).toContain('testDeckAndDealAreDeterministic')
    expect(tests).toContain('testClassifiesRequiredPatterns')
    expect(tests).toContain('testBeatingRules')
    expect(tests).toContain('testLegalPlaysIncludePassableResponsesAndGameCanFinish')
    expect(table).toContain('Claim Desert Seat')
    expect(table).toContain('Play Selected')
    expect(table).toContain('Pass')
    expect(script).toContain('DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"')
    expect(script).toContain('swift test')
    expect(script).toContain('pgrep -x "$APP_NAME"')
    expect(environment).toContain('command = "./script/build_and_run.sh"')
    expect(workflows.some((workflow) => workflow.id === `wfs_simplify_${latest.id}` && workflow.goal.includes('Mac 版斗地主'))).toBe(true)
    expect(executeCommand).toHaveBeenCalledWith(expect.stringContaining('script/build_and_run.sh'), 900000)
  })

  it('materializes recurring simplify missions into workflow drafts and disabled scheduler candidates', async () => {
    const run = await startSimplifyMission('每天生成 OpenBasaka 自省报告，发现失败模式和学习进度，但不要自动外发', {
      stepDelayMs: 0,
      services: fakeServices(),
    })

    const latest = await waitForCompleted(run.id)
    const deliverable = latest.steps
      .slice()
      .reverse()
      .map((step) => step.metadata.deliverable)
      .find(Boolean) as SimplifyMissionDeliverable | undefined
    const workflows = await listWorkflowStudioItems()
    const tasks = await listScheduledTasks()
    const task = tasks.find((item) => item.taskConfig.simplifyRunId === latest.id)

    expect(deliverable?.kind).toBe('automation')
    expect(deliverable?.moduleArtifacts?.map((artifact) => artifact.kind)).toEqual(['workflow-studio', 'scheduled-task'])
    expect(workflows.some((workflow) => workflow.id === `wfs_simplify_${latest.id}` && workflow.targetConsumers.includes('scheduler'))).toBe(true)
    expect(task).toBeTruthy()
    expect(task?.enabled).toBe(false)
    expect(task?.taskType).toBe('custom')
    expect(task?.cronExpression).toBe('0 9 * * *')
  })

  it.runIf(process.env.OPENBASAKA_REAL_IOS_PROOF === '1')(
    'generates and launches the real LumaSense iOS app in Simulator',
    async () => {
      const { DatabaseSync } = await import('node:sqlite')
      const dbPath = join(process.env.HOME || '', 'Library/Application Support/game-of-projects/game-of-projects.db')
      const db = new DatabaseSync(dbPath)

      Object.defineProperty(window, 'electronAPI', {
        configurable: true,
        value: {
          dbQuery: vi.fn(async (sql: string, params: unknown[] = []) => db.prepare(sql).all(...(params as SQLInputValue[]))),
          dbRun: vi.fn(async (sql: string, params: unknown[] = []) => {
            db.prepare(sql).run(...(params as SQLInputValue[]))
          }),
          writeFile: vi.fn(async (filePath: string, content: string) => {
            await fs.mkdir(dirname(filePath), { recursive: true })
            await fs.writeFile(filePath, content, 'utf-8')
            return { success: true }
          }),
          executeCommand: vi.fn(async (command: string, timeout = 900_000) => {
            try {
              const result = await execAsync(command, {
                cwd: process.cwd(),
                timeout,
                maxBuffer: 1024 * 1024 * 32,
              })
              return { success: true, stdout: result.stdout, stderr: result.stderr, exitCode: 0 }
            } catch (error) {
              const err = error as { stdout?: string; stderr?: string; code?: number; message?: string }
              return {
                success: false,
                stdout: err.stdout || '',
                stderr: err.stderr || '',
                error: err.message || 'command_failed',
                exitCode: Number(err.code || 1),
              }
            }
          }),
        },
      })

      try {
        const run = await startSimplifyMission(
          '做一个复杂 iOS App：LumaSense 视觉意识花园，记录今日画面和心情，选择情绪，生成认知卡片，保存到花园历史，再做每日复盘。请直接生成 Xcode 工程并在 Simulator 真运行。',
          {
            stepDelayMs: 0,
            services: fakeServices(),
          },
        )

        const latest = await waitForCompleted(run.id, 900_000, 1_000)
        const deliverable = latest.steps
          .slice()
          .reverse()
          .map((step) => step.metadata.deliverable)
          .find(Boolean) as SimplifyMissionDeliverable | undefined
        const projectLocation = `/Users/apple/Desktop/【项目的游戏】/deliveries/${run.id}/ios-app`
        const screenshotPath = join(projectLocation, 'artifacts/native-ios-simulator.png')
        const logPath = join(projectLocation, 'artifacts/native-build.log')
        const appPath = join(projectLocation, 'build/Debug-iphonesimulator/LumaSense.app')
        const persistedRun = db.prepare('SELECT status FROM openbasaka_runs WHERE id = ?').get(run.id) as { status?: string } | undefined

        expect(latest.status).toBe('completed')
        expect(persistedRun?.status).toBe('completed')
        expect(deliverable?.statusLabel).toBe('真机链路通过')
        expect(deliverable?.projectLocation).toBe(projectLocation)
        expect(deliverable?.verification).toContain('截图：')
        expect((await fs.stat(screenshotPath)).size).toBeGreaterThan(1000)
        expect((await fs.stat(logPath)).size).toBeGreaterThan(1000)
        expect((await fs.stat(appPath)).isDirectory()).toBe(true)
      } finally {
        db.close()
      }
    },
    900_000,
  )

  it.runIf(process.env.OPENBASAKA_REAL_MACOS_PROOF === '1')(
    'generates and launches the real Wormhole Landlord macOS app',
    async () => {
      const { DatabaseSync } = await import('node:sqlite')
      const dbPath = join(process.env.HOME || '', 'Library/Application Support/game-of-projects/game-of-projects.db')
      const db = new DatabaseSync(dbPath)

      Object.defineProperty(window, 'electronAPI', {
        configurable: true,
        value: {
          dbQuery: vi.fn(async (sql: string, params: unknown[] = []) => db.prepare(sql).all(...(params as SQLInputValue[]))),
          dbRun: vi.fn(async (sql: string, params: unknown[] = []) => {
            db.prepare(sql).run(...(params as SQLInputValue[]))
          }),
          writeFile: vi.fn(async (filePath: string, content: string) => {
            await fs.mkdir(dirname(filePath), { recursive: true })
            await fs.writeFile(filePath, content, 'utf-8')
            return { success: true }
          }),
          executeCommand: vi.fn(async (command: string, timeout = 900_000) => {
            try {
              const result = await execAsync(command, {
                cwd: process.cwd(),
                timeout,
                maxBuffer: 1024 * 1024 * 32,
              })
              return { success: true, stdout: result.stdout, stderr: result.stderr, exitCode: 0 }
            } catch (error) {
              const err = error as { stdout?: string; stderr?: string; code?: number; message?: string }
              return {
                success: false,
                stdout: err.stdout || '',
                stderr: err.stderr || '',
                error: err.message || 'command_failed',
                exitCode: Number(err.code || 1),
              }
            }
          }),
        },
      })

      try {
        const run = await startSimplifyMission(
          '使用化繁为简和 Openbasaka 做一个原创星际风 Mac 版斗地主游戏，必须可玩、能叫地主、合法出牌、AI 对手、真实运行。',
          {
            stepDelayMs: 0,
            services: fakeServices(),
          },
        )

        const latest = await waitForCompleted(run.id, 900_000, 1_000)
        const deliverable = latest.steps
          .slice()
          .reverse()
          .map((step) => step.metadata.deliverable)
          .find(Boolean) as SimplifyMissionDeliverable | undefined
        const projectLocation = `/Users/apple/Desktop/【项目的游戏】/deliveries/${run.id}/macos-app`
        const logPath = join(projectLocation, 'artifacts/native-macos-build.log')
        const appPath = join(projectLocation, 'dist/WormholeLandlord.app')
        const packagePath = join(projectLocation, 'Package.swift')
        const persistedRun = db.prepare('SELECT status FROM openbasaka_runs WHERE id = ?').get(run.id) as { status?: string } | undefined

        expect(latest.status).toBe('completed')
        expect(persistedRun?.status).toBe('completed')
        expect(deliverable?.platform).toBe('macos')
        expect(deliverable?.statusLabel).toBe('Mac 真运行通过')
        expect(deliverable?.projectLocation).toBe(projectLocation)
        expect(deliverable?.verification).toContain('进程：WormholeLandlord')
        expect((await fs.stat(packagePath)).isFile()).toBe(true)
        expect((await fs.stat(logPath)).size).toBeGreaterThan(1000)
        expect((await fs.stat(appPath)).isDirectory()).toBe(true)
      } finally {
        await execAsync('pkill -x WormholeLandlord').catch(() => undefined)
        db.close()
      }
    },
    900_000,
  )
})
