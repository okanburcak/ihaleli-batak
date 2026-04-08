const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BOT_MODEL = process.env.BOT_MODEL || 'claude-haiku-4-5-20251001';

const LOG_DIR = path.join(__dirname, '..', 'data');
const LOG_FILE = path.join(LOG_DIR, 'bot-reasoning.log');

function logReasoning(botName, phase, fullText) {
    const ts = new Date().toISOString();
    const entry = `\n[${ts}] ${botName} — ${phase}\n${fullText}\n${'─'.repeat(60)}`;
    console.log(`[BOT THINK] ${botName} (${phase}):\n${fullText}`);
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        fs.appendFileSync(LOG_FILE, entry + '\n');
    } catch (e) {
        // non-fatal
    }
}

const SYSTEM_PROMPT = `You are a skilled İhaleli Batak card game player. İhaleli Batak is a Turkish trick-taking card game for 4 individual players (no fixed teams).

OBJECTIVE:
Be the first player to reach the winning score (e.g. 51 points). Scores accumulate across multiple rounds.

THE DECK & DEAL:
- Standard 52-card deck. Each player receives 12 cards. 4 cards go face-down as the kitty.
- Rank order low→high: 2 3 4 5 6 7 8 9 10 J Q K A

BIDDING PHASE:
- The bid starter implicitly holds a bid of 4. All other players must bid at least 5 to enter.
- Each new bid must be strictly higher than the current winning bid (max 12). Say "pass" to exit.
- Bidding ends when only the winning bidder remains. They win the right to choose trump and use the kitty.

TRUMP & EXCHANGE PHASE:
- Bid winner first declares the trump suit (without seeing the kitty).
- Bid winner then receives the 4 kitty cards, adding them to their hand (now holds 16 cards).
- Bid winner discards exactly 4 cards face-down. They will play the remaining 12 cards.
- Discard strategy: bury low cards from short non-trump suits to create voids for future ruffing; keep all trump, aces, and kings.

PLAYING PHASE — 12 tricks:
- Bid winner leads the first trick. Winner of each trick leads the next.
- MUST follow the lead suit if you have any card in it.
- If following the lead suit, you MUST play higher than the current highest card of that suit if you can.
- If void in the lead suit, you MUST play trump if you have any.
- If trump is already on the table and you are also playing trump, you MUST play higher trump if you can.
- If void in both lead suit and trump, play any card (it will lose the trick regardless).
- Highest trump wins. If no trump played, highest card of the lead suit wins.

SCORING (after each round):
- Bidder succeeded (tricks_taken >= bid): scores +tricks_taken (every trick counts, not just the bid)
- Bidder failed (tricks_taken < bid): scores −bid
- Non-bidder took ≥1 trick: scores +tricks_taken
- Non-bidder took 0 tricks — BATAK!: scores −bid (same heavy penalty as a failed bidder)

CRITICAL STRATEGIC RULES:
1. As bidder: Aim to take as many tricks as possible — you score ALL tricks you win, not just the bid amount. Making 9 tricks on a bid of 7 scores +9, not +7.
2. As non-bidder: Taking at least 1 trick is your first priority to avoid the batak penalty. Every additional trick also improves your score.
3. Play the minimum card needed to win a trick — never waste a high card when a lower one wins.
4. Dump your safest losers when a trick is already lost or when a non-partner is winning.
5. Track which high cards are gone — if the ♠A has been played, your ♠K is now the highest spade.
6. Trump management: save your highest trumps; ruff with low trumps when possible.

Think briefly (1-2 sentences) about the best move, then output your decision on the final line in the exact format specified.`;

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

async function askClaude(prompt, botName, phase) {
    const msg = await client.messages.create({
        model: BOT_MODEL,
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }]
    });
    const fullText = msg.content[0].text.trim();
    logReasoning(botName, phase, fullText);
    // Extract the last non-empty line — reasoning comes first, decision is last
    const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
    return lines[lines.length - 1].toLowerCase();
}

// --- Prompt Builders ---

function handStrength(hand) {
    // Count high cards and longest suit length
    const hcp = hand.reduce((sum, c) => {
        return sum + ({ 'A': 4, 'K': 3, 'Q': 2, 'J': 1 }[c.rank] || 0);
    }, 0);
    const suitCounts = { '♠': 0, '♥': 0, '♦': 0, '♣': 0 };
    hand.forEach(c => suitCounts[c.suit]++);
    const longestSuit = Math.max(...Object.values(suitCounts));
    return { hcp, longestSuit };
}

function buildBiddingPrompt(hand, winningBid, activeBidders) {
    const minBid = winningBid.amount > 0 ? winningBid.amount + 1 : 5;
    const { hcp, longestSuit } = handStrength(hand);

    const aces = hand.filter(c => c.rank === 'A').length;
    const kings = hand.filter(c => c.rank === 'K').length;
    const queens = hand.filter(c => c.rank === 'Q').length;

    return `My hand (${hand.length} cards): ${handStr(hand)}
Hand analysis: ${hcp} HCP (A=4,K=3,Q=2,J=1), longest suit ${longestSuit} cards, ${aces} aces / ${kings} kings / ${queens} queens
Current winning bid: ${winningBid.amount}
Active bidders left: ${activeBidders.length}
To raise I must bid at least: ${minBid} (max 12)

Bidding guidance:
- HCP >= 12 with longest suit >= 4: open with bid 6 if you can
- HCP >= 14 with longest suit >= 5: bid up to 7 at most
- Never bid above 7 — bids of 8+ require an exceptionally rare hand
- HCP < 10 or longest suit < 4: pass
- Remember: you pick up 4 kitty cards if you win the bid, which may add 1-2 tricks

Think briefly about whether to bid or pass, then on the final line write ONLY: "bid ${minBid}" through "bid 7" OR "pass"`;
}

function buildTrumpPrompt(hand) {
    return `My hand (${hand.length} cards): ${handStr(hand)}
I won the bid. I must choose a trump suit BEFORE seeing the kitty.
Trump cards beat all other suits. Pick the suit where I have the most and strongest cards.

Think briefly about the best trump suit, then on the final line write ONLY: "trump ♠", "trump ♥", "trump ♦", or "trump ♣"`;
}

function buildExchangePrompt(hand, trump) {
    return `My hand (${hand.length} cards): ${handStr(hand)}
Trump: ${trump}

I must choose exactly 4 cards from my hand to bury face-down. After burying I will receive 4 unknown kitty cards, ending up with 12 cards.
Strategy: Keep high cards and trump cards. Bury low non-trump cards. Bury from short suits to create voids for future ruffing.

Think briefly about which 4 cards to bury, then on the final line write ONLY: "bury X,X,X,X" where each X is a card from my hand in format suit+rank (e.g. ♥2,♦3,♣4,♠5)`;
}

function buildPlayPrompt(hand, currentTrick, trump, roundScores, scores, seats, playedCardsHistory) {
    const leadSuit = currentTrick.length > 0 ? currentTrick[0].card.suit : null;
    const playedCards = currentTrick.map(t => {
        const player = seats.find(s => s?.id === t.playerId);
        return `${cardStr(t.card)} (${player?.name || '?'})`;
    }).join(', ');

    // Summarise played cards by suit so the bot knows what's gone
    const gone = { '♠': [], '♥': [], '♦': [], '♣': [] };
    playedCardsHistory.forEach(t => gone[t.card.suit].push(t.card.rank));
    const goneSummary = Object.entries(gone)
        .filter(([, ranks]) => ranks.length > 0)
        .map(([suit, ranks]) => `${suit}: ${ranks.join(' ')}`)
        .join('  |  ');

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
Cards already played this round: ${goneSummary || 'none yet'}
Cards played in this trick: ${playedCards || 'none (I lead)'}
Trump: ${trump}${leadSuit ? `\nLead suit: ${leadSuit}` : ''}

${rules}

Round tricks taken: ${roundScoreStr}

Think briefly about the best card to play, then on the final line write ONLY: "play ♠A" (format: "play " + suit + rank)`;
}

// --- Response Parsers ---

function parseBiddingResponse(response, minBid) {
    if (response === 'pass') return { amount: 0 };
    const match = response.match(/bid\s*(\d+)/);
    if (match) {
        const amount = parseInt(match[1]);
        if (amount >= minBid && amount <= 7) return { amount };
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
    const remainingHand = [...hand]; // working copy to prevent duplicate matches

    for (const part of parts) {
        const suit = suits.find(s => part.includes(s));
        if (!suit) return null;
        const rank = part.replace(suit, '').trim().toUpperCase();
        if (!ranks.includes(rank)) return null;
        const cardIdx = remainingHand.findIndex(c => c.suit === suit && c.rank === rank);
        if (cardIdx === -1) return null;
        cards.push(remainingHand[cardIdx]);
        remainingHand.splice(cardIdx, 1); // remove so it can't be matched again
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

// --- Rule-based Logic ---

function ruleBid(room, botId) {
    const seatIndex = room.seats.findIndex(s => s?.id === botId);
    const hand = room.hands[seatIndex];
    const { hcp, longestSuit } = handStrength(hand);
    const minBid = room.winningBid.amount > 0 ? room.winningBid.amount + 1 : 5;

    // 12-card hands average ~9-10 HCP; threshold must be lower than 13-card bridge standards
    const shouldBid = hcp >= 9 && longestSuit >= 4 && minBid <= 7;
    const bidAmount = Math.min(minBid, 7);
    if (shouldBid) {
        console.log(`[BOT] Rule bid: ${bidAmount} (hcp=${hcp}, longestSuit=${longestSuit})`);
        room.bid(botId, bidAmount);
    } else {
        console.log(`[BOT] Rule bid: pass (hcp=${hcp}, longestSuit=${longestSuit})`);
        room.bid(botId, 0);
    }
}

function ruleTrump(room, botId, hand) {
    // Pick suit with highest score: count + weighted HCP per suit
    const suits = ['♠', '♥', '♦', '♣'];
    const scores = {};
    suits.forEach(s => {
        const cards = hand.filter(c => c.suit === s);
        const hcp = cards.reduce((sum, c) => sum + ({ A: 4, K: 3, Q: 2, J: 1 }[c.rank] || 0), 0);
        scores[s] = cards.length * 2 + hcp;
    });
    const suit = suits.sort((a, b) => scores[b] - scores[a])[0];
    console.log(`[BOT] Rule trump: ${suit}`);
    room.selectTrump(botId, suit);
}

function ruleExchange(room, botId, hand, trump) {
    // Score each card: higher = keep, lower = bury
    // Keep: trump, aces, kings, cards in long suits
    // Bury: low non-trump singletons/doubletons first
    const suitCounts = { '♠': 0, '♥': 0, '♦': 0, '♣': 0 };
    hand.forEach(c => suitCounts[c.suit]++);

    const scored = hand.map(c => {
        let score = getRankVal(c.rank); // base: rank value
        if (c.suit === trump) score += 20; // strongly keep trump
        score += suitCounts[c.suit]; // keep from long suits
        return { card: c, score };
    });

    scored.sort((a, b) => a.score - b.score); // lowest score = bury first
    const tobury = scored.slice(0, 4).map(s => s.card);
    console.log(`[BOT] Rule exchange: burying ${tobury.map(c => c.suit + c.rank).join(',')}`);
    room.exchangeCards(botId, tobury);
}

function rulePlay(room, botId, seatIndex) {
    const hand = room.hands[seatIndex];
    const legal = hand.filter(c => room.isValidMove(hand, c, room.currentTrick));
    const sorted = legal.sort((a, b) => getRankVal(a.rank) - getRankVal(b.rank));
    const card = sorted[0];
    console.log(`[BOT] Rule play: ${card.suit}${card.rank}`);
    room.playCard(botId, card);
}

// Returns true if this play situation is simple enough to skip Claude
function canSkipClaudeForPlay(hand, currentTrick, trump) {
    const legal = hand.filter(c => {
        // We don't have room ref here so just use the hand; caller already checked legal.length > 1
        return true;
    });

    const leadSuit = currentTrick.length > 0 ? currentTrick[0].card.suit : null;
    const hasLead = leadSuit && hand.some(c => c.suit === leadSuit);
    const hasTrump = hand.some(c => c.suit === trump);

    // Void in both lead suit and trump — all options lose, just dump lowest
    if (leadSuit && !hasLead && !hasTrump) return true;

    // Must play trump but already losing to higher trump on table — dump lowest trump
    if (leadSuit && !hasLead && hasTrump) {
        const highestTrumpOnTable = currentTrick
            .filter(t => t.card.suit === trump)
            .reduce((best, t) => (!best || getRankVal(t.card.rank) > getRankVal(best.rank)) ? t.card : best, null);
        const myTrumps = hand.filter(c => c.suit === trump).sort((a, b) => getRankVal(a.rank) - getRankVal(b.rank));
        // If my highest trump still can't beat table — all trump options lose
        if (highestTrumpOnTable && getRankVal(myTrumps[myTrumps.length - 1].rank) < getRankVal(highestTrumpOnTable.rank)) {
            return true;
        }
    }

    return false;
}

// --- Main Decision Function ---

async function botDecide(room, seatIndex) {
    const bot = room.seats[seatIndex];
    if (!bot) return;
    const isAutopilot = room.autopilotPlayers?.has(bot.id);
    if (!bot.isBot && !isAutopilot) return;

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
            if (minBid > 12) {
                console.log(`[BOT] ${bot.name}: min bid ${minBid} exceeds 12, forced pass`);
                room.bid(botId, 0);
                return;
            }
            const prompt = buildBiddingPrompt(hand, room.winningBid, room.activeBidders || []);
            const response = await askClaude(prompt, bot.name, 'BIDDING');
            if (!room.seats[seatIndex]?.isBot && !room.autopilotPlayers?.has(room.seats[seatIndex]?.id)) return;
            const action = parseBiddingResponse(response, minBid);
            if (action) {
                room.bid(botId, action.amount);
            } else {
                ruleBid(room, botId);
            }

        } else if (room.state === 'TRUMP_SELECTION') {
            ruleTrump(room, botId, hand);

        } else if (room.state === 'EXCHANGE_CARDS') {
            ruleExchange(room, botId, hand, room.trump);

        } else if (room.state === 'PLAYING') {
            const legal = hand.filter(c => room.isValidMove(hand, c, room.currentTrick));

            // Skip Claude when only one option or situation is unambiguous
            if (legal.length === 1) {
                console.log(`[BOT] ${bot.name}: only one legal card, playing directly`);
                room.playCard(botId, legal[0]);
                return;
            }
            if (canSkipClaudeForPlay(hand, room.currentTrick, room.trump)) {
                console.log(`[BOT] ${bot.name}: unambiguous losing position, using rule play`);
                rulePlay(room, botId, seatIndex);
                return;
            }

            const prompt = buildPlayPrompt(hand, room.currentTrick, room.trump, room.roundScores, room.scores, room.seats, room.playedCardsHistory || []);
            const response = await askClaude(prompt, bot.name, 'PLAY');
            // Re-check: seat may have been taken over / autopilot disabled while API call was in flight
            const currentSeat = room.seats[seatIndex];
            if (!currentSeat?.isBot && !room.autopilotPlayers?.has(currentSeat?.id)) {
                console.log(`[BOT] ${bot.name}: bot/autopilot no longer active, discarding response`);
                return;
            }
            console.log(`[BOT] ${bot.name} PLAY response: "${response}"`);
            const action = parsePlayResponse(response, hand, room);
            if (action) {
                room.playCard(botId, action.card);
            } else {
                rulePlay(room, botId, seatIndex);
            }
        }

    } catch (err) {
        console.error(`[BOT] ${bot.name} Claude API error: ${err.message}`);
        try {
            if (room.state === 'BIDDING') ruleBid(room, botId);
            else if (room.state === 'TRUMP_SELECTION') ruleTrump(room, botId, hand);
            else if (room.state === 'EXCHANGE_CARDS') ruleExchange(room, botId, hand, room.trump);
            else if (room.state === 'PLAYING') rulePlay(room, botId, seatIndex);
        } catch (fallbackErr) {
            console.error(`[BOT] ${bot.name} rule fallback also failed: ${fallbackErr.message}`);
        }
    }
}

module.exports = { botDecide };
