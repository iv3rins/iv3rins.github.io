/**
 * Player 实体类
 */
export class Player {
    constructor(id) {
        this.id = id;
        this.characters = [];
        this.activeCharIndex = 0;
        this.hand = [];
        this.isEliminated = false;
    }

    getActiveCharacter() {
        return this.characters[this.activeCharIndex];
    }

    checkElimination() {
        if (this.characters.every(c => c.isDead)) {
            this.isEliminated = true;
        } else if (this.getActiveCharacter().isDead) {
            this.activeCharIndex = this.characters.findIndex(c => !c.isDead);
        }
        return this.isEliminated;
    }

    removeCardsFromHand(cardsToRemove) {
        cardsToRemove.forEach(cardToRm => {
            const idx = this.hand.findIndex(c => c === cardToRm);
            if (idx !== -1) this.hand.splice(idx, 1);
        });
    }

    needsReplenish() {
        if (this.hand.length === 0) return true;
        if (this.hand.every(c => c.isJoker)) return true;
        return false;
    }
}
