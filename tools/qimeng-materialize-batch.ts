import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import {
  DEFAULT_CORPUS_PATH,
  buildCorpusEntries,
  type CorpusEntry,
} from './qimeng-corpus.ts'

const DEFAULT_BATCH_LIMIT = 120
const DEFAULT_TIMEOUT_SECONDS = 180
const DEFAULT_POLL_MS = 5_000
const REPORT_DIR = path.resolve('docs/qimeng-materialize')
const LATEST_JSON_PATH = path.join(REPORT_DIR, 'latest-materialize.json')
const LATEST_MD_PATH = path.join(REPORT_DIR, 'latest-materialize.md')

interface Args {
  corpusPath: string
  offset: number
  limit: number
  timeoutSeconds: number
  pollMs: number
}

interface EntryStatus {
  filePath: string
  relativePath: string
  status: 'local' | 'dataless'
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  let pathArg = ''
  let offset = 0
  let limit = DEFAULT_BATCH_LIMIT
  let timeoutSeconds = DEFAULT_TIMEOUT_SECONDS
  let pollMs = DEFAULT_POLL_MS

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--offset') {
      offset = Number(args[index + 1] || 0)
      index += 1
      continue
    }
    if (arg === '--limit') {
      limit = Number(args[index + 1] || DEFAULT_BATCH_LIMIT)
      index += 1
      continue
    }
    if (arg === '--timeout-seconds') {
      timeoutSeconds = Number(args[index + 1] || DEFAULT_TIMEOUT_SECONDS)
      index += 1
      continue
    }
    if (arg === '--poll-ms') {
      pollMs = Number(args[index + 1] || DEFAULT_POLL_MS)
      index += 1
      continue
    }
    if (arg.startsWith('--')) continue
    if (!pathArg) pathArg = arg
  }

  return {
    corpusPath: pathArg ? path.resolve(pathArg) : DEFAULT_CORPUS_PATH,
    offset: Number.isFinite(offset) && offset > 0 ? offset : 0,
    limit: Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_BATCH_LIMIT,
    timeoutSeconds: Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? timeoutSeconds : DEFAULT_TIMEOUT_SECONDS,
    pollMs: Number.isFinite(pollMs) && pollMs > 0 ? pollMs : DEFAULT_POLL_MS,
  }
}

function buildTimestampSlug(date: Date): string {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[:]/g, '-')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function runCommand(command: string, commandArgs: string[], timeoutMs = 30_000): Promise<{ stdout: string, stderr: string, exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${command} timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })
    child.on('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', exitCode => {
      clearTimeout(timer)
      resolve({ stdout, stderr, exitCode })
    })
  })
}

async function inspectEntry(entry: CorpusEntry): Promise<EntryStatus> {
  const result = await runCommand('ls', ['-ldO', entry.filePath])
  const line = (result.stdout || '').trim()

  return {
    filePath: entry.filePath,
    relativePath: entry.relativePath,
    status: line.includes('dataless') ? 'dataless' : 'local',
  }
}

async function inspectEntries(entries: CorpusEntry[]): Promise<EntryStatus[]> {
  const statuses: EntryStatus[] = []
  for (const entry of entries) {
    statuses.push(await inspectEntry(entry))
  }
  return statuses
}

async function triggerDownloads(paths: string[]) {
  for (const filePath of paths) {
    const result = await runCommand('brctl', ['download', filePath], 20_000)
    if (result.exitCode !== 0) {
      throw new Error(`brctl download failed for ${filePath}: ${result.stderr || result.stdout || `exit ${result.exitCode}`}`)
    }
  }
}

function renderMarkdownReport(params: {
  startedAt: Date
  offset: number
  limit: number
  timeoutSeconds: number
  initialStatuses: EntryStatus[]
  finalStatuses: EntryStatus[]
}) {
  const initialDataless = params.initialStatuses.filter(item => item.status === 'dataless')
  const finalDataless = params.finalStatuses.filter(item => item.status === 'dataless')

  return [
    '# 《启蒙》Dataless Materialize 报告',
    '',
    `- 时间：${params.startedAt.toLocaleString('zh-CN', { hour12: false })}`,
    `- offset：${params.offset}`,
    `- limit：${params.limit}`,
    `- timeoutSeconds：${params.timeoutSeconds}`,
    '',
    '## 结果',
    `- 初始 dataless：${initialDataless.length}`,
    `- 当前 dataless：${finalDataless.length}`,
    `- 已转本地：${initialDataless.length - finalDataless.length}`,
    '',
    '## 仍未落地样例',
    ...finalDataless.slice(0, 20).map(item => `- ${item.relativePath}`),
    '',
  ].join('\n')
}

async function writeReports(payload: Record<string, unknown>, markdown: string, timestampSlug: string) {
  await fs.mkdir(REPORT_DIR, { recursive: true })
  const jsonPath = path.join(REPORT_DIR, `${timestampSlug}-materialize.json`)
  const mdPath = path.join(REPORT_DIR, `${timestampSlug}-materialize.md`)
  const serialized = JSON.stringify(payload, null, 2)

  await fs.writeFile(jsonPath, serialized, 'utf8')
  await fs.writeFile(mdPath, markdown, 'utf8')
  await fs.writeFile(LATEST_JSON_PATH, serialized, 'utf8')
  await fs.writeFile(LATEST_MD_PATH, markdown, 'utf8')

  return { jsonPath, mdPath }
}

async function main() {
  const args = parseArgs()
  const startedAt = new Date()
  const timestampSlug = buildTimestampSlug(startedAt)
  const corpusEntries = await buildCorpusEntries(args.corpusPath)
  const entries = corpusEntries.slice(args.offset, args.offset + args.limit)
  const initialStatuses = await inspectEntries(entries)
  const initialDataless = initialStatuses.filter(item => item.status === 'dataless')

  if (initialDataless.length > 0) {
    await triggerDownloads(initialDataless.map(item => item.filePath))
  }

  const deadline = Date.now() + (args.timeoutSeconds * 1000)
  let finalStatuses = initialStatuses

  while (Date.now() < deadline) {
    finalStatuses = await inspectEntries(entries)
    const remaining = finalStatuses.filter(item => item.status === 'dataless')
    if (remaining.length === 0) break
    await sleep(args.pollMs)
  }

  const markdown = renderMarkdownReport({
    startedAt,
    offset: args.offset,
    limit: entries.length,
    timeoutSeconds: args.timeoutSeconds,
    initialStatuses,
    finalStatuses,
  })

  const payload = {
    startedAt: startedAt.toISOString(),
    corpusPath: args.corpusPath,
    offset: args.offset,
    limit: entries.length,
    timeoutSeconds: args.timeoutSeconds,
    pollMs: args.pollMs,
    initialStatuses,
    finalStatuses,
  }

  const { jsonPath, mdPath } = await writeReports(payload, markdown, timestampSlug)
  const initialDatalessCount = initialDataless.length
  const finalDatalessCount = finalStatuses.filter(item => item.status === 'dataless').length

  console.log(JSON.stringify({
    offset: args.offset,
    limit: entries.length,
    initialDataless: initialDatalessCount,
    finalDataless: finalDatalessCount,
    materialized: initialDatalessCount - finalDatalessCount,
    jsonPath,
    mdPath,
  }, null, 2))
}

main().catch(error => {
  console.error('[qimeng:materialize] failed:', error)
  process.exitCode = 1
})
