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
// Neo-Brutalism SVG 图标集
// ═══════════════════════════════════════
const ICON = {
  play: '<svg class="nb-icon" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  door: '<svg class="nb-icon" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  check: '<svg class="nb-icon" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  clock: '<svg class="nb-icon" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  sparkle: '<svg class="nb-icon" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  trophy: '<svg class="nb-icon" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 6 9 6 9z"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 18 9 18 9z"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>',
  crown: '<svg class="nb-icon" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l3 12h14l4-12-4 5-3-3-5 5-5-5z"/></svg>',
  skull: '<svg class="nb-icon" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M3 12a9 9 0 1 1 18 0v4a2 2 0 0 1-2 2h-1a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1h2"/></svg>',
  star: '<svg class="nb-icon" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  search: '<svg class="nb-icon" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  check_green: '<svg class="nb-icon" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  cross_red: '<svg class="nb-icon" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  gold: '<svg class="nb-icon" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  silver: '<svg class="nb-icon" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  bronze: '<svg class="nb-icon" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
};

/** 统一主题入口 — 所有模块必须通过此函数切换主题 */
export function setTheme(isDark) {
  document.documentElement.classList.toggle('dark-theme', isDark);
  // 向后兼容 body.dark-mode (CSS 变量回退)
  if (isDark) document.body.classList.add('dark-mode');
  else document.body.classList.remove('dark-mode');
  localStorage.setItem('pokeWarDarkMode', isDark ? '1' : '0');
}

/** 初始化主题：从 localStorage 恢复 */
export function initTheme() {
  const isDark = localStorage.getItem('pokeWarDarkMode') === '1';
  setTheme(isDark);
}

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
    const isDark = !document.documentElement.classList.contains('dark-theme');
    setTheme(isDark);
  });

  // 恢复黑夜模式
  initTheme();

  document.getElementById('btn-edit-profile')?.addEventListener('click', () => {
    cs();
    document.getElementById('profile-name').value = app.playerName;
    showModal('modal-profile');
  });

  document.getElementById('btn-save-profile')?.addEventListener('click', () => {
    cs();
    const name = document.getElementById('profile-name')?.value?.trim() || '玩家';
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
      const formEl = document.getElementById('auth-form');
      const infoEl = document.getElementById('auth-user-info');
      const infoText = document.getElementById('auth-info-text');
      if (formEl) formEl.style.display = 'none';
      if (infoEl) infoEl.style.display = 'block';
      if (infoText) infoText.innerHTML = `${ICON.check} 已登录: ${app.playerName} (${app.isGuest ? '游客' : '正式用户'})`;
    } else {
      const formEl = document.getElementById('auth-form');
      const infoEl = document.getElementById('auth-user-info');
      if (formEl) formEl.style.display = 'block';
      if (infoEl) infoEl.style.display = 'none';
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
      app.wins = data.wins || 0;
      app.losses = data.losses || 0;
      app.matches = data.matches || 0;
      app.winRate = data.winRate || 0;
      app.rating = data.rating || 1000;
      localStorage.setItem('pokeWarToken', data.token);
      localStorage.setItem('pokeWarPlayerId', data.playerId);
      localStorage.setItem('pokeWarName', data.playerName);
      localStorage.setItem('pokeWarAvatar', data.avatar);
      localStorage.setItem('pokeWarIsLoggedIn', '1');
      localStorage.setItem('pokeWarIsGuest', '0');
      localStorage.setItem('pokeWarWins', app.wins);
      localStorage.setItem('pokeWarLosses', app.losses);
      localStorage.setItem('pokeWarMatches', app.matches);
      localStorage.setItem('pokeWarWinRate', app.winRate);
      localStorage.setItem('pokeWarRating', app.rating);
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
      app.wins = data.wins || 0;
      app.losses = data.losses || 0;
      app.matches = data.matches || 0;
      app.winRate = data.winRate || 0;
      app.rating = data.rating || 1000;
      localStorage.setItem('pokeWarToken', data.token);
      localStorage.setItem('pokeWarPlayerId', data.playerId);
      localStorage.setItem('pokeWarName', data.playerName);
      localStorage.setItem('pokeWarIsLoggedIn', '1');
      localStorage.setItem('pokeWarIsGuest', '0');
      localStorage.setItem('pokeWarWins', app.wins);
      localStorage.setItem('pokeWarLosses', app.losses);
      localStorage.setItem('pokeWarMatches', app.matches);
      localStorage.setItem('pokeWarWinRate', app.winRate);
      localStorage.setItem('pokeWarRating', app.rating);
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
    app.playerName = '玩家';
    app.wins = 0; app.losses = 0; app.matches = 0; app.winRate = 0; app.rating = 1000;
    localStorage.removeItem('pokeWarToken');
    localStorage.removeItem('pokeWarIsLoggedIn');
    localStorage.removeItem('pokeWarIsGuest');
    localStorage.removeItem('pokeWarWins');
    localStorage.removeItem('pokeWarLosses');
    localStorage.removeItem('pokeWarMatches');
    localStorage.removeItem('pokeWarWinRate');
    localStorage.removeItem('pokeWarRating');
    updateNavPlayerId();
    hideModal('modal-auth');
    Toast.show('已退出登录');
  });

  document.getElementById('btn-close-auth')?.addEventListener('click', () => hideModal('modal-auth'));

  // ── V7: Profile Badge + Edit Modal ──
  const savedAvatar = localStorage.getItem('pokeWarAvatar') || 'https://api.dicebear.com/7.x/micah/svg?seed=Felix';
  app.avatar = savedAvatar;

  // ★ 仅在已登录时恢复 playerName；未登录时保留 app.js 构造函数的默认值
  app.isLoggedIn = !!localStorage.getItem('pokeWarIsLoggedIn');
  app.isGuest = localStorage.getItem('pokeWarIsGuest') === 'true';
  if (app.isLoggedIn && localStorage.getItem('pokeWarPlayerId')) {
    app.playerId = localStorage.getItem('pokeWarPlayerId');
    app.playerName = localStorage.getItem('pokeWarName') || app.playerName;  // 仅登录用户恢复
  } else {
    // 未登录：使用 localStorage 中的名字（如果有手动设置过），否则保留默认
    app.playerName = localStorage.getItem('pokeWarName') || app.playerName;
  }
  // 恢复战绩
  app.wins = Number(localStorage.getItem('pokeWarWins')) || 0;
  app.losses = Number(localStorage.getItem('pokeWarLosses')) || 0;
  app.matches = Number(localStorage.getItem('pokeWarMatches')) || 0;
  app.winRate = Number(localStorage.getItem('pokeWarWinRate')) || 0;
  app.rating = Number(localStorage.getItem('pokeWarRating')) || 1000;

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
    const name = document.getElementById('profile-name')?.value?.trim() || '玩家';
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
      document.getElementById('btn-create-room').innerHTML = `${ICON.clock} 创建中...`;
      const data = await app.createVirtualRoom();
      app.roomCode = data.roomCode;
      switchToWaitingRoom(data.roomCode);
      startRoomPolling();
      Toast.show('房间创建成功! 邀请码: ' + data.roomCode, 'success');
    } catch (e) {
      Toast.show('创建失败: ' + e.message, 'error');
    } finally {
      document.getElementById('btn-create-room').innerHTML = '创建';
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
      switchToWaitingRoom(data.roomCode);
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
    app.playerName = document.getElementById('room-player-name')?.value?.trim() || '玩家';
    app.registerPlayer();

    btn.innerHTML = `${ICON.search} 匹配中...`;
    btn.classList.add('btn-matching');

    try {
      const result = await app.joinMatchmaking();
      btn.classList.remove('btn-matching');
      btn.innerHTML = '开始匹配';
      Toast.show(`匹配成功! 对手: ${result.opponent}`, 'success');
      app.matchID = result.matchID;
      showPage('waiting');
      renderWaitingLobby();
    } catch (e) {
      btn.classList.remove('btn-matching');
      btn.innerHTML = '开始匹配';
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
        const wins = data.user.wins || 0;
        const losses = data.user.losses || 0;
        const matches = data.user.matches || (wins + losses);
        const winRate = data.user.winRate || (matches > 0 ? Math.round((wins / matches) * 100) : 0);
        content.innerHTML = `
          <div class="bento-card" style="text-align:center;margin-bottom:12px">
            <img src="${data.user.avatar}" alt="" style="width:64px;height:64px;border-radius:12px;border:2px solid #000">
            <h3>${esc(data.user.name)}</h3>
            <div style="display:flex;gap:16px;justify-content:center;margin-top:8px">
              <span>${ICON.trophy} ${wins}胜</span>
              <span>${ICON.skull} ${losses}负</span>
              <span>${ICON.star} ${data.user.rating || 1000}分</span>
            </div>
            <div style="margin-top:6px;font-size:13px;font-weight:800;color:var(--text-muted)">
              ${ICON.play} 总场次: ${matches} &nbsp;|&nbsp; 胜率: ${winRate}%
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
    closeAllModals();
    showModal('modal-updates');
  });

  // 更新公告: 悬浮红叉关闭
  document.getElementById('btn-close-updates')?.addEventListener('click', () => {
    hideModal('modal-updates');
  });

  // 全局: 点击遮罩层关闭弹窗
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay') && e.target.classList.contains('show')) {
      e.target.classList.remove('show');
    }
  });

  // ── 加载在线人数 ──
  loadOnlineCount();
  setInterval(loadOnlineCount, 30000);

  // 恢复主题 — 统一通过 initTheme() (已在 initLobby 顶部调用, 此处不再重复)

  // 恢复昵称
  updateNavPlayerId();

  // 初始化 Badge UI
  updateBadgeUI();
}

// ═══════════════════════════════════════
// 渲染辅助
// ═══════════════════════════════════════

/** V7: 更新顶部 Badge UI */
function updateBadgeUI() {
  const badgeAvatar = document.getElementById('badge-avatar');
  const badgeName = document.getElementById('badge-name');
  if (badgeAvatar) badgeAvatar.src = app.avatar;
  if (badgeName) badgeName.textContent = app.playerName || '玩家';
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
    if (i === 0) { rankClass = 'gold'; rankIcon = ICON.gold; }
    else if (i === 1) { rankClass = 'silver'; rankIcon = ICON.silver; }
    else if (i === 2) { rankClass = 'bronze'; rankIcon = ICON.bronze; }
    return `<div class="leaderboard-row">
      <span class="leaderboard-rank ${rankClass}">${rankIcon}</span>
      <img src="${r.avatar}" alt="" style="width:28px;height:28px;border-radius:6px;border:2px solid #000">
      <span class="leaderboard-name">${esc(r.name)}</span>
      <span class="leaderboard-rating">⭐ ${r.rating}</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════
// V11: Waiting Room (SPA view switching)
// ═══════════════════════════════════════

let _roomPollTimer = null;

function switchToWaitingRoom(code) {
  const mainLobby = document.getElementById('main-lobby-view');
  const wr = document.getElementById('waiting-room-view');
  const codeEl = document.getElementById('wr-room-code');
  const btnStart = document.getElementById('btn-wr-start');
  const btnReady = document.getElementById('btn-wr-ready');
  const btnLeave = document.getElementById('btn-wr-leave');
  const btnChat = document.getElementById('btn-wr-chat-send');
  const chatInput = document.getElementById('wr-chat-input');

  // ★ 判空保护
  if (!mainLobby || !wr) { console.error('[WR] missing main-lobby-view or waiting-room-view'); return; }

  mainLobby.style.display = 'none';
  wr.style.display = 'flex';
  if (codeEl) codeEl.textContent = code;

  if (btnStart) { btnStart.style.display = app.isHost ? 'inline-block' : 'none'; }
  if (btnReady) { btnReady.style.display = app.isHost ? 'none' : 'inline-block'; }

  if (btnStart) btnStart.onclick = async () => {
    try {
      const data = await app.startRoom();
      stopRoomPolling();
      if (wr) wr.style.display = 'none';
      if (mainLobby) mainLobby.style.display = 'none';
      app.matchID = data.matchID;
      app.connectGame();
      showPage('game');
      Toast.show('游戏开始!', 'success');
    } catch (e) { Toast.show(e.message, 'error'); }
  };

  if (btnReady) btnReady.onclick = () => Toast.show('已准备!', 'success');

  if (btnLeave) btnLeave.onclick = () => {
    stopRoomPolling();
    if (wr) wr.style.display = 'none';
    if (mainLobby) mainLobby.style.display = 'flex';
    app.roomCode = null;
    Toast.show('已离开房间');
  };

  if (btnChat) btnChat.onclick = sendRoomChat;
  if (chatInput) chatInput.onkeydown = (e) => { if (e.key === 'Enter') sendRoomChat(); };

  // V12: 复制邀请码 (含降级兼容)
  const btnCopy = document.getElementById('btn-copy-room-code');
  if (btnCopy) btnCopy.onclick = () => {
    const codeEl = document.getElementById('wr-room-code');
    const code = codeEl?.textContent?.trim();
    if (!code || code === '----') return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(code).then(() => Toast.show(`${ICON.check} 邀请码已复制!`, 'success')).catch(() => {});
    } else {
      const ta = document.createElement('textarea');
      ta.value = code; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); Toast.show(`${ICON.check} 邀请码已复制!`, 'success'); }
      catch { Toast.show(`${ICON.cross_red} 复制失败`, 'error'); }
      ta.remove();
    }
  };
}

async function sendRoomChat() {
  const input = document.getElementById('wr-chat-input');
  const text = input?.value?.trim();
  if (!text || !app.roomCode) return;
  input.value = '';
  try {
    await fetch(`${app.getServerOrigin()}/api/room/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode: app.roomCode, playerId: app.playerId, playerName: app.playerName, text }),
    });
  } catch {}
}

function stopRoomPolling() {
  if (_roomPollTimer) { clearInterval(_roomPollTimer); _roomPollTimer = null; }
}

function startRoomPolling() {
  stopRoomPolling();
  _roomPollTimer = setInterval(async () => {
    try {
      const data = await app.getRoomStatus();
      if (!data) return;
      renderWRPlayers(data.players, data.host);
      if (data.messages) renderWRChat(data.messages);
    } catch {
      stopRoomPolling();
      const wrView = document.getElementById('waiting-room-view');
      const mainView = document.getElementById('main-lobby-view');
      if (wrView) wrView.style.display = 'none';
      if (mainView) mainView.style.display = 'flex';
      Toast.show('房间已解散', 'error');
    }
  }, 1000);
}

function renderWRPlayers(players, host) {
  const container = document.getElementById('player-slots-container');
  if (!container) return;

  // ★ 动态渲染: 按实际 maxPlayers 生成 slot, 上限 12
  const maxSlots = Math.max(4, players.length, app._roomMaxPlayers || 4);
  app._roomMaxPlayers = maxSlots; // 缓存, 后续 poll 复用
  const cols = maxSlots <= 4 ? 2 : maxSlots <= 6 ? 3 : 4;
  container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  let html = '';
  for (let i = 0; i < maxSlots; i++) {
    const p = players[i];
    if (p) {
      const isHost = p.id === host;
      const isReady = p.ready;
      const bg = isHost ? '#CCFF00' : isReady ? '#0057FF' : '#F4F4F0';
      const textColor = (isHost || isReady) ? '#FFF' : '#000';
      const borderStyle = (isHost || isReady) ? '3px solid #000' : '3px dashed #000';
      html += `<div class="wr-player-slot filled" style="background:${bg};color:${textColor};border:${borderStyle};padding:14px 10px">
        <img src="${esc(p.avatar)}" alt="" style="width:64px;height:64px;border-radius:14px;border:3px solid #000;object-fit:cover">
        <span style="font-size:14px;font-weight:800">${esc(p.name)}</span>
        ${isHost ? `<span style="font-size:11px;font-weight:900;background:#000;color:#CCFF00;padding:2px 8px;border-radius:4px">${ICON.crown} 房主</span>` : ''}
        <span style="font-size:12px;font-weight:700">${isReady ? `${ICON.check} 已准备` : `${ICON.clock} 等待`}</span>
      </div>`;
    } else {
      html += `<div class="wr-player-slot empty" style="min-height:120px">
        <span style="font-size:32px;color:var(--text-muted)">?</span>
        <span style="font-size:12px;color:var(--text-muted)">等待加入</span>
      </div>`;
    }
  }
  container.innerHTML = html;
}

let _lastChatCount = 0;
function renderWRChat(messages) {
  const container = document.getElementById('wr-chat-messages');
  if (!container) return;
  for (let i = _lastChatCount; i < messages.length; i++) {
    const m = messages[i];
    const div = document.createElement('div');
    div.style.cssText = 'margin-bottom:4px;padding:4px 6px;border-radius:6px;background:#F5F5F5;font-size:12px';
    div.innerHTML = `<b style="color:var(--accent-blue)">${esc(m.name)}:</b> ${esc(m.text)}`;
    container.appendChild(div);
  }
  _lastChatCount = messages.length;
  container.scrollTop = container.scrollHeight;
}

function esc(s) { return (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
