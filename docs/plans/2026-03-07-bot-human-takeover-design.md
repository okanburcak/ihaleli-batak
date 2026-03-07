# Design: Bot → Human Takeover Mid-Game

**Date:** 2026-03-07
**Status:** Approved

## Summary

Allow a human player to take over a bot's seat at any point during a game — including mid-round — with a seamless handoff and an in-game notice to other players.

## User Flow

1. Human opens the room from the lobby.
2. Bot-occupied seats appear as joinable (labeled "🤖 Bot" to distinguish from empty seats).
3. Human clicks the seat and confirms.
4. Human immediately receives the bot's current hand and continues playing.
5. All players at the table see a brief in-game banner: "🤖 Bot 2 replaced by [Name]".

## Server Changes

### `Room.addPlayer()`
- Add a new branch: if `targetSeatIndex` points to a seat with `isBot: true`, remove the bot player from `this.players`, replace `this.seats[seatIndex]` with the new human player object, and preserve `this.hands[seatIndex]` (no change to the hand).
- Return the standard `{ success, token, playerId }` response.
- Set `this.lastEvent = { type: 'bot_replaced', seatIndex, newName }` for the banner.

### `BotPlayer.botDecide()`
- After the Claude API call resolves, check if the seat is still a bot before calling any room action. If the seat has been taken over by a human, discard the response silently.

### `checkBotTurn()`
- Already iterates seats checking `isBot` — no change needed as long as the seat object is replaced cleanly.

## Client Changes

### Lobby / Seat Picker
- When `state === 'LOBBY'` and a seat has `isBot: true`, render it as clickable with a "🤖 Bot" label (same click handler as an empty seat).

### In-Game Banner
- Poll returns `lastEvent: { type: 'bot_replaced', seatIndex, newName }`.
- Show a dismissing banner for ~3 seconds: "🤖 Bot [N] replaced by [Name]".
- Clear `lastEvent` after first read (same pattern as `lastSound`).

## Edge Cases

| Scenario | Handling |
|---|---|
| Bot mid-API-call when human joins | Response discarded — seat is no longer `isBot` |
| It's the bot's turn right now | Human inherits the turn immediately |
| Bot is the bid winner mid-exchange | Human takes over, must complete the exchange |
| All 3 bots replaced | Works independently per seat |
| Human tries to take a human seat | Rejected — existing seat-taken logic applies |

## Out of Scope

- Admin-initiated bot kick (not needed; human self-selects)
- Push notification on takeover (in-game banner is sufficient)
- Waiting until next round (seamless mid-round takeover is the goal)
