const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const Room = require('./game/Room');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for simplicity (or configure strictly for prod)
        methods: ["GET", "POST"]
    }
});

app.use(express.json());

const PORT = 3000;
// Game State Storage
const rooms = {};

// Helper to get room, optionally creating with settings
const getRoom = (roomId, winningScore = 51) => {
    if (!rooms[roomId]) {
        rooms[roomId] = new Room(roomId, winningScore);
    }
    return rooms[roomId];
};

// Middleware: resolve x-player-id token to public player ID
const resolvePlayer = (req, res, next) => {
    const token = req.headers['x-player-id'];
    const room = rooms[req.params.roomId];
    if (!token) {
        req.playerId = null;
        return next();
    }
    if (!room) {
        req.playerId = null;
        return next();
    }
    req.playerId = room.resolveToken(token);
    return next();
};

// Middleware: require valid player token
const requirePlayer = (req, res, next) => {
    if (!req.playerId) {
        return res.status(401).json({ error: 'Invalid or missing player token' });
    }
    return next();
};



// --- Routes ---

// List Rooms (Lobby)
app.get('/api/rooms', (req, res) => {
    const roomList = Object.keys(rooms).map(id => {
        const r = rooms[id];
        return {
            id: r.roomId,
            playerCount: r.players.filter(p => !!p).length,
            seats: r.seats.map(s => s ? { name: s.name, connected: s.connected } : null),
            state: r.state,
            winningScore: r.winningScore,
            lastSeen: Date.now()
        };
    });
    res.json(roomList);
});

// Create Room
app.post('/api/rooms', (req, res) => {
    const roomId = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`[CREATE ROOM] Request for room ${roomId}, winningScore: ${req.body.winningScore}`);
    const { winningScore } = req.body;
    try {
        const room = getRoom(roomId, winningScore);
        console.log(`[CREATE ROOM] Room ${roomId} created.`);
        res.json({ roomId });
    } catch (e) {
        console.error(`[CREATE ROOM] Error creating room ${roomId}:`, e);
        res.status(500).json({ error: 'Failed to create room' });
    }
});

// Join Room
app.post('/api/rooms/:roomId/join', (req, res) => {
    const { roomId } = req.params;
    const { name, code, seatIndex } = req.body;

    const room = getRoom(roomId);
    const result = room.addPlayer(name, code, seatIndex);

    if (result.success) {
        res.json(result);
    } else {
        res.status(400).json(result);
    }
});

// Leave Room
app.post('/api/rooms/:roomId/leave', resolvePlayer, requirePlayer, (req, res) => {
    const { roomId } = req.params;

    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const result = room.removePlayer(req.playerId);
    if (result.success) {
        res.json(result);
    } else {
        res.status(400).json(result);
    }
});

// Get State (Polling Endpoint) - requires authentication
app.get('/api/rooms/:roomId/state', resolvePlayer, requirePlayer, (req, res) => {
    const { roomId } = req.params;

    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const state = room.getPlayerState(req.playerId);
    if (!state) return res.status(403).json({ error: 'Player not in room' });

    res.json(state);
});

// Start Game (Admin)
app.post('/api/rooms/:roomId/start', resolvePlayer, requirePlayer, (req, res) => {
    const { roomId } = req.params;
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const player = room.players.find(p => p.id === req.playerId);
    if (!player || !player.isAdmin) {
        return res.status(403).json({ error: 'Only Admin can start' });
    }

    room.startGame();
    res.json({ success: true });
});

// Bid
app.post('/api/rooms/:roomId/bid', resolvePlayer, requirePlayer, (req, res) => {
    const { roomId } = req.params;
    const { amount } = req.body;

    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const result = room.bid(req.playerId, amount);
    if (result.error) return res.status(400).json(result);
    res.json(result);
});

// Exchange
app.post('/api/rooms/:roomId/exchange', resolvePlayer, requirePlayer, (req, res) => {
    const { roomId } = req.params;
    const { cards } = req.body;

    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const result = room.exchangeCards(req.playerId, cards);
    if (result.error) return res.status(400).json(result);
    res.json(result);
});

// Select Trump
app.post('/api/rooms/:roomId/trump', resolvePlayer, requirePlayer, (req, res) => {
    const { roomId } = req.params;
    const { suit } = req.body;

    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const result = room.selectTrump(req.playerId, suit);
    if (result.error) return res.status(400).json(result);
    res.json(result);
});

// Play Card
app.post('/api/rooms/:roomId/play', resolvePlayer, requirePlayer, (req, res) => {
    const { roomId } = req.params;
    const { card } = req.body;

    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const result = room.playCard(req.playerId, card);
    if (result.error) return res.status(400).json(result);
    res.json(result);
});

// Broadcast Sound
app.post('/api/rooms/:roomId/sound', resolvePlayer, requirePlayer, (req, res) => {
    const { roomId } = req.params;
    const { type } = req.body;

    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const result = room.broadcastSound(type, req.playerId);
    res.json(result);
});

// Redeal (Eli Boz)
app.post('/api/rooms/:roomId/redeal', resolvePlayer, requirePlayer, (req, res) => {
    const { roomId } = req.params;

    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const result = room.requestRedeal(req.playerId);
    res.json(result);
});

// Restart Game (Admin)
app.post('/api/rooms/:roomId/restart', resolvePlayer, requirePlayer, (req, res) => {
    const { roomId } = req.params;

    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const player = room.players.find(p => p.id === req.playerId);
    if (!player || !player.isAdmin) {
        return res.status(403).json({ error: 'Only Admin can restart' });
    }

    const result = room.restartGame();
    res.json(result);
});

// --- Super Admin Routes (protected by admin secret) ---

// List all rooms
app.get('/api/admin/rooms', (req, res) => {
    const roomList = Object.keys(rooms).map(id => {
        const r = rooms[id];
        return {
            id: r.roomId,
            playerCount: r.players.filter(p => !!p).length,
            state: r.state,
            players: r.players.filter(p => !!p).map(p => ({ name: p.name, isAdmin: p.isAdmin })),
            lastSeen: Date.now()
        };
    });
    res.json(roomList);
});

// Reset Room
app.post('/api/admin/rooms/:roomId/reset', (req, res) => {
    const { roomId } = req.params;
    if (rooms[roomId]) {
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

// --- Socket.io Signaling for Voice Chat ---
io.on('connection', (socket) => {
    console.log('[SOCKET] User connected:', socket.id);

    socket.on('join-room', (roomId, userId) => {
        socket.join(roomId);
        console.log(`[SOCKET] User ${userId} (${socket.id}) joined room ${roomId}`);
        // Notify others in room that a new user joined
        socket.to(roomId).emit('user-connected', userId);

        socket.on('disconnect', () => {
            console.log(`[SOCKET] User ${userId} (${socket.id}) disconnected`);
            socket.to(roomId).emit('user-disconnected', userId);
        });
    });

    // WebRTC Signaling: relay offer/answer/candidate to specific user
    socket.on('signal', (data) => {
        // data: { to: targetUserId, from: myUserId, signal: signalData }
        // We broadcast to the room, but client filters by 'to' or we can emit to specific socket if we mapped userId->socketId
        // For simplicity in this small app, we can just broadcast to the room and let clients filter, 
        // OR better: we can store userId->socketId mapping.
        // Let's use room broadcast for now but filtered by the client, or just emit to room. 
        // Actually, 'to' is key. 
        // Since we don't have a global user list easily accessible here without state, let's just broadcast to the room.
        // Clients will ignore signals not meant for them.
        const { roomId } = data;
        if (roomId) {
            socket.to(roomId).emit('signal', data);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
