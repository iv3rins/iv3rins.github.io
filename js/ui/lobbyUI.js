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

  // ── V5: Avatar Selector ──
  const avatarSelector = document.getElementById('avatar-selector');
  const avatarPreview = document.getElementById('avatar-preview');
  const nameInput = document.getElementById('player-name-input');

  // 从 localStorage 恢复
  const savedAvatar = localStorage.getItem('pokeWarAvatar') || '🐱';
  const savedName = localStorage.getItem('pokeWarName') || '小猫猫';
  app.avatar = savedAvatar;
  app.playerName = savedName;
  if (nameInput) nameInput.value = savedName;
  if (avatarPreview) avatarPreview.textContent = savedAvatar;
  updateNavPlayerId();

  // 头像点击
  avatarSelector?.addEventListener('click', (e) => {
    const opt = e.target.closest('.avatar-option');
    if (!opt) return;
    avatarSelector.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
    const avatar = opt.dataset.avatar;
    app.avatar = avatar;
    localStorage.setItem('pokeWarAvatar', avatar);
    if (avatarPreview) avatarPreview.textContent = avatar;
    cs();
  });

  // 昵称自动保存
  nameInput?.addEventListener('input', () => {
    const name = nameInput.value.trim() || '小猫猫';
    app.playerName = name;
    localStorage.setItem('pokeWarName', name);
    updateNavPlayerId();
  });

  // ── 创建房间 ──
  const cardCreate = document.getElementById('card-create-room');
  cardCreate?.addEventListener('click', (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    const opts = document.getElementById('create-room-options');
    opts.style.display = opts.style.display === 'none' ? 'flex' : 'none';
  });

  document.getElementById('btn-create-room')?.addEventListener('click', async () => {
    cs();
    const name = document.getElementById('room-player-name')?.value?.trim() || '小猫猫';
    app.playerName = name;
    updateNavPlayerId();
    app.registerPlayer();
    try {
      document.getElementById('btn-create-room').textContent = '⏳ 创建中...';
      await app.createRoom(4);
      document.getElementById('display-room-code').textContent = app.matchID;
      showPage('waiting');
      renderWaitingLobby();
      Toast.show('房间创建成功!', 'success');
    } catch (e) {
      Toast.show('创建失败: ' + e.message, 'error');
    } finally {
      document.getElementById('btn-create-room').textContent = '✨ 创建';
    }
  });

  // ── 加入房间 ──
  document.getElementById('btn-join-room')?.addEventListener('click', async () => {
    cs();
    const code = document.getElementById('room-code')?.value?.trim();
    if (!code || code.length !== 4) { Toast.show('请输入4位邀请码', 'error'); return; }
    app.playerName = document.getElementById('room-player-name')?.value?.trim() || '小猫猫';
    app.registerPlayer();
    try {
      await app.joinRoom(code);
      document.getElementById('display-room-code').textContent = code;
      showPage('waiting');
      renderWaitingLobby();
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
    Toast.show('V4: Bento Grid 大厅 · 排行榜 · 快速匹配 · SQLite 数据库', 'success');
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

function updateNavPlayerId() {
  const el = document.getElementById('nav-player-id');
  if (el) el.textContent = app.playerId || app.playerName || '未登录';
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

export function renderWaitingLobby() {
  const grid = document.getElementById('players-grid');
  if (!grid) return;
  grid.innerHTML = `<div class="player-card">
    <span class="player-avatar">${app.avatar}</span>
    <div><div class="player-name">${app.playerName} (你)</div><div class="player-status ready">✅</div></div>
  </div>`;
}

function esc(s) { return (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
