/**
 * GameEngine — 主游戏逻辑引擎
 * 导入 Card, Character, Player 实体 及 validatePlay
 */

import { Card } from './Card.js';
import { Character } from './Character.js';
import { Player } from './Player.js';
import { validatePlay, validateAceSuit } from './GameValidator.js';

const SUITS = ['♦', '♣', '♥', '♠'];
const NORMAL_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10'];
const MAX_HAND_SIZE = 7;

export class GameEngine {
    constructor(numPlayers) {
        this.numPlayers = numPlayers;
        this.players = [];
        this.deck = [];
        this.discardPile = [];
        this.currentPlayerIndex = 0;
        this.isGameOver = false;
        this.winner = null;
        // ★ Bug3+4: 阶段状态机
        this.phase = 'SELECTING_STARTER';  // SELECTING_STARTER | PLAYING | WAITING_FOR_JOKER | GAME_OVER
        this.dyingInfo = null;             // { playerId, charIndex, timestamp }
        this._initGame();
    }

    _initGame() {
        for (let i = 0; i < this.numPlayers; i++) {
            this.players.push(new Player(i));
        }
        const deckCount = Math.ceil(this.numPlayers / 4);
        this._generateDeck(deckCount);
        this._dealCharacters();
        this.players.forEach(p => this.drawCards(p, 5));
        // ★ Bug4: 不设置 activeCharIndex，等所有玩家选将
        this.currentPlayerIndex = Math.floor(Math.random() * this.numPlayers);
    }

    // ★ Bug4: 选将
    selectStarter(playerId, charIndex) {
        if (this.phase !== 'SELECTING_STARTER') return { ok: false, error: '当前不是选将阶段' };
        const player = this.players[playerId];
        if (!player) return { ok: false, error: '无效玩家' };
        if (player.starterSelected) return { ok: false, error: '已选过将' };
        if (player.selectStarter(charIndex)) {
            // 检查是否所有人都选完了
            if (this.players.every(p => p.starterSelected)) {
                this.phase = 'PLAYING';
            }
            return { ok: true, allSelected: this.phase === 'PLAYING' };
        }
        return { ok: false, error: '无效角色索引' };
    }

    // ★ Bug3: Joker 救援
    rescueWithJoker(rescuerId, jokerCardIdx) {
        if (this.phase !== 'WAITING_FOR_JOKER' || !this.dyingInfo) {
            return { ok: false, error: '当前无人濒死' };
        }
        const rescuer = this.players[rescuerId];
        if (!rescuer || rescuer.isEliminated) return { ok: false, error: '无效救援者' };
        const jokerCard = rescuer.hand[jokerCardIdx];
        if (!jokerCard || !jokerCard.isJoker) return { ok: false, error: '请选择 Joker' };

        const target = this.players[this.dyingInfo.playerId];
        const targetChar = target.characters[this.dyingInfo.charIndex];
        if (!targetChar.isDying) return { ok: false, error: '目标已脱离濒死' };

        // 移除 Joker
        rescuer.hand.splice(jokerCardIdx, 1);
        this.discardPile.push(jokerCard);
        // 救援：回复 50% 最大血量
        targetChar.rescue(Math.floor(targetChar.maxHp / 2));

        this.phase = 'PLAYING';
        const rescuedName = target.name || '玩家' + target.id;
        const rescuerName = rescuer.name || '玩家' + rescuer.id;
        this.dyingInfo = null;
        this.lastAction = { type: 'rescue', targetId: target.id, amount: targetChar.hp, rescuerId };
        return { ok: true, rescuedName, rescuerName };
    }

    // ★ Bug3: 濒死超时，真正死亡
    resolveDying() {
        if (this.phase !== 'WAITING_FOR_JOKER' || !this.dyingInfo) return { ok: false };
        const target = this.players[this.dyingInfo.playerId];
        const targetChar = target.characters[this.dyingInfo.charIndex];
        targetChar.die();
        this.phase = 'PLAYING';
        this.dyingInfo = null;
        target.checkElimination();
        this.checkWinCondition();
        return { ok: true, playerId: target.id };
    }

    _generateDeck(deckCount) {
        let deck = [];
        for (let i = 0; i < deckCount; i++) {
            SUITS.forEach(suit => {
                deck.push(new Card(suit, 'A'));
                NORMAL_RANKS.forEach(rank => deck.push(new Card(suit, rank)));
            });
            deck.push(new Card(null, 'Joker', true));
            deck.push(new Card(null, 'Joker', true));
        }
        this.deck = this._shuffle(deck);
    }

    _dealCharacters() {
        const charRanks = ['J', 'Q', 'K'];
        this.players.forEach(p => {
            charRanks.forEach(rank => {
                const randomSuit = SUITS[Math.floor(Math.random() * SUITS.length)];
                p.characters.push(new Character(rank, randomSuit));
            });
            // ★ Bug4: 不设置 activeCharIndex，等玩家选将（Player 构造函数已设为 -1）
        });
    }

    _shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    drawCards(player, count) {
        if (player.isEliminated) return 0;
        let drawn = 0;
        for (let i = 0; i < count; i++) {
            if (player.hand.length >= MAX_HAND_SIZE) break;
            if (this.deck.length === 0) {
                if (this.discardPile.length === 0) break;
                this.deck = this._shuffle([...this.discardPile]);
                this.discardPile = [];
            }
            player.hand.push(this.deck.pop());
            drawn++;
        }
        return drawn;
    }

    /**
     * ♣ 梅花护盾 — 对自己使用
     * @param {Player} player
     * @param {Card[]} cards
     * @param {string} aSuit - Ace 花色选择（仅限 A 自身花色或组合花色）
     */
    playShield(player, cards, aSuit = null) {
        const validation = validatePlay(cards);
        if (!validation.valid) throw new Error(validation.error);

        let isClub = validation.primarySuit === '♣';
        if (!validation.primarySuit && validation.hasA) {
            isClub = (aSuit === '♣');
        }
        if (!isClub) throw new Error('只有梅花牌才能用于护盾');

        // Ace 固定值=1
        let totalShield = validation.normalCards.reduce((sum, c) => sum + c.value, 0);
        if (validation.hasA) totalShield += 1;

        const activeChar = player.getActiveCharacter();
        activeChar.shield += totalShield;
        this.lastAction = { type: 'shield', targetId: player.id, amount: totalShield };
        this._postPlayCleanup(player, player, cards);
    }

    /**
     * 执行攻击出牌
     * Bug Fix: Ace 值固定为 1，花色仅限 A 自身花色或其他牌花色
     */
    playAttack(attacker, target, cards, aSuit = null) {
        const validation = validatePlay(cards);
        if (!validation.valid) throw new Error(validation.error);

        // 伤害 = 普通牌值 + Ace 固定值 1
        let totalDamage = validation.normalCards.reduce((sum, c) => sum + c.value, 0);
        if (validation.hasA) totalDamage += 1;

        // 花色：Ace 优先用 aSuit，否则用普通牌花色。必须校验合法性
        let attackSuit = validation.primarySuit;
        if (validation.hasA) {
            const aceCard = cards.find(c => c.rank === 'A' && !c.isJoker);
            if (aceCard && aSuit) {
                const suitCheck = validateAceSuit(aceCard, validation.primarySuit, aSuit);
                if (!suitCheck.valid) throw new Error(suitCheck.error);
                attackSuit = aSuit;
            } else if (!attackSuit) {
                attackSuit = aceCard?.suit || '♦';
            }
        }
        if (!attackSuit) throw new Error('无法确定攻击花色');

        const targetChar = target.getActiveCharacter();
        const attackerChar = attacker.getActiveCharacter();
        const isImmune = (attackSuit === targetChar.suit);
        let finalDamage = totalDamage;

        // ♠ 黑桃双倍
        if (attackSuit === '♠' && !isImmune) {
            finalDamage *= 2;
        }

        // ♣ 免疫穿透护盾
        const ignoreShield = (attackSuit === '♣' && isImmune);
        const actualDamageDealt = targetChar.takeDamage(finalDamage, ignoreShield);

        // ★ Bug3: 濒死检测 — hp=0 但未死
        if (targetChar.isDying) {
            this.phase = 'WAITING_FOR_JOKER';
            this.dyingInfo = {
                playerId: target.id,
                charIndex: target.activeCharIndex,
                timestamp: Date.now(),
            };
        }

        // ♦ 方块：五谷丰登 — 摸牌总数 = 最终伤害值
        if (attackSuit === '♦' && !isImmune) {
            let remaining = finalDamage;
            const alivePlayers = this.players.filter(p => !p.isEliminated);
            if (alivePlayers.length === 0) { /* no one to draw */ }
            else {
                // 从攻击者开始，按回合顺序循环
                const startIdx = this.players.indexOf(attacker);
                let idx = startIdx;
                let loops = 0;
                const maxLoops = alivePlayers.length * 3; // 安全上限
                while (remaining > 0 && loops < maxLoops) {
                    loops++;
                    const p = this.players[idx];
                    if (!p.isEliminated && p.hand.length < MAX_HAND_SIZE) {
                        this.drawCards(p, 1);
                        remaining--;
                    }
                    // 全场手牌都满了 → 终止
                    if (alivePlayers.every(ap => ap.hand.length >= MAX_HAND_SIZE)) break;
                    idx = (idx + 1) % this.numPlayers;
                }
            }
        }
        // ♥ 红桃吸血
        else if (attackSuit === '♥' && !isImmune) {
            attackerChar.hp = Math.min(attackerChar.maxHp, attackerChar.hp + actualDamageDealt);
        }

        this.lastAction = { type: 'damage', targetId: target.id, amount: actualDamageDealt, suit: attackSuit };
        this._postPlayCleanup(attacker, target, cards);
    }

    playJoker(player, targetPlayer, charIndex, jokerCards) {
        if (jokerCards.some(c => !c.isJoker)) throw new Error('只能打出Joker');
        const targetChar = targetPlayer.characters[charIndex];

        if (jokerCards.length === 1) {
            if (!targetChar.isDead) throw new Error('单张Joker只能用于复活死亡角色');
            targetChar.revive();
        } else if (jokerCards.length === 2) {
            if (targetChar.isDead) throw new Error('目标已经死亡');
            targetChar.execute();
        } else {
            throw new Error('Joker只能打出1张或2张');
        }
        this._postPlayCleanup(player, targetPlayer, jokerCards);
    }

    _postPlayCleanup(attacker, target, cardsPlayed) {
        attacker.removeCardsFromHand(cardsPlayed);
        this.discardPile.push(...cardsPlayed);
        // ★ Bug3: 濒死时暂停淘汰判定和回合推进
        if (this.phase === 'WAITING_FOR_JOKER') return;
        target.checkElimination();
        this.checkWinCondition();
        if (this.isGameOver) return;
        if (attacker.needsReplenish()) this.drawCards(attacker, 3);
    }

    nextTurn() {
        if (this.isGameOver) return;
        if (this.phase !== 'PLAYING') return; // ★ Bug3/4: 非 PLAYING 阶段不推进
        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.numPlayers;
        } while (this.players[this.currentPlayerIndex].isEliminated);
    }

    checkWinCondition() {
        const alivePlayers = this.players.filter(p => !p.isEliminated);
        if (alivePlayers.length === 1) {
            this.isGameOver = true;
            this.winner = alivePlayers[0];
        } else if (alivePlayers.length === 0) {
            this.isGameOver = true;
        }
    }
}
