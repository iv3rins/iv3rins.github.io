/**
 * game.js — 《扑克战争》boardgame.io 完整状态机
 * 规则：选将→对战→濒死救援。三大摸牌法则 + 万化合体。
 */
const SUITS = ['♦', '♣', '♥', '♠'];
const RANKS = ['2','3','4','5','6','7','8','9','10'];
const MAX_HAND = 7;

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function createDeck(n) {
    const deck = [];
    for (let d = 0; d < n; d++) {
        for (const s of SUITS) {
            deck.push({ suit: s, rank: 'A', value: 1, isJoker: false });
            for (const r of RANKS) {
                deck.push({ suit: s, rank: r, value: ['J','Q','K'].includes(r) ? 10 : +r, isJoker: false });
            }
        }
        deck.push({ suit: null, rank: 'Joker', value: 0, isJoker: true });
        deck.push({ suit: null, rank: 'Joker', value: 0, isJoker: true });
    }
    return shuffle(deck);
}

function createCharacters(lives) {
    const chars = [];
    for (const r of ['J','Q','K']) {
        const s = SUITS[Math.floor(Math.random() * 4)];
        chars.push({ rank: r, suit: s, hp: 10, maxHp: 10, shield: 0, lives, maxLives: lives, isDead: false, isDying: false });
    }
    return chars;
}

function drawCards(G, pid, count) {
    const p = G.players[pid];
    if (!p || p.eliminated) return 0;
    let drawn = 0;
    for (let i = 0; i < count; i++) {
        if (p.hand.length >= MAX_HAND) break;
        if (G.deck.length === 0) {
            if (G.discard.length === 0) break;
            G.deck = shuffle([...G.discard]);
            G.discard = [];
        }
        p.hand.push(G.deck.pop());
        drawn++;
    }
    return drawn;
}

function getActiveChar(p) {
    return p.characters[p.activeCharIdx] || p.characters[0] || null;
}

function cardValue(c) { return ['J','Q','K'].includes(c.rank) ? 10 : c.rank === 'A' ? 1 : (+c.rank); }

function validatePlay(cards, declaredSuit) {
    if (!cards.length) return { valid: false, error: '未选牌' };
    const nonJokers = cards.filter(c => !c.isJoker);
    const aces = nonJokers.filter(c => c.rank === 'A');
    const hasA = aces.length === 1;
    if (nonJokers.length === 0) return { valid: true, primarySuit: null, declaredSuit: null, hasA: false };
    if (!hasA) {
        const s = nonJokers[0].suit;
        if (!nonJokers.every(c => c.suit === s)) return { valid: false, error: '非同花色', primarySuit: s };
        return { valid: true, primarySuit: s, declaredSuit: s, hasA: false };
    }
    // Has A: validate declaredSuit
    const allSuits = [...new Set(nonJokers.map(c => c.suit))];
    if (declaredSuit && !allSuits.includes(declaredSuit)) return { valid: false, error: '浸染花色不合法', primarySuit: null, declaredSuit, hasA: true };
    return { valid: true, primarySuit: null, declaredSuit, hasA: true };
}

// ═══════════════════════════════════
// Game Definition
// ═══════════════════════════════════

export const PokeWar = {
    name: 'poke-war',
    minPlayers: 2,
    maxPlayers: 4,

    setup: ({ ctx, random }) => {
        const deckCount = Math.ceil(ctx.numPlayers / 4);
        const deck = createDeck(deckCount);
        const players = {};
        for (let i = 0; i < ctx.numPlayers; i++) {
            players[i] = {
                name: `玩家${i + 1}`,
                characters: createCharacters(3),
                hand: [],
                activeCharIdx: -1,
                starterSelected: false,
                eliminated: false,
                avatar: '🐱',
            };
        }
        // 初始发牌
        for (let i = 0; i < ctx.numPlayers; i++) {
            for (let j = 0; j < 5; j++) {
                if (deck.length) players[i].hand.push(deck.pop());
            }
        }
        return {
            players, deck, discard: [],
            currentPlayer: '0', phase: 'SELECTING_STARTER',
            turn: 1, dyingInfo: null, lastAction: null,
        };
    },

    phases: {
        SELECTING_STARTER: {
            start: true,
            next: 'PLAYING',
            allowedMoves: ['selectStarter'],
            onBegin: (G) => { G.phase = 'SELECTING_STARTER'; },
            endIf: (G) => {
                if (Object.values(G.players).every(p => p.starterSelected)) return { next: 'PLAYING' };
            },
        },
        PLAYING: {
            allowedMoves: ['playCards', 'useJoker', 'rescueWithJoker'],
            onBegin: (G) => { G.phase = 'PLAYING'; },
        },
        WAITING_FOR_JOKER: {
            allowedMoves: ['rescueWithJoker'],
            onBegin: (G) => { G.phase = 'WAITING_FOR_JOKER'; },
        },
    },

    turn: {
        order: { first: () => 0, next: (G, ctx) => (+ctx.currentPlayer + 1) % ctx.numPlayers },
        onBegin: (G, ctx) => { G.currentPlayer = String(ctx.currentPlayer); G.turn++; },
        onEnd: (G) => { /* 回合结束后不摸牌 */ },
    },

    moves: {
        selectStarter: (G, ctx, charIdx) => {
            const p = G.players[ctx.currentPlayer];
            if (!p || p.starterSelected) return;
            if (charIdx < 0 || charIdx >= p.characters.length) return;
            p.activeCharIdx = charIdx;
            p.starterSelected = true;
            G.lastAction = { type: 'starter', playerId: ctx.currentPlayer };
        },

        playCards: (G, ctx, cardIndices, targetPlayerId, declaredSuit, aValue) => {
            const pid = String(ctx.currentPlayer);
            const attacker = G.players[pid];
            if (!attacker || G.phase !== 'PLAYING') return;
            const sorted = [...cardIndices].sort((a, b) => b - a);
            const cards = sorted.map(i => attacker.hand[i]).filter(Boolean);
            if (!cards.length) return;

            const v = validatePlay(cards, declaredSuit);
            if (!v.valid) return;

            const total = cards.reduce((s, c) => s + (c.isJoker ? 0 : cardValue(c)), 0) + (v.hasA ? (aValue || 1) : 0);
            const suit = v.declaredSuit;
            const hasA = v.hasA;
            const isPureJoker = cards.every(c => c.isJoker);

            if (isPureJoker) {
                const target = G.players[targetPlayerId];
                if (!target) return;
                const tc = getActiveChar(target);
                if (!tc) return;
                if (cards.length === 1 && tc.isDead) {
                    tc.isDead = false; tc.hp = Math.floor(tc.maxHp / 2);
                } else if (cards.length === 2 && !tc.isDead) {
                    tc.isDead = true; tc.hp = 0;
                }
                attacker.hand = attacker.hand.filter((_, i) => !cardIndices.includes(i));
                G.discard.push(...cards);
                G.lastAction = { type: 'joker', playerId: pid, targetId: targetPlayerId };
                replenishHand(G, pid);
                return;
            }

            const isShield = suit === '♣';
            const target = G.players[targetPlayerId];
            if (!isShield && !target) return;

            if (isShield) {
                const ac = getActiveChar(attacker);
                if (!ac) return;
                ac.shield = (ac.shield || 0) + total;
                G.lastAction = { type: 'shield', playerId: pid, amount: total };
            } else {
                const tc = getActiveChar(target);
                const ac = getActiveChar(attacker);
                if (!tc || !ac) return;

                const immune = (suit === tc.suit) && !hasA;
                let dmg = total;
                if (suit === '♠' && !immune) dmg *= 2;
                const ignoreShield = (ac.suit === '♣') || (suit === '♣' && immune);

                let actualDmg = dmg;
                if (!ignoreShield && tc.shield > 0) {
                    const blocked = Math.min(tc.shield, dmg);
                    tc.shield -= blocked;
                    actualDmg = dmg - blocked;
                }
                if (actualDmg > 0) {
                    tc.hp -= actualDmg;
                    if (tc.hp <= 0) {
                        tc.hp = 0;
                        if (tc.lives > 0) {
                            tc.lives--;
                            tc.hp = tc.maxHp;
                            tc.shield = 0;
                        } else {
                            tc.isDying = true;
                            G.phase = 'WAITING_FOR_JOKER';
                            G.dyingInfo = { playerId: String(targetPlayerId), charIdx: target.activeCharIdx, attackerId: pid };
                        }
                    }
                }
                // ♦ draw
                if (suit === '♦' && !immune) {
                    let rem = dmg;
                    const alive = Object.entries(G.players).filter(([, p]) => !p.eliminated);
                    let idx = +pid, loops = 0;
                    while (rem > 0 && loops < alive.length * 3) {
                        loops++;
                        const [i, p] = alive[idx % alive.length];
                        if (!p.eliminated && p.hand.length < MAX_HAND) { drawCards(G, +i, 1); rem--; }
                        idx++;
                    }
                }
                // ♥ heal
                if (suit === '♥' && !immune) {
                    ac.hp = Math.min(ac.maxHp, ac.hp + (actualDmg > 0 ? actualDmg : 0));
                }
                G.lastAction = { type: 'attack', playerId: pid, targetId: String(targetPlayerId), amount: dmg, suit };
            }

            attacker.hand = attacker.hand.filter((_, i) => !cardIndices.includes(i));
            G.discard.push(...cards);
            replenishHand(G, pid);
        },

        useJoker: (G, ctx, cardIndices, targetId) => {
            // 委托给 playCards 的 Joker 逻辑
            G.phase = 'PLAYING';
            // (实际可复用 playCards 中的 Joker 分支)
        },

        rescueWithJoker: (G, ctx, jokerCardIdx) => {
            if (G.phase !== 'WAITING_FOR_JOKER' || !G.dyingInfo) return;
            const rescuer = G.players[ctx.currentPlayer];
            if (!rescuer) return;
            const card = rescuer.hand[jokerCardIdx];
            if (!card || !card.isJoker) return;
            rescuer.hand.splice(jokerCardIdx, 1);
            G.discard.push(card);

            const target = G.players[G.dyingInfo.playerId];
            const tc = target.characters[G.dyingInfo.charIdx];
            tc.isDying = false;
            tc.hp = Math.floor(tc.maxHp / 2);
            G.phase = 'PLAYING';
            G.dyingInfo = null;
            G.lastAction = { type: 'rescue', playerId: String(ctx.currentPlayer), targetId: G.dyingInfo.playerId };
            replenishHand(G, String(ctx.currentPlayer));
        },
    },

    endIf: (G) => {
        const alive = Object.entries(G.players).filter(([, p]) => !p.eliminated);
        if (alive.length <= 1) return { winner: alive[0]?.[0] || 'draw' };
    },
};

// 法则二：空手牌 / 全Joker → 补3张
function replenishHand(G, pid) {
    const p = G.players[pid];
    if (!p || p.eliminated) return;
    const hasOnlyJokers = p.hand.length > 0 && p.hand.every(c => c.isJoker);
    if (p.hand.length === 0 || hasOnlyJokers) {
        drawCards(G, pid, 3);
    }
}
