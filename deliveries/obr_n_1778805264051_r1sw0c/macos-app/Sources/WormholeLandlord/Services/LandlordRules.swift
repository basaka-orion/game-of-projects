import Foundation

enum LandlordRuleEngine {
    static func shuffledDeck(seed: UInt64) -> [PlayingCard] {
        var generator = SeededGenerator(seed: seed == 0 ? 7 : seed)
        return PlayingCard.deck().shuffled(using: &generator)
    }

    static func deal(seed: UInt64) -> ([Seat: [PlayingCard]], [PlayingCard]) {
        let deck = shuffledDeck(seed: seed)
        var hands: [Seat: [PlayingCard]] = [.left: [], .player: [], .right: []]
        for index in 0..<51 {
            let seat = Seat.allCases[index % 3]
            hands[seat, default: []].append(deck[index])
        }
        let landlordCards = Array(deck.suffix(3)).sorted()
        for seat in Seat.allCases {
            hands[seat] = (hands[seat] ?? []).sorted()
        }
        return (hands, landlordCards)
    }

    static func classify(_ rawCards: [PlayingCard]) -> Play? {
        let cards = rawCards.sorted()
        guard !cards.isEmpty else { return nil }
        let ranks = cards.map(\.rank).sorted()
        let counts = Dictionary(grouping: ranks, by: { $0 }).mapValues(\.count)
        let groupedCounts = counts.values.sorted(by: >)

        if cards.count == 2 && Set(ranks) == Set([.blackJoker, .redJoker]) {
            return Play(kind: .rocket, cards: cards, primaryRank: .redJoker, sequenceLength: 2)
        }
        if cards.count == 4 && groupedCounts == [4] {
            return Play(kind: .bomb, cards: cards, primaryRank: ranks[0], sequenceLength: 1)
        }
        if cards.count == 1 {
            return Play(kind: .single, cards: cards, primaryRank: ranks[0], sequenceLength: 1)
        }
        if cards.count == 2 && groupedCounts == [2] {
            return Play(kind: .pair, cards: cards, primaryRank: ranks[0], sequenceLength: 1)
        }
        if cards.count == 3 && groupedCounts == [3] {
            return Play(kind: .triple, cards: cards, primaryRank: ranks[0], sequenceLength: 1)
        }
        if cards.count == 4 && groupedCounts == [3, 1], let triple = counts.first(where: { $0.value == 3 })?.key {
            return Play(kind: .tripleWithSingle, cards: cards, primaryRank: triple, sequenceLength: 1)
        }
        if cards.count >= 5 && isConsecutive(ranks) {
            return Play(kind: .straight, cards: cards, primaryRank: ranks.last, sequenceLength: cards.count)
        }
        if cards.count >= 6 && cards.count.isMultiple(of: 2) {
            let pairRanks = counts.filter { $0.value == 2 }.map(\.key).sorted()
            if pairRanks.count == cards.count / 2 && isConsecutive(pairRanks) {
                return Play(kind: .pairSequence, cards: cards, primaryRank: pairRanks.last, sequenceLength: pairRanks.count)
            }
        }
        return nil
    }

    static func canBeat(_ candidate: Play, previous: Play?) -> Bool {
        guard candidate.kind != .pass else { return false }
        guard let previous, previous.kind != .pass else { return true }
        if candidate.kind == .rocket { return true }
        if previous.kind == .rocket { return false }
        if candidate.kind == .bomb && previous.kind != .bomb { return true }
        if candidate.kind != previous.kind { return false }
        if candidate.sequenceLength != previous.sequenceLength { return false }
        guard let candidateRank = candidate.primaryRank, let previousRank = previous.primaryRank else { return false }
        return candidateRank > previousRank
    }

    static func legalPlays(from hand: [PlayingCard], beating previous: Play?) -> [[PlayingCard]] {
        var plays: [[PlayingCard]] = []
        let byRank = Dictionary(grouping: hand, by: \.rank)
        let ranks = byRank.keys.sorted()

        for rank in ranks {
            let cards = byRank[rank] ?? []
            if let first = cards.first { plays.append([first]) }
            if cards.count >= 2 { plays.append(Array(cards.prefix(2))) }
            if cards.count >= 3 { plays.append(Array(cards.prefix(3))) }
            if cards.count == 4 { plays.append(cards) }
        }

        for rank in ranks {
            let cards = byRank[rank] ?? []
            guard cards.count >= 3 else { continue }
            for kicker in hand where kicker.rank != rank {
                plays.append(Array(cards.prefix(3)) + [kicker])
                break
            }
        }

        let black = hand.first { $0.rank == .blackJoker }
        let red = hand.first { $0.rank == .redJoker }
        if let black, let red {
            plays.append([black, red])
        }

        plays.append(contentsOf: sequencePlays(from: hand, pairMode: false))
        plays.append(contentsOf: sequencePlays(from: hand, pairMode: true))

        return plays
            .compactMap { cards -> (Play, [PlayingCard])? in
                guard let play = classify(cards), canBeat(play, previous: previous) else { return nil }
                return (play, cards.sorted())
            }
            .sorted { lhs, rhs in
                if lhs.0.cards.count != rhs.0.cards.count { return lhs.0.cards.count < rhs.0.cards.count }
                return (lhs.0.primaryRank?.rawValue ?? 0) < (rhs.0.primaryRank?.rawValue ?? 0)
            }
            .map(\.1)
    }

    private static func sequencePlays(from hand: [PlayingCard], pairMode: Bool) -> [[PlayingCard]] {
        let byRank = Dictionary(grouping: hand, by: \.rank)
        let ranks = byRank.keys.filter { $0.rawValue < Rank.two.rawValue }.sorted()
        let minimum = pairMode ? 3 : 5
        var results: [[PlayingCard]] = []

        for start in ranks.indices {
            var chain: [Rank] = []
            var expected = ranks[start].rawValue
            for rank in ranks[start...] {
                if rank.rawValue != expected { break }
                let cards = byRank[rank] ?? []
                if pairMode && cards.count < 2 { break }
                chain.append(rank)
                expected += 1
                if chain.count >= minimum {
                    let selected = chain.flatMap { rank in
                        Array((byRank[rank] ?? []).prefix(pairMode ? 2 : 1))
                    }
                    results.append(selected)
                }
            }
        }
        return results
    }

    private static func isConsecutive(_ ranks: [Rank]) -> Bool {
        guard ranks.count >= 2 else { return false }
        if ranks.contains(where: { $0.rawValue >= Rank.two.rawValue }) { return false }
        let unique = Array(Set(ranks)).sorted()
        guard unique.count == ranks.count else { return false }
        return zip(unique, unique.dropFirst()).allSatisfy { $0.rawValue + 1 == $1.rawValue }
    }
}

struct SeededGenerator: RandomNumberGenerator {
    private var state: UInt64

    init(seed: UInt64) {
        self.state = seed
    }

    mutating func next() -> UInt64 {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return state
    }
}
