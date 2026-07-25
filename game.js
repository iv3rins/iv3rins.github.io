/**
 * game.js — 《扑克战争》boardgame.io 完整状态机 v3.0
 *
 * 架构：纯 Model 层。不包含任何 DOM 操作。
 * 规则来源：白皮书 + RULES.md（最高指导原则）
 *
 * 三大摸牌法则：
 *   法则一 (♦方块)：打出方块时全场轮序摸牌
 *   法则二 (空城补给)：出牌后手牌为空或仅剩 Joker → 补 3 张
 *   法则三 (阵亡换将)：角色死亡 → 清空手牌 → 换将摸 5 张 → 击杀者摸 3 张
 */

const SUITS = ['♦', '♣', '♥', '♠'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10'];
const MAX_HAND = 7;
const INITIAL_HAND = 5;
const DYING_TIMEOUT_SEC = 10;

/* ── 工具函数 ── */

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 创建牌堆：每 4 人一副 (40 普通 + 2 Joker) */
function createDeck(n) {
  const deck = [];
  for (let d = 0; d < n; d++) {
    for (const s of SUITS) {
      // A 值 1
      deck.push({ suit: s, rank: 'A', value: 1, isJoker: false });
      for (const r of RANKS) {
        const v = ['J', 'Q', 'K'].includes(r) ? 10 : +r;
        deck.push({ suit: s, rank: r, value: v, isJoker: false });
      }
    }
    // 2 Jokers
    deck.push({ suit: null, rank: 'Joker', value: 0, isJoker: true });
    deck.push({ suit: null, rank: 'Joker', value: 0, isJoker: true });
  }
  return shuffle(deck);
}

/** 创建 3 个角色 (J/Q/K)，随机花色，HP=10 */
function createCharacters() {
  const chars = [];
  for (const r of ['J', 'Q', 'K']) {
    const s = SUITS[Math.floor(Math.random() * 4)];
    chars.push({ rank: r, suit: s, hp: 10, maxHp: 10, shield: 0, isDead: false, isDying: false });
  }
  return chars;
}

/** 摸牌：最多到 MAX_HAND */
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

/** 获取当前活跃角色 */
function getActiveChar(p) {
  if (!p || !p.characters) return null;
  const idx = p.activeCharIdx;
  if (idx >= 0 && idx < p.characters.length) return p.characters[idx];
  return null;
}

/** 获取存活角色数量 */
function aliveCharCount(p) {
  if (!p || !p.characters) return 0;
  return p.characters.filter(c => !c.isDead).length;
}

/** 找到下一个未死亡的角色索引 */
function nextAliveCharIdx(p) {
  if (!p || !p.characters) return -1;
  for (let i = 0; i < p.characters.length; i++) {
    if (!p.characters[i].isDead) return i;
  }
  return -1;
}

/** 获取存活玩家列表 (未淘汰) */
function alivePlayers(G) {
  return Object.entries(G.players)
    .filter(([, p]) => !p.eliminated)
    .map(([id]) => +id);
}

/** 手牌为空或仅剩 Joker */
function needReplenish(p) {
  if (!p || p.eliminated) return false;
  if (p.hand.length === 0) return true;
  return p.hand.length > 0 && p.hand.every(c => c.isJoker);
}

/* ── 出牌校验 ── */

function validatePlay(cards, declaredSuit) {
  if (!cards.length) return { valid: false, error: '未选牌' };
  const nonJokers = cards.filter(c => !c.isJoker);
  const aces = nonJokers.filter(c => c.rank === 'A');
  const hasA = aces.length === 1;

  // 纯 Joker 不经过此校验
  if (nonJokers.length === 0) return { valid: true, primarySuit: null, declaredSuit: null, hasA: false };

  // 含 A：不强制同花色，但 declaredSuit 必须在组合中出现过
  if (hasA) {
    const allSuits = [...new Set(nonJokers.map(c => c.suit))];
    if (declaredSuit && !allSuits.includes(declaredSuit))
      return { valid: false, error: `浸染花色不合法: ${declaredSuit}`, primarySuit: null, declaredSuit, hasA: true };
    return { valid: true, primarySuit: null, declaredSuit: declaredSuit || allSuits[0], hasA: true };
  }

  // 无 A：必须同花色
  const s = nonJokers[0].suit;
  if (!nonJokers.every(c => c.suit === s))
    return { valid: false, error: '非同花色', primarySuit: s };
  return { valid: true, primarySuit: s, declaredSuit: s, hasA: false };
}

/* ══════════════════════════════════════════════════════
   game.js — boardgame.io Game Definition
   ══════════════════════════════════════════════════════ */

export const PokeWar = {
  name: 'poke-war',
  minPlayers: 2,
  maxPlayers: 4,

  /* ── 初始化 ── */
  setup: ({ ctx }) => {
    const deckCount = Math.ceil(ctx.numPlayers / 4);
    const deck = createDeck(deckCount);
    const players = {};
    for (let i = 0; i < ctx.numPlayers; i++) {
      players[i] = {
        name: `玩家${i + 1}`,
        characters: createCharacters(),
        hand: [],
        activeCharIdx: 0,       // 首发角色索引 (selectStarter 确认)
        starterSelected: false,
        eliminated: false,
        aliveChars: 3,           // 存活角色计数
      };
    }
    // 初始发牌
    for (let i = 0; i < ctx.numPlayers; i++) {
      drawCards({ players, deck, discard: [] }, i, INITIAL_HAND);
    }
    return {
      players,
      deck,
      discard: [],
      phase: 'SELECTING_STARTER',
      turn: 1,
      dyingInfo: null,        // { playerId, charIdx, attackerId, startedAt }
      lastAction: null,
    };
  },

  /* ── 阶段 ── */
  phases: {
    SELECTING_STARTER: {
      start: true,
      next: 'PLAYING',
      allowedMoves: ['selectStarter'],
      onBegin: (G) => { G.phase = 'SELECTING_STARTER'; },
      endIf: (G) => {
        const allReady = Object.values(G.players).every(p => p.starterSelected || p.eliminated);
        if (allReady) return { next: 'PLAYING' };
      },
    },
    PLAYING: {
      allowedMoves: ['playCards', 'rescueWithJoker'],
      onBegin: (G) => { G.phase = 'PLAYING'; G.dyingInfo = null; },
      endIf: (G) => {
        // 有濒死 → 切换到等待救援阶段
        if (G.dyingInfo) return { next: 'WAITING_FOR_JOKER' };
      },
    },
    WAITING_FOR_JOKER: {
      allowedMoves: ['rescueWithJoker'],
      onBegin: (G) => {
        G.phase = 'WAITING_FOR_JOKER';
        if (!G.dyingInfo) G.dyingInfo = { startedAt: Date.now() };
        else G.dyingInfo.startedAt = Date.now();
      },
      endIf: (G) => {
        // 救援成功 → 回到 PLAYING
        if (!G.dyingInfo) return { next: 'PLAYING' };
        // 超时死亡
        if (Date.now() - G.dyingInfo.startedAt > DYING_TIMEOUT_SEC * 1000) {
          return { next: 'PLAYING' }; // handleDyingTimeout 在 onEnd 处理
        }
      },
      onEnd: (G) => {
        // 如果濒死信息还在 = 超时未救
        if (G.dyingInfo) {
          handleDyingTimeout(G);
        }
      },
    },
  },

  /* ── 回合 ── */
  turn: {
    order: {
      first: () => 0,
      next: (G, ctx) => (ctx.currentPlayer + 1) % ctx.numPlayers,
    },
    onBegin: (G, ctx) => {
      G.currentPlayer = String(ctx.currentPlayer);
      G.turn++;
      // ★ 绝不自动摸牌！
    },
    // onEnd: 不做任何事 — 不自动摸牌
  },

  /* ── Moves ── */
  moves: {
    /**
     * selectStarter — 选将
     * charIdx: 0/1/2 对应 J/Q/K
     */
    selectStarter: (G, ctx, charIdx) => {
      const pid = String(ctx.currentPlayer);
      const p = G.players[pid];
      if (!p || p.starterSelected || p.eliminated) return;
      if (charIdx < 0 || charIdx >= (p.characters?.length || 0)) return;
      const c = p.characters[charIdx];
      if (c.isDead) return;
      p.activeCharIdx = charIdx;
      p.starterSelected = true;
      G.lastAction = { type: 'starter', playerId: pid, charIdx };
    },

    /**
     * playCards — 出牌 (核心)
     * cardIndices: 手牌索引数组
     * targetPlayerId: 目标玩家 ID (♣ 护盾时可为 null)
     * declaredSuit: A 万化声明的花色
     */
    playCards: (G, ctx, cardIndices, targetPlayerId, declaredSuit) => {
      const pid = String(ctx.currentPlayer);
      const attacker = G.players[pid];
      if (!attacker || attacker.eliminated) return;
      if (G.phase !== 'PLAYING') return;

      // 提取卡牌
      const sorted = [...cardIndices].sort((a, b) => b - a);
      const cards = sorted.map(i => attacker.hand[i]).filter(Boolean);
      if (!cards.length) return;

      // 是否有 Joker
      const jokers = cards.filter(c => c.isJoker);
      const isPureJoker = jokers.length === cards.length;
      const nonJokers = cards.filter(c => !c.isJoker);

      // ── Joker 分支 ──
      if (isPureJoker) {
        const target = G.players[targetPlayerId];
        if (!target) return;
        const tc = getActiveChar(target);
        if (!tc) return;

        if (jokers.length === 1) {
          // 单 Joker：复活已死亡角色
          if (!tc.isDead) return; // 只能复活死亡角色
          tc.isDead = false;
          tc.isDying = false;
          tc.hp = Math.floor(tc.maxHp / 2);
          tc.shield = 0;
          target.aliveChars = (target.aliveChars || 0) + 1;
          G.lastAction = { type: 'jokerRevive', playerId: pid, targetId: String(targetPlayerId) };
        } else if (jokers.length === 2) {
          // 双 Joker：直接斩杀存活角色
          if (tc.isDead) return;
          tc.hp = 0;
          tc.isDead = true;
          tc.isDying = false;
          target.aliveChars = Math.max(0, (target.aliveChars || 0) - 1);
          G.lastAction = { type: 'jokerExecute', playerId: pid, targetId: String(targetPlayerId) };
          handleCharacterDeath(G, targetPlayerId, pid);
        }

        // 移除手牌
        attacker.hand = attacker.hand.filter((_, i) => !cardIndices.includes(i));
        G.discard.push(...cards);

        // 法则二：空城补给
        replenishHand(G, pid);
        return;
      }

      // ── 普通出牌校验 ──
      const v = validatePlay(nonJokers, declaredSuit);
      if (!v.valid) return;

      const suit = v.declaredSuit;

      // ── ♣ 梅花出牌：给自己加护盾 ──
      if (suit === '♣') {
        const ac = getActiveChar(attacker);
        if (!ac) return;
        const total = nonJokers.reduce((s, c) => s + c.value, 0);
        ac.shield = (ac.shield || 0) + total;
        G.lastAction = { type: 'shield', playerId: pid, amount: total };

        attacker.hand = attacker.hand.filter((_, i) => !cardIndices.includes(i));
        G.discard.push(...cards);
        replenishHand(G, pid);
        return;
      }

      // ── 攻击出牌 (♠/♥/♦) ──
      const target = G.players[targetPlayerId];
      if (!target) return;
      const tc = getActiveChar(target);
      const ac = getActiveChar(attacker);
      if (!tc || !ac) return;

      // 计算伤害
      const hasA = v.hasA;
      let totalDamage = nonJokers.reduce((s, c) => s + c.value, 0);

      // 免疫判定：目标花色 = 攻击花色 且 无A浸染 → 免疫
      const immune = (suit === tc.suit) && !hasA;

      // 黑桃双倍
      if (suit === '♠' && !immune) totalDamage *= 2;

      // 护盾结算
      const ignoreShield = (ac.suit === '♣') || (suit === '♣' && immune);
      let actualDmg = totalDamage;
      if (!ignoreShield && (tc.shield || 0) > 0) {
        const blocked = Math.min(tc.shield || 0, totalDamage);
        tc.shield = (tc.shield || 0) - blocked;
        actualDmg = totalDamage - blocked;
      }

      // 扣血
      if (actualDmg > 0) {
        tc.hp -= actualDmg;
      }

      // 红桃吸血
      if (suit === '♥' && !immune) {
        ac.hp = Math.min(ac.maxHp, ac.hp + actualDmg);
      }

      G.lastAction = {
        type: 'attack',
        playerId: pid,
        targetId: String(targetPlayerId),
        amount: totalDamage,
        actualDmg,
        suit,
        immune,
      };

      // 方块摸牌
      if (suit === '♦' && !immune) {
        triggerDiamondDraw(G, pid, totalDamage);
      }

      // 移除手牌
      attacker.hand = attacker.hand.filter((_, i) => !cardIndices.includes(i));
      G.discard.push(...cards);

      // 检查目标是否死亡
      if (tc.hp <= 0) {
        tc.hp = 0;
        handleCharacterDeath(G, targetPlayerId, pid);
      }

      // 法则二：空城补给
      replenishHand(G, pid);
    },

    /**
     * rescueWithJoker — 濒死救援
     * jokerCardIdx: Joker 在手牌中的索引
     */
    rescueWithJoker: (G, ctx, jokerCardIdx) => {
      if (G.phase !== 'WAITING_FOR_JOKER' || !G.dyingInfo) return;
      const pid = String(ctx.currentPlayer);
      const rescuer = G.players[pid];
      if (!rescuer || rescuer.eliminated) return;
      const card = rescuer.hand[jokerCardIdx];
      if (!card || !card.isJoker) return;

      // 移除 Joker
      rescuer.hand.splice(jokerCardIdx, 1);
      G.discard.push(card);

      // 救援目标
      const di = G.dyingInfo;
      const target = G.players[di.playerId];
      if (!target) { G.dyingInfo = null; return; }
      const tc = target.characters[di.charIdx];
      if (!tc) { G.dyingInfo = null; return; }

      tc.isDying = false;
      tc.isDead = false;
      tc.hp = Math.floor(tc.maxHp / 2);
      tc.shield = 0;
      target.aliveChars = (target.aliveChars || 0) + 1;

      G.lastAction = { type: 'rescue', playerId: pid, targetId: di.playerId, charIdx: di.charIdx };
      G.dyingInfo = null;

      // 法则二：空城补给
      replenishHand(G, pid);
    },
  },

  /* ── 游戏结束条件 ── */
  endIf: (G) => {
    const alive = Object.entries(G.players).filter(([, p]) => !p.eliminated);
    if (alive.length <= 1) {
      return { winner: alive[0]?.[0] || 'draw' };
    }
  },
};

/* ══════════════════════════════════════════════════════
   内部结算函数
   ══════════════════════════════════════════════════════ */

/** 处理角色死亡 → 清手牌 → 换将 或 濒死 */
function handleCharacterDeath(G, deadPlayerId, killerId) {
  const deadP = G.players[deadPlayerId];
  if (!deadP || deadP.eliminated) return;

  deadP.aliveChars = Math.max(0, (deadP.aliveChars || 0) - 1);

  // 清空死者所有手牌
  deadP.hand = [];

  // 击杀者摸 3 张
  if (killerId !== undefined && killerId !== null) {
    drawCards(G, killerId, 3);
  }

  // 检查是否还有存活角色
  const nextIdx = nextAliveCharIdx(deadP);
  if (nextIdx >= 0) {
    // 有存活角色 → 换将
    deadP.activeCharIdx = nextIdx;
    // 摸 5 张
    drawCards(G, deadPlayerId, 5);
    G.lastAction = {
      ...G.lastAction,
      switchedChar: true,
      newCharIdx: nextIdx,
    };
  } else {
    // 无存活角色 → 濒死
    const dyingChar = deadP.characters[deadP.activeCharIdx];
    if (dyingChar) {
      dyingChar.isDying = true;
    }
    G.dyingInfo = {
      playerId: String(deadPlayerId),
      charIdx: deadP.activeCharIdx,
      attackerId: String(killerId),
      startedAt: Date.now(),
    };
  }
}

/** 濒死超时 → 玩家淘汰 */
function handleDyingTimeout(G) {
  if (!G.dyingInfo) return;
  const di = G.dyingInfo;
  const deadP = G.players[di.playerId];
  if (deadP) {
    // 标记所有角色死亡
    deadP.characters.forEach(c => { c.isDead = true; c.isDying = false; c.hp = 0; });
    deadP.hand = [];
    deadP.eliminated = true;
  }
  G.lastAction = { type: 'playerDied', playerId: di.playerId };
  G.dyingInfo = null;
}

/** 法则一：♦ 方块五谷丰登 — 全场轮序摸牌 */
function triggerDiamondDraw(G, attackerId, damageAmount) {
  let remaining = damageAmount;
  const alive = alivePlayers(G);
  if (alive.length === 0) return;
  let idx = alive.indexOf(attackerId);
  if (idx < 0) idx = 0;
  let loops = 0;
  const maxLoops = alive.length * 5; // 安全阀
  while (remaining > 0 && loops < maxLoops) {
    loops++;
    const pid = alive[idx % alive.length];
    const p = G.players[pid];
    if (!p.eliminated && p.hand.length < MAX_HAND) {
      drawCards(G, pid, 1);
      remaining--;
    }
    idx++;
  }
}

/** 法则二：空城补给 — 手牌为空或仅剩 Joker → 补 3 张 */
function replenishHand(G, pid) {
  const p = G.players[pid];
  if (!p || p.eliminated) return;
  if (needReplenish(p)) {
    drawCards(G, pid, 3);
  }
}
