const Deck = require('./server/game/Deck');
const Room = require('./server/game/Room');

console.log("Starting Repro...");

function checkDuplicates(cards, context) {
    const seen = new Set();
    const dups = [];
    cards.forEach(c => {
        const key = `${c.suit}${c.rank}`;
        if (seen.has(key)) dups.push(key);
        seen.add(key);
    });
    if (dups.length > 0) {
        console.error(`[${context}] DUPLICATES FOUND:`, dups);
        return true;
    }
    return false;
}

let errorCount = 0;

for (let i = 0; i < 1000; i++) {
    const deck = new Deck();
    if (deck.cards.length !== 52) console.error("Deck size mismatch!");
    if (checkDuplicates(deck.cards, `Deck Init ${i}`)) errorCount++;

    const { hands, kitty } = deck.deal();

    // Check all cards together
    const allCards = [];
    hands.forEach(h => allCards.push(...h));
    allCards.push(...kitty);

    if (checkDuplicates(allCards, `Deal ${i}`)) {
        errorCount++;
        console.log("Failed at iteration", i);
        break;
    }
}

console.log(`Deck Test Complete. Errors: ${errorCount}`);

// Test Room Exchange Logic
console.log("Testing Room Exchange...");
const room = new Room('test');
room.seats = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }];
room.startGame();

// Force p1 to win bid
room.winningBid = { playerId: 'p1', amount: 6 };
room.state = 'TRUMP_SELECTION';
room.selectTrump('p1', '♠'); // p1 selects trump

// p1 has hand[0]
// simulate exchange
const p1Hand = room.hands[0];
const toBury = p1Hand.slice(0, 4); // Bury first 4 cards
room.exchangeCards('p1', toBury);

// Check integrity
const integrity = room.validateDeckIntegrity();
console.log("Post-Exchange Integrity:", integrity);

// Check if kitty is duplicated in "all cards" (which validate integrity does)
// We Expect this to implicitly FAIL/WARN in current implementation because Kitty is not cleared.

if (integrity.duplicates.length > 0) {
    console.log("Confirmed: Exchange causes duplicates in Integrity Check.");
} else {
    console.log("Unexpected: Integrity check passed?");
}
