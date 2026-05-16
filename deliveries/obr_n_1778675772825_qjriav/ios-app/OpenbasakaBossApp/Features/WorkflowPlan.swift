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
        runId: "obr_n_1778675772825_qjriav",
        summary: "### 化繁为简｜本轮结果 #### 1. 本轮结果 已把「生成一个复杂 iOS App 的 PRD，并让小白智囊团做质量闸门评审、行动包和评审历史」整理成 App 开工包：先定产品骨架，再生成本地 SwiftUI 工程，并尽量跑一次构建验证。 #### 2. App 方案 - 一句话定位：把 Boss 的需求变成一个可点、可测、可迭代的 iOS 产品...",
        steps: [
            WorkflowStep(title: "先定方案", detail: "把需求收成一个可执行 App 骨架。", status: "已完成"),
            WorkflowStep(title: "创建工程", detail: "本地写入 SwiftUI 源码和 Xcode 工程。", status: "已生成"),
            WorkflowStep(title: "跑验证", detail: "用 xcodebuild 检查 iOS Simulator 构建。", status: "看结果"),
            WorkflowStep(title: "继续迭代", detail: "补真实业务数据、界面细节和端到端验收。", status: "下一步")
        ],
        nextStep: "从这个 SwiftUI 起点继续补业务功能；每次改动后重新跑构建和真机/模拟器检查。"
    )
}
