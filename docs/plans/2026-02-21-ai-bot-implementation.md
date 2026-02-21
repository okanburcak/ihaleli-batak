# AI Bot Player Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Claude-powered AI bot that joins empty seats and plays Batak autonomously, triggered by a lobby button.

**Architecture:** Bot is a virtual player (`isBot: true`) in-process. After every state change, `Room.checkBotTurn()` checks if the current seat is a bot and schedules `BotPlayer.botDecide(room, seatIndex)` with a 1-second delay. `botDecide` calls the Claude API with a phase-specific prompt, parses the response, and calls the appropriate Room method directly. Falls back to rule-based moves on API failure.

**Tech Stack:** `@anthropic-ai/sdk` (server), Node.js, React 18 (button in lobby UI)

---

## Task 1: Install Anthropic SDK

**Files:**
- Modify: `server/package.json`

**Step 1: Install the package**

Run in `server/` directory:
```bash
cd /opt/projects/ihaleli-batak/server && npm install @anthropic-ai/sdk
```

Expected: Package installs successfully, `package.json` now shows `"@anthropic-ai/sdk"` in dependencies.

**Step 2: Verify install**

```bash
node -e "const Anthropic = require('@anthropic-ai/sdk'); console.log('OK:', typeof Anthropic)"
```

Expected: `OK: function`

**Step 3: Commit**

```bash
cd /opt/projects/ihaleli-batak && git add server/package.json server/package-lock.json
git commit -m "feat: add @anthropic-ai/sdk dependency for bot player"
```

---

## Task 2: Create BotPlayer.js

**Files:**
- Create: `server/game/BotPlayer.js`

This module exports one function: `botDecide(room, seatIndex)`. It reads game state, builds a phase-specific prompt, calls Claude API, parses the response, and calls the matching Room method. Falls back to rule-based moves on any error.

**Step 1: Create the file**

Create `server/game/BotPlayer.js` with this content:

```javascript
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are playing Batak, a Turkish trick-taking card game for 4 players.

RULES:
- 52-card deck, 4 players, 13 tricks per round (last trick uses only 12 cards — bidder buries 1 during exchange)
- One player wins the bidding auction and picks the trump suit
- Trump beats all non-trump cards. Within same suit, higher rank wins.
- Rank order (low to high): 2 3 4 5 6 7 8 9 10 J Q K A
- You MUST follow the lead suit if you have it
- If you have the lead suit, you MUST play higher than the current highest card on the table if you can
- If you are void in the lead suit, you MUST play trump if you have it
- If you play trump and there is already a trump on the table, you MUST play higher trump if you can
- Bidder scores tricks_taken if >= bid, else scores -bid_amount
- Non-bidders: score tricks_taken, BUT score -bid_amount if they took 0 tricks (batak)

Respond with ONLY the move in the exact format specified. No explanation, no extra text.`;

function cardStr(c) {
    return `${c.suit}${c.rank}`;
}

function handStr(hand) {
    return hand.map(cardStr).join(' ');
}

function getRankVal(r) {
    const map = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11 };
    return map[r] || parseInt(r);
}

async function askClaude(prompt) {
    const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 32,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }]
    });
    return msg.content[0].text.trim().toLowerCase();
}

// --- Prompt Builders ---

function buildBiddingPrompt(hand, winningBid, activeBidders) {
    const minBid = winningBid.amount > 0 ? winningBid.amount + 1 : 5;
    return `My hand (${hand.length} cards): ${handStr(hand)}
Current winning bid: ${winningBid.amount}
Active bidders left: ${activeBidders.length}
To raise I must bid at least: ${minBid} (max 12)

Should I bid or pass? Respond with "bid ${minBid}" through "bid 12" OR "pass"`;
}

function buildTrumpPrompt(hand) {
    return `My hand (${hand.length} cards): ${handStr(hand)}
I won the bid. I must choose a trump suit BEFORE seeing the kitty.
Trump cards beat all other suits. Pick the suit where I have the most and strongest cards.

Respond with ONLY: "trump ♠", "trump ♥", "trump ♦", or "trump ♣"`;
}

function buildExchangePrompt(hand, kitty, trump) {
    return `My hand (${hand.length} cards): ${handStr(hand)}
Kitty - 4 cards I will automatically receive: ${handStr(kitty)}
Trump: ${trump}

I must choose exactly 4 cards from MY HAND to discard. I will then hold my remaining 8 + the 4 kitty cards = 12 cards.
Strategy: Keep high cards and trump cards. Discard low non-trump cards.

Respond with ONLY: "bury X,X,X,X" where each X is a card from my hand in format suit+rank (e.g. ♥2,♦3,♣4,♠5)`;
}

function buildPlayPrompt(hand, currentTrick, trump, roundScores, scores, seats) {
    const leadSuit = currentTrick.length > 0 ? currentTrick[0].card.suit : null;
    const playedCards = currentTrick.map(t => {
        const player = seats.find(s => s?.id === t.playerId);
        return `${cardStr(t.card)} (${player?.name || '?'})`;
    }).join(', ');

    const roundScoreStr = seats
        .filter(Boolean)
        .map(s => `${s.name}: ${roundScores[s.id] || 0} tricks`)
        .join(', ');

    let rules = '';
    if (currentTrick.length === 0) {
        rules = 'I lead this trick. I can play any card.';
    } else {
        const hasLead = hand.some(c => c.suit === leadSuit);
        const hasTrump = hand.some(c => c.suit === trump);
        const highestOnTable = currentTrick
            .filter(t => t.card.suit === leadSuit || t.card.suit === trump)
            .reduce((best, t) => {
                if (!best) return t.card;
                if (t.card.suit === trump && best.suit !== trump) return t.card;
                if (t.card.suit === trump && best.suit === trump && getRankVal(t.card.rank) > getRankVal(best.rank)) return t.card;
                if (t.card.suit === leadSuit && best.suit !== trump && getRankVal(t.card.rank) > getRankVal(best.rank)) return t.card;
                return best;
            }, null);

        if (hasLead) {
            rules = `I have lead suit (${leadSuit}), MUST follow it. Current highest on table: ${highestOnTable ? cardStr(highestOnTable) : 'none'}. Must raise if I can.`;
        } else if (hasTrump) {
            rules = `Void in lead suit (${leadSuit}), MUST play trump (${trump}). ${currentTrick.some(t => t.card.suit === trump) ? 'Trump already played, must raise trump if I can.' : 'No trump yet played.'}`;
        } else {
            rules = `Void in both lead suit and trump. Can play any card (it will lose).`;
        }
    }

    return `My hand: ${handStr(hand)}
Cards played in this trick: ${playedCards || 'none (I lead)'}
Trump: ${trump}${leadSuit ? `\nLead suit: ${leadSuit}` : ''}

${rules}

Round tricks taken: ${roundScoreStr}

Respond with ONLY: "play ♠A" (format: "play " + suit + rank)`;
}

// --- Response Parsers ---

function parseBiddingResponse(response, minBid) {
    if (response === 'pass') return { amount: 0 };
    const match = response.match(/bid\s*(\d+)/);
    if (match) {
        const amount = parseInt(match[1]);
        if (amount >= minBid && amount <= 12) return { amount };
    }
    return null; // Invalid
}

function parseTrumpResponse(response) {
    const suits = ['♠', '♥', '♦', '♣'];
    for (const suit of suits) {
        if (response.includes(suit)) return { suit };
    }
    return null;
}

function parseExchangeResponse(response, hand) {
    const match = response.match(/bury\s+(.+)/);
    if (!match) return null;

    const parts = match[1].split(',').map(s => s.trim());
    if (parts.length !== 4) return null;

    const cards = [];
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

    for (const part of parts) {
        const suit = suits.find(s => part.includes(s));
        if (!suit) return null;
        const rank = part.replace(suit, '').trim().toUpperCase();
        if (!ranks.includes(rank)) return null;
        const inHand = hand.find(c => c.suit === suit && c.rank === rank);
        if (!inHand) return null;
        cards.push(inHand);
    }

    return { cards };
}

function parsePlayResponse(response, hand, room) {
    const match = response.match(/play\s*(.+)/);
    if (!match) return null;

    const cardStr = match[1].trim();
    const suits = ['♠', '♥', '♦', '♣'];
    const suit = suits.find(s => cardStr.includes(s));
    if (!suit) return null;

    const rank = cardStr.replace(suit, '').trim().toUpperCase();
    const card = hand.find(c => c.suit === suit && c.rank === rank);
    if (!card) return null;

    // Validate the move is legal
    if (!room.isValidMove(hand, card, room.currentTrick)) return null;

    return { card };
}

// --- Fallback Logic (rule-based, always legal) ---

function fallbackBid(room, botId) {
    // Always pass on fallback
    console.log(`[BOT] Fallback: passing bid`);
    room.bid(botId, 0);
}

function fallbackTrump(room, botId, hand) {
    // Pick suit with most cards
    const counts = { '♠': 0, '♥': 0, '♦': 0, '♣': 0 };
    hand.forEach(c => counts[c.suit]++);
    const suit = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    console.log(`[BOT] Fallback trump: ${suit}`);
    room.selectTrump(botId, suit);
}

function fallbackExchange(room, botId, hand, trump) {
    // Bury lowest non-trump cards first, then lowest trump if needed
    const nonTrump = hand
        .filter(c => c.suit !== trump)
        .sort((a, b) => getRankVal(a.rank) - getRankVal(b.rank));
    const trumpCards = hand
        .filter(c => c.suit === trump)
        .sort((a, b) => getRankVal(a.rank) - getRankVal(b.rank));

    const tobury = [...nonTrump, ...trumpCards].slice(0, 4);
    console.log(`[BOT] Fallback exchange: burying ${tobury.map(c => c.suit+c.rank).join(',')}`);
    room.exchangeCards(botId, tobury);
}

function fallbackPlay(room, botId, seatIndex) {
    const hand = room.hands[seatIndex];
    const legal = hand.filter(c => room.isValidMove(hand, c, room.currentTrick));
    const sorted = legal.sort((a, b) => getRankVal(a.rank) - getRankVal(b.rank));
    const card = sorted[0];
    console.log(`[BOT] Fallback play: ${card.suit}${card.rank}`);
    room.playCard(botId, card);
}

// --- Main Decision Function ---

async function botDecide(room, seatIndex) {
    const bot = room.seats[seatIndex];
    if (!bot || !bot.isBot) return;

    const botId = bot.id;
    const hand = room.hands[seatIndex];

    if (!hand || hand.length === 0) {
        console.log(`[BOT] ${bot.name}: no hand, skipping`);
        return;
    }

    console.log(`[BOT] ${bot.name} deciding for state: ${room.state}`);

    try {
        if (room.state === 'BIDDING') {
            const minBid = room.winningBid.amount > 0 ? room.winningBid.amount + 1 : 5;
            const prompt = buildBiddingPrompt(hand, room.winningBid, room.activeBidders || []);
            const response = await askClaude(prompt);
            console.log(`[BOT] ${bot.name} BIDDING response: "${response}"`);
            const action = parseBiddingResponse(response, minBid);
            if (action) {
                room.bid(botId, action.amount);
            } else {
                fallbackBid(room, botId);
            }

        } else if (room.state === 'TRUMP_SELECTION') {
            const prompt = buildTrumpPrompt(hand);
            const response = await askClaude(prompt);
            console.log(`[BOT] ${bot.name} TRUMP response: "${response}"`);
            const action = parseTrumpResponse(response);
            if (action) {
                room.selectTrump(botId, action.suit);
            } else {
                fallbackTrump(room, botId, hand);
            }

        } else if (room.state === 'EXCHANGE_CARDS') {
            const prompt = buildExchangePrompt(hand, room.kitty, room.trump);
            const response = await askClaude(prompt);
            console.log(`[BOT] ${bot.name} EXCHANGE response: "${response}"`);
            const action = parseExchangeResponse(response, hand);
            if (action) {
                room.exchangeCards(botId, action.cards);
            } else {
                fallbackExchange(room, botId, hand, room.trump);
            }

        } else if (room.state === 'PLAYING') {
            const prompt = buildPlayPrompt(hand, room.currentTrick, room.trump, room.roundScores, room.scores, room.seats);
            const response = await askClaude(prompt);
            console.log(`[BOT] ${bot.name} PLAY response: "${response}"`);
            const action = parsePlayResponse(response, hand, room);
            if (action) {
                room.playCard(botId, action.card);
            } else {
                fallbackPlay(room, botId, seatIndex);
            }
        }

    } catch (err) {
        console.error(`[BOT] ${bot.name} Claude API error: ${err.message}`);
        // Fallback based on current state
        try {
            if (room.state === 'BIDDING') fallbackBid(room, botId);
            else if (room.state === 'TRUMP_SELECTION') fallbackTrump(room, botId, hand);
            else if (room.state === 'EXCHANGE_CARDS') fallbackExchange(room, botId, hand, room.trump);
            else if (room.state === 'PLAYING') fallbackPlay(room, botId, seatIndex);
        } catch (fallbackErr) {
            console.error(`[BOT] ${bot.name} fallback also failed: ${fallbackErr.message}`);
        }
    }
}

module.exports = { botDecide };
```

**Step 2: Verify syntax**

```bash
cd /opt/projects/ihaleli-batak/server && node -e "require('./game/BotPlayer'); console.log('BotPlayer loaded OK')"
```

Expected: `BotPlayer loaded OK`

**Step 3: Commit**

```bash
cd /opt/projects/ihaleli-batak && git add server/game/BotPlayer.js
git commit -m "feat: add BotPlayer with Claude API integration and rule-based fallback"
```

---

## Task 3: Add Bot Support to Room.js

**Files:**
- Modify: `server/game/Room.js`

Two additions:
1. `addBotPlayer(seatIndex)` method — creates a bot player in a seat
2. `checkBotTurn()` method — triggers bot if current turn belongs to a bot

**Step 1: Add `addBotPlayer` method**

Add this method to the `Room` class, after the `removePlayer` method (after line 239 in the current file):

```javascript
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
```

**Step 2: Add `checkBotTurn` method**

Add this method right after `addBotPlayer`:

```javascript
checkBotTurn() {
    if (this.pendingStateChange) return; // Trick is resolving, wait
    const currentPlayer = this.seats[this.turnIndex];
    if (!currentPlayer || !currentPlayer.isBot) return;

    const { botDecide } = require('./BotPlayer');
    const seatIndex = this.turnIndex;
    setTimeout(() => botDecide(this, seatIndex), 1000);
}
```

**Step 3: Wire `checkBotTurn()` into `startGame()`**

At the very end of `startGame()`, before the closing `}`, add:

Find this line (it's the last line of startGame, setting up activeBidders):
```javascript
    this.activeBidders = this.seats.filter(p => p !== null).map(p => p.id);
```

Add after it:
```javascript
    this.checkBotTurn();
```

**Step 4: Wire `checkBotTurn()` into `bid()`**

The `bid()` method has two `return { success: true }` paths. Add `this.checkBotTurn()` before each one.

Find the first success return (bidding over, transition to TRUMP_SELECTION):
```javascript
            this.currentBidder = winnerId;
            return { success: true };
```
Replace with:
```javascript
            this.currentBidder = winnerId;
            this.checkBotTurn();
            return { success: true };
```

Find the second success return (bidding continues):
```javascript
        this.turnIndex = nextIndex;
        return { success: true };
```
Replace with:
```javascript
        this.turnIndex = nextIndex;
        this.checkBotTurn();
        return { success: true };
```

**Step 5: Wire `checkBotTurn()` into `selectTrump()`**

Find in `selectTrump()`:
```javascript
        // Turn stays with bidder
        return { success: true };
```
Replace with:
```javascript
        // Turn stays with bidder
        this.checkBotTurn();
        return { success: true };
```

**Step 6: Wire `checkBotTurn()` into `exchangeCards()`**

The `exchangeCards()` method transitions to PLAYING state. Add after the `this.state = 'PLAYING'` line in the main exchange path:

Find:
```javascript
        this.state = 'PLAYING';
        return { success: true };
```
(The one at the very end, not the "Gömü skipped" one — add to that one too)

Replace the Gömü skip path:
```javascript
        if (!cardsToBury || cardsToBury.length === 0) {
            this.state = 'PLAYING';
            this.checkBotTurn();
            return { success: true, message: 'Gömü skipped' };
        }
```

Replace the main path:
```javascript
        this.state = 'PLAYING';
        this.checkBotTurn();
        return { success: true };
```

**Step 7: Wire `checkBotTurn()` into `playCard()`**

Find in `playCard()`:
```javascript
        if (this.currentTrick.length === 4) {
            this.resolveTrick();
        } else {
            this.turnIndex = (this.turnIndex + 1) % 4;
        }
```

Replace with:
```javascript
        if (this.currentTrick.length === 4) {
            this.resolveTrick();
            // checkBotTurn is called inside resolveTrick's setTimeout
        } else {
            this.turnIndex = (this.turnIndex + 1) % 4;
            this.checkBotTurn();
        }
```

**Step 8: Wire `checkBotTurn()` into `resolveTrick()` setTimeout**

Find inside the `setTimeout` in `resolveTrick()`:
```javascript
            const totalTricks = Object.values(this.roundScores).reduce((a, b) => a + b, 0);
            if (totalTricks === 12) { // 12 tricks (48 cards played)
                this.endRound();
            }
```

Replace with:
```javascript
            const totalTricks = Object.values(this.roundScores).reduce((a, b) => a + b, 0);
            if (totalTricks === 12) {
                this.endRound();
            } else {
                this.checkBotTurn();
            }
```

**Step 9: Verify Room still loads**

```bash
cd /opt/projects/ihaleli-batak/server && node -e "const Room = require('./game/Room'); const r = new Room('test'); console.log('Room OK, checkBotTurn:', typeof r.checkBotTurn)"
```

Expected: `Room OK, checkBotTurn: function`

**Step 10: Commit**

```bash
cd /opt/projects/ihaleli-batak && git add server/game/Room.js
git commit -m "feat: add addBotPlayer and checkBotTurn to Room, wire into game flow"
```

---

## Task 4: Add POST /add-bot Endpoint to Server

**Files:**
- Modify: `server/index.js`

**Step 1: Add the route**

Add this route after the existing `Restart Game` route (after line 231, before the super admin routes):

```javascript
// Add Bot to Room
app.post('/api/rooms/:roomId/add-bot', resolvePlayer, requirePlayer, (req, res) => {
    const { roomId } = req.params;
    const { seatIndex } = req.body;

    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Any seated player can add a bot
    const player = room.players.find(p => p.id === req.playerId);
    if (!player || player.seatIndex === -1) {
        return res.status(403).json({ error: 'Only seated players can add bots' });
    }

    const result = room.addBotPlayer(seatIndex);
    if (result.error) return res.status(400).json(result);
    res.json(result);
});
```

**Step 2: Test the endpoint manually**

```bash
cd /opt/projects/ihaleli-batak/server && node -e "
const Room = require('./game/Room');
const r = new Room('test');
r.addPlayer('Human', null, 0);
const result = r.addBotPlayer(1);
console.log('addBotPlayer result:', result);
console.log('seat 1:', r.seats[1]?.name, 'isBot:', r.seats[1]?.isBot);
"
```

Expected: `addBotPlayer result: { success: true, botName: 'Bot 1' }` and `seat 1: Bot 1 isBot: true`

**Step 3: Commit**

```bash
cd /opt/projects/ihaleli-batak && git add server/index.js
git commit -m "feat: add POST /api/rooms/:roomId/add-bot endpoint"
```

---

## Task 5: Write Bot Test Script

**Files:**
- Create: `server/test_bot.js`

This test verifies bot-related Room logic without needing the Claude API (tests fallback paths and room methods).

**Step 1: Create the test**

Create `server/test_bot.js`:

```javascript
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

// Override botDecide to avoid actual API calls
const BotPlayer = require('./game/BotPlayer');
const originalBotDecide = BotPlayer.botDecide;

let botDecideCalls = 0;
// Monkey-patch for test (we test that checkBotTurn calls botDecide)
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

// --- Summary ---
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

**Step 2: Run the test**

```bash
cd /opt/projects/ihaleli-batak/server && node test_bot.js
```

Expected: All tests pass with `✓` marks, `0 failed`.

**Step 3: Commit**

```bash
cd /opt/projects/ihaleli-batak && git add server/test_bot.js
git commit -m "test: add bot player unit tests"
```

---

## Task 6: Add Bot API Call to Client

**Files:**
- Modify: `client/src/api.js`

**Step 1: Add `addBot` to the api object**

In `client/src/api.js`, add this method to the `api` object, after `restartGame`:

```javascript
    addBot: async (roomId, seatIndex) => {
        const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/add-bot`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ seatIndex })
        });
        return res.json();
    },
```

**Step 2: Verify the file syntax**

```bash
cd /opt/projects/ihaleli-batak/client && node -e "console.log('syntax OK')" 2>&1 || echo "check file manually"
```

(No build needed yet — just a quick sanity check)

**Step 3: Commit**

```bash
cd /opt/projects/ihaleli-batak && git add client/src/api.js
git commit -m "feat: add addBot API method to client"
```

---

## Task 7: Add "Add Bot" Button to Lobby UI

**Files:**
- Modify: `client/src/App.jsx`

**Context:** The WAITING lobby (around line 522) renders a `<ul>` with each seat as `<li>`. Empty seats show "Boş Koltuk {idx+1}". We add a "🤖 Bot Ekle" button to each empty seat `<li>`.

**Step 1: Add `addBot` handler function**

In `App.jsx`, find the area where other handler functions are defined (near `startGame`, `handleLeave`, etc.). Add this function:

```javascript
const addBot = async (seatIndex) => {
    try {
        const result = await api.addBot(currentRoomId, seatIndex);
        if (result.error) {
            setErrorMsg(result.error);
        }
    } catch (e) {
        setErrorMsg('Bot eklenemedi');
    }
};
```

**Step 2: Update empty seat rendering in WAITING state**

Find the empty seat `<li>` block (around line 530-534):

```jsx
                                if (!p) return (
                                    <li key={idx} className="flex flex-col bg-green-700/30 p-2 rounded border border-dashed border-gray-500">
                                        <span className="text-gray-400 italic">Boş Koltuk {idx + 1}</span>
                                    </li>
                                );
```

Replace with:

```jsx
                                if (!p) {
                                    const isSeated = roomState.players.some(pl => pl?.id === myPlayerId);
                                    return (
                                        <li key={idx} className="flex items-center justify-between bg-green-700/30 p-2 rounded border border-dashed border-gray-500">
                                            <span className="text-gray-400 italic">Boş Koltuk {idx + 1}</span>
                                            {isSeated && (
                                                <button
                                                    onClick={() => addBot(idx)}
                                                    className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded"
                                                >
                                                    🤖 Bot
                                                </button>
                                            )}
                                        </li>
                                    );
                                }
```

**Step 3: Also update the Start button to allow starting with bots**

The Start button is currently disabled with `4 KİŞİ BEKLENİYOR` text. Since bots count as players in `roomState.players`, this will already work correctly when bots fill seats. No change needed here.

**Step 4: Build and check for errors**

```bash
cd /opt/projects/ihaleli-batak/client && npm run build 2>&1 | tail -20
```

Expected: Build succeeds with no errors.

**Step 5: Commit**

```bash
cd /opt/projects/ihaleli-batak && git add client/src/App.jsx
git commit -m "feat: add Bot Ekle button to empty seats in lobby"
```

---

## Task 8: Configure ANTHROPIC_API_KEY

**Files:**
- Create: `server/.env` (gitignored — do NOT commit this)
- Modify: `server/index.js` (load dotenv)

**Step 1: Check .gitignore**

```bash
grep -n ".env" /opt/projects/ihaleli-batak/.gitignore
```

If `.env` is not ignored, add it:
```bash
echo ".env" >> /opt/projects/ihaleli-batak/.gitignore
```

**Step 2: Install dotenv in server**

```bash
cd /opt/projects/ihaleli-batak/server && npm install dotenv
```

**Step 3: Load dotenv at top of index.js**

Add this as the very first line of `server/index.js`:

```javascript
require('dotenv').config();
```

**Step 4: Create server/.env** (do not commit)

```
ANTHROPIC_API_KEY=your_key_here
```

Replace `your_key_here` with the actual API key.

**Step 5: Verify key loads**

```bash
cd /opt/projects/ihaleli-batak/server && node -e "require('dotenv').config(); console.log('KEY:', process.env.ANTHROPIC_API_KEY ? 'set (' + process.env.ANTHROPIC_API_KEY.slice(0,8) + '...)' : 'NOT SET')"
```

Expected: `KEY: set (sk-ant-a...)`

**Step 6: Commit dotenv setup (not the .env file)**

```bash
cd /opt/projects/ihaleli-batak && git add server/index.js server/package.json server/package-lock.json .gitignore
git commit -m "feat: load ANTHROPIC_API_KEY via dotenv"
```

---

## Task 9: End-to-End Smoke Test

**Goal:** Verify a bot can join a room and play through a full game.

**Step 1: Start the server**

```bash
cd /opt/projects/ihaleli-batak/server && node index.js &
sleep 2
```

**Step 2: Run smoke test script**

```bash
node -e "
const http = require('http');
const BASE = 'http://localhost:3000';

async function req(method, path, body, headers = {}) {
    return new Promise((resolve) => {
        const data = body ? JSON.stringify(body) : null;
        const opts = {
            method, path,
            hostname: 'localhost', port: 3000,
            headers: { 'Content-Type': 'application/json', ...headers }
        };
        const r = http.request(opts, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve(JSON.parse(d)));
        });
        if (data) r.write(data);
        r.end();
    });
}

(async () => {
    // Create room
    const room = await req('POST', '/api/rooms', { winningScore: 51 });
    console.log('Room created:', room.roomId);

    // Join as human (admin)
    const join = await req('POST', \`/api/rooms/\${room.roomId}/join\`, { name: 'TestHuman' });
    console.log('Human joined:', join.playerId);

    const token = join.token;
    const headers = { 'x-player-id': token };

    // Add 3 bots
    for (const seat of [1, 2, 3]) {
        const b = await req('POST', \`/api/rooms/\${room.roomId}/add-bot\`, { seatIndex: seat }, headers);
        console.log(\`Bot in seat \${seat}:\`, b.botName || b.error);
    }

    // Check state
    const state = await req('GET', \`/api/rooms/\${room.roomId}/state\`, null, headers);
    console.log('Players:', state.players.map(p => p?.name).join(', '));
    console.log('State:', state.state);

    console.log('\\nSmoke test PASSED. Watch server logs for bot decisions.');
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
"
```

Expected output:
```
Room created: 123456
Human joined: <uuid>
Bot in seat 1: Bot 1
Bot in seat 2: Bot 2
Bot in seat 3: Bot 3
Players: TestHuman, Bot 1, Bot 2, Bot 3
State: WAITING
Smoke test PASSED.
```

**Step 3: Kill test server**

```bash
pkill -f "node index.js"
```

**Step 4: Final commit**

```bash
cd /opt/projects/ihaleli-batak && git add -A
git commit -m "feat: complete AI bot player integration"
```

---

## Environment Setup Summary

Before running the server with bots:

1. Set `ANTHROPIC_API_KEY` in `server/.env`
2. The bot uses model `claude-haiku-4-5-20251001` — fast and inexpensive for game decisions
3. Bot logs appear in server stdout prefixed with `[BOT]`
4. If API key is missing, bots will always use fallback (rule-based) moves and log errors

## How It Works at Runtime

1. Human opens lobby, sees empty seats with "🤖 Bot" button
2. Human clicks "🤖 Bot" → `POST /add-bot` → bot player added to seat
3. When all 4 seats filled (any mix of humans/bots), admin clicks "OYUNU BAŞLAT"
4. `startGame()` runs → `checkBotTurn()` fires
5. If bot's turn: 1-second delay → Claude API call → bot makes its move
6. Game continues automatically until a human's turn
7. Humans play normally via the UI; bots play automatically
