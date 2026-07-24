/**
 * networkHandler.js — 客户端消息路由器
 * 监听服务器下发的消息，派发给 UI 层。
 * 服务器为权威源，此处不做任何 game logic。
 */
import { G } from './state.js';
import { addChat, addGameChat } from './ui/chatUI.js';
import { renderState } from './ui/gameUI.js';
import { Toast } from './ui/toast.js';

/**
 * 处理来自权威服务器的所有消息
 * @param {object} msg — 已解析的 JSON 消息
 */
export function handleServerMessage(msg) {
    switch (msg.type) {

        case 'GAME_START': {
            G.gameStarted = true;
            G.myPlayerId = msg.payload.enginePlayerId;
            showPage('game');
            addGameChat('system', '🎮 游戏开始！爪爪对决！🐾');
            break;
        }

        case 'SYNC_STATE': {
            const state = msg.payload;
            // ★ 防御：myPlayerId 类型安全
            state.myPlayerId = G.myPlayerId;
            G.currentState = state;
            // ★ 与 renderHand 中的动画延迟配合：setTimeout(50ms) 确保 DOM 布局稳定
            setTimeout(() => renderState(state), 50);
            break;
        }

        case 'BROADCAST': {
            // ★ 全屏出牌播报 — 动态 import 避免循环依赖
            const { attackerName, targetName, suit, rank, actionType } = msg.payload;
            import('./ui/gameUI.js').then(m => {
                m.playActionBroadcast(attackerName, targetName, suit, rank, actionType);
            });
            break;
        }

        case 'CHAT': {
            const { senderId, senderName, text } = msg.payload;
            if (G.gameStarted) {
                addGameChat(senderId, senderName, text);
            } else {
                addChat(senderId, senderName, text);
            }
            break;
        }

        case 'GAME_OVER': {
            showResultPage(msg.payload);
            break;
        }

        case 'ERROR': {
            Toast.show('操作失败: ' + msg.payload.message, 'error');
            break;
        }

        case 'PONG':
            // 心跳回包，忽略
            break;

        default:
            // 静默忽略未识别的消息类型
            break;
    }
}

// ─── 辅助 ───

function showPage(pageId) {
    document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));
    const el = document.getElementById('page-' + pageId);
    if (el) el.classList.add('active');
}

function showResultPage(payload) {
    showPage('result');
    document.getElementById('stat-winner').textContent = payload.winner;
    document.getElementById('stat-rounds').textContent = payload.rounds + ' 回合';
    document.getElementById('stat-survivors').textContent = payload.survivors + ' 人';
}
