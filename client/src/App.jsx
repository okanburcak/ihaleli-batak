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
    const [kittyCards, setKittyCards] = useState([]);

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

    // Mobile detection & Window Width
    const [pageWidth, setPageWidth] = useState(window.innerWidth);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => {
            setPageWidth(window.innerWidth);
            setIsMobile(window.innerWidth < 768);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Hand Rendering Logic
    const renderHand = () => {
        if (!myHand || myHand.length === 0) return null;

        let rows = [];
        // User Rule: "keep 2 lines until the player has 6 cards. then you go to 1 line."
        if (isMobile && myHand.length > 6) {
            const mid = Math.ceil(myHand.length / 2);
            rows.push(myHand.slice(0, mid)); // Back Row
            rows.push(myHand.slice(mid));    // Front Row
        } else {
            rows.push(myHand);
        }

        return (
            <div className={`flex flex-col items-center justify-end h-full pb-2 pointer-events-none w-full px-2 ${rows.length > 1 ? '-mb-4' : ''}`}>
                {rows.map((rowCards, rowIdx) => (
                    <div
                        key={rowIdx}
                        className={`
                            flex items-end justify-center pointer-events-auto transition-all duration-300
                            ${rows.length > 1 ? 'scale-90 opacity-90' : ''} 
                            ${rowIdx === 0 && rows.length > 1 ? '-mb-20 -translate-y-12 z-10' : 'z-20'}
                        `}
                    >
                        {rowCards.map((card, idx) => (
                            <div
                                key={`${card.suit}-${card.rank}-${idx}`}
                                className={`
                                    relative
                                    transform transition-all duration-300 hover:-translate-y-6 hover:scale-110 hover:z-50 origin-bottom
                                    ${idx !== 0 ? '-ml-2' : ''}
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
            if (id !== lastPlayedSoundId.current) {
                if (type === 'hurry') playSound('hurry');
                if (type === 'hadi') playSound('hadi');
                if (type === 'shame') playSound('shame');

                lastPlayedSoundId.current = id;

                // Show toast
                const sender = roomState.players.find(p => p.id === from)?.name || 'Someone';
                if (from !== myPlayerId) {
                    setErrorMsg(`${sender}: ${type === 'hurry' ? 'Hadi!' : 'Yuh!'}`);
                    setTimeout(() => setErrorMsg(''), 2000);
                }
            }
        }

        prevRoomState.current = roomState;
    }, [roomState, myPlayerId, playSound]);

    const [currentRoomId, setCurrentRoomId] = useState(null);

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
            const scoreStr = prompt("Oyun kaçta bitsin? (Örn: 51, 101)", "51");
            if (scoreStr === null) return; // Cancelled
            const score = parseInt(scoreStr) || 51;

            const res = await api.createRoom(score);
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

    const renderContent = () => {
        if (!isJoined) {
            if (view === 'LANDING') {
                return (
                    <div className="min-h-screen bg-green-900 flex flex-col items-center justify-center text-white font-sans">
                        <div className="bg-green-800/80 p-8 rounded-2xl shadow-2xl border border-green-600 w-full max-w-md backdrop-blur-sm">
                            <div className="flex justify-center mb-6">
                                <img src="/logo.png" alt="Kayısı Cafe Logo" className="w-48 h-48 rounded-full border-4 border-yellow-500 shadow-xl object-cover animate-bounce-slow" />
                            </div>
                            <h1 className="text-5xl font-extrabold mb-8 text-center text-orange-400 drop-shadow-md uppercase tracking-wide">
                                KAYISI CAFE
                            </h1>
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
                                    disabled={roomState.players.filter(p => p !== null).length < 4}
                                    className={`
                                        w-full py-3 font-bold rounded shadow-lg transition-all
                                        ${roomState.players.filter(p => p !== null).length < 4
                                            ? 'bg-gray-500 cursor-not-allowed text-gray-300'
                                            : 'bg-red-600 hover:bg-red-500 text-white animate-pulse'
                                        }
                                    `}
                                >
                                    {roomState.players.filter(p => p !== null).length < 4 ? '4 KİŞİ BEKLENİYOR' : 'OYUNU BAŞLAT'}
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
                            onClick={() => {
                                const type = Math.random() < 0.5 ? 'hurry' : 'hadi';
                                api.broadcastSound(currentRoomId, type);
                            }}
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
                        {(roomState?.state === 'BIDDING' && myHand.length > 0 && !myHand.some(c => ['A', 'K', 'Q', 'J'].includes(c.rank))) && (
                            <button
                                onClick={() => {
                                    if (confirm('Elinizde A, K, Q, J yok. Eli bozmak istiyor musunuz?')) {
                                        api.requestRedeal(currentRoomId).then(() => fetchState());
                                    }
                                }}
                                className="text-xs bg-red-600/80 hover:bg-red-500 text-white px-2 py-1 rounded border border-red-500 animate-pulse"
                            >
                                ELİ BOZ
                            </button>
                        )}

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
                {showAdmin && <AdminPanel roomId={currentRoomId} onClose={() => setShowAdmin(false)} />}

                {/* Super Admin Dashboard - MOVED TO ROOT */}

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

                {/* Player Hand */}
                <div className="absolute bottom-0 w-full h-40 md:h-56 z-40 pointer-events-none">
                    {renderHand()}
                </div>
            </div>
        );
    };

    return (
        <div>
            {renderContent()}
            {showSuperAdmin && <AdminDashboard onClose={() => setShowSuperAdmin(false)} />}
        </div>
    )
}

export default App
