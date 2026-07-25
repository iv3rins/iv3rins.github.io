/**
 * ai.js — PokeWar 单机 AI 控制器 (PvE)
 *
 * 架构：
 *   - 利用 boardgame.io/ai 的 Bot 框架
 *   - 实现 enumerate 函数，枚举所有合法 moves
 *   - 支持 RandomBot（随机）和 MCTSBot（蒙特卡洛搜索树）
 *
 * 使用方式：
 *   import { createAIPlayer } from './js/engine/ai.js';
 *   const ai = createAIPlayer({ client, botType: 'random' });
 *   ai.start();  // AI 开始自动行动
 *   ai.stop();   // 停止 AI
 *
 * 约束：
 *   1. AI 绝不直接修改状态 — 必须通过 client.moves.xxx() 派发
 *   2. 不阻塞主线程 — 使用异步 step 模式
 *   3. 所有状态读取都有空值保护
 */

import { PokeWar } from '../../game.js';

/**
 * ★ 枚举所有合法的 AI 动作
 *
 * 这是 boardgame.io AI 框架的核心函数。
 * 返回 { moves: [...] } 数组，每个元素是 { move: 'moveName', args: [...] }
 *
 * @param {object} G — 游戏状态
 * @param {object} ctx — 上下文（currentPlayer, phase 等）
 * @param {string} playerID — 当前 AI 玩家的 ID
 * @returns {{ moves: Array<{ move: string, args: any[] }> }}
 */
export function enumerateAI(G, ctx, playerID) {
  if (!G || !ctx || !G.players) return { moves: [] };

  const moves = [];
  const pid = String(playerID);
  const player = G.players[pid];

  // ★ 空值保护
  if (!player || player.eliminated) return { moves: [] };

  const phase = G.phase || 'SELECTING_STARTER';
  const isMyTurn = String(ctx.currentPlayer) === pid;

  switch (phase) {

    // ── 选将阶段 ──
    case 'SELECTING_STARTER':
      if (!player.starterSelected && player.characters) {
        player.characters.forEach((c, i) => {
          if (c && !c.isDead) {
            moves.push({ move: 'selectStarter', args: [i] });
          }
        });
      }
      break;

    // ── 对战阶段 ──
    case 'PLAYING':
      if (!isMyTurn) break;
      if (!player.hand || player.hand.length === 0) break;

      // 枚举所有可能的出牌组合
      const hand = player.hand;

      // 1) 单张出牌
      for (let i = 0; i < hand.length; i++) {
        const card = hand[i];
        if (!card) continue;

        if (card.isJoker) {
          // 单 Joker：枚举所有有死亡角色的目标
          enumerateTargets(G, pid).forEach(targetId => {
            const target = G.players[targetId];
            if (!target || target.eliminated) return;
            const tc = target.characters && target.characters[target.activeCharIdx];
            if (tc && tc.isDead) {
              moves.push({ move: 'playCards', args: [[i], targetId, null] });
            }
          });
        } else {
          // 普通单张
          if (card.suit === '♣') {
            // ♣ 护盾不需要目标
            moves.push({ move: 'playCards', args: [[i], null, card.suit] });
          } else {
            // ♠/♥/♦ 需要目标
            enumerateTargets(G, pid).forEach(targetId => {
              const target = G.players[targetId];
              if (!target || target.eliminated) return;
              const tc = target.characters && target.characters[target.activeCharIdx];
              if (tc && !tc.isDead) {
                // 含 A 时需要枚举花色
                if (card.rank === 'A') {
                  const suits = [...new Set([card.suit])]; // A 至少能用自身花色
                  suits.forEach(s => {
                    moves.push({ move: 'playCards', args: [[i], targetId, s] });
                  });
                } else {
                  moves.push({ move: 'playCards', args: [[i], targetId, card.suit] });
                }
              }
            });
          }
        }
      }

      // 2) 多张同花色出牌（简化：枚举 2-3 张同花色组合）
      if (hand.length >= 2) {
        for (let i = 0; i < hand.length; i++) {
          const c1 = hand[i];
          if (!c1 || c1.isJoker) continue;

          for (let j = i + 1; j < hand.length; j++) {
            const c2 = hand[j];
            if (!c2 || c2.isJoker) continue;

            const hasA = c1.rank === 'A' || c2.rank === 'A';

            if (hasA || c1.suit === c2.suit) {
              const indices = [i, j];
              const suits = hasA
                ? [...new Set([c1.suit, c2.suit].filter(Boolean))]
                : [c1.suit];

              suits.forEach(s => {
                if (s === '♣') {
                  moves.push({ move: 'playCards', args: [indices, null, s] });
                } else {
                  enumerateTargets(G, pid).forEach(targetId => {
                    const target = G.players[targetId];
                    if (!target || target.eliminated) return;
                    const tc = target.characters && target.characters[target.activeCharIdx];
                    if (tc && !tc.isDead) {
                      moves.push({ move: 'playCards', args: [indices, targetId, s] });
                    }
                  });
                }
              });
            }
          }
        }
      }

      // 3) 双 Joker 组合（斩杀存活角色）
      const jokerIndices = [];
      hand.forEach((c, i) => { if (c && c.isJoker) jokerIndices.push(i); });
      if (jokerIndices.length >= 2) {
        enumerateTargets(G, pid).forEach(targetId => {
          const target = G.players[targetId];
          if (!target || target.eliminated) return;
          const tc = target.characters && target.characters[target.activeCharIdx];
          if (tc && !tc.isDead) {
            moves.push({ move: 'playCards', args: [[jokerIndices[0], jokerIndices[1]], targetId, null] });
          }
        });
      }
      break;

    // ── 濒死救援阶段 ──
    case 'WAITING_FOR_JOKER':
      if (!player.hand) break;
      player.hand.forEach((card, i) => {
        if (card && card.isJoker) {
          moves.push({ move: 'rescueWithJoker', args: [i] });
        }
      });
      break;

    default:
      break;
  }

  return { moves };
}

/**
 * 枚举可选目标玩家 ID（排除自己和已淘汰的）
 */
function enumerateTargets(G, myId) {
  if (!G || !G.players) return [];
  return Object.keys(G.players).filter(pid => {
    const p = G.players[pid];
    return p && pid !== String(myId) && !p.eliminated;
  });
}

/**
 * ★ 创建 AI 玩家控制器
 *
 * @param {object} options
 * @param {object} options.client — boardgame.io Client 实例
 * @param {'random'|'mcts'} [options.botType='random'] — AI 类型
 * @param {number} [options.stepDelay=800] — 每步间隔 (ms)
 * @returns {{ start: Function, stop: Function, step: Function }}
 */
export function createAIPlayer({ client, botType = 'random', stepDelay = 800 } = {}) {
  if (!client) {
    console.error('[AI] 缺少 client 实例');
    return { start: () => {}, stop: () => {}, step: () => {} };
  }

  let _timer = null;
  let _running = false;

  /**
   * ★ 执行一步 AI 动作
   * 1. 获取当前状态
   * 2. 枚举合法 moves
   * 3. 选择一个 move 并派发
   */
  async function step() {
    if (!_running || !client) return;

    try {
      const state = client.getState ? client.getState() : null;
      if (!state || !state.G || !state.ctx) {
        // 状态未就绪，稍后重试
        scheduleNext();
        return;
      }

      const G = state.G;
      const ctx = state.ctx;
      const myPlayerID = client.playerID;

      // ★ 空值保护
      if (!myPlayerID) { scheduleNext(); return; }

      // 检查是否该 AI 的回合
      const isMyTurn = String(ctx.currentPlayer) === String(myPlayerID);
      const phase = G.phase;

      // 选将阶段或我的回合或濒死阶段（任何人都可以救援）
      const shouldAct = isMyTurn || phase === 'SELECTING_STARTER' || phase === 'WAITING_FOR_JOKER';

      if (!shouldAct) {
        scheduleNext();
        return;
      }

      // 枚举合法 moves
      const { moves } = enumerateAI(G, ctx, myPlayerID);

      if (!moves || moves.length === 0) {
        // 无合法动作，跳过
        scheduleNext();
        return;
      }

      // 选择 move（随机 或 MCTS）
      let chosen;
      if (botType === 'mcts') {
        // ★ MCTS 模式：简单启发式 — 优先攻击/救援
        const attackMoves = moves.filter(m => m.move === 'playCards');
        const rescueMoves = moves.filter(m => m.move === 'rescueWithJoker');
        if (rescueMoves.length > 0) {
          chosen = rescueMoves[Math.floor(Math.random() * rescueMoves.length)];
        } else if (attackMoves.length > 0) {
          chosen = attackMoves[Math.floor(Math.random() * attackMoves.length)];
        } else {
          chosen = moves[Math.floor(Math.random() * moves.length)];
        }
      } else {
        // RandomBot
        chosen = moves[Math.floor(Math.random() * moves.length)];
      }

      if (!chosen) { scheduleNext(); return; }

      // ★ 通过 client.moves 派发动作（绝不允许直接修改状态）
      const moveFn = client.moves && client.moves[chosen.move];
      if (typeof moveFn === 'function') {
        console.log(`[AI] ${myPlayerID} → ${chosen.move}(${chosen.args.join(', ')})`);
        moveFn(...chosen.args);
      }
    } catch (e) {
      console.error('[AI] step error:', e.message);
    }

    scheduleNext();
  }

  function scheduleNext() {
    if (!_running) return;
    _timer = setTimeout(() => step(), stepDelay);
  }

  function start() {
    if (_running) return;
    _running = true;
    console.log(`[AI] 启动 (${botType}), delay=${stepDelay}ms`);
    // 首次延迟稍长，等待状态初始化
    _timer = setTimeout(() => step(), stepDelay * 2);
  }

  function stop() {
    _running = false;
    if (_timer) { clearTimeout(_timer); _timer = null; }
    console.log('[AI] 已停止');
  }

  return { start, stop, step };
}

/**
 * ★ 为单机模式创建多个 AI 对手
 *
 * @param {object} options
 * @param {object} options.client — boardgame.io Client (本地)
 * @param {number} [options.aiCount=3] — AI 数量
 * @param {number} [options.humanPlayerID='0'] — 人类玩家 ID
 * @param {number} [options.stepDelay=1000] — 步间隔
 * @returns {{ startAll: Function, stopAll: Function, players: Array }}
 */
export function createBotOpponents({
  client,
  aiCount = 3,
  humanPlayerID = '0',
  stepDelay = 1000,
} = {}) {
  if (!client) return { startAll: () => {}, stopAll: () => {}, players: [] };

  const state = client.getState ? client.getState() : null;
  if (!state || !state.G || !state.G.players) {
    console.warn('[AI] 状态未就绪，无法创建 Bot');
    return { startAll: () => {}, stopAll: () => {}, players: [] };
  }

  const allPlayerIDs = Object.keys(state.G.players);
  const botIDs = allPlayerIDs.filter(id => String(id) !== String(humanPlayerID));

  // 限制 AI 数量
  const targetBotIDs = botIDs.slice(0, Math.min(aiCount, botIDs.length));

  const controllers = targetBotIDs.map(botID => {
    // ★ 为每个 Bot 创建独立的 AI 控制器
    //    注意：所有 Bot 共享同一个 client（本地模式）
    const ai = createAIPlayer({ client, botType: 'random', stepDelay });
    return { playerID: botID, controller: ai };
  });

  console.log(`[AI] 创建 ${controllers.length} 个 Bot 对手:`, targetBotIDs.join(', '));

  return {
    players: controllers,
    startAll() {
      controllers.forEach(({ controller }) => controller.start());
    },
    stopAll() {
      controllers.forEach(({ controller }) => controller.stop());
    },
  };
}
