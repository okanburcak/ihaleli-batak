# Bot → Human Takeover Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let a human take over a bot's seat mid-game by clicking it in the lobby, with a seamless hand/state handoff and an in-game notice to other players.

**Architecture:** Four small, independent changes: (1) expose `isBot` in the room list API, (2) add a bot-takeover path in `Room.addPlayer()`, (3) add `lastEvent` broadcast for the in-game banner, (4) update lobby UI to make bot seats clickable, and (5) guard `botDecide()` against acting after being replaced.

**Tech Stack:** Node.js + Express (server), React 18 + Tailwind (client), existing polling mechanism for `lastEvent`.

---

### Task 1: Expose `isBot` in the room list API

**Files:**
- Modify: `server/index.js:126`

**Step 1: Add `isBot` to the seats map**

In `app.get('/api/rooms', ...)`, change:
```js
seats: r.seats.map(s => s ? { name: s.name, connected: s.connected } : null),
```
to:
```js
seats: r.seats.map(s => s ? { name: s.name, connected: s.connected, isBot: !!s.isBot } : null),
```

**Step 2: Verify manually**

Run server (`node index.js`), add a bot to a room, call `GET /api/rooms` — confirm the bot seat has `"isBot": true`.

**Step 3: Commit**
```bash
git add server/index.js
git commit -m "feat: expose isBot flag in room list API"
```

---

### Task 2: Add bot-takeover path in `Room.addPlayer()`

**Files:**
- Modify: `server/game/Room.js:156-198` (the `existingPlayer` branch)

**Step 1: Write the failing test in `server/test_bot.js`**

Add at the bottom (before `module.exports` if any):
```js
// TEST: bot takeover
{
    const room = new Room('takeover-test');
    // Fill 3 human seats manually
    room.addPlayer('Human1', null, 0);
    room.addBotPlayer(1);
    room.addBotPlayer(2);
    room.addBotPlayer(3);

    const result = room.addPlayer('NewHuman', null, 1); // take bot seat 1
    console.assert(result.success === true, 'Takeover should succeed');
    console.assert(room.seats[1].name === 'NewHuman', 'Seat 1 should be NewHuman');
    console.assert(room.seats[1].isBot === undefined || room.seats[1].isBot === false, 'Seat 1 should no longer be a bot');
    console.log('  ✓ bot takeover succeeds and seat is now human');
}
```

Run: `node test_bot.js` — expect the new test to fail with "Seat accepted and occupied".

**Step 2: Add the bot-takeover branch**

In `Room.addPlayer()`, the `if (existingPlayer)` block currently checks `if (existingPlayer.connected)` and returns an error. Add a bot check BEFORE that:

```js
if (existingPlayer) {
    // Bot takeover — always allowed
    if (existingPlayer.isBot) {
        const id = crypto.randomUUID();
        const token = crypto.randomUUID();
        // Remove bot from players list
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
        // Preserve scores
        if (this.scores[existingPlayer.id] !== undefined) {
            this.scores[newPlayer.id] = this.scores[existingPlayer.id];
            delete this.scores[existingPlayer.id];
        }
        if (this.roundScores[existingPlayer.id] !== undefined) {
            this.roundScores[newPlayer.id] = this.roundScores[existingPlayer.id];
            delete this.roundScores[existingPlayer.id];
        }
        // Broadcast event for in-game banner
        this.lastEvent = { id: crypto.randomUUID(), type: 'bot_replaced', seatIndex: seatToJoin, newName: newPlayer.name };
        return { success: true, token, playerId: id, message: 'Bot seat taken over.' };
    }

    // Existing connected human — reject
    if (existingPlayer.connected) {
        return { success: false, message: 'Seat accepted and occupied.' };
    }
    // ... rest of disconnected-takeover logic unchanged
```

**Step 3: Run test**
```bash
node test_bot.js
```
Expected: all tests pass including the new takeover test.

**Step 4: Commit**
```bash
git add server/game/Room.js server/test_bot.js
git commit -m "feat: allow human to take over bot seat in addPlayer()"
```

---

### Task 3: Expose `lastEvent` in public state

**Files:**
- Modify: `server/game/Room.js` — `constructor` and `getPublicState()`

**Step 1: Initialize in constructor**

Find where `this.lastSound` is initialized and add next to it:
```js
this.lastEvent = null;
```

**Step 2: Expose in `getPublicState()`**

In the returned object, add alongside `lastSound`:
```js
lastEvent: this.lastEvent,
```

**Step 3: Commit**
```bash
git add server/game/Room.js
git commit -m "feat: expose lastEvent in public room state"
```

---

### Task 4: Guard `botDecide()` against acting after replacement

**Files:**
- Modify: `server/game/BotPlayer.js:309-393` — `botDecide()`

**Step 1: Add seat-still-bot check after each async API call**

After `await askClaude(...)` and before calling any room action, add a guard. The pattern to add after every `await askClaude(...)` line:

```js
// Re-check: seat may have been taken over by a human while API call was in flight
if (!room.seats[seatIndex]?.isBot) {
    console.log(`[BOT] ${bot.name}: seat taken over by human, discarding response`);
    return;
}
```

Add this check in all four branches (BIDDING, TRUMP_SELECTION, EXCHANGE_CARDS, PLAYING) — right after the `await askClaude(...)` call and before `parseBiddingResponse` / `parseTrumpResponse` etc.

**Step 2: Commit**
```bash
git add server/game/BotPlayer.js
git commit -m "fix: discard bot API response if seat taken over mid-call"
```

---

### Task 5: Make bot seats clickable in the lobby UI

**Files:**
- Modify: `client/src/App.jsx:506-533` — the seat buttons in the LOBBY view

**Step 1: Update the seat button logic**

Currently:
```js
const isTaken = !!seat;
```

Change to:
```js
const isTaken = !!seat && !seat.isBot;
const isBot = !!seat?.isBot;
```

Update the button's `disabled` to use `isTaken` (not `isBot`).

Update the button's className to include a third style for bot seats:
```js
className={`
    relative p-3 rounded-lg flex flex-col items-center justify-center gap-2 aspect-square transition-all
    ${isTaken
        ? 'bg-green-900/40 border border-green-800 cursor-not-allowed'
        : isBot
            ? 'bg-blue-900/40 border border-blue-600 hover:bg-blue-700 hover:scale-105 cursor-pointer hover:shadow-lg group'
            : 'bg-green-700/30 border border-green-500 hover:bg-green-600 hover:scale-105 cursor-pointer hover:shadow-lg group'
    }
`}
```

Update the label inside the button:
```jsx
{isTaken ? (
    <span className="text-xs text-gray-400 font-mono truncate w-full text-center">{seat.name}</span>
) : isBot ? (
    <>
        <span className="text-lg">🤖</span>
        <span className="text-xs text-blue-300 font-bold group-hover:text-white truncate w-full text-center">{seat.name}</span>
        <span className="text-[10px] text-blue-400 group-hover:text-white">AL</span>
    </>
) : (
    <span className="text-xs text-green-300 font-bold group-hover:text-white">OTUR</span>
)}
```

**Step 2: Verify visually** — run dev server (`npm run dev` in client/), open lobby, confirm bot seats are blue and clickable, human seats are disabled.

**Step 3: Commit**
```bash
git add client/src/App.jsx
git commit -m "feat: bot seats are clickable in lobby for human takeover"
```

---

### Task 6: Show in-game banner on bot replacement

**Files:**
- Modify: `client/src/App.jsx` — add `lastEvent` handling to polling useEffect and a banner component

**Step 1: Add banner state**

Near the top of the `App` component, alongside existing state:
```js
const [botReplacedBanner, setBotReplacedBanner] = useState(null);
const lastEventIdRef = useRef(null);
```

**Step 2: Handle `lastEvent` in the polling useEffect**

In the `fetchState` function (where `setRoomState(data)` is called), add:
```js
if (data.lastEvent && data.lastEvent.id !== lastEventIdRef.current) {
    lastEventIdRef.current = data.lastEvent.id;
    if (data.lastEvent.type === 'bot_replaced') {
        setBotReplacedBanner(`🤖 Bot ${data.lastEvent.seatIndex + 1} → ${data.lastEvent.newName}`);
        setTimeout(() => setBotReplacedBanner(null), 3000);
    }
}
```

**Step 3: Render the banner**

Inside the game view (near the top of the return in `renderContent`, above `<GameBoard>`):
```jsx
{botReplacedBanner && (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-blue-700 text-white px-6 py-2 rounded-full shadow-xl text-sm font-bold animate-fade-in">
        {botReplacedBanner}
    </div>
)}
```

**Step 4: Commit**
```bash
git add client/src/App.jsx
git commit -m "feat: show banner when human takes over a bot seat"
```

---

### Task 7: Final integration test

**Step 1: Start server and client**
```bash
# Terminal 1
cd server && node index.js

# Terminal 2
cd client && npm run dev
```

**Step 2: Manual test sequence**
1. Open two browser tabs
2. Tab 1: create a room, add 3 bots
3. Tab 2: open lobby — confirm bot seats show 🤖 and are clickable
4. Tab 2: click a bot seat, enter a name
5. Confirm: Tab 2 joins mid-game with the bot's hand
6. Confirm: Tab 1 shows the banner "🤖 Bot N → [name]"
7. Confirm: the replaced bot stops acting (no more auto-plays for that seat)

**Step 3: Push and deploy**
```bash
git push
```
