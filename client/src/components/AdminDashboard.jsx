import React, { useEffect, useState } from 'react';
import { api } from '../api';

const AdminDashboard = ({ onClose }) => {
    const [rooms, setRooms] = useState([]);

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
        fetchRooms();
        const interval = setInterval(fetchRooms, 3000); // Auto-refresh
        return () => clearInterval(interval);
    }, []);

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
                                                    {room.players.map(p => (
                                                        <span key={p.id} className="mr-2">
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
