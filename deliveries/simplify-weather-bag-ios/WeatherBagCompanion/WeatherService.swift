import CoreLocation
import Foundation

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

enum WeatherServiceError: LocalizedError {
    case invalidURL
    case noLocation

    var errorDescription: String? {
        switch self {
        case .invalidURL: "天气请求地址生成失败。"
        case .noLocation: "暂时没有拿到当前位置。"
        }
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
            throw WeatherServiceError.invalidURL
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
            updatedAt: Date(),
            sourceDescription: "Open-Meteo 实时天气 · \(current.time)"
        )
    }
}

@MainActor
final class WeatherBagViewModel: NSObject, ObservableObject {
    @Published var selectedCity: CityPreset = CityPreset.defaultCity
    @Published var weather: WeatherSnapshot = .fallback
    @Published var sections: [BagSection] = PackingEngine.sections(for: .fallback)
    @Published var checkedItemIDs: Set<String> = []
    @Published var isLoading = false
    @Published var notice = "选择城市或定位后，生成今天的包包清单。"

    private let weatherService = WeatherService()
    private let locationManager = CLLocationManager()
    private let checkedKey = "WeatherBagCompanion.checkedItemIDs"

    override init() {
        super.init()
        locationManager.delegate = self
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
        await loadWeather(latitude: selectedCity.latitude, longitude: selectedCity.longitude, label: selectedCity.name)
    }

    func requestCurrentLocation() {
        notice = "正在请求定位权限，用当前位置读取真实天气。"

        switch locationManager.authorizationStatus {
        case .notDetermined:
            locationManager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            locationManager.requestLocation()
        case .denied, .restricted:
            notice = "定位未开启。你仍然可以选择城市读取当地真实天气。"
        @unknown default:
            notice = "定位状态未知，先用城市天气。"
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

    private func loadWeather(latitude: Double, longitude: Double, label: String) async {
        isLoading = true
        defer { isLoading = false }

        do {
            weather = try await weatherService.fetch(latitude: latitude, longitude: longitude, label: label)
            sections = PackingEngine.sections(for: weather)
            checkedItemIDs = checkedItemIDs.intersection(Set(allItems.map(\.id)))
            persistCheckedItems()
            notice = "已按 \(label) 当前天气更新清单。"
        } catch {
            weather = WeatherSnapshot.fallback
            sections = PackingEngine.sections(for: weather)
            notice = "天气读取失败，先显示离线清单：\(error.localizedDescription)"
        }
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

extension WeatherBagViewModel: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            if manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorizedWhenInUse {
                manager.requestLocation()
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let coordinate = locations.last?.coordinate else { return }
        Task { @MainActor [weak self] in
            await self?.loadWeather(latitude: coordinate.latitude, longitude: coordinate.longitude, label: "当前位置")
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor [weak self] in
            self?.notice = "定位失败，先选择城市天气：\(error.localizedDescription)"
        }
    }
}
