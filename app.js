/**
 * 可爱大乱斗 - 主业务逻辑 (app.js)
 * 
 * 架构: Host-Client 同步模型
 * - 房主 (Host): 实例化 GameEngine，接收客户端 ACTION，计算后广播 SYNC_STATE
 * - 客户端 (Client): 发送用户操作给房主，根据 SYNC_STATE 渲染 UI
 */

// ============================================================
// 全局状态
// ============================================================
const G = {
    p2p: null,
    isHost: false,
    playerName: '',
    roomCode: '',
    myPlayerId: -1,          // 我在 GameEngine.players 中的索引
    gameEngine: null,        // 仅房主持有
    peerToPlayer: {},        // host: { peerId -> playerIndex }
    playerToPeer: {},        // host: { playerIndex -> peerId }
    currentState: null,      // 最近一次 SYNC_STATE 快照
    selectedTargetId: -1,    // 选中的攻击目标 playerId
    selectedCardIndices: [], // 选中的手牌索引数组
    aValue: 0,               // A 牌转化数值
    timerTimeout: null,      // 30 秒倒计时
};

// ============================================================
// 页面切换
// ============================================================
function showPage(pageId) {
    document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));
    const page = document.getElementById('page-' + pageId);
    if (page) page.classList.add('active');
}

// ============================================================
// 主页按钮绑定
// ============================================================
function initHomePage() {
    document.getElementById('btn-create-room').addEventListener('click', createRoom);
    document.getElementById('btn-join-room').addEventListener('click', joinRoom);
}

function createRoom() {
    const nameInput = document.getElementById('player-name');
    G.playerName = nameInput.value.trim() || '小猫猫';
    G.isHost = true;
    G.myPlayerId = 0;

    G.p2p = new P2PManager();
    G.p2p.callbacks.onReady = (roomCode) => {
        G.roomCode = roomCode;
        console.log('房间创建成功:', roomCode);

        // 房主初始化 GameEngine（先用2人，有人加入时动态扩展？暂用最大4人）
        G.gameEngine = new GameEngine(4);
        // 登记房主自己
        G.peerToPlayer[G.p2p.myId] = 0;
        G.playerToPeer[0] = G.p2p.myId;

        // 记录玩家名字
        G.gameEngine.players[0].name = G.playerName;

        showPage('game');
        document.getElementById('disp-room-code').textContent = roomCode;
        updatePlayerCount();
        broadcastSyncState();
    };

    G.p2p.callbacks.onPlayerJoin = (peerId) => {
        // 分配一个未使用的 playerIndex
        const usedIndices = Object.values(G.peerToPlayer);
        let nextIndex = 1;
        while (usedIndices.includes(nextIndex)) nextIndex++;
        if (nextIndex >= 4) {
            console.warn('房间已满');
            return;
        }
        G.peerToPlayer[peerId] = nextIndex;
        G.playerToPeer[nextIndex] = peerId;

        console.log('玩家加入, peerId:', peerId, 'playerIndex:', nextIndex);
        updatePlayerCount();

        // 通知新玩家他的 playerId
        G.p2p.sendMessage({
            type: 'PLAYER_ASSIGNED',
            payload: { playerId: nextIndex, playerName: '玩家' + (nextIndex + 1) }
        });

        // 广播更新后的状态
        broadcastSyncState();
        addChatMessage('system', '玩家' + (nextIndex + 1) + ' 加入了游戏！🐾');
    };

    G.p2p.callbacks.onPlayerLeave = (peerId) => {
        const playerIdx = G.peerToPlayer[peerId];
        if (playerIdx !== undefined) {
            delete G.peerToPlayer[peerId];
            delete G.playerToPeer[playerIdx];
            addChatMessage('system', '玩家' + (playerIdx + 1) + ' 离开了游戏 😿');
            updatePlayerCount();
            broadcastSyncState();
        }
    };

    G.p2p.callbacks.onMessage = handleHostMessage;

    G.p2p.createRoom();
}

function joinRoom() {
    const nameInput = document.getElementById('player-name');
    const codeInput = document.getElementById('room-code');
    G.playerName = nameInput.value.trim() || '小猫猫';
    const code = codeInput.value.trim();

    if (code.length !== 4) {
        alert('请输入4位可爱的邀请码哦！');
        return;
    }

    G.isHost = false;
    G.roomCode = code;

    G.p2p = new P2PManager();
    G.p2p.callbacks.onReady = (roomCode) => {
        console.log('成功加入房间:', roomCode);
        showPage('game');
        document.getElementById('disp-room-code').textContent = roomCode;

        // 发送 JOIN_REQ
        setTimeout(() => {
            G.p2p.sendMessage({
                type: 'JOIN_REQ',
                payload: { playerName: G.playerName }
            });
        }, 300); // 稍等连接稳定
    };

    G.p2p.callbacks.onMessage = handleClientMessage;

    G.p2p.joinRoom(code);
}

// ============================================================
// 房主消息处理
// ============================================================
function handleHostMessage(data, senderId) {
    switch (data.type) {
        case 'JOIN_REQ': {
            const playerIdx = G.peerToPlayer[senderId];
            if (playerIdx !== undefined && G.gameEngine) {
                G.gameEngine.players[playerIdx].name = data.payload.playerName;
                addChatMessage('system', data.payload.playerName + ' 准备就绪！');
                broadcastSyncState();
            }
            break;
        }
        case 'PLAY_CARD': {
            if (!G.gameEngine) break;
            const payload = data.payload;
            const attackerIdx = G.peerToPlayer[senderId];
            const attacker = G.gameEngine.players[attackerIdx];
            const target = G.gameEngine.players[payload.targetPlayerId];

            if (!attacker || !target) {
                console.error('无效的攻击者或目标');
                break;
            }

            // 验证回合
            if (G.gameEngine.currentPlayerIndex !== attackerIdx) {
                console.warn('不是你的回合');
                break;
            }

            try {
                // 从手牌中取出打出的牌
                const indices = payload.cardIndices.sort((a, b) => b - a); // 降序，方便 splice
                const cards = indices.map(i => attacker.hand[i]).filter(Boolean);

                if (cards.length !== indices.length) {
                    console.error('手牌索引无效');
                    break;
                }

                // 检查是否包含 Joker
                const hasJoker = cards.some(c => c.isJoker);
                if (hasJoker) {
                    // Joker 特殊处理
                    const targetCharIndex = target.activeCharIndex;
                    G.gameEngine.playJoker(attacker, target, targetCharIndex, cards);
                } else {
                    G.gameEngine.playAttack(attacker, target, cards, payload.aValue || 0);
                }

                // 推进回合
                if (!G.gameEngine.isGameOver) {
                    G.gameEngine.nextTurn();
                }

                addChatMessage('system',
                    attacker.name + ' 攻击了 ' + target.name + '！');

                broadcastSyncState();

                // 检查游戏结束
                if (G.gameEngine.isGameOver) {
                    broadcastGameOver();
                }
            } catch (err) {
                console.error('出牌错误:', err);
                // 通知出牌者错误
                const conn = G.p2p.connections[senderId];
                if (conn && conn.open) {
                    conn.send({
                        type: 'ERROR',
                        payload: { message: err.message }
                    });
                }
            }
            break;
        }
        case 'CHAT': {
            // 房主中转聊天消息
            addChatMessage('user', data.payload.senderName + ': ' + data.payload.text);
            G.p2p.sendMessage(data); // 广播给所有人
            break;
        }
    }
}

// ============================================================
// 客户端消息处理
// ============================================================
function handleClientMessage(data, senderId) {
    switch (data.type) {
        case 'PLAYER_ASSIGNED': {
            G.myPlayerId = data.payload.playerId;
            console.log('我被分配为 player', G.myPlayerId);
            break;
        }
        case 'SYNC_STATE': {
            G.currentState = data.payload;
            renderState(data.payload);
            break;
        }
        case 'CHAT': {
            addChatMessage('user', data.payload.senderName + ': ' + data.payload.text);
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
// 房主：广播状态
// ============================================================
function broadcastSyncState() {
    if (!G.gameEngine) return;

    Object.entries(G.playerToPeer).forEach(([playerIdxStr, peerId]) => {
        const playerIdx = parseInt(playerIdxStr);
        const conn = G.p2p.connections[peerId];
        if (!conn || !conn.open) return;

        const state = serializeState(G.gameEngine, playerIdx);
        conn.send({ type: 'SYNC_STATE', payload: state });
    });

    // 房主自己也渲染
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
    };

    // 广播给所有客户端
    Object.values(G.p2p.connections).forEach(conn => {
        if (conn.open) conn.send({ type: 'GAME_OVER', payload });
    });

    // 房主自己显示结算
    showResultPage(payload);
}

// ============================================================
// 状态序列化
// ============================================================
function serializeState(engine, forPlayerId) {
    const player = engine.players[forPlayerId];
    return {
        players: engine.players.map((p, i) => ({
            id: p.id,
            name: p.name || ('玩家' + (p.id + 1)),
            characters: p.characters.map(c => ({
                rank: c.rank,
                suit: c.suit,
                maxHp: c.maxHp,
                hp: c.hp,
                shield: c.shield,
                isDead: c.isDead,
            })),
            activeCharIndex: p.activeCharIndex,
            handCount: p.hand.length,
            isEliminated: p.isEliminated,
            hand: (i === forPlayerId) ? p.hand.map(c => ({
                suit: c.suit,
                rank: c.rank,
                isJoker: c.isJoker,
                value: c.value,
            })) : null,
        })),
        currentPlayerIndex: engine.currentPlayerIndex,
        deckCount: engine.deck.length,
        isGameOver: engine.isGameOver,
        winner: engine.winner ? {
            id: engine.winner.id,
            name: engine.winner.name || ('玩家' + (engine.winner.id + 1)),
        } : null,
        myPlayerId: forPlayerId,
    };
}

// ============================================================
// UI 渲染
// ============================================================
function renderState(state) {
    G.currentState = state;
    const me = state.players[state.myPlayerId];
    const isSpectating = me && me.isEliminated;

    // 观战模式切换
    const gamePage = document.getElementById('page-game');
    if (isSpectating) {
        gamePage.classList.add('spectator-mode');
    } else {
        gamePage.classList.remove('spectator-mode');
    }

    // 渲染玩家数
    updatePlayerCount();

    // 渲染对手
    renderOpponents(state);

    // 渲染自己
    renderSelf(state);

    // 渲染手牌
    if (!isSpectating && me && me.hand) {
        renderHand(me.hand, state);
    } else {
        document.getElementById('hand-container').innerHTML = '';
    }

    // 更新回合指示器 & 攻击按钮
    updateTurnUI(state);

    // 重置选中状态
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
        if (i === state.myPlayerId) return; // 跳过自己

        const card = createPlayerCard(p, i, false, isMyTurn && !isSpectating);
        container.appendChild(card);
    });
}

function renderSelf(state) {
    const container = document.getElementById('self-container');
    container.innerHTML = '';

    const me = state.players[state.myPlayerId];
    if (!me) return;

    const card = createPlayerCard(me, state.myPlayerId, true, false);
    container.appendChild(card);
}

function createPlayerCard(p, idx, isSelf, isTargetable) {
    const div = document.createElement('div');
    div.className = 'player-card';
    if (isTargetable) div.classList.add('targetable');
    div.dataset.playerId = idx;

    const char = p.characters[p.activeCharIndex];
    const isDead = char.isDead;

    // 寻找存活角色显示
    const aliveChar = p.characters.find(c => !c.isDead);
    const displayChar = isDead && aliveChar ? aliveChar : char;

    const isRed = displayChar.suit === '♦' || displayChar.suit === '♥';
    const suitClass = isRed ? 'suit-red' : 'suit-black';

    // 头像
    const avatars = ['🐱', '🐶', '🐰', '🐻'];
    const avatar = p.isEliminated ? '😭' : avatars[idx % avatars.length];
    const avatarClass = p.isEliminated ? 'crying-anim' : '';

    // 名字
    const nameHtml = isSelf
        ? `<div class="name">${p.name} (你)</div>`
        : `<div class="name">${p.name}${p.isEliminated ? ' 💀' : ''}</div>`;

    // HP 百分比
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

    // 当前回合指示器
    if (idx === G.currentState?.currentPlayerIndex && !p.isEliminated) {
        const indicator = document.createElement('div');
        indicator.className = 'current-turn-indicator';
        indicator.textContent = '⚡';
        div.appendChild(indicator);
    }

    // 点击选择目标
    if (isTargetable) {
        div.addEventListener('click', () => selectTarget(idx, div));
    }

    return div;
}

function renderHand(cards, state) {
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

    const attackBtn = document.getElementById('attack-btn');
    const actionArea = document.getElementById('action-area');

    if (isSpectating) {
        actionArea.style.display = 'none';
    } else if (isMyTurn) {
        actionArea.style.display = 'flex';
        attackBtn.textContent = '⚔️ 选择一个玩家，攻击';
        attackBtn.disabled = false;
        startTimer();
    } else {
        actionArea.style.display = 'flex';
        const currentPlayer = state.players[state.currentPlayerIndex];
        attackBtn.textContent = `⏳ 等待 ${currentPlayer?.name || '...'} 出牌...`;
        attackBtn.disabled = true;
        clearTimer();
    }
}

// ============================================================
// 卡牌选择
// ============================================================
function toggleCard(index, el) {
    const idx = G.selectedCardIndices.indexOf(index);
    if (idx >= 0) {
        G.selectedCardIndices.splice(idx, 1);
        el.classList.remove('selected');
    } else {
        G.selectedCardIndices.push(index);
        el.classList.add('selected');
    }
}

function selectTarget(playerId, el) {
    // 清除之前的选中
    document.querySelectorAll('.player-card.targeted').forEach(c => c.classList.remove('targeted'));
    G.selectedTargetId = playerId;
    el.classList.add('targeted');
}

// ============================================================
// 执行攻击
// ============================================================
function executeAttack() {
    if (G.selectedCardIndices.length === 0) {
        alert('请先选择要打出的牌哦！🐾');
        return;
    }
    if (G.selectedTargetId < 0) {
        alert('请先选择一个攻击目标哦！🐾');
        return;
    }

    // 飞行动画
    const animLayer = document.getElementById('anim-layer');
    const selectedEls = G.selectedCardIndices.map(i =>
        document.querySelector(`.poker-card[data-index="${i}"]`)
    ).filter(Boolean);

    selectedEls.forEach((card, idx) => {
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

    // 计算 A 值
    let aValue = 0;
    const state = G.currentState;
    if (state) {
        const myHand = state.players[state.myPlayerId]?.hand;
        if (myHand) {
            const selectedCards = G.selectedCardIndices.map(i => myHand[i]).filter(Boolean);
            const hasA = selectedCards.some(c => c && c.rank === 'A');
            if (hasA) {
                const input = prompt('你打出了 A 牌！请输入转化数值 (1-13)：', '5');
                aValue = parseInt(input) || 5;
                if (aValue < 1) aValue = 1;
                if (aValue > 13) aValue = 13;
            }
        }
    }

    if (G.isHost) {
        // 房主直接处理
        handleHostPlayCard(G.selectedCardIndices, G.selectedTargetId, aValue);
    } else {
        // 客户端发送给房主
        G.p2p.sendMessage({
            type: 'PLAY_CARD',
            payload: {
                targetPlayerId: G.selectedTargetId,
                cardIndices: [...G.selectedCardIndices],
                aValue: aValue,
            }
        });
    }

    // 重置选中
    G.selectedCardIndices = [];
    G.selectedTargetId = -1;
    document.querySelectorAll('.poker-card.selected').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.player-card.targeted').forEach(c => c.classList.remove('targeted'));
    clearTimer();
}

// 房主本地处理出牌
function handleHostPlayCard(cardIndices, targetPlayerId, aValue) {
    if (!G.gameEngine) return;

    const attacker = G.gameEngine.players[G.myPlayerId];
    const target = G.gameEngine.players[targetPlayerId];

    if (G.gameEngine.currentPlayerIndex !== G.myPlayerId) {
        console.warn('不是你的回合');
        return;
    }

    try {
        const sorted = [...cardIndices].sort((a, b) => b - a);
        const cards = sorted.map(i => attacker.hand[i]).filter(Boolean);

        if (cards.length !== cardIndices.length) {
            console.error('手牌索引无效');
            return;
        }

        const hasJoker = cards.some(c => c.isJoker);
        if (hasJoker) {
            G.gameEngine.playJoker(attacker, target, target.activeCharIndex, cards);
        } else {
            G.gameEngine.playAttack(attacker, target, cards, aValue);
        }

        if (!G.gameEngine.isGameOver) {
            G.gameEngine.nextTurn();
        }

        addChatMessage('system', attacker.name + ' 攻击了 ' + target.name + '！');
        broadcastSyncState();

        if (G.gameEngine.isGameOver) {
            broadcastGameOver();
        }
    } catch (err) {
        console.error('出牌错误:', err);
        alert('出牌失败: ' + err.message);
    }
}

// ============================================================
// 倒计时
// ============================================================
function startTimer() {
    clearTimer();
    const timerBar = document.querySelector('.timer-bar-bg');
    if (timerBar) {
        timerBar.classList.remove('timer-active');
        void timerBar.offsetWidth;
        timerBar.classList.add('timer-active');
    }
    G.timerTimeout = setTimeout(() => {
        forceRandomPlay();
    }, 30000);
}

function clearTimer() {
    if (G.timerTimeout) {
        clearTimeout(G.timerTimeout);
        G.timerTimeout = null;
    }
    const timerBar = document.querySelector('.timer-bar-bg');
    if (timerBar) {
        timerBar.classList.remove('timer-active');
    }
}

function forceRandomPlay() {
    const cards = document.querySelectorAll('#hand-container .poker-card');
    const targets = document.querySelectorAll('#opponents-container .player-card.targetable');

    if (cards.length > 0 && targets.length > 0) {
        // 随机选一张牌
        const randCard = cards[Math.floor(Math.random() * cards.length)];
        randCard.click();

        // 随机选一个目标
        const randTarget = targets[Math.floor(Math.random() * targets.length)];
        randTarget.click();

        setTimeout(executeAttack, 500);
    }
}

// ============================================================
// 聊天
// ============================================================
function sendChat() {
    const input = document.getElementById('chat-input-text');
    const text = input.value.trim();
    if (!text) return;

    G.p2p.sendMessage({
        type: 'CHAT',
        payload: { senderName: G.playerName, text }
    });

    addChatMessage('user', G.playerName + ': ' + text);
    input.value = '';
}

function addChatMessage(cls, text) {
    const msgBox = document.getElementById('chat-messages');
    if (!msgBox) return;
    const div = document.createElement('div');
    div.className = 'msg ' + cls;
    div.textContent = text;
    msgBox.appendChild(div);
    msgBox.scrollTop = msgBox.scrollHeight;
}

// ============================================================
// 结算页面
// ============================================================
function showResultPage(payload) {
    showPage('result');

    document.getElementById('stat-winner').textContent = payload.winner;
    document.getElementById('stat-damage').textContent = '回合制对战';
    document.getElementById('stat-survivors').textContent = payload.winnerId >= 0 ? '1 人存活' : '无人生还';

    addChatMessage('system', '🏆 游戏结束！胜者: ' + payload.winner);
}

// ============================================================
// 辅助函数
// ============================================================
function updatePlayerCount() {
    const el = document.getElementById('disp-player-count');
    if (!el) return;

    if (G.isHost && G.gameEngine) {
        const active = G.gameEngine.players.filter(p => true).length;
        el.textContent = '玩家: ' + active + '/4';
    } else if (G.currentState) {
        el.textContent = '玩家: ' + G.currentState.players.length + ' 人';
    } else {
        el.textContent = '等待玩家...';
    }
}

// ============================================================
// 事件绑定
// ============================================================
function initGamePage() {
    document.getElementById('attack-btn').addEventListener('click', executeAttack);
    document.getElementById('btn-send-chat').addEventListener('click', sendChat);

    // 回车发送聊天
    document.getElementById('chat-input-text').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendChat();
    });

    // 结算页面按钮
    document.getElementById('btn-restart').addEventListener('click', () => {
        showPage('home');
        location.reload();
    });
    document.getElementById('btn-leave-room').addEventListener('click', () => {
        showPage('home');
        location.reload();
    });
}

// ============================================================
// 启动
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initHomePage();
    initGamePage();
    console.log('🐾 可爱大乱斗 初始化完成！');
});
