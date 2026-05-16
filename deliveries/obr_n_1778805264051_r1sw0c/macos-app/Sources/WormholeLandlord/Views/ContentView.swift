import SwiftUI

struct ContentView: View {
    @ObservedObject var store: LandlordGameStore

    var body: some View {
        HStack(spacing: 0) {
            GameTableView(store: store)
                .frame(minWidth: 820)

            Divider()
                .overlay(WormholeTheme.line)

            InspectorView(store: store)
                .frame(width: 340)
        }
        .background(WormholeTheme.space)
        .toolbar {
            ToolbarItemGroup {
                Button("New Deal", systemImage: "arrow.clockwise") {
                    store.startNewRound()
                }
                Button("Hint", systemImage: "sparkle.magnifyingglass") {
                    store.selectHint()
                }
                Button("Pass", systemImage: "forward.end") {
                    store.passTurn()
                }
                .disabled(store.phase != .playing || store.currentSeat != .player)
            }
        }
    }
}
