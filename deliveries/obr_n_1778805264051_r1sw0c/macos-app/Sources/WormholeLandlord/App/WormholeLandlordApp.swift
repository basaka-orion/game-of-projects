import AppKit
import SwiftUI

@main
struct WormholeLandlordApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var store = LandlordGameStore()

    var body: some Scene {
        WindowGroup("Wormhole Landlord") {
            ContentView(store: store)
                .frame(minWidth: 1180, minHeight: 760)
        }
        .commands {
            CommandMenu("Wormhole Landlord") {
                Button("New Deal") {
                    store.startNewRound()
                }
                .keyboardShortcut("n")

                Button("Hint") {
                    store.selectHint()
                }
                .keyboardShortcut("h")

                Button("Pass") {
                    store.passTurn()
                }
                .keyboardShortcut(.space, modifiers: [])
            }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }
}
