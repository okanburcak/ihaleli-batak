const Room = require('./game/Room');
const assert = require('assert');

console.log("Testing Scoring Logic...");

const room = new Room('test');
// Mock Players
const p1 = { id: 'p1', name: 'P1' };
const p2 = { id: 'p2', name: 'P2' };
const p3 = { id: 'p3', name: 'P3' };
const p4 = { id: 'p4', name: 'P4' };
room.seats = [p1, p2, p3, p4];
room.players = [p1, p2, p3, p4];
room.scores = { p1: 0, p2: 0, p3: 0, p4: 0 };

// Scenario 1: Bidder bids 5, takes 7.
// Old Logic: Score +5
// New Logic: Score +7
console.log("Scenario 1: Bid 5, Take 7");
room.winningBid = { playerId: 'p1', amount: 5 };
room.roundScores = {
    p1: 7,
    p2: 2,
    p3: 2,
    p4: 1
};
// Reset scores
room.scores = { p1: 0, p2: 0, p3: 0, p4: 0 };

room.endRound();

console.log(`Bidder Score: ${room.scores.p1}`);

// We expect 7 if new logic, 5 if old logic.
if (room.scores.p1 === 7) {
    console.log("PASS: Bidder got +tricks scores.");
} else if (room.scores.p1 === 5) {
    console.log("FAIL: Bidder got +bid score (Old Logic).");
} else {
    console.log("FAIL: Unexpected score: " + room.scores.p1);
}


// Scenario 2: Bidder bids 8, takes 6
// Expect -8
console.log("Scenario 2: Bid 8, Take 6");
room.winningBid = { playerId: 'p1', amount: 8 };
room.roundScores = {
    p1: 6,
    p2: 2,
    p3: 2,
    p4: 2
};
// Reset scores
room.scores = { p1: 0, p2: 0, p3: 0, p4: 0 };
room.state = 'PLAYING'; // trick endRound check

room.endRound();
console.log(`Bidder Score: ${room.scores.p1}`);
if (room.scores.p1 === -8) {
    console.log("PASS: Bidder got -bid penalty.");
} else {
    console.log("FAIL: Unexpected score: " + room.scores.p1);
}
