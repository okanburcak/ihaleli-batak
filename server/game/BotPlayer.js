const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BOT_MODEL = process.env.BOT_MODEL || 'claude-haiku-4-5-20251001';

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

async function askClaude(prompt) {
    const msg = await client.messages.create({
        model: BOT_MODEL,
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }]
    });
    // Extract the last non-empty line — reasoning comes first, decision is last
    const lines = msg.content[0].text.trim().split('\n').map(l => l.trim()).filter(Boolean);
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
- HCP >= 14 or longest suit >= 5 with HCP >= 10: bid aggressively
- HCP 10-13 with longest suit >= 4: bid ${minBid} if it is <= 7
- HCP < 8: pass
- Remember: you pick up 4 kitty cards if you win the bid

Think briefly about whether to bid or pass, then on the final line write ONLY: "bid ${minBid}" through "bid 12" OR "pass"`;
}

function buildTrumpPrompt(hand) {
    return `My hand (${hand.length} cards): ${handStr(hand)}
I won the bid. I must choose a trump suit BEFORE seeing the kitty.
Trump cards beat all other suits. Pick the suit where I have the most and strongest cards.

Think briefly about the best trump suit, then on the final line write ONLY: "trump ♠", "trump ♥", "trump ♦", or "trump ♣"`;
}

function buildExchangePrompt(hand, kitty, trump) {
    return `My hand (${hand.length} cards): ${handStr(hand)}
Kitty - 4 cards I will automatically receive: ${handStr(kitty)}
Trump: ${trump}

I must choose exactly 4 cards from MY HAND to discard. I will then hold my remaining 8 + the 4 kitty cards = 12 cards.
Strategy: Keep high cards and trump cards. Discard low non-trump cards. Discard from short suits to create voids.

Think briefly about which 4 cards to discard, then on the final line write ONLY: "bury X,X,X,X" where each X is a card from my hand in format suit+rank (e.g. ♥2,♦3,♣4,♠5)`;
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

// --- Fallback Logic (rule-based, always legal) ---

function fallbackBid(room, botId) {
    const seatIndex = room.seats.findIndex(s => s?.id === botId);
    const hand = room.hands[seatIndex];
    const { hcp, longestSuit } = handStrength(hand);
    const minBid = room.winningBid.amount > 0 ? room.winningBid.amount + 1 : 5;

    // Bid minimum if hand is strong enough, otherwise pass
    const shouldBid = (hcp >= 14) || (hcp >= 10 && longestSuit >= 4 && minBid <= 7);
    if (shouldBid && minBid <= 12) {
        console.log(`[BOT] Fallback bid: ${minBid} (hcp=${hcp}, longestSuit=${longestSuit})`);
        room.bid(botId, minBid);
    } else {
        console.log(`[BOT] Fallback: passing bid (hcp=${hcp}, longestSuit=${longestSuit})`);
        room.bid(botId, 0);
    }
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
            if (minBid > 12) {
                console.log(`[BOT] ${bot.name}: min bid ${minBid} exceeds 12, forced pass`);
                room.bid(botId, 0);
                return;
            }
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
            const legal = hand.filter(c => room.isValidMove(hand, c, room.currentTrick));
            if (legal.length === 1) {
                console.log(`[BOT] ${bot.name}: only one legal card (${legal[0].suit}${legal[0].rank}), playing directly`);
                room.playCard(botId, legal[0]);
                return;
            }
            const prompt = buildPlayPrompt(hand, room.currentTrick, room.trump, room.roundScores, room.scores, room.seats, room.playedCardsHistory || []);
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
