import React, { useState, useEffect } from 'react';
import Card from './Card';
import { socket } from '../socket';

const GameBoard = ({ roomState, myPlayerId }) => {
    if (!roomState) return <div>Loading...</div>;

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
        <div className="relative w-full h-[600px] bg-green-800 rounded-xl border-4 border-green-900 shadow-2xl p-4">

            {/* Info Panel: Trump & Bid */}
            <div className="absolute top-4 left-4 bg-black/40 text-white p-2 rounded">
                <div>Trump: <span className="text-2xl">{trump || '?'}</span></div>
                <div>Bid: {winningBid.amount > 0 ? `${winningBid.amount} by ...` : 'No Bid'}</div>
            </div>

            {/* Scoreboard */}
            <div className="absolute top-4 right-4 bg-black/40 text-white p-2 rounded text-sm">
                <h3>Scores</h3>
                {players.map(p => (
                    <div key={p.id}>{p.name}: {scores[p.id]} (Round: {roundScores[p.id] || 0})</div>
                ))}
            </div>

            {/* TOP PLAYER */}
            <div className="absolute top-8 left-1/2 transform -translate-x-1/2 flex flex-col items-center">
                <div className="w-12 h-12 bg-gray-300 rounded-full mb-2 border-2 border-white"></div>
                <div className="text-white text-sm font-bold bg-black/50 px-2 rounded">{orderedPlayers[2]?.name || 'Waiting'}</div>
                {/* Card Slot */}
                <div className="mt-4">
                    <Card card={getPlayerCardInTrick(orderedPlayers[2]?.id)} showGomu={myPlayerId === winningBid.playerId} />
                </div>
            </div>

            {/* LEFT PLAYER (Position 3) */}
            <div className="absolute left-8 top-1/2 transform -translate-y-1/2 flex flex-row items-center">
                <div className="flex flex-col items-center mr-4">
                    <div className="w-12 h-12 bg-gray-300 rounded-full mb-2 border-2 border-white"></div>
                    <div className="text-white text-sm font-bold bg-black/50 px-2 rounded">{orderedPlayers[3]?.name || 'Waiting'}</div>
                </div>
                {/* Card Slot */}
                <div>
                    <Card card={getPlayerCardInTrick(orderedPlayers[3]?.id)} showGomu={myPlayerId === winningBid.playerId} />
                </div>
            </div>

            {/* RIGHT PLAYER (Position 1) */}
            <div className="absolute right-8 top-1/2 transform -translate-y-1/2 flex flex-row-reverse items-center">
                <div className="flex flex-col items-center ml-4">
                    <div className="w-12 h-12 bg-gray-300 rounded-full mb-2 border-2 border-white"></div>
                    <div className="text-white text-sm font-bold bg-black/50 px-2 rounded">{orderedPlayers[1]?.name || 'Waiting'}</div>
                </div>
                {/* Card Slot */}
                <div>
                    <Card card={getPlayerCardInTrick(orderedPlayers[1]?.id)} showGomu={myPlayerId === winningBid.playerId} />
                </div>
            </div>

            {/* BOTTOM PLAYER (ME) */}
            <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2">
                <div className="mb-4">
                    <Card card={getPlayerCardInTrick(orderedPlayers[0]?.id)} showGomu={myPlayerId === winningBid.playerId} />
                </div>
            </div>

            {/* MY HAND - Rendered outside usually, but putting placeholder here for structure */}
            {/* The actual hand will be in the parent component fixed at bottom */}
        </div>
    );
};

export default GameBoard;
