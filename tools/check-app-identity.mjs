#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const appId = pkg.build?.appId
const productName = pkg.build?.productName

if (!appId || !productName) {
  console.error('Missing build.appId or build.productName in package.json')
  process.exit(1)
}

const expectedApp = path.join(root, 'release', 'mac-arm64', `${productName}.app`)
const expectedInfoPlist = path.join(expectedApp, 'Contents', 'Info.plist')

function plistValue(plistPath, key) {
  const result = spawnSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plistPath], {
    encoding: 'utf8',
  })
  return result.status === 0 ? result.stdout.trim() : ''
}

function mdfindByBundleId(bundleId) {
  try {
    return execFileSync('/usr/bin/mdfind', [`kMDItemCFBundleIdentifier == '${bundleId}'`], {
      encoding: 'utf8',
    })
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => item.endsWith('.app'))
  } catch {
    return []
  }
}

const matches = mdfindByBundleId(appId)
const duplicateMatches = matches.filter((item) => path.resolve(item) !== path.resolve(expectedApp))
const expectedExists = existsSync(expectedInfoPlist)
const expectedBundleId = expectedExists ? plistValue(expectedInfoPlist, 'CFBundleIdentifier') : ''
const expectedName = expectedExists ? plistValue(expectedInfoPlist, 'CFBundleName') : ''

console.log(`Formal Bundle ID: ${appId}`)
console.log(`Expected app: ${expectedApp}`)
console.log(`LaunchServices matches: ${matches.length ? matches.join('\n') : '(none)'}`)

if (!expectedExists) {
  console.error('Expected release app is missing. Run package/build first, then check identity again.')
  process.exit(1)
}

if (expectedBundleId !== appId) {
  console.error(`Expected app has wrong CFBundleIdentifier: ${expectedBundleId || '(empty)'}`)
  process.exit(1)
}

if (expectedName !== productName) {
  console.error(`Expected app has wrong CFBundleName: ${expectedName || '(empty)'}`)
  process.exit(1)
}

if (duplicateMatches.length > 0) {
  console.error('Another app is registered with the formal Bundle ID. This can make macOS open the wrong shell:')
  for (const item of duplicateMatches) {
    console.error(`- ${item}`)
  }
  console.error('Give those apps a different Bundle ID, remove them, or refresh LaunchServices.')
  process.exit(1)
}

console.log('App identity is clean. macOS should route the formal Bundle ID to the release app.')
