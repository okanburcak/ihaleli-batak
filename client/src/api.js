const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

let playerId = null;


export const setPlayerId = (id) => {
    playerId = id;
    localStorage.setItem('batak_player_id', id);
};

export const getPlayerId = () => {
    if (!playerId) {
        playerId = localStorage.getItem('batak_player_id');
    }
    return playerId;
};

// Persistent browser-level ID for push subscriptions, exists before joining any room
export const getPushClientId = () => {
    let id = localStorage.getItem('batak_push_client_id');
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('batak_push_client_id', id);
    }
    return id;
};



const getHeaders = () => {
    const headers = {
        'Content-Type': 'application/json'
    };
    const pid = getPlayerId();
    if (pid) {
        headers['x-player-id'] = pid;
    }
    return headers;
};

const getAdminHeaders = () => {
    return {
        'Content-Type': 'application/json'
    };
};

export const api = {
    joinRoom: async (roomId, name, code, seatIndex) => {
        const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, code, seatIndex, pushClientId: getPushClientId() })
        });
        return res.json();
    },

    leaveRoom: async (roomId) => {
        const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/leave`, {
            method: 'POST',
            headers: getHeaders()
        });
        return res.json();
    },

    createRoom: async (winningScore = 31) => {
        const res = await fetch(`${BASE_URL}/api/rooms`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ winningScore })
        });
        if (!res.ok) {
            const err = await res.json();
            console.error("Create room failed", err);
            throw new Error(err.message || "Failed to create room");
        }
        return res.json();
    },

    getRooms: async () => {
        const res = await fetch(`${BASE_URL}/api/rooms`, { headers: getHeaders() });
        return res.json();
    },

    getState: async (roomId) => {
        const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/state`, {
            headers: getHeaders()
        });
        if (!res.ok) throw new Error('Failed to fetch state');
        return res.json();
    },

    startGame: async (roomId) => {
        const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/start`, {
            method: 'POST',
            headers: getHeaders()
        });
        return res.json();
    },

    bid: async (roomId, amount) => {
        const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/bid`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ amount })
        });
        return res.json();
    },

    exchangeCards: async (roomId, cards) => {
        const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/exchange`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ cards })
        });
        return res.json();
    },

    selectTrump: async (roomId, suit) => {
        const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/trump`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ suit })
        });
        return res.json();
    },

    playCard: async (roomId, card) => {
        const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/play`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ card })
        });
        return res.json();
    },

    broadcastSound: async (roomId, type) => {
        const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/sound`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ type })
        });
        return res.json();
    },

    restartGame: async (roomId) => {
        const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/restart`, {
            method: 'POST',
            headers: getHeaders()
        });
        return res.json();
    },

    toggleAutopilot: async (roomId) => {
        const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/autopilot`, {
            method: 'POST',
            headers: getHeaders()
        });
        return res.json();
    },

    addBot: async (roomId, seatIndex) => {
        const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/add-bot`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ seatIndex })
        });
        return res.json();
    },

    getVapidPublicKey: async () => {
        const res = await fetch(`${BASE_URL}/api/push/vapid-public-key`);
        return res.json();
    },

    subscribePush: async (subscription, playerId) => {
        const res = await fetch(`${BASE_URL}/api/push/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription, playerId })
        });
        return res.json();
    },

    // Admin API (requires admin secret)
    adminListRooms: async () => {
        const res = await fetch(`${BASE_URL}/api/admin/rooms`, { headers: getAdminHeaders() });
        return res.json();
    },

    adminResetRoom: async (roomId) => {
        const res = await fetch(`${BASE_URL}/api/admin/rooms/${roomId}/reset`, {
            method: 'POST',
            headers: getAdminHeaders()
        });
        return res.json();
    },

    adminDeleteRoom: async (roomId) => {
        const res = await fetch(`${BASE_URL}/api/admin/rooms/${roomId}`, {
            method: 'DELETE',
            headers: getAdminHeaders()
        });
        return res.json();
    }
};
