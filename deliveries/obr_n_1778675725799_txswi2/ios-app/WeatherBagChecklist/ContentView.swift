import SwiftUI

struct ContentView: View {
    @State private var packedItemIds: Set<String> = []
    @State private var selectedScene = "通勤"

    private let sections = BagChecklistSection.defaultSections
    private var totalCount: Int { sections.reduce(0) { $0 + $1.items.count } }
    private var packedCount: Int {
        sections.reduce(0) { total, section in
            total + section.items.filter { packedItemIds.contains($0.id) }.count
        }
    }
    private var progress: Double {
        totalCount == 0 ? 0 : Double(packedCount) / Double(totalCount)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    hero
                    scenePicker
                    ForEach(sections) { section in
                        ChecklistSectionCard(
                            section: section,
                            packedItemIds: $packedItemIds
                        )
                    }
                    readyCard
                }
                .padding(20)
            }
            .background(
                LinearGradient(
                    colors: [Color(red: 0.98, green: 0.94, blue: 0.91), Color(red: 0.89, green: 0.96, blue: 0.98)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .navigationTitle("包里晴雨")
        }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("今日外出")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                    Text("晴转多云 · 26°C")
                        .font(.largeTitle.weight(.bold))
                    Text("样例天气：待接入真实定位与天气 API 后，将按当地降雨、温度、紫外线和风力自动调整包包清单。")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                ZStack {
                    Circle()
                        .fill(Color.yellow.opacity(0.25))
                    Text("☀️")
                        .font(.system(size: 42))
                }
                .frame(width: 86, height: 86)
            }

            ProgressView(value: progress)
                .tint(Color(red: 0.92, green: 0.35, blue: 0.42))
            Text("\(packedCount)/\(totalCount) 已打钩，准备到 100% 就可以全武装出门。")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .padding(20)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var scenePicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("今天的场景")
                .font(.headline)
            HStack {
                ForEach(["通勤", "约会", "旅行", "夜归"], id: \.self) { scene in
                    Button {
                        selectedScene = scene
                    } label: {
                        Text(scene)
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 9)
                            .background(selectedScene == scene ? Color.accentColor.opacity(0.18) : Color.white.opacity(0.7))
                            .foregroundStyle(selectedScene == scene ? Color.accentColor : Color.primary)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var readyCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(progress >= 1 ? "全武装出门" : "还差一点点")
                .font(.title3.weight(.bold))
            Text(progress >= 1 ? "天气、防护、补给和安全小物都确认好了。优雅出门。" : "优先确认雨伞/防晒、证件、手机电量和夜归安全物品。")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(Color.white.opacity(0.78))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

struct ChecklistSectionCard: View {
    let section: BagChecklistSection
    @Binding var packedItemIds: Set<String>

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(section.emoji)
                    .font(.title2)
                VStack(alignment: .leading, spacing: 3) {
                    Text(section.title)
                        .font(.headline)
                    Text(section.subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }

            ForEach(section.items) { item in
                Button {
                    toggle(item)
                } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: packedItemIds.contains(item.id) ? "checkmark.circle.fill" : "circle")
                            .font(.title3)
                            .foregroundStyle(packedItemIds.contains(item.id) ? Color.accentColor : Color.secondary)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(item.title)
                                .font(.subheadline.weight(.semibold))
                            Text(item.reason)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(18)
        .background(Color.white.opacity(0.82))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func toggle(_ item: BagChecklistItem) {
        if packedItemIds.contains(item.id) {
            packedItemIds.remove(item.id)
        } else {
            packedItemIds.insert(item.id)
        }
    }
}

struct BagChecklistSection: Identifiable {
    let id: String
    let emoji: String
    let title: String
    let subtitle: String
    let items: [BagChecklistItem]

    static let defaultSections: [BagChecklistSection] = [
        BagChecklistSection(
            id: "weather",
            emoji: "🌦️",
            title: "天气防护",
            subtitle: "根据当地天气优先提醒",
            items: [
                BagChecklistItem(id: "umbrella", title: "折叠伞或轻雨衣", reason: "降雨概率一高就先放进包里。"),
                BagChecklistItem(id: "sunscreen", title: "防晒霜与墨镜", reason: "紫外线强时保护皮肤和眼睛。"),
                BagChecklistItem(id: "cardigan", title: "薄外套", reason: "早晚温差或空调场景更稳。")
            ]
        ),
        BagChecklistSection(
            id: "beauty",
            emoji: "✨",
            title: "精致补给",
            subtitle: "优雅、干净、随时补状态",
            items: [
                BagChecklistItem(id: "lip", title: "润唇膏/口红", reason: "补气色，也防止干裂。"),
                BagChecklistItem(id: "powder", title: "小镜子与吸油纸", reason: "出汗或赶路后快速整理。"),
                BagChecklistItem(id: "hair", title: "发圈/小发夹", reason: "风大或运动时马上切换。")
            ]
        ),
        BagChecklistSection(
            id: "safety",
            emoji: "🛡️",
            title: "健康安全",
            subtitle: "认真严谨，不拿安全开玩笑",
            items: [
                BagChecklistItem(id: "power", title: "充电宝与数据线", reason: "夜归、打车、导航都靠它。"),
                BagChecklistItem(id: "medicine", title: "常用药/创可贴", reason: "头痛、过敏或磨脚时不慌。"),
                BagChecklistItem(id: "alarm", title: "紧急联系人快捷入口", reason: "不是放进包里，但必须出门前确认。")
            ]
        ),
        BagChecklistSection(
            id: "commute",
            emoji: "👜",
            title: "包包底仓",
            subtitle: "每天都该稳定存在的小物",
            items: [
                BagChecklistItem(id: "id", title: "证件/门禁/银行卡", reason: "少一样就可能影响行程。"),
                BagChecklistItem(id: "tissue", title: "纸巾与湿巾", reason: "餐厅、雨天、补妆都用得上。"),
                BagChecklistItem(id: "keys", title: "钥匙与耳机", reason: "回家和通勤体验的基本盘。")
            ]
        )
    ]
}

struct BagChecklistItem: Identifiable, Hashable {
    let id: String
    let title: String
    let reason: String
}

#Preview {
    ContentView()
}
