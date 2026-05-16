import SwiftUI

struct ContentView: View {
    @State private var selectedMode: StudioMode = .capture
    @State private var imageNote = "傍晚的玻璃幕墙反射出一片金色，我突然意识到自己这一周一直在追赶，却很少停下来确认真正重要的东西。"
    @State private var questionNote = "今天这幅画面想提醒我什么？"
    @State private var selectedMood = MoodOption.all[0]
    @State private var generatedCard: GardenEntry? = GardenEntry.featured
    @State private var garden = GardenEntry.seed
    @State private var checkedReviewTasks: Set<String> = ["signal"]
    @State private var generationPulse = 0

    private var reviewProgress: Int {
        Int((Double(checkedReviewTasks.count) / Double(ReviewTask.all.count)) * 100)
    }

    var body: some View {
        ZStack {
            LumaBackground()
                .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    modeSwitch

                    switch selectedMode {
                    case .capture:
                        captureStudio
                        latestCard
                        gardenPreview(limit: 3)
                    case .garden:
                        gardenHeader
                        gardenPreview(limit: 8)
                    case .review:
                        reviewStudio
                        latestCard
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 12)
                .padding(.bottom, 122)
            }
            .scrollIndicators(.hidden)
        }
        .preferredColorScheme(.dark)
        .foregroundStyle(AppTheme.ink)
        .safeAreaInset(edge: .bottom) {
            commandDock
        }
        .sensoryFeedback(.success, trigger: generationPulse)
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 14) {
            SignalLens(mood: selectedMood)
                .frame(width: 62, height: 62)

            VStack(alignment: .leading, spacing: 4) {
                Text("LumaSense")
                    .font(.system(size: 30, weight: .black, design: .rounded))
                    .minimumScaleFactor(0.82)
                Text("视觉意识花园")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(AppTheme.mist)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                Text("今日")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(AppTheme.mist)
                Text("\(garden.count)")
                    .font(.title2.weight(.heavy))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial, in: Capsule())
        }
    }

    private var modeSwitch: some View {
        HStack(spacing: 8) {
            ForEach(StudioMode.allCases) { mode in
                Button {
                    withAnimation(.spring(response: 0.36, dampingFraction: 0.82)) {
                        selectedMode = mode
                    }
                } label: {
                    Label(mode.rawValue, systemImage: mode.icon)
                        .font(.footnote.weight(.bold))
                        .labelStyle(.titleAndIcon)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(selectedMode == mode ? AppTheme.ink.opacity(0.16) : Color.white.opacity(0.055), in: Capsule())
                        .overlay(Capsule().stroke(selectedMode == mode ? AppTheme.mint.opacity(0.72) : Color.white.opacity(0.08), lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var captureStudio: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 10) {
                Text("把今天看见的画面转成认知卡片")
                    .font(.system(size: 28, weight: .heavy, design: .rounded))
                    .lineLimit(2)
                    .minimumScaleFactor(0.74)
                Text("先记录画面，再选择情绪。LumaSense 会把它压成洞察、行动和复盘线索。")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(AppTheme.subtle)
                    .lineSpacing(3)
            }

            VStack(alignment: .leading, spacing: 10) {
                Label("今日画面", systemImage: "viewfinder")
                    .font(.headline)
                TextEditor(text: $imageNote)
                    .frame(minHeight: 124)
                    .scrollContentBackground(.hidden)
                    .foregroundColor(AppTheme.ink)
                    .padding(14)
                    .background(Color.white.opacity(0.075), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Color.white.opacity(0.12), lineWidth: 1))
            }

            VStack(alignment: .leading, spacing: 10) {
                Label("正在追问", systemImage: "quote.bubble")
                    .font(.headline)
                TextField("今天这幅画面想提醒我什么？", text: $questionNote, axis: .vertical)
                    .lineLimit(2...3)
                    .font(.body.weight(.medium))
                    .padding(16)
                    .background(Color.black.opacity(0.22), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(AppTheme.mint.opacity(0.24), lineWidth: 1))
            }

            moodDeck

            HStack(spacing: 10) {
                MetricPill(icon: "camera.aperture", title: "画面信号", value: "清晰")
                MetricPill(icon: "brain.head.profile", title: "认知负荷", value: selectedMood.load)
            }
        }
        .glassPanel(radius: 34, border: AppTheme.mint.opacity(0.32))
    }

    private var moodDeck: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("情绪光谱", systemImage: "slider.horizontal.3")
                    .font(.headline)
                Spacer()
                Text(selectedMood.title)
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(selectedMood.colors[0])
            }

            ScrollView(.horizontal) {
                HStack(spacing: 10) {
                    ForEach(MoodOption.all) { option in
                        Button {
                            withAnimation(.spring(response: 0.34, dampingFraction: 0.78)) {
                                selectedMood = option
                            }
                        } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                Image(systemName: option.symbol)
                                    .font(.title2.weight(.bold))
                                Text(option.title)
                                    .font(.headline)
                                Text(option.subtitle)
                                    .font(.caption.weight(.medium))
                                    .foregroundStyle(AppTheme.subtle)
                            }
                            .frame(width: 132, alignment: .leading)
                            .padding(14)
                            .background(
                                LinearGradient(colors: option.colors.map { $0.opacity(selectedMood.id == option.id ? 0.44 : 0.16) }, startPoint: .topLeading, endPoint: .bottomTrailing),
                                in: RoundedRectangle(cornerRadius: 24, style: .continuous)
                            )
                            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(selectedMood.id == option.id ? option.colors[0].opacity(0.82) : Color.white.opacity(0.08), lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .scrollIndicators(.hidden)
        }
    }

    private var latestCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("最新认知卡", systemImage: "sparkle.magnifyingglass")
                    .font(.headline)
                Spacer()
                Text(generatedCard?.mood ?? selectedMood.title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(AppTheme.mint)
            }
            GardenCard(entry: generatedCard ?? GardenEntry.featured, highlighted: true)
        }
    }

    private var gardenHeader: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 5) {
                Text("花园历史")
                    .font(.system(size: 30, weight: .heavy, design: .rounded))
                Text("每张卡片都保留画面、情绪、洞察和下一步。")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.subtle)
            }
            Spacer()
            Text("\(garden.count) 张")
                .font(.headline.weight(.black))
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(AppTheme.mint.opacity(0.15), in: Capsule())
        }
    }

    private func gardenPreview(limit: Int) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if selectedMode != .garden {
                HStack {
                    Text("花园历史")
                        .font(.headline)
                    Spacer()
                    Button {
                        withAnimation { selectedMode = .garden }
                    } label: {
                        Label("查看", systemImage: "arrow.right")
                            .font(.caption.weight(.bold))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(AppTheme.mint)
                }
            }

            ForEach(garden.prefix(limit)) { entry in
                GardenCard(entry: entry, highlighted: false)
            }
        }
    }

    private var reviewStudio: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("每日复盘")
                        .font(.system(size: 30, weight: .heavy, design: .rounded))
                    Text("不追求长篇日记，只完成三个高信号动作。")
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.subtle)
                }
                Spacer()
                ZStack {
                    Circle()
                        .stroke(Color.white.opacity(0.1), lineWidth: 8)
                    Circle()
                        .trim(from: 0, to: CGFloat(reviewProgress) / 100)
                        .stroke(AppTheme.mint, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Text("\(reviewProgress)%")
                        .font(.caption.weight(.black))
                }
                .frame(width: 64, height: 64)
            }

            ForEach(ReviewTask.all) { task in
                Button {
                    if checkedReviewTasks.contains(task.id) {
                        checkedReviewTasks.remove(task.id)
                    } else {
                        checkedReviewTasks.insert(task.id)
                    }
                } label: {
                    HStack(spacing: 14) {
                        Image(systemName: checkedReviewTasks.contains(task.id) ? "checkmark.circle.fill" : "circle")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(checkedReviewTasks.contains(task.id) ? AppTheme.mint : AppTheme.subtle)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(task.title)
                                .font(.headline)
                            Text(task.detail)
                                .font(.caption)
                                .foregroundStyle(AppTheme.subtle)
                        }
                        Spacer()
                    }
                    .padding(16)
                    .background(Color.white.opacity(0.065), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .glassPanel(radius: 34, border: AppTheme.lilac.opacity(0.28))
    }

    private var commandDock: some View {
        HStack(spacing: 12) {
            Button {
                withAnimation(.spring(response: 0.36, dampingFraction: 0.82)) {
                    selectedMode = .capture
                }
            } label: {
                Image(systemName: "viewfinder")
                    .font(.title3.weight(.bold))
                    .frame(width: 48, height: 48)
                    .background(Color.white.opacity(0.08), in: Circle())
            }
            .buttonStyle(.plain)

            Button {
                createCard()
            } label: {
                Label("生成认知卡片", systemImage: "wand.and.stars")
                    .font(.headline.weight(.heavy))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .background(
                        LinearGradient(colors: [AppTheme.mint, AppTheme.lilac], startPoint: .leading, endPoint: .trailing),
                        in: Capsule()
                    )
                    .foregroundStyle(Color(red: 0.02, green: 0.03, blue: 0.045))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 18)
        .padding(.top, 12)
        .padding(.bottom, 10)
        .background(.ultraThinMaterial)
    }

    private func createCard() {
        let entry = GardenEntry(
            title: selectedMood.generatedTitle,
            mood: selectedMood.title,
            scene: imageNote,
            question: questionNote,
            insight: selectedMood.generatedInsight,
            action: selectedMood.generatedAction,
            tint: selectedMood.colors[0],
            score: selectedMood.score
        )
        withAnimation(.spring(response: 0.46, dampingFraction: 0.82)) {
            generatedCard = entry
            garden.insert(entry, at: 0)
            selectedMode = .garden
            generationPulse += 1
        }
    }
}

struct GardenCard: View {
    let entry: GardenEntry
    let highlighted: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label(entry.mood, systemImage: highlighted ? "sparkle.magnifyingglass" : "leaf.fill")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(entry.tint)
                Spacer()
                Text("\(entry.score)% 信号")
                    .font(.caption)
                    .foregroundStyle(AppTheme.subtle)
            }

            Text(entry.title)
                .font((highlighted ? Font.title2 : Font.headline).weight(.black))
                .lineLimit(2)
                .minimumScaleFactor(0.82)

            Text(entry.insight)
                .font(.subheadline)
                .foregroundStyle(AppTheme.subtle)
                .lineSpacing(4)

            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "arrowshape.turn.up.right.circle.fill")
                    .foregroundStyle(entry.tint)
                Text(entry.action)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(AppTheme.ink.opacity(0.82))
            }
            .padding(12)
            .background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .padding(highlighted ? 20 : 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: highlighted ? 30 : 24, style: .continuous))
        .background(
            LinearGradient(colors: [entry.tint.opacity(highlighted ? 0.20 : 0.10), Color.white.opacity(0.03)], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: highlighted ? 30 : 24, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: highlighted ? 30 : 24, style: .continuous)
                .stroke(entry.tint.opacity(highlighted ? 0.36 : 0.16), lineWidth: 1)
        )
    }
}

struct GardenEntry: Identifiable {
    let id = UUID()
    let title: String
    let mood: String
    let scene: String
    let question: String
    let insight: String
    let action: String
    let tint: Color
    let score: Int
    var dateLabel: String = "今天"

    static let featured = GardenEntry(
        title: "光线提醒你重新选择注意力",
        mood: "清醒",
        scene: "金色反光落在玻璃幕墙上。",
        question: "我真正想保护什么？",
        insight: "你不是缺更多输入，而是需要把注意力从噪声里收回来，给一个真实信号更多空间。",
        action: "今晚删除一个低价值输入，保留一个能继续追问的线索。",
        tint: AppTheme.mint,
        score: 86,
        dateLabel: "样例"
    )

    static let seed: [GardenEntry] = [
        GardenEntry(
            title: "把注意力从噪音里收回来",
            mood: "清醒",
            scene: "桌面很乱，但一束光只照亮了其中一本书。",
            question: "我到底在回避哪个选择？",
            insight: "你真正需要的不是更多信息，而是判断哪一个信号值得被留下。",
            action: "删除一个无关输入，保留一个真实线索。",
            tint: AppTheme.mint,
            score: 84,
            dateLabel: "样例"
        ),
        GardenEntry(
            title: "给还没成形的想法一点空气",
            mood: "温柔",
            scene: "雨后路面反光，像一张没有写完的纸。",
            question: "我是不是太快要求答案？",
            insight: "模糊不是失败，它可能是想法正在组合。",
            action: "把这个想法画成三个关键词。",
            tint: AppTheme.petal,
            score: 77,
            dateLabel: "昨天"
        )
    ]
}

struct MoodOption: Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let symbol: String
    let colors: [Color]
    let load: String
    let generatedTitle: String
    let generatedInsight: String
    let generatedAction: String
    let score: Int

    static let all: [MoodOption] = [
        MoodOption(
            id: "lucid",
            title: "清醒",
            subtitle: "提炼信号",
            symbol: "sun.max.fill",
            colors: [AppTheme.mint, AppTheme.aqua],
            load: "低",
            generatedTitle: "光线正在替你指出边界",
            generatedInsight: "这段画面不是随机出现的。它提醒你把模糊感受变成一个可命名的问题，再把问题压缩成一个今天能做的小动作。",
            generatedAction: "把最想保护的一件事写成一句话。",
            score: 88
        ),
        MoodOption(
            id: "gentle",
            title: "温柔",
            subtitle: "降低压力",
            symbol: "heart.text.square.fill",
            colors: [AppTheme.petal, AppTheme.lilac],
            load: "柔和",
            generatedTitle: "你可以慢一点，但不要放弃看见",
            generatedInsight: "今天的画面在提醒你，感受不必马上变成结论。先让它被准确命名，行动自然会变小、变清楚。",
            generatedAction: "给这件事取一个不责备自己的名字。",
            score: 81
        ),
        MoodOption(
            id: "mist",
            title: "迷雾",
            subtitle: "保存未知",
            symbol: "cloud.fog.fill",
            colors: [Color(red: 0.45, green: 0.56, blue: 0.78), AppTheme.aqua],
            load: "中",
            generatedTitle: "未知不是墙，是还没有命名的门",
            generatedInsight: "迷雾感说明你已经接近真实问题，但还缺一个角度。不要急着判断，先把不确定拆开。",
            generatedAction: "写下三个你不确定的词，不急着判断。",
            score: 73
        ),
        MoodOption(
            id: "brave",
            title: "勇敢",
            subtitle: "转成行动",
            symbol: "bolt.heart.fill",
            colors: [AppTheme.gold, AppTheme.petal],
            load: "高",
            generatedTitle: "你已经接近真正的问题",
            generatedInsight: "这个画面不是让你继续解释自己，而是在催促你把一个选择落地。先做最小的一步。",
            generatedAction: "把拖延最久的动作压缩成 15 分钟。",
            score: 92
        )
    ]
}

enum StudioMode: String, CaseIterable, Identifiable {
    case capture = "捕捉"
    case garden = "花园"
    case review = "复盘"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .capture: return "viewfinder"
        case .garden: return "leaf.circle"
        case .review: return "moon.stars"
        }
    }
}

struct ReviewTask: Identifiable {
    let id: String
    let title: String
    let detail: String

    static let all: [ReviewTask] = [
        ReviewTask(id: "signal", title: "留下一个高信号画面", detail: "今天最值得被保存的画面是什么？"),
        ReviewTask(id: "emotion", title: "确认主要情绪", detail: "不是评价自己，只标记现在的状态。"),
        ReviewTask(id: "action", title: "压缩成小行动", detail: "明天 15 分钟内可以完成的一步。")
    ]
}

struct SignalLens: View {
    let mood: MoodOption

    var body: some View {
        ZStack {
            Circle()
                .fill(LinearGradient(colors: mood.colors, startPoint: .topLeading, endPoint: .bottomTrailing))
                .shadow(color: mood.colors[0].opacity(0.42), radius: 22, x: 0, y: 12)
            Circle()
                .stroke(Color.white.opacity(0.42), lineWidth: 1)
                .padding(7)
            Image(systemName: mood.symbol)
                .font(.title2.weight(.black))
                .foregroundStyle(Color(red: 0.02, green: 0.03, blue: 0.045))
        }
    }
}

struct MetricPill: View {
    let icon: String
    let title: String
    let value: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .foregroundStyle(AppTheme.mint)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(AppTheme.subtle)
                Text(value)
                    .font(.callout.weight(.black))
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(Color.white.opacity(0.065), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

struct LumaBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.016, green: 0.020, blue: 0.032),
                    Color(red: 0.035, green: 0.056, blue: 0.070),
                    Color(red: 0.065, green: 0.047, blue: 0.072)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            VStack(spacing: 34) {
                ForEach(0..<9, id: \.self) { index in
                    Capsule()
                        .fill(index.isMultiple(of: 2) ? AppTheme.mint.opacity(0.08) : AppTheme.lilac.opacity(0.07))
                        .frame(height: 2)
                        .rotationEffect(.degrees(-18))
                        .offset(x: index.isMultiple(of: 2) ? -70 : 54)
                }
            }
            .padding(.horizontal, -120)
            .opacity(0.72)

            LinearGradient(
                colors: [Color.clear, AppTheme.aqua.opacity(0.12), Color.clear, AppTheme.gold.opacity(0.10)],
                startPoint: .topTrailing,
                endPoint: .bottomLeading
            )
            .blendMode(.screen)
        }
    }
}

enum AppTheme {
    static let ink = Color(red: 0.96, green: 0.98, blue: 1.00)
    static let subtle = Color.white.opacity(0.66)
    static let mist = Color.white.opacity(0.58)
    static let mint = Color(red: 0.52, green: 0.94, blue: 0.74)
    static let aqua = Color(red: 0.36, green: 0.72, blue: 0.92)
    static let lilac = Color(red: 0.70, green: 0.58, blue: 0.98)
    static let petal = Color(red: 0.98, green: 0.55, blue: 0.72)
    static let gold = Color(red: 0.96, green: 0.76, blue: 0.42)
}

extension View {
    func glassPanel(radius: CGFloat, border: Color) -> some View {
        self
            .padding(18)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .background(
                LinearGradient(colors: [Color.white.opacity(0.13), Color.white.opacity(0.035)], startPoint: .topLeading, endPoint: .bottomTrailing),
                in: RoundedRectangle(cornerRadius: radius, style: .continuous)
            )
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(border, lineWidth: 1))
            .shadow(color: Color.black.opacity(0.28), radius: 32, x: 0, y: 22)
    }
}

#Preview {
    ContentView()
}
