import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const artifactsDir = path.join(root, "artifacts")
const buildDir = path.join(root, "build")
const logFile = path.join(artifactsDir, "native-build.log")
const developerDir = "/Applications/Xcode.app/Contents/Developer"
const projectName = "LumaSense"
const bundleId = "com.openbasaka.simplify.81149876hff33h"
const xcodeProject = path.join(root, projectName + ".xcodeproj")

fs.mkdirSync(artifactsDir, { recursive: true })
fs.writeFileSync(logFile, "")

function writeLog(text) {
  fs.appendFileSync(logFile, text + "\n")
}

function fail(message, detail = "") {
  writeLog("FAIL: " + message)
  if (detail) writeLog(detail)
  console.error(message)
  if (detail) console.error(detail)
  process.exit(1)
}

function run(command, args, options = {}) {
  writeLog("$ " + command + " " + args.join(" "))
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: { ...process.env, DEVELOPER_DIR: developerDir },
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 24,
    timeout: options.timeout || 300000,
  })
  if (result.stdout) writeLog(result.stdout)
  if (result.stderr) writeLog(result.stderr)
  if (result.status !== 0 && !options.allowFailure) {
    fail("命令失败: " + command + " " + args.join(" "), (result.stdout || "") + "\n" + (result.stderr || ""))
  }
  return result
}

function runtimeVersion(runtime) {
  const match = String(runtime).match(/iOS-(\d+)-(\d+)/)
  return match ? match[1] + "." + match[2] : ""
}

function versionScore(version) {
  return String(version)
    .split(".")
    .map((part) => Number(part) || 0)
    .reduce((score, part, index) => score + part / Math.pow(100, index), 0)
}

if (!fs.existsSync(developerDir)) {
  fail("找不到 Xcode: " + developerDir)
}

if (!fs.existsSync(xcodeProject)) {
  fail("找不到 Xcode 工程: " + xcodeProject)
}

const devicesResult = run("xcrun", ["simctl", "list", "devices", "available", "-j"], { timeout: 120000 })
let devicesJson
try {
  devicesJson = JSON.parse(devicesResult.stdout)
} catch (error) {
  fail("无法解析 simctl 设备列表", String(error))
}

const allDevices = Object.entries(devicesJson.devices || {})
  .filter(([runtime]) => String(runtime).includes("iOS"))
  .flatMap(([runtime, devices]) => devices.map((device) => ({
    ...device,
    runtime,
    osVersion: runtimeVersion(runtime),
  })))
  .filter((device) => device.osVersion)
  .sort((a, b) => versionScore(b.osVersion) - versionScore(a.osVersion))

const preferred =
  allDevices.find((device) => device.name === "iPhone 17 Pro Max") ||
  allDevices.find((device) => device.name === "iPhone 17 Pro") ||
  allDevices.find((device) => device.name === "iPhone 16 Pro") ||
  allDevices.find((device) => String(device.name).includes("iPhone")) ||
  allDevices[0]

if (!preferred) {
  fail("没有可用 iOS 模拟器")
}

run("xcodebuild", [
  "-project", xcodeProject,
  "-target", projectName,
  "-sdk", "iphonesimulator",
  "-configuration", "Debug",
  "CODE_SIGNING_ALLOWED=NO",
  "SYMROOT=" + buildDir,
  "OBJROOT=" + buildDir,
  "build",
], { timeout: 600000 })

run("xcrun", ["simctl", "boot", preferred.udid], { allowFailure: true, timeout: 120000 })
run("xcrun", ["simctl", "bootstatus", preferred.udid, "-b"], { timeout: 300000 })

const productsDir = path.join(buildDir, "Debug-iphonesimulator")
const appPath = path.join(productsDir, projectName + ".app")
if (!fs.existsSync(appPath)) {
  fail("构建产物不存在: " + appPath)
}

run("xcrun", ["simctl", "terminate", preferred.udid, bundleId], { allowFailure: true, timeout: 60000 })
run("xcrun", ["simctl", "uninstall", preferred.udid, bundleId], { allowFailure: true, timeout: 60000 })
run("xcrun", ["simctl", "install", preferred.udid, appPath], { timeout: 180000 })
run("xcrun", ["simctl", "launch", preferred.udid, bundleId], { timeout: 120000 })
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1800)

const screenshot = path.join(artifactsDir, "native-ios-simulator.png")
run("xcrun", ["simctl", "io", preferred.udid, "screenshot", screenshot], { timeout: 120000 })

if (!fs.existsSync(screenshot) || fs.statSync(screenshot).size < 1000) {
  fail("截图验收失败: " + screenshot)
}

console.log("Native iOS build and simulator launch passed")
console.log("device=" + preferred.name + " " + preferred.udid)
console.log("app=" + appPath)
console.log("screenshot=" + screenshot)
console.log("log=" + logFile)
