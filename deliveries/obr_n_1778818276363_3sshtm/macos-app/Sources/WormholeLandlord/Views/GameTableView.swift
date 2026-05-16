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
            Text("Desert Claim")
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
            Text("Sandstorm Landlord")
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
                        Text("\(last.seat.shortTitle) played \(last.play.kind.label)")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(WormholeTheme.muted)
                        HStack(spacing: -4) {
                            ForEach(last.play.cards) { card in
                                CardView(card: card, isSelected: false, isCompact: true)
                                    .frame(width: 50, height: 70)
                            }
                        }
                    } else {
                        Text(store.phase == .bidding ? "Claim the desert seat to take the hidden cards." : "Lead this storm line with any legal pattern.")
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
                Button("Claim Desert Seat", systemImage: "crown.fill") {
                    store.callLandlord()
                }
                .buttonStyle(PrimarySpaceButton())

                Button("Hold Position", systemImage: "moon.zzz") {
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
        Canvas { context, size in
            let rect = CGRect(origin: .zero, size: size)
            context.fill(Path(rect), with: .linearGradient(
                Gradient(colors: [
                    Color(red: 0.07, green: 0.045, blue: 0.055),
                    Color(red: 0.30, green: 0.18, blue: 0.08),
                    Color(red: 0.82, green: 0.55, blue: 0.22)
                ]),
                startPoint: .zero,
                endPoint: CGPoint(x: size.width, y: size.height)
            ))

            var sun = Path(ellipseIn: CGRect(x: size.width * 0.68, y: size.height * 0.08, width: 120, height: 120))
            context.fill(sun, with: .color(WormholeTheme.gold.opacity(0.30)))

            for index in 0..<8 {
                let y = size.height * (0.36 + CGFloat(index) * 0.075)
                var dune = Path()
                dune.move(to: CGPoint(x: -80, y: y))
                dune.addCurve(
                    to: CGPoint(x: size.width + 80, y: y + CGFloat(index % 2 == 0 ? 44 : -34)),
                    control1: CGPoint(x: size.width * 0.28, y: y - 70),
                    control2: CGPoint(x: size.width * 0.68, y: y + 90)
                )
                dune.addLine(to: CGPoint(x: size.width + 80, y: size.height + 80))
                dune.addLine(to: CGPoint(x: -80, y: size.height + 80))
                dune.closeSubpath()
                context.fill(dune, with: .color((index.isMultiple(of: 2) ? WormholeTheme.sand : WormholeTheme.spice).opacity(0.08 + Double(index) * 0.012)))
            }

            for index in 0..<14 {
                var line = Path()
                let y = CGFloat(index) * size.height / 14 + 26
                line.move(to: CGPoint(x: size.width * 0.05, y: y))
                line.addLine(to: CGPoint(x: size.width * 0.95, y: y + CGFloat(index % 3 - 1) * 34))
                context.stroke(line, with: .color(WormholeTheme.cyan.opacity(0.035)), lineWidth: 1)
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
