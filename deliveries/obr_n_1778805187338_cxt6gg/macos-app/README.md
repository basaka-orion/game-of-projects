# Wormhole Landlord / 星门斗地主

Openbasaka 化繁为简生成的 macOS SwiftUI App 高压验收包。游戏只是测试载荷，核心验收目标是证明化繁为简能够把 Boss 的一句话变成真实可运行的桌面产物，并留下构建、运行、规则测试和历史证据。

- Run ID: obr_n_1778805187338_cxt6gg
- Boss 需求: 使用化繁为简和 Openbasaka 做一个原创星际风 Mac 版斗地主游戏，必须可玩、能叫地主、合法出牌、AI 对手、真实运行。
- 项目目录: /Users/apple/Desktop/【项目的游戏】/deliveries/obr_n_1778805187338_cxt6gg/macos-app
- Xcode 入口: /Users/apple/Desktop/【项目的游戏】/deliveries/obr_n_1778805187338_cxt6gg/macos-app/Package.swift
- 运行脚本: /Users/apple/Desktop/【项目的游戏】/deliveries/obr_n_1778805187338_cxt6gg/macos-app/script/build_and_run.sh
- 构建日志: /Users/apple/Desktop/【项目的游戏】/deliveries/obr_n_1778805187338_cxt6gg/macos-app/artifacts/native-macos-build.log
- 截图尝试: /Users/apple/Desktop/【项目的游戏】/deliveries/obr_n_1778805187338_cxt6gg/macos-app/artifacts/native-macos-window.png

## 当前已落地

- 独立 macOS SwiftPM + SwiftUI App，不依赖电影素材、Logo 或人物。
- 54 张牌、三名玩家、地主牌、叫地主/不叫、出牌、过牌、胜负判定。
- 规则引擎覆盖单张、对子、三张、三带一、顺子、连对、炸弹、火箭。
- 基础 AI 会按合法牌型出牌或过牌，不会绕过规则。
- 桌面体验包含主牌桌、右侧 inspector、回合日志、规则面板、工具栏和键盘快捷键。
- `swift test` 先跑规则测试，再构建并启动 `.app`。

## 运行

1. 打开 Xcode: `open '/Users/apple/Desktop/【项目的游戏】/deliveries/obr_n_1778805187338_cxt6gg/macos-app/Package.swift'`
2. 真运行验收: `bash '/Users/apple/Desktop/【项目的游戏】/deliveries/obr_n_1778805187338_cxt6gg/macos-app/script/build_and_run.sh' --verify`
3. 普通启动: `bash '/Users/apple/Desktop/【项目的游戏】/deliveries/obr_n_1778805187338_cxt6gg/macos-app/script/build_and_run.sh'`

## 顶级验收线

- 不是 README 演示，必须通过 SwiftPM 规则测试和 macOS 进程验证。
- 进入窗口后直接可玩，不做欢迎页。
- 非法出牌必须被拦截并写入日志。
- 运行证据必须回写到化繁为简结果面板。

## 本轮方案摘要

### 化繁为简｜本轮结果

#### 1. 本轮结果
已把「使用化繁为简和 Openbasaka 做一个原创星际风 Mac 版斗地主游戏，必须可玩、能叫地主、合法出牌、AI 对手、真实运行。」整理成 Openbasaka 高压验收包：一款原创星际风 macOS SwiftUI 斗地主垂直切片，用来检验化繁为简是否真的能读懂、编排、生成、试跑和留证据。

#### 2. 产品定位
- 产品名：Wormhole Landlord / 星门斗地主。
- 一句话定位：在虫洞牌桌上打一局可验证规则的 macOS 斗地主，游戏本身可玩，背后证明 Openbasaka 的执行链不是空壳。
- IP 边界：原创星际视觉语言，不使用电影素材、Logo 或人物。

#### 3. 可玩性要求
- 牌局：54 张牌、三名玩家、地主牌、叫地主/不叫、出牌、过牌、胜负判定。
- 牌型：单张、对子、三张、三带一、顺子、连对、炸弹、火箭。
- AI：两个基础 AI 对手只会打合法牌或过牌。
- 拦截：非法牌型或压不过上家的牌必须在 UI 中被拒绝并写入日志。

#### 4. Mac 体验
- 工程形态：SwiftPM + SwiftUI macOS App，可用 Xcode 打开 Package.swift。
- 桌面结构：主牌桌、右侧 inspector、规则覆盖清单、回合日志、工具栏、键盘快捷键。
- 运行方式：script/build_and_run.sh 先跑 swift test，再构建、打包 .app、启动并验证进程。

#### 5. 项目落点
- 项目目录：/Users/apple/Desktop/【项目的游戏】/deliveries/obr_n_1778805187338_cxt6gg/macos-app
- 代码入口：Package.swift、Sources/WormholeLandlord、Tests/WormholeLandlordTests、script/build_and_run.sh。
- 运行证据：artifacts/native-macos-build.log、artifacts/native-macos-window.png（若系统允许截屏）、进程验证。

#### 6. 本轮真实依据
- boss_memory
- workflow_runs
- scheduled_tasks
- teams
- team_sessions
- wiki_sources
- wiki_pages
- operating_events