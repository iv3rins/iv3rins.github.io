/**
 * Player 实体类
 * Bug3: checkElimination 考虑濒死状态
 * Bug4: activeCharIndex 初始为 -1（未选将）
 */
export class Player {
    constructor(id) {
        this.id = id;
        this.characters = [];
        this.activeCharIndex = -1;  // ★ Bug4: -1 = 未选首发
        this.hand = [];
        this.isEliminated = false;
        this.starterSelected = false; // ★ Bug4: 是否已选将
    }

    getActiveCharacter() {
        if (this.activeCharIndex < 0) return this.characters[0];
        return this.characters[this.activeCharIndex];
    }

    /** 选将 */
    selectStarter(charIndex) {
        if (charIndex >= 0 && charIndex < this.characters.length) {
            this.activeCharIndex = charIndex;
            this.starterSelected = true;
            return true;
        }
        return false;
    }

    checkElimination() {
        // ★ Bug3: 濒死不算死亡，不触发淘汰
        if (this.characters.every(c => c.isDead)) {
            this.isEliminated = true;
        } else if (this.activeCharIndex >= 0 && this.characters[this.activeCharIndex].isDead) {
            // 当前角色已死亡（非濒死），切换到下一个存活角色
            const nextIdx = this.characters.findIndex(c => !c.isDead && !c.isDying);
            if (nextIdx >= 0) this.activeCharIndex = nextIdx;
        }
        return this.isEliminated;
    }

    /** 是否有存活（非死亡且非濒死）角色 */
    hasAliveCharacter() {
        return this.characters.some(c => !c.isDead);
    }

    /** 是否有濒死角色 */
    getDyingCharIndex() {
        return this.characters.findIndex(c => c.isDying);
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
