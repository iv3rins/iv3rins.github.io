/**
 * 可爱大乱斗 - 主业务逻辑 (app.js)
 * 架构: Host-Client 权威同步模型
 * 视图流: Home → Waiting → Game / Spectator → Result
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
    gameEngine: null,
    peerToPlayer: {},
    playerToPeer: {},
    playerNames: {},
    playerReady: {},
    currentState: null,
    selectedTargetId: -1,
    selectedCardIndices: [],
    timerTimeout: null,
    roundCount: 0,
    maxPlayers: 8,
    avatars: ['🐱','🐶','🐰','🐻','🦊','🐼','🐧','🦁'],
};

// ============================================================
// 页面切换
// ============================================================
function showPage(pageId) {
    document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));
    const page = document.getElementById('page-' + pageId);
    if (page) page.classList.add('active');
}

function showModal(text) {
    document.getElementById('modal-disconnect-text').textContent = text;
    document.getElementById('modal-disconnect').classList.add('show');
}

// ============================================================
// 主页逻辑
// ============================================================
function initHomePage() {
    document.getElementById('btn-create-room').addEventListener('click', createRoom);
    document.getElementById('btn-join-room').addEventListener('click', joinRoom);
}

function createRoom() {
    G.playerName = document.getElementById('player-name').value.trim() || '小猫猫';
    G.isHost = true;
    G.myPlayerId = 0;
    G.playerNames[0] = G.playerName;
    G.playerReady[0] = true;

    G.p2p = new P2PManager();
    G.p2p.callbacks.onReady = (roomCode) => {
        G.roomCode = roomCode;
        G.peerToPlayer[G.p2p.myId] = 0;
        G.playerToPeer[0] = G.p2p.myId;
        document.getElementById('display-room-code').textContent = roomCode;
        showPage('waiting');
        renderWaitingLobby();
        addWaitingChat('system', '房间创建成功！快邀请小伙伴加入吧~ 🐾');
    };

    G.p2p.callbacks.onPlayerJoin = (peerId) => {
        const usedIndices = Object.values(G.peerToPlayer);
        let nextIndex = 1;
        while (usedIndices.includes(nextIndex)) nextIndex++;
        if (nextIndex >= G.maxPlayers) { console.warn('房间已满'); return; }
        G.peerToPlayer[peerId] = nextIndex;
        G.playerToPeer[nextIndex] = peerId;
        G.playerNames[nextIndex] = '玩家' + (nextIndex + 1);
        G.playerReady[nextIndex] = false;
        addWaitingChat('system', '新玩家加入了房间！');
        renderWaitingLobby();
        broadcastLobbyState();
    };

    G.p2p.callbacks.onPlayerLeave = (peerId) => {
        const idx = G.peerToPlayer[peerId];
        if (idx !== undefined) {
            delete G.peerToPlayer[peerId];
            delete G.playerToPeer[idx];
            delete G.playerNames[idx];
            delete G.playerReady[idx];
            addWaitingChat('system', (G.playerNames[idx]||'玩家') + ' 离开了房间 😿');
            if (G.gameEngine) {
                // 游戏中掉线 → 标记淘汰
                const p = G.gameEngine.players[idx];
                if (p && !p.isEliminated) {
                    p.characters.forEach(c => c.execute());
                    p.isEliminated = true;
                    p.disconnectReason = '断线';
                    broadcastSyncState();
                }
            } else {
                renderWaitingLobby();
                broadcastLobbyState();
            }
        }
    };

    G.p2p.callbacks.onMessage = handleHostMessage;
    G.p2p.callbacks.onPeerError = (err) => {
        if (err.type === 'unavailable-id') {
            showModal('房间号已被占用，请换一个！');
        }
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
        showPage('waiting');
        document.getElementById('display-room-code').textContent = roomCode;
        G.p2p.sendMessage({ type: 'JOIN_REQ', payload: { playerName: G.playerName } });
    };
    G.p2p.callbacks.onMessage = handleClientMessage;
    G.p2p.callbacks.onHostDisconnect = () => {
        showModal('房主已断开连接，房间已解散。');
    };
    G.p2p.callbacks.onPeerError = (err) => {
        if (err.type === 'peer-unavailable') {
            showModal('找不到该房间，请检查邀请码！');
        }
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
        if (!G.isHost) return;
        const playerCount = Object.keys(G.playerNames).length;
        if (playerCount < 2) { alert('至少需要2名玩家才能开始！'); return; }
        startGame();
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
    const playerCount = Object.keys(G.playerNames).length;

    // 已加入玩家
    Object.entries(G.playerNames).forEach(([idx, name]) => {
        const i = parseInt(idx);
        const slot = document.createElement('div');
        slot.className = 'player-slot occupied';
        if (i === 0) slot.classList.add('host');
        const isHost = i === 0;
        const isReady = G.playerReady[i];
        slot.innerHTML = `
            ${isHost ? '<div class="status-badge host-badge">👑 房主</div>' : `<div class="status-badge">${isReady ? '已准备' : '未准备'}</div>`}
            <div class="avatar cute-bounce">${G.avatars[i % G.avatars.length]}</div>
            <div class="name">${name}</div>
        `;
        grid.appendChild(slot);
    });

    // 空槽位
    for (let i = playerCount; i < G.maxPlayers; i++) {
        const slot = document.createElement('div');
        slot.className = 'player-slot empty';
        slot.innerHTML = '<div class="avatar">🪑</div><div class="name">等待加入...</div>';
        grid.appendChild(slot);
    }

    // 房主按钮：显示"开始游戏"；客户端按钮：显示"准备"
    const btnStart = document.getElementById('btn-start-game');
    if (G.isHost) {
        btnStart.textContent = '🚀 开始游戏 (' + playerCount + '人)';
        btnStart.disabled = playerCount < 2;
    } else {
        btnStart.textContent = G.playerReady[G.myPlayerId] ? '✅ 已准备' : '📦 准备';
        btnStart.disabled = false;
    }
}

function broadcastLobbyState() {
    if (!G.isHost) return;
    const lobbyState = {
        type: 'LOBBY_STATE',
        payload: {
            roomCode: G.roomCode,
            playerNames: G.playerNames,
            playerReady: G.playerReady,
            myPlayerId: -1, // 每个客户端不同，下方单独设置
        }
    };
    Object.entries(G.playerToPeer).forEach(([idxStr, peerId]) => {
        const idx = parseInt(idxStr);
        if (idx === 0) return; // 跳过房主
        const conn = G.p2p.connections[peerId];
        if (conn && conn.open) {
            conn.send({
                type: 'LOBBY_STATE',
                payload: { ...lobbyState.payload, myPlayerId: idx }
            });
        }
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
// 开始游戏
// ============================================================
function startGame() {
    if (!G.isHost || !G.p2p) return;
    const playerCount = Object.keys(G.playerNames).length;
    G.gameEngine = new GameEngine(playerCount);
    G.roundCount = 0;

    // 设置玩家名字
    Object.entries(G.playerNames).forEach(([idx, name]) => {
        const i = parseInt(idx);
        if (G.gameEngine.players[i]) G.gameEngine.players[i].name = name;
    });

    // 通知所有客户端游戏开始
    G.p2p.sendMessage({ type: 'GAME_START', payload: {} });
    broadcastSyncState();
    showPage('game');
    addGameChat('system', '🎮 游戏开始！爪爪对决！🐾');
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
            const payload = data.payload;
            const attackerIdx = G.peerToPlayer[senderId];
            if (attackerIdx === undefined) break;
            try {
                processPlayCard(attackerIdx, payload);
            } catch (err) {
                console.error('出牌错误:', err);
                G.p2p.sendTo(senderId, { type: 'ERROR', payload: { message: err.message } });
            }
            break;
        }
        case 'CHAT': {
            if (G.gameEngine) {
                addGameChat('user', data.payload.senderName + ': ' + data.payload.text);
            } else {
                addWaitingChat('user', data.payload.senderName + ': ' + data.payload.text);
            }
            G.p2p.sendMessage(data);
            break;
        }
    }
}

// 房主处理出牌（共用）
function processPlayCard(attackerIdx, payload) {
    const engine = G.gameEngine;
    const attacker = engine.players[attackerIdx];
    const target = engine.players[payload.targetPlayerId];
    if (!attacker || !target) throw new Error('无效的攻击者或目标');
    if (engine.currentPlayerIndex !== attackerIdx) throw new Error('不是你的回合');

    const sorted = [...payload.cardIndices].sort((a, b) => b - a);
    const cards = sorted.map(i => attacker.hand[i]).filter(Boolean);
    if (cards.length !== payload.cardIndices.length) throw new Error('手牌索引无效');

    const hasJoker = cards.some(c => c.isJoker);
    if (hasJoker) {
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
            G.myPlayerId = s.myPlayerId;
            G.roomCode = s.roomCode;
            document.getElementById('display-room-code').textContent = s.roomCode;
            renderWaitingLobby();
            break;
        }
        case 'GAME_START': {
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
            addGameChat('user', data.payload.senderName + ': ' + data.payload.text);
            addWaitingChat('user', data.payload.senderName + ': ' + data.payload.text);
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
// 广播与序列化
// ============================================================
function broadcastSyncState() {
    if (!G.gameEngine) return;
    Object.entries(G.playerToPeer).forEach(([idxStr, peerId]) => {
        const idx = parseInt(idxStr);
        if (idx === 0) return;
        const conn = G.p2p.connections[peerId];
        if (!conn || !conn.open) return;
        conn.send({ type: 'SYNC_STATE', payload: serializeState(G.gameEngine, idx) });
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
        winnerId: winner ? winner.id : -1,
        rounds: G.roundCount,
        survivors: engine.players.filter(p => !p.isEliminated).length,
    };
    G.p2p.sendMessage({ type: 'GAME_OVER', payload });
    showResultPage(payload);
}

function serializeState(engine, forPlayerId) {
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
            hand: (i === forPlayerId) ? p.hand.map(c => ({
                suit: c.suit, rank: c.rank, isJoker: c.isJoker, value: c.value,
            })) : null,
        })),
        currentPlayerIndex: engine.currentPlayerIndex,
        deckCount: engine.deck.length,
        isGameOver: engine.isGameOver,
        winner: engine.winner ? { id: engine.winner.id, name: engine.winner.name } : null,
        myPlayerId: forPlayerId,
        roundCount: G.roundCount,
    };
}

// ============================================================
// 渲染逻辑
// ============================================================
function renderState(state) {
    G.currentState = state;
    const me = state.players[state.myPlayerId];
    const isSpectating = me && me.isEliminated;
    const gamePage = document.getElementById('page-game');
    if (isSpectating) { gamePage.classList.add('spectator-mode'); }
    else { gamePage.classList.remove('spectator-mode'); }

    renderOpponents(state);
    renderSelf(state);
    if (!isSpectating && me && me.hand) {
        renderHand(me.hand);
    } else {
        document.getElementById('hand-container').innerHTML = '';
    }
    updateTurnUI(state);
    G.selectedTargetId = -1;
    G.selectedCardIndices = [];
}

function renderOpponents(state) {
    const container = document.getElementById('opponents-container');
    container.innerHTML = '';
    const me = state.players[state.myPlayerId];
    const isMyTurn = state.currentPlayerIndex === state.myPlayerId;
    const isSpectating = me && me.isEliminated;
    state.players.forEach((p, i) => {
        if (i === state.myPlayerId) return;
        container.appendChild(createPlayerCard(p, i, false, isMyTurn && !isSpectating, state));
    });
}

function renderSelf(state) {
    const container = document.getElementById('self-container');
    container.innerHTML = '';
    const me = state.players[state.myPlayerId];
    if (!me) return;
    container.appendChild(createPlayerCard(me, state.myPlayerId, true, false, state));
}

function createPlayerCard(p, idx, isSelf, isTargetable, state) {
    const div = document.createElement('div');
    div.className = 'player-card';
    if (isTargetable) div.classList.add('targetable');
    div.dataset.playerId = idx;
    const aliveChar = p.characters.find(c => !c.isDead);
    const displayChar = aliveChar || p.characters[p.activeCharIndex];
    const isRed = displayChar.suit === '♦' || displayChar.suit === '♥';
    const suitClass = isRed ? 'suit-red' : 'suit-black';
    const avatar = p.isEliminated ? '😭' : G.avatars[idx % G.avatars.length];
    const avatarClass = p.isEliminated ? 'crying-anim' : 'cute-bounce';
    const nameHtml = isSelf
        ? `<div class="name">${p.name} (你)</div>`
        : `<div class="name">${p.name}${p.isEliminated ? ' 💀' : ''}</div>`;
    const hpPct = displayChar.maxHp > 0 ? (displayChar.hp / displayChar.maxHp * 100) : 0;
    const shieldPct = displayChar.maxHp > 0 ? (displayChar.shield / displayChar.maxHp * 100) : 0;
    const roleText = p.isEliminated
        ? '<span class="role" style="color:#b2bec3">已淘汰</span>'
        : `<span class="role ${suitClass}">${displayChar.suit}${displayChar.rank}</span>`;
    div.innerHTML = `
        ${nameHtml}
        <div class="avatar ${avatarClass}">${avatar}</div>
        ${roleText}
        <div class="status-bar">
            <div class="status-hp" style="width:${hpPct}%"></div>
            <div class="status-shield" style="width:${shieldPct}%"></div>
        </div>
        <div class="hand-count">${p.handCount}</div>
    `;
    if (idx === state.currentPlayerIndex && !p.isEliminated) {
        const ind = document.createElement('div');
        ind.className = 'current-turn-indicator';
        ind.textContent = '⚡';
        div.appendChild(ind);
    }
    if (isTargetable) {
        div.addEventListener('click', () => selectTarget(idx, div));
    }
    return div;
}

function renderHand(cards) {
    const container = document.getElementById('hand-container');
    container.innerHTML = '';
    cards.forEach((card, i) => {
        const div = document.createElement('div');
        div.className = 'poker-card';
        div.dataset.index = i;
        if (card.isJoker) {
            div.classList.add('card-joker');
            div.innerHTML = '<span>🃏</span><span style="font-size:16px">Joker</span>';
        } else {
            const isRed = card.suit === '♦' || card.suit === '♥';
            div.classList.add(isRed ? 'suit-red' : 'suit-black');
            div.innerHTML = `<span>${card.suit}</span><span>${card.rank}</span>`;
        }
        div.addEventListener('click', () => toggleCard(i, div));
        container.appendChild(div);
    });
}

function updateTurnUI(state) {
    const isMyTurn = state.currentPlayerIndex === state.myPlayerId;
    const me = state.players[state.myPlayerId];
    const isSpectating = me && me.isEliminated;
    const actionArea = document.getElementById('action-area');
    const attackBtn = document.getElementById('attack-btn');
    if (isSpectating) {
        actionArea.style.display = 'none';
    } else if (isMyTurn) {
        actionArea.style.display = 'flex';
        attackBtn.textContent = '⚔️ 选择一个玩家，攻击';
        attackBtn.disabled = false;
        startTimer();
    } else {
        actionArea.style.display = 'flex';
        const cur = state.players[state.currentPlayerIndex];
        attackBtn.textContent = `⏳ 等待 ${cur?.name || '...'} 出牌...`;
        attackBtn.disabled = true;
        clearTimer();
    }
}

// ============================================================
// 卡牌选择与出牌
// ============================================================
function toggleCard(index, el) {
    const idx = G.selectedCardIndices.indexOf(index);
    if (idx >= 0) { G.selectedCardIndices.splice(idx, 1); el.classList.remove('selected'); }
    else { G.selectedCardIndices.push(index); el.classList.add('selected'); }
}

function selectTarget(playerId, el) {
    document.querySelectorAll('.player-card.targeted').forEach(c => c.classList.remove('targeted'));
    G.selectedTargetId = playerId;
    el.classList.add('targeted');
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

    // A牌数值
    let aValue = 0;
    const state = G.currentState;
    if (state) {
        const myHand = state.players[state.myPlayerId]?.hand;
        if (myHand) {
            const selected = G.selectedCardIndices.map(i => myHand[i]).filter(Boolean);
            if (selected.some(c => c && c.rank === 'A')) {
                const input = prompt('你打出了A牌！请输入转化数值 (1-13)：', '5');
                aValue = parseInt(input) || 5;
                if (aValue < 1) aValue = 1;
                if (aValue > 13) aValue = 13;
            }
        }
    }

    if (G.isHost) {
        try { processPlayCard(G.myPlayerId, { targetPlayerId: G.selectedTargetId, cardIndices: [...G.selectedCardIndices], aValue }); }
        catch (err) { alert('出牌失败: ' + err.message); }
    } else {
        G.p2p.sendMessage({
            type: 'PLAY_CARD',
            payload: { targetPlayerId: G.selectedTargetId, cardIndices: [...G.selectedCardIndices], aValue }
        });
    }

    G.selectedCardIndices = [];
    G.selectedTargetId = -1;
    document.querySelectorAll('.poker-card.selected').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.player-card.targeted').forEach(c => c.classList.remove('targeted'));
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
        setTimeout(executeAttack, 500);
    }
}

// ============================================================
// 聊天
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
    addGameChat('system', '🏆 游戏结束！胜者: ' + payload.winner);
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
    document.getElementById('btn-leave-room').addEventListener('click', () => location.reload());
    document.getElementById('btn-modal-ok').addEventListener('click', () => location.reload());
}

document.addEventListener('DOMContentLoaded', () => {
    initHomePage();
    initWaitingPage();
    initGamePage();
    console.log('🐾 可爱大乱斗 初始化完成！');
});
