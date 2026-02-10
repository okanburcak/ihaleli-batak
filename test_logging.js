const Room = require('./server/game/Room');

const room = new Room('test-room');

// Add 4 players
const p1 = room.addPlayer('P1').playerId;
const p2 = room.addPlayer('P2').playerId;
const p3 = room.addPlayer('P3').playerId;
const p4 = room.addPlayer('P4').playerId;

// FORCE STATE
room.state = 'PLAYING';
room.trump = '♠';

// FORCE HANDS
// Everyone has Spades to follow suit
const c1 = { suit: '♠', rank: 'A' }; // Wins
const c2 = { suit: '♠', rank: '2' };
const c3 = { suit: '♠', rank: '3' };
const c4 = { suit: '♠', rank: '4' };

const p1Index = room.players.findIndex(p => p.id === p1);
const p2Index = room.players.findIndex(p => p.id === p2);
const p3Index = room.players.findIndex(p => p.id === p3);
const p4Index = room.players.findIndex(p => p.id === p4);

room.hands = [[], [], [], []];
room.hands[p1Index] = [c1];
room.hands[p2Index] = [c2];
room.hands[p3Index] = [c3];
room.hands[p4Index] = [c4];

room.currentTrick = [];
room.turnIndex = p1Index;

console.log('--- PLAYING FULL TRICK ---');
room.playCard(p1, c1);
room.playCard(p2, c2);
room.playCard(p3, c3);
room.playCard(p4, c4);

console.log('Cards played. Waiting for resolution...');

setTimeout(() => {
    console.log('Done waiting.');
    // The logs should have appeared above via Room.js console.log
}, 2500);
