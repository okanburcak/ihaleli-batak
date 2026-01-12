class Deck {
    constructor() {
        this.suits = ['♠', '♥', '♦', '♣']; // Spades, Hearts, Diamonds, Clubs
        this.ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        this.cards = [];
        this.reset();
    }

    reset() {
        this.cards = [];
        for (let suit of this.suits) {
            for (let rank of this.ranks) {
                this.cards.push({ suit, rank, code: `${rank}${suit}` });
            }
        }
        this.shuffle();
    }

    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    deal() {
        // Returns 4 hands of 12 cards and 1 kitty of 4 cards
        const hands = [[], [], [], []];
        const kitty = [];
        let playerIndex = 0;

        // Deal 48 cards (12 * 4)
        for (let i = 0; i < 48; i++) {
            hands[playerIndex].push(this.cards[i]);
            playerIndex = (playerIndex + 1) % 4;
        }

        // Remaining 4 cards go to kitty
        for (let i = 48; i < 52; i++) {
            kitty.push(this.cards[i]);
        }

        // Sort hands
        hands.forEach(hand => this.sortHand(hand));
        // Sort kitty too
        this.sortHand(kitty);

        return { hands, kitty };
    }

    sortHand(hand) {
        const suitOrder = { '♠': 0, '♥': 1, '♣': 2, '♦': 3 };
        const rankOrder = {
            'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10,
            '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
        };

        hand.sort((a, b) => {
            if (suitOrder[a.suit] !== suitOrder[b.suit]) {
                return suitOrder[a.suit] - suitOrder[b.suit];
            }
            return rankOrder[b.rank] - rankOrder[a.rank]; // Descending rank
        });
    }
}

module.exports = Deck;
