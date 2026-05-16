import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var model: WeatherBagViewModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    hero
                    cityStrip
                    progressPanel
                    ForEach(model.sections) { section in
                        BagSectionView(section: section)
                    }
                    finishPanel
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 14)
            }
            .background(BackgroundWash(mood: model.weather.mood))
            .navigationTitle("包包晴雨签")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await model.refreshSelectedCity() }
                    } label: {
                        if model.isLoading {
                            ProgressView()
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                    .accessibilityLabel("刷新天气")
                }
            }
        }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 14) {
                CartoonCompanion(mood: model.weather.mood)
                    .frame(width: 86, height: 86)

                VStack(alignment: .leading, spacing: 8) {
                    Text("今天出门，包包替你严谨一点。")
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .fixedSize(horizontal: false, vertical: true)

                    Text(model.weather.headline)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            HStack(spacing: 12) {
                WeatherMetric(title: "城市", value: model.weather.cityName, symbol: "location.fill")
                WeatherMetric(title: "温度", value: "\(Int(model.weather.temperature.rounded()))°", symbol: "thermometer.medium")
                WeatherMetric(title: "湿度", value: "\(model.weather.humidity)%", symbol: "humidity.fill")
            }

            Text(model.notice)
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding(18)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(.white.opacity(0.58), lineWidth: 1)
        )
    }

    private var cityStrip: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("当地天气", systemImage: "cloud.sun.fill")
                    .font(.headline)
                Spacer()
                Button {
                    Task { await model.refreshSelectedCity() }
                } label: {
                    Label("刷新", systemImage: "arrow.clockwise")
                        .font(.caption.weight(.semibold))
                }
                .buttonStyle(.borderedProminent)
                .tint(model.weather.mood.tint)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(CityPreset.presets) { city in
                        Button {
                            model.choose(city: city)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(city.name)
                                    .font(.subheadline.weight(.semibold))
                                Text(city.country)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .frame(width: 76, alignment: .leading)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .fill(city.id == model.selectedCity.id ? model.weather.mood.tint.opacity(0.18) : Color(.systemBackground).opacity(0.72))
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .stroke(city.id == model.selectedCity.id ? model.weather.mood.tint.opacity(0.55) : .clear, lineWidth: 1)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(16)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var progressPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("全武装进度")
                        .font(.headline)
                    Text("\(model.completedCount) / \(model.allItems.count) 已打钩")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("重置") {
                    model.resetChecklist()
                }
                .font(.caption.weight(.semibold))
                .buttonStyle(.bordered)
            }

            ProgressView(value: model.progress)
                .tint(model.weather.mood.tint)
                .scaleEffect(x: 1, y: 1.3, anchor: .center)
        }
        .padding(16)
        .background(Color(.systemBackground).opacity(0.86), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var finishPanel: some View {
        VStack(spacing: 10) {
            Image(systemName: model.isFullyArmed ? "checkmark.seal.fill" : "handbag")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(model.isFullyArmed ? .green : model.weather.mood.tint)

            Text(model.isFullyArmed ? "可以优雅出门了" : "再检查一遍，别急着出门")
                .font(.title3.weight(.bold))

            Text(model.isFullyArmed ? "今天的天气、通勤和小意外都已经被认真照顾到。" : "打钩不是仪式，是把临时状况提前变小。")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(22)
        .background(Color(.systemBackground).opacity(0.86), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

struct BagSectionView: View {
    @EnvironmentObject private var model: WeatherBagViewModel
    let section: BagSection

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image(systemName: section.symbol)
                    .foregroundStyle(model.weather.mood.tint)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 3) {
                    Text(section.title)
                        .font(.headline)
                    Text(section.subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            ForEach(section.items) { item in
                BagItemRow(item: item, checked: model.checkedItemIDs.contains(item.id)) {
                    model.toggle(item)
                }
            }
        }
        .padding(16)
        .background(Color(.systemBackground).opacity(0.9), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

struct BagItemRow: View {
    let item: BagItem
    let checked: Bool
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: checked ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(checked ? .green : .secondary)
                    .padding(.top, 2)

                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(item.title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                            .strikethrough(checked, color: .secondary)
                        Spacer(minLength: 8)
                        Text(item.priority.rawValue)
                            .font(.caption2.weight(.bold))
                            .padding(.horizontal, 7)
                            .padding(.vertical, 4)
                            .background(item.priority.color.opacity(0.14), in: Capsule())
                            .foregroundStyle(item.priority.color)
                    }

                    Text(item.detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Text(item.reason)
                        .font(.footnote)
                        .foregroundStyle(.primary.opacity(0.72))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(12)
            .background(checked ? Color.green.opacity(0.08) : Color(.secondarySystemGroupedBackground).opacity(0.72), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

struct WeatherMetric: View {
    let title: String
    let value: String
    let symbol: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Label(title, systemImage: symbol)
                .font(.caption2.weight(.bold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color(.systemBackground).opacity(0.72), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

struct CartoonCompanion: View {
    let mood: WeatherMood

    var body: some View {
        ZStack {
            Circle()
                .fill(mood.tint.opacity(0.20))
            Circle()
                .fill(Color(.systemBackground).opacity(0.92))
                .frame(width: 62, height: 62)
            Image(systemName: mood.symbol)
                .font(.system(size: 30, weight: .bold))
                .foregroundStyle(mood.tint)
                .offset(y: -6)
            Image(systemName: "handbag.fill")
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(Color(red: 0.82, green: 0.36, blue: 0.49))
                .offset(x: 18, y: 22)
        }
        .shadow(color: mood.tint.opacity(0.22), radius: 18, x: 0, y: 10)
    }
}

struct BackgroundWash: View {
    let mood: WeatherMood

    var body: some View {
        LinearGradient(
            colors: [
                mood.tint.opacity(0.20),
                Color(red: 0.98, green: 0.94, blue: 0.92),
                Color(red: 0.93, green: 0.97, blue: 0.98)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }
}
