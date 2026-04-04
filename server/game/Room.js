const Deck = require('./Deck');
const crypto = require('crypto');

class Room {
    constructor(roomId, winningScore = 51) {
        this.roomId = roomId;
        this.winningScore = parseInt(winningScore) || 51;
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
        this.kittySkipped = false;

        // Trick State
        this.currentTrick = []; // [{playerId, card}, ...]
        this.playedCardsHistory = []; // all completed tricks: [{playerId, card}, ...]
        this.turnIndex = 0; // 0-3, relative to seat index
        this.trickStarterIndex = 0;

        // Scores
        this.scores = {}; // { playerId: totalScore }
        this.roundScores = {}; // { playerId: tricksTaken }

        this.dealerIndex = 0;
        this.firstHand = true;
        this.roundBidStarterIndex = undefined;

        this.seats = [null, null, null, null]; // [PlayerObj, ...]

        // Helper to track timeouts (e.g. end of trick pause)
        this.pendingStateChange = null;
        this.pendingBotDecisions = {}; // { seatIndex: true } when bot decision is in flight
        this.lastSound = null;
        this.lastEvent = null;
        this.lastRoundSummary = null;
        this.autopilotPlayers = new Set(); // playerIds of human players in autopilot mode
    }

    isValidCard(card) {
        const VALID_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        const VALID_SUITS = ['♠', '♥', '♦', '♣'];
        if (!card) return false;
        if (!VALID_SUITS.includes(card.suit)) return false;
        if (!VALID_RANKS.includes(card.rank)) return false;
        return true;
    }

    validateDeckIntegrity() {
        const allCards = [];
        this.hands.forEach(hand => allCards.push(...hand));
        allCards.push(...this.kitty);
        allCards.push(...this.buriedCards);
        this.currentTrick.forEach(p => allCards.push(p.card));

        const seen = new Set();
        const duplicates = [];
        const invalid = [];

        allCards.forEach(c => {
            if (!this.isValidCard(c)) {
                invalid.push(c);
            }
            const key = `${c.suit}${c.rank}`;
            if (seen.has(key)) {
                duplicates.push(key);
            }
            seen.add(key);
        });

        if (duplicates.length > 0) {
            console.error(`CRITICAL [Room ${this.roomId}]: Duplicate cards found:`, duplicates);
        }
        if (invalid.length > 0) {
            console.error(`CRITICAL [Room ${this.roomId}]: Invalid cards found:`, invalid);
        }

        return { valid: duplicates.length === 0 && invalid.length === 0, duplicates, invalid };
    }

    generateCode() {
        return Math.floor(1000 + Math.random() * 9000).toString();
    }

    resolveToken(token) {
        if (!token) return null;
        const player = this.players.find(p => p.token === token);
        return player ? player.id : null;
    }

    // Returns { success, token, playerId, message }
    addPlayer(name, code, targetSeatIndex = -1) {
        // 1. First Player -> Admin (Create Room effectively)
        if (this.seats.every(s => s === null)) {
            const id = crypto.randomUUID();
            const token = crypto.randomUUID();
            const player = {
                id: id,
                token: token, // Used for authentication (never exposed publicly)
                name: name || `Admin`,
                seatIndex: 0,
                isAdmin: true,
                connected: true,
                lastSeen: Date.now()
            };
            this.seats[0] = player;
            this.players.push(player);
            this.scores[player.id] = 0;

            return { success: true, token, playerId: id, message: 'Room created. You are Admin.' };
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
            const id = crypto.randomUUID();
            const token = crypto.randomUUID();
            const newPlayer = {
                id: id,
                token: token,
                name: name || `Izleyici`,
                seatIndex: -1, // -1 or -2 to indicate spectator
                isAdmin: false,
                connected: true,
                lastSeen: Date.now(),
                isSpectator: true
            };
            this.players.push(newPlayer);
            return { success: true, token, playerId: id, message: 'Joined as Spectator.' };
        }

        const existingPlayer = this.seats[seatToJoin];

        if (existingPlayer) {
            // Bot takeover — always allowed
            if (existingPlayer.isBot) {
                const id = crypto.randomUUID();
                const token = crypto.randomUUID();
                this.players = this.players.filter(p => p.id !== existingPlayer.id);
                const newPlayer = {
                    id,
                    token,
                    name: name || `Player ${seatToJoin + 1}`,
                    seatIndex: seatToJoin,
                    isAdmin: existingPlayer.isAdmin,
                    connected: true,
                    lastSeen: Date.now()
                };
                this.seats[seatToJoin] = newPlayer;
                this.players.push(newPlayer);
                if (this.scores[existingPlayer.id] !== undefined) {
                    this.scores[newPlayer.id] = this.scores[existingPlayer.id];
                    delete this.scores[existingPlayer.id];
                }
                if (this.roundScores[existingPlayer.id] !== undefined) {
                    this.roundScores[newPlayer.id] = this.roundScores[existingPlayer.id];
                    delete this.roundScores[existingPlayer.id];
                }
                // Migrate bidding state
                if (this.winningBid?.playerId === existingPlayer.id) {
                    this.winningBid = { ...this.winningBid, playerId: newPlayer.id };
                }
                if (this.currentBidder === existingPlayer.id) {
                    this.currentBidder = newPlayer.id;
                }
                if (this.activeBidders) {
                    this.activeBidders = this.activeBidders.map(id => id === existingPlayer.id ? newPlayer.id : id);
                }
                if (this.bids[existingPlayer.id] !== undefined) {
                    this.bids[newPlayer.id] = this.bids[existingPlayer.id];
                    delete this.bids[existingPlayer.id];
                }
                // Migrate current trick
                this.currentTrick = this.currentTrick.map(entry =>
                    entry.playerId === existingPlayer.id
                        ? { ...entry, playerId: newPlayer.id }
                        : entry
                );
                this.lastEvent = { id: crypto.randomUUID(), type: 'bot_replaced', seatIndex: seatToJoin, newName: newPlayer.name };
                return { success: true, token, playerId: id, message: 'Bot seat taken over.' };
            }

            // Reconnect Logic
            // Only allow if Token matches? OR if using Code?
            // If explicit seat join (public) and someone is there:
            // - If connected: Fail "Seat taken".
            // - If disconnected: Allow takeover?

            if (existingPlayer.connected) {
                return { success: false, message: 'Seat accepted and occupied.' };
            }

            // Allow takeover of disconnected player
            const id = crypto.randomUUID();
            const token = crypto.randomUUID();
            // Remove old player entry from players list
            this.players = this.players.filter(p => p.id !== existingPlayer.id);

            const newPlayer = {
                ...existingPlayer,
                id: id,
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

            return { success: true, token, playerId: id, message: 'Reconnected.' };
        } else {
            // New Join to Empty Seat
            const id = crypto.randomUUID();
            const token = crypto.randomUUID();
            const newPlayer = {
                id: id,
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

            return { success: true, token, playerId: id, message: 'Joined.' };
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
        this.autopilotPlayers.delete(playerId);

        // If game is in progress, this might break things. 
        // For now, we assume this is used in LOBBY (WAITING) state mostly.
        // If used during game, it's effectively a forfeit/disconnect.

        return { success: true, message: 'Left room' };
    }

    addBotPlayer(targetSeatIndex) {
        if (this.state !== 'WAITING') return { error: 'Can only add bot in WAITING state' };
        if (targetSeatIndex < 0 || targetSeatIndex > 3) return { error: 'Invalid seat' };
        if (this.seats[targetSeatIndex] !== null) return { error: 'Seat is taken' };

        const botCount = this.seats.filter(s => s?.isBot).length;
        const id = crypto.randomUUID();
        const token = crypto.randomUUID();
        const botPlayer = {
            id,
            token,
            name: `Bot ${botCount + 1}`,
            seatIndex: targetSeatIndex,
            isAdmin: false,
            isBot: true,
            connected: true,
            lastSeen: Date.now()
        };

        this.seats[targetSeatIndex] = botPlayer;
        this.players.push(botPlayer);
        this.scores[botPlayer.id] = 0;

        console.log(`[ROOM ${this.roomId}] Bot "${botPlayer.name}" added to seat ${targetSeatIndex}`);
        return { success: true, botName: botPlayer.name };
    }

    checkBotTurn() {
        if (this.pendingStateChange) return; // Trick is resolving, wait
        const currentPlayer = this.seats[this.turnIndex];
        if (!currentPlayer) return;
        const isAutopilot = this.autopilotPlayers.has(currentPlayer.id);
        if (!currentPlayer.isBot && !isAutopilot) return;
        if (this.pendingBotDecisions[this.turnIndex]) return; // Already scheduled

        const { botDecide } = require('./BotPlayer');
        const seatIndex = this.turnIndex;
        this.pendingBotDecisions[seatIndex] = true;
        const delay = isAutopilot ? 1500 : 1000; // slight extra delay for autopilot so it feels less robotic
        setTimeout(() => {
            delete this.pendingBotDecisions[seatIndex];
            botDecide(this, seatIndex);
        }, delay);
    }

    toggleAutopilot(playerId) {
        const player = this.seats.find(s => s?.id === playerId);
        if (!player || player.isBot) return { error: 'Not a valid player' };
        if (this.state !== 'PLAYING') return { error: 'Autopilot only available during play' };

        if (this.autopilotPlayers.has(playerId)) {
            this.autopilotPlayers.delete(playerId);
            console.log(`[AUTOPILOT] ${player.name} disabled autopilot`);
            return { success: true, autopilot: false };
        } else {
            this.autopilotPlayers.add(playerId);
            console.log(`[AUTOPILOT] ${player.name} enabled autopilot`);
            // Trigger immediately if it's their turn
            this.checkBotTurn();
            return { success: true, autopilot: true };
        }
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
                isAdmin: player.isAdmin,
                isAutopilot: this.autopilotPlayers.has(playerId)
            }
        };
    }

    getPublicState() {
        return {
            roomId: this.roomId,
            winningScore: this.winningScore,
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
            state: this.state,
            currentTurn: this.seats[this.turnIndex]?.id,
            winningBid: this.winningBid,
            trump: this.trump,
            currentTrick: this.currentTrick,
            roundScores: this.roundScores,
            scores: this.scores,
            bids: this.bids,

            activeBidders: this.activeBidders,
            pendingStateChange: this.pendingStateChange,
            lastSound: this.lastSound,
            lastEvent: this.lastEvent,
            lastRoundSummary: this.lastRoundSummary,
            kittySkipped: this.kittySkipped,
            // Only reveal buried cards after the round ends — hide during PLAYING
            buriedCards: (this.state === 'WAITING' || this.state === 'GAME_OVER') ? this.buriedCards : []
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
        if (playerCount < 4) return;

        this.state = 'BIDDING';
        this.trump = null;
        this.buriedCards = [];
        this.kittySkipped = false;
        this.playedCardsHistory = [];

        const strongCards = ['A', 'K', 'Q', 'J'];
        let starterIndex = 0;
        let isFirstDeal = this.firstHand;

        // Auto-redeal if bid starter has no strong cards (rotate dealer each attempt)
        for (let attempt = 0; attempt < 10; attempt++) {
            if (attempt > 0) {
                this.dealerIndex = (this.dealerIndex + 1) % 4;
            }

            this.deck.reset();
            const { hands, kitty } = this.deck.deal();
            this.hands = hands;
            this.kitty = kitty;

            if (isFirstDeal) {
                for (let i = 0; i < 4; i++) {
                    if (this.hands[i].some(c => c.suit === '♣' && c.rank === '2')) {
                        starterIndex = i;
                        break;
                    }
                }
                isFirstDeal = false;
                this.firstHand = false;
            } else {
                starterIndex = (this.dealerIndex + 1) % 4;
            }

            if (this.hands.every(hand => hand.some(c => strongCards.includes(c.rank)))) break;
        }

        this.validateDeckIntegrity();

        this.roundScores = {};
        this.seats.forEach(p => {
            if (p) this.roundScores[p.id] = 0;
        });

        this.turnIndex = starterIndex;
        const starter = this.seats[starterIndex];
        if (starter) {
            this.winningBid = { playerId: starter.id, amount: 4 };
            this.roundBidStarterIndex = starterIndex;
        }

        this.bids = {};
        this.activeBidders = this.seats.filter(p => p !== null).map(p => p.id);
        this.checkBotTurn();
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
            this.checkBotTurn();
            return { success: true };
        }

        this.turnIndex = nextIndex;
        this.checkBotTurn();
        return { success: true };
    }

    exchangeCards(playerId, cardsToBury) {
        if (this.state !== 'EXCHANGE_CARDS') return { error: 'Wrong phase' };
        if (playerId !== this.winningBid.playerId) return { error: 'Not your bid' };

        // Support for Gömü Skip (Pas)
        if (!cardsToBury || cardsToBury.length === 0) {
            // Player chose not to take the kitty.
            // Kitty remains unused.
            this.kittySkipped = true;
            this.state = 'PLAYING';
            this.checkBotTurn();
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

        // Critical Fix: Clear kitty so cards are not duplicated in room state
        this.kitty = [];
        // Critical Fix: Store buried cards
        this.buriedCards = buried;

        const integrity = this.validateDeckIntegrity();
        if (!integrity.valid) {
            console.error(`[CRITICAL] Deck Integrity Failed after exchange! Room: ${this.roomId}`, integrity);
            // Force recovery? Or just let it fail loud?
        }

        this.state = 'PLAYING';
        this.checkBotTurn();
        return { success: true };
    }

    selectTrump(playerId, suit) {
        if (this.state !== 'TRUMP_SELECTION') return { error: 'Wrong phase' };
        if (playerId !== this.winningBid.playerId) return { error: 'Not your turn' };

        this.trump = suit;
        this.state = 'EXCHANGE_CARDS';
        this.currentTrick = [];

        // Turn stays with bidder
        this.checkBotTurn();
        return { success: true };
    }

    playCard(playerId, card) {
        if (this.state !== 'PLAYING') return { error: 'Not playing' };

        // Input Validation
        if (!this.isValidCard(card)) {
            console.error(`[INVALID INPUT] Player ${playerId} sent invalid card:`, card);
            return { error: 'Invalid card data' };
        }

        // Prevent playing if resolving previous trick
        if (this.currentTrick.length >= 4) return { error: 'Trick resolving, please wait' };

        const pIndex = this.seats.findIndex(p => p?.id === playerId);
        if (this.turnIndex !== pIndex) return { error: 'Not your turn' };

        const hand = this.hands[pIndex];
        const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
        if (cardIndex === -1) return { error: 'Card not in hand' };

        // Validation logic - reusing logic from original but simplified adapted
        if (!this.isValidMove(hand, card, this.currentTrick)) {
            console.log(`[INVALID MOVE] Player: ${playerId} (${this.seats[pIndex]?.name})`);
            console.log(`[INVALID MOVE] Card Attempted: ${card.suit}${card.rank}`);
            console.log(`[INVALID MOVE] Current Trick:`, JSON.stringify(this.currentTrick.map(t => `${t.card.suit}${t.card.rank}`)));
            console.log(`[INVALID MOVE] Trump: ${this.trump}`);
            console.log(`[INVALID MOVE] Player Hand:`, JSON.stringify(hand.map(c => `${c.suit}${c.rank}`)));
            // Extended logging as requested: All players' hands
            this.seats.forEach((seat, idx) => {
                const h = this.hands[idx];
                if (seat && h) {
                    console.log(`[INVALID MOVE] ${seat.name} Hand:`, JSON.stringify(h.map(c => `${c.suit}${c.rank}`)));
                }
            });

            return { error: 'Invalid Move' };
        }

        // Execute Move
        hand.splice(cardIndex, 1);
        this.currentTrick.push({ playerId, card });

        if (this.currentTrick.length === 4) {
            this.resolveTrick();
            // checkBotTurn is called inside resolveTrick's setTimeout
        } else {
            this.turnIndex = (this.turnIndex + 1) % 4;
            this.checkBotTurn();
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
            this.playedCardsHistory.push(...this.currentTrick);
            this.currentTrick = [];
            this.pendingStateChange = null;

            // Update turn to winner
            const winnerSeat = this.seats.findIndex(p => p?.id === winnerId);
            this.turnIndex = winnerSeat;

            // Check Round End
            const totalTricks = Object.values(this.roundScores).reduce((a, b) => a + b, 0);
            if (totalTricks === 12) {
                this.endRound();
            } else {
                this.checkBotTurn();
            }
        }, 2000);

        // winnerIndex is 0-3 relative to the trick array order? No, wait.
        // In resolveTrick logic:
        // let winnerIndex = 0; // Relative to trick array (0..3)
        // ...
        // const winnerId = this.currentTrick[winnerIndex].playerId;

        console.log(`[TRICK COMPLETED] Winner: ${this.players.find(p => p.id === winnerId)?.name} (${winnerId})`);
        console.log(`[TRICK COMPLETED] Cards:`, JSON.stringify(this.currentTrick.map(t => `${t.card.suit}${t.card.rank} (${this.players.find(p => p.id === t.playerId)?.name})`)));
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

        // Build round summary (scores already updated above)
        this.lastRoundSummary = {
            bid,
            tricksTaken: took,
            bidSuccess: took >= bid,
            bidderName: this.seats.find(p => p?.id === bidderId)?.name || '?',
            players: this.seats.filter(Boolean).map(p => {
                const tricks = this.roundScores[p.id] || 0;
                const isBidder = p.id === bidderId;
                const delta = isBidder ? bidderScore : (tricks === 0 ? -bid : tricks);
                return {
                    name: p.name,
                    tricks,
                    delta,
                    totalScore: this.scores[p.id] || 0,
                    isBidder,
                    batak: !isBidder && tricks === 0
                };
            })
        };

        // Check Winner
        let winner = null;

        // Auto Win Condition: Bid 11 or 12, Score >= 0 (before round), and made the bid
        if (bid >= 11 && previousScore >= 0 && took >= bid) {
            winner = bidderId;
        }

        if (!winner) {
            for (const [pid, score] of Object.entries(this.scores)) {
                if (score >= this.winningScore) winner = pid;
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

    restartGame() {
        // Reset Scores
        this.scores = {};
        this.seats.forEach(p => {
            if (p) this.scores[p.id] = 0;
        });

        // Reset Round State
        this.roundScores = {};
        this.bids = {};
        this.currentBidder = null;
        this.winningBid = { playerId: null, amount: 0 };
        this.trump = null;
        this.kitty = [];
        this.buriedCards = [];
        this.currentTrick = [];
        this.hands = [];

        // Reset Game State
        this.state = 'WAITING';
        this.dealerIndex = 0;
        this.firstHand = true;

        return { success: true, message: 'Game restarted.' };
    }
}

module.exports = Room;
