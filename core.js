/**
 * 多人竞技棋牌游戏 - 核心逻辑引擎
 * 适用于交由低级 AI 维护、对接 UI 或进行扩展
 */

// --- 常量定义 ---
const SUITS = ['♦', '♣', '♥', '♠'];
const NORMAL_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10']; // A单独处理
const MAX_HAND_SIZE = 7;

// --- 实体类定义 ---

class Card {
    constructor(suit, rank, isJoker = false) {
        this.suit = suit;
        this.rank = rank;
        this.isJoker = isJoker;
        this.value = this._calculateValue();
    }

    _calculateValue() {
        if (this.isJoker || this.rank === 'A') return 0; // A的值由万化时动态指定
        return parseInt(this.rank);
    }
}

class Character {
    constructor(rank, suit) {
        this.rank = rank; // 'J', 'Q', 'K'
        this.suit = suit; // '♦', '♣', '♥', '♠'
        this.maxHp = rank === 'J' ? 30 : (rank === 'Q' ? 40 : 50);
        this.hp = this.maxHp;
        this.shield = 0;
        this.isDead = false;
    }

    takeDamage(amount, ignoreShield = false) {
        if (this.isDead) return 0;
        let actualDamage = 0;
        
        if (ignoreShield) {
            let dmgToHp = Math.min(this.hp, amount);
            this.hp -= dmgToHp;
            actualDamage = dmgToHp;
        } else {
            if (this.shield >= amount) {
                this.shield -= amount;
                actualDamage = amount;
            } else {
                let remaining = amount - this.shield;
                actualDamage += this.shield;
                this.shield = 0;
                
                let dmgToHp = Math.min(this.hp, remaining);
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

class Player {
    constructor(id) {
        this.id = id;
        this.characters = []; // 3张角色牌
        this.activeCharIndex = 0; // 当前上场角色索引
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
            // 自动切换到下一个存活角色
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

    // 判断是否需要触发补牌规则（全空，或全Joker）
    needsReplenish() {
        if (this.hand.length === 0) return true;
        if (this.hand.every(c => c.isJoker)) return true;
        return false;
    }
}

// --- 游戏主控制器 ---

class GameEngine {
    constructor(numPlayers) {
        this.numPlayers = numPlayers;
        this.players = [];
        this.deck = [];
        this.discardPile = [];
        this.currentPlayerIndex = 0;
        this.isGameOver = false;
        
        this._initGame();
    }

    _initGame() {
        // 1. 初始化玩家
        for (let i = 0; i < this.numPlayers; i++) {
            this.players.push(new Player(i));
        }

        // 2. 初始化牌堆 (每4人1副牌)
        let deckCount = Math.ceil(this.numPlayers / 4);
        this._generateDeck(deckCount);

        // 3. 分发角色牌
        this._dealCharacters();

        // 4. 分发初始手牌 (每人5张)
        this.players.forEach(p => this.drawCards(p, 5));

        // 5. 随机决定起始玩家
        this.currentPlayerIndex = Math.floor(Math.random() * this.numPlayers);
    }

    _generateDeck(deckCount) {
        let deck = [];
        for (let i = 0; i < deckCount; i++) {
            SUITS.forEach(suit => {
                deck.push(new Card(suit, 'A'));
                NORMAL_RANKS.forEach(rank => {
                    deck.push(new Card(suit, rank));
                });
            });
            // 每副牌2张Joker
            deck.push(new Card(null, 'Joker', true));
            deck.push(new Card(null, 'Joker', true));
        }
        this.deck = this._shuffle(deck);
    }

    _dealCharacters() {
        const charRanks = ['J', 'Q', 'K'];
        this.players.forEach(p => {
            charRanks.forEach(rank => {
                let randomSuit = SUITS[Math.floor(Math.random() * SUITS.length)];
                p.characters.push(new Character(rank, randomSuit));
            });
            // 默认第一张上场，实际可由UI提供接口让玩家选择
            p.activeCharIndex = 0; 
        });
    }

    _shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // 抽牌逻辑 (处理牌堆耗尽与手牌上限)
    drawCards(player, count) {
        if (player.isEliminated) return 0;
        let drawn = 0;
        for (let i = 0; i < count; i++) {
            if (player.hand.length >= MAX_HAND_SIZE) break;
            
            if (this.deck.length === 0) {
                if (this.discardPile.length === 0) break; // 无牌可洗
                this.deck = this._shuffle([...this.discardPile]);
                this.discardPile = [];
            }
            player.hand.push(this.deck.pop());
            drawn++;
        }
        return drawn;
    }

    // 验证出牌是否合法
    validatePlay(cards) {
        let normalCards = cards.filter(c => c.rank !== 'A' && !c.isJoker);
        let aCards = cards.filter(c => c.rank === 'A');
        let jokers = cards.filter(c => c.isJoker);

        if (jokers.length > 0) return { valid: false, error: 'Joker不能作为普通攻击牌打出' };
        if (aCards.length > 1) return { valid: false, error: '一次出牌最多只能包含一张A' };
        
        let validLengths = [1, 3, 5];
        if (!validLengths.includes(normalCards.length)) {
            return { valid: false, error: '合法组合只能是1张, 3张, 或5张（不计入A）' };
        }

        let primarySuit = normalCards[0].suit;
        let isSameSuit = normalCards.every(c => c.suit === primarySuit);
        if (!isSameSuit) return { valid: false, error: '多张牌出牌必须同花色' };

        return { valid: true, primarySuit, normalCards, hasA: aCards.length === 1 };
    }

    /**
     * 打出梅花护盾（对自己使用，不攻击他人）
     * @param {Player} player 出牌玩家
     * @param {Array<Card>} cards 打出的卡牌组合
     * @param {Number} aValue 如果有A，玩家指定的转化数值
     */
    playShield(player, cards, aValue = 0) {
        const validation = this.validatePlay(cards);
        if (!validation.valid) throw new Error(validation.error);
        if (validation.primarySuit !== '♣') throw new Error('只有梅花牌才能用于护盾');

        let totalShield = validation.normalCards.reduce((sum, c) => sum + c.value, 0);
        if (validation.hasA) {
            totalShield += aValue;
        }

        const activeChar = player.getActiveCharacter();
        activeChar.shield += totalShield;

        this._postPlayCleanup(player, player, cards);
    }

    /**
     * 执行攻击出牌
     * @param {Player} attacker 出牌玩家
     * @param {Player} target 目标玩家
     * @param {Array<Card>} cards 打出的卡牌组合
     * @param {Number} aValue 如果有A，玩家指定的转化数值
     */
    playAttack(attacker, target, cards, aValue = 0) {
        const validation = this.validatePlay(cards);
        if (!validation.valid) throw new Error(validation.error);

        // 1. 计算初始伤害与花色
        let totalDamage = validation.normalCards.reduce((sum, c) => sum + c.value, 0);
        if (validation.hasA) {
            totalDamage += aValue; // 计入万化的A的值
        }
        
        const attackSuit = validation.primarySuit;
        const targetChar = target.getActiveCharacter();
        const attackerChar = attacker.getActiveCharacter();
        const isImmune = (attackSuit === targetChar.suit); // 角色花色免疫判断

        let finalDamage = totalDamage;

        // 2. 结算前置效果 (♠黑桃)
        if (attackSuit === '♠') {
            if (!isImmune) {
                finalDamage *= 2; // 黑桃双倍伤害，同色则取消双倍
            }
        }

        // 3. 执行伤害 (♣梅花免疫判定)
        let ignoreShield = (attackSuit === '♣' && isImmune);
        let actualDamageDealt = targetChar.takeDamage(finalDamage, ignoreShield);

        // 4. 结算后置效果
        if (attackSuit === '♦' && !isImmune) {
            let drawCount = 0;
            let currentIdx = this.players.indexOf(attacker);
            let aliveCount = this.players.filter(p => !p.isEliminated).length;
            let passes = 0;
            while (drawCount < 5 && passes < aliveCount) {
                let p = this.players[currentIdx];
                if (!p.isEliminated && p.hand.length < MAX_HAND_SIZE) {
                    this.drawCards(p, 1);
                    drawCount++;
                    passes = 0;
                } else {
                    passes++;
                }
                currentIdx = (currentIdx + 1) % this.numPlayers;
            }
        } else if (attackSuit === '♥' && !isImmune) {
            attackerChar.hp = Math.min(attackerChar.maxHp, attackerChar.hp + actualDamageDealt);
        }

        // 5. 结算弃牌与后续清理
        this._postPlayCleanup(attacker, target, cards);
    }

    /**
     * 打出Joker (特殊机制)
     */
    playJoker(player, targetPlayer, charIndex, jokerCards) {
        if (jokerCards.some(c => !c.isJoker)) throw new Error('只能打出Joker');
        
        const targetChar = targetPlayer.characters[charIndex];

        if (jokerCards.length === 1) {
            // 复活濒死(死亡)角色
            if (!targetChar.isDead) throw new Error('单张Joker只能用于复活死亡角色');
            targetChar.revive();
        } else if (jokerCards.length === 2) {
            // 斩杀
            // 检查玩家是否拥有场上所有的Joker (至少手里这2张，并且全场总共只能有2*副数张)
            // 实际逻辑中 UI 需校验该玩家是否达成"拥有场上全部Joker"的隐藏条件
            if (targetChar.isDead) throw new Error('目标已经死亡');
            targetChar.execute();
        } else {
            throw new Error('Joker只能打出1张或2张');
        }

        this._postPlayCleanup(player, targetPlayer, jokerCards);
    }

    // 回合结束清理与补牌判断
    _postPlayCleanup(attacker, target, cardsPlayed) {
        // 移出手牌并加入弃牌堆
        attacker.removeCardsFromHand(cardsPlayed);
        this.discardPile.push(...cardsPlayed);

        // 检查死亡与淘汰
        target.checkElimination();
        
        this.checkWinCondition();
        if (this.isGameOver) return;

        // 补牌规则：手牌打空 或 全是Joker -> 补3张
        if (attacker.needsReplenish()) {
            this.drawCards(attacker, 3);
        }
    }

    // 推进到下一个回合 (逆时针/索引递增)
    nextTurn() {
        if (this.isGameOver) return;
        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.numPlayers;
        } while (this.players[this.currentPlayerIndex].isEliminated);
    }

    checkWinCondition() {
        const alivePlayers = this.players.filter(p => !p.isEliminated);
        if (alivePlayers.length === 1) {
            this.isGameOver = true;
            this.winner = alivePlayers[0];
            console.log(`游戏结束! 玩家 ${this.winner.id} 获胜!`);
        } else if (alivePlayers.length === 0) {
            this.isGameOver = true;
            console.log('平局！所有玩家均已淘汰。');
        }
    }
}

// 供外部模块引入
// export { GameEngine, Card, Character, Player };