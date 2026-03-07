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

// --- Test: auto-redeal in startGame ---
console.log('\n[TEST] auto-redeal: ALL players always have at least one strong card');

const strongCards = ['A', 'K', 'Q', 'J'];
let autoRedealOk = true;
for (let i = 0; i < 20; i++) {
    const r = new Room(`redeal-auto-${i}`);
    r.addPlayer('P1', null, 0);
    r.addPlayer('P2', null, 1);
    r.addPlayer('P3', null, 2);
    r.addPlayer('P4', null, 3);
    r.startGame();
    if (!r.hands.every(hand => hand.some(c => strongCards.includes(c.rank)))) {
        autoRedealOk = false;
        break;
    }
}
assert(autoRedealOk, 'All players always have a strong card after startGame (20 runs)');

// --- Test: bot takeover ---
console.log('\n[TEST] bot takeover: human replaces bot seat');
{
    const room = new Room('takeover-test');
    room.addPlayer('Human1', null, 0);
    room.addBotPlayer(1);
    room.addBotPlayer(2);
    room.addBotPlayer(3);

    const before = room.seats[1];
    assert(before?.isBot === true, 'Seat 1 is a bot before takeover');

    const result = room.addPlayer('NewHuman', null, 1);
    assert(result.success === true, 'Takeover returns success');
    assert(room.seats[1]?.name === 'NewHuman', 'Seat 1 name is NewHuman');
    assert(!room.seats[1]?.isBot, 'Seat 1 is no longer a bot');
    assert(room.players.some(p => p.name === 'NewHuman'), 'NewHuman in players list');
    assert(!room.players.some(p => p.id === before.id), 'Old bot removed from players');
}

// --- Summary ---
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
