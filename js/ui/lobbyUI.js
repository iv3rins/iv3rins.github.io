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

    // ★ 修复按钮文字：房主不需要准备，只检查客人的就绪状态
    const btn = document.getElementById('btn-start-game');
    if (!btn) return;

    if (G.isHost) {
        // ★ 房主自身不算在"需要准备"的人里
        const guestIndices = indices.filter(i => i !== 0);
        const guestReady = guestIndices.filter(i => playerReady[i]).length;
        const guestTotal = guestIndices.length;
        const canStart = totalPlayers >= 2 && guestTotal > 0 && guestIndices.every(i => !!playerReady[i]);
        btn.textContent = canStart
            ? `🚀 开始游戏 (${totalPlayers}人)`
            : `⏳ 等待准备 (${guestReady}/${guestTotal})`;
        btn.disabled = !canStart;
    } else {
        // 非房主
        const myReady = !!playerReady[G.myPlayerId];
        btn.textContent = myReady ? '✅ 已准备 (点击取消)' : '📦 点击准备';
        btn.disabled = false;
    }
}
