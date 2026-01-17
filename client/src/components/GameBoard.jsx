import React, { useState, useEffect } from 'react';
import Card from './Card';


const GameBoard = ({ roomState, myPlayerId }) => {
    if (!roomState) return <div>Yükleniyor...</div>;

    const { players, currentTrick, trump, roundScores, scores, winningBid, bids, state, currentTurn } = roomState;

    // Find my position index
    const myIndex = players.findIndex(p => p.id === myPlayerId);

    // Calculate relative positions for display [Bottom (Me), Left, Top, Right]
    // orderedPlayers[0] = Me, orderedPlayers[1] = Next...
    const orderedPlayers = [
        players[myIndex],
        players[(myIndex + 1) % 4],
        players[(myIndex + 2) % 4],
        players[(myIndex + 3) % 4]
    ];



    const getPlayerCardInTrick = (pId) => {
        const play = currentTrick.find(p => p.playerId === pId);
        return play ? play.card : null;
    };

    const isTurn = (pId) => currentTurn === pId;

    const getBidDisplay = (pId) => {
        if (state !== 'BIDDING') return null;
        if (!bids || bids[pId] === undefined) return null;
        return bids[pId] === 0 ? 'PAS' : bids[pId];
    };

    const PlayerAvatar = ({ player }) => {
        if (!player) return <div className="text-white/50 text-xs">Bekliyor</div>;
        const bid = getBidDisplay(player.id);
        const isActive = isTurn(player.id);

        return (
            <div className="flex flex-col items-center relative">
                <div className={`
                    w-8 h-8 md:w-16 md:h-16 rounded-full mb-1 border-2 transition-all duration-300
                    ${isActive ? 'border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.8)] scale-110' : 'border-white'}
                    bg-gray-300 overflow-hidden
                `}>
                    {/* Placeholder Avatar Image or Initials */}
                    <div className="w-full h-full flex items-center justify-center bg-gray-700 text-white font-bold text-xs md:text-xl">
                        {player.name.charAt(0)}
                    </div>
                </div>

                <div className={`px-2 rounded text-xs md:text-sm font-bold transition-colors ${isActive ? 'bg-yellow-500 text-black' : 'bg-black/50 text-white'}`}>
                    {player.name}
                </div>

                {/* Bid Badge */}
                {bid !== null && (
                    <div className="absolute -top-2 -right-2 md:-top-0 md:-right-6 bg-blue-600 text-white text-[10px] md:text-xs px-1.5 py-0.5 rounded-full border border-blue-400 shadow-md animate-bounce">
                        {bid}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="relative w-full h-[400px] md:h-[600px] bg-green-800 rounded-xl border-4 border-green-900 shadow-2xl p-2 md:p-4">

            {/* Info Panel: Trump & Bid */}
            <div className="absolute top-2 left-2 md:top-4 md:left-4 bg-black/40 text-white p-1 md:p-2 rounded text-xs md:text-base">
                <div>Koz: <span className="text-base md:text-2xl">{trump || '?'}</span></div>
                <div>İhale: {winningBid.amount > 0 ? `${winningBid.amount} (${winningBid.playerId === myPlayerId ? 'Sen' : '...'})` : 'Yok'}</div>
            </div>

            {/* Scoreboard */}
            <div className="absolute top-2 right-2 md:top-4 md:right-4 bg-black/40 text-white p-1 md:p-2 rounded text-[10px] md:text-sm">
                <h3>Puanlar</h3>
                {players.map(p => (
                    <div key={p.id}>{p.name}: {scores[p.id]} ({roundScores[p.id] || 0})</div>
                ))}
            </div>

            {/* TOP PLAYER */}
            <div className="absolute top-4 md:top-8 left-1/2 transform -translate-x-1/2 flex flex-col items-center">
                <PlayerAvatar player={orderedPlayers[2]} />
                {/* Card Slot */}
                <div className="mt-1 md:mt-4">
                    <Card card={getPlayerCardInTrick(orderedPlayers[2]?.id)} showGomu={myPlayerId === winningBid.playerId} />
                </div>
            </div>

            {/* LEFT PLAYER (Position 3) */}
            <div className="absolute left-2 md:left-8 top-1/2 transform -translate-y-1/2 flex flex-row items-center">
                <div className="mr-2 md:mr-4">
                    <PlayerAvatar player={orderedPlayers[3]} />
                </div>
                {/* Card Slot */}
                <div>
                    <Card card={getPlayerCardInTrick(orderedPlayers[3]?.id)} showGomu={myPlayerId === winningBid.playerId} />
                </div>
            </div>

            {/* RIGHT PLAYER (Position 1) */}
            <div className="absolute right-2 md:right-8 top-1/2 transform -translate-y-1/2 flex flex-row-reverse items-center">
                <div className="ml-2 md:ml-4">
                    <PlayerAvatar player={orderedPlayers[1]} />
                </div>
                {/* Card Slot */}
                <div>
                    <Card card={getPlayerCardInTrick(orderedPlayers[1]?.id)} showGomu={myPlayerId === winningBid.playerId} />
                </div>
            </div>

            {/* BOTTOM PLAYER (ME) */}
            <div className="absolute bottom-20 md:bottom-32 left-1/2 transform -translate-x-1/2">
                <div className="mb-2 md:mb-4">
                    <Card card={getPlayerCardInTrick(orderedPlayers[0]?.id)} showGomu={myPlayerId === winningBid.playerId} />
                </div>
            </div>
        </div>
    );
};

export default GameBoard;
