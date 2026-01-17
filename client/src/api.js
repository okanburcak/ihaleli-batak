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

export const api = {
    joinRoom: async (roomId, name, code) => {
        const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, code })
        });
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
    }
};
