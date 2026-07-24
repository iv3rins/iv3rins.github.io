/**
 * lobbyUI — 大厅与玩家列表渲染
 */
import { G } from '../state.js';

export function showPage(pageId) {
    document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));
    const el = document.getElementById('page-' + pageId);
    if (el) el.classList.add('active');
}

export function showModal(text) {
    document.getElementById('modal-disconnect-text').textContent = text;
    document.getElementById('modal-disconnect').classList.add('show');
}

export function renderWaitingLobby() {
    const grid = document.getElementById('players-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // ★ 防御：从 ROOM_UPDATE 解析玩家（可能是对象而非数组）
    const playerNames = G.playerNames || {};
    const playerReady = G.playerReady || {};
    const playerAvatars = G.playerAvatars || {};
    const indices = Object.keys(playerNames).map(Number).sort((a, b) => a - b);
    const totalPlayers = indices.length;

    indices.forEach(i => {
        const name = playerNames[i] || ('玩家' + (i + 1));
        const isHostSlot = i === 0;
        const isMe = i === G.myPlayerId;
        const avatar = playerAvatars[i] || G.avatars[i % G.avatars.length];
        const isReady = !!playerReady[i];
        const slot = document.createElement('div');
        slot.className = 'player-slot occupied';
        if (isHostSlot) slot.classList.add('host');
        slot.innerHTML = `
            ${isHostSlot
                ? '<div class="status-badge host-badge">👑 房主</div>'
                : `<div class="status-badge">${isReady ? '已准备' : '未准备'}</div>`}
            <div class="avatar cute-bounce">${avatar}</div>
            <div class="name">${name}${isMe ? ' (你)' : ''}</div>
        `;
        grid.appendChild(slot);
    });

    // 空座位占位（补至至少 4 个视觉槽位）
    const emptySlots = Math.max(0, 4 - totalPlayers);
    for (let i = 0; i < emptySlots; i++) {
        const slot = document.createElement('div');
        slot.className = 'player-slot empty';
        slot.innerHTML = '<div class="avatar">🪑</div><div class="name">等待加入...</div>';
        grid.appendChild(slot);
    }

    // ★ 修复按钮文字：防御性计算，确保不会出现 (0/-1)
    const btn = document.getElementById('btn-start-game');
    if (!btn) return;

    if (G.isHost) {
        const nonHostReady = indices.filter(i => i !== 0 && playerReady[i]).length;
        const nonHostTotal = Math.max(0, totalPlayers - 1); // ★ 防御：确保不为负
        const canStart = totalPlayers >= 2 && [...indices].every(i => !!playerReady[i]);
        btn.textContent = canStart
            ? `🚀 开始游戏 (${totalPlayers}人)`
            : `⏳ 等待准备 (${nonHostReady}/${nonHostTotal})`;
        btn.disabled = !canStart;
    } else {
        // 非房主
        const myReady = !!playerReady[G.myPlayerId];
        btn.textContent = myReady ? '✅ 已准备 (点击取消)' : '📦 点击准备';
        btn.disabled = false;
    }
}
