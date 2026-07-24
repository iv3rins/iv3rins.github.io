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
const MAX_HAND_SIZE = 7; // ★ 手牌上限已设定为 7

export class GameEngine {
    constructor(numPlayers, maxLives = 3) {
        this.numPlayers = numPlayers;
        this.maxLives = maxLives;
        this.players = [];
        this.deck = [];
        this.discardPile = [];
        this.currentPlayerIndex = 0;
        this.isGameOver = false;
        this.winner = null;
        
        // 阶段状态机
        this.phase = 'SELECTING_STARTER';  // SELECTING_STARTER | PLAYING | WAITING_FOR_JOKER | GAME_OVER
        this.dyingInfo = null;             // { playerId, charIndex, timestamp }
        this._disconnectTimers = {};       // playerId → setTimeout (30s 断线死亡)
        
        this._initGame();
    }

    /** 玩家断线：30 秒内未重连则淘汰 */
    startDisconnectTimer(playerId) {
        if (this._disconnectTimers[playerId]) return;
        const player = this.players[playerId];
        if (!player || player.isEliminated) return;
        
        player._disconnected = true;
        console.log('[Engine] 玩家断线 — player:', playerId, '30s倒计时');
        
        this._disconnectTimers[playerId] = setTimeout(() => {
            console.log('[Engine] 断线超时，淘汰玩家 — player:', playerId);
            this.killPlayer(playerId);
            delete this._disconnectTimers[playerId];
        }, 30000);
    }

    /** 玩家重连：清除死亡倒计时 */
    cancelDisconnectTimer(playerId) {
        if (this._disconnectTimers[playerId]) {
            clearTimeout(this._disconnectTimers[playerId]);
            delete this._disconnectTimers[playerId];
        }
        const player = this.players[playerId];
        if (player) player._disconnected = false;
        console.log('[Engine] 玩家重连 — player:', playerId);
    }

    /** 强制淘汰玩家 */
    killPlayer(playerId) {
        const player = this.players[playerId];
        if (!player || player.isEliminated) return;
        player.characters.forEach(c => { c.hp = 0; c.isDead = true; c.isDying = false; });
        player.isEliminated = true;
        this.checkWinCondition();
    }

    _initGame() {
        for (let i = 0; i < this.numPlayers; i++) {
            this.players.push(new Player(i));
        }
        const deckCount = Math.ceil(this.numPlayers / 4);
        this._generateDeck(deckCount);
        this._dealCharacters();
        // 初始发5张牌（打牌过程最高可补到7张）
        this.players.forEach(p => this.drawCards(p, 5));
        
        this.currentPlayerIndex = Math.floor(Math.random() * this.numPlayers);
    }

    // 选将
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

    // Joker 救援
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

        // 移除 Joker 并触发救援
        rescuer.hand.splice(jokerCardIdx, 1);
        this.discardPile.push(jokerCard);
        
        targetChar.rescue(Math.floor(targetChar.maxHp / 2));

        this.phase = 'PLAYING';
        const rescuedName = target.name || '玩家' + target.id;
        const rescuerName = rescuer.name || '玩家' + rescuer.id;
        this.dyingInfo = null;
        this.lastAction = { type: 'rescue', targetId: target.id, amount: targetChar.hp, rescuerId };
        
        return { ok: true, rescuedName, rescuerName };
    }

    // 濒死超时，真正判定死亡
    resolveDying() {
        if (this.phase !== 'WAITING_FOR_JOKER' || !this.dyingInfo) return { ok: false };
        const target = this.players[this.dyingInfo.playerId];
        const targetChar = target.characters[this.dyingInfo.charIndex];
        const killerId = this.dyingInfo.attackerId;
        
        targetChar.die();
        this.phase = 'PLAYING';
        this.dyingInfo = null;
        
        // ★ 规则3 — 角色阵亡：清空手牌
        while (target.hand.length > 0) {
            this.discardPile.push(target.hand.pop());
        }
        target.checkElimination();
        
        // ★ 死者如有新角色上场，摸 5 张初始牌
        if (!target.isEliminated) {
            this.drawCards(target, 5);
        }
        
        // ★ 击杀奖励：凶手摸 3 张
        if (killerId !== undefined && killerId !== null) {
            const killer = this.players[killerId];
            if (killer && !killer.isEliminated) {
                this.drawCards(killer, 3);
            }
        }
        
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
                p.characters.push(new Character(rank, randomSuit, this.maxLives));
            });
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
     */
    playShield(player, cards, declaredSuit = null, aValue = null) {
        const validation = validatePlay(cards, declaredSuit);
        if (!validation.valid) throw new Error(validation.error);

        const isShield = (declaredSuit === '♣') || (!validation.hasA && validation.primarySuit === '♣');
        if (!isShield) throw new Error('只有梅花牌才能用于护盾');

        let totalShield = validation.normalCards.reduce((sum, c) => {
            const v = Number(c.value) || 0;
            return sum + v;
        }, 0);
        
        if (validation.hasA) totalShield += (Number(aValue) || 1);
        totalShield = Math.max(0, Math.floor(totalShield));

        const activeChar = player.getActiveCharacter();
        if (!activeChar) throw new Error('[Engine] playShield: activeChar 为空');
        
        activeChar.shield = (Number(activeChar.shield) || 0) + totalShield;

        console.log('[Engine] playShield — player:', player.name, 'addShield:', totalShield, 'totalShield:', activeChar.shield);
        this.lastAction = { type: 'shield', targetId: player.id, amount: totalShield };
        this._postPlayCleanup(player, player, cards);
    }

    /**
     * 执行攻击出牌
     * @param {boolean} hasA — 是否含万化牌A（A特权：无视花色免疫）
     */
    playAttack(attacker, target, cards, declaredSuit = null, aValue = null, hasA = false) {
        const validation = validatePlay(cards, declaredSuit);
        if (!validation.valid) throw new Error(validation.error);

        let totalDamage = validation.normalCards.reduce((sum, c) => sum + (Number(c.value)||0), 0);
        if (validation.hasA) totalDamage += (Number(aValue) || 1);
        totalDamage = Math.max(0, Math.floor(totalDamage));

        const attackSuit = validation.declaredSuit;
        if (!attackSuit) throw new Error('无法确定攻击花色');

        const targetChar = target.getActiveCharacter();
        const attackerChar = attacker.getActiveCharacter();
        const targetImmune = (attackSuit === targetChar.suit);
        // ★ [Wanhua特权]：hasA 时无视花色免疫
        const immuneBlocks = targetImmune && !hasA;

        let finalDamage = totalDamage;

        // ♠ 黑桃双倍（免疫时无效，除非有A）
        if (attackSuit === '♠' && !immuneBlocks) {
            finalDamage *= 2;
        }

        // ♣ 穿透护盾：攻击者角色是♣ 或 (攻击花色是♣且目标免疫时)
        const ignoreShield = (attackerChar.suit === '♣') || (attackSuit === '♣' && targetImmune);

        const result = targetChar.takeDamage(finalDamage, ignoreShield);
        const hpDamage = result.hpDamage;

        // 濒死检测
        if (targetChar.isDying) {
            this.phase = 'WAITING_FOR_JOKER';
            this.dyingInfo = { playerId: target.id, charIndex: target.activeCharIndex, timestamp: Date.now(), attackerId: attacker.id };
        }

        // ♦ 方块：五谷丰登（免疫时无效，除非有A）
        if (attackSuit === '♦' && !immuneBlocks) {
            let remaining = finalDamage;
            const alivePlayers = this.players.filter(p => !p.isEliminated);
            if (alivePlayers.length > 0) {
                const startIdx = this.players.indexOf(attacker);
                let idx = startIdx, loops = 0;
                while (remaining > 0 && loops < alivePlayers.length * 3) {
                    loops++;
                    const p = this.players[idx];
                    // ★ 已打出但未扣除的牌不计入手牌上限
                    const effectiveCount = p.hand.length - (p.id === attacker.id ? cards.length : 0);
                    if (!p.isEliminated && effectiveCount < MAX_HAND_SIZE) { this.drawCards(p, 1); remaining--; }
                    if (alivePlayers.every(ap => (ap.hand.length - (ap.id === attacker.id ? cards.length : 0)) >= MAX_HAND_SIZE)) break;
                    idx = (idx + 1) % this.numPlayers;
                }
            }
        }

        // ♥ 红桃吸血：回复实际削血值（免疫时无效，除非有A）
        if (attackSuit === '♥' && !immuneBlocks) {
            attackerChar.hp = Math.min(attackerChar.maxHp, attackerChar.hp + hpDamage);
        }

        this.lastAction = { type: 'damage', targetId: target.id, amount: finalDamage, suit: attackSuit };
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
        // ★ 防御：游戏未开始时不执行清理（防止初始化时序污染）
        if (this.phase === 'SELECTING_STARTER') return;
        attacker.removeCardsFromHand(cardsPlayed);
        this.discardPile.push(...cardsPlayed);
        
        if (this.phase === 'WAITING_FOR_JOKER') return;
        
        target.checkElimination();
        this.checkWinCondition();

        // ★ 规则2 — 空城补给：手里没牌 或 只剩Joker → 摸3张
        const normals = attacker.hand.filter(c => !c.isJoker);
        if (attacker.hand.length === 0 || normals.length === 0) {
            this.drawCards(attacker, 3);
        }
    }

    nextTurn() {
        if (this.isGameOver || this.phase !== 'PLAYING') return;
        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.numPlayers;
        } while (this.players[this.currentPlayerIndex].isEliminated);
        // ★ 不在此摸牌 — 卡牌补给仅通过 ♦攻击 / 空城补给 / 角色阵亡奖励触发
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