import SwiftUI

struct InspectorView: View {
    @ObservedObject var store: LandlordGameStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                status
                rules
                log
            }
            .padding(18)
        }
        .background(WormholeTheme.inspector)
    }

    private var status: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Openbasaka Run Evidence")
                .font(.headline.weight(.black))
            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 8) {
                GridRow {
                    Text("Phase").foregroundStyle(WormholeTheme.muted)
                    Text(store.phase.rawValue.capitalized)
                }
                GridRow {
                    Text("Turn").foregroundStyle(WormholeTheme.muted)
                    Text(store.currentSeat.title)
                }
                GridRow {
                    Text("Landlord").foregroundStyle(WormholeTheme.muted)
                    Text(store.landlord?.title ?? "Pending")
                }
                GridRow {
                    Text("Selected").foregroundStyle(WormholeTheme.muted)
                    Text(store.selectedPlay?.kind.label ?? "No legal pattern")
                }
            }
            .font(.caption.weight(.semibold))
        }
        .inspectorPanel()
    }

    private var rules: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Rules Covered")
                .font(.headline.weight(.black))
            ForEach(["Single", "Pair", "Triple", "Triple + Wing", "Straight", "Pair Run", "Bomb", "Rocket"], id: \.self) { rule in
                Label(rule, systemImage: "checkmark.seal.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(WormholeTheme.ink)
            }
            Text("Illegal patterns are blocked before they can hit the table.")
                .font(.caption)
                .foregroundStyle(WormholeTheme.muted)
        }
        .inspectorPanel()
    }

    private var log: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Orbit Log")
                .font(.headline.weight(.black))
            ForEach(store.logs) { entry in
                Text(entry.text)
                    .font(.caption)
                    .foregroundStyle(WormholeTheme.ink.opacity(0.86))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(9)
                    .background(Color.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
        .inspectorPanel()
    }
}

extension View {
    func inspectorPanel() -> some View {
        self
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(WormholeTheme.line, lineWidth: 1))
    }
}
