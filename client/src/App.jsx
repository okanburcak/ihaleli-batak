import { useState, useEffect } from 'react'
import { socket } from './socket'
import GameBoard from './components/GameBoard'
import Card from './components/Card'
import AdminPanel from './components/AdminPanel'

function App() {
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [inGame, setInGame] = useState(false);
    const [roomState, setRoomState] = useState(null);
    const [myHand, setMyHand] = useState([]);
    const [kittyCards, setKittyCards] = useState([]);
    const [selectedForBury, setSelectedForBury] = useState([]);
    const [bidTurn, setBidTurn] = useState(null); // { playerId, minBid }
    const [isMyTurn, setIsMyTurn] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [isJoined, setIsJoined] = useState(false);
    const [showAdmin, setShowAdmin] = useState(false);
    const [playerName, setPlayerName] = useState('');
    const [joinCode, setJoinCode] = useState(''); // For joining via code

    useEffect(() => {
        function onConnect() {
            setIsConnected(true);
        }

        function onDisconnect() {
            setIsConnected(false);
        }

        function onStateUpdate(state) {
            setRoomState(state);
            if (state.currentTurn === socket.id) {
                setIsMyTurn(true);
            } else {
                setIsMyTurn(false);
            }

            // Reset bid turn if state moves past bidding
            if (state.state !== 'BIDDING') {
                setBidTurn(null);
            }

            // Auto enter game if state is not WAITING
            if (state.state !== 'WAITING') {
                setInGame(true);
            }
        }

        function onDealHand(hand) {
            setMyHand(hand);
            setInGame(true);
        }

        function onBidTurn(data) {
            setBidTurn(data);
        }

        function onAskTrump(data) {
            // If it's me
            if (data.playerId === socket.id) {
                // Show trump selection UI
                // handled by checking roomState.state === 'TRUMP_SELECTION' && isMyTurn
            }
        }

        function onCardPlayed(data) {
            if (data.playerId === socket.id) {
                setMyHand(prev => prev.filter(c => !(c.suit === data.card.suit && c.rank === data.card.rank)));
            }
        }

        function onKittyReveal(cards) {
            setKittyCards(cards);
            setSelectedForBury([]); // Reset selection
        }

        function onError(msg) {
            setErrorMsg(msg);
            setTimeout(() => setErrorMsg(''), 3000);
        }

        function onJoinError(msg) {
            setErrorMsg(msg);
            setIsJoined(false); // Only reset join on explicit join failure
            setTimeout(() => setErrorMsg(''), 3000);
        }

        function onKicked(msg) {
            alert(msg || 'You have been kicked from the game.');
            setInGame(false);
            setIsJoined(false);
            setRoomState(null);
            setMyHand([]);
            setBidTurn(null);
            setIsMyTurn(false);
            setPlayerName(''); // Optional: clear name
        }

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('state_update', onStateUpdate);
        socket.on('player_joined', onStateUpdate);
        socket.on('player_left', onStateUpdate);
        socket.on('deal_hand', onDealHand);
        socket.on('bid_turn', onBidTurn);
        socket.on('ask_trump', onAskTrump);
        socket.on('ask_trump', onAskTrump);
        socket.on('ask_trump', onAskTrump);
        socket.on('card_played', onCardPlayed);
        socket.on('kitty_reveal', onKittyReveal);
        socket.on('error_message', onError); // In-game errors (toast only)
        socket.on('error', onJoinError); // Connection/Join errors (reset state)
        socket.on('kicked', onKicked);

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('state_update', onStateUpdate);
            socket.off('player_joined', onStateUpdate);
            socket.off('player_left', onStateUpdate);
            socket.off('deal_hand', onDealHand);
            socket.off('bid_turn', onBidTurn);
            socket.off('ask_trump', onAskTrump);
            socket.off('card_played', onCardPlayed);
            socket.off('kitty_reveal', onKittyReveal);
            socket.off('error_message', onError);
            socket.off('error', onJoinError);
            socket.off('kicked', onKicked);
        };
    }, []);

    const joinGame = () => {
        if (playerName.trim()) {
            socket.emit('join_room', 'room1', playerName, joinCode);
            setIsJoined(true);
        } else {
            alert("Lütfen bir isim girin!");
        }
    };

    const sendBid = (amount) => {
        socket.emit('bid', amount);
        setBidTurn(null);
    }

    const selectTrump = (suit) => {
        socket.emit('select_trump', suit);
    }

    const playCard = (card) => {
        if (!isMyTurn) return;
        socket.emit('play_card', card);
        // Optimistic update could happen here
    }

    const toggleBury = (card) => {
        setSelectedForBury(prev => {
            const isSelected = prev.some(c => c.suit === card.suit && c.rank === card.rank);
            if (isSelected) {
                return prev.filter(c => !(c.suit === card.suit && c.rank === card.rank));
            } else {
                if (prev.length >= 4) return prev; // Max 4
                return [...prev, card];
            }
        });
    }

    const submitExchange = () => {
        if (selectedForBury.length !== 4) return;
        socket.emit('exchange_cards', selectedForBury);
        setKittyCards([]); // Clear kitty display locally
    }

    if (!isJoined) {
        return (
            <div className="min-h-screen bg-green-900 flex flex-col items-center justify-center text-white">
                <h1 className="text-4xl font-bold mb-8">İhaleli Batak</h1>
                <div className="flex flex-col gap-4">
                    <input
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && joinGame()}
                    />
                    <input
                        type="text"
                        placeholder="Oda Kodu (Varsa)"
                        className="px-4 py-2 rounded text-black font-bold outline-none focus:ring-4 ring-yellow-500 uppercase"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value)}
                        maxLength={4}
                    />
                    <button onClick={joinGame} className="px-6 py-3 bg-yellow-500 text-black font-bold rounded hover:bg-yellow-400">
                        Odaya Katıl
                    </button>
                    <button
                        onClick={() => setShowAdmin(true)}
                        className="text-xs text-gray-400 hover:text-white underline mt-2"
                    >
                        Admin Panel
                    </button>
                </div>
                {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
            </div>
        )
    }

    if (!inGame && roomState?.state === 'WAITING') {
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
                                    {/* Show Code Only to Admin (Seat 0) */}
                                    {roomState.players[0]?.id === socket.id && idx > 0 && (
                                        <div className="text-yellow-400 font-mono text-lg mt-1 font-bold">
                                            KOD: {roomState.seatCodes[idx]}
                                        </div>
                                    )}
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
                                    {p.id === socket.id && <span className="text-xs bg-yellow-500 text-black px-1 rounded">SEN</span>}
                                    {p.isAdmin && <span className="text-xs bg-red-600 text-white px-1 rounded ml-2">YÖNETİCİ</span>}
                                </li>
                            );
                        })}
                    </ul>

                    {/* Admin Start Button */}
                    {roomState.players[0]?.id === socket.id && (
                        <div className="mt-8 border-t border-green-600 pt-4">
                            <button
                                onClick={() => socket.emit('start_game')}
                                className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow-lg animate-pulse"
                            >
                                OYUNU BAŞLAT
                            </button>
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // Fallback if joined but no room state yet
    if (!roomState) {
        return (
            <div className="min-h-screen bg-green-900 flex items-center justify-center text-white">
                Yükleniyor...
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-stone-900 flex flex-col items-center justify-start p-4 relative overflow-hidden">
            {/* Header */}
            <div className="w-full flex justify-between text-white mb-2 z-50">
                <div className="flex gap-4 items-center">
                    <span>Room: {roomState?.roomId}</span>
                    <button
                        onClick={() => setShowAdmin(true)}
                        className="text-xs bg-red-600/50 hover:bg-red-600 px-2 py-1 rounded text-white border border-red-500"
                    >
                        YÖNETİCİ
                    </button>
                </div>
                <div className={isConnected ? "text-green-400" : "text-red-400"}>
                    {isConnected ? "Bağlı" : "Bağlantı Yok"}
                </div>
            </div>

            {/* Admin Panel */}
            {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}

            {/* Error Toast */}
            {errorMsg && (
                <div className="absolute top-20 z-50 bg-red-600 text-white px-4 py-2 rounded shadow-lg animate-bounce">
                    {errorMsg}
                </div>
            )}

            {/* Game Area */}
            <div className="w-full max-w-4xl mb-32">
                <GameBoard roomState={roomState} myPlayerId={socket.id} />
            </div>

            {/* Interaction Overlays */}

            {/* BIDDING UI */}
            {roomState?.state === 'BIDDING' && bidTurn?.playerId === socket.id && (
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
            {roomState?.state === 'EXCHANGE_CARDS' && roomState.winningBid.playerId === socket.id && (
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
                    </div>

                </div>
            )}

            {/* TRUMP SELECTION UI */}
            {roomState?.state === 'TRUMP_SELECTION' && roomState.winningBid.playerId === socket.id && (
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
            <div className="fixed bottom-0 left-0 w-full h-24 md:h-40 z-40 bg-gradient-to-t from-black via-black/50 to-transparent flex items-end justify-center pb-2 px-2 overflow-hidden">
                <div className="flex items-end justify-center transform translate-y-4 hover:translate-y-0 transition-transform duration-300">
                    {myHand.map((card, idx) => (
                        <div
                            key={`${card.suit}-${card.rank}-${idx}`}
                            className={`
                                transform transition-all duration-300 hover:-translate-y-6 hover:scale-110 hover:z-50 origin-bottom
                                ${idx !== 0 ? '-ml-8 md:-ml-12' : ''}
                            `}
                            style={{
                                zIndex: idx
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
            </div>
        </div>
    )
}

export default App
