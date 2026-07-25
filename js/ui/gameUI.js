/**
 * gameUI.js — 游戏内 UI 渲染 (View 层)
 *
 * 职责：
 *   1. 将 boardgame.io 状态映射到 DOM
 *   2. 渲染手牌、对手面板、角色信息
 *   3. 出牌动画与特效
 */
import { app } from '../app.js';
import { audioManager } from '../audioManager.js';
import { Toast } from './toast.js';

// ═══════════════════════════════════════
// 渲染版本号保护 (防止旧异步回调污染 DOM)
// ═══════════════════════════════════════

let _renderSeq = 0;

/** 获取当前渲染序号，每次渲染前递增 */
export function nextRenderSeq() { return ++_renderSeq; }

/** 检查序号是否仍然有效 */
function isCurrentRender(seq) { return seq === _renderSeq; }

// ═══════════════════════════════════════
// 主渲染入口
// ═══════════════════════════════════════

export function renderGameState(state) {
  if (!state || !state.G) return;

  const seq = nextRenderSeq();
  const G = state.G;
  const ctx = state.ctx;

  console.log('[gameUI] renderState #' + seq + ' — phase:', G.phase, 'turn:', G.turn, 'player:', ctx.currentPlayer);

  // 更新战场信息
  updateBattlefield(G, ctx);

  // 更新对手区域
  updateOpponents(G, ctx);

  // 更新自己的角色信息
  updateSelfChar(G);

  // 更新手牌
  if (G.phase !== 'SELECTING_STARTER') {
    updateHandCards(G);
  }

  // 检查特殊阶段
  checkPhaseModals(G, ctx, seq);

  // 显示上次动作
  if (G.lastAction) {
    showActionBroadcast(G.lastAction, G);
  }
}

// ═══════════════════════════════════════
// 战场信息
// ═══════════════════════════════════════

function updateBattlefield(G, ctx) {
  const deckEl = document.getElementById('deck-count');
  const turnEl = document.getElementById('turn-display');

  if (deckEl) deckEl.textContent = G.deck?.length ?? '--';
  if (turnEl) turnEl.textContent = G.turn ?? '--';
}

// ═══════════════════════════════════════
// 对手区域
// ═══════════════════════════════════════

function updateOpponents(G, ctx) {
  const container = document.getElementById('opponents-area');
  if (!container) return;

  const myId = app.playerID;
  const players = G.players || {};

  container.innerHTML = Object.entries(players)
    .filter(([pid]) => String(pid) !== String(myId))
    .map(([pid, p]) => renderOpponentMini(pid, p, G))
    .join('');
}

function renderOpponentMini(pid, p, G) {
  if (p.eliminated) {
    return `<div class="opponent-mini eliminated">
      <span class="mini-avatar">💀</span>
      <div><div class="mini-name">${escapeHtml(p.name)}</div><div style="color:var(--text-muted)">已阵亡</div></div>
    </div>`;
  }

  const ac = p.characters?.[p.activeCharIdx];
  if (!ac) return '';

  const hpPct = Math.max(0, (ac.hp / ac.maxHp) * 100);
  const shieldPct = Math.max(0, ((ac.shield || 0) / ac.maxHp) * 100);
  const suitColor = (ac.suit === '♦' || ac.suit === '♥') ? 'var(--suit-red)' : 'var(--suit-black)';

  const isMyTurn = G.phase === 'PLAYING' && String(G.currentPlayer) === String(app.playerID);
  const targetable = isMyTurn ? 'targetable' : '';
  const targeted = ''; // 由点击事件管理

  return `<div class="opponent-mini ${targetable} ${targeted}" data-player-id="${pid}">
    <span class="mini-avatar">${p.avatar || '🐱'}</span>
    <div style="flex:1">
      <div class="mini-name">${escapeHtml(p.name)}</div>
      <div style="font-size:10px;color:${suitColor}">${ac.suit} ${ac.rank} ❤️${ac.hp}/${ac.maxHp} 🛡${ac.shield || 0}</div>
      <div class="mini-hp-bar" style="width:${hpPct}%"></div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════
// 自己角色信息
// ═══════════════════════════════════════

function updateSelfChar(G) {
  const p = app.getMyPlayer();
  if (!p) return;

  const ac = app.getMyActiveChar();
  if (!ac) return;

  // 头像 (new: character-avatar-img)
  const avatarEl = document.getElementById('self-avatar-img');
  if (avatarEl) {
    avatarEl.src = p.avatar && p.avatar.startsWith('http') ? p.avatar
      : `https://api.dicebear.com/7.x/micah/svg?seed=${encodeURIComponent(p.name || 'Player')}`;
  }

  // HP 条
  const hpFill = document.getElementById('self-hp-fill');
  const hpVal = document.getElementById('self-hp-val');
  const hpPct = Math.max(0, (ac.hp / ac.maxHp) * 100);
  if (hpFill) hpFill.style.width = `${hpPct}%`;
  if (hpVal) hpVal.textContent = `${ac.hp}/${ac.maxHp}`;

  // 护盾条
  const shieldFill = document.getElementById('self-shield-fill');
  const shieldVal = document.getElementById('self-shield-val');
  const shieldPct = Math.max(0, ((ac.shield || 0) / ac.maxHp) * 100);
  if (shieldFill) shieldFill.style.width = `${shieldPct}%`;
  if (shieldVal) shieldVal.textContent = ac.shield || 0;

  // 身份贴纸
  const stickerEl = document.getElementById('identity-sticker');
  if (stickerEl) {
    stickerEl.textContent = `${ac.suit || '?'} ${ac.rank || '?'}`;
    const suitColor = (ac.suit === '♦' || ac.suit === '♥') ? 'var(--suit-red)' : 'var(--suit-black)';
    stickerEl.style.color = suitColor;
  }

  // 计算剩余存活角色
  const alive = p.characters?.filter(c => !c.isDead).length || 0;
  // 更新到阶段条
  const phaseLabel = document.getElementById('phase-label');
  if (phaseLabel) {
    const phaseNames = { SELECTING_STARTER: '选将阶段', PLAYING: '对战阶段', WAITING_FOR_JOKER: '濒死救援' };
    phaseLabel.textContent = phaseNames[app.getPhase()] || '对战阶段';
  }
}

// ═══════════════════════════════════════
// 手牌渲染
// ═══════════════════════════════════════

export function updateHandCards(G) {
  const p = app.getMyPlayer();
  const container = document.getElementById('hand-area');
  if (!container || !p) return;

  const hand = p.hand || [];
  const isMyTurn = app.isMyTurn();

  container.innerHTML = hand.map((card, i) => renderCard(card, i, isMyTurn)).join('');
}

function renderCard(card, index, isMyTurn) {
  const suitColor = (!card.isJoker && (card.suit === '♦' || card.suit === '♥'))
    ? 'suit-red' : 'suit-black';

  const playable = !card.isJoker || card.isJoker; // Joker 在特定阶段可用
  const cls = [
    'poker-card',
    card.isJoker ? 'joker' : '',
    suitColor,
    (!isMyTurn) ? 'unplayable' : '',
    (card.isJoker && card.isJoker) ? 'joker' : '',
  ].filter(Boolean).join(' ');

  if (card.isJoker) {
    return `<div class="${cls}" data-index="${index}" data-rank="Joker" data-suit="null" data-is-joker="true">
      <span class="card-rank suit-black">🃏</span>
      <span class="card-suit-center">JOKER</span>
      <span class="card-rank-bottom suit-black">🃏</span>
    </div>`;
  }

  return `<div class="${cls}" data-index="${index}" data-rank="${card.rank}" data-suit="${card.suit}" data-value="${card.value}" data-is-joker="false">
    <span class="card-rank ${suitColor}">${card.rank}<br>${card.suit}</span>
    <span class="card-suit-center ${suitColor}">${card.suit}</span>
    <span class="card-rank-bottom ${suitColor}">${card.rank}<br>${card.suit}</span>
  </div>`;
}

// ═══════════════════════════════════════
// 动作播报
// ═══════════════════════════════════════

function showActionBroadcast(action, G) {
  const el = document.getElementById('battle-action-msg');
  if (!el) return;

  let msg = '';
  const attackerName = G.players?.[action.playerId]?.name || `玩家${action.playerId}`;
  const targetName = G.players?.[action.targetId]?.name || `玩家${action.targetId}`;

  switch (action.type) {
    case 'attack':
      msg = `⚔️ ${attackerName} → ${targetName} ${action.suit} ${action.amount}点 (实伤${action.actualDmg})${action.immune ? ' 免疫!' : ''}`;
      audioManager.play('attack');
      // ★ 出牌动画: 在 play-zone 中央渲染卡牌
      spawnPlayCard(action.suit, action.amount, attackerName);
      break;
    case 'shield':
      msg = `🛡️ ${attackerName} 获得 ${action.amount} 点护盾`;
      audioManager.play('shield');
      break;
    case 'jokerRevive':
      msg = `🃏 ${attackerName} 用 Joker 复活了 ${targetName}`;
      audioManager.play('joker');
      spawnPlayCard('🃏', 0, attackerName);
      break;
    case 'jokerExecute':
      msg = `💀 ${attackerName} 用双 Joker 斩杀了 ${targetName}`;
      audioManager.play('joker');
      spawnPlayCard('🃏🃏', 0, attackerName);
      break;
    case 'rescue':
      msg = `💖 ${attackerName} 用 Joker 救援了 ${targetName}`;
      audioManager.play('heal');
      break;
    case 'playerDied':
      msg = `💀 ${targetName} 已阵亡淘汰`;
      break;
    case 'starter':
      msg = `⚔️ ${attackerName} 选择了首发角色`;
      break;
    default:
      msg = '';
  }

  if (msg) {
    el.textContent = msg;
    el.style.animation = 'none';
    el.offsetHeight; // reflow
    el.style.animation = 'fadeIn 0.3s ease';
  }
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
    <span class="played-card-suit" style="color:${suitColor}">${suit}</span>
    <span class="played-card-value">${value}</span>
    <span class="played-card-name">${escapeHtml(playerName)}</span>
  `;
  dropTarget.appendChild(card);

  // 3 秒后自动清除
  setTimeout(() => {
    if (card.parentNode) card.remove();
  }, 3000);
}

// ═══════════════════════════════════════
// 阶段弹窗检查
// ═══════════════════════════════════════

function checkPhaseModals(G, ctx, renderSeq) {
  // 选将阶段
  if (G.phase === 'SELECTING_STARTER' && !app.getMyPlayer()?.starterSelected) {
    showStarterModal(G, renderSeq);
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
  p.characters?.forEach((c, i) => {
    if (c.isDead) return;
    const suitColor = (c.suit === '♦' || c.suit === '♥') ? 'var(--suit-red)' : 'var(--suit-black)';
    const card = document.createElement('div');
    card.className = 'starter-char-card';
    card.innerHTML = `
      <span class="char-suit-display" style="color:${suitColor}">${c.suit}</span>
      <span class="char-rank-display">${c.rank}</span>
      <span class="char-hp-display">❤️${c.hp}/${c.maxHp}</span>
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

  const target = G.players?.[G.dyingInfo.playerId];
  if (!target) return;

  if (!isCurrentRender(renderSeq)) return;

  const desc = document.getElementById('dying-desc');
  if (desc) desc.textContent = `${target.name} 的最后一个角色濒死！持有 Joker 的玩家可救援，${10}秒后死亡。`;

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
    if (p) {
      p.hand?.forEach((card, i) => {
        if (!card.isJoker) return;
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

// ═══════════════════════════════════════
// 工具
// ═══════════════════════════════════════

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showModal(id) { document.getElementById(id)?.classList.add('show'); }
function hideModal(id) { document.getElementById(id)?.classList.remove('show'); }
