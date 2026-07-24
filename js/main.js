/**
 * PokeWar — 主入口 (WebSocket 权威服务器架构)
 * 客户端退化为纯渲染视图。所有 game logic 在服务器执行。
 */
import { G } from './state.js';
import { WSClient } from './network/WSClient.js';
import { showPage, showModal, renderWaitingLobby } from './ui/lobbyUI.js';
import { addSystemChat, addGameChat, sendWaitingChat, sendGameChat } from './ui/chatUI.js';
import { executeAttack, renderState, playActionBroadcast } from './ui/gameUI.js';
import { Toast } from './ui/toast.js';
import { audioManager } from './audioManager.js';
import { handleServerMessage } from './networkHandler.js';

// ═══ 主页 ═══

function initHomePage() {
    // ★ 首次用户交互时解锁浏览器音频播放权限
    const unlockAudio = () => {
        const s = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
        s.volume = 0; s.play().then(() => s.remove()).catch(() => {});
        document.removeEventListener('click', unlockAudio);
        document.removeEventListener('keydown', unlockAudio);
    };
    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });

    const clickSound = () => audioManager.play('click');
    document.getElementById('btn-create-room').addEventListener('click', () => { clickSound(); createRoom(); });
    document.getElementById('btn-join-room').addEventListener('click', () => { clickSound(); joinRoom(); });
    document.getElementById('btn-show-tutorial').addEventListener('click', () => {
        clickSound();
        document.getElementById('modal-tutorial').classList.add('show');
    });
    document.getElementById('btn-toggle-theme').addEventListener('click', () => {
        clickSound();
        const cur = document.documentElement.getAttribute('data-theme');
        const next = cur === 'dark' ? '' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('pokeWarTheme', next);
    });
    // ★ 页面加载时恢复主题
    const savedTheme = localStorage.getItem('pokeWarTheme');
    if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
    initAvatarPicker();
}

function initAvatarPicker() {
    const preview = document.getElementById('avatar-preview');
    const pickerDialog = document.getElementById('emoji-picker-dialog');
    const picker = document.getElementById('emoji-picker');

    if (!preview || !picker) return;

    preview.addEventListener('click', () => { pickerDialog.classList.add('show'); });

    picker.addEventListener('emoji-click', (e) => {
        G.myAvatar = e.detail.unicode;
        preview.textContent = G.myAvatar;
        pickerDialog.classList.remove('show');
    });

    pickerDialog.addEventListener('click', (e) => {
        if (e.target === pickerDialog) pickerDialog.classList.remove('show');
    });
}

// ═══ 房间操作 ═══

function createRoom() {
    G.playerName = document.getElementById('player-name').value.trim() || '小猫猫';
    G.isHost = true;
    G.myPlayerId = 0;

    showLoading();
    G.ws = new WSClient('ws://64.90.30.38:8080');

    G.ws.callbacks.onOpen = () => {
        // 连接成功后发送创建房间请求
        G.ws.send({
            type: 'create_room',
            payload: { playerName: G.playerName, avatar: G.myAvatar }
        });
    };

    G.ws.callbacks.onMessage = (msg) => {
        if (msg.type === 'room_created') {
            G.roomCode = msg.payload.roomCode;
            G.myPlayerId = msg.payload.myPlayerId;
            document.getElementById('display-room-code').textContent = G.roomCode;
            showPage('waiting');
            document.getElementById('game-mode-selector').style.display = 'block';
            renderWaitingLobby();
            addSystemChat('房间创建成功！快邀请小伙伴加入吧~ 🐾');
            hideLoading();
        } else if (msg.type === 'ROOM_UPDATE') {
            // 同步房间玩家列表
            G.playerNames = {};
            G.playerReady = {};
            G.playerAvatars = {};
            const players = msg.payload.players || {};
            for (const [idStr, p] of Object.entries(players)) {
                const id = parseInt(idStr);
                G.playerNames[id] = p.name;
                G.playerReady[id] = p.ready;
                G.playerAvatars[id] = p.avatar;
            }
            renderWaitingLobby();
        } else {
            handleServerMessage(msg);
        }
    };

    G.ws.callbacks.onReconnectFailed = () => {
        showModal('📡 无法连接到服务器，请刷新页面重试');
    };

    G.ws.connect();
}

function joinRoom() {
    G.playerName = document.getElementById('player-name').value.trim() || '小猫猫';
    const code = document.getElementById('room-code').value.trim();
    if (code.length !== 4) { Toast.show('请输入4位邀请码！', 'error'); return; }
    G.isHost = false;
    G.roomCode = code;

    showLoading();
    G.ws = new WSClient('ws://64.90.30.38:8080');

    G.ws.callbacks.onOpen = () => {
        G.ws.send({
            type: 'join_room',
            payload: { roomCode: code, playerName: G.playerName, avatar: G.myAvatar }
        });
    };

    G.ws.callbacks.onMessage = (msg) => {
        if (msg.type === 'room_joined') {
            G.myPlayerId = msg.payload.myPlayerId;
            document.getElementById('display-room-code').textContent = code;
            showPage('waiting');
            hideLoading();
        } else if (msg.type === 'ROOM_UPDATE') {
            G.playerNames = {};
            G.playerReady = {};
            G.playerAvatars = {};
            const players = msg.payload.players || {};
            for (const [idStr, p] of Object.entries(players)) {
                const id = parseInt(idStr);
                G.playerNames[id] = p.name;
                G.playerReady[id] = p.ready;
                G.playerAvatars[id] = p.avatar;
            }
            renderWaitingLobby();
        } else if (msg.type === 'ERROR') {
            Toast.show(msg.payload.message, 'error');
            hideLoading();
        } else {
            handleServerMessage(msg);
        }
    };

    G.ws.callbacks.onReconnectFailed = () => {
        showModal('📡 无法连接到服务器，请刷新页面重试');
    };

    G.ws.connect();
}

// ═══ 等待大厅 ═══

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
    if (G.ws) G.ws.send({ type: 'toggle_ready', payload: {} });
}

function startGame() {
    if (!G.isHost || !G.ws) return;
    const modeRadio = document.querySelector('input[name="gameMode"]:checked');
    const maxLives = (modeRadio && modeRadio.value === 'quick') ? 1 : 3;

    G.ws.send({ type: 'start_game', payload: { maxLives } });
    // 服务器会广播 GAME_START 和 SYNC_STATE，不必本地初始化引擎
}

function leaveRoom() {
    if (G.ws) G.ws.disconnect();
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
    const clickSound = () => audioManager.play('click');
    document.getElementById('attack-btn').addEventListener('click', () => { clickSound(); executeAttack(); });
    const wanhuaBtn = document.getElementById('wanhua-btn');
    if (wanhuaBtn) wanhuaBtn.addEventListener('click', () => {
        clickSound();
        import('./ui/gameUI.js').then(m => m.openWanhuaModal());
    });
    // ★ 三国杀式浮动面板：确定出牌 + 取消
    const floatConfirm = document.getElementById('float-confirm-btn');
    if (floatConfirm) floatConfirm.addEventListener('click', () => { clickSound(); executeAttack(); });
    const floatCancel = document.getElementById('float-cancel-btn');
    if (floatCancel) floatCancel.addEventListener('click', () => {
        clickSound();
        // 清除所有选中状态
        document.querySelectorAll('#hand-container .poker-card.selected').forEach(el => el.classList.remove('selected'));
        G.selectedCardIndices = [];
        G.selectedTargetId = -1;
        G.declaredSuit = null;
        const panel = document.getElementById('float-action-panel');
        if (panel) panel.style.display = 'none';
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
    // ★ 游戏内 [?] 按钮打开玩法说明
    const gameTutBtn = document.getElementById('btn-game-tutorial');
    if (gameTutBtn) gameTutBtn.addEventListener('click', () => {
        clickSound();
        document.getElementById('modal-tutorial').classList.add('show');
    });
}

// ═══ 启动 ═══
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
} else {
    initAll();
}
function initAll() {
    try { initHomePage(); } catch(e) { console.error('initHomePage:', e); }
    try { initWaitingPage(); } catch(e) { console.error('initWaitingPage:', e); }
    try { initGamePage(); } catch(e) { console.error('initGamePage:', e); }
    try { initFullscreenBtn(); } catch(e) { console.error('initFullscreenBtn:', e); }
    try { initChatDrawer(); } catch(e) { console.error('initChatDrawer:', e); }
    const logo = document.getElementById('avatar-preview');
    if (logo) logo.title = 'PokeWar ready';
    console.log('🐾 PokeWar 初始化完成！');
}

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
