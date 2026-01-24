const express = require('express');
const cors = require('cors');
const Room = require('./game/Room');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

// Game State Storage
const rooms = {};

// Helper to get room
const getRoom = (roomId) => {
    if (!rooms[roomId]) {
        rooms[roomId] = new Room(roomId);
    }
    return rooms[roomId];
};

// --- Routes ---

// List Rooms (Lobby)
app.get('/api/rooms', (req, res) => {
    // Return list of rooms with occupancy info
    const roomList = Object.keys(rooms).map(id => {
        const r = rooms[id];
        return {
            id: r.roomId,
            playerCount: r.players.filter(p => !!p).length,
            seats: r.seats.map(s => s ? { name: s.name, connected: s.connected } : null),
            state: r.state,
            lastSeen: Date.now() // Placeholder
        };
    });
    res.json(roomList);
});

// Create Room
app.post('/api/rooms', (req, res) => {
    // Generate Random 6 digit Room ID
    const roomId = Math.floor(100000 + Math.random() * 900000).toString();
    const room = getRoom(roomId); // This creates it
    res.json({ roomId });
});

// Join Room
app.post('/api/rooms/:roomId/join', (req, res) => {
    const { roomId } = req.params;
    const { name, code, seatIndex } = req.body; // Added seatIndex

    const room = getRoom(roomId);
    const result = room.addPlayer(name, code, seatIndex);

    if (result.success) {
        res.json(result);
    } else {
        res.status(400).json(result);
    }
});

// Leave Room
app.post('/api/rooms/:roomId/leave', (req, res) => {
    const { roomId } = req.params;
    const playerId = req.headers['x-player-id'];

    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const result = room.removePlayer(playerId);
    // Even if error (e.g. not found), we can consider it a success for the client
    // or return the error. Let's return the result.
    if (result.success) {
        res.json(result);
    } else {
        res.status(400).json(result);
    }
});

// Get State (Polling Endpoint)
app.get('/api/rooms/:roomId/state', (req, res) => {
    const { roomId } = req.params;
    const playerId = req.headers['x-player-id']; // Client sends their token/ID

    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (!playerId) {
        // Public State only (if needed, or error)
        return res.json(room.getPublicState());
    }

    const state = room.getPlayerState(playerId);
    if (!state) return res.status(403).json({ error: 'Player not in room' });

    res.json(state);
});

// Start Game (Admin)
app.post('/api/rooms/:roomId/start', (req, res) => {
    const { roomId } = req.params;
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Auth check: Is it admin?
    // Simplified: Any player in the room implies "someone in the room triggered it"
    // Better: Check player ID from header if it is admin
    const playerId = req.headers['x-player-id'];
    const player = room.players.find(p => p.id === playerId);

    if (!player || !player.isAdmin) {
        return res.status(403).json({ error: 'Only Admin can start' });
    }

    room.startGame();
    res.json({ success: true });
});

// Bid
app.post('/api/rooms/:roomId/bid', (req, res) => {
    const { roomId } = req.params;
    const { amount } = req.body;
    const playerId = req.headers['x-player-id'];

    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const result = room.bid(playerId, amount);
    if (result.error) return res.status(400).json(result);
    res.json(result);
});

// Exchange
app.post('/api/rooms/:roomId/exchange', (req, res) => {
    const { roomId } = req.params;
    const { cards } = req.body;
    const playerId = req.headers['x-player-id'];

    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const result = room.exchangeCards(playerId, cards);
    if (result.error) return res.status(400).json(result);
    res.json(result);
});

// Select Trump
app.post('/api/rooms/:roomId/trump', (req, res) => {
    const { roomId } = req.params;
    const { suit } = req.body;
    const playerId = req.headers['x-player-id'];

    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const result = room.selectTrump(playerId, suit);
    if (result.error) return res.status(400).json(result);
    res.json(result);
});

// Play Card
app.post('/api/rooms/:roomId/play', (req, res) => {
    const { roomId } = req.params;
    const { card } = req.body;
    const playerId = req.headers['x-player-id'];

    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const result = room.playCard(playerId, card);
    if (result.error) return res.status(400).json(result);
    res.json(result);
});


// Debug Endpoint
app.get('/api/debug/:roomId', (req, res) => {
    const { roomId } = req.params;
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json({
        ...room,
        players: room.players,
        hands: room.hands,
        deck: 'hidden'
    });
});

// Force End Round
app.post('/api/debug/:roomId/end-round', (req, res) => {
    const { roomId } = req.params;
    const room = rooms[roomId];
    if (room) {
        room.endRound();
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Room not found' });
    }
});

// Set Scores
app.post('/api/debug/:roomId/set-scores', (req, res) => {
    const { roomId } = req.params;
    const { scores } = req.body;
    const room = rooms[roomId];
    if (room) {
        room.scores = scores;
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Room not found' });
    }
});

// --- Super Admin Routes ---

// List all rooms
app.get('/api/admin/rooms', (req, res) => {
    const roomList = Object.keys(rooms).map(id => {
        const r = rooms[id];
        return {
            id: r.roomId,
            playerCount: r.players.filter(p => !!p).length,
            state: r.state,
            players: r.players.filter(p => !!p).map(p => ({ id: p.id, name: p.name, isAdmin: p.isAdmin })),
            lastSeen: Date.now() // Could be improved with actual last activity
        };
    });
    res.json(roomList);
});

// Reset Room (Clear state but keep players if possible, or full wipe?)
// "Reset" usually means restart game. "Delete" means remove from memory.
app.post('/api/admin/rooms/:roomId/reset', (req, res) => {
    const { roomId } = req.params;
    if (rooms[roomId]) {
        // Create new room instance to wipe state
        rooms[roomId] = new Room(roomId);
        res.json({ success: true, message: 'Room reset successfully' });
    } else {
        res.status(404).json({ error: 'Room not found' });
    }
});

// Delete Room
app.delete('/api/admin/rooms/:roomId', (req, res) => {
    const { roomId } = req.params;
    if (rooms[roomId]) {
        delete rooms[roomId];
        res.json({ success: true, message: 'Room deleted' });
    } else {
        res.status(404).json({ error: 'Room not found' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
