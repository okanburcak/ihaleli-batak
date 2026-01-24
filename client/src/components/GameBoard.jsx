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
        <div className="relative w-full aspect-square md:aspect-video h-[60vh] md:h-[75vh] max-h-[800px] bg-green-800 rounded-[50px] border-[12px] border-stone-800 shadow-[inset_0_0_80px_rgba(0,0,0,0.6)] p-4 md:p-8 flex items-center justify-center">

            {/* Table Felt Texture Effect (CSS Gradient) */}
            <div className="absolute inset-0 rounded-[38px] bg-gradient-to-br from-green-700 to-green-900 opacity-50 pointer-events-none"></div>

            {/* Central Area: Playing Surface */}
            <div className="relative w-2/3 h-2/3 flex items-center justify-center">
                {/* Center Logo/Decoration */}
                <div className="absolute opacity-10 text-stone-900 text-6xl font-bold tracking-widest pointer-events-none select-none">
                    BATAK
                </div>

                {/* Info Panel: Trump & Bid - Floats Top Left */}
                <div className="absolute -top-16 -left-16 md:-top-20 md:-left-24 bg-stone-900/80 text-yellow-500 p-3 rounded-xl border border-yellow-600 shadow-xl backdrop-blur-sm transform -rotate-6">
                    <div className="font-bold text-xs uppercase tracking-wider text-stone-400">KOZ</div>
                    <div className="text-3xl md:text-4xl leading-none mb-1 text-center">{trump || '?'}</div>
                    <div className="h-px bg-stone-600 my-1"></div>
                    <div className="font-bold text-xs uppercase tracking-wider text-stone-400">İHALE</div>
                    <div className="text-lg md:text-xl text-white text-center">
                        {winningBid.amount > 0 ? winningBid.amount : '-'}
                    </div>
                </div>

                {/* Scoreboard - Floats Top Right */}
                <div className="absolute -top-16 -right-16 md:-top-20 md:-right-24 bg-stone-900/80 text-white p-3 rounded-xl border border-stone-600 shadow-xl backdrop-blur-sm transform rotate-3">
                    <h3 className="font-bold text-xs uppercase text-stone-400 mb-2 border-b border-stone-600 pb-1">Skorlar</h3>
                    <div className="space-y-1 text-xs md:text-sm">
                        {players.map(p => (
                            <div key={p.id} className="flex justify-between gap-4">
                                <span className={p.id === myPlayerId ? 'text-yellow-400 font-bold' : 'text-gray-300'}>{p.name}</span>
                                <span className="font-mono">{scores[p.id]} ({roundScores[p.id] || 0})</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* --- PLAYERS --- */}

                {/* TOP PLAYER (Partner/Opponent) */}
                <div className="absolute -top-12 md:-top-16 left-1/2 transform -translate-x-1/2 flex flex-col items-center z-10">
                    <PlayerAvatar player={orderedPlayers[2]} />
                    {/* Card Slot - Pushed down onto table */}
                    <div className="absolute top-16 md:top-24 transform scale-75 md:scale-90 transition-all duration-500">
                        <Card card={getPlayerCardInTrick(orderedPlayers[2]?.id)} showGomu={myPlayerId === winningBid.playerId} />
                    </div>
                </div>

                {/* LEFT PLAYER */}
                <div className="absolute left-0 top-1/2 transform -translate-x-1/2 md:-translate-x-full -translate-y-1/2 flex flex-row items-center z-10">
                    <div className="mr-0 md:mr-8 flex flex-col items-center">
                        <PlayerAvatar player={orderedPlayers[3]} />
                    </div>
                    {/* Card Slot - Pushed right onto table */}
                    <div className="absolute left-16 md:left-24 transform scale-75 md:scale-90 transition-all duration-500">
                        <Card card={getPlayerCardInTrick(orderedPlayers[3]?.id)} showGomu={myPlayerId === winningBid.playerId} />
                    </div>
                </div>

                {/* RIGHT PLAYER */}
                <div className="absolute right-0 top-1/2 transform translate-x-1/2 md:translate-x-full -translate-y-1/2 flex flex-row-reverse items-center z-10">
                    <div className="ml-0 md:ml-8 flex flex-col items-center">
                        <PlayerAvatar player={orderedPlayers[1]} />
                    </div>
                    {/* Card Slot - Pushed left onto table */}
                    <div className="absolute right-16 md:right-24 transform scale-75 md:scale-90 transition-all duration-500">
                        <Card card={getPlayerCardInTrick(orderedPlayers[1]?.id)} showGomu={myPlayerId === winningBid.playerId} />
                    </div>
                </div>

                {/* BOTTOM PLAYER (ME) - Avatar not really needed maybe? Or small? Keep consistent. */}
                {/* Actually, usually "Me" is at the bottom of the screen, outside the table logic often. */}
                {/* But for the avatar display (turn indicator), we need it. */}
                <div className="absolute -bottom-16 md:-bottom-20 left-1/2 transform -translate-x-1/2 z-10">
                    {/* We only show avatar if game is optimizing for table view */}
                    {/* The cards are in the hand below. The played card goes ON table. */}
                    <div className="opacity-0 md:opacity-100 transition-opacity">
                        <PlayerAvatar player={orderedPlayers[0]} />
                    </div>
                    <div className="absolute bottom-20 md:bottom-32 transform scale-75 md:scale-90 transition-all duration-500">
                        <Card card={getPlayerCardInTrick(orderedPlayers[0]?.id)} showGomu={myPlayerId === winningBid.playerId} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GameBoard;
