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
        runId: "obr_n_1778675524000_9j8fnh",
        summary: "### 化繁为简｜本轮结果 #### 1. 本轮结果 已把「我想做一款为女性出门在外，根据当地实际的天气情况，为她们详细、有趣、用心、优雅、卡通、严谨认真地准备外出需要带的东西，特别是包包里的。然后...」整理成一款 iOS App 开工包：它不是普通待办，而是“当地天气 + 女性外出场景 + 包包清单 + 打钩出门”的细致助手。 #### 2. 产品...",
        steps: [
            WorkflowStep(title: "天气与定位", detail: "接入真实天气 API，按城市、降雨、温度、紫外线和风力生成包包建议。", status: "下一步"),
            WorkflowStep(title: "包包清单", detail: "把天气防护、精致补给、健康安全、通勤底仓做成可打钩列表。", status: "已落首屏"),
            WorkflowStep(title: "场景模式", detail: "通勤、约会、旅行、夜归会影响推荐物品和文案语气。", status: "已占位"),
            WorkflowStep(title: "严谨验收", detail: "未接实时天气时必须标明样例天气，不能假装拿到真实数据。", status: "已写入")
        ],
        nextStep: "优先接入 WeatherKit 或可信天气 API，再把样例天气替换为真实当地天气。"
    )
}
