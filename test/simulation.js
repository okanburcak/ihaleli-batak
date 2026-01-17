// Native fetch used in Node 18+

const BASE_URL = 'http://localhost:3000';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function apiCall(method, endpoint, body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['x-player-id'] = token;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${BASE_URL}${endpoint}`, opts);
    if (!res.ok) {
        const txt = await res.text();
        // console.error(`Error ${method} ${endpoint}: ${txt}`);
        return { error: txt };
    }
    return res.json();
}

class Bot {
    constructor(name) {
        this.name = name;
        this.token = null;
        this.id = null;
        this.hand = [];
        this.state = null;
    }

    async join(roomId, code = null) {
        const res = await apiCall('POST', `/api/rooms/${roomId}/join`, { name: this.name, code });
        if (res.success) {
            this.token = res.token;
            this.id = res.playerId;
            console.log(`${this.name} joined.`);
        } else {
            console.error(`${this.name} failed to join:`, res);
        }
        return res;
    }

    async updateState(roomId) {
        const res = await apiCall('GET', `/api/rooms/${roomId}/state`, null, this.token);
        if (res.error) return;
        this.state = res;
        this.hand = res.myHand || [];
    }

    async start(roomId) {
        console.log(`${this.name} starting game...`);
        return apiCall('POST', `/api/rooms/${roomId}/start`, {}, this.token);
    }

    async bid(roomId, amount) {
        console.log(`${this.name} bids ${amount}`);
        return apiCall('POST', `/api/rooms/${roomId}/bid`, { amount }, this.token);
    }

    async exchange(roomId, cards) {
        console.log(`${this.name} exchanging cards...`);
        return apiCall('POST', `/api/rooms/${roomId}/exchange`, { cards }, this.token);
    }

    async selectTrump(roomId, suit) {
        console.log(`${this.name} selects trump ${suit}`);
        return apiCall('POST', `/api/rooms/${roomId}/trump`, { suit }, this.token);
    }

    async play(roomId, card) {
        console.log(`${this.name} plays ${card.suit}${card.rank}`);
        return apiCall('POST', `/api/rooms/${roomId}/play`, { card }, this.token);
    }
}

// Simple logic utility
function getRankVal(r) {
    const map = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11 };
    return map[r] || parseInt(r);
}

function isValidMove(hand, card, currentTrick, trump) {
    if (currentTrick.length === 0) return true;

    const leadCard = currentTrick[0].card;
    const leadSuit = leadCard.suit;

    const hasLeadSuit = hand.some(c => c.suit === leadSuit);

    if (hasLeadSuit) {
        if (card.suit !== leadSuit) return false;
        // Raise logic ignored for simple bot, assumes server validates.
        // But if server validates strictly, we DO need logic here or we get 400.
        // Let's implement basic "Try to win or dump" logic.
        return true;
    } else {
        const hasTrump = hand.some(c => c.suit === trump);
        if (hasTrump && card.suit !== trump) {
            // Must play trump if void in lead
            return false;
        }
        return true;
    }
}

async function runSimulation() {
    const roomId = 'room1';
    const bots = [new Bot('AdminBot'), new Bot('Bot2'), new Bot('Bot3'), new Bot('Bot4')];

    // 1. Join
    const adminRes = await bots[0].join(roomId); // Admin
    const codes = adminRes.seatCodes; // Actually client doesn't get this easily unless we parse state? 
    // Wait, my API `join` response doesn't return seatCodes.
    // The Admin needs to get state to see codes.

    await bots[0].updateState(roomId);
    const seatCodes = bots[0].state.seatCodes; // {1: '..', 2: '..', 3: '..'}

    await bots[1].join(roomId, seatCodes[1]);
    await bots[2].join(roomId, seatCodes[2]);
    await bots[3].join(roomId, seatCodes[3]);

    // 2. Start
    await bots[0].start(roomId);

    let gameOver = false;
    let loopCount = 0;

    while (!gameOver && loopCount < 1000) {
        loopCount++;
        await sleep(200); // Polling simulation

        // Update all bots
        for (const bot of bots) {
            await bot.updateState(roomId);
        }

        const state = bots[0].state; // Global view (everyone sees public state same)
        if (!state) continue;

        if (state.state === 'GAME_OVER') {
            console.log("GAME OVER!");
            console.log("SCORES:", state.scores);
            const winner = Object.keys(state.scores).find(id => state.scores[id] >= 51);
            console.log("Winner ID:", winner);
            gameOver = true;
            break;
        }

        const turnPlayerId = state.currentTurn;
        const currentBot = bots.find(b => b.id === turnPlayerId);
        if (!currentBot) continue; // Waiting for state transition or resolution

        // --- STATE MACHINE ---

        if (state.state === 'BIDDING') {
            // Logic: If it's my turn, bid minimum or pass.
            // To make game progress fast: 
            // - First bidder (starter) has implied 4.
            // - Next bidders: Pass immediately if not "Smart".
            // - Let's make Bot 2 always bid 5, then everyone else passes.
            // - Or just everyone Pass -> Starter gets it at 4.
            if (currentBot.id === turnPlayerId) {
                const minBid = state.winningBid.amount + 1;
                // Strategy: Randomly bid sometimes to mix it up?
                // Simple: ALWAYS PASS (except starter who might have auto bid).
                // If we pass, eventually it falls to starter at 4. Used to work.
                await currentBot.bid(roomId, 0); // Pass
            }
        }

        else if (state.state === 'EXCHANGE_CARDS') {
            // Winner needs to bury 4 cards.
            // Just pick first 4 cards not being top trumps?
            // Simple: Bury first 4 cards.
            if (currentBot.hand.length > 4) {
                const toBury = currentBot.hand.slice(0, 4);
                await currentBot.exchange(roomId, toBury);
            }
        }

        else if (state.state === 'TRUMP_SELECTION') {
            // Pick Spades always
            await currentBot.selectTrump(roomId, '♠');
        }

        else if (state.state === 'PLAYING') {
            // Play a valid card
            // 1. Filter valid cards
            const candidates = currentBot.hand;
            const valid = [];

            // Re-implement basic server validation locally to avoid 400 loops
            const trick = state.currentTrick;
            const trump = state.trump;

            for (const c of candidates) {
                // If we send invalid, server returns error.
                // We should try to find ONE valid card.
                // Since our `isValidMove` helper above is incomplete (doesn't check "Must Raise"),
                // we might hit verify errors.
                // Better approach: Try cards until success?
                // The hand is small (13 max).
                // Let's rely on server validation? No, that's slow.
                // Let's implement "Must Follow" rule at least.
                let check = true;
                if (trick.length > 0) {
                    const lead = trick[0].card;
                    const hasSuit = currentBot.hand.some(x => x.suit === lead.suit);
                    if (hasSuit && c.suit !== lead.suit) check = false;
                    // Void in lead? Must trump?
                    if (!hasSuit) {
                        const hasTrump = currentBot.hand.some(x => x.suit === trump);
                        if (hasTrump && c.suit !== trump) check = false;
                    }
                }
                if (check) valid.push(c);
            }

            // If local validation failed to filter correctly, fallback to all candidates
            const listToTry = valid.length > 0 ? valid : candidates;

            // Ensure we have cards
            if (listToTry.length === 0) {
                console.log(`${currentBot.name} has no cards to play but it is their turn? Hand size: ${currentBot.hand.length}`);

                // Detection of stuck state: 
                // If this keeps happening (we could track count), force end round.
                // For simplicity, if we hit this, just try to force end round to unstick simulation.
                console.log("Stuck state detected. Forcing end of round...");
                await apiCall('POST', `/api/debug/${roomId}/end-round`);
                await sleep(5000); // Wait for restart
                continue;
            }

            // Pick one. HIGH card to win? Or LOW to dump?
            // Random for chaos.
            const cardToPlay = listToTry[Math.floor(Math.random() * listToTry.length)];

            if (!cardToPlay) {
                console.log("Error: cardToPlay is undefined");
                continue;
            }

            try {
                const res = await currentBot.play(roomId, cardToPlay);
                if (res.error) {
                    console.log(`${currentBot.name} failed to play ${cardToPlay.suit}${cardToPlay.rank}: ${res.error}`);
                    // Retry with ALL cards sequentially?
                    for (const c of currentBot.hand) {
                        if (c.suit === cardToPlay.suit && c.rank === cardToPlay.rank) continue;
                        // console.log("Retrying with", c);
                        const r2 = await currentBot.play(roomId, c);
                        if (!r2.error) break;
                    }
                }
            } catch (err) {
                console.error("Play error:", err);
            }
        }
    }
}

runSimulation();
