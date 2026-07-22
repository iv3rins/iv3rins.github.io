/**
 * Character 实体类 — 角色牌 J/Q/K
 * Bug3: 新增濒死状态 (isDying)，hp=0 时不直接死亡
 */
export class Character {
    constructor(rank, suit) {
        this.rank = rank;
        this.suit = suit;
        this.maxHp = rank === 'J' ? 30 : (rank === 'Q' ? 40 : 50);
        this.hp = this.maxHp;
        this.shield = 0;
        this.isDead = false;
        this.isDying = false;  // ★ Bug3: 濒死状态
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
            // ★ Bug3: 进入濒死而非直接死亡
            this.isDying = true;
            this.shield = 0;
        }
        return actualDamage;
    }

    /** 濒死被救回 */
    rescue(healAmount) {
        if (!this.isDying) return false;
        this.isDying = false;
        this.hp = Math.min(this.maxHp, healAmount);
        return true;
    }

    /** 濒死超时，真正死亡 */
    die() {
        this.isDying = false;
        this.isDead = true;
        this.hp = 0;
        this.shield = 0;
    }

    revive() {
        this.isDead = false;
        this.isDying = false;
        this.hp = this.maxHp;
        this.shield = 0;
    }

    execute() {
        this.isDead = true;
        this.isDying = false;
        this.hp = 0;
        this.shield = 0;
    }
}
