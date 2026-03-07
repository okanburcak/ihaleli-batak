---
name: ihaleli-batak-patterns
description: Coding patterns and conventions extracted from the ihaleli-batak project git history (200 commits). Use when working on this project.
version: 1.0.0
source: local-git-analysis
analyzed_commits: 200
---

# İhaleli Batak — Project Patterns

## Project Overview

Turkish trick-taking card game (İhaleli Batak) for 4 players. Node.js + Express backend with in-memory state, React 18 + Vite + Tailwind frontend, Claude AI bots, Web Push notifications, PWA support.

## Commit Conventions

Strictly follows **Conventional Commits**:
- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation / design docs only
- `ci:` — GitHub Actions / deploy changes
- `test:` — Test-only changes
- `perf:` — Performance improvement

Always add `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` trailer when Claude writes the commit.

## Architecture

```
server/
├── index.js              # Express routes + web-push setup + Socket.IO
├── game/
│   ├── Room.js           # Core game state machine (the most-changed file)
│   ├── BotPlayer.js      # Claude AI bot (askClaude, botDecide, fallbacks)
│   └── Deck.js           # Card deck + dealing
├── test_bot.js           # Unit tests (node test_bot.js — no test framework)
└── data/                 # Runtime data: push-subscriptions.json, bot-reasoning.log

client/src/
├── App.jsx               # Main component + all game views + polling loop
├── api.js                # Fetch wrappers (all API calls here)
├── components/
│   ├── GameBoard.jsx     # Board layout, trump indicator, scores
│   └── Card.jsx          # Single card component
└── contexts/
    └── SoundContext.jsx  # Audio playback + mute state (persisted to localStorage)
```

## Key Patterns

### State Machine (Room.js)
Game moves through states: `WAITING → BIDDING → TRUMP_SELECTION → EXCHANGE_CARDS → PLAYING → WAITING/GAME_OVER`

Always check `room.state` before acting. State transitions call `this.checkBotTurn()` at the end.

### Polling Architecture
Frontend polls `/api/rooms/:id/state` every 1 second. No WebSockets for game state (Socket.IO is only for voice chat signaling). Effects on state changes are detected by comparing `prevRoomState.current` with new state.

### Broadcasting Events to All Clients
Use the `lastSound` / `lastEvent` pattern:
```js
// Server: set a unique-ID object on room state
this.lastEvent = { id: crypto.randomUUID(), type: 'something', ...data };

// Client: detect new id via ref, act once
if (data.lastEvent?.id !== lastEventIdRef.current) {
    lastEventIdRef.current = data.lastEvent.id;
    // act
}
```

### Bot Decision Flow (BotPlayer.js)
1. Build a prompt with full game context
2. Call `askClaude(prompt, botName, phase)` — logs full reasoning to `server/data/bot-reasoning.log`
3. Extract last line as the decision (chain-of-thought: reasoning first, decision last)
4. **Guard after every `await`**: check `room.seats[seatIndex]?.isBot` still true before acting
5. If parse fails, use rule-based fallback (always legal)
6. If only one legal move, skip Claude entirely

### Player ID vs Push Client ID
- `playerId` — ephemeral, generated fresh on each room join
- `pushClientId` — persistent UUID in `localStorage('batak_push_client_id')`, exists before joining any room
- Push subscriptions are keyed by `pushClientId`, linked to `playerId` on join

### Security Pattern
Routes use `resolvePlayer` → `requirePlayer` middleware chain to authenticate via token header. Never expose `token` in public state. Bot seats expose `isBot: true`, not tokens.

## Deployment

- **CI/CD**: GitHub Actions → SSH deploy to VPS (`.github/workflows/deploy.yml`)
- **Stack**: PM2 process manager + Nginx reverse proxy (handles CORS, static files)
- **Secrets**: `ANTHROPIC_API_KEY`, `VAPID_*` keys stored as GitHub Secrets, written to `server/.env` during deploy
- **No CORS middleware** on Express — Nginx handles it in production

## Testing

```bash
cd server && node test_bot.js   # Run all 23 unit tests (no framework, plain assertions)
cd client && npm run build       # Build check before committing client changes
```

Tests live in `server/test_bot.js`. Each test block is wrapped in `{ }` scope. Use `pass(condition, message)` helper. Run after every server-side change.

## UI Conventions

- **Tailwind only** — no CSS modules, no inline styles
- Dark green felt table theme (`bg-green-900`, `bg-stone-900`)
- Yellow accents (`text-yellow-400`, `border-yellow-600`) for highlights
- Turkish UI strings (`KOZ` = trump, `İHALE` = bid, `OTUR` = sit, `AL` = take)
- Red suits (`text-red-400`) for ♥/♦, dark pill on white bg for ♠/♣
- Bot seats: blue theme (`bg-blue-900/40`, `border-blue-600`)
- Fixed overlays use `z-50`, game board elements use lower z

## Common Workflows

### Adding a New Game Event Broadcast
1. Add field to `Room` constructor (`this.lastFoo = null`)
2. Expose in `getPublicState()`
3. Set it where the event occurs (`this.lastFoo = { id: crypto.randomUUID(), ... }`)
4. Handle in client `updateState()` with id-based dedup ref

### Adding a New API Endpoint
1. Add route in `server/index.js` with `resolvePlayer, requirePlayer` middleware
2. Add wrapper in `client/src/api.js`
3. Call from `App.jsx`

### Adding a New Bot Prompt
1. Write `buildXPrompt(...)` function in `BotPlayer.js`
2. Call `askClaude(prompt, bot.name, 'PHASE_NAME')`
3. Add guard: `if (!room.seats[seatIndex]?.isBot) return;`
4. Write `parseXResponse()` + fallback function
5. Add test case in `test_bot.js`
