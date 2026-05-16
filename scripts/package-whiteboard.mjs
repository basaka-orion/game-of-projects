import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = path.join(root, 'release-whiteboard')
const appPath = path.join(releaseDir, 'mac-arm64', 'Openbasaka Whiteboard.app')
const dmgPath = path.join(releaseDir, 'Openbasaka-Whiteboard-0.1.0-arm64.dmg')
const blockMapPath = `${dmgPath}.blockmap`
const stagingDir = path.join(os.tmpdir(), 'openbasaka-whiteboard-dmg-src')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    ...options,
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
}

fs.rmSync(releaseDir, { recursive: true, force: true })

run('npm', ['run', 'build'])
run(path.join(root, 'node_modules', '.bin', 'electron-builder'), [
  '--config',
  'electron-builder.whiteboard.json',
  '--mac',
])

if (!fs.existsSync(appPath)) {
  throw new Error(`Expected packaged app not found: ${appPath}`)
}

run('/usr/bin/xattr', ['-cr', appPath])
run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', appPath])
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath])

fs.rmSync(stagingDir, { recursive: true, force: true })
fs.mkdirSync(stagingDir, { recursive: true })

run('/usr/bin/ditto', ['--noextattr', '--norsrc', appPath, path.join(stagingDir, 'Openbasaka Whiteboard.app')])
fs.symlinkSync('/Applications', path.join(stagingDir, 'Applications'))
run('/usr/bin/codesign', [
  '--verify',
  '--deep',
  '--strict',
  '--verbose=2',
  path.join(stagingDir, 'Openbasaka Whiteboard.app'),
])

run('/usr/bin/hdiutil', [
  'create',
  '-volname',
  'Openbasaka Whiteboard 0.1.0',
  '-srcfolder',
  stagingDir,
  '-ov',
  '-format',
  'UDZO',
  dmgPath,
])

fs.rmSync(blockMapPath, { force: true })
fs.rmSync(stagingDir, { recursive: true, force: true })

run('/usr/bin/xattr', ['-cr', appPath])
run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', appPath])
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath])

run('/usr/bin/hdiutil', ['imageinfo', dmgPath])
fs.rmSync(path.join(releaseDir, 'mac-arm64'), { recursive: true, force: true })
fs.rmSync(path.join(releaseDir, 'latest-mac.yml'), { force: true })
fs.rmSync(path.join(releaseDir, 'builder-debug.yml'), { force: true })
console.log(`Whiteboard DMG ready: ${dmgPath}`)
