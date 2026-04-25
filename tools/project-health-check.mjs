#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const keyFiles = [
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'src/App.tsx',
  'src/views/Openbasaka/Openbasaka.tsx',
  'src/views/SandboxMap/SandboxMap.tsx',
  'src/lib/db/schema.ts',
  'src/lib/chat/session.ts',
  'electron/main/index.ts',
  'electron/preload/index.ts',
  '.git/HEAD',
]

const runtimeFiles = [
  'node_modules/better-sqlite3/lib/index.js',
  'node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  'node_modules/redux/dist/redux.mjs',
  'node_modules/scheduler/index.js',
  'node_modules/zod/index.js',
]

function run(command, args, timeout = 2000) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout,
    maxBuffer: 1024 * 1024 * 8,
  })

  return {
    ok: result.status === 0 && !result.error,
    status: result.status,
    signal: result.signal,
    error: result.error?.code || result.error?.message || '',
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  }
}

function flagLine(file) {
  const result = run('/bin/ls', ['-ldO', file], 1500)
  return result.ok ? result.stdout.trim() : `${result.error || result.stderr || 'unreadable flags'}`
}

function readProbe(file) {
  const fullPath = path.join(root, file)
  if (!fs.existsSync(fullPath)) return { ok: false, reason: 'missing' }

  const result = run('/usr/bin/head', ['-c', '1', file], 1500)
  if (result.ok) return { ok: true, reason: 'readable' }
  return {
    ok: false,
    reason: result.error || result.stderr.trim() || result.signal || `exit ${result.status}`,
  }
}

function collectDatalessFiles() {
  const result = run('/usr/bin/find', ['.', '-type', 'f', '-flags', '+dataless', '-print'], 8000)
  if (!result.ok) {
    return {
      ok: false,
      files: [],
      error: result.error || result.stderr.trim() || `exit ${result.status}`,
    }
  }

  return {
    ok: true,
    files: result.stdout.split('\n').filter(Boolean),
    error: '',
  }
}

function checkBin(name) {
  const binPath = path.join(root, 'node_modules', '.bin', name)
  if (!fs.existsSync(binPath)) return { name, ok: false, detail: 'missing' }

  let target = binPath
  try {
    target = fs.realpathSync(binPath)
  } catch {
    // Keep the symlink path as the checked target.
  }

  try {
    const stat = fs.statSync(target)
    return {
      name,
      ok: Boolean(stat.mode & 0o111),
      detail: `${path.relative(root, target)} mode=${(stat.mode & 0o777).toString(8)}`,
    }
  } catch (error) {
    return { name, ok: false, detail: String(error) }
  }
}

function printSection(title) {
  console.log(`\n## ${title}`)
}

const dataless = collectDatalessFiles()
const sourceDataless = dataless.files.filter((file) => !file.startsWith('./node_modules/'))
const workspaceDataless = sourceDataless.filter((file) => !file.startsWith('./.git/'))
const gitDataless = sourceDataless.filter((file) => file.startsWith('./.git/'))
const nodeModulesDataless = dataless.files.length - sourceDataless.length
const recoveryArtifacts = fs
  .readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.dataless-icloud-stub'))
  .map((entry) => `./${path.join(entry.parentPath ? path.relative(root, entry.parentPath) : '', entry.name)}`)
  .filter((file) => !file.startsWith('./node_modules/'))
  .sort()
const probes = keyFiles.map((file) => {
  const flags = flagLine(file)
  const probe = readProbe(file)
  return {
    file,
    dataless: flags.includes('dataless'),
    readable: probe.ok,
    reason: probe.reason,
    flags,
  }
})

const gitMetadataProbe = probes.find((probe) => probe.file === '.git/HEAD')
const shouldRunGit = Boolean(gitMetadataProbe?.readable && !gitMetadataProbe.dataless)
const gitRoot = shouldRunGit
  ? run('git', ['rev-parse', '--show-toplevel'], 2000)
  : {
      ok: false,
      status: null,
      signal: null,
      error: 'skipped: .git/HEAD is not locally readable',
      stdout: '',
      stderr: '',
    }
const gitStatus = shouldRunGit
  ? run('git', ['status', '--short'], 2500)
  : {
      ok: false,
      status: null,
      signal: null,
      error: 'skipped: .git/HEAD is not locally readable',
      stdout: '',
      stderr: '',
    }
const bins = ['prettier', 'esbuild', 'tsc', 'vite', 'vitest'].map(checkBin)
const runtimeProbes = runtimeFiles.map((file) => {
  const flags = flagLine(file)
  const probe = readProbe(file)
  return {
    file,
    dataless: flags.includes('dataless'),
    readable: probe.ok,
    reason: probe.reason,
    flags,
  }
})

const unreadableKeyFiles = probes.filter((probe) => !probe.readable)
const datalessKeyFiles = probes.filter((probe) => probe.dataless)
const brokenBins = bins.filter((bin) => !bin.ok)
const unreadableRuntimeFiles = runtimeProbes.filter((probe) => !probe.readable)
const datalessRuntimeFiles = runtimeProbes.filter((probe) => probe.dataless)

console.log('Game of Projects health check')
console.log(`Root: ${root}`)

printSection('Filesystem Hydration')
if (!dataless.ok) {
  console.log(`Dataless scan failed: ${dataless.error}`)
} else {
  console.log(`Dataless files: ${dataless.files.length}`)
  console.log(`Dataless outside node_modules: ${sourceDataless.length}`)
  console.log(`Dataless workspace files outside .git: ${workspaceDataless.length}`)
  console.log(`Dataless git metadata files: ${gitDataless.length}`)
  console.log(`Dataless inside node_modules: ${nodeModulesDataless}`)
}
console.log(`Dataless key files: ${datalessKeyFiles.length}`)
console.log(`Unreadable key files: ${unreadableKeyFiles.length}`)
console.log(`Recovery stub artifacts: ${recoveryArtifacts.length}`)
if (workspaceDataless.length > 0) {
  console.log('\nFirst dataless workspace files outside .git:')
  for (const file of workspaceDataless.slice(0, 20)) {
    console.log(`- ${file}`)
  }
  if (workspaceDataless.length > 20) {
    console.log(`- ... ${workspaceDataless.length - 20} more`)
  }
} else if (gitDataless.length > 0) {
  console.log('\nDataless files are limited to git metadata samples:')
  for (const file of gitDataless.slice(0, 8)) {
    console.log(`- ${file}`)
  }
  if (gitDataless.length > 8) {
    console.log(`- ... ${gitDataless.length - 8} more`)
  }
}

if (recoveryArtifacts.length > 0) {
  console.log('\nRecovery stub artifacts:')
  for (const file of recoveryArtifacts.slice(0, 10)) {
    console.log(`- ${file}`)
  }
  if (recoveryArtifacts.length > 10) {
    console.log(`- ... ${recoveryArtifacts.length - 10} more`)
  }
}

for (const probe of probes) {
  const state = probe.readable ? 'OK' : 'FAIL'
  const cloud = probe.dataless ? 'dataless' : 'local'
  console.log(`${state.padEnd(4)} ${cloud.padEnd(8)} ${probe.file} (${probe.reason})`)
}

printSection('Git')
console.log(`rev-parse: ${gitRoot.ok ? 'OK' : `FAIL ${gitRoot.error || gitRoot.stderr.trim()}`}`)
console.log(`status: ${gitStatus.ok ? 'OK' : `FAIL ${gitStatus.error || gitStatus.stderr.trim()}`}`)

printSection('Tool Shims')
for (const bin of bins) {
  console.log(`${bin.ok ? 'OK  ' : 'FAIL'} ${bin.name}: ${bin.detail}`)
}

printSection('Runtime Packages')
for (const probe of runtimeProbes) {
  const state = probe.readable ? 'OK' : 'FAIL'
  const cloud = probe.dataless ? 'dataless' : 'local'
  console.log(`${state.padEnd(4)} ${cloud.padEnd(8)} ${probe.file} (${probe.reason})`)
}

printSection('Gate Result')
const gates = [
  { name: 'key files are local and readable', ok: datalessKeyFiles.length === 0 && unreadableKeyFiles.length === 0 },
  { name: 'workspace source files are hydrated', ok: workspaceDataless.length === 0 },
  { name: 'git metadata is readable', ok: gitRoot.ok && gitStatus.ok },
  { name: 'package tool shims are executable', ok: brokenBins.length === 0 },
  {
    name: 'critical runtime packages are locally loadable',
    ok: datalessRuntimeFiles.length === 0 && unreadableRuntimeFiles.length === 0,
  },
]

for (const gate of gates) {
  console.log(`${gate.ok ? 'PASS' : 'FAIL'} ${gate.name}`)
}

if (gates.some((gate) => !gate.ok)) {
  console.log('\nNext action:')
  console.log(
    '1. In Finder, download/keep local the whole project folder, especially .git, tsconfig.json, vite.config.ts, src, electron, and tools.',
  )
  console.log(
    '2. Prefer moving the working copy to a non-iCloud path such as ~/Code/game-of-projects, then reinstall dependencies there.',
  )
  console.log(
    '3. If a runtime package is missing files, reinstall that package with npm install <package>@<version> --save.',
  )
  console.log('4. Rerun npm run health:check before broad refactors, then npm run verify.')
  process.exitCode = 1
}
