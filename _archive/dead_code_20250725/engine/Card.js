/**
 * Card 实体类
 * Bug Fix: Ace 值固定为 1（不再由用户自定义 1-13）
 */
export class Card {
    constructor(suit, rank, isJoker = false) {
        this.suit = suit;
        this.rank = rank;
        this.isJoker = isJoker;
        this.value = this._calculateValue();
    }

    _calculateValue() {
        if (this.isJoker) return 0;
        if (this.rank === 'A') return 1;
        if (this.rank === 'K') return 10;
        if (this.rank === 'Q') return 10;
        if (this.rank === 'J') return 10;
        return parseInt(this.rank);
    }
}
