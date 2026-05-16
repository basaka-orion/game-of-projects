import SwiftUI

@main
struct OpenbasakaBossAppApp: App {
    @StateObject private var viewModel = WeatherBagViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(viewModel)
        }
    }
}
