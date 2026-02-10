const Room = require('./server/game/Room');

const room = new Room('test-restart');

// Add 4 players
const p1 = room.addPlayer('P1').playerId; // Admin
const p2 = room.addPlayer('P2').playerId;
const p3 = room.addPlayer('P3').playerId;
const p4 = room.addPlayer('P4').playerId;

// Simulate Game Progress
room.state = 'PLAYING';
room.scores = { [p1]: 50, [p2]: 10, [p3]: 0, [p4]: 100 };
room.roundScores = { [p1]: 5 };

console.log('--- Initial State ---');
console.log('State:', room.state);
console.log('Scores:', room.scores);

// Execute Restart
console.log('\n--- Restarting Game ---');
const result = room.restartGame();
console.log('Restart Result:', result);

console.log('\n--- Post-Restart State ---');
console.log('State:', room.state);
console.log('Scores:', room.scores);
console.log('Hands Length:', room.hands.length);
console.log('Deck Cards Left:', room.deck.cards.length);
console.log('Dealer Index:', room.dealerIndex);

if (room.state === 'WAITING' && room.scores[p1] === 0 && room.scores[p4] === 0) {
    console.log('\nSUCCESS: Game restarted correctly.');
} else {
    console.log('\nFAIL: Restart logic failed.');
}
