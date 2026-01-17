import React, { useState, useEffect } from 'react';
import Card from './Card';


const GameBoard = ({ roomState, myPlayerId }) => {
    if (!roomState) return <div>Yükleniyor...</div>;

    const { players, currentTrick, trump, roundScores, scores, winningBid } = roomState;

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
                <div className="w-8 h-8 md:w-12 md:h-12 bg-gray-300 rounded-full mb-1 border-2 border-white"></div>
                <div className="text-white text-xs md:text-sm font-bold bg-black/50 px-2 rounded mb-1">{orderedPlayers[2]?.name || 'Bekliyor'}</div>
                {/* Card Slot */}
                <div className="mt-1 md:mt-4">
                    <Card card={getPlayerCardInTrick(orderedPlayers[2]?.id)} showGomu={myPlayerId === winningBid.playerId} />
                </div>
            </div>

            {/* LEFT PLAYER (Position 3) */}
            <div className="absolute left-2 md:left-8 top-1/2 transform -translate-y-1/2 flex flex-row items-center">
                <div className="flex flex-col items-center mr-2 md:mr-4">
                    <div className="w-8 h-8 md:w-12 md:h-12 bg-gray-300 rounded-full mb-1 border-2 border-white"></div>
                    <div className="text-white text-xs md:text-sm font-bold bg-black/50 px-2 rounded">{orderedPlayers[3]?.name || 'Bekliyor'}</div>
                </div>
                {/* Card Slot */}
                <div>
                    <Card card={getPlayerCardInTrick(orderedPlayers[3]?.id)} showGomu={myPlayerId === winningBid.playerId} />
                </div>
            </div>

            {/* RIGHT PLAYER (Position 1) */}
            <div className="absolute right-2 md:right-8 top-1/2 transform -translate-y-1/2 flex flex-row-reverse items-center">
                <div className="flex flex-col items-center ml-2 md:ml-4">
                    <div className="w-8 h-8 md:w-12 md:h-12 bg-gray-300 rounded-full mb-1 border-2 border-white"></div>
                    <div className="text-white text-xs md:text-sm font-bold bg-black/50 px-2 rounded">{orderedPlayers[1]?.name || 'Bekliyor'}</div>
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
