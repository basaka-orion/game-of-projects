import SwiftUI

struct ContentView: View {
    private let plan = WorkflowPlan.current

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    ForEach(plan.steps) { step in
                        StepCard(step: step)
                    }
                    nextStep
                }
                .padding(20)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("本轮结果")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Boss 需求")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text("生成一个复杂 iOS App 的 PRD，并让小白智囊团做质量闸门评审、行动包和评审历史")
                .font(.title3.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
            Text("这不是空白模板。它已经把本轮需求变成可打开、可构建、可继续迭代的 SwiftUI 起点。")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(.background)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var nextStep: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("下一步")
                .font(.headline)
            Text(plan.nextStep)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(.background)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct StepCard: View {
    let step: WorkflowStep

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(step.title)
                    .font(.headline)
                Spacer()
                Text(step.status)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Color.accentColor.opacity(0.14))
                    .foregroundStyle(Color.accentColor)
                    .clipShape(Capsule())
            }
            Text(step.detail)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(.background)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

#Preview {
    ContentView()
}
