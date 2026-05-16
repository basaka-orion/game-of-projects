import SwiftUI

struct ContentView: View {
    @State private var imageNote = "窗边有一束光落在书页上，我突然想知道自己最近真正想保护什么。"
    @State private var selectedMood = "清醒"
    @State private var generatedCard: GardenEntry?
    @State private var garden = GardenEntry.seed

    private let moods = ["清醒", "温柔", "迷雾", "勇敢"]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    hero
                    inputLab
                    generatedSection
                    gardenHistory
                    ritualCard
                }
                .padding(20)
            }
            .background(AppTheme.background.ignoresSafeArea())
            .navigationTitle("LumaSense")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("视觉意识花园", systemImage: "camera.macro")
                .font(.caption.weight(.bold))
                .foregroundStyle(AppTheme.gold)
            Text("把今天看见的画面，变成一张能复盘自己的认知卡片。")
                .font(.largeTitle.weight(.bold))
                .lineLimit(3)
                .minimumScaleFactor(0.72)
            Text("这是一个离线可运行的第一版垂直切片：输入画面和心情，生成卡片，保存到花园历史，再进入每日复盘。")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.72))
                .lineSpacing(4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(22)
        .background(AppTheme.panel, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(alignment: .bottomTrailing) {
            Image(systemName: "sparkles")
                .font(.system(size: 42, weight: .semibold))
                .foregroundStyle(AppTheme.gold.opacity(0.8))
                .padding(24)
        }
    }

    private var inputLab: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("今日画面 / 心情")
                .font(.headline)
            TextEditor(text: $imageNote)
                .frame(minHeight: 118)
                .scrollContentBackground(.hidden)
                .padding(12)
                .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(.white.opacity(0.12), lineWidth: 1)
                )

            HStack(spacing: 8) {
                ForEach(moods, id: \.self) { mood in
                    Button {
                        selectedMood = mood
                    } label: {
                        Text(mood)
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(selectedMood == mood ? moodColor(mood).opacity(0.28) : Color.white.opacity(0.08))
                            .foregroundStyle(selectedMood == mood ? .white : .white.opacity(0.68))
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }

            Button {
                createCard()
            } label: {
                Label("生成认知卡片并保存", systemImage: "wand.and.stars")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(AppTheme.gold)
            .foregroundStyle(.black)
            .controlSize(.large)
        }
        .padding(20)
        .background(AppTheme.panel, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }

    private var generatedSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("最新卡片")
                .font(.headline)
            GardenCard(entry: generatedCard ?? garden[0], highlighted: true)
        }
    }

    private var gardenHistory: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("花园历史")
                    .font(.headline)
                Spacer()
                Text("\(garden.count) 张")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AppTheme.gold)
            }
            ForEach(garden.prefix(4)) { entry in
                GardenCard(entry: entry, highlighted: false)
            }
        }
    }

    private var ritualCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("今日复盘仪式", systemImage: "moon.stars")
                .font(.headline)
            Text("今晚只问一个问题：这张卡片里，我正在回避的真实行动是什么？")
                .font(.title3.weight(.semibold))
            Text("记录一个 15 分钟以内能完成的小动作，明天再回来看它是否真的改变了状态。")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.68))
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.deepPanel, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }

    private func createCard() {
        let entry = GardenEntry(
            title: selectedMood == "勇敢" ? "你已经接近真正的问题" : "光线正在替你指出边界",
            mood: selectedMood,
            insight: "这段画面不是随机出现的。它提醒你把模糊感受变成一个可命名的问题，再把问题压缩成一个今天能做的小动作。",
            action: selectedMood == "迷雾" ? "写下三个你不确定的词，不急着判断。" : "把最想保护的一件事写成一句话。",
            tintName: selectedMood
        )
        withAnimation(.spring(response: 0.46, dampingFraction: 0.82)) {
            generatedCard = entry
            garden.insert(entry, at: 0)
        }
    }

    private func moodColor(_ mood: String) -> Color {
        switch mood {
        case "温柔": return Color(red: 0.90, green: 0.58, blue: 0.72)
        case "迷雾": return Color(red: 0.46, green: 0.58, blue: 0.72)
        case "勇敢": return Color(red: 0.95, green: 0.64, blue: 0.30)
        default: return Color(red: 0.62, green: 0.82, blue: 0.76)
        }
    }
}

struct GardenCard: View {
    let entry: GardenEntry
    let highlighted: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label(entry.mood, systemImage: highlighted ? "sparkle.magnifyingglass" : "leaf")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(AppTheme.gold)
                Spacer()
                Text(entry.dateLabel)
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.48))
            }
            Text(entry.title)
                .font((highlighted ? Font.title2 : Font.headline).weight(.bold))
            Text(entry.insight)
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.72))
                .lineSpacing(4)
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "checkmark.seal")
                    .foregroundStyle(AppTheme.gold)
                Text(entry.action)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.78))
            }
            .padding(12)
            .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .padding(highlighted ? 20 : 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(highlighted ? AppTheme.deepPanel : AppTheme.panel, in: RoundedRectangle(cornerRadius: highlighted ? 26 : 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: highlighted ? 26 : 20, style: .continuous)
                .stroke(AppTheme.gold.opacity(highlighted ? 0.38 : 0.12), lineWidth: 1)
        )
    }
}

struct GardenEntry: Identifiable {
    let id = UUID()
    let title: String
    let mood: String
    let insight: String
    let action: String
    let tintName: String
    var dateLabel: String = "今天"

    static let seed: [GardenEntry] = [
        GardenEntry(
            title: "把注意力从噪音里收回来",
            mood: "清醒",
            insight: "你真正需要的不是更多信息，而是判断哪一个信号值得被留下。",
            action: "删除一个无关输入，保留一个真实线索。",
            tintName: "清醒",
            dateLabel: "样例"
        ),
        GardenEntry(
            title: "给还没成形的想法一点空气",
            mood: "温柔",
            insight: "模糊不是失败，它可能是想法正在组合。",
            action: "把这个想法画成三个关键词。",
            tintName: "温柔",
            dateLabel: "昨天"
        )
    ]
}

enum AppTheme {
    static let background = LinearGradient(
        colors: [
            Color(red: 0.05, green: 0.06, blue: 0.07),
            Color(red: 0.08, green: 0.12, blue: 0.13),
            Color(red: 0.16, green: 0.12, blue: 0.08)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    static let panel = Color.white.opacity(0.075)
    static let deepPanel = Color.black.opacity(0.28)
    static let gold = Color(red: 0.96, green: 0.76, blue: 0.42)
}

#Preview {
    ContentView()
}
