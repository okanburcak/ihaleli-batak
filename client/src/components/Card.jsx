import React from 'react';

const SuitIcon = ({ suit }) => {
    const color = (suit === '♥' || suit === '♦') ? 'text-red-500' : 'text-black';
    return <span className={`${color} text-xl md:text-2xl`}>{suit}</span>;
};

const Card = ({ card, onClick, isPlayable = false, isPlayed = false, showGomu = false }) => {
    if (!card) return <div className="w-16 h-24 bg-green-800 rounded opacity-50"></div>;

    // Back of card
    if (card === 'BACK') {
        return (
            <div className="w-16 h-24 bg-blue-800 border-2 border-white rounded shadow-md flex items-center justify-center">
                <div className="w-12 h-20 bg-blue-600 pattern-dots"></div>
            </div>
        );
    }

    return (
        <div
            onClick={() => isPlayable ? onClick(card) : null}
            className={`
                w-14 h-20 md:w-20 md:h-28 bg-white rounded-lg shadow-lg flex flex-col items-center justify-between p-1 md:p-2 
                cursor-pointer transition-transform transform 
                ${isPlayable ? 'hover:-translate-y-4 hover:shadow-xl' : ''}
                ${isPlayed ? 'z-0' : 'hover:z-10'}
            `}
        >
            <div className="w-full flex justify-start">
                <div className={`flex flex-col items-center leading-none ${(card.suit === '♥' || card.suit === '♦') ? 'text-red-600' : 'text-black'}`}>
                    <span className="text-sm md:text-lg font-bold">{card.rank}</span>
                    <span className="text-xs md:text-base">{card.suit}</span>
                </div>
            </div>
            <SuitIcon suit={card.suit} />
            <div className="w-full flex justify-end transform rotate-180">
                <div className={`flex flex-col items-center leading-none ${(card.suit === '♥' || card.suit === '♦') ? 'text-red-600' : 'text-black'}`}>
                    <span className="text-sm md:text-lg font-bold">{card.rank}</span>
                    <span className="text-xs md:text-base">{card.suit}</span>
                </div>
            </div>
            {card.fromKitty && showGomu && (
                <div className="absolute top-0 right-0 bg-purple-500 text-[10px] md:text-xs px-1 text-white rounded-bl">G</div>
            )}
        </div>
    );
};

export default Card;
