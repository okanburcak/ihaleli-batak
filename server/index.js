const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all for dev
        methods: ["GET", "POST"]
    }
});

const PORT = 3000;

// Game State Storage (In-memory for now)
const rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Handle player leaving room logic here
    });

    // Example event listener
    socket.on('join_room', async (roomId, playerName, code) => {
        await socket.join(roomId);

        // Initialize room if not exists
        if (!rooms[roomId]) {
            // Need to pass io instance to Room to emit events
            const Room = require('./game/Room');
            rooms[roomId] = new Room(roomId, io);
        }

        const room = rooms[roomId];
        const result = room.addPlayer(socket, playerName, code);

        if (!result.success) {
            socket.emit('error', result.message);
            // Optionally leave the room if join failed logic-wise
            socket.leave(roomId);
            return;
        }

        // Handle Admin Start Game Listener?
        socket.on('start_game', () => {
            if (result.message.includes('Admin')) { // Simple check, better to verify socket match
                room.startGame(); // Add safety inside Room.startGame too
            }
        });

        // Forward Game Actions
        socket.on('bid', (amount) => room.handleBid(socket.id, amount));
        socket.on('select_trump', (suit) => room.handleTrumpSelection(socket.id, suit));
        socket.on('exchange_cards', (cards) => room.handleCardExchange(socket.id, cards));
        socket.on('play_card', (card) => room.handleCardPlay(socket.id, card));
    });

    // Admin API
    socket.on('admin_get_players', () => {
        // Collect all connected sockets
        const allSockets = [];
        io.sockets.sockets.forEach((s) => {
            // Find room for player
            let playerRoom = "Lobby";
            let playerName = "Unknown/Guest";

            for (const [roomId, room] of Object.entries(rooms)) {
                const p = room.players.find(p => p.id === s.id);
                if (p) {
                    playerRoom = roomId;
                    playerName = p.name;
                    break;
                }
            }

            allSockets.push({
                id: s.id,
                name: playerName,
                room: playerRoom,
                connected: s.connected
            });
        });
        socket.emit('admin_player_list', allSockets);
    });

    socket.on('admin_kick_player', (targetSocketId) => {
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
            targetSocket.emit('kicked', 'You have been kicked by the administrator.');
            targetSocket.disconnect(true);
            console.log(`Admin kicked player ${targetSocketId}`);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
