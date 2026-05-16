import Foundation
import SwiftUI

@MainActor
final class LandlordGameStore: ObservableObject {
    @Published private(set) var hands: [Seat: [PlayingCard]] = [:]
    @Published private(set) var landlordCards: [PlayingCard] = []
    @Published private(set) var phase: RoundPhase = .bidding
    @Published private(set) var landlord: Seat?
    @Published private(set) var currentSeat: Seat = .player
    @Published private(set) var lastPlay: TablePlay?
    @Published private(set) var logs: [LogEntry] = []
    @Published private(set) var winner: Seat?
    @Published var selectedCards: Set<PlayingCard> = []

    private var passCount = 0
    private var seed: UInt64 = 177869

    init() {
        LandlordRuleSelfTests.runSmoke()
        startNewRound()
    }

    var humanHand: [PlayingCard] {
        hands[.player, default: []].sorted()
    }

    var selectedPlay: Play? {
        LandlordRuleEngine.classify(Array(selectedCards))
    }

    var selectedPlayIsLegal: Bool {
        guard phase == .playing, currentSeat == .player, let selectedPlay else { return false }
        return LandlordRuleEngine.canBeat(selectedPlay, previous: activePreviousPlay)
    }

    var activePreviousPlay: Play? {
        guard let lastPlay, lastPlay.seat != currentSeat else { return nil }
        return lastPlay.play
    }

    var phaseTitle: String {
        switch phase {
        case .bidding: return "Bidding for the wormhole"
        case .playing: return "\(currentSeat.shortTitle)'s turn"
        case .finished: return winner.map { "\($0.shortTitle) wins" } ?? "Round complete"
        }
    }

    func startNewRound() {
        seed = UInt64(Date().timeIntervalSince1970) ^ seed &+ 31
        let deal = LandlordRuleEngine.deal(seed: seed)
        hands = deal.0
        landlordCards = deal.1
        phase = .bidding
        landlord = nil
        currentSeat = .player
        lastPlay = nil
        winner = nil
        passCount = 0
        selectedCards = []
        logs = [
            LogEntry(text: "Openbasaka dealt a new wormhole table."),
            LogEntry(text: "Boss chooses whether to claim the landlord signal.")
        ]
    }

    func toggle(_ card: PlayingCard) {
        guard phase == .playing, currentSeat == .player else { return }
        if selectedCards.contains(card) {
            selectedCards.remove(card)
        } else {
            selectedCards.insert(card)
        }
    }

    func callLandlord() {
        guard phase == .bidding else { return }
        assignLandlord(.player, reason: "Boss called landlord and opened the wormhole.")
    }

    func passBidding() {
        guard phase == .bidding else { return }
        let aiSeat = strongestAISeat()
        assignLandlord(aiSeat, reason: "Boss passed. \(aiSeat.shortTitle) claimed the landlord signal.")
        advanceAIsIfNeeded()
    }

    func playSelected() {
        guard phase == .playing, currentSeat == .player else { return }
        let cards = Array(selectedCards).sorted()
        guard let play = LandlordRuleEngine.classify(cards) else {
            append("Illegal pattern blocked: \(cards.map(\.shortLabel).joined(separator: " "))")
            return
        }
        guard LandlordRuleEngine.canBeat(play, previous: activePreviousPlay) else {
            append("Play blocked. \(play.kind.label) cannot beat the current table signal.")
            return
        }
        commit(play: play, from: .player)
        selectedCards = []
        advanceAIsIfNeeded()
    }

    func passTurn() {
        guard phase == .playing, currentSeat == .player else { return }
        guard lastPlay != nil else {
            append("You lead this orbit. Passing is disabled until a table signal exists.")
            return
        }
        commitPass(from: .player)
        advanceAIsIfNeeded()
    }

    func selectHint() {
        guard phase == .playing, currentSeat == .player else { return }
        let options = LandlordRuleEngine.legalPlays(from: humanHand, beating: activePreviousPlay)
        selectedCards = Set(options.first ?? [])
        if selectedCards.isEmpty {
            append("No legal hint. Passing is the clean move.")
        } else {
            append("Hint selected: \(selectedCards.sorted().map(\.shortLabel).joined(separator: " "))")
        }
    }

    private func assignLandlord(_ seat: Seat, reason: String) {
        landlord = seat
        hands[seat, default: []].append(contentsOf: landlordCards)
        hands[seat] = hands[seat, default: []].sorted()
        phase = .playing
        currentSeat = seat
        append(reason)
        append("Landlord cards: \(landlordCards.map(\.shortLabel).joined(separator: " "))")
    }

    private func strongestAISeat() -> Seat {
        let score: (Seat) -> Int = { seat in
            let cards = self.hands[seat, default: []]
            return cards.reduce(0) { total, card in total + card.rank.rawValue } + LandlordRuleEngine.legalPlays(from: cards, beating: nil).count
        }
        return score(.left) >= score(.right) ? .left : .right
    }

    private func advanceAIsIfNeeded() {
        while phase == .playing, currentSeat != .player, winner == nil {
            aiAct(currentSeat)
        }
    }

    private func aiAct(_ seat: Seat) {
        let options = LandlordRuleEngine.legalPlays(from: hands[seat, default: []], beating: activePreviousPlay)
        if let playCards = options.first, let play = LandlordRuleEngine.classify(playCards) {
            commit(play: play, from: seat)
        } else {
            commitPass(from: seat)
        }
    }

    private func commit(play: Play, from seat: Seat) {
        for card in play.cards {
            hands[seat]?.removeAll { $0 == card }
        }
        lastPlay = TablePlay(seat: seat, play: play)
        passCount = 0
        append("\(seat.shortTitle) played \(play.kind.label): \(play.cards.map(\.shortLabel).joined(separator: " "))")
        if hands[seat, default: []].isEmpty {
            winner = seat
            phase = .finished
            append("\(seat.shortTitle) crossed the event horizon first.")
            return
        }
        currentSeat = nextSeat(after: seat)
    }

    private func commitPass(from seat: Seat) {
        append("\(seat.shortTitle) passed.")
        passCount += 1
        if passCount >= 2, let leader = lastPlay?.seat {
            append("Orbit resets. \(leader.shortTitle) leads again.")
            currentSeat = leader
            lastPlay = nil
            passCount = 0
        } else {
            currentSeat = nextSeat(after: seat)
        }
    }

    private func nextSeat(after seat: Seat) -> Seat {
        switch seat {
        case .left: return .player
        case .player: return .right
        case .right: return .left
        }
    }

    private func append(_ text: String) {
        logs.insert(LogEntry(text: text), at: 0)
        logs = Array(logs.prefix(18))
    }
}

enum LandlordRuleSelfTests {
    static func runSmoke() {
        assert(PlayingCard.deck().count == 54)
        let deal = LandlordRuleEngine.deal(seed: 42)
        assert(deal.1.count == 3)
        assert(Seat.allCases.allSatisfy { deal.0[$0, default: []].count == 17 })
    }
}
