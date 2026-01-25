const Deck = require('./Deck');
const crypto = require('crypto');

class Room {
    constructor(roomId) {
        this.roomId = roomId;
        this.maxPlayers = 4;

        // Players array: { id(uuid), name, seatIndex, isAdmin, lastSeen, connected }
        this.players = [];

        // Game State
        this.state = 'WAITING'; // WAITING, BIDDING, TRUMP_SELECTION, PLAYING, GAME_OVER
        this.deck = new Deck();

        // Round State
        this.hands = []; // Array of 4 hands (by seat index)
        this.bids = {}; // { playerId: bidAmount }
        this.currentBidder = null; // playerId
        this.winningBid = { playerId: null, amount: 0 };
        this.trump = null;
        this.kitty = [];
        this.buriedCards = [];

        // Trick State
        this.currentTrick = []; // [{playerId, card}, ...]
        this.turnIndex = 0; // 0-3, relative to seat index
        this.trickStarterIndex = 0;

        // Scores
        this.scores = {}; // { playerId: totalScore }
        this.roundScores = {}; // { playerId: tricksTaken }

        this.dealerIndex = 0;
        this.firstHand = true;
        this.roundBidStarterIndex = undefined;

        // Secure Joining
        this.seatCodes = {}; // { 1: '1234', ... }
        this.seats = [null, null, null, null]; // [PlayerObj, ...]

        // Helper to track timeouts (e.g. end of trick pause)
        this.pendingStateChange = null;
    }

    generateCode() {
        return Math.floor(1000 + Math.random() * 9000).toString();
    }

    // Returns { success, token, playerId, message }
    addPlayer(name, code, targetSeatIndex = -1) {
        // 1. First Player -> Admin (Create Room effectively)
        if (this.seats.every(s => s === null)) {
            const token = crypto.randomUUID();
            const player = {
                id: token,
                token: token, // Used for authentication
                name: name || `Admin`,
                seatIndex: 0,
                isAdmin: true,
                connected: true,
                lastSeen: Date.now()
            };
            this.seats[0] = player;
            this.players.push(player);
            this.scores[player.id] = 0;

            // Codes no longer used
            this.seatCodes = {};

            return { success: true, token, playerId: token, message: 'Room created. You are Admin.' };
        }

        // 2. Validate Seat (or Spectator)
        let seatToJoin = -1;
        let isSpectator = false;

        if (targetSeatIndex === -2) {
            isSpectator = true;
        } else if (targetSeatIndex !== -1) {
            // Explicit seat request
            if (targetSeatIndex < 0 || targetSeatIndex > 3) return { success: false, message: 'Invalid seat.' };
            seatToJoin = targetSeatIndex;
        } else {
            // Auto assign first empty seat
            seatToJoin = this.seats.findIndex(s => s === null);
            if (seatToJoin === -1) return { success: false, message: 'Room is full.' };
        }

        // 3. Join or Reconnect
        // If Spectator, we just add them to players list.
        if (isSpectator) {
            const token = crypto.randomUUID();
            const newPlayer = {
                id: token,
                token: token,
                name: name || `Izleyici`,
                seatIndex: -1, // -1 or -2 to indicate spectator
                isAdmin: false,
                connected: true,
                lastSeen: Date.now(),
                isSpectator: true
            };
            this.players.push(newPlayer);
            return { success: true, token, playerId: token, message: 'Joined as Spectator.' };
        }

        const existingPlayer = this.seats[seatToJoin];

        if (existingPlayer) {
            // Reconnect Logic
            // Only allow if Token matches? OR if using Code?
            // If explicit seat join (public) and someone is there:
            // - If connected: Fail "Seat taken".
            // - If disconnected: Allow takeover?

            if (existingPlayer.connected) {
                return { success: false, message: 'Seat accepted and occupied.' };
            }

            // Allow takeover of disconnected player
            const token = crypto.randomUUID();
            // Remove old player entry from players list
            this.players = this.players.filter(p => p.id !== existingPlayer.id);

            const newPlayer = {
                ...existingPlayer,
                id: token, // New ID/Token
                token: token,
                name: name || existingPlayer.name,
                connected: true,
                lastSeen: Date.now()
            };

            this.seats[seatToJoin] = newPlayer;
            this.players.push(newPlayer);

            // Map scores
            if (this.scores[existingPlayer.id] !== undefined) {
                this.scores[newPlayer.id] = this.scores[existingPlayer.id];
                delete this.scores[existingPlayer.id];
            }
            // Map round scores
            if (this.roundScores[existingPlayer.id] !== undefined) {
                this.roundScores[newPlayer.id] = this.roundScores[existingPlayer.id];
                delete this.roundScores[existingPlayer.id];
            }

            return { success: true, token, playerId: token, message: 'Reconnected.' };
        } else {
            // New Join to Empty Seat
            const token = crypto.randomUUID();
            const newPlayer = {
                id: token,
                token: token,
                name: name || `Player ${seatToJoin + 1}`,
                seatIndex: seatToJoin,
                isAdmin: false,
                connected: true,
                lastSeen: Date.now()
            };

            this.seats[seatToJoin] = newPlayer;
            this.players.push(newPlayer);
            this.scores[newPlayer.id] = 0;

            return { success: true, token, playerId: token, message: 'Joined.' };
        }
    }
    // Returns { success, message }
    removePlayer(playerId) {
        const pIndex = this.seats.findIndex(p => p?.id === playerId);
        if (pIndex === -1) return { error: 'Player not found in room' };

        const player = this.seats[pIndex];

        // Remove from seats
        this.seats[pIndex] = null;

        // Remove from players list
        this.players = this.players.filter(p => p.id !== playerId);

        // Remove scores (optional, but cleaner for full leave)
        delete this.scores[playerId];
        delete this.roundScores[playerId];

        // If game is in progress, this might break things. 
        // For now, we assume this is used in LOBBY (WAITING) state mostly.
        // If used during game, it's effectively a forfeit/disconnect.

        return { success: true, message: 'Left room' };
    }


    getPlayerState(playerId) {
        const player = this.players.find(p => p.id === playerId);
        if (!player) return null;

        // Update last seen
        player.lastSeen = Date.now();
        player.connected = true;

        // Check other players connectivity (timeout 5s)
        this.players.forEach(p => {
            if (Date.now() - p.lastSeen > 5000) p.connected = false;
        });

        const publicState = this.getPublicState();

        // Add private data
        const myHand = this.hands[player.seatIndex] || [];

        return {
            ...publicState,
            myHand: myHand,
            isMyTurn: publicState.currentTurn === playerId,
            me: {
                id: player.id,
                seatIndex: player.seatIndex,
                isAdmin: player.isAdmin
            }
        };
    }

    getPublicState() {
        return {
            roomId: this.roomId,
            players: this.seats.map((p, idx) => {
                if (!p) return null;
                return {
                    id: p.id,
                    name: p.name,
                    score: this.scores[p.id] || 0,
                    seatIndex: idx,
                    connected: p.connected,
                    isAdmin: p.isAdmin
                };
            }),
            seatCodes: this.seatCodes,
            state: this.state,
            currentTurn: this.seats[this.turnIndex]?.id,
            winningBid: this.winningBid,
            trump: this.trump,
            currentTrick: this.currentTrick,
            roundScores: this.roundScores,
            scores: this.scores,
            bids: this.bids,

            activeBidders: this.activeBidders,
            activeBidders: this.activeBidders,
            pendingStateChange: this.pendingStateChange,
            lastSound: this.lastSound
        };
    }

    broadcastSound(soundType, playerId) {
        this.lastSound = {
            id: crypto.randomUUID(),
            type: soundType,
            from: playerId,
            timestamp: Date.now()
        };
        return { success: true };
    }

    startGame() {
        if (this.state !== 'GAME_OVER' && this.state !== 'WAITING') return;

        // Enforce 4 Players
        const playerCount = this.seats.filter(p => p !== null).length;
        if (playerCount < 4) return { error: 'Not enough players' }; // Though this method is usually void, adding check logic.
        // Actually this method is called by the route handler which returns {success:true}.
        // If I return here, the route handler doesn't catch it unless I throw or specific return.
        // Route `api/rooms/:roomId/start` calls `room.startGame()`.
        // I should return a value that the route can use or just silently fail?
        // Let's silently fail for now to match current `if` style, OR update route?
        // The current code just checks state.

        // Let's return false/error if failed. But `start` route handler lines 116 just calls `room.startGame(); res.json(...)`.
        // So I can't easily bubble the error message up without changing the route handler too.
        // But preventing the state change is the core goal.


        this.state = 'BIDDING';
        this.deck.reset();
        const { hands, kitty } = this.deck.deal();
        this.hands = hands;
        this.kitty = kitty;
        this.buriedCards = [];

        this.roundScores = {};
        this.seats.forEach(p => {
            if (p) this.roundScores[p.id] = 0;
        });

        // Determine Starter
        let starterIndex = 0; // Relative to 0-3 seats

        if (this.firstHand) {
            // Club 2
            for (let i = 0; i < 4; i++) {
                const hasClub2 = this.hands[i].some(c => c.suit === '♣' && c.rank === '2');
                if (hasClub2) {
                    starterIndex = i;
                    break;
                }
            }
            this.firstHand = false;
        } else {
            starterIndex = (this.dealerIndex + 1) % 4;
        }

        this.turnIndex = starterIndex;
        // Starter implicitly bids 4
        // Note: We need a valid player at this seat
        const starter = this.seats[starterIndex];
        if (starter) {
            this.winningBid = { playerId: starter.id, amount: 4 };
            this.roundBidStarterIndex = starterIndex;
        }

        this.bids = {};
        this.activeBidders = this.seats.filter(p => p !== null).map(p => p.id);
    }

    bid(playerId, amount) {
        if (this.state !== 'BIDDING') return { error: 'Not bidding phase' };

        const currentPlayer = this.seats[this.turnIndex];
        if (!currentPlayer || currentPlayer.id !== playerId) return { error: 'Not your turn' };

        if (!this.activeBidders) this.activeBidders = this.players.map(p => p.id);

        if (amount === 0) { // Pass
            this.activeBidders = this.activeBidders.filter(id => id !== playerId);
        } else {
            const minBid = this.winningBid.amount > 0 ? this.winningBid.amount + 1 : 5;
            if (amount < minBid) return { error: 'Bid too low' };
            this.winningBid = { playerId, amount };
        }

        // Next Bidder
        let nextIndex = (this.turnIndex + 1) % 4;
        let loopCount = 0;
        // Find next active bidder
        while (loopCount < 5) {
            const p = this.seats[nextIndex];
            if (p && this.activeBidders.includes(p.id)) {
                break;
            }
            nextIndex = (nextIndex + 1) % 4;
            loopCount++;
        }

        // Check if finished
        const activeCount = this.activeBidders.length;
        if (activeCount === 0 || (activeCount === 1 && this.activeBidders[0] === this.winningBid.playerId)) {
            // Bidding Over
            this.state = 'TRUMP_SELECTION';
            // Winner starts the game
            const winnerId = this.winningBid.playerId;
            const winnerSeat = this.seats.findIndex(p => p?.id === winnerId);
            this.turnIndex = winnerSeat;
            this.currentBidder = winnerId;
            return { success: true };
        }

        this.turnIndex = nextIndex;
        return { success: true };
    }

    exchangeCards(playerId, cardsToBury) {
        if (this.state !== 'EXCHANGE_CARDS') return { error: 'Wrong phase' };
        if (playerId !== this.winningBid.playerId) return { error: 'Not your bid' };

        // Support for Gömü Skip (Pas)
        if (!cardsToBury || cardsToBury.length === 0) {
            // Player chose not to take the kitty.
            // Kitty remains unused.
            this.state = 'PLAYING';
            return { success: true, message: 'Gömü skipped' };
        }

        if (cardsToBury.length !== 4) return { error: 'Must bury 4 cards' };

        const pIndex = this.seats.findIndex(p => p?.id === playerId);
        const currentHand = [...this.hands[pIndex]];
        const buried = [];

        for (const c of cardsToBury) {
            const idx = currentHand.findIndex(h => h.suit === c.suit && h.rank === c.rank);
            if (idx === -1) return { error: 'Card not in hand' };
            buried.push(currentHand[idx]);
            currentHand.splice(idx, 1);
        }

        const markedKitty = this.kitty.map(c => ({ ...c, fromKitty: true }));
        this.hands[pIndex] = [...currentHand, ...markedKitty];
        this.deck.sortHand(this.hands[pIndex]); // Sort helper

        this.state = 'PLAYING';
        return { success: true };
    }

    selectTrump(playerId, suit) {
        if (this.state !== 'TRUMP_SELECTION') return { error: 'Wrong phase' };
        if (playerId !== this.winningBid.playerId) return { error: 'Not your turn' };

        this.trump = suit;
        this.state = 'EXCHANGE_CARDS';
        this.currentTrick = [];

        // Turn stays with bidder
        return { success: true };
    }

    playCard(playerId, card) {
        if (this.state !== 'PLAYING') return { error: 'Not playing' };

        // Prevent playing if resolving previous trick
        if (this.currentTrick.length >= 4) return { error: 'Trick resolving, please wait' };

        const pIndex = this.seats.findIndex(p => p?.id === playerId);
        if (this.turnIndex !== pIndex) return { error: 'Not your turn' };

        const hand = this.hands[pIndex];
        const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
        if (cardIndex === -1) return { error: 'Card not in hand' };

        // Validation logic - reusing logic from original but simplified adapted
        if (!this.isValidMove(hand, card, this.currentTrick)) {
            return { error: 'Invalid Move' };
        }

        // Execute Move
        hand.splice(cardIndex, 1);
        this.currentTrick.push({ playerId, card });

        if (this.currentTrick.length === 4) {
            this.resolveTrick();
        } else {
            this.turnIndex = (this.turnIndex + 1) % 4;
        }

        return { success: true };
    }

    // Copied from old Room.js, kept helper methods
    getRankVal(r) {
        const map = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11 };
        return map[r] || parseInt(r);
    }

    isValidMove(hand, card, currentTrick) {
        if (currentTrick.length === 0) return true;

        const leadCard = currentTrick[0].card;
        const leadSuit = leadCard.suit;
        const trumpSuit = this.trump;

        const getVal = (c) => this.getRankVal(c.rank);
        const hasLeadSuit = hand.some(c => c.suit === leadSuit);

        if (hasLeadSuit) {
            // Must follow suit
            if (card.suit !== leadSuit) return false;
            // Must raise?
            const isTrumped = currentTrick.some(m => m.card.suit === trumpSuit);
            if (!isTrumped || leadSuit === trumpSuit) {
                let maxTableVal = 0;
                currentTrick.forEach(m => {
                    if (m.card.suit === leadSuit) maxTableVal = Math.max(maxTableVal, getVal(m.card));
                });
                const myMaxVal = hand.filter(c => c.suit === leadSuit).reduce((max, c) => Math.max(max, getVal(c)), 0);
                if (myMaxVal > maxTableVal) {
                    if (getVal(card) <= maxTableVal) return false; // Must raise
                }
            }
            return true;
        } else {
            // Void lead suit
            const hasTrump = hand.some(c => c.suit === trumpSuit);
            if (hasTrump) {
                // Must play trump
                if (card.suit !== trumpSuit) return false;
                // Must raise trump?
                const playedTrumps = currentTrick.filter(m => m.card.suit === trumpSuit);
                if (playedTrumps.length > 0) {
                    let maxTrumpVal = 0;
                    playedTrumps.forEach(m => maxTrumpVal = Math.max(maxTrumpVal, getVal(m.card)));
                    const myMaxTrump = hand.filter(c => c.suit === trumpSuit).reduce((max, c) => Math.max(max, getVal(c)), 0);
                    if (myMaxTrump > maxTrumpVal) {
                        if (getVal(card) <= maxTrumpVal) return false;
                    }
                }
                return true;
            }
            return true;
        }
    }

    resolveTrick() {
        // Determine winner (simplified logic for brevity, assuming standard Batak)
        let winnerIndex = 0; // Relative to trick array (0..3)
        let highestCard = this.currentTrick[0].card;
        const leadSuit = highestCard.suit;
        const getRankVal = this.getRankVal;

        for (let i = 1; i < 4; i++) {
            const pCard = this.currentTrick[i].card;

            if (pCard.suit === this.trump) {
                // If new card is Trump
                if (highestCard.suit !== this.trump) {
                    // Previous winner wasn't trump, so this wins
                    highestCard = pCard;
                    winnerIndex = i;
                } else {
                    // Both trumps, higher rank wins
                    if (getRankVal(pCard.rank) > getRankVal(highestCard.rank)) {
                        highestCard = pCard;
                        winnerIndex = i;
                    }
                }
            } else if (pCard.suit === leadSuit) {
                // If new card is Lead Suit (and NOT Trump)
                // It can only win if the current highest is ALSO not a Trump
                if (highestCard.suit !== this.trump) {
                    if (getRankVal(pCard.rank) > getRankVal(highestCard.rank)) {
                        highestCard = pCard;
                        winnerIndex = i;
                    }
                }
            }
        }

        const winnerId = this.currentTrick[winnerIndex].playerId;
        this.roundScores[winnerId] = (this.roundScores[winnerId] || 0) + 1;

        // Delay clearing trick to allow polling clients to see it
        // In a polling architecture, we can leave the trick on the table for X seconds
        // However, the client needs to know IF the trick is "done".
        // We can use a timestamp or a specific "resolving" state.
        // Simplest for now: Clear it immediately, but keep a "lastTrick" field?
        // OR better: Clients see currentTrick full (length 4), they animate, then they request again and see it empty.
        // The server needs to HOLD the state of length 4 for a short duration?
        // NO. The server should advance. The Client can see "Who played the 4th card" and infer the trick is over.
        // BUT if the server clears it immediately, the client might MISS the 4th card if they poll at the wrong time.

        // SOLUTION: Use a `lastTrick` object in state, or keep `currentTrick` full until the next player plays?
        // Standard Polling Pattern:
        // 1. Player 4 plays. `currentTrick` has 4 cards.
        // 2. `resolveTrick` is scheduled (setTimeout).
        // 3. During timeout, clients poll and see 4 cards. They animate.
        // 4. Timeout fires. `currentTrick` cleared. `turnIndex` updated.

        // So we CAN use setTimeout here, but it must NOT depend on IO.

        // Mark that we are resolving.
        // Effectively freezing the game state for 2 seconds.

        this.pendingStateChange = Date.now() + 2000;

        setTimeout(() => {
            this.currentTrick = [];
            this.pendingStateChange = null;

            // Update turn to winner
            const winnerSeat = this.seats.findIndex(p => p?.id === winnerId);
            this.turnIndex = winnerSeat;

            // Check Round End
            const totalTricks = Object.values(this.roundScores).reduce((a, b) => a + b, 0);
            if (totalTricks === 12) { // 12 tricks (48 cards played)
                this.endRound();
            }
        }, 2000);
    }

    endRound() {
        // Scoring Logic (Simplified)
        const bidderId = this.winningBid.playerId;
        const bid = this.winningBid.amount;
        const took = this.roundScores[bidderId] || 0;

        let bidderScore = 0;
        if (took >= bid) bidderScore = took; // New Logic: Get score equal to tricks taken
        else bidderScore = -bid;

        const previousScore = this.scores[bidderId] || 0;
        this.scores[bidderId] += bidderScore;

        this.seats.forEach(p => {
            if (p && p.id !== bidderId) {
                const t = this.roundScores[p.id] || 0;
                if (t === 0) this.scores[p.id] -= bid; // Side batak
                else this.scores[p.id] += t;
            }
        });

        // Check Winner
        let winner = null;

        // Auto Win Condition: Bid 11 or 12, Score >= 0 (before round), and made the bid
        if (bid >= 11 && previousScore >= 0 && took >= bid) {
            winner = bidderId;
        }

        if (!winner) {
            for (const [pid, score] of Object.entries(this.scores)) {
                if (score >= 51) winner = pid;
            }
        }

        if (winner) {
            this.state = 'GAME_OVER';
            return;
        }

        // Rotate Dealer
        this.dealerIndex = (this.dealerIndex + 1) % 4;

        // Auto Restart? Or Wait?
        // Let's go to SCORING state (Game Over / Round Over Summary)
        this.state = 'WAITING';

        // Use timeout to auto-restart or let Admin start?
        // Let's assume Admin starts next round or auto after delay.
        setTimeout(() => {
            this.startGame();
        }, 5000);
    }

    requestRedeal(playerId) {
        if (this.state !== 'BIDDING') return { error: 'Sadece ihale sırasında bozulabilir' };

        const pIndex = this.seats.findIndex(p => p?.id === playerId);
        const hand = this.hands[pIndex];
        if (!hand) return { error: 'El bulunamadı' };

        const strongCards = ['A', 'K', 'Q', 'J'];
        const hasStrong = hand.some(c => strongCards.includes(c.rank));

        if (hasStrong) return { error: 'Elinizde güçlü kart var, bozamazsınız' };

        // Valid claim, redeal
        // User requested: "if redeal is requested the dealer shifts one position too"
        this.dealerIndex = (this.dealerIndex + 1) % 4;
        this.startGame();
        return { success: true, message: 'El bozuldu, yeniden dağıtılıyor...' };
    }
}

module.exports = Room;
