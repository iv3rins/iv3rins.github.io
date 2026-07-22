/**
 * 可爱大乱斗 - 主业务逻辑 (app.js)
 * 路由: Home → Waiting → Game/Spectator → Result
 * 架构: Host-Client 权威同步 (房主计算,客户端渲染)
 */

// ============================================================
// 全局状态
// ============================================================
const G = {
    p2p: null,
    isHost: false,
    playerName: '',
    roomCode: '',
    myPlayerId: -1,
    gameEngine: null,          // 仅房主
    peerToPlayer: {},          // 房主: peerId → playerIndex
    playerToPeer: {},          // 房主: playerIndex → peerId
    playerNames: {},           // playerIndex → name (大厅+游戏共用)
    playerReady: {},           // playerIndex → bool
    currentState: null,        // 最近一次 SYNC_STATE
    selectedTargetId: -1,
    selectedCardIndices: [],
    timerTimeout: null,
    roundCount: 0,
    maxPlayers: 12,
    avatars: ['🐱','🐶','🐰','🐻','🦊','🐼','🐧','🦁','🐸','🐨','🐯','🐷'],
    gameStarted: false,        // 是否已离开大厅
};

// ============================================================
// 路由切换
// ============================================================
function showPage(pageId) {
    document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));
    const el = document.getElementById('page-' + pageId);
    if (el) el.classList.add('active');
}

function showModal(text) {
    document.getElementById('modal-disconnect-text').textContent = text;
    document.getElementById('modal-disconnect').classList.add('show');
}

// ============================================================
// 主页：创建/加入房间 → 进入等待大厅
// ============================================================
function initHomePage() {
    document.getElementById('btn-create-room').addEventListener('click', createRoom);
    document.getElementById('btn-join-room').addEventListener('click', joinRoom);
}

function createRoom() {
    G.playerName = document.getElementById('player-name').value.trim() || '小猫猫';
    G.isHost = true;
    G.myPlayerId = 0;
    G.playerNames = { 0: G.playerName };
    G.playerReady = { 0: true }; // 房主默认已准备

    G.p2p = new P2PManager();

    G.p2p.callbacks.onReady = (roomCode) => {
        G.roomCode = roomCode;
        G.peerToPlayer[G.p2p.myId] = 0;
        G.playerToPeer[0] = G.p2p.myId;
        document.getElementById('display-room-code').textContent = roomCode;
        showPage('waiting');               // ← 关键：先进大厅
        renderWaitingLobby();
        addWaitingChat('system', '房间创建成功！快邀请小伙伴加入吧~ 🐾');
    };

    G.p2p.callbacks.onPlayerJoin = (peerId) => {
        if (G.gameStarted) return; // 游戏已开始，拒绝新加入
        const used = Object.values(G.peerToPlayer);
        let idx = 1;
        while (used.includes(idx)) idx++;
        if (idx >= G.maxPlayers) return;
        G.peerToPlayer[peerId] = idx;
        G.playerToPeer[idx] = peerId;
        G.playerNames[idx] = '玩家' + (idx + 1);
        G.playerReady[idx] = false;
        renderWaitingLobby();
        broadcastLobbyState();
    };

    G.p2p.callbacks.onPlayerLeave = (peerId) => {
        const idx = G.peerToPlayer[peerId];
        if (idx === undefined) return;
        const name = G.playerNames[idx] || '玩家';
        delete G.peerToPlayer[peerId];
        delete G.playerToPeer[idx];
        delete G.playerNames[idx];
        delete G.playerReady[idx];
        if (G.gameStarted && G.gameEngine) {
            // 游戏中掉线 → 标记淘汰
            const p = G.gameEngine.players[idx];
            if (p && !p.isEliminated) {
                p.characters.forEach(c => c.execute());
                p.isEliminated = true;
                addGameChat('system', name + ' 断线，已被淘汰 😿');
                // 如果掉线的是当前回合玩家，推进回合
                if (G.gameEngine.currentPlayerIndex === idx && !G.gameEngine.isGameOver) {
                    G.gameEngine.nextTurn();
                }
                G.gameEngine.checkWinCondition();
                broadcastSyncState();
                if (G.gameEngine.isGameOver) broadcastGameOver();
            }
        } else {
            addWaitingChat('system', name + ' 离开了房间 😿');
            renderWaitingLobby();
            broadcastLobbyState();
        }
    };

    G.p2p.callbacks.onMessage = handleHostMessage;
    G.p2p.callbacks.onPeerError = (err) => {
        if (err.type === 'unavailable-id') showModal('房间号被占用，请重试！');
    };

    G.p2p.createRoom();
}

function joinRoom() {
    G.playerName = document.getElementById('player-name').value.trim() || '小猫猫';
    const code = document.getElementById('room-code').value.trim();
    if (code.length !== 4) { alert('请输入4位邀请码！'); return; }
    G.isHost = false;
    G.roomCode = code;

    G.p2p = new P2PManager();

    G.p2p.callbacks.onReady = (roomCode) => {
        document.getElementById('display-room-code').textContent = roomCode;
        showPage('waiting');               // ← 关键：先进大厅
        G.p2p.sendMessage({ type: 'JOIN_REQ', payload: { playerName: G.playerName } });
    };

    G.p2p.callbacks.onMessage = handleClientMessage;
    G.p2p.callbacks.onHostDisconnect = () => showModal('房主已断开连接，房间已解散。');
    G.p2p.callbacks.onPeerError = (err) => {
        if (err.type === 'peer-unavailable') showModal('找不到该房间，请检查邀请码！');
    };

    G.p2p.joinRoom(code);
}

// ============================================================
// 等待大厅
// ============================================================
function initWaitingPage() {
    document.getElementById('btn-copy-code').addEventListener('click', () => {
        const code = document.getElementById('display-room-code').textContent;
        navigator.clipboard.writeText(code).then(() => alert('🐾 邀请码 ' + code + ' 复制成功！'));
    });

    document.getElementById('btn-start-game').addEventListener('click', () => {
        if (G.isHost) {
            // 房主：开始游戏
            const count = Object.keys(G.playerNames).length;
            if (count < 2) { alert('至少需要2名玩家才能开始！'); return; }
            startGame();
        } else {
            // 客户端：切换准备状态
            const ready = !G.playerReady[G.myPlayerId];
            G.playerReady[G.myPlayerId] = ready;
            G.p2p.sendMessage({ type: 'READY', payload: { ready } });
            renderWaitingLobby();
        }
    });

    document.getElementById('btn-leave-waiting').addEventListener('click', leaveRoom);
    document.getElementById('btn-waiting-chat-send').addEventListener('click', sendWaitingChat);
    document.getElementById('waiting-chat-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') sendWaitingChat();
    });
}

function renderWaitingLobby() {
    const grid = document.getElementById('players-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const indices = Object.keys(G.playerNames).map(Number).sort((a, b) => a - b);

    indices.forEach(i => {
        const name = G.playerNames[i];
        const isHostSlot = i === 0;
        const isMe = i === G.myPlayerId;
        const slot = document.createElement('div');
        slot.className = 'player-slot occupied';
        if (isHostSlot) slot.classList.add('host');
        slot.innerHTML = `
            ${isHostSlot
                ? '<div class="status-badge host-badge">👑 房主</div>'
                : `<div class="status-badge">${G.playerReady[i] ? '已准备' : '未准备'}</div>`}
            <div class="avatar cute-bounce">${G.avatars[i % G.avatars.length]}</div>
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
        btn.textContent = `🚀 开始游戏 (${indices.length}人)`;
        btn.disabled = indices.length < 2;
    } else {
        btn.textContent = G.playerReady[G.myPlayerId] ? '✅ 已准备 (点击取消)' : '📦 点击准备';
        btn.disabled = false;
    }
}

function broadcastLobbyState() {
    if (!G.isHost) return;
    Object.entries(G.playerToPeer).forEach(([idxStr, peerId]) => {
        const idx = parseInt(idxStr);
        if (idx === 0) return;
        G.p2p.sendTo(peerId, {
            type: 'LOBBY_STATE',
            payload: {
                roomCode: G.roomCode,
                playerNames: G.playerNames,
                playerReady: G.playerReady,
                myPlayerId: idx,
            }
        });
    });
}

function sendWaitingChat() {
    const input = document.getElementById('waiting-chat-input');
    const text = input.value.trim();
    if (!text) return;
    G.p2p.sendMessage({ type: 'CHAT', payload: { senderName: G.playerName, text } });
    addWaitingChat('self', G.playerName + ': ' + text);
    input.value = '';
}

function addWaitingChat(cls, text) {
    const box = document.getElementById('waiting-chat-messages');
    if (!box) return;
    const div = document.createElement('div');
    div.className = 'msg ' + cls;
    div.textContent = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function leaveRoom() {
    if (G.p2p) G.p2p.disconnect();
    location.reload();
}

// ============================================================
// 开始游戏（房主在大厅点击 → 广播 GAME_START → 所有人切到 game）
// ============================================================
function startGame() {
    if (!G.isHost || !G.p2p) return;
    const indices = Object.keys(G.playerNames).map(Number).sort((a, b) => a - b);
    const count = indices.length;

    // 用实际人数实例化引擎
    G.gameEngine = new GameEngine(count);
    G.roundCount = 0;
    G.gameStarted = true;

    // 把大厅的玩家索引映射到引擎 players（引擎索引是 0..count-1 连续）
    // 需要重建映射：engineIndex ↔ lobbyIndex
    G.engineToLobby = {};
    indices.forEach((lobbyIdx, engineIdx) => {
        G.engineToLobby[engineIdx] = lobbyIdx;
        G.gameEngine.players[engineIdx].name = G.playerNames[lobbyIdx];
    });

    // 通知所有客户端：游戏开始 + 各自的 engineIndex
    Object.entries(G.playerToPeer).forEach(([lobbyIdxStr, peerId]) => {
        const lobbyIdx = parseInt(lobbyIdxStr);
        if (lobbyIdx === 0) return;
        const engineIdx = indices.indexOf(lobbyIdx);
        G.p2p.sendTo(peerId, {
            type: 'GAME_START',
            payload: { enginePlayerId: engineIdx, playerNames: G.gameEngine.players.map(p => p.name) }
        });
    });

    // 房主自己切到游戏页
    G.myPlayerId = 0; // 房主固定是 engine 0
    showPage('game');
    addGameChat('system', '🎮 游戏开始！爪爪对决！🐾');
    broadcastSyncState();
}

// ============================================================
// 房主消息处理
// ============================================================
function handleHostMessage(data, senderId) {
    switch (data.type) {
        case 'JOIN_REQ': {
            const idx = G.peerToPlayer[senderId];
            if (idx !== undefined) {
                G.playerNames[idx] = data.payload.playerName;
                G.playerReady[idx] = false;
                renderWaitingLobby();
                broadcastLobbyState();
                addWaitingChat('system', data.payload.playerName + ' 加入了房间！');
            }
            break;
        }
        case 'READY': {
            const idx = G.peerToPlayer[senderId];
            if (idx !== undefined) {
                G.playerReady[idx] = data.payload.ready;
                renderWaitingLobby();
                broadcastLobbyState();
            }
            break;
        }
        case 'PLAY_CARD': {
            if (!G.gameEngine) break;
            // senderId 是 peerId → lobbyIndex → engineIndex
            const lobbyIdx = G.peerToPlayer[senderId];
            if (lobbyIdx === undefined) break;
            const engineIdx = G.engineToLobby ? Object.keys(G.engineToLobby).find(k => G.engineToLobby[k] === lobbyIdx) : lobbyIdx;
            try {
                processPlayCard(parseInt(engineIdx), data.payload);
            } catch (err) {
                G.p2p.sendTo(senderId, { type: 'ERROR', payload: { message: err.message } });
            }
            break;
        }
        case 'CHAT': {
            if (G.gameStarted) addGameChat('user', data.payload.senderName + ': ' + data.payload.text);
            else addWaitingChat('user', data.payload.senderName + ': ' + data.payload.text);
            G.p2p.sendMessage(data); // 中转广播
            break;
        }
    }
}

// 出牌结算（房主本地 & 转发都走这里）
function processPlayCard(attackerIdx, payload) {
    const engine = G.gameEngine;
    const attacker = engine.players[attackerIdx];
    const target = engine.players[payload.targetPlayerId];
    if (!attacker || !target) throw new Error('无效的攻击者或目标');
    if (engine.currentPlayerIndex !== attackerIdx) throw new Error('不是你的回合');

    const sorted = [...payload.cardIndices].sort((a, b) => b - a);
    const cards = sorted.map(i => attacker.hand[i]).filter(Boolean);
    if (cards.length !== payload.cardIndices.length) throw new Error('手牌索引无效');

    if (cards.some(c => c.isJoker)) {
        engine.playJoker(attacker, target, target.activeCharIndex, cards);
    } else {
        engine.playAttack(attacker, target, cards, payload.aValue || 0);
    }
    G.roundCount++;
    if (!engine.isGameOver) engine.nextTurn();
    addGameChat('system', attacker.name + ' 攻击了 ' + target.name + '！');
    broadcastSyncState();
    if (engine.isGameOver) broadcastGameOver();
}

// ============================================================
// 客户端消息处理
// ============================================================
function handleClientMessage(data, senderId) {
    switch (data.type) {
        case 'LOBBY_STATE': {
            const s = data.payload;
            G.playerNames = s.playerNames;
            G.playerReady = s.playerReady;
            G.myPlayerId = s.myPlayerId; // 大厅索引（游戏开始后会换成 engine 索引）
            G.roomCode = s.roomCode;
            document.getElementById('display-room-code').textContent = s.roomCode;
            renderWaitingLobby();
            break;
        }
        case 'GAME_START': {
            G.gameStarted = true;
            G.myPlayerId = data.payload.enginePlayerId;
            showPage('game');
            addGameChat('system', '🎮 游戏开始！爪爪对决！🐾');
            break;
        }
        case 'SYNC_STATE': {
            G.currentState = data.payload;
            renderState(data.payload);
            break;
        }
        case 'CHAT': {
            if (G.gameStarted) addGameChat('user', data.payload.senderName + ': ' + data.payload.text);
            else addWaitingChat('user', data.payload.senderName + ': ' + data.payload.text);
            break;
        }
        case 'GAME_OVER': {
            showResultPage(data.payload);
            break;
        }
        case 'ERROR': {
            alert('操作失败: ' + data.payload.message);
            break;
        }
    }
}

// ============================================================
// 状态广播与序列化
// ============================================================
function broadcastSyncState() {
    if (!G.gameEngine) return;
    Object.entries(G.playerToPeer).forEach(([lobbyIdxStr, peerId]) => {
        const lobbyIdx = parseInt(lobbyIdxStr);
        if (lobbyIdx === 0) return;
        const engineIdx = parseInt(Object.keys(G.engineToLobby).find(k => G.engineToLobby[k] === lobbyIdx));
        G.p2p.sendTo(peerId, { type: 'SYNC_STATE', payload: serializeState(G.gameEngine, engineIdx) });
    });
    const hostState = serializeState(G.gameEngine, 0);
    G.currentState = hostState;
    renderState(hostState);
}

function broadcastGameOver() {
    const engine = G.gameEngine;
    const winner = engine.winner;
    const payload = {
        winner: winner ? winner.name : '平局',
        rounds: G.roundCount,
        survivors: engine.players.filter(p => !p.isEliminated).length,
    };
    G.p2p.sendMessage({ type: 'GAME_OVER', payload });
    showResultPage(payload);
}

function serializeState(engine, forEngineId) {
    return {
        players: engine.players.map((p, i) => ({
            id: p.id,
            name: p.name || ('玩家' + (p.id + 1)),
            characters: p.characters.map(c => ({
                rank: c.rank, suit: c.suit, maxHp: c.maxHp,
                hp: c.hp, shield: c.shield, isDead: c.isDead,
            })),
            activeCharIndex: p.activeCharIndex,
            handCount: p.hand.length,
            isEliminated: p.isEliminated,
            hand: (i === forEngineId) ? p.hand.map(c => ({
                suit: c.suit, rank: c.rank, isJoker: c.isJoker, value: c.value,
            })) : null,
        })),
        currentPlayerIndex: engine.currentPlayerIndex,
        deckCount: engine.deck.length,
        isGameOver: engine.isGameOver,
        winner: engine.winner ? { id: engine.winner.id, name: engine.winner.name } : null,
        myPlayerId: forEngineId,
        roundCount: G.roundCount,
    };
}

// ============================================================
// 核心渲染：renderState —— 根据快照完整重绘 DOM
// ============================================================
function renderState(state) {
    G.currentState = state;
    const me = state.players[state.myPlayerId];
    const isSpectating = me && me.isEliminated;

    // 观战模式切换
    const gamePage = document.getElementById('page-game');
    if (isSpectating) gamePage.classList.add('spectator-mode');
    else gamePage.classList.remove('spectator-mode');

    // 牌堆信息
    const deckInfo = document.getElementById('deck-info');
    if (deckInfo) {
        const cur = state.players[state.currentPlayerIndex];
        deckInfo.textContent = `🎴 牌堆: ${state.deckCount} | 回合 ${state.roundCount} | 当前: ${cur ? cur.name : '--'}`;
    }

    renderOpponents(state);
    renderSelf(state);

    // 手牌（只有自己能看到）
    if (!isSpectating && me && me.hand) renderHand(me.hand);
    else document.getElementById('hand-container').innerHTML = '';

    updateTurnUI(state);

    // 清空选择（新一轮状态）
    G.selectedTargetId = -1;
    G.selectedCardIndices = [];
    hideAValuePanel();
}

// 对手区域：动态渲染，支持任意人数
function renderOpponents(state) {
    const container = document.getElementById('opponents-container');
    container.innerHTML = '';
    const me = state.players[state.myPlayerId];
    const isMyTurn = state.currentPlayerIndex === state.myPlayerId;
    const isSpectating = me && me.isEliminated;

    state.players.forEach((p, i) => {
        if (i === state.myPlayerId) return; // 过滤自己
        container.appendChild(createPlayerCard(p, i, false, isMyTurn && !isSpectating, state));
    });
}

// 自己区域：绑定状态树
function renderSelf(state) {
    const container = document.getElementById('self-container');
    container.innerHTML = '';
    const me = state.players[state.myPlayerId];
    if (!me) return;
    container.appendChild(createPlayerCard(me, state.myPlayerId, true, false, state));
}

// 创建玩家卡片（对手 & 自己共用）
function createPlayerCard(p, idx, isSelf, isTargetable, state) {
    const div = document.createElement('div');
    div.className = 'player-card';
    if (isTargetable) div.classList.add('targetable');
    div.dataset.playerId = idx;

    // 显示当前存活角色（JQK）
    const aliveChar = p.characters.find(c => !c.isDead);
    const displayChar = aliveChar || p.characters[p.activeCharIndex];
    const isRed = displayChar.suit === '♦' || displayChar.suit === '♥';
    const suitClass = isRed ? 'suit-red' : 'suit-black';

    const avatar = p.isEliminated ? '😭' : G.avatars[idx % G.avatars.length];
    const avatarCls = p.isEliminated ? 'crying-anim' : 'cute-bounce';
    const nameHtml = isSelf
        ? `<div class="name">${p.name} (你)</div>`
        : `<div class="name">${p.name}${p.isEliminated ? ' 💀' : ''}</div>`;

    const hpPct = displayChar.maxHp > 0 ? (displayChar.hp / displayChar.maxHp * 100) : 0;
    const shPct = displayChar.maxHp > 0 ? (displayChar.shield / displayChar.maxHp * 100) : 0;

    const roleHtml = p.isEliminated
        ? '<span class="role" style="color:#b2bec3">已淘汰</span>'
        : `<span class="role ${suitClass}">${displayChar.suit}${displayChar.rank}</span>`;

    // 角色战备状态：3个小圆点表示 J/Q/K 存活
    const charDots = p.characters.map(c =>
        `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin:0 2px;background:${c.isDead ? '#dfe6e9' : '#55efc4'}"></span>`
    ).join('');

    div.innerHTML = `
        ${nameHtml}
        <div class="avatar ${avatarCls}">${avatar}</div>
        ${roleHtml}
        <div style="font-size:10px;color:#636e72">${displayChar.hp}/${displayChar.maxHp}${displayChar.shield > 0 ? ' +' + displayChar.shield + '🛡' : ''}</div>
        <div class="status-bar">
            <div class="status-hp" style="width:${hpPct}%"></div>
            <div class="status-shield" style="width:${shPct}%"></div>
        </div>
        <div style="margin-top:4px">${charDots}</div>
        <div class="hand-count">${p.handCount}</div>
    `;

    // 当前回合指示
    if (idx === state.currentPlayerIndex && !p.isEliminated) {
        const ind = document.createElement('div');
        ind.className = 'current-turn-indicator';
        ind.textContent = '⚡';
        div.appendChild(ind);
    }

    if (isTargetable) div.addEventListener('click', () => selectTarget(idx, div));
    return div;
}

// 手牌渲染（层叠布局）
function renderHand(cards) {
    const container = document.getElementById('hand-container');
    container.innerHTML = '';
    cards.forEach((card, i) => {
        const div = document.createElement('div');
        div.className = 'poker-card';
        div.dataset.index = i;
        if (card.isJoker) {
            div.classList.add('card-joker');
            div.innerHTML = '<span>🃏</span><span style="font-size:14px">Joker</span>';
        } else {
            const isRed = card.suit === '♦' || card.suit === '♥';
            div.classList.add(isRed ? 'suit-red' : 'suit-black');
            div.innerHTML = `<span>${card.suit}</span><span>${card.rank}</span>`;
        }
        div.addEventListener('click', () => toggleCard(i, div));
        container.appendChild(div);
    });
}

// 回合 UI（按钮可用性 + 倒计时）
function updateTurnUI(state) {
    const isMyTurn = state.currentPlayerIndex === state.myPlayerId;
    const me = state.players[state.myPlayerId];
    const isSpectating = me && me.isEliminated;
    const actionArea = document.getElementById('action-area');
    const btn = document.getElementById('attack-btn');

    if (isSpectating) {
        actionArea.style.visibility = 'hidden';
        clearTimer();
    } else if (isMyTurn) {
        actionArea.style.visibility = 'visible';
        btn.textContent = '⚔️ 选择一个玩家，攻击';
        btn.disabled = false;
        startTimer();
    } else {
        actionArea.style.visibility = 'visible';
        const cur = state.players[state.currentPlayerIndex];
        btn.textContent = `⏳ 等待 ${cur?.name || '...'} 出牌...`;
        btn.disabled = true;
        clearTimer();
    }
}

// ============================================================
// 交互：选牌 / 选目标 / 出牌
// ============================================================
function toggleCard(index, el) {
    const pos = G.selectedCardIndices.indexOf(index);
    if (pos >= 0) {
        G.selectedCardIndices.splice(pos, 1);
        el.classList.remove('selected');
    } else {
        G.selectedCardIndices.push(index);
        el.classList.add('selected');
    }
    updateAValuePanel();
}

function selectTarget(playerId, el) {
    document.querySelectorAll('.player-card.targeted').forEach(c => c.classList.remove('targeted'));
    G.selectedTargetId = playerId;
    el.classList.add('targeted');
}

// A 牌万化面板
function updateAValuePanel() {
    const panel = document.getElementById('a-value-panel');
    const state = G.currentState;
    if (!state || !panel) return;
    const myHand = state.players[state.myPlayerId]?.hand;
    if (!myHand) { panel.classList.remove('show'); return; }
    const hasA = G.selectedCardIndices.some(i => myHand[i] && myHand[i].rank === 'A' && !myHand[i].isJoker);
    if (hasA) panel.classList.add('show');
    else panel.classList.remove('show');
}

function hideAValuePanel() {
    const panel = document.getElementById('a-value-panel');
    if (panel) panel.classList.remove('show');
}

function executeAttack() {
    if (G.selectedCardIndices.length === 0) { alert('请先选择要打出的牌！🐾'); return; }
    if (G.selectedTargetId < 0) { alert('请先选择一个攻击目标！🐾'); return; }

    // 飞行动画
    const animLayer = document.getElementById('anim-layer');
    G.selectedCardIndices.forEach((ci, idx) => {
        const card = document.querySelector(`.poker-card[data-index="${ci}"]`);
        if (!card) return;
        const rect = card.getBoundingClientRect();
        const clone = card.cloneNode(true);
        clone.style.position = 'absolute';
        clone.style.left = rect.left + 'px';
        clone.style.top = rect.top + 'px';
        clone.style.margin = '0';
        clone.style.animation = `attackDash 0.5s ease-in forwards ${idx * 0.05}s`;
        animLayer.appendChild(clone);
        setTimeout(() => clone.remove(), 600);
    });

    // A 牌数值（从中场面板读取）
    let aValue = 0;
    const state = G.currentState;
    if (state) {
        const myHand = state.players[state.myPlayerId]?.hand;
        if (myHand && G.selectedCardIndices.some(i => myHand[i] && myHand[i].rank === 'A' && !myHand[i].isJoker)) {
            const input = document.getElementById('a-value-input');
            aValue = parseInt(input.value) || 5;
            if (aValue < 1) aValue = 1;
            if (aValue > 13) aValue = 13;
        }
    }

    const payload = {
        targetPlayerId: G.selectedTargetId,
        cardIndices: [...G.selectedCardIndices],
        aValue,
    };

    if (G.isHost) {
        try { processPlayCard(G.myPlayerId, payload); }
        catch (err) { alert('出牌失败: ' + err.message); }
    } else {
        G.p2p.sendMessage({ type: 'PLAY_CARD', payload });
    }

    // 清空本地选择（实际手牌更新等 SYNC_STATE 回来再渲染）
    G.selectedCardIndices = [];
    G.selectedTargetId = -1;
    hideAValuePanel();
    clearTimer();
}

// ============================================================
// 倒计时
// ============================================================
function startTimer() {
    clearTimer();
    const tb = document.querySelector('.timer-bar-bg');
    if (tb) { tb.classList.remove('timer-active'); void tb.offsetWidth; tb.classList.add('timer-active'); }
    G.timerTimeout = setTimeout(() => forceRandomPlay(), 30000);
}

function clearTimer() {
    if (G.timerTimeout) { clearTimeout(G.timerTimeout); G.timerTimeout = null; }
    const tb = document.querySelector('.timer-bar-bg');
    if (tb) tb.classList.remove('timer-active');
}

function forceRandomPlay() {
    const cards = document.querySelectorAll('#hand-container .poker-card');
    const targets = document.querySelectorAll('#opponents-container .player-card.targetable');
    if (cards.length > 0 && targets.length > 0) {
        cards[Math.floor(Math.random() * cards.length)].click();
        targets[Math.floor(Math.random() * targets.length)].click();
        setTimeout(executeAttack, 400);
    }
}

// ============================================================
// 游戏内聊天
// ============================================================
function sendGameChat() {
    const input = document.getElementById('game-chat-input');
    const text = input.value.trim();
    if (!text) return;
    G.p2p.sendMessage({ type: 'CHAT', payload: { senderName: G.playerName, text } });
    addGameChat('self', G.playerName + ': ' + text);
    input.value = '';
}

function addGameChat(cls, text) {
    const box = document.getElementById('game-chat-messages');
    if (!box) return;
    const div = document.createElement('div');
    div.className = 'msg ' + cls;
    div.textContent = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

// ============================================================
// 结算
// ============================================================
function showResultPage(payload) {
    showPage('result');
    document.getElementById('stat-winner').textContent = payload.winner;
    document.getElementById('stat-rounds').textContent = payload.rounds + ' 回合';
    document.getElementById('stat-survivors').textContent = payload.survivors + ' 人';
}

// ============================================================
// 初始化
// ============================================================
function initGamePage() {
    document.getElementById('attack-btn').addEventListener('click', executeAttack);
    document.getElementById('btn-game-chat-send').addEventListener('click', sendGameChat);
    document.getElementById('game-chat-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') sendGameChat();
    });
    document.getElementById('btn-restart').addEventListener('click', () => location.reload());
    document.getElementById('btn-leave-room').addEventListener('click', leaveRoom);
    document.getElementById('btn-modal-ok').addEventListener('click', () => location.reload());
}

document.addEventListener('DOMContentLoaded', () => {
    initHomePage();
    initWaitingPage();
    initGamePage();
    console.log('🐾 可爱大乱斗 初始化完成！');
});
