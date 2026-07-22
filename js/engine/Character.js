/**
 * Character 实体类 — 角色牌 J/Q/K
 */
export class Character {
    constructor(rank, suit) {
        this.rank = rank;
        this.suit = suit;
        this.maxHp = rank === 'J' ? 30 : (rank === 'Q' ? 40 : 50);
        this.hp = this.maxHp;
        this.shield = 0;
        this.isDead = false;
    }

    takeDamage(amount, ignoreShield = false) {
        if (this.isDead) return 0;
        let actualDamage = 0;
        if (ignoreShield) {
            const dmgToHp = Math.min(this.hp, amount);
            this.hp -= dmgToHp;
            actualDamage = dmgToHp;
        } else {
            if (this.shield >= amount) {
                this.shield -= amount;
                actualDamage = amount;
            } else {
                const remaining = amount - this.shield;
                actualDamage += this.shield;
                this.shield = 0;
                const dmgToHp = Math.min(this.hp, remaining);
                this.hp -= dmgToHp;
                actualDamage += dmgToHp;
            }
        }
        if (this.hp <= 0) {
            this.hp = 0;
            this.isDead = true;
            this.shield = 0;
        }
        return actualDamage;
    }

    revive() {
        this.isDead = false;
        this.hp = this.maxHp;
        this.shield = 0;
    }

    execute() {
        this.isDead = true;
        this.hp = 0;
        this.shield = 0;
    }
}
