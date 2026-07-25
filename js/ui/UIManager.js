/**
 * UIManager.js — 纯视图渲染器 (MVC-V)
 *
 * 职责：
 *   1. 监听 app.js 状态变更 → 渲染 DOM
 *   2. 事件代理 → 将用户操作转发给 app.js
 *   3. 管理弹窗（选将/万化/濒死/指引）
 *
 * 绝不包含任何游戏逻辑。只做 DOM 操作。
 */
import { app } from '../app.js';
import { renderGameState } from './gameUI.js';
import { Toast } from './toast.js';
import { audioManager } from '../audioManager.js';
import { ICON } from './lobbyUI.js';

// ═══════════════════════════════════════
// 页面切换
// ═══════════════════════════════════════

export function showPage(name) {
  document.querySelectorAll('.page-view').forEach(el => el.classList.remove('active'));
  const page = document.getElementById(`page-${name}`);
  if (page) page.classList.add('active');
}

export function showModal(id) {
  document.getElementById(id)?.classList.add('show');
}
export function hideModal(id) {
  document.getElementById(id)?.classList.remove('show');
}

// ═══════════════════════════════════════
// Loading
// ═══════════════════════════════════════

export function showLoading() { document.getElementById('loading-overlay')?.classList.remove('hidden'); }
export function hideLoading() { document.getElementById('loading-overlay')?.classList.add('hidden'); }

// ═══════════════════════════════════════
// 初始化
// ═══════════════════════════════════════

export function initUI() {
  console.log('[UI] 初始化...');

  // ── 主页 ──
  initHomePage();
  // ── 等待大厅 ──
  initWaitingPage();
  // ── 游戏页面 ──
  initGamePage();
  // ── 通用 ──
  initFullscreenBtn();
  initTutorialModal();

  // ── 注册 app 状态监听 ──
  app.onStateChange(state => {
    renderGameState(state);
  });

  app.onError(err => {
    console.error('[UI] Error:', err);
    Toast.show(err.message || '发生错误', 'error');
  });

  app.onConnect(connected => {
    console.log('[UI] 连接:', connected);
    if (!connected) {
      document.getElementById('modal-disconnect')?.classList.add('show');
    } else {
      document.getElementById('modal-disconnect')?.classList.remove('show');
    }
  });

  // ── 恢复主题 — 统一由 main.js initTheme() 处理 ──
  console.log('[UI] 初始化完成 ✓');
}

// ═══════════════════════════════════════
// 主页
// ═══════════════════════════════════════

function initHomePage() {
  const clickSound = () => audioManager.play('click');

  // 头像选择
  const preview = document.getElementById('avatar-preview');
  const pickerDialog = document.getElementById('emoji-picker-dialog');
  const picker = document.getElementById('emoji-picker');

  preview?.addEventListener('click', () => pickerDialog?.classList.add('show'));
  picker?.addEventListener('emoji-click', (e) => {
    app.avatar = e.detail.unicode;
    if (preview) preview.textContent = app.avatar;
    pickerDialog?.classList.remove('show');
  });
  pickerDialog?.addEventListener('click', (e) => {
    if (e.target === pickerDialog) pickerDialog.classList.remove('show');
  });

  // 创建房间
  document.getElementById('btn-create-room')?.addEventListener('click', async () => {
    clickSound();
    app.playerName = document.getElementById('player-name')?.value?.trim() || app.playerName;
    showLoading();
    try {
      await app.createRoom(4);
      document.getElementById('display-room-code').textContent = app.matchID;
      const modeEl = document.getElementById('game-mode-selector');
      if (modeEl) modeEl.style.display = 'block';
      showPage('waiting');
      renderWaitingLobby();
      hideLoading();
      Toast.show('房间创建成功！快邀请小伙伴加入吧~ 🐾', 'success');
    } catch (e) {
      hideLoading();
      Toast.show('创建房间失败: ' + e.message, 'error');
    }
  });

  // 加入房间
  document.getElementById('btn-join-room')?.addEventListener('click', async () => {
    clickSound();
    app.playerName = document.getElementById('player-name')?.value?.trim() || app.playerName;
    const code = document.getElementById('room-code')?.value?.trim();
    if (!code || code.length !== 4) { Toast.show('请输入4位邀请码！', 'error'); return; }
    showLoading();
    try {
      await app.joinRoom(code);
      document.getElementById('display-room-code').textContent = code;
      showPage('waiting');
      renderWaitingLobby();
      hideLoading();
      Toast.show('成功加入房间！', 'success');
    } catch (e) {
      hideLoading();
      Toast.show('加入房间失败: ' + e.message, 'error');
    }
  });
}

// ═══════════════════════════════════════
// 等待大厅
// ═══════════════════════════════════════

function initWaitingPage() {
  const clickSound = () => audioManager.play('click');

  document.getElementById('btn-start-game')?.addEventListener('click', () => {
    clickSound();
    const modeRadio = document.querySelector('input[name="gameMode"]:checked');
    const maxLives = (modeRadio && modeRadio.value === 'quick') ? 1 : 3;
    // 连接游戏
    app.connectGame();
    showPage('game');
    Toast.show('⚔️ 对战开始！', 'success');
  });

  document.getElementById('btn-leave-waiting')?.addEventListener('click', () => {
    clickSound();
    app.disconnect();
    location.reload();
  });

  // 复制邀请码
  document.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('#btn-copy-code');
    if (!copyBtn) return;
    const el = document.getElementById('display-room-code');
    const code = el?.textContent?.trim();
    if (!code || code === '----') { Toast.show('请先生成邀请码', 'error'); return; }
    copyText(code).then(() => Toast.show('🐾 邀请码已复制！', 'success'))
      .catch(() => Toast.show('复制失败，请手动复制', 'error'));
  });
}

function renderWaitingLobby() {
  const grid = document.getElementById('players-grid');
  if (!grid) return;
  grid.innerHTML = `<div class="player-card">
    <img src="${app.avatar}" alt="avatar" class="player-avatar" style="width:64px;height:64px;border-radius:14px;border:3px solid #000;object-fit:cover">
    <div>
      <div class="player-name">${escapeHtml(app.playerName)} (你)</div>
      <div class="player-status ready">${ICON.check_green} 已准备</div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════
// 游戏页面
// ═══════════════════════════════════════

function initGamePage() {
  const clickSound = () => audioManager.play('click');

  // 万化按钮
  document.getElementById('btn-wanhua')?.addEventListener('click', () => {
    clickSound();
    openWanhuaModal();
  });

  // 确定出牌
  document.getElementById('btn-confirm')?.addEventListener('click', () => {
    clickSound();
    executePlay();
  });

  // 取消
  document.getElementById('btn-cancel')?.addEventListener('click', () => {
    clickSound();
    clearSelection();
  });

  // 手牌区 — 事件代理
  document.getElementById('hand-area')?.addEventListener('click', (e) => {
    const card = e.target.closest('.poker-card');
    if (!card) return;
    handleCardClick(card);
  });

  // 对手区 — 事件代理
  document.getElementById('opponents-area')?.addEventListener('click', (e) => {
    const mini = e.target.closest('.opponent-mini.targetable');
    if (!mini) return;
    handleOpponentClick(mini);
  });

  // 聊天
  document.getElementById('btn-game-chat-send')?.addEventListener('click', () => {
    clickSound();
    sendGameChat();
  });
  document.getElementById('game-chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendGameChat();
  });

  // 再来一局 / 退出
  document.getElementById('btn-restart')?.addEventListener('click', () => { clickSound(); location.reload(); });
  document.getElementById('btn-leave-room')?.addEventListener('click', () => { clickSound(); app.disconnect(); location.reload(); });

  // 断线弹窗
  document.getElementById('btn-modal-ok')?.addEventListener('click', () => location.reload());

  // ── 万化弹窗 ──
  document.getElementById('wanhua-cancel-btn')?.addEventListener('click', () => {
    clickSound();
    hideModal('wanhua-modal');
  });
  document.getElementById('wanhua-confirm-btn')?.addEventListener('click', () => {
    clickSound();
    confirmWanhua();
  });
}

// ═══════════════════════════════════════
// 手牌交互
// ═══════════════════════════════════════

let selectedCardIndices = [];
let selectedTargetId = null;
let declaredSuit = null;
let pendingWanhuaCards = [];

function handleCardClick(cardEl) {
  audioManager.play('select');
  const idx = parseInt(cardEl.dataset.index);
  if (isNaN(idx)) return;

  // 不可用的牌不响应
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

function updateActionButtons() {
  const hasCards = selectedCardIndices.length > 0;
  const hasTarget = selectedTargetId !== null || hasShieldCards();
  const panel = document.getElementById('floating-actions');

  if (!panel) return;

  const confirmBtn = document.getElementById('btn-confirm');
  const cancelBtn = document.getElementById('btn-cancel');
  const wanhuaBtn = document.getElementById('btn-wanhua');

  if (hasCards) {
    cancelBtn?.classList.remove('hidden');

    // 检查是否需要万化选择
    if (needsWanhua()) {
      if (wanhuaBtn) wanhuaBtn.style.display = 'inline-block';
      confirmBtn?.classList.add('hidden');
    } else {
      if (wanhuaBtn) wanhuaBtn.style.display = 'none';
      confirmBtn?.classList.remove('hidden');
    }
  } else {
    confirmBtn?.classList.add('hidden');
    cancelBtn?.classList.add('hidden');
    if (wanhuaBtn) wanhuaBtn.style.display = 'none';
  }
}

function hasShieldCards() {
  const cards = selectedCardIndices.map(i => {
    const el = document.querySelector(`.poker-card[data-index="${i}"]`);
    return el ? el.dataset.suit : null;
  }).filter(Boolean);
  return cards.length > 0 && cards.every(s => s === '♣');
}

function needsWanhua() {
  const cards = selectedCardIndices.map(i => {
    const el = document.querySelector(`.poker-card[data-index="${i}"]`);
    return { rank: el?.dataset.rank, isJoker: el?.dataset.isJoker === 'true' };
  }).filter(c => c.rank);
  const hasA = cards.some(c => c.rank === 'A');
  const nonJokers = cards.filter(c => !c.isJoker);
  return hasA && nonJokers.length >= 1 && !declaredSuit;
}

function clearSelection() {
  document.querySelectorAll('#hand-area .poker-card.selected').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.opponent-mini.targeted').forEach(el => el.classList.remove('targeted'));
  selectedCardIndices = [];
  selectedTargetId = null;
  declaredSuit = null;
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
      return;
    }
    app.playCards(selectedCardIndices, selectedTargetId, declaredSuit);
  }

  clearSelection();
}

// ═══════════════════════════════════════
// 万化弹窗
// ═══════════════════════════════════════

function openWanhuaModal() {
  // 收集可选花色
  const suits = new Set();
  selectedCardIndices.forEach(i => {
    const el = document.querySelector(`.poker-card[data-index="${i}"]`);
    const suit = el?.dataset.suit;
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
  // 显示确定按钮（万化花色已选）
  const wanhuaBtn = document.getElementById('btn-wanhua');
  if (wanhuaBtn) wanhuaBtn.style.display = 'none';
  const confirmBtn = document.getElementById('btn-confirm');
  if (confirmBtn) confirmBtn.classList.remove('hidden');
}

// ═══════════════════════════════════════
// 游戏聊天
// ═══════════════════════════════════════

function sendGameChat() {
  const input = document.getElementById('game-chat-input');
  const text = input?.value?.trim();
  if (!text) return;
  input.value = '';

  const container = document.getElementById('game-chat-messages');
  if (container) {
    const msg = document.createElement('div');
    msg.className = 'chat-msg self';
    msg.innerHTML = `<b>${app.playerName}:</b> ${escapeHtml(text)}`;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ═══════════════════════════════════════
// 工具
// ═══════════════════════════════════════

function initFullscreenBtn() {
  const btn = document.getElementById('btn-fullscreen');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.() || document.documentElement.webkitRequestFullscreen?.();
    } else {
      document.exitFullscreen?.() || document.webkitExitFullscreen?.();
    }
  });
  document.addEventListener('fullscreenchange', () => {
    if (btn) btn.textContent = document.fullscreenElement ? '🔳' : '🔲';
  });
}

function initTutorialModal() {
  const close = () => hideModal('modal-tutorial');
  document.getElementById('btn-show-tutorial')?.addEventListener('click', () => { audioManager.play('click'); showModal('modal-tutorial'); });
  document.getElementById('btn-tutorial-ok')?.addEventListener('click', () => { audioManager.play('click'); close(); });
  document.getElementById('btn-game-tutorial')?.addEventListener('click', () => { audioManager.play('click'); showModal('modal-tutorial'); });
}

function copyText(str) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(str);
  }
  const ta = document.createElement('textarea');
  ta.value = str; ta.style.position = 'fixed'; ta.style.left = '-9999px';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); return Promise.resolve(); }
  finally { document.body.removeChild(ta); }
}

// 导出供外部使用
export { selectedCardIndices, selectedTargetId, declaredSuit, clearSelection };
