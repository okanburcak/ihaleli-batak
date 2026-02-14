import React, { useEffect, useState } from 'react';
import { api, setAdminSecret } from '../api';

const AdminDashboard = ({ onClose }) => {
    const [rooms, setRooms] = useState([]);
    const [authenticated, setAuthenticated] = useState(false);
    const [secretInput, setSecretInput] = useState('');
    const [error, setError] = useState('');

    const handleLogin = async () => {
        setAdminSecret(secretInput);
        try {
            const data = await api.adminListRooms();
            if (Array.isArray(data)) {
                setAuthenticated(true);
                setRooms(data);
                setError('');
            } else {
                setError('Invalid admin secret');
                setAdminSecret(null);
            }
        } catch (e) {
            setError('Invalid admin secret');
            setAdminSecret(null);
        }
    };

    const fetchRooms = async () => {
        try {
            const data = await api.adminListRooms();
            if (Array.isArray(data)) {
                setRooms(data);
            }
        } catch (e) {
            console.error("Failed to fetch rooms", e);
        }
    };

    useEffect(() => {
        if (!authenticated) return;
        fetchRooms();
        const interval = setInterval(fetchRooms, 3000);
        return () => clearInterval(interval);
    }, [authenticated]);

    const handleReset = async (roomId) => {
        if (!confirm(`Are you sure you want to RESET room ${roomId}? This will wipe all game state.`)) return;
        await api.adminResetRoom(roomId);
        fetchRooms();
    };

    const handleDelete = async (roomId) => {
        if (!confirm(`Are you sure you want to DELETE room ${roomId}? This cannot be undone.`)) return;
        await api.adminDeleteRoom(roomId);
        fetchRooms();
    };

    if (!authenticated) {
        return (
            <div className="fixed inset-0 bg-gray-900 text-white z-[100] flex items-center justify-center">
                <div className="bg-gray-800 p-8 rounded-xl border border-gray-700 w-full max-w-sm">
                    <h1 className="text-2xl font-bold text-yellow-500 mb-6">Admin Login</h1>
                    <input
                        type="password"
                        value={secretInput}
                        onChange={(e) => setSecretInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                        placeholder="Admin Secret"
                        className="w-full px-4 py-3 rounded-lg bg-gray-700 border border-gray-600 text-white mb-4 outline-none focus:border-yellow-500"
                    />
                    {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
                    <div className="flex gap-3">
                        <button
                            onClick={handleLogin}
                            className="flex-1 py-3 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded-lg"
                        >
                            Login
                        </button>
                        <button
                            onClick={onClose}
                            className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-gray-900 text-white z-[100] overflow-auto p-4 md:p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-yellow-500">Super Admin Dashboard</h1>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
                    >
                        Close / Back to Game
                    </button>
                </div>

                <div className="bg-gray-800 rounded-xl p-4 shadow-xl">
                    <h2 className="text-xl mb-4 text-gray-300">Active Rooms ({rooms.length})</h2>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-gray-700 text-gray-400">
                                    <th className="p-3">Room ID</th>
                                    <th className="p-3">State</th>
                                    <th className="p-3">Players</th>
                                    <th className="p-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rooms.map(room => (
                                    <tr key={room.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                                        <td className="p-3 font-mono text-yellow-400">{room.id}</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-1 rounded text-xs ${room.state === 'PLAYING' ? 'bg-green-600' : 'bg-blue-600'}`}>
                                                {room.state}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-sm font-bold">{room.playerCount}/4</span>
                                                <div className="text-xs text-gray-400">
                                                    {room.players.map((p, idx) => (
                                                        <span key={idx} className="mr-2">
                                                            {p.name} {p.isAdmin ? '(A)' : ''}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-3">
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleReset(room.id)}
                                                    className="px-3 py-1 bg-orange-600 hover:bg-orange-500 text-white rounded text-sm"
                                                >
                                                    Reset
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(room.id)}
                                                    className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-sm"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {rooms.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="p-8 text-center text-gray-500">
                                            No active rooms found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
