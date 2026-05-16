import Foundation
import SwiftUI

struct CityPreset: Identifiable, Hashable {
    let id: String
    let name: String
    let country: String
    let latitude: Double
    let longitude: Double

    static let presets = [
        CityPreset(id: "shanghai", name: "上海", country: "中国", latitude: 31.2304, longitude: 121.4737),
        CityPreset(id: "beijing", name: "北京", country: "中国", latitude: 39.9042, longitude: 116.4074),
        CityPreset(id: "hangzhou", name: "杭州", country: "中国", latitude: 30.2741, longitude: 120.1551),
        CityPreset(id: "shenzhen", name: "深圳", country: "中国", latitude: 22.5431, longitude: 114.0579),
        CityPreset(id: "chengdu", name: "成都", country: "中国", latitude: 30.5728, longitude: 104.0668),
        CityPreset(id: "tokyo", name: "东京", country: "日本", latitude: 35.6762, longitude: 139.6503),
        CityPreset(id: "paris", name: "巴黎", country: "法国", latitude: 48.8566, longitude: 2.3522),
        CityPreset(id: "new-york", name: "纽约", country: "美国", latitude: 40.7128, longitude: -74.0060)
    ]

    static let fallback = presets[0]
}

enum WeatherMood {
    case sunny
    case cloudy
    case rain
    case storm
    case fog
    case snow

    var title: String {
        switch self {
        case .sunny: "晴朗"
        case .cloudy: "多云"
        case .rain: "雨天"
        case .storm: "雷雨"
        case .fog: "雾气"
        case .snow: "雪天"
        }
    }

    var symbol: String {
        switch self {
        case .sunny: "sun.max.fill"
        case .cloudy: "cloud.sun.fill"
        case .rain: "cloud.rain.fill"
        case .storm: "cloud.bolt.rain.fill"
        case .fog: "cloud.fog.fill"
        case .snow: "snowflake"
        }
    }

    var tint: Color {
        switch self {
        case .sunny: Color(red: 0.92, green: 0.56, blue: 0.18)
        case .cloudy: Color(red: 0.44, green: 0.55, blue: 0.66)
        case .rain: Color(red: 0.18, green: 0.43, blue: 0.72)
        case .storm: Color(red: 0.35, green: 0.32, blue: 0.57)
        case .fog: Color(red: 0.55, green: 0.60, blue: 0.64)
        case .snow: Color(red: 0.30, green: 0.58, blue: 0.78)
        }
    }
}

struct WeatherSnapshot: Equatable {
    let cityName: String
    let temperature: Double
    let apparentTemperature: Double
    let humidity: Int
    let precipitation: Double
    let weatherCode: Int
    let cloudCover: Int
    let windSpeed: Double
    let isDay: Bool
    let sourceDescription: String

    var mood: WeatherMood {
        switch weatherCode {
        case 95...99: return .storm
        case 71...86: return .snow
        case 51...67, 80...82: return .rain
        case 45...48: return .fog
        case 2...3: return .cloudy
        default:
            if precipitation >= 0.2 { return .rain }
            if cloudCover >= 70 { return .cloudy }
            return .sunny
        }
    }

    var headline: String {
        let rain = precipitation >= 0.2 ? "有降水" : "无明显降水"
        let wind = windSpeed >= 24 ? "风偏大" : "风力温和"
        return "\(mood.title) · 体感 \(Int(apparentTemperature.rounded()))° · \(rain) · \(wind)"
    }

    static let fallback = WeatherSnapshot(
        cityName: "上海",
        temperature: 23,
        apparentTemperature: 24,
        humidity: 68,
        precipitation: 0,
        weatherCode: 2,
        cloudCover: 48,
        windSpeed: 12,
        isDay: true,
        sourceDescription: "离线示例，点刷新读取真实天气"
    )
}

struct OpenMeteoResponse: Decodable {
    let current: Current

    struct Current: Decodable {
        let time: String
        let temperature: Double
        let apparentTemperature: Double
        let humidity: Int
        let precipitation: Double
        let weatherCode: Int
        let cloudCover: Int
        let windSpeed: Double
        let isDay: Int

        enum CodingKeys: String, CodingKey {
            case time
            case temperature = "temperature_2m"
            case apparentTemperature = "apparent_temperature"
            case humidity = "relative_humidity_2m"
            case precipitation
            case weatherCode = "weather_code"
            case cloudCover = "cloud_cover"
            case windSpeed = "wind_speed_10m"
            case isDay = "is_day"
        }
    }
}

struct BagItem: Identifiable, Hashable {
    let id: String
    let title: String
    let detail: String
    let reason: String
    let priority: Priority

    enum Priority: String {
        case essential = "必带"
        case weather = "天气"
        case thoughtful = "贴心"
        case elegant = "优雅"

        var color: Color {
            switch self {
            case .essential: Color(red: 0.78, green: 0.25, blue: 0.32)
            case .weather: Color(red: 0.18, green: 0.44, blue: 0.70)
            case .thoughtful: Color(red: 0.30, green: 0.53, blue: 0.36)
            case .elegant: Color(red: 0.63, green: 0.38, blue: 0.63)
            }
        }
    }
}

struct BagSection: Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let symbol: String
    let items: [BagItem]
}

enum PackingEngine {
    static func sections(for weather: WeatherSnapshot) -> [BagSection] {
        [
            BagSection(id: "core", title: "包包核心", subtitle: "无论天气怎样，先把底线装备放进去。", symbol: "handbag.fill", items: coreItems),
            BagSection(id: "weather", title: "天气防护", subtitle: weather.headline, symbol: weather.mood.symbol, items: weatherItems(for: weather)),
            BagSection(id: "safety", title: "安全与健康", subtitle: "认真不是紧张，是给自己留余地。", symbol: "cross.case.fill", items: safetyItems(for: weather)),
            BagSection(id: "commute", title: "电子与通勤", subtitle: "出门越久，电量、证件、路线越要稳。", symbol: "iphone.gen3", items: commuteItems),
            BagSection(id: "elegance", title: "优雅加分", subtitle: "让临时状况不破坏今天的漂亮。", symbol: "sparkles", items: eleganceItems(for: weather))
        ]
    }

    private static let coreItems = [
        BagItem(id: "core-phone", title: "手机与备用支付方式", detail: "手机、电量、现金或备用卡", reason: "移动支付很方便，但备用支付能处理没电、断网、店铺不支持等情况。", priority: .essential),
        BagItem(id: "core-keys", title: "钥匙 / 门禁 / 身份证件", detail: "放进固定小隔层", reason: "固定位置能减少翻包和遗失风险。", priority: .essential),
        BagItem(id: "core-tissue", title: "纸巾与湿巾", detail: "各一小包", reason: "餐厅、洗手间、出汗、补妆都会用到。", priority: .thoughtful),
        BagItem(id: "core-lip", title: "润唇膏或小支护手霜", detail: "小体积高频使用", reason: "风、空调和日晒都会让皮肤状态快速下滑。", priority: .elegant)
    ]

    private static func weatherItems(for weather: WeatherSnapshot) -> [BagItem] {
        var items: [BagItem] = []

        if weather.precipitation >= 0.2 || weather.mood == .rain || weather.mood == .storm {
            items.append(BagItem(id: "weather-umbrella", title: "轻量伞", detail: "优先选择抗风款", reason: "当前有降水信号，伞比临时买雨具更可靠。", priority: .weather))
            items.append(BagItem(id: "weather-waterproof-pouch", title: "防水小袋", detail: "放证件、耳机、粉饼", reason: "雨天最容易受损的是小电子和纸质证件。", priority: .weather))
        } else if weather.cloudCover <= 45 && weather.isDay {
            items.append(BagItem(id: "weather-sunshade", title: "遮阳伞或墨镜", detail: "晴天轻防晒组合", reason: "云量低且是白天，眼睛和面部更容易暴露在强光下。", priority: .weather))
        }

        if weather.temperature >= 27 || weather.apparentTemperature >= 29 {
            items.append(BagItem(id: "weather-sunscreen", title: "小支防晒 / 防晒棒", detail: "补涂用，不占包", reason: "高温出汗会削弱防晒和妆面稳定性。", priority: .weather))
            items.append(BagItem(id: "weather-blotting", title: "吸油纸或定妆小样", detail: "两三片就够", reason: "高温下比厚重补妆更轻巧。", priority: .elegant))
        }

        if weather.temperature <= 10 || weather.apparentTemperature <= 8 {
            items.append(BagItem(id: "weather-warm-pack", title: "暖宝宝或薄手套", detail: "怕冷体质优先", reason: "体感温度偏低，手部保暖能明显提升舒适度。", priority: .weather))
        } else if weather.temperature <= 18 || weather.windSpeed >= 24 {
            items.append(BagItem(id: "weather-cardigan", title: "薄外套 / 披肩", detail: "抗风和空调两用", reason: "温差或风速会让体感比温度数字更冷。", priority: .weather))
        }

        if weather.mood == .fog || weather.humidity >= 85 {
            items.append(BagItem(id: "weather-hair", title: "发圈与小梳子", detail: "防雾气和湿度炸毛", reason: "湿度高时头发和刘海更容易失控。", priority: .elegant))
        }

        return items.isEmpty ? [
            BagItem(id: "weather-light", title: "轻量天气备份", detail: "晴雨两用伞或薄披肩二选一", reason: "当前天气温和，保留一个轻量备份即可。", priority: .weather)
        ] : items
    }

    private static func safetyItems(for weather: WeatherSnapshot) -> [BagItem] {
        var items = [
            BagItem(id: "safety-pad", title: "卫生巾 / 护垫 / 止痛片", detail: "按个人周期准备", reason: "女性出门最值得提前准备的不是很多，而是刚好救急。", priority: .essential),
            BagItem(id: "safety-bandage", title: "创可贴与酒精棉片", detail: "处理磨脚、划伤", reason: "新鞋、长走、通勤拥挤都可能需要。", priority: .thoughtful),
            BagItem(id: "safety-alarm", title: "个人报警器或求助哨", detail: "按当地法规与场景选择", reason: "夜间、陌生区域、独行时，快速求助比硬扛更重要。", priority: .essential)
        ]

        if weather.temperature >= 30 {
            items.append(BagItem(id: "safety-electrolyte", title: "电解质小包", detail: "或一小瓶水", reason: "高温天气更容易脱水，尤其是长时间步行和排队。", priority: .weather))
        }
        return items
    }

    private static let commuteItems = [
        BagItem(id: "commute-power", title: "迷你充电宝与短线", detail: "线头确认匹配手机", reason: "导航、打车、联系朋友都依赖电量。", priority: .essential),
        BagItem(id: "commute-earbuds", title: "耳机", detail: "通勤、电话、降噪", reason: "让路上时间更可控，也方便接电话。", priority: .thoughtful),
        BagItem(id: "commute-route", title: "目的地截图 / 离线地图", detail: "地铁口、楼层、联系人", reason: "网络差或赶时间时，截图比临时搜索更稳。", priority: .essential)
    ]

    private static func eleganceItems(for weather: WeatherSnapshot) -> [BagItem] {
        var items = [
            BagItem(id: "elegance-mini-perfume", title: "小香 / 口气清新", detail: "小样、薄荷糖、漱口片", reason: "见人、约会、会议前都能快速提升状态。", priority: .elegant),
            BagItem(id: "elegance-makeup", title: "补妆三件套", detail: "粉饼、口红、镜子", reason: "不需要全套化妆包，只带最能恢复气色的东西。", priority: .elegant)
        ]

        if weather.mood == .rain || weather.humidity >= 80 {
            items.append(BagItem(id: "elegance-shoe-wipes", title: "鞋面湿巾", detail: "雨天保持干净", reason: "雨水和泥点会最先暴露在鞋面。", priority: .elegant))
        }
        return items
    }
}

final class WeatherService {
    func fetch(latitude: Double, longitude: Double, label: String) async throws -> WeatherSnapshot {
        var components = URLComponents(string: "https://api.open-meteo.com/v1/forecast")
        components?.queryItems = [
            URLQueryItem(name: "latitude", value: String(latitude)),
            URLQueryItem(name: "longitude", value: String(longitude)),
            URLQueryItem(name: "current", value: "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,is_day"),
            URLQueryItem(name: "timezone", value: "auto"),
            URLQueryItem(name: "forecast_days", value: "1")
        ]

        guard let url = components?.url else {
            throw URLError(.badURL)
        }

        let (data, _) = try await URLSession.shared.data(from: url)
        let response = try JSONDecoder().decode(OpenMeteoResponse.self, from: data)
        let current = response.current

        return WeatherSnapshot(
            cityName: label,
            temperature: current.temperature,
            apparentTemperature: current.apparentTemperature,
            humidity: current.humidity,
            precipitation: current.precipitation,
            weatherCode: current.weatherCode,
            cloudCover: current.cloudCover,
            windSpeed: current.windSpeed,
            isDay: current.isDay == 1,
            sourceDescription: "Open-Meteo 实时天气 · \(current.time)"
        )
    }
}

@MainActor
final class WeatherBagViewModel: ObservableObject {
    @Published var selectedCity = CityPreset.fallback
    @Published var weather = WeatherSnapshot.fallback
    @Published var sections = PackingEngine.sections(for: WeatherSnapshot.fallback)
    @Published var checkedItemIDs: Set<String> = []
    @Published var isLoading = false
    @Published var notice = "选择城市后，按当地真实天气生成今天的包包清单。"

    private let weatherService = WeatherService()
    private let checkedKey = "OpenbasakaBossApp.checkedItemIDs"

    init() {
        loadCheckedItems()
        Task { await refreshSelectedCity() }
    }

    var allItems: [BagItem] {
        sections.flatMap(\.items)
    }

    var completedCount: Int {
        allItems.filter { checkedItemIDs.contains($0.id) }.count
    }

    var progress: Double {
        guard !allItems.isEmpty else { return 0 }
        return Double(completedCount) / Double(allItems.count)
    }

    var isFullyArmed: Bool {
        !allItems.isEmpty && completedCount == allItems.count
    }

    func choose(city: CityPreset) {
        selectedCity = city
        Task { await refreshSelectedCity() }
    }

    func refreshSelectedCity() async {
        isLoading = true
        defer { isLoading = false }

        do {
            weather = try await weatherService.fetch(latitude: selectedCity.latitude, longitude: selectedCity.longitude, label: selectedCity.name)
            sections = PackingEngine.sections(for: weather)
            checkedItemIDs = checkedItemIDs.intersection(Set(allItems.map(\.id)))
            persistCheckedItems()
            notice = "已按 \(selectedCity.name) 当前天气更新清单。"
        } catch {
            weather = .fallback
            sections = PackingEngine.sections(for: weather)
            notice = "天气读取失败，先显示离线清单：\(error.localizedDescription)"
        }
    }

    func toggle(_ item: BagItem) {
        if checkedItemIDs.contains(item.id) {
            checkedItemIDs.remove(item.id)
        } else {
            checkedItemIDs.insert(item.id)
        }
        persistCheckedItems()
    }

    func resetChecklist() {
        checkedItemIDs = []
        persistCheckedItems()
        notice = "已清空打钩状态，重新检查包包。"
    }

    private func loadCheckedItems() {
        guard
            let data = UserDefaults.standard.data(forKey: checkedKey),
            let values = try? JSONDecoder().decode([String].self, from: data)
        else { return }
        checkedItemIDs = Set(values)
    }

    private func persistCheckedItems() {
        guard let data = try? JSONEncoder().encode(Array(checkedItemIDs)) else { return }
        UserDefaults.standard.set(data, forKey: checkedKey)
    }
}
