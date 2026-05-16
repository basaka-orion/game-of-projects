import XCTest
@testable import WormholeLandlord

final class LandlordRulesTests: XCTestCase {
    func testDeckAndDealAreDeterministic() {
        XCTAssertEqual(PlayingCard.deck().count, 54)
        let first = LandlordRuleEngine.deal(seed: 177869)
        let second = LandlordRuleEngine.deal(seed: 177869)
        XCTAssertEqual(first.1, second.1)
        XCTAssertEqual(first.0[.player]?.count, 17)
        XCTAssertEqual(first.0[.left]?.count, 17)
        XCTAssertEqual(first.0[.right]?.count, 17)
        XCTAssertEqual(first.1.count, 3)
    }

    func testClassifiesRequiredPatterns() {
        XCTAssertEqual(LandlordRuleEngine.classify(cards([.three]))?.kind, .single)
        XCTAssertEqual(LandlordRuleEngine.classify(cards([.four, .four]))?.kind, .pair)
        XCTAssertEqual(LandlordRuleEngine.classify(cards([.five, .five, .five]))?.kind, .triple)
        XCTAssertEqual(LandlordRuleEngine.classify(cards([.six, .six, .six, .nine]))?.kind, .tripleWithSingle)
        XCTAssertEqual(LandlordRuleEngine.classify(cards([.three, .four, .five, .six, .seven]))?.kind, .straight)
        XCTAssertEqual(LandlordRuleEngine.classify(cards([.three, .three, .four, .four, .five, .five]))?.kind, .pairSequence)
        XCTAssertEqual(LandlordRuleEngine.classify(cards([.eight, .eight, .eight, .eight]))?.kind, .bomb)
        XCTAssertEqual(LandlordRuleEngine.classify([PlayingCard(suit: .joker, rank: .blackJoker), PlayingCard(suit: .joker, rank: .redJoker)])?.kind, .rocket)
    }

    func testBeatingRules() {
        let pairFives = LandlordRuleEngine.classify(cards([.five, .five]))!
        let pairSixes = LandlordRuleEngine.classify(cards([.six, .six]))!
        let bomb = LandlordRuleEngine.classify(cards([.three, .three, .three, .three]))!
        let rocket = LandlordRuleEngine.classify([PlayingCard(suit: .joker, rank: .blackJoker), PlayingCard(suit: .joker, rank: .redJoker)])!
        XCTAssertTrue(LandlordRuleEngine.canBeat(pairSixes, previous: pairFives))
        XCTAssertFalse(LandlordRuleEngine.canBeat(pairFives, previous: pairSixes))
        XCTAssertTrue(LandlordRuleEngine.canBeat(bomb, previous: pairSixes))
        XCTAssertTrue(LandlordRuleEngine.canBeat(rocket, previous: bomb))
    }

    @MainActor
    func testLegalPlaysIncludePassableResponsesAndGameCanFinish() {
        let previous = LandlordRuleEngine.classify(cards([.seven, .seven]))!
        let hand = cards([.three, .four, .eight, .eight, .king, .king, .king, .king])
        let legal = LandlordRuleEngine.legalPlays(from: hand, beating: previous)
        XCTAssertTrue(legal.contains { LandlordRuleEngine.classify($0)?.kind == .pair && LandlordRuleEngine.classify($0)?.primaryRank == .eight })
        XCTAssertTrue(legal.contains { LandlordRuleEngine.classify($0)?.kind == .bomb && LandlordRuleEngine.classify($0)?.primaryRank == .king })

        let store = LandlordGameStore()
        store.callLandlord()
        XCTAssertEqual(store.phase, .playing)
    }

    private func cards(_ ranks: [Rank]) -> [PlayingCard] {
        let suits: [Suit] = [.spades, .hearts, .clubs, .diamonds]
        return ranks.enumerated().map { index, rank in
            PlayingCard(suit: rank == .blackJoker || rank == .redJoker ? .joker : suits[index % suits.count], rank: rank)
        }
    }
}
