/**
 * lobbyUI.js — V4 大厅视图控制器
 *
 * 职责:
 *   1. 渲染 Bento Grid 大厅 DOM
 *   2. 处理大厅交互 (创建/加入/匹配/排行榜/战绩/规则)
 *   3. 调用 app.js API 方法获取数据
 */
import { app } from '../app.js';
import { Toast } from './toast.js';
import { audioManager } from '../audioManager.js';

// ═══════════════════════════════════════
// 页面切换
// ═══════════════════════════════════════

export function showPage(name) {
  document.querySelectorAll('.page-view').forEach(el => el.classList.remove('active'));
  const page = document.getElementById(`page-${name}`);
  if (page) page.classList.add('active');
}

function showModal(id) { document.getElementById(id)?.classList.add('show'); }
function hideModal(id) { document.getElementById(id)?.classList.remove('show'); }
/** V8: 关闭所有弹窗 */
function closeAllModals() {
  document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
}

// ═══════════════════════════════════════
// 初始化大厅
// ═══════════════════════════════════════

export function initLobby() {
  console.log('[Lobby] 初始化大厅 UI');

  const cs = () => audioManager.play('click');

  // ── TopNav ──
  document.getElementById('btn-toggle-theme')?.addEventListener('click', () => {
    cs();
    const cur = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', cur === 'dark' ? '' : 'dark');
    localStorage.setItem('pokeWarTheme', cur === 'dark' ? '' : 'dark');
  });

  document.getElementById('btn-edit-profile')?.addEventListener('click', () => {
    cs();
    document.getElementById('profile-name').value = app.playerName;
    showModal('modal-profile');
  });

  document.getElementById('btn-save-profile')?.addEventListener('click', () => {
    cs();
    const name = document.getElementById('profile-name')?.value?.trim() || '小猫猫';
    app.playerName = name;
    updateNavPlayerId();
    hideModal('modal-profile');
    // 注册/更新用户
    app.registerPlayer();
    Toast.show('昵称已更新: ' + name, 'success');
  });

  document.getElementById('btn-close-profile')?.addEventListener('click', () => hideModal('modal-profile'));

  // ── V6: Auth system (通过 Badge 点击或独立按钮触发) ──
  const openAuth = () => {
    if (app.isLoggedIn) {
      document.getElementById('auth-form').style.display = 'none';
      document.getElementById('auth-user-info').style.display = 'block';
      document.getElementById('auth-info-text').textContent = `✅ 已登录: ${app.playerName} (${app.isGuest ? '游客' : '正式用户'})`;
    } else {
      document.getElementById('auth-form').style.display = 'block';
      document.getElementById('auth-user-info').style.display = 'none';
    }
    closeAllModals();
    showModal('modal-auth');
  };
  // 点击 profile-badge (不含按钮区域) → 打开 Auth
  document.getElementById('profile-badge')?.addEventListener('click', (e) => {
    if (e.target.closest('button')) return; // 不拦截按钮点击
    cs(); openAuth();
  });

  document.getElementById('btn-auth-login')?.addEventListener('click', async () => {
    const username = document.getElementById('auth-username')?.value?.trim();
    const password = document.getElementById('auth-password')?.value?.trim();
    if (!username || !password) { Toast.show('请输入用户名和密码', 'error'); return; }
    try {
      const res = await fetch(`${app.getServerOrigin()}/api/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) { const e = await res.json(); Toast.show(e.error, 'error'); return; }
      const data = await res.json();
      app.playerId = data.playerId; app.playerName = data.playerName; app.avatar = data.avatar;
      app.jwtToken = data.token; app.isLoggedIn = true; app.isGuest = false;
      localStorage.setItem('pokeWarToken', data.token);
      localStorage.setItem('pokeWarPlayerId', data.playerId);
      localStorage.setItem('pokeWarName', data.playerName);
      localStorage.setItem('pokeWarAvatar', data.avatar);
      localStorage.setItem('pokeWarIsLoggedIn', '1');
      localStorage.setItem('pokeWarIsGuest', '0');
      updateNavPlayerId();
      updateProfileUI();
      hideModal('modal-auth');
      Toast.show('登录成功! ' + data.playerName, 'success');
    } catch (e) { Toast.show('登录失败', 'error'); }
  });

  document.getElementById('btn-auth-register')?.addEventListener('click', async () => {
    const username = document.getElementById('auth-username')?.value?.trim();
    const password = document.getElementById('auth-password')?.value?.trim();
    if (!username || !password) { Toast.show('请输入用户名和密码', 'error'); return; }
    try {
      const res = await fetch(`${app.getServerOrigin()}/api/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, avatar: app.avatar }),
      });
      if (!res.ok) { const e = await res.json(); Toast.show(e.error, 'error'); return; }
      const data = await res.json();
      app.playerId = data.playerId; app.playerName = data.playerName;
      app.jwtToken = data.token; app.isLoggedIn = true; app.isGuest = false;
      localStorage.setItem('pokeWarToken', data.token);
      localStorage.setItem('pokeWarPlayerId', data.playerId);
      localStorage.setItem('pokeWarName', data.playerName);
      localStorage.setItem('pokeWarIsLoggedIn', '1');
      localStorage.setItem('pokeWarIsGuest', '0');
      updateNavPlayerId();
      updateProfileUI();
      hideModal('modal-auth');
      Toast.show('注册成功! ' + data.playerName, 'success');
    } catch (e) { Toast.show('注册失败', 'error'); }
  });

  document.getElementById('btn-auth-guest')?.addEventListener('click', async () => {
    try {
      const res = await fetch(`${app.getServerOrigin()}/api/guest`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName: app.playerName, avatar: app.avatar }),
      });
      if (!res.ok) { Toast.show('游客登录失败', 'error'); return; }
      const data = await res.json();
      app.playerId = data.playerId; app.playerName = data.playerName;
      app.jwtToken = data.token; app.isLoggedIn = true; app.isGuest = true;
      localStorage.setItem('pokeWarToken', data.token);
      localStorage.setItem('pokeWarPlayerId', data.playerId);
      localStorage.setItem('pokeWarName', data.playerName);
      localStorage.setItem('pokeWarIsLoggedIn', '1');
      localStorage.setItem('pokeWarIsGuest', '1');
      updateNavPlayerId();
      updateProfileUI();
      hideModal('modal-auth');
      Toast.show('游客模式 (不保存战绩)', 'success');
    } catch (e) { Toast.show('游客登录失败', 'error'); }
  });

  document.getElementById('btn-auth-logout')?.addEventListener('click', () => {
    app.jwtToken = null; app.isLoggedIn = false; app.isGuest = false;
    app.playerName = '小猫猫';
    localStorage.removeItem('pokeWarToken');
    localStorage.removeItem('pokeWarIsLoggedIn');
    localStorage.removeItem('pokeWarIsGuest');
    updateNavPlayerId();
    hideModal('modal-auth');
    Toast.show('已退出登录');
  });

  document.getElementById('btn-close-auth')?.addEventListener('click', () => hideModal('modal-auth'));

  // ── V7: Profile Badge + Edit Modal ──
  const savedAvatar = localStorage.getItem('pokeWarAvatar') || 'https://api.dicebear.com/7.x/micah/svg?seed=Felix';
  const savedName = localStorage.getItem('pokeWarName') || '小猫猫';
  app.avatar = savedAvatar;
  app.playerName = savedName;
  updateBadgeUI();

  app.isLoggedIn = !!localStorage.getItem('pokeWarIsLoggedIn');
  app.isGuest = localStorage.getItem('pokeWarIsGuest') === 'true';
  if (app.isLoggedIn && localStorage.getItem('pokeWarPlayerId')) {
    app.playerId = localStorage.getItem('pokeWarPlayerId');
  }

  // ── 编辑按钮 → 打开 Profile Modal ──
  // ── V7: Profile Badge click → 打开 Profile Modal (原 auth 已迁移至 modal-profile) ──
  document.getElementById('btn-edit-profile')?.addEventListener('click', (e) => {
    e.stopPropagation(); // ★ 防止冒泡触发 badge 外层
    cs();
    closeAllModals();
    document.getElementById('profile-name').value = app.playerName;
    const sel = document.querySelector(`.avatar-option[data-avatar="${CSS.escape(app.avatar)}"]`);
    document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
    if (sel) sel.classList.add('selected');
    showModal('modal-profile');
  });

  // Profile Modal: 头像选择
  document.getElementById('avatar-selector')?.addEventListener('click', (e) => {
    const opt = e.target.closest('.avatar-option');
    if (!opt) return;
    document.querySelectorAll('#avatar-selector .avatar-option').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
    document.getElementById('custom-avatar-url').value = '';
    cs();
  });

  // Profile Modal: 自定义 URL
  document.getElementById('custom-avatar-url')?.addEventListener('input', () => {
    const url = document.getElementById('custom-avatar-url').value.trim();
    if (url && url.startsWith('http')) {
      document.querySelectorAll('#avatar-selector .avatar-option').forEach(o => o.classList.remove('selected'));
    }
  });

  // Profile Modal: 保存
  document.getElementById('btn-save-profile')?.addEventListener('click', () => {
    cs();
    const name = document.getElementById('profile-name')?.value?.trim() || '小猫猫';
    const customUrl = document.getElementById('custom-avatar-url')?.value?.trim();
    const selectedAvatar = document.querySelector('#avatar-selector .avatar-option.selected');
    const avatar = (customUrl && customUrl.startsWith('http')) ? customUrl
      : (selectedAvatar?.dataset.avatar || savedAvatar);

    app.playerName = name;
    app.avatar = avatar;
    localStorage.setItem('pokeWarName', name);
    localStorage.setItem('pokeWarAvatar', avatar);
    updateBadgeUI();
    hideModal('modal-profile');
    app.registerPlayer();
    Toast.show('资料已保存!', 'success');
  });

  document.getElementById('btn-close-profile')?.addEventListener('click', () => hideModal('modal-profile'));

  // ── V9: 创建虚拟房间 ──
  document.getElementById('btn-create-room')?.addEventListener('click', async () => {
    cs();
    try {
      document.getElementById('btn-create-room').textContent = '⏳ 创建中...';
      const data = await app.createVirtualRoom();
      app.roomCode = data.roomCode;
      showWaitingRoom(data.roomCode);
      startRoomPolling();
      Toast.show('房间创建成功! 邀请码: ' + data.roomCode, 'success');
    } catch (e) {
      Toast.show('创建失败: ' + e.message, 'error');
    } finally {
      document.getElementById('btn-create-room').textContent = '创建';
    }
  });

  // ── V9: 加入虚拟房间 ──
  document.getElementById('btn-join-room')?.addEventListener('click', async () => {
    cs();
    const code = document.getElementById('room-code')?.value?.trim();
    if (!code || code.length !== 4) { Toast.show('请输入4位邀请码', 'error'); return; }
    try {
      const data = await app.joinVirtualRoom(code);
      app.roomCode = data.roomCode;
      showWaitingRoom(data.roomCode);
      startRoomPolling();
      Toast.show('加入成功!', 'success');
    } catch (e) {
      Toast.show('加入失败: ' + e.message, 'error');
    }
  });

  // ── 快速匹配 ──
  document.getElementById('btn-quick-match')?.addEventListener('click', async () => {
    cs();
    const btn = document.getElementById('btn-quick-match');
    if (btn.classList.contains('btn-matching')) return; // 防连点
    app.playerName = document.getElementById('room-player-name')?.value?.trim() || '小猫猫';
    app.registerPlayer();

    btn.textContent = '🔍 匹配中...';
    btn.classList.add('btn-matching');

    try {
      const result = await app.joinMatchmaking();
      btn.classList.remove('btn-matching');
      btn.textContent = '开始匹配';
      Toast.show(`匹配成功! 对手: ${result.opponent}`, 'success');
      app.matchID = result.matchID;
      showPage('waiting');
      renderWaitingLobby();
    } catch (e) {
      btn.classList.remove('btn-matching');
      btn.textContent = '开始匹配';
      Toast.show('匹配失败: ' + e.message, 'error');
    }
  });

  // ── 排行榜 ──
  document.getElementById('btn-leaderboard')?.addEventListener('click', async () => {
    cs();
    showModal('modal-leaderboard');
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '<div style="text-align:center;color:var(--text-muted)">加载中...</div>';
    try {
      const data = await app.fetchLeaderboard();
      renderLeaderboard(data.leaderboard || []);
    } catch (e) {
      list.innerHTML = '<div style="text-align:center;color:var(--color-danger)">加载失败</div>';
    }
  });
  document.getElementById('btn-close-leaderboard')?.addEventListener('click', () => hideModal('modal-leaderboard'));

  // ── 规则 ──
  document.getElementById('btn-rules')?.addEventListener('click', () => { cs(); showModal('modal-tutorial'); });

  // ── 个人战绩 ──
  document.getElementById('btn-my-stats')?.addEventListener('click', async () => {
    cs();
    showModal('modal-stats');
    const content = document.getElementById('stats-content');
    content.innerHTML = '<div style="text-align:center;color:var(--text-muted)">加载中...</div>';
    try {
      const data = await app.fetchStats(app.playerId);
      if (data.user) {
        content.innerHTML = `
          <div class="bento-card" style="text-align:center;margin-bottom:12px">
            <span style="font-size:36px">${data.user.avatar}</span>
            <h3>${esc(data.user.name)}</h3>
            <div style="display:flex;gap:20px;justify-content:center;margin-top:8px">
              <span>🏆 ${data.user.wins}胜</span>
              <span>💀 ${data.user.losses}负</span>
              <span>⭐ ${data.user.rating}分</span>
            </div>
          </div>
          <p style="color:var(--text-muted);font-size:13px;margin-bottom:8px">最近 20 场:</p>
          ${(data.history || []).map(h => `
            <div class="leaderboard-row">
              <span>${h.result === 'win' ? '🟢' : h.result === 'loss' ? '🔴' : '⚪'}</span>
              <span class="leaderboard-name">${h.result} (${h.ratingChange > 0 ? '+' : ''}${h.ratingChange})</span>
            </div>
          `).join('') || '<p style="color:var(--text-muted)">暂无记录</p>'}
        `;
      } else {
        content.innerHTML = '<p style="color:var(--text-muted);text-align:center">请先进行一场对局</p>';
      }
    } catch (e) {
      content.innerHTML = '<div style="text-align:center;color:var(--color-danger)">加载失败</div>';
    }
  });
  document.getElementById('btn-close-stats')?.addEventListener('click', () => hideModal('modal-stats'));

  // ── 更新公告 ──
  document.getElementById('btn-updates')?.addEventListener('click', () => {
    cs();
    Toast.show('V8: Neo-Brutalism · JWT Auth · Lucide Icons · SQLite', 'success');
  });

  // ── 加载在线人数 ──
  loadOnlineCount();
  setInterval(loadOnlineCount, 30000);

  // 恢复主题
  const saved = localStorage.getItem('pokeWarTheme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);

  // 恢复昵称
  updateNavPlayerId();
}

// ═══════════════════════════════════════
// 渲染辅助
// ═══════════════════════════════════════

/** V7: 更新顶部 Badge UI */
function updateBadgeUI() {
  const badgeAvatar = document.getElementById('badge-avatar');
  const badgeName = document.getElementById('badge-name');
  if (badgeAvatar) badgeAvatar.src = app.avatar;
  if (badgeName) badgeName.textContent = app.playerName || '小猫猫';
}

/** 旧兼容 */
function updateNavPlayerId() {
  updateBadgeUI();
}

/** V6: 更新 profile UI (头像预览 + 昵称输入) */
function updateProfileUI() {
  const preview = document.getElementById('avatar-preview');
  const nameInput = document.getElementById('player-name-input');
  if (preview) preview.src = app.avatar;
  if (nameInput) nameInput.value = app.playerName;
}

async function loadOnlineCount() {
  try {
    const res = await fetch(`${app.getServerOrigin()}/api/online`);
    const data = await res.json();
    document.getElementById('online-count').textContent = data.online || '--';
    document.getElementById('matches-today').textContent = '--'; // TODO: real count
  } catch (e) { /* ignore */ }
}

function renderLeaderboard(rows) {
  const list = document.getElementById('leaderboard-list');
  if (!list) return;
  if (!rows.length) { list.innerHTML = '<p style="color:var(--text-muted);text-align:center">暂无数据</p>'; return; }

  list.innerHTML = rows.map((r, i) => {
    let rankClass = '';
    let rankIcon = String(i + 1);
    if (i === 0) { rankClass = 'gold'; rankIcon = '🥇'; }
    else if (i === 1) { rankClass = 'silver'; rankIcon = '🥈'; }
    else if (i === 2) { rankClass = 'bronze'; rankIcon = '🥉'; }
    return `<div class="leaderboard-row">
      <span class="leaderboard-rank ${rankClass}">${rankIcon}</span>
      <span>${r.avatar || '🐱'}</span>
      <span class="leaderboard-name">${esc(r.name)}</span>
      <span class="leaderboard-rating">⭐ ${r.rating}</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════
// V9: Waiting Room
// ═══════════════════════════════════════

let _roomPollTimer = null;

function showWaitingRoom(code) {
  const wr = document.getElementById('waiting-room');
  const codeEl = document.getElementById('wr-room-code');
  if (wr) wr.style.display = 'block';
  if (codeEl) codeEl.textContent = code;

  // 按钮显示
  document.getElementById('btn-wr-start').style.display = app.isHost ? 'inline-block' : 'none';
  document.getElementById('btn-wr-ready').style.display = app.isHost ? 'none' : 'inline-block';

  // 开始游戏 (房主)
  document.getElementById('btn-wr-start').onclick = async () => {
    try {
      const data = await app.startRoom();
      if (_roomPollTimer) clearInterval(_roomPollTimer);
      document.getElementById('waiting-room').style.display = 'none';
      app.matchID = data.matchID;
      app.connectGame();
      Toast.show('游戏开始!', 'success');
    } catch (e) { Toast.show(e.message, 'error'); }
  };

  // 准备按钮
  document.getElementById('btn-wr-ready').onclick = () => {
    Toast.show('已准备! (等待房主开始)', 'success');
  };

  // 离开
  document.getElementById('btn-wr-leave').onclick = () => {
    if (_roomPollTimer) clearInterval(_roomPollTimer);
    document.getElementById('waiting-room').style.display = 'none';
    app.roomCode = null;
    Toast.show('已离开房间');
  };
}

function startRoomPolling() {
  if (_roomPollTimer) clearInterval(_roomPollTimer);
  _roomPollTimer = setInterval(async () => {
    try {
      const data = await app.getRoomStatus();
      renderWRPlayers(data.players, data.host);
    } catch {
      if (_roomPollTimer) clearInterval(_roomPollTimer);
      document.getElementById('waiting-room').style.display = 'none';
      Toast.show('房间已解散', 'error');
    }
  }, 2000);
}

function renderWRPlayers(players, host) {
  const container = document.getElementById('wr-players');
  if (!container) return;
  let html = '';
  for (let i = 0; i < 4; i++) {
    const p = players[i];
    if (p) {
      html += `<div class="wr-player-slot filled">
        <img src="${p.avatar}" alt="" style="width:40px;height:40px;border-radius:8px;border:2px solid #000">
        <span style="font-size:12px;font-weight:800">${esc(p.name)}</span>
        ${p.id === host ? '<span style="font-size:10px;color:var(--accent-green)">👑房主</span>' : ''}
        <span style="font-size:10px">${p.ready ? '✅' : '⏳'}</span>
      </div>`;
    } else {
      html += `<div class="wr-player-slot empty">
        <span style="font-size:24px;color:var(--text-muted)">?</span>
        <span style="font-size:11px;color:var(--text-muted)">等待加入</span>
      </div>`;
    }
  }
  container.innerHTML = html;
}

function esc(s) { return (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
