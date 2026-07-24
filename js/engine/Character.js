/**
 * Character — 角色实体
 * 处理血量、护盾结算以及多条命(Lives)机制
 */

export class Character {
    constructor(rank, suit, maxLives = 3) {
        this.rank = rank;
        this.suit = suit;
        
        // 生命条数（快速模式=1，常规模式=3）
        this.maxLives = maxLives;
        this.lives = maxLives;
        
        // 初始最大血量
        this.maxHp = 30; 
        if (rank === 'Q') this.maxHp = 40;
        if (rank === 'K') this.maxHp = 50;

        this.hp = this.maxHp;
        this.shield = 0;
        
        this.isDead = false;
        this.isDying = false;
    }

    /**
     * 严格伤害结算
     * 遵循：剩余伤害 = Math.max(0, damage - 护盾)
     */
    takeDamage(damage, ignoreShield = false) {
        let actualDamage = 0;

        if (ignoreShield) {
            // 直接扣血，无视护盾
            const remaining = Math.max(0, damage);
            actualDamage = remaining;
            this.hp = Math.max(0, this.hp - remaining);
        } else {
            // 优先扣护盾，溢出扣血
            const absorbed = Math.min(this.shield, damage);
            this.shield -= absorbed;
            
            const remaining = Math.max(0, damage - absorbed);
            actualDamage = remaining;
            this.hp = Math.max(0, this.hp - remaining);
        }

        // 血量归零，触发濒死
        if (this.hp === 0 && !this.isDead) {
            this.isDying = true;
        }

        return actualDamage;
    }

    /**
     * 结算死亡 (包含多条命复活判定)
     */
    die() {
        this.lives--;
        
        if (this.lives > 0) {
            // 消耗一命，满血复活
            this.hp = this.maxHp;
            this.shield = 0;
            this.isDying = false;
            this.isDead = false;
            console.log(`[Character] 角色重生，剩余命数: ${this.lives}`);
        } else {
            // 彻底死亡
            this.hp = 0;
            this.shield = 0;
            this.isDying = false;
            this.isDead = true;
            console.log(`[Character] 角色彻底死亡`);
        }
    }

    /**
     * 救援回复
     */
    rescue(amount) {
        this.hp = Math.min(this.maxHp, this.hp + amount);
        this.isDying = false;
        this.isDead = false;
    }

    /**
     * Joker 单张复活
     */
    revive() {
        this.hp = Math.floor(this.maxHp / 2);
        this.shield = 0;
        this.isDead = false;
        this.isDying = false;
    }

    /**
     * 双 Joker 直接斩杀
     */
    execute() {
        this.hp = 0;
        this.shield = 0;
        this.lives = 0; // 斩杀直接清空命数
        this.isDying = false;
        this.isDead = true;
    }
}