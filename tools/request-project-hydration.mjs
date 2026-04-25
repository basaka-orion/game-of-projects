#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const keyFiles = [
  'tsconfig.json',
  'vite.config.ts',
  'src/views/SandboxMap/SandboxMap.tsx',
  'src/lib/db/schema.ts',
  'src/lib/chat/session.ts',
  '.git/HEAD',
]

function parseArgs(argv) {
  const options = {
    all: false,
    limit: 200,
    wait: 0,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--all') options.all = true
    else if (arg === '--limit') options.limit = Number(argv[++index] || options.limit)
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice('--limit='.length))
    else if (arg === '--wait') options.wait = Number(argv[++index] || options.wait)
    else if (arg.startsWith('--wait=')) options.wait = Number(arg.slice('--wait='.length))
  }

  options.limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.floor(options.limit) : 200
  options.wait = Number.isFinite(options.wait) && options.wait > 0 ? Math.floor(options.wait) : 0
  return options
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: options.timeout || 8000,
    input: options.input,
    maxBuffer: 1024 * 1024 * 16,
  })

  return {
    ok: result.status === 0 && !result.error,
    status: result.status,
    error: result.error?.code || result.error?.message || '',
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  }
}

function datalessFiles() {
  const result = run('/usr/bin/find', ['.', '-type', 'f', '-flags', '+dataless', '-print'], { timeout: 10000 })
  if (!result.ok) return []
  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map((file) => file.replace(/^\.\//, ''))
    .filter((file) => !file.startsWith('node_modules/'))
}

function isReadable(file) {
  const result = run('/usr/bin/head', ['-c', '1', file], { timeout: 1500 })
  return result.ok
}

function chooseTargets(options) {
  if (!options.all) return keyFiles

  const allDataless = datalessFiles()
  const prioritized = [...keyFiles, ...allDataless]
  return [...new Set(prioritized)].slice(0, options.limit)
}

function requestHydration(files) {
  const payloadPath = path.join(os.tmpdir(), `game-of-projects-hydrate-${process.pid}.json`)
  const scriptPath = path.join(os.tmpdir(), `game-of-projects-hydrate-${process.pid}.swift`)

  const swiftSource = `
import Foundation

let payloadPath = CommandLine.arguments[1]
let rootPath = CommandLine.arguments[2]
let payloadUrl = URL(fileURLWithPath: payloadPath)
let rootUrl = URL(fileURLWithPath: rootPath, isDirectory: true)
let data = try Data(contentsOf: payloadUrl)
let paths = try JSONDecoder().decode([String].self, from: data)

for item in paths {
  let url = rootUrl.appendingPathComponent(item)
  do {
    try FileManager.default.startDownloadingUbiquitousItem(at: url)
    print("requested\\t\\(item)")
  } catch {
    print("failed\\t\\(item)\\t\\(error)")
  }
}
`

  fs.writeFileSync(payloadPath, JSON.stringify(files), 'utf8')
  fs.writeFileSync(scriptPath, swiftSource, 'utf8')

  try {
    return run('/usr/bin/swift', [scriptPath, payloadPath, root], { timeout: 30000 })
  } finally {
    fs.rmSync(payloadPath, { force: true })
    fs.rmSync(scriptPath, { force: true })
  }
}

function sleep(seconds) {
  if (seconds <= 0) return
  spawnSync('/bin/sleep', [String(seconds)], { cwd: root })
}

const options = parseArgs(process.argv.slice(2))
const targets = chooseTargets(options)
const beforeReadable = targets.filter(isReadable)

console.log('Project hydration request')
console.log(`Root: ${root}`)
console.log(`Mode: ${options.all ? `dataless batch, limit ${options.limit}` : 'key files only'}`)
console.log(`Targets: ${targets.length}`)
console.log(`Already readable: ${beforeReadable.length}`)

const result = requestHydration(targets)
process.stdout.write(result.stdout)
process.stderr.write(result.stderr)
if (!result.ok) {
  console.error(`Hydration request failed: ${result.error || `exit ${result.status}`}`)
  process.exitCode = 1
}

if (options.wait > 0) {
  console.log(`Waiting ${options.wait}s before read probe...`)
  sleep(options.wait)

  const afterReadable = targets.filter(isReadable)
  const newlyReadable = afterReadable.filter((file) => !beforeReadable.includes(file))
  const stillBlocked = targets.filter((file) => !afterReadable.includes(file))

  console.log(`Readable after wait: ${afterReadable.length}/${targets.length}`)
  if (newlyReadable.length > 0) {
    console.log('Newly readable:')
    for (const file of newlyReadable.slice(0, 20)) console.log(`- ${file}`)
    if (newlyReadable.length > 20) console.log(`- ... ${newlyReadable.length - 20} more`)
  }
  if (stillBlocked.length > 0) {
    console.log('Still blocked:')
    for (const file of stillBlocked.slice(0, 20)) console.log(`- ${file}`)
    if (stillBlocked.length > 20) console.log(`- ... ${stillBlocked.length - 20} more`)
    process.exitCode = 1
  }
}
