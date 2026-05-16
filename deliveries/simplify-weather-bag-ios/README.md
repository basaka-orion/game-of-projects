# 包包晴雨签 / WeatherBagCompanion

这是从沙盘「化繁为简」需求直接落地的 SwiftUI iOS App 工程，不是概念稿。

## 运行

```bash
cd /Users/apple/Desktop/【项目的游戏】/deliveries/simplify-weather-bag-ios
/opt/homebrew/bin/xcodegen generate --spec project.yml
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project WeatherBagCompanion.xcodeproj -scheme WeatherBagCompanion -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

也可以直接打开：

```bash
open /Users/apple/Desktop/【项目的游戏】/deliveries/simplify-weather-bag-ios/WeatherBagCompanion.xcodeproj
```

## 已做成的核心功能

- 用 Open-Meteo 读取城市或当前位置的真实当前天气，不需要 API Key。
- 根据温度、降水、风速、湿度、云量生成女性出门包包清单。
- 清单分为包包核心、天气防护、安全与健康、电子通勤、优雅加分。
- 每一项都有「为什么要带」的说明，可以逐项打钩。
- 打钩状态本地保存，支持一键重置和全武装出门确认。
- UI 方向是优雅、轻卡通、认真但不压迫。

## 验收脚本

```bash
node scripts/build-run-screenshot.mjs
```

脚本会生成 Xcode 工程、构建 iOS Simulator 版本、安装启动模拟器并保存截图到 `artifacts/weather-bag-simulator.png`。
