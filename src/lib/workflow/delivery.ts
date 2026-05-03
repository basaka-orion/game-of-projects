import type { TeamAction } from '../teams/types'
import type { WorkflowStudioItem } from './studio'

interface WorkflowDeliveryParams {
  item: WorkflowStudioItem
  sessionId: string
  input: string
  artifactContent: string
}

type ActionDraft = Omit<TeamAction, 'id' | 'createdAt' | 'updatedAt'>

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function slugify(value: string): string {
  return (
    value
      .replace(/[^\p{L}\p{N}_-]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36) || 'Openbasaka-Delivery'
  )
}

function extractProductName(item: WorkflowStudioItem, input: string): string {
  const source = `${item.name}\n${item.goal}\n${input}`
  const explicit = source.match(/\b[A-Z][A-Za-z0-9]{2,24}\b/g)?.find((token) => {
    return !['App', 'Mac', 'iOS', 'PRD', 'GLM', 'API', 'SwiftUI', 'Openbasaka'].includes(token)
  })
  if (explicit) return explicit
  return item.name.split(/[｜|:：]/)[0]?.trim() || 'OpenbasakaProduct'
}

function swiftIdentifier(value: string, fallback = 'LumaSense'): string {
  const cleaned = value.replace(/[^A-Za-z0-9_]/g, '')
  const safe = cleaned || fallback
  return /^[A-Za-z_]/.test(safe) ? safe : `${fallback}${safe}`
}

function nativeTargetName(productName: string): string {
  return `${swiftIdentifier(productName)}Native`
}

function nativeBundleId(productName: string): string {
  const suffix = productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 28) || 'lumasense'
  return `com.openbasaka.${suffix}.native`
}

function cleanProjectSeedLine(line: string): string {
  return line
    .replace(/^[-*#\s\d.、]+/g, '')
    .replace(/^请用这个工作流(?:试跑当前任务|设计一个新的)?[：:]\s*/i, '')
    .replace(/^围绕当前工作流目标完整执行一次[。.]?$/i, '')
    .replace(/^工作流[：:]\s*/i, '')
    .replace(/^当前稳定目标[：:]?\s*/i, '')
    .trim()
}

function extractProjectSeed(item: WorkflowStudioItem, input: string): string {
  const candidate = input
    .split('\n')
    .map(cleanProjectSeedLine)
    .find((line) => {
      if (!line) return false
      if (/^(硬性要求|必须|不要引用|每一步|如果|输出要求|执行规则)/.test(line)) return false
      if (/^\{\{.+\}\}$/.test(line)) return false
      return true
    })

  return candidate || item.name || extractProductName(item, input)
}

export function buildWorkflowDeliveryRoot(item: WorkflowStudioItem, input: string): string {
  return `/Users/apple/Desktop/🚀-${slugify(extractProjectSeed(item, input))}`
}

export function shouldMaterializeWorkflowDelivery(item: WorkflowStudioItem, input: string): boolean {
  if (item.workflowType !== 'build' && item.workflowType !== 'xcode-mac-app') return false
  const source = `${item.name}\n${item.goal}\n${input}`
  return /app|应用|程序|产品落地|开发|构建|运行|成品|原型|prototype|swiftui|ios|mac/i.test(source)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildReadme(params: WorkflowDeliveryParams, projectRoot: string): string {
  return [
    `# ${params.item.name} - 自动落地产物`,
    '',
    '这不是只停留在聊天里的方案。Workflow Studio 已把本轮成果转成一个本地可打开、可验证、可继续迭代的项目包。',
    '',
    '## 怎么验收',
    '',
    `1. 打开可运行原型：${projectRoot}/prototype/index.html`,
    `2. 运行验证脚本：\`node ${projectRoot}/scripts/verify.mjs\``,
    `3. 查看 Native iOS 工程：${projectRoot}/native-ios`,
    `4. 运行 Native 构建与截图验收：\`node ${projectRoot}/native-ios/scripts/build-and-screenshot.mjs\``,
    '',
    '## Boss 本次输入',
    '',
    params.input,
    '',
    '---',
    '',
    '## 群策最终成果',
    '',
    params.artifactContent || '本轮没有拿到可读成果。',
  ].join('\n')
}

function buildPrototypeHtml(params: WorkflowDeliveryParams, productName: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(productName)} Prototype</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="app-shell">
      <section class="hero" aria-label="首屏">
        <p class="eyebrow">LUMA DELIVERY PROTOTYPE</p>
        <h1>${escapeHtml(productName)}</h1>
        <p class="promise">把一张照片、一段心情或一个问题，转成一张能照亮认知角落的视觉回应。</p>
        <button id="ignite" class="primary-action" type="button">点亮一张认知卡片</button>
      </section>

      <section class="workspace" aria-label="核心流程">
        <div class="input-panel">
          <span class="panel-label">输入</span>
          <textarea id="userInput" rows="5">我今天拍到一束从窗边落下来的光，想知道它提醒了我什么。</textarea>
          <div class="chips">
            <button type="button" data-mood="清醒">清醒</button>
            <button type="button" data-mood="浪漫">浪漫</button>
            <button type="button" data-mood="迷雾">迷雾</button>
          </div>
        </div>

        <article id="card" class="luma-card">
          <span class="card-kicker">等待点亮</span>
          <h2>光还没有进入画面</h2>
          <p>点击上方按钮，模拟 GLM 5.1 对视觉与心情的认知映射。</p>
        </article>
      </section>
    </main>
    <script src="./app.js"></script>
  </body>
</html>`
}

function buildPrototypeCss(): string {
  return `:root {
  color-scheme: dark;
  --bg: #111416;
  --mist: rgba(226, 232, 221, 0.72);
  --amber: #f6c56d;
  --amber-soft: rgba(246, 197, 109, 0.2);
  --glass: rgba(255, 255, 255, 0.075);
  --line: rgba(246, 197, 109, 0.22);
  font-family: ui-rounded, "SF Pro Rounded", "SF Pro Display", system-ui, sans-serif;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at 50% 22%, rgba(246, 197, 109, 0.18), transparent 26rem),
    radial-gradient(circle at 24% 80%, rgba(132, 190, 175, 0.16), transparent 22rem),
    linear-gradient(145deg, #0c1011, var(--bg));
  color: #f4efe4;
}

.app-shell {
  width: min(1120px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 56px 0;
}

.hero {
  min-height: 42vh;
  display: grid;
  align-content: center;
  gap: 18px;
}

.eyebrow, .panel-label, .card-kicker {
  margin: 0;
  color: var(--amber);
  letter-spacing: 0.14em;
  font-size: 12px;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  max-width: 820px;
  font-size: clamp(48px, 8vw, 104px);
  line-height: 0.92;
  letter-spacing: 0;
}

.promise {
  max-width: 680px;
  margin: 0;
  color: var(--mist);
  font-size: 20px;
  line-height: 1.7;
}

.primary-action, .chips button {
  border: 1px solid var(--line);
  background: var(--amber-soft);
  color: #fff5dc;
  min-height: 44px;
  padding: 0 18px;
  border-radius: 999px;
  font: inherit;
  cursor: pointer;
}

.primary-action {
  width: fit-content;
  min-width: 190px;
  box-shadow: 0 0 42px rgba(246, 197, 109, 0.18);
}

.workspace {
  display: grid;
  grid-template-columns: minmax(280px, 0.9fr) minmax(320px, 1.1fr);
  gap: 18px;
  align-items: stretch;
}

.input-panel, .luma-card {
  border: 1px solid rgba(255,255,255,0.1);
  background: var(--glass);
  backdrop-filter: blur(24px);
  border-radius: 24px;
  padding: 24px;
}

textarea {
  width: 100%;
  margin: 18px 0;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 18px;
  background: rgba(0,0,0,0.18);
  color: #fff7e9;
  padding: 16px;
  font: inherit;
  line-height: 1.6;
  resize: vertical;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.luma-card {
  position: relative;
  overflow: hidden;
  min-height: 330px;
}

.luma-card::before {
  content: "";
  position: absolute;
  inset: auto 28px 28px auto;
  width: 150px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(246,197,109,0.38), transparent 68%);
  filter: blur(2px);
}

.luma-card h2 {
  position: relative;
  margin: 48px 0 16px;
  max-width: 620px;
  font-size: clamp(30px, 4.2vw, 56px);
  line-height: 1.04;
  letter-spacing: 0;
}

.luma-card p {
  position: relative;
  max-width: 560px;
  color: var(--mist);
  font-size: 18px;
  line-height: 1.75;
}

@media (max-width: 760px) {
  .workspace { grid-template-columns: 1fr; }
  .app-shell { padding-top: 32px; }
}`
}

function buildPrototypeJs(productName: string): string {
  return `const responses = [
  {
    title: "你不是在看光，你是在看自己仍愿意被照亮的部分",
    body: "这张画面里的光没有占据中心，却改变了所有边缘。今天适合把一个模糊问题写下来，不急着解决，只先给它一个名字。"
  },
  {
    title: "迷雾不是阻挡，而是提醒你慢一点靠近",
    body: "当世界不再锋利，你的注意力会开始听见细节。保留这张卡片，把它作为今天的认知锚点。"
  },
  {
    title: "这不是答案，是一枚温柔的追问",
    body: "如果这束光能替你问一个问题，它会问：你最近忽略了哪个已经出现过很多次的信号？"
  }
]

let mood = "清醒"
const card = document.querySelector("#card")
const input = document.querySelector("#userInput")

document.querySelectorAll("[data-mood]").forEach((button) => {
  button.addEventListener("click", () => {
    mood = button.dataset.mood
    document.querySelectorAll("[data-mood]").forEach((item) => item.classList.remove("active"))
    button.classList.add("active")
  })
})

document.querySelector("#ignite").addEventListener("click", () => {
  const seed = Math.abs([...input.value].reduce((acc, char) => acc + char.charCodeAt(0), mood.length))
  const response = responses[seed % responses.length]
  card.innerHTML = \`
    <span class="card-kicker">\${${JSON.stringify(productName)}} · \${mood}</span>
    <h2>\${response.title}</h2>
    <p>\${response.body}</p>
  \`
})`
}

function buildVerifierScript(productName: string): string {
  return `import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const requiredFiles = [
  "README.md",
  "prototype/index.html",
  "prototype/styles.css",
  "prototype/app.js",
  "scripts/verify.mjs",
  "native-ios/project.yml",
  "native-ios/scripts/build-and-screenshot.mjs",
]

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)))
if (missing.length) {
  console.error("缺少文件:", missing.join(", "))
  process.exit(1)
}

const html = fs.readFileSync(path.join(root, "prototype/index.html"), "utf8")
const js = fs.readFileSync(path.join(root, "prototype/app.js"), "utf8")
const checks = [
  [html.includes(${JSON.stringify(productName)}), "HTML 没有产品名"],
  [html.includes("点亮一张认知卡片"), "HTML 没有核心按钮"],
  [js.includes("responses"), "JS 没有模拟认知回应"],
  [fs.existsSync(path.join(root, "native-ios/project.yml")), "Native iOS 工程配置不存在"],
]

const failed = checks.filter(([ok]) => !ok)
if (failed.length) {
  failed.forEach(([, message]) => console.error(message))
  process.exit(1)
}

console.log("Luma delivery verification passed")
console.log("root=" + root)
`
}

function buildSwiftUISource(productName: string): string {
  return `import SwiftUI

@main
struct ${swiftIdentifier(productName)}App: App {
    var body: some Scene {
        WindowGroup {
            LumaSenseHomeView()
        }
    }
}

struct LumaSenseHomeView: View {
    @State private var prompt = "我今天拍到一束从窗边落下来的光。"
    @State private var cardTitle = "光还没有进入画面"
    @State private var cardBody = "点击点亮，模拟 GLM 5.1 生成视觉认知回应。"

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(red: 0.06, green: 0.08, blue: 0.08), Color(red: 0.16, green: 0.13, blue: 0.09)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
            VStack(alignment: .leading, spacing: 24) {
                Text("${productName}")
                    .font(.system(size: 42, weight: .semibold, design: .rounded))
                TextEditor(text: $prompt)
                    .frame(height: 130)
                    .clipShape(RoundedRectangle(cornerRadius: 18))
                Button("点亮一张认知卡片") {
                    cardTitle = "你不是在看光，你是在看自己仍愿意被照亮的部分"
                    cardBody = "这张画面里的光没有占据中心，却改变了所有边缘。"
                }
                .buttonStyle(.borderedProminent)
                VStack(alignment: .leading, spacing: 12) {
                    Text(cardTitle).font(.title2.bold())
                    Text(cardBody).foregroundStyle(.secondary)
                }
                .padding(24)
                .background(.ultraThinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 24))
            }
            .padding(28)
            .foregroundStyle(.white)
        }
    }
}
`
}

function buildNativeProjectSpec(productName: string): string {
  const targetName = nativeTargetName(productName)
  const bundleId = nativeBundleId(productName)
  return `name: ${targetName}
options:
  bundleIdPrefix: com.openbasaka
  deploymentTarget:
    iOS: "17.0"
settings:
  base:
    SWIFT_VERSION: 5.9
    IPHONEOS_DEPLOYMENT_TARGET: "17.0"
targets:
  ${targetName}:
    type: application
    platform: iOS
    sources:
      - path: ${targetName}
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: ${bundleId}
        CODE_SIGN_STYLE: Automatic
        MARKETING_VERSION: 1.0
        CURRENT_PROJECT_VERSION: 1
        ASSETCATALOG_COMPILER_APPICON_NAME: ""
    info:
      path: ${targetName}/Info.plist
      properties:
        CFBundleDisplayName: ${productName}
        CFBundleShortVersionString: "1.0"
        CFBundleVersion: "1"
        UILaunchScreen:
          UIColorName: ""
        NSPhotoLibraryUsageDescription: "选择一张照片，让 AI 生成视觉认知卡片。"
        NSCameraUsageDescription: "拍下一张照片，让 AI 生成视觉认知卡片。"
`
}

function buildNativeInfoPlist(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
</dict>
</plist>
`
}

function buildNativeSwiftUISource(productName: string): string {
  const appName = nativeTargetName(productName)
  return `import SwiftUI

@main
struct ${appName}App: App {
    var body: some Scene {
        WindowGroup {
            LumaNativeHomeView()
        }
    }
}

struct LumaNativeHomeView: View {
    @State private var input = "我今天拍到一束从窗边落下来的光，想知道它提醒了我什么。"
    @State private var selectedMood = "清醒"
    @State private var generated = false

    private let moods = ["清醒", "浪漫", "迷雾"]

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.05, green: 0.07, blue: 0.07),
                    Color(red: 0.16, green: 0.13, blue: 0.09),
                    Color(red: 0.08, green: 0.12, blue: 0.11)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("LUMA NATIVE BUILD")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .tracking(2)
                            .foregroundStyle(Color(red: 0.96, green: 0.77, blue: 0.43))

                        Text("${productName}")
                            .font(.system(size: 48, weight: .semibold, design: .rounded))
                            .lineLimit(2)
                            .minimumScaleFactor(0.68)

                        Text("把一张照片、一段心情或一个问题，转成一张能照亮认知角落的视觉回应。")
                            .font(.title3)
                            .foregroundStyle(.white.opacity(0.72))
                            .lineSpacing(6)
                    }
                    .padding(.top, 40)

                    VStack(alignment: .leading, spacing: 16) {
                        Text("输入")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundStyle(Color(red: 0.96, green: 0.77, blue: 0.43))

                        TextEditor(text: $input)
                            .frame(minHeight: 116)
                            .scrollContentBackground(.hidden)
                            .padding(12)
                            .background(.black.opacity(0.18), in: RoundedRectangle(cornerRadius: 18))

                        HStack {
                            ForEach(moods, id: \\.self) { mood in
                                Button(mood) {
                                    selectedMood = mood
                                }
                                .buttonStyle(.bordered)
                                .tint(selectedMood == mood ? .orange : .white.opacity(0.55))
                            }
                        }

                        Button {
                            withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) {
                                generated = true
                            }
                        } label: {
                            Text("点亮一张认知卡片")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color(red: 0.96, green: 0.77, blue: 0.43))
                        .foregroundStyle(.black)
                        .controlSize(.large)
                    }
                    .padding(20)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 26))

                    VStack(alignment: .leading, spacing: 14) {
                        Text(generated ? "${productName} · \\(selectedMood)" : "等待点亮")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .tracking(1.4)
                            .foregroundStyle(Color(red: 0.96, green: 0.77, blue: 0.43))

                        Text(generated ? "你不是在看光，你是在看自己仍愿意被照亮的部分" : "光还没有进入画面")
                            .font(.system(size: 30, weight: .semibold, design: .rounded))
                            .lineSpacing(4)

                        Text(generated ? "这张画面里的光没有占据中心，却改变了所有边缘。今天适合把一个模糊问题写下来，不急着解决，只先给它一个名字。" : "点击上方按钮，模拟 GLM 5.1 对视觉与心情的认知映射。")
                            .font(.body)
                            .foregroundStyle(.white.opacity(0.72))
                            .lineSpacing(6)
                    }
                    .padding(24)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        ZStack(alignment: .bottomTrailing) {
                            RoundedRectangle(cornerRadius: 28).fill(.white.opacity(0.075))
                            Circle()
                                .fill(Color(red: 0.96, green: 0.77, blue: 0.43).opacity(0.28))
                                .frame(width: 150)
                                .blur(radius: 6)
                                .offset(x: 28, y: 34)
                        }
                    )
                }
                .padding(24)
            }
        }
        .foregroundStyle(.white)
    }
}
`
}

function buildNativeBuildScript(productName: string): string {
  const targetName = nativeTargetName(productName)
  const bundleId = nativeBundleId(productName)
  return `import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const artifactsDir = path.join(root, "artifacts")
const buildDir = path.join(root, "build")
const logFile = path.join(artifactsDir, "native-build.log")
const developerDir = "/Applications/Xcode.app/Contents/Developer"
const targetName = ${JSON.stringify(targetName)}
const bundleId = ${JSON.stringify(bundleId)}

fs.mkdirSync(artifactsDir, { recursive: true })
fs.writeFileSync(logFile, "")

function writeLog(text) {
  fs.appendFileSync(logFile, text + "\\n")
}

function fail(message, detail = "") {
  writeLog("FAIL: " + message)
  if (detail) writeLog(detail)
  console.error(message)
  if (detail) console.error(detail)
  process.exit(1)
}

function resolveTool(name, candidates = []) {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return name
}

function run(command, args, options = {}) {
  writeLog("$ " + command + " " + args.join(" "))
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: { ...process.env, DEVELOPER_DIR: developerDir },
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
    timeout: options.timeout || 300000,
  })
  if (result.stdout) writeLog(result.stdout)
  if (result.stderr) writeLog(result.stderr)
  if (result.status !== 0 && !options.allowFailure) {
    fail("命令失败: " + command + " " + args.join(" "), (result.stdout || "") + "\\n" + (result.stderr || ""))
  }
  return result
}

if (!fs.existsSync(developerDir)) {
  fail("找不到 Xcode: " + developerDir)
}

const xcodegen = resolveTool("xcodegen", ["/opt/homebrew/bin/xcodegen", "/usr/local/bin/xcodegen"])
run(xcodegen, ["generate", "--spec", path.join(root, "project.yml")], { timeout: 120000 })

function runtimeVersion(runtime) {
  const match = String(runtime).match(/iOS-(\\d+)-(\\d+)/)
  return match ? match[1] + "." + match[2] : ""
}

function versionScore(version) {
  return String(version)
    .split(".")
    .map((part) => Number(part) || 0)
    .reduce((score, part, index) => score + part / Math.pow(100, index), 0)
}

const devicesResult = run("xcrun", ["simctl", "list", "devices", "available", "-j"], { timeout: 120000 })
const devicesJson = JSON.parse(devicesResult.stdout)
const allDevices = Object.entries(devicesJson.devices)
  .filter(([runtime]) => runtime.includes("iOS"))
  .flatMap(([runtime, devices]) => devices.map((device) => ({
    ...device,
    runtime,
    osVersion: runtimeVersion(runtime),
  })))
  .filter((device) => device.osVersion)
  .sort((a, b) => versionScore(b.osVersion) - versionScore(a.osVersion))
const preferred = allDevices.find((device) => device.name === "iPhone 16 Pro") || allDevices.find((device) => device.name.includes("iPhone")) || allDevices[0]
if (!preferred) {
  fail("没有可用 iOS 模拟器")
}

// Build the target directly against the simulator SDK. This avoids a brittle
// Xcode destination lookup when the installed Xcode SDK is newer than the
// available simulator runtime. simctl still uses an exact UDID for launch.
run("xcodebuild", [
  "-project", targetName + ".xcodeproj",
  "-target", targetName,
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
const appPath = path.join(productsDir, targetName + ".app")
if (!fs.existsSync(appPath)) {
  fail("构建产物不存在: " + appPath)
}

run("xcrun", ["simctl", "install", preferred.udid, appPath], { timeout: 180000 })
run("xcrun", ["simctl", "launch", preferred.udid, bundleId], { timeout: 120000 })
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1800)

const screenshot = path.join(artifactsDir, "native-ios-simulator.png")
run("xcrun", ["simctl", "io", preferred.udid, "screenshot", screenshot], { timeout: 120000 })

if (!fs.existsSync(screenshot) || fs.statSync(screenshot).size < 1000) {
  fail("截图验收失败: " + screenshot)
}

console.log("Native iOS build and screenshot passed")
console.log("device=" + preferred.name + " " + preferred.udid)
console.log("screenshot=" + screenshot)
console.log("log=" + logFile)
`
}

export function buildWorkflowDeliveryActions(params: WorkflowDeliveryParams): ActionDraft[] {
  const projectRoot = buildWorkflowDeliveryRoot(params.item, params.input)
  const productName = extractProductName(params.item, params.input)
  const targetName = nativeTargetName(productName)
  const base = {
    sessionId: params.sessionId,
    teamId: params.item.teamId,
    ownerAgentId: 'workflow-delivery-runner',
    ownerAgentName: '交付执行循环',
    status: 'proposed' as const,
    requiresApproval: false,
  }

  return [
    {
      ...base,
      capability: 'terminal',
      toolId: 'terminal',
      title: '创建真实交付项目目录',
      description: '为本轮工作流创建可运行原型、源码骨架和验证脚本目录。',
      params: {
        command: `mkdir -p ${shellQuote(projectRoot)} ${shellQuote(`${projectRoot}/prototype`)} ${shellQuote(`${projectRoot}/scripts`)} ${shellQuote(`${projectRoot}/ios-swiftui`)} ${shellQuote(`${projectRoot}/native-ios/${targetName}`)} ${shellQuote(`${projectRoot}/native-ios/scripts`)} ${shellQuote(`${projectRoot}/native-ios/artifacts`)}`,
        timeout: 30000,
      },
      risk: 'low',
    },
    {
      ...base,
      capability: 'filesystem',
      toolId: 'file_write',
      title: '写入交付 README 与完整方案',
      description: '把群策成果保存为项目包 README，作为后续构建、归档和复盘入口。',
      params: { path: `${projectRoot}/README.md`, content: buildReadme(params, projectRoot) },
      risk: 'medium',
    },
    {
      ...base,
      capability: 'filesystem',
      toolId: 'file_write',
      title: '生成可运行 HTML 原型',
      description: '生成无需安装依赖即可打开的本地交互原型，用于真实验收产品首屏与核心闭环。',
      params: { path: `${projectRoot}/prototype/index.html`, content: buildPrototypeHtml(params, productName) },
      risk: 'medium',
    },
    {
      ...base,
      capability: 'filesystem',
      toolId: 'file_write',
      title: '生成原型视觉样式',
      description: '写入产品气质对应的 CSS，确保视觉不是空白占位。',
      params: { path: `${projectRoot}/prototype/styles.css`, content: buildPrototypeCss() },
      risk: 'medium',
    },
    {
      ...base,
      capability: 'filesystem',
      toolId: 'file_write',
      title: '生成原型交互逻辑',
      description: '写入可点击、可模拟 AI 回应的前端逻辑，让 Boss 能看到流程运行。',
      params: { path: `${projectRoot}/prototype/app.js`, content: buildPrototypeJs(productName) },
      risk: 'medium',
    },
    {
      ...base,
      capability: 'filesystem',
      toolId: 'file_write',
      title: '生成 SwiftUI 源码骨架',
      description: '为 iOS/SwiftUI 落地准备可迁移的核心界面源码骨架。',
      params: { path: `${projectRoot}/ios-swiftui/LumaSenseApp.swift`, content: buildSwiftUISource(productName) },
      risk: 'medium',
    },
    {
      ...base,
      capability: 'filesystem',
      toolId: 'file_write',
      title: '生成 Native iOS 工程配置',
      description: '写入 XcodeGen project.yml，用于生成真实可构建的 Xcode 工程。',
      params: { path: `${projectRoot}/native-ios/project.yml`, content: buildNativeProjectSpec(productName) },
      risk: 'medium',
    },
    {
      ...base,
      capability: 'filesystem',
      toolId: 'file_write',
      title: '生成 Native iOS Info.plist',
      description: '写入 Native iOS 工程所需 Info.plist 与权限文案。',
      params: { path: `${projectRoot}/native-ios/${targetName}/Info.plist`, content: buildNativeInfoPlist() },
      risk: 'medium',
    },
    {
      ...base,
      capability: 'filesystem',
      toolId: 'file_write',
      title: '生成 Native SwiftUI App 源码',
      description: '写入可被 Xcode 构建、安装并截图验收的 SwiftUI App。',
      params: { path: `${projectRoot}/native-ios/${targetName}/${targetName}App.swift`, content: buildNativeSwiftUISource(productName) },
      risk: 'medium',
    },
    {
      ...base,
      capability: 'filesystem',
      toolId: 'file_write',
      title: '生成 Native 构建与截图验收脚本',
      description: '写入自动生成 Xcode 工程、xcodebuild 构建、模拟器安装启动和截图的验收脚本。',
      params: { path: `${projectRoot}/native-ios/scripts/build-and-screenshot.mjs`, content: buildNativeBuildScript(productName) },
      risk: 'medium',
    },
    {
      ...base,
      capability: 'filesystem',
      toolId: 'file_write',
      title: '生成自动验证脚本',
      description: '验证项目包关键文件、产品名、核心按钮和交互脚本是否真实存在。',
      params: { path: `${projectRoot}/scripts/verify.mjs`, content: buildVerifierScript(productName) },
      risk: 'medium',
    },
    {
      ...base,
      capability: 'terminal',
      toolId: 'terminal',
      title: '运行交付项目验证脚本',
      description: '实际执行本地验证，确认文件结构和原型关键交互没有缺失。',
      params: { command: `node ${shellQuote(`${projectRoot}/scripts/verify.mjs`)}`, timeout: 30000 },
      risk: 'low',
    },
    {
      ...base,
      capability: 'terminal',
      toolId: 'terminal',
      title: '构建并截图验收 Native iOS App',
      description: '使用临时 DEVELOPER_DIR 调用 Xcode，不改系统设置；生成 Xcode 工程、构建、启动模拟器并保存截图。',
      params: { command: `node ${shellQuote(`${projectRoot}/native-ios/scripts/build-and-screenshot.mjs`)}`, timeout: 900000 },
      risk: 'low',
    },
    {
      ...base,
      capability: 'terminal',
      toolId: 'terminal',
      title: '打开可运行原型',
      description: '在 Mac 上打开本地 HTML 原型，让 Boss 可以直接验收真实运行效果。',
      params: { command: `open ${shellQuote(`${projectRoot}/prototype/index.html`)}`, timeout: 10000 },
      risk: 'low',
    },
  ]
}
