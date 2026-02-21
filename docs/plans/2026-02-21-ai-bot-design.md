# AI Bot Player Design

**Date:** 2026-02-21
**Feature:** LLM-powered bot player for the ihaleli-batak multiplayer card game

---

## Overview

Add an AI bot player that can join and play Batak games. The bot uses the Claude API to reason about game state and make decisions. It lives entirely inside the server process as a virtual player, occupying a seat just like a human player.

---

## Architecture

### Approach: Virtual Player (in-process)

The bot is a player object with `isBot: true` that occupies a seat in `room.seats[]`. After every game state mutation (bid, card play, etc.), the Room checks if the current turn belongs to a bot and schedules a `setTimeout` (1 second think delay) that:

1. Serializes the relevant game state into a prompt
2. Calls the Claude API via `@anthropic-ai/sdk`
3. Parses the response
4. Calls the appropriate internal Room method (`room.bid()`, `room.playCard()`, etc.)

```
Human Player (HTTP)          Bot Player (in-process)
     │                              │
     ▼                              ▼
POST /api/rooms/:id/play    Room.checkBotTurn()
     │                              │
     └──────────► room.playCard() ◄─┘
                       │
                  BotPlayer.decide(room, seatIndex)
                  → Claude API call
                  → parse response
                  → room.bid() / room.playCard() / etc.
```

### Fallback

If the Claude API fails or returns an illegal move, the bot falls back to a deterministic rule-based legal move (lowest legal card, or lowest valid bid) so the game never stalls.

---

## New Files & Changes

| File | Change |
|------|--------|
| `server/game/BotPlayer.js` | New file: Claude API integration + fallback logic |
| `server/index.js` | Add `POST /api/rooms/:roomId/add-bot` endpoint |
| `server/game/Room.js` | Add `isBot` flag handling + `checkBotTurn()` trigger after state changes |
| `server/package.json` | Add `@anthropic-ai/sdk` dependency |
| `client/src/App.jsx` | Add "Add Bot" button next to empty seats in WAITING state |

---

## Claude API Prompt Strategy

Each game phase gets its own prompt. The system prompt explains the full Batak rules so Claude can reason correctly.

| Phase | Input to Claude | Expected output |
|-------|----------------|-----------------|
| `BIDDING` | My 12 cards, current winning bid, number of active bidders remaining | `bid <n>` or `pass` |
| `TRUMP_SELECTION` | My 12 cards | `trump <suit>` (one of ♠ ♥ ♦ ♣) |
| `EXCHANGE_CARDS` | My 12 cards + 4 kitty cards, chosen trump | `bury <suit><rank>,<suit><rank>,<suit><rank>,<suit><rank>` (4 from my hand) |
| `PLAYING` | My hand, current trick cards so far, trump suit, round scores, total scores | `play <suit><rank>` |

**Important game rule encoded in prompt:**
- Trump is selected BEFORE seeing the kitty
- After selecting trump, the bid winner sees the 4 kitty cards and discards 4 from their original hand to receive the kitty

---

## API Endpoint

### `POST /api/rooms/:roomId/add-bot`

**Auth:** Valid player token required (must be a seated player in the room)
**State constraint:** Only works when `room.state === 'WAITING'`
**Body:** `{ seatIndex: number }` — which empty seat (0–3) to fill with the bot
**Response:** `{ success: true, botName: "Bot 1" }`
**Constraints:**
- Target seat must be empty (`room.seats[seatIndex] === null`)
- Any number of bots allowed (up to all 4 seats)
- Bot names: "Bot 1", "Bot 2", etc.

---

## Frontend

A small **"+ Bot Ekle"** (Add Bot) button appears next to each empty seat card in the WAITING lobby view. Only visible to players who are seated in the room. Clicking calls the new endpoint with the target seat index.

---

## Environment

`ANTHROPIC_API_KEY` must be set in the server's environment (`.env` file or PM2 ecosystem config).

The bot logs its decisions to the server console:
```
[BOT] Bot 1 (seat 2): BIDDING → bid 7
[BOT] Bot 1 (seat 2): PLAYING → play ♠A
[BOT] Bot 1 (seat 2): Claude API failed, using fallback move
```

---

## Bot Lifecycle

- Bot is created when `add-bot` is called, persists until the room is deleted or the game ends
- After `GAME_OVER`, if the game auto-restarts (5s timer in `endRound()`), the bot remains seated and participates in the next round
- Bot players cannot be "kicked" mid-game (same as human players)

---

## Dependencies

```json
"@anthropic-ai/sdk": "^0.24.0"
```

Model: `claude-haiku-4-5-20251001` (fast and cheap for game decisions)
