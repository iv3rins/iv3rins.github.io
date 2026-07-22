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
    const indices = Object.keys(G.playerNames).map(Number).sort((a, b) => a - b);

    indices.forEach(i => {
        const name = G.playerNames[i];
        const isHostSlot = i === 0;
        const isMe = i === G.myPlayerId;
        const avatar = G.playerAvatars[i] || G.avatars[i % G.avatars.length];
        const slot = document.createElement('div');
        slot.className = 'player-slot occupied';
        if (isHostSlot) slot.classList.add('host');
        slot.innerHTML = `
            ${isHostSlot
                ? '<div class="status-badge host-badge">👑 房主</div>'
                : `<div class="status-badge">${G.playerReady[i] ? '已准备' : '未准备'}</div>`}
            <div class="avatar cute-bounce">${avatar}</div>
            <div class="name">${name}${isMe ? ' (你)' : ''}</div>
        `;
        grid.appendChild(slot);
    });

    for (let i = indices.length; i < 4; i++) {
        const slot = document.createElement('div');
        slot.className = 'player-slot empty';
        slot.innerHTML = '<div class="avatar">🪑</div><div class="name">等待加入...</div>';
        grid.appendChild(slot);
    }

    const btn = document.getElementById('btn-start-game');
    if (G.isHost) {
        const nonHostReady = indices.filter(i => i !== 0).every(i => G.playerReady[i]);
        const canStart = indices.length >= 2 && nonHostReady;
        btn.textContent = canStart
            ? `🚀 开始游戏 (${indices.length}人)`
            : `⏳ 等待准备 (${indices.filter(i => i !== 0 && G.playerReady[i]).length}/${indices.length - 1})`;
        btn.disabled = !canStart;
        btn.className = canStart ? 'btn btn-ready' : 'btn';
    } else {
        btn.textContent = G.playerReady[G.myPlayerId] ? '✅ 已准备 (点击取消)' : '📦 点击准备';
        btn.disabled = false;
        btn.className = G.playerReady[G.myPlayerId] ? 'btn btn-ready' : 'btn';
    }
}
