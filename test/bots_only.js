
const BASE_URL = 'http://localhost:3000';
const ROOM_ID = 'room1';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function apiCall(method, endpoint, body = null, headers = {}) {
    try {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json', ...headers }
        };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(`${BASE_URL}${endpoint}`, opts);
        return await res.json();
    } catch (e) {
        return { error: e.message };
    }
}

class Bot {
    constructor(name) {
        this.name = name;
        this.id = null;
        this.token = null;
        this.hand = [];
        this.isMyTurn = false;
        this.seatIndex = -1;
    }

    async join(roomId, code) {
        console.log(`${this.name} joining ${roomId} with code ${code}...`);
        const res = await apiCall('POST', `/api/rooms/${roomId}/join`, { name: this.name, code });
        if (res.success) {
            this.id = res.playerId;
            this.token = res.token;
            console.log(`${this.name} joined.`);
            return true;
        } else {
            console.log(`${this.name} failed to join: ${res.message}`);
            return false;
        }
    }

    async updateState(roomId) {
        const res = await apiCall('GET', `/api/rooms/${roomId}/state`, null, { 'x-player-id': this.token });
        if (res.players) {
            const me = res.players.find(p => p?.id === this.id);
            if (me) this.seatIndex = me.seatIndex;

            this.hand = res.myHand || [];

            // Check turn
            this.isMyTurn = (res.currentTurn === this.id);

            // Should I bid?
            if (res.state === 'BIDDING' && this.isMyTurn) {
                // Pass
                await apiCall('POST', `/api/rooms/${roomId}/bid`, { amount: 0 }, { 'x-player-id': this.token });
                console.log(`${this.name} bids 0`);
            }

            // Should I exchange?
            if (res.state === 'EXCHANGE_CARDS' && res.winningBid.playerId === this.id) {
                // Bury first 4
                console.log(`${this.name} exchanging cards...`);
                // Wait a bit
                await sleep(1000);
                // We need 4 cards.
                // Note: Polling might return hand BEFORE kitty is merged? 
                // Wait, logic says hand includes kitty in Room.js logic? 
                // Actually my Room.js says "bury 4 cards from hand", then get kitty? 
                // No, Room.js: exchangeCards takes cards, removes them, THEN adds kitty.
                // So I must bury from my CURRENT hand (13 cards).
                if (this.hand.length >= 4) {
                    const toBury = this.hand.slice(0, 4);
                    await apiCall('POST', `/api/rooms/${roomId}/exchange`, { cards: toBury }, { 'x-player-id': this.token });
                }
            }

            // Should I select Trump?
            if (res.state === 'TRUMP_SELECTION' && res.winningBid.playerId === this.id) {
                console.log(`${this.name} selects trump ♠`);
                await apiCall('POST', `/api/rooms/${roomId}/trump`, { suit: '♠' }, { 'x-player-id': this.token });
            }

            // Should I play?
            if (res.state === 'PLAYING' && this.isMyTurn) {
                await sleep(1000 + Math.random() * 1000); // Think
                await this.playLogic(roomId, res);
            }
        }
    }

    async playLogic(roomId, state) {
        // Simple logic similar to simulation.js
        const droppedSuits = { '♠': false, '♥': false, '♦': false, '♣': false }; // Simplified tracking

        const candidates = this.hand;
        const valid = candidates.filter(c => this.isValidMove(c, state.currentTrick, state.trump, this.hand));

        if (valid.length === 0) {
            console.log("No valid moves? Panic. Playing random.");
            return;
        }

        const cardToPlay = valid[Math.floor(Math.random() * valid.length)];
        // console.log(`${this.name} playing ${cardToPlay.suit}${cardToPlay.rank}`);

        const res = await apiCall('POST', `/api/rooms/${roomId}/play`, { card: cardToPlay }, { 'x-player-id': this.token });
        if (res.error) {
            console.log(`${this.name} play error: ${res.error}`);
        } else {
            console.log(`${this.name} plays ${cardToPlay.suit}${cardToPlay.rank}`);
        }
    }

    isValidMove(card, trick, trump, hand) {
        // Simplified Client-Side Validation to pick valid card
        if (!trick || trick.length === 0) return true;
        const lead = trick[0].card;
        const hasLead = hand.some(c => c.suit === lead.suit);
        if (hasLead) {
            if (card.suit !== lead.suit) return false;
            // Higher logic skipped for simplicity in bots
            return true;
        }
        // No lead suit
        const hasTrump = hand.some(c => c.suit === trump);
        if (hasTrump) {
            if (card.suit === trump) return true; // Can play trump
            // Can I play non-trump? Only if I have NO trump? 
            // Logic: If I have trump, I MUST play trump (if void in lead).
            return false;
        }
        return true;
    }
}

async function run() {
    console.log("Waiting for room to check codes...");

    // Get Codes from Debug Endpoint
    let codes = null;
    while (!codes) {
        const res = await apiCall('GET', `/api/debug/${ROOM_ID}`);
        if (res.seatCodes && Object.keys(res.seatCodes).length === 3) {
            codes = res.seatCodes;
        } else {
            console.log("Room not ready or codes missing. Waiting...");
            await sleep(2000);
        }
    }

    console.log("Found codes:", codes);

    const bots = [
        new Bot('Bot2'),
        new Bot('Bot3'),
        new Bot('Bot4')
    ];

    // Join
    await bots[0].join(ROOM_ID, codes['1']);
    await bots[1].join(ROOM_ID, codes['2']);
    await bots[2].join(ROOM_ID, codes['3']);

    // Loop
    while (true) {
        for (const bot of bots) {
            await bot.updateState(ROOM_ID);
        }
        await sleep(1000);
    }
}

run();
