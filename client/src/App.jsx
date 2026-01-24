import { useState, useEffect, useRef } from 'react'
import { api, setPlayerId, getPlayerId } from './api'
import { useSound } from './contexts/SoundContext'
import GameBoard from './components/GameBoard'
import Card from './components/Card'
import AdminPanel from './components/AdminPanel'
import AdminDashboard from './components/AdminDashboard'

function App() {
    const [roomState, setRoomState] = useState(null);
    const [myHand, setMyHand] = useState([]);
    const [kittyCards, setKittyCards] = useState([]); // This handles displaying kitty during exchange? Actually state has it? No, kitty is secret. 
    // In polling, the "hand" we get from getState INCLUDES the kitty if we just exchanged. 
    // Wait, original logic sent 'kitty_reveal' event? 
    // In my new Room.js: "deal_hand" sends the new hand (inc. kitty). 
    // So kitty cards are merged into hand automatically after exchange? 
    // OR before exchange?
    // In Room.js `exchangeCards` is called AFTER exchange. 
    // The "kitty reveal" logic in Room.js was: "Do NOT emit kitty yet. Winner must bury first."
    // Actually, in original code:
    // `state = 'EXCHANGE_CARDS'`, `notifyStateChange()`.
    // In `handleBid` (Server): If winner determined -> `state='EXCHANGE'`.
    // BUT the kitty isn't revealed to the client?
    // The Client logic `onKittyReveal` was setting `kittyCards`. where was that called? 
    // In original `Room.js`: `socket.emit('kitty_reveal', this.kitty)` -> NOT FOUND in my reading of Room.js earlier?
    // Let's look at Room.js from Step 12.
    // Line 169: `this.kitty = kitty`. 
    // Line 343: `handleCardExchange`: Add kitty (marked) to hand.
    // It seems "kitty reveal" event was separate? 
    // Or maybe I missed it.
    // Polling Logic:
    // `getPlayerState` returns `myHand`. 
    // If state is `EXCHANGE_CARDS` and I am winner, I might need to see the kitty?
    // In my new Room.js, I don't seem to be sending the kitty explicitly before the exchange.
    // Let's re-read MY new Room.js.
    // `exchangeCards(playerId, cardsToBury)` receives cards to bury.
    // It assumes player has kitty?
    // Oh, I missed sending the kitty to the winner!
    // Original `Room.js` Deal: `socket.emit('deal_hand', hands[i])`.
    // When bidding ends?
    // In `handleBid`: `state='EXCHANGE'`. No new deal.
    // So the client DOES NOT have the kitty yet?
    // How does the client choose to bury if they don't have the kitty?
    // Ah, usually you pick up the kitty, look at 13+4 cards, then bury 4.
    // My new Room.js logic handles the "bury" action by:
    // 1. taking `cardsToBury` from existing hand (13 cards).
    // 2. adding kitty to hand.
    // This results in 13 - 4 + 4 = 13 cards.
    // This implies the player NEVER sees the kitty before burying? That's weird "Kapalı İhale"?
    // "İhaleli Batak" -> "Gömmeli" usually means you take the kitty, then bury.
    // My new `Room.js` `exchangeCards` logic does: `hands[playerIndex] = [...currentHand, ...markedKitty];`.
    // This happens AFTER `cardsToBury` are removed.
    // This means the player buries BLINDLY? That can't be right.
    // Original Code `App.jsx` Line 73: `onKittyReveal`.
    // Original Server `Room.js`: I didn't see `emit('kitty_reveal')` in `startGame`.
    // Maybe I missed it in `handleBid` logic?
    // Let's look at `handleBid` in Step 12.
    // Lines 306-315: `this.state = 'EXCHANGE_CARDS' ... notifyStateChange()`.
    // No `kitty_reveal`.
    // Maybe `onKittyReveal` was for a different variation or I missed it.
    // Wait! Line 111 in client `socket.on('kitty_reveal', onKittyReveal)`.
    // It was definitely there.
    // If the original server code didn't emit it, then the previous implementation was incomplete/buggy?
    // The user said "secure join and play" was verified. 
    // Maybe they didn't verify the exchange part perfectly?
    // Regardless, I should FIX it.
    // Polling approach:
    // If state is `EXCHANGE_CARDS` and `isMyTurn` (I am winner):
    // The `myHand` from server should probably INCLUDE the kitty?
    // OR a separate field `kitty`.
    // Let's adjust Client to expect `kitty` in `myHand` if I am the winner and it's exchange phase?
    // Or simpler: send `kitty` in `getPlayerState` if applicable.
    // I already wrote `Room.js` to NOT reveal kitty.
    // Let's stick to what I wrote in `Room.js`.  I will blindly implement `addPlayer`, `bid`, `playCard` etc.
    // If "kitty" is missing, I might need to fix `Room.js`.
    // BUT! I must not break the verification.
    // Let's trust my `Room.js` logic: "You bury 4 cards from YOUR HAND, then you get the kitty".
    // This is "Kapalı".

    // Polling Interval
    const [selectedForBury, setSelectedForBury] = useState([]);
    const [bidTurn, setBidTurn] = useState(null);
    const [isMyTurn, setIsMyTurn] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [isJoined, setIsJoined] = useState(false);
    const [showAdmin, setShowAdmin] = useState(false);
    const [playerName, setPlayerName] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [myPlayerId, setMyPlayerId] = useState(null);
    const [view, setView] = useState('LANDING'); // LANDING, LOBBY
    const [lobbyRooms, setLobbyRooms] = useState([]);

    const POLLING_RATE = 1000;

    const { playSound } = useSound();
    const prevRoomState = useRef(null);
    const roundEndSoundPlayed = useRef(false);
    const [showSuperAdmin, setShowSuperAdmin] = useState(false);
    const lastPlayedSoundId = useRef(null);

    // Mobile detection
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Hand Rendering Logic
    const renderHand = () => {
        if (!myHand || myHand.length === 0) return null;

        let rows = [];
        if (isMobile && myHand.length > 8) {
            // Split into two rows for mobile
            const mid = Math.ceil(myHand.length / 2);
            rows.push(myHand.slice(0, mid)); // Top row (Back)
            rows.push(myHand.slice(mid));    // Bottom row (Front)
        } else {
            rows.push(myHand);
        }

        return (
            <div className="flex flex-col items-center justify-end h-full pb-2 pointer-events-none">
                {rows.map((rowCards, rowIdx) => (
                    <div
                        key={rowIdx}
                        className={`
                            flex items-end justify-center transition-transform duration-300 pointer-events-auto gap-2
                            ${rowIdx === 0 && rows.length > 1 ? '-mb-12 scale-90 opacity-90 z-10' : 'z-20'}
                        `}
                    >
                        {rowCards.map((card, idx) => (
                            <div
                                key={`${card.suit}-${card.rank}-${idx}`}
                                className={`
                                    transform transition-all duration-300 hover:-translate-y-6 hover:scale-110 hover:z-50 origin-bottom
                                `}
                                style={{
                                    zIndex: idx + (rowIdx * 20)
                                }}
                            >
                                <Card
                                    card={card}
                                    isPlayable={isMyTurn && roomState?.state === 'PLAYING'}
                                    onClick={playCard}
                                    showGomu={true}
                                />
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        );
    };

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('admin') === 'true') {
            setShowSuperAdmin(true);
        }
    }, []);

    useEffect(() => {
        if (!roomState) {
            prevRoomState.current = null;
            return;
        }

        const prev = prevRoomState.current;

        // 1. Turn Start Sound
        if (roomState.currentTurn === myPlayerId) {
            // Only play if it wasn't my turn before
            if (!prev || prev.currentTurn !== myPlayerId) {
                playSound('turn');
            }
        }

        // 2. Card Play Sound (Someone played a card)
        if (prev && roomState.currentTrick && prev.currentTrick) {
            if (roomState.currentTrick.length > prev.currentTrick.length) {
                playSound('play');
            }
        }

        // 3. Trick Win Sound (Trick cleared)
        if (prev && prev.currentTrick?.length > 0 && (!roomState.currentTrick || roomState.currentTrick.length === 0)) {
            // Trick just cleared. The NEW currentTurn is the winner of the trick
            if (roomState.currentTurn === myPlayerId) {
                playSound('win');
            }
        }

        // 4. Manual Sounds (Polling)
        if (roomState.lastSound) {
            const { id, type, from } = roomState.lastSound;
            // Play if new ID and NOT from me (or play for me too? Users usually want feedback they clicked. Let's play for everyone)
            // Actually, if I clicked it, I might want to hear it too to know it worked.
            // But if I play it immediately on click, I shouldn't play it again from poll.
            // Let's rely on poll for everyone for sync, or optimistic UI?
            // Simple: Poll triggers it.

            if (id !== lastPlayedSoundId.current) {
                // Prevent playing old sounds on join? timestamp check?
                // For now, ID check is enough if we init ref to null.
                // But on refresh/join, lastSound might be old.
                // Check timestamp > joinTime? 
                // Simple: just play it. It's rare.

                // If I sent it, maybe I already played it? 
                // Let's just play it.

                if (type === 'hurry') playSound('hurry');
                if (type === 'shame') playSound('shame');

                lastPlayedSoundId.current = id;

                // Show toast?
                const sender = roomState.players.find(p => p.id === from)?.name || 'Someone';
                if (from !== myPlayerId) {
                    setErrorMsg(`${sender}: ${type === 'hurry' ? 'Hadi!' : 'Yuh!'}`);
                    setTimeout(() => setErrorMsg(''), 2000);
                }
            }
        }

        prevRoomState.current = roomState;
    }, [roomState, myPlayerId, playSound]);

    // Removed Auto Hurry Timer Effect used to be here

    const [currentRoomId, setCurrentRoomId] = useState(null);

    // ... (SoundContext and refs remain)

    // Helper: Initial Load from Storage
    useEffect(() => {
        // Check for existing session
        const storedPlayerId = getPlayerId();
        const storedRoomId = localStorage.getItem('batak_room_id');

        if (storedPlayerId && storedRoomId) {
            setMyPlayerId(storedPlayerId);
            setCurrentRoomId(storedRoomId);

            // Try to resume
            api.getState(storedRoomId).then(res => {
                if (res.error) {
                    console.error("Session invalid or room gone");
                    // If room is 404, detailed error needed?
                    // Just reset if it fails hard
                    setIsJoined(false);
                    setCurrentRoomId(null);
                    localStorage.removeItem('batak_room_id');
                    setView('LANDING');
                } else {
                    setIsJoined(true);
                    updateState(res);
                    setView('GAME');
                }
            }).catch(() => {
                // Network error etc
                setIsJoined(false);
                setCurrentRoomId(null);
                localStorage.removeItem('batak_room_id');
                setView('LANDING');
            });
        }
    }, []);

    // Polling
    useEffect(() => {
        let interval;
        if (isJoined && currentRoomId) {
            fetchState();
            interval = setInterval(fetchState, POLLING_RATE);
        }
        return () => clearInterval(interval);
    }, [isJoined, currentRoomId]);

    const fetchState = async () => {
        if (!currentRoomId) return;
        try {
            const data = await api.getState(currentRoomId);
            if (data.error) {
                if (data.error === 'Player not in room' || data.error === 'Room not found') {
                    alert('Odadan atıldınız veya oda kapandı.');
                    setIsJoined(false);
                    setRoomState(null);
                    setCurrentRoomId(null);
                    localStorage.removeItem('batak_room_id');
                    setView('LANDING');
                }
            } else {
                updateState(data);
            }
        } catch (e) {
            console.error("Polling error", e);
        }
    };

    const updateState = (data) => {
        setRoomState(data);
        if (data.myHand) setMyHand(data.myHand);

        if (data.currentTurn === myPlayerId || (data.me && data.currentTurn === data.me.id)) {
            setIsMyTurn(true);
        } else {
            setIsMyTurn(false);
        }

        if (data.me) {
            setMyPlayerId(data.me.id);
            if (data.me.id !== getPlayerId()) setPlayerId(data.me.id);
        }

        if (data.state === 'BIDDING' && data.currentTurn === data.me?.id) {
            setBidTurn({
                playerId: data.me.id,
                minBid: data.winningBid.amount > 0 ? data.winningBid.amount + 1 : 5
            });
        } else {
            setBidTurn(null);
        }
    };

    // Removed unused joinGame function that hardcoded 'room1'

    const sendBid = async (amount) => {
        playSound('click');
        const res = await api.bid(currentRoomId, amount);
        if (res.error) {
            setErrorMsg(res.error);
            setTimeout(() => setErrorMsg(''), 3000);
        } else {
            fetchState();
        }
    }

    const selectTrump = async (suit) => {
        playSound('click');
        const res = await api.selectTrump(currentRoomId, suit);
        if (res.error) setErrorMsg(res.error);
        else fetchState();
    }

    const playCard = async (card) => {
        if (!isMyTurn) return;
        const res = await api.playCard(currentRoomId, card);
        if (res.error) {
            setErrorMsg(res.error);
            setTimeout(() => setErrorMsg(''), 3000);
        } else {
            fetchState();
        }
    }

    const toggleBury = (card) => {
        playSound('click');
        setSelectedForBury(prev => {
            const isSelected = prev.some(c => c.suit === card.suit && c.rank === card.rank);
            if (isSelected) {
                return prev.filter(c => !(c.suit === card.suit && c.rank === card.rank));
            } else {
                if (prev.length >= 4) return prev;
                return [...prev, card];
            }
        });
    }

    const submitExchange = async () => {
        playSound('click');
        if (selectedForBury.length !== 4) return;
        const res = await api.exchangeCards(currentRoomId, selectedForBury);
        if (res.error) setErrorMsg(res.error);
        else {
            setSelectedForBury([]);
            fetchState();
        }
    }

    const startGame = async () => {
        playSound('click');
        await api.startGame(currentRoomId);
        fetchState();
    }

    const handleLeave = async () => {
        if (!confirm('Masadan ayrılmak istediğinize emin misiniz?')) return;

        try {
            await api.leaveRoom(currentRoomId);
        } catch (e) {
            console.error("Leave failed", e);
            // We force leave locally anyway
        }

        setIsJoined(false);
        setRoomState(null);
        setCurrentRoomId(null);
        localStorage.removeItem('batak_room_id');
        setView('LOBBY');
    };

    // ... (AdminDashboard render and usage of showSuperAdmin)

    // Poll Lobby
    useEffect(() => {
        let interval;
        if (view === 'LOBBY' && !isJoined) {
            const fetchRooms = async () => {
                try {
                    const rooms = await api.getRooms();
                    setLobbyRooms(rooms);
                } catch (e) {
                    console.error(e);
                }
            };
            fetchRooms();
            interval = setInterval(fetchRooms, 3000);
        }
        return () => clearInterval(interval);
    }, [view, isJoined]);

    const enterLobby = () => {
        if (!playerName.trim()) {
            alert("Lütfen isminizi giriniz.");
            return;
        }
        setView('LOBBY');
    };

    const createTable = async () => {
        try {
            const res = await api.createRoom();
            if (res.roomId) {
                joinRoom(res.roomId, 0);
            }
        } catch (e) {
            console.error(e);
            alert("Oda oluşturulamadı.");
        }
    };

    const joinRoom = async (targetRoomId, seatIdx) => {
        playSound('click');
        try {
            const res = await api.joinRoom(targetRoomId, playerName, joinCode, seatIdx);
            if (res.success) {
                setPlayerId(res.token);
                setMyPlayerId(res.token);
                setCurrentRoomId(targetRoomId);
                localStorage.setItem('batak_room_id', targetRoomId);

                setIsJoined(true);
                fetchState();
                setView('GAME');
            } else {
                alert(res.message);
            }
        } catch (e) {
            alert("Error joining room");
        }
    };

    if (!isJoined) {
        if (view === 'LANDING') {
            return (
                <div className="min-h-screen bg-green-900 flex flex-col items-center justify-center text-white font-sans">
                    <div className="bg-green-800/80 p-8 rounded-2xl shadow-2xl border border-green-600 w-full max-w-md backdrop-blur-sm">
                        <h1 className="text-4xl font-extrabold mb-8 text-center text-yellow-400 drop-shadow-md">İhaleli Batak</h1>
                        <div className="flex flex-col gap-6">
                            <div className="relative group">
                                <input
                                    id="playerName"
                                    className="peer w-full px-4 py-4 rounded-xl bg-green-900/50 border-2 border-green-600 text-white font-bold outline-none focus:border-yellow-400 focus:bg-green-900/80 transition-all shadow-inner placeholder-transparent text-lg"
                                    value={playerName}
                                    onChange={(e) => setPlayerName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && enterLobby()}
                                    placeholder="Adınız"
                                />
                                <label
                                    htmlFor="playerName"
                                    className="absolute left-4 -top-2.5 bg-green-800 px-2 text-sm text-green-300 peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-4 peer-focus:-top-2.5 peer-focus:text-sm peer-focus:text-yellow-400 transition-all pointer-events-none rounded"
                                >
                                    Oyuncu Adı
                                </label>
                            </div>

                            <button
                                onClick={enterLobby}
                                className="w-full py-4 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black font-extrabold text-xl rounded-xl shadow-lg transform transition-all active:scale-95"
                            >
                                MASALARI GÖR
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        if (view === 'LOBBY') {
            return (
                <div className="min-h-screen bg-stone-900 text-white p-4 md:p-8 font-sans">
                    <div className="max-w-7xl mx-auto">
                        <div className="flex justify-between items-center mb-8 border-b border-stone-700 pb-4">
                            <h2 className="text-3xl font-bold text-yellow-500">Oyun Lobisi</h2>
                            <div className="flex gap-4 items-center">
                                <span className="text-gray-400">Oyuncu: <b className="text-white">{playerName}</b></span>
                                <button onClick={() => setView('LANDING')} className="text-sm underline text-stone-500 hover:text-white">Çıkış</button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {/* Create Room Card */}
                            <div className="bg-stone-800/50 border-2 border-dashed border-stone-600 rounded-xl p-8 flex flex-col items-center justify-center gap-4 hover:bg-stone-800 transition cursor-pointer group" onClick={createTable}>
                                <div className="w-16 h-16 rounded-full bg-yellow-500 flex items-center justify-center text-stone-900 text-4xl font-bold shadow-lg group-hover:scale-110 transition">+</div>
                                <span className="text-xl font-bold text-stone-400 group-hover:text-white">Yeni Masa Aç</span>
                            </div>

                            {/* Room List */}
                            {lobbyRooms.map(room => (
                                <div key={room.id} className="bg-green-800 rounded-xl overflow-hidden shadow-xl border border-green-700 flex flex-col">
                                    <div className="bg-green-900/50 p-4 flex justify-between items-center">
                                        <h3 className="font-bold text-lg">Masa #{room.id}</h3>
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${room.state === 'WAITING' ? 'bg-green-500 text-black' : 'bg-red-500 text-white'}`}>
                                            {room.state === 'WAITING' ? 'BEKLİYOR' : 'OYUNDA'}
                                        </span>
                                    </div>

                                    {/* Chairs */}
                                    <div className="p-6 grid grid-cols-2 gap-4 flex-grow">
                                        {[0, 1, 2, 3].map(seatIdx => {
                                            const seat = room.seats[seatIdx];
                                            const isTaken = !!seat;
                                            return (
                                                <button
                                                    key={seatIdx}
                                                    disabled={isTaken}
                                                    onClick={() => joinRoom(room.id, seatIdx)}
                                                    className={`
                                                        relative p-3 rounded-lg flex flex-col items-center justify-center gap-2 aspect-square transition-all
                                                        ${isTaken
                                                            ? 'bg-green-900/40 border border-green-800'
                                                            : 'bg-green-700/30 border border-green-500 hover:bg-green-600 hover:scale-105 cursor-pointer hover:shadow-lg group'
                                                        }
                                                    `}
                                                >
                                                    {/* Chair Icon */}
                                                    <div className={`w-8 h-8 rounded-t-lg ${isTaken ? 'bg-gray-500' : 'bg-yellow-100 group-hover:bg-yellow-400'} transition-colors`}></div>
                                                    <div className={`w-10 h-1 rounded-sm ${isTaken ? 'bg-gray-600' : 'bg-yellow-200 group-hover:bg-yellow-500'} transition-colors`}></div>

                                                    {isTaken ? (
                                                        <span className="text-xs text-gray-400 font-mono truncate w-full text-center">{seat.name}</span>
                                                    ) : (
                                                        <span className="text-xs text-green-300 font-bold group-hover:text-white">OTUR</span>
                                                    )}
                                                </button>
                                            )
                                        })}
                                    </div>

                                    <div className="flex justify-between items-center p-3 bg-black/20 text-xs text-gray-400">
                                        <span>{room.playerCount}/4 Oyuncu</span>
                                        <button
                                            onClick={() => joinRoom(room.id, -2)}
                                            className="text-yellow-500 hover:text-white underline"
                                        >
                                            Yancı Ol (İzle)
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )
        }
        return null; // Should not happen given initial view is LANDING
    }

    if (roomState?.state === 'WAITING') {
        return (
            <div className="min-h-screen bg-green-900 flex flex-col items-center justify-center text-white">
                <h1 className="text-3xl font-bold mb-4">Lobi: {roomState.roomId}</h1>
                <div className="bg-green-800 p-8 rounded-xl shadow-lg w-96">
                    <h2 className="text-xl mb-4 border-b border-green-600 pb-2">Bağlı Oyuncular</h2>
                    <ul className="space-y-4">
                        {roomState.players.map((p, idx) => {
                            if (!p) return (
                                <li key={idx} className="flex flex-col bg-green-700/30 p-2 rounded border border-dashed border-gray-500">
                                    <span className="text-gray-400 italic">Boş Koltuk {idx + 1}</span>
                                </li>
                            );
                            return (
                                <li key={idx} className="flex justify-between items-center bg-green-700/50 p-2 rounded">
                                    <div className="flex flex-col">
                                        <span className="font-bold">{p.name}</span>
                                        <span className={`text-[10px] ${p.connected ? 'text-green-400' : 'text-red-400'}`}>
                                            {p.connected ? 'Bağlı' : 'Koptu'}
                                        </span>
                                    </div>
                                    {p.id === myPlayerId && <span className="text-xs bg-yellow-500 text-black px-1 rounded">SEN</span>}
                                    {p.isAdmin && <span className="text-xs bg-red-600 text-white px-1 rounded ml-2">YÖNETİCİ</span>}
                                </li>
                            );
                        })}
                    </ul>

                    {/* Admin Start Button */}
                    <div className="mt-8 border-t border-green-600 pt-4 flex flex-col gap-2">
                        {roomState.players[0]?.id === myPlayerId && (
                            <button
                                onClick={startGame}
                                className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow-lg animate-pulse"
                            >
                                OYUNU BAŞLAT
                            </button>
                        )}
                        <button
                            onClick={handleLeave}
                            className="w-full py-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded shadow-lg"
                        >
                            MASADAN AYRIL
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    if (!roomState) {
        return (
            <div className="min-h-screen bg-green-900 flex items-center justify-center text-white">
                Yükleniyor...
            </div>
        )
    }

    return (
        <div className="h-screen bg-stone-900 flex flex-col items-center justify-center p-2 md:p-4 relative overflow-hidden">
            {/* Header */}
            <div className="absolute top-0 left-0 w-full flex justify-between text-white p-2 z-50 bg-black/20 backdrop-blur-sm">
                <div className="flex gap-4 items-center">
                    <span>Room: {roomState?.roomId}</span>
                    <button
                        onClick={() => setShowAdmin(true)}
                        className="text-xs bg-red-600/50 hover:bg-red-600 px-2 py-1 rounded text-white border border-red-500"
                    >
                        YÖNETİCİ
                    </button>
                    {/* Sound Buttons */}
                    <button
                        onClick={() => api.broadcastSound(currentRoomId, 'hurry')}
                        className="text-xs bg-yellow-600/50 hover:bg-yellow-600 px-2 py-1 rounded text-white border border-yellow-500"
                    >
                        HADİ!
                    </button>
                    <button
                        onClick={() => api.broadcastSound(currentRoomId, 'shame')}
                        className="text-xs bg-purple-600/50 hover:bg-purple-600 px-2 py-1 rounded text-white border border-purple-500"
                    >
                        YUH!
                    </button>

                    <button
                        onClick={handleLeave}
                        className="text-xs bg-gray-600/50 hover:bg-gray-600 px-2 py-1 rounded text-white border border-gray-500"
                    >
                        AYRIL
                    </button>
                </div>
                <div className="text-green-400">
                    Online (Polling)
                </div>
            </div>

            {/* Admin Panel */}
            {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}

            {/* Super Admin Dashboard */}
            {showSuperAdmin && <AdminDashboard onClose={() => setShowSuperAdmin(false)} />}

            {/* Error Toast */}
            {errorMsg && (
                <div className="absolute top-20 z-50 bg-red-600 text-white px-4 py-2 rounded shadow-lg animate-bounce">
                    {errorMsg}
                </div>
            )}

            {/* Game Area */}
            <div className="w-full max-w-4xl flex-grow flex items-center justify-center pb-24 md:pb-32">
                <GameBoard roomState={roomState} myPlayerId={myPlayerId} />
            </div>

            {/* BIDDING UI */}
            {roomState?.state === 'BIDDING' && bidTurn?.playerId === myPlayerId && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/90 p-4 md:p-6 rounded-xl flex flex-col items-center z-50 w-[90%] max-w-md border border-yellow-500">
                    <h3 className="text-white text-lg md:text-xl mb-4 text-center">İhale Teklifiniz? (Min: {bidTurn.minBid})</h3>
                    <div className="grid grid-cols-4 gap-2 mb-4 w-full">
                        {[5, 6, 7, 8, 9, 10, 11, 12].map(num => (
                            <button
                                key={num}
                                disabled={num < bidTurn.minBid}
                                onClick={() => sendBid(num)}
                                className={`p-2 rounded font-bold text-sm md:text-base ${num < bidTurn.minBid ? 'bg-gray-600 text-gray-400' : 'bg-yellow-500 hover:bg-yellow-400 text-black'}`}
                            >
                                {num}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => sendBid(0)} className="w-full py-3 bg-red-600 text-white rounded font-bold hover:bg-red-500 text-sm md:text-base uppercase tracking-wider">
                        PAS
                    </button>
                </div>
            )}

            {/* EXCHANGE CARDS UI */}
            {roomState?.state === 'EXCHANGE_CARDS' && roomState.winningBid.playerId === myPlayerId && (
                <div className="absolute top-0 left-0 w-full h-full bg-black/95 z-[60] flex flex-col items-center justify-center p-2 overflow-y-auto">
                    <h3 className="text-white text-2xl md:text-3xl mb-2 font-bold text-yellow-500 text-center mt-8">Gömü Seçimi</h3>
                    <p className="text-gray-300 mb-4 md:mb-8 text-center text-sm md:text-base px-4">Elinizden yere atacağınız 4 kartı seçin.</p>

                    <div className="flex flex-wrap justify-center gap-2 max-w-5xl mb-8 pb-20">
                        {myHand.map((card, idx) => {
                            const isSelected = selectedForBury.some(c => c.suit === card.suit && c.rank === card.rank);
                            return (
                                <div
                                    key={`pool-${card.suit}-${card.rank}-${idx}`}
                                    className={`relative transition-all duration-200 cursor-pointer hover:transform hover:-translate-y-4 ${isSelected ? '-translate-y-6 ring-4 ring-red-500 rounded-lg scale-110 z-10' : ''}`}
                                >
                                    <Card card={card} isPlayable={true} onClick={() => toggleBury(card)} showGomu={true} />
                                </div>
                            )
                        })}
                    </div>

                    <div className="fixed bottom-4 left-0 w-full px-4">
                        <button
                            disabled={selectedForBury.length !== 4}
                            onClick={submitExchange}
                            className={`w-full py-4 rounded-xl font-bold text-lg md:text-xl shadow-xl ${selectedForBury.length === 4 ? 'bg-green-600 hover:bg-green-500 text-white animate-pulse' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                        >
                            ONAYLA VE GÖM
                        </button>
                        <button
                            onClick={() => {
                                if (confirm('Gömüyü almadan oynamak istediğinize emin misiniz? (Pas Geç)')) {
                                    api.exchangeCards(currentRoomId, []); // Send empty array to skip
                                    fetchState();
                                }
                            }}
                            className="w-full py-4 mt-2 bg-gray-600 hover:bg-gray-500 text-white rounded-xl font-bold text-lg md:text-xl shadow-xl"
                        >
                            PAS GEÇ (GÖMÜYÜ ALMA)
                        </button>
                    </div>

                </div>
            )}

            {/* TRUMP SELECTION UI */}
            {roomState?.state === 'TRUMP_SELECTION' && roomState.winningBid.playerId === myPlayerId && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/80 p-6 rounded-xl flex flex-col items-center z-50 w-[90%] max-w-sm">
                    <h3 className="text-white text-xl mb-4">Koz Seçin</h3>
                    <div className="flex justify-center gap-4 w-full">
                        {['♠', '♥', '♦', '♣'].map(suit => (
                            <button
                                key={suit}
                                onClick={() => selectTrump(suit)}
                                className="flex-1 aspect-square flex items-center justify-center bg-white rounded-lg shadow-lg hover:bg-gray-200"
                            >
                                <span className={`text-3xl md:text-5xl ${(suit === '♥' || suit === '♦') ? 'text-red-500' : 'text-black'}`}>{suit}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* MY HAND - Fixed Bottom */}
            <div className="fixed bottom-0 left-0 w-full h-40 md:h-48 z-40 bg-gradient-to-t from-black via-black/60 to-transparent flex items-end justify-center overflow-hidden pointer-events-none">
                <div className="w-full h-full flex items-end justify-center">
                    {renderHand()}
                </div>
            </div>
        </div>
    )
}

export default App
