import Foundation

struct WorkflowStep: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
    let status: String
}

struct WorkflowPlan {
    let runId: String
    let summary: String
    let steps: [WorkflowStep]
    let nextStep: String

    static let current = WorkflowPlan(
        runId: "obr_n_1778781149876_hff33h",
        summary: "### 化繁为简｜本轮结果 #### 1. 本轮结果 已把「做一个复杂 iOS App：LumaSense 视觉意识花园，记录今日画面和心情，选择情绪，生成认知卡片，保存到花园历史，再做每日复盘。请...」整理成一款可真实运行的 iOS App 验收包：LumaSense 视觉意识花园。 #### 2. 产品定位 - 产品名：LumaSense。 - ...",
        steps: [
            WorkflowStep(title: "需求锁定", detail: "把视觉、心情、认知卡片、花园历史和每日复盘收成一个离线可跑的 SwiftUI 垂直切片。", status: "已完成"),
            WorkflowStep(title: "核心体验", detail: "首屏直接提供输入、情绪选择、生成卡片、保存历史和复盘仪式，不做空欢迎页。", status: "已落地"),
            WorkflowStep(title: "真实验证", detail: "本包附带 build-and-run.mjs，负责构建、安装、启动 Simulator 并保存截图。", status: "已写入"),
            WorkflowStep(title: "后续接入", detail: "下一轮再把离线生成替换为真实 AI、持久化和同步。", status: "下一步")
        ],
        nextStep: "先以 Simulator 截图验收这个真实运行切片，再决定是否接入模型服务和 CloudKit。"
    )
}
