import SwiftUI

@main
struct WeatherBagCompanionApp: App {
    @StateObject private var viewModel = WeatherBagViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(viewModel)
        }
    }
}
