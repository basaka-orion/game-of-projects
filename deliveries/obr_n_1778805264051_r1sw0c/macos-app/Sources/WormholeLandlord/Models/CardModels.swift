import Foundation
import SwiftUI

enum Suit: String, CaseIterable, Codable {
    case spades
    case hearts
    case clubs
    case diamonds
    case joker

    var symbol: String {
        switch self {
        case .spades: return "♠"
        case .hearts: return "♥"
        case .clubs: return "♣"
        case .diamonds: return "♦"
        case .joker: return "★"
        }
    }

    var color: Color {
        switch self {
        case .hearts, .diamonds: return WormholeTheme.redSuit
        case .joker: return WormholeTheme.gold
        default: return WormholeTheme.ink
        }
    }
}

enum Rank: Int, CaseIterable, Comparable, Codable {
    case three = 3
    case four = 4
    case five = 5
    case six = 6
    case seven = 7
    case eight = 8
    case nine = 9
    case ten = 10
    case jack = 11
    case queen = 12
    case king = 13
    case ace = 14
    case two = 15
    case blackJoker = 16
    case redJoker = 17

    static func < (lhs: Rank, rhs: Rank) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    var label: String {
        switch self {
        case .jack: return "J"
        case .queen: return "Q"
        case .king: return "K"
        case .ace: return "A"
        case .two: return "2"
        case .blackJoker: return "BLACK"
        case .redJoker: return "RED"
        default: return String(rawValue)
        }
    }
}

struct PlayingCard: Identifiable, Hashable, Comparable, Codable {
    let suit: Suit
    let rank: Rank

    var id: String { "\(suit.rawValue)-\(rank.rawValue)" }
    var shortLabel: String { rank == .blackJoker || rank == .redJoker ? rank.label : rank.label + suit.symbol }

    static func < (lhs: PlayingCard, rhs: PlayingCard) -> Bool {
        if lhs.rank == rhs.rank {
            return lhs.suit.rawValue < rhs.suit.rawValue
        }
        return lhs.rank < rhs.rank
    }

    static func deck() -> [PlayingCard] {
        let normalRanks: [Rank] = [.three, .four, .five, .six, .seven, .eight, .nine, .ten, .jack, .queen, .king, .ace, .two]
        var cards = Suit.allCases
            .filter { $0 != .joker }
            .flatMap { suit in normalRanks.map { PlayingCard(suit: suit, rank: $0) } }
        cards.append(PlayingCard(suit: .joker, rank: .blackJoker))
        cards.append(PlayingCard(suit: .joker, rank: .redJoker))
        return cards
    }
}

enum Seat: String, CaseIterable, Identifiable, Codable {
    case left
    case player
    case right

    var id: String { rawValue }

    var title: String {
        switch self {
        case .left: return "Europa AI"
        case .player: return "Boss"
        case .right: return "Saturn AI"
        }
    }

    var shortTitle: String {
        switch self {
        case .left: return "Europa"
        case .player: return "Boss"
        case .right: return "Saturn"
        }
    }

    var isHuman: Bool { self == .player }
}

enum PlayKind: String, Codable {
    case pass
    case single
    case pair
    case triple
    case tripleWithSingle
    case straight
    case pairSequence
    case bomb
    case rocket

    var label: String {
        switch self {
        case .pass: return "Pass"
        case .single: return "Single"
        case .pair: return "Pair"
        case .triple: return "Triple"
        case .tripleWithSingle: return "Triple + Wing"
        case .straight: return "Straight"
        case .pairSequence: return "Pair Run"
        case .bomb: return "Bomb"
        case .rocket: return "Rocket"
        }
    }
}

struct Play: Equatable, Codable {
    let kind: PlayKind
    let cards: [PlayingCard]
    let primaryRank: Rank?
    let sequenceLength: Int

    static let pass = Play(kind: .pass, cards: [], primaryRank: nil, sequenceLength: 0)
}

struct TablePlay: Identifiable, Codable {
    let id = UUID()
    let seat: Seat
    let play: Play
}

enum RoundPhase: String, Codable {
    case bidding
    case playing
    case finished
}

struct LogEntry: Identifiable, Codable {
    let id = UUID()
    let text: String
}
