/**
 * Bot Player Unit Tests
 * Tests Room bot methods and BotPlayer fallback logic.
 * Does NOT require ANTHROPIC_API_KEY.
 */

const Room = require('./game/Room');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✓ ${message}`);
        passed++;
    } else {
        console.error(`  ✗ ${message}`);
        failed++;
    }
}

// --- Test: addBotPlayer ---
console.log('\n[TEST] addBotPlayer');

const room1 = new Room('test1');
room1.addPlayer('Human', null, 0);

const r1 = room1.addBotPlayer(1);
assert(r1.success === true, 'addBotPlayer returns success');
assert(r1.botName === 'Bot 1', 'Bot is named Bot 1');
assert(room1.seats[1]?.isBot === true, 'Seat 1 has isBot: true');
assert(room1.seats[1]?.name === 'Bot 1', 'Bot name in seat is correct');
assert(room1.scores['Bot 1'] === undefined, 'Score keyed by ID not name');
assert(typeof room1.scores[room1.seats[1].id] === 'number', 'Bot has a score entry');

const r2 = room1.addBotPlayer(1);
assert(r2.error !== undefined, 'Cannot add bot to taken seat');

const r3 = room1.addBotPlayer(2);
assert(r3.success === true, 'Can add second bot to seat 2');
assert(r3.botName === 'Bot 2', 'Second bot named Bot 2');

// --- Test: addBotPlayer in non-WAITING state ---
console.log('\n[TEST] addBotPlayer state guard');

const room2 = new Room('test2');
room2.addPlayer('H1', null, 0);
room2.addPlayer('H2', null, 1);
room2.addPlayer('H3', null, 2);
room2.addPlayer('H4', null, 3);
room2.startGame();
assert(room2.state === 'BIDDING', 'Game started');

const r4 = room2.addBotPlayer(0);
assert(r4.error !== undefined, 'Cannot add bot during active game');

// --- Test: checkBotTurn does not crash ---
console.log('\n[TEST] checkBotTurn');

const room3 = new Room('test3');
room3.addPlayer('Human', null, 0);
room3.addBotPlayer(1);
room3.addBotPlayer(2);
room3.addBotPlayer(3);

// Note: Since checkBotTurn uses require() inside, we test via turnIndex check
room3.startGame();
// After startGame, checkBotTurn is called. Since we can't easily mock require(),
// we just verify the room started correctly and the bot seats are set.
assert(room3.state === 'BIDDING', 'Game with bots reaches BIDDING');

const currentPlayer = room3.seats[room3.turnIndex];
console.log(`  Current turn: seat ${room3.turnIndex} - ${currentPlayer?.name} (isBot: ${currentPlayer?.isBot})`);
assert(currentPlayer !== null, 'Current turn player exists');

// --- Test: Fallback functions produce legal moves ---
console.log('\n[TEST] Fallback move generation');

const room4 = new Room('test4');
room4.addPlayer('H1', null, 0);
room4.addPlayer('H2', null, 1);
room4.addPlayer('H3', null, 2);
room4.addBotPlayer(3);
room4.startGame();

// Find which seat the bot is in
const botSeat = 3;
const botPlayer = room4.seats[botSeat];
assert(botPlayer?.isBot === true, 'Bot in seat 3');

const botHand = room4.hands[botSeat];
assert(botHand?.length === 12, `Bot has 12 cards (got ${botHand?.length})`);

// Test that bot's hand contains only valid cards
const validRanks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const validSuits = ['♠','♥','♦','♣'];
const allValid = botHand.every(c => validRanks.includes(c.rank) && validSuits.includes(c.suit));
assert(allValid, 'All bot hand cards are valid');

// --- Test: requestRedeal ---
console.log('\n[TEST] requestRedeal - wrong state');

const roomR1 = new Room('redeal1');
roomR1.addPlayer('P1', null, 0);
roomR1.addPlayer('P2', null, 1);
roomR1.addPlayer('P3', null, 2);
roomR1.addPlayer('P4', null, 3);
// State is WAITING, not BIDDING
const p1id = roomR1.seats[0].id;
const rr1 = roomR1.requestRedeal(p1id);
assert(rr1.error !== undefined, 'Redeal rejected when state is not BIDDING');

console.log('\n[TEST] requestRedeal - wrong player (not bid starter)');

const roomR2 = new Room('redeal2');
roomR2.addPlayer('P1', null, 0);
roomR2.addPlayer('P2', null, 1);
roomR2.addPlayer('P3', null, 2);
roomR2.addPlayer('P4', null, 3);
roomR2.startGame();
assert(roomR2.state === 'BIDDING', 'Game reached BIDDING');
// Find a player who is NOT the bid starter
const nonStarterSeatR2 = roomR2.roundBidStarterIndex === 0 ? 1 : 0;
const nonStarterIdR2 = roomR2.seats[nonStarterSeatR2].id;
const rr2 = roomR2.requestRedeal(nonStarterIdR2);
assert(rr2.error !== undefined, 'Redeal rejected for non-bid-starter');
assert(rr2.error === 'Sadece el başlatan oyuncu bozabilir', 'Correct error message for wrong player');

console.log('\n[TEST] requestRedeal - bid starter has strong cards');

const roomR3 = new Room('redeal3');
roomR3.addPlayer('P1', null, 0);
roomR3.addPlayer('P2', null, 1);
roomR3.addPlayer('P3', null, 2);
roomR3.addPlayer('P4', null, 3);
roomR3.startGame();
// Force the actual bid starter to have at least one strong card
const bidStarterR3 = roomR3.roundBidStarterIndex;
roomR3.hands[bidStarterR3] = [
    { rank: 'A', suit: '♠' }, { rank: '2', suit: '♥' }, { rank: '3', suit: '♦' },
    { rank: '4', suit: '♣' }, { rank: '5', suit: '♠' }, { rank: '6', suit: '♥' },
    { rank: '7', suit: '♦' }, { rank: '8', suit: '♣' }, { rank: '9', suit: '♠' },
    { rank: '10', suit: '♥' }, { rank: '2', suit: '♦' }, { rank: '3', suit: '♣' }
];
const bidStarterIdR3 = roomR3.seats[bidStarterR3].id;
const rr3 = roomR3.requestRedeal(bidStarterIdR3);
assert(rr3.error !== undefined, 'Redeal rejected when bid starter has strong cards');
assert(rr3.error === 'Elinizde güçlü kart var, bozamazsınız', 'Correct error message for strong hand');

console.log('\n[TEST] requestRedeal - success (bid starter, all weak cards)');

const roomR4 = new Room('redeal4');
roomR4.addPlayer('P1', null, 0);
roomR4.addPlayer('P2', null, 1);
roomR4.addPlayer('P3', null, 2);
roomR4.addPlayer('P4', null, 3);
roomR4.startGame();
const prevDealerIndex = roomR4.dealerIndex;
// Force the actual bid starter to have all weak cards
const bidStarterR4 = roomR4.roundBidStarterIndex;
roomR4.hands[bidStarterR4] = [
    { rank: '2', suit: '♠' }, { rank: '3', suit: '♥' }, { rank: '4', suit: '♦' },
    { rank: '5', suit: '♣' }, { rank: '6', suit: '♠' }, { rank: '7', suit: '♥' },
    { rank: '8', suit: '♦' }, { rank: '9', suit: '♣' }, { rank: '10', suit: '♠' },
    { rank: '2', suit: '♥' }, { rank: '3', suit: '♦' }, { rank: '4', suit: '♣' }
];
const bidStarterIdR4 = roomR4.seats[bidStarterR4].id;
const rr4 = roomR4.requestRedeal(bidStarterIdR4);
assert(rr4.success === true, 'Redeal succeeds for bid starter with weak hand');
assert(roomR4.state === 'BIDDING', 'Room is re-dealt and back in BIDDING');
assert(roomR4.dealerIndex === (prevDealerIndex + 1) % 4, 'Dealer rotated after redeal');

// --- Summary ---
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
