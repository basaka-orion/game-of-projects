import SwiftUI

struct GameTableView: View {
    @ObservedObject var store: LandlordGameStore

    var body: some View {
        ZStack {
            WormholeBackdrop()

            VStack(spacing: 18) {
                topRow
                centerTable
                playerHand
                actionBar
            }
            .padding(24)
        }
    }

    private var topRow: some View {
        HStack(spacing: 16) {
            OpponentPanel(seat: .left, count: store.hands[.left, default: []].count, isLandlord: store.landlord == .left, isCurrent: store.currentSeat == .left)
            Spacer()
            landlordCards
            Spacer()
            OpponentPanel(seat: .right, count: store.hands[.right, default: []].count, isLandlord: store.landlord == .right, isCurrent: store.currentSeat == .right)
        }
    }

    private var landlordCards: some View {
        VStack(spacing: 8) {
            Text("Landlord Signal")
                .font(.caption.weight(.bold))
                .foregroundStyle(WormholeTheme.muted)
            HStack(spacing: -8) {
                ForEach(store.landlordCards) { card in
                    CardView(card: card, isSelected: false, isCompact: true)
                        .frame(width: 46, height: 64)
                }
            }
        }
        .padding(14)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var centerTable: some View {
        VStack(spacing: 16) {
            Text("Wormhole Landlord")
                .font(.system(size: 42, weight: .black, design: .rounded))
                .foregroundStyle(WormholeTheme.ink)
                .minimumScaleFactor(0.72)
            Text(store.phaseTitle)
                .font(.headline.weight(.semibold))
                .foregroundStyle(WormholeTheme.cyan)

            ZStack {
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .fill(WormholeTheme.table)
                    .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(WormholeTheme.line, lineWidth: 1))

                VStack(spacing: 12) {
                    if let last = store.lastPlay {
                        Text("\(last.seat.shortTitle) emitted \(last.play.kind.label)")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(WormholeTheme.muted)
                        HStack(spacing: -4) {
                            ForEach(last.play.cards) { card in
                                CardView(card: card, isSelected: false, isCompact: true)
                                    .frame(width: 50, height: 70)
                            }
                        }
                    } else {
                        Text(store.phase == .bidding ? "Call landlord to open the first orbit." : "Lead this orbit with any legal pattern.")
                            .font(.title3.weight(.bold))
                            .foregroundStyle(WormholeTheme.muted)
                    }
                }
                .padding()
            }
            .frame(height: 220)
        }
    }

    private var playerHand: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label(store.landlord == .player ? "Boss Landlord" : "Boss Hand", systemImage: store.landlord == .player ? "crown.fill" : "person.fill")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(WormholeTheme.ink)
                Spacer()
                Text("\(store.humanHand.count) cards")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(WormholeTheme.muted)
            }

            ScrollView(.horizontal) {
                HStack(spacing: -18) {
                    ForEach(store.humanHand) { card in
                        CardView(card: card, isSelected: store.selectedCards.contains(card), isCompact: false)
                            .frame(width: 74, height: 104)
                            .offset(y: store.selectedCards.contains(card) ? -18 : 0)
                            .onTapGesture { store.toggle(card) }
                    }
                }
                .padding(.top, 22)
                .padding(.horizontal, 12)
                .padding(.bottom, 6)
            }
            .scrollIndicators(.hidden)
        }
    }

    private var actionBar: some View {
        HStack(spacing: 12) {
            if store.phase == .bidding {
                Button("Call Landlord", systemImage: "antenna.radiowaves.left.and.right") {
                    store.callLandlord()
                }
                .buttonStyle(PrimarySpaceButton())

                Button("Do Not Call", systemImage: "moon.zzz") {
                    store.passBidding()
                }
                .buttonStyle(SecondarySpaceButton())
            } else if store.phase == .finished {
                Button("New Deal", systemImage: "arrow.clockwise") {
                    store.startNewRound()
                }
                .buttonStyle(PrimarySpaceButton())
            } else {
                Button("Play Selected", systemImage: "paperplane.fill") {
                    store.playSelected()
                }
                .buttonStyle(PrimarySpaceButton())
                .disabled(!store.selectedPlayIsLegal)

                Button("Hint", systemImage: "sparkle.magnifyingglass") {
                    store.selectHint()
                }
                .buttonStyle(SecondarySpaceButton())

                Button("Pass", systemImage: "forward.end.fill") {
                    store.passTurn()
                }
                .buttonStyle(SecondarySpaceButton())
            }
        }
    }
}

struct OpponentPanel: View {
    let seat: Seat
    let count: Int
    let isLandlord: Bool
    let isCurrent: Bool

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(isCurrent ? WormholeTheme.cyan.opacity(0.24) : WormholeTheme.panel)
                Image(systemName: isLandlord ? "crown.fill" : "cpu")
                    .foregroundStyle(isLandlord ? WormholeTheme.gold : WormholeTheme.cyan)
            }
            .frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: 3) {
                Text(seat.title)
                    .font(.headline)
                    .foregroundStyle(WormholeTheme.ink)
                Text("\(count) cards")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(WormholeTheme.muted)
            }
        }
        .padding(14)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(isCurrent ? WormholeTheme.cyan : WormholeTheme.line, lineWidth: 1))
    }
}

struct CardView: View {
    let card: PlayingCard
    let isSelected: Bool
    let isCompact: Bool

    var body: some View {
        VStack(alignment: .leading) {
            Text(card.rank.label)
                .font(.system(size: isCompact ? 14 : 18, weight: .black, design: .rounded))
            Spacer()
            Text(card.suit.symbol)
                .font(.system(size: isCompact ? 20 : 28, weight: .bold))
            Spacer()
            Text(card.rank.label)
                .font(.system(size: isCompact ? 11 : 14, weight: .bold, design: .rounded))
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .foregroundStyle(card.suit.color)
        .padding(isCompact ? 8 : 10)
        .background(
            LinearGradient(colors: [Color.white, Color(red: 0.78, green: 0.84, blue: 0.94)], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: isCompact ? 9 : 13, style: .continuous)
        )
        .overlay(RoundedRectangle(cornerRadius: isCompact ? 9 : 13).stroke(isSelected ? WormholeTheme.gold : Color.black.opacity(0.12), lineWidth: isSelected ? 3 : 1))
        .shadow(color: Color.black.opacity(0.30), radius: isSelected ? 14 : 8, x: 0, y: 8)
    }
}

struct WormholeBackdrop: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(red: 0.015, green: 0.020, blue: 0.035), Color(red: 0.035, green: 0.045, blue: 0.075)], startPoint: .topLeading, endPoint: .bottomTrailing)
            ForEach(0..<10, id: \.self) { index in
                RoundedRectangle(cornerRadius: 2)
                    .fill(index.isMultiple(of: 2) ? WormholeTheme.cyan.opacity(0.08) : WormholeTheme.gold.opacity(0.06))
                    .frame(height: 2)
                    .rotationEffect(.degrees(Double(index) * 11 - 36))
                    .offset(y: CGFloat(index * 44 - 220))
            }
        }
        .ignoresSafeArea()
    }
}

struct PrimarySpaceButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline.weight(.black))
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .foregroundStyle(Color.black)
            .background(LinearGradient(colors: [WormholeTheme.gold, WormholeTheme.cyan], startPoint: .leading, endPoint: .trailing), in: Capsule())
            .opacity(configuration.isPressed ? 0.72 : 1)
    }
}

struct SecondarySpaceButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline.weight(.semibold))
            .padding(.horizontal, 18)
            .padding(.vertical, 11)
            .foregroundStyle(WormholeTheme.ink)
            .background(WormholeTheme.panel, in: Capsule())
            .overlay(Capsule().stroke(WormholeTheme.line, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.72 : 1)
    }
}
