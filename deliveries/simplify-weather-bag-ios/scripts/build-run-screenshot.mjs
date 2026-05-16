import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const artifacts = path.join(root, "artifacts")
const developerDir = "/Applications/Xcode.app/Contents/Developer"
const xcodegen = fs.existsSync("/opt/homebrew/bin/xcodegen") ? "/opt/homebrew/bin/xcodegen" : "xcodegen"
const buildDir = path.join(root, "build")
const logFile = path.join(artifacts, "build-run-screenshot.log")
const bundleId = "com.openbasaka.simplify.weatherbag"
const scheme = "WeatherBagCompanion"

fs.mkdirSync(artifacts, { recursive: true })
fs.writeFileSync(logFile, "")

function append(text) {
  fs.appendFileSync(logFile, text + "\n")
}

function run(command, args, options = {}) {
  append("$ " + command + " " + args.join(" "))
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: { ...process.env, DEVELOPER_DIR: developerDir },
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
    timeout: options.timeout || 300000,
  })
  if (result.stdout) append(result.stdout)
  if (result.stderr) append(result.stderr)
  if (result.status !== 0 && !options.allowFailure) {
    console.error(result.stdout)
    console.error(result.stderr)
    throw new Error(`Command failed: ${command} ${args.join(" ")}`)
  }
  return result
}

if (!fs.existsSync(developerDir)) {
  throw new Error("Xcode not found at " + developerDir)
}

run(xcodegen, ["generate", "--spec", "project.yml"], { timeout: 120000 })
run("xcodebuild", [
  "-project", "WeatherBagCompanion.xcodeproj",
  "-scheme", scheme,
  "-sdk", "iphonesimulator",
  "-configuration", "Debug",
  "CODE_SIGNING_ALLOWED=NO",
  "SYMROOT=" + buildDir,
  "OBJROOT=" + buildDir,
  "build",
], { timeout: 900000 })

const devices = JSON.parse(run("xcrun", ["simctl", "list", "devices", "available", "-j"], { timeout: 120000 }).stdout).devices
const candidates = Object.entries(devices)
  .filter(([runtime]) => runtime.includes("iOS"))
  .flatMap(([, list]) => list)
  .filter((device) => device.name.includes("iPhone"))
const device = candidates.find((item) => item.name === "iPhone 17 Pro") || candidates[0]

if (!device) {
  throw new Error("No available iPhone simulator found")
}

run("xcrun", ["simctl", "boot", device.udid], { allowFailure: true, timeout: 120000 })
run("xcrun", ["simctl", "bootstatus", device.udid, "-b"], { timeout: 300000 })

const appPath = path.join(buildDir, "Debug-iphonesimulator", `${scheme}.app`)
if (!fs.existsSync(appPath)) {
  throw new Error("Built app not found: " + appPath)
}

run("xcrun", ["simctl", "install", device.udid, appPath], { timeout: 180000 })
run("xcrun", ["simctl", "launch", device.udid, bundleId], { timeout: 120000 })
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000)

const screenshot = path.join(artifacts, "weather-bag-simulator.png")
run("xcrun", ["simctl", "io", device.udid, "screenshot", screenshot], { timeout: 120000 })

if (!fs.existsSync(screenshot) || fs.statSync(screenshot).size < 1000) {
  throw new Error("Screenshot verification failed: " + screenshot)
}

console.log("WeatherBagCompanion build, install, launch, screenshot passed")
console.log("device=" + device.name + " " + device.udid)
console.log("screenshot=" + screenshot)
console.log("log=" + logFile)
