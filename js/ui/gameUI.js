/**
 * gameUI.js — 对局视图层 (View)
 *
 * 职责：
 *   1. 监听 boardgame.io client.subscribe → 渲染 DOM（单向数据流）
 *   2. 顶部区域：渲染"滚动便当盒"对手阵列（最多 11 个微缩卡片）
 *   3. 中央区域：战斗播报板 + 濒死救援倒计时
 *   4. 底部区域：手牌渲染 + 角色状态 + 浮动操作按钮
 *   5. 事件代理 → 用户操作映射到 client.moves.xxx()
 *
 * 约束：
 *   - 绝不直接修改状态（只通过 client.moves 派发）
 *   - 所有 DOM 操作前判空
 *   - destroy() 清理所有定时器 + 解绑事件
 */

import { app } from '../app.js';
import { audioManager } from '../audioManager.js';
import { Toast } from './toast.js';
import { showModal, hideModal } from './lobbyUI.js';

/* ═══════════════════════════════════════
   Ａ．渲染版本号保护（防止旧异步回调污染 DOM）
   ═══════════════════════════════════════ */

let _renderSeq = 0;
export function nextRenderSeq() { return ++_renderSeq; }
function isCurrentRender(seq) { return seq === _renderSeq; }

/* ═══════════════════════════════════════
   Ｂ．选中状态（本地 UI 态，不进入 game state）
   ═══════════════════════════════════════ */

let selectedCardIndices = [];
let selectedTargetId = null;
let declaredSuit = null;

// ★ 导出供 UIManager 读取
export { selectedCardIndices, selectedTargetId, declaredSuit };

export function clearSelection() {
  const handArea = document.getElementById('hand-area');
  if (handArea) {
    handArea.querySelectorAll('.poker-card.selected').forEach(el => el.classList.remove('selected'));
  }
  document.querySelectorAll('.opponent-mini.targeted').forEach(el => el.classList.remove('targeted'));
  selectedCardIndices = [];
  selectedTargetId = null;
  declaredSuit = null;
  updateActionButtons();
}

/* ═══════════════════════════════════════
   Ｃ．主渲染入口
   ═══════════════════════════════════════ */

/**
 * ★ 渲染游戏状态 → DOM（单向数据流）
 * 由 app.onStateChange 触发
 */
export function renderGameState(state) {
  if (!state || !state.G) return;

  const seq = nextRenderSeq();
  const G = state.G;
  const ctx = state.ctx;

  console.log('[gameUI] renderState #' + seq + ' — phase:', G.phase, 'turn:', G.turn, 'player:', ctx && ctx.currentPlayer);

  // ── 更新阶段标签 ──
  updatePhaseLabel(G, ctx);

  // ── 更新牌堆/回合信息 ──
  updateBattlefieldInfo(G);

  // ── ★ 顶部：渲染对手阵列（滚动便当盒）──
  updateOpponents(G, ctx);

  // ── ★ 左侧：渲染自己角色状态 ──
  updateSelfChar(G);

  // ── ★ 中央：战斗播报板 ──
  updateBattleLog(G);

  // ── ★ 底部：手牌渲染 ──
  if (G.phase !== 'SELECTING_STARTER') {
    updateHandCards(G, ctx);
    updateActionButtons();
  }

  // ── 检查阶段弹窗 ──
  checkPhaseModals(G, ctx, seq);
}

/* ═══════════════════════════════════════
   Ｄ．阶段标签 + 战场信息
   ═══════════════════════════════════════ */

function updatePhaseLabel(G, ctx) {
  const phaseLabel = document.getElementById('phase-label');
  const phaseTimer = document.getElementById('phase-timer');
  if (!phaseLabel) return;

  const phaseNames = {
    SELECTING_STARTER: '选将阶段',
    PLAYING: '对战阶段',
    WAITING_FOR_JOKER: '濒死救援',
  };
  phaseLabel.textContent = phaseNames[G.phase] || G.phase;

  // ★ 濒死倒计时
  if (G.phase === 'WAITING_FOR_JOKER' && G.dyingInfo && G.dyingInfo.startedAt) {
    const elapsed = Math.floor((Date.now() - G.dyingInfo.startedAt) / 1000);
    const remaining = Math.max(0, 10 - elapsed);
    if (phaseTimer) {
      phaseTimer.textContent = remaining;
      phaseTimer.style.background = remaining <= 3 ? '#FF3B30' : '#FF3B30';
    }
  } else {
    if (phaseTimer) phaseTimer.textContent = '--';
  }
}

function updateBattlefieldInfo(G) {
  const deckEl = document.getElementById('deck-count');
  const turnEl = document.getElementById('turn-display');
  if (deckEl) deckEl.textContent = (G.deck && G.deck.length) || '--';
  if (turnEl) turnEl.textContent = G.turn || '--';
}

/* ═══════════════════════════════════════
   Ｅ．★ 对手阵列（滚动便当盒）
   ═══════════════════════════════════════ */

function updateOpponents(G, ctx) {
  const container = document.getElementById('opponents-area');
  if (!container) return;

  const myId = app.playerID;
  if (myId === null || myId === undefined) return;

  const players = G.players || {};
  const currentPlayerId = ctx && ctx.currentPlayer !== undefined ? String(ctx.currentPlayer) : null;

  container.innerHTML = Object.entries(players)
    .filter(([pid]) => String(pid) !== String(myId))
    .map(([pid, p]) => renderOpponentMini(pid, p, G, currentPlayerId))
    .join('');
}

/**
 * ★ 渲染单个微缩对手卡片
 * @param {string} pid — 玩家 ID
 * @param {object} p — 玩家数据
 * @param {object} G — 游戏状态
 * @param {string|null} currentPlayerId — 当前回合玩家 ID
 */
function renderOpponentMini(pid, p, G, currentPlayerId) {
  // ★ 空值保护
  if (!p) return '';

  if (p.eliminated) {
    return `<div class="opponent-mini eliminated" data-player-id="${pid}">
      <span class="mini-avatar">💀</span>
      <div>
        <div class="mini-name">${escapeHtml(p.name || '?')}</div>
        <div style="color:var(--text-muted);font-size:10px">已阵亡</div>
      </div>
    </div>`;
  }

  const ac = p.characters && p.characters[p.activeCharIdx];
  if (!ac) return '';

  const hpPct = Math.max(0, ((ac.hp || 0) / (ac.maxHp || 10)) * 100);
  const suitColor = (ac.suit === '♦' || ac.suit === '♥') ? 'var(--suit-red)' : 'var(--suit-black)';
  const isMyTurn = G.phase === 'PLAYING' && String(G.currentPlayer) === String(app.playerID);

  // ★ currentPlayer 高亮：酸性绿边框
  const isCurrentPlayer = String(pid) === currentPlayerId;
  const highlightStyle = isCurrentPlayer
    ? 'box-shadow: 0 0 0 3px var(--primary-acid); border-color: var(--primary-acid);'
    : '';

  const targetable = isMyTurn ? 'targetable' : '';

  return `<div class="opponent-mini ${targetable}" data-player-id="${pid}" style="${highlightStyle}">
    <span class="mini-avatar">${escapeHtml(p.avatar || '🐱')}</span>
    <div style="flex:1;min-width:0">
      <div class="mini-name">${escapeHtml(p.name || `玩家${pid}`)}</div>
      <div style="font-size:10px;color:${suitColor};white-space:nowrap">
        ${ac.suit} ${ac.rank} ❤️${ac.hp || 0}/${ac.maxHp || 10} 🛡${ac.shield || 0}
      </div>
      <div class="mini-hp-bar" style="width:${hpPct}%;background:${hpPct < 25 ? 'var(--danger-red)' : 'var(--color-hp)'}"></div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════
   Ｆ．自己角色状态
   ═══════════════════════════════════════ */

function updateSelfChar(G) {
  const p = app.getMyPlayer();
  if (!p) return;

  const ac = app.getMyActiveChar();
  if (!ac) return;

  // 头像
  const avatarEl = document.getElementById('self-avatar-img');
  if (avatarEl) {
    avatarEl.src = (p.avatar && p.avatar.startsWith('http'))
      ? p.avatar
      : `https://api.dicebear.com/7.x/micah/svg?seed=${encodeURIComponent(p.name || 'Player')}`;
  }

  // HP 条
  const hpFill = document.getElementById('self-hp-fill');
  const hpVal = document.getElementById('self-hp-val');
  const hpPct = Math.max(0, ((ac.hp || 0) / (ac.maxHp || 10)) * 100);
  if (hpFill) hpFill.style.width = `${hpPct}%`;
  if (hpVal) hpVal.textContent = `${ac.hp || 0}/${ac.maxHp || 10}`;

  // 护盾条
  const shieldFill = document.getElementById('self-shield-fill');
  const shieldVal = document.getElementById('self-shield-val');
  const shieldPct = Math.max(0, ((ac.shield || 0) / (ac.maxHp || 10)) * 100);
  if (shieldFill) shieldFill.style.width = `${shieldPct}%`;
  if (shieldVal) shieldVal.textContent = ac.shield || 0;

  // 身份贴纸
  const stickerEl = document.getElementById('identity-sticker');
  if (stickerEl) {
    stickerEl.textContent = `${ac.suit || '?'} ${ac.rank || '?'}`;
    const suitColor = (ac.suit === '♦' || ac.suit === '♥') ? 'var(--suit-red)' : 'var(--suit-black)';
    stickerEl.style.color = suitColor;
  }

  // 命数显示（❤️🤍）
  const livesEl = document.getElementById('self-lives');
  if (livesEl && p.characters) {
    const total = ac.maxLives || 3;
    const current = ac.lives !== undefined ? ac.lives : aliveCharCount(p);
    let html = '';
    for (let i = 0; i < total; i++) {
      html += i < current ? '❤️' : '🤍';
    }
    livesEl.innerHTML = html;
  }
}

/** 计算存活角色数 */
function aliveCharCount(p) {
  if (!p || !p.characters) return 0;
  return p.characters.filter(c => c && !c.isDead).length;
}

/* ═══════════════════════════════════════
   Ｇ．★ 战斗播报板（中央区域）
   ═══════════════════════════════════════ */

function updateBattleLog(G) {
  const msgEl = document.getElementById('battle-action-msg');
  if (!msgEl) return;

  // 优先显示 lastAction 的即时播报
  if (G.lastAction) {
    const text = formatActionText(G.lastAction, G);
    if (text) {
      msgEl.textContent = text;
      msgEl.style.animation = 'none';
      void msgEl.offsetHeight; // reflow
      msgEl.style.animation = 'fadeIn 0.3s ease';

      // 触发音效
      playActionSound(G.lastAction);

      // ★ 出牌动画
      if (G.lastAction.type === 'attack') {
        spawnPlayCard(G.lastAction.suit, G.lastAction.amount,
          G.players && G.players[G.lastAction.playerId]
            ? G.players[G.lastAction.playerId].name : '?');
      }
    }
  }

  // ★ 战斗日志列表（在 drop-target 中渲染）
  renderBattleLogList(G);
}

function formatActionText(action, G) {
  if (!action) return '';

  const attackerName = (G.players && G.players[action.playerId])
    ? G.players[action.playerId].name : `玩家${action.playerId}`;
  const targetName = (G.players && G.players[action.targetId])
    ? G.players[action.targetId].name : `玩家${action.targetId}`;

  switch (action.type) {
    case 'attack':
      return `⚔️ ${attackerName} → ${targetName} ${action.suit} ${action.amount}点 (实伤${action.actualDmg || 0})${action.immune ? ' [免疫!]' : ''}`;
    case 'shield':
      return `🛡️ ${attackerName} 获得 ${action.amount} 点护盾`;
    case 'jokerRevive':
      return `🃏 ${attackerName} 用 Joker 复活了 ${targetName}`;
    case 'jokerExecute':
      return `💀 ${attackerName} 用双 Joker 斩杀了 ${targetName}`;
    case 'rescue':
      return `💖 ${attackerName} 用 Joker 救援了 ${targetName}`;
    case 'playerDied':
      return `💀 ${targetName} 已阵亡淘汰`;
    case 'starter':
      return `⚔️ ${attackerName} 选择了首发角色`;
    default:
      return '';
  }
}

function playActionSound(action) {
  if (!action) return;
  switch (action.type) {
    case 'attack': audioManager.play('attack'); break;
    case 'shield': audioManager.play('shield'); break;
    case 'jokerRevive':
    case 'jokerExecute': audioManager.play('joker'); break;
    case 'rescue': audioManager.play('heal'); break;
    case 'playerDied': audioManager.play('error'); break;
  }
}

/**
 * ★ 渲染战斗日志列表（在 play-zone 的 drop-target 下方）
 */
function renderBattleLogList(G) {
  const dropTarget = document.querySelector('.drop-target');
  if (!dropTarget) return;

  // 查找或创建日志容器
  let logContainer = dropTarget.querySelector('.battle-log-list');
  if (!logContainer) {
    logContainer = document.createElement('div');
    logContainer.className = 'battle-log-list';
    logContainer.style.cssText = 'width:100%;max-height:120px;overflow-y:auto;margin-top:8px;font-size:12px;text-align:left;padding:4px 8px;';
    dropTarget.appendChild(logContainer);
  }

  const battleLog = G.battleLog || [];
  if (battleLog.length === 0) {
    logContainer.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:8px">等待对战开始...</div>';
    return;
  }

  // 渲染最近 10 条
  const recent = battleLog.slice(-10);
  logContainer.innerHTML = recent.map(entry => {
    const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
    return `<div style="padding:2px 0;border-bottom:1px solid var(--card-border);color:var(--text-main)">
      <span style="color:var(--text-muted);font-size:10px">${time}</span> ${escapeHtml(entry.message || '')}
    </div>`;
  }).join('');

  // ★ 滚动到底部
  logContainer.scrollTop = logContainer.scrollHeight;
}

/** ★ 在 play-zone 中央渲染出牌卡牌动画 */
function spawnPlayCard(suit, value, playerName) {
  const dropTarget = document.querySelector('.drop-target');
  if (!dropTarget) return;

  // 清除旧卡牌
  const old = dropTarget.querySelector('.played-card');
  if (old) old.remove();

  const card = document.createElement('div');
  card.className = 'played-card';
  const suitColor = (suit === '♦' || suit === '♥') ? 'var(--suit-red)' : 'var(--suit-black)';
  card.innerHTML = `
    <span class="played-card-suit" style="color:${suitColor}">${escapeHtml(String(suit))}</span>
    <span class="played-card-value">${value}</span>
    <span class="played-card-name">${escapeHtml(playerName || '')}</span>
  `;
  dropTarget.appendChild(card);

  // 3 秒后自动清除
  setTimeout(() => {
    if (card.parentNode) card.remove();
  }, 3000);
}

/* ═══════════════════════════════════════
   Ｈ．★ 手牌渲染
   ═══════════════════════════════════════ */

function updateHandCards(G, ctx) {
  const p = app.getMyPlayer();
  const container = document.getElementById('hand-area');
  if (!container || !p) return;

  const hand = p.hand || [];
  const isMyTurn = app.isMyTurn();
  const currentPhase = G.phase;

  container.innerHTML = hand.map((card, i) => renderCard(card, i, isMyTurn, currentPhase)).join('');
}

function renderCard(card, index, isMyTurn, currentPhase) {
  if (!card) return '';

  const suitColor = (!card.isJoker && (card.suit === '♦' || card.suit === '♥'))
    ? 'suit-red' : 'suit-black';

  // Joker 在 WAITING_FOR_JOKER 阶段可被任何人使用
  const jokerUsable = card.isJoker && currentPhase === 'WAITING_FOR_JOKER';
  const playable = isMyTurn || jokerUsable;

  const cls = [
    'poker-card',
    card.isJoker ? 'joker' : '',
    suitColor,
    (!playable) ? 'unplayable' : '',
  ].filter(Boolean).join(' ');

  if (card.isJoker) {
    return `<div class="${cls}" data-index="${index}" data-rank="Joker" data-suit="null" data-is-joker="true">
      <span class="card-rank suit-black">🃏</span>
      <span class="card-suit-center">JOKER</span>
      <span class="card-rank-bottom suit-black">🃏</span>
    </div>`;
  }

  return `<div class="${cls}" data-index="${index}" data-rank="${card.rank}" data-suit="${card.suit}" data-value="${card.value || 0}" data-is-joker="false">
    <span class="card-rank ${suitColor}">${card.rank}<br>${card.suit}</span>
    <span class="card-suit-center ${suitColor}">${card.suit}</span>
    <span class="card-rank-bottom ${suitColor}">${card.rank}<br>${card.suit}</span>
  </div>`;
}

/* ═══════════════════════════════════════
   Ｉ．浮动操作按钮
   ═══════════════════════════════════════ */

function updateActionButtons() {
  const hasCards = selectedCardIndices.length > 0;
  const confirmBtn = document.getElementById('btn-confirm');
  const cancelBtn = document.getElementById('btn-cancel');
  const wanhuaBtn = document.getElementById('btn-wanhua');

  if (hasCards) {
    if (cancelBtn) cancelBtn.classList.remove('hidden');

    // 检查是否需要万化选择
    if (needsWanhua() && !declaredSuit) {
      if (wanhuaBtn) wanhuaBtn.style.display = 'inline-block';
      if (confirmBtn) confirmBtn.classList.add('hidden');
    } else {
      if (wanhuaBtn) wanhuaBtn.style.display = 'none';
      if (confirmBtn) confirmBtn.classList.remove('hidden');
    }
  } else {
    if (confirmBtn) confirmBtn.classList.add('hidden');
    if (cancelBtn) cancelBtn.classList.add('hidden');
    if (wanhuaBtn) wanhuaBtn.style.display = 'none';
  }
}

function needsWanhua() {
  const cards = selectedCardIndices.map(i => {
    const el = document.querySelector(`.poker-card[data-index="${i}"]`);
    return {
      rank: el ? el.dataset.rank : null,
      isJoker: el ? el.dataset.isJoker === 'true' : false,
    };
  }).filter(c => c.rank);

  const hasA = cards.some(c => c.rank === 'A');
  const nonJokers = cards.filter(c => !c.isJoker);
  return hasA && nonJokers.length >= 1;
}

function hasShieldCards() {
  const cards = selectedCardIndices.map(i => {
    const el = document.querySelector(`.poker-card[data-index="${i}"]`);
    return el ? el.dataset.suit : null;
  }).filter(Boolean);
  return cards.length > 0 && cards.every(s => s === '♣');
}

/* ═══════════════════════════════════════
   Ｊ．★ 事件代理 — 手牌点击 + 对手选择
   ═══════════════════════════════════════ */

/**
 * ★ 初始化事件代理（在 initGamePage 中调用一次）
 * 返回 cleanup 函数用于销毁
 */
export function initGamePageEvents() {
  const clickSound = () => audioManager.play('click');

  // ── 手牌区事件代理 ──
  const handArea = document.getElementById('hand-area');
  const onHandClick = (e) => {
    const card = e.target.closest('.poker-card');
    if (!card) return;
    handleCardClick(card);
  };
  if (handArea) handArea.addEventListener('click', onHandClick);

  // ── 对手区事件代理 ──
  const opponentsArea = document.getElementById('opponents-area');
  const onOpponentClick = (e) => {
    const mini = e.target.closest('.opponent-mini.targetable');
    if (!mini) return;
    handleOpponentClick(mini);
  };
  if (opponentsArea) opponentsArea.addEventListener('click', onOpponentClick);

  // ── 确定出牌 ──
  const confirmBtn = document.getElementById('btn-confirm');
  const onConfirm = () => { clickSound(); executePlay(); };
  if (confirmBtn) confirmBtn.addEventListener('click', onConfirm);

  // ── 取消 ──
  const cancelBtn = document.getElementById('btn-cancel');
  const onCancel = () => { clickSound(); clearSelection(); };
  if (cancelBtn) cancelBtn.addEventListener('click', onCancel);

  // ── 万化按钮 ──
  const wanhuaBtn = document.getElementById('btn-wanhua');
  const onWanhua = () => { clickSound(); openWanhuaModal(); };
  if (wanhuaBtn) wanhuaBtn.addEventListener('click', onWanhua);

  // ── 万化弹窗 ──
  const wanhuaCancel = document.getElementById('wanhua-cancel-btn');
  if (wanhuaCancel) wanhuaCancel.addEventListener('click', () => { clickSound(); hideModal('wanhua-modal'); });

  const wanhuaConfirm = document.getElementById('wanhua-confirm-btn');
  if (wanhuaConfirm) wanhuaConfirm.addEventListener('click', () => { clickSound(); confirmWanhua(); });

  // ── 教程弹窗 ──
  const tutorialOk = document.getElementById('btn-tutorial-ok');
  if (tutorialOk) tutorialOk.addEventListener('click', () => { clickSound(); hideModal('modal-tutorial'); });

  // ── 再来一局 / 退出 ──
  const restartBtn = document.getElementById('btn-restart');
  if (restartBtn) restartBtn.addEventListener('click', () => { clickSound(); location.reload(); });

  const leaveBtn = document.getElementById('btn-leave-room');
  if (leaveBtn) leaveBtn.addEventListener('click', () => { clickSound(); app.disconnect(); location.reload(); });

  // ★ 返回 cleanup 函数
  return function destroy() {
    if (handArea) handArea.removeEventListener('click', onHandClick);
    if (opponentsArea) opponentsArea.removeEventListener('click', onOpponentClick);
    if (confirmBtn) confirmBtn.removeEventListener('click', onConfirm);
    if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
    if (wanhuaBtn) wanhuaBtn.removeEventListener('click', onWanhua);
    if (wanhuaCancel) wanhuaCancel.removeEventListener('click', () => {});
    if (wanhuaConfirm) wanhuaConfirm.removeEventListener('click', () => {});
    console.log('[gameUI] 事件已解绑');
  };
}

/* ═══════════════════════════════════════
   Ｋ．交互处理
   ═══════════════════════════════════════ */

function handleCardClick(cardEl) {
  audioManager.play('select');

  const idx = parseInt(cardEl.dataset.index);
  if (isNaN(idx)) return;
  if (cardEl.classList.contains('unplayable')) return;

  cardEl.classList.toggle('selected');

  if (cardEl.classList.contains('selected')) {
    if (!selectedCardIndices.includes(idx)) selectedCardIndices.push(idx);
  } else {
    selectedCardIndices = selectedCardIndices.filter(i => i !== idx);
  }

  updateActionButtons();
}

function handleOpponentClick(miniEl) {
  audioManager.play('select');

  const pid = miniEl.dataset.playerId;
  if (pid === undefined) return;

  // 取消之前的选择
  document.querySelectorAll('.opponent-mini.targeted').forEach(el => el.classList.remove('targeted'));

  if (selectedTargetId === pid) {
    selectedTargetId = null;
  } else {
    selectedTargetId = pid;
    miniEl.classList.add('targeted');
  }

  updateActionButtons();
}

function executePlay() {
  if (!selectedCardIndices.length) return;

  if (hasShieldCards()) {
    // 护盾不需要目标
    app.playCards(selectedCardIndices, null, declaredSuit);
  } else {
    if (selectedTargetId === null) {
      Toast.show('请选择攻击目标！', 'error');
      audioManager.play('error');
      return;
    }
    app.playCards(selectedCardIndices, selectedTargetId, declaredSuit);
  }

  clearSelection();
}

/* ═══════════════════════════════════════
   Ｌ．万化弹窗
   ═══════════════════════════════════════ */

function openWanhuaModal() {
  const suits = new Set();
  selectedCardIndices.forEach(i => {
    const el = document.querySelector(`.poker-card[data-index="${i}"]`);
    const suit = el ? el.dataset.suit : null;
    if (suit && suit !== 'null') suits.add(suit);
  });

  const container = document.getElementById('wanhua-suit-options');
  if (!container) return;
  container.innerHTML = '';

  for (const s of suits) {
    const btn = document.createElement('button');
    btn.className = `wanhua-suit-btn ${s === '♦' || s === '♥' ? 'suit-red' : 'suit-black'}`;
    btn.textContent = s;
    btn.style.color = (s === '♦' || s === '♥') ? 'var(--suit-red)' : 'var(--suit-black)';
    btn.addEventListener('click', () => {
      container.querySelectorAll('.wanhua-suit-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      declaredSuit = s;
    });
    container.appendChild(btn);
  }

  showModal('wanhua-modal');
}

function confirmWanhua() {
  if (!declaredSuit) {
    Toast.show('请选择一个花色', 'error');
    return;
  }
  hideModal('wanhua-modal');
  updateActionButtons();

  const wanhuaBtn = document.getElementById('btn-wanhua');
  if (wanhuaBtn) wanhuaBtn.style.display = 'none';
  const confirmBtn = document.getElementById('btn-confirm');
  if (confirmBtn) confirmBtn.classList.remove('hidden');
}

/* ═══════════════════════════════════════
   Ｍ．阶段弹窗检查
   ═══════════════════════════════════════ */

function checkPhaseModals(G, ctx, renderSeq) {
  // 选将阶段
  if (G.phase === 'SELECTING_STARTER') {
    const myPlayer = app.getMyPlayer();
    if (myPlayer && !myPlayer.starterSelected) {
      showStarterModal(G, renderSeq);
    }
  }

  // 濒死救援阶段
  if (G.phase === 'WAITING_FOR_JOKER' && G.dyingInfo) {
    showDyingModal(G, renderSeq);
  } else {
    hideModal('modal-dying');
  }
}

function showStarterModal(G, renderSeq) {
  const p = app.getMyPlayer();
  if (!p) return;

  const container = document.getElementById('starter-options');
  if (!container) return;
  if (!isCurrentRender(renderSeq)) return;

  container.innerHTML = '';

  p.characters && p.characters.forEach((c, i) => {
    if (!c || c.isDead) return;
    const suitColor = (c.suit === '♦' || c.suit === '♥') ? 'var(--suit-red)' : 'var(--suit-black)';
    const card = document.createElement('div');
    card.className = 'starter-char-card';
    card.innerHTML = `
      <span class="char-suit-display" style="color:${suitColor}">${escapeHtml(c.suit || '?')}</span>
      <span class="char-rank-display">${escapeHtml(c.rank || '?')}</span>
      <span class="char-hp-display">❤️${c.hp || 0}/${c.maxHp || 10} 💗${c.lives !== undefined ? c.lives : '?'}</span>
    `;
    card.addEventListener('click', () => {
      app.selectStarter(i);
      hideModal('modal-starter');
    });
    container.appendChild(card);
  });

  showModal('modal-starter');
}

function showDyingModal(G, renderSeq) {
  if (!G.dyingInfo) return;

  const target = G.players && G.players[G.dyingInfo.playerId];
  if (!target) return;
  if (!isCurrentRender(renderSeq)) return;

  const desc = document.getElementById('dying-desc');
  if (desc) desc.textContent = `${target.name || '?'} 的最后一个角色濒死！持有 Joker 的玩家可救援，10 秒后死亡。`;

  // 倒计时
  const countdownEl = document.getElementById('dying-countdown');
  if (countdownEl && G.dyingInfo.startedAt) {
    const elapsed = Math.floor((Date.now() - G.dyingInfo.startedAt) / 1000);
    const remaining = Math.max(0, 10 - elapsed);
    countdownEl.textContent = remaining;
  }

  // 救援按钮
  const actionsEl = document.getElementById('dying-actions');
  if (actionsEl) {
    actionsEl.innerHTML = '';

    const p = app.getMyPlayer();
    if (p && p.hand) {
      p.hand.forEach((card, i) => {
        if (!card || !card.isJoker) return;
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        btn.textContent = '🃏 使用 Joker 救援';
        btn.addEventListener('click', () => {
          app.rescueWithJoker(i);
          hideModal('modal-dying');
        });
        actionsEl.appendChild(btn);
      });
    }

    const skipBtn = document.createElement('button');
    skipBtn.className = 'btn btn-secondary';
    skipBtn.textContent = '跳过';
    skipBtn.addEventListener('click', () => hideModal('modal-dying'));
    actionsEl.appendChild(skipBtn);
  }

  showModal('modal-dying');
}

/* ═══════════════════════════════════════
   Ｎ．工具函数
   ═══════════════════════════════════════ */

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}
