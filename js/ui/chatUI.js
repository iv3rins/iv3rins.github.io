/**
 * chatUI — 聊天渲染统一入口
 *
 * 规范：
 *   - Flex 布局：自己靠右(粉底)，他人靠左(白底边框)，系统消息居中
 *   - max-width: 80%，word-break: break-word
 *   - 自动平滑滚动
 */

import { G } from '../state.js';

/**
 * 渲染聊天气泡
 * @param {string} boxId - 容器 DOM id
 * @param {boolean} isSelf - 是否自己的消息
 * @param {string} senderName - 发送者名称
 * @param {string} text - 消息文本
 * @param {boolean} isSystem - 是否系统消息
 */
export function renderChatBubble(boxId, isSelf, senderName, text, isSystem = false) {
    const box = document.getElementById(boxId);
    if (!box) return;

    if (isSystem) {
        const div = document.createElement('div');
        div.className = 'msg system';
        div.textContent = text;
        box.appendChild(div);
    } else {
        const container = document.createElement('div');
        container.className = 'chat-bubble-container ' + (isSelf ? 'self' : 'other');
        if (!isSelf) {
            const nameEl = document.createElement('div');
            nameEl.className = 'chat-sender-name';
            nameEl.textContent = senderName;
            container.appendChild(nameEl);
        }
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble';
        bubble.textContent = text;
        container.appendChild(bubble);
        box.appendChild(container);
    }

    box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
}

/**
 * 统一聊天入口
 */
export function addChat(senderId, senderName, text) {
    const isSelf = senderId === G.p2p?.myId;
    const boxId = G.gameStarted ? 'game-chat-messages' : 'waiting-chat-messages';
    renderChatBubble(boxId, isSelf, senderName, text);
}

export function addSystemChat(text) {
    const boxId = G.gameStarted ? 'game-chat-messages' : 'waiting-chat-messages';
    renderChatBubble(boxId, false, '', text, true);
}

/** 兼容旧调用 */
export function addWaitingChat(cls, text) {
    if (cls === 'system') { addSystemChat(text); return; }
    addChat('unknown', '', text);
}

export function addGameChat(cls, text) {
    if (cls === 'system') { addSystemChat(text); return; }
    addChat('unknown', '', text);
}

/** 发送大厅聊天 */
/**
 * 发送聊天 — 统一流程：
 *   1. 所有人本地渲染一次（让自己立即看到）
 *   2. 发送到网络
 *   3. 房主 relay 时排除发送者（避免双份）
 */
export function sendWaitingChat() {
    const input = document.getElementById('waiting-chat-input');
    const text = input.value.trim();
    if (!text) return;
    const msg = { type: 'CHAT', payload: { senderId: G.p2p.myId, senderName: G.playerName, text } };
    addChat(G.p2p.myId, G.playerName, text);  // ★ 所有人本地渲染
    G.p2p.sendMessage(msg);
    input.value = '';
}

export function sendGameChat() {
    const input = document.getElementById('game-chat-input');
    const text = input.value.trim();
    if (!text) return;
    const msg = { type: 'CHAT', payload: { senderId: G.p2p.myId, senderName: G.playerName, text } };
    addChat(G.p2p.myId, G.playerName, text);  // ★ 所有人本地渲染
    G.p2p.sendMessage(msg);
    input.value = '';
}
