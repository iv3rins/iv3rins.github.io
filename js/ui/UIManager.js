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
import { renderGameState, initGamePageEvents, clearSelection, selectedCardIndices, selectedTargetId, declaredSuit } from './gameUI.js';
import { Toast } from './toast.js';
import { audioManager } from '../audioManager.js';
import { ICON, showPage, showModal, hideModal } from './lobbyUI.js';

// ★ 重新导出，供 main.js 使用
export { showPage, showModal, hideModal };

// ★ 游戏页事件清理句柄
let _gamePageCleanup = null;

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
  // ★ 使用 gameUI.js 的统一事件初始化（含 cleanup 句柄）
  _gamePageCleanup = initGamePageEvents();

  // 聊天系统事件
  document.getElementById('btn-game-chat-send')?.addEventListener('click', () => {
    audioManager.play('click');
    sendGameChat();
  });
  document.getElementById('game-chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendGameChat();
  });

  // 断线弹窗
  document.getElementById('btn-modal-ok')?.addEventListener('click', () => location.reload());
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

// 导出供外部使用（已移至 gameUI.js）
export { selectedCardIndices, selectedTargetId, declaredSuit, clearSelection };
