/**
 * game.js — 《扑克战争》boardgame.io 完整状态机 v4.0
 *
 * 架构：纯 Model 层。不包含任何 DOM 操作。
 * 规则来源：RULES.md（最高指导原则）+ pokewar-advanced-game-mechanics skill
 *
 * 核心设计原则：
 *   1. UI 层绝不允许直接修改状态 — 必须通过 client.moves.xxx() 派发动作
 *   2. 所有状态变更仅发生在 moves 函数内部
 *   3. 空值保护 (Null Check) 覆盖所有状态读取路径
 *   4. 花色特效：♠双倍 ♥吸血 ♦摸牌 ♣护盾/穿透 — A 万化无视免疫
 *
 * 三大摸牌法则：
 *   法则一 (♦方块)：打出方块时全场轮序摸牌（A 万化无视免疫）
 *   法则二 (空城补给)：出牌后手牌为空或仅剩 Joker → 补 3 张
 *   法则三 (阵亡换将)：角色死亡 → 清空手牌 → 换将摸 5 张 → 击杀者摸 3 张
 *
 * 花色规则速查（来自 pokewar-advanced-game-mechanics §9）：
 *   | 花色 | 攻击效果      | 免疫时   | Wanhua(A)特权 |
 *   | ♠   | 双倍伤害      | 不翻倍   | 必翻倍        |
 *   | ♥   | 吸血(无条件)  | 必吸血   | 必吸血        |
 *   | ♦   | 五谷丰登      | 不摸牌   | 必摸牌        |
 *   | ♣出牌| 给自己加护盾  | —       | —            |
 *   | ♣角色| 攻击穿透护盾  | —       | 无影响        |
 */

const SUITS = ['♦', '♣', '♥', '♠'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10'];
const MAX_HAND = 7;
const INITIAL_HAND = 5;
const DYING_TIMEOUT_SEC = 10;
const DEFAULT_MAX_LIVES = 3;
const DEFAULT_HP = 10;

/* ── 工具函数 ── */

/** Fisher-Yates 洗牌 */
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

/**
 * 创建 3 个角色 (J/Q/K)，随机花色
 * @param {number} maxLives — 命数 (1=快速, 3=常规)
 */
function createCharacters(maxLives) {
  const lives = maxLives || DEFAULT_MAX_LIVES;
  const chars = [];
  for (const r of ['J', 'Q', 'K']) {
    const s = SUITS[Math.floor(Math.random() * 4)];
    chars.push({
      rank: r,
      suit: s,
      hp: DEFAULT_HP,
      maxHp: DEFAULT_HP,
      shield: 0,
      isDead: false,
      isDying: false,
      lives: lives,
      maxLives: lives,
    });
  }
  return chars;
}

/** 摸牌：最多到 MAX_HAND */
function drawCards(G, pid, count) {
  if (!G || !G.players || !G.deck) return 0;
  const p = G.players[pid];
  if (!p || p.eliminated) return 0;
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    if (p.hand.length >= MAX_HAND) break;
    if (!G.deck || G.deck.length === 0) {
      if (!G.discard || G.discard.length === 0) break;
      G.deck = shuffle([...G.discard]);
      G.discard = [];
    }
    if (!G.deck || G.deck.length === 0) break;
    p.hand.push(G.deck.pop());
    drawn++;
  }
  return drawn;
}

/** 获取当前活跃角色（空值保护） */
function getActiveChar(p) {
  if (!p || !p.characters || !Array.isArray(p.characters)) return null;
  const idx = p.activeCharIdx;
  if (typeof idx !== 'number' || idx < 0 || idx >= p.characters.length) return null;
  return p.characters[idx] || null;
}

/** 获取存活角色数量 */
function aliveCharCount(p) {
  if (!p || !p.characters) return 0;
  return p.characters.filter(c => c && !c.isDead).length;
}

/** 找到下一个未死亡的角色索引 */
function nextAliveCharIdx(p) {
  if (!p || !p.characters) return -1;
  for (let i = 0; i < p.characters.length; i++) {
    if (p.characters[i] && !p.characters[i].isDead) return i;
  }
  return -1;
}

/** 获取存活玩家列表 (未淘汰) */
function alivePlayers(G) {
  if (!G || !G.players) return [];
  return Object.entries(G.players)
    .filter(([, p]) => p && !p.eliminated)
    .map(([id]) => +id);
}

/** 手牌为空或仅剩 Joker */
function needReplenish(p) {
  if (!p || p.eliminated || !p.hand) return false;
  if (p.hand.length === 0) return true;
  return p.hand.every(c => c && c.isJoker);
}

/* ── 出牌校验 ── */

/**
 * 校验出牌合法性
 * @param {Array} cards — 选中的卡牌对象数组
 * @param {string|null} declaredSuit — A 万化声明的花色
 * @returns {{ valid: boolean, error?: string, primarySuit?: string, declaredSuit?: string, hasA: boolean, allSuits?: string[] }}
 */
function validatePlay(cards, declaredSuit) {
  if (!cards || !cards.length) return { valid: false, error: '未选牌', hasA: false };

  const nonJokers = cards.filter(c => c && !c.isJoker);
  const aces = nonJokers.filter(c => c && c.rank === 'A');
  const hasA = aces.length === 1;

  // 纯 Joker 不经过此校验（由 moves.playCards 中单独处理）
  if (nonJokers.length === 0) {
    return { valid: true, primarySuit: null, declaredSuit: null, hasA: false };
  }

  // 含 A：不强制同花色，但 declaredSuit 必须在组合中出现过
  if (hasA) {
    const allSuits = [...new Set(nonJokers.filter(c => c).map(c => c.suit))];
    if (declaredSuit && !allSuits.includes(declaredSuit)) {
      return {
        valid: false,
        error: `浸染花色不合法: ${declaredSuit}`,
        primarySuit: null,
        declaredSuit,
        hasA: true,
        allSuits,
      };
    }
    return {
      valid: true,
      primarySuit: null,
      declaredSuit: declaredSuit || allSuits[0],
      hasA: true,
      allSuits,
    };
  }

  // 无 A：必须同花色
  const firstSuit = nonJokers[0].suit;
  const allSame = nonJokers.every(c => c && c.suit === firstSuit);
  if (!allSame) {
    return { valid: false, error: '非同花色', primarySuit: firstSuit, hasA: false };
  }
  return { valid: true, primarySuit: firstSuit, declaredSuit: firstSuit, hasA: false };
}

/* ══════════════════════════════════════════════════════
   boardgame.io Game Definition
   ══════════════════════════════════════════════════════ */

export const PokeWar = {
  name: 'poke-war',
  minPlayers: 2,
  maxPlayers: 12,

  /* ── 初始化 ── */
  setup: ({ ctx }) => {
    if (!ctx || typeof ctx.numPlayers !== 'number') {
      throw new Error('[PokeWar] setup: ctx.numPlayers is required');
    }

    const numPlayers = ctx.numPlayers;
    const deckCount = Math.ceil(numPlayers / 4);
    const deck = createDeck(deckCount);

    // 从 setupData 读取 maxLives（默认 3）
    const maxLives = (ctx.setupData && ctx.setupData.maxLives) || DEFAULT_MAX_LIVES;

    const players = {};
    for (let i = 0; i < numPlayers; i++) {
      players[i] = {
        name: `玩家${i + 1}`,
        avatar: '🐱',
        characters: createCharacters(maxLives),
        hand: [],
        activeCharIdx: 0,
        starterSelected: false,
        eliminated: false,
        aliveChars: maxLives, // 初始存活角色数 = 命数
      };
    }

    // 初始发牌
    for (let i = 0; i < numPlayers; i++) {
      drawCards({ players, deck, discard: [] }, i, INITIAL_HAND);
    }

    return {
      players,
      deck,
      discard: [],
      phase: 'SELECTING_STARTER',
      turn: 1,
      currentPlayer: '0',
      dyingInfo: null, // { playerId, charIdx, attackerId, startedAt }
      lastAction: null,
      battleLog: [],   // ★ 新增：战斗日志数组
      maxLives,        // ★ 新增：记录游戏模式
    };
  },

  /* ── 阶段 ── */
  phases: {
    SELECTING_STARTER: {
      start: true,
      next: 'PLAYING',
      allowedMoves: ['selectStarter'],
      onBegin: (G) => { if (G) G.phase = 'SELECTING_STARTER'; },
      endIf: (G) => {
        if (!G || !G.players) return;
        const allReady = Object.values(G.players).every(
          p => p && (p.starterSelected || p.eliminated)
        );
        if (allReady) return { next: 'PLAYING' };
      },
    },

    PLAYING: {
      allowedMoves: ['playCards', 'rescueWithJoker'],
      onBegin: (G) => {
        if (!G) return;
        G.phase = 'PLAYING';
        G.dyingInfo = null;
      },
      endIf: (G) => {
        if (!G) return;
        if (G.dyingInfo) return { next: 'WAITING_FOR_JOKER' };
      },
    },

    WAITING_FOR_JOKER: {
      allowedMoves: ['rescueWithJoker'],
      onBegin: (G) => {
        if (!G) return;
        G.phase = 'WAITING_FOR_JOKER';
        if (!G.dyingInfo) {
          G.dyingInfo = { startedAt: Date.now() };
        } else {
          G.dyingInfo.startedAt = Date.now();
        }
        // ★ 记录濒死到战斗日志
        if (G.dyingInfo && G.dyingInfo.playerId !== undefined) {
          const deadP = G.players[G.dyingInfo.playerId];
          const deadName = deadP ? deadP.name : `玩家${G.dyingInfo.playerId}`;
          addBattleLog(G, {
            type: 'dying',
            message: `💀 ${deadName} 濒死！持有 Joker 的玩家可在 ${DYING_TIMEOUT_SEC} 秒内救援`,
            timestamp: Date.now(),
          });
        }
      },
      endIf: (G) => {
        if (!G) return;
        if (!G.dyingInfo) return { next: 'PLAYING' };
        if (Date.now() - G.dyingInfo.startedAt > DYING_TIMEOUT_SEC * 1000) {
          return { next: 'PLAYING' };
        }
      },
      onEnd: (G) => {
        if (G && G.dyingInfo) {
          handleDyingTimeout(G);
        }
      },
    },
  },

  /* ── 回合 ── */
  turn: {
    order: {
      first: () => 0,
      /**
       * ★ 修复：明确运算符优先级
       * 获取下一个存活玩家的索引
       */
      next: (G, ctx) => {
        if (!ctx || typeof ctx.currentPlayer !== 'number' || typeof ctx.numPlayers !== 'number') {
          return 0;
        }
        const current = ctx.currentPlayer;
        const total = ctx.numPlayers;
        // 从当前玩家的下一个开始循环，找到第一个未淘汰的
        for (let offset = 1; offset <= total; offset++) {
          const candidate = (current + offset) % total;
          const p = G && G.players ? G.players[candidate] : null;
          if (p && !p.eliminated) return candidate;
        }
        // 全淘汰了（不应该发生）
        return (current + 1) % total;
      },
    },
    onBegin: (G, ctx) => {
      if (!G || !ctx) return;
      G.currentPlayer = String(ctx.currentPlayer);
      G.turn = (G.turn || 0) + 1;
    },
  },

  /* ── Moves ── */
  moves: {
    /**
     * selectStarter — 选将
     * @param {number} charIdx — 0/1/2 对应 J/Q/K
     */
    selectStarter: (G, ctx, charIdx) => {
      if (!G || !ctx) return;
      const pid = String(ctx.currentPlayer);
      const p = G.players[pid];
      if (!p || p.starterSelected || p.eliminated) return;
      if (typeof charIdx !== 'number' || charIdx < 0 || charIdx >= (p.characters ? p.characters.length : 0)) return;

      const c = p.characters[charIdx];
      if (!c || c.isDead) return;

      p.activeCharIdx = charIdx;
      p.starterSelected = true;
      G.lastAction = { type: 'starter', playerId: pid, charIdx };

      addBattleLog(G, {
        type: 'starter',
        message: `⚔️ ${p.name} 选择了首发角色 ${c.suit}${c.rank}`,
        timestamp: Date.now(),
      });
    },

    /**
     * playCards — 出牌 (核心)
     *
     * @param {number[]} cardIndices — 手牌索引数组
     * @param {string|null} targetPlayerId — 目标玩家 ID (♣ 护盾时可为 null)
     * @param {string|null} declaredSuit — A 万化声明的花色
     */
    playCards: (G, ctx, cardIndices, targetPlayerId, declaredSuit) => {
      // ★ 空值保护
      if (!G || !ctx || !G.players) return;

      const pid = String(ctx.currentPlayer);
      const attacker = G.players[pid];
      if (!attacker || attacker.eliminated) return;
      if (G.phase !== 'PLAYING') return;

      // 提取卡牌（从后往前排序避免索引错位）
      const sorted = [...(cardIndices || [])].sort((a, b) => b - a);
      const cards = sorted.map(i => attacker.hand && attacker.hand[i]).filter(Boolean);
      if (!cards.length) return;

      // 分类卡牌
      const jokers = cards.filter(c => c.isJoker);
      const isPureJoker = jokers.length === cards.length;
      const nonJokers = cards.filter(c => !c.isJoker);

      // ── Joker 分支 ──
      if (isPureJoker) {
        const target = G.players[targetPlayerId];
        if (!target || target.eliminated) return;
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

          addBattleLog(G, {
            type: 'jokerRevive',
            message: `🃏 ${attacker.name} 用 Joker 复活了 ${target.name}！`,
            timestamp: Date.now(),
          });
        } else if (jokers.length === 2) {
          // 双 Joker：直接斩杀存活角色
          if (tc.isDead) return;
          tc.hp = 0;
          tc.isDead = true;
          tc.isDying = false;
          target.aliveChars = Math.max(0, (target.aliveChars || 0) - 1);
          G.lastAction = { type: 'jokerExecute', playerId: pid, targetId: String(targetPlayerId) };

          addBattleLog(G, {
            type: 'jokerExecute',
            message: `💀 ${attacker.name} 用双 Joker 斩杀了 ${target.name}！`,
            timestamp: Date.now(),
          });

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

        const total = nonJokers.reduce((s, c) => s + (Number(c.value) || 0), 0);
        ac.shield = (Number(ac.shield) || 0) + total;
        G.lastAction = { type: 'shield', playerId: pid, amount: total };

        addBattleLog(G, {
          type: 'shield',
          message: `🛡️ ${attacker.name} 获得 ${total} 点护盾`,
          timestamp: Date.now(),
        });

        attacker.hand = attacker.hand.filter((_, i) => !cardIndices.includes(i));
        G.discard.push(...cards);
        replenishHand(G, pid);
        return;
      }

      // ── 攻击出牌 (♠/♥/♦) ──
      const target = G.players[targetPlayerId];
      if (!target || target.eliminated) return;
      const tc = getActiveChar(target);
      const ac = getActiveChar(attacker);
      if (!tc || !ac) return;

      // 计算伤害
      const hasA = v.hasA;
      let totalDamage = nonJokers.reduce((s, c) => s + (Number(c.value) || 0), 0);

      // 免疫判定：目标花色 = 攻击花色 且 无A浸染 → 免疫
      const isImmune = (suit === tc.suit) && !hasA;

      // ♠ 黑桃双倍：A 万化必翻倍（无视免疫），非A时免疫则跳过
      if (suit === '♠') {
        if (hasA || !isImmune) {
          totalDamage *= 2;
        }
      }

      // 护盾结算：♣ 角色穿透 或 免疫时不扣护盾
      const ignoreShield = (ac.suit === '♣');
      let actualDmg = totalDamage;
      const currentShield = Number(tc.shield) || 0;
      if (!ignoreShield && !isImmune && currentShield > 0) {
        const blocked = Math.min(currentShield, totalDamage);
        tc.shield = currentShield - blocked;
        actualDmg = totalDamage - blocked;
      }

      // 扣血
      if (actualDmg > 0 && !isImmune) {
        tc.hp = Math.max(0, (Number(tc.hp) || 0) - actualDmg);
      }

      // ★ ♥ 红桃吸血：无条件！（skill §9b）
      //   回复值为 actualDmg（实际削血量，不含护盾吸收部分）
      if (suit === '♥') {
        const healAmount = isImmune ? 0 : actualDmg; // 免疫时无实际伤害，吸血为0
        if (healAmount > 0) {
          ac.hp = Math.min(ac.maxHp, (Number(ac.hp) || 0) + healAmount);
        }
      }

      G.lastAction = {
        type: 'attack',
        playerId: pid,
        targetId: String(targetPlayerId),
        amount: totalDamage,
        actualDmg: isImmune ? 0 : actualDmg,
        suit,
        immune: isImmune,
      };

      // ★ ♦ 方块摸牌：A 万化无视免疫
      if (suit === '♦' && (hasA || !isImmune)) {
        triggerDiamondDraw(G, pid, totalDamage);
      }

      // 战斗日志
      const immuneText = isImmune ? ' [免疫!]' : '';
      addBattleLog(G, {
        type: 'attack',
        message: `⚔️ ${attacker.name} → ${target.name} ${suit} ${totalDamage}点 (实伤${isImmune ? 0 : actualDmg})${immuneText}`,
        timestamp: Date.now(),
      });

      // 移除手牌
      attacker.hand = attacker.hand.filter((_, i) => !cardIndices.includes(i));
      G.discard.push(...cards);

      // 检查目标是否死亡
      if (Number(tc.hp) <= 0) {
        tc.hp = 0;
        handleCharacterDeath(G, targetPlayerId, pid);
      }

      // 法则二：空城补给
      replenishHand(G, pid);
    },

    /**
     * rescueWithJoker — 濒死救援
     * @param {number} jokerCardIdx — Joker 在手牌中的索引
     */
    rescueWithJoker: (G, ctx, jokerCardIdx) => {
      if (!G || !ctx) return;
      if (G.phase !== 'WAITING_FOR_JOKER' || !G.dyingInfo) return;

      const pid = String(ctx.currentPlayer);
      const rescuer = G.players[pid];
      if (!rescuer || rescuer.eliminated || !rescuer.hand) return;

      const card = rescuer.hand[jokerCardIdx];
      if (!card || !card.isJoker) return;

      // 移除 Joker
      rescuer.hand.splice(jokerCardIdx, 1);
      G.discard.push(card);

      // 救援目标
      const di = G.dyingInfo;
      const target = G.players[di.playerId];
      if (!target) { G.dyingInfo = null; return; }

      const tc = target.characters && target.characters[di.charIdx];
      if (!tc) { G.dyingInfo = null; return; }

      // 复活
      tc.isDying = false;
      tc.isDead = false;
      tc.hp = Math.floor(tc.maxHp / 2);
      tc.shield = 0;
      target.aliveChars = (target.aliveChars || 0) + 1;
      // ★ 消耗一条命
      if (tc.lives !== undefined) {
        tc.lives = Math.max(1, (tc.lives || 0));
      }

      G.lastAction = { type: 'rescue', playerId: pid, targetId: di.playerId, charIdx: di.charIdx };

      addBattleLog(G, {
        type: 'rescue',
        message: `💖 ${rescuer.name} 用 Joker 救援了 ${target.name}！`,
        timestamp: Date.now(),
      });

      G.dyingInfo = null;

      // 法则二：空城补给（救援者可能空手）
      replenishHand(G, pid);
    },
  },

  /* ── 游戏结束条件 ── */
  endIf: (G) => {
    if (!G || !G.players) return;
    const alive = Object.entries(G.players).filter(([, p]) => p && !p.eliminated);
    if (alive.length <= 1) {
      const winner = alive[0];
      if (winner && G.players[winner[0]]) {
        addBattleLog(G, {
          type: 'gameOver',
          message: `🏆 ${G.players[winner[0]].name} 获胜！`,
          timestamp: Date.now(),
        });
      }
      return { winner: winner ? winner[0] : 'draw' };
    }
  },
};

/* ══════════════════════════════════════════════════════
   内部结算函数（pure functions，仅被 moves 调用）
   ══════════════════════════════════════════════════════ */

/**
 * ★ 新增：添加战斗日志条目
 */
function addBattleLog(G, entry) {
  if (!G) return;
  if (!G.battleLog) G.battleLog = [];
  G.battleLog.push(entry);
  // 限制日志长度
  if (G.battleLog.length > 50) {
    G.battleLog = G.battleLog.slice(-50);
  }
}

/**
 * 处理角色死亡 → 清手牌 → 换将 或 濒死
 *
 * ★ 修复：正确区分"换将"与"濒死"
 *   - 有剩余存活角色 → 换将（切换到下一个角色）
 *   - 无剩余存活角色 → 濒死（进入 WAITING_FOR_JOKER）
 */
function handleCharacterDeath(G, deadPlayerId, killerId) {
  if (!G || !G.players) return;
  const deadP = G.players[deadPlayerId];
  if (!deadP || deadP.eliminated) return;

  // ★ 标记当前活跃角色为死亡（先标记，再查找下一个）
  const dyingChar = deadP.characters && deadP.characters[deadP.activeCharIdx];
  if (dyingChar) {
    dyingChar.isDead = true;
    dyingChar.isDying = false;
    dyingChar.hp = 0;
    // ★ 消耗一条命
    if (dyingChar.lives !== undefined) {
      dyingChar.lives = Math.max(0, (dyingChar.lives || 0) - 1);
    }
  }

  deadP.aliveChars = Math.max(0, (deadP.aliveChars || 0) - 1);

  // 清空死者所有手牌
  deadP.hand = [];

  // 击杀者摸 3 张（法则三）
  if (killerId !== undefined && killerId !== null) {
    drawCards(G, killerId, 3);
  }

  // ★ 先查下一个存活角色（当前角色已标记死亡，能正确跳过）
  const nextIdx = nextAliveCharIdx(deadP);

  if (nextIdx >= 0) {
    // ✅ 有存活角色 → 换将
    deadP.activeCharIdx = nextIdx;
    // 摸 5 张（法则三）
    drawCards(G, deadPlayerId, 5);

    const newChar = deadP.characters[nextIdx];
    G.lastAction = {
      ...(G.lastAction || {}),
      switchedChar: true,
      newCharIdx: nextIdx,
    };

    addBattleLog(G, {
      type: 'switchChar',
      message: `🔄 ${deadP.name} 阵亡，切换至 ${newChar ? newChar.suit + newChar.rank : '?'}（剩余 ${deadP.aliveChars} 角色）`,
      timestamp: Date.now(),
    });
  } else {
    // ❌ 无存活角色 → 濒死（注意：当前角色已在上方标记死亡）
    //    需要将其 isDying 设为 true 以进入 WAITING_FOR_JOKER
    if (dyingChar) {
      dyingChar.isDying = true;
      // 注意：isDead 保持 true（角色已死亡），isDying 表示玩家整体濒死
    }
    G.dyingInfo = {
      playerId: String(deadPlayerId),
      charIdx: deadP.activeCharIdx,
      attackerId: killerId !== undefined && killerId !== null ? String(killerId) : null,
      startedAt: Date.now(),
    };
  }
}

/** 濒死超时 → 玩家淘汰 */
function handleDyingTimeout(G) {
  if (!G || !G.dyingInfo) return;
  const di = G.dyingInfo;
  const deadP = G.players[di.playerId];
  if (deadP) {
    // 标记所有角色死亡
    if (deadP.characters) {
      deadP.characters.forEach(c => {
        if (c) { c.isDead = true; c.isDying = false; c.hp = 0; }
      });
    }
    deadP.hand = [];
    deadP.eliminated = true;

    addBattleLog(G, {
      type: 'playerDied',
      message: `💀 ${deadP.name} 救援超时，已阵亡淘汰`,
      timestamp: Date.now(),
    });
  }
  G.lastAction = { type: 'playerDied', playerId: di.playerId };
  G.dyingInfo = null;
}

/** 法则一：♦ 方块五谷丰登 — 全场轮序摸牌 */
function triggerDiamondDraw(G, attackerId, damageAmount) {
  if (!G || !G.players) return;
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
    if (p && !p.eliminated && p.hand && p.hand.length < MAX_HAND) {
      drawCards(G, pid, 1);
      remaining--;
    }
    idx++;
  }
}

/** 法则二：空城补给 — 手牌为空或仅剩 Joker → 补 3 张 */
function replenishHand(G, pid) {
  if (!G || !G.players) return;
  const p = G.players[pid];
  if (!p || p.eliminated) return;
  if (needReplenish(p)) {
    drawCards(G, pid, 3);
  }
}
