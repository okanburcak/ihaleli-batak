import { useState, useEffect } from 'react';
import { api } from '../api';

export default function AdminPanel({ roomId, onClose }) {
    const [players, setPlayers] = useState([]);

    useEffect(() => {
        // Initial fetch
        fetchPlayers();

        // Auto refresh every 2 seconds
        const interval = setInterval(() => {
            fetchPlayers();
        }, 2000);

        return () => {
            clearInterval(interval);
        };
    }, [roomId]);

    const fetchPlayers = async () => {
        if (!roomId) return;
        try {
            const data = await api.getState(roomId);
            if (data && data.players) {
                setPlayers(data.players.filter(p => p)); // Filter nulls
            }
        } catch (e) {
            console.error("Admin poll error", e);
        }
    };

    const kickPlayer = (playerId) => {
        if (confirm('Bu oyuncuyu atmak istediğinize emin misiniz?')) {
            alert("Kick not implemented in polling version yet.");
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]">
            <div className="bg-gray-800 p-6 rounded-xl w-[600px] max-h-[80vh] overflow-y-auto text-white shadow-2xl border border-gray-600">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-red-500">Yönetici Paneli (Polling)</h2>
                    <button onClick={onClose} className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded">
                        Kapat
                    </button>
                </div>

                <div className="space-y-4">
                    <h3 className="text-xl font-semibold border-b border-gray-600 pb-2">Bağlı Oyuncular ({players.length})</h3>

                    {players.length === 0 ? (
                        <p className="text-gray-400">Bağlı oyuncu yok.</p>
                    ) : (
                        <div className="space-y-2">
                            {players.map(p => (
                                <div key={p.id} className="flex justify-between items-center bg-gray-700 p-3 rounded hover:bg-gray-650 transition-colors">
                                    <div>
                                        <div className="font-bold text-white text-lg">{p.name}</div>
                                        <div className="font-mono text-xs text-gray-400">{p.id}</div>
                                        <div className="text-xs text-gray-500">Seat: {p.seatIndex} | Durum: {p.connected ? 'Bağlı' : 'Koptu'}</div>
                                    </div>
                                    {p.isAdmin && (
                                        <span className="text-xs bg-red-600 text-white px-2 py-1 rounded ml-2">ADMIN</span>
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
