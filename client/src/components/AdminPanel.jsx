import { useState, useEffect } from 'react';
import { socket } from '../socket';

export default function AdminPanel({ onClose }) {
    const [players, setPlayers] = useState([]);

    useEffect(() => {
        // Initial fetch
        socket.emit('admin_get_players');

        function onPlayerList(list) {
            setPlayers(list);
        }

        socket.on('admin_player_list', onPlayerList);

        // Auto refresh every 5 seconds
        const interval = setInterval(() => {
            socket.emit('admin_get_players');
        }, 5000);

        return () => {
            socket.off('admin_player_list', onPlayerList);
            clearInterval(interval);
        };
    }, []);

    const kickPlayer = (socketId) => {
        if (confirm('Are you sure you want to kick this player?')) {
            socket.emit('admin_kick_player', socketId);
            // Optimistic update or wait for refresh
            setTimeout(() => socket.emit('admin_get_players'), 500);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]">
            <div className="bg-gray-800 p-6 rounded-xl w-[600px] max-h-[80vh] overflow-y-auto text-white shadow-2xl border border-gray-600">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-red-500">Admin Control Panel</h2>
                    <button onClick={onClose} className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded">
                        Close
                    </button>
                </div>

                <div className="space-y-4">
                    <h3 className="text-xl font-semibold border-b border-gray-600 pb-2">Connected Players ({players.length})</h3>

                    {players.length === 0 ? (
                        <p className="text-gray-400">No players connected.</p>
                    ) : (
                        <div className="space-y-2">
                            {players.map(p => (
                                <div key={p.id} className="flex justify-between items-center bg-gray-700 p-3 rounded hover:bg-gray-650 transition-colors">
                                    <div>
                                        <div className="font-bold text-white text-lg">{p.name}</div>
                                        <div className="font-mono text-xs text-gray-400">{p.id}</div>
                                        <div className="text-xs text-gray-500">Room: {p.room} | Status: {p.connected ? 'Connected' : 'Disconnected'}</div>
                                    </div>
                                    {p.id !== socket.id && (
                                        <button
                                            onClick={() => kickPlayer(p.id)}
                                            className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-sm rounded transition-colors"
                                        >
                                            KICK
                                        </button>
                                    )}
                                    {p.id === socket.id && (
                                        <span className="text-xs bg-yellow-500 text-black px-2 py-1 rounded font-bold">YOU</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
