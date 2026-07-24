/**
 * PokeWar — 主入口
 * 绑定 DOM 事件 + 引导全模块
 */

import { G } from './state.js';
import { P2PManager } from './network/P2PManager.js';
import { GameEngine } from './engine/GameEngine.js';
import { showPage, showModal, renderWaitingLobby } from './ui/lobbyUI.js';
import { addSystemChat, addGameChat, sendWaitingChat, sendGameChat } from './ui/chatUI.js';
import { setProcessPlayCard, executeAttack, renderState, injectBroadcastSyncState } from './ui/gameUI.js';
import { Toast } from './ui/toast.js';
import { audioManager } from './audioManager.js';
import {
    handleHostMessage, handleClientMessage,
    broadcastLobbyState, broadcastSyncState, broadcastGameOver,
    processPlayCard, showResultPage,
} from './networkHandler.js';

// 注入 processPlayCard 给 gameUI（避免循环依赖）
setProcessPlayCard(processPlayCard);

// ═══ 主页 ═══

function initHomePage() {
    const clickSound = () => audioManager.play('click');
    document.getElementById('btn-create-room').addEventListener('click', () => { clickSound(); createRoom(); });
    document.getElementById('btn-join-room').addEventListener('click', () => { clickSound(); joinRoom(); });
    document.getElementById('btn-show-tutorial').addEventListener('click', () => {
        clickSound();
        document.getElementById('modal-tutorial').classList.add('show');
    });
    initAvatarPicker();
}

function initAvatarPicker() {
    const preview = document.getElementById('avatar-preview');
    const pickerDialog = document.getElementById('emoji-picker-dialog');
    const picker = document.getElementById('emoji-picker');

    if (!preview || !picker) return;

    // 点击头像打开选择器
    preview.addEventListener('click', () => {
        pickerDialog.classList.add('show');
    });

    // 选择 emoji
    picker.addEventListener('emoji-click', (e) => {
        G.myAvatar = e.detail.unicode;
        preview.textContent = G.myAvatar;
        pickerDialog.classList.remove('show');
    });

    // 点击遮罩关闭
    pickerDialog.addEventListener('click', (e) => {
        if (e.target === pickerDialog) pickerDialog.classList.remove('show');
    });
}

function createRoom() {
    G.playerName = document.getElementById('player-name').value.trim() || '小猫猫';
    G.isHost = true;
    G.myPlayerId = 0;
    G.playerNames = { 0: G.playerName };
    G.playerReady = { 0: true };
    G.playerAvatars = { 0: G.myAvatar };

    showLoading();
    G.p2p = new P2PManager();
    G.p2p.callbacks.onReady = (roomCode) => {
        G.roomCode = roomCode;
        G.peerToPlayer[G.p2p.myId] = 0;
        G.playerToPeer[0] = G.p2p.myId;
        document.getElementById('display-room-code').textContent = roomCode;
        showPage('waiting');
        document.getElementById('game-mode-selector').style.display = 'block';
        renderWaitingLobby();
        addSystemChat('房间创建成功！快邀请小伙伴加入吧~ 🐾');
        hideLoading();
    };

    G.p2p.callbacks.onPlayerJoin = (peerId) => {
        // ★ 重连检测：如果该 peer 之前存在且游戏已开始，取消断线倒计时
        if (G.gameStarted && G.gameEngine && G.peerToPlayer[peerId] !== undefined) {
            const idx = G.peerToPlayer[peerId];
            G.gameEngine.cancelDisconnectTimer(idx);
            addGameChat('system', (G.playerNames[idx] || '玩家') + ' 重新连接！🎉');
            broadcastSyncState();
            return;
        }
        if (G.gameStarted) return;
        // ★ 如果 JOIN_REQ 已经提前分配了槽位，跳过
        if (G.peerToPlayer[peerId] !== undefined) return;
        const used = Object.values(G.peerToPlayer);
        let idx = 1;
        while (used.includes(idx)) idx++;
        if (idx >= G.maxPlayers) return;
        G.peerToPlayer[peerId] = idx;
        G.playerToPeer[idx] = peerId;
        G.playerNames[idx] = '玩家' + (idx + 1);
        G.playerAvatars[idx] = '🐱';
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
        delete G.playerAvatars[idx];
        delete G.playerReady[idx];
        if (G.gameStarted && G.gameEngine) {
            // ★ 使用 30 秒重连倒计时，而非立即淘汰
            G.gameEngine.startDisconnectTimer(idx);
            addGameChat('system', name + ' 断线了，30秒内重连可继续游戏 ⏳');
            G.gameEngine.checkWinCondition();
            broadcastSyncState();
            if (G.gameEngine.isGameOver) broadcastGameOver();
        } else {
            addSystemChat(name + ' 离开了房间 😿');
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
    if (code.length !== 4) { Toast.show('请输入4位邀请码！', 'error'); return; }
    G.isHost = false;
    G.roomCode = code;

    showLoading();
    G.p2p = new P2PManager();
    G.p2p.callbacks.onReady = () => {
        document.getElementById('display-room-code').textContent = code;
        showPage('waiting');
        G.p2p.sendMessage({ type: 'JOIN_REQ', payload: { playerName: G.playerName, avatar: G.myAvatar } });
        hideLoading();
    };

    G.p2p.callbacks.onMessage = handleClientMessage;
    G.p2p.callbacks.onHostDisconnect = () => showModal('房主已断开连接，房间已解散。');
    G.p2p.callbacks.onPeerError = (err) => {
        if (err.type === 'peer-unavailable') showModal('找不到该房间，请检查邀请码！');
    };

    G.p2p.joinRoom(code);
}

// ═══ 等待大厅 ═══

// ★ BUG4 修复：事件代理，避免按钮尚未渲染时绑定失败
document.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('#btn-copy-code');
    if (!copyBtn) return;
    const roomCodeEl = document.getElementById('display-room-code');
    const code = roomCodeEl ? roomCodeEl.textContent.trim() : '';
    if (!code || code === '----') { Toast.show('请先生成邀请码', 'error'); return; }

    const copyText = (str) => {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(str);
        }
        // 降级：非 HTTPS 环境（局域网测试）
        const ta = document.createElement('textarea');
        ta.value = str; ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); return Promise.resolve(); }
        finally { document.body.removeChild(ta); }
    };

    copyText(code).then(() => {
        Toast.show('🐾 邀请码 ' + code + ' 复制成功！', 'success');
    }).catch((err) => {
        console.error('复制失败:', err);
        Toast.show('复制失败，请手动复制', 'error');
    });
});

function initWaitingPage() {
    // ★ 复制按钮已改用全局事件代理，无需在此重新绑定

    document.getElementById('btn-start-game').addEventListener('click', () => {
        if (G.isHost) {
            const count = Object.keys(G.playerNames).length;
            if (count < 2) { Toast.show('至少需要2名玩家才能开始！', 'error'); return; }
            startGame();
        } else {
            toggleReady();
        }
    });

    document.getElementById('btn-leave-waiting').addEventListener('click', leaveRoom);
    document.getElementById('btn-waiting-chat-send').addEventListener('click', sendWaitingChat);
    document.getElementById('waiting-chat-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') sendWaitingChat();
    });
}

function toggleReady() {
    G.p2p.sendMessage({ type: 'TOGGLE_READY', payload: {} });
    G.playerReady[G.myPlayerId] = !G.playerReady[G.myPlayerId];
    renderWaitingLobby();
}

function startGame() {
    if (!G.isHost || !G.p2p) return;
    const indices = Object.keys(G.playerNames).map(Number).sort((a, b) => a - b);
    const count = indices.length;

    // ★ 读取游戏模式：quick=1命, classic=3命
    const modeRadio = document.querySelector('input[name="gameMode"]:checked');
    const maxLives = (modeRadio && modeRadio.value === 'quick') ? 1 : 3;

    G.gameEngine = new GameEngine(count, maxLives);
    G.roundCount = 0;
    G.gameStarted = true;

    G.engineToLobby = {};
    indices.forEach((lobbyIdx, engineIdx) => {
        G.engineToLobby[engineIdx] = lobbyIdx;
        G.gameEngine.players[engineIdx].name = G.playerNames[lobbyIdx];
    });

    G.myPlayerId = 0;
    showPage('game');

    // ★ 给所有客户端发送 GAME_START（含 enginePlayerId）
    Object.entries(G.playerToPeer).forEach(([lobbyIdxStr, peerId]) => {
        const lobbyIdx = parseInt(lobbyIdxStr);
        if (lobbyIdx === 0) return;
        const engineIdx = indices.indexOf(lobbyIdx);
        G.p2p.sendTo(peerId, {
            type: 'GAME_START',
            payload: { enginePlayerId: engineIdx, playerNames: G.gameEngine.players.map(p => p.name) }
        });
    });

    // ★ 同步广播初始状态（含客户端 SYNC_STATE + 房主本地渲染）
    broadcastSyncState();

    // ★ 兜底：确保房主本地状态必定渲染（即使 broadcastSyncState 因某些原因静默失败）
    if (!G.currentState) {
        console.warn('[startGame] broadcastSyncState 未设置 G.currentState，手动兜底');
        G.currentState = {
            players: G.gameEngine.players.map((p, i) => ({
                id: p.id, name: p.name || ('玩家' + (p.id + 1)),
                characters: p.characters.map(c => ({ rank: c.rank, suit: c.suit, maxHp: c.maxHp, hp: c.hp, shield: c.shield, isDead: c.isDead, isDying: c.isDying })),
                activeCharIndex: p.activeCharIndex, starterSelected: p.starterSelected,
                handCount: p.hand.length, isEliminated: p.isEliminated,
                hand: (i === 0) ? p.hand.map(c => ({ suit: c.suit, rank: c.rank, isJoker: c.isJoker, value: c.value })) : null,
            })),
            currentPlayerIndex: G.gameEngine.currentPlayerIndex, deckCount: G.gameEngine.deck.length,
            isGameOver: false, winner: null, myPlayerId: 0, roundCount: G.roundCount,
            playerAvatars: G.playerAvatars, lastAction: null,
            phase: G.gameEngine.phase, dyingInfo: null,
        };
        renderState(G.currentState);
    }
}

function leaveRoom() {
    if (G.p2p) G.p2p.disconnect();
    location.reload();
}

function showLoading() {
    document.getElementById('loading-overlay')?.classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading-overlay')?.classList.add('hidden');
}

// ═══ 游戏初始化 ═══

function initGamePage() {
    // ★ 按钮音效
    const clickSound = () => audioManager.play('click');
    document.getElementById('attack-btn').addEventListener('click', () => { clickSound(); executeAttack(); });
    const wanhuaBtn = document.getElementById('wanhua-btn');
    if (wanhuaBtn) wanhuaBtn.addEventListener('click', () => {
        clickSound();
        import('./ui/gameUI.js').then(m => m.openWanhuaModal());
    });
    document.getElementById('btn-game-chat-send').addEventListener('click', () => { clickSound(); sendGameChat(); });
    document.getElementById('game-chat-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') sendGameChat();
    });
    document.getElementById('btn-restart').addEventListener('click', () => { clickSound(); location.reload(); });
    document.getElementById('btn-leave-room').addEventListener('click', () => { clickSound(); leaveRoom(); });
    document.getElementById('btn-modal-ok').addEventListener('click', () => location.reload());
    // ★ 新手指引关闭
    const tutOk = document.getElementById('btn-tutorial-ok');
    if (tutOk) tutOk.addEventListener('click', () => { clickSound(); document.getElementById('modal-tutorial').classList.remove('show'); });
}

// ═══ 启动 ═══

document.addEventListener('DOMContentLoaded', () => {
    try { initHomePage(); } catch(e) { console.error('initHomePage:', e); }
    try { initWaitingPage(); } catch(e) { console.error('initWaitingPage:', e); }
    try { initGamePage(); } catch(e) { console.error('initGamePage:', e); }
    try { initFullscreenBtn(); } catch(e) { console.error('initFullscreenBtn:', e); }
    try { initChatDrawer(); } catch(e) { console.error('initChatDrawer:', e); }
    // Visible marker to confirm init ran
    const logo = document.getElementById('avatar-preview');
    if (logo) logo.title = 'PokeWar ready';
    console.log('🐾 PokeWar 初始化完成！');
});

// ═══ 全屏按钮 ═══

function initFullscreenBtn() {
    const btn = document.getElementById('btn-fullscreen');
    if (!btn) return;
    btn.addEventListener('click', () => {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            const el = document.documentElement;
            if (el.requestFullscreen) el.requestFullscreen();
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
            btn.textContent = '🔳';
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            btn.textContent = '🔲';
        }
    });
    document.addEventListener('fullscreenchange', () => {
        btn.textContent = document.fullscreenElement ? '🔳' : '🔲';
    });
    document.addEventListener('webkitfullscreenchange', () => {
        btn.textContent = document.webkitFullscreenElement ? '🔳' : '🔲';
    });
}

// ═══ 移动端聊天抽屉 ═══

function initChatDrawer() {
    const toggle = document.getElementById('mobile-chat-toggle');
    if (!toggle) return;
    toggle.addEventListener('click', () => {
        const chatBox = document.querySelector('.chat-box');
        const sidebar = document.querySelector('.chat-sidebar');
        const target = chatBox || sidebar;
        if (target) target.classList.toggle('show-mobile-chat');
    });
}
