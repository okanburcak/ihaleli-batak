const Deck = require('./Deck');

class Room {
    constructor(roomId, io) {
        this.roomId = roomId;
        this.io = io;
        this.maxPlayers = 4;
        this.players = []; // Array of socket objects (or lightweight player objects)

        // Game State
        this.state = 'WAITING'; // WAITING, BIDDING, TRUMP_SELECTION, PLAYING, GAME_OVER
        this.deck = new Deck();

        // Round State
        this.hands = []; // Array of 4 hands
        this.bids = {}; // { playerId: bidAmount }
        this.currentBidder = null; // playerId who is currently bidding
        this.winningBid = { playerId: null, amount: 0 };
        this.trump = null;

        // Trick State (El)
        this.currentTrick = []; // [{playerId, card}, ...]
        this.turnIndex = 0; // 0-3, relative to players array
        this.trickStarterIndex = 0; // Who started the current trick

        // Scores
        this.scores = {}; // { playerId: totalScore }
        this.roundScores = {}; // { playerId: tricksTaken }

        this.dealerIndex = 0; // Track dealer for rotation
        this.firstHand = true; // Track if it's the first hand

        // Secure Joining State
        this.adminSocketId = null;
        this.seatCodes = {}; // { 1: '1234', 2: '5678', 3: '9012' } (Seat 0 is Admin)
        this.seats = [null, null, null, null]; // [PlayerObj, PlayerObj, null, null]
    }

    generateCode() {
        return Math.floor(1000 + Math.random() * 9000).toString();
    }

    addPlayer(socket, name, code) {
        // 1. First Player -> Admin
        if (this.seats.every(s => s === null)) {
            this.adminSocketId = socket.id;
            const player = {
                id: socket.id,
                name: name || `Admin`,
                socket: socket,
                seatIndex: 0,
                isAdmin: true
            };
            this.seats[0] = player;
            this.players.push(player);

            // Generate codes for other 3 seats
            this.seatCodes = {
                1: this.generateCode(),
                2: this.generateCode(),
                3: this.generateCode()
            };

            this.io.to(this.roomId).emit('player_joined', this.getPublicState());
            return { success: true, message: 'Room created. You are Admin.' };
        }

        // 2. Subsequent Players -> Code Validation
        // Check if reconnecting (same code) OR joining new seat
        let targetSeatIndex = -1;

        // Find which seat has this code
        for (const [seatIdx, roomCode] of Object.entries(this.seatCodes)) {
            if (roomCode === code) {
                targetSeatIndex = parseInt(seatIdx);
                break;
            }
        }

        if (targetSeatIndex === -1) {
            // Valid code not found?
            // Maybe it's the admin reconnecting? (Not strictly implemented via code, maybe just allow if seat 0 is empty?)
            // For now, strict code check for non-admin seats.
            return { success: false, message: 'Invalid or incorrect code.' };
        }

        // 3. Assign or Reconnect
        const existingPlayer = this.seats[targetSeatIndex];

        if (existingPlayer) {
            // Seat is occupied. Is it a reconnection?
            // If the socket is disconnected/gone, we replace it.
            // Simplified: Always allow replace if code matches (implies ownership).

            // Remove old socket logic reference from this.players
            this.players = this.players.filter(p => p.id !== existingPlayer.id);

            // Create new player object
            const newPlayer = {
                id: socket.id,
                name: name || existingPlayer.name, // Keep old name or use new
                socket: socket,
                seatIndex: targetSeatIndex,
                isAdmin: false
            };

            this.seats[targetSeatIndex] = newPlayer;
            this.players.push(newPlayer);

            // Re-emit state
            this.io.to(this.roomId).emit('player_joined', this.getPublicState());

            // If game in progress, send hand etc (Reconnection Logic needed here)
            if (this.state !== 'WAITING') {
                // Send current hand
                const hand = this.hands[targetSeatIndex];
                if (hand) socket.emit('deal_hand', hand);
            }

            return { success: true, message: 'Reconnected successfully.' };

        } else {
            // Open Seat
            const newPlayer = {
                id: socket.id,
                name: name || `Player ${targetSeatIndex + 1}`,
                socket: socket,
                seatIndex: targetSeatIndex,
                isAdmin: false
            };

            this.seats[targetSeatIndex] = newPlayer;
            this.players.push(newPlayer);

            this.io.to(this.roomId).emit('player_joined', this.getPublicState());

            if (this.players.length === this.maxPlayers) {
                // Wait for Admin to start? Or auto start? User request: "admin starts the room"
                // So we do NOT auto start.
            }

            return { success: true, message: 'Joined successfully.' };
        }
    }

    removePlayer(socketId) {
        // We don't fully remove anymore to allow reconnection via code.
        // Just mark as disconnected visually?
        // For 'players' array, we might keep them or filter.
        // Current logic relies on 'players' for game flow. 
        // We should just update the socket reference or connectivity status.

        const player = this.players.find(p => p.id === socketId);
        if (player) {
            // We keep them in this.seats!
            // Just remove from active socket list?
            // Actually, verify connection status in UI.

            // For now, let's just emit player_left to update UI status
            this.io.to(this.roomId).emit('player_left', this.getPublicState());
        }
    }

    startGame() {
        this.state = 'BIDDING';
        this.deck.reset();
        const { hands, kitty } = this.deck.deal();
        this.hands = hands;
        this.kitty = kitty;
        this.buriedCards = []; // Reset buried cards

        // Send hands to players appropriately (don't reveal others' cards)
        this.players.forEach((player, index) => {
            player.socket.emit('deal_hand', this.hands[index]);
            // Init scores if first game
            if (!this.scores[player.id]) this.scores[player.id] = 0;
            this.roundScores[player.id] = 0;
        });

        // Initialize Bidding
        this.bids = {};

        // Determine who starts bidding
        // RULE: First hand, player with 2 of Clubs starts.
        // Subsequent hands: Rotate (dealer + 1)

        let starterIndex = 0;

        if (this.firstHand) {
            // Find who has Club 2 (♣ 2)
            // Loop through hands
            let found = false;
            for (let i = 0; i < 4; i++) {
                const hasClub2 = this.hands[i].some(c => c.suit === '♣' && c.rank === '2');
                if (hasClub2) {
                    starterIndex = i;
                    found = true;
                    break;
                }
            }
            // Fallback if Club 2 is in Kitty (very rare but possible with 4 kitty cards)
            if (!found) {
                starterIndex = (this.dealerIndex + 1) % 4;
            }
            this.firstHand = false;
        } else {
            starterIndex = (this.dealerIndex + 1) % 4;
        }

        // Bidding starts from starterIndex
        this.turnIndex = starterIndex;

        // RULE: Starter has the bid at 4 initially.
        const starter = this.players[starterIndex];
        this.winningBid = { playerId: starter.id, amount: 4 };

        // Save who started bidding for next dealer rotation
        this.roundBidStarterIndex = starterIndex;

        // Make sure activeBidders are reset
        this.activeBidders = this.players.map(p => p.id);

        this.notifyStateChange();
        this.askForBid();
    }

    roomId: this.roomId,
    players: this.seats.map((p, idx) => {
        if (!p) return null;
        return {
            id: p.id,
            name: p.name,
            score: this.scores[p.id] || 0,
            seatIndex: idx,
            connected: p.socket.connected, // Check actual socket
            isAdmin: p.isAdmin
        };
    }),
seatCodes: this.seatCodes, // Only Admin should see this really, but for simplicity sending all (client filters)
    state: this.state,
        currentTurn: this.players[this.turnIndex]?.id,
            winningBid: this.winningBid,
                trump: this.trump,
                    currentTrick: this.currentTrick,
                        roundScores: this.roundScores,
                            scores: this.scores
        };
    }

notifyStateChange() {
    this.io.to(this.roomId).emit('state_update', this.getPublicState());
}

askForBid() {
    const player = this.players[this.turnIndex];
    this.io.to(this.roomId).emit('bid_turn', {
        playerId: player.id,
        minBid: this.winningBid.amount > 0 ? this.winningBid.amount + 1 : 5 // Start at 5
    });
}

handleBid(playerId, amount) {
    if (this.state !== 'BIDDING') return;
    if (this.players[this.turnIndex].id !== playerId) return;

    console.log(`Player ${playerId} bid ${amount}`);

    // Initialize active Bidders if not present
    if (!this.activeBidders) this.activeBidders = this.players.map(p => p.id);

    if (amount === 0) { // Pass
        this.activeBidders = this.activeBidders.filter(id => id !== playerId);
    } else {
        const minBid = this.winningBid.amount > 0 ? this.winningBid.amount + 1 : 5;
        if (amount < minBid) return;
        this.winningBid = { playerId, amount };
    }

    let nextIndex = (this.turnIndex + 1) % 4;
    let loopCount = 0;
    while (!this.activeBidders.includes(this.players[nextIndex].id) && loopCount < 5) {
        nextIndex = (nextIndex + 1) % 4;
        loopCount++;
    }

    if (this.activeBidders.length === 0) {
        // Everyone passed.
        // Rule: "eğer kimse ihaleye teklif vermezse ihale ilk konuşan oyuncuya kalır."
        // This means the initial winningBid (assigned to starter at 4) stands.
        // Re-assign currentBidder to the original winner logic.
        // winningBid should already be { starterId, 4 } if we initialized correctly.
        // So we just proceed to exchange.
        this.state = 'EXCHANGE_CARDS';
        this.currentBidder = this.winningBid.playerId;
        this.turnIndex = this.players.findIndex(p => p.id === this.currentBidder);
        this.trickStarterIndex = this.turnIndex;

        this.notifyStateChange();
        // Do NOT emit kitty yet. Winner must bury first.
        return;
    }

    // Check if only 1 bidder remains AND they are holding the winning bid
    if (this.activeBidders.length === 1 && this.activeBidders[0] === this.winningBid.playerId) {
        this.state = 'EXCHANGE_CARDS';
        this.currentBidder = this.winningBid.playerId;
        this.turnIndex = this.players.findIndex(p => p.id === this.currentBidder);
        this.trickStarterIndex = this.turnIndex;

        this.notifyStateChange();
        // Do NOT emit kitty yet. Winner must bury first.
        return;
    }

    this.turnIndex = nextIndex;
    this.notifyStateChange();
    this.askForBid();
}

handleCardExchange(playerId, cardsToBury) {
    if (this.state !== 'EXCHANGE_CARDS') return;
    if (playerId !== this.winningBid.playerId) return;
    if (!Array.isArray(cardsToBury) || cardsToBury.length !== 4) return;

    const playerIndex = this.players.findIndex(p => p.id === playerId);
    const currentHand = [...this.hands[playerIndex]]; // Copy

    // 1. Validate cardsToBury exist in currentHand
    const buried = [];
    for (const c of cardsToBury) {
        const idx = currentHand.findIndex(h => h.suit === c.suit && h.rank === c.rank);
        if (idx === -1) {
            this.io.to(playerId).emit('error_message', 'You do not have this card.');
            return;
        }
        buried.push(currentHand[idx]);
        currentHand.splice(idx, 1); // Remove from hand
    }

    // 2. Add kitty to hand
    const markedKitty = this.kitty.map(c => ({ ...c, fromKitty: true }));
    const newHand = [...currentHand, ...markedKitty];

    // 3. Update state
    this.hands[playerIndex] = newHand;
    this.buriedCards = buried;
    this.deck.sortHand(this.hands[playerIndex]);

    // 4. Reveal result to player (New Hand)
    this.io.to(playerId).emit('deal_hand', this.hands[playerIndex]);
    // Also let them know what was in the kitty (optional, but they see it in their hand now)
    this.io.to(playerId).emit('error_message', 'Swap complete! Kitty cards added.');

    // Proceed to Trump Selection
    this.state = 'TRUMP_SELECTION';
    this.notifyStateChange();
    this.io.to(this.roomId).emit('ask_trump', { playerId: this.currentBidder });
}

handleTrumpSelection(playerId, suit) {
    if (this.state !== 'TRUMP_SELECTION') return;
    if (playerId !== this.winningBid.playerId) return;

    const validSuits = ['♠', '♥', '♦', '♣'];
    if (!validSuits.includes(suit)) return;

    this.trump = suit;
    this.state = 'PLAYING';
    this.currentTrick = [];
    this.roundScores = {};
    this.players.forEach(p => this.roundScores[p.id] = 0);

    this.notifyStateChange();
    this.io.to(this.roomId).emit('turn_change', { playerId: this.players[this.turnIndex].id });
}

handleCardPlay(playerId, card) {
    if (this.state !== 'PLAYING') return;
    if (this.players[this.turnIndex].id !== playerId) return;

    const playerIndex = this.players.findIndex(p => p.id === playerId);
    const hand = this.hands[playerIndex];
    const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);

    if (cardIndex === -1) return;

    if (!this.isValidMove(hand, card, this.currentTrick)) {
        this.io.to(playerId).emit('error_message', 'Invalid Move');
        return;
    }

    hand.splice(cardIndex, 1);
    this.currentTrick.push({ playerId, card });

    this.io.to(this.roomId).emit('card_played', { playerId, card });


    // FIX: Client relies on state_update to render the game board and turns
    this.notifyStateChange();

    if (this.currentTrick.length === 4) {
        this.resolveTrick();
    } else {
        this.turnIndex = (this.turnIndex + 1) % 4;
        this.io.to(this.roomId).emit('turn_change', { playerId: this.players[this.turnIndex].id });
        // Update state again for turn change
        this.notifyStateChange();
    }
}

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
        // RULE 1: If you have lead suit, you MUST play it.
        if (card.suit !== leadSuit) return false;

        // RULE 2: Must Raise Lead Suit?
        // Exception: If someone played Trump, you don't have to raise lead suit (just follow suit).
        const isTrumped = currentTrick.some(m => m.card.suit === trumpSuit);

        if (!isTrumped) {
            // No trump on table yet. Must raise logical Lead Suit.
            let maxTableVal = 0;
            currentTrick.forEach(m => {
                if (m.card.suit === leadSuit) {
                    maxTableVal = Math.max(maxTableVal, getVal(m.card));
                }
            });

            const myMaxVal = hand
                .filter(c => c.suit === leadSuit)
                .reduce((max, c) => Math.max(max, getVal(c)), 0);

            if (myMaxVal > maxTableVal) {
                if (getVal(card) <= maxTableVal) {
                    this.io.to(this.players[this.turnIndex].id).emit('error_message', 'Yükseltmek zorunlu (Must raise)!');
                    return false;
                }
            }
        }
        return true;
    } else {
        // Void in Lead Suit
        const hasTrump = hand.some(c => c.suit === trumpSuit);

        if (hasTrump) {
            // RULE 3: If void in lead suit, MUST play Trump (if you have it).
            if (card.suit !== trumpSuit) {
                this.io.to(this.players[this.turnIndex].id).emit('error_message', 'Koz atmak zorunlu (Must play Trump)!');
                return false;
            }

            // RULE 4: Must Raise Trump?
            // If there are already trumps on the table, must beat the highest trump.
            const playedTrumps = currentTrick.filter(m => m.card.suit === trumpSuit);

            if (playedTrumps.length > 0) {
                let maxTrumpVal = 0;
                playedTrumps.forEach(m => maxTrumpVal = Math.max(maxTrumpVal, getVal(m.card)));

                const myMaxTrump = hand
                    .filter(c => c.suit === trumpSuit)
                    .reduce((max, c) => Math.max(max, getVal(c)), 0);

                if (myMaxTrump > maxTrumpVal) {
                    if (getVal(card) <= maxTrumpVal) {
                        this.io.to(this.players[this.turnIndex].id).emit('error_message', 'Kozu büyütmek zorunlu (Must raise Trump)!');
                        return false;
                    }
                }
            }
            return true;
        }

        // RULE 5: No Lead Suit, No Trump -> Freedom
        return true;
    }
}

resolveTrick() {
    let winnerIndex = 0;
    let highestCard = this.currentTrick[0].card;
    let leaderSuit = highestCard.suit;

    const getRankVal = this.getRankVal;

    for (let i = 1; i < 4; i++) {
        const played = this.currentTrick[i];
        const pCard = played.card;

        if (pCard.suit === leaderSuit) {
            if (getRankVal(pCard.rank) > getRankVal(highestCard.rank)) {
                highestCard = pCard;
                winnerIndex = i;
            }
        } else if (pCard.suit === this.trump) {
            if (highestCard.suit !== this.trump) {
                highestCard = pCard;
                winnerIndex = i;
            } else {
                if (getRankVal(pCard.rank) > getRankVal(highestCard.rank)) {
                    highestCard = pCard;
                    winnerIndex = i;
                }
            }
        }
    }

    const winnerPlayerId = this.currentTrick[winnerIndex].playerId;
    this.roundScores[winnerPlayerId] = (this.roundScores[winnerPlayerId] || 0) + 1;

    setTimeout(() => {
        if (this.state !== 'PLAYING') return;
        this.currentTrick = [];
        this.turnIndex = this.players.findIndex(p => p.id === winnerPlayerId);
        const totalTricks = Object.values(this.roundScores).reduce((a, b) => a + b, 0);
        if (totalTricks === 12) {
            this.endRound();
        } else {
            this.notifyStateChange();
            this.io.to(this.roomId).emit('turn_change', { playerId: this.players[this.turnIndex].id });
        }
    }, 2000);
}

endRound() {
    this.state = 'SCORING';
    const bidderId = this.winningBid.playerId;
    const bidAmount = this.winningBid.amount;
    const bidderTricks = this.roundScores[bidderId] || 0;

    // 1. Bidder Scoring
    let bidderDelta = 0;
    if (bidderTricks >= bidAmount) {
        bidderDelta = bidAmount; // Usually just bid amount, or bid + extras? Standard is Bid Amount.
        // Variation: If you bid 8 and take 10, do you get 8 or 10? Standard "Ihaleli": Just Bid Amount.
    } else {
        bidderDelta = -bidAmount; // Batak
    }

    // 2. Other Players Scoring
    this.players.forEach(p => {
        if (p.id === bidderId) {
            this.scores[p.id] += bidderDelta;
        } else {
            const tricks = this.roundScores[p.id] || 0;
            if (tricks === 0) {
                // RULE: Side Batak (Yan Batma). If you take 0, you go down by bid amount.
                this.scores[p.id] -= bidAmount;
            } else {
                this.scores[p.id] += tricks;
            }
        }
    });

    this.notifyStateChange();

    // 3. Game Over Check (51 Points)
    let winner = null;
    for (const [pid, score] of Object.entries(this.scores)) {
        if (score >= 51) {
            winner = pid;
            // Could handle multiple >= 51 (highest wins)
        }
    }

    if (winner) {
        this.state = 'GAME_OVER';
        this.io.to(this.roomId).emit('game_over', { winnerId: winner, scores: this.scores });
        return;
    }

    // 4. Rotate Dealer
    // RULE: "son oynanan el ilk önce ihale teklifi yapan oyuncu dağıtır"
    if (typeof this.roundBidStarterIndex !== 'undefined') {
        this.dealerIndex = this.roundBidStarterIndex;
    } else {
        this.dealerIndex = (this.dealerIndex + 1) % 4;
    }

    setTimeout(() => {
        this.startGame();
    }, 5000);
}
}

module.exports = Room;
